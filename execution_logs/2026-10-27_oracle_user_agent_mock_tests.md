# Oracle User-Agent修正のローカルモック検証

- 実施日時: 2026-10-27 03:54:30 UTC ～ 2026-10-27 03:54:57 UTC
- 目的・背景: 前回保存したUser-Agent修正の既存モックテストを実行。ユーザーが自作コードのローカル修正・テストには事前VT照合不要と明確化したため、今回VT再要求はしない。インストール時の既存VT安全確認ルールは変更しない。
- 対象ファイル: 本ログを新規作成、TODO_ROADMAP.mdへ着手・完了を追記。scripts/oracle_access_setup.pyとtests/oracle_access_setup.pyは既存変更を保持し、今回は編集しない。
- 操作・コマンド・差分: AGENTS.md、TODO_ROADMAP.md、前回UA修正ログ、既存実装・テストを読取。`python3 -B tests/oracle_access_setup.py VerifyTests -v`を実行。ログとロードマップのみ追記。
- 実行結果・テスト結果: 終了0、Ran 2 tests、OK（0.020秒）。HTTPエラーの6ステータス×Service Token有無の12ケース、verify結果8ケースを既存subTestで確認。
  - UAはantigravity-memo-oracle-verify/1.0。既存Authorization・X-Memo-Tokenを保持し、AccessヘッダーはService Tokenありの場合のみ付与。
  - 401・403を含むHTTPエラーのステータスを保持し、本文を読まずcloseを1回実行。
  - Service Tokenなし401/403・あり200かつ有効な配列JSONの組合せは成功。認証付き401/403は終了1・VERIFY_FAILEDとなりUNEXPECTED_ERRORにならない。
  - verifyの2回のプローブ順序、秘密値非表示、save_config未呼出しを確認。プローブまたはopenerはモック化され、本番Cloudflare通信なし。実auth.jsonの読取なし。
- 発生したエラーと対処: テスト失敗なし。修正不要、認証仕様変更なし。
- 未解決事項・考察: モックでの成功でありOracle通常SSHからの本番到達性・認証成功は未確認。今回全テストスイートは実行せず、依頼対象の既存VerifyTestsを実行。
- 次回アクション: ユーザーのOracle通常SSHターミナルでプロジェクト直下から `python3 -B scripts/oracle_access_setup.py verify` を実行。これは本番へService Tokenなし/ありのGETを各1回行う。成功条件はなし側が既定のリダイレクトまたは401/403、あり側HTTP200かつメモ配列JSON、終了0。今回はコマンド提示のみで実行しない。
- 制約遵守: 外部ダウンロード・インストール・更新、本番通信、デプロイ、認証仕様やVTルールの変更なし。
- 検証対象SHA-256（照合履歴ではなく内容識別用）:
  - scripts/oracle_access_setup.py: 50c3a44c41daa980ed1b6c7d2a6769666ed23fd3d5aefe9310565a2faba066bc
  - tests/oracle_access_setup.py: 88427d7518290db2eba4fad66226af588c0021ff068ff8c298a137a2b6a63695
