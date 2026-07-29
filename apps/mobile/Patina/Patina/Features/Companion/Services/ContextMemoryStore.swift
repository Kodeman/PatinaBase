//
//  ContextMemoryStore.swift
//  Patina
//
//  Privacy-conscious, owner-scoped recency memory for contextual surfaces.
//  Stores only identifiers, activity kinds, and timestamps — never room notes,
//  messages, images, scan geometry, or free-form conversation text.
//

import Foundation
import Observation

public enum ContextActivityKind: String, Codable, CaseIterable, Sendable {
    case room
    case product
    case project
    case designRequest
    case style
}

public struct ContextActivity: Codable, Equatable, Sendable {
    public let kind: ContextActivityKind
    public let identifier: String?
    public let occurredAt: Date

    public init(kind: ContextActivityKind, identifier: String? = nil, occurredAt: Date = Date()) {
        self.kind = kind
        self.identifier = identifier
        self.occurredAt = occurredAt
    }
}

public struct ContextRoomCandidate: Equatable, Sendable {
    public let id: UUID
    public let name: String
    public let updatedAt: Date
    public let itemCount: Int
    public let hasBeenScanned: Bool

    public init(
        id: UUID,
        name: String,
        updatedAt: Date,
        itemCount: Int,
        hasBeenScanned: Bool
    ) {
        self.id = id
        self.name = name
        self.updatedAt = updatedAt
        self.itemCount = itemCount
        self.hasBeenScanned = hasBeenScanned
    }
}

private struct ContextMemorySnapshot: Codable, Equatable {
    var activities: [ContextActivity] = []
}

@MainActor
@Observable
public final class ContextMemoryStore {

    public static let shared = ContextMemoryStore()

    private static let enabledKey = "patina.context_memory.enabled.v1"
    private static let snapshotPrefix = "patina.context_memory.snapshot.v1."
    private static let retentionInterval: TimeInterval = 90 * 24 * 60 * 60

    private let defaults: UserDefaults
    private let ownerIDProvider: @MainActor () -> String
    private let nowProvider: @MainActor () -> Date

    public private(set) var isEnabled: Bool

    public init(
        defaults: UserDefaults = .standard,
        ownerIDProvider: @escaping @MainActor () -> String = {
            AuthService.shared.currentUserId ?? "guest"
        },
        nowProvider: @escaping @MainActor () -> Date = Date.init
    ) {
        self.defaults = defaults
        self.ownerIDProvider = ownerIDProvider
        self.nowProvider = nowProvider
        self.isEnabled = defaults.object(forKey: Self.enabledKey) as? Bool ?? true
    }

    /// Enables or disables contextual learning for this device. Turning it off
    /// immediately removes every owner-scoped snapshot so disabling is also a
    /// genuine forget action, not merely a presentation preference.
    public func setEnabled(_ enabled: Bool) {
        guard enabled != isEnabled else { return }
        isEnabled = enabled
        defaults.set(enabled, forKey: Self.enabledKey)
        if !enabled {
            forgetAll()
            RoomSelectionStore.shared.clear()
        }
    }

    /// Records a navigation event at a deliberately coarse level. Route names
    /// and opaque identifiers are sufficient for recency; no visible copy or
    /// user-authored content is persisted.
    public func remember(route: AppRoute, at date: Date? = nil) {
        guard isEnabled, let activity = activity(for: route, at: date ?? nowProvider()) else { return }
        remember(activity)
    }

    public func rememberRoom(id: UUID, at date: Date? = nil) {
        guard isEnabled else { return }
        remember(ContextActivity(kind: .room, identifier: id.uuidString, occurredAt: date ?? nowProvider()))
    }

    public func rememberStyleUse(at date: Date? = nil) {
        guard isEnabled else { return }
        remember(ContextActivity(kind: .style, occurredAt: date ?? nowProvider()))
    }

    /// Most recent non-expired activity of the requested kind.
    public func latestActivity(of kind: ContextActivityKind) -> ContextActivity? {
        guard isEnabled else { return nil }
        return prunedSnapshot().activities
            .filter { $0.kind == kind }
            .max(by: { $0.occurredAt < $1.occurredAt })
    }

    /// Resolves the active room without inventing a signal:
    /// 1. the room selected in the current session;
    /// 2. the most recently remembered room (when learning is enabled);
    /// 3. the room with the freshest real `updatedAt`.
    public func activeRoom(
        from candidates: [ContextRoomCandidate],
        currentSelectionID: UUID?
    ) -> ContextRoomCandidate? {
        guard !candidates.isEmpty else { return nil }

        if let currentSelectionID,
           let selected = candidates.first(where: { $0.id == currentSelectionID }) {
            return selected
        }

        if isEnabled,
           let rememberedID = latestActivity(of: .room)?.identifier.flatMap({ UUID(uuidString: $0) }),
           let remembered = candidates.first(where: { $0.id == rememberedID }) {
            return remembered
        }

        return candidates.max { lhs, rhs in
            if lhs.updatedAt != rhs.updatedAt {
                return lhs.updatedAt < rhs.updatedAt
            }
            return lhs.itemCount < rhs.itemCount
        }
    }

    /// Removes contextual recency for every account on this device while
    /// preserving rooms, saved items, scans, projects, and the taste profile.
    public func forgetAll() {
        let keys = defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(Self.snapshotPrefix) }
        keys.forEach(defaults.removeObject(forKey:))
    }

    /// Removes only the taste recency event. The durable taste portrait itself
    /// is reset separately by `StyleProfileStore.resetTasteProfile(in:)`.
    public func forgetStyle() {
        guard isEnabled else { return }
        var snapshot = prunedSnapshot()
        snapshot.activities.removeAll(where: { $0.kind == .style })
        save(snapshot)
    }

    private var snapshotKey: String {
        let owner = ownerIDProvider()
            .lowercased()
            .filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
        return Self.snapshotPrefix + (owner.isEmpty ? "guest" : owner)
    }

    private func remember(_ activity: ContextActivity) {
        var snapshot = prunedSnapshot()
        snapshot.activities.removeAll(where: { $0.kind == activity.kind })
        snapshot.activities.append(activity)
        save(snapshot)
    }

    private func prunedSnapshot() -> ContextMemorySnapshot {
        guard let data = defaults.data(forKey: snapshotKey),
              var snapshot = try? JSONDecoder().decode(ContextMemorySnapshot.self, from: data) else {
            return ContextMemorySnapshot()
        }
        let cutoff = nowProvider().addingTimeInterval(-Self.retentionInterval)
        let originalCount = snapshot.activities.count
        snapshot.activities.removeAll(where: { $0.occurredAt < cutoff })
        if snapshot.activities.count != originalCount {
            save(snapshot)
        }
        return snapshot
    }

    private func save(_ snapshot: ContextMemorySnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: snapshotKey)
    }

    private func activity(for route: AppRoute, at date: Date) -> ContextActivity? {
        switch route {
        case .roomProject(let roomID),
             .roomSettings(let roomID),
             .roomSavedItems(let roomID),
             .roomEmergence(let roomID):
            return ContextActivity(kind: .room, identifier: roomID.uuidString, occurredAt: date)
        case .pieceDetail(let pieceID):
            return ContextActivity(kind: .product, identifier: pieceID, occurredAt: date)
        case .emergence(let pieceID):
            guard let pieceID else { return nil }
            return ContextActivity(kind: .product, identifier: pieceID, occurredAt: date)
        case .arPlacement(let productID, _):
            return ContextActivity(kind: .product, identifier: productID, occurredAt: date)
        case .projectDetail(let projectID):
            return ContextActivity(kind: .project, identifier: projectID, occurredAt: date)
        case .designRequests(let leadID):
            return ContextActivity(kind: .designRequest, identifier: leadID, occurredAt: date)
        case .styleQuiz, .styleResult:
            return ContextActivity(kind: .style, occurredAt: date)
        default:
            return nil
        }
    }
}
