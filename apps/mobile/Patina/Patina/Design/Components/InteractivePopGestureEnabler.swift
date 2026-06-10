//
//  InteractivePopGestureEnabler.swift
//  Patina
//
//  R04 — restores the interactive edge-swipe-back gesture for pushed
//  screens that hide the system navigation bar. SwiftUI's NavigationStack
//  is UINavigationController-backed; when the bar is hidden UIKit's
//  default delegate refuses to begin `interactivePopGestureRecognizer`,
//  leaving those screens with no swipe-back. This helper takes over the
//  recognizer's delegate and allows the gesture whenever there is
//  something on the stack to pop (never at the root, where a pop would
//  corrupt the stack).
//
//  Apply once to the NavigationStack's root view via
//  `.interactivePopGestureEnabled()` — the hosted controller walks the
//  responder chain to find the backing UINavigationController.
//

import SwiftUI
import UIKit

/// Hidden representable that grabs the enclosing `UINavigationController`
/// and re-enables its interactive pop gesture with a safe delegate.
struct InteractivePopGestureEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> EnablerViewController {
        EnablerViewController()
    }

    func updateUIViewController(_ uiViewController: EnablerViewController, context: Context) {}

    final class EnablerViewController: UIViewController, UIGestureRecognizerDelegate {
        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            attachToNavigationController()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            // Re-assert on every return to this view — pushed screens or
            // system code may have swapped the delegate in the meantime.
            attachToNavigationController()
        }

        private func attachToNavigationController() {
            guard let gesture = navigationController?.interactivePopGestureRecognizer else { return }
            gesture.delegate = self
            gesture.isEnabled = true
        }

        // Allow the edge-swipe only when there is something to pop. At the
        // root (count <= 1) the gesture must stay disabled or it freezes
        // the navigation controller mid-transition.
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            (navigationController?.viewControllers.count ?? 0) > 1
        }
    }
}

extension View {
    /// Restores swipe-back for nav-bar-hidden destinations. Apply once to
    /// the root view inside a `NavigationStack`.
    func interactivePopGestureEnabled() -> some View {
        background(InteractivePopGestureEnabler())
    }
}
