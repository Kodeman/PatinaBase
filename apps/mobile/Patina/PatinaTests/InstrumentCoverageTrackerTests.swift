//
//  InstrumentCoverageTrackerTests.swift
//  PatinaTests
//
//  Pins the surface model + dwell accounting ported from Patina Field
//  (CaptureKit/SiteScan/CaptureSurface.swift, SurfaceCoverageTracker.swift).
//
//  Camera convention throughout: at the origin looking down -Z, matching
//  `CameraPose.forward`.
//

import Testing
import Foundation
@testable import Patina

struct InstrumentCaptureSurfaceTests {

    private static func surface(_ id: String,
                                kind: CaptureSurface.Kind = .wall,
                                key: String = "wall:north",
                                label: String = "North wall") -> CaptureSurface {
        CaptureSurface(id: id, kind: kind, center: .init(0, 0, -3), normal: .init(0, 0, 1),
                       checklistKey: key, displayLabel: label)
    }

    @Test
    func structuralKindsGateHarderThanOpenings() {
        #expect(CaptureSurface.Kind.wall.isStructural)
        #expect(CaptureSurface.Kind.floor.isStructural)
        #expect(CaptureSurface.Kind.ceiling.isStructural)
        #expect(!CaptureSurface.Kind.opening.isStructural)
        // Raw values are the checklist/manifest wire contract.
        #expect(CaptureSurface.Kind.wall.rawValue == "wall")
        #expect(CaptureSurface.Kind.opening.rawValue == "opening")
    }

    @Test
    func effectiveSamplePointsFallBackToTheCentre() {
        let bare = Self.surface("a")
        #expect(bare.effectiveSamplePoints == [SIMD3<Float>(0, 0, -3)])
        let sampled = CaptureSurface(id: "b", kind: .wall, center: .init(0, 0, -3),
                                     normal: .init(0, 0, 1),
                                     samplePoints: [.init(1, 0, -3), .init(-1, 0, -3)],
                                     checklistKey: "wall:north", displayLabel: "North wall")
        #expect(sampled.effectiveSamplePoints.count == 2)
    }

    @Test
    func duplicateChecklistKeysAreDisambiguatedButUniqueOnesAreUntouched() {
        let input = [
            Self.surface("a", key: "wall:north", label: "North wall"),
            Self.surface("b", key: "wall:north", label: "North wall"),
            Self.surface("c", key: "wall:east", label: "East wall"),
            Self.surface("d", kind: .floor, key: "floor", label: "Floor")
        ]
        let output = CaptureSurface.disambiguated(input)
        #expect(output.map(\.checklistKey) == ["wall:north-1", "wall:north-2", "wall:east", "floor"])
        #expect(output.map(\.displayLabel) == ["North wall 1", "North wall 2", "East wall", "Floor"])
        // Identity and geometry survive the rewrite.
        #expect(output.map(\.id) == ["a", "b", "c", "d"])
        #expect(output[3].kind == .floor)
    }

    @Test
    func bearingPicksTheDominantHorizontalAxis() {
        let centroid = SIMD3<Float>(0, 0, 0)
        #expect(SurfaceLabeler.bearing(center: .init(5, 0, 1), centroid: centroid) == "east")
        #expect(SurfaceLabeler.bearing(center: .init(-5, 0, 1), centroid: centroid) == "west")
        #expect(SurfaceLabeler.bearing(center: .init(1, 0, 5), centroid: centroid) == "south")
        #expect(SurfaceLabeler.bearing(center: .init(1, 0, -5), centroid: centroid) == "north")
        // Y is ignored entirely, and an |x| == |z| tie resolves on the x axis.
        #expect(SurfaceLabeler.bearing(center: .init(2, 99, 2), centroid: centroid) == "east")
    }
}

struct InstrumentSurfaceCoverageTrackerTests {

    private static let origin = SIMD3<Float>(0, 0, 0)
    private static let forward = SIMD3<Float>(0, 0, -1)

    private static func surface(_ id: String,
                                kind: CaptureSurface.Kind = .wall,
                                center: SIMD3<Float>,
                                key: String? = nil) -> CaptureSurface {
        CaptureSurface(id: id, kind: kind, center: center, normal: .init(0, 0, 1),
                       checklistKey: key ?? id, displayLabel: id)
    }

    @Test
    func configDefaultsAreCarriedAcrossByValue() {
        let config = SurfaceCoverageTracker.Config()
        #expect(config.maxDistanceMeters == 4.0)
        #expect(abs(Double(config.fovHalfAngleRadians) - 0.6108652381980153) < 1e-6)  // 35°
        #expect(config.dwellSecondsToObserve == 1.2)
        #expect(config.floorCeilingRangeMultiplier == 1.6)
        #expect(config.rekeyToleranceMeters == 0.6)
    }

    @Test
    func aSurfaceFlipsToObservedOnlyAtTheDwellThreshold() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([Self.surface("north", center: .init(0, 0, -3))])
        for _ in 0..<11 { tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1) }
        #expect(tracker.coverage.first?.observed == false)   // 1.1 s
        #expect(tracker.coveragePct == 0)
        tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1)
        #expect(tracker.coverage.first?.observed == true)    // 1.2 s
        #expect(abs((tracker.coverage.first?.dwellSeconds ?? 0) - 1.2) < 1e-9)
        #expect(tracker.coveragePct == 100)
    }

    @Test
    func surfacesBehindOrBesideTheCameraNeverAccrueDwell() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([
            Self.surface("ahead", center: .init(0, 0, -3)),
            Self.surface("behind", center: .init(0, 0, 3)),
            Self.surface("beside", center: .init(3, 0, 0))
        ])
        for _ in 0..<40 { tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1) }
        let byId = Dictionary(uniqueKeysWithValues: tracker.coverage.map { ($0.surface.id, $0) })
        #expect(byId["ahead"]?.observed == true)
        #expect(byId["behind"]?.dwellSeconds == 0)
        #expect(byId["beside"]?.dwellSeconds == 0)
        #expect(tracker.unobserved.map(\.id).sorted() == ["behind", "beside"])
        #expect(tracker.coveragePct == 33)   // 1 of 3, rounded
    }

    @Test
    func outOfRangeSurfacesAreIgnoredButFloorsGetTheRelaxedRange() {
        // Identical geometry at ~5.1 m: beyond the 4 m wall range, inside the
        // 4 × 1.6 = 6.4 m floor/ceiling range.
        let far = SIMD3<Float>(0, -1, -5)
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([
            Self.surface("farWall", kind: .wall, center: far),
            Self.surface("farFloor", kind: .floor, center: far),
            Self.surface("farCeiling", kind: .ceiling, center: far)
        ])
        for _ in 0..<20 { tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1) }
        let byId = Dictionary(uniqueKeysWithValues: tracker.coverage.map { ($0.surface.id, $0) })
        #expect(byId["farWall"]?.dwellSeconds == 0)
        #expect(byId["farFloor"]?.observed == true)
        #expect(byId["farCeiling"]?.observed == true)
    }

    @Test
    func anyExtentSampleInViewIsEnough() {
        // The centre is out of range at 5 m, but one edge sample sits at 3 m — the
        // big-room case a centre-only test would false-red.
        let wide = CaptureSurface(id: "wide", kind: .wall, center: .init(0, 0, -5),
                                  normal: .init(0, 0, 1),
                                  samplePoints: [.init(0, 0, -5), .init(0, 0, -3)],
                                  checklistKey: "wide", displayLabel: "Wide")
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([wide])
        for _ in 0..<20 { tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1) }
        #expect(tracker.coverage.first?.observed == true)
    }

    @Test
    func degenerateFramesAreIgnored() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([Self.surface("north", center: .init(0, 0, -3))])
        tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0)
        tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: -5)
        tracker.observe(cameraPosition: Self.origin, cameraForward: .init(0, 0, 0), dt: 10)
        #expect(tracker.coverage.first?.dwellSeconds == 0)
    }

    @Test
    func dwellSurvivesAUuidReissueWithinTolerance() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([Self.surface("old-uuid", center: .init(0, 0, -3), key: "wall:north")])
        for _ in 0..<20 { tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1) }
        #expect(tracker.coverage.first?.observed == true)

        // RoomPlan re-emits the same wall 0.3 m away under a NEW id (< 0.6 m).
        tracker.setSurfaces([Self.surface("new-uuid", center: .init(0.3, 0, -3), key: "wall:north")])
        #expect(tracker.coverage.first?.surface.id == "new-uuid")
        #expect(tracker.coverage.first?.observed == true)
        #expect(abs((tracker.coverage.first?.dwellSeconds ?? 0) - 2.0) < 1e-9)
    }

    @Test
    func dwellDoesNotTransferBeyondToleranceOrAcrossKinds() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([Self.surface("old", center: .init(0, 0, -3))])
        for _ in 0..<20 { tracker.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1) }

        // 1.5 m away — beyond the 0.6 m re-key tolerance.
        tracker.setSurfaces([Self.surface("moved", center: .init(1.5, 0, -3))])
        #expect(tracker.coverage.first?.dwellSeconds == 0)

        // Same place, different kind — a floor must not inherit a wall's dwell.
        let second = SurfaceCoverageTracker()
        second.setSurfaces([Self.surface("wallA", kind: .wall, center: .init(0, 0, -3))])
        for _ in 0..<20 { second.observe(cameraPosition: Self.origin, cameraForward: Self.forward, dt: 0.1) }
        second.setSurfaces([Self.surface("floorA", kind: .floor, center: .init(0, 0, -3))])
        #expect(second.coverage.first?.dwellSeconds == 0)
    }

    @Test
    func coverageIsReportedInInsertionOrderAndDedupesIds() {
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces([
            Self.surface("c", center: .init(0, 0, -3)),
            Self.surface("a", center: .init(0, 0, -3)),
            Self.surface("b", center: .init(0, 0, -3)),
            Self.surface("a", center: .init(1, 0, -3))   // duplicate id — first wins
        ])
        #expect(tracker.coverage.map(\.surface.id) == ["c", "a", "b"])
        #expect(tracker.coverage[1].surface.center == SIMD3<Float>(0, 0, -3))
    }

    @Test
    func anEmptyTrackerReportsZeroPercentNotACrash() {
        let tracker = SurfaceCoverageTracker()
        #expect(tracker.coveragePct == 0)
        #expect(tracker.coverage.isEmpty)
        #expect(tracker.unobserved.isEmpty)
    }
}
