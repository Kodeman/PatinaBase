//
//  RoomMatchCellTests.swift
//  PatinaTests
//
//  W4 fix round · integration.md §6.5 — a match Patina has not computed draws
//  no cell, on the Spaces card and on the room screen.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct RoomMatchCellTests {

    private func makeStore() throws -> RoomStore {
        let schema = Schema([RoomModel.self, SavedItem.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        return RoomStore(context: ModelContext(container))
    }

    private func scored(_ store: RoomStore, score: Int) -> RoomModel {
        let room = store.createRoom(name: "Living Room", roomType: "living", manualEntry: true)
        let item = SavedItem(
            productId: "p1", productName: "Heirloom Oak Dining Table",
            makerName: "Nordic Atelier", priceCents: 420_000, matchScore: score,
            hasAR: false, thumbGradientKey: "warm", room: room
        )
        store.context.insert(item)
        return room
    }

    @Test("a room nobody has scored draws no Match cell — not an em dash")
    func anUnscoredRoomDrawsNoMatchCell() throws {
        let store = try makeStore()
        let room = store.createRoom(name: "Guest Bedroom", roomType: "bedroom", manualEntry: true)

        #expect(RoomGalleryCard.matchString(for: room) == nil)
        let labels = RoomGalleryCard.statCells(for: room).map(\.label)
        #expect(labels == ["Items"])
        #expect(!labels.contains("Match"))
    }

    @Test("a scored room draws its score")
    func aScoredRoomDrawsItsScore() throws {
        let store = try makeStore()
        let room = scored(store, score: 92)

        #expect(RoomGalleryCard.matchString(for: room) == "92%")
        #expect(RoomGalleryCard.statCells(for: room).map(\.label).contains("Match"))
    }

    @Test("the room screen drops the same cell on the same rule")
    func theRoomScreenDropsTheCellToo() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Views/RoomProjectView.swift")
        #expect(!source.contains("?? \"—\""))
        #expect(source.contains("if let match = room.averageMatchScore"))
    }
}
