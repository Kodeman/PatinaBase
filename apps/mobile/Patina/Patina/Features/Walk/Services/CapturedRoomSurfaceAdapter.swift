//
//  CapturedRoomSurfaceAdapter.swift
//  Patina
//
//  The RoomPlan-facing half of the `CapturedRoom` → `[CaptureSurface]` bridge.
//  Its pure counterpart is `Instrument/SurfaceSynthesis.swift`, which carries all
//  the arithmetic and every decision worth pinning; read that file's header for
//  why the port is split this way.
//
//  Everything below is mechanical field extraction off RoomPlan types. There are
//  no decisions here beyond two, both carried verbatim from Field's
//  `FieldCoverageCoach`:
//
//    1. WHICH surfaces count as openings, and in WHAT concatenation order:
//       `room.doors + room.windows + room.openings`. The order matters only as
//       the input to `SurfaceSynthesis.orderedOpenings`, which re-sorts it by a
//       cm-quantized spatial key — but a different concatenation would change
//       the outcome for openings that tie on that key.
//    2. WHICH transform columns mean what: column 3 is the world-space centre,
//       columns 0/1 are the local width/height axes, column 2 is the outward
//       normal. Reading column 2 as the normal is what makes the wall's stored
//       `normal` point out of the wall; getting it wrong is invisible today
//       (nothing consumes `CaptureSurface.normal` yet) and would be wrong later.
//
//  `nonisolated` — this is pure and is called from the coach; Patina's
//  project-level SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor would otherwise bind
//  it to the main actor for no reason.
//

import Foundation
import RoomPlan
import simd   // `transform.columns` — RoomPlan re-exports simd_float4x4 but not its members

nonisolated enum CapturedRoomSurfaceAdapter {

    /// The tracked surface set for a live RoomPlan graph: each wall, a
    /// synthesized floor + ceiling, and each opening, disambiguated.
    ///
    /// Returns `[]` for a room with no walls — see `SurfaceSynthesis.surfaces`.
    static func surfaces(from room: CapturedRoom) -> [CaptureSurface] {
        SurfaceSynthesis.surfaces(
            walls: room.walls.map(solid(from:)),
            openings: (room.doors + room.windows + room.openings).map(solid(from:))
        )
    }

    /// Reduce one RoomPlan surface to the six values the synthesis reads.
    ///
    /// `transform` is `simd_float4x4` and COLUMN-major: `columns.3` is the
    /// translation. (`CameraPose` in the substrate works in a ROW-major `[Float]`
    /// flatten instead — different representation, same matrix; the two never
    /// meet, which is why neither file converts to the other.)
    static func solid(from surface: CapturedRoom.Surface) -> SurfaceSolid {
        let transform = surface.transform
        return SurfaceSolid(
            id: surface.identifier.uuidString,
            center: SIMD3<Float>(transform.columns.3.x, transform.columns.3.y, transform.columns.3.z),
            xAxis: SIMD3<Float>(transform.columns.0.x, transform.columns.0.y, transform.columns.0.z),
            yAxis: SIMD3<Float>(transform.columns.1.x, transform.columns.1.y, transform.columns.1.z),
            normal: SIMD3<Float>(transform.columns.2.x, transform.columns.2.y, transform.columns.2.z),
            width: surface.dimensions.x,
            height: surface.dimensions.y
        )
    }
}
