//
//  SavedRowMeta.swift
//  Patina
//
//  What a saved row says about itself besides the piece: the day it was
//  saved and the room it was saved into (B §3 — "each row prints its save
//  date, room and note", F197/F170).
//
//  The note is not in here. It is the reader's own sentence and gets its own
//  line, at full length, rather than being folded into a summary.
//

import Foundation

enum SavedRowMeta {

    /// Fixed-format dates need a fixed locale, or "Aug 24" becomes "24 août"
    /// on a French device while the copy around it stays English — the same
    /// rule `HouseRecordDates` follows.
    private static func formatter(_ calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "MMM d"
        return formatter
    }

    /// `Saved Aug 24 · Living Room`, or `Saved Aug 24` where the piece belongs
    /// to the account rather than to a room (`saved_items.room_id` is nullable
    /// — 00055:23 — and SP-14 mirrors those saves too).
    static func line(
        savedAt: Date,
        roomName: String?,
        calendar: Calendar = .current
    ) -> String {
        let day = "Saved \(formatter(calendar).string(from: savedAt))"
        guard let roomName, !roomName.trimmingCharacters(in: .whitespaces).isEmpty else {
            return day
        }
        return "\(day) · \(roomName)"
    }

    /// A note is what the reader typed, or nothing. Whitespace is not a note.
    static func note(_ raw: String?) -> String? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
