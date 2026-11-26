/*
 * شريط «حمّل التطبيق» لمتصفح أندرويد — نظير شريط Safari الرسمي (apple-itunes-app) على آيفون.
 *
 * يظهر فقط حين:
 *  - الجهاز أندرويد والصفحة مفتوحة في المتصفح (لا داخل تطبيق Capacitor، ولا مثبّتة على الشاشة الرئيسية)؛
 *  - ولم يضغط الزائر «لاحقاً» خلال آخر ٧ أيام.
 * الإعداد من وسم السكربت نفسه: data-package (رقم حزمة التطبيق في Google Play) و data-name (اسم التطبيق).
 * الرابط يُبنى من بادئة ثابتة ورقم حزمة مُتحقَّق منه، فلا يُدرج نص من الصفحة في رابط مباشرة.
 * ملف مستقل لا سكربت مضمّن، كي يعمل تحت سياسات CSP التي تمنع السكربتات المضمّنة.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var pkg = script.getAttribute('data-package') || '';
  var name = script.getAttribute('data-name') || 'التطبيق';
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(pkg)) return;
  var play = 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(pkg);

  var ua = navigator.userAgent || '';
  if (!/Android/i.test(ua)) return;
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;
  } catch (e) {}
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
  } catch (e) {}

  var KEY = 'store-app-bar-snoozed-until';
  try {
    if (Number(localStorage.getItem(KEY) || 0) > Date.now()) return;
  } catch (e) {}

  function snooze(days) {
    try { localStorage.setItem(KEY, String(Date.now() + days * 86400000)); } catch (e) {}
  }

  function show() {
    if (document.getElementById('store-app-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'store-app-bar';
    bar.setAttribute('dir', 'rtl');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'حمّل التطبيق');
    bar.style.cssText = [
      'position:fixed', 'left:12px', 'right:12px',
      'bottom:calc(12px + env(safe-area-inset-bottom, 0px))',
      'z-index:2147483000', 'display:flex', 'align-items:center', 'gap:10px',
      'padding:10px 12px', 'border-radius:16px', 'background:#ffffff', 'color:#111827',
      'box-shadow:0 10px 30px rgba(0,0,0,.18)', 'border:1px solid rgba(0,0,0,.08)',
      'font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif',
      'max-width:560px', 'margin:0 auto'
    ].join(';');

    var text = document.createElement('div');
    text.style.cssText = 'flex:1;min-width:0';
    var title = document.createElement('div');
    title.textContent = 'حمّل تطبيق ' + name;
    title.style.cssText = 'font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    var sub = document.createElement('div');
    sub.textContent = 'من Google Play';
    sub.style.cssText = 'font-size:12px;font-weight:600;color:#6b7280';
    text.appendChild(title);
    text.appendChild(sub);

    var later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'لاحقاً';
    later.style.cssText = 'flex:none;padding:9px 12px;border-radius:12px;border:1px solid #e5e7eb;background:#fff;color:#374151;font:inherit;cursor:pointer';
    later.addEventListener('click', function () { snooze(7); bar.remove(); });

    var get = document.createElement('a');
    get.href = play;
    get.target = '_blank';
    get.rel = 'noopener noreferrer';
    get.textContent = 'حمّل التطبيق';
    get.style.cssText = 'flex:none;padding:9px 14px;border-radius:12px;background:#111827;color:#fff;text-decoration:none;font:inherit;font-weight:800';
    get.addEventListener('click', function () { snooze(90); bar.remove(); });

    bar.appendChild(text);
    bar.appendChild(later);
    bar.appendChild(get);
    document.body.appendChild(bar);
  }

  // مهلة قصيرة كي لا يقفز الشريط فوق أول رسم للصفحة.
  var start = function () { setTimeout(show, 3000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
