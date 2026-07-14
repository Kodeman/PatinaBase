//
//  RoomlessDesignRequestTests.swift
//  PatinaTests
//
//  Pins that a roomless design request encodes with no scans and a nil primary
//  (the RPC — 00314 — then inserts leads.room_scan_id = NULL), while the
//  scan-based path still carries its scans + primary.
//

import Testing
import Foundation
@testable import Patina

struct RoomlessDesignRequestTests {

    @Test
    func roomlessParamsHaveEmptyScansAndNilPrimary() throws {
        let params = SubmitDesignRequestParams(
            scanIds: [],
            projectType: "consultation",
            primaryScanId: nil,
            budgetRange: nil,
            timeline: nil,
            description: "Just want a consultation",
            clientRequestId: UUID()
        )
        #expect(params.p_scan_ids.isEmpty)
        #expect(params.p_primary_scan_id == nil)
        #expect(params.p_project_type == "consultation")
        // Encodes cleanly — a nil optional primary is omitted, so the RPC falls
        // back to its DEFAULT NULL.
        _ = try JSONEncoder().encode(params)
    }

    @Test
    func scanBasedParamsCarryPrimary() {
        let primary = UUID()
        let params = SubmitDesignRequestParams(
            scanIds: [primary],
            projectType: "full_room",
            primaryScanId: primary,
            budgetRange: nil,
            timeline: nil,
            description: nil,
            clientRequestId: UUID()
        )
        #expect(params.p_scan_ids == [primary.uuidString.lowercased()])
        #expect(params.p_primary_scan_id == primary.uuidString.lowercased())
    }
}
