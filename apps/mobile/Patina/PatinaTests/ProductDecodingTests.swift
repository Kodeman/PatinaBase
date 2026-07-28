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
}
