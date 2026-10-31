# 本番バージョン・Secret反映・認証コードの照合手順

- 実施日時: 2026-10-27 01:47–01:50 UTC
- 目的: 同じAPI疎通テストや確認済みローカル検証を繰り返さず、未確認の実本番状態を調べるため本人の最小操作を提示。
- 作成: 本ログ。変更: TODO_ROADMAP.mdの記録のみ。コード・設定・Secret・本番・データの変更なし。
- 操作: AGENTS.md、ロードマップ、直近ログ、git statusを確認。GitHub読取APIのmain commit/check runs/_worker.js/historyをメモリ内取得。公式CloudflareのBuilds/Versions/Secrets/CLI読取コマンド資料を確認。

## 新しく確認したGitHubメタデータ
- main最新コミット: 2f4378d60f271e8d6a1c7d239fa87a6e9ac9ce5d。
- 同SHAのWorkers Buildsは成功。完了時刻: 2026-10-26T22:00:33Z。
- build linkはantigravity-memo / ProductionのWorker管理画面を指す。
- 同SHAのGitHub上_worker.js全体、およびAPI認証ガード部分はローカルと完全一致。ファイル内容を画面に出さず比較。
- Workerコードの直近変更コミットは2f87ac8c7a7b（認証強化）。以降main最新までWorkerコードの差分なし。
- ただしCloudflare管理APIの現行Active Deploymentや本番ソースは取得できず、上記GitHub版と実稼働版の一致はまだ証明していない。

## 照合方法
- Cloudflare Workers > antigravity-memo > DeploymentsのActive Deploymentを開き、配信中Version ID・作成日時・トラフィック割合を取得する。Version Historyの最上段や最新Buildと混同しない。
- 公式資料ではBuild成功はVersion作成を意味し、設定によってはActive Deploymentへの昇格を伴わない。Deploy commandがversions uploadの場合等がある。新しいVersionの存在だけで本番反映済みとは判定しない。
- Activeの版からビルド/コミットへのリンクがある場合、mainの2f4378d60f27と照合。表示がなければDeployments下のView build historyで当該成功ビルドのcommitと生成Version IDを確認して追跡する。
- Secret変更でも新Versionができるので、Secret更新後のVersion IDがGitHubビルド時と異なること自体は不一致証拠ではない。元コード版を継承しているかを履歴/コードで確認する。
- トラフィック分割があれば配信中の全Versionについて確認する。

## 本人の最小画面確認
まずは2画面だけ、変更ボタンを押さず確認:
1. Settings: Domains & Routesにanti-memo.seronworks.devがあるか。Runtime variables and secretsのProductionにMEMO_API_TOKENがSecret/Encrypted型であるか。値の表示/編集/再登録は不要。
2. Deployments: Active Deploymentが使うVersion ID・作成時刻・配信割合と、表示されれば作成元/commit。版の詳細にBindingsが見える場合は、同じVersionにMEMO_API_TOKENのsecret bindingがあるかも名前/型だけ確認。
- 手元に戻してほしい情報はドメインの有無、Secret型の有無、Active Version ID/日時/割合、作成元/commit。秘密値・ログ全文・Cookieは不要。
- 作成元/commitが不明な場合だけ、View build historyで2f4378d60f27の成功ビルドを確認する追加操作へ進む。全ログの貼付は求めない。
- 設定画面にSecret行があるだけでは、特定の配信中Versionのbindingまで検証したことにはしない。版ごとの情報が表示されない場合は未確認と報告する。

## 実コード差異の確認
- GitHubとローカルの差異は現在なし。未確認なのは本番の稼働コードとの対応だけ。
- 本番の配信中Versionに紐付いた読取コード表示が利用できる場合だけ、MEMO_API_TOKEN参照、verifyAutomationToken、requireApiAuthの部分を比較する。エディタの最新ドラフトが配信中Versionと同じと仮定しない。Save/Deployは押さない。
- Codeの表示機能がそのVersionで利用できない場合、管理権限が利用可能になってから該当版のread-only content取得を検討。認証値を表示しない。
- 仮説: 別ドメイン/別Workerを見ている、旧コード版/Secretを含まない版が配信中、更新した版が配信されていない、手動変更でGitHubと本番が異なる。いずれも現在未証明。

## 上記照合後も不明な場合のみ行う診断案（未実施）
- 対象/稼働版/Secret型/コード対応を先に確認。それでも不明な場合に限り、別途承認の下で固定状態コードをWorker内部ログへ追加する。
- 一回の本人診断要求に限定し、verifierの非秘密revision、ENV_MISSING/ENV_INVALID/CANDIDATE_MISSING/TOKEN_MISMATCH/MATCHを記録。必要ならJWT側の固定失敗段階も追加。
- 認証値/一部/長さ/ハッシュ/ヘッダー/JWT/Cookie/本文は出さない。新公開エンドポイントを作らず、401本文も汎用のまま。ログ閲覧は管理者限定で診断後停止。
- 今回は診断コードの実装/デプロイは行わない。

## 根拠資料・結果
- https://developers.cloudflare.com/workers/ci-cd/builds/ （Build成功、Version、Active Deploymentの区別）
- https://developers.cloudflare.com/workers/versions-and-deployments/ （配信Versionと割合、Deployments画面）
- https://developers.cloudflare.com/workers/configuration/secrets/ （Secret登録での新Version、登録後の非表示）
- https://developers.cloudflare.com/workers/wrangler/commands/workers/#versions-view （管理ログインが使える場合の読取版情報）
- 一部の旧/推定ドキュメントURLは参照不能だったため、公式の現行ルートへ切替えて確認。
- アプリAPIへの疎通GETなし、コード/設定/Secret再登録/デプロイ/POST/プッシュなし。今回新規テストなし。
- 次回は本人の2画面の非秘密メタデータを受けて照合する。先に同一疎通試験やSecret変更を行わない。
