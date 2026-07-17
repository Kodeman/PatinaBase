//  FieldCoverageCoach.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 5 — coach + QA gate
//
//  Thin app-side glue between the shared rig and the PURE coach logic
//  (`SurfaceCoverageTracker` / `ScorecardEvaluator`, CaptureKit). Conforms to the
//  item-3 seams — `CaptureRoomUpdateSink` (rebuild the tracked surfaces from the
//  live RoomPlan graph) and `CaptureFrameSink` (accumulate per-surface dwell from
//  the camera pose + raise on-site warnings). Produces the live `CoverageSnapshot`
//  the F2 coach renders and the end-of-scan `Scorecard` (persisted to
//  `scorecard.json`, carried in `FieldScanResult` for the F3 review).
//
//  P1 SCOPE CALL (blessable): coverage is tracked PARAMETRICALLY (per wall / floor /
//  ceiling / opening from the CapturedRoom graph), and surfaced as a checklist +
//  plan-style shading — NOT full Metal mesh painting. The deck's SC-09 intent ("did
//  I get everything") is answered by the per-surface checklist + verdict at P1;
//  live mesh-painted shading is deferred (months of Metal work that buys neither
//  accuracy pillar). Logged for review.
//
//  Ceiling + floor are SYNTHESIZED from wall geometry (top/base Y at the wall
//  centroid) rather than depending on a specific-iOS `CapturedRoom.floors` shape —
//  keeps the derivation stable across the pinned OS matrix.

import Foundation
import CaptureKit
import os.log

#if canImport(ARKit)
import ARKit
#if canImport(RoomPlan)
import RoomPlan
#endif

@MainActor
final class FieldCoverageCoach: CaptureFrameSink {

    private let tracker: SurfaceCoverageTracker
    private let scorecardURL: URL
    private let logger = Logger(subsystem: "cloud.patina.field", category: "CoverageCoach")

    // Warning + motion state (MainActor).
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

    // Tunable thresholds (blessable — pilot calibration refines).
    private let motionSpeedLimit: Float = 1.5          // m/s
    private let darkAmbientLumens: Double = 120        // ARLightEstimate.ambientIntensity
    private let farDistanceMeters: Float = 4.0
    private let blurProbeInterval: TimeInterval = 0.2
    private let blurStreakToWarn = 3
    private let coachSharpnessFloor: Double = 8.0      // slightly below the keyframe gate

    init(bundleDir: URL, config: SurfaceCoverageTracker.Config = .init()) {
        self.tracker = SurfaceCoverageTracker(config: config)
        self.scorecardURL = bundleDir.appendingPathComponent("scorecard.json", isDirectory: false)
    }

    // MARK: - CaptureFrameSink

    func capture(frame: ARFrame, timestampSeconds: TimeInterval) {
        let ft = frame.timestamp
        let dt = lastFrameTimestamp.map { ft - $0 } ?? 0
        lastFrameTimestamp = ft
        // Ignore non-positive or large gaps (backgrounding, stalls).
        guard dt > 0, dt < 1.0 else { return }
        totalSeconds += dt

        let transform = frame.camera.transform
        let position = SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z)
        // ARKit camera looks down its local -Z.
        let forward = SIMD3<Float>(-transform.columns.2.x, -transform.columns.2.y, -transform.columns.2.z)

        tracker.observe(cameraPosition: position, cameraForward: forward, dt: dt)
        updateNearestDistance(from: position)
        updateWarnings(frame: frame, position: position, dt: dt)

        // Tracking-health accumulation.
        if case .normal = frame.camera.trackingState {} else {
            trackingDegradedSeconds += dt
        }
    }

    // MARK: - Live snapshot + finalize

    /// The live coverage state for the F2 coach (checklist + warnings + %).
    func snapshot() -> CoverageSnapshot {
        let checklist = tracker.coverage.map {
            SurfaceStatus(surface: $0.surface.checklistKey, covered: $0.observed)
        }
        let ordered = CoachWarning.allCases.filter { warnings.contains($0) }
        return CoverageSnapshot(coveragePct: tracker.coveragePct, checklist: checklist, warnings: ordered)
    }

    /// Build + persist the end-of-scan scorecard. Called by the rig after the
    /// ARSession pauses. `anchorCount` is 0 until item 6 wires anchor entry.
    @discardableResult
    func finalize(sharpFrameRatio: Double, anchorCount: Int) -> Scorecard {
        let scorecard = ScorecardEvaluator.make(coverage: tracker.coverage,
                                                sharpFrameRatio: sharpFrameRatio,
                                                trackingHealth: trackingHealth(),
                                                anchorCount: anchorCount)
        if let data = try? JSONEncoder().encode(scorecard) {
            try? data.write(to: scorecardURL, options: .atomic)
        }
        return scorecard
    }

    private func trackingHealth() -> Scorecard.TrackingHealth {
        // Degraded fraction of the session → good / fair / poor.
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
            let d = Self.distance(position, coverage.surface.center)
            if d < nearest { nearest = d }
        }
        nearestSurfaceDistance = nearest
    }

    private func updateWarnings(frame: ARFrame, position: SIMD3<Float>, dt: TimeInterval) {
        var next: Set<CoachWarning> = []

        // Motion speed.
        if let last = lastPosition {
            let speed = Self.distance(position, last) / Float(dt)
            if speed > motionSpeedLimit { next.insert(.moveSlower) }
        }
        lastPosition = position

        // Low light.
        if let lumens = frame.lightEstimate?.ambientIntensity, Double(lumens) < darkAmbientLumens {
            next.insert(.tooDark)
        }

        // Distance (only meaningful once we have surfaces).
        if nearestSurfaceDistance != .greatestFiniteMagnitude, nearestSurfaceDistance > farDistanceMeters {
            next.insert(.tooFar)
        }

        // Blur streak — throttled probe.
        if lastBlurProbe.map({ frame.timestamp - $0 >= blurProbeInterval }) ?? true {
            lastBlurProbe = frame.timestamp
            if let grid = LumaProbe.decimatedLuma(frame.capturedImage) {
                let score = Sharpness.varianceOfLaplacian(luma: grid.samples, width: grid.width, height: grid.height)
                consecutiveBlur = score < coachSharpnessFloor ? consecutiveBlur + 1 : 0
            }
        }
        if consecutiveBlur >= blurStreakToWarn { next.insert(.holdSteady) }

        warnings = next
    }

    // MARK: - Vector helpers

    private static func distance(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
        let d = a - b
        return (d.x * d.x + d.y * d.y + d.z * d.z).squareRoot()
    }
}

#if canImport(RoomPlan)
extension FieldCoverageCoach: CaptureRoomUpdateSink {

    func capture(room: CapturedRoom, timestampSeconds: TimeInterval) {
        tracker.setSurfaces(Self.surfaces(from: room))
    }

    /// Parametric surfaces from the RoomPlan graph: each wall, a synthesized floor +
    /// ceiling (from the wall vertical extent at the room centroid), and each
    /// opening (doors + windows + openings). Bearing labels are relative + ESCALATE
    /// placeholders (`SurfaceLabeler`).
    private static func surfaces(from room: CapturedRoom) -> [CaptureSurface] {
        let walls = room.walls
        guard !walls.isEmpty else { return [] }

        // Room centroid + vertical extent from wall geometry.
        var sum = SIMD3<Float>(0, 0, 0)
        var minY: Float = .greatestFiniteMagnitude
        var maxY: Float = -.greatestFiniteMagnitude
        for wall in walls {
            let c = wall.transform.columns.3
            sum += SIMD3<Float>(c.x, c.y, c.z)
            let halfH = wall.dimensions.y / 2
            minY = min(minY, c.y - halfH)
            maxY = max(maxY, c.y + halfH)
        }
        let centroid = sum / Float(walls.count)

        var surfaces: [CaptureSurface] = []

        for wall in walls {
            let c = wall.transform.columns.3
            let center = SIMD3<Float>(c.x, c.y, c.z)
            let n = wall.transform.columns.2
            let bearing = SurfaceLabeler.bearing(center: center, centroid: centroid)
            surfaces.append(CaptureSurface(
                id: wall.identifier.uuidString,
                kind: .wall,
                center: center,
                normal: SIMD3<Float>(n.x, n.y, n.z),
                checklistKey: "wall:\(bearing)",
                displayLabel: "\(bearing.capitalized) wall"))
        }

        // Synthesized floor + ceiling.
        surfaces.append(CaptureSurface(
            id: "floor", kind: .floor,
            center: SIMD3<Float>(centroid.x, minY, centroid.z),
            normal: SIMD3<Float>(0, 1, 0),
            checklistKey: "floor", displayLabel: "Floor"))
        surfaces.append(CaptureSurface(
            id: "ceiling", kind: .ceiling,
            center: SIMD3<Float>(centroid.x, maxY, centroid.z),
            normal: SIMD3<Float>(0, -1, 0),
            checklistKey: "ceiling", displayLabel: "Ceiling"))

        // Openings: doors + windows + openings, numbered in encounter order.
        let openings = room.doors + room.windows + room.openings
        for (index, opening) in openings.enumerated() {
            let c = opening.transform.columns.3
            let n = opening.transform.columns.2
            let number = index + 1
            surfaces.append(CaptureSurface(
                id: opening.identifier.uuidString,
                kind: .opening,
                center: SIMD3<Float>(c.x, c.y, c.z),
                normal: SIMD3<Float>(n.x, n.y, n.z),
                checklistKey: "opening:\(number)",
                displayLabel: "Opening \(number)"))
        }

        return surfaces
    }
}
#endif
#endif
