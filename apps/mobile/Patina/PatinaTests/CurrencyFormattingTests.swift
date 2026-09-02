//
//  CurrencyFormattingTests.swift
//  PatinaTests
//
//  `C5-14`. Two money formats ship at once. Today's New This Week rail prints
//  `fullFormattedPrice` → "$4,200"; one tap later the same piece prints
//  `formattedPrice` → "$4.2K". Ten sites hand-roll the compact form above
//  $1,000 and a bare "$\(dollars)" below it.
//
//  One rule. It lives in `PatinaCurrency`, and the compact form is deliberately
//  not added there — a call site that wants "$4.2K" should find nothing to
//  reach for.
//

import Testing
import Foundation
@testable import Patina

struct CurrencyFormattingTests {

    /// Files this lane owns. A hand-rolled money string here is a regression.
    private static let ownedFiles = [
        "Patina/Features/Shared/CurrencyFormatting.swift",
        "Patina/Features/Shared/Views/ProductCard.swift",
        "Patina/Core/Network/EditorialStoriesAPIClient.swift"
    ]

    /// Hand-rolled `K` formatters on this lane's base sha (`ba83aa67f`): six,
    /// in `Core/Models/**` and `Features/Rooms/**`. Each reaches its owner as
    /// an integration note; the count may only go down.
    private static let compactFormatterCeiling = 6

    @Test("one amount has exactly one shape")
    func oneAmountOneShape() {
        #expect(PatinaCurrency.formatWholeDollars(cents: 420_000) == "$4,200")
        #expect(PatinaCurrency.format(cents: 420_000) == "$4,200.00")
        #expect(PatinaCurrency.formatWholeDollars(cents: 0) == "$0")
        #expect(PatinaCurrency.formatWholeDollars(cents: 99) == "$1")
        #expect(PatinaCurrency.formatWholeDollars(cents: 123_456) == "$1,235")
    }

    /// The two strings `C5-14` caught one tap apart. Neither may become the
    /// other's abbreviation.
    @Test("no amount ever renders as a compact K string")
    func noCompactForm() {
        for cents in [100_000, 420_000, 1_000_000, 999_900, 4_250_00] {
            let whole = PatinaCurrency.formatWholeDollars(cents: cents)
            let exact = PatinaCurrency.format(cents: cents)
            #expect(!whole.hasSuffix("K"), "formatWholeDollars produced a compact string: \(whole)")
            #expect(!exact.hasSuffix("K"), "format produced a compact string: \(exact)")
        }
    }

    /// The API surface is the enforcement: there is no compact entry point to
    /// call, so "route everything through PatinaCurrency" cannot quietly mean
    /// "and keep both shapes".
    @Test("PatinaCurrency does not hand-roll, and does not scale")
    func patinaCurrencyNeitherHandRollsNorScales() throws {
        let source = try SourcePin.read("Patina/Features/Shared/CurrencyFormatting.swift")
        #expect(
            !source.contains("String(format:"),
            "PatinaCurrency hand-rolls a money string — the one rule has to be the NumberFormatter"
        )
        #expect(
            !source.contains("/ 1000"),
            "PatinaCurrency scales by a thousand — that is the compact form C5-14 asked to be removed, not relocated"
        )
    }

    @Test("no file this lane owns hand-rolls a money string")
    func thisLaneRoutesThroughPatinaCurrency() throws {
        for path in Self.ownedFiles {
            let source = try SourcePin.read(path)
            #expect(!source.contains("))K\""), "\(path) hand-rolls a compact money string")
            #expect(!source.contains("$%.1fK"), "\(path) hand-rolls a compact money string")
        }
    }

    /// The app-wide ratchet, until the notes land in the four files that still
    /// carry one.
    @Test("the hand-rolled money-format count never climbs")
    func theCompactFormatterCountNeverClimbs() {
        var total = 0
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            total += source.components(separatedBy: "))K\"").count - 1
            total += source.components(separatedBy: "$%.1fK").count - 1
        }
        #expect(
            total <= Self.compactFormatterCeiling,
            "hand-rolled compact money formatters rose to \(total); the ceiling on this branch's base is \(Self.compactFormatterCeiling)"
        )
    }
}
