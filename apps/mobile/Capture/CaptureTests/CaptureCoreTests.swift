//  CaptureCoreTests.swift
//  CaptureTests
//
//  Pure-logic contracts for the Field shared-ARSession capture core (Field Capture
//  P1 · item 3): the shared clock (`CaptureTimebase`), the sample throttle
//  (`CaptureCadence`), and the recorder fan-out (`CaptureSinkRegistry`). No ARKit,
//  no device, no IO — exercised through the CaptureTests → CaptureKit seam (same as
//  FieldPhotoGate / FieldPosedPhoto tests). The ARKit-bound rig + recorders are
//  device-verified separately (item-3 device AC — OWED).

import Foundation
import Testing
@testable import CaptureKit

struct CaptureCoreTests {

    // MARK: - CaptureTimebase (one clock: seconds since session start)

    @Test func timebaseSecondsSinceStart() {
        let t0 = Date(timeIntervalSinceReferenceDate: 1_000)
        let tb = CaptureTimebase(start: t0)
        #expect(tb.seconds(at: t0) == 0)
        #expect(tb.seconds(at: t0.addingTimeInterval(2.5)) == 2.5)
        // A pre-start instant is negative (callers pass now ≥ start).
        #expect(tb.seconds(at: t0.addingTimeInterval(-1)) == -1)
    }

    @Test func timebaseSecondsNowUsesInjectedClock() {
        let t0 = Date(timeIntervalSinceReferenceDate: 0)
        let tb = CaptureTimebase(start: t0)
        let fixedNow = t0.addingTimeInterval(4.0)
        #expect(tb.secondsNow { fixedNow } == 4.0)
    }

    // MARK: - CaptureCadence (throttle gating)

    @Test func cadenceFirstSampleAlwaysPasses() {
        let cadence = CaptureCadence(minimumInterval: 1.0)
        #expect(cadence.shouldSample(now: 0, last: nil))
        #expect(cadence.shouldSample(now: 12_345, last: nil))
    }

    @Test func cadenceHonorsMinimumInterval() {
        let cadence = CaptureCadence(minimumInterval: 1.0)
        // Under interval → blocked.
        #expect(!cadence.shouldSample(now: 10.5, last: 10.0))
        // Exactly at interval (>=) → passes.
        #expect(cadence.shouldSample(now: 11.0, last: 10.0))
        // Past interval → passes.
        #expect(cadence.shouldSample(now: 20.0, last: 10.0))
    }

    @Test func cadenceDropsRegressedTimestamps() {
        let cadence = CaptureCadence(minimumInterval: 1.0)
        // A `now` earlier than `last` (duplicate / reordered frame) is dropped.
        #expect(!cadence.shouldSample(now: 9.0, last: 10.0))
    }

    @Test func cadenceZeroIntervalPassesEveryDistinctTick() {
        let cadence = CaptureCadence(minimumInterval: 0)
        #expect(cadence.shouldSample(now: 10.0, last: 10.0)) // 0 >= 0
        #expect(cadence.shouldSample(now: 10.001, last: 10.0))
    }

    @Test func lockedCadenceConstants() {
        // Depth throttles at ~1 Hz. There is deliberately NO mesh cadence — the
        // scene mesh is serialized once at finish() (after ARSession pause), not
        // streamed mid-scan, so no mesh interval constant exists.
        #expect(CaptureCadence.depth.minimumInterval == 1.0)
    }

    // MARK: - DepthBinFormat (the `.bin` header flag lockstep — I2)

    @Test func depthBinFlagsBitLayout() {
        // bit0 = smoothed, bit1 = confidence present. The recorder derives the
        // confidence bit from the SAME packed-plane result the index's
        // `hasConfidence` uses, so the two can never disagree.
        #expect(DepthBinFormat.flags(smoothed: false, hasConfidence: false) == 0x0000)
        #expect(DepthBinFormat.flags(smoothed: true,  hasConfidence: false) == 0x0001)
        #expect(DepthBinFormat.flags(smoothed: false, hasConfidence: true)  == 0x0002)
        #expect(DepthBinFormat.flags(smoothed: true,  hasConfidence: true)  == 0x0003)
        #expect(DepthBinFormat.smoothedFlag == 0x0001)
        #expect(DepthBinFormat.confidenceFlag == 0x0002)
        #expect(DepthBinFormat.version == 1)
        #expect(DepthBinFormat.magic == "PFD1")
    }

    // MARK: - CaptureSinkRegistry (seam fan-out)

    /// A stub sink that records the order it was broadcast to.
    private final class StubSink {
        let id: Int
        var receiveCount = 0
        init(_ id: Int) { self.id = id }
    }

    @Test func registryBroadcastsToAllSinksInOrder() {
        let registry = CaptureSinkRegistry<StubSink>()
        let a = StubSink(1), b = StubSink(2), c = StubSink(3)
        registry.add(a); registry.add(b); registry.add(c)
        #expect(registry.count == 3)

        var order: [Int] = []
        registry.broadcast { sink in
            sink.receiveCount += 1
            order.append(sink.id)
        }
        #expect(order == [1, 2, 3])            // registration order preserved
        #expect(a.receiveCount == 1)
        #expect(b.receiveCount == 1)
        #expect(c.receiveCount == 1)
    }

    @Test func registryEmptyBroadcastIsNoOp() {
        let registry = CaptureSinkRegistry<StubSink>()
        var called = false
        registry.broadcast { _ in called = true }
        #expect(!called)
        #expect(registry.count == 0)
    }

    @Test func registryRemoveAllClearsSinks() {
        let registry = CaptureSinkRegistry<StubSink>()
        registry.add(StubSink(1))
        registry.add(StubSink(2))
        #expect(registry.count == 2)
        registry.removeAll()
        #expect(registry.count == 0)
        var called = false
        registry.broadcast { _ in called = true }
        #expect(!called)
    }

    @Test func registryDeliversEachBroadcastSeparately() {
        let registry = CaptureSinkRegistry<StubSink>()
        let a = StubSink(1)
        registry.add(a)
        registry.broadcast { $0.receiveCount += 1 }
        registry.broadcast { $0.receiveCount += 1 }
        #expect(a.receiveCount == 2)           // two broadcasts → two deliveries
    }

    // MARK: - KeyframeGate (motion trigger / debounce / sharpness — item 4)

    /// Row-major 4x4 identity.
    private static let identityPose: [Float] = [
        1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1
    ]

    /// Identity rotation translated by (x, y, z) — translation at row-major 3, 7, 11.
    private func translated(_ x: Float, _ y: Float, _ z: Float) -> [Float] {
        [1, 0, 0, x,  0, 1, 0, y,  0, 0, 1, z,  0, 0, 0, 1]
    }

    @Test func translationDeltaEuclidean() {
        let d = KeyframeGate.translationDelta(Self.identityPose, translated(3, 4, 0))
        #expect(abs(d - 5.0) < 1e-4)           // 3-4-5
    }

    @Test func rotationDelta90DegreesAboutZ() {
        // Row-major 90° rotation about Z: [[0,-1,0],[1,0,0],[0,0,1]].
        let pose90z: [Float] = [0, -1, 0, 0,  1, 0, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]
        let theta = KeyframeGate.rotationDeltaRadians(Self.identityPose, pose90z)
        #expect(abs(theta - Float.pi / 2) < 1e-3)
        // Identity vs identity → no rotation.
        #expect(KeyframeGate.rotationDeltaRadians(Self.identityPose, Self.identityPose) < 1e-4)
    }

    @Test func motionTriggerFirstFrameAndThresholds() {
        let gate = KeyframeGate.standard
        // First keyframe (no prior pose) always fires.
        #expect(gate.motionTriggered(from: nil, to: Self.identityPose))
        // No motion → not triggered.
        #expect(!gate.motionTriggered(from: Self.identityPose, to: Self.identityPose))
        // 0.3 m (< 0.5) and no rotation → not triggered.
        #expect(!gate.motionTriggered(from: Self.identityPose, to: translated(0.3, 0, 0)))
        // 0.6 m (> 0.5) → triggered.
        #expect(gate.motionTriggered(from: Self.identityPose, to: translated(0.6, 0, 0)))
        // 90° rotation (> 15°) with no translation → triggered.
        let pose90z: [Float] = [0, -1, 0, 0,  1, 0, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]
        #expect(gate.motionTriggered(from: Self.identityPose, to: pose90z))
    }

    @Test func evaluationDebounceAndSharpnessThreshold() {
        let gate = KeyframeGate.standard
        #expect(gate.shouldEvaluate(now: 100, lastEvaluation: nil))          // first
        #expect(!gate.shouldEvaluate(now: 100.05, lastEvaluation: 100.0))    // < 0.1 s
        // == interval: build the boundary from the interval itself to dodge the
        // 100.10-100.0 float-representation trap (that difference is 0.0999…).
        #expect(gate.shouldEvaluate(now: gate.minEvaluationInterval, lastEvaluation: 0))
        #expect(gate.shouldEvaluate(now: 100.3, lastEvaluation: 100.0))      // > 0.1 s
        #expect(!gate.shouldEvaluate(now: 99.0, lastEvaluation: 100.0))      // regressed
        #expect(gate.isSharp(gate.sharpnessThreshold))                       // >= threshold
        #expect(!gate.isSharp(gate.sharpnessThreshold - 0.001))
    }

    @Test func standardGateTuning() {
        let gate = KeyframeGate.standard
        #expect(gate.translationThresholdMeters == 0.5)
        #expect(abs(gate.rotationThresholdRadians - Float(15.0 * .pi / 180.0)) < 1e-6)
        #expect(gate.minEvaluationInterval == 0.1)
    }

    // MARK: - Sharpness (variance of Laplacian — item 4)

    @Test func sharpnessFlatBufferIsZero() {
        let flat = [UInt8](repeating: 128, count: 5 * 5)  // no high-frequency content
        #expect(Sharpness.varianceOfLaplacian(luma: flat, width: 5, height: 5) == 0)
    }

    @Test func sharpnessCheckerboardIsHigh() {
        // Alternating 0/255 → strong Laplacian everywhere → large variance.
        var checker = [UInt8](repeating: 0, count: 6 * 6)
        for y in 0..<6 { for x in 0..<6 { checker[y * 6 + x] = (x + y) % 2 == 0 ? 0 : 255 } }
        let sharp = Sharpness.varianceOfLaplacian(luma: checker, width: 6, height: 6)
        let flat = Sharpness.varianceOfLaplacian(luma: [UInt8](repeating: 40, count: 6 * 6), width: 6, height: 6)
        #expect(sharp > 0)
        #expect(sharp > flat)
    }

    @Test func sharpnessTooSmallIsZero() {
        #expect(Sharpness.varianceOfLaplacian(luma: [1, 2, 3, 4], width: 2, height: 2) == 0)
        #expect(Sharpness.varianceOfLaplacian(luma: [], width: 0, height: 0) == 0)
    }
}
