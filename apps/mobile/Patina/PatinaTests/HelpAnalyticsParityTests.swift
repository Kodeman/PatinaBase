//
//  HelpAnalyticsParityTests.swift
//  PatinaTests
//
//  Pins the iOS `HelpAnalytics` event-name catalog to the web `helpEvents`
//  namespace defined in `apps/designer-portal/src/lib/analytics/events.ts`.
//  If you intentionally add, rename, or remove a help event, update BOTH
//  the web taxonomy file AND `expectedHelpEventNames` below in the same PR.
//

import Testing
@testable import Patina

struct HelpAnalyticsParityTests {

    /// Snapshot of every event name in the web `helpEvents` namespace as of
    /// spec § 10.1 (22 events across 4 layers). Order mirrors the spec.
    static let expectedHelpEventNames: [String] = [
        // Layer 1 · Ambient
        "help.empty_state.shown",
        "help.empty_state.cta_clicked",
        "help.field_helper.rendered",

        // Layer 2 · Reactive
        "help.tooltip.shown",
        "help.tooltip.dismissed",
        "help.learnmore.expanded",
        "help.learnmore.collapsed",
        "help.panel.opened",
        "help.panel.closed",

        // Layer 3 · Proactive
        "help.tour.started",
        "help.tour.step_advanced",
        "help.tour.completed",
        "help.tour.abandoned",
        "help.coachmark.shown",
        "help.coachmark.dismissed",
        "help.welcome_modal.shown",
        "help.welcome_modal.action",

        // Layer 4 · Reference
        "help.article.opened",
        "help.article.scrolled_to_end",
        "help.article.feedback_given",
        "help.search.performed",
        "help.search.result_clicked",
    ]

    @Test
    func helpEventCountMatchesWebSpec() {
        #expect(HelpEvent.allCases.count == 22)
        #expect(Self.expectedHelpEventNames.count == 22)
    }

    @Test
    func helpEventRawValuesMatchWebSpec() {
        let actual = Set(HelpEvent.allCases.map { $0.rawValue })
        let expected = Set(Self.expectedHelpEventNames)

        let missing = expected.subtracting(actual)
        let extra = actual.subtracting(expected)

        #expect(missing.isEmpty, "Missing events on iOS: \(missing.sorted())")
        #expect(extra.isEmpty, "Extra events on iOS (not in web spec): \(extra.sorted())")
    }

    @Test
    func helpEventRawValuesAreUniqueAndNonEmpty() {
        let rawValues = HelpEvent.allCases.map { $0.rawValue }
        #expect(Set(rawValues).count == rawValues.count, "Duplicate event raw values")
        #expect(rawValues.allSatisfy { !$0.isEmpty }, "Empty event raw value")
        #expect(
            rawValues.allSatisfy { $0.hasPrefix("help.") },
            "All help events must be namespaced under `help.`"
        )
    }
}
