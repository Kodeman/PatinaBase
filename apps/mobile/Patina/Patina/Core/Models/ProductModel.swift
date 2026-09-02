//
//  ProductModel.swift
//  Patina
//
//  Product model for recommendations and catalog browsing
//

import SwiftUI

// MARK: - Product

struct Product: Identifiable, Hashable, Codable {
    let id: String
    let name: String
    let priceCents: Int
    let matchScore: Int
    let makerName: String
    let makerLocation: String?
    let makerStory: String?
    let imageURL: String?
    let usdzURL: String?
    let styleTags: [String]
    let materialTags: [String]
    let badges: [String]
    let category: ProductCategory
    let tier: ProductTier

    // MARK: - Spec columns (SP-10 / 00533)
    //
    // Every one of these is optional and every one of them is omitted from
    // the screen when it is nil. 00533 is not in every database this app
    // talks to, and a piece that does not know its own size must say
    // nothing rather than print a placeholder.

    let dimensions: ProductDimensions?
    let leadTimeWeeks: Int?
    let brand: String?
    /// `products.description` — `description` itself is taken by
    /// `CustomStringConvertible` on every Swift type.
    let productDescription: String?
    let publishedAt: Date?
    let finish: String?
    let patinaManaged: Bool?
    let photoVerifiedAt: Date?
    let sourceURL: String?
    let shippingFlatCents: Int?
    /// `products.deleted_at` — set when the catalogue withdraws a piece. The
    /// Record's "no longer available" row is the only reader; the
    /// recommendation RPC never returns a withdrawn row, so this arrives only
    /// on the by-id fetch, whose `select=*` already carries it.
    let deletedAt: Date?

    // MARK: - CodingKeys (maps snake_case DB columns to camelCase Swift)

    enum CodingKeys: String, CodingKey {
        case id, name, badges, category, tier, brand, finish, dimensions
        case priceCents = "price_cents"
        case matchScore = "match_score"
        case makerName = "maker_name"
        case makerLocation = "maker_location"
        case makerStory = "maker_story"
        case imageURL = "image_url"
        case usdzURL = "usdz_url"
        case styleTags = "style_tags"
        case materialTags = "material_tags"
        case leadTimeWeeks = "lead_time_weeks"
        case productDescription = "description"
        case publishedAt = "published_at"
        case patinaManaged = "patina_managed"
        case photoVerifiedAt = "photo_verified_at"
        case sourceURL = "source_url"
        case shippingFlatCents = "shipping_flat_cents"
        case deletedAt = "deleted_at"
    }

    // MARK: - Decodable (with defaults for optional fields)

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        priceCents = try container.decodeIfPresent(Int.self, forKey: .priceCents) ?? 0
        matchScore = try container.decodeIfPresent(Int.self, forKey: .matchScore) ?? 0
        makerName = try container.decodeIfPresent(String.self, forKey: .makerName) ?? "Unknown"
        makerLocation = try container.decodeIfPresent(String.self, forKey: .makerLocation)
        makerStory = try container.decodeIfPresent(String.self, forKey: .makerStory)
        imageURL = try container.decodeIfPresent(String.self, forKey: .imageURL)
        usdzURL = try container.decodeIfPresent(String.self, forKey: .usdzURL)
        styleTags = try container.decodeIfPresent([String].self, forKey: .styleTags) ?? []
        materialTags = try container.decodeIfPresent([String].self, forKey: .materialTags) ?? []
        badges = try container.decodeIfPresent([String].self, forKey: .badges) ?? []
        // U39: category/tier decode as plain strings and normalize — the DB
        // vocabulary drifts from the Swift enum's raw values ("chair" vs
        // "seating") and an unrecognized value must never fail the whole
        // row, let alone the whole payload.
        category = ProductCategory(normalizing: try container.decodeIfPresent(String.self, forKey: .category))
        let tierRaw = try container.decodeIfPresent(String.self, forKey: .tier)
        tier = tierRaw.flatMap(ProductTier.init(rawValue:)) ?? .styleMatch

        // A row whose `dimensions` jsonb is shaped differently must not take
        // the whole product down with it — the piece simply has no size.
        dimensions = try? container.decodeIfPresent(ProductDimensions.self, forKey: .dimensions)
        leadTimeWeeks = try? container.decodeIfPresent(Int.self, forKey: .leadTimeWeeks)
        brand = Product.nonEmpty(try container.decodeIfPresent(String.self, forKey: .brand))
        productDescription = Product.nonEmpty(
            try container.decodeIfPresent(String.self, forKey: .productDescription)
        )
        publishedAt = Product.timestamp(
            try container.decodeIfPresent(String.self, forKey: .publishedAt)
        )
        finish = Product.nonEmpty(try container.decodeIfPresent(String.self, forKey: .finish))
        patinaManaged = try container.decodeIfPresent(Bool.self, forKey: .patinaManaged)
        photoVerifiedAt = Product.timestamp(
            try container.decodeIfPresent(String.self, forKey: .photoVerifiedAt)
        )
        sourceURL = Product.nonEmpty(try container.decodeIfPresent(String.self, forKey: .sourceURL))
        shippingFlatCents = try container.decodeIfPresent(Int.self, forKey: .shippingFlatCents)
        deletedAt = Product.timestamp(
            try container.decodeIfPresent(String.self, forKey: .deletedAt)
        )
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }

    /// Postgres `timestamptz` reaches the client with or without fractional
    /// seconds depending on the column and the driver — accept both.
    private static func timestamp(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = withFraction.date(from: raw) { return parsed }
        return ISO8601DateFormatter().date(from: raw)
    }

    // MARK: - Memberwise init (for mock data and internal use)

    init(id: String, name: String, priceCents: Int, matchScore: Int,
         makerName: String, makerLocation: String?, makerStory: String?,
         imageURL: String?, usdzURL: String?,
         styleTags: [String], materialTags: [String], badges: [String],
         category: ProductCategory, tier: ProductTier,
         dimensions: ProductDimensions? = nil, leadTimeWeeks: Int? = nil,
         brand: String? = nil, productDescription: String? = nil,
         publishedAt: Date? = nil, finish: String? = nil,
         patinaManaged: Bool? = nil, photoVerifiedAt: Date? = nil,
         sourceURL: String? = nil, shippingFlatCents: Int? = nil,
         deletedAt: Date? = nil) {
        self.deletedAt = deletedAt
        self.dimensions = dimensions
        self.leadTimeWeeks = leadTimeWeeks
        self.brand = brand
        self.productDescription = productDescription
        self.publishedAt = publishedAt
        self.finish = finish
        self.patinaManaged = patinaManaged
        self.photoVerifiedAt = photoVerifiedAt
        self.sourceURL = sourceURL
        self.shippingFlatCents = shippingFlatCents
        self.id = id
        self.name = name
        self.priceCents = priceCents
        self.matchScore = matchScore
        self.makerName = makerName
        self.makerLocation = makerLocation
        self.makerStory = makerStory
        self.imageURL = imageURL
        self.usdzURL = usdzURL
        self.styleTags = styleTags
        self.materialTags = materialTags
        self.badges = badges
        self.category = category
        self.tier = tier
    }

    // MARK: - Computed

    var formattedPrice: String {
        let dollars = priceCents / 100
        if dollars >= 1000 {
            return "$\(String(format: "%.1f", Double(dollars) / 1000))K"
        }
        return "$\(dollars)"
    }

    /// SP-14: the app's one currency formatter.
    var fullFormattedPrice: String {
        PatinaCurrency.formatWholeDollars(cents: priceCents)
    }

    /// A-34: after a five-question quiz every recommendation stamped 40–46%,
    /// which a person reads as the quiz having failed — the app asked five
    /// questions, promised to show them their home, then scored its own
    /// answer at four out of ten. The number was never a percentage anybody
    /// could act on; it is a rank. So the card says where the piece sits, not
    /// a figure that invites arithmetic.
    ///
    /// `0` is "we have no score for this piece", not "a bad match": the
    /// decoder's default, and what `MatchScoreResolver` hands back for a
    /// piece opened by id in a session that never scored it (C-11).
    var matchLabel: String {
        switch matchScore {
        case 70...: return "Strong match"
        case 50..<70: return "Good match"
        case 1..<50: return "Worth a look"
        default: return "Not scored yet"
        }
    }

    /// Whether `matchLabel` is describing a score the app actually has.
    var hasMatchScore: Bool { matchScore > 0 }

    var hasARModel: Bool {
        usdzURL != nil
    }

    // MARK: - SP-10 spec lines

    /// `38″ W × 20″ D × 30″ H` — only the axes the row actually carries.
    /// `nil` when the piece has no dimensions at all, so the row is omitted
    /// rather than printed empty.
    var dimensionsLine: String? {
        dimensions?.displayLine
    }

    /// `Ships in 8 weeks`. `nil` when the column is null — the app never
    /// guesses a lead time.
    var leadTimeLine: String? {
        guard let leadTimeWeeks, leadTimeWeeks > 0 else { return nil }
        return "Ships in \(leadTimeWeeks) week\(leadTimeWeeks == 1 ? "" : "s")"
    }

    /// The maker, sourced from `products.brand` with the vendor name as the
    /// fallback. `get_recommendations` prints the literal `Unknown Maker`
    /// where no vendor resolves (00246:278) and the direct fetch prints
    /// `Unknown` — neither is a maker, and neither is shown as one.
    var resolvedMakerName: String? {
        if let brand { return brand }
        let vendor = makerName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !vendor.isEmpty,
              vendor.caseInsensitiveCompare("Unknown Maker") != .orderedSame,
              vendor.caseInsensitiveCompare("Unknown") != .orderedSame else { return nil }
        return vendor
    }

    var hasResolvableMaker: Bool {
        resolvedMakerName != nil
    }

    /// Gradient fill for placeholder image
    var placeholderGradient: LinearGradient {
        switch category {
        case .seating: return PatinaGradients.leather
        case .tables: return PatinaGradients.wood
        case .lighting: return PatinaGradients.metal
        case .storage: return PatinaGradients.rattan
        case .decor: return PatinaGradients.linen
        case .textiles: return PatinaGradients.warm
        }
    }
}

// MARK: - Product Dimensions (SP-10)

/// `products.dimensions` jsonb — `{width, height, depth, unit}` since
/// 00001_initial_schema.sql:35. Every axis is optional: rows in the wild
/// carry two of the three as often as all three.
struct ProductDimensions: Hashable, Codable {
    let width: Double?
    let height: Double?
    let depth: Double?
    let unit: String?

    /// `38″ W × 20″ D × 30″ H`, in the row's stated order, omitting any axis
    /// the row does not carry. `nil` when it carries none.
    var displayLine: String? {
        let parts: [String] = [
            width.map { "\(Self.number($0))\(suffix) W" },
            depth.map { "\(Self.number($0))\(suffix) D" },
            height.map { "\(Self.number($0))\(suffix) H" }
        ].compactMap { $0 }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: " \u{00D7} ")
    }

    /// Inches take the double-prime mark with no space; every other unit is
    /// printed as the row spells it.
    private var suffix: String {
        switch unit?.lowercased() {
        case "in", "inch", "inches", nil: return "\u{2033}"
        case let other?: return " \(other)"
        }
    }

    private static func number(_ value: Double) -> String {
        value.rounded() == value
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}

// MARK: - Product Category

enum ProductCategory: String, Codable, CaseIterable {
    case seating
    case tables
    case lighting
    case storage
    case decor
    case textiles

    var displayName: String {
        rawValue.capitalized
    }
}

extension ProductCategory {
    /// U39: normalizes raw DB category vocabulary (which doesn't match this
    /// enum's raw values 1:1 — e.g. "chair"/"sofa" both mean `.seating`)
    /// into a case. Unknown vocabulary, nil, and decoding noise all land on
    /// `.decor` rather than failing the row.
    init(normalizing raw: String?) {
        switch raw?.lowercased() {
        case "seating", "chair", "sofa": self = .seating
        case "tables", "table": self = .tables
        case "lighting": self = .lighting
        case "storage": self = .storage
        case "textiles": self = .textiles
        default: self = .decor
        }
    }
}

// MARK: - Product Tier

enum ProductTier: String, Codable {
    case designerSelection = "designer_selection"
    case styleMatch = "style_match"
    case newArrival = "new_arrival"
}

// MARK: - Recommendations Response

struct RecommendationsResponse: Codable {
    let items: [Product]
    let total: Int
    let roomId: String?
    let roomName: String?
}

// MARK: - Interaction Event

struct InteractionEvent: Codable {
    let productId: String
    let eventType: InteractionType
    let metadata: [String: String]?

    enum CodingKeys: String, CodingKey {
        case productId = "product_id"
        case eventType = "event_type"
        case metadata
    }

    enum InteractionType: String, Codable {
        case view
        case save
        case skip
        case arPlace = "ar_place"
        case dwell
        case share
    }
}

// MARK: - Preview Data
//
// `previewProducts` is intentionally `#if DEBUG`-gated and only used by
// SwiftUI `#Preview` blocks. Runtime code paths must never reach for this
// — every product surfaced to a real user comes from the Supabase backend
// via `ProductAPIClient`.

#if DEBUG
extension Product {
    static let previewProducts: [Product] = [
        Product(id: "p1", name: "Walnut Lounge Chair", priceCents: 285000, matchScore: 92,
                makerName: "Chilton Furniture", makerLocation: "Freeport, ME",
                makerStory: "Each chair starts as a conversation with the wood. Walnut tells you where it wants to bend.",
                imageURL: nil, usdzURL: nil,
                styleTags: ["warm_minimal", "mid_century"], materialTags: ["walnut", "leather"],
                badges: ["handcrafted", "made_in_usa", "fsc_certified"],
                category: .seating, tier: .designerSelection),
        Product(id: "p2", name: "Linen Sectional Sofa", priceCents: 320000, matchScore: 88,
                makerName: "Shoppe Amber", makerLocation: "Portland, OR",
                makerStory: "We believe furniture should feel like coming home.",
                imageURL: nil, usdzURL: nil,
                styleTags: ["warm_minimal", "scandinavian"], materialTags: ["linen", "oak"],
                badges: ["handcrafted", "sustainable"],
                category: .seating, tier: .styleMatch),
        Product(id: "p3", name: "Cherry Coffee Table", priceCents: 189000, matchScore: 85,
                makerName: "Thos. Moser", makerLocation: "Auburn, ME",
                makerStory: "Fine woodworking since 1972.",
                imageURL: nil, usdzURL: nil,
                styleTags: ["classic_comfort", "shaker"], materialTags: ["cherry"],
                badges: ["handcrafted", "made_in_usa"],
                category: .tables, tier: .designerSelection),
        Product(id: "p4", name: "Woven Floor Lamp", priceCents: 47500, matchScore: 82,
                makerName: "Lostine", makerLocation: "Philadelphia, PA",
                makerStory: nil, imageURL: nil, usdzURL: nil,
                styleTags: ["eclectic_curated"], materialTags: ["rattan", "brass"],
                badges: ["sustainable"],
                category: .lighting, tier: .styleMatch),
        Product(id: "p5", name: "Marble Side Table", priceCents: 120000, matchScore: 79,
                makerName: "Blu Dot", makerLocation: "Minneapolis, MN",
                makerStory: nil, imageURL: nil, usdzURL: nil,
                styleTags: ["cool_modern"], materialTags: ["marble", "steel"],
                badges: ["made_in_usa"],
                category: .tables, tier: .newArrival),
        Product(id: "p6", name: "Brass Pendant Light", priceCents: 55000, matchScore: 76,
                makerName: "Schoolhouse", makerLocation: "Portland, OR",
                makerStory: "Lighting made to last generations.",
                imageURL: nil, usdzURL: nil,
                styleTags: ["warm_minimal", "industrial"], materialTags: ["brass", "glass"],
                badges: ["handcrafted", "made_in_usa"],
                category: .lighting, tier: .styleMatch),
    ]
}
#endif
