//
//  ProjectApprovalPathTests.swift
//  PatinaTests
//
//  `P-09`. A `client_decisions` row carrying `approval_contract =
//  'project_artifact_v1'` is a Stage-2 approval of one frozen edition. Before
//  this it fell through to the option-card path, and a Stage-2 decision DOES
//  carry option rows — one per canonical outcome, which
//  `_respond_project_approval_checked` looks up by `approval_outcome`
//  (00464:620) — so a homeowner was shown three unlabelled cards with "Choose
//  this" over `apply_client_decision`, which refuses the contract.
//
//  The server side is pinned where it lives:
//  `supabase/tests/rls/00463_*.test.sql` and `00464_*.test.sql`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ProjectApprovalPathTests {

    private static let decisionId = "a0000000-0000-0000-0000-0000000009e1"

    // MARK: - The wire shape

    /// Decoded from the RPC's own JSON rather than constructed, so this pins
    /// that the projection's key names are what the app asks for. The shape is
    /// `get_project_decision_reviews`' `jsonb_build_object` (00465:370).
    private func review(
        lifecycleStatus: String = "pending",
        outcome: Any = NSNull(),
        disposition: String = "active",
        completed: Int = 1,
        required: Int = 1,
        authorityRevision: Any = 3,
        costCentsDelta: Int = 0,
        scheduleDaysDelta: Int = 0,
        leadTimeDaysDelta: Int = 0,
        context: Any = "Leah asked the mill to hold the walnut."
    ) throws -> RemoteProjectApprovalReview {
        let row: [String: Any] = [
            "decisionId": Self.decisionId,
            "projectId": "b0000000-0000-0000-0000-0000000000b1",
            "phaseId": "c0000000-0000-0000-0000-0000000000c1",
            "sectionKey": NSNull(),
            "authorityRevision": authorityRevision,
            "artifactKind": "spec_book_artifact",
            "artifactId": "d0000000-0000-0000-0000-0000000000d1",
            "artifactVersion": 3,
            "artifactChecksum": String(repeating: "a", count: 64),
            "artifactTitle": "Kitchen millwork spec",
            "question": "Approve the kitchen millwork as drawn?",
            "context": context,
            "dueAt": "2026-09-11T00:00:00+00:00",
            "costCentsDelta": costCentsDelta,
            "scheduleDaysDelta": scheduleDaysDelta,
            "leadTimeDaysDelta": leadTimeDaysDelta,
            "lifecycleStatus": lifecycleStatus,
            "outcome": outcome,
            "disposition": disposition,
            "isOverdue": false,
            "completedReviewCount": completed,
            "requiredReviewCount": required,
            "predecessorDecisionId": NSNull(),
            "successorDecisionId": NSNull(),
            "createdAt": "2026-09-01T00:00:00+00:00",
            "sentAt": "2026-09-02T00:00:00+00:00",
            "respondedAt": NSNull(),
            "updatedAt": "2026-09-04T10:15:00+00:00"
        ]
        return try JSONDecoder().decode(
            RemoteProjectApprovalReview.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }

    private func decision(
        contract: String? = "project_artifact_v1",
        status: String = "pending"
    ) throws -> RemoteClientDecision {
        var row: [String: Any] = [
            "id": Self.decisionId,
            "title": "Kitchen millwork",
            "description": "Leah asked the mill to hold the walnut.",
            "status": status,
            "decision_type": "approval",
            "coordination_kind": "signoff",
            "court": "client",
            "created_at": "2026-09-01T00:00:00Z"
        ]
        if let contract { row["approval_contract"] = contract }
        return try JSONDecoder().decode(
            RemoteClientDecision.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }

    private func option() throws -> RemoteDecisionOption {
        let row: [String: Any] = [
            "id": "e0000000-0000-0000-0000-0000000000e1",
            "decision_id": Self.decisionId,
            "title": "Approved"
        ]
        return try JSONDecoder().decode(
            RemoteDecisionOption.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }

    @Test("a Stage-2 row decodes every field the ceremony draws")
    func theProjectionDecodes() throws {
        let row = try review()
        #expect(row.decisionId == Self.decisionId)
        #expect(row.artifactTitle == "Kitchen millwork spec")
        #expect(row.artifactVersion == 3)
        #expect(row.artifactChecksum.count == 64)
        #expect(row.question == "Approve the kitchen millwork as drawn?")
        #expect(row.context == "Leah asked the mill to hold the walnut.")
        #expect(row.dueAt == "2026-09-11T00:00:00+00:00")
        #expect(row.authorityRevision == 3)
        #expect(row.updatedAt == "2026-09-04T10:15:00+00:00")
        #expect(row.outcome == nil)
        #expect(row.recordedOutcome == nil)
        #expect(row.id == row.decisionId)
    }

    /// Nullable columns arrive as JSON null, not as absent keys.
    @Test("the nullable columns decode as nil rather than throwing")
    func theNullablesDecode() throws {
        let row = try review(authorityRevision: NSNull(), context: NSNull())
        #expect(row.context == nil)
        #expect(row.authorityRevision == nil)
    }

    @Test("a recorded outcome decodes to the app's word for it",
          arguments: zip(
            ["approved", "changes_requested", "needs_discussion"],
            ProjectApprovalOutcome.allCases
          ))
    func theOutcomeDecodes(raw: String, expected: ProjectApprovalOutcome) throws {
        #expect(try review(outcome: raw).recordedOutcome == expected)
    }

    /// The raw values are the server's — `client_decision_options
    /// .approval_outcome`, checked in `_respond_project_approval_checked`.
    @Test("the three outcomes keep the server's own words")
    func theOutcomeVocabularyIsTheServers() {
        #expect(ProjectApprovalOutcome.approved.rawValue == "approved")
        #expect(ProjectApprovalOutcome.changesRequested.rawValue == "changes_requested")
        #expect(ProjectApprovalOutcome.needsDiscussion.rawValue == "needs_discussion")
        #expect(ProjectApprovalOutcome.allCases.count == 3)
    }

    // MARK: - The review-required branch

    /// `confirm_project_decision_review` accepts a `draft` decision only, and
    /// refuses a payload without the frozen revision — so the act is offered on
    /// exactly that shape and on nothing else.
    @Test("the review act is offered on an unreviewed draft")
    func theReviewActIsOfferedOnADraft() throws {
        let row = try review(lifecycleStatus: "draft", completed: 0, required: 1)
        #expect(row.needsReviewConfirmation)
        #expect(row.reviewConfirmationUnavailable == false)
        #expect(row.isAwaitingStudioIssue == false)
        #expect(row.canRespond == false, "an unreviewed draft cannot be answered")
    }

    @Test("a draft with no frozen revision says so instead of drawing a dead act")
    func theReviewActIsWithheldWithoutARevision() throws {
        let row = try review(
            lifecycleStatus: "draft", completed: 0, required: 1, authorityRevision: NSNull()
        )
        #expect(row.needsReviewConfirmation == false)
        #expect(row.reviewConfirmationUnavailable)
    }

    @Test("a reviewed draft is with the studio, and offers nothing")
    func aReviewedDraftIsWithTheStudio() throws {
        let row = try review(lifecycleStatus: "draft", completed: 1, required: 1)
        #expect(row.needsReviewConfirmation == false)
        #expect(row.isAwaitingStudioIssue)
        #expect(row.canRespond == false)
    }

    /// Every leg `_respond_project_approval_checked` applies that the client
    /// can see: pending, active, reviewed, unanswered.
    @Test("the outcome acts are offered on a pending, reviewed, unanswered approval")
    func theOutcomeActsAreOfferedOnce() throws {
        #expect(try review().canRespond)
        #expect(try review(lifecycleStatus: "expired").canRespond == false)
        #expect(try review(lifecycleStatus: "responded").canRespond == false)
        #expect(try review(outcome: "approved").canRespond == false)
        #expect(try review(disposition: "withdrawn").canRespond == false)
        #expect(try review(disposition: "superseded").canRespond == false)
        #expect(try review(completed: 0, required: 1).canRespond == false)
        #expect(try review(completed: 1, required: 2).canRespond == false)
    }

    // MARK: - The screen's decision about which ceremony to draw

    /// The point of the item: a Stage-2 row carries option rows and must not
    /// be drawn as a choice between them.
    @Test("a Stage-2 decision never renders the option-card path")
    func aStage2DecisionIsNotAnOptionChoice() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.options = [try option(), try option(), try option()]

        #expect(viewModel.isStage2Approval)
        #expect(viewModel.awaitsClientSignoff == false,
                "00564's sign-off act refuses a project_artifact_v1 row")
        #expect(viewModel.hasNoOptionsAtAll == false)
        #expect(viewModel.decision?.isClientSignoff == false)

        // …and the view asks the Stage-2 question before it ever reaches the
        // option cards, so the branch order cannot drift.
        let view = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/DecisionDetailView.swift"
        )
        let stage2 = try #require(view.range(of: "if viewModel.isStage2Approval {"))
        let cards = try #require(view.range(of: "optionCard(option)"))
        #expect(stage2.lowerBound < cards.lowerBound)
        #expect(view.contains("ProjectApprovalBlock(viewModel: viewModel)"))
    }

    @Test("a decision with no contract keeps the option-card path")
    func aPlainDecisionIsUntouched() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision(contract: nil)
        viewModel.options = [try option()]
        #expect(viewModel.isStage2Approval == false)
        #expect(viewModel.approvalUnavailable == false)
    }

    /// A failed read must not fall back to the wrong ceremony: the screen says
    /// it could not open the approval and draws no option cards.
    @Test("a Stage-2 decision whose projection never arrived says so")
    func aMissingProjectionIsNamed() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.fetchApprovalReviews = { throw Boom() }

        await viewModel.loadApprovalReview(decisionId: Self.decisionId)
        #expect(viewModel.approvalReview == nil)
        #expect(viewModel.approvalUnavailable)
        #expect(viewModel.isStage2Approval, "the branch is decided on the decision")
    }

    /// Deep links carry whatever case the sender used.
    @Test("the caller-global list is narrowed to this decision, case-insensitively")
    func theListIsNarrowedToThisDecision() async throws {
        let row = try review()
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.fetchApprovalReviews = { [row] }

        await viewModel.loadApprovalReview(decisionId: Self.decisionId.uppercased())
        #expect(viewModel.approvalReview?.decisionId == Self.decisionId)
    }

    @Test("a decision that is not Stage-2 never reads the approval list")
    func aPlainDecisionSkipsTheList() async throws {
        var asked = false
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision(contract: nil)
        viewModel.fetchApprovalReviews = { asked = true; return [] }

        await viewModel.loadApprovalReview(decisionId: Self.decisionId)
        #expect(asked == false)
        #expect(viewModel.approvalReview == nil)
    }

    // MARK: - The two acts, and what they send

    @Test("the review act sends the frozen revision and the artifact hash")
    func theReviewActSendsTheCASPair() async throws {
        struct Sent { let id: String; let revision: Int; let checksum: String; let key: String }
        var sent: Sent?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.approvalReview = try review(
            lifecycleStatus: "draft", completed: 0, required: 1
        )
        viewModel.confirmApprovalReview = { id, revision, checksum, key in
            sent = Sent(id: id, revision: revision, checksum: checksum, key: key)
        }

        await viewModel.confirmExactEdition()

        let call = try #require(sent, "the review never reached the RPC")
        #expect(call.id == Self.decisionId)
        #expect(call.revision == 3)
        #expect(call.checksum == String(repeating: "a", count: 64))
        #expect(!call.key.isEmpty, "the RPC refuses an empty idempotency key")
        #expect(viewModel.reviewConfirmed)
        #expect(viewModel.submitFailure == nil)
        #expect(viewModel.isSubmitting == false)
    }

    @Test("a review that fails says so and leaves the approval open")
    func aFailedReviewSaysSo() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.approvalReview = try review(
            lifecycleStatus: "draft", completed: 0, required: 1
        )
        viewModel.confirmApprovalReview = { _, _, _, _ in throw Boom() }

        await viewModel.confirmExactEdition()

        #expect(viewModel.submitFailure == MoneyFailureCopy.approvalReview)
        #expect(viewModel.reviewConfirmed == false)
        #expect(viewModel.isSubmitting == false)
    }

    /// Each of the three outcomes reaches `respond_project_approval` as itself,
    /// with the row's own `updatedAt` as the CAS value the RPC demands.
    @Test("each outcome is submitted with the row's own updatedAt",
          arguments: ProjectApprovalOutcome.allCases)
    func eachOutcomeIsSubmittedAsItself(outcome: ProjectApprovalOutcome) async throws {
        struct Sent {
            let id: String
            let outcome: ProjectApprovalOutcome
            let expectedUpdatedAt: String
            let key: String
        }
        var sent: Sent?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.approvalReview = try review()
        viewModel.respondToApproval = { id, chosen, expectedUpdatedAt, key in
            sent = Sent(id: id, outcome: chosen, expectedUpdatedAt: expectedUpdatedAt, key: key)
        }

        viewModel.chooseOutcome(outcome)
        #expect(viewModel.chosenOutcome == outcome, "choosing records nothing yet")
        #expect(sent == nil, "choosing an outcome must not write one")

        await viewModel.submitApprovalResponse()

        let call = try #require(sent, "the outcome never reached the RPC")
        #expect(call.id == Self.decisionId)
        #expect(call.outcome == outcome)
        #expect(call.expectedUpdatedAt == "2026-09-04T10:15:00+00:00")
        #expect(!call.key.isEmpty)
        #expect(viewModel.hasAnsweredApproval)
        #expect(viewModel.isResolved)
        #expect(viewModel.chosenOutcome == nil)
        #expect(viewModel.submitFailure == nil)
    }

    @Test("an outcome cannot be chosen on an approval that cannot take one")
    func anUnanswerableApprovalRefusesTheChoice() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.approvalReview = try review(lifecycleStatus: "draft", completed: 0, required: 1)
        viewModel.chooseOutcome(.approved)
        #expect(viewModel.chosenOutcome == nil)
    }

    @Test("a response that fails says so, and the chosen outcome survives the retry")
    func aFailedResponseKeepsTheChoice() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try decision()
        viewModel.approvalReview = try review()
        viewModel.respondToApproval = { _, _, _, _ in throw Boom() }

        viewModel.chooseOutcome(.changesRequested)
        await viewModel.submitApprovalResponse()

        #expect(viewModel.submitFailure == MoneyFailureCopy.approvalResponse)
        #expect(viewModel.hasAnsweredApproval == false)
        #expect(viewModel.isResolved == false)
        #expect(viewModel.chosenOutcome == .changesRequested)

        // SP-15's retry on this path: the banner clears and Submit is live
        // again — there is no consent step here to re-open.
        viewModel.retrySelection()
        #expect(viewModel.submitFailure == nil)
        #expect(viewModel.chosenOutcome == .changesRequested)
        #expect(viewModel.isApprovingSignoff == false)
        #expect(viewModel.pendingOptionId == nil)
    }

    // MARK: - The wire

    @Test("the client reads the client-scoped list RPC, not the studio one")
    func theClientReadsTheClientScopedList() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func listProjectApprovalReviews("))
        let body = String(source[start.lowerBound...].prefix(900))
        #expect(body.contains("/rest/v1/rpc/list_my_project_decision_reviews"))
        // `get_project_decision_reviews` is studio-scoped and answers a
        // homeowner with `insufficient_privilege`.
        #expect(!body.contains("rpc/get_project_decision_reviews"))
    }

    /// The parameters `use-project-approvals.ts` sends, argument for argument.
    @Test("the review RPC is called with the web's own parameters")
    func theReviewRPCParametersMatchTheWeb() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func confirmProjectApprovalReview("))
        let body = String(source[start.lowerBound...].prefix(1400))
        #expect(body.contains("/rest/v1/rpc/confirm_project_decision_review"))
        #expect(body.contains("\"p_decision_id\": decisionId"))
        #expect(body.contains("\"authorityRevision\": authorityRevision"))
        #expect(body.contains("\"artifactHash\": artifactChecksum"))
        #expect(body.contains("\"reviewMethod\": \"portal_clickthrough\""))
        #expect(body.contains("\"p_idempotency_key\": idempotencyKey"))
    }

    @Test("the response RPC is called with the web's own parameters")
    func theResponseRPCParametersMatchTheWeb() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func respondToProjectApproval("))
        let body = String(source[start.lowerBound...].prefix(1400))
        #expect(body.contains("/rest/v1/rpc/respond_project_approval"))
        #expect(body.contains("\"p_decision_id\": decisionId"))
        #expect(body.contains("\"outcome\": outcome.rawValue"))
        #expect(body.contains("\"p_expected_updated_at\": expectedUpdatedAt"))
        #expect(body.contains("\"p_idempotency_key\": idempotencyKey"))
        // The payload admits exactly one of outcome / optionId, and iOS sends
        // the outcome — an option id would answer the wrong question.
        #expect(!body.contains("optionId"))
    }

    // MARK: - The words

    /// Verb, then consequence. Not the web's strings: "gate" is refused on
    /// every client-facing surface, and the homeowner approves an EDITION.
    @Test("the three acts read verb-then-consequence, in the house's words")
    func theActsReadVerbThenConsequence() {
        let acts = ProjectApprovalCopy.acts
        #expect(acts.map(\.outcome) == [.approved, .needsDiscussion, .changesRequested])
        #expect(acts[0].label == "Approve")
        #expect(acts[0].consequence == "Accept this exact edition and its stated impacts.")
        #expect(acts[1].label == "Ask a question")
        #expect(acts[1].consequence == "Hold this while you and your designer talk it through.")
        #expect(acts[2].label == "Decline")
        #expect(acts[2].consequence == "Return this edition for revision and a new approval request.")
    }

    @Test("the immutability sentence names the edition it binds")
    func theImmutabilitySentenceNamesTheEdition() {
        #expect(
            ProjectApprovalCopy.immutability(edition: 3)
                == "You are approving edition 3, exactly as shown."
        )
    }

    @Test("an edition that changes nothing says so in one line")
    func nothingChangedIsALine() {
        #expect(
            ProjectApprovalCopy.impacts(
                costCentsDelta: 0, scheduleDaysDelta: 0, leadTimeDaysDelta: 0
            ).isEmpty
        )
        #expect(ProjectApprovalCopy.noImpact == "No cost, schedule or lead-time change.")
    }

    /// R11: the three deltas stand independently, and a zero is not a row.
    @Test("the impacts are stated independently, and a zero is silence")
    func theImpactsStandIndependently() {
        let rows = ProjectApprovalCopy.impacts(
            costCentsDelta: 120_000, scheduleDaysDelta: 0, leadTimeDaysDelta: -1
        )
        #expect(rows.map(\.label) == ["Cost", "Lead time"])
        #expect(rows[0].value == "+$1,200")
        #expect(rows[1].value == "−1 day")
        #expect(ProjectApprovalCopy.days(3) == "+3 days")
        #expect(ProjectApprovalCopy.money(-45_000) == "−$450")
    }

    /// The vocabulary refusals, on every string this screen prints.
    @Test("no refused word reaches the approval screen")
    func theRefusedWordsAreAbsent() throws {
        var strings = ProjectApprovalCopy.acts.flatMap { [$0.label, $0.consequence] }
        strings += [
            ProjectApprovalCopy.eyebrow,
            ProjectApprovalCopy.reviewPrompt,
            ProjectApprovalCopy.reviewAction,
            ProjectApprovalCopy.reviewConfirmed,
            ProjectApprovalCopy.awaitingStudioIssue,
            ProjectApprovalCopy.reviewUnavailable,
            ProjectApprovalCopy.choosePrompt,
            ProjectApprovalCopy.submitAction,
            ProjectApprovalCopy.chooseAgainAction,
            ProjectApprovalCopy.unavailable,
            ProjectApprovalCopy.noImpact,
            ProjectApprovalCopy.immutability(edition: 2)
        ]
        // "AI" is refused as a WORD; as a substring it lives inside "again".
        for refused in ["gate", "task", "dashboard", "overdue"] {
            for line in strings {
                #expect(
                    !line.lowercased().contains(refused.lowercased()),
                    "\"\(line)\" carries the refused word \"\(refused)\""
                )
            }
        }
        #expect(ProjectApprovalCopy.eyebrow == "APPROVAL")
        #expect(ProjectApprovalCopy.reviewAction == "Review exact edition")
        #expect(ProjectApprovalCopy.submitAction == "Submit response")
    }

    /// No red, no green, no checkmark: the ceremony's own block carries no
    /// status colour at all.
    @Test("the approval block draws no status colour and no seal glyph")
    func theApprovalBlockHasNoStatusColour() throws {
        let block = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        for banned in [
            "PatinaColors.sage", "PatinaColors.Text.error", "PatinaColors.error",
            "checkmark", "systemName:"
        ] {
            #expect(!block.contains(banned), "the block draws \(banned)")
        }
    }
}
