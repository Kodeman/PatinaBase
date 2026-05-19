//
//  SupabaseHelpStateAdapter.swift
//  Patina
//
//  Sprint 4 / Task S4-1 — cross-device persistence for the Help & Guidance
//  System on iOS. Reads + writes the `profiles.help_state` JSONB column so
//  a tour dismissed on iPhone never re-appears on iPad or the web portal.
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  Shape (mirror of the web TS type in                                     │
//  │  packages/help-system/src/persistence/types.ts):                         │
//  │                                                                          │
//  │  {                                                                       │
//  │    "tours": {                                                            │
//  │      "<tourId>": { completed?, abandoned?, launched?, atStep?,           │
//  │                    completedAt?, abandonedAt? }                          │
//  │    },                                                                    │
//  │    "featureAnnouncements": {                                             │
//  │      "<featureKey>": { dismissedAt: ISO-8601 }                           │
//  │    }                                                                     │
//  │  }                                                                       │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  Design:
//   • UserDefaults stays as the anon / offline fallback (see
//     `firstLaunchTourState.swift`). The Supabase adapter is opt-in — the
//     caller (FirstLaunchTour orchestrator) installs it once the user is
//     authenticated, then runs a one-time migration sweep to copy any
//     pre-S4-1 UserDefaults entries up to Supabase.
//   • Reads / writes are async (Swift concurrency); the orchestrator hydrates
//     on `task { … }` and writes through on `complete()` / `skip()`.
//   • Failure modes are silent — RLS rejections, network blips, schema
//     mismatches all log to console (DEBUG only) and resolve to "fresh
//     user" state. Help-system surfaces must never crash the host app
//     (spec §13.4).
//

import Foundation
import Supabase

// MARK: - JSONB shape

/// The full `profiles.help_state` payload. Both sub-keys optional so a new
/// user starts with `{}` (matching the migration's DEFAULT).
public struct HelpStateBlob: Codable, Sendable, Equatable {
    public var tours: [String: TourEntry]?
    public var featureAnnouncements: [String: FeatureAnnouncementEntry]?

    /// Nonisolated so the actor's read / write paths can construct blobs
    /// without crossing the MainActor boundary the surrounding module
    /// otherwise infers (the file lives alongside MainActor-bound help-system
    /// surfaces).
    public nonisolated init(
        tours: [String: TourEntry]? = nil,
        featureAnnouncements: [String: FeatureAnnouncementEntry]? = nil
    ) {
        self.tours = tours
        self.featureAnnouncements = featureAnnouncements
    }

    public struct TourEntry: Codable, Sendable, Equatable {
        public var completed: Bool?
        public var abandoned: Bool?
        public var launched: Bool?
        public var atStep: Int?
        public var completedAt: String?
        public var abandonedAt: String?

        public nonisolated init(
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

        public var isResolved: Bool { completed == true || abandoned == true }
    }

    public struct FeatureAnnouncementEntry: Codable, Sendable, Equatable {
        public var dismissedAt: String
        public nonisolated init(dismissedAt: String) {
            self.dismissedAt = dismissedAt
        }
    }
}

// MARK: - Adapter

/// Actor wrapping the Supabase read / write loop. Caches the blob in memory
/// so the orchestrator's synchronous "is the tour resolved?" check (called
/// from `@MainActor` UI code) doesn't have to await a round-trip per render.
///
/// Lifecycle:
///   1. `loadState()` — async, called once on authenticated mount. Populates
///      the cache from Supabase, returning the merged blob.
///   2. Reads — `cachedTourEntry(_:)` / `cachedFeatureAnnouncement(_:)`,
///      synchronous accessors against the in-memory cache.
///   3. Writes — `setTourEntry(_:patch:)` /
///      `setFeatureAnnouncement(_:patch:)`, async, updates cache + schedules
///      Supabase patch.
///   4. `flush()` — awaits any in-flight write before sign-out.
public actor SupabaseHelpStateAdapter {

    // MARK: - Dependencies

    /// The Supabase client. Defaults to the shared manager singleton.
    private let client: SupabaseClient
    /// Supabase user id (UUID lowercase string). Must match `auth.uid()`.
    private let userId: String

    // MARK: - Cache

    private var cache: HelpStateBlob = HelpStateBlob()
    private var hydrated: Bool = false

    /// Tail of the write chain — lets us serialize writes so quick-succession
    /// `setTourEntry` calls during skip + complete never race on the column.
    private var writeTask: Task<Void, Never> = Task {}

    // MARK: - Init

    /// Designated initializer. Caller passes the Supabase client explicitly
    /// to keep the actor's init `nonisolated` (otherwise referencing the
    /// `@MainActor`-bound `SupabaseClientManager.shared` as a default value
    /// makes the init unreachable from non-MainActor contexts).
    public init(
        client: SupabaseClient,
        userId: String
    ) {
        self.client = client
        self.userId = userId
    }

    /// Convenience initializer using the shared Supabase client. Marked
    /// `@MainActor` because `SupabaseClientManager.shared` is MainActor-bound.
    @MainActor
    public static func withSharedClient(userId: String) -> SupabaseHelpStateAdapter {
        SupabaseHelpStateAdapter(
            client: SupabaseClientManager.shared.client,
            userId: userId
        )
    }

    // MARK: - Load

    /// Hydrate the in-memory cache from Supabase. Returns the merged blob.
    /// Treats any failure (RLS, network, missing row) as fresh-user state.
    /// Safe to call multiple times — subsequent calls re-read from Supabase
    /// and merge in any local writes that happened during the round-trip.
    @discardableResult
    public func loadState() async -> HelpStateBlob {
        struct ProfileRow: Decodable {
            let help_state: HelpStateBlob?
        }
        do {
            let row: ProfileRow = try await client
                .from("profiles")
                .select("help_state")
                .eq("id", value: userId)
                .single()
                .execute()
                .value
            let serverBlob = row.help_state ?? HelpStateBlob()
            // Merge: server keys first, in-memory keys override (the user
            // may have written to the cache during the load round-trip).
            var mergedTours = serverBlob.tours ?? [:]
            for (k, v) in cache.tours ?? [:] {
                mergedTours[k] = v
            }
            var mergedAnnouncements = serverBlob.featureAnnouncements ?? [:]
            for (k, v) in cache.featureAnnouncements ?? [:] {
                mergedAnnouncements[k] = v
            }
            cache = HelpStateBlob(
                tours: mergedTours.isEmpty ? nil : mergedTours,
                featureAnnouncements: mergedAnnouncements.isEmpty ? nil : mergedAnnouncements
            )
            hydrated = true
        } catch {
            #if DEBUG
            print("[help-system] SupabaseHelpStateAdapter.loadState failed (treating as fresh user): \(error.localizedDescription)")
            #endif
            hydrated = true
        }
        return cache
    }

    // MARK: - Read (synchronous against cache)

    /// Cached tour entry. Returns nil if the cache hasn't been hydrated yet
    /// OR the user has no entry for that tour. The orchestrator treats a nil
    /// return identically to "fresh user" — same as the v1 UserDefaults path.
    public func cachedTourEntry(_ tourId: String) -> HelpStateBlob.TourEntry? {
        cache.tours?[tourId]
    }

    /// Cached feature-announcement entry.
    public func cachedFeatureAnnouncement(
        _ featureKey: String
    ) -> HelpStateBlob.FeatureAnnouncementEntry? {
        cache.featureAnnouncements?[featureKey]
    }

    /// Full cached blob — used by the migration sweep.
    public func cachedBlob() -> HelpStateBlob {
        cache
    }

    /// Whether the initial Supabase round-trip has completed.
    public var isHydrated: Bool { hydrated }

    // MARK: - Write

    /// Merge a patch into the tour entry and schedule a write to Supabase.
    /// Sequential calls are serialized — the network write order matches the
    /// in-memory mutation order.
    public func setTourEntry(_ tourId: String, patch: HelpStateBlob.TourEntry) {
        let previous = cache.tours?[tourId] ?? HelpStateBlob.TourEntry()
        let merged = HelpStateBlob.TourEntry(
            completed: patch.completed ?? previous.completed,
            abandoned: patch.abandoned ?? previous.abandoned,
            launched: patch.launched ?? previous.launched,
            atStep: patch.atStep ?? previous.atStep,
            completedAt: patch.completedAt ?? previous.completedAt,
            abandonedAt: patch.abandonedAt ?? previous.abandonedAt
        )
        var tours = cache.tours ?? [:]
        tours[tourId] = merged
        cache = HelpStateBlob(
            tours: tours,
            featureAnnouncements: cache.featureAnnouncements
        )
        scheduleSave()
    }

    /// Set a feature-announcement entry and schedule a write.
    public func setFeatureAnnouncement(
        _ featureKey: String,
        patch: HelpStateBlob.FeatureAnnouncementEntry
    ) {
        var announcements = cache.featureAnnouncements ?? [:]
        announcements[featureKey] = patch
        cache = HelpStateBlob(
            tours: cache.tours,
            featureAnnouncements: announcements
        )
        scheduleSave()
    }

    /// Await any in-flight write. Call before sign-out so the user doesn't
    /// leave with a queued patch unsent.
    public func flush() async {
        await writeTask.value
    }

    /// Schedule an async write of the current cache. The new task waits for
    /// the previous tail to complete so the wire-order matches in-memory
    /// mutation order.
    private func scheduleSave() {
        let snapshot = cache
        let previous = writeTask
        writeTask = Task { [client, userId] in
            _ = await previous.value
            await Self.performSave(client: client, userId: userId, blob: snapshot)
        }
    }

    /// Static save so the closure does not capture `self` (avoiding actor
    /// re-entrancy on the write path).
    private static func performSave(
        client: SupabaseClient,
        userId: String,
        blob: HelpStateBlob
    ) async {
        struct UpdatePayload: Encodable {
            let help_state: HelpStateBlob
        }
        do {
            try await client
                .from("profiles")
                .update(UpdatePayload(help_state: blob))
                .eq("id", value: userId)
                .execute()
        } catch {
            #if DEBUG
            print("[help-system] SupabaseHelpStateAdapter.performSave failed (write dropped): \(error.localizedDescription)")
            #endif
        }
    }
}

// MARK: - UserDefaults → Supabase migration

/// Walk UserDefaults for any pre-S4-1 tour state and promote each entry into
/// the Supabase blob (without clobbering entries already there). After a
/// successful write the UserDefaults keys are cleared so the next launch
/// reads from Supabase. Returns the number of tours migrated.
///
/// Call once per authenticated session, after `loadState()`. Safe to call
/// again — subsequent runs find no UserDefaults entries and short-circuit.
///
/// Marked `@MainActor` because the default tour-key list dereferences
/// `FirstLaunchTourModel.defaultTourKey`, which is itself MainActor-isolated.
@MainActor
@discardableResult
public func migrateUserDefaultsHelpStateToSupabase(
    adapter: SupabaseHelpStateAdapter,
    knownTourKeys: [String] = [FirstLaunchTourModel.defaultTourKey]
) async -> Int {
    var migrated = 0
    for tourKey in knownTourKeys {
        let local = getFirstLaunchTourState(tourKey)
        // Skip if the local entry has no signal (clean fresh-user).
        if local.launched == nil && local.completed == nil && local.abandoned == nil {
            continue
        }
        let server = await adapter.cachedTourEntry(tourKey)
        // If Supabase already has this tour resolved, drop the local copy.
        if server?.isResolved == true {
            clearFirstLaunchTourState(tourKey)
            continue
        }
        // Promote local on top of server — local fields win when set.
        let merged = HelpStateBlob.TourEntry(
            completed: local.completed ?? server?.completed,
            abandoned: local.abandoned ?? server?.abandoned,
            launched: local.launched ?? server?.launched,
            atStep: local.atStep ?? server?.atStep,
            completedAt: local.completedAt ?? server?.completedAt,
            abandonedAt: local.abandonedAt ?? server?.abandonedAt
        )
        await adapter.setTourEntry(tourKey, patch: merged)
        clearFirstLaunchTourState(tourKey)
        migrated += 1
    }
    // Wait for the writes to land before declaring success.
    await adapter.flush()
    return migrated
}
