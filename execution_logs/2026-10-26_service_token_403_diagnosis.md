# Service Tokenあり/なし403とUNEXPECTED_ERRORの読取調査

- 実施日時: 2026-10-26 22:12–22:15 UTC
- 目的: 本人の保存成功後にverifyが双方403となる原因を、設定/ヘッダー/応答特徴/既存Workerコードから特定。
- 作成: 本ログ。変更: TODO_ROADMAP.md記録のみ。設定・スクリプト・Worker・権限・データは変更なし。
- 操作: AGENTS.md、最新ロードマップ、関連ログ、oracle_access_setup.py、_worker.js、wrangler.json、環境の管理用認証の有無、利用可能コネクターの対応範囲を読取確認。HTTPはGETのみ、redirect/Cookie/proxy/cache fallbackなし。

## 確認した設定・ヘッダー
- auth.json読取/JSON形式/対象URL一致: 成功。0700/0600維持。両Access値は非空、可視ASCIIで空白/制御文字なし。
- urllib Request内の標準Service Tokenヘッダー2項目は存在し、保存値とメモリ内で完全一致。秘密値やヘッダーそのものは出力しない。
- Cookie送信なし。専用APIトークンのBearerとX-Memo-Tokenも従来どおり構築。実auth.jsonの内容ハッシュ・mtimeを調査前後比較し不変。

## HTTP結果
接続先: https://anti-memo.seronworks.dev/api/memos

| リクエスト | HTTP | 安全な分類 |
|---|---|---|
| 標準Python urllib UA / 専用APIトークンのみ | 403 | JSON、Cloudflare応答、local Workerの拒否形式と一致しない |
| 標準Python urllib UA / 専用API＋Service Token | 403 | 同上 |
| 標準Python urllib UA / Service Tokenのみ | 403 | 同上 |
| 診断用アプリ識別UA / 専用APIトークンのみ | 302 | Accessログイン先へのredirect（追従せず） |
| 診断用アプリ識別UA / 専用API＋Service Token | 401 | JSON、既存WorkerのUnauthorized応答と完全一致 |

- 標準UAでの追加GETを安全な固定フィールドだけで分類: cloudflare_error=true、error_code=1010、error_name=browser_signature_banned、error_category=access_denied。生JSON本文・任意のエラー文・Ray ID・Cookie・応答ヘッダー値は出力/保存しない。
- 公式資料 https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/ は、Python urllib標準UAがBrowser Integrity Checkで拒否され得ることと、アプリを識別するUAの利用を説明している。
- そのため設定ファイルを変えず一回限りの診断GETにUser-Agent: antigravity-memo-oracle-diagnostics/1.0を付けて比較。ブラウザ偽装ではなくアプリ名の識別。1010は消失。
- 403の直接原因はCloudflareのブラウザ識別ブロック。Service Tokenのヘッダー組立不良でもlocal Worker APIの403でもない。
- UA診断後の401はlocal Workerの認証拒否形式と一致。local Workerは専用APIトークン未設定/短すぎる/不一致、またはAccess JWT検証不成立で401を返す。403はworkers.dev直アクセス専用であり、今回のカスタムドメインには該当しない。
- Service Tokenなし302、あり401という差から、Service TokenはAccessを通過しWorker側で拒否されたと強く示される。ただし管理APIで本番コードやルールを直接照合したわけではない。

## oracle-ai / Service Authの確認範囲
- 移管された既存記録で、Accessアプリantigravity-memo（anti-memo.seronworks.dev）、oracle-ai Service Auth、本人Google Allowの設定済みをユーザー確認済みとして把握。
- 現在利用可能なコネクターに任意のCloudflare Access管理機能なし。一般的なCloudflare管理用トークン環境変数もなし。Service TokenはAccess通信用であり管理API権限の代用にはしない。
- 公式資料 https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ の標準2ヘッダー方式と実装は一致。
- 現在のダッシュボード上でoracle-aiがどのアプリ/Includeへ紐付くか、有効期限/無効化状態、認証ログの該当行、Worker本番のMEMO_API_TOKEN/Access AUD設定は直接取得できていない。
- 一回限りのUA診断でService Tokenあり/なしが別応答となったことは確認済み。設定済みTokenの名前がoracle-aiであること自体は管理メタデータ未取得なので断定しない。

## UNEXPECTED_ERRORの特定
- scripts/oracle_access_setup.pyのverify、行213–214: 認証付きHTTPが200でないかメモJSON配列の確認がfalseの場合、通常のValueErrorを送出。
- main行228–231はSetupError以外をUNEXPECTED_ERRORへマップする。そのため予期した認証検証失敗でもUNEXPECTED_ERRORになる。
- ダミー設定とhttp_probeモック(403,false)x2でmain(['verify'])を実行し、終了1とUNEXPECTED_ERRORへの変換を再現。ネットワーク/設定読取/保存なし。
- 今回は保存失敗や新たな不明な例外ではなく「認証付きHTTP200＋メモ配列JSON」の成功条件を満たさないことが発火点。

## 未確認事項・必要な対処案（未実施）
1. verify等のPythonクライアントに識別可能なアプリUAを明示する修正を提案。認証ポリシーのBypass、セキュリティ全停止、Secret再発行は今の結果から不要。
2. UAを適切にした後に残るWorker401は別課題。本番Workerで専用APIトークンが設定されOracle保存値と一致するか、Access JWTのTEAM_DOMAIN/AUD設定・検証が成立するかを権限ある管理画面で値を露出せず照合する。本番のどれが不正かは未確定。
3. verifyで既知の検証不成立を専用の固定診断コードへ分類する修正を提案。現在はコードを変更しない。
- 設定変更・Secret再入力・POST・デプロイ・プッシュ・サービス再起動は実施していない。アプリテストはコード変更がないため再実行しない。
- 次回は読み取り可能なCloudflare管理情報によるWorker設定/Access認証ログの照合、又はユーザー指示後のUA/診断コード改善。
