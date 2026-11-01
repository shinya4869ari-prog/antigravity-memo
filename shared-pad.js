/* Local drafts survive reloads and failed requests.
   E2EE (AES-256-GCM) Blackboard ("黒板") with 5/15/30-minute auto-expiry,
   "消さずに残す" (keepForever) toggle, and Zero-Knowledge cloud sync. */
(() => {
  const encKey = 'antigravity-shared-pad-v2-enc';
  const text = document.getElementById('shared-pad-text');
  const status = document.getElementById('shared-pad-status');
  const conflict = document.getElementById('shared-pad-conflict');
  const padSection = document.getElementById('shared-pad');
  const maximize = document.getElementById('shared-pad-maximize');
  const shareKeyBtn = document.getElementById('shared-pad-share-key');
  const ttlSelect = document.getElementById('shared-pad-ttl');
  const keepToggle = document.getElementById('shared-pad-keep');
  const keepLabel = document.getElementById('shared-pad-keep-label');

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

  let state = {
    pad: { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: 5, keepForever: false },
    base: null,
    dirty: false,
    modeChangeOnly: false,
    keyMismatch: false
  };
  let remote = null, busy = false, timer, composing = false;
  let imageEpoch = 0;
  let cryptoKey = null, keyInitPromise = null;

  const cryptoMod = window.SharedPadCrypto;
  const message = value => { if (status) status.textContent = value; };

  function syncModeUi() {
    const keepForever = Boolean(state.pad?.keepForever);
    const currentTtl = [5, 15, 30].includes(state.pad?.ttlMinutes) ? state.pad.ttlMinutes : 5;
    if (keepToggle) {
      keepToggle.checked = keepForever;
      keepToggle.disabled = Boolean(state.keyMismatch);
    }
    if (keepLabel && keepLabel.classList) {
      keepLabel.classList.toggle('is-active', keepForever);
    }
    if (ttlSelect) {
      ttlSelect.value = String(currentTtl);
      ttlSelect.disabled = keepForever || Boolean(state.keyMismatch);
      ttlSelect.title = keepForever
        ? '「消さずに残す」がONのため自動削除なし'
        : '自動消去までの時間（最後の実内容更新から計算）';
      if (ttlSelect.options && ttlSelect.options.length) {
        for (let i = 0; i < ttlSelect.options.length; i++) {
          const opt = ttlSelect.options[i];
          opt.textContent = keepForever ? '📌 自動削除なし' : `⏳ 自動消去: ${opt.value}分`;
        }
      }
    }
    if (text && !state.keyMismatch) {
      text.placeholder = keepForever
        ? '文字や画像を貼り付けてデバイス間で共有（自動削除なし・手動で全消去するまで保持）'
        : '文字や画像を貼り付けてデバイス間で共有（5分/15分/30分で自動消去）';
    }
  }

  /**
   * Check TTL expiration and purge if overdue (when keepForever is OFF)
   */
  function checkExpiration() {
    if (!state.pad?.keepForever && state.pad?.expiresAt && Date.now() >= state.pad.expiresAt) {
      const configuredTtl = [5, 15, 30].includes(state.pad.ttlMinutes) ? state.pad.ttlMinutes : 5;
      state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl, keepForever: false };
      state.dirty = false;
      state.modeChangeOnly = false;
      state.base = null;
      try { localStorage.removeItem(encKey); } catch {}
      render();
      message(`⌛ ${configuredTtl}分経過により自動消去しました`);
      return true;
    }
    return false;
  }

  function getRemainingMinutes() {
    if (state.pad?.keepForever) return null;
    if (!state.pad?.expiresAt) return null;
    const diffMs = state.pad.expiresAt - Date.now();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / 60000);
  }

  /**
   * Update Blackboard status display
   * Never claims "保存成功" or "接続・同期済" when eventType === 'idle' or state.dirty is true.
   * @param {string} [defaultMsg] fallback message
   * @param {'sync'|'save'|'idle'} [eventType='sync'] distinguish fetch/sync vs save/post vs pending/offline
   */
  function updateStatusDisplay(defaultMsg, eventType = 'sync') {
    if (checkExpiration()) return;
    if (state.keyMismatch) {
      message('🔒 鍵不一致（要鍵同期）');
      return;
    }
    if (eventType === 'idle' || state.dirty) {
      if (defaultMsg) {
        message(defaultMsg);
      } else if (state.pad?.keepForever) {
        message('端末保存済・同期待ち（自動削除なし）');
      } else {
        message('端末保存済・同期待ち');
      }
      return;
    }

    const hasActiveContent = Boolean(state.pad?.text || (state.pad?.images && state.pad.images.length > 0) || state.base);
    if (hasActiveContent && state.pad?.keepForever) {
      if (eventType === 'save') {
        message('🔒 保存成功（自動削除なし）');
      } else {
        message('🔒 接続・同期済（自動削除なし）');
      }
      return;
    }

    const mins = getRemainingMinutes();
    if (mins !== null && mins > 0) {
      if (eventType === 'save') {
        message(`🔒 保存成功（残り約${mins}分）`);
      } else {
        message(`🔒 接続・同期済（残り約${mins}分）`);
      }
    } else if (defaultMsg) {
      message(defaultMsg);
    }
  }

  if (keepToggle) {
    keepToggle.checked = false;
    const handleKeepToggleChange = async () => {
      if (state.keyMismatch) {
        keepToggle.checked = Boolean(state.pad.keepForever);
        message('🔒 別端末の暗号鍵が一致しないため設定を変更できません');
        return;
      }
      // Never resurrect an already expired memo via toggle operation
      if (checkExpiration()) {
        keepToggle.checked = false;
        render();
        return;
      }
      const nextKeep = Boolean(keepToggle.checked);
      if (Boolean(state.pad.keepForever) === nextKeep) return;

      const currentText = text ? text.value : (state.pad.text || '');
      const hasContent = Boolean(currentText || (state.pad.images && state.pad.images.length > 0) || state.base);
      const selectedTtl = ttlSelect ? parseInt(ttlSelect.value, 10) : state.pad.ttlMinutes;
      const ttl = [5, 15, 30].includes(selectedTtl) ? selectedTtl : ([5, 15, 30].includes(state.pad.ttlMinutes) ? state.pad.ttlMinutes : 5);

      state.pad.keepForever = nextKeep;
      state.pad.ttlMinutes = ttl;

      if (!hasContent) {
        state.pad.expiresAt = null;
        render();
        message(nextKeep ? '📌 自動削除なしに設定（入力時に保存）' : `⏳ 自動消去を${ttl}分に設定`);
        return;
      }

      if (nextKeep) {
        state.pad.expiresAt = null;
      } else {
        state.pad.expiresAt = Date.now() + ttl * 60000;
      }
      state.pad.revision = crypto.randomUUID();
      state.dirty = true;
      state.modeChangeOnly = true;
      render();
      await persist(true);
      updateStatusDisplay(
        nextKeep ? '自動削除なしへ変更（サーバー確認中…）' : `自動消去（${ttl}分）へ変更（サーバー確認中…）`,
        'idle'
      );
      clearTimeout(timer);
      await sync();
    };
    keepToggle.onchange = handleKeepToggleChange;
    keepToggle.addEventListener('change', handleKeepToggleChange);
  }

  if (ttlSelect) {
    ttlSelect.value = '5';
    const handleTtlChange = async () => {
      if (state.keyMismatch || state.pad.keepForever) return;
      if (checkExpiration()) return;
      const val = parseInt(ttlSelect.value, 10) || 5;
      const nextTtl = [5, 15, 30].includes(val) ? val : 5;
      if (state.pad.ttlMinutes === nextTtl && state.pad.expiresAt) {
        return;
      }
      state.pad.ttlMinutes = nextTtl;
      const currentText = text ? text.value : (state.pad.text || '');
      const hasContent = Boolean(currentText || (state.pad.images && state.pad.images.length > 0) || state.base);
      if (!hasContent) {
        render();
        message(`⏳ 自動消去を${nextTtl}分に設定`);
        return;
      }
      state.pad.expiresAt = Date.now() + nextTtl * 60000;
      state.pad.revision = crypto.randomUUID();
      state.dirty = true;
      state.modeChangeOnly = true;
      render();
      await persist(true);
      updateStatusDisplay(`消去期限を${nextTtl}分に変更（サーバー確認中…）`, 'idle');
      clearTimeout(timer);
      await sync();
    };
    ttlSelect.onchange = handleTtlChange;
    ttlSelect.addEventListener('change', handleTtlChange);
  }

  /**
   * Helper to extract Base64URL key string from raw string, hash or URL
   */
  function extractKeyString(input) {
    if (!input || typeof input !== 'string') return null;
    let s = input.trim();
    try { s = decodeURIComponent(s); } catch {}
    const match = s.match(/padkey=([a-zA-Z0-9_-]{40,60})/i);
    if (match && match[1]) return match[1];
    const directMatch = s.match(/^[a-zA-Z0-9_-]{40,60}$/);
    if (directMatch) return directMatch[0];
    return null;
  }

  /**
   * Safely import and apply a key (without destroying user's unconfirmed data or cache)
   */
  async function applyKey(rawInput, notify = true) {
    if (!cryptoMod) return false;
    const keyStr = extractKeyString(rawInput);
    if (!keyStr) {
      if (notify) message('❌ 暗号鍵の形式が正しくありません（43文字の英数字またはURL）');
      return false;
    }

    const currentText = text ? text.value : (state.pad?.text || '');
    const hasUnsavedEdits = state.dirty || (currentText && currentText !== (state.pad?.text || ''));
    if (hasUnsavedEdits) {
      const proceed = confirm('⚠️ 未送信の編集内容があります。\n別の鍵を取り込むと現在の編集内容は破棄される可能性がありますが、続行しますか？');
      if (!proceed) {
        if (notify) message('鍵の取り込みをキャンセルしました（編集内容は保護されました）');
        return false;
      }
    }

    let candidateKey = null;
    try {
      candidateKey = await cryptoMod.importPadKey(keyStr, true);
    } catch (err) {
      if (notify) message('❌ 鍵の解析に失敗しました: ' + err.message);
      return false;
    }

    try {
      if (notify) message('🔍 相手端末の黒板データとの適合性を検証中...');
      const response = await fetch('/api/shared-pad', { cache: 'no-store' });
      if (!response.ok && response.status !== 410) {
        throw new Error(`サーバー通信エラー (HTTP ${response.status})`);
      }

      let remotePad = null;
      if (response.ok) {
        const result = await response.json();
        remotePad = result?.pad || null;
      }

      if (remotePad && remotePad.v === 2) {
        let decrypted = null;
        try {
          decrypted = await cryptoMod.decryptPad(candidateKey, remotePad);
        } catch {
          if (notify) {
            message('❌ 入力された鍵では黒板を復号できません（既存の鍵とキャッシュを保持）');
            alert('❌ 入力された鍵ではサーバーの黒板データを復号できませんでした。\n相手端末の最新の鍵コードまたはURLを確認してください。\n（※既存の暗号鍵やローカルキャッシュは保護されました）');
          }
          return false;
        }

        await cryptoMod.KeyStore.saveKey(candidateKey);
        cryptoKey = candidateKey;
        state.keyMismatch = false;
        state.dirty = false;
        state.modeChangeOnly = false;
        if (text) text.readOnly = false;
        if (clearBtn) clearBtn.disabled = false;

        if (decrypted.deleted || decrypted.expired) {
          state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: 5, keepForever: false };
          state.base = null;
          try { localStorage.removeItem(encKey); } catch {}
          render();
          message('⌛ 消去済みのメモでした');
        } else {
          const ttl = [5, 15, 30].includes(remotePad?.ttlMinutes) ? remotePad.ttlMinutes : 5;
          const keepForever = Boolean(remotePad?.keepForever ?? decrypted?.keepForever ?? false);
          state.pad = {
            text: decrypted.text,
            images: decrypted.images,
            revision: decrypted.revision,
            expiresAt: keepForever ? null : (remotePad.expiresAt || null),
            ttlMinutes: ttl,
            keepForever
          };
          state.base = decrypted.revision;
          await persist(false);
          render();
          updateStatusDisplay(null, 'sync');
        }

        if (notify) message('🔑 暗号鍵を取り込み、最新メモを正常に復号しました！');
        return true;
      } else {
        const hasExistingCache = Boolean(localStorage.getItem(encKey));
        if (hasExistingCache) {
          const proceed = confirm('サーバー上に黒板のメモがありません。\nこの鍵を新しい共有暗号鍵として確定保存しますか？\n（※既存の端末内キャッシュは新しい鍵で再暗号化されます）');
          if (!proceed) {
            if (notify) message('鍵の確定をキャンセルしました（既存の鍵を保持）');
            return false;
          }
        }

        await cryptoMod.KeyStore.saveKey(candidateKey);
        cryptoKey = candidateKey;
        state.keyMismatch = false;
        if (text) text.readOnly = false;
        if (clearBtn) clearBtn.disabled = false;
        render();
        if (state.pad.text || (state.pad.images && state.pad.images.length)) {
          await persist(true);
        }
        updateStatusDisplay('鍵を設定しました（新規）', 'sync');
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
   * Initialize E2EE Key
   */
  async function initKey() {
    if (!cryptoMod) {
      message('暗号モジュールを読み込めませんでした');
      return null;
    }

    try {
      const hash = window.location.hash || '';
      const keyFromHash = extractKeyString(hash);
      if (keyFromHash) {
        const imported = await cryptoMod.importPadKey(keyFromHash, true);
        await cryptoMod.KeyStore.saveKey(imported);
        history.replaceState(null, '', window.location.pathname + window.location.search);
        cryptoKey = imported;
        message('🔗 共有キーを取り込みました');
        return cryptoKey;
      }

      const stored = await cryptoMod.KeyStore.loadKey();
      if (stored) {
        cryptoKey = stored;
        return cryptoKey;
      }

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
   * @param {boolean} [contentModified=false] Only resets expiration upon meaningful content/mode change
   */
  async function persist(contentModified = false) {
    if (!cryptoKey && keyInitPromise) {
      await keyInitPromise;
    }
    if (!cryptoKey || !cryptoMod) return false;
    try {
      const ttl = [5, 15, 30].includes(state.pad.ttlMinutes) ? state.pad.ttlMinutes : 5;
      const keepForever = Boolean(state.pad.keepForever);
      const opts = {
        revision: state.pad.revision,
        ttlMinutes: ttl,
        keepForever
      };
      if (!keepForever && !contentModified && state.pad.expiresAt) {
        opts.now = state.pad.expiresAt - ttl * 60 * 1000;
      }
      const encrypted = await cryptoMod.encryptPad(cryptoKey, state.pad, opts);
      if (keepForever) {
        state.pad.expiresAt = null;
      } else if (contentModified || !state.pad.expiresAt) {
        state.pad.expiresAt = encrypted.expiresAt;
      }
      encrypted.expiresAt = keepForever ? null : state.pad.expiresAt;
      encrypted.ttlMinutes = ttl;
      encrypted.keepForever = keepForever;
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
      if (!encrypted.keepForever && encrypted.expiresAt && Date.now() >= encrypted.expiresAt) {
        localStorage.removeItem(encKey);
        return;
      }
      if (cryptoKey && encrypted.v === 2) {
        const decrypted = await cryptoMod.decryptPad(cryptoKey, encrypted);
        if (!decrypted.expired && !decrypted.deleted) {
          const ttl = [5, 15, 30].includes(encrypted.ttlMinutes) ? encrypted.ttlMinutes : 5;
          const keepForever = Boolean(encrypted.keepForever ?? decrypted.keepForever ?? false);
          state.pad = {
            text: decrypted.text,
            images: decrypted.images,
            revision: decrypted.revision,
            expiresAt: keepForever ? null : (encrypted.expiresAt ?? null),
            ttlMinutes: ttl,
            keepForever
          };
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
    syncModeUi();
    imagesInto(document.getElementById('shared-pad-images'), state.pad.images || [], true);
  }

  async function changed(contentModified = true) {
    if (state.keyMismatch) {
      message('🔒 別端末の暗号鍵が一致しないため編集できません。「🔑 鍵を管理」から鍵を合わせてください');
      return;
    }
    if (checkExpiration()) return;
    const newText = text ? text.value : '';
    const textChanged = state.pad.text !== newText;
    state.pad.text = newText;
    if (contentModified || textChanged) {
      state.pad.revision = crypto.randomUUID();
      state.dirty = true;
      state.modeChangeOnly = false;
      if (await persist(true)) updateStatusDisplay('暗号化保存済・同期待ち', 'idle');
    } else {
      if (await persist(false)) updateStatusDisplay('暗号化保存済', 'idle');
    }
    clearTimeout(timer);
    if (!composing) timer = setTimeout(sync, 1000);
  }

  function showConflict(decryptedPad, rawRemote) {
    const keepForever = Boolean(rawRemote?.keepForever ?? decryptedPad?.keepForever ?? false);
    const ttl = [5, 15, 30].includes(rawRemote?.ttlMinutes) ? rawRemote.ttlMinutes : (decryptedPad?.ttlMinutes || 5);
    remote = decryptedPad
      ? {
          ...decryptedPad,
          keepForever,
          ttlMinutes: ttl,
          expiresAt: keepForever ? null : (rawRemote?.expiresAt ?? decryptedPad?.expiresAt ?? null)
        }
      : { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: 5, keepForever: false };
    const remoteEl = document.getElementById('shared-pad-remote');
    if (remoteEl) remoteEl.textContent = decryptedPad?.text || '（空のメモ）';
    imagesInto(document.getElementById('shared-pad-remote-images'), decryptedPad?.images || [], false);
    if (conflict) conflict.hidden = false;
    message('⚠️ 別デバイスの変更を確認してください');
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
          const configuredTtl = [5, 15, 30].includes(state.pad?.ttlMinutes) ? state.pad.ttlMinutes : 5;
          state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl, keepForever: false };
          state.dirty = false;
          state.modeChangeOnly = false;
          state.base = null;
          state.keyMismatch = false;
          if (text) text.readOnly = false;
          if (clearBtn) clearBtn.disabled = false;
          try { localStorage.removeItem(encKey); } catch {}
          render();
          message('⌛ 消去されました');
          return;
        }
        throw new Error();
      }

      const result = await response.json();
      if (result.mode !== 'kv' && result.mode !== 'do') {
        updateStatusDisplay('端末保存済（クラウド未接続）', 'idle');
        return;
      }

      let remotePad = result.pad;
      let decryptedRemote = null;
      const serverDeletedOrExpired = Boolean(result.deleted || result.expired);

      if (remotePad && remotePad.v === 2 && cryptoKey) {
        try {
          decryptedRemote = await cryptoMod.decryptPad(cryptoKey, remotePad);
          state.keyMismatch = false;
          if (text) text.readOnly = false;
          if (clearBtn) clearBtn.disabled = false;

          if (decryptedRemote.deleted || decryptedRemote.expired) {
            if (!state.dirty || state.modeChangeOnly) {
              const configuredTtl = [5, 15, 30].includes(state.pad?.ttlMinutes) ? state.pad.ttlMinutes : 5;
              state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl, keepForever: false };
              state.dirty = false;
              state.modeChangeOnly = false;
              state.base = null;
              try { localStorage.removeItem(encKey); } catch {}
              render();
              message('⌛ 消去されました');
              return;
            }
            remotePad = null;
            decryptedRemote = null;
          }
        } catch {
          state.keyMismatch = true;
          if (text) {
            text.readOnly = true;
            text.placeholder = '🔒 別端末の暗号鍵が異なるため編集できません。「🔑 鍵を管理」から鍵を合わせてください';
          }
          if (clearBtn) clearBtn.disabled = true;
          syncModeUi();
          updateStatusDisplay('🔒 鍵不一致（要鍵同期）', 'idle');
          message('🔒 別デバイスの暗号キーが異なります（「🔑 鍵を管理」から鍵を同期してください）');
          return;
        }
      } else if (remotePad && typeof remotePad.text === 'string') {
        decryptedRemote = remotePad;
        state.keyMismatch = false;
        if (text) text.readOnly = false;
        if (clearBtn) clearBtn.disabled = false;
      } else if (!remotePad) {
        state.keyMismatch = false;
        if (text) text.readOnly = false;
        if (clearBtn) clearBtn.disabled = false;

        // If the server record was deleted or expired, never allow a toggle operation to resurrect it
        if (serverDeletedOrExpired && state.dirty && state.modeChangeOnly) {
          const configuredTtl = [5, 15, 30].includes(state.pad?.ttlMinutes) ? state.pad.ttlMinutes : 5;
          state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl, keepForever: false };
          state.dirty = false;
          state.modeChangeOnly = false;
          state.base = null;
          try { localStorage.removeItem(encKey); } catch {}
          render();
          message(result.expired ? '⌛ すでに期限切れのため変更できませんでした' : '⌛ すでに消去済みのため変更できませんでした');
          return;
        }
      }

      if (state.dirty) {
        if (state.keyMismatch) {
          return; // Never overwrite server data with mismatched key!
        }
        if (remotePad?.revision === state.pad.revision) {
          state.base = remotePad.revision;
          state.dirty = false;
          state.modeChangeOnly = false;
          await persist(false);
          render();
          updateStatusDisplay(null, 'sync');
          return;
        }
        if ((remotePad?.revision || null) !== state.base) {
          // If this device only toggled mode/TTL on a stale base while another device updated the server,
          // or if another device changed content, prevent stale rollback!
          if (state.modeChangeOnly && decryptedRemote) {
            const ttl = [5, 15, 30].includes(remotePad?.ttlMinutes) ? remotePad.ttlMinutes : (state.pad.ttlMinutes || 5);
            const keepForever = Boolean(remotePad?.keepForever ?? decryptedRemote?.keepForever ?? false);
            state.pad = {
              text: decryptedRemote.text,
              images: decryptedRemote.images,
              revision: decryptedRemote.revision,
              expiresAt: keepForever ? null : (remotePad?.expiresAt || null),
              ttlMinutes: ttl,
              keepForever
            };
            state.base = decryptedRemote.revision;
            state.dirty = false;
            state.modeChangeOnly = false;
            await persist(false);
            render();
            updateStatusDisplay('🔒 他端末の最新設定を反映しました', 'sync');
            return;
          }
          showConflict(decryptedRemote, remotePad);
          return;
        }

        // Encrypt payload before sending to cloud (Strict Zero-Knowledge)
        const ttl = [5, 15, 30].includes(state.pad.ttlMinutes) ? state.pad.ttlMinutes : 5;
        const keepForever = Boolean(state.pad.keepForever);
        const opts = {
          revision: state.pad.revision,
          ttlMinutes: ttl,
          keepForever
        };
        if (!keepForever && state.pad.expiresAt) {
          opts.now = state.pad.expiresAt - ttl * 60 * 1000;
        }
        const encryptedOut = await cryptoMod.encryptPad(cryptoKey, state.pad, opts);
        if (keepForever) {
          state.pad.expiresAt = null;
          encryptedOut.expiresAt = null;
        } else if (!state.pad.expiresAt) {
          state.pad.expiresAt = encryptedOut.expiresAt;
        } else {
          encryptedOut.expiresAt = state.pad.expiresAt;
        }
        encryptedOut.ttlMinutes = ttl;
        encryptedOut.keepForever = keepForever;
        if (state.modeChangeOnly) {
          encryptedOut.modeChangeOnly = true;
        }

        const saved = await fetch('/api/shared-pad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pad: encryptedOut, base: state.base })
        });

        let body = {};
        try { body = await saved.json(); } catch {}

        if (saved.status === 410) {
          const configuredTtl = [5, 15, 30].includes(state.pad?.ttlMinutes) ? state.pad.ttlMinutes : 5;
          state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl, keepForever: false };
          state.dirty = false;
          state.modeChangeOnly = false;
          state.base = null;
          try { localStorage.removeItem(encKey); } catch {}
          render();
          message('⌛ すでに消去または期限切れのため保存できませんでした');
          return;
        }

        if (saved.status === 409) {
          let conflictPad = body.pad;
          if (conflictPad?.v === 2 && cryptoKey) {
            try { conflictPad = await cryptoMod.decryptPad(cryptoKey, conflictPad); } catch {}
          }
          if (state.modeChangeOnly && conflictPad && !conflictPad.deleted && !conflictPad.expired) {
            const rTtl = [5, 15, 30].includes(body.pad?.ttlMinutes) ? body.pad.ttlMinutes : 5;
            const rKeep = Boolean(body.pad?.keepForever ?? conflictPad?.keepForever ?? false);
            state.pad = {
              text: conflictPad.text,
              images: conflictPad.images,
              revision: conflictPad.revision,
              expiresAt: rKeep ? null : (body.pad?.expiresAt || null),
              ttlMinutes: rTtl,
              keepForever: rKeep
            };
            state.base = conflictPad.revision;
            state.dirty = false;
            state.modeChangeOnly = false;
            await persist(false);
            render();
            updateStatusDisplay('🔒 他端末の最新設定を反映しました', 'sync');
            return;
          }
          showConflict(conflictPad, body.pad);
          return;
        }

        if (!saved.ok) {
          message(body.error || '⚠️ 送信保存に失敗しました（未同期）');
          return;
        }

        if (body.pad && typeof body.pad === 'object') {
          state.pad.keepForever = Boolean(body.pad.keepForever);
          if ([5, 15, 30].includes(body.pad.ttlMinutes)) {
            state.pad.ttlMinutes = body.pad.ttlMinutes;
          }
          state.pad.expiresAt = state.pad.keepForever ? null : (body.pad.expiresAt ?? state.pad.expiresAt);
        }
        state.base = encryptedOut.revision;
        state.dirty = false;
        state.modeChangeOnly = false;
        await persist(false);
        render();
        updateStatusDisplay('🔒 保存成功', 'save');
      } else {
        if (document.activeElement === text) {
          message('編集中・同期は入力後に反映');
          return;
        }
        if (decryptedRemote) {
          const ttl = [5, 15, 30].includes(remotePad?.ttlMinutes) ? remotePad.ttlMinutes : (state.pad.ttlMinutes || 5);
          const keepForever = Boolean(remotePad?.keepForever ?? decryptedRemote?.keepForever ?? false);
          state.pad = {
            text: decryptedRemote.text,
            images: decryptedRemote.images,
            revision: decryptedRemote.revision,
            expiresAt: keepForever ? null : (remotePad?.expiresAt || null),
            ttlMinutes: ttl,
            keepForever
          };
          state.base = decryptedRemote.revision;
          state.modeChangeOnly = false;
          await persist(false);
          render();
          updateStatusDisplay('🔒 接続・同期済', 'sync');
        } else {
          const configuredTtl = [5, 15, 30].includes(state.pad?.ttlMinutes) ? state.pad.ttlMinutes : 5;
          const keepForever = (serverDeletedOrExpired || state.base !== null) ? false : Boolean(state.pad?.keepForever);
          state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl, keepForever };
          state.base = null;
          state.modeChangeOnly = false;
          try { localStorage.removeItem(encKey); } catch {}
          render();
          updateStatusDisplay(
            serverDeletedOrExpired
              ? (result.expired ? '⌛ 期限切れにより消去されました' : '⌛ 消去されました')
              : '接続済（空）',
            'sync'
          );
        }
      }
    } catch {
      updateStatusDisplay('⚠️ 未接続・未同期（再接続待ち）', 'idle');
    } finally {
      busy = false;
    }
  }

  if (text) {
    text.addEventListener('input', () => changed(false));
    text.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
    text.addEventListener('compositionend', () => { composing = false; changed(false); });
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
        await changed(true);
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
      if (!text?.value && state.pad.images.length === 0 && !state.base) return;
      if (!window.confirm('黒板の本文とスクショをすべて消去しますか？この変更は他のデバイスにも同期されます。')) return;
      imageEpoch += 1;
      const prevBase = state.base;
      const delRevision = crypto.randomUUID();
      const configuredTtl = [5, 15, 30].includes(state.pad?.ttlMinutes) ? state.pad.ttlMinutes : 5;
      state.pad = { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: configuredTtl, keepForever: false };
      if (text) text.value = '';
      state.dirty = false;
      state.modeChangeOnly = false;
      state.base = null;
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
            revision: delRevision,
            updatedAt: Date.now(),
            expiresAt: null,
            keepForever: false,
            deleted: true
          };
          await fetch('/api/shared-pad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pad: tombstone, base: prevBase })
          });
        } catch {}
      }
      message('🧹 全消去完了');
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
           サーバーに保存されている黒板メモを復号できません。<br>
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
            <span>🔑</span> 黒板 — 鍵の管理
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
            ※ 相手の鍵を適用すると、相手が書いた黒板の暗号化メモを復号して閲覧・編集できるようになります。
          </p>
        </div>

        <div style="text-align: right;">
          <button id="modal-close-btn" type="button" style="padding: 6px 16px; background: #27272a; color: #d4d4d8; border: 1px solid #3f3f46; border-radius: 6px; font-size: 13px; cursor: pointer;">
            閉じる
          </button>
        </div>
      </div>
    `;

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
        pad: remote || { text: '', images: [], revision: null, expiresAt: null, ttlMinutes: 5, keepForever: false },
        base: remote?.revision || null,
        dirty: false,
        modeChangeOnly: false,
        keyMismatch: false
      };
      if (conflict) conflict.hidden = true;
      await persist(false);
      render();
      updateStatusDisplay('🔒 別デバイスの内容を反映しました', 'sync');
    };
  }

  const useLocalBtn = document.getElementById('shared-pad-use-local');
  if (useLocalBtn) {
    useLocalBtn.onclick = async () => {
      state.base = remote?.revision || null;
      if (remote && !state.modeChangeOnly) {
        state.pad.keepForever = Boolean(remote.keepForever);
        if ([5, 15, 30].includes(remote.ttlMinutes)) {
          state.pad.ttlMinutes = remote.ttlMinutes;
        }
      }
      if (conflict) conflict.hidden = true;
      await changed(true);
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
