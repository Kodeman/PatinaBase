//  CoverageScorecardTests.swift
//  CaptureTests
//
//  Pure-logic contracts for the coach + QA gate (Field Capture P1 · item 5):
//  per-surface coverage tracking, the green/amber/red verdict, and gap naming.
//  Includes the AC: deliberately skipping one wall produces a non-green verdict
//  that NAMES that wall. No RoomPlan, no ARKit — CaptureTests → CaptureKit seam.

import Foundation
import Testing
@testable import CaptureKit

struct CoverageScorecardTests {

    private func wall(_ id: String, _ center: SIMD3<Float>, bearing: String) -> CaptureSurface {
        CaptureSurface(id: id, kind: .wall, center: center, normal: SIMD3<Float>(0, 0, 1),
                       checklistKey: "wall:\(bearing)", displayLabel: "\(bearing.capitalized) wall")
    }

    // MARK: - SurfaceCoverageTracker

    @Test func looksAtSurfaceObservesIt() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([wall("n", SIMD3<Float>(0, 1.5, -2), bearing: "north")])
        // Camera at origin looking down -Z, straight at the wall 2 m away.
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(0, 0, -1), dt: 1.5)
        #expect(tracker.coverage.first?.observed == true)
        #expect(tracker.coveragePct == 100)
        #expect(tracker.unobserved.isEmpty)
    }

    @Test func surfaceOutOfConeStaysUnobserved() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([wall("n", SIMD3<Float>(0, 1.5, -2), bearing: "north")])
        // Looking along +X — the wall is 90° off the forward cone.
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(1, 0, 0), dt: 5.0)
        #expect(tracker.coverage.first?.observed == false)
    }

    @Test func surfaceBeyondMaxDistanceStaysUnobserved() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([wall("n", SIMD3<Float>(0, 1.5, -6), bearing: "north")])  // 6 m > 4 m
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(0, 0, -1), dt: 5.0)
        #expect(tracker.coverage.first?.observed == false)
    }

    @Test func dwellBelowThresholdStaysUnobserved() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([wall("n", SIMD3<Float>(0, 1.5, -2), bearing: "north")])
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(0, 0, -1), dt: 0.5)  // < 1.2 s dwell
        #expect(tracker.coverage.first?.observed == false)
    }

    @Test func setSurfacesPreservesDwellForPersistentIds() {
        let tracker = SurfaceCoverageTracker()
        let north = wall("n", SIMD3<Float>(0, 1.5, -2), bearing: "north")
        tracker.setSurfaces([north])
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(0, 0, -1), dt: 1.5)
        // Graph re-emits with a second wall; north's progress must survive.
        tracker.setSurfaces([north, wall("s", SIMD3<Float>(0, 1.5, 3), bearing: "south")])
        #expect(tracker.coverage.first { $0.surface.id == "n" }?.observed == true)
        #expect(tracker.coverage.first { $0.surface.id == "s" }?.observed == false)
        #expect(tracker.coveragePct == 50)
    }

    // MARK: - Skipped-wall AC (non-green verdict that NAMES the wall)

    @Test func skippedWallProducesNonGreenVerdictNamingIt() {
        let tracker = SurfaceCoverageTracker()
        let north = wall("n", SIMD3<Float>(0, 1.5, -2), bearing: "north")
        let south = wall("s", SIMD3<Float>(0, 1.5, 3), bearing: "south")  // never looked at
        tracker.setSurfaces([north, south])
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(0, 0, -1), dt: 1.5)  // only the north wall

        let scorecard = ScorecardEvaluator.make(coverage: tracker.coverage,
                                                sharpFrameRatio: 0.9,
                                                trackingHealth: .good,
                                                anchorCount: 0)
        #expect(scorecard.verdict == .red)                              // non-green
        #expect(scorecard.namedGaps.contains { $0.contains("South wall") })  // names it
        #expect(scorecard.surfaceChecklist.contains { $0.surface == "wall:south" && !$0.covered })
        #expect(scorecard.surfaceChecklist.contains { $0.surface == "wall:north" && $0.covered })
    }

    @Test func fullCoverageGoodScanIsGreen() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([wall("n", SIMD3<Float>(0, 1.5, -2), bearing: "north")])
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(0, 0, -1), dt: 1.5)
        let scorecard = ScorecardEvaluator.make(coverage: tracker.coverage,
                                                sharpFrameRatio: 0.9, trackingHealth: .good, anchorCount: 3)
        #expect(scorecard.verdict == .green)
        #expect(scorecard.coveragePct == 100)
        #expect(scorecard.anchorCount == 3)
        #expect(scorecard.namedGaps.isEmpty)
    }

    // MARK: - Verdict boundaries

    @Test func verdictBoundaries() {
        typealias E = ScorecardEvaluator
        #expect(E.verdict(coveragePct: 100, sharpFrameRatio: 0.9, trackingHealth: .good, unseenStructural: false) == .green)
        // Any unseen structural surface → red regardless of other metrics.
        #expect(E.verdict(coveragePct: 100, sharpFrameRatio: 0.9, trackingHealth: .good, unseenStructural: true) == .red)
        // Coverage floor.
        #expect(E.verdict(coveragePct: 59, sharpFrameRatio: 0.9, trackingHealth: .good, unseenStructural: false) == .red)
        #expect(E.verdict(coveragePct: 84, sharpFrameRatio: 0.9, trackingHealth: .good, unseenStructural: false) == .amber)
        // Low sharpness / fair tracking → amber; poor tracking → red.
        #expect(E.verdict(coveragePct: 95, sharpFrameRatio: 0.3, trackingHealth: .good, unseenStructural: false) == .amber)
        #expect(E.verdict(coveragePct: 95, sharpFrameRatio: 0.9, trackingHealth: .fair, unseenStructural: false) == .amber)
        #expect(E.verdict(coveragePct: 95, sharpFrameRatio: 0.9, trackingHealth: .poor, unseenStructural: false) == .red)
    }

    // MARK: - SurfaceLabeler (relative-bearing placeholder)

    @Test func bearingFromCentroidOffset() {
        let c = SIMD3<Float>(0, 0, 0)
        #expect(SurfaceLabeler.bearing(center: SIMD3<Float>(3, 0, 0), centroid: c) == "east")
        #expect(SurfaceLabeler.bearing(center: SIMD3<Float>(-3, 0, 0), centroid: c) == "west")
        #expect(SurfaceLabeler.bearing(center: SIMD3<Float>(0, 0, 3), centroid: c) == "south")
        #expect(SurfaceLabeler.bearing(center: SIMD3<Float>(0, 0, -3), centroid: c) == "north")
    }
}
