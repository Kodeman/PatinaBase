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
//
//  One `@Test` per deck row (`RL1E2-05`) and every `SourcePin.read` hoisted
//  out of its wrapper (`RL1E2-15`) — see `NounConsistencyTests`'s header.
//

import Testing
import Foundation

struct SentenceCaseTests {

    // MARK: - Settings (L1-C)

    @Test("Settings' rows are sentence case")
    func settingsRowsAreSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        for titleCase in ["\"Haptic Feedback\"", "\"Contact Us\"", "\"Terms & Privacy\""] {
            #expect(!source.contains(titleCase), "Settings still ships \(titleCase)")
        }
        #expect(source.contains("label: \"Sign out\""))
    }

    /// L1-C flagged this as the one thing the deck did not cover: the row now
    /// reads "Sign out" and opens an alert whose title and confirm button
    /// both still read "Sign Out". The deck row and the matching
    /// `AccountActionsTests` pin update go to L1-C together (fix-round Task
    /// F7) — pinned separately from the rows above so the row fix landing
    /// cannot mask the alert still being Title Case.
    @Test("the sign-out alert matches the row that opens it")
    func settingsSignOutAlertMatchesItsRow() throws {
        let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        #expect(!source.contains(".alert(\"Sign Out\""))
        #expect(!source.contains("Button(\"Sign Out\")"))
    }

    // MARK: - The auth sheet and the account screen (L1-A)

    @Test("the auth sheet's buttons are sentence case")
    func authSheetIsSentenceCase() throws {
        // Code only: :139 is a COMMENT quoting the Title Case it replaced,
        // and the wrapper this case used to carry was masking that, not a
        // violation.
        let source = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        )
        for titleCase in ["\"Sign In\"", "\"Create Account\"", "\"Send Reset Link\"", "\"Sign Up\""] {
            #expect(!source.contains(titleCase), "the auth sheet still ships \(titleCase)")
        }
    }

    @Test("the account screen is sentence case")
    func accountScreenIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/Account/AccountView.swift")
        #expect(!source.contains("\"Sign Out\""))
    }

    @Test("the QR scanner's permission CTA is sentence case")
    func qrScannerIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/QRAuth/Views/QRScannerView.swift")
        #expect(!source.contains("\"Open Settings\""))
    }

    @Test("the camera permission screen's CTA is sentence case")
    func cameraPermissionIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/FirstLaunch/Views/CameraPermissionView.swift")
        #expect(!source.contains("\"Open Settings\""))
    }

    // MARK: - The scan pause menu and the room item menu (L1-B)

    @Test("the scan pause menu is sentence case")
    func scanPauseMenuIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/RoomScan/Shared/Components/PauseMenuView.swift")
        #expect(!source.contains("\"Discard Scan\""))
        #expect(!source.contains("\"Keep Scanning\""))
    }

    @Test("the room item menu is sentence case")
    func roomItemMenuIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/ItemActionMenu.swift")
        for titleCase in ["\"Move to Another Room\"", "\"Copy to Another Room\"", "\"Remove from Room\""] {
            #expect(!source.contains(titleCase), "the item menu still ships \(titleCase)")
        }
    }

    // MARK: - B-20 — the room CTA is a label, not a sentence built by hand

    /// `RL1E2-08`: `B-20` was in the coverage table with a pin that did not
    /// exist. `Features/Rooms/**` is L1-B's glob, but L1-C applied the row
    /// (deck note `RL1E-03c`), so the wrapper names both.
    @Test("the room CTA is a fixed label, not 'for the ' plus a room name")
    func roomCTAIsAFixedLabel() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/RoomProjectView.swift")
        #expect(!source.contains("Browse pieces for the \\("))
        #expect(source.contains("\"Browse pieces for this room\""))
    }

    // MARK: - The two sites this fix round found on the built branch

    /// `RL1E-11`: the taste-portrait screen's primary button. `StyleQuiz/**`
    /// is L1-A's.
    @Test("the taste portrait's primary CTA is sentence case and names the piece")
    func stylePortraitCTAIsSentenceCase() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleResultView.swift")
        #expect(!source.contains("\"View Recommendations\""))
        #expect(source.contains("\"See your pieces\""))
    }

    /// `RL1E-11`: Title Case and sentence case adjacent inside one section —
    /// "Retake Style Quiz" sits directly above "Get design help" and
    /// "Settings". `ProfileView.swift` is L1-C's.
    @Test("the Studio's action rows do not mix casing inside one section")
    func studioActionRowsShareOneCasing() throws {
        let source = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        #expect(!source.contains("\"Retake Style Quiz\""))
        #expect(source.contains("\"Retake your style quiz\""))
    }

    /// `RL1E2-13`: one screen shipped three casings of one concept — the
    /// header button announced "New board", the creation alert titled
    /// "New Board", and the empty state's CTA read "Create Board".
    /// `Features/Collections/Views/**` has no W1 owner, so this is L1-E's.
    @Test("the Saved screen spells its board actions one way")
    func theSavedScreenDoesNotMixCasing() throws {
        let source = try SourcePin.read("Patina/Features/Collections/Views/CollectionsView.swift")
        #expect(!source.contains("\"New Board\""))
        #expect(!source.contains("\"Create Board\""))
        #expect(source.contains("\"New board\""))
        #expect(source.contains("\"Create board\""))
    }
}
