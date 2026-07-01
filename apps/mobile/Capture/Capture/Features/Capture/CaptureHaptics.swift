//  CaptureHaptics.swift
//  Capture
//
//  Thin haptic vocabulary for the capture loop (Team B). "Haptics confirm" — a
//  light tick per frame, a medium thunk on multi-shot release, a soft selection
//  tick when the level locks in. All no-ops on the simulator.

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

@MainActor
enum CaptureHaptics {
    enum Weight { case light, medium, heavy }

    static func impact(_ weight: Weight) {
        #if canImport(UIKit)
        let style: UIImpactFeedbackGenerator.FeedbackStyle
        switch weight {
        case .light:  style = .light
        case .medium: style = .medium
        case .heavy:  style = .heavy
        }
        UIImpactFeedbackGenerator(style: style).impactOccurred()
        #endif
    }

    /// Soft tick — mode change, level lock, toggle.
    static func selection() {
        #if canImport(UIKit)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }

    /// Committed-to-the-library success.
    static func success() {
        #if canImport(UIKit)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
    }
}
