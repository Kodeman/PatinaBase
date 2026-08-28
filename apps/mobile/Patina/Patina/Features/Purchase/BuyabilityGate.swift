//
//  BuyabilityGate.swift
//  Patina
//
//  B §5's buyability gate, mirrored on the client over the decoded `Product`.
//
//  The server is authoritative. `create_direct_order` runs the same six
//  questions in SQL and raises a stable, prefix-matchable code
//  (`00540:452-461` for the four new ones; `00276`'s two money/seller
//  sentences unchanged) — this type exists so the app can decline to draw a
//  Buy button it already knows the rail would refuse, and so that a refusal
//  which does reach the client becomes one plain sentence instead of a
//  Postgres error (C5).
//
//  One deliberate asymmetry with the server, and its reason. The server's
//  "seller of record" is `patina_managed OR vendors.is_patina_catalog`; the
//  client cannot see `vendors.is_patina_catalog` on any read it makes, so the
//  gate here requires `patina_managed`. That costs nothing in practice —
//  `products_catalog_requires_management` forces `patina_managed = TRUE` on
//  every `layer = 'catalog'` row, so the only pieces this refuses and the
//  server would allow are personal and studio rows, which are a client's own
//  captured furniture and were never for sale. Withholding Buy is the safe
//  direction: a piece the client cannot buy falls to Path C, which is a
//  complete answer, whereas a Buy button that fails is not.
//

import Foundation

enum BuyabilityGate {

    /// Why a piece cannot be bought. One case per server refusal, so the
    /// screen and the server speak the same vocabulary.
    enum Refusal: Equatable, Sendable {
        /// The catalogue withdrew the piece (`products.deleted_at`).
        case withdrawn
        case noSellerOfRecord
        case noPrice
        case dimensions
        case leadTimeWeeks
        case brand
        case photoVerifiedAt
        /// A refusal the app does not recognise. Carries nothing: the server's
        /// own words never reach a homeowner.
        case unknown
    }

    /// `nil` when the piece passes every question. Order matches the server's
    /// so the client and the rail refuse for the same reason.
    static func evaluate(_ product: Product) -> Refusal? {
        if product.deletedAt != nil { return .withdrawn }
        if product.patinaManaged != true { return .noSellerOfRecord }
        if product.priceCents <= 0 { return .noPrice }
        // The server tests the SHAPE of the `dimensions` jsonb, not its
        // NULL-ness: `{}`, `[]` and `{"unit":"in"}` are all non-NULL and all
        // mean nothing. `dimensionsLine` is nil for exactly those.
        if product.dimensions?.width == nil || product.dimensionsLine == nil { return .dimensions }
        if product.leadTimeWeeks == nil || product.leadTimeWeeks! <= 0 { return .leadTimeWeeks }
        if product.brand == nil { return .brand }
        if product.photoVerifiedAt == nil { return .photoVerifiedAt }
        return nil
    }

    static func isBuyable(_ product: Product) -> Bool {
        evaluate(product) == nil
    }

    // MARK: - The server's answer

    /// Map a raised `create_direct_order` message onto a refusal. Matching is
    /// by the stable fragment each `RAISE EXCEPTION` carries, never by the
    /// whole sentence — the two 00276 refusals interpolate a uuid.
    static func refusal(fromServerMessage message: String) -> Refusal {
        let lower = message.lowercased()
        if lower.contains("not_buyable:dimensions") { return .dimensions }
        if lower.contains("not_buyable:lead_time_weeks") { return .leadTimeWeeks }
        if lower.contains("not_buyable:brand") { return .brand }
        if lower.contains("not_buyable:photo_verified_at") { return .photoVerifiedAt }
        if lower.contains("is not available for direct purchase") { return .noSellerOfRecord }
        if lower.contains("has no purchasable price") { return .noPrice }
        if lower.contains("not found") { return .withdrawn }
        return .unknown
    }

    // MARK: - Copy

    /// What the piece screen says under "Ask about this piece". Each sentence
    /// names the missing fact plainly and offers no apology for it; the
    /// catch-all says only what is true, which is that the app is not ready to
    /// sell this one.
    static func sentence(for refusal: Refusal) -> String {
        switch refusal {
        case .withdrawn:
            return "This piece is no longer in the catalogue."
        case .noSellerOfRecord:
            return "This piece isn't sold through Patina."
        case .noPrice:
            return "This piece doesn't have a price yet."
        case .dimensions, .leadTimeWeeks:
            return "We don't have this piece's size and lead time yet."
        case .brand:
            return "We don't know who makes this piece yet."
        case .photoVerifiedAt:
            return "We haven't checked this piece's photograph yet."
        case .unknown:
            return "We can't sell this piece through the app yet."
        }
    }

    /// The `reason` property on `order_failed`. A code, never a sentence, and
    /// never the server's own words.
    static func analyticsReason(for refusal: Refusal) -> String {
        switch refusal {
        case .withdrawn: return "withdrawn"
        case .noSellerOfRecord: return "no_seller_of_record"
        case .noPrice: return "no_price"
        case .dimensions: return "dimensions"
        case .leadTimeWeeks: return "lead_time_weeks"
        case .brand: return "brand"
        case .photoVerifiedAt: return "photo_verified_at"
        case .unknown: return "unknown"
        }
    }
}
