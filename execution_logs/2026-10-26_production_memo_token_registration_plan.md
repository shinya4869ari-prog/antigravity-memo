# Production MEMO_API_TOKENの安全登録案（未実行）

- 実施日時: 2026-10-26 23:29 UTC
- 目的・背景: 本人がCloudflare Runtime variables and secrets > ProductionにMEMO_API_TOKENがないと確認。必要条件、既存Oracle値の登録、Access/同期への影響、非露出手順を提案する。
- 作成: 本ログ。変更: TODO_ROADMAP.md記録のみ。アプリ・設定・権限・データの変更なし。
- 調査操作: AGENTS.md、ロードマップ、関連ログ、_worker.js、wrangler.json、.assetsignoreを読取。既存auth.jsonは値を表示せずAPIトークン存在とWorkerの最小長条件のみ確認。0700/0600維持。

## 確認結果
- verifyAutomationTokenはenv.MEMO_API_TOKENを参照し、非空かつtrim後16文字以上が必要。受信値との比較に一致すればJWTを要求せず許可。
- MEMO_API_TOKENが未設定でも、Access JWT検証が通ればブラウザ等は許可される。したがって全機能の絶対必須ではないが、専用トークン経路のOracle自動通信には必要。
- ユーザー報告のProductionに項目がないことは、前回の401と整合。管理APIでの独立した設定取得ではないため、報告された本番画面を根拠として扱う。
- 登録するのはOracle ~/.config/antigravity-memo/auth.json のmemo_api_tokenの既存値。cf_access_client_secretとは別物。新規トークン生成/Oracle側の変更は不要。
- 現状のUA診断後401を解消できる可能性が高いが、本番対象と既存コードの一致・登録反映後の実HTTP確認までは成功としない。

## 既存Accessと同期への影響
- Accessは手前、Workerトークンはその後の独立した認証。既存Google Allowとoracle-ai Service Authを変更/Bypassしない。APIトークン登録はAccessを自動で迂回させない。
- Workerの認証はAPIトークン又はAccess JWT。ブラウザへAPIトークンを配布しない。TEAM_DOMAIN/AUD、既存Service Token、他Secretsを上書きしない。
- KVバインディング/データ/ローカル保存/同期周期/本文画像のコードには変更不要。認証拒否していたOracle通信の復旧が狙い。
- 本番反映に新デプロイやWorkerバージョン更新を伴い得る。処理ロジックを変えない場合でも本番反映操作は別途承認対象とする。

## 安全な登録手順案（実施していない）
1. anti-memo.seronworks.devを実際に処理するリソース、Cloudflareアカウント、プロジェクト/Worker名、Productionを照合する。Runtime variablesという表記だけでPages/通常Workerを決め打ちしない。Previewへ広げない。
2. 権限あるCloudflare管理セッションを使用する。既存のService Tokenを管理API認証の代用にしない。管理用認証情報もチャットへ要求しない。
3. Oracleで専用処理を使いauth.jsonを読取、親0700/ファイル0600・所有者・形式を検査。既存APIトークンをメモリへ取得。入力値やauth.json全体のcat/print、echo、シェル変数展開、標準出力へのパイプは禁止。
4. 対象が通常WorkerならMEMO_API_TOKENの単一Secret登録コマンドを対象名指定で使い、値はPython subprocessのinput（子プロセスstdin用の非表示パイプ）から渡す案。秘密値を引数・環境変数・コマンド履歴・ファイルへ置かない。子プロセスstdout/stderrも生のまま画面/ログへ流さず、固定の成否だけを出す。CLIデバッグログ/シェルトレースは使わない。
5. PagesならProductionだけのSecretとして登録し、対応するPages手順で反映する。Pages/通常Workerでコマンドと反映方法が違うので、対象確定後に実行コマンドを最終提示する。CLIの環境指定がProduction以外へ波及しないことも確認する。安全な非表示入力経路を確立できない場合は止め、平文表示で代替しない。
6. 新しいSecret名はMEMO_API_TOKEN、型はSecret/暗号化。既存設定・他Secret・KVバインドは保持。wrangler.jsonのvars、.env、リポジトリのファイル、ブラウザlocalStorageへ値を書かない。
7. 必要な反映操作は既存の本番コードを維持して行う。ローカル作業ツリーを丸ごと再デプロイする操作は含めない。登録成功だけで稼働成功とはしない。
8. 反映後、識別可能なアプリUAのGETで、Service TokenなしのAccess拒否と、Service Token＋既存APIトークンのHTTP200/メモ配列JSONを確認。出力はHTTPコードと判定のみ。メモや画像・Cookie・ヘッダー・Secretは表示しない。POSTやKV書込による検証は別途指示がない限り行わない。

## 本番反映についての公式確認
- Workersのwrangler secret putは新バージョンを作成し即時デプロイする。手順説明時に登録だけで無影響とは言わない。versions secret putはバージョン作成と反映を分離できるが、運用方式を勝手に変更しない。
- PagesはSecretを使用するデプロイより先に登録する必要がある。設定追加だけで既存デプロイへ反映したと扱わない。
- 参照:
  - https://developers.cloudflare.com/workers/configuration/secrets/
  - https://developers.cloudflare.com/pages/functions/bindings/#secrets
  - https://developers.cloudflare.com/workers/wrangler/commands/pages/
- Secretの登録/反映は設定書込であり、今回の調査指示では実行しない。ユーザーの承認を待つ。

## 結果・未解決・次回
- 読取調査のみ。コード変更なしのためテスト実行なし。Secret表示・登録・設定変更・デプロイ・本番HTTP・POST・プッシュなし。
- 未解決: 管理側へのアクセス手段と対象リソース種別/本番反映方式。表示されないSecretを別名環境に追加する等の誤登録を避ける。
- 次回: ユーザー承認後にまず対象/Productionを確認し、対象に応じた非表示登録コマンドと本番反映範囲を最終確認。既存Oracle値のみ使用する。
