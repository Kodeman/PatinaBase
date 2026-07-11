//
//  ScanHoldStateTests.swift
//  PatinaTests
//
//  Pins the `heldLocal` state machine on RoomScanPackage: the raw value, the
//  markHeldLocal() transition (including clearing the stale cellular error),
//  and the fetch descriptors that must include/exclude it.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct ScanHoldStateTests {

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([RoomScanPackage.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    private func makePackage(status: RoomScanPackageStatus, createdOffset: TimeInterval = 0) -> RoomScanPackage {
        let pkg = RoomScanPackage(
            scanId: UUID(),
            roomLocalId: UUID(),
            bundlePath: "Scans/\(UUID())",
            status: status
        )
        pkg.createdAt = Date().addingTimeInterval(createdOffset)
        return pkg
    }

    @Test
    func heldLocalRawValueIsStable() {
        #expect(RoomScanPackageStatus.heldLocal.rawValue == "heldLocal")
        #expect(RoomScanPackageStatus(rawValue: "heldLocal") == .heldLocal)
    }

    @Test
    func markHeldLocalClearsCellularErrorAndKeepsUnsynced() {
        let pkg = makePackage(status: .pending)
        pkg.lastError = "Waiting for Wi-Fi"
        pkg.syncedAt = Date()

        pkg.markHeldLocal()

        #expect(pkg.status == .heldLocal)
        #expect(pkg.lastError == nil)
        #expect(pkg.syncedAt == nil)
    }

    @Test
    func heldOrSyncedItemsIncludesHeldAndSyncedOnly() throws {
        let container = try makeContainer()
        let ctx = container.mainContext

        let held = makePackage(status: .heldLocal, createdOffset: -10)
        let synced = makePackage(status: .synced, createdOffset: -5)
        let pending = makePackage(status: .pending, createdOffset: -3)
        let syncing = makePackage(status: .syncing, createdOffset: -2)
        let failed = makePackage(status: .failed, createdOffset: -1)
        [held, synced, pending, syncing, failed].forEach { ctx.insert($0) }
        try ctx.save()

        let items = try ctx.fetch(RoomScanPackage.heldOrSyncedItems)
        let ids = Set(items.map { $0.scanId })
        #expect(ids == Set([held.scanId, synced.scanId]))
        // Newest-first: synced (-5) before held (-10).
        #expect(items.first?.scanId == synced.scanId)
    }

    @Test
    func needsProcessingExcludesHeldLocal() throws {
        let container = try makeContainer()
        let ctx = container.mainContext

        let held = makePackage(status: .heldLocal)
        let pending = makePackage(status: .pending)
        [held, pending].forEach { ctx.insert($0) }
        try ctx.save()

        let items = try ctx.fetch(RoomScanPackage.needsProcessing)
        let ids = Set(items.map { $0.scanId })
        #expect(ids.contains(pending.scanId))
        #expect(!ids.contains(held.scanId))
    }
}
