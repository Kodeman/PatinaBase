//
//  FeatureFlagsTests.swift
//  PatinaTests
//
//  Pins the launch-time flag resolution every flag-gated lane and every local
//  walk depends on: DEBUG launch-arg override → PostHog's persisted payload →
//  false, resolved once, synchronously, and held for the session.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct FeatureFlagsTests {

    /// A provider whose answers are set by the test, counting reads so the
    /// "PostHog is not consulted under an override" and "resolved exactly
    /// once" claims are assertions and not narration.
    private final class StubProvider: FeatureFlagProvider {
        var enabled: Set<String>
        private(set) var readCount = 0

        init(enabled: Set<String> = []) {
            self.enabled = enabled
        }

        func isEnabled(_ key: String) -> Bool {
            readCount += 1
            return enabled.contains(key)
        }
    }

    /// A throwaway suite per call, so a unit run never writes the REAL
    /// `group.cloud.patina.app` mirror — the one `RecordSnapshotStore.shared`
    /// and the widget read. `resolveAtLaunch(arguments:provider:mirror:)` has
    /// no default for `mirror` precisely so the compiler finds every one of
    /// these.
    private func freshDefaults() throws -> UserDefaults {
        let suite = "patina.tests.flags.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    // MARK: - Precedence

    @Test("a DEBUG launch-argument override wins over PostHog")
    func launchArgumentOverrideWins() throws {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["house-first", "direct-orders", "house-widget"])

        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "house-first,house-widget"],
            provider: provider,
            mirror: .testing(try freshDefaults())
        )

        #expect(flags.isOn(.houseFirst))
        #expect(flags.isOn(.houseWidget))
        // The override is authoritative for EVERY flag, so an unnamed flag is
        // off even though PostHog would have said yes.
        #expect(!flags.isOn(.directOrders))
        #expect(provider.readCount == 0, "PostHog must not be consulted when the override is present")
    }

    @Test("without an override the PostHog value is used")
    func postHogValueIsUsedWhenNoOverride() throws {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["direct-orders"])

        flags.resolveAtLaunch(arguments: ["Patina"], provider: provider,
                              mirror: .testing(try freshDefaults()))

        #expect(flags.isOn(.directOrders))
        #expect(!flags.isOn(.houseFirst))
        #expect(!flags.isOn(.houseWidget))
    }

    @Test("a source with no cached payload resolves every flag to false")
    func noCachedPayloadResolvesToFalse() throws {
        let flags = FeatureFlags()

        flags.resolveAtLaunch(arguments: ["Patina"], provider: StubProvider(),
                              mirror: .testing(try freshDefaults()))

        #expect(flags.isResolved)
        for flag in FeatureFlags.Flag.allCases {
            #expect(!flags.isOn(flag), "\(flag.rawValue) resolved true with nothing cached")
        }
    }

    // MARK: - Resolved before the root is chosen

    /// B1: the whole point. `PatinaApp.init()` returns and `body` mounts the
    /// root in the same runloop turn, so a resolution that has not finished by
    /// the time `resolveAtLaunch()` returns can never gate a root. Anything
    /// asynchronous here — a detached task, a bounded wait on
    /// `didReceiveFeatureFlags` — leaves `isResolved` false at this line.
    @Test("resolution is complete by the time the launch entry point returns")
    func resolutionIsCompleteWhenTheCallReturns() throws {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["house-first"])

        flags.resolveAtLaunch(arguments: ["Patina"], provider: provider,
                              mirror: .testing(try freshDefaults()))

        #expect(flags.isResolved)
        #expect(flags.isOn(.houseFirst))
    }

    /// The claim the comment in `FeatureFlags` rests on, asserted against the
    /// vendored SDK rather than trusted: posthog-ios persists its flag payload
    /// and reads it back from storage, which is what makes a synchronous
    /// launch-time read answer anything at all.
    @Test("the PostHog SDK caches its flag payload to storage")
    func postHogPersistsItsFlagPayload() throws {
        let sdk = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // Patina
            .appendingPathComponent(
                ".build/dd/SourcePackages/checkouts/posthog-ios/PostHog/PostHogRemoteConfig.swift"
            )
        // The checkout only sits here when the build used
        // `-derivedDataPath .build/dd`; elsewhere there is nothing to read and
        // nothing to assert, so this is a no-op rather than a false failure.
        guard FileManager.default.fileExists(atPath: sdk.path) else { return }
        let source = try String(contentsOf: sdk, encoding: .utf8)

        #expect(source.contains("storage.setDictionary(forKey: .enabledFeatureFlags"))
        #expect(source.contains("storage.getDictionary(forKey: .enabledFeatureFlags)"))
    }

    // MARK: - Held for the session

    @Test("the resolved value is held even if PostHog changes afterwards")
    func resolvedValueIsHeldForTheSession() throws {
        let flags = FeatureFlags()
        let provider = StubProvider(enabled: ["house-first"])

        flags.resolveAtLaunch(arguments: ["Patina"], provider: provider,
                              mirror: .testing(try freshDefaults()))
        #expect(flags.isOn(.houseFirst))
        let readsAfterFirstResolution = provider.readCount

        provider.enabled = []
        flags.resolveAtLaunch(arguments: ["Patina"], provider: provider,
                              mirror: .testing(try freshDefaults()))

        #expect(flags.isOn(.houseFirst), "a second resolution must not overwrite the held value")
        #expect(provider.readCount == readsAfterFirstResolution, "resolution must happen exactly once")
    }

    // MARK: - UI testing

    @Test("--uitesting keeps flags off unless the launch argument names them")
    func uiTestingKeepsFlagsOffUnlessNamed() throws {
        let off = FeatureFlags()
        off.resolveAtLaunch(
            arguments: ["Patina", "--uitesting"],
            provider: StubProvider(enabled: ["house-first", "direct-orders", "house-widget"]),
            mirror: .testing(try freshDefaults())
        )
        for flag in FeatureFlags.Flag.allCases {
            #expect(!off.isOn(flag), "\(flag.rawValue) was on under --uitesting")
        }

        let named = FeatureFlags()
        named.resolveAtLaunch(
            arguments: ["Patina", "--uitesting", FeatureFlags.launchArgument, "house-first"],
            provider: StubProvider(),
            mirror: .testing(try freshDefaults())
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
    func unknownOverrideTokenIsIgnored() throws {
        let flags = FeatureFlags()
        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "not-a-flag, house-first "],
            provider: StubProvider(),
            mirror: .testing(try freshDefaults())
        )
        #expect(flags.isOn(.houseFirst), "whitespace around a named flag must not defeat it")
        #expect(!flags.isOn(.directOrders))
    }
}
