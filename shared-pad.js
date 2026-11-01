/* Local drafts survive reloads and failed requests.
   E2EE (AES-256-GCM) with 30-minute auto-expiry and Zero-Knowledge cloud sync. */
(() => {
  const encKey = 'antigravity-shared-pad-v2-enc';
  const text = document.getElementById('shared-pad-text');
  const status = document.getElementById('shared-pad-status');
  const conflict = document.getElementById('shared-pad-conflict');
  const padSection = document.getElementById('shared-pad');
  const maximize = document.getElementById('shared-pad-maximize');
  const shareKeyBtn = document.getElementById('shared-pad-share-key');
  const ttlSelect = document.getElementById('shared-pad-ttl');

  // Purge deprecated v1 plaintext storage
  try {
    localStorage.removeItem('antigravity-shared-pad-v1');
    localStorage.removeItem('antigravity-shared-pad-v1-backup');
  } catch {}

  function setMaximized(expanded) {
    padSection.classList.toggle('is-maximized', expanded);
    document.documentElement.classList.toggle('shared-pad-expanded', expanded);
    maximize.setAttribute('aria-pressed', String(expanded));
    maximize.textContent = expanded ? '↙ 元に戻す' : '⛶ 最大化';
  }
  if (maximize) maximize.onclick = () => setMaximized(!padSection.classList.contains('is-maximized'));

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing || !padSection.classList.contains('is-maximized')) return;
    if (document.querySelector('.modal-overlay.active')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setMaximized(false);
    if (maximize) maximize.focus();
  }, true);

  let state = { pad: { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: 5 }, base: null, dirty: false, keyMismatch: false };
  let remote = null, busy = false, timer, composing = false;
  let imageEpoch = 0;
  let cryptoKey = null, keyInitPromise = null;

  const cryptoMod = window.SharedPadCrypto;

  if (ttlSelect) {
    ttlSelect.value = '5';
    const handleTtlChange = async () => {
      const val = parseInt(ttlSelect.value) || 5;
      state.pad.ttlMinutes = [5, 15, 30].includes(val) ? val : 5;
      await persist(false);
      updateStatusDisplay(`消去期限を${state.pad.ttlMinutes}分に設定`);
    };
    ttlSelect.onchange = handleTtlChange;
    ttlSelect.addEventListener('change', handleTtlChange);
  }

  const message = value => { if (status) status.textContent = value; };

  /**
   * Check TTL expiration and purge if overdue (5m default, or 15m/30m)
   */
  function checkExpiration() {
    if (state.pad?.expiresAt && Date.now() >= state.pad.expiresAt) {
      const configuredTtl = state.pad.ttlMinutes || 5;
      state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl };
      state.dirty = false;
      state.base = null;
      try { localStorage.removeItem(encKey); } catch {}
      render();
      message(`⌛ ${configuredTtl}分経過により自動消去しました`);
      return true;
    }
    return false;
  }

  function getRemainingMinutes() {
    if (!state.pad?.expiresAt) return null;
    const diffMs = state.pad.expiresAt - Date.now();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / 60000);
  }

  /**
   * Update Shared Pad status display
   * @param {string} [defaultMsg] fallback message
   * @param {'sync'|'save'|'idle'} [eventType='sync'] distinguish fetch/sync vs save/post
   */
  function updateStatusDisplay(defaultMsg, eventType = 'sync') {
    if (checkExpiration()) return;
    if (state.keyMismatch) {
      message('🔒 共有メモ: 鍵不一致（要鍵同期）');
      return;
    }
    const mins = getRemainingMinutes();
    if (mins !== null && mins > 0) {
      if (eventType === 'save') {
        message(`🔒 共有メモ: 保存成功（残り約${mins}分）`);
      } else {
        message(`🔒 共有メモ: 接続・同期済（残り約${mins}分）`);
      }
    } else if (defaultMsg) {
      message(defaultMsg);
    }
  }

  /**
   * Helper to extract Base64URL key string from raw string, hash or URL
   */
  function extractKeyString(input) {
    if (!input || typeof input !== 'string') return null;
    let s = input.trim();
    try { s = decodeURIComponent(s); } catch {}
    // If it contains #padkey= or padkey=
    const match = s.match(/padkey=([a-zA-Z0-9_-]{40,60})/i);
    if (match && match[1]) return match[1];
    // If it's a standalone Base64URL string of roughly 43 chars
    const directMatch = s.match(/^[a-zA-Z0-9_-]{40,60}$/);
    if (directMatch) return directMatch[0];
    return null;
  }

  /**
   * Safely import and apply a key (without destroying user's unconfirmed data or cache)
   * 1. Protect unsaved edits (prompt before discard)
   * 2. Import into memory only (do NOT save to IndexedDB yet)
   * 3. Fetch latest encrypted remote memo and test decryption
   *    - If decryption fails: keep existing key and local cache intact!
   *    - If decryption succeeds: safely commit key to IndexedDB and update state.
   */
  async function applyKey(rawInput, notify = true) {
    if (!cryptoMod) return false;
    const keyStr = extractKeyString(rawInput);
    if (!keyStr) {
      if (notify) message('❌ 暗号鍵の形式が正しくありません（43文字の英数字またはURL）');
      return false;
    }

    // 1. Protect uncommitted local edits
    const currentText = text ? text.value : (state.pad?.text || '');
    const hasUnsavedEdits = state.dirty || (currentText && currentText !== (state.pad?.text || ''));
    if (hasUnsavedEdits) {
      const proceed = confirm('⚠️ 未送信の編集内容があります。\n別の鍵を取り込むと現在の編集内容は破棄される可能性がありますが、続行しますか？');
      if (!proceed) {
        if (notify) message('鍵の取り込みをキャンセルしました（編集内容は保護されました）');
        return false;
      }
    }

    // 2. Validate key format and import into memory ONLY (NOT saved to IndexedDB yet!)
    let candidateKey = null;
    try {
      candidateKey = await cryptoMod.importPadKey(keyStr, true);
    } catch (err) {
      if (notify) message('❌ 鍵の解析に失敗しました: ' + err.message);
      return false;
    }

    // 3. Fetch latest server memo to test decryption before committing
    try {
      if (notify) message('🔍 相手端末の暗号化メモとの適合性を検証中...');
      const response = await fetch('/api/shared-pad', { cache: 'no-store' });
      if (!response.ok && response.status !== 410) {
        throw new Error(`サーバー通信エラー (HTTP ${response.status})`);
      }

      let remotePad = null;
      if (response.ok) {
        const result = await response.json();
        remotePad = result?.pad || null;
      }

      // 4. Decryption verification
      if (remotePad && remotePad.v === 2) {
        // Try decrypting with candidateKey
        let decrypted = null;
        try {
          decrypted = await cryptoMod.decryptPad(candidateKey, remotePad);
        } catch {
          // Decryption failed! The key does not match the server's ciphertext!
          // PRESERVE existing key in IndexedDB and memory! PRESERVE existing local cache!
          if (notify) {
            message('❌ 入力された鍵では共有メモを復号できません（既存の鍵とキャッシュを保持）');
            alert('❌ 入力された鍵ではサーバーの暗号化メモを復号できませんでした。\n相手端末の最新の鍵コードまたはURLを確認してください。\n（※既存の暗号鍵やローカルキャッシュは保護されました）');
          }
          return false;
        }

        // Decryption SUCCESS! Now and only now, safely commit the key to IndexedDB
        await cryptoMod.KeyStore.saveKey(candidateKey);
        cryptoKey = candidateKey;
        state.keyMismatch = false;
        state.dirty = false;
        if (text) {
          text.readOnly = false;
          text.placeholder = '文字や画像を貼り付けてデバイス間で共有（5分/15分/30分で自動消去）';
        }
        if (clearBtn) clearBtn.disabled = false;

        if (decrypted.deleted || decrypted.expired) {
          state.pad = { text: '', images: [], revision: null, expiresAt: null };
          try { localStorage.removeItem(encKey); } catch {}
          render();
          message('⌛ 共有メモ: 消去済みのメモでした');
        } else {
          const ttl = [5, 15, 30].includes(remotePad?.ttlMinutes) ? remotePad.ttlMinutes : 5;
          state.pad = {
            text: decrypted.text,
            images: decrypted.images,
            revision: decrypted.revision,
            expiresAt: remotePad.expiresAt || null,
            ttlMinutes: ttl
          };
          state.base = decrypted.revision;
          await persist(false);
          render();
          updateStatusDisplay(null, 'sync');
        }

        if (notify) message('🔑 共有メモ: 暗号鍵を取り込み、最新メモを正常に復号しました！');
        return true;
      } else {
        // Server has no active memo (empty or newly purged)
        // If local has existing ciphertext, prompt before replacing key
        const hasExistingCache = Boolean(localStorage.getItem(encKey));
        if (hasExistingCache) {
          const proceed = confirm('サーバー上に暗号化メモがありません。\nこの鍵を新しい共有暗号鍵として確定保存しますか？\n（※既存の端末内キャッシュは新しい鍵で再暗号化されます）');
          if (!proceed) {
            if (notify) message('鍵の確定をキャンセルしました（既存の鍵を保持）');
            return false;
          }
        }

        await cryptoMod.KeyStore.saveKey(candidateKey);
        cryptoKey = candidateKey;
        state.keyMismatch = false;
        if (text) {
          text.readOnly = false;
          text.placeholder = '文字や画像を貼り付けてデバイス間で共有（5分/15分/30分で自動消去）';
        }
        if (clearBtn) clearBtn.disabled = false;
        if (state.pad.text || (state.pad.images && state.pad.images.length)) {
          await persist(true);
        }
        updateStatusDisplay('共有メモ: 鍵を設定しました（新規）', 'sync');
        if (notify) message('🔑 新しい共有暗号鍵を確定保存しました');
        return true;
      }
    } catch (err) {
      if (notify) {
        message('❌ 鍵の検証に失敗しました: ' + err.message);
        alert('❌ サーバーへの接続に失敗したため、鍵の検証が完了できませんでした。\n既存の暗号鍵とキャッシュは変更されずに保持されました。');
      }
      return false;
    }
  }

  /**
   * Initialize E2EE Key:
   * 1. URL fragment (#padkey=...) takes precedence -> import, save to IndexedDB, purge hash
   * 2. Load from IndexedDB
   * 3. Generate new key and save to IndexedDB
   */
  async function initKey() {
    if (!cryptoMod) {
      message('暗号モジュールを読み込めませんでした');
      return null;
    }

    try {
      // 1. Check URL fragment
      const hash = window.location.hash || '';
      const keyFromHash = extractKeyString(hash);
      if (keyFromHash) {
        const imported = await cryptoMod.importPadKey(keyFromHash, true);
        await cryptoMod.KeyStore.saveKey(imported);
        // Clear fragment immediately for security
        history.replaceState(null, '', window.location.pathname + window.location.search);
        cryptoKey = imported;
        message('🔗 共有キーを取り込みました');
        return cryptoKey;
      }

      // 2. Load from IndexedDB
      const stored = await cryptoMod.KeyStore.loadKey();
      if (stored) {
        cryptoKey = stored;
        return cryptoKey;
      }

      // 3. Generate fresh key
      const generated = await cryptoMod.generatePadKey(true);
      await cryptoMod.KeyStore.saveKey(generated);
      cryptoKey = generated;
      return cryptoKey;
    } catch (err) {
      message('暗号キー初期化エラー: ' + err.message);
      return null;
    }
  }

  /**
   * Persist encrypted ciphertext to LocalStorage (Zero-Knowledge)
   * @param {boolean} [contentModified=false] Only resets expiration upon meaningful content change
   */
  async function persist(contentModified = false) {
    if (!cryptoKey && keyInitPromise) {
      await keyInitPromise;
    }
    if (!cryptoKey || !cryptoMod) return false;
    try {
      const ttl = state.pad.ttlMinutes || 5;
      const opts = {
        revision: state.pad.revision,
        ttlMinutes: ttl
      };
      if (!contentModified && state.pad.expiresAt) {
        opts.now = state.pad.expiresAt - ttl * 60 * 1000;
      }
      const encrypted = await cryptoMod.encryptPad(cryptoKey, state.pad, opts);
      if (contentModified || !state.pad.expiresAt) {
        state.pad.expiresAt = encrypted.expiresAt;
      }
      encrypted.expiresAt = state.pad.expiresAt;
      encrypted.ttlMinutes = ttl;
      localStorage.setItem(encKey, JSON.stringify(encrypted));
      return true;
    } catch {
      message('端末に暗号化保存できません。本文を退避してください');
      return false;
    }
  }

  /**
   * Restore encrypted ciphertext from LocalStorage
   */
  async function restore() {
    try {
      const raw = localStorage.getItem(encKey);
      if (!raw) return;
      const encrypted = JSON.parse(raw);
      if (encrypted.expiresAt && Date.now() >= encrypted.expiresAt) {
        localStorage.removeItem(encKey);
        return;
      }
      if (cryptoKey && encrypted.v === 2) {
        const decrypted = await cryptoMod.decryptPad(cryptoKey, encrypted);
        if (!decrypted.expired && !decrypted.deleted) {
          const ttl = [5, 15, 30].includes(encrypted.ttlMinutes) ? encrypted.ttlMinutes : 5;
          state.pad = {
            text: decrypted.text,
            images: decrypted.images,
            revision: decrypted.revision,
            expiresAt: encrypted.expiresAt,
            ttlMinutes: ttl
          };
          if (ttlSelect) ttlSelect.value = String(ttl);
          render();
        }
      }
    } catch {}
  }

  function imagesInto(container, images, editable) {
    if (!container) return;
    container.replaceChildren();
    images.forEach((src, index) => {
      if (!/^data:image\/(webp|jpeg|png);base64,/.test(src)) return;
      const item = document.createElement('div');
      const img = document.createElement('img');
      img.src = src; img.alt = `共有スクショ ${index + 1}`; img.tabIndex = 0;
      img.onclick = () => openLightbox(src);
      img.onkeydown = e => { if (e.key === 'Enter') openLightbox(src); };
      item.append(img);
      const save = document.createElement('button');
      save.type = 'button'; save.className = 'btn btn-secondary btn-sm'; save.textContent = '画像を保存';
      save.onclick = async () => {
        try {
          const blob = await SharedPadTransfer.png('', [src]);
          SharedPadTransfer.download(blob, `screenshot-${index + 1}.png`);
          message('画像を保存しました');
        } catch (error) { message(error.message); }
      };
      item.append(save);
      if (editable) {
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'btn btn-secondary btn-sm'; remove.textContent = '削除';
        remove.onclick = async () => {
          state.pad.images.splice(index, 1);
          await changed(true);
          render();
        };
        item.append(remove);
      }
      container.append(item);
    });
  }

  function render() {
    if (text) text.value = state.pad.text || '';
    if (ttlSelect && state.pad.ttlMinutes) ttlSelect.value = String(state.pad.ttlMinutes);
    imagesInto(document.getElementById('shared-pad-images'), state.pad.images || [], true);
  }

  async function changed(contentModified = true) {
    if (state.keyMismatch) {
      message('🔒 共有メモ: 別端末の暗号鍵が一致しないため編集できません。「🔑 鍵を管理」から鍵を合わせてください');
      return;
    }
    if (checkExpiration()) return;
    const newText = text ? text.value : '';
    const textChanged = state.pad.text !== newText;
    state.pad.text = newText;
    if (contentModified || textChanged) {
      state.pad.revision = crypto.randomUUID();
      state.dirty = true;
      if (await persist(true)) updateStatusDisplay('共有メモ: 暗号化保存済・同期待ち', 'idle');
    } else {
      if (await persist(false)) updateStatusDisplay('共有メモ: 暗号化保存済', 'idle');
    }
    clearTimeout(timer);
    if (!composing) timer = setTimeout(sync, 1000);
  }

  function showConflict(decryptedPad, rawRemote) {
    remote = decryptedPad;
    const remoteEl = document.getElementById('shared-pad-remote');
    if (remoteEl) remoteEl.textContent = decryptedPad?.text || '（空のメモ）';
    imagesInto(document.getElementById('shared-pad-remote-images'), decryptedPad?.images || [], false);
    if (conflict) conflict.hidden = false;
    message('共有メモ: 別デバイスの変更を確認してください');
  }

  /**
   * Synchronize with cloud / Durable Objects with Zero-Knowledge encryption
   */
  async function sync() {
    if (busy || composing || (conflict && !conflict.hidden)) return;
    if (checkExpiration()) return;
    busy = true;

    try {
      const response = await fetch('/api/shared-pad', { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 410) {
          // 410 Gone: purged/expired on server
          state.pad = { text: '', images: [], revision: null, expiresAt: null };
          state.dirty = false;
          state.keyMismatch = false;
          if (text) {
            text.readOnly = false;
            text.placeholder = '文字や画像を貼り付けてデバイス間で共有（5分/15分/30分で自動消去）';
          }
          if (clearBtn) clearBtn.disabled = false;
          try { localStorage.removeItem(encKey); } catch {}
          render();
          message('⌛ 共有メモ: 消去されました');
          return;
        }
        throw new Error();
      }

      const result = await response.json();
      if (result.mode !== 'kv' && result.mode !== 'do') {
        updateStatusDisplay('共有メモ: 端末保存済（クラウド未接続）', 'idle');
        return;
      }

      let remotePad = result.pad;
      let decryptedRemote = null;

      if (remotePad && remotePad.v === 2 && cryptoKey) {
        try {
          decryptedRemote = await cryptoMod.decryptPad(cryptoKey, remotePad);
          state.keyMismatch = false;
          if (text) {
            text.readOnly = false;
            text.placeholder = '文字や画像を貼り付けてデバイス間で共有（5分/15分/30分で自動消去）';
          }
          if (clearBtn) clearBtn.disabled = false;

          if (decryptedRemote.deleted || decryptedRemote.expired) {
            // Server deleted / expired
            state.pad = { text: '', images: [], revision: null, expiresAt: null };
            state.dirty = false;
            try { localStorage.removeItem(encKey); } catch {}
            render();
            message('⌛ 共有メモ: 消去されました');
            return;
          }
        } catch {
          state.keyMismatch = true;
          if (text) {
            text.readOnly = true;
            text.placeholder = '🔒 別端末の暗号鍵が異なるため編集できません。「🔑 鍵を管理」から鍵を合わせてください';
          }
          if (clearBtn) clearBtn.disabled = true;
          updateStatusDisplay('🔒 共有メモ: 鍵不一致（要鍵同期）', 'idle');
          message('🔒 共有メモ: 別デバイスの暗号キーが異なります（「🔑 鍵を管理」から鍵を同期してください）');
          return;
        }
      } else if (remotePad && typeof remotePad.text === 'string') {
        // Fallback backward compatibility for plain v1
        decryptedRemote = remotePad;
        state.keyMismatch = false;
        if (text) text.readOnly = false;
        if (clearBtn) clearBtn.disabled = false;
      } else if (!remotePad) {
        state.keyMismatch = false;
        if (text) {
          text.readOnly = false;
          text.placeholder = '文字や画像を貼り付けてデバイス間で共有（5分/15分/30分で自動消去）';
        }
        if (clearBtn) clearBtn.disabled = false;
      }

      if (state.dirty) {
        if (state.keyMismatch) {
          return; // Never overwrite server data with mismatched key!
        }
        if (remotePad?.revision === state.pad.revision) {
          state.base = remotePad.revision;
          state.dirty = false;
          await persist();
          updateStatusDisplay(null, 'sync');
          return;
        }
        if ((remotePad?.revision || null) !== state.base) {
          showConflict(decryptedRemote, remotePad);
          return;
        }

        // Encrypt payload before sending to cloud (Strict Zero-Knowledge)
        const ttl = state.pad.ttlMinutes || 5;
        const opts = {
          revision: state.pad.revision,
          ttlMinutes: ttl
        };
        if (state.pad.expiresAt) {
          opts.now = state.pad.expiresAt - ttl * 60 * 1000;
        }
        const encryptedOut = await cryptoMod.encryptPad(cryptoKey, state.pad, opts);
        if (!state.pad.expiresAt) {
          state.pad.expiresAt = encryptedOut.expiresAt;
        } else {
          encryptedOut.expiresAt = state.pad.expiresAt;
        }
        encryptedOut.ttlMinutes = ttl;

        const saved = await fetch('/api/shared-pad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pad: encryptedOut, base: state.base })
        });

        const body = await saved.json();
        if (saved.status === 409) {
          let conflictPad = body.pad;
          if (conflictPad?.v === 2 && cryptoKey) {
            try { conflictPad = await cryptoMod.decryptPad(cryptoKey, conflictPad); } catch {}
          }
          showConflict(conflictPad, body.pad);
          return;
        }
        if (!saved.ok) {
          message(body.error || '共有メモ: 送信保存に失敗しました');
          return;
        }

        state.base = encryptedOut.revision;
        state.dirty = false;
        await persist(false);
        updateStatusDisplay('🔒 共有メモ: 保存成功', 'save');
      } else {
        if (document.activeElement === text) {
          message('共有メモ: 編集中・同期は入力後に反映');
          return;
        }
        if (decryptedRemote) {
          const ttl = [5, 15, 30].includes(remotePad?.ttlMinutes) ? remotePad.ttlMinutes : (state.pad.ttlMinutes || 5);
          state.pad = {
            text: decryptedRemote.text,
            images: decryptedRemote.images,
            revision: decryptedRemote.revision,
            expiresAt: remotePad?.expiresAt || null,
            ttlMinutes: ttl
          };
          state.base = decryptedRemote.revision;
          await persist(false);
          render();
          updateStatusDisplay('🔒 共有メモ: 接続・同期済', 'sync');
        } else {
          state.pad = { text: '', images: [], revision: null, expiresAt: null };
          state.base = null;
          try { localStorage.removeItem(encKey); } catch {}
          render();
          updateStatusDisplay('共有メモ: 接続済（空）', 'sync');
        }
      }
    } catch {
      updateStatusDisplay('共有メモ: 未接続（再接続待ち）', 'idle');
    } finally {
      busy = false;
    }
  }

  if (text) {
    text.addEventListener('input', () => changed());
    text.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
    text.addEventListener('compositionend', () => { composing = false; changed(); });
    text.addEventListener('blur', sync);
  }

  async function addImages(files) {
    const epoch = imageEpoch;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.pad.images.length >= 8) { message('スクショは8枚まで追加できます'); break; }
      try {
        const src = await compressImage(file);
        if (epoch !== imageEpoch) return;
        if (JSON.stringify(state.pad).length + src.length > 2800000) {
          message('画像容量の上限です。画像を減らしてください');
          break;
        }
        state.pad.images.push(src);
        await changed();
        render();
      } catch {
        message('画像を読み込めませんでした');
      }
    }
  }

  const files = document.getElementById('shared-pad-files');
  if (files) {
    files.onchange = async () => {
      await addImages(Array.from(files.files));
      files.value = '';
    };
  }

  if (padSection) {
    padSection.addEventListener('paste', e => {
      const images = Array.from(e.clipboardData?.items || [])
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter(Boolean);
      if (images.length) {
        e.preventDefault();
        addImages(images);
      }
    });
  }

  const copyBtn = document.getElementById('shared-pad-copy');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const body = text ? text.value : '', images = [...state.pad.images];
      try {
        await SharedPadTransfer.copy(body, images);
        message(images.length ? '本文とスクショをコピーしました。AIの入力欄に貼り付けてください' : '本文をコピーしました');
      } catch (error) {
        message(error.message + '。貼れない場合は「まとめて画像保存」から添付してください');
      }
    };
  }

  const saveBtn = document.getElementById('shared-pad-save');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const body = text ? text.value : '', images = [...state.pad.images];
      if (!body && !images.length) { message('保存する内容がありません'); return; }
      try {
        const blob = await SharedPadTransfer.png(body, images);
        SharedPadTransfer.download(blob, 'shared-memo.png');
        message('本文とスクショをまとめた画像を保存しました');
      } catch (error) { message(error.message); }
    };
  }

  const copyTextBtn = document.getElementById('shared-pad-copy-text');
  if (copyTextBtn) {
    copyTextBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(text ? text.value : '');
        message('本文をコピーしました');
      } catch {
        if (text) { text.focus(); text.select(); }
        message('本文を選択しました。コピーしてください');
      }
    };
  }

  const clearBtn = document.getElementById('shared-pad-clear');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (state.keyMismatch) {
        message('🔒 別端末の暗号鍵が一致しないため、全消去できません');
        return;
      }
      if (!text?.value && state.pad.images.length === 0) return;
      if (!window.confirm('共有メモ帳の本文とスクショをすべて消去しますか？この変更は他のデバイスにも同期されます。')) return;
      imageEpoch += 1;
      state.pad = { text: '', images: [], revision: crypto.randomUUID(), expiresAt: null };
      if (text) text.value = '';
      state.dirty = true;
      try { localStorage.removeItem(encKey); } catch {}
      render();

      // Send tombstone to cloud
      if (cryptoKey && cryptoMod) {
        try {
          const tombstone = {
            v: 2,
            alg: 'A256GCM',
            iv: '',
            ct: '',
            revision: state.pad.revision,
            updatedAt: Date.now(),
            expiresAt: Date.now() + 1800000,
            deleted: true
          };
          await fetch('/api/shared-pad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pad: tombstone, base: state.base })
          });
        } catch {}
      }
      message('🧹 共有メモ: 全消去完了');
    };
  }

  // Key Management & Sync Modal
  async function showKeyModal() {
    if (!cryptoKey && keyInitPromise) await keyInitPromise;
    if (!cryptoKey || !cryptoMod) {
      message('暗号鍵が利用できません');
      return;
    }

    let rawKeyStr = '';
    try {
      rawKeyStr = await cryptoMod.exportPadKey(cryptoKey);
    } catch (e) {
      message('鍵のエクスポートに失敗しました: ' + e.message);
      return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}#padkey=${rawKeyStr}`;

    // Immediately copy share URL to clipboard for seamless UX & headless/mock test compatibility
    try {
      await navigator.clipboard.writeText(shareUrl);
      message('🔑 鍵付きURLをコピーしました！他端末のアドレスバーに貼ると鍵を共有できます');
    } catch {}

    let modal = document.getElementById('shared-pad-key-modal');
    if (!modal && document.body?.appendChild) {
      modal = document.createElement('div');
      modal.id = 'shared-pad-key-modal';
      document.body.appendChild(modal);
    }
    if (!modal) return;

    if (modal.style) {
      modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center;
        z-index: 10000; padding: 16px; box-sizing: border-box; backdrop-filter: blur(4px);
      `;
    }

    const statusBanner = state.keyMismatch
      ? `<div style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 6px; padding: 10px; margin-bottom: 14px; font-size: 13px; color: #fca5a5;">
           ⚠️ <strong>別端末の暗号鍵と一致していません</strong><br>
           サーバーに保存されているメモを復号できません。<br>
           相手端末の鍵を取り込むか、相手端末にこの鍵を共有してください。
         </div>`
      : `<div style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; border-radius: 6px; padding: 10px; margin-bottom: 14px; font-size: 13px; color: #6ee7b7;">
           ✅ <strong>暗号鍵は正常に有効化されています</strong><br>
           他端末と同期するには、以下の鍵を共有してください。
         </div>`;

    modal.innerHTML = `
      <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 12px; max-width: 480px; width: 100%; padding: 20px; box-sizing: border-box; color: #f4f4f5; font-family: sans-serif; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <h3 style="margin: 0; font-size: 17px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <span>🔑</span> 暗号化共有メモ帳 — 鍵の管理
          </h3>
          <button id="modal-close-x" style="background: transparent; border: none; color: #a1a1aa; font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
        </div>

        ${statusBanner}

        <!-- Section 1: この端末の鍵を相手に送る -->
        <div style="margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid #27272a;">
          <label style="display: block; font-size: 13px; font-weight: 600; color: #fbbf24; margin-bottom: 6px;">
            📤 この端末の鍵を他端末へ共有
          </label>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <button id="btn-copy-url" type="button" style="flex: 1; padding: 9px 12px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
              🔗 共有URLをコピー
            </button>
            <button id="btn-copy-code" type="button" style="flex: 1; padding: 9px 12px; background: #3f3f46; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
              📋 鍵コードのみコピー
            </button>
          </div>
          <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.4;">
            ※ URLを開くと自動で鍵が保存され、アドレスバーの鍵は即座に消去されます。
          </p>
        </div>

        <!-- Section 2: 相手端末の鍵を取り込む -->
        <div style="margin-bottom: 18px;">
          <label style="display: block; font-size: 13px; font-weight: 600; color: #34d399; margin-bottom: 6px;">
            📥 相手端末の鍵を取り込んで同期
          </label>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <input id="input-import-key" type="text" placeholder="URLまたは鍵コード（43文字）を貼り付け" style="flex: 1; padding: 8px 10px; background: #09090b; border: 1px solid #3f3f46; border-radius: 6px; color: #fff; font-size: 13px; outline: none;">
            <button id="btn-do-import" type="button" style="padding: 8px 14px; background: #059669; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;">
              同期する
            </button>
          </div>
          <p style="margin: 0; font-size: 11px; color: #a1a1aa; line-height: 1.4;">
            ※ 相手の鍵を適用すると、相手が書いた暗号化メモを復号して閲覧・編集できるようになります。
          </p>
        </div>

        <div style="text-align: right;">
          <button id="modal-close-btn" type="button" style="padding: 6px 16px; background: #27272a; color: #d4d4d8; border: 1px solid #3f3f46; border-radius: 6px; font-size: 13px; cursor: pointer;">
            閉じる
          </button>
        </div>
      </div>
    `;

    // Event handlers
    const closeModal = () => { if (modal.style) modal.style.display = 'none'; };
    if (modal.querySelector) {
      const closeX = modal.querySelector('#modal-close-x');
      if (closeX) closeX.onclick = closeModal;
      const closeBtn = modal.querySelector('#modal-close-btn');
      if (closeBtn) closeBtn.onclick = closeModal;
      modal.onclick = (e) => { if (e.target === modal) closeModal(); };

      const copyUrlBtn = modal.querySelector('#btn-copy-url');
      if (copyUrlBtn) {
        copyUrlBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(shareUrl);
            message('🔗 鍵付きURLをコピーしました！他端末のアドレスバーで開いてください');
            closeModal();
          } catch {
            window.prompt?.('下記の共有URLをコピーして相手端末で開いてください：', shareUrl);
          }
        };
      }

      const copyCodeBtn = modal.querySelector('#btn-copy-code');
      if (copyCodeBtn) {
        copyCodeBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(rawKeyStr);
            message('📋 鍵コード（43文字）をコピーしました！相手端末に貼り付けてください');
            closeModal();
          } catch {
            window.prompt?.('下記の鍵コードをコピーしてください：', rawKeyStr);
          }
        };
      }

      const doImportBtn = modal.querySelector('#btn-do-import');
      if (doImportBtn) {
        doImportBtn.onclick = async () => {
          const val = modal.querySelector('#input-import-key')?.value;
          if (!val) {
            alert('URLまたは鍵コードを入力してください');
            return;
          }
          const ok = await applyKey(val, true);
          if (ok) {
            closeModal();
          }
        };
      }
    }

    if (modal.style) modal.style.display = 'flex';
  }

  // Key Share UI Button
  if (shareKeyBtn) {
    shareKeyBtn.onclick = showKeyModal;
  }

  const syncBtn = document.getElementById('shared-pad-sync');
  if (syncBtn) syncBtn.onclick = sync;

  const useRemoteBtn = document.getElementById('shared-pad-use-remote');
  if (useRemoteBtn) {
    useRemoteBtn.onclick = async () => {
      state = {
        pad: remote || { text: '', images: [], revision: null, expiresAt: null },
        base: remote?.revision || null,
        dirty: false,
        keyMismatch: false
      };
      if (conflict) conflict.hidden = true;
      await persist();
      render();
      updateStatusDisplay('別デバイスの内容を反映しました');
    };
  }

  const useLocalBtn = document.getElementById('shared-pad-use-local');
  if (useLocalBtn) {
    useLocalBtn.onclick = async () => {
      state.base = remote?.revision || null;
      if (conflict) conflict.hidden = true;
      await changed();
      await sync();
    };
  }

  window.addEventListener('online', sync);
  window.addEventListener('hashchange', async () => {
    const hash = window.location.hash || '';
    const keyFromHash = extractKeyString(hash);
    if (keyFromHash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      await applyKey(keyFromHash, true);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkExpiration();
      sync();
    }
  });

  // Regular expiration check & sync interval
  setInterval(() => {
    checkExpiration();
    if (!document.hidden) sync();
  }, 10000);

  // Initialize Key and restore on load
  keyInitPromise = initKey();
  (async () => {
    await keyInitPromise;
    await restore();
    render();
    await sync();
  })();
})();
