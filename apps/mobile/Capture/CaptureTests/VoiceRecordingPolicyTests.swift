//  VoiceRecordingPolicyTests.swift
//  CaptureTests
//
//  SFSpeechRecognizer caps at roughly one minute of audio per request, and the
//  shipped code installed ONE request for a whole session — so any note over a
//  minute silently truncated. The policy rotates the RECOGNIZER, never the
//  audio file: the audio is the record, the transcript is a reading of it.
//
//  shouldEnd is not decoration: Task 8 CALLS it from the rotation check and
//  ends the note visibly. A policy type that is asserted here and never
//  invoked would report green over behaviour that cannot happen.

import Foundation
import Testing
@testable import CaptureKit

struct VoiceRecordingPolicyTests {
    private let note = UUID(uuidString: "3F2504E0-4F89-41D3-9A0C-0305E82C3301")!

    @Test func rotationFiresAtFiftySecondsAndNotBefore() {
        #expect(VoiceRecordingPolicy.segmentRotationSeconds == 50)
        #expect(!VoiceRecordingPolicy.shouldRotate(elapsedInSegment: 49.9))
        #expect(VoiceRecordingPolicy.shouldRotate(elapsedInSegment: 50))
        #expect(VoiceRecordingPolicy.shouldRotate(elapsedInSegment: 61))
    }

    @Test func noteEndsAtTwentyMinutesOrTwentyFourSegments() {
        #expect(!VoiceRecordingPolicy.shouldEnd(totalElapsed: 1199, segmentCount: 3))
        #expect(VoiceRecordingPolicy.shouldEnd(totalElapsed: 1200, segmentCount: 3))
        #expect(VoiceRecordingPolicy.shouldEnd(totalElapsed: 30, segmentCount: 24))
    }

    @Test func segmentFilenameIsZeroPaddedLowercasedAndM4A() {
        #expect(VoiceRecordingPolicy.segmentFilename(noteID: note, index: 0)
                == "voice-3f2504e0-4f89-41d3-9a0c-0305e82c3301-000.m4a")
        #expect(VoiceRecordingPolicy.segmentFilename(noteID: note, index: 12)
                == "voice-3f2504e0-4f89-41d3-9a0c-0305e82c3301-012.m4a")
    }

    @Test func segmentFilenamesCarryAnAllowedMime() {
        let name = VoiceRecordingPolicy.segmentFilename(noteID: note, index: 0)
        #expect(CaptureMediaMime.bucketAllowed.contains(CaptureMediaMime.forFilename(name)))
    }
}
