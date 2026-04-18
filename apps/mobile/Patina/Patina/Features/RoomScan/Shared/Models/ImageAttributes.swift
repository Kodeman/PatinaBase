//
//  ImageAttributes.swift
//  Patina
//
//  Hidden scoring weights for the 4-dimensional style vector.
//  Per PRD §4.6.1 ImageAttributes table.
//

import Foundation

/// Four hidden dimensions that drive the Aesthete Engine's named-aesthetic mapping.
public struct ImageAttributes: Equatable {
    public let warmth: Float      // -1 (cool) ... 1 (warm)
    public let complexity: Float  // -1 (simple) ... 1 (layered)
    public let formality: Float   // -1 (casual) ... 1 (formal)
    public let era: Float         // -1 (modern) ... 1 (traditional)

    public init(warmth: Float, complexity: Float, formality: Float, era: Float) {
        self.warmth = warmth
        self.complexity = complexity
        self.formality = formality
        self.era = era
    }

    public static let zero = ImageAttributes(warmth: 0, complexity: 0, formality: 0, era: 0)

    public static func + (lhs: ImageAttributes, rhs: ImageAttributes) -> ImageAttributes {
        ImageAttributes(
            warmth: lhs.warmth + rhs.warmth,
            complexity: lhs.complexity + rhs.complexity,
            formality: lhs.formality + rhs.formality,
            era: lhs.era + rhs.era
        )
    }

    public static func * (lhs: ImageAttributes, rhs: Float) -> ImageAttributes {
        ImageAttributes(
            warmth: lhs.warmth * rhs,
            complexity: lhs.complexity * rhs,
            formality: lhs.formality * rhs,
            era: lhs.era * rhs
        )
    }

    /// Clamp every channel to the valid [-1, 1] range.
    public var clamped: ImageAttributes {
        ImageAttributes(
            warmth: min(1, max(-1, warmth)),
            complexity: min(1, max(-1, complexity)),
            formality: min(1, max(-1, formality)),
            era: min(1, max(-1, era))
        )
    }
}

// MARK: - Visual Resonance weights (Q1 images)

public extension VisualResonance {
    /// Base attribute contribution from the Q1 image choice. PRD §4.6.1.
    var attributes: ImageAttributes {
        switch self {
        case .warmMinimal:
            return ImageAttributes(warmth: 0.7, complexity: -0.5, formality: -0.3, era: -0.2)
        case .coolModern:
            return ImageAttributes(warmth: -0.6, complexity: -0.7, formality: 0.3, era: -0.8)
        case .layeredComfort:
            return ImageAttributes(warmth: 0.8, complexity: 0.6, formality: 0.5, era: 0.7)
        case .curatedMix:
            return ImageAttributes(warmth: 0.2, complexity: 0.8, formality: -0.2, era: 0.3)
        }
    }
}

// MARK: - Material weights (Q3)

public extension MaterialPreference {
    /// Per-material attribute contribution. Weaker than Q1 so Q1 remains dominant.
    var attributes: ImageAttributes {
        switch self {
        case .weatheredOak:
            return ImageAttributes(warmth: 0.5, complexity: 0.2, formality: 0.1, era: 0.4)
        case .smoothMarble:
            return ImageAttributes(warmth: -0.2, complexity: -0.1, formality: 0.7, era: 0.2)
        case .agedLeather:
            return ImageAttributes(warmth: 0.6, complexity: 0.3, formality: 0.3, era: 0.5)
        case .softLinen:
            return ImageAttributes(warmth: 0.3, complexity: -0.1, formality: -0.2, era: 0)
        case .wovenRattan:
            return ImageAttributes(warmth: 0.4, complexity: 0.2, formality: -0.4, era: 0.1)
        case .brushedMetal:
            return ImageAttributes(warmth: -0.5, complexity: -0.3, formality: 0.4, era: -0.7)
        }
    }
}

// MARK: - Lifestyle weights (Q2)

public extension LifestyleFactor {
    /// Per-lifestyle attribute contribution.
    var attributes: ImageAttributes {
        switch self {
        case .entertaining:
            return ImageAttributes(warmth: 0.2, complexity: 0.2, formality: 0.3, era: 0)
        case .sanctuary:
            return ImageAttributes(warmth: 0.1, complexity: -0.4, formality: -0.1, era: 0)
        case .workFromHome:
            return ImageAttributes(warmth: -0.1, complexity: -0.2, formality: 0.2, era: -0.2)
        case .familyCentral:
            return ImageAttributes(warmth: 0.3, complexity: 0.1, formality: -0.3, era: 0.1)
        case .personalRetreat:
            return ImageAttributes(warmth: 0.3, complexity: 0.2, formality: 0, era: 0.2)
        case .entertainmentHub:
            return ImageAttributes(warmth: -0.1, complexity: 0.3, formality: 0, era: -0.3)
        }
    }
}

// MARK: - Investment weights (Q4)

public extension InvestmentTier {
    /// Per-tier attribute contribution. Higher tiers nudge toward formality + heirloom era.
    var attributes: ImageAttributes {
        switch self {
        case .budgetStarter:
            return ImageAttributes(warmth: 0, complexity: -0.1, formality: -0.2, era: -0.1)
        case .budgetMid:
            return ImageAttributes(warmth: 0.1, complexity: 0.1, formality: 0.1, era: 0.1)
        case .budgetPremium:
            return ImageAttributes(warmth: 0.1, complexity: 0.3, formality: 0.4, era: 0.3)
        case .budgetDesigner:
            return ImageAttributes(warmth: 0, complexity: 0.2, formality: 0.3, era: 0.2)
        }
    }
}

// MARK: - Priority weights (Q5)

public extension PriorityChoice {
    var attributes: ImageAttributes {
        switch self {
        case .gathering:
            return ImageAttributes(warmth: 0.3, complexity: 0.2, formality: 0, era: 0)
        case .anchor:
            return ImageAttributes(warmth: 0.1, complexity: 0.3, formality: 0.2, era: 0.2)
        case .light:
            return ImageAttributes(warmth: 0.3, complexity: -0.1, formality: 0, era: 0)
        case .breathingRoom:
            return ImageAttributes(warmth: -0.1, complexity: -0.5, formality: 0.1, era: -0.2)
        case .rest:
            return ImageAttributes(warmth: 0.3, complexity: -0.3, formality: 0, era: 0.1)
        case .rhythm:
            return ImageAttributes(warmth: 0.1, complexity: 0.2, formality: 0, era: 0)
        }
    }
}
