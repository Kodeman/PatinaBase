//
//  ProposalListView.swift
//  Patina
//
//  Client proposal list (Wave 2 / D.1). Awaiting-review / Signed / Archive
//  sections, mirroring the client portal's /proposals page. Tap a row → detail.
//

import SwiftUI

struct ProposalListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ProposalListViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.Background.primary)
        .overlay(alignment: .topLeading) {
            BackChevronButton(style: .light) { coordinator.goBack() }
                .padding(.top, 8)
                .padding(.leading, 18)
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "PROPOSALS")
                .tracking(2)
            Text(viewModel.isEmpty ? "Nothing to review yet" : "Your design proposals")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.proposals.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if let error = viewModel.error, viewModel.proposals.isEmpty {
            PatinaErrorState(message: error, action: { Task { await viewModel.load() } })
                .padding(.top, 60)
        } else if viewModel.isEmpty {
            emptyView
        } else {
            VStack(alignment: .leading, spacing: 24) {
                section("Awaiting your review", viewModel.pending, accent: PatinaColors.Text.interactive)
                section("Signed", viewModel.accepted, accent: PatinaColors.sage)
                section("Archive", viewModel.archived, accent: PatinaColors.Text.muted)
            }
            .padding(.top, 12)
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ proposals: [RemoteProposal], accent: Color) -> some View {
        if !proposals.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("\(title) (\(proposals.count))")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(accent)
                    .padding(.horizontal, 24)
                VStack(spacing: 12) {
                    ForEach(proposals) { proposal in
                        Button {
                            coordinator.navigate(to: .proposalDetail(proposalId: proposal.id))
                        } label: {
                            ProposalRowCard(proposal: proposal)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)
            }
        }
    }

    /// U22: names the surface, names the trigger, and offers the one CTA
    /// that actually unblocks it — track an in-flight request if one
    /// exists, otherwise start one.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "doc.text",
            title: "Nothing to review yet",
            message: "Your designer's proposals land here for your signature.",
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

// MARK: - Row

private struct ProposalRowCard: View {
    let proposal: RemoteProposal

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusLabel)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                    Text(proposal.title ?? "Proposal")
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    if let total = proposal.total_amount {
                        Text(PatinaCurrency.format(cents: total))
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                    }
                    if let expiry = expiryLine {
                        Text(expiry)
                            .font(PatinaTypography.captionSmall)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                }
            }
            if let projectName = proposal.project?.name, !projectName.isEmpty {
                Text(projectName)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(proposal.title ?? "Proposal"), \(statusLabel)")
    }

    private var statusLabel: String {
        switch proposal.status {
        case "sent": return "Awaiting your review"
        case "viewed": return "In review"
        case "accepted": return "Signed"
        case "declined": return "Declined"
        case "expired": return "Expired"
        default: return proposal.status?.capitalized ?? "Proposal"
        }
    }

    private var expiryLine: String? {
        guard proposal.status != "accepted",
              let until = proposal.valid_until,
              let date = ISO8601DateParsing.date(from: until) else { return nil }
        return "Expires \(DateDisplay.short(date))"
    }
}

#Preview {
    NavigationStack {
        ProposalListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
