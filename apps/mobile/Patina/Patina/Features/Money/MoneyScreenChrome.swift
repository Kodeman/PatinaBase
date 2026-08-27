//
//  MoneyScreenChrome.swift
//  Patina
//
//  SP-19, the money half. Two chrome failures hit these screens hardest:
//
//  1. The status bar draws over content. Every money screen is a ScrollView
//     with a hidden navigation bar, so scrolled content passes over "9:41" —
//     the walk caught the clock overprinting "Awaiting payment" and
//     "INV-2026-0142" (`research/05-rewalk.md` §2b(iii)). `moneyScreenTopBand`
//     reserves the status-bar region with an opaque band the content passes
//     BEHIND, instead of over.
//
//  2. Content settles inside the Companion Hearth. Each screen carried its own
//     hard-coded bottom padding (120 here, 140 there) with no relationship to
//     `CompanionHearthMetrics.reservedHeight`, so a change to the Hearth
//     re-collides silently. One constant, derived from the metric.
//
//  Not here, on purpose: the opaque band `companionHearthReservation` paints,
//  and the floating back chevron's missing scrim, both live in
//  `Design/Components/` — lane C's files, raised as integration notes.
//

import SwiftUI

enum MoneyScreenMetrics {

    /// Clearance under the last element of a money screen, so nothing lands
    /// inside the Hearth. Derived from what the dock actually draws — the
    /// mark, its caption row and the overlay's lift — not from
    /// `reservedHeight`, which is 20 points shorter than the dock and left the
    /// old 144 clearing it by luck.
    static let bottomClearance: CGFloat = CompanionHearthMetrics.dockHeight + 8
}

extension View {

    /// Reserves the top safe area on a scroll container so scrolled content
    /// cannot be read through the status bar.
    func moneyScreenTopBand() -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background {
                    PatinaColors.Background.primary
                        .ignoresSafeArea(edges: .top)
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}
