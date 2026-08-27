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
    /// The project's comms thread, when one exists and is visible to the
    /// user — drives the "Discuss this" action. Nil hides the action.
    var discussThreadId: String?
    /// SP-15: a failed submit used to be written into `error`, which the view
    /// only draws when the decision itself failed to load — so the client tapped
    /// Approve and nothing at all happened.
    var submitFailure: MoneyFailure?
    /// The option a failed submit was carrying, so "Let's try that again"
    /// re-opens the consent step on the choice the client actually made
    /// instead of dropping her back into the list of options.
    var lastAttemptedOptionId: String?

    // MARK: - SP-17 · deferral

    /// The deferral the client tapped — drives the note sheet.
    var pendingDeferral: DecisionDeferral?
    var isSendingDeferral: Bool = false
    var deferralFailure: MoneyFailure?
    /// Set once a deferral note has landed in the thread, so the screen can
    /// say so without pretending the decision was answered.
    private(set) var sentDeferral: DecisionDeferral?

    func beginDeferral(_ deferral: DecisionDeferral) {
        guard !isResolved, !isSendingDeferral, canDefer else { return }
        deferralFailure = nil
        pendingDeferral = deferral
    }

    func cancelDeferral() {
        pendingDeferral = nil
    }

    /// Where a message about this decision belongs.
    ///
    /// `client_decisions.project_id` is nullable — `REFERENCES projects(id) ON
    /// DELETE SET NULL` (00062:71) — so a decision reached through a lead, or
    /// one whose project was deleted, has no project thread. Gating the
    /// deferral on the project alone drew both acts, opened the sheet, took the
    /// note and then failed every time. W1a merged `createDirectThread` for
    /// exactly this case.
    enum MessageRoute: Equatable {
        case project(String)
        case direct(UUID)
    }

    var messageRoute: MessageRoute? {
        if let projectId = decision?.project_id, !projectId.isEmpty {
            return .project(projectId)
        }
        let relationship = DesignerRelationshipResolver.resolve(
            lead: DesignRequestStatusService.shared.liveLead,
            projects: BadgeCountService.shared.projects,
            roster: BadgeCountService.shared.roster
        )
        if let designerId = relationship.designerId { return .direct(designerId) }
        return nil
    }

    /// Whether the two deferral acts have anywhere to send a note. Where they
    /// do not, they do not draw — an act that cannot succeed is not offered.
    var canDefer: Bool { messageRoute != nil }

    private func openThread(_ route: MessageRoute) async throws -> String {
        switch route {
        case .project(let projectId):
            return try await MessagingAPIClient.shared.createThread(projectId: projectId)
        case .direct(let designerId):
            return try await MessagingAPIClient.shared.createDirectThread(counterpart: designerId)
        }
    }

    /// Open (or create) the thread behind "Message your designer" on the
    /// failure banner. Nil where there is no designer to reach.
    func messageDesigner() async -> String? {
        if let discussThreadId { return discussThreadId }
        guard let route = messageRoute else { return nil }
        do {
            let threadId = try await openThread(route)
            self.discussThreadId = threadId
            return threadId
        } catch {
            MoneyFailureCopy.log("decision message", error)
            return nil
        }
    }

    /// Send the note into the thread. The decision is deliberately NOT
    /// touched — `client_decisions.status` has no "deferred" value and a
    /// deferral is a message, not a response (00062:80-81).
    /// - Returns: the thread the note landed in, for the caller to open.
    @discardableResult
    func sendDeferral(note: String) async -> String? {
        guard let deferral = pendingDeferral, !isSendingDeferral else { return nil }
        guard let route = messageRoute else {
            deferralFailure = MoneyFailureCopy.deferral
            return nil
        }
        isSendingDeferral = true
        deferralFailure = nil
        defer { isSendingDeferral = false }
        do {
            let threadId = try await openThread(route)
            _ = try await MessagingAPIClient.shared.sendMessage(threadId: threadId, body: note)
            self.discussThreadId = threadId
            self.sentDeferral = deferral
            self.pendingDeferral = nil
            return threadId
        } catch {
            MoneyFailureCopy.log("decision deferral", error)
            self.deferralFailure = MoneyFailureCopy.deferral
            return nil
        }
    }

    func load(decisionId: String) async {
        isLoading = true
        error = nil
        async let decisionTask = (try? await DecisionsAPIClient.shared.fetchDecision(id: decisionId))
        async let optionsTask = (try? await DecisionsAPIClient.shared.listOptions(forDecision: decisionId)) ?? []
        let (d, o) = await (decisionTask, optionsTask)
        self.decision = d ?? nil
        self.options = o
        await resolveDiscussThread()
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

    /// SP-17: options exist but not one of them has a title, a note or an
    /// image — a stack of blank cards nobody can choose. The screen says so
    /// instead of drawing them.
    var hasNoRenderableOptions: Bool {
        !options.isEmpty && !options.contains { $0.hasRenderableContent }
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
        } catch {
            MoneyFailureCopy.log("decision", error)
            self.submitFailure = MoneyFailureCopy.decision
            self.lastAttemptedOptionId = optionId
            self.pendingOptionId = nil
        }
        isSubmitting = false
    }

    /// SP-15's first act on the decision path: re-open the consent step on the
    /// option the failed submit was carrying.
    func retrySelection() {
        guard let optionId = lastAttemptedOptionId, !isSubmitting, !isResolved else { return }
        submitFailure = nil
        pendingOptionId = optionId
    }

    /// Look up the project's comms thread for the "Discuss this" action.
    /// Non-fatal: any failure (no project, no thread, RLS, network) just
    /// leaves the action hidden.
    private func resolveDiscussThread() async {
        guard let projectId = decision?.project_id, !projectId.isEmpty else {
            discussThreadId = nil
            return
        }
        discussThreadId = (try? await DecisionsAPIClient.shared
            .findProjectThread(projectId: projectId)) ?? nil
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
