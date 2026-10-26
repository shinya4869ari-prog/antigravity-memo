# Oracle Service Token安全入力の準備（設定実行前）

- 実施日時: 2026-10-26 12:08–12:11 UTC
- 目的・背景: ユーザーが手元のoracle-ai Service TokenをOracle端末へ直接入力する方式で既存auth.jsonへ設定し、認証付きHTTP応答を検証する。入力方法・コマンド提示後のユーザー確認が必須。
- 作成: scripts/oracle_access_setup.py, tests/oracle_access_setup.py, 本ログ。
- 変更: TODO_ROADMAP.mdへの追記のみ。既存のアプリ・Worker・MCP・wrangler・同期処理は変更していない。既存未コミット差分は保持。

## 調査
- AGENTS.md、TODO_ROADMAP.md、移管ログ、直近の読取調査を確認。
- 実行環境のホスト名と既存auth.jsonのキー/型/値の有無/権限だけを確認。秘密値は表示・記録していない。
- 保存先: /home/ubuntu/.config/antigravity-memo/auth.json。親0700、ファイル0600、現ユーザー所有、シンボリックリンクではない。
- 既存形式: JSON object、memo_api_token / cf_access_client_id / cf_access_client_secret / memo_api_urlは全て文字列。APIトークンあり、Access二項目は空。接続先は https://anti-memo.seronworks.dev/api/memos と一致。
- 現在のエージェント環境に上書き用4環境変数はなし。稼働中の別プロセスの環境を網羅した検査ではない。
- MCP / Agents_in_oracleのserver.py / proposer.pyは同じファイルから二項目を読み、CF-Access-Client-Id / CF-Access-Client-Secretを送るコードが既存で存在。
- 公式資料: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/ を参照。

## 準備した操作
- configure: Python getpassでID/Secretをどちらも非表示入力。Secretは再入力照合。TTYなし・echo抑止不可は拒否。秘密値を引数・環境変数・シェル履歴に入れない。例外も値を表示しない。コアダンプ無効化。
- 空のAccess二項目のみJSON文字列を置換。他キー・既存トークン・URL・インデント等の書式を保持。既存Access値がある場合は上書きせず停止。
- 同一親内の0600一時ファイルへ書込み、fsync、入力中に元ファイルが変わっていないか確認、原子的置換、親fsync、再読込一致確認。親0700/ファイル0600・所有者・symlinkを検査。
- verify: ファイルから読み、専用APIトークンのみと、専用APIトークン＋Service TokenのGETを比較。リダイレクト・Cookie・環境プロキシ・キャッシュフォールバックなし。
- 検証成功条件: Service Tokenなしはリダイレクト又は401/403、ありはHTTP200かつJSONメモ配列。HTTPコードと判定結果だけを表示。本文・画像・認証情報・応答ヘッダーを出力/保存しない。
- アプリやKVへのPOST/PUT等は使わず、データを変更しない。通常起動経路での連携確認はこのHTTP検証とは別である。

## 検証結果
- Python構文検査成功。
- PYTHONDONTWRITEBYTECODE=1 python3 tests/oracle_access_setup.py: ダミー設定を使う6件成功（書式/他項目/0700・0600保持、権限・symlink拒否、置換失敗時の既存ファイル維持、一時ファイル清掃、入力中の変更検知、既存値上書き/不正値拒否、redirect追従禁止）。
- git diff --check成功。
- 実auth.jsonのconfigure/verifyはどちらも未実行。認証情報は未設定のまま。

## エラー・別課題・未解決
- scriptsディレクトリは存在しなかったため今回作成。読取検索の不在エラーのみ、設定操作の失敗なし。
- 別課題（今回は未修正）: mcp-server/index.mjs saveMemosはリモート保存失敗でも最終trueを返す。キャッシュ表示/保存メッセージを実通信成功と判断しない。将来は保存成否の伝達と回帰テストを検討。
- 今回のスクリプトはまだ実行していないため本物のTokenの有効性は未検証。Secret入力後も画面録画や端末のキー入力記録があれば別途漏えいし得るため、本人の通常のSSH端末での手入力を前提にする。
- 本人Google認証、Service Auth、既存の設定形式やアプリ機能・速度・データは変更しない。Cloudflare側設定変更・デプロイ・push・サービス再起動は未実施。

## 提示するコマンド（ユーザー確認後にOracleの本人端末で実行）
```sh
cd /home/ubuntu/CascadeProjects/antigravity-memo
python3 scripts/oracle_access_setup.py configure
python3 scripts/oracle_access_setup.py verify
```
- configure失敗時はそこで止める。ID/Secretは表示された非表示入力欄に入力し、チャットには貼らない。
- 確認を待つ理由: ユーザー条件5「まず入力方法と実行するコマンドを提示し、私の確認を待つ」。これは今回の明示指示である。

## 準備ファイルのプッシュ着手（2026-10-26 13:11 UTC）
- ユーザーからプッシュ指示を受領。対象は入力・検証スクリプト、ダミーテスト、ロードマップ、移管済みを含む関連調査ログ。
- Worker/MCP/wrangler/既存APIテストの事前差分は今回のコミット対象外として保持。アプリ機能・同期処理を変更しない。
- git fetch origin成功、HEADとorigin/mainの差0/0。git diff --check成功。
- 追加対象ファイルに実auth.jsonの非空認証値が含まれないことをメモリ上で検査し成功。検査時も秘密値は出力しない。
- configure/verifyは実行しない。入力方式の実行確認・本人端末での秘密値入力・実通信検証は引き続き未完了。
