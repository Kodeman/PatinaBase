//  CaptureDates.swift
//  CaptureKit
//
//  Shared DISPLAY date formatting (E.2 consolidation) — the per-flow
//  DateFormatter idioms scattered across Features/ fold into these cached
//  formatters. Display only: wire-format parsers that encode a server
//  contract (ProjectsWireDate, MessagesDateFormat.parse, the Postgres DATE
//  decoders, FieldCapturePayload's ISO-8601) deliberately stay in their
//  flows. Product-copy formatters with bespoke output (Messages' compact
//  "now/12m/2d" inbox labels, Leads' "3mo ago") also stay — consolidating
//  them would change copy, not just plumbing.

import Foundation

public enum CaptureDates {
    // MARK: - Cached formatters (DateFormatter init is expensive; several
    // former call sites re-allocated one per render).

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter
    }()

    private static let shortDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }()

    private static let dayHeadingFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter
    }()

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    // MARK: - Display styles

    /// "2:41 PM" — timestamps within today.
    public static func time(_ date: Date) -> String {
        timeFormatter.string(from: date)
    }

    /// "Jun 9" — compact date, year implied.
    public static func shortDate(_ date: Date) -> String {
        shortDateFormatter.string(from: date)
    }

    /// "Jun 9, 2026" — absolute date with year.
    public static func mediumDate(_ date: Date) -> String {
        date.formatted(date: .abbreviated, time: .omitted)
    }

    /// "Tuesday, June 9" — dashboard/day headings.
    public static func dayHeading(_ date: Date) -> String {
        dayHeadingFormatter.string(from: date)
    }

    /// "2:41 PM" today, "Jun 9" otherwise — activity rows.
    public static func timeOrShortDate(_ date: Date) -> String {
        Calendar.current.isDateInToday(date) ? time(date) : shortDate(date)
    }

    /// "2 hr. ago" — abbreviated relative age; "—" when unknown.
    public static func relativeAge(_ date: Date?, relativeTo now: Date = Date()) -> String {
        guard let date else { return "—" }
        return relativeFormatter.localizedString(for: date, relativeTo: now)
    }
}
