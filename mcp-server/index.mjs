#!/usr/bin/env node
/**
 * ============================================================================
 * Antigravity Mission Hub - MCP (Model Context Protocol) Server
 * ============================================================================
 * このMCPサーバーは、AIエージェント（Hermes / Antigravity等）が
 * antigravity-memo（Cloudflare KV / REST API）のメモを直接読み書き・操作するための
 * 標準入出力（stdio）JSON-RPC 2.0 準拠サーバーです。
 * 外部依存関係なし（Zero-dependency / Node 18+ 標準機能のみ）で高速・安全に動作します。
 */

import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ----------------------------------------------------------------------------
// 1. 環境設定 ＆ 定数定義
// ----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cloudflare KV エンドポイント（環境変数 MEMO_API_URL、未指定時はローカルフォールバック）
const MEMO_API_URL = process.env.MEMO_API_URL || '';
// ローカルバックアップ用キャッシュファイル
const LOCAL_CACHE_FILE = path.resolve(__dirname, 'memos_local_cache.json');
// ルートの MEMOS.md のパス
const WORKSPACE_MEMOS_MD = path.resolve(__dirname, '../MEMOS.md');

// ----------------------------------------------------------------------------
// 2. データアクセス層（Cloudflare KV / ローカル同期）
// ----------------------------------------------------------------------------

/**
 * メモ全件を取得する
 * @returns {Promise<Array<object>>} メモ一覧配列
 */
async function fetchMemos() {
  // ① Cloudflare KV API が設定されている場合
  if (MEMO_API_URL) {
    try {
      const res = await fetch(MEMO_API_URL, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) {
            // ローカルキャッシュにも保存しておく
            fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(json, null, 2), 'utf-8');
            return json;
          }
        } catch (e) {
          // JSONパース失敗時はフォールバックへ
        }
      }
    } catch (err) {
      process.stderr.write(`[MCP Server] KV fetch error: ${err.message}\n`);
    }
  }

  // ② ローカルキャッシュが存在する場合
  if (fs.existsSync(LOCAL_CACHE_FILE)) {
    try {
      const content = fs.readFileSync(LOCAL_CACHE_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) return data;
    } catch (e) {
      // パースエラー時は次へ
    }
  }

  // ③ MEMOS.md からパースする場合（初期フォールバック）
  if (fs.existsSync(WORKSPACE_MEMOS_MD)) {
    return parseMemosFromMarkdown(WORKSPACE_MEMOS_MD);
  }

  return [];
}

/**
 * メモ全件を保存・更新する
 * @param {Array<object>} memos 
 * @returns {Promise<boolean>}
 */
async function saveMemos(memos) {
  // ローカルキャッシュに保存
  fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(memos, null, 2), 'utf-8');

  // Cloudflare KV API へ送信
  if (MEMO_API_URL) {
    try {
      const res = await fetch(MEMO_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memos)
      });
      if (!res.ok) {
        process.stderr.write(`[MCP Server] KV save failed with status ${res.status}\n`);
      }
    } catch (err) {
      process.stderr.write(`[MCP Server] KV save error: ${err.message}\n`);
    }
  }

  // MEMOS.md にも同期書き込み（人間＆ローカル参照用）
  try {
    syncToMarkdown(memos, WORKSPACE_MEMOS_MD);
  } catch (err) {
    process.stderr.write(`[MCP Server] Markdown sync error: ${err.message}\n`);
  }

  return true;
}

/**
 * MEMOS.md から簡易パースする関数
 */
function parseMemosFromMarkdown(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const sections = raw.split(/^##\s+/m).slice(1);
    return sections.map((sec, idx) => {
      const lines = sec.trim().split('\n');
      const title = lines[0] ? lines[0].replace(/^【.*?】\s*/, '').trim() : `Memo ${idx + 1}`;
      const content = lines.slice(1).join('\n').trim();
      const isPatrol = sec.includes('巡回中') || sec.includes('自律巡回');
      return {
        id: `memo-${Date.now()}-${idx}`,
        title: lines[0] || '無題',
        content: content,
        category: 'タスク',
        priority: sec.includes('🔥') ? 'high' : 'medium',
        status: sec.includes('✅') ? 'done' : 'pending',
        hermesPatrol: isPatrol,
        hermesFrequency: 'weekly',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
  } catch (e) {
    return [];
  }
}

/**
 * メモ一覧を MEMOS.md 形式に書き戻す関数
 */
function syncToMarkdown(memos, filePath) {
  const lines = ['# Antigravity Mission Hub - 共有メモ一覧\n'];
  for (const m of memos) {
    lines.push(`## ${m.title}`);
    lines.push(`- **ID**: \`${m.id}\``);
    lines.push(`- **カテゴリー**: ${m.category || '一般'} | **優先度**: ${m.priority || 'medium'} | **ステータス**: ${m.status || 'pending'}`);
    if (m.hermesPatrol) {
      lines.push(`- **自律巡回 (Hermes)**: 巡回中 (頻度: ${m.hermesFrequency || 'weekly'})`);
    }
    lines.push(`\n${m.content || ''}\n`);
    lines.push('---\n');
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
}

// ----------------------------------------------------------------------------
// 3. MCP ツール定義 (Tool Definitions)
// ----------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'list_memos',
    description: 'メモ・タスク一覧を取得します。ステータスやHermes自律巡回フラグでフィルタ可能です。',
    inputSchema: {
      type: 'object',
      properties: {
        patrol_only: {
          type: 'boolean',
          description: 'trueにするとHermes自律巡回が有効（hermesPatrol: true）のメモのみを抽出します'
        },
        status: {
          type: 'string',
          description: 'ステータスで絞り込み (pending: 未着手, in-progress: 進行中, done: 完了)'
        },
        category: {
          type: 'string',
          description: 'カテゴリーで絞り込み'
        }
      }
    }
  },
  {
    name: 'get_memo',
    description: '指定したIDのメモの詳細情報を取得します。',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '取得したいメモのID'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'create_memo',
    description: '新しいメモやタスクカードをアプリに作成・登録します。AIによる調査結果や起草タスクの追加に使えます。',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'メモのタイトル（例: 【ブログ】エラー猫のバグ調査報告）'
        },
        content: {
          type: 'string',
          description: 'メモ本文（Markdown形式で記述可能）'
        },
        category: {
          type: 'string',
          description: 'カテゴリー（例: タスク, アイデア, 調査, 議事録）'
        },
        priority: {
          type: 'string',
          description: '優先度 (low, medium, high, urgent)'
        },
        status: {
          type: 'string',
          description: 'ステータス (pending, in-progress, done)'
        },
        hermes_patrol: {
          type: 'boolean',
          description: 'Hermes自律巡回を有効にするかどうか'
        },
        hermes_frequency: {
          type: 'string',
          description: '巡回頻度（weekly, daily, 3days, monthly, once）'
        }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'update_memo',
    description: '既存メモのステータス変更、本文の書き換え、または調査結果の追記を行います。',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '更新対象のメモID'
        },
        status: {
          type: 'string',
          description: '新しいステータス (pending, in-progress, done)'
        },
        content_append: {
          type: 'string',
          description: '本文の末尾に追記するテキスト（調査結果や進捗メモなど）'
        },
        content: {
          type: 'string',
          description: '本文全体を上書きする場合のテキスト'
        },
        hermes_patrol: {
          type: 'boolean',
          description: '巡回フラグの更新 (true / false)'
        }
      },
      required: ['id']
    }
  }
];

// ----------------------------------------------------------------------------
// 4. ツール実行ロジック (Tool Handlers)
// ----------------------------------------------------------------------------
async function handleToolCall(name, args) {
  const memos = await fetchMemos();

  switch (name) {
    case 'list_memos': {
      let filtered = [...memos];
      if (args.patrol_only) {
        filtered = filtered.filter(m => m.hermesPatrol === true);
      }
      if (args.status) {
        filtered = filtered.filter(m => m.status === args.status);
      }
      if (args.category) {
        filtered = filtered.filter(m => m.category === args.category);
      }

      const summary = filtered.map(m => ({
        id: m.id,
        title: m.title,
        category: m.category || '一般',
        priority: m.priority || 'medium',
        status: m.status || 'pending',
        hermesPatrol: !!m.hermesPatrol,
        hermesFrequency: m.hermesFrequency || 'weekly',
        updatedAt: m.updatedAt || m.createdAt
      }));

      return {
        count: summary.length,
        memos: summary
      };
    }

    case 'get_memo': {
      const memo = memos.find(m => m.id === args.id || m.title.includes(args.id));
      if (!memo) {
        throw new Error(`メモが見つかりませんでした (ID: ${args.id})`);
      }
      return memo;
    }

    case 'create_memo': {
      const now = new Date().toISOString();
      const newMemo = {
        id: `memo-${Date.now()}`,
        title: args.title,
        content: args.content,
        category: args.category || 'タスク',
        priority: args.priority || 'medium',
        status: args.status || 'pending',
        hermesPatrol: args.hermes_patrol !== undefined ? args.hermes_patrol : false,
        hermesFrequency: args.hermes_frequency || 'weekly',
        createdAt: now,
        updatedAt: now
      };

      memos.unshift(newMemo);
      await saveMemos(memos);

      return {
        success: true,
        message: `メモを作成しました: 「${newMemo.title}」`,
        createdMemo: newMemo
      };
    }

    case 'update_memo': {
      const idx = memos.findIndex(m => m.id === args.id || m.title.includes(args.id));
      if (idx === -1) {
        throw new Error(`更新対象のメモが見つかりませんでした (ID: ${args.id})`);
      }

      const memo = memos[idx];
      const now = new Date().toISOString();

      if (args.status !== undefined) memo.status = args.status;
      if (args.hermes_patrol !== undefined) memo.hermesPatrol = args.hermes_patrol;
      if (args.content !== undefined) memo.content = args.content;
      if (args.content_append) {
        memo.content = `${memo.content || ''}\n\n### 🤖 AI追記 (${now.slice(0, 16).replace('T', ' ')})\n${args.content_append}`.trim();
      }
      memo.updatedAt = now;

      memos[idx] = memo;
      await saveMemos(memos);

      return {
        success: true,
        message: `メモを更新しました (ID: ${memo.id})`,
        updatedMemo: memo
      };
    }

    default:
      throw new Error(`未対応のツールです: ${name}`);
  }
}

// ----------------------------------------------------------------------------
// 5. JSON-RPC 2.0 / stdio MCP サーバー実装
// ----------------------------------------------------------------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (err) {
    sendJson({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: Invalid JSON' }
    });
    return;
  }

  // 通知（Notification: idなし）の処理
  if (request.id === undefined || request.id === null) {
    if (request.method === 'notifications/initialized') {
      // 初期化完了通知
      return;
    }
    return;
  }

  // リクエストのルーティング
  try {
    switch (request.method) {
      case 'initialize': {
        sendJson({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'antigravity-memo-mcp',
              version: '1.0.0'
            },
            capabilities: {
              tools: {}
            }
          }
        });
        break;
      }

      case 'tools/list': {
        sendJson({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: TOOLS
          }
        });
        break;
      }

      case 'tools/call': {
        const { name, arguments: toolArgs } = request.params || {};
        try {
          const result = await handleToolCall(name, toolArgs || {});
          sendJson({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                }
              ]
            }
          });
        } catch (toolErr) {
          sendJson({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `エラー: ${toolErr.message}`
                }
              ],
              isError: true
            }
          });
        }
        break;
      }

      default: {
        sendJson({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        });
      }
    }
  } catch (err) {
    sendJson({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `Internal error: ${err.message}`
      }
    });
  }
});

function sendJson(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// サーバー起動ログ（stderrに出力してstdoutのJSON-RPCを汚さない）
process.stderr.write('[MCP Server] Antigravity Memo MCP Server started successfully on stdio.\n');
