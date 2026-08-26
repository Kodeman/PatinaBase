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

    @Test func noVoiceModeCopyEverSaysInbox() {
        let lines = [
            FieldVoiceModeCopy.idleLine(visitLabel: nil),
            FieldVoiceModeCopy.idleLine(visitLabel: "Maple St"),
            FieldVoiceModeCopy.line(for: .interrupted),
            FieldVoiceModeCopy.line(for: .transcriptUnavailable(elapsed: 1)),
            FieldVoiceModeCopy.capReached
        ]
        for line in lines { #expect(!line.lowercased().contains("inbox")) }
    }
}
