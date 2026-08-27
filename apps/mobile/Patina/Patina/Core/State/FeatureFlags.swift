//
//  FeatureFlags.swift
//  Patina
//
//  The one flag gate for the Daily Return program. Every flag is resolved
//  ONCE at launch and held for the session, so a root chosen at launch can
//  never be re-chosen underneath the user when a payload lands late.
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
//    3. PostHog, read after a flag payload has been delivered, waited at most
//       1.5 s. PostHog loads flags asynchronously after `setup()`, so reading
//       without the wait returns `false` on every cold launch.
//    4. `false`.
//

import Foundation

/// The source `FeatureFlags` reads once resolution reaches PostHog. A protocol
/// only so the resolution order can be tested without a live PostHog.
@MainActor
protocol FeatureFlagProvider {
    /// Return once a flag payload has been delivered, or once `timeout`
    /// elapses — whichever comes first. Must never outlast `timeout`.
    /// `true` means a payload arrived and `isEnabled` may be trusted.
    func waitUntilReady(timeout: Duration) async -> Bool
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

    /// The bound on the PostHog wait. Named so a walk script and a test can
    /// cite the same number the plan does.
    static let postHogTimeout: Duration = .milliseconds(1500)

    private(set) var isResolved = false
    private var values: [Flag: Bool] = [:]
    private var resolution: Task<Void, Never>?

    init() {}

    func isOn(_ flag: Flag) -> Bool { values[flag] ?? false }

    /// Launch entry point — called from `PatinaApp.init()` before the root is
    /// chosen. The override and `--uitesting` paths resolve inline; only the
    /// PostHog path needs the bounded wait, and until it lands every flag
    /// answers `false`.
    func resolveAtLaunch() {
        guard !isResolved, resolution == nil else { return }
        let arguments = ProcessInfo.processInfo.arguments
        if let inline = Self.inlineValues(arguments: arguments) {
            values = inline
            isResolved = true
            logResolution(source: "launch-arguments")
            return
        }
        resolution = Task { [weak self] in
            await self?.resolveAtLaunch(
                arguments: arguments,
                provider: PostHogFeatureFlagProvider(),
                timeout: Self.postHogTimeout
            )
        }
    }

    /// The full resolution, awaitable. Idempotent: the first answer is held.
    func resolveAtLaunch(
        arguments: [String],
        provider: FeatureFlagProvider,
        timeout: Duration
    ) async {
        guard !isResolved else { return }
        if let inline = Self.inlineValues(arguments: arguments) {
            values = inline
            isResolved = true
            logResolution(source: "launch-arguments")
            return
        }
        let delivered = await provider.waitUntilReady(timeout: timeout)
        values = Dictionary(
            uniqueKeysWithValues: Flag.allCases.map {
                ($0, delivered ? provider.isEnabled($0.rawValue) : false)
            }
        )
        isResolved = true
        logResolution(source: delivered ? "posthog" : "timeout")
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

/// PostHog as the flag source. `isEnabled` already answers `false` for every
/// key when analytics is off (no API key), which is exactly the fallback this
/// resolution wants.
@MainActor
struct PostHogFeatureFlagProvider: FeatureFlagProvider {
    func waitUntilReady(timeout: Duration) async -> Bool {
        await PostHogService.shared.awaitFeatureFlags(timeout: timeout)
    }

    func isEnabled(_ key: String) -> Bool {
        PostHogService.shared.isFeatureEnabled(key)
    }
}
