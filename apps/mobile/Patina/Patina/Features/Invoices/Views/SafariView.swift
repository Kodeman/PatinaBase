//
//  SafariView.swift
//  Patina
//
//  SFSafariViewController wrapper for the invoice Stripe Checkout hand-off
//  (Wave 2 / D.2). Pure web handoff — zero IAP language, Apple-posture safe.
//  The only dismiss path is SFSafariViewController's own Done button, which
//  fires `onFinish`; the caller then polls the invoice for the settled status.
//

import SwiftUI
import SafariServices

/// Identifiable URL wrapper so a `URL?` can drive `.fullScreenCover(item:)`.
struct IdentifiableURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    let onFinish: () -> Void

    func makeCoordinator() -> SafariCoordinator {
        SafariCoordinator(onFinish: onFinish)
    }

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.delegate = context.coordinator
        controller.dismissButtonStyle = .done
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}

    final class SafariCoordinator: NSObject, SFSafariViewControllerDelegate {
        let onFinish: () -> Void

        init(onFinish: @escaping () -> Void) {
            self.onFinish = onFinish
        }

        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            onFinish()
        }
    }
}
