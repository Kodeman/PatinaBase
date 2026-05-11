//
//  DecisionsViewModel.swift
//  Patina
//
//  Client-side decision workflow: list pending decisions, view options,
//  approve one. Designer-side sees the same data read-only via
//  DesignerHome.
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
            print("[Decisions] list failed: \(error.localizedDescription)")
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
    var isApproving: Bool = false
    var error: String?
    var approvedOptionId: String?

    func load(decisionId: String) async {
        isLoading = true
        error = nil
        async let decisionTask = (try? await DecisionsAPIClient.shared.fetchDecision(id: decisionId))
        async let optionsTask = (try? await DecisionsAPIClient.shared.listOptions(forDecision: decisionId)) ?? []
        let (d, o) = await (decisionTask, optionsTask)
        self.decision = d ?? nil
        self.options = o
        self.isLoading = false
        if self.decision == nil {
            self.error = "Couldn't load this decision"
        }
    }

    func approve(optionId: String, decisionId: String) async {
        guard !isApproving else { return }
        isApproving = true
        do {
            try await DecisionsAPIClient.shared.approve(decisionId: decisionId, optionId: optionId)
            self.approvedOptionId = optionId
        } catch {
            self.error = "Couldn't submit your choice"
            #if DEBUG
            print("[Decisions] approve failed: \(error.localizedDescription)")
            #endif
        }
        isApproving = false
    }
}
