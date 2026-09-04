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

/// Serialized: every case below the source pins drives `AuthService.shared`'s
/// error state, which is one object shared with every other suite in the tier.
/// Two of these running at once — or one running beside the session-less
/// verify cases moved in from `OtpVerifyCoalescingTests` — read each other's
/// `clearError()`.
@Suite(.serialized)
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

        // RL3A-16: `= nil` was not covered by the bar above, and ten methods
        // opened with a bare `errorMessage = nil` that skipped `clearError()`
        // — the only thing that also resets `errorScope`. `AuthService`'s own
        // doc says a stale `.sheet` behind a nil message means "the next
        // reader of errorScope was answering about an error that no longer
        // existed"; this makes that unwritable. The ONLY two assignments in
        // the file are the ones inside `setError` and `clearError`.
        var assignments: [Int] = []
        for (index, line) in source.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("errorMessage = ") else { continue }
            assignments.append(index + 1)
        }
        #expect(
            assignments.count == 2,
            "errorMessage is assigned at \(assignments) — only setError and clearError may"
        )
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

    @Test("Cancel clears the sheet’s error rather than leaving it standing")
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
        // RL3A-08: still one constant, now read through `@ScaledMetric` so the
        // reservation grows with the ramp it reserves for.
        #expect(source.contains("@ScaledMetric(relativeTo: .subheadline)"))
        #expect(source.contains("private var slotHeight: CGFloat = AuthScreenView.statusSlotHeight"))
        #expect(source.contains(".frame(height: slotHeight)"))
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
    ///
    /// RL3A-08 — and it is measured at an accessibility size too. The slot was
    /// a hard 52 at every size: 52.16 pt of gap at the default type size and
    /// 52.08 pt at accessibility-extra-extra-extra-large, measured on the AX
    /// tree, while two lines of `bodySmall` at that size are roughly 100 pt.
    @Test("the reserved height does not depend on whether a message is pending", arguments: [
        DynamicTypeSize.large, DynamicTypeSize.accessibility5
    ])
    @MainActor
    func reservedHeightIsIndependentOfContent(size: DynamicTypeSize) {
        func height(_ slot: AuthStatusSlot) -> CGFloat {
            UIHostingController(rootView: slot.environment(\.dynamicTypeSize, size)).sizeThatFits(
                in: CGSize(width: 393, height: CGFloat.greatestFiniteMagnitude)
            ).height
        }
        let empty = height(AuthStatusSlot(errorMessage: nil))
        let short = height(AuthStatusSlot(errorMessage: "Invalid login credentials"))
        let long = height(AuthStatusSlot(
            errorMessage: "Apple Sign In couldn’t be completed. Please try again."
        ))
        #expect(empty == short, "\(size): empty \(empty) vs short \(short)")
        #expect(empty == long, "\(size): empty \(empty) vs long \(long)")

        if size == .large {
            #expect(empty == AuthScreenView.statusSlotHeight)
        } else {
            // The whole of RL3A-08: the reservation is not the same 52 pt for
            // a reader at accessibility-XXXL as it is at the default size.
            #expect(
                empty > AuthScreenView.statusSlotHeight,
                "the slot did not scale: \(empty) at \(size)"
            )
        }
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

        @Test("a sheet’s error is never the root’s error")
        func sheetScopedErrorDoesNotReachTheRoot() {
            withRestoredError {
                AuthService.shared.setError("Invalid login credentials", scope: .sheet)
                #expect(AuthService.shared.errorMessage == "Invalid login credentials")
                #expect(AuthService.shared.rootErrorMessage == nil)
                #expect(AuthService.shared.sheetErrorMessage == "Invalid login credentials")
            }
        }

        @Test("a root’s error is never a presented sheet’s error")
        func rootScopedErrorDoesNotReachTheSheet() {
            withRestoredError {
                AuthService.shared.reportExternalError("Apple Sign In couldn’t be completed.")
                #expect(AuthService.shared.rootErrorMessage == "Apple Sign In couldn’t be completed.")
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
        let notice = "We’ll open what you tapped once you’re in."
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
    @Test("the Welcome content is given the viewport’s height as a floor")
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

    // MARK: - X29 · the rebase-time work, as ratchets that can fail

    /// RL3A-03 — this replaces a case that read `contentsOfFile:` at an
    /// ABSOLUTE path into Kody's main checkout, to a file `git ls-files` does
    /// not know, and `return`ed (passing) whenever the range was missing. From
    /// any worktree it validated a different checkout than the one under test;
    /// on a clean clone it was a no-op; and at its best it asserted that
    /// eleven strings still appeared in prose, never that a line of Swift
    /// moved. The three cases below are over source in THIS checkout and each
    /// goes red on its own when the rebase is due.
    ///
    /// Leg 1: `D→A-7`'s two `pearl` strokes. `PatinaColors.Border` is L1-D's
    /// and merges second; `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile`
    /// is a bar at zero on that branch, so merge 5 reds unless X29 runs.
    @Test("the two pearl strokes are ratcheted, and must go to zero once Border exists")
    func thePearlStrokesAreRatchetedToZero() throws {
        var pearl: [String: Int] = [:]
        for path in SourcePin.swiftFiles(under: "Patina/Features/Authentication") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            let count = source.components(separatedBy: "PatinaColors.pearl").count - 1
            if count > 0 { pearl[(path as NSString).lastPathComponent] = count }
        }
        let total = pearl.values.reduce(0, +)

        // The reader has to be real, or the branch below is decoration.
        let designKit = Self.designKitColours()
        #expect(designKit.contains("public enum PatinaColors"), "the design-kit token file was not found")

        if designKit.contains("enum Border") {
            #expect(total == 0, "PatinaColors.Border is on the tip — X29's pearl swap is due: \(pearl)")
        } else {
            #expect(total <= 2, "the pearl budget here is 2 until Border lands, found \(pearl)")
            #expect(pearl["AuthScreenView.swift"] == 2, "the two X29 sites moved: \(pearl)")
        }
    }

    /// Leg 2: `L1F→A-2`'s call site. The receiving half is on this branch; the
    /// property is `AppCoordinator.pendingLinkNotice`, which is L1-F's and
    /// merges fourth. The moment it exists, both call sites must pass it or
    /// `C2-21`/`GAP7B-09`'s acknowledgement half is dead code.
    @Test("the held-link notice is wired the moment the coordinator can supply it")
    func theHeldLinkNoticeIsWiredWhenTheCoordinatorCanSupplyIt() throws {
        let screen = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(screen.contains("var pendingLinkNotice: String?"))

        let coordinator = try SourcePin.read("Patina/App/Coordinators/AppCoordinator.swift")
        guard coordinator.contains("pendingLinkNotice") else { return }

        let content = try SourcePin.read("Patina/ContentView.swift")
        let sheet = try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
        #expect(
            content.contains("pendingLinkNotice: coordinator.pendingLinkNotice"),
            "AppCoordinator.pendingLinkNotice exists and ContentView does not pass it"
        )
        #expect(sheet.contains("pendingLinkNotice:"), "AuthSheet does not pass the notice")
    }

    /// The design kit lives beside the app target, one directory further up
    /// than `SourcePin` reaches.
    private static func designKitColours() -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // apps/mobile/Patina
            .deletingLastPathComponent()   // apps/mobile
            .appendingPathComponent("PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    @Test("the root’s status never renders a filled red panel (VISION §6)")
    func statusIsTintedTextNotAColouredPanel() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(!source.contains("Color.red"))
        #expect(!source.contains(".foregroundStyle(.red)"))
        #expect(source.contains("PatinaColors.terracotta"))
    }

    // MARK: - 5. The session-less resolve, driven (RL4A-02, RL4A-03)

    /// Round three's coverage table named these two cases as `RL3A-02`'s pins
    /// and neither was ever written — the branch was only ever asserted about
    /// as source text (`RL4A-03`).
    ///
    /// The count is the finding (`RL4A-02`). The session-less branch used to
    /// throw from inside the `do`, that throw landed in the general `catch`,
    /// and one tap on one code asked the fallback **twice**: two POSTs of a
    /// live address and code to a pre-auth endpoint, and two hits on 00551's
    /// rate limiter.
    @Test("a session-less resolve the fallback declines is a miss, and it is asked once")
    @MainActor
    func aSessionlessResolveWithNoFallbackIsAMiss() async {
        let asks = VerifyFallbackAsks()
        await withVerifySeams(
            resolvesWithSession: false,
            fallback: TestAccountLoginFallback(
                mintTokenHash: { _, _ in asks.record(); return .init(tokenHash: nil) },
                redeem: { _ in true }
            )
        ) {
            do {
                try await AuthService.shared.verifyOtp(email: "firstflight@patina.cloud", token: "000000")
                Issue.record("a resolve with no session and no fallback returned as a success")
            } catch {
                #expect(error as? AuthVerificationFailure == .resolvedWithoutSession)
            }
            #expect(asks.count == 1, "the fallback was asked \(asks.count) times for one code")
            #expect(
                AuthService.shared.sheetErrorMessage == AuthService.badSignInCodeSentence
            )
        }
    }

    /// The other half: the fallback takes it. `verifyOtp` returns, the fallback
    /// is still asked exactly once, and nothing is left standing in the status
    /// slot behind a sign-in that worked.
    @Test("a session-less resolve the fallback redeems signs in, asked once, with no error left standing")
    @MainActor
    func aSessionlessResolveTakenByTheFallbackSucceeds() async {
        let asks = VerifyFallbackAsks()
        await withVerifySeams(
            resolvesWithSession: false,
            fallback: TestAccountLoginFallback(
                mintTokenHash: { _, _ in asks.record(); return .init(tokenHash: "hashed-token-abc") },
                redeem: { _ in true }
            )
        ) {
            do {
                try await AuthService.shared.verifyOtp(email: "firstflight@patina.cloud", token: "000000")
            } catch {
                Issue.record("the fallback redeemed and verifyOtp threw anyway: \(error)")
            }
            #expect(asks.count == 1, "the fallback was asked \(asks.count) times for one code")
            #expect(AuthService.shared.errorMessage == nil)
        }
    }

    /// Both seams restored on the way out, and the error with them:
    /// `AuthService.shared` is one object shared with every other suite.
    @MainActor
    private func withVerifySeams(
        resolvesWithSession: Bool,
        fallback: TestAccountLoginFallback,
        _ body: () async -> Void
    ) async {
        let service = AuthService.shared
        let savedTransport = service.verifyOtpTransport
        let savedFallback = service.testAccountLogin
        defer {
            service.verifyOtpTransport = savedTransport
            service.testAccountLogin = savedFallback
            service.clearError()
        }
        service.verifyOtpTransport = { _, _ in resolvesWithSession }
        service.testAccountLogin = fallback
        await body()
    }
}

/// How many times the injected fallback was asked. The seams are `@Sendable`,
/// so the counter has to be too.
private final class VerifyFallbackAsks: @unchecked Sendable {
    private var asks = 0
    private let lock = NSLock()

    func record() {
        lock.lock()
        defer { lock.unlock() }
        asks += 1
    }

    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return asks
    }
}
