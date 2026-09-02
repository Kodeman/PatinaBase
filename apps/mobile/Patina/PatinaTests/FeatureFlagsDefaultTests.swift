//
//  FeatureFlagsDefaultTests.swift
//  PatinaTests
//
//  D1a, pinned. The four-tab root is the shipped product for round one (D1),
//  so it has to be there on the FIRST launch — the one launch where PostHog
//  has no persisted payload to answer from. That is a per-flag default, not a
//  blanket one: `direct-orders` and `house-widget` stay fail-closed.
//
//  The kill switch is the other half and matters more: a PostHog payload that
//  says `false` still wins, so `house-first` can be turned off for everyone
//  without shipping a build.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct FeatureFlagsDefaultTests {

    /// A three-state source: `nil` is "PostHog has never been told about this
    /// key", which is what a fresh install has and what the default table
    /// answers. It is NOT the same as `false`.
    private final class StubProvider: FeatureFlagProvider {
        var answers: [String: Bool]

        init(answers: [String: Bool] = [:]) {
            self.answers = answers
        }

        func value(for key: String) -> Bool? { answers[key] }
    }

    private func freshDefaults() throws -> UserDefaults {
        let suite = "patina.tests.flagdefaults.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    // MARK: - Case 1 — fresh install

    @Test("a fresh install shows the tab bar: house-first is on with no payload and no argument")
    func freshInstallTurnsHouseFirstOn() throws {
        let flags = FeatureFlags()

        flags.resolveAtLaunch(
            arguments: ["Patina"],
            provider: StubProvider(),
            mirror: .testing(try freshDefaults())
        )

        #expect(flags.isResolved)
        #expect(flags.isOn(.houseFirst), "D1a: house-first must default on")
        #expect(!flags.isOn(.directOrders), "direct-orders stays fail-closed")
        #expect(!flags.isOn(.houseWidget), "house-widget stays fail-closed")
    }

    // MARK: - Case 2 — the kill switch

    @Test("a PostHog payload saying false wins over the default")
    func postHogFalseIsTheKillSwitch() throws {
        let flags = FeatureFlags()

        flags.resolveAtLaunch(
            arguments: ["Patina"],
            provider: StubProvider(answers: ["house-first": false]),
            mirror: .testing(try freshDefaults())
        )

        #expect(!flags.isOn(.houseFirst), "PostHog false must beat the default — it is the kill switch")
    }

    // MARK: - Case 3 — a payload saying yes

    @Test("a PostHog payload saying true keeps the flag on")
    func postHogTrueKeepsTheFlagOn() throws {
        let flags = FeatureFlags()

        flags.resolveAtLaunch(
            arguments: ["Patina"],
            provider: StubProvider(answers: [
                "house-first": true, "direct-orders": true, "house-widget": true
            ]),
            mirror: .testing(try freshDefaults())
        )

        #expect(flags.isOn(.houseFirst))
        #expect(flags.isOn(.directOrders))
        #expect(flags.isOn(.houseWidget))
    }

    // MARK: - Case 4 — the launch argument still owns every flag

    /// `-PatinaFlags` is authoritative for the whole set, named on and unnamed
    /// OFF — including a flag whose default is true. Without this a local walk
    /// could no longer reach the old root.
    @Test("-PatinaFlags naming only direct-orders turns house-first off")
    func launchArgumentOverridesTheDefault() throws {
        let flags = FeatureFlags()
        let provider = StubProvider(answers: ["house-first": true])

        flags.resolveAtLaunch(
            arguments: ["Patina", FeatureFlags.launchArgument, "direct-orders"],
            provider: provider,
            mirror: .testing(try freshDefaults())
        )

        #expect(!flags.isOn(.houseFirst), "the argument is authoritative for EVERY flag")
        #expect(flags.isOn(.directOrders))
        #expect(!flags.isOn(.houseWidget))
    }

    // MARK: - The default table itself

    @Test("only house-first defaults on")
    func defaultTableIsPinned() {
        #expect(FeatureFlags.defaultValue(for: .houseFirst))
        #expect(!FeatureFlags.defaultValue(for: .directOrders))
        #expect(!FeatureFlags.defaultValue(for: .houseWidget))
    }

    /// With analytics off there is no live source, so every read is "no
    /// answer" and the defaults apply — rather than silence being mistaken for
    /// a `false` from PostHog.
    @Test("a source that is not live answers nil, not false")
    func inertSourceHasNoAnswer() {
        #expect(PostHogService.shared.isFeatureFlagSourceLive == false)
        #expect(PostHogFeatureFlagProvider().value(for: FeatureFlags.Flag.houseFirst.rawValue) == nil)
    }
}
