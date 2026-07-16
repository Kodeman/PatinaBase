"""Author the committed box-room USDZ fixture for tests/test_usdz.py.

A tiny parametric room — a 4 m × 3 m floor + 4 walls (2.5 m), each a named
``UsdGeomMesh`` quad, packaged per the USDZ spec via
``UsdUtils.CreateNewUsdzPackage``. Mirrors the shape of a RoomPlan capture
closely enough to exercise the converter (meshes, quads, named prims, world
xforms) while staying ~1.5 KB.

    python scripts/make_test_usdz.py            # → tests/fixtures/box-room.usdz

Re-run after changing what the converter needs to cover. usd-core is required
(``pip install usd-core`` or `make export`'s venv).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from pxr import Gf, Sdf, Usd, UsdGeom, UsdUtils, Vt

FIXTURE = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "box-room.usdz"


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


if __name__ == "__main__":
    author_box_room(FIXTURE)
    print(f"wrote {FIXTURE} ({FIXTURE.stat().st_size} bytes)")
