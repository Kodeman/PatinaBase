//
//  RosterAPIClient.swift
//  Patina
//
//  The client's side of `designer_clients` (00014:72-90) — the roster row that
//  credits a direct order to the designer who brought the client in, even when
//  no lead or project is live.
//
//  ⚠ `designer_clients` has no client-side SELECT policy today: 00014:110 is
//  `FOR ALL USING (auth.uid() = designer_id)` and 00316:39 adds the studio
//  co-member leg — both designer-side. A client's select therefore comes back
//  empty rather than forbidden, so `.roster` is unreachable in production
//  until a policy migration lands. The read ships now so the attribution lane
//  has its seam; W1a carries no backend delta.
//

import Foundation
import Supabase

public struct RemoteDesignerClient: Codable, Sendable {
    public let designer_id: String
    public let created_at: String?
    public let status: String?
}

public actor RosterAPIClient {
    public static let shared = RosterAPIClient()

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared
    private let decoder = JSONDecoder()

    /// The active roster rows naming this client, newest first.
    func listRoster() async throws -> [RosterDesigner] {
        guard let userId = try? await SupabaseClientManager.shared.client
            .auth.session.user.id.uuidString.lowercased() else {
            throw RoomsAPIError.notAuthenticated
        }

        let url = baseURL.appendingPathComponent("/rest/v1/designer_clients")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "designer_id,created_at,status"),
                URLQueryItem(name: "client_id", value: "eq.\(userId)"),
                URLQueryItem(name: "status", value: "eq.active"),
                URLQueryItem(name: "order", value: "created_at.desc"),
            ])
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout
        if let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }

        return try decoder.decode([RemoteDesignerClient].self, from: data)
            .compactMap { row in
                guard let designerId = UUID(uuidString: row.designer_id) else { return nil }
                return RosterDesigner(
                    designerId: designerId,
                    addedAt: row.created_at.flatMap(Self.parseDate) ?? .distantPast
                )
            }
    }

    /// Tolerant ISO-8601 parse (fractional seconds first, then plain) —
    /// mirrors `DesignRequestStatusService.parseDate`.
    private static func parseDate(_ string: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: string) { return date }
        return ISO8601DateFormatter().date(from: string)
    }
}
