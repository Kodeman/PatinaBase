//
//  KeyframeGate.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/KeyframeGate.swift
//
//  Pure trigger logic for the keyframe recorder. A keyframe auto-fires when the
//  camera has moved ≥ ~0.5 m OR rotated ≥ 15° since the last FIRED keyframe
//  (Field deck SC-07), the frame passes a sharpness threshold, and a
//  minimum-interval debounce has elapsed (so the pricey sharpness evaluation isn't
//  run on every 60 Hz frame while moving).
//
//  Poses are row-major `[Float]` (length 16; translation at indices 3, 7, 11; the
//  upper-left 3×3 is the rotation) — see `CameraPose`. No ARKit, no pixel buffers:
//  the pose-delta + debounce + threshold matrix is unit-testable by hand.
//
//  ISOLATION — `nonisolated` is load-bearing, not decoration. Patina sets
//  SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor at the project level (Field does not),
//  so an unmarked `struct KeyframeGate` here would become implicitly `@MainActor`
//  and this gate would be main-actor-bound — exactly wrong for something the
//  capture callback must call at frame rate. `ScanManifest.swift:22-25` carries
//  `nonisolated` for the same reason. `InstrumentIsolationTests` guards it.
//

import Foundation

nonisolated public struct KeyframeGate: Sendable {

    /// Fire when translation since the last keyframe reaches this (metres).
    public let translationThresholdMeters: Float
    /// …OR rotation reaches this (radians).
    public let rotationThresholdRadians: Float
    /// Minimum seconds between sharpness evaluations (debounce). Compared on the
    /// monotonic frame timestamp (`ARFrame.timestamp` in the live wiring).
    public let minEvaluationInterval: TimeInterval
    /// Minimum `Sharpness.varianceOfLaplacian` score to accept a frame as sharp.
    public let sharpnessThreshold: Double

    public init(translationThresholdMeters: Float,
                rotationThresholdRadians: Float,
                minEvaluationInterval: TimeInterval,
                sharpnessThreshold: Double) {
        self.translationThresholdMeters = translationThresholdMeters
        self.rotationThresholdRadians = rotationThresholdRadians
        self.minEvaluationInterval = minEvaluationInterval
        self.sharpnessThreshold = sharpnessThreshold
    }

    // MARK: - Pose deltas (pure)

    /// Euclidean translation delta between two row-major 4×4 transforms
    /// (translation at indices 3, 7, 11). 0 if either array is too short.
    public static func translationDelta(_ lhs: [Float], _ rhs: [Float]) -> Float {
        guard lhs.count >= 12, rhs.count >= 12 else { return 0 }
        let dx = lhs[3] - rhs[3]
        let dy = lhs[7] - rhs[7]
        let dz = lhs[11] - rhs[11]
        return (dx * dx + dy * dy + dz * dz).squareRoot()
    }

    /// Angle (radians, 0…π) between the rotation blocks of two row-major 4×4
    /// transforms. Uses trace(Rₐᵀ·R_b) = the Frobenius inner product of the two
    /// upper-left 3×3 blocks = 1 + 2·cosθ. 0 if either array is too short.
    public static func rotationDeltaRadians(_ lhs: [Float], _ rhs: [Float]) -> Float {
        guard lhs.count >= 16, rhs.count >= 16 else { return 0 }
        let rot = [0, 1, 2, 4, 5, 6, 8, 9, 10]
        var dot: Float = 0
        for index in rot { dot += lhs[index] * rhs[index] }
        let cosTheta = max(-1, min(1, (dot - 1) / 2))
        return acos(cosTheta)
    }

    // MARK: - Decisions (pure)

    /// Whether the camera has moved enough since the last fired keyframe pose to
    /// consider a new one. Always true when there is no prior pose (first keyframe).
    public func motionTriggered(from last: [Float]?, to current: [Float]) -> Bool {
        guard let last else { return true }
        return KeyframeGate.translationDelta(last, current) >= translationThresholdMeters
            || KeyframeGate.rotationDeltaRadians(last, current) >= rotationThresholdRadians
    }

    /// Debounce: whether enough time has elapsed to run the sharpness evaluation
    /// again. Always true for the first evaluation. Monotonic clock only (a `now`
    /// earlier than `lastEvaluation` returns false).
    public func shouldEvaluate(now: TimeInterval, lastEvaluation: TimeInterval?) -> Bool {
        guard let lastEvaluation else { return true }
        return now - lastEvaluation >= minEvaluationInterval
    }

    /// Sharpness threshold decision.
    public func isSharp(_ score: Double) -> Bool { score >= sharpnessThreshold }

    // MARK: - Locked v1 tuning (documented constants — Field item 4)

    /// ~0.5 m OR 15° trigger; 0.1 s sharpness-evaluation debounce; a conservative
    /// variance-of-Laplacian floor. The sharpness threshold is a coarse proxy on a
    /// decimated luma grid and is DEVICE-TUNABLE — Field's coach + pilot
    /// calibration refine it. Values carried across unchanged from Field's
    /// `KeyframeGate.standard`; pinned by value in `InstrumentKeyframeGateTests`.
    public static let standard = KeyframeGate(
        translationThresholdMeters: 0.5,
        rotationThresholdRadians: 15.0 * .pi / 180.0,  // ≈ 0.2618 rad
        minEvaluationInterval: 0.1,
        sharpnessThreshold: 10.0
    )
}
