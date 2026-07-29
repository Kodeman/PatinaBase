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


    @Test @MainActor func sweepProtectionIncludesEveryUnconfirmedState() throws {
        let store = try CaptureStore.inMemory()
        func record(_ suffix: String) -> ScanUploadRecord {
            ScanUploadRecord(
                bundlePath: "SiteScans/\(suffix)",
                scanID: "scan-\(suffix)",
                roomID: "room-\(suffix)",
                name: suffix,
                projectID: nil,
                projectRoomID: nil
            )
        }

        let queued = record("queued")
        let rejected = record("rejected")
        rejected.applyTransferState(CaptureTransferState(
            phase: .rejected,
            errorMessage: "Review required"
        ))
        let receiptlessComplete = record("receiptless")
        receiptlessComplete.statusRaw = CaptureTransferPhase.complete.rawValue
        let confirmed = record("confirmed")
        confirmed.applyTransferState(CaptureTransferState(
            phase: .complete,
            progress: 100,
            receiptID: "scan-confirmed"
        ))
        [queued, rejected, receiptlessComplete, confirmed].forEach {
            _ = store.insertScanUploadRecord($0)
        }

        #expect(store.scanBundlePathsProtectedFromSweep() == [
            queued.bundlePath,
            rejected.bundlePath,
            receiptlessComplete.bundlePath
        ])
    }

    @Test @MainActor func durableCompletionRequiresAndPersistsReceipt() throws {
        let store = try CaptureStore.inMemory()
        let record = store.insertScanUploadRecord(ScanUploadRecord(
            bundlePath: "SiteScans/receipt-gate",
            scanID: "scan-receipt-gate",
            roomID: "room-receipt-gate",
            name: "Receipt gate",
            projectID: nil,
            projectRoomID: nil
        ))
        let artifacts = [ScanArtifactUploadState(
            kind: "usdz",
            relativePath: "scan.usdz",
            mimeType: "model/vnd.usdz+zip",
            status: .uploaded
        )]

        #expect(throws: CaptureTransferTransitionError.missingReceipt) {
            try store.persistCompletedScanUploadRecord(
                record,
                artifacts: artifacts,
                receiptID: "  "
            )
        }
        #expect(record.transferState.phase != .complete)

        try store.persistCompletedScanUploadRecord(
            record,
            artifacts: artifacts,
            receiptID: " scan-receipt-gate "
        )
        let persisted = try #require(store.scanUploadRecord(
            scanID: "scan-receipt-gate"
        ))
        #expect(persisted.transferState.phase == .complete)
        #expect(persisted.receiptID == "scan-receipt-gate")
    }

    @Test @MainActor func failedCompletionSaveRestoresLiveRecord() throws {
        struct ExpectedSaveFailure: Error {}
        let store = try CaptureStore.inMemory()
        let original = ScanArtifactUploadState(
            kind: "mesh",
            relativePath: "mesh.ply",
            mimeType: "application/octet-stream",
            status: .pending
        )
        let record = ScanUploadRecord(
            bundlePath: "SiteScans/save-failure",
            scanID: "scan-save-failure",
            roomID: "room-save-failure",
            name: "Save failure",
            projectID: nil,
            projectRoomID: nil,
            artifacts: [original]
        )
        record.applyTransferState(CaptureTransferState(
            phase: .retryableFailure,
            errorMessage: "offline",
            retryCount: 2
        ))
        let priorUpdatedAt = record.updatedAt

        #expect(throws: ExpectedSaveFailure.self) {
            try store.persistCompletedScanUploadRecord(
                record,
                artifacts: [],
                receiptID: "scan-save-failure",
                persistence: { throw ExpectedSaveFailure() }
            )
        }
        #expect(record.transferState.phase == .retryableFailure)
        #expect(record.lastError == "offline")
        #expect(record.retryCount == 2)
        #expect(record.receiptID == nil)
        #expect(record.artifacts == [original])
        #expect(record.updatedAt == priorUpdatedAt)
    }

    @Test @MainActor
    func orphanCompletionPreservesTerminalAndFailurePhases() throws {
        let store = try CaptureStore.inMemory()
        let artifact = ScanArtifactUploadState(
            kind: "mesh",
            relativePath: "mesh.ply",
            mimeType: "application/octet-stream",
            status: .uploaded
        )
        func record(_ suffix: String) -> ScanUploadRecord {
            store.insertScanUploadRecord(ScanUploadRecord(
                bundlePath: "SiteScans/\(suffix)",
                scanID: "scan-\(suffix)",
                roomID: "room-\(suffix)",
                name: suffix,
                projectID: nil,
                projectRoomID: nil
            ))
        }

        let complete = record("complete")
        complete.applyTransferState(CaptureTransferState(
            phase: .complete,
            receiptID: "scan-complete"
        ))
        let rejected = record("rejected")
        rejected.applyTransferState(CaptureTransferState(
            phase: .rejected,
            errorMessage: "Review"
        ))
        let failed = record("failed")
        failed.applyTransferState(CaptureTransferState(
            phase: .retryableFailure,
            errorMessage: "Offline",
            retryCount: 1
        ))

        #expect(!store.applyBackgroundScanArtifactCompletion(
            artifact,
            to: complete
        ))
        #expect(!store.applyBackgroundScanArtifactCompletion(
            artifact,
            to: rejected
        ))
        #expect(store.applyBackgroundScanArtifactCompletion(
            artifact,
            to: failed
        ))
        #expect(complete.artifacts.isEmpty)
        #expect(rejected.artifacts.isEmpty)
        #expect(failed.transferState.phase == .retryableFailure)
        #expect(failed.lastError == "Offline")
        #expect(failed.artifacts == [artifact])
    }

    @Test @MainActor func explicitRetryResetsOnlyFailedArtifacts() {
        let record = ScanUploadRecord(
            bundlePath: "SiteScans/retry",
            scanID: "scan-retry",
            roomID: "room-retry",
            name: "Retry",
            projectID: nil,
            projectRoomID: nil,
            artifacts: [
                ScanArtifactUploadState(
                    kind: "usdz",
                    relativePath: "scan.usdz",
                    mimeType: "model/vnd.usdz+zip",
                    status: .uploaded,
                    attempts: 1
                ),
                ScanArtifactUploadState(
                    kind: "mesh",
                    relativePath: "mesh.ply",
                    mimeType: "application/octet-stream",
                    status: .failed,
                    attempts: 3,
                    lastError: "offline"
                )
            ]
        )
        record.applyTransferState(CaptureTransferState(
            phase: .rejected,
            progress: 100,
            errorMessage: "Review required",
            retryCount: 2
        ))

        record.prepareForRetry()

        #expect(record.transferState.phase == .queued)
        #expect(record.retryCount == 2)
        #expect(record.artifacts[0].status == .uploaded)
        #expect(record.artifacts[0].attempts == 1)
        #expect(record.artifacts[1].status == .pending)
        #expect(record.artifacts[1].attempts == 0)
        #expect(record.artifacts[1].lastError == nil)
    }

    @Test @MainActor func missingCaptureMediaThrowsExplicitReviewError() throws {
        let store = try CaptureStore.inMemory()
        let specimen = store.newDraft()
        let token = UUID().uuidString
        let photoFilename = "missing-photo-\(token).heic"
        let voiceFilename = "missing-voice-\(token).m4a"
        let photo = CapturePhoto(filename: photoFilename)
        photo.specimen = specimen
        specimen.photos.append(photo)
        specimen.voiceAudioFilename = voiceFilename
        defer {
            try? FileManager.default.removeItem(
                at: store.mediaURL(for: photoFilename)
            )
            try? FileManager.default.removeItem(
                at: store.mediaURL(for: voiceFilename)
            )
        }

        #expect(throws: CaptureMediaAvailabilityError.missingLocalMedia([
            photoFilename,
            voiceFilename
        ])) {
            try store.validateRequiredMedia(for: specimen)
        }

        try store.writeMedia(Data([0x01]), filename: photoFilename)
        try store.writeMedia(Data([0x02]), filename: voiceFilename)
        try store.validateRequiredMedia(for: specimen)

        try FileManager.default.removeItem(
            at: store.mediaURL(for: photoFilename)
        )
        photo.remotePath = "remote/\(photoFilename)"
        try store.validateRequiredMedia(for: specimen)
    }
}
