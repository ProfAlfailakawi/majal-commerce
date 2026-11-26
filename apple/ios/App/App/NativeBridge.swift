import UIKit
import WebKit
import SafariServices
import QuickLook

/// Native behaviours that WKWebView does not give a hosted web app:
///  1. Downloads: <a download>, blob:/data: links and window.open(blob) are silent no-ops in WKWebView.
///     A document-start script reads the blob and posts it (in <= ~800 KB base64 chunks) to the
///     `nativeDownload` handler; the file is assembled in the temp directory and handed to the share
///     sheet (PDFs open in QuickLook, which has its own share button).
///     Pages can listen for the `__nativeDownloaded` window event ({detail: {name}}).
///  2. Links: target=_blank / window.open to the same site (or an allowNavigation host) stay in the web
///     view; other http(s) links open in SFSafariViewController; mailto:/tel:/maps/wa.me etc. go to the
///     system. window.open('') popups return a proxy whose document.write()/close() HTML is printed
///     through a transient off-screen web view (JavaScript disabled, no remote code).
///     window.print() inside an iframe prints that iframe's own document.
///  3. Dialogs: JavaScript alert/confirm/prompt use Arabic buttons.
enum NativeBridge {
    static let downloadHandler = "nativeDownload"
    static let externalHandler = "nativeOpenExternal"
    static let printHTMLHandler = "nativePrintHTML"
    private static var router: Router?
    private static var uiProxy: DialogProxy?

    static func install(on webView: WKWebView, host: UIViewController) {
        let controller = webView.configuration.userContentController
        for name in [downloadHandler, externalHandler, printHTMLHandler] {
            controller.removeScriptMessageHandler(forName: name)
        }
        let r = Router(webView: webView, host: host)
        router = r
        controller.add(r, name: downloadHandler)
        controller.add(r, name: externalHandler)
        controller.add(r, name: printHTMLHandler)
        let hosts = allowedHosts(extra: webView.url?.host)
        let data = (try? JSONSerialization.data(withJSONObject: hosts)) ?? Data("[]".utf8)
        let json = String(data: data, encoding: .utf8) ?? "[]"
        let js = script.replacingOccurrences(of: "__ALLOWED_HOSTS__", with: json)
        controller.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        if let original = webView.uiDelegate {
            let proxy = DialogProxy(original: original, host: host)
            uiProxy = proxy
            webView.uiDelegate = proxy
        }
        r.cleanOldFiles()
    }

    /// server.allowNavigation from the bundled capacitor.config.json (these stay in the web view).
    private static func allowedHosts(extra: String?) -> [String] {
        var out: [String] = []
        if let path = Bundle.main.path(forResource: "capacitor.config", ofType: "json"),
           let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let server = obj["server"] as? [String: Any] {
            if let list = server["allowNavigation"] as? [String] { out += list }
            if let u = server["url"] as? String, let h = URL(string: u)?.host { out.append(h) }
        }
        if let extra { out.append(extra) }
        return out
    }

    // MARK: - Script

    private static let script = #"""
    (function () {
      if (window.__nativeBridgeInstalled) return;
      var MH = window.webkit && window.webkit.messageHandlers;
      if (!MH || !MH.nativeDownload) return;
      window.__nativeBridgeInstalled = true;
      var ALLOWED = __ALLOWED_HOSTS__;
      var RAW = 589824; // bytes per chunk (multiple of 3) => ~786 KB of base64
      var MAX_HTML = 8 * 1024 * 1024;
      function post(name, msg) { try { MH[name].postMessage(msg); } catch (e) {} }
      function hostMatch(h, pat) {
        if (!pat) return false;
        pat = String(pat).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (pat === '*') return true;
        if (pat.indexOf('*.') === 0) { var s = pat.slice(1); return h.length > s.length && h.slice(-s.length) === s; }
        return h === pat;
      }
      function authUrl(u) {
        return /^\/__\/auth\//.test(u.pathname) || u.hostname === 'accounts.google.com' || /(^|\.)appleid\.apple\.com$/.test(u.hostname);
      }
      function sameSite(u) {
        if (authUrl(u)) return false;
        if (u.host === location.host) return true;
        for (var i = 0; i < ALLOWED.length; i++) if (hostMatch(u.hostname, ALLOWED[i])) return true;
        return false;
      }
      function abs(href) { try { return new URL(String(href), document.baseURI); } catch (e) { return null; } }
      var EXT = { 'application/pdf': 'pdf', 'text/csv': 'csv', 'text/plain': 'txt', 'text/html': 'html', 'application/json': 'json',
        'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
        'application/zip': 'zip', 'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx' };
      function nameFor(name, mime, url) {
        var n = name;
        if (!n && url && /^https?:/.test(url)) { try { n = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch (e) {} }
        if (!n) n = 'download';
        if (!/\.[A-Za-z0-9]{1,6}$/.test(n)) { var e = EXT[(mime || '').split(';')[0]]; if (e) n += '.' + e; }
        return n;
      }
      function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
      function sendBase64(b64, name, mime) {
        var id = newId(), CH = RAW / 3 * 4, total = Math.max(1, Math.ceil(b64.length / CH));
        for (var i = 0; i < total; i++) post('nativeDownload', { id: id, name: name, mime: mime, index: i, total: total, b64: b64.slice(i * CH, (i + 1) * CH) });
      }
      function sendBlob(blob, name) {
        var mime = blob.type || 'application/octet-stream', fname = nameFor(name, mime);
        var id = newId(), total = Math.max(1, Math.ceil(blob.size / RAW)), i = 0;
        (function next() {
          if (i >= total) return;
          var fr = new FileReader();
          fr.onload = function () {
            var s = String(fr.result);
            post('nativeDownload', { id: id, name: fname, mime: mime, index: i, total: total, b64: s.slice(s.indexOf(',') + 1) });
            i++; next();
          };
          fr.onerror = function () { post('nativeDownload', { id: id, name: fname, abort: true }); };
          fr.readAsDataURL(blob.slice(i * RAW, (i + 1) * RAW));
        })();
      }
      function getBlob(url, init) {
        return fetch(url, init).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
          .catch(function () {
            return new Promise(function (res, rej) {
              var x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'blob';
              x.onload = function () { x.response ? res(x.response) : rej(new Error('empty')); };
              x.onerror = function () { rej(new Error('xhr')); }; x.send();
            });
          });
      }
      // Returns true when the link was taken over as a download.
      function download(url, name) {
        var u = String(url);
        if (/^data:/i.test(u)) {
          var m = /^data:([^;,]*)((?:;[^;,]*)*?),(.*)$/is.exec(u);
          if (m) {
            var mime = m[1] || 'text/plain', isB64 = /;base64/i.test(m[2]);
            if (isB64) { sendBase64(m[3].replace(/\s+/g, ''), nameFor(name, mime), mime); return true; }
            try { sendBlob(new Blob([decodeURIComponent(m[3])], { type: mime }), name); return true; } catch (e) { return false; }
          }
          return false;
        }
        if (/^blob:/i.test(u)) { getBlob(u).then(function (b) { sendBlob(b, name); }, function () {}); return true; }
        var a = abs(u);
        if (a && /^https?:$/.test(a.protocol)) {
          getBlob(a.href, { credentials: 'include' }).then(function (b) { sendBlob(b, name || nameFor('', b.type, a.href)); },
            function () { post('nativeOpenExternal', a.href); });
          return true;
        }
        return false;
      }
      function isDownloadLink(a) {
        var href = a.getAttribute('href') || '';
        return a.hasAttribute('download') || /^(blob|data):/i.test(href);
      }
      function openUrl(href, popup) {
        var u = abs(href);
        if (!u) return 'native';
        if (u.protocol === 'blob:' || u.protocol === 'data:') { download(u.href, ''); return 'handled'; }
        if (!/^https?:$/.test(u.protocol)) return 'native';
        if (sameSite(u) && !(popup && u.host !== location.host)) {
          try { (window.top || window).location.assign(u.href); } catch (e) { location.assign(u.href); }
          return 'handled';
        }
        post('nativeOpenExternal', u.href);
        return 'handled';
      }
      function isNewWindowTarget(t) { return !!t && t !== '_self' && t !== '_top' && t !== '_parent' && t !== window.name; }
      // Returns true when the click was fully handled here.
      function handleAnchor(a) {
        if (isDownloadLink(a)) {
          if (download(a.href, a.getAttribute('download') || '')) return true;
          return false;
        }
        if (isNewWindowTarget(a.target)) {
          var u = abs(a.href);
          if (u && /^https?:$/.test(u.protocol)) { openUrl(u.href, false); return true; }
        }
        return false;
      }
      document.addEventListener('click', function (ev) {
        if (ev.defaultPrevented || ev.button > 0) return;
        var n = ev.target;
        while (n && n.nodeType === 1 && !(n.tagName === 'A' || n.tagName === 'AREA')) n = n.parentNode;
        if (!n || n.nodeType !== 1 || !n.getAttribute('href')) return;
        if (handleAnchor(n)) { ev.preventDefault(); ev.stopPropagation(); }
      }, true);
      // Programmatic anchor.click() on detached anchors never reaches the document listener.
      var origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        try { if (this.getAttribute('href') && handleAnchor(this)) return; } catch (e) {}
        return origClick.apply(this, arguments);
      };
      var origDispatch = EventTarget.prototype.dispatchEvent;
      EventTarget.prototype.dispatchEvent = function (ev) {
        try {
          if (this instanceof HTMLAnchorElement && ev && ev.type === 'click' && !this.isConnected && this.getAttribute('href') && handleAnchor(this)) return true;
        } catch (e) {}
        return origDispatch.apply(this, arguments);
      };
      function makeStub() {
        var stub = { closed: false, opener: window, name: '', close: function () { stub.closed = true; }, focus: function () {}, blur: function () {},
          postMessage: function () {}, addEventListener: function () {}, removeEventListener: function () {}, print: function () {} };
        var loc = { assign: function (v) { openUrl(v, true); }, replace: function (v) { openUrl(v, true); }, reload: function () {}, toString: function () { return ''; } };
        Object.defineProperty(loc, 'href', { get: function () { return ''; }, set: function (v) { openUrl(v, true); } });
        Object.defineProperty(stub, 'location', { get: function () { return loc; }, set: function (v) { openUrl(v, true); } });
        return stub;
      }
      // Blank popup used for print tricks: collect the HTML and print it natively.
      function makePrintPopup() {
        var buf = [], shadow = null, printedOnce = false, timer = 0, loadCbs = [];
        var popup = makeStub();
        function shadowDoc() { if (!shadow) shadow = document.implementation.createHTMLDocument(''); return shadow; }
        function html() {
          var s = buf.join('');
          if (s) return s;
          return shadow ? '<!doctype html>' + shadow.documentElement.outerHTML : '';
        }
        function flush() {
          var h = html();
          if (!h || h.length > MAX_HTML) return;
          post('nativePrintHTML', { html: h, base: document.baseURI, title: (shadow && shadow.title) || '' });
        }
        function fireLoad() {
          var cbs = loadCbs.slice(); if (typeof popup.onload === 'function') cbs.push(popup.onload);
          cbs.forEach(function (f) { try { f.call(popup, new Event('load')); } catch (e) {} });
        }
        var doc = {
          open: function () { buf.length = 0; return doc; },
          write: function () { for (var i = 0; i < arguments.length; i++) buf.push(String(arguments[i])); },
          writeln: function () { for (var i = 0; i < arguments.length; i++) buf.push(String(arguments[i]) + '\n'); },
          close: function () {
            clearTimeout(timer);
            // Nobody called print(): show the native print sheet anyway so the user can view or save a PDF.
            timer = setTimeout(function () { if (!popup.closed && !printedOnce) { printedOnce = true; flush(); } }, 1500);
            setTimeout(fireLoad, 0);
          }
        };
        ['body', 'head', 'documentElement', 'title'].forEach(function (k) {
          Object.defineProperty(doc, k, { get: function () { return shadowDoc()[k]; }, set: function (v) { shadowDoc()[k] = v; } });
        });
        ['createElement', 'createTextNode', 'querySelector', 'querySelectorAll', 'getElementById', 'createElementNS'].forEach(function (k) {
          doc[k] = function () { var d = shadowDoc(); return d[k].apply(d, arguments); };
        });
        popup.document = doc;
        popup.addEventListener = function (t, f) { if (t === 'load' && typeof f === 'function') loadCbs.push(f); };
        popup.print = function () { clearTimeout(timer); printedOnce = true; flush(); };
        var origClose = popup.close;
        popup.close = function () { clearTimeout(timer); origClose(); };
        return popup;
      }
      var origOpen = window.open;
      window.open = function (url, target, features) {
        var u = (url == null) ? '' : String(url);
        if (u === '' || u === 'about:blank') return makePrintPopup();
        var a = abs(u);
        if (a && (a.protocol === 'blob:' || a.protocol === 'data:' || /^https?:$/.test(a.protocol))) {
          var popup = !!features && /width|height|popup/i.test(String(features));
          if (a.protocol === 'blob:' || a.protocol === 'data:') download(a.href, '');
          else openUrl(a.href, popup);
          return makeStub();
        }
        return origOpen.apply(window, arguments);
      };
      // window.print() inside an iframe: print that frame's own document, not the page around it.
      if (window !== window.top) {
        window.print = function () {
          try {
            var h = '<!doctype html>' + document.documentElement.outerHTML;
            if (h.length <= MAX_HTML) post('nativePrintHTML', { html: h, base: document.baseURI, title: document.title || '' });
          } catch (e) {}
        };
      }
    })();
    """#

    // MARK: - Native router (downloads, external links, HTML printing)

    private final class Router: NSObject, WKScriptMessageHandler, QLPreviewControllerDataSource {
        weak var webView: WKWebView?
        weak var host: UIViewController?

        private struct Incoming {
            let url: URL
            let handle: FileHandle
            let name: String
            let total: Int
            var next: Int
            var bytes: Int
            var touched: Date
        }
        private var incoming: [String: Incoming] = [:]
        private var previewURL: URL?
        private var printJobs: [PrintJob] = []
        private static let maxBytes = 150 * 1024 * 1024
        private static let rootDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("NativeDownloads", isDirectory: true)

        init(webView: WKWebView, host: UIViewController) { self.webView = webView; self.host = host }

        func cleanOldFiles() { try? FileManager.default.removeItem(at: Router.rootDir) }

        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case NativeBridge.downloadHandler:
                if let body = message.body as? [String: Any] { receive(body) }
            case NativeBridge.externalHandler:
                if let s = message.body as? String { openExternal(s) }
            case NativeBridge.printHTMLHandler:
                if let body = message.body as? [String: Any], let html = body["html"] as? String {
                    printHTML(html, base: (body["base"] as? String).flatMap(URL.init(string:)) ?? webView?.url, title: body["title"] as? String)
                }
            default: break
            }
        }

        // Downloads

        static func sanitize(_ raw: String) -> String {
            var n = raw.replacingOccurrences(of: "\\", with: "/")
            n = n.components(separatedBy: "/").last ?? n
            n = String(n.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) && !":*?\"<>|".unicodeScalars.contains($0) })
            n = n.trimmingCharacters(in: CharacterSet(charactersIn: ". ").union(.whitespacesAndNewlines))
            if n.count > 120 {
                let ext = (n as NSString).pathExtension
                let stem = String((n as NSString).deletingPathExtension.prefix(100))
                n = ext.isEmpty ? stem : stem + "." + ext
            }
            return n.isEmpty ? "download" : n
        }

        private func abort(_ id: String) {
            if let t = incoming.removeValue(forKey: id) {
                try? t.handle.close()
                try? FileManager.default.removeItem(at: t.url.deletingLastPathComponent())
            }
        }

        private func receive(_ body: [String: Any]) {
            guard let id = body["id"] as? String, !id.isEmpty, id.count < 80 else { return }
            for (k, v) in incoming where Date().timeIntervalSince(v.touched) > 300 { abort(k) }
            if body["abort"] as? Bool == true { abort(id); return }
            guard let index = body["index"] as? Int, let total = body["total"] as? Int, total > 0, total < 400,
                  let b64 = body["b64"] as? String else { return }
            if incoming[id] == nil {
                guard index == 0 else { return }
                let name = Router.sanitize((body["name"] as? String) ?? "download")
                let dir = Router.rootDir.appendingPathComponent(UUID().uuidString, isDirectory: true)
                let url = dir.appendingPathComponent(name)
                do {
                    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                    FileManager.default.createFile(atPath: url.path, contents: nil)
                    let h = try FileHandle(forWritingTo: url)
                    incoming[id] = Incoming(url: url, handle: h, name: name, total: total, next: 0, bytes: 0, touched: Date())
                } catch { return }
            }
            guard var t = incoming[id], index == t.next, let data = Data(base64Encoded: b64) else { abort(id); return }
            t.bytes += data.count
            if t.bytes > Router.maxBytes { abort(id); return }
            do { try t.handle.seekToEnd(); try t.handle.write(contentsOf: data) } catch { abort(id); return }
            t.next += 1
            t.touched = Date()
            if t.next >= t.total {
                try? t.handle.close()
                incoming.removeValue(forKey: id)
                present(file: t.url, name: t.name)
            } else {
                incoming[id] = t
            }
        }

        private func present(file: URL, name: String) {
            guard let host else { return }
            let top = NativeBridge.topController(from: host)
            if file.pathExtension.lowercased() == "pdf" {
                previewURL = file
                let ql = QLPreviewController()
                ql.dataSource = self
                top.present(ql, animated: true)
            } else {
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                if let pop = sheet.popoverPresentationController {
                    pop.sourceView = host.view
                    pop.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.maxY - 40, width: 1, height: 1)
                    pop.permittedArrowDirections = []
                }
                top.present(sheet, animated: true)
            }
            let esc = name.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
            webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('__nativeDownloaded',{detail:{name:'\(esc)'}}))", completionHandler: nil)
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { previewURL == nil ? 0 : 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { (previewURL ?? URL(fileURLWithPath: "/")) as NSURL }

        // External links

        private static let systemHosts: Set<String> = ["wa.me", "api.whatsapp.com", "wa.link", "chat.whatsapp.com", "t.me", "telegram.me",
            "maps.apple.com", "maps.google.com", "goo.gl", "maps.app.goo.gl", "apps.apple.com", "itunes.apple.com", "music.apple.com",
            "facetime.apple.com", "zoom.us", "meet.google.com", "teams.microsoft.com"]

        private func openExternal(_ s: String) {
            guard let url = URL(string: s), let scheme = url.scheme?.lowercased() else { return }
            guard scheme == "http" || scheme == "https" else {
                UIApplication.shared.open(url)
                return
            }
            if let h = url.host?.lowercased(), Router.systemHosts.contains(h) || (h.hasSuffix("google.com") && url.path.hasPrefix("/maps")) {
                UIApplication.shared.open(url)
                return
            }
            guard let host else { return }
            let vc = SFSafariViewController(url: url)
            NativeBridge.topController(from: host).present(vc, animated: true)
        }

        // Printing HTML collected from popups or iframes

        private func printHTML(_ html: String, base: URL?, title: String?) {
            guard let host else { return }
            let job = PrintJob(html: html, base: base, title: title, host: host) { [weak self] job in
                self?.printJobs.removeAll { $0 === job }
            }
            printJobs.append(job)
            job.start()
        }
    }

    private final class PrintJob: NSObject, WKNavigationDelegate {
        private let html: String
        private let base: URL?
        private let title: String?
        private weak var host: UIViewController?
        private let onDone: (PrintJob) -> Void
        private var web: WKWebView?
        private var finished = false

        init(html: String, base: URL?, title: String?, host: UIViewController, onDone: @escaping (PrintJob) -> Void) {
            self.html = html; self.base = base; self.title = title; self.host = host; self.onDone = onDone
        }

        func start() {
            guard let host else { return finish() }
            let cfg = WKWebViewConfiguration()
            cfg.defaultWebpagePreferences.allowsContentJavaScript = false
            let w = WKWebView(frame: CGRect(x: 0, y: 0, width: 595, height: 842), configuration: cfg)
            w.alpha = 0
            w.isUserInteractionEnabled = false
            w.navigationDelegate = self
            host.view.insertSubview(w, at: 0)
            web = w
            w.loadHTMLString(html, baseURL: base)
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in self?.finish() }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard !finished, let host else { return finish() }
            let controller = UIPrintInteractionController.shared
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = (title?.isEmpty == false ? title! : "Document")
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            let anchor = CGRect(x: host.view.bounds.midX, y: host.view.safeAreaInsets.top + 8, width: 1, height: 1)
            controller.present(from: anchor, in: host.view, animated: true) { [weak self] _, _, _ in self?.finish() }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish() }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish() }

        private func finish() {
            guard !finished else { return }
            finished = true
            web?.removeFromSuperview()
            web = nil
            onDone(self)
        }
    }

    // MARK: - Arabic JavaScript dialogs

    /// Forwards everything to Capacitor's own WKUIDelegate except the three JavaScript dialogs.
    private final class DialogProxy: NSObject, WKUIDelegate {
        private let original: WKUIDelegate
        private weak var host: UIViewController?
        init(original: WKUIDelegate, host: UIViewController) { self.original = original; self.host = host }

        override func responds(to aSelector: Selector!) -> Bool {
            super.responds(to: aSelector) || (original as AnyObject).responds(to: aSelector)
        }
        override func forwardingTarget(for aSelector: Selector!) -> Any? {
            (original as AnyObject).responds(to: aSelector) ? original : super.forwardingTarget(for: aSelector)
        }

        private func present(_ alert: UIAlertController, fallback: () -> Void) {
            guard let host, host.view.window != nil else { return fallback() }
            NativeBridge.topController(from: host).present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "حسناً", style: .default) { _ in completionHandler() })
            present(a, fallback: completionHandler)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "حسناً", style: .default) { _ in completionHandler(true) })
            a.addAction(UIAlertAction(title: "إلغاء", style: .cancel) { _ in completionHandler(false) })
            present(a, fallback: { completionHandler(false) })
        }

        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
            // Capacitor's bridge uses prompt() as a silent synchronous channel
            // ({"type":"CapacitorCookies.isEnabled"}, "CapacitorCookies.get/set", "CapacitorHttp").
            // Those must reach Capacitor's own handler and never be shown to the user.
            if NativeBridge.isCapacitorBridgePrompt(prompt) {
                if let capacitorHandler = original.webView(_:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:) {
                    capacitorHandler(webView, prompt, defaultText, frame, completionHandler)
                } else {
                    completionHandler(nil)
                }
                return
            }
            let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            a.addTextField { $0.text = defaultText }
            a.addAction(UIAlertAction(title: "حسناً", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
            a.addAction(UIAlertAction(title: "إلغاء", style: .cancel) { _ in completionHandler(nil) })
            present(a, fallback: { completionHandler(nil) })
        }
    }

    /// True for the JSON messages Capacitor's native bridge sends through prompt().
    static func isCapacitorBridgePrompt(_ prompt: String) -> Bool {
        guard prompt.hasPrefix("{"),
              let data = prompt.data(using: .utf8),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = payload["type"] as? String else { return false }
        return type.hasPrefix("Capacitor")
    }

    fileprivate static func topController(from vc: UIViewController) -> UIViewController {
        var top = vc
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }
}
