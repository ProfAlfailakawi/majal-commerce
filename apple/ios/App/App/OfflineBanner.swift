import UIKit

/// Small floating notice shown while the device has no connection.
/// Text follows the device language (Arabic or English) and Dynamic Type.
final class OfflineBanner: UIView {
    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor.label.withAlphaComponent(0.88)
        layer.cornerRadius = 14
        layer.cornerCurve = .continuous
        isAccessibilityElement = true
        accessibilityTraits = .staticText
        let isArabic = Locale.preferredLanguages.first?.hasPrefix("ar") ?? false
        label.text = isArabic ? "لا يوجد اتصال بالإنترنت — سيُعاد التحميل تلقائياً عند عودته" : "You're offline — the page will reload when the connection returns"
        accessibilityLabel = label.text
        label.textColor = .systemBackground
        label.font = UIFont.preferredFont(forTextStyle: .footnote)
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14)
        ])
        alpha = 0
        isHidden = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func setVisible(_ visible: Bool, animated: Bool) {
        if visible {
            isHidden = false
            UIAccessibility.post(notification: .announcement, argument: label.text)
        }
        let apply = { self.alpha = visible ? 1 : 0 }
        let done: (Bool) -> Void = { _ in if !visible { self.isHidden = true } }
        if animated { UIView.animate(withDuration: 0.25, animations: apply, completion: done) } else { apply(); done(true) }
    }
}
