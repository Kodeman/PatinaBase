//
//  InstrumentKeyframeGateTests.swift
//  PatinaTests
//
//  Pins the ported keyframe gate + its stateful sequencer against Patina Field.
//
//  Every threshold asserted here is a VALUE carried across from
//  apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/KeyframeGate.swift and
//  apps/mobile/Capture/Capture/Features/SiteScan/FieldKeyframeRecorder.swift.
//  A "cleanup" that retunes one must fail here loudly, not drift silently.
//
//  These suites are deliberately NOT `@MainActor` — the substrate is `nonisolated`
//  and must stay callable from a plain synchronous context.
//

import Testing
import Foundation
@testable import Patina

struct InstrumentKeyframeGateTests {

    // MARK: - Helpers

    /// Row-major 4×4 with identity rotation and the given translation
    /// (translation at indices 3, 7, 11).
    private static func pose(_ tx: Float, _ ty: Float, _ tz: Float) -> [Float] {
        [1, 0, 0, tx,
         0, 1, 0, ty,
         0, 0, 1, tz,
         0, 0, 0, 1]
    }

    /// Row-major 4×4 rotated `radians` about +Y with no translation.
    private static func yaw(_ radians: Float) -> [Float] {
        let cosine = cos(radians)
        let sine = sin(radians)
        return [cosine, 0, sine, 0,
                0, 1, 0, 0,
                -sine, 0, cosine, 0,
                0, 0, 0, 1]
    }

    // MARK: - Locked v1 tuning (Field KeyframeGate.standard, lines 94–99)

    @Test
    func standardGateConstantsAreCarriedAcrossByValue() {
        let gate = KeyframeGate.standard
        #expect(gate.translationThresholdMeters == 0.5)
        // 15° expressed in radians. Pinned against the DECIMAL, not against the
        // expression that produced it — otherwise the assertion is a tautology.
        #expect(abs(Double(gate.rotationThresholdRadians) - 0.2617993877991494) < 1e-6)
        #expect(gate.minEvaluationInterval == 0.1)
        #expect(gate.sharpnessThreshold == 10.0)
    }

    // MARK: - Translation delta

    @Test
    func translationDeltaIsEuclideanOverTheTranslationColumn() {
        // 3-4-5 triangle: exactly 0.5 m, which is exactly the standard threshold.
        let delta = KeyframeGate.translationDelta(Self.pose(0, 0, 0), Self.pose(0.3, 0.4, 0))
        #expect(abs(delta - 0.5) < 1e-6)
        // Non-zero Z contributes too (a pure-XY implementation would read 0 here).
        let zOnly = KeyframeGate.translationDelta(Self.pose(0, 0, 0), Self.pose(0, 0, 2))
        #expect(abs(zOnly - 2.0) < 1e-6)
    }

    @Test
    func translationDeltaIsZeroForUndersizedInput() {
        #expect(KeyframeGate.translationDelta([1, 2, 3], Self.pose(9, 9, 9)) == 0)
        #expect(KeyframeGate.translationDelta(Self.pose(9, 9, 9), []) == 0)
    }

    // MARK: - Rotation delta

    @Test
    func rotationDeltaRecoversTheYawAngle() {
        let identity = Self.yaw(0)
        // A real 15° yaw must read back as 15° — not merely "greater than zero".
        let fifteen = KeyframeGate.rotationDeltaRadians(identity, Self.yaw(0.2617993877991494))
        #expect(abs(Double(fifteen) - 0.2617993877991494) < 1e-4)
        // 90° and 180° pin the arccos branch across the range.
        let ninety = KeyframeGate.rotationDeltaRadians(identity, Self.yaw(.pi / 2))
        #expect(abs(Double(ninety) - Double.pi / 2) < 1e-4)
        let oneEighty = KeyframeGate.rotationDeltaRadians(identity, Self.yaw(.pi))
        #expect(abs(Double(oneEighty) - Double.pi) < 1e-3)
    }

    @Test
    func rotationDeltaIsZeroForIdenticalPosesAndUndersizedInput() {
        #expect(KeyframeGate.rotationDeltaRadians(Self.yaw(0.4), Self.yaw(0.4)) == 0)
        #expect(KeyframeGate.rotationDeltaRadians([1, 0, 0], Self.yaw(0.4)) == 0)
    }

    // MARK: - Motion trigger

    @Test
    func motionTriggerAlwaysFiresWithNoPriorPose() {
        #expect(KeyframeGate.standard.motionTriggered(from: nil, to: Self.pose(0, 0, 0)))
    }

    @Test
    func motionTriggerHonoursTheTranslationThresholdInclusively() {
        let gate = KeyframeGate.standard
        // 0.49 m — below 0.5 m and no rotation ⇒ no trigger.
        #expect(!gate.motionTriggered(from: Self.pose(0, 0, 0), to: Self.pose(0.49, 0, 0)))
        // Exactly 0.5 m ⇒ trigger (the comparison is >=).
        #expect(gate.motionTriggered(from: Self.pose(0, 0, 0), to: Self.pose(0.5, 0, 0)))
    }

    @Test
    func motionTriggerFiresOnRotationAloneAtTheThreshold() {
        let gate = KeyframeGate.standard
        // 14° with zero translation ⇒ no trigger; 16° ⇒ trigger.
        #expect(!gate.motionTriggered(from: Self.yaw(0), to: Self.yaw(14.0 * .pi / 180.0)))
        #expect(gate.motionTriggered(from: Self.yaw(0), to: Self.yaw(16.0 * .pi / 180.0)))
    }

    // MARK: - Debounce

    @Test
    func debounceIsInclusiveAndRejectsRegressedClocks() {
        let gate = KeyframeGate.standard
        #expect(gate.shouldEvaluate(now: 0, lastEvaluation: nil))          // first always
        #expect(!gate.shouldEvaluate(now: 10.09, lastEvaluation: 10.0))    // under 0.1 s
        #expect(gate.shouldEvaluate(now: 10.5, lastEvaluation: 10.0))      // well over
        #expect(!gate.shouldEvaluate(now: 9.0, lastEvaluation: 10.0))      // monotonic only
        // Exactly at the interval passes — asserted on an exactly-representable
        // delta. ⚠ Field compares raw `ARFrame.timestamp`s (thousands of seconds),
        // where `10.1 - 10.0 == 0.09999999999999964` and the boundary case can fall
        // either way. Ported behaviour, not a port defect: one 1/60 s frame either
        // side of a 0.1 s debounce is immaterial.
        #expect(gate.shouldEvaluate(now: 0.1, lastEvaluation: 0.0))
        #expect(!gate.shouldEvaluate(now: 0.09, lastEvaluation: 0.0))
    }

    // MARK: - Sharpness threshold

    @Test
    func sharpnessThresholdIsInclusive() {
        let gate = KeyframeGate.standard
        #expect(!gate.isSharp(9.999))
        #expect(gate.isSharp(10.0))
        #expect(gate.isSharp(10.001))
    }

    // MARK: - CameraPose (row-major accessors)

    @Test
    func cameraPoseReadsTranslationAndNegatedZ() {
        // Yaw 0 ⇒ third basis column is (0, 0, 1); ARKit looks down -Z, so forward
        // must be (0, 0, -1). A missing negation points the coverage cone backwards.
        var transform = Self.yaw(0)
        transform[3] = 1.5
        transform[7] = -2.5
        transform[11] = 3.5
        let position = CameraPose.position(transform)
        #expect(position == SIMD3<Float>(1.5, -2.5, 3.5))
        let forward = CameraPose.forward(transform)
        #expect(forward == SIMD3<Float>(0, 0, -1))
        #expect(CameraPose.elementCount == 16)
        #expect(CameraPose.forward([1, 0, 0]) == nil)
        #expect(CameraPose.position([1, 0, 0]) == nil)
    }

    @Test
    func cameraPoseForwardTracksYaw() {
        // Yawing +90° about Y turns the -Z forward vector toward -X.
        let forward = CameraPose.forward(Self.yaw(.pi / 2))
        #expect(abs((forward?.x ?? 0) - -1) < 1e-6)
        #expect(abs(forward?.z ?? 99) < 1e-6)
    }
}

// MARK: - Sequencer

struct InstrumentKeyframeSequencerTests {

    private static func pose(_ tx: Float) -> [Float] {
        [1, 0, 0, tx,
         0, 1, 0, 0,
         0, 0, 1, 0,
         0, 0, 0, 1]
    }

    /// A sharpness provider that counts how often it was asked. The debounce exists
    /// precisely so this is NOT called every frame; counting it is the only way to
    /// prove the saving survived the port.
    private final class ScoreProbe {
        var calls = 0
        var score: Double
        init(score: Double) { self.score = score }
        func value() -> Double? {
            calls += 1
            return score
        }
    }

    @Test
    func firstFrameFiresAndTakesAnEncodeSlot() {
        let sequencer = KeyframeSequencer()
        let probe = ScoreProbe(score: 40)
        #expect(sequencer.evaluate(pose: Self.pose(0), frameTimestamp: 0, sharpness: probe.value)
                == .fire(score: 40))
        #expect(sequencer.telemetry.fired == 1)
        #expect(sequencer.encodesInFlight == 1)
        #expect(probe.calls == 1)
    }

    @Test
    func stationaryFramesNeverPayForSharpness() {
        let sequencer = KeyframeSequencer()
        let probe = ScoreProbe(score: 40)
        _ = sequencer.evaluate(pose: Self.pose(0), frameTimestamp: 0, sharpness: probe.value)
        // 0.1 m of drift — under the 0.5 m trigger.
        #expect(sequencer.evaluate(pose: Self.pose(0.1), frameTimestamp: 5, sharpness: probe.value)
                == .notMoved)
        #expect(probe.calls == 1)   // still only the first frame
    }

    @Test
    func debounceBlocksTheSharpnessEvaluation() {
        let sequencer = KeyframeSequencer()
        let probe = ScoreProbe(score: 40)
        _ = sequencer.evaluate(pose: Self.pose(0), frameTimestamp: 0, sharpness: probe.value)
        // Moved far enough, but only 0.05 s later.
        #expect(sequencer.evaluate(pose: Self.pose(2), frameTimestamp: 0.05, sharpness: probe.value)
                == .debounced)
        #expect(probe.calls == 1)
        // At 0.1 s the debounce clears and the score IS computed.
        sequencer.noteEncodeFinished()
        #expect(sequencer.evaluate(pose: Self.pose(2), frameTimestamp: 0.1, sharpness: probe.value)
                == .fire(score: 40))
        #expect(probe.calls == 2)
    }

    @Test
    func blurredFramesDoNotAdvanceTheFiredPoseAndDedupePerRegion() {
        let sequencer = KeyframeSequencer()
        let blurry = ScoreProbe(score: 5)
        _ = sequencer.evaluate(pose: Self.pose(0), frameTimestamp: 0, sharpness: { 40 })

        // First blurry frame at a NEW region — counted as one lost opportunity.
        #expect(sequencer.evaluate(pose: Self.pose(2), frameTimestamp: 1.0, sharpness: blurry.value)
                == .blurred(score: 5, counted: true))
        // Second blurry frame at the SAME pose — raw failure only, NOT a second
        // opportunity loss (Field's K2 dedup).
        #expect(sequencer.evaluate(pose: Self.pose(2), frameTimestamp: 2.0, sharpness: blurry.value)
                == .blurred(score: 5, counted: false))
        #expect(sequencer.telemetry.rawBlurFailures == 2)
        #expect(sequencer.telemetry.blurRejected == 1)

        // A blurry frame a further 2 m on is a NEW region — counted again.
        #expect(sequencer.evaluate(pose: Self.pose(4), frameTimestamp: 3.0, sharpness: blurry.value)
                == .blurred(score: 5, counted: true))
        #expect(sequencer.telemetry.blurRejected == 2)

        // The fired pose never advanced, so a sharp frame back at 2 m still fires.
        sequencer.noteEncodeFinished()
        #expect(sequencer.evaluate(pose: Self.pose(2), frameTimestamp: 4.0, sharpness: { 40 })
                == .fire(score: 40))
        #expect(sequencer.telemetry.fired == 2)
    }

    @Test
    func encoderBackpressureDropsRatherThanStarvingThePool() {
        let sequencer = KeyframeSequencer()
        _ = sequencer.evaluate(pose: Self.pose(0), frameTimestamp: 0, sharpness: { 40 })
        _ = sequencer.evaluate(pose: Self.pose(2), frameTimestamp: 1, sharpness: { 40 })
        #expect(sequencer.encodesInFlight == 2)   // defaultMaxInFlight
        #expect(sequencer.evaluate(pose: Self.pose(4), frameTimestamp: 2, sharpness: { 40 })
                == .droppedEncoderBusy(score: 40))
        #expect(sequencer.telemetry.encodeDropped == 1)
        #expect(sequencer.telemetry.fired == 2)
        // Freeing a slot lets the next one through.
        sequencer.noteEncodeFinished()
        #expect(sequencer.evaluate(pose: Self.pose(6), frameTimestamp: 3, sharpness: { 40 })
                == .fire(score: 40))
    }

    @Test
    func keyframeCapStopsSilently() {
        let sequencer = KeyframeSequencer(maxInFlight: 99, maxKeyframes: 2)
        _ = sequencer.evaluate(pose: Self.pose(0), frameTimestamp: 0, sharpness: { 40 })
        _ = sequencer.evaluate(pose: Self.pose(2), frameTimestamp: 1, sharpness: { 40 })
        #expect(sequencer.evaluate(pose: Self.pose(4), frameTimestamp: 2, sharpness: { 40 }) == .capped)
        #expect(sequencer.telemetry.fired == 2)
    }

    @Test
    func missingScoreIsNotCountedAsBlur() {
        let sequencer = KeyframeSequencer()
        #expect(sequencer.evaluate(pose: Self.pose(0), frameTimestamp: 0, sharpness: { nil })
                == .noScore)
        #expect(sequencer.telemetry.rawBlurFailures == 0)
        #expect(sequencer.telemetry.blurRejected == 0)
        #expect(sequencer.telemetry.fired == 0)
    }

    @Test
    func sequencerDefaultsAreCarriedAcrossByValue() {
        #expect(KeyframeSequencer.defaultMaxInFlight == 2)
        #expect(KeyframeSequencer.defaultMaxKeyframes == 500)
    }

    // MARK: - Telemetry ratios

    @Test
    func ratiosUseOpportunityCountsNotRawFailures() {
        let telemetry = KeyframeTelemetry(fired: 3, blurRejected: 1, rawBlurFailures: 17, encodeDropped: 4)
        #expect(abs(telemetry.sharpFrameRatio - 0.75) < 1e-12)
        #expect(abs(telemetry.blurRejectionRatio - 0.25) < 1e-12)
    }

    @Test
    func sharpFrameRatioIsOneWhenNothingWasEvaluated() {
        // ⚠ Field's documented behaviour: an empty scan scores a PERFECT sharp-frame
        // ratio and is expected to be caught by coverage instead. Ported faithfully.
        let telemetry = KeyframeTelemetry()
        #expect(telemetry.sharpFrameRatio == 1.0)
        #expect(telemetry.blurRejectionRatio == 0.0)
    }
}
