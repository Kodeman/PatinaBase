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

    /// "Past due · Aug 22" / "Due today" / "Due Sep 1". Day precision — a
    /// Postgres `date` carries no time, and the ISO8601 formatters reject it
    /// outright (the trap `isAwaitingSignature` documents).
    ///
    /// `iosa R3-02`: "Overdue" is refused on every surface a homeowner reads,
    /// money included, and this line printed it in the error ramp on the
    /// invoice list, the invoice detail and the Studio's money row. The fact —
    /// the date has passed — is what a debt gets to state; the register it
    /// states it in is body ink, the same as everywhere else (ruled,
    /// 2026-09-05). `isPastDue` survives: the ordering and the payable filters
    /// read it, and it is no longer a colour.
    static func due(_ raw: String?, now: Date = Date()) -> DueLine? {
        guard let date = parsed(raw) else { return nil }
        return due(date, now: now)
    }

    static func due(_ date: Date, now: Date = Date()) -> DueLine {
        let calendar = Calendar.current
        let day = calendar.startOfDay(for: date)
        let today = calendar.startOfDay(for: now)
        if day < today { return DueLine(text: "Past due · \(short(date))", isPastDue: true) }
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

    // MARK: - P-04 / R8 · an approval that has passed its date

    /// R8's sentence, composed in one place: "Still open, Leah asked on
    /// Aug 22." `due(_:)` above keeps its own past-due wording for money —
    /// an unpaid invoice is a debt and names itself as one — but an
    /// unanswered approval is a question the studio is still waiting on, and
    /// this program retired the other word for it.
    static func stillOpen(designer: String?, askedOn day: String) -> String {
        "Still open, \(designer ?? "your designer") asked on \(day)."
    }

    /// The same sentence with nothing to hang the clause on.
    static let stillOpenAlone = "Still open."

    /// `W1R2-n1`: whether the asked-on clause has a story to tell.
    ///
    /// "Still open, Leah asked on Sep 4." under a date of Sep 4 says the
    /// studio asked and ran out of time in the same breath. The clause earns
    /// its place only where the studio asked BEFORE the day it wanted an
    /// answer by, and where the wire carried both days at all.
    ///
    /// `W1R2-M2`: this is a seam because there are two composers. `approval`
    /// below is one; `HouseRecordCard`, which formats the Record's dates in a
    /// fixed locale of its own, is the other. One guard, so Today and the
    /// Studio hub cannot print different sentences about one approval.
    static func askedOnClauseEarned(
        askedAt: Date?,
        dueDate: Date?,
        calendar: Calendar = .current
    ) -> Bool {
        guard let askedAt, let dueDate else { return false }
        return calendar.startOfDay(for: askedAt) < calendar.startOfDay(for: dueDate)
    }

    /// The one line an unresolved approval prints under its title.
    struct ApprovalLine: Equatable {
        let text: String
        /// True once the date has passed. Drives body ink instead of muted —
        /// never the error ramp, which stays money's.
        let isStillOpen: Bool
    }

    static func approval(
        due dueDate: Date?,
        askedAt: Date?,
        designer: String? = nil,
        now: Date = Date()
    ) -> ApprovalLine? {
        guard let dueDate else { return nil }
        let calendar = Calendar.current
        guard calendar.startOfDay(for: dueDate) < calendar.startOfDay(for: now) else {
            return ApprovalLine(text: due(dueDate, now: now).text, isStillOpen: false)
        }
        // The sentence names the day the studio asked, never the day that
        // passed. With no asked-on date on the wire — or with one the guard
        // above refuses — it says only what it knows and invents nothing.
        guard let askedAt,
              askedOnClauseEarned(askedAt: askedAt, dueDate: dueDate, calendar: calendar)
        else { return ApprovalLine(text: stillOpenAlone, isStillOpen: true) }
        return ApprovalLine(
            text: stillOpen(designer: designer, askedOn: short(askedAt)),
            isStillOpen: true
        )
    }

    static func approval(
        dueDate: String?,
        askedAt: String?,
        designer: String? = nil,
        now: Date = Date()
    ) -> ApprovalLine? {
        approval(due: parsed(dueDate), askedAt: parsed(askedAt), designer: designer, now: now)
    }

    private static func parsed(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return ISO8601DateParsing.dateOrDay(from: raw)
    }
}
