//
//  CommsDates.swift
//  Patina
//
//  Date parsing + formatting for the messaging surfaces. PostgREST
//  returns ISO-8601 timestamps with fractional seconds; these helpers
//  turn them into the human strings the inbox and thread views show
//  (and that VoiceOver reads — raw ISO-8601 must never reach AX).
//

import Foundation

enum CommsDates {
    /// ISO-8601 with fractional seconds (PostgREST's default shape).
    /// `ISO8601DateFormatter` is documented thread-safe.
    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain = ISO8601DateFormatter()

    /// Parse a PostgREST timestamp; tolerant of missing fractional
    /// seconds (mirrors the NotificationsAPIClient pattern).
    static func parse(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        return isoFractional.date(from: iso) ?? isoPlain.date(from: iso)
    }

    /// "2:41 PM" — bubble timestamps.
    static func timeLabel(for date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    /// "TUESDAY · JUN 9" (adds the year when not the current one) —
    /// day separators, rendered in DM Mono by the caller.
    static func dayLabel(for date: Date, relativeTo now: Date = Date()) -> String {
        let calendar = Calendar.current
        let weekday = date.formatted(.dateTime.weekday(.wide))
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        let day = sameYear
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
        return "\(weekday) · \(day)".uppercased()
    }

    /// Compact trailing label for inbox rows: "now", "12m", "2:41 PM"
    /// (today), "2d" (this week), "May 13", "May 13, 2025".
    static func compactLabel(for date: Date?, relativeTo now: Date = Date()) -> String? {
        guard let date else { return nil }
        let calendar = Calendar.current
        let interval = now.timeIntervalSince(date)
        if interval < 60 { return "now" }
        if interval < 3600 { return "\(Int(interval / 60))m" }
        if calendar.isDate(date, inSameDayAs: now) {
            return timeLabel(for: date)
        }
        if interval < 7 * 86_400 {
            let days = max(1, calendar.dateComponents([.day], from: date, to: now).day ?? 1)
            return "\(days)d"
        }
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        return sameYear
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    /// Spelled-out date+time for accessibility labels, e.g.
    /// "June 9 at 2:41 PM".
    static func accessibleLabel(for date: Date?) -> String? {
        guard let date else { return nil }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
