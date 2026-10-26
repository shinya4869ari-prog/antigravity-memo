# Oracle verify失敗の読み取り専用調査

- 実施日時: 2026-10-26 21:46 UTC
- 目的: oracle_access_setup.py verifyの共通エラーの原因を特定。ユーザー指定により設定変更・再入力・デプロイは禁止。
- 参照: AGENTS.md、最新ロードマップ、前回ログ、scripts/oracle_access_setup.py、_worker.js。git statusは開始時変更なし。
- 作成ファイル: 本ログ。変更ファイル: TODO_ROADMAP.mdの調査記録のみ。アプリ・認証設定・権限・データの変更なし。

## 読取操作・結果
- PythonをPYTHONDONTWRITEBYTECODE=1で実行し、スクリプトをモジュールとして読込。configure/save_config/verify本体は呼ばず、read_configと同一の前提条件を個別確認。
- ~/.config/antigravity-memo: 0700、現ユーザー所有、symlinkなし。
- ~/.config/antigravity-memo/auth.json: 0600、現ユーザー所有、symlinkなし。
- read_config: 成功。JSON重複キー・型・指定URL一致・既存専用APIトークンの存在チェックすべて通過。
- cf_access_client_id: 空。cf_access_client_secret: 空。値自体は出力・保存していない。
- 失敗箇所: verify内の `if not all(config[k] for k in FIELDS)`。ここでValueErrorとなり、外側の例外処理がユーザー提示の共通エラーへ変換する。
- 結論: 今回のverifyはHTTPへ到達する前に失敗する。現在のこのユーザー・保存先でService Tokenの二項目が未設定であることが直接原因。なぜ未設定なのか（configure未実行、途中失敗、別ユーザー/端末へ保存など）は現時点で不明。

## GETのみの追加HTTP調査
- 接続先: https://anti-memo.seronworks.dev/api/memos 。リダイレクト追従・Cookie・環境プロキシ・キャッシュフォールバックなし。
- 完全無認証GET: HTTP403、Content-TypeはJSON、Accessログイン先へのredirectなし。
- 既存専用APIトークンのみのGET（Service Tokenなし）: HTTP403、Content-TypeはJSON、Accessログイン先へのredirectなし。
- Service Token付きGET: ID/Secretが空のため未実行（偽の値で代用していない）。
- 403はアクセス拒否を示すが、現時点の応答情報だけではCloudflare Access/WAF等の手前の拒否とAPI側の403を確定できない。今回のverifyエラーをHTTP403が直接引き起こしたわけではない。
- レスポンス本文・メモ・画像・認証ヘッダー値・Locationの実値は出力/保存していない。POST等の書込リクエストなし。

## テスト・エラー・未解決
- 読取検査と実GETのみ。コード変更がないためアプリテスト再実行なし。
- 失敗した項目はService Token必須2項目の存在。HTTP200・メモ配列JSON・Service Tokenなしとの比較という後段の検証項目は未到達。
- Cloudflare側でTokenが有効か、既存APIトークンが本番と一致するかは未確認。今の結果でToken不正やAPI障害と断定しない。
- MCP保存失敗の成功扱い問題は今回も未修正。

## 必要な対処の提案（未実行）
1. 権限変更やデプロイは不要。本人が入力したと認識している場合は先に実行ユーザー・端末・保存先が一致するかを確認する。
2. このOracleユーザーのこのauth.jsonへまだ設定していない場合は、本人端末で既存configureを使いID/Secretを非表示入力。保存・再読込成功の表示を確認する。
3. その後verifyで本物のService Token付きHTTP応答を取得。403継続ならその段階でAccessポリシー・Token状態・API認証を切り分ける。
- 今回は提案まで。設定/再入力/デプロイ/プッシュは実施していない。
