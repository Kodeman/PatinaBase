//
//  DailyRoomFeedMappingTests.swift
//  PatinaTests
//
//  Pins the Daily Room feed mapping after U02/U03 moved the home off the
//  dead `/api/feed/:roomId` portal route and onto the `get_recommendations`
//  RPC. The old mapper hardcoded `matchScore: 80` and `category: .decor` for
//  every product, so the home's match pill was decoration and its category
//  filters could never match anything real.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct DailyRoomFeedMappingTests {

    private func product(
        id: String = "p1",
        matchScore: Int = 50,
        category: ProductCategory = .decor,
        tier: ProductTier = .styleMatch
    ) -> Product {
        Product(
            id: id,
            name: "Walnut Lounge Chair",
            priceCents: 285_000,
            matchScore: matchScore,
            makerName: "Chilton Furniture",
            makerLocation: nil,
            makerStory: nil,
            imageURL: nil,
            usdzURL: nil,
            styleTags: [],
            materialTags: [],
            badges: [],
            category: category,
            tier: tier
        )
    }

    // MARK: - Mapping

    @Test
    func mappingCarriesRealMatchScore() {
        let rec = DailyRoomViewModel.recommendation(from: product(matchScore: 87))
        #expect(rec.matchScore == 87)
        #expect(rec.product.matchScore == 87)
    }

    @Test
    func mappingCarriesRealCategory() {
        let rec = DailyRoomViewModel.recommendation(from: product(category: .seating))
        #expect(rec.product.category == .seating)
    }

    @Test
    func designerSelectionTierMaps() {
        let rec = DailyRoomViewModel.recommendation(from: product(tier: .designerSelection))
        #expect(rec.tier == .designerSelection)
    }

    @Test
    func newArrivalAndStyleMatchMapToStandard() {
        #expect(
            DailyRoomViewModel.recommendation(from: product(tier: .newArrival)).tier == .standard
        )
        #expect(
            DailyRoomViewModel.recommendation(from: product(tier: .styleMatch)).tier == .standard
        )
    }

    // MARK: - Filtering

    private func viewModel(with products: [Product]) -> DailyRoomViewModel {
        let model = DailyRoomViewModel()
        model.allRecommendations = products.map { DailyRoomViewModel.recommendation(from: $0) }
        return model
    }

    @Test
    func seatingFilterReturnsOnlySeating() {
        let model = viewModel(with: [
            product(id: "chair", category: .seating),
            product(id: "table", category: .tables),
            product(id: "lamp", category: .lighting)
        ])
        model.activeFilterID = "seating"
        #expect(model.recommendations.map(\.id) == ["chair"])
    }

    @Test
    func allFilterReturnsEverything() {
        let model = viewModel(with: [
            product(id: "chair", category: .seating),
            product(id: "table", category: .tables),
            product(id: "lamp", category: .lighting)
        ])
        model.activeFilterID = "all"
        #expect(model.recommendations.count == 3)
    }

    @Test
    func filterCanBeEmptyWhileFeedIsNot() {
        // The state the home has to speak to: chips are live, the feed has
        // pieces, and the active filter matches none of them.
        let model = viewModel(with: [product(id: "chair", category: .seating)])
        model.activeFilterID = "tables"
        #expect(model.recommendations.isEmpty)
        #expect(!model.allRecommendations.isEmpty)
        #expect(model.activeFilterLabel == "Tables")

        model.showAllCategories()
        #expect(model.activeFilterID == "all")
        #expect(model.recommendations.count == 1)
    }

    // MARK: - SP-18: the story's unread dot is real

    private func readStore(_ name: String) -> (StoryReadStore, UserDefaults) {
        let suite = "PatinaTests.\(name).\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        return (StoryReadStore(defaults: defaults), defaults)
    }

    /// The dot was hard-coded `true`, so the same card was permanently marked
    /// new — on every home, in dark mode, after every relaunch.
    @Test
    func aStoryIsUnreadUntilItIsOpened() {
        let (store, defaults) = readStore("unread")
        defer { defaults.removePersistentDomain(forName: defaults.description) }

        #expect(store.isUnread(storyId: "story-1"))
        store.markRead(storyId: "story-1")
        #expect(!store.isUnread(storyId: "story-1"))
        #expect(store.readAt(storyId: "story-1") != nil)
        #expect(store.isUnread(storyId: "story-2"))
    }

    /// The pick serves the highest-`sort_order` story the reader has not
    /// opened; the ordered list's own head is the fallback once every story
    /// has been read.
    @Test
    func theHomeServesAStoryTheReaderHasNotOpened() {
        let (store, _) = readStore("pick")
        let candidates = ["story-1", "story-2", "story-3"]

        #expect(store.nextStoryId(from: candidates) == "story-1")
        store.markRead(storyId: "story-1")
        #expect(store.nextStoryId(from: candidates) == "story-2")
        store.markRead(storyId: "story-2")
        store.markRead(storyId: "story-3")
        #expect(store.nextStoryId(from: candidates) == "story-1")
    }

    @Test
    func anEmptyShortlistServesNothing() {
        let (store, _) = readStore("empty")
        #expect(store.nextStoryId(from: []) == nil)
    }
}
