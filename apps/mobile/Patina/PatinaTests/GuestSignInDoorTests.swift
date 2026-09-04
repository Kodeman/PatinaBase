//
//  GuestSignInDoorTests.swift
//  PatinaTests
//
//  `B-13` / `C1-14`, from L1-A's integration notes `C-L1A-1` and `C-L1A-2`.
//
//  A guest's Studio card offered "Open settings", and Settings then held no
//  sign-in row at all — only a QR scanner that needs the session the guest has
//  not got. Two dead ends pointing at each other. Both files are L1-C's, so the
//  door L1-A built in `AccountView` had nobody pointing at it from here.
//

import Foundation
import Testing
@testable import Patina

@Suite("The guest’s door back in")
struct GuestSignInDoorTests {

    @Test("the guest Studio card presents the auth sheet, not Settings")
    func theStudioCardSignsYouIn() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Profile/Views/StudioHubView.swift")
        )
        #expect(code.contains("StudioHub.GuestSignInButton"))
        #expect(code.contains("coordinator.presentedSheet = .auth"))
        #expect(!code.contains("StudioHub.GuestSettingsButton"),
                "the card still routes a guest to a Settings screen that had no sign-in row (B-13)")
    }

    @Test("Settings offers a signed-out reader a way in, and hides the row that needs a session")
    func settingsHasASignInRowForAGuest() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(code.contains("SettingsView.SignInButton"))

        // The sign-in row is guarded to the signed-out case…
        let guardIndex = try #require(code.range(of: "if !authService.isAuthenticated")?.lowerBound)
        let signInIndex = try #require(code.range(of: "SettingsView.SignInButton")?.lowerBound)
        #expect(guardIndex < signInIndex)

        // …and "Sign in on the web" — which approves a PORTAL session with this
        // device's session — is no longer offered to someone who has none.
        let authGuard = try #require(code.range(of: "if authService.isAuthenticated")?.lowerBound)
        let qrRow = try #require(code.range(of: "Sign in on the web")?.lowerBound)
        #expect(authGuard < qrRow,
                "the QR row still sits above the auth guard, so a guest is offered it (C1-14)")
    }
}
