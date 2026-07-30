//
//  RoomCoverageCoach.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/Capture/Features/SiteScan/FieldCoverageCoach.swift
//
//  The thin app-side glue between Patina's capture session and the PURE coach
//  logic (`SurfaceCoverageTracker` / `ScorecardEvaluator` in
//  `Features/Walk/Instrument/`). It conforms to both recorder seams —
//  `CaptureRoomUpdateSink` (rebuild the tracked surfaces from the live RoomPlan
//  graph) and `CaptureFrameSink` (accumulate per-surface dwell from the camera
//  pose, raise on-site warnings, accumulate tracking health) — and nothing else
//  in the app reaches past it into the session.
//
//  ── WHAT QUESTION THIS ANSWERS, AND WHY IT IS NOT THE SAME QUESTION AS ───────
//  ── `CoverageAnalyzer`'s ─────────────────────────────────────────────────────
//  `CoverageAnalyzer` asks "how COMPLETE is the model RoomPlan has built?" —
//  wall `completedEdges`, floor area, surface counts. This coach asks "did the
//  camera actually LOOK at each surface, for long enough?" — per-surface dwell
//  from camera position + forward cone. A room can score high on the first and
//  fail the second (RoomPlan happily closes a wall the operator only glanced
//  past) and vice versa.
//
//  They are therefore not redundant, but they ARE two numbers that both call
//  themselves "coverage", so the rule is written down here and enforced by what
//  this file does NOT do:
//
//      `CoverageAnalyzer.overallCoverage` is the ONLY coverage number the UI
//      and analytics ever show. It is `RoomCaptureService.scanProgress`, it
//      drives `ScanThresholdView`, the whisper copy, `scanPartialAccepted` /
//      `scanAbandoned` telemetry, and the "meaningful progress" gate in
//      `ScanViewModel`. None of that changes.
//
//      `SurfaceCoverageTracker.coveragePct` — this coach's number — is
//      INSTRUMENT-INTERNAL. It exists to feed `ScorecardEvaluator`, whose
//      verdict is a QA gate on the captured evidence, not a progress bar. It
//      renders nothing and reports nothing in this wave.
//
//  If a later wave surfaces the scorecard to the user, it must be as a VERDICT
//  ("this scan is usable / has gaps"), named for the gaps it found — never as a
//  second percentage next to the first.
//
//  ── What this coach deliberately does NOT do ─────────────────────────────────
//  Field's coach writes `scorecard.json` into the bundle at `finalize`. This one
//  does not write anything. Two reasons, both blocking rather than stylistic:
//
//    1. `ScanRecoveryService` DELETES a bundle and its SwiftData row when
//       `manifest.json` fails to decode (ScanRecoveryService.swift, the
//       `catch` around `JSONDecoder.scanManifestDecoder.decode`). That is
//       harmless while nothing populates the instrument layer. The moment a
//       producer writes `manifest.scorecard`, one unrecognized enum value — a
//       new `Verdict` case, a new `TrackingHealth` case, a spec revision — turns
//       into deleted user data on next launch. That guard has to be made
//       lenient BEFORE any producer writes instrument fields.
//    2. Patina holds scan bytes strictly on-device until the user requests
//       design services (`RoomUploadService.holdLocally`,
//       `RoomScanPackage.markHeldLocal`). Adding bundle files is a change to
//       what eventually leaves the phone, and is the user's call, not this
//       wave's.
//
//  So the scorecard is produced IN MEMORY and exposed on the service. Persisting
//  it is the next wave's first task, gated on (1).
//
//  Ceiling + floor are SYNTHESIZED from wall geometry rather than depending on a
//  specific-iOS `CapturedRoom.floors` shape — see `SurfaceSynthesis`.
//

import Foundation
import ARKit
import RoomPlan

@MainActor
final class RoomCoverageCoach: CaptureFrameSink {

    // MARK: - Tunables
    //
    // Carried across from Field's `FieldCoverageCoach` unchanged. Field marks
    // them blessable/pilot-calibrated; nothing in Patina has calibrated them, so
    // they stay at Field's values rather than being invented here.

    private let motionSpeedLimit: Float = 1.5          // m/s
    private let darkAmbientLumens: Double = 120        // ARLightEstimate.ambientIntensity
    private let farDistanceMeters: Float = 4.0
    private let blurProbeInterval: TimeInterval = 0.2
    private let blurStreakToWarn = 3
    private let coachSharpnessFloor: Double = 8.0      // slightly below the keyframe gate

    // MARK: - State

    private let tracker: SurfaceCoverageTracker

    private var warnings: Set<CoachWarning> = []
    private var lastPosition: SIMD3<Float>?
    private var lastFrameTimestamp: TimeInterval?
    private var trackingDegradedSeconds: TimeInterval = 0
    private var totalSeconds: TimeInterval = 0

    // Blur-streak probe (throttled; reuses LumaProbe + Sharpness).
    private var lastBlurProbe: TimeInterval?
    private var consecutiveBlur = 0

    // Nearest observed surface distance (for the "too far" nudge).
    private var nearestSurfaceDistance: Float = .greatestFiniteMagnitude

    /// Surfaces seen so far, for diagnostics. Non-zero once RoomPlan has emitted
    /// a graph with at least one wall.
    private(set) var trackedSurfaceCount = 0

    init(config: SurfaceCoverageTracker.Config = .init()) {
        self.tracker = SurfaceCoverageTracker(config: config)
    }

    // MARK: - CaptureFrameSink

    func capture(frame: ARFrame, timestampSeconds: TimeInterval) {
        // dt comes off the MONOTONIC frame clock, not the shared session clock:
        // dwell is a duration, and `timestampSeconds` (wall-clock relative) can
        // drift against frame delivery. Field does the same.
        let frameTime = frame.timestamp
        let dt = lastFrameTimestamp.map { frameTime - $0 } ?? 0
        lastFrameTimestamp = frameTime
        // Ignore non-positive or large gaps (backgrounding, stalls).
        guard dt > 0, dt < 1.0 else { return }
        totalSeconds += dt

        let transform = frame.camera.transform
        let position = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        // ARKit camera looks down its local -Z. (`CameraPose.forward` encodes the
        // same negation for the row-major flatten the keyframe lane uses.)
        let forward = SIMD3<Float>(-transform.columns.2.x, -transform.columns.2.y, -transform.columns.2.z)

        tracker.observe(cameraPosition: position, cameraForward: forward, dt: dt)
        updateNearestDistance(from: position)
        updateWarnings(frame: frame, position: position, dt: dt)

        if case .normal = frame.camera.trackingState {} else {
            trackingDegradedSeconds += dt
        }
    }

    // MARK: - Live snapshot + finalize

    /// The live coverage state (checklist + warnings + surface-weighted %).
    /// INSTRUMENT-INTERNAL — see the file header before rendering any of it.
    func snapshot() -> CoverageSnapshot {
        let checklist = tracker.coverage.map {
            SurfaceStatus(surface: $0.surface.checklistKey, covered: $0.observed)
        }
        // `CoachWarning.allCases` order is the display order contract.
        let ordered = CoachWarning.allCases.filter { warnings.contains($0) }
        return CoverageSnapshot(coveragePct: tracker.coveragePct, checklist: checklist, warnings: ordered)
    }

    /// Build the end-of-scan QA scorecard. IN MEMORY ONLY — nothing is written to
    /// the bundle and nothing enters `manifest.json`; see the file header.
    ///
    /// - Parameters:
    ///   - sharpFrameRatio: from the keyframe lane. ⚠ `KeyframeTelemetry`
    ///     returns 1.0 when NOTHING was evaluated, so an aborted scan reports a
    ///     PERFECT sharpness ratio. That is faithful to Field and is safe only
    ///     because the verdict is also gated on coverage — an aborted scan has
    ///     no observed surfaces and lands `.red` regardless.
    ///   - anchorCount: 0 until anchor entry is wired; `AnchorGate.isUnverified`
    ///     will read the same count.
    @discardableResult
    func finalize(sharpFrameRatio: Double, anchorCount: Int) -> Scorecard {
        ScorecardEvaluator.make(coverage: tracker.coverage,
                                sharpFrameRatio: sharpFrameRatio,
                                trackingHealth: trackingHealth(),
                                anchorCount: anchorCount)
    }

    /// Degraded fraction of the session → good / fair / poor. Thresholds carried
    /// from Field.
    private func trackingHealth() -> Scorecard.TrackingHealth {
        guard totalSeconds > 0 else { return .good }
        let fraction = trackingDegradedSeconds / totalSeconds
        if fraction >= 0.25 { return .poor }
        if fraction >= 0.05 { return .fair }
        return .good
    }

    // MARK: - Warnings

    private func updateNearestDistance(from position: SIMD3<Float>) {
        var nearest: Float = .greatestFiniteMagnitude
        for coverage in tracker.coverage {
            let distance = Self.distance(position, coverage.surface.center)
            if distance < nearest { nearest = distance }
        }
        nearestSurfaceDistance = nearest
    }

    private func updateWarnings(frame: ARFrame, position: SIMD3<Float>, dt: TimeInterval) {
        var next: Set<CoachWarning> = []

        if let last = lastPosition {
            let speed = Self.distance(position, last) / Float(dt)
            if speed > motionSpeedLimit { next.insert(.moveSlower) }
        }
        lastPosition = position

        if let lumens = frame.lightEstimate?.ambientIntensity, Double(lumens) < darkAmbientLumens {
            next.insert(.tooDark)
        }

        // Only meaningful once there are surfaces to be far from.
        if nearestSurfaceDistance != .greatestFiniteMagnitude, nearestSurfaceDistance > farDistanceMeters {
            next.insert(.tooFar)
        }

        // Blur streak — throttled probe on the monotonic frame clock.
        if lastBlurProbe.map({ frame.timestamp - $0 >= blurProbeInterval }) ?? true {
            lastBlurProbe = frame.timestamp
            if let grid = LumaProbe.decimatedLuma(frame.capturedImage) {
                let score = Sharpness.varianceOfLaplacian(luma: grid.samples,
                                                          width: grid.width,
                                                          height: grid.height)
                consecutiveBlur = score < coachSharpnessFloor ? consecutiveBlur + 1 : 0
            }
        }
        if consecutiveBlur >= blurStreakToWarn { next.insert(.holdSteady) }

        warnings = next
    }

    // MARK: - Vector helpers

    private static func distance(_ lhs: SIMD3<Float>, _ rhs: SIMD3<Float>) -> Float {
        let delta = lhs - rhs
        return (delta.x * delta.x + delta.y * delta.y + delta.z * delta.z).squareRoot()
    }
}

// MARK: - CaptureRoomUpdateSink

extension RoomCoverageCoach: CaptureRoomUpdateSink {

    /// Rebuild the tracked surface set from the live parametric graph. Dwell
    /// survives this: `SurfaceCoverageTracker.setSurfaces` keeps progress on
    /// persistent ids and re-keys a re-issued UUID onto the nearest vanished
    /// same-kind surface.
    func capture(room: CapturedRoom, timestampSeconds: TimeInterval) {
        let surfaces = CapturedRoomSurfaceAdapter.surfaces(from: room)
        trackedSurfaceCount = surfaces.count
        tracker.setSurfaces(surfaces)
    }
}
