# Oracle verifyのアプリ識別User-Agent修正

- 実施日時: 2026-10-27 03:37:19–03:37:45 UTC
- 目的・背景: 通常SSHではDNS成功とのユーザー報告、過去の標準Python UAによるCloudflare Error 1010の調査を受け、verifyのUAと既知の検証失敗報告を改善する。本番通信は禁止。
- 対象ファイル: scripts/oracle_access_setup.py、tests/oracle_access_setup.py、TODO_ROADMAP.mdを変更。本ログを新規作成。既存の未コミット変更・ログは削除/上書きしていない。
- 操作・変更差分:
  - AGENTS.md、ロードマップ、DNS診断・403診断ログ、対象コード、VT手順とガードを読取。
  - USER_AGENT = antigravity-memo-oracle-verify/1.0 を定義し、Service Tokenあり/なし双方のGETへ付与。
  - HTTPErrorの既存ステータス取得・close・本文非表示処理は維持。成功条件不成立をSetupError('VERIFY_FAILED')へ変更し、予期した401/403等をUNEXPECTED_ERROR扱いしない。
  - 認証ヘッダー、トークン、設定読込・保存、成功条件、GET2回、リダイレクト禁止の既存仕様は維持。
  - モックテスト追加: 301/302/401/403/429/500のステータス保持、UA・既存認証ヘッダー、エラー本文を読まないこと、close、verify終了値・固定診断・非表示・保存呼出しなし。
- 実行結果・テスト結果:
  - git diff --check 成功（終了0）。差分の静的確認を実施。
  - 指定引数配列相当で /usr/bin/python3 /home/ubuntu/CascadeProjects/Agents_in_oracle/scripts/vt_install_guard.py /home/ubuntu/CascadeProjects/antigravity-memo/scripts/oracle_access_setup.py を実行。
  - 終了2、status=unconfigured、allow_install=false、uploaded=false。vt-cli未導入。
  - 対象SHA-256: 50c3a44c41daa980ed1b6c7d2a6769666ed23fd3d5aefe9310565a2faba066bc
  - VT条件不成立のため、更新スクリプトの実行・importとローカルテスト実行は停止。テスト成功とは扱わない。本番HTTP・依存導入・デプロイ・pushなし。秘密値・実設定・レスポンス本文の表示なし。
- 発生したエラーと対処: VT CLI未導入。未検査のCLI導入等で迂回せず実行を停止。
- 未解決事項・考察: ローカルテスト未実行。UA変更後の本番応答は未確認。UA修正は別原因の401解消を保証しない。
- 次回アクション: VT利用可能な環境で更新スクリプトとテストの両ファイルを指定ガードで照合。各々終了0かつallow_install=trueとなり、実行直前のSHA-256一致を確認した場合のみ python3 -B tests/oracle_access_setup.py VerifyTests を実行（通信モック）。未登録/古い解析/通信失敗等では停止、アップロード禁止。確認後に本人の通常SSH端末で python3 -B scripts/oracle_access_setup.py verify を実行する。本番verifyは既存どおりService Tokenなし/ありのGETを各1回行う。
