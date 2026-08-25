//  VoiceAttachPolicyTests.swift
//  CaptureTests
//
//  The X1-class hole that survived the X1 fix: VoiceNoteSheet.attach() wrote
//  the CURRENT take's audio fields unconditionally, so re-opening the sheet on
//  a synced capture and re-committing a typed edit nulled the segment list —
//  the only key by which stampedVoicePaths can reach voiceAudioRemotePathsRaw.
//  00530's upsert takes voice_audio_path/voice_audio_segments straight from the
//  payload, and an omitted segments key projects to '[]', so that null reached
//  the server and overwrote the pointers to audio still sitting in the bucket.
//  These pin the merge rule the sheet now goes through.

import Foundation
import Testing
@testable import CaptureKit

struct VoiceAttachPolicyTests {

    private let synced = VoiceAttachment(
        audioFilename: "voice-a-000.m4a",
        audioSegments: ["voice-a-000.m4a", "voice-a-001.m4a"],
        transcriptSource: "device",
        durationSeconds: 96)

    // MARK: - The regression itself

    @Test func typedReattachKeepsTheSyncedTakesAudioKeys() {
        let merged = VoiceAttachPolicy.merge(existing: synced, new: nil)
        #expect(merged.audioSegments == ["voice-a-000.m4a", "voice-a-001.m4a"])
        #expect(merged.audioFilename == "voice-a-000.m4a")
        #expect(merged.durationSeconds == 96)
        // The words were typed over a recording that exists; relabelling the
        // source "designer" would deny the recording.
        #expect(merged.transcriptSource == "device")
    }

    @Test func aTakeThatPublishedNothingCannotClearAudio() {
        let empty = VoiceNoteResult(transcript: "", audioFilename: nil, durationSeconds: 0)
        let merged = VoiceAttachPolicy.merge(existing: synced, new: empty)
        #expect(merged.audioSegments == synced.audioSegments)
        #expect(merged.audioFilename == synced.audioFilename)
    }

    @Test func aLegacySingleFileNoteWithNoSegmentListIsAlsoProtected() {
        let legacy = VoiceAttachment(audioFilename: "voice-legacy.m4a",
                                     audioSegments: nil,
                                     transcriptSource: "device",
                                     durationSeconds: 12)
        let merged = VoiceAttachPolicy.merge(existing: legacy, new: nil)
        #expect(merged.audioFilename == "voice-legacy.m4a")
        #expect(merged.transcriptSource == "device")
        #expect(merged.durationSeconds == 12)
    }

    // MARK: - Replacement is still allowed, on the one condition

    @Test func aTakeWithASegmentReplacesEverything() {
        let retake = VoiceNoteResult(transcript: "the warmer bouclé",
                                     audioFilename: "voice-b-000.m4a",
                                     audioSegments: ["voice-b-000.m4a"],
                                     durationSeconds: 30)
        let merged = VoiceAttachPolicy.merge(existing: synced, new: retake)
        #expect(merged.audioSegments == ["voice-b-000.m4a"])
        #expect(merged.audioFilename == "voice-b-000.m4a")
        #expect(merged.transcriptSource == "device")
        #expect(merged.durationSeconds == 30)
    }

    @Test func audioWithNoWordsStillReplacesAndReadsAsDevicePartial() {
        let wordless = VoiceNoteResult(transcript: "",
                                       audioFilename: "voice-c-000.m4a",
                                       audioSegments: ["voice-c-000.m4a"],
                                       durationSeconds: 8)
        let merged = VoiceAttachPolicy.merge(existing: synced, new: wordless)
        #expect(merged.audioSegments == ["voice-c-000.m4a"])
        #expect(merged.transcriptSource == "device_partial")
    }

    // MARK: - A specimen that never had audio

    @Test func aTypedNoteOnAFreshSpecimenIsTheDesignersOwn() {
        let merged = VoiceAttachPolicy.merge(existing: VoiceAttachment(), new: nil)
        #expect(merged.audioSegments == nil)
        #expect(merged.audioFilename == nil)
        #expect(merged.transcriptSource == "designer")
        #expect(merged.durationSeconds == nil)
    }

    @Test func wordsWithNoFileOnAFreshSpecimenAreStillSpoken() {
        // Recognition ran, the AVAudioFile never opened: the transcript is
        // device-spoken even though nothing was written.
        let transcriptOnly = VoiceNoteResult(transcript: "oak base",
                                             audioFilename: nil,
                                             durationSeconds: 11)
        let merged = VoiceAttachPolicy.merge(existing: VoiceAttachment(), new: transcriptOnly)
        #expect(merged.transcriptSource == "device")
        #expect(merged.durationSeconds == 11)
        #expect(merged.audioSegments == nil)
    }

    @Test func wordsWithNoFileDoNotRetimeAnEarlierRecording() {
        let transcriptOnly = VoiceNoteResult(transcript: "oak base",
                                             audioFilename: nil,
                                             durationSeconds: 11)
        let merged = VoiceAttachPolicy.merge(existing: synced, new: transcriptOnly)
        #expect(merged.audioSegments == synced.audioSegments)
        #expect(merged.durationSeconds == 96)
        #expect(merged.transcriptSource == "device")
    }
}
