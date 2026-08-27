//
//  StudioHubTests.swift
//  PatinaTests
//

import Foundation
import Testing
@testable import Patina

struct StudioHubTests {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    @Test
    @MainActor
    func groupsRealRecordsByStateAndOrdersUrgentWorkFirst() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-07-29T16:00:00Z"))
        let snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: try sampleProjects(),
                decisions: try sampleDecisions(),
                proposals: try sampleProposals(),
                invoices: try sampleInvoices(),
                documents: try sampleDocuments(),
                threads: try sampleThreads(),
                notifications: try sampleNotifications(),
                currentUserId: "client",
                now: now
            )
        )

        #expect(snapshot.section(.awaitingYou).rows.map(\.id) == [
            "awaiting.invoices",
            "awaiting.decisions",
            "awaiting.proposals"
        ])
        #expect(snapshot.section(.inProgress).rows.map(\.id) == ["progress.projects"])
        #expect(snapshot.section(.conversation).rows.map(\.id) == [
            "conversation.threads",
            "conversation.updates"
        ])
        #expect(snapshot.section(.moneyAndDocuments).rows.map(\.id) == [
            "records.proposals",
            "records.invoices",
            "records.documents",
            "records.budget"
        ])
        #expect(snapshot.section(.archive).rows.map(\.id) == [
            "archive.projects",
            "archive.proposals",
            "archive.invoices"
        ])
        #expect(snapshot.attentionSummary.awaitingCount == 3)
        #expect(snapshot.attentionSummary.unreadConversationCount == 1)
        #expect(snapshot.attentionSummary.unreadUpdateCount == 1)
        #expect(snapshot.attentionSummary.activeProjectCount == 1)
        #expect(snapshot.attentionSummary.hint == "3 things need your eye")
    }

    @Test
    @MainActor
    func prioritizesUrgencyBeforeRecordType() throws {
        let decisions = try decode([RemoteClientDecision].self, """
        [{ "id": "decision-1", "title": "Finish", "status": "pending",
           "due_date": "2026-07-28", "created_at": "2026-07-20T12:00:00Z" }]
        """)
        let invoices = try decode([RemoteInvoice].self, """
        [{ "id": "invoice-1", "status": "sent", "due_date": "2026-08-05",
           "total_cents": 10000, "amount_paid_cents": 0,
           "created_at": "2026-07-20T12:00:00Z" }]
        """)
        let now = try #require(ISO8601DateFormatter().date(from: "2026-07-29T16:00:00Z"))
        let snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: [],
                decisions: decisions,
                proposals: [],
                invoices: invoices,
                documents: [],
                threads: [],
                notifications: [],
                currentUserId: "client",
                now: now
            )
        )

        #expect(snapshot.section(.awaitingYou).rows.map(\.id) == [
            "awaiting.decisions",
            "awaiting.invoices"
        ])
    }

    @Test
    func attentionHintUsesSingularPluralAndStaysQuietWhenThereIsNoSignal() {
        #expect(
            StudioAttentionSummary(
                awaitingCount: 1,
                unreadConversationCount: 0,
                unreadUpdateCount: 0,
                activeProjectCount: 0
            ).hint == "1 thing needs your eye"
        )
        #expect(
            StudioAttentionSummary(
                awaitingCount: 0,
                unreadConversationCount: 2,
                unreadUpdateCount: 0,
                activeProjectCount: 0
            ).hint == "2 new conversations"
        )
        #expect(StudioAttentionSummary.empty.hint == nil)
    }

    private func sampleProjects() throws -> [RemoteProject] {
        try decode([RemoteProject].self, """
        [
          { "id": "project-active", "name": "Oak Street", "status": "active",
            "current_phase": "design_refinement", "updated_at": "2026-07-28T12:00:00Z" },
          { "id": "project-done", "name": "Maple House", "status": "completed",
            "updated_at": "2026-06-01T12:00:00Z" }
        ]
        """)
    }

    private func sampleDecisions() throws -> [RemoteClientDecision] {
        try decode([RemoteClientDecision].self, """
        [
          { "id": "decision-1", "title": "Dining table finish", "status": "pending",
            "due_date": "2026-07-29", "created_at": "2026-07-20T12:00:00Z" }
        ]
        """)
    }

    private func sampleProposals() throws -> [RemoteProposal] {
        try decode([RemoteProposal].self, """
        [
          { "id": "proposal-1", "title": "Living room proposal", "status": "sent",
            "valid_until": "2026-08-10", "updated_at": "2026-07-27T12:00:00Z" },
          { "id": "proposal-old", "title": "Earlier proposal", "status": "expired",
            "valid_until": "2026-06-01", "updated_at": "2026-06-01T12:00:00Z" }
        ]
        """)
    }

    private func sampleInvoices() throws -> [RemoteInvoice] {
        try decode([RemoteInvoice].self, """
        [
          { "id": "invoice-1", "status": "sent", "due_date": "2026-07-28",
            "total_cents": 125000, "amount_paid_cents": 25000, "currency": "USD",
            "created_at": "2026-07-10T12:00:00Z" },
          { "id": "invoice-void", "status": "void", "created_at": "2026-05-10T12:00:00Z" }
        ]
        """)
    }

    private func sampleDocuments() throws -> [RemoteProjectDocument] {
        try decode([RemoteProjectDocument].self, """
        [
          { "id": "document-1", "project_id": "project-active",
            "title": "Finish schedule", "doc_type": "pdf",
            "client_visible": true, "created_at": "2026-07-26T12:00:00Z" }
        ]
        """)
    }

    private func sampleThreads() throws -> [RemoteCommsThreadSummary] {
        try decode([RemoteCommsThreadSummary].self, """
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
    }

    private func sampleNotifications() throws -> [RemoteNotification] {
        try decode([RemoteNotification].self, """
        [
          { "id": "notification-1", "user_id": "client",
            "type": "project_update", "channel": "in_app",
            "status": "sent", "created_at": "2026-07-29T13:00:00Z" }
        ]
        """)
    }

    /// SP-13: the Conversation block was the one block drawn without a route,
    /// because `conversationThreadRow` returned nil at zero threads. A client
    /// with a designer and no thread yet is exactly who needs the door.
    @Test
    @MainActor
    func conversationRowIsEmittedAtZeroThreads() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-07-29T16:00:00Z"))
        let snapshot = StudioQueueBuilder.build(
            StudioQueueInput(
                projects: try sampleProjects(),
                decisions: [],
                proposals: [],
                invoices: [],
                documents: [],
                threads: [],
                notifications: [],
                currentUserId: "client",
                now: now
            )
        )

        let row = try #require(
            snapshot.section(.conversation).rows.first { $0.id == "conversation.threads" }
        )
        #expect(row.route == .threadList)
        #expect(row.title == "Conversation")
        // m1: the hub is reachable at `.engaged`, which includes a client
        // whose request is still pooled with nobody claimed — so the row may
        // not promise a designer.
        #expect(row.detail == "No messages yet")
    }
}
