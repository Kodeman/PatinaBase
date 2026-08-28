//
//  BuyabilityGateTests.swift
//  PatinaTests
//
//  W5 · C1 — B §5's gate, and the rule underneath it: a $4,200 order sheet can
//  never ship missing the two facts Walt leads with, over a photograph of
//  somebody else's chairs (F17, F142, F143, F06).
//
//  The server runs the same six questions. These tests pin the client's mirror
//  against the exact strings `create_direct_order` raises, so a refusal that
//  does reach the app becomes one plain sentence and never a Postgres error.
//

import Testing
import Foundation
@testable import Patina

struct BuyabilityGateTests {

    // MARK: - The gate

    @Test("a fully-specced Patina-managed piece is buyable")
    func fullySpeccedPiecePasses() {
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece()) == nil)
        #expect(BuyabilityGate.isBuyable(PurchaseFixture.piece()))
    }

    @Test("each missing gate column refuses on its own question")
    func eachMissingColumnRefuses() {
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(priceCents: 0)) == .noPrice)
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(brand: nil)) == .brand)
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(leadTimeWeeks: nil)) == .leadTimeWeeks)
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(dimensions: nil)) == .dimensions)
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(photoVerifiedAt: nil))
                == .photoVerifiedAt)
    }

    @Test("a piece the client cannot prove a seller for is refused, not offered")
    func noSellerOfRecordRefuses() {
        // `products_catalog_requires_management` forces `patina_managed` TRUE
        // on every catalogue row, so this can only be a personal or studio
        // row — a client's own captured furniture, which was never for sale.
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(patinaManaged: false))
                == .noSellerOfRecord)
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(patinaManaged: nil))
                == .noSellerOfRecord)
    }

    @Test("a withdrawn piece is refused before anything else is asked")
    func withdrawnPieceRefuses() {
        let withdrawn = PurchaseFixture.piece(deletedAt: Date())
        #expect(BuyabilityGate.evaluate(withdrawn) == .withdrawn)
    }

    @Test("a dimensions jsonb with no width is refused — the server tests shape, not null-ness")
    func shapelessDimensionsRefuse() {
        let noWidth = PurchaseFixture.piece(
            dimensions: ProductDimensions(width: nil, height: 30, depth: 38, unit: "in")
        )
        #expect(BuyabilityGate.evaluate(noWidth) == .dimensions)
    }

    @Test("a zero or negative lead time is no lead time")
    func zeroLeadTimeRefuses() {
        #expect(BuyabilityGate.evaluate(PurchaseFixture.piece(leadTimeWeeks: 0)) == .leadTimeWeeks)
    }

    // MARK: - The server's own words

    @Test("every create_direct_order refusal maps onto its case")
    func serverRefusalsMap() {
        let uuid = PurchaseFixture.productId
        let cases: [(String, BuyabilityGate.Refusal)] = [
            ("create_direct_order: not_buyable:dimensions", .dimensions),
            ("create_direct_order: not_buyable:lead_time_weeks", .leadTimeWeeks),
            ("create_direct_order: not_buyable:brand", .brand),
            ("create_direct_order: not_buyable:photo_verified_at", .photoVerifiedAt),
            ("create_direct_order: product \(uuid) is not available for direct purchase",
             .noSellerOfRecord),
            ("create_direct_order: product \(uuid) has no purchasable price", .noPrice),
            ("create_direct_order: product \(uuid) not found", .withdrawn)
        ]
        for (message, expected) in cases {
            #expect(BuyabilityGate.refusal(fromServerMessage: message) == expected,
                    "\(message) should map to \(expected)")
        }
    }

    @Test("an unrecognised server message becomes the catch-all and is never rendered")
    func unknownServerMessageIsCaughtAndNotEchoed() {
        let raw = "PGRST202: function public.create_direct_order does not exist"
        let refusal = BuyabilityGate.refusal(fromServerMessage: raw)
        #expect(refusal == .unknown)
        let sentence = BuyabilityGate.sentence(for: refusal)
        #expect(sentence == "We can't sell this piece through the app yet.")
        #expect(!sentence.contains("PGRST"))
        #expect(!sentence.lowercased().contains("function"))
    }

    @Test("every refusal has a sentence, and none of them is empty or shouty")
    func everyRefusalHasCopy() {
        let all: [BuyabilityGate.Refusal] = [
            .withdrawn, .noSellerOfRecord, .noPrice,
            .dimensions, .leadTimeWeeks, .brand, .photoVerifiedAt, .unknown
        ]
        for refusal in all {
            let sentence = BuyabilityGate.sentence(for: refusal)
            #expect(!sentence.isEmpty)
            #expect(sentence.hasSuffix("."))
            #expect(!sentence.contains("!"))
            #expect(!BuyabilityGate.analyticsReason(for: refusal).isEmpty)
        }
    }

    @Test("the gate-failed piece screen names the fact that is actually missing")
    func refusalSentencesNameTheirOwnFact() {
        #expect(BuyabilityGate.sentence(for: .dimensions)
                == "We don't have this piece's size yet.")
        #expect(BuyabilityGate.sentence(for: .leadTimeWeeks)
                == "We don't have this piece's lead time yet.")
        // The client gate refuses any piece it cannot prove `patina_managed`,
        // but the server also sells a vendor's catalogue row — so the sentence
        // may not claim the piece is not sold through Patina.
        #expect(BuyabilityGate.sentence(for: .noSellerOfRecord)
                == "We can't sell this piece through the app yet.")
        #expect(!BuyabilityGate.sentence(for: .noSellerOfRecord)
                .contains("isn't sold through Patina"))
    }
}
