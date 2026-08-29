//
//  FeatureFlags.swift
//  Patina
//
//  The one flag gate for the Daily Return program. Every flag is resolved
//  ONCE at launch, SYNCHRONOUSLY, before the root is chosen, and held for the
//  session — so a root chosen at launch can never be re-chosen underneath the
//  user when a payload lands late.
//
//  Precedence, highest first:
//    1. DEBUG launch argument `-PatinaFlags house-first,direct-orders` — when
//       present it is authoritative for EVERY flag (named on, unnamed off) and
//       PostHog is not consulted. This is what every local walk uses: Kody's
//       PostHog flags target client auth-user UUIDs, and a locally seeded
//       account has different ones, so PostHog can never answer "on" on a
//       local stack.
//    2. `--uitesting` — all off unless the launch argument above names them.
//       (PostHog is not initialized under `--uitesting` at all.)
//    3. PostHog's own persisted flag payload, read synchronously.
//    4. `false`.
//
//  Why step 3 is a synchronous read and not a bounded wait: PostHog fetches
//  flags asynchronously after `setup()`, so a first cut waited up to 1.5 s on
//  `PostHogSDK.didReceiveFeatureFlags` in a detached task. That can never
//  answer in time — `PatinaApp.init()` returns and `body` mounts the root in
//  the same runloop turn — so the PostHog branch would have been dead on every
//  TestFlight and production launch while looking correct on a developer's
//  machine, where the launch argument answers.
//
//  The SDK already solves this: it persists each payload
//  (`PostHogRemoteConfig.setCachedFeatureFlags` →
//  `storage.setDictionary(forKey: .enabledFeatureFlags)`) and lazily reads it
//  back from disk on the first access after `setup()`
//  (`getCachedFeatureFlags()`, `PostHogRemoteConfig.swift:568-573`, posthog-ios
//  3.48). `isFeatureEnabled` therefore answers from the last session's payload
//  with no wait at all.
//
//  The cost is explicit and accepted: on the very first launch after install
//  there is no payload yet, so every flag is off for that session and correct
//  from the second launch on. A flag that must be honoured on first launch
//  needs a splash blocked on resolution — a product decision, not this file's.
//

import Foundation

/// The source `FeatureFlags` reads once resolution reaches PostHog. A protocol
/// only so the resolution order can be tested without a live PostHog.
@MainActor
protocol FeatureFlagProvider {
    /// The flag's value as the source can answer it *now*, synchronously.
    func isEnabled(_ key: String) -> Bool
}

@MainActor
final class FeatureFlags {

    enum Flag: String, CaseIterable, Sendable {
        case houseFirst = "house-first"
        case directOrders = "direct-orders"
        case houseWidget = "house-widget"
    }

    static let shared = FeatureFlags()

    /// The DEBUG override argument, followed by a comma-separated list of
    /// `Flag` raw values.
    static let launchArgument = "-PatinaFlags"

    /// False when the App Group suite was unreachable at resolution and the
    /// mirror is app-local — the widget would then read nothing and draw its
    /// no-data state. Reported, not hidden, exactly as `LastSeenStore` does.
    private(set) var usesAppGroupDefaults = false

    private(set) var isResolved = false
    private var values: [Flag: Bool] = [:]

    init() {}

    func isOn(_ flag: Flag) -> Bool { values[flag] ?? false }

    /// Launch entry point — called from `PatinaApp.init()`, after
    /// `PostHogService.initialize()` and before the root is chosen. Returns
    /// with every flag decided.
    func resolveAtLaunch() {
        resolveAtLaunch(
            arguments: ProcessInfo.processInfo.arguments,
            provider: PostHogFeatureFlagProvider(),
            mirror: .appGroup
        )
    }

    /// The full resolution, with its inputs injected. Idempotent: the first
    /// answer is held for the session.
    ///
    /// - Parameter mirror: where the resolved set is written for the widget to
    ///   read. The widget process has no PostHog SDK and never runs
    ///   `PatinaApp.init()`, so the App Group suite is the only way it can be
    ///   told what `house-widget` resolved to. It has **no default**: the
    ///   default was `.appGroup`, which made every unit-test resolution write
    ///   the real shared suite — the value the widget and
    ///   `RecordSnapshotStore.shared` then read. Naming it at each call site is
    ///   how a test run stays out of the flag the next walk sees.
    func resolveAtLaunch(
        arguments: [String],
        provider: FeatureFlagProvider,
        mirror: FeatureFlagMirror
    ) {
        guard !isResolved else { return }
        defer { write(to: mirror) }
        if let inline = Self.inlineValues(arguments: arguments) {
            values = inline
            isResolved = true
            logResolution(source: "launch-arguments")
            return
        }
        values = Dictionary(
            uniqueKeysWithValues: Flag.allCases.map { ($0, provider.isEnabled($0.rawValue)) }
        )
        isResolved = true
        logResolution(source: "posthog-cache")
    }

    private func write(to mirror: FeatureFlagMirror) {
        usesAppGroupDefaults = mirror.isAppGroup && mirror.defaults != nil
        guard let defaults = mirror.defaults else {
            PatinaLog.ui.debug(
                "[FeatureFlags] App Group defaults unavailable — the widget reads nothing"
            )
            return
        }
        let resolved = Dictionary(
            uniqueKeysWithValues: Flag.allCases.map { ($0.rawValue, isOn($0)) }
        )
        defaults.set(resolved, forKey: FeatureFlagMirror.key)
    }

    /// A walk has no other way to see which flags a launch resolved — nothing
    /// reads them until W3 mounts the tab bar.
    private func logResolution(source: String) {
        #if DEBUG
        let on = Flag.allCases.filter { isOn($0) }.map(\.rawValue)
        PatinaLog.ui.debug(
            "[FeatureFlags] resolved via \(source): on=[\(on.joined(separator: ","))]"
        )
        #endif
    }

    // MARK: - Launch arguments

    /// The values decidable from the launch arguments alone, or `nil` when the
    /// answer has to come from PostHog.
    private static func inlineValues(arguments: [String]) -> [Flag: Bool]? {
        if let overridden = overrideFlags(in: arguments) {
            return Dictionary(
                uniqueKeysWithValues: Flag.allCases.map { ($0, overridden.contains($0)) }
            )
        }
        if arguments.contains("--uitesting") {
            return Dictionary(uniqueKeysWithValues: Flag.allCases.map { ($0, false) })
        }
        return nil
    }

    /// The flags named by `-PatinaFlags a,b`, or `nil` when the argument is
    /// absent. Release builds ignore the argument entirely.
    private static func overrideFlags(in arguments: [String]) -> Set<Flag>? {
        #if DEBUG
        guard let index = arguments.firstIndex(of: launchArgument),
              index + 1 < arguments.count else { return nil }
        let named = arguments[index + 1]
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .compactMap(Flag.init(rawValue:))
        return Set(named)
        #else
        return nil
        #endif
    }
}

/// Where the resolved flag set is written so a second process can read it.
///
/// `FeatureFlags` holds its answers in memory on a `@MainActor` class, and
/// nothing is persisted — which is the right shape for the app and useless to
/// the widget. The widget is a separate process with its own bundle: it never
/// runs `PatinaApp.init()`, has no PostHog SDK, and its `UserDefaults.standard`
/// is the EXTENSION's domain, not the app's. The mechanism that already works
/// here is the one `LastSeenStore` and `RecordOwnerStamp` use — the App Group
/// suite — so the resolved set goes there under one key, and the key is a
/// contract (`waves/w6/x2-tasks.md` §0), not a detail.
///
/// The cost is stated rather than papered over: the mirror is only written
/// after a launch resolves, so a first-ever launch has none, and
/// `FeatureFlags` itself resolves every flag off on that launch anyway (no
/// persisted PostHog payload yet). Absent mirror → `house-widget` false → the
/// widget draws its no-data state. That is the honest answer.
struct FeatureFlagMirror {

    /// The one key. Changing it blinds every installed widget.
    static let key = "patina.flags.resolved"

    static let appGroupIdentifier = "group.cloud.patina.app"

    let defaults: UserDefaults?
    /// True for the real shared suite, false for a suite a test handed in —
    /// so `usesAppGroupDefaults` never claims a shared container it hasn't got.
    let isAppGroup: Bool

    static let appGroup = FeatureFlagMirror(
        defaults: UserDefaults(suiteName: appGroupIdentifier),
        isAppGroup: true
    )

    static func testing(_ defaults: UserDefaults) -> FeatureFlagMirror {
        FeatureFlagMirror(defaults: defaults, isAppGroup: false)
    }

    /// The flag as the last launch resolved it, read the way the widget reads
    /// it — synchronously, from any actor, with `false` for "no mirror yet".
    static func isOn(_ flag: FeatureFlags.Flag, in mirror: FeatureFlagMirror = .appGroup) -> Bool {
        guard let resolved = mirror.defaults?.dictionary(forKey: key) else { return false }
        return resolved[flag.rawValue] as? Bool ?? false
    }
}

/// PostHog as the flag source, read from the payload its SDK persisted on a
/// previous launch. `isFeatureEnabled` already answers `false` for every key
/// when analytics is off (no API key) or when no payload has ever been
/// cached — which is exactly the fallback this resolution wants.
@MainActor
struct PostHogFeatureFlagProvider: FeatureFlagProvider {
    func isEnabled(_ key: String) -> Bool {
        guard PostHogService.shared.isFeatureFlagSourceLive else { return false }
        return PostHogService.shared.isFeatureEnabled(key)
    }
}
