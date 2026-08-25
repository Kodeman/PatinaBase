//  ProjectCacheTests.swift
//  CaptureTests
//
//  The offline project + room cache (Field Companion wave 3, package 3-1).

import Foundation
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
}
