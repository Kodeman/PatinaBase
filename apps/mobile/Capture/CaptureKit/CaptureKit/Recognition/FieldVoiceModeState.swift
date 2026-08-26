//  FieldVoiceModeState.swift
//  CaptureKit
//
//  C6 — VOICE, the fifth CameraMode (spec §7.4). Tap to start, tap to stop:
//  the design target is a twenty-minute client walk-through, one-handed, while
//  pointing at a room. Nobody holds a button for that, and a slipped finger
//  would end the note. The audio is the record; the transcript is a reading of
//  it (§8.1), so the recogniser failing NEVER stops the recording.

import Foundation

public enum FieldVoiceModeState: Equatable, Sendable {
    case idle
    case recording(elapsed: TimeInterval)
    case interrupted
    case transcriptUnavailable(elapsed: TimeInterval)
    case capped
}

public enum FieldVoiceModeCopy {
    public static func idleLine(visitLabel: String?) -> String {
        guard let visitLabel, !visitLabel.trimmingCharacters(in: .whitespaces).isEmpty else {
            return "Tap to talk. It waits on Today until you place it."
        }
        return "Tap to talk. It lands on \(visitLabel)."
    }

    public static func line(for state: FieldVoiceModeState) -> String {
        switch state {
        case .idle:
            return idleLine(visitLabel: nil)
        case .recording:
            return "Recording. Tap to stop."
        case .interrupted:
            return "Paused — your note is saved. Tap to keep going."
        case .transcriptUnavailable:
            return VoiceNoteCopy.recognitionUnavailable
        case .capped:
            return capReached
        }
    }

    /// Elapsed only. A segment is an implementation detail she has no model for
    /// and no action to take about; the count lives in telemetry instead.
    public static func elapsed(_ seconds: TimeInterval) -> String {
        let total = seconds.isFinite ? max(0, Int(seconds.rounded(.down))) : 0
        return String(format: "%ld:%02ld", total / 60, total % 60)
    }

    public static let capReached = VoiceNoteCopy.capReached
}

public enum FieldVoiceModeMachine {
    /// COMPLETED rotations. `maxSegments` (24) × `segmentRotationSeconds` (50)
    /// is exactly `maxNoteSeconds` (1200), so counting completed rotations makes
    /// both arms of `shouldEnd` trip at the same instant and keeps
    /// `capReached`'s "reached twenty minutes" literally true. Counting OPENED
    /// segments would cap the note at 19:10 under copy that promises 20:00.
    public static func segments(forElapsed elapsed: TimeInterval) -> Int {
        guard elapsed > 0, elapsed.isFinite else { return 0 }
        return Int(elapsed / VoiceRecordingPolicy.segmentRotationSeconds)
    }

    public static func next(_ state: FieldVoiceModeState,
                            elapsed: TimeInterval,
                            segments: Int) -> FieldVoiceModeState {
        if VoiceRecordingPolicy.shouldEnd(totalElapsed: elapsed, segmentCount: segments) {
            return .capped
        }
        switch state {
        case .idle, .capped:
            return state
        case .interrupted:
            return .interrupted
        case .transcriptUnavailable:
            return .transcriptUnavailable(elapsed: elapsed)
        case .recording:
            return .recording(elapsed: elapsed)
        }
    }
}
