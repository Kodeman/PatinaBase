//
//  DecisionDetailViewModel+ProjectApproval.swift
//  Patina
//
//  `P-09`. The Stage-2 approval's four acts, split off `DecisionsViewModel
//  .swift` because that file is at SwiftLint's `file_length` and
//  `type_body_length` limits. The state they read and write stays on the class;
//  only the behaviour lives here.
//

import Foundation

extension DecisionDetailViewModel {

    /// The client-safe projection for this one decision.
    ///
    /// It is asked for whenever the parent row did NOT arrive — which is the
    /// homeowner's case on every Stage-2 approval, because 00467 hides the row
    /// from her — and whenever it arrived carrying the Stage-2 contract. Only
    /// a row that loaded and is plainly legacy skips the call.
    func loadApprovalReview(decisionId: String) async {
        guard decision == nil || decision?.isProjectArtifactApproval == true else {
            approvalReview = nil
            return
        }
        do {
            approvalReview = try await fetchApprovalReview(decisionId)
        } catch {
            MoneyFailureCopy.log("project approval review", error)
            approvalReview = nil
        }
    }

    /// `P-18` / `R1`: the name on the rule is long enough to be one. Two
    /// characters is the server's own floor
    /// (`_respond_project_approval_checked`, 00464:557-561), so the act is
    /// never offered where the RPC would refuse it. Lives here rather than on
    /// the class because `DecisionsViewModel.swift` is at SwiftLint's
    /// `file_length` and a computed property can.
    var canSignApproval: Bool {
        typedSignature.trimmingCharacters(in: .whitespacesAndNewlines).count
            >= ProjectApprovalCopy.signatureFloor
    }

    /// RULED 2026-09-05: a signature only where something is being agreed to.
    ///
    /// Approve accepts an edition and its stated impacts — that is the legal
    /// act, and it is signed. Return and Hold ask the studio for work or for
    /// a conversation; a typed legal name to say "let's talk about this" is
    /// theatre, and it puts a rule and a signature notice in front of the two
    /// doors a homeowner is least likely to take. Both remain press-and-hold:
    /// the deliberation stays, the ceremony does not. Web does the same.
    var approvalNeedsSignature: Bool { chosenOutcome == .approved }

    /// What the held act is offered on. The hold itself is the gesture; this
    /// is whether the screen has what it needs to send.
    var canSubmitApproval: Bool {
        !approvalNeedsSignature || canSignApproval
    }

    /// `IOSC-R2-01`. What the discussion under the ceremony is read against.
    ///
    /// It changes exactly twice: when the approval lands, and when an act has
    /// finished recording. The second edge is `isSubmitting` and NOT
    /// `answeredOutcome`, and the difference is the whole point —
    /// `submitApprovalResponse` records the outcome, then writes the note,
    /// and only then clears the flag. A reread keyed on the outcome would race
    /// the very note it exists to show.
    var approvalDiscussionKey: String {
        let settled = !isSubmitting && hasAnsweredApproval
        return "\(approvalDecisionId ?? "")#\(settled)"
    }

    /// The row the ceremony is acting on. The projection first: for the
    /// homeowner being asked it is the only source there is.
    var approvalDecisionId: String? {
        approvalReview?.decisionId ?? decision?.id
    }

    /// `P-26`. The keepsake for a settled Stage-2 approval, or nil while one
    /// is still open.
    ///
    /// The name and the consent are what THIS session witnessed. On the visit
    /// she answers, that is both; on a later visit the projection carries the
    /// outcome and the day and neither of the other two, and the record
    /// prints what it has rather than reconstructing the act from the
    /// outcome. Approve is the only signed act (ruled 2026-09-05), so a
    /// Return or a Hold names the click-through it actually sent.
    func approvalRecord(studio: String?, now: Date = Date()) -> RecordOfDecision? {
        guard let review = approvalReview,
              let outcome = answeredOutcome ?? review.recordedOutcome else { return nil }
        let witnessed = answeredOutcome != nil
        let typed = typedSignature.trimmingCharacters(in: .whitespacesAndNewlines)
        let signed = outcome == .approved && !typed.isEmpty
        return .approval(
            review: review,
            outcome: outcome,
            studio: studio,
            signedName: witnessed && signed ? typed : nil,
            consentMethod: witnessed
                ? (signed
                    ? RecordOfDecisionCopy.electronicSignature
                    : RecordOfDecisionCopy.clickThrough)
                : nil,
            recordedAt: witnessed ? now : nil
        )
    }

    /// Pick an outcome. Records nothing — `submitApprovalResponse` is the act.
    func chooseOutcome(_ outcome: ProjectApprovalOutcome) {
        guard !isSubmitting, approvalReview?.canRespond == true else { return }
        submitFailure = nil
        chosenOutcome = outcome
    }

    func clearChosenOutcome() {
        guard !isSubmitting else { return }
        chosenOutcome = nil
        changeNote = ""
    }

    /// Confirm the client read this exact edition. The CAS pair the RPC
    /// demands comes off the projection she was shown, never from anywhere else.
    func confirmExactEdition() async {
        guard !isSubmitting,
              let review = approvalReview,
              review.needsReviewConfirmation,
              let revision = review.authorityRevision else { return }
        isSubmitting = true
        submitFailure = nil
        do {
            try await confirmApprovalReview(
                review.decisionId, revision, review.artifactChecksum, UUID().uuidString
            )
            self.reviewConfirmed = true
        } catch {
            MoneyFailureCopy.log("project approval review", error)
            self.submitFailure = MoneyFailureCopy.approvalReview
        }
        isSubmitting = false
    }

    /// Record the chosen outcome against the edition she was reading.
    ///
    /// `W1R2-B1`, second half. `respond_project_approval` is CAS on
    /// `updated_at`, and the only thing this screen can be wrong about is the
    /// value it is holding — anything that touches the row (the "seen" stamp, a
    /// reminder, the studio) moves it. So a failure buys exactly one re-read
    /// before the sentence is shown, and the re-read has three answers: the
    /// outcome is already recorded (the first call landed and only its reply
    /// was lost), the row moved and the retry carries the value it moved to,
    /// or nothing changed and the failure was not a CAS miss at all.
    func submitApprovalResponse() async {
        guard !isSubmitting,
              let review = approvalReview,
              review.canRespond,
              canSubmitApproval,
              let outcome = chosenOutcome else { return }
        // Approve is the signed act. Return and Hold send an empty name, and
        // the client drops the consent pair with it — `client_consent_method`
        // stays the clickthrough default the review leg already writes, and a
        // method without a signature would be a `check_violation` anyway.
        let signature = outcome == .approved
            ? typedSignature.trimmingCharacters(in: .whitespacesAndNewlines)
            : ""
        isSubmitting = true
        submitFailure = nil
        defer { isSubmitting = false }
        do {
            try await respondToApproval(
                review.decisionId, outcome, signature, review.updatedAt, UUID().uuidString
            )
            record(outcome)
            await sendChangeNoteIfWritten()
            return
        } catch {
            MoneyFailureCopy.log("project approval response", error)
        }
        guard let fresh = try? await fetchApprovalReview(review.decisionId) else {
            submitFailure = MoneyFailureCopy.approvalResponse
            return
        }
        approvalReview = fresh
        if let recorded = fresh.recordedOutcome {
            record(recorded)
            await sendChangeNoteIfWritten()
            return
        }
        guard fresh.canRespond, fresh.updatedAt != review.updatedAt else {
            submitFailure = MoneyFailureCopy.approvalResponse
            return
        }
        do {
            try await respondToApproval(
                fresh.decisionId, outcome, signature, fresh.updatedAt, UUID().uuidString
            )
            record(outcome)
            await sendChangeNoteIfWritten()
        } catch {
            MoneyFailureCopy.log("project approval response retry", error)
            submitFailure = MoneyFailureCopy.approvalResponse
        }
    }

    private func record(_ outcome: ProjectApprovalOutcome) {
        answeredOutcome = outcome
        chosenOutcome = nil
        submitFailure = nil
    }

    /// `P-16` / `R10`. The change note, after the outcome and never before it.
    ///
    /// The order is the whole design. `respond_project_approval` carries no
    /// note field, so the note is a second write — and a note sent first would
    /// describe a return that had not happened. The outcome is the act; the
    /// note is the courtesy that follows it.
    ///
    /// WHERE it goes is `ApprovalNoteWriter`'s: `decision_comments`, on the
    /// approval, which is the row the web writes to. The project conversation
    /// is the fallback, and a note that took it moves "Discuss this" to the
    /// thread it actually landed in.
    ///
    /// A failure here is NOT `submitFailure`: the answer is recorded, and
    /// drawing it as a failed submit would invite a homeowner to answer a
    /// second time. It is its own flat line beside the answer, naming the one
    /// thing that did not happen.
    func sendChangeNoteIfWritten() async {
        let note = changeNote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !note.isEmpty, answeredOutcome == .changesRequested else { return }
        let decisionId = approvalReview?.decisionId ?? decision?.id
        let route = messageRoute
        guard decisionId != nil || route != nil else {
            noteFailure = ProjectApprovalCopy.noteUnsent
            return
        }
        do {
            if let threadId = try await sendApprovalNote(decisionId, route, note) {
                discussThreadId = threadId
            }
            changeNote = ""
            noteFailure = nil
        } catch {
            MoneyFailureCopy.log("project approval note", error)
            noteFailure = ProjectApprovalCopy.noteUnsent
        }
    }
}
