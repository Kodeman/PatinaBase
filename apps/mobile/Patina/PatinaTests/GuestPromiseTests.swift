//
//  GuestPromiseTests.swift
//  PatinaTests
//
//  PROGRAM.md §3 · L1-E: "Companion copy branches on auth state and never
//  asserts a designer or a home to an anonymous guest (A-52); the claim
//  sheet composes its sentence from actual counts and is omitted at zero
//  (A-79); the portrait footnote states what is true (B-23)."
//
//  Every site here is in a file another lane owns, so every assertion is
//  wrapped in `withKnownIssue` naming the row and the lane — see
//  `ErrorVoiceTests`'s header for why, and for the unwrap signal.
//

import Testing
import Foundation
@testable import Patina

struct GuestPromiseTests {

    // MARK: - A-52 — the Companion promises nothing it cannot keep

    /// The Companion menu's home row and the piece-act row both drew a
    /// signed-in sentence to an anonymous guest. Both need `isAuthenticated`
    /// threaded into the row builder — the deck's own note, re-routed in this
    /// fix round from L1-A to **L1-C**, which owns `Features/Companion/**`
    /// (steward.md §5.4). L1-A recorded the re-route as task `C-L1A-3`.
    @Test("the Companion's rows branch on auth state")
    func companionRowsBranchOnAuthState() throws {
        withKnownIssue("deck row A-52 / CompanionActionRows.swift:32-34,220-223 is L1-C's (task C-L1A-3)") {
            let source = try SourcePin.read("Patina/Features/Companion/Services/CompanionActionRows.swift")
            #expect(source.contains("isAuthenticated"), "no row builder takes the guest's state")
            #expect(source.contains("\"See what’s on Patina\""))
            #expect(source.contains("\"Sign in and a designer will get back to you\""))
        }
    }

    /// The third `A-52` site. `Features/Notifications/**` is **L1-F**'s
    /// (steward.md §5.7), not L1-A's — the original deck mis-addressed it.
    /// L1-F has applied it.
    @Test("the notifications empty state says what signing in unlocks")
    func notificationsGuestStateMakesNoPromise() throws {
        withKnownIssue("deck row A-52 / NotificationFeedView.swift:193 is L1-F's; unwrap after L1-F merges") {
            let source = try SourcePin.read("Patina/Features/Notifications/Views/NotificationFeedView.swift")
            #expect(source.contains("\"Sign in to see updates on your projects and messages here.\""))
            #expect(!source.contains("\"Updates from your designer will land here. Sign in to stay in the loop.\""))
        }
    }

    // MARK: - A-79 — the claim sheet counts what it is asking about

    /// `Features/Collections/Views/**` has no W1 owner, so under L1-E's
    /// ownership rule this file was L1-E's to edit — but L1-A had already
    /// applied both rows verbatim before this fix round opened
    /// (`l1-e-notes.md`, Note E-L1A-1). Recorded, and pinned here rather than
    /// re-applied, so the wave does not carry the same edit twice.
    @Test("the claim sheet composes its title from real counts")
    func claimSheetCountsWhatItClaims() throws {
        withKnownIssue("deck row A-79 / LocalStoreClaimSheet.swift:17 applied by L1-A; unwrap after L1-A merges") {
            let source = try SourcePin.read("Patina/Features/Collections/Views/LocalStoreClaimSheet.swift")
            #expect(!source.contains("\"Keep the room and the pieces you saved on this phone?\""))
            #expect(source.contains("piece") && source.contains("room"))
        }
    }

    /// The sheet was already never shown at zero; the pin says so, so a later
    /// refactor cannot quietly make it possible.
    @MainActor
    @Test("the claim sheet is not offered when there is nothing to keep")
    func claimSheetIsOmittedAtZero() throws {
        #expect(LocalStoreClaim.shouldAsk(previousOwner: nil, hasGuestWork: false) == false)
        #expect(LocalStoreClaim.shouldAsk(previousOwner: nil, hasGuestWork: true) == true)
    }

    // MARK: - B-23 — the portrait footnote states what is true

    /// The quiz answers are POSTed to the backend, so "stays on this device"
    /// was false. `Features/StyleQuiz/**` is L1-A's; applied there.
    @Test("the taste-portrait footnote makes no on-device claim")
    func portraitFootnoteIsTrue() throws {
        withKnownIssue("deck row B-23 / StyleResultView.swift:65 is L1-A's; unwrap after L1-A merges") {
            let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleResultView.swift")
            #expect(!source.contains("stays on this device"))
            #expect(source.contains("\"Your portrait is yours — reset it any time in Settings.\""))
        }
    }
}
