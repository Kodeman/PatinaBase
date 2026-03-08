//
//  Message.swift
//  Patina
//
//  Message data model for conversations with Patina
//

import Foundation

/// A message in the conversation between user and Patina
public struct Message: Identifiable, Equatable, Codable {
    public let id: UUID
    public let content: String
    public let sender: MessageSender
    public let timestamp: Date
    public var extractedIntent: ConversationIntent?
    public var metadata: MessageMetadata?

    public init(
        id: UUID = UUID(),
        content: String,
        sender: MessageSender,
        timestamp: Date = Date(),
        extractedIntent: ConversationIntent? = nil,
        metadata: MessageMetadata? = nil
    ) {
        self.id = id
        self.content = content
        self.sender = sender
        self.timestamp = timestamp
        self.extractedIntent = extractedIntent
        self.metadata = metadata
    }
}

// MARK: - Message Sender

public enum MessageSender: String, Codable, Equatable {
    case user
    case patina
    case system

    public var displayName: String {
        switch self {
        case .user: return "You"
        case .patina: return "Patina"
        case .system: return "System"
        }
    }
}

// MARK: - Conversation Intent

/// Extracted intent from user messages for navigation and actions
public enum ConversationIntent: String, Codable, Equatable {
    // Navigation intents
    case showRooms = "show_rooms"
    case showTable = "show_table"
    case startWalk = "start_walk"
    case showRecommendations = "show_recommendations"

    // Action intents
    case saveToTable = "save_to_table"
    case shareItem = "share_item"
    case learnMore = "learn_more"

    // Conversation intents
    case describeStyle = "describe_style"
    case askQuestion = "ask_question"
    case provideFeedback = "provide_feedback"
    case freeConversation = "free_conversation"

    // Unknown
    case unknown = "unknown"
}

// MARK: - Message Metadata

/// Additional metadata for rich message content
public struct MessageMetadata: Codable, Equatable {
    /// Attached furniture piece reference
    public var pieceId: UUID?

    /// Attached room reference
    public var roomId: UUID?

    /// Image URL if message contains image
    public var imageURL: URL?

    /// Quick reply suggestions
    public var suggestions: [String]?

    /// Whether this message requires user action
    public var requiresAction: Bool?

    public init(
        pieceId: UUID? = nil,
        roomId: UUID? = nil,
        imageURL: URL? = nil,
        suggestions: [String]? = nil,
        requiresAction: Bool? = nil
    ) {
        self.pieceId = pieceId
        self.roomId = roomId
        self.imageURL = imageURL
        self.suggestions = suggestions
        self.requiresAction = requiresAction
    }
}

// MARK: - Message Extensions

extension Message {
    /// Check if this is a user message
    public var isFromUser: Bool {
        sender == .user
    }

    /// Check if this is from Patina
    public var isFromPatina: Bool {
        sender == .patina
    }

    /// Check if message has suggestions
    public var hasSuggestions: Bool {
        metadata?.suggestions?.isEmpty == false
    }

    /// Get formatted timestamp
    public var formattedTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: timestamp)
    }
}
