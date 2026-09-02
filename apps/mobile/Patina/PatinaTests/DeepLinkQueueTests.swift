//
//  DeepLinkQueueTests.swift
//  PatinaTests
//
//  W1 · L1-F's keystone. Three findings live here and they are one mechanism:
//
//   • C2-02 — a universal link arriving before `configure(coordinator:)` was
//     dropped and `handle` still returned `true`.
//   • C2-21 — only `.launching` queued, the drain was gated on `.main`, and the
//     queue held exactly one URL.
//   • GAP7B-09 — a link tapped while signed out never arrived, not even after
//     signing in, because nothing survived the process and nothing said so.
//
//  The rule the suite exists to hold: a link is opened, or it is queued, or
//  `handle` returns false. There is no fourth outcome, and "reported handled
//  and thrown away" is the one that shipped.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct DeepLinkQueueTests {

    private static let proposal = "https://client.patina.cloud/proposals/b0000000-0000-0000-0000-000000000002"
    private static let invoice = "https://client.patina.cloud/invoices/b0000000-0000-0000-0000-00000000e142"
    private static let decision = "https://client.patina.cloud/decisions/b0000000-0000-0000-0000-0000000000d3"

    /// A queue on its own defaults domain, so suites cannot see each other's
    /// entries and a developer's simulator is never the fixture.
    private func queue(now: Date = Date(timeIntervalSince1970: 1_787_000_000)) -> PendingLinkQueue {
        let suite = "patina.tests.deeplink.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        return PendingLinkQueue(defaults: defaults)
    }

    private func url(_ string: String) throws -> URL {
        try #require(URL(string: string))
    }

    // MARK: - C2-02 — the cold window, before the coordinator exists

    @Test("a universal link arriving before configure is stashed, not dropped")
    func aLinkArrivingBeforeConfigureIsStashed() throws {
        let handler = DeepLinkHandler(queue: queue())
        let link = try url(Self.proposal)

        // No coordinator: `configure` runs from ContentView's `.onAppear`,
        // which is strictly after `.onOpenURL` can first fire.
        #expect(handler.handle(link))
        #expect(handler.queuedURLs == [link])

        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.forcePhaseForTesting(.main)
        handler.configure(coordinator: coordinator)

        #expect(handler.queuedURLs.isEmpty)
        #expect(coordinator.currentScreen == .proposalDetail(proposalId: "b0000000-0000-0000-0000-000000000002"))
    }

    @Test("handle returns false for a link it cannot route, and queues nothing")
    func anUnroutableLinkIsNotReportedHandled() throws {
        let handler = DeepLinkHandler(queue: queue())
        #expect(handler.handle(try url("https://client.patina.cloud/nowhere/1")) == false)
        #expect(handler.handle(try url("https://example.com/proposals/1")) == false)
        #expect(handler.queuedURLs.isEmpty)
    }

    // MARK: - C2-21 — every non-main phase queues, and the queue is a FIFO

    @Test("a link arriving at any non-main phase is queued, not pushed at a stack that isn't mounted")
    func everyNonMainPhaseQueues() throws {
        for phase in [AppPhase.launching, .auth, .onboarding] {
            let handler = DeepLinkHandler(queue: queue())
            let coordinator = AppCoordinator(houseFirstRoot: true)
            coordinator.forcePhaseForTesting(phase)
            handler.configure(coordinator: coordinator)

            let link = try url(Self.proposal)
            #expect(handler.handle(link), "\(phase) should report the link handled — it is being kept")
            #expect(handler.queuedURLs == [link], "\(phase) should queue")
            #expect(coordinator.currentScreen == .heroFrame, "\(phase) must not push onto an unmounted stack")
        }
    }

    @Test("the queue holds more than one link and drains in arrival order")
    func theQueueIsAFifo() throws {
        let handler = DeepLinkHandler(queue: queue())
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.forcePhaseForTesting(.auth)
        handler.configure(coordinator: coordinator)

        let first = try url(Self.invoice)
        let second = try url(Self.proposal)
        let third = try url(Self.decision)
        for link in [first, second, third] { #expect(handler.handle(link)) }
        #expect(handler.queuedURLs == [first, second, third])

        coordinator.forcePhaseForTesting(.main)

        #expect(handler.queuedURLs.isEmpty)
        // Drained oldest-first, so the newest arrival is the one on screen and
        // Back walks out through the ones before it.
        #expect(coordinator.currentScreen == .decisionDetail(decisionId: "b0000000-0000-0000-0000-0000000000d3"))
    }

    @Test("the queue is bounded — the oldest link is dropped rather than the newest refused")
    func theQueueIsBounded() throws {
        let store = queue()
        let handler = DeepLinkHandler(queue: store)
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.forcePhaseForTesting(.auth)
        handler.configure(coordinator: coordinator)

        for index in 0..<(PendingLinkQueue.maximumDepth + 2) {
            _ = handler.handle(try url("https://client.patina.cloud/invoices/\(index)"))
        }

        #expect(handler.queuedURLs.count == PendingLinkQueue.maximumDepth)
        #expect(handler.queuedURLs.first?.lastPathComponent == "2")
    }

    // MARK: - GAP7B-09 — it survives the process, and it does not survive forever

    @Test("the queue survives a cold launch")
    func theQueueSurvivesAColdLaunch() throws {
        let suite = "patina.tests.deeplink.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        let link = try url(Self.proposal)
        let at = Date(timeIntervalSince1970: 1_787_000_000)

        PendingLinkQueue(defaults: defaults).enqueue(link, now: at)

        // A different instance, as a new process would build.
        let reloaded = PendingLinkQueue(defaults: defaults)
        #expect(reloaded.urls(now: at.addingTimeInterval(60)) == [link])
    }

    @Test("a link older than the TTL is dropped rather than replayed")
    func aStaleLinkIsNotReplayed() throws {
        let store = queue()
        let link = try url(Self.proposal)
        let at = Date(timeIntervalSince1970: 1_787_000_000)
        store.enqueue(link, now: at)

        #expect(store.urls(now: at.addingTimeInterval(PendingLinkQueue.timeToLive - 1)) == [link])
        #expect(store.urls(now: at.addingTimeInterval(PendingLinkQueue.timeToLive + 1)).isEmpty)
    }

    @Test("a queued link is acknowledged on the auth screen in one line")
    func aQueuedLinkIsAcknowledged() throws {
        let handler = DeepLinkHandler(queue: queue())
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.forcePhaseForTesting(.auth)
        handler.configure(coordinator: coordinator)

        #expect(coordinator.pendingLinkNotice == nil)
        _ = handler.handle(try url(Self.proposal))
        #expect(coordinator.pendingLinkNotice == AppCoordinator.pendingLinkNoticeLine)

        coordinator.forcePhaseForTesting(.main)
        #expect(coordinator.pendingLinkNotice == nil, "the notice retires when the link arrives")
    }

    @Test("the notice names no vendor, no URL and no error")
    func theNoticeIsAHomeownerSentence() {
        let line = AppCoordinator.pendingLinkNoticeLine
        #expect(line == "We'll open what you tapped once you're in.")
        #expect(!line.contains("http"))
        #expect(!line.lowercased().contains("error"))
    }

    // MARK: - The deadlock the queue must not create

    /// `.main` is unreachable until the magic-link callback is handled, so a
    /// queued auth URL would hold the app at the auth wall forever. Auth is the
    /// one arm that must route in every phase.
    @Test("an auth callback is never queued, in any phase")
    func authCallbacksBypassTheQueue() throws {
        for phase in [AppPhase.launching, .auth, .onboarding] {
            let handler = DeepLinkHandler(queue: queue())
            let coordinator = AppCoordinator(houseFirstRoot: true)
            coordinator.forcePhaseForTesting(phase)
            handler.configure(coordinator: coordinator)

            _ = handler.handle(try url("patina://auth/callback?code=abc"))
            #expect(handler.queuedURLs.isEmpty, "\(phase): an auth callback must not be queued")
        }
    }

    // MARK: - The widget arm takes the same seam

    @Test("a widget tap in a non-main phase is queued and replayed, not dropped")
    func theWidgetArmIsQueuedToo() throws {
        let handler = DeepLinkHandler(queue: queue())
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.forcePhaseForTesting(.launching)
        handler.configure(coordinator: coordinator)

        let link = try url("patina://today")
        #expect(handler.handle(link))
        #expect(handler.queuedURLs == [link])

        coordinator.forcePhaseForTesting(.main)
        #expect(handler.queuedURLs.isEmpty)
        #expect(coordinator.currentScreen == .heroFrame)
    }

    /// The APNs path carries a route, not a URL — it has no wire form to
    /// persist — so it keeps its own in-memory FIFO through the same drain.
    @Test("an APNs route delivered before .main is held and replayed")
    func anApnsRouteIsHeldUntilMain() {
        let handler = DeepLinkHandler(queue: queue())
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.forcePhaseForTesting(.auth)
        handler.configure(coordinator: coordinator)

        handler.navigate(to: .invoiceDetail(invoiceId: "inv-1"))
        #expect(coordinator.currentScreen == .heroFrame)

        coordinator.forcePhaseForTesting(.main)
        #expect(coordinator.currentScreen == .invoiceDetail(invoiceId: "inv-1"))
    }
}
