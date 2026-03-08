//
//  CompanionService.swift
//  Patina
//
//  AI conversation service for Patina companion
//  Integrates with Companion Edge Functions
//

import Foundation

/// Service for managing AI-powered conversations with Patina
@MainActor
public final class CompanionService: CompanionServiceProtocol {

    // MARK: - Properties

    private var conversationHistory: [Message] = []
    private let maxHistoryLength = 50
    private var currentConversationId: String?

    /// API client for Edge Functions
    private let apiClient = CompanionAPIClient.shared

    /// Whether to use real API (vs fallback to local mock)
    private let useRealAPI: Bool

    // MARK: - Singleton

    public static let shared = CompanionService()

    // MARK: - Initialization

    private init() {
        // Use real API if user is authenticated, otherwise use mock
        self.useRealAPI = AuthService.shared.isAuthenticated
    }

    // MARK: - Public Methods

    /// Send a message and get a response from Patina
    public func sendMessage(_ content: String, context: ConversationContext) async throws -> Message {
        // Add user message to history
        let userMessage = Message(content: content, sender: .user)
        addToHistory(userMessage)

        // Try real API if authenticated
        if useRealAPI && AuthService.shared.isAuthenticated {
            do {
                let response = try await sendMessageViaAPI(content, context: context)
                return response
            } catch {
                print("API call failed, falling back to mock: \(error)")
                // Fall through to mock implementation
            }
        }

        // Fallback to mock implementation
        let request = ConversationRequest(
            message: content,
            conversationHistory: Array(conversationHistory.suffix(20)),
            context: context
        )

        let response = try await callConversationAPI(request)

        let patinaMessage = Message(
            content: response.reply,
            sender: .patina,
            extractedIntent: response.intent,
            metadata: MessageMetadata(
                suggestions: response.suggestions,
                requiresAction: response.requiresAction
            )
        )

        addToHistory(patinaMessage)

        return patinaMessage
    }

    /// Send message via Companion API
    private func sendMessageViaAPI(_ content: String, context: ConversationContext) async throws -> Message {
        // Build API context
        let messageContext = CompanionMessageRequest.MessageContext(
            screen: context.rooms.first?.name ?? "home",
            productId: nil,
            roomId: context.rooms.first?.id.uuidString
        )

        // Call API
        let response = try await apiClient.sendMessage(
            content,
            context: messageContext,
            conversationId: currentConversationId
        )

        // Store conversation ID for future messages
        if currentConversationId == nil {
            // Extract conversation ID from response if available (would need to add to API)
            // For now, we'll rely on the API to manage conversation sessions
        }

        // Convert API response to Message
        let patinaMessage = Message(
            content: response.response,
            sender: .patina,
            extractedIntent: detectIntent(from: response.response),
            metadata: MessageMetadata(
                suggestions: response.quickActions?.map(\.label),
                requiresAction: response.quickActions?.isEmpty == false
            )
        )

        addToHistory(patinaMessage)

        return patinaMessage
    }

    /// Extract style profile from conversation
    public func extractStyleProfile(from messages: [Message]) async throws -> StyleProfile? {
        let userMessages = messages.filter { $0.sender == .user }
        guard !userMessages.isEmpty else { return nil }

        let request = StyleExtractionRequest(
            messages: userMessages.map(\.content)
        )

        let response = try await callStyleExtractionAPI(request)
        return response.profile
    }

    /// Get personalized greeting based on context
    public func getGreeting(for context: ConversationContext) -> String {
        let timeOfDay = TimeOfDay.current
        let hasHistory = !conversationHistory.isEmpty

        if hasHistory {
            return getReturningUserGreeting(timeOfDay: timeOfDay, context: context)
        } else {
            return getNewUserGreeting(timeOfDay: timeOfDay)
        }
    }

    /// Clear conversation history
    public func clearHistory() {
        conversationHistory.removeAll()
        currentConversationId = nil
    }

    /// Fetch quick actions from API based on context
    /// - Parameters:
    ///   - screen: Current screen identifier
    ///   - context: Optional companion context with additional data
    ///   - sessionMetrics: Optional session metrics for stuck detection
    /// - Returns: Array of quick actions
    public func fetchQuickActions(
        screen: String,
        context: CompanionContext? = nil,
        sessionMetrics: APISessionMetrics? = nil
    ) async throws -> [APIQuickAction] {
        guard AuthService.shared.isAuthenticated else {
            return []
        }

        let screenData: QuickActionsRequest.ScreenData?
        if let ctx = context {
            screenData = apiClient.screenData(from: ctx)
        } else {
            screenData = nil
        }

        // Convert APISessionMetrics to QuickActionsRequest.SessionMetrics
        let requestMetrics: QuickActionsRequest.SessionMetrics?
        if let metrics = sessionMetrics {
            requestMetrics = QuickActionsRequest.SessionMetrics(
                sessionId: metrics.sessionId,
                dwellTime: metrics.dwellTime,
                interactions: metrics.interactions,
                scrollChanges: metrics.scrollChanges,
                screensVisited: metrics.screensVisited
            )
        } else {
            requestMetrics = nil
        }

        let response = try await apiClient.fetchQuickActions(
            screen: screen,
            screenData: screenData,
            sessionMetrics: requestMetrics
        )

        return response.quickActions
    }

    /// Load conversation history from API
    /// - Parameter limit: Maximum messages to load
    /// - Returns: Array of history messages
    public func loadHistory(limit: Int = 50) async throws -> [ConversationHistoryResponse.HistoryMessage] {
        guard AuthService.shared.isAuthenticated else {
            return []
        }

        let response = try await apiClient.fetchHistory(limit: limit)
        return response.messages
    }

    // MARK: - Private Methods

    private func addToHistory(_ message: Message) {
        conversationHistory.append(message)

        // Trim history if too long
        if conversationHistory.count > maxHistoryLength {
            conversationHistory = Array(conversationHistory.suffix(maxHistoryLength))
        }
    }

    private func callConversationAPI(_ request: ConversationRequest) async throws -> ConversationResponse {
        // In production, this would call a Supabase Edge Function or external API
        // For now, return a mock response

        // Simulate network delay
        try await Task.sleep(nanoseconds: 800_000_000)

        return ConversationResponse(
            reply: generateMockReply(for: request.message),
            intent: detectIntent(from: request.message),
            suggestions: generateSuggestions(for: request.message),
            requiresAction: false
        )
    }

    private func callStyleExtractionAPI(_ request: StyleExtractionRequest) async throws -> StyleExtractionResponse {
        // Simulate API call
        try await Task.sleep(nanoseconds: 500_000_000)

        var profile = StyleProfile()
        profile.confidence = 0.5

        // Simple keyword extraction
        let allText = request.messages.joined(separator: " ").lowercased()

        if allText.contains("warm") || allText.contains("cozy") {
            profile.warmth = .warm
        }
        if allText.contains("wood") {
            profile.materials.append(.wood)
        }
        if allText.contains("mid-century") {
            profile.eraPreferences.append(.midCentury)
        }

        return StyleExtractionResponse(profile: profile)
    }

    private func generateMockReply(for input: String) -> String {
        let lowercased = input.lowercased()

        if lowercased.contains("hello") || lowercased.contains("hi") {
            return "Hello! I'm so glad you're here. What brings you to think about your space today?"
        }

        if lowercased.contains("wood") {
            return "Wood has such a grounding quality, doesn't it? The grain tells a story of years of growth. Do you find yourself drawn to lighter woods like oak, or darker ones like walnut?"
        }

        if lowercased.contains("help") || lowercased.contains("looking") {
            return "I'd love to help. Rather than showing you everything at once, let's discover what truly speaks to you. What's the feeling you want when you walk into your space?"
        }

        return "That's a beautiful way to think about it. Tell me more about what matters to you in your home."
    }

    private func detectIntent(from message: String) -> ConversationIntent? {
        let lowercased = message.lowercased()

        if lowercased.contains("show") && lowercased.contains("room") {
            return .showRooms
        }
        if lowercased.contains("table") || lowercased.contains("saved") {
            return .showTable
        }
        if lowercased.contains("walk") || lowercased.contains("scan") {
            return .startWalk
        }
        if lowercased.contains("style") || lowercased.contains("feel") {
            return .describeStyle
        }

        return nil
    }

    private func generateSuggestions(for message: String) -> [String]? {
        let lowercased = message.lowercased()

        if lowercased.contains("style") {
            return ["Warm and inviting", "Clean and minimal", "Rich and layered"]
        }

        if lowercased.contains("room") || lowercased.contains("space") {
            return ["Living room", "Bedroom", "Office"]
        }

        return nil
    }

    private func getNewUserGreeting(timeOfDay: TimeOfDay) -> String {
        switch timeOfDay {
        case .dawn:
            return "Good morning. There's something special about this quiet hour. I'm Patina, and I'm here to help you discover furniture that truly belongs in your space."
        case .morning:
            return "Good morning. I'm Patina. I'm here to help you discover furniture that truly belongs in your space—pieces that will feel like they've always been there."
        case .day:
            return "Hello. I'm Patina. I'm not here to sell you furniture—I'm here to help you understand what your space needs, and to find pieces that will grow with your life."
        case .afternoon:
            return "Good afternoon. I'm Patina. I'm here to help you discover furniture that feels like it was made for your space—pieces with character that will grow with your life."
        case .evening:
            return "Good evening. As the day winds down, it's a lovely time to think about home. I'm Patina, and I'd love to explore your space with you."
        case .night:
            return "Hello, night owl. Sometimes the quiet hours are best for imagining. I'm Patina, and I'm here whenever you're ready to explore."
        }
    }

    private func getReturningUserGreeting(timeOfDay: TimeOfDay, context: ConversationContext) -> String {
        let greeting = timeOfDay == .dawn ? "Good morning" :
                       timeOfDay == .night ? "Hello again" : "Welcome back"

        if let style = context.styleProfile, style.isComplete {
            return "\(greeting). I've been thinking about what we discussed. Ready to explore some pieces that might resonate with your style?"
        }

        return "\(greeting). It's nice to see you again. Where would you like to pick up?"
    }
}

// MARK: - Request/Response Types

struct ConversationRequest: Codable {
    let message: String
    let conversationHistory: [Message]
    let context: ConversationContext
}

struct ConversationResponse: Codable {
    let reply: String
    let intent: ConversationIntent?
    let suggestions: [String]?
    let requiresAction: Bool
}

struct StyleExtractionRequest: Codable {
    let messages: [String]
}

struct StyleExtractionResponse: Codable {
    let profile: StyleProfile
}
