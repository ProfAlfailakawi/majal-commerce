/**
 * Hidden diagnostic for the iPhone Duo widget corner. Loaded by main.tsx ONLY when the page URL
 * carries `?duo-debug=1`; nothing here ships into the normal startup path.
 *
 * Draws the reserved box as a translucent red frame (pointer-events: none) and a small panel with
 * the numbers needed to judge a screenshot from a real device. The panel sits at the physical
 * bottom-left, outside the reserved box. Presentation only: no state, no network, no storage.
 */
type CapacitorLike = { isNativePlatform?: () => boolean; getPlatform?: () => string };

const PROBE_SIDES = ['top', 'right', 'bottom', 'left'] as const;

export function startDuoDebug(): void {
  if (document.getElementById('duo-debug-frame')) return;

  const frame = document.createElement('div');
  frame.id = 'duo-debug-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;top:0;right:0;z-index:2147483646;pointer-events:none;box-sizing:border-box;' +
    'width:var(--duo-widget-w);height:var(--duo-widget-h);' +
    'border:2px solid rgba(255,40,40,.95);background:rgba(255,40,40,.14)';

  const panel = document.createElement('pre');
  panel.id = 'duo-debug-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.style.cssText =
    'position:fixed;left:6px;bottom:6px;z-index:2147483647;pointer-events:none;margin:0;direction:ltr;text-align:left;' +
    'max-width:calc(100vw - var(--duo-widget-reserve) - 12px);padding:6px 8px;border-radius:8px;' +
    'font:11px/1.35 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.78);white-space:pre-wrap';

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';

  document.body.append(frame, probe, panel);

  const render = () => {
    const root = getComputedStyle(document.documentElement);
    const cs = getComputedStyle(probe);
    const inset = PROBE_SIDES.map(side => `${side[0].toUpperCase()}${Math.round(parseFloat(cs.getPropertyValue(`padding-${side}`)) || 0)}`).join(' ');
    const vv = window.visualViewport;
    const nav = navigator as Navigator & { standalone?: boolean };
    const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
    const v = (name: string) => root.getPropertyValue(name).trim() || '-';
    const rect = frame.getBoundingClientRect();
    panel.textContent = [
      `duo widget active: ${v('--duo-widget-active') === '1' ? 'YES' : 'NO'}`,
      `w ${v('--duo-widget-w')}  gap ${v('--duo-widget-gap')}  h ${v('--duo-widget-h')}`,
      `box now: ${Math.round(rect.width)}x${Math.round(rect.height)} at right edge`,
      `safe-area env  ${inset}`,
      `inner ${window.innerWidth}x${window.innerHeight}  dpr ${window.devicePixelRatio}`,
      `visualViewport ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} @${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)} s${vv.scale}` : 'n/a'}`,
      `dir ${document.documentElement.dir || document.body.dir || getComputedStyle(document.body).direction}`,
      `standalone ${nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches}`,
      `Capacitor: ${cap?.isNativePlatform?.() === true ? `native ${cap.getPlatform?.() ?? '?'}` : cap ? 'present, not native' : 'absent (browser)'}`,
      `UA: ${/Safari\//.test(navigator.userAgent) ? 'has Safari/ (browser)' : 'no Safari/ token (WKWebView/app)'}`,
      `zone needs no UA/standalone: width+orientation only`,
      `orientation ${window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'}`,
    ].join('\n');
  };

  render();
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', render);
  window.visualViewport?.addEventListener('resize', render);
}
