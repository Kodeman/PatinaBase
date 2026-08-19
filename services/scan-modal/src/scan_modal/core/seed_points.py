"""The splat's initial point cloud, sampled off the parametric room. Pure: a
`SceneSpec` in, PLY bytes out. No IO, no nerfstudio, no torch.

WHY THIS EXISTS. W2's real `splat` run trained from RANDOM initialisation. Its
log said so:

    Warning: load_3D_points set to true but no point cloud found.
    splatfacto will use random point cloud initialization.

`splatfacto`'s method config sets `load_3D_points=True` already, so nerfstudio
looked for a seed cloud and found none — our `transforms.json` carried no
`ply_file_path` key and there is no COLMAP directory. Random init on 42 views of
an 8.8 × 8.2 m room is the weakest start available (W2-EVIDENCE.md §12, open
item 8): the optimiser spends its early iterations discovering that the room is
mostly empty, from a cube of noise.

But the room's geometry is not unknown. `captured_room.json` describes it
exactly, and `core/parametric_scene` already turns that into boxes for
`renders`. Surface-sampling those boxes gives splatfacto a cloud that starts on
the walls, the floor, the openings and the objects — the surfaces the Gaussians
have to end up on anyway.

FRAME — AND WHY NO CONVERSION IS NEEDED HERE
────────────────────────────────────────────
This is the one thing that has to be right, so it is derived rather than
asserted. `core/transforms.py` writes camera poses into nerfstudio world by
left-multiplying each ARKit camera-to-world by

    W = [ 1  0  0 ]        (x, y, z)_arkit -> (x, -z, y)
        [ 0  0 -1 ]
        [ 0  1  0 ]

and `core/parametric_scene._to_blender` maps `(x, y, z) -> (x, -z, y)`. They are
the same map — Blender's glTF convention and nerfstudio's world convention are
both ARKit Y-up rotated to Z-up the same way. So a `SceneSpec` is ALREADY in the
frame `transforms.json`'s `transform_matrix` entries live in, and the seed cloud
is written with no further change of basis.

The dataparser then applies its own `transform_matrix` and `scale_factor` to
these points, exactly as it does to the cameras (nerfstudio 1.1.5,
`nerfstudio_dataparser._load_3D_points`) — so points and cameras stay together
whatever it does. `jobs/splat_job.train_argv` passes
`--orientation-method none --center-method none --auto-scale-poses False`, which
makes both the identity, but the seeding does not depend on that.

DETERMINISM. No RNG: the two face coordinates come from a HALTON sequence in
bases 2 and 3, indexed by a running global counter. That is reproducible on any
interpreter without depending on a generator's internal state, it spreads points
more evenly over a face than uniform noise would, and the same room always
yields the same bytes.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .parametric_scene import Box, SceneSpec

__all__ = [
    "SEED_TARGET_POINTS",
    "SEED_PLY_NAME",
    "SeedCloud",
    "sample_scene_points",
    "encode_ply",
    "build_seed_ply",
]

#: How many points the sampler aims for. 100k is the order splatfacto's own
#: random init uses (`num_random` is 50k) and is small enough that the PLY is
#: ~2 MB — nothing against a 270 MB export.
SEED_TARGET_POINTS = 100_000

#: The file name written beside `transforms.json`, and the value of its
#: `ply_file_path` key. nerfstudio resolves that key relative to the dataset
#: directory, so the two must agree and are therefore one constant.
SEED_PLY_NAME = "sparse_pc.ply"

#: Points per unit area, RELATIVE, per element kind. Walls and floors are large
#: flat surfaces that a splat resolves from very few Gaussians; openings and
#: especially objects are small, and they carry the detail 42 sparse views most
#: need help with. Area alone would spend nearly everything on the floor.
KIND_DENSITY: dict[str, float] = {
    "wall": 1.0,
    "floor": 1.0,
    "window": 1.4,
    "door": 1.4,
    "opening": 1.4,
    "object": 2.0,
}
_DEFAULT_DENSITY = 1.0

#: Seed colour per kind, 0–255. These mirror `blender_ops.PALETTE`, restated
#: rather than imported: that palette is a decision about how the SCHEMATIC
#: renders should look, and this one is the starting value of a spherical
#: harmonic the training images will overwrite within a few hundred iterations.
#: Coupling them would make a render restyle silently change splat init.
KIND_COLOUR: dict[str, tuple[int, int, int]] = {
    "wall": (230, 227, 219),
    "floor": (153, 143, 130),
    "window": (161, 184, 199),
    "door": (133, 112, 94),
    "opening": (189, 184, 173),
    "object": (179, 179, 179),
}
_DEFAULT_COLOUR = (179, 179, 179)

#: Element kinds that are the room's SHELL — seen from inside and never from
#: behind. Only their inward faces are sampled; see `_faces`.
_SHELL_KINDS = frozenset({"wall", "floor", "window", "door", "opening"})

#: Below this a face is not a surface, it is an edge; sampling it would pile
#: points onto a line.
_MIN_FACE_AREA_SQM = 1e-4

#: 3 × float32 + 3 × uint8. Asserted against the structured dtype in `encode_ply`
#: so a platform that padded the record could not silently write a PLY whose
#: body disagrees with its own header.
_PLY_RECORD_BYTES = 15


@dataclass(frozen=True)
class SeedCloud:
    """The sampled cloud. `xyz` is (N,3) float64 in nerfstudio world metres,
    `rgb` is (N,3) uint8."""

    xyz: np.ndarray
    rgb: np.ndarray

    def __len__(self) -> int:
        return int(self.xyz.shape[0])


# ── the low-discrepancy sequence ────────────────────────────────────────────


def _halton(index: int, base: int) -> float:
    """The `index`-th element of the Halton sequence in `base`, 1-indexed."""
    result = 0.0
    fraction = 1.0
    i = index
    while i > 0:
        fraction /= base
        result += fraction * (i % base)
        i //= base
    return result


def _halton_pairs(start: int, count: int) -> np.ndarray:
    """(count, 2) of Halton(2), Halton(3) — deterministic, well spread."""
    out = np.empty((count, 2), dtype=np.float64)
    for i in range(count):
        n = start + i + 1  # 1-indexed: Halton(0) is 0.0 in every base
        out[i, 0] = _halton(n, 2)
        out[i, 1] = _halton(n, 3)
    return out


# ── faces ───────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _Face:
    box: Box
    axis: int          # which LOCAL axis the face is perpendicular to
    sign: float        # +1 / -1 along that axis
    area: float
    weight: float      # area × the kind's density


def _local_to_world(box: Box, local: np.ndarray) -> np.ndarray:
    """Yaw about world +Z, then translate. `local` is (N,3)."""
    cos_r, sin_r = np.cos(box.rotation_z), np.sin(box.rotation_z)
    out = np.empty_like(local)
    out[:, 0] = box.center[0] + cos_r * local[:, 0] - sin_r * local[:, 1]
    out[:, 1] = box.center[1] + sin_r * local[:, 0] + cos_r * local[:, 1]
    out[:, 2] = box.center[2] + local[:, 2]
    return out


def _faces(box: Box, room_centre: tuple[float, float, float]) -> list[_Face]:
    """The faces of one box worth sampling.

    A SHELL element (wall, floor, opening panel) is only ever seen from inside
    the room: its outward half is behind the shell, where no camera stands and
    no photo constrains it. Gaussians seeded there are unsupervised and can only
    become floaters outside the walls, so those faces are dropped. An OBJECT is
    free-standing and is photographed from every side, so all six of its faces
    are kept.

    The shell test is "does the room's centre lie on the OUTWARD side of this
    face's plane" — a signed distance, not the sign of a dot product. The
    difference matters for the faces that are neither in nor out: a wall's end
    cap has a normal perpendicular to the direction of the room centre, so the
    dot product there is zero plus floating-point noise (a yaw of exactly −π/2
    still leaves a cosine of ~1e-6), and half the end caps in a rectangular room
    would be kept or dropped at random. Measuring to the PLANE instead puts the
    box's own half-extent between the two cases, and it drops a wall's top and
    bottom caps for the same reason — the second of which was duplicating the
    floor slab it sits on.
    """
    density = KIND_DENSITY.get(box.kind, _DEFAULT_DENSITY)
    shell = box.kind in _SHELL_KINDS
    cos_r, sin_r = np.cos(box.rotation_z), np.sin(box.rotation_z)
    # The box's local axes expressed in world coordinates (yaw only).
    axes = ((cos_r, sin_r, 0.0), (-sin_r, cos_r, 0.0), (0.0, 0.0, 1.0))
    to_centre = tuple(room_centre[i] - box.center[i] for i in range(3))

    out: list[_Face] = []
    for axis in range(3):
        u, v = (i for i in range(3) if i != axis)
        area = box.size[u] * box.size[v]
        if area < _MIN_FACE_AREA_SQM:
            continue
        for sign in (1.0, -1.0):
            if shell:
                normal = axes[axis]
                to_plane = sum(sign * normal[i] * to_centre[i] for i in range(3))
                if to_plane - box.size[axis] / 2.0 <= 0.0:
                    continue
            out.append(_Face(box=box, axis=axis, sign=sign, area=area, weight=area * density))
    return out


def _allocate(weights: list[float], total: int) -> list[int]:
    """Split `total` points across faces by weight — largest remainder, so the
    counts sum to exactly `total` and the split is a pure function of the
    weights rather than of floating-point rounding order."""
    if total <= 0 or not weights:
        return [0] * len(weights)
    sum_w = sum(weights)
    if sum_w <= 0.0:
        return [0] * len(weights)
    exact = [total * w / sum_w for w in weights]
    counts = [int(e) for e in exact]
    short = total - sum(counts)
    if short > 0:
        order = sorted(range(len(weights)), key=lambda i: (-(exact[i] - counts[i]), i))
        for i in order[:short]:
            counts[i] += 1
    return counts


# ── the sampler ─────────────────────────────────────────────────────────────


def sample_scene_points(spec: SceneSpec, target: int = SEED_TARGET_POINTS) -> SeedCloud:
    """Surface-sample the schematic room into a seed point cloud.

    Returns an empty cloud for an empty spec rather than raising: a scan whose
    parametric room is unreadable should still train, unseeded, exactly as it
    does today.
    """
    empty = SeedCloud(np.zeros((0, 3), dtype=np.float64), np.zeros((0, 3), dtype=np.uint8))
    if spec.is_empty or target <= 0:
        return empty

    centre = spec.bbox.centroid
    faces: list[_Face] = []
    for box in spec.boxes:
        faces.extend(_faces(box, centre))
    if not faces:
        return empty

    counts = _allocate([f.weight for f in faces], int(target))

    chunks_xyz: list[np.ndarray] = []
    chunks_rgb: list[np.ndarray] = []
    cursor = 0
    for face, count in zip(faces, counts):
        if count <= 0:
            continue
        uv = _halton_pairs(cursor, count)
        cursor += count
        box = face.box
        u, v = (i for i in range(3) if i != face.axis)
        local = np.empty((count, 3), dtype=np.float64)
        local[:, face.axis] = face.sign * box.size[face.axis] / 2.0
        local[:, u] = (uv[:, 0] - 0.5) * box.size[u]
        local[:, v] = (uv[:, 1] - 0.5) * box.size[v]
        chunks_xyz.append(_local_to_world(box, local))
        colour = KIND_COLOUR.get(box.kind, _DEFAULT_COLOUR)
        chunks_rgb.append(np.tile(np.array(colour, dtype=np.uint8), (count, 1)))

    if not chunks_xyz:
        return empty
    return SeedCloud(np.concatenate(chunks_xyz), np.concatenate(chunks_rgb))


# ── PLY ─────────────────────────────────────────────────────────────────────


def encode_ply(cloud: SeedCloud) -> bytes:
    """Binary little-endian PLY: float x/y/z, uchar red/green/blue.

    That property spelling is not a preference. nerfstudio reads this file with
    `open3d.io.read_point_cloud`, which finds coordinates by the names `x`,
    `y`, `z` and colours by `red`, `green`, `blue`; anything else loads as a
    cloud with no colours, which nerfstudio then treats as "positions only".
    """
    n = len(cloud)
    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        "comment patina scan-modal parametric seed\n"
        f"element vertex {n}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "end_header\n"
    ).encode("ascii")
    if n == 0:
        return header
    # A packed structured dtype, not a per-point `struct.pack`: numpy lays
    # structured records out with no padding, so this is byte-for-byte the
    # 15-byte record the header just declared, built in one pass.
    record = np.dtype(
        [("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
         ("red", "u1"), ("green", "u1"), ("blue", "u1")]
    )
    if record.itemsize != _PLY_RECORD_BYTES:  # pragma: no cover - platform guard
        raise ValueError(f"PLY record is {record.itemsize} bytes, not {_PLY_RECORD_BYTES}")
    rows = np.empty(n, dtype=record)
    for i, axis in enumerate(("x", "y", "z")):
        rows[axis] = cloud.xyz[:, i].astype("<f4")
    for i, channel in enumerate(("red", "green", "blue")):
        rows[channel] = cloud.rgb[:, i].astype("u1")
    return header + rows.tobytes()


def build_seed_ply(spec: SceneSpec, target: int = SEED_TARGET_POINTS) -> tuple[bytes, int]:
    """`SceneSpec` → (PLY bytes, point count). The whole module in one call."""
    cloud = sample_scene_points(spec, target)
    return encode_ply(cloud), len(cloud)
