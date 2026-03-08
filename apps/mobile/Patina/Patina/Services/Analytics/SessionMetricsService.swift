//
//  SessionMetricsService.swift
//  Patina
//
//  Tracks user session metrics for stuck detection and analytics
//  Per spec section FUNC-019: Proactive Assistance
//

import Foundation
import Combine

/// Service for tracking user session metrics
@Observable
@MainActor
public final class SessionMetricsService {

    // MARK: - Singleton

    public static let shared = SessionMetricsService()

    // MARK: - Session State

    /// Unique session identifier
    public private(set) var sessionId: String

    /// Session start time
    public private(set) var sessionStartTime: Date

    /// Total screens visited in this session
    public private(set) var totalScreensVisited: Int = 0

    /// Set of unique screens visited
    private var visitedScreens: Set<String> = []

    // MARK: - Current Screen Metrics

    /// Current screen identifier
    public private(set) var currentScreen: String?

    /// Time when user entered current screen
    public private(set) var screenEntryTime: Date?

    /// Number of interactions on current screen
    public private(set) var interactionCountOnCurrentScreen: Int = 0

    /// Number of scroll direction changes on current screen
    public private(set) var scrollDirectionChanges: Int = 0

    /// Last scroll direction (true = down, false = up)
    private var lastScrollDirection: Bool?

    // MARK: - Stuck Detection Configuration

    /// Minimum dwell time (seconds) to consider user might be stuck
    private let stuckDwellThreshold: TimeInterval = 30.0

    /// Minimum scroll direction changes to suggest indecision
    private let stuckScrollChangesThreshold: Int = 3

    // MARK: - Computed Properties

    /// Time spent on current screen in seconds
    public var dwellTimeOnCurrentScreen: TimeInterval {
        guard let entryTime = screenEntryTime else { return 0 }
        return Date().timeIntervalSince(entryTime)
    }

    /// Whether metrics suggest user might be stuck
    public var suggestsUserStuck: Bool {
        // User is stuck if:
        // 1. Dwell time > 30s AND no interactions
        // 2. OR scroll direction changes > 3 (indecision pattern)
        let longDwellNoInteraction = dwellTimeOnCurrentScreen > stuckDwellThreshold
            && interactionCountOnCurrentScreen == 0

        let indecisiveScrolling = scrollDirectionChanges > stuckScrollChangesThreshold

        return longDwellNoInteraction || indecisiveScrolling
    }

    /// Summary of current session metrics
    public var sessionSummary: SessionSummary {
        SessionSummary(
            sessionId: sessionId,
            duration: Date().timeIntervalSince(sessionStartTime),
            screensVisited: totalScreensVisited,
            currentScreen: currentScreen,
            currentScreenDwell: dwellTimeOnCurrentScreen,
            currentScreenInteractions: interactionCountOnCurrentScreen,
            suggestsStuck: suggestsUserStuck
        )
    }

    // MARK: - Initialization

    private init() {
        self.sessionId = UUID().uuidString
        self.sessionStartTime = Date()
    }

    // MARK: - Public Methods

    /// Record navigation to a new screen
    /// - Parameter screen: Screen identifier
    public func recordScreenEntry(_ screen: String) {
        // Save previous screen metrics if needed
        if currentScreen != nil {
            // Could emit analytics event here for previous screen
        }

        // Update screen tracking
        currentScreen = screen
        screenEntryTime = Date()
        interactionCountOnCurrentScreen = 0
        scrollDirectionChanges = 0
        lastScrollDirection = nil

        // Track unique screens
        if !visitedScreens.contains(screen) {
            visitedScreens.insert(screen)
            totalScreensVisited += 1
        }
    }

    /// Record a user interaction (tap, button press, etc.)
    public func recordInteraction() {
        interactionCountOnCurrentScreen += 1
    }

    /// Record a scroll event with direction
    /// - Parameter isScrollingDown: True if scrolling down, false if up
    public func recordScroll(isScrollingDown: Bool) {
        // Check for direction change
        if let lastDirection = lastScrollDirection, lastDirection != isScrollingDown {
            scrollDirectionChanges += 1
        }

        lastScrollDirection = isScrollingDown

        // Scrolling counts as an interaction
        interactionCountOnCurrentScreen += 1
    }

    /// Reset metrics for current screen (e.g., after user takes action)
    public func resetCurrentScreenMetrics() {
        screenEntryTime = Date()
        interactionCountOnCurrentScreen = 0
        scrollDirectionChanges = 0
        lastScrollDirection = nil
    }

    /// Start a new session (e.g., app foreground after long background)
    public func startNewSession() {
        sessionId = UUID().uuidString
        sessionStartTime = Date()
        totalScreensVisited = 0
        visitedScreens.removeAll()
        currentScreen = nil
        screenEntryTime = nil
        interactionCountOnCurrentScreen = 0
        scrollDirectionChanges = 0
        lastScrollDirection = nil
    }

    /// Get metrics for API request (companion-context)
    public func getAPIMetrics() -> APISessionMetrics {
        APISessionMetrics(
            sessionId: sessionId,
            dwellTime: dwellTimeOnCurrentScreen,
            interactions: interactionCountOnCurrentScreen,
            scrollChanges: scrollDirectionChanges,
            screensVisited: totalScreensVisited
        )
    }
}

// MARK: - Supporting Types

/// Summary of session metrics
public struct SessionSummary {
    public let sessionId: String
    public let duration: TimeInterval
    public let screensVisited: Int
    public let currentScreen: String?
    public let currentScreenDwell: TimeInterval
    public let currentScreenInteractions: Int
    public let suggestsStuck: Bool

    /// Human-readable duration
    public var formattedDuration: String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        if minutes > 0 {
            return "\(minutes)m \(seconds)s"
        }
        return "\(seconds)s"
    }
}

/// Session metrics formatted for API requests
public struct APISessionMetrics: Codable {
    public let sessionId: String
    public let dwellTime: Double
    public let interactions: Int
    public let scrollChanges: Int
    public let screensVisited: Int

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case dwellTime = "dwell_time"
        case interactions
        case scrollChanges = "scroll_changes"
        case screensVisited = "screens_visited"
    }
}

// MARK: - Stuck Detection Reasons

extension SessionMetricsService {

    /// Detailed reason why user might be stuck
    public enum StuckReason: Equatable {
        case none
        case longDwellNoInteraction(dwellTime: TimeInterval)
        case indecisiveScrolling(changes: Int)
        case both(dwellTime: TimeInterval, scrollChanges: Int)

        public var helpMessage: String {
            switch self {
            case .none:
                return ""
            case .longDwellNoInteraction:
                return "Need help finding what you're looking for?"
            case .indecisiveScrolling:
                return "Looking for something specific? I can help narrow it down."
            case .both:
                return "I noticed you might be exploring. Want me to suggest some options?"
            }
        }
    }

    /// Get detailed stuck reason
    public var stuckReason: StuckReason {
        let longDwell = dwellTimeOnCurrentScreen > stuckDwellThreshold
            && interactionCountOnCurrentScreen == 0
        let indecisive = scrollDirectionChanges > stuckScrollChangesThreshold

        switch (longDwell, indecisive) {
        case (true, true):
            return .both(dwellTime: dwellTimeOnCurrentScreen, scrollChanges: scrollDirectionChanges)
        case (true, false):
            return .longDwellNoInteraction(dwellTime: dwellTimeOnCurrentScreen)
        case (false, true):
            return .indecisiveScrolling(changes: scrollDirectionChanges)
        case (false, false):
            return .none
        }
    }
}
