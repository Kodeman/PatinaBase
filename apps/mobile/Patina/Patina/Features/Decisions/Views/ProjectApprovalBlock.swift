//
//  ProjectApprovalBlock.swift
//  Patina
//
//  `P-09`. The Stage-2 ceremony on the decision detail: the exact edition, what
//  it costs, the review of it, and the three answers.
//
//  It is a view of its own rather than another member of `DecisionDetailView`
//  because that file already carries a `swiftlint:disable file_length` and a
//  300-line type body. `viewModel` is passed as a plain `let`: the class is
//  `@Observable`, so reading its properties in this body still registers the
//  dependency.
//

import SwiftUI

struct ProjectApprovalBlock: View {
    let viewModel: DecisionDetailViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let review = viewModel.approvalReview {
                edition(review)
                if let context = review.context, !context.isEmpty {
                    Text(context)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("decisionDetail.approval.context")
                }
                impact(review)
                reviewLeg(review)
                outcomeLeg(review)
            } else if viewModel.isLoading {
                PatinaLoadingState()
            } else {
                Text(ProjectApprovalCopy.unavailable)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("decisionDetail.approval.unavailable")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
    }

    // MARK: - What is being approved

    private func edition(_ review: RemoteProjectApprovalReview) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(review.question)
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.question")

            Text(ProjectApprovalCopy.editionLine(
                title: review.artifactTitle,
                edition: review.artifactVersion,
                due: review.dueAt.map(DateDisplay.fromTimestamp)
            ))
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.Text.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("decisionDetail.approval.edition")

            // The sentence is present-tense and belongs only where the act is
            // still hers to take; over an answered approval it would describe
            // something that already happened.
            if review.needsReviewConfirmation || review.canRespond {
                Text(ProjectApprovalCopy.immutability(edition: review.artifactVersion))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("decisionDetail.approval.immutability")
            }
        }
    }

    /// R11: cost, schedule and lead time stated independently, side by side.
    @ViewBuilder
    private func impact(_ review: RemoteProjectApprovalReview) -> some View {
        let rows = ProjectApprovalCopy.impacts(
            costCentsDelta: review.costCentsDelta,
            scheduleDaysDelta: review.scheduleDaysDelta,
            leadTimeDaysDelta: review.leadTimeDaysDelta
        )
        if rows.isEmpty {
            Text(ProjectApprovalCopy.noImpact)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.noImpact")
        } else {
            // Wrapping rather than an HStack: three deltas at an accessibility
            // text size do not share one 375 pt row.
            FlowingImpact(rows: rows)
                .accessibilityIdentifier("decisionDetail.approval.impact")
        }
    }

    // MARK: - The review of the exact edition

    @ViewBuilder
    private func reviewLeg(_ review: RemoteProjectApprovalReview) -> some View {
        if viewModel.reviewConfirmed {
            Text(ProjectApprovalCopy.reviewConfirmed)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.reviewConfirmed")
        } else if review.needsReviewConfirmation {
            VStack(alignment: .leading, spacing: 10) {
                Text(ProjectApprovalCopy.reviewPrompt)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                PatinaButton(
                    ProjectApprovalCopy.reviewAction,
                    style: .primary,
                    isLoading: viewModel.isSubmitting,
                    isEnabled: !viewModel.isSubmitting
                ) {
                    Task { await viewModel.confirmExactEdition() }
                }
                .accessibilityIdentifier("decisionDetail.approval.review")
            }
        } else if review.reviewConfirmationUnavailable {
            Text(ProjectApprovalCopy.reviewUnavailable)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.reviewUnavailable")
        } else if review.isAwaitingStudioIssue {
            Text(ProjectApprovalCopy.awaitingStudioIssue)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.awaitingIssue")
        }
    }

    // MARK: - The three answers

    @ViewBuilder
    private func outcomeLeg(_ review: RemoteProjectApprovalReview) -> some View {
        if review.canRespond, !viewModel.hasAnsweredApproval {
            VStack(alignment: .leading, spacing: 10) {
                if let chosen = chosenAct {
                    Text("\(chosen.label) · \(chosen.consequence)")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("decisionDetail.approval.consequence")
                    PatinaButton(
                        ProjectApprovalCopy.submitAction,
                        style: .primary,
                        isLoading: viewModel.isSubmitting,
                        isEnabled: !viewModel.isSubmitting
                    ) {
                        Task { await viewModel.submitApprovalResponse() }
                    }
                    .accessibilityIdentifier("decisionDetail.approval.submit")
                    Button(ProjectApprovalCopy.chooseAgainAction) {
                        viewModel.clearChosenOutcome()
                    }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("decisionDetail.approval.chooseAgain")
                } else {
                    Text(ProjectApprovalCopy.choosePrompt)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(ProjectApprovalCopy.acts) { act in
                        outcomeAct(act)
                    }
                }
            }
        }
    }

    /// One outcome, stacked full width. The consequence is not printed beside
    /// the verb here — choosing is the beat that prints it.
    private func outcomeAct(_ act: ProjectApprovalAct) -> some View {
        PatinaButton(
            act.label,
            style: act.outcome == .approved ? .primary : .secondary,
            isEnabled: !viewModel.isSubmitting
        ) {
            viewModel.chooseOutcome(act.outcome)
        }
        .accessibilityIdentifier("decisionDetail.approval.outcome.\(act.outcome.rawValue)")
    }

    private var chosenAct: ProjectApprovalAct? {
        guard let chosen = viewModel.chosenOutcome else { return nil }
        return ProjectApprovalCopy.acts.first { $0.outcome == chosen }
    }
}

/// The impact rows, laid out so a third one wraps instead of truncating.
private struct FlowingImpact: View {
    let rows: [ProjectApprovalCopy.Impact]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 2) {
                    MonoLabel(text: row.label)
                    Text(row.value)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}
