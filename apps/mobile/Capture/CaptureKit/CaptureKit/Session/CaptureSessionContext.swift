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
    /// Sourcing only, capped at `maxProjectsInMind`.
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
}

public enum CaptureSessionContextPolicy {
    public static let inactivityWindow: TimeInterval = 4 * 60 * 60

    public static func resolve(
        existing: CaptureSessionContext?,
        identity: CaptureSessionIdentity,
        now: Date
    ) -> CaptureSessionContext {
        guard let existing,
              existing.identity == identity,
              now.timeIntervalSince(existing.lastActivityAt) < inactivityWindow,
              now >= existing.lastActivityAt else {
            return CaptureSessionContext(
                identity: identity,
                startedAt: now,
                lastActivityAt: now
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
        now: Date = Date()
    ) -> CaptureSessionContext {
        let existing = defaults.data(forKey: key).flatMap {
            try? decoder.decode(CaptureSessionContext.self, from: $0)
        }
        let resolved = CaptureSessionContextPolicy.resolve(
            existing: existing,
            identity: identity,
            now: now
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

    @discardableResult
    public func endVisit(
        identity: CaptureSessionIdentity,
        now: Date = Date()
    ) -> CaptureSessionContext {
        let next = CaptureSessionContext(
            identity: identity,
            startedAt: now,
            lastActivityAt: now
        )
        persist(next)
        return next
    }

    public func reset() {
        defaults.removeObject(forKey: key)
    }

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
