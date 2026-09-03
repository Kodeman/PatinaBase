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
import SwiftUI
import Testing
@testable import Patina

struct AuthErrorRoutingTests {

    @Test("every sheet entry point stamps .sheet, every root entry point stamps .root")
    func entryPointsStampTheirOwnScope() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        // The Apple path carries the scope of the surface its button is on —
        // the Welcome root by default, `.sheet` from inside AuthenticationView
        // — because that button exists on both.
        #expect(source.contains("setError(\"Failed to get Apple ID token\", scope: scope)"))
        #expect(source.contains("scope: AuthErrorScope = .root"))
        // Google · signOut · the two `handleMagicLinkURL` branches: four sites
        // that can only land the reader on the Welcome root, plus
        // `reportExternalError`'s default.
        let rootStamps = source.components(separatedBy: "scope: .root)").count - 1
        #expect(rootStamps == 4, "expected 4 root-scoped sites, found \(rootStamps)")
        let carried = source.components(separatedBy: "scope: scope)").count - 1
        #expect(carried == 3, "expected 3 scope-carrying sites, found \(carried)")

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
        #expect(source.contains(".frame(height: AuthScreenView.statusSlotHeight)"))
        let start = try #require(source.range(of: "struct AuthStatusSlot: View {"))
        let end = try #require(source.range(of: "// MARK: - Provider row"))
        let slot = String(source[start.lowerBound..<end.lowerBound])
        #expect(slot.contains("} else {"))
        #expect(slot.contains("Color.clear"))
    }

    /// P-29's actual claim, measured: the slot lays out to the same height
    /// with a message and without one, so showing or clearing an error cannot
    /// move the buttons underneath it. Round one compared a static constant to
    /// itself, which is true of any constant and proves nothing about layout.
    @Test("the reserved height does not depend on whether a message is pending")
    @MainActor
    func reservedHeightIsIndependentOfContent() {
        func height(_ slot: AuthStatusSlot) -> CGFloat {
            UIHostingController(rootView: slot).sizeThatFits(
                in: CGSize(width: 393, height: CGFloat.greatestFiniteMagnitude)
            ).height
        }
        let empty = height(AuthStatusSlot(errorMessage: nil))
        let short = height(AuthStatusSlot(errorMessage: "Invalid login credentials"))
        let long = height(AuthStatusSlot(
            errorMessage: "Apple Sign In couldn't be completed. Please try again."
        ))
        #expect(empty == short, "empty \(empty) vs short \(short)")
        #expect(empty == long, "empty \(empty) vs long \(long)")
        #expect(empty == AuthScreenView.statusSlotHeight)
    }

    /// A sheet-level failure never becomes a root-level message, driven rather
    /// than asserted about the enum. Serialized and restored: it moves the
    /// shared service's state, which 1600 other tests run beside.
    @Suite(.serialized)
    @MainActor
    struct ScopeRouting {

        private func withRestoredError(_ body: () -> Void) {
            defer { AuthService.shared.clearError() }
            body()
        }

        @Test("a sheet's error is never the root's error")
        func sheetScopedErrorDoesNotReachTheRoot() {
            withRestoredError {
                AuthService.shared.setError("Invalid login credentials", scope: .sheet)
                #expect(AuthService.shared.errorMessage == "Invalid login credentials")
                #expect(AuthService.shared.rootErrorMessage == nil)
                #expect(AuthService.shared.sheetErrorMessage == "Invalid login credentials")
            }
        }

        @Test("a root's error is never a presented sheet's error")
        func rootScopedErrorDoesNotReachTheSheet() {
            withRestoredError {
                AuthService.shared.reportExternalError("Apple Sign In couldn't be completed.")
                #expect(AuthService.shared.rootErrorMessage == "Apple Sign In couldn't be completed.")
                #expect(AuthService.shared.sheetErrorMessage == nil)
            }
        }

        /// The scope goes back with the message. A stale `.sheet` left behind
        /// a nil message meant the next reader of `errorScope` was answering
        /// about an error that no longer existed.
        @Test("clearing an error also clears its scope")
        func clearingAnErrorAlsoClearsItsScope() {
            AuthService.shared.setError("Invalid login credentials", scope: .sheet)
            #expect(AuthService.shared.errorScope == .sheet)
            AuthService.shared.clearError()
            #expect(AuthService.shared.errorMessage == nil)
            #expect(AuthService.shared.errorScope == .root)
        }
    }

    // MARK: - 3. The held-link acknowledgement (C2-21, GAP7B-09)

    /// L1F→A-2's precedence, and the reason it is a second CASE rather than a
    /// second element: the whole of P-29 is that nothing on this screen moves.
    @Test("the notice yields to an error, and neither changes the geometry")
    @MainActor
    func theNoticeYieldsToAnError() {
        let notice = "We'll open what you tapped once you're in."
        let both = AuthStatusSlot(errorMessage: "Invalid login credentials", pendingLinkNotice: notice)
        #expect(both.message?.text == "Invalid login credentials")
        #expect(both.message?.isError == true)

        let quiet = AuthStatusSlot(errorMessage: nil, pendingLinkNotice: notice)
        #expect(quiet.message?.text == notice)
        #expect(quiet.message?.isError == false)

        #expect(AuthStatusSlot(errorMessage: nil).message == nil)

        func height(_ slot: AuthStatusSlot) -> CGFloat {
            UIHostingController(rootView: slot).sizeThatFits(
                in: CGSize(width: 393, height: CGFloat.greatestFiniteMagnitude)
            ).height
        }
        #expect(height(quiet) == height(AuthStatusSlot(errorMessage: nil)))

        let screen = try? SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(screen?.contains("var pendingLinkNotice: String? = nil") == true)
    }

    // MARK: - 4. The screen fills the viewport (P-34)

    /// A `Spacer` inside a `ScrollView` takes its ideal length instead of
    /// expanding. Round one wrapped the whole screen unconditionally, and the
    /// legal footer rose from y≈771 to y≈607 with ~200 pt of dead space under
    /// it at the default text size — measured on the AX tree, light and dark.
    @Test("the Welcome content is given the viewport's height as a floor")
    func welcomeContentFillsTheViewport() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(source.contains("GeometryReader { proxy in"))
        #expect(source.contains(".frame(minHeight: proxy.size.height)"))
        // The ternary it replaces was a no-op in both branches (0 or nil).
        #expect(!source.contains("dynamicTypeSize.isAccessibilitySize ? 0 : nil"))
    }

    @Test("the root's status never renders a filled red panel (VISION §6)")
    func statusIsTintedTextNotAColouredPanel() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(!source.contains("Color.red"))
        #expect(!source.contains(".foregroundStyle(.red)"))
        #expect(source.contains("PatinaColors.terracotta"))
    }
}
