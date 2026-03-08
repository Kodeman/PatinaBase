//
//  CompanionAnalytics.swift
//  Patina
//
//  Analytics events for Companion feature tracking
//  Per spec section 12.3: Success Metrics
//

import Foundation

/// Analytics service specifically for Companion feature events
@MainActor
public final class CompanionAnalytics {

    // MARK: - Singleton

    public static let shared = CompanionAnalytics()

    // MARK: - Dependencies

    private let postHog = PostHogService.shared
    private let sessionMetrics = SessionMetricsService.shared

    // MARK: - Initialization

    private init() {}

    // MARK: - FAB Events

    /// Track FAB (floating action button) tap
    public func trackFABTapped(screen: String) {
        postHog.capture(
            CompanionEvent.fabTapped.rawValue,
            properties: [
                "screen": screen,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Panel Events

    /// Track panel opened
    public func trackPanelOpened(screen: String, isAuthenticated: Bool) {
        postHog.capture(
            CompanionEvent.panelOpened.rawValue,
            properties: [
                "screen": screen,
                "is_authenticated": isAuthenticated,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    /// Track panel closed
    public func trackPanelClosed(screen: String, interactionCount: Int, dwellTime: TimeInterval) {
        postHog.capture(
            CompanionEvent.panelClosed.rawValue,
            properties: [
                "screen": screen,
                "interaction_count": interactionCount,
                "dwell_time_seconds": dwellTime,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Quick Action Events

    /// Track quick action tapped
    public func trackQuickActionTapped(
        actionId: String,
        actionTitle: String,
        screen: String,
        isFromStuckDetection: Bool = false
    ) {
        postHog.capture(
            CompanionEvent.quickActionTapped.rawValue,
            properties: [
                "action_id": actionId,
                "action_title": actionTitle,
                "screen": screen,
                "from_stuck_detection": isFromStuckDetection,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Conversation Events

    /// Track message sent by user
    public func trackMessageSent(screen: String, messageLength: Int) {
        postHog.capture(
            CompanionEvent.messageSent.rawValue,
            properties: [
                "screen": screen,
                "message_length": messageLength,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    /// Track response received from Patina
    public func trackResponseReceived(
        screen: String,
        responseTime: TimeInterval,
        hasQuickActions: Bool,
        hasSuggestions: Bool
    ) {
        postHog.capture(
            CompanionEvent.responseReceived.rawValue,
            properties: [
                "screen": screen,
                "response_time_ms": Int(responseTime * 1000),
                "has_quick_actions": hasQuickActions,
                "has_suggestions": hasSuggestions,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    /// Track conversation started
    public func trackConversationStarted(screen: String) {
        postHog.capture(
            CompanionEvent.conversationStarted.rawValue,
            properties: [
                "screen": screen,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    /// Track conversation cleared
    public func trackConversationCleared(messageCount: Int) {
        postHog.capture(
            CompanionEvent.conversationCleared.rawValue,
            properties: [
                "message_count": messageCount,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Authentication Events

    /// Track auth prompt shown
    public func trackAuthPromptShown(screen: String) {
        postHog.capture(
            CompanionEvent.authPromptShown.rawValue,
            properties: [
                "screen": screen,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    /// Track successful authentication
    public func trackAuthCompleted(method: AuthMethod, isNewUser: Bool) {
        postHog.capture(
            CompanionEvent.authCompleted.rawValue,
            properties: [
                "method": method.rawValue,
                "is_new_user": isNewUser,
                "session_id": sessionMetrics.sessionId
            ]
        )

        // Also set user property
        if isNewUser {
            postHog.setUserProperty("signup_method", value: method.rawValue)
            postHog.setUserProperty("signup_date", value: ISO8601DateFormatter().string(from: Date()))
        }
    }

    /// Track authentication failure
    public func trackAuthFailed(method: AuthMethod, errorCode: String) {
        postHog.capture(
            CompanionEvent.authFailed.rawValue,
            properties: [
                "method": method.rawValue,
                "error_code": errorCode,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Product Events

    /// Track product suggestion tapped
    public func trackProductSuggestionTapped(
        productId: String,
        productName: String,
        position: Int,
        screen: String
    ) {
        postHog.capture(
            CompanionEvent.productSuggestionTapped.rawValue,
            properties: [
                "product_id": productId,
                "product_name": productName,
                "position": position,
                "screen": screen,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Escalation Events

    /// Track designer escalation tapped
    public func trackDesignerEscalationTapped(screen: String, roomId: String?) {
        postHog.capture(
            CompanionEvent.designerEscalationTapped.rawValue,
            properties: [
                "screen": screen,
                "room_id": roomId ?? "none",
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Stuck Detection Events

    /// Track when user appears stuck
    public func trackUserStuck(
        screen: String,
        reason: SessionMetricsService.StuckReason,
        dwellTime: TimeInterval,
        interactionCount: Int
    ) {
        let reasonString: String
        switch reason {
        case .none: return // Don't track if not stuck
        case .longDwellNoInteraction: reasonString = "long_dwell"
        case .indecisiveScrolling: reasonString = "indecisive_scrolling"
        case .both: reasonString = "both"
        }

        postHog.capture(
            CompanionEvent.userStuck.rawValue,
            properties: [
                "screen": screen,
                "reason": reasonString,
                "dwell_time_seconds": dwellTime,
                "interaction_count": interactionCount,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    /// Track help offered to stuck user
    public func trackHelpOffered(screen: String, reason: SessionMetricsService.StuckReason) {
        let reasonString: String
        switch reason {
        case .none: reasonString = "proactive"
        case .longDwellNoInteraction: reasonString = "long_dwell"
        case .indecisiveScrolling: reasonString = "indecisive_scrolling"
        case .both: reasonString = "both"
        }

        postHog.capture(
            CompanionEvent.helpOffered.rawValue,
            properties: [
                "screen": screen,
                "reason": reasonString,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    /// Track help accepted by user
    public func trackHelpAccepted(screen: String, actionTaken: String) {
        postHog.capture(
            CompanionEvent.helpAccepted.rawValue,
            properties: [
                "screen": screen,
                "action_taken": actionTaken,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Error Events

    /// Track API error
    public func trackAPIError(endpoint: String, errorCode: String, errorMessage: String) {
        postHog.capture(
            CompanionEvent.apiError.rawValue,
            properties: [
                "endpoint": endpoint,
                "error_code": errorCode,
                "error_message": errorMessage,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }

    // MARK: - Session Events

    /// Track session metrics summary
    public func trackSessionSummary() {
        let summary = sessionMetrics.sessionSummary

        postHog.capture(
            CompanionEvent.sessionSummary.rawValue,
            properties: [
                "session_id": summary.sessionId,
                "duration_seconds": summary.duration,
                "screens_visited": summary.screensVisited,
                "was_stuck": summary.suggestsStuck
            ]
        )
    }
}

// MARK: - Event Names

/// Companion analytics event names
public enum CompanionEvent: String {
    // FAB events
    case fabTapped = "companion_fab_tapped"

    // Panel events
    case panelOpened = "companion_panel_opened"
    case panelClosed = "companion_panel_closed"

    // Quick action events
    case quickActionTapped = "companion_quick_action_tapped"

    // Conversation events
    case messageSent = "companion_message_sent"
    case responseReceived = "companion_response_received"
    case conversationStarted = "companion_conversation_started"
    case conversationCleared = "companion_conversation_cleared"

    // Authentication events
    case authPromptShown = "companion_auth_prompt_shown"
    case authCompleted = "companion_auth_completed"
    case authFailed = "companion_auth_failed"

    // Product events
    case productSuggestionTapped = "companion_product_suggestion_tapped"

    // Escalation events
    case designerEscalationTapped = "companion_designer_escalation_tapped"

    // Stuck detection events
    case userStuck = "companion_user_stuck"
    case helpOffered = "companion_help_offered"
    case helpAccepted = "companion_help_accepted"

    // Error events
    case apiError = "companion_api_error"

    // Session events
    case sessionSummary = "companion_session_summary"
}

// MARK: - Auth Method

/// Authentication methods for analytics
public enum AuthMethod: String {
    case apple = "apple"
    case email = "email"
    case google = "google"
}

// MARK: - Convenience Extensions

extension CompanionAnalytics {

    /// Track a complete FAB → Panel → Close flow
    public func trackCompanionInteraction(
        screen: String,
        isAuthenticated: Bool,
        interactionCount: Int,
        dwellTime: TimeInterval,
        quickActionsUsed: [String]
    ) {
        postHog.capture(
            "companion_interaction_complete",
            properties: [
                "screen": screen,
                "is_authenticated": isAuthenticated,
                "interaction_count": interactionCount,
                "dwell_time_seconds": dwellTime,
                "quick_actions_used": quickActionsUsed,
                "quick_action_count": quickActionsUsed.count,
                "session_id": sessionMetrics.sessionId
            ]
        )
    }
}
