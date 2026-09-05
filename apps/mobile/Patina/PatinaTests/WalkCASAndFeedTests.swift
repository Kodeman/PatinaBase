//
//  WalkCASAndFeedTests.swift
//  PatinaTests
//
//  The round-two simulator walk's iOS blocker and its two majors on the
//  approval rail (`walk-r2.md`, 2026-09-05): the first submit that always lost
//  the CAS to its own "seen" stamp (`W1R2-B1`), the immutability sentence
//  printing where nothing was being approved (`W1R2-M1`), the unsent draft
//  drawn on Today as a dated ask (`W1R2-M3`), and the Stage-2 row that could
//  not name the designer the Record two screens away named (`W1R2-M2`).
//
//  Its own file rather than more of `ProjectApprovalActTests` /
//  `ProjectApprovalPathTests`: both are at SwiftLint's 500-line `file_length`
//  and 300-line `type_body_length`, the same reason
//  `BadgeCountService+Decisions.swift` is its own file.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ApprovalCASOrderTests {

    // MARK: - W1R2-B1 · the stamp, the CAS value, and the order between them

    /// `mark_client_decision_viewed` (00464:2211-2222) writes
    /// `viewed_at = now(), updated_at = now()`, and `updated_at` is the exact
    /// value `respond_project_approval` does its CAS on. Reading the projection
    /// first and stamping after therefore cached an `updatedAt` the stamp
    /// itself invalidated one line later, and the FIRST "Submit response" on
    /// every published Stage-2 approval lost the CAS — proven three times on
    /// the round-two walk, and proven to succeed on a second open, once
    /// `viewed_at` was already set and the stamp was a no-op.
    @Test("the seen stamp is sent before the projection is read")
    func theStampGoesBeforeTheProjectionRead() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift"
        )
        let load = try #require(source.range(of: "func load(decisionId: String) async {"))
        let body = String(source[load.upperBound...])
        let stamp = try #require(body.range(of: "await markViewed(decisionId: decisionId)"))
        let projection = try #require(
            body.range(of: "await loadApprovalReview(decisionId: decisionId)")
        )
        #expect(stamp.lowerBound < projection.lowerBound,
                "the stamp is back after the read, and the first submit loses the CAS")
        // …and it is sent once, not once at each end.
        #expect(body.components(separatedBy: "await markViewed(decisionId: decisionId)")
            .count - 1 == 1)
    }

    /// The stamp goes through the seam, so the order above is an order between
    /// two calls a test can watch arrive.
    @Test("the stamp is the seam the view model owns")
    func theStampIsSeamed() async throws {
        var stamped: String?
        let viewModel = DecisionDetailViewModel()
        viewModel.markDecisionViewed = { stamped = $0 }
        viewModel.respondToApproval = { _, _, _, _ in }
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        // The stamp is private; `load` reaches it, and the seam is what proves
        // the call site is no longer the singleton's network method.
        let source = try SourcePin.readCode(
            "Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift"
        )
        #expect(source.contains("try await markDecisionViewed(decisionId)"))
        #expect(stamped == nil, "nothing stamps until the screen loads")
    }

    /// One refetch-and-retry before the sentence. A CAS miss is the one thing
    /// this screen can be wrong about, and the row it re-reads carries the
    /// value it was wrong about.
    @Test("a lost CAS is re-read once and the answer lands")
    func aLostCASIsRetriedOnce() async throws {
        struct Stale: Error {}
        let fresh = "2026-09-04T11:00:00+00:00"
        var sentValues: [String] = []
        var refetches = 0
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.fetchApprovalReview = { _ in
            refetches += 1
            return try ProjectApprovalFixture.review(updatedAt: fresh)
        }
        viewModel.respondToApproval = { _, _, expectedUpdatedAt, _ in
            sentValues.append(expectedUpdatedAt)
            if expectedUpdatedAt != fresh { throw Stale() }
        }

        viewModel.chooseOutcome(.approved)
        await viewModel.submitApprovalResponse()

        #expect(sentValues == ["2026-09-04T10:15:00+00:00", fresh])
        #expect(refetches == 1, "exactly one re-read, never a loop")
        #expect(viewModel.answeredOutcome == .approved)
        #expect(viewModel.submitFailure == nil)
        #expect(viewModel.isSubmitting == false)
    }

    /// The first call landed and only its reply was lost. The re-read finds
    /// the answer already recorded, and the screen names it instead of asking
    /// the server to record it twice.
    @Test("a re-read that finds the answer already recorded names it")
    func anAlreadyRecordedAnswerIsNamed() async throws {
        struct Boom: Error {}
        var attempts = 0
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.fetchApprovalReview = { _ in
            try ProjectApprovalFixture.review(
                lifecycleStatus: "responded", outcome: "changes_requested"
            )
        }
        viewModel.respondToApproval = { _, _, _, _ in
            attempts += 1
            throw Boom()
        }

        viewModel.chooseOutcome(.changesRequested)
        await viewModel.submitApprovalResponse()

        #expect(attempts == 1, "the answer was already there; it was written twice")
        #expect(viewModel.answeredOutcome == .changesRequested)
        #expect(viewModel.submitFailure == nil)
    }

    /// A failure that is not a CAS miss — the row has not moved — says so
    /// once. The retry may not turn one honest sentence into two writes.
    @Test("a failure over an unmoved row shows the sentence and stops")
    func aFailureOverAnUnmovedRowIsHonest() async throws {
        struct Boom: Error {}
        var attempts = 0
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.fetchApprovalReview = { _ in try ProjectApprovalFixture.review() }
        viewModel.respondToApproval = { _, _, _, _ in
            attempts += 1
            throw Boom()
        }

        viewModel.chooseOutcome(.needsDiscussion)
        await viewModel.submitApprovalResponse()

        #expect(attempts == 1)
        #expect(viewModel.submitFailure == MoneyFailureCopy.approvalResponse)
        #expect(viewModel.hasAnsweredApproval == false)
        #expect(viewModel.chosenOutcome == .needsDiscussion, "the choice survives the retry")
        #expect(viewModel.isSubmitting == false)
    }

    /// …and a re-read that itself fails is the same honest sentence.
    @Test("a re-read that fails leaves the sentence standing")
    func aFailedReReadStillSaysSo() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.fetchApprovalReview = { _ in throw Boom() }
        viewModel.respondToApproval = { _, _, _, _ in throw Boom() }

        viewModel.chooseOutcome(.approved)
        await viewModel.submitApprovalResponse()

        #expect(viewModel.submitFailure == MoneyFailureCopy.approvalResponse)
        #expect(viewModel.hasAnsweredApproval == false)
    }

    // MARK: - W1R2-M1 · where the immutability sentence belongs

    /// It belongs above the three outcomes, while an answer is still open —
    /// and nowhere else. It was printing on the review-confirmation screen,
    /// where the act on offer is READING the edition and nothing is being
    /// approved, and it survived the confirmation, because the projection in
    /// hand still says the review is outstanding.
    @Test("the immutability sentence draws on exactly the outcome guard")
    func theImmutabilitySentenceIsGatedOnTheOutcomes() throws {
        let block = try SourcePin.readCode(
            "Patina/Features/Decisions/Views/ProjectApprovalBlock.swift"
        )
        let guarded = try #require(
            block.range(of: "if !viewModel.hasAnsweredApproval, review.canRespond {")
        )
        let covered = String(block[guarded.upperBound...].prefix(200))
        #expect(covered.contains("ProjectApprovalCopy.immutability"))
        #expect(!block.contains("review.needsReviewConfirmation || review.canRespond"),
                "the review screen prints the approval sentence again")

        // The state that used to draw it: an unanswered draft whose review is
        // outstanding, and the same row after the review has been confirmed.
        let draft = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1
        )
        #expect(draft.needsReviewConfirmation)
        #expect(draft.canRespond == false, "nothing is being approved on the review screen")
    }
}

@MainActor
struct ApprovalFeedGuardTests {

    // MARK: - W1R2-M3 · an edition nobody has sent states no date

    /// `client_decisions.sent_at` is stamped by `publish_client_decision` and
    /// by nothing else (00464:998,1061), so an unsent draft is the studio's own
    /// working copy. It was reaching Today, the Studio hub and the bell as an
    /// ask carrying a DUE DATE — a question that had not been asked, dated.
    ///
    /// The row itself stays. `needsReviewConfirmation` is the whole of what an
    /// unpublished row can hold, and a feed row is the only door the phone has
    /// to it (`AppRoute.decisionDetail` is pushed from a feed row and nowhere
    /// else; 00534 writes a bell row only on the transition into `pending`) —
    /// so a published-only feed would take P-09's review confirmation back to
    /// web-only. What goes is the date and the word "approval".
    @Test("an unsent draft keeps its row and loses its date")
    func anUnsentDraftIsNotADatedAsk() throws {
        let unsent = try ProjectApprovalFixture.review(
            lifecycleStatus: "draft", completed: 0, required: 1, sentAt: NSNull()
        )
        #expect(unsent.isPublished == false)
        #expect(unsent.awaitsClient, "the reading is hers")
        #expect(unsent.awaitsReadingOnly)
        let draftRow = try #require(BadgeCountService.mergedDecisions(
            pending: [], approvals: [unsent], previous: []
        )?.first)
        #expect(draftRow.due_date == nil, "the studio's own plan is not her deadline")
        #expect(draftRow.isUnissuedApproval)

        // The published one is untouched: it is an ask, and it keeps its date.
        let published = try ProjectApprovalFixture.review()
        #expect(published.isPublished)
        #expect(published.awaitsReadingOnly == false)
        let sentRow = try #require(BadgeCountService.mergedDecisions(
            pending: [], approvals: [published], previous: []
        )?.first)
        #expect(sentRow.due_date == "2026-09-11T00:00:00+00:00")
        #expect(sentRow.isUnissuedApproval == false)
    }

    /// The two homeowner merges read the same predicate, so they cannot
    /// disagree about which approvals are hers.
    @Test("both feeds read one predicate, and it is not the published gate")
    func bothFeedsReadOnePredicate() throws {
        let list = try SourcePin.readCode(
            "Patina/Features/Decisions/ViewModels/DecisionsListViewModel.swift"
        )
        let badges = try SourcePin.readCode(
            "Patina/Services/Badges/BadgeCountService+Decisions.swift"
        )
        for feed in [list, badges] {
            #expect(feed.contains("filter(\\.awaitsClient)"))
            #expect(!feed.contains("isPublished"),
                    "a feed is back to subtracting the review leg")
        }
    }

    /// The half of M3 the date alone does not answer: the Record's copy said
    /// "Leah asked for your approval." over an edition the studio had not
    /// issued. What it holds is a reading.
    @Test("the Record calls an unissued edition a reading, not an approval")
    func theRecordCallsAnUnissuedEditionAReading() throws {
        let asking = StudioQueueItemRow(
            id: "decision:d1", kind: .decision, entityId: "d1",
            title: "Kitchen millwork spec", detail: "Aspen Loft Refresh",
            askedAt: nil, dueAt: nil, amountCents: nil,
            designerName: "Leah Hartwell", designerIsPerson: true,
            isApproval: true, route: .decisionDetail(decisionId: "d1")
        )
        #expect(HouseRecordBuilder.title(for: asking) == "Leah asked for your approval.")

        var reading = asking
        reading.awaitsReading = true
        #expect(HouseRecordBuilder.title(for: reading)
                == "Leah asked you to read this edition.")
        #expect(!HouseRecordBuilder.title(for: reading).contains("approval"))
    }

    // MARK: - W1R2-M2 · the row names the designer the project already names

    private static func project(named name: String) throws -> RemoteProject {
        try JSONDecoder().decode(RemoteProject.self, from: Data("""
        { "id": "b0000000-0000-0000-0000-0000000000b1", "name": "Aspen Loft Refresh",
          "designer": { "id": "a0000000-0000-0000-0000-000000000004",
                        "display_name": null, "full_name": "\(name)",
                        "business_name": "Hartwell Studio" } }
        """.utf8))
    }

    /// The projection carries no designer, so R8's sentence degraded to
    /// "Still open, your designer asked on Sep 1." on every Stage-2 row — while
    /// the Record two screens away, which resolves the designer from the
    /// relationship, said "Leah asked for your approval." The name is taken
    /// from the project the rail already holds, matched on the projection's own
    /// `projectId`; nothing is invented.
    @Test("a waiting row carries the designer its project names")
    func aWaitingRowNamesTheDesigner() throws {
        let projects = [try Self.project(named: "Leah Hartwell")]
        let row = try ProjectApprovalFixture.review().asWaitingDecision(from: projects)
        #expect(row.project?.designer?.askedByName == "Leah")
        #expect(row.project?.name == "Aspen Loft Refresh")

        // The day itself is formatted in the device calendar, so the fact this
        // test holds is the NAME — the clause's own date is `DateDisplay`'s.
        let now = try #require(ISO8601DateFormatter().date(from: "2026-09-15T16:00:00Z"))
        let line = try #require(DateDisplay.approval(
            dueDate: row.due_date, askedAt: row.created_at,
            designer: row.project?.designer?.askedByName, now: now
        ))
        #expect(line.text.hasPrefix("Still open, Leah asked on "))
        #expect(line.isStillOpen)
    }

    /// With no project in hand the row names nobody, rather than guessing.
    @Test("an unmatched project leaves the row unattributed")
    func anUnmatchedProjectNamesNobody() throws {
        let row = try ProjectApprovalFixture.review().asWaitingDecision()
        #expect(row.project == nil)
        let now = try #require(ISO8601DateFormatter().date(from: "2026-09-15T16:00:00Z"))
        #expect(DateDisplay.approval(
            dueDate: row.due_date, askedAt: row.created_at,
            designer: row.project?.designer?.askedByName, now: now
        )?.text.hasPrefix("Still open, your designer asked on ") == true)
    }

    /// …and the name survives the merge, which is what the Studio hub and the
    /// decision list actually read.
    @Test("the merged feed carries the designer through")
    func theMergedFeedCarriesTheDesigner() throws {
        let merged = try #require(BadgeCountService.mergedDecisions(
            pending: [], approvals: [try ProjectApprovalFixture.review()], previous: [],
            projects: [try Self.project(named: "Leah Hartwell")]
        ))
        #expect(merged.count == 1)
        #expect(merged[0].project?.designer?.askedByName == "Leah")

        // The Studio hub's own approval row, built from that feed.
        let now = try #require(ISO8601DateFormatter().date(from: "2026-09-15T16:00:00Z"))
        let snapshot = StudioQueueBuilder.build(StudioQueueInput(
            projects: [], decisions: merged, proposals: [], invoices: [],
            documents: [], threads: [], notifications: [],
            currentUserId: "client", now: now
        ))
        #expect(snapshot.section(.awaitingYou).rows.first?.meta?
            .hasPrefix("Still open, Leah asked on ") == true)
    }
}
