# Worker APIトークン・JWT認証と恒久UA対策の読取調査

- 実施日時: 2026-10-26 22:17–22:18 UTC
- 目的: 本番トークンの設定名/Oracleとの一致可否、401の条件、Python UA問題の最小対策を確認する。
- 作成: 本ログ。変更: TODO_ROADMAP.mdへの記録のみ。設定・アプリ・スクリプト・テスト・権限・データは変更していない。
- 操作: AGENTS.md、最新ロードマップ、前回ログ、_worker.js、mcp-server/index.mjs、wrangler.json、既存Python呼出元を読取。

## 設定名と比較の確認範囲
- 既存Workerソースが要求する設定名はMEMO_API_TOKEN。Oracle側auth.jsonのmemo_api_tokenに対応する。キー名の大小文字の違いは既存クライアントが明示的に対応付ける設計であり不具合ではない。
- Oracle側ファイルAPIトークン: 設定済み。Workerコードのtrim後最小16文字の条件を満たす（値や実文字数は出力しない）。現在のエージェント環境に上書き用MEMO_API_TOKENはなし。
- 本番WorkerのMEMO_API_TOKEN: 設定の有無・値の一致とも未確認。一致/不一致/未設定を確定できる情報がないため、401を根拠に不一致と断定しない。
- 一般的なCloudflare管理用環境変数は未設定。既知のWrangler認証ファイル候補3箇所も存在しない。利用可能なコネクターはこの既存Workerの管理に対応していない。
- Cloudflareの登録済みSecret値はWranglerやDashboardで読み戻せない。管理アクセスがあってもSecret名の存在確認と値の直接比較は別問題。wrangler.jsonにvarsがないことを本番Secret未設定の証拠にしない。
- 参照: https://developers.cloudflare.com/workers/configuration/secrets/ （Compare secrets and environment variables）。
- 本番デプロイ済みソースと現在ソースの一致は管理情報未取得で照合していない。

## 401の正確な条件
- requireApiAuthはまずverifyAutomationTokenを実行し、真なら即許可する。JWTの成立は不要。
- API認証が偽の場合だけverifyCloudflareAccessJwtへ進み、これが真でも許可する。
- つまり401はAPI認証とJWT認証の両方が偽の場合。二者択一のエラー分類ではなく、両方の経路が成立しない状態。
- API偽の条件: 本番MEMO_API_TOKENなし/型不正/trim後16文字未満、受信APIトークンなし、または期待値と比較不一致。送信側で値があっても経路で受信されない可能性を含む。
- JWT偽の条件: CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD未設定、JWTなし、不正形式、alg/kid不正、iss/aud不一致、exp期限切れ/nbf未到達、JWKS取得/鍵検索/署名検証失敗。例外もfalseへ変換する。
- Service Tokenの2つの値自体をWorkerがJWTとして扱うことはない。Access通過とWorker内のJWT検証成立は同義ではない。

## 実GETによる分離
- 全リクエストは診断用アプリ識別UA＋既存Service Tokenを用い、同じ既存APIエンドポイントへGETのみ。Cookieなし、redirect追従なし。
- APIトークンのBearer経路のみ: HTTP401、既存Workerの認証拒否JSONに一致。
- APIトークンの代替経路のみ: HTTP401、同上。
- APIトークンを送らないAccess経路のみ: HTTP401、同上。
- 結果は、現状APIトークンが受理されずJWT経路も救済になっていないことと整合。本番の未設定/不一致/ヘッダー未到達やJWT内のどの検査かまでは外から確定できない。
- 実auth.json内容とmtimeの前後比較は一致。値・ヘッダー・メモ本文は出力していない。

## 読取コードのメモリ内ダミー検証
- _worker.jsを文字列で読込み、requireApiAuthをメモリ内モジュールで呼び出す。ファイル編集やデプロイなし。
- ダミーのAPI期待値/送信値が一致: JWT設定なしでもALLOW。
- ダミー不一致: HTTP401。期待値未設定: HTTP401。
- ローカルの条件確認であり、本番Secretの一致証明とはしない。

## Python User-Agentの最小恒久対策案（未修正）
- oracle_access_setup.pyのhttp_probeには明示的UAがなくPython-urllib標準となる。ここへアプリ固有の識別UA（例 antigravity-memo-oracle/1.0）を追加するのが最小。
- Oracleのserver.pyはAgentsInOracle/2.9.35、proposer.pyはAntigravityMemoProposer/1.1を既に明示しているため、今回それらを一律変更する必要はない。
- ブラウザ偽装、認証Bypass、Browser Integrity Checkの全停止、Secret再生成は不要。UAに秘密値やユーザー識別子を混ぜない。GETのredirect拒否・HTTPS・非出力方針を維持する。
- 公式根拠: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/ は標準Python urllibの識別で1010が起き得ることと、アプリ識別UAの使用を説明する。
- ヘッダー内容を出さずUAの存在だけをダミーRequestテストで確認する案。認証失敗の固定診断コードも別の小修正候補。

## 必要最小限の次の確認と対処（今回は未実施）
1. 権限ある管理画面/APIで実際に対象ドメインを処理する本番デプロイのMEMO_API_TOKEN・CF_ACCESS_TEAM_DOMAIN・CF_ACCESS_AUDの設定有無を確認する。名前のみ確認して値は表示しない。
2. 未設定が判明すればその必要な設定だけを別途承認の下で対応。登録済みSecretは読み戻せず、値の一致を今回の読取だけで三択確定することはできない。
3. APIトークンが正しく認証されればJWT経路の追加修正をせず自動通信できる設計。ブラウザ利用向けJWTの健全性は別途必要だが、その失敗だけで今回のAPI401を説明しない。
- 本番変更・コード修正・設定再入力・POST・デプロイ・プッシュは実施していない。調査記録のみ保存。
