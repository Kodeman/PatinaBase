//
//  UnscoredMatchPillTests.swift
//  PatinaTests
//
//  A-34 / C-11, sent to L1-C as L1-B's note `O11` after its own review filed
//  `RL1B-09`. `Product.matchScore` decodes to 0 when the column is null, so a
//  saved piece, a deep-linked piece, or any piece opened in a session that
//  never scored it renders `matchLabel` — and both call sites render that label
//  as a pill. On the piece detail the pill is success-coloured, which turns an
//  absence into a green verdict; on the recommendation card it is neutral, but
//  the card's combined accessibility label speaks the same claim.
//
//  `W1-S-01`: the guard shipped on `first-flight/w1-l1c` at `46752b646`, two
//  commits above the point L1-C was merged at, and was never landed. Its
//  predicate was `matchScore > 0`, written before L1-B's merge; on the
//  integrated tip the model owns that arithmetic as `hasMatchScore`, and
//  `matchVerdict` is the drawable half — nil exactly when there is no verdict.
//  So these pins ask for `matchVerdict`, which is also what
//  `MatchScoreResolverTests.theVerdictPillsGuardOnMatchVerdict` waits for. The
//  original file's own closing pin said this in advance: "If the model ever
//  bands the label (L1-B's change), this pin is what points at the two call
//  sites that have to follow it."
//

import Testing
@testable import Patina

@Suite("An unscored piece wears no match verdict")
struct UnscoredMatchPillTests {

    @Test("the piece detail's success-coloured pill is withheld when nothing scored the piece")
    func theDetailPillNeedsAScore() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/ProductDetail/Views/ProductDetailView.swift")
        )
        #expect(code.contains("if let verdict = product.matchVerdict"),
                "an unscored piece still wears a green \"Not scored yet\" pill (A-34)")
        #expect(!code.contains("Text(product.matchLabel)"),
                "the detail pill still draws the label unconditionally (A-34)")
    }

    @Test("the recommendation card's badge is withheld too")
    func theCardBadgeNeedsAScore() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Recommendations/Views/RecommendationsView.swift")
        )
        #expect(code.contains("if let verdict = product.matchVerdict"),
                "an unscored card still wears a match badge (C-11)")
        #expect(!code.contains("Text(product.matchLabel)"),
                "the card badge still draws the label unconditionally (C-11)")
    }

    @Test("and VoiceOver does not read the verdict the badge no longer shows")
    func theCardLabelDropsTheClaimToo() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Recommendations/Views/RecommendationsView.swift")
        )
        // `cardAccessibilityLabel` interpolated `matchLabel` unconditionally, so
        // hiding the badge alone would leave the claim audible and invisible —
        // the worse of the two states.
        #expect(!code.contains("fullFormattedPrice), \\(product.matchLabel)"),
                "the combined label still speaks a score nobody computed (C-11)")
        #expect(code.contains("product.matchVerdict.map"),
                "the label names the match only when there is one")
    }

    @Test("the score predicate is the model's own, not a magic number in a view")
    func theArithmeticIsNotRestated() throws {
        let model = try SourcePin.read("Patina/Core/Models/ProductModel.swift")
        #expect(model.contains("var hasMatchScore: Bool { matchScore > 0 }"),
                "the predicate moved; re-read O11 before trusting the guards")
        #expect(model.contains("var matchVerdict: String? { hasMatchScore ? matchLabel : nil }"),
                "matchVerdict changed shape; both call sites read it directly")
        // The absence is still SAYABLE — VoiceOver reading "Not scored yet" on
        // a piece detail is honest. It is only undrawable.
        #expect(model.contains("default: return \"Not scored yet\""),
                "matchLabel no longer names the absence it is guarding")
    }

    @Test("neither call site restates the arithmetic the model already owns")
    func theViewsDoNotRecomputeTheScore() throws {
        for path in [
            "Patina/Features/ProductDetail/Views/ProductDetailView.swift",
            "Patina/Features/Recommendations/Views/RecommendationsView.swift"
        ] {
            let code = SourceScan.code(in: try SourcePin.read(path))
            #expect(!code.contains("product.matchScore > 0"),
                    "\(path) re-derives the predicate instead of reading matchVerdict")
        }
    }
}
