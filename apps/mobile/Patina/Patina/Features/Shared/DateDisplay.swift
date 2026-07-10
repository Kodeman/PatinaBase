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
}
