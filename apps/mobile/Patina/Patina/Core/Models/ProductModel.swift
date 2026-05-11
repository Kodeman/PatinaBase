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

    // MARK: - CodingKeys (maps snake_case DB columns to camelCase Swift)

    enum CodingKeys: String, CodingKey {
        case id, name, badges, category, tier
        case priceCents = "price_cents"
        case matchScore = "match_score"
        case makerName = "maker_name"
        case makerLocation = "maker_location"
        case makerStory = "maker_story"
        case imageURL = "image_url"
        case usdzURL = "usdz_url"
        case styleTags = "style_tags"
        case materialTags = "material_tags"
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
        category = try container.decodeIfPresent(ProductCategory.self, forKey: .category) ?? .decor
        tier = try container.decodeIfPresent(ProductTier.self, forKey: .tier) ?? .styleMatch
    }

    // MARK: - Memberwise init (for mock data and internal use)

    init(id: String, name: String, priceCents: Int, matchScore: Int,
         makerName: String, makerLocation: String?, makerStory: String?,
         imageURL: String?, usdzURL: String?,
         styleTags: [String], materialTags: [String], badges: [String],
         category: ProductCategory, tier: ProductTier) {
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

    var fullFormattedPrice: String {
        let dollars = priceCents / 100
        return "$\(NumberFormatter.localizedString(from: NSNumber(value: dollars), number: .decimal))"
    }

    var matchLabel: String {
        "\(matchScore)% match"
    }

    var hasARModel: Bool {
        usdzURL != nil
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
