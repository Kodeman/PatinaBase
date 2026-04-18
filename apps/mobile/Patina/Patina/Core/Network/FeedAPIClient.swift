//
//  FeedAPIClient.swift
//  Patina
//
//  Thin client for the room-aware Daily Room feed. Calls the
//  Next.js route at `{clientPortalURL}/api/feed/:roomId` which
//  joins the nightly aesthete-engine cache with `products` and
//  `spatial_context`, so the iOS client gets ranked products +
//  "why it fits" copy in a single request.
//

import Foundation
import Supabase

public struct FeedProduct: Codable, Sendable {
    public let id: String
    public let name: String
    public let price_retail: Double?
    public let images: [String]?
    public let dimensions: [String: AnyCodable]?
    public let vendor_id: String?
    public let spatial_context: [String: String]?
}

public struct FeedResponse: Codable, Sendable {
    public struct Room: Codable, Sendable {
        public let id: String
        public let name: String
        public let type: String?
        public let dimensions: [String: AnyCodable]?
    }
    public let room: Room
    public let products: [FeedProduct]
    public let new_count: Int?
    public let total: Int?
    public let cache_generated_at: String?
}

public actor FeedAPIClient {
    public static let shared = FeedAPIClient()

    private let baseURL = APIConfiguration.clientPortalURL
    private let session = URLSession.shared
    private let decoder = JSONDecoder()

    private func authToken() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.accessToken
    }

    public func fetchFeed(
        roomId: String,
        limit: Int = 20,
        offset: Int = 0
    ) async throws -> FeedResponse {
        var comps = URLComponents(
            url: baseURL.appendingPathComponent("/api/feed/\(roomId)"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
        ]

        var request = URLRequest(url: comps.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await authToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.timeoutInterval = APIConfiguration.requestTimeout

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try decoder.decode(FeedResponse.self, from: data)
    }
}
