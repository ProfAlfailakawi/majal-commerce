/*
 * Boot guard — served as an external file so the production CSP (script-src 'self')
 * allows it. Loaded synchronously before the module bundle.
 * The boot timestamp lets main.tsx hold the splash for a minimum beat.
 * Failsafe: if React has not mounted after 8s (bundle 404, thrown before mount,
 * blocked by an extension), lift the splash and show the plain-HTML fallback.
 */
(function () {
  window.__majalBootAt = Date.now();
  // Apply the persisted theme before first paint (see src/lib/theme.ts).
  try {
    var theme = 'light';
    try {
      var stored = window.localStorage.getItem('majal-theme');
      if (stored === 'dark' || stored === 'contrast') theme = stored;
    } catch (e) { /* storage blocked: default light */ }
    if (theme !== 'dark') document.documentElement.setAttribute('data-theme', theme);
    var color = theme === 'light' ? '#f7f4ec' : theme === 'contrast' ? '#000000' : '#0b1220';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
    var scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute('content', theme === 'light' ? 'light' : 'dark');
  } catch (e) { /* default light */ }
  function wireRetry() {
    var retry = document.getElementById('majal-boot-retry');
    if (retry) retry.addEventListener('click', function () { location.reload(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireRetry);
  else wireRetry();
  window.setTimeout(function () {
    document.documentElement.classList.add('majal-ready');
    var root = document.getElementById('root');
    if (root && root.childElementCount === 0) {
      var fallback = document.getElementById('majal-boot-failed');
      if (fallback) fallback.hidden = false;
    }
  }, 8000);
})();
