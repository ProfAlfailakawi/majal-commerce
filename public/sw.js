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
 *   - «نُحدّث البرنامج»: أثناء النشر تجيب واجهة Google الأمامية عن التنقّل بصفحة خطأ
 *     إنجليزية (500/502/503/504) لا يكتبها خادمنا. /updating.html تُحفظ عند التثبيت في
 *     ذاكرة ثابتة الاسم، وتُقدَّم (503، no-store) للتنقّل وحده حين يعود بأحد تلك الرموز أو
 *     ينقطع والجهاز متّصل. لا تمسّ /api ولا غير GET ولا الجواب الناجح، ولا يُحفظ 5xx أبداً.
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

/* ذاكرة ثابتة الاسم لا تتبع البصمة: الصفحة تلزم في اللحظة التي يتبدّل فيها الإصدار نفسه. */
const UPDATING_CACHE = 'majal-updating';
const UPDATING_PAGE = '/updating.html';
const isUpdatingStatus = (status) => status === 500 || status === 502 || status === 503 || status === 504;

const storeUpdatingPage = () =>
  fetch(UPDATING_PAGE, {cache: 'no-store', credentials: 'same-origin'})
    .then((response) => {
      if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return undefined;
      return caches.open(UPDATING_CACHE).then((cache) => cache.put(UPDATING_PAGE, response));
    })
    .catch(() => undefined);

/* مسحها «الاستعادة» مع كل الذاكرة؟ تُعاد بعد أول تنقّل ناجح، ولا يُنتظر ذلك. */
const refillUpdatingPage = () =>
  caches
    .open(UPDATING_CACHE)
    .then((cache) => cache.match(UPDATING_PAGE))
    .then((hit) => (hit ? undefined : storeUpdatingPage()))
    .catch(() => undefined);

/* الصفحة المحفوظة بجوابٍ جديد: 503 كي لا يحسبها أحد نجاحاً، وno-store كي لا تُحفظ مكان
   الصفحة المطلوبة. سياستها (CSP) تُنسخ معها كما أرسلها الخادم. */
const updatingResponse = () =>
  caches
    .open(UPDATING_CACHE)
    .then((cache) => cache.match(UPDATING_PAGE))
    .then((page) => {
      if (!page) return null;
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '5',
        'X-Majal-Updating': '1',
      };
      const csp = page.headers.get('content-security-policy');
      if (csp) headers['Content-Security-Policy'] = csp;
      return page.text().then((body) => new Response(body, {status: 503, statusText: 'Service Unavailable', headers}));
    })
    .catch(() => null);

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/favicon.svg',
  '/boot.js',
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
      .then(() => storeUpdatingPage())
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
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE && key !== UPDATING_CACHE)
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
  /* 5xx = المنصّة تبدّل الخادم أثناء النشر: صفحة التحديث تنتظره ثم تعيد فتح الرابط نفسه،
     ولا يُحفظ ذلك الجواب. وانقطاعٌ والجهاز يقول إنه متّصل هو اللحظة نفسها؛ أمّا دون اتصال
     حقيقي فيبقى الهيكل المحفوظ كما كان. */
  if (request.mode === 'navigate') {
    const offlineShell = () =>
      caches
        .match(request)
        .then((cached) => cached || caches.match('/index.html') || caches.match('/'));
    event.respondWith(
      fetch(url.pathname + url.search, {cache: 'no-store', credentials: 'same-origin'})
        .then((response) => {
          if (isUpdatingStatus(response.status)) return updatingResponse().then((page) => page || response);
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          if (response.ok) void refillUpdatingPage();
          return response;
        })
        .catch(() => {
          if (self.navigator && self.navigator.onLine === false) return offlineShell();
          return updatingResponse().then((page) => page || offlineShell());
        }),
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
            /* لا يُحفظ إلا الجواب الناجح: حزمةٌ طُلبت أثناء النشر فجاءت بصفحة خطأ المنصّة
               كانت ستُقدَّم من الذاكرة بعدها إلى الأبد (الاسم المبصوم لا يتغيّر). */
            if (response.ok) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            }
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
        /* خطٌّ أو أيقونة طُلبت أثناء النشر فجاءت بصفحة خطأ المنصّة: النسخة المحفوظة أولى. */
        else if (response && isUpdatingStatus(response.status)) {
          return caches.match(request).then((cached) => cached || response);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
