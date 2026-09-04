//
//  FirstLaunchTourPlacementTests.swift
//  PatinaTests
//
//  `W1-C-13`: step 2's popover was drawn over the tab bar — "renders across the
//  bottom of the screen, covering the house rail and all of the tab bar except
//  a sliver of 'Tod…'" (walk C shot 93, again at re-walk 2 shot 57). Step 3 was
//  the proof the machinery could do better: its card sits above the bar with
//  the Studio tab punched out of the scrim beneath it.
//
//  The cause is which container the anchors measure themselves in.
//  `HouseFirstRoot` hosts the tour ABOVE `rootContent`, and the bar is a
//  `safeAreaInset` inside `rootContent` — so the bar is inside the tour's
//  coordinate space, and an anchor in the "upper half" of that space can still
//  have a card's worth of room only if you ignore the 49 pt of chrome closing
//  it. The midpoint rule ignored it.
//
//  Geometry below is measured on `ff-w1f-impl` (iPhone 17 Pro, 402 × 874):
//  the tour root is 402 × 778 (screen y 62 … 840) and the bar's tappable row
//  is screen y 791 … 840 — local 729 … 778, i.e. exactly
//  `PatinaTabBar.itemHeight`. The 34 pt home indicator is below the root's
//  own bounds and is deliberately not reserved.
//

import Testing
import SwiftUI
@testable import Patina

struct FirstLaunchTourPlacementTests {

    private static let container: CGFloat = 778
    private static let barRow: CGFloat = 49

    private func anchor(_ minY: CGFloat, _ maxY: CGFloat) -> FirstLaunchTourPopoverPlacement.AnchorGeometry {
        FirstLaunchTourPopoverPlacement.AnchorGeometry(
            midY: (minY + maxY) / 2,
            containerHeight: Self.container,
            rect: CGRect(x: 20, y: minY, width: 362, height: maxY - minY)
        )
    }

    /// Walk C's step 2: a record card carrying a full attention list, whose
    /// bottom edge leaves 99 pt above the bar — a card's worth of nothing.
    @Test("a card with no room below it is presented above the anchor instead")
    func aTallRecordPresentsItsCardAbove() {
        let record = anchor(300, 630)
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(
                for: record, bottomReservation: Self.barRow
            ) == .bottom,
            "step 2's card is hung down across the tab bar again (W1-C-13)"
        )
    }

    /// The same anchor with no chrome to clear — the flag-off root, whose tour
    /// host wraps Today's content and not a bar — keeps the historical answer,
    /// so this is not a blanket change of placement.
    @Test("the same anchor with no reserved chrome keeps the midpoint answer")
    func withoutChromeTheHistoricalRuleStands() {
        let record = anchor(300, 630)
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(for: record) == .bottom,
            "630 of 778 is below the midpoint, so this one was already .bottom"
        )
        // …and an anchor that is genuinely high, with the whole screen under
        // it, is `.top` either way.
        let high = anchor(40, 120)
        #expect(FirstLaunchTourPopoverPlacement.arrowEdge(for: high) == .top)
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(
                for: high, bottomReservation: Self.barRow
            ) == .top
        )
    }

    /// Step 1, measured on glass this wave: the greeting, with 600 pt of room
    /// under it. Its card is drawn below the anchor and must stay there.
    @Test("step 1 is unmoved")
    func theGreetingKeepsItsCardBelow() {
        // The greeting row, screen y 118 … 166 → local 56 … 104.
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(
                for: anchor(56, 104), bottomReservation: Self.barRow
            ) == .top
        )
    }

    /// Step 3, the Studio tab, which lives inside the reserved chrome itself.
    @Test("step 3 is unmoved")
    func theStudioTabKeepsItsCardAbove() {
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(
                for: anchor(729, 778), bottomReservation: Self.barRow
            ) == .bottom
        )
    }

    /// An anchored view previewed outside a tour host reports nothing; the
    /// historical placement stands rather than a guess.
    @Test("an unmeasured anchor still falls back rather than guessing")
    func anUnmeasuredAnchorFallsBack() {
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(
                for: .unmeasured, bottomReservation: Self.barRow
            ) == .top
        )
        // Measured height but no rect — the shape `StudioDoorTests` drives.
        let midpointOnly = FirstLaunchTourPopoverPlacement.AnchorGeometry(
            midY: 726.5, containerHeight: 751
        )
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(
                for: midpointOnly, bottomReservation: Self.barRow
            ) == .bottom
        )
    }

    /// The reservation reaches the placement from the host, not from a
    /// constant inside the tour — the flag-off root has no bar to clear.
    @Test("the four-tab root reserves its bar and the flag-off root reserves nothing")
    func theHostsPassTheirOwnChrome() throws {
        let houseFirst = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        )
        #expect(houseFirst.contains("bottomReservation: PatinaTabBar<EmptyView>.itemHeight"))

        let today = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        )
        #expect(!today.contains("bottomReservation"),
                "the flag-off root has no bar inside the tour's root to clear")

        let tour = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        #expect(tour.contains("bottomReservation: bottomReservation"))
        #expect(tour.contains(".environment(\\.firstLaunchTourBottomReservation, bottomReservation)"))
    }

    // MARK: - W1-B-18 · the card at the accessibility ramp

    /// At accessibility-extra-large the card grew past what the popover could
    /// show and was centred in it: the "Step 1 of 2" counter was not drawn, the
    /// title's ascenders were cut by the bubble's top edge, the last body line
    /// spilled below the rounded rect, and the AX tree carried no Skip and no
    /// Next (re-walk 2 shot 61). The copy scrolls; the action row does not.
    @Test("the action row is outside the scrolling copy, so it cannot be scrolled away")
    func theActionRowIsPinnedOutsideTheScroll() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        let card = try #require(code.range(of: "private struct FirstLaunchTourPopoverCard"))
        let body = String(code[card.lowerBound...])

        let column = try #require(body.range(of: "copyColumn"))
        let skip = try #require(body.range(of: "FirstLaunchTour.SkipButton"))
        #expect(column.lowerBound < skip.lowerBound,
                "the action row moved inside the scrolling column (W1-B-18)")

        // The scroll exists, it is bounded, and it is measured rather than left
        // to a ScrollView's absent ideal height.
        #expect(body.contains("ScrollView(showsIndicators: true)"))
        #expect(body.contains("min(copyHeight, Self.copyColumnCap)"))
        #expect(body.contains("copyColumnCap: CGFloat = 300"))
        // The three lines that clipped are all inside it.
        let lines = try #require(body.range(of: "private var copyLines"))
        let linesBody = String(body[lines.lowerBound...].prefix(1400))
        #expect(linesBody.contains("FirstLaunchTour.StepIndicator"))
        #expect(linesBody.contains("FirstLaunchTour.Heading"))
        #expect(linesBody.contains("FirstLaunchTour.Body"))
    }

    /// And the ordinary sizes are untouched, so the wave's default-size shots
    /// stay the record: the scroll is taken only on the accessibility ramp.
    @Test("the ordinary sizes lay the copy out exactly as before")
    func theOrdinarySizesAreUnchanged() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        let column = try #require(code.range(of: "private var copyColumn: some View {"))
        let block = String(code[column.upperBound...].prefix(900))
        let branch = try #require(block.range(of: "if dynamicTypeSize.isAccessibilitySize"))
        let plain = try #require(block.range(of: "} else {"))
        #expect(branch.lowerBound < plain.lowerBound)
        #expect(String(block[plain.upperBound...]).contains("copyLines"))
    }
}
