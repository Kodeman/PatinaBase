//
//  AfterglowRowTests.swift
//  PatinaTests
//
//  `P-21`. After an outcome the row does not vanish — it crosses from NEEDS
//  YOU to MOVED carrying the word that was stamped on it, in second person,
//  dated by the day the answer was actually recorded.
//
//  What is pinned here is mostly what the row REFUSES to say: it never speaks
//  for an approval that was somebody else's to answer, never dates itself by
//  anything but `respondedAt` / `signed_at`, never says "You signed" over a
//  designer-side accept, and never carries a "new" tick — the Record does not
//  report the reader to himself as news.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct AfterglowRowTests {

    private let now = ISO8601DateFormatter().date(from: "2026-09-05T12:00:00Z")!

    // MARK: - The two kinds

    @Test("both afterglow kinds belong to MOVED, not to NEEDS YOU")
    func bothKindsAreMovedKinds() {
        #expect(!HouseRecordRow.Kind.decisionAnswered.isObligation)
        #expect(!HouseRecordRow.Kind.proposalSigned.isObligation)
    }

    @Test("the two afterglow kinds are the reader's own act, and nothing else is")
    func onlyTheAfterglowKindsAreHerOwnAct() {
        #expect(HouseRecordRow.Kind.decisionAnswered.isOwnAct)
        #expect(HouseRecordRow.Kind.proposalSigned.isOwnAct)
        for kind: HouseRecordRow.Kind in [
            .decisionAsked, .proposalSent, .invoiceDue, .messageReceived,
            .orderMoved, .savedPieceRepriced, .savedPieceWithdrawn, .story, .matchedDesigner
        ] {
            #expect(!kind.isOwnAct, "\(kind) is not the reader's own act")
        }
    }

    // MARK: - The answered approval

    @Test("an approved edition crosses carrying the word that was stamped on it")
    func anApprovedEditionCrosses() throws {
        let approval = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )
        let rows = HouseRecordBuilder.answeredApprovalRows([approval])

        #expect(rows.count == 1)
        let row = try #require(rows.first)
        #expect(row.kind == .decisionAnswered)
        #expect(row.title == "You approved this edition.")
        #expect(row.detail == "Kitchen millwork spec")
        #expect(row.date == ISO8601DateFormatter().date(from: "2026-09-03T09:30:00Z"))
        #expect(row.route == .decisionDetail(decisionId: ProjectApprovalFixture.decisionId))
        #expect(!row.isNew)
        #expect(!row.isStandingCondition)
        #expect(row.id == "approval-answered:\(ProjectApprovalFixture.decisionId)")
    }

    /// RETURNED is the word for `changes_requested` on every surface. "Declined"
    /// is a commercial document's word and never this one's.
    @Test("changes requested reads as returned, and a hold reads as held")
    func theOtherTwoOutcomesUseTheRuledWords() throws {
        let returned = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "changes_requested",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )
        let held = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "needs_discussion",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )

        let returnedTitle = try #require(HouseRecordBuilder.answeredApprovalRows([returned]).first?.title)
        #expect(returnedTitle.lowercased().contains("returned"))
        #expect(!returnedTitle.lowercased().contains("declined"))
        #expect(returnedTitle.hasPrefix("You "))

        let heldTitle = try #require(HouseRecordBuilder.answeredApprovalRows([held]).first?.title)
        #expect(heldTitle.lowercased().contains("held"))
        #expect(heldTitle.hasPrefix("You "))
    }

    @Test("an unanswered approval draws no afterglow row")
    func anUnansweredApprovalDrawsNothing() throws {
        let open = try ProjectApprovalFixture.review()
        #expect(HouseRecordBuilder.answeredApprovalRows([open]).isEmpty)
    }

    /// The row is dated by the answer, or it does not draw. There is no second
    /// date to fall back on that would be true.
    @Test("an outcome with no responded-at draws nothing")
    func anUndatedOutcomeDrawsNothing() throws {
        let undated = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded", outcome: "approved", respondedAt: NSNull()
        )
        #expect(HouseRecordBuilder.answeredApprovalRows([undated]).isEmpty)
    }

    @Test("an outcome word this build does not know draws nothing")
    func anUnknownOutcomeDrawsNothing() throws {
        let strange = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "escalated",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )
        #expect(HouseRecordBuilder.answeredApprovalRows([strange]).isEmpty)
    }

    /// Withdrawn and superseded stand ahead of an outcome everywhere else
    /// (`client-attention.ts:55-71`); they stand ahead of it here too.
    @Test("a withdrawn or superseded approval draws no afterglow")
    func aClosedApprovalDrawsNothing() throws {
        for disposition in ["withdrawn", "superseded"] {
            let closed = try ProjectApprovalFixture.review(
                lifecycleStatus: "responded",
                outcome: "approved",
                disposition: disposition,
                respondedAt: "2026-09-03T09:30:00+00:00"
            )
            #expect(HouseRecordBuilder.answeredApprovalRows([closed]).isEmpty)
        }
    }

    // MARK: - viewer_role

    @Test("an approval the caller only watches never says she approved it")
    func anObserverGetsNoAfterglow() throws {
        let watched = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-09-03T09:30:00+00:00",
            viewerRole: "studio_comember"
        )
        #expect(HouseRecordBuilder.answeredApprovalRows([watched]).isEmpty)
    }

    @Test("a watched approval never reaches a homeowner-facing feed")
    func anObserverGetsNoNeedsYouRow() throws {
        let watched = try ProjectApprovalFixture.review(viewerRole: "studio_comember")
        #expect(watched.awaitsClient)
        #expect(watched.isPublished)
        #expect(!watched.awaitsClientInFeed)

        let merged = BadgeCountService.mergedDecisions(
            pending: [], approvals: [watched], previous: []
        )
        #expect(merged?.isEmpty == true)
    }

    @Test("the decision lead's own approval still reaches her feed")
    func theLeadKeepsHerRow() throws {
        let hers = try ProjectApprovalFixture.review(viewerRole: "decision_lead")
        #expect(hers.awaitsClientInFeed)

        let merged = BadgeCountService.mergedDecisions(
            pending: [], approvals: [hers], previous: []
        )
        #expect(merged?.count == 1)
    }

    /// The field is a Wave 2 migration this lane does not own, so a spelling it
    /// does not recognise — or no field at all — behaves exactly as Wave 1 did.
    /// Dropping a homeowner's own obligations is the worse failure.
    @Test("an absent or unrecognised viewer role keeps the Wave 1 behaviour")
    func anUnknownRoleDefaultsToHers() throws {
        #expect(ProjectApprovalViewerRole(raw: nil) == .unspecified)
        #expect(ProjectApprovalViewerRole(raw: "") == .unspecified)
        #expect(ProjectApprovalViewerRole(raw: "something_new") == .unspecified)
        #expect(try ProjectApprovalFixture.review().awaitsClientInFeed)
        #expect(try ProjectApprovalFixture.review(viewerRole: "something_new").awaitsClientInFeed)
    }

    /// Spelling is normalised, not matched byte-for-byte: the migration may
    /// land any of these and none of them may change what she sees.
    @Test("the role vocabulary is read past its punctuation and its casing")
    func theRoleVocabularyIsNormalised() {
        for raw in ["studio_comember", "studio-coMember", "STUDIO_COMEMBER", "co member"] {
            #expect(ProjectApprovalViewerRole(raw: raw) == .observes, "\(raw)")
        }
        for raw in ["decision_lead", "decisionLead", "LEAD", "client"] {
            #expect(ProjectApprovalViewerRole(raw: raw) == .answers, "\(raw)")
        }
    }

    // MARK: - The signed proposal

    @Test("a proposal she signed crosses, dated by her signature")
    func aSignedProposalCrosses() throws {
        let rows = HouseRecordBuilder.signedProposalRows([
            try Self.proposal(
                id: "p-1", title: "Living Room Refresh", status: "accepted",
                signedAt: "2026-09-02T14:00:00+00:00", signedByName: "Anne Brenner"
            )
        ])

        #expect(rows.count == 1)
        let row = try #require(rows.first)
        #expect(row.kind == .proposalSigned)
        #expect(row.title == "You signed the proposal.")
        #expect(row.detail == "Living Room Refresh")
        #expect(row.date == ISO8601DateFormatter().date(from: "2026-09-02T14:00:00Z"))
        #expect(row.route == .proposalDetail(proposalId: "p-1"))
        #expect(!row.isNew)
        #expect(row.id == "proposal-signed:p-1")
    }

    /// A designer-side accept sets `status = 'accepted'` with no signature
    /// record. Saying "You signed" over one would report an act she never took.
    @Test("a designer-side accept is not something she signed")
    func aDesignerAcceptIsNotHerSignature() throws {
        let rows = HouseRecordBuilder.signedProposalRows([
            try Self.proposal(id: "p-2", title: "Kitchen", status: "accepted",
                              signedAt: nil, signedByName: nil)
        ])
        #expect(rows.isEmpty)
    }

    @Test("an unsigned proposal draws no afterglow")
    func anUnsignedProposalDrawsNothing() throws {
        let rows = HouseRecordBuilder.signedProposalRows([
            try Self.proposal(id: "p-3", title: "Kitchen", status: "sent",
                              signedAt: nil, signedByName: nil)
        ])
        #expect(rows.isEmpty)
    }

    // MARK: - Through the whole record

    @Test("the afterglow row lands in MOVED and ages out on the ordinary window")
    func theAfterglowAgesOutOnTheOrdinaryWindow() throws {
        let recent = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-09-03T09:30:00+00:00"
        )
        let inside = HouseRecordBuilder.answeredApprovalRows([recent])
        #expect(inside.count == 1)

        // Eight days back is outside the seven-day rolling window the MOVED
        // half already keeps — no new decay rule, no special-casing.
        let old = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-08-20T09:30:00+00:00"
        )
        let window = DateInterval(
            start: now.addingTimeInterval(-HouseRecordBuilder.rollingWindow), end: now
        )
        let oldRow = try #require(HouseRecordBuilder.answeredApprovalRows([old]).first)
        #expect(!window.contains(oldRow.date))
        #expect(window.contains(try #require(inside.first).date))
    }

    /// Her own act is never announced back to her, however recently she did it.
    @Test("an afterglow row is never marked new")
    func anAfterglowRowIsNeverNew() throws {
        let approval = try ProjectApprovalFixture.review(
            lifecycleStatus: "responded",
            outcome: "approved",
            respondedAt: "2026-09-04T09:30:00+00:00"
        )
        let badges = BadgeCountService.makeForTests()
        badges.apply(
            decisions: [], summaries: nil, proposals: [
                try Self.proposal(id: "p-9", title: "Kitchen", status: "accepted",
                                  signedAt: "2026-09-04T10:00:00+00:00", signedByName: "Anne")
            ],
            invoices: nil, projects: nil, roster: nil, now: now
        )
        badges.applyProjectApprovalsForTesting([approval])

        let record = HouseRecordBuilder.build(
            from: badges, saved: [], products: [], story: nil, liveLead: nil,
            lastSeen: ISO8601DateFormatter().date(from: "2026-09-01T00:00:00Z"),
            now: now
        )

        let afterglow = record.moved.filter { $0.kind.isOwnAct }
        #expect(afterglow.count == 2)
        #expect(afterglow.allSatisfy { !$0.isNew })
        #expect(record.needsYou.allSatisfy { !$0.kind.isOwnAct })
    }

    // MARK: - Fixtures

    private static func proposal(
        id: String, title: String, status: String,
        signedAt: String?, signedByName: String?
    ) throws -> RemoteProposal {
        var row: [String: Any] = [
            "id": id,
            "title": title,
            "status": status,
            "created_at": "2026-09-01T00:00:00+00:00"
        ]
        if let signedAt { row["signed_at"] = signedAt }
        if let signedByName { row["signed_by_name"] = signedByName }
        // Decoded from the wire's own shape, like every other fixture here.
        return try JSONDecoder().decode(
            RemoteProposal.self,
            from: JSONSerialization.data(withJSONObject: row)
        )
    }
}
