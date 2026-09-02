//
//  ScanSharingContractTests.swift
//  PatinaTests
//
//  W0 · L0.2 — the wire contract with 00555 §a3.
//
//  00555 drops "Profiles are viewable by everyone" and revokes anon on
//  profiles, so the old free-text search over every `is_designer = true`
//  profile — which also handed any signed-in client every designer's EMAIL —
//  stops answering. The replacement is a SECURITY DEFINER RPC that returns no
//  email and never matches on one.
//
//  Both halves fail at runtime, in the share picker, against production: a
//  wrong RPC name is a 404 and a wrong decode is an empty list. Neither shows
//  up in a compile.
//

import Testing
import Foundation
@testable import Patina

struct ScanSharingContractTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - The call

    @Test("the designer search names the 00555 RPC, not the profiles table")
    func searchUsesTheRPC() {
        #expect(ScanSharingService.searchDesignersRPC == "search_shareable_designers")
    }

    @Test("the RPC's parameter is the one the function declares")
    func searchParamIsPQuery() throws {
        let encoded = try JSONEncoder().encode(
            ScanSharingService.SearchShareableDesignersParams(p_query: "Leah")
        )
        let object = try #require(
            try JSONSerialization.jsonObject(with: encoded) as? [String: String]
        )
        #expect(object == ["p_query": "Leah"])
    }

    // MARK: - The rows

    @Test("a search_shareable_designers row decodes and carries no email")
    func rpcRowDecodes() throws {
        let row = try decode(DesignerSearchResult.self, """
        { "id": "d0000000-0000-4000-8000-000000000001",
          "display_name": "Leah Kochaver",
          "business_name": "Middle West Studio",
          "avatar_url": "https://img.invalid/leah.png" }
        """)
        #expect(row.displayName == "Leah Kochaver")
        #expect(row.businessName == "Middle West Studio")
        #expect(row.avatarUrl == "https://img.invalid/leah.png")
        #expect(row.email == nil)
        #expect(row.resolvedName == "Leah Kochaver")
    }

    @Test("the recent-designers embed row, which still selects email, still decodes")
    func embedRowStillDecodes() throws {
        let row = try decode(DesignerSearchResult.self, """
        { "id": "d0000000-0000-4000-8000-000000000001",
          "email": "leah@middlewest.invalid",
          "full_name": "Leah Kochaver",
          "avatar_url": null,
          "business_name": "Middle West Studio" }
        """)
        #expect(row.email == "leah@middlewest.invalid")
        #expect(row.fullName == "Leah Kochaver")
        #expect(row.avatarUrl == nil)
    }

    @Test("the name falls back through display_name, full_name, business_name")
    func resolvedNameFallsBack() throws {
        let onlyFullName = try decode(DesignerSearchResult.self, """
        { "id": "d0000000-0000-4000-8000-000000000002", "full_name": "Dana Designer" }
        """)
        #expect(onlyFullName.resolvedName == "Dana Designer")

        let onlyBusiness = try decode(DesignerSearchResult.self, """
        { "id": "d0000000-0000-4000-8000-000000000003", "business_name": "Ora Works" }
        """)
        #expect(onlyBusiness.resolvedName == "Ora Works")

        let nameless = try decode(DesignerSearchResult.self, """
        { "id": "d0000000-0000-4000-8000-000000000004" }
        """)
        #expect(nameless.resolvedName == nil)
    }
}
