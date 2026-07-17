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
}
