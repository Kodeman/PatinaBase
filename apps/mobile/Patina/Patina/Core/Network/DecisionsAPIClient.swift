//
//  DecisionsAPIClient.swift
//  Patina
//
//  Lists `client_decisions` + options and lets the authenticated client
//  view, select, and consent to a decision. RLS (migrations 00062 / 00064)
//  gates these to the `designer_clients.client_id = auth.uid()` participant
//  of the decision.
//
//  Schema reference (the column names below are the *real* ones; the
//  PostgREST `select` aliasing keeps the Swift field names stable):
//   • `client_decisions`        — 00062 base + 00064 v2 + 00084 mvp + 00117 consent
//       title, context, status (draft|pending|responded|expired),
//       decision_type, recommended_option_id, due_date, viewed_at,
//       responded_at, selected_by, client_consent_method, client_signature,
//       client_consented_at, created_at, project_id
//   • `client_decision_options` — 00062 base + 00064 v2 + 00172 product link
//       name, image_url, designer_note, is_recommended, selected,
//       client_note, price, quantity, sort_order, product_id
//
//  Catalog-first options (00172): the portal's option builder often writes
//  only `product_id` and leaves `image_url` (and sometimes the note) empty,
//  so both option queries embed `products(name,images,price_retail)` and the
//  `resolved*` accessors below fall back to the product. RLS caveat: clients
//  can only read `catalog`-layer products, so a personal/studio-layer link
//  embeds as null — the UI must degrade to a "view in portal" card.
//
//  Write paths:
//   • `markViewed`     — stamps `viewed_at` (client RLS allows it; 00064).
//   • `applyDecision`  — the canonical feed-through RPC (00085) that flips
//     the decision to `responded`, marks the chosen option `selected`, and
//     unblocks any FF&E items gated on the decision.
//   • `recordConsent`  — writes the click-through / e-signature consent
//     fields (00117) alongside the selection.
//

import Foundation
import Supabase

/// Embedded `projects(name)` row on a decision — gives list rows their
/// project context without a second round-trip.
public struct RemoteDecisionProjectRef: Codable, Sendable {
    public let name: String?
}

/// Embedded `products(...)` row on an option (FK from 00172). Null when the
/// option is manual-only or when RLS hides the product from the client.
public struct RemoteDecisionProductRef: Codable, Sendable {
    public let name: String?
    /// `products.images` is `text[]` — first entry is the hero image.
    public let images: [String]?
    /// Retail price in cents (Supabase convention).
    public let price_retail: Int?
}

public struct RemoteClientDecision: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String?
    /// Embedded via `project:projects(name)`; nil when the decision isn't
    /// linked to a project (or the embed was filtered by RLS).
    public let project: RemoteDecisionProjectRef?
    public let title: String?
    /// Aliased from `client_decisions.context` (the designer's explanation).
    public let description: String?
    public let status: String?
    public let decision_type: String?
    public let recommended_option_id: String?
    /// Audit-trail timestamps. Non-nil once the client has viewed / responded.
    public let viewed_at: String?
    public let responded_at: String?
    public let due_date: String?
    /// How the client consented when resolving the decision themselves
    /// (`electronic_signature` | `click_through`); nil while unresolved.
    public let client_consent_method: String?
    public let client_consented_at: String?
    public let created_at: String

    /// Convenience: the decision has already been responded to.
    public var isResolved: Bool {
        status == "responded" || responded_at != nil
    }
}

public struct RemoteDecisionOption: Codable, Sendable, Identifiable {
    public let id: String
    public let decision_id: String
    /// Aliased from `client_decision_options.name`.
    public let title: String?
    /// Aliased from `client_decision_options.designer_note`.
    public let description: String?
    public let image_url: String?
    /// Aliased from `client_decision_options.price` (cents).
    public let price_cents: Int?
    public let is_recommended: Bool?
    /// True once the client (or `apply_decision`) marked this the choice.
    public let selected: Bool?
    public let sort_order: Int?
    /// Embedded via `product:products(...)` when the option links a catalog
    /// product (00172). Nil for manual options or RLS-hidden products.
    public let product: RemoteDecisionProductRef?

    // MARK: Resolved content (manual fields first, linked product fallback)

    /// Display title: the manual `name`, else the linked product's name.
    public var resolvedTitle: String? {
        if let title, !title.isEmpty { return title }
        if let name = product?.name, !name.isEmpty { return name }
        return nil
    }

    /// Display description: the designer's note (no product fallback — a
    /// product description isn't the designer's framing of the choice).
    public var resolvedDescription: String? {
        if let description, !description.isEmpty { return description }
        return nil
    }

    /// Display image: the manual `image_url`, else the product's hero image.
    public var resolvedImageURL: URL? {
        if let image_url, !image_url.isEmpty, let url = URL(string: image_url) {
            return url
        }
        if let first = product?.images?.first, let url = URL(string: first) {
            return url
        }
        return nil
    }

    /// Display price in cents: the manual `price`, else the product retail.
    public var resolvedPriceCents: Int? {
        price_cents ?? product?.price_retail
    }

    /// Whether the card has anything meaningful to show. When false the UI
    /// must not let the client contractually approve a blank card (R06).
    public var hasRenderableContent: Bool {
        resolvedTitle != nil || resolvedDescription != nil || resolvedImageURL != nil
    }
}

public actor DecisionsAPIClient {
    public static let shared = DecisionsAPIClient()

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    /// Decision columns selected with PostgREST aliases so the wire JSON
    /// matches `RemoteClientDecision`'s field names. Kept in one place so
    /// the list + detail queries can't drift.
    private static let decisionSelect =
        "id,project_id,title,description:context,status,decision_type,"
        + "recommended_option_id,viewed_at,responded_at,due_date,"
        + "client_consent_method,client_consented_at,created_at,"
        + "project:projects(name)"

    /// Option columns, likewise aliased, with the linked product embedded
    /// (00172) so catalog-first options still render name/image/price.
    private static let optionSelect =
        "id,decision_id,title:name,description:designer_note,image_url,"
        + "price_cents:price,is_recommended,selected,sort_order,"
        + "product:products(name,images,price_retail)"

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

    // MARK: - Reads

    public func listPending(forUser userId: String? = nil) async throws -> [RemoteClientDecision] {
        let queryItems = [
            URLQueryItem(name: "select", value: Self.decisionSelect),
            URLQueryItem(name: "status", value: "eq.pending"),
            URLQueryItem(name: "order", value: "due_date.asc.nullslast,created_at.desc"),
        ]
        let url = baseURL.appendingPathComponent("/rest/v1/client_decisions")
            .appending(queryItems: queryItems)
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode([RemoteClientDecision].self, from: data)
    }

    public func fetchDecision(id: String) async throws -> RemoteClientDecision? {
        let url = baseURL.appendingPathComponent("/rest/v1/client_decisions")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: Self.decisionSelect),
                URLQueryItem(name: "id", value: "eq.\(id)"),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        let rows = try decoder.decode([RemoteClientDecision].self, from: data)
        return rows.first
    }

    public func listOptions(forDecision decisionId: String) async throws -> [RemoteDecisionOption] {
        let url = baseURL.appendingPathComponent("/rest/v1/client_decision_options")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: Self.optionSelect),
                URLQueryItem(name: "decision_id", value: "eq.\(decisionId)"),
                URLQueryItem(name: "order", value: "sort_order.asc,id.asc"),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode([RemoteDecisionOption].self, from: data)
    }

    /// Minimal row shape for the project-thread lookup below.
    private struct ThreadRef: Codable { let id: String }

    /// Resolve the project's comms thread for the decision detail's
    /// "Discuss this" action. RLS (00102) already filters to threads the
    /// user participates in, so a nil result simply hides the action.
    public func findProjectThread(projectId: String) async throws -> String? {
        let url = baseURL.appendingPathComponent("/rest/v1/comms_threads")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "id"),
                URLQueryItem(name: "project_id", value: "eq.\(projectId)"),
                URLQueryItem(name: "kind", value: "eq.project"),
                URLQueryItem(name: "order", value: "last_message_at.desc.nullslast"),
                URLQueryItem(name: "limit", value: "1"),
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        return try decoder.decode([ThreadRef].self, from: data).first?.id
    }

    // MARK: - Writes

    /// Stamp `viewed_at` through the addressed-client authority. The server
    /// owns the timestamp and keeps repeat opens idempotent.
    public func markViewed(decisionId: String) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/rpc/mark_client_decision_viewed")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        await applyHeaders(to: &request)
        let body: [String: String] = ["p_decision_id": decisionId]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
    }

    /// How the client gave consent when resolving a decision themselves.
    /// Mirrors the `client_decisions.client_consent_method` CHECK (00117).
    public enum ConsentMethod: String, Sendable {
        case clickThrough = "click_through"
        case electronicSignature = "electronic_signature"
    }

    /// Select an option and capture consent in one canonical transaction.
    public func selectOption(
        decisionId: String,
        optionId: String,
        consent: ConsentMethod,
        signature: String? = nil
    ) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/rpc/apply_client_decision")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        await applyHeaders(to: &request)
        let params: [String: Any] = [
            "p_decision_id": decisionId,
            "p_selected_option_id": optionId,
            "p_client_consent_method": consent.rawValue,
            "p_client_signature": signature ?? NSNull(),
            "p_client_note": NSNull(),
            "p_quantity": NSNull(),
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: params)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
    }
}
