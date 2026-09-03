//
//  DeleteAccountCopyTests.swift
//  PatinaTests
//
//  A-101 — App Store Review 5.1.1(v). The dialog read, verbatim: title "Close
//  your account?", body "This removes your account and everything Patina keeps
//  on this device. It can't be undone." — while the row that opened it and the
//  button both said "Delete account". Three names for one act, and the copy
//  scoped the deletion to the phone while the account, its invoices, proposals
//  and projects live on the server.
//
//  Final strings are L1-E's copy deck (`build/waves/w1/l1-e-copy-deck.md`,
//  rows A-101 ×3), grounded in `delete-account/index.ts` and 00538.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct DeleteAccountCopyTests {

    @Test("one verb — the row, the title and the button all say Delete account")
    func oneVerbEverywhere() throws {
        #expect(AccountDeletionService.confirmationTitle == "Delete account")
        #expect(!AccountDeletionService.confirmationTitle.lowercased().contains("close"))
        #expect(!AccountDeletionService.failureCopy.lowercased().contains("close"))

        let account = try SourcePin.read("Patina/Features/Account/AccountView.swift")
        #expect(account.contains("Button(\"Delete account\")"))
        #expect(account.contains("Button(\"Delete account\", role: .destructive)"))

        // `SettingsView.swift` is L1-C's file, so this pins only the coupling
        // — that the second surface reads the same two constants and cannot
        // drift from them — never its row's literal label, which would make an
        // L1-A test fail on an L1-C edit.
        let settings = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        #expect(settings.contains("AccountDeletionService.confirmationTitle"))
        #expect(settings.contains("AccountDeletionService.confirmationBody"))
    }

    @Test("the sentence says the SERVER account goes, not only the device")
    func serverSideDeletionIsStated() {
        let body = AccountDeletionService.confirmationBody
        #expect(body.contains("deletes your Patina account"))
        #expect(!body.contains("everything Patina keeps on this device. It can't be undone."))
        #expect(body.contains("rooms, pieces, and messages"))
    }

    @Test("it names what is retained, and why")
    func retentionIsNamed() {
        let body = AccountDeletionService.confirmationBody
        #expect(body.contains("stays in our records"))
        #expect(body.contains("name and contact details removed"))
        #expect(body.contains("legal and accounting obligations"))
    }

    /// 00538 keeps `proposals`, `projects`, `invoices`, `client_decisions` and
    /// `designer_clients` indefinitely against a tombstoned profile. There is
    /// no purge window anywhere in the code, so the copy must not claim one.
    @Test("no invented retention period")
    func noFabricatedWindow() {
        let body = AccountDeletionService.confirmationBody.lowercased()
        for invented in ["30 days", "90 days", "seven years", "7 years", "12 months"] {
            #expect(!body.contains(invented), "copy invents a purge window: \(invented)")
        }
    }

    @Test("it still says the act is irreversible")
    func irreversibilityIsStated() {
        #expect(AccountDeletionService.confirmationBody.contains("can't be undone"))
    }

    @Test("the failure sentence is ours, never the server's")
    func failureCopyIsOurs() {
        #expect(AccountDeletionService.failureCopy
            == "We couldn't delete your account just now. Try again, or write to hello@patina.cloud.")
    }
}
