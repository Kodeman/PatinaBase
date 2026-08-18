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
