# 2026-11-04 オフライン固定・SWセッション更新遮断・保存API認証欠落の根本解消 (v47) 作業ログ

## 実施日時
2026-11-04 06:27 UTC (2026-11-04 15:27 JST)

## 目的
ユーザーから「オフラインにやっぱりなるなー。それなかったらなかなかいいアプリになったんやけどな」と指摘された問題に対し、アプリが時間経過・スリープ復帰・メモ保存時に「オフライン（ローカル保存）」表示へ遷移・固定されてしまう根本原因を完全究明し、恒久対策を実施する。

## 特定した根本原因
1. **Service Worker (`sw.js`) による Cloudflare Access セッション再発行の妨害**:
   - セッション有効期限切れ時、ブラウザ本来のナビゲーション（リロード）であれば Access の認証エンドポイントに自動リダイレクトされて数ミリ秒で新トークンが発行される。
   - しかし、`sw.js` が `request.mode === 'navigate'` を横取りしており、Access のリダイレクト応答（302 / 別オリジン）を fetch 例外として catch し、**キャッシュ内の古い `index.html` をそのままブラウザに返していた**。
   - これにより、ブラウザは認証リフレッシュURLへ遷移できず、AccessセッションCookieが切れた状態のままキャッシュアプリが起動し、以後のAPI通信（`/api/memos`, `/api/shared-pad`）がすべて401/302で遮断されてオフラインに固定されていた。
2. **`saveMemosToCloud` および全件削除の通信欠陥**:
   - `fetchMemosFromCloud` には `credentials: 'same-origin'` やセッション検知があるが、`saveMemosToCloud` には `credentials: 'same-origin'`、タイムアウト（AbortController）、401/403/HTML検知、および失敗時リトライが一切なかった。
   - メモ作成・編集・削除・ドラッグ移動時にほんの一瞬でも通信が揺らぐと、即座に例外がスローされ「通常メモ: ローカル保存 (オフライン)」に固定され、自動リトライもされないため二度と復帰しなかった。
3. **スリープ復帰（画面点灯）直後の過敏なオフライン判定とリトライの空振り**:
   - スマホの画面点灯時（`visibilitychange` / `focus`）、Wi-Fi/4Gインターフェース復帰に数百ミリ秒〜1秒程度かかる。
   - 復帰直後（0ms）に即座に fetch して失敗（1回目）、短すぎるリトライ（1.5秒後）で失敗（2回目）すると、わずか1.5秒で `consecutiveSyncFailures >= 2` に達し、即座に「ローカル保存 (オフライン)」警告が表示されていた。
   - しかもタイムアウト（8000ms）待ち中に1.5秒・4.5秒のリトライが走ると、`isSyncing / busy` ガードにより2回ともスキップされ、リトライタイマーが消化されて放置されていた。

## 実施した対策 (v47)
1. **`sw.js` (Service Worker v47)**:
   - ナビゲーションリクエスト（`request.mode === 'navigate'`）において、リダイレクト（`redirected === true`）、3xx、401、403 レスポンスを一切横取り・キャッシュせず、ブラウザネイティブのナビゲーションへ透過（passthrough）。Cloudflare Access の自動セッション更新を完全に保証。
   - キャッシュへの保存は自オリジンの正常な 200 OK HTML のみに限定し、ログインHTMLの誤キャッシュを防止。
   - 本当にネットワーク自体がオフラインの場合のみ、キャッシュの `index.html` に安全にフォールバック。
2. **`app.js` (通常メモ・アプリコア)**:
   - `saveMemosToCloud`: `credentials: 'same-origin'`、`cache: 'no-store'`、タイムアウト（AbortController 10秒）、401/403/HTML検知時の `scheduleSafeSessionRecovery()`、失敗時の `scheduleMemoReconnectRetries()` を完備。
   - スリープ復帰デバウンス（`triggerWakeSync`）: `visibilitychange` / `focus` 時に 700ms の安定化待機を設け、復帰直後の0ms通信エラーを防止。
   - オフライン判定の過敏性抑制: 3回連続失敗または `navigator.onLine === false` で初めて「オフライン」と判定。1〜2回の一時的失敗は「一時待機・再接続試行中...」として誤表示を抑制。
   - 3段階指数バックオフリトライ（1.5秒、4.5秒、10.0秒）を導入し、ハング中の古い fetch を abort して新規通信を通す制御を追加。
   - `online` イベント検知時は待機なしで即座にクラウド同期を実行し、最速で緑の接続済へ復帰。
   - 全件削除の `fetch` にも `credentials: 'same-origin'`, `cache: 'no-store'` を付与。
3. **`shared-pad.js` (黒板)**:
   - スリープ復帰時の 700ms 安定化待機（`triggerPadWakeSync`）を導入。
   - 3段階リトライ（1.5秒、4.5秒、10.0秒）とタイムアウト時 abort 制御を追加。
   - 一時的な通信揺らぎで即座に「⚠️ 未接続・未同期」と騒がず、3回連続失敗時のみ表示。
4. **`index.html`**:
   - アプリバージョンを `v47` に更新、CSS/JSのキャッシュバスターを `20261104_v47` に更新。
5. **テスト・検証**:
   - `tests/offline-recovery-v47.cjs` を新規作成。
   - 既存テストを含む全18件のテスト（`node --test tests/*.cjs`）が全件パス。

## 変更ファイル
- `sw.js`
- `app.js`
- `shared-pad.js`
- `index.html`
- `tests/offline-recovery-v47.cjs`
- `execution_logs/2026-11-04_v47_offline_stuck_resolution.md`

## 残存リスク
- なし（既存メモ47件、暗号化黒板、ファイル転送機能、カンバン表示の完全互換を維持）
