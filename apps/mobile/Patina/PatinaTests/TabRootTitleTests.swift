//
//  TabRootTitleTests.swift
//  PatinaTests
//
//  W3 · N2. A tab's root screen is a destination, not a pushed one: it carries
//  the C4 canonical name of the destination the bar's label stands for, and it
//  has nothing to go back to, so it draws no back chevron.
//
//  The canonical strings are never re-typed here or in the wrappers — they are
//  read from `PatinaTab.canonicalName`, which is the one place B-7 (a) allows
//  them to live. A literal in a wrapper would let the bar's VoiceOver label and
//  the screen's title drift apart, which is exactly the split B-7 exists to
//  prevent.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct TabRootTitleTests {

    // MARK: - The canonical names, per C4 / B-7

    @Test
    func eachTabRootCarriesItsCanonicalName() {
        #expect(PatinaTab.spaces.canonicalName == "Your Spaces")
        #expect(PatinaTab.pieces.canonicalName == "Browse pieces")
        #expect(PatinaTab.studio.canonicalName == "Your Studio")
        #expect(PatinaTab.today.canonicalName == "Today")
    }

    /// The wrappers take their title from `PatinaTab`, so the bar's VoiceOver
    /// label and the destination's title are the same string by construction.
    @Test
    func theWrappersReadTheirTitleFromPatinaTabRatherThanRetypingIt() throws {
        let source = try SourcePin.read("Patina/Features/Navigation/TabRoot.swift")

        #expect(source.contains(".tabRoot(.spaces)"))
        #expect(source.contains(".tabRoot(.pieces)"))
        #expect(source.contains(".tabRoot(.studio)"))
        #expect(source.contains("navigationTitle(tab.canonicalName)"))

        for literal in ["\"Your Spaces\"", "\"Browse pieces\"", "\"Your Studio\""] {
            #expect(
                !source.contains(literal),
                "\(literal) is re-typed in TabRoot.swift; it must come from PatinaTab.canonicalName"
            )
        }
    }

    // MARK: - A tab root has nothing to go back to (n1-notes §1b)

    /// `YourSpacesView` and `RecommendationsView` both call `.patinaScreen`,
    /// which pins a back chevron written for a pushed screen. As a tab root
    /// there is no previous screen, and the shots caught the chevron on both.
    /// One gate in the chrome covers both files.
    @Test
    func theBackChevronIsSuppressedOnATabRoot() throws {
        let source = try SourcePin.read("Patina/Design/Components/PatinaScreenChrome.swift")
        #expect(source.contains("@Environment(\\.isTabRoot)"))
        #expect(source.contains("if !isTabRoot"))
    }

    /// The default is `false`, so every pushed screen in the app — and the
    /// whole flag-off root — keeps the chevron it has today.
    @Test
    func isTabRootDefaultsToFalse() {
        #expect(EnvironmentValues().isTabRoot == false)
    }

    // MARK: - The wrappers are what the bar mounts

    @Test
    func theHouseFirstRootMountsTheWrappersAndNoLongerShimsStudio() throws {
        let source = try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        #expect(source.contains("SpacesTabRoot()"))
        #expect(source.contains("PiecesTabRoot()"))
        #expect(source.contains("StudioTabRoot()"))
        #expect(
            !source.contains("private var studioRoot"),
            "n1-notes §1c: the ScrollView/title shim comes out when the wrapper lands"
        )
    }

    /// R2: the Studio tab's root is the whole profile composition, not the hub
    /// alone — the identity line, the hub, and the Settings/Account door, which
    /// is what the monogram opens on the flag-off root. `ProfileView` owns the
    /// scroll view and the header, so the wrapper supplies neither; it supplies
    /// the canonical name and the tab-root seam.
    @Test
    func theStudioWrapperMountsTheProfileComposition() throws {
        let source = try SourcePin.read("Patina/Features/Navigation/TabRoot.swift")
        #expect(source.contains("ProfileView()"))
        #expect(!source.contains("ScrollView"), "ProfileView owns the scroll view")

        // The hub is still on that screen — inside `ProfileView`, where the
        // flag-off root has always drawn it.
        let profile = try SourcePin.read("Patina/Features/Profile/Views/ProfileView.swift")
        #expect(profile.contains("StudioHubView()"))
        // And the canonical name is read, never re-typed.
        #expect(profile.contains("PatinaTab.studio.canonicalName"))
        #expect(!profile.contains("\"Your Studio\""))
    }
}
