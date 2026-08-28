//
//  RouteAnalyticsParityTests.swift
//  PatinaTests
//
//  PT-3-5: pins the `AppRoute` → PostHog screen-name mapping so the scan
//  funnel can't silently regress to three different names ("Walk",
//  "Walking", "Re-scan Room") again. The scan flow MUST report the single
//  constant "Quiet Conversation" screen name with `reason` carried as an
//  event property.
//
//  If you intentionally change a screen name, update BOTH the route's
//  `analyticsScreenName` (or `displayName`) AND the expectations below in
//  the same PR — and coordinate the PostHog dashboard rebuild noted in the
//  sprint plan (Analytics regression risk).
//

import Testing
import Foundation
@testable import Patina

struct RouteAnalyticsParityTests {

    // MARK: - Scan flow consolidation (the core PT-3-5 guarantee)

    @Test
    func scanFlowAlwaysReportsConstantScreenName() {
        // Every entry reason collapses to ONE screen name. This is the fix
        // for the three-screen-name funnel corruption.
        #expect(AppRoute.scanFlow(reason: .fresh).analyticsScreenName == "Quiet Conversation")
        #expect(AppRoute.scanFlow(reason: .rescan).analyticsScreenName == "Quiet Conversation")
        #expect(AppRoute.scanFlow(reason: .fromConversation).analyticsScreenName == "Quiet Conversation")
    }

    @Test
    func scanFlowScreenNameMatchesNamedConstant() {
        #expect(AppRoute.scanFlow(reason: .fresh).analyticsScreenName == ScanAnalyticsScreen.quietConversation)
    }

    @Test
    func scanFlowDisplayNameIsAlsoTheConstant() {
        // `displayName` doubles as the analytics name for the scan flow, so
        // companion-context strings and analytics agree.
        #expect(AppRoute.scanFlow(reason: .fresh).displayName == "Quiet Conversation")
    }

    // MARK: - Reason is carried as a property, not baked into the name

    @Test
    func everyScanReasonHasADistinctRawValueForTheEventPayload() {
        let rawValues = [ScanReason.fresh, .rescan, .fromConversation].map { $0.rawValue }
        #expect(Set(rawValues).count == rawValues.count, "ScanReason raw values must be unique")
        #expect(rawValues.allSatisfy { !$0.isEmpty })
    }

    // MARK: - Legacy dual-emit mapping (transition wave only)

    @Test
    func scanFlowLegacyNamesCoverThePreConsolidationFunnel() {
        // Dual-emit (behind `ios_screen_name_v2`) must reproduce the old
        // names so dashboards keep working during the migration wave.
        #expect(AppRoute.scanFlow(reason: .fresh).legacyScreenName == "Walking")
        #expect(AppRoute.scanFlow(reason: .rescan).legacyScreenName == "Re-scan Room")
        #expect(AppRoute.scanFlow(reason: .fromConversation).legacyScreenName == "Style Discovery")
    }

    @Test
    func nonScanRoutesHaveNoLegacyName() {
        // Only the scan flow consolidated; nothing else dual-emits.
        #expect(AppRoute.heroFrame.legacyScreenName == nil)
        #expect(AppRoute.profile.legacyScreenName == nil)
        #expect(AppRoute.studio.legacyScreenName == nil)
        #expect(AppRoute.notifications.legacyScreenName == nil)
    }

    // MARK: - A representative pin of stable screen names

    @Test
    func stableRouteScreenNamesAreUnchanged() {
        let expected: [(AppRoute, String)] = [
            (.heroFrame, "Home"),
            (.yourSpaces, "Your Spaces"),
            (.crossRoom, "All Items"),
            (.table, "Your Table"),
            (.styleQuiz, "Style Quiz"),
            (.profile, "Profile"),
            // R2: the Studio tab reports its own name, not Profile's. The two
            // routes mount the same composition; the funnel reads the name.
            (.studio, "Your Studio"),
            (.notifications, "Notifications"),
            (.designerConsultation, "Designer"),
            (.designRequests(focusLeadId: nil), "Design Request"),
            (.projectList, "Projects"),
            (.decisionList, "Decisions"),
            (.threadList, "Messages")
        ]
        for (route, name) in expected {
            #expect(route.analyticsScreenName == name, "Screen name drift for \(route)")
        }
    }
}
