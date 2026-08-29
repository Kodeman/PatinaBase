//
//  FeatureFlagMirrorTests.swift
//  PatinaTests
//
//  The widget process has no PostHog SDK and never runs `PatinaApp.init()`.
//  The only thing it can read is the App Group suite, so the resolved flag set
//  has to land there at every launch — and the key is a contract, not a
//  detail.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct FeatureFlagMirrorTests {

    private final class StubProvider: FeatureFlagProvider {
        let enabled: Set<String>
        init(enabled: Set<String>) { self.enabled = enabled }
        func isEnabled(_ key: String) -> Bool { enabled.contains(key) }
    }

    private func freshDefaults() throws -> UserDefaults {
        let suite = "patina.tests.flagmirror.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    @Test("resolution writes every flag into the suite the widget reads")
    func resolutionMirrorsEveryFlag() throws {
        let defaults = try freshDefaults()
        let flags = FeatureFlags()

        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "house-widget"],
            provider: StubProvider(enabled: []),
            mirror: .testing(defaults)
        )

        let mirrored = try #require(
            defaults.dictionary(forKey: "patina.flags.resolved") as? [String: Bool]
        )
        #expect(mirrored["house-widget"] == true)
        #expect(mirrored["house-first"] == false)
        #expect(mirrored["direct-orders"] == false)
        // Every flag, not just the interesting one — the widget must be able
        // to tell "off" from "not written".
        #expect(mirrored.count == FeatureFlags.Flag.allCases.count)
    }

    @Test("the mirror is read back the way the widget reads it")
    func theMirrorReadsBackThroughTheSameHelper() throws {
        let defaults = try freshDefaults()
        let mirror = FeatureFlagMirror.testing(defaults)
        let flags = FeatureFlags()

        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "house-widget,house-first"],
            provider: StubProvider(enabled: []),
            mirror: mirror
        )

        #expect(FeatureFlagMirror.isOn(.houseWidget, in: mirror))
        #expect(FeatureFlagMirror.isOn(.houseFirst, in: mirror))
        #expect(!FeatureFlagMirror.isOn(.directOrders, in: mirror))
    }

    /// W1a's documented cost, restated for the widget: the first launch after
    /// install has no PostHog payload and no mirror. The honest answer is the
    /// widget's no-data state, not a stale row — so an unwritten mirror reads
    /// false rather than throwing or guessing.
    @Test("no mirror at all reads as off, not as unknown")
    func anAbsentMirrorReadsAsOff() throws {
        let mirror = FeatureFlagMirror.testing(try freshDefaults())
        #expect(!FeatureFlagMirror.isOn(.houseWidget, in: mirror))
    }

    @Test("an unreachable suite is reported, not hidden")
    func anUnreachableSuiteIsReported() {
        let flags = FeatureFlags()
        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "house-widget"],
            provider: StubProvider(enabled: []),
            mirror: FeatureFlagMirror(defaults: nil, isAppGroup: true)
        )

        #expect(flags.isOn(.houseWidget))
        #expect(!flags.usesAppGroupDefaults)
    }

    @Test("resolution still holds for the session when the mirror is written")
    func mirroringDoesNotBreakIdempotence() throws {
        let defaults = try freshDefaults()
        let flags = FeatureFlags()

        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "house-widget"],
            provider: StubProvider(enabled: []),
            mirror: .testing(defaults)
        )
        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "direct-orders"],
            provider: StubProvider(enabled: []),
            mirror: .testing(defaults)
        )

        #expect(flags.isOn(.houseWidget))
        #expect(!flags.isOn(.directOrders))
        let mirrored = try #require(
            defaults.dictionary(forKey: FeatureFlagMirror.key) as? [String: Bool]
        )
        #expect(mirrored["house-widget"] == true)
        #expect(mirrored["direct-orders"] == false)
    }

    @Test("the key and the suite are the ones the widget was told about")
    func theContractStringsAreUnchanged() {
        #expect(FeatureFlagMirror.key == "patina.flags.resolved")
        #expect(FeatureFlagMirror.appGroupIdentifier == "group.cloud.patina.app")
        #expect(FeatureFlagMirror.appGroupIdentifier == LastSeenStore.appGroupIdentifier)
    }
}
