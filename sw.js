// ============================================================
//  Begarlist 16 — Service Worker
//  Strategy:
//    - App shell (HTML/CSS/JS)  → Cache-first, update in background
//    - Category JSON data files → Cache-first, update in background
//    - Images (photos)          → Cache-first (large, long-lived)
// ============================================================

const CACHE_VERSION   = 'bg16-v1';
const DATA_CACHE      = 'bg16-data-v1';
const IMAGE_CACHE     = 'bg16-images-v1';

// Core app shell files to pre-cache on install
const SHELL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
];

// ── INSTALL: pre-cache app shell ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean up old caches ────────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_VERSION, DATA_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => !currentCaches.includes(name))
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: route requests to the right strategy ───────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests (except images from known CDNs)
  if (event.request.method !== 'GET') return;

  // ── Images: photos from Google CDN or same-origin images ──
  if (
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('lh3.google') ||
    /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirstImage(event.request));
    return;
  }

  // ── Category JSON data files ──
  if (url.pathname.match(/\/data-[\w-]+\.json$/)) {
    event.respondWith(staleWhileRevalidate(event.request, DATA_CACHE));
    return;
  }

  // ── App shell (HTML, CSS, JS) ──
  if (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css')  ||
    url.pathname.endsWith('.js')   ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  ) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_VERSION));
    return;
  }
});

// ── STRATEGY: Stale-While-Revalidate ─────────────────────────
// Serve from cache immediately; fetch fresh copy in background.
async function staleWhileRevalidate(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);

  // Kick off a background update regardless
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);

  return cached || fetchPromise;
}

// ── STRATEGY: Cache-First for images (large, rarely change) ──
async function cacheFirstImage(request) {
  const cache  = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Return a minimal transparent placeholder if offline and no cache
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}
