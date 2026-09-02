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

    @Test
    func theColumnListHasNoDuplicatesAndNoWhitespace() {
        let columns = ProductAPIClient.productColumns
        #expect(Set(columns).count == columns.count)
        #expect(columns.allSatisfy { !$0.contains(" ") })
    }
}
