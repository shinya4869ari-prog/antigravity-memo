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
    dueDate: new Date(Date.now() + 86400000).toISOString(),
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
  },
  {
    id: 'memo-next-9',
    category: 'idea',
    title: '📸 スクリーンショット・画像添付メモ機能',
    description: '覚えておきたいUI・エラー画面・デザインを画像ごと保存。PCではCtrl+V貼り付け、スマホではカメラ撮影やアルバムから選択。モーダル拡大ビューアー表示対応。',
    priority: 'high',
    status: 'todo',
    scope: '画像添付 / クリップボード / 拡大プレビュー',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'memo-next-10',
    category: 'idea',
    title: '📅 Googleカレンダー連携（ワンクリック予定反映）',
    description: 'メモに予定日時を設定し、ワンタップでスマホやPCのGoogleカレンダー予定作成画面を呼び出して予定登録する機能。OAuth認証不要のURL連携方式。',
    priority: 'high',
    status: 'todo',
    scope: 'Google Calendar URL連携 / 日時設定',
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
const modalMemoContent = document.getElementById('modal-memo-content');
const formMemo = document.getElementById('form-memo');
const modalMemoTitle = document.getElementById('modal-memo-title');
const inputMemoId = document.getElementById('input-memo-id');
const inputMemoTitle = document.getElementById('input-memo-title');
const inputMemoDesc = document.getElementById('input-memo-desc');
const inputMemoPriority = document.getElementById('input-memo-priority');
const inputMemoStatus = document.getElementById('input-memo-status');
const inputMemoScope = document.getElementById('input-memo-scope');
const inputMemoDue = document.getElementById('input-memo-due');
const memoDescPreview = document.getElementById('memo-desc-preview');
const editorCharCount = document.getElementById('editor-char-count');
const editorWorkspace = document.getElementById('editor-workspace');
const btnToggleMemoFullscreen = document.getElementById('btn-toggle-memo-fullscreen');
const fullscreenIcon = document.getElementById('fullscreen-icon');
const btnCopyEditorPrompt = document.getElementById('btn-copy-editor-prompt');

const modalPrompt = document.getElementById('modal-prompt');
const promptOutputBox = document.getElementById('prompt-output-box');
const modalGuide = document.getElementById('modal-guide');
const modalData = document.getElementById('modal-data');

// Voice & Google Calendar Modal Elements
const modalVoice = document.getElementById('modal-voice');
const btnVoiceMemo = document.getElementById('btn-voice-memo');
const btnCloseVoiceModal = document.getElementById('btn-close-voice-modal');
const btnCloseVoiceBtn = document.getElementById('btn-close-voice-btn');
const btnRestartVoice = document.getElementById('btn-restart-voice');
const btnStopVoice = document.getElementById('btn-stop-voice');
const voiceListeningState = document.getElementById('voice-listening-state');
const voiceResultState = document.getElementById('voice-result-state');
const voiceStatusText = document.getElementById('voice-status-text');
const voiceTranscriptBox = document.getElementById('voice-transcript-box');
const voiceResultMessage = document.getElementById('voice-result-message');
const parsedTitleInput = document.getElementById('parsed-title-input');
const parsedDateInput = document.getElementById('parsed-date-input');
const parsedRelativeTag = document.getElementById('parsed-relative-tag');
const btnOpenGoogleCal = document.getElementById('btn-open-google-cal');
const btnSaveVoiceMemo = document.getElementById('btn-save-voice-memo');

// Storage & Cloud Sync Management
const cloudSyncBadge = document.getElementById('cloud-sync-badge');
const cloudSyncText = document.getElementById('cloud-sync-text');

function setCloudStatus(status, text) {
  if (!cloudSyncBadge || !cloudSyncText) return;
  cloudSyncBadge.className = `cloud-badge status-${status}`;
  cloudSyncText.textContent = text;
}

// Utility: Deduplicate memos by id and sort newest first
function deduplicateMemos(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const deduped = list.filter(item => {
    if (!item || !item.id) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  // Always keep newest memos at the very front/top
  return deduped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

// 1. Initial Local Load (Instant rendering, zero waiting)
function loadMemos() {
  const saved = localStorage.getItem('agy_mission_memos');
  if (saved !== null) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        memos = deduplicateMemos(parsed);
      } else {
        memos = [...INITIAL_MEMOS];
      }
    } catch (e) {
      console.error('Failed to parse saved memos', e);
      memos = [...INITIAL_MEMOS];
    }
  } else {
    memos = [...INITIAL_MEMOS];
  }
  localStorage.setItem('agy_mission_memos', JSON.stringify(memos));
  updateStats();
  render();

  // 2. Immediately sync with Cloudflare Workers KV
  fetchMemosFromCloud();
}

// 3. Fetch data from Cloudflare Workers KV
let isSyncing = false;
let localVersion = 0;
let lastLocalSaveTime = 0;

async function fetchMemosFromCloud(quiet = false) {
  if (isSyncing) return;
  // Guard: If user recently modified/deleted memos locally (< 4000ms), don't overwrite with stale cloud data
  if (Date.now() - lastLocalSaveTime < 4000) return;

  const currentVersion = localVersion;
  isSyncing = true;
  if (!quiet) setCloudStatus('syncing', '同期中...');

  try {
    const res = await fetch('/api/memos');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Guard: If local state was mutated while fetch was in-flight, discard stale response
    if (localVersion !== currentVersion) return;
    if (Date.now() - lastLocalSaveTime < 4000) return;

    if (data && data.uninitialized) {
      // KV is bound but empty: seed initial memos to cloud
      setCloudStatus('syncing', '初期同期中...');
      await saveMemosToCloud();
    } else if (Array.isArray(data)) {
      memos = deduplicateMemos(data);
      localStorage.setItem('agy_mission_memos', JSON.stringify(memos));
      updateStats();
      render();
      setCloudStatus('synced', 'Cloud KV 同期済');
    } else if (data && data.mode === 'local') {
      setCloudStatus('local', 'ローカル保存 (KV未接続)');
    }
  } catch (err) {
    console.warn('Cloud sync offline / error:', err);
    setCloudStatus('local', 'ローカル保存 (オフライン)');
  } finally {
    isSyncing = false;
  }
}

// 4. Save data to Cloudflare Workers KV
let cloudSaveTimer = null;
async function saveMemosToCloud() {
  lastLocalSaveTime = Date.now();
  setCloudStatus('syncing', 'クラウド保存中...');
  try {
    const res = await fetch('/api/memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memos)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();

    if (result.mode === 'kv') {
      setCloudStatus('synced', 'Cloud KV 同期済');
    } else {
      setCloudStatus('local', 'ローカル保存 (KV未接続)');
    }
  } catch (err) {
    console.warn('Failed to save to cloud:', err);
    setCloudStatus('local', 'ローカル保存 (オフライン)');
  }
}

// Main save dispatcher (local first + cloud upload)
function saveMemos(immediate = false) {
  localVersion++;
  lastLocalSaveTime = Date.now();
  memos = deduplicateMemos(memos);
  localStorage.setItem('agy_mission_memos', JSON.stringify(memos));
  updateStats();
  render();

  if (cloudSaveTimer) {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
  }

  if (immediate) {
    saveMemosToCloud();
  } else {
    cloudSaveTimer = setTimeout(() => {
      saveMemosToCloud();
    }, 400);
  }
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

// Format Due Date for display
function formatDueDate(isoStr) {
  if (!isoStr) return '';
  const due = new Date(isoStr);
  if (isNaN(due.getTime())) return '';
  const now = new Date();
  
  const m = due.getMonth() + 1;
  const d = due.getDate();
  const h = due.getHours();
  const min = due.getMinutes();
  const hasTime = !(h === 0 && min === 0);
  const timePart = hasTime ? ` ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : '';

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const dayDiff = Math.round((dueStart - todayStart) / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) return `今日${timePart}`;
  if (dayDiff === 1) return `明日${timePart}`;
  if (dayDiff === 2) return `明後日${timePart}`;
  if (dayDiff === -1) return `昨日 (超過)`;
  if (dayDiff < -1) return `${m}/${d} (超過)`;
  return `${m}/${d}${timePart}`;
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

// Filter Memos (Always sorted newest first)
function getFilteredMemos() {
  const filtered = memos.filter(memo => {
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

  return filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
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
  const isRecentNew = memo.createdAt && (Date.now() - new Date(memo.createdAt).getTime() < 86400000);

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
        ${isRecentNew ? '<span class="badge-new" title="新着メモ">✨ NEW</span>' : ''}
        <span class="badge ${cat.badgeClass}">
          ${cat.icon} ${cat.label}
        </span>
        <span class="badge ${pri.badgeClass}">
          ${pri.icon} ${pri.label}
        </span>
        ${memo.dueDate ? `<span class="badge-due" title="予定日時">📅 ${formatDueDate(memo.dueDate)}</span>` : ''}
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
        <button class="btn-card-action" title="Googleカレンダーに登録" onclick="openMemoGoogleCalendar('${memo.id}', event)">📅</button>
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
    const isRecentNew = memo.createdAt && (Date.now() - new Date(memo.createdAt).getTime() < 86400000);

    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-left">
        ${isRecentNew ? '<span class="badge-new" title="新着メモ">✨ NEW</span>' : ''}
        <span class="badge ${cat.badgeClass}">${cat.icon} ${cat.label}</span>
        <div class="list-item-body">
          <div class="list-item-title">${escapeHtml(memo.title)}</div>
          <div class="list-item-desc">${escapeHtml(memo.description || '詳細なし')}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="badge ${pri.badgeClass}">${pri.icon} ${pri.label}</span>
        ${memo.dueDate ? `<span class="badge-due">📅 ${formatDueDate(memo.dueDate)}</span>` : ''}
        <span class="list-item-status-pill">${stat.icon} ${stat.label}</span>
        <button class="btn-card-action" title="Googleカレンダーに登録" onclick="openMemoGoogleCalendar('${memo.id}', event)">📅</button>
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
    saveMemos(true);
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

// ========================================================
// Fullscreen Live Markdown Editor Handlers & Helpers
// ========================================================

// Safe Regex Markdown Formatter (HTML-escaped input first to prevent XSS)
function renderSafeMarkdown(text) {
  if (!text || !text.trim()) {
    return '<div class="preview-empty-placeholder">詳細を入力すると、ここにリアルタイムでMarkdownプレビューが表示されます。</div>';
  }

  // 1. Escape HTML to prevent XSS
  let safe = escapeHtml(text);

  // 2. Fenced code blocks ```lang ... ```
  safe = safe.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<div class="preview-code-block"><div class="preview-code-header">${lang || 'code'}</div><pre><code>${code.trim()}</code></pre></div>`;
  });

  // 3. Inline code `...`
  safe = safe.replace(/`([^`\n]+)`/g, '<code class="preview-inline-code">$1</code>');

  // 4. Headers: #, ##, ###, ####
  safe = safe.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
  safe = safe.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  safe = safe.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  safe = safe.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // 5. Blockquotes >
  safe = safe.replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>');

  // 6. Checkboxes: - [ ] or - [x]
  safe = safe.replace(/^- \[x\] (.*?)$/gim, '<div class="preview-task-item checked"><input type="checkbox" checked disabled> <span>$1</span></div>');
  safe = safe.replace(/^- \[ \] (.*?)$/gim, '<div class="preview-task-item"><input type="checkbox" disabled> <span>$1</span></div>');

  // 7. Unordered lists: - item or * item
  safe = safe.replace(/^[-*] (.*?)$/gm, '<li>$1</li>');
  safe = safe.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');

  // 8. Bold, Italic, Strikethrough
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  safe = safe.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 9. Links: [text](https://url)
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 10. Antigravity Prompt Highlight
  safe = safe.replace(/【Antigravityへの依頼】/g, '<span class="preview-agy-badge">⚡ Antigravityへの依頼</span>');

  // 11. Paragraphs & Line Breaks
  const blocks = safe.split(/\n{2,}/);
  safe = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (
      block.startsWith('<h') ||
      block.startsWith('<ul') ||
      block.startsWith('<blockquote') ||
      block.startsWith('<div class="preview-code-block"') ||
      block.startsWith('<div class="preview-task-item"')
    ) {
      return block;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return safe;
}

// Update Live Preview & Stats
function updateMemoEditorPreview() {
  if (!memoDescPreview) return;
  const text = inputMemoDesc ? (inputMemoDesc.value || '') : '';
  const title = inputMemoTitle && inputMemoTitle.value.trim() ? inputMemoTitle.value.trim() : '（タイトル未設定）';
  const cat = formMemo ? (formMemo.querySelector('input[name="memo-category"]:checked')?.value || 'task') : 'task';
  const catInfo = CATEGORY_MAP[cat] || CATEGORY_MAP.task;
  const priInfo = PRIORITY_MAP[inputMemoPriority ? inputMemoPriority.value : 'med'] || PRIORITY_MAP.med;
  const scopeVal = inputMemoScope ? inputMemoScope.value.trim() : '';

  let headerHtml = `<div class="preview-memo-top">`;
  headerHtml += `<div class="preview-meta-badges">`;
  headerHtml += `<span class="badge ${catInfo.badgeClass}">${catInfo.icon} ${catInfo.label}</span>`;
  headerHtml += `<span class="badge ${priInfo.badgeClass}">${priInfo.icon} ${priInfo.label}</span>`;
  if (scopeVal) {
    headerHtml += `<span class="card-scope">🎯 ${escapeHtml(scopeVal)}</span>`;
  }
  headerHtml += `</div>`;
  headerHtml += `<h1 class="preview-memo-title">${escapeHtml(title)}</h1>`;
  headerHtml += `</div>`;

  memoDescPreview.innerHTML = headerHtml + renderSafeMarkdown(text);

  // Character and line count
  if (editorCharCount) {
    const charCount = text.length;
    const lineCount = text ? text.split('\n').length : 0;
    editorCharCount.textContent = `${charCount} 文字 / ${lineCount} 行`;
  }
}

// Markdown formatting helper
function applyEditorFormat(action) {
  if (!inputMemoDesc) return;
  const textarea = inputMemoDesc;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  let replacement = '';

  switch (action) {
    case 'bold':
      replacement = selectedText ? `**${selectedText}**` : '**太字**';
      break;
    case 'italic':
      replacement = selectedText ? `*${selectedText}*` : '*斜体*';
      break;
    case 'h2':
      replacement = selectedText ? `\n## ${selectedText}\n` : '\n## 見出し2\n';
      break;
    case 'h3':
      replacement = selectedText ? `\n### ${selectedText}\n` : '\n### 見出し3\n';
      break;
    case 'checklist':
      if (selectedText) {
        replacement = selectedText.split('\n').map(l => l.startsWith('- [ ] ') ? l : `- [ ] ${l}`).join('\n');
      } else {
        replacement = '\n- [ ] 完了条件・チェック項目';
      }
      break;
    case 'bullet':
      if (selectedText) {
        replacement = selectedText.split('\n').map(l => l.startsWith('- ') ? l : `- ${l}`).join('\n');
      } else {
        replacement = '\n- 箇条書き項目';
      }
      break;
    case 'inline-code':
      replacement = selectedText ? `\`${selectedText}\`` : '`コード`';
      break;
    case 'code-block':
      replacement = selectedText ? `\n\`\`\`\n${selectedText}\n\`\`\`\n` : '\n```\n// コードを記述\n```\n';
      break;
    case 'insert-template':
      const tpl = `### 依頼内容・詳細\n具体的に行ってほしい修正や実装内容を記入してください。\n\n### 期待する結果・完了条件\n- [ ] 要件を満たすコードを反映\n- [ ] 関連ファイルに不整合がないか確認\n- [ ] 変更内容と動作確認結果を報告\n`;
      replacement = textarea.value.trim() ? `\n\n${tpl}` : tpl;
      break;
    default:
      return;
  }

  textarea.setRangeText(replacement, start, end, 'end');
  textarea.focus();
  updateMemoEditorPreview();
}

// Fullscreen / Windowed toggle
function toggleMemoFullscreen() {
  if (!modalMemo) return;
  modalMemo.classList.toggle('is-maximized');
  const isMax = modalMemo.classList.contains('is-maximized');
  if (fullscreenIcon) {
    fullscreenIcon.textContent = isMax ? '🗗' : '🗖';
  }
  if (btnToggleMemoFullscreen) {
    btnToggleMemoFullscreen.title = isMax ? '通常ウィンドウに戻す' : '全画面に最大化';
  }
  localStorage.setItem('antigravity_memo_maximized', isMax ? 'true' : 'false');
}

// Modal Handlers
function openNewMemoModal() {
  inputMemoId.value = '';
  formMemo.reset();
  inputMemoDue.value = '';
  modalMemoTitle.textContent = '新規指示・メモの作成';
  // Default radios
  const fixRadio = formMemo.querySelector('input[value="task"]');
  if (fixRadio) fixRadio.checked = true;

  updateMemoEditorPreview();
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
  inputMemoDue.value = memo.dueDate ? memo.dueDate.slice(0, 16) : '';

  const catRadio = formMemo.querySelector(`input[value="${memo.category}"]`);
  if (catRadio) catRadio.checked = true;

  modalMemoTitle.textContent = '指示・メモの編集';
  updateMemoEditorPreview();
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
    lastLocalSaveTime = Date.now();
    localVersion++;
    memos = memos.filter(m => m.id !== id);
    saveMemos(true);
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
  const dueVal = inputMemoDue.value;
  const dueDate = dueVal ? new Date(dueVal).toISOString() : null;
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
      memo.dueDate = dueDate;
      memo.updatedAt = new Date().toISOString();
      showToast('メモを更新しました', '💾');
    }
  } else {
    // New memo
    const newMemo = {
      id: 'memo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      category,
      title,
      description: desc,
      priority,
      status,
      scope,
      dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    memos.unshift(newMemo);
    showToast('新しい指示・メモを追加しました', '✨');
  }

  saveMemos(true);
  closeMemoModal();
});

// Event Listeners: Header Buttons & Editor Controls
document.getElementById('btn-new-memo').addEventListener('click', openNewMemoModal);
document.getElementById('btn-close-memo-modal').addEventListener('click', closeMemoModal);
document.getElementById('btn-cancel-memo').addEventListener('click', closeMemoModal);

// Toolbar button clicks
document.querySelectorAll('.editor-toolbar .btn-tool').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.getAttribute('data-action');
    if (action) applyEditorFormat(action);
  });
});

// View mode tabs (edit, split, preview)
document.querySelectorAll('#editor-view-tabs .btn-view-tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    const mode = tabBtn.getAttribute('data-mode');
    document.querySelectorAll('#editor-view-tabs .btn-view-tab').forEach(b => b.classList.remove('active'));
    tabBtn.classList.add('active');

    if (editorWorkspace) {
      editorWorkspace.classList.remove('mode-edit', 'mode-split', 'mode-preview');
      editorWorkspace.classList.add(`mode-${mode}`);
    }
    if (mode !== 'edit') {
      updateMemoEditorPreview();
    }
  });
});

// Fullscreen toggle button
if (btnToggleMemoFullscreen) {
  btnToggleMemoFullscreen.addEventListener('click', toggleMemoFullscreen);
}

// Restore saved fullscreen preference
if (localStorage.getItem('antigravity_memo_maximized') === 'true' && modalMemo) {
  modalMemo.classList.add('is-maximized');
  if (fullscreenIcon) fullscreenIcon.textContent = '🗗';
  if (btnToggleMemoFullscreen) btnToggleMemoFullscreen.title = '通常ウィンドウに戻す';
}

// Live typing updates for preview & textarea shortcuts
if (inputMemoDesc) {
  inputMemoDesc.addEventListener('input', updateMemoEditorPreview);
  inputMemoDesc.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = inputMemoDesc.selectionStart;
      const end = inputMemoDesc.selectionEnd;
      inputMemoDesc.setRangeText('  ', start, end, 'end');
      updateMemoEditorPreview();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      formMemo.requestSubmit();
    }
  });
}

if (inputMemoTitle) {
  inputMemoTitle.addEventListener('input', updateMemoEditorPreview);
}
if (inputMemoScope) {
  inputMemoScope.addEventListener('input', updateMemoEditorPreview);
}
if (inputMemoPriority) {
  inputMemoPriority.addEventListener('change', updateMemoEditorPreview);
}
if (formMemo) {
  formMemo.querySelectorAll('input[name="memo-category"]').forEach(r => {
    r.addEventListener('change', updateMemoEditorPreview);
  });
}

// Global keydown: Esc to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalMemo && modalMemo.classList.contains('active')) {
    closeMemoModal();
  }
});

// Copy prompt directly from editor
if (btnCopyEditorPrompt) {
  btnCopyEditorPrompt.addEventListener('click', () => {
    const cat = formMemo.querySelector('input[name="memo-category"]:checked')?.value || 'task';
    const tempMemo = {
      title: inputMemoTitle.value.trim() || '無題の指示',
      category: cat,
      priority: inputMemoPriority.value,
      status: inputMemoStatus.value,
      scope: inputMemoScope.value.trim(),
      description: inputMemoDesc.value.trim()
    };
    const prompt = generateSinglePrompt(tempMemo);
    navigator.clipboard.writeText(prompt).then(() => {
      showToast(`「${tempMemo.title}」のAntigravity指示プロンプトをコピーしました！`, '⚡');
    }).catch(err => {
      console.error('Copy failed', err);
      showToast('クリップボードへのコピーに失敗しました', '❌');
    });
  });
}

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
        memos = deduplicateMemos(imported);
        saveMemos(true);
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
    lastLocalSaveTime = Date.now();
    const samplesWithNewIds = INITIAL_MEMOS.map(sample => ({
      ...sample,
      id: 'memo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    memos = deduplicateMemos([...samplesWithNewIds, ...memos]);
    saveMemos(true);
    showToast('サンプルデータを読み込みました', '✨');
    modalData.classList.remove('active');
  }
});

// Clear All
document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (confirm('本当にすべてのメモを消去しますか？この操作は元に戻せません。')) {
    lastLocalSaveTime = Date.now();
    memos = [];
    saveMemos(true);
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
window.openMemoGoogleCalendar = openMemoGoogleCalendar;

// ==========================================================================
// Voice Input (Web Speech API) & Google Calendar Integration
// ==========================================================================

// 1. Japanese Natural Language Date & Task Parser
function parseVoiceDateAndTitle(text) {
  if (!text) return { title: '', targetDate: null, relativeLabel: '', targetTime: null, raw: '' };
  const raw = text.trim();
  let cleaned = raw;
  const now = new Date();
  let targetDate = null;
  let targetTime = null;
  let relativeLabel = '';

  // Full-width to half-width numbers
  cleaned = cleaned.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

  // Relative keywords
  if (/(今日|きょう)/.test(cleaned)) {
    targetDate = new Date(now);
    relativeLabel = '今日';
    cleaned = cleaned.replace(/(今日|きょう)(の)?/, ' ');
  } else if (/(明日|あした|みょうにち)/.test(cleaned)) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
    relativeLabel = '明日';
    cleaned = cleaned.replace(/(明日|あした|みょうにち)(の)?/, ' ');
  } else if (/(明後日|あさって|みょうごにち)/.test(cleaned)) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 2);
    relativeLabel = '明後日';
    cleaned = cleaned.replace(/(明後日|あさって|みょうごにち)(の)?/, ' ');
  } else if (/(明々後日|しあさって)/.test(cleaned)) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 3);
    relativeLabel = '3日後';
    cleaned = cleaned.replace(/(明々後日|しあさって)(の)?/, ' ');
  }

  // Weekday matches: 来週月曜 / 今週金曜 / 水曜日
  const weekDayMatch = cleaned.match(/(今週|来週|次の)?\s*([月火水木金土日])曜?(日)?/);
  if (!targetDate && weekDayMatch) {
    const isNextWeek = weekDayMatch[1] === '来週';
    const dayChar = weekDayMatch[2];
    const dayMap = { '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6 };
    const targetDayOfWeek = dayMap[dayChar];
    const currentDayOfWeek = now.getDay();
    let diff = targetDayOfWeek - currentDayOfWeek;
    if (diff <= 0) diff += 7;
    if (isNextWeek && diff < 7) diff += 7;
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + diff);
    relativeLabel = (weekDayMatch[1] || '') + dayChar + '曜';
    cleaned = cleaned.replace(weekDayMatch[0], ' ');
  }

  // [X]日後
  const daysLaterMatch = cleaned.match(/(\d+)\s*日後/);
  if (!targetDate && daysLaterMatch) {
    const days = parseInt(daysLaterMatch[1], 10);
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + days);
    relativeLabel = `${days}日後`;
    cleaned = cleaned.replace(daysLaterMatch[0], ' ');
  }

  // [X]月[Y]日
  const monthDayMatch = cleaned.match(/(\d+)\s*月\s*(\d+)\s*日/);
  if (!targetDate && monthDayMatch) {
    const m = parseInt(monthDayMatch[1], 10) - 1;
    const d = parseInt(monthDayMatch[2], 10);
    targetDate = new Date(now.getFullYear(), m, d);
    if (targetDate < now) {
      targetDate.setFullYear(now.getFullYear() + 1);
    }
    relativeLabel = `${m + 1}/${d}`;
    cleaned = cleaned.replace(monthDayMatch[0], ' ');
  }

  // [X]日
  const dayOnlyMatch = cleaned.match(/(\d+)\s*日/);
  if (!targetDate && dayOnlyMatch) {
    const d = parseInt(dayOnlyMatch[1], 10);
    targetDate = new Date(now.getFullYear(), now.getMonth(), d);
    if (targetDate < now) {
      targetDate.setMonth(now.getMonth() + 1);
    }
    relativeLabel = `${targetDate.getMonth() + 1}/${d}`;
    cleaned = cleaned.replace(dayOnlyMatch[0], ' ');
  }

  // Time matches: 午前/午後 + X時(Y分)?
  const ampmMatch = cleaned.match(/(午前|午後)\s*(\d+)\s*時(\s*半|\s*(\d+)\s*分)?/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[2], 10);
    if (ampmMatch[1] === '午後' && h < 12) h += 12;
    if (ampmMatch[1] === '午前' && h === 12) h = 0;
    let m = 0;
    if (ampmMatch[3] && ampmMatch[3].includes('半')) m = 30;
    else if (ampmMatch[4]) m = parseInt(ampmMatch[4], 10);
    targetTime = { hour: h, minute: m };
    cleaned = cleaned.replace(ampmMatch[0], ' ');
  } else {
    const timeMatch = cleaned.match(/(\d+)\s*時(\s*半|\s*(\d+)\s*分)?/);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      let m = 0;
      if (timeMatch[2] && timeMatch[2].includes('半')) m = 30;
      else if (timeMatch[3]) m = parseInt(timeMatch[3], 10);
      targetTime = { hour: h, minute: m };
      cleaned = cleaned.replace(timeMatch[0], ' ');
    }
  }

  // Clean remaining title text (trim particles)
  cleaned = cleaned.trim()
    .replace(/^[\sにでへをのからまではが]+/g, '')
    .replace(/[\sにでへをのからまではが]+$/g, '')
    .replace(/(よろしく|お願い(します)?)+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (targetDate) {
    if (targetTime) {
      targetDate.setHours(targetTime.hour, targetTime.minute, 0, 0);
    } else {
      targetDate.setHours(10, 0, 0, 0); // Default daytime 10:00
    }
  }

  return {
    title: cleaned || raw,
    targetDate,
    targetTime,
    relativeLabel: relativeLabel || (targetDate ? `${targetDate.getMonth() + 1}/${targetDate.getDate()}` : ''),
    raw
  };
}

// 2. Google Calendar Direct URL Generator
function generateGoogleCalendarUrl({ title, targetDate, targetTime, details }) {
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const text = encodeURIComponent(title || 'タスク・予定');
  const detailsParam = encodeURIComponent(details || 'Antigravity Mission Hub から登録');

  let datesParam = '';
  if (targetDate) {
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');

    if (targetTime) {
      const startH = String(targetTime.hour).padStart(2, '0');
      const startM = String(targetTime.minute).padStart(2, '0');
      const endHour = (targetTime.hour + 1) % 24;
      const endH = String(endHour).padStart(2, '0');
      const endM = startM;
      datesParam = `${y}${m}${d}T${startH}${startM}00/${y}${m}${d}T${endH}${endM}00`;
    } else {
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const ny = nextDay.getFullYear();
      const nm = String(nextDay.getMonth() + 1).padStart(2, '0');
      const nd = String(nextDay.getDate()).padStart(2, '0');
      datesParam = `${y}${m}${d}/${ny}${nm}${nd}`;
    }
  } else {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    datesParam = `${y}${m}${d}/${y}${m}${d}`;
  }

  return `${baseUrl}&text=${text}&dates=${datesParam}&details=${detailsParam}`;
}

// Open existing memo directly in Google Calendar
function openMemoGoogleCalendar(id, event) {
  if (event) event.stopPropagation();
  const memo = memos.find(m => m.id === id);
  if (!memo) return;

  let targetDate = null;
  let targetTime = null;

  if (memo.dueDate) {
    const d = new Date(memo.dueDate);
    if (!isNaN(d.getTime())) {
      targetDate = d;
      if (!(d.getHours() === 0 && d.getMinutes() === 0)) {
        targetTime = { hour: d.getHours(), minute: d.getMinutes() };
      }
    }
  }

  if (!targetDate) {
    targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(10, 0, 0, 0);
    targetTime = { hour: 10, minute: 0 };
  }

  const url = generateGoogleCalendarUrl({
    title: memo.title,
    targetDate,
    targetTime,
    details: memo.description || (memo.scope ? `スコープ: ${memo.scope}` : 'Antigravity Mission Hub から登録')
  });

  window.open(url, '_blank');
  showToast(`「${memo.title}」をGoogleカレンダーで開きます`, '📅');
}

// 3. Web Speech API Voice Controller
let speechRecog = null;
let isVoiceActive = false;

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recog = new SpeechRecognition();
  recog.lang = 'ja-JP';
  recog.continuous = false;
  recog.interimResults = true;
  recog.maxAlternatives = 1;

  recog.onstart = () => {
    isVoiceActive = true;
    voiceStatusText.textContent = '音声を聴き取っています... 喋ってください';
    voiceStatusText.style.color = '#f43f5e';
    voiceListeningState.style.display = 'flex';
    voiceResultState.style.display = 'none';
  };

  recog.onresult = (event) => {
    let interim = '';
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    const currentText = finalTranscript || interim;
    if (currentText) {
      voiceTranscriptBox.innerHTML = `<strong>「${escapeHtml(currentText)}」</strong>`;
    }

    if (finalTranscript) {
      handleVoiceFinalResult(finalTranscript);
    }
  };

  recog.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    isVoiceActive = false;
    if (event.error === 'not-allowed') {
      voiceStatusText.textContent = 'マイクの使用が許可されていません。ブラウザのアドレスバーでマイクを許可してください。';
      voiceStatusText.style.color = '#f43f5e';
    } else if (event.error === 'no-speech') {
      voiceStatusText.textContent = '音声が検出されませんでした。「もう一度喋る」を押してください。';
      voiceStatusText.style.color = 'var(--text-muted)';
    } else {
      voiceStatusText.textContent = `認識エラー: ${event.error}`;
    }
  };

  recog.onend = () => {
    isVoiceActive = false;
  };

  return recog;
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('お使いのブラウザは音声入力（Web Speech API）に対応していません。\nGoogle Chrome、Safari、Edge、またはスマホの標準ブラウザをご利用ください。');
    return;
  }

  modalVoice.classList.add('active');
  voiceListeningState.style.display = 'flex';
  voiceResultState.style.display = 'none';
  voiceTranscriptBox.innerHTML = '<span class="placeholder-tip">「明日 配車予約」「来週金曜 14時に点検」と喋ってください</span>';
  voiceStatusText.textContent = 'マイクを起動中...';

  if (!speechRecog) {
    speechRecog = initVoiceRecognition();
  }

  try {
    speechRecog.start();
  } catch (err) {
    try {
      speechRecog.stop();
      setTimeout(() => speechRecog.start(), 200);
    } catch (e) {
      console.error('Voice restart failed:', e);
    }
  }
}

function stopVoiceInput() {
  if (speechRecog && isVoiceActive) {
    speechRecog.stop();
  }
}

function handleVoiceFinalResult(transcript) {
  const parsed = parseVoiceDateAndTitle(transcript);

  voiceListeningState.style.display = 'none';
  voiceResultState.style.display = 'flex';

  parsedTitleInput.value = parsed.title;
  parsedRelativeTag.textContent = parsed.relativeLabel || '今日';

  if (parsed.targetDate) {
    const y = parsed.targetDate.getFullYear();
    const m = String(parsed.targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.targetDate.getDate()).padStart(2, '0');
    const hh = String(parsed.targetDate.getHours()).padStart(2, '0');
    const mm = String(parsed.targetDate.getMinutes()).padStart(2, '0');
    parsedDateInput.value = `${y}-${m}-${d}T${hh}:${mm}`;
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    parsedDateInput.value = `${y}-${m}-${d}T10:00`;
  }

  voiceResultMessage.textContent = `「${parsed.title}」(${parsed.relativeLabel || '日時解析済'}) を検出しました！`;
}

function saveParsedVoiceMemo(title, dueVal) {
  const newMemo = {
    id: 'memo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    category: 'task',
    title: title || '音声入力タスク',
    description: '🎙️ 音声入力より自動作成',
    priority: 'high',
    status: 'todo',
    scope: 'カレンダー連携タスク',
    dueDate: dueVal ? new Date(dueVal).toISOString() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  memos.unshift(newMemo);
  saveMemos(true);
  modalVoice.classList.remove('active');
}

// Voice Modal Action Listeners
if (btnVoiceMemo) btnVoiceMemo.addEventListener('click', startVoiceInput);
if (btnCloseVoiceModal) btnCloseVoiceModal.addEventListener('click', () => modalVoice.classList.remove('active'));
if (btnCloseVoiceBtn) btnCloseVoiceBtn.addEventListener('click', () => modalVoice.classList.remove('active'));
if (btnRestartVoice) btnRestartVoice.addEventListener('click', startVoiceInput);

if (btnStopVoice) {
  btnStopVoice.addEventListener('click', () => {
    stopVoiceInput();
    const text = voiceTranscriptBox.textContent.replace(/^[「\s]+|[」\s]+$/g, '').trim();
    if (text && !text.includes('と喋ってください')) {
      handleVoiceFinalResult(text);
    }
  });
}

if (btnOpenGoogleCal) {
  btnOpenGoogleCal.addEventListener('click', () => {
    const title = parsedTitleInput.value.trim() || '予定・タスク';
    const dueVal = parsedDateInput.value;
    let targetDate = dueVal ? new Date(dueVal) : null;
    let targetTime = null;
    if (targetDate && !isNaN(targetDate.getTime())) {
      targetTime = { hour: targetDate.getHours(), minute: targetDate.getMinutes() };
    }

    const calUrl = generateGoogleCalendarUrl({
      title,
      targetDate,
      targetTime,
      details: 'Antigravity Mission Hub 音声メモから登録'
    });
    window.open(calUrl, '_blank');

    saveParsedVoiceMemo(title, dueVal);
    showToast(`「${title}」のGoogleカレンダーを開きました！`, '📅');
  });
}

if (btnSaveVoiceMemo) {
  btnSaveVoiceMemo.addEventListener('click', () => {
    const title = parsedTitleInput.value.trim() || '音声入力タスク';
    const dueVal = parsedDateInput.value;
    saveParsedVoiceMemo(title, dueVal);
    showToast(`「${title}」をメモカードに追加しました！`, '✨');
  });
}

// Auto-sync when switching back to this tab / waking phone
window.addEventListener('focus', () => {
  fetchMemosFromCloud(true);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    fetchMemosFromCloud(true);
  }
});

// Periodic background sync (every 25 seconds)
setInterval(() => {
  if (document.visibilityState === 'visible') {
    fetchMemosFromCloud(true);
  }
}, 25000);

// Initialization
loadMemos();

// ==========================================================================
// PWA (Progressive Web Apps) & Service Worker Integration
// ==========================================================================

// 1. Register Service Worker with Auto Update & Cache Refresh
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker active with scope:', reg.scope);
        // Force check for sw updates
        reg.update();

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version detected, reloading to apply latest UI assets...');
                // Automatically reload if a new SW version is activated
                window.location.reload();
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

// 2. PWA Installation & Modal Handling
let deferredInstallPrompt = null;
const btnInstallPwa = document.getElementById('btn-install-pwa');
const modalPwaInstall = document.getElementById('modal-pwa-install');
const btnClosePwaModal = document.getElementById('btn-close-pwa-modal');
const btnClosePwaBtn = document.getElementById('btn-close-pwa-btn');
const btnTriggerNativeInstall = document.getElementById('btn-trigger-native-install');
const pwaPromptNativeSection = document.getElementById('pwa-prompt-native-section');

// Check standalone mode (already installed or full-screen app)
const isRunningStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                            window.navigator.standalone === true;

// Detect iOS device
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Listen for browser install prompt (Chrome, Edge, Android)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isRunningStandalone && btnInstallPwa) {
    btnInstallPwa.style.display = 'inline-flex';
  }
  if (pwaPromptNativeSection) {
    pwaPromptNativeSection.style.display = 'block';
  }
});

// Always provide install access if not standalone (for iOS and other platforms)
if (!isRunningStandalone && btnInstallPwa) {
  setTimeout(() => {
    btnInstallPwa.style.display = 'inline-flex';
  }, 1000);
}

// Function to open PWA guide modal
function openPwaModal() {
  if (!modalPwaInstall) return;

  // On iOS, native trigger button cannot work due to Apple restrictions
  if (isIOS) {
    if (pwaPromptNativeSection) {
      pwaPromptNativeSection.style.display = 'none';
    }
    showToast('📱 画面下の「共有(↑)」➔「ホーム画面に追加」でアプリ化できます！', '💡');
    
    // Highlight iOS instruction card
    const iosCard = modalPwaInstall.querySelector('.platform-tag.ios')?.closest('.pwa-step-card');
    if (iosCard) {
      iosCard.style.border = '2px solid #f38020';
      iosCard.style.boxShadow = '0 0 20px rgba(243, 128, 32, 0.4)';
    }
  } else {
    if (pwaPromptNativeSection) {
      pwaPromptNativeSection.style.display = deferredInstallPrompt ? 'block' : 'none';
    }
  }

  modalPwaInstall.classList.add('active');
}

// Install button click handler
if (btnInstallPwa) {
  btnInstallPwa.addEventListener('click', async (e) => {
    e.preventDefault();
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        showToast('アプリのインストールを開始しました！', '📲');
        btnInstallPwa.style.display = 'none';
      }
      deferredInstallPrompt = null;
    } else {
      openPwaModal();
    }
  });
}

// Modal native trigger button click handler
if (btnTriggerNativeInstall) {
  btnTriggerNativeInstall.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        showToast('アプリをインストールしました！', '📲');
        if (btnInstallPwa) btnInstallPwa.style.display = 'none';
      }
      deferredInstallPrompt = null;
      if (modalPwaInstall) modalPwaInstall.classList.remove('active');
    } else if (isIOS) {
      showToast('iPhoneは画面下の共有ボタン(↑) ➔「ホーム画面に追加」をタップしてください', '🍎');
    } else {
      showToast('ブラウザのURLバー右側の「インストール」アイコンから追加できます', 'ℹ️');
    }
  });
}

// Close PWA modal buttons
if (btnClosePwaModal) {
  btnClosePwaModal.addEventListener('click', () => modalPwaInstall.classList.remove('active'));
}
if (btnClosePwaBtn) {
  btnClosePwaBtn.addEventListener('click', () => modalPwaInstall.classList.remove('active'));
}

// Handle successful installation
window.addEventListener('appinstalled', () => {
  if (btnInstallPwa) btnInstallPwa.style.display = 'none';
  if (modalPwaInstall) modalPwaInstall.classList.remove('active');
  showToast('🎉 アプリが正常にインストールされました！', '🚀');
  console.log('[PWA] Installed successfully');
});

// 3. PWA Shortcuts & Deep Linking (#new, #voice)
window.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash;
  if (hash === '#new') {
    setTimeout(() => {
      if (btnNewMemo) btnNewMemo.click();
    }, 500);
  } else if (hash === '#voice') {
    setTimeout(() => {
      if (btnVoiceMemo) btnVoiceMemo.click();
    }, 500);
  }
});

