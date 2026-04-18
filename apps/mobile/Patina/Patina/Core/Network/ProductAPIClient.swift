//
//  ProductAPIClient.swift
//  Patina
//
//  API client for product recommendations and catalog
//  Calls Supabase PostgREST RPCs and direct table queries
//

import Foundation
import Supabase

actor ProductAPIClient {
    static let shared = ProductAPIClient()

    private let baseURL = APIConfiguration.apiURL
    private let session = URLSession.shared

    // MARK: - Auth Helper

    /// Get the current user's access token for authenticated requests
    private func authToken() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.accessToken
    }

    /// Apply standard headers (apikey + auth) to a request
    private func applyHeaders(to request: inout URLRequest) async {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout

        if let token = await authToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    // MARK: - Recommendations (via get_recommendations RPC)

    /// Fetch personalized recommendations for a room
    func fetchRecommendations(
        roomId: String? = nil,
        category: ProductCategory? = nil,
        limit: Int = 20,
        offset: Int = 0
    ) async throws -> RecommendationsResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/rpc/get_recommendations"))
        request.httpMethod = "POST"
        await applyHeaders(to: &request)

        // Build RPC params
        var params: [String: Any] = [
            "p_limit": limit,
            "p_offset": offset
        ]
        if let roomId { params["p_room_id"] = roomId }
        if let category { params["p_category"] = category.rawValue }

        request.httpBody = try JSONSerialization.data(withJSONObject: params)

        do {
            let (data, _) = try await session.data(for: request)
            let items = try JSONDecoder().decode([Product].self, from: data)
            return RecommendationsResponse(items: items, total: items.count, roomId: roomId, roomName: nil)
        } catch {
            // Fall back to mock data during development
            print("[ProductAPI] Recommendations failed, using mock: \(error.localizedDescription)")
            let items = Product.mockProducts
            let filtered = category != nil ? items.filter { $0.category == category } : items
            return RecommendationsResponse(items: filtered, total: filtered.count, roomId: roomId, roomName: nil)
        }
    }

    // MARK: - Single Product (PostgREST direct query)

    /// Fetch a single product by ID
    func fetchProduct(id: String) async throws -> Product {
        let urlString = "\(baseURL)/rest/v1/rpc/get_recommendations?p_limit=1"
        var request = URLRequest(url: URL(string: urlString)!)
        request.httpMethod = "POST"
        await applyHeaders(to: &request)

        // Use get_recommendations with a filter to get a single product with full data
        // Alternatively, query the products table directly
        let directURL = "\(baseURL)/rest/v1/products?id=eq.\(id)&select=*,vendors(name,made_in,brand_story)"
        var directRequest = URLRequest(url: URL(string: directURL)!)
        directRequest.httpMethod = "GET"
        await applyHeaders(to: &directRequest)

        do {
            let (data, _) = try await session.data(for: directRequest)
            // PostgREST returns an array; decode and map to Product
            let rawProducts = try JSONDecoder().decode([RawProductWithVendor].self, from: data)
            guard let raw = rawProducts.first else { throw ProductAPIError.notFound }
            return raw.toProduct()
        } catch {
            // Fall back to mock
            print("[ProductAPI] Product fetch failed, using mock: \(error.localizedDescription)")
            guard let product = Product.mockProducts.first(where: { $0.id == id }) else {
                throw ProductAPIError.notFound
            }
            return product
        }
    }

    // MARK: - Interactions

    /// Track a user interaction with a product
    func trackInteraction(_ event: InteractionEvent) async {
        do {
            var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/interactions"))
            request.httpMethod = "POST"
            await applyHeaders(to: &request)
            // PostgREST expects Prefer: return=minimal for fire-and-forget inserts
            request.setValue("return=minimal", forHTTPHeaderField: "Prefer")
            request.httpBody = try JSONEncoder().encode(event)

            _ = try await session.data(for: request)
        } catch {
            print("[ProductAPI] Failed to track interaction: \(error.localizedDescription)")
        }
    }

    // MARK: - Style Quiz

    /// Submit style quiz answers and get computed profile
    func processStyleQuiz(answers: QuizSubmission) async throws -> [String: Any]? {
        var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/rpc/process_style_quiz"))
        request.httpMethod = "POST"
        await applyHeaders(to: &request)

        let params: [String: Any] = [
            "quiz_answers": [
                "visual_resonance": answers.answers.visualResonance,
                "lifestyle": answers.answers.lifestyle,
                "material": answers.answers.material,
                "investment": answers.answers.investment,
                "catalyst": answers.answers.catalyst
            ],
            "timings": answers.timings
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: params)

        let (data, _) = try await session.data(for: request)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}

// MARK: - Raw Product Decoder (for PostgREST nested vendor join)

/// Intermediate decoder for products with nested vendor data from PostgREST
private struct RawProductWithVendor: Codable {
    let id: String
    let name: String
    let price_retail: Int?
    let quality_score: Int?
    let images: [String]?
    let materials: [String]?
    let style_tags: [String]?
    let tags: [String]?
    let category: String?
    let status: String?
    let vendors: VendorInfo?

    struct VendorInfo: Codable {
        let name: String?
        let made_in: String?
        let brand_story: String?  // JSONB — comes as String or object
    }

    func toProduct() -> Product {
        Product(
            id: id,
            name: name,
            priceCents: price_retail ?? 0,
            matchScore: quality_score ?? 50,
            makerName: vendors?.name ?? "Unknown",
            makerLocation: vendors?.made_in,
            makerStory: vendors?.brand_story,
            imageURL: images?.first,
            usdzURL: nil,
            styleTags: style_tags ?? [],
            materialTags: materials ?? [],
            badges: tags ?? [],
            category: ProductCategory(rawValue: category ?? "decor") ?? .decor,
            tier: (quality_score ?? 0) >= 80 ? .designerSelection : .styleMatch
        )
    }
}

// MARK: - Errors

enum ProductAPIError: Error {
    case notFound
    case networkError(Error)
    case decodingError(Error)
}
