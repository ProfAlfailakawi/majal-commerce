/*
 * علامات iPhone Duo على جذر الصفحة — تُقرأ في CSS فقط (src/duo-pattern.css).
 *
 *   data-device       «duo» على iPhone Duo وحده (القرائن عند markDevice). الهاتف العادي وiPad «other»،
 *                     فكل قاعدةٍ تحت `html[data-device="duo"]` لا تمسّ الهاتف العادي ولا iPad.
 *   data-shell        «app» داخل التطبيق الرسمي أو تطبيق الشاشة الرئيسية، وإلا «browser».
 *   data-widget-side  جهة عمود الساعة كما يبلغها iOS عبر safe-area: left / right / none (صفرٌ في Safari).
 *
 * Safari على الجهاز لا يعلن مفصلًا ولا وضعية، فالقرار بالاتجاه والمقاس وحدهما.
 */
const root = document.documentElement;

const isApp = (): boolean => {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
    if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
};

/* الكشف (كما في schedule-kw بعد لقطات الجهاز الحقيقي 2026-11-20): الخارجية نسبتها ≈1.484، فحدّ 1.48 يسقطها.
   على iPhone أو غلاف iOS تكفي قرينةٌ واحدة: شاشةٌ شبه مربّعة (الضلع القصير 400–720 والنسبة ≤ 1.62؛ كل iPhone
   ≥ 1.78)، أو الشيء نفسه بأبعاد screen.avail*، أو نافذةٌ ضلعها القصير بين 500 و720 (لا iPhone يبلغ 500).
   وكل iPad ضلعُ شاشته القصير ≥ 744، فلا يُقبل ما زاد على 720. */
const isAppleHandheld = (): boolean => {
  try {
    return /iPhone|iPod/.test(navigator.userAgent) || (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'ios';
  } catch {
    return false;
  }
};
const nearSquare = (a: number, b: number) => { const lo = Math.min(a, b), hi = Math.max(a, b); return lo >= 400 && lo <= 720 && hi / lo <= 1.62; };

const markDevice = () => {
  const shortScreen = Math.min(screen.width, screen.height);
  const viewportShort = Math.min(window.innerWidth, window.innerHeight);
  const duo = isAppleHandheld() && shortScreen <= 720 && (
    nearSquare(screen.width, screen.height) ||
    nearSquare(screen.availWidth, screen.availHeight) ||
    (viewportShort > 500 && viewportShort <= 720)
  );
  root.dataset.device = duo ? 'duo' : 'other';
  root.dataset.shell = isApp() ? 'app' : 'browser';
};

const probe = document.createElement('div');
probe.setAttribute('aria-hidden', 'true');
probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';

const markWidgetSide = () => {
  const cs = getComputedStyle(probe), l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
  root.dataset.widgetSide = l > 20 && l > r ? 'left' : r > 20 ? 'right' : 'none';
};

export function installDuoMarkers(): void {
  markDevice();
  root.appendChild(probe);
  markWidgetSide();
  /* حشوة المسبار هي حدود النظام نفسها: تُراقَب مباشرة، لأن resize قد يسبق تحديث الحدود. */
  /* المسبار 0×0 والحدود حشوته، فيُراقَب صندوقه الخارجي (border-box)، مع قراءاتٍ مؤجَّلة: iOS يبلغ الحدود بعد أول رسم. */
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(markWidgetSide).observe(probe, { box: 'border-box' });
  for (const ms of [120, 600, 1500, 3000]) window.setTimeout(markWidgetSide, ms);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) markWidgetSide(); });
  window.addEventListener('resize', () => { markDevice(); requestAnimationFrame(markWidgetSide); window.setTimeout(markWidgetSide, 400); });
  window.addEventListener('orientationchange', () => window.setTimeout(() => { markDevice(); markWidgetSide(); }, 400));
}
