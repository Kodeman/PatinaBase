"""IFC4 export via ifcopenshell — the fourth drawings-stage serializer, added
alongside svg / pdf / dxf (W2 IFC lane, `docs/architecture/CAD Generation
Pipeline/DELIVERY-PLAN.md` §3). Mirrors `drawing/dxf.py`'s export-module
pattern: consumes the SAME RoomModel geometry the other three sheets consume
(not the flattened, feet-scaled Sheet/Line/Rect primitives dxf.py draws —
IFC is a real 3D BIM model, not another 2D sheet), and stays pure except for
the ifcopenshell import (deferred, mirroring ezdxf's lazy import in
`build_dxf`, so importing this module never requires ifcopenshell to be
installed).

Hierarchy: IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey. One
IfcWall per model wall (extruded-solid geometry from its centerline span,
height, and thickness), one IfcOpeningElement per door/window/opening voiding
its parent wall (IfcRelVoidsElement via HasOpenings), filled by an
IfcDoor/IfcWindow where the source element is a door/window, and one IfcSlab
for the floor.

WALL THICKNESS is a PARAMETER, not a measurement (stages/dimensions.py tags it
'estimated'/RoomPlan-invented even when RoomPlan does report a value — it is
never anchor-corrected). `WallDim.thickness_m` carries RoomPlan's own figure
when present; drawing/dxf.py never draws wall thickness at all (its walls are
bare centerlines), so there is no existing "value the DXF uses" to mirror for
the case RoomPlan omits it. `_DEFAULT_WALL_THICKNESS_M` fills that gap — a
documented convention in the same spirit as the tolerance model's own
invented-thickness fallback.

COORDINATE FRAME mirrors drawing/model.py's plan alignment: the same
length-weighted theta rotation the plan/elevation sheets use, and the same
certificate `scale` correction (`model.py`'s `k = M_TO_FT * scale`, here
without the feet conversion — IFC's project units are SI metres). Unlike the
flattened sheet projection, this stays a genuine right-handed 3D frame: plan
X/Y are the ROTATED (never mirrored) world X/Z, Z is vertical (world Y).
model.py mirrors one plan axis for an on-paper "north up" elevation
convenience; doing that here would reflect the model into a left-handed
frame, which would be a real correctness bug in a BIM export.

DETERMINISM. Two runs over the same (model, meta) must be byte-identical:
  * every entity is created in a FIXED order (room.walls / room.openings in
    RoomModel list order), so ifcopenshell's STEP line numbering (#N) is
    stable run-to-run;
  * the FILE_NAME/FILE_DESCRIPTION header is fully overridden with literal,
    install-independent strings and `meta["generated_at"]` — ifcopenshell's
    default header stamps a wall-clock time_stamp plus a build-hash-suffixed
    "IfcOpenShell x.y.z-<hash>" preprocessor/originating-system pair;
  * OwnerHistory is left unset (None) everywhere: IFC4's
    `ifcopenshell.api.owner.create_owner_history` returns None unless a
    user/application is registered via `ifcopenshell.api.owner.settings`,
    which this module never touches;
  * every IfcRoot entity's GlobalId — including the relationship entities
    (IfcRelAggregates, IfcRelContainedInSpatialStructure, IfcRelVoidsElement,
    IfcRelFillsElement all inherit IfcRoot in IFC4) that ifcopenshell.api.*
    helpers stamp with a random `ifcopenshell.guid.new()` — is re-stamped, in
    one final deterministic pass, from a UUIDv5 of (scan_id, "<Class>:<rank>")
    where rank is the entity's position in creation order. Never
    `ifcopenshell.guid.new()` in this module's own output.
"""

from __future__ import annotations

import math
import uuid
from typing import Any

from ..stages.captured_room import RoomModel

# 4-inch stud wall — RoomPlan sometimes omits wall thickness (`WallDim.
# thickness_m is None`); see module docstring.
_DEFAULT_WALL_THICKNESS_M = 0.1016
# matches model.py's elevation-sheet fallback for a missing wall height.
_DEFAULT_CEILING_HEIGHT_M = 2.7
# structural slab depth is not part of the RoomPlan model at all; a documented
# convention, same spirit as the wall-thickness fallback above.
_DEFAULT_SLAB_DEPTH_M = 0.1
# fillers (door/window leaves) sit slightly proud of the wall face so they are
# never coplanar/degenerate with it.
_FILLER_THICKNESS_FACTOR = 0.8
# the opening void must be strictly thicker than the wall it cuts, or the
# boolean leaves a sliver at each face (float-noise territory).
_OPENING_OVERCUT_FACTOR = 1.5

# Fixed namespace for this module's GlobalId UUIDv5s. Never regenerate.
_GUID_NAMESPACE = uuid.UUID("6f6e2b0e-df9f-4b0a-9b8b-9a2b6a9dcb61")

_HEADER_ORG = ("Patina",)
_HEADER_AUTHOR = ("Patina Scan Worker",)
_HEADER_PREPROCESSOR = "PatinaScanWorker-IFC/1"
_HEADER_ORIGINATING_SYSTEM = "patina-scan-worker/drawings"


def _stable_guid(scan_id: str, ref: str) -> str:
    import ifcopenshell.guid as guid

    u = uuid.uuid5(_GUID_NAMESPACE, f"{scan_id}:{ref}")
    return guid.compress(u.hex)


def _rotate_neg(x: float, z: float, theta: float) -> tuple[float, float]:
    # identical to captured_room.py / drawing/model.py's rotation helper.
    c, s = math.cos(theta), math.sin(theta)
    return (x * c + z * s, -x * s + z * c)


def _convex_hull(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    # identical algorithm to captured_room.py's floor-polygon fallback — reused
    # here because RoomModel does not retain the true floor polygon (only the
    # aggregate width/depth/area derived from it), so the floor slab's outline
    # is derived from the wall-endpoint hull exactly as that fallback does. A
    # concave (L-shaped) room's slab will be its convex hull, not its true
    # concave outline — a known, documented limitation of this fallback.
    uniq = sorted(set(pts))
    if len(uniq) <= 2:
        return uniq

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[float, float]] = []
    for p in uniq:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[float, float]] = []
    for p in reversed(uniq):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


class _Wall:
    __slots__ = ("entity", "p1", "p2", "ux", "uy", "length", "thickness", "height", "base_z")

    def __init__(self, entity, p1, p2, thickness, height, base_z):
        self.entity = entity
        self.p1 = p1
        self.p2 = p2
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        length = math.hypot(dx, dy) or 1.0
        self.length = length
        self.ux, self.uy = dx / length, dy / length
        self.thickness = thickness
        self.height = height
        self.base_z = base_z


def build_ifc(model: RoomModel, meta: dict[str, Any]) -> bytes:
    """Build a deterministic IFC4 file from the same RoomModel geometry the
    SVG/PDF/DXF sheets are built from.

    ``meta``: {"scan_id": str, "project": str, "room": str,
    "generated_at": str (ISO date), "scale": float (certificate scale, default
    1.0)}. Returns the IFC-SPF file as UTF-8 bytes.
    """
    import ifcopenshell
    import ifcopenshell.api.aggregate
    import ifcopenshell.api.context
    import ifcopenshell.api.feature
    import ifcopenshell.api.geometry
    import ifcopenshell.api.root
    import ifcopenshell.api.spatial
    import ifcopenshell.api.unit

    scan_id = str(meta.get("scan_id") or "unknown-scan")
    scale = float(meta.get("scale") or 1.0) or 1.0
    generated_at = str(meta.get("generated_at") or "1970-01-01")
    project_name = str(meta.get("project") or "Patina Field Capture")
    room_name = str(meta.get("room") or "Room")

    f = ifcopenshell.file(schema="IFC4")
    _set_header(f, generated_at)

    project = ifcopenshell.api.root.create_entity(f, ifc_class="IfcProject", name=project_name)
    ifcopenshell.api.unit.assign_unit(f, length={"is_metric": True, "raw": "METERS"})
    model_ctx = ifcopenshell.api.context.add_context(f, context_type="Model")
    body_ctx = ifcopenshell.api.context.add_context(
        f, context_type="Model", context_identifier="Body",
        target_view="MODEL_VIEW", parent=model_ctx,
    )

    site = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuildingStorey", name=room_name)
    ifcopenshell.api.aggregate.assign_object(f, relating_object=project, products=[site])
    ifcopenshell.api.aggregate.assign_object(f, relating_object=site, products=[building])
    ifcopenshell.api.aggregate.assign_object(f, relating_object=building, products=[storey])

    theta = model.theta_rad
    plan_pts = [
        pt for w in model.walls
        for pt in (_rotate_neg(*w.a_xz, theta), _rotate_neg(*w.b_xz, theta))
    ]
    minx = min((p[0] for p in plan_pts), default=0.0)
    minz = min((p[1] for p in plan_pts), default=0.0)

    def plan_xy(x: float, z: float) -> tuple[float, float]:
        rx, rz = _rotate_neg(x, z, theta)
        return ((rx - minx) * scale, (rz - minz) * scale)

    apple_id_to_wall: dict[str, _Wall] = {}
    for i, w in enumerate(model.walls):
        p1 = plan_xy(*w.a_xz)
        p2 = plan_xy(*w.b_xz)
        height = (
            w.height_m * scale
            if math.isfinite(w.height_m) and w.height_m > 0
            else _DEFAULT_CEILING_HEIGHT_M
        )
        thickness = (
            w.thickness_m * scale
            if w.thickness_m is not None and math.isfinite(w.thickness_m) and w.thickness_m > 0
            else _DEFAULT_WALL_THICKNESS_M
        )
        base_z = w.base_y_m * scale if math.isfinite(w.base_y_m) else 0.0

        entity = ifcopenshell.api.root.create_entity(f, ifc_class="IfcWall", name=f"Wall-{i}")
        ifcopenshell.api.spatial.assign_container(f, relating_structure=storey, products=[entity])
        _set_wall_geometry(f, body_ctx, entity, p1, p2, thickness, height, base_z)

        wall = _Wall(entity, p1, p2, thickness, height, base_z)
        if w.apple_id:
            apple_id_to_wall[w.apple_id] = wall

    for oi, o in enumerate(model.openings):
        parent = apple_id_to_wall.get(o.parent_id) if o.parent_id else None
        ow = max(o.width_m * scale, 0.01)
        oh = max(o.height_m * scale, 0.01)

        if parent is not None:
            wlen = parent.length
            opx, opz = plan_xy(o.center_x_m, o.center_z_m)
            along = (opx - parent.p1[0]) * parent.ux + (opz - parent.p1[1]) * parent.uy
            along = max(ow / 2, min(wlen - ow / 2, along))
            center = (parent.p1[0] + along * parent.ux, parent.p1[1] + along * parent.uy)
            ux, uy = parent.ux, parent.uy
            wall_thickness = parent.thickness
            base_z = parent.base_z
        else:
            # orphaned opening (no parent_id match) — degrade to a floating
            # void so element counts still match the model; nothing to void.
            center = plan_xy(o.center_x_m, o.center_z_m)
            ux, uy = 1.0, 0.0
            wall_thickness = _DEFAULT_WALL_THICKNESS_M
            base_z = 0.0

        if math.isfinite(o.center_y_m):
            sill = o.center_y_m * scale - oh / 2 - base_z
        else:
            sill = 0.0

        op_thickness = wall_thickness * _OPENING_OVERCUT_FACTOR
        opening = ifcopenshell.api.root.create_entity(f, ifc_class="IfcOpeningElement", name=f"Opening-{oi}")
        _set_box_geometry(
            f, body_ctx, opening, center, ux, uy, ow, oh, op_thickness, base_z + sill,
        )
        if parent is not None:
            ifcopenshell.api.feature.add_feature(f, feature=opening, element=parent.entity)

        filler_class = {"door": "IfcDoor", "window": "IfcWindow"}.get(o.kind)
        if filler_class:
            filler = ifcopenshell.api.root.create_entity(
                f, ifc_class=filler_class, name=f"{o.kind.capitalize()}-{oi}",
            )
            ifcopenshell.api.spatial.assign_container(f, relating_structure=storey, products=[filler])
            _set_box_geometry(
                f, body_ctx, filler, center, ux, uy, ow, oh,
                wall_thickness * _FILLER_THICKNESS_FACTOR, base_z + sill,
            )
            ifcopenshell.api.feature.add_filling(f, opening=opening, element=filler)

    hull = _convex_hull(
        [plan_xy(*w.a_xz) for w in model.walls] + [plan_xy(*w.b_xz) for w in model.walls]
    )
    if len(hull) >= 3:
        floor_z = min(
            (w.base_y_m for w in model.walls if math.isfinite(w.base_y_m)), default=0.0
        ) * scale
        slab = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSlab", name="Floor")
        ifcopenshell.api.spatial.assign_container(f, relating_structure=storey, products=[slab])
        rep = ifcopenshell.api.geometry.add_slab_representation(
            f, context=body_ctx, depth=_DEFAULT_SLAB_DEPTH_M,
            direction_sense="NEGATIVE", polyline=hull,
        )
        ifcopenshell.api.geometry.assign_representation(f, product=slab, representation=rep)
        _place_identity(f, slab, z=floor_z)

    _restamp_guids(f, scan_id)

    return f.to_string().encode("utf-8")


def _set_header(f: Any, generated_at: str) -> None:
    h = f.header
    fn = h.file_name
    fn.name = "room.ifc"
    fn.time_stamp = f"{generated_at}T00:00:00"
    fn.author = _HEADER_AUTHOR
    fn.organization = _HEADER_ORG
    fn.preprocessor_version = _HEADER_PREPROCESSOR
    fn.originating_system = _HEADER_ORIGINATING_SYSTEM
    fn.authorization = ""
    fd = h.file_description
    fd.description = ("ViewDefinition [CoordinationView]",)


def _set_wall_geometry(
    f: Any, body_ctx: Any, wall: Any,
    p1: tuple[float, float], p2: tuple[float, float],
    thickness: float, height: float, base_z: float,
) -> None:
    """Extrude a (height x thickness) cross-section HORIZONTALLY along the
    wall's own centerline direction by its length — i.e.
    IfcExtrudedAreaSolid.Depth == the wall's parametric length, not its
    height. Verified against ifcopenshell.geom (world-coords) during
    development: this is the one geometry builder in this module NOT routed
    through ifcopenshell.api.geometry.add_wall_representation, which extrudes
    the other way (Depth == height); worth the extra explicitness so a
    reader of an exported wall's Depth attribute sees its span, matching how
    dxf.py/model.py already report wall LENGTH as the primary dimension."""
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length

    wall.ObjectPlacement = f.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=f.create_entity(
            "IfcAxis2Placement3D",
            Location=f.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0)),
        ),
    )
    # profile lives in the (u = height, v = thickness) plane, centered on the
    # centerline (v in [-thickness/2, thickness/2]); Position.Axis = the wall
    # direction, so ExtrudedDirection=(0,0,1) (Position-local Z) sweeps along
    # the wall's run and Depth becomes its length.
    pts = [
        (0.0, -thickness / 2), (0.0, thickness / 2),
        (height, thickness / 2), (height, -thickness / 2),
        (0.0, -thickness / 2),
    ]
    profile = f.create_entity(
        "IfcArbitraryClosedProfileDef", ProfileType="AREA",
        OuterCurve=f.create_entity(
            "IfcPolyline", Points=[f.create_entity("IfcCartesianPoint", Coordinates=p) for p in pts]
        ),
    )
    position = f.create_entity(
        "IfcAxis2Placement3D",
        Location=f.create_entity("IfcCartesianPoint", Coordinates=(p1[0], p1[1], base_z)),
        Axis=f.create_entity("IfcDirection", DirectionRatios=(ux, uy, 0.0)),
        RefDirection=f.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
    )
    solid = f.create_entity(
        "IfcExtrudedAreaSolid", SweptArea=profile, Position=position,
        ExtrudedDirection=f.create_entity("IfcDirection", DirectionRatios=(0.0, 0.0, 1.0)),
        Depth=length,
    )
    shape_rep = f.create_entity(
        "IfcShapeRepresentation", ContextOfItems=body_ctx,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid],
    )
    wall.Representation = f.create_entity("IfcProductDefinitionShape", Representations=[shape_rep])


def _set_box_geometry(
    f: Any, body_ctx: Any, element: Any,
    center: tuple[float, float], ux: float, uy: float,
    width: float, height: float, thickness: float, elevation: float,
) -> None:
    """A simple box (opening void / door / window filler): the standard
    ifcopenshell.api.geometry vertical-extrusion convention (Depth ==
    height), centered on ``center`` along direction (ux, uy), thickness
    centered on the centerline. No Depth constraint applies to these
    elements (only IfcWall's Depth == length, per _set_wall_geometry)."""
    import numpy as np

    import ifcopenshell.api.geometry

    rep = ifcopenshell.api.geometry.add_wall_representation(
        f, context=body_ctx, length=width, height=height,
        thickness=thickness, offset=-thickness / 2,
    )
    ifcopenshell.api.geometry.assign_representation(f, product=element, representation=rep)

    p1 = (center[0] - (width / 2) * ux, center[1] - (width / 2) * uy)
    matrix = np.array([
        [ux, -uy, 0.0, p1[0]],
        [uy, ux, 0.0, p1[1]],
        [0.0, 0.0, 1.0, elevation],
        [0.0, 0.0, 0.0, 1.0],
    ])
    ifcopenshell.api.geometry.edit_object_placement(f, product=element, matrix=matrix)


def _place_identity(f: Any, element: Any, z: float) -> None:
    element.ObjectPlacement = f.create_entity(
        "IfcLocalPlacement",
        RelativePlacement=f.create_entity(
            "IfcAxis2Placement3D",
            Location=f.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, z)),
        ),
    )


def _restamp_guids(f: Any, scan_id: str) -> None:
    roots = sorted(f.by_type("IfcRoot"), key=lambda e: e.id())
    for i, ent in enumerate(roots):
        ent.GlobalId = _stable_guid(scan_id, f"{ent.is_a()}:{i}")
