//
//  ProjectDetailCopy.swift
//  Patina
//
//  SP-05: the homeowner's own project screen printed two strings written for
//  somebody else — a "CLIENT VIEW / Milestone" stat tile (the raw
//  `client_visibility_tier`, shown to the person it governs) and
//  "Set up phases, payments, and FF&E in the portal →", an instruction for the
//  designer, on the client's phone.
//
//  Both come out here. What is not ready yet is named in the client's own
//  words, one line per missing section.
//

import Foundation

enum ProjectDetailCopy {

    /// Key facts under the project name. `client_visibility_tier` is a policy
    /// the client is subject to, not a fact about her project — it is not here.
    static func overviewFacts(_ project: RemoteProject) -> [(String, String)] {
        var facts: [(String, String)] = []
        if let total = project.total_amount_cents ?? project.budget_cents {
            facts.append(("Budget", PatinaCurrency.formatWholeDollars(cents: total)))
        }
        if let status = project.status {
            facts.append(("Status", PhaseDisplay.statusLabel(for: status)))
        }
        if let start = project.start_date {
            facts.append(("Started", DateDisplay.fromDateString(start)))
        }
        if let target = project.target_end_date {
            facts.append(("Target", DateDisplay.fromDateString(target)))
        }
        return facts
    }

    /// One client-voiced line per section that has no data yet. Never sends a
    /// homeowner to the designer's portal.
    static func missingSectionLines(phases: Bool, payments: Bool, ffe: Bool) -> [String] {
        var lines: [String] = []
        if phases { lines.append("Your designer is still putting the phases together.") }
        if payments { lines.append("No payment schedule yet.") }
        if ffe { lines.append("No furnishings list yet.") }
        return lines
    }
}
