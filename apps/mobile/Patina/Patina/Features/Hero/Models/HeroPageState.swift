//
//  HeroPageState.swift
//  Patina
//
//  State model for the unified Hero Page
//

import Foundation

/// State of the Hero Page
public enum HeroPageState: Equatable {
    /// Empty state - no rooms, showing welcome experience
    case emptyWelcome

    /// Guest walk in progress
    case guestWalkActive

    /// Post-scan prompt - asking to create account or continue as guest
    case postScanPrompt(roomId: UUID)

    /// Room carousel - has rooms to display
    case roomCarousel

    /// Loading rooms from storage
    case loading

    /// Error state
    case error(message: String)

    /// Whether this state shows the empty experience
    public var isEmpty: Bool {
        switch self {
        case .emptyWelcome, .loading:
            return true
        default:
            return false
        }
    }

    /// Whether a walk is active
    public var isWalkActive: Bool {
        if case .guestWalkActive = self {
            return true
        }
        return false
    }

    /// Whether post-scan prompt is showing
    public var isPostScanPrompt: Bool {
        if case .postScanPrompt = self {
            return true
        }
        return false
    }
}

/// Actions that can be taken from the Hero Page
public enum HeroPageAction: Equatable {
    /// Start a new room walk
    case startWalk

    /// Open authentication sheet
    case signIn

    /// Learn about Patina (onboarding education)
    case learnMore

    /// View room detail
    case viewRoom(id: UUID)

    /// View room emergence
    case viewEmergence(roomId: UUID)

    /// View saved items for a room
    case viewSavedItems(roomId: UUID)

    /// Start a re-scan for existing room
    case rescanRoom(id: UUID)

    /// Create account after guest scan
    case createAccount(pendingRoomId: UUID)

    /// Continue as guest after scan
    case continueAsGuest(roomId: UUID)

    /// Expand companion
    case expandCompanion

    /// Navigate to settings
    case openSettings
}

/// Extended intent for Hero Page (adds to existing HeroFrameIntent)
public extension HeroFrameIntent {
    /// Create intent for sign in action
    static var signIn: HeroFrameIntent {
        .expandCompanion // Placeholder - auth is handled via coordinator
    }

    /// Create intent for settings action
    static var settings: HeroFrameIntent {
        .expandCompanion // Placeholder - settings handled via coordinator
    }
}
