//
//  YourHouseRailTests.swift
//  PatinaTests
//
//  YOUR HOUSE (B §2, M1 block 4): the designer's project rooms beside the
//  rooms the person made, with real figures where real figures exist — and the
//  two-act invitation, in the ruled order, where there is no room at all.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct YourHouseRailTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func projectRooms(_ json: String) throws -> [RemoteProjectRoom] {
        try decode([RemoteProjectRoom].self, json)
    }

    @Test("a project room prints what is committed against its budget")
    func aProjectRoomPrintsItsFigures() throws {
        let rooms = try projectRooms("""
        [{ "id": "r1", "project_id": "b1", "name": "Dining Room",
           "budget_cents": 3200000, "committed_cents": 1840000 }]
        """)
        let card = HouseRoomCard.card(for: rooms[0])
        #expect(card.name == "Dining Room")
        #expect(card.meta == "$18,400 of $32,000 committed")
        #expect(card.isReadOnly)
    }

    @Test("a project room with no figures prints its name and invents nothing")
    func aProjectRoomWithNoFiguresInventsNone() throws {
        let rooms = try projectRooms("""
        [{ "id": "r2", "project_id": "b1", "name": "Living Room",
           "budget_cents": 0, "committed_cents": 0 }]
        """)
        let card = HouseRoomCard.card(for: rooms[0])
        #expect(card.meta == nil)
    }

    @Test("a budget with nothing committed yet says only what is true")
    func aBudgetWithNothingCommitted() throws {
        let rooms = try projectRooms("""
        [{ "id": "r3", "project_id": "b1", "name": "Study",
           "budget_cents": 900000, "committed_cents": 0 }]
        """)
        #expect(HouseRoomCard.card(for: rooms[0]).meta == "budget $9,000")
    }

    @Test("the project's rooms come first, then the rooms the person made")
    func projectRoomsComeFirst() throws {
        let rooms = try projectRooms("""
        [{ "id": "r1", "project_id": "b1", "name": "Dining Room", "budget_cents": 0 }]
        """)
        let local = RoomModel(name: "Garage", roomType: "other")
        let cards = HouseRoomCard.cards(projectRooms: rooms, localRooms: [local])
        #expect(cards.map(\.name) == ["Dining Room", "Garage"])
        #expect(cards[0].isReadOnly)
        #expect(cards[1].isReadOnly == false)
    }

    @Test("the light act is first")
    func theLightActIsFirst() {
        #expect(StartWithARoomAct.ordered == [.typeTheDimensions, .scanIt])
        #expect(StartWithARoomAct.ordered[0].title == "Type the dimensions")
        #expect(StartWithARoomAct.ordered[1].title == "Scan it")
        // W4 pin: `ordered` is the whole set, so no act can be reached only
        // through `allCases` and quietly land in the wrong order (F120).
        #expect(Set(StartWithARoomAct.ordered) == Set(StartWithARoomAct.allCases))
    }

    // MARK: - The rooms the person made carry real numbers too (W4)

    @Test("a local room prints its area, its pieces and its own budget")
    func aLocalRoomPrintsItsFigures() {
        let local = RoomModel(
            name: "Living Room", roomType: "living", hasBeenScanned: false,
            width: 18 / 3.28084, length: 14 / 3.28084
        )
        local.items.append(SavedItem(
            productId: "p1", productName: "Brass Arc Floor Lamp", makerName: "Schoolhouse",
            priceCents: 89_000, matchScore: 90, hasAR: false,
            thumbGradientKey: "brass", room: local
        ))
        local.budgetCents = 900_000

        let card = HouseRoomCard.card(for: local)
        #expect(card.meta == "252 sq ft · 1 saved piece · budget $9,000")
        #expect(card.isReadOnly == false)
    }

    @Test("a local room with no budget invents none")
    func aLocalRoomWithNoBudget() {
        let local = RoomModel(
            name: "Garage", roomType: "other", hasBeenScanned: false,
            width: 18 / 3.28084, length: 14 / 3.28084
        )
        #expect(HouseRoomCard.card(for: local).meta == "252 sq ft")
    }

    @Test("a room the project owns stays read-only, with the designer's figures")
    func aProjectRoomStaysReadOnly() throws {
        let rooms = try projectRooms("""
        [{ "id": "r1", "project_id": "b1", "name": "Dining Room",
           "budget_cents": 3200000, "committed_cents": 1840000 }]
        """)
        let card = HouseRoomCard.card(for: rooms[0])
        #expect(card.isReadOnly)
        #expect(card.meta == "$18,400 of $32,000 committed")
        // The edit acts live on `RoomProjectView`, which only ever opens a
        // local `RoomModel`; a project room routes to the project instead, so
        // there is no edit act on it to withhold.
        if case .project = card.origin {} else {
            Issue.record("a project room must carry a project origin")
        }
    }

    @Test("an activeProject client whose rooms are all the designer's still has a house")
    func projectRoomsAloneAreAHouse() throws {
        let rooms = try projectRooms("""
        [{ "id": "r1", "project_id": "b1", "name": "Dining Room", "budget_cents": 0 },
         { "id": "r2", "project_id": "b1", "name": "Living Room", "budget_cents": 0 }]
        """)
        let cards = HouseRoomCard.cards(projectRooms: rooms, localRooms: [])
        #expect(cards.count == 2)

        let input = HomeCompositionInput(
            isSignedIn: true, tier: .activeProject, roomCount: cards.count
        )
        #expect(HomeComposition.blocks(for: input).contains(.houseRail))
        #expect(!HomeComposition.blocks(for: input).contains(.startWithARoom))
    }
}
