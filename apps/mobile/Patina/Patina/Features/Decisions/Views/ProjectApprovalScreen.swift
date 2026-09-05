//
//  ProjectApprovalScreen.swift
//  Patina
//
//  `P-09`. The whole Stage-2 screen: the eyebrow, the heading, a failure when
//  there is one, the ceremony, and the way back to the designer.
//
//  It is a screen of its own rather than a branch inside `DecisionDetailView`
//  for two reasons. The first is that the pieces it does NOT draw are the
//  point: the sage `checkmark.seal.fill` "You’ve responded to this decision"
//  banner, the option cards, the past-due date in `PatinaColors.Text.error`,
//  and the "Not yet / Neither of these" pair — every one of which either
//  paints a status colour, names the ask a decision, or offers options this
//  approval does not have. The second is that this makes the refusal testable:
//  `ProjectApprovalActTests` reads THESE two files and no others, because
//  these two files are the entire Stage-2 branch.
//

import SwiftUI

struct ProjectApprovalScreen: View {
    let viewModel: DecisionDetailViewModel
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            heading
            failure
            ProjectApprovalBlock(viewModel: viewModel)
            if viewModel.discussThreadId != nil {
                discuss
            }
        }
    }

    /// "Approval" is the ask. A Stage-2 row is not a choice between named
    /// alternatives, so it is never called a decision.
    private var heading: some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: ProjectApprovalCopy.eyebrow)
                .tracking(2)
            Text(title)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.title")
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    /// What is being approved. The projection first: for the homeowner being
    /// asked it is the only source there is, because 00467 hides the
    /// `client_decisions` row from her.
    private var title: String {
        viewModel.approvalReview?.artifactTitle
            ?? viewModel.decision?.title
            ?? "Approval"
    }

    /// A failed act, said plainly. The legacy banner sits on a tinted
    /// `PatinaColors.error` ground; this screen carries no colour at all, so
    /// the sentence and its acts stand on the page as they are.
    @ViewBuilder
    private var failure: some View {
        if let failure = viewModel.submitFailure {
            VStack(alignment: .leading, spacing: 10) {
                Text(failure.sentence)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 18) {
                    Button(failure.retryLabel) {
                        viewModel.retrySelection()
                    }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .accessibilityIdentifier("decisionDetail.approval.failure.retry")
                    if failure.offersDesignerMessage, viewModel.messageRoute != nil {
                        Button("Message your designer") {
                            Task {
                                if let threadId = await viewModel.messageDesigner() {
                                    coordinator.navigate(to: .threadDetail(threadId: threadId))
                                }
                            }
                        }
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("decisionDetail.approval.failure.message")
                    }
                }
                .frame(minHeight: 44)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
            .accessibilityIdentifier("decisionDetail.approval.failure")
        }
    }

    /// The way to talk it over. A plain line: the bubble glyph the legacy
    /// screen draws is the one thing on this surface that would read as an
    /// icon carrying a state.
    @ViewBuilder
    private var discuss: some View {
        if let threadId = viewModel.discussThreadId {
            Button("Discuss this with your designer") {
                coordinator.navigate(to: .threadDetail(threadId: threadId))
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .padding(.horizontal, 24)
            .accessibilityIdentifier("decisionDetail.approval.discuss")
        }
    }
}
