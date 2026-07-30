//
//  CaptureSurface.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/CaptureSurface.swift
//
//  A pure, ARKit-free representation of one room surface the coach/QA gate tracks
//  ("per-surface checklist: walls, ceiling, floor, each opening"). The later wiring
//  wave derives these from a live RoomPlan `CapturedRoom` and feeds them to the pure
//  `SurfaceCoverageTracker`, so the coverage logic is testable with synthetic
//  surfaces + camera poses (no RoomPlan, no device).
//
//  `id` is the STABLE tracking key (a RoomPlan surface UUID, or "floor"/"ceiling")
//  so accumulated dwell survives the graph re-emitting each update. `checklistKey`
//  is UNIQUE per surface (bearing collisions are disambiguated with an index —
//  `disambiguated(_:)`); `displayLabel` is placeholder wording.
//
//  `samplePoints` are extent samples (edges/corners for a wall, footprint offsets
//  for floor/ceiling) so a big surface counts observed when ANY sample falls in the
//  camera cone within range — a wall-height sweep still sees the floor, rather than
//  a center-only test forcing a false-red on a large room.
//
//  `SIMD3<Float>` is stdlib, not `import simd` — this file has no framework imports
//  beyond Foundation.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public struct CaptureSurface: Sendable, Equatable {

    public enum Kind: String, Sendable, Codable {
        case wall, floor, ceiling, opening

        /// Structural surfaces gate the verdict harder than openings (a missed wall
        /// is a red; a missed opening is at most amber).
        public var isStructural: Bool { self == .wall || self == .floor || self == .ceiling }
    }

    /// Stable tracking id (RoomPlan surface UUID string, or "floor"/"ceiling").
    public let id: String
    public let kind: Kind
    /// World-space center (metres, ARKit frame).
    public let center: SIMD3<Float>
    /// World-space outward normal (unit-ish; used for facing checks / bearing).
    public let normal: SIMD3<Float>
    /// Extent sample points (world space). Empty ⇒ center only.
    public let samplePoints: [SIMD3<Float>]
    /// Manifest checklist key — UNIQUE, e.g. "wall:north", "wall:north-2", "floor".
    public let checklistKey: String
    /// User-facing name — placeholder wording (e.g. "North wall").
    public let displayLabel: String

    public init(id: String, kind: Kind, center: SIMD3<Float>, normal: SIMD3<Float>,
                samplePoints: [SIMD3<Float>] = [], checklistKey: String, displayLabel: String) {
        self.id = id
        self.kind = kind
        self.center = center
        self.normal = normal
        self.samplePoints = samplePoints
        self.checklistKey = checklistKey
        self.displayLabel = displayLabel
    }

    public var isStructural: Bool { kind.isStructural }

    /// The points the tracker tests — the extent samples, or the center if none.
    public var effectiveSamplePoints: [SIMD3<Float>] {
        samplePoints.isEmpty ? [center] : samplePoints
    }

    /// Make `checklistKey`s unique: surfaces sharing a base key get a 1-based index
    /// suffix ("wall:north" → "wall:north-1"/"-2", "North wall" → "North wall 1"/"2"),
    /// so checklist rows and gaps never collide on identity.
    public static func disambiguated(_ surfaces: [CaptureSurface]) -> [CaptureSurface] {
        var totals: [String: Int] = [:]
        for surface in surfaces { totals[surface.checklistKey, default: 0] += 1 }
        var seen: [String: Int] = [:]
        return surfaces.map { surface in
            guard (totals[surface.checklistKey] ?? 0) > 1 else { return surface }
            seen[surface.checklistKey, default: 0] += 1
            let ordinal = seen[surface.checklistKey] ?? 1
            return CaptureSurface(id: surface.id, kind: surface.kind, center: surface.center,
                                  normal: surface.normal, samplePoints: surface.samplePoints,
                                  checklistKey: "\(surface.checklistKey)-\(ordinal)",
                                  displayLabel: "\(surface.displayLabel) \(ordinal)")
        }
    }
}
