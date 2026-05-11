//
//  DecisionsAPIClient.swift
//  Patina
//
//  Lists `client_decisions` + options and submits approval for the
//  authenticated user. RLS gates these to participants of the project
//  the decision belongs to.
//

import Foundation
import Supabase

public struct RemoteClientDecision: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String?
    public let title: String?
    public let description: String?
    public let status: String?
    public let decision_type: String?
    public let recommended_option_id: String?
    public let chosen_option_id: String?
    public let due_date: String?
    public let created_at: String
}

public struct RemoteDecisionOption: Codable, Sendable, Identifiable {
    public let id: String
    public let decision_id: String
    public let title: String?
    public let description: String?
    public let image_url: String?
    public let price_cents: Int?
    public let is_recommended: Bool?
    public let sort_order: Int?
}

public actor DecisionsAPIClient {
    public static let shared = DecisionsAPIClient()

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

    // MARK: - Decisions

    public func listPending(forUser userId: String? = nil) async throws -> [RemoteClientDecision] {
        var queryItems = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "status", value: "in.(pending,awaiting_client)"),
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
                URLQueryItem(name: "select", value: "*"),
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
                URLQueryItem(name: "select", value: "*"),
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

    /// Approve an option. Patches the decision row directly — RLS on
    /// `client_decisions` allows the client to set `chosen_option_id` +
    /// `status='approved'` on decisions they're tied to via project_id.
    public func approve(decisionId: String, optionId: String) async throws {
        let url = baseURL.appendingPathComponent("/rest/v1/client_decisions")
            .appending(queryItems: [URLQueryItem(name: "id", value: "eq.\(decisionId)")])
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        await applyHeaders(to: &request, prefer: "return=minimal")
        let body: [String: String] = [
            "chosen_option_id": optionId,
            "status": "approved",
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(status: http.statusCode, body: "")
        }
    }
}
