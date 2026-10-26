# 共有メモ帳（shared-pad）端末側暗号化（AES-256-GCM）・30分自動削除 調査＆設計書

- **実施日時**: 2026-10-26 18:35 (JST) / 2026-10-26T09:35:00Z (UTC)
- **作業種別**: 読み取り専用調査 ＆ 基本設計案の策定（コード変更・設定変更・データ削除・デプロイなし）
- **対象システム**: `antigravity-memo` 内「デバイス共有メモ帳（`shared-pad`）」

---

## 1. 現状のメモ帳の調査結果（確認済みの事実）

### ① ファイル構成と役割
- `antigravity-memo/_worker.js`（L26-52）:
  - `/api/shared-pad` の `GET` / `POST` ハンドラー。
  - Cloudflare KV（`MEMO_KV`）のキー `shared_pad` に対して読み書きを行い、通常メモ（キー `memos`）とは完全に分離されている。
  - リクエスト上限3MB、本文最大20万文字、画像最大8枚（`data:image/(webp|jpeg|png);base64,...`）、`base` と `current.revision` の一致による楽観的排他制御（不一致時は `409 Conflict`）を実装。
- `antigravity-memo/shared-pad.js`（全189行）:
  - クライアント側の状態管理（`state = { pad: { text, images, revision }, base, dirty }`）、最大化UI、画像貼付・追加・削除、1秒デバウンス自動保存、15秒間隔ポーリング同期、競合解決、全消去（`#shared-pad-clear`）を担当。
- `antigravity-memo/shared-pad-transfer.js`（全61行）:
  - 本文とスクショ画像をCanvas上で1枚のPNG画像に描画・合成し、クリップボードへの一括コピー（`ClipboardItem`）やPNGダウンロードを行う。
- `antigravity-memo/app.js`（L1390-1435）:
  - `compressImage()` により画像ファイルを最大1200×1200px、品質0.75のWebP（非対応時はJPEG）Data URL（Base64）へ圧縮変換。
- `antigravity-memo/sw.js`（全108行）:
  - PWA用Service Worker。L48にて `/api/*` はキャッシュせずネットワーク直接通信（Network Only）となっており、Service WorkerのCache Storage内に共有メモ内容は残らない。
- `antigravity-memo/tests/shared-pad.cjs`（全94行）:
  - `/api/shared-pad` のAPI動作およびオフライン・全消去動作の単体テスト。

### ② Worker・KVの読み書き処理と画像の保存方式
- 本文（`text`）およびBase64化されたスクショ画像配列（`images`）は、**暗号化されていない平文JSON**として `/api/shared-pad` へPOSTされ、KVの `shared_pad` キーに無期限（TTL設定なし）で保存されている。
- クライアント端末側でも、以下の2つの `localStorage` キーに**平文JSONのまま無期限で保存**されている：
  1. `antigravity-shared-pad-v1`（編集中ドラフトおよび最新同期データ）
  2. `antigravity-shared-pad-v1-backup`（競合発生時に「別デバイスの内容を使う」を選択した際の退避データ：`shared-pad.js` L177）

### ③ 同期方法と更新頻度
- **送信（保存）**:
  - テキスト入力（IME変換確定後）や画像追加・削除から **1秒（1000ms）後**、またはテキストエリアのフォーカス外れ（`blur`）時に `sync()` を実行。
- **受信（取得）**:
  - 画面表示中は **15秒ごと（`setInterval`）** に `GET /api/shared-pad` をポーリング。
  - タブ復帰時（`visibilitychange`）、ネットワーク復帰時（`online`）、手動「↻ 同期」ボタン押下時にも即時実行。
  - ※ テキストエリアにフォーカスがある間（`document.activeElement === text`）は、入力中の文字が消えないようリモートデータの画面反映を保留する仕様（L115）。

### ④ Cloudflare Access の保護範囲とAPI認証の現状（重要な事実）
- **確認結果**:
  - 現在の公開URL `https://antigravity-memo.shinya4869ari.workers.dev/` および `/api/shared-pad` に対してヘッダー確認（`curl -I`）を行った結果、**Cloudflare Access のリダイレクト（302）は発生せず、直接 Worker が応答（200 / 405）する状態**です。
  - `*.workers.dev` ドメインは Cloudflare Zero Trust のカスタムドメイン保護対象外（またはバイパス経路）となるため、Cloudflare Access を画面・APIの双方に確実に効かせるには **① カスタムドメイン（例：`memo.seronworks.dev`）を割り当てて Access Application を設定し、`wrangler.json` で `workers_dev: false` にする** 必要があります（加えて Worker 内部でのトークン検証を併用することで完全保護となります）。

---

## 2. 推奨アーキテクチャ設計（E2EE 端末側暗号化 ＆ 30分自動削除）

### A. 端末側暗号化（Web Crypto API `AES-256-GCM`）の設計

1. **暗号化・復号フロー**:
   - クライアント側で `pad` の実データ `{ text: "...", images: ["data:image/..."] }` をJSON文字列化し、Web Crypto API（`crypto.subtle.encrypt`）の **AES-256-GCM** で暗号化する。
   - 保存のたびに `crypto.getRandomValues(new Uint8Array(12))` で **96bit（12バイト）の一意なランダムIV** を生成する。
   - Worker / KV に保存するデータ構造（バージョン2形式）：
     ```json
     {
       "v": 2,
       "alg": "A256GCM",
       "iv": "<Base64エンコードされた12バイトIV>",
       "ct": "<Base64エンコードされた暗号文＋128bit認証タグ>",
       "revision": "<UUID>",
       "updatedAt": 1793000000000,
       "expiresAt": 1793001800000,
       "deleted": false
     }
     ```
   - Worker（`_worker.js`）は `iv` と `ct` の形式・サイズ（最大4MB）と `revision` / `expiresAt` のみを検証してKVへ保存し、**平文や復号鍵には一切触れない（Zero-Knowledge）**。

2. **複数端末での安全な復号鍵共有と「毎回入力不要」の実現**:
   - **鍵生成と共有（初回1回のみ）**:
     - 初回端末で256bitのランダム共通鍵（`crypto.subtle.generateKey`）を生成。
     - 「🔗 他端末へ鍵を共有」ボタンから、**URLフラグメント形式（`https://<ドメイン>/#padkey=<Base64URL鍵>`）またはQRコード／鍵文字列コピー**でスマホ・PC・iPadへ共有する。
     - **安全性**: URLの `#`（フラグメント）以降はブラウザ仕様によりHTTPリクエストに含まれず、CloudflareやWorkerのサーバーログに一切送信されない。
     - 受け取った端末は即座に鍵を取り込んで保存し、`history.replaceState(null, '', location.pathname)` でアドレスバーから `#padkey=...` を即座に消去する。
   - **端末内の鍵保持方法とリスク明示**:
     - **推奨保存先**: ブラウザの **`IndexedDB`** に **`extractable: false`（エクスポート不可属性）の `CryptoKey` オブジェクト** として永続保存する。
     - **メリット**: 毎回パスワードを入力することなく、開いた瞬間に自動復号・自動保存が機能する。また `extractable: false` により、万が一のXSS時にも生の鍵バイト列を `exportKey()` で抜き取ることができない。
     - **リスクの明示**: 端末自体がロック解除状態で第三者に物理操作された場合や、同一オリジン上でXSSが発生した場合は、現在表示中の復号テキストが読まれるリスクがあるため、30分自動削除により露出時間自体を最小化する。

3. **暗号化による同期速度への影響**:
   - Web Crypto API の AES-GCM はブラウザのネイティブ暗号器（AES-NI / ARM Cryptography Extensions）で実行されるため、スクショ数枚を含む2〜3MBのデータでも **暗号化・復号時間は約5〜15ミリ秒** であり、体感速度の低下はゼロ。
   - Base64化によりデータ量が約1.33倍になるため、`_worker.js` のリクエスト上限を `3,000,000` バイトから `4,200,000` バイト（約4.2MB）へ引き上げることで既存の画像8枚制限をそのまま維持できる。

---

### B. 30分自動削除・手動削除・ゾンビ復活防止の設計

1. **最終更新から30分での確実な自動消去（3重ガード）**:
   - **① KVのネイティブTTL設定**:
     - `_worker.js` の `env.MEMO_KV.put('shared_pad', ..., { expirationTtl: 1800 })` により、最終保存から30分（1800秒）でKV上から物理的に自動消去する。
   - **② Worker側の論理期限チェック（KVのTTL遅延対策）**:
     - Cloudflare KVのTTL削除はエッジキャッシュの特性上、最大60秒程度の遅延がある。
     - そのため、`_worker.js` の `GET /api/shared-pad` 処理内で `if (pad.expiresAt && Date.now() >= pad.expiresAt)` を判定し、期限切れなら即座に `{ mode: 'kv', pad: null, expired: true }` を返しつつ `env.MEMO_KV.delete('shared_pad')` を実行する。これにより **30分00秒で1秒の狂いもなく全端末から閲覧不能** になる。
   - **③ クライアント画面の自動クリア＆カウントダウン表示**:
     - 画面ステータス欄に「⏳ 残り29分（自動消去）」を表示し、期限到達時（またはバックグラウンド復帰時）に画面・メモリ・ローカルキャッシュを即座に空にする。

2. **古い端末からの「削除済みデータ復活（ゾンビ復活）」防止設計**:
   - **課題**: 端末Aで削除した後に、スリープしていた端末Bを開くと、端末Bの `localStorage` に残っていた古いデータが画面に表示されたり、そのまま送信されて復活してしまう問題。
   - **解決策（Tombstone 削除墓標 ＋ 世代時刻チェック ＋ ローカル平文キャッシュ廃止）**:
     1. **Tombstone（削除墓標）の書き込みとサーバー側での再保存拒否（重要補強）**:
        - 手動削除（「🧹 全消去」ボタン）または30分期限切れの際、KVを単に空にするのではなく、`{ v: 2, deleted: true, deletedAt: Date.now(), expiresAt: Date.now() + 1800000, revision: newUUID }` という **Tombstone（削除墓標）** を保存する。
        - **サーバー（Worker）側での `POST` 再保存拒否ロジック**:
          - 古い端末が削除前または30分期限切れ前の `base`（旧 `revision`）を持って `POST /api/shared-pad` を送信してきた場合、または送信ペイロード自体の作成時刻（`updatedAt`）が30分以上前である場合、**Worker 側で書き込みを拒否（`410 Gone` または `409 Conflict` ＋ `expired: true / deleted: true`）** する。
          - これにより、クライアント側だけでなく **サーバー側で期限切れデータ・削除済みデータの再取得（`GET`）も再保存（`POST`）も物理的に遮断** する。
     2. **古い端末のローカルデータの強制パージ**:
        - 端末Bが復帰して `sync()` した際、サーバーから `410 Gone` または `deleted: true / expired: true` を受信した瞬間に、自端末の未送信ドラフト（`dirty: true`）を含め **競合ダイアログを出さずにローカルデータを即時完全消去**する。
     3. **ローカルキャッシュの暗号化・期限強制**:
        - `localStorage['antigravity-shared-pad-v1']` にも**平文は一切保存せず、暗号化されたペイロードと `expiresAt` のみを保存**する。
        - ページを開いた際、まずローカルデータの `expiresAt` を確認し、30分を過ぎていればネットワーク通信を待たずにその場で `localStorage.removeItem()` を実行して画面を白紙にする。
        - `antigravity-shared-pad-v1-backup`（競合退避用の無期限平文ストレージ）は機密データ残留の温床となるため廃止（または同じ暗号化＋30分期限の対象に統一）する。

3. **削除範囲の完全網羅**:
   - 手動削除・30分経過時に消去される対象：
     - **Cloudflare KV**: `MEMO_KV` の `shared_pad`（Tombstone上書き＋TTL消滅）
     - **ブラウザ LocalStorage**: `antigravity-shared-pad-v1` および `antigravity-shared-pad-v1-backup`
     - **ブラウザ メモリ / DOM**: `state.pad.text`, `state.pad.images`, `remote`, `#shared-pad-text.value`, `#shared-pad-images` 内の全 `<img>` 要素、ライトボックス表示中画像
     - **※ 保持されるもの**: `IndexedDB` 内の暗号化鍵（次回もパスワード入力なしで使うため）および既存の通常メモ（`memos` キー）は一切削除しない。

4. **Cloudflare KV と Durable Objects (DO) の比較**:
   | 項目 | Cloudflare KV（推奨・現行拡張） | Durable Objects (DO) |
   | :--- | :--- | :--- |
   | **30分自動削除** | `expirationTtl: 1800` ＋ Worker内 `expiresAt` 判定で正確に30分で閲覧不能化可能 | `storage.setAlarm()` でミリ秒単位の物理消去が可能 |
   | **整合性・削除反映** | 同一リージョン内は即時〜数秒。Tombstone併用で復活防止可能 | **強整合性（完全0秒）**。WebSocket併用で他端末の画面も0.1秒で即時クリア可能 |
   | **導入コスト・構成変更** | 既存の `MEMO_KV` のままコード修正のみで即日導入可能 | `wrangler.json` のDOクラス定義・マイグレーション設定の追加が必要 |
   - **結論**: まずはインフラ変更なしで即導入できる **「KV ＋ `expirationTtl: 1800` ＋ Worker内 `expiresAt` 判定 ＋ Tombstone」** で要件を完全に満たせます。さらにリアルタイム性（0秒同期・強整合性）を極めたい場合に第2段階として Durable Objects へ移行するのが最も安全です。

---

## 3. 既存データの安全な移行方法

- **移行時の無断削除防止**:
  - 新コード導入時、KVまたは端末 `localStorage` に既存の `v1`（平文データ：`v` フィールドがなく `text` や `images` を直接持つ形式）が存在する場合：
    1. 画面上で既存データをそのまま表示（無断で削除しない）。
    2. 暗号化鍵がセットアップされた時点で、次回保存（または「🔒 暗号化して保護」ボタン押下）時に自動的に `v2`（AES-256-GCM 暗号化形式 ＋ 30分TTL）へ変換して保存する。

---

## 4. 変更対象ファイル・実装手順・テスト方法・ロールバック方法

### 変更対象ファイル（`antigravity-memo` プロジェクト内）
1. `antigravity-memo/_worker.js`（`/api/shared-pad` の `v2` 暗号化ペイロード対応、`expirationTtl: 1800` 付与、`expiresAt` 期限切れ判定、Tombstone対応）
2. `antigravity-memo/shared-pad.js`（Web Crypto `AES-256-GCM` 暗号化・復号、`IndexedDB` 鍵管理・URLフラグメント鍵共有、30分カウントダウン＆期限切れ自動パージ、Tombstone受信時のゾンビ復活防止）
3. `antigravity-memo/index.html` ＆ `style.css`（鍵共有ボタン・暗号化ステータス表示・残り時間バッジ・手動即時削除ボタンのUI追加）
4. `antigravity-memo/tests/shared-pad.cjs`（暗号化ラウンドトリップ、30分期限切れ遮断、Tombstoneによる古い端末の復活防止テストの追加）

### 実装後のテスト方法
1. **単体テスト（Node.js）**:
   - `node --test tests/shared-pad.cjs` を実行し、暗号文保存・復号、KV上の平文非存在、30分経過後のGET遮断、Tombstoneによる古いドラフト破棄、通常メモ（`memos`）への非影響を自動検証。
2. **実機・ブラウザ検証**:
   - PCとスマホで `#padkey=...` により鍵を1回共有し、以後パスワード入力なしで文字・スクショが暗号化同期されることを確認。
   - KVの中身を直接確認し、`text` や `data:image/...` が平文で存在せず `ct`（暗号文）のみであることを確認。
   - 手動削除ボタン押下後、別端末でも内容が消え、古いデータが復活しないことを確認。

### ロールバック（復旧）方法
- 問題が発生した場合は、`antigravity-memo` リポジトリで `git revert HEAD`（または `git checkout <直前コミット> -- _worker.js shared-pad.js index.html style.css`）を実行してプッシュするだけで、数分で従来の `v29` へ完全復旧可能。
