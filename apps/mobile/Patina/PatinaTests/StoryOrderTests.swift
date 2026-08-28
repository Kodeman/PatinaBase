//
//  StoryOrderTests.swift
//  PatinaTests
//
//  B §2: the story query is ordered `published_at desc, sort_order desc`, so a
//  newer story cannot be buried by a lower sort order (F46=F61, F131) — and the
//  card's weight follows what the Record did with the screen.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct StoryOrderTests {

    @Test("the newest story wins, not the highest sort order")
    func theQueryIsOrderedByPublishDateFirst() throws {
        let source = try SourcePin.read("Patina/Core/Network/EditorialStoriesAPIClient.swift")
        #expect(source.contains("\"published_at.desc,sort_order.desc\""))
        #expect(!source.contains("\"sort_order.desc,published_at.desc\""))
    }

    @Test("the story drops to a row when the record carried the screen")
    func theStoryIsDemotedWhenTheRecordSpoke() {
        let row = HouseRecordRow(
            id: "story", kind: .story, title: "A new story from the workshop.",
            detail: nil, date: Date(timeIntervalSince1970: 1_756_000_000),
            state: .none, isNew: false, route: nil
        )
        let record = HouseRecord(
            needsYou: [], moved: [row],
            window: DateInterval(start: Date(timeIntervalSince1970: 1_755_000_000),
                                 duration: 7 * 24 * 60 * 60),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
        let loud = HomeCompositionInput(
            isSignedIn: true, tier: .activeProject, record: record, hasStory: true
        )
        #expect(HomeComposition.storyWeight(for: loud) == .row(96))

        let quiet = HomeCompositionInput(isSignedIn: true, tier: .engaged, hasStory: true)
        #expect(HomeComposition.storyWeight(for: quiet) == .hero)
    }

    @Test("the unread dot is still the reader's own record, not a constant")
    func theUnreadDotComesFromTheReadStore() throws {
        let source = try SourcePin.read("Patina/Core/Network/EditorialStoriesAPIClient.swift")
        #expect(source.contains("isUnread: Bool"))
        let card = try SourcePin.read("Patina/Features/Home/Views/DailyStoryCard.swift")
        #expect(card.contains("if story.isUnread"))
        let viewModel = try SourcePin.read(
            "Patina/Features/Home/ViewModels/DailyRoomViewModel.swift"
        )
        #expect(viewModel.contains("reads.isUnread(storyId: $0.id)"))
    }
}
