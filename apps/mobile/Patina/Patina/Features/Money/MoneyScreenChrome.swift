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
//  2. Content settles under the bottom chrome. Each screen carried its own
//     hard-coded bottom padding (120 here, 140 there) with no relationship to
//     `CompanionHearthMetrics`, so a change to the chrome re-collides
//     silently. One constant, derived from the metric.
//

import SwiftUI

enum MoneyScreenMetrics {

    /// Clearance under the last element of a money screen, so nothing lands
    /// under the bar that owns the bottom edge.
    ///
    /// One owner, one seam: `CompanionHearthMetrics.pinnedFooterClearance`.
    /// Before W3-fix this was sized to the retired Companion dock, so every
    /// money screen carried ~99 pt of dead space above a bar that is only
    /// 49 pt tall (`shots/w3-n1-07-money-footer-under-bar.png`).
    static let bottomClearance: CGFloat = CompanionHearthMetrics.pinnedFooterClearance
}

// The status-bar band that lived here is now `.patinaTopBand()` in
// `Design/Components/PatinaScreenChrome.swift`, which `.patinaScreen(…)`
// applies for every pushed screen (W1b ruling 1: one top-band pattern, one
// owner). Only the Hearth clearance is a money-screen fact, so only it stayed.
