# Oracle既存トークンをProduction Secretへ転記する手順（未実行）

作成日時: 2026-10-27 02:03 UTC

今回は手順の作成のみ。設定変更・Secret登録・デプロイ・本番GETは実施していない。以下の実作業はユーザーの明示承認後に行う。

## 1. 作業前提と停止条件

- Cloudflare管理画面は本人の信頼できる手元端末で開く。OracleへCloudflare管理ログイン、Wrangler認証、管理APIトークンを追加しない。
- 正しいアカウント → Workers & Pages → `antigravity-memo` → Productionを選び、Domains & Routesに `anti-memo.seronworks.dev` があることを確認する。Active DeploymentのVersion、配信割合、日時も控える（非秘密情報だけ）。不一致・不明なら停止する。
- 操作対象は実行時の `MEMO_API_TOKEN` Secretだけ。Build用変数・Preview・Pagesの設定と取り違えない。Oracleの `~/.config/antigravity-memo/auth.json` は読取専用とし、再生成・configure・書換えをしない。
- クリップボード履歴・端末間同期・クリップボード管理アプリ・画面録画・ターミナルセッション記録を停止できる環境を使う。停止できない場合、この転記方法は使わない。
- トークンをcat、echo、print、jqの画面出力、シェル変数展開、コマンド引数、環境変数、OSC 52、DevTools、チャット、スクリーンショット、Gitに載せない。HTTPデバッグ・ヘッダー記録も無効にする。

## 2. 導入・更新が必要な場合のVirusTotal条件

新規の転記・検証スクリプトを含め、導入・更新対象は秘密情報を含まないファイルとして先に取得し、実行せず次の引数配列で照合する。

```json
["/usr/bin/python3", "/home/ubuntu/CascadeProjects/Agents_in_oracle/scripts/vt_install_guard.py", "<対象ファイルの絶対パス>"]
```

終了コード0かつ `allow_install=true` の両方が必要。実行直前に同じファイルのSHA-256が照合時と一致することを確認する。変更した場合は再照合する。依存物も対象とする。対象はスクリプト等であり、auth.jsonやトークンではない。

検知あり、未登録、古い解析、通信失敗、CLI/API未設定、依存物を含め検査不能なら停止し、その理由だけ報告する。`vt scan file`、curl|sh、未検査のnpm/pip等を使わない。APIキーを引数・チャット・ログへ出さない。検知なしは安全保証ではない。

参照: `/home/ubuntu/CascadeProjects/Agents_in_oracle/docs/virustotal.md`。この手順書は転記・検証プログラムの提供や検査済み認定ではない。未検査のワンライナーで代替しない。

## 3. 画面に表示せず、既存値だけを手元クリップボードへ移す

承認後、検査済みの転記プログラムと既存のSSH・OS標準クリップボード機能を使用する。具体的なOS別コマンドは手元端末のOSと既存ツール確認後に確定する。必要条件は以下。

1. 手元端末から既存のSSH鍵でOracleへ接続する。ホスト鍵を確認し、PTY・セッション記録を使わない。
2. Oracle側ではauth.jsonをJSONとしてメモリ内で読み、`memo_api_token` の値だけを抽出する。JSON全体・Access認証情報を転送しない。非空文字列であることを確認し、不正なら固定エラーだけで停止する。
3. 再生成、trim、引用符付加、Bearer付加、改行付加、Base64化をせず、値のバイト列をSSHの暗号化されたパイプから手元プログラムのメモリへ直接渡す。stdoutをターミナルへ接続しない。パイプは平文ファイルにも保存しない。
4. 手元プログラムが転送完了・正常終了を確認してからOSのクリップボードAPIへ設定する。失敗時はクリップボードを空にして停止する。値を標準出力・標準エラー・例外メッセージへ出さない。
5. CloudflareのSecret入力欄へ一度だけ貼り付ける。値の表示切替は使わず、他アプリへ貼り付けない。検査済みプログラムにメモリ内の転送値とクリップボード読戻し値を比較させる場合も、出力は一致/不一致だけにする。ハッシュ・長さ・一部文字も記録しない。
6. 貼付後直ちにクリップボードを消去し、履歴・同期先に保存されていないことを確認する。再コピーが必要なら同じ読取経路を使い、手入力や表示で補わない。

クリップボードには一時的に秘密値が存在するため、信頼できる端末が前提。安全な直接転送を構成できなければ、表示して転記する方法へ切り替えず停止する。

## 4. Cloudflare管理画面での単一Secret更新

1. WorkerのSettings → Variables and Secretsで、名前が正確に `MEMO_API_TOKEN`、型が **Secret** の項目を編集する。既存項目がある場合はそれを更新し、同名の別設定を増やさない。
2. 上記の既存値だけをValueへ貼り付ける。JSONの引用符、キー名、`Bearer ` は入力しない。他SecretやBindingsを変更しない。
3. **保存・Deployは本番変更を伴うため、ユーザーの承認前には押さない。** 承認された範囲でSecret更新と必要な本番反映を行う。
4. Deploymentsで、対象VersionとSecret名・型、ProductionでのActive配信を確認する。複数Versionが配信中なら未更新Versionが残っていないか確認する。意図しないコード・他設定の変更が含まれる場合は停止する。

Cloudflare公式: https://developers.cloudflare.com/workers/configuration/secrets/
Secretの値は登録後に読み戻せない。名前の存在だけで値の一致とは判定しない。Build成功もActive配信の証明とはしない。

## 5. User-Agent付きの読取専用GET（承認後、一回）

検査済みの検証プログラムで、Oracleの既存auth.jsonをメモリ内で読み、次の一回のHTTPSリクエストを構成する。

- URL: `https://anti-memo.seronworks.dev/api/memos`
- Method: `GET`。ボディなし。POST/PUT/DELETEは禁止。
- User-Agent: `AntigravityMemo-ReadonlyAuthCheck/1.0`
- Accept: `application/json`
- Authorization: メモリ内で `Bearer ` + 既存 `memo_api_token` を構築。
- X-Memo-Token: 同じ既存 `memo_api_token`。
- CF-Access-Client-Id / CF-Access-Client-Secret: auth.jsonの既存 `cf_access_client_id` / `cf_access_client_secret` を利用。これは既存Access通過用であり、管理権限ではない。
- TLS検証を有効にし、リダイレクト・自動再試行を無効化。認証ヘッダーを別ホストへ転送しない。タイムアウトを設定する。
- 本文はメモリ内でJSON判定するだけとし、メモ内容、ヘッダー、Cookie、リダイレクト先、例外全文は出力しない。記録は日時・HTTPステータス・JSON配列か否か・成功/失敗だけ。

`HTTP 200` かつ期待するメモ配列JSONなら運用上の認証・読取成功。200のHTML、302、401、403は成功にしない。`uninitialized` 等の別JSONは想定配列ではないため、復旧完了とはしない。

Access JWTでも許可される実装なので、GET成功だけでSecretの文字列一致を独立に証明したとは言わない。転記経路・対象Version確認と合わせて判断し、APIトークン比較の直接証明が必要なら次節の `MATCH` を別承認で確認する。

## 6. 401が続いた場合: 再更新を止め内部診断へ

同条件のGETやSecret更新を繰り返さない。401だけから不一致・未設定と断定しない。

1. まず管理画面で対象ドメイン、Worker、Active Version、配信割合、実行時Secret名・型を読取照合する。既存ログも確認する。
2. 必要な内部情報がなければ、診断コード追加・本番反映の範囲と停止/撤去方法を提示して別承認を得る。今回は追加もデプロイもしない。
3. 診断は管理者限定ログへ、対象を限定した一回の要求について非秘密のVersion識別子と固定状態コードだけを記録する。API側は `ENV_MISSING / ENV_INVALID / CANDIDATE_MISSING / TOKEN_MISMATCH / MATCH` などで、どのヘッダーを選択したかも固定分類のみとする。JWT側も未設定・欠落・検証失敗・成功の固定分類にする。
4. トークン本体・一部・長さ・ハッシュ、リクエスト全体、認証ヘッダー、JWT、Cookieを出さない。公開診断エンドポイントや詳細な401応答は追加しない。診断終了後に停止/撤去する。

現行ローカルWorkerではAPIトークンが一致すればJWTに関係なく許可される。Bearerヘッダーがある場合はそちらが優先される。本番の稼働コード・受信候補・envを固定分類で切り分ける。`MATCH` なのに401なら、別Version/別リクエスト/別の拒否層を調べる。診断結果と追加承認なしに再登録しない。
