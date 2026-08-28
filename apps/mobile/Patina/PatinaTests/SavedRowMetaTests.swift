//
//  SavedRowMetaTests.swift
//  PatinaTests
//
//  B §3: a saved row prints its save date, its room, and the reader's note
//  (F197, F170). B §10 refuses everything past that.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

struct SavedRowMetaTests {

    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    /// 2026-08-24T18:00:00Z
    private let savedAt = Date(timeIntervalSince1970: 1_787_594_400)

    @Test("the row names the day and the room")
    func dayAndRoom() {
        #expect(
            SavedRowMeta.line(savedAt: savedAt, roomName: "Living Room", calendar: utc)
                == "Saved Aug 24 · Living Room"
        )
    }

    @Test("a save that belongs to no room still names its day")
    func dayAlone() {
        // `saved_items.room_id` is nullable (00055:23) and SP-14 mirrors the
        // account-scoped saves too — the row must not print a dangling "·".
        #expect(SavedRowMeta.line(savedAt: savedAt, roomName: nil, calendar: utc) == "Saved Aug 24")
        #expect(SavedRowMeta.line(savedAt: savedAt, roomName: "  ", calendar: utc) == "Saved Aug 24")
    }

    @Test("the date is fixed-locale, not the device's")
    func fixedLocale() {
        // The same trap `HouseRecordDates` documents: a French device would
        // otherwise print "24 août" inside English copy.
        var paris = Calendar(identifier: .gregorian)
        paris.timeZone = TimeZone(identifier: "Europe/Paris")!
        let line = SavedRowMeta.line(savedAt: savedAt, roomName: nil, calendar: paris)
        #expect(line == "Saved Aug 24")
    }

    @Test("whitespace is not a note")
    func whitespaceIsNotANote() {
        #expect(SavedRowMeta.note(nil) == nil)
        #expect(SavedRowMeta.note("") == nil)
        #expect(SavedRowMeta.note("   \n ") == nil)
        #expect(SavedRowMeta.note("  Check the arm height  ") == "Check the arm height")
    }

    @Test("the note lives on the saved piece the reader saved")
    func theNoteIsOnTheModel() {
        let item = TableItemModel(name: "Velvet Club Chair", productId: "p-1")
        #expect(item.notes == nil)
        item.notes = "For the reading corner"
        #expect(SavedRowMeta.note(item.notes) == "For the reading corner")
    }
}

/// What crosses from `saved_items` onto the local row. Both halves of the
/// line the row prints — the day and the room — are made here, and both were
/// lost in the crossing before W4's fix round.
struct SavedItemReconcileTests {

    private let livingRoom = UUID(uuidString: "AAAAAAAA-0000-0000-0000-000000000001")!

    private func remote(
        createdAt: String,
        roomId: String? = "srv-room-1",
        productId: String? = "p-1",
        notes: String? = nil
    ) throws -> RemoteSavedItem {
        let room = roomId.map { "\"\($0)\"" } ?? "null"
        let product = productId.map { "\"\($0)\"" } ?? "null"
        let note = notes.map { "\"\($0)\"" } ?? "null"
        let json = """
        { "id": "si-1", "room_id": \(room), "user_id": "u-1", "product_id": \(product),
          "name": "Velvet Club Chair", "image_url": null, "price_in_cents": 420000,
          "source": "browse", "created_at": "\(createdAt)", "notes": \(note) }
        """
        return try JSONDecoder().decode(RemoteSavedItem.self, from: Data(json.utf8))
    }

    /// 2026-06-14T18:22:07Z
    private let june = Date(timeIntervalSince1970: 1_781_461_327)

    @Test("a pulled row keeps the day it was saved, fractional seconds and all")
    func fractionalSecondsSurvive() throws {
        // `saved_items.created_at` is `timestamptz DEFAULT NOW()` (00055:34),
        // so PostgREST always sends microseconds. A bare `ISO8601DateFormatter`
        // rejects them, and the `?? Date()` behind it printed "Saved <today>"
        // on a piece saved in June (C5 — a number drawn is a number stored).
        let item = try #require(CollectionsViewModel.localRow(
            from: try remote(createdAt: "2026-06-14T18:22:07.418293+00:00"),
            roomIdByRemoteId: [:]
        ))
        // The microseconds come through with it, so this is the same second,
        // not the same instant.
        #expect(abs(item.savedAt.timeIntervalSince(june)) < 1)
        #expect(abs(item.savedAt.timeIntervalSinceNow) > 86_400)
    }

    @Test("a whole-second timestamp still parses")
    func plainTimestampSurvives() throws {
        let item = try #require(CollectionsViewModel.localRow(
            from: try remote(createdAt: "2026-06-14T18:22:07+00:00"),
            roomIdByRemoteId: [:]
        ))
        #expect(item.savedAt == june)
    }

    @Test("the server's room becomes the local room the row names")
    func theRoomCrosses() throws {
        let item = try #require(CollectionsViewModel.localRow(
            from: try remote(createdAt: "2026-06-14T18:22:07.418293+00:00"),
            roomIdByRemoteId: ["srv-room-1": livingRoom]
        ))
        #expect(item.roomId == livingRoom)
        #expect(
            SavedRowMeta.line(savedAt: item.savedAt, roomName: "Living Room")
                .hasSuffix("· Living Room")
        )
    }

    @Test("a room the device does not hold is no room, never the wrong one")
    func anUnknownRoomIsNoRoom() throws {
        let unknown = try #require(CollectionsViewModel.localRow(
            from: try remote(createdAt: "2026-06-14T18:22:07Z", roomId: "srv-room-9"),
            roomIdByRemoteId: ["srv-room-1": livingRoom]
        ))
        #expect(unknown.roomId == nil)

        // `saved_items.room_id` is nullable (00055:23) — an account-scoped save.
        let roomless = try #require(CollectionsViewModel.localRow(
            from: try remote(createdAt: "2026-06-14T18:22:07Z", roomId: nil),
            roomIdByRemoteId: ["srv-room-1": livingRoom]
        ))
        #expect(roomless.roomId == nil)
    }

    @Test("a row naming no product is not a saved piece")
    func noProductNoRow() throws {
        #expect(CollectionsViewModel.localRow(
            from: try remote(createdAt: "2026-06-14T18:22:07Z", productId: nil),
            roomIdByRemoteId: [:]
        ) == nil)
    }

    /// The integration join: H1 put `notes` on the DTO, H2 draws it on the row,
    /// and nothing carried it across the two until now (`waves/w4/h2-notes.md`
    /// §3). Without this a note written on one device is silent on the next.
    @Test("the note the person wrote crosses onto the local row")
    func theNoteCrosses() throws {
        let carried = try #require(CollectionsViewModel.localRow(
            from: try remote(
                createdAt: "2026-06-14T18:22:07Z",
                notes: "For the reading corner"
            ),
            roomIdByRemoteId: [:]
        ))
        #expect(carried.notes == "For the reading corner")
        #expect(SavedRowMeta.note(carried.notes) == "For the reading corner")

        // A row carrying no note prints none — never a placeholder (C5).
        let bare = try #require(CollectionsViewModel.localRow(
            from: try remote(createdAt: "2026-06-14T18:22:07Z"),
            roomIdByRemoteId: [:]
        ))
        #expect(bare.notes == nil)
        #expect(SavedRowMeta.note(bare.notes) == nil)
    }

    @Test("an unparseable date falls back rather than dropping the piece")
    func anUnparseableDateStillYieldsARow() throws {
        let item = try #require(CollectionsViewModel.localRow(
            from: try remote(createdAt: "not a date"),
            roomIdByRemoteId: [:]
        ))
        #expect(item.name == "Velvet Club Chair")
    }
}

/// The note is written where the reader typed it — on the device — before it
/// is mirrored anywhere. B §3 / B §10: one sentence about a piece, no compare
/// surface, and nothing the reader is looking at waits on the network.
@MainActor
struct SavedItemNoteWriteTests {

    private func store() throws -> (CollectionsViewModel, ModelContext, TableItemModel) {
        let container = try ModelContainer(
            for: TableItemModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let context = ModelContext(container)
        let item = TableItemModel(name: "Velvet Club Chair", productId: "p-1")
        context.insert(item)
        let viewModel = CollectionsViewModel()
        viewModel.savedItems = [item]
        return (viewModel, context, item)
    }

    @Test("the note lands on the piece and on the list the screen is reading")
    func theNoteIsWrittenLocally() throws {
        let (viewModel, context, item) = try store()
        viewModel.setNote("For the reading corner", on: item, context: context)
        #expect(item.notes == "For the reading corner")
        #expect(viewModel.savedItems.first?.notes == "For the reading corner")
    }

    @Test("the note survives a re-read of the store")
    func theNoteSurvivesAReRead() throws {
        let (viewModel, context, item) = try store()
        viewModel.setNote("For the reading corner", on: item, context: context)
        let reread = try context.fetch(FetchDescriptor<TableItemModel>())
        #expect(reread.first?.notes == "For the reading corner")
    }

    @Test("clearing a note clears it — an empty note is no note, not an empty one")
    func clearingANoteClearsIt() throws {
        let (viewModel, context, item) = try store()
        viewModel.setNote("For the reading corner", on: item, context: context)
        viewModel.setNote(nil, on: item, context: context)
        #expect(item.notes == nil)
        #expect(SavedRowMeta.note(item.notes) == nil)
    }

    @Test("a piece with no product id is still noted locally, and mirrors nothing")
    func aProductlessPieceStillTakesANote() throws {
        let container = try ModelContainer(
            for: TableItemModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let context = ModelContext(container)
        // A locally-made save that never carried a catalog id: there is no
        // `saved_items` row to PATCH, and the early return is what keeps the
        // mirror from firing a request that could only fail.
        let item = TableItemModel(name: "A piece from the street", productId: nil)
        context.insert(item)
        let viewModel = CollectionsViewModel()
        viewModel.savedItems = [item]
        viewModel.setNote("Ask about the maker", on: item, context: context)
        #expect(item.notes == "Ask about the maker")
    }
}
