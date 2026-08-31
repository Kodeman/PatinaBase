//
//  CaptureSessionContext.swift
//  CaptureKit
//
//  Visit-scoped routing memory. Product facts never enter this structure.
//

import Foundation

public struct CaptureSessionIdentity: Codable, Equatable, Sendable {
    public let userID: String
    public let workspaceID: String

    public init(userID: String?, workspaceID: String?) {
        self.userID = userID?.trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty ?? "anonymous"
        self.workspaceID = workspaceID?.trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty ?? "unscoped"
    }
}

public struct CaptureRoutingMemory: Codable, Equatable, Sendable {
    public var destination: CaptureDestination
    public var projectID: String?
    public var projectName: String?
    public var projectRoomID: String?
    public var room: String?
    public var shelf: String?

    public init(
        destination: CaptureDestination = .undecided,
        projectID: String? = nil,
        projectName: String? = nil,
        projectRoomID: String? = nil,
        room: String? = nil,
        shelf: String? = nil
    ) {
        self.destination = destination
        self.projectID = projectID
        self.projectName = projectName
        self.projectRoomID = projectRoomID
        self.room = room
        self.shelf = shelf
    }

    public static let empty = CaptureRoutingMemory()
}

public struct CaptureSessionContext: Codable, Equatable, Sendable {
    public let visitID: UUID
    public let identity: CaptureSessionIdentity
    public let startedAt: Date
    public var lastActivityAt: Date
    public var routing: CaptureRoutingMemory

    // ── The visit (wave 3). FC-R2: nil kind IS the "no visit" state. ──
    public var kind: FieldVisitKind?
    public var kit: FieldVisitKit?
    /// The visit's human label — the project name on a site visit, the venue on
    /// a sourcing run. Lands in `field_captures.visit_label`.
    public var label: String?
    /// FC-R5 SCAN lane only: a `public.rooms` id. NEVER stamped into
    /// `field_captures.project_room_id` — that is `routing.projectRoomID`.
    public var scanRoomID: String?
    /// Sourcing only, capped at `maxProjectsInMind`. Absent from a build-2 blob
    /// — see `init(from:)`.
    public var projectsInMind: [String]
    public var endedAt: Date?

    public init(
        visitID: UUID = UUID(),
        identity: CaptureSessionIdentity,
        startedAt: Date,
        lastActivityAt: Date,
        routing: CaptureRoutingMemory = .empty,
        kind: FieldVisitKind? = nil,
        kit: FieldVisitKit? = nil,
        label: String? = nil,
        scanRoomID: String? = nil,
        projectsInMind: [String] = [],
        endedAt: Date? = nil
    ) {
        self.visitID = visitID
        self.identity = identity
        self.startedAt = startedAt
        self.lastActivityAt = lastActivityAt
        self.routing = routing
        self.kind = kind
        self.kit = kit
        self.label = label
        self.scanRoomID = scanRoomID
        self.projectsInMind = Array(projectsInMind.prefix(Self.maxProjectsInMind))
        self.endedAt = endedAt
    }

    public var isVisit: Bool { kind != nil && endedAt == nil }

    public static let maxProjectsInMind = 4

    /// Hand-written because this type is PERSISTED — to UserDefaults under an
    /// unchanged key (`capture.session-context.v1`) — so a phone upgrading from
    /// TestFlight build 2 hands wave 3's decoder a blob written before
    /// `projectsInMind`, `kind`, `kit`, `label` and `scanRoomID` existed. Both
    /// read sites `try?` the decode away, so a throw is SILENT: her routing
    /// memory disappears and nothing says why.
    ///
    /// A declaration default does NOT reach the synthesized decoder — Swift's
    /// synthesis calls `decode(_:forKey:)` for every non-Optional property
    /// whatever its default, so `projectsInMind: [String] = []` still throws
    /// `keyNotFound` against a build-2 blob. `decodeIfPresent` is the only thing
    /// that makes an added non-Optional property absent-tolerant. Every property
    /// that has a default in the memberwise initialiser gets one here, so the
    /// NEXT added field is tolerant by the same rule rather than by memory.
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        visitID = try container.decode(UUID.self, forKey: .visitID)
        identity = try container.decode(CaptureSessionIdentity.self, forKey: .identity)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        lastActivityAt = try container.decode(Date.self, forKey: .lastActivityAt)
        routing = try container.decodeIfPresent(CaptureRoutingMemory.self,
                                                forKey: .routing) ?? .empty
        kind = try container.decodeIfPresent(FieldVisitKind.self, forKey: .kind)
        kit = try container.decodeIfPresent(FieldVisitKit.self, forKey: .kit)
        label = try container.decodeIfPresent(String.self, forKey: .label)
        scanRoomID = try container.decodeIfPresent(String.self, forKey: .scanRoomID)
        // NOT capped here, unlike the memberwise initialiser: an over-cap stored
        // blob decodes long and `FieldVisitDoorModel` truncates on open, which is
        // what `VisitDoorTests.anOverCapProjectsInMindArrivesLongAndOpensTruncated`
        // pins. This initialiser exists to tolerate an ABSENT key and to change
        // nothing else.
        projectsInMind = try container.decodeIfPresent([String].self,
                                                       forKey: .projectsInMind) ?? []
        endedAt = try container.decodeIfPresent(Date.self, forKey: .endedAt)
    }
}

public enum CaptureSessionContextPolicy {
    public static let inactivityWindow: TimeInterval = 4 * 60 * 60

    public static func resolve(
        existing: CaptureSessionContext?,
        identity: CaptureSessionIdentity,
        now: Date,
        calendar: Calendar = .current
    ) -> CaptureSessionContext {
        guard let existing,
              existing.identity == identity,
              existing.endedAt == nil,
              now >= existing.lastActivityAt else {
            return CaptureSessionContext(
                identity: identity,
                startedAt: now,
                lastActivityAt: now
            )
        }
        // W4-C15: `inactivityWindow` is a ROUTING window, not a visit's lifetime.
        // A visit `CaptureVisitPolicy.visitState` still calls live — up to 12
        // hours idle on the same calendar day — RESUMES across it whole, keeping
        // its `visitID`, kind, kit, label and routing. That is what W1's "Still
        // at Maple St? → Resume" already promises her, and the shorter window
        // used to break the promise silently. Only a kindless context can be
        // dropped for elapsed time alone.
        let live = visitState(for: existing, now: now, calendar: calendar) != .none
        guard live || now.timeIntervalSince(existing.lastActivityAt) < inactivityWindow else {
            return CaptureSessionContext(
                identity: identity,
                startedAt: now,
                lastActivityAt: now
            )
        }
        // A visit the rules HAVE killed, reached inside the routing window (the
        // calendar rollover is the only way in). `resolve` WRITES — `current`
        // persists what it returns — so resuming it would both hand out its
        // `visitID` (ViewfinderModel mints every draft's `sessionID` from it, so
        // yesterday's visit would collect today's captures) and refresh its
        // `lastActivityAt`, pushing the 12-hour auto-end out of reach forever.
        // Routing memory has always been day-agnostic and survives; the visit
        // fields and the grouping id do not. `current` reaps this close first, so
        // it is recorded and emitted rather than dropped.
        if existing.kind != nil, !live {
            return CaptureSessionContext(
                identity: identity,
                startedAt: now,
                lastActivityAt: now,
                routing: existing.routing
            )
        }
        var resumed = existing
        resumed.lastActivityAt = now
        return resumed
    }

    public static func remember(
        _ routing: CaptureRoutingMemory,
        in context: CaptureSessionContext,
        now: Date
    ) -> CaptureSessionContext {
        var updated = context
        updated.routing = routing
        updated.lastActivityAt = now
        return updated
    }
}

/// What a reap found: the visit as it stood OPEN, why it closed, and when.
///
/// `Codable` because a close reaped inside `current()` has no emitter in front
/// of it and has to wait in the store's pending-end queue for one.
public struct FieldVisitEndNotice: Codable, Equatable, Sendable {
    public let context: CaptureSessionContext
    public let reason: FieldVisitEndReason
    /// The instant the close was reaped. FC-R21 makes `duration_min` wall time
    /// from `startedAt` to HERE, so a notice drained later must not be measured
    /// from whenever the emitter got round to it.
    public let closedAt: Date

    public init(context: CaptureSessionContext,
                reason: FieldVisitEndReason,
                closedAt: Date) {
        self.context = context
        self.reason = reason
        self.closedAt = closedAt
    }
}

@MainActor
public final class CaptureSessionContextStore {
    public static let shared = CaptureSessionContextStore()

    private let defaults: UserDefaults
    private let key: String
    private let pendingEndsKey: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(
        defaults: UserDefaults = UserDefaults(
            suiteName: CaptureStore.appGroupID
        ) ?? .standard,
        key: String = "capture.session-context.v1"
    ) {
        self.defaults = defaults
        self.key = key
        self.pendingEndsKey = key + ".pending-ends"
    }

    public func current(
        identity: CaptureSessionIdentity,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> CaptureSessionContext {
        // Read BEFORE the reap. `resolve` has to see the still-OPEN context, or
        // the rollover branch below finds `endedAt != nil`, falls into the first
        // guard and loses her routing memory.
        let existing = defaults.data(forKey: key).flatMap {
            try? decoder.decode(CaptureSessionContext.self, from: $0)
        }
        // FC-R21 N-2 / W4-C15. A visit the rules still call live now resumes
        // across the 4-hour routing window (`resolve`), so what is left to close
        // here is exactly what `expiry()` names: `auto` (12 hours idle, or a
        // backwards clock) and `rollover` (a new calendar day) — INCLUDING the
        // rollover `resolve` reaches with under 4 hours idle, which used to drop
        // the visit with no `endedAt` and no event at all, on four routing
        // screens that call `current()` with no reaper in front of them.
        //
        // It goes through the SAME reap every other computed close uses, so the
        // close is stamped, persisted and announced once. `current` hands back a
        // context, not a notice, and cannot reach the app-side emitter, so the
        // notice waits in the pending-end queue for the next `reapExpired`.
        if let notice = reapExpiredVisit(identity: identity, now: now, calendar: calendar) {
            enqueuePendingVisitEnd(notice, now: now)
        }
        let resolved = CaptureSessionContextPolicy.resolve(
            existing: existing,
            identity: identity,
            now: now,
            calendar: calendar
        )
        persist(resolved)
        return resolved
    }

    @discardableResult
    public func remember(
        _ routing: CaptureRoutingMemory,
        identity: CaptureSessionIdentity,
        now: Date = Date()
    ) -> CaptureSessionContext {
        let context = current(identity: identity, now: now)
        let updated = CaptureSessionContextPolicy.remember(
            routing,
            in: context,
            now: now
        )
        persist(updated)
        return updated
    }

    public func visitState(
        identity: CaptureSessionIdentity,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> CaptureVisitState {
        let stored = defaults.data(forKey: key).flatMap {
            try? decoder.decode(CaptureSessionContext.self, from: $0)
        }
        guard let stored, stored.identity == identity else { return .none }
        return CaptureSessionContextPolicy.visitState(for: stored, now: now, calendar: calendar)
    }

    @discardableResult
    public func startVisit(
        _ draft: CaptureVisitDraft,
        identity: CaptureSessionIdentity,
        now: Date = Date()
    ) -> CaptureSessionContext {
        let context = CaptureSessionContextPolicy.started(draft, identity: identity, now: now)
        persist(context)
        NotificationCenter.default.post(name: Self.visitDidChange, object: nil)
        return context
    }

    /// Ends the OPEN visit rather than replacing it with a fresh one: the visit
    /// keeps its `visitID` and gains an `endedAt`, so what just closed is still
    /// readable and `visitState` reads `.none` from here on. The next capture
    /// mints a kindless context through `resolve`.
    @discardableResult
    public func endVisit(
        identity: CaptureSessionIdentity,
        now: Date = Date()
    ) -> CaptureSessionContext {
        let open = defaults.data(forKey: key).flatMap {
            try? decoder.decode(CaptureSessionContext.self, from: $0)
        }
        guard let open, open.identity == identity else {
            let fresh = CaptureSessionContext(identity: identity, startedAt: now,
                                              lastActivityAt: now)
            persist(fresh)
            NotificationCenter.default.post(name: Self.visitDidChange, object: nil)
            return fresh
        }
        // A second "End visit" tap must not overwrite what the first one closed:
        // the already-ended record IS the readable one.
        guard open.endedAt == nil else { return open }
        let closed = CaptureSessionContextPolicy.ended(open, now: now)
        persist(closed)
        NotificationCenter.default.post(name: Self.visitDidChange, object: nil)
        return closed
    }

    /// FC-R21 part 3: close a visit that expired without a tap, EXACTLY ONCE.
    ///
    /// The three computed ends (`CaptureSessionContextPolicy.expiry`) are
    /// functions of time: they write nothing and post nothing, so a visit could
    /// die in her pocket and no `visit.end` ever fired. This is what turns one
    /// into a real close — it stamps `endedAt`, so the second caller to notice
    /// the same expiry (another screen refreshing, a second foreground) gets
    /// `nil` and cannot double-emit.
    ///
    /// Returns the still-OPEN context, not the closed one: the caller reads the
    /// visit's own §14 counts from it, and `endedAt` would only tell it what it
    /// already knows.
    @discardableResult
    public func reapExpiredVisit(
        identity: CaptureSessionIdentity,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> FieldVisitEndNotice? {
        let stored = defaults.data(forKey: key).flatMap {
            try? decoder.decode(CaptureSessionContext.self, from: $0)
        }
        guard let open = stored, open.identity == identity,
              let reason = CaptureSessionContextPolicy.expiry(for: open, now: now,
                                                              calendar: calendar)
        else { return nil }
        persist(CaptureSessionContextPolicy.ended(open, now: now))
        NotificationCenter.default.post(name: Self.visitDidChange, object: nil)
        return FieldVisitEndNotice(context: open, reason: reason, closedAt: now)
    }

    /// FC-R21 part 3: the closes `current()` reaped on a screen with no emitter
    /// in front of it, oldest first. Taking them clears them, so each close
    /// emits exactly once however many surfaces drain the queue.
    ///
    /// FC-R21's own N-2 note names this remedy — "a persisted pending-end slot
    /// or reap inside `current()`" — and the fix is both: `current()` reaps, and
    /// what it reaps waits here. Persisted rather than in-memory because a close
    /// reaped seconds before the app is killed is still a close that owes an
    /// event.
    @discardableResult
    public func takePendingVisitEnds(
        identity: CaptureSessionIdentity,
        now: Date = Date()
    ) -> [FieldVisitEndNotice] {
        let pending = pendingVisitEnds(now: now)
        guard !pending.isEmpty else { return [] }
        let mine = pending.filter { $0.context.identity == identity }
        guard !mine.isEmpty else { return [] }
        // Another account's undrained closes are left for that account's
        // emitter: the counts `visit.end` carries are read per owner.
        persistPendingVisitEnds(pending.filter { $0.context.identity != identity })
        return mine
    }

    /// Sign-out or workspace change. The open context goes; the pending-end
    /// queue does NOT. Each notice carries its own visit and its own identity —
    /// `takePendingVisitEnds` hands back only the caller's — so a close reaped
    /// seconds before a sign-out survives to be emitted when that account comes
    /// back, instead of being thrown away by a switch that had nothing to do
    /// with it.
    public func reset() {
        defaults.removeObject(forKey: key)
    }

    /// R119: a visit can begin or end from a surface that presents no sheet —
    /// the Companion strip's "End visit" is inline — so a screen that names the
    /// visit has nothing to hang a refresh on. Posted by `startVisit`,
    /// `endVisit` and `reapExpiredVisit` — every path that actually opens or
    /// closes a visit, the reap `current()` makes included. NOT posted by an
    /// ordinary `current(…)` resolve, which persists on every draft and would
    /// make this chatter.
    public static let visitDidChange = Notification.Name("capture.visitDidChange")

    /// The cap keeps the NEWEST, and it is PER OWNER. Keeping the oldest meant
    /// that once eight closes had queued, every close after them was dropped on
    /// the floor for good — the queue froze on the first eight and no later
    /// visit could ever reach a dashboard. Dropping the oldest loses one old
    /// close instead of every new one.
    ///
    /// Per owner because `reset()` (sign-out, workspace change) deliberately
    /// keeps the queue: one shared eight-slot list evicting by age ACROSS
    /// identities means the next designer's eight visits destroy the notices the
    /// signed-out designer is still owed, which is the exact thing keeping the
    /// queue across a reset exists to prevent. Only the enqueuing identity can
    /// grow, so only its own run is trimmed.
    private static let maxPendingVisitEndsPerOwner = 8

    /// A close nobody has drained in two weeks is not going to be drained: the
    /// counts it carries describe a visit a fortnight gone, and the queue is
    /// persisted, so without this a notice for an account that never signs back
    /// in sits in `UserDefaults` for the life of the install.
    public static let pendingVisitEndTTL: TimeInterval = 14 * 24 * 60 * 60

    private func enqueuePendingVisitEnd(_ notice: FieldVisitEndNotice, now: Date) {
        let queued = pendingVisitEnds(now: now) + [notice]
        let owner = notice.context.identity
        let evicted = Set(queued.indices
            .filter { queued[$0].context.identity == owner }
            .dropLast(Self.maxPendingVisitEndsPerOwner))
        persistPendingVisitEnds(queued.enumerated()
            .filter { !evicted.contains($0.offset) }
            .map(\.element))
    }

    /// One unreadable ELEMENT must not strand the other seven. Decoding the
    /// array with `try?` returned nil for the whole queue whenever a single
    /// element failed — a shape change in `CaptureSessionContext` discarded
    /// every close waiting. Each notice is decoded on its own and a failure
    /// skips just that element.
    ///
    /// ⚠ This does NOT survive a truncated write: the outer array is still
    /// decoded in one piece, so JSON that stops mid-blob fails wholesale and the
    /// queue reads empty. Element-level tolerance is the whole of the guarantee.
    ///
    /// Expired notices are dropped HERE rather than on a sweep, so every read
    /// applies the TTL and nothing has to remember to run one.
    private func pendingVisitEnds(now: Date) -> [FieldVisitEndNotice] {
        guard let data = defaults.data(forKey: pendingEndsKey) else { return [] }
        let entries = (try? decoder.decode([LenientVisitEndNotice].self, from: data)) ?? []
        return entries.compactMap(\.notice).filter {
            now.timeIntervalSince($0.closedAt) < Self.pendingVisitEndTTL
        }
    }

    private func persistPendingVisitEnds(_ notices: [FieldVisitEndNotice]) {
        guard !notices.isEmpty else {
            defaults.removeObject(forKey: pendingEndsKey)
            return
        }
        guard let data = try? encoder.encode(notices) else { return }
        defaults.set(data, forKey: pendingEndsKey)
    }

    private func persist(_ context: CaptureSessionContext) {
        guard let data = try? encoder.encode(context) else { return }
        defaults.set(data, forKey: key)
    }
}

/// One element of the persisted pending-end queue, decoded tolerantly so a
/// malformed neighbour cannot take the rest of the queue with it. An ELEMENT
/// only: the surrounding array is still decoded whole, so this does nothing for
/// a blob that was truncated mid-write.
private struct LenientVisitEndNotice: Decodable {
    let notice: FieldVisitEndNotice?

    init(from decoder: Decoder) throws {
        notice = try? FieldVisitEndNotice(from: decoder)
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

public extension CaptureRoutingMemory {
    /// The single place visit routing crosses onto a capture. Added because
    /// ViewfinderModel.makeDraft() copied four of the five fields and dropped
    /// projectRoomID, so a capture inherited the project and lost the room.
    /// GPS and the human venue label are capture facts and are never touched.
    func stamped(onto venue: VenueStamp) -> VenueStamp {
        var stamped = venue
        stamped.projectId = projectID
        stamped.projectName = projectName
        stamped.projectRoomId = projectRoomID
        stamped.room = room
        stamped.shelf = shelf
        return stamped
    }
}
