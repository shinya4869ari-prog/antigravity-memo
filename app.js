/**
 * Antigravity Mission Hub - Core Application Logic
 * Supports: LocalStorage, Drag & Drop, Markdown Prompt Generation, Cloudflare Ready
 */

// Initial Sample Data & Actionable Roadmap (Next Steps)
const INITIAL_MEMOS = [
  {
    id: 'memo-next-1',
    category: 'task',
    title: 'Cloudflare Pages と GitHub リポジトリの自動デプロイ連携',
    description: 'Cloudflareダッシュボードで「Pages」>「Gitに接続」を選び、今回作成した antigravity-memo リポジトリを紐付けて、pushするたびに世界中に自動更新されるように設定する。',
    priority: 'high',
    status: 'todo',
    scope: 'Cloudflare Pages ダッシュボード',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'memo-next-2',
    category: 'fix',
    title: 'スマホ実機でのタッチ操作とモーダル表示の最適化',
    description: 'Cloudflare Pagesで公開されたURLをスマホ実機で開き、カードのタップやプロンプトコピーボタンの押しやすさ、モーダルのスクロール挙動を確認・微調整する。',
    priority: 'high',
    status: 'todo',
    scope: 'style.css / レスポンシブ',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString()
  },
  {
    id: 'memo-next-3',
    category: 'task',
    title: '開発ロードマップ (TODO.md) の作成と進捗管理',
    description: 'Antigravityと一緒に次に進めるべきタスク、今後実装したい機能（KV同期、PWA化、音声入力）を整理してプロジェクト内に保存・管理する。',
    priority: 'med',
    status: 'in_progress',
    scope: 'TODO.md, README.md',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'memo-next-4',
    category: 'idea',
    title: 'Cloudflare Workers KV と連携した複数端末リアルタイム同期',
    description: '現在はLocalStorageに保存されているデータを、CloudflareのWorkers KV または D1 と同期させ、外出先のスマホでメモした内容がPC画面にも自動反映されるようにする。',
    priority: 'med',
    status: 'backlog',
    scope: '_worker.js / API連携',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: 'memo-next-5',
    category: 'idea',
    title: 'PWA (Progressive Web Apps) 対応でスマホのホーム画面からアプリ起動',
    description: 'manifest.json とアプリアイコンを追加し、スマホの「ホーム画面に追加」から本物のネイティブアプリ感覚でワンタップ起動できるようにする。',
    priority: 'med',
    status: 'backlog',
    scope: 'manifest.json, service-worker',
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    updatedAt: new Date(Date.now() - 10800000).toISOString()
  },
  {
    id: 'memo-next-6',
    category: 'idea',
    title: '音声入力機能（Web Speech API）によるハンズフリーメモ追加',
    description: '外出先やキーボードを打てない時でも、マイクボタンを押して喋るだけでアイデアや訂正要望を自動テキスト化してメモカードに登録できるようにする。',
    priority: 'low',
    status: 'backlog',
    scope: 'app.js, index.html',
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    updatedAt: new Date(Date.now() - 14400000).toISOString()
  },
  {
    id: 'memo-next-7',
    category: 'rule',
    title: 'UIデザインの指針: Cloudflareオレンジとフューチャリスティックなダーク調を維持',
    description: '今後の機能追加時も、Cloudflareのアクセントオレンジ（#f38020）とAntigravityのサイバーダーク背景、滑らかな角丸とガラスモーフィズムを基調とすること。Vanilla CSSで軽量かつ堅牢に完結させる。',
    priority: 'high',
    status: 'done',
    scope: 'プロジェクト全体 / デザインルール',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'memo-next-8',
    category: 'idea',
    title: '他アプリ（ポートフォリオ・学習アプリ）へのKV同期横展開',
    description: 'このアプリでCloudflare KV同期の仕組みを確立後、運用中の他アプリ（seesaw-portfolio、korean-learnerなど）にも必要に応じてKV同期を横展開し、スマホ・PC間で設定や履歴を共有できるようにする。',
    priority: 'low',
    status: 'backlog',
    scope: 'Cloudflare Workers KV / 横展開',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Application State
let memos = [];
let activeCategoryFilter = 'all';
let activePriorityFilter = 'all';
let searchQuery = '';
let currentView = 'kanban'; // 'kanban' | 'list'

const CATEGORY_MAP = {
  fix: { label: '訂正・修正', icon: '🔧', color: 'var(--cat-fix)', badgeClass: 'badge-fix' },
  idea: { label: '構想・アイデア', icon: '💡', color: 'var(--cat-idea)', badgeClass: 'badge-idea' },
  task: { label: '指示・タスク', icon: '📋', color: 'var(--cat-task)', badgeClass: 'badge-task' },
  rule: { label: 'ルール・前提', icon: '⚙️', color: 'var(--cat-rule)', badgeClass: 'badge-rule' }
};

const PRIORITY_MAP = {
  high: { label: '高', icon: '🔥', badgeClass: 'badge-priority-high' },
  med: { label: '中', icon: '⚡', badgeClass: 'badge-priority-med' },
  low: { label: '低', icon: '☕', badgeClass: 'badge-priority-low' }
};

const STATUS_MAP = {
  backlog: { label: 'アイデアスプール (Backlog)', icon: '📌' },
  todo: { label: '指示待ち (Todo)', icon: '⏳' },
  in_progress: { label: '作業中 (In Progress)', icon: '🚀' },
  done: { label: '完了 (Done)', icon: '✅' }
};

// DOM Elements
const kanbanView = document.getElementById('kanban-view');
const listView = document.getElementById('list-view');
const viewKanbanBtn = document.getElementById('view-kanban-btn');
const viewListBtn = document.getElementById('view-list-btn');

const searchInput = document.getElementById('search-input');
const filterCategorySelect = document.getElementById('filter-category');
const filterPrioritySelect = document.getElementById('filter-priority');

// Modals
const modalMemo = document.getElementById('modal-memo');
const formMemo = document.getElementById('form-memo');
const modalMemoTitle = document.getElementById('modal-memo-title');
const inputMemoId = document.getElementById('input-memo-id');
const inputMemoTitle = document.getElementById('input-memo-title');
const inputMemoDesc = document.getElementById('input-memo-desc');
const inputMemoPriority = document.getElementById('input-memo-priority');
const inputMemoStatus = document.getElementById('input-memo-status');
const inputMemoScope = document.getElementById('input-memo-scope');

const modalPrompt = document.getElementById('modal-prompt');
const promptOutputBox = document.getElementById('prompt-output-box');
const modalGuide = document.getElementById('modal-guide');
const modalData = document.getElementById('modal-data');

// Storage Management
function loadMemos() {
  const saved = localStorage.getItem('agy_mission_memos');
  if (saved) {
    try {
      memos = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse saved memos', e);
      memos = [...INITIAL_MEMOS];
    }
  } else {
    memos = [...INITIAL_MEMOS];
    saveMemos();
  }
}

function saveMemos() {
  localStorage.setItem('agy_mission_memos', JSON.stringify(memos));
  updateStats();
  render();
}

// Toast System
function showToast(message, icon = '✨') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Utility: HTML escape
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format relative date
function formatDate(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'たった今';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Stats Calculation
function updateStats() {
  const total = memos.length;
  const countFix = memos.filter(m => m.category === 'fix').length;
  const countIdea = memos.filter(m => m.category === 'idea').length;
  const countTask = memos.filter(m => m.category === 'task').length;
  const countRule = memos.filter(m => m.category === 'rule').length;

  document.getElementById('count-all').textContent = total;
  document.getElementById('count-fix').textContent = countFix;
  document.getElementById('count-idea').textContent = countIdea;
  document.getElementById('count-task').textContent = countTask;
  document.getElementById('count-rule').textContent = countRule;

  const countBacklog = memos.filter(m => m.status === 'backlog').length;
  const countTodo = memos.filter(m => m.status === 'todo').length;
  const countInProgress = memos.filter(m => m.status === 'in_progress').length;
  const countDone = memos.filter(m => m.status === 'done').length;

  document.getElementById('badge-count-backlog').textContent = countBacklog;
  document.getElementById('badge-count-todo').textContent = countTodo;
  document.getElementById('badge-count-in_progress').textContent = countInProgress;
  document.getElementById('badge-count-done').textContent = countDone;
}

// Filter Memos
function getFilteredMemos() {
  return memos.filter(memo => {
    // Category filter
    if (activeCategoryFilter !== 'all' && memo.category !== activeCategoryFilter) {
      return false;
    }
    // Priority filter
    if (activePriorityFilter !== 'all' && memo.priority !== activePriorityFilter) {
      return false;
    }
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inTitle = (memo.title || '').toLowerCase().includes(q);
      const inDesc = (memo.description || '').toLowerCase().includes(q);
      const inScope = (memo.scope || '').toLowerCase().includes(q);
      if (!inTitle && !inDesc && !inScope) {
        return false;
      }
    }
    return true;
  });
}

// Render Functions
function render() {
  const filtered = getFilteredMemos();

  if (currentView === 'kanban') {
    renderKanban(filtered);
  } else {
    renderList(filtered);
  }
}

function renderKanban(filteredMemos) {
  const columns = {
    backlog: document.getElementById('cards-backlog'),
    todo: document.getElementById('cards-todo'),
    in_progress: document.getElementById('cards-in_progress'),
    done: document.getElementById('cards-done')
  };

  // Clear existing
  Object.values(columns).forEach(col => (col.innerHTML = ''));

  filteredMemos.forEach(memo => {
    const card = createCardElement(memo);
    if (columns[memo.status]) {
      columns[memo.status].appendChild(card);
    }
  });

  // Empty states for columns
  Object.keys(columns).forEach(statusKey => {
    const col = columns[statusKey];
    if (col.children.length === 0) {
      col.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">📭</span>
          <p style="font-size: 0.8rem;">メモはありません</p>
        </div>
      `;
    }
  });
}

function createCardElement(memo) {
  const cat = CATEGORY_MAP[memo.category] || CATEGORY_MAP.task;
  const pri = PRIORITY_MAP[memo.priority] || PRIORITY_MAP.med;

  const card = document.createElement('div');
  card.className = 'memo-card';
  card.setAttribute('draggable', 'true');
  card.setAttribute('data-id', memo.id);
  card.style.setProperty('--card-accent', cat.color);

  // Drag events
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);

  card.innerHTML = `
    <div class="card-top">
      <div class="card-badges">
        <span class="badge ${cat.badgeClass}">
          ${cat.icon} ${cat.label}
        </span>
        <span class="badge ${pri.badgeClass}">
          ${pri.icon} ${pri.label}
        </span>
      </div>
      <button class="btn-card-action prompt-copy" title="Antigravity用指示をコピー" onclick="copySingleMemoPrompt('${memo.id}', event)">
        ⚡
      </button>
    </div>

    <div class="card-title">${escapeHtml(memo.title)}</div>
    ${memo.description ? `<div class="card-desc">${escapeHtml(memo.description)}</div>` : ''}
    ${memo.scope ? `<span class="card-scope">🎯 ${escapeHtml(memo.scope)}</span>` : ''}

    <div class="card-footer">
      <span class="card-meta">${formatDate(memo.createdAt)}</span>
      <div class="card-actions">
        <button class="btn-card-action" title="編集" onclick="openEditMemoModal('${memo.id}', event)">✏️</button>
        <button class="btn-card-action" title="削除" onclick="deleteMemo('${memo.id}', event)">🗑️</button>
      </div>
    </div>
  `;

  // Click card to edit
  card.addEventListener('click', (e) => {
    if (!e.target.closest('button')) {
      openEditMemoModal(memo.id);
    }
  });

  return card;
}

function renderList(filteredMemos) {
  listView.innerHTML = '';

  if (filteredMemos.length === 0) {
    listView.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <p>条件に一致するメモが見つかりませんでした</p>
      </div>
    `;
    return;
  }

  filteredMemos.forEach(memo => {
    const cat = CATEGORY_MAP[memo.category] || CATEGORY_MAP.task;
    const pri = PRIORITY_MAP[memo.priority] || PRIORITY_MAP.med;
    const stat = STATUS_MAP[memo.status] || STATUS_MAP.todo;

    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-left">
        <span class="badge ${cat.badgeClass}">${cat.icon} ${cat.label}</span>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(memo.title)}</div>
          <div class="list-item-desc">${escapeHtml(memo.description || '詳細なし')}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="badge ${pri.badgeClass}">${pri.icon} ${pri.label}</span>
        <span class="list-item-status-pill">${stat.icon} ${stat.label}</span>
        <button class="btn-card-action prompt-copy" title="Antigravity用指示をコピー" onclick="copySingleMemoPrompt('${memo.id}', event)">⚡</button>
        <button class="btn-card-action" title="編集" onclick="openEditMemoModal('${memo.id}', event)">✏️</button>
        <button class="btn-card-action" title="削除" onclick="deleteMemo('${memo.id}', event)">🗑️</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        openEditMemoModal(memo.id);
      }
    });

    listView.appendChild(item);
  });
}

// Drag and Drop Logic
let draggedMemoId = null;

function handleDragStart(e) {
  draggedMemoId = this.getAttribute('data-id');
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  draggedMemoId = null;
}

// Setup Column Drag & Drop listeners
document.querySelectorAll('.kanban-column').forEach(column => {
  column.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    column.classList.add('drag-over');
  });

  column.addEventListener('dragleave', () => {
    column.classList.remove('drag-over');
  });

  column.addEventListener('drop', e => {
    e.preventDefault();
    column.classList.remove('drag-over');
    const targetStatus = column.getAttribute('data-status');
    if (draggedMemoId && targetStatus) {
      updateMemoStatus(draggedMemoId, targetStatus);
    }
  });
});

function updateMemoStatus(id, newStatus) {
  const memo = memos.find(m => m.id === id);
  if (memo && memo.status !== newStatus) {
    memo.status = newStatus;
    memo.updatedAt = new Date().toISOString();
    saveMemos();
    const statName = STATUS_MAP[newStatus]?.label || newStatus;
    showToast(`「${memo.title}」を ${statName} に移動しました`, '🔄');
  }
}

// Antigravity Prompt Generator Logic
function generateSinglePrompt(memo) {
  const cat = CATEGORY_MAP[memo.category] || CATEGORY_MAP.task;
  const pri = PRIORITY_MAP[memo.priority] || PRIORITY_MAP.med;

  let prompt = `## 【Antigravityへの依頼】${memo.title}\n\n`;
  prompt += `**区分**: ${cat.icon} ${cat.label} | **優先度**: ${pri.icon} ${pri.label}\n`;
  if (memo.scope) {
    prompt += `**対象ファイル・スコープ**: \`${memo.scope}\`\n`;
  }
  prompt += `\n### 依頼内容・詳細\n`;
  prompt += `${memo.description || '（詳細はタイトルを参照してください）'}\n\n`;
  
  prompt += `### 期待する結果・完了条件\n`;
  prompt += `- [ ] 上記の要望・修正点に沿ってコードや設定を反映してください\n`;
  prompt += `- [ ] 関連するファイルや挙動に不整合がないか確認してください\n`;
  prompt += `- [ ] 完了後に変更箇所と確認結果を簡潔に報告してください\n`;

  return prompt;
}

function copySingleMemoPrompt(id, event) {
  if (event) event.stopPropagation();
  const memo = memos.find(m => m.id === id);
  if (!memo) return;

  const prompt = generateSinglePrompt(memo);
  navigator.clipboard.writeText(prompt).then(() => {
    showToast(`「${memo.title}」のAntigravity用指示をコピーしました！チャットに貼り付けてください`, '⚡');
  }).catch(err => {
    console.error('Copy failed', err);
    showToast('クリップボードへのコピーに失敗しました', '❌');
  });
}

function generateBatchPrompt() {
  const pendingMemos = memos.filter(m => m.status !== 'done');
  if (pendingMemos.length === 0) {
    return `# Antigravity 協働タスク指示\n\n現在、未完了のタスク・指示はありません。すべて完了しています！🎉`;
  }

  let prompt = `# 【Antigravity 協働タスク一覧】未完了タスクまとめ\n\n`;
  prompt += `以下のタスクや訂正要望の対応をお願いします。\n\n`;

  pendingMemos.forEach((memo, index) => {
    const cat = CATEGORY_MAP[memo.category] || CATEGORY_MAP.task;
    const pri = PRIORITY_MAP[memo.priority] || PRIORITY_MAP.med;
    prompt += `### ${index + 1}. [${cat.label}] ${memo.title} (${pri.icon} 優先度: ${pri.label})\n`;
    if (memo.scope) {
      prompt += `- **対象**: \`${memo.scope}\`\n`;
    }
    if (memo.description) {
      prompt += `- **詳細**: ${memo.description}\n`;
    }
    prompt += `\n`;
  });

  prompt += `### 全体への指示\n`;
  prompt += `各タスクを優先度の高い順に着手し、コード修正やドキュメント更新をお願いします。完了したものは順次確認してください。`;

  return prompt;
}

// Modal Handlers
function openNewMemoModal() {
  inputMemoId.value = '';
  formMemo.reset();
  modalMemoTitle.textContent = '新規指示・メモの作成';
  // Default radios
  const fixRadio = formMemo.querySelector('input[value="task"]');
  if (fixRadio) fixRadio.checked = true;
  modalMemo.classList.add('active');
  inputMemoTitle.focus();
}

function openEditMemoModal(id, event) {
  if (event) event.stopPropagation();
  const memo = memos.find(m => m.id === id);
  if (!memo) return;

  inputMemoId.value = memo.id;
  inputMemoTitle.value = memo.title;
  inputMemoDesc.value = memo.description || '';
  inputMemoPriority.value = memo.priority;
  inputMemoStatus.value = memo.status;
  inputMemoScope.value = memo.scope || '';

  const catRadio = formMemo.querySelector(`input[value="${memo.category}"]`);
  if (catRadio) catRadio.checked = true;

  modalMemoTitle.textContent = '指示・メモの編集';
  modalMemo.classList.add('active');
}

function closeMemoModal() {
  modalMemo.classList.remove('active');
}

function deleteMemo(id, event) {
  if (event) event.stopPropagation();
  const memo = memos.find(m => m.id === id);
  if (!memo) return;

  if (confirm(`「${memo.title}」を削除してもよろしいですか？`)) {
    memos = memos.filter(m => m.id !== id);
    saveMemos();
    showToast('メモを削除しました', '🗑️');
  }
}

// Form Submit
formMemo.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = inputMemoId.value;
  const title = inputMemoTitle.value.trim();
  const desc = inputMemoDesc.value.trim();
  const priority = inputMemoPriority.value;
  const status = inputMemoStatus.value;
  const scope = inputMemoScope.value.trim();
  const category = formMemo.querySelector('input[name="memo-category"]:checked')?.value || 'task';

  if (!title) return;

  if (id) {
    // Edit existing
    const memo = memos.find(m => m.id === id);
    if (memo) {
      memo.title = title;
      memo.description = desc;
      memo.priority = priority;
      memo.status = status;
      memo.scope = scope;
      memo.category = category;
      memo.updatedAt = new Date().toISOString();
      showToast('メモを更新しました', '💾');
    }
  } else {
    // New memo
    const newMemo = {
      id: 'memo-' + Date.now(),
      category,
      title,
      description: desc,
      priority,
      status,
      scope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    memos.unshift(newMemo);
    showToast('新しい指示・メモを追加しました', '✨');
  }

  saveMemos();
  closeMemoModal();
});

// Event Listeners: Header Buttons
document.getElementById('btn-new-memo').addEventListener('click', openNewMemoModal);
document.getElementById('btn-close-memo-modal').addEventListener('click', closeMemoModal);
document.getElementById('btn-cancel-memo').addEventListener('click', closeMemoModal);

// Batch Prompt Modal
document.getElementById('btn-gen-batch-prompt').addEventListener('click', () => {
  const prompt = generateBatchPrompt();
  promptOutputBox.textContent = prompt;
  modalPrompt.classList.add('active');
});

document.getElementById('btn-close-prompt-modal').addEventListener('click', () => modalPrompt.classList.remove('active'));
document.getElementById('btn-close-prompt-btn').addEventListener('click', () => modalPrompt.classList.remove('active'));

document.getElementById('btn-copy-generated-prompt').addEventListener('click', () => {
  const text = promptOutputBox.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('まとめプロンプトをコピーしました！Antigravityに送信してください', '🚀');
    modalPrompt.classList.remove('active');
  });
});

// Deploy Guide Modal
document.getElementById('btn-deploy-guide').addEventListener('click', () => {
  modalGuide.classList.add('active');
});
document.getElementById('btn-close-guide-modal').addEventListener('click', () => modalGuide.classList.remove('active'));
document.getElementById('btn-close-guide-btn').addEventListener('click', () => modalGuide.classList.remove('active'));

// Data Management Modal
document.getElementById('btn-export-json').addEventListener('click', () => {
  modalData.classList.add('active');
});
document.getElementById('btn-close-data-modal').addEventListener('click', () => modalData.classList.remove('active'));
document.getElementById('btn-close-data-btn').addEventListener('click', () => modalData.classList.remove('active'));

// Export JSON
document.getElementById('btn-download-json').addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(memos, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `antigravity_memos_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('JSONデータをダウンロードしました', '📥');
});

// Import JSON
document.getElementById('input-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (Array.isArray(imported)) {
        memos = imported;
        saveMemos();
        showToast('データを正常にインポートしました', '📥');
        modalData.classList.remove('active');
      } else {
        alert('無効なデータ形式です。');
      }
    } catch (err) {
      alert('JSONの解析に失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// Load Samples
document.getElementById('btn-load-sample').addEventListener('click', () => {
  if (confirm('サンプル指示データを読み込みますか？（既存のメモに追加されます）')) {
    memos = [...INITIAL_MEMOS, ...memos];
    saveMemos();
    showToast('サンプルデータを読み込みました', '✨');
    modalData.classList.remove('active');
  }
});

// Clear All
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (confirm('本当にすべてのメモを消去しますか？この操作は元に戻せません。')) {
    memos = [];
    saveMemos();
    showToast('すべてのメモをクリアしました', '⚠️');
    modalData.classList.remove('active');
  }
});

// View Toggle
viewKanbanBtn.addEventListener('click', () => {
  currentView = 'kanban';
  viewKanbanBtn.classList.add('active');
  viewListBtn.classList.remove('active');
  kanbanView.style.display = 'grid';
  listView.style.display = 'none';
  render();
});

viewListBtn.addEventListener('click', () => {
  currentView = 'list';
  viewListBtn.classList.add('active');
  viewKanbanBtn.classList.remove('active');
  kanbanView.style.display = 'none';
  listView.style.display = 'flex';
  render();
});

// Filter & Search Handlers
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  render();
});

filterCategorySelect.addEventListener('change', (e) => {
  activeCategoryFilter = e.target.value;
  syncStatChips();
  render();
});

filterPrioritySelect.addEventListener('change', (e) => {
  activePriorityFilter = e.target.value;
  render();
});

// Stat Chips Clickable Filter
document.querySelectorAll('.stat-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const filter = chip.getAttribute('data-filter');
    activeCategoryFilter = filter;
    filterCategorySelect.value = filter;
    syncStatChips();
    render();
  });
});

function syncStatChips() {
  document.querySelectorAll('.stat-chip').forEach(chip => {
    if (chip.getAttribute('data-filter') === activeCategoryFilter) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

// Close modals when clicking overlay background
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// Global functions for inline onclick handlers
window.copySingleMemoPrompt = copySingleMemoPrompt;
window.openEditMemoModal = openEditMemoModal;
window.deleteMemo = deleteMemo;

// Initialization
loadMemos();
