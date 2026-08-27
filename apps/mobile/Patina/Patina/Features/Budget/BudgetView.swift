//
//  BudgetView.swift
//  Patina
//
//  Wave 3 / D.3: the cross-project money picture. Composes the Wave 2 money
//  rail — a billed/paid/outstanding summary up top, then a per-project rollup
//  (accepted proposals + their signed payment schedule + the project's
//  invoices). Read-only; taps route into the existing proposal/invoice detail.
//  Typography-first, tokens only — mirrors the ProposalDetailBlocks idiom.
//

import SwiftUI

struct BudgetView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = BudgetViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                header
                content
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "BUDGET", tracking: 2)
            // SP-16: the screen computes what has been billed and paid across
            // the client's invoices — not her project budgets. It is named for
            // what it computes.
            Text("Billed to date")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if let error = viewModel.error, viewModel.isEmpty {
            PatinaErrorState(message: error, action: { Task { await viewModel.load() } })
                .padding(.top, 60)
        } else if viewModel.isEmpty {
            emptyView
        } else {
            if viewModel.summary.hasActivity {
                BudgetSummaryCard(summary: viewModel.summary)
            }
            ForEach(viewModel.sections) { section in
                BudgetProjectSectionView(section: section) { invoiceId in
                    coordinator.navigate(to: .invoiceDetail(invoiceId: invoiceId))
                } onOpenProposal: { proposalId in
                    coordinator.navigate(to: .proposalDetail(proposalId: proposalId))
                }
            }
        }
    }

    /// U22: names the surface, names the trigger, and offers the one CTA
    /// that actually unblocks it — track an in-flight request if one
    /// exists, otherwise start one.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "chart.pie",
            title: "Nothing billed yet",
            message: "Sign a proposal or receive an invoice and the record builds itself here.",
            ctaTitle: studioCTATitle,
            ctaAction: presentStudioCTA
        )
        .padding(.top, 80)
    }

    private var studioCTATitle: String {
        DesignRequestStatusService.shared.promotedRequest != nil ? "Track your request" : "Get design help"
    }

    private func presentStudioCTA() {
        if DesignRequestStatusService.shared.promotedRequest != nil {
            coordinator.navigate(to: .designRequests(focusLeadId: nil))
        } else {
            coordinator.navigate(to: .designerConsultation)
        }
    }
}

// MARK: - Summary card

/// Cross-project billed / paid / outstanding tiles.
struct BudgetSummaryCard: View {
    let summary: BudgetSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "Across your projects")
                .padding(.horizontal, 24)
            HStack(spacing: 0) {
                tile("Billed", summary.billedCents, color: PatinaColors.Text.primary)
                divider
                tile("Paid", summary.paidCents, color: PatinaColors.sage)
                divider
                tile("Outstanding", summary.outstandingCents, color: PatinaColors.Text.interactive)
            }
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }

    private func tile(_ label: String, _ cents: Int, color: Color) -> some View {
        VStack(spacing: 4) {
            Text(PatinaCurrency.formatWholeDollars(cents: cents))
                .font(PatinaTypography.h5)
                .foregroundStyle(color)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            MonoLabel(text: label)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 4)
    }

    private var divider: some View {
        Rectangle()
            .fill(PatinaColors.Text.muted.opacity(0.2))
            .frame(width: 1, height: 34)
    }
}

// MARK: - Project section

struct BudgetProjectSectionView: View {
    let section: BudgetProjectSection
    let onOpenInvoice: (String) -> Void
    let onOpenProposal: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(section.name)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                // SP-16: the designer's figure, said to be the designer's.
                if let budget = section.designerBudgetCents {
                    Text("Project budget \(PatinaCurrency.formatWholeDollars(cents: budget)) · your designer's figure")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
            .padding(.horizontal, 24)

            ForEach(section.proposals) { proposal in
                BudgetProposalCard(proposal: proposal) {
                    onOpenProposal(proposal.id)
                }
            }

            if !section.invoices.isEmpty {
                BudgetInvoicesBlock(section: section, onOpenInvoice: onOpenInvoice)
            }
        }
    }
}

#Preview {
    NavigationStack {
        BudgetView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
