//  CaptureProjectCache.swift
//  CaptureKit
//
//  The offline project + room cache (spec §13.3). The door MUST work offline:
//  never an empty list, never a spinner, never a disabled control.

import Foundation

public struct CaptureProjectSnapshot: Identifiable, Hashable, Sendable {
    /// `projects.id` when the ref has one, else `CaptureProjectRef.id.uuidString` —
    /// the same fallback `S2CreateProjectScreen.swift:162` already writes into
    /// `routing.projectID` for a project created offline.
    public let id: String
    public let name: String
    /// FC-R5: the `project_rooms` lane. Never crossed with `rooms`.
    public let specRooms: [CaptureCachedRoom]
    /// FC-R5: the `public.rooms` lane. Never crossed with `specRooms`.
    public let rooms: [CaptureCachedRoom]
    /// The ONLY freshness signal. An empty room lane means nothing: `encodeRooms`
    /// stores nil for an empty array and `decodeRooms` reads a corrupt blob as
    /// empty, so "never refreshed" and "refreshed, found none" are the same bytes.
    public let lastRefreshedAt: Date?
    public let lastVisitedAt: Date?
    public let lastFiledCoordinate: CaptureCoordinate?
    public let filedCaptureCount: Int
    /// True when `id` is a LOCAL uuid because the project has not synced yet.
    /// Selectable, captionable, and not yet routable server-side.
    public let isAwaitingSync: Bool

    public init(id: String, name: String,
                specRooms: [CaptureCachedRoom], rooms: [CaptureCachedRoom],
                lastRefreshedAt: Date?, lastVisitedAt: Date?,
                lastFiledCoordinate: CaptureCoordinate?, filedCaptureCount: Int,
                isAwaitingSync: Bool = false) {
        self.id = id
        self.name = name
        self.specRooms = specRooms
        self.rooms = rooms
        self.lastRefreshedAt = lastRefreshedAt
        self.lastVisitedAt = lastVisitedAt
        self.lastFiledCoordinate = lastFiledCoordinate
        self.filedCaptureCount = filedCaptureCount
        self.isAwaitingSync = isAwaitingSync
    }

    /// True when the row has never been refreshed, or was refreshed before `now - staleAfter`.
    public func isStale(now: Date) -> Bool {
        guard let lastRefreshedAt else { return true }
        return now.timeIntervalSince(lastRefreshedAt) > CaptureProjectCachePolicy.staleAfter
    }
}

public enum CaptureProjectCachePolicy {
    public static let staleAfter: TimeInterval = 7 * 24 * 60 * 60
    public static let evictAfter: TimeInterval = 60 * 24 * 60 * 60
    public static let maxCachedProjects = 60

    /// Recent-first: most recently visited, then most recently refreshed, then name.
    public static func ordered(_ snapshots: [CaptureProjectSnapshot],
                               now: Date) -> [CaptureProjectSnapshot] {
        // Visited is its own key rather than coalescing to refreshed: a project
        // she has stood in outranks one a background refresh merely touched.
        snapshots.sorted { lhs, rhs in
            let visitedL = lhs.lastVisitedAt ?? .distantPast
            let visitedR = rhs.lastVisitedAt ?? .distantPast
            if visitedL != visitedR { return visitedL > visitedR }
            let refreshedL = lhs.lastRefreshedAt ?? .distantPast
            let refreshedR = rhs.lastRefreshedAt ?? .distantPast
            if refreshedL != refreshedR { return refreshedL > refreshedR }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    /// Which cached rows to delete. Never evicts a project visited inside `evictAfter`.
    public static func evictable(_ snapshots: [CaptureProjectSnapshot],
                                 now: Date) -> [String] {
        let expired = snapshots.filter { snapshot in
            let touched = snapshot.lastVisitedAt ?? snapshot.lastRefreshedAt ?? .distantPast
            return now.timeIntervalSince(touched) > evictAfter
        }
        let overflow = ordered(snapshots, now: now).dropFirst(maxCachedProjects)
        var ids = Set(expired.map(\.id))
        ids.formUnion(overflow.map(\.id))
        return ordered(snapshots, now: now).map(\.id).filter { ids.contains($0) }
    }

    /// §13's specified failure copy. Never "no projects", never a spinner.
    public static func offlineCaption(cachedCount: Int) -> String {
        switch cachedCount {
        case 0:  return "No projects on this phone yet. They arrive with signal."
        case 1:  return "1 project on this phone. Others need signal."
        default: return "\(cachedCount) projects on this phone. Others need signal."
        }
    }

    public static func filter(_ snapshots: [CaptureProjectSnapshot],
                              query: String) -> [CaptureProjectSnapshot] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return snapshots }
        return snapshots.filter { $0.name.localizedCaseInsensitiveContains(needle) }
    }
}
