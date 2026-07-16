"""USDZ → GLB conversion for the Room View archival lane (R107).

RoomPlan ships *parametric* USDZ (Y-up, right-handed; geometry lives on
``UsdGeomMesh`` prims). We convert to a minimal binary glTF: positions +
triangulated indices and one named node per mesh — no materials, textures, or
normals. This is archival "as captured" insurance for a later toggle; nothing
in v1 reads the GLB, so geometry + node hierarchy + names are all that's needed.

Coordinate frames line up (USD Y-up RH == glTF Y-up RH), so mesh vertices carry
the ARKit world frame verbatim after baking each prim's local-to-world xform.

Toolchain choice — a direct usd-core → pygltflib converter rather than the
``usd2gltf`` PyPI package: usd2gltf is effectively unmaintained (stuck at
0.3.5), pulls a second glTF library (gltflib), and carries material/texture
machinery we deliberately don't want. ~120 lines here gives full control over
the error paths (422) and the archival output.

USD + pygltflib are imported **lazily inside the functions**: a broken USD
install must never take down the embed worker's ``/embed/*`` routes. This
module is imported at app start, but ``pxr``/``pygltflib`` are only touched when
a conversion actually runs or ``/healthz`` probes :func:`usd_available`.
"""

from __future__ import annotations

import os
import tempfile
from functools import lru_cache

import httpx


class UsdFetchError(Exception):
    """Upstream USDZ fetch failed (bad URL / HTTP status / timeout / size) → 502."""


class UsdConversionError(Exception):
    """USDZ could not be parsed into geometry → 422. Reason is caller-readable."""


@lru_cache(maxsize=1)
def usd_available() -> bool:
    """Cheap, cached probe: is the USD + glTF toolchain importable?

    Cached so ``/healthz`` (open, hit often) never pays the import cost twice
    and a missing USD install degrades to ``usd_available: false`` rather than a
    crash. Result is process-lifetime stable — a wheel doesn't appear at runtime.
    """
    try:
        import pygltflib  # noqa: F401
        from pxr import Usd, UsdGeom  # noqa: F401

        return True
    except Exception:
        return False


async def fetch_usdz(
    client: httpx.AsyncClient,
    url: str,
    *,
    timeout_s: float,
    max_bytes: int,
) -> bytes:
    """Stream a USDZ from a (signed) URL with a hard size cap.

    No content-type gate — USDZ is served as anything from ``model/vnd.usdz+zip``
    to ``application/octet-stream``; ``Usd.Stage.Open`` is the real arbiter.
    Any fetch-side failure raises :class:`UsdFetchError` (the route maps it to 502).
    """
    if not url.lower().startswith(("http://", "https://")):
        raise UsdFetchError("url must be http(s)")

    try:
        async with client.stream(
            "GET", url, timeout=timeout_s, follow_redirects=True
        ) as resp:
            if resp.status_code != 200:
                raise UsdFetchError(f"fetch failed: HTTP {resp.status_code}")

            declared = resp.headers.get("content-length")
            if declared is not None and declared.isdigit() and int(declared) > max_bytes:
                raise UsdFetchError(
                    f"content-length {declared} exceeds limit of {max_bytes} bytes"
                )

            buf = bytearray()
            async for chunk in resp.aiter_bytes():
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise UsdFetchError(f"body exceeds limit of {max_bytes} bytes")
    except UsdFetchError:
        raise
    except httpx.TimeoutException:
        raise UsdFetchError(f"fetch timed out after {timeout_s:g}s") from None
    except httpx.HTTPError as exc:
        raise UsdFetchError(f"fetch failed: {exc.__class__.__name__}") from None

    if not buf:
        raise UsdFetchError("empty response body")
    return bytes(buf)


def _triangulate(counts: list[int], indices: list[int]) -> list[int]:
    """Fan-triangulate arbitrary ``faceVertexCounts`` into a flat triangle list.

    glTF primitives are triangles only; RoomPlan faces are quads (and the
    occasional n-gon). Degenerate faces (< 3 verts) are dropped.
    """
    tris: list[int] = []
    off = 0
    for c in counts:
        if c >= 3:
            for i in range(1, c - 1):
                tris.extend((indices[off], indices[off + i], indices[off + i + 1]))
        off += c
    return tris


def convert_usdz_to_glb(data: bytes) -> bytes:
    """Parse USDZ bytes → minimal binary-glTF bytes. CPU-bound; USD imported lazily.

    Raises :class:`UsdConversionError` (→ 422) when the bytes aren't a readable
    USD stage or contain no convertible mesh geometry.
    """
    import numpy as np
    import pygltflib
    from pxr import Gf, Usd, UsdGeom
    from pygltflib import (
        GLTF2,
        Accessor,
        Attributes,
        Buffer,
        BufferView,
        Mesh,
        Node,
        Primitive,
        Scene,
    )

    if not data:
        raise UsdConversionError("empty request body")

    # USD opens from a path and auto-detects USDZ by extension.
    with tempfile.NamedTemporaryFile(suffix=".usdz", delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        try:
            stage = Usd.Stage.Open(tmp_path)
        except Exception:
            # pxr raises Tf.ErrorException on malformed input, not None.
            raise UsdConversionError("not a readable USD stage") from None
        if stage is None:
            raise UsdConversionError("not a readable USD stage")

        xf_cache = UsdGeom.XformCache(Usd.TimeCode.Default())
        blob = bytearray()
        buffer_views: list[BufferView] = []
        accessors: list[Accessor] = []
        meshes: list[Mesh] = []
        nodes: list[Node] = []

        for prim in stage.Traverse():
            if not prim.IsA(UsdGeom.Mesh):
                continue
            mesh = UsdGeom.Mesh(prim)
            pts = mesh.GetPointsAttr().Get()
            counts = mesh.GetFaceVertexCountsAttr().Get()
            idx = mesh.GetFaceVertexIndicesAttr().Get()
            if not pts or not counts or not idx:
                continue

            tris = _triangulate(list(counts), list(idx))
            if not tris:
                continue
            tri_arr = np.asarray(tris, dtype=np.uint32)

            world = xf_cache.GetLocalToWorldTransform(prim)
            verts = np.asarray(
                [tuple(world.Transform(Gf.Vec3d(p[0], p[1], p[2]))) for p in pts],
                dtype=np.float32,
            )

            # positions bufferView + accessor (glTF spec: POSITION carries min/max)
            pos_bytes = verts.tobytes()
            pos_offset = len(blob)
            blob.extend(pos_bytes)
            while len(blob) % 4:
                blob.append(0)
            pos_view = len(buffer_views)
            buffer_views.append(
                BufferView(
                    buffer=0,
                    byteOffset=pos_offset,
                    byteLength=len(pos_bytes),
                    target=pygltflib.ARRAY_BUFFER,
                )
            )
            pos_acc = len(accessors)
            accessors.append(
                Accessor(
                    bufferView=pos_view,
                    componentType=pygltflib.FLOAT,
                    count=len(verts),
                    type="VEC3",
                    min=verts.min(axis=0).tolist(),
                    max=verts.max(axis=0).tolist(),
                )
            )

            # indices bufferView + accessor
            idx_bytes = tri_arr.tobytes()
            idx_offset = len(blob)
            blob.extend(idx_bytes)
            while len(blob) % 4:
                blob.append(0)
            idx_view = len(buffer_views)
            buffer_views.append(
                BufferView(
                    buffer=0,
                    byteOffset=idx_offset,
                    byteLength=len(idx_bytes),
                    target=pygltflib.ELEMENT_ARRAY_BUFFER,
                )
            )
            idx_acc = len(accessors)
            accessors.append(
                Accessor(
                    bufferView=idx_view,
                    componentType=pygltflib.UNSIGNED_INT,
                    count=len(tri_arr),
                    type="SCALAR",
                )
            )

            name = prim.GetName() or f"mesh_{len(meshes)}"
            mesh_index = len(meshes)
            meshes.append(
                Mesh(
                    name=name,
                    primitives=[
                        Primitive(
                            attributes=Attributes(POSITION=pos_acc),
                            indices=idx_acc,
                            mode=pygltflib.TRIANGLES,
                        )
                    ],
                )
            )
            nodes.append(Node(mesh=mesh_index, name=name))

        if not meshes:
            raise UsdConversionError("no convertible meshes in USD stage")

        gltf = GLTF2(
            scene=0,
            scenes=[Scene(nodes=list(range(len(nodes))))],
            nodes=nodes,
            meshes=meshes,
            accessors=accessors,
            bufferViews=buffer_views,
            buffers=[Buffer(byteLength=len(blob))],
        )
        gltf.set_binary_blob(bytes(blob))
        return b"".join(gltf.save_to_bytes())
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
