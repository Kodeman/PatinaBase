//
//  ProposalSignTerms.swift
//  Patina
//
//  SP-04: the e-signature sheet restated nothing — a name field and a button
//  over a document the client had to remember. This composes the terms being
//  agreed to from fields the bundle already returned: the project, the total,
//  the deposit line, the payment terms and the expiry.
//
//  Nothing here is invented. Every line is a value the RPC sent or it is
//  absent — the client signs what the server said, never what the app
//  composed (SP-04's risk note; C5).
//

import Foundation

struct ProposalSignTerms: Equatable {
    let projectName: String?
    let total: String?
    let deposit: String?
    let terms: String?
    let expiry: String?

    /// Label/value pairs in signing order, omitting every field the bundle
    /// left null.
    var lines: [(label: String, value: String)] {
        var out: [(String, String)] = []
        if let projectName { out.append(("Project", projectName)) }
        if let total { out.append(("Total", total)) }
        if let deposit { out.append(("Deposit", deposit)) }
        if let terms { out.append(("Terms", terms)) }
        if let expiry { out.append(("Expiry", expiry)) }
        return out
    }

    static let empty = ProposalSignTerms(
        projectName: nil, total: nil, deposit: nil, terms: nil, expiry: nil
    )

    static func make(
        proposal: RemoteProposal?,
        milestones: [RemoteProposalMilestone]
    ) -> ProposalSignTerms {
        guard let proposal else { return .empty }

        let projectName = proposal.project?.name.flatMap { $0.isEmpty ? nil : $0 }
        let total = proposal.total_amount.map { PatinaCurrency.format(cents: $0) }
        let expiry = proposal.valid_until.flatMap { raw -> String? in
            guard ISO8601DateParsing.dateOrDay(from: raw) != nil else { return nil }
            return "Expires \(DateDisplay.fromTimestamp(raw))"
        }

        return ProposalSignTerms(
            projectName: projectName,
            total: total,
            deposit: depositLine(milestones: milestones),
            terms: PaymentTermsDisplay.label(for: proposal.payment_terms),
            expiry: expiry
        )
    }

    /// The first milestone by sort order — the deposit the client is agreeing
    /// to pay. Rendered only when the milestone carries a stored amount; a
    /// percentage alone is the designer's schedule, not a figure to sign.
    private static func depositLine(milestones: [RemoteProposalMilestone]) -> String? {
        let ordered = milestones.sorted { ($0.sort_order ?? 0) < ($1.sort_order ?? 0) }
        guard let first = ordered.first,
              let amount = first.amount_cents, amount > 0 else { return nil }
        let label = first.label.flatMap { $0.isEmpty ? nil : $0 } ?? "Deposit"
        return "\(label) — \(PatinaCurrency.format(cents: amount))"
    }
}
