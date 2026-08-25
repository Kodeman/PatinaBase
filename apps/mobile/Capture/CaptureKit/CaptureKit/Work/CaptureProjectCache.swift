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
    /// True when `id` is a LOCAL uuid, not a `projects.id`. Selectable, captionable,
    /// and not yet routable server-side — and never evictable, because this phone
    /// holds the only copy.
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
            let byName = lhs.name.localizedCaseInsensitiveCompare(rhs.name)
            if byName != .orderedSame { return byName == .orderedAscending }
            // `sorted` is not stable and `evictable`'s cut is positional, so without
            // a total order the tie decides which row gets DELETED.
            return lhs.id < rhs.id
        }
    }

    /// Which cached rows to delete — **candidates**, not a verdict: Task 3 subtracts
    /// anything a `Specimen` or an S1/S2 flow still owns (R18) before it deletes.
    /// Never evicts a project touched inside `evictAfter`, one never touched at all,
    /// or one awaiting sync. Rows past `maxCachedProjects` ARE evicted even when just
    /// visited (R19) — an unbounded cache on a phone is the worse failure.
    public static func evictable(_ snapshots: [CaptureProjectSnapshot],
                                 now: Date) -> [String] {
        let ranked = ordered(snapshots, now: now)
        // A row awaiting sync lives only on this phone; no refresh can bring it back.
        let candidates = ranked.filter { !$0.isAwaitingSync }
        let expired = candidates.filter { snapshot in
            // Never touched is not "touched in year 1". `CaptureProjectRef.init`
            // leaves both stamps nil, so a project she makes at the door with no
            // signal would otherwise be evictable on the very first sweep.
            guard let touched = lastTouched(snapshot) else { return false }
            return now.timeIntervalSince(touched) > evictAfter
        }
        let overflow = candidates.dropFirst(maxCachedProjects)
        var ids = Set(expired.map(\.id))
        ids.formUnion(overflow.map(\.id))
        return ranked.map(\.id).filter { ids.contains($0) }
    }

    /// The later of the two stamps; nil only when neither was ever set. A refresh
    /// counts even when a visit also happened, so a project she last stood in two
    /// months ago but that refreshed yesterday does not read as abandoned.
    private static func lastTouched(_ snapshot: CaptureProjectSnapshot) -> Date? {
        switch (snapshot.lastVisitedAt, snapshot.lastRefreshedAt) {
        case let (visited?, refreshed?): return max(visited, refreshed)
        case let (visited?, nil):        return visited
        case let (nil, refreshed?):      return refreshed
        case (nil, nil):                 return nil
        }
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
