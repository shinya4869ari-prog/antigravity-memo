const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('_worker.js', 'utf8');
const load = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function storage() {
  const data = new Map();
  return { data, async get(key, type) { const value = data.get(key); return value ? (type === 'json' ? JSON.parse(value) : value) : null; }, async put(key, value) { data.set(key, value); } };
}
const pad = { text: '日本語\nconst x = 1;', images: ['data:image/png;base64,YQ=='], revision: 'first' };
async function call(method, body, env = {}) {
  const worker = (await load()).default;
  return worker.fetch(new Request('https://example.test/api/shared-pad', {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}
test('unbound KV explicitly reports local mode', async () => {
  assert.deepEqual(await (await call('POST', { pad, base: null })).json(), { mode: 'local' });
});
test('round trip preserves text/images and leaves instruction memos untouched', async () => {
  const kv = storage(); kv.data.set('memos', '[{"id":"existing"}]');
  const env = { MEMO_KV: kv };
  assert.equal((await call('POST', { pad, base: null }, env)).status, 200);
  assert.deepEqual((await (await call('GET', undefined, env)).json()).pad, pad);
  assert.equal(kv.data.get('memos'), '[{"id":"existing"}]');
  const conflict = await call('POST', { pad: { ...pad, revision: 'other' }, base: null }, env);
  assert.equal(conflict.status, 409);
  assert.deepEqual((await conflict.json()).pad, pad);
  const empty = { text: '', images: [], revision: 'cleared' };
  assert.equal((await call('POST', { pad: empty, base: pad.revision }, env)).status, 200);
  assert.deepEqual((await (await call('GET', undefined, env)).json()).pad, empty);
  assert.equal(kv.data.get('memos'), '[{"id":"existing"}]');
});
test('rejects malformed images, oversized content and unsupported methods', async () => {
  const env = { MEMO_KV: storage() };
  assert.equal((await call('POST', { pad: { ...pad, images: ['javascript:alert(1)'] }, base: null }, env)).status, 400);
  assert.equal((await call('POST', { pad: { ...pad, text: 'a'.repeat(200001) }, base: null }, env)).status, 400);
  assert.equal((await call('POST', { pad: { ...pad, text: 'a'.repeat(3000001) }, base: null }, env)).status, 413);
  assert.equal((await call('DELETE', undefined, env)).status, 405);
});
test('storage failures return an error instead of claiming success', async () => {
  const env = { MEMO_KV: { get() { throw Error('unavailable'); } } };
  assert.equal((await call('GET', undefined, env)).status, 500);
});

test('offline edits and clear persist across reloads; cancellation preserves text and images', async () => {
  const vm = require('node:vm');
  const saved = new Map();
  function page(confirmClear = false) {
    const elements = new Map();
    const element = () => ({ value: '', hidden: true, listeners: {},
      addEventListener(name, cb) { this.listeners[name] = cb; }, replaceChildren() {}, append() {} });
    const document = { hidden: false, activeElement: null,
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, addEventListener() {} };
    const context = { document, localStorage: { getItem: k => saved.get(k) || null, setItem: (k, v) => saved.set(k, v) },
      crypto: { randomUUID: () => 'offline-revision' }, fetch: async () => { throw Error('offline'); },
      setTimeout: () => 1, clearTimeout() {}, setInterval() {}, window: { addEventListener() {}, confirm: () => confirmClear } };
    vm.runInNewContext(fs.readFileSync('shared-pad.js', 'utf8'), context);
    return document;
  }
  const first = page();
  const input = first.getElementById('shared-pad-text');
  input.value = 'スマホへ共有したいコード'; input.listeners.input();
  const stored = JSON.parse(saved.get('antigravity-shared-pad-v1'));
  assert.equal(stored.dirty, true);
  assert.equal(stored.pad.text, input.value);
  const second = page();
  assert.equal(second.getElementById('shared-pad-text').value, input.value);
  stored.pad.images = ['data:image/png;base64,YQ=='];
  saved.set('antigravity-shared-pad-v1', JSON.stringify(stored));
  const cancelled = page(false);
  cancelled.getElementById('shared-pad-clear').onclick();
  assert.deepEqual(JSON.parse(saved.get('antigravity-shared-pad-v1')), stored);
  const cleared = page(true);
  cleared.getElementById('shared-pad-clear').onclick();
  const empty = JSON.parse(saved.get('antigravity-shared-pad-v1'));
  assert.equal(empty.pad.text, '');
  assert.deepEqual(empty.pad.images, []);
  assert.equal(empty.dirty, true);
  assert.equal(empty.base, stored.base);
  assert.equal(page().getElementById('shared-pad-text').value, '');
});
