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
        #expect(copy == "We couldn't delete your account just now. Try again, or write to hello@patina.cloud.")
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
        #expect(AccountDeletionService.confirmationBody.contains("can't be undone"))
    }

    @Test("Settings offers Sign Out and Delete account directly")
    func settingsSurfacesBothAccountActions() throws {
        let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        #expect(source.contains("\"Sign Out\""))
        #expect(source.contains("\"Delete account\""))
    }

    @Test("the account screen offers the same two acts, so the surfaces cannot disagree")
    func accountViewSurfacesBothAccountActions() throws {
        let source = try SourcePin.read("Patina/Features/Account/AccountView.swift")
        #expect(source.contains("\"Sign Out\""))
        #expect(source.contains("\"Delete account\""))
    }
}
