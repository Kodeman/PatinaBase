//
//  SignOutResetTests.swift
//  PatinaTests
//
//  C2-06 — sign-out left the previous account's screens on the navigation
//  stack. `ContentView` switches the root on `phase`, so the `.main` branch is
//  torn down while the coordinator survives; nothing on the sign-out path
//  cleared `navigationPath`, `screenStack` or any of the four tab stacks, so
//  signing back in restored the previous person's invoice under the new
//  session's chrome.
//
//  The seam is the one place the app already knows a session ended: the
//  `.main → .auth / .launching` transition in `recomputePhase()`.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct SignOutResetTests {

    /// A coordinator whose session-end side effect is counted rather than run.
    ///
    /// The production closure rewrites the real App Group container, so a suite
    /// that drove it would delete whatever walk state is on the same simulator
    /// and couple itself to `WidgetSnapshotOwnershipTests` through a file.
    final class Calls: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        func record() { lock.lock(); count += 1; lock.unlock() }
        var value: Int { lock.lock(); defer { lock.unlock() }; return count }
    }

    private func coordinator(houseFirstRoot: Bool, endSession: Calls) -> AppCoordinator {
        AppCoordinator(
            houseFirstRoot: houseFirstRoot,
            endSessionSideEffects: { endSession.record() }
        )
    }

    @Test("signing out empties every tab stack and returns to Today")
    func theHouseFirstRootIsResetOnSignOut() {
        let coordinator = coordinator(houseFirstRoot: true, endSession: Calls())
        coordinator.forcePhaseForTesting(.main)

        coordinator.openExternal(.invoiceDetail(invoiceId: "inv-1"))
        coordinator.openExternal(.roomSavedItems(roomId: UUID()))
        #expect(coordinator.tabs.selected != .today || !coordinator.tabs.stack(for: .today).isEmpty)

        coordinator.forcePhaseForTesting(.auth)

        for tab in PatinaTab.allCases {
            #expect(coordinator.tabs.stack(for: tab).isEmpty, "\(tab) kept the previous account's stack")
        }
        #expect(coordinator.tabs.selected == .today)
        #expect(coordinator.currentScreen == .heroFrame)
    }

    @Test("signing out empties the single stack on the flag-off root")
    func theFlagOffRootIsResetOnSignOut() {
        let coordinator = coordinator(houseFirstRoot: false, endSession: Calls())
        coordinator.forcePhaseForTesting(.main)

        coordinator.navigate(to: .invoiceDetail(invoiceId: "inv-1"))
        coordinator.navigate(to: .proposalDetail(proposalId: "prop-1"))
        #expect(coordinator.navigationPath.count == 2)

        coordinator.forcePhaseForTesting(.auth)

        #expect(coordinator.navigationPath.isEmpty)
        #expect(coordinator.currentScreen == .heroFrame)
    }

    /// A voluntary sign-out routes `.main → .launching` through
    /// `beginSplashTransition()`, so the reset cannot key on `.auth` alone.
    @Test("the splash-first sign-out resets too")
    func theSplashTransitionResetsAsWell() {
        let coordinator = coordinator(houseFirstRoot: true, endSession: Calls())
        coordinator.forcePhaseForTesting(.main)
        coordinator.openExternal(.proposalDetail(proposalId: "prop-1"))

        coordinator.forcePhaseForTesting(.launching)

        for tab in PatinaTab.allCases {
            #expect(coordinator.tabs.stack(for: tab).isEmpty)
        }
        #expect(coordinator.currentScreen == .heroFrame)
    }

    /// Arriving at `.main` is not a session ending. A reset there would throw
    /// away the deep link the coordinator has just drained onto a stack.
    @Test("arriving at .main resets nothing")
    func arrivingAtMainIsNotASignOut() {
        let coordinator = coordinator(houseFirstRoot: true, endSession: Calls())
        coordinator.forcePhaseForTesting(.main)
        coordinator.openExternal(.invoiceDetail(invoiceId: "inv-1"))
        let depth = coordinator.tabs.stack(for: .studio).count

        coordinator.forcePhaseForTesting(.main)

        #expect(coordinator.tabs.stack(for: .studio).count == depth)
    }

    // MARK: - What ends with the session outside this object (round 2)

    /// `RL1F-12`: the side effect is injected, so the unit tier proves it fires
    /// without rewriting the running simulator's App Group container.
    @Test("the session-end hook fires once per ended session, and not on arrival")
    func theSessionEndHookFiresExactlyOnce() {
        let calls = Calls()
        let coordinator = coordinator(houseFirstRoot: true, endSession: calls)

        coordinator.forcePhaseForTesting(.main)
        #expect(calls.value == 0, "arriving is not ending")

        coordinator.forcePhaseForTesting(.auth)
        #expect(calls.value == 1)

        coordinator.forcePhaseForTesting(.main)
        #expect(calls.value == 1)
    }

    /// `RL1F-07`: the queue is on disk with a 15-minute life, so a link account
    /// A tapped at the auth wall outlives A's session. The same account
    /// isolation family as `C2-06` and `B-16`, on the same seam.
    @Test("a session that ends takes its queued links with it")
    func theQueueIsClearedWhenASessionEnds() {
        let suite = "patina.tests.signout.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        let queue = PendingLinkQueue(defaults: defaults)
        let coordinator = coordinator(houseFirstRoot: true, endSession: Calls())
        coordinator.attachDeepLinkClear { queue.clear() }

        coordinator.forcePhaseForTesting(.main)
        queue.enqueue(URL(string: "https://client.patina.cloud/invoices/i1")!)
        #expect(queue.isEmpty == false)

        coordinator.forcePhaseForTesting(.auth)

        #expect(queue.isEmpty, "account A's link would have drained into account B's session")
    }

    /// And the wiring that makes the test above true in the product: the
    /// handler registers the clear from the same call that registers the drain.
    @Test("the handler registers the clear beside the drain")
    func theHandlerRegistersTheClear() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/App/DeepLinking/DeepLinkHandler.swift")
        )
        #expect(code.contains("coordinator.attachDeepLinkClear { [weak self] in self?.queue.clear() }"))
    }

    /// A held link's acknowledgement must not outlive the session either — the
    /// auth screen would print "We'll open what you tapped once you're in."
    /// over a queue that no longer holds anything.
    @Test("the pending-link notice does not survive the session")
    func theNoticeIsClearedToo() {
        let coordinator = coordinator(houseFirstRoot: true, endSession: Calls())
        coordinator.forcePhaseForTesting(.main)
        coordinator.noteLinkHeld()
        #expect(coordinator.pendingLinkNotice != nil)

        coordinator.forcePhaseForTesting(.auth)

        #expect(coordinator.pendingLinkNotice == nil)
    }
}
