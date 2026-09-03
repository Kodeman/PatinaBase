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
        PatinaCurrency.formatWholeDollars(cents: priceCents)
    }

    /// SP-14: the app's one currency formatter.
    public var fullFormattedPrice: String {
        PatinaCurrency.formatWholeDollars(cents: priceCents)
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

/// SP-14's guard rail on the `saved_items` mirror.
///
/// The plank's own risk note: *"Mirroring every save server-side changes what
/// 'saved' means for guests, who have no account — keep the local store
/// authoritative until sign-in and reconcile through SP-06's claim step, or the
/// two planks will fight."* A guest has no session, so `resolveUserId()` throws
/// `notAuthenticated` — asking anyway turns every guest save into a failure the
/// reader is then told about. The mirror is therefore attempted only when there
/// is an account to mirror into; SP-06's claim step carries the guest's local
/// work across at sign-in.
enum SavedItemMirror {

    static func shouldAttempt(isAuthenticated: Bool) -> Bool {
        isAuthenticated
    }

    /// Shown only when a signed-in reader's mirror does not land. It states the
    /// two things the app actually knows — the piece is saved here, and the
    /// account copy did not get written — and neither blames a connection the
    /// app cannot see nor promises a retry that does not exist.
    static let deferredNotice = "Saved on this phone. We couldn't reach your account just now."

    /// `saved_items.source` names **where the piece was discovered**, and the
    /// column has carried a CHECK since `00055_saved_items.sql:32`:
    /// `emergence`, `search`, `companion`, `extension`. Both iOS save paths
    /// sent `"ios"` — the platform, not the surface — so every POST came back
    /// 400 (`23514`) and no save this app has ever made reached the account.
    /// It was invisible: the local row is the saved thing (SP-14) and the
    /// failure only logged.
    ///
    /// The browse grid and the piece detail are the recommendation surface,
    /// which is what `emergence` names.
    static let discoverySource = "emergence"
}
