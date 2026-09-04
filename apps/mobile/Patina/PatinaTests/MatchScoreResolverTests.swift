//
//  MatchScoreResolverTests.swift
//  PatinaTests
//
//  A-34 and C-11, which are one problem seen twice.
//
//  C-11: the Heirloom Oak Dining Table read 73% on the Pieces tab, 57% on
//  the room-scoped grid and 50% on its own detail, one tap apart, in one
//  session — three sources, only two of which were scores.
//  A-34: after a five-question quiz, ten cards read 46/46/45/45/45/45/41/40/
//  45/45 under a header promising "10 pieces chosen for your space".
//
//  One score per piece per session, and a band rather than a figure that
//  invites arithmetic.
//

import Testing
@testable import Patina

@MainActor
struct MatchScoreResolverTests {

    private func product(_ id: String, score: Int) -> Product {
        Product(
            id: id, name: "Heirloom Oak Dining Table", priceCents: 420_000,
            matchScore: score, makerName: "Hartwell", makerLocation: nil,
            makerStory: nil, imageURL: nil, usdzURL: nil,
            styleTags: [], materialTags: [], badges: [],
            category: .tables, tier: .styleMatch
        )
    }

    // MARK: - C-11: one score, whatever asked

    @Test
    func theFirstScoreASessionSeesIsTheOneItKeeps() {
        let resolver = MatchScoreResolver()
        #expect(resolver.resolve(productId: "oak", candidate: 73) == 73)
        // The same RPC with `p_room_id` answers 57. The card must not change
        // under the reader.
        #expect(resolver.resolve(productId: "oak", candidate: 57) == 73)
        #expect(resolver.score(for: "oak") == 73)
    }

    @Test
    func aFeedsScoresAreReconciledPieceByPiece() {
        let resolver = MatchScoreResolver()
        _ = resolver.reconciling([product("oak", score: 73), product("rug", score: 44)])

        let roomScoped = resolver.reconciling([
            product("oak", score: 57),   // the same piece, a different scope
            product("lamp", score: 61)   // new to the session
        ])
        #expect(roomScoped.map(\.matchScore) == [73, 61])
    }

    /// The by-id table read has no match score at all. It used to print
    /// `quality_score ?? 50`, which is where the third number came from.
    @Test
    func theByIdReadTakesTheSessionsScoreAndNeverInventsOne() {
        let resolver = MatchScoreResolver()
        _ = resolver.reconciling([product("oak", score: 73)])

        let opened = resolver.applyingKnownScores([product("oak", score: 0)])
        #expect(opened[0].matchScore == 73)

        let neverSeen = resolver.applyingKnownScores([product("sconce", score: 0)])
        #expect(neverSeen[0].matchScore == 0)
        #expect(resolver.score(for: "sconce") == nil)
    }

    /// A zero is the decoder's "absent", not a match of zero — recording it
    /// would pin a piece at "not scored" for the whole session.
    @Test
    func anAbsentScoreRecordsNothing() {
        let resolver = MatchScoreResolver()
        #expect(resolver.resolve(productId: "oak", candidate: 0) == nil)
        #expect(resolver.resolve(productId: "oak", candidate: nil) == nil)
        #expect(resolver.resolve(productId: "oak", candidate: 73) == 73)
    }

    @Test
    func anAccountChangeDropsTheSessionsScores() {
        let resolver = MatchScoreResolver()
        _ = resolver.resolve(productId: "oak", candidate: 73)
        resolver.resetForSessionChange()
        #expect(resolver.score(for: "oak") == nil)
    }

    @Test
    func theResolverIsOnTheSessionSeam() {
        let names = SessionScope.participants().map { String(describing: type(of: $0)) }
        #expect(names.contains("MatchScoreResolver"))
    }

    // MARK: - A-34: a band, not a figure

    @Test
    func theLabelIsABandAndNeverAPercentage() {
        #expect(product("a", score: 73).matchLabel == "Strong match")
        #expect(product("a", score: 70).matchLabel == "Strong match")
        #expect(product("a", score: 57).matchLabel == "Good match")
        #expect(product("a", score: 50).matchLabel == "Good match")
        // The whole observed A-34 range — the one a tester read as failure.
        for score in 40...46 {
            #expect(product("a", score: score).matchLabel == "Worth a look")
        }
        for score in [0, 40, 46, 50, 73, 99] {
            #expect(product("a", score: score).matchLabel.contains("%") == false)
        }
    }

    /// An unscored piece says so rather than borrowing a band.
    @Test
    func anUnscoredPieceSaysSo() {
        #expect(product("a", score: 0).matchLabel == "Not scored yet")
        #expect(product("a", score: 0).hasMatchScore == false)
        #expect(product("a", score: 1).hasMatchScore)
    }

    /// `matchLabel` is the right thing to *say* — VoiceOver reads "Not scored
    /// yet" and that is honest. It is the wrong thing to *draw*: both render
    /// sites put it inside a capsule tinted `PatinaColors.success`, so a piece
    /// opened by id in a session that never scored it drew a green verdict
    /// badge announcing the absence of a verdict (review `RL1B3-04`).
    ///
    /// `matchVerdict` is the drawable half, and it is `nil` when there is no
    /// verdict, so a guarded call site draws nothing at all.
    @Test
    func anUnscoredPieceHasNoVerdictAtAll() {
        #expect(product("a", score: 0).matchVerdict == nil)
        #expect(product("a", score: 73).matchVerdict == "Strong match")
        #expect(product("a", score: 57).matchVerdict == "Good match")
        #expect(product("a", score: 41).matchVerdict == "Worth a look")
        // The spoken string is unchanged — E3-L1B-3 ratified all four bands.
        #expect(product("a", score: 0).matchLabel == "Not scored yet")
    }

    /// The client no longer maps `quality_score` into the match.
    @Test
    func theRawMapperNoLongerBorrowsQualityScore() throws {
        let source = try SourcePin.read("Patina/Core/Network/ProductAPIClient.swift")
        #expect(source.contains("matchScore: quality_score ?? 50") == false)
    }

    // MARK: - The room average

    @Test
    func aRoomAverageIgnoresUnscoredPieces() {
        let room = RoomModel(name: "Living", roomType: "living")
        let scored = SavedItem(
            productId: "oak", productName: "Oak", makerName: "Hartwell",
            priceCents: 100, matchScore: 80, hasAR: false, thumbGradientKey: "walnut"
        )
        let unscored = SavedItem(
            productId: "sconce", productName: "Sconce", makerName: "Hartwell",
            priceCents: 100, matchScore: 0, hasAR: false, thumbGradientKey: "walnut"
        )
        room.items = [scored, unscored]
        #expect(room.averageMatchScore == 80)

        room.items = [unscored]
        #expect(room.averageMatchScore == nil)
    }
}

// MARK: - The cross-lane half

/// `A-34`/`C-11`'s remaining half was note **O11**: the two render sites are
/// `ProductDetailView.swift` and `RecommendationsView.swift`, both L1-C's
/// files, and L1-C merged two commits below the branch tip that carried the
/// guard (review `RL1B3-03`, filed as `W1-S-01`). Until it landed, an unscored
/// piece drew `matchLabel` inside a `PatinaColors.success` capsule.
///
/// This was a `withKnownIssue` — green while the note was genuinely owed, red
/// the moment the guard landed. The guard is landed (W1-followup, `W1-S-01`),
/// so it is an ordinary bar.
@MainActor
extension MatchScoreResolverTests {

    @Test(
        "the verdict pills guard on matchVerdict",
        arguments: [
            "Patina/Features/ProductDetail/Views/ProductDetailView.swift",
            "Patina/Features/Recommendations/Views/RecommendationsView.swift"
        ]
    )
    func theVerdictPillsGuardOnMatchVerdict(path: String) throws {
        let code = SourceScan.code(in: try SourcePin.read(path))
        #expect(code.contains("matchVerdict"))
    }
}
