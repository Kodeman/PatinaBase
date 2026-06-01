//
//  DecisionsViewModel.swift
//  Patina
//
//  Client-side decision workflow: list pending decisions, view options,
//  select one, and capture consent. Designer-side sees the same data
//  read-only via DesignerHome.
//

import SwiftUI

@Observable
@MainActor
final class DecisionsListViewModel {
    var decisions: [RemoteClientDecision] = []
    var isLoading: Bool = false
    var error: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            self.decisions = try await DecisionsAPIClient.shared.listPending()
        } catch {
            self.error = "Couldn't load decisions"
            #if DEBUG
            PatinaLog.ui.error("[Decisions] list failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }
}

@Observable
@MainActor
final class DecisionDetailViewModel {
    var decision: RemoteClientDecision?
    var options: [RemoteDecisionOption] = []
    var isLoading: Bool = false
    var isSubmitting: Bool = false
    var error: String?

    /// Option the client tapped "Choose" on — drives the consent sheet.
    var pendingOptionId: String?
    /// Option the client has committed to (locally, after a successful
    /// `selectOption`). Mirrors the server `selected` flag for instant UI.
    var selectedOptionId: String?

    func load(decisionId: String) async {
        isLoading = true
        error = nil
        async let decisionTask = (try? await DecisionsAPIClient.shared.fetchDecision(id: decisionId))
        async let optionsTask = (try? await DecisionsAPIClient.shared.listOptions(forDecision: decisionId)) ?? []
        let (d, o) = await (decisionTask, optionsTask)
        self.decision = d ?? nil
        self.options = o
        // Seed local selection from whatever the server already has, so a
        // re-open of a resolved decision shows the choice without re-asking.
        self.selectedOptionId = o.first(where: { $0.selected == true })?.id
        self.isLoading = false
        if self.decision == nil {
            self.error = "Couldn't load this decision"
        }
        // Fire-and-forget "seen" stamp. Failure here is non-fatal — it only
        // affects the designer's read receipt, never the client's flow.
        await markViewed(decisionId: decisionId)
    }

    /// Whether a given option is the committed choice (local or server).
    func isSelected(_ option: RemoteDecisionOption) -> Bool {
        selectedOptionId == option.id || option.selected == true
    }

    /// Whether the decision is already resolved (any option chosen, or the
    /// status says so). Used to hide the per-option choose CTAs.
    var isResolved: Bool {
        decision?.isResolved == true || selectedOptionId != nil
    }

    /// Mark the option the client tapped — opens the consent step.
    func beginSelection(optionId: String) {
        guard !isResolved, !isSubmitting else { return }
        pendingOptionId = optionId
    }

    func cancelSelection() {
        pendingOptionId = nil
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
        do {
            try await DecisionsAPIClient.shared.selectOption(
                decisionId: decisionId,
                optionId: optionId,
                consent: consent,
                signature: signature
            )
            self.selectedOptionId = optionId
            self.pendingOptionId = nil
        } catch {
            self.error = "Couldn't submit your choice"
            #if DEBUG
            PatinaLog.ui.error("[Decisions] select failed: \(error.localizedDescription)")
            #endif
        }
        isSubmitting = false
    }

    private func markViewed(decisionId: String) async {
        // Only stamp once, and only when the server hasn't already.
        guard decision?.viewed_at == nil else { return }
        do {
            try await DecisionsAPIClient.shared.markViewed(decisionId: decisionId)
        } catch {
            #if DEBUG
            PatinaLog.ui.debug("[Decisions] markViewed failed: \(error.localizedDescription)")
            #endif
        }
    }
}
