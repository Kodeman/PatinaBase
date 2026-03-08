//
//  ConversationState.swift
//  Patina
//
//  State management for conversation flow
//

import Foundation

/// Current state of the conversation
public enum ConversationState: Equatable {
    /// Initial greeting phase
    case greeting

    /// Exploring user's style preferences
    case exploringStyle

    /// Discussing specific rooms
    case discussingRoom(roomId: UUID?)

    /// Showing a recommendation
    case showingRecommendation(pieceId: UUID)

    /// User is browsing their table
    case browsingTable

    /// Free conversation
    case freeConversation

    /// Waiting for user input after a question
    case awaitingResponse(question: String)
}

// MARK: - Conversation Phase

/// High-level conversation phases for tracking progress
public enum ConversationPhase: Int, Codable, CaseIterable {
    case introduction = 0
    case styleDiscovery = 1
    case roomExploration = 2
    case recommendations = 3
    case ongoing = 4

    public var description: String {
        switch self {
        case .introduction: return "Getting to know you"
        case .styleDiscovery: return "Understanding your style"
        case .roomExploration: return "Exploring your space"
        case .recommendations: return "Finding perfect pieces"
        case .ongoing: return "Ongoing conversation"
        }
    }

    public var progressPercentage: Double {
        switch self {
        case .introduction: return 0.1
        case .styleDiscovery: return 0.3
        case .roomExploration: return 0.5
        case .recommendations: return 0.8
        case .ongoing: return 1.0
        }
    }
}

// MARK: - Conversation Context

/// Context passed to the AI for informed responses
public struct ConversationContext: Codable {
    /// Current conversation phase
    public var phase: ConversationPhase

    /// Extracted style profile (if available)
    public var styleProfile: StyleProfile?

    /// Known room information
    public var rooms: [RoomContext]

    /// Items on user's table
    public var tableItemIds: [UUID]

    /// Recent interaction history summary
    public var recentSummary: String?

    /// User preferences
    public var preferences: UserPreferences?

    public init(
        phase: ConversationPhase = .introduction,
        styleProfile: StyleProfile? = nil,
        rooms: [RoomContext] = [],
        tableItemIds: [UUID] = [],
        recentSummary: String? = nil,
        preferences: UserPreferences? = nil
    ) {
        self.phase = phase
        self.styleProfile = styleProfile
        self.rooms = rooms
        self.tableItemIds = tableItemIds
        self.recentSummary = recentSummary
        self.preferences = preferences
    }
}

// MARK: - Room Context

/// Simplified room information for conversation context
public struct RoomContext: Codable, Identifiable {
    public let id: UUID
    public var name: String
    public var roomType: RoomType
    public var hasBeenScanned: Bool
    public var dimensions: RoomDimensions?

    public init(
        id: UUID = UUID(),
        name: String,
        roomType: RoomType,
        hasBeenScanned: Bool = false,
        dimensions: RoomDimensions? = nil
    ) {
        self.id = id
        self.name = name
        self.roomType = roomType
        self.hasBeenScanned = hasBeenScanned
        self.dimensions = dimensions
    }
}

// MARK: - Room Type

public enum RoomType: String, Codable, CaseIterable {
    case livingRoom = "living_room"
    case bedroom = "bedroom"
    case diningRoom = "dining_room"
    case office = "office"
    case kitchen = "kitchen"
    case bathroom = "bathroom"
    case entryway = "entryway"
    case other = "other"

    public var displayName: String {
        switch self {
        case .livingRoom: return "Living Room"
        case .bedroom: return "Bedroom"
        case .diningRoom: return "Dining Room"
        case .office: return "Office"
        case .kitchen: return "Kitchen"
        case .bathroom: return "Bathroom"
        case .entryway: return "Entryway"
        case .other: return "Other"
        }
    }
}

// MARK: - Room Dimensions

public struct RoomDimensions: Codable, Equatable {
    public var width: Double // in meters
    public var length: Double
    public var height: Double

    public var area: Double {
        width * length
    }

    public var volume: Double {
        width * length * height
    }

    public init(width: Double, length: Double, height: Double) {
        self.width = width
        self.length = length
        self.height = height
    }
}

// MARK: - User Preferences

public struct UserPreferences: Codable {
    public var budgetRange: BudgetRange?
    public var preferredMaterials: [MaterialType]
    public var avoidMaterials: [MaterialType]
    public var colorPreferences: [String]
    public var sustainabilityImportance: ImportanceLevel

    public init(
        budgetRange: BudgetRange? = nil,
        preferredMaterials: [MaterialType] = [],
        avoidMaterials: [MaterialType] = [],
        colorPreferences: [String] = [],
        sustainabilityImportance: ImportanceLevel = .moderate
    ) {
        self.budgetRange = budgetRange
        self.preferredMaterials = preferredMaterials
        self.avoidMaterials = avoidMaterials
        self.colorPreferences = colorPreferences
        self.sustainabilityImportance = sustainabilityImportance
    }
}

// MARK: - Budget Range

public enum BudgetRange: String, Codable, CaseIterable {
    case budget = "budget"
    case moderate = "moderate"
    case premium = "premium"
    case luxury = "luxury"

    public var displayName: String {
        switch self {
        case .budget: return "Budget-friendly"
        case .moderate: return "Moderate"
        case .premium: return "Premium"
        case .luxury: return "Luxury"
        }
    }
}

// MARK: - Importance Level

public enum ImportanceLevel: String, Codable {
    case notImportant = "not_important"
    case slightly = "slightly"
    case moderate = "moderate"
    case very = "very"
    case essential = "essential"
}

// MARK: - Material Type

public enum MaterialType: String, Codable, CaseIterable {
    case wood = "wood"
    case metal = "metal"
    case leather = "leather"
    case fabric = "fabric"
    case glass = "glass"
    case marble = "marble"
    case concrete = "concrete"
    case rattan = "rattan"
    case velvet = "velvet"
    case linen = "linen"

    public var displayName: String {
        rawValue.capitalized
    }
}
