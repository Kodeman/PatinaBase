//
//  SavedRemovalTests.swift
//  PatinaTests
//
//  W4 third fix round — fix2-review MAJ-2.
//
//  M-1 made the piece screen's un-save take the room's copy with it. The two
//  other un-save surfaces — the Saved row's own Remove, and a recommendation's
//  ⋯ menu — still deleted only the `TableItemModel`, so a piece added to a room
//  and then removed from either of those left the room saying "1 saved piece"
//  and counting its price against the budget the same round made honest.
//
//  These pin the three figures a reader actually sees (`items`,
//  `savedItemCount`, `totalInvestmentCents`) after an un-save from EACH of the
//  three entry points, plus a second piece in the same room that must survive.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct SavedRemovalTests {

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
            category: .tables, tier: .designerSelection, dimensions: nil
        )
    }

    nonisolated private func otherPiece() -> Product {
        Product(
            id: "p-linen-chair", name: "Linen Slipper Chair",
            priceCents: 180_000, matchScore: 80,
            makerName: "Nordic Atelier", makerLocation: "Aarhus", makerStory: nil,
            imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [], badges: [],
            category: .seating, tier: .designerSelection, dimensions: nil
        )
    }

    /// A room holding the piece, exactly as `Add to Room` leaves it.
    private func roomHoldingThePiece(
        _ context: ModelContext,
        alsoHolding extra: Product? = nil
    ) -> RoomModel {
        let store = RoomStore(context: context)
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        if let extra {
            let model = ProductDetailViewModel()
            model.product = extra
            model.addToRoom(localId: room.id, remoteId: nil, context: context)
        }
        let model = ProductDetailViewModel()
        model.product = piece()
        model.addToRoom(localId: room.id, remoteId: nil, context: context)
        return room
    }

    // MARK: - Entry point 1 — the piece screen (M-1's own surface, unchanged)

    @Test("the piece screen's un-save clears the room's copy")
    func thePieceScreenClearsTheRoom() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = roomHoldingThePiece(context)
        #expect(store.room(id: room.id)?.items.count == 1)

        let model = ProductDetailViewModel()
        model.product = piece()
        model.toggleSave(context: context)

        #expect(try context.fetch(FetchDescriptor<TableItemModel>()).isEmpty)
        #expect(store.room(id: room.id)?.items.isEmpty == true)
        #expect(store.room(id: room.id)?.savedItemCount == 0)
        #expect(store.room(id: room.id)?.totalInvestmentCents == 0)
    }

    // MARK: - Entry point 2 — Pieces → Saved, the row's own Remove

    @Test("the Saved row's Remove clears the room's copy")
    func theSavedRowClearsTheRoom() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = roomHoldingThePiece(context)

        let rows = try context.fetch(FetchDescriptor<TableItemModel>())
        let row = try #require(rows.first)

        let collections = CollectionsViewModel()
        collections.savedItems = rows
        collections.removeSavedItem(row, context: context)

        #expect(try context.fetch(FetchDescriptor<TableItemModel>()).isEmpty)
        #expect(collections.savedItems.isEmpty)
        // The sentence M-1 wrote, on the surface the walk script's item 4 visits.
        #expect(store.room(id: room.id)?.items.isEmpty == true)
        #expect(store.room(id: room.id)?.savedItemCount == 0)
        #expect(store.room(id: room.id)?.totalInvestmentCents == 0)
    }

    // MARK: - Entry point 3 — a recommendation's ⋯ menu

    @Test("a recommendation's un-save clears the room's copy")
    func theRecommendationMenuClearsTheRoom() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = roomHoldingThePiece(context)

        let recommendations = RecommendationsViewModel()
        recommendations.unsaveProduct(piece(), context: context)

        #expect(try context.fetch(FetchDescriptor<TableItemModel>()).isEmpty)
        #expect(recommendations.isSaved(piece()) == false)
        #expect(store.room(id: room.id)?.items.isEmpty == true)
        #expect(store.room(id: room.id)?.savedItemCount == 0)
        #expect(store.room(id: room.id)?.totalInvestmentCents == 0)
    }

    // MARK: - What must survive

    @Test("un-saving from the Saved row leaves the room's other pieces alone")
    func theSavedRowLeavesTheOtherPieces() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let room = roomHoldingThePiece(context, alsoHolding: otherPiece())
        #expect(store.room(id: room.id)?.items.count == 2)

        let rows = try context.fetch(FetchDescriptor<TableItemModel>())
        let target = try #require(rows.first { $0.productId == piece().id })

        let collections = CollectionsViewModel()
        collections.savedItems = rows
        collections.removeSavedItem(target, context: context)

        #expect(store.room(id: room.id)?.items.count == 1)
        #expect(store.room(id: room.id)?.items.first?.productId == "p-linen-chair")
        #expect(store.room(id: room.id)?.savedItemCount == 1)
        #expect(store.room(id: room.id)?.totalInvestmentCents == 180_000)
    }

    @Test("un-saving takes the piece out of every room that holds it")
    func everyRoomLosesTheCopy() throws {
        let context = try makeContext()
        let store = RoomStore(context: context)
        let guestRoom = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)
        let office = store.createRoom(name: "Office", roomType: "office", manualEntry: true)

        for room in [guestRoom, office] {
            let model = ProductDetailViewModel()
            model.product = piece()
            model.addToRoom(localId: room.id, remoteId: nil, context: context)
        }

        SavedRemoval.removeLocally(productId: piece().id, context: context)

        #expect(store.room(id: guestRoom.id)?.items.isEmpty == true)
        #expect(store.room(id: office.id)?.items.isEmpty == true)
    }

    // MARK: - One path, not three

    /// The three call sites go through `SavedRemoval`. Without this the next
    /// un-save surface added to the app is free to delete a table row and
    /// orphan the room again — which is precisely how MAJ-2 happened after
    /// M-1 was fixed one file away.
    @Test("all three un-save surfaces route through the shared removal")
    func everySurfaceRoutesThroughTheSharedPath() throws {
        let piece = try SourcePin.read(
            "Patina/Features/ProductDetail/ViewModels/ProductDetailViewModel.swift"
        )
        #expect(piece.contains("SavedRemoval.remove("))

        let collections = try SourcePin.read(
            "Patina/Features/Collections/ViewModels/CollectionsViewModel.swift"
        )
        #expect(collections.contains("SavedRemoval.remove("))

        let recommendations = try SourcePin.read(
            "Patina/Features/Recommendations/ViewModels/RecommendationsViewModel.swift"
        )
        #expect(recommendations.contains("SavedRemoval.remove("))
    }
}
