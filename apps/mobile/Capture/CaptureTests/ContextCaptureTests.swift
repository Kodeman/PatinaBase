//  ContextCaptureTests.swift
//  CaptureTests
//
//  Pure/logic contracts for mid-scan context capture (Field Capture P1 · item 7):
//  the Pro/non-Pro gate, the provenance spatial-address encode/decode, and the
//  outbox enqueue behavior (via an in-memory CaptureStore). No ARKit / mic / network.

import Foundation
import Testing
@testable import CaptureKit

struct ContextCaptureTests {

    // MARK: - Pro / non-Pro gating (R108.2)

    @Test func entryModeGating() {
        #expect(SiteScanEntryMode.forDevice(lidarSupported: true) == .scan)
        #expect(SiteScanEntryMode.forDevice(lidarSupported: false) == .contextOnly)
        #expect(SiteScanEntryMode.scan.producesScan)
        #expect(!SiteScanEntryMode.contextOnly.producesScan)
    }

    // MARK: - Provenance spatial address

    @Test func provenanceRoundTripWithPose() {
        let pose = (0..<16).map(Double.init)
        let prov = ContextCaptureProvenance(scanSessionId: "scan-1", projectId: "proj-1",
                                            projectRoomId: "room-1", cameraPoseRowMajor: pose,
                                            capturedAt: "2026-07-17T00:00:00Z")
        let map = prov.provenanceEntries()
        #expect(map["siteScanContext.source"] == "site-scan-context")
        #expect(map["siteScanContext.scanId"] == "scan-1")
        #expect(map["siteScanContext.projectId"] == "proj-1")
        #expect(map["siteScanContext.projectRoomId"] == "room-1")
        #expect(map["siteScanContext.cameraPose"] == pose.map { String($0) }.joined(separator: ","))
        #expect(ContextCaptureProvenance.from(map) == prov)
    }

    @Test func provenanceNonProHasNoPose() {
        let prov = ContextCaptureProvenance(scanSessionId: "scan-1", projectId: "proj-1",
                                            projectRoomId: nil, cameraPoseRowMajor: nil,
                                            capturedAt: "2026-07-17T00:00:00Z")
        let map = prov.provenanceEntries()
        #expect(map["siteScanContext.cameraPose"] == nil)
        #expect(map["siteScanContext.projectRoomId"] == nil)
        #expect(ContextCaptureProvenance.from(map) == prov)
    }

    @Test func provenanceRejectsForeignMapAndGuardsPoseLength() {
        #expect(ContextCaptureProvenance.from(["foo": "bar"]) == nil)   // not a context provenance
        // A non-16 pose is dropped to nil by the initializer.
        let prov = ContextCaptureProvenance(scanSessionId: nil, projectId: nil, projectRoomId: nil,
                                            cameraPoseRowMajor: [1, 2, 3], capturedAt: "t")
        #expect(prov.cameraPoseRowMajor == nil)
    }

    // MARK: - Outbox enqueue (in-memory store)

    @MainActor
    @Test func enqueuePhotoProducesInboxOutboxSpecimen() throws {
        let store = try CaptureStore.inMemory()
        let service = ContextCaptureService(store: store)
        let prov = ContextCaptureProvenance(scanSessionId: "scan-1", projectId: "proj-1",
                                            projectRoomId: "room-1",
                                            cameraPoseRowMajor: Array(repeating: 1.0, count: 16),
                                            capturedAt: "2026-07-17T00:00:00Z")
        let specimen = service.enqueuePhoto(imageData: Data([0xFF, 0xD8, 0xFF]),
                                            width: 100, height: 80, provenance: prov)

        #expect(specimen.status == .ready)                 // in the outbox
        #expect(specimen.destination == .inbox)            // Capture Inbox
        #expect(specimen.photos.count == 1)
        #expect(specimen.venue?.projectId == "proj-1")
        #expect(specimen.venue?.projectRoomId == nil)      // rooms-id NOT in project_room_id (routing note)
        #expect(specimen.provenanceRaw["siteScanContext.source"] == "site-scan-context")
        #expect(specimen.provenanceRaw["siteScanContext.scanId"] == "scan-1")
        #expect(specimen.provenanceRaw["siteScanContext.projectRoomId"] == "room-1")
        #expect(store.outbox().contains { $0.id == specimen.id })
    }

    @MainActor
    @Test func enqueueVoiceProducesInboxOutboxSpecimen() throws {
        let store = try CaptureStore.inMemory()
        let service = ContextCaptureService(store: store)
        let prov = ContextCaptureProvenance(scanSessionId: "scan-1", projectId: "proj-1",
                                            projectRoomId: nil, cameraPoseRowMajor: nil,
                                            capturedAt: "2026-07-17T00:00:00Z")
        let specimen = service.enqueueVoice(transcript: "north wall has a return",
                                            audioFilename: "note.m4a", durationSeconds: 3.2,
                                            provenance: prov)
        #expect(specimen.status == .ready)
        #expect(specimen.destination == .inbox)
        #expect(specimen.voiceTranscript == "north wall has a return")
        #expect(specimen.voiceDurationSeconds == 3.2)
        #expect(store.outbox().contains { $0.id == specimen.id })
    }

    @MainActor
    @Test func authenticatedContextCaptureStampsOwner() throws {
        let store = try CaptureStore.inMemory()
        let owner = try #require(CaptureOwnerIdentity(
            userID: "designer-a",
            workspaceID: "studio-a"
        ))
        let service = ContextCaptureService(store: store, owner: owner)
        let provenance = ContextCaptureProvenance(
            scanSessionId: "scan-1",
            projectId: "project-1",
            projectRoomId: nil,
            cameraPoseRowMajor: nil,
            capturedAt: "2026-07-17T00:00:00Z"
        )

        let specimen = service.enqueueVoice(
            transcript: "north wall",
            audioFilename: nil,
            durationSeconds: 0,
            provenance: provenance
        )

        #expect(specimen.ownerUserID == owner.userID)
        #expect(specimen.ownerWorkspaceID == owner.workspaceID)
        #expect(store.outbox(owner: owner).map(\.id) == [specimen.id])
    }
}
