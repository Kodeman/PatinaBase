//
//  RoomBudgetTests.swift
//  PatinaTests
//
//  W4 · H1 — the room's real numbers: a budget that is stored, mirrored and
//  labelled; the room screen's three lines; the typed-dimensions edit; and the
//  saved-item columns W4's saved row needs.
//
//  Honesty (C5) is the spine: a number drawn is a number stored. The budget is
//  the figure its owner typed and nothing else; the pieces figure is labelled
//  `in saved pieces` and is never presented as spend; an unset budget draws
//  nothing at all, never a `—`.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct RoomBudgetTests {

    private struct RemoteUnavailable: Error {}

    private static let calendar = Calendar(identifier: .gregorian)

    private static func day(_ month: Int, _ day: Int, year: Int = 2026) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 9
        return calendar.date(from: components)!
    }

    /// Records what actually went over the wire, so "mirrored on sync" is a
    /// pinned fact rather than a claim.
    private final class SpyRemote: RoomBudgetRemote, @unchecked Sendable {
        private(set) var calls: [(id: String, cents: Int?)] = []
        var shouldThrow = false

        @discardableResult
        func updateRoomBudget(id: String, cents: Int?) async throws -> RemoteRoom {
            calls.append((id, cents))
            if shouldThrow { throw RemoteUnavailable() }
            return RemoteRoom(
                id: id, user_id: "u", name: "Living Room", type: "living",
                length_meters: nil, width_meters: nil, height_meters: nil,
                floor_area_sqm: nil, volume_cbm: nil, saved_item_count: nil,
                scan_count: nil, style_signals: nil, created_at: "", updated_at: "",
                budget_cents: cents
            )
        }
    }

    /// `ModelContext(container)`, never `container.mainContext` — the main
    /// context holds a weak back-reference and traps once the container goes.
    private func makeStore() throws -> RoomStore {
        let schema = Schema([RoomModel.self, SavedItem.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        return RoomStore(context: ModelContext(container))
    }

    private func room(
        widthFeet: Double? = 18,
        lengthFeet: Double? = 14,
        scanned: Bool = false
    ) -> RoomModel {
        RoomModel(
            name: "Living Room",
            roomType: "living",
            hasBeenScanned: scanned,
            width: widthFeet.map { $0 / 3.28084 },
            length: lengthFeet.map { $0 / 3.28084 }
        )
    }

    @discardableResult
    private func saved(_ name: String, cents: Int, at date: Date, in room: RoomModel) -> SavedItem {
        let item = SavedItem(
            productId: "p-\(name)", productName: name, makerName: "Schoolhouse",
            priceCents: cents, matchScore: 90, hasAR: false,
            thumbGradientKey: "brass", room: room, addedAt: date
        )
        room.items.append(item)
        return item
    }

    // MARK: - T1 · the room carries a budget and how it was measured

    @Test("a fresh room has no budget and is not measured on the unit control")
    func aFreshRoomCarriesNeither() {
        let space = room()
        #expect(space.budgetCents == nil)
        #expect(space.measuredWithUnitControl == false)
        #expect(space.budgetLine == nil)
    }

    @Test("a budget prints as the figure that was stored, labelled")
    func theBudgetPrintsWhatIsStored() {
        let space = room()
        space.budgetCents = 900_000
        #expect(space.budgetLine == "budget $9,000")
    }

    @Test("the room's figure line labels the pieces total and never reads as spend")
    func theFigureLineIsLabelled() {
        let space = room()
        #expect(space.savedPiecesFigureLine == nil)

        saved("Woven Jute Area Rug 8x10", cents: 145_000, at: Self.day(8, 20), in: space)
        saved("Brass Arc Floor Lamp", cents: 89_000, at: Self.day(8, 25), in: space)
        saved("Velvet Club Chair", cents: 125_000, at: Self.day(8, 24), in: space)
        #expect(space.savedPiecesFigureLine == "$3,590 in saved pieces")

        space.budgetCents = 900_000
        #expect(space.savedPiecesFigureLine == "$3,590 in saved pieces · budget $9,000")
        #expect(space.savedPiecesFigureLine?.contains("spent") == false)
    }

    // MARK: - T2 · local-first, mirrored on sync

    @Test("a room that has never synced keeps the budget it was given, and calls nothing")
    func aLocalOnlyRoomKeepsTheFigure() async throws {
        let store = try makeStore()
        let space = store.createRoom(name: "Living Room", roomType: "living", manualEntry: true)
        let remote = SpyRemote()

        let result = await RoomBudgetCoordinator(store: store, api: remote)
            .setBudget(space, cents: 900_000)

        #expect(space.budgetCents == 900_000)
        #expect(result.isLocalOnly)
        #expect(remote.calls.isEmpty)
    }

    @Test("a synced room mirrors the same figure to rooms.budget_cents")
    func aSyncedRoomMirrors() async throws {
        let store = try makeStore()
        let space = store.createRoom(name: "Living Room", roomType: "living", manualEntry: true)
        space.remoteId = "remote-room-1"
        let remote = SpyRemote()

        let result = await RoomBudgetCoordinator(store: store, api: remote)
            .setBudget(space, cents: 900_000)

        #expect(space.budgetCents == 900_000)
        #expect(result.isLocalOnly == false)
        #expect(remote.calls.count == 1)
        #expect(remote.calls[0].id == "remote-room-1")
        #expect(remote.calls[0].cents == 900_000)
    }

    @Test("a failed mirror costs the copy, never the figure")
    func aFailedMirrorKeepsTheFigure() async throws {
        let store = try makeStore()
        let space = store.createRoom(name: "Living Room", roomType: "living", manualEntry: true)
        space.remoteId = "remote-room-1"
        space.syncStatus = .synced
        let remote = SpyRemote()
        remote.shouldThrow = true

        let result = await RoomBudgetCoordinator(store: store, api: remote)
            .setBudget(space, cents: 900_000)

        #expect(space.budgetCents == 900_000)
        #expect(result.isLocalOnly)
        #expect(space.syncStatus == .pending)
        #expect(space.needsSync)
    }

    @Test("removing a budget removes it here and there — an explicit null, not an omission")
    func removingABudgetClearsBothCopies() async throws {
        let store = try makeStore()
        let space = store.createRoom(name: "Living Room", roomType: "living", manualEntry: true)
        space.remoteId = "remote-room-1"
        space.budgetCents = 900_000
        let remote = SpyRemote()

        _ = await RoomBudgetCoordinator(store: store, api: remote).setBudget(space, cents: nil)

        #expect(space.budgetCents == nil)
        #expect(remote.calls.count == 1)
        #expect(remote.calls[0].cents == nil)
    }

    // MARK: - T4 · the room screen's three lines

    @Test("the room screen names its dimensions, its area and how it was measured")
    func theRoomScreenMetaLine() {
        let lines = RoomScreenLines.make(
            room: room(), now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(lines.meta == "18 × 14 ft · 252 sq ft · TYPED, NOT SCANNED")
    }

    @Test("a scanned room says so, and a room with no dimensions still says how it got here")
    func theMetaLineDegradesHonestly() {
        #expect(RoomScreenLines.make(room: room(scanned: true)).meta
            == "18 × 14 ft · 252 sq ft · SCANNED")
        #expect(RoomScreenLines.make(room: room(widthFeet: nil, lengthFeet: nil)).meta
            == "TYPED, NOT SCANNED")
    }

    @Test("the room screen's figures and dated state line are the room's own")
    func theRoomScreenFiguresAndState() {
        let space = room()
        space.budgetCents = 900_000
        saved("Brass Arc Floor Lamp", cents: 89_000, at: Self.day(8, 25), in: space)

        let lines = RoomScreenLines.make(
            room: space, now: Self.day(8, 26), calendar: Self.calendar
        )
        #expect(lines.figures == "$890 in saved pieces · budget $9,000")
        #expect(lines.state == "You added the Brass Arc Floor Lamp on Tuesday")
    }

    @Test("no pieces and no budget draws no figure line at all — never a dash")
    func noFiguresDrawsNothing() {
        let lines = RoomScreenLines.make(room: room())
        #expect(lines.figures == nil)
        #expect(lines.state == nil)
    }

    // MARK: - T5 · the sheet, and the typed-dimensions edit

    @Test("the budget sheet reads whole dollars as cents, and refuses anything else")
    func theSheetParsesWholeDollars() {
        #expect(RoomBudgetSheet.parse("9000") == 900_000)
        #expect(RoomBudgetSheet.parse("9,000") == 900_000)
        #expect(RoomBudgetSheet.parse("$9,000") == 900_000)
        #expect(RoomBudgetSheet.parse("") == nil)
        #expect(RoomBudgetSheet.parse("abc") == nil)
        #expect(RoomBudgetSheet.parse("-5") == nil)
    }

    @Test("the unit control converts both ways and restates what is on screen")
    func theUnitControlConverts() {
        #expect(abs(RoomUnit.feet.metres(from: 18) - 18 / 3.28084) < 0.0001)
        #expect(RoomUnit.metres.metres(from: 5) == 5)
        #expect(RoomSettingsView.restate("18", from: .feet, to: .metres) == "5.5")
        #expect(RoomSettingsView.restate("18", from: .feet, to: .feet) == "18")
        // The field offers back the number the person typed, not the float a
        // feet → metres → feet round trip leaves behind (17.999999999999996).
        #expect(RoomSettingsView.entry(
            fromMetres: RoomUnit.feet.metres(from: 18), unit: .feet
        ) == "18")
    }

    @Test("a typed correction stays a typed room, and marks itself measured")
    func aTypedEditDoesNotBecomeAScan() throws {
        let store = try makeStore()
        let space = store.createRoom(
            name: "Living Room", roomType: "living",
            widthFeet: 18, lengthFeet: 14, manualEntry: true
        )
        #expect(space.hasBeenScanned == false)
        #expect(space.measuredWithUnitControl == false)

        store.updateTypedDimensions(
            space,
            widthMeters: RoomUnit.feet.metres(from: 20),
            lengthMeters: RoomUnit.feet.metres(from: 15),
            heightMeters: nil
        )

        #expect(space.measuredWithUnitControl)
        #expect(space.hasBeenScanned == false)
        #expect(RoomScreenLines.make(room: space).meta.contains("TYPED, NOT SCANNED"))
        #expect(RoomScreenLines.make(room: space).meta.hasPrefix("20 × 15 ft"))
    }

    @Test("the Spaces gallery card's Budget cell is the budget, not the pieces total")
    func theGalleryCardPrintsTheBudget() {
        let space = room()
        saved("Brass Arc Floor Lamp", cents: 89_000, at: Self.day(8, 25), in: space)
        // Before W4 this cell printed `totalInvestmentCents` under the word
        // Budget — a different number entirely, labelled as something it was not.
        #expect(RoomGalleryCard.budgetString(for: space) == nil)

        space.budgetCents = 900_000
        // C5-14: the compact "K" shape is gone from the app — one amount, one
        // shape, and `PatinaCurrency` is the only place it is made.
        #expect(RoomGalleryCard.budgetString(for: space) == "$9,000")
    }

    @Test("no budget on the Spaces card draws no Budget cell at all — never a dash")
    func theGalleryCardDropsTheBudgetCellWhenThereIsNone() {
        let space = room()
        saved("Brass Arc Floor Lamp", cents: 89_000, at: Self.day(8, 25), in: space)

        let unset = RoomGalleryCard.statCells(for: space)
        #expect(unset.map(\.label) == ["Items", "Match"])
        #expect(unset.contains { $0.value == "$890" } == false)

        space.budgetCents = 900_000
        let set = RoomGalleryCard.statCells(for: space)
        #expect(set.map(\.label) == ["Items", "Budget", "Match"])
        #expect(set.first { $0.label == "Budget" }?.value == "$9,000")
    }

    // MARK: - T8 · steward §4a — the saved row's note and its price at save

    @Test("a saved-item row decodes its note and what it cost when it was saved")
    func theSavedRowDecodesBothColumns() throws {
        let row = try JSONDecoder().decode(RemoteSavedItem.self, from: Data("""
        { "id": "s1", "room_id": "r1", "user_id": "u1", "product_id": "p1",
          "name": "Brass Arc Floor Lamp", "image_url": null,
          "price_in_cents": 79000, "source": "browse",
          "created_at": "2026-08-25T00:00:00Z",
          "notes": "For the reading corner", "price_cents_at_save": 89000 }
        """.utf8))
        #expect(row.notes == "For the reading corner")
        #expect(row.price_cents_at_save == 89_000)
    }

    @Test("a row carrying neither column still decodes")
    func theSavedRowSurvivesWithoutThem() throws {
        let row = try JSONDecoder().decode(RemoteSavedItem.self, from: Data("""
        { "id": "s2", "room_id": null, "user_id": "u1", "product_id": "p1",
          "name": "Velvet Club Chair", "image_url": null, "price_in_cents": null,
          "source": null, "created_at": "2026-08-25T00:00:00Z" }
        """.utf8))
        #expect(row.notes == nil)
        #expect(row.price_cents_at_save == nil)
    }

    // MARK: - The bar measures the budget its owner set (integration.md §6.3)

    @Test("the bar measures against the room's own budget")
    func theBarMeasuresAgainstTheStoredBudget() {
        #expect(BudgetAssessment.level(totalCents: 100_000, budgetCents: 900_000) == .below50)
        #expect(BudgetAssessment.level(totalCents: 600_000, budgetCents: 900_000) == .approaching)
        #expect(BudgetAssessment.level(totalCents: 1_000_000, budgetCents: 900_000) == .atRange)
        #expect(BudgetAssessment.level(totalCents: 1_500_000, budgetCents: 900_000) == .overRange)
    }

    @Test("a room with no budget measures nothing and draws no bar")
    func noBudgetDrawsNoBar() {
        #expect(BudgetAssessment.level(totalCents: 240_000, budgetCents: nil) == nil)
        #expect(BudgetAssessment.level(totalCents: 240_000, budgetCents: 0) == nil)
    }

    @Test("the bar prints both figures and no third")
    func theBarPrintsBothFigures() {
        #expect(RoomBudgetBar.figure(totalCents: 240_000, budgetCents: 900_000) == "$2,400 of $9,000")
        #expect(RoomBudgetBar.figure(totalCents: 0, budgetCents: 45_000) == "$0 of $450")
    }

    @Test("the invented $2K–$5K range is gone from the room screen and the bar")
    func theInventedRangeIsGone() throws {
        let screen = try SourcePin.read("Patina/Features/Rooms/Views/RoomProjectView.swift")
        #expect(!screen.contains("200_000"))
        #expect(!screen.contains("500_000"))
        // The phrase survives in the file's own account of what it replaced;
        // what must be gone is the drawn line.
        let bar = try SourcePin.read("Patina/Features/Rooms/Components/RoomBudgetBar.swift")
        #expect(!bar.contains("Text(\"Your range"))
    }
}
