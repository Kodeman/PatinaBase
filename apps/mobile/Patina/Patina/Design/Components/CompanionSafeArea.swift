//
//  CompanionSafeArea.swift
//  Patina
//
//  Patina Design System - Layout
//
//  Adds bottom padding so app content clears the floating Companion
//  affordance docked at the bottom of the screen (PT-6-14).
//

import SwiftUI

/// Spatial contract for the invisible Companion Hearth. The Hearth is a
/// reserved layout region, never a painted bar or persistent piece of chrome.
public enum CompanionHearthMetrics {
    public static let collapsedDiameter: CGFloat = 64
    public static let hintAllowance: CGFloat = 36
    public static let verticalSpacing: CGFloat = 20

    /// Content clearance above the home-indicator safe area.
    public static let reservedHeight: CGFloat =
        collapsedDiameter + hintAllowance + verticalSpacing

    /// Gap between the mark and the caption under it (`collapsedView`'s VStack).
    public static let captionSpacing: CGFloat = 4

    /// The caption row's floor. A tappable hint is framed to the 44-point touch
    /// target, so that — not the type's line height — is what the dock occupies.
    public static let captionRowHeight: CGFloat = 44

    /// The overlay's own lift off the bottom safe area (`safeAreaPadding`).
    public static let overlayBottomInset: CGFloat = 28

    /// What the dock actually draws above the bottom safe area, measured off
    /// the review device rather than assumed: mark 64 + gap 4 + caption row 44
    /// + lift 28 = 140. `reservedHeight`'s 120 predates the caption and is 20
    /// short of it, which is why a screen could satisfy the reservation and
    /// still be covered.
    public static let dockHeight: CGFloat =
        collapsedDiameter + captionSpacing + captionRowHeight + overlayBottomInset

    /// The yielded dock: `CompanionOverlay.minimalView`'s glass circle.
    public static let minimalDiameter: CGFloat = 44

    /// What the yielded dock draws above the bottom safe area — the 44 pt mark
    /// plus `minimalView`'s own 28 pt lift, and nothing else. There is no
    /// caption row, because the corner mark carries no caption.
    public static let minimalDockHeight: CGFloat =
        minimalDiameter + overlayBottomInset

    /// The house-first bar's tappable row, above the bottom safe area.
    ///
    /// The figure belongs to `PatinaTabBar.itemHeight`; it is restated here so
    /// the Design layer does not reach into `Features/Navigation` for it, and
    /// `HouseFirstRootTests` pins the two equal.
    public static let barRowHeight: CGFloat = 49

    /// The bottom clearance a screen with a pinned money act must reserve.
    ///
    /// Both answers are measured from the **bottom safe area**, because a
    /// `safeAreaInset` on the root — the flag-off root's 120 pt Hearth
    /// reservation, the house-first root's bar — does not reach a
    /// `NavigationStack`'s pushed destinations. Measured on `dr-w3-int`: the
    /// piece screen's pinned capsule sits at the identical y on both roots, and
    /// a money screen's content ends `bottomClearance` above the home indicator
    /// rather than above the reservation. So a pushed screen clears whatever
    /// draws over that edge by itself:
    ///
    ///  • flag-off — the Companion dock, 140 pt of mark, caption and lift (W1b).
    ///  • house-first — the bar's 49 pt row (B-2: the bar replaces the dock).
    ///    Not zero: the bar is drawn over the screen, not reserved out of it.
    ///
    /// Plus the same 8 pt of air in both cases.
    public static func pinnedFooterClearance(houseFirst: Bool) -> CGFloat {
        houseFirst ? barRowHeight + 8 : dockHeight + 8
    }

    /// Root overlay ownership policy. Scan and quiz render their own in-flow
    /// Companion, so reserving the root Hearth there would create dead space.
    ///
    /// B-2: on the house-first root the bar replaces the dock, so nothing is
    /// reserved at all. (`HouseFirstRoot` never applies the reservation, so
    /// this answer is belt-and-braces for any other caller.)
    static func reservesRootHearth(for route: AppRoute, houseFirst: Bool = false) -> Bool {
        guard !houseFirst else { return false }
        switch route {
        case .scanFlow, .styleQuiz:
            return false
        default:
            return true
        }
    }

    /// Screens whose last act is pinned money — Pay, Sign proposal, a
    /// decision's answer — or the failure banner drawn above it.
    ///
    /// Ruling 1: the orb yields. No inset can settle this on its own. A
    /// safe-area inset moves only a scroll view's RESTING position, and these
    /// screens are taller than the display, so the act travels UNDER the dock
    /// on the way down — which is exactly what the Pay failure shot caught,
    /// with the mark and "N THINGS NEED YOUR EYE" printed across "We couldn't
    /// start this payment." while the reservation below was already double the
    /// dock's height. So the dock steps aside instead: on these routes it
    /// drops to its minimal resting state — the 44-point mark in the trailing
    /// corner, caption retired — out of the act's column at every scroll
    /// offset. The same yield `pieceDetail` and `arPlacement` already take.
    ///
    /// B-2 retires the policy on the house-first root: there is no dock to
    /// yield, only a fixed bar slot, and a slot cannot step aside. The W1b
    /// policy stands, unchanged, on the flag-off root.
    static func yieldsToPinnedFooter(for route: AppRoute, houseFirst: Bool = false) -> Bool {
        guard !houseFirst else { return false }
        switch route {
        case .invoiceDetail, .proposalDetail, .decisionDetail:
            return true
        default:
            return false
        }
    }

    /// The same yield, on one more condition: an accessibility text size, on
    /// every route that draws the Hearth.
    ///
    /// W4 walk 4, finding 1. At `accessibility-extra-extra-large` on the
    /// flag-off root, the 64 pt dock's frame (y=748…812, x=169…233) sat wholly
    /// inside the editorial story card's bounds (y=711…961) and — being the
    /// later sibling — won the hit test: a tap aimed at the story opened the
    /// Companion instead. Same family as the money screens' defect, and it
    /// takes the same answer for the same reason `yieldsToPinnedFooter` gives:
    /// no inset settles it, because the card travels under the dock while the
    /// surface scrolls. The dock steps aside to the corner mark instead, out of
    /// the content's column at every scroll offset.
    ///
    /// Route-independent on purpose. At an accessibility size *every* card on
    /// every surface is taller and the centred dock lands on one of them; a
    /// per-route list would be a list of the surfaces someone happened to walk.
    static func yieldsToAccessibilityText(_ size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }

    /// What a surface reserves for the dock, given the text size it is drawn
    /// at. The yielded dock is 72 pt, not 140, so reserving `reservedHeight`
    /// after the yield would cost the story card and the house rail 48 pt of
    /// the space they need at exactly the size that needs it most.
    ///
    /// Named apart from `reservedHeight` so the two never get confused: this
    /// is the answer a *screen* uses, that one is the resting-dock constant it
    /// is still built from.
    public static func reservation(accessibilityText: Bool) -> CGFloat {
        accessibilityText ? minimalDockHeight : reservedHeight
    }
}

/// Reserves the invisible Hearth so scrollable content cannot settle under the
/// Companion.
///
/// SP-19: the inset used to paint an opaque primary-canvas band that extended
/// past the bottom safe area. A safe-area inset only moves the RESTING
/// position of a scroll view — content still travels through that region while
/// scrolling — so the band drew over it, and on a pushed screen it sat on top
/// of "Sign proposal" and clipped the label. C8 calls the Hearth "a reserved
/// layout region, never a painted bar"; the band contradicted the contract
/// `CompanionHearthMetrics` documents, so it is gone.
///
/// A `ViewModifier` rather than a plain `View` extension because the height is
/// no longer a constant: at an accessibility text size the dock has yielded to
/// the corner mark (`yieldsToAccessibilityText`) and reserves 72 pt instead of
/// 120. Reading `dynamicTypeSize` here — the same environment value
/// `CompanionOverlay.displayMode` reads — is what keeps the two halves from
/// disagreeing. When they disagree the surface either keeps dead space under a
/// dock that yielded, or hands its taps to a dock that did not.
private struct CompanionHearthReservation: ViewModifier {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let isActive: Bool

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .bottom, spacing: 0) {
            if isActive {
                Color.clear
                    .frame(height: CompanionHearthMetrics.reservation(
                        accessibilityText: dynamicTypeSize.isAccessibilitySize
                    ))
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
    }
}

extension View {
    func companionHearthReservation(isActive: Bool = true) -> some View {
        modifier(CompanionHearthReservation(isActive: isActive))
    }

    /// Source-compatible name retained for existing and in-flight call sites.
    func companionSafeArea() -> some View {
        companionHearthReservation()
    }
}

#Preview {
    ScrollView {
        VStack(spacing: PatinaSpacing.md) {
            ForEach(0..<12, id: \.self) { index in
                Text("Row \(index)")
                    .font(PatinaTypography.body)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .padding(PatinaSpacing.md)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(.rect(cornerRadius: PatinaRadius.lg))
            }
        }
        .padding(PatinaSpacing.md)
        .companionSafeArea()
    }
    .background(PatinaColors.Background.primary)
}
