"""Synthetic capture fixtures — a rectangular room built programmatically.

No files, no network, no Modal. The parametric side is produced as a CapturedRoom
document so the tests exercise the real transform-parsing conventions rather than
hand-built dataclasses.

Room convention, matching RoomPlan/ARKit: metres, Y up, floor at y=0, the room
centred on the origin in XZ. `mesh_scale` scales only the CAPTURED geometry, so a
scale of 1.01 is a mesh that disagrees with the model by 1%.
"""

from __future__ import annotations

import numpy as np

WIDTH_M = 4.0    # along x
DEPTH_M = 3.0    # along z
HEIGHT_M = 2.5
SPACING_M = 0.05


def _grid(a0: float, a1: float, b0: float, b1: float, spacing: float):
    na = max(int(round(abs(a1 - a0) / spacing)) + 1, 2)
    nb = max(int(round(abs(b1 - b0) / spacing)) + 1, 2)
    a = np.linspace(a0, a1, na)
    b = np.linspace(b0, b1, nb)
    ga, gb = np.meshgrid(a, b, indexing="ij")
    return ga.reshape(-1), gb.reshape(-1)


def _plane_points(axis: str, fixed: float, u: tuple[float, float], v: tuple[float, float], spacing: float):
    """Points on an axis-aligned plane. `axis` names the constant coordinate."""
    ua, ub = _grid(u[0], u[1], v[0], v[1], spacing)
    n = len(ua)
    pts = np.empty((n, 3))
    if axis == "z":      # u = x, v = y
        pts[:, 0], pts[:, 1], pts[:, 2] = ua, ub, fixed
    elif axis == "x":    # u = z, v = y
        pts[:, 2], pts[:, 1], pts[:, 0] = ua, ub, fixed
    else:                # axis == "y"; u = x, v = z
        pts[:, 0], pts[:, 2], pts[:, 1] = ua, ub, fixed
    return pts


def captured_room_json(
    width: float = WIDTH_M,
    depth: float = DEPTH_M,
    height: float = HEIGHT_M,
) -> dict:
    """The parametric room, in CapturedRoom (RoomPlan JSONEncoder) shape.

    Transform is column-major 4×4: [0..2] is the wall's local +x basis, [12..14]
    is its centre. Wall centre y is height/2 because the floor sits at y=0.
    """
    hw, hd = width / 2.0, depth / 2.0

    def wall(identifier: str, length: float, cx: float, cz: float, basis: tuple[float, float, float]):
        bx, by, bz = basis
        return {
            "identifier": identifier,
            "dimensions": [length, height, 0.1],
            "transform": [
                bx, by, bz, 0.0,
                0.0, 1.0, 0.0, 0.0,
                -bz, 0.0, bx, 0.0,
                cx, height / 2.0, cz, 1.0,
            ],
        }

    return {
        "walls": [
            wall("wall-north", width, 0.0, -hd, (1.0, 0.0, 0.0)),
            wall("wall-south", width, 0.0, hd, (1.0, 0.0, 0.0)),
            wall("wall-west", depth, -hw, 0.0, (0.0, 0.0, 1.0)),
            wall("wall-east", depth, hw, 0.0, (0.0, 0.0, 1.0)),
        ],
        "floors": [],
        "doors": [],
        "windows": [],
        "openings": [],
    }


def mesh_points(
    width: float = WIDTH_M,
    depth: float = DEPTH_M,
    height: float = HEIGHT_M,
    spacing: float = SPACING_M,
    mesh_scale: float = 1.0,
    noise_m: float = 0.0,
    seed: int = 7,
    bow_wall: str | None = None,
    bow_m: float = 0.12,
    furniture: bool = False,
) -> np.ndarray:
    """The captured cloud: 4 walls + floor + ceiling, optionally bowed / furnished."""
    w, d, h = width * mesh_scale, depth * mesh_scale, height * mesh_scale
    hw, hd = w / 2.0, d / 2.0

    parts = [
        _plane_points("z", -hd, (-hw, hw), (0.0, h), spacing),   # north
        _plane_points("z", hd, (-hw, hw), (0.0, h), spacing),    # south
        _plane_points("x", -hw, (-hd, hd), (0.0, h), spacing),   # west
        _plane_points("x", hw, (-hd, hd), (0.0, h), spacing),    # east
        _plane_points("y", 0.0, (-hw, hw), (-hd, hd), spacing),  # floor
        _plane_points("y", h, (-hw, hw), (-hd, hd), spacing),    # ceiling
    ]

    if bow_wall == "wall-north":
        # Parabolic bow into the room, apex at the wall's centre.
        north = parts[0]
        u = north[:, 0] / hw
        north[:, 2] = -hd + bow_m * (1.0 - u * u)

    if furniture:
        # A vertical slab standing free in the middle of the room — a cabinet
        # face. It must be extracted as a plane and then NOT matched to a wall.
        parts.append(_plane_points("x", 0.0, (-0.7, 0.7), (0.2, 1.4), spacing))

    points = np.vstack(parts)
    if noise_m > 0:
        rng = np.random.default_rng(seed)
        points = points + rng.normal(0.0, noise_m, size=points.shape)
    return points


def wall_length_mm(name: str, width: float = WIDTH_M, depth: float = DEPTH_M) -> float:
    return (width if name in ("wall-north", "wall-south") else depth) * 1000.0


# ── arbitrary-orientation rooms ─────────────────────────────────────────────
#
# The rectangular fixture above is axis-aligned and convex, which is exactly the
# shape that hides the two matching failures W0's review found: corner
# double-counting (every corner is a right angle between two full-length walls)
# and short-parallel mismatching (nothing stands in front of anything). These
# builders take an arbitrary footprint so both can be staged.

import math  # noqa: E402  (kept beside the builders that use it)


def _segment_wall_json(identifier: str, a: tuple[float, float], b: tuple[float, float],
                       height: float) -> dict:
    """A CapturedRoom wall for the XZ segment a→b, floor at y=0.

    Column-major 4×4: [0..2] is the wall's local +x basis (the unit direction
    a→b), [12..14] its centre. `dimensions[0]` is the length the parser runs
    ±half of along that basis — the same convention the real transforms use.
    """
    ax, az = a
    bx, bz = b
    length = math.hypot(bx - ax, bz - az)
    ux, uz = (bx - ax) / length, (bz - az) / length
    return {
        "identifier": identifier,
        "dimensions": [length, height, 0.1],
        "transform": [
            ux, 0.0, uz, 0.0,
            0.0, 1.0, 0.0, 0.0,
            -uz, 0.0, ux, 0.0,
            (ax + bx) / 2.0, height / 2.0, (az + bz) / 2.0, 1.0,
        ],
    }


def _segment_wall_points(a: tuple[float, float], b: tuple[float, float],
                         height: float, spacing: float,
                         t0: float = 0.0, t1: float = 1.0) -> np.ndarray:
    """Points on the vertical slab over XZ segment a→b, y in [0, height].

    `t0`/`t1` take a sub-span of the segment — how a partial surface (a closet
    face in front of a longer wall) is staged.
    """
    ax, az = a
    bx, bz = b
    length = math.hypot(bx - ax, bz - az) * (t1 - t0)
    n = max(int(round(length / spacing)) + 1, 2)
    m = max(int(round(height / spacing)) + 1, 2)
    t = np.linspace(t0, t1, n)
    ys = np.linspace(0.0, height, m)
    tt, yy = np.meshgrid(t, ys, indexing="ij")
    x = ax + (bx - ax) * tt
    z = az + (bz - az) * tt
    return np.stack([x.reshape(-1), yy.reshape(-1), z.reshape(-1)], axis=1)


def _slab(x0: float, x1: float, z0: float, z1: float, y: float, spacing: float) -> np.ndarray:
    return _plane_points("y", y, (x0, x1), (z0, z1), spacing)


# An L: the 6 m × 4 m outer rectangle with a 3 m × 2 m bite out of one corner.
# Walked as a closed loop, so consecutive vertices are the wall segments. The
# reflex corner at (0, 0) is the point of the fixture — it is where the
# centroid-based normal orientation stops being exact (see _orient_outward's
# caveat) and where two walls meet at 270°.
L_ROOM_VERTICES: list[tuple[float, float]] = [
    (-3.0, -2.0), (3.0, -2.0), (3.0, 0.0), (0.0, 0.0), (0.0, 2.0), (-3.0, 2.0),
]
L_ROOM_WALL_REFS = [f"l-wall-{i}" for i in range(len(L_ROOM_VERTICES))]


def l_room_json(height: float = HEIGHT_M) -> dict:
    walls = []
    for i, a in enumerate(L_ROOM_VERTICES):
        b = L_ROOM_VERTICES[(i + 1) % len(L_ROOM_VERTICES)]
        walls.append(_segment_wall_json(L_ROOM_WALL_REFS[i], a, b, height))
    return {"walls": walls, "floors": [], "doors": [], "windows": [], "openings": []}


def l_room_points(height: float = HEIGHT_M, spacing: float = SPACING_M) -> np.ndarray:
    parts = []
    for i, a in enumerate(L_ROOM_VERTICES):
        b = L_ROOM_VERTICES[(i + 1) % len(L_ROOM_VERTICES)]
        parts.append(_segment_wall_points(a, b, height, spacing))
    # The L floor and ceiling, each as two coplanar rectangles (one plane apiece).
    for y in (0.0, height):
        parts.append(_slab(-3.0, 3.0, -2.0, 0.0, y, spacing))
        parts.append(_slab(-3.0, 0.0, 0.0, 2.0, y, spacing))
    return np.vstack(parts)


def closet_room_points(
    width: float = WIDTH_M,
    depth: float = DEPTH_M,
    height: float = HEIGHT_M,
    spacing: float = SPACING_M,
    standoff_m: float = 0.30,
    closet_length_m: float = 1.5,
) -> np.ndarray:
    """The rectangular room with its NORTH wall unscanned, and a short closet
    face standing `standoff_m` in front of where that wall is.

    This is the shape that defeats orientation-plus-distance matching: the
    closet plane is parallel to the north wall and 30 cm from its centreline —
    inside `match_dist_m` — so the only thing that can tell it is not the wall
    is that it runs 1.5 m where the wall runs 4 m.
    """
    hw, hd = width / 2.0, depth / 2.0
    half_closet = closet_length_m / 2.0
    parts = [
        # north deliberately absent — occluded by the closet in front of it
        _plane_points("z", hd, (-hw, hw), (0.0, height), spacing),    # south
        _plane_points("x", -hw, (-hd, hd), (0.0, height), spacing),   # west
        _plane_points("x", hw, (-hd, hd), (0.0, height), spacing),    # east
        _plane_points("y", 0.0, (-hw, hw), (-hd, hd), spacing),       # floor
        _plane_points("y", height, (-hw, hw), (-hd, hd), spacing),    # ceiling
        _plane_points(
            "z", -hd + standoff_m, (-half_closet, half_closet), (0.0, height), spacing
        ),
    ]
    return np.vstack(parts)


def write_ply(points: np.ndarray, fmt: str = "ascii", extras: bool = False) -> bytes:
    """Serialize points as PLY — the round-trip counterpart of the reader."""
    import struct

    props = ["property float x", "property float y", "property float z"]
    if extras:
        props += ["property uchar red", "property uchar green", "property uchar blue"]
    header = "\n".join(
        ["ply", f"format {fmt} 1.0", "comment synthetic fixture",
         f"element vertex {len(points)}", *props, "end_header", ""]
    ).encode("ascii")

    if fmt == "ascii":
        rows = []
        for p in points:
            row = f"{p[0]:.6f} {p[1]:.6f} {p[2]:.6f}"
            if extras:
                row += " 10 20 30"
            rows.append(row)
        return header + ("\n".join(rows) + "\n").encode("ascii")

    endian = "<" if fmt == "binary_little_endian" else ">"
    code = endian + ("fffBBB" if extras else "fff")
    body = b"".join(
        struct.pack(code, *(float(v) for v in p), 10, 20, 30) if extras
        else struct.pack(code, *(float(v) for v in p))
        for p in points
    )
    return header + body
