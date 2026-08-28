//
//  CompanionSheetDriverTests.swift
//  PatinaTests
//
//  W4 third fix round — fix2-review MAJ-1, and the two layout defects the
//  w4 re-walk found on Today at an accessibility text size.
//
//  `SourcePin` is used for the mounts and the absences — what modifier a view
//  carries is not reachable from a unit test any other way, and it is exactly
//  the fact each of these defects turned on.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct CompanionSheetDriverTests {

    // MARK: - MAJ-1: one sheet driver on the Companion

    /// `CompanionOverlay` carried `.helpPanel(isPresented:)` and
    /// `.sheet(isPresented:)` on one modifier chain — the third and last
    /// instance of the shape M-2 collapsed on `ProductDetailView` and H1 on
    /// `RoomProjectView`. Two sheets on one chain race and one of them is
    /// silently never presented; here the loser can be the SP-06 claim, and a
    /// claim that never presents leaves `LocalStoreClaim.isAsking` true
    /// forever — so the account's hydrate is suppressed for the whole sign-in
    /// and the person is never asked the question at all.
    @Test("the Companion presents both its sheets through one driver")
    func theCompanionHasOneSheetDriver() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Views/CompanionOverlay.swift"
        )
        #expect(source.contains(".sheet(item: $presented)"))
        #expect(source.contains("enum Presented"))

        // Neither of the two shapes that raced may come back to this file.
        // Read past the comments — the doc comment above `Presented` names both
        // shapes precisely because they are what it exists to prevent.
        let code = Self.codeLines(of: source)
        #expect(code.contains(".sheet(isPresented:") == false)
        #expect(code.contains(".helpPanel(") == false)
    }

    /// The file with its `//` comment lines dropped, so a pin on an absent
    /// construct is not defeated by a comment that names it.
    private static func codeLines(of source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// The claim is raised by `LocalStoreClaim`, not by a tap, so the one
    /// driver has to follow `isAsking` rather than be set beside it.
    @Test("the claim sheet still follows LocalStoreClaim")
    func theClaimStillDrivesTheSheet() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Views/CompanionOverlay.swift"
        )
        #expect(source.contains(".onChange(of: localStoreClaim.isAsking)"))
        #expect(source.contains("presented = .localStoreClaim"))
        #expect(source.contains("LocalStoreClaimSheet("))
        // A swipe-down is an answer too — and must be the same answer the
        // sheet's own "Keep them" gives, or nothing ever hydrates.
        #expect(source.contains("if localStoreClaim.isAsking { localStoreClaim.keep() }"))
    }

    @Test("the Companion help panel still has a way up")
    func theHelpPanelStillOpens() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Views/CompanionOverlay.swift"
        )
        #expect(source.contains("presented = .help"))
        #expect(source.contains("HelpPanelSheet("))
        #expect(source.contains("SurfaceKeys.IOSApp.Companion.root"))
    }

    /// The claim's own decision is unchanged by the collapse: only a real
    /// account taking over a store no account has owned, with guest work in it.
    @Test("collapsing the driver did not move the claim's own rule")
    func theClaimRuleIsUnchanged() {
        #expect(LocalStoreClaim.shouldAsk(previousOwner: nil, hasGuestWork: true))
        #expect(LocalStoreClaim.shouldAsk(previousOwner: nil, hasGuestWork: false) == false)
        #expect(LocalStoreClaim.shouldAsk(previousOwner: "someone", hasGuestWork: true) == false)
    }

    // MARK: - The column that would not scroll at XXL

    @Test("the Companion panel's rows scroll at an accessibility text size")
    func theCompanionPanelScrollsAtAccessibilitySizes() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Components/CompanionHearthView.swift"
        )
        #expect(source.contains("dynamicTypeSize.isAccessibilitySize"))
        #expect(source.contains("ScrollView(.vertical, showsIndicators: true)"))
    }

    // MARK: - The two fixed heights that overlapped the column

    /// The demoted story row reported its weight (a small figure) to the
    /// enclosing VStack while its text drew past it, so it overlapped the house
    /// rail above it by ~13pt at XXL and — being the later sibling — hit-tested
    /// on top, making the covered portion of the room cards untappable.
    @Test("the story card's height is a minimum, not a fixed frame")
    func theStoryCardGrowsWithItsContent() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/DailyStoryCard.swift")
        #expect(source.contains(".frame(minHeight: height)"))
        #expect(source.contains(".frame(height: height)") == false)
    }

    @Test("a house-rail card's height is a minimum too")
    func theRailCardGrowsWithItsContent() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/YourHouseRail.swift")
        #expect(source.contains(".frame(minHeight: 150, alignment: .topLeading)"))
        #expect(source.contains(".frame(width: 240, height: 150, alignment: .topLeading)") == false)
    }
}
