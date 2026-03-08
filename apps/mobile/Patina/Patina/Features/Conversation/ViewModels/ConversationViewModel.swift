//
//  ConversationViewModel.swift
//  Patina
//
//  ViewModel for the conversation experience
//

import Foundation
import Combine
import UIKit

/// ViewModel for managing conversation state and AI interactions
@Observable
public final class ConversationViewModel {

    // MARK: - Published State

    /// All messages in the conversation
    public private(set) var messages: [Message] = []

    /// Current conversation state
    public private(set) var conversationState: ConversationState = .greeting

    /// Current conversation phase
    public private(set) var phase: ConversationPhase = .introduction

    /// Whether Patina is typing
    public private(set) var isTyping: Bool = false

    /// Whether voice input is active
    public var isVoiceInputActive: Bool = false

    /// Current text input
    public var inputText: String = ""

    /// Error message if any
    public private(set) var errorMessage: String?

    /// Current style profile being built
    public private(set) var styleProfile: StyleProfile?

    /// Conversation context for AI
    public private(set) var context: ConversationContext

    // MARK: - Private Properties

    private var companionService: CompanionServiceProtocol?
    private var coordinator: AppCoordinator?

    // MARK: - Initialization

    public init(
        companionService: CompanionServiceProtocol? = nil,
        coordinator: AppCoordinator? = nil
    ) {
        self.companionService = companionService
        self.coordinator = coordinator
        self.context = ConversationContext()

        // Start with greeting
        addInitialGreeting()
    }

    // MARK: - Public Methods

    /// Send a message from the user
    @MainActor
    public func sendMessage(_ content: String? = nil) async {
        let messageContent = content ?? inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !messageContent.isEmpty else { return }

        // Clear input
        inputText = ""
        errorMessage = nil

        // Add user message
        let userMessage = Message(
            content: messageContent,
            sender: .user
        )
        messages.append(userMessage)

        // Show typing indicator
        isTyping = true
        HapticManager.shared.impact(.light)

        // Get AI response
        do {
            try await processMessage(messageContent)
        } catch {
            errorMessage = "Unable to get a response. Please try again."
            isTyping = false
        }
    }

    /// Handle a suggestion tap
    @MainActor
    public func handleSuggestion(_ suggestion: String) async {
        await sendMessage(suggestion)
    }

    /// Clear conversation and start fresh
    @MainActor
    public func clearConversation() {
        messages.removeAll()
        conversationState = .greeting
        phase = .introduction
        styleProfile = nil
        context = ConversationContext()
        addInitialGreeting()
    }

    // MARK: - Private Methods

    private func addInitialGreeting() {
        let timeOfDay = TimeOfDay.current
        let greeting: String

        switch timeOfDay {
        case .dawn:
            greeting = "Good morning. The early light is so gentle. What brings you here today?"
        case .morning:
            greeting = "Good morning. What brings you here today?"
        case .day:
            greeting = "Hello. What's on your mind about your space?"
        case .afternoon:
            greeting = "Good afternoon. What's on your mind about your space?"
        case .evening:
            greeting = "Good evening. The day is winding down. What are you thinking about for your home?"
        case .night:
            greeting = "Hello, night owl. Sometimes the quiet hours are best for imagining what could be."
        }

        let patinaMessage = Message(
            content: greeting,
            sender: .patina,
            metadata: MessageMetadata(
                suggestions: [
                    "I'm looking for new furniture",
                    "I want to explore my style",
                    "Help me with a room"
                ]
            )
        )
        messages.append(patinaMessage)
    }

    @MainActor
    private func processMessage(_ content: String) async throws {
        // Simulate thinking delay for natural feel
        try await Task.sleep(nanoseconds: 1_000_000_000) // 1 second

        // In a real implementation, this would call the companion service
        // For now, generate contextual responses

        let response = generateResponse(for: content)

        // Add Patina's response
        let patinaMessage = Message(
            content: response.content,
            sender: .patina,
            extractedIntent: response.intent,
            metadata: response.metadata
        )
        messages.append(patinaMessage)

        // Update state based on response
        updateConversationState(based: response.intent)

        // Extract style information if present
        if let extractedStyle = extractStyleFromMessage(content) {
            updateStyleProfile(with: extractedStyle)
        }

        isTyping = false
        HapticManager.shared.impact(.light)
    }

    private func generateResponse(for input: String) -> (content: String, intent: ConversationIntent?, metadata: MessageMetadata?) {
        let lowercased = input.lowercased()

        // Style exploration responses
        if lowercased.contains("style") || lowercased.contains("look") || lowercased.contains("feel") {
            return (
                "Style is such a personal thing. Rather than labels, tell me - when you walk into a room that feels just right, what's there? What do you notice first?",
                .describeStyle,
                MessageMetadata(suggestions: ["The materials", "The light", "The colors", "The feeling of space"])
            )
        }

        // Room/space responses
        if lowercased.contains("room") || lowercased.contains("space") || lowercased.contains("living") || lowercased.contains("bedroom") {
            return (
                "I'd love to understand your space better. Would you like to take a walk through it together? I can see through your camera and we'll explore it at a gentle pace.",
                .startWalk,
                MessageMetadata(suggestions: ["Let's walk through it", "I'll describe it instead", "Show me furniture first"])
            )
        }

        // Furniture/shopping responses
        if lowercased.contains("furniture") || lowercased.contains("looking for") || lowercased.contains("need") {
            return (
                "Before we look at pieces, I want to understand what draws you to certain things. Think of a piece of furniture you've loved - not necessarily owned, but loved. What was it about it?",
                .describeStyle,
                MessageMetadata(suggestions: ["Its craftsmanship", "How it felt to use", "How it looked", "Its history"])
            )
        }

        // Material preferences
        if lowercased.contains("wood") || lowercased.contains("leather") || lowercased.contains("fabric") || lowercased.contains("material") {
            let mentionedMaterials = extractMentionedMaterials(from: lowercased)
            let response = "Natural materials like \(mentionedMaterials.joined(separator: " and ")) age so beautifully. They develop what I think of as genuine patina - the marks of a life well lived. Do you prefer pieces that look pristine, or ones that show their story?"

            return (
                response,
                .describeStyle,
                MessageMetadata(suggestions: ["Pristine and new", "Character and history", "A bit of both"])
            )
        }

        // Light/atmosphere
        if lowercased.contains("light") || lowercased.contains("bright") || lowercased.contains("cozy") || lowercased.contains("warm") {
            return (
                "The way light moves through a space changes everything. Some rooms come alive in morning light, others at dusk. When does your space feel most like itself?",
                .describeStyle,
                MessageMetadata(suggestions: ["Morning", "Afternoon", "Evening", "It varies"])
            )
        }

        // Default conversational response
        return (
            "That's interesting. Tell me more about what you're imagining for your space.",
            .freeConversation,
            nil
        )
    }

    private func extractMentionedMaterials(from text: String) -> [String] {
        var materials: [String] = []
        let materialKeywords = ["wood", "leather", "fabric", "metal", "glass", "marble", "concrete", "velvet", "linen", "rattan"]

        for keyword in materialKeywords {
            if text.contains(keyword) {
                materials.append(keyword)
            }
        }

        return materials.isEmpty ? ["those materials"] : materials
    }

    private func updateConversationState(based intent: ConversationIntent?) {
        guard let intent = intent else { return }

        switch intent {
        case .startWalk:
            conversationState = .discussingRoom(roomId: nil)
            phase = .roomExploration
        case .describeStyle:
            conversationState = .exploringStyle
            if phase == .introduction {
                phase = .styleDiscovery
            }
        case .showRecommendations:
            phase = .recommendations
        default:
            break
        }

        context.phase = phase
    }

    private func extractStyleFromMessage(_ content: String) -> StyleProfile? {
        // Simple keyword extraction for style hints
        // In production, this would use NLP
        var profile = StyleProfile()
        let lowercased = content.lowercased()

        // Warmth detection
        if lowercased.contains("warm") || lowercased.contains("cozy") || lowercased.contains("inviting") {
            profile.warmth = .warm
        } else if lowercased.contains("cool") || lowercased.contains("crisp") || lowercased.contains("minimal") {
            profile.warmth = .cool
        }

        // Material extraction
        if lowercased.contains("wood") { profile.materials.append(.wood) }
        if lowercased.contains("leather") { profile.materials.append(.leather) }
        if lowercased.contains("fabric") { profile.materials.append(.fabric) }
        if lowercased.contains("metal") { profile.materials.append(.metal) }

        // Era detection
        if lowercased.contains("mid-century") || lowercased.contains("midcentury") {
            profile.eraPreferences.append(.midCentury)
        }
        if lowercased.contains("modern") || lowercased.contains("contemporary") {
            profile.eraPreferences.append(.contemporary)
        }
        if lowercased.contains("vintage") || lowercased.contains("antique") {
            profile.eraPreferences.append(.vintage)
        }

        profile.confidence = 0.3 // Initial extraction has low confidence
        return profile.materials.isEmpty && profile.eraPreferences.isEmpty ? nil : profile
    }

    private func updateStyleProfile(with extracted: StyleProfile) {
        if let existing = styleProfile {
            styleProfile = existing.merged(with: extracted)
        } else {
            styleProfile = extracted
        }
        context.styleProfile = styleProfile
    }
}

// MARK: - Companion Service Protocol

public protocol CompanionServiceProtocol {
    func sendMessage(_ content: String, context: ConversationContext) async throws -> Message
    func extractStyleProfile(from messages: [Message]) async throws -> StyleProfile?
}
