# 通常Worker Production Secret登録・最終承認用手順（未実行）

- 実施日時: 2026-10-26 23:40–23:42 UTC
- 目的: ユーザーが指定した通常Worker antigravity-memo / Productionへ、既存auth.jsonのmemo_api_tokenのみをMEMO_API_TOKENとして登録する手順と本番影響を提示し、最終承認を待つ。
- 作成: 本ログ。変更: TODO_ROADMAP.md記録のみ。コード・認証ファイル・設定・権限・KV・同期処理は変更していない。
- 操作: AGENTS.md、ロードマップ、関連ログ、wrangler.json、CLI可用性を読取。Cloudflare公式のsecret putとSecretの反映仕様を確認。npxはあり、グローバルwranglerは見つからない。CLIの導入・ログイン・登録コマンドは未実行。

## 承認対象
- Worker: antigravity-memo。本番Production（現wrangler.jsonのトップレベル設定）。名前付き別Worker antigravity-memo-productionを新規作成しない。
- Secret名: MEMO_API_TOKEN。型Secret。
- 値の取得元: /home/ubuntu/.config/antigravity-memo/auth.jsonのmemo_api_token。既存値のみ使用。新規生成しない、Client ID/Secretに触れない。
- Oracle側ファイルは読取のみ。親0700/ファイル0600維持。
- 対象Workerの現行本番にSecret一件を追加して反映し、その後読取GETで検証する操作を、まだ実行しない。

## 実行前の条件（承認後も満たさなければ停止）
1. Cloudflare管理ログインを本人の正規経路で確保し、アカウント/Worker/Production/対象ドメインを確認。Service Tokenは管理用ログインに流用しない。管理用トークンをチャットに要求しない。
2. 利用するWranglerの版・CLI存在を確認。今回CLIのインストールはしていない。
3. 現行本番のバージョン/コード/既存Bindingsを記録可能な非秘密メタデータで確認。未公開バージョンや段階デプロイがある場合、無条件のsecret putで別コードを反映しないよう停止して手順を再評価。
4. APIトークンファイルの所有者・symlink・0700/0600・書式・非空を確認。値はログに出さない。

## 登録コマンドの本体（参考、未実行）
```sh
npx --no-install wrangler secret put MEMO_API_TOKEN --name antigravity-memo --env ""
```
- 現設定には名前付きproduction環境がない。空envはトップレベルの本番対象を明示する意図。利用版の解釈と実対象を確認してから使用。--env productionを機械的に付けて別Workerを対象にしない。
- コマンド単体を画面で秘密値付き実行するのではなく、承認後にレビューする専用Python処理がauth.jsonを直接読んでsubprocess.runのinputへ渡す。秘密値は子プロセスstdinだけに渡り、シェル引数・環境変数・標準出力へ出さない。
- Python処理はshell=False、コアダンプ禁止、raw stdout/stderrは外へ出さない。終了コードと固定の成否のみを表示。CLIデバッグ/HTTPヘッダーログ/シェルトレースは無効。echoやcatで表示して転送しない。
- 一時.envやSecretファイルを作らず、GitHubや画面クリップボードにも入れない。既存auth.jsonのまま使用する。
- CLIが未導入/未ログイン/対象不明なら失敗として停止。対象がなかった場合のWorker新規作成にも同意しない。

## 本番への影響
- 通常Workerのwrangler secret putは新バージョンを作成し即時デプロイするため、Secret登録は本番反映を含む。本番を変更しない準備作業とは区別する。
- ローカルのwrangler deployやコードアップロードは行わない。現行本番コード・他Bindingsの保持を確認してSecretだけを変更する。
- AccessのGoogle Allow、oracle-ai Service Auth、TEAM_DOMAIN/AUD、Client ID/Secret、ドメイン/ルートは変更しない。認証Bypassを追加しない。
- KVバインド・データ・同期周期・本文画像の処理を変更しない。専用APIトークン経路の401解消が期待されるが、実HTTP検証前に復旧と断定しない。
- 稼働Workerの新バージョン切替を伴うため、本番反映そのものの影響がゼロとは断定しない。同期ロジック変更やデータ移行・削除は含まない。

## 承認後の成功判定
- CLIの成功表示だけでは完了にしない。識別UAを持つ一回限りの診断GETを使用（既存Pythonコードを編集せず実施可能）。
- Service TokenなしはAccess拒否、Service Token＋既存APIトークンありはHTTP200かつJSONのメモ配列であることを確認。redirect追従なし、Cookieなし、POSTなし。
- HTTPコードとJSON判定だけを表示。レスポンス本文・画像・認証値・ヘッダーは出さない。
- 非200・HTML・JSON不正・タイムアウト・登録コマンド失敗は未完了として止める。キャッシュへ戻して成功扱いしない。自動で他Secret上書き/再生成/保護解除をしない。

## 公式根拠
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret
- 公式説明でsecret putのstdin入力と即時デプロイを確認済み。秘密値をechoする公式例は今回の非出力条件に合わないため採用しない。

## 結果・次回
- 調査と手順作成のみ。コード未変更のためテスト実行なし。設定変更・トークン生成/表示・Secret登録・デプロイ・HTTP/POST・プッシュなし。
- ユーザーが明示した最終承認を待つ。承認があっても管理権限や対象の照合ができなければ、その不足を明示して止める。
