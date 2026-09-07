/*
 * MAJAL service worker — hand-written, no build-time dependency.
 *
 * Strategy:
 *   - App shell (/, index icons, manifest) is precached on install so the app is
 *     installable and launches offline.
 *   - Navigations: network-first with an offline fallback to the cached shell, so a
 *     fresh index.html (which references hashed /assets bundles) is preferred when online
 *     but the app still opens with no connection.
 *   - Hashed build assets under /assets/*: cache-first (immutable, content-hashed).
 *   - Cross-origin requests and anything under /api are bypassed entirely so auth,
 *     Firebase, fonts and API calls always hit the network and are never cached.
 *
 * Bump CACHE_VERSION to force a full precache refresh.
 */
/* بصمة البناء تُطبع هنا عند البناء (scripts/build-stamp.mjs). بايتات هذا الملف يجب أن
   تتغيّر مع كل إصدار، وإلا لم يرَ المتصفح تحديثاً أصلاً ولم تعلم التبويبات المفتوحة بشيء. */
const BUILD = '__BUILD_ID__';
const CACHE_VERSION = `majal-${BUILD}`;
/* الأصول المبصومة بهاش في اسمها وحدها تُقدَّم من الكاش مباشرة. */
const HASHED = /\/assets\/.+[-.][A-Za-z0-9_]{8,}\.[a-z0-9]+$/i;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll would reject the whole install if any single asset 404s; add them
      // individually and tolerate misses so one bad path never blocks activation.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin GETs. Cross-origin (fonts, Firebase, analytics) and any API
  // route always go straight to the network, uncached.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  /* Navigations (HTML) always come from the network with cache: "no-store" — a stored
     shell names hashed bundles the next deploy removed. Cache is an offline fallback only. */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(url.pathname + url.search, {cache: 'no-store', credentials: 'same-origin'})
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/index.html') || caches.match('/')),
        ),
    );
    return;
  }

  // Hashed, immutable build assets: cache-first — their names change with their bytes.
  if (HASHED.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else same-origin (icons, manifest, unhashed files): network first, so a
  // deploy is never masked by a stored copy; the cache stays as the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
