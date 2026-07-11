//
//  DesignRequestCoordinatorLiveStatusTests.swift
//  PatinaTests
//
//  Regression pin for the stuck-resume bug: `rebuildScanPhases` snapshots
//  scan phases once at adopt()/createDraft(), but a background
//  `resumePendingUploads` can finish (or fail) an upload AFTER that snapshot.
//  The derived flags (`allScansUploaded` / `anyScanFailed` / `livePhase`)
//  must read the live `RoomScanPackage.status`, not the stale snapshot —
//  otherwise the sending screen sits on a bare spinner forever while the
//  per-row progress views (bound to the live package) show "Uploaded".
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct DesignRequestCoordinatorLiveStatusTests {

    private struct StubSubmitter: DesignRequestSubmitting {
        func submitDesignRequest(_ params: SubmitDesignRequestParams) async throws -> DesignRequestResult {
            throw DesignServicesError.submissionFailed
        }
    }

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([RoomScanPackage.self, DesignRequestDraft.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    private func makeHeldPackage(in ctx: ModelContext) -> RoomScanPackage {
        let pkg = RoomScanPackage(
            scanId: UUID(),
            roomLocalId: UUID(),
            bundlePath: "Scans/\(UUID())",
            status: .heldLocal
        )
        ctx.insert(pkg)
        try? ctx.save()
        return pkg
    }

    @Test
    func backgroundSyncAfterSnapshotFlipsDerivedFlags() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let pkg = makeHeldPackage(in: ctx)

        let coordinator = DesignRequestCoordinator(
            modelContext: ctx,
            submitter: StubSubmitter()
        )
        coordinator.createDraft(scanIds: [pkg.scanId], primaryScanId: pkg.scanId)

        // Snapshot taken at createDraft: held package → .waiting, not uploaded.
        #expect(coordinator.scanPhases[pkg.scanId] == .waiting)
        #expect(!coordinator.allScansUploaded)

        // Simulate a background resumePendingUploads finishing the upload
        // AFTER the snapshot — no coordinator call in between.
        pkg.markSynced()
        try ctx.save()

        // The snapshot is stale by design; the LIVE derivation must not be.
        #expect(coordinator.scanPhases[pkg.scanId] == .waiting)   // stale snapshot
        #expect(coordinator.livePhase(for: pkg.scanId) == .uploaded)
        #expect(coordinator.allScansUploaded)                     // regression pin
        #expect(!coordinator.anyScanFailed)
    }

    @Test
    func backgroundFailureAfterSnapshotSurfacesAsFailed() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let pkg = makeHeldPackage(in: ctx)

        let coordinator = DesignRequestCoordinator(
            modelContext: ctx,
            submitter: StubSubmitter()
        )
        coordinator.createDraft(scanIds: [pkg.scanId], primaryScanId: pkg.scanId)
        #expect(!coordinator.anyScanFailed)

        // Background attempt fails after the snapshot.
        pkg.markFailed("network gave out")
        try ctx.save()

        #expect(coordinator.livePhase(for: pkg.scanId) == .failed("network gave out"))
        #expect(coordinator.anyScanFailed)
        #expect(!coordinator.allScansUploaded)
    }

    @Test
    func allUploadedNeedsEverySelectedScanSynced() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let first = makeHeldPackage(in: ctx)
        let second = makeHeldPackage(in: ctx)

        let coordinator = DesignRequestCoordinator(
            modelContext: ctx,
            submitter: StubSubmitter()
        )
        coordinator.createDraft(scanIds: [first.scanId, second.scanId], primaryScanId: first.scanId)

        first.markSynced()
        try ctx.save()
        #expect(!coordinator.allScansUploaded)   // one of two

        second.markSynced()
        try ctx.save()
        #expect(coordinator.allScansUploaded)    // both
    }
}
