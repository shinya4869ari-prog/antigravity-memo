/**
 * Antigravity Shared Pad - Zero-Knowledge E2EE Cryptographic Module
 * Browser Script: sets window.SharedPadCrypto & globalThis.SharedPadCrypto
 * 
 * Spec: AES-256-GCM (Web Crypto API compliant)
 * - 256-bit symmetric key generated on client
 * - 96-bit (12-byte) unique random IV per encryption
 * - 128-bit authentication tag
 * - IndexedDB extractable key management
 * - Zero-knowledge: keys and plaintexts never touch server/DO/KV
 */
(() => {
  const TE = new TextEncoder();
  const TD = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function base64UrlToBytes(base64Url) {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    return base64ToBytes(base64);
  }

  async function generatePadKey(extractable = true) {
    return await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt']
    );
  }

  async function exportPadKey(cryptoKey) {
    const raw = await crypto.subtle.exportKey('raw', cryptoKey);
    return bytesToBase64Url(new Uint8Array(raw));
  }

  async function importPadKey(base64UrlKey, extractable = true) {
    if (typeof base64UrlKey !== 'string' || base64UrlKey.trim().length === 0) {
      throw new Error('Invalid key string');
    }
    const rawBytes = base64UrlToBytes(base64UrlKey.trim());
    if (rawBytes.byteLength !== 32) {
      throw new Error(`Invalid AES-256 key length: expected 32 bytes, got ${rawBytes.byteLength}`);
    }
    return await crypto.subtle.importKey(
      'raw',
      rawBytes,
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptPad(cryptoKey, padData, options = {}) {
    if (!cryptoKey) throw new Error('CryptoKey is required');
    if (!padData || typeof padData.text !== 'string') {
      throw new Error('Invalid pad data: text string required');
    }

    const keepForever = Boolean(options.keepForever ?? padData.keepForever ?? false);
    const ttlMinutes = [5, 15, 30].includes(options.ttlMinutes ?? padData.ttlMinutes)
      ? (options.ttlMinutes ?? padData.ttlMinutes)
      : 5;
    const images = Array.isArray(padData.images) ? padData.images : [];
    const plaintextJson = JSON.stringify({
      text: padData.text,
      images: images,
      keepForever,
      ttlMinutes
    });

    const plainBytes = TE.encode(plaintextJson);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      plainBytes
    );

    const now = typeof options === 'number' ? options : (options?.now ?? Date.now());
    const revision = options.revision ?? (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(now));

    return {
      v: 2,
      alg: 'A256GCM',
      iv: bytesToBase64(iv),
      ct: bytesToBase64(new Uint8Array(cipherBuffer)),
      revision,
      updatedAt: now,
      keepForever,
      ttlMinutes,
      expiresAt: keepForever ? null : (now + ttlMinutes * 60 * 1000),
      deleted: false
    };
  }

  async function decryptPad(cryptoKey, encryptedPayload, options = {}) {
    if (!cryptoKey) throw new Error('CryptoKey is required');
    if (!encryptedPayload || encryptedPayload.v !== 2 || encryptedPayload.alg !== 'A256GCM') {
      throw new Error('Unsupported or invalid encrypted payload version');
    }

    const now = typeof options === 'number' ? options : (options?.now ?? Date.now());

    if (encryptedPayload.deleted) {
      return {
        text: '',
        images: [],
        revision: encryptedPayload.revision || '',
        keepForever: false,
        ttlMinutes: 5,
        expiresAt: null,
        expired: false,
        deleted: true
      };
    }

    if (!encryptedPayload.keepForever && encryptedPayload.expiresAt && now >= encryptedPayload.expiresAt) {
      return {
        text: '',
        images: [],
        revision: encryptedPayload.revision || '',
        keepForever: false,
        ttlMinutes: encryptedPayload.ttlMinutes || 5,
        expiresAt: encryptedPayload.expiresAt,
        expired: true,
        deleted: false
      };
    }

    if (typeof encryptedPayload.iv !== 'string' || typeof encryptedPayload.ct !== 'string') {
      throw new Error('Missing ciphertext or IV');
    }

    const ivBytes = base64ToBytes(encryptedPayload.iv);
    if (ivBytes.byteLength !== 12) {
      throw new Error(`Invalid IV length: expected 12 bytes, got ${ivBytes.byteLength}`);
    }

    const cipherBytes = base64ToBytes(encryptedPayload.ct);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      cipherBytes
    );

    const plainJson = TD.decode(decryptedBuffer);
    const data = JSON.parse(plainJson);

    const keepForever = Boolean(encryptedPayload.keepForever ?? data.keepForever ?? false);
    const ttlMinutes = [5, 15, 30].includes(encryptedPayload.ttlMinutes ?? data.ttlMinutes)
      ? (encryptedPayload.ttlMinutes ?? data.ttlMinutes)
      : 5;

    return {
      text: typeof data.text === 'string' ? data.text : '',
      images: Array.isArray(data.images) ? data.images : [],
      revision: encryptedPayload.revision || '',
      keepForever,
      ttlMinutes,
      expiresAt: keepForever ? null : (encryptedPayload.expiresAt || null),
      expired: false,
      deleted: false
    };
  }

  const KeyStore = {
    DB_NAME: 'antigravity-pad-keystore',
    STORE_NAME: 'keys',
    KEY_NAME: 'active-pad-key',
    LS_KEY_NAME: 'antigravity-shared-pad-key-v2',

    open() {
      return new Promise((resolve) => {
        if (typeof indexedDB === 'undefined' || !indexedDB) {
          return resolve(null);
        }
        let settled = false;
        const finish = (val) => {
          if (!settled) {
            settled = true;
            resolve(val);
          }
        };
        const timer = setTimeout(() => finish(null), 1500);
        try {
          const req = indexedDB.open(this.DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(this.STORE_NAME)) {
              db.createObjectStore(this.STORE_NAME);
            }
          };
          req.onsuccess = () => {
            clearTimeout(timer);
            const db = req.result;
            if (db && typeof db.onversionchange !== 'undefined') {
              db.onversionchange = () => { try { db.close(); } catch {} };
            }
            finish(db);
          };
          req.onerror = () => {
            clearTimeout(timer);
            finish(null);
          };
          req.onblocked = () => {
            clearTimeout(timer);
            finish(null);
          };
        } catch {
          clearTimeout(timer);
          finish(null);
        }
      });
    },

    async loadFromLocalStorage() {
      try {
        if (typeof localStorage === 'undefined' || !localStorage) return null;
        const raw = localStorage.getItem(this.LS_KEY_NAME);
        if (!raw || typeof raw !== 'string') return null;
        return await importPadKey(raw.trim(), true);
      } catch {
        return null;
      }
    },

    async saveToLocalStorage(cryptoKey) {
      try {
        if (!cryptoKey || typeof localStorage === 'undefined' || !localStorage) return;
        const raw = await exportPadKey(cryptoKey);
        if (raw) {
          localStorage.setItem(this.LS_KEY_NAME, raw);
        }
      } catch {}
    },

    async loadKey() {
      let idbKey = null;
      try {
        const db = await this.open();
        if (db) {
          idbKey = await new Promise((resolve) => {
            try {
              const tx = db.transaction(this.STORE_NAME, 'readonly');
              const req = tx.objectStore(this.STORE_NAME).get(this.KEY_NAME);
              req.onsuccess = () => resolve(req.result || null);
              req.onerror = () => resolve(null);
              tx.oncomplete = () => { try { db.close(); } catch {} };
              tx.onerror = () => { try { db.close(); } catch {} };
            } catch {
              try { db.close(); } catch {}
              resolve(null);
            }
          });
        }
      } catch {}

      if (idbKey) {
        if (typeof idbKey === 'string') {
          try {
            const imported = await importPadKey(idbKey, true);
            await this.saveToLocalStorage(imported);
            return imported;
          } catch {}
        } else {
          // Ensure existing IndexedDB key is also mirrored into localStorage for redundancy
          await this.saveToLocalStorage(idbKey);
          return idbKey;
        }
      }

      // Fallback: recover key from localStorage if IndexedDB was blocked/cleared/unavailable
      const lsKey = await this.loadFromLocalStorage();
      if (lsKey) {
        try { await this.saveKey(lsKey); } catch {}
        return lsKey;
      }
      return null;
    },

    async saveKey(cryptoKey) {
      if (!cryptoKey) return;
      await this.saveToLocalStorage(cryptoKey);
      try {
        const db = await this.open();
        if (!db) return;
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const req = tx.objectStore(this.STORE_NAME).put(cryptoKey, this.KEY_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            tx.oncomplete = () => { try { db.close(); } catch {} };
            tx.onerror = () => { try { db.close(); } catch {} };
          } catch {
            try { db.close(); } catch {}
            resolve();
          }
        });
      } catch {}
    },

    async clearKey() {
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          localStorage.removeItem(this.LS_KEY_NAME);
        }
      } catch {}
      try {
        const db = await this.open();
        if (!db) return;
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const req = tx.objectStore(this.STORE_NAME).delete(this.KEY_NAME);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            tx.oncomplete = () => { try { db.close(); } catch {} };
            tx.onerror = () => { try { db.close(); } catch {} };
          } catch {
            try { db.close(); } catch {}
            resolve();
          }
        });
      } catch {}
    }
  };

  const SharedPadCrypto = {
    bytesToBase64,
    base64ToBytes,
    bytesToBase64Url,
    base64UrlToBytes,
    generatePadKey,
    exportPadKey,
    importPadKey,
    encryptPad,
    decryptPad,
    KeyStore
  };

  if (typeof window !== 'undefined') {
    window.SharedPadCrypto = SharedPadCrypto;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.SharedPadCrypto = SharedPadCrypto;
  }
})();
