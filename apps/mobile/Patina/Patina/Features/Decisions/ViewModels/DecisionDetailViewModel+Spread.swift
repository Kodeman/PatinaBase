//
//  DecisionDetailViewModel+Spread.swift
//  Patina
//
//  `P-30`. The leaning and the act it enables.
//
//  Its own file because `DecisionsViewModel.swift` is at SwiftLint's 500-line
//  `file_length` — the same reason the Stage-2 half and the list half are
//  already files of their own.
//

import Foundation

extension DecisionDetailViewModel {

    /// `P-30`. Lean toward an option. This writes nothing, sends nothing and
    /// resolves nothing — it moves a dot and fires a selection haptic.
    ///
    /// A contentless option is not leanable for the same reason it was never
    /// choosable (`R06`): the act above it would name nothing.
    func chooseLeaning(optionId: String) {
        guard !isResolved, !isSubmitting else { return }
        guard options.first(where: { $0.id == optionId })?.hasRenderableContent == true else {
            return
        }
        leaningOptionId = optionId
    }

    /// The option the named act is standing over, if any.
    var leaningOption: RemoteDecisionOption? {
        guard let leaningOptionId else { return nil }
        return options.first { $0.id == leaningOptionId }
    }

    /// `P-30`. The act itself: the held press on "I choose {name}".
    ///
    /// The consent is `click_through` and carries no signature. That is what
    /// the consent step this replaces sent on its default path — its "Add my
    /// signature" toggle rested OFF — and it is the token the mid-Wave-2
    /// ruling reserves for an act with no name on it. A choice between two
    /// named alternatives is not the signature moment; R1's typed name belongs
    /// to Approve on the ceremony rail, which has its own screen.
    func commitLeaning(decisionId: String) async {
        guard let optionId = leaningOptionId, !isSubmitting, !isResolved else { return }
        pendingOptionId = optionId
        await confirmSelection(decisionId: decisionId, consent: .clickThrough)
    }

    /// Commit the pending option with the client's consent. On success the
    /// decision is `responded` and the chosen option's `selected` flag is set
    /// server-side (via `apply_decision`); we mirror that locally.
    func confirmSelection(
        decisionId: String,
        consent: DecisionsAPIClient.ConsentMethod,
        signature: String? = nil
    ) async {
        guard let optionId = pendingOptionId, !isSubmitting else { return }
        isSubmitting = true
        error = nil
        submitFailure = nil
        do {
            try await DecisionsAPIClient.shared.selectOption(
                decisionId: decisionId,
                optionId: optionId,
                consent: consent,
                signature: signature
            )
            self.selectedOptionId = optionId
            self.pendingOptionId = nil
            self.leaningOptionId = nil
        } catch {
            MoneyFailureCopy.log("decision", error)
            self.submitFailure = MoneyFailureCopy.decision
            self.lastAttemptedOptionId = optionId
            self.pendingOptionId = nil
        }
        isSubmitting = false
    }
}
