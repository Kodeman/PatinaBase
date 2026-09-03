//
//  SentenceCaseTests.swift
//  PatinaTests
//
//  C5-10: Title Case and sentence case collide inside single screens.
//  Settings and the auth sheet are the two highest-density offenders; the
//  Studio's YOUR PROFILE section stacks "Retake Style Quiz" directly above
//  "Get design help" and "Settings".
//
//  PROGRAM.md §3 · L1-E: "within one screen's string set, casing is
//  consistent." Pinned per site, from `build/waves/w1/l1-e-copy-deck.md`.
//  Sites in files another lane owns are wrapped in `withKnownIssue` naming
//  the row and the lane — see `ErrorVoiceTests`'s header.
//

import Testing
import Foundation

struct SentenceCaseTests {

    // MARK: - Settings (L1-C)

    @Test("Settings' rows are sentence case")
    func settingsRowsAreSentenceCase() throws {
        withKnownIssue("deck rows C5-10 / SettingsView.swift:81,121,156,159 are L1-C's; unwrap after L1-C merges") {
            let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
            for titleCase in ["\"Haptic Feedback\"", "\"Contact Us\"", "\"Terms & Privacy\""] {
                #expect(!source.contains(titleCase), "Settings still ships \(titleCase)")
            }
            #expect(source.contains("label: \"Sign out\""))
        }
    }

    /// L1-C flagged this as the one thing the deck did not cover: the row now
    /// reads "Sign out" and opens an alert whose title and confirm button
    /// both still read "Sign Out". The deck row and the matching
    /// `AccountActionsTests` pin update go to L1-C together (fix-round Task
    /// F7) — pinned separately from the rows above so the row fix landing
    /// cannot mask the alert still being Title Case.
    @Test("the sign-out alert matches the row that opens it")
    func settingsSignOutAlertMatchesItsRow() throws {
        withKnownIssue("fix-round deck row C5-10 / SettingsView.swift:212,214 is L1-C's (Task F7)") {
            let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
            #expect(!source.contains(".alert(\"Sign Out\""))
            #expect(!source.contains("Button(\"Sign Out\")"))
        }
    }

    // MARK: - The auth sheet and the account screen (L1-A)

    @Test("the auth sheet's buttons are sentence case")
    func authSheetIsSentenceCase() throws {
        withKnownIssue("deck rows C5-10 / AuthenticationView.swift are L1-A's; unwrap after L1-A merges") {
            let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
            for titleCase in ["\"Sign In\"", "\"Create Account\"", "\"Send Reset Link\"", "\"Sign Up\""] {
                #expect(!source.contains(titleCase), "the auth sheet still ships \(titleCase)")
            }
        }
    }

    @Test("the account screen and the two permission screens are sentence case")
    func accountAndPermissionScreensAreSentenceCase() throws {
        withKnownIssue("deck rows C5-10 in Account/QRAuth/FirstLaunch are L1-A's; unwrap after L1-A merges") {
            let account = try SourcePin.read("Patina/Features/Account/AccountView.swift")
            #expect(!account.contains("\"Sign Out\""))
            for path in [
                "Patina/Features/QRAuth/Views/QRScannerView.swift",
                "Patina/Features/FirstLaunch/Views/CameraPermissionView.swift"
            ] {
                let source = try SourcePin.read(path)
                #expect(!source.contains("\"Open Settings\""), "\(path) still ships \"Open Settings\"")
            }
        }
    }

    // MARK: - The scan pause menu and the room item menu (L1-B)

    @Test("the scan pause menu and the room item menu are sentence case")
    func scanAndRoomMenusAreSentenceCase() throws {
        withKnownIssue("deck rows C5-10 in RoomScan and Rooms are L1-B's; unwrap after L1-B merges") {
            let pause = try SourcePin.read("Patina/Features/RoomScan/Shared/Components/PauseMenuView.swift")
            #expect(!pause.contains("\"Discard Scan\""))
            #expect(!pause.contains("\"Keep Scanning\""))
            let menu = try SourcePin.read("Patina/Features/Rooms/Views/ItemActionMenu.swift")
            for titleCase in ["\"Move to Another Room\"", "\"Copy to Another Room\"", "\"Remove from Room\""] {
                #expect(!menu.contains(titleCase), "the item menu still ships \(titleCase)")
            }
        }
    }

    // MARK: - The two sites this fix round found on the built branch

    /// `RL1E-11`: the taste-portrait screen's primary button. `StyleQuiz/**`
    /// is L1-A's.
    @Test("the taste portrait's primary CTA is sentence case and names the piece")
    func stylePortraitCTAIsSentenceCase() throws {
        withKnownIssue("deck row C5-10 / StyleResultView.swift:54 is L1-A's; unwrap after L1-A merges") {
            let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleResultView.swift")
            #expect(!source.contains("\"View Recommendations\""))
            #expect(source.contains("\"See your pieces\""))
        }
    }

    /// `RL1E-11`: Title Case and sentence case adjacent inside one section —
    /// "Retake Style Quiz" sits directly above "Get design help" and
    /// "Settings". `ProfileView.swift` is L1-C's.
    @Test("the Studio's action rows do not mix casing inside one section")
    func studioActionRowsShareOneCasing() throws {
        withKnownIssue("deck row C5-10 / ProfileView.swift:154 is L1-C's; unwrap after L1-C merges") {
            let source = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
            #expect(!source.contains("\"Retake Style Quiz\""))
            #expect(source.contains("\"Retake your style quiz\""))
        }
    }
}
