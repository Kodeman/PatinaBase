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
    func submitApprovalResponse() async {
        guard !isSubmitting,
              let review = approvalReview,
              review.canRespond,
              let outcome = chosenOutcome else { return }
        isSubmitting = true
        submitFailure = nil
        do {
            try await respondToApproval(
                review.decisionId, outcome, review.updatedAt, UUID().uuidString
            )
            self.answeredOutcome = outcome
            self.chosenOutcome = nil
        } catch {
            MoneyFailureCopy.log("project approval response", error)
            self.submitFailure = MoneyFailureCopy.approvalResponse
        }
        isSubmitting = false
    }
}
