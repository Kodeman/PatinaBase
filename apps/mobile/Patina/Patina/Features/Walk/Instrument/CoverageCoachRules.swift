//
//  CoverageCoachRules.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/Capture/Features/SiteScan/FieldCoverageCoach.swift
//    — the tunable thresholds (lines 54–60), the frame-delta window (line 74), the
//      warning rules (`updateWarnings`, lines 137–168), the nearest-surface distance
//      (`updateNearestDistance`, lines 128–135), the warning ORDER used by
//      `snapshot()` (line 99), and `trackingHealth()` (lines 117–124).
//
//  Field's coach is `@MainActor` and ARKit-typed (it reads `ARFrame.lightEstimate`,
//  `camera.transform`, `camera.trackingState`). That plumbing stays in the later
//  wiring wave. The RULES are pure arithmetic over plain values and live here, so
//  the thresholds cannot drift and the warning matrix is unit-tested without a
//  device.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public enum CoverageCoachRules {

    // MARK: - Tunable thresholds (carried across from Field unchanged)

    /// Camera speed above which the user is moving too fast (metres/second).
    public static let motionSpeedLimit: Float = 1.5
    /// `ARLightEstimate.ambientIntensity` below which the room reads too dark.
    public static let darkAmbientLumens: Double = 120
    /// Distance to the nearest tracked surface above which the user is too far (m).
    public static let farDistanceMeters: Float = 4.0
    /// Minimum seconds between blur probes (the coach's own throttle — distinct from
    /// `KeyframeGate.minEvaluationInterval`, which is the keyframe lane's).
    public static let blurProbeInterval: TimeInterval = 0.2
    /// Consecutive failing blur probes before `holdSteady` is raised.
    public static let blurStreakToWarn = 3
    /// Sharpness floor for the coach's blur probe — deliberately slightly BELOW the
    /// keyframe gate's threshold (10.0), so the coach nags before the gate silently
    /// starts rejecting frames.
    public static let coachSharpnessFloor: Double = 8.0

    /// Degraded-tracking fraction at or above which health is `poor`.
    public static let poorTrackingFraction = 0.25
    /// Degraded-tracking fraction at or above which health is `fair`.
    public static let fairTrackingFraction = 0.05

    /// Frame deltas outside `(0, 1.0)` are ignored — a non-positive delta is a
    /// duplicate/reordered frame and a ≥ 1 s gap is a backgrounding or stall, and
    /// neither should be credited as dwell.
    public static let maxFrameDeltaSeconds: TimeInterval = 1.0

    // MARK: - Frame admission

    /// Whether a frame delta counts toward dwell and session time.
    /// Mirrors `guard dt > 0, dt < 1.0` exactly (both bounds EXCLUSIVE).
    public static func acceptsFrameDelta(_ dt: TimeInterval) -> Bool {
        dt > 0 && dt < CoverageCoachRules.maxFrameDeltaSeconds
    }

    // MARK: - Tracking health

    /// Degraded fraction of the session → good / fair / poor.
    /// `.good` when no time has accumulated yet.
    public static func trackingHealth(degradedSeconds: TimeInterval,
                                      totalSeconds: TimeInterval) -> Scorecard.TrackingHealth {
        guard totalSeconds > 0 else { return .good }
        let fraction = degradedSeconds / totalSeconds
        if fraction >= CoverageCoachRules.poorTrackingFraction { return .poor }
        if fraction >= CoverageCoachRules.fairTrackingFraction { return .fair }
        return .good
    }

    // MARK: - Blur streak

    /// Advance the coach's consecutive-blur counter for one probe.
    /// A passing probe RESETS the streak to 0 (it is consecutive, not cumulative).
    public static func advanceBlurStreak(_ streak: Int, score: Double) -> Int {
        score < CoverageCoachRules.coachSharpnessFloor ? streak + 1 : 0
    }

    /// Whether a blur probe should run at `now` given the last probe time.
    /// Always true for the first probe.
    public static func shouldProbeBlur(now: TimeInterval, lastProbe: TimeInterval?) -> Bool {
        guard let lastProbe else { return true }
        return now - lastProbe >= CoverageCoachRules.blurProbeInterval
    }

    // MARK: - Nearest surface

    /// Distance from the camera to the nearest tracked surface CENTER.
    /// ⚠ Deliberately the centre, not the extent samples the dwell test uses —
    /// carried faithfully from Field; see the report.
    /// `nil` when nothing is tracked yet (Field represents this as
    /// `.greatestFiniteMagnitude` and then skips the `tooFar` check).
    public static func nearestSurfaceDistance(cameraPosition: SIMD3<Float>,
                                              surfaces: [CaptureSurface]) -> Float? {
        var nearest = Float.greatestFiniteMagnitude
        for surface in surfaces {
            let delta = cameraPosition - surface.center
            let dist = (delta.x * delta.x + delta.y * delta.y + delta.z * delta.z).squareRoot()
            if dist < nearest { nearest = dist }
        }
        return nearest == .greatestFiniteMagnitude ? nil : nearest
    }

    // MARK: - Warnings

    /// The live warning set, in `CoachWarning.allCases` order (the order Field's
    /// `snapshot()` emits, and therefore the order the UI renders).
    ///
    /// - Parameters:
    ///   - speedMetersPerSecond: camera speed, or nil on the first frame (no prior
    ///     position ⇒ Field raises no speed warning).
    ///   - ambientIntensity: `ARLightEstimate.ambientIntensity`, or nil when the
    ///     frame carries no light estimate (⇒ no `tooDark`).
    ///   - nearestSurfaceDistance: nil until surfaces exist (⇒ no `tooFar`).
    ///   - consecutiveBlurProbes: the streak from `advanceBlurStreak`.
    public static func warnings(speedMetersPerSecond: Float?,
                                ambientIntensity: Double?,
                                nearestSurfaceDistance: Float?,
                                consecutiveBlurProbes: Int) -> [CoachWarning] {
        var raised: Set<CoachWarning> = []
        if let speed = speedMetersPerSecond, speed > CoverageCoachRules.motionSpeedLimit {
            raised.insert(.moveSlower)
        }
        if let ambientIntensity, ambientIntensity < CoverageCoachRules.darkAmbientLumens {
            raised.insert(.tooDark)
        }
        if let nearestSurfaceDistance, nearestSurfaceDistance > CoverageCoachRules.farDistanceMeters {
            raised.insert(.tooFar)
        }
        if consecutiveBlurProbes >= CoverageCoachRules.blurStreakToWarn {
            raised.insert(.holdSteady)
        }
        return CoachWarning.allCases.filter { raised.contains($0) }
    }
}
