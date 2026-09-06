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
    /// The consent an unsigned hold records is `click_through` — the token the
    /// mid-Wave-2 ruling reserves for an act with no name on it, and what the
    /// consent step this replaced sent on its own default path (its "Add my
    /// signature" toggle rested OFF).
    ///
    /// `r1 M2`: that sheet could also put `electronic_signature` on a choice,
    /// and removing the sheet must not remove the capability. `typedName` is
    /// the optional line under the spread; when it holds a name, the same held
    /// act sends it, exactly as `DecisionConsentSheet` did. Below the two-
    /// character floor nothing is sent at all — the view does not offer the
    /// act there, and this refuses it too, so a half-typed name cannot be
    /// silently downgraded to an unsigned submit.
    func commitLeaning(decisionId: String, typedName: String? = nil) async {
        guard let optionId = leaningOptionId, !isSubmitting, !isResolved else { return }
        switch DecisionSpread.consent(forTypedName: typedName) {
        case .tooShort:
            return
        case .clickThrough:
            pendingOptionId = optionId
            await confirmSelection(decisionId: decisionId, consent: .clickThrough)
        case .signed(let name):
            pendingOptionId = optionId
            await confirmSelection(
                decisionId: decisionId,
                consent: .electronicSignature,
                signature: name
            )
        }
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
