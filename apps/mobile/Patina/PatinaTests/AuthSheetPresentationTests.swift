//
//  AuthSheetPresentationTests.swift
//  PatinaTests
//
//  WP-NAV / U21 — auth as a sheet. Pins `PresentedSheet.auth`'s stable
//  identity (SwiftUI's `.sheet(item:)` keys presentation off
//  `Identifiable.id`) and confirms `AuthSheet` builds without a live/
//  authenticated `AuthService` session.
//

import SwiftUI
import Testing
@testable import Patina

@MainActor
struct AuthSheetPresentationTests {

    @Test
    func authSheetHasStableIdentity() {
        #expect(AppCoordinator.PresentedSheet.auth.id == "auth")
    }

    @Test
    func authSheetIsEqualToItself() {
        #expect(AppCoordinator.PresentedSheet.auth == AppCoordinator.PresentedSheet.auth)
    }

    @Test
    func authSheetIsDistinctFromOtherSheets() {
        #expect(AppCoordinator.PresentedSheet.auth != AppCoordinator.PresentedSheet.qr)
        #expect(AppCoordinator.PresentedSheet.auth != AppCoordinator.PresentedSheet.settings)
        #expect(AppCoordinator.PresentedSheet.auth.id != AppCoordinator.PresentedSheet.qr.id)
    }

    @Test
    func authSheet_buildsBodyWithoutCrashing() {
        // Smoke: constructing the view body type-checks the AuthScreenView
        // wiring + both nested sheets. No mocked AuthService is needed —
        // the shared singleton's default (signed-out) state is sufficient.
        let sheet = AuthSheet()
        _ = sheet.body
    }

    // MARK: - SP-09 · the design-request soft wall

    /// F27/F112/F141: the wall arrived with no Cancel, no ✕ and no "Look
    /// around first" (AuthSheet passes `showGuest: false`), so the only exit
    /// was the sheet's own drag and nothing on screen said the request had
    /// survived.
    @Test("the soft wall names what it is gating and can be cancelled")
    func softWallCarriesTitleAndCancel() throws {
        #expect(DesignRequestAuthCopy.wallTitle == "Sign in to send your request")
        #expect(DesignRequestAuthCopy.reviewHint == "You’ll sign in to send this.")
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
        #expect(source.contains("ToolbarItem(placement: .cancellationAction)"))
        #expect(source.contains("Button(\"Cancel\")"))
    }

    @Test("the review step says it before the send, not after")
    func reviewStepCarriesTheHint() throws {
        let source = try SourcePin.read("Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift")
        #expect(source.contains("DesignRequestAuthCopy.reviewHint"))
    }

    @Test("the design-request flow presents the titled wall")
    func flowPresentsTheTitledWall() throws {
        let source = try SourcePin.read("Patina/Features/DesignServices/DesignRequestFlowView.swift")
        #expect(source.contains("AuthSheet(title: DesignRequestAuthCopy.wallTitle)"))
        // Cancelling must not leave the flow waiting to auto-send.
        #expect(source.contains("awaitingAuthToSend = false"))
    }

    // MARK: - B-12 · C1-14 · the guest's door out of Account

    /// PROGRAM.md §3 · L1-A names this suite as the one that must pin
    /// `presentedSheet = .auth` from Settings and the Studio guest card. On
    /// `main` a guest landed on `person.circle.fill`, "Not signed in",
    /// "Email —", "Member since —" and ONE button, which opened a QR scanner
    /// needing the session they have not got. `signedOutSection` — the whole
    /// of B-12's fix — was pinned by nothing until RL3A-05 said so.
    @Test("a guest sees one sentence and a door, not a dead account card")
    func aGuestAccountScreenOffersADoor() throws {
        let source = try SourcePin.read("Patina/Features/Account/AccountView.swift")

        // The branch: the account card is for an account.
        #expect(source.contains("if authService.isAuthenticated {"))
        #expect(source.contains("signedOutSection"))
        #expect(source.contains("private var signedOutSection: some View {"))

        let start = try #require(source.range(of: "private var signedOutSection: some View {"))
        let end = try #require(source.range(of: "// MARK: - Header"))
        let section = String(source[start.lowerBound..<end.lowerBound])
        #expect(section.contains("You’re looking around without an account."))
        #expect(section.contains("coordinator.presentedSheet = .auth"))
        #expect(section.contains("AccountView.SignInButton"))

        // And the dead card a guest used to land on is now only reachable
        // from the authenticated branch: `headerSection` (whose "Not signed
        // in" fallback is what a guest read) and `accountSection`'s two em-dash
        // rows sit above the `} else {`, not below it.
        let bodyStart = try #require(source.range(of: "var body: some View {"))
        let bodyEnd = try #require(source.range(of: ".background(PatinaColors.Background.primary)"))
        let body = String(source[bodyStart.lowerBound..<bodyEnd.lowerBound])
        let branch = try #require(body.range(of: "} else {"))
        let signedIn = String(body[body.startIndex..<branch.lowerBound])
        let guest = String(body[branch.upperBound...])
        #expect(signedIn.contains("headerSection"))
        #expect(signedIn.contains("accountSection"))
        #expect(!guest.contains("headerSection"))
        #expect(!guest.contains("accountSection"))
        #expect(guest.contains("signedOutSection"))
    }

    /// `C1-14`'s second half: "Sign in on the web" approves a PORTAL sign-in
    /// from a session the guest does not have, so the QR row belongs inside
    /// the authenticated branch — not in the signed-out one, and not above it.
    @Test("the QR row is inside the authenticated branch")
    func theQrRowIsInsideTheAuthenticatedBranch() throws {
        let source = try SourcePin.read("Patina/Features/Account/AccountView.swift")
        let signedOutStart = try #require(source.range(of: "private var signedOutSection: some View {"))
        let signedOutEnd = try #require(source.range(of: "// MARK: - Header"))
        let signedOut = String(source[signedOutStart.lowerBound..<signedOutEnd.lowerBound])
        #expect(!signedOut.contains("presentedSheet = .qr"))
        #expect(!signedOut.lowercased().contains("qr"))

        // It still exists, in the section a signed-in reader gets.
        #expect(source.contains("presentedSheet = .qr"))
        let actionsStart = try #require(source.range(of: "private var actionsSection: some View {"))
        let actions = String(source[actionsStart.lowerBound...].prefix(1600))
        #expect(actions.contains("presentedSheet = .qr"))
    }

    @Test
    func authSheetBuildsWithATitle() {
        _ = AuthSheet(title: DesignRequestAuthCopy.wallTitle).body
    }

    /// The soft wall's chrome belongs to the soft wall. The same view is the
    /// app-level `.auth` sheet the Studio hub CTA, the notification feed's
    /// guest CTA and the Companion prompt raise — a nav bar carrying a blank
    /// title and a Cancel none of them had before would read there as an
    /// unfinished screen, so the untitled presentation stays bare.
    @Test("only the titled presentation carries the nav bar and Cancel")
    func untitledPresentationStaysBare() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
        let start = try #require(source.range(of: "var body: some View {"))
        let end = try #require(source.range(of: "private var gate: some View {"))
        let body = String(source[start.lowerBound..<end.lowerBound])
        #expect(body.contains("if let title {"))
        // The chrome is inside the titled branch; the else branch is `gate` alone.
        let branch = try #require(body.range(of: "} else {"))
        let titled = String(body[body.startIndex..<branch.lowerBound])
        let untitled = String(body[branch.upperBound...])
        #expect(titled.contains("NavigationStack"))
        #expect(titled.contains("ToolbarItem(placement: .cancellationAction)"))
        #expect(!untitled.contains("NavigationStack"))
        #expect(!untitled.contains("Cancel"))
    }
}
