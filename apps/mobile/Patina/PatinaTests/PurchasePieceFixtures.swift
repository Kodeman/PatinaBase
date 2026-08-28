//
//  PurchasePieceFixtures.swift
//  PatinaTests
//
//  One buyable piece, and the levers that break it. Shared by every W5 lane-C1
//  suite so the gate, the act matrix and the order sheet are all arguing about
//  the same table.
//
//  The values are the seeded Heirloom Oak Dining Table's real ones, read off
//  the local database rather than invented: $4,200.00, Nordic Atelier, 10-week
//  lead time, `patina_managed`, photo verified.
//

import Foundation
@testable import Patina

enum PurchaseFixture {

    static let productId = "a0000000-0000-0000-0000-000000000001"

    /// Every gate column present. Change one argument to fail one question.
    static func piece(
        id: String = productId,
        name: String = "Heirloom Oak Dining Table",
        priceCents: Int = 420_000,
        brand: String? = "Nordic Atelier",
        makerLocation: String? = "Aarhus, Denmark",
        leadTimeWeeks: Int? = 10,
        dimensions: ProductDimensions? = ProductDimensions(
            width: 84, height: 30, depth: 38, unit: "in"
        ),
        patinaManaged: Bool? = true,
        photoVerifiedAt: Date? = Date(timeIntervalSince1970: 1_756_000_000),
        shippingFlatCents: Int? = nil,
        deletedAt: Date? = nil,
        productDescription: String? = "Solid quarter-sawn white oak with hand-rubbed tung oil "
            + "finish. Each table is made to order by a three-person workshop outside Aarhus.",
        usdzURL: String? = nil
    ) -> Product {
        Product(
            id: id,
            name: name,
            priceCents: priceCents,
            matchScore: 90,
            makerName: "Nordic Atelier",
            makerLocation: makerLocation,
            makerStory: nil,
            imageURL: nil,
            usdzURL: usdzURL,
            styleTags: [],
            materialTags: ["white oak"],
            badges: [],
            category: .tables,
            tier: .designerSelection,
            dimensions: dimensions,
            leadTimeWeeks: leadTimeWeeks,
            brand: brand,
            productDescription: productDescription,
            publishedAt: nil,
            finish: nil,
            patinaManaged: patinaManaged,
            photoVerifiedAt: photoVerifiedAt,
            sourceURL: nil,
            shippingFlatCents: shippingFlatCents,
            deletedAt: deletedAt
        )
    }

    static func order(
        id: String = "d0000000-0000-0000-0000-0000000000a1",
        amountCents: Int = 420_000,
        unitPriceCents: Int = 420_000,
        quantity: Int = 1,
        status: String = "pending_payment",
        designerId: String? = nil,
        projectId: String? = nil
    ) -> DirectOrder {
        DirectOrder(
            id: id,
            productId: productId,
            productName: "Heirloom Oak Dining Table",
            quantity: quantity,
            unitPriceCents: unitPriceCents,
            amountCents: amountCents,
            currency: "USD",
            status: status,
            designerId: designerId,
            projectId: projectId
        )
    }
}
