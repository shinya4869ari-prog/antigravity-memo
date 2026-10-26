# Oracle入力エラー表示の改善

- 実施日時: 2026-10-26 21:57–21:59 UTC
- 目的: ユーザー指定に従い、秘密値を表示せず入力/再確認/端末/書込エラーを区別し、保存未完了を明示する。実際のconfigureは本人が実行する。
- 変更: scripts/oracle_access_setup.py, tests/oracle_access_setup.py, TODO_ROADMAP.md。
- 作成: 本ログ。前回の読取調査ログ2件は保持し今回一緒に記録。アプリ・Worker・同期・API・MCPの変更なし。

## 操作・差分
- AGENTS.md、ロードマップ、入力調査ログ、既存コード・テストを確認。
- SetupErrorと固定メッセージの許可リストを追加。Client ID/Client Secret別にEMPTY・WHITESPACE・CONTROL・NON_ASCIIを区別。Secret再確認はSECRET_CONFIRM_MISMATCH、端末/EOF/中断/echo抑止不可はTERMINAL_INPUT_ERROR、書込はWRITE_FAILED。
- 制御文字はUnicodeカテゴリCc/Cf/Csを判定し、ESC・タブ・改行・DEL・ゼロ幅文字も拒否。空白はisspaceで判定。値をstrip等で加工/補正しない。
- IDとSecretは入力直後に検査。端末へは一項目ずつ貼り付ける案内を表示。getpass警告の例外化はcatch_warnings内に限定し、非表示入力失敗時のecho入力へのフォールバックを阻止。
- main関数で終了コードを返し、画面には固定コードと固定文だけを出す。生の例外メッセージや入力値は一切表示しない。
- configure失敗は必ず「未保存（保存完了未確認）」を表示。置換後のfsync/再読込確認失敗はSAVE_CONFIRM_FAILEDとして「更新済みの可能性」も表示し、未変更と誤認させない。verify失敗は保存操作と区別。
- 既存JSONの二項目置換・他項目/書式保持、親0700/ファイル0600、原子的置換、fsync、再読込確認を維持。一時ファイル削除失敗で元の安全な診断が隠れないようにした。

## テスト結果
- PYTHONDONTWRITEBYTECODE=1 python3 tests/oracle_access_setup.py: 15テスト成功。
- ダミー設定で正常configure保存と文字列の完全保持（引用符/バックスラッシュを含む）、JSON書式・既存キー・0700/0600を確認。
- ID/Secret別の空・空白・制御文字（ESC、タブ、改行、DEL、ゼロ幅）・非ASCIIを検証。入力直後に止まり実保存へ進まないことを確認。
- 再確認不一致、TTYを開けない、EOF、KeyboardInterrupt、getpass警告、設定読込失敗、原子的置換失敗を検証。各表示に「未保存」と理由コードがあり、ダミー認証値を含まないことをassert。
- 保存置換後の再読込失敗を模擬し、成功表示なし・更新済み可能性の表示を確認。
- 実getpassを使うPTY6ケース（通常貼付、ID空白/制御文字、Secret空白/制御文字、再確認不一致）をダミーファイルで検証。秘密入力が端末出力へechoされないことをassert。
- テスト実行前後で実auth.jsonのSHA-256・mtime・権限と親権限をメモリ内比較し全て一致。値・ハッシュ値は出力/保存しない。
- git diff --check成功。実auth.jsonへの書込・実秘密値の入力・HTTP通信・デプロイなし。

## エラー・未解決・次回
- 修正後テスト失敗なし。過去の実configureがどの分岐で失敗したかはなお特定不能だが、今後は安全な理由コードで切り分けられる。
- 実際のService Token入力・実HTTP検証は本人のconfigure実行後。MCP保存失敗の成功扱いは別課題で未修正。
- 次回: 本人が既存configureを実行し、保存成功後verifyで認証付きHTTPを検証。
- ユーザーの従来のプッシュ運用に従い、修正・テスト・関連記録をコミットしorigin/mainへ反映する。設定実行や本番デプロイはしない。

## プッシュ完了（2026-10-26 22:00 UTC）
- 修正コミットd5c4afe。git push origin main成功（2f87ac8..d5c4afe）。
- 完了記録もコミットして反映する。実configure/verify・設定更新・デプロイは未実施。
