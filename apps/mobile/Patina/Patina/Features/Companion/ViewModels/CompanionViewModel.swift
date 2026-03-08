//
//  CompanionViewModel.swift
//  Patina
//
//  ViewModel for the Companion overlay and sheet
//  Per spec section 3: State management for conversation and context
//

import SwiftUI

/// ViewModel for the Companion
@Observable
@MainActor
public final class CompanionViewModel {

    // MARK: - State

    /// Whether companion has a pending message
    public var hasPendingMessage = false

    /// Current companion message
    public var currentMessage: String?

    /// Hint text shown when pulsing (e.g., "Something surfaced")
    public var notificationHint: String?

    /// Type of pending notification for context-aware UI
    public var notificationType: NotificationType?

    /// Companion mood affects animations
    public var mood: CompanionMood = .neutral

    /// Quick action suggestions (legacy - for backward compatibility)
    public var suggestions: [CompanionSuggestion] = []

    /// Context-aware quick actions
    public var quickActions: [QuickAction] = []

    /// API-sourced quick actions (from backend)
    public var apiQuickActions: [APIQuickAction] = []

    /// Current context from the coordinator
    public var context: CompanionContext = CompanionContext(currentScreen: .roomList)

    // MARK: - Conversation State

    /// Conversation messages (Patina + User)
    public var conversationMessages: [Message] = []

    /// Whether Patina is "thinking" (typing indicator)
    public var isThinking: Bool = false

    /// Error message to display
    public var errorMessage: String?

    /// Whether currently loading history
    public var isLoadingHistory: Bool = false

    // MARK: - Dependencies

    private let settings = AppSettings.shared
    private let companionService = CompanionService.shared
    private let storageService = ConversationStorageService.shared
    private let sessionMetrics = SessionMetricsService.shared
    private let analytics = CompanionAnalytics.shared

    // MARK: - Stuck Detection

    /// Whether the user appears to be stuck
    public var userAppearsStuck: Bool {
        sessionMetrics.suggestsUserStuck
    }

    /// Reason why user might be stuck
    public var stuckReason: SessionMetricsService.StuckReason {
        sessionMetrics.stuckReason
    }

    /// Help message based on stuck reason
    public var stuckHelpMessage: String? {
        let reason = sessionMetrics.stuckReason
        guard reason != .none else { return nil }
        return reason.helpMessage
    }

    /// Timer for periodic stuck detection checks
    private var stuckDetectionTimer: Timer?

    // MARK: - Initialization

    public init() {
        loadInitialState()
        loadCachedMessagesIfAvailable()
    }

    /// Load cached messages for offline access
    private func loadCachedMessagesIfAvailable() {
        guard AuthService.shared.isAuthenticated,
              let userId = AuthService.shared.currentUserId else { return }

        if let cachedMessages = storageService.loadMessages(for: userId) {
            conversationMessages = cachedMessages
        }
    }

    // MARK: - Setup

    private func loadInitialState() {
        hasPendingMessage = settings.companionHasUnreadMessage

        // Set default suggestions based on user progress
        if !settings.hasCompletedOnboarding {
            suggestions = [
                CompanionSuggestion(icon: "text.bubble", title: "Tell me about your space"),
                CompanionSuggestion(icon: "camera.viewfinder", title: "Take a walk together")
            ]
            quickActions = QuickActionFactory.actions(for: .conversation)
        } else {
            suggestions = [
                CompanionSuggestion(icon: "rectangle.stack", title: "Show me my table"),
                CompanionSuggestion(icon: "sparkles", title: "Find something new")
            ]
            quickActions = QuickActionFactory.actions(for: .roomList)
        }
    }

    // MARK: - Context Updates

    /// Update quick actions based on current context
    public func updateContext(_ newContext: CompanionContext) {
        let screenChanged = context.currentScreen != newContext.currentScreen
        context = newContext
        quickActions = QuickActionFactory.actions(for: newContext.currentScreen, context: newContext)

        // Track screen entry for session metrics
        if screenChanged {
            let screenName = screenIdentifier(for: newContext.currentScreen)
            sessionMetrics.recordScreenEntry(screenName)
        }

        // Update notification hint if there's a pending notification
        if let notification = newContext.pendingNotification {
            notificationHint = notification.type.hintText
            notificationType = notification.type
            hasPendingMessage = true
        }

        // Fetch API quick actions if authenticated
        if AuthService.shared.isAuthenticated {
            Task {
                await fetchAPIQuickActions()
            }
        }
    }

    /// Fetch quick actions from the backend API
    public func fetchAPIQuickActions() async {
        guard AuthService.shared.isAuthenticated else { return }

        do {
            let screenName = screenIdentifier(for: context.currentScreen)
            apiQuickActions = try await companionService.fetchQuickActions(
                screen: screenName,
                context: context,
                sessionMetrics: getSessionMetrics()
            )
        } catch {
            print("Failed to fetch API quick actions: \(error)")
            // Keep using local quick actions as fallback
        }
    }

    /// Convert AppRoute to API screen identifier
    private func screenIdentifier(for route: AppRoute) -> String {
        switch route {
        case .threshold: return "threshold"
        case .heroFrame: return "hero_frame"
        case .conversation: return "conversation"
        case .roomList: return "room_list"
        case .roomDetail: return "room_detail"
        case .roomSavedItems: return "room_saved_items"
        case .roomOptions: return "room_options"
        case .walk, .walkSession: return "walk"
        case .rescan: return "rescan"
        case .emergence, .roomEmergence: return "emergence"
        case .table: return "table"
        case .pieceDetail: return "piece_detail"
        case .authentication: return "authentication"
        case .settings: return "settings"
        case .designServicesRequest: return "design_services"
        case .walkInvitation: return "walk_invitation"
        case .cameraPermission: return "camera_permission"
        case .walkComplete: return "walk_complete"
        case .firstEmergence: return "first_emergence"
        case .roomNaming: return "room_naming"
        case .qrScanner: return "qr_scanner"
        case .qrApproval: return "qr_approval"
        }
    }

    // MARK: - Session Metrics Tracking

    /// Record a user interaction (call from UI when user taps, etc.)
    public func recordInteraction() {
        sessionMetrics.recordInteraction()
    }

    /// Record a scroll event
    public func recordScroll(isScrollingDown: Bool) {
        sessionMetrics.recordScroll(isScrollingDown: isScrollingDown)
    }

    /// Get quick actions including stuck detection actions if applicable
    public var effectiveQuickActions: [QuickAction] {
        var actions = quickActions

        // Prepend stuck help action if user appears stuck
        if userAppearsStuck {
            let stuckActions = QuickActionFactory.stuckActions(for: stuckReason)
            if !stuckActions.isEmpty {
                // Insert help action at the beginning
                actions.insert(contentsOf: stuckActions.prefix(1), at: 0)
            }
        }

        return actions
    }

    /// Get session metrics for API requests
    public func getSessionMetrics() -> APISessionMetrics {
        sessionMetrics.getAPIMetrics()
    }

    // MARK: - Actions

    /// Mark message as read
    public func markMessageRead() {
        hasPendingMessage = false
        notificationHint = nil
        notificationType = nil
        settings.companionHasUnreadMessage = false
    }

    /// Set a new message from Patina
    public func setMessage(_ message: String) {
        currentMessage = message
        hasPendingMessage = true
        settings.companionHasUnreadMessage = true
    }

    /// Set a notification
    public func setNotification(type: NotificationType, message: String) {
        notificationType = type
        notificationHint = type.hintText
        currentMessage = message
        hasPendingMessage = true
        settings.companionHasUnreadMessage = true
        mood = .excited
    }

    /// Handle suggestion tap (legacy)
    public func handleSuggestion(_ suggestion: CompanionSuggestion) {
        HapticManager.shared.impact(.light)
        // In a full implementation, this would navigate or trigger actions
        print("Selected suggestion: \(suggestion.title)")
    }

    /// Handle quick action tap
    public func handleQuickAction(_ action: QuickAction) -> NavigationIntent {
        HapticManager.shared.impact(.light)

        // Record interaction
        recordInteraction()

        // Track quick action
        let screenName = screenIdentifier(for: context.currentScreen)
        let isFromStuck = userAppearsStuck && (action.intent == .needHelp || action.intent == .narrowDown || action.intent == .suggestOptions)
        analytics.trackQuickActionTapped(
            actionId: action.id.uuidString,
            actionTitle: action.title,
            screen: screenName,
            isFromStuckDetection: isFromStuck
        )

        // Reset stuck detection when user takes action
        if userAppearsStuck {
            sessionMetrics.resetCurrentScreenMetrics()

            // Track help accepted if it was a help action
            if isFromStuck {
                analytics.trackHelpAccepted(screen: screenName, actionTaken: action.title)
            }
        }

        // Handle help intents specially
        switch action.intent {
        case .needHelp:
            handleNeedHelp()
        case .narrowDown:
            handleNarrowDown()
        case .suggestOptions:
            handleSuggestOptions()
        case .requestDesignServices(let roomId):
            analytics.trackDesignerEscalationTapped(screen: screenName, roomId: roomId?.uuidString)
        default:
            break
        }

        // Return the intent for the coordinator to handle
        return action.intent
    }

    /// Handle "Need help?" action
    private func handleNeedHelp() {
        // Add a proactive message from Patina
        let helpMessage = stuckHelpMessage ?? "I'm here to help. What are you looking for?"
        addPatinaMessage(helpMessage)
    }

    /// Handle "Narrow down" action
    private func handleNarrowDown() {
        addPatinaMessage("Let's narrow things down. What's most important to you - style, size, or price?")
    }

    /// Handle "Suggest options" action
    private func handleSuggestOptions() {
        addPatinaMessage("Based on what you've been looking at, here are a few pieces that might resonate with your space.")
    }

    // MARK: - Conversation

    /// Send a user message and get Patina's response
    public func sendUserMessage(_ text: String) {
        // Clear any previous error
        errorMessage = nil

        // Track message sent
        let screenName = screenIdentifier(for: context.currentScreen)
        analytics.trackMessageSent(screen: screenName, messageLength: text.count)

        // Add user message to local state immediately for responsiveness
        let userMessage = Message(content: text, sender: .user)
        conversationMessages.append(userMessage)

        // Cache user message locally (unsynced until server confirms)
        if let userId = AuthService.shared.currentUserId {
            storageService.addMessage(userMessage, userId: userId, isSynced: false)
        }

        // Show typing indicator
        isThinking = true

        // Send via CompanionService (async)
        Task {
            await sendMessageAsync(text)
        }
    }

    /// Async message sending via CompanionService
    private func sendMessageAsync(_ text: String) async {
        let startTime = Date()

        do {
            // Build conversation context from current companion context
            let rooms: [RoomContext] = context.activeRoom.map { activeRoom in
                [RoomContext(
                    id: activeRoom.id,
                    name: activeRoom.name,
                    roomType: .other, // Default type since ActiveRoomContext doesn't have type
                    hasBeenScanned: activeRoom.hasBeenScanned
                )]
            } ?? []

            let conversationContext = ConversationContext(
                styleProfile: nil, // Could be fetched from user profile
                rooms: rooms
            )

            let response = try await companionService.sendMessage(text, context: conversationContext)

            isThinking = false

            // Track response received
            let responseTime = Date().timeIntervalSince(startTime)
            let screenName = screenIdentifier(for: context.currentScreen)
            analytics.trackResponseReceived(
                screen: screenName,
                responseTime: responseTime,
                hasQuickActions: response.metadata?.requiresAction ?? false,
                hasSuggestions: response.metadata?.suggestions?.isEmpty == false
            )

            // Add response to conversation (already added by service, but sync local state)
            conversationMessages.append(response)

            // Cache response and mark user message as synced
            if let userId = AuthService.shared.currentUserId {
                // Find and mark the user message as synced
                if let lastUserMsg = conversationMessages.last(where: { $0.sender == .user }) {
                    storageService.markMessageSynced(lastUserMsg.id)
                }
                // Cache the response
                storageService.addMessage(response, userId: userId, isSynced: true)
            }

            // Update quick actions if response included suggestions
            if let suggestions = response.metadata?.suggestions {
                // Convert suggestions to quick actions if applicable
                updateSuggestionsFromResponse(suggestions)
            }

        } catch {
            isThinking = false
            errorMessage = "Couldn't reach Patina. Please try again."
            print("Failed to send message: \(error)")

            // Track API error
            let screenName = screenIdentifier(for: context.currentScreen)
            analytics.trackAPIError(
                endpoint: "companion-message",
                errorCode: String(describing: type(of: error)),
                errorMessage: error.localizedDescription
            )

            // Fallback to local response generation
            let fallbackResponse = generateFallbackResponse(to: text)
            let patinaMessage = Message(content: fallbackResponse, sender: .patina)
            conversationMessages.append(patinaMessage)

            // Cache fallback response locally
            if let userId = AuthService.shared.currentUserId {
                storageService.addMessage(patinaMessage, userId: userId, isSynced: false)
            }
        }
    }

    /// Update suggestions from API response
    private func updateSuggestionsFromResponse(_ suggestions: [String]) {
        // Convert string suggestions to quick action chips
        self.suggestions = suggestions.map { suggestion in
            CompanionSuggestion(icon: "text.bubble", title: suggestion)
        }
    }

    /// Generate a fallback response when API is unavailable
    private func generateFallbackResponse(to userInput: String) -> String {
        let input = userInput.lowercased()

        if input.contains("table") || input.contains("collection") {
            return "Your table is gathering nicely. Would you like to see what's there?"
        } else if input.contains("walk") || input.contains("room") || input.contains("scan") {
            return "I'd love to walk your space together. Which room shall we explore?"
        } else if input.contains("new") || input.contains("surface") || input.contains("emerge") {
            return "Something has surfaced that might speak to your space. Shall I show you?"
        } else if input.contains("help") {
            return "I can help you discover furniture that belongs in your space. Try asking about your table, walking a room, or seeing what's emerged."
        } else {
            return "Tell me more about what you're looking for. I'm here to help you discover pieces that resonate with your space."
        }
    }

    /// Load conversation history from the backend
    public func loadConversationHistory() async {
        guard AuthService.shared.isAuthenticated,
              let userId = AuthService.shared.currentUserId else { return }
        guard !isLoadingHistory else { return }

        isLoadingHistory = true

        do {
            let historyMessages = try await companionService.loadHistory(limit: 50)

            // Convert API messages to local Message type
            let serverMessages: [Message] = historyMessages.map { historyMsg in
                Message(
                    content: historyMsg.content,
                    sender: historyMsg.role == .user ? .user : .patina
                )
            }

            // Sync with local cache (merges unsynced local messages)
            let mergedMessages = storageService.syncWithServer(serverMessages, userId: userId)

            // Update UI with merged messages
            conversationMessages = mergedMessages

            isLoadingHistory = false
        } catch {
            isLoadingHistory = false
            print("Failed to load conversation history: \(error)")

            // Fall back to cached messages if available
            if let cachedMessages = storageService.loadMessages(for: userId) {
                conversationMessages = cachedMessages
            }
        }
    }

    /// Add a Patina message directly (for system messages)
    public func addPatinaMessage(_ text: String) {
        let message = Message(content: text, sender: .patina)
        conversationMessages.append(message)
    }

    /// Clear conversation history (local and service)
    public func clearConversation() {
        let messageCount = conversationMessages.count
        conversationMessages.removeAll()
        companionService.clearHistory()

        // Track conversation cleared
        if messageCount > 0 {
            analytics.trackConversationCleared(messageCount: messageCount)
        }
    }

    /// Initialize conversation state for authenticated users
    public func initializeForAuthenticatedUser() {
        guard AuthService.shared.isAuthenticated else { return }

        Task {
            // Load conversation history from backend
            await loadConversationHistory()

            // Fetch context-aware quick actions
            await fetchAPIQuickActions()
        }
    }

    /// Handle logout - clear all companion state
    public func handleLogout() {
        // Track session summary before logout
        analytics.trackSessionSummary()

        // Get user ID before clearing
        let userId = AuthService.shared.currentUserId

        clearConversation()
        apiQuickActions.removeAll()
        errorMessage = nil

        // Clear local cache
        if let userId = userId {
            storageService.clearCache(for: userId)
        }

        // Reset PostHog user identification
        PostHogService.shared.reset()
    }
}

// MARK: - Supporting Types

/// Companion mood for animation variations
public enum CompanionMood {
    case neutral
    case excited
    case thoughtful
    case waiting
}

/// Quick action suggestion
public struct CompanionSuggestion: Identifiable {
    public let id = UUID()
    public let icon: String
    public let title: String

    public init(icon: String, title: String) {
        self.icon = icon
        self.title = title
    }
}

/// Types of notifications the Companion can surface
public enum NotificationType: Equatable {
    /// New piece emerged from recommendations
    case emergence

    /// Insight about the user's collection
    case insight

    /// Pieces that resonate together
    case resonance

    /// Reminder to return to something
    case reminder

    /// The hint text displayed for this notification type
    public var hintText: String {
        switch self {
        case .emergence:
            return "Something surfaced"
        case .insight:
            return "A thought about your collection"
        case .resonance:
            return "These pieces speak to each other"
        case .reminder:
            return "Ready to continue?"
        }
    }

    /// Icon for the notification type
    public var icon: String {
        switch self {
        case .emergence:
            return "sparkles"
        case .insight:
            return "lightbulb"
        case .resonance:
            return "link"
        case .reminder:
            return "arrow.uturn.backward"
        }
    }
}
