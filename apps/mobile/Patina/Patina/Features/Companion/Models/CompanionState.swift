//
//  CompanionState.swift
//  Patina
//
//  State machine for the Companion overlay system
//  Manages floating button, morphing animation, and expanded panel states
//

import SwiftUI

// MARK: - Companion State

/// The states of the floating Companion button and panel
public enum CompanionState: Equatable {
    /// Hidden state - only used on Threshold screen
    case hidden

    /// Button state - floating circular button at bottom center
    case button

    /// Morphing state - animating between button and panel
    case morphing(progress: CGFloat)

    /// Expanded state - full panel visible with adaptive height
    case expanded

    /// Navigating state - transitioning to new screen, collapsing to button
    case navigating

    /// Pulsing state - button with pulse notification animation
    case pulsing

    // MARK: - Morph Progress (0.0 = button, 1.0 = expanded)

    /// Get the current morph progress for animations
    public var morphProgress: CGFloat {
        switch self {
        case .hidden:
            return 0
        case .button, .pulsing:
            return 0
        case .morphing(let progress):
            return progress
        case .expanded, .navigating:
            return 1
        }
    }

    // MARK: - State Queries

    /// Whether the companion is hidden (Threshold screen only)
    public var isHidden: Bool {
        self == .hidden
    }

    /// Whether the companion is in button state
    public var isButton: Bool {
        switch self {
        case .button, .pulsing:
            return true
        default:
            return false
        }
    }

    /// Whether the companion is morphing
    public var isMorphing: Bool {
        if case .morphing = self { return true }
        return false
    }

    /// Whether the companion is expanded
    public var isExpanded: Bool {
        self == .expanded
    }

    /// Whether quick actions should be visible (in expanded state)
    public var showsQuickActions: Bool {
        switch self {
        case .expanded:
            return true
        case .morphing(let progress):
            return progress >= 0.7  // Show when 70% expanded
        default:
            return false
        }
    }

    /// Whether the full conversation sheet should be visible
    public var showsFullSheet: Bool {
        switch self {
        case .expanded:
            return true
        case .morphing(let progress):
            return progress >= 0.7
        default:
            return false
        }
    }

    /// Whether breathing animation is active (only in resting button state)
    public var isBreathing: Bool {
        self == .button
    }

    /// Whether pulse animation is active
    public var isPulsing: Bool {
        self == .pulsing
    }

    // MARK: - Legacy Compatibility

    /// Whether the companion is in a collapsed visual state (legacy)
    public var isCollapsed: Bool {
        isButton
    }

    /// Calculate height based on state (legacy - now uses morph progress)
    public var height: CGFloat {
        switch self {
        case .hidden:
            return 0
        case .button, .pulsing:
            return CompanionConstants.buttonSize
        case .morphing(let progress):
            let minHeight = CompanionConstants.buttonSize
            let maxHeight = CompanionConstants.expandedMaxHeight
            return minHeight + (maxHeight - minHeight) * progress
        case .expanded, .navigating:
            return CompanionConstants.expandedMaxHeight
        }
    }
}

// MARK: - Voice Input State

/// Voice input states for the Companion
public enum VoiceInputState: Equatable {
    /// Voice input is idle
    case idle

    /// Actively listening to user
    case listening

    /// Processing speech-to-text
    case processing
}

// MARK: - Companion Constants

/// Constants for Companion floating button and panel
public enum CompanionConstants {
    // Button dimensions
    public static let buttonSize: CGFloat = 64
    public static let buttonBottomPadding: CGFloat = 20
    public static let buttonCornerRadius: CGFloat = 32  // Circle

    // Content spacing - space other views should reserve for floating button
    public static let contentBottomInset: CGFloat = buttonSize + buttonBottomPadding + 16  // ~100pt

    // Panel dimensions (adaptive)
    public static let expandedMinHeight: CGFloat = 200
    public static let expandedMaxHeight: CGFloat = 500
    public static let panelCornerRadius: CGFloat = 24
    public static let panelHorizontalPadding: CGFloat = 16

    // Legacy compatibility
    public static let collapsedHeight: CGFloat = buttonSize
    public static let expandedHeight: CGFloat = expandedMaxHeight
    public static let maxPullOffset: CGFloat = 320

    // Thresholds
    public static let expansionThreshold: CGFloat = 150
    public static let quickActionsThreshold: CGFloat = 100
    public static let collapseThreshold: CGFloat = 50

    // Haptic thresholds
    public static let lightHapticThreshold: CGFloat = 100
    public static let mediumHapticThreshold: CGFloat = 150

    // Animation
    public static let springResponse: Double = 0.4
    public static let springDamping: Double = 0.85  // Slightly higher for smoother morph
    public static let morphDuration: Double = 0.4
    public static let breathingDuration: Double = 3.0
    public static let contentFadeThreshold: Double = 0.7  // Content appears at 70% morph

    // Voice input
    public static let longPressDuration: Double = 0.5
    public static let voiceCancelDistance: CGFloat = 100

    // MARK: - AR Mode Constants

    /// Minimized button size for AR mode (40x40pt per spec)
    public static let arButtonSize: CGFloat = 40

    /// AR mode button corner radius (circle)
    public static let arButtonCornerRadius: CGFloat = 20

    /// AR mode button padding from top edge
    public static let arButtonTopPadding: CGFloat = 16

    /// AR mode button padding from right edge
    public static let arButtonRightPadding: CGFloat = 16

    // MARK: - Accessibility Constants

    /// Minimum touch target size per Apple HIG (44x44pt)
    public static let minimumTouchTarget: CGFloat = 44

    /// Whether to respect reduce motion preference
    public static var shouldReduceMotion: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    /// Breathing animation duration when reduce motion is enabled (static)
    public static let reducedMotionBreathingDuration: Double = 0.0
}
