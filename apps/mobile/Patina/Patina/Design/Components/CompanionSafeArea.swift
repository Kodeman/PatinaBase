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

    /// The bottom clearance a screen with a pinned money act must reserve.
    ///
    /// On the house-first root the 83 pt bar owns the bottom and reserves its
    /// own space, so the dock's 140 pt is dead space rather than clearance.
    /// `MoneyScreenChrome.swift:33` still computes `dockHeight + 8` directly —
    /// it belongs to no W3 lane and was deliberately not edited by N1 (see
    /// `waves/w3/n1-notes.md` §3); this is the one-line replacement for
    /// whoever takes it.
    public static func pinnedFooterClearance(houseFirst: Bool) -> CGFloat {
        houseFirst ? 8 : dockHeight + 8
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
}

extension View {
    /// Reserves the invisible Hearth so scrollable content cannot settle under
    /// the centered Companion circle and contextual hint.
    ///
    /// SP-19: the inset used to paint an opaque primary-canvas band that
    /// extended past the bottom safe area. A safe-area inset only moves the
    /// RESTING position of a scroll view — content still travels through that
    /// region while scrolling — so the band drew over it, and on a pushed
    /// screen it sat on top of "Sign proposal" and clipped the label. C8 calls
    /// the Hearth "a reserved layout region, never a painted bar"; the band
    /// contradicted the contract this type documents, so it is gone. The
    /// reservation, its height and its hit/accessibility behaviour are
    /// unchanged — nothing moves, the paint simply stops.
    func companionHearthReservation(isActive: Bool = true) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            if isActive {
                Color.clear
                    .frame(height: CompanionHearthMetrics.reservedHeight)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
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
