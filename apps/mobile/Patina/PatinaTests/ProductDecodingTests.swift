//
//  ProductDecodingTests.swift
//  PatinaTests
//
//  Pins U39's release-gating decode contract: DB category/tier vocabulary
//  that doesn't match the Swift enums' raw values normalizes instead of
//  throwing, a single malformed row drops instead of blanking the whole
//  payload, and `ProductAPIClient.decodeProducts` is the only decode path.
//
//  Fixture: `Fixtures/recommendations_mixed_rows.json` — 5 raw
//  get_recommendations rows: categories "chair"/"sofa"/"table"/"decor" plus
//  one row missing `name` (malformed — must be dropped, not fatal).
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ProductDecodingTests {

    private func fixtureData(_ name: String) throws -> Data {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let url = dir.appendingPathComponent("Fixtures/\(name).json")
        return try Data(contentsOf: url)
    }

    private func decodedFixture() throws -> [Product] {
        try ProductAPIClient.decodeProducts(from: try fixtureData("recommendations_mixed_rows"))
    }

    // MARK: - DB vocabulary normalizes

    @Test
    func dbVocabularyNormalizes() throws {
        let products = try decodedFixture()
        let byId = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })

        #expect(byId["prod-chair-1"]?.category == .seating)
        #expect(byId["prod-sofa-1"]?.category == .seating)
        #expect(byId["prod-table-1"]?.category == .tables)
        #expect(byId["prod-decor-1"]?.category == .decor)
    }

    // MARK: - Unknown category falls back to decor

    @Test
    func unknownCategoryFallsBackToDecor() throws {
        #expect(ProductCategory(normalizing: "taxidermy") == .decor)
        #expect(ProductCategory(normalizing: nil) == .decor)
    }

    // MARK: - Unknown tier falls back to styleMatch

    @Test
    func unknownTierFallsBackToStyleMatch() throws {
        let json = """
        [{
            "id": "prod-unknown-tier",
            "name": "Mystery Stool",
            "category": "seating",
            "tier": "clearance"
        }]
        """
        let products = try ProductAPIClient.decodeProducts(from: Data(json.utf8))
        let product = try #require(products.first)
        #expect(product.tier == .styleMatch)
    }

    // MARK: - Malformed row is dropped, others survive

    @Test
    func malformedRowIsDroppedOthersSurvive() throws {
        let products = try decodedFixture()
        #expect(products.count == 4)
        #expect(!products.map(\.id).contains("prod-malformed-1"))
    }

    // MARK: - Empty payload decodes to empty array

    @Test
    func emptyPayloadDecodesToEmptyArray() throws {
        let products = try ProductAPIClient.decodeProducts(from: Data("[]".utf8))
        #expect(products.isEmpty)
    }

    // MARK: - Enum raw values still normalize to themselves

    @Test
    func enumRawValuesStillNormalizeToThemselves() throws {
        for category in ProductCategory.allCases {
            #expect(ProductCategory(normalizing: category.rawValue) == category)
        }
    }

    // MARK: - SP-10 spec columns (00533)

    private static let specRowJSON = """
    [{
        "id": "p-spec",
        "name": "Heirloom Oak Dining Table",
        "maker_name": "Room & Board",
        "brand": "Nordic Atelier",
        "lead_time_weeks": 8,
        "source_url": "https://example.test/oak",
        "description": "A trestle table cut from a single log.",
        "finish": "Oiled",
        "patina_managed": true,
        "shipping_flat_cents": 29900,
        "published_at": "2026-08-20T00:00:00+00:00",
        "photo_verified_at": "2026-08-21T00:00:00+00:00",
        "dimensions": {"width": 38, "depth": 20, "height": 30, "unit": "in"}
    }]
    """

    @Test
    func specColumnsDecodeWhenPresent() throws {
        let product = try #require(
            try ProductAPIClient.decodeProducts(from: Data(Self.specRowJSON.utf8)).first
        )
        #expect(product.leadTimeWeeks == 8)
        #expect(product.leadTimeLine == "Ships in 8 weeks")
        #expect(product.dimensionsLine == "38\u{2033} W \u{00D7} 20\u{2033} D \u{00D7} 30\u{2033} H")
        #expect(product.brand == "Nordic Atelier")
        #expect(product.productDescription == "A trestle table cut from a single log.")
        #expect(product.finish == "Oiled")
        #expect(product.patinaManaged == true)
        #expect(product.sourceURL == "https://example.test/oak")
        #expect(product.shippingFlatCents == 29900)
        #expect(product.publishedAt != nil)
        #expect(product.photoVerifiedAt != nil)
    }

    /// SP-10: `brand` holds the actual maker; the vendor name is the fallback.
    @Test
    func makerPrefersBrandOverVendor() throws {
        let product = try #require(
            try ProductAPIClient.decodeProducts(from: Data(Self.specRowJSON.utf8)).first
        )
        #expect(product.makerName == "Room & Board")
        #expect(product.resolvedMakerName == "Nordic Atelier")
        #expect(product.hasResolvableMaker)
    }

    /// The 00533 columns are not in every database this app talks to — a null
    /// column is absent on screen, never a placeholder.
    @Test
    func specColumnsAreAbsentHonestlyWhenNull() throws {
        let json = #"[{"id":"p-bare","name":"Mystery Stool"}]"#
        let product = try #require(
            try ProductAPIClient.decodeProducts(from: Data(json.utf8)).first
        )
        #expect(product.dimensions == nil)
        #expect(product.dimensionsLine == nil)
        #expect(product.leadTimeLine == nil)
        #expect(product.brand == nil)
        #expect(product.publishedAt == nil)
        #expect(product.shippingFlatCents == nil)
    }

    /// SP-10: the RPC prints the literal "Unknown Maker" where no vendor
    /// resolves. That is not a maker — the app must not render it as one.
    @Test
    func unknownMakerIsNotAResolvableMaker() throws {
        let json = #"[{"id":"p-nomaker","name":"Anon Chair","maker_name":"Unknown Maker"}]"#
        let product = try #require(
            try ProductAPIClient.decodeProducts(from: Data(json.utf8)).first
        )
        #expect(product.hasResolvableMaker == false)
        #expect(product.resolvedMakerName == nil)
    }

    @Test
    func metricDimensionsPrintTheirUnit() throws {
        let json = #"[{"id":"p-cm","name":"Cm Table","dimensions":{"width":96,"depth":51,"unit":"cm"}}]"#
        let product = try #require(
            try ProductAPIClient.decodeProducts(from: Data(json.utf8)).first
        )
        #expect(product.dimensionsLine == "96 cm W \u{00D7} 51 cm D")
    }
}
