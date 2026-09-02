//
//  AnalyticsKillSwitchTests.swift
//  PatinaTests
//
//  `AppConfiguration.analyticsEnabled` existed with zero callers, so Debug
//  builds reported into the PRODUCTION PostHog project — the same funnels the
//  first tester round is meant to measure, and the same project whose flag
//  payload `FeatureFlags` resolves from. This suite is the regression guard:
//  the switch is only real if flipping it stops a client being configured.
//
//  A Debug test run IS `analyticsEnabled == false`, so the assertion below is
//  the switch in its off position, exercised for real rather than simulated.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct AnalyticsKillSwitchTests {

    @Test("a Debug build has analytics off")
    func debugBuildsHaveAnalyticsOff() {
        #expect(AppEnvironment.current == .debug)
        #expect(AppConfiguration.analyticsEnabled == false)
    }

    /// The guard has to live inside `initialize()`, not only at the call site:
    /// `PostHogService.shared` is a singleton anything can reach.
    @Test("initialize() configures no client while the kill switch is off")
    func initializeIsANoOpWhileDisabled() {
        PostHogService.shared.initialize()
        #expect(
            PostHogService.shared.isFeatureFlagSourceLive == false,
            "PostHog was set up despite analyticsEnabled == false"
        )
    }
}
