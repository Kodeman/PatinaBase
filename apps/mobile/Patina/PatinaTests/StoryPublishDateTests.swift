//
//  StoryPublishDateTests.swift
//  PatinaTests
//
//  W2 carry-over 3: the story card's date chip ("AUG 25 · 4 MIN") needs the
//  publish date on the story itself, not on a raw row a view model happens to
//  have kept. B §2 block 5 — a story is a dated thing.
//

import Testing
import Foundation
@testable import Patina

struct StoryPublishDateTests {

    private func remote(publishedAt: String?) throws -> RemoteEditorialStory {
        let published = publishedAt.map { "\"\($0)\"" } ?? "null"
        let json = """
        { "id": "s-1", "tag": "Maker Spotlight", "title": "The Grain Whisperer of Maine",
          "subtitle": "Forty years of listening to wood", "read_minutes": 4,
          "published_at": \(published) }
        """
        return try JSONDecoder().decode(RemoteEditorialStory.self, from: Data(json.utf8))
    }

    @Test("a timestamptz reaches the story")
    func timestamptzDecodes() throws {
        let story = DailyStory(from: try remote(publishedAt: "2026-08-25T14:00:00Z"), isUnread: true)
        let published = try #require(story.publishedAt)
        #expect(published == Date(timeIntervalSince1970: 1_787_666_400))
    }

    @Test("a fractional-seconds timestamp reaches the story")
    func fractionalSecondsDecode() throws {
        let story = DailyStory(
            from: try remote(publishedAt: "2026-08-25T14:00:00.123456Z"), isUnread: true
        )
        #expect(story.publishedAt != nil)
    }

    @Test("a bare date column reaches the story")
    func bareDayDecodes() throws {
        // The trap `ISO8601DateParsing.dateOrDay` exists for: both ISO8601
        // formatters reject "2026-08-25" outright, which would silently turn
        // a published story into an undated one.
        let story = DailyStory(from: try remote(publishedAt: "2026-08-25"), isUnread: true)
        #expect(story.publishedAt != nil)
    }

    @Test("no publish date is no publish date, and the chip is the read time alone")
    func missingDateIsNil() throws {
        #expect(DailyStory(from: try remote(publishedAt: nil), isUnread: true).publishedAt == nil)
        #expect(DailyStory(from: try remote(publishedAt: ""), isUnread: true).publishedAt == nil)
        #expect(DailyStory.preview.readTimeLabel == "4 min read")
    }
}
