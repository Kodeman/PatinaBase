//  FieldLogTime.swift
//  CaptureKit
//
//  An hour that is not a visit (plan-v2 §7, W6). Until now Patina Field could
//  log exactly one thing — a just-closed visit, with a project attached, under
//  the single word `site_visit`. The drive between two houses, the call from
//  the truck, the sourcing run, the admin hour: no surface anywhere (MOB-1,
//  VET-4, LEAH-1, OPS-10).
//
//  Everything the sheet decides lives here, as values, so `capture-gate.sh`
//  actually covers it: the gate's test step runs `-scheme CaptureKit` alone, and
//  anything left in the app-side view is proven by a device pass and nothing
//  else.
//
//  ⚠ HT-7 — Field never owns the running-timer slot. `durationMinutes` is a
//  plain Int with a floor of 1 and no nil-shaped state, on purpose: the slot is
//  a partial UNIQUE index on (user_id) WHERE duration_minutes IS NULL
//  (00177:39-41) and it stays with the desk in v1. The active-visit pre-fill is
//  a SNAPSHOT taken when the sheet opens — it feels like a timer without being
//  one.

import Foundation

/// `project_time_entries.activity` (00198, widened by 00616). `travel` is the
/// new one: LEAH-1 was the only seat that walked the day, and the drive was the
/// part of the hour Patina could never name.
public enum FieldTimeActivity: String, CaseIterable, Equatable, Sendable {
    case travel
    case siteVisit = "site_visit"
    case sourcing
    case client
    case design
    case admin

    public var label: String {
        switch self {
        case .travel:    return "Drive"
        case .siteVisit: return "Site visit"
        case .sourcing:  return "Sourcing"
        case .client:    return "Client"
        case .design:    return "Design"
        case .admin:     return "Admin"
        }
    }
}

/// The four roster roles a rate card can price (`project_team_members.role`,
/// 00084:164-165, minus `client`). Mirrors `rate_role`'s CHECK in 00600.
public enum FieldRateRole: String, CaseIterable, Equatable, Sendable {
    case leadDesigner = "lead_designer"
    case supportDesigner = "support_designer"
    case bookkeeper
    case vendor

    public var label: String {
        switch self {
        case .leadDesigner:    return "Lead designer"
        case .supportDesigner: return "Support designer"
        case .bookkeeper:      return "Bookkeeper"
        case .vendor:          return "Vendor"
        }
    }
}

/// One hour, as the sheet holds it. Three fields and three taps: the project is
/// pre-filled from the open visit, the duration from how long that visit has
/// been open, and the activity is one chip.
public struct FieldLogTimeDraft: Equatable, Sendable {
    public var projectID: String?
    public var projectName: String?
    /// HT-13 — any date. The server bounds it at "until the entry is invoiced"
    /// (guard_invoiced_time_entry, 00177:51-84), so nothing here has to.
    public var startedAt: Date
    /// Never nil, never below `minimumMinutes`, never above `maximumMinutes`.
    public private(set) var durationMinutes: Int
    public var activity: FieldTimeActivity
    /// HT-11 — the sheet always states it. There is no "unset" value to send.
    public var billable: Bool
    public var notes: String
    /// HT-41 — set only when she holds more than one roster role on this
    /// project. nil means "the server decides", which is every single-role
    /// member and the project's own designer.
    public var rateRole: FieldRateRole?

    /// A quarter-hour step: the unit a studio actually bills in, and the one
    /// that keeps this to taps rather than typing on a phone held in one hand.
    public static let stepMinutes = 15
    /// CHECK (duration_minutes IS NULL OR duration_minutes > 0) — 00177:20.
    public static let minimumMinutes = 1
    /// A day's bound. Not a rule about her — a bound on a stepper held down by
    /// a thumb in a truck, so one long press cannot bill sixty hours.
    public static let maximumMinutes = 12 * 60
    /// What a drive is, before she says otherwise.
    public static let defaultMinutes = 30

    public init(projectID: String? = nil,
                projectName: String? = nil,
                startedAt: Date,
                durationMinutes: Int = FieldLogTimeDraft.defaultMinutes,
                activity: FieldTimeActivity = .travel,
                billable: Bool = true,
                notes: String = "",
                rateRole: FieldRateRole? = nil) {
        self.projectID = projectID
        self.projectName = projectName
        self.startedAt = startedAt
        self.durationMinutes = Self.clamp(durationMinutes)
        self.activity = activity
        self.billable = billable
        self.notes = notes
        self.rateRole = rateRole
    }

    /// The pre-fill. An ACTIVE visit hands over both answers at once: its
    /// project, and how long it has been open today. Nothing is started and
    /// nothing keeps running — this reads the clock once (R69: no per-second
    /// motion).
    ///
    /// A STALE, ended or absent visit contributes NEITHER: her drive is not the
    /// six hours since she last touched a visit she forgot to end. The argument
    /// is `CaptureVisitState`, not a bare context, precisely because
    /// `CaptureVisitState.context` is non-nil for `.stale` too — taking the
    /// context alone is how the wall clock got back in.
    ///
    /// HT-16 binds every surface that proposes a duration, not only the desk.
    /// `.active` is what bounds this one: `CaptureSessionContextPolicy
    /// .visitState` only returns it while the visit was touched inside the
    /// 30-minute window AND opened on today's calendar date, so the wall clock
    /// it hands over is a span she is demonstrably still working. It is NOT
    /// bounded by `lastActivityAt` the way `VisitReviewComposer.activeMinutes`
    /// is bounded by the last capture: there the offer IS the visit, here the
    /// hour being logged is the un-captured tail — the drive away from the
    /// house — and the last capture is exactly the wrong end of it.
    public init(visit state: CaptureVisitState, now: Date) {
        guard case .active(let visit) = state, visit.isVisit else {
            self.init(
                startedAt: now.addingTimeInterval(-Double(Self.defaultMinutes) * 60),
                durationMinutes: Self.defaultMinutes,
                activity: .travel)
            return
        }
        self.init(
            projectID: visit.routing.projectID?.nilIfBlank,
            projectName: visit.routing.projectName?.nilIfBlank ?? visit.label?.nilIfBlank,
            startedAt: visit.startedAt,
            durationMinutes: Int((now.timeIntervalSince(visit.startedAt) / 60).rounded()),
            activity: .travel)
    }

    /// An hour with no project is an hour `project_time_entries` cannot file:
    /// internal studio time (00610) names a studio instead, and Patina Field
    /// has no studio picker. The act is held, never taken and thrown away —
    /// CR-1's failure was a form that accepted input and saved nothing.
    public var canLog: Bool {
        (projectID?.nilIfBlank) != nil
    }

    public mutating func step(by minutes: Int) {
        durationMinutes = Self.clamp(durationMinutes + minutes)
    }

    public mutating func setDuration(_ minutes: Int) {
        durationMinutes = Self.clamp(minutes)
    }

    public var canStepDown: Bool { durationMinutes > Self.minimumMinutes }
    public var canStepUp: Bool { durationMinutes < Self.maximumMinutes }

    public static func clamp(_ minutes: Int) -> Int {
        min(maximumMinutes, max(minimumMinutes, minutes))
    }

    /// "1h 30m". The same spelling `VisitReviewComposer.timeOffer` uses, so the
    /// two hour surfaces on this phone read alike.
    public var durationLabel: String { Self.durationLabel(minutes: durationMinutes) }

    public static func durationLabel(minutes: Int) -> String {
        let minutes = clamp(minutes)
        let hours = minutes / 60
        let mins = minutes % 60
        if hours == 0 { return "\(mins)m" }
        if mins == 0 { return "\(hours)h" }
        return "\(hours)h \(mins)m"
    }

    /// The durable record this draft becomes. nil when there is nothing to file
    /// it against — the same guard `canLog` shows her, applied where it cannot
    /// be skipped.
    public func record(entryID: UUID, ownerUserID: UUID,
                       now: Date = Date()) -> TimeEntryOutboxRecord? {
        guard let projectID = projectID?.nilIfBlank else { return nil }
        return TimeEntryOutboxRecord(
            entryID: entryID,
            projectID: projectID,
            ownerUserID: ownerUserID.uuidString,
            startedAt: startedAt,
            durationMinutes: durationMinutes,
            activity: activity,
            billable: billable,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).nilIfBlank,
            rateRole: rateRole,
            source: FieldTimeSource.fieldManual,
            createdAt: now)
    }
}

public enum FieldLogTimePolicy {
    /// HT-41. One role is not a choice — the server derives it and asking would
    /// be a tap that decides nothing. The chip appears only above one.
    public static func showsRoleChip(roles: [FieldRateRole]) -> Bool {
        roles.count > 1
    }

    /// What the draft should carry given what she picked and what she actually
    /// holds. A role she does not hold RAISES server-side (00601), so it is
    /// dropped here rather than sent — and a single-role member sends nil, which
    /// is the server deciding.
    public static func resolvedRole(picked: FieldRateRole?,
                                    roles: [FieldRateRole]) -> FieldRateRole? {
        guard showsRoleChip(roles: roles), let picked, roles.contains(picked) else {
            return nil
        }
        return picked
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
