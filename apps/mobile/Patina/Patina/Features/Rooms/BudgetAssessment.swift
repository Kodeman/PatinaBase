//
//  BudgetAssessment.swift
//  Patina
//
//  Pure-function helper that maps a room's total investment against the
//  budget its owner set, at the thresholds the Room System spec describes
//  (50% / 100% / 150%).
//
//  It used to measure against a hard-coded $2,000–$5,000 "range" declared in
//  RoomProjectView as "from user preferences / quiz; defaults for now" — a
//  figure nobody had ever given, printed under the words "Your range" (C5,
//  h1-notes.md §6.1, integration.md §6.3). W4 gives a room a real
//  `budgetCents`, so the stored number is what the bar measures; where there
//  is none, there is no bar.
//

import Foundation

public enum BudgetLevel: Hashable {
    /// Under 50% of the budget — keep the bar hidden.
    case below50
    /// 50–100% of the budget — show the bar quietly.
    case approaching
    /// 100–150% of the budget — "you're at your budget" note.
    case atRange
    /// >150% of the budget — Companion nudges the designer CTA.
    case overRange
}

public enum BudgetAssessment {

    /// The level for a room total against the budget its owner set. `nil`
    /// where she has not set one: then nothing is measured, nothing is drawn,
    /// and no range is invented for her.
    public static func level(totalCents: Int, budgetCents: Int?) -> BudgetLevel? {
        guard let budgetCents, budgetCents > 0 else { return nil }
        if totalCents < budgetCents / 2 { return .below50 }
        if totalCents <= budgetCents { return .approaching }
        if totalCents <= (budgetCents * 3 / 2) { return .atRange }
        return .overRange
    }

    /// Should the budget bar even be visible?
    public static func shouldShowBar(_ level: BudgetLevel) -> Bool {
        level != .below50
    }

    /// Companion nudge text appropriate for the current level, if any.
    public static func companionNudge(for level: BudgetLevel, roomName: String) -> String? {
        switch level {
        case .below50, .approaching: return nil
        case .atRange:               return "You're at your budget for \(roomName)"
        case .overRange:             return "Get design help with this room →"
        }
    }
}
