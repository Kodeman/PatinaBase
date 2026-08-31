//  CaptureVisitPolicy.swift
//  CaptureKit
//
//  R3-1: a wrong visit is a SYSTEMATIC error — yesterday's visit silently
//  stamping today's twenty captures is worse than today's twenty unattached
//  ones. Three mitigations live here: the 30-minute confirm, the 12-hour
//  auto-end, and the rule that a visit never resumes across a calendar day.

import Foundation

public enum CaptureVisitState: Equatable, Sendable {
    /// Shadows `Optional.none`: if this type is ever held as a
    /// `CaptureVisitState?`, `state == .none` becomes ambiguous and every such
    /// comparison has to spell out `CaptureVisitState.none`.
    case none
    case active(CaptureSessionContext)
    /// Open, but untouched for longer than `staleConfirmWindow`. The UI asks
    /// "Still at Maple St?" — Resume / End visit. R3-1's headline mitigation.
    case stale(CaptureSessionContext)

    public var context: CaptureSessionContext? {
        switch self {
        case .none: return nil
        case .active(let context), .stale(let context): return context
        }
    }

    public var isVisit: Bool { context != nil }
}

public struct CaptureVisitDraft: Equatable, Sendable {
    public var kind: FieldVisitKind
    public var kit: FieldVisitKit?
    public var label: String?
    public var projectID: String?
    public var projectName: String?
    /// project_rooms.id — the CAPTURE lane (field_captures.project_room_id).
    public var projectRoomID: String?
    /// public.rooms.id — the SCAN lane (room_scans.room_id + provenance).
    public var scanRoomID: String?
    public var room: String?
    public var projectsInMind: [String]

    public init(kind: FieldVisitKind, kit: FieldVisitKit? = nil, label: String? = nil,
                projectID: String? = nil, projectName: String? = nil,
                projectRoomID: String? = nil, scanRoomID: String? = nil,
                room: String? = nil, projectsInMind: [String] = []) {
        self.kind = kind
        self.kit = kit
        self.label = label
        self.projectID = projectID
        self.projectName = projectName
        self.projectRoomID = projectRoomID
        self.scanRoomID = scanRoomID
        self.room = room
        self.projectsInMind = projectsInMind
    }

    /// FC-R11: a walk-through is the kit with a client in the room.
    public var defaultNoteSetting: FieldNoteSetting {
        kit == .walkThrough ? .conversation : .solo
    }
}

public extension CaptureSessionContextPolicy {
    // Computed `static var`, not `static let`: a stored static property is not
    // allowed on an extension of a type declared in another file.
    static var staleConfirmWindow: TimeInterval { 30 * 60 }
    static var autoEndWindow: TimeInterval { 12 * 60 * 60 }

    /// The authority on whether a visit is still live. `resolve` carries routing
    /// memory forward on its own 4-hour window and knows nothing about calendar
    /// days, so anything that stamps a VISIT onto a capture asks here, not there.
    static func visitState(for context: CaptureSessionContext?,
                           now: Date,
                           calendar: Calendar) -> CaptureVisitState {
        guard let context, context.kind != nil, context.endedAt == nil else { return .none }
        // A BACKWARDS clock (a manual change, an NTP correction) closes the visit
        // rather than resuming it — consistent with CaptureSessionContextPolicy
        // .resolve. It does silently drop an open visit, which R3-1 accepts: a
        // WRONG visit stamping today's twenty captures is the systematic error;
        // a dropped one costs her one tap on the door.
        guard now >= context.lastActivityAt else { return .none }
        // Both windows are keyed on IDLE TIME since `lastActivityAt`, not on
        // elapsed time since `startedAt`. That is a choice: an install day that
        // runs 07:00-20:00 with a capture every hour is one real visit and must
        // not be guillotined at hour twelve. It does mean a visit she keeps
        // touching cannot age out by the 12-hour rule at all — the calendar-day
        // rule below is what bounds the damage, and it cannot be touched away.
        let idle = now.timeIntervalSince(context.lastActivityAt)
        guard idle <= autoEndWindow else { return .none }
        guard calendar.isDate(context.startedAt, inSameDayAs: now) else { return .none }
        return idle > staleConfirmWindow ? .stale(context) : .active(context)
    }

    /// WHY an open visit stopped being live without a tap. `visitState` answers
    /// "is it live"; this answers "what closed it", which is the half §14 needs
    /// and the half that was computed and thrown away — the three conditions
    /// below write nothing and emitted nothing, so `visit.start` and `visit.end`
    /// did not pair.
    ///
    /// Nil for anything that is not an OPEN visit (a kindless context, an
    /// already-ended one, no context at all) and nil while the visit is still
    /// live. Kept in lockstep with `visitState` by construction: every arm that
    /// returns `.none` there for a live-visit input has a reason here.
    static func expiry(for context: CaptureSessionContext?,
                       now: Date,
                       calendar: Calendar) -> FieldVisitEndReason? {
        guard let context, context.kind != nil, context.endedAt == nil else { return nil }
        // A backwards clock is an auto-end, not its own reason: R3-1 already
        // treats it as the same act (drop the visit rather than resume it), and
        // a fourth name would split one dashboard row for no decision.
        guard now >= context.lastActivityAt else { return .auto }
        guard now.timeIntervalSince(context.lastActivityAt) <= autoEndWindow else { return .auto }
        guard calendar.isDate(context.startedAt, inSameDayAs: now) else { return .rollover }
        return nil
    }

    static func started(_ draft: CaptureVisitDraft,
                        identity: CaptureSessionIdentity,
                        now: Date) -> CaptureSessionContext {
        CaptureSessionContext(
            identity: identity,
            startedAt: now,
            lastActivityAt: now,
            routing: CaptureRoutingMemory(
                destination: draft.kind == .sourcing ? .library : .inbox,
                projectID: draft.projectID,
                projectName: draft.projectName,
                projectRoomID: draft.projectRoomID,
                room: draft.room,
                shelf: nil),
            kind: draft.kind,
            kit: draft.kit,
            label: draft.label,
            scanRoomID: draft.scanRoomID,
            projectsInMind: draft.projectsInMind)
    }

    static func ended(_ context: CaptureSessionContext, now: Date) -> CaptureSessionContext {
        var closed = context
        closed.endedAt = now
        closed.lastActivityAt = now
        return closed
    }
}

/// Spec §7.7 — S3 is RETIRED from the default path, not deleted. It stays the
/// only caller of `sync.route()`, still reachable from V3 and from
/// `saveFromCard`'s catch: the deliberate recoverable-choice seam.
public enum FieldDestinationPolicy {
    /// Inside a visit the destination is ANSWERED, so S3 does not fire.
    /// A sourcing visit routes to Library; a site visit routes to inbox.
    public static func destination(for state: CaptureVisitState) -> CaptureDestination {
        switch state.context?.kind {
        case .sourcing: return .library
        case .site:     return .inbox
        case nil:       return .undecided
        }
    }

    /// Wave 2 held S3's recommendation at `.inbox` regardless of confidence,
    /// because removing the hardcoded guess flipped the default toward Library —
    /// including for a photo of a damaged baseboard. Wave 3 lifts that hold for
    /// EXACTLY one case: an open sourcing visit.
    public static func recommendation(for state: CaptureVisitState,
                                      hasUnconfirmedGuess: Bool) -> CaptureDestination {
        guard state.context?.kind == .sourcing, !hasUnconfirmedGuess else { return .inbox }
        return .library
    }

    /// What a NEW draft is born carrying. Routing memory is day-agnostic and
    /// deliberately survives a visit's death (`CaptureSessionContextPolicy
    /// .resolve`), so a remembered `.library` can outlive the sourcing visit
    /// that earned it — and one deliberate Library tap on S3 inside a SITE
    /// visit writes it too. Either way the stamp would walk straight around
    /// `saveFromCard`'s `== .undecided` test and auto-route to Library.
    ///
    /// Memory carries every destination except `.library`, which only an open
    /// sourcing visit grants. This only ever constrains UPWARD: a remembered
    /// `.inbox` inside a sourcing visit is her explicit choice and still wins,
    /// because inside a visit the stamp IS the decision — S3 never appears to
    /// ask her a second time.
    public static func stamp(remembered: CaptureDestination,
                             for state: CaptureVisitState) -> CaptureDestination {
        guard remembered == .library else { return remembered }
        return destination(for: state)
    }
}
