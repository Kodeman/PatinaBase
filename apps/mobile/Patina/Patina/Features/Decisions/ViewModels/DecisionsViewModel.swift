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
            self.error = "Couldn’t load decisions"
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

    // MARK: - P-09 · the Stage-2 approval

    /// The client-safe projection for a `project_artifact_v1` decision, read
    /// from `list_my_project_decision_reviews`. Nil for every other decision,
    /// and nil for a Stage-2 decision whose fetch failed — which is a state
    /// the screen names, never one it falls back to option cards from.
    var approvalReview: RemoteProjectApprovalReview?

    /// The outcome the client has picked but not yet submitted. An outcome is
    /// terminal, so it takes two beats: the act names its consequence, and the
    /// client submits it.
    var chosenOutcome: ProjectApprovalOutcome?

    /// Said once the review of the exact edition has been recorded.
    var reviewConfirmed: Bool = false

    /// Whichever ceremony this decision belongs to.
    ///
    /// The PROJECTION comes first, and has to: 00467:18-38 cut
    /// `approval_contract = 'project_artifact_v1'` out of every raw
    /// `client_decisions` SELECT policy a homeowner can reach, so for the very
    /// person being asked `decision` is nil on exactly the rows this branch
    /// exists for. The row is consulted second, for the studio co-member who
    /// can still see it and for a Stage-2 row whose projection failed to
    /// arrive — a failed fetch must never let one fall through to the option
    /// cards, whose act (`apply_client_decision`) refuses it.
    var isStage2Approval: Bool {
        approvalReview != nil || decision?.isProjectArtifactApproval == true
    }

    /// The approval is a Stage-2 one and its projection did not arrive.
    var approvalUnavailable: Bool {
        isStage2Approval && !isLoading && approvalReview == nil
    }

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
        if let projectId = decision?.project_id ?? approvalReview?.projectId,
           !projectId.isEmpty {
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
        await loadApprovalReview(decisionId: decisionId)
        await resolveDiscussThread()
        // Seed local selection from whatever the server already has, so a
        // re-open of a resolved decision shows the choice without re-asking.
        self.selectedOptionId = o.first(where: { $0.selected == true })?.id
        self.isLoading = false
        // A Stage-2 approval is a load that SUCCEEDED with no row: 00467 hides
        // the parent row from the homeowner and hands her the projection
        // instead. Reporting that as a failure was the screen she actually got.
        if self.decision == nil, self.approvalReview == nil {
            self.error = "Couldn’t load this decision"
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

    /// `W1-B-03`: the decision loaded and carries **no options row at all**.
    /// Distinct from `hasNoRenderableOptions`, which is about options that
    /// exist and render blank. Gated on the decision having loaded, so the
    /// line is never printed over a screen that is still fetching.
    ///
    /// A client-court sign-off is excluded: it carries no options BY DESIGN —
    /// the absence is the shape of the decision, not a gap in it — and it has
    /// its own act below.
    var hasNoOptionsAtAll: Bool {
        decision != nil && !isLoading && options.isEmpty
            && decision?.isClientSignoff != true
    }

    /// `W1-B-03`, the act itself: this decision is a sign-off the client is
    /// the one to give, and it is still waiting on them.
    ///
    /// `options.isEmpty` is part of the predicate because `approve_client_
    /// signoff` refuses a decision that carries options — a row a designer has
    /// since given choices to is answered by choosing one, and offering both
    /// is how a client and a designer come to read different answers.
    ///
    /// `!isResolved` is not enough: it reads `status == "responded"`, so an
    /// EXPIRED sign-off passed it, drew "Give your sign-off", and was refused
    /// by the RPC with a `check_violation` (23514) — an act offered that
    /// cannot succeed. `isApprovableClientSignoff` is the status leg the
    /// server actually applies.
    var awaitsClientSignoff: Bool {
        guard let decision, !isLoading, !isResolved else { return false }
        return decision.isApprovableClientSignoff && options.isEmpty
    }

    /// Whether the decision is already resolved (any option chosen, a sign-off
    /// given, or the status says so). Used to hide the per-option choose CTAs.
    var isResolved: Bool {
        decision?.isResolved == true || selectedOptionId != nil || hasSignedOff
            || hasAnsweredApproval
    }

    /// `W1-B-03`: the sign-off landed in this session. The server row is
    /// `responded` and the next load will say so; until then this is what
    /// stops the screen offering the act a second time.
    private(set) var hasSignedOff: Bool = false

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
    /// option the failed submit was carrying — or, on a sign-off, on the
    /// sign-off itself, which carries no option to remember.
    func retrySelection() {
        guard !isSubmitting, !isResolved else { return }
        // P-09: the chosen outcome survives a failed submit, so the retry is
        // the banner going away and Submit becoming live again — there is no
        // consent step on this path to re-open.
        if isStage2Approval {
            submitFailure = nil
            return
        }
        if awaitsClientSignoff {
            submitFailure = nil
            isApprovingSignoff = true
            return
        }
        guard let optionId = lastAttemptedOptionId else { return }
        submitFailure = nil
        pendingOptionId = optionId
    }

    // MARK: - W1-B-03 · the sign-off

    /// Whether the consent step is up for the sign-off. The mirror of
    /// `pendingOptionId`, which a sign-off has nothing to put in.
    var isApprovingSignoff: Bool = false

    func beginSignoff() {
        guard awaitsClientSignoff, !isSubmitting else { return }
        isApprovingSignoff = true
    }

    func cancelSignoff() {
        isApprovingSignoff = false
    }

    /// Give the sign-off with the client's consent. On success the decision is
    /// `responded` server-side and every FF&E item held by it is released —
    /// which is the one thing Procurement was waiting on.
    /// The act itself, behind a seam. Both of `confirmSignoff`'s branches are
    /// what a client sees — the seal, or the failure banner with its retry —
    /// and neither is reachable from a test through the singleton actor's own
    /// network call.
    @ObservationIgnored
    var approveSignoff: (
        String, DecisionsAPIClient.ConsentMethod, String?
    ) async throws -> Void = { decisionId, consent, signature in
        try await DecisionsAPIClient.shared.approveSignoff(
            decisionId: decisionId,
            consent: consent,
            signature: signature
        )
    }

    func confirmSignoff(
        decisionId: String,
        consent: DecisionsAPIClient.ConsentMethod,
        signature: String? = nil
    ) async {
        guard isApprovingSignoff, !isSubmitting else { return }
        isSubmitting = true
        error = nil
        submitFailure = nil
        do {
            try await approveSignoff(decisionId, consent, signature)
            self.hasSignedOff = true
            self.isApprovingSignoff = false
        } catch {
            MoneyFailureCopy.log("decision", error)
            self.submitFailure = MoneyFailureCopy.decision
            self.isApprovingSignoff = false
        }
        isSubmitting = false
    }

    // MARK: - P-09 · the Stage-2 acts, behind their seams

    /// The read, behind a seam. Same reason as `approveSignoff`: the singleton
    /// actor's network call is not reachable from a test.
    /// Argument: the decision id.
    @ObservationIgnored
    var fetchApprovalReview: (String) async throws -> RemoteProjectApprovalReview? = { decisionId in
        try await DecisionsAPIClient.shared.fetchProjectApprovalReview(decisionId: decisionId)
    }

    /// `confirm_project_decision_review`, behind a seam.
    /// Arguments: decision id, frozen authority revision, artifact checksum,
    /// idempotency key.
    @ObservationIgnored
    var confirmApprovalReview: (String, Int, String, String) async throws -> Void = { decisionId, revision, checksum, key in
        try await DecisionsAPIClient.shared.confirmProjectApprovalReview(
            decisionId: decisionId,
            authorityRevision: revision,
            artifactChecksum: checksum,
            idempotencyKey: key
        )
    }

    /// `respond_project_approval`, behind a seam.
    /// Arguments: decision id, outcome, expected `updatedAt`, idempotency key.
    @ObservationIgnored
    var respondToApproval: (String, ProjectApprovalOutcome, String, String) async throws -> Void = { decisionId, outcome, expectedUpdatedAt, key in
        try await DecisionsAPIClient.shared.respondToProjectApproval(
            decisionId: decisionId,
            outcome: outcome,
            expectedUpdatedAt: expectedUpdatedAt,
            idempotencyKey: key
        )
    }

    /// The outcome recorded in this session. The server row is `responded` and
    /// the next load will carry the word itself; until then this is what stops
    /// the screen offering the three acts a second time, and what lets it name
    /// the answer she just gave.
    var answeredOutcome: ProjectApprovalOutcome?

    var hasAnsweredApproval: Bool { answeredOutcome != nil }

    /// Look up the project's comms thread for the "Discuss this" action.
    /// Non-fatal: any failure (no project, no thread, RLS, network) just
    /// leaves the action hidden.
    private func resolveDiscussThread() async {
        guard let projectId = decision?.project_id ?? approvalReview?.projectId,
              !projectId.isEmpty else {
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
