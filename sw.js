// Antigravity Mission Hub - Progressive Web App Service Worker (v47)
const CACHE_NAME = 'antigravity-hub-v47';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/shared-pad-crypto.js',
  '/shared-pad.js',
  '/shared-pad-transfer.js',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// Install: Cache critical shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. Cloudflare Workers KV / Durable Objects API & Access endpoints:
  // Bypass Service Worker interception so the browser handles API requests directly
  // with native Cloudflare Access session context and client-side timeout/retry logic.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) {
    return;
  }

  // 2. Google Fonts & CDN: Cache First with network update
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((response) => {
          return response || fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. Navigation requests (HTML): Network First with Cloudflare Access passthrough
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        // If redirected (e.g. Cloudflare Access login flow) or auth required, NEVER hijack or cache
        if (!networkResponse || networkResponse.redirected || networkResponse.status === 401 || networkResponse.status === 403 || (networkResponse.status >= 300 && networkResponse.status < 400)) {
          return networkResponse;
        }

        // Only cache verified successful responses for our own origin
        if (networkResponse.status === 200) {
          const respUrl = new URL(networkResponse.url || request.url);
          if (respUrl.origin === url.origin) {
            const cloned = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback: only when network is genuinely unreachable
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || caches.match('/') || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // 4. Core Scripts & Styles: Network First (Ensures immediate update)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  // 5. Other static assets (Images, Icons): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
