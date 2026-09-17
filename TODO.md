# Antigravity Mission Hub - 開発ロードマップ＆やることリスト (TODO)

ユーザー様と Antigravity（AI）が次に進めるべきタスク、今後実装すると便利な機能、および運用ステップを優先度順に整理した「次やることリスト」です。

---

## 📌 現在の完了状況 (Phase 1: 基盤構築) ✅
- [x] **基本UI・デザインシステムの構築**
  - Cloudflare Amber（#f38020）× サイバーダークのガラスモーフィズムUI
  - レスポンシブ対応、Google Fonts（Outfit / JetBrains Mono）
- [x] **コア機能の実装**
  - 4つのカテゴリー（訂正・アイデア・タスク・ルール）による指示管理
  - カンバンボード（ドラッグ＆ドロップ対応）＆ リスト表示の切り替え
  - リアルタイム検索 & フィルター機能
  - LocalStorage への自動保存
  - JSONバックアップのエクスポート・インポート
- [x] **⚡ Antigravity 向けプロンプト自動生成機能**
  - 単体メモの構造化プロンプトワンクリックコピー
  - 未完了タスク一括まとめプロンプトの生成
- [x] **Cloudflare & Git 対応**
  - `_worker.js`（Workers / Pages 兼用エッジAPI・静的ファイル配信）
  - `wrangler.json`（最新 Workers CI & Assets 設定）
  - GitHub リポジトリ（`shinya4869ari-prog/antigravity-memo`）への初期プッシュおよびCI設定完了

---

## 🚀 次にやること (Phase 2: Cloudflare への本番公開 & モバイル最適化)
- [x] **Cloudflare と GitHub の連携設定**
  - Cloudflare「Workers & Pages」>「Create application」> GitHubから `antigravity-memo` を選択
  - 自動ビルド・デプロイパイプライン（`npx wrangler deploy`）構築完了
  - **💡【重要メモ】リポジトリが選択一覧に出てこない時の対処法**:
    1. GitHub の [Installed GitHub Apps 設定](https://github.com/settings/installations) を開く
    2. 「Cloudflare Pages」の「Configure」をクリック
    3. 「Repository access」で対象リポジトリ（または「All repositories」）を選択して保存する
  - **💡【重要メモ】`_worker.js` エラー時の対処法**:
    - `Uploading a Pages _worker.js file as an asset` エラーが出た場合、`.assetsignore` ファイルに `_worker.js` を記載して除外する（設定済み）
- [ ] **デプロイ完了確認 & 発行URLのアクセス確認**
  - Cloudflare ダッシュボードで発行された公開URL（`https://antigravity-memo.○○.workers.dev` または `.pages.dev`）を開く
  - メモの追加、ドラッグ＆ドロップ、プロンプトコピーが本番環境で正常動作するか確認
- [ ] **スマートフォンからのアクセス確認**
  - 発行されたURLをスマホのブラウザ（Safari / Chrome）で開く
  - スマホの画面サイズでの操作感・ボタンの押しやすさを確認
- [ ] **スマホのホーム画面に追加 (PWAライクな利用)**
  - スマホの「ホーム画面に追加」を押し、アプリのようにサッと起動できるかテスト

---

## 💡 今後やりたいこと・機能拡張の推理メモ (Phase 3: クラウド同期 & 利便性向上)
- [ ] **Cloudflare Workers KV による端末間リアルタイム同期**
  - 現在はブラウザごとの LocalStorage に保存されているため、Cloudflare KV（無料枠で十分運用可能）を有効化し、スマホでメモした内容がPCの画面にも自動で同期されるようにする
- [ ] **PWA (Progressive Web Apps) 対応**
  - `manifest.json` と Service Worker を追加し、本物のスマホアプリのようにオフラインでも起動可能にする
- [ ] **音声メモ入力機能**
  - スマホやPCで「マイクボタン」を押して喋るだけで、文字起こししてメモカードに追加できる機能（出先のアイデア記録に最適）
- [ ] **プロンプト出力テンプレートのカスタマイズ**
  - Antigravity に投げる指示文のフォーマット（例: 「コード変更重視モード」「設計相談モード」「バグ報告モード」など）を選べるセレクタの追加
- [ ] **メモの完了アーカイブ機能**
  - 「完了 (Done)」になったメモを削除せずに非表示アーカイブできる履歴保存機能

---

## ⚙️ Antigravity への指示方法
このリストにあるタスクに着手したいときは、アプリ上のメモカードにある **`⚡` ボタン** を押してコピーした指示を、そのまま Antigravity のチャットに貼り付けて「これやって！」と送信してください。
Antigravity が自動でタスクの文脈を理解し、実装を進めます。
