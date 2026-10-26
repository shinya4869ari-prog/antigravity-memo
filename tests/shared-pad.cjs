const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('_worker.js', 'utf8');
const load = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const TEST_TOKEN = 'test_automation_token_0123456789abcdef0123456789abcdef';
const AUTH_HEADERS = { Authorization: `Bearer ${TEST_TOKEN}` };

function storage() {
  const data = new Map();
  return {
    data,
    async get(key, type) {
      const value = data.get(key);
      return value ? (type === 'json' ? JSON.parse(value) : value) : null;
    },
    async put(key, value) {
      data.set(key, value);
    }
  };
}

const pad = { text: '日本語\nconst x = 1;', images: ['data:image/png;base64,YQ=='], revision: 'first' };

async function call(method, body, env = { MEMO_API_TOKEN: TEST_TOKEN }, headers = AUTH_HEADERS, url = 'https://memo.example.test/api/shared-pad') {
  const worker = (await load()).default;
  return worker.fetch(new Request(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}

function toBase64Url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwtRS256(privateKey, header, payload) {
  const h = toBase64Url(JSON.stringify(header));
  const p = toBase64Url(JSON.stringify(payload));
  const signingInput = new TextEncoder().encode(`${h}.${p}`);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, signingInput);
  return `${h}.${p}.${toBase64Url(sig)}`;
}

test('Fail-Closed: unconfigured env or missing/invalid credentials always return 401 across all API routes', async () => {
  const kv = storage();
  kv.data.set('memos', '[{"id":"existing"}]');

  // 1. Unconfigured env (MEMO_API_TOKEN unset, even if AUTH_ENFORCE=false is passed) -> 401
  const unconfiguredEnv = { MEMO_KV: kv, AUTH_ENFORCE: 'false' };
  for (const endpoint of ['/api/shared-pad', '/api/memos', '/api/apps']) {
    const getRes = await call('GET', undefined, unconfiguredEnv, AUTH_HEADERS, `https://memo.example.test${endpoint}`);
    assert.equal(getRes.status, 401, `GET ${endpoint} with unconfigured env must be 401`);
    const postRes = await call('POST', { pad, base: null }, unconfiguredEnv, AUTH_HEADERS, `https://memo.example.test${endpoint}`);
    assert.equal(postRes.status, 401, `POST ${endpoint} with unconfigured env must be 401`);
  }

  // 2. Configured env but no auth headers -> 401
  const configuredEnv = { MEMO_KV: kv, MEMO_API_TOKEN: TEST_TOKEN };
  for (const endpoint of ['/api/shared-pad', '/api/memos', '/api/apps']) {
    const noAuthGet = await call('GET', undefined, configuredEnv, {}, `https://memo.example.test${endpoint}`);
    assert.equal(noAuthGet.status, 401, `Unauthenticated GET ${endpoint} must be 401`);
    const wrongAuthGet = await call('GET', undefined, configuredEnv, { Authorization: 'Bearer wrong_token_value_1234567890' }, `https://memo.example.test${endpoint}`);
    assert.equal(wrongAuthGet.status, 401, `Wrong token GET ${endpoint} must be 401`);
  }
});

test('Direct *.workers.dev hostname is strictly blocked with 403 Forbidden', async () => {
  const env = { MEMO_KV: storage(), MEMO_API_TOKEN: TEST_TOKEN };
  const resApi = await call('GET', undefined, env, AUTH_HEADERS, 'https://antigravity-memo.shinya4869ari.workers.dev/api/memos');
  assert.equal(resApi.status, 403);
  const resRoot = await call('GET', undefined, env, AUTH_HEADERS, 'https://antigravity-memo.shinya4869ari.workers.dev/');
  assert.equal(resRoot.status, 403);
});

test('Cloudflare Access JWT validation verifies RS256 signature, exp, nbf, iss, and aud', async () => {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );
  const otherKeys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );

  const pubJwk = await crypto.subtle.exportKey('jwk', publicKey);
  pubJwk.kid = 'cf-key-2026';
  pubJwk.kty = 'RSA';

  const kv = storage();
  kv.data.set('memos', '[{"id":"memo-1","title":" Protected "}]');

  const issuer = 'https://seron.cloudflareaccess.com';
  const aud = 'aud_tag_9876543210abcdef';
  const env = {
    MEMO_KV: kv,
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: aud,
    __JWKS_FETCH: async (url) => {
      assert.equal(url, `${issuer}/cdn-cgi/access/certs`);
      return new Response(JSON.stringify({ keys: [pubJwk] }), { status: 200 });
    }
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const validPayload = {
    iss: issuer,
    aud: [aud],
    exp: nowSec + 600,
    nbf: nowSec - 60,
    sub: 'user-uuid',
    email: 'owner@example.com'
  };

  // 1. Valid JWT in Cf-Access-Jwt-Assertion header -> 200 OK
  const validJwt = await signJwtRS256(privateKey, { alg: 'RS256', kid: 'cf-key-2026', typ: 'JWT' }, validPayload);
  const okHeaderRes = await call('GET', undefined, env, { 'Cf-Access-Jwt-Assertion': validJwt }, 'https://memo.example.test/api/memos');
  assert.equal(okHeaderRes.status, 200);
  assert.deepEqual(await okHeaderRes.json(), [{ id: 'memo-1', title: ' Protected ' }]);

  // 2. Valid JWT in CF_Authorization cookie -> 200 OK
  const okCookieRes = await call('GET', undefined, env, { Cookie: `CF_Authorization=${validJwt}` }, 'https://memo.example.test/api/memos');
  assert.equal(okCookieRes.status, 200);

  // 3. Expired JWT (exp in past) -> 401
  const expiredJwt = await signJwtRS256(privateKey, { alg: 'RS256', kid: 'cf-key-2026' }, { ...validPayload, exp: nowSec - 10 });
  const expRes = await call('GET', undefined, env, { 'Cf-Access-Jwt-Assertion': expiredJwt }, 'https://memo.example.test/api/memos');
  assert.equal(expRes.status, 401);

  // 4. Future nbf -> 401
  const futureNbfJwt = await signJwtRS256(privateKey, { alg: 'RS256', kid: 'cf-key-2026' }, { ...validPayload, nbf: nowSec + 300 });
  const nbfRes = await call('GET', undefined, env, { 'Cf-Access-Jwt-Assertion': futureNbfJwt }, 'https://memo.example.test/api/memos');
  assert.equal(nbfRes.status, 401);

  // 5. Wrong issuer (iss) -> 401
  const wrongIssJwt = await signJwtRS256(privateKey, { alg: 'RS256', kid: 'cf-key-2026' }, { ...validPayload, iss: 'https://evil.cloudflareaccess.com' });
  const issRes = await call('GET', undefined, env, { 'Cf-Access-Jwt-Assertion': wrongIssJwt }, 'https://memo.example.test/api/memos');
  assert.equal(issRes.status, 401);

  // 6. Wrong audience (aud) -> 401
  const wrongAudJwt = await signJwtRS256(privateKey, { alg: 'RS256', kid: 'cf-key-2026' }, { ...validPayload, aud: ['wrong_aud_tag'] });
  const audRes = await call('GET', undefined, env, { 'Cf-Access-Jwt-Assertion': wrongAudJwt }, 'https://memo.example.test/api/memos');
  assert.equal(audRes.status, 401);

  // 7. Invalid cryptographic signature (signed with wrong private key) -> 401
  const badSigJwt = await signJwtRS256(otherKeys.privateKey, { alg: 'RS256', kid: 'cf-key-2026' }, validPayload);
  const sigRes = await call('GET', undefined, env, { 'Cf-Access-Jwt-Assertion': badSigJwt }, 'https://memo.example.test/api/memos');
  assert.equal(sigRes.status, 401);
});

test('unbound KV explicitly reports local mode when authenticated', async () => {
  assert.deepEqual(await (await call('POST', { pad, base: null }, { MEMO_API_TOKEN: TEST_TOKEN })).json(), { mode: 'local' });
});

test('round trip preserves text/images and leaves instruction memos untouched', async () => {
  const kv = storage(); kv.data.set('memos', '[{"id":"existing"}]');
  const env = { MEMO_KV: kv, MEMO_API_TOKEN: TEST_TOKEN };
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
  const env = { MEMO_KV: storage(), MEMO_API_TOKEN: TEST_TOKEN };
  assert.equal((await call('POST', { pad: { ...pad, images: ['javascript:alert(1)'] }, base: null }, env)).status, 400);
  assert.equal((await call('POST', { pad: { ...pad, text: 'a'.repeat(200001) }, base: null }, env)).status, 400);
  assert.equal((await call('POST', { pad: { ...pad, text: 'a'.repeat(3000001) }, base: null }, env)).status, 413);
  assert.equal((await call('DELETE', undefined, env)).status, 405);
});

test('storage failures return an error instead of claiming success', async () => {
  const env = { MEMO_KV: { get() { throw Error('unavailable'); } }, MEMO_API_TOKEN: TEST_TOKEN };
  assert.equal((await call('GET', undefined, env)).status, 500);
});

test('offline edits and clear persist across reloads; cancellation preserves text and images', async () => {
  const vm = require('node:vm');
  const saved = new Map();
  function page(confirmClear = false) {
    const elements = new Map();
    const element = () => ({ value: '', hidden: true, listeners: {},
      classList: { values: new Set(), toggle(name, active) { if (active) this.values.add(name); else this.values.delete(name); }, contains(name) { return this.values.has(name); } },
      setAttribute(name, value) { this[name] = value; }, focus() {},
      addEventListener(name, cb) { this.listeners[name] = cb; }, replaceChildren() {}, append() {} });
    const document = { hidden: false, activeElement: null, documentElement: element(),
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
  const toggle = first.getElementById('shared-pad-maximize');
  toggle.onclick();
  assert.equal(first.getElementById('shared-pad').classList.contains('is-maximized'), true);
  assert.equal(toggle['aria-pressed'], 'true');
  assert.equal(input.value, 'スマホへ共有したいコード');
  toggle.onclick();
  assert.equal(first.getElementById('shared-pad').classList.contains('is-maximized'), false);
  assert.equal(toggle['aria-pressed'], 'false');
  assert.equal(input.value, 'スマホへ共有したいコード');
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
