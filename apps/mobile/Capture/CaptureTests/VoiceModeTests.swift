//  VoiceModeTests.swift
//  CaptureTests
//
//  C6 (spec §7.4). Tap to start, tap to stop. Elapsed only — never a segment
//  count. The audio records even when the recogniser will not.

import Foundation
import Testing
@testable import CaptureKit

struct VoiceModeTests {

    @Test func theIdleLineStatesThePromiseBeforeSheSpeaks() {
        #expect(FieldVoiceModeCopy.idleLine(visitLabel: "Maple St · Living")
                == "Tap to talk. It lands on Maple St · Living.")
        #expect(FieldVoiceModeCopy.idleLine(visitLabel: nil)
                == "Tap to talk. It waits on Today until you place it.")
    }

    @Test func aWhitespaceOnlyLabelIsTreatedAsAbsent() {
        #expect(FieldVoiceModeCopy.idleLine(visitLabel: " ")
                == "Tap to talk. It waits on Today until you place it.")
        #expect(FieldVoiceModeCopy.idleLine(visitLabel: "\n")
                == "Tap to talk. It waits on Today until you place it.")
    }

    @Test func aPaddedLabelIsTrimmedBeforeItLands() {
        #expect(FieldVoiceModeCopy.idleLine(visitLabel: "  Maple St  ")
                == "Tap to talk. It lands on Maple St.")
    }

    @Test func elapsedIsMinutesAndSecondsAndNeverASegmentCount() {
        #expect(FieldVoiceModeCopy.elapsed(0) == "0:00")
        #expect(FieldVoiceModeCopy.elapsed(134) == "2:14")
        #expect(FieldVoiceModeCopy.elapsed(3600) == "60:00")
        for seconds in [0.0, 134.0, 3600.0] {
            #expect(!FieldVoiceModeCopy.elapsed(seconds).lowercased().contains("seg"))
        }
    }

    @Test func anInterruptionSaysTheNoteIsSafe() {
        #expect(FieldVoiceModeCopy.line(for: .interrupted)
                == "Paused — your note is saved. Tap to keep going.")
    }

    @Test func aDeniedRecogniserStillRecords() {
        #expect(FieldVoiceModeCopy.line(for: .transcriptUnavailable(elapsed: 12))
                == "We'll write this up when it lands.")
    }

    @Test func recordingSaysExactlyThat() {
        #expect(FieldVoiceModeCopy.line(for: .recording(elapsed: 1))
                == "Recording. Tap to stop.")
    }

    @Test func theCapStopsVisiblyAndNeverSilently() {
        #expect(FieldVoiceModeCopy.capReached
                == "This note reached twenty minutes and stopped. Start another when you're ready.")
        #expect(FieldVoiceModeCopy.line(for: .capped) == FieldVoiceModeCopy.capReached)
        // "note ended at 20:00" is withdrawn — it parses as a clock time.
        #expect(!FieldVoiceModeCopy.capReached.contains("20:00"))
    }

    @Test func theMachineCapsOnDurationAndOnSegmentCount() {
        let recording = FieldVoiceModeState.recording(elapsed: 10)
        #expect(FieldVoiceModeMachine.next(recording, elapsed: 20, segments: 1)
                == .recording(elapsed: 20))
        #expect(FieldVoiceModeMachine.next(recording,
                                           elapsed: VoiceRecordingPolicy.maxNoteSeconds,
                                           segments: 3) == .capped)
        #expect(FieldVoiceModeMachine.next(recording, elapsed: 60,
                                           segments: VoiceRecordingPolicy.maxSegments) == .capped)
    }

    @Test func theMachinePreservesEveryOtherArmBelowTheCap() {
        #expect(FieldVoiceModeMachine.next(.idle, elapsed: 5, segments: 0) == .idle)
        #expect(FieldVoiceModeMachine.next(.capped, elapsed: 5, segments: 0) == .capped)
        #expect(FieldVoiceModeMachine.next(.interrupted, elapsed: 5, segments: 0) == .interrupted)
        #expect(FieldVoiceModeMachine.next(.transcriptUnavailable(elapsed: 3), elapsed: 5, segments: 0)
                == .transcriptUnavailable(elapsed: 5))
    }

    @Test func theSegmentCountIsDerivedFromElapsedAndTheTwoCapsCoincide() {
        #expect(FieldVoiceModeMachine.segments(forElapsed: 0) == 0)
        #expect(FieldVoiceModeMachine.segments(forElapsed: 49) == 0)
        #expect(FieldVoiceModeMachine.segments(forElapsed: 50) == 1)
        #expect(FieldVoiceModeMachine.segments(forElapsed: 1_150) == 23)
        // COMPLETED rotations, not opened ones: at exactly maxNoteSeconds both
        // arms of shouldEnd trip together, so "reached twenty minutes" is true.
        #expect(FieldVoiceModeMachine.segments(
            forElapsed: VoiceRecordingPolicy.maxNoteSeconds)
                == VoiceRecordingPolicy.maxSegments)
        #expect(FieldVoiceModeMachine.next(
            .recording(elapsed: 1_149), elapsed: 1_149,
            segments: FieldVoiceModeMachine.segments(forElapsed: 1_149))
                == .recording(elapsed: 1_149))
    }

    @Test func anUnavailableRecorderDeclinesOutLoudInsteadOfGoingQuiet() {
        #expect(FieldVoiceModeCopy.unavailable
                == "Voice notes aren't ready yet. Pick another mode to keep capturing.")
        // Never the flag, never the mechanism, never "AI".
        let words = FieldVoiceModeCopy.unavailable.lowercased()
            .split(whereSeparator: { !$0.isLetter && $0 != "-" })
            .map(String.init)
        #expect(!words.contains("ai"))
        for banned in ["flag", "field-companion", "beta", "enable", "toggle", "permission"] {
            #expect(!FieldVoiceModeCopy.unavailable.lowercased().contains(banned))
        }
    }

    @Test func noVoiceModeCopyEverSaysInbox() {
        let lines = [
            FieldVoiceModeCopy.idleLine(visitLabel: nil),
            FieldVoiceModeCopy.idleLine(visitLabel: "Maple St"),
            FieldVoiceModeCopy.line(for: .idle),
            FieldVoiceModeCopy.line(for: .recording(elapsed: 1)),
            FieldVoiceModeCopy.line(for: .interrupted),
            FieldVoiceModeCopy.line(for: .transcriptUnavailable(elapsed: 1)),
            FieldVoiceModeCopy.capReached,
            FieldVoiceModeCopy.unavailable
        ]
        for line in lines { #expect(!line.lowercased().contains("inbox")) }
    }

    @Test func voiceIsAModeThatProducesNoPhotoAndNoCard() {
        #expect(CameraMode.allCases.map(\.rawValue).contains("voice"))
        // Wave 2 held .voice off the selector so it would not ship a dead pill.
        // Wave 3 builds C6, so the pill earns its place.
        #expect(CameraMode.viewfinderSelectable == [.photo, .tag, .measure, .scan, .voice])
        #expect(!SpecimenCapturePolicy.producesPhoto(.voice))
        for mode in CameraMode.allCases where mode != .voice {
            #expect(SpecimenCapturePolicy.producesPhoto(mode))
        }
    }

    @MainActor
    @Test func aMediaLessVoiceNoteCommitsThroughTheExistingOutbox() throws {
        // ContextCaptureService already proves a media-less specimen commits
        // cleanly (ContextCaptureTests); C6 is that pattern at viewfinder scale.
        let store = try CaptureStore.inMemory()
        let owner = try #require(CaptureOwnerIdentity(userID: "u1", workspaceID: "w1"))
        let service = ContextCaptureService(store: store, owner: owner)
        let created = service.enqueueVoice(
            transcript: "the alcove on the north wall is about forty-two and three quarters",
            audioFilename: "note-0.m4a",
            durationSeconds: 134,
            provenance: ContextCaptureProvenance(scanSessionId: nil, projectId: "p1",
                                                 projectRoomId: nil, cameraPoseRowMajor: nil,
                                                 capturedAt: "2026-08-25T14:14:00Z"))
        #expect(created.photos.isEmpty)
        #expect(created.status == .ready)
        #expect(store.outbox(owner: owner).contains { $0.id == created.id })
    }
}
