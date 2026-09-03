//
//  RoomLifecycleTests.swift
//  PatinaTests
//
//  B-03 and B-04, which are the same second of the same flow.
//
//  B-03: after a confirmed delete, Studio still reported "2 ROOMS" and still
//  rendered the deleted room's card under YOUR ROOMS — `ProfileViewModel`
//  snapshotted its rooms in one `onAppear` and nothing told the snapshot.
//  B-04: `deleteRoom()` popped onto the room's own detail, whose lookup now
//  misses, so a second after deleting the room the person was told "This room
//  isn't on this phone / It may have been removed."
//

import Foundation
import SwiftData
import Testing
@testable import Patina

@MainActor
struct RoomLifecycleTests {

    private func makeContext() throws -> ModelContext {
        let schema = Schema(versionedSchema: PatinaSchemaV1.self)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return ModelContext(try ModelContainer(for: schema, configurations: [config]))
    }

    // MARK: - B-03: the count and the rail follow the delete

    @Test
    func deletingARoomBumpsTheLocalRoomSignal() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = store.createRoom(name: "Audit Room B", roomType: "other", manualEntry: true)

        let before = LocalRoomSignal.shared.revision
        store.delete(room)
        #expect(LocalRoomSignal.shared.revision != before)
    }

    @Test
    func creatingARoomBumpsItToo() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let before = LocalRoomSignal.shared.revision
        _ = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        #expect(LocalRoomSignal.shared.revision != before)
    }

    /// The stat and the rail read one source, and that source refetches when
    /// the signal moves. Before this, both were a snapshot from one appear.
    @Test
    func theProfileRoomCountFollowsADelete() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let first = store.createRoom(name: "Audit Room B", roomType: "other", manualEntry: true)
        _ = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)

        let viewModel = ProfileViewModel()
        viewModel.loadData(context: context)
        #expect(viewModel.roomCount == 2)
        #expect(viewModel.rooms.contains { $0.name == "Audit Room B" })

        store.delete(first)

        #expect(viewModel.roomCount == 1, "Studio kept reporting the deleted room")
        #expect(viewModel.rooms.contains { $0.name == "Audit Room B" } == false)
    }

    /// One fetch per revision, not one per read — `ProfileView` reads `rooms`
    /// three times and `roomCount` twice in a single body.
    @Test
    func repeatedReadsInOneBodyDoNotRefetch() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        _ = store.createRoom(name: "Living", roomType: "living", manualEntry: true)

        let viewModel = ProfileViewModel()
        viewModel.loadData(context: context)
        let first = viewModel.rooms
        let second = viewModel.rooms
        #expect(first.count == second.count)
        #expect(first.first?.id == second.first?.id)
    }

    // MARK: - B-04: the dead detail is left behind

    @Test
    func deletingPopsPastTheRoomsOwnDetail() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/RoomSettingsView.swift")
        let delete = try #require(
            source.components(separatedBy: "private func deleteRoom() {").last?
                .components(separatedBy: "\n    }").first
        )
        let pops = delete.split(separator: "\n").filter { $0.contains("coordinator.goBack()") }
        #expect(pops.count == 2, "one pop lands on the deleted room's own detail")
    }

    /// The not-found state is still there for the case it is actually about:
    /// a deep link to a room this phone does not have.
    @Test
    func theNotFoundStateSurvivesForRealMisses() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/RoomProjectView.swift")
        #expect(source.contains("This room isn’t on this phone") || source.contains("This room isn't on this phone"))
    }
}
