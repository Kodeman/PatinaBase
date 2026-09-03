//
//  EditorialReadTimeTests.swift
//  PatinaTests
//
//  `A3-17`. All three published `editorial_stories` rows on Strata carry
//  `read_minutes` of 5, 3 and 4 against bodies of 489, 386 and 387 characters.
//  "A defense of imperfect linen" is a 387-character stub billed as a
//  five-minute read, and with the catalogue empty (`A3-01`) that card is the
//  only content a round-one tester has to open.
//
//  The row keeps its editorial claim; the app just refuses to repeat one the
//  body cannot carry.
//

import Testing
import Foundation
@testable import Patina

struct EditorialReadTimeTests {

    /// The three production rows, verbatim lengths from the read-only SELECT in
    /// `research/A3-prod.md`.
    private static let prodBodyLengths = [489, 386, 387]

    @Test("a body computes the minutes it can actually carry")
    func aBodyComputesItsOwnMinutes() {
        // ~65 words at 200 wpm is under a minute, and one minute is the floor —
        // "0 min read" is not an improvement on a lie.
        #expect(EditorialReadTime.minutes(forBody: String(repeating: "word ", count: 65)) == 1)
        #expect(EditorialReadTime.minutes(forBody: String(repeating: "word ", count: 200)) == 1)
        #expect(EditorialReadTime.minutes(forBody: String(repeating: "word ", count: 400)) == 2)
        #expect(EditorialReadTime.minutes(forBody: String(repeating: "word ", count: 1000)) == 5)
        #expect(EditorialReadTime.minutes(forBody: "") == 1)
    }

    @Test("the claim is never larger than the body")
    func theClaimIsNeverLargerThanTheBody() {
        // The production rows, as they are: a ~400-character stub billed at 5.
        // English prose runs ~6 characters to the word including the space, so
        // 489 characters is ~81 words — under half a minute at 200 wpm.
        for (characters, claimed) in zip(Self.prodBodyLengths, [5, 3, 4]) {
            let body = String(repeating: "linen ", count: characters / 6)
            let honest = EditorialReadTime.claim(rowValue: claimed, body: body)
            #expect(honest == 1, "a \(characters)-character body still claims \(honest) minutes")
        }
    }

    @Test("a real article keeps its editorial claim")
    func aRealArticleKeepsItsClaim() {
        let long = String(repeating: "word ", count: 1400)   // ~7 minutes of body
        #expect(EditorialReadTime.claim(rowValue: 6, body: long) == 6)
        // And an editor who under-claims is not overruled upward.
        #expect(EditorialReadTime.claim(rowValue: 3, body: long) == 3)
    }

    /// The test that used to sit here was named "a row with no body cannot
    /// claim a read time at all" and asserted `== 1` — i.e. it asserted the
    /// card DOES claim one. `A3-17`'s fix line asks for the badge to be hidden
    /// below a threshold, and a body with no words is below every threshold.
    @Test("a body with no words makes no claim, and the card prints none")
    func aBodyThatCannotCarryAClaimMakesNone() {
        #expect(EditorialReadTime.claim(rowValue: 5, body: "") == nil)
        #expect(EditorialReadTime.claim(rowValue: 0, body: "") == nil)
        #expect(EditorialReadTime.claim(rowValue: 5, body: "   \n  ") == nil)

        // And the model carries the absence rather than inventing a number.
        #expect(DailyStory.preview.readTimeLabel != nil)
        let bodyless = RemoteEditorialStory(
            id: "x", tag: "Maker", title: "T", subtitle: nil, bodyMarkdown: nil,
            readMinutes: 5, heroImageURL: nil, heroGradientKey: nil,
            makerName: nil, makerLocation: nil, makerAvatarURL: nil,
            makerAvatarGradientKey: nil, featuredProductID: nil, publishedAt: nil
        )
        #expect(
            DailyStory(from: bodyless, isUnread: true).readTimeLabel == nil,
            "a story with no body still prints a read-time badge"
        )
    }

    @Test("the mapping applies the clamp, not the raw row")
    func theMappingAppliesTheClamp() throws {
        let source = try SourcePin.read("Patina/Core/Network/EditorialStoriesAPIClient.swift")
        #expect(
            !source.contains("readMinutes: remote.readMinutes"),
            "DailyStory still takes the row's read_minutes verbatim — A3-17"
        )
        #expect(source.contains("EditorialReadTime.claim("), "the mapping does not clamp the claim")
    }
}
