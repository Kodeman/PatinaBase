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
                ApprovalDiscussionBlock(
                    decisionId: viewModel.approvalDecisionId,
                    readKey: viewModel.approvalDiscussionKey,
                    designerGivenName: designerGivenName,
                    studioName: studioName
                )
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

            ApprovalWhyLine(
                why: review.designerWhy, author: review.designerWhyAuthor
            )

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
            //
            // `IOSC-R2-07`: and the same viewer test the doors take, because
            // the guard is "exactly `outcomeLeg`'s" — a sentence introducing
            // three acts that are no longer drawn introduces nothing, and it
            // says "you are approving" to somebody who is not.
            if !viewModel.hasAnsweredApproval, review.canRespond, review.viewerAnswers {
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
        // `IOSC-R2-07`: and hers to give. `confirm_project_decision_review`
        // accepts the frozen lead and nobody else, so offering the hold to a
        // studio co-member reading her own client app is offering an act the
        // server refuses — the same subtraction `awaitsClientInFeed` already
        // makes on every feed that leads here.
        } else if review.needsReviewConfirmation, review.viewerAnswers {
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
        } else if review.reviewConfirmationUnavailable, review.viewerAnswers {
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

    /// Why there are no acts. An approval can be closed four ways, and each
    /// of them left the screen silent: withdrawn and superseded stood ahead of
    /// everything with nothing to say, an answered approval never named the
    /// answer she had given it, and a lapsed one — `W2R1-B1` — matched no
    /// branch at all while `outcomeLeg` withheld the doors, so the ceremony
    /// ended mid-sentence under the impact rows.
    ///
    /// The order is the house's own (`client-attention.ts:55-71`): the
    /// disposition first, then the outcome, and the clock last — an expired
    /// row that carries an answer is an answered approval.
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
            // `P-26`: the copy she keeps, beside the mark that settled it.
            if let record = viewModel.approvalRecord(studio: studioName) {
                KeepACopyAct(record: record)
            }
            if let noteFailure = viewModel.noteFailure {
                Text(noteFailure)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("decisionDetail.approval.noteFailure")
            }
        } else if review.isLapsed {
            closureLine(ProjectApprovalCopy.expired, stamp: .expired, id: "expired")
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
        // `IOSC-R2-07`: `canRespond` is the row's own state and says nothing
        // about who is reading it. `respond_project_approval` accepts the
        // frozen decision lead and refuses everybody else, so a studio
        // co-member offered these three doors is offered three acts the
        // server will not take. `viewerAnswers` default-INCLUDES an unknown
        // or absent role, so a homeowner never loses her own doors to a
        // projection this build does not recognise.
        if review.canRespond, review.viewerAnswers, !viewModel.hasAnsweredApproval {
            VStack(alignment: .leading, spacing: 14) {
                if let chosen = chosenAct {
                    Text("\(chosen.label) · \(chosen.consequence)")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("decisionDetail.approval.consequence")
                    // RULED: the rule and the name belong to the one act that
                    // agrees to something. Return gets the composer instead;
                    // Hold gets neither, and both are still held.
                    if viewModel.approvalNeedsSignature {
                        signatureLine
                    }
                    if chosen.outcome == .changesRequested {
                        changeNoteComposer
                    }
                    HoldToActButton(
                        title: ProjectApprovalCopy.submitAction,
                        isEnabled: viewModel.canSubmitApproval,
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

    /// `P-18` / `R1`. The typed legal name on a ruled line, with the date
    /// beside it, under a chosen Approve — so a homeowner signs the agreement
    /// rather than tapping it. RULED 2026-09-05: it is drawn for Approve and
    /// for nothing else (`approvalNeedsSignature`); a name asked for in order
    /// to say "needs discussion" is theatre in front of the two doors she is
    /// least likely to take.
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

    /// Who the note is addressed to, where the app already holds a name.
    ///
    /// `IOSC-03`. The embedded row is the wrong place to look on its own:
    /// 00467:18-38 cut Stage-2 out of every raw `client_decisions` SELECT
    /// policy a homeowner can reach, so for the very person being asked
    /// `viewModel.decision` is nil — and with it the project embed and its
    /// designer. `RemoteProjectApprovalReview`, the projection that IS
    /// present, carries no designer field at all. The name that survives is
    /// the one on the project the app already holds, matched on the
    /// projection's own `projectId` — the same resolution the seal makes in
    /// `signingStudio`.
    private var designerGivenName: String? {
        Self.designerGivenName(
            embedded: viewModel.decision?.project?.designer?.askedByName,
            projectId: viewModel.approvalReview?.projectId ?? viewModel.decision?.project_id,
            projects: BadgeCountService.shared.projects
        )
    }

    /// The resolution itself, as a value: the embed when it arrived, the held
    /// project when it did not, and nobody rather than an invented name — the
    /// placeholder's own fallback is "your designer".
    static func designerGivenName(
        embedded: String?,
        projectId: String?,
        projects: [RemoteProject]
    ) -> String? {
        if let embedded, !embedded.isEmpty { return embedded }
        guard let projectId, !projectId.isEmpty else { return nil }
        return projects.first { $0.id == projectId }?.designer?.askedByName
    }

    /// The house a studio note on this approval is signed by, resolved the same way the seal
    /// resolves it (`ProposalsViewModel.signingStudio`) — from the
    /// project the app already holds, never invented.
    private var studioName: String? {
        RecordOfDecision.masthead(
            projectId: viewModel.approvalReview?.projectId ?? viewModel.decision?.project_id,
            projects: BadgeCountService.shared.projects
        )
    }

    private var chosenAct: ProjectApprovalAct? {
        guard let chosen = viewModel.chosenOutcome else { return nil }
        return ProjectApprovalCopy.acts.first { $0.outcome == chosen }
    }
}

/// `P-13`. The designer's own line, under the question it explains and above
/// the edition it was written about — the web's own order
/// (`approval-ask.tsx`: question, why, attribution).
///
/// It is frozen with the artifact, so it is signed by the hand that wrote it
/// or by nobody: `designerWhyAuthor` withholds a name that has no sentence
/// over it, and neither half is invented from the studio the reader happens
/// to be talking to today.
///
/// Its own view, at file scope, because `ProjectApprovalBlock` is at
/// SwiftLint's 300-line `type_body_length` — the same reason
/// `ApprovalDiscussionBlock` is a file of its own.
private struct ApprovalWhyLine: View {
    let why: String?
    let author: String?

    var body: some View {
        if let why {
            Text(why)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.approval.why")
            if let author {
                Text(ProjectApprovalCopy.whyAttribution(author))
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("decisionDetail.approval.whyAuthor")
            }
        }
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
