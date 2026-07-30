//
//  KeyframeSequencer.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/Capture/Features/SiteScan/FieldKeyframeRecorder.swift
//    — specifically `capture(frame:timestampSeconds:)` steps 1–5 (lines 102–157),
//      the counters (lines 53–75), and the two ratios (lines 87–98).
//
//  Field's recorder is `@MainActor`, ARKit-typed, and owns file IO. Everything
//  ARKit/IO stays in the later wiring wave. What lives here is the DECISION
//  SEQUENCE — the order the gate's four guards run in, the counters they move, and
//  the K2 blur-dedup rule — with the ARFrame reduced to the three numbers the logic
//  actually needs: the row-major pose, the monotonic frame timestamp, and a
//  sharpness score produced on demand.
//
//  Why the score is a closure and not a parameter: the whole point of the debounce
//  is to NOT pay for the sharpness evaluation on every frame. Handing the score in
//  eagerly would silently discard that saving and no test would notice. The closure
//  is invoked only when guards 1 and 2 both pass, and a test counts its invocations.
//
//  ISOLATION — `nonisolated`, deliberately NOT `Sendable`: this carries mutable
//  counters and no lock, exactly like Field's recorder, and must be confined to one
//  isolation domain by its owner. Without the explicit `nonisolated`, Patina's
//  project-level SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor would bind it to the main
//  actor and every frame would hop.
//

import Foundation

/// What the gate decided about one frame.
nonisolated public enum KeyframeDecision: Sendable, Equatable {
    /// Budget safety valve reached — silent stop.
    case capped
    /// Camera has not moved/rotated far enough since the last FIRED keyframe.
    case notMoved
    /// Motion-triggered, but the sharpness-evaluation debounce has not elapsed.
    case debounced
    /// A sharpness score could not be produced (e.g. the luma grid was unusable).
    case noScore
    /// Evaluated and rejected as blurred. `counted` is the K2 opportunity-loss flag.
    case blurred(score: Double, counted: Bool)
    /// Sharp, but the encoder is behind — dropped and counted.
    case droppedEncoderBusy(score: Double)
    /// Fire a keyframe.
    case fire(score: Double)
}

/// Running keyframe counters (Field's `KeyframeSummary` shape).
nonisolated public struct KeyframeTelemetry: Sendable, Equatable {
    public var fired: Int
    /// Opportunity-based: one per DISTINCT blurry pose region, not per 0.1 s
    /// re-evaluation of the same region — this is the count the ratios use.
    public var blurRejected: Int
    /// Every failed sharpness evaluation (diagnostic; a blurry pan inflates this).
    public var rawBlurFailures: Int
    public var encodeDropped: Int

    public init(fired: Int = 0, blurRejected: Int = 0, rawBlurFailures: Int = 0, encodeDropped: Int = 0) {
        self.fired = fired
        self.blurRejected = blurRejected
        self.rawBlurFailures = rawBlurFailures
        self.encodeDropped = encodeDropped
    }

    /// Blur-rejection ratio over evaluated frames — `blurRejected / (fired + blurRejected)`.
    /// 0 when nothing was evaluated.
    public var blurRejectionRatio: Double {
        let evaluated = fired + blurRejected
        return evaluated > 0 ? Double(blurRejected) / Double(evaluated) : 0
    }

    /// Sharp-frame ratio for the scorecard — `fired / (fired + blurRejected)`.
    /// ⚠ 1.0 when NOTHING was evaluated (a no-op scan is gated elsewhere by
    /// coverage). Carried faithfully from Field; see the report.
    public var sharpFrameRatio: Double {
        let evaluated = fired + blurRejected
        return evaluated > 0 ? Double(fired) / Double(evaluated) : 1.0
    }
}

nonisolated public final class KeyframeSequencer {

    /// Drop + count once this many keyframe encodes are queued but not yet written.
    /// 2 (not 4): a serial encode drain vs ~10/s fire can otherwise hold several
    /// full-res camera buffers off ARKit's pool; a counted drop beats pool pressure.
    public static let defaultMaxInFlight = 2
    /// Budget safety valve (silent stop). Target is 200–400 keyframes; this bounds
    /// worst-case bundle size on an unusually long/slow scan.
    public static let defaultMaxKeyframes = 500

    private let gate: KeyframeGate
    private let maxInFlight: Int
    private let maxKeyframes: Int

    private var lastFiredPose: [Float]?
    private var lastEvaluation: TimeInterval?
    /// Pose at the last COUNTED blur rejection; a new rejection is counted only once
    /// the pose has advanced past the motion threshold from here (K2 dedup).
    private var lastBlurRejectPose: [Float]?
    private var inFlight = 0

    public private(set) var telemetry = KeyframeTelemetry()

    public init(gate: KeyframeGate = .standard,
                maxInFlight: Int = KeyframeSequencer.defaultMaxInFlight,
                maxKeyframes: Int = KeyframeSequencer.defaultMaxKeyframes) {
        self.gate = gate
        self.maxInFlight = maxInFlight
        self.maxKeyframes = maxKeyframes
    }

    /// Encodes currently queued but not yet written.
    public var encodesInFlight: Int { inFlight }

    /// Evaluate one frame. `sharpness` is invoked at most once, and only when the
    /// motion trigger and the debounce have both passed.
    @discardableResult
    public func evaluate(pose: [Float],
                         frameTimestamp: TimeInterval,
                         sharpness: () -> Double?) -> KeyframeDecision {
        // 0. Budget safety valve.
        guard telemetry.fired < maxKeyframes else { return .capped }

        // 1. Motion trigger vs the last FIRED pose (cheap; first keyframe always).
        guard gate.motionTriggered(from: lastFiredPose, to: pose) else { return .notMoved }

        // 2. Debounce the (pricier) sharpness evaluation on the monotonic clock.
        guard gate.shouldEvaluate(now: frameTimestamp, lastEvaluation: lastEvaluation) else {
            return .debounced
        }
        lastEvaluation = frameTimestamp

        // 3. Sharpness.
        guard let score = sharpness() else { return .noScore }
        guard gate.isSharp(score) else {
            // Motion-triggered but blurred — reject, DON'T advance lastFiredPose, so
            // the next frame at ~this pose is re-evaluated for a sharp capture.
            telemetry.rawBlurFailures += 1
            // Count ONE opportunity-loss per distinct blurry region (K2): only when
            // the pose has advanced past the motion threshold since the last counted
            // rejection — a 2 s blurry pan is one lost opportunity, not ~20.
            var counted = false
            if gate.motionTriggered(from: lastBlurRejectPose, to: pose) {
                telemetry.blurRejected += 1
                lastBlurRejectPose = pose
                counted = true
            }
            return .blurred(score: score, counted: counted)
        }

        // 4. Max-in-flight guard — drop if the encoder is behind.
        guard inFlight < maxInFlight else {
            telemetry.encodeDropped += 1
            return .droppedEncoderBusy(score: score)
        }

        // 5. Fire: advance the pose, take an encode slot.
        telemetry.fired += 1
        lastFiredPose = pose
        inFlight += 1
        return .fire(score: score)
    }

    /// Release an encode slot. Field calls the equivalent from the writer's
    /// completion handler.
    public func noteEncodeFinished() {
        if inFlight > 0 { inFlight -= 1 }
    }
}
