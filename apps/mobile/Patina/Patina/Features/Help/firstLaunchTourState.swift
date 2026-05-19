//
//  firstLaunchTourState.swift
//  Patina
//
//  Per-tour lifecycle persistence for the iOS first-launch coachmark tour
//  (Sprint 3 / Stream G9). Swift mirror of the web `tourState.ts` module at
//  `packages/help-system/src/proactive/TourController/tourState.ts`.
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  v1 backend: UserDefaults                                                │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  Each tour writes to a single, namespaced key:                           │
//  │    help-system.tour.<tourKey>                                            │
//  │  with a JSON-encoded `FirstLaunchTourState` payload. We intentionally    │
//  │  namespace with a "help-system." prefix so a future global clear or       │
//  │  migration scanner can walk the keyspace without grepping for tour IDs.  │
//  │                                                                          │
//  │  Mirrors the web `TOUR_STATE_STORAGE_PREFIX` constant byte-for-byte so   │
//  │  the cross-platform v2 migration (move to Supabase user_profiles JSONB)  │
//  │  can read both client backings with the same prefix scan.                │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  v2 backend (Sprint 4 — DEFERRED, see plan §15 cleanup item):            │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  Swap UserDefaults for Supabase `user_profiles.help_state` JSONB:        │
//  │    { [tourKey]: FirstLaunchTourState }                                   │
//  │                                                                          │
//  │  Spec §4.7 rule 1 explicitly calls out: "State persisted in user        │
//  │  profile, not localStorage (so it survives device changes)". This        │
//  │  module exists so the swap is a one-file change — `FirstLaunchTour`     │
//  │  itself never touches UserDefaults.                                       │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  Public API: `getFirstLaunchTourState(_:)`, `setFirstLaunchTourState(_:_:)`,
//  `clearFirstLaunchTourState(_:)`. Nothing else in `Features/Help/` should
//  read UserDefaults directly for tour state.
//

import Foundation

// MARK: - Persisted state

/// Persisted state for a single tour, keyed by `tourKey`. Either `completed`
/// or `abandoned` is set once the tour resolves — the reader treats either
/// flag as "do not auto-start". Matches the web `TourState` interface in
/// `packages/help-system/src/proactive/TourController/tourState.ts`.
public struct FirstLaunchTourState: Codable, Equatable, Sendable {
    /// True once the user actually reached the final step and `complete()` was called.
    public var completed: Bool?
    /// True once the user explicitly skipped the tour.
    public var abandoned: Bool?
    /// True once the orchestrator first attempted to auto-start (used to
    /// distinguish a fresh installation from a returning user that hasn't
    /// resolved the tour yet). Mirrors the "have we seen this device?" bit
    /// the iOS app uses for first-launch detection.
    public var launched: Bool?
    /// Zero-based step index the user was on when they skipped.
    public var atStep: Int?
    /// ISO-8601 timestamp of completion.
    public var completedAt: String?
    /// ISO-8601 timestamp of abandonment.
    public var abandonedAt: String?

    public init(
        completed: Bool? = nil,
        abandoned: Bool? = nil,
        launched: Bool? = nil,
        atStep: Int? = nil,
        completedAt: String? = nil,
        abandonedAt: String? = nil
    ) {
        self.completed = completed
        self.abandoned = abandoned
        self.launched = launched
        self.atStep = atStep
        self.completedAt = completedAt
        self.abandonedAt = abandonedAt
    }

    /// True when the tour has been resolved (either completed or abandoned)
    /// and MUST NOT auto-start again per spec §4.7 rule 1.
    public var isResolved: Bool {
        completed == true || abandoned == true
    }
}

// MARK: - Constants

/// Storage-key prefix shared with the future v2 migration scanner. Mirrors
/// the web `TOUR_STATE_STORAGE_PREFIX` constant.
public let firstLaunchTourStateStoragePrefix: String = "help-system.tour."

/// Build the full UserDefaults key for a given tour.
internal func firstLaunchTourStorageKey(_ tourKey: String) -> String {
    "\(firstLaunchTourStateStoragePrefix)\(tourKey)"
}

// MARK: - UserDefaults abstraction (for testability)

/// Minimal protocol over `UserDefaults` so tests can inject a stub without
/// stomping the shared `.standard` instance. Mirrors the `URLSessionProtocol`
/// pattern used elsewhere in `Features/Help/Services/`.
public protocol FirstLaunchTourDefaultsProtocol: AnyObject {
    func data(forKey defaultName: String) -> Data?
    func set(_ value: Any?, forKey defaultName: String)
    func removeObject(forKey defaultName: String)
}

extension UserDefaults: FirstLaunchTourDefaultsProtocol {}

/// Holder for the injectable defaults reference. We use a `final class` with
/// an internal lock rather than a `nonisolated(unsafe) var` so concurrent
/// reads from tests can't race the swap at module load time. The production
/// path resolves to `UserDefaults.standard` on first read; tests call
/// `setFirstLaunchTourDefaults(_:)` to install a stub.
private final class FirstLaunchTourDefaultsAdapter: @unchecked Sendable {
    static let shared = FirstLaunchTourDefaultsAdapter()
    private let lock = NSLock()
    private var current: FirstLaunchTourDefaultsProtocol

    private init() {
        self.current = UserDefaults.standard
    }

    var value: FirstLaunchTourDefaultsProtocol {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    func set(_ next: FirstLaunchTourDefaultsProtocol) {
        lock.lock()
        defer { lock.unlock() }
        current = next
    }

    func reset() {
        lock.lock()
        defer { lock.unlock() }
        current = UserDefaults.standard
    }
}

/// Test-only injection point. Production callers should never invoke this.
public func setFirstLaunchTourDefaults(_ defaults: FirstLaunchTourDefaultsProtocol) {
    FirstLaunchTourDefaultsAdapter.shared.set(defaults)
}

/// Test-only reset.
public func resetFirstLaunchTourDefaults() {
    FirstLaunchTourDefaultsAdapter.shared.reset()
}

// MARK: - Public API

/// Read the persisted state for `tourKey`. Returns an empty `FirstLaunchTourState`
/// when no state exists OR when the stored payload is malformed — the reader
/// treats "no record" identically to "fresh user". Never throws.
public func getFirstLaunchTourState(_ tourKey: String) -> FirstLaunchTourState {
    let key = firstLaunchTourStorageKey(tourKey)
    guard let data = FirstLaunchTourDefaultsAdapter.shared.value.data(forKey: key) else {
        return FirstLaunchTourState()
    }
    do {
        return try JSONDecoder().decode(FirstLaunchTourState.self, from: data)
    } catch {
        // Malformed payload — fall back to clean slate. Help-system writes
        // are never load-bearing for app correctness (spec §13.4).
        return FirstLaunchTourState()
    }
}

/// Merge-write the persisted state for `tourKey`. Reads the existing payload
/// first so callers can pass partial updates (e.g. `.init(launched: true)`)
/// without clobbering sibling fields. No-op when encoding fails. Never throws.
public func setFirstLaunchTourState(_ tourKey: String, _ patch: FirstLaunchTourState) {
    let key = firstLaunchTourStorageKey(tourKey)
    let previous = getFirstLaunchTourState(tourKey)
    let merged = FirstLaunchTourState(
        completed: patch.completed ?? previous.completed,
        abandoned: patch.abandoned ?? previous.abandoned,
        launched: patch.launched ?? previous.launched,
        atStep: patch.atStep ?? previous.atStep,
        completedAt: patch.completedAt ?? previous.completedAt,
        abandonedAt: patch.abandonedAt ?? previous.abandonedAt
    )
    do {
        let data = try JSONEncoder().encode(merged)
        FirstLaunchTourDefaultsAdapter.shared.value.set(data, forKey: key)
    } catch {
        // Encoding failure — silent per spec §13.4 (help-system surfaces
        // must never crash the host app).
    }
}

/// Hard-clear persisted state for a tour. Intended for the future "Show me
/// around again" Profile affordance (spec §4.7 rule 5) and for tests.
public func clearFirstLaunchTourState(_ tourKey: String) {
    FirstLaunchTourDefaultsAdapter.shared.value.removeObject(forKey: firstLaunchTourStorageKey(tourKey))
}
