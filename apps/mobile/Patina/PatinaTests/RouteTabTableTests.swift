//
//  RouteTabTableTests.swift
//  PatinaTests
//
//  B-1/B-7: every `AppRoute` case names its tab, every tab names the
//  destination it opens, and the four VoiceOver labels are the canonical names
//  in full — not the shortened words printed on the bar.
//

import Foundation
import Testing
@testable import Patina

struct RouteTabTableTests {

    // MARK: - Fixtures

    private static let roomId = UUID()

    private static let style = StyleProfileResult(
        primaryStyle: "modern",
        secondaryStyle: nil,
        primaryMaterial: "oak",
        paletteWarmth: "warm",
        budgetLabel: "mid",
        budgetMin: 100,
        budgetMax: 200,
        confidence: 0.9
    )

    /// Every `AppRoute` case with the tab it belongs to. All 34, by hand.
    /// `tab(for:)` is exhaustive with no `default:`, so a route added later
    /// fails compilation there first — this list then fails to be exhaustive
    /// in review, which is why `everyRouteCaseIsCovered` counts it.
    private static let expected: [(AppRoute, PatinaTab)] = [
        (.heroFrame, .today),

        (.yourSpaces, .spaces),
        (.roomProject(roomId: roomId), .spaces),
        (.roomSettings(roomId: roomId), .spaces),
        (.crossRoom, .spaces),
        (.manualRoomEntry, .spaces),
        (.roomSavedItems(roomId: roomId), .spaces),
        (.roomEmergence(roomId: roomId), .spaces),
        (.scanFlow(reason: .fresh), .spaces),
        (.scanFlow(reason: .rescan), .spaces),
        (.scanFlow(reason: .fromConversation), .spaces),
        (.arPlacement(productId: "piece-1"), .spaces),

        (.emergence(pieceId: nil), .pieces),
        (.emergence(pieceId: "piece-1"), .pieces),
        (.table, .pieces),
        (.pieceDetail(pieceId: "piece-1"), .pieces),
        (.styleQuiz, .pieces),
        (.styleResult(result: style), .pieces),

        (.studio, .projects),
        (.profile, .projects),
        (.notifications, .projects),
        (.designerConsultation, .projects),
        (.designRequests(focusLeadId: nil), .projects),
        (.projectList, .projects),
        (.projectDetail(projectId: "project-1"), .projects),
        (.decisionList, .projects),
        (.decisionDetail(decisionId: "decision-1"), .projects),
        (.threadList, .projects),
        (.threadDetail(threadId: "thread-1"), .projects),
        (.proposalList, .projects),
        (.proposalDetail(proposalId: "proposal-1"), .projects),
        (.invoiceList, .projects),
        (.invoiceDetail(invoiceId: "invoice-1"), .projects),
        (.budget, .projects),
        (.documentList, .projects),
        (.orderList, .projects),
        (.orderDetail(orderId: "fulfillment:order-1"), .projects)
    ]

    // MARK: - The table

    @Test
    func everyRouteNamesItsTab() {
        for (route, tab) in Self.expected {
            #expect(
                RouteTabTable.tab(for: route) == tab,
                "\(route.displayName) should belong to \(tab.title)"
            )
        }
    }

    @Test
    func everyRouteCaseIsCovered() {
        // 34 `AppRoute` cases — 31, plus `.studio` (minted in W3-fix so the
        // Studio tab stops reporting Profile's screen name), plus W5's
        // `.orderList` and `.orderDetail`. `.emergence` appears twice (both
        // payload shapes) and `.scanFlow` three times (every reason), so 37
        // rows in all. The steward's inventory tallies Today 1 · Spaces 8 ·
        // Pieces 6 · Studio 16 over distinct cases at the base sha; Studio is
        // 19 now, and the Spaces count here is 11 because scanFlow's three
        // reasons and arPlacement are each pinned.
        #expect(Self.expected.count == 37)
        let today = Self.expected.filter { $0.1 == .today }.count
        let spaces = Self.expected.filter { $0.1 == .spaces }.count
        let pieces = Self.expected.filter { $0.1 == .pieces }.count
        let studio = Self.expected.filter { $0.1 == .projects }.count
        #expect(today == 1)
        #expect(spaces == 11)
        #expect(pieces == 6)
        #expect(studio == 19)
    }

    /// A new `AppRoute` case must fail to compile in `tab(for:)`, not fall
    /// through onto Today. Only a `default:` arm could make that happen.
    @Test
    func theTableHasNoDefaultArm() throws {
        let source = try SourcePin.read("Patina/Features/Navigation/RouteTabTable.swift")
        #expect(
            !SourceScan.code(in: source).contains("default:"),
            "RouteTabTable must stay exhaustive — a `default:` lets a new route fall through"
        )
    }

    // MARK: - Tab roots

    @Test
    func eachTabNamesItsRootRoute() {
        #expect(RouteTabTable.rootRoute(for: .today) == .heroFrame)
        #expect(RouteTabTable.rootRoute(for: .spaces) == .yourSpaces)
        #expect(RouteTabTable.rootRoute(for: .pieces) == .emergence(pieceId: nil))
        #expect(RouteTabTable.rootRoute(for: .projects) == .studio)
    }

    @Test
    func aTabsRootRouteBelongsToThatTab() {
        for tab in PatinaTab.allCases {
            #expect(RouteTabTable.tab(for: RouteTabTable.rootRoute(for: tab)) == tab)
        }
    }

    @Test
    func onlyTheFourRootsAreTabRoots() {
        #expect(RouteTabTable.isTabRoot(.heroFrame))
        #expect(RouteTabTable.isTabRoot(.yourSpaces))
        #expect(RouteTabTable.isTabRoot(.emergence(pieceId: nil)))
        #expect(RouteTabTable.isTabRoot(.studio))

        // A piece is not the browse root, even though it shares the case.
        #expect(!RouteTabTable.isTabRoot(.emergence(pieceId: "piece-1")))
        // R2: `.profile` was the Studio tab's stand-in root for one wave. It is
        // a pushed screen again — the same composition under its own name — so
        // a link to it must push rather than pop the tab it lands on.
        #expect(!RouteTabTable.isTabRoot(.profile))
        #expect(!RouteTabTable.isTabRoot(.table))
        #expect(!RouteTabTable.isTabRoot(.invoiceDetail(invoiceId: "invoice-1")))
        #expect(!RouteTabTable.isTabRoot(.roomProject(roomId: Self.roomId)))
    }

    // MARK: - B-7 names

    @Test
    func theBarPrintsTheShortLabels() {
        #expect(PatinaTab.allCases.map(\.title) == ["Today", "Spaces", "Pieces", "Projects"])
    }

    @Test
    func voiceOverSpeaksTheCanonicalNameInFull() {
        // B-7 (a): a tab's VoiceOver label cannot be two canonical names at
        // once, so it is the destination's own name — "Your Spaces", not
        // "Spaces". B-7 (c) retires "Daily Room" in favour of "Today".
        #expect(PatinaTab.today.canonicalName == "Today")
        #expect(PatinaTab.spaces.canonicalName == "Your Spaces")
        #expect(PatinaTab.pieces.canonicalName == "Browse pieces")
        #expect(PatinaTab.projects.canonicalName == "Your Projects")
    }

    @Test
    func savedIsNotATab() {
        // B-7 (b): Saved stays its own canonical surface behind a labelled row
        // on the Pieces tab — it never becomes a tab or shares one's label.
        #expect(!PatinaTab.allCases.map(\.canonicalName).contains("Saved"))
        #expect(RouteTabTable.tab(for: .table) == .pieces)
        #expect(!RouteTabTable.isTabRoot(.table))
    }

    @Test
    func theBarIsFourTabsInOrder() {
        #expect(PatinaTab.allCases == [.today, .spaces, .pieces, .projects])
    }

    // MARK: - Push notifications land on the right tab

    @Test
    func everyPushEntityTypeLandsOnItsTab() {
        let cases: [(String, PatinaTab)] = [
            ("project", .projects),
            ("proposal", .projects),
            ("decision", .projects),
            ("invoice", .projects),
            ("design_request", .projects),
            ("lead", .projects),
            ("thread", .projects),
            ("message_thread", .projects),
            ("product", .pieces),
            ("piece", .pieces)
        ]
        for (entity, tab) in cases {
            let route = NotificationRouter.route(forEntityType: entity, entityId: "id-1")
            #expect(route.map(RouteTabTable.tab(for:)) == tab, "\(entity) should open \(tab.title)")
        }
    }

    @Test
    func aRoomPushLandsOnSpaces() {
        let route = NotificationRouter.route(forEntityType: "room", entityId: Self.roomId.uuidString)
        #expect(route.map(RouteTabTable.tab(for:)) == .spaces)
    }

    @Test
    func noPushEverLandsOnToday() {
        // Today has nothing addressable on it — every push names a thing.
        let entities = [
            "project", "proposal", "decision", "invoice", "design_request",
            "lead", "thread", "message_thread", "product", "piece"
        ]
        for entity in entities {
            let route = NotificationRouter.route(forEntityType: entity, entityId: "id-1")
            #expect(route.map(RouteTabTable.tab(for:)) != .today)
        }
    }

    // MARK: - Universal links land on the right tab

    @MainActor
    @Test
    func everyUniversalLinkLandsOnItsTab() throws {
        let host = PatinaDeepLinks.clientHost
        // W1-C-12: `pieces` is deliberately absent. AASA publishes `/piece/*`
        // only and client-portal serves `/piece`; the plural alias claimed a
        // path the app could never be handed, and the app is now exactly the
        // set of paths the association carries.
        let cases: [(String, PatinaTab)] = [
            ("piece", .pieces),
            ("invoices", .projects),
            ("invoice", .projects),
            ("proposals", .projects),
            ("proposal", .projects),
            ("decisions", .projects),
            ("decision", .projects)
        ]
        for (segment, tab) in cases {
            let url = try #require(URL(string: "https://\(host)/\(segment)/abc-123"))
            let route = try #require(DeepLinkHandler.route(forUniversalLink: url))
            #expect(RouteTabTable.tab(for: route) == tab, "/\(segment)/ should open \(tab.title)")
        }
    }

    @MainActor
    @Test
    func aCustomSchemePieceLinkLandsOnPieces() {
        #expect(RouteTabTable.tab(for: .pieceDetail(pieceId: "abc")) == .pieces)
    }
}
