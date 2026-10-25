const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  const calls = [], canvases = [];
  class Image {
    naturalWidth = 100; naturalHeight = 50;
    set src(value) { queueMicrotask(() => this.onload()); }
  }
  const context = { Image, Blob, Promise, setTimeout() {},
    navigator: { clipboard: { write: async items => { calls.push(items); }, writeText: async text => calls.push(text) } },
    ClipboardItem: class { constructor(data) { this.data = data; } },
    document: { createElement() {
      const canvas = { width: 0, height: 0, lines: [], images: [],
        getContext() { return { measureText: text => ({ width: text.length * 10 }), fillRect() {},
          fillText: text => canvas.lines.push(text), drawImage: image => canvas.images.push(image) }; },
        toBlob(cb, type) { cb(new Blob(['png'], { type })); } };
      canvases.push(canvas); return canvas;
    } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('shared-pad-transfer.js', 'utf8') + '\nglobalThis.transfer = SharedPadTransfer;', context);
  return { context, calls, canvases, transfer: context.transfer };
}
const image = 'data:image/png;base64,YQ==';
test('text only uses text clipboard without image conversion', async () => {
  const { transfer, calls, canvases } = setup();
  await transfer.copy('コード', []);
  assert.deepEqual(calls, ['コード']); assert.equal(canvases.length, 0);
});
test('copy includes original text and every screenshot in one PNG representation', async () => {
  const { transfer, calls, canvases } = setup();
  await transfer.copy('日本語\nconst x = 1;', [image, image]);
  assert.equal(calls[0].length, 1);
  const data = calls[0][0].data;
  assert.equal(await data['text/plain'].text(), '日本語\nconst x = 1;');
  assert.equal((await data['image/png']).type, 'image/png');
  assert.deepEqual(canvases[0].lines, ['日本語', 'const x = 1;']);
  assert.equal(canvases[0].images.length, 2);
});
test('unsupported image clipboard reports failure without silently copying text', async () => {
  const { transfer, context, calls } = setup();
  context.ClipboardItem = undefined;
  await assert.rejects(transfer.copy('text', [image]), /画像をコピーできません/);
  assert.equal(calls.length, 0);
});
test('rejects invalid image URLs and overlong combined images', async () => {
  const { transfer } = setup();
  await assert.rejects(transfer.png('text', ['https://external.test/image']), /画像形式/);
  await assert.rejects(transfer.png('a\n'.repeat(1000), [image]), /長すぎます/);
});
