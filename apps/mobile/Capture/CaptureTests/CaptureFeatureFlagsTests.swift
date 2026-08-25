//  CaptureFeatureFlagsTests.swift
//  CaptureTests
//
//  Wave 1 put isFeatureEnabled on the CaptureAnalytics seam and gated the voice
//  recorder on it directly. That works and it means a feature has to hold an
//  analytics object to ask a yes/no question. AppContainer.featureFlags is the
//  one named reader; it stays FAIL-CLOSED, because FC-R11's consent exposure
//  needs an off-switch that costs no build.

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

struct CaptureFeatureFlagsTests {

    @Test func allOffAnswersFalseForEveryKey() {
        #expect(CaptureFeatureFlags.allOff.isEnabled("field-companion-voice") == false)
        #expect(CaptureFeatureFlags.allOff.isEnabled("anything") == false)
    }

    @Test func analyticsBackedFlagsAreFailClosedWhenNothingCanAnswer() {
        let flags = CaptureFeatureFlags(analytics: SilentAnalytics())
        #expect(flags.isEnabled("field-companion-voice") == false)
    }

    @Test func analyticsBackedFlagsReadTheSeam() {
        let flags = CaptureFeatureFlags(analytics:
            FlaggedAnalytics(enabled: ["field-companion-voice"]))
        #expect(flags.isEnabled("field-companion-voice"))
        #expect(flags.isEnabled("something-else") == false)
    }

    @Test func anEmptyKeyIsNeverEnabled() {
        let flags = CaptureFeatureFlags(source: { _ in true })
        #expect(flags.isEnabled("") == false)
        #expect(flags.isEnabled("real-key"))
    }
}
