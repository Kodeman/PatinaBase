"""Minimal PLY vertex reader — ascii, binary_little_endian, binary_big_endian.

`verify` needs the vertex xyz of `mesh.ply` and nothing else, so this reads the
header, walks to the vertex element, pulls x/y/z, and stops. Faces, normals and
colours are skipped rather than parsed. Open3D can read PLY too, but the stage
must stay runnable on the numpy fallback path, so the reader does not depend on
it.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np

__all__ = ["PlyError", "read_ply_vertices"]

# PLY scalar type name → (struct code, byte width). List properties are handled
# separately; they never carry vertex coordinates.
_SCALARS: dict[str, tuple[str, int]] = {
    "char": ("b", 1), "int8": ("b", 1),
    "uchar": ("B", 1), "uint8": ("B", 1),
    "short": ("h", 2), "int16": ("h", 2),
    "ushort": ("H", 2), "uint16": ("H", 2),
    "int": ("i", 4), "int32": ("i", 4),
    "uint": ("I", 4), "uint32": ("I", 4),
    "float": ("f", 4), "float32": ("f", 4),
    "double": ("d", 8), "float64": ("d", 8),
}


class PlyError(ValueError):
    """The PLY is malformed, or uses a shape this reader deliberately declines."""


@dataclass
class _Property:
    name: str
    scalar: str | None            # None ⇒ list property
    count_type: str | None = None
    item_type: str | None = None


@dataclass
class _Element:
    name: str
    count: int
    properties: list[_Property]


def read_ply_vertices(data: bytes) -> np.ndarray:
    """Return the vertex xyz as an (N,3) float64 array."""
    fmt, elements, body_offset = _parse_header(data)
    body = data[body_offset:]

    offset = 0
    for element in elements:
        if element.name == "vertex":
            if fmt == "ascii":
                return _read_ascii_vertices(body, elements, element)
            return _read_binary_vertices(body, offset, element, fmt)
        if fmt == "ascii":
            continue  # ascii skipping is line-based; handled in the reader below
        offset += _fixed_element_size(element) * element.count
    raise PlyError("no vertex element in PLY header")


def _parse_header(data: bytes) -> tuple[str, list[_Element], int]:
    end = data.find(b"end_header")
    if not data.startswith(b"ply") or end < 0:
        raise PlyError("not a PLY file")
    newline = data.find(b"\n", end)
    if newline < 0:
        raise PlyError("unterminated PLY header")
    header = data[:newline].decode("ascii", errors="replace")

    fmt = ""
    elements: list[_Element] = []
    for raw in header.splitlines():
        parts = raw.split()
        if not parts or parts[0] in ("ply", "comment", "obj_info", "end_header"):
            continue
        if parts[0] == "format":
            fmt = parts[1] if len(parts) > 1 else ""
        elif parts[0] == "element" and len(parts) >= 3:
            elements.append(_Element(name=parts[1], count=int(parts[2]), properties=[]))
        elif parts[0] == "property":
            if not elements:
                raise PlyError("property before any element")
            if len(parts) >= 5 and parts[1] == "list":
                elements[-1].properties.append(
                    _Property(name=parts[4], scalar=None, count_type=parts[2], item_type=parts[3])
                )
            elif len(parts) >= 3:
                elements[-1].properties.append(_Property(name=parts[2], scalar=parts[1]))

    if fmt not in ("ascii", "binary_little_endian", "binary_big_endian"):
        raise PlyError(f"unsupported PLY format {fmt!r}")
    return fmt, elements, newline + 1


def _fixed_element_size(element: _Element) -> int:
    size = 0
    for prop in element.properties:
        if prop.scalar is None:
            # Variable-width rows before the vertex element would need a full
            # streaming parse; RoomPlan/Open3D both emit vertex first.
            raise PlyError(
                f"cannot skip element {element.name!r}: list property {prop.name!r}"
            )
        size += _scalar(prop.scalar)[1]
    return size


def _scalar(name: str) -> tuple[str, int]:
    try:
        return _SCALARS[name]
    except KeyError:
        raise PlyError(f"unknown PLY scalar type {name!r}") from None


def _xyz_indices(element: _Element) -> tuple[int, int, int]:
    names = [p.name for p in element.properties]
    try:
        return names.index("x"), names.index("y"), names.index("z")
    except ValueError:
        raise PlyError("vertex element lacks x/y/z properties") from None


def _read_binary_vertices(body: bytes, offset: int, element: _Element, fmt: str) -> np.ndarray:
    endian = "<" if fmt == "binary_little_endian" else ">"
    codes = []
    for prop in element.properties:
        if prop.scalar is None:
            raise PlyError("vertex element carries a list property")
        codes.append(_scalar(prop.scalar)[0])
    row = struct.Struct(endian + "".join(codes))
    ix, iy, iz = _xyz_indices(element)
    need = row.size * element.count
    if len(body) - offset < need:
        raise PlyError("PLY body shorter than the header declares")

    out = np.empty((element.count, 3), dtype=np.float64)
    for i, values in enumerate(row.iter_unpack(body[offset : offset + need])):
        out[i] = (values[ix], values[iy], values[iz])
    return out


def _read_ascii_vertices(body: bytes, elements: list[_Element], vertex: _Element) -> np.ndarray:
    lines = body.decode("ascii", errors="replace").splitlines()
    start = 0
    for element in elements:
        if element is vertex:
            break
        start += element.count
    rows = [ln.split() for ln in lines[start : start + vertex.count] if ln.strip()]
    if len(rows) < vertex.count:
        raise PlyError("PLY body shorter than the header declares")
    ix, iy, iz = _xyz_indices(vertex)
    out = np.empty((vertex.count, 3), dtype=np.float64)
    for i, row in enumerate(rows):
        out[i] = (float(row[ix]), float(row[iy]), float(row[iz]))
    return out
