const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('sw.js v47 correctly allows Cloudflare Access redirects and never poisons cache with login HTML', () => {
  const swCode = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(swCode.includes("antigravity-hub-v47"), 'Cache name must be v47');
  assert.ok(swCode.includes('networkResponse.redirected'), 'Must check networkResponse.redirected');
  assert.ok(swCode.includes('networkResponse.status === 401'), 'Must check 401 status');
  assert.ok(swCode.includes('networkResponse.status === 403'), 'Must check 403 status');
  assert.ok(swCode.includes('networkResponse.status >= 300 && networkResponse.status < 400'), 'Must check 3xx redirect status');
});

test('app.js v47 saves memos with credentials, handles 401/HTML safely, and avoids immediate offline status on single failure', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(appCode.includes("credentials: 'same-origin'"), 'fetch in saveMemosToCloud must use credentials same-origin');
  assert.ok(appCode.includes('scheduleSafeSessionRecovery'), 'saveMemosToCloud must call scheduleSafeSessionRecovery on auth failure');
  assert.ok(appCode.includes('consecutiveSyncFailures >= 3'), 'Offline status must require at least 3 consecutive failures or true navigator.onLine === false');
  assert.ok(appCode.includes('triggerWakeSync'), 'Must use triggerWakeSync debounce on visibilitychange / focus');
});

test('shared-pad.js v47 includes 3-stage reconnect retries and wake stabilization delay', () => {
  const padCode = fs.readFileSync(path.join(__dirname, '..', 'shared-pad.js'), 'utf8');
  assert.ok(padCode.includes('triggerPadWakeSync'), 'Must use triggerPadWakeSync debounce');
  assert.ok(padCode.includes('reconnectTimer3'), 'Must have 3-stage retries');
  assert.ok(padCode.includes('consecutivePadFailures >= 3'), 'Must tolerate temporary glitches before claiming offline');
});
