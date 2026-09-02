//
//  NotificationsLoadStateTests.swift
//  PatinaTests
//
//  A-80 — the feed drew "Nothing yet — Updates from your designer will land
//  here." in the same frame whose Companion caption read "5 THINGS NEED YOUR
//  EYE" (`shots/A/43-after-migrate.png`), and re-entering seconds later showed
//  five populated rows (`45`). The screen was not empty; it had not asked yet.
//
//  The cause is an ordering nobody can see in a screenshot: `isLoading` is
//  false until `.task` runs, which is at least one frame after `body` first
//  evaluates, so the old chain fell straight through to the empty state. Empty
//  is a claim about the world. It needs an answer behind it.
//
//  A-63 is the same screen's other half — the guest CTA. Its root cause is
//  `PatinaButton`'s zero horizontal padding under `PatinaEmptyState`'s
//  `.fixedSize()`, which is L1-D's file; the exact final text went out as note
//  **L1F→D-1**. What this suite can hold is that the guest state is reached at
//  all, and that it is the ONLY state a signed-out reader ever sees.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct NotificationsLoadStateTests {

    private typealias State = NotificationFeedView.FeedState

    private func state(
        isAuthenticated: Bool = true,
        hasResolved: Bool,
        isLoading: Bool = false,
        error: String? = nil,
        rowCount: Int = 0
    ) -> State {
        NotificationFeedView.state(
            isAuthenticated: isAuthenticated,
            hasResolved: hasResolved,
            isLoading: isLoading,
            error: error,
            rowCount: rowCount
        )
    }

    // MARK: - The frame that shipped the bug

    @Test("before the fetch has answered, the feed is loading — never empty")
    func theFirstFrameIsLoading() {
        // Exactly the state `body` evaluates in before `.task` fires:
        // not loading yet, no error, no rows, nothing asked.
        #expect(state(hasResolved: false) == .loading)
    }

    @Test("the empty state needs a resolved, zero-row fetch behind it")
    func emptyOnlyAfterAResolvedFetch() {
        #expect(state(hasResolved: true) == .empty)
        #expect(state(hasResolved: false, isLoading: true) == .loading)
        #expect(state(hasResolved: true, isLoading: true) == .loading)
    }

    @Test("a failure is a failure, not an emptiness")
    func aFailureIsNotAnEmptiness() {
        #expect(state(hasResolved: true, error: "Couldn't load notifications")
                == .failed("Couldn't load notifications"))
    }

    @Test("rows outrank every other answer — a refresh that fails keeps them")
    func rowsOutrankEverything() {
        #expect(state(hasResolved: true, rowCount: 5) == .rows)
        #expect(state(hasResolved: true, isLoading: true, rowCount: 5) == .rows)
        #expect(state(hasResolved: true, error: "Couldn't load notifications", rowCount: 5) == .rows)
    }

    @Test("a signed-out reader only ever sees the invitation")
    func aGuestSeesOneThing() {
        for hasResolved in [true, false] {
            for rowCount in [0, 5] {
                #expect(
                    state(isAuthenticated: false, hasResolved: hasResolved, rowCount: rowCount) == .guest
                )
            }
        }
    }

    // MARK: - The view model's half

    @Test("a fresh view model has not resolved")
    func aFreshViewModelHasNotResolved() {
        #expect(NotificationsViewModel().hasResolved == false)
    }

    /// `load()` answers in every arm — rows, zero rows, a failure, a guest —
    /// so the empty state becomes reachable exactly once and never before.
    @Test("load resolves on every path, including the guest short-circuit")
    func loadAlwaysResolves() async {
        let viewModel = NotificationsViewModel()
        // Unauthenticated in a unit run: the guest arm, which returns early.
        await viewModel.load()
        #expect(viewModel.hasResolved)
        #expect(viewModel.notifications.isEmpty)
        #expect(viewModel.error == nil)
    }

    // MARK: - A-63, the half this lane can hold

    @Test("the guest invitation is the empty state's own CTA, not a second control")
    func theGuestInvitationUsesTheDesignSystemState() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Notifications/Views/NotificationFeedView.swift")
        )
        #expect(code.contains("accessibilityIdentifier(\"NotificationFeedView.GuestInvite\")"))
        #expect(code.contains("ctaTitle: \"Sign in\""))
        // The CTA is `PatinaEmptyState`'s own, so the fix reaches it wherever
        // it is applied — no second capsule hand-rolled beside the design
        // system's, and its width is `PatinaButton`'s to fix (note L1F→D-1).
        // (`Circle()` DOES appear in this file: it is the unread dot on a row,
        // which is not a control.)
        #expect(!code.contains("Capsule()"))
        #expect(!code.contains("clipShape(Circle())"))
    }
}
