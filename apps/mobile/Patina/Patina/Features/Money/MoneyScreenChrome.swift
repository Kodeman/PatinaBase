//
//  MoneyScreenChrome.swift
//  Patina
//
//  SP-19, the money half. Two chrome failures hit these screens hardest:
//
//  1. The status bar draws over content. Every money screen is a ScrollView
//     with a hidden navigation bar, so scrolled content passes over "9:41" —
//     the walk caught the clock overprinting "Awaiting payment" and
//     "INV-2026-0142" (`research/05-rewalk.md` §2b(iii)). The band that
//     reserves the status-bar region is now `.patinaTopBand()`, applied by
//     `.patinaScreen(…)` — see the note at the foot of this file.
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
    /// under whatever owns the bottom edge.
    ///
    /// One owner, one seam: `CompanionHearthMetrics.pinnedFooterClearance`
    /// answers for the dock on the flag-off root and for the bar on the
    /// house-first one. Before W3-fix this was a `static let` sized to the dock
    /// alone, so on the house-first root every money screen carried ~99 pt of
    /// dead space above a bar that is only 49 pt tall
    /// (`shots/w3-n1-07-money-footer-under-bar.png`).
    ///
    /// Callers pass the flag they already hold — `coordinator.isHouseFirstRoot`,
    /// resolved once at launch — never a live `FeatureFlags` read.
    static func bottomClearance(houseFirst: Bool) -> CGFloat {
        CompanionHearthMetrics.pinnedFooterClearance(houseFirst: houseFirst)
    }
}

// The status-bar band that lived here is now `.patinaTopBand()` in
// `Design/Components/PatinaScreenChrome.swift`, which `.patinaScreen(…)`
// applies for every pushed screen (W1b ruling 1: one top-band pattern, one
// owner). Only the Hearth clearance is a money-screen fact, so only it stayed.
