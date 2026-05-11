// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU — Service Worker | sw.js
// Strategy: Stale-While-Revalidate
// ═══════════════════════════════════════════════════════════════════════════

const CACHE = 'anjunku-v17';

// Skip installation pre-caching; let the fetch handler populate the cache
// organically so we don't block startup on CDN latency.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Never intercept these hosts — always go live
const BYPASS = [
  'supabase.co',       // real-time DB + auth
  'ui-avatars.com',    // dynamic generated avatars
  'qrserver.com',      // dynamic QR codes
];

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (BYPASS.some(h => url.hostname.includes(h))) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);

      // Start network fetch (revalidate in background)
      const networkFetch = fetch(e.request)
        .then(resp => {
          // Only cache successful same-origin or cross-origin opaque responses
          if (resp && (resp.status === 200 || resp.type === 'opaque')) {
            cache.put(e.request, resp.clone());
          }
          return resp;
        })
        .catch(() => cached); // network failed → return whatever is cached

      // Stale-while-revalidate: serve cached immediately if available,
      // otherwise wait for the network.
      return cached || networkFetch;
    })
  );
});
