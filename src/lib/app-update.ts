/*
 * التحديث الذاتي الصامت.
 *
 * المستخدم ليس تقنيًا، ولا يجوز أن يُطلب منه «hard refresh» ولا «امسح الكاش»: هذه صياغة
 * تطلب من إنسان أن يُصلح البرنامج يدويًا. البرنامج هو الذي يُصلح نفسه، بلا إشعار ولا زر.
 *
 * أربع طبقات:
 *  1) بصمة إصدار: ثابت `__BUILD_ID__` داخل الحزمة مقابل `GET /api/version` من الخادم.
 *  2) منارة إصدار: نسأل الخادم عند pageshow المستأنَف من الـ bfcache (أكثر الحالات نسيانًا،
 *     إذ يستأنف كود قديم من الذاكرة بلا شبكة ولا أي حدث)، وعند العودة إلى التبويب، وكل
 *     دقيقتين كشبكة أمان.
 *  3) تحديث صامت ثم تصعيد: update() للعامل ← إفراغ ذاكرة الـ API ← إعادة تحميل واحدة، مع
 *     تسجيل البصمة الهدف. فإن عادت الصفحة على البصمة القديمة رغم أنها حاولت هذا الإصدار
 *     بعينه، فإعادة التحميل جاءت من نسخة مخزّنة قديمة ← ننفّذ الـ hard refresh نيابةً عن
 *     المستخدم: حذف كل الـ caches وإلغاء تسجيل العامل ثم إعادة تحميل — مرة واحدة فقط.
 *  4) لا إعادة تحميل فوق عمل جارٍ: نافذة حوارية مفتوحة أو سحب/إفلات أو aria-busy تؤجّل
 *     المحاولة أربع ثوانٍ. إعادة التحميل الصحيحة هي التي لا يلاحظها أحد.
 *
 * كل مسار تعافٍ محروس بعلامة تُمسح عند النجاح، فلا تنشأ حلقة إعادة تحميل. ولا نلمس بيانات
 * المستخدم المخزّنة (تفضيلاته وجلسته) — نمسح الكاش وعامل الخدمة فقط.
 */

declare const __BUILD_ID__: string;

/** بصمة الحزمة التي يعمل بها هذا التبويب الآن. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

const TARGET_KEY = 'app-update:target-build';   // البصمة التي حاولنا الوصول إليها قبل إعادة التحميل
const HARD_KEY = 'app-update:hard-refreshed';   // حارس التصعيد: hard refresh مرة واحدة لا غير
const CHUNK_KEY = 'app-update:chunk-recovered'; // حارس تعافي الحزم المفقودة (sessionStorage)
const POLL_MS = 120_000;                        // شبكة الأمان البطيئة: كل دقيقتين
const BUSY_RETRY_MS = 4_000;                    // الصفحة مشغولة: نعيد المحاولة بعد أربع ثوانٍ
const VERSION_URL = '/api/version';

/**
 * وضع الإنتاج. لا نكتب `import.meta.env.PROD` مباشرةً: بعض إعدادات tsconfig في هذه
 * المستودعات لا تعرف أنواع Vite، فيسقط `tsc --noEmit` على أن `env` غير موجودة على
 * ImportMeta. القراءة عبر نوع محلّي تعطي السلوك نفسه وتُجمَّع في كل مكان.
 */
function isProduction(): boolean {
  const meta = import.meta as unknown as { env?: { PROD?: boolean; DEV?: boolean } };
  return meta.env?.PROD === true;
}

let updating = false;
let dragging = 0;
let installed = false;
let lastTypingAt = 0;

/* ------------------------------- تخزين محروس ------------------------------- */
// التخزين قد يكون محجوبًا (وضع خاص، سياسة متصفح) — لا يجوز أن يُسقط ذلك التحديث كله.
function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* تجاهُل */ }
}
function dropLocal(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* تجاهُل */ }
}

/* --------------------------- الطبقة الرابعة: الانشغال --------------------------- */
/**
 * العنصر معروض فعلًا؟ كثير من الواجهات تُبقي حاويات الحوار في الشجرة وهي مخفية، ولو
 * عددناها انشغالًا لتوقّف التحديث إلى الأبد.
 */
function isVisible(element: Element): boolean {
  try {
    const check = (element as unknown as { checkVisibility?: () => boolean }).checkVisibility;
    if (typeof check === 'function') return check.call(element);
    const rect = (element as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch { return true; }
}

function hasVisible(selector: string): boolean {
  try {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (isVisible(element)) return true;
    }
  } catch { /* تجاهُل */ }
  return false;
}

/** هل على الصفحة عمل جارٍ يضيع لو أُعيد تحميلها الآن؟ */
export function pageIsBusy(): boolean {
  if (dragging > 0) return true;
  // كتابة جارية خلال آخر عشر ثوانٍ: لا نقطع على المستخدم إدخاله.
  if (lastTypingAt && Date.now() - lastTypingAt < 10_000) return true;
  try {
    const doc = document;
    if (doc.documentElement.getAttribute('aria-busy') === 'true') return true;
    if (doc.body?.getAttribute('aria-busy') === 'true') return true;
    if (hasVisible('dialog[open]')) return true;
    if (hasVisible('[aria-busy="true"]')) return true;
    if (hasVisible('[aria-modal="true"]')) return true;
    if (hasVisible('[role="dialog"], [role="alertdialog"]')) return true;
    if (hasVisible('[data-dragging="true"], .is-dragging, [aria-grabbed="true"]')) return true;
  } catch { /* في حال غياب DOM نعتبرها غير مشغولة */ }
  return false;
}

function watchActivity(): void {
  window.addEventListener('input', () => { lastTypingAt = Date.now(); }, true);
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      lastTypingAt = Date.now();
    }
  }, true);

  const start = () => { dragging += 1; };
  const end = () => { dragging = Math.max(0, dragging - 1); };
  window.addEventListener('dragstart', start, true);
  window.addEventListener('dragend', end, true);
  window.addEventListener('drop', end, true);
  // بعض مكتبات السحب تعمل بمؤشّرات لا بأحداث HTML5؛ نُصفّر عند رفع المؤشّر احتياطًا.
  window.addEventListener('pointercancel', () => { dragging = 0; }, true);
}

/* ------------------------------ تنظيف المخابئ ------------------------------ */
/** إفراغ ما ملأه عامل الخدمة من ردود الـ API فقط — بيانات المستخدم لا تُمَسّ. */
async function clearApiCaches(): Promise<void> {
  try {
    if (!('caches' in window)) return;
    const names = await caches.keys();
    await Promise.all(names.map(async (name) => {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      await Promise.all(keys.map((request) => {
        try {
          const url = new URL(request.url);
          if (url.origin === location.origin && url.pathname.startsWith('/api/')) return cache.delete(request);
        } catch { /* تجاهُل */ }
        return Promise.resolve(false);
      }));
    }));
  } catch { /* أفضل جهد */ }
}

/** الـ hard refresh نفسه، منفَّذًا نيابةً عن المستخدم: كل الـ caches + إلغاء العامل. */
async function purgeShell(): Promise<void> {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch { /* أفضل جهد */ }
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch { /* أفضل جهد */ }
}

/* ------------------------ الطبقة الأولى: سؤال الخادم ------------------------ */
async function fetchServerBuild(): Promise<string | null> {
  try {
    const response = await fetch(VERSION_URL, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { build?: unknown };
    return typeof data?.build === 'string' && data.build ? data.build : null;
  } catch {
    return null; // انقطاع الشبكة ليس إصدارًا جديدًا
  }
}

/* --------------------- الطبقة الثالثة: التحديث ثم التصعيد --------------------- */
async function applyUpdate(target: string): Promise<void> {
  if (updating) return;
  updating = true;

  if (pageIsBusy()) {
    updating = false;
    window.setTimeout(() => { void applyUpdate(target); }, BUSY_RETRY_MS);
    return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      // بايتات sw.js تغيّرت مع الإصدار، فهذا الطلب يجلب العامل الجديد فعلًا.
      if (registration) await registration.update();
    }
  } catch { /* أفضل جهد */ }

  await clearApiCaches();

  // فحص أخير: قد يكون المستخدم بدأ عملًا أثناء الجلب.
  if (pageIsBusy()) {
    updating = false;
    window.setTimeout(() => { void applyUpdate(target); }, BUSY_RETRY_MS);
    return;
  }

  writeLocal(TARGET_KEY, target);
  window.location.reload();
}

/**
 * عند الإقلاع: إن كان المخزّن يقول إننا حاولنا الوصول إلى بصمة بعينها ولا نزال على القديمة،
 * فإعادة التحميل جاءت من نسخة مخزّنة قديمة ← نصعّد مرة واحدة إلى المسح الكامل.
 * @returns true إذا بدأ التصعيد (فلا داعي لتركيب المنارة، الصفحة على وشك إعادة التحميل).
 */
function reconcileAfterReload(): boolean {
  const target = readLocal(TARGET_KEY);
  if (!target) return false;

  if (target === BUILD_ID) {
    // وصلنا: تُمسح العلامتان حتى يبقى المسار متاحًا للإصدار القادم.
    dropLocal(TARGET_KEY);
    dropLocal(HARD_KEY);
    return false;
  }

  if (readLocal(HARD_KEY)) {
    // صعّدنا مرة ولم ننجح: نمسح العلامات ونكتفي بالمنارة الدورية — لا حلقة إعادة تحميل.
    dropLocal(TARGET_KEY);
    dropLocal(HARD_KEY);
    return false;
  }

  writeLocal(HARD_KEY, '1');
  void (async () => {
    await purgeShell();
    window.location.reload();
  })();
  return true;
}

/* --------------------------- الطبقة الثانية: المنارة --------------------------- */
async function checkForUpdate(): Promise<void> {
  if (updating || document.hidden) return;
  const serverBuild = await fetchServerBuild();
  if (!serverBuild || serverBuild === BUILD_ID) return;
  await applyUpdate(serverBuild);
}

/* --------------------- إضافة: حزم مفقودة بعد نشر (code-split) --------------------- */
function looksLikeStaleChunk(message: string): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .* failed|Loading CSS chunk|Unexpected token '<'|MIME type/i
    .test(message);
}

async function recoverFromStaleChunk(): Promise<void> {
  try {
    // حارس في sessionStorage: بناءٌ معطوب فعلًا يجب ألّا يتحول إلى حلقة لا تنتهي.
    if (window.sessionStorage.getItem(CHUNK_KEY)) return;
    window.sessionStorage.setItem(CHUNK_KEY, '1');
  } catch { /* التخزين محجوب — نُكمل بحذر */ }
  await purgeShell();
  window.location.reload();
}

/** يُستدعى بعد إقلاع ناجح: يمسح حارس التعافي حتى يبقى متاحًا للنشر القادم. */
export function markShellHealthy(): void {
  try { window.sessionStorage.removeItem(CHUNK_KEY); } catch { /* تجاهُل */ }
}

function installChunkRecovery(): void {
  window.addEventListener('vite:preloadError' as keyof WindowEventMap, ((event: Event) => {
    event.preventDefault();
    void recoverFromStaleChunk();
  }) as EventListener);

  window.addEventListener('error', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) { void recoverFromStaleChunk(); return; }
    if (event.message && looksLikeStaleChunk(event.message)) void recoverFromStaleChunk();
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const message = typeof reason === 'string' ? reason : String(reason?.message || '');
    if (looksLikeStaleChunk(message)) void recoverFromStaleChunk();
  });
}

/* ---------------------------------- التركيب ---------------------------------- */
/**
 * يُركَّب مرة واحدة عند الإقلاع. لا يفعل شيئًا خارج الإنتاج ولا خارج المتصفح.
 * `chunkRecovery: false` لمن عنده وحدة تعافٍ قائمة من الحزم المفقودة، فلا تُركَّب مرتين.
 */
export function installAppUpdate(options: { chunkRecovery?: boolean } = {}): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  if (options.chunkRecovery !== false) {
    installChunkRecovery();
    window.addEventListener('load', () => markShellHealthy());
  }

  if (!isProduction()) return;

  if (reconcileAfterReload()) return; // الصفحة على وشك إعادة التحميل بعد مسح كامل

  watchActivity();

  // تبويب عاد من الـ bfcache: كودٌ قديم يستأنف من الذاكرة بلا شبكة ولا أي حدث آخر.
  window.addEventListener('pageshow', (event) => {
    if ((event as PageTransitionEvent).persisted) void checkForUpdate();
  });

  // العودة إلى التبويب.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkForUpdate();
  });

  // شبكة أمان بطيئة للتبويب المتروك مفتوحًا أيامًا.
  window.setInterval(() => { void checkForUpdate(); }, POLL_MS);

  // فحص أول بعد الإقلاع: التبويب قد يكون فُتح من نسخة مخزّنة.
  window.setTimeout(() => { void checkForUpdate(); }, 5_000);
}

export default installAppUpdate;
