//
//  FeatureFlagsTests.swift
//  PatinaTests
//
//  Pins the launch-time flag resolution every flag-gated lane and every local
//  walk depends on: DEBUG launch-arg override → PostHog (bounded wait) →
//  false, resolved once and held for the session.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct FeatureFlagsTests {

    /// A provider whose readiness and values are set by the test.
    private final class StubProvider: FeatureFlagProvider {
        var enabled: Set<String>
        var becomesReady: Bool
        private(set) var waitCount = 0

        init(enabled: Set<String> = [], becomesReady: Bool = true) {
            self.enabled = enabled
            self.becomesReady = becomesReady
        }

        func waitUntilReady(timeout: Duration) async -> Bool {
            waitCount += 1
            if becomesReady { return true }
            // Never ready: honour the caller's bound rather than hanging.
            try? await Task.sleep(for: timeout)
            return false
        }

        func isEnabled(_ key: String) -> Bool { enabled.contains(key) }
    }

    // MARK: - Precedence

    @Test("a DEBUG launch-argument override wins over PostHog")
    func launchArgumentOverrideWins() async {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["house-first", "direct-orders", "house-widget"])

        await flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "house-first,house-widget"],
            provider: provider,
            timeout: .milliseconds(50)
        )

        #expect(flags.isOn(.houseFirst))
        #expect(flags.isOn(.houseWidget))
        // The override is authoritative for EVERY flag, so an unnamed flag is
        // off even though PostHog would have said yes.
        #expect(!flags.isOn(.directOrders))
        #expect(provider.waitCount == 0, "PostHog must not be consulted when the override is present")
    }

    @Test("without an override the PostHog value is used")
    func postHogValueIsUsedWhenNoOverride() async {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["direct-orders"])

        await flags.resolveAtLaunch(
            arguments: ["Patina"],
            provider: provider,
            timeout: .milliseconds(50)
        )

        #expect(flags.isOn(.directOrders))
        #expect(!flags.isOn(.houseFirst))
        #expect(!flags.isOn(.houseWidget))
    }

    @Test("a PostHog payload that never arrives resolves to false")
    func timeoutResolvesToFalse() async {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["house-first"], becomesReady: false)

        await flags.resolveAtLaunch(
            arguments: ["Patina"],
            provider: provider,
            timeout: .milliseconds(50)
        )

        #expect(flags.isResolved)
        for flag in FeatureFlags.Flag.allCases {
            #expect(!flags.isOn(flag), "\(flag.rawValue) resolved true on a timed-out payload")
        }
    }

    // MARK: - Held for the session

    @Test("the resolved value is held even if PostHog changes afterwards")
    func resolvedValueIsHeldForTheSession() async {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["house-first"])

        await flags.resolveAtLaunch(
            arguments: ["Patina"], provider: provider, timeout: .milliseconds(50)
        )
        #expect(flags.isOn(.houseFirst))

        provider.enabled = []
        await flags.resolveAtLaunch(
            arguments: ["Patina"], provider: provider, timeout: .milliseconds(50)
        )

        #expect(flags.isOn(.houseFirst), "a second resolution must not overwrite the held value")
        #expect(provider.waitCount == 1, "resolution must happen exactly once")
    }

    // MARK: - UI testing

    @Test("--uitesting keeps flags off unless the launch argument names them")
    func uiTestingKeepsFlagsOffUnlessNamed() async {
        let off = FeatureFlags()
        await off.resolveAtLaunch(
            arguments: ["Patina", "--uitesting"],
            provider: StubProvider(enabled: ["house-first", "direct-orders", "house-widget"]),
            timeout: .milliseconds(50)
        )
        for flag in FeatureFlags.Flag.allCases {
            #expect(!off.isOn(flag), "\(flag.rawValue) was on under --uitesting")
        }

        let named = FeatureFlags()
        await named.resolveAtLaunch(
            arguments: ["Patina", "--uitesting", FeatureFlags.launchArgument, "house-first"],
            provider: StubProvider(),
            timeout: .milliseconds(50)
        )
        #expect(named.isOn(.houseFirst))
        #expect(!named.isOn(.directOrders))
    }

    // MARK: - Raw values

    @Test("the flag raw values are the PostHog keys Kody creates")
    func rawValuesArePinned() {
        #expect(FeatureFlags.Flag.houseFirst.rawValue == "house-first")
        #expect(FeatureFlags.Flag.directOrders.rawValue == "direct-orders")
        #expect(FeatureFlags.Flag.houseWidget.rawValue == "house-widget")
        #expect(FeatureFlags.launchArgument == "-PatinaFlags")
        #expect(FeatureFlags.Flag.allCases.count == 3)
    }

    @Test("an unknown token in the override list is ignored")
    func unknownOverrideTokenIsIgnored() async {
        let flags = FeatureFlags()
        await flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "not-a-flag, house-first "],
            provider: StubProvider(),
            timeout: .milliseconds(50)
        )
        #expect(flags.isOn(.houseFirst), "whitespace around a named flag must not defeat it")
        #expect(!flags.isOn(.directOrders))
    }
}
