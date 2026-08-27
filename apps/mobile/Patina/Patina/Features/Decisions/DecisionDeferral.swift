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
}
