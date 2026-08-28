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
import SwiftUI
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

    // MARK: - w5: why round 3's scroll fix did not reach the last row
    //
    // This test above is the one that went green while walk 4 still could not
    // reach `Your spaces` and `Your profile`. Measured on `dr-w5-a11y`
    // (402×874 pt, `accessibility-extra-extra-large`): the ScrollView is real
    // and it does scroll — but it was capped at a hardcoded 460 pt, so its
    // viewport ran 336…796 on an 874 pt screen while the column measured
    // 1,522 pt. Three-and-a-third viewports of travel, and ~250 pt of screen
    // left unused above the panel. The 20 pt shell inset sat OUTSIDE the
    // ScrollView, so the visible strip 796…816 — the bottom edge of the panel,
    // where a thumb lands — was panel that did not scroll. Walk 4's four
    // attempts all began at y=800 or y=850, in that strip or below the panel
    // entirely; a drag from y=790 moved the column and a drag from y=800 did
    // not. Both facts are pinned below.

    /// Cause (a). 460 was a guess: right on no device in particular, and on
    /// the review device it threw away a quarter of the screen. The panel now
    /// takes the room it is actually given, and keeps sizing to its content
    /// whenever the content fits.
    @Test("the panel takes the height it is given, not a hardcoded 460")
    func thePanelIsNotCappedAtAGuessedHeight() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Components/CompanionHearthView.swift"
        )
        #expect(source.contains("companionAccessibilityPanelMaxHeight") == false)
        #expect(source.contains("ViewThatFits(in: .vertical)"))
    }

    /// Cause (b). The inset has to travel WITH the rows: applied to the
    /// container instead, it is a strip of panel that does not scroll.
    @Test("the panel's inset scrolls with the rows, leaving no dead strip")
    func thePanelInsetRidesInsideTheScrollingColumn() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Components/CompanionHearthView.swift"
        )
        let columnDecl = try #require(source.range(of: "private func expandedColumn("))
        let inset = try #require(source.range(of: ".padding(companionPanelPadding)"))
        let viewThatFits = try #require(source.range(of: "ViewThatFits(in: .vertical)"))

        // Declared on the column, before the ViewThatFits that wraps it —
        // i.e. inside whatever scrolls, never around it.
        #expect(columnDecl.upperBound < inset.lowerBound)
        #expect(inset.upperBound < viewThatFits.lowerBound)
    }

    // MARK: - w5: the orb yields at accessibility text sizes
    //
    // Walk 4 finding 1: on the flag-off root at an accessibility size the
    // 64 pt dock's frame (y=748…812, x=169…233) sat wholly inside the
    // editorial story card (y=711…961) and won the hit test, so a tap meant
    // for the story opened the Companion. The dock is the flag-off root's only
    // nav surface, and the ruling for this already exists — W1b's
    // `yieldsToPinnedFooter`: the dock steps aside to the 44 pt corner mark
    // rather than trying to solve an overlap with an inset. Same yield, same
    // reason, one more condition.

    @Test("at an accessibility text size the dock yields to the corner mark")
    func theDockYieldsAtAccessibilityTextSizes() {
        #expect(CompanionHearthMetrics.yieldsToAccessibilityText(.accessibility1))
        #expect(CompanionHearthMetrics.yieldsToAccessibilityText(.accessibility5))
        // `.xxxLarge` is the largest NON-accessibility size, and walk 4 proved
        // the rail behaves correctly there — the yield must not reach it.
        #expect(CompanionHearthMetrics.yieldsToAccessibilityText(.xxxLarge) == false)
        #expect(CompanionHearthMetrics.yieldsToAccessibilityText(.large) == false)
    }

    /// The reservation has to shrink with the dock or the surface pays 120 pt
    /// for a 72 pt mark — which is the story card and the house rail losing
    /// space they need at exactly the text size that needs it most.
    @Test("the reservation shrinks to the mark it now reserves for")
    func theReservationFollowsTheYield() {
        #expect(CompanionHearthMetrics.reservation(accessibilityText: false)
                == CompanionHearthMetrics.reservedHeight)
        #expect(CompanionHearthMetrics.reservation(accessibilityText: true)
                == CompanionHearthMetrics.minimalDockHeight)
        #expect(CompanionHearthMetrics.minimalDockHeight
                < CompanionHearthMetrics.reservedHeight)
        // The mark plus `minimalView`'s own lift, and nothing else — no
        // caption row, because the corner mark has no caption.
        #expect(CompanionHearthMetrics.minimalDockHeight
                == CompanionHearthMetrics.minimalDiameter
                    + CompanionHearthMetrics.overlayBottomInset)
    }

    /// The two halves must read the same environment value. When they
    /// disagree the surface either keeps dead space under a dock that yielded
    /// or hands its taps to a dock that did not.
    @Test("the overlay and the reservation yield on the same rule")
    func theOverlayAndTheReservationAgree() throws {
        let overlay = try SourcePin.read(
            "Patina/Features/Companion/Views/CompanionOverlay.swift"
        )
        #expect(overlay.contains("@Environment(\\.dynamicTypeSize) private var dynamicTypeSize"))
        #expect(overlay.contains(
            "if CompanionHearthMetrics.yieldsToAccessibilityText(dynamicTypeSize) { return .minimal }"
        ))

        let reservation = try SourcePin.read(
            "Patina/Design/Components/CompanionSafeArea.swift"
        )
        #expect(reservation.contains("@Environment(\\.dynamicTypeSize) private var dynamicTypeSize"))
        #expect(reservation.contains("CompanionHearthMetrics.reservation("))
    }

    /// Yielding must not cost VoiceOver the one thing the collapsed Hearth
    /// announced — `collapsedView` hides the caption at accessibility sizes on
    /// the promise that "the same context remains available as the Companion
    /// button's announced accessibility value".
    @Test("the corner mark still announces what needs the eye")
    func theCornerMarkKeepsItsAnnouncedValue() throws {
        let overlay = try SourcePin.read(
            "Patina/Features/Companion/Views/CompanionOverlay.swift"
        )
        #expect(overlay.contains(".accessibilityValue(contextualCollapsedHint)"))
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
