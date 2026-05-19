// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU — Service Worker | sw.js
// Strategy : Stale-While-Revalidate  (app shell pre-cached)
// Build    : 20260519-v26
// ═══════════════════════════════════════════════════════════════════════════

const CACHE = 'anjunku-v26';

// App shell — pre-cached on install for instant offline load
const PRECACHE = [
  '/anjunku/',
  '/anjunku/index.html',
  '/anjunku/style.css?v=5.0',
  '/anjunku/script.js?v=5.0',
  '/anjunku/dashboard-core.js?v=5.0',
  '/anjunku/ui-components.js?v=5.0',
  '/anjunku/manifest.json',
  '/anjunku/logo-app.png',
];

// Never intercept these hosts — always go live
const BYPASS = [
  'supabase.co',    // real-time DB + auth + storage
  'ui-avatars.com', // dynamically generated avatars
  'qrserver.com',   // dynamically generated QR codes
];

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // Non-fatal: missing assets are skipped so install never blocks
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// ── Activate: evict old caches ───────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: Stale-While-Revalidate ────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Bypass dynamic/external hosts — never cache these
  if (BYPASS.some(h => url.hostname.includes(h))) return;

  const isNavigation = e.request.mode === 'navigate';

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);

      // Background revalidation (updates cache silently)
      const networkFetch = fetch(e.request)
        .then(resp => {
          if (resp && (resp.status === 200 || resp.type === 'opaque')) {
            cache.put(e.request, resp.clone());
          }
          return resp;
        })
        .catch(() => {
          // Network unavailable — serve cached; for navigations, inline fallback
          if (isNavigation && !cached) {
            return new Response(
              `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
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
              </body></html>`,
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          }
          return cached;
        });

      // Stale-While-Revalidate: serve cached instantly, update silently
      return cached || networkFetch;
    })
  );
});
