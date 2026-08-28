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
    public let bodyMarkdown: String?
    public let readMinutes: Int
    public let heroImageURL: String?
    public let heroGradientKey: String?
    public let makerName: String?
    public let makerLocation: String?
    public let makerAvatarURL: String?
    public let makerAvatarGradientKey: String?
    public let featuredProductID: String?
    public let publishedAt: String?

    private enum CodingKeys: String, CodingKey {
        case id, tag, title, subtitle
        case bodyMarkdown = "body_md"
        case readMinutes = "read_minutes"
        case heroImageURL = "hero_image_url"
        case heroGradientKey = "hero_gradient_key"
        case makerName = "maker_name"
        case makerLocation = "maker_location"
        case makerAvatarURL = "maker_avatar_url"
        case makerAvatarGradientKey = "maker_avatar_gradient_key"
        case featuredProductID = "featured_product_id"
        case publishedAt = "published_at"
    }
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
    /// Ordering: most recent `published_at`, then highest `sort_order`.
    public func fetchTodaysStory() async throws -> RemoteEditorialStory? {
        try await fetchCandidates(limit: 1).first
    }

    /// SP-18: the ordered shortlist the home picks from. `fetchTodaysStory`'s
    /// `limit=1` could only ever return the same single row — which is why the
    /// same card appeared on the guest home, the engaged home, in dark mode,
    /// and after every relaunch. The reader's own read record chooses from
    /// this list; the ordering is the fallback when they have opened all of
    /// them.
    ///
    /// B §2 reorders it to `published_at desc, sort_order desc`: with
    /// `sort_order` first, a newer story is buried by any older row carrying a
    /// higher sort order, which is the mechanism behind F46=F61 and F131 —
    /// one article nobody can reach twice.
    public func fetchCandidates(limit: Int = 5) async throws -> [RemoteEditorialStory] {
        let url = baseURL.appendingPathComponent("/rest/v1/editorial_stories")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "order", value: "published_at.desc,sort_order.desc"),
                URLQueryItem(name: "limit", value: String(limit))
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

    /// Fetch a list of recent published stories (e.g., for an "Inbox" view
    /// of editorial content).
    public func fetchRecent(limit: Int = 10) async throws -> [RemoteEditorialStory] {
        let url = baseURL.appendingPathComponent("/rest/v1/editorial_stories")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: "*"),
                URLQueryItem(name: "order", value: "published_at.desc"),
                URLQueryItem(name: "limit", value: String(limit))
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
    /// SP-18: `isUnread` comes from the reader's own `StoryReadStore` record —
    /// it used to be hard-coded `true`, so the dot never came off.
    init(from remote: RemoteEditorialStory, isUnread: Bool) {
        let hero = PatinaGradients.gradient(forKey: remote.heroGradientKey) ?? PatinaGradients.hero
        let avatar = PatinaGradients.gradient(forKey: remote.makerAvatarGradientKey) ?? PatinaGradients.earth
        self.init(
            id: remote.id,
            tag: remote.tag,
            title: remote.title,
            subtitle: remote.subtitle ?? "",
            readMinutes: remote.readMinutes,
            heroGradient: hero,
            heroImageURL: remote.heroImageURL.flatMap(URL.init(string:)),
            isUnread: isUnread,
            body: remote.bodyMarkdown ?? "",
            makerName: remote.makerName ?? "",
            makerLocation: remote.makerLocation ?? "",
            makerAvatarGradient: avatar,
            featuredProductID: remote.featuredProductID
        )
    }
}
