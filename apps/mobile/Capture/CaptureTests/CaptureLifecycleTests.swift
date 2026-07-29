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
        let specimen = store.newDraft()
        specimen.status = .committed
        specimen.remoteId = nil

        #expect(specimen.transferState.phase == .awaitingConfirmation)
        #expect(specimen.transferState.receiptID == nil)
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
}
