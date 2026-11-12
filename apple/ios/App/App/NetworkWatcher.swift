import Foundation
import Network

/// Wraps NWPathMonitor and reports reachability changes on the main queue.
final class NetworkWatcher {
    var onChange: ((Bool) -> Void)?
    private let monitor = NWPathMonitor()
    private var last: Bool?

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            DispatchQueue.main.async {
                guard let self, self.last != online else { return }
                self.last = online
                self.onChange?(online)
            }
        }
        monitor.start(queue: DispatchQueue(label: "apple.shell.network"))
    }

    deinit { monitor.cancel() }
}
