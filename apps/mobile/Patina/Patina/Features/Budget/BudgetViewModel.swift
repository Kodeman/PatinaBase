//
//  BudgetViewModel.swift
//  Patina
//
//  Wave 3 / D.3: the cross-project money picture. Pure composition over the
//  Wave 2 money-rail clients — no new tables, no new wire models. Mirrors the
//  client portal's /budget page (apps/client-portal/src/app/budget):
//
//   • Investment: each ACCEPTED proposal's `total_amount` (cents), grouped by
//     project — never summed across proposals (portal renders one line each).
//   • Payment schedule: client-safe milestones embedded by
//     `list_client_proposals`, display-only (no paid/unpaid state — the real
//     status lives in the invoices rollup). Amount resolves to the stored
//     `amount_cents`, or a percentage of the proposal total when that's
//     non-positive.
//   • Invoices rollup: over VISIBLE invoices (not draft/void),
//       paid        = Σ amount_paid_cents
//       outstanding = Σ max(total_cents − amount_paid_cents, 0)
//       billed      = Σ total_cents
//     computed both per-project and as one cross-project summary (the iOS
//     screen leads with the summary the portal leaves implicit).
//
//  Everything is read-only; the proposal RPC boundary plus RLS on invoices and
//  projects scope the data to this client. `BudgetMath` is a pure, unit-tested
//  seam.
//

import Foundation

// MARK: - Aggregation math (pure, unit-tested)

/// Pure budget aggregation — mirrors `apps/client-portal/src/app/budget/rollup.ts`
/// and `packages/shared/src/invoice/invoiceBalanceCents`. No I/O so it can be
/// exercised directly in `BudgetAggregationTests`.
enum BudgetMath {

    /// A visible invoice counts toward the rollup: not a draft, not voided.
    /// (RLS already hides drafts from the client; void is filtered here.)
    static func isVisible(_ invoice: RemoteInvoice) -> Bool {
        invoice.status != "draft" && invoice.status != "void"
    }

    /// Cross-cutting totals over a set of invoices (filters to visible first).
    static func rollup(_ invoices: [RemoteInvoice]) -> BudgetSummary {
        let visible = invoices.filter(isVisible)
        let billed = visible.reduce(0) { $0 + ($1.total_cents ?? 0) }
        let paid = visible.reduce(0) { $0 + ($1.amount_paid_cents ?? 0) }
        // balanceCents == max(total − paid, 0) — the same clamp the portal uses.
        let outstanding = visible.reduce(0) { $0 + $1.balanceCents }
        return BudgetSummary(billedCents: billed, paidCents: paid, outstandingCents: outstanding)
    }

    /// Per-milestone display amount: the stored `amount_cents` when positive,
    /// else a percentage of the proposal total (portal fallback).
    static func milestoneAmountCents(_ milestone: RemoteProposalMilestone, totalCents: Int) -> Int {
        if let amount = milestone.amount_cents, amount > 0 { return amount }
        let percentage = milestone.percentage ?? 0
        return Int((Double(totalCents) * percentage / 100).rounded())
    }

    /// Build per-project sections in the project spine's order (newest project
    /// first, matching the portal), including any money-bearing project the
    /// spine somehow didn't return. Projects with neither an accepted proposal
    /// nor a visible invoice are omitted. Pure — lives here (not on the
    /// `@MainActor` view model) so it stays directly unit-testable.
    static func buildSections(
        projects: [RemoteProject],
        acceptedProposals: [RemoteProposal],
        milestonesByProposal: [String: [RemoteProposalMilestone]],
        visibleInvoices: [RemoteInvoice]
    ) -> [BudgetProjectSection] {
        // Names: prefer the spine, then fall back to whatever the proposals /
        // invoices embedded, so an orphan money-bearing project still reads.
        var nameByProject: [String: String] = [:]
        for project in projects { nameByProject[project.id] = project.name }
        for proposal in acceptedProposals {
            if let pid = proposal.project_id, nameByProject[pid] == nil {
                nameByProject[pid] = proposal.project?.name ?? "Project"
            }
        }
        for invoice in visibleInvoices {
            if let pid = invoice.project_id, nameByProject[pid] == nil {
                nameByProject[pid] = invoice.project?.name ?? "Project"
            }
        }

        // Ordered id list: spine order first, then any remaining money-bearing.
        var orderedIds: [String] = projects.map(\.id)
        var seen = Set(orderedIds)
        for pid in acceptedProposals.compactMap(\.project_id) where seen.insert(pid).inserted {
            orderedIds.append(pid)
        }
        for pid in visibleInvoices.compactMap(\.project_id) where seen.insert(pid).inserted {
            orderedIds.append(pid)
        }

        return orderedIds.compactMap { pid in
            let proposals = acceptedProposals
                .filter { $0.project_id == pid }
                .map { proposal in
                    BudgetProposal(
                        id: proposal.id,
                        title: proposal.title ?? "Proposal",
                        totalCents: proposal.total_amount ?? 0,
                        paymentTerms: proposal.payment_terms,
                        paymentNotes: proposal.payment_notes,
                        milestones: (milestonesByProposal[proposal.id] ?? [])
                            .sorted { ($0.sort_order ?? 0) < ($1.sort_order ?? 0) }
                    )
                }
            let invoices = visibleInvoices.filter { $0.project_id == pid }
            guard !proposals.isEmpty || !invoices.isEmpty else { return nil }
            return BudgetProjectSection(
                id: pid,
                name: nameByProject[pid] ?? "Project",
                proposals: proposals,
                invoices: invoices,
                rollup: BudgetMath.rollup(invoices)
            )
        }
    }
}

// MARK: - View models

/// Cross-project totals (billed / paid / outstanding), all in cents.
struct BudgetSummary {
    let billedCents: Int
    let paidCents: Int
    let outstandingCents: Int

    static let zero = BudgetSummary(billedCents: 0, paidCents: 0, outstandingCents: 0)

    var hasActivity: Bool { billedCents > 0 || paidCents > 0 }
}

/// One accepted proposal's investment line + its signed payment schedule.
struct BudgetProposal: Identifiable {
    let id: String
    let title: String
    let totalCents: Int
    let paymentTerms: String?
    let paymentNotes: String?
    let milestones: [RemoteProposalMilestone]
}

/// A project's slice of the money picture: accepted proposals + its invoices.
struct BudgetProjectSection: Identifiable {
    let id: String
    let name: String
    let proposals: [BudgetProposal]
    /// Visible invoices for this project, newest first.
    let invoices: [RemoteInvoice]
    let rollup: BudgetSummary
}

@Observable
@MainActor
final class BudgetViewModel {
    var sections: [BudgetProjectSection] = []
    var summary: BudgetSummary = .zero
    var isLoading: Bool = false
    var error: String?

    var isEmpty: Bool { sections.isEmpty }

    func load() async {
        isLoading = true
        error = nil

        async let projectsFetch = try? ProjectsAPIClient.shared.listProjects()
        async let proposalsFetch = try? ProposalsAPIClient.shared.listProposals()
        async let invoicesFetch = try? InvoicesAPIClient.shared.listInvoices()
        let (projects, proposals, invoices) = await (projectsFetch, proposalsFetch, invoicesFetch)

        // All three failing (nil) is a real error; an empty-but-present result
        // is a legitimate "no budget yet" state.
        if projects == nil, proposals == nil, invoices == nil {
            self.error = "Couldn't load your budget"
            self.isLoading = false
            #if DEBUG
            PatinaLog.ui.error("[Budget] all sources failed")
            #endif
            return
        }

        let acceptedProposals = (proposals ?? []).filter { $0.status == "accepted" }
        let milestonesByProposal = Dictionary(uniqueKeysWithValues: acceptedProposals.map {
            ($0.id, $0.payment_milestones ?? [])
        })

        let visibleInvoices = (invoices ?? []).filter(BudgetMath.isVisible)

        self.summary = BudgetMath.rollup(invoices ?? [])
        self.sections = BudgetMath.buildSections(
            projects: projects ?? [],
            acceptedProposals: acceptedProposals,
            milestonesByProposal: milestonesByProposal,
            visibleInvoices: visibleInvoices
        )
        self.isLoading = false
    }

}

// MARK: - Payment-terms display

/// The portal's `PAYMENT_TERMS_LABELS` — humanize the stored slug.
enum PaymentTermsDisplay {
    static func label(for terms: String?) -> String? {
        guard let terms, !terms.isEmpty else { return nil }
        switch terms {
        case "net_30": return "Net 30"
        case "net_15": return "Net 15"
        case "net_60": return "Net 60"
        case "due_on_receipt": return "Due on receipt"
        case "custom": return "Custom terms"
        default: return terms.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}
