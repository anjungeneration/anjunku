// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU — Service Worker | sw.js
// Strategy : Navigation → Network-First | Assets → Stale-While-Revalidate
// Build    : 20260521-v86
// ═══════════════════════════════════════════════════════════════════════════

const CACHE = 'anjunku-v86';

// App shell — pre-cached on install for instant offline load
const PRECACHE = [
  '/anjunku/',
  '/anjunku/index.html',
  '/anjunku/style.css?v=5.28',
  '/anjunku/script.js?v=5.56',
  '/anjunku/dashboard-core.js?v=5.1',
  '/anjunku/ui-components.js?v=5.2',
  '/anjunku/manifest.json?v=2.0',
  '/anjunku/logo-app.png',
];

// Never intercept these hosts — always go live
const BYPASS = [
  'supabase.co',    // real-time DB + auth + storage
  'ui-avatars.com', // dynamically generated avatars
  'qrserver.com',   // dynamically generated QR codes
];

// Offline fallback HTML (navigation only)
const OFFLINE_HTML = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANJUNKU — Offline</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#060d06;color:#4ade80;
display:flex;align-items:center;justify-content:center;height:100vh;
flex-direction:column;gap:1.25rem;text-align:center;padding:2rem;}
h2{font-size:2rem;letter-spacing:.08em;}
p{color:#666;font-size:.9rem;max-width:360px;line-height:1.65;}
button{margin-top:.5rem;padding:.55rem 1.4rem;background:#39ff14;color:#000;
border:none;border-radius:999px;font-weight:700;cursor:pointer;font-size:.85rem;}
</style></head><body>
<h2>ANJUNKU</h2>
<p>Tidak ada koneksi internet. Periksa jaringan Anda dan coba lagi.</p>
<button onclick="location.reload()">Coba Lagi</button>
</body></html>`;

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // Non-fatal: missing assets are skipped so install never blocks
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: evict old caches, then notify clients to reload ────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Bypass dynamic/external hosts — never cache these
  if (BYPASS.some(h => url.hostname.includes(h))) return;

  const isNavigation = e.request.mode === 'navigate';

  // ── Navigation: Network-First ──────────────────────────────────────────────
  // Always fetch index.html fresh so new deploys are visible immediately.
  // Falls back to cached version when offline.
  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp && resp.status === 200) {
            caches.open(CACHE).then(cache => cache.put(e.request, resp.clone()));
          }
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(e.request);
          return cached || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })
    );
    return;
  }

  // ── Assets: Stale-While-Revalidate ────────────────────────────────────────
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);

      const networkFetch = fetch(e.request)
        .then(resp => {
          if (resp && (resp.status === 200 || resp.type === 'opaque')) {
            cache.put(e.request, resp.clone());
          }
          return resp;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
