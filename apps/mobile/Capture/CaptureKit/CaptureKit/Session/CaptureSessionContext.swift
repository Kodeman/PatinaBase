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

    public init(
        visitID: UUID = UUID(),
        identity: CaptureSessionIdentity,
        startedAt: Date,
        lastActivityAt: Date,
        routing: CaptureRoutingMemory = .empty
    ) {
        self.visitID = visitID
        self.identity = identity
        self.startedAt = startedAt
        self.lastActivityAt = lastActivityAt
        self.routing = routing
    }
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
