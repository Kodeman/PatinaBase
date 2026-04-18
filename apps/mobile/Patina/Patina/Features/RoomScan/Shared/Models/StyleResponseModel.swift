//
//  StyleResponseModel.swift
//  Patina
//
//  Accumulated answers to the 5-question Style Conversation.
//  Per PRD §4.7 (StyleResponseModel / StyleScoreRequest).
//

import Foundation

/// Visual Resonance (Q1) — single selection.
public enum VisualResonance: String, Codable, CaseIterable {
    case warmMinimal = "warm_minimal"
    case coolModern = "cool_modern"
    case layeredComfort = "layered_comfort"
    case curatedMix = "curated_mix"

    public var displayName: String {
        switch self {
        case .warmMinimal:   return "Warm Minimal"
        case .coolModern:    return "Cool Modern"
        case .layeredComfort: return "Layered Comfort"
        case .curatedMix:    return "Curated Mix"
        }
    }
}

/// Lifestyle factors (Q2) — multi-select.
public enum LifestyleFactor: String, Codable, CaseIterable, Identifiable {
    case entertaining = "entertaining"
    case sanctuary = "sanctuary"
    case workFromHome = "work_from_home"
    case familyCentral = "family_central"
    case personalRetreat = "personal_retreat"
    case entertainmentHub = "entertainment_hub"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .entertaining:     return "Love having people over"
        case .sanctuary:        return "My quiet sanctuary"
        case .workFromHome:     return "Work from this room"
        case .familyCentral:    return "Family central"
        case .personalRetreat:  return "Personal retreat"
        case .entertainmentHub: return "Entertainment hub"
        }
    }

    public var emoji: String {
        switch self {
        case .entertaining:     return "🍷"
        case .sanctuary:        return "🧘"
        case .workFromHome:     return "💻"
        case .familyCentral:    return "👨‍👩‍👧"
        case .personalRetreat:  return "📚"
        case .entertainmentHub: return "🎬"
        }
    }
}

/// Material preferences (Q3) — max 3.
public enum MaterialPreference: String, Codable, CaseIterable, Identifiable {
    case weatheredOak = "weathered_oak"
    case smoothMarble = "smooth_marble"
    case agedLeather = "aged_leather"
    case softLinen = "soft_linen"
    case wovenRattan = "woven_rattan"
    case brushedMetal = "brushed_metal"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .weatheredOak: return "Weathered Oak"
        case .smoothMarble: return "Smooth Marble"
        case .agedLeather:  return "Aged Leather"
        case .softLinen:    return "Soft Linen"
        case .wovenRattan:  return "Woven Rattan"
        case .brushedMetal: return "Brushed Metal"
        }
    }
}

/// Investment tier (Q4) — single select.
public enum InvestmentTier: String, Codable, CaseIterable, Identifiable {
    case budgetStarter = "budget_starter"
    case budgetMid = "budget_mid"
    case budgetPremium = "budget_premium"
    case budgetDesigner = "budget_designer"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .budgetStarter: return "Thoughtful Starter"
        case .budgetMid:     return "Curated Comfort"
        case .budgetPremium: return "Heirloom Investment"
        case .budgetDesigner: return "Let's Discuss"
        }
    }

    public var descriptionText: String {
        switch self {
        case .budgetStarter:  return "Smart finds that punch above their price"
        case .budgetMid:      return "Quality pieces that last"
        case .budgetPremium:  return "Pieces you'll pass down"
        case .budgetDesigner: return "Connect with a designer"
        }
    }

    public var rangeLabel: String {
        switch self {
        case .budgetStarter:  return "$500 – $2,000"
        case .budgetMid:      return "$2,000 – $5,000"
        case .budgetPremium:  return "$5,000+"
        case .budgetDesigner: return "Designer Led"
        }
    }
}

/// Priority (Q5) — single select. Room-type contextual options.
public enum PriorityChoice: String, Codable, CaseIterable, Identifiable {
    case gathering
    case anchor
    case light
    case breathingRoom = "breathing_room"
    case rest
    case rhythm

    public var id: String { rawValue }
}

/// Full accumulated response from the 5-question conversation.
public struct StyleResponseModel: Codable, Equatable {
    public var visualResonance: VisualResonance?
    public var lifestyleFactors: [LifestyleFactor]
    public var materialPreferences: [MaterialPreference]
    public var investmentTier: InvestmentTier?
    public var priority: PriorityChoice?

    /// Derived flag — true when the user chose "Let's Discuss" in Q4.
    public var flagForDesignerLead: Bool {
        investmentTier == .budgetDesigner
    }

    public init(
        visualResonance: VisualResonance? = nil,
        lifestyleFactors: [LifestyleFactor] = [],
        materialPreferences: [MaterialPreference] = [],
        investmentTier: InvestmentTier? = nil,
        priority: PriorityChoice? = nil
    ) {
        self.visualResonance = visualResonance
        self.lifestyleFactors = lifestyleFactors
        self.materialPreferences = materialPreferences
        self.investmentTier = investmentTier
        self.priority = priority
    }

    /// True when all 5 questions have a valid answer.
    public var isComplete: Bool {
        visualResonance != nil &&
        !lifestyleFactors.isEmpty &&
        !materialPreferences.isEmpty &&
        investmentTier != nil &&
        priority != nil
    }
}

/// Request envelope for POST /api/aesthete/score. PRD §4.7.
public struct StyleScoreRequest: Codable, Equatable {
    public let userId: String
    public let roomId: String
    public let responses: StyleResponseModel
    public let roomType: String?

    public init(userId: String, roomId: String, responses: StyleResponseModel, roomType: String? = nil) {
        self.userId = userId
        self.roomId = roomId
        self.responses = responses
        self.roomType = roomType
    }
}

/// Response shape from the Aesthete Engine. PRD §4.7.
public struct StyleProfileResponse: Codable, Equatable {
    public let profileId: String
    public let aestheticName: String
    public let spectrumValues: [Float]   // 5 values, each 0...1
    public let tags: [String]
    public let confidence: Float
    public let matchingProducts: Int

    public init(
        profileId: String,
        aestheticName: String,
        spectrumValues: [Float],
        tags: [String],
        confidence: Float,
        matchingProducts: Int
    ) {
        self.profileId = profileId
        self.aestheticName = aestheticName
        self.spectrumValues = spectrumValues
        self.tags = tags
        self.confidence = confidence
        self.matchingProducts = matchingProducts
    }
}
