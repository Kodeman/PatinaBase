//  VoiceRecordingPolicy.swift
//  CaptureKit
//
//  Rotate the recognizer, never the file. SFSpeechRecognizer caps at ~1 minute
//  of audio per request; the AVAudioFile stays continuous for a segment, and a
//  new segment opens only when an interruption forces one. Boundary word-loss
//  in the on-device draft is acceptable because the audio is the record
//  (R114.1 two-tier trust).

import Foundation

public enum VoiceRecordingPolicy {
    /// Below SFSpeechRecognizer's ~60 s per-request cap, with margin.
    public static let segmentRotationSeconds: TimeInterval = 50
    /// A note ends visibly at this length — never silently.
    public static let maxNoteSeconds: TimeInterval = 20 * 60
    public static let maxSegments: Int = 24

    public static func shouldRotate(elapsedInSegment: TimeInterval) -> Bool {
        elapsedInSegment >= segmentRotationSeconds
    }

    public static func shouldEnd(totalElapsed: TimeInterval, segmentCount: Int) -> Bool {
        totalElapsed >= maxNoteSeconds || segmentCount >= maxSegments
    }

    /// `voice-<noteID>-NNN.m4a`, lowercased to match CaptureMediaPath's rule
    /// that every path segment renders the way Postgres renders a uuid.
    public static func segmentFilename(noteID: UUID, index: Int) -> String {
        let ordinal = String(format: "%03d", index)
        return "voice-\(noteID.uuidString.lowercased())-\(ordinal).m4a"
    }
}
