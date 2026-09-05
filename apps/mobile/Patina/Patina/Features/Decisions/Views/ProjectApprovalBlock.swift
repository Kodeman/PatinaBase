//
//  ProjectApprovalBlock.swift
//  Patina
//
//  `P-09`. The Stage-2 ceremony on the decision detail: the exact edition, what
//  it costs, the review of it, and the three answers.
//
//  It is a view of its own rather than another member of `DecisionDetailView`
//  because that file is already over the file-length limit and at the type-body
//  one. `viewModel` is passed as a plain `let`: the class is `@Observable`, so
//  reading its properties in this body still registers the dependency.
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
                closureLeg(review)
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
                edition: review.artifactVersion,
                due: review.dueAt.map(DateDisplay.fromTimestamp)
            ))
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.Text.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("decisionDetail.approval.edition")

            // The sentence is present-tense and belongs above the three
            // outcomes, while an answer is still open — nowhere else.
            //
            // Over an answered approval it describes something that already
            // happened: `canRespond` is the projection's word and the
            // projection is not refetched after a submit, so the answer given
            // in THIS session has to be asked about too, or the screen prints
            // "You are approving edition 3" directly above "You approved this
            // edition." (`iosb2-M2`).
            //
            // `W1R2-M1`: `needsReviewConfirmation` put it on the review screen
            // as well, where the act on offer is READING the edition and
            // nothing is being approved yet — and it survived the confirmation,
            // because the projection in hand still says the review is
            // outstanding. The guard is now exactly `outcomeLeg`'s, so the
            // sentence lives and dies with the acts it introduces.
            if !viewModel.hasAnsweredApproval, review.canRespond {
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
                // `P-18` / `R1`: held, not tapped. The review leg keeps
                // `review_method: 'portal_clickthrough'` — a press-and-hold
                // IS a click-through, so no migration follows this.
                HoldToActButton(
                    title: ProjectApprovalCopy.reviewAction,
                    isBusy: viewModel.isSubmitting
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

    // MARK: - The approval that is closed, or already answered

    /// Why there are no acts. An approval can be closed three ways, and each
    /// of them left the screen silent: withdrawn and superseded stood ahead of
    /// everything with nothing to say, and an answered approval never named
    /// the answer she had given it.
    ///
    /// The order is the house's own (`client-attention.ts:55-71`): the
    /// disposition first, then the outcome.
    @ViewBuilder
    private func closureLeg(_ review: RemoteProjectApprovalReview) -> some View {
        if review.isWithdrawn {
            closureLine(ProjectApprovalCopy.withdrawn, stamp: .withdrawn, id: "withdrawn")
        } else if review.isSuperseded {
            closureLine(ProjectApprovalCopy.superseded, stamp: .superseded, id: "superseded")
        } else if let answered = viewModel.answeredOutcome ?? review.recordedOutcome {
            closureLine(
                ProjectApprovalCopy.recorded(answered),
                stamp: ProjectApprovalCopy.stamp(for: answered),
                id: "recorded"
            )
            if let noteFailure = viewModel.noteFailure {
                Text(noteFailure)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("decisionDetail.approval.noteFailure")
            }
        }
    }

    /// `P-16` / `P-17`: the sentence, and the mark it earned. RETURNED is the
    /// row this closes — "changes requested" left no mark at all, so the one
    /// outcome that asks the studio for work read as though nothing had
    /// happened. The stamp is hidden from VoiceOver; the sentence says it.
    private func closureLine(
        _ text: String, stamp: PatinaStamp.State, id: String
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            PatinaStamp(
                state: stamp,
                recordedAt: viewModel.approvalReview?.respondedAt
                    .flatMap(ISO8601DateParsing.date(from:))
            )
            Text(text)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("decisionDetail.approval.\(id)")
    }

    // MARK: - The three answers

    @ViewBuilder
    private func outcomeLeg(_ review: RemoteProjectApprovalReview) -> some View {
        if review.canRespond, !viewModel.hasAnsweredApproval {
            VStack(alignment: .leading, spacing: 14) {
                signatureLine
                if let chosen = chosenAct {
                    Text("\(chosen.label) · \(chosen.consequence)")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("decisionDetail.approval.consequence")
                    if chosen.outcome == .changesRequested {
                        changeNoteComposer
                    }
                    HoldToActButton(
                        title: ProjectApprovalCopy.submitAction,
                        isEnabled: viewModel.canSignApproval,
                        isBusy: viewModel.isSubmitting
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
    ///
    /// `P-16`: all three take the SAME style. Approve was `.primary` — a
    /// filled commitment button — against two hairline ones, which is the
    /// screen leaning on a homeowner to say yes to a document she is being
    /// asked to weigh. Three doors, one weight.
    private func outcomeAct(_ act: ProjectApprovalAct) -> some View {
        PatinaButton(
            act.label,
            style: .secondary,
            isEnabled: !viewModel.isSubmitting
        ) {
            viewModel.chooseOutcome(act.outcome)
        }
        .accessibilityIdentifier("decisionDetail.approval.outcome.\(act.outcome.rawValue)")
    }

    /// `P-18` / `R1`. The typed legal name on a ruled line, the date beside
    /// it, above the three outcomes — so a homeowner signs the answer rather
    /// than tapping it, and the name is on the page before the act is.
    ///
    /// The date is today's, formatted in the device calendar, and it is the
    /// day she is signing on. The server stamps `client_consented_at` itself;
    /// this is the line she reads while she types, not the record.
    private var signatureLine: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                MonoLabel(text: ProjectApprovalCopy.signatureLabel)
                Spacer(minLength: 12)
                MonoLabel(text: DateDisplay.long(Date()))
                    .accessibilityIdentifier("decisionDetail.approval.signatureDate")
            }
            TextField(
                ProjectApprovalCopy.signaturePlaceholder,
                text: Binding(
                    get: { viewModel.typedSignature },
                    set: { viewModel.typedSignature = $0 }
                )
            )
            .font(PatinaTypography.h5)
            .foregroundStyle(PatinaColors.Text.primary)
            .textFieldStyle(.plain)
            .textContentType(.name)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .padding(.bottom, 6)
            .accessibilityIdentifier("decisionDetail.approval.signature")
            Rectangle()
                .fill(PatinaColors.Border.strong)
                .frame(height: 1)
            Text(ProjectApprovalCopy.signatureNotice)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// `R10`. Pre-opened the moment Return is chosen, encouraged by its
    /// placeholder and its help line, and enforced by nothing: the submit
    /// stays live over an empty note. The web requires one; the asymmetry is
    /// deliberate and documented in `ProjectApprovalCopy.noteLabel`.
    private var changeNoteComposer: some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: ProjectApprovalCopy.noteLabel)
            TextField(
                ProjectApprovalCopy.notePlaceholder(designer: designerGivenName),
                text: Binding(
                    get: { viewModel.changeNote },
                    set: { viewModel.changeNote = $0 }
                ),
                axis: .vertical
            )
            .lineLimit(3...6)
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.Text.primary)
            .textFieldStyle(.plain)
            .padding(12)
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(PatinaColors.Border.strong, lineWidth: 1)
            }
            .accessibilityIdentifier("decisionDetail.approval.note")
            Text(ProjectApprovalCopy.noteHelp)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Who the note is addressed to, where the app holds a name. Never
    /// invented — the placeholder falls back to "your designer".
    private var designerGivenName: String? {
        viewModel.decision?.project?.designer?.askedByName
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
