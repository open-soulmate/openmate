// Service Worker for OpenMate PWA
// Version bumped to clear stale caches from previous broken token state
const CACHE_NAME = 'openmate-v3';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install - cache only truly static assets (NOT dynamic pages like /chat)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate - clean ALL old caches aggressively
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// Fetch - network first, cache fallback for static assets only
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Don't cache API calls
  if (event.request.url.includes('/api/')) return;
  // Don't cache WebSocket upgrades
  if (event.request.headers.get('upgrade') === 'websocket') return;
  // Don't cache HTML navigation requests (Next.js pages are dynamic)
  if (event.request.mode === 'navigate') return;
  // Don't cache JS/CSS chunks (they include content hashes, but stale = broken)
  if (event.request.url.includes('/_next/static/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful opaque/basic responses for truly static assets
        if (response && (response.status === 200 || response.type === 'opaque')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
