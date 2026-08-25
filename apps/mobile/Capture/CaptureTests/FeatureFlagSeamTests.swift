//  FeatureFlagSeamTests.swift
//  CaptureTests
//
//  Field has no feature-flag mechanism at all: CaptureAnalytics exposed only
//  screen/event/identify while the client app already used isFeatureEnabled.
//  The seam is FAIL-CLOSED — a conformer that cannot reach PostHog must never
//  light a gated surface. Wave 1's first consumer is the voice recorder, which
//  is what gives FC-R11's consent exposure an off-switch that needs no build.

import Foundation
import Testing
@testable import CaptureKit

private struct SilentAnalytics: CaptureAnalytics {
    func screen(_ name: String, _ properties: [String: String]) {}
    func event(_ name: String, _ properties: [String: String]) {}
}

private struct FlaggedAnalytics: CaptureAnalytics {
    let enabled: Set<String>
    func screen(_ name: String, _ properties: [String: String]) {}
    func event(_ name: String, _ properties: [String: String]) {}
    func isFeatureEnabled(_ key: String) -> Bool { enabled.contains(key) }
}

struct FeatureFlagSeamTests {
    @Test func featureFlagSeamIsFailClosedByDefault() {
        let analytics: any CaptureAnalytics = SilentAnalytics()
        #expect(analytics.isFeatureEnabled("field-companion-voice") == false)
        #expect(analytics.isFeatureEnabled("") == false)
    }

    @Test func featureFlagSeamReadsAConformersValue() {
        let analytics: any CaptureAnalytics = FlaggedAnalytics(enabled: ["field-companion-voice"])
        #expect(analytics.isFeatureEnabled("field-companion-voice"))
        #expect(analytics.isFeatureEnabled("something-else") == false)
    }
}
