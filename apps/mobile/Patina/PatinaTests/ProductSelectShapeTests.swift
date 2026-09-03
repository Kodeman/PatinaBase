//
//  ProductSelectShapeTests.swift
//  PatinaTests
//
//  A3-18. `productSelect` was `*`, so every by-id product read pulled two
//  768-dimension vectors the app never decodes — measured at 20,706 bytes for
//  one row, of which `embedding` is 9,459 and `aesthete_vector` is 9,462.
//  That select feeds the Record's saved pieces (a fetch per saved piece) and
//  every piece opened, and it is the blocking JSON round trip before an image
//  starts loading.
//
//  A golden assertion on purpose: the string is one edit away from `*` again.
//

import Foundation
import Testing
@testable import Patina

struct ProductSelectShapeTests {

    /// The whole select, verbatim. If this test fails, either a column was
    /// added to `RawProductWithVendor` (add it here) or the select drifted.
    private static let golden = """
        id,name,price_retail,quality_score,images,materials,style_tags,tags,\
        category,status,dimensions,lead_time_weeks,brand,description,finish,\
        patina_managed,source_url,published_at,photo_verified_at,\
        shipping_flat_cents,deleted_at,\
        vendors!products_vendor_id_fkey(name,made_in,brand_story)
        """

    @Test
    func theSelectIsExactlyTheColumnsTheAppDecodes() {
        #expect(ProductAPIClient.productSelect == Self.golden)
    }

    @Test
    func theSelectNeverAsksForEverything() {
        // Not `hasPrefix("*")` — `*` anywhere in a PostgREST select is the
        // whole row, including inside the embed.
        #expect(ProductAPIClient.productSelect.contains("*") == false)
    }

    @Test
    func theSelectNeverPullsAVector() {
        #expect(ProductAPIClient.productSelect.contains("embedding") == false)
        #expect(ProductAPIClient.productSelect.contains("aesthete_vector") == false)
        #expect(ProductAPIClient.productSelect.contains("search_vector") == false)
    }

    /// Every column the mapper reads must be requested, or the piece renders
    /// with a hole the enum defaults will hide.
    @Test
    func everyColumnTheMapperReadsIsRequested() {
        let required = [
            "id", "name", "price_retail", "quality_score", "images",
            "materials", "style_tags", "tags", "category", "dimensions",
            "lead_time_weeks", "brand", "description", "finish",
            "patina_managed", "source_url", "published_at",
            "photo_verified_at", "shipping_flat_cents", "deleted_at"
        ]
        for column in required {
            #expect(
                ProductAPIClient.productColumns.contains(column),
                "productSelect no longer asks for \(column)"
            )
        }
    }

    /// The other direction, and the one a hand-written list cannot see
    /// (review `RL1B2-11`): a property ADDED to `RawProductWithVendor`
    /// without being added to `productColumns` leaves every assertion above
    /// green and produces a decode failure against live PostgREST — which,
    /// with `C7-17`'s `FailableDecodable` in place, now silently drops the
    /// row instead of throwing. So the expected set is read out of the
    /// declaration itself rather than typed beside it.
    @Test
    func everyPropertyTheRowDecodesIsRequested() throws {
        let source = try SourcePin.read("Patina/Core/Network/ProductAPIClient.swift")
        let declaration = try #require(
            source.components(separatedBy: "private struct RawProductWithVendor: Decodable {").last?
                .components(separatedBy: "\n    struct VendorInfo").first
        )
        let decoded = declaration.components(separatedBy: .newlines).compactMap { line -> String? in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("let "), let colon = trimmed.firstIndex(of: ":") else {
                return nil
            }
            return String(trimmed[trimmed.index(trimmed.startIndex, offsetBy: 4)..<colon])
                .trimmingCharacters(in: .whitespaces)
        }
        // The walk found the struct, not an empty fragment after a rename.
        #expect(decoded.count >= 21, "the RawProductWithVendor walk found \(decoded.count) properties")
        for property in decoded where property != "vendors" {
            #expect(
                ProductAPIClient.productColumns.contains(property),
                "RawProductWithVendor decodes \(property) and productSelect never asks for it"
            )
        }
    }

    @Test
    func theColumnListHasNoDuplicatesAndNoWhitespace() {
        let columns = ProductAPIClient.productColumns
        #expect(Set(columns).count == columns.count)
        #expect(columns.allSatisfy { !$0.contains(" ") })
    }
}
