//  FieldTrayScope.swift
//  CaptureKit
//
//  Task 25 — the session tray used to say "This visit" whether or not one was
//  open. It now says what it actually holds: the open visit by name, or —
//  with none open — the unplaced tray, widened to everything not yet placed
//  from any day (FC-R6). Never "Inbox".

import Foundation

public enum FieldTrayScope: Equatable, Sendable {
    case visit(label: String)
    case unplacedOnly

    public var title: String {
        switch self {
        case .visit(let label): return label
        case .unplacedOnly: return "Not placed yet"
        }
    }

    public var footerPrimary: String {
        switch self {
        case .visit: return "End visit"
        case .unplacedOnly: return "Start a visit"
        }
    }
}

public enum FieldTrayScopeBuilder {
    /// `.stale` is idle, not closed — CaptureVisitPolicy only drops a visit to
    /// `.none` at the 12-hour auto-end or the day rollover — so it names itself
    /// exactly as `.active` does; only `.none` falls through to the unplaced tray.
    public static func scope(for state: CaptureVisitState) -> FieldTrayScope {
        switch state {
        case .active(let context), .stale(let context):
            // A labelless visit isn't spec'd here; FieldTodayBandBuilder already
            // treats a missing label as "This visit" elsewhere in the same visit,
            // so this matches that fallback instead of shipping a blank header.
            return .visit(label: context.label ?? "This visit")
        case .none:
            return .unplacedOnly
        }
    }
}
