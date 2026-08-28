//
//  RoomSyncCoordinator.swift
//  Patina
//
//  The read half of the room mirror. `RoomCreationCoordinator` writes a room
//  outward; nothing ever read one back, so `RoomsAPIClient.listRooms()` had
//  zero call sites and a room the account owns was only ever on the phone that
//  typed it. On the W4 walk that cost two things: the seeded `Guest Bedroom`
//  never appeared, and a room the client typed and synced in-session was gone
//  from Today and Spaces after a sign-out and a sign-in.
//
//  Rooms and saves stay local-first (SP-14) — this does not make the server
//  authoritative. It reconciles:
//
//    · a server row this phone has no mirror of      → created locally
//    · a mirror whose local edit is newer            → the local edit stands
//    · a mirror whose local edit is older            → the server's row wins
//    · a local room that never synced (`remoteId` nil) → untouched, always
//
//  That last rule is SP-06: the guest's work is the guest's until the claim
//  step carries it across. A merge never adopts it into whichever account
//  happens to sign in next, and never deletes it either.
//

import Foundation
import SwiftData

/// The remote half, as a protocol so the merge is exercisable without a live
/// client — the same shape `RoomCreationRemote` takes.
public protocol RoomListRemote: Sendable {
    func resolveUserId() async throws -> String
    func listRooms(userId: String) async throws -> [RemoteRoom]
}

extension RoomsAPIClient: RoomListRemote {}

/// The rules, as values. No SwiftData, no network — so every branch is
/// testable and the coordinator below has nothing left to decide.
public enum RoomMerge {

    /// What the store knows about one of its rooms, and nothing more.
    public struct LocalRoom: Equatable, Sendable {
        public let id: UUID
        public let remoteId: String?
        public let updatedAt: Date

        public init(id: UUID, remoteId: String?, updatedAt: Date) {
            self.id = id
            self.remoteId = remoteId
            self.updatedAt = updatedAt
        }
    }

    public struct Plan: Equatable {
        /// Server ids with no local mirror — create them.
        public var insert: [String] = []
        /// Local rooms whose server row is newer — take the server's values.
        public var takeServer: [UUID] = []
        /// Local rooms edited since the server last saw them — leave them.
        /// This mirror is read-only: nothing here pushes, so a locally-newer
        /// room stays newer here and older there until whatever wrote it
        /// syncs. Owed, and named so rather than left to be discovered.
        public var keepLocal: [UUID] = []
        /// Rooms that never synced. Never merged into an account (SP-06).
        public var untouched: [UUID] = []
    }

    public static func plan(server: [RemoteRoom], local: [LocalRoom]) -> Plan {
        var plan = Plan()

        var mirrorByRemoteId: [String: LocalRoom] = [:]
        for room in local {
            guard let remoteId = room.remoteId else {
                plan.untouched.append(room.id)
                continue
            }
            // A remote id is a uuid; the server lower-cases it and the device
            // has written both cases over the app's life.
            let key = remoteId.lowercased()
            if mirrorByRemoteId[key] == nil { mirrorByRemoteId[key] = room }
        }

        for row in server {
            guard let mirror = mirrorByRemoteId[row.id.lowercased()] else {
                plan.insert.append(row.id)
                continue
            }
            // A device clock against a Postgres clock: a phone running behind
            // loses a genuinely newer local edit. Named rather than defended
            // against — the alternative is a server-side revision counter.
            let serverStamp = ISO8601DateParsing.dateOrDay(from: row.updated_at)
            // At an equal stamp the mirror already IS the server's row — a
            // mirror carries the stamp it was written from — so there is
            // nothing to take, and re-taking it would report a change to
            // every screen watching for one on every visit.
            if let serverStamp, mirror.updatedAt >= serverStamp {
                plan.keepLocal.append(mirror.id)
            } else {
                plan.takeServer.append(mirror.id)
            }
        }

        return plan
    }
}

@MainActor
@Observable
public final class RoomSyncCoordinator {

    public static let shared = RoomSyncCoordinator()

    /// A screen appearing is not a reason to ask the server again. The window
    /// is short enough that a room typed on another device shows up on the
    /// next visit, and long enough that Today and Spaces in one session make
    /// one request between them.
    public static let minimumInterval: TimeInterval = 30

    /// Bumped once per reconcile that actually changed the store.
    ///
    /// Spaces reads its rooms through `@Query` and repaints for free; Today's
    /// house rail reads a snapshot taken in `DailyRoomViewModel.load()`, so
    /// without a signal the room this coordinator has just mirrored sat in
    /// SwiftData and off the rail until the app was backgrounded — which is
    /// exactly the returning client's first minute in the app.
    public private(set) var revision: Int = 0

    private(set) var lastOwner: String?
    private(set) var lastRunAt: Date?
    private var inFlight = false

    public init() {}

    /// Seeded, for the tests that need a coordinator with a history.
    init(lastOwner: String?, lastRunAt: Date?) {
        self.lastOwner = lastOwner
        self.lastRunAt = lastRunAt
    }

    /// Forget that this store was ever reconciled. Called wherever the local
    /// store is wiped: the rows the debounce was protecting are gone, so the
    /// next screen to appear must ask again rather than wait out the window.
    public func forget() {
        lastOwner = nil
        lastRunAt = nil
    }

    /// Pure, so the debounce is a fact rather than a hope. A change of owner
    /// always refetches: the store has just been claimed or wiped, and the
    /// new account's rooms are exactly what is missing.
    static func isDue(
        owner: String,
        lastOwner: String?,
        lastRunAt: Date?,
        now: Date,
        minimumInterval: TimeInterval = RoomSyncCoordinator.minimumInterval
    ) -> Bool {
        if owner != lastOwner { return true }
        guard let lastRunAt else { return true }
        return now.timeIntervalSince(lastRunAt) >= minimumInterval
    }

    /// The same decision against this coordinator's own history.
    func isDue(owner: String, now: Date) -> Bool {
        Self.isDue(owner: owner, lastOwner: lastOwner, lastRunAt: lastRunAt, now: now)
    }

    /// Reconcile the account's rooms into the local store. Signed out — a
    /// guest — this does nothing at all: there is no account to merge into,
    /// and the rooms on this phone are the guest's own (SP-06).
    public func reconcile(
        store: RoomStore,
        api: RoomListRemote = RoomsAPIClient.shared,
        now: Date = Date()
    ) async {
        // Claimed before the first `await`, or two screens appearing in the
        // same tick both pass the guard and both fetch (fix-review m-1).
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }

        await AuthService.shared.waitForAuthReady()
        guard AuthService.shared.isAuthenticated,
              let owner = try? await api.resolveUserId() else { return }
        guard Self.isDue(owner: owner, lastOwner: lastOwner, lastRunAt: lastRunAt, now: now) else {
            return
        }

        let rows: [RemoteRoom]
        do {
            rows = try await api.listRooms(userId: owner)
        } catch {
            #if DEBUG
            PatinaLog.sync.error("[RoomSync] listRooms failed: \(error.localizedDescription)")
            #endif
            return
        }

        apply(rows, in: store, owner: owner)
        lastOwner = owner
        lastRunAt = now
    }

    /// The same reconcile against the app's own store, for callers that hold
    /// no `ModelContext` of their own (the auth-state listener).
    public func reconcileSharedStore() async {
        await reconcile(store: RoomStore(context: PersistenceController.shared.container.mainContext))
    }

    /// The plan, executed. Split out so a test can run it twice and assert the
    /// second pass changes nothing.
    ///
    /// `owner` is the account the rows are being merged into, and a row
    /// belonging to anyone else is dropped here whatever the request asked
    /// for — the filter on the query and this check are two independent
    /// answers to the same question (SP-06: an account's rooms are the
    /// account's, never another user's).
    @discardableResult
    func apply(_ rows: [RemoteRoom], in store: RoomStore, owner: String) -> Bool {
        let rows = rows.filter { $0.user_id.lowercased() == owner.lowercased() }
        let local = store.allRooms()
        let plan = RoomMerge.plan(
            server: rows,
            local: local.map {
                RoomMerge.LocalRoom(id: $0.id, remoteId: $0.remoteId, updatedAt: $0.updatedAt)
            }
        )

        let rowById = Dictionary(rows.map { ($0.id.lowercased(), $0) }, uniquingKeysWith: { first, _ in first })

        var changed = false

        for remoteId in plan.insert {
            guard let row = rowById[remoteId.lowercased()] else { continue }
            store.insertMirrored(row)
            changed = true
        }

        for localId in plan.takeServer {
            guard let room = local.first(where: { $0.id == localId }),
                  let remoteId = room.remoteId,
                  let row = rowById[remoteId.lowercased()] else { continue }
            store.applyRemote(row, to: room)
            changed = true
        }

        if changed { revision += 1 }
        return changed
    }
}
