//
//  ProductVendorEmbedTests.swift
//  PatinaTests
//
//  Pins SP-01's query fix: `products` has two foreign keys to `vendors`
//  (`vendor_id` from 00001_initial_schema.sql:39, `retailer_id` from
//  00011_add_retailer_id.sql:6), so the single-product embed must name the
//  constraint. A bare `vendors(...)` returns PGRST201 and every piece
//  detail fails to load.
//

import Testing
@testable import Patina

struct ProductVendorEmbedTests {

    @Test
    func productSelectQualifiesTheVendorEmbed() {
        #expect(ProductAPIClient.productSelect.contains("vendors!products_vendor_id_fkey("))
    }

    @Test
    func productSelectCarriesNoBareVendorEmbed() {
        #expect(!ProductAPIClient.productSelect.contains("vendors("))
    }

    @Test
    func productSelectStillRequestsTheMakerFields() {
        #expect(ProductAPIClient.productSelect.contains("name,made_in,brand_story"))
    }
}
