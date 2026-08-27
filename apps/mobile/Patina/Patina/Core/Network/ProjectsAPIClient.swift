//
//  ProjectsAPIClient.swift
//  Patina
//
//  Reads projects/proposals/phases/milestones and client-safe FF&E projections
//  from Supabase. FF&E never reads project_ffe_items directly: published
//  selections and review editions are server-curated RPC snapshots.
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
    /// Embedded `profiles!projects_designer_id_fkey` — the designer the
    /// Record's rows and the designer seat name. Nil where the project has no
    /// designer, or on any decode that predates the embed.
    public let designer: RemoteDesignerRef?

    public var designerDisplayName: String {
        designer?.displayName ?? "your designer"
    }

    public var designerStudioName: String? {
        designer?.studioName
    }

    /// Explicit, with `designer` defaulted, so adding the embed did not force
    /// an edit on every existing construction site.
    public init( // swiftlint:disable:this function_parameter_count
        id: String, name: String, status: String?, client_id: String?,
        designer_id: String?, studio_id: String?, total_amount_cents: Int?,
        budget_cents: Int?, design_fee_cents: Int?, current_phase: String?,
        start_date: String?, target_end_date: String?,
        client_visibility_tier: String?, updated_at: String?,
        designer: RemoteDesignerRef? = nil
    ) {
        self.id = id
        self.name = name
        self.status = status
        self.client_id = client_id
        self.designer_id = designer_id
        self.studio_id = studio_id
        self.total_amount_cents = total_amount_cents
        self.budget_cents = budget_cents
        self.design_fee_cents = design_fee_cents
        self.current_phase = current_phase
        self.start_date = start_date
        self.target_end_date = target_end_date
        self.client_visibility_tier = client_visibility_tier
        self.updated_at = updated_at
        self.designer = designer
    }
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
    public let name: String?
    public let logisticsStatus: String?
    public let client_line_total_cents: Int?
    public let room_name: String?

    enum CodingKeys: String, CodingKey {
        case id, name, logisticsStatus
        case client_line_total_cents = "clientLineTotalCents"
        case room_name = "roomName"
    }
}
public struct RemoteClientSelectionsBundle: Codable, Sendable {
    public let selections: [RemoteFFEItem]
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
    /// `*` plus the designer, so the Record can say who acted without a second
    /// round-trip. `projects.designer_id` really does reference
    /// `public.profiles` (`projects_designer_id_fkey`), so the embed resolves;
    /// naming the constraint keeps it unambiguous.
    static let projectSelect =
        "*,designer:profiles!projects_designer_id_fkey(" + RemoteDesignerRef.selectColumns + ")"

    public func listProjects() async throws -> [RemoteProject] {
        try await projects(matching: [URLQueryItem(name: "order", value: "updated_at.desc")])
    }

    public func fetchProject(id: String) async throws -> RemoteProject? {
        try await projects(matching: [URLQueryItem(name: "id", value: "eq.\(id)")]).first
    }

    /// One read, twice if it has to be: with the designer embed, then — only
    /// on a 400, which is PostgREST refusing the relationship (a renamed
    /// constraint, a lagging schema cache) — with the bare `select=*` this
    /// query sent before. Losing the designer's name costs a caption; losing
    /// this list costs the Studio hub, the badge counts and the engagement
    /// tier together.
    private func projects(matching filters: [URLQueryItem]) async throws -> [RemoteProject] {
        do {
            return try await get(path: "projects", queryItems:
                [URLQueryItem(name: "select", value: Self.projectSelect)] + filters)
        } catch RoomsAPIError.http(let status, let body) where status == 400 {
            PatinaLog.sync.error(
                "[Projects] designer embed refused (400): \(body). Retrying without it."
            )
            return try await get(path: "projects", queryItems:
                [URLQueryItem(name: "select", value: "*")] + filters)
        }
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

    private struct ClientProjectParams: Encodable {
        let p_project_id: String
    }

    /// Curated selection projection. This intentionally replaces the raw
    /// project_ffe_items REST query so older builds fail closed after RLS
    /// lockdown rather than retaining access to studio working rows.
    public func listFFEItems(projectId: String) async throws -> [RemoteFFEItem] {
        let bundle: RemoteClientSelectionsBundle = try await SupabaseClientManager.shared.client
            .rpc("get_client_project_selections", params: ClientProjectParams(p_project_id: projectId))
            .execute()
            .value
        return bundle.selections
    }

}
