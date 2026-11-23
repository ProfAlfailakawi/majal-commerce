/*
 * كاشف الغلاف الأصلي (Capacitor) الوحيد في الموقع، ومعه فتح الدفع داخل التطبيق.
 * لا نستورد @capacitor/* هنا: الغلاف يحمّل الموقع عن بُعد ويحقن window.Capacitor والإضافات المثبّتة فيه،
 * أما المتصفح العادي فلا يجد شيئًا فيبقى سلوكه كما كان تمامًا.
 */
type Listener = { remove?: () => unknown };
type CapacitorLike = {
  isNativePlatform?: () => boolean;
  Plugins?: {
    Browser?: { open?: (o: { url: string }) => Promise<unknown>; addListener?: (e: string, cb: () => void) => Promise<Listener> | Listener };
    App?: { addListener?: (e: string, cb: (s: { isActive?: boolean }) => void) => Promise<Listener> | Listener };
  };
};

const cap = (): CapacitorLike | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorLike }).Capacitor);

export function isNativeApp(): boolean {
  try { return cap()?.isNativePlatform?.() === true; } catch { return false; }
}

export type CheckoutOutcome = 'native' | 'browser';

/** يفتح رابط الدفع داخل التطبيق (SFSafariViewController) ويستدعي onDone عند الإغلاق أو العودة للتطبيق. */
export async function openCheckout(url: string, onDone: () => void, assign: (u: string) => void = u => window.location.assign(u)): Promise<CheckoutOutcome> {
  const c = cap();
  const browser = c?.Plugins?.Browser;
  if (!isNativeApp() || !browser?.open) { assign(url); return 'browser'; }
  let fired = false;
  const handles: Array<Promise<Listener> | Listener | undefined> = [];
  const finish = () => {
    if (fired) return;
    fired = true;
    handles.forEach(h => { void Promise.resolve(h).then(x => x?.remove?.()).catch(() => undefined); });
    onDone();
  };
  try {
    handles.push(browser.addListener?.('browserFinished', finish));
    handles.push(c?.Plugins?.App?.addListener?.('appStateChange', s => { if (s?.isActive) finish(); }));
    await browser.open({ url });
    return 'native';
  } catch {
    assign(url);
    return 'browser';
  }
}

/** يعيد المحاولة بعد الدفع إلى أن تتغيّر الحالة (webhook قد يتأخر ثوانيَ). */
export async function pollUntil(check: () => Promise<boolean>, tries = 6, delayMs = 2500, sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return true;
    if (i < tries - 1) await sleep(delayMs);
  }
  return false;
}

/** خصائص الروابط الداخلية: تُفتح في المكان نفسه داخل التطبيق، وفي تبويب جديد في المتصفح كما كانت. */
export const legalLinkProps: { target?: '_blank'; rel?: string } = isNativeApp() ? {} : { target: '_blank', rel: 'noopener noreferrer' };
