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

    /// W4 (F76/F125): which phase the project is actually on, so the timeline
    /// can mark it. `projects.current_phase` is the designer's own answer and
    /// wins. Failing that, a single `in_progress` row is unambiguous enough to
    /// stand in for it.
    ///
    /// Two rows claiming `in_progress` is not an answer, and nothing is marked
    /// — the timeline still draws every phase in order, it just does not
    /// invent a position the server never took.
    /// A phase the project names as current whose own row says `completed` is
    /// two server facts arguing on one line — `CURRENT / Design / Completed`.
    /// Neither is invented, and the app has no way to know which one the
    /// designer meant, so it marks nothing: the row still prints its own
    /// status, and the timeline does not put a contradiction in front of the
    /// reader (C5). Fall through to the unambiguous `in_progress` row, if
    /// there is one.
    static func currentPhaseId(
        phases: [RemoteProjectPhase],
        currentPhaseKey: String?
    ) -> String? {
        if let currentPhaseKey,
           let named = phases.first(where: { $0.phase_key == currentPhaseKey }),
           named.status?.lowercased() != "completed" {
            return named.id
        }
        let running = phases.filter { $0.status?.lowercased() == "in_progress" }
        return running.count == 1 ? running.first?.id : nil
    }

    /// The fee a phase actually carries. A stored `0` is not a fee — it is
    /// the designer not having priced the phase — and a column of `$0` beside
    /// five real phases says something the project does not (integration.md
    /// §6.7). Nothing to say, nothing drawn.
    static func phaseFee(cents: Int?, format: (Int) -> String) -> String? {
        guard let cents, cents != 0 else { return nil }
        return format(cents)
    }

    /// What VoiceOver reads for one timeline row. The row is combined into a
    /// single element, so this string is the whole row: leave the fee out and
    /// a money figure that is on screen is silent for the reader who most
    /// needs it spoken.
    static func phaseVoiceLabel(
        name: String,
        statusLine: String,
        isCurrent: Bool,
        fee: String?
    ) -> String {
        let prefix = isCurrent ? "Current phase. " : ""
        let feeSuffix = fee.map { " \($0)." } ?? ""
        return "\(prefix)\(name). \(statusLine)\(feeSuffix)"
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
