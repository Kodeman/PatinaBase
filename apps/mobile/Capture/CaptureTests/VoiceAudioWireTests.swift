//  VoiceAudioWireTests.swift
//  CaptureTests
//
//  No audio has ever left a Field device: SpeechVoiceNoteService declared
//  mediaDirectory (never read) and audioFilename (never assigned), while its
//  own header claimed the raw audio was always kept. Everything downstream —
//  the payload key, the four audio MIME branches, 00234's allow-list, 00235's
//  reader, CaptureStore.missingRequiredMedia — was built and dead-waiting.
//  These tests pin the wire so it stays alive.

import Foundation
import Testing
@testable import CaptureKit

struct VoiceAudioWireTests {

    @Test func voiceNoteResultDerivesSegmentsFromTheLegacyFilename() {
        let result = VoiceNoteResult(transcript: "hello",
                                     audioFilename: "voice-a-000.m4a",
                                     durationSeconds: 12)
        #expect(result.audioSegments == ["voice-a-000.m4a"])
    }

    @Test func voiceNoteResultKeepsAnExplicitSegmentList() {
        let result = VoiceNoteResult(transcript: "hello",
                                     audioFilename: "voice-a-000.m4a",
                                     audioSegments: ["voice-a-000.m4a", "voice-a-001.m4a"],
                                     durationSeconds: 90)
        #expect(result.audioSegments.count == 2)
        #expect(result.audioSegments.first == result.audioFilename)
    }

    @Test func voiceNoteResultWithNoAudioHasNoSegments() {
        let result = VoiceNoteResult(transcript: "hello",
                                     audioFilename: nil,
                                     durationSeconds: 3)
        #expect(result.audioSegments.isEmpty)
    }

    @Test func payloadCarriesEveryVoiceSegment() {
        let piece = Piece()
        piece.voiceTranscript = "the alcove is about forty-two and three quarters"
        piece.voiceAudioFilename = "voice-a-000.m4a"
        piece.voiceAudioSegmentsRaw = ["voice-a-000.m4a", "voice-a-001.m4a"]
        piece.voiceDurationSeconds = 91
        let payload = FieldCapturePayload(piece: piece,
                                          device: FieldCapturePayload.Device())
        #expect(payload.voice?.audioPath == "voice-a-000.m4a")
        #expect(payload.voice?.audioSegments == ["voice-a-000.m4a", "voice-a-001.m4a"])
    }

    @Test func payloadOmitsVoiceWhenNothingWasRecorded() {
        let piece = Piece()
        let payload = FieldCapturePayload(piece: piece,
                                          device: FieldCapturePayload.Device())
        #expect(payload.voice == nil)
    }

    @Test func payloadCarriesTheCaptureKindTheServerChecks() {
        let piece = Piece()
        piece.captureKindRaw = "note"
        let payload = FieldCapturePayload(piece: piece,
                                          device: FieldCapturePayload.Device())
        #expect(payload.captureKind == "note")
    }

    @Test func payloadOmitsAnUnsetCaptureKindSoTheServerDefaultApplies() {
        let payload = FieldCapturePayload(piece: Piece(),
                                          device: FieldCapturePayload.Device())
        #expect(payload.captureKind == nil)
    }

    @Test func schemaVersionIsBumpedForTheNewReaderSideKeys() {
        // Wave 3 (Task 8) bumped this again, 2 -> 3, to add the visit/suggestion
        // envelopes and voice.noteSetting. W1A-08 bumped it again, 3 -> 4, for
        // the confirmations/proposals projection (00669).
        #expect(FieldCapturePayload.currentSchemaVersion == 4)
    }

    @Test @MainActor func missingRequiredMediaChecksEverySegmentInOrder() throws {
        let store = try CaptureStore.inMemory()
        let piece = Piece()
        piece.voiceAudioFilename = "voice-a-000.m4a"
        piece.voiceAudioSegmentsRaw = ["voice-a-000.m4a", "voice-a-001.m4a"]
        let missing = store.missingRequiredMedia(for: piece)
        #expect(missing == ["voice-a-000.m4a", "voice-a-001.m4a"])
    }

    @Test @MainActor func anUploadedSegmentIsExemptedLikeAnUploadedPhoto() throws {
        let store = try CaptureStore.inMemory()
        let piece = Piece()
        piece.voiceAudioFilename = "voice-a-000.m4a"
        piece.voiceAudioSegmentsRaw = ["voice-a-000.m4a", "voice-a-001.m4a"]
        piece.voiceAudioRemotePathsRaw = ["uid/tok/voice-a-000.m4a"]
        let missing = store.missingRequiredMedia(for: piece)
        #expect(missing == ["voice-a-001.m4a"])
    }
}
