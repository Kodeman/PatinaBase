//
//  ScanDiskBudgetHeldTests.swift
//  PatinaTests
//
//  Pins that held-local bundles are eviction-exempt: even far over the disk
//  budget, ScanDiskBudget only ever evicts `synced` rows, so a `heldLocal`
//  scan is never deleted out from under a pending design request.
//
//  Serialized because it mutates the shared budget singleton's config.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
@Suite(.serialized)
struct ScanDiskBudgetHeldTests {

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([RoomScanPackage.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    private func makePackage(status: RoomScanPackageStatus, sizeBytes: Int, syncedOffset: TimeInterval = 0) -> RoomScanPackage {
        let pkg = RoomScanPackage(
            scanId: UUID(),
            roomLocalId: UUID(),
            bundlePath: "Scans/\(UUID())",
            sizeBytes: sizeBytes,
            status: status
        )
        if status == .synced { pkg.syncedAt = Date().addingTimeInterval(syncedOffset) }
        return pkg
    }

    @Test
    func heldLocalNeverEvictedEvenOverBudget() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext

        let budget = ScanDiskBudget.shared
        let saved = budget.config
        defer { budget.config = saved }
        // Force "always over budget" so eviction runs aggressively.
        budget.config = ScanDiskBudget.Config(
            maxTotalBytes: 1,
            maxBundleCount: 0,
            lowFreeSpaceHardStopBytes: 0,
            lowFreeSpaceAdvisoryBytes: 0
        )

        let held = makePackage(status: .heldLocal, sizeBytes: 1_000_000)
        let synced = makePackage(status: .synced, sizeBytes: 1_000_000, syncedOffset: -100)
        [held, synced].forEach { ctx.insert($0) }
        try ctx.save()

        await budget.evictIfNeeded(in: ctx)

        let remaining = try ctx.fetch(FetchDescriptor<RoomScanPackage>())
        let ids = Set(remaining.map { $0.scanId })
        // The synced bundle is fair game; the held one must survive.
        #expect(ids.contains(held.scanId))
        #expect(!ids.contains(synced.scanId))
    }
}
