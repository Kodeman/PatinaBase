//
//  EditorialStoriesAPIClient.swift
//  Patina
//
//  Reads `editorial_stories` from Supabase PostgREST. The rows are
//  RLS-protected: anyone (anon or authenticated) can SELECT published rows
//  (published_at <= now() and not expired). Drafts and scheduled rows are
//  admin-only.
//
//  Used by `DailyRoomViewModel` to populate the top "today's story" card
//  on the home feed.
//

import Foundation
import Supabase

/// Raw decoder for the `editorial_stories` Postgres rows.
public struct RemoteEditorialStory: Codable, Sendable {
    public let id: String
    public let tag: String
    public let title: String
    public let subtitle: String?
    public let body_md: String?
    public let read_minutes: Int
    public let hero_image_url: String?
    public let hero_gradient_key: String?
    public let maker_name: String?
    public let maker_location: String?
    public let maker_avatar_url: String?
    public let maker_avatar_gradient_key: String?
    public let featured_product_id: String?
    public let published_at: String?
}

public actor EditorialStoriesAPIClient {
    public static let shared = EditorialStoriesAPIClient()

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

    /// Fetch the most recent published editorial story for the home feed.
    /// Ordering: highest `sort_order`, then most recent `published_at`.
    public func fetchTodaysStory() async throws -> RemoteEditorialStory? {
        let url = baseURL.appendingPathComponent("/rest/v1/editorial_stories")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "order", value: "sort_order.desc,published_at.desc"),
                URLQueryItem(name: "limit", value: "1"),
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
        let rows = try decoder.decode([RemoteEditorialStory].self, from: data)
        return rows.first
    }

    /// Fetch a list of recent published stories (e.g., for an "Inbox" view
    /// of editorial content).
    public func fetchRecent(limit: Int = 10) async throws -> [RemoteEditorialStory] {
        let url = baseURL.appendingPathComponent("/rest/v1/editorial_stories")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "order", value: "published_at.desc"),
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
        return try decoder.decode([RemoteEditorialStory].self, from: data)
    }
}

// MARK: - Mapping to UI model

extension DailyStory {
    /// Build a `DailyStory` from a remote `editorial_stories` row. Falls back
    /// to sensible gradients when the editorial row didn't pin one.
    init(from remote: RemoteEditorialStory, isUnread: Bool = true) {
        let hero = PatinaGradients.gradient(forKey: remote.hero_gradient_key) ?? PatinaGradients.hero
        let avatar = PatinaGradients.gradient(forKey: remote.maker_avatar_gradient_key) ?? PatinaGradients.earth
        self.init(
            id: remote.id,
            tag: remote.tag,
            title: remote.title,
            subtitle: remote.subtitle ?? "",
            readMinutes: remote.read_minutes,
            heroGradient: hero,
            isUnread: isUnread,
            body: remote.body_md ?? "",
            makerName: remote.maker_name ?? "",
            makerLocation: remote.maker_location ?? "",
            makerAvatarGradient: avatar,
            featuredProductID: remote.featured_product_id
        )
    }
}
