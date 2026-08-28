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

    /// `StudioHubView` has no scroll view and no title of its own, so its
    /// wrapper still supplies both — that responsibility moved into
    /// `TabRoot.swift`, it did not disappear.
    @Test
    func theStudioWrapperSuppliesTheScrollViewTheHubDoesNotHave() throws {
        let source = try SourcePin.read("Patina/Features/Navigation/TabRoot.swift")
        #expect(source.contains("StudioHubView()"))
        #expect(source.contains("ScrollView"))
    }
}
