//  MessagesDateFormat.swift
//  Capture · Wave M (Messages)
//
//  Date parsing (PostgREST ISO-8601 → Date, for SupabaseMessagingService) and
//  display formatting (compact inbox time, day separators, bubble timestamps,
//  VoiceOver labels) for M1/M2. Foundation only. Mirrors the reference app's
//  CommsDates (apps/mobile/Patina/Patina/Features/Messaging/CommsDates.swift),
//  scoped to this flow's directory so no shared seam is touched. Display-case
//  (uppercase day separators / sender captions) is applied at the view layer
//  via `.textCase`, not baked in here — these return natural-case strings.

import Foundation

enum MessagesDateFormat {
    /// ISO-8601 with fractional seconds (PostgREST's default shape).
    /// `ISO8601DateFormatter` is documented thread-safe.
    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain = ISO8601DateFormatter()

    /// Parse a PostgREST timestamp; tolerant of missing fractional seconds.
    static func parse(_ iso: String?) -> Date? {
        guard let iso, !iso.isEmpty else { return nil }
        return isoFractional.date(from: iso) ?? isoPlain.date(from: iso)
    }

    /// Compact trailing label for M1 rows: "now", "12m", "2:41 PM" (today),
    /// "2d" (this week), "Jun 9", "Jun 9, 2025".
    static func compact(_ date: Date, relativeTo now: Date = Date()) -> String {
        let calendar = Calendar.current
        let interval = now.timeIntervalSince(date)
        if interval < 60 { return "now" }
        if interval < 3600 { return "\(Int(interval / 60))m" }
        if calendar.isDate(date, inSameDayAs: now) { return timeLabel(date) }
        if interval < 7 * 86_400 {
            let days = max(1, calendar.dateComponents([.day], from: date, to: now).day ?? 1)
            return "\(days)d"
        }
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        return sameYear
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    /// "2:41 PM" — M2 bubble timestamps.
    static func timeLabel(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    /// "Tuesday · Jun 9" (adds the year when not current) — M2 day
    /// separators. The view applies `.textCase(.uppercase)`.
    static func dayLabel(_ date: Date, relativeTo now: Date = Date()) -> String {
        let calendar = Calendar.current
        let weekday = date.formatted(.dateTime.weekday(.wide))
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        let day = sameYear
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
        return "\(weekday) · \(day)"
    }

    /// Spelled-out date+time for VoiceOver labels, e.g. "June 9, 2026 at 2:41 PM".
    static func accessible(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .shortened)
    }
}
