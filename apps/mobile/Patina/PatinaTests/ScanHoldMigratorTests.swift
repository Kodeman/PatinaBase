//
//  ScanHoldMigratorTests.swift
//  PatinaTests
//
//  Pins the strict-local hold migration rule: "if any bytes left the phone,
//  finish the job; otherwise hold." A pending row with no remote room and no
//  uploaded artifact flips to heldLocal (and its cellular error clears); rows
//  with a remoteRoomId or an uploaded artifact are left for resume; non-pending
//  rows are never touched.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct ScanHoldMigratorTests {

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([RoomScanPackage.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    private func makePackage(
        status: RoomScanPackageStatus,
        remoteRoomId: UUID? = nil,
        uploadedArtifact: Bool = false
    ) -> RoomScanPackage {
        let pkg = RoomScanPackage(
            scanId: UUID(),
            roomLocalId: UUID(),
            bundlePath: "Scans/\(UUID())",
            remoteRoomId: remoteRoomId,
            status: status
        )
        if uploadedArtifact {
            var state = pkg.artifactState
            state.artifacts = [ArtifactUploadState(kind: .usdz, status: .uploaded)]
            pkg.artifactState = state
        }
        return pkg
    }

    private func migrator() -> ScanHoldMigrator {
        // Isolated defaults so the version guard never bleeds between runs.
        let defaults = UserDefaults(suiteName: "ScanHoldMigratorTests-\(UUID())")!
        return ScanHoldMigrator(defaults: defaults)
    }

    @Test
    func pendingNoBytesFlipsToHeldAndClearsCellularError() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let pkg = makePackage(status: .pending)
        pkg.lastError = "Waiting for Wi-Fi"
        ctx.insert(pkg)
        try ctx.save()

        let flipped = migrator().migrate(in: ctx)

        #expect(flipped == 1)
        #expect(pkg.status == .heldLocal)
        #expect(pkg.lastError == nil)
    }

    @Test
    func pendingWithRemoteRoomIsLeftForResume() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let pkg = makePackage(status: .pending, remoteRoomId: UUID())
        ctx.insert(pkg)
        try ctx.save()

        let flipped = migrator().migrate(in: ctx)

        #expect(flipped == 0)
        #expect(pkg.status == .pending)
    }

    @Test
    func pendingWithUploadedArtifactIsLeftForResume() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let pkg = makePackage(status: .pending, uploadedArtifact: true)
        ctx.insert(pkg)
        try ctx.save()

        let flipped = migrator().migrate(in: ctx)

        #expect(flipped == 0)
        #expect(pkg.status == .pending)
    }

    @Test
    func nonPendingRowsAreNeverTouched() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let syncing = makePackage(status: .syncing)
        let failed = makePackage(status: .failed)
        let synced = makePackage(status: .synced)
        [syncing, failed, synced].forEach { ctx.insert($0) }
        try ctx.save()

        let flipped = migrator().migrate(in: ctx)

        #expect(flipped == 0)
        #expect(syncing.status == .syncing)
        #expect(failed.status == .failed)
        #expect(synced.status == .synced)
    }

    @Test
    func migrateIfNeededRunsOnceThenNoOps() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        ctx.insert(makePackage(status: .pending))
        try ctx.save()

        let mig = migrator()
        let first = mig.migrateIfNeeded(in: ctx)
        #expect(first == 1)

        // A second pending row after the version has been recorded is NOT
        // migrated — the pass is one-shot per install generation.
        ctx.insert(makePackage(status: .pending))
        try ctx.save()
        let second = mig.migrateIfNeeded(in: ctx)
        #expect(second == 0)
    }
}
