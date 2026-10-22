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

    @MainActor
    @Test func projectContextPhotoCarriesKindAndFilingRoom() throws {
        let store = try CaptureStore.inMemory()
        let provenance = ContextCaptureProvenance(
            scanSessionId: "scan", projectId: "project", projectRoomId: "legacy-room",
            cameraPoseRowMajor: nil, capturedAt: "2026-10-22T00:00:00Z",
            filingProjectRoomId: "project-room")
        let piece = ContextCaptureService(store: store).enqueuePhoto(
            imageData: Data([0xFF, 0xD8, 0xFF]), width: 100, height: 80, provenance: provenance)
        let payload = FieldCapturePayload(piece: piece, device: .init(
            model: "iPhone", osVersion: "26", appVersion: "test"))
        let json = try #require(try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(payload)) as? [String: Any])
        #expect(json["captureKind"] as? String == "context")
        #expect(piece.venue?.projectId == "project")
        #expect(piece.venue?.projectRoomId == "project-room")
        #expect(piece.venue?.projectRoomId != provenance.projectRoomId)
        #expect(ContextCaptureProvenance.from(provenance.provenanceEntries()) == provenance)
    }

    @MainActor
    @Test func specimenKindIsNotPromotedByProjectPlacement() throws {
        let store = try CaptureStore.inMemory()
        let specimen = store.newDraft()
        specimen.venue = VenueStamp(projectId: "project", projectRoomId: "project-room")
        let payload = FieldCapturePayload(piece: specimen, device: .init(
            model: "iPhone", osVersion: "26", appVersion: "test"))
        let json = try #require(try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(payload)) as? [String: Any])
        // Absent kind retains the server's specimen default.
        #expect(json["captureKind"] == nil || json["captureKind"] as? String == "specimen")
    }

    @MainActor
    @Test func scanRetryRetainsSeparateStorageAndProjectRoomIDs() throws {
        let store = try CaptureStore.inMemory()
        let record = try store.insertScanUploadRecord(ScanUploadRecord(
            bundlePath: "SiteScans/d2", scanID: UUID().uuidString, roomID: "legacy-room",
            name: "Living room", projectID: "project", projectRoomID: "legacy-room",
            filingProjectRoomID: "project-room"))
        try store.save()
        let retained = try #require(store.scanUploadRecord(bundlePath: record.bundlePath))
        #expect(retained.filingProjectRoomID == "project-room")
        #expect(retained.projectRoomID == "legacy-room")
        #expect(retained.roomID == "legacy-room")
        let legacy = ScanUploadRecord(bundlePath: "old", scanID: "scan", roomID: "legacy",
            name: "Old", projectID: "project", projectRoomID: "legacy")
        #expect(legacy.filingProjectRoomID == nil)
    }

    @Test func scanWireUsesFilingRoomAndRetriesCarryIt() throws {
        let source = try SourcePin.readCode("Capture/Features/SiteScan/SupabaseSiteScanService.swift")
        #expect(source.contains("project_room_id: reserved.record.filingProjectRoomID.flatMap(UUID.init(uuidString:))"))
        #expect(source.contains("room_id: reserved.roomID"))
        #expect(source.components(separatedBy: "filingProjectRoomID: record.filingProjectRoomID").count == 3)
    }

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
    @Test func enqueuePhotoProducesInboxOutboxPiece() throws {
        let store = try CaptureStore.inMemory()
        let service = ContextCaptureService(store: store)
        let prov = ContextCaptureProvenance(scanSessionId: "scan-1", projectId: "proj-1",
                                            projectRoomId: "room-1",
                                            cameraPoseRowMajor: Array(repeating: 1.0, count: 16),
                                            capturedAt: "2026-07-17T00:00:00Z")
        let piece = service.enqueuePhoto(imageData: Data([0xFF, 0xD8, 0xFF]),
                                            width: 100, height: 80, provenance: prov)

        #expect(piece.status == .ready)                 // in the outbox
        #expect(piece.destination == .inbox)            // Capture Inbox
        #expect(piece.photos.count == 1)
        #expect(piece.venue?.projectId == "proj-1")
        #expect(piece.venue?.projectRoomId == nil)      // rooms-id NOT in project_room_id (routing note)
        #expect(piece.provenanceRaw["siteScanContext.source"] == "site-scan-context")
        #expect(piece.provenanceRaw["siteScanContext.scanId"] == "scan-1")
        #expect(piece.provenanceRaw["siteScanContext.projectRoomId"] == "room-1")
        #expect(store.outbox().contains { $0.id == piece.id })
    }

    @MainActor
    @Test func enqueueVoiceProducesInboxOutboxPiece() throws {
        let store = try CaptureStore.inMemory()
        let service = ContextCaptureService(store: store)
        let prov = ContextCaptureProvenance(scanSessionId: "scan-1", projectId: "proj-1",
                                            projectRoomId: nil, cameraPoseRowMajor: nil,
                                            capturedAt: "2026-07-17T00:00:00Z")
        let piece = service.enqueueVoice(transcript: "north wall has a return",
                                            audioFilename: "note.m4a", durationSeconds: 3.2,
                                            provenance: prov)
        #expect(piece.status == .ready)
        #expect(piece.destination == .inbox)
        #expect(piece.voiceTranscript == "north wall has a return")
        #expect(piece.voiceDurationSeconds == 3.2)
        #expect(store.outbox().contains { $0.id == piece.id })
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

        let piece = service.enqueueVoice(
            transcript: "north wall",
            audioFilename: nil,
            durationSeconds: 0,
            provenance: provenance
        )

        #expect(piece.ownerUserID == owner.userID)
        #expect(piece.ownerWorkspaceID == owner.workspaceID)
        #expect(store.outbox(owner: owner).map(\.id) == [piece.id])
    }
}
