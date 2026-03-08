//
//  FirstLaunchState.swift
//  Patina
//
//  State machine for the first-time user onboarding flow.
//  Manages the "Walk-First" philosophy where users experience AR
//  magic in their space within 60 seconds.
//

import Foundation

/// States in the first-launch onboarding flow
public enum FirstLaunchState: Equatable, CaseIterable {
    /// Initial atmospheric scene with hold-to-enter gesture
    case threshold

    /// Companion's first appearance, inviting user to walk
    case walkInvitation

    /// Camera permission request (if not already granted)
    case cameraPermission

    /// Active AR room scanning with woven conversation
    case walkActive

    /// Post-walk summary showing style insights
    case walkComplete

    /// First piece emergence based on room + style signals
    case firstEmergence

    /// User names the room after first emergence
    case roomNaming

    /// Onboarding complete, transition to main app
    case complete

    /// Display name for debugging/analytics
    public var displayName: String {
        switch self {
        case .threshold: return "Threshold"
        case .walkInvitation: return "Walk Invitation"
        case .cameraPermission: return "Camera Permission"
        case .walkActive: return "Walking"
        case .walkComplete: return "Walk Complete"
        case .firstEmergence: return "First Emergence"
        case .roomNaming: return "Room Naming"
        case .complete: return "Complete"
        }
    }

    /// Whether this state shows the Companion
    public var showsCompanion: Bool {
        switch self {
        case .threshold:
            return false
        case .walkInvitation, .cameraPermission, .walkComplete, .firstEmergence, .roomNaming, .complete:
            return true
        case .walkActive:
            return true // Floating narration mode
        }
    }

    /// Companion state for this first-launch state
    public var companionMode: FirstLaunchCompanionMode {
        switch self {
        case .threshold:
            return .hidden
        case .walkInvitation:
            return .messageOnly
        case .cameraPermission:
            return .collapsed
        case .walkActive:
            return .floatingNarration
        case .walkComplete:
            return .expanded
        case .firstEmergence:
            return .collapsed
        case .roomNaming:
            return .collapsed
        case .complete:
            return .collapsed
        }
    }

    /// The next state in the flow (if deterministic)
    public var nextState: FirstLaunchState? {
        switch self {
        case .threshold:
            return .walkInvitation
        case .walkInvitation:
            return nil // Depends on user choice and permission status
        case .cameraPermission:
            return nil // Depends on permission result
        case .walkActive:
            return .walkComplete
        case .walkComplete:
            return .firstEmergence
        case .firstEmergence:
            return .roomNaming
        case .roomNaming:
            return .complete
        case .complete:
            return nil
        }
    }
}

// MARK: - Companion Mode for First Launch

/// How the Companion should appear during first-launch states
public enum FirstLaunchCompanionMode: Equatable {
    /// Not visible
    case hidden

    /// Expanded but without input field (message display only)
    case messageOnly

    /// Normal collapsed state with Strata Mark
    case collapsed

    /// Floating narration text during walk (no Companion chrome)
    case floatingNarration

    /// Full expanded state with conversation
    case expanded
}

// MARK: - Walk Choice

/// User's choice at the Walk Invitation
public enum WalkInvitationChoice: String, Codable {
    case letsWalk = "lets_walk"
    case notYet = "not_yet"
}

// MARK: - Permission Result

/// Result of camera permission request
public enum CameraPermissionResult: String, Codable {
    case granted
    case denied
    case notDetermined
}
