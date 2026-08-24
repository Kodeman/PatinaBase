"""`jobs/colmap_refine` orchestration — driven by a FAKE colmap runner.

No COLMAP, no GPU. The fake `run(argv, timeout)` simulates each subcommand by
manipulating the workspace exactly as the binary would: `feature_extractor`
writes a real SQLite database (so `read_db_images`/`write_db_intrinsics` are
under test), `point_triangulator` writes a text model with synthetic points and
observations, and `model_converter` copies it. The seam under test is the ORDER,
the id alignment, the registration policy, and the fail-closed fallbacks — the
parts that decide whether a real run uses the COLMAP seed or the parametric one.
"""

from __future__ import annotations

import sqlite3
import struct
from pathlib import Path

import numpy as np
import pytest

from scan_modal.core import colmap_model as cm
from scan_modal.io.ply import read_ply_vertices
from scan_modal.jobs import colmap_refine as cr


# ── argv builders ────────────────────────────────────────────────────────────


def test_feature_extractor_argv_is_cpu_pinhole_by_default():
    argv = cr.feature_extractor_argv(Path("/w/db"), Path("/w/images"))
    assert argv[:2] == ["colmap", "feature_extractor"]
    assert "--SiftExtraction.use_gpu" in argv
    assert argv[argv.index("--SiftExtraction.use_gpu") + 1] == "0"
    assert argv[argv.index("--ImageReader.camera_model") + 1] == "PINHOLE"


def test_point_triangulator_argv_clears_points_and_freezes_intrinsics():
    argv = cr.point_triangulator_argv(Path("db"), Path("im"), Path("in"), Path("out"))
    assert argv[:2] == ["colmap", "point_triangulator"]
    assert argv[argv.index("--clear_points") + 1] == "1"
    assert argv[argv.index("--Mapper.ba_refine_focal_length") + 1] == "0"


def test_bundle_adjuster_argv_refines_no_intrinsics():
    argv = cr.bundle_adjuster_argv(Path("in"), Path("out"))
    assert argv[argv.index("--BundleAdjustment.refine_focal_length") + 1] == "0"


# ── the SQLite seams, against a real database ────────────────────────────────


def _make_db(path: Path, names: list[str]) -> None:
    con = sqlite3.connect(str(path))
    con.execute(
        "CREATE TABLE cameras (camera_id INTEGER PRIMARY KEY, model INTEGER, "
        "width INTEGER, height INTEGER, params BLOB, prior_focal_length INTEGER)"
    )
    con.execute(
        "CREATE TABLE images (image_id INTEGER PRIMARY KEY, name TEXT, camera_id INTEGER)"
    )
    for i, name in enumerate(names, start=1):
        con.execute(
            "INSERT INTO cameras VALUES (?,2,100,100,?,0)",
            (i, struct.pack("<4d", 1.0, 50.0, 50.0, 0.0)),
        )
        con.execute("INSERT INTO images VALUES (?,?,?)", (i, name, i))
    con.commit()
    con.close()


def test_read_db_images_returns_ids_names_cameras(tmp_path):
    db = tmp_path / "colmap.db"
    _make_db(db, ["b.jpg", "a.jpg"])
    rows = cr.read_db_images(db)
    assert rows == [(1, "b.jpg", 1), (2, "a.jpg", 2)]


def test_write_db_intrinsics_rewrites_params_to_pinhole(tmp_path):
    db = tmp_path / "colmap.db"
    _make_db(db, ["a.jpg"])
    cr.write_db_intrinsics(db, {1: cm.ColmapCamera(1, 1440, 1920, 1500.0, 1490.0, 720.0, 960.0)})
    con = sqlite3.connect(str(db))
    model, w, h, params, prior = con.execute(
        "SELECT model, width, height, params, prior_focal_length FROM cameras WHERE camera_id=1"
    ).fetchone()
    con.close()
    assert model == cr.PINHOLE_MODEL_ID and prior == 1
    assert (w, h) == (1440, 1920)
    assert struct.unpack("<4d", params) == (1500.0, 1490.0, 720.0, 960.0)


# ── a fake colmap runner ─────────────────────────────────────────────────────


def _frames(tmp_path: Path, n: int) -> list[cm.FrameLike]:
    images = tmp_path / "images"
    images.mkdir(parents=True, exist_ok=True)
    out = []
    for i in range(n):
        name = f"frame_{i}.jpg"
        (images / name).write_bytes(b"\xff\xd8\xff\xd9")  # a token JPEG
        m = np.eye(4)
        m[:3, 3] = (float(i), 0.0, 0.0)
        out.append(
            cm.FrameLike(
                image_id=0, camera_id=0, name=name,
                transform_matrix=[[float(v) for v in row] for row in m],
                width=100, height=100, fx=90.0, fy=90.0, cx=50.0, cy=50.0,
            )
        )
    return out


def _fake_runner(*, points: int, registered: int, fail: str | None = None,
                 move_poses: bool = False):
    """Build a `run(argv, timeout)` that simulates COLMAP over the workspace."""

    def run(argv, timeout):  # noqa: ANN001
        sub = argv[1]
        if fail == sub:
            return 1

        def opt(flag):
            return Path(argv[argv.index(flag) + 1])

        if sub == "feature_extractor":
            db = opt("--database_path")
            image_dir = opt("--image_path")
            names = sorted(p.name for p in image_dir.glob("*.jpg"))
            _make_db(db, names)
            return 0
        if sub in ("exhaustive_matcher", "sequential_matcher"):
            return 0
        if sub == "point_triangulator":
            seed = opt("--input_path")
            out = opt("--output_path")
            out.mkdir(parents=True, exist_ok=True)
            images = cm.parse_images_txt((seed / "images.txt").read_text())
            (out / "cameras.txt").write_text((seed / "cameras.txt").read_text())
            _write_tri_images(out / "images.txt", images, registered, move_poses)
            _write_points(out / "points3D.txt", points)
            return 0
        if sub == "bundle_adjuster":
            src = opt("--input_path")
            out = opt("--output_path")
            out.mkdir(parents=True, exist_ok=True)
            for name in ("cameras.txt", "images.txt", "points3D.txt"):
                if (src / name).is_file():
                    (out / name).write_text((src / name).read_text())
            return 0
        if sub == "model_converter":
            src = opt("--input_path")
            out = opt("--output_path")
            out.mkdir(parents=True, exist_ok=True)
            for name in ("cameras.txt", "images.txt", "points3D.txt"):
                if (src / name).is_file():
                    (out / name).write_text((src / name).read_text())
            return 0
        return 0

    return run


def _write_tri_images(path: Path, images, registered: int, move_poses: bool) -> None:
    lines = ["# images"]
    for idx, img in enumerate(images):
        qw, qx, qy, qz = img.qvec
        tx, ty, tz = img.tvec
        if move_poses:
            tx += 0.01  # a small BA nudge, so refined poses differ measurably
        lines.append(f"{img.image_id} {qw} {qx} {qy} {qz} {tx} {ty} {tz} {img.camera_id} {img.name}")
        # A non-empty observations line marks the image as registered.
        lines.append("10.0 20.0 1" if idx < registered else "")
    path.write_text("\n".join(lines) + "\n")


def _write_points(path: Path, n: int) -> None:
    lines = ["# points"]
    for i in range(n):
        lines.append(f"{i+1} {i*0.01} {i*0.02} {i*0.03} 128 128 128 0.5 1 0 2 1")
    path.write_text("\n".join(lines) + "\n")


# ── orchestration outcomes ───────────────────────────────────────────────────


def test_happy_path_produces_a_readable_ply_and_ok_outcome(tmp_path):
    frames = _frames(tmp_path, 6)
    run = _fake_runner(points=5000, registered=6)
    outcome = cr.run_colmap_refine(tmp_path, frames, run=run, min_points=2000)

    assert outcome.ok and outcome.reason == "ok"
    assert outcome.point_count == 5000
    assert outcome.registered_images == 6 and outcome.total_images == 6
    xyz = read_ply_vertices(outcome.ply_bytes)
    assert xyz.shape == (5000, 3)
    prov = outcome.provenance()
    assert prov["poseRefine"] == "colmap" and prov["colmapOk"] is True


def test_intrinsics_are_rewritten_before_matching(tmp_path):
    """The database the seed is built from must carry the device intrinsics, not
    COLMAP's guess — proven by reading the db back after the run."""
    frames = _frames(tmp_path, 3)
    run = _fake_runner(points=3000, registered=3)
    cr.run_colmap_refine(tmp_path, frames, run=run, min_points=1000)
    con = sqlite3.connect(str(tmp_path / "colmap.db"))
    params = con.execute("SELECT params FROM cameras WHERE camera_id=1").fetchone()[0]
    con.close()
    assert struct.unpack("<4d", params) == (90.0, 90.0, 50.0, 50.0)


def test_feature_extractor_failure_is_fail_closed(tmp_path):
    frames = _frames(tmp_path, 4)
    run = _fake_runner(points=0, registered=0, fail="feature_extractor")
    outcome = cr.run_colmap_refine(tmp_path, frames, run=run)
    assert not outcome.ok and outcome.reason == "feature_extractor_failed"
    assert outcome.ply_bytes is None


def test_too_few_points_falls_back(tmp_path):
    frames = _frames(tmp_path, 6)
    run = _fake_runner(points=100, registered=6)
    outcome = cr.run_colmap_refine(tmp_path, frames, run=run, min_points=2000)
    assert not outcome.ok and outcome.reason == "low_points"
    assert outcome.point_count == 100 and outcome.ply_bytes is None


def test_low_overlap_falls_back(tmp_path):
    frames = _frames(tmp_path, 10)
    run = _fake_runner(points=5000, registered=3)  # 3/10 < 0.5
    outcome = cr.run_colmap_refine(tmp_path, frames, run=run, min_points=1000)
    assert not outcome.ok and outcome.reason == "low_overlap"
    assert outcome.registered_images == 3


def test_bundle_adjust_returns_refined_frames(tmp_path):
    frames = _frames(tmp_path, 5)
    run = _fake_runner(points=4000, registered=5, move_poses=True)
    outcome = cr.run_colmap_refine(tmp_path, frames, run=run, min_points=1000, bundle_adjust=True)
    assert outcome.ok
    assert outcome.refined_frames is not None
    assert set(outcome.refined_frames) == {f.name for f in frames}
    assert outcome.provenance()["colmapPosesRefined"] is True


def test_without_bundle_adjust_poses_are_not_reported(tmp_path):
    frames = _frames(tmp_path, 5)
    run = _fake_runner(points=4000, registered=5)
    outcome = cr.run_colmap_refine(tmp_path, frames, run=run, min_points=1000, bundle_adjust=False)
    assert outcome.ok and outcome.refined_frames is None


def test_an_exception_in_the_seam_is_swallowed(tmp_path):
    frames = _frames(tmp_path, 3)

    def boom(argv, timeout):  # noqa: ANN001
        raise RuntimeError("colmap segfault")

    outcome = cr.run_colmap_refine(tmp_path, frames, run=boom)
    assert not outcome.ok and outcome.reason.startswith("exception:")
