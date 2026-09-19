# Antigravity Mission Hub (AI協働指示・メモ共有ボード)

Antigravity（AIアシスタント）とユーザーの間で、**「訂正してほしいこと」「新しくやりたいこと」「タスク」「前提ルール」**を整理・共有し、ワンクリックでAIへの最適プロンプトに変換できるWebアプリケーションです。

ご提示いただいた **Cloudflare (Workers & Pages)** に数クリックで完全無料でデプロイできる構成となっています。

---

## 🚀 主な機能

1. **4つのカテゴリーで指示を直感整理**:
   - 🔧 **訂正・バグ修正 (Fix)**: 期待と違った挙動や直してほしい部分
   - 💡 **やりたいこと・構想 (Idea)**: 将来追加したい機能やアイデア
   - 📋 **指示・タスク (Task)**: 今すぐやってほしいリクエスト
   - ⚙️ **ルール・前提指示 (Rule)**: デザインルールやコーディングの制約
2. **⚡ Antigravity用プロンプトのワンクリック生成**:
   - メモカードの `⚡` アイコンを押すだけで、Antigravityが最も理解しやすいMarkdown構造化プロンプト（区分、優先度、対象スコープ、依頼内容、完了チェックリスト）をクリップボードにコピー！
   - 右上の「Antigravity用プロンプト生成」から未完了タスクの一括まとめプロンプトも出力可能。
3. **📊 カンバンボード & リストの切り替え**:
   - `アイデアスプール (Backlog)` / `指示待ち (Todo)` / `作業中 (In Progress)` / `完了 (Done)` の4段階。
   - ドラッグ＆ドロップでステータスをスムーズに変更可能。
4. **🔍 リアルタイム検索 & フィルター**:
   - キーワード検索、カテゴリー別絞り込み、優先度（高・中・低）フィルター。
5. **💾 データ管理・オフライン対応**:
   - ブラウザのLocalStorageに即時自動保存。
   - JSON形式でのエクスポート（バックアップ）とインポートに対応。

---

## 🌐 Cloudflare Workers & Pages へのデプロイ手順

ご提示いただいた **Cloudflare ダッシュボード**（Workers & Pages）から以下の手順ですぐに公開できます。

### 方法1: ブラウザからの直接アップロード (一番おすすめ・5分で完了)
1. Cloudflareのダッシュボードで **「Workers & Pages」** を開きます。
2. **「作成 (Create)」** ボタンを押し、タブから **「Pages」** を選択します。
3. **「アセットを直接アップロード (Direct Upload)」** を選択します。
4. プロジェクト名（例: `antigravity-hub`）を入力して「プロジェクトの作成」を押します。
5. このフォルダの中身（`index.html`, `style.css`, `app.js`, `_worker.js` など）をドラッグ＆ドロップしてアップロードします。
6. **「サイトをデプロイ」** をクリックすると、数秒で `https://antigravity-hub.pages.dev` のような公開URLが発行されます！

### 方法2: ローカルで今すぐ開く
特別なサーバー不要で、`index.html` をお好きなブラウザ（Chrome, Edge等）にドラッグ＆ドロップするだけで今すぐ利用できます。

---

## 📁 ファイル構成

```
antigravity-memo-app/
├── index.html          # メイン画面（セマンティックHTML5 & PWA UI）
├── style.css           # デザインシステム（Cyber Dark × Amber & Emerald PWA）
├── app.js              # アプリロジック、KV同期、音声解析、PWA制御
├── sw.js               # Service Worker（PWAオフラインキャッシュ＆高速起動）
├── manifest.json       # Web App Manifest（アプリアイコン・ショートカット定義）
├── icon-192.png        # PWA標準アプリアイコン (192x192)
├── icon-512.png        # 高解像度アプリアイコン (512x512)
├── apple-touch-icon.png# iOS Safari用アプリアイコン
├── favicon.svg         # 高精細ベクターファビコン
├── _worker.js          # Cloudflare Pages Functions / Workers KV エッジAPI
├── wrangler.json       # Cloudflare デプロイ設定ファイル
├── .assetsignore       # Cloudflare Pages アセット除外設定
├── .gitignore          # Git除外設定
├── TODO.md             # 開発ロードマップ・次やることリスト
└── README.md           # 本ドキュメント
```

---

## 📋 開発ロードマップ (次やること)
今後の機能拡張や改善タスクは [TODO.md](TODO.md) に整理されています。
Cloudflare KVによる端末間リアルタイム同期、PWA完全アプリ化、音声入力×カレンダー連携は完了済みです。

