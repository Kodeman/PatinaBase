//
//  DecisionDeferral.swift
//  Patina
//
//  SP-17: a decision offered two choice buttons and nothing else — no way to
//  say "not yet" and no way to say "neither of these", which are the two
//  answers a real client gives.
//
//  Neither needs a new decision state. `client_decisions.status` is
//  CHECK-constrained to draft|pending|responded|expired
//  (00062_client_management_v2.sql:80-81), and a deferral is not a response —
//  it is a message. Both acts write a note into the project thread and leave
//  the decision `pending`, which is exactly what the designer needs to see.
//

import Foundation

enum DecisionDeferral: String, CaseIterable, Identifiable {
    case notYet
    case neitherOfThese

    var id: String { rawValue }

    var actLabel: String {
        switch self {
        case .notYet: return "Not yet"
        case .neitherOfThese: return "Neither of these"
        }
    }

    /// The sheet's own title.
    var sheetTitle: String {
        switch self {
        case .notYet: return "Not yet"
        case .neitherOfThese: return "Neither of these"
        }
    }

    /// The note the client sends, with the decision named so the designer
    /// knows which one it is about. Editable before it goes.
    func draft(decisionTitle: String?) -> String {
        let subject = decisionTitle.flatMap { $0.isEmpty ? nil : $0 } ?? "this decision"
        switch self {
        case .notYet:
            return "About \(subject) — not yet. I need a little more time before I decide."
        case .neitherOfThese:
            return "About \(subject) — neither of these is right for me. Could you show me something else?"
        }
    }
}

/// SP-17: the option card's copy when there is nothing to render. The old
/// fallback sent a homeowner to the designer's portal, which she cannot open.
enum DecisionOptionCopy {
    static let unavailableLine = "Your designer is still adding this option."
    static let allUnavailableLine = "Your designer is still adding the options."

    /// `W1-B-03`. A decision can arrive with **no options row at all**, and the
    /// detail screen then drew nothing between the header and the two deferral
    /// acts — so the fixture's overdue "Design Development sign-off — drawing
    /// set B" offered a client only "Not yet", "Neither of these" and "Discuss
    /// this with your designer", and read as a screen whose approve button had
    /// gone missing.
    ///
    /// It has not gone missing; there is nothing for it to submit. The one RPC
    /// the client app has, `apply_client_decision`, takes a
    /// `p_selected_option_id` and raises `insufficient_privilege` unless the
    /// decision's `coordination_kind = 'selection'`; this row is `'signoff'`
    /// with no options and no `approval_contract`, so no client-reachable path
    /// can resolve it. Drawing an Approve button here would ship a control that
    /// 403s. The screen says what is true instead, and leaves the two acts that
    /// do work.
    static let nothingToChooseYetLine =
        "There is nothing to choose here yet — your designer has not added the options."
}
