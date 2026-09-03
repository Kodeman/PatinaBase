//
//  AccountActionsTests.swift
//  PatinaTests
//
//  SP-20 — Sign Out, and a way to close the account.
//
//  App Store Review Guideline 5.1.1(v) requires in-app account deletion for
//  any app that lets a person create an account. The app shipped an unused
//  `deleteAccount` endpoint pointed at `/rest/v1/rpc/delete_user_account` —
//  an RPC that exists nowhere in `supabase/migrations` (critique B5). It now
//  points at lane D's `delete-account` edge function.
//

import Foundation
import Testing
@testable import Patina

struct AccountActionsTests {

    @Test("account deletion calls the edge function, not the missing RPC")
    func deletionEndpointIsTheEdgeFunction() {
        #expect(AccountDeletionService.endpointPath == "/functions/v1/delete-account")
        #expect(APIConfiguration.Endpoint.deleteAccount.path == "/functions/v1/delete-account")
        #expect(APIConfiguration.Endpoint.deleteAccount.method == "POST")
    }

    /// C5: no vendor or system error text is ever rendered to a homeowner.
    /// The Pay failure printed Stripe's raw "Invalid API Key provided:
    /// sk_test_…"; this is the same class of failure and gets Patina's voice.
    @Test("a deletion failure is rendered in Patina's voice, never the server's")
    func deletionFailureCopyCarriesNoVendorText() {
        let copy = AccountDeletionService.failureCopy
        // A-101 / L1-E copy deck (W1): "close" → "delete", so the row, the
        // confirmation and this sentence all use one verb.
        #expect(copy == "We couldn’t delete your account just now. Try again, or write to hello@patina.cloud.")
        #expect(!copy.lowercased().contains("error"))
        #expect(!copy.contains("500"))
        #expect(!copy.contains("401"))
    }

    @Test("the deletion error type never carries the server's words")
    func deletionErrorDescriptionIsTheSameCopy() {
        #expect(AccountDeletionError.failed.errorDescription == AccountDeletionService.failureCopy)
    }

    /// A-101 (T0/blocker, App Store Review 5.1.1(v)) rewrote both strings: the
    /// old copy scoped deletion to "this device" while the account, its
    /// projects, proposals and invoices live on the server, and "Close" was a
    /// third name for an act the row and the button both called "Delete
    /// account". The final text is L1-E's copy deck; `DeleteAccountCopyTests`
    /// pins its claims one by one.
    @Test("the confirmation names what it removes and says it is final")
    func deletionConfirmationCopyIsHonest() {
        #expect(AccountDeletionService.confirmationTitle == "Delete account")
        #expect(AccountDeletionService.confirmationBody.contains("deletes your Patina account"))
        #expect(AccountDeletionService.confirmationBody.contains("can’t be undone"))
    }

    @Test("Settings offers Sign Out and Delete account directly")
    func settingsSurfacesBothAccountActions() throws {
        let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        // Deck row C5-10 / SettingsView.swift:212,214 — the alert and its
        // button now read the same sentence case as the row that opens them.
        #expect(source.contains("\"Sign out\""))
        #expect(!source.contains("\"Sign Out\""))
        #expect(source.contains("\"Delete account\""))
    }

    @Test("the account screen offers the same two acts, so the surfaces cannot disagree")
    func accountViewSurfacesBothAccountActions() throws {
        let source = try SourcePin.read("Patina/Features/Account/AccountView.swift")
        // A-L1E-11: one screen shipped both spellings — the alert said
        // "Sign Out" while the button that opens it said "Sign out".
        #expect(source.contains("\"Sign out\""))
        #expect(!source.contains("\"Sign Out\""))
        #expect(source.contains("\"Delete account\""))
    }

    // MARK: - A-79 · the claim sheet, the guest→account handover

    /// The deck's three shapes, from the pure function the sheet renders.
    /// Never asked at zero — `LocalStoreClaim.shouldAsk` requires guest work.
    @Test("the claim sheet's title is composed from the real counts")
    func theClaimSheetTitleNamesWhatIsActuallyThere() {
        #expect(LocalStoreClaimSheet.title(rooms: 0, pieces: 1)
            == "Keep the 1 piece you saved on this phone?")
        #expect(LocalStoreClaimSheet.title(rooms: 2, pieces: 0)
            == "Keep the 2 rooms you saved on this phone?")
        #expect(LocalStoreClaimSheet.title(rooms: 1, pieces: 3)
            == "Keep the 1 room and 3 pieces you saved on this phone?")
    }

    /// RL3A-14 — two SwiftData `fetchCount`s ran on every body evaluation of a
    /// sheet whose counts cannot change while it is up. They are cached now,
    /// and the cache is filled without leaving the title blank for a frame.
    @Test("the claim sheet reads its counts once, not once per render")
    func theClaimSheetReadsItsCountsOnce() throws {
        let source = try SourcePin.read("Patina/Features/Collections/Views/LocalStoreClaimSheet.swift")
        #expect(source.contains("@State private var counts: (rooms: Int, pieces: Int)?"))
        #expect(source.contains("counts = readCounts()"))
        #expect(source.contains("let resolved = counts ?? readCounts()"))
        // The two fetches exist in exactly one place.
        #expect(source.components(separatedBy: "modelContext.fetchCount").count - 1 == 2)
        let start = try #require(source.range(of: "private func readCounts()"))
        let end = try #require(source.range(of: "private var title: String {"))
        let reader = String(source[start.lowerBound..<end.lowerBound])
        #expect(reader.components(separatedBy: "modelContext.fetchCount").count - 1 == 2)
    }
}
