# 2026-11-01 全3台オフライン表示固定・1台暗号鍵不一致の根本原因調査および v42 恒久対策

- **実施日時**: 2026-11-01 06:13 UTC (2026-11-01 15:13 JST)
- **目的**:
  1. PC・iPhone・iPad の全3台がしばらくすると「オフライン（`通常メモ: ローカル保存 (オフライン)` / `⚠️ 未接続・未同期（再接続待ち）`）」になり、通信が回復してもページ更新まで復帰しない問題の根本原因特定と修正。
  2. 画面更新後に1台だけ「別デバイスの暗号キーが異なります」となり黒板が利用できなくなる問題の根本原因特定と恒久対策。

## 1. 特定した原因

### 調査A：全3台がオフラインになりページ更新まで解除されない原因
1. **黒板 (`shared-pad.js`) のステータス更新漏れ**:
   - `updateStatusDisplay(defaultMsg, eventType)`（旧220〜257行目）において、`hasActiveContent === false`（空の黒板または期限切れ後）または `confirmedExpiresAt` 未確定時に `defaultMsg === null` で呼ばれた場合、`message(...)` を呼ばずに終了していたため、一度でも通信失敗で `⚠️ 未接続・未同期（再接続待ち）` になると、その後の通信成功でもエラー表示が画面に残り続けていた。
2. **スリープ復帰・タブ復帰直後の通信競合とタイムアウト未設定 (`app.js` / `shared-pad.js`)**:
   - スリープ復帰（`visibilitychange` / `focus`）の `0ms` 時点で即座に `fetch` が走り、Wi-Fi再接続完了前の瞬間的なネットワークエラーで全端末がオフライン表示に遷移していた。
   - `shared-pad.js` の `fetch('/api/shared-pad')` に `AbortController` タイムアウトがなく、スリープまたぎの通信ハング時に `busy = true` が解放されないケースがあった。
   - `app.js` には `window.addEventListener('online', ...)` や失敗後の短期自動リトライがなく、Cloudflare Access セッション期限切れ時の HTML リダイレクト応答も JSON パース失敗として「オフライン」と誤表示していた。
3. **Service Worker (`sw.js`) による `/api/` 503 変換**:
   - `sw.js` が `/api/` をインターセプトし、SW 内の `fetch` 失敗時に擬似 `HTTP 503` を返していた。

### 調査B：1台だけ更新後に「暗号キーが一致していません」になる原因
- `shared-pad-crypto.js` の `KeyStore` が `IndexedDB` のみに依存しており、トランザクション後に `db.close()` していなかったため、iOS/iPadOS Safari 等でリロード時に `indexedDB.open()` のブロックや取得失敗（`null`）が発生すると、`shared-pad.js` の `initKey()` が即座に**新しいランダム鍵を自動生成して上書き保存**してしまい、サーバー上の暗号文と鍵が不一致になっていた。

## 2. 実装した修正内容 (v42)
- `shared-pad-crypto.js`:
  - 暗号鍵を `IndexedDB`（`antigravity-pad-keystore`）と `localStorage`（`antigravity-shared-pad-key-v2`）の**二重永続化（Dual Storage）**に強化。
  - 既存の `IndexedDB` 鍵を読み込んだ際にも自動的に `localStorage` へミラーリング保存し、リロード時に `IndexedDB` がブロック・遅延・消失しても `localStorage` から即座に同一鍵を復元。
  - 全トランザクション完了時に `db.close()` を徹底し、`indexedDB.open()` に `1500ms` タイムアウト保護を追加。
- `shared-pad.js`:
  - `updateStatusDisplay` のフォールバック漏れを修正し、通信回復時に必ず `⚠️ 未接続・未同期（再接続待ち）` を解除して `接続済（空）` / `🔒 接続・同期済` へ復帰するよう修正。
  - `fetchPadApi`（8秒タイムアウト・`credentials: 'same-origin'`・HTMLリダイレクト/401/403の認証切れ識別）を導入。
  - 通信失敗時および `visibilitychange` / `focus` / `online` 時に `1.5秒後`・`4.5秒後` の自動再接続リトライを実行し、ページ更新なしで自動復帰。
  - `initKey()` でストレージに鍵がない場合は仮鍵をメモリ保持のみとし、サーバー上の既存メモと競合しないことを確認してから永続化する安全ガードを追加。
- `app.js`:
  - `fetchMemosFromCloud` に `cache: 'no-store'`, `credentials: 'same-origin'`、HTMLリダイレクト時の「再ログインが必要です」識別を追加。
  - `window.addEventListener('online', ...)` および通信失敗時・スリープ復帰時の自動再接続リトライ（`1.5秒後`・`4.5秒後`）を追加。
- `sw.js` / `index.html`:
  - `CACHE_NAME` を `antigravity-hub-v42` に更新し、`/api/` および `/cdn-cgi/` を Service Worker 介入から除外（ブラウザ直接通信）。

## 3. テスト・検証結果
- `node --test tests/shared-pad.cjs experiments/do-lifecycle/test_key_protection_and_status.mjs experiments/do-lifecycle/test_blackboard_keep_toggle.mjs`: 全17件パス。
- 3端末（PC・iPhone・iPad）独立環境シミュレーション（`verify_v42_fix.mjs`）:
  - 全3台がオフライン遷移後、ページリロードなしで1.5秒後に自動的に `接続済（空）` / `🔒 接続・同期済` へ復帰することを確認。
  - リロード時に `IndexedDB` が破損・ブロックされた端末でも、`localStorage` バックアップから同一暗号鍵を自動復元し、鍵不一致にならず即座に復号・同期できることを確認。
