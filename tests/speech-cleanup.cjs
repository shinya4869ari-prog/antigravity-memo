const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const fn = src.slice(src.indexOf('function cleanSpeechText('), src.indexOf('function setupSpeechCleanup('));
const ctx = {}; vm.createContext(ctx); vm.runInContext(fn, ctx);
const cases = [
  ['えーと、明日 会議、会議。えっと、資料を用意する。', '明日 会議。資料を用意する。'],
  ['うんうん、はいはい、そうですね、明日確認します。', '明日確認します。'],
  ['あの人とその会社に相談する。はい、お願いします。', 'あの人とその会社に相談する。はい、お願いします。'],
  ['### 見出し\n- [ ] えーと、確認\n```js\nconst x = "えーと、";\n```\nhttps://example.com/a', '### 見出し\n- [ ] えーと、確認\n```js\nconst x = "えーと、";\n```\nhttps://example.com/a'],
  ['明日15時に3件確認。キャンセルしない。', '明日15時に3件確認。キャンセルしない。'],
  ['', '']
];
for (const [input, expected] of cases) {
  assert.equal(ctx.cleanSpeechText(input), expected);
  assert.equal(ctx.cleanSpeechText(expected), expected, 'cleanup is idempotent');
}
console.log('Speech cleanup: 6 cases passed (including idempotence)');
