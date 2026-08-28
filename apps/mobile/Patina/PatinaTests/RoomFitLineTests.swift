//
//  RoomFitLineTests.swift
//  PatinaTests
//
//  W4 · H1 — "Your Living Room's longest wall is 18 ft. This table is 7 ft."
//
//  Two numbers and a full stop. The gate is the point: the line draws for a
//  room measured on SP-19's segmented unit control and for no other room,
//  because the toggle it replaced silently persisted its unit and left rooms
//  measured in the wrong one (F40).
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct RoomFitLineTests {

    private func room(
        name: String = "Living Room",
        widthFeet: Double? = 18,
        lengthFeet: Double? = 14,
        measured: Bool = true
    ) -> RoomModel {
        let space = RoomModel(
            name: name,
            roomType: "living",
            hasBeenScanned: false,
            width: widthFeet.map { $0 / 3.28084 },
            length: lengthFeet.map { $0 / 3.28084 }
        )
        space.measuredWithUnitControl = measured
        return space
    }

    private func piece(
        name: String = "Heirloom Oak Dining Table",
        category: ProductCategory = .tables,
        width: Double? = 84,
        depth: Double? = 38,
        unit: String? = "in"
    ) -> Product {
        Product(
            id: "p1", name: name, priceCents: 420_000, matchScore: 90,
            makerName: "Nordic Atelier", makerLocation: "Aarhus", makerStory: nil,
            imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [], badges: [],
            category: category, tier: .designerSelection,
            dimensions: ProductDimensions(width: width, height: 30, depth: depth, unit: unit)
        )
    }

    // MARK: - The numbers

    @Test("the line prints the room's longest wall and the piece's longest side")
    func theLinePrintsBothNumbers() {
        let line = RoomFitLine.make(room: room(), product: piece())
        #expect(line?.text == "Your Living Room's longest wall is 18 ft. This table is 7 ft.")
    }

    @Test("the line names the room the reader is actually in")
    func theLineNamesTheRoom() {
        let line = RoomFitLine.make(
            room: room(name: "Dining Room", widthFeet: 12, lengthFeet: 20),
            product: piece()
        )
        #expect(line?.text == "Your Dining Room's longest wall is 20 ft. This table is 7 ft.")
    }

    @Test("the line prints numbers and never a promise")
    func theLineMakesNoPromise() throws {
        let text = try #require(RoomFitLine.make(room: room(), product: piece())).text
        for word in ["fits", "will fit", "perfect", "room for", "just right", "won't"] {
            #expect(text.lowercased().contains(word) == false)
        }
    }

    // MARK: - The gate

    @Test("a room measured before the segmented control landed draws no line")
    func anUnmeasuredRoomDrawsNothing() {
        #expect(RoomFitLine.make(room: room(measured: false), product: piece()) == nil)
    }

    @Test("a room with no dimensions draws no line")
    func aRoomWithNoDimensionsDrawsNothing() {
        #expect(RoomFitLine.make(
            room: room(widthFeet: nil, lengthFeet: nil), product: piece()
        ) == nil)
    }

    @Test("a piece with no footprint draws no line")
    func aPieceWithNoFootprintDrawsNothing() {
        #expect(RoomFitLine.make(room: room(), product: piece(width: nil, depth: nil)) == nil)
        #expect(RoomFitLine.make(
            room: room(),
            product: Product(
                id: "p2", name: "Ceramic Table Lamp", priceCents: 42_000, matchScore: 80,
                makerName: "Local Potter", makerLocation: nil, makerStory: nil,
                imageURL: nil, usdzURL: nil, styleTags: [], materialTags: [], badges: [],
                category: .lighting, tier: .styleMatch
            )
        ) == nil)
    }

    @Test("a unit the app cannot convert draws no line rather than a wrong one")
    func anUnknownUnitDrawsNothing() {
        #expect(RoomFitLine.make(room: room(), product: piece(unit: "cubits")) == nil)
    }

    // MARK: - Conversion and wording

    @Test("a metric piece converts")
    func aMetricPieceConverts() {
        let line = RoomFitLine.make(room: room(), product: piece(width: 213, depth: 97, unit: "cm"))
        #expect(line?.text == "Your Living Room's longest wall is 18 ft. This table is 7 ft.")
    }

    @Test("height is not a wall measurement")
    func heightIsIgnored() {
        // 30″ H is the tallest axis; the footprint is 38″ D.
        let line = RoomFitLine.make(room: room(), product: piece(width: nil, depth: 38))
        #expect(line?.text == "Your Living Room's longest wall is 18 ft. This table is 3.2 ft.")
    }

    @Test("a piece the app has no noun for is a piece")
    func anUnnamedCategoryIsAPiece() {
        let line = RoomFitLine.make(room: room(), product: piece(category: .seating))
        #expect(line?.text == "Your Living Room's longest wall is 18 ft. This piece is 7 ft.")
    }

    // MARK: - Which room (W4 fix round — the mount)

    @Test("the piece screen is where the line draws")
    func theLineIsMountedOnThePieceScreen() throws {
        let source = try SourcePin.read("Patina/Features/ProductDetail/Views/ProductDetailView.swift")
        #expect(source.contains("RoomFitLineView(line: fit)"))
    }

    @Test("the room the screen was opened from is the one measured against")
    func theRoomInContextIsPreferred() {
        let living = room(name: "Living Room")
        let guestRoom = room(name: "Guest Bedroom")
        let picked = RoomFitLine.room(
            preferredLocalId: guestRoom.id, preferredRemoteId: nil, in: [living, guestRoom]
        )
        #expect(picked?.name == "Guest Bedroom")
    }

    @Test("a room in context that was never measured substitutes no other room")
    func anUnmeasuredRoomInContextSubstitutesNoOtherRoom() {
        let living = room(name: "Living Room", measured: true)
        let guestRoom = room(name: "Guest Bedroom", measured: false)
        let picked = RoomFitLine.room(
            preferredLocalId: guestRoom.id, preferredRemoteId: nil, in: [living, guestRoom]
        )
        #expect(picked == nil)
    }

    @Test("with no room in context the most recently measured room is used")
    func theMostRecentlyMeasuredRoomIsUsedWithNoContext() {
        let older = room(name: "Office")
        older.updatedAt = Date(timeIntervalSince1970: 1_000)
        let newer = room(name: "Living Room")
        newer.updatedAt = Date(timeIntervalSince1970: 2_000)
        let picked = RoomFitLine.room(preferredLocalId: nil, preferredRemoteId: nil, in: [older, newer])
        #expect(picked?.name == "Living Room")
    }

    @Test("no measured room draws nothing")
    func noMeasuredRoomDrawsNothing() {
        let unmeasured = room(name: "Office", measured: false)
        #expect(RoomFitLine.room(preferredLocalId: nil, preferredRemoteId: nil, in: [unmeasured]) == nil)
    }

    @Test("the room in context can be named by its server id")
    func theRoomInContextResolvesByRemoteId() {
        let living = room(name: "Living Room")
        living.remoteId = "C0000000-0000-4000-8000-000000000001"
        let picked = RoomFitLine.room(
            preferredLocalId: nil,
            preferredRemoteId: "c0000000-0000-4000-8000-000000000001",
            in: [living]
        )
        #expect(picked?.name == "Living Room")
    }
}
