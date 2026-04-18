//
//  DailyRecommendation.swift
//  Patina
//
//  Recommendation feed item shown on The Daily Room.
//

import SwiftUI

struct DailyRecommendation: Identifiable, Hashable {
    let id: String
    let product: Product
    let matchScore: Int
    let tier: Tier
    let whyCopy: String
    let insight: Insight?
    let pairing: Pairing?

    init(
        id: String = UUID().uuidString,
        product: Product,
        matchScore: Int,
        tier: Tier,
        whyCopy: String,
        insight: Insight? = nil,
        pairing: Pairing? = nil
    ) {
        self.id = id
        self.product = product
        self.matchScore = matchScore
        self.tier = tier
        self.whyCopy = whyCopy
        self.insight = insight
        self.pairing = pairing
    }

    static func == (lhs: DailyRecommendation, rhs: DailyRecommendation) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    enum Tier: String, Hashable {
        case designerSelection
        case editorPick
        case standard

        var label: String {
            switch self {
            case .designerSelection: return "Designer Selection"
            case .editorPick: return "Editor's Pick"
            case .standard: return ""
            }
        }
    }

    struct Insight: Hashable {
        let icon: String
        let text: String
    }

    struct Pairing: Hashable {
        let thumbGradient: LinearGradient
        let text: String

        static func == (lhs: Pairing, rhs: Pairing) -> Bool { lhs.text == rhs.text }
        func hash(into hasher: inout Hasher) { hasher.combine(text) }
    }
}

extension DailyRecommendation {
    static let mockAll: [DailyRecommendation] = [
        DailyRecommendation(
            product: Product.mockProducts[0],
            matchScore: 92,
            tier: .designerSelection,
            whyCopy: "Hand-rubbed walnut catches your west-facing afternoon light beautifully.",
            insight: Insight(
                icon: "ruler",
                text: "Fits the open zone by your bay window — 32\" clearance for the swing-out reading angle."
            ),
            pairing: Pairing(
                thumbGradient: PatinaGradients.cherry,
                text: "Pairs with your saved Cherry Coffee Table from Thos. Moser."
            )
        ),
        DailyRecommendation(
            product: Product.mockProducts[1],
            matchScore: 88,
            tier: .editorPick,
            whyCopy: "Soft linen weave echoes the warm minimalism of your style profile.",
            insight: Insight(
                icon: "sun.max",
                text: "Anchors the south wall without crowding your sight line to the window."
            ),
            pairing: nil
        ),
        DailyRecommendation(
            product: Product.mockProducts[5],
            matchScore: 84,
            tier: .standard,
            whyCopy: "Brass warms with age — the patina you'll watch develop year by year.",
            insight: nil,
            pairing: nil
        )
    ]
}
