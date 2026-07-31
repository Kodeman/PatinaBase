//
//  ThermalPeakRecorder.swift
//  Patina
//
//  The one instrument input `capture-bundle-spec-v1` §3.2 asks for that nothing
//  in this app was measuring: `session.thermalPeak` — "peak
//  ProcessInfo.thermalState during capture".
//
//  ── Why this exists rather than a one-shot read ──────────────────────────────
//  `RoomCaptureBundleAdapter` already samples `ProcessInfo.thermalState` ONCE,
//  at freeze, into `captureEnvironment.thermalState`. That is an instantaneous
//  reading and is labelled as one. A PEAK is a different claim: it is a
//  statement about the whole session, and a device that ran hot for four
//  minutes and cooled before the user stopped scanning reports `nominal` on a
//  one-shot read. Emitting that as `thermalPeak` would be the flattering answer
//  rather than the true one, so the value is observed instead.
//
//  ── Why a frame sink and not a notification observer ─────────────────────────
//  `ProcessInfo.thermalStateDidChangeNotification` would catch every
//  transition, but it needs an observer token, a deinit, and a hop back to the
//  MainActor from an arbitrary queue. This lane already delivers a MainActor
//  callback stamped on the shared clock, and thermal state is a slow signal —
//  iOS moves between four coarse bands over tens of seconds, never sub-second.
//  Sampling at 1 Hz off the existing fan-out costs one `TimeInterval` compare
//  per frame and cannot miss a band the session actually sat in.
//
//  Registered in `RoomCaptureService.startCapture` alongside the coach, the
//  keyframe recorder and the stream probe; released with them.
//

import Foundation
import ARKit

/// Tracks the highest `ProcessInfo.ThermalState` observed across a capture,
/// sampled at ~1 Hz off the instrument fan-out.
@MainActor
final class ThermalPeakRecorder: CaptureFrameSink {

    /// Seconds between samples. Thermal state is a slow, coarse signal.
    private let sampleInterval: TimeInterval = 1.0

    private var lastSampleSeconds: TimeInterval?

    /// The highest state seen so far. Seeded with the state at construction —
    /// i.e. at scan start — so a session that begins hot and never changes
    /// still reports the truth.
    private(set) var peak: ProcessInfo.ThermalState

    init(initial: ProcessInfo.ThermalState = ProcessInfo.processInfo.thermalState) {
        self.peak = initial
    }

    // MARK: - CaptureFrameSink

    func capture(frame: ARFrame, timestampSeconds: TimeInterval) {
        if let last = lastSampleSeconds, timestampSeconds - last < sampleInterval { return }
        lastSampleSeconds = timestampSeconds
        note(ProcessInfo.processInfo.thermalState)
    }

    // MARK: - Peak

    /// Fold one observation in. Exposed so the ordering can be tested without
    /// heating a phone.
    func note(_ state: ProcessInfo.ThermalState) {
        if state.rawValue > peak.rawValue { peak = state }
    }

    /// The wire value for `session.thermalPeak`. Field's vocabulary verbatim
    /// (`FieldRoomPlanScanSession.thermalLabel`).
    var peakLabel: String { Self.label(for: peak) }

    /// ⚠ `@unknown default` returns `"unknown"`, NOT `"nominal"`. Field maps an
    /// unrecognized state to `"nominal"`; that is the one substitution this
    /// file cannot make, because a future OS could only add states ABOVE
    /// `critical` and reporting the coolest possible band for the hottest
    /// possible reading is exactly the kind of flattering lie `thermalPeak`
    /// exists to rule out. Recording an honest `"unknown"` costs the server a
    /// value it does not branch on (`capture_metrics` records `thermal_peak`
    /// as telemetry).
    static func label(for state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }
}
