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
        hasStyleProfile: Bool = false
    ) -> CompanionContext {
        // A viewing piece is supplied so the "Try in your room" arm on discovery
        // screens is exercised (the fuller menu). tableItemCount > 0 so the
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
        // `engagementTier` is assigned rather than passed: its type is internal,
        // so it cannot appear in the public memberwise initializer.
        context.engagementTier = tier
        return context
    }

    /// The full combination grid the matrix must hold across. The tier is
    /// derived from the axes already present rather than adding a fourth one —
    /// an active request means engaged, a plain signed-in user is discovering,
    /// and a guest has no resolved tier at all.
    private static func everyCombination(
        _ body: (_ route: AppRoute, _ signedIn: Bool, _ items: [CompanionActionItem]) -> Void
    ) {
        for route in allRoutes {
            for signedIn in [true, false] {
                for roomCount in [0, 2] {
                    for active in [true, false] {
                        let tier: EngagementTier? = active ? .engaged : (signedIn ? .discovering : nil)
                        let ctx = context(
                            for: route, roomCount: roomCount, active: active, tier: tier
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
        let ctx = Self.context(for: .heroFrame, roomCount: 2, active: false)
        let labels = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true).map(\.label)
        #expect(labels == [
            "Your recommendations",
            "Your spaces",
            "Add another space",
            "Saved",
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
            "See your budget",
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
            "Your recommendations",
            "Your spaces",
            "Add another space",
            "Saved",
            "Your studio",
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

    @Test
    func quizlessHomeStillPointsAtTheQuiz() {
        let ctx = Fixture.context(for: .heroFrame, roomCount: 0, active: false, hasStyleProfile: false)
        let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(items.contains { $0.label == "Style quiz" && $0.hint == "Discover your style" })
        #expect(items.contains { $0.analyticsId == "recommendations" && $0.hint == "Take the quiz first" })
    }

    @Test
    func finishedQuizSwapsTheHomeQuizRowAndRecommendationHint() {
        let ctx = Fixture.context(for: .heroFrame, roomCount: 0, active: false, hasStyleProfile: true)
        let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(items.contains { $0.label == "Retake the quiz" && $0.hint == "Refine your style" })
        #expect(items.contains { $0.analyticsId == "recommendations" && $0.hint == "Pieces for your style" })
    }

    @Test
    func roomsOutrankTheStyleProfileInTheRecommendationHint() {
        let ctx = Fixture.context(for: .heroFrame, roomCount: 2, active: false, hasStyleProfile: true)
        let items = CompanionActionProvider.actions(for: .heroFrame, context: ctx, isAuthenticated: true)
        #expect(items.contains { $0.analyticsId == "recommendations" && $0.hint == "Based on your rooms" })
    }
}
