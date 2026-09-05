//
//  NotificationDeepLinkRoutingTests.swift
//  PatinaTests
//
//  `P-06`, second half. The proposal and invoice arms of `NotificationRouter`
//  were annotated "no edge function emits this yet"; Wave 1 landed the
//  emitters, so those arms are live and pinned here.
//
//  The other half is the Threshold. Since the 2026-09-04 cutover the client
//  portal is one page per project, and `_shared/client-portal-links.ts` writes
//  `/projects/<id>?invoice=<id>#ledger` and `/?proposal=<id>#mat-papers` — the
//  entity is in a query param or a `#approval-<id>` anchor, never in an
//  `entity_type` pair. A push composed from one of those links used to resolve
//  to nothing and drop the reader on the plain feed.
//

import Foundation
import Testing
@testable import Patina

struct NotificationDeepLinkRoutingTests {

    // MARK: - The two arms that were annotated dead

    @Test("the money rail's two entity types route to their own screens")
    func theMoneyRailRoutes() {
        #expect(
            NotificationRouter.route(forEntityType: "proposal", entityId: "p-1")
                == .proposalDetail(proposalId: "p-1")
        )
        #expect(
            NotificationRouter.route(forEntityType: "invoice", entityId: "i-1")
                == .invoiceDetail(invoiceId: "i-1")
        )
    }

    @Test("an APNs envelope carrying the money rail's entity pair routes")
    func theEnvelopeRoutes() {
        let proposal = NotificationRouter.resolve(apnsUserInfo: [
            "entity_type": "proposal", "entity_id": "p-2", "notification_log_id": "log-2"
        ])
        #expect(proposal.route == .proposalDetail(proposalId: "p-2"))
        #expect(proposal.notificationLogId == "log-2")

        let invoice = NotificationRouter.resolve(apnsUserInfo: [
            "entity_type": "invoice", "entity_id": "i-2"
        ])
        #expect(invoice.route == .invoiceDetail(invoiceId: "i-2"))
    }

    // MARK: - The anchor shape

    @Test("a #approval-<id> anchor opens that approval, not the project")
    func theApprovalAnchorWins() {
        #expect(
            NotificationRouter.route(forDeepLink: "/projects/proj-1#approval-dec-9")
                == .decisionDetail(decisionId: "dec-9")
        )
        // Absolute is the same link with an origin in front of it.
        #expect(
            NotificationRouter.route(
                forDeepLink: "https://client.patina.cloud/projects/proj-1#approval-dec-9"
            ) == .decisionDetail(decisionId: "dec-9")
        )
    }

    @Test("an anchor naming a section, not a row, resolves to nothing")
    func aSectionAnchorIsNotARow() {
        // `/` with a section anchor is the doorstep: the link names a page,
        // and the router may not invent a row for it.
        #expect(NotificationRouter.route(forDeepLink: "/#ledger") == nil)
        #expect(NotificationRouter.route(forDeepLink: "/#doorstep") == nil)
        #expect(NotificationRouter.route(forDeepLink: "approval-") == nil)
    }

    /// A malformed anchor is not a reason to dead-end: the link still names a
    /// project, and the reader lands on it rather than on nothing.
    @Test("an empty approval anchor falls back to the project the link names")
    func anEmptyApprovalAnchorFallsBackToTheProject() {
        #expect(
            NotificationRouter.route(forDeepLink: "/projects/proj-1#approval-")
                == .projectDetail(projectId: "proj-1")
        )
    }

    // MARK: - The query shape

    @Test("a ?proposal= query opens the proposal")
    func theProposalQueryRoutes() {
        #expect(
            NotificationRouter.route(forDeepLink: "/?proposal=prop-4#mat-papers")
                == .proposalDetail(proposalId: "prop-4")
        )
    }

    @Test("a ?invoice= query on a project path opens the invoice, not the project")
    func theInvoiceQueryBeatsTheProjectPath() {
        #expect(
            NotificationRouter.route(forDeepLink: "/projects/proj-1?invoice=inv-7#ledger")
                == .invoiceDetail(invoiceId: "inv-7")
        )
    }

    @Test("a ?decision= query opens the approval")
    func theDecisionQueryRoutes() {
        #expect(
            NotificationRouter.route(forDeepLink: "/?decision=dec-3#approval-dec-3")
                == .decisionDetail(decisionId: "dec-3")
        )
    }

    // MARK: - The path shape 00534 still writes

    @Test("the three entity paths still route")
    func theEntityPathsRoute() {
        #expect(
            NotificationRouter.route(forDeepLink: "/decisions/dec-1")
                == .decisionDetail(decisionId: "dec-1")
        )
        #expect(
            NotificationRouter.route(forDeepLink: "/proposals/prop-1")
                == .proposalDetail(proposalId: "prop-1")
        )
        #expect(
            NotificationRouter.route(forDeepLink: "/invoices/inv-1")
                == .invoiceDetail(invoiceId: "inv-1")
        )
        #expect(
            NotificationRouter.route(forDeepLink: "/projects/proj-1")
                == .projectDetail(projectId: "proj-1")
        )
    }

    @Test("a link naming nothing routes nowhere")
    func anEmptyLinkRoutesNowhere() {
        #expect(NotificationRouter.route(forDeepLink: nil) == nil)
        #expect(NotificationRouter.route(forDeepLink: "") == nil)
        #expect(NotificationRouter.route(forDeepLink: "/") == nil)
        #expect(NotificationRouter.route(forDeepLink: "/decisions") == nil)
    }

    // MARK: - Both call sites read it

    @Test("the envelope falls back to deep_link when it carries no entity pair")
    func theEnvelopeFallsBackToTheDeepLink() {
        let resolved = NotificationRouter.resolve(apnsUserInfo: [
            "deep_link": "/projects/proj-1?invoice=inv-2#ledger",
            "notification_log_id": "log-9"
        ])
        #expect(resolved.route == .invoiceDetail(invoiceId: "inv-2"))
        #expect(resolved.notificationLogId == "log-9")

        // `url` mirrors `deep_link` on the same row (00534:157).
        let mirrored = NotificationRouter.resolve(apnsUserInfo: [
            "url": "/?proposal=prop-8#mat-papers"
        ])
        #expect(mirrored.route == .proposalDetail(proposalId: "prop-8"))
    }

    @Test("an entity pair still wins over the link beside it")
    func theEntityPairWins() {
        let resolved = NotificationRouter.resolve(apnsUserInfo: [
            "entity_type": "decision", "entity_id": "dec-5",
            "deep_link": "/?proposal=prop-8#mat-papers"
        ])
        #expect(resolved.route == .decisionDetail(decisionId: "dec-5"))
    }

    @Test("a feed row routes by its deep link when the entity pair is missing")
    func theFeedRowFallsBackToTheDeepLink() {
        let row = AppNotification(
            type: .invoice,
            title: "An invoice is ready",
            body: "",
            timestamp: Date(),
            deepLink: "/projects/proj-1?invoice=inv-3#ledger"
        )
        #expect(row.route == .invoiceDetail(invoiceId: "inv-3"))
    }
}
