//  VisitDoorTests.swift
//  CaptureTests
//
//  V0 — the door (spec §7.3). Three taps and ≤8 s, IN AIRPLANE MODE.

import Foundation
import Testing
@testable import CaptureKit

@MainActor
struct VisitDoorTests {

    private let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!

    private final class StubProjects: ProjectsService, @unchecked Sendable {
        var list: [FieldProject] = []
        var detail: [String: FieldProjectDetail] = [:]
        var offline = false
        struct Offline: Error {}
        func listProjects() async throws -> [FieldProject] {
            if offline { throw Offline() }
            return list
        }
        func projectDetail(id: String) async throws -> FieldProjectDetail {
            if offline { throw Offline() }
            guard let d = detail[id] else { throw Offline() }
            return d
        }
    }

    private func makeCache(_ service: StubProjects) throws -> CaptureProjectCache {
        let store = try CaptureStore.inMemory()
        return CaptureProjectCache(store: store, projects: service)
    }

    private func seededService() -> StubProjects {
        let service = StubProjects()
        let maple = FieldProject(id: "p1", name: "Maple St residence", status: "active")
        let harbor = FieldProject(id: "p2", name: "Harbor loft", status: "active")
        service.list = [maple, harbor]
        service.detail["p1"] = FieldProjectDetail(
            project: maple,
            specRooms: [FieldProjectRoom(id: "sr1", name: "Living"),
                        FieldProjectRoom(id: "sr2", name: "Dining")],
            rooms: [FieldProjectRoom(id: "r1", name: "Living")])
        return service
    }

    @Test func theDoorOpensOnSiteVisitAndListsCachedProjects() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()

        #expect(model.kind == .site)
        #expect(model.projects.map(\.id).sorted() == ["p1", "p2"])
        #expect(model.offlineCaption == nil)
        #expect(!model.canStart)                    // no project chosen yet
    }

    @Test func offlineRendersTheCacheWithAnHonestLineNotAnEmptyList() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()

        #expect(model.isOffline)
        #expect(model.projects.count == 2)          // never an empty list
        #expect(model.offlineCaption == "2 projects on this phone. Others need signal.")
    }

    @Test func choosingAProjectMergesBothRoomLanesAndOffersWholeHouseFirst() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        await model.select(projectID: "p1")

        #expect(model.roomOptions.first?.isWholeHouse == true)
        let living = try #require(model.roomOptions.first { $0.name == "Living" })
        #expect(living.projectRoomID == "sr1")
        #expect(living.scanRoomID == "r1")
        let dining = try #require(model.roomOptions.first { $0.name == "Dining" })
        #expect(dining.projectRoomID == "sr2")
        #expect(dining.scanRoomID == nil)           // never cross-assigned
        #expect(model.canStart)                     // Whole house is a valid answer
    }

    @Test func theDraftStampsOnlyTheLegalLanePerRoom() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        await model.select(projectID: "p1")
        model.selectedRoom = model.roomOptions.first { $0.name == "Dining" }
        model.kit = .tradeWalk

        let draft = try #require(model.draft())
        #expect(draft.kind == .site)
        #expect(draft.kit == .tradeWalk)
        #expect(draft.projectID == "p1")
        #expect(draft.label == "Maple St residence")
        #expect(draft.projectRoomID == "sr2")
        #expect(draft.scanRoomID == nil)
        #expect(draft.room == "Dining")
        #expect(draft.defaultNoteSetting == .solo)
    }

    @Test func wholeHouseStampsNeitherRoomLane() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        await model.select(projectID: "p1")
        model.selectedRoom = .wholeHouse

        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == nil)
        #expect(draft.scanRoomID == nil)
        #expect(draft.room == nil)
    }

    @Test func theQueryFiltersTheCachedList() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        model.query = "harbor"
        #expect(model.projects.map(\.id) == ["p2"])
    }
}
