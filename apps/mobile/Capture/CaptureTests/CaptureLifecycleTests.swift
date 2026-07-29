//  CaptureLifecycleTests.swift
//  CaptureTests
//
//  The capture lifecycle reducer is pure — verify its transitions and the
//  terminal-state rule. Foundation contract that all teams rely on.

import Testing
import Foundation
@testable import CaptureKit

struct CaptureLifecycleTests {
    typealias S = CaptureLifecycle.State

    @Test func shutterFreezesViewfinderToCaptured() {
        #expect(CaptureLifecycle.reduce(.viewfinder, .shutter) == .captured)
    }

    @Test func capturedOpensToSpecimen() {
        #expect(CaptureLifecycle.reduce(.captured, .openSpecimen) == .specimen)
    }

    @Test func enrichLoopsBackToSpecimen() {
        let enriching = CaptureLifecycle.reduce(.specimen, .beginEnrich(.ocr))
        #expect(enriching == .enriching)
        #expect(CaptureLifecycle.reduce(enriching, .finishEnrich) == .specimen)
    }

    @Test func chooseLibraryRoutes() {
        #expect(CaptureLifecycle.reduce(.specimen, .chooseDestination(.library)) == .routed)
    }

    @Test func offlineEnqueueQueues() {
        #expect(CaptureLifecycle.reduce(.routed, .enqueueOffline) == .queued)
    }

    @Test func commitSucceededRequiresAwaitingConfirmation() {
        let uploading = CaptureLifecycle.reduce(.queued, .beginUpload)
        let awaiting = CaptureLifecycle.reduce(uploading, .awaitConfirmation)
        let saved = CaptureLifecycle.reduce(awaiting, .commitSucceeded)
        #expect(saved == .saved)
        #expect(CaptureLifecycle.isTerminal(saved))
        #expect(CaptureLifecycle.reduce(.routed, .commitSucceeded) == .routed)
    }

    @Test func commitFailedThenRetryRequeues() {
        let failed = CaptureLifecycle.reduce(.routed, .commitFailed("network"))
        #expect(failed == .failed)
        #expect(CaptureLifecycle.reduce(failed, .retry) == .queued)
    }

    @Test func onlyConfirmedOrRejectedOutcomesAreTerminal() {
        #expect(CaptureLifecycle.isTerminal(.saved))
        #expect(CaptureLifecycle.isTerminal(.inbox))
        #expect(CaptureLifecycle.isTerminal(.rejected))
        #expect(!CaptureLifecycle.isTerminal(.queued))
        #expect(!CaptureLifecycle.isTerminal(.awaitingConfirmation))
        #expect(!CaptureLifecycle.isTerminal(.viewfinder))
    }
}

struct SpecimenProvenanceTests {
    @Test @MainActor func guessNeverOverwritesConfirmedValue() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        s.setValue("Holloway & Co.", for: .maker, source: .ocr)
        s.setValue("Generic Vendor", for: .maker, source: .smartGuess)   // must NOT clobber
        #expect(s.maker == "Holloway & Co.")
        #expect(s.provenance(for: .maker) == .ocr)
    }

    @Test @MainActor func setValueRecordsProvenanceAndTouches() throws {
        let store = try CaptureStore.inMemory()
        let s = store.newDraft()
        let before = s.updatedAt
        s.setValue("LQ-3S-OAK", for: .sku, source: .ocr)
        #expect(s.sku == "LQ-3S-OAK")
        #expect(s.provenance(for: .sku) == .ocr)
        #expect(s.updatedAt >= before)
    }

    @Test @MainActor func visitQueryDoesNotLeakOlderDrafts() throws {
        let store = try CaptureStore.inMemory()
        let visitA = UUID()
        let visitB = UUID()
        let queued = store.newDraft(sessionID: visitA)
        queued.status = .queued
        _ = store.newDraft(sessionID: visitB)
        try store.save()

        #expect(store.session(visitID: visitA).count == 1)
        #expect(store.session(visitID: visitB).count == 1)
    }

    @Test @MainActor func committedWithoutReceiptStaysUnconfirmed() throws {
        let store = try CaptureStore.inMemory()
        let owner = try #require(CaptureOwnerIdentity(
            userID: " USER-A ",
            workspaceID: " WORKSPACE-A "
        ))
        let specimen = store.newDraft(owner: owner)
        specimen.status = .committed
        specimen.remoteId = nil
        try store.save()

        #expect(specimen.ownerUserID == "user-a")
        #expect(specimen.ownerWorkspaceID == "workspace-a")
        #expect(specimen.transferState.phase == .awaitingConfirmation)
        #expect(specimen.transferState.receiptID == nil)
        #expect(store.outbox(owner: owner).map(\.id) == [specimen.id])
    }

    @Test @MainActor
    func identityScopedQueriesQuarantineLegacyAndMismatchedRows() throws {
        let store = try CaptureStore.inMemory()
        let visit = UUID()
        let ownerA = try #require(CaptureOwnerIdentity(
            userID: "user-a",
            workspaceID: "workspace-a"
        ))
        let ownerB = try #require(CaptureOwnerIdentity(
            userID: "user-a",
            workspaceID: "workspace-b"
        ))

        let owned = store.newDraft(sessionID: visit, owner: ownerA)
        owned.title = "Owned"
        owned.status = .ready
        let otherWorkspace = store.newDraft(sessionID: visit, owner: ownerB)
        otherWorkspace.title = "Other workspace"
        otherWorkspace.status = .ready
        let legacy = store.newDraft(sessionID: visit)
        legacy.title = "Legacy"
        legacy.status = .ready
        try store.save()

        #expect(store.specimen(id: owned.id, owner: ownerA)?.id == owned.id)
        #expect(store.specimen(id: otherWorkspace.id, owner: ownerA) == nil)
        #expect(store.specimen(id: legacy.id, owner: ownerA) == nil)
        #expect(store.session(visitID: visit, owner: ownerA).map(\.id) == [owned.id])
        #expect(store.outbox(owner: ownerA).map(\.id) == [owned.id])
        #expect(
            store.search(SpecimenQuery(), owner: ownerA).map(\.id)
                == [owned.id]
        )
    }
}

struct CaptureOwnerProjectionPolicyTests {
    @Test func mockAndLaunchHarnessUseGlobalFixtures() {
        let scope = CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: false,
            userID: nil,
            workspaceID: nil)

        #expect(scope == .globalFixtures)
    }

    @Test func realServicesFailClosedWithoutACompleteIdentity() {
        #expect(CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: true,
            userID: nil,
            workspaceID: "workspace-a") == .unavailable)
        #expect(CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: true,
            userID: "user-a",
            workspaceID: " ") == .unavailable)
    }

    @Test @MainActor func realServicesResolveAnOwnerForListsAndCreation() throws {
        let scope = CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: true,
            userID: " USER-A ",
            workspaceID: " WORKSPACE-A ")
        guard case .owner(let owner) = scope else {
            Issue.record("Expected an owner-scoped production projection")
            return
        }

        let store = try CaptureStore.inMemory()
        let specimen = store.newDraft(owner: owner)

        #expect(owner.userID == "user-a")
        #expect(owner.workspaceID == "workspace-a")
        #expect(specimen.ownerUserID == "user-a")
        #expect(specimen.ownerWorkspaceID == "workspace-a")
    }
}

struct CaptureTransferLifecycleTests {
    @Test func followsHonestLocalToReceiptBackedCompletion() throws {
        var state = CaptureTransferState.local
        state = try CaptureTransferReducer.reduce(state, .enqueue)
        #expect(state.phase == .queued)

        state = try CaptureTransferReducer.reduce(state, .beginUpload)
        #expect(state.phase == .uploading)

        state = try CaptureTransferReducer.reduce(state, .awaitConfirmation)
        #expect(state.phase == .awaitingConfirmation)

        state = try CaptureTransferReducer.reduce(
            state,
            .confirm(receiptID: "remote-capture-id")
        )
        #expect(state.phase == .complete)
        #expect(state.receiptID == "remote-capture-id")
    }

    @Test func completionWithoutReceiptIsRejected() throws {
        let awaiting = CaptureTransferState(
            phase: .awaitingConfirmation,
            progress: 100
        )

        #expect(throws: CaptureTransferTransitionError.missingReceipt) {
            try CaptureTransferReducer.reduce(
                awaiting,
                .confirm(receiptID: "  ")
            )
        }
    }

    @Test func retryableFailureReturnsToTheQueueButRejectedDoesNot() throws {
        let failed = CaptureTransferState(
            phase: .retryableFailure,
            errorMessage: "No connection",
            retryCount: 2
        )
        let retried = try CaptureTransferReducer.reduce(failed, .retry)
        #expect(retried.phase == .queued)
        #expect(retried.retryCount == 2)

        let rejected = CaptureTransferState(
            phase: .rejected,
            errorMessage: "Bundle rejected"
        )
        #expect(throws: CaptureTransferTransitionError.invalidTransition) {
            try CaptureTransferReducer.reduce(rejected, .retry)
        }
    }
}

struct CaptureRouteSafetyPolicyTests {
    @Test func onlyDeviceLocalTransfersCanEnterTheCullDeck() {
        #expect(CaptureRouteSafetyPolicy.canCull(.local))

        let protectedPhases: [CaptureTransferPhase] = [
            .queued,
            .uploading,
            .awaitingConfirmation,
            .complete,
            .retryableFailure,
            .rejected
        ]
        for phase in protectedPhases {
            let transfer = CaptureTransferState(
                phase: phase,
                receiptID: phase == .complete ? "receipt" : nil)
            #expect(!CaptureRouteSafetyPolicy.canCull(transfer))
        }
    }

    @Test func terminalDestinationRequiresReceiptBackedServerTruth() {
        let confirmed = CaptureTransferState(
            phase: .complete,
            progress: 100,
            receiptID: "capture-receipt")

        #expect(CaptureRouteSafetyPolicy.confirmedDestination(
            recordedDestination: .library,
            transfer: confirmed) == .library)
        #expect(CaptureRouteSafetyPolicy.confirmedDestination(
            recordedDestination: .inbox,
            transfer: confirmed) == .inbox)
        #expect(CaptureRouteSafetyPolicy.confirmedDestination(
            recordedDestination: .undecided,
            transfer: confirmed) == nil)
    }

    @Test func queuedOrReceiptlessDestinationsAreNeverReportedAsTerminal() {
        #expect(CaptureRouteSafetyPolicy.confirmedDestination(
            recordedDestination: .library,
            transfer: CaptureTransferState(phase: .queued)) == nil)
        #expect(CaptureRouteSafetyPolicy.confirmedDestination(
            recordedDestination: .inbox,
            transfer: CaptureTransferState(phase: .complete)) == nil)
    }
}

struct CaptureSessionContextPolicyTests {
    private let identity = CaptureSessionIdentity(
        userID: "designer-a",
        workspaceID: "studio-a"
    )
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func remembersOnlyRoutingWithinTheSameVisit() {
        let initial = CaptureSessionContextPolicy.resolve(
            existing: nil,
            identity: identity,
            now: start
        )
        let routing = CaptureRoutingMemory(
            destination: .library,
            projectID: "project-a",
            projectName: "Oak Street",
            room: "Dining room",
            shelf: "Seating"
        )
        let remembered = CaptureSessionContextPolicy.remember(
            routing,
            in: initial,
            now: start.addingTimeInterval(60)
        )

        #expect(remembered.visitID == initial.visitID)
        #expect(remembered.routing == routing)
    }

    @Test func assignmentUpdatePreservesTheLastSuccessfulDestination() {
        let prior = CaptureRoutingMemory(
            destination: .library,
            projectID: "old-project",
            projectName: "Old project",
            room: "Gallery",
            shelf: "Lighting")

        let updated = CaptureRouteSafetyPolicy.updatingAssignment(
            in: prior,
            projectID: "new-project",
            projectName: "New project",
            room: "Dining room",
            shelf: "Seating")

        #expect(updated.destination == .library)
        #expect(updated.projectID == "new-project")
        #expect(updated.projectName == "New project")
        #expect(updated.room == "Dining room")
        #expect(updated.shelf == "Seating")
    }

    @Test func resetsForWorkspaceOrUserChange() {
        let existing = CaptureSessionContextPolicy.resolve(
            existing: nil,
            identity: identity,
            now: start
        )
        let changedWorkspace = CaptureSessionIdentity(
            userID: "designer-a",
            workspaceID: "studio-b"
        )
        let reset = CaptureSessionContextPolicy.resolve(
            existing: existing,
            identity: changedWorkspace,
            now: start.addingTimeInterval(60)
        )

        #expect(reset.visitID != existing.visitID)
        #expect(reset.routing == .empty)
        #expect(reset.identity == changedWorkspace)
    }

    @Test func fourHoursOfInactivityStartsANewVisit() {
        let existing = CaptureSessionContextPolicy.resolve(
            existing: nil,
            identity: identity,
            now: start
        )
        let reset = CaptureSessionContextPolicy.resolve(
            existing: existing,
            identity: identity,
            now: start.addingTimeInterval(4 * 60 * 60)
        )

        #expect(reset.visitID != existing.visitID)
        #expect(reset.routing == .empty)
    }

    @Test @MainActor func explicitResetDropsTheVisitImmediately() throws {
        let suite = "capture-session-context-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = CaptureSessionContextStore(
            defaults: defaults,
            key: "context")

        let first = store.current(identity: identity, now: start)
        store.remember(
            CaptureRoutingMemory(destination: .library, room: "Gallery"),
            identity: identity,
            now: start.addingTimeInterval(30))
        store.reset()
        let reset = store.current(
            identity: identity,
            now: start.addingTimeInterval(60))

        #expect(reset.visitID != first.visitID)
        #expect(reset.routing == .empty)
    }
}

private actor RecordingRouteSyncService: CaptureSyncService {
    private var recordedRoutes: [(UUID, CaptureDestination)] = []

    func enqueue(_ specimenID: UUID) async {}
    func drain() async {}
    func commit(_ specimenID: UUID) async throws -> CommitReceipt {
        CommitReceipt(
            remoteId: "receipt",
            productId: nil,
            destination: .inbox,
            created: true)
    }
    func route(_ specimenID: UUID, to destination: CaptureDestination) async throws {
        recordedRoutes.append((specimenID, destination))
    }
    nonisolated var snapshots: AsyncStream<SyncSnapshot> {
        AsyncStream { continuation in continuation.finish() }
    }

    func routes() -> [(UUID, CaptureDestination)] {
        recordedRoutes
    }
}

struct CaptureBulkRouteTests {
    @Test func sendAllUsesThePerRecordRouteContract() async throws {
        let ids = [UUID(), UUID(), UUID()]
        let sync = RecordingRouteSyncService()

        try await sync.routeAll(ids, to: .inbox)

        let routes = await sync.routes()
        #expect(routes.map { $0.0 } == ids)
        #expect(routes.allSatisfy { $0.1 == .inbox })
    }
}

struct ProgressiveSpecimenPolicyTests {
    @Test func captureModeChoosesRelevantFirstEnrichment() {
        #expect(SpecimenCapturePolicy.nextStep(for: .photo) == .quickConfirm)
        #expect(SpecimenCapturePolicy.nextStep(for: .tag) == .tagOCR)
        #expect(SpecimenCapturePolicy.nextStep(for: .scan) == .codeScan)
        #expect(SpecimenCapturePolicy.nextStep(for: .measure) == .measure)
    }
}

struct DurableScanTransferTests {
    @Test @MainActor func completeScanRequiresReceipt() throws {
        let record = ScanUploadRecord(
            bundlePath: "SiteScans/example",
            scanID: "scan-1",
            roomID: "room-1",
            name: "Living room",
            projectID: nil,
            projectRoomID: nil)
        record.statusRaw = CaptureTransferPhase.complete.rawValue
        record.receiptID = nil

        #expect(record.transferState.phase == .awaitingConfirmation)

        record.applyTransferState(CaptureTransferState(
            phase: .complete,
            progress: 100,
            receiptID: "scan-1"))
        #expect(record.transferState.phase == .complete)
        #expect(record.transferState.receiptID == "scan-1")
    }

    @Test @MainActor
    func scanPendingProjectionIsOwnerScopedAndReceiptAware() throws {
        let store = try CaptureStore.inMemory()
        let owner = try #require(CaptureOwnerIdentity(
            userID: "user-a",
            workspaceID: "workspace-a"
        ))
        let otherOwner = try #require(CaptureOwnerIdentity(
            userID: "user-b",
            workspaceID: "workspace-a"
        ))

        let recoverable = ScanUploadRecord(
            bundlePath: "SiteScans/owned",
            scanID: "scan-owned",
            roomID: "room-owned",
            name: "Owned",
            projectID: nil,
            projectRoomID: nil,
            owner: owner
        )
        recoverable.statusRaw = CaptureTransferPhase.complete.rawValue

        let foreign = ScanUploadRecord(
            bundlePath: "SiteScans/foreign",
            scanID: "scan-foreign",
            roomID: "room-foreign",
            name: "Foreign",
            projectID: nil,
            projectRoomID: nil,
            owner: otherOwner
        )
        let legacy = ScanUploadRecord(
            bundlePath: "SiteScans/legacy",
            scanID: "scan-legacy",
            roomID: "room-legacy",
            name: "Legacy",
            projectID: nil,
            projectRoomID: nil
        )
        _ = store.insertScanUploadRecord(recoverable)
        _ = store.insertScanUploadRecord(foreign)
        _ = store.insertScanUploadRecord(legacy)

        #expect(recoverable.ownerUserID == owner.userID)
        #expect(recoverable.ownerWorkspaceID == owner.workspaceID)
        #expect(recoverable.transferState.phase == .awaitingConfirmation)
        #expect(
            store.scanUploadRecords(owner: owner).map(\.scanID)
                == ["scan-owned"]
        )
        #expect(
            store.scanUploadRecord(scanID: "scan-foreign", owner: owner) == nil
        )
        #expect(
            store.scanUploadRecord(bundlePath: "SiteScans/legacy", owner: owner)
                == nil
        )
    }
}
