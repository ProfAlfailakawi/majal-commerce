/**
 * «نُحدّث البرنامج» داخل التطبيق.
 *
 * أثناء النشر تجيب واجهةُ Google الأمامية طلباتِ /api بصفحة HTML إنجليزية (500/502/503/504)
 * لا يكتبها خادمُنا — هو يجيب /api بـ JSON دائماً، حتى بوابة الإقلاع (503 JSON). كانت الشاشات
 * تقرأها فتعرض «تعذّر إكمال العملية»، وكان تعافي الحزم المفقودة يظنّها نسخةً قديمة فيمسح
 * الذاكرة ويُلغي العامل في اللحظة التي يلزم فيها.
 *
 * هنا يُعرف ذلك الجواب، ويظهر شريطٌ هادئ واحد بدل رسالة الخطأ، ويسأل /api/ready كل ثلاث
 * ثوانٍ (ويتباطأ إلى خمس عشرة) حتى يعود الخادم فيختفي ويُعلم من ينتظر.
 */

const UPDATING_STATUSES = new Set([500, 502, 503, 504]);

/** نقطة الجاهزية: بلا قاعدة بيانات ولا حدّ طلبات، و200 فقط حين يكتمل الإقلاع. */
export const READY_URL = '/api/ready';

/* بلا رموز تعبيرية: قواعد واجهة النظام (DESIGN_SYSTEM.md). */
export const UPDATING_MESSAGE = 'نُحدّث البرنامج الآن، لحظاتٍ ونعود.';
export const UPDATING_WRITE_MESSAGE = `${UPDATING_MESSAGE} إن كنت تحفظ تغييراً فتأكّد من حالته بعد عودتنا.`;
export const UPDATING_CODE = 'PLATFORM_UPDATING';
/** يُطلق على window حين يعود الخادم. */
export const SERVER_BACK_EVENT = 'majal:server-back';

/** جوابُ المنصّة لا جوابُ البرنامج: 5xx بغير JSON. */
export const isPlatformUpdating = (status: number, contentType: string | null | undefined) =>
  UPDATING_STATUSES.has(status) && !String(contentType || '').toLowerCase().includes('application/json');

/** هل يجيب الخادم الآن؟ يُسأل بـ fetch مباشرة، لا عبر غلاف التطبيق. */
export const serverAnswers = (): Promise<boolean> =>
  fetch(READY_URL, { cache: 'no-store', credentials: 'same-origin' }).then(response => response.ok, () => false);

/** الجواب الذي يراه المُستدعي بدل صفحة المنصّة: JSON بالرسالة الهادئة، فلا تُقرأ صفحة Google. */
export function updatingJsonResponse(isWrite: boolean): Response {
  return new Response(JSON.stringify({ error: isWrite ? UPDATING_WRITE_MESSAGE : UPDATING_MESSAGE, code: UPDATING_CODE }), {
    status: 503,
    statusText: 'Updating',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Majal-Updating': '1' },
  });
}

let notice: HTMLElement | null = null;
const waiting = new Set<() => void>();

/** مدّة الانتظار قبل السؤال رقم `tries`: ثلاث ثوانٍ، ثم تباطؤ حتى خمس عشرة. */
export const nextDelay = (tries: number) => Math.min(15_000, Math.round(3000 * Math.pow(1.3, Math.max(0, tries - 5))));

/**
 * يُظهر الشريطَ مرّةً واحدة مهما تكرّر الطلب، ويسأل `probe` حتى يجيب، فيخفيه وينادي
 * `onBack` ومن سبقه، ثم يُطلق SERVER_BACK_EVENT.
 */
export function showUpdatingNotice(probe: () => Promise<boolean> = serverAnswers, onBack?: () => void): void {
  if (onBack) waiting.add(onBack);
  if (notice || typeof document === 'undefined' || !document.body) return;
  const bar = document.createElement('div');
  bar.className = 'majal-updating-notice';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.dir = 'rtl';
  bar.textContent = UPDATING_MESSAGE;
  bar.style.cssText = [
    'position:fixed', 'inset-inline:0', 'bottom:max(18px,env(safe-area-inset-bottom))', 'margin:0 auto', 'width:max-content', 'max-width:calc(100vw - 32px)',
    'z-index:2147483000', 'padding:11px 18px', 'border-radius:14px', 'font-family:inherit', 'font-size:14px', 'font-weight:700', 'line-height:1.6',
    'background:var(--majal-panel,#0f172a)', 'color:var(--color-slate-50,#f8fafc)', 'border:1px solid var(--majal-border,rgba(255,255,255,.09))',
    'box-shadow:var(--elev-2,0 8px 24px rgba(0,0,0,.28))', 'text-align:center', 'pointer-events:none',
  ].join(';');
  document.body.appendChild(bar);
  notice = bar;
  let tries = 0;
  const ask = async () => {
    const back = await probe().catch(() => false);
    if (!back) { tries++; window.setTimeout(ask, nextDelay(tries)); return; }
    bar.remove();
    notice = null;
    const callbacks = [...waiting];
    waiting.clear();
    callbacks.forEach(callback => { try { callback(); } catch { /* واحدٌ لا يوقف الباقين */ } });
    window.dispatchEvent(new Event(SERVER_BACK_EVENT));
  };
  window.setTimeout(ask, 3000);
}
