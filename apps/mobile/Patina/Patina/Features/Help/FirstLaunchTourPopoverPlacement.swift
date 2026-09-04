//
//  FirstLaunchTourPopoverPlacement.swift
//  Patina
//
//  Which side of its anchor the first-launch tour's card sits on.
//
//  `.popover(arrowEdge:)` names the edge of the ANCHOR the arrow leaves from:
//  `.top` hangs the card below the anchor (caret pointing up at it), `.bottom`
//  sits it above (caret pointing down). The modifier used to hard-code `.top`,
//  which is right for the greeting at the top of Today and impossible for the
//  Studio tab on the bottom bar — with no room below, UIKit repositioned the
//  card over the bar, dropped the caret, and covered the very tab step 3 names
//  (`shots/w3-fix-03.png`). So the edge is measured off the anchor instead of
//  declared once for every anchor: `.profileMonogram` mounts on the header pill
//  on the flag-off root and on the bar on the flag-on one, so no per-anchor
//  constant could be right on both.
//

import SwiftUI

// `nonisolated`: `onGeometryChange` requires a `Sendable` measurement type, and
// the app's default actor isolation would otherwise pin the conformance to the
// main actor. Nothing here touches state.
nonisolated enum FirstLaunchTourPopoverPlacement {

    /// The coordinate space `FirstLaunchTour` names on its content, so an
    /// anchor anywhere in the subtree measures itself against the root the tour
    /// covers rather than against whatever container happens to hold it.
    static let rootCoordinateSpace = "firstLaunchTourRoot"

    /// One anchor's position within that space. `containerHeight == 0` means
    /// "not measured" — no tour host above this view (a preview of an anchored
    /// subview), or a layout pass that has not run yet.
    struct AnchorGeometry: Equatable, Sendable {
        var midY: CGFloat
        var containerHeight: CGFloat
        /// B-10: the anchor's whole frame in the tour root's space, which is
        /// what the scrim's cut-out is punched from. `.zero` while unmeasured —
        /// no host above this view, or a layout pass that has not run.
        var rect: CGRect = .zero

        static let unmeasured = AnchorGeometry(midY: 0, containerHeight: 0, rect: .zero)
    }

    /// The tallest card the tour can draw, near enough.
    ///
    /// `W1-B-18` bounds the card at the accessibility ramp: 16 pt padding top
    /// and bottom, a 300 pt scrolling copy column, 8 pt of spacing and a 44 pt
    /// action row. Placement does not need the exact height — only whether a
    /// side of the anchor has room for one.
    static let cardClearance: CGFloat = 372

    /// How tall a slice of a too-tall anchor the card hangs from.
    ///
    /// One row's worth. The popover attaches to this slice instead of the
    /// whole anchor, so the card is drawn from the anchor's top edge — over
    /// the subject the scrim is already holding open, and never over the bar.
    static let anchorLip: CGFloat = 44

    /// Where a step's card goes: which side of its anchor, and what it hangs
    /// from.
    struct Placement: Equatable {
        var edge: Edge
        /// The slice of the anchor the popover attaches to, in the anchor's
        /// own coordinates. `nil` is the whole anchor — SwiftUI's
        /// `.rect(.bounds)`, which is what every placement used before
        /// `W1F-01`.
        var attachment: CGRect?
    }

    /// Which side of the anchor the card sits on, and what it hangs from.
    ///
    /// The third answer is what `W1F-01` needed. On a full Today record the
    /// anchor is 487 pt of a 874 pt screen: measured on glass it leaves 115 pt
    /// above and 127 pt below to the bar, and the card is 135 pt at the
    /// default size and 298 pt at accessibility-extra-large. NEITHER side can
    /// hold it. Below, the card is drawn whole and lies across the bar (the
    /// finding). Above, iOS shrinks the popover to the 102 pt it has and the
    /// card loses its step counter and its Skip/Next row — which is `W1-B-18`
    /// again, and worse: at AX-XL the action row is drawn entirely off the top
    /// of the screen. So an anchor with room for a card on neither side does
    /// not get one beside it: the popover attaches to the anchor's own top
    /// lip, and the card hangs from there, whole, over the subject.
    static func placement(
        for geometry: AnchorGeometry,
        bottomReservation: CGFloat = 0,
        chromeTop: CGFloat? = nil
    ) -> Placement {
        // The line below which a card may not be drawn.
        let floor: CGFloat? = chromeTop
            ?? (geometry.containerHeight > 0
                ? geometry.containerHeight - bottomReservation
                : nil)

        guard geometry.rect != .zero, let floor else {
            // Nothing measured but the midpoint: the historical rule.
            guard geometry.containerHeight > 0 else { return Placement(edge: .top) }
            return Placement(
                edge: geometry.midY > geometry.containerHeight / 2 ? .bottom : .top
            )
        }

        let roomBelow = floor - geometry.rect.maxY
        let roomAbove = geometry.rect.minY
        if roomBelow >= cardClearance { return Placement(edge: .top) }
        if roomAbove >= cardClearance { return Placement(edge: .bottom) }
        return Placement(
            edge: .top,
            attachment: CGRect(
                x: 0,
                y: 0,
                width: geometry.rect.width,
                height: min(geometry.rect.height, anchorLip)
            )
        )
    }

    /// Which side of the anchor the card sits on.
    ///
    /// The midpoint rule alone is what put step 2 over the tab bar
    /// (`W1-C-13`): Today's record card sits in the upper half of a root that,
    /// on the four-tab root, INCLUDES the bar — `HouseFirstRoot` hosts the tour
    /// above `rootContent`, and the bar is a `safeAreaInset` inside it — so
    /// `.top` hung a card down across the house rail and all of the bar but a
    /// sliver of "Tod…". The room below an anchor is therefore measured to the
    /// top of that chrome, and an anchor with no room for a card presents
    /// above itself instead.
    ///
    /// `chromeTop` is where that chrome actually begins, measured in the tour
    /// root's own space by the chrome itself (`firstLaunchTourChrome()`).
    /// `W1F-01`: the derived answer — `containerHeight - bottomReservation` —
    /// could not be reached at all from the anchors that matter. On glass an
    /// anchor inside Today's `ScrollView` reports `containerHeight == 0`
    /// (`proxy.bounds(of:)` resolves nothing through the scroll), so every
    /// measured record fell out of the first guard and took `.top`, and step 2
    /// covered the bar at both text sizes on a full record. The bar's own
    /// anchor, outside the scroll, resolves the space fine — so the chrome is
    /// asked where it is rather than the anchor being asked how tall its
    /// container is. `bottomReservation` remains for a host that reports no
    /// chrome but does have a container.
    ///
    /// With a floor and a measured rect the answer is which side the card
    /// fits on; the midpoint survives only where nothing but a midpoint was
    /// measured (an anchored view previewed outside a tour host).
    static func arrowEdge(
        for geometry: AnchorGeometry,
        bottomReservation: CGFloat = 0,
        chromeTop: CGFloat? = nil
    ) -> Edge {
        placement(
            for: geometry,
            bottomReservation: bottomReservation,
            chromeTop: chromeTop
        ).edge
    }
}
