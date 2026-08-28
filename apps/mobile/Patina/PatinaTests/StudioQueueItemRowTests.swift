//
//  StudioQueueItemRowTests.swift
//  PatinaTests
//
//  The Studio hub groups: "Decisions · 2 project choices are ready". The
//  Record cannot — a row on the Record is one thing, on the date it happened,
//  with its own destination. Both shapes come from one builder over one set of
//  predicates, so the card and the hub can never disagree about what is
//  waiting.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct StudioQueueItemRowTests {

    /// The day the walk is written for. The decision is overdue against it,
    /// the invoice and the proposal are not.
    private let now = ISO8601DateFormatter().date(from: "2026-08-27T12:00:00Z")!

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func decisions() throws -> [RemoteClientDecision] {
        try decode([RemoteClientDecision].self, """
        [
          { "id": "d1", "title": "Rug color — Natural vs Sand", "status": "pending",
            "due_date": "2026-08-22", "created_at": "2026-08-22T12:00:00Z",
            "project": { "name": "Aspen Loft Refresh",
              "designer": { "id": "u1", "display_name": "Leah Hartwell" } } },
          { "id": "d2", "title": "Sconce finish", "status": "pending",
            "due_date": "2026-09-02", "created_at": "2026-08-24T12:00:00Z" }
        ]
        """)
    }

    private func proposals() throws -> [RemoteProposal] {
        try decode([RemoteProposal].self, """
        [{ "id": "p1", "title": "Aspen Loft — Living Room Refresh", "status": "sent",
           "valid_until": "2099-09-08", "sent_at": "2026-08-23T12:00:00Z",
           "created_at": "2026-08-23T12:00:00Z", "total_amount": 1850000 }]
        """)
    }

    private func invoices() throws -> [RemoteInvoice] {
        try decode([RemoteInvoice].self, """
        [{ "id": "i1", "invoice_number": "INV-2026-0142", "status": "sent",
           "due_date": "2026-09-01", "total_cents": 425000, "amount_paid_cents": 0,
           "sent_at": "2026-08-25T12:00:00Z", "created_at": "2026-08-25T12:00:00Z" }]
        """)
    }

    private func input(
        decisions: [RemoteClientDecision] = [],
        proposals: [RemoteProposal] = [],
        invoices: [RemoteInvoice] = []
    ) -> StudioQueueInput {
        StudioQueueInput(
            projects: [], decisions: decisions, proposals: proposals, invoices: invoices,
            documents: [], threads: [], notifications: [],
            currentUserId: "client", now: now
        )
    }

    @Test("two decisions become two rows on the record and stay one card in the Studio")
    func twoDecisionsBecomeTwoRowsNotOneCard() throws {
        let decisions = try decisions()

        let grouped = StudioQueueBuilder.build(input(decisions: decisions))
        let itemized = StudioQueueBuilder.itemizedAwaitingRows(
            decisions: decisions, proposals: [], invoices: [],
            designerFallback: nil, now: now
        )

        #expect(grouped.section(.awaitingYou).rows.map(\.id) == ["awaiting.decisions"])
        #expect(itemized.count == 2)
        #expect(itemized.map(\.entityId) == ["d1", "d2"])
        #expect(itemized[0].route == .decisionDetail(decisionId: "d1"))
        #expect(itemized[0].title == "Rug color — Natural vs Sand")
        #expect(itemized[0].designerName == "Leah Hartwell")
        // The one with no project embed gets no invented name.
        #expect(itemized[1].designerName == nil)
    }

    @Test("a decision row carries the date it was asked and the date it is due")
    func aDecisionRowCarriesBothDates() throws {
        let rows = StudioQueueBuilder.itemizedAwaitingRows(
            decisions: try decisions(), proposals: [], invoices: [],
            designerFallback: nil, now: now
        )

        let asked = try #require(rows[0].askedAt)
        let due = try #require(rows[0].dueAt)
        #expect(ISO8601DateFormatter().string(from: asked).hasPrefix("2026-08-22"))
        #expect(DateDisplay.short(due) == "Aug 22")
        #expect(rows[0].amountCents == nil)
    }

    @Test("an invoice row carries its balance and its due date")
    func anInvoiceRowCarriesItsBalanceAndDueDate() throws {
        let rows = StudioQueueBuilder.itemizedAwaitingRows(
            decisions: [], proposals: [], invoices: try invoices(),
            designerFallback: "your designer", now: now
        )

        let row = try #require(rows.first)
        #expect(row.kind == .invoice)
        #expect(row.amountCents == 425_000)
        #expect(DateDisplay.short(try #require(row.dueAt)) == "Sep 1")
        #expect(row.route == .invoiceDetail(invoiceId: "i1"))
        #expect(row.title == "INV-2026-0142")
    }

    @Test("a proposal row carries its review-by date")
    func aProposalRowCarriesItsReviewByDate() throws {
        let rows = StudioQueueBuilder.itemizedAwaitingRows(
            decisions: [], proposals: try proposals(), invoices: [],
            designerFallback: nil, now: now
        )

        let row = try #require(rows.first)
        #expect(row.kind == .proposal)
        #expect(row.route == .proposalDetail(proposalId: "p1"))
        #expect(DateDisplay.short(try #require(row.dueAt)) == "Sep 8")
    }

    @Test("the itemized rows use the same predicates as the grouped ones")
    func theItemizedRowsShareThePredicates() throws {
        // An answered decision and an expired proposal count for neither.
        let answered = try decode([RemoteClientDecision].self, """
        [{ "id": "d9", "title": "Answered", "status": "pending",
           "responded_at": "2026-08-25T12:00:00Z", "created_at": "2026-08-20T12:00:00Z" }]
        """)
        let expired = try decode([RemoteProposal].self, """
        [{ "id": "p9", "title": "Gone", "status": "sent", "valid_until": "2026-08-01" }]
        """)

        let rows = StudioQueueBuilder.itemizedAwaitingRows(
            decisions: answered, proposals: expired, invoices: [],
            designerFallback: nil, now: now
        )

        #expect(rows.isEmpty)
        #expect(StudioQueueBuilder.build(input(decisions: answered, proposals: expired))
            .section(.awaitingYou).rows.isEmpty)
    }

    @Test("the grouped Studio rows are unchanged by the addition")
    func theGroupedStudioRowsAreUnchanged() throws {
        let snapshot = StudioQueueBuilder.build(
            input(decisions: try decisions(), proposals: try proposals(), invoices: try invoices())
        )

        #expect(snapshot.section(.awaitingYou).rows.map(\.id)
                == ["awaiting.decisions", "awaiting.invoices", "awaiting.proposals"])
        #expect(snapshot.attentionSummary.awaitingCount == 4)
    }
}
