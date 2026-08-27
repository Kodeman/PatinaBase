//
//  BellQueueFallbackTests.swift
//  PatinaTests
//
//  SP-08 — the bell shows what is already waiting.
//
//  On the same device, in the same minute: the bell read "Nothing yet" /
//  "Updates from your designer will land here." while the Studio two screens
//  away listed a decision overdue since Aug 22, a $4,250.00 invoice due Sep 1,
//  and a proposal to review by Sep 8 (F08, F85, F72, F160). Invoices and
//  decisions write nothing client-facing into `notification_log` at all.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct BellQueueFallbackTests {

    // MARK: - The 00534 row contract

    /// Without their own buckets these fell through to `.newRecommendations`,
    /// whose default title is "New pieces for you" — an invoice arriving under
    /// that title is exactly the C5 failure the program exists to repair.
    @Test("00534's client-facing types map to their own buckets")
    func moneyTypesMapHonestly() {
        #expect(AppNotificationType(serverType: "proposal_sent") == .proposal)
        #expect(AppNotificationType(serverType: "invoice_sent") == .invoice)
        #expect(AppNotificationType(serverType: "invoice_due") == .invoice)
        #expect(AppNotificationType(serverType: "decision_raised") == .decision)
        #expect(AppNotificationType(serverType: "something_new") == .newRecommendations)
    }

    @Test("each bucket carries an honest default title")
    func moneyTypeTitlesSayWhatArrived() {
        #expect(AppNotificationType.proposal.defaultTitle == "A proposal needs your signature")
        #expect(AppNotificationType.invoice.defaultTitle == "An invoice is waiting")
        #expect(AppNotificationType.decision.defaultTitle == "A decision needs you")
    }

    /// The spelling must match `NotificationRouter`'s table and 00534's
    /// `metadata.entity_type` exactly, or the row will not route.
    @Test("bucket entity types are the lower-case router spellings")
    func bucketEntityTypesMatchTheRouter() {
        #expect(AppNotificationType.proposal.entityType == "proposal")
        #expect(AppNotificationType.invoice.entityType == "invoice")
        #expect(AppNotificationType.decision.entityType == "decision")
        #expect(AppNotificationType.scanComplete.entityType == nil)
    }

    /// Observed live on `dr-w1b-c` against lane D's 00534 rows: they carry
    /// `type = "decision_attention"`, which no `type`-only table anticipated,
    /// so every one of them landed in `.newRecommendations` and drew a
    /// sparkles icon. `metadata.entity_type` is the field 00534 guarantees and
    /// the one `NotificationRouter` routes on, so it decides the bucket.
    @Test("the bucket comes from metadata.entity_type, not from the type string")
    func entityTypeDecidesTheBucket() {
        #expect(AppNotificationType(entityType: "decision") == .decision)
        #expect(AppNotificationType(entityType: "Invoice") == .invoice)
        #expect(AppNotificationType(entityType: "proposal") == .proposal)
        #expect(AppNotificationType(entityType: "room") == nil)
        #expect(AppNotificationType(entityType: nil) == nil)
    }

    /// The `type` strings 00534 actually writes, kept as the second opinion
    /// for rows that carry no entity metadata.
    @Test("the attention type strings map too")
    func attentionTypeStringsMap() {
        #expect(AppNotificationType(serverType: "decision_attention") == .decision)
        #expect(AppNotificationType(serverType: "invoice_attention") == .invoice)
        #expect(AppNotificationType(serverType: "proposal_attention") == .proposal)
    }

    // MARK: - One event, one row

    /// 00534 writes TWO rows per event — `in_app`/`delivered` and
    /// `push`/`queued` — and the feed's channel filter admits both, so three
    /// decisions printed as six rows on the walk.
    @Test("the two rows 00534 writes per event collapse to one")
    func duplicateChannelRowsCollapse() {
        let rows = [
            Self.delivered(type: .decision, entityId: "d-1"),
            Self.delivered(type: .decision, entityId: "d-1"),
            Self.delivered(type: .decision, entityId: "d-2"),
            Self.delivered(type: .decision, entityId: "d-2")
        ]
        let collapsed = NotificationsViewModel.collapseDuplicates(rows)
        #expect(collapsed.count == 2)
        #expect(collapsed.compactMap(\.entityId) == ["d-1", "d-2"])
    }

    /// A row with no entity payload cannot be de-duplicated and must survive.
    @Test("rows without an entity are never collapsed")
    func rowsWithoutEntityAreKept() {
        let rows = [
            AppNotification(remoteId: "a", type: .scanComplete, title: "Room scan ready", body: "", timestamp: Self.now),
            AppNotification(remoteId: "b", type: .scanComplete, title: "Room scan ready", body: "", timestamp: Self.now)
        ]
        #expect(NotificationsViewModel.collapseDuplicates(rows).count == 2)
    }

    /// If either copy has been read, the surviving row is read — the unread
    /// dot must not come back because the twin was never PATCHed.
    @Test("a read twin marks the surviving row read")
    func readStateSurvivesTheCollapse() {
        var read = Self.delivered(type: .invoice, entityId: "inv-1")
        read.isRead = true
        let collapsed = NotificationsViewModel.collapseDuplicates([
            Self.delivered(type: .invoice, entityId: "inv-1"),
            read
        ])
        #expect(collapsed.count == 1)
        #expect(collapsed[0].isRead)
    }

    // MARK: - The fallback

    @Test("the fallback prints the Studio's own awaiting rows")
    func fallbackMirrorsTheStudioQueue() {
        let rows = NotificationsViewModel.fallbackRows(from: Self.snapshot(), now: Self.now)
        #expect(rows.count == 3)
        #expect(Set(rows.compactMap(\.entityType)) == ["invoice", "decision", "proposal"])
    }

    /// A composed row was never delivered, so it has no arrival time and no
    /// read state — printing either would be a fabricated signal (C5).
    @Test("a composed row reports no unread state")
    func fallbackRowsCarryNoReadState() {
        let rows = NotificationsViewModel.fallbackRows(from: Self.snapshot(), now: Self.now)
        #expect(rows.filter(\.isStudioFallback).count == rows.count)
        #expect(rows.filter(\.isRead).count == rows.count)
        #expect(rows.filter { $0.remoteId == nil }.count == rows.count)
    }

    /// Tapping the bell must land where tapping the Studio would.
    @Test("a composed row routes to the Studio row's own destination")
    func fallbackRowsCarryTheStudioRoute() {
        let rows = NotificationsViewModel.fallbackRows(from: Self.snapshot(), now: Self.now)
        let routes = Set(rows.compactMap(\.route))
        #expect(routes.contains(.invoiceList))
        #expect(routes.contains(.decisionList))
        #expect(routes.contains(.proposalList))
    }

    // MARK: - The merge

    @Test("a real row suppresses the aggregate stand-in for its kind")
    func fallbackDedupesAgainstRealRows() {
        let real = [Self.delivered(type: .invoice, entityId: "inv-1")]
        let merged = NotificationsViewModel.merge(
            real: real,
            fallback: NotificationsViewModel.fallbackRows(from: Self.snapshot(), now: Self.now)
        )
        #expect(merged.filter { $0.entityType == "invoice" }.count == 1)
        #expect(merged.first?.remoteId == "remote-inv-1")
        // The kinds the backend said nothing about still draw.
        #expect(merged.filter { $0.entityType == "decision" }.count == 1)
        #expect(merged.filter { $0.entityType == "proposal" }.count == 1)
    }

    @Test("with nothing delivered the bell is the Studio queue")
    func emptyLogFallsBackWholesale() {
        let fallback = NotificationsViewModel.fallbackRows(from: Self.snapshot(), now: Self.now)
        #expect(NotificationsViewModel.merge(real: [], fallback: fallback).count == 3)
    }

    @Test("an empty Studio queue composes nothing")
    func nothingWaitingComposesNothing() {
        #expect(NotificationsViewModel.fallbackRows(from: .empty, now: Self.now).isEmpty)
        #expect(NotificationsViewModel.merge(real: [], fallback: []).isEmpty)
    }

    // MARK: - The tier-branched CTA

    /// F72: `studioCTATitle` fell back to "Get design help" whenever
    /// `promotedRequest` was nil — and for every seeded activeProject client
    /// it is nil, so the acquisition CTA is what an engaged client saw.
    @Test("the empty CTA branches on the designer relationship")
    func emptyCTAIsTierBranched() {
        let live = DesignerRelationship.project(
            projectId: UUID(), designerId: UUID(), studioName: "Hartwell Studio"
        )
        #expect(NotificationFeedView.emptyCTATitle(relationship: live, hasPromotedRequest: false)
            == "Message your designer")
        #expect(NotificationFeedView.emptyCTATitle(relationship: .none, hasPromotedRequest: false)
            == "Get design help")
        #expect(NotificationFeedView.emptyCTATitle(relationship: .none, hasPromotedRequest: true)
            == "Track your request")
    }

    /// A roster row credits attribution but is not a live relationship — it
    /// must not promise a conversation that has no counterpart.
    @Test("a roster-only relationship does not offer a conversation")
    func rosterIsNotLive() {
        let roster = DesignerRelationship.roster(designerId: UUID())
        #expect(NotificationFeedView.emptyCTATitle(relationship: roster, hasPromotedRequest: false)
            == "Get design help")
    }

    // MARK: - Fixtures

    private static let now = ISO8601DateFormatter().date(from: "2026-08-27T16:00:00Z")!

    private static func decode<T: Decodable>(_ type: T.Type, _ json: String) -> T {
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private static var decisionFixture: RemoteClientDecision {
        decode(
            [RemoteClientDecision].self,
            """
            [{ "id": "decision-1", "title": "Dining table finish", "status": "pending",
               "due_date": "2026-08-22", "created_at": "2026-08-14T12:00:00Z" }]
            """
        )[0]
    }

    private static var proposalFixture: RemoteProposal {
        decode(
            [RemoteProposal].self,
            """
            [{ "id": "proposal-1", "title": "Living room proposal", "status": "sent",
               "valid_until": "2026-09-08", "updated_at": "2026-08-20T12:00:00Z" }]
            """
        )[0]
    }

    private static var invoiceFixture: RemoteInvoice {
        decode(
            [RemoteInvoice].self,
            """
            [{ "id": "invoice-1", "status": "sent", "due_date": "2026-09-01",
               "total_cents": 425000, "amount_paid_cents": 0, "currency": "USD",
               "created_at": "2026-08-10T12:00:00Z" }]
            """
        )[0]
    }

    private static func delivered(type: AppNotificationType, entityId: String) -> AppNotification {
        AppNotification(
            remoteId: "remote-\(entityId)",
            type: type,
            title: type.defaultTitle,
            body: "",
            timestamp: now,
            entityType: type.entityType,
            entityId: entityId
        )
    }

    /// One awaiting row of each kind, built through the real
    /// `StudioQueueBuilder` so the fallback cannot drift from the Studio.
    private static func snapshot() -> StudioQueueSnapshot {
        StudioQueueBuilder.build(
            StudioQueueInput(
                projects: [],
                decisions: [decisionFixture],
                proposals: [proposalFixture],
                invoices: [invoiceFixture],
                documents: [],
                threads: [],
                notifications: [],
                currentUserId: nil,
                now: now
            )
        )
    }
}
