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

        static let unmeasured = AnchorGeometry(midY: 0, containerHeight: 0)
    }

    /// An anchor in the lower half of the tour's root presents its card above
    /// itself; everything else keeps the historical below-the-anchor placement,
    /// which is also the fallback for an unmeasured anchor.
    static func arrowEdge(for geometry: AnchorGeometry) -> Edge {
        guard geometry.containerHeight > 0 else { return .top }
        return geometry.midY > geometry.containerHeight / 2 ? .bottom : .top
    }
}
