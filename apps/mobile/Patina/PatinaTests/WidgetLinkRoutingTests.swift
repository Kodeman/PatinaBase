//
//  WidgetLinkRoutingTests.swift
//  PatinaTests
//
//  W6 — the widget's two doors, and where they land.
//
//  `patina://today` opens M1 plain (M6d). `patina://record/<rowId>` opens the
//  row the widget named, resolved against the record the app itself wrote —
//  the widget carries an id, never a route, so the route vocabulary lives in
//  exactly one place.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct WidgetLinkRoutingTests {

    // MARK: - Fixtures

    private static let roomId = UUID()
    private static let moment = Date(timeIntervalSince1970: 1_787_000_000)

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

    /// Every `AppRoute` case, so the widget's door is proven against the whole
    /// of `RouteTabTable` rather than the handful of routes a record emits
    /// today. `tab(for:)` has no `default:`, so a route added later fails
    /// compilation there first and this list fails to be exhaustive next.
    private static let everyRoute: [AppRoute] = [
        .heroFrame,
        .yourSpaces,
        .roomProject(roomId: roomId),
        .roomSettings(roomId: roomId),
        .crossRoom,
        .manualRoomEntry,
        .roomSavedItems(roomId: roomId),
        .roomEmergence(roomId: roomId),
        .scanFlow(reason: .fresh),
        .scanFlow(reason: .rescan),
        .scanFlow(reason: .fromConversation),
        .arPlacement(productId: "piece-1"),
        .emergence(pieceId: nil),
        .emergence(pieceId: "piece-1"),
        .table,
        .pieceDetail(pieceId: "piece-1"),
        .styleQuiz,
        .styleResult(result: style),
        .studio,
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
        .documentList,
        .orderList,
        .orderDetail(orderId: "direct:order-1")
    ]

    private static func row(id: String, route: AppRoute?) -> HouseRecordRow {
        HouseRecordRow(
            id: id, kind: .orderMoved, title: "Your sectional shipped.",
            detail: nil, date: moment, state: .none, isNew: false, route: route
        )
    }

    private static func record(moved: [HouseRecordRow], needsYou: [HouseRecordRow] = []) -> HouseRecord {
        HouseRecord(
            needsYou: needsYou, moved: moved,
            window: DateInterval(start: moment.addingTimeInterval(-604_800), end: moment),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    private func route(_ string: String, in record: HouseRecord? = nil) -> AppRoute? {
        guard let url = URL(string: string) else { return nil }
        return DeepLinkHandler.route(forWidgetLink: url, in: record)
    }

    // MARK: - The plain door (M6d)

    @Test("patina://today opens the Record, plain")
    func todayOpensTheRecord() {
        #expect(route("patina://today") == .heroFrame)
        // The Home Screen widget's own URL is that one, so the mock's ruling
        // and the parser cannot drift apart.
        #expect(route(PatinaWidgetLinks.today.absoluteString) == .heroFrame)
    }

    @Test("the plain door lands on Today and pops it to root")
    func todayLandsOnTheTodayTab() throws {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.openExternal(.invoiceDetail(invoiceId: "invoice-1"))
        #expect(coordinator.tabs.selected == .studio)

        coordinator.openExternal(try #require(route("patina://today")))

        #expect(coordinator.tabs.selected == .today)
        #expect(coordinator.tabs.stack(for: .today).isEmpty)
    }

    // MARK: - The row's door

    @Test("a row id resolves to that row's own route")
    func aRowIdResolvesToItsRoute() {
        let record = Self.record(moved: [
            Self.row(id: "order:direct:abc", route: .orderDetail(orderId: "direct:abc")),
            Self.row(id: "thread:t1", route: .threadDetail(threadId: "t1"))
        ])

        #expect(route("patina://record/order:direct:abc", in: record) == .orderDetail(orderId: "direct:abc"))
        #expect(route("patina://record/thread:t1", in: record) == .threadDetail(threadId: "t1"))
    }

    /// The record's own link builder and the app's parser are two halves of one
    /// contract; both are compiled here, so the round trip is pinned in place.
    @Test("the URL the widget builds is the URL the app parses")
    func theLinkRoundTrips() {
        let record = Self.record(moved: [
            Self.row(id: "order:direct:abc", route: .orderDetail(orderId: "direct:abc"))
        ])
        let widgetRow = HouseWidgetPayloadRow(id: "order:direct:abc", title: "Shipped.", date: Self.moment)

        let url = PatinaWidgetLinks.link(for: widgetRow)
        #expect(DeepLinkHandler.route(forWidgetLink: url, in: record) == .orderDetail(orderId: "direct:abc"))
    }

    /// A tap must never dead-end and never land somewhere the widget did not
    /// name. Today, plain, is the honest answer to every miss.
    @Test("an unknown id, a routeless row, or no snapshot all open Today")
    func everyMissOpensTodayPlain() {
        let record = Self.record(moved: [Self.row(id: "story:s1", route: nil)])

        #expect(route("patina://record/story:s1", in: record) == .heroFrame)
        #expect(route("patina://record/nothing-like-it", in: record) == .heroFrame)
        #expect(route("patina://record/story:s1", in: nil) == .heroFrame)
        #expect(route("patina://record/", in: record) == .heroFrame)
        #expect(route("patina://record", in: record) == .heroFrame)
    }

    @Test("a foreign scheme and an unknown host are not routed")
    func onlyTheAppsOwnSchemeAndHostsAreHonoured() {
        #expect(route("evil://today") == nil)
        #expect(route("https://client.patina.cloud/today") == nil)
        #expect(route("patina://elsewhere") == nil)
        #expect(route("patina://auth") == nil)
    }

    // MARK: - Where every route lands (RouteTabTable, exhaustive)

    @Test("every route a record row can carry lands on that route's own tab")
    func everyRouteLandsOnItsTab() {
        #expect(Self.everyRoute.count == 37, "one entry per AppRoute case")

        for expected in Self.everyRoute {
            let record = Self.record(moved: [Self.row(id: "row-1", route: expected)])
            guard let resolved = route("patina://record/row-1", in: record) else {
                Issue.record("\(expected) resolved to no route")
                continue
            }
            #expect(resolved == expected)

            let coordinator = AppCoordinator(houseFirstRoot: true)
            coordinator.openExternal(resolved)
            #expect(
                coordinator.tabs.selected == RouteTabTable.tab(for: expected),
                "\(expected) should open \(RouteTabTable.tab(for: expected).title)"
            )
        }
    }

    @Test("on the flag-off root the same door pushes on the single stack")
    func theFlagOffRootPushesOnOneStack() {
        let record = Self.record(moved: [
            Self.row(id: "order:direct:abc", route: .orderDetail(orderId: "direct:abc"))
        ])
        let coordinator = AppCoordinator(houseFirstRoot: false)
        guard let resolved = route("patina://record/order:direct:abc", in: record) else {
            Issue.record("the row's route did not resolve")
            return
        }
        coordinator.openExternal(resolved)

        #expect(coordinator.navigationPath.count == 1)
        #expect(coordinator.currentScreen == .orderDetail(orderId: "direct:abc"))
    }

    // MARK: - The cold doors (w3/steward.md §4)

    /// Amended by C2-21: the single `pendingDeepLink` slot on the coordinator
    /// is now `PendingLinkQueue`, a bounded persisted FIFO on the handler, and
    /// the queue takes every non-`.main` phase rather than `.launching` alone.
    /// `DeepLinkQueueTests` holds the whole mechanism; this keeps the widget's
    /// own door in the round-trip suite it belongs to.
    @Test("a widget tap during launch is queued, not dropped")
    func aTapDuringLaunchIsQueued() throws {
        let coordinator = AppCoordinator(houseFirstRoot: true)
        // A freshly built coordinator is `.launching` until the splash deadline
        // elapses and `AuthService` reports — exactly the cold-launch window a
        // widget tap arrives in.
        #expect(coordinator.phase == .launching)
        let handler = DeepLinkHandler(
            queue: PendingLinkQueue(
                defaults: UserDefaults(suiteName: "patina.tests.widgetlink.\(UUID().uuidString)") ?? .standard
            )
        )
        handler.configure(coordinator: coordinator)

        let url = try #require(URL(string: "patina://today"))
        #expect(handler.handle(url))
        #expect(handler.queuedURLs == [url])
    }

    /// The other cold door: a link that arrives before the coordinator exists
    /// at all is kept and replayed by `configure(coordinator:)`. The widget arm
    /// reaches that through the same `deliver(_:from:)` seam every other arm
    /// takes — pinned in source, because the queue is private state on a
    /// process-lifetime singleton.
    @Test("the widget arm takes the open-or-keep seam, and configure replays it")
    func theWidgetArmIsReplayedOnConfigure() throws {
        let source = try SourcePin.read("Patina/App/DeepLinking/DeepLinkHandler.swift")
        let code = SourceScan.code(in: source)

        #expect(code.contains("private func handleWidgetURL(_ url: URL) -> Bool {"))
        let arm = try #require(code.range(of: "private func handleWidgetURL"))
        let body = code[arm.lowerBound...].prefix(500)
        #expect(body.contains("return deliver(route, from: url)"))

        // One seam, and it cannot open onto a root that is not mounted.
        #expect(code.contains("guard canOpen else {"))
        #expect(code.contains("queue.enqueue(url)"))
        // `configure` replays whatever was kept.
        #expect(code.contains("drainIfPossible()"))
    }

    /// `handle` checks universal links BEFORE the custom-scheme guard and drops
    /// every other scheme after it, so the widget's hosts have to be parsed on
    /// the right side of that guard.
    @Test("the widget hosts are parsed after the scheme guard")
    func theWidgetHostsSitAfterTheSchemeGuard() throws {
        let source = try SourcePin.read("Patina/App/DeepLinking/DeepLinkHandler.swift")
        let guardIndex = try #require(source.range(of: "guard url.scheme == APIConfiguration.appURLScheme"))
        let hostIndex = try #require(source.range(of: "case Self.widgetTodayHost, Self.widgetRecordHost:"))
        #expect(guardIndex.lowerBound < hostIndex.lowerBound)
    }

    @Test("the widget's scheme is the app's scheme")
    func theSchemesAgree() {
        #expect(PatinaWidgetLinks.scheme == APIConfiguration.appURLScheme)
        #expect(PatinaWidgetLinks.todayHost == DeepLinkHandler.widgetTodayHost)
        #expect(PatinaWidgetLinks.recordHost == DeepLinkHandler.widgetRecordHost)
    }

    // MARK: - The target's own paperwork

    @Test("the widget claims the App Group, and nothing else")
    func theWidgetEntitlementsAreTheAppGroupAlone() throws {
        let plist = try SourcePin.read("PatinaWidget/PatinaWidget.entitlements")
        #expect(plist.contains("com.apple.security.application-groups"))
        #expect(plist.contains("group.cloud.patina.app"))
        #expect(!plist.contains("aps-environment"))
        #expect(!plist.contains("associated-domains"))
        #expect(!plist.contains("applesignin"))
    }

    @Test("the widget declares the WidgetKit extension point")
    func theWidgetDeclaresItsExtensionPoint() throws {
        let plist = try SourcePin.read("PatinaWidget/Info.plist")
        #expect(plist.contains("NSExtensionPointIdentifier"))
        #expect(plist.contains("com.apple.widgetkit-extension"))
    }

    /// The kind string is a contract with the app-side reload
    /// (`WidgetCenter.shared.reloadTimelines(ofKind:)`).
    @Test("the widget kind is the one the app reloads")
    func theWidgetKindIsPinned() throws {
        let source = try SourcePin.read("PatinaWidget/HouseWidget.swift")
        #expect(source.contains("static let kind = \"PatinaHouseWidget\""))
    }
}
