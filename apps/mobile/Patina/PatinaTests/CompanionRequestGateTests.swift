//
//  CompanionRequestGateTests.swift
//  PatinaTests
//
//  The `companion-context` duplicate-request defect.
//
//  `research/05-rewalk.md` §2d: with the edge function returning 200, the app
//  still fired `companion-context` FOUR times in two seconds at launch for one
//  screen, and twice more a minute later. That is not retry behaviour — it is
//  three `CompanionOverlay` call sites (`onChange(companionContext)`,
//  `onChange(currentScreen)`, `onAppear`) all reaching one `updateContext`
//  that spawned a fetch unconditionally.
//
//  `CompanionOverlay.swift` is lane A's file this wave, so the fix is the gate
//  inside the view model, not a change to how the overlay calls it.
//

import Testing
@testable import Patina

@MainActor
struct CompanionRequestGateTests {

    @Test("three updates for one screen produce one request")
    func oneScreenOneRequest() {
        var gate = CompanionViewModel.QuickActionsGate()
        // `#expect` captures its expression into a non-mutating closure, so
        // every `shouldFetch` call is made first and asserted after.
        let first = gate.shouldFetch(screen: "hero_frame")
        let second = gate.shouldFetch(screen: "hero_frame")
        let third = gate.shouldFetch(screen: "hero_frame")
        let fourth = gate.shouldFetch(screen: "hero_frame")
        #expect(first)
        #expect(!second)
        #expect(!third)
        #expect(!fourth)
    }

    @Test("a real screen change fetches again")
    func aScreenChangeFetches() {
        var gate = CompanionViewModel.QuickActionsGate()
        let home = gate.shouldFetch(screen: "hero_frame")
        let invoice = gate.shouldFetch(screen: "invoice_detail")
        let invoiceAgain = gate.shouldFetch(screen: "invoice_detail")
        #expect(home)
        #expect(invoice)
        #expect(!invoiceAgain)
    }

    /// Returning to a screen is a new visit, not a repeat of the last one.
    @Test("coming back to a screen fetches again")
    func returningFetchesAgain() {
        var gate = CompanionViewModel.QuickActionsGate()
        let home = gate.shouldFetch(screen: "hero_frame")
        let invoice = gate.shouldFetch(screen: "invoice_detail")
        let homeAgain = gate.shouldFetch(screen: "hero_frame")
        #expect(home)
        #expect(invoice)
        #expect(homeAgain)
    }

    @Test("an invalidated gate refetches the same screen")
    func invalidationRefetches() {
        var gate = CompanionViewModel.QuickActionsGate()
        let first = gate.shouldFetch(screen: "hero_frame")
        let repeated = gate.shouldFetch(screen: "hero_frame")
        gate.invalidate()
        let afterInvalidate = gate.shouldFetch(screen: "hero_frame")
        #expect(first)
        #expect(!repeated)
        #expect(afterInvalidate)
    }

    @Test("a fresh gate has fetched nothing")
    func freshGateFetchesFirst() {
        var gate = CompanionViewModel.QuickActionsGate()
        let first = gate.shouldFetch(screen: "")
        #expect(first)
    }
}
