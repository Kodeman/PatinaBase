//
//  DateDisplay.swift
//  Patina
//
//  Small display helpers for the money-rail surfaces (Wave 2). Turns parsed
//  Dates and raw Postgres `date` strings ("2026-04-01") into human copy.
//

import Foundation

enum DateDisplay {

    /// "Apr 1" — compact, for list rows.
    static func short(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// "April 1, 2026" — full, for detail headers / signed banners.
    static func long(_ date: Date) -> String {
        date.formatted(date: .long, time: .omitted)
    }

    /// Render a Postgres bare `date` string ("2026-04-01") as "Apr 1, 2026";
    /// falls back to the raw value if it doesn't parse.
    static func fromDateString(_ raw: String) -> String {
        let parser = DateFormatter()
        parser.dateFormat = "yyyy-MM-dd"
        parser.locale = Locale(identifier: "en_US_POSIX")
        guard let date = parser.date(from: String(raw.prefix(10))) else { return raw }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    /// Render a Postgres `timestamptz` string as "Apr 1, 2026"; falls back to
    /// the bare-date parse, then the raw value.
    static func fromTimestamp(_ raw: String) -> String {
        if let date = ISO8601DateParsing.date(from: raw) {
            return date.formatted(date: .abbreviated, time: .omitted)
        }
        return fromDateString(raw)
    }

    // MARK: - SP-15 · the date you need is on the screen you leave

    /// One due/expiry line for every money surface. The Studio hub printed
    /// "Overdue · Aug 22" while the decision list and detail printed nothing;
    /// the list carried "Due Sep 1, 2026" and the invoice detail dropped it.
    /// Both now read this.
    struct DueLine: Equatable {
        let text: String
        let isPastDue: Bool
    }

    /// "Overdue · Aug 22" / "Due today" / "Due Sep 1". Day precision — a
    /// Postgres `date` carries no time, and the ISO8601 formatters reject it
    /// outright (the trap `isAwaitingSignature` documents).
    static func due(_ raw: String?, now: Date = Date()) -> DueLine? {
        guard let date = parsed(raw) else { return nil }
        return due(date, now: now)
    }

    static func due(_ date: Date, now: Date = Date()) -> DueLine {
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: now)
        if day < today { return DueLine(text: "Overdue · \(short(date))", isPastDue: true) }
        if day == today { return DueLine(text: "Due today", isPastDue: false) }
        return DueLine(text: "Due \(short(date))", isPastDue: false)
    }

    /// "Expired Sep 8" / "Expires today" / "Expires Sep 8".
    static func expiry(_ raw: String?, now: Date = Date()) -> DueLine? {
        guard let date = parsed(raw) else { return nil }
        return expiry(date, now: now)
    }

    static func expiry(_ date: Date, now: Date = Date()) -> DueLine {
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: now)
        if day < today { return DueLine(text: "Expired \(short(date))", isPastDue: true) }
        if day == today { return DueLine(text: "Expires today", isPastDue: false) }
        return DueLine(text: "Expires \(short(date))", isPastDue: false)
    }

    private static func parsed(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return ISO8601DateParsing.dateOrDay(from: raw)
    }
}
