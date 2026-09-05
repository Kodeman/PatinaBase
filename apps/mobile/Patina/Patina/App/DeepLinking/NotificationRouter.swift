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
//   • `metadata.deep_link` / `metadata.url` (00534:156) — the portal address
//     of the same thing. It is the fallback when the envelope carries no
//     entity pair, and it is the only field the Threshold's own links fill:
//     `_shared/client-portal-links.ts` writes `/projects/<id>?invoice=<id>#ledger`
//     and `/?proposal=<id>#mat-papers`, which name the entity in a query or a
//     `#approval-<id>` anchor rather than in the path.
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
        let route = route(forEntityType: entityType, entityId: entityId)
            ?? route(forDeepLink: userInfo["deep_link"] as? String)
            ?? route(forDeepLink: userInfo["url"] as? String)
        return (route, logId)
    }

    /// Map an in-feed `AppNotification` row to its `AppRoute`. Returns
    /// `nil` if the row has no entity payload or the entity type is
    /// unknown.
    static func route(for notification: AppNotification) -> AppRoute? {
        route(
            forEntityType: notification.entityType?.lowercased(),
            entityId: notification.entityId
        ) ?? route(forDeepLink: notification.deepLink)
    }

    /// Core mapping. `entityType` is expected to be lowercased so the
    /// table stays small.
    static func route(forEntityType entityType: String?, entityId: String?) -> AppRoute? {
        guard let entityType, let entityId, !entityId.isEmpty else { return nil }
        switch entityType {
        case "project":
            return .projectDetail(projectId: entityId)
        case "proposal":
            // Live since Wave 1's P-06: `proposal-send/index.ts:381` calls
            // `notifyClientAttention` with `entityType: "proposal"`, and 00534
            // puts that string on both legs of the envelope.
            return .proposalDetail(proposalId: entityId)
        case "decision":
            return .decisionDetail(decisionId: entityId)
        case "invoice":
            // Live since Wave 1's P-06: `invoice-send/index.ts:332` and
            // `invoice-reminders/index.ts:406` both call
            // `notifyClientAttention` with `entityType: "invoice"`.
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
        default:
            return orderRoute(forEntityType: entityType, entityId: entityId)
        }
    }

    // MARK: - Portal deep links

    /// Map a `metadata.deep_link` to the native screen it names.
    ///
    /// `P-06`. The client portal is one page per project since the Threshold
    /// cutover, so `_shared/client-portal-links.ts` no longer writes a route
    /// per entity: it writes a project path with the entity in a query param
    /// and the section in a `#anchor`. A push composed from one of those links
    /// carries no `entity_type` pair, and the router answered nil for it — the
    /// tap fell through to the plain notifications feed.
    ///
    /// Read most-specific first, because one link can carry all three: an
    /// `#approval-<id>` anchor names one approval, a query param names one
    /// row, and the path names at most the project the row sits in.
    ///
    /// Relative and absolute forms both parse — `URLComponents` needs no host
    /// — and a link naming nothing answers nil rather than guessing at a list.
    static func route(forDeepLink link: String?) -> AppRoute? {
        guard let link, !link.isEmpty, let parts = URLComponents(string: link) else { return nil }
        return anchorRoute(parts.fragment)
            ?? queryRoute(parts.queryItems)
            ?? pathRoute(parts.path)
    }

    /// `#approval-<decisionId>` — the doorstep element the Threshold draws for
    /// one standing ask. Every other anchor names a SECTION of a page, not a
    /// row, so it resolves to nothing here.
    static func anchorRoute(_ fragment: String?) -> AppRoute? {
        guard let fragment, fragment.hasPrefix(approvalAnchorPrefix) else { return nil }
        let id = String(fragment.dropFirst(approvalAnchorPrefix.count))
        return route(forEntityType: "decision", entityId: id)
    }

    /// `?decision=` / `?proposal=` / `?invoice=` — the params the Threshold's
    /// sections read. The key IS the entity type, so the same table answers.
    static func queryRoute(_ items: [URLQueryItem]?) -> AppRoute? {
        guard let items else { return nil }
        for key in ["decision", "proposal", "invoice"] {
            if let value = items.first(where: { $0.name == key })?.value,
               let route = route(forEntityType: key, entityId: value) {
                return route
            }
        }
        return nil
    }

    /// `/decisions/<id>`, `/proposals/<id>`, `/invoices/<id>` — the three paths
    /// the app's own `applinks:` entitlement claims, and `/projects/<id>`,
    /// which a Threshold link always carries. Plural is the portal's spelling
    /// (`DeepLinkHandler.route(forUniversalLink:)` says why); the singular
    /// forms are accepted for the same reason they are accepted there.
    static func pathRoute(_ path: String) -> AppRoute? {
        let parts = path.split(separator: "/").map(String.init)
        guard parts.count >= 2, let entity = pathEntities[parts[0]] else { return nil }
        return route(forEntityType: entity, entityId: parts[1])
    }

    static let approvalAnchorPrefix = "approval-"

    static let pathEntities: [String: String] = [
        "decisions": "decision", "decision": "decision",
        "proposals": "proposal", "proposal": "proposal",
        "invoices": "invoice", "invoice": "invoice",
        "projects": "project", "project": "project",
        "piece": "piece"
    ]

    /// The two order spellings, split off the main table so the mapping stays
    /// under the complexity gate as the vocabulary grows.
    static func orderRoute(forEntityType entityType: String, entityId: String) -> AppRoute? {
        switch entityType {
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
