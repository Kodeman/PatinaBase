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

    /// `C5-14`'s exit criterion: **one money format**, so the hand-rolled
    /// compact count is zero. Six survived round one — in `Core/Models/**` and
    /// `Features/Rooms/**` — behind integration notes their owners did not
    /// schedule, and `$2.4K` still rendered live from the room budget bar.
    private static let compactFormatterCeiling = 0

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
        let source = try SourcePin.readCode("Patina/Features/Shared/CurrencyFormatting.swift")
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
            let source = try SourcePin.readCode(path)
            #expect(!source.contains("))K\""), "\(path) hand-rolls a compact money string")
            #expect(!source.contains("$%.1fK"), "\(path) hand-rolls a compact money string")
        }
    }

    /// `RL1D-R3-12`. The quiz's three budget **bands** are literals —
    /// `"$500–$2K"`, `"$2K–$5K"`, `"$2–5K"` — and are named here rather than
    /// matched, the way `BorderTokenAdoptionTests` names `PatinaGradients`.
    ///
    /// A band is not a piece's price. `C5-14` is "the same piece prints $4,200
    /// on Today and $4.2K one tap later": one *amount*, two shapes. A range the
    /// tester picks from a quiz has no amount behind it and no second rendering
    /// to disagree with. They are also in `Features/StyleQuiz/**`, which is
    /// L1-A's. The exemption is by file, so a compact string appearing anywhere
    /// else — including a fourth band added to one of these files — is caught.
    private static let bandLiteralExemptions = [
        "StyleQuizViewModel.swift",
        "StyleResultView.swift"
    ]

    /// The app-wide bar, at zero.
    ///
    /// The first version of this counted only `))K"` and `$%.1fK`, i.e. only a
    /// formatter that *computes* a compact string. Its own name is "no amount
    /// ever renders as a compact K string", and a literal renders one without
    /// computing it — so the assertion was narrower than the sentence it made.
    @Test("no file in the app hand-rolls or hard-codes a compact money string")
    func theCompactFormatterCountNeverClimbs() {
        var offenders: [String] = []
        for path in SourcePin.swiftFiles(under: "Patina") {
            let name = (path as NSString).lastPathComponent
            guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let source = SourcePin.code(raw)

            var hits = source.components(separatedBy: "))K\"").count - 1
            hits += source.components(separatedBy: "$%.1fK").count - 1
            if !Self.bandLiteralExemptions.contains(name) {
                hits += Self.compactLiteralCount(in: source)
            }
            if hits > 0 { offenders.append("\(name) ×\(hits)") }
        }
        #expect(
            offenders.count <= Self.compactFormatterCeiling,
            "compact money strings survive at: \(offenders.joined(separator: ", ")); C5-14's exit criterion is one money format"
        )
    }

    /// A `$` followed by digits and then a `K`, inside a string literal —
    /// `"$2K"`, `"$4.2K"`, `"$2–5K"`. Deliberately does not fire on `$` alone
    /// or on a `K` alone, and does not try to parse Swift: it looks at what a
    /// reader would see on the screen.
    private static func compactLiteralCount(in source: String) -> Int {
        var count = 0
        var rest = Substring(source)
        while let dollar = rest.firstIndex(of: "$") {
            let after = rest[rest.index(after: dollar)...]
            var index = after.startIndex
            var sawDigit = false
            while index < after.endIndex {
                let character = after[index]
                if character.isNumber {
                    sawDigit = true
                } else if character == "." || character == "," || character == "–"
                            || character == "-" || character == "$" {
                    // still inside the figure
                } else {
                    if character == "K" && sawDigit { count += 1 }
                    break
                }
                index = after.index(after: index)
            }
            rest = after
        }
        return count
    }
}
