# 公開API・Webhook セキュリティ詳細調査 ＆ 既存アプリ動作維持型の修正計画書

- **実施日時**: 2026-10-26 18:27 (JST) / 2026-10-26T09:27:00Z (UTC)
- **作業種別**: 読み取り専用詳細調査 ＆ 修正計画策定（コード・Cloudflare設定変更なし）
- **対象システム**:
  1. `antigravity-memo`（Cloudflare Workers / KV）
  2. `seesaw-portfolio` / `Ne-Kakeibo`（Cloudflare Workers / KV）
  3. `n8n Webhook`（Cloudflare Tunnel `n8n-webhook.seronworks.dev` / Oracle VM Docker `n8n`）

---

## 1. 事実確認（確認済みの事実 vs 推測・未確認事項）

### ✅ 確認済みの事実（コード・設定・コンテナ内部定義より実証）

#### A. `antigravity-memo`（メモ＆共有スクラッチパッド）
- **公開経路**: `https://antigravity-memo.shinya4869ari.workers.dev`
  - `wrangler.json` にカスタムドメインや `workers_dev: false` の指定はなく、`*.workers.dev` 上でインターネットに直接公開されている（Cloudflare Access 未適用・HTTP 200 応答を確認）。
- **提供APIと現在の認証方式**（`antigravity-memo/_worker.js` 全171行を確認）:
  - `GET /api/health`（L11-23）：認証なし、`Access-Control-Allow-Origin: *`
  - `GET, POST /api/shared-pad`（L26-52）：**認証なし**。KVキー `shared_pad` を直接読み書き。
  - `GET, POST, OPTIONS /api/memos`（L55-113）：**認証なし**、`Access-Control-Allow-Origin: *`。KVキー `memos` を直接読み書き。
  - `GET, POST, OPTIONS /api/apps`（L116-166）：**認証なし**、`Access-Control-Allow-Origin: *`。KVキー `custom_apps` を直接読み書き。
- **確認された全ての利用元（計4経路）**:
  1. **Webブラウザ / PWA画面**（`app.js` L382, L417, L485, L506 / `shared-pad.js` L90, L101）：同一オリジンからの `fetch('/api/...')`
  2. **MCPサーバー `antigravity-memo`**（`antigravity-memo/mcp-server/index.mjs` L24, L42, L94）：Node.js から `https://antigravity-memo.shinya4869ari.workers.dev/api/memos` へ `GET` / `POST`
  3. **Agents in Oracle 本体**（`Agents_in_oracle/server.py` L1459 `get_latest_memo`）：Python から同URLへ `GET`
  4. **事前調査・提案スクリプト**（`Agents_in_oracle/scripts/antigravity_memo_proposer.py` L31, L48, L83）：Python から同URLへ `GET` / `POST`
- **第三者によるアクセス可能性**:
  - URLを知る第三者がインターネット経由で全メモ・共有パッドの閲覧（`GET`）および改ざん・全消去（`POST`）を無認証で行える状態。

---

#### B. `seesaw-portfolio`（資産ポートフォリオ ＆ 家計簿 Ne-Kakeibo）
- **公開経路**: `https://seesaw.seronworks.dev`
  - `seesaw-portfolio/wrangler.toml` L14 にて `workers_dev = false` が設定されており、`*.workers.dev` 経路は遮断済み（HTTP 404を確認）。
  - カスタムドメイン `https://seesaw.seronworks.dev` は Cloudflare Access 未適用でインターネットから直接到達可能（HTTP 200を確認）。
- **提供APIと現在の認証方式**（`src/index.js` および `src/kakeibo.js` を確認）:
  - **すべて認証チェックなし**（`Access-Control-Allow-Origin: *`）で KV `SEESAW_KV` を読み書きしている。
  - **ブラウザUI専用API**:
    - `/api/portfolio`（`GET`/`POST`：資産評価額・保有銘柄データの取得・上書き）
    - `/api/stock-info`（`GET`）、`/api/calendar-event`（`GET`）
    - `/api/kakeibo/assets`（`GET`：普通預金・総資産取得）
    - `/api/kakeibo/settings`（`GET`/`POST`：給与・固定費設定）
    - `/api/kakeibo/ingredients*`、`/api/kakeibo/meal-records*`、`/api/kakeibo/amazon-orders`、`/api/kakeibo/card-bills`、`/api/kakeibo/records*`（`GET`/`POST`：家計簿明細・食材ストックの取得・追加・削除）
    - `/api/kakeibo/receipt-ocr`（`POST`）、`/api/kakeibo/meal-cost`（`POST`）：Gemini API 呼び出し
  - **外部自動連携（Webhook受信）用API**:
    - `POST /api/kakeibo/shopping-sync`（`src/kakeibo.js` L1263）：Gmailショッピング明細の一括登録
    - `GET, POST /api/kakeibo/rakuten-card/parse-email`（L1062）：楽天カード利用通知メール解析・登録
    - `GET, POST /api/kakeibo/amazon-orders/parse-email`（L909）：Amazon注文メール解析・登録
- **確認された全ての利用元（計3経路）**:
  1. **Webブラウザ / PWA画面**（スマホ・PCブラウザからの直接操作）
  2. **Google Apps Script (GAS)**（`seesaw-portfolio/gas/gmail_shopping_sync.js` L22）：Gmail巡回トリガーから `https://seesaw.seronworks.dev/api/kakeibo/shopping-sync` へサーバー間 `POST`
  3. **iPhoneショートカット（オートメーション）**：メール受信時に `/api/kakeibo/rakuten-card/parse-email` および `/api/kakeibo/amazon-orders/parse-email` へ `POST`
- **第三者によるアクセス可能性**:
  - 第三者が `/api/portfolio` や `/api/kakeibo/records` 等を叩くことで、資産額・銀行残高・家計簿履歴の閲覧および書き換えが無認証で可能な状態。

---

#### C. `n8n Webhook`（実行を伴わない内部定義調査）
- **調査方法**: Webhookを一切実行せず、`n8n` Dockerコンテナ内のワークフロー定義（`n8n export:workflow --all`）を読み取り専用で解析。
- **確認された事実（稼働中 `active: true` のWebhookノード全4件）**:
  1. **韓国ニュース巡回**（ID: `2LGLAOAwnLM5vd3G`）
     - パス: `POST /webhook/korean-news-crawler`
     - ノード認証設定: **`authentication: "none (default)"`（`hasCredentials: false`）**
     - 後続ノード: 直後は `⚙️ 実行設定`（Setノード）であり、ワークフロー内でのヘッダー検証・トークン検証ロジックなし。
  2. **映画DB充実**（ID: `VqJ9Gs9f8VAHuHC4`）
     - パス: `POST /webhook/movie-collect-x9k2`
     - ノード認証設定: **`authentication: "none (default)"`（`hasCredentials: false`）**、直後ノード（`入力統一・分割コード`）での認証検証なし。
  3. **人物用データベース充実**（ID: `no0rpWWXfZzTcsua`）
     - パス: `POST /webhook/person-db`
     - ノード認証設定: **`authentication: "none (default)"`（`hasCredentials: false`）**、直後ノード（`Wikidata詳細取得`）での認証検証なし。
  4. **韓国歌詞・語学学習**（ID: `tEAAWndhrOymXiKD`）
     - パス: `POST /webhook/korean-lyrics-app`
     - ノード認証設定: **`authentication: "none (default)"`（`hasCredentials: false`）**、直後ノード（`01_アプリ連携メタデータ確定 & LRCLIB生成`）での認証検証なし。
- **公開経路と利用元の事実**:
  - `cloudflared` の最新Ingress設定（version 17）により、`n8n-webhook.seronworks.dev/webhook/*` は Cloudflare Access を経由せず `http://n8n:5678` へ直通している。
  - **利用元①（韓国ニュース巡回）**: `Agents_in_oracle/server.py`（L112）および `scripts/run_korean_news_workflow.sh`（L23）は、外部URLではなく **ローカルホスト `http://127.0.0.1:5678/webhook/korean-news-crawler`** を直接呼んでいる。
  - **利用元②（映画・人物・歌詞の3本）**: `id_osiete` アプリ（`id_osiete/worker.js` L68 `/api/send-webhook` プロキシ、および `id_osiete/mcp-server.mjs` L284）から呼ばれている。なお、`id_osiete/config.json` L5-7 の送信先URLは現在 `https://n8n.seronworks.dev/webhook/...` となっているが、`n8n.seronworks.dev` に Cloudflare Access（302リダイレクト）が適用されたため、非対話通信である `id_osiete` からの送信は `n8n-webhook.seronworks.dev` 側（＋認証ヘッダー）へ合わせる必要がある。

---

### ❓ 推測・未確認事項（ユーザー環境・ダッシュボード側にある要素）

1. **iPhoneショートカットの実稼働有無**:
   - `seesaw-portfolio` の `/api/kakeibo/rakuten-card/parse-email` と `/api/kakeibo/amazon-orders/parse-email` について、現在iPhoneショートカットから実際に自動送信運用されているか（ショートカット側でリクエストヘッダー追加が可能か）。
2. **Cloudflare Zero Trust ダッシュボード上の既存ポリシー詳細**:
   - `n8n.seronworks.dev` に設定済みの Access Application のポリシー内容（メールアドレス制限のみか、Service Token が既に発行されているか）は、Cloudflare ダッシュボード上の設定であるためローカルからは未確認。
3. **`seesaw-portfolio` の Workers 環境変数 `GEMINI_API_KEY` の登録有無**:
   - コード上（`src/kakeibo.js` L242, L585）は `env.GEMINI_API_KEY` のフォールバックに対応済みだが、Cloudflare 側に現在シークレット登録されているかは未確認。

---

## 2. 認証方式の比較と「既存アプリの動作を維持する」推奨構成

| 方式 | メリット | デメリット / 既存アプリへの影響 | 判定 |
| :--- | :--- | :--- | :---: |
| **① Cloudflare Access 単体**<br>（ブラウザOTP / Googleログインのみ） | コード変更不要で画面とAPIを一括保護できる。 | ・`*.workers.dev` には直接適用できない（または裏口が残る）<br>・**MCPサーバー、Python、GAS、iPhoneショートカットからの通信が302ログイン画面に阻まれ全て動かなくなる** | ❌ 単独では不可 |
| **② Cloudflare Access ＋ Service Token** | 非対話通信も `CF-Access-Client-Id` / `Secret` ヘッダーで通過できる。 | ・カスタムドメイン化が必要<br>・ヘッダー2種を全連携先に設定する必要があり、PWAのService Workerキャッシュ更新時にCORSエラーが起きやすい | △ やや複雑 |
| **③ Workers側でのトークン認証**<br>（共有シークレット / Cookie + Bearer/Header） | ・**ブラウザUI、MCP、Python、GAS、iPhoneショートカットの全てに柔軟対応可能**<br>・`workers.dev` 直叩きも100%防御できる | Workersコード（`_worker.js`, `src/index.js`, `src/kakeibo.js`）に認証ミドルウェア追加が必要 | ◎ **最適** |
| **④ ハイブリッド構成（推奨）**<br>（Workers側トークン認証 ＋ 必要に応じてAccess併用） | **既存機能を一切壊さず、多層防御（エッジ＋Worker内部）が成立する** | 段階的な設定が必要 | 🌟 **最推奨** |

### 各システムの推奨保護アーキテクチャ（確定基本方針）

> 📌 **基本設計原則（2026-10-26 18:45 追記・統合）**:
> - **「Cloudflare Workersにデプロイすること」と「Cloudflare Accessで保護すること」は別物**であるため、自作Webアプリにも明示的に認証保護を設定する。
> - **管理画面やブラウザアクセスには「Cloudflare Access（本人のGoogleアカウント認証）」** を適用し、**自動連携（OracleのAI・MCP・GAS・iPhoneショートカット）には「専用の認証（Service Token または Worker側専用トークン）」** を用意することで、既存の自動連携を一切止めずに保護する。
> - **共有メモ帳の端末側暗号化（AES-256-GCM）・30分自動削除** もこの構成に統合する。
> - ⚠️ **保護完了までの安全ルール**: 認証保護および暗号化が完了するまでは、メモ帳にAPIキーやパスワード等の機密情報を貼り付けない。

1. **【最優先①】`antigravity-memo` の保護構成（Google認証 ＋ 自動連携専用認証 ＋ 共有メモ帳暗号化・30分自動削除）**:
   - **① カスタムドメイン化 ＆ `workers.dev` 無効化**:
     - Cloudflare Access（Google認証）を確実に適用し裏口を塞ぐため、`memo.seronworks.dev` 等のカスタムドメインを割り当て、`wrangler.json` で `workers_dev: false` に設定する。
   - **② ブラウザ / 管理画面アクセス（Cloudflare Access Google認証）**:
     - Cloudflare Zero Trust（Access）にて、本人のGoogleアカウントのみ許可するポリシーを設定。ブラウザからはGoogleログインのみで全機能を利用可能（毎回のトークン手入力も不要）。
   - **③ 自動連携アクセス（MCPサーバー / `server.py` / `antigravity_memo_proposer.py`）**:
     - `/api/memos` への自動連携がGoogleログイン画面（302）で止まらないよう、**Cloudflare Access の Service Token（`CF-Access-Client-Id` / `CF-Access-Client-Secret`）または Worker 側の専用APIトークン検証（`Authorization: Bearer <MEMO_AUTH_TOKEN>`）** を用意し、Oracle側の環境変数に設定する。
   - **④ 共有メモ帳（`shared-pad`）の端末側暗号化（AES-256-GCM）・30分自動削除の統合**:
     - Google認証の内側で、さらに共有メモ帳の本文・画像を Web Crypto API（`AES-256-GCM`）で端末側暗号化し、最終更新から30分で自動削除（KV TTL ＋ Worker内期限判定 ＋ Tombstoneによるゾンビ復活防止）する設計（詳細は `execution_logs/2026-10-26_shared_pad_e2ee_autodelete_design.md`）を統合実装する。

2. **【最優先②】`seesaw-portfolio`（ポートフォリオ＆家計簿）の保護構成（Google認証 ＋ 自動連携専用認証）**:
   - **① ブラウザ / 管理画面アクセス（Cloudflare Access Google認証）**:
     - `seesaw.seronworks.dev`（既に `workers_dev = false` 設定済み）に対して Cloudflare Access（本人のGoogleアカウント認証）を設定。
   - **② 自動連携アクセス（GAS `gmail_shopping_sync.js` / iPhoneショートカット）**:
     - 自動連携用エンドポイント（`/api/kakeibo/shopping-sync`, `/api/kakeibo/rakuten-card/parse-email`, `/api/kakeibo/amazon-orders/parse-email`）には、Service Token または Worker側の専用シークレットトークン（`X-Webhook-Token` 等）による専用認証を設定し、自動取込を止めずに保護する。
   - **③ Workers 内部での多層防御**:
     - 万が一のAccess設定ミスに備え、Workerコード（`src/index.js`, `src/kakeibo.js`）側でも Access JWT（`Cf-Access-Jwt-Assertion`）または専用トークンの存在を確認する。

3. **`n8n Webhook` の保護構成**:
   - アクティブな4つの Webhook ノード（`korean-news-crawler`, `movie-collect-x9k2`, `person-db`, `korean-lyrics-app`）の `Authentication` を **`Header Auth`**（`X-N8N-Webhook-Secret`）に変更。
   - `Agents_in_oracle`（ローカル呼出）および `id_osiete`（`n8n-webhook.seronworks.dev` 経由）に同ヘッダーを設定。

---

## 3. Gemini APIキーの `localStorage` 保存リスクと移行方法

- **現状**: `seesaw-portfolio/src/kakeibo.js`（L4582）で `localStorage.setItem('gemini_api_key', ...)` に保存し、`X-Gemini-Key` ヘッダーで送信。Workers側（L242, L585）は `const apiKey = clientKey || (env && env.GEMINI_API_KEY);` として既にサーバー側環境変数フォールバックに対応済み。
- **リスク**: XSS発生時や悪意ある拡張機能による `localStorage` からの生キー抜き取りリスク、および端末内平文残存リスク。
- **移行順序の重要原則**:
  - **必ず Phase 2（`seesaw-portfolio` のAPI認証保護）を完了させた後に、Workers Secret へ `GEMINI_API_KEY` を登録する**（無認証のままサーバー側にキーを置くと、第三者にAPIクォータをタダ乗り消費されるため）。
  - その後、フロントエンドの `localStorage` 保存処理を削除し、`localStorage.removeItem('gemini_api_key')` で端末内残存キーを自動消去する。

---

## 4. 修正順序（確定5段階）・第1段階の具体手順・復旧手順

> 📌 **実装前の重要補強ルール（2026-10-26 18:55 追記）**:
> 1. **認証を設定する順序（連携断絶の防止）**: Cloudflare Access や Worker の強制ブロックを有効にする**前に**、Oracle・MCP・GAS 等の自動連携側が使う認証経路（ヘッダー送信等）を先に準備・反映する。
> 2. **共有メモ帳の30分削除（サーバー側での厳密な強制）**: 30分後に画面から消えるだけでなく、**サーバー（Worker）側で有効期限（`expiresAt`）を判定し、期限切れデータの再取得（`GET`）および古い端末からの再保存（`POST`）もサーバー側で拒否（`409`/`410`）する設計**とする。
> 3. **現状認識**: 計画書の作成・プッシュ時点ではまだ公開APIのリスクは残っており、また「既存動作や操作感の維持」は実装後の実機動作確認で初めて検証されるものであるため、検証前に断定しない。

### 確定した全体着手順序（まず第三者アクセス遮断を最優先）
1. **第1段階**: `antigravity-memo` の公開API保護
2. **第2段階**: `seesaw-portfolio` の公開API保護（＋Gemini APIキーのサーバー側移行）
3. **第3段階**: `n8n Webhook` の認証保護
4. **第4段階**: 共有メモ帳（`shared-pad`）の端末側暗号化（AES-256-GCM）と30分自動削除（サーバー側期限判定・再保存拒否を含む）
5. **第5段階**: 全端末・全連携の動作確認

---

### 🛠️ 第1段階：`antigravity-memo` 公開API保護の具体実装手順（8大必須要件反映・Fail-Closed確定版）

> **[2026-10-26 19:15 改訂]** ユーザーからの8つのセキュリティ要件指摘を受け、以下の方針へ厳格化・修正しました。
> 1. **完全 Fail-Closed 化**: `MEMO_API_TOKEN` 未設定時や `AUTH_ENFORCE=false` フラグによる認証スキップは全面禁止。設定不足や認証ヘッダー欠落時は必ず `401 Unauthorized` で拒否する。
> 2. **Cloudflare Access JWT の完全検証**: Worker（`_worker.js`）で `Cf-Access-Jwt-Assertion`（または `CF_Authorization` Cookie）を検証する際、`alg === 'RS256'`・`kid`・JWKS公開鍵（`${iss}/cdn-cgi/access/certs`）による暗号署名検証・有効期限（`exp` / `nbf`）・`iss`（Issuer）・`aud`（Audience）のすべてを検証する。
> 3. **ブラウザへの共通APIトークン保存禁止**: ブラウザ側（`app.js`, `shared-pad.js` の `localStorage` 等）には共通APIトークンを一切保存しない。ブラウザは **Cloudflare Access（Google認証）**、自動連携（Oracle / MCP）は **専用認証（`MEMO_API_TOKEN` / Service Token）** を基本とする。
> 4. **ロールバック時の認証維持**: ロールバック時も無認証状態へ戻す手順（シークレット削除や認証解除）は採用せず、認証保護を維持したまま復旧・フォールバックする手順とする。
> 5. **`workers.dev` 公開経路の確実な遮断**: `wrangler.json` に `"workers_dev": false` を設定するとともに、`_worker.js` でも `*.workers.dev` ホスト名への直接アクセスを `403 Forbidden` で遮断し、カスタムドメイン側の Cloudflare Access 認証を強制する。
> 6. **既存データの完全保持**: 既存のメモ・画像・KVデータは一切削除しない。
> 7. **既存連携の維持**: 高速同期、MCP（`antigravity-memo`）、Oracle連携（`server.py`, `scripts/antigravity_memo_proposer.py`）を維持する。
> 8. **本番デプロイ前の自動単体テスト**: デプロイ前に単体テスト（`node --test tests/shared-pad.cjs`）で「未設定環境・無認証・不正トークン・期限切れ/不正署名JWT・`workers.dev` 経由がすべて拒否（`401`/`403`）され、正規の通信のみが許可（`200`）されること」を実証する。

#### Step 1-1: 事前バックアップと認証トークンのローカル準備（完了 ✅）
1. `antigravity-memo` の現在コミット（`a8cefac`）を記録し、現在の Cloudflare KV データ（`memos`, `shared_pad`, `custom_apps`）を Oracle 内の非公開バックアップディレクトリ `/home/ubuntu/CascadeProjects/Agents_in_oracle/backups/memo_kv_backup_20261026/`（権限 `0600`、`.gitignore` 登録済み）へ読み取り専用退避。
2. 64文字の暗号学的乱数シークレット `memo_api_token` を生成し、`/home/ubuntu/.config/antigravity-memo/auth.json`（ディレクトリ権限 `0700`、ファイル権限 `0600`）へ保存（チャットやログへの平文出力は一切なし）。

#### Step 1-2: 自動連携側（呼び出し元3箇所）への認証ヘッダー先行追加（完了 ✅）
`~/.config/antigravity-memo/auth.json`（または環境変数 `MEMO_API_URL`, `MEMO_API_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`）を読み込み、リクエスト時に `Authorization: Bearer <MEMO_API_TOKEN>`、`X-Memo-Token`、および設定時は `CF-Access-Client-Id` / `CF-Access-Client-Secret` を自動付与するよう以下の3ファイルをローカル更新：
1. `/home/ubuntu/CascadeProjects/Agents_in_oracle/scripts/antigravity_memo_proposer.py`（`fetch_memos`, `save_memos`）
2. `/home/ubuntu/CascadeProjects/Agents_in_oracle/server.py`（`get_latest_memo`）
3. `/home/ubuntu/CascadeProjects/antigravity-memo/mcp-server/index.mjs`（`fetchMemos`, `saveMemos`）

#### Step 1-3: Worker側（`_worker.js` / `wrangler.json`）の Fail-Closed 実装 ＆ 単体テスト（完了 ✅）
1. `antigravity-memo/wrangler.json` に `"workers_dev": false` を追加。
2. `antigravity-memo/_worker.js` に以下を実装（ブラウザ側の `app.js`, `shared-pad.js` は変更せず、ブラウザへのトークン保存は一切行わない）：
   - `url.hostname.endsWith('.workers.dev')` のリクエストを即座に `403 Forbidden` で遮断。
   - `/api/memos`, `/api/shared-pad`, `/api/apps` の全ルートに `requireApiAuth(request, env)` を適用。
   - **経路1（自動連携用トークン検証）**: `Authorization: Bearer <token>` または `X-Memo-Token` を `env.MEMO_API_TOKEN`（16文字以上必須）と定数時間比較（`timingSafeEqualStrings`）で検証。
   - **経路2（Cloudflare Access JWT 完全検証）**: `Cf-Access-Jwt-Assertion` ヘッダー（または `CF_Authorization` Cookie）の JWT について、`alg === 'RS256'`、`kid`、`iss`（`env.CF_ACCESS_TEAM_DOMAIN` と完全一致）、`aud`（`env.CF_ACCESS_AUD` に含まれること）、有効期限（`exp` / `nbf`）、および `${iss}/cdn-cgi/access/certs` の JWKS RSA公開鍵による `RSASSA-PKCS1-v1_5` SHA-256 暗号署名を検証。
   - いずれも成立しない場合（環境変数未設定時を含む）は常に `401 Unauthorized` を返す **完全 Fail-Closed** 動作。
3. `antigravity-memo/tests/shared-pad.cjs` に単体テストを追加し、`node --test tests/shared-pad.cjs` で全8テストスイート合格を確認：
   - 未設定 `env`（`AUTH_ENFORCE: 'false'` 指定時を含む）・ヘッダーなし・不正トークンが全API（`/api/shared-pad`, `/api/memos`, `/api/apps`）で `401` になること
   - `*.workers.dev` ホスト名が有効トークン付きでも `403` で遮断されること
   - Cloudflare Access JWT の正常署名（ヘッダーおよびCookie）が `200` となり、`exp` 期限切れ・未来の `nbf`・不正 `iss`・不正 `aud`・別鍵による不正署名がすべて `401` で拒否されること
   - 既存の共有メモ帳の往復同期・画像検証・サイズ制限・リビジョン競合（`409`）・オフラインキャッシュテストがすべて通ること

#### Step 1-4: カスタムドメイン・Cloudflare Access 設定・シークレット登録・本番デプロイ（⚠️ ユーザー承認待ち・未実行）
ユーザー承認後、以下の順序で本番反映を行う：
1. **Cloudflare カスタムドメイン ＆ Cloudflare Access 設定**:
   - `antigravity-memo` Worker にカスタムドメイン（例: `memo.seronworks.dev`）を紐付ける。
   - Cloudflare Zero Trust にて該当カスタムドメインの Access Application を作成し、以下のポリシーを設定：
     - **Policy 1（ブラウザ用）**: Action = `Allow`、Include = 本人の Google アカウントメールアドレス。
     - **Policy 2（自動連携用 Service Auth）**: Action = `Service Auth`、Include = Oracle/MCP 用 Service Token（発行した `CF-Access-Client-Id` と `CF-Access-Client-Secret`、および更新後の `memo_api_url` を `~/.config/antigravity-memo/auth.json` に追記）。
2. **Worker シークレット・環境変数の登録**:
   - `npx wrangler secret put MEMO_API_TOKEN`（`~/.config/antigravity-memo/auth.json` のトークンを登録）
   - `CF_ACCESS_TEAM_DOMAIN`（例: `https://<team>.cloudflareaccess.com`）および `CF_ACCESS_AUD`（Access Application の AUD タグ）を登録。
3. **Worker デプロイ ＆ `workers.dev` 無効化反映**:
   - `npx wrangler deploy`（または承認後の `git push`）により、`workers_dev: false` と Fail-Closed 版 `_worker.js` を本番反映。

#### Step 1-5: 第1段階の本番動作確認方法（承認・デプロイ後に実施）
1. **`workers.dev` 遮断確認**: `curl -i https://antigravity-memo.shinya4869ari.workers.dev/api/memos` が遮断（`403` または DNS/ルーティング無効化）されていることを確認。
2. **カスタムドメインの無認証遮断確認**: 認証ヘッダーなしの `curl -i https://<カスタムドメイン>/api/memos`（および `/api/shared-pad`, `/api/apps`）が Cloudflare Access（`302`/`403`）および Worker（`401`）により拒否されることを確認。
3. **自動連携確認**: Oracle 上で MCP（`list_memos`）および `antigravity_memo_proposer.py` が正規ヘッダーを用いて **`200 OK`** で正常動作することを確認。
4. **ブラウザ実機確認**: PC・スマホ・iPad のブラウザから Google ログイン経由でメモ一覧表示・保存・共有メモ帳の同期が動作することを確認。

#### 🔄 第1段階のロールバック（復旧）手順（認証保護を絶対に解除しない安全復旧）
> ⚠️ **厳守**: どのような障害発生時であっても、**認証保護の解除（シークレット削除・無認証コードへの切り戻し・Access ポリシーの全開放・`workers.dev` の再開放）は絶対に行わない**。

1. **自動連携（MCP / Oracle）の通信エラー発生時（即時ローカルキャッシュ縮退＋認証情報の再同期）**:
   - `mcp-server/index.mjs`、`server.py`、`antigravity_memo_proposer.py` はすべて API 通信失敗時にローカルキャッシュ（`memos_local_cache.json`）へ自動フォールバックする実装となっているため、Oracle 側の業務処理は停止しない。
   - 認証保護を維持したまま、`~/.config/antigravity-memo/auth.json` の `memo_api_token` / `CF-Access-Client-Id` / `CF-Access-Client-Secret` と Cloudflare 側の設定値の不一致を照合・再登録して復旧する。
2. **Worker コード更新に起因する不具合発生時（認証維持のまま直前安定版＋Access保護で復旧）**:
   - Cloudflare Access（カスタムドメイン保護＋`workers.dev` 無効化）を**有効に維持したまま**、Worker のアプリケーションロジックのみを修正（または Cloudflare Access 配下でのみ動作する検証済みリビジョンへ `wrangler rollback`）し、公開無認証状態を作らずに復旧する。
3. **KV データ不整合発生時**:
   - Step 1-1 で退避した `/home/ubuntu/CascadeProjects/Agents_in_oracle/backups/memo_kv_backup_20261026/`（権限 `0600`）から KV データを復元する。
