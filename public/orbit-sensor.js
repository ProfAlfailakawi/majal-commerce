/*! ORBIT sensor - tiny, dependency-free. Sends anonymous error notes (no URLs with queries, no user data, no typed text) to ORBIT. Never throws.
   ASCII-only on purpose: Arabic text below is written as \u escapes so a host serving this file with the wrong charset cannot garble it. */
(function () {
  try {
    var ENDPOINT = 'https://orbitq8.web.app/api/public-sensor';
    var sent = 0, MAX = 8, queue = [], timer = 0, seen = {}, trail = [];
    var session = (function () {
      try { var k = 'orbit-s', v = sessionStorage.getItem(k); if (!v) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem(k, v); } return v; }
      catch (e) { return 'anon' + Math.random().toString(36).slice(2, 10); }
    })();
    function clean(s) { return String(s == null ? '' : s).replace(/[?#][^\s)'"]*/g, '').slice(0, 160); }
    function path(u) { try { return new URL(u, location.href).pathname.slice(0, 60); } catch (e) { return clean(u); } }
    function same(u) { try { return new URL(u, location.href).origin === location.origin; } catch (e) { return false; } }
    // The last few things the visitor did: tags, ids and paths only, never text they typed or read.
    function step(s) { try { trail.push(String(s).slice(0, 70)); if (trail.length > 20) trail.shift(); } catch (e) {} }
    function flush() {
      timer = 0;
      if (!queue.length || sent >= MAX) { queue = []; return; }
      var batch = queue.splice(0, 5); sent += 1;
      var body = JSON.stringify({ s: session, r: batch });
      try { if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return; } catch (e) {}
      try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'cors', headers: { 'Content-Type': 'text/plain' } }).catch(function () {}); } catch (e) {}
    }
    function note(kind, message, extra) {
      try {
        var m = clean(message); if (!m) return;
        var key = kind + m; if (seen[key]) return; seen[key] = 1;
        var r = { k: kind, m: m, p: location.pathname };
        if (extra) { r.t = extra.t; r.o = extra.o ? 1 : 0; r.b = trail.slice(-12); }
        queue.push(r);
        if (!timer) timer = setTimeout(flush, 3000);
      } catch (e) {}
    }
    function frames(stack) {
      try {
        return String(stack || '').split('\n').slice(0, 6).map(function (l) { return clean(l.replace(location.origin, '').replace(/^\s+/, '')); })
          .filter(function (l) { return l && !/^(Error|TypeError|ReferenceError|RangeError|SyntaxError)\b/.test(l); }).slice(0, 4).map(function (l) { return l.slice(0, 110); });
      } catch (e) { return []; }
    }
    addEventListener('click', function (e) {
      try {
        var t = e.target; if (!t || !t.tagName) return;
        var id = t.id && /^[\w-]{1,30}$/.test(t.id) ? '#' + t.id : '';
        var type = t.tagName === 'BUTTON' || t.tagName === 'INPUT' ? ' [' + (t.type || 'button') + ']' : '';
        step('\u0646\u0642\u0631 ' + t.tagName.toLowerCase() + id + type + ' \u0641\u064a ' + location.pathname);
      } catch (x) {}
    }, true);
    addEventListener('submit', function (e) { try { step('\u0625\u0631\u0633\u0627\u0644 \u0646\u0645\u0648\u0630\u062c \u0641\u064a ' + location.pathname); } catch (x) {} }, true);
    addEventListener('popstate', function () { step('\u062a\u0646\u0642\u0651\u0644 \u0625\u0644\u0649 ' + location.pathname); });
    try {
      ['pushState', 'replaceState'].forEach(function (name) {
        var orig = history[name]; if (!orig) return;
        history[name] = function () { var r = orig.apply(this, arguments); step('\u062a\u0646\u0642\u0651\u0644 \u0625\u0644\u0649 ' + location.pathname); return r; };
      });
    } catch (e) {}
    addEventListener('error', function (e) {
      try {
        var t = e.target;
        if (t && t !== window && (t.src || t.href)) return note('resource', '\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 ' + (t.src || t.href));
        var own = !!(e.filename && same(e.filename));
        note('error', (e.message || 'error') + (e.filename ? ' @' + path(e.filename) + (e.lineno ? ':' + e.lineno : '') : ''), { t: frames(e.error && e.error.stack), o: own });
      } catch (x) {}
    }, true);
    addEventListener('unhandledrejection', function (e) {
      try {
        var r = e.reason, stack = r && r.stack ? String(r.stack) : '';
        note('rejection', r && r.message ? r.message : r, { t: frames(stack), o: stack.indexOf(location.origin) !== -1 });
      } catch (x) {}
    });
    // Failed requests: a network failure or a 5xx anywhere, and a missing (404) file or endpoint on the program's own site.
    function judge(u, status) {
      var bad = status >= 500 || (status === 404 && same(u));
      if (bad) { note('request', 'HTTP ' + status + ' ' + path(u)); }
      step('\u0637\u0644\u0628 ' + path(u) + ' \u2190 ' + status);
    }
    if (window.fetch) {
      var f = window.fetch;
      window.fetch = function () {
        var a = arguments, u = a[0] && a[0].url ? a[0].url : a[0];
        var p = f.apply(this, a);
        try { p.then(function (r) { if (r) judge(u, r.status); }, function () { note('request', '\u0641\u0634\u0644 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 ' + clean(u)); step('\u0637\u0644\u0628 ' + path(u) + ' \u2190 \u0641\u0634\u0644'); }); } catch (x) {}
        return p;
      };
    }
    try {
      var X = window.XMLHttpRequest;
      if (X && X.prototype) {
        var open = X.prototype.open;
        X.prototype.open = function (m, u) {
          try {
            this.addEventListener('loadend', function () { try { if (this.status === 0) { note('request', '\u0641\u0634\u0644 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 ' + clean(u)); step('\u0637\u0644\u0628 ' + path(u) + ' \u2190 \u0641\u0634\u0644'); } else judge(u, this.status); } catch (x) {} });
          } catch (x) {}
          return open.apply(this, arguments);
        };
      }
    } catch (e) {}
    try {
      var ce = console.error;
      console.error = function () {
        try { note('console', Array.prototype.slice.call(arguments, 0, 2).map(function (x) { return x && x.message ? x.message : typeof x === 'object' ? '' : String(x); }).join(' ')); } catch (x) {}
        return ce.apply(this, arguments);
      };
    } catch (e) {}
    addEventListener('pagehide', flush);
  } catch (e) { /* the sensor must never break the page */ }
})();
