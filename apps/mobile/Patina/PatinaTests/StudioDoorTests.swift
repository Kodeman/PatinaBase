//
//  StudioDoorTests.swift
//  PatinaTests
//
//  W3-fix. The house-first root has ONE Studio door — the bar's tab — and this
//  is what is behind it: the profile composition, the Settings sheet, Sign Out,
//  and Delete Account. The tour's step 3 points at that door, and the header's
//  pill (B-1's fallback door for the root without a bar) is gated off wherever
//  the bar draws.
//
//  Split out of `HouseFirstRootTests` so neither file outgrows SwiftLint's
//  type-body ceiling; the behavioural half of the same story lives there.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct StudioDoorTests {

    /// §6a's exit: one Studio door on this root, and B-8's step 3 points at it.
    ///
    /// The tour is hoisted into `HouseFirstRoot` so its model covers the bar as
    /// well as the four stacks, the bar's `.studio` arm carries the anchor, and
    /// the header's pill — B-1's fallback door for the root without a bar — is
    /// gated off. The two mounts are mutually exclusive, which
    /// `FirstLaunchTourTests.everyDefaultStepAnchorHasExactlyOneProductionMountPerRoot`
    /// pins from the other side.
    @Test
    func stepThreeAnchorsOnTheBarAndTheHeaderPillIsGoneOnThisRoot() throws {
        let bar = try SourcePin.read("Patina/Features/Navigation/PatinaTabBar.swift")
        let root = try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        let daily = try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        let header = try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")

        // The anchor is on the bar, on the `.studio` arm, with its raw value
        // untouched (it keys the Sanity document behind step 3).
        #expect(SourceScan.code(in: bar).contains("if tab == .studio {"))
        #expect(SourceScan.code(in: bar).contains("control.firstLaunchTourAnchor(.profileMonogram)"))
        #expect(FirstLaunchTourAnchor.profileMonogram.rawValue == "profile-monogram")

        // The tour is hosted above the stacks, so the popover can reach it.
        #expect(SourceScan.code(in: root).contains("FirstLaunchTour(canAutoStart:"))

        // And the header's duplicate door is gated off wherever the bar draws.
        #expect(SourceScan.code(in: header).contains("if showsStudioControl {"))
        #expect(SourceScan.code(in: daily).contains("showsStudioControl: !coordinator.isHouseFirstRoot"))
    }

    /// The walk's finding: on the flag-on root there was no way to Settings,
    /// Sign Out or Delete Account, because the Studio tab mounted the hub alone
    /// and `ProfileView` — which carries the Settings row — was unreachable.
    /// Apple 5.1.1 (v) makes account deletion a review requirement, so the door
    /// is pinned rather than only walked.
    @Test
    func settingsAndAccountAreOneTapFromTheStudioTab() throws {
        // The tab root IS the profile composition.
        let tabRoot = try SourcePin.read("Patina/Features/Navigation/TabRoot.swift")
        #expect(SourceScan.code(in: tabRoot).contains("struct StudioTabRoot"))
        #expect(SourceScan.code(in: tabRoot).contains("ProfileView()"))
        #expect(SourceScan.code(in: tabRoot).contains(".tabRoot(.studio)"))

        // …which carries the Settings row that presents the sheet…
        let profile = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        #expect(profile.contains("label: \"Settings\""))
        #expect(SourceScan.code(in: profile).contains("coordinator.presentedSheet = .settings"))

        // …the sheet is `SettingsView`, which carries Sign Out and pushes
        // `AccountView`, which carries Delete Account.
        let content = try SourcePin.read("Patina/ContentView.swift")
        #expect(SourceScan.code(in: content).contains("case .settings:"))
        #expect(SourceScan.code(in: content).contains("SettingsView()"))

        let settings = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        #expect(settings.contains("\"Sign Out\""))
        #expect(SourceScan.code(in: settings).contains("AccountView()"))

        let account = try SourcePin.read("Patina/Features/Account/AccountView.swift")
        #expect(account.contains("AccountView.DeleteAccountButton"))
    }
}
