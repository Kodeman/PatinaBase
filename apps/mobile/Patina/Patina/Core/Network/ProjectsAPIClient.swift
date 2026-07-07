//
//  ProjectsAPIClient.swift
//  Patina
//
//  Reads projects/proposals/phases/milestones/FF&E rows from Supabase.
//  All access is governed by RLS — clients see only the rows they're tied
//  to via `projects.client_id`; designers see rows where they're the
//  `designer_id` or a team member. We never write from iOS.
//

import Foundation
import Supabase

// MARK: - DTOs

public struct RemoteProject: Codable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let status: String?
    public let client_id: String?
    public let designer_id: String?
    public let studio_id: String?
    public let total_amount_cents: Int?
    public let budget_cents: Int?
    public let design_fee_cents: Int?
    public let current_phase: String?
    public let start_date: String?
    public let target_end_date: String?
    public let client_visibility_tier: String?
    public let updated_at: String?
}

public struct RemoteProjectPhase: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String
    public let phase_key: String
    public let name: String?
    public let status: String?
    public let fee_cents: Int?
    public let start_date: String?
    public let end_date: String?
    public let sort_order: Int?
}

public struct RemotePaymentMilestone: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String
    public let title: String?
    public let amount_cents: Int?
    public let status: String?
    public let due_date: String?
    public let phase_id: String?
}

public struct RemoteFFEItem: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String
    public let name: String?
    public let status: String?
    public let line_total_cents: Int?
    public let category: String?
    public let qty: Int?
}

// MARK: - Client

public actor ProjectsAPIClient {
    public static let shared = ProjectsAPIClient()

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared
    private let decoder = JSONDecoder()

    private func authToken() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.accessToken
    }

    private func applyHeaders(to request: inout URLRequest) async {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout
        if let token = await authToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    private func get<T: Decodable>(path: String, queryItems: [URLQueryItem] = []) async throws -> T {
        let url = baseURL.appendingPathComponent("/rest/v1/\(path)")
            .appending(queryItems: queryItems)
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try decoder.decode(T.self, from: data)
    }

    // MARK: - Projects

    /// All projects the current user can see via RLS (designer or client).
    public func listProjects() async throws -> [RemoteProject] {
        try await get(path: "projects", queryItems: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "updated_at.desc"),
        ])
    }

    public func fetchProject(id: String) async throws -> RemoteProject? {
        let rows: [RemoteProject] = try await get(path: "projects", queryItems: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "id", value: "eq.\(id)"),
        ])
        return rows.first
    }

    public func listPhases(projectId: String) async throws -> [RemoteProjectPhase] {
        try await get(path: "project_phases", queryItems: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "project_id", value: "eq.\(projectId)"),
            URLQueryItem(name: "order", value: "sort_order.asc,start_date.asc"),
        ])
    }

    public func listMilestones(projectId: String) async throws -> [RemotePaymentMilestone] {
        try await get(path: "project_payment_milestones", queryItems: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "project_id", value: "eq.\(projectId)"),
            URLQueryItem(name: "order", value: "due_date.asc.nullslast"),
        ])
    }

    public func listFFEItems(projectId: String) async throws -> [RemoteFFEItem] {
        try await get(path: "project_ffe_items", queryItems: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "project_id", value: "eq.\(projectId)"),
            URLQueryItem(name: "order", value: "category.asc"),
        ])
    }
}
