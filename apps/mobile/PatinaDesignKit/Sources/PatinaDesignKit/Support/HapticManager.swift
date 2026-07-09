//
//  HapticManager.swift
//  Patina
//
//  Centralized haptic feedback management
//

import UIKit

/// Centralized haptic feedback manager for consistent tactile responses
public final class HapticManager {
    public static let shared = HapticManager()

    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let impactSoft = UIImpactFeedbackGenerator(style: .soft)
    private let impactRigid = UIImpactFeedbackGenerator(style: .rigid)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()

    private init() {
        // Prepare generators for immediate use
        prepareAll()
    }

    /// Prepare all generators - call when entering interactive states
    public func prepareAll() {
        impactLight.prepare()
        impactMedium.prepare()
        impactHeavy.prepare()
        selection.prepare()
        notification.prepare()
    }

    // MARK: - Impact Feedback

    /// Trigger impact feedback
    public func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle, intensity: CGFloat = 1.0) {
        let generator: UIImpactFeedbackGenerator
        switch style {
        case .light:
            generator = impactLight
        case .medium:
            generator = impactMedium
        case .heavy:
            generator = impactHeavy
        case .soft:
            generator = impactSoft
        case .rigid:
            generator = impactRigid
        @unknown default:
            generator = impactMedium
        }
        generator.impactOccurred(intensity: intensity)
    }

    // MARK: - Selection Feedback

    /// Trigger selection feedback - for UI changes like segment controls
    public func selectionChanged() {
        selection.selectionChanged()
    }

    // MARK: - Notification Feedback

    /// Trigger notification feedback - for success, warning, or error
    public func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        notification.notificationOccurred(type)
    }

    // MARK: - Patina-Specific Patterns

    /// Gentle feedback for threshold crossing
    public func thresholdCrossed() {
        impact(.medium, intensity: 0.7)
    }

    /// Subtle feedback for companion interactions
    public func companionPulse() {
        impact(.soft, intensity: 0.5)
    }

    /// Feedback for placing item on table
    public func itemPlaced() {
        impact(.rigid, intensity: 0.6)
    }

    /// Feedback for emergence reveal
    public func emergenceReveal() {
        notification(.success)
    }
}
