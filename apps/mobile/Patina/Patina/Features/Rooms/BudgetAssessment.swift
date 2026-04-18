//
//  BudgetAssessment.swift
//  Patina
//
//  Pure-function helper that maps a room's total investment against the
//  user's stated budget range into the thresholds described in the Room
//  System spec (50% / 100% / 150%).
//

import Foundation

public enum BudgetLevel: Hashable {
    /// Under 50% of the user's minimum — keep the bar hidden.
    case below50
    /// 50–100% of the range — show the bar quietly.
    case approaching
    /// 100–150% of the max — "you're at your budget" note.
    case atRange
    /// >150% of the max — Companion nudges the designer CTA.
    case overRange
}

public enum BudgetAssessment {

    /// Compute the level for a given room total relative to a stated range.
    public static func level(totalCents: Int, minCents: Int, maxCents: Int) -> BudgetLevel {
        guard maxCents > 0, minCents >= 0 else { return .below50 }
        let halfOfMin = minCents / 2
        if totalCents < halfOfMin { return .below50 }
        if totalCents <= maxCents { return .approaching }
        if totalCents <= (maxCents * 3 / 2) { return .atRange }
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
        case .overRange:             return "Work with a designer on \(roomName) →"
        }
    }
}
