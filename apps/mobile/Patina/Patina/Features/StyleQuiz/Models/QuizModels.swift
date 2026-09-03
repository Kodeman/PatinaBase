//
//  QuizModels.swift
//  Patina
//
//  Data models for the 5-question style quiz
//

import SwiftUI

// MARK: - Quiz Question

struct QuizQuestion: Identifiable {
    let id: Int
    let title: String
    let type: QuizType

    var number: Int { id + 1 }
}

// MARK: - Quiz Type

enum QuizType {
    case imageGrid([QuizOption])
    case iconList([QuizOption])
    case materialCards([QuizOption])
    case budgetTiers([QuizOption])

    var isSingleSelect: Bool {
        switch self {
        case .imageGrid, .materialCards, .budgetTiers: return true
        case .iconList: return false
        }
    }

    var options: [QuizOption] {
        switch self {
        case .imageGrid(let opts), .iconList(let opts),
             .materialCards(let opts), .budgetTiers(let opts):
            return opts
        }
    }
}

// MARK: - Quiz Option

struct QuizOption: Identifiable {
    let id = UUID()
    let label: String
    var subtitle: String? = nil
    var gradient: LinearGradient? = nil
    var icon: String? = nil
    /// R17: future photography slot — when real room/material photography
    /// ships, options can render an image instead of the flat gradient
    /// swatch. Unused for now; nil everywhere.
    var imageAsset: String? = nil
    /// Machine-readable key for API submission
    var key: String
}

// MARK: - Quiz Content (all 5 questions)

enum QuizContent {
    static let allQuestions: [QuizQuestion] = [
        QuizQuestion(
            id: 0,
            // R17: the options render as flat color swatches, not room
            // photos — ask about palettes, not rooms.
            title: "Which palette feels like home?",
            type: .imageGrid([
                QuizOption(label: "Warm Minimal", gradient: PatinaGradients.warm, key: "warm_minimal"),
                QuizOption(label: "Cool Modern", gradient: PatinaGradients.metal, key: "cool_modern"),
                QuizOption(label: "Classic Comfort", gradient: PatinaGradients.linen, key: "classic_comfort"),
                QuizOption(label: "Eclectic Curated", gradient: PatinaGradients.rattan, key: "eclectic_curated"),
            ])
        ),
        QuizQuestion(
            id: 1,
            title: "How do you actually live in your space?",
            type: .iconList([
                QuizOption(label: "Love having people over", subtitle: "Entertaining & gathering", icon: "wineglass", key: "entertaining"),
                QuizOption(label: "My quiet sanctuary", subtitle: "Rest & recharge", icon: "moon.stars", key: "sanctuary"),
                QuizOption(label: "Work from this room", subtitle: "Productivity & focus", icon: "laptopcomputer", key: "work_from_home"),
                QuizOption(label: "Family central", subtitle: "Activity & play", icon: "figure.2.and.child.holdinghands", key: "family"),
                QuizOption(label: "Personal retreat", subtitle: "Reading & reflection", icon: "books.vertical", key: "retreat"),
            ])
        ),
        QuizQuestion(
            id: 2,
            // R17: swatches show material colorways, not tactile texture —
            // ask about materials, matching the option labels.
            title: "Which material draws you in?",
            type: .materialCards([
                QuizOption(label: "Weathered Oak", subtitle: "Warmth & history", gradient: PatinaGradients.wood, key: "weathered_oak"),
                QuizOption(label: "Soft Linen", subtitle: "Light & breathable", gradient: PatinaGradients.linen, key: "soft_linen"),
                QuizOption(label: "Aged Leather", subtitle: "Rich & evolving", gradient: PatinaGradients.leather, key: "aged_leather"),
                QuizOption(label: "Brushed Metal", subtitle: "Industrial & precise", gradient: PatinaGradients.metal, key: "brushed_metal"),
                QuizOption(label: "Woven Rattan", subtitle: "Natural & organic", gradient: PatinaGradients.rattan, key: "woven_rattan"),
            ])
        ),
        QuizQuestion(
            id: 3,
            title: "Let's talk about investment",
            type: .budgetTiers([
                QuizOption(label: "Thoughtful Starter", subtitle: "$500 – $2,000 per room", icon: "leaf", key: "starter"),
                QuizOption(label: "Curated Comfort", subtitle: "$2,000 – $5,000 per room", icon: "sparkle", key: "curated_comfort"),
                QuizOption(label: "Heirloom Investment", subtitle: "$5,000+ per room", icon: "diamond", key: "heirloom"),
                QuizOption(label: "Let's Discuss", subtitle: "I'd like designer guidance", icon: "bubble.left.and.bubble.right", key: "discuss"),
            ])
        ),
        QuizQuestion(
            id: 4,
            title: "What's driving your design journey?",
            type: .iconList([
                QuizOption(label: "Fresh start, new space", subtitle: "Moving in or starting over", icon: "house", key: "new_space"),
                QuizOption(label: "Finally making it mine", subtitle: "Ready to invest in this space", icon: "sparkles", key: "making_it_mine"),
                QuizOption(label: "Life change, design change", subtitle: "New chapter, new environment", icon: "arrow.triangle.2.circlepath", key: "life_change"),
                QuizOption(label: "Ready to invest in quality", subtitle: "Upgrading to pieces that last", icon: "diamond.inset.filled", key: "invest_quality"),
            ])
        ),
    ]
}

// MARK: - Quiz Submission (for API)

struct QuizSubmission: Codable {
    let answers: QuizAnswers
    let timings: [String: Double]
    let version: String

    struct QuizAnswers: Codable {
        let visualResonance: String
        let lifestyle: [String]
        let material: String
        let investment: String
        let catalyst: String
    }
}

// MARK: - Style Profile Result (from API)

public struct StyleProfileResult: Hashable {
    public let primaryStyle: String
    public let secondaryStyle: String?
    public let primaryMaterial: String
    public let paletteWarmth: String
    public let budgetLabel: String
    public let budgetMin: Int
    public let budgetMax: Int
    public let confidence: Double

    /// Display name for the primary style
    public var displayName: String {
        primaryStyle
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
    }

    /// Formatted confidence percentage
    public var confidencePercent: Int {
        Int(confidence * 100)
    }

    /// Build a `StyleProfileResult` from the JSON returned by the
    /// `process_style_quiz` RPC. Falls back to fields from `fallback` when
    /// a server field is missing or malformed.
    public static func from(
        serverResponse response: [String: Any]?,
        fallback: StyleProfileResult
    ) -> StyleProfileResult {
        guard let response else { return fallback }

        // The RPC currently returns either:
        //   - a single object with profile fields
        //   - an envelope `{ "profile": { ... } }` or `{ "result": { ... } }`
        // Handle both shapes.
        let profile: [String: Any] = (response["profile"] as? [String: Any])
            ?? (response["result"] as? [String: Any])
            ?? response

        let primaryStyle = profile["primary_style"] as? String ?? fallback.primaryStyle
        let secondaryStyle = profile["secondary_style"] as? String ?? fallback.secondaryStyle
        let primaryMaterial = profile["primary_material"] as? String ?? fallback.primaryMaterial
        let paletteWarmth = profile["palette_warmth"] as? String ?? fallback.paletteWarmth
        let budgetLabel = profile["budget_label"] as? String ?? fallback.budgetLabel
        let budgetMin = (profile["budget_min"] as? Int) ?? (profile["budget_min"] as? Double).map(Int.init) ?? fallback.budgetMin
        let budgetMax = (profile["budget_max"] as? Int) ?? (profile["budget_max"] as? Double).map(Int.init) ?? fallback.budgetMax
        let confidence = (profile["confidence"] as? Double)
            ?? (profile["confidence"] as? Int).map(Double.init)
            ?? fallback.confidence

        return StyleProfileResult(
            primaryStyle: primaryStyle,
            secondaryStyle: secondaryStyle,
            primaryMaterial: primaryMaterial,
            paletteWarmth: paletteWarmth,
            budgetLabel: budgetLabel,
            budgetMin: budgetMin,
            budgetMax: budgetMax,
            confidence: confidence
        )
    }
}
