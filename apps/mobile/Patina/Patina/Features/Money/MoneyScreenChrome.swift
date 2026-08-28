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
    /// inside the Hearth. Derived from what the dock actually draws — the
    /// mark, its caption row and the overlay's lift — not from
    /// `reservedHeight`, which is 20 points shorter than the dock and left the
    /// old 144 clearing it by luck.
    static let bottomClearance: CGFloat = CompanionHearthMetrics.dockHeight + 8
}

// The status-bar band that lived here is now `.patinaTopBand()` in
// `Design/Components/PatinaScreenChrome.swift`, which `.patinaScreen(…)`
// applies for every pushed screen (W1b ruling 1: one top-band pattern, one
// owner). Only the Hearth clearance is a money-screen fact, so only it stayed.
