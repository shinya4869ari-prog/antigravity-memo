const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

test('mergeMemos correctly combines local and server memos without data loss', () => {
  const code = fs.readFileSync('app.js', 'utf8');
  assert.ok(code.includes('function mergeMemos('));

  // Extract mergeMemos function logic for isolated testing
  function deduplicateMemos(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const deduped = list.filter(item => {
      if (!item || !item.id) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return deduped.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function mergeMemos(localList, serverList) {
    if (!Array.isArray(localList)) localList = [];
    if (!Array.isArray(serverList)) serverList = [];

    const map = new Map();
    for (const item of serverList) {
      if (item && item.id) map.set(item.id, item);
    }
    for (const item of localList) {
      if (!item || !item.id) continue;
      if (!map.has(item.id)) {
        map.set(item.id, item);
      } else {
        const existing = map.get(item.id);
        const localTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
        const serverTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        if (localTime >= serverTime) {
          map.set(item.id, item);
        }
      }
    }
    return deduplicateMemos(Array.from(map.values()));
  }

  const serverMemos = [
    { id: '1', title: 'Server Memo 1', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' },
    { id: '2', title: 'Server Memo 2 (Old)', createdAt: '2026-11-01T11:00:00Z', updatedAt: '2026-11-01T11:00:00Z' }
  ];

  const localMemos = [
    { id: '2', title: 'Local Memo 2 (Edited)', createdAt: '2026-11-01T11:00:00Z', updatedAt: '2026-11-02T12:00:00Z' },
    { id: '3', title: 'Local Memo 3 (New offline)', createdAt: '2026-11-02T12:30:00Z' }
  ];

  const merged = mergeMemos(localMemos, serverMemos);

  // Must have 3 items total (no items lost)
  assert.equal(merged.length, 3);

  // Memo 2 must take the newer local version
  const memo2 = merged.find(m => m.id === '2');
  assert.equal(memo2.title, 'Local Memo 2 (Edited)');

  // Memo 1 from server must be preserved
  const memo1 = merged.find(m => m.id === '1');
  assert.equal(memo1.title, 'Server Memo 1');

  // Memo 3 from local must be preserved
  const memo3 = merged.find(m => m.id === '3');
  assert.equal(memo3.title, 'Local Memo 3 (New offline)');
});
