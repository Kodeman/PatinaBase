//
//  DesignerLeadService.swift
//  Patina
//
//  Thin client for POST /api/rooms/:id/designer-lead. Assembles the
//  package server-side; iOS just kicks the request and renders the
//  confirmation ("Sent to designers").
//

import Foundation
import Supabase

public actor DesignerLeadService {
    public static let shared = DesignerLeadService()

    public struct Request: Encodable {
        public let budget_range: String?
        public let timeline: String?
        public let project_type: String?
        public let project_description: String?
        public init(
            budgetRange: String? = nil,
            timeline: String? = nil,
            projectType: String? = nil,
            projectDescription: String? = nil
        ) {
            self.budget_range = budgetRange
            self.timeline = timeline
            self.project_type = projectType
            self.project_description = projectDescription
        }
    }

    public struct Response: Decodable {
        public struct Lead: Decodable {
            public let id: String
            public let status: String
        }
        public let lead: Lead
    }

    private let baseURL = APIConfiguration.clientPortalURL
    private let session = URLSession.shared

    private func authToken() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.accessToken
    }

    public func send(
        roomRemoteId: String,
        request: Request = Request()
    ) async throws -> Response {
        let url = baseURL.appendingPathComponent("/api/rooms/\(roomRemoteId)/designer-lead")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await authToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try JSONEncoder().encode(request)
        req.timeoutInterval = APIConfiguration.requestTimeout

        let (data, response) = try await session.data(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}
