//
//  SurfaceSynthesis.swift
//  Patina
//
//  PORTED FROM Patina Field:
//    apps/mobile/Capture/Capture/Features/SiteScan/FieldCoverageCoach.swift
//    — `surfaces(from:)` (lines 190–201), `wallSurface(_:centroid:)` (205–219),
//      `horizontalSurface(kind:bounds:)` (223–236), `openingSurfaces(from:)`
//      (241–258) and `private struct RoomBounds` (263–289).
//
//  THE GAP THIS CLOSES. Every other piece of the instrument substrate came
//  across as pure logic; this one could not, because Field wrote it directly
//  against RoomPlan types (`CapturedRoom`, `CapturedRoom.Surface`,
//  `simd_float4x4` columns). Without it `SurfaceCoverageTracker` has all its
//  dwell accounting and no surfaces to account for.
//
//  ── Why this is split rather than transcribed ────────────────────────────────
//  Field's version is one RoomPlan-typed function and is therefore not unit
//  testable at all: `CapturedRoom.Surface` has no public initializer, so there is
//  no way to hand it a synthetic room. The DECISIONS inside it are exactly the
//  kind that fail silently — a cm-quantized spatial sort that renumbers openings
//  if it drifts (making the scorecard nondeterministic between two runs of the
//  same room), a wall sample set derived from transform basis columns, a floor
//  and ceiling synthesized from wall bounds.
//
//  So the ARITHMETIC lives here, over `SurfaceSolid` — a plain value type
//  carrying the six numbers the logic actually reads off a RoomPlan surface —
//  and the RoomPlan-facing field extraction is a ~20-line mechanical mapping in
//  `Services/CapturedRoomSurfaceAdapter.swift`. Behaviour is identical to
//  Field's; testability is not.
//
//  `SIMD3<Float>` is stdlib, not `import simd` — no framework imports beyond
//  Foundation, per the substrate rule.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

// MARK: - The RoomPlan surface, reduced to what the logic reads

/// One RoomPlan surface (a wall, door, window or opening) reduced to the values
/// the coverage synthesis actually uses. The adapter fills these from
/// `CapturedRoom.Surface`: `center` / `xAxis` / `yAxis` / `normal` are columns
/// 3, 0, 1 and 2 of `transform`; `width` / `height` are `dimensions.x` / `.y`.
///
/// Openings only ever use `id`, `center` and `normal`; the remaining fields are
/// read for walls.
nonisolated public struct SurfaceSolid: Sendable, Equatable {

    /// Stable identity — `CapturedRoom.Surface.identifier.uuidString`.
    public let id: String
    /// World-space centre (`transform.columns.3`).
    public let center: SIMD3<Float>
    /// Local width axis (`transform.columns.0`).
    public let xAxis: SIMD3<Float>
    /// Local height axis (`transform.columns.1`).
    public let yAxis: SIMD3<Float>
    /// Outward normal (`transform.columns.2`).
    public let normal: SIMD3<Float>
    /// `dimensions.x` — extent along `xAxis`.
    public let width: Float
    /// `dimensions.y` — extent along `yAxis`.
    public let height: Float

    public init(id: String,
                center: SIMD3<Float>,
                xAxis: SIMD3<Float> = SIMD3<Float>(1, 0, 0),
                yAxis: SIMD3<Float> = SIMD3<Float>(0, 1, 0),
                normal: SIMD3<Float> = SIMD3<Float>(0, 0, 1),
                width: Float = 0,
                height: Float = 0) {
        self.id = id
        self.center = center
        self.xAxis = xAxis
        self.yAxis = yAxis
        self.normal = normal
        self.width = width
        self.height = height
    }
}

// MARK: - Room bounds

/// Room bounds derived from wall geometry (centroid, vertical extent, XZ
/// footprint half-extents) for floor/ceiling synthesis. Carried from Field's
/// `private struct RoomBounds` unchanged, including two things worth naming
/// because they look like bugs and are not:
///
///  • The XZ footprint is computed from wall CENTRES only, never from wall
///    extents — so `extX`/`extZ` under-state a real room. They exist to place
///    floor/ceiling sample points inside the footprint, not to measure it.
///  • `extX`/`extZ` have a 0.1 m floor, so a single-wall (degenerate) room still
///    yields four distinct horizontal samples rather than four copies of the
///    centre.
nonisolated public struct RoomBounds: Sendable, Equatable {

    public let centroid: SIMD3<Float>
    public let minY: Float
    public let maxY: Float
    public let extX: Float
    public let extZ: Float

    /// Empty-wall guard: Field never constructs `RoomBounds` without walls
    /// (`surfaces(from:)` returns early), and dividing by a zero wall count
    /// would produce NaN. This mirrors that precondition explicitly.
    public init(walls: [SurfaceSolid]) {
        guard !walls.isEmpty else {
            centroid = SIMD3<Float>(0, 0, 0)
            minY = 0
            maxY = 0
            extX = 0.1
            extZ = 0.1
            return
        }

        var sum = SIMD3<Float>(0, 0, 0)
        var lowY: Float = .greatestFiniteMagnitude, highY: Float = -.greatestFiniteMagnitude
        var lowX: Float = .greatestFiniteMagnitude, highX: Float = -.greatestFiniteMagnitude
        var lowZ: Float = .greatestFiniteMagnitude, highZ: Float = -.greatestFiniteMagnitude
        for wall in walls {
            let centre = wall.center
            sum += centre
            let halfH = wall.height / 2
            lowY = min(lowY, centre.y - halfH); highY = max(highY, centre.y + halfH)
            lowX = min(lowX, centre.x); highX = max(highX, centre.x)
            lowZ = min(lowZ, centre.z); highZ = max(highZ, centre.z)
        }
        centroid = sum / Float(walls.count)
        minY = lowY
        maxY = highY
        extX = max(0.1, (highX - lowX) / 2)
        extZ = max(0.1, (highZ - lowZ) / 2)
    }
}

// MARK: - Synthesis

nonisolated public enum SurfaceSynthesis {

    /// Parametric surfaces from a RoomPlan graph: each wall (with edge samples),
    /// a synthesized floor + ceiling (footprint samples so a wall-height sweep
    /// still sees them), and each opening, numbered by a stable spatial sort.
    /// Duplicate bearing keys are disambiguated last.
    ///
    /// Empty `walls` yields NO surfaces AT ALL — openings included. Carried from
    /// Field (`guard !walls.isEmpty else { return [] }`): without walls there is
    /// no centroid to take bearings against and no bounds to synthesize a floor
    /// from, so an opening-only checklist would be meaningless. In practice
    /// RoomPlan emits walls long before it emits openings.
    ///
    /// - Parameters:
    ///   - walls: `room.walls`, in RoomPlan's order (preserved).
    ///   - openings: `room.doors + room.windows + room.openings`, in that
    ///     concatenation order — this function applies the spatial sort itself.
    public static func surfaces(walls: [SurfaceSolid], openings: [SurfaceSolid]) -> [CaptureSurface] {
        guard !walls.isEmpty else { return [] }
        let bounds = RoomBounds(walls: walls)

        var surfaces = walls.map { wallSurface($0, centroid: bounds.centroid) }
        surfaces.append(horizontalSurface(kind: .floor, bounds: bounds))
        surfaces.append(horizontalSurface(kind: .ceiling, bounds: bounds))
        surfaces.append(contentsOf: openingSurfaces(openings))

        return CaptureSurface.disambiguated(surfaces)
    }

    /// A wall + its 4 edge-midpoint samples (from the surface's local width /
    /// height axes) so a partial glance at a big wall still accrues dwell. Note
    /// the sample list is FIVE points — the centre plus the four midpoints;
    /// carried from Field exactly.
    public static func wallSurface(_ wall: SurfaceSolid, centroid: SIMD3<Float>) -> CaptureSurface {
        let center = wall.center
        let dx = wall.xAxis * (wall.width / 2)
        let dy = wall.yAxis * (wall.height / 2)
        let samples = [center, center + dx, center - dx, center + dy, center - dy]
        let bearing = SurfaceLabeler.bearing(center: center, centroid: centroid)
        return CaptureSurface(
            id: wall.id, kind: .wall, center: center,
            normal: wall.normal, samplePoints: samples,
            checklistKey: "wall:\(bearing)", displayLabel: "\(bearing.capitalized) wall")
    }

    /// A synthesized floor/ceiling with centroid + 4 footprint-edge samples. Its
    /// id, key, label, y and normal all derive from `kind` ("floor"/"ceiling"),
    /// so the tracking id is STABLE across graph updates even though RoomPlan
    /// never issued one.
    public static func horizontalSurface(kind: CaptureSurface.Kind, bounds: RoomBounds) -> CaptureSurface {
        let isFloor = kind == .floor
        let y = isFloor ? bounds.minY : bounds.maxY
        let key = kind.rawValue                     // "floor" / "ceiling"
        let centre = bounds.centroid
        let samples = [
            SIMD3<Float>(centre.x, y, centre.z),
            SIMD3<Float>(centre.x + bounds.extX, y, centre.z),
            SIMD3<Float>(centre.x - bounds.extX, y, centre.z),
            SIMD3<Float>(centre.x, y, centre.z + bounds.extZ),
            SIMD3<Float>(centre.x, y, centre.z - bounds.extZ)
        ]
        return CaptureSurface(id: key, kind: kind, center: SIMD3<Float>(centre.x, y, centre.z),
                              normal: SIMD3<Float>(0, isFloor ? 1 : -1, 0), samplePoints: samples,
                              checklistKey: key, displayLabel: key.capitalized)
    }

    /// Openings (doors + windows + openings) numbered by a stable spatial sort,
    /// with each axis QUANTIZED to the centimetre so sub-cm float jitter between
    /// RoomPlan updates cannot renumber them.
    ///
    /// ⚠ THE ORDERING IS LOAD-BEARING. The opening number becomes the checklist
    /// key ("opening:1") which becomes a `SurfaceStatus.surface` row in
    /// `scorecard.json` and a `ScorecardGap.surface`. A different order means a
    /// different scorecard for the same room, which is why the quantization is
    /// carried verbatim and pinned by `InstrumentSurfaceSynthesisTests`.
    ///
    /// Residual hazard, carried from Field rather than silently diverged from:
    /// `sorted(by:)` is not a stable sort, so two openings that quantize to the
    /// SAME (x, z, y) centimetre triple may swap between updates. Adding the
    /// identifier as a final tie-break would fix it and would also change the
    /// numbering Field produces for such a room; that is a cross-app wire
    /// decision, not a port decision.
    public static func openingSurfaces(_ openings: [SurfaceSolid]) -> [CaptureSurface] {
        orderedOpenings(openings).enumerated().map { index, opening in
            let number = index + 1
            return CaptureSurface(
                id: opening.id, kind: .opening,
                center: opening.center, normal: opening.normal,
                checklistKey: "opening:\(number)", displayLabel: "Opening \(number)")
        }
    }

    /// The cm-quantized spatial sort, exposed so it can be pinned directly.
    /// Sort key: centimetre-rounded x, then z, then y.
    public static func orderedOpenings(_ openings: [SurfaceSolid]) -> [SurfaceSolid] {
        openings.sorted { lhs, rhs in
            let left = lhs.center, right = rhs.center
            if centimetres(left.x) != centimetres(right.x) {
                return centimetres(left.x) < centimetres(right.x)
            }
            if centimetres(left.z) != centimetres(right.z) {
                return centimetres(left.z) < centimetres(right.z)
            }
            return centimetres(left.y) < centimetres(right.y)
        }
    }

    /// Metres → centimetres, rounded. `Float.rounded()` is round-half-away-from-
    /// zero, matching Field's `Int((v * 100).rounded())`.
    public static func centimetres(_ metres: Float) -> Int {
        Int((metres * 100).rounded())
    }
}
