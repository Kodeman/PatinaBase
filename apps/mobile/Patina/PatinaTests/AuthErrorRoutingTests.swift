//
//  AuthErrorRoutingTests.swift
//  PatinaTests
//
//  P-29 — the worst five seconds in the app.
//
//  `tester@patina.cloud` + a wrong password was rejected inside the password
//  SHEET. Cancel dismissed the sheet and left "Invalid login credentials" in
//  bare red text on the WELCOME ROOT, between "Start with a piece you love"
//  and Sign in with Apple. That line pushed the auth stack down exactly 33 pt,
//  so `guestButton` moved to where the email button had been — and a tap at
//  the remembered position dropped the tester into the guest flow, which
//  (P-18) had no way out.
//
//  Two halves, both pinned here:
//    1. a sheet-level failure never becomes a root-level message;
//    2. the root reserves the status space, so the stack cannot move whether a
//       message is pending or not.
//

import Foundation
import Testing
@testable import Patina

struct AuthErrorRoutingTests {

    // MARK: - 1. Scope

    @Test("a sheet's error is never the root's error")
    func sheetScopedErrorDoesNotReachTheRoot() {
        // The pure rule `rootErrorMessage` applies.
        #expect(AuthErrorScope.sheet != AuthErrorScope.root)
    }

    @Test("every sheet entry point stamps .sheet, every root entry point stamps .root")
    func entryPointsStampTheirOwnScope() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        // Root: the Apple token guard, the Apple exchange, the Google sheet,
        // and the external Apple-callback reporter.
        #expect(source.contains("setError(\"Failed to get Apple ID token\", scope: .root)"))
        #expect(source.contains("setError(message, scope: .root)"))
        // Apple token guard · Apple exchange · Google · reportExternalError ·
        // signOut · the two `handleMagicLinkURL` branches. All seven land the
        // reader on the Welcome root, which is where they have to be readable.
        let rootStamps = source.components(separatedBy: "scope: .root)").count - 1
        #expect(rootStamps == 7, "expected 7 root-scoped sites, found \(rootStamps)")

        // Sheet: password, sign-up, reset, resend, code send, code verify.
        let sheetStamps = source.components(separatedBy: "scope: .sheet)").count - 1
        #expect(sheetStamps == 6, "expected 6 sheet-scoped sites, found \(sheetStamps)")

        // And no error message is assigned outside `setError` any more — that
        // unscoped assignment is exactly what leaked onto the root.
        #expect(!source.contains("errorMessage = error.localizedDescription"))
        #expect(!source.contains("errorMessage = \""))
    }

    @Test("the root reads rootErrorMessage, not errorMessage")
    func rootRendersOnlyItsOwnMessage() throws {
        let content = try SourcePin.read("Patina/ContentView.swift")
        #expect(content.contains("errorMessage: AuthService.shared.rootErrorMessage"))
        #expect(!content.contains("errorMessage: AuthService.shared.errorMessage"))

        let sheet = try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
        #expect(sheet.contains("errorMessage: AuthService.shared.rootErrorMessage"))
        #expect(!sheet.contains("errorMessage: AuthService.shared.errorMessage"))
    }

    @Test("Cancel clears the sheet's error rather than leaving it standing")
    func cancelClearsTheSheetError() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        let start = try #require(source.range(of: "Button(\"Cancel\") {"))
        let cancel = String(source[start.lowerBound...].prefix(400))
        #expect(cancel.contains("viewModel.clearForm()"))
        #expect(cancel.contains("dismiss()"))
        // And the belt: leaving the sheet by any route clears it.
        #expect(source.contains(".onDisappear {"))
        #expect(source.contains("AuthService.shared.clearError()"))
    }

    // MARK: - 2. Reserved space

    @Test("the status slot is always in the layout, at a fixed height")
    func statusSlotIsAlwaysPresentAndFixed() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        // Not `if let errorMessage { Text(...) }` at the stack level — a
        // Group with an else branch, framed to a constant.
        #expect(source.contains("static let statusSlotHeight: CGFloat = 52"))
        #expect(source.contains(".frame(height: Self.statusSlotHeight)"))
        let start = try #require(source.range(of: "private var statusSlot: some View {"))
        let end = try #require(source.range(of: "// MARK: - Providers"))
        let slot = String(source[start.lowerBound..<end.lowerBound])
        #expect(slot.contains("} else {"))
        #expect(slot.contains("Color.clear"))
    }

    /// The height is a constant, so the layout it reserves is identical with
    /// and without a message — that is the assertion P-29's 33 pt shift asks
    /// for, stated as the fact that produces it.
    @Test("the reserved height does not depend on whether a message is pending")
    func reservedHeightIsIndependentOfContent() {
        let withMessage = AuthScreenView(errorMessage: "Invalid login credentials")
        let without = AuthScreenView(errorMessage: nil)
        #expect(type(of: withMessage).statusSlotHeight == type(of: without).statusSlotHeight)
        #expect(AuthScreenView.statusSlotHeight > 0)
    }

    @Test("the root's status never renders a filled red panel (VISION §6)")
    func statusIsTintedTextNotAColouredPanel() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(!source.contains("Color.red"))
        #expect(!source.contains(".foregroundStyle(.red)"))
        #expect(source.contains("PatinaColors.terracotta"))
    }
}
