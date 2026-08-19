"""Author the committed USDZ fixtures for tests/test_usdz.py.

TWO fixtures, because one of them was a lie.

``box-room.usdz`` — a 4 m × 3 m floor + 4 walls, each a named ``UsdGeomMesh``
quad. It was written to "mirror the shape of a RoomPlan capture closely
enough", and it does not: RoomPlan writes exactly one Mesh (the floor) and
encodes every wall, opening and object as a ``UsdGeomCube`` sized by
``xformOp:scale``. A fixture made entirely of Meshes is the single shape for
which a Mesh-only traversal is also correct, so it passed while real captures
converted to a floor and nothing else.

``roomplan-room.usdz`` — the real shape. A Mesh floor plus Cube walls, a Cube
window and a Cube object, each scaled non-uniformly the way RoomPlan does.

    python scripts/make_test_usdz.py     # → tests/fixtures/*.usdz

Re-run after changing what the converter needs to cover. usd-core is required
(``pip install usd-core`` or `make export`'s venv).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from pxr import Gf, Sdf, Usd, UsdGeom, UsdUtils, Vt

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
FIXTURE = FIXTURES / "box-room.usdz"
ROOMPLAN_FIXTURE = FIXTURES / "roomplan-room.usdz"


def author_box_room(usdz_path: Path) -> None:
    tmp = tempfile.mkdtemp()
    usdc = os.path.join(tmp, "room.usdc")
    stage = Usd.Stage.CreateNew(usdc)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    root = UsdGeom.Xform.Define(stage, "/Room")
    stage.SetDefaultPrim(root.GetPrim())

    def quad(name: str, pts: list[tuple[float, float, float]]) -> None:
        mesh = UsdGeom.Mesh.Define(stage, f"/Room/{name}")
        mesh.CreatePointsAttr(Vt.Vec3fArray([Gf.Vec3f(*p) for p in pts]))
        mesh.CreateFaceVertexCountsAttr(Vt.IntArray([4]))
        mesh.CreateFaceVertexIndicesAttr(Vt.IntArray([0, 1, 2, 3]))

    quad("Floor", [(0, 0, 0), (4, 0, 0), (4, 0, 3), (0, 0, 3)])
    quad("Wall_North", [(0, 0, 0), (4, 0, 0), (4, 2.5, 0), (0, 2.5, 0)])
    quad("Wall_South", [(0, 0, 3), (4, 0, 3), (4, 2.5, 3), (0, 2.5, 3)])
    quad("Wall_West", [(0, 0, 0), (0, 0, 3), (0, 2.5, 3), (0, 2.5, 0)])
    quad("Wall_East", [(4, 0, 0), (4, 0, 3), (4, 2.5, 3), (4, 2.5, 0)])
    stage.GetRootLayer().Save()

    usdz_path.parent.mkdir(parents=True, exist_ok=True)
    if usdz_path.exists():
        usdz_path.unlink()
    if not UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(usdc), str(usdz_path)):
        raise SystemExit("CreateNewUsdzPackage failed")


def author_roomplan_room(usdz_path: Path) -> None:
    """RoomPlan's actual encoding: one Mesh floor, everything else a Cube.

    Each Cube is `size = 1` (RoomPlan uses `size = 1` and carries the real
    dimensions in a non-uniform `xformOp:scale`), so a converter that reads the
    size attribute but ignores the transform produces 1 m cubes in a pile at the
    origin — which is why the scale is non-uniform and asymmetric here.
    """
    tmp = tempfile.mkdtemp()
    usdc = os.path.join(tmp, "roomplan.usdc")
    stage = Usd.Stage.CreateNew(usdc)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 1.0)
    root = UsdGeom.Xform.Define(stage, "/Room")
    stage.SetDefaultPrim(root.GetPrim())

    floor = UsdGeom.Mesh.Define(stage, "/Room/Floor0")
    floor.CreatePointsAttr(
        Vt.Vec3fArray([Gf.Vec3f(*p) for p in
                       [(0, 0, 0), (4, 0, 0), (4, 0, 3), (0, 0, 3)]])
    )
    floor.CreateFaceVertexCountsAttr(Vt.IntArray([4]))
    floor.CreateFaceVertexIndicesAttr(Vt.IntArray([0, 1, 2, 3]))

    def cube(name: str, translate: tuple[float, float, float],
             scale: tuple[float, float, float]) -> None:
        prim = UsdGeom.Cube.Define(stage, f"/Room/{name}")
        prim.CreateSizeAttr(1.0)
        xform = UsdGeom.Xformable(prim)
        xform.AddTranslateOp().Set(Gf.Vec3d(*translate))
        xform.AddScaleOp().Set(Gf.Vec3f(*scale))

    cube("Wall0", (2.0, 1.25, 0.0), (4.0, 2.5, 0.1))
    cube("Wall1", (2.0, 1.25, 3.0), (4.0, 2.5, 0.1))
    cube("Wall2", (0.0, 1.25, 1.5), (0.1, 2.5, 3.0))
    cube("Wall3", (4.0, 1.25, 1.5), (0.1, 2.5, 3.0))
    cube("Window0", (1.0, 1.5, 0.0), (1.2, 1.0, 0.12))
    cube("Storage0", (3.2, 0.45, 2.4), (0.9, 0.9, 0.6))

    stage.GetRootLayer().Save()
    usdz_path.parent.mkdir(parents=True, exist_ok=True)
    if usdz_path.exists():
        usdz_path.unlink()
    if not UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(usdc), str(usdz_path)):
        raise SystemExit("CreateNewUsdzPackage failed")


if __name__ == "__main__":
    author_box_room(FIXTURE)
    print(f"wrote {FIXTURE} ({FIXTURE.stat().st_size} bytes)")
    author_roomplan_room(ROOMPLAN_FIXTURE)
    print(f"wrote {ROOMPLAN_FIXTURE} ({ROOMPLAN_FIXTURE.stat().st_size} bytes)")
