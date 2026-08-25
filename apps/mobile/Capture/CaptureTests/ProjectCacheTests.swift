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
                          filed: Int = 0) -> CaptureProjectSnapshot {
        CaptureProjectSnapshot(id: id, name: name, specRooms: [], rooms: [],
                               lastRefreshedAt: refreshed, lastVisitedAt: visited,
                               lastFiledCoordinate: nil, filedCaptureCount: filed)
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
}
