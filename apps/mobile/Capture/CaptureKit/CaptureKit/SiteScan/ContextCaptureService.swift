//  ContextCaptureService.swift
//  CaptureKit
//
//  Enqueues a mid-scan context capture (detail photo or voice note) into the EXISTING
//  offline-first outbox (Field Capture P1 · item 7). It produces a `Specimen` routed
//  to the Capture Inbox, exactly like the core capture flow — set the media +
//  provenance, mark `.ready`, save; `CaptureSyncService.drain()` then uploads it to
//  `capture-media` + `commit_field_capture` → `field_captures`. This is a
//  capture-SOURCE extension: no new sync plumbing, no migration, no change to the
//  frozen `FieldCapturePayload` wire contract.
//
//  Lives in CaptureKit (operates only on CaptureKit types — CaptureStore / Specimen /
//  VenueStamp / ContextCaptureProvenance) so the enqueue behavior is unit-testable
//  with `CaptureStore.inMemory()`. The app target captures the media (AR frame / mic)
//  and calls this; the media DATA source is the only device-only part.

import Foundation

@MainActor
public final class ContextCaptureService {

    private let store: CaptureStore
    private let owner: CaptureOwnerIdentity?

    public init(store: CaptureStore, owner: CaptureOwnerIdentity? = nil) {
        self.store = store
        self.owner = owner
    }

    /// Enqueue a detail-photo context capture. `imageData` is written to the media
    /// dir; a `CapturePhoto` is attached and the draft is routed to the Inbox.
    @discardableResult
    public func enqueuePhoto(imageData: Data, width: Int, height: Int,
                             filenameExtension: String = "jpg",
                             provenance: ContextCaptureProvenance) -> Specimen {
        let draft = store.newDraft(owner: owner)
        apply(provenance, to: draft)
        let filename = "\(UUID().uuidString.lowercased()).\(filenameExtension)"
        try? store.writeMedia(imageData, filename: filename)
        let photo = CapturePhoto(filename: filename, width: width, height: height,
                                 isPrimary: true, order: 0, captureModeRaw: CameraMode.photo.rawValue)
        photo.specimen = draft
        draft.photos.append(photo)
        finalize(draft)
        return draft
    }

    /// Enqueue a voice-note context capture. `audioFilename` may be nil (transcript
    /// only) when the audio file couldn't be persisted.
    @discardableResult
    public func enqueueVoice(transcript: String, audioFilename: String?,
                             audioSegments: [String] = [],
                             transcriptSource: String? = nil,
                             durationSeconds: Double,
                             provenance: ContextCaptureProvenance) -> Specimen {
        let draft = store.newDraft(owner: owner)
        apply(provenance, to: draft)
        draft.voiceTranscript = transcript.isEmpty ? nil : transcript
        draft.voiceAudioFilename = audioFilename
        draft.voiceAudioSegmentsRaw = audioSegments
        draft.voiceTranscriptSourceRaw = transcriptSource
        draft.captureKindRaw = "context"
        draft.voiceDurationSeconds = durationSeconds
        finalize(draft)
        return draft
    }

    private func apply(_ provenance: ContextCaptureProvenance, to draft: Specimen) {
        draft.provenanceRaw = provenance.provenanceEntries()
        // Route on project_id only (projects-compatible); the SiteScan rooms-id +
        // scan-id ride in provenance (see ContextCaptureProvenance routing note).
        draft.venue = VenueStamp(projectId: provenance.projectId)
        draft.destination = .inbox
    }

    private func finalize(_ draft: Specimen) {
        draft.status = .ready   // → store.outbox(), picked up by the next drain()
        try? store.save()
    }
}
