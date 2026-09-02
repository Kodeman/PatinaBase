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

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            #if DEBUG
            PatinaLog.ui.debug("[ProductAPI] Recommendations HTTP \(http.statusCode): \(String(data: data, encoding: .utf8) ?? "")")
            #endif
            throw ProductAPIError.http(status: http.statusCode)
        }
        let items = ProductAPIClient.withholdingUnresolvedMakers(
            try ProductAPIClient.decodeProducts(from: data)
        )
        return RecommendationsResponse(items: items, total: items.count, roomId: roomId, roomName: nil)
    }

    /// SP-10: a piece whose maker cannot be resolved is withheld from the feed
    /// rather than shipped under the RPC's literal `Unknown Maker`
    /// (00246:278) — on a marketplace whose whole argument is provenance, an
    /// unattributed piece is not one to offer. Applies to the two feeds that
    /// read `get_recommendations` (the browse grid and the Daily Room's picks)
    /// and not to the direct single-piece fetch, so a piece opened by id or by
    /// link still renders.
    ///
    /// The maker resolves from `products.brand` first, so once 00533 returns
    /// that column a piece with a brand and no vendor is kept and prints its
    /// brand; before 00533 it is withheld, which is the plank's own preference
    /// over printing `Unknown Maker`.
    nonisolated static func withholdingUnresolvedMakers(_ products: [Product]) -> [Product] {
        let shown = products.filter(\.hasResolvableMaker)
        #if DEBUG
        let withheld = products.count - shown.count
        if withheld > 0 {
            PatinaLog.ui.debug("[ProductAPI] Withheld \(withheld) piece(s) with no resolvable maker")
        }
        #endif
        return shown
    }

    // MARK: - U39: release-gating decode

    /// The only decode path for `get_recommendations` rows. A single
    /// malformed row (missing a required field, wrong type, …) must never
    /// blank the entire marketplace — it drops that row and keeps the rest.
    nonisolated static func decodeProducts(from data: Data) throws -> [Product] {
        let wrapped = try JSONDecoder().decode([FailableDecodable<Product>].self, from: data)
        let products = wrapped.compactMap(\.value)
        #if DEBUG
        let droppedCount = wrapped.count - products.count
        if droppedCount > 0 {
            PatinaLog.ui.debug("[ProductAPI] Dropped \(droppedCount) malformed product row(s)")
        }
        #endif
        return products
    }

    // MARK: - Single Product (PostgREST direct query)

    /// The `products` columns `RawProductWithVendor` decodes, named one by
    /// one. Kept beside the struct it mirrors, and pinned by
    /// `ProductSelectShapeTests` so it cannot drift back to `*`.
    ///
    /// A3-18: this used to be `*`. `products` carries two 768-dimension
    /// vectors — `embedding` and `aesthete_vector` — that nothing on the
    /// phone decodes, and they are 90% of the row: one measured row is
    /// 20,706 bytes, of which 9,459 is `embedding` and 9,462 is
    /// `aesthete_vector`. Every saved piece and every piece opened paid for
    /// them, before an image had started loading.
    static let productColumns = [
        "id", "name", "price_retail", "quality_score", "images", "materials",
        "style_tags", "tags", "category", "status", "dimensions",
        "lead_time_weeks", "brand", "description", "finish", "patina_managed",
        "source_url", "published_at", "photo_verified_at",
        "shipping_flat_cents", "deleted_at"
    ]

    /// PostgREST `select` for the single-product direct fetch.
    ///
    /// `products` carries two foreign keys to `vendors` — `vendor_id`
    /// (00001_initial_schema.sql:39) and `retailer_id`
    /// (00011_add_retailer_id.sql:6) — so a bare `vendors(...)` embed is
    /// ambiguous and PostgREST answers PGRST201 instead of the row. The
    /// constraint name disambiguates it.
    static let productSelect = productColumns.joined(separator: ",")
        + ",vendors!products_vendor_id_fkey(name,made_in,brand_story)"

    /// Fetch a single product by ID
    func fetchProduct(id: String) async throws -> Product {
        let urlString = "\(baseURL)/rest/v1/rpc/get_recommendations?p_limit=1"
        var request = URLRequest(url: URL(string: urlString)!)
        request.httpMethod = "POST"
        await applyHeaders(to: &request)

        // Use get_recommendations with a filter to get a single product with full data
        // Alternatively, query the products table directly
        let directURL = "\(baseURL)/rest/v1/products?id=eq.\(id)&select=\(Self.productSelect)"
        var directRequest = URLRequest(url: URL(string: directURL)!)
        directRequest.httpMethod = "GET"
        await applyHeaders(to: &directRequest)

        let (data, response) = try await session.data(for: directRequest)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            #if DEBUG
            PatinaLog.ui.debug("[ProductAPI] Product fetch HTTP \(http.statusCode): \(String(data: data, encoding: .utf8) ?? "")")
            #endif
            throw ProductAPIError.http(status: http.statusCode)
        }
        // PostgREST returns an array; decode and map to Product.
        // C7-17: element-wise, exactly as `decodeProducts` already does — a
        // single malformed column must read as "we couldn't show this piece",
        // never as a decode that takes the whole response with it.
        let rawProducts = try JSONDecoder()
            .decode([FailableDecodable<RawProductWithVendor>].self, from: data)
            .compactMap(\.value)
        guard let raw = rawProducts.first else { throw ProductAPIError.notFound }
        return raw.toProduct()
    }

    /// The saved pieces' products, fetched **by id, withdrawn ones included**.
    ///
    /// The Record's "no longer available" row is composed over
    /// `products.deleted_at`, and `get_recommendations` filters a withdrawn
    /// row out by construction — so the row can only ever be fed by a direct
    /// table read that does not filter on `deleted_at` either. This is that
    /// read, and it is the record's only caller.
    func fetchProducts(ids: [String]) async throws -> [Product] {
        guard !ids.isEmpty else { return [] }
        let url = baseURL.appendingPathComponent("/rest/v1/products")
            .appending(queryItems: [
                URLQueryItem(name: "id", value: "in.(\(ids.joined(separator: ",")))"),
                URLQueryItem(name: "select", value: Self.productSelect)
            ])
        var request = URLRequest(url: url)
        await applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw ProductAPIError.http(status: http.statusCode)
        }
        // C7-17: one malformed row used to throw and take the whole saved
        // list with it — which the client reads as their saved pieces being
        // gone, not as one piece we could not draw.
        let wrapped = try JSONDecoder()
            .decode([FailableDecodable<RawProductWithVendor>].self, from: data)
        #if DEBUG
        let dropped = wrapped.count - wrapped.compactMap(\.value).count
        if dropped > 0 {
            PatinaLog.ui.debug("[ProductAPI] Dropped \(dropped) malformed saved-piece row(s)")
        }
        #endif
        return wrapped.compactMap(\.value).map { $0.toProduct() }
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
            PatinaLog.ui.error("[ProductAPI] Failed to track interaction: \(error.localizedDescription)")
        }
    }

    // MARK: - Style Quiz

    /// Submit style quiz answers and get computed profile
    func processStyleQuiz(answers: QuizSubmission) async throws -> [String: Any]? {
        var request = URLRequest(url: baseURL.appendingPathComponent("/rest/v1/rpc/process_style_quiz"))
        request.httpMethod = "POST"
        await applyHeaders(to: &request)
        // C1-04: the quiz's own budget, not the app-wide 30 s. The locally
        // computed profile is already the fallback, so waiting longer than
        // this buys the person nothing and costs them the fifth question
        // sitting under their finger.
        request.timeoutInterval = APIConfiguration.quizTimeout

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
private struct RawProductWithVendor: Decodable {
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
    // SP-10: the direct fetch already selects `*`, so these `products`
    // columns are readable on this path today — they do not wait on 00533,
    // which only widens the RPC's projection.
    let dimensions: FailableDecodable<ProductDimensions>?
    let lead_time_weeks: Int?
    let brand: String?
    let description: String?
    let finish: String?
    let patina_managed: Bool?
    let source_url: String?
    let published_at: String?
    let photo_verified_at: String?
    let shipping_flat_cents: Int?
    let deleted_at: String?

    struct VendorInfo: Decodable {
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
            // U39: was `ProductCategory(rawValue:)`, which silently fell
            // back to `.decor` for anything not matching the enum's raw
            // values verbatim — e.g. "chair" never matched `.seating`.
            category: ProductCategory(normalizing: category),
            tier: (quality_score ?? 0) >= 80 ? .designerSelection : .styleMatch,
            dimensions: dimensions?.value,
            leadTimeWeeks: lead_time_weeks,
            brand: brand,
            productDescription: description,
            publishedAt: Self.timestamp(published_at),
            finish: finish,
            patinaManaged: patina_managed,
            photoVerifiedAt: Self.timestamp(photo_verified_at),
            sourceURL: source_url,
            shippingFlatCents: shipping_flat_cents,
            deletedAt: Self.timestamp(deleted_at)
        )
    }

    private static func timestamp(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = withFraction.date(from: raw) { return parsed }
        return ISO8601DateFormatter().date(from: raw)
    }
}

// MARK: - Failable element decoding (U39)

/// Decodes one array element permissively: on failure the element decodes
/// to `nil` instead of aborting the whole array decode. Used to keep one
/// malformed `get_recommendations` row from blanking the entire response.
struct FailableDecodable<Wrapped: Decodable>: Decodable {
    let value: Wrapped?

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        value = try? container.decode(Wrapped.self)
    }
}

// MARK: - Errors

enum ProductAPIError: Error {
    case notFound
    case networkError(Error)
    case decodingError(Error)
    case http(status: Int)
}
