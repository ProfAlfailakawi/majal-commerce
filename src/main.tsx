import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/dna/dna-theme.css';
import './motion.css';
import {installMotionReveal} from './lib/motionReveal';
import {installAppUpdate} from './lib/app-update';

/**
 * Lifts the boot screen painted by index.html.
 *
 * Two rules the naive "hide it on mount" version gets wrong:
 *
 *  - A warm cache mounts in well under 100ms, and a brand that flashes for one frame
 *    reads as a rendering glitch rather than an intro. The splash is therefore held to
 *    a minimum beat measured from the timestamp index.html recorded at parse time —
 *    never from here, which already runs after the bundle downloaded.
 *  - The element is removed from the DOM only after its fade completes, so the
 *    transition is actually seen, and so a permanently-hidden overlay can never sit on
 *    top of the app swallowing clicks if the transition never fires.
 */
// The boot animation's own choreography runs to ~1.95s: the gate draws (0-1s), the core
// appears inside it (0.5-1.5s), the ground line lands (0.95-1.95s), and the wordmark and
// tagline rise behind them. Lifting at 1.15s cut the sequence off mid-draw, so on a warm
// cache the brand was gone before it had finished arriving. This holds until the last
// stroke has landed, plus a beat to read it.
const MIN_SPLASH_MS = 2_400;
const FADE_MS = 560;

function dismissBootSplash() {
  const splash = document.getElementById('majal-splash');
  if (!splash) return;

  const bootAt = (window as unknown as { __majalBootAt?: number }).__majalBootAt ?? Date.now();
  const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - bootAt));

  window.setTimeout(() => {
    document.documentElement.classList.add('majal-ready');
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, remaining);
}

/* Where the page runs: "app" inside a native shell or a home-screen install, else "browser". */
{
  const nav = navigator as Navigator & { standalone?: boolean };
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const isApp = Boolean(cap?.isNativePlatform?.()) || nav.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  document.documentElement.dataset.shell = isApp ? 'app' : 'browser';
}
/* "duo": an almost-square screen (iPhone Duo outer 466x678, inner 669x951; ratio <= 1.48).
   Every iPhone is >= 1.7 and every iPad wider than 700, so Duo rules never touch them.
   Re-checked on resize because folding swaps the screen. */
const markDevice = () => {
  const lo = Math.min(screen.width, screen.height), hi = Math.max(screen.width, screen.height);
  document.documentElement.dataset.device = lo >= 440 && lo <= 700 && hi / lo <= 1.48 ? 'duo' : 'other';
};
markDevice();
window.addEventListener('resize', markDevice);
/* Which side the widget column is on, as iOS reports it through the safe area (0 in Safari).
   Watched with a ResizeObserver: resize can fire before the insets update. */
const sideProbe = document.createElement('div');
sideProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)';
document.documentElement.appendChild(sideProbe);
const markWidgetSide = () => {
  const cs = getComputedStyle(sideProbe), l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
  document.documentElement.dataset.widgetSide = l > 20 && l > r ? 'left' : r > 20 ? 'right' : 'none';
};
markWidgetSide();
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(markWidgetSide).observe(sideProbe);
window.addEventListener('resize', () => { requestAnimationFrame(markWidgetSide); window.setTimeout(markWidgetSide, 400); });
window.addEventListener('orientationchange', () => window.setTimeout(markWidgetSide, 400));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// التحديث الذاتي الصامت: بصمة الإصدار، منارتها، ثم التحديث والتصعيد عند اللزوم.
installAppUpdate();

// Two frames: the first is the commit React just scheduled, the second is the browser
// having actually painted it. Dismissing on the first would cross-fade the splash into
// a blank frame.
requestAnimationFrame(() => requestAnimationFrame(dismissBootSplash));

// Register the service worker so the app is installable and launches offline. Production
// only: a SW in dev would cache Vite's HMR chunks and fight live reload. Registered after
// `load` so it never competes with the first paint or the bundle fetch for bandwidth.
installMotionReveal();

// Hidden Duo widget-corner diagnostic: nothing loads unless the URL asks for it.
if (new URLSearchParams(window.location.search).get('duo-debug') === '1') {
  void import('./lib/duoDebug').then(m => m.startDuoDebug());
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      // A failed SW registration must never break the app — the page works without it.
      console.error('MAJAL service worker registration failed:', error);
    });
  });
}
