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
        #expect(scorecard.namedGaps.contains { $0.phrase.contains("South wall") })  // names it
        #expect(scorecard.namedGaps.contains { $0.surface == "wall:south" })        // keyed by id
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

    // MARK: - F1: sampled extent (big-room floor via footprint samples, not center)

    @Test func largeRoomFloorObservedViaFootprintSamplesNotCenter() {
        // Camera sweeps HORIZONTALLY at eye level: the floor centroid is straight
        // down (out of cone), but a far footprint sample falls in the forward cone.
        let cameraPos = SIMD3<Float>(0, 1.5, 0)
        let forward = SIMD3<Float>(0, 0, 1)

        let centerOnly = SurfaceCoverageTracker()
        centerOnly.setSurfaces([CaptureSurface(id: "floor", kind: .floor,
            center: SIMD3<Float>(0, 0, 0), normal: SIMD3<Float>(0, 1, 0),
            checklistKey: "floor", displayLabel: "Floor")])
        centerOnly.observe(cameraPosition: cameraPos, cameraForward: forward, dt: 1.5)
        #expect(centerOnly.coverage.first?.observed == false)   // center-only misses it

        let sampled = SurfaceCoverageTracker()
        sampled.setSurfaces([CaptureSurface(id: "floor", kind: .floor,
            center: SIMD3<Float>(0, 0, 0), normal: SIMD3<Float>(0, 1, 0),
            samplePoints: [SIMD3<Float>(0, 0, 0), SIMD3<Float>(0, 0, 3), SIMD3<Float>(0, 0, -3),
                           SIMD3<Float>(3, 0, 0), SIMD3<Float>(-3, 0, 0)],
            checklistKey: "floor", displayLabel: "Floor")])
        sampled.observe(cameraPosition: cameraPos, cameraForward: forward, dt: 1.5)
        #expect(sampled.coverage.first?.observed == true)       // footprint sample catches it
    }

    // MARK: - F2: duplicate-bearing disambiguation

    @Test func duplicateBearingWallsGetDistinctKeysAndLabels() {
        let a = wall("a", SIMD3<Float>(0, 1.5, -2), bearing: "north")
        let b = wall("b", SIMD3<Float>(1, 1.5, -2), bearing: "north")   // same bearing
        let out = CaptureSurface.disambiguated([a, b])
        let keys = out.map { $0.checklistKey }
        #expect(Set(keys).count == 2)
        #expect(keys.contains("wall:north-1") && keys.contains("wall:north-2"))
        let labels = Set(out.map { $0.displayLabel })
        #expect(labels == ["North wall 1", "North wall 2"])
        // A lone bearing is left unchanged.
        let solo = CaptureSurface.disambiguated([wall("c", SIMD3<Float>(0, 1.5, 3), bearing: "south")])
        #expect(solo.first?.checklistKey == "wall:south")
    }

    // MARK: - F3: UUID-churn dwell re-keying

    @Test func rekeyPreservesDwellAcrossNewUUIDs() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([wall("uuid-old", SIMD3<Float>(0, 1.5, -2), bearing: "north")])
        tracker.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                        cameraForward: SIMD3<Float>(0, 0, -1), dt: 1.5)
        #expect(tracker.coverage.first?.observed == true)
        // Same wall, new UUID, center within tolerance → dwell must carry over.
        tracker.setSurfaces([wall("uuid-new", SIMD3<Float>(0.1, 1.5, -2), bearing: "north")])
        #expect(tracker.coverage.first?.surface.id == "uuid-new")
        #expect(tracker.coverage.first?.observed == true)
        // A far-away re-issue (beyond tolerance) does NOT inherit dwell.
        let far = SurfaceCoverageTracker()
        far.setSurfaces([wall("old", SIMD3<Float>(0, 1.5, -2), bearing: "north")])
        far.observe(cameraPosition: SIMD3<Float>(0, 1.5, 0),
                    cameraForward: SIMD3<Float>(0, 0, -1), dt: 1.5)
        far.setSurfaces([wall("new", SIMD3<Float>(5, 1.5, -2), bearing: "east")])
        #expect(far.coverage.first?.observed == false)
    }

    // MARK: - F5: Codable round-trip + exact verdict boundaries

    @Test func scorecardCodableRoundTripPinsShape() throws {
        let scorecard = Scorecard(
            coveragePct: 82, sharpFrameRatio: 0.73, trackingHealth: .fair, anchorCount: 2,
            verdict: .amber,
            surfaceChecklist: [SurfaceStatus(surface: "wall:north", covered: true),
                               SurfaceStatus(surface: "floor", covered: false)],
            namedGaps: [ScorecardGap(surface: "floor", phrase: "Floor not fully captured")])
        let data = try JSONEncoder().encode(scorecard)
        #expect(try JSONDecoder().decode(Scorecard.self, from: data) == scorecard)

        let dict = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Set(dict.keys) == Set([
            "coveragePct", "sharpFrameRatio", "trackingHealth", "anchorCount",
            "verdict", "surfaceChecklist", "namedGaps"
        ]))
        #expect(dict["verdict"] as? String == "amber")
        #expect(dict["trackingHealth"] as? String == "fair")
        let gaps = try #require(dict["namedGaps"] as? [[String: Any]])
        #expect(gaps.first?["surface"] as? String == "floor")
    }

    @Test func verdictExactBoundaries() {
        typealias E = ScorecardEvaluator
        #expect(E.verdict(coveragePct: 60, sharpFrameRatio: 0.9, trackingHealth: .good, unseenStructural: false) == .amber)  // 60 → amber, not red
        #expect(E.verdict(coveragePct: 85, sharpFrameRatio: 0.9, trackingHealth: .good, unseenStructural: false) == .green)  // 85 → green
        #expect(E.verdict(coveragePct: 95, sharpFrameRatio: 0.5, trackingHealth: .good, unseenStructural: false) == .green)  // 0.5 sharp → green (>=)
    }
}
