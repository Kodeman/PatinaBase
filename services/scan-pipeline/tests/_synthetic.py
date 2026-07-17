"""Synthetic CapturedRoom + matching anchors for solve tests (and mirrored in the
e2e driver). A rectangular room with axis-aligned walls, a floor polygon, and an
optional door — geometry known exactly so residuals/classes are assertable."""

from __future__ import annotations


def _wall(identifier, cx, cy, cz, length, height, thickness, along):
    # column-major 4x4; the parser reads x-basis (T[0],T[2]) + translation (T[12..14])
    if along == "x":
        T = [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  cx, cy, cz, 1]
    else:  # along z
        T = [0, 0, 1, 0,  0, 1, 0, 0,  -1, 0, 0, 0,  cx, cy, cz, 1]
    return {
        "identifier": identifier,
        "confidence": "high",
        "dimensions": [length, height, thickness],
        "transform": T,
    }


def rectangular_room(x0, x1, z0, z1, h, th=0.1, with_door=False):
    """Walls: north(z0)/south(z1) run along x; east(x1)/west(x0) run along z."""
    midx = (x0 + x1) / 2
    midz = (z0 + z1) / 2
    wx = x1 - x0
    wz = z1 - z0
    walls = [
        _wall("wall-north", midx, h / 2, z0, wx, h, th, "x"),
        _wall("wall-south", midx, h / 2, z1, wx, h, th, "x"),
        _wall("wall-east", x1, h / 2, midz, wz, h, th, "z"),
        _wall("wall-west", x0, h / 2, midz, wz, h, th, "z"),
    ]
    room: dict = {
        "walls": walls,
        "doors": [],
        "windows": [],
        "openings": [],
        "floors": [{
            "identifier": "floor-0",
            "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            "polygonCorners": [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]],
        }],
        "objects": [],
    }
    if with_door:
        dw, dh = 0.9, 2.05
        room["doors"] = [{
            "identifier": "door-1",
            "parentIdentifier": "wall-north",
            "confidence": "high",
            "dimensions": [dw, dh, 0.12],
            "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, midx, dh / 2, z0, 1],
        }]
    return room


def anchor(cid, a, b, model_m, typed_mm, kind="span"):
    return {
        "id": cid, "index": 0, "label": cid, "spanKind": kind, "entryMethod": "typed",
        "endpointA": {"x": a[0], "y": a[1], "z": a[2]},
        "endpointB": {"x": b[0], "y": b[1], "z": b[2]},
        "modelSpanMeters": model_m, "measuredValueMm": typed_mm,
    }


def matching_anchors(x0, x1, z0, z1, h, scale=1.0):
    """Three anchors (two wall runs + a ceiling height) whose endpoints match the
    rectangular room's north wall, east wall, and height; typed = scale × model."""
    wx = x1 - x0
    wz = z1 - z0
    return [
        anchor("a-north", (x0, 0, z0), (x1, 0, z0), wx, round(wx * 1000 * scale), "span"),
        anchor("a-east", (x1, 0, z0), (x1, 0, z1), wz, round(wz * 1000 * scale), "span"),
        anchor("a-height", (midpt := (x0 + x1) / 2, 0, (z0 + z1) / 2),
               (midpt, h, (z0 + z1) / 2), h, round(h * 1000 * scale), "height"),
    ]
