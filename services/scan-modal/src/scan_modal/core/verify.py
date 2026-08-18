"""`verify` — the pure geometry core. No IO, no Modal, no database.

Compares a captured mesh (as a point cloud, metres, ARKit Y-up world frame)
against the parametric RoomModel that `solve` already trusts, and reports where
the two disagree:

    downsample → seeded plane extraction → vertical classification →
    parametric-wall ↔ plane matching → per-wall span/offset residuals +
    planarity RMS → curved flag + unmatched sets

Every threshold lives in `VerifyConfig`. The RANSAC RNG is seeded on both
backends — an unseeded verification stage would answer differently run to run,
which is the one thing a verification stage may not do.
"""

from __future__ import annotations

import dataclasses
import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .captured_room import RoomModel, WallDim

__all__ = [
    "VerifyConfig",
    "WallCheck",
    "VerifyResult",
    "verify_room",
    "downsample",
    "extract_planes",
    "open3d_available",
]

_M_TO_MM = 1000.0

# World up. RoomPlan/ARKit is Y-up; every vertical/horizontal test below is
# expressed against this axis rather than a hard-coded component index.
_UP = np.array([0.0, 1.0, 0.0])


@dataclass(frozen=True)
class VerifyConfig:
    """Every threshold the stage uses. Nothing numeric lives in the code below."""

    # Determinism.
    seed: int = 42
    # Downsample leaf size (m). Also the resolution floor of every span below.
    voxel_size: float = 0.02
    # RANSAC inlier band (m) and the smallest plane worth reporting (points).
    ransac_dist: float = 0.02
    min_inliers: int = 500
    # A plane is vertical when its normal sits within this many degrees of
    # perpendicular to world up.
    vertical_tol_deg: float = 15.0
    # A plane may serve a parametric wall when its normal agrees with the wall's
    # normal to within this angle...
    orient_tol_deg: float = 20.0
    # ...and its surface sits within this distance of the wall centreline.
    match_dist_m: float = 0.35
    # A wall's span residual is acceptable within this many mm.
    tolerance_mm: float = 50.0
    # Planarity RMS above this many mm means the wall is not flat.
    curved_rms_mm: float = 15.0
    # Points within this distance of a matched plane belong to that wall — wide
    # enough to hold a bow that RANSAC's inlier band would have clipped off.
    wall_band_m: float = 0.15
    # Wall points are read strictly inside the wall: lateral margin keeps the
    # perpendicular walls out of the planarity set, vertical margin keeps the
    # floor and ceiling junctions out of both sets.
    wall_margin_m: float = 0.10
    # Plane-extraction budget: floor + ceiling + walls + a few fixtures.
    max_planes: int = 12
    ransac_n: int = 3
    ransac_iterations: int = 1000
    # Degenerate-triplet guard for the numpy fallback (cross-product length).
    min_normal_norm: float = 1e-6
    # "auto" prefers Open3D and falls back to numpy; the explicit values pin a
    # backend, which is what the cross-backend tests use.
    backend: str = "auto"


@dataclass
class Plane:
    """An extracted plane: unit normal `n`, offset `d`, with n·p + d = 0."""

    normal: np.ndarray
    offset: float
    points: np.ndarray

    @property
    def inlier_count(self) -> int:
        return int(len(self.points))

    @property
    def centroid(self) -> np.ndarray:
        return self.points.mean(axis=0)


@dataclass(frozen=True)
class WallCheck:
    wall_ref: str
    parametric_mm: float
    mesh_mm: float
    delta_mm: float
    within_tolerance: bool
    curved_flag: bool
    # Signed perpendicular displacement of the mesh plane from the parametric
    # wall centreline, along the room-outward wall normal: positive = the
    # captured wall sits outside the model.
    offset_mm: float
    planarity_rms_mm: float
    mesh_points: int


@dataclass(frozen=True)
class VerifyResult:
    walls: list[WallCheck] = field(default_factory=list)
    unmatched_walls: list[str] = field(default_factory=list)
    unmatched_planes: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    backend: str = "numpy"

    @property
    def walls_checked(self) -> int:
        return len(self.walls)

    @property
    def walls_within_tolerance(self) -> int:
        return sum(1 for w in self.walls if w.within_tolerance)

    @property
    def max_delta_mm(self) -> float:
        return max((abs(w.delta_mm) for w in self.walls), default=0.0)

    @property
    def curved_walls(self) -> list[str]:
        return [w.wall_ref for w in self.walls if w.curved_flag]

    def to_dict(self) -> dict[str, Any]:
        """The form written to `room_files.verify`.

        Deterministic: fixed key order, floats rounded to micrometre-scale so
        two runs over the same bundle serialize byte-identically.
        """
        return {
            "walls": [
                {
                    "wall_ref": w.wall_ref,
                    "parametric_mm": _round(w.parametric_mm),
                    "mesh_mm": _round(w.mesh_mm),
                    "delta_mm": _round(w.delta_mm),
                    "within_tolerance": w.within_tolerance,
                    "curved_flag": w.curved_flag,
                    "offset_mm": _round(w.offset_mm),
                    "planarity_rms_mm": _round(w.planarity_rms_mm),
                    "mesh_points": w.mesh_points,
                }
                for w in self.walls
            ],
            "summary": {
                "walls_checked": self.walls_checked,
                "walls_within_tolerance": self.walls_within_tolerance,
                "max_delta_mm": _round(self.max_delta_mm),
                "curved_walls": list(self.curved_walls),
                "unmatched": {
                    "parametric_walls": list(self.unmatched_walls),
                    "planes": list(self.unmatched_planes),
                },
            },
            "backend": self.backend,
            "warnings": list(self.warnings),
        }


def _round(v: float) -> float:
    # 1e-3 mm. Wider than float noise, far tighter than anything measurable.
    return round(float(v), 3)


def open3d_available() -> bool:
    try:
        import open3d  # noqa: F401
    except Exception:
        return False
    return True


def _resolve_backend(cfg: VerifyConfig) -> str:
    if cfg.backend == "open3d":
        return "open3d"
    if cfg.backend == "numpy":
        return "numpy"
    return "open3d" if open3d_available() else "numpy"


# ── sampling ────────────────────────────────────────────────────────────────

def downsample(points: np.ndarray, cfg: VerifyConfig, backend: str | None = None) -> np.ndarray:
    """Reduce the vertex cloud to one representative point per voxel.

    Open3D's poisson-disk sampler is a TriangleMesh method; our input is already
    the PLY's vertex set, so the point-cloud equivalent — and what Open3D itself
    offers for clouds — is voxel down-sampling. The numpy fallback computes the
    same voxel centroids so the two backends agree to within float ordering.
    """
    pts = _as_points(points)
    if len(pts) == 0 or cfg.voxel_size <= 0:
        return pts
    if (backend or _resolve_backend(cfg)) == "open3d":
        import open3d as o3d

        pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(pts))
        return np.asarray(pcd.voxel_down_sample(cfg.voxel_size).points, dtype=np.float64)
    return _voxel_downsample_numpy(pts, cfg.voxel_size)


def _voxel_downsample_numpy(pts: np.ndarray, voxel: float) -> np.ndarray:
    keys = np.floor(pts / voxel).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    inverse = inverse.reshape(-1)
    n_cells = int(inverse.max()) + 1
    sums = np.zeros((n_cells, 3), dtype=np.float64)
    np.add.at(sums, inverse, pts)
    counts = np.bincount(inverse, minlength=n_cells).reshape(-1, 1)
    return sums / counts


def _as_points(points: np.ndarray) -> np.ndarray:
    pts = np.asarray(points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 3:
        raise ValueError(f"mesh_points must be (N,3); got {pts.shape}")
    finite = np.isfinite(pts).all(axis=1)
    return pts[finite]


# ── plane extraction ────────────────────────────────────────────────────────

def extract_planes(points: np.ndarray, cfg: VerifyConfig, backend: str | None = None) -> list[Plane]:
    """Iteratively fit and remove planes, largest first. Seeded on both paths."""
    resolved = backend or _resolve_backend(cfg)
    if resolved == "open3d":
        return _extract_planes_open3d(points, cfg)
    return _extract_planes_numpy(points, cfg)


def _canonical(normal: np.ndarray, offset: float) -> tuple[np.ndarray, float]:
    """Pin the sign of (n, d) so an identical plane always reports identically."""
    nonzero = np.flatnonzero(np.abs(normal) > 0)
    if len(nonzero) and normal[nonzero[0]] < 0:
        return -normal, -offset
    return normal, offset


def _extract_planes_open3d(points: np.ndarray, cfg: VerifyConfig) -> list[Plane]:
    import open3d as o3d

    # Seeds Open3D's global RNG, which segment_plane draws its triplets from.
    o3d.utility.random.seed(cfg.seed)
    rest = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
    planes: list[Plane] = []
    while len(planes) < cfg.max_planes and len(rest.points) >= cfg.min_inliers:
        model, idx = rest.segment_plane(
            distance_threshold=cfg.ransac_dist,
            ransac_n=cfg.ransac_n,
            num_iterations=cfg.ransac_iterations,
        )
        if len(idx) < cfg.min_inliers:
            break
        a, b, c, d = (float(v) for v in model)
        normal = np.array([a, b, c])
        norm = float(np.linalg.norm(normal))
        if norm < cfg.min_normal_norm:
            break
        normal, d = _canonical(normal / norm, d / norm)
        inliers = np.asarray(rest.points, dtype=np.float64)[idx]
        planes.append(Plane(normal=normal, offset=d, points=inliers))
        rest = rest.select_by_index(idx, invert=True)
    return planes


def _fit_plane(pts: np.ndarray, cfg: VerifyConfig) -> tuple[np.ndarray, float] | None:
    """Total-least-squares plane through `pts` (smallest principal direction)."""
    if len(pts) < cfg.ransac_n:
        return None
    centroid = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - centroid, full_matrices=False)
    normal = vt[-1]
    norm = float(np.linalg.norm(normal))
    if norm < cfg.min_normal_norm:
        return None
    normal = normal / norm
    return _canonical(normal, float(-normal @ centroid))


def _extract_planes_numpy(points: np.ndarray, cfg: VerifyConfig) -> list[Plane]:
    rng = np.random.default_rng(cfg.seed)
    rest = points
    planes: list[Plane] = []
    while len(planes) < cfg.max_planes and len(rest) >= cfg.min_inliers:
        best_count = -1
        best: tuple[np.ndarray, float] | None = None
        triplets = rng.integers(0, len(rest), size=(cfg.ransac_iterations, cfg.ransac_n))
        for tri in triplets:
            p0, p1, p2 = rest[tri[0]], rest[tri[1]], rest[tri[2]]
            normal = np.cross(p1 - p0, p2 - p0)
            norm = float(np.linalg.norm(normal))
            if norm < cfg.min_normal_norm:
                continue
            normal = normal / norm
            offset = float(-normal @ p0)
            count = int((np.abs(rest @ normal + offset) <= cfg.ransac_dist).sum())
            if count > best_count:
                best_count, best = count, (normal, offset)
        if best is None or best_count < cfg.min_inliers:
            break
        normal, offset = best
        mask = np.abs(rest @ normal + offset) <= cfg.ransac_dist
        refit = _fit_plane(rest[mask], cfg)
        if refit is not None:
            normal, offset = refit
            mask = np.abs(rest @ normal + offset) <= cfg.ransac_dist
        if int(mask.sum()) < cfg.min_inliers:
            break
        normal, offset = _canonical(normal, offset)
        planes.append(Plane(normal=normal, offset=offset, points=rest[mask]))
        rest = rest[~mask]
    return planes


# ── classification and matching ─────────────────────────────────────────────

def _is_vertical(plane: Plane, cfg: VerifyConfig) -> bool:
    # Vertical plane ⇔ its normal is perpendicular to up, within tolerance.
    return abs(float(plane.normal @ _UP)) <= math.sin(math.radians(cfg.vertical_tol_deg))


@dataclass(frozen=True)
class _WallFrame:
    ref: str
    center: np.ndarray
    direction: np.ndarray   # along the wall, world XZ
    normal: np.ndarray      # perpendicular to the wall, world XZ, room-outward
    length_m: float
    base_y_m: float
    height_m: float


def _wall_frame(index: int, wall: WallDim) -> _WallFrame | None:
    ref = wall.apple_id or f"wall-{index}"
    ax, az = wall.a_xz
    bx, bz = wall.b_xz
    dx, dz = bx - ax, bz - az
    span = math.hypot(dx, dz)
    if not math.isfinite(span) or span <= 0:
        return None
    if not all(math.isfinite(v) for v in (wall.base_y_m, wall.height_m, wall.length_m)):
        return None
    direction = np.array([dx / span, 0.0, dz / span])
    normal = np.array([-dz / span, 0.0, dx / span])
    center = np.array([(ax + bx) / 2.0, wall.base_y_m + wall.height_m / 2.0, (az + bz) / 2.0])
    return _WallFrame(
        ref=ref,
        center=center,
        direction=direction,
        normal=normal,
        length_m=float(wall.length_m),
        base_y_m=float(wall.base_y_m),
        height_m=float(wall.height_m),
    )


def _orient_outward(frames: list[_WallFrame]) -> list[_WallFrame]:
    """Point every wall normal away from the room centre.

    The perpendicular falls out of the endpoint order RoomPlan happened to emit,
    so without this the sign of `offset_mm` would mean nothing — two walls with
    the same physical displacement would report opposite signs. Anchoring on the
    centroid of the wall centres makes "+" mean "the mesh wall sits outside the
    model" for every wall in the room.
    """
    if not frames:
        return frames
    centroid = np.mean([f.center for f in frames], axis=0)
    oriented: list[_WallFrame] = []
    for frame in frames:
        outward = frame.center - centroid
        flip = float(frame.normal @ outward) < 0
        oriented.append(
            dataclasses.replace(frame, normal=-frame.normal) if flip else frame
        )
    return oriented


def _match(frames: list[_WallFrame], planes: list[Plane], cfg: VerifyConfig) -> dict[int, int]:
    """Greedy nearest-plane assignment, one plane per wall and vice versa."""
    orient_cos = math.cos(math.radians(cfg.orient_tol_deg))
    candidates: list[tuple[float, int, int]] = []
    for wi, frame in enumerate(frames):
        for pi, plane in enumerate(planes):
            if abs(float(plane.normal @ frame.normal)) < orient_cos:
                continue
            dist = abs(float(plane.normal @ frame.center + plane.offset))
            if dist > cfg.match_dist_m:
                continue
            candidates.append((dist, wi, pi))
    # Sorting on (distance, wall index, plane index) makes ties resolve the same
    # way every run regardless of the order planes came out of RANSAC.
    candidates.sort()
    taken_walls: set[int] = set()
    taken_planes: set[int] = set()
    pairs: dict[int, int] = {}
    for _, wi, pi in candidates:
        if wi in taken_walls or pi in taken_planes:
            continue
        pairs[wi] = pi
        taken_walls.add(wi)
        taken_planes.add(pi)
    return pairs


def _wall_points(
    points: np.ndarray,
    plane: Plane,
    frame: _WallFrame,
    cfg: VerifyConfig,
    lateral_half: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Points belonging to this wall: (perpendicular residuals, lateral coords).

    Banded on the matched plane rather than taken from RANSAC's inlier set,
    because RANSAC inliers are by construction within `ransac_dist` — measuring
    planarity on them could never see a bow.
    """
    delta = points - frame.center
    residual = points @ plane.normal + plane.offset
    lateral = delta @ frame.direction
    y = points[:, 1]
    mask = (
        (np.abs(residual) <= cfg.wall_band_m)
        & (np.abs(lateral) <= lateral_half)
        & (y >= frame.base_y_m + cfg.wall_margin_m)
        & (y <= frame.base_y_m + frame.height_m - cfg.wall_margin_m)
    )
    return residual[mask], lateral[mask]


def verify_room(
    mesh_points: np.ndarray,
    parametric: RoomModel,
    cfg: VerifyConfig | None = None,
) -> VerifyResult:
    """Compare a captured point cloud against the parametric room."""
    cfg = cfg or VerifyConfig()
    backend = _resolve_backend(cfg)
    warnings: list[str] = list(parametric.warnings)

    points = downsample(mesh_points, cfg, backend=backend)
    if len(points) < cfg.min_inliers:
        warnings.append(
            f"point cloud too sparse after downsample ({len(points)} < {cfg.min_inliers})"
        )
        return VerifyResult(
            unmatched_walls=[
                (w.apple_id or f"wall-{i}") for i, w in enumerate(parametric.walls)
            ],
            warnings=warnings,
            backend=backend,
        )

    planes = extract_planes(points, cfg, backend=backend)
    vertical = [(i, p) for i, p in enumerate(planes) if _is_vertical(p, cfg)]
    vertical_planes = [p for _, p in vertical]

    frames: list[_WallFrame] = []
    unmatched_walls: list[str] = []
    for i, wall in enumerate(parametric.walls):
        frame = _wall_frame(i, wall)
        if frame is None:
            ref = wall.apple_id or f"wall-{i}"
            warnings.append(f"wall {ref} has degenerate geometry; not checked")
            unmatched_walls.append(ref)
            continue
        frames.append(frame)
    frames = _orient_outward(frames)

    pairs = _match(frames, vertical_planes, cfg)

    checks: list[WallCheck] = []
    for wi, frame in enumerate(frames):
        pi = pairs.get(wi)
        if pi is None:
            unmatched_walls.append(frame.ref)
            continue
        plane = vertical_planes[pi]
        span_residual, span_lateral = _wall_points(
            points, plane, frame, cfg, frame.length_m / 2.0 + cfg.wall_band_m
        )
        flat_residual, _ = _wall_points(
            points, plane, frame, cfg, max(frame.length_m / 2.0 - cfg.wall_margin_m, 0.0)
        )
        if len(span_lateral) == 0:
            unmatched_walls.append(frame.ref)
            warnings.append(f"wall {frame.ref} matched a plane with no wall-band points")
            continue

        mesh_m = float(span_lateral.max() - span_lateral.min())
        parametric_mm = frame.length_m * _M_TO_MM
        mesh_mm = mesh_m * _M_TO_MM
        delta_mm = mesh_mm - parametric_mm
        rms_source = flat_residual if len(flat_residual) else span_residual
        rms_mm = float(np.sqrt(np.mean(np.square(rms_source)))) * _M_TO_MM
        # Displacement of the mesh plane from the parametric centreline, along the
        # room-outward wall normal: positive means the captured wall sits outside
        # the model. (n·c + d) is the centre's distance from the plane, so the
        # plane's distance from the centre is its negation.
        sign = 1.0 if float(plane.normal @ frame.normal) >= 0 else -1.0
        offset_mm = -(float(plane.normal @ frame.center + plane.offset) * sign) * _M_TO_MM

        checks.append(
            WallCheck(
                wall_ref=frame.ref,
                parametric_mm=parametric_mm,
                mesh_mm=mesh_mm,
                delta_mm=delta_mm,
                within_tolerance=abs(delta_mm) <= cfg.tolerance_mm,
                curved_flag=rms_mm > cfg.curved_rms_mm,
                offset_mm=offset_mm,
                planarity_rms_mm=rms_mm,
                mesh_points=int(len(span_lateral)),
            )
        )

    matched_plane_ids = {id(vertical_planes[pi]) for pi in pairs.values()}
    unmatched_planes = [
        {
            "plane_index": idx,
            "normal": [_round(v) for v in plane.normal.tolist()],
            "offset_m": _round(plane.offset),
            "inlier_count": plane.inlier_count,
            "centroid_m": [_round(v) for v in plane.centroid.tolist()],
        }
        # Only vertical planes are reported: floor and ceiling are expected to go
        # unmatched and would be noise in a QA note.
        for idx, plane in vertical
        if id(plane) not in matched_plane_ids
    ]

    return VerifyResult(
        walls=checks,
        unmatched_walls=unmatched_walls,
        unmatched_planes=unmatched_planes,
        warnings=warnings,
        backend=backend,
    )
