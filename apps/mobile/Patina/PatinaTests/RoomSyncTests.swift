//
//  RoomSyncTests.swift
//  PatinaTests
//
//  W4 fix round — the rooms an account owns reach the phone it signs in on.
//
//  The rules are the point, and two of them are the ones that can lose a
//  person's work: a local edit newer than the server's row is never
//  overwritten, and a room that never synced — the guest's (SP-06) — is never
//  merged into whichever account signs in next.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct RoomSyncTests {

    // MARK: - Fixtures

    /// The account signing in. Every fixture row below belongs to it unless a
    /// test says otherwise.
    nonisolated static let owner = "a0000000-0000-0000-0000-000000000005"

    nonisolated private static let calendar = Calendar(identifier: .gregorian)

    nonisolated private static func moment(_ month: Int, _ day: Int, hour: Int = 9) -> Date {
        var components = DateComponents()
        components.year = 2026
        components.month = month
        components.day = day
        components.hour = hour
        components.timeZone = TimeZone(identifier: "UTC")
        return calendar.date(from: components)!
    }

    nonisolated private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    nonisolated private func remote(
        id: String = "c0000000-0000-4000-8000-000000000001",
        name: String = "Guest Bedroom",
        lengthMeters: Double? = 4.57,
        widthMeters: Double? = 3.66,
        budgetCents: Int? = 900_000,
        updatedAt: Date = RoomSyncTests.moment(8, 20)
    ) -> RemoteRoom {
        RemoteRoom(
            id: id,
            user_id: "a0000000-0000-0000-0000-000000000005",
            name: name,
            type: "bedroom",
            length_meters: lengthMeters,
            width_meters: widthMeters,
            height_meters: 2.74,
            floor_area_sqm: 16.73,
            volume_cbm: 45.83,
            saved_item_count: 0,
            scan_count: 0,
            style_signals: nil,
            created_at: Self.iso.string(from: updatedAt),
            updated_at: Self.iso.string(from: updatedAt),
            budget_cents: budgetCents
        )
    }

    private func makeStore() throws -> RoomStore {
        let schema = Schema([RoomModel.self, SavedItem.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        return RoomStore(context: ModelContext(container))
    }

    // MARK: - The merge rules

    @Test("a server room the store has no mirror of is created locally")
    func aServerRoomTheStoreLacksIsCreated() throws {
        let store = try makeStore()
        RoomSyncCoordinator().apply([remote()], in: store, owner: Self.owner)

        let rooms = store.allRooms()
        #expect(rooms.count == 1)
        #expect(rooms.first?.name == "Guest Bedroom")
        #expect(rooms.first?.budgetCents == 900_000)
        #expect(rooms.first?.remoteId == "c0000000-0000-4000-8000-000000000001")
        #expect(rooms.first?.length == 4.57)
        #expect(rooms.first?.syncStatus == .synced)
    }

    @Test("a local edit newer than the server's row stands")
    func aLocalEditNewerThanTheServerIsKept() throws {
        let store = try makeStore()
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        room.remoteId = "c0000000-0000-4000-8000-000000000001"
        store.setBudget(room, cents: 750_000)
        room.updatedAt = Self.moment(8, 28)
        try store.context.save()

        RoomSyncCoordinator().apply([remote(updatedAt: Self.moment(8, 20))], in: store, owner: Self.owner)

        #expect(store.allRooms().count == 1)
        #expect(store.allRooms().first?.budgetCents == 750_000)
    }

    @Test("a server row newer than the local mirror wins")
    func aServerRowNewerThanTheLocalOneWins() throws {
        let store = try makeStore()
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        room.remoteId = "c0000000-0000-4000-8000-000000000001"
        store.setBudget(room, cents: 750_000)
        room.updatedAt = Self.moment(8, 10)
        try store.context.save()

        RoomSyncCoordinator().apply([remote(updatedAt: Self.moment(8, 20))], in: store, owner: Self.owner)

        #expect(store.allRooms().count == 1)
        #expect(store.allRooms().first?.budgetCents == 900_000)
    }

    @Test("a room that never synced is never merged into an account (SP-06)")
    func aRoomThatNeverSyncedIsNeverMerged() throws {
        let store = try makeStore()
        let guestRoom = store.createRoom(name: "Guest's Studio", roomType: "other", manualEntry: true)
        store.setBudget(guestRoom, cents: 120_000)
        let guestId = guestRoom.id

        RoomSyncCoordinator().apply([remote()], in: store, owner: Self.owner)

        let rooms = store.allRooms()
        #expect(rooms.count == 2)
        let kept = rooms.first { $0.id == guestId }
        #expect(kept?.name == "Guest's Studio")
        #expect(kept?.budgetCents == 120_000)
        #expect(kept?.remoteId == nil)

        let plan = RoomMerge.plan(
            server: [remote()],
            local: [RoomMerge.LocalRoom(id: guestId, remoteId: nil, updatedAt: Self.moment(8, 28))]
        )
        #expect(plan.untouched == [guestId])
        #expect(plan.takeServer.isEmpty)
        #expect(plan.keepLocal.isEmpty)
    }

    @Test("reconciling twice leaves one room, not two")
    func reconcilingTwiceLeavesOneRoom() throws {
        let store = try makeStore()
        let coordinator = RoomSyncCoordinator()
        coordinator.apply([remote()], in: store, owner: Self.owner)
        coordinator.apply([remote()], in: store, owner: Self.owner)

        #expect(store.allRooms().count == 1)
        #expect(store.allRooms().first?.budgetCents == 900_000)
    }

    @Test("a mirror is matched whatever case the id was written in")
    func theRemoteIdMatchIsCaseInsensitive() throws {
        let store = try makeStore()
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        room.remoteId = "C0000000-0000-4000-8000-000000000001"
        room.updatedAt = Self.moment(8, 10)
        try store.context.save()

        RoomSyncCoordinator().apply([remote()], in: store, owner: Self.owner)

        #expect(store.allRooms().count == 1)
    }

    // MARK: - The debounce

    @Test("the same owner is not re-fetched inside the window")
    func theSameOwnerIsNotRefetchedWithinTheWindow() {
        let due = RoomSyncCoordinator.isDue(
            owner: "u1", lastOwner: "u1",
            lastRunAt: Self.moment(8, 28, hour: 9),
            now: Self.moment(8, 28, hour: 9).addingTimeInterval(5)
        )
        #expect(due == false)
    }

    @Test("past the window the same owner asks again")
    func pastTheWindowTheSameOwnerAsksAgain() {
        let due = RoomSyncCoordinator.isDue(
            owner: "u1", lastOwner: "u1",
            lastRunAt: Self.moment(8, 28, hour: 9),
            now: Self.moment(8, 28, hour: 9).addingTimeInterval(60)
        )
        #expect(due == true)
    }

    // MARK: - The owner boundary (SP-06)

    @Test("the request asks for the account's own rooms and no one else's")
    func theRequestCarriesTheOwnerFilter() throws {
        let url = RoomsAPIClient.roomsListURL(
            base: URL(string: "https://example.supabase.co")!,
            userId: Self.owner
        )
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        #expect(items.contains(URLQueryItem(name: "user_id", value: "eq.\(Self.owner)")))
        #expect(url.path == "/rest/v1/rooms")
    }

    @Test("a row belonging to another account is never applied to this one")
    func aForeignRowIsRejectedByTheMerge() throws {
        let store = try makeStore()
        let foreign = remote(
            id: "d0000000-0000-4000-8000-000000000009",
            name: "A Client's Living Room"
        )
        // `rooms` lets a designer read every room of every client on her
        // roster, so a row reaching this device is not proof it is this
        // account's. The merge decides, not the response.
        let changed = RoomSyncCoordinator().apply(
            [foreign],
            in: store,
            owner: "f0000000-0000-0000-0000-00000000000f"
        )

        #expect(changed == false)
        #expect(store.allRooms().isEmpty)
    }

    @Test("the account's own row still lands when a foreign row rides beside it")
    func theOwnRowLandsBesideAForeignOne() throws {
        let store = try makeStore()
        let foreign = RemoteRoom(
            id: "d0000000-0000-4000-8000-000000000009",
            user_id: "f0000000-0000-0000-0000-00000000000f",
            name: "A Client's Living Room",
            type: "living_room",
            length_meters: 5, width_meters: 4, height_meters: 2.7,
            floor_area_sqm: 20, volume_cbm: 54,
            saved_item_count: 0, scan_count: 0, style_signals: nil,
            created_at: Self.iso.string(from: Self.moment(8, 20)),
            updated_at: Self.iso.string(from: Self.moment(8, 20)),
            budget_cents: nil
        )

        RoomSyncCoordinator().apply([foreign, remote()], in: store, owner: Self.owner)

        #expect(store.allRooms().count == 1)
        #expect(store.allRooms().first?.name == "Guest Bedroom")
    }

    // MARK: - The rail repaints (fix-review B-1)

    @Test("a reconcile that changes nothing does not ask the screens to repaint")
    func anUnchangedReconcileDoesNotBumpTheRevision() throws {
        let store = try makeStore()
        let coordinator = RoomSyncCoordinator()
        coordinator.apply([remote()], in: store, owner: Self.owner)
        #expect(coordinator.revision == 1)

        coordinator.apply([remote()], in: store, owner: Self.owner)
        #expect(coordinator.revision == 1)
    }

    @Test("a room mirrored in this session reaches Today's house rail")
    func aMirroredRoomReachesTheRail() throws {
        let schema = Schema([RoomModel.self, SavedItem.self, TableItemModel.self, StylePreferenceModel.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)

        let viewModel = DailyRoomViewModel()
        viewModel.modelContext = context
        viewModel.reloadRooms()
        #expect(viewModel.houseRoomCards.contains { $0.name == "Guest Bedroom" } == false)

        let coordinator = RoomSyncCoordinator()
        let changed = coordinator.apply([remote()], in: RoomStore(context: context), owner: Self.owner)
        #expect(changed)
        #expect(coordinator.revision == 1)

        // What the rail does when the revision moves.
        viewModel.reloadRooms()
        #expect(viewModel.houseRoomCards.contains { $0.name == "Guest Bedroom" })
    }

    @Test("Today watches the revision and re-reads its rooms")
    func todayRepaintsOnTheRevision() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        #expect(source.contains("onChange(of: roomSync.revision)"))
        #expect(source.contains("viewModel.reloadRooms()"))
    }

    // MARK: - The debounce, continued

    @Test("forgetting the store makes the next appearance ask again")
    func aWipedStoreIsDueImmediately() {
        let now = Self.moment(8, 28, hour: 9)
        let coordinator = RoomSyncCoordinator(lastOwner: "u1", lastRunAt: now)
        #expect(coordinator.isDue(owner: "u1", now: now.addingTimeInterval(1)) == false)

        coordinator.forget()
        #expect(coordinator.isDue(owner: "u1", now: now.addingTimeInterval(1)))
    }

    @Test("a different owner always re-fetches — the store was just claimed or wiped")
    func aDifferentOwnerAlwaysRefetches() {
        let due = RoomSyncCoordinator.isDue(
            owner: "u2", lastOwner: "u1",
            lastRunAt: Self.moment(8, 28, hour: 9),
            now: Self.moment(8, 28, hour: 9).addingTimeInterval(1)
        )
        #expect(due == true)
    }
}
