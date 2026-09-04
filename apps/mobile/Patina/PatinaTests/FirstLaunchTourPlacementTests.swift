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
    ///
    /// `W1F-01` is the other half: there is no card's worth of room ABOVE it
    /// either, so the card does not go beside the anchor at all. It hangs from
    /// the anchor's own top lip, which is the only placement that draws the
    /// whole card and leaves the bar alone.
    @Test("a card with no room on either side hangs from the anchor's top edge")
    func aTallRecordHangsItsCardFromItsOwnTop() throws {
        let record = anchor(300, 630)
        let placement = FirstLaunchTourPopoverPlacement.placement(
            for: record, bottomReservation: Self.barRow
        )
        #expect(placement.edge == .top)
        let attachment = try #require(
            placement.attachment,
            "the card is hung beside a 330 pt anchor with 99 pt under it (W1F-01)"
        )
        #expect(attachment.height == FirstLaunchTourPopoverPlacement.anchorLip)
        #expect(attachment.minY == 0, "the card hangs from the anchor's top, not its middle")
    }

    // MARK: - W1F-01 · the geometry the app actually measures

    /// The numbers this wave read off the app itself, on the fixture walk C
    /// filed the finding against — `client@patina.dev`'s full Today record
    /// (invoice, proposal, decision, message, story, shipped, See all) on a
    /// 402 × 874 iPhone 17 Pro:
    ///
    /// ```
    /// [tour-geom] todayRecord      rect=(0, 177.33, 402, 486.67) container=0
    /// [tour-geom] profileMonogram  rect=(258, 729, 84, 49)       container=778
    /// ```
    ///
    /// Two things the old rule could not survive. **The container is 0** for
    /// every anchor inside Today's `ScrollView` — `proxy.bounds(of:)` resolves
    /// nothing through the scroll — so `containerHeight - bottomReservation`
    /// was never reachable and the first guard returned `.top` every time,
    /// which is why the pins above passed while the screen failed. And the
    /// record is 487 pt tall: 177 above it, 65 below it to the bar the tab-bar
    /// anchor reports at 729. A 139 pt card (298 at accessibility-extra-large)
    /// fits on neither side.
    @Test("the shipping geometry: the bar is measured, and the card clears it")
    func theShippingGeometryClearsTheBar() throws {
        let record = FirstLaunchTourPopoverPlacement.AnchorGeometry(
            midY: 420.67,
            containerHeight: 0,
            rect: CGRect(x: 0, y: 177.33, width: 402, height: 486.67)
        )
        let placement = FirstLaunchTourPopoverPlacement.placement(
            for: record,
            bottomReservation: Self.barRow,
            chromeTop: Self.measuredBarTop
        )

        #expect(placement.edge == .top)
        let attachment = try #require(
            placement.attachment,
            "a container of 0 fell through to .top with the whole record as the anchor, which is the card across the tab bar, twice walked (W1F-01)"
        )

        // Where the card is then drawn, and the two card heights walk C
        // measured: 139.5 at the default size, 298 at accessibility-extra-large.
        for cardHeight in [139.5, 298.0] as [CGFloat] {
            let drawnBottom = record.rect.minY + attachment.height
                + Self.caret + cardHeight
            #expect(
                drawnBottom < Self.measuredBarTop,
                "a \(cardHeight) pt card reaches \(drawnBottom), across the bar row at \(Self.measuredBarTop)"
            )
        }
    }

    /// The bar's own top, as the bar reports it in the tour root's space —
    /// screen y 791 on this device, 729 local. The chrome measures itself
    /// because the anchors that need it cannot.
    private static let measuredBarTop: CGFloat = 729
    /// The popover's caret, near enough for "does the card clear the bar".
    private static let caret: CGFloat = 13

    /// The same anchor with no chrome to clear — the flag-off root, whose tour
    /// host wraps Today's content and not a bar. The reservation changes the
    /// room, never the shape of the answer, and an anchor with the whole
    /// screen under it is `.top` on both roots.
    @Test("a host with no reserved chrome measures the same way")
    func withoutChromeTheHistoricalRuleStands() {
        let record = anchor(300, 630)
        #expect(
            FirstLaunchTourPopoverPlacement.arrowEdge(for: record) == .top,
            "148 pt below and 300 above: neither holds a card, so it hangs from the top"
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

    /// The chrome measures itself, and the placement reads it. `W1F-01`: the
    /// derived answer was unreachable from the anchors that needed it.
    @Test("the bar reports its own top, and the popover places against it")
    func theBarMeasuresItself() throws {
        let tour = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        #expect(tour.contains("chromeTop: model?.chromeTop"),
                "the placement no longer reads the measured bar")
        #expect(tour.contains("func reportChromeTop("))
        #expect(tour.contains("attachmentAnchor: placement.attachment.map { .rect(.rect($0)) }"),
                "the too-tall anchor's lip is not handed to the popover")

        let root = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        )
        #expect(root.contains(".firstLaunchTourChrome()"),
                "the bar no longer tells the tour where it is (W1F-01)")
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
