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

    /// Which side of the anchor the card sits on.
    ///
    /// The midpoint rule alone is what put step 2 over the tab bar
    /// (`W1-C-13`): Today's record card sits in the upper half of a root that,
    /// on the four-tab root, INCLUDES the bar — `HouseFirstRoot` hosts the tour
    /// above `rootContent`, and the bar is a `safeAreaInset` inside it — so
    /// `.top` hung a card down across the house rail and all of the bar but a
    /// sliver of "Tod…". The room below an anchor is therefore measured to the
    /// top of that chrome, not to the bottom of the container, and an anchor
    /// with no room for a card presents above itself instead.
    ///
    /// `bottomReservation` is the host's own chrome height —
    /// `PatinaTabBar.itemHeight` on the four-tab root, 0 on the flag-off one,
    /// which has no bar inside the tour's root.
    ///
    /// The midpoint remains the tiebreak, so step 1 (the greeting, with the
    /// whole screen below it) and step 3 (the Studio tab, inside the bar) are
    /// placed exactly where they were.
    static func arrowEdge(
        for geometry: AnchorGeometry,
        bottomReservation: CGFloat = 0
    ) -> Edge {
        guard geometry.containerHeight > 0 else { return .top }
        // Nothing measured but the midpoint: the historical rule, unchanged.
        guard geometry.rect != .zero else {
            return geometry.midY > geometry.containerHeight / 2 ? .bottom : .top
        }
        let roomBelow = geometry.containerHeight - bottomReservation - geometry.rect.maxY
        let roomAbove = geometry.rect.minY
        if roomBelow < cardClearance, roomAbove > roomBelow { return .bottom }
        return geometry.midY > geometry.containerHeight / 2 ? .bottom : .top
    }
}
