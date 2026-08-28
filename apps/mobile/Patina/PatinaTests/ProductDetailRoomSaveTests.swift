//
//  ProductDetailRoomSaveTests.swift
//  PatinaTests
//
//  W4 fix round — `Add to Room` puts the piece in a room.
//
//  The row meta and the room-scoped Saved screen have drawn a room since W4's
//  H2 lane; nothing ever wrote one. These pin the write: the local row carries
//  the room, the room's own list carries the piece, the payload carries
//  `room_id`, and a save made with no room stays roomless rather than being
//  given one (C5).
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct ProductDetailRoomSaveTests {

    private func makeContext() throws -> ModelContext {
        let schema = Schema([RoomModel.self, SavedItem.self, TableItemModel.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        return ModelContext(container)
    }

    nonisolated private func piece() -> Product {
        Product(
            id: "p-oak-table", name: "Heirloom Oak Dining Table",
            priceCents: 420_000, matchScore: 90,
            makerName: "Nordic Atelier", makerLocation: "Aarhus", makerStory: nil,
            imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [], badges: [],
            category: .tables, tier: .designerSelection,
            dimensions: ProductDimensions(width: 84, height: 30, depth: 38, unit: "in")
        )
    }

    private func viewModel(for product: Product) -> ProductDetailViewModel {
        let viewModel = ProductDetailViewModel()
        viewModel.product = product
        return viewModel
    }

    // MARK: - The payload

    @Test("the mirrored payload carries the room")
    func thePayloadCarriesTheRoom() throws {
        let payload = ProductDetailViewModel.savePayload(
            product: piece(),
            userId: "a0000000-0000-0000-0000-000000000005",
            roomRemoteId: "c0000000-0000-4000-8000-000000000001"
        )
        #expect(payload.room_id == "c0000000-0000-4000-8000-000000000001")

        let json = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(payload)
        ) as? [String: Any]
        #expect(json?["room_id"] as? String == "c0000000-0000-4000-8000-000000000001")
    }

    @Test("a save with no room names none")
    func aSaveWithNoRoomStaysRoomless() throws {
        let payload = ProductDetailViewModel.savePayload(
            product: piece(), userId: "u", roomRemoteId: nil
        )
        #expect(payload.room_id == nil)
    }

    // MARK: - The local write

    @Test("the save lands the room on the saved row and in the room's own list")
    func theSaveLandsTheRoomOnTheLocalRow() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)

        let product = piece()
        viewModel(for: product).addToRoom(localId: room.id, remoteId: nil, context: context)

        let rows = try context.fetch(FetchDescriptor<TableItemModel>())
        #expect(rows.count == 1)
        #expect(rows.first?.roomId == room.id)
        #expect(store.room(id: room.id)?.items.count == 1)
    }

    @Test("a piece already saved to the account gains the room, and is not saved twice")
    func anExistingSaveGainsTheRoom() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        let product = piece()

        let model = viewModel(for: product)
        model.toggleSave(context: context)
        model.addToRoom(localId: room.id, remoteId: nil, context: context)

        let rows = try context.fetch(FetchDescriptor<TableItemModel>())
        #expect(rows.count == 1)
        #expect(rows.first?.roomId == room.id)
    }

    // MARK: - What the reader then sees

    @Test("the saved row's meta line names the room")
    func theRowMetaDrawsTheRoom() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        viewModel(for: piece()).addToRoom(localId: room.id, remoteId: nil, context: context)

        let rows = try context.fetch(FetchDescriptor<TableItemModel>())
        let row = try #require(rows.first)
        let names = [room.id: room.name]
        #expect(
            SavedRowMeta.line(savedAt: row.savedAt, roomName: row.roomId.flatMap { names[$0] })
                .hasSuffix(" · Guest Bedroom")
        )
    }

    @Test("the room's own Saved list holds the piece, and another room's does not")
    func theRoomScopedSavedListFiltersByRoom() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let guestRoom = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        let office = store.createRoom(name: "Office", roomType: "office", manualEntry: true)
        viewModel(for: piece()).addToRoom(localId: guestRoom.id, remoteId: nil, context: context)

        let rows = try context.fetch(FetchDescriptor<TableItemModel>())
        #expect(CollectionsViewModel.items(rows, inRoom: guestRoom.id).count == 1)
        #expect(CollectionsViewModel.items(rows, inRoom: office.id).isEmpty)
        #expect(CollectionsViewModel.items(rows, inRoom: nil).count == 1)
    }

    // MARK: - The mount

    @Test("the piece screen's Add to Room reaches a room, not just the save toggle")
    func theActWritesARoom() throws {
        let source = try SourcePin.read("Patina/Features/ProductDetail/Views/ProductDetailView.swift")
        #expect(source.contains("AddToRoomSheet("))
        #expect(source.contains("viewModel.addToRoom("))
    }
}
