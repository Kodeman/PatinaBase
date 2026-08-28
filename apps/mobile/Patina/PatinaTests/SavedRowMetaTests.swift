//
//  SavedRowMetaTests.swift
//  PatinaTests
//
//  B §3: a saved row prints its save date, its room, and the reader's note
//  (F197, F170). B §10 refuses everything past that.
//

import Testing
import Foundation
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
