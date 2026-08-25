//  CaptureProjectCache.swift
//  CaptureKit
//
//  The offline project + room cache (spec §13.3). The door MUST work offline:
//  never an empty list, never a spinner, never a disabled control.

import Foundation
import SwiftData

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

/// The cache itself: an owner-scoped read that never blocks, a best-effort
/// refresh that never throws, and the filed-coordinate learning (§2.2) that
/// later teaches the suggestion tray where a project physically is.
@MainActor
public final class CaptureProjectCache {
    private let store: CaptureStore
    private let projects: any ProjectsService

    public init(store: CaptureStore, projects: any ProjectsService) {
        self.store = store
        self.projects = projects
    }

    /// Cached projects for this owner, recent-first. NEVER throws, NEVER blocks on
    /// network, and NEVER hides a project she created offline.
    public func snapshots(owner: CaptureOwnerIdentity,
                          now: Date = Date()) -> [CaptureProjectSnapshot] {
        CaptureProjectCachePolicy.ordered(refs(owner: owner).map(Self.snapshot), now: now)
    }

    /// Best-effort refresh of the list. Returns false when the network refused;
    /// the caller keeps rendering the cache and shows `offlineCaption`.
    @discardableResult
    public func refreshList(owner: CaptureOwnerIdentity, now: Date = Date()) async -> Bool {
        let remote: [FieldProject]
        do {
            remote = try await projects.listProjects()
        } catch {
            return false
        }
        for project in remote {
            let ref = upsert(remoteID: project.id, name: project.name, owner: owner)
            ref.name = project.name
            ref.lastRefreshedAt = now
        }
        evict(owner: owner, now: now)
        try? store.save()
        return true
    }

    /// Best-effort refresh of one project's two room lanes (FC-R5).
    @discardableResult
    public func refreshDetail(projectID: String, owner: CaptureOwnerIdentity,
                              now: Date = Date()) async -> Bool {
        let detail: FieldProjectDetail
        do {
            detail = try await projects.projectDetail(id: projectID)
        } catch {
            return false
        }
        let ref = upsert(remoteID: projectID, name: detail.project.name, owner: owner)
        // FC-R5: the two lanes are stored SEPARATELY and never cross-assigned.
        // `FieldProjectDetail` carries both as `[FieldProjectRoom]`, so a
        // transposed assignment here compiles and type-checks clean; only the
        // ids tell them apart.
        ref.specRooms = detail.specRooms.map { CaptureCachedRoom(id: $0.id, name: $0.name) }
        ref.rooms = detail.rooms.map { CaptureCachedRoom(id: $0.id, name: $0.name) }
        ref.lastRefreshedAt = now
        try? store.save()
        return true
    }

    /// Called when a capture is FILED to a project — feeds the learned centroid.
    public func recordFiling(projectID: String, at coordinate: CaptureCoordinate?,
                             owner: CaptureOwnerIdentity, now: Date = Date()) {
        guard let ref = ref(snapshotID: projectID, owner: owner) else { return }
        let previousCount = Double(ref.filedCaptureCount ?? 0)
        ref.filedCaptureCount = (ref.filedCaptureCount ?? 0) + 1
        if let coordinate {
            if let existing = ref.lastFiledCoordinate, previousCount > 0 {
                let total = previousCount + 1
                ref.lastFiledCoordinate = CaptureCoordinate(
                    latitude: (existing.latitude * previousCount + coordinate.latitude) / total,
                    longitude: (existing.longitude * previousCount + coordinate.longitude) / total)
            } else {
                ref.lastFiledCoordinate = coordinate
            }
        }
        try? store.save()
    }

    /// Called when a visit opens on a project.
    public func recordVisit(projectID: String, owner: CaptureOwnerIdentity, now: Date = Date()) {
        guard let ref = ref(snapshotID: projectID, owner: owner) else { return }
        ref.lastVisitedAt = now
        try? store.save()
    }

    // ── plumbing ──

    private func refs(owner: CaptureOwnerIdentity) -> [CaptureProjectRef] {
        let all = (try? store.context.fetch(FetchDescriptor<CaptureProjectRef>())) ?? []
        // NO remoteId filter: a project created offline (S2, with the create call
        // refused) has none until it syncs, and the door must still list it.
        return all.filter { $0.belongs(to: owner) }
    }

    private func ref(snapshotID: String, owner: CaptureOwnerIdentity) -> CaptureProjectRef? {
        refs(owner: owner).first { Self.snapshotID($0) == snapshotID }
    }

    private func upsert(remoteID: String, name: String,
                        owner: CaptureOwnerIdentity) -> CaptureProjectRef {
        if let existing = refs(owner: owner).first(where: { $0.remoteId == remoteID }) {
            return existing
        }
        let ref = CaptureProjectRef(remoteId: remoteID, name: name, owner: owner)
        store.context.insert(ref)
        return ref
    }

    /// Deletes ONLY rows this cache created and nothing else still points at (R18).
    /// `CaptureProjectRef` is also S2's inline-created-project record and the list
    /// S1's venue picker reads (`S2CreateProjectScreen.swift:148`,
    /// `S1AssignVenueScreen.swift:248-265`), so a blanket delete-by-age would take
    /// the designer's own project list with it.
    private func evict(owner: CaptureOwnerIdentity, now: Date) {
        // (1) Only rows the cache itself wrote are candidates at all.
        let candidates = refs(owner: owner).filter { $0.lastRefreshedAt != nil }
        guard !candidates.isEmpty else { return }
        // `evictable` returns CANDIDATES, not a verdict: a pure value type cannot
        // reach the store, so the ownership subtraction has to happen here.
        let doomed = Set(CaptureProjectCachePolicy.evictable(
            candidates.map(Self.snapshot), now: now))
        guard !doomed.isEmpty else { return }
        // (2) And never one a live record still names.
        let referenced = referencedProjectIDs()
        for ref in candidates {
            let id = Self.snapshotID(ref)
            guard doomed.contains(id), !referenced.contains(id) else { continue }
            store.context.delete(ref)
        }
    }

    /// Every project id a live local record still names: the venue a capture was
    /// stamped with, the project it is placed into, and the project a site scan is
    /// uploading against. All three are plain `String` columns rather than
    /// SwiftData relationships, so nothing protects them for us — and
    /// `filedCaptureCount` cannot stand in for this: it counts captures already
    /// placed and committed, so a capture still sitting unplaced on Today would
    /// leave its project reading as unreferenced. Deliberately not owner-scoped:
    /// sparing one row too many costs a little disk, deleting one costs her work.
    private func referencedProjectIDs() -> Set<String> {
        var ids: Set<String> = []
        func remember(_ id: String?) {
            guard let id, !id.isEmpty else { return }
            ids.insert(id)
        }
        for specimen in (try? store.context.fetch(FetchDescriptor<Specimen>())) ?? [] {
            remember(specimen.venue?.projectId)
            remember(specimen.placementProjectId)
        }
        for scan in (try? store.context.fetch(FetchDescriptor<ScanUploadRecord>())) ?? [] {
            remember(scan.projectID)
        }
        return ids
    }

    /// `projects.id` when there is one, else the LOCAL uuid — the same fallback
    /// `S2CreateProjectScreen.swift:162` already uses for `routing.projectID`.
    private static func snapshotID(_ ref: CaptureProjectRef) -> String {
        if let remoteID = ref.remoteId, !remoteID.isEmpty { return remoteID }
        return ref.id.uuidString
    }

    private static func snapshot(_ ref: CaptureProjectRef) -> CaptureProjectSnapshot {
        CaptureProjectSnapshot(
            id: snapshotID(ref),
            name: ref.name,
            specRooms: ref.specRooms,
            rooms: ref.rooms,
            lastRefreshedAt: ref.lastRefreshedAt,
            lastVisitedAt: ref.lastVisitedAt,
            lastFiledCoordinate: ref.lastFiledCoordinate,
            filedCaptureCount: ref.filedCaptureCount ?? 0,
            isAwaitingSync: (ref.remoteId ?? "").isEmpty)
    }
}
