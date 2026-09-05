//
//  ProjectApprovalActTests.swift
//  PatinaTests
//
//  `P-09`, half two: the two acts a Stage-2 approval offers, the parameters
//  they send, and the words they are offered in.
//
//  The shapes they run on are in `ProjectApprovalPathTests`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ProjectApprovalActTests {

    // MARK: - The two acts, and what they send

    @Test("the review act sends the frozen revision and the artifact hash")
    func theReviewActSendsTheCASPair() async throws {
        struct Sent { let id: String; let revision: Int; let checksum: String; let key: String }
        var sent: Sent?
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1
        )
        viewModel.confirmApprovalReview = { id, revision, checksum, key in
            sent = Sent(id: id, revision: revision, checksum: checksum, key: key)
        }

        await viewModel.confirmExactEdition()

        let call = try #require(sent, "the review never reached the RPC")
        #expect(call.id == ProjectApprovalFixture.decisionId)
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
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review(
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
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.respondToApproval = { id, chosen, expectedUpdatedAt, key in
            sent = Sent(id: id, outcome: chosen, expectedUpdatedAt: expectedUpdatedAt, key: key)
        }

        viewModel.chooseOutcome(outcome)
        #expect(viewModel.chosenOutcome == outcome, "choosing records nothing yet")
        #expect(sent == nil, "choosing an outcome must not write one")

        await viewModel.submitApprovalResponse()

        let call = try #require(sent, "the outcome never reached the RPC")
        #expect(call.id == ProjectApprovalFixture.decisionId)
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
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review(lifecycleStatus: "draft", completed: 0, required: 1)
        viewModel.chooseOutcome(.approved)
        #expect(viewModel.chosenOutcome == nil)
    }

    @Test("a response that fails says so, and the chosen outcome survives the retry")
    func aFailedResponseKeepsTheChoice() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
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
        #expect(body.contains("callRPC(\"list_my_project_decision_reviews\""))
        // `get_project_decision_reviews` is studio-scoped and answers a
        // homeowner with `insufficient_privilege`.
        #expect(!body.contains("get_project_decision_reviews"))
    }

    /// The parameters `use-project-approvals.ts` sends, argument for argument.
    @Test("the review RPC is called with the web's own parameters")
    func theReviewRPCParametersMatchTheWeb() throws {
        let source = try SourcePin.read(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        let start = try #require(source.range(of: "public func confirmProjectApprovalReview("))
        let body = String(source[start.lowerBound...].prefix(1400))
        #expect(body.contains("callRPC(\"confirm_project_decision_review\""))
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
        #expect(body.contains("callRPC(\"respond_project_approval\""))
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
