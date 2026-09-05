//
//  ProjectApprovalPathTests.swift
//  PatinaTests
//
//  `P-09`, half one: the wire shape, the branch each approval state belongs to,
//  and which ceremony the screen draws.
//
//  A `client_decisions` row carrying `approval_contract = 'project_artifact_v1'`
//  is a Stage-2 approval of one frozen edition. Before this it fell through to
//  the option-card path, and a Stage-2 decision DOES carry option rows — one per
//  canonical outcome, which `_respond_project_approval_checked` looks up by
//  `approval_outcome` (00464:620) — so a homeowner was shown three unlabelled
//  cards with "Choose this" over `apply_client_decision`, which refuses the
//  contract.
//
//  The acts are in `ProjectApprovalActTests`. The server side is pinned where
//  it lives: `supabase/tests/rls/00463_*.test.sql` and `00464_*.test.sql`.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ProjectApprovalPathTests {

    @Test("a Stage-2 row decodes every field the ceremony draws")
    func theProjectionDecodes() throws {
        let row = try ProjectApprovalFixture.review()
        #expect(row.decisionId == ProjectApprovalFixture.decisionId)
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
        let row = try ProjectApprovalFixture.review(authorityRevision: NSNull(), context: NSNull())
        #expect(row.context == nil)
        #expect(row.authorityRevision == nil)
    }

    @Test("a recorded outcome decodes to the app's word for it",
          arguments: zip(
            ["approved", "changes_requested", "needs_discussion"],
            ProjectApprovalOutcome.allCases
          ))
    func theOutcomeDecodes(raw: String, expected: ProjectApprovalOutcome) throws {
        #expect(try ProjectApprovalFixture.review(outcome: raw).recordedOutcome == expected)
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
        let row = try ProjectApprovalFixture.review(lifecycleStatus: "draft", completed: 0, required: 1)
        #expect(row.needsReviewConfirmation)
        #expect(row.reviewConfirmationUnavailable == false)
        #expect(row.isAwaitingStudioIssue == false)
        #expect(row.canRespond == false, "an unreviewed draft cannot be answered")
    }

    @Test("a draft with no frozen revision says so instead of drawing a dead act")
    func theReviewActIsWithheldWithoutARevision() throws {
        let row = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1, authorityRevision: NSNull()
        )
        #expect(row.needsReviewConfirmation == false)
        #expect(row.reviewConfirmationUnavailable)
    }

    @Test("a reviewed draft is with the studio, and offers nothing")
    func aReviewedDraftIsWithTheStudio() throws {
        let row = try ProjectApprovalFixture.review(lifecycleStatus: "draft", completed: 1, required: 1)
        #expect(row.needsReviewConfirmation == false)
        #expect(row.isAwaitingStudioIssue)
        #expect(row.canRespond == false)
    }

    /// Every leg `_respond_project_approval_checked` applies that the client
    /// can see: pending, active, reviewed, unanswered.
    @Test("the outcome acts are offered on a pending, reviewed, unanswered approval")
    func theOutcomeActsAreOfferedOnce() throws {
        #expect(try ProjectApprovalFixture.review().canRespond)
        #expect(try ProjectApprovalFixture.review(lifecycleStatus: "expired").canRespond == false)
        #expect(try ProjectApprovalFixture.review(lifecycleStatus: "responded").canRespond == false)
        #expect(try ProjectApprovalFixture.review(outcome: "approved").canRespond == false)
        #expect(try ProjectApprovalFixture.review(disposition: "withdrawn").canRespond == false)
        #expect(try ProjectApprovalFixture.review(disposition: "superseded").canRespond == false)
        #expect(try ProjectApprovalFixture.review(completed: 0, required: 1).canRespond == false)
        #expect(try ProjectApprovalFixture.review(completed: 1, required: 2).canRespond == false)
    }

    // MARK: - The screen's decision about which ceremony to draw

    /// The point of the item: a Stage-2 row carries option rows and must not
    /// be drawn as a choice between them.
    @Test("a Stage-2 decision never renders the option-card path")
    func aStage2DecisionIsNotAnOptionChoice() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.options = [try ProjectApprovalFixture.option(), try ProjectApprovalFixture.option(), try ProjectApprovalFixture.option()]

        #expect(viewModel.isStage2Approval)
        #expect(viewModel.awaitsClientSignoff == false,
                "00564's sign-off act refuses a project_artifact_v1 row")
        #expect(viewModel.hasNoOptionsAtAll == false)
        #expect(viewModel.decision?.isClientSignoff == false)

        // …and the one chain that decides which ceremony is drawn asks the
        // Stage-2 question before it ever reaches the option cards, so the
        // branch order cannot drift.
        let view = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/DecisionDetailView.swift"
        )
        let chainStart = try #require(view.range(of: "private func ceremony(_ decision:"))
        let chain = String(view[chainStart.lowerBound...])
        let stage2 = try #require(chain.range(of: "if viewModel.isStage2Approval {"))
        let cards = try #require(chain.range(of: "optionCard(option)"))
        #expect(stage2.lowerBound < cards.lowerBound)
        #expect(view.contains("ProjectApprovalBlock(viewModel: viewModel)"))
        #expect(view.contains("ceremony(decision)"), "the body no longer draws the chain")
    }

    @Test("a decision with no contract keeps the option-card path")
    func aPlainDecisionIsUntouched() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision(contract: nil)
        viewModel.options = [try ProjectApprovalFixture.option()]
        #expect(viewModel.isStage2Approval == false)
        #expect(viewModel.approvalUnavailable == false)
    }

    /// A failed read must not fall back to the wrong ceremony: the screen says
    /// it could not open the approval and draws no option cards.
    @Test("a Stage-2 decision whose projection never arrived says so")
    func aMissingProjectionIsNamed() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.fetchApprovalReviews = { throw Boom() }

        await viewModel.loadApprovalReview(decisionId: ProjectApprovalFixture.decisionId)
        #expect(viewModel.approvalReview == nil)
        #expect(viewModel.approvalUnavailable)
        #expect(viewModel.isStage2Approval, "the branch is decided on the decision")
    }

    /// Deep links carry whatever case the sender used.
    @Test("the caller-global list is narrowed to this decision, case-insensitively")
    func theListIsNarrowedToThisDecision() async throws {
        let row = try ProjectApprovalFixture.review()
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision()
        viewModel.fetchApprovalReviews = { [row] }

        await viewModel.loadApprovalReview(decisionId: ProjectApprovalFixture.decisionId.uppercased())
        #expect(viewModel.approvalReview?.decisionId == ProjectApprovalFixture.decisionId)
    }

    @Test("a decision that is not Stage-2 never reads the approval list")
    func aPlainDecisionSkipsTheList() async throws {
        var asked = false
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision(contract: nil)
        viewModel.fetchApprovalReviews = { asked = true; return [] }

        await viewModel.loadApprovalReview(decisionId: ProjectApprovalFixture.decisionId)
        #expect(asked == false)
        #expect(viewModel.approvalReview == nil)
    }
}
