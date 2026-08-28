//
//  NotificationsAPIClient.swift
//  Patina
//
//  Lists and updates entries in `notification_log` for the current user.
//  Used by the in-app notification feed (`NotificationFeedView`).
//
//  Backend reference:
//   • Table: `notification_log` (migration 00041)
//   • RLS:   users SELECT their own rows; service role inserts (via edge
//            functions and triggers). We piggyback on the user's JWT and
//            never insert from the client.
//

import Foundation
import Supabase

public struct RemoteNotification: Codable, Sendable {
    public let id: String
    public let user_id: String
    public let type: String
    public let channel: String
    public let status: String
    public let metadata: [String: AnyCodable]?
    public let opened_at: String?
    public let clicked_at: String?
    public let sent_at: String?
    public let created_at: String
}

public actor NotificationsAPIClient {
    public static let shared = NotificationsAPIClient()
    static let visibleStatusFilter = "in.(queued,sending,delivered,unconfirmed,opened,clicked)"

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private func authToken() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.accessToken
    }

    private func applyHeaders(to request: inout URLRequest, prefer: String? = nil) async {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout
        if let token = await authToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let prefer {
            request.setValue(prefer, forHTTPHeaderField: "Prefer")
        }
    }

    /// List the user's most-recent in-app + push notifications. Filters to
    /// the channels that actually surface in the feed (in_app, push) and
    /// excludes failed/suppressed states so the UI never shows them.
    public func list(limit: Int = 50) async throws -> [RemoteNotification] {
        let url = baseURL.appendingPathComponent("/rest/v1/notification_log")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "order", value: "created_at.desc"),
                URLQueryItem(name: "channel", value: "in.(in_app,push)"),
                URLQueryItem(name: "status", value: Self.visibleStatusFilter),
                URLQueryItem(name: "limit", value: String(limit)),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try decoder.decode([RemoteNotification].self, from: data)
    }

    /// Mark a notification as opened.
    public func markOpened(id: String, openedAt: Date = Date()) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/notification_log")
            .appending(queryItems: [URLQueryItem(name: "id", value: "eq.\(id)")])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=minimal")
        let iso = ISO8601DateFormatter().string(from: openedAt)
        let body: [String: String] = ["opened_at": iso, "status": "opened"]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: "")
        }
    }

    /// Mark all currently-unread notifications for the user as opened.
    /// We don't have a bulk RPC — perform a single PATCH against all rows
    /// for the user where opened_at IS NULL and channel is in the surfaced
    /// set.
    public func markAllOpened() async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/notification_log")
            .appending(queryItems: [
                URLQueryItem(name: "opened_at", value: "is.null"),
                URLQueryItem(name: "channel", value: "in.(in_app,push)"),
            ])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=minimal")
        let iso = ISO8601DateFormatter().string(from: Date())
        let body: [String: String] = ["opened_at": iso, "status": "opened"]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: "")
        }
    }
}

// MARK: - Mapping to UI model

extension AppNotification {
    /// Build an in-feed AppNotification from a `notification_log` row.
    /// Maps the server `type` string to a known `AppNotificationType` for
    /// the icon + color, falling back to `.newRecommendations` when the
    /// type is unfamiliar.
    init(from remote: RemoteNotification) {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let createdDate = formatter.date(from: remote.created_at)
            ?? ISO8601DateFormatter().date(from: remote.created_at)
            ?? Date()

        // `notification_log` has no first-class entity columns (00041); routing
        // payload lives in `metadata.entity_type` / `metadata.entity_id` to
        // mirror the APNs envelope shape.
        let entityType = remote.metadata?["entity_type"]?.value as? String
        let entityId = remote.metadata?["entity_id"]?.value as? String

        // `metadata.entity_type` is the field 00534 guarantees and the one
        // NotificationRouter routes on, so it decides the bucket. The `type`
        // string is a second opinion for rows that predate the contract —
        // reading `type` alone put 00534's `decision_attention` rows in the
        // "New pieces for you" bucket with a sparkles icon.
        let type = AppNotificationType(entityType: entityType)
            ?? AppNotificationType(serverType: remote.type)
        let title = remote.metadata?["title"]?.value as? String ?? type.defaultTitle
        let body = remote.metadata?["body"]?.value as? String
            ?? remote.metadata?["preview"]?.value as? String
            ?? ""

        self.init(
            remoteId: remote.id,
            type: type,
            title: title,
            body: body,
            timestamp: createdDate,
            isRead: remote.opened_at != nil || remote.status == "opened" || remote.status == "clicked",
            entityType: entityType,
            entityId: entityId
        )
    }
}

extension AppNotificationType {
    /// Map `metadata.entity_type` — the field 00534 guarantees and the one
    /// `NotificationRouter` routes on — to a bucket. `nil` for anything that
    /// is not one of the three client-facing kinds, so the caller falls back
    /// to the `type` string.
    init?(entityType: String?) {
        switch entityType?.lowercased() {
        case "proposal": self = .proposal
        case "invoice": self = .invoice
        case "decision": self = .decision
        // W5: what `fulfillment-notify` actually writes
        // (`fulfillment-notify/core.ts:265`), plus the direct rail's own
        // spelling, so an order never arrives in the "New pieces for you"
        // bucket with a sparkles icon.
        case "fulfillment_order", "order", "direct_order": self = .order
        default: return nil
        }
    }

    /// Map a server `notification_log.type` value to a UI bucket. Keep this
    /// lenient — backend introduces new types frequently and we should still
    /// render *something*.
    init(serverType: String) {
        switch serverType {
        case "recommendation_new", "daily_recommendations", "new_recommendation":
            self = .newRecommendations
        case "designer_message", "designer_reply", "designer_response":
            self = .designerResponse
        case "style_profile_updated", "style_update":
            self = .styleUpdate
        case "price_drop", "back_in_stock", "emergence_alert":
            self = .emergenceAlert
        case "scan_complete", "scan_processed", "room_scan_synced":
            self = .scanComplete
        // SP-08: the client-facing money/decision types. `proposal_sent` is
        // not new — 00388_proposal_send_dispatch_guard.sql:1258-1278 already
        // writes it on the real send path; the seed bypassed it, which is why
        // the bell read empty beside a proposal awaiting signature (F08).
        case "proposal_sent", "proposal_reminder", "proposal_attention":
            self = .proposal
        case "invoice_sent", "invoice_due", "invoice_reminder", "invoice_attention":
            self = .invoice
        case "decision_raised", "decision_reminder", "decision_attention":
            self = .decision
        // The six transitions `_shared/fulfillment-templates.ts:38-49` names,
        // plus the intake the settle writes.
        case "order_confirmed", "order_in_production", "order_shipped",
             "order_delivered", "order_eta_change", "order_substitution",
             "fulfillment_order", "direct_order_paid":
            self = .order
        default:
            self = .newRecommendations
        }
    }

    var defaultTitle: String {
        switch self {
        case .newRecommendations: return "New pieces for you"
        case .designerResponse: return "Designer update"
        case .styleUpdate: return "Style profile updated"
        case .emergenceAlert: return "Something's emerging"
        case .scanComplete: return "Room scan ready"
        case .proposal: return "A proposal needs your signature"
        case .invoice: return "An invoice is waiting"
        case .decision: return "A decision needs you"
        case .order: return "An update on your order"
        }
    }
}
