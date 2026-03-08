//
//  CompanionAPIModels.swift
//  Patina
//
//  API request/response models for Companion Edge Functions
//

import Foundation

// MARK: - Quick Action Types

/// Quick action returned by the API
public struct APIQuickAction: Codable, Identifiable, Equatable {
    public let id: String
    public let icon: String
    public let label: String
    public let actionType: ActionType
    public let payload: [String: String]?
    public let priority: Int

    public enum ActionType: String, Codable {
        case navigate
        case trigger
        case prompt
        case deeplink
    }

    enum CodingKeys: String, CodingKey {
        case id
        case icon
        case label
        case actionType = "action_type"
        case payload
        case priority
    }
}

// MARK: - Context Endpoint

/// Request for /companion/context
public struct QuickActionsRequest: Codable {
    public let userId: String
    public let screen: String
    public let screenData: ScreenData?
    public let sessionMetrics: SessionMetrics?

    public init(
        userId: String,
        screen: String,
        screenData: ScreenData? = nil,
        sessionMetrics: SessionMetrics? = nil
    ) {
        self.userId = userId
        self.screen = screen
        self.screenData = screenData
        self.sessionMetrics = sessionMetrics
    }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case screen
        case screenData = "screen_data"
        case sessionMetrics = "session_metrics"
    }

    public struct ScreenData: Codable {
        public let productId: String?
        public let roomId: String?
        public let filters: [String: String]?

        public init(productId: String? = nil, roomId: String? = nil, filters: [String: String]? = nil) {
            self.productId = productId
            self.roomId = roomId
            self.filters = filters
        }

        enum CodingKeys: String, CodingKey {
            case productId = "product_id"
            case roomId = "room_id"
            case filters
        }
    }

    public struct SessionMetrics: Codable {
        public let sessionId: String
        public let dwellTime: Double
        public let interactions: Int
        public let scrollChanges: Int
        public let screensVisited: Int

        public init(
            sessionId: String,
            dwellTime: Double,
            interactions: Int,
            scrollChanges: Int,
            screensVisited: Int
        ) {
            self.sessionId = sessionId
            self.dwellTime = dwellTime
            self.interactions = interactions
            self.scrollChanges = scrollChanges
            self.screensVisited = screensVisited
        }

        enum CodingKeys: String, CodingKey {
            case sessionId = "session_id"
            case dwellTime = "dwell_time"
            case interactions
            case scrollChanges = "scroll_changes"
            case screensVisited = "screens_visited"
        }
    }
}

/// Response from /companion/context
public struct QuickActionsResponse: Codable {
    public let quickActions: [APIQuickAction]
    public let proactiveMessage: String?
    public let timestamp: String

    enum CodingKeys: String, CodingKey {
        case quickActions = "quick_actions"
        case proactiveMessage = "proactive_message"
        case timestamp
    }
}

// MARK: - Message Endpoint

/// Request for /companion/message
public struct CompanionMessageRequest: Codable {
    public let userId: String
    public let message: String
    public let context: MessageContext
    public let conversationId: String?

    public init(
        userId: String,
        message: String,
        context: MessageContext,
        conversationId: String? = nil
    ) {
        self.userId = userId
        self.message = message
        self.context = context
        self.conversationId = conversationId
    }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case message
        case context
        case conversationId = "conversation_id"
    }

    public struct MessageContext: Codable {
        public let screen: String
        public let productId: String?
        public let roomId: String?

        public init(screen: String, productId: String? = nil, roomId: String? = nil) {
            self.screen = screen
            self.productId = productId
            self.roomId = roomId
        }

        enum CodingKeys: String, CodingKey {
            case screen
            case productId = "product_id"
            case roomId = "room_id"
        }
    }
}

/// Response from /companion/message
public struct CompanionMessageResponse: Codable {
    public let messageId: String
    public let response: String
    public let quickActions: [APIQuickAction]?
    public let suggestedProducts: [ProductSuggestion]?
    public let metadata: ResponseMetadata

    enum CodingKeys: String, CodingKey {
        case messageId = "message_id"
        case response
        case quickActions = "quick_actions"
        case suggestedProducts = "suggested_products"
        case metadata
    }

    public struct ProductSuggestion: Codable, Identifiable {
        public let productId: String
        public let name: String
        public let price: Double
        public let imageUrl: String
        public let matchScore: Double
        public let reason: String

        public var id: String { productId }

        enum CodingKeys: String, CodingKey {
            case productId = "product_id"
            case name
            case price
            case imageUrl = "image_url"
            case matchScore = "match_score"
            case reason
        }
    }

    public struct ResponseMetadata: Codable {
        public let confidence: Double
        public let sources: [String]
        public let processingTime: Double

        enum CodingKeys: String, CodingKey {
            case confidence
            case sources
            case processingTime = "processing_time"
        }
    }
}

// MARK: - History Endpoint

/// Response from /companion/history
public struct ConversationHistoryResponse: Codable {
    public let messages: [HistoryMessage]
    public let hasMore: Bool
    public let cursor: String?

    enum CodingKeys: String, CodingKey {
        case messages
        case hasMore = "has_more"
        case cursor
    }

    public struct HistoryMessage: Codable, Identifiable {
        public let id: String
        public let role: MessageRole
        public let content: String
        public let timestamp: String
        public let attachments: [Attachment]?
        public let quickReplies: [APIQuickAction]?

        enum CodingKeys: String, CodingKey {
            case id
            case role
            case content
            case timestamp
            case attachments
            case quickReplies = "quick_replies"
        }

        public enum MessageRole: String, Codable {
            case user
            case companion
        }

        public struct Attachment: Codable {
            public let type: String
            public let url: String?
            public let data: String?
        }
    }
}

// MARK: - API Error

/// Errors from Companion API
public enum CompanionAPIError: LocalizedError {
    case unauthorized
    case badRequest(message: String)
    case serverError(statusCode: Int)
    case networkError(underlying: Error)
    case decodingError(underlying: Error)
    case noToken
    case rateLimited(retryAfter: TimeInterval?)

    public var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Please sign in to continue"
        case .badRequest(let message):
            return message
        case .serverError(let code):
            return "Something went wrong (error \(code)). Please try again."
        case .networkError:
            return "Check your connection and try again"
        case .decodingError:
            return "Something went wrong. Please try again."
        case .noToken:
            return "Please sign in to use the Companion"
        case .rateLimited(let retryAfter):
            if let seconds = retryAfter {
                return "Please wait \(Int(seconds)) seconds before trying again"
            }
            return "Too many requests. Please try again later."
        }
    }

    public var isRetryable: Bool {
        switch self {
        case .serverError(let code):
            return code >= 500
        case .networkError, .rateLimited:
            return true
        default:
            return false
        }
    }
}
