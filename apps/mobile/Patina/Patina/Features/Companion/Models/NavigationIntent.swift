//
//  NavigationIntent.swift
//  Patina
//
//  Intents the Companion can hand to the coordinator.
//

import Foundation

/// Intent detected from user input or quick action
public enum NavigationIntent: Equatable {
    // Navigation intents
    case walkRoom(roomId: UUID?)
    case showEmergence
    case showTable
    case showRooms
    case goBack
    case startOver
    case showHelp
    case requestDesignServices(roomId: UUID?)
    case viewRecommendations(roomId: UUID?)

    // QR authentication
    case webSignIn

    // Account
    case showSettings

    // Action intents (within current screen)
    case continueWalk
    case saveWalkProgress
    case seeWhatFits
    case explainPiece
    case seeInRoom
    case letDrift
    case whatsNew
    case whatsMissing
    case seeTogether
    case share
    case addToTable
    case similarPieces
    case savePhoto
    case tryAnother
    case exitAR

    // Conversation intents
    case skipAhead
    case startFresh
    case tellMeMore

    // Help intents
    case needHelp
    case narrowDown
    case suggestOptions

    // No action
    case none

    /// Whether this intent triggers navigation
    public var triggersNavigation: Bool {
        switch self {
        case .walkRoom, .showEmergence, .showTable, .showRooms, .goBack, .startOver, .requestDesignServices, .viewRecommendations, .webSignIn, .showSettings:
            return true
        default:
            return false
        }
    }
}
