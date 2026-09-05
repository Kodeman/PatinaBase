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
    /// Read for the pinned-footer clearance only: the bar owns the bottom
    /// edge on the house-first root, the Companion dock on the flag-off one.
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ProposalDetailViewModel()

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
                    loadingSkeleton
                }
            }
            .padding(.bottom, MoneyScreenMetrics.bottomClearance(houseFirst: coordinator.isHouseFirstRoot))
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load(proposalId: proposalId) }
        // C4-12: the same work the `.task` above does — and with R-05's
        // ten-second cap, the retry a reader now reaches in ten seconds
        // instead of three minutes.
        .refreshable { await viewModel.load(proposalId: proposalId) }
        // `P-19`: full screen, both of them. A contract's terms, a consent
        // line, a name and the act do not fit half a phone, and a medium
        // detent is dismissed by a flick over a document still half-visible
        // behind it.
        .fullScreenCover(isPresented: $viewModel.showSignSheet) {
            SignActView(
                proposalTitle: viewModel.proposal?.title ?? "this proposal",
                terms: ProposalSignTerms.make(
                    proposal: viewModel.proposal,
                    milestones: viewModel.milestones
                ),
                editionLine: viewModel.editionLine,
                isSigning: viewModel.isSigning,
                errorMessage: viewModel.signError,
                onSign: { name in
                    Task { await viewModel.sign(proposalId: proposalId, name: name) }
                },
                onCancel: { viewModel.cancelSigning() }
            )
        }
        .fullScreenCover(isPresented: $viewModel.showSealMoment) {
            SealMomentView(
                studioName: viewModel.countersigningStudio,
                signedName: viewModel.signedName,
                onDone: { viewModel.showSealMoment = false }
            )
        }
    }

    // MARK: - Loading

    /// R-05: an entirely blank cream page with a spinner and the words "One
    /// moment…", held for 65–185 seconds, on the screen a proposal push lands
    /// on. The wait is capped at ten seconds now
    /// (`ProposalDetailViewModel.fetchDeadline`); this is what it looks like
    /// while it runs — the screen's own chrome, so the reader can see they
    /// are on the right page and that something is coming.
    private var loadingSkeleton: some View {
        // Review RL1B2-15: a grey rectangle does not tell a reader which
        // proposal they opened, which is what the finding's fix line asks
        // for. When the app already holds the row — the Studio tap and the
        // push-into-a-warm-app path both do — draw its own words instead.
        let known = ProposalDetailViewModel.knownRecord(for: proposalId)
        return VStack(alignment: .leading, spacing: 16) {
            MonoLabel(text: "PROPOSAL")
                .tracking(2)

            if let title = known?.title, !title.isEmpty {
                Text(title)
                    .font(PatinaTypography.h2)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
                    .frame(height: 30)
                    .frame(maxWidth: 260)
            }

            if let address = known?.project_address, !address.isEmpty {
                Text(address)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
                    .frame(height: 14)
                    .frame(maxWidth: 160)
            }

            HStack(spacing: 10) {
                ProgressView()
                    .tint(PatinaColors.Text.interactive)
                Text("Opening your proposal…")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            .padding(.top, 12)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            (known?.title).flatMap { $0.isEmpty ? nil : "Opening \($0)" } ?? "Opening your proposal"
        )
        .accessibilityIdentifier("ProposalDetailView.LoadingSkeleton")
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

    /// `P-17`. Three marks retire together here, and they were the same
    /// mistake three times: the green `checkmark.seal.fill` / `checkmark.circle`
    /// pair over the signed line, and the two filled `PatinaStatusBadge`s
    /// (warning-tinted "Expired", error-tinted "Declined") under the
    /// unsignable ones. A glyph standing in for a state, and a fill standing
    /// in for a mark, are both what the stamp grammar replaces —
    /// `SIGNED` is mocha, `DECLINED` is the palette's one terracotta, and
    /// neither has a counterpart it could be read against.
    ///
    /// The words are unchanged and still carry the meaning, so the stamp is
    /// hidden from VoiceOver (`PatinaStamp` does that itself).
    @ViewBuilder
    private func statusRow(_ proposal: RemoteProposal) -> some View {
        let stamp = ProposalStatusDisplay.stampState(
            for: proposal, justSigned: viewModel.didSign
        )
        if viewModel.isSigned {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                if let stamp {
                    PatinaStamp(
                        state: stamp,
                        recordedAt: proposal.signed_at.flatMap(ISO8601DateParsing.date(from:))
                    )
                }
                // SP-04: "Signed" only where a signature record exists.
                Text(ProposalStatusDisplay.detailStatusLine(
                    proposal,
                    justSigned: viewModel.didSign
                ))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
            }
            .padding(.top, 8)
        } else if let stamp {
            // No sentence beside this one — the badge it replaces carried its
            // own word — so the mark speaks rather than hiding.
            PatinaStamp(
                state: stamp,
                accessibilityLabel: ProposalStatusDisplay.rowLabel(proposal)
            )
            .padding(.top, 8)
        }
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
            // SP-15: "Expires Sep 8" printed on the list and vanished here.
            if !viewModel.isSigned, let expiry = DateDisplay.expiry(proposal.valid_until) {
                Text(expiry.text)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(expiry.isPastDue ? PatinaColors.Text.error : PatinaColors.Text.secondary)
                    .accessibilityIdentifier("proposalDetail.expiry")
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
        PatinaErrorState(
            message: msg,
            action: { Task { await viewModel.load(proposalId: proposalId) } }
        )
        .padding(.top, 80)
    }
}

#Preview {
    NavigationStack {
        ProposalDetailView(proposalId: "preview")
    }
}
