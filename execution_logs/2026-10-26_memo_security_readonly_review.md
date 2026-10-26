
## 読み取り専用調査 2026-10-26 11:01 UTC
1. 目的: 指示された優先順位に沿い、認証設定とコードの残作業を確認。
2. 完了済みの扱い: Accessアプリantigravity-memo、anti-memo.seronworks.dev、本人Google Allow、oracle-ai Service Auth、本人実機表示成功はユーザー確認済み。再確認せず。
3. 開始時: TODO_ROADMAP.md、引き継ぎログ、git statusを確認。既存差分を保持。
4. 調査操作: 両リポジトリのgit status、対象コード・wrangler.json読取、設定値の存在判定のみ、node --check mcp-server/index.mjs、旧workers.devへの無認証GET。秘密値・レスポンス本文は出力・保存せず。
5. 結果: auth.jsonは親0700/ファイル0600。memo_api_tokenあり、cf_access_client_id/cf_access_client_secretは空。現在環境にも両者なし。Cloudflare管理API用トークンは現在環境に見つからず、利用可能なCloudflare管理コネクターもなし。作成済みService Tokenの有効期限・状態は取得できていない。他の保存先や既存プロセス環境を網羅した確認ではない。
6. コード: MCP、server.py、proposerの3箇所は設定ファイル/環境変数からService Tokenを読み両値が揃うと認証ヘッダー送信。接続先はanti-memo。MCP構文検査成功。server.pyはキャッシュ優先、MCP/proposerも通信失敗時キャッシュへ戻るため、キャッシュ表示だけで認証成功と判断しない。MCP saveMemosはリモート失敗でも最後にtrueを返すため、書込検証はHTTP結果を直接評価する必要あり。
7. Worker: ローカルwrangler.jsonはworkers_dev:false。preview_urlsの明示設定とカスタムドメインroutesはなし。Workerはworkers.devを403、3 APIにFail-Closedトークン/JWTガードあり。本番リビジョン・設定との一致は未確認。
8. HTTP: 旧antigravity-memo.shinya4869ari.workers.devの/api/memos、/api/shared-pad、/api/appsは無認証GETが各403。Server:cloudflareとCF-Rayあり。設定でworkers.devが無効か、他の拒否理由かは断定しない。POSTは既存データ保全と読み取り専用指示のため実行せず。
9. 未実施: 認証付きOracle/MCP実通信（Service Token不足）、無認証POST、ブラウザ保存・画像共有・高速同期の実機検証。本人Google表示成功は完了済みのまま。
10. エラー: .githubとpackage.jsonは対象メモリポジトリに存在せずrgがエラー。wrangler.jsonと実ファイルを直接確認した。
11. 変更: アプリ・認証設定・Cloudflare設定・KVは変更なし。記録として本ログとTODO_ROADMAP.mdのみ追記。
12. 次回: 作成済みService Tokenの状態を正規の管理画面または管理APIで確認し、安全な入力でOracleへ保存。秘密値をチャットに要求しない。続いてリダイレクトせずHTTP成功/JSONを直接検証。Worker本番反映の必要性を照合し、変更・シークレット登録・デプロイ直前に承認を求める。preview URLを含む公開経路も確認する。
