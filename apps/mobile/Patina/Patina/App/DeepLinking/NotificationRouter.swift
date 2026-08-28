//
//  NotificationRouter.swift
//  Patina
//
//  Shared `entity_type`/`entity_id` → `AppRoute` mapping used by both the
//  APNs delegate (`PatinaAppDelegate`) and the in-app notification feed
//  (`NotificationFeedView`). Keeps the routing table in one place so the
//  two call sites can't drift.
//
//  Backend reference:
//   • Table: `notification_log` (migration 00041). Entity routing data
//     lives inside `metadata` JSONB — there are no top-level
//     `entity_type` / `entity_id` columns — so we read from
//     `metadata.entity_type` / `metadata.entity_id` for in-feed rows.
//   • APNs envelope (sent by edge functions):
//       { "aps": { "alert": "…" },
//         "entity_type": "project" | "decision" | "thread" | "room" | "product",
//         "entity_id": "<uuid or product id>",
//         "notification_log_id": "<uuid>" }
//

import Foundation

/// Resolves notification payloads to in-app navigation routes. Pure
/// functions — no state, no side effects, no UI.
///
/// Module-internal scope because `AppNotification` is internal — this
/// router lives in the same target as both call sites (the APNs
/// delegate and the in-feed tap handler).
enum NotificationRouter {

    // MARK: - Public API

    /// Map an APNs userInfo dictionary to its `AppRoute` and the
    /// originating `notification_log.id`. `route` is `nil` for unknown
    /// or missing `entity_type` — callers should fall back to opening
    /// the notification feed.
    static func resolve(
        apnsUserInfo userInfo: [AnyHashable: Any]
    ) -> (route: AppRoute?, notificationLogId: String?) {
        let entityType = (userInfo["entity_type"] as? String)?.lowercased()
        let entityId = userInfo["entity_id"] as? String
        let logId = userInfo["notification_log_id"] as? String
            ?? userInfo["notification_id"] as? String
        return (route(forEntityType: entityType, entityId: entityId), logId)
    }

    /// Map an in-feed `AppNotification` row to its `AppRoute`. Returns
    /// `nil` if the row has no entity payload or the entity type is
    /// unknown.
    static func route(for notification: AppNotification) -> AppRoute? {
        route(
            forEntityType: notification.entityType?.lowercased(),
            entityId: notification.entityId
        )
    }

    /// Core mapping. `entityType` is expected to be lowercased so the
    /// table stays small.
    static func route(forEntityType entityType: String?, entityId: String?) -> AppRoute? {
        guard let entityType, let entityId, !entityId.isEmpty else { return nil }
        switch entityType {
        case "project":
            return .projectDetail(projectId: entityId)
        case "proposal":
            // Forward-compatible: no edge function emits entity_type
            // "proposal" yet, but the money-rail push envelopes may soon.
            return .proposalDetail(proposalId: entityId)
        case "decision":
            return .decisionDetail(decisionId: entityId)
        case "invoice":
            // Forward-compatible: no edge function emits entity_type "invoice"
            // yet, but the money-rail push envelopes may soon.
            return .invoiceDetail(invoiceId: entityId)
        case "design_request", "lead":
            return .designRequests(focusLeadId: entityId)
        case "thread", "message_thread":
            return .threadDetail(threadId: entityId)
        case "room":
            // Rooms route off a UUID — fall back gracefully if the
            // payload is malformed rather than crashing.
            return UUID(uuidString: entityId).map { .roomProject(roomId: $0) }
        case "product", "piece":
            return .pieceDetail(pieceId: entityId)
        case "fulfillment_order", "order":
            // What `fulfillment-notify` actually writes is `fulfillment_order`
            // (`fulfillment-notify/core.ts:265`), carrying the
            // `fulfillment_orders.id`; `order` is accepted because the envelope
            // is hand-assembled per call site and the shorter spelling is one
            // typo away. `AppRoute.orderDetail` takes a PREFIXED token
            // (`ClientOrder.id`), so the rail is named here.
            return .orderDetail(orderId: "\(ClientOrder.Rail.fulfillment.rawValue):\(entityId)")
        case "direct_order":
            // A direct order that has not yet reached the fulfillment rail —
            // the paid-but-not-shipped window.
            return .orderDetail(orderId: "\(ClientOrder.Rail.direct.rawValue):\(entityId)")
        default:
            return nil
        }
    }
}
