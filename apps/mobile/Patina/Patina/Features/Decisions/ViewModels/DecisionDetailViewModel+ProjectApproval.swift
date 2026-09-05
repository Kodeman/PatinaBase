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

    /// Pick an outcome. Records nothing — `submitApprovalResponse` is the act.
    func chooseOutcome(_ outcome: ProjectApprovalOutcome) {
        guard !isSubmitting, approvalReview?.canRespond == true else { return }
        submitFailure = nil
        chosenOutcome = outcome
    }

    func clearChosenOutcome() {
        guard !isSubmitting else { return }
        chosenOutcome = nil
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
              let outcome = chosenOutcome else { return }
        isSubmitting = true
        submitFailure = nil
        defer { isSubmitting = false }
        do {
            try await respondToApproval(
                review.decisionId, outcome, review.updatedAt, UUID().uuidString
            )
            record(outcome)
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
            return
        }
        guard fresh.canRespond, fresh.updatedAt != review.updatedAt else {
            submitFailure = MoneyFailureCopy.approvalResponse
            return
        }
        do {
            try await respondToApproval(
                fresh.decisionId, outcome, fresh.updatedAt, UUID().uuidString
            )
            record(outcome)
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
}
