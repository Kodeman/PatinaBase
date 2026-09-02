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

    @Test("signing out empties every tab stack and returns to Today")
    func theHouseFirstRootIsResetOnSignOut() {
        let coordinator = AppCoordinator(houseFirstRoot: true)
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
        let coordinator = AppCoordinator(houseFirstRoot: false)
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
        let coordinator = AppCoordinator(houseFirstRoot: true)
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
        let coordinator = AppCoordinator(houseFirstRoot: true)
        coordinator.forcePhaseForTesting(.main)
        coordinator.openExternal(.invoiceDetail(invoiceId: "inv-1"))
        let depth = coordinator.tabs.stack(for: .studio).count

        coordinator.forcePhaseForTesting(.main)

        #expect(coordinator.tabs.stack(for: .studio).count == depth)
    }
}
