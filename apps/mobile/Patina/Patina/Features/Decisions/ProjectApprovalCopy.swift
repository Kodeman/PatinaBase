//
//  ProjectApprovalCopy.swift
//  Patina
//
//  `P-09`. Every word a homeowner reads on the Stage-2 approval, in one place
//  so it is a fact a test can hold rather than a string buried in a view.
//
//  The consequence lines are deliberately NOT `approval-ask.tsx`'s verbatim:
//  the web still says "Accept this exact **artifact**" and "Hold **the gate**
//  while…". "Gate" is refused on every client-facing string, and "artifact" is
//  the studio's word for the thing — the homeowner is approving an EDITION.
//

import Foundation

/// One outcome act: the verb, then what it does.
struct ProjectApprovalAct: Identifiable, Equatable {
    let outcome: ProjectApprovalOutcome
    let label: String
    let consequence: String

    var id: String { outcome.rawValue }
}

enum ProjectApprovalCopy {

    /// The three acts, in the order the client meets them.
    static let acts: [ProjectApprovalAct] = [
        ProjectApprovalAct(
            outcome: .approved,
            label: "Approve",
            consequence: "Accept this exact edition and its stated impacts."
        ),
        ProjectApprovalAct(
            outcome: .needsDiscussion,
            label: "Ask a question",
            consequence: "Hold this while you and your designer talk it through."
        ),
        ProjectApprovalAct(
            outcome: .changesRequested,
            label: "Decline",
            consequence: "Return this edition for revision and a new approval request."
        )
    ]

    static let eyebrow = "APPROVAL"

    /// What is being agreed to, and that it cannot change underneath her. The
    /// edition number is the whole point of the sentence.
    static func immutability(edition: Int) -> String {
        "You are approving edition \(edition), exactly as shown."
    }

    /// The edition, with the day it is wanted by when there is one. The title
    /// is the screen's own heading, so it is not repeated here.
    /// Never "overdue" — R8 keeps lateness out of the client's register.
    static func editionLine(edition: Int, due: String?) -> String {
        let base = "Edition \(edition)"
        guard let due else { return base }
        return "\(base) · Due \(due)"
    }

    // MARK: - The review leg

    static let reviewPrompt = "Read this exact edition, then confirm you have seen it."
    static let reviewAction = "Review exact edition"
    static let reviewConfirmed = "Review confirmed. Your designer can issue this next."
    static let awaitingStudioIssue = "Review complete. Your designer can issue this next."
    /// The frozen snapshot carried no authority revision, so there is nothing
    /// for a confirmation to bind to. That is a property of the edition, not a
    /// passing one — a retry cannot fix it, so the line does not ask for one.
    static let reviewUnavailable =
        "This edition isn’t ready to be confirmed. Your designer has to send it again."

    // MARK: - The outcome leg

    static let choosePrompt = "Choose one outcome."
    static let submitAction = "Submit response"
    static let chooseAgainAction = "Choose another outcome"

    /// The approval could not be read. The screen says so rather than falling
    /// back to the option cards, which would answer the wrong question. No
    /// retry instruction: the same branch catches a caller the projection will
    /// never open for, and telling her to pull again would be untrue.
    static let unavailable = "We couldn’t open this approval."

    // MARK: - The approval that is neither open nor hers to answer

    /// Withdrawn and superseded stand AHEAD of any outcome, the same
    /// precedence the web keeps (`client-attention.ts:55-71`).
    static let withdrawn =
        "Your designer withdrew this approval. Nothing is being asked of you here."
    static let superseded =
        "A later edition has replaced this one. This edition is closed."

    // MARK: - The answer already given

    /// One flat line naming what she answered, on a return visit. The stamp
    /// and its grammar are P-16 / P-17, in Wave 2; this is the fact alone.
    /// "Returned" is the word for `changes_requested` in prose (P-16), and
    /// "held" is the hold word (R8).
    static func recorded(_ outcome: ProjectApprovalOutcome) -> String {
        switch outcome {
        case .approved:
            return "You approved this edition."
        case .changesRequested:
            return "You returned this edition for revision."
        case .needsDiscussion:
            return "You held this edition to talk it through with your designer."
        }
    }

    // MARK: - Impact (R11)

    /// One impact row: the label and the delta, stated independently.
    struct Impact: Identifiable, Equatable {
        let label: String
        let value: String
        var id: String { label }
    }

    static let noImpact = "No cost, schedule or lead-time change."

    /// Cost, schedule and lead time side by side, each omitted where it is
    /// zero — a delta of nothing is not a fact worth a row. An edition that
    /// changes none of the three says so in one line instead of drawing blank.
    static func impacts(
        costCentsDelta: Int, scheduleDaysDelta: Int, leadTimeDaysDelta: Int
    ) -> [Impact] {
        var rows: [Impact] = []
        if costCentsDelta != 0 {
            rows.append(Impact(label: "Cost", value: money(costCentsDelta)))
        }
        if scheduleDaysDelta != 0 {
            rows.append(Impact(label: "Schedule", value: days(scheduleDaysDelta)))
        }
        if leadTimeDaysDelta != 0 {
            rows.append(Impact(label: "Lead time", value: days(leadTimeDaysDelta)))
        }
        return rows
    }

    /// "+$1,200" / "−$450" — whole dollars, the app-wide convention, with the
    /// typographic minus the house uses rather than a hyphen.
    ///
    /// `PatinaCurrency.formatWholeDollars` rather than a "$" typed in front of
    /// a decimal figure, and it ROUNDS where the old integer divide truncated.
    /// The homeowner reads the same delta in her email and on the web, where
    /// `moneyInWords` (`standing-sentence.ts:148`) is `Intl.NumberFormat` at
    /// `maximumFractionDigits: 0` over `cents / 100` — so $1,250.60 has to read
    /// "$1,251" on both, and 99 cents of change has to stop reading "+$0" under
    /// a row that exists only because the cost changed.
    static func money(_ cents: Int) -> String {
        let figure = PatinaCurrency.formatWholeDollars(cents: abs(cents))
        return "\(cents > 0 ? "+" : "−")\(figure)"
    }

    /// "+3 days" / "−1 day".
    static func days(_ days: Int) -> String {
        let whole = abs(days)
        return "\(days > 0 ? "+" : "−")\(whole) \(whole == 1 ? "day" : "days")"
    }
}
