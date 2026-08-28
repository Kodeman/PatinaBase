//
//  RoomHeroCardTests.swift
//  PatinaTests
//
//  MJ-B: M2 block 3 — the room the person made, drawn whole, with its real
//  numbers and its own dated state line — and block 5, the Saved door.
//
//  Honesty (C5) is the whole of it: every line is a real value or it is not
//  drawn. The budget the mock prints has no source on a local room and is
//  therefore absent rather than invented (see `r2-fix-log.md`).
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct RoomHeroCardTests {

    private static let calendar = Calendar(identifier: .gregorian)

    private static func day(_ month: Int, _ day: Int, year: Int = 2026) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 9
        return calendar.date(from: components)!
    }

    private func room(
        name: String = "Living Room",
        widthFeet: Double? = 18,
        lengthFeet: Double? = 14,
        scanned: Bool = false
    ) -> RoomModel {
        RoomModel(
            name: name,
            roomType: "living",
            hasBeenScanned: scanned,
            width: widthFeet.map { $0 / 3.28084 },
            length: lengthFeet.map { $0 / 3.28084 }
        )
    }

    private func saved(
        _ name: String,
        at date: Date,
        in room: RoomModel
    ) -> SavedItem {
        let item = SavedItem(
            productId: "p-\(name)", productName: name, makerName: "Schoolhouse",
            priceCents: 89000, matchScore: 90, hasAR: false,
            thumbGradientKey: "brass", room: room, addedAt: date
        )
        room.items.append(item)
        return item
    }

    // MARK: - The room's own numbers

    @Test("the hero prints the room's real dimensions and area")
    func theRoomPrintsItsFigures() {
        let hero = RoomHero.make(
            room: room(), now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(hero.name == "Living Room")
        #expect(hero.dimensions == "18 × 14 ft · 252 sq ft")
        #expect(hero.provenance == "TYPED, NOT SCANNED")
    }

    @Test("a room with no dimensions prints none, and invents none")
    func aRoomWithoutDimensions() {
        let hero = RoomHero.make(
            room: room(widthFeet: nil, lengthFeet: nil),
            now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(hero.dimensions == nil)
        #expect(hero.pieces == nil)
        #expect(hero.stateLine == nil)
    }

    @Test("a scanned room says so")
    func aScannedRoomSaysSo() {
        #expect(RoomHero.make(room: room(scanned: true)).provenance == "SCANNED")
    }

    @Test("the saved count is the room's real count, singular where it is one")
    func theSavedCountIsReal() {
        let space = room()
        _ = saved("Brass Arc Floor Lamp", at: Self.day(8, 25), in: space)
        #expect(RoomHero.make(room: space, now: Self.day(8, 26),
                              calendar: Self.calendar).pieces == "1 saved piece")
        _ = saved("Ceramic Table Lamp", at: Self.day(8, 24), in: space)
        #expect(RoomHero.make(room: space, now: Self.day(8, 26),
                              calendar: Self.calendar).pieces == "2 saved pieces")
    }

    // MARK: - The budget (W4)

    @Test("the hero prints the room's budget beside its pieces, as M2 draws it")
    func theHeroPrintsTheBudget() {
        let space = room()
        _ = saved("Brass Arc Floor Lamp", at: Self.day(8, 25), in: space)
        _ = saved("Velvet Club Chair", at: Self.day(8, 24), in: space)
        _ = saved("Woven Jute Area Rug 8x10", at: Self.day(8, 23), in: space)
        space.budgetCents = 900_000

        let hero = RoomHero.make(room: space, now: Self.day(8, 26), calendar: Self.calendar)
        #expect(hero.pieces == "3 saved pieces · budget $9,000")
    }

    @Test("a budget with nothing saved yet still prints, and nothing prints a dash")
    func theBudgetStandsAlone() {
        let space = room()
        space.budgetCents = 900_000
        #expect(RoomHero.make(room: space).pieces == "budget $9,000")

        let bare = room()
        #expect(RoomHero.make(room: bare).pieces == nil)
    }

    // MARK: - The dated state line

    @Test("the state line names the last real save, by its own date")
    func theStateLineIsDated() {
        let space = room()
        _ = saved("Ceramic Table Lamp", at: Self.day(8, 20), in: space)
        _ = saved("Brass Arc Floor Lamp", at: Self.day(8, 25), in: space)

        let hero = RoomHero.make(room: space, now: Self.day(8, 26), calendar: Self.calendar)
        #expect(hero.stateLine == "You added the Brass Arc Floor Lamp on Tuesday")
    }

    @Test("past a week the state line names the day, not a weekday that has come round again")
    func anOlderSaveNamesTheDay() {
        let space = room()
        _ = saved("Brass Arc Floor Lamp", at: Self.day(8, 4), in: space)
        let hero = RoomHero.make(room: space, now: Self.day(8, 26), calendar: Self.calendar)
        #expect(hero.stateLine == "You added the Brass Arc Floor Lamp on Aug 4")
    }

    // MARK: - The Saved door

    @Test("the Saved row counts what is saved and names the most recent")
    func theSavedRowIsReal() {
        let items = [
            TableItemModel(name: "Ceramic Table Lamp", savedAt: Self.day(8, 20)),
            TableItemModel(name: "Brass Arc Floor Lamp", savedAt: Self.day(8, 25))
        ]
        let summary = SavedSummary.make(
            items: items, now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(summary?.count == 2)
        #expect(summary?.meta == "2 saved · Brass Arc Floor Lamp, Tuesday")
    }

    @Test("nothing saved draws no row at all")
    func nothingSavedDrawsNothing() {
        #expect(SavedSummary.make(items: []) == nil)
    }

    // MARK: - Where the blocks mount

    @Test("one room the person made draws the hero, not a rail of one card")
    func discoveringDrawsTheHero() {
        let blocks = HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: true, tier: .discovering, roomCount: 1, localRoomCount: 1
        ))
        #expect(blocks.contains(.roomHero))
        #expect(!blocks.contains(.houseRail))
        #expect(!blocks.contains(.startWithARoom))
    }

    @Test("from engaged upward the rail holds the designer's rooms beside the person's")
    func engagedKeepsTheRail() {
        let blocks = HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: true, tier: .engaged, roomCount: 1, localRoomCount: 1
        ))
        #expect(blocks.contains(.houseRail))
        #expect(!blocks.contains(.roomHero))
    }

    @Test("more than one room is a rail again")
    func twoRoomsAreARail() {
        let blocks = HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: true, tier: .discovering, roomCount: 2, localRoomCount: 2
        ))
        #expect(blocks.contains(.houseRail))
        #expect(!blocks.contains(.roomHero))
    }

    @Test("a project room is not the person's own room to draw whole")
    func aProjectRoomIsNotTheHero() {
        let blocks = HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: true, tier: .discovering, roomCount: 1, localRoomCount: 0
        ))
        #expect(blocks.contains(.houseRail))
        #expect(!blocks.contains(.roomHero))
    }

    @Test("the Saved door draws where pieces are saved, and only for a session")
    func theSavedDoorMounts() {
        #expect(HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: true, tier: .discovering, savedPieceCount: 3
        )).contains(.savedSummary))

        #expect(!HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: true, tier: .discovering, savedPieceCount: 0
        )).contains(.savedSummary))

        // A guest's saves are not on file anywhere yet (M2's tier note).
        #expect(!HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: false, tier: .discovering, savedPieceCount: 3
        )).contains(.savedSummary))
    }

    @Test("the Saved row sits after NEW THIS WEEK and before the story (M2's order)")
    func theSavedDoorSitsWhereM2DrawsIt() {
        let blocks = HomeComposition.blocks(for: HomeCompositionInput(
            isSignedIn: true, tier: .discovering, roomCount: 1,
            newThisWeekCount: 3, hasStory: true, localRoomCount: 1, savedPieceCount: 3
        ))
        let order = [HomeBlock.roomHero, .newThisWeek, .savedSummary, .story]
        #expect(blocks.filter(order.contains) == order)
    }

    @Test("both acts are reachable once a room exists")
    func bothActsStayReachable() throws {
        // `house_add_room_tapped {method}` reported the typed act for 100% of
        // rail taps because the scan act was unreachable after the first room.
        for file in [
            "Patina/Features/Home/Views/YourHouseRail.swift",
            "Patina/Features/Home/Views/RoomHeroCard.swift"
        ] {
            let source = try SourcePin.read(file)
            #expect(source.contains("onAddRoom: (StartWithARoomAct) -> Void")
                    || source.contains("onAddRoom(act)"))
            #expect(source.contains("StartWithARoomAct.ordered"))
        }
    }
}
