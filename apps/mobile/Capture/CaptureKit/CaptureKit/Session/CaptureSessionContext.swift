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
              now.timeIntervalSince(existing.lastActivityAt) < inactivityWindow,
              now >= existing.lastActivityAt else {
            return CaptureSessionContext(
                identity: identity,
                startedAt: now,
                lastActivityAt: now
            )
        }
        // The visit's own rules outrank this 4-hour routing window, and `resolve`
        // WRITES: `current` persists what it returns, so resuming a visit the
        // rules have killed would both hand out its `visitID` (ViewfinderModel
        // mints every draft's `sessionID` from it, so yesterday's visit would
        // collect today's captures) and refresh its `lastActivityAt`, pushing the
        // 12-hour auto-end out of reach forever. Routing memory has always been
        // day-agnostic and survives; the visit fields and the grouping id do not.
        if existing.kind != nil,
           visitState(for: existing, now: now, calendar: calendar) == .none {
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

/// What `reapExpiredVisit` found: the visit as it stood OPEN, and why it closed.
public struct FieldVisitEndNotice: Equatable, Sendable {
    public let context: CaptureSessionContext
    public let reason: FieldVisitEndReason

    public init(context: CaptureSessionContext, reason: FieldVisitEndReason) {
        self.context = context
        self.reason = reason
    }
}

@MainActor
public final class CaptureSessionContextStore {
    public static let shared = CaptureSessionContextStore()

    private let defaults: UserDefaults
    private let key: String
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
    }

    public func current(
        identity: CaptureSessionIdentity,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> CaptureSessionContext {
        var existing = defaults.data(forKey: key).flatMap {
            try? decoder.decode(CaptureSessionContext.self, from: $0)
        }
        // FC-R21 N-2: `resolve`'s FIRST guard fires on ELAPSED TIME alone
        // (its own 4-hour routing window, `inactivityWindow`) and returns a
        // fresh, kindless context the moment that fails — before the
        // visit-aware branch ever runs. A visit idle 4-12 hours on the same
        // calendar day is still "live" by `CaptureVisitPolicy`'s own longer
        // rules (`autoEndWindow`, 12 hours + same day), so that guard would
        // otherwise destroy it with no `endVisit`, no reap, and no
        // `visit.end` — `expiry()` alone would miss this exact window too
        // (it stays nil while the visit is still alive by ITS rules), so the
        // reap below fires on the SAME time-based condition `resolve`'s own
        // guard uses, not on `expiry()`'s narrower one. Deliberately left
        // alone: `resolve`'s SECOND branch (a same-day rollover reached with
        // under 4 hours idle), which already preserves routing memory
        // correctly on its own and must keep doing so — reaping first there
        // would force `resolve` into its routing-losing FIRST branch
        // instead. Mirrors the persist(ended())+notify sequence
        // `reapExpiredVisit` already makes, so the close is recorded before
        // the replace happens rather than lost.
        if let open = existing, open.identity == identity, open.kind != nil, open.endedAt == nil {
            let withinRoutingWindow = now >= open.lastActivityAt &&
                now.timeIntervalSince(open.lastActivityAt) < CaptureSessionContextPolicy.inactivityWindow
            if !withinRoutingWindow {
                let closed = CaptureSessionContextPolicy.ended(open, now: now)
                persist(closed)
                NotificationCenter.default.post(name: Self.visitDidChange, object: nil)
                existing = closed
            }
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
        return FieldVisitEndNotice(context: open, reason: reason)
    }

    public func reset() {
        defaults.removeObject(forKey: key)
    }

    /// R119: a visit can begin or end from a surface that presents no sheet —
    /// the Companion strip's "End visit" is inline — so a screen that names the
    /// visit has nothing to hang a refresh on. Posted by `startVisit`/`endVisit`
    /// only: the ordinary `current(…)` resolve persists on every draft and would
    /// make this chatter.
    public static let visitDidChange = Notification.Name("capture.visitDidChange")

    private func persist(_ context: CaptureSessionContext) {
        guard let data = try? encoder.encode(context) else { return }
        defaults.set(data, forKey: key)
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
