/* Local drafts survive reloads and failed requests. KV is eventually consistent,
   so conflict checks are best effort, not an atomic collaborative editor. */
(() => {
  const key = 'antigravity-shared-pad-v1';
  const text = document.getElementById('shared-pad-text');
  const status = document.getElementById('shared-pad-status');
  const conflict = document.getElementById('shared-pad-conflict');
  let state = { pad: { text: '', images: [], revision: null }, base: null, dirty: false };
  let remote = null, busy = false, timer, composing = false;
  let imageEpoch = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.pad && typeof saved.pad.text === 'string' && Array.isArray(saved.pad.images)) state = saved;
  } catch { status.textContent = '端末の保存データを読み込めませんでした'; }
  const message = value => { status.textContent = value; };
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(state)); return true; }
    catch { message('端末に保存できません。本文をコピーして退避してください'); return false; }
  }
  function imagesInto(container, images, editable) {
    container.replaceChildren();
    images.forEach((src, index) => {
      if (!/^data:image\/(webp|jpeg|png);base64,/.test(src)) return;
      const item = document.createElement('div');
      const img = document.createElement('img');
      img.src = src; img.alt = `共有スクショ ${index + 1}`; img.tabIndex = 0;
      img.onclick = () => openLightbox(src);
      img.onkeydown = e => { if (e.key === 'Enter') openLightbox(src); };
      item.append(img);
      if (editable) {
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'btn btn-secondary btn-sm'; remove.textContent = '削除';
        remove.onclick = () => { state.pad.images.splice(index, 1); changed(); render(); };
        item.append(remove);
      }
      container.append(item);
    });
  }
  function render() {
    text.value = state.pad.text;
    imagesInto(document.getElementById('shared-pad-images'), state.pad.images, true);
  }
  function changed() {
    state.pad.text = text.value;
    state.pad.revision = crypto.randomUUID();
    state.dirty = true;
    if (persist()) message('端末に保存済み・同期待ち');
    clearTimeout(timer);
    if (!composing) timer = setTimeout(sync, 1000);
  }
  function showConflict(pad) {
    remote = pad;
    document.getElementById('shared-pad-remote').textContent = pad?.text || '（空のメモ）';
    imagesInto(document.getElementById('shared-pad-remote-images'), pad?.images || [], false);
    conflict.hidden = false;
    message('別デバイスの変更を確認してください');
  }
  async function sync() {
    if (busy || composing || !conflict.hidden) return;
    busy = true;
    try {
      const response = await fetch('/api/shared-pad', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.mode !== 'kv') { message('端末に保存・クラウド未接続'); return; }
      const pad = result.pad;
      if (state.dirty) {
        if (pad?.revision === state.pad.revision) {
          state.base = pad.revision; state.dirty = false; persist(); message('共有済み'); return;
        }
        if ((pad?.revision || null) !== state.base) { showConflict(pad); return; }
        const snapshot = JSON.parse(JSON.stringify(state.pad));
        const saved = await fetch('/api/shared-pad', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pad: snapshot, base: state.base })
        });
        const body = await saved.json();
        if (saved.status === 409) { showConflict(body.pad); return; }
        if (!saved.ok) { message(body.error || '共有に失敗しました'); return; }
        if (body.mode !== 'kv') { message('端末に保存・クラウド未接続'); return; }
        state.base = snapshot.revision;
        if (state.pad.revision === snapshot.revision) state.dirty = false;
        persist();
        message(state.dirty ? '端末に保存済み・同期待ち' : '共有済み');
      } else {
        // Avoid replacing an active selection or an IME composition.
        if (document.activeElement === text) { message('編集中・同期は入力後に反映'); return; }
        state.pad = pad || { text: '', images: [], revision: null };
        state.base = pad?.revision || null;
        persist(); render(); message('共有済み');
      }
    } catch { message('端末に保存・接続が戻ると再同期'); }
    finally { busy = false; }
  }
  text.addEventListener('input', changed);
  text.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
  text.addEventListener('compositionend', () => { composing = false; changed(); });
  text.addEventListener('blur', sync);
  async function addImages(files) {
    const epoch = imageEpoch;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.pad.images.length >= 8) { message('スクショは8枚まで追加できます'); break; }
      try {
        const src = await compressImage(file);
        if (epoch !== imageEpoch) return;
        if (JSON.stringify(state.pad).length + src.length > 2800000) { message('画像容量の上限です。画像を減らしてください'); break; }
        state.pad.images.push(src); changed(); render();
      } catch { message('画像を読み込めませんでした'); }
    }
  }
  const files = document.getElementById('shared-pad-files');
  files.onchange = async () => { await addImages(Array.from(files.files)); files.value = ''; };
  document.getElementById('shared-pad').addEventListener('paste', e => {
    const images = Array.from(e.clipboardData?.items || []).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
    if (images.length) { e.preventDefault(); addImages(images); }
  });
  document.getElementById('shared-pad-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(text.value); message('本文をコピーしました'); }
    catch { text.focus(); text.select(); message('本文を選択しました。コピーしてください'); }
  };
  document.getElementById('shared-pad-clear').onclick = () => {
    if (!text.value && state.pad.images.length === 0) return;
    if (!window.confirm('共有メモ帳の本文とスクショをすべて消去しますか？この変更は他のデバイスにも同期されます。')) return;
    imageEpoch += 1;
    text.value = '';
    state.pad.images = [];
    changed();
    render();
  };
  document.getElementById('shared-pad-sync').onclick = sync;
  document.getElementById('shared-pad-use-remote').onclick = () => {
    try { localStorage.setItem(key + '-backup', JSON.stringify(state)); }
    catch { message('入力の退避に失敗しました。本文をコピーしてください'); return; }
    state = { pad: remote || { text: '', images: [], revision: null }, base: remote?.revision || null, dirty: false };
    conflict.hidden = true; persist(); render(); message('別デバイスの内容を反映・前の入力は端末に退避済み');
  };
  document.getElementById('shared-pad-use-local').onclick = () => {
    state.base = remote?.revision || null; conflict.hidden = true; changed(); sync();
  };
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden) sync(); }, 15000);
  render(); sync();
})();
