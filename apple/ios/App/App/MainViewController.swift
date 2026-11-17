import UIKit
import WebKit
import Capacitor

/// Native host for the web experience.
/// Adds the platform behaviours a browser tab does not give the user:
/// pull-to-refresh, edge-swipe back/forward, haptic confirmation, an offline
/// banner driven by NWPathMonitor, and state restoration of the last page
/// across launches and window resizes (iPad multitasking, iPhone Duo, Mac).
final class MainViewController: CAPBridgeViewController {

    private let refresh = UIRefreshControl()
    private let offlineBanner = OfflineBanner()
    private let network = NetworkWatcher()
    private static let lastURLKey = "apple.shell.lastURL"
    private var lastDuoGeometryPayload = ""

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }

        view.backgroundColor = UIColor(named: "ShellBackground") ?? .systemBackground
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        refresh.addTarget(self, action: #selector(reloadPage), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        webView.addObserver(self, forKeyPath: #keyPath(WKWebView.url), options: .new, context: nil)

        offlineBanner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(offlineBanner)
        NSLayoutConstraint.activate([
            offlineBanner.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            offlineBanner.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            offlineBanner.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
        ])
        network.onChange = { [weak self] online in
            guard let self else { return }
            self.offlineBanner.setVisible(!online, animated: !UIAccessibility.isReduceMotionEnabled)
            if online, self.webView?.url?.scheme != "https" { self.reloadPage() }
        }
        network.start()
        restoreLastPage()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishDuoGeometry()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishDuoGeometry()
    }

    /// UIKit is the source of truth for Duo's clock/battery column and hinge.
    /// The web layer keeps its existing conservative fallback on older iOS;
    /// on iOS 27.1+ these measured regions replace fixed device guesses.
    private func publishDuoGeometry() {
        guard #available(iOS 27.1, *), let webView else { return }

        let occlusions = view.reservedRegions(kind: .occlusion).filter(\.isActive)
        let divisions = view.reservedRegions(kind: .division).filter(\.isActive)
        let bounds = view.bounds

        func dictionary(_ region: UIView.ReservedRegion) -> [String: Any] {
            let frame = region.frame.intersection(bounds)
            return [
                "x": frame.minX,
                "y": frame.minY,
                "width": frame.width,
                "height": frame.height,
                "top": region.margins.top,
                "left": region.margins.left,
                "bottom": region.margins.bottom,
                "right": region.margins.right
            ]
        }

        let payload: [String: Any] = [
            "width": bounds.width,
            "height": bounds.height,
            "safe": [
                "top": view.safeAreaInsets.top,
                "left": view.safeAreaInsets.left,
                "bottom": view.safeAreaInsets.bottom,
                "right": view.safeAreaInsets.right
            ],
            "occlusions": occlusions.map(dictionary),
            "divisions": divisions.map(dictionary)
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
              let json = String(data: data, encoding: .utf8),
              json != lastDuoGeometryPayload else { return }
        lastDuoGeometryPayload = json

        let script = """
        (() => {
          const native = \(json);
          const apply = () => {
            const root = document.documentElement;
            const sx = native.width > 0 ? root.clientWidth / native.width : 1;
            const sy = native.height > 0 ? window.innerHeight / native.height : sx;
            const right = native.occlusions
              .filter(r => r.width > 0 && r.height > 0 && r.x + r.width >= native.width - 1)
              .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            const division = native.divisions
              .filter(r => r.width > 0 && r.height > 0)
              .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
            window.__DUO_NATIVE_GEOMETRY__ = native;
            root.dataset.duoNativeRegions = 'true';
            root.style.setProperty('--duo-native-safe-top', `${native.safe.top * sy}px`);
            root.style.setProperty('--duo-native-safe-right', `${native.safe.right * sx}px`);
            root.style.setProperty('--duo-native-safe-bottom', `${native.safe.bottom * sy}px`);
            root.style.setProperty('--duo-native-safe-left', `${native.safe.left * sx}px`);
            root.style.setProperty('--duo-widget-w', `${right ? right.width * sx : 0}px`);
            root.style.setProperty('--duo-widget-h', `${right ? right.height * sy : 0}px`);
            root.style.setProperty('--duo-widget-gap', '0px');
            root.style.setProperty('--duo-native-division-x', `${division ? division.x * sx : 0}px`);
            root.style.setProperty('--duo-native-division-y', `${division ? division.y * sy : 0}px`);
            root.style.setProperty('--duo-native-division-w', `${division ? division.width * sx : 0}px`);
            root.style.setProperty('--duo-native-division-h', `${division ? division.height * sy : 0}px`);
            root.dispatchEvent(new CustomEvent('duonativegeometrychange', { detail: native }));
          };
          apply();
          requestAnimationFrame(apply);
          setTimeout(apply, 100);
        })();
        """
        webView.evaluateJavaScript(script) { _, error in
            #if DEBUG
            if let error {
                NSLog("[DuoGeometry] JavaScript bridge failed: %@", error.localizedDescription)
            } else {
                NSLog("[DuoGeometry] %@", json)
            }
            #endif
        }
    }

    /// Reopen the page the user was on (same host, https only) instead of the home page.
    private func restoreLastPage() {
        guard let saved = UserDefaults.standard.string(forKey: Self.lastURLKey),
              let savedURL = URL(string: saved), savedURL.scheme == "https",
              let base = bridge?.config.serverURL, savedURL.host == base.host,
              savedURL.path != "/" && !savedURL.path.isEmpty else { return }
        webView?.load(URLRequest(url: savedURL))
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        guard keyPath == #keyPath(WKWebView.url), let url = webView?.url, url.scheme == "https" else { return }
        // Navigation replaces the document and therefore its inline custom properties.
        // Republish after the new document has had a chance to create its root element.
        lastDuoGeometryPayload = ""
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.publishDuoGeometry()
        }
        UserDefaults.standard.set(url.absoluteString, forKey: Self.lastURLKey)
    }

    @objc private func reloadPage() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if let url = webView?.url, url.scheme == "https" {
            webView?.reload()
        } else if let server = bridge?.config.serverURL {
            webView?.load(URLRequest(url: server))
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in self?.refresh.endRefreshing() }
    }

    deinit { webView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.url)) }
}
