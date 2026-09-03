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

    /// Studio's three derived reads all answer once the context arrives.
    ///
    /// They return their empty value while `context` is nil — the first body
    /// pass, before `onAppear` — and nothing they read changes when it lands,
    /// so the body never ran again and the screen kept the empty answer.
    /// Observed on the clone as "Style Explorer" over a store holding
    /// `["Warm Modern","new_space"]`; `loadData` now makes an observable write
    /// so the pass happens.
    ///
    /// `async` with yields on purpose: a `@MainActor` test with no suspension
    /// point holds the main actor for its whole body, and the tier's other
    /// main-actor pollers — `OrderHandoffTests.waitFor` runs on a 3 s budget —
    /// starve behind it. One container, three phases, a yield between each.
    @Test
    func theDerivedReadsAnswerOnceTheContextArrives() async throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        _ = store.createRoom(name: "Living", roomType: "living", manualEntry: true)
        StylePreferenceStore(context: context).upsert(
            StylePreferenceSnapshot(
                keywords: ["Warm Modern", "new_space"],
                warmth: 0.75, formality: 0.5,
                materials: ["weathered_oak"], eras: [],
                confidence: 0.45, budgetRange: "500-2000"
            )
        )
        context.insert(TableItemModel(name: "Oak Bench", productId: "p1", savedAt: Date()))
        try context.save()
        await Task.yield()

        let viewModel = ProfileViewModel()
        viewModel.accountRowsAreVisible = { true }

        // Before the context: every read is empty, and nothing is cached.
        #expect(viewModel.styleProfile == nil)
        #expect(viewModel.savedItemCount == 0)
        #expect(viewModel.rooms.isEmpty)

        let before = viewModel.contextRevision
        viewModel.loadData(context: context)
        #expect(viewModel.contextRevision != before, "no observable write, so no second body pass")

        #expect(viewModel.styleProfile?.keywords.first == "Warm Modern")
        #expect(viewModel.savedItemCount == 1)
        #expect(viewModel.rooms.count == 1)
        await Task.yield()

        // …and the gate still hides an account's rows from a guest, on the
        // same store, so this costs no second container.
        let guest = ProfileViewModel()
        guest.accountRowsAreVisible = { false }
        guest.loadData(context: context)
        #expect(guest.styleProfile == nil)
        #expect(guest.savedItemCount == 0)
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

    // MARK: - B-03's other half: a synced room does not come back

    /// The delete was local only. `RoomsAPIClient.deleteRoom(id:)` had no
    /// callers at all, so the row stayed on the server and the next
    /// reconcile's `plan.insert` re-created the card the person had just
    /// confirmed away (review RL1B-02).
    @Test
    func deletingASyncedRoomTombstonesItsRemoteId() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = store.createRoom(name: "Audit Room B", roomType: "other", manualEntry: true)
        room.remoteId = "C0000000-0000-4000-8000-000000000001"

        RoomTombstones.clearAll()
        store.delete(room)
        #expect(RoomTombstones.contains("c0000000-0000-4000-8000-000000000001"))
        RoomTombstones.clearAll()
    }

    /// A room that never synced leaves no tombstone — there is nothing on the
    /// server to suppress, and an unbounded list of local ids is a leak.
    @Test
    func deletingAnUnsyncedRoomTombstonesNothing() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = store.createRoom(name: "Bench", roomType: "other", manualEntry: true)

        RoomTombstones.clearAll()
        store.delete(room)
        #expect(RoomTombstones.all.isEmpty)
    }

    /// The merge respects it: a server row the person deleted here is not
    /// re-inserted, and it is named for a retry instead.
    @Test
    func theMergeDoesNotResurrectATombstonedRoom() {
        let row = RemoteRoom(
            id: "C0000000-0000-4000-8000-000000000001",
            user_id: "userA",
            name: "Audit Room B",
            type: "other",
            length_meters: nil, width_meters: nil, height_meters: nil,
            floor_area_sqm: nil, volume_cbm: nil,
            saved_item_count: 0, scan_count: 0, style_signals: nil,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-01T00:00:00Z",
            budget_cents: nil
        )
        let plan = RoomMerge.plan(
            server: [row],
            local: [],
            tombstoned: ["c0000000-0000-4000-8000-000000000001"]
        )
        #expect(plan.insert.isEmpty, "the deleted room came back")
        #expect(plan.deleteRemotely == ["C0000000-0000-4000-8000-000000000001"])
    }

    /// …and with no tombstone the same row still arrives, or the merge would
    /// have stopped mirroring rooms altogether.
    @Test
    func theMergeStillInsertsAnUntombstonedRoom() {
        let row = RemoteRoom(
            id: "C0000000-0000-4000-8000-000000000002",
            user_id: "userA",
            name: "Guest Bedroom",
            type: "bedroom",
            length_meters: nil, width_meters: nil, height_meters: nil,
            floor_area_sqm: nil, volume_cbm: nil,
            saved_item_count: 0, scan_count: 0, style_signals: nil,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-01T00:00:00Z",
            budget_cents: nil
        )
        let plan = RoomMerge.plan(server: [row], local: [], tombstoned: [])
        #expect(plan.insert.count == 1)
        #expect(plan.deleteRemotely.isEmpty)
    }

    /// The delete is mirrored where the person confirms it, not left to a
    /// reconcile that may not run for thirty seconds.
    @Test
    func theConfirmedDeleteIsMirroredToTheServer() throws {
        let view = try SourcePin.read("Patina/Features/Rooms/Views/RoomSettingsView.swift")
        let delete = try #require(
            view.components(separatedBy: "private func deleteRoom() {").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(delete.contains("RoomRemoteDelete.mirror(remoteId)"))

        let store = try SourcePin.read("Patina/Core/Persistence/RoomTombstones.swift")
        let mirror = try #require(
            store.components(separatedBy: "static func mirror(_ remoteId: String) {").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(mirror.contains("RoomsAPIClient.shared.deleteRoom(id: remoteId)"))
        #expect(mirror.contains("RoomTombstones.clear(remoteId)"))
    }

    /// Both callers clear the tombstone on a 2xx, and PostgREST answers 204
    /// for a DELETE its row-level policy filtered to zero rows. So the client
    /// has to know whether anything was actually deleted, or the tombstone is
    /// dropped against a surviving row and the next reconcile re-inserts it —
    /// silently, because nothing threw (review `RL1B2-09`).
    @Test
    func aDeleteThatRemovedNothingIsAFailure() throws {
        let client = try SourcePin.read("Patina/Core/Network/RoomsAPIClient.swift")
        let delete = try #require(
            client.components(separatedBy: "public func deleteRoom(id: String) async throws {").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(delete.contains("return=representation"))
        #expect(delete.contains("return=minimal") == false)
        #expect(delete.contains("decode([RemoteRoom].self, from: data).isEmpty"))
        #expect(delete.contains("throw RoomsAPIError.emptyResponse"))
    }

    /// `B-03`'s Today half. The Spaces list and the Studio counts follow a
    /// local delete because they read `LocalRoomSignal`; the Today rail does
    /// not, and drew a deleted room until the next foreground (review
    /// `RL1B2-04`, shots 15–17). `DailyRoomView.swift` is L1-C's file this
    /// wave, so the one-line fix went out as note **O14**.
    ///
    /// A known issue, and deliberately NOT `isIntermittent`: green here where
    /// the note is genuinely open, red the moment L1-C's `.onChange` lands —
    /// which is the signal to delete this block. `l1b-notes-out.md` §S6
    /// carries the scheduling, because L1-C merges first.
    @Test
    func theTodayRailFollowsALocalDelete() throws {
        let view = try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        let observes = SourceScan.code(in: view).contains("LocalRoomSignal")
        withKnownIssue(
            "B-03 owes DailyRoomView its LocalRoomSignal observer (l1b-notes-out.md O14, applied by L1-C)"
        ) {
            #expect(observes)
        }
    }

    /// The one irreversible control on Room Settings had a 100.7 × 14.7 pt
    /// hit area — the glyph box, not the 46 pt row it draws — so a tap at its
    /// visual centre landed on whatever was behind it (review `RL1B2-17`).
    @Test
    func theDeleteControlIsAWholeRow() throws {
        let view = try SourcePin.read("Patina/Features/Rooms/Views/RoomSettingsView.swift")
        let button = try #require(
            view.components(separatedBy: "private var deleteButton: some View {").last?
                .components(separatedBy: "\n    }").first
        )
        #expect(button.contains(".frame(height: 46)"))
        #expect(button.contains(".contentShape(Rectangle())"))
    }
}
