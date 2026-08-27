//
//  ChromeReachTests.swift
//  PatinaTests
//
//  SP-19 / SP-20 — nothing covers the button, nothing is smaller than a thumb.
//
//  These are source pins, not behaviour tests, because the facts they protect
//  live in SwiftUI's hit-testing and painting rules rather than in any value a
//  unit test can read back. Each one was reproduced on the simulator first;
//  the pin exists so the repair cannot be undone silently.
//

import CoreGraphics
import Foundation
import Testing
@testable import Patina

struct ChromeReachTests {

    // MARK: - SP-20 · the inert Settings row

    /// Bisected on `dr-w1b-c` before any change: a tap at the dead centre of
    /// the Account row's 338×44 frame did nothing, while a tap on the word
    /// "Account" pushed `AccountView`. The `NavigationLink` and its
    /// destination were always correct — `.buttonStyle(.plain)` restricts
    /// hit-testing to the label's drawn content, and the middle of
    /// `settingsRow` is a `Spacer()`.
    @Test("every settings row declares a rectangular hit area")
    func settingsRowsAreFullyTappable() throws {
        let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        #expect(source.contains(".contentShape(Rectangle())"))
        #expect(source.contains("minHeight: 44"))
    }

    // MARK: - SP-19 · the Hearth

    /// C8: "a reserved layout region, never a painted bar". The reservation
    /// carried an opaque `PatinaColors.Background.primary` band with
    /// `.ignoresSafeArea(edges: .bottom)`, which is what painted over
    /// "Sign proposal" on a pushed screen (F49 / F137). More padding was never
    /// the fix — ProposalDetailView already pads 140 and still collided.
    @Test("the Hearth reserves space without painting a band")
    func hearthReservationDrawsNothing() throws {
        let source = try SourcePin.read("Patina/Design/Components/CompanionSafeArea.swift")
        // Scope the pin to the reservation itself — the file's #Preview draws
        // its own background legitimately.
        let start = try #require(source.range(of: "func companionHearthReservation"))
        let end = try #require(source.range(of: "func companionSafeArea"))
        let reservation = String(source[start.lowerBound..<end.lowerBound])
        #expect(!reservation.contains(".background"))
        #expect(!reservation.contains("ignoresSafeArea"))
        #expect(reservation.contains("Color.clear"))
        #expect(reservation.contains("allowsHitTesting(false)"))
    }

    /// The reservation must keep its size: this is a paint change, not a
    /// layout change, and every screen's clearance depends on the 120.
    @Test("the reserved height is unchanged at 64 + 36 + 20")
    func reservedHeightIsUnchanged() {
        #expect(CompanionHearthMetrics.reservedHeight == 120)
        #expect(CompanionHearthMetrics.collapsedDiameter == 64)
        #expect(CompanionHearthMetrics.hintAllowance == 36)
        #expect(CompanionHearthMetrics.verticalSpacing == 20)
    }
}
