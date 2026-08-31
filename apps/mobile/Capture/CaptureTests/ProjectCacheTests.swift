//  ProjectCacheTests.swift
//  CaptureTests
//
//  The offline project + room cache (Field Companion wave 3, package 3-1).

import Foundation
import SwiftData
import Testing
@testable import CaptureKit

@MainActor
struct ProjectCacheTests {

    @Test func roomListsRoundTripThroughTheCache() throws {
        let store = try CaptureStore.inMemory()
        // `CaptureOwnerIdentity.init?` is FAILABLE (Specimen.swift:21). Every
        // construction in this plan force-unwraps it, so the tests read the same
        // way everywhere and a nil owner surfaces as a test failure, not as a
        // silently unscoped fetch.
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let ref = CaptureProjectRef(remoteId: "p1", name: "Maple St", owner: owner)
        ref.specRooms = [CaptureCachedRoom(id: "sr1", name: "Living")]
        ref.rooms = [CaptureCachedRoom(id: "r1", name: "Living"),
                     CaptureCachedRoom(id: "r2", name: "Dining")]
        store.context.insert(ref)
        try store.save()

        #expect(ref.specRooms.map(\.id) == ["sr1"])
        #expect(ref.rooms.map(\.name) == ["Living", "Dining"])
    }

    @Test func filedCoordinateRoundTripsAndClears() throws {
        let store = try CaptureStore.inMemory()
        let ref = CaptureProjectRef(remoteId: "p1", name: "Maple St")
        ref.lastFiledCoordinate = CaptureCoordinate(latitude: 43.07, longitude: -89.4)
        store.context.insert(ref)
        try store.save()

        #expect(ref.lastFiledCoordinate == CaptureCoordinate(latitude: 43.07, longitude: -89.4))
        ref.lastFiledCoordinate = nil
        #expect(ref.lastFiledLatitude == nil)
        #expect(ref.lastFiledLongitude == nil)
    }

    @Test func coordinateDistanceIsMetres() {
        let a = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)
        let b = CaptureCoordinate(latitude: 43.0740, longitude: -89.4012)
        // 0.0009° of latitude ≈ 100 m.
        #expect(abs(a.distanceMeters(to: b) - 100) < 5)
    }

    @Test func anEmptyRoomListClearsItsBackingColumnAndStillReadsAsEmpty() {
        let ref = CaptureProjectRef(remoteId: "p1", name: "Maple St")
        ref.specRooms = [CaptureCachedRoom(id: "sr1", name: "Living")]
        ref.rooms = [CaptureCachedRoom(id: "r1", name: "Living")]
        #expect(ref.specRoomsData != nil)
        #expect(ref.roomsData != nil)

        ref.specRooms = []
        ref.rooms = []

        // Empty encodes to nil rather than to `[]`, so "never refreshed" and
        // "refreshed, found nothing" are indistinguishable from the columns
        // alone — lastRefreshedAt is the freshness signal, not the room lists.
        #expect(ref.specRoomsData == nil)
        #expect(ref.roomsData == nil)
        #expect(ref.specRooms == [])
        #expect(ref.rooms == [])
    }

    @Test func aNeverRefreshedRefReadsAsEmptyInBothLanes() {
        let ref = CaptureProjectRef(remoteId: "p1", name: "Maple St")

        #expect(ref.specRoomsData == nil)
        #expect(ref.roomsData == nil)
        #expect(ref.specRooms == [])
        #expect(ref.rooms == [])
        #expect(ref.lastRefreshedAt == nil)
    }

    @Test func anUnreadableRoomBlobDegradesToEmptyRatherThanTrapping() {
        let ref = CaptureProjectRef(remoteId: "p1", name: "Maple St")
        ref.specRoomsData = Data("not json".utf8)
        ref.roomsData = Data("not json".utf8)

        #expect(ref.specRooms == [])
        #expect(ref.rooms == [])
    }

    @Test func coordinateDistanceScalesLongitudeByLatitude() {
        let a = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)
        let b = CaptureCoordinate(latitude: 43.0731, longitude: -89.4003)
        // 0.0009° of longitude at 43.07°N ≈ 73 m: 100 m × cos(43.07°). Dropping
        // the cos(latitude) term reads ≈100 m here; transposing dLat/dLon reads
        // ≈100 m here and ≈73 m in the latitude case above. Both are caught.
        #expect(abs(a.distanceMeters(to: b) - 73) < 5)
    }

    @Test func coordinateDistanceToItselfIsExactlyZero() {
        let a = CaptureCoordinate(latitude: 43.0731, longitude: -89.4012)

        #expect(a.distanceMeters(to: a) == 0)
    }

    private func snapshot(_ id: String, name: String,
                          visited: Date? = nil, refreshed: Date? = nil,
                          filed: Int = 0,
                          awaitingSync: Bool = false) -> CaptureProjectSnapshot {
        CaptureProjectSnapshot(id: id, name: name, specRooms: [], rooms: [],
                               lastRefreshedAt: refreshed, lastVisitedAt: visited,
                               lastFiledCoordinate: nil, filedCaptureCount: filed,
                               isAwaitingSync: awaitingSync)
    }

    @Test func orderingIsMostRecentlyVisitedFirst() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let ordered = CaptureProjectCachePolicy.ordered([
            snapshot("a", name: "Alpha", refreshed: now),
            snapshot("b", name: "Bravo", visited: now.addingTimeInterval(-3600)),
            snapshot("c", name: "Charlie", visited: now.addingTimeInterval(-60))
        ], now: now)
        #expect(ordered.map(\.id) == ["c", "b", "a"])
    }

    @Test func offlineCaptionIsTheSpecifiedCopy() {
        #expect(CaptureProjectCachePolicy.offlineCaption(cachedCount: 12)
                == "12 projects on this phone. Others need signal.")
        #expect(CaptureProjectCachePolicy.offlineCaption(cachedCount: 1)
                == "1 project on this phone. Others need signal.")
        #expect(CaptureProjectCachePolicy.offlineCaption(cachedCount: 0)
                == "No projects on this phone yet. They arrive with signal.")
    }

    @Test func evictionSparesRecentlyVisitedProjects() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let old = now.addingTimeInterval(-CaptureProjectCachePolicy.evictAfter - 1)
        let evictable = CaptureProjectCachePolicy.evictable([
            snapshot("keep", name: "Keep", visited: now, refreshed: old),
            snapshot("drop", name: "Drop", visited: old, refreshed: old)
        ], now: now)
        #expect(evictable == ["drop"])
    }

    @Test func stalenessIsSevenDays() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let fresh = snapshot("a", name: "A", refreshed: now.addingTimeInterval(-3600))
        let stale = snapshot("b", name: "B",
                             refreshed: now.addingTimeInterval(-CaptureProjectCachePolicy.staleAfter - 1))
        #expect(!fresh.isStale(now: now))
        #expect(stale.isStale(now: now))
        #expect(snapshot("c", name: "C").isStale(now: now))
    }

    @Test func filterMatchesTrimmedCaseInsensitiveSubstrings() {
        let all = [snapshot("a", name: "Maple St residence"),
                   snapshot("b", name: "Harbor loft")]
        #expect(CaptureProjectCachePolicy.filter(all, query: "  maple ").map(\.id) == ["a"])
        #expect(CaptureProjectCachePolicy.filter(all, query: "").map(\.id) == ["a", "b"])
    }

    @Test func aNeverTouchedProjectIsNotEvictedByAge() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        // Reachable, not hypothetical: `CaptureProjectRef.init` sets neither stamp,
        // so a project made at the door with no signal has both nil.
        #expect(CaptureProjectCachePolicy.evictable([snapshot("new", name: "New")],
                                                    now: now) == [])

        // The cap still bounds them, so the cache does not grow without limit.
        let cap = CaptureProjectCachePolicy.maxCachedProjects
        let many = (0...cap).map { snapshot("p\($0)", name: String(format: "Project %02d", $0)) }
        #expect(CaptureProjectCachePolicy.evictable(many, now: now) == ["p\(cap)"])
    }

    @Test func aProjectAwaitingSyncIsNeverEvictable() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let old = now.addingTimeInterval(-CaptureProjectCachePolicy.evictAfter - 1)

        // Not by age.
        #expect(CaptureProjectCachePolicy.evictable(
            [snapshot("local", name: "Local", visited: old, refreshed: old, awaitingSync: true)],
            now: now) == [])

        // Nor by the cap: this phone holds the only copy of every one of them.
        let cap = CaptureProjectCachePolicy.maxCachedProjects
        let many = (0...cap).map {
            snapshot("l\($0)", name: "Local \($0)",
                     visited: now.addingTimeInterval(-Double($0)), awaitingSync: true)
        }
        #expect(CaptureProjectCachePolicy.evictable(many, now: now) == [])
    }

    @Test func aFreshRefreshOutweighsAStaleVisit() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let old = now.addingTimeInterval(-CaptureProjectCachePolicy.evictAfter - 1)
        let evictable = CaptureProjectCachePolicy.evictable([
            snapshot("keep", name: "Keep", visited: old, refreshed: now.addingTimeInterval(-3600)),
            snapshot("drop", name: "Drop", visited: old, refreshed: old)
        ], now: now)
        #expect(evictable == ["drop"])
    }

    @Test func theCapEvictsPastMaxCachedProjectsEvenWhenJustVisited() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let cap = CaptureProjectCachePolicy.maxCachedProjects
        let all = (0...cap).map {
            snapshot("p\($0)", name: "Project \($0)", visited: now.addingTimeInterval(-Double($0)))
        }
        // R19: the cap is authoritative. Least-recently-touched goes over the side.
        #expect(CaptureProjectCachePolicy.evictable(all, now: now) == ["p\(cap)"])
    }

    @Test func orderingFallsFromVisitedToRefreshedToNameToID() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let visited = now.addingTimeInterval(-60)
        let ordered = CaptureProjectCachePolicy.ordered([
            snapshot("d", name: "Same", visited: visited, refreshed: now),
            snapshot("c", name: "Same", visited: visited, refreshed: now),
            snapshot("b", name: "Alpha", visited: visited, refreshed: now),
            snapshot("a", name: "Zulu", visited: visited, refreshed: now.addingTimeInterval(-1))
        ], now: now)
        // All four tie on key 1. Key 2 (refreshed) sinks "a" despite its name; key 3
        // (name) lifts "Alpha"; key 4 (id) settles the two "Same" rows deterministically.
        #expect(ordered.map(\.id) == ["b", "c", "d", "a"])
    }

    // ── The cache itself (package 3-3) ──

    private final class StubProjectsService: ProjectsService, @unchecked Sendable {
        var list: [FieldProject] = []
        var detail: [String: FieldProjectDetail] = [:]
        var listShouldThrow = false
        struct Boom: Error {}

        func listProjects() async throws -> [FieldProject] {
            if listShouldThrow { throw Boom() }
            return list
        }
        func projectDetail(id: String) async throws -> FieldProjectDetail {
            guard let d = detail[id] else { throw Boom() }
            return d
        }
    }

    @Test func refreshStoresProjectsScopedToTheOwner() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let service = StubProjectsService()
        service.list = [FieldProject(id: "p1", name: "Maple St", status: "active")]
        let cache = CaptureProjectCache(store: store, projects: service)

        #expect(await cache.refreshList(owner: owner))
        let mine = cache.snapshots(owner: owner)
        #expect(mine.map(\.id) == ["p1"])

        let other = CaptureOwnerIdentity(userID: "u2", workspaceID: "w2")!
        #expect(cache.snapshots(owner: other).isEmpty)
    }

    @Test func refreshFailureKeepsTheCacheAndReportsFalse() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let service = StubProjectsService()
        service.list = [FieldProject(id: "p1", name: "Maple St", status: "active")]
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner)

        service.listShouldThrow = true
        #expect(await cache.refreshList(owner: owner) == false)
        #expect(cache.snapshots(owner: owner).map(\.name) == ["Maple St"])
    }

    @Test func detailRefreshStoresBothRoomLanesSeparately() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let service = StubProjectsService()
        let project = FieldProject(id: "p1", name: "Maple St", status: "active")
        service.list = [project]
        service.detail["p1"] = FieldProjectDetail(
            project: project,
            specRooms: [FieldProjectRoom(id: "sr1", name: "Living")],
            rooms: [FieldProjectRoom(id: "r1", name: "Living"),
                    FieldProjectRoom(id: "r2", name: "Dining")])
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner)
        #expect(await cache.refreshDetail(projectID: "p1", owner: owner))

        let snap = try #require(cache.snapshots(owner: owner).first)
        #expect(snap.specRooms.map(\.id) == ["sr1"])
        #expect(snap.rooms.map(\.id) == ["r1", "r2"])
    }

    @Test func theTwoRoomLanesSurviveASameShapedRefreshWithoutCrossing() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let service = StubProjectsService()
        let project = FieldProject(id: "p1", name: "Maple St", status: "active")
        service.list = [project]
        // Same count, same names, DIFFERENT ids. FC-R5's two lanes are both
        // `[FieldProjectRoom]`, so a transposed assignment compiles clean; a
        // fixture where the lanes merely differ in length would let a swap hide.
        service.detail["p1"] = FieldProjectDetail(
            project: project,
            specRooms: [FieldProjectRoom(id: "project-room-1", name: "Living"),
                        FieldProjectRoom(id: "project-room-2", name: "Kitchen")],
            rooms: [FieldProjectRoom(id: "room-1", name: "Living"),
                    FieldProjectRoom(id: "room-2", name: "Kitchen")])
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner)
        #expect(await cache.refreshDetail(projectID: "p1", owner: owner))

        let snap = try #require(cache.snapshots(owner: owner).first)
        #expect(snap.specRooms.map(\.id) == ["project-room-1", "project-room-2"])
        #expect(snap.rooms.map(\.id) == ["room-1", "room-2"])
        // The names are identical on both lanes, which is exactly why the merge
        // is by trimmed name and the identity is never borrowed across it.
        #expect(snap.specRooms.map(\.name) == snap.rooms.map(\.name))
    }

    @Test func filingLearnsARunningCentroid() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let service = StubProjectsService()
        service.list = [FieldProject(id: "p1", name: "Maple St", status: "active")]
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner)

        cache.recordFiling(projectID: "p1",
                           at: CaptureCoordinate(latitude: 43.00, longitude: -89.00),
                           owner: owner)
        cache.recordFiling(projectID: "p1",
                           at: CaptureCoordinate(latitude: 43.02, longitude: -89.02),
                           owner: owner)

        let snap = try #require(cache.snapshots(owner: owner).first)
        #expect(snap.filedCaptureCount == 2)
        let centroid = try #require(snap.lastFiledCoordinate)
        #expect(abs(centroid.latitude - 43.01) < 0.0001)
        #expect(abs(centroid.longitude - (-89.01)) < 0.0001)
    }

    @Test func aProjectCreatedOfflineIsStillOnTheDoor() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        // A PROSPECTIVE row: a name, an owner, and NO remoteId. Nothing writes
        // one today — S2's real-mode catch sets an error and persists nothing —
        // so this fixture stands for the shape the cache is built to carry once
        // something does, not for a shipped code path.
        let local = CaptureProjectRef(remoteId: nil, name: "Kippley residence", owner: owner)
        store.context.insert(local)
        try store.save()

        let service = StubProjectsService()
        service.listShouldThrow = true
        let cache = CaptureProjectCache(store: store, projects: service)

        let snaps = cache.snapshots(owner: owner)
        let mine = try #require(snaps.first { $0.name == "Kippley residence" })
        #expect(mine.id == local.id.uuidString)
        #expect(mine.isAwaitingSync)
    }

    @Test func evictionNeverDeletesARowTheCacheDidNotCreate() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let ancient = now.addingTimeInterval(-CaptureProjectCachePolicy.evictAfter - 1)

        // (a) S2's row: created locally, never refreshed by the cache.
        let s2Row = CaptureProjectRef(remoteId: "p-local", name: "Kippley", owner: owner)
        s2Row.lastVisitedAt = ancient
        // (b) A cache row that IS old enough to evict, but a capture points at it.
        let referenced = CaptureProjectRef(remoteId: "p-referenced", name: "Harbor", owner: owner)
        referenced.lastRefreshedAt = ancient
        // (c) A cache row nothing references — the only legitimate eviction.
        let orphan = CaptureProjectRef(remoteId: "p-orphan", name: "Old job", owner: owner)
        orphan.lastRefreshedAt = ancient
        for ref in [s2Row, referenced, orphan] { store.context.insert(ref) }

        let capture = store.newDraft(owner: owner)
        capture.venue = VenueStamp(projectId: "p-referenced", projectName: "Harbor")
        try store.save()

        let service = StubProjectsService()
        service.list = [FieldProject(id: "p1", name: "Maple St", status: "active")]
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner, now: now)

        let survivors = Set(cache.snapshots(owner: owner, now: now).map(\.id))
        #expect(survivors.contains("p-local"))       // S2 owns it; the cache must not
        #expect(survivors.contains("p-referenced"))  // a capture names it
        #expect(!survivors.contains("p-orphan"))     // this one, and only this one
    }

    @Test func evictionSparesAProjectWhoseOnlyReferentIsAnUnplacedCapture() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let ancient = now.addingTimeInterval(-CaptureProjectCachePolicy.evictAfter - 1)

        let candidate = CaptureProjectRef(remoteId: "p-unplaced", name: "Kippley", owner: owner)
        candidate.lastRefreshedAt = ancient
        // Nothing has been filed yet — which is the whole point. A guard built on
        // filedCaptureCount reads this project as unreferenced and deletes the row
        // the one capture still waiting on Today depends on.
        candidate.filedCaptureCount = 0
        store.context.insert(candidate)

        let capture = store.newDraft(owner: owner)
        capture.venue = VenueStamp(projectId: "p-unplaced", projectName: "Kippley")
        #expect(capture.placementProjectId == nil)
        try store.save()

        let service = StubProjectsService()
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner, now: now)

        #expect(cache.snapshots(owner: owner, now: now).map(\.id) == ["p-unplaced"])
    }

    @Test func evictionSparesAProjectACaptureIsPlacedInto() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let ancient = now.addingTimeInterval(-CaptureProjectCachePolicy.evictAfter - 1)

        // Placement is the SECOND way a capture names a project, and it carries no
        // venue stamp of its own — a guard that reads only `venue` misses it.
        let placed = CaptureProjectRef(remoteId: "p-placed", name: "Harbor", owner: owner)
        placed.lastRefreshedAt = ancient
        let orphan = CaptureProjectRef(remoteId: "p-orphan", name: "Old job", owner: owner)
        orphan.lastRefreshedAt = ancient
        for ref in [placed, orphan] { store.context.insert(ref) }

        let capture = store.newDraft(owner: owner)
        capture.placementProjectId = "p-placed"
        #expect(capture.venue == nil)
        try store.save()

        let service = StubProjectsService()
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner, now: now)

        #expect(cache.snapshots(owner: owner, now: now).map(\.id) == ["p-placed"])
    }

    @Test func evictionSparesAProjectAPendingScanUploadNames() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let ancient = now.addingTimeInterval(-CaptureProjectCachePolicy.evictAfter - 1)

        // R25's third referent. There is NO Specimen anywhere in this store, so
        // this can only pass through the ScanUploadRecord lane — drop that lane
        // and the scan's project goes over the side while its upload is still
        // queued.
        let scanned = CaptureProjectRef(remoteId: "p-scanned", name: "Harbor", owner: owner)
        scanned.lastRefreshedAt = ancient
        let orphan = CaptureProjectRef(remoteId: "p-orphan", name: "Old job", owner: owner)
        orphan.lastRefreshedAt = ancient
        for ref in [scanned, orphan] { store.context.insert(ref) }

        store.context.insert(ScanUploadRecord(
            bundlePath: "SiteScans/site-scan-1", scanID: "s1", roomID: "r1",
            name: "Living", projectID: "p-scanned", projectRoomID: nil, owner: owner))
        #expect((try store.context.fetch(FetchDescriptor<Specimen>())).isEmpty)
        try store.save()

        let service = StubProjectsService()
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner, now: now)

        #expect(cache.snapshots(owner: owner, now: now).map(\.id) == ["p-scanned"])
    }

    @Test func recordVisitLiftsAProjectToTheTopOfTheDoor() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let service = StubProjectsService()
        service.list = [FieldProject(id: "p1", name: "Alpha", status: "active"),
                        FieldProject(id: "p2", name: "Zulu", status: "active")]
        let cache = CaptureProjectCache(store: store, projects: service)
        _ = await cache.refreshList(owner: owner, now: now)
        #expect(cache.snapshots(owner: owner, now: now).map(\.id) == ["p1", "p2"])

        cache.recordVisit(projectID: "p2", owner: owner, now: now)

        #expect(cache.snapshots(owner: owner, now: now).map(\.id) == ["p2", "p1"])
    }

    @Test func filingAndVisitingAProjectCreatedOfflineUseItsLocalID() async throws {
        let store = try CaptureStore.inMemory()
        let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        // The same prospective shape as above, and likewise not written by any
        // shipped path yet: with no remoteId, every id the cache hands out for it
        // is the local uuid.
        let local = CaptureProjectRef(remoteId: nil, name: "Kippley residence", owner: owner)
        store.context.insert(local)
        try store.save()

        let service = StubProjectsService()
        service.listShouldThrow = true
        let cache = CaptureProjectCache(store: store, projects: service)

        cache.recordVisit(projectID: local.id.uuidString, owner: owner, now: now)
        cache.recordFiling(projectID: local.id.uuidString,
                           at: CaptureCoordinate(latitude: 43.07, longitude: -89.4),
                           owner: owner, now: now)

        let snap = try #require(cache.snapshots(owner: owner, now: now).first)
        #expect(snap.filedCaptureCount == 1)
        #expect(snap.lastVisitedAt == now)
        #expect(snap.lastFiledCoordinate == CaptureCoordinate(latitude: 43.07, longitude: -89.4))
        // Still awaiting sync: filing against it does not invent a `projects.id`.
        #expect(snap.isAwaitingSync)
    }
}
