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
