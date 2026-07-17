//  KeyframeGate.swift
//  CaptureKit
//
//  Pure trigger logic for the Field keyframe recorder (Field Capture P1 · item 4).
//  A keyframe auto-fires when the camera has moved ≥ ~0.5 m OR rotated ≥ 15° since
//  the last FIRED keyframe (SC-07), the frame passes a sharpness threshold, and a
//  minimum-interval debounce has elapsed (so the pricey sharpness evaluation isn't
//  run on every 60 Hz frame while moving). Extracted here — pure, no ARKit, no
//  pixel buffers — so the pose-delta + debounce + threshold matrix is unit-testable
//  exactly like `FieldPhotoGate` / `CaptureCadence`. The app-target
//  `FieldKeyframeRecorder` supplies the poses (row-major 4×4 from
//  `ARCamera.transform`), the clock, and the sharpness score (`Sharpness`).
//
//  Poses are row-major `[Float]` (length 16; translation at indices 3, 7, 11; the
//  upper-left 3×3 is the rotation) — the same row-major layout the depth/photo
//  index lanes already use, so tests build them by hand without simd.

import Foundation

public struct KeyframeGate: Sendable {

    /// Fire when translation since the last keyframe reaches this (metres).
    public let translationThresholdMeters: Float
    /// …OR rotation reaches this (radians).
    public let rotationThresholdRadians: Float
    /// Minimum seconds between sharpness evaluations (debounce). Compared on the
    /// monotonic `ARFrame.timestamp`.
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
    public static func translationDelta(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count >= 12, b.count >= 12 else { return 0 }
        let dx = a[3] - b[3]
        let dy = a[7] - b[7]
        let dz = a[11] - b[11]
        return (dx * dx + dy * dy + dz * dz).squareRoot()
    }

    /// Angle (radians, 0…π) between the rotation blocks of two row-major 4×4
    /// transforms. Uses trace(Rₐᵀ·R_b) = the Frobenius inner product of the two
    /// upper-left 3×3 blocks = 1 + 2·cosθ. 0 if either array is too short.
    public static func rotationDeltaRadians(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count >= 16, b.count >= 16 else { return 0 }
        let rot = [0, 1, 2, 4, 5, 6, 8, 9, 10]
        var dot: Float = 0
        for i in rot { dot += a[i] * b[i] }
        let cosTheta = max(-1, min(1, (dot - 1) / 2))
        return acos(cosTheta)
    }

    // MARK: - Decisions (pure)

    /// Whether the camera has moved enough since the last fired keyframe pose to
    /// consider a new one. Always true when there is no prior pose (first keyframe).
    public func motionTriggered(from last: [Float]?, to current: [Float]) -> Bool {
        guard let last else { return true }
        return Self.translationDelta(last, current) >= translationThresholdMeters
            || Self.rotationDeltaRadians(last, current) >= rotationThresholdRadians
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

    // MARK: - Locked v1 tuning (documented constants — item 4)

    /// ~0.5 m OR 15° trigger; 0.1 s sharpness-evaluation debounce; a conservative
    /// variance-of-Laplacian floor. The sharpness threshold is a coarse proxy on a
    /// decimated luma grid (like the coverage heuristic) and is DEVICE-TUNABLE —
    /// item 5's coach + pilot calibration refine it; item 4 records the resulting
    /// blur-rejection ratio so tuning has data.
    public static let standard = KeyframeGate(
        translationThresholdMeters: 0.5,
        rotationThresholdRadians: 15.0 * .pi / 180.0,  // ≈ 0.2618 rad
        minEvaluationInterval: 0.1,
        sharpnessThreshold: 10.0
    )
}
