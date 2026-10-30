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
export const UPDATING_MESSAGE = 'نُحدّث مجال الآن، وتُفتح البوابة من جديد بعد قليل.';
/** السطر الثاني في الشريط: يعود من تلقاء نفسه. */
export const UPDATING_NOTICE_DETAIL = 'نُكمل معك من حيث توقّفت حين تُفتح، دون أن تفعل شيئاً.';
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
  /* بطاقة التنبيه في مجال نفسها (ConnectionSentinel): أسفل الطرف، rounded-2xl، أيقونة في
     مربّع rounded-xl، عنوانٌ وسطر. الأيقونة بابا البوابة وخيط الضوء بينهما، كصفحة التحديث. */
  bar.style.cssText = [
    'position:fixed', 'bottom:max(1.25rem,env(safe-area-inset-bottom))', 'inset-inline-end:1.25rem', 'width:min(360px,calc(100vw - 2.5rem))',
    'z-index:2147483000', 'padding:16px', 'border-radius:16px', 'display:flex', 'align-items:flex-start', 'gap:12px',
    'font-family:inherit', 'text-align:start', 'pointer-events:none',
    'background:var(--color-ink-600,#131c2d)', 'border:1px solid rgba(199,165,91,.3)',
    'box-shadow:var(--elev-3,0 20px 52px rgba(0,0,0,.42))',
  ].join(';');
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.style.cssText = 'width:40px;height:40px;flex:none;border-radius:12px;display:grid;place-items:center;background:rgba(199,165,91,.1);color:var(--color-gold-300,#e8c880)';
  icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 21V11a7 7 0 0 1 7.2-7v17H4Z"/><path d="M20 21V11a7 7 0 0 0-7.2-7v17H20Z"/><path d="M12 5v15" stroke-width="1" opacity=".55"/></svg>';
  const text = document.createElement('span');
  text.style.cssText = 'flex:1;min-width:0';
  const title = document.createElement('strong');
  title.textContent = UPDATING_MESSAGE;
  title.style.cssText = 'display:block;font-size:12px;font-weight:700;line-height:1.6;color:var(--color-slate-100,#f1f5f9)';
  const detail = document.createElement('span');
  detail.textContent = UPDATING_NOTICE_DETAIL;
  detail.style.cssText = 'display:block;margin-top:4px;font-size:12px;line-height:1.7;color:var(--color-slate-400,#94a3b8)';
  text.append(title, detail);
  bar.append(icon, text);
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
