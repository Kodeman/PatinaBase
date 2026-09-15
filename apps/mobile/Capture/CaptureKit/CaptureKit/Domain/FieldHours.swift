//  FieldHours.swift
//  CaptureKit
//
//  "My hours this week", read-only, on the Work screen (plan-v2 §7, W6).
//
//  ⚠ OWN SCOPE ONLY, and that is a rule rather than a v1 shortcut (MOB-8). The
//  desk's scope lens (W2) answers project · member · studio for an owner sitting
//  down; this is a camera-first, one-handed screen handed to trades, and a
//  studio total on it is both the wrong question and someone else's pay. The
//  service reads the signed-in author's own rows and nothing else.
//
//  No dashboard, no badge, no colour-coded state: a total above the rows that
//  produced it (HT-30) and plain words under it.

import Foundation

/// One logged hour as this phone shows it back: day · project · minutes ·
/// activity · what it is worth. Read-only — Field edits no entry it has already
/// filed; the desk owns correction.
public struct FieldHourRow: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let startedAt: Date
    public let projectName: String?
    public let minutes: Int
    public let activity: FieldTimeActivity?
    public let billable: Bool
    /// `project_time_entries.billing_state` — 'authorized' /
    /// 'pending_authorization' (00412).
    public let billingState: String?
    /// `rate_source` (00600) — 'authority' / 'studio_member' / 'none', and NIL
    /// for every row written before 00600. NULL is not 'none': P-4 backfills
    /// nothing, so on Strata today every row is NULL and most of them carry a
    /// real legacy `hourly_rate_cents`.
    public let rateSource: String?
    /// `hourly_rate_cents` (00177) — the snapshot that priced the hour, nil or
    /// 0 where nothing did. R3-m2: without it this phone cannot tell a legacy
    /// row that IS priced from one that was never priced, and printed
    /// "Billable" over both.
    public let hourlyRateCents: Int?

    public init(id: UUID, startedAt: Date, projectName: String?, minutes: Int,
                activity: FieldTimeActivity?, billable: Bool,
                billingState: String?, rateSource: String?,
                hourlyRateCents: Int? = nil) {
        self.id = id
        self.startedAt = startedAt
        self.projectName = projectName
        self.minutes = max(0, minutes)
        self.activity = activity
        self.billable = billable
        self.billingState = billingState
        self.rateSource = rateSource
        self.hourlyRateCents = hourlyRateCents
    }
}

public enum FieldHoursWeek {
    /// Monday-first, because a studio week is. `Calendar.current` disagrees by
    /// locale, so the first weekday is stated rather than inherited — otherwise
    /// the same phone shows a different week abroad.
    public static func start(containing date: Date,
                             calendar: Calendar = Calendar(identifier: .gregorian),
                             timeZone: TimeZone = .current) -> Date {
        var calendar = calendar
        calendar.timeZone = timeZone
        calendar.firstWeekday = 2
        let startOfDay = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: startOfDay)
        let back = (weekday - calendar.firstWeekday + 7) % 7
        return calendar.date(byAdding: .day, value: -back, to: startOfDay) ?? startOfDay
    }

    /// Newest first. The hour she just logged is the one she is looking for.
    public static func ordered(_ rows: [FieldHourRow]) -> [FieldHourRow] {
        rows.sorted { $0.startedAt > $1.startedAt }
    }

    public static func totalMinutes(_ rows: [FieldHourRow]) -> Int {
        rows.reduce(0) { $0 + $1.minutes }
    }

    /// HT-30 — the total sits ABOVE the rows that produced it. A total with no
    /// rows beneath it is a dashboard, and this returns nil rather than being
    /// one.
    public static func totalLabel(_ rows: [FieldHourRow]) -> String? {
        guard !rows.isEmpty else { return nil }
        return FieldLogTimeDraft.durationLabel(minutes: totalMinutes(rows))
    }

    /// "Mon". Day-of-week alone: the rows are one week long, so a date would be
    /// more characters saying less.
    public static func dayLabel(_ date: Date,
                                calendar: Calendar = Calendar(identifier: .gregorian),
                                timeZone: TimeZone = .current) -> String {
        var calendar = calendar
        calendar.timeZone = timeZone
        let index = calendar.component(.weekday, from: date) - 1
        let symbols = calendar.shortWeekdaySymbols
        guard index >= 0, index < symbols.count else { return "" }
        return symbols[index]
    }

    /// What the hour is worth, in words she can act on. HT-26: "rate pending" is
    /// printed rather than left blank, because a blank made "legitimately
    /// non-billable" and "this hire has no rate" look identical.
    ///
    /// R3-m2 (integration round 3) — this mirrors the desk's `timeRateProvenance`
    /// (`authority-hours.ts`), which keys on the RATE VALUE first, not on
    /// `rate_source`. A NULL `rate_source` is a pre-00600 row of unknown
    /// provenance, and it is not the same fact as `'none'`:
    ///
    ///   · a rate, whatever the source   → "Billable" / "Awaiting authorization"
    ///   · `rate_source = 'none'`        → "Rate pending"   (the resolver looked
    ///                                      and found no card)
    ///   · NULL source and no rate       → "Rate not recorded"  (nobody ever
    ///                                      looked; a legacy row)
    ///
    /// Before this, a NULL-source row fell straight through to "Billable" — a
    /// promise of money on an hour nothing had priced.
    public static func worthLabel(_ row: FieldHourRow) -> String {
        guard row.billable else { return "Not billable" }
        let priced = (row.hourlyRateCents ?? 0) > 0
        if priced {
            if row.billingState == "pending_authorization" { return "Awaiting authorization" }
            return "Billable"
        }
        if row.rateSource == "none" { return "Rate pending" }
        return "Rate not recorded"
    }

    /// "Drive" / "Activity not set" — HT-24, never a silent "Design".
    public static func activityLabel(_ row: FieldHourRow) -> String {
        row.activity?.label ?? "Activity not set"
    }
}

/// The read half of Field's hours. Separate from `TimeEntryGateway` (the write
/// half) because they are different jobs with different failure modes: a write
/// that cannot land is queued, a read that cannot land is simply absent.
public protocol FieldHoursService: Sendable {
    /// The signed-in author's OWN entries since `since`. Never another member's
    /// — see the file header.
    func myHours(since: Date) async throws -> [FieldHourRow]

    /// HT-41 — the live roster roles this member holds on one project, filtered
    /// to the four a rate card can price. More than one is what raises the role
    /// chip; one or none leaves the role to the server.
    func myRateRoles(projectID: String) async throws -> [FieldRateRole]
}
