//
//  InstrumentSurfaceSynthesisTests.swift
//  PatinaTests
//
//  Pins the `CapturedRoom` → `[CaptureSurface]` bridge — the piece of Field's
//  instrument that could not come across as pure logic, and the only input
//  `SurfaceCoverageTracker` has.
//
//  ── What is actually at stake here ───────────────────────────────────────────
//  The opening ORDER is a wire contract. It becomes the checklist key
//  ("opening:1"), which becomes a `SurfaceStatus.surface` row in the scorecard
//  and a `ScorecardGap.surface`. If the order is not deterministic across
//  RoomPlan updates, the same room produces different scorecards — and the
//  failure is invisible, because every individual scorecard still validates.
//  Field defends that with a centimetre quantization on the sort key; that
//  quantization is what `subCentimetreJitterDoesNotRenumberOpenings` exists to
//  hold.
//
//  Field's own version of this code is untestable: it reads
//  `CapturedRoom.Surface`, which has no public initializer. Patina's port pushes
//  the arithmetic down onto `SurfaceSolid` so it can be exercised with synthetic
//  rooms; `CapturedRoomSurfaceAdapter` — the RoomPlan field extraction the
//  arithmetic sits behind — is compile-checked only, for exactly that reason.
//

import Testing
import Foundation
@testable import Patina

// MARK: - Fixtures

private enum Room {

    /// A wall centred at `center`, running along `alongZ ? +Z : +X`, 2 m wide and
    /// 2.4 m tall. Normal points back at the room centre for the four-wall box.
    static func wall(_ center: SIMD3<Float>,
                     alongZ: Bool,
                     id: String = UUID().uuidString,
                     width: Float = 2,
                     height: Float = 2.4) -> SurfaceSolid {
        SurfaceSolid(
            id: id,
            center: center,
            xAxis: alongZ ? SIMD3<Float>(0, 0, 1) : SIMD3<Float>(1, 0, 0),
            yAxis: SIMD3<Float>(0, 1, 0),
            normal: alongZ ? SIMD3<Float>(1, 0, 0) : SIMD3<Float>(0, 0, 1),
            width: width,
            height: height
        )
    }

    static func opening(_ center: SIMD3<Float>, id: String) -> SurfaceSolid {
        SurfaceSolid(id: id, center: center)
    }

    /// The canonical 4 × 6 m box: walls at ±3 on X and ±3 on Z, centres at
    /// y = 1.2 with 2.4 m height ⇒ floor y = 0, ceiling y = 2.4, centroid at
    /// (0, 1.2, 0), so bearings resolve to north/south/east/west.
    static var box: [SurfaceSolid] {
        [
            wall(SIMD3<Float>(0, 1.2, -3), alongZ: false, id: "north"),
            wall(SIMD3<Float>(3, 1.2, 0), alongZ: true, id: "east"),
            wall(SIMD3<Float>(0, 1.2, 3), alongZ: false, id: "south"),
            wall(SIMD3<Float>(-3, 1.2, 0), alongZ: true, id: "west")
        ]
    }
}

// MARK: - The quantized ordering

struct InstrumentSurfaceSynthesisOrderingTests {

    @Test
    func centimetreQuantizationRoundsHalfAwayFromZero() {
        // Mirrors Field's `Int((v * 100).rounded())` exactly — `.rounded()` is
        // round-half-away-from-zero, NOT banker's rounding, and the difference
        // shows on values that land precisely on a half-centimetre.
        #expect(SurfaceSynthesis.centimetres(0) == 0)
        #expect(SurfaceSynthesis.centimetres(1) == 100)
        #expect(SurfaceSynthesis.centimetres(0.004) == 0)
        #expect(SurfaceSynthesis.centimetres(0.006) == 1)
        #expect(SurfaceSynthesis.centimetres(0.005) == 1)      // half → away from zero
        #expect(SurfaceSynthesis.centimetres(-0.005) == -1)    // …in both directions
        #expect(SurfaceSynthesis.centimetres(-1.234) == -123)
    }

    @Test
    func openingsSortByCentimetreQuantizedXThenZThenY() {
        // Deliberately shuffled input; only the sort may decide the outcome.
        let openings = [
            Room.opening(SIMD3<Float>(1.0, 2.0, 1.0), id: "x1-z1-y2"),
            Room.opening(SIMD3<Float>(0.0, 5.0, 9.0), id: "x0-z9-y5"),
            Room.opening(SIMD3<Float>(1.0, 0.5, 1.0), id: "x1-z1-y0.5"),
            Room.opening(SIMD3<Float>(0.0, 1.0, 2.0), id: "x0-z2-y1")
        ]
        #expect(SurfaceSynthesis.orderedOpenings(openings).map(\.id)
                == ["x0-z2-y1", "x0-z9-y5", "x1-z1-y0.5", "x1-z1-y2"])
    }

    @Test
    func subCentimetreJitterDoesNotRenumberOpenings() {
        // THE LOAD-BEARING PROPERTY. RoomPlan re-emits its graph continuously and
        // the same physical opening arrives with slightly different floats each
        // time. Without the centimetre quantization these two arrangements sort
        // differently, and "opening:1" swaps identity mid-scan — so the finished
        // scorecard names a gap on a surface the user did cover.
        let steady = [
            Room.opening(SIMD3<Float>(1.000, 0, 0), id: "a"),
            Room.opening(SIMD3<Float>(1.003, 0, 0), id: "b"),
            Room.opening(SIMD3<Float>(1.001, 0, 0), id: "c")
        ]
        let jittered = [
            Room.opening(SIMD3<Float>(1.004, 0, 0), id: "a"),
            Room.opening(SIMD3<Float>(0.997, 0, 0), id: "b"),
            Room.opening(SIMD3<Float>(1.002, 0, 0), id: "c")
        ]
        // All six values quantize to 100 cm, so the x key ties for every pair and
        // the z/y keys (all zero) tie too — input order is preserved and the
        // numbering is identical across the two updates.
        #expect(SurfaceSynthesis.orderedOpenings(steady).map(\.id) == ["a", "b", "c"])
        #expect(SurfaceSynthesis.orderedOpenings(jittered).map(\.id) == ["a", "b", "c"])

        // And a genuine >1 cm move DOES reorder — the quantization must not be so
        // coarse that it stops distinguishing real geometry.
        let moved = [
            Room.opening(SIMD3<Float>(1.000, 0, 0), id: "a"),
            Room.opening(SIMD3<Float>(0.900, 0, 0), id: "b")
        ]
        #expect(SurfaceSynthesis.orderedOpenings(moved).map(\.id) == ["b", "a"])
    }

    @Test
    func openingSurfacesAreNumberedFromTheSortedOrder() {
        let surfaces = SurfaceSynthesis.openingSurfaces([
            Room.opening(SIMD3<Float>(2, 0, 0), id: "far"),
            Room.opening(SIMD3<Float>(0, 0, 0), id: "near")
        ])
        #expect(surfaces.map(\.id) == ["near", "far"])
        #expect(surfaces.map(\.checklistKey) == ["opening:1", "opening:2"])
        #expect(surfaces.map(\.displayLabel) == ["Opening 1", "Opening 2"])
        #expect(surfaces.allSatisfy { $0.kind == .opening })
        // Openings carry no extent samples — the centre is the whole target.
        #expect(surfaces[0].samplePoints.isEmpty)
        #expect(surfaces[0].effectiveSamplePoints == [SIMD3<Float>(0, 0, 0)])
    }
}

// MARK: - Geometry

struct InstrumentSurfaceSynthesisGeometryTests {

    @Test
    func wallSurfaceCarriesFiveSamplePointsAndABearingKey() {
        // Centre + the four edge midpoints, so a glance at any part of a large
        // wall accrues dwell rather than requiring the centre in frame.
        // Dimensions chosen so every expected component is exactly representable
        // as a Float (1.2 ± 1.2 → 0 and 2.4); a 2 m height here would land the
        // lower sample on 0.20000005 and the assertion would be about IEEE754
        // rather than about the port.
        let wall = Room.wall(SIMD3<Float>(0, 1.2, -3), alongZ: false, id: "n", width: 4, height: 2.4)
        let surface = SurfaceSynthesis.wallSurface(wall, centroid: SIMD3<Float>(0, 1.2, 0))

        #expect(surface.id == "n")
        #expect(surface.kind == .wall)
        #expect(surface.checklistKey == "wall:north")
        #expect(surface.displayLabel == "North wall")
        #expect(surface.center == SIMD3<Float>(0, 1.2, -3))
        #expect(surface.normal == SIMD3<Float>(0, 0, 1))
        #expect(surface.samplePoints == [
            SIMD3<Float>(0, 1.2, -3),     // centre
            SIMD3<Float>(2, 1.2, -3),     // +xAxis * width/2
            SIMD3<Float>(-2, 1.2, -3),    // -xAxis * width/2
            SIMD3<Float>(0, 2.4, -3),     // +yAxis * height/2
            SIMD3<Float>(0, 0, -3)        // -yAxis * height/2
        ])
    }

    @Test
    func horizontalSurfacesAreSynthesizedAtTheVerticalExtremes() {
        let bounds = RoomBounds(walls: Room.box)
        let floor = SurfaceSynthesis.horizontalSurface(kind: .floor, bounds: bounds)
        let ceiling = SurfaceSynthesis.horizontalSurface(kind: .ceiling, bounds: bounds)

        // Ids are STABLE strings, not RoomPlan UUIDs — RoomPlan never issued one,
        // and a changing id would reset accumulated dwell on every graph update.
        #expect(floor.id == "floor")
        #expect(ceiling.id == "ceiling")
        #expect(floor.checklistKey == "floor")
        #expect(ceiling.displayLabel == "Ceiling")

        #expect(floor.center == SIMD3<Float>(0, 0, 0))        // minY
        #expect(ceiling.center == SIMD3<Float>(0, 2.4, 0))    // maxY
        #expect(floor.normal == SIMD3<Float>(0, 1, 0))        // up
        #expect(ceiling.normal == SIMD3<Float>(0, -1, 0))     // down

        // Centre + four footprint-edge samples, so an eye-level sweep still sees
        // a large floor rather than missing its centroid entirely.
        #expect(floor.samplePoints == [
            SIMD3<Float>(0, 0, 0),
            SIMD3<Float>(3, 0, 0), SIMD3<Float>(-3, 0, 0),
            SIMD3<Float>(0, 0, 3), SIMD3<Float>(0, 0, -3)
        ])
        #expect(floor.isStructural && ceiling.isStructural)
    }

    @Test
    func roomBoundsUseWallCentresAndAHalfHeightVerticalExtent() {
        let bounds = RoomBounds(walls: Room.box)
        #expect(bounds.centroid == SIMD3<Float>(0, 1.2, 0))
        #expect(bounds.minY == 0)          // 1.2 - 2.4/2
        #expect(bounds.maxY == 2.4)        // 1.2 + 2.4/2
        // Footprint half-extents come from wall CENTRES only, never their widths.
        // That under-states a real room and is deliberate: these place sample
        // points inside the footprint, they do not measure it.
        #expect(bounds.extX == 3)
        #expect(bounds.extZ == 3)
    }

    @Test
    func roomBoundsFloorTheFootprintHalfExtents() {
        // One wall ⇒ zero span on both axes. Without the 0.1 m floor the floor and
        // ceiling would emit five copies of one point and a degenerate room would
        // silently lose its extent samples.
        let bounds = RoomBounds(walls: [Room.wall(SIMD3<Float>(0, 1, 0), alongZ: false)])
        #expect(bounds.extX == 0.1)
        #expect(bounds.extZ == 0.1)

        // And the documented empty-input guard: no NaN centroid.
        let empty = RoomBounds(walls: [])
        #expect(empty.centroid == SIMD3<Float>(0, 0, 0))
        #expect(!empty.centroid.x.isNaN)
    }
}

// MARK: - Assembly

struct InstrumentSurfaceSynthesisAssemblyTests {

    @Test
    func assemblyOrderIsWallsThenFloorThenCeilingThenOpenings() {
        let surfaces = SurfaceSynthesis.surfaces(
            walls: Room.box,
            openings: [
                Room.opening(SIMD3<Float>(2, 1, 0), id: "second"),
                Room.opening(SIMD3<Float>(-2, 1, 0), id: "first")
            ]
        )
        #expect(surfaces.map(\.checklistKey) == [
            "wall:north", "wall:east", "wall:south", "wall:west",
            "floor", "ceiling",
            "opening:1", "opening:2"
        ])
        // Wall order is RoomPlan's own; the openings were re-sorted.
        #expect(surfaces.map(\.id) == [
            "north", "east", "south", "west",
            "floor", "ceiling",
            "first", "second"
        ])
    }

    @Test
    func duplicateBearingsAreDisambiguatedInTheAssembledSet() {
        // Two walls resolving to the same bearing must not collide on the
        // checklist key — a gap named "wall:north" would otherwise be ambiguous.
        let walls = [
            Room.wall(SIMD3<Float>(-1, 1.2, -3), alongZ: false, id: "n1"),
            Room.wall(SIMD3<Float>(1, 1.2, -3), alongZ: false, id: "n2"),
            Room.wall(SIMD3<Float>(0, 1.2, 3), alongZ: false, id: "s")
        ]
        let keys = SurfaceSynthesis.surfaces(walls: walls, openings: []).map(\.checklistKey)
        #expect(keys.prefix(3) == ["wall:north-1", "wall:north-2", "wall:south"])
        #expect(Set(keys).count == keys.count, "every checklist key must be unique")
    }

    @Test
    func aRoomWithNoWallsYieldsNoSurfacesAtAll() {
        // Openings included — carried from Field. Without walls there is no
        // centroid to take bearings against and no bounds to synthesize a floor
        // from, so an opening-only checklist would be meaningless.
        #expect(SurfaceSynthesis.surfaces(
            walls: [],
            openings: [Room.opening(SIMD3<Float>(0, 0, 0), id: "orphan")]
        ).isEmpty)
    }
}

// MARK: - Acceptance: the skipped wall

struct InstrumentSurfaceCoverageAcceptanceTests {

    @Test
    func skippingOneWallProducesANonGreenVerdictNamingThatWall() {
        // The end-to-end criterion the whole coverage lane exists to satisfy,
        // now run against surfaces SYNTHESIZED from a room rather than
        // hand-written ones — which is what this wave added. Before the bridge
        // existed, this could only be tested on surfaces a test invented, so it
        // proved the tracker and nothing about the input it would really get.
        let tracker = SurfaceCoverageTracker()
        tracker.setSurfaces(SurfaceSynthesis.surfaces(walls: Room.box, openings: []))

        // Stand in the middle at eye level and dwell on east, west and south.
        // North is never looked at. Floor and ceiling accrue dwell throughout
        // via their footprint samples, which is the point of having them.
        let eye = SIMD3<Float>(0, 1.2, 0)
        for forward in [SIMD3<Float>(1, 0, 0), SIMD3<Float>(-1, 0, 0), SIMD3<Float>(0, 0, 1)] {
            for _ in 0..<20 {
                tracker.observe(cameraPosition: eye, cameraForward: forward, dt: 0.1)
            }
        }

        let unobserved = tracker.unobserved.map(\.checklistKey)
        #expect(unobserved == ["wall:north"])

        let scorecard = ScorecardEvaluator.make(coverage: tracker.coverage,
                                                sharpFrameRatio: 1.0,
                                                trackingHealth: .good,
                                                anchorCount: 3)
        #expect(scorecard.verdict == .red, "an unobserved structural surface is the hard gate")
        #expect(scorecard.namedGaps?.map(\.surface) == ["wall:north"])
        #expect(scorecard.namedGaps?.first?.phrase == "North wall not fully captured")
        // 5 of 6 surfaces observed.
        #expect(scorecard.coveragePct == 83)
        #expect(scorecard.surfaceChecklist.count == 6)
    }
}

// MARK: - The recorder seam

struct InstrumentCaptureSeamTests {

    @Test
    func sinksReceiveBroadcastsInRegistrationOrder() {
        // Ordering is the seam's one behavioural promise: a recorder registered
        // first sees each sample first. Nothing downstream may depend on it, but
        // a silent reordering would make two lanes disagree about which frame
        // came with which timestamp.
        let registry = CaptureSinkRegistry<String>()
        var deliveredWhileEmpty = 0
        registry.broadcast { _ in deliveredWhileEmpty += 1 }
        #expect(deliveredWhileEmpty == 0)

        registry.add("coach")
        registry.add("keyframes")
        registry.add("probe")
        #expect(registry.count == 3)

        var seen: [String] = []
        registry.broadcast { seen.append($0) }
        #expect(seen == ["coach", "keyframes", "probe"])

        // A second broadcast delivers to the same set, in the same order.
        seen.removeAll()
        registry.broadcast { seen.append($0) }
        #expect(seen == ["coach", "keyframes", "probe"])
    }

    @Test
    func removeAllDetachesEverySink() {
        // Session teardown must actually release the sinks — the registry holds
        // them STRONGLY, so a missed `removeAll` keeps a dead scan's coach alive
        // and accumulating.
        let registry = CaptureSinkRegistry<Int>()
        registry.add(1)
        registry.add(2)
        registry.removeAll()

        var delivered = 0
        registry.broadcast { _ in delivered += 1 }
        #expect(delivered == 0)
    }

    @Test
    func timebaseStampsSecondsSinceStart() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        let timebase = CaptureTimebase(start: start)
        #expect(timebase.seconds(at: start) == 0)
        #expect(timebase.seconds(at: start.addingTimeInterval(2.5)) == 2.5)
        // A pre-start instant yields a negative value rather than clamping —
        // callers stamp with `Date()` at sample time, so a negative here means
        // the clock was re-based mid-session and should be visible, not hidden.
        #expect(timebase.seconds(at: start.addingTimeInterval(-1)) == -1)
        #expect(timebase.secondsNow { start.addingTimeInterval(7) } == 7)
    }
}
