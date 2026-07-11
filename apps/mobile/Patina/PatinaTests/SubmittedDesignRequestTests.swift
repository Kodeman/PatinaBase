//
//  SubmittedDesignRequestTests.swift
//  PatinaTests
//
//  Pins the durable submitted-request receipt: the idempotent-replay-safe
//  `record(...)` upsert never duplicates a `leadId`, updates the existing row
//  in place, and preserves the original `submittedAt`.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct SubmittedDesignRequestTests {

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([SubmittedDesignRequest.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    private func result(
        leadId: UUID,
        status: String,
        pooled: Bool,
        designerId: UUID?
    ) -> DesignRequestResult {
        DesignRequestResult(
            leadId: leadId,
            designerId: designerId,
            status: status,
            pooled: pooled,
            idempotentReplay: false
        )
    }

    @Test
    func recordInsertsThenUpsertsSameLead() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let lead = UUID()

        let first = SubmittedDesignRequest.record(
            homeownerId: UUID(),
            result: result(leadId: lead, status: "new", pooled: true, designerId: nil),
            projectTypeRaw: "full_room",
            scanCount: 2,
            in: ctx
        )
        try ctx.save()
        let submittedAt = first.submittedAt

        // Replay (same client_request_id → same leadId) now with a designer
        // and an advanced status.
        let designer = UUID()
        let second = SubmittedDesignRequest.record(
            homeownerId: UUID(),
            result: result(leadId: lead, status: "viewed", pooled: false, designerId: designer),
            projectTypeRaw: "full_room",
            scanCount: 2,
            in: ctx
        )
        try ctx.save()

        let all = try ctx.fetch(FetchDescriptor<SubmittedDesignRequest>())
        #expect(all.count == 1, "Replay must not duplicate the leadId")
        #expect(second.leadId == lead)
        #expect(second.lastKnownStatusRaw == "viewed")
        #expect(second.designerId == designer)
        #expect(second.pooledAtSubmit == false)
        // Original submission timestamp is preserved across the upsert.
        #expect(second.submittedAt == submittedAt)
    }

    @Test
    func distinctLeadsInsertSeparateRows() throws {
        let container = try makeContainer()
        let ctx = container.mainContext

        SubmittedDesignRequest.record(
            homeownerId: nil,
            result: result(leadId: UUID(), status: "new", pooled: true, designerId: nil),
            projectTypeRaw: nil, scanCount: 1, in: ctx
        )
        SubmittedDesignRequest.record(
            homeownerId: nil,
            result: result(leadId: UUID(), status: "new", pooled: true, designerId: nil),
            projectTypeRaw: nil, scanCount: 1, in: ctx
        )
        try ctx.save()

        let all = try ctx.fetch(FetchDescriptor<SubmittedDesignRequest>())
        #expect(all.count == 2)
    }
}
