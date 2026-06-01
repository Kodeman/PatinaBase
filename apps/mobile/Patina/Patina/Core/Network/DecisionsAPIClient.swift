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
//   • `client_decision_options` — 00062 base + 00064 v2
//       name, image_url, designer_note, is_recommended, selected,
//       client_note, price, quantity, sort_order
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

public struct RemoteClientDecision: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String?
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
        + "client_consent_method,client_consented_at,created_at"

    /// Option columns, likewise aliased.
    private static let optionSelect =
        "id,decision_id,title:name,description:designer_note,image_url,"
        + "price_cents:price,is_recommended,selected,sort_order"

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

    // MARK: - Writes

    /// Stamp `viewed_at` the first time the client opens a decision so the
    /// designer-side dashboard can show "seen". Idempotent on the client —
    /// we only PATCH when the row hasn't been viewed yet (`viewed_at is.null`)
    /// so re-opens don't keep moving the timestamp. RLS (00064) allows the
    /// client to update this field on their own decisions.
    public func markViewed(decisionId: String, viewedAt: Date = Date()) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/client_decisions")
            .appending(queryItems: [
                URLQueryItem(name: "id", value: "eq.\(decisionId)"),
                URLQueryItem(name: "viewed_at", value: "is.null"),
            ])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=minimal")
        let iso = ISO8601DateFormatter().string(from: viewedAt)
        let body: [String: String] = ["viewed_at": iso]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
    }

    /// Apply the client's selection through the canonical feed-through RPC
    /// (`apply_decision`, migration 00085): marks the decision `responded`,
    /// flips the chosen option's `selected` flag, and clears any FF&E items
    /// blocked on this decision. `selected_by` defaults to `auth.uid()`
    /// inside the function, so a separate optionId update isn't needed.
    public func applyDecision(decisionId: String, optionId: String) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/rpc/apply_decision")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        await applyHeaders(to: &request)
        let params: [String: Any] = [
            "p_decision_id": decisionId,
            "p_selected_option_id": optionId,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: params)
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

    /// Record the client's consent for a resolved decision (migration 00117).
    /// Called after `applyDecision` succeeds. `signature` carries the typed
    /// name for `electronic_signature`; it's omitted for a plain click-through.
    public func recordConsent(
        decisionId: String,
        method: ConsentMethod,
        signature: String? = nil,
        consentedAt: Date = Date()
    ) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/client_decisions")
            .appending(queryItems: [URLQueryItem(name: "id", value: "eq.\(decisionId)")])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=minimal")
        var body: [String: String] = [
            "client_consent_method": method.rawValue,
            "client_consented_at": ISO8601DateFormatter().string(from: consentedAt),
        ]
        if let signature, !signature.isEmpty {
            body["client_signature"] = signature
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
    }

    /// Select an option and capture consent in one call. The selection is
    /// fed through `apply_decision`; consent is recorded as a follow-up
    /// PATCH so a transient consent failure can't leave the decision in a
    /// half-applied state without the designer ever seeing the choice.
    public func selectOption(
        decisionId: String,
        optionId: String,
        consent: ConsentMethod,
        signature: String? = nil
    ) async throws {
        try await applyDecision(decisionId: decisionId, optionId: optionId)
        try await recordConsent(decisionId: decisionId, method: consent, signature: signature)
    }
}
