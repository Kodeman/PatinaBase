//
//  IntentDetector.swift
//  Patina
//
//  Detects navigation and action intents from natural language input
//  Enables "Navigation as Conversation" by parsing user messages
//

import Foundation

// MARK: - Intent Detector

/// Service for detecting navigation intents from natural language
public final class IntentDetector {

    public static let shared = IntentDetector()

    private init() {}

    // MARK: - Intent Detection

    /// Detect navigation intent from a user message
    public func detectIntent(from message: String) -> NavigationIntent {
        let lowercased = message.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

        // Check for walk/scan intent
        if matchesWalkIntent(lowercased) {
            return .walkRoom(roomId: nil)
        }

        // Check for emergence/discovery intent
        if matchesEmergenceIntent(lowercased) {
            return .showEmergence
        }

        // Check for table/collection intent
        if matchesTableIntent(lowercased) {
            return .showTable
        }

        // Check for rooms intent
        if matchesRoomsIntent(lowercased) {
            return .showRooms
        }

        // Check for back navigation
        if matchesBackIntent(lowercased) {
            return .goBack
        }

        // Check for reset intent
        if matchesResetIntent(lowercased) {
            return .startOver
        }

        // Check for help intent
        if matchesHelpIntent(lowercased) {
            return .showHelp
        }

        // No navigation intent detected
        return .none
    }

    // MARK: - Pattern Matching

    private func matchesWalkIntent(_ text: String) -> Bool {
        let patterns = [
            "walk",
            "scan",
            "capture",
            "let's walk",
            "start a walk",
            "walk my",
            "scan my",
            "walk a room",
            "scan a room",
            "new scan",
            "new walk",
            "walk through",
            "explore my"
        ]
        return patterns.contains { text.contains($0) }
    }

    private func matchesEmergenceIntent(_ text: String) -> Bool {
        let patterns = [
            "what's new",
            "whats new",
            "surfaced",
            "emerged",
            "show me something",
            "find something",
            "recommend",
            "suggest",
            "discovery",
            "discover",
            "new pieces",
            "latest",
            "anything new"
        ]
        return patterns.contains { text.contains($0) }
    }

    private func matchesTableIntent(_ text: String) -> Bool {
        let patterns = [
            "my table",
            "my collection",
            "saved",
            "favorites",
            "show me my",
            "what i've saved",
            "what i saved",
            "gathering",
            "collected",
            "my pieces"
        ]
        return patterns.contains { text.contains($0) }
    }

    private func matchesRoomsIntent(_ text: String) -> Bool {
        let patterns = [
            "my rooms",
            "my spaces",
            "room list",
            "show rooms",
            "all rooms",
            "scanned rooms",
            "my home"
        ]
        return patterns.contains { text.contains($0) }
    }

    private func matchesBackIntent(_ text: String) -> Bool {
        let patterns = [
            "go back",
            "take me back",
            "back",
            "return",
            "previous",
            "never mind",
            "nevermind"
        ]
        return patterns.contains { text.contains($0) }
    }

    private func matchesResetIntent(_ text: String) -> Bool {
        let patterns = [
            "start over",
            "reset",
            "begin again",
            "start fresh",
            "from the beginning"
        ]
        return patterns.contains { text.contains($0) }
    }

    private func matchesHelpIntent(_ text: String) -> Bool {
        let patterns = [
            "help",
            "how do i",
            "what can",
            "i'm stuck",
            "confused",
            "guide me"
        ]
        return patterns.contains { text.contains($0) }
    }

    // MARK: - Response Generation

    /// Generate a confirmation response for a navigation intent
    public func confirmationResponse(for intent: NavigationIntent) -> String {
        switch intent {
        case .walkRoom:
            return "Let's walk through your space together. I'll guide you."
        case .showEmergence:
            return "Let me show you what surfaced for you."
        case .showTable:
            return "Here's your table — the pieces gathering around you."
        case .showRooms:
            return "These are the spaces you've walked with me."
        case .goBack:
            return "Taking you back."
        case .startOver:
            return "Starting fresh. I'm here whenever you're ready."
        case .showHelp:
            return "I'm here to help. What would you like to know?"
        default:
            return ""
        }
    }

    // MARK: - Intent Validation

    /// Check if an intent is valid for the current screen
    public func isValid(intent: NavigationIntent, fromScreen: AppRoute) -> Bool {
        switch intent {
        case .continueWalk, .saveWalkProgress:
            // Only valid from walk screens
            return fromScreen == .walk || fromScreen == .walkSession
        case .explainPiece, .seeInRoom, .letDrift:
            // Only valid from emergence or piece detail
            if case .emergence = fromScreen { return true }
            if case .pieceDetail = fromScreen { return true }
            return false
        case .whatsMissing, .seeTogether, .share:
            // Only valid from table
            return fromScreen == .table
        default:
            // Navigation intents are generally valid from anywhere
            return true
        }
    }
}

// MARK: - Intent Extensions

extension NavigationIntent {

    /// Human-readable description of the intent
    public var description: String {
        switch self {
        case .walkRoom(let roomId):
            return roomId != nil ? "Walk specific room" : "Walk a new room"
        case .showEmergence:
            return "Show emergence"
        case .showTable:
            return "Show table"
        case .showRooms:
            return "Show rooms"
        case .goBack:
            return "Go back"
        case .startOver:
            return "Start over"
        case .showHelp:
            return "Show help"
        case .continueWalk:
            return "Continue walk"
        case .saveWalkProgress:
            return "Save walk progress"
        case .seeWhatFits:
            return "See what fits"
        case .explainPiece:
            return "Explain piece"
        case .seeInRoom:
            return "See in room"
        case .letDrift:
            return "Let it drift"
        case .whatsNew:
            return "What's new"
        case .whatsMissing:
            return "What's missing"
        case .seeTogether:
            return "See together"
        case .share:
            return "Share"
        case .addToTable:
            return "Add to table"
        case .similarPieces:
            return "Similar pieces"
        case .savePhoto:
            return "Save photo"
        case .tryAnother:
            return "Try another"
        case .exitAR:
            return "Exit AR"
        case .skipAhead:
            return "Skip ahead"
        case .startFresh:
            return "Start fresh"
        case .tellMeMore:
            return "Tell me more"
        case .needHelp:
            return "Need help"
        case .narrowDown:
            return "Narrow down options"
        case .suggestOptions:
            return "Suggest options"
        case .none:
            return "No intent"
        case .requestDesignServices:
            return "Request design services"
        case .viewRecommendations:
            return "View recommendations"
        case .webSignIn:
            return "Sign in to web"
        case .showSettings:
            return "Account"
        }
    }
}
