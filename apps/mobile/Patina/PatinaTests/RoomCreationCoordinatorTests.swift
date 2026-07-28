//
//  RoomCreationCoordinatorTests.swift
//  PatinaTests
//
//  U40: one "This Looks Right" on the non-LiDAR floor plan produced TWO
//  rooms. `createManualRoom` inserts the local `RoomModel` and then writes
//  through to PostgREST; when that write threw — guest session, offline —
//  both call sites "recovered" by inserting a second room. These pin the
//  contract that makes that impossible: exactly one insert per call, and a
//  failed write-through comes back as a local-only Result, never an error.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

// Serialized: the selection assertions read `RoomSelectionStore.shared`, and
// `createManualRoom` suspends around its remote call — parallel cases would
// overwrite each other's selection between the write and the read.
@MainActor
@Suite(.serialized)
struct RoomCreationCoordinatorTests {

    private struct RemoteUnavailable: Error {}

    /// Fails the way a signed-out or offline device does: `resolveUserId`
    /// throws before any row is written.
    private final class UnauthenticatedRemote: RoomCreationRemote, @unchecked Sendable {
        func resolveUserId() async throws -> String { throw RemoteUnavailable() }
        func createRoom(_ payload: CreateRoomPayload) async throws -> RemoteRoom {
            throw RemoteUnavailable()
        }
    }

    private final class StubRemote: RoomCreationRemote, @unchecked Sendable {
        let remoteId: String
        init(remoteId: String) { self.remoteId = remoteId }

        func resolveUserId() async throws -> String { "user-1" }
        func createRoom(_ payload: CreateRoomPayload) async throws -> RemoteRoom {
            RemoteRoom(
                id: remoteId,
                user_id: payload.user_id,
                name: payload.name,
                type: payload.type,
                length_meters: payload.length_meters,
                width_meters: payload.width_meters,
                height_meters: payload.height_meters,
                floor_area_sqm: payload.floor_area_sqm,
                volume_cbm: payload.volume_cbm,
                saved_item_count: 0,
                scan_count: 0,
                style_signals: nil,
                created_at: "",
                updated_at: ""
            )
        }
    }

    /// The context must be one this store owns, not `container.mainContext`:
    /// a container's own main context holds a *weak* back-reference to it, so
    /// handing that context out and letting the container deallocate traps
    /// inside SwiftData on the next `insert`. `ModelContext(container)` keeps
    /// the container alive for as long as the store needs it.
    private func makeStore() throws -> RoomStore {
        let schema = Schema([RoomModel.self, SavedItem.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        return RoomStore(context: ModelContext(container))
    }

    private func createLivingRoom(
        with coordinator: RoomCreationCoordinator
    ) async -> RoomCreationCoordinator.Result {
        await coordinator.createManualRoom(
            name: "Living Room",
            roomType: "living",
            widthFeet: 14,
            lengthFeet: 18,
            ceilingHeightFeet: nil,
            orientationRaw: "",
            windowCount: 2,
            doorCount: 1
        )
    }

    @Test
    func remoteFailureLeavesExactlyOneRoom() async throws {
        let store = try makeStore()
        let coordinator = RoomCreationCoordinator(store: store, api: UnauthenticatedRemote())

        let result = await createLivingRoom(with: coordinator)

        let rooms = store.allRooms()
        #expect(rooms.count == 1)
        #expect(rooms.first?.id == result.room.id)
        #expect(rooms.first?.name == "Living Room")
    }

    @Test
    func remoteFailureReportsLocalOnlyInsteadOfThrowing() async throws {
        let store = try makeStore()
        let coordinator = RoomCreationCoordinator(store: store, api: UnauthenticatedRemote())

        let result = await createLivingRoom(with: coordinator)

        #expect(result.isLocalOnly)
        #expect(result.remoteRoomId == nil)
        #expect(result.room.remoteId == nil)
    }

    @Test
    func remoteFailureStillSelectsTheNewRoom() async throws {
        let store = try makeStore()
        let coordinator = RoomCreationCoordinator(store: store, api: UnauthenticatedRemote())

        let result = await createLivingRoom(with: coordinator)

        #expect(RoomSelectionStore.shared.selectedLocalId == result.room.id)
        #expect(RoomSelectionStore.shared.selectedRemoteId == nil)
    }

    @Test
    func remoteSuccessStampsTheRemoteIdOnTheSameRoom() async throws {
        let store = try makeStore()
        let coordinator = RoomCreationCoordinator(
            store: store,
            api: StubRemote(remoteId: "remote-room-1")
        )

        let result = await createLivingRoom(with: coordinator)

        let rooms = store.allRooms()
        #expect(rooms.count == 1)
        #expect(result.isLocalOnly == false)
        #expect(result.remoteRoomId == "remote-room-1")
        #expect(rooms.first?.remoteId == "remote-room-1")
        #expect(RoomSelectionStore.shared.selectedRemoteId == "remote-room-1")
    }

    @Test
    func eachCallInsertsItsOwnRoomAndOnlyItsOwn() async throws {
        let store = try makeStore()
        let coordinator = RoomCreationCoordinator(store: store, api: UnauthenticatedRemote())

        let first = await createLivingRoom(with: coordinator)
        let second = await createLivingRoom(with: coordinator)

        #expect(store.allRooms().count == 2)
        #expect(first.room.id != second.room.id)
    }
}
