import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
const MIN_SPLASH_MS = 1_150;
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Two frames: the first is the commit React just scheduled, the second is the browser
// having actually painted it. Dismissing on the first would cross-fade the splash into
// a blank frame.
requestAnimationFrame(() => requestAnimationFrame(dismissBootSplash));
