# Antigravity Memo MCP Server

**Antigravity Mission Hub** のメモ・タスクを AI エージェント（Hermes / Antigravity / Claude Code / Cursor等）から直接読み書き・操作するための Model Context Protocol (MCP) サーバーです。

---

## 🌟 特徴

- **スマホ（PWA） ⇄ AI 完全直結**: スマホから保存したメモ（Cloudflare KV）を、AIが直接読み取って自律調査・作業を実行。
- **ゼロ依存（Zero Dependencies）**: Node.js 18+ の標準機能（stdio JSON-RPC 2.0 / fetch API）のみで動作。`npm install` による脆弱性や環境汚染のリスクがゼロ。
- **フォールバック保証**: Cloudflare KV URL が未設定の場合でも、ローカルキャッシュや `MEMOS.md` と連動して安全に動作。

---

## 🛠️ 提供される MCP ツール一覧

| ツール名 | 説明 | 主な引数 |
| :--- | :--- | :--- |
| `list_memos` | メモ・タスク一覧を取得 | `patrol_only` (bool: Hermes巡回ONのみ), `status` (string), `category` (string) |
| `get_memo` | 指定IDのメモの詳細を取得 | `id` (string: メモID) |
| `create_memo` | 新規メモを作成・アプリへ追加 | `title`, `content`, `category`, `priority`, `status`, `hermes_patrol`, `hermes_frequency` |
| `update_memo` | メモの更新・ステータス変更・調査結果追記 | `id`, `status`, `content_append` (追記テキスト), `content`, `hermes_patrol` |

---

## 🚀 導入・設定手順

### 1. Hermes（またはClaude Code / Cursor）への登録
MCP クライアントの設定ファイル（例: `~/.config/hermes/config.yaml` または `mcp_config.json`）に以下を追加します：

```json
{
  "mcpServers": {
    "antigravity-memo": {
      "command": "node",
      "args": ["/home/ubuntu/CascadeProjects/antigravity-memo/mcp-server/index.mjs"],
      "env": {
        "MEMO_API_URL": "https://<YOUR-PAGES-DOMAIN>/api/memos"
      }
    }
  }
}
```

※ `MEMO_API_URL` に Cloudflare Pages にデプロイされたアプリのエンドポイント（例: `https://antigravity-memo.pages.dev/api/memos`）を指定すると、スマホで保存した最新のメモと即座に同期します。

### 2. Antigravity IDE への登録
Antigravity IDE の MCP 設定（`mcp_config.json`）に追加することで、Antigravity 自身も本ツールを使ってアプリ内のタスクを自律管理できるようになります。

---

## 🧪 単体テスト・動作確認

コマンドラインから stdio 経由で直接テストできます：

```bash
# ツール一覧取得テスト
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node index.mjs

# メモ一覧取得テスト
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_memos","arguments":{}}}' | node index.mjs
```
