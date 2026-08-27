//
//  AttentionCountTests.swift
//  PatinaTests
//
//  SP-16's first half. One screen printed three answers to "how much needs
//  me?": the Studio header read "4 things need your eye", the Companion below
//  it read the same in mono caps, the block between them read "Awaiting you 3",
//  and Today said "2 project decisions waiting". The count is computed once
//  now, from BadgeCountService, and every surface reads that number.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct AttentionCountTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private struct Fixtures {
        let decisions: [RemoteClientDecision]
        let summaries: [RemoteCommsThreadSummary]
        let proposals: [RemoteProposal]
        let invoices: [RemoteInvoice]
        let projects: [RemoteProject]
    }

    private func fixtures() throws -> Fixtures {
        // Two decisions, one signable proposal, one payable invoice — the
        // shape the review walked: four items collapsing to three rows.
        let decisions = try decode([RemoteClientDecision].self, """
        [
          { "id": "d1", "title": "Rug color", "status": "pending",
            "due_date": "2026-08-22", "created_at": "2026-08-12T12:00:00Z" },
          { "id": "d2", "title": "Sconce finish", "status": "pending",
            "due_date": "2026-09-02", "created_at": "2026-08-14T12:00:00Z" }
        ]
        """)
        let summaries = try decode([RemoteCommsThreadSummary].self, """
        [{
          "id": "thread-1", "kind": "project", "title": "Oak Street",
          "last_message_at": "2026-07-29T14:00:00Z",
          "comms_messages": [{
            "sender_id": "designer", "body": "The oak sample arrived.", "system": false,
            "created_at": "2026-07-29T14:00:00Z", "deleted_at": null
          }],
          "comms_thread_participants": [{
            "profile_id": "client", "role": "client",
            "last_read_at": "2026-07-28T14:00:00Z", "left_at": null
          }]
        }]
        """)
        let proposals = try decode([RemoteProposal].self, """
        [{ "id": "p1", "title": "Phase 1", "status": "sent",
           "valid_until": "2099-09-08", "updated_at": "2026-08-20T12:00:00Z" }]
        """)
        let invoices = try decode([RemoteInvoice].self, """
        [{
          "id": "i1", "status": "sent", "due_date": "2026-09-01",
          "total_cents": 425000, "amount_paid_cents": 0, "currency": "USD",
          "created_at": "2026-08-18T12:00:00Z"
        }]
        """)
        let projects = try decode([RemoteProject].self, """
        [{ "id": "11111111-1111-1111-1111-111111111111", "name": "Oak Street",
           "status": "active", "updated_at": "2026-08-20T12:00:00Z" }]
        """)
        return Fixtures(
            decisions: decisions, summaries: summaries, proposals: proposals,
            invoices: invoices, projects: projects
        )
    }

    @Test("the attention count sums the three queues that actually need the client")
    func attentionCountSumsTheThreeQueues() throws {
        let rows = try fixtures()
        let badges = BadgeCountService()
        badges.apply(
            decisions: rows.decisions, summaries: rows.summaries,
            proposals: rows.proposals, invoices: rows.invoices,
            projects: rows.projects, roster: []
        )

        #expect(badges.pendingDecisionCount == 2)
        #expect(badges.proposalsAwaitingSignatureCount == 1)
        #expect(badges.payableInvoiceCount == 1)
        #expect(badges.attentionCount == 4)
        #expect(badges.attentionHint == "4 things need your eye")
    }

    @Test("one thing needing the client reads in the singular")
    func singularHint() throws {
        let rows = try fixtures()
        let badges = BadgeCountService()
        badges.apply(
            decisions: [], summaries: rows.summaries,
            proposals: [], invoices: rows.invoices,
            projects: rows.projects, roster: []
        )
        #expect(badges.attentionCount == 1)
        #expect(badges.attentionHint == "1 thing needs your eye")
    }

    @Test("nothing needing the client prints no count at all")
    func emptyHintIsNil() throws {
        let rows = try fixtures()
        let badges = BadgeCountService()
        badges.apply(
            decisions: [], summaries: rows.summaries,
            proposals: [], invoices: [],
            projects: rows.projects, roster: []
        )
        #expect(badges.attentionCount == 0)
        #expect(badges.attentionHint == nil)
    }

    /// The three surfaces the review caught disagreeing all print the same
    /// string now, because they all derive it from one number.
    @Test("the Studio subhead, the footer/Companion and the Daily Room agree")
    func everyConsumerPrintsTheSameCount() throws {
        let rows = try fixtures()
        let badges = BadgeCountService()
        badges.apply(
            decisions: rows.decisions, summaries: rows.summaries,
            proposals: rows.proposals, invoices: rows.invoices,
            projects: rows.projects, roster: []
        )

        let expected = StudioAttentionSummary.attentionHint(count: badges.attentionCount)
        #expect(expected == "4 things need your eye")

        // The Studio snapshot's own summary carries the same number rather
        // than recomputing it from a different fetch.
        let snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: rows.projects,
                decisions: rows.decisions,
                proposals: rows.proposals,
                invoices: rows.invoices,
                documents: [],
                threads: rows.summaries,
                notifications: [],
                currentUserId: "client",
                now: try #require(ISO8601DateFormatter().date(from: "2026-07-29T16:00:00Z"))
            )
        )
        #expect(snapshot.attentionSummary.awaitingCount == badges.attentionCount)
        #expect(snapshot.attentionSummary.hint == expected)
        #expect(badges.attentionHint == expected)
    }

    @Test("the fetched rows are retained for the Record")
    func refreshRetainsTheFetchedRows() throws {
        let rows = try fixtures()
        let badges = BadgeCountService()
        badges.apply(
            decisions: rows.decisions, summaries: rows.summaries,
            proposals: rows.proposals, invoices: rows.invoices,
            projects: rows.projects,
            roster: [RosterDesigner(designerId: UUID(), addedAt: Date())]
        )

        #expect(badges.pendingDecisions.count == 2)
        #expect(badges.pendingProposals.count == 1)
        #expect(badges.payableInvoices.count == 1)
        #expect(badges.threadSummaries.count == 1)
        #expect(badges.projects.count == 1)
        #expect(badges.roster.count == 1)
        // The retained rows are the ones the counts were computed from.
        #expect(badges.pendingDecisions.count == badges.pendingDecisionCount)
        #expect(badges.pendingProposals.count == badges.proposalsAwaitingSignatureCount)
        #expect(badges.payableInvoices.count == badges.payableInvoiceCount)
        #expect(badges.projects.count == badges.projectCount)
    }
}
