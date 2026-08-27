//
//  CompanionActionMatrixTests.swift
//  PatinaTests
//
//  Phase C: pins the Companion context → actions matrix. `CompanionActionProvider`
//  is a pure function of (route, context, isAuthenticated), so the whole matrix
//  is exhaustively testable off-device. These tests guard the load-bearing
//  invariants (≤6 rows incl. tail, ≤1 suggested, HOME off-home, QR only on
//  Profile, designer→request swap, tail-only mid-flow screens) plus a few pinned
//  exemplar menus.
//

// swiftlint:disable file_length

import Testing
import Foundation
@testable import Patina

// `@MainActor`: the app target uses default main-actor isolation, so `AppRoute`'s
// synthesized `Equatable`/`Hashable` conformance is main-actor-isolated. The
// suite compares routes directly, so it must run on the main actor.
@MainActor
struct CompanionActionMatrixTests {

    // MARK: - Fixtures

    private static let sampleRoomId = UUID()

    private static let sampleStyle = StyleProfileResult(
        primaryStyle: "modern",
        secondaryStyle: nil,
        primaryMaterial: "oak",
        paletteWarmth: "warm",
        budgetLabel: "mid",
        budgetMin: 100,
        budgetMax: 200,
        confidence: 0.9
    )

    /// Every `AppRoute` case, associated values filled with representative ids.
    /// Kept exhaustive by hand — if a route is added, the provider's exhaustive
    /// switch fails to compile first, but add it here too.
    fileprivate static let allRoutes: [AppRoute] = [
        .heroFrame,
        .yourSpaces,
        .roomProject(roomId: sampleRoomId),
        .roomSettings(roomId: sampleRoomId),
        .crossRoom,
        .manualRoomEntry,
        .roomSavedItems(roomId: sampleRoomId),
        .emergence(pieceId: nil),
        .roomEmergence(roomId: sampleRoomId),
        .table,
        .pieceDetail(pieceId: "piece-1"),
        .scanFlow(reason: .fresh),
        .styleQuiz,
        .styleResult(result: sampleStyle),
        .arPlacement(productId: "piece-1"),
        .profile,
        .notifications,
        .designerConsultation,
        .designRequests(focusLeadId: nil),
        .projectList,
        .projectDetail(projectId: "project-1"),
        .decisionList,
        .decisionDetail(decisionId: "decision-1"),
        .threadList,
        .threadDetail(threadId: "thread-1"),
        .proposalList,
        .proposalDetail(proposalId: "proposal-1"),
        .invoiceList,
        .invoiceDetail(invoiceId: "invoice-1"),
        .budget,
        .documentList
    ]

    private static let activeRequest = ActiveDesignRequestContext(
        leadId: UUID().uuidString,
        statusLabel: "In review"
    )

    fileprivate static func context(
        for screen: AppRoute,
        roomCount: Int,
        active: Bool,
        tier: EngagementTier? = nil,
        hasStyleProfile: Bool = false,
        designer: DesignerRelationship? = nil
    ) -> CompanionContext {
        // A viewing piece is supplied for a representative context —
        // `CompanionContext.summaryLine` and the nudge pill in
        // `CompanionContextProvider` both key off it. It no longer drives a
        // menu row here: the Companion's "Try in your room" action was
        // retired (W2 R3, W1b SP-18 residual — it dead-ended on every
        // product while usdz_url is NULL). tableItemCount > 0 so the
        // Collections row is present where offered.
        var context = CompanionContext(
            currentScreen: screen,
            viewingPiece: ViewingPieceContext(id: "piece-1", name: "Chair", maker: "Maker"),
            activeRoom: ActiveRoomContext(id: sampleRoomId, name: "Living Room"),
            tableItemCount: 3,
            roomCount: roomCount,
            hasStyleProfile: hasStyleProfile,
            activeDesignRequest: active ? activeRequest : nil
        )
        // `engagementTier` and `designerRelationship` are assigned rather than
        // passed: their types are internal, so they cannot appear in the public
        // memberwise initializer.
        context.engagementTier = tier
        context.designerRelationship = designer
        return context
    }

    /// The full combination grid the matrix must hold across. The tier is
    /// derived from the axes already present rather than adding a fourth one —
    /// an active request means engaged, a plain signed-in user is discovering,
    /// and a guest has no resolved tier at all.
    /// The live-designer arm is an axis in its own right: the row cap broke in
    /// production precisely because this grid had no designer axis, so a live
    /// relationship's extra home row was never counted here.
    fileprivate static let liveDesigner = DesignerRelationship.project(
        projectId: UUID(), designerId: UUID(), studioName: "Hartwell Studio"
    )

    private static func everyCombination(
        _ body: (_ route: AppRoute, _ signedIn: Bool, _ items: [CompanionActionItem]) -> Void
    ) {
        for route in allRoutes {
            for signedIn in [true, false] {
                for roomCount in [0, 2] {
                    for active in [true, false] {
                        for designer in [nil, liveDesigner] as [DesignerRelationship?] {
                            let tier: EngagementTier? = active ? .engaged : (signedIn ? .discovering : nil)
                            let ctx = context(
                                for: route, roomCount: roomCount, active: active,
                                tier: tier, designer: designer
                            )
                            let items = CompanionActionProvider.actions(
                                for: route, context: ctx, isAuthenticated: signedIn
                            )
                            body(route, signedIn, items)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Special-action classifiers (SpecialAction isn't Equatable)

    private static func isQRScanner(_ item: CompanionActionItem) -> Bool {
        guard let special = item.specialAction else { return false }
        if case .openQRScanner = special { return true }
        return false
    }

    private static func isDesignServices(_ item: CompanionActionItem) -> Bool {
        guard let special = item.specialAction else { return false }
        if case .openDesignServices = special { return true }
        return false
    }

    // MARK: - Invariants

    @Test
    func everyMenuFitsSixRowsIncludingTail() {
        Self.everyCombination { route, _, items in
            #expect(items.count <= 6, "\(route) produced \(items.count) rows (cap is 6)")
        }
    }

    @Test
    func everyMenuHasAtMostOneSuggestedRow() {
        Self.everyCombination { route, _, items in
            let suggested = items.filter(\.isSuggested).count
            #expect(suggested <= 1, "\(route) has \(suggested) suggested rows")
        }
    }

    @Test
    func everyNonHomeMenuIncludesHome() {
        Self.everyCombination { route, _, items in
            guard route != .heroFrame else { return }
            #expect(items.contains { $0.route == .heroFrame }, "\(route) is missing the HOME tail row")
        }
    }

    @Test
    func homeMenuDoesNotIncludeAHomeRow() {
        // On home itself there's no "Home" row — the identity row is the only tail.
        for signedIn in [true, false] {
            let ctx = Self.context(for: .heroFrame, roomCount: 2, active: false)
            let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: signedIn)
            #expect(!items.contains { $0.route == .heroFrame })
        }
    }

    @Test
    func qrScannerAppearsOnlyOnProfileWhenSignedIn() {
        Self.everyCombination { route, signedIn, items in
            let hasQR = items.contains(where: Self.isQRScanner)
            let shouldHaveQR = (route == .profile && signedIn)
            #expect(hasQR == shouldHaveQR, "\(route) signedIn=\(signedIn) QR=\(hasQR), expected \(shouldHaveQR)")
        }
    }

    @Test
    func designerRowsBecomeRequestRowsWhenARequestIsActive() {
        // With an active request, NO screen offers the "open design services"
        // sheet — every designer door routes to the live request instead.
        for route in Self.allRoutes {
            for signedIn in [true, false] {
                let ctx = Self.context(for: route, roomCount: 2, active: true)
                let items = CompanionActionProvider.actions(for: route, context: ctx, isAuthenticated: signedIn)
                #expect(!items.contains(where: Self.isDesignServices), "\(route) still offers design-services sheet while a request is active")
            }
        }
    }

    @Test
    func tableDesignerRowSwapsFromSheetToRequest() {
        // Not active: the ★ row opens the design-services sheet.
        let inactive = Self.context(for: .table, roomCount: 2, active: false)
        let inactiveItems = CompanionActionProvider.actions(for: .table, context: inactive, isAuthenticated: true)
        #expect(inactiveItems.contains(where: Self.isDesignServices))
        #expect(!inactiveItems.contains { $0.route == .designRequests(focusLeadId: nil) })

        // Active: the same slot routes to the design request and stays suggested.
        let active = Self.context(for: .table, roomCount: 2, active: true)
        let activeItems = CompanionActionProvider.actions(for: .table, context: active, isAuthenticated: true)
        #expect(!activeItems.contains(where: Self.isDesignServices))
        let requestRow = activeItems.first { $0.route == .designRequests(focusLeadId: nil) }
        #expect(requestRow != nil)
        #expect(requestRow?.isSuggested == true)
        #expect(requestRow?.hint == "In review")
    }

    @Test
    func scanFlowAndStyleQuizAreTailOnly() {
        for route in [AppRoute.scanFlow(reason: .fresh), .styleQuiz] {
            // Signed-in: only HOME + PROFILE.
            let signedInItems = CompanionActionProvider.actions(
                for: route,
                context: Self.context(for: route, roomCount: 2, active: true),
                isAuthenticated: true
            )
            #expect(signedInItems.map(\.route) == [.heroFrame, .profile], "\(route) signed-in should be tail-only")

            // Guest: HOME + SIGN-IN (the sign-in is suggested since nothing else is).
            let guestItems = CompanionActionProvider.actions(
                for: route,
                context: Self.context(for: route, roomCount: 0, active: false),
                isAuthenticated: false
            )
            #expect(guestItems.count == 2, "\(route) guest should be tail-only")
            #expect(guestItems.first?.route == .heroFrame)
            #expect(guestItems.last?.analyticsId == "sign_in")
            #expect(guestItems.last?.isSuggested == true)
        }
    }

    /// The "Keep scanning?" panel is the shortest variant the provider can
    /// build. That is a geometry fact, not a copy fact: a two-row panel floats
    /// its header — the ✕ and `?` — roughly 180pt further down the screen than
    /// a five-row one, and on the scanFlow fallback (the manual-room form) that
    /// lands the ✕ directly on top of the form's "Doors" stepper. The overlay's
    /// enlarged header hit targets are sized against that collision, so pin
    /// both the title and the row count: adding a scanFlow row, or renaming the
    /// panel, moves the header and must be a deliberate, visible change.
    @Test
    func scanFlowIsTheShortestPanelVariantAndKeepsItsTitle() {
        let route = AppRoute.scanFlow(reason: .fresh)
        let ctx = Self.context(for: route, roomCount: 2, active: false)

        #expect(CompanionActionProvider.panelTitle(for: route, context: ctx) == "Keep scanning?")

        let rows = CompanionActionProvider.actions(for: route, context: ctx, isAuthenticated: true)
        #expect(rows.count == 2)

        for other in Self.allRoutes {
            let otherRows = CompanionActionProvider.actions(
                for: other,
                context: Self.context(for: other, roomCount: 2, active: false),
                isAuthenticated: true
            )
            #expect(otherRows.count >= rows.count, "\(other) renders a shorter panel than scanFlow")
        }
    }

    @Test
    func guestSignInIsNotDoubleSuggestedWhenAScreenRowIsSuggested() {
        // On a screen with a suggested screen row, the guest sign-in tail must
        // NOT also be suggested (the historical double-suggestion bug).
        let ctx = Self.context(for: .table, roomCount: 2, active: false)
        let items = CompanionActionProvider.actions(for: .table, context: ctx, isAuthenticated: false)
        let signIn = items.first { $0.analyticsId == "sign_in" }
        #expect(signIn != nil)
        #expect(signIn?.isSuggested == false)
        #expect(items.filter(\.isSuggested).count == 1)
    }

    // MARK: - Pinned exemplars

    @Test
    func heroFrameSignedInWithRoomsExemplar() {
        // No "Your studio": signed-in is no longer enough for that door — this
        // context has no resolved tier, which reads as `.discovering` (U20).
        // No "Add another space" and no quiz row either: home is the fixed
        // priority list now, and scanning lives atop Your Spaces.
        let ctx = Self.context(for: .heroFrame, roomCount: 2, active: false)
        let labels = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true).map(\.label)
        #expect(labels == [
            "Your recommendations",
            "Saved",
            "Your spaces",
            "Your profile"
        ])
    }

    /// The exact context that crashed the acceptance walk: `client@patina.dev`
    /// — signed in, rooms, an active project, a live designer. Seven rows fired
    /// the DEBUG cap and took the app down at the `.heroFrame` root.
    @Test
    func heroFrameWithRoomsAndALiveDesignerFitsTheCap() {
        let ctx = Self.context(
            for: .heroFrame, roomCount: 2, active: false,
            tier: .activeProject, designer: Self.liveDesigner
        )
        let labels = CompanionActionProvider.actions(
            for: .heroFrame, context: ctx, isAuthenticated: true
        ).map(\.label)
        #expect(labels == [
            "Message your designer",
            "Your studio",
            "Your recommendations",
            "Saved",
            "Your spaces",
            "Your profile"
        ])
    }

    @Test
    func proposalDetailExemplar() {
        let ctx = Self.context(for: .proposalDetail(proposalId: "proposal-1"), roomCount: 2, active: false)
        let labels = CompanionActionProvider.actions(
            for: .proposalDetail(proposalId: "proposal-1"), context: ctx, isAuthenticated: true
        ).map(\.label)
        #expect(labels == [
            "Questions? Message your designer",
            "See what's been billed",
            "All proposals",
            "Home",
            "Your profile"
        ])
    }

    @Test
    func roomProjectExemplar() {
        let ctx = Self.context(for: .roomProject(roomId: Self.sampleRoomId), roomCount: 2, active: false)
        let labels = CompanionActionProvider.actions(
            for: .roomProject(roomId: Self.sampleRoomId), context: ctx, isAuthenticated: true
        ).map(\.label)
        #expect(labels == [
            "See recommendations",
            "Saved in this room",
            "Get design help",
            "Rescan room",
            "Home",
            "Your profile"
        ])
    }

}

// A second suite rather than more tests in the one above: the matrix struct is
// already near SwiftLint's `type_body_length` ceiling, and the gate fails a
// touched file that gains a warning. Fixtures are shared via `Fixture`.
//
// `@MainActor` for the same reason as the suite above — `AppRoute`'s synthesized
// conformances are main-actor-isolated under the app target's default isolation.
@MainActor
struct CompanionTierAndFreshnessTests {

    private typealias Fixture = CompanionActionMatrixTests

    // MARK: - Engagement tier gating (U20)

    private static func homeLabels(
        roomCount: Int,
        tier: EngagementTier?,
        signedIn: Bool = true
    ) -> [String] {
        let ctx = Fixture.context(for: .heroFrame, roomCount: roomCount, active: false, tier: tier)
        return CompanionActionProvider.actions(
            for: .heroFrame, context: ctx, isAuthenticated: signedIn
        ).map(\.label)
    }

    @Test
    func heroFrameEngagedWithRoomsExemplar() {
        // The signed-in-with-rooms exemplar in the matrix suite, at `.engaged`:
        // the same menu plus the Studio door.
        let ctx = Fixture.context(for: .heroFrame, roomCount: 2, active: false, tier: .engaged)
        let labels = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true).map(\.label)
        #expect(labels == [
            "Your studio",
            "Your recommendations",
            "Saved",
            "Your spaces",
            "Your profile"
        ])
    }

    @Test
    func homeStudioRowHiddenAtDiscovering() {
        // Signed in, but nothing behind the door yet — in BOTH home arms.
        for roomCount in [0, 2] {
            #expect(!Self.homeLabels(roomCount: roomCount, tier: .discovering).contains("Your studio"))
        }
    }

    @Test
    func homeStudioRowShownAtEngaged() {
        for roomCount in [0, 2] {
            for tier in [EngagementTier.engaged, .activeProject] {
                #expect(
                    Self.homeLabels(roomCount: roomCount, tier: tier).contains("Your studio"),
                    "rooms=\(roomCount) tier=\(tier) should offer the Studio door"
                )
            }
        }
    }

    @Test
    func homeStudioRowHiddenWhenTierUnknown() {
        // An unresolved tier must fail closed — never open the door on a guess.
        for roomCount in [0, 2] {
            #expect(!Self.homeLabels(roomCount: roomCount, tier: nil).contains("Your studio"))
        }
    }

    @Test
    func rowCapHoldsAcrossTierVariants() {
        let routes: [AppRoute] = [.heroFrame, .table, .emergence(pieceId: nil)]
        let tiers: [EngagementTier?] = [nil, .discovering, .engaged, .activeProject]
        for route in routes {
            for tier in tiers {
                for signedIn in [true, false] {
                    for roomCount in [0, 2] {
                        for active in [true, false] {
                            let ctx = Fixture.context(
                                for: route, roomCount: roomCount, active: active, tier: tier
                            )
                            let items = CompanionActionProvider.actions(
                                for: route, context: ctx, isAuthenticated: signedIn
                            )
                            #expect(
                                items.count <= 6,
                                "\(route) tier=\(String(describing: tier)) produced \(items.count) rows"
                            )
                            #expect(
                                items.filter(\.isSuggested).count <= 1,
                                "\(route) tier=\(String(describing: tier)) has >1 suggested row"
                            )
                        }
                    }
                }
            }
        }
    }

    // MARK: - Nudges

    @Test
    func noNudgeExistsForScanFlow() {
        // Mid-capture the Companion must not dangle an exit in front of the
        // user; the scan surfaces own the screen.
        for reason in [ScanReason.fresh, .rescan, .fromConversation] {
            let route = AppRoute.scanFlow(reason: reason)
            let ctx = Fixture.context(for: route, roomCount: 2, active: false)
            #expect(CompanionActionProvider.nudge(for: route, context: ctx) == nil, "\(route) offered a nudge")
        }
    }

    // MARK: - Style-profile freshness (U42)

    @Test
    func noRowTellsAFinishedQuizTakerToTakeTheQuiz() {
        for route in Fixture.allRoutes {
            for signedIn in [true, false] {
                for roomCount in [0, 2] {
                    let ctx = Fixture.context(
                        for: route, roomCount: roomCount, active: false, hasStyleProfile: true
                    )
                    let items = CompanionActionProvider.actions(
                        for: route, context: ctx, isAuthenticated: signedIn
                    )
                    #expect(
                        !items.contains { $0.hint == "Take the quiz first" },
                        "\(route) still says \"Take the quiz first\" after the quiz"
                    )
                    #expect(
                        !items.contains { $0.hint == "Discover your style" },
                        "\(route) still says \"Discover your style\" after the quiz"
                    )
                }
            }
        }
    }

    /// Home no longer carries a quiz row — it was the lowest-priority row and
    /// the cap took it (the quiz keeps its Daily Room card, the
    /// empty-recommendations CTA, and the Profile menu). The hint on the
    /// recommendations row still tells the truth about the quiz.
    @Test
    func quizlessHomeStillNamesTheQuizInTheRecommendationHint() {
        let ctx = Fixture.context(for: .heroFrame, roomCount: 0, active: false, hasStyleProfile: false)
        let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(items.contains { $0.analyticsId == "recommendations" && $0.hint == "Take the quiz first" })
        #expect(!items.contains { $0.analyticsId == "style_quiz" })
    }

    @Test
    func finishedQuizSwapsTheHomeRecommendationHint() {
        let ctx = Fixture.context(for: .heroFrame, roomCount: 0, active: false, hasStyleProfile: true)
        let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(items.contains { $0.analyticsId == "recommendations" && $0.hint == "Pieces for your style" })
    }

    @Test
    func roomsOutrankTheStyleProfileInTheRecommendationHint() {
        let ctx = Fixture.context(for: .heroFrame, roomCount: 2, active: false, hasStyleProfile: true)
        let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(items.contains { $0.analyticsId == "recommendations" && $0.hint == "Based on your rooms" })
    }

    // MARK: - AR quick action retirement (W1b SP-18 residual)

    @Test
    func tryInRoomRowNeverAppearsOnPieceDetailOrEmergence() {
        // The Companion's AR quick action dead-ends on every product while
        // usdz_url is NULL (carry-over, W1b SP-18 residual). It returns the
        // day an AR asset pipeline exists (build-plan.md W2 R3).
        let screens: [AppRoute] = [
            .pieceDetail(pieceId: "piece-1"),
            .emergence(pieceId: nil),
            .roomEmergence(roomId: UUID())
        ]
        for screen in screens {
            let ctx = Fixture.context(for: screen, roomCount: 1, active: false, tier: .discovering)
            let ids = CompanionActionProvider.actions(
                for: screen, context: ctx, isAuthenticated: true
            ).map(\.analyticsId)
            #expect(!ids.contains("try_in_room"), "\(screen) still offers the dead-ended AR row")
        }
    }

    // MARK: - SP-12: the Saved door opens at zero

    /// The Companion's `Saved` row is the only route to the Saved screen
    /// anywhere in the app. Gated on a non-zero count, a reader with nothing
    /// saved could never reach the screen that teaches them what saving is
    /// for.
    @Test
    func savedRowDrawsWithNothingSaved() {
        var ctx = Fixture.context(for: .heroFrame, roomCount: 2, active: false)
        ctx.tableItemCount = 0
        let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        let saved = items.first { $0.analyticsId == "collections" }
        #expect(saved?.label == "Saved")
        #expect(saved?.hint == "Nothing saved yet")
        #expect(saved?.route == .table)
    }

    @Test
    func savedRowCountsWhatIsSaved() {
        var ctx = Fixture.context(for: .heroFrame, roomCount: 2, active: false)
        ctx.tableItemCount = 1
        let one = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(one.first { $0.analyticsId == "collections" }?.hint == "1 saved piece")

        ctx.tableItemCount = 4
        let many = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(many.first { $0.analyticsId == "collections" }?.hint == "4 saved pieces")
    }

    /// SP-12: Saved opened on `Boards` while the piece just saved sat one tab
    /// over under `All items`.
    @Test
    func savedDefaultsToTheTabHoldingThePieces() {
        #expect(CollectionsViewModel.defaultTab(boardCount: 0) == "All items")
        #expect(CollectionsViewModel.defaultTab(boardCount: 2) == "Boards")
    }
}

// A third suite for the same type-body-length reason as the second: the home
// menu is the one menu whose row set moves with five independent inputs, and it
// is where the ≤6 invariant actually broke, so it gets its own exhaustive grid.
//
// `@MainActor` for the same reason as the suites above.
@MainActor
struct CompanionHomeMenuMatrixTests {

    private typealias Fixture = CompanionActionMatrixTests

    /// The home menu's priority ladder (C8). A row's rank is its slot in the
    /// list the builder composes; the tail shares the last rank. The menu must
    /// read in strictly increasing rank order, which is also the order rows are
    /// dropped from the bottom if the cap is ever pressed.
    private static func rank(_ item: CompanionActionItem) -> Int? {
        switch item.analyticsId {
        case "message_designer": return 1
        case "design_request", "your_studio": return 2
        case "recommendations": return 3
        case "collections": return 4
        case "your_spaces", "scan": return 5
        case "profile", "sign_in": return 6
        default: return nil
        }
    }

    /// rooms × designer × request × tier × saved × signed-in — the whole input
    /// space of `homeItems`, not a sample of it.
    private static func everyHomeContext(
        _ body: (_ ctx: CompanionContext, _ signedIn: Bool, _ items: [CompanionActionItem]) -> Void
    ) {
        let designers: [DesignerRelationship?] = [
            nil,
            DesignerRelationship.none,
            .roster(designerId: UUID()),
            .lead(leadId: UUID(), designerId: UUID(), studioName: "Hartwell Studio"),
            .project(projectId: UUID(), designerId: UUID(), studioName: nil)
        ]
        let tiers: [EngagementTier?] = [nil, .discovering, .engaged, .activeProject]
        for roomCount in [0, 1, 3] {
            for designer in designers {
                for active in [true, false] {
                    for tier in tiers {
                        for savedCount in [0, 1, 4] {
                            for signedIn in [true, false] {
                                var ctx = Fixture.context(
                                    for: .heroFrame, roomCount: roomCount, active: active,
                                    tier: tier, designer: designer
                                )
                                ctx.tableItemCount = savedCount
                                let items = CompanionActionProvider.actions(
                                    for: .heroFrame, context: ctx, isAuthenticated: signedIn
                                )
                                body(ctx, signedIn, items)
                            }
                        }
                    }
                }
            }
        }
    }

    private static func describe(_ ctx: CompanionContext, _ signedIn: Bool, _ items: [CompanionActionItem]) -> String {
        "rooms=\(ctx.roomCount) designer=\(String(describing: ctx.designerRelationship)) "
            + "request=\(ctx.activeDesignRequest != nil) tier=\(String(describing: ctx.engagementTier)) "
            + "saved=\(ctx.tableItemCount) signedIn=\(signedIn) → \(items.map(\.label))"
    }

    @Test
    func everyHomeMenuFitsSixRowsIncludingTail() {
        Self.everyHomeContext { ctx, signedIn, items in
            #expect(items.count <= 6, "\(items.count) rows: \(Self.describe(ctx, signedIn, items))")
        }
    }

    @Test
    func everyHomeMenuReadsInPriorityOrder() {
        Self.everyHomeContext { ctx, signedIn, items in
            let ranks = items.map { Self.rank($0) }
            #expect(!ranks.contains(nil), "unranked row: \(Self.describe(ctx, signedIn, items))")
            let known = ranks.compactMap { $0 }
            #expect(known == known.sorted(), "out of priority order: \(Self.describe(ctx, signedIn, items))")
            #expect(Set(known).count == known.count, "two rows share a rank: \(Self.describe(ctx, signedIn, items))")
        }
    }

    @Test
    func everyHomeMenuKeepsTheSavedDoorAndExactlyOneSpacesRow() {
        Self.everyHomeContext { ctx, signedIn, items in
            // SP-12: the Saved row is unconditional.
            #expect(
                items.contains { $0.analyticsId == "collections" },
                "no Saved row: \(Self.describe(ctx, signedIn, items))"
            )
            // The scan folds INTO the spaces row at zero rooms — one row, never two.
            let spaces = items.filter { row in
                row.analyticsId == "your_spaces" || row.analyticsId == "scan"
            }
            let dump = "spaces=" + spaces.map { "\($0.analyticsId)/\($0.label)" }.joined(separator: ", ")
                + " all=" + items.map { "\($0.analyticsId)/\($0.label)" }.joined(separator: " | ")
            #expect(spaces.count == 1, Comment(rawValue: dump))
            if ctx.roomCount == 0 {
                #expect(spaces.map(\.label) == ["Add your first space"], Comment(rawValue: dump))
                #expect(spaces.compactMap(\.route) == [AppRoute.scanFlow(reason: .fresh)], Comment(rawValue: dump))
            } else {
                #expect(spaces.compactMap(\.route) == [AppRoute.yourSpaces], Comment(rawValue: dump))
            }
        }
    }

    @Test
    func everyHomeMenuOffersTheMessageRowExactlyWhenADesignerIsOnTheJob() {
        Self.everyHomeContext { ctx, signedIn, items in
            let hasMessageRow = items.contains { $0.analyticsId == "message_designer" }
            let isLive = ctx.designerRelationship?.isLive ?? false
            #expect(hasMessageRow == isLive, "message row=\(hasMessageRow): \(Self.describe(ctx, signedIn, items))")
        }
    }

    @Test
    func everyHomeMenuSuggestsExactlyOneRow() {
        Self.everyHomeContext { ctx, signedIn, items in
            let suggested = items.filter(\.isSuggested).count
            #expect(suggested == 1, "\(suggested) suggested: \(Self.describe(ctx, signedIn, items))")
        }
    }
}
