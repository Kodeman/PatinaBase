//
//  DailyStory.swift
//  Patina
//
//  Editorial story shown atop The Daily Room.
//

import SwiftUI

struct DailyStory: Identifiable, Hashable {
    let id: String
    let tag: String
    let title: String
    let subtitle: String
    let readMinutes: Int
    let heroGradient: LinearGradient
    /// Published editorial photography when the story row provides one.
    /// The gradient remains the graceful fallback for older rows.
    let heroImageURL: URL?
    let isUnread: Bool
    let body: String
    let makerName: String
    let makerLocation: String
    let makerAvatarGradient: LinearGradient
    let featuredProductID: String?

    var readTimeLabel: String { "\(readMinutes) min read" }

    static func == (lhs: DailyStory, rhs: DailyStory) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

#if DEBUG
extension DailyStory {
    /// SwiftUI preview-only sample. Never read at runtime — production content
    /// comes from `editorial_stories` via `EditorialStoriesAPIClient`.
    static let preview = DailyStory(
        id: "story-chilton",
        tag: "Maker Spotlight",
        title: "The Grain Whisperer of Maine",
        subtitle: "Jonathan Chilton on 40 years of listening to wood",
        readMinutes: 4,
        heroGradient: PatinaGradients.hero,
        heroImageURL: nil,
        isUnread: true,
        body: "For four decades, Jonathan Chilton has been making chairs in a small shop on the coast of Maine. He doesn't sketch first. He listens. \"Every board has a direction it wants to go,\" he says, running his palm across a slab of black walnut drying in the corner. \"My job is to find that direction and follow it.\"\n\nThe lounge chair you see on your home screen today began three years ago, as a tree felled by a winter storm. Chilton bought the log from a neighbor for the price of a tank of gas.",
        makerName: "Jonathan Chilton",
        makerLocation: "Freeport, Maine",
        makerAvatarGradient: PatinaGradients.earth,
        featuredProductID: nil
    )
}
#endif
