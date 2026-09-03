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
        // RL2A-10: the property, not three magic numbers. Round one asserted
        // exact occurrence counts (4 / 3 / 6), so the next legitimate error
        // site failed with "expected 4 root-scoped sites, found 5" — which
        // reads as a routing bug rather than "the count moved".
        //
        // The invariant is that EVERY `setError(` call names its scope. A site
        // that forgets one does not compile against `setError(_:scope:)`, so
        // this is the belt: no call may be written with a defaulted or
        // reconstructed scope.
        for (index, line) in source.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            guard line.contains("setError(") else { continue }
            guard !line.trimmingCharacters(in: .whitespaces).hasPrefix("///") else { continue }
            guard !line.contains("func setError(") else { continue }
            #expect(line.contains("scope:"), "unscoped setError at AuthService.swift:\(index + 1) — \(line)")
        }
        // All three scopes are still in use — the routing has not collapsed
        // into one bucket.
        #expect(source.contains("scope: .root)"))
        #expect(source.contains("scope: .sheet)"))
        #expect(source.contains("scope: scope)"))

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
        // Implicit nil in the memberwise init — SwiftLint's
        // `implicit_optional_initialization` refuses the explicit `= nil`.
        #expect(screen?.contains("var pendingLinkNotice: String?") == true)
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

    /// RL2A-13 — round one shipped `lineLimit(1)` + `minimumScaleFactor(0.75)`,
    /// the opposite trade from the one L1-C wrote down in `A-L1C-2` item 2.
    /// Nothing truncated at accessibility-XXXL, but the labels shrank to 75%
    /// instead of wrapping. The note's four modifiers, verbatim.
    @Test("the Welcome CTA labels wrap rather than shrink")
    func theWelcomeCtaLabelsWrapRatherThanShrink() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        // The two CTA rows: `guestButton`'s label and `AuthProviderRow`'s title.
        let wrapped = source.components(separatedBy: ".fixedSize(horizontal: false, vertical: true)").count - 1
        #expect(wrapped >= 2, "expected both CTA labels to be allowed a second line, found \(wrapped)")
        #expect(source.components(separatedBy: ".minimumScaleFactor(0.8)").count - 1 >= 2)
        // The substitution that shipped in round one is gone from both rows.
        // The wordmark keeps its own 0.6, and the status slot its 0.75 — a
        // slot whose whole point (P-29) is that it never changes height.
        #expect(source.components(separatedBy: ".minimumScaleFactor(0.75)").count - 1 == 1)
    }

    /// RL2A-01 + RL2A-05 + RL2A-06 — the work that cannot compile on this
    /// branch had been routed to lanes that merge BEFORE this one, so no lane
    /// could apply it. It is now L1-A's own numbered exit task (`l1a-tasks.md`
    /// X29), and this reads the checklist out of the plan so it cannot
    /// silently shrink between now and the rebase.
    @Test("the rebase-time token and wiring sites are enumerated in the plan")
    func theRebaseTokenSitesAreEnumerated() throws {
        let plan = try String(
            contentsOfFile: "/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01"
                + "/build/waves/w1/l1a-tasks.md",
            encoding: .utf8
        )
        guard let start = plan.range(of: "## X29 —") else {
            // The plan lives outside the repo checkout on CI; skip rather than
            // fail a build that cannot see it.
            return
        }
        let task = String(plan[start.lowerBound...].prefix(2600))
        for site in [
            "PatinaColors.Border.strong",
            "PatinaTypography.voiceLead",
            "PatinaTypography.bodySerif",
            "pendingLinkNotice: coordinator.pendingLinkNotice",
            "keyboardDoneToolbar()",
            "RoomBudgetSheet.swift",
            "ManualRoomEntryView.swift",
            "RoomSettingsView.swift",
            "ScanFallbackEntryView.swift",
            "InvestmentPerspectiveView.swift",
            "ScanFloorPlanPreviewView.swift"
        ] {
            #expect(task.contains(site), "X29 no longer names \(site)")
        }
    }

    @Test("the root's status never renders a filled red panel (VISION §6)")
    func statusIsTintedTextNotAColouredPanel() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(!source.contains("Color.red"))
        #expect(!source.contains(".foregroundStyle(.red)"))
        #expect(source.contains("PatinaColors.terracotta"))
    }
}
