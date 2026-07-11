//
//  ScanRecoveryServiceHeldTests.swift
//  PatinaTests
//
//  Pins that `heldLocal` bundles are intentionally kept by the launch-time
//  recovery pass: never discarded (even with no bundle on disk) and never
//  surfaced as recovery candidates. They are the resting state, not an
//  interrupted upload.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct ScanRecoveryServiceHeldTests {

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([RoomScanPackage.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    @Test
    func heldLocalPackageIsNeitherDiscardedNorACandidate() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext

        // A held package pointing at a bundle dir that does NOT exist on disk.
        // The recovery pass must still keep it (it's not orphaned — it's held).
        let held = RoomScanPackage(
            scanId: UUID(),
            roomLocalId: UUID(),
            bundlePath: "Scans/held-\(UUID())",
            status: .heldLocal
        )
        ctx.insert(held)
        try ctx.save()

        let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: ctx)

        #expect(!candidates.contains { $0.id == held.scanId })

        // Row survives (not discarded).
        let remaining = try ctx.fetch(FetchDescriptor<RoomScanPackage>())
        #expect(remaining.contains { $0.scanId == held.scanId })
        #expect(remaining.first { $0.scanId == held.scanId }?.status == .heldLocal)
    }
}
