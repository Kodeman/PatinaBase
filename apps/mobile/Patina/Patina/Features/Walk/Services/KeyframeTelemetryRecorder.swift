//
//  KeyframeTelemetryRecorder.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/Capture/Features/SiteScan/FieldKeyframeRecorder.swift
//    — the ARKit-facing half only (`capture(frame:timestampSeconds:)` steps 0–3
//      and `rowMajorFloat(_:)`). The DECISION SEQUENCE itself was already ported
//      as `Instrument/KeyframeSequencer.swift`; this file only feeds it.
//
//  Conforms to `CaptureFrameSink`, so it never touches the ARSession — it sees
//  exactly one thing per sample: an `ARFrame` and a shared-clock timestamp.
//
//  ── DECISION LANE ONLY: no encode, no disk, no bundle bytes ──────────────────
//  Field's recorder writes a full-resolution HEIC per fired keyframe into
//  `keyframes/`, plus a `keyframe_index.ndjson`, and releases the sequencer's
//  in-flight slot from the writer's completion handler. THAT HALF IS NOT WIRED
//  HERE, deliberately:
//
//    • Writing keyframe images changes what the scan bundle contains, and
//      therefore what eventually leaves the phone when the user requests design
//      services. Patina holds scan bytes strictly on-device until then
//      (`RoomUploadService.holdLocally` / `RoomScanPackage.markHeldLocal`), and
//      growing that payload — 200–400 full-res stills — is the user's call.
//    • The counters and the sharp-frame ratio, which is what the QA scorecard
//      actually consumes, do not need the images to exist.
//
//  So the lane runs the real gate against real frames and keeps the real
//  counters; `.fire` releases its in-flight slot immediately because there is no
//  encoder behind it. One consequence, stated rather than hidden:
//  `telemetry.encodeDropped` can only ever be 0 in this configuration, because
//  `inFlight` never exceeds 1. When the encode lane is wired, that counter starts
//  moving and nothing else about the sequence changes.
//
//  ── Why the sharpness score is a closure, not a value ────────────────────────
//  `KeyframeSequencer.evaluate` invokes it ONLY after the motion trigger and the
//  0.1 s debounce have both passed. Computing the luma grid eagerly and passing
//  a `Double` would silently pay for decimation on every 60 Hz frame and no test
//  would catch it. Keep it lazy.
//

import Foundation
import ARKit
import simd

@MainActor
final class KeyframeTelemetryRecorder: CaptureFrameSink {

    private let sequencer: KeyframeSequencer

    /// The encode lane, or nil. When nil the recorder is decision-only (its
    /// original behaviour, and every unit test's default): the gate runs and the
    /// counters move, but no keyframe bytes are written. When present, a `.fire`
    /// snapshots the frame's ref-counted buffer + pose and hands a full-res HEIC
    /// + `keyframe_index.ndjson` line to the writer's background queue — the
    /// encode half the file header always said would be wired here.
    private let writer: KeyframeBundleWriter?

    /// The most recent gate decision — diagnostics only.
    private(set) var lastDecision: KeyframeDecision?

    /// Running counters (`fired`, `blurRejected`, `rawBlurFailures`,
    /// `encodeDropped`) and the two derived ratios.
    var telemetry: KeyframeTelemetry { sequencer.telemetry }

    /// The scorecard's sharpness input. ⚠ 1.0 when nothing was evaluated — see
    /// `KeyframeTelemetry.sharpFrameRatio`.
    var sharpFrameRatio: Double { sequencer.telemetry.sharpFrameRatio }

    /// Keyframe HEICs written to disk so far (0 when decision-only).
    var framesWritten: Int { writer?.framesWritten ?? 0 }

    /// Whether the encode lane is live (a bundle was provided and its directory
    /// was created). Drives whether the freeze step registers the tar + index.
    var isRecordingBundle: Bool { writer != nil }

    init(gate: KeyframeGate = .standard) {
        self.sequencer = KeyframeSequencer(gate: gate)
        self.writer = nil
    }

    /// Live-capture initializer: also encodes fired keyframes into
    /// `<bundleURL>/keyframes/`. A nil writer (directory creation failed) falls
    /// back to decision-only, so a storage hiccup never aborts the scan.
    init(gate: KeyframeGate = .standard, bundleURL: URL) {
        self.sequencer = KeyframeSequencer(gate: gate)
        self.writer = KeyframeBundleWriter(bundleURL: bundleURL)
    }

    // MARK: - CaptureFrameSink

    func capture(frame: ARFrame, timestampSeconds: TimeInterval) {
        // The gate's debounce is compared on the MONOTONIC frame clock, not the
        // shared session clock — `KeyframeGate.shouldEvaluate` documents that,
        // and a wall-clock value would let a backgrounding gap satisfy it.
        let pose = Self.rowMajor(frame.camera.transform)
        let capturedImage = frame.capturedImage

        let decision = sequencer.evaluate(pose: pose, frameTimestamp: frame.timestamp) {
            guard let grid = LumaProbe.decimatedLuma(capturedImage) else { return nil }
            return Sharpness.varianceOfLaplacian(luma: grid.samples,
                                                 width: grid.width,
                                                 height: grid.height)
        }
        lastDecision = decision

        guard case let .fire(score) = decision else { return }

        guard let writer else {
            // No encoder behind this lane — release the slot in the same turn so
            // the in-flight guard cannot wedge the gate closed. See the header.
            sequencer.noteEncodeFinished()
            return
        }

        // Snapshot the ref-counted buffer + pose ON THE MAIN ACTOR before the
        // ARFrame recycles, then hand the encode to the writer's background queue
        // (the proven posed-photo retention pattern). The slot is released from
        // the writer's completion, so `maxInFlight` throttles the encoder, not
        // the gate. The shared-clock `timestampSeconds` is the ordering key
        // `parse_keyframe_index` sorts on.
        let snapshot = KeyframeSnapshot(
            pixelBuffer: capturedImage,
            cameraTransform: frame.camera.transform,
            intrinsics: frame.camera.intrinsics,
            imageResolution: frame.camera.imageResolution,
            timestampSeconds: timestampSeconds,
            frameTimestamp: frame.timestamp,
            sharpness: score
        )
        writer.enqueue(snapshot) { [weak self] in
            Task { @MainActor in self?.sequencer.noteEncodeFinished() }
        }
    }

    /// Drain pending encodes, close the index, and write `keyframe_summary.json`
    /// from the live counters. Called from the freeze path after the AR session
    /// ends. No-op when decision-only.
    func finish() {
        guard let writer else { return }
        writer.finish()
        let t = sequencer.telemetry
        writer.writeSummary(
            fired: t.fired,
            blurRejected: t.blurRejected,
            rawBlurFailures: t.rawBlurFailures,
            encodeDropped: t.encodeDropped,
            blurRejectionRatio: t.blurRejectionRatio
        )
    }

    /// The keyframe HEICs on disk (tar input for the freeze step). Empty when
    /// decision-only.
    func heicFiles() -> [URL] { writer?.heicFiles() ?? [] }

    // MARK: - Pose helper

    /// Row-major flatten (translation at indices 3, 7, 11) — the layout
    /// `KeyframeGate` and `CameraPose` both index into. Carried verbatim from
    /// Field's `rowMajorFloat(_:)`; a column-major flatten here would put the
    /// translation in the wrong slots and the motion trigger would read pure
    /// rotation as movement.
    static func rowMajor(_ matrix: simd_float4x4) -> [Float] {
        [
            matrix.columns.0.x, matrix.columns.1.x, matrix.columns.2.x, matrix.columns.3.x,
            matrix.columns.0.y, matrix.columns.1.y, matrix.columns.2.y, matrix.columns.3.y,
            matrix.columns.0.z, matrix.columns.1.z, matrix.columns.2.z, matrix.columns.3.z,
            matrix.columns.0.w, matrix.columns.1.w, matrix.columns.2.w, matrix.columns.3.w
        ]
    }
}
