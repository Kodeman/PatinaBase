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

        // …and the screen asks the Stage-2 question FIRST, before the legacy
        // chain and before anything that chain draws, so the branch order
        // cannot drift.
        let view = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/DecisionDetailView.swift"
        )
        let stage2 = try #require(view.range(of: "if viewModel.isStage2Approval {"))
        let legacy = try #require(view.range(of: "ceremony(decision)"))
        let cards = try #require(view.range(of: "optionCard(option)"))
        #expect(stage2.lowerBound < legacy.lowerBound)
        #expect(stage2.lowerBound < cards.lowerBound)
        #expect(view.contains("ProjectApprovalScreen(viewModel: viewModel)"))
        // The Stage-2 branch draws the whole screen, so none of the legacy
        // pieces can reach it: not the option cards, not the resolved banner,
        // and not the "Not yet / Neither of these" pair, which names options
        // this approval does not have.
        let screen = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalScreen.swift"
        )
        for legacyPiece in ["resolvedBanner", "deferralActs", "optionCard", "ceremony("] {
            #expect(!screen.contains(legacyPiece),
                    "the Stage-2 screen reaches the legacy piece \(legacyPiece)")
        }
    }

    /// `iosb-B1`. 00467:18-38 cut `project_artifact_v1` out of every raw
    /// `client_decisions` SELECT policy a homeowner can reach, so on HER
    /// screen the parent row is nil. Branching the ceremony on that row put
    /// the whole of P-09 behind a door only a studio co-member could open.
    @Test("the projection alone opens the ceremony, with no parent row at all")
    func theProjectionAloneOpensTheCeremony() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.fetchApprovalReview = { _ in try ProjectApprovalFixture.review() }

        await viewModel.loadApprovalReview(decisionId: ProjectApprovalFixture.decisionId)

        #expect(viewModel.decision == nil, "the homeowner never sees the row")
        #expect(viewModel.approvalReview != nil)
        #expect(viewModel.isStage2Approval)
        #expect(viewModel.approvalUnavailable == false)
    }

    /// …and the load that found no row but did find the projection is not a
    /// failure. It used to draw "Couldn’t load this decision".
    @Test("a hidden parent row with a projection is not a load failure")
    func aHiddenRowWithAProjectionIsNotAnError() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        #expect(viewModel.isStage2Approval)
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift"
        )
        #expect(source.contains("if self.decision == nil, self.approvalReview == nil {"))
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
        viewModel.fetchApprovalReview = { _ in throw Boom() }

        await viewModel.loadApprovalReview(decisionId: ProjectApprovalFixture.decisionId)
        #expect(viewModel.approvalReview == nil)
        #expect(viewModel.approvalUnavailable)
        #expect(viewModel.isStage2Approval, "the row it did see still says which ceremony")
    }

    /// The projection is asked for by id, and only for this one.
    @Test("the projection is fetched for the decision on screen")
    func theProjectionIsFetchedById() async throws {
        var asked: String?
        let viewModel = DecisionDetailViewModel()
        viewModel.fetchApprovalReview = { id in
            asked = id
            return try ProjectApprovalFixture.review()
        }

        await viewModel.loadApprovalReview(decisionId: ProjectApprovalFixture.decisionId)
        #expect(asked == ProjectApprovalFixture.decisionId)
    }

    /// The one case that skips the RPC: a row that loaded and is plainly
    /// legacy. A row that did NOT load cannot be ruled out, because that is
    /// exactly what a homeowner's Stage-2 approval looks like.
    @Test("a legacy decision that loaded never reads the projection")
    func aPlainDecisionSkipsTheProjection() async throws {
        var asked = false
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try ProjectApprovalFixture.decision(contract: nil)
        viewModel.fetchApprovalReview = { _ in asked = true; return nil }

        await viewModel.loadApprovalReview(decisionId: ProjectApprovalFixture.decisionId)
        #expect(asked == false)
        #expect(viewModel.approvalReview == nil)
        #expect(viewModel.isStage2Approval == false)
    }

    // MARK: - The approval that is closed

    /// `iosb-M2`. Withdrawn and superseded offer no act, so the screen has to
    /// say why — it used to draw the question, the edition and the impact and
    /// then stop dead.
    @Test("a closed disposition offers nothing, and is named",
          arguments: ["withdrawn", "superseded"])
    func aClosedDispositionIsNamed(disposition: String) throws {
        let row = try ProjectApprovalFixture.review(disposition: disposition)
        #expect(row.canRespond == false)
        #expect(row.needsReviewConfirmation == false)
        #expect(row.reviewConfirmationUnavailable == false)
        #expect(row.isAwaitingStudioIssue == false)
        #expect(row.isClosedByDisposition)
    }

    @Test("a withdrawn draft is still withdrawn, not a review to give")
    func aWithdrawnDraftOffersNoReview() throws {
        let row = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", disposition: "withdrawn", completed: 0, required: 1
        )
        #expect(row.needsReviewConfirmation == false)
        #expect(row.isWithdrawn)
    }

    @Test("an active approval is closed by neither")
    func anActiveApprovalIsOpen() throws {
        #expect(try ProjectApprovalFixture.review().isClosedByDisposition == false)
    }
}

/// `iosb2-B1`, the door: what puts a Stage-2 approval in front of the
/// homeowner at all.
///
/// Every feed that could send her to the ceremony — the NEEDS YOU eyebrow, the
/// Studio's "Awaiting you", the decision list — reads either
/// `BadgeCountService.pendingDecisions` or `listPending`, and both are the same
/// PostgREST GET on `client_decisions`. 00467:18-38 rewrote both SELECT
/// policies she can reach to `approval_contract IS DISTINCT FROM
/// 'project_artifact_v1'`, so that read returns her own approvals to nobody.
/// Until the projection was merged in beside it, a push notification was the
/// only route to P-09 — and R5 had just taken the Studio count off on the
/// grounds that the eyebrow carries the truth.
///
/// A suite of its own because SwiftLint's `type_body_length` is a per-type
/// budget and the suite above is at it.
@MainActor
struct ProjectApprovalDoorTests {

    @Test("an approval still holding an act of hers becomes a waiting row")
    func anOpenApprovalIsAWaitingRow() throws {
        let row = try ProjectApprovalFixture.review().asWaitingDecision()
        #expect(row.id == ProjectApprovalFixture.decisionId)
        #expect(row.title == "Approve the kitchen millwork as drawn?")
        #expect(row.due_date == "2026-09-11T00:00:00+00:00")
        #expect(row.created_at == "2026-09-01T00:00:00+00:00")
        #expect(row.isResolved == false, "a waiting row that reads resolved never draws")
        #expect(row.isProjectArtifactApproval, "the row has to open the Stage-2 ceremony")
        #expect(row.isClientSignoff == false, "00564's act refuses this contract")
    }

    /// Only the approvals that are hers. The rest are with the studio, and
    /// NEEDS YOU is what needs HER.
    @Test("only the approvals holding one of her acts count as waiting")
    func onlyHerApprovalsWait() throws {
        #expect(try ProjectApprovalFixture.review().awaitsClient)
        #expect(try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1
        ).awaitsClient)
        #expect(try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 1, required: 1
        ).awaitsClient == false, "a reviewed draft is with the studio")
        #expect(try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1, authorityRevision: NSNull()
        ).awaitsClient == false, "an act the RPC refuses is not an act she has")
        #expect(try ProjectApprovalFixture.review(outcome: "approved").awaitsClient == false)
        #expect(try ProjectApprovalFixture.review(disposition: "withdrawn").awaitsClient == false)
        #expect(try ProjectApprovalFixture.review(disposition: "superseded").awaitsClient == false)
    }

    /// A plain decision that is not the approval — the merge carries one
    /// obligation once, so a second row needs a second id.
    private static let otherDecisionId = "a0000000-0000-0000-0000-0000000009e2"

    @Test("the feed behind NEEDS YOU carries both reads")
    func theFeedCarriesBothReads() throws {
        let merged = try #require(BadgeCountService.mergedDecisions(
            pending: [try ProjectApprovalFixture.decision(
                contract: nil, id: Self.otherDecisionId
            )],
            approvals: [try ProjectApprovalFixture.review()],
            previous: []
        ))
        #expect(merged.count == 2)
        #expect(merged.filter(\.isProjectArtifactApproval).count == 1)
        // …and the studio's half of the projection is not her waiting work.
        let withStudio = try #require(BadgeCountService.mergedDecisions(
            pending: [],
            approvals: [try ProjectApprovalFixture.review(
                lifecycleStatus: "draft", completed: 1, required: 1
            )],
            previous: []
        ))
        #expect(withStudio.isEmpty)
    }

    /// A studio co-member can see the parent row AND the projection — 00467
    /// hides it from the homeowner only. One obligation, one row.
    @Test("an approval both reads return is carried once")
    func anApprovalVisibleToBothReadsIsNotDoubled() throws {
        let merged = try #require(BadgeCountService.mergedDecisions(
            pending: [try ProjectApprovalFixture.decision()],
            approvals: [try ProjectApprovalFixture.review()],
            previous: []
        ))
        #expect(merged.count == 1)
        #expect(merged[0].id == ProjectApprovalFixture.decisionId)
    }

    /// Each half that failed leaves its own last-known rows standing. Both
    /// failing is the only nil, which is what tells `performRefresh` to keep
    /// the floor it already has.
    @Test("a read that failed does not blank the feed the other read answered")
    func aFailedHalfDoesNotBlankTheFeed() throws {
        let standing = [
            try ProjectApprovalFixture.decision(contract: nil, id: Self.otherDecisionId),
            try ProjectApprovalFixture.review().asWaitingDecision()
        ]
        #expect(BadgeCountService.mergedDecisions(
            pending: nil, approvals: nil, previous: standing
        ) == nil)

        // The approvals answered; the ordinary decisions did not, and keep
        // the rows they had.
        let approvalsOnly = try #require(BadgeCountService.mergedDecisions(
            pending: nil, approvals: [try ProjectApprovalFixture.review()],
            previous: standing
        ))
        #expect(approvalsOnly.count == 2)
        #expect(approvalsOnly.filter(\.isProjectArtifactApproval).count == 1)

        // And the other way round: the approval already on the feed survives a
        // projection read that failed.
        let pendingOnly = try #require(BadgeCountService.mergedDecisions(
            pending: [try ProjectApprovalFixture.decision(
                contract: nil, id: Self.otherDecisionId
            )],
            approvals: nil, previous: standing
        ))
        #expect(pendingOnly.count == 2)
        #expect(pendingOnly.filter(\.isProjectArtifactApproval).count == 1)
    }

    /// The two feeds read the list RPC, and it is the caller-global one — not
    /// the single-row detail read the ceremony screen uses.
    @Test("both feeds read list_my_project_decision_reviews")
    func bothFeedsReadTheListRPC() throws {
        let client = try SourcePin.readCode(
            "Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift"
        )
        #expect(client.contains(#""list_my_project_decision_reviews""#))
        #expect(client.contains("func fetchProjectApprovalReviews()"))

        let list = try SourcePin.readCode(
            "Patina/Features/Decisions/ViewModels/DecisionsListViewModel.swift"
        )
        #expect(list.contains("fetchProjectApprovalReviews()"))
        #expect(list.contains("asWaitingDecision(from: projects)"))

        let badges = try SourcePin.readCode("Patina/Services/Badges/BadgeCountService.swift")
        #expect(badges.contains("fetchProjectApprovalReviews()"))
        #expect(badges.contains("Self.mergedDecisions("))
        #expect(badges.contains("pending: decisions, approvals: approvals, previous: pendingDecisions"))
    }
}
