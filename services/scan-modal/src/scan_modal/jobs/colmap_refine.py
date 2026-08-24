"""COLMAP pose-prior refinement for the splat lane — the world-touching half.

WHAT THIS DOES, AND WHY IT IS OPTIONAL
──────────────────────────────────────
`splat_job` normally seeds splatfacto from `core/seed_points` — a point cloud
surface-sampled off the *parametric* room (`captured_room.json`). That is a
guess about where the surfaces are. This module offers the alternative the W2
plan scoped and never exercised: seed from points COLMAP TRIANGULATES out of the
actual photographs, using the ARKit poses as priors.

The pipeline mirrors the parked scan-pipeline engine
(`patina_scan_worker.refine_colmap_backend._run_primary_plan`), reduced to the
`colmap` CLI so it needs no bespoke pycolmap wheel:

1. `feature_extractor`  — SIFT on the transcoded frames (CPU by default; a
   headless L4 has no GL context and GPU SIFT is fragile there, and CPU SIFT on
   ~42 frames is minutes, not the run).
2. rewrite the database's per-image intrinsics to the DEVICE's own (PINHOLE
   fx/fy/cx/cy from `transforms.json`), replacing COLMAP's guess — the parked
   engine's `rewrite_intrinsics_preserving_ids`, done here in SQLite.
3. `exhaustive_matcher` — 42 frames is 861 pairs, cheap.
4. build a KNOWN-POSE seed model (`core/colmap_model.build_seed_model`) whose
   ids match the database, carrying the ARKit poses unchanged and zero points.
5. `point_triangulator` — adds 3-D points WITHOUT moving a pose.
6. (optional) `bundle_adjuster` — the only step allowed to move a pose. OFF by
   default: on the parked engine's 49-frame subject BA improved reprojection
   RMSE but WORSENED loop-rotation RMSE, and keeping the ARKit poses means the
   splat is never worse-posed than the baseline — only better-seeded.
7. `model_converter` to TXT, parse, and hand `splat_job` a points PLY (and, if
   BA ran, the refined per-frame poses).

FAIL-CLOSED. Every COLMAP failure, an under-registered solve, or too few points
returns an outcome with `ok=False` and a reason; `splat_job` then falls back to
the parametric seed and trains exactly as it does today. COLMAP genuinely
failing to register 42 wide-baseline room photos is a RESULT, not an error — it
is reported, not raised.

THE COLMAP INVOCATION IS BEHIND ONE SEAM. `run_colmap_refine(run=...)` takes the
subprocess runner; the argv builders are pure and tested, and the tests drive a
fake `colmap` binary that writes a real SQLite database and text models, so the
whole orchestration — SQLite rewrite included — runs with no GPU and no COLMAP.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Sequence

from ..core import colmap_model as _cm
from . import _common

__all__ = [
    "COLMAP_BIN",
    "PINHOLE_MODEL_ID",
    "MIN_TRIANGULATED_POINTS",
    "MIN_REGISTERED_FRACTION",
    "RefineOutcome",
    "feature_extractor_argv",
    "matcher_argv",
    "point_triangulator_argv",
    "bundle_adjuster_argv",
    "model_converter_argv",
    "read_db_images",
    "write_db_intrinsics",
    "run_colmap_refine",
]

#: The CLI binary. A name, not a path: `apt-get install colmap` puts it on PATH
#: in `_SPLAT_IMAGE`.
COLMAP_BIN = "colmap"

#: COLMAP's integer id for the PINHOLE model in the SQLite `cameras` table.
PINHOLE_MODEL_ID = 1

#: SIFT extraction caps. `max_image_size` bounds CPU cost; the frames are
#: 1440×1920, so 1920 keeps full resolution and still bounds a stray large one.
MAX_IMAGE_SIZE = 1920
#: More features than COLMAP's 8192 default — an indoor room with flat painted
#: walls is feature-poor, and the whole question is whether enough survive.
MAX_NUM_FEATURES = 16384

#: Below this many triangulated points the seed is not worth the poses it might
#: have perturbed; fall back to the parametric cloud. 2 000 is well under what a
#: healthy 42-frame solve yields and well over noise.
MIN_TRIANGULATED_POINTS = 2000
#: The parked engine's `REFINE_LOW_OVERLAP` gate, restated: at least this
#: fraction of the input frames must contribute an observation, or the solve did
#: not actually connect the room.
MIN_REGISTERED_FRACTION = 0.5


@dataclass
class RefineOutcome:
    """The result `splat_job` reads. `ok` gates whether the COLMAP seed is used."""

    ok: bool
    reason: str
    point_count: int = 0
    registered_images: int = 0
    total_images: int = 0
    mean_track_length: float = 0.0
    mean_reproj_error: float = 0.0
    ply_bytes: bytes | None = None
    refined_frames: dict[str, list[list[float]]] | None = None
    stats: dict[str, Any] = field(default_factory=dict)

    def provenance(self) -> dict[str, Any]:
        """The subset persisted on the artifact and the completion event."""
        return {
            "poseRefine": "colmap",
            "colmapOk": self.ok,
            "colmapReason": self.reason,
            "colmapPoints": self.point_count,
            "colmapRegisteredImages": self.registered_images,
            "colmapTotalImages": self.total_images,
            "colmapMeanTrack": round(self.mean_track_length, 3),
            "colmapMeanReproj": round(self.mean_reproj_error, 4),
            "colmapPosesRefined": self.refined_frames is not None,
        }


# ── pure argv builders ───────────────────────────────────────────────────────


def feature_extractor_argv(db_path: Path, image_dir: Path, use_gpu: bool = False) -> list[str]:
    return [
        COLMAP_BIN, "feature_extractor",
        "--database_path", str(db_path),
        "--image_path", str(image_dir),
        # One camera per image: the walk mixes full-res shutters with downscaled
        # auto frames, so a shared camera would be wrong for half the set. The
        # device intrinsics are written per camera in step 2.
        "--ImageReader.single_camera", "0",
        "--ImageReader.camera_model", "PINHOLE",
        "--SiftExtraction.max_image_size", str(MAX_IMAGE_SIZE),
        "--SiftExtraction.max_num_features", str(MAX_NUM_FEATURES),
        "--SiftExtraction.use_gpu", "1" if use_gpu else "0",
    ]


def matcher_argv(db_path: Path, use_gpu: bool = False) -> list[str]:
    return [
        COLMAP_BIN, "exhaustive_matcher",
        "--database_path", str(db_path),
        "--SiftMatching.use_gpu", "1" if use_gpu else "0",
    ]


def point_triangulator_argv(db_path: Path, image_dir: Path, input_model: Path,
                            output_model: Path) -> list[str]:
    """The one phase that touches geometry. `--clear_points 1` starts from the
    seed's zero points; `--Mapper.ba_refine_* 0` freezes intrinsics; poses are
    fixed by construction (the triangulator never moves a known pose)."""
    return [
        COLMAP_BIN, "point_triangulator",
        "--database_path", str(db_path),
        "--image_path", str(image_dir),
        "--input_path", str(input_model),
        "--output_path", str(output_model),
        "--clear_points", "1",
        "--Mapper.ba_refine_focal_length", "0",
        "--Mapper.ba_refine_principal_point", "0",
        "--Mapper.ba_refine_extra_params", "0",
    ]


def bundle_adjuster_argv(input_model: Path, output_model: Path) -> list[str]:
    """Refine the poses (only). Intrinsics stay frozen — the device measured
    them and COLMAP has nothing better to say about them from 42 views."""
    return [
        COLMAP_BIN, "bundle_adjuster",
        "--input_path", str(input_model),
        "--output_path", str(output_model),
        "--BundleAdjustment.refine_focal_length", "0",
        "--BundleAdjustment.refine_principal_point", "0",
        "--BundleAdjustment.refine_extra_params", "0",
    ]


def model_converter_argv(input_model: Path, output_model: Path, output_type: str = "TXT") -> list[str]:
    return [
        COLMAP_BIN, "model_converter",
        "--input_path", str(input_model),
        "--output_path", str(output_model),
        "--output_type", output_type,
    ]


# ── SQLite seams (a COLMAP database is plain SQLite) ──────────────────────────


def read_db_images(db_path: Path) -> list[tuple[int, str, int]]:
    """(image_id, name, camera_id) for every image the extractor registered,
    ordered by id. The ids are COLMAP's; the seed model must reuse them so the
    triangulator matches the model's images to the database's features."""
    import sqlite3

    con = sqlite3.connect(str(db_path))
    try:
        rows = con.execute(
            "SELECT image_id, name, camera_id FROM images ORDER BY image_id"
        ).fetchall()
    finally:
        con.close()
    return [(int(r[0]), str(r[1]), int(r[2])) for r in rows]


def write_db_intrinsics(db_path: Path, cameras: dict[int, _cm.ColmapCamera]) -> None:
    """Replace each camera's guessed params with the device's PINHOLE intrinsics,
    preserving camera ids. COLMAP stores `params` as packed little-endian
    float64; PINHOLE is (fx, fy, cx, cy)."""
    import sqlite3

    con = sqlite3.connect(str(db_path))
    try:
        for camera_id, cam in cameras.items():
            blob = struct.pack("<4d", cam.fx, cam.fy, cam.cx, cam.cy)
            con.execute(
                "UPDATE cameras SET model=?, width=?, height=?, params=?, "
                "prior_focal_length=1 WHERE camera_id=?",
                (PINHOLE_MODEL_ID, int(cam.width), int(cam.height), blob, camera_id),
            )
        con.commit()
    finally:
        con.close()


# ── orchestration ────────────────────────────────────────────────────────────


def _model_stats(points: Sequence[_cm.ColmapPoint]) -> tuple[int, set[int], float, float]:
    """(point_count, contributing_image_ids, mean_track, mean_reproj)."""
    if not points:
        return 0, set(), 0.0, 0.0
    # We do not have per-point track image ids from points3D alone here (the
    # parser keeps only the length), so "registered images" is derived by the
    # caller from the images model. Track length and reprojection error are the
    # per-point aggregates.
    mean_track = sum(p.track_length for p in points) / len(points)
    mean_reproj = sum(p.error for p in points) / len(points)
    return len(points), set(), mean_track, mean_reproj


def run_colmap_refine(
    workspace: Path,
    frames: Sequence[_cm.FrameLike],
    *,
    run: Callable[[Sequence[str], float], int],
    timeout_s: float = 1200.0,
    bundle_adjust: bool = False,
    use_gpu: bool = False,
    min_points: int = MIN_TRIANGULATED_POINTS,
    min_registered_fraction: float = MIN_REGISTERED_FRACTION,
) -> RefineOutcome:
    """Drive COLMAP over an already-prepared workspace and return the outcome.

    `workspace` must hold `images/` (the transcoded frames) and is where the
    COLMAP database and models are written. `frames` name those images and carry
    the nerfstudio poses + device intrinsics. `run(argv, timeout)` runs one
    COLMAP subprocess and returns its exit code (the real one in production, a
    fake in tests). NEVER raises: any failure is an `ok=False` outcome.
    """
    try:
        return _run_colmap_refine(
            workspace, frames, run=run, timeout_s=timeout_s,
            bundle_adjust=bundle_adjust, use_gpu=use_gpu,
            min_points=min_points, min_registered_fraction=min_registered_fraction,
        )
    except Exception as exc:  # noqa: BLE001 - fail-closed by contract
        _common.log_skip("splat", "colmap_refine_failed", error=type(exc).__name__)
        return RefineOutcome(ok=False, reason=f"exception:{type(exc).__name__}")


def _run_colmap_refine(
    workspace: Path,
    frames: Sequence[_cm.FrameLike],
    *,
    run: Callable[[Sequence[str], float], int],
    timeout_s: float,
    bundle_adjust: bool,
    use_gpu: bool,
    min_points: int,
    min_registered_fraction: float,
) -> RefineOutcome:
    image_dir = workspace / "images"
    db_path = workspace / "colmap.db"
    seed_model = workspace / "colmap_seed"
    tri_model = workspace / "colmap_tri"
    ba_model = workspace / "colmap_ba"
    txt_model = workspace / "colmap_txt"
    for d in (seed_model, tri_model, ba_model, txt_model):
        d.mkdir(parents=True, exist_ok=True)

    total = len(frames)

    # 1 — features.
    if run(feature_extractor_argv(db_path, image_dir, use_gpu), timeout_s) != 0:
        return RefineOutcome(ok=False, reason="feature_extractor_failed", total_images=total)

    # 2 — the database now assigns ids; align the frames to them by name and
    # rewrite the intrinsics to the device's own.
    db_rows = read_db_images(db_path)
    by_name = {f.name: f for f in frames}
    aligned: list[_cm.FrameLike] = []
    for image_id, name, camera_id in db_rows:
        f = by_name.get(name)
        if f is None:
            continue
        aligned.append(
            _cm.FrameLike(
                image_id=image_id, camera_id=camera_id, name=name,
                transform_matrix=f.transform_matrix, width=f.width, height=f.height,
                fx=f.fx, fy=f.fy, cx=f.cx, cy=f.cy,
            )
        )
    if not aligned:
        return RefineOutcome(ok=False, reason="no_frames_registered", total_images=total)
    write_db_intrinsics(db_path, {f.camera_id: _cm.ColmapCamera(
        f.camera_id, f.width, f.height, f.fx, f.fy, f.cx, f.cy) for f in aligned})

    # 3 — matches.
    if run(matcher_argv(db_path, use_gpu), timeout_s) != 0:
        return RefineOutcome(ok=False, reason="matcher_failed", total_images=total)

    # 4 — the known-pose seed.
    seed = _cm.build_seed_model(aligned)
    (seed_model / "cameras.txt").write_text(seed.cameras_txt)
    (seed_model / "images.txt").write_text(seed.images_txt)
    (seed_model / "points3D.txt").write_text(seed.points3D_txt)

    # 5 — triangulate.
    if run(point_triangulator_argv(db_path, image_dir, seed_model, tri_model), timeout_s) != 0:
        return RefineOutcome(ok=False, reason="triangulator_failed", total_images=total)

    # 6 — optional bundle adjustment (the only pose-moving step).
    final_model = tri_model
    if bundle_adjust:
        if run(bundle_adjuster_argv(tri_model, ba_model), timeout_s) != 0:
            # BA failing is not fatal: the triangulated (ARKit-posed) model still
            # carries a usable seed; fall through with it.
            _common.log_skip("splat", "colmap_bundle_adjust_failed")
        else:
            final_model = ba_model

    # 7 — to TXT, parse, decide.
    if run(model_converter_argv(final_model, txt_model, "TXT"), timeout_s) != 0:
        return RefineOutcome(ok=False, reason="model_converter_failed", total_images=total)

    points_txt = txt_model / "points3D.txt"
    images_txt = txt_model / "images.txt"
    if not points_txt.is_file():
        return RefineOutcome(ok=False, reason="no_points_model", total_images=total)

    points = _cm.parse_points3D_txt(points_txt.read_text())
    images = _cm.parse_images_txt(images_txt.read_text()) if images_txt.is_file() else []
    point_count, _, mean_track, mean_reproj = _model_stats(points)

    # "Registered" = images that carry at least one 2-D observation of a
    # triangulated point. COLMAP drops the pose line's points for uncovered
    # images, so an image with a non-empty points line contributed.
    registered = _count_registered(images_txt.read_text()) if images_txt.is_file() else 0

    outcome = RefineOutcome(
        ok=False, reason="pending", point_count=point_count,
        registered_images=registered, total_images=total,
        mean_track_length=mean_track, mean_reproj_error=mean_reproj,
    )

    if point_count < min_points:
        outcome.reason = "low_points"
        return outcome
    if total and registered / total < min_registered_fraction:
        outcome.reason = "low_overlap"
        return outcome

    outcome.ply_bytes = _cm.points_to_ply(points)
    if bundle_adjust and final_model is ba_model and images:
        outcome.refined_frames = _cm.colmap_frames_from_images(images)
    outcome.ok = True
    outcome.reason = "ok"
    return outcome


def _count_registered(images_txt: str) -> int:
    """Number of images whose 2-D-points line is non-empty in a TXT model."""
    data = [raw for raw in images_txt.splitlines() if not raw.strip().startswith("#")]
    while data and not data[0].strip():
        data.pop(0)
    registered = 0
    for i in range(0, len(data), 2):
        points_line = data[i + 1] if i + 1 < len(data) else ""
        if points_line.strip():
            registered += 1
    return registered
