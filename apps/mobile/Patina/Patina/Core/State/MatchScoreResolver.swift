//
//  MatchScoreResolver.swift
//  Patina
//
//  One piece, one match, for as long as the session lasts.
//
//  C-11: the Heirloom Oak Dining Table read 73% on the Pieces tab, 57% on the
//  room-scoped grid, and 50% on its own detail — one tap apart, in one
//  session. Three numbers from three sources, only two of which were scores:
//  `get_recommendations` unscoped, the same RPC with `p_room_id`, and the
//  by-id table read, which had no match score at all and printed
//  `quality_score ?? 50` in its place. A number that changes when you touch
//  it reads as the app making it up.
//
//  This is the memory that stops that: the first score a piece is seen with
//  is the score it keeps, on every surface, until the account changes.
//

import Foundation
import Observation

@MainActor
@Observable
final class MatchScoreResolver {

    static let shared = MatchScoreResolver()

    private var scores: [String: Int] = [:]

    init() {}

    /// Record the score this surface computed, and return the one the session
    /// is already using.
    ///
    /// A candidate of `nil` or `0` records nothing — the by-id read has no
    /// score of its own, and a zero is the decoder's "absent", not a match.
    @discardableResult
    func resolve(productId: String, candidate: Int?) -> Int? {
        if let existing = scores[productId] { return existing }
        guard let candidate, candidate > 0 else { return nil }
        scores[productId] = candidate
        return candidate
    }

    /// What the session already knows, recording nothing.
    func score(for productId: String) -> Int? {
        scores[productId]
    }

    func resetForSessionChange() {
        scores.removeAll()
    }
}

// MARK: - Applying it to a decoded piece

extension Product {

    /// The same piece with the session's one score on it.
    func withMatchScore(_ score: Int) -> Product {
        Product(
            id: id, name: name, priceCents: priceCents, matchScore: score,
            makerName: makerName, makerLocation: makerLocation, makerStory: makerStory,
            imageURL: imageURL, usdzURL: usdzURL,
            styleTags: styleTags, materialTags: materialTags, badges: badges,
            category: category, tier: tier,
            dimensions: dimensions, leadTimeWeeks: leadTimeWeeks,
            brand: brand, productDescription: productDescription,
            publishedAt: publishedAt, finish: finish,
            patinaManaged: patinaManaged, photoVerifiedAt: photoVerifiedAt,
            sourceURL: sourceURL, shippingFlatCents: shippingFlatCents,
            deletedAt: deletedAt
        )
    }
}

extension MatchScoreResolver {

    /// Record what a scored feed computed, and hand back the pieces carrying
    /// the session's answer — which for a piece already seen is the number it
    /// was already showing.
    func reconciling(_ products: [Product]) -> [Product] {
        products.map { product in
            let resolved = resolve(productId: product.id, candidate: product.matchScore)
            return product.withMatchScore(resolved ?? 0)
        }
    }

    /// The unscored path: a piece read straight from the table. It takes the
    /// session's score if there is one and stays unscored if there is not —
    /// it never invents one from `quality_score`.
    func applyingKnownScores(_ products: [Product]) -> [Product] {
        products.map { $0.withMatchScore(score(for: $0.id) ?? 0) }
    }
}
