/*!
 * native-polish.js — visual & tactile polish for the iOS/Android app shells.
 * Runs ONLY inside the native Capacitor app. In a normal browser it exits
 * immediately and changes nothing. It never alters DOM structure, routes,
 * data, or event handling (listeners are passive and never call
 * preventDefault/stopPropagation).
 */
(function () {
  'use strict';
  try {
    var cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;
    if (window.__nativePolish) return;
    window.__nativePolish = true;

    var platform = (cap.getPlatform && cap.getPlatform()) || 'native';
    var root = document.documentElement;
    root.classList.add('np-native', 'np-' + platform);

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---------- CSS (scoped under .np-native) ----------
    // CSS lives in a same-origin file so strict CSPs (style-src 'self') allow it
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'native-polish-css';
    link.href = '/native-polish.css';
    (document.head || root).appendChild(link);

    // ---------- Haptics ----------
    var H = cap.Plugins && cap.Plugins.Haptics;
    var lastBuzz = 0;
    function buzz(kind) {
      if (!H) return;
      var now = Date.now();
      if (now - lastBuzz < 60) return;
      lastBuzz = now;
      try {
        if (kind === 'select' && H.selectionChanged) { H.selectionStart && H.selectionStart(); H.selectionChanged(); H.selectionEnd && H.selectionEnd(); }
        else if (kind === 'medium') H.impact({ style: 'MEDIUM' });
        else H.impact({ style: 'LIGHT' });
      } catch (e) {}
    }

    // ---------- Press feedback ----------
    var INTERACTIVE = 'button,[role=button],[role=tab],[role=menuitem],[role=option],a[href],summary,label[for],input[type=checkbox],input[type=radio],input[type=submit],input[type=button]';
    var active = null, startX = 0, startY = 0, downAt = 0;

    function target(el) {
      if (!el || !el.closest) return null;
      var t = el.closest(INTERACTIVE);
      if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return null;
      if (t.closest('[data-no-polish]')) return null;
      return t;
    }
    function release() {
      if (active) { var a = active; active = null; setTimeout(function () { a.classList.remove('np-down'); }, 70); }
    }

    document.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var t = target(e.target);
      if (!t) return;
      var r = t.getBoundingClientRect();
      var big = r.width * r.height > window.innerWidth * window.innerHeight * 0.35;
      // large blocks only dim (a transform on them could shift fixed children)
      t.classList.add('np-press', big || reduceMotion ? 'np-press-soft' : 'np-press-scale');
      if (big) t.classList.add('np-press-soft');
      t.classList.add('np-down');
      active = t; startX = e.clientX; startY = e.clientY; downAt = Date.now();
    }, { passive: true, capture: true });

    document.addEventListener('pointermove', function (e) {
      if (active && (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) release();
    }, { passive: true, capture: true });

    document.addEventListener('pointerup', function (e) {
      if (active && Date.now() - downAt < 900) buzz('light');
      release();
    }, { passive: true, capture: true });
    document.addEventListener('pointercancel', release, { passive: true, capture: true });
    window.addEventListener('scroll', release, { passive: true, capture: true });

    // selection haptic on toggles / pickers
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.matches && t.matches('input[type=checkbox],input[type=radio],select,input[type=range]')) buzz('select');
    }, { passive: true, capture: true });

    // ---------- Gentle view fade on in-app navigation ----------
    if (!reduceMotion) {
      var lastPath = location.pathname + location.hash;
      var appRoot = document.getElementById('root') || document.getElementById('app');
      function onNav() {
        var p = location.pathname + location.hash;
        if (p === lastPath || !appRoot) return;
        lastPath = p;
        var el = appRoot.firstElementChild;
        if (!el) return;
        el.classList.remove('np-enter'); void el.offsetWidth; el.classList.add('np-enter');
        setTimeout(function () { el.classList.remove('np-enter'); }, 400);
      }
      ['pushState', 'replaceState'].forEach(function (m) {
        var orig = history[m];
        if (typeof orig !== 'function') return;
        history[m] = function () { var r = orig.apply(this, arguments); setTimeout(onNav, 0); return r; };
      });
      window.addEventListener('popstate', function () { setTimeout(onNav, 0); });
      window.addEventListener('hashchange', function () { setTimeout(onNav, 0); });
    }
  } catch (err) {
    // polish must never break the app
  }
})();
