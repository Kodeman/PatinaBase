//
//  SavedItem.swift
//  Patina
//
//  A product that has been placed into a user's room. The local half of the
//  product ↔ room relationship used by the Room System spec (gallery stats,
//  room detail item list, cross-room view, and budget bar).
//

import Foundation
import SwiftData
import SwiftUI

@Model
public final class SavedItem {

    // MARK: - Identity

    @Attribute(.unique) public var id: UUID

    /// External product id (matches DailyRecommendation / Product.id).
    public var productId: String

    // MARK: - Display

    public var productName: String
    public var makerName: String

    /// Price in cents — avoids floating-point drift in budget math.
    public var priceCents: Int

    /// 0..100 match score from the Aesthete Engine (frozen at save time).
    public var matchScore: Int

    /// Whether the product has an AR-ready model.
    public var hasAR: Bool

    /// Stable key for rehydrating the placeholder gradient used in thumbnails
    /// (e.g. "walnut", "linen", "rattan"). Maps back to `Product.placeholderGradient`.
    public var thumbGradientKey: String

    // MARK: - Timestamps

    public var addedAt: Date

    // MARK: - Relationship

    public var room: RoomModel?

    // MARK: - Init

    public init(
        id: UUID = UUID(),
        productId: String,
        productName: String,
        makerName: String,
        priceCents: Int,
        matchScore: Int,
        hasAR: Bool,
        thumbGradientKey: String,
        room: RoomModel? = nil,
        addedAt: Date = Date()
    ) {
        self.id = id
        self.productId = productId
        self.productName = productName
        self.makerName = makerName
        self.priceCents = priceCents
        self.matchScore = matchScore
        self.hasAR = hasAR
        self.thumbGradientKey = thumbGradientKey
        self.room = room
        self.addedAt = addedAt
    }

    // MARK: - Computed

    public var formattedPrice: String {
        let dollars = priceCents / 100
        if dollars >= 1000 {
            return "$\(String(format: "%.1f", Double(dollars) / 1000))K"
        }
        return "$\(dollars)"
    }

    public var fullFormattedPrice: String {
        let dollars = priceCents / 100
        return "$\(NumberFormatter.localizedString(from: NSNumber(value: dollars), number: .decimal))"
    }

    /// Rehydrated placeholder gradient matching the owning product's category.
    public var placeholderGradient: LinearGradient {
        switch thumbGradientKey {
        case "seating":   return PatinaGradients.leather
        case "tables":    return PatinaGradients.wood
        case "lighting":  return PatinaGradients.metal
        case "storage":   return PatinaGradients.rattan
        case "decor":     return PatinaGradients.linen
        case "textiles":  return PatinaGradients.warm
        default:          return PatinaGradients.linen
        }
    }

    // MARK: - Factory

    /// Build a SavedItem from a Product + recommendation context.
    static func make(
        from product: Product,
        matchScore: Int,
        room: RoomModel? = nil
    ) -> SavedItem {
        SavedItem(
            productId: product.id,
            productName: product.name,
            makerName: product.makerName,
            priceCents: product.priceCents,
            matchScore: matchScore,
            hasAR: product.hasARModel,
            thumbGradientKey: product.category.rawValue,
            room: room
        )
    }
}
