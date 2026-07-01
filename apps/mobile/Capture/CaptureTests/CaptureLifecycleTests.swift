//  CaptureLifecycleTests.swift
//  CaptureTests
//
//  The capture lifecycle reducer is pure — verify its transitions and the
//  terminal-state rule. Foundation contract that all teams rely on.

import Testing
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

    @Test func commitSucceededIsSavedTerminal() {
        let saved = CaptureLifecycle.reduce(.routed, .commitSucceeded)
        #expect(saved == .saved)
        #expect(CaptureLifecycle.isTerminal(saved))
    }

    @Test func commitFailedThenRetryRequeues() {
        let failed = CaptureLifecycle.reduce(.routed, .commitFailed("network"))
        #expect(failed == .failed)
        #expect(CaptureLifecycle.reduce(failed, .retry) == .queued)
    }

    @Test func onlySavedAndInboxAreTerminal() {
        #expect(CaptureLifecycle.isTerminal(.saved))
        #expect(CaptureLifecycle.isTerminal(.inbox))
        #expect(!CaptureLifecycle.isTerminal(.queued))
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
}
