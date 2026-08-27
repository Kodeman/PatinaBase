//
//  NewThisWeekTests.swift
//  PatinaTests
//
//  B §2's supply floor: NEW THIS WEEK renders at three or more genuinely new
//  rows, or it does not render. It is never padded.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct NewThisWeekTests {

    private static let now = Date(timeIntervalSince1970: 1_756_200_000)

    private func product(_ id: String, publishedDaysAgo: Double?) -> Product {
        Product(
            id: id, name: "Piece \(id)", priceCents: 210_000, matchScore: 80,
            makerName: "Heritage Lumber", makerLocation: nil, makerStory: nil,
            imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [],
            badges: [], category: .tables, tier: .newArrival,
            publishedAt: publishedDaysAgo.map {
                Self.now.addingTimeInterval(-$0 * 24 * 60 * 60)
            }
        )
    }

    @Test("three genuinely new rows draw; two do not")
    func theFloorIsThree() {
        let three = [
            product("a", publishedDaysAgo: 1),
            product("b", publishedDaysAgo: 3),
            product("c", publishedDaysAgo: 6)
        ]
        #expect(NewThisWeek.rows(from: three, now: Self.now).count == 3)
        #expect(NewThisWeek.rows(from: Array(three.prefix(2)), now: Self.now).isEmpty)
    }

    @Test("a shortfall is never topped up from older stock")
    func olderStockNeverPads() {
        let mixed = [
            product("a", publishedDaysAgo: 1),
            product("b", publishedDaysAgo: 2),
            product("old", publishedDaysAgo: 40),
            product("older", publishedDaysAgo: 90)
        ]
        // Two are new, two are not: the block does not draw at all.
        #expect(NewThisWeek.rows(from: mixed, now: Self.now).isEmpty)
    }

    @Test("a row eight days old, a row with no timestamp and a future row are all out")
    func onlyRealTimestampsInsideTheWindowCount() {
        let rows = [
            product("a", publishedDaysAgo: 1),
            product("b", publishedDaysAgo: 2),
            product("c", publishedDaysAgo: 3),
            product("stale", publishedDaysAgo: 8),
            product("unknown", publishedDaysAgo: nil),
            product("scheduled", publishedDaysAgo: -2)
        ]
        #expect(NewThisWeek.rows(from: rows, now: Self.now).map(\.id) == ["a", "b", "c"])
    }

    @Test("newest first")
    func newestFirst() {
        let rows = [
            product("c", publishedDaysAgo: 6),
            product("a", publishedDaysAgo: 1),
            product("b", publishedDaysAgo: 3)
        ]
        #expect(NewThisWeek.rows(from: rows, now: Self.now).map(\.id) == ["a", "b", "c"])
    }

    @Test("the footer spells its count, and says nothing at zero")
    func theFooterSpellsTheCount() {
        #expect(NewThisWeek.footer(count: 3) == "Three pieces joined Patina this week.")
        #expect(NewThisWeek.footer(count: 1) == "One piece joined Patina this week.")
        #expect(NewThisWeek.footer(count: 0) == nil)
    }
}
