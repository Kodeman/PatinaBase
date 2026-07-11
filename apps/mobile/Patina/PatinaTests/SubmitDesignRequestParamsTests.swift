//
//  SubmitDesignRequestParamsTests.swift
//  PatinaTests
//
//  Snapshot-pins the `submit_design_request` RPC wire shape: exact p_* keys,
//  the uuid-array shape, lowercased ids, `p_designer_id` OMITTED (server
//  auto-resolves), and encodeIfPresent omission of nil optionals.
//

import Testing
import Foundation
@testable import Patina

struct SubmitDesignRequestParamsTests {

    private func encodeToObject(_ params: SubmitDesignRequestParams) throws -> [String: Any] {
        let data = try JSONEncoder().encode(params)
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return obj ?? [:]
    }

    @Test
    func fullyPopulatedParamsPinExactKeys() throws {
        let s1 = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
        let s2 = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
        let req = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!

        let params = SubmitDesignRequestParams(
            scanIds: [s1, s2],
            projectType: "full_room",
            primaryScanId: s1,
            budgetRange: "5k_15k",
            timeline: "1_3_months",
            description: "Living room refresh",
            source: "Patina app",
            clientRequestId: req
        )

        let obj = try encodeToObject(params)

        // Exact key set — including the deliberate ABSENCE of p_designer_id.
        #expect(Set(obj.keys) == Set([
            "p_scan_ids", "p_project_type", "p_primary_scan_id",
            "p_budget_range", "p_timeline", "p_description",
            "p_source", "p_client_request_id"
        ]))
        #expect(obj["p_designer_id"] == nil)

        // uuid array shape, lowercased, ordered.
        #expect(obj["p_scan_ids"] as? [String] == [
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222"
        ])
        #expect(obj["p_primary_scan_id"] as? String == "11111111-1111-1111-1111-111111111111")
        #expect(obj["p_client_request_id"] as? String == "33333333-3333-3333-3333-333333333333")
        #expect(obj["p_project_type"] as? String == "full_room")
        #expect(obj["p_source"] as? String == "Patina app")
        #expect(obj["p_budget_range"] as? String == "5k_15k")
        #expect(obj["p_timeline"] as? String == "1_3_months")
        #expect(obj["p_description"] as? String == "Living room refresh")
    }

    @Test
    func nilOptionalsAreOmittedNotNull() throws {
        let s1 = UUID()
        let params = SubmitDesignRequestParams(
            scanIds: [s1],
            projectType: "consultation",
            primaryScanId: s1,
            budgetRange: nil,
            timeline: nil,
            description: nil,
            clientRequestId: UUID()
        )
        let obj = try encodeToObject(params)
        #expect(obj["p_budget_range"] == nil)
        #expect(obj["p_timeline"] == nil)
        #expect(obj["p_description"] == nil)
        // Required keys still present.
        #expect(obj["p_scan_ids"] != nil)
        #expect(obj["p_project_type"] as? String == "consultation")
        #expect(obj["p_client_request_id"] != nil)
    }

    @Test
    func blankOptionalStringsAreTreatedAsNil() throws {
        let s1 = UUID()
        let params = SubmitDesignRequestParams(
            scanIds: [s1],
            projectType: "staging",
            primaryScanId: s1,
            budgetRange: "   ",
            timeline: "",
            description: "  \n ",
            clientRequestId: UUID()
        )
        let obj = try encodeToObject(params)
        #expect(obj["p_budget_range"] == nil)
        #expect(obj["p_timeline"] == nil)
        #expect(obj["p_description"] == nil)
    }
}
