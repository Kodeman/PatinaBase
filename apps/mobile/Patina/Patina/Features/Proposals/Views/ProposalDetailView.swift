//
//  ProposalDetailView.swift
//  Patina
//
//  Client proposal detail (Wave 2 / D.1). Typography-first document — the
//  narrative sections, selections, timeline, payment schedule, exclusions,
//  scope rooms, and boards (as a thumbnail grid), then the sign CTA. Tokens
//  only, zero shadows. Mirrors the client portal's ProposalDocument + sign
//  flow; signing runs the atomic sign_proposal RPC.
//

import SwiftUI

struct ProposalDetailView: View {
    let proposalId: String
    @State private var viewModel = ProposalDetailViewModel()
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 28) {
                if let proposal = viewModel.proposal {
                    header(proposal)
                    investmentSummary(proposal)
                    blocks
                    signFooter(proposal)
                } else if let error = viewModel.error {
                    errorView(error)
                } else {
                    ProgressView()
                        .tint(PatinaColors.Text.interactive)
                        .padding(.top, 80)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 140)
        }
        .background(PatinaColors.Background.primary)
        .overlay(alignment: .topLeading) {
            BackChevronButton(style: .light) { coordinator.goBack() }
                .padding(.top, 8)
                .padding(.leading, 18)
        }
        .task { await viewModel.load(proposalId: proposalId) }
        .sheet(isPresented: $viewModel.showSignSheet) {
            ProposalSignSheet(
                proposalTitle: viewModel.proposal?.title ?? "this proposal",
                isSigning: viewModel.isSigning,
                errorMessage: viewModel.signError,
                onSign: { name in
                    Task { await viewModel.sign(proposalId: proposalId, name: name) }
                },
                onCancel: { viewModel.cancelSigning() }
            )
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Header

    private func header(_ proposal: RemoteProposal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "PROPOSAL")
                .tracking(2)
            Text(proposal.title ?? "Proposal")
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
            if let projectName = proposal.project?.name, !projectName.isEmpty {
                Text(projectName)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            statusRow(proposal)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private func statusRow(_ proposal: RemoteProposal) -> some View {
        if viewModel.isSigned {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(PatinaColors.sage)
                Text(signedLine(proposal))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.sage)
            }
            .padding(.top, 4)
        } else if proposal.status == "expired" || (!proposal.isSignable && proposal.status != "declined") {
            PatinaStatusBadge(state: .warning, text: "Expired")
                .padding(.top, 4)
        } else if proposal.status == "declined" {
            PatinaStatusBadge(state: .error, text: "Declined")
                .padding(.top, 4)
        }
    }

    private func signedLine(_ proposal: RemoteProposal) -> String {
        let who = proposal.signed_by_name ?? "you"
        if let signedAt = proposal.signed_at {
            return "Signed by \(who) on \(DateDisplay.fromTimestamp(signedAt))"
        }
        return "Signed by \(who)"
    }

    // MARK: - Investment summary

    private func investmentSummary(_ proposal: RemoteProposal) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: "Investment")
            Text(PatinaCurrency.format(cents: proposal.total_amount ?? 0))
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
            if let terms = proposal.payment_terms, !terms.isEmpty {
                Text(terms)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 24)
    }

    // MARK: - Document blocks

    @ViewBuilder
    private var blocks: some View {
        ProposalNarrativeBlock(sections: viewModel.sections)
        ProposalScopeRoomsBlock(rooms: viewModel.scopeRooms)
        ProposalSelectionsBlock(items: viewModel.items)
        ProposalTimelineBlock(phases: viewModel.phases)
        ProposalMilestonesBlock(milestones: viewModel.milestones)
        ProposalExclusionsBlock(exclusions: viewModel.exclusions)
        ProposalBoardsGrid(boards: viewModel.boards)
    }

    // MARK: - Sign footer

    @ViewBuilder
    private func signFooter(_ proposal: RemoteProposal) -> some View {
        if viewModel.canSign {
            VStack(alignment: .leading, spacing: 12) {
                Text("Ready to move forward? Sign to confirm the scope and kick off your project.")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                PatinaButton("Sign proposal", style: .clay) {
                    viewModel.beginSigning()
                }
                .accessibilityIdentifier("proposalDetail.sign")
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
            Button("Try Again") {
                Task { await viewModel.load(proposalId: proposalId) }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }
}

#Preview {
    NavigationStack {
        ProposalDetailView(proposalId: "preview")
    }
}
