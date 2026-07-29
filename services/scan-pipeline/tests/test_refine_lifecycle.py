"""Item 7: the composed Refine lifecycle, driven end to end by a recorded engine.

WHAT THESE TESTS BUILD FOR REAL.  The bundle is a real USTAR archive of real
keyframes with a real NDJSON index and a real manifest, acquired through the real
:class:`RefineMaterializer` and rasterised through a deterministic adapter that
writes real PPM bytes.  The COLMAP input packet is really assembled, really
hashed, and really pinned to descriptors.  The three sparse models are real USTAR
archives carrying real COLMAP binary records, packed byte by byte by
``_pack_ustar``/``_cameras_bin``/``_images_bin`` below, and the parent really
parses them with :func:`read_sparse_model_snapshot`.  The publisher really writes
files.  Nothing monkeypatches ``os.pread``, ``os.fstat``, ``hashlib`` or any
function inside a module under test: a refusal is provoked by producing bytes or
timings that deserve it.

WHAT THE RECORDED ENGINE STANDS IN FOR, stated plainly.  ``_RecordedEngine``
replaces ONE seam -- ``native_engine_call`` -- and plays the role
:func:`run_native_engine_child` plays in production: it populates the
caller-owned :class:`NativeEngineOutputs` sink and returns the child's report.
It therefore does NOT exercise ``spawn``, SCM_RIGHTS, the workspace lease, the
``O_TMPFILE`` freeze, the ``PR_SET_DUMPABLE`` seal, or the parent's purge of a
SIGKILLed child.  Those live in ``test_refine_native_outputs`` and
``test_refine_workspace_seam`` and are Linux-only; on macOS they skip.  What
these tests prove is everything on the parent's side of that seam: the packet the
child would receive, the strictness applied to what it returns, the anchor
against the parent's own poses, the alignment recomputation, the runner, the
publisher, the deadline carried through all of it, and the cleanup on every
outcome.

THE ONE HONEST GAP, next to the tests rather than in a report: no archive here
came out of COLMAP and no COLMAP process ran.  The default child entry point is
the frozen disabled backend, which refuses with ``REFINE_BACKEND_DISABLED``;
``test_the_declared_child_entrypoint_refuses_today`` pins exactly that.
"""

from __future__ import annotations

import ast
import contextlib
import errno
import hashlib
import io
import json
import math
import os
import pathlib
import struct
import sys
import tarfile
import time
import tomllib
from dataclasses import replace
from pathlib import Path

import pytest

from patina_scan_worker import refine_lifecycle
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline, Sim3
from patina_scan_worker.refine_lifecycle import (
    DEFAULT_CHILD_ENTRYPOINT,
    ENGINE_REPORT_CONTRACT,
    ENGINE_REPORT_SCHEMA_VERSION,
    LIFECYCLE_TOOLCHAIN_MISSING_CODE,
    LIFECYCLE_UNANCHORED_CODE,
    P1_CERTIFICATE_95266BE1,
    PRODUCTION_ENABLEMENT,
    QUALIFIED_TOOLCHAIN_MANIFEST_PATH,
    REFINE_LIFECYCLE_QUALIFIED,
    REFINE_LIFECYCLE_STAGE_REGISTERED,
    SEED_ANCHOR_MAX_CENTER_DRIFT_M,
    SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD,
    LocalScratchArtifactAcquirer,
    LocalScratchStorageSink,
    RefineLifecycleRequest,
    anchor_seed_snapshot_to_request,
    build_colmap_packet,
    compare_against_p1_certificate,
    parse_engine_report,
    preflight_qualified_toolchain,
    require_qualified_toolchain,
    run_refine_lifecycle,
)
from patina_scan_worker.refine_materializer import (
    FieldRasterMaterialization,
    RefineMaterializationRequest,
    RefineMaterializer,
    RefineSourceArtifact,
)
from patina_scan_worker.refine_model_alignment import (
    ParentAlignmentVerification,
    SparseModelPose,
    SparseModelSnapshot,
    canonical_pose_digest,
)
from patina_scan_worker.refine_native_process import (
    NATIVE_ENGINE_OUTPUT_TOKENS,
    NativeChildContext,
    NativeEngineOutput,
    NativeEngineOutputs,
)

USER_ID = "user-1"
SCAN_ID = "scan-1"
TASK_ID = "task-1"
LEASE_ID = "lease-1"
ROOM_FILE_ID = "room-1"
FRAME_COUNT = 12

_BLOCK = 512


# ===========================================================================
# Byte-level builders.  These are the whole reason a refusal can be
# constructed instead of injected.
# ===========================================================================
def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _canonical_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def _checksummed(header: bytearray) -> bytes:
    header[148:156] = b" " * 8
    header[148:156] = ("%06o\x00 " % sum(header)).encode("ascii")
    return bytes(header)


def _tar_member(name: str, payload: bytes) -> bytes:
    header = bytearray(_BLOCK)
    encoded = name.encode("ascii")
    header[0 : len(encoded)] = encoded
    header[100:108] = b"0000644\x00"
    header[108:116] = b"0000000\x00"
    header[116:124] = b"0000000\x00"
    header[124:136] = ("%011o\x00" % len(payload)).encode("ascii")
    header[136:148] = b"00000000000\x00"
    header[156:157] = b"0"
    header[257:263] = b"ustar\x00"
    header[263:265] = b"00"
    body = payload + b"\x00" * ((-len(payload)) % _BLOCK)
    return _checksummed(header) + body


def _pack_ustar(members: list[tuple[str, bytes]]) -> bytes:
    return b"".join(_tar_member(name, payload) for name, payload in members) + (
        b"\x00" * (_BLOCK * 2)
    )


def _cameras_bin(camera_ids: list[int]) -> bytes:
    payload = struct.pack("<Q", len(camera_ids))
    for camera_id in camera_ids:
        payload += struct.pack("<IiQQ", camera_id, 1, 640, 480)
        payload += struct.pack("<4d", 600.0, 601.0, 320.0, 240.0)
    return payload


def _images_bin(rows: list[dict[str, object]]) -> bytes:
    payload = struct.pack("<Q", len(rows))
    for row in rows:
        qw, qx, qy, qz = row["qvec"]  # type: ignore[misc]
        tx, ty, tz = row["tvec"]  # type: ignore[misc]
        payload += struct.pack(
            "<I7dI",
            int(row["image_id"]),  # type: ignore[arg-type]
            qw,
            qx,
            qy,
            qz,
            tx,
            ty,
            tz,
            int(row["camera_id"]),  # type: ignore[arg-type]
        )
        payload += str(row["name"]).encode("ascii") + b"\x00"
        payload += struct.pack("<Q", 0)
    return payload


def _model_tar(rows: list[dict[str, object]]) -> bytes:
    camera_ids = sorted({int(row["camera_id"]) for row in rows})  # type: ignore[arg-type]
    return _pack_ustar(
        [
            ("cameras.bin", _cameras_bin(camera_ids)),
            ("images.bin", _images_bin(rows)),
            ("points3D.bin", struct.pack("<Q", 0)),
        ]
    )


# ===========================================================================
# Small rotation algebra, written here rather than borrowed from the modules
# under test.
# ===========================================================================
def _quat_to_rot(quaternion):
    w, x, y, z = quaternion
    return (
        (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
        (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
        (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
    )


def _rot_to_quat(matrix):
    """Shepperd's branch-on-largest-diagonal conversion.

    The naive trace branch divides by ``4w`` and loses every digit as ``w``
    approaches zero, which is exactly where these fixtures live: the
    ARKit-to-COLMAP basis change is a half-turn, so a keyframe's
    ``cam_from_world`` rotation has trace ``-1`` and ``w == 0``.  The four-branch
    form keeps full precision everywhere, which matters because the digest grid
    below is 1e-9 and the alignment agreement tolerance is 1e-6.

    The sign convention matches ``refine_model_alignment``'s parse-time
    canonicalisation -- first component with ``|c| > 1e-14`` made positive -- so
    a digest taken here and a digest taken from the parsed archive agree.
    """

    m = matrix
    trace = m[0][0] + m[1][1] + m[2][2]
    if trace > 0.0:
        s = math.sqrt(trace + 1.0) * 2.0
        w, x, y, z = (
            0.25 * s,
            (m[2][1] - m[1][2]) / s,
            (m[0][2] - m[2][0]) / s,
            (m[1][0] - m[0][1]) / s,
        )
    elif m[0][0] > m[1][1] and m[0][0] > m[2][2]:
        s = math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0
        w, x, y, z = (
            (m[2][1] - m[1][2]) / s,
            0.25 * s,
            (m[0][1] + m[1][0]) / s,
            (m[0][2] + m[2][0]) / s,
        )
    elif m[1][1] > m[2][2]:
        s = math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0
        w, x, y, z = (
            (m[0][2] - m[2][0]) / s,
            (m[0][1] + m[1][0]) / s,
            0.25 * s,
            (m[1][2] + m[2][1]) / s,
        )
    else:
        s = math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0
        w, x, y, z = (
            (m[1][0] - m[0][1]) / s,
            (m[0][2] + m[2][0]) / s,
            (m[1][2] + m[2][1]) / s,
            0.25 * s,
        )
    norm = math.sqrt(w * w + x * x + y * y + z * z)
    components = [w / norm, x / norm, y / norm, z / norm]
    for component in components:
        if abs(component) > 1e-14:
            if component < 0:
                components = [-value for value in components]
            break
    return tuple(components)


def _matmul(left, right):
    return tuple(
        tuple(sum(left[r][k] * right[k][c] for k in range(3)) for c in range(3))
        for r in range(3)
    )


def _matvec(matrix, vector):
    return tuple(
        sum(matrix[r][c] * vector[c] for c in range(3)) for r in range(3)
    )


def _transpose(matrix):
    return tuple(tuple(matrix[r][c] for r in range(3)) for c in range(3))


def _axis_rotation(axis, angle):
    x, y, z = axis
    norm = math.sqrt(x * x + y * y + z * z)
    x, y, z = x / norm, y / norm, z / norm
    c, s, t = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
    return (
        (t * x * x + c, t * x * y - s * z, t * x * z + s * y),
        (t * x * y + s * z, t * y * y + c, t * y * z - s * x),
        (t * x * z - s * y, t * y * z + s * x, t * z * z + c),
    )


# ===========================================================================
# The bundle fixture
# ===========================================================================
def _camera_transform(index: int, *, count: int = FRAME_COUNT) -> list[float]:
    """A helix, so the trajectory is genuinely three-dimensional.

    A straight line would be rejected by ``estimate_sim3``'s collinearity guard
    -- correctly -- and a fixture that could not be aligned would prove nothing
    about the alignment.  ``count`` spreads the same helix over however many
    frames a fixture has, so a short bundle is still non-coplanar rather than a
    degenerate arc the alignment would (correctly) refuse.
    """

    angle = index * (2.0 * math.pi / count)
    return [
        1.0, 0.0, 0.0, 1.5 * math.cos(angle),
        0.0, 1.0, 0.0, 1.5 * math.sin(angle),
        0.0, 0.0, 1.0, 0.35 * index,
        0.0, 0.0, 0.0, 1.0,
    ]


#: The fixture's NATIVE (landscape) sensor pair.  The encoded raster is its
#: ``.right`` rotation, which is why the row below spells ``width``/``height``
#: as the swapped pair while ``intrinsics`` stay native: that is the convention
#: ``right_rotated_intrinsics`` asserts and the one I99 measured on device.
_NATIVE_FIXTURE_SIZE = (3, 2)


def _index_row(
    index: int,
    *,
    count: int = FRAME_COUNT,
    native: tuple[int, int] = _NATIVE_FIXTURE_SIZE,
) -> dict[str, object]:
    native_width, native_height = native
    stem = f"keyframe_{index:06d}"
    return {
        "heicPath": f"keyframes/{stem}.heic",
        "depthPath": None,
        "timestampSeconds": float(index) + 1000.0,
        "frameTimestamp": float(index),
        "cameraTransform": _camera_transform(index, count=count),
        "intrinsics": {
            "fx": native_width * 0.8333333333333334,
            "fy": native_height * 1.0,
            "cx": native_width * 0.5,
            "cy": native_height * 0.5,
            "imageWidth": native_width,
            "imageHeight": native_height,
        },
        "sharpness": 250.0,
        "width": native_height,
        "height": native_width,
        "hasDepth": False,
        "smoothedDepth": False,
    }


class _PrematerializedRaster:
    """Deterministic test adapter; deliberately not a production HEIC decoder."""

    def materialize(
        self,
        *,
        source,
        source_name: str,
        destination,
        engine_name: str,
        encoded_width: int,
        encoded_height: int,
        deadline: RefineDeadline,
    ) -> FieldRasterMaterialization:
        pixels = bytes([engine_name.encode()[-5] % 251]) * (
            encoded_width * encoded_height * 3
        )
        destination.write(
            f"P6\n{encoded_width} {encoded_height}\n255\n".encode("ascii") + pixels
        )
        return FieldRasterMaterialization(
            materializer_id="fake-prematerialized-ppm-v1",
            source_width=encoded_width,
            source_height=encoded_height,
            output_width=encoded_width,
            output_height=encoded_height,
        )


class _Bundle:
    """One real on-disk Field bundle, laid out exactly as Storage would key it."""

    def __init__(
        self,
        root: Path,
        *,
        count: int = FRAME_COUNT,
        native: tuple[int, int] = _NATIVE_FIXTURE_SIZE,
    ) -> None:
        rows = [
            _index_row(index, count=count, native=native) for index in range(count)
        ]
        index_payload = b"".join(_canonical_json(row) for row in rows)
        summary_payload = _canonical_json(
            {
                "fired": len(rows),
                "blurRejected": 0,
                "rawBlurFailures": 0,
                "encodeDropped": 0,
                "blurRejectionRatio": 0.0,
            }
        )
        archive = io.BytesIO()
        with tarfile.open(
            fileobj=archive, mode="w", format=tarfile.USTAR_FORMAT
        ) as handle:
            for row in rows:
                name = str(row["heicPath"])
                payload = f"heic:{name}".encode("ascii")
                member = tarfile.TarInfo(name)
                member.mtime = 0
                member.size = len(payload)
                handle.addfile(member, io.BytesIO(payload))
        archive_payload = archive.getvalue()

        self.index = RefineSourceArtifact(
            object_key=f"keyframes/{USER_ID}/{SCAN_ID}/keyframe_index.ndjson",
            sha256=_sha256(index_payload),
            size_bytes=len(index_payload),
        )
        self.summary = RefineSourceArtifact(
            object_key=f"keyframes/{USER_ID}/{SCAN_ID}/keyframe_summary.json",
            sha256=_sha256(summary_payload),
            size_bytes=len(summary_payload),
        )
        self.archive = RefineSourceArtifact(
            object_key=f"bundle/{USER_ID}/{SCAN_ID}/keyframes.tar",
            sha256=_sha256(archive_payload),
            size_bytes=len(archive_payload),
        )
        manifest_payload = _canonical_json(
            {
                "schemaVersion": 3,
                "bundleSpecVersion": 1,
                "scanId": SCAN_ID,
                "checksumAlgorithm": "sha256",
                "artifacts": [
                    {
                        "kind": "keyframeIndex",
                        "relativePath": "keyframes/keyframe_index.ndjson",
                        "sizeBytes": self.index.size_bytes,
                        "sha256": self.index.sha256,
                        "mimeType": "application/x-ndjson",
                    },
                    {
                        "kind": "keyframeSummary",
                        "relativePath": "keyframes/keyframe_summary.json",
                        "sizeBytes": self.summary.size_bytes,
                        "sha256": self.summary.sha256,
                        "mimeType": "application/json",
                    },
                    {
                        "kind": "keyframesArchive",
                        "relativePath": "keyframes.tar",
                        "sizeBytes": self.archive.size_bytes,
                        "sha256": self.archive.sha256,
                        "mimeType": "application/x-tar",
                    },
                ],
            }
        )
        self.manifest = RefineSourceArtifact(
            object_key=f"manifests/{USER_ID}/{SCAN_ID}/manifest.json",
            sha256=_sha256(manifest_payload),
            size_bytes=len(manifest_payload),
        )
        self.root = root
        for source, payload in (
            (self.manifest, manifest_payload),
            (self.index, index_payload),
            (self.summary, summary_payload),
            (self.archive, archive_payload),
        ):
            path = root / Path(*source.object_key.split("/"))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)


def _deadline(seconds: float = 120.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _verification_for(snapshot: SparseModelSnapshot) -> ParentAlignmentVerification:
    """A verification whose aligned digest really is this snapshot's.

    Every field other than the digests is a placeholder: the only one the
    publish-seam binding reads is ``aligned_pose_digest_sha256``, and it must be
    the PARENT's own digest of the snapshot being published, so it is computed
    here rather than written down.
    """

    return ParentAlignmentVerification(
        transform=Sim3.identity(),
        raw_pose_digest_sha256="0" * 64,
        aligned_pose_digest_sha256=canonical_pose_digest(snapshot),
        correspondences=len(snapshot.poses),
        scale_relative_difference=0.0,
        rotation_angle_difference_rad=0.0,
        translation_difference_m=0.0,
        gauge_scale_deviation=0.0,
        gauge_rotation_rad=0.0,
        gauge_translation_m=0.0,
        fit_rmse_m=0.0,
        max_aligned_orientation_change_rad=0.0,
        seed_rms_radius_m=1.0,
        max_raw_pose_drift_m=0.0,
        max_raw_rotation_drift_rad=0.0,
        seed_min_principal_extent_m=1.0,
        aligned_min_principal_extent_m=1.0,
    )


def _materialize(
    bundle: _Bundle,
    scratch: Path,
    deadline: RefineDeadline,
    raster_materializer=None,
):
    materializer = RefineMaterializer(
        acquirer=LocalScratchArtifactAcquirer(bundle.root),
        raster_materializer=raster_materializer or _PrematerializedRaster(),
    )
    return materializer.materialize(
        RefineMaterializationRequest(
            user_id=USER_ID,
            scan_id=SCAN_ID,
            task_id=TASK_ID,
            lease_id=LEASE_ID,
            workspace_parent=scratch,
            manifest=bundle.manifest,
            keyframe_index=bundle.index,
            keyframe_summary=bundle.summary,
            keyframes_archive=bundle.archive,
        ),
        deadline=deadline,
    )


# ===========================================================================
# The recorded engine
# ===========================================================================
#: The similarity the recorded engine applies to the raw pre-BA model to produce
#: the aligned model.  Deliberately a SMALL perturbation of identity: the
#: alignment verifier refuses a model still sitting in the arbitrary bundle
#: adjustment gauge, so a large transform would (correctly) be rejected and the
#: fixture would prove nothing about the happy path.
_ALIGNED_SCALE = 1.004
_ALIGNED_ROTATION = _axis_rotation((0.3, -0.7, 0.65), 0.012)
_ALIGNED_TRANSLATION = (0.031, -0.017, 0.024)


def _seed_rows(frames) -> list[dict[str, object]]:
    rows = []
    for ordinal, frame in enumerate(frames, start=1):
        pose = frame.frame.colmap_pose
        rows.append(
            {
                "image_id": ordinal,
                "camera_id": ordinal,
                "name": frame.engine_name,
                "qvec": tuple(float(value) for value in pose.qvec),
                "tvec": tuple(float(value) for value in pose.translation),
            }
        )
    return rows


def _apply_similarity(
    rows: list[dict[str, object]], *, scale: float = _ALIGNED_SCALE
) -> list[dict[str, object]]:
    """Carry a Sim(3) through world-to-camera poses, by hand.

    If ``world' = s R world + t`` then ``R_cam' = R_cam R^T`` and
    ``t_cam' = s t_cam - R_cam R^T t``.  Written out here so the alignment the
    parent has to RECOVER was never produced by the parent's own solver.

    ``scale`` is a parameter so that a RIGID motion -- ``s`` exactly 1.0 -- can be
    built with the same code path as a scaled one.  It matters that they are the
    same code path: the point of testing both is that the shape floor is blind to
    which similarity was applied, and a second implementation would let one of
    them differ for a reason unrelated to shape.
    """

    transformed = []
    for row in rows:
        rotation = _quat_to_rot(row["qvec"])  # type: ignore[arg-type]
        new_rotation = _matmul(rotation, _transpose(_ALIGNED_ROTATION))
        old_translation = row["tvec"]
        shifted = _matvec(new_rotation, _ALIGNED_TRANSLATION)
        new_translation = tuple(
            scale * old_translation[axis] - shifted[axis]  # type: ignore[index]
            for axis in range(3)
        )
        transformed.append(
            {
                **row,
                "qvec": _rot_to_quat(new_rotation),
                "tvec": new_translation,
            }
        )
    return transformed


# ---------------------------------------------------------------------------
# The bundle adjustment the recorded engine models
#
# WHY THIS EXISTS.  The engine used to produce its aligned model by applying ONE
# similarity to the seed, so the cameras never moved relative to one another and
# the gauge-invariant shape change was float64 noise -- 4.12e-16 m on this
# fixture's 1.926 m-radius trajectory.  Against that fixture no floor on
# ``fit_rmse_m`` above machine epsilon could be added without reddening every
# happy path, which is exactly why the gap stayed open.  So the engine now models
# what bundle adjustment DOES: it moves each camera with respect to the others,
# and only then applies the alignment similarity.
# ---------------------------------------------------------------------------
#: RMS gauge-invariant displacement, in metres, the modelled adjustment applies
#: to the seed camera centres.  An ILLUSTRATIVE magnitude, not a measurement: no
#: archive in this repository came out of COLMAP.  2 cm is the scale at which a
#: bundle adjustment corrects visual-inertial drift over a room walk, it is four
#: decades above ``REFINED_MODEL_MIN_SHAPE_CHANGE_M`` (1e-6 m) and 48x below the
#: ceiling ``ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION`` puts on this trajectory
#: (0.5 x 1.926 = 0.963 m), so the happy path sits far from BOTH bounds.
_BA_SHAPE_CHANGE_RMS_M = 2.0e-2

#: Per-camera attitude correction, in radians, at the widest camera.  0.1 degree
#: is a plausible correction to a gravity-anchored device attitude and stays two
#: and a half decades below ``ALIGNED_MAX_ORIENTATION_CHANGE_RAD`` (0.5 rad), so
#: clause 15 is exercised with a real number rather than with zero.
_BA_MAX_ATTITUDE_CHANGE_RAD = 2.0e-3


def _pseudo_random_field(count: int, *, seed: int) -> list[tuple[float, float, float]]:
    """A fixed displacement field, generated in INTEGER arithmetic.

    Deterministic on every platform and every Python build: no ``random``, no
    ``math`` transcendental, nothing whose last bits are a libm decision.  The
    recurrence is the standard 64-bit LCG; only its determinism matters here.
    """

    state = seed & ((1 << 64) - 1)
    field = []
    for _ in range(count):
        components = []
        for _ in range(3):
            state = (state * 6364136223846793005 + 1442695040888963407) % (1 << 64)
            components.append((state >> 11) / float(1 << 53) * 2.0 - 1.0)
        field.append((components[0], components[1], components[2]))
    return field


def _similarity_generators(
    centres: list[tuple[float, float, float]],
) -> list[list[tuple[float, float, float]]]:
    """The seven directions in R^(3N) along which a similarity moves the centres.

    Three translations, three rotations and one uniform scale -- the tangent
    space of the similarity group's action on this point set.  A displacement
    field with NO component along any of them is a change the best similarity
    cannot absorb, which is precisely what "shape change" means.

    Written here rather than derived from ``estimate_sim3``: the parent's solver
    is the thing under test, so the fixture must not be built out of it.
    """

    count = len(centres)
    centroid = tuple(
        sum(centre[axis] for centre in centres) / count for axis in range(3)
    )
    centered = [
        tuple(centre[axis] - centroid[axis] for axis in range(3)) for centre in centres
    ]
    generators: list[list[tuple[float, float, float]]] = []
    for axis in range(3):
        unit = tuple(1.0 if index == axis else 0.0 for index in range(3))
        generators.append([unit for _ in centres])  # type: ignore[misc]
    for axis in range(3):
        unit = tuple(1.0 if index == axis else 0.0 for index in range(3))
        generators.append(
            [
                (
                    unit[1] * point[2] - unit[2] * point[1],
                    unit[2] * point[0] - unit[0] * point[2],
                    unit[0] * point[1] - unit[1] * point[0],
                )
                for point in centered
            ]
        )
    generators.append([tuple(point) for point in centered])  # type: ignore[misc]
    return generators


def _flat_dot(left, right) -> float:
    return sum(
        left[index][axis] * right[index][axis]
        for index in range(len(left))
        for axis in range(3)
    )


def _gauge_free_displacements(
    centres: list[tuple[float, float, float]],
) -> list[tuple[float, float, float]]:
    """A displacement field orthogonal to every similarity of ``centres``.

    THE POINT, and it is exact rather than approximate.  Horn's solve returns the
    IDENTITY for source ``c`` and target ``c + d`` exactly when three linear
    conditions hold on ``d``: ``sum(d) = 0`` (else the centroids differ and the
    translation is non-zero), ``sum(c' x d) = 0`` (else the cross-dispersion is
    asymmetric and the rotation is not identity), and ``sum(c' . d) = 0`` (else
    the scale is not one), where ``c'`` are the centred sources.  Those are
    exactly orthogonality to the seven generators above.  So a field projected
    off them leaves the recovered alignment EQUAL to the similarity the engine
    declares -- the child's proposal stays the closed-form transform written at
    the top of this section, and the parent's agreement clauses still have to
    recover it from bytes.

    The residual the parent then reports is the RMS of this field, which is what
    makes the shape-floor tests measurements rather than assertions.

    Gram-Schmidt runs twice: one pass leaves a component of order eps against the
    conditioning of the generator set, and the alignment agreement tolerances are
    1e-6 rather than 1e-12, so the margin is cheap to buy and worth buying.
    """

    generators = _similarity_generators(centres)
    orthonormal: list[list[tuple[float, float, float]]] = []
    for generator in generators:
        vector = [tuple(point) for point in generator]
        for _pass in range(2):
            for basis in orthonormal:
                projection = _flat_dot(vector, basis)
                vector = [
                    tuple(
                        vector[index][axis] - projection * basis[index][axis]
                        for axis in range(3)
                    )
                    for index in range(len(vector))
                ]
        norm = math.sqrt(_flat_dot(vector, vector))
        assert norm > 1e-9, "the fixture trajectory degenerated; a generator vanished"
        orthonormal.append(
            [
                tuple(component / norm for component in point)  # type: ignore[misc]
                for point in vector
            ]
        )

    field = _pseudo_random_field(len(centres), seed=0x5EED_C0DE_1119_2026)
    for _pass in range(2):
        for basis in orthonormal:
            projection = _flat_dot(field, basis)
            field = [
                tuple(
                    field[index][axis] - projection * basis[index][axis]
                    for axis in range(3)
                )
                for index in range(len(field))
            ]
    magnitude = math.sqrt(_flat_dot(field, field) / len(field))
    assert magnitude > 0.0, "the projected displacement field collapsed to zero"
    factor = _BA_SHAPE_CHANGE_RMS_M / magnitude
    return [
        tuple(component * factor for component in point)  # type: ignore[misc]
        for point in field
    ]


def _bundle_adjusted_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    """Move every camera with respect to every other one, as an adjustment does.

    Centres move by the gauge-free field above; attitudes move by a small
    per-camera rotation so that the aligned orientations are not merely the seed
    orientations carried by the alignment.  Neither is a model of COLMAP's
    arithmetic -- it is a model of the one PROPERTY that distinguishes a
    refinement from a re-gauging.
    """

    centres = []
    rotations = []
    for row in rows:
        rotation = _quat_to_rot(row["qvec"])  # type: ignore[arg-type]
        rotations.append(rotation)
        translation = tuple(float(value) for value in row["tvec"])  # type: ignore[arg-type]
        centres.append(
            tuple(-value for value in _matvec(_transpose(rotation), translation))
        )

    displacements = _gauge_free_displacements(centres)
    attitudes = _pseudo_random_field(len(rows), seed=0xA771_7DE5_1119_2026)
    adjusted = []
    for index, row in enumerate(rows):
        axis = attitudes[index]
        if axis == (0.0, 0.0, 0.0):  # pragma: no cover - the LCG never emits it
            axis = (1.0, 0.0, 0.0)
        # The third component sets the angle, so different cameras turn by
        # different amounts about different axes.
        angle = _BA_MAX_ATTITUDE_CHANGE_RAD * axis[2]
        rotation = _matmul(_axis_rotation(axis, angle), rotations[index])
        centre = tuple(
            centres[index][component] + displacements[index][component]
            for component in range(3)
        )
        adjusted.append(
            {
                **row,
                "qvec": _rot_to_quat(rotation),
                "tvec": tuple(-value for value in _matvec(rotation, centre)),
            }
        )
    return adjusted


def _snapshot_from_rows(rows: list[dict[str, object]], label: str) -> SparseModelSnapshot:
    poses = []
    for row in rows:
        rotation = _quat_to_rot(row["qvec"])  # type: ignore[arg-type]
        translation = tuple(float(value) for value in row["tvec"])  # type: ignore[arg-type]
        centre = tuple(-value for value in _matvec(_transpose(rotation), translation))
        poses.append(
            SparseModelPose(
                image_id=int(row["image_id"]),  # type: ignore[arg-type]
                camera_id=int(row["camera_id"]),  # type: ignore[arg-type]
                name=str(row["name"]),
                qvec=tuple(float(value) for value in row["qvec"]),  # type: ignore[arg-type]
                tvec=translation,  # type: ignore[arg-type]
                camera_center_m=centre,  # type: ignore[arg-type]
            )
        )
    return SparseModelSnapshot(
        label=label,
        poses=tuple(sorted(poses, key=lambda pose: pose.name)),
        camera_ids=tuple(sorted({pose.camera_id for pose in poses})),
    )


_GOOD_EVIDENCE = {
    "reprojectionRmsePxBefore": 1.90,
    "reprojectionRmsePxAfter": 0.74,
    "loopRotationRmseDegBefore": 0.62,
    "loopRotationRmseDegAfter": 0.28,
    "loopTranslationDirectionRmseDegBefore": 1.44,
    "loopTranslationDirectionRmseDegAfter": 0.83,
}


class _RecordedEngine:
    """Plays :func:`run_native_engine_child`'s role at the one composed seam.

    It writes seven real files, opens them read-only, and hands the descriptors
    to the caller-owned sink exactly as the boundary does.  It does NOT reproduce
    the ``O_TMPFILE`` freeze: these copies have names, which is precisely the
    property the Linux-only suite exists to prove and this suite does not claim.
    """

    #: THE FOUR CHILDREN THIS RECORDING CAN BE, as an explicit closed set rather
    #: than as a pile of booleans, because three of them are DEGENERATE and the
    #: whole point of the publish seam is telling them apart.
    #:
    #:   ``bundle-adjusted`` -- the default and the only honest one.  Cameras move
    #:       with respect to each other, THEN the alignment similarity is applied.
    #:       This is the shape the composition must accept.
    #:   ``similarity``      -- the seed under a scaled rotation+translation.  The
    #:       previous default.  Every pose moves; no camera moves relative to any
    #:       other.  Must be refused.
    #:   ``rigid``           -- the seed under a rotation+translation at scale
    #:       exactly 1.0.  Carried separately from ``similarity`` because a reader
    #:       may believe the scale gauge clause catches the similarity case, and a
    #:       rigid motion has no scale to catch.  Must be refused.
    #:   ``identity``        -- the seed, unchanged, with the identity proposal.
    #:       Must be refused, and is, by the movement floor before the shape floor
    #:       is even reached.
    ALIGNMENT_MODES = ("bundle-adjusted", "similarity", "rigid", "identity")

    def __init__(
        self,
        artifact_root: Path,
        frames,
        *,
        seed_rows=None,
        aligned_rows=None,
        alignment_mode: str = "bundle-adjusted",
        evidence: dict[str, float] | None = None,
        report_mutation=None,
        digest_mutation=None,
    ) -> None:
        self.artifact_root = artifact_root
        self.frames = frames
        self._seed_rows = seed_rows if seed_rows is not None else _seed_rows(frames)
        assert alignment_mode in self.ALIGNMENT_MODES, alignment_mode
        # Every branch below is a REAL engine output, not a patched one: item 6
        # accepts all four, because each is a self-consistent alignment of the
        # model it ships.  Which of them the COMPOSITION accepts is the question
        # the publish seam exists to answer.
        if alignment_mode == "identity":
            self._aligned_rows = list(self._seed_rows)
            self._alignment = (
                1.0,
                ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
                (0.0, 0.0, 0.0),
            )
        elif alignment_mode == "rigid":
            self._aligned_rows = _apply_similarity(self._seed_rows, scale=1.0)
            self._alignment = (1.0, _ALIGNED_ROTATION, _ALIGNED_TRANSLATION)
        else:
            refined = (
                self._seed_rows
                if alignment_mode == "similarity"
                else _bundle_adjusted_rows(self._seed_rows)
            )
            self._aligned_rows = (
                aligned_rows if aligned_rows is not None else _apply_similarity(refined)
            )
            self._alignment = (
                _ALIGNED_SCALE,
                _ALIGNED_ROTATION,
                _ALIGNED_TRANSLATION,
            )
        self._evidence = dict(evidence or _GOOD_EVIDENCE)
        self._report_mutation = report_mutation
        self._digest_mutation = digest_mutation
        self.calls: list[dict[str, object]] = []
        #: Raw descriptors this recording opened and has NOT yet handed over.
        #: Adoption transfers ownership to the caller's sink, exactly as the
        #: real boundary transfers ownership of its private copies, so anything
        #: still listed here after a run is a descriptor the sink never took.
        self.unadopted_descriptors: list[int] = []
        self.adopted_descriptors: list[int] = []
        self.pinned_snapshot: dict[str, tuple[str, int]] = {}

    def close(self) -> None:
        while self.unadopted_descriptors:
            os.close(self.unadopted_descriptors.pop())

    def __call__(
        self,
        request,
        *,
        deadline: RefineDeadline,
        pinned_files,
        workspace_parent_directory: str,
        outputs: NativeEngineOutputs,
    ):
        deadline.remaining_seconds()
        # Read the packet the parent really built, through the descriptors the
        # parent really pinned.  A recording that ignored its inputs would let a
        # broken packet builder pass.
        self.pinned_snapshot = {
            token: (pinned.sha256, pinned.size_bytes)
            for token, pinned in pinned_files.items()
        }
        for pinned in pinned_files.values():
            digest = hashlib.sha256()
            offset = 0
            while offset < pinned.size_bytes:
                block = os.pread(
                    pinned.descriptor,
                    min(1 << 20, pinned.size_bytes - offset),
                    offset,
                )
                assert block, "pinned packet file ended before its declared size"
                digest.update(block)
                offset += len(block)
            assert digest.hexdigest() == pinned.sha256
        self.calls.append(
            {
                "request": dict(request),
                "workspaceParentDirectory": workspace_parent_directory,
                "tokens": tuple(sorted(pinned_files)),
            }
        )

        payloads = {
            "adapter-v2.json": _canonical_json({"adapter": "recorded"}),
            "aligned-sparse-model-v1.tar": _model_tar(self._aligned_rows),
            "database-v1.db": b"SQLite format 3\x00recorded",
            "engine-command-evidence-v1.json": _canonical_json({"commands": []}),
            "pairs-v2.txt": b"frame_000000.ppm frame_000001.ppm\n",
            "raw-triangulated-model-snapshot-v1.tar": _model_tar(self._seed_rows),
            "seed-model-v1.tar": _model_tar(self._seed_rows),
        }
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        adopted = []
        declared: dict[str, dict[str, object]] = {}
        for token in NATIVE_ENGINE_OUTPUT_TOKENS:
            payload = payloads[token]
            path = self.artifact_root / token
            path.write_bytes(payload)
            descriptor = os.open(path, os.O_RDONLY)
            self.unadopted_descriptors.append(descriptor)
            metadata = os.fstat(descriptor)
            digest = _sha256(payload)
            adopted.append(
                NativeEngineOutput(
                    token=token,
                    descriptor=descriptor,
                    sha256=digest,
                    size_bytes=len(payload),
                    identity=(metadata.st_dev, metadata.st_ino),
                    verified_snapshot=tuple(metadata),
                    source_identity=(metadata.st_dev, metadata.st_ino),
                )
            )
            declared[token] = {"sha256": digest, "sizeBytes": len(payload)}
        if self._digest_mutation is not None:
            declared = self._digest_mutation(declared)
        outputs._adopt(tuple(adopted))
        self.adopted_descriptors = list(self.unadopted_descriptors)
        self.unadopted_descriptors.clear()

        raw_snapshot = _snapshot_from_rows(self._seed_rows, "raw pre-BA")
        aligned_snapshot = _snapshot_from_rows(self._aligned_rows, "aligned")
        report = {
            "schemaVersion": ENGINE_REPORT_SCHEMA_VERSION,
            "contract": ENGINE_REPORT_CONTRACT,
            "cliVersion": "4.0.2",
            "bindingVersion": "4.0.2",
            "selectedEngine": "colmap-4-known-pose-triangulate-ba",
            "alignment": {
                "scale": self._alignment[0],
                "rotation": [list(row) for row in self._alignment[1]],
                "translationMeters": list(self._alignment[2]),
                "rawPoseDigestSha256": canonical_pose_digest(raw_snapshot),
                "alignedPoseDigestSha256": canonical_pose_digest(aligned_snapshot),
            },
            "evidence": {
                "inputImages": len(self.frames),
                "registeredImagesBefore": len(self.frames),
                "registeredImagesAfter": len(self.frames),
                "commonObservations": 4096,
                "commonObservationSetSha256": "1" * 64,
                "verifiedLoopEdges": 9,
                "verifiedLoopSetSha256": "2" * 64,
                **self._evidence,
            },
            "telemetry": {
                "durationMs": 61000,
                "iterations": 42,
                "vramPeakMb": 2048,
                "commandCount": 12,
                "metrics": {"gpuIndex": "0"},
            },
            "outputs": declared,
        }
        if self._report_mutation is not None:
            report = self._report_mutation(report)
        deadline.remaining_seconds()
        return report


def _run(
    tmp_path: Path,
    *,
    engine_kwargs: dict | None = None,
    deadline: RefineDeadline | None = None,
    toolchain_manifest_path: str | None = None,
    bundle_kwargs: dict | None = None,
    raster_materializer=None,
):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir(parents=True)
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700, parents=True)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700, parents=True)
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")

    bundle = _Bundle(bundle_root, **(bundle_kwargs or {}))
    carried = deadline or _deadline()
    # The probe is TEST SCAFFOLDING -- it exists only so the recording knows
    # which engine names and poses the lifecycle will produce -- so it runs on
    # its own clock.  Handing it ``carried`` would make an expired-deadline test
    # fail in the harness instead of in the code under test.
    probe = _materialize(bundle, scratch, _deadline())
    frames = probe.frames
    probe.cleanup()

    engine = _RecordedEngine(
        tmp_path / "engine-outputs",
        frames,
        **(engine_kwargs or {}),
    )
    sink = LocalScratchStorageSink(publish)
    try:
        report = run_refine_lifecycle(
            RefineLifecycleRequest(
                user_id=USER_ID,
                scan_id=SCAN_ID,
                task_id=TASK_ID,
                lease_id=LEASE_ID,
                room_file_id=ROOM_FILE_ID,
                room_file_version=1,
                scratch_root=scratch,
                manifest=bundle.manifest,
                keyframe_index=bundle.index,
                keyframe_summary=bundle.summary,
                keyframes_archive=bundle.archive,
            ),
            acquirer=LocalScratchArtifactAcquirer(bundle_root),
            # The PROBE above always rasterises through the deterministic
            # stand-in, because all it needs from the materialization is the
            # engine names and poses -- neither of which depends on the raster
            # adapter.  Only the run under test uses ``raster_materializer``,
            # so a test driving the real packaged adapter pays for it once.
            raster_materializer=raster_materializer or _PrematerializedRaster(),
            storage=sink,
            deadline=carried,
            native_engine_call=engine,
            toolchain_manifest_path=toolchain_manifest_path or str(manifest),
        )
    finally:
        engine.close()
    return report, engine, sink, scratch


# ===========================================================================
# Posture
# ===========================================================================
def test_the_lifecycle_is_composed_and_never_claims_to_be_qualified():
    assert PRODUCTION_ENABLEMENT == "composed-local-scratch-only"
    assert REFINE_LIFECYCLE_QUALIFIED is False
    assert REFINE_LIFECYCLE_STAGE_REGISTERED is False


def test_refine_is_still_absent_from_the_worker_dispatch_table():
    """Read the real registry, never the module's own claim about it."""

    from patina_scan_worker.config import DEFAULT_STAGES
    from patina_scan_worker.stages import get_handler

    assert DEFAULT_STAGES == "ingest,solve,drawings"
    assert get_handler("scan_pipeline.refine") is None


def test_nothing_under_stages_imports_the_lifecycle():
    """The composed entry point must be unreachable from dispatch, by imports."""

    package = pathlib.Path(refine_lifecycle.__file__).resolve().parent
    offenders = []
    for module in sorted((package / "stages").rglob("*.py")):
        tree = ast.parse(module.read_text())
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.ImportFrom):
                names.append(node.module or "")
                names.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.Import):
                names.extend(alias.name for alias in node.names)
            if any("refine" in name for name in names):
                offenders.append((module.name, names))
    assert offenders == []


def test_the_lifecycle_has_no_console_script_entry_point():
    """``python -m`` typed by a person is the only door."""

    root = pathlib.Path(__file__).resolve().parent.parent
    with (root / "pyproject.toml").open("rb") as handle:
        document = tomllib.load(handle)
    scripts = document["project"].get("scripts", {})
    assert all("refine" not in target for target in scripts.values())


def test_the_declared_child_entrypoint_pins_the_toolchain_before_it_extracts(
    monkeypatch,
):
    """The named child is the composed backend, and its FIRST act is the pin.

    R121 replaced the frozen refusal with a real body, so this can no longer
    assert ``disabled and uncomposed``.  What it asserts instead is the property
    that actually matters on a machine that is not the qualified box: the pin
    runs BEFORE extraction, so a host without ``/opt/colmap/4.0.2`` is refused
    while the lease is still empty.

    ORDERING IS PROVED BY CONSTRUCTION, not by reading the code: the extractor
    is replaced with a recorder that would happily succeed, and the assertion is
    that it was never entered.  Swapping the two statements in the child turns
    this red.
    """

    from patina_scan_worker import refine_colmap_backend
    from patina_scan_worker.refine_colmap_backend import run_refine_colmap_native

    assert DEFAULT_CHILD_ENTRYPOINT == (
        "patina_scan_worker.refine_colmap_backend:run_refine_colmap_native"
    )

    entered: list[object] = []

    @contextlib.contextmanager
    def recording_extractor(request, context):
        entered.append(request)
        yield object()

    def refusing_toolchain(*, context, deadline):
        raise AdapterError("pinned toolchain absent", "REFINE_TOOLCHAIN_UNQUALIFIED")

    # BOTH collaborators are substituted, so the assertion is about ORDER and
    # nothing else.  Substituting only the extractor made this test pass on a
    # machine without ``/opt/colmap/4.0.2`` and fail on the qualified host,
    # which is the shape this program keeps catching: a green that depended on
    # the box rather than on the code.
    monkeypatch.setattr(
        refine_colmap_backend, "extract_colmap_packet", recording_extractor
    )
    monkeypatch.setattr(
        refine_colmap_backend,
        "load_qualified_colmap_toolchain",
        refusing_toolchain,
    )
    context = NativeChildContext(time.monotonic() + 60.0)
    with pytest.raises(AdapterError) as raised:
        run_refine_colmap_native({}, context)
    assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert entered == []


# ===========================================================================
# The qualified toolchain path
# ===========================================================================
def test_the_owner_installed_manifest_path_is_the_pinned_one():
    assert QUALIFIED_TOOLCHAIN_MANIFEST_PATH == (
        "/opt/colmap/4.0.2/share/patina/refine-colmap-toolchain-v1.manifest.json"
    )


def test_an_absent_toolchain_manifest_fails_closed_with_one_diagnostic(tmp_path):
    missing = tmp_path / "not-installed.json"
    preflight = preflight_qualified_toolchain(manifest_path=str(missing))
    assert preflight.present is False
    assert "is not readable at" in preflight.diagnostic
    assert "has no unqualified path" in preflight.diagnostic
    with pytest.raises(AdapterError) as raised:
        require_qualified_toolchain(manifest_path=str(missing))
    assert raised.value.code == LIFECYCLE_TOOLCHAIN_MISSING_CODE


def test_a_directory_at_the_manifest_path_is_not_a_manifest(tmp_path):
    directory = tmp_path / "manifest-shaped-directory"
    directory.mkdir()
    preflight = preflight_qualified_toolchain(manifest_path=str(directory))
    assert preflight.present is False
    assert "is not a regular file" in preflight.diagnostic


def test_a_present_manifest_is_granted_nothing_by_the_preflight(tmp_path):
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")
    preflight = preflight_qualified_toolchain(manifest_path=str(manifest))
    assert preflight.present is True
    assert "re-verifies it by descriptor" in preflight.diagnostic


def test_the_lifecycle_refuses_before_it_acquires_anything(tmp_path):
    """The toolchain gate runs before the acquirer is ever called."""

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)

    class _ExplodingAcquirer:
        def acquire(self, **_kwargs):  # pragma: no cover - must never run
            raise AssertionError("the acquirer ran despite a missing toolchain")

    with pytest.raises(AdapterError) as raised:
        run_refine_lifecycle(
            RefineLifecycleRequest(
                user_id=USER_ID,
                scan_id=SCAN_ID,
                task_id=TASK_ID,
                lease_id=LEASE_ID,
                room_file_id=ROOM_FILE_ID,
                room_file_version=1,
                scratch_root=scratch,
                manifest=bundle.manifest,
                keyframe_index=bundle.index,
                keyframe_summary=bundle.summary,
                keyframes_archive=bundle.archive,
            ),
            acquirer=_ExplodingAcquirer(),
            raster_materializer=_PrematerializedRaster(),
            storage=LocalScratchStorageSink(publish),
            deadline=_deadline(),
            native_engine_call=lambda *a, **k: None,  # pragma: no cover
            toolchain_manifest_path=str(tmp_path / "absent.json"),
        )
    assert raised.value.code == LIFECYCLE_TOOLCHAIN_MISSING_CODE
    assert list(scratch.iterdir()) == []


# ===========================================================================
# The composed happy path
# ===========================================================================
def test_the_whole_lifecycle_runs_and_publishes_every_artifact(tmp_path):
    report, engine, sink, scratch = _run(tmp_path)

    assert len(engine.calls) == 1
    call = engine.calls[0]
    assert call["tokens"] == ("packet.chunk.000", "packet.manifest")
    assert call["request"]["contract"] == "patina-refine-colmap-input-packet-v1"
    assert call["request"]["manifestToken"] == "packet.manifest"

    assert report.result.selected_engine == "colmap-4-known-pose-triangulate-ba"
    assert report.result.evidence_verdict.refinement_evidenced is True
    assert report.result.evidence_verdict.absolute_accuracy_certified is False
    assert report.seed_anchor.correspondences == FRAME_COUNT

    published = sorted(sink.published)
    assert published == sorted(
        [
            f"room_file/{USER_ID}/{SCAN_ID}/v1/refine/{name}"
            for name in (
                "adapter-v2.json",
                "aligned-sparse-model-v1.tar",
                "database-v1.db",
                "engine-command-evidence-v1.json",
                "pairs-v2.txt",
                "pose-deltas-v1.json",
                "refined-poses-v1.json",
                "refine-manifest-v1.json",
                "refinement-evidence-v1.json",
                "seed-model-v1.tar",
                "trajectory-shape-v1.json",
            )
        ]
    )
    manifest_key = f"room_file/{USER_ID}/{SCAN_ID}/v1/refine/refine-manifest-v1.json"
    assert report.publication.manifest.object_key == manifest_key
    assert report.publication.manifest.created is True
    on_disk = sink.root / Path(*manifest_key.split("/"))
    document = json.loads(on_disk.read_bytes())
    assert document["status"] == "complete"
    assert document["productionEnablement"] == "disabled"
    assert document["engine"]["selected"] == "colmap-4-known-pose-triangulate-ba"


def test_the_scratch_raw_snapshot_is_never_published(tmp_path):
    """Seven descriptors come back; only six are publishable artifacts."""

    _report, _engine, sink, _scratch = _run(tmp_path)
    assert not any(
        "raw-triangulated-model-snapshot-v1.tar" in key for key in sink.published
    )


def test_the_packet_the_child_received_carries_every_engine_image(tmp_path):
    _report, engine, _sink, _scratch = _run(tmp_path)
    assert sorted(engine.pinned_snapshot) == ["packet.chunk.000", "packet.manifest"]
    # The recorded engine re-hashed both pinned descriptors against their
    # declared digests before this assertion could be reached.
    assert engine.pinned_snapshot["packet.chunk.000"][1] > 0


def test_the_report_document_states_its_own_posture(tmp_path):
    report, _engine, _sink, _scratch = _run(tmp_path)
    document = report.to_document()
    assert document["contract"] == "patina-refine-lifecycle-report-v1"
    assert document["productionEnablement"] == "composed-local-scratch-only"
    assert document["stageRegistered"] is False
    assert document["qualified"] is False
    assert document["trajectoryShapeChange"]["certificationRole"] == "diagnostic-only"
    assert document["seedAnchor"]["correspondences"] == FRAME_COUNT


def test_all_scratch_is_removed_on_success(tmp_path):
    _report, _engine, _sink, scratch = _run(tmp_path)
    assert list(scratch.iterdir()) == []


def test_all_scratch_is_removed_when_the_engine_raises(tmp_path):
    def _explode(report):
        raise RuntimeError("engine detonated after populating its sink")

    with pytest.raises(RuntimeError):
        _run(tmp_path, engine_kwargs={"report_mutation": _explode})
    assert list((tmp_path / "scratch").iterdir()) == []


# ===========================================================================
# The anchor -- the substantive increment over item 6
# ===========================================================================
def test_the_anchor_compares_the_seed_archive_to_the_parents_own_poses(tmp_path):
    report, _engine, _sink, _scratch = _run(tmp_path)
    # The recorded engine builds the seed from the parent's own poses, so the
    # only drift available is float round-trip through the archive format.
    assert report.seed_anchor.max_center_drift_m < SEED_ANCHOR_MAX_CENTER_DRIFT_M
    assert report.seed_anchor.max_rotation_drift_rad < (
        SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD
    )


def test_a_moved_seed_camera_centre_is_refused(tmp_path):
    def _shift(rows):
        moved = [dict(row) for row in rows]
        moved[3]["tvec"] = tuple(
            value + (0.01 if axis == 0 else 0.0)
            for axis, value in enumerate(moved[3]["tvec"])
        )
        return moved

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    carried = _deadline()
    probe = _materialize(bundle, scratch, carried)
    rows = _shift(_seed_rows(probe.frames))
    probe.cleanup()

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path / "run", engine_kwargs={"seed_rows": rows})
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "camera centres drifted from the submitted poses" in str(raised.value)


def test_a_rotated_seed_orientation_is_refused(tmp_path):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    carried = _deadline()
    probe = _materialize(bundle, scratch, carried)
    rows = [dict(row) for row in _seed_rows(probe.frames)]
    probe.cleanup()

    # Rotate one image, and move its translation so its CENTRE is unchanged --
    # otherwise the centre clause fires first and the rotation clause is never
    # reached, which would make the rotation clause deletable with zero red.
    target = rows[5]
    rotation = _quat_to_rot(target["qvec"])
    centre = tuple(
        -value for value in _matvec(_transpose(rotation), target["tvec"])
    )
    turned = _matmul(_axis_rotation((0.0, 0.0, 1.0), 0.02), rotation)
    target["qvec"] = _rot_to_quat(turned)
    target["tvec"] = tuple(-value for value in _matvec(turned, centre))

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path / "run", engine_kwargs={"seed_rows": rows})
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "orientations drifted from the submitted poses" in str(raised.value)


def test_a_renamed_seed_image_is_refused(tmp_path):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    probe = _materialize(bundle, scratch, _deadline())
    rows = [dict(row) for row in _seed_rows(probe.frames)]
    probe.cleanup()
    rows[0]["name"] = "frame_009999.ppm"

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path / "run", engine_kwargs={"seed_rows": rows})
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "image names disagree with the submitted frames" in str(raised.value)


def test_the_anchor_refuses_a_frame_count_outside_the_reviewed_band():
    snapshot = _snapshot_from_rows(
        [
            {
                "image_id": index + 1,
                "camera_id": index + 1,
                "name": f"frame_{index:06d}.ppm",
                "qvec": (1.0, 0.0, 0.0, 0.0),
                "tvec": (float(index), 0.0, 0.0),
            }
            for index in range(2)
        ],
        "seed",
    )

    class _Frame:
        def __init__(self, name, pose):
            self.engine_name = name
            self.frame = pose

    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(snapshot, (), deadline=_deadline())
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "inside the reviewed packet band" in str(raised.value)
    del _Frame


def test_the_anchor_requires_the_carried_deadline():
    snapshot = _snapshot_from_rows(
        [
            {
                "image_id": 1,
                "camera_id": 1,
                "name": "frame_000000.ppm",
                "qvec": (1.0, 0.0, 0.0, 0.0),
                "tvec": (0.0, 0.0, 0.0),
            }
        ],
        "seed",
    )
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(snapshot, (), deadline=None)
    assert "requires the carried refine deadline" in str(raised.value)


# ===========================================================================
# What the parent refuses about the child's report
# ===========================================================================
def test_an_artifact_digest_the_parent_did_not_compute_is_refused(tmp_path):
    def _lie(declared):
        mutated = {token: dict(row) for token, row in declared.items()}
        mutated["database-v1.db"]["sha256"] = "0" * 64
        return mutated

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, engine_kwargs={"digest_mutation": _lie})
    assert "disagrees with the parent's own hash" in str(raised.value)


def test_bit_identical_before_and_after_evidence_is_refused(tmp_path):
    unchanged = {
        "reprojectionRmsePxBefore": 1.90,
        "reprojectionRmsePxAfter": 1.90,
        "loopRotationRmseDegBefore": 0.62,
        "loopRotationRmseDegAfter": 0.62,
        "loopTranslationDirectionRmseDegBefore": 1.44,
        "loopTranslationDirectionRmseDegAfter": 1.44,
    }
    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, engine_kwargs={"evidence": unchanged})
    assert "measured one snapshot twice rather than refining anything" in str(
        raised.value
    )


def test_evidence_that_moved_but_not_enough_is_refused_by_the_runner(tmp_path):
    """The floor is the runner's, not this module's, and it still fires."""

    from patina_scan_worker.refine_runner import RefineFailureCode, RefineRunError

    barely = {
        "reprojectionRmsePxBefore": 1.9000000,
        "reprojectionRmsePxAfter": 1.8999999,
        "loopRotationRmseDegBefore": 0.6200000,
        "loopRotationRmseDegAfter": 0.6199999,
        "loopTranslationDirectionRmseDegBefore": 1.4400000,
        "loopTranslationDirectionRmseDegAfter": 1.4399999,
    }
    with pytest.raises(RefineRunError) as raised:
        _run(tmp_path, engine_kwargs={"evidence": barely})
    assert raised.value.code is RefineFailureCode.NO_MEASURABLE_IMPROVEMENT


def test_a_regressed_reprojection_is_refused_by_the_runner(tmp_path):
    from patina_scan_worker.refine_runner import RefineFailureCode, RefineRunError

    worse = dict(_GOOD_EVIDENCE)
    worse["reprojectionRmsePxAfter"] = 2.5
    with pytest.raises(RefineRunError) as raised:
        _run(tmp_path, engine_kwargs={"evidence": worse})
    assert raised.value.code is RefineFailureCode.EVIDENCE_REGRESSION


def test_an_evidence_refusal_carries_the_numbers_that_produced_it(tmp_path):
    """The comparable metrics travel WITH the refusal, not only in a log.

    This exists because a mutation sweep deleted them and nothing went red.
    They matter because the evidence is destroyed with the child's lease
    moments later: R121's first real engine run was refused by this line and
    the operator could not tell WHICH metric regressed or by how much.  The
    assertions below name the metric that actually moved and the one that did
    not, so a refusal that reported only the verdict reddens here.
    """

    from patina_scan_worker.refine_runner import RefineRunError

    worse = dict(_GOOD_EVIDENCE)
    worse["loopRotationRmseDegBefore"] = 4.915408
    worse["loopRotationRmseDegAfter"] = 4.930533
    with pytest.raises(RefineRunError) as raised:
        _run(tmp_path, engine_kwargs={"evidence": worse})
    message = str(raised.value)
    assert "comparable_geometric_evidence_regressed" in message
    # The metric that regressed, with both sides of it.
    assert "loop_rotation_rmse_deg 4.915408->4.930533" in message
    # ... and the one that improved, so a reader can see it was not the cause.
    assert "reprojection_rmse_px" in message
    assert "coverage" in message
    assert "loop_edges" in message


@pytest.mark.parametrize(
    ("mutation", "message"),
    (
        (lambda r: {**r, "contract": "wrong"}, "wrong contract"),
        (lambda r: {**r, "schemaVersion": 2}, "wrong schema version"),
        (
            lambda r: {**r, "alignment": {**r["alignment"], "scale": "big"}},
            "scale must be a finite number",
        ),
        (
            lambda r: {
                **r,
                "alignment": {**r["alignment"], "rawPoseDigestSha256": "nope"},
            },
            "rawPoseDigestSha256 must be a lowercase sha256",
        ),
        (
            lambda r: {**r, "outputs": {k: v for k, v in list(r["outputs"].items())[:3]}},
            "closed output token set",
        ),
        (
            lambda r: {**r, "cliVersion": ""},
            "cliVersion must be a non-empty string",
        ),
        (
            lambda r: {
                **r,
                "telemetry": {**r["telemetry"], "metrics": {"bad": [1, 2]}},
            },
            "telemetry metric is not a JSON scalar",
        ),
    ),
)
def test_a_malformed_engine_report_is_refused_field_by_field(mutation, message):
    base = {
        "schemaVersion": ENGINE_REPORT_SCHEMA_VERSION,
        "contract": ENGINE_REPORT_CONTRACT,
        "cliVersion": "4.0.2",
        "bindingVersion": "4.0.2",
        "selectedEngine": "colmap-4-known-pose-triangulate-ba",
        "alignment": {
            "scale": 1.0,
            "rotation": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            "translationMeters": [0.0, 0.0, 0.0],
            "rawPoseDigestSha256": "a" * 64,
            "alignedPoseDigestSha256": "b" * 64,
        },
        "evidence": {
            "inputImages": 12,
            "registeredImagesBefore": 12,
            "registeredImagesAfter": 12,
            "commonObservations": 100,
            "commonObservationSetSha256": "1" * 64,
            "verifiedLoopEdges": 3,
            "verifiedLoopSetSha256": "2" * 64,
            **_GOOD_EVIDENCE,
        },
        "telemetry": {
            "durationMs": 1,
            "iterations": 1,
            "vramPeakMb": 1,
            "commandCount": 1,
            "metrics": {},
        },
        "outputs": {
            token: {"sha256": "c" * 64, "sizeBytes": 1}
            for token in NATIVE_ENGINE_OUTPUT_TOKENS
        },
    }
    assert parse_engine_report(base).cli_version == "4.0.2"
    with pytest.raises(AdapterError) as raised:
        parse_engine_report(mutation(base))
    assert message in str(raised.value)


# ===========================================================================
# The deadline, carried
# ===========================================================================
def test_an_exhausted_deadline_stops_the_run_before_the_engine(tmp_path):
    expired = RefineDeadline(time.monotonic() - 1.0)
    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, deadline=expired)
    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"


def test_a_deadline_that_expires_during_the_engine_call_stops_publication(tmp_path):
    """A real expiry, produced by a real clock, not by a patched syscall."""

    from patina_scan_worker.refine_runner import RefineFailureCode, RefineRunError

    carried = RefineDeadline(time.monotonic() + 0.60)

    class _SlowEngine(_RecordedEngine):
        def __call__(self, *args, **kwargs):
            result = super().__call__(*args, **kwargs)
            while kwargs["deadline"].expires_at_monotonic_s > time.monotonic():
                time.sleep(0.02)
            return result

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700)
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")
    bundle = _Bundle(bundle_root)
    probe = _materialize(bundle, scratch, _deadline())
    frames = probe.frames
    probe.cleanup()
    engine = _SlowEngine(tmp_path / "engine-outputs", frames)
    sink = LocalScratchStorageSink(publish)
    try:
        with pytest.raises((AdapterError, RefineRunError)) as raised:
            run_refine_lifecycle(
                RefineLifecycleRequest(
                    user_id=USER_ID,
                    scan_id=SCAN_ID,
                    task_id=TASK_ID,
                    lease_id=LEASE_ID,
                    room_file_id=ROOM_FILE_ID,
                    room_file_version=1,
                    scratch_root=scratch,
                    manifest=bundle.manifest,
                    keyframe_index=bundle.index,
                    keyframe_summary=bundle.summary,
                    keyframes_archive=bundle.archive,
                ),
                acquirer=LocalScratchArtifactAcquirer(bundle_root),
                raster_materializer=_PrematerializedRaster(),
                storage=sink,
                deadline=carried,
                native_engine_call=engine,
                toolchain_manifest_path=str(manifest),
            )
    finally:
        engine.close()
    codes = {
        getattr(raised.value, "code", None),
        getattr(getattr(raised.value, "code", None), "value", None),
    }
    assert "REFINE_ENGINE_TIMEOUT" in codes
    assert sink.published == {}
    assert list(scratch.iterdir()) == []


# ===========================================================================
# Descriptor lifetimes
# ===========================================================================
def test_no_descriptor_this_run_opened_survives_it(tmp_path):
    """Compare the process's own open-descriptor count before and after."""

    def _open_count() -> int:
        return len(os.listdir(f"/proc/self/fd")) if os.path.isdir("/proc/self/fd") else (
            len(os.listdir(f"/dev/fd"))
        )

    before = _open_count()
    _report, engine, _sink, _scratch = _run(tmp_path)
    engine.close()
    after = _open_count()
    # The recorded engine's own seven handles are closed above; everything else
    # the lifecycle opened -- the two pinned packet files, both descriptors per
    # frame, the publisher's spool -- is closed by the lifecycle itself.
    assert after <= before + 1


def test_the_publisher_reads_the_parent_owned_descriptors(tmp_path):
    """Published bytes equal the parent's own hashes, artifact by artifact."""

    _report, engine, sink, _scratch = _run(tmp_path)
    for key, (digest, size) in sink.published.items():
        path = sink.root / Path(*key.split("/"))
        payload = path.read_bytes()
        assert len(payload) == size
        assert _sha256(payload) == digest


# ===========================================================================
# The P1 certificate
# ===========================================================================
def test_the_p1_certificate_is_the_published_one():
    assert P1_CERTIFICATE_95266BE1.scan_id == "95266be1"
    assert P1_CERTIFICATE_95266BE1.sim3_scale == 0.9828
    assert P1_CERTIFICATE_95266BE1.anchor_rms_m == 0.1336
    assert P1_CERTIFICATE_95266BE1.measured_anchor_count == 24
    assert P1_CERTIFICATE_95266BE1.anchor_tolerance_fraction == 0.11
    assert P1_CERTIFICATE_95266BE1.short_anchors_flagged == 3


def test_exactly_one_p1_row_is_comparable_and_it_is_the_scale(tmp_path):
    report, _engine, _sink, _scratch = _run(tmp_path)
    rows = compare_against_p1_certificate(report.result, P1_CERTIFICATE_95266BE1)
    comparable = [row.quantity for row in rows if row.comparable]
    assert comparable == ["sim3_scale"]
    by_quantity = {row.quantity: row for row in rows}
    assert by_quantity["sim3_scale"].p1_value == 0.9828
    assert by_quantity["sim3_scale"].refine_value == report.result.alignment.scale
    assert "NOT the same transform" in by_quantity["sim3_scale"].note
    assert by_quantity["anchor_rms_m"].refine_value is None
    assert "measured no tape anchors" in by_quantity["anchor_rms_m"].note
    assert (
        "DIAGNOSTIC ONLY"
        in by_quantity["trajectory_shape_change_pct"].note
    )


def test_the_comparison_table_lists_every_expected_quantity(tmp_path):
    """Written out literally rather than read off the module."""

    report, _engine, _sink, _scratch = _run(tmp_path)
    rows = compare_against_p1_certificate(report.result, P1_CERTIFICATE_95266BE1)
    assert [row.quantity for row in rows] == [
        "sim3_scale",
        "anchor_rms_m",
        "measured_anchor_count",
        "short_anchors_flagged",
        "reprojection_rmse_px_before_after",
        "registration_coverage_before_after",
        "trajectory_shape_change_pct",
    ]


def test_no_absolute_accuracy_is_ever_certified(tmp_path):
    report, _engine, _sink, _scratch = _run(tmp_path)
    assert report.result.evidence_verdict.absolute_accuracy_certified is False
    document = report.to_document()
    assert document["evidence"]["absoluteAccuracyCertified"] is False


# ===========================================================================
# The packet the parent builds
# ===========================================================================
def test_the_packet_refuses_a_frame_count_below_the_reviewed_floor(tmp_path):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    trimmed = replace(materialization, frames=materialization.frames[:2])
    try:
        with pytest.raises(AdapterError) as raised:
            build_colmap_packet(
                trimmed,
                destination=scratch / "packet",
                gpu_index="0",
                run_id="a" * 64,
                deadline=_deadline(),
            )
        assert "outside the reviewed 3-400 band" in str(raised.value)
    finally:
        materialization.cleanup()


def test_the_packet_refuses_a_non_canonical_gpu_index(tmp_path):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        with pytest.raises(AdapterError) as raised:
            build_colmap_packet(
                materialization,
                destination=scratch / "packet",
                gpu_index="01",
                run_id="a" * 64,
                deadline=_deadline(),
            )
        assert "canonical non-negative integer string" in str(raised.value)
    finally:
        materialization.cleanup()


def test_the_packet_members_carry_the_materializers_own_digests(tmp_path):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        packet = build_colmap_packet(
            materialization,
            destination=scratch / "packet",
            gpu_index="0",
            run_id="a" * 64,
            deadline=_deadline(),
        )
        document = json.loads(packet.manifest_path.read_bytes())
        by_path = {row["relativePath"]: row for row in document["members"]}
        for frame in materialization.frames:
            row = by_path[f"images/{frame.engine_name}"]
            assert row["sha256"] == frame.engine_sha256
            assert row["sizeBytes"] == frame.engine_size_bytes
            assert row["role"] == "engine-image"
        assert [row["sha256"] for row in document["chunks"]] == list(
            packet.chunk_sha256s
        )
        assert _sha256(packet.manifest_path.read_bytes()) == packet.manifest_sha256
        # Every chunk really is a readable USTAR archive, and between them they
        # carry exactly the declared members once each.
        names = []
        for chunk_path in packet.chunk_paths:
            with tarfile.open(chunk_path, mode="r:") as archive:
                names.extend(member.name for member in archive.getmembers())
        assert sorted(names) == sorted(
            [
                "adapter-ledger-v1.json",
                "engine-request-v1.json",
                "source-ledger-v1.json",
            ]
            + [f"images/{frame.engine_name}" for frame in materialization.frames]
        )
        # The ordered member ledger is what the frozen child validates, and it
        # requires ``(chunkToken, archiveMember)`` to be sorted.  Adding two
        # ledgers whose names straddle ``images/`` is exactly the change that
        # could break it, so it is asserted rather than assumed.
        order = [(row["chunkToken"], row["archiveMember"]) for row in document["members"]]
        assert order == sorted(order)
        assert document["requestMember"] == "engine-request-v1.json"
        assert by_path["engine-request-v1.json"]["sha256"] == packet.engine_request_sha256
    finally:
        materialization.cleanup()


def test_the_packet_writers_headers_are_exactly_what_the_child_parses():
    """The two USTAR implementations, compared to each other for the first time.

    They never were.  The parent's tests read its archives back with ``tarfile``
    -- which accepts any mode -- and the extractor's tests hand-build headers at
    0600, so the writer emitted 0644 for its entire life and the mismatch was
    invisible until a real run extracted a real packet inside the child and was
    refused with "member metadata is not canonical".

    This asserts the tie directly: every header the WRITER produces is fed to
    the CHILD's parser, and the parser's own name/size round-trip is checked.  A
    reversal of the fix reddens here rather than 40 minutes into a host run.
    """

    from patina_scan_worker.refine_lifecycle import _ustar_header
    from patina_scan_worker.refine_packet_extractor import _parse_ustar_header

    for name, size in (
        ("engine-request-v1.json", 1),
        ("adapter-ledger-v1.json", 137),
        ("source-ledger-v1.json", 4096),
        ("images/frame_000000.ppm", 8_294_417),
        ("images/frame_000399.ppm", 8_294_417),
    ):
        header = _ustar_header(name, size)
        assert len(header) == 512
        assert _parse_ustar_header(header) == (name, size)


def test_the_packet_ledgers_carry_the_source_and_adapter_provenance(tmp_path):
    """The two ledgers exist so evidence can name where the rasters came from.

    Nothing else in the packet records it: the engine request describes the
    ENGINE images, and the child never sees a capture archive.  Without these
    members ``refine_evidence_builder`` cannot be fed at all, which is why the
    packet writer emits them and why the assertions below compare against the
    materializer's own rows rather than against literals.
    """

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        packet = build_colmap_packet(
            materialization,
            destination=scratch / "packet",
            gpu_index="0",
            run_id="b" * 64,
            deadline=_deadline(),
        )
        payloads: dict[str, bytes] = {}
        for chunk_path in packet.chunk_paths:
            with tarfile.open(chunk_path, mode="r:") as archive:
                for member in archive.getmembers():
                    if member.name.endswith("-ledger-v1.json"):
                        extracted = archive.extractfile(member)
                        assert extracted is not None
                        payloads[member.name] = extracted.read()

        adapter = json.loads(payloads["adapter-ledger-v1.json"])
        assert adapter["contract"] == "patina-refine-colmap-adapter-ledger-v1"
        assert adapter["runId"] == "b" * 64
        assert adapter["materializerId"] == materialization.frames[0].materializer_id

        source = json.loads(payloads["source-ledger-v1.json"])
        assert source["contract"] == "patina-refine-colmap-source-ledger-v1"
        assert source["runId"] == "b" * 64
        assert [row["ordinal"] for row in source["frames"]] == list(
            range(len(materialization.frames))
        )
        for row, frame in zip(source["frames"], materialization.frames, strict=True):
            assert row["sourceArchiveKey"] == frame.source_archive_key
            assert row["sourceMember"] == frame.source_member
            assert row["sourceImageName"] == frame.source_member.rsplit("/", 1)[-1]
            assert row["sourceSha256"] == frame.source_sha256
            assert row["sourceSizeBytes"] == frame.source_size_bytes

        # The manifest declares them at the two exact packet-root paths the
        # extractor's role validation requires; anywhere else is refused.
        document = json.loads(packet.manifest_path.read_bytes())
        roles = {row["role"]: row["relativePath"] for row in document["members"]}
        assert roles["adapter-ledger"] == "adapter-ledger-v1.json"
        assert roles["source-ledger"] == "source-ledger-v1.json"
    finally:
        materialization.cleanup()


def test_a_packet_whose_frames_disagree_on_the_raster_adapter_is_refused(tmp_path):
    """Constructed, not asserted: two adapters in one run has no "the" adapter."""

    import dataclasses

    from patina_scan_worker.refine_lifecycle import _single_materializer_id

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        frames = materialization.frames
        assert _single_materializer_id(frames) == frames[0].materializer_id
        mixed = (
            dataclasses.replace(frames[0], materializer_id="other-adapter-1x1"),
            *frames[1:],
        )
        with pytest.raises(AdapterError) as raised:
            _single_materializer_id(mixed)
        assert "more than one adapter identity" in str(raised.value)
    finally:
        materialization.cleanup()


# ===========================================================================
# The local sinks cannot reach anything remote
# ===========================================================================
def test_the_local_storage_sink_holds_no_session_or_service_key(tmp_path):
    root = tmp_path / "publish"
    root.mkdir()
    sink = LocalScratchStorageSink(root)
    assert not hasattr(sink, "_s")
    assert not hasattr(sink, "_cfg")


def test_the_local_acquirer_refuses_a_key_owned_by_somebody_else(tmp_path):
    root = tmp_path / "bundle"
    root.mkdir()
    acquirer = LocalScratchArtifactAcquirer(root)
    with pytest.raises(AdapterError) as raised:
        acquirer.acquire(
            source=RefineSourceArtifact(
                object_key="keyframes/someone-else/scan-1/keyframe_index.ndjson",
                sha256="a" * 64,
                size_bytes=1,
            ),
            user_id=USER_ID,
            scan_id=SCAN_ID,
            destination=None,
            deadline=_deadline(),
        )
    assert "not owner scoped" in str(raised.value)


def test_the_local_sink_refuses_a_key_owned_by_somebody_else(tmp_path):
    root = tmp_path / "publish"
    root.mkdir()
    sink = LocalScratchStorageSink(root)
    with pytest.raises(AdapterError) as raised:
        sink.publish_immutable_descriptor(
            "room_file/someone-else/scan-1/v1/refine/x.json",
            0,
            "application/octet-stream",
            expected_sha256="a" * 64,
            expected_size=1,
            user_id=USER_ID,
            scan_id=SCAN_ID,
            deadline=_deadline(),
        )
    assert "not owner scoped" in str(raised.value)


# ===========================================================================
# Clauses the composed door cannot reach, exercised directly.
#
# Every test below exists because a mutation sweep deleted the clause it covers
# and NOTHING went red.  A clause no deletion can redden is a hole, so each one
# is now reached through the smallest public surface that can reach it.
# ===========================================================================
class _StandInFrame:
    """The two attributes :func:`anchor_seed_snapshot_to_request` reads."""

    def __init__(self, engine_name: str, pose) -> None:
        self.engine_name = engine_name
        self.frame = pose


class _StandInPose:
    def __init__(self, colmap_pose) -> None:
        self.colmap_pose = colmap_pose


def _stand_in_frames(rows):
    from patina_scan_worker.refine_adapter import ColmapPose

    frames = []
    for row in rows:
        rotation = _quat_to_rot(row["qvec"])
        frames.append(
            _StandInFrame(
                str(row["name"]),
                _StandInPose(
                    ColmapPose(
                        rotation=rotation,
                        translation=tuple(float(v) for v in row["tvec"]),
                        qvec=tuple(float(v) for v in row["qvec"]),
                    )
                ),
            )
        )
    return tuple(frames)


def _anchor_rows(count: int = 12, *, offset=(0.0, 0.0, 0.0), turn: float = 0.0):
    """A three-dimensional, well-conditioned pose set with an optional defect."""

    rows = []
    for index in range(count):
        angle = index * (2.0 * math.pi / max(count, 1))
        centre = (
            1.5 * math.cos(angle) + (offset[0] if index == 3 else 0.0),
            1.5 * math.sin(angle) + (offset[1] if index == 3 else 0.0),
            0.35 * index + (offset[2] if index == 3 else 0.0),
        )
        rotation = _axis_rotation((0.0, 0.0, 1.0), turn if index == 5 else 0.0)
        translation = tuple(-value for value in _matvec(rotation, centre))
        rows.append(
            {
                "image_id": index + 1,
                "camera_id": index + 1,
                "name": f"frame_{index:06d}.ppm",
                "qvec": _rot_to_quat(rotation),
                "tvec": translation,
            }
        )
    return rows


def test_the_anchor_refuses_a_duplicate_engine_image_name():
    rows = _anchor_rows()
    frames = list(_stand_in_frames(rows))
    frames[1] = _StandInFrame(frames[0].engine_name, frames[1].frame)
    snapshot = _snapshot_from_rows(rows, "seed")
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(snapshot, tuple(frames), deadline=_deadline())
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "duplicate engine image name" in str(raised.value)


def test_the_anchor_refuses_a_snapshot_of_the_wrong_type():
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(
            {"poses": []},
            _stand_in_frames(_anchor_rows()),
            deadline=_deadline(),
        )
    assert "requires an exact SparseModelSnapshot" in str(raised.value)


@pytest.mark.parametrize(
    ("kwargs", "label"),
    (
        ({"max_center_drift_m": 0.0}, "centre"),
        ({"max_center_drift_m": float("nan")}, "centre"),
        ({"max_center_drift_m": True}, "centre"),
        ({"max_rotation_drift_rad": -1.0}, "rotation"),
        ({"max_rotation_drift_rad": float("inf")}, "rotation"),
    ),
)
def test_the_anchor_refuses_a_nonsense_tolerance(kwargs, label):
    rows = _anchor_rows()
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(
            _snapshot_from_rows(rows, "seed"),
            _stand_in_frames(rows),
            deadline=_deadline(),
            **kwargs,
        )
    assert f"seed anchoring {label} tolerance must be finite positive" in str(
        raised.value
    )


@pytest.mark.parametrize("factor", (0.5, 0.99))
def test_a_centre_drift_just_inside_the_tolerance_is_accepted(factor):
    """The tolerance is tested from BOTH sides, so it cannot be quietly widened."""

    drift = SEED_ANCHOR_MAX_CENTER_DRIFT_M * factor
    rows = _anchor_rows()
    moved = _anchor_rows(offset=(drift, 0.0, 0.0))
    verification = anchor_seed_snapshot_to_request(
        _snapshot_from_rows(moved, "seed"),
        _stand_in_frames(rows),
        deadline=_deadline(),
    )
    assert verification.max_center_drift_m == pytest.approx(drift, rel=1e-6)


@pytest.mark.parametrize("factor", (1.01, 2.0))
def test_a_centre_drift_just_outside_the_tolerance_is_refused(factor):
    drift = SEED_ANCHOR_MAX_CENTER_DRIFT_M * factor
    rows = _anchor_rows()
    moved = _anchor_rows(offset=(drift, 0.0, 0.0))
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(
            _snapshot_from_rows(moved, "seed"),
            _stand_in_frames(rows),
            deadline=_deadline(),
        )
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "camera centres drifted" in str(raised.value)


@pytest.mark.parametrize("factor", (0.5, 0.99))
def test_a_rotation_drift_just_inside_the_tolerance_is_accepted(factor):
    turn = SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD * factor
    rows = _anchor_rows()
    turned = _anchor_rows(turn=turn)
    verification = anchor_seed_snapshot_to_request(
        _snapshot_from_rows(turned, "seed"),
        _stand_in_frames(rows),
        deadline=_deadline(),
    )
    assert verification.max_rotation_drift_rad == pytest.approx(turn, rel=1e-4)
    # The centres are unchanged by construction, so the centre clause cannot be
    # what accepted or refused this case.
    assert verification.max_center_drift_m < SEED_ANCHOR_MAX_CENTER_DRIFT_M * 1e-3


@pytest.mark.parametrize("factor", (1.01, 2.0))
def test_a_rotation_drift_just_outside_the_tolerance_is_refused(factor):
    turn = SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD * factor
    rows = _anchor_rows()
    turned = _anchor_rows(turn=turn)
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(
            _snapshot_from_rows(turned, "seed"),
            _stand_in_frames(rows),
            deadline=_deadline(),
        )
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "orientations drifted" in str(raised.value)


#: The per-element orthonormality defect MEASURED on scan ``004aa5b0``'s own
#: 49 ``cam_from_world`` matrices, worst case.  They are floats that came off
#: ARKit through a conversion; they are not exact rotations, and nothing on the
#: path ever claimed they were.
_DEVICE_ORTHONORMALITY_DEFECT = 3.3e-7


def _slightly_non_orthonormal(rotation, defect=_DEVICE_ORTHONORMALITY_DEFECT):
    """Shrink one row, which is the direction that actually bites.

    The sign matters and the first draft of this helper had it backwards.
    LENGTHENING a row raises ``tr(A B^T)`` above 3, the cosine clamps at 1 and
    the stale metric reports 0 -- it hides the defect instead of amplifying it.
    SHORTENING one lowers the trace to ``3 - defect``, giving
    ``acos(1 - defect/2) ~ sqrt(defect)``, which is the ``5.7e-4`` rad this
    fixture produces from ``3.3e-7`` and the same order as the ``4.899e-4``
    measured on the real capture.
    """

    return (
        tuple(value * (1.0 - defect) for value in rotation[0]),
        rotation[1],
        rotation[2],
    )


def _rows_with_reference_defect(rows):
    """Give the SUBMITTED poses a device-sized defect; the snapshot keeps none."""

    from patina_scan_worker.refine_adapter import ColmapPose

    frames = []
    for row in rows:
        exact = _quat_to_rot(row["qvec"])
        frames.append(
            _StandInFrame(
                str(row["name"]),
                _StandInPose(
                    ColmapPose(
                        rotation=_slightly_non_orthonormal(exact),
                        translation=tuple(float(v) for v in row["tvec"]),
                        qvec=tuple(float(v) for v in row["qvec"]),
                    )
                ),
            )
        )
    return tuple(frames)


def test_the_anchor_measures_rotation_and_not_the_references_own_defect():
    """CONSTRUCTED: the exact case that made this clause unreachable on hardware.

    The submitted matrices carry a device-sized ``3.3e-7`` orthonormality
    defect and the snapshot is the EXACT rotation they encode -- a child that
    moved nothing at all.  Before R121 that combination measured ``~5e-4`` rad
    of "drift" and was refused, because ``acos(1 - x) ~ sqrt(2x)`` turns the
    reference's own representation error into an angle five hundred times the
    ``1e-6`` tolerance.  No child could pass it.

    The tolerance is UNCHANGED.  What is asserted here is that the number the
    clause produces is now a rotation difference: the old quantity is computed
    inline and shown to be far outside the tolerance, the new one far inside,
    on the identical inputs.
    """

    from patina_scan_worker.refine_lifecycle import (
        _geodesic_angle_rad,
        _quaternion_to_rotation,
    )

    rows = _anchor_rows()
    frames = _rows_with_reference_defect(rows)
    snapshot = _snapshot_from_rows(rows, "seed")

    # The QUANTITY THE CLAUSE USED TO MEASURE, on these very inputs.
    stale = max(
        _geodesic_angle_rad(
            _quaternion_to_rotation(pose.qvec),
            frame.frame.colmap_pose.rotation,
        )
        for pose, frame in zip(snapshot.poses, frames, strict=True)
    )
    assert stale > SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD * 100

    # ... and what it measures now.
    verification = anchor_seed_snapshot_to_request(
        snapshot,
        frames,
        deadline=_deadline(),
    )
    assert verification.max_rotation_drift_rad < SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD / 100


@pytest.mark.parametrize("factor", (1.5, 10.0))
def test_a_real_rotation_is_still_caught_against_a_defective_reference(factor):
    """The converse: the fix must not have made the clause blind.

    Same defective reference, but now the snapshot really IS turned, by a
    multiple of the tolerance.  If projecting the reference had swallowed real
    rotation this would pass, and it must not.
    """

    turn = SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD * factor
    rows = _anchor_rows()
    turned = _anchor_rows(turn=turn)
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(
            _snapshot_from_rows(turned, "seed"),
            _rows_with_reference_defect(rows),
            deadline=_deadline(),
        )
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "orientations drifted" in str(raised.value)
    # The refusal carries both margins, so an operator can tell a real rotation
    # from float noise without re-running anything.
    assert "max rotation" in str(raised.value)
    assert "max centre" in str(raised.value)


def test_the_projection_is_a_projection_and_not_a_normalisation_of_scale():
    """``_nearest_rotation`` must return SO(3), including near a half turn.

    The ARKit-to-COLMAP basis change is a half turn, so these matrices live
    exactly where the naive ``sqrt(1 + trace)`` branch loses every digit.  The
    branch-selected form is asserted on that case specifically, not only on a
    generic rotation.
    """

    from patina_scan_worker.refine_lifecycle import _nearest_rotation

    for quaternion in (
        (1.0, 0.0, 0.0, 0.0),
        (0.0, 1.0, 0.0, 0.0),
        (0.0, 0.0, 1.0, 0.0),
        (0.0, 0.0, 0.0, 1.0),
        (0.5, 0.5, 0.5, 0.5),
    ):
        exact = _quat_to_rot(quaternion)
        projected = _nearest_rotation(_slightly_non_orthonormal(exact, 1e-5))
        identity = _matmul(projected, _transpose(projected))
        deviation = max(
            abs(identity[row][col] - (1.0 if row == col else 0.0))
            for row in range(3)
            for col in range(3)
        )
        assert deviation < 1e-12, quaternion
        # ... and it is the NEAREST rotation, not some other one: it stays
        # within the defect it was asked to remove.
        gap = max(
            abs(projected[row][col] - exact[row][col])
            for row in range(3)
            for col in range(3)
        )
        assert gap < 1e-4, quaternion


def test_the_parent_checkpoints_its_own_loops_on_a_pinned_stride():
    """The STRIDE is the falsifiable part; a call-site count is not."""

    calls: list[int] = []

    class _Counting(RefineDeadline):
        def remaining_seconds(self, *, now_monotonic_s=None):
            calls.append(1)
            return 60.0

    counting = _Counting(time.monotonic() + 60.0)
    for index in range(100):
        refine_lifecycle._checkpoint(counting, index)
    assert refine_lifecycle.DEADLINE_CHECK_INTERVAL == 32
    # Indices 0, 32, 64 and 96 -- written out rather than derived.
    assert len(calls) == 4


def test_the_artifact_binding_refuses_a_partial_token_set():
    from patina_scan_worker.refine_lifecycle import _require_parent_hashed_artifacts

    report = parse_engine_report(_BASE_REPORT())
    with pytest.raises(AdapterError) as raised:
        _require_parent_hashed_artifacts(report, {})
    assert "did not return the closed output token set" in str(raised.value)


def test_the_packet_refuses_a_run_id_that_is_not_a_digest(tmp_path):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        with pytest.raises(AdapterError) as raised:
            build_colmap_packet(
                materialization,
                destination=scratch / "packet",
                gpu_index="0",
                run_id="not-a-digest",
                deadline=_deadline(),
            )
        assert "run id must be a lowercase sha256" in str(raised.value)
    finally:
        materialization.cleanup()


def test_the_packet_refuses_an_engine_image_name_off_the_canonical_form(tmp_path):
    from dataclasses import replace as _replace

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        renamed = _replace(
            materialization,
            frames=(
                _replace(materialization.frames[0], engine_name="frame_0.ppm"),
                *materialization.frames[1:],
            ),
        )
        with pytest.raises(AdapterError) as raised:
            build_colmap_packet(
                renamed,
                destination=scratch / "packet",
                gpu_index="0",
                run_id="a" * 64,
                deadline=_deadline(),
            )
        assert "not the canonical frame form" in str(raised.value)
    finally:
        materialization.cleanup()


def test_the_exact_copy_refuses_a_source_that_ends_early():
    from patina_scan_worker.refine_lifecycle import copy_exact

    sink = io.BytesIO()
    with pytest.raises(AdapterError) as raised:
        copy_exact(io.BytesIO(b"short"), sink, size_bytes=64, deadline=_deadline())
    assert "ended before its declared size" in str(raised.value)


def test_the_exact_copy_refuses_a_source_that_overruns():
    from patina_scan_worker.refine_lifecycle import copy_exact

    class _Overrunning:
        def read(self, size):
            return b"x" * (size + 1)

    with pytest.raises(AdapterError) as raised:
        copy_exact(_Overrunning(), io.BytesIO(), size_bytes=8, deadline=_deadline())
    assert "ran past its declared size" in str(raised.value)


def test_the_exact_copy_refuses_a_nonsense_byte_count():
    from patina_scan_worker.refine_lifecycle import copy_exact

    with pytest.raises(AdapterError) as raised:
        copy_exact(io.BytesIO(b""), io.BytesIO(), size_bytes=0, deadline=_deadline())
    assert "needs a positive byte count" in str(raised.value)


def _BASE_REPORT():
    return {
        "schemaVersion": ENGINE_REPORT_SCHEMA_VERSION,
        "contract": ENGINE_REPORT_CONTRACT,
        "cliVersion": "4.0.2",
        "bindingVersion": "4.0.2",
        "selectedEngine": "colmap-4-known-pose-triangulate-ba",
        "alignment": {
            "scale": 1.0,
            "rotation": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            "translationMeters": [0.0, 0.0, 0.0],
            "rawPoseDigestSha256": "a" * 64,
            "alignedPoseDigestSha256": "b" * 64,
        },
        "evidence": {
            "inputImages": 12,
            "registeredImagesBefore": 12,
            "registeredImagesAfter": 12,
            "commonObservations": 100,
            "commonObservationSetSha256": "1" * 64,
            "verifiedLoopEdges": 3,
            "verifiedLoopSetSha256": "2" * 64,
            **_GOOD_EVIDENCE,
        },
        "telemetry": {
            "durationMs": 1,
            "iterations": 1,
            "vramPeakMb": 1,
            "commandCount": 1,
            "metrics": {},
        },
        "outputs": {
            token: {"sha256": "c" * 64, "sizeBytes": 1}
            for token in NATIVE_ENGINE_OUTPUT_TOKENS
        },
    }


@pytest.mark.parametrize("value", (float("inf"), float("nan"), -0.5))
def test_a_non_finite_or_negative_evidence_metric_is_refused(value):
    document = _BASE_REPORT()
    document["evidence"]["reprojectionRmsePxBefore"] = value
    with pytest.raises(AdapterError) as raised:
        parse_engine_report(document)
    assert "reprojectionRmsePxBefore must be a finite number >= 0.0" in str(raised.value)


def test_the_local_sink_refuses_bytes_whose_digest_disagrees(tmp_path):
    root = tmp_path / "publish"
    root.mkdir()
    payload = b"twelve bytes"
    source = tmp_path / "source.bin"
    source.write_bytes(payload)
    descriptor = os.open(source, os.O_RDONLY)
    try:
        sink = LocalScratchStorageSink(root)
        with pytest.raises(AdapterError) as raised:
            sink.publish_immutable_descriptor(
                f"room_file/{USER_ID}/{SCAN_ID}/v1/refine/x.json",
                descriptor,
                "application/octet-stream",
                expected_sha256="0" * 64,
                expected_size=len(payload),
                user_id=USER_ID,
                scan_id=SCAN_ID,
                deadline=_deadline(),
            )
        assert "digest mismatch" in str(raised.value)
        assert sink.published == {}
    finally:
        os.close(descriptor)


def test_the_local_sink_refuses_a_descriptor_that_is_not_the_measured_inode(tmp_path):
    root = tmp_path / "publish"
    root.mkdir()
    payload = b"twelve bytes"
    source = tmp_path / "source.bin"
    source.write_bytes(payload)
    descriptor = os.open(source, os.O_RDONLY)
    try:
        sink = LocalScratchStorageSink(root)
        with pytest.raises(AdapterError) as raised:
            sink.publish_immutable_descriptor(
                f"room_file/{USER_ID}/{SCAN_ID}/v1/refine/x.json",
                descriptor,
                "application/octet-stream",
                expected_sha256=_sha256(payload),
                expected_size=len(payload),
                user_id=USER_ID,
                scan_id=SCAN_ID,
                expected_identity=(0, 0),
                deadline=_deadline(),
            )
        assert "descriptor changed identity" in str(raised.value)
    finally:
        os.close(descriptor)


def test_the_local_sink_replays_an_identical_object_and_refuses_a_divergent_one(
    tmp_path,
):
    root = tmp_path / "publish"
    root.mkdir()
    key = f"room_file/{USER_ID}/{SCAN_ID}/v1/refine/x.json"
    first = tmp_path / "first.bin"
    first.write_bytes(b"identical")
    second = tmp_path / "second.bin"
    second.write_bytes(b"different")
    sink = LocalScratchStorageSink(root)

    def _publish(path: Path) -> bool:
        descriptor = os.open(path, os.O_RDONLY)
        try:
            return sink.publish_immutable_descriptor(
                key,
                descriptor,
                "application/octet-stream",
                expected_sha256=_sha256(path.read_bytes()),
                expected_size=path.stat().st_size,
                user_id=USER_ID,
                scan_id=SCAN_ID,
                deadline=_deadline(),
            )
        finally:
            os.close(descriptor)

    assert _publish(first) is True
    assert _publish(first) is False
    with pytest.raises(AdapterError) as raised:
        _publish(second)
    assert "would overwrite divergent bytes" in str(raised.value)


def test_the_lifecycle_refuses_a_publication_target_that_is_not_a_storage_client(
    tmp_path,
):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")
    bundle = _Bundle(bundle_root)
    with pytest.raises(AdapterError) as raised:
        run_refine_lifecycle(
            RefineLifecycleRequest(
                user_id=USER_ID,
                scan_id=SCAN_ID,
                task_id=TASK_ID,
                lease_id=LEASE_ID,
                room_file_id=ROOM_FILE_ID,
                room_file_version=1,
                scratch_root=scratch,
                manifest=bundle.manifest,
                keyframe_index=bundle.index,
                keyframe_summary=bundle.summary,
                keyframes_archive=bundle.archive,
            ),
            acquirer=LocalScratchArtifactAcquirer(bundle_root),
            raster_materializer=_PrematerializedRaster(),
            storage=object(),
            deadline=_deadline(),
            native_engine_call=lambda *a, **k: None,  # pragma: no cover
            toolchain_manifest_path=str(manifest),
        )
    assert "requires a StorageClient" in str(raised.value)


@pytest.mark.parametrize(
    "field",
    ("user_id", "scan_id", "task_id", "lease_id", "room_file_id"),
)
def test_the_lifecycle_refuses_an_unsafe_identifier(tmp_path, field):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700)
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")
    bundle = _Bundle(bundle_root)
    fields = {
        "user_id": USER_ID,
        "scan_id": SCAN_ID,
        "task_id": TASK_ID,
        "lease_id": LEASE_ID,
        "room_file_id": ROOM_FILE_ID,
        "room_file_version": 1,
        "scratch_root": scratch,
        "manifest": bundle.manifest,
        "keyframe_index": bundle.index,
        "keyframe_summary": bundle.summary,
        "keyframes_archive": bundle.archive,
    }
    fields[field] = "../escape"
    with pytest.raises(AdapterError) as raised:
        run_refine_lifecycle(
            RefineLifecycleRequest(**fields),
            acquirer=LocalScratchArtifactAcquirer(bundle_root),
            raster_materializer=_PrematerializedRaster(),
            storage=LocalScratchStorageSink(publish),
            deadline=_deadline(),
            native_engine_call=lambda *a, **k: None,  # pragma: no cover
            toolchain_manifest_path=str(manifest),
        )
    assert "is not a safe identifier" in str(raised.value)


def test_the_composed_backend_has_no_fallback_to_replay(tmp_path):
    from patina_scan_worker.refine_lifecycle import (
        ComposedRefineBackend,
        NativeEngineInvocation,
    )

    rows = _anchor_rows()
    snapshot = _snapshot_from_rows(rows, "aligned")
    invocation = NativeEngineInvocation(
        report=parse_engine_report(_BASE_REPORT()),
        outputs={},
        aligned_snapshot=snapshot,
        alignment_verification=_verification_for(snapshot),
    )
    with pytest.raises(AdapterError) as raised:
        ComposedRefineBackend(invocation).run_fallback(None, deadline=_deadline())
    assert raised.value.code == "REFINE_FALLBACK_UNQUALIFIED"
    assert "one primary engine attempt" in str(raised.value)
    assert "fallback to replay" in str(raised.value)


def test_every_descriptor_the_lifecycle_opened_is_closed_again(tmp_path):
    """Compare the process's exact descriptor SET, not a count with slack."""

    fd_dir = "/proc/self/fd" if os.path.isdir("/proc/self/fd") else "/dev/fd"

    def _open_set() -> set[str]:
        return set(os.listdir(fd_dir))

    before = _open_set()
    _report, engine, _sink, _scratch = _run(tmp_path)
    # The recording still owns its seven adopted descriptors ONLY if the sink
    # failed to take them; on the happy path the sink closed every one.
    assert engine.unadopted_descriptors == []
    after = _open_set()
    assert after - before == set()


# ---------------------------------------------------------------------------
# The tolerances themselves, pinned ABSOLUTELY.
#
# The parametrised "just inside / just outside" tests above are stated as
# FRACTIONS of the constants, so widening a constant moves both sides with it
# and neither reddens.  A sweep caught exactly that.  These two pin the numbers
# literally and refuse an absolute drift that a widened constant would accept.
# ---------------------------------------------------------------------------
def test_the_anchor_tolerances_are_the_pinned_numbers():
    assert SEED_ANCHOR_MAX_CENTER_DRIFT_M == 1.0e-6
    assert SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD == 1.0e-6


def test_a_tenth_of_a_millimetre_of_seed_drift_is_refused():
    """1e-4 m is 100x the tolerance and 1e10 x the float round-trip cost."""

    rows = _anchor_rows()
    moved = _anchor_rows(offset=(1.0e-4, 0.0, 0.0))
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(
            _snapshot_from_rows(moved, "seed"),
            _stand_in_frames(rows),
            deadline=_deadline(),
        )
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "camera centres drifted" in str(raised.value)


def test_a_hundredth_of_a_milliradian_of_seed_rotation_is_refused():
    """1e-5 rad is 10x the tolerance and about two arcseconds."""

    rows = _anchor_rows()
    turned = _anchor_rows(turn=1.0e-5)
    with pytest.raises(AdapterError) as raised:
        anchor_seed_snapshot_to_request(
            _snapshot_from_rows(turned, "seed"),
            _stand_in_frames(rows),
            deadline=_deadline(),
        )
    assert raised.value.code == LIFECYCLE_UNANCHORED_CODE
    assert "orientations drifted" in str(raised.value)


def test_the_borrowed_frame_descriptors_are_closed_when_the_scope_exits(tmp_path):
    """Deterministic close, asserted at the instant the scope ends."""

    from patina_scan_worker.refine_lifecycle import _borrowed_frame_descriptors

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        with _borrowed_frame_descriptors(
            materialization, deadline=_deadline()
        ) as frames:
            assert len(frames) == FRAME_COUNT
            descriptors = [frame.source_descriptor for frame in frames] + [
                frame.engine_descriptor for frame in frames
            ]
            for descriptor in descriptors:
                assert os.fstat(descriptor).st_size > 0
        for descriptor in descriptors:
            with pytest.raises(OSError) as raised:
                os.fstat(descriptor)
            assert raised.value.errno == errno.EBADF
    finally:
        materialization.cleanup()


def test_a_child_announcing_the_unqualified_fallback_engine_is_refused():
    document = _BASE_REPORT()
    document["selectedEngine"] = "colmap-4-position-prior-mapper"
    with pytest.raises(AdapterError) as raised:
        parse_engine_report(document)
    assert "selected an engine this composition never runs" in str(raised.value)


def test_scratch_removal_reports_what_survived_instead_of_raising(tmp_path):
    from patina_scan_worker.refine_lifecycle import _remove_tree

    root = tmp_path / "scratch-tree"
    (root / "a" / "b").mkdir(parents=True)
    (root / "a" / "b" / "leaf").write_bytes(b"x")
    (root / "a" / "link").symlink_to(tmp_path / "outside")
    (tmp_path / "outside").mkdir()
    (tmp_path / "outside" / "keep").write_bytes(b"keep")

    assert _remove_tree(root) is None
    assert not root.exists()
    # The symlink was unlinked, not descended into.
    assert (tmp_path / "outside" / "keep").read_bytes() == b"keep"
    # Idempotent on an already-absent tree.
    assert _remove_tree(root) is None


# ===========================================================================
# BLOCKING 1: which archive becomes the published refined poses
#
# An independent reviewer substituted the SEED snapshot for the aligned one at
# the publish seam.  The composition published an identity refinement -- no
# refinement at all -- and every one of the 1304 tests stayed green, because
# nothing bound the snapshot being PUBLISHED to the snapshot that had been
# VERIFIED, and nothing asked whether the result differed from its input.
#
# The two clauses below are independent and each has its own mutation:
#   * the digest binding refuses a snapshot that is not the verified aligned
#     model, and is defeated by a THIRD snapshot far from the frames;
#   * the movement floor refuses a result that is the submitted poses, and is
#     defeated by a child that genuinely refines nothing.
# ===========================================================================
def test_the_reviewers_swap_of_the_seed_for_the_aligned_model_is_refused(tmp_path):
    """THE regression. Publishing the seed where the aligned model belongs."""

    from patina_scan_worker.refine_lifecycle import NativeEngineInvocation

    seed = _snapshot_from_rows(_anchor_rows(), "seed")
    aligned = _snapshot_from_rows(_apply_similarity(_anchor_rows()), "aligned")
    # The verification really did run on the aligned model.
    verification = _verification_for(aligned)
    assert canonical_pose_digest(aligned) != canonical_pose_digest(seed)

    with pytest.raises(AdapterError) as raised:
        NativeEngineInvocation(
            report=parse_engine_report(_BASE_REPORT()),
            outputs={},
            aligned_snapshot=seed,
            alignment_verification=verification,
        )
    assert raised.value.code == "REFINE_PUBLISHED_MODEL_UNVERIFIED"
    assert "not the aligned model the parent verified" in str(raised.value)


def test_a_third_snapshot_nobody_verified_is_refused_at_the_publish_seam():
    """Defeats ONLY the digest binding: this snapshot is far from the frames."""

    from patina_scan_worker.refine_lifecycle import NativeEngineInvocation

    aligned = _snapshot_from_rows(_apply_similarity(_anchor_rows()), "aligned")
    impostor = _snapshot_from_rows(
        _apply_similarity(_anchor_rows(offset=(0.5, -0.25, 0.125))),
        "aligned",
    )
    assert canonical_pose_digest(impostor) != canonical_pose_digest(aligned)

    with pytest.raises(AdapterError) as raised:
        NativeEngineInvocation(
            report=parse_engine_report(_BASE_REPORT()),
            outputs={},
            aligned_snapshot=impostor,
            alignment_verification=_verification_for(aligned),
        )
    assert raised.value.code == "REFINE_PUBLISHED_MODEL_UNVERIFIED"


def test_the_publish_seam_refuses_a_verification_of_the_wrong_type():
    from patina_scan_worker.refine_lifecycle import NativeEngineInvocation

    aligned = _snapshot_from_rows(_apply_similarity(_anchor_rows()), "aligned")
    with pytest.raises(AdapterError) as raised:
        NativeEngineInvocation(
            report=parse_engine_report(_BASE_REPORT()),
            outputs={},
            aligned_snapshot=aligned,
            alignment_verification=None,
        )
    assert raised.value.code == "REFINE_PUBLISHED_MODEL_UNVERIFIED"
    assert "requires the parent's own alignment verification" in str(raised.value)


def test_the_publish_seam_refuses_a_snapshot_of_the_wrong_type():
    from patina_scan_worker.refine_lifecycle import NativeEngineInvocation

    aligned = _snapshot_from_rows(_apply_similarity(_anchor_rows()), "aligned")
    with pytest.raises(AdapterError) as raised:
        NativeEngineInvocation(
            report=parse_engine_report(_BASE_REPORT()),
            outputs={},
            aligned_snapshot=list(aligned.poses),
            alignment_verification=_verification_for(aligned),
        )
    assert raised.value.code == "REFINE_PUBLISHED_MODEL_UNVERIFIED"
    assert "must be an exact SparseModelSnapshot" in str(raised.value)


def test_a_child_that_returns_the_seed_as_its_aligned_model_is_refused(tmp_path):
    """Defeats ONLY the movement floor.

    The child hands back three identical models and an identity similarity.  The
    digest binding is satisfied -- the snapshot published IS the one verified --
    and the run still refuses, because what it verified refined nothing.
    """

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, engine_kwargs={"alignment_mode": "identity"})
    assert raised.value.code == "REFINE_UNCHANGED_EVIDENCE"
    assert "identity refinement rather than a refinement" in str(raised.value)


def test_item_six_accepts_the_identity_refinement_this_composition_refuses():
    """WHY the floor lives at the publish seam and not in item 6.

    Item 6 is handed three child archives and asked whether they agree.  Three
    identical models with an identity proposal satisfy every one of its
    seventeen clauses, so it returns a verification rather than refusing -- its
    fit residual is bounded above and has no floor.  It cannot close this gap
    with what it is given: the quantity that says "refined nothing" is the
    distance from ``request.frames``, the parent's own submitted poses, and item
    6 has never been handed those.  The composition has.
    """

    from patina_scan_worker.refine_model_alignment import (
        ProposedAlignment,
        verify_child_alignment_proposal,
    )

    rows = _anchor_rows()
    snapshot = _snapshot_from_rows(rows, "identical")
    digest = canonical_pose_digest(snapshot)
    verification = verify_child_alignment_proposal(
        seed=snapshot,
        raw_pre_ba=snapshot,
        aligned=snapshot,
        proposal=ProposedAlignment(
            scale=1.0,
            rotation=((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
            translation=(0.0, 0.0, 0.0),
            raw_pose_digest_sha256=digest,
            aligned_pose_digest_sha256=digest,
        ),
        deadline=_deadline(),
    )
    # It accepted, and its own shape-change number is exactly zero.
    assert verification.fit_rmse_m == 0.0
    assert verification.max_aligned_orientation_change_rad == 0.0


def test_the_movement_floor_is_the_anchor_tolerance_itself():
    """The threshold is not a new number; it is the anchor's own tolerance.

    The anchor says a pose within this distance of the submitted pose IS the
    submitted pose.  The floor says the same thing about the poses being
    published.  If these ever diverge, the module calls one displacement
    'identical' in one function and 'changed' in the other.
    """

    from patina_scan_worker.refine_lifecycle import (
        REFINED_POSE_MIN_CENTER_MOVEMENT_M,
        REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD,
    )

    assert REFINED_POSE_MIN_CENTER_MOVEMENT_M == SEED_ANCHOR_MAX_CENTER_DRIFT_M
    assert REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD == SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD
    # ... and the numbers themselves are the pinned ones.
    assert REFINED_POSE_MIN_CENTER_MOVEMENT_M == 1.0e-6
    assert REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD == 1.0e-6


@pytest.mark.parametrize("factor", [0.0, 0.5, 1.0])
def test_movement_at_or_below_the_floor_is_an_identity_refinement(factor):
    """A translation of at most the floor is refused, including exactly zero."""

    from patina_scan_worker.refine_lifecycle import (
        REFINED_POSE_MIN_CENTER_MOVEMENT_M,
        require_refined_poses_moved,
    )

    rows = _anchor_rows()
    shifted = _anchor_rows(
        offset=(REFINED_POSE_MIN_CENTER_MOVEMENT_M * factor, 0.0, 0.0)
    )
    with pytest.raises(AdapterError) as raised:
        require_refined_poses_moved(
            _snapshot_from_rows(shifted, "published"),
            _stand_in_frames(rows),
            deadline=_deadline(),
        )
    assert raised.value.code == "REFINE_UNCHANGED_EVIDENCE"


def test_movement_just_past_the_floor_is_accepted():
    from patina_scan_worker.refine_lifecycle import (
        REFINED_POSE_MIN_CENTER_MOVEMENT_M,
        require_refined_poses_moved,
    )

    rows = _anchor_rows()
    shifted = _anchor_rows(offset=(REFINED_POSE_MIN_CENTER_MOVEMENT_M * 1.5, 0.0, 0.0))
    movement = require_refined_poses_moved(
        _snapshot_from_rows(shifted, "published"),
        _stand_in_frames(rows),
        deadline=_deadline(),
    )
    assert movement.max_center_movement_m > REFINED_POSE_MIN_CENTER_MOVEMENT_M
    assert movement.correspondences == len(rows)


def test_a_rotation_alone_past_the_floor_is_a_refinement():
    """Centres frozen, orientations turned: the model still CHANGED."""

    from patina_scan_worker.refine_lifecycle import (
        REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD,
        require_refined_poses_moved,
    )

    rows = _anchor_rows()
    turned = _anchor_rows(turn=REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD * 10.0)
    movement = require_refined_poses_moved(
        _snapshot_from_rows(turned, "published"),
        _stand_in_frames(rows),
        deadline=_deadline(),
    )
    assert movement.max_rotation_movement_rad > REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD


def test_the_movement_check_refuses_a_snapshot_of_the_wrong_type():
    from patina_scan_worker.refine_lifecycle import require_refined_poses_moved

    with pytest.raises(AdapterError) as raised:
        require_refined_poses_moved(
            object(), _stand_in_frames(_anchor_rows()), deadline=_deadline()
        )
    assert "requires an exact SparseModelSnapshot" in str(raised.value)


def test_the_movement_check_requires_the_carried_deadline():
    from patina_scan_worker.refine_lifecycle import require_refined_poses_moved

    rows = _anchor_rows()
    with pytest.raises(AdapterError) as raised:
        require_refined_poses_moved(
            _snapshot_from_rows(rows, "published"),
            _stand_in_frames(rows),
            deadline=object(),
        )
    assert "requires the carried refine deadline" in str(raised.value)


@pytest.mark.parametrize(
    ("kwargs", "label"),
    [
        ({"min_center_movement_m": 0.0}, "centre"),
        ({"min_center_movement_m": -1.0}, "centre"),
        ({"min_center_movement_m": math.inf}, "centre"),
        ({"min_center_movement_m": True}, "centre"),
        ({"min_rotation_movement_rad": 0.0}, "rotation"),
        ({"min_rotation_movement_rad": math.nan}, "rotation"),
        ({"min_rotation_movement_rad": "1e-6"}, "rotation"),
    ],
)
def test_the_movement_check_refuses_a_nonsense_floor(kwargs, label):
    from patina_scan_worker.refine_lifecycle import require_refined_poses_moved

    rows = _anchor_rows()
    with pytest.raises(AdapterError) as raised:
        require_refined_poses_moved(
            _snapshot_from_rows(rows, "published"),
            _stand_in_frames(rows),
            deadline=_deadline(),
            **kwargs,
        )
    assert f"refinement movement {label} floor must be finite positive" in str(
        raised.value
    )


def test_the_movement_check_refuses_a_renamed_published_image():
    from patina_scan_worker.refine_lifecycle import require_refined_poses_moved

    rows = _anchor_rows()
    renamed = [dict(row) for row in _anchor_rows(offset=(0.4, 0.0, 0.0))]
    renamed[3]["name"] = "frame_000999.ppm"
    with pytest.raises(AdapterError) as raised:
        require_refined_poses_moved(
            _snapshot_from_rows(renamed, "published"),
            _stand_in_frames(rows),
            deadline=_deadline(),
        )
    assert raised.value.code == "REFINE_UNCHANGED_EVIDENCE"
    assert "published snapshot image names disagree with the submitted frames" in str(
        raised.value
    )


def test_the_movement_check_refuses_a_duplicate_submitted_frame_name():
    from patina_scan_worker.refine_lifecycle import require_refined_poses_moved

    rows = _anchor_rows()
    duplicated = list(_stand_in_frames(rows))
    duplicated[2] = duplicated[1]
    with pytest.raises(AdapterError) as raised:
        require_refined_poses_moved(
            _snapshot_from_rows(rows, "published"),
            duplicated,
            deadline=_deadline(),
        )
    assert "refinement movement received a duplicate engine image name" in str(
        raised.value
    )


def test_the_movement_check_refuses_a_frame_count_outside_the_reviewed_band():
    from patina_scan_worker.refine_lifecycle import require_refined_poses_moved

    rows = _anchor_rows(count=2)
    with pytest.raises(AdapterError) as raised:
        require_refined_poses_moved(
            _snapshot_from_rows(rows, "published"),
            _stand_in_frames(rows),
            deadline=_deadline(),
        )
    assert "refinement movement needs a frame count inside the reviewed packet band" in str(
        raised.value
    )


def test_the_report_records_how_far_the_published_poses_moved(tmp_path):
    report, _engine, _sink, _scratch = _run(tmp_path)
    document = report.to_document()

    movement = document["refinedPoseMovement"]
    assert movement["correspondences"] == report.seed_anchor.correspondences
    assert movement["maxCenterMovementMeters"] > 1.0e-6
    assert movement["maxRotationMovementRadians"] > 1.0e-6
    # The anchor and the floor measure the SAME pair, in opposite directions.
    assert report.seed_anchor.max_center_drift_m <= 1.0e-6


# ===========================================================================
# BLOCKING 2: the packet against the native boundary's pinned-file ceilings
#
# The composition built ONE archive.  The subject scan's 100 keyframes are
# uniformly 1440x1920, so that archive is 0.77 GiB -- 6.2x the 128 MiB per-file
# ceiling the frozen child enforces.  Every run would have been refused by the
# child before it read a pixel.
#
# The numbers below are written out LITERALLY rather than recomputed from the
# module, so deleting a term from the packing changes a number rather than
# silently shrinking an assertion.
# ===========================================================================
#: One 1440x1920 P6 keyframe: the header ``P6\n1440 1920\n255\n`` is 17 bytes and
#: the raster is 1440*1920*3.  Both halves are asserted below.
_SUBJECT_FRAME_PAYLOAD_BYTES = 8_294_417
_SUBJECT_FRAME_MEMBER_BYTES = 8_295_424
_NATIVE_PINNED_FILE_CEILING = 134_217_728
_NATIVE_PINNED_FILE_COUNT_CEILING = 64
_NATIVE_AGGREGATE_CEILING = 4 * 1024 * 1024 * 1024


def test_the_subject_keyframe_arithmetic_is_the_pinned_one():
    from patina_scan_worker.refine_lifecycle import ustar_member_bytes

    header = b"P6\n1440 1920\n255\n"
    assert len(header) == 17
    assert 1440 * 1920 * 3 == 8_294_400
    assert len(header) + 1440 * 1920 * 3 == _SUBJECT_FRAME_PAYLOAD_BYTES
    # A USTAR member is a 512 B header plus the payload padded to 512.
    assert ustar_member_bytes(_SUBJECT_FRAME_PAYLOAD_BYTES) == _SUBJECT_FRAME_MEMBER_BYTES
    assert ustar_member_bytes(0) == 512
    assert ustar_member_bytes(1) == 1024
    assert ustar_member_bytes(512) == 1024
    assert ustar_member_bytes(513) == 1536


def test_the_native_ceilings_the_packet_honours_are_the_childs_own():
    from patina_scan_worker import refine_lifecycle as lifecycle
    from patina_scan_worker import refine_native_process as native

    assert lifecycle.PACKET_CHUNK_MAX_BYTES == _NATIVE_PINNED_FILE_CEILING
    assert lifecycle.PACKET_MAX_PINNED_FILES == _NATIVE_PINNED_FILE_COUNT_CEILING
    assert lifecycle.PACKET_MAX_AGGREGATE_BYTES == _NATIVE_AGGREGATE_CEILING
    # ... and they are the SAME constants the frozen child enforces, not a copy.
    assert lifecycle.PACKET_CHUNK_MAX_BYTES == native.NATIVE_CHILD_MAX_PINNED_FILE_BYTES
    assert lifecycle.PACKET_MAX_PINNED_FILES == native.NATIVE_CHILD_MAX_PINNED_FILES
    assert (
        lifecycle.PACKET_MAX_AGGREGATE_BYTES
        == native.NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES
    )


def test_one_archive_of_the_subject_scan_would_breach_the_per_file_ceiling():
    """WHY the packet is chunked at all -- the shape this replaced."""

    single_archive = 100 * _SUBJECT_FRAME_MEMBER_BYTES + 1024
    assert single_archive == 829_543_424
    assert single_archive > _NATIVE_PINNED_FILE_CEILING
    # 6.18x over. The frozen child refuses this with its own message.
    assert round(single_archive / _NATIVE_PINNED_FILE_CEILING, 2) == 6.18
    # Chunked, the same 100 frames cost 6144 bytes more -- one 1024-byte
    # end-of-archive terminator in each of the seven chunks instead of one.
    assert 829_549_568 - single_archive == 7 * 1024 - 1024


def test_a_hundred_and_twenty_eight_mib_chunk_holds_exactly_sixteen_keyframes():
    budget = _NATIVE_PINNED_FILE_CEILING - 1024  # the end-of-archive terminator
    assert budget == 134_216_704
    assert 16 * _SUBJECT_FRAME_MEMBER_BYTES == 132_726_784
    assert 16 * _SUBJECT_FRAME_MEMBER_BYTES <= budget
    assert 17 * _SUBJECT_FRAME_MEMBER_BYTES == 141_022_208
    assert 17 * _SUBJECT_FRAME_MEMBER_BYTES > budget
    # ... which leaves this much room in chunk 000 for the engine request.
    assert budget - 16 * _SUBJECT_FRAME_MEMBER_BYTES == 1_489_920


@pytest.mark.parametrize(
    (
        "frame_count",
        "request_bytes",
        "expected_chunks",
        "expected_pinned_files",
        "expected_frames_in_first_chunk",
    ),
    [
        # The subject scan and the contract maximum, with engine requests sized
        # at 2800 bytes per frame -- four times what the real rows cost, and
        # still inside chunk 000's 1_489_920 bytes of headroom at 400 frames.
        (100, 280_000, 7, 8, 16),
        (400, 1_120_000, 25, 26, 16),
        # One byte past that headroom the request displaces a frame from chunk
        # 000, and the whole packet needs one more chunk.  Pinned so that a
        # request which grew past the headroom cannot pass unnoticed.
        (400, 1_489_921, 26, 27, 15),
    ],
)
def test_the_subject_scan_and_the_contract_maximum_fit_every_native_ceiling(
    frame_count,
    request_bytes,
    expected_chunks,
    expected_pinned_files,
    expected_frames_in_first_chunk,
):
    """The two counts that matter: the 100-frame subject and the 400 ceiling."""

    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    plan = plan_packet_chunks(
        [request_bytes] + [_SUBJECT_FRAME_PAYLOAD_BYTES] * frame_count
    )

    assert len(plan.groups) == expected_chunks
    assert plan.pinned_file_count == expected_pinned_files
    assert plan.pinned_file_count <= _NATIVE_PINNED_FILE_COUNT_CEILING
    assert len(plan.groups[0]) - 1 == expected_frames_in_first_chunk
    # No chunk may exceed 128 MiB -- the clause the single archive breached.
    assert max(plan.chunk_sizes) <= _NATIVE_PINNED_FILE_CEILING
    # Every member lands in exactly one chunk, in order.
    assert [index for group in plan.groups for index in group] == list(
        range(frame_count + 1)
    )
    assert plan.total_chunk_bytes == sum(plan.chunk_sizes)
    assert plan.total_chunk_bytes <= _NATIVE_AGGREGATE_CEILING


def test_the_hundred_frame_packet_is_the_measured_three_quarters_of_a_gibibyte():
    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    frames_only = plan_packet_chunks([_SUBJECT_FRAME_PAYLOAD_BYTES] * 100)
    assert frames_only.total_chunk_bytes == 829_549_568
    assert round(frames_only.total_chunk_bytes / 2**30, 4) == 0.7726
    assert (
        round(100 * frames_only.total_chunk_bytes / _NATIVE_AGGREGATE_CEILING, 2)
        == 19.31
    )


def test_the_four_hundred_frame_packet_stays_inside_the_aggregate_ceiling():
    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    frames_only = plan_packet_chunks([_SUBJECT_FRAME_PAYLOAD_BYTES] * 400)
    assert len(frames_only.groups) == 25
    assert frames_only.total_chunk_bytes == 3_318_195_200
    assert round(frames_only.total_chunk_bytes / 2**30, 2) == 3.09
    assert frames_only.total_chunk_bytes < _NATIVE_AGGREGATE_CEILING


def test_a_member_too_large_for_a_whole_chunk_is_refused_not_split():
    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    with pytest.raises(AdapterError) as raised:
        plan_packet_chunks([_NATIVE_PINNED_FILE_CEILING])
    assert "larger than one whole archive chunk" in str(raised.value)


def test_a_packet_needing_more_than_sixty_four_pinned_files_is_refused():
    """63 chunks is the most the boundary leaves once the manifest is pinned.

    The ceiling is tightened so one member fills a chunk; at the real 128 MiB
    ceiling 64 full chunks would breach the 4 GiB aggregate first and this
    clause would never be the one that fires.
    """

    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    plan = plan_packet_chunks([2048] * 63, chunk_max_bytes=4096)
    assert len(plan.groups) == 63, "each member must fill its own chunk"
    assert plan.pinned_file_count == 64
    with pytest.raises(AdapterError) as raised:
        plan_packet_chunks([2048] * 64, chunk_max_bytes=4096)
    assert "more pinned files than the native boundary allows" in str(raised.value)


def test_a_packet_past_the_aggregate_ceiling_is_refused():
    """The 4 GiB clause, reached before the pinned-file count at full size."""

    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    payload = _NATIVE_PINNED_FILE_CEILING - 2048
    with pytest.raises(AdapterError) as raised:
        plan_packet_chunks([payload] * 33)
    assert "exceeds the native aggregate byte ceiling" in str(raised.value)
    # 32 of them is 4.0 GiB minus change, and still fits.
    plan = plan_packet_chunks([payload] * 32)
    assert plan.total_chunk_bytes <= _NATIVE_AGGREGATE_CEILING


def test_the_chunk_ceiling_may_be_tightened_but_never_raised():
    from patina_scan_worker.refine_lifecycle import (
        PACKET_CHUNK_MAX_BYTES,
        plan_packet_chunks,
    )

    plan_packet_chunks([1024], chunk_max_bytes=PACKET_CHUNK_MAX_BYTES)
    with pytest.raises(AdapterError) as raised:
        plan_packet_chunks([1024], chunk_max_bytes=PACKET_CHUNK_MAX_BYTES + 1)
    assert "may be tightened but never raised" in str(raised.value)


@pytest.mark.parametrize("ceiling", [0, -1, True, 1.5, "128"])
def test_the_planner_refuses_a_nonsense_chunk_ceiling(ceiling):
    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    with pytest.raises(AdapterError) as raised:
        plan_packet_chunks([1024], chunk_max_bytes=ceiling)
    assert "packet chunk ceiling" in str(raised.value)


def test_the_planner_refuses_an_empty_member_list():
    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    with pytest.raises(AdapterError) as raised:
        plan_packet_chunks([])
    assert "needs at least one member" in str(raised.value)


def test_the_packet_writer_really_produces_the_chunks_the_plan_asked_for(tmp_path):
    """A REAL multi-chunk packet, with real bytes through the real writer.

    The ceiling is tightened rather than the frames enlarged: writing 0.77 GiB
    to prove a layout would be a slow way to test arithmetic already pinned
    above.  Tightening is the only direction the builder permits.
    """

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        packet = build_colmap_packet(
            materialization,
            destination=scratch / "packet",
            gpu_index="0",
            run_id="b" * 64,
            deadline=_deadline(),
            chunk_max_bytes=8192,
        )
        assert len(packet.chunk_paths) > 1, "the ceiling did not force a split"
        assert packet.pinned_file_count == 1 + len(packet.chunk_paths)

        document = json.loads(packet.manifest_path.read_bytes())
        tokens = [row["token"] for row in document["chunks"]]
        assert tokens == [f"packet.chunk.{i:03d}" for i in range(len(tokens))]
        # The frozen child re-sorts and demands canonical order.
        assert tokens == sorted(tokens)

        for index, chunk_path in enumerate(packet.chunk_paths):
            written = chunk_path.stat().st_size
            assert written <= 8192, "a chunk breached the ceiling it was built under"
            assert written == document["chunks"][index]["sizeBytes"]
            assert _sha256(chunk_path.read_bytes()) == document["chunks"][index]["sha256"]
            assert _sha256(chunk_path.read_bytes()) == packet.chunk_sha256s[index]

        # Every declared member is really in the chunk the manifest names, once.
        placed = {}
        for index, chunk_path in enumerate(packet.chunk_paths):
            with tarfile.open(chunk_path, mode="r:") as archive:
                for member in archive.getmembers():
                    assert member.name not in placed
                    placed[member.name] = f"packet.chunk.{index:03d}"
        assert placed == {
            row["relativePath"]: row["chunkToken"] for row in document["members"]
        }
        assert set(placed) == {
            "adapter-ledger-v1.json",
            "engine-request-v1.json",
            "source-ledger-v1.json",
        } | {f"images/{frame.engine_name}" for frame in materialization.frames}
    finally:
        materialization.cleanup()


def test_every_chunk_is_pinned_down_to_the_child(tmp_path):
    """The child's ledger check is exact; a chunk left unpinned is a refusal."""

    from patina_scan_worker.refine_lifecycle import pinned_packet_files

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        packet = build_colmap_packet(
            materialization,
            destination=scratch / "packet",
            gpu_index="0",
            run_id="c" * 64,
            deadline=_deadline(),
            chunk_max_bytes=8192,
        )
        with pinned_packet_files(packet, deadline=_deadline()) as pinned:
            expected = ("packet.manifest",) + tuple(
                f"packet.chunk.{i:03d}" for i in range(len(packet.chunk_paths))
            )
            assert tuple(sorted(pinned)) == tuple(sorted(expected))
            assert len(pinned) == packet.pinned_file_count
            for index, token in enumerate(
                f"packet.chunk.{i:03d}" for i in range(len(packet.chunk_paths))
            ):
                assert pinned[token].sha256 == packet.chunk_sha256s[index]
                assert pinned[token].size_bytes == packet.chunk_paths[index].stat().st_size
    finally:
        materialization.cleanup()


def test_the_engine_saw_every_chunk_of_the_packet_it_was_handed(tmp_path):
    """End to end: the recorded engine verifies each pinned file's digest."""

    _report, engine, _sink, _scratch = _run(tmp_path)
    tokens = engine.calls[0]["tokens"]
    assert tokens[0] == "packet.chunk.000"
    assert tokens[-1] == "packet.manifest"
    assert sorted(engine.pinned_snapshot) == sorted(tokens)
    assert len(tokens) <= _NATIVE_PINNED_FILE_COUNT_CEILING
    for _digest, size in engine.pinned_snapshot.values():
        assert 0 < size <= _NATIVE_PINNED_FILE_CEILING


# ===========================================================================
# BLOCKING 3: one lease-aware deadline, and the lease governs it
#
# ``RefineDeadline.start`` applied ``min(now + REFINE_STAGE_ENGINE_BUDGET_S, ...)``
# unconditionally, so every composed run was capped at 240 s however long a
# lease it claimed.  A 100-frame COLMAP reconstruction does not finish in four
# minutes.
# ===========================================================================
@pytest.mark.parametrize(
    ("lease_seconds", "expected_engine_seconds"),
    [
        (61.0, 1.0),
        (120.0, 60.0),
        (300.0, 240.0),
        (301.0, 241.0),
        (900.0, 840.0),
        (3600.0, 3540.0),
        (7200.0, 7140.0),
    ],
)
def test_the_lease_governs_the_one_carried_deadline(
    lease_seconds, expected_engine_seconds
):
    """The lease, minus the completion reserve. No other term may bind.

    The 301 s row is the regression: under the old unconditional 240 s cap it
    would have been 240, not 241.  So would every row below it.
    """

    from patina_scan_worker.refine_lifecycle import lease_deadline

    deadline = lease_deadline(lease_seconds, now_monotonic_s=1000.0)
    assert deadline.expires_at_monotonic_s == pytest.approx(
        1000.0 + expected_engine_seconds
    )
    assert deadline.remaining_seconds(now_monotonic_s=1000.0) == pytest.approx(
        expected_engine_seconds
    )


@pytest.mark.parametrize(
    ("lease_seconds", "expected_code", "expected_message"),
    [
        # A non-positive lease is not a lease at all; it never reaches the
        # reserve arithmetic.
        (0.0, "REFINE_ADAPTER_INVALID", "positive finite engine budget"),
        (-30.0, "REFINE_ADAPTER_INVALID", "positive finite engine budget"),
        # A positive lease with nothing left after the 60 s completion reserve.
        (1.0, "REFINE_ENGINE_TIMEOUT", "no engine time after the completion reserve"),
        (59.0, "REFINE_ENGINE_TIMEOUT", "no engine time after the completion reserve"),
        (60.0, "REFINE_ENGINE_TIMEOUT", "no engine time after the completion reserve"),
    ],
)
def test_a_lease_with_no_engine_time_is_refused(
    lease_seconds, expected_code, expected_message
):
    from patina_scan_worker.refine_lifecycle import lease_deadline

    with pytest.raises(AdapterError) as raised:
        lease_deadline(lease_seconds, now_monotonic_s=1000.0)
    assert raised.value.code == expected_code
    assert expected_message in str(raised.value)


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf, "900", None, True])
def test_the_lease_must_be_a_finite_number(value):
    from patina_scan_worker.refine_lifecycle import lease_deadline

    with pytest.raises(AdapterError) as raised:
        lease_deadline(value, now_monotonic_s=1000.0)
    assert "lease seconds must be a finite number" in str(raised.value)


def test_the_stage_budget_is_a_default_the_caller_can_replace():
    """It stays 240 s for everyone who does not say otherwise."""

    from patina_scan_worker.refine_adapter import (
        LEASE_COMPLETION_RESERVE_S,
        REFINE_STAGE_ENGINE_BUDGET_S,
    )

    assert REFINE_STAGE_ENGINE_BUDGET_S == 240
    assert LEASE_COMPLETION_RESERVE_S == 60
    # Default: the 240 s stage budget binds inside a long lease.
    stage = RefineDeadline.start(
        now_monotonic_s=1000.0, lease_expires_at_monotonic_s=1000.0 + 3600.0
    )
    assert stage.expires_at_monotonic_s == pytest.approx(1240.0)
    # Replaced: the lease binds instead.
    composed = RefineDeadline.start(
        now_monotonic_s=1000.0,
        lease_expires_at_monotonic_s=1000.0 + 3600.0,
        engine_budget_s=3600.0,
    )
    assert composed.expires_at_monotonic_s == pytest.approx(1000.0 + 3540.0)
    # No budget can ever push the deadline past the lease's reserve.
    beyond = RefineDeadline.start(
        now_monotonic_s=1000.0,
        lease_expires_at_monotonic_s=1000.0 + 3600.0,
        engine_budget_s=1_000_000.0,
    )
    assert beyond.expires_at_monotonic_s == pytest.approx(1000.0 + 3540.0)


@pytest.mark.parametrize("budget", [0.0, -1.0, math.nan, math.inf, True, "240"])
def test_the_engine_budget_must_be_positive_and_finite(budget):
    with pytest.raises(AdapterError) as raised:
        RefineDeadline.start(
            now_monotonic_s=1000.0,
            lease_expires_at_monotonic_s=1000.0 + 3600.0,
            engine_budget_s=budget,
        )
    assert "positive finite engine budget" in str(raised.value)


#: Every module the composed lifecycle runs through.  Written out literally: if
#: the lifecycle grows an import, this list is what has to be updated, and the
#: test below proves the list still covers the real import graph.
_COMPOSED_LIFECYCLE_MODULES = (
    "refine_lifecycle.py",
    "refine_materializer.py",
    "refine_model_alignment.py",
    "refine_native_process.py",
    "refine_packet_extractor.py",
    "refine_publisher.py",
    "refine_runner.py",
)


def test_no_composed_module_acquires_a_second_deadline():
    """ONE deadline is created, in ``main``, and threaded from there.

    A stage that called ``RefineDeadline.start`` for itself would get a fresh
    clock and silently escape the lease.  This reads the shipped source of every
    module on the composed path rather than watching one run, so a fresh
    acquisition on a branch no fixture reaches still reddens.
    """

    source_root = pathlib.Path(refine_lifecycle.__file__).parent
    acquisitions = []
    for module_name in _COMPOSED_LIFECYCLE_MODULES:
        tree = ast.parse((source_root / module_name).read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            function = node.func
            if (
                isinstance(function, ast.Attribute)
                and function.attr == "start"
                and isinstance(function.value, ast.Name)
                and function.value.id == "RefineDeadline"
            ) or (
                isinstance(function, ast.Name) and function.id == "RefineDeadline"
            ):
                acquisitions.append((module_name, node.lineno))

    assert [module for module, _line in acquisitions] == [
        "refine_lifecycle.py",
        "refine_native_process.py",
    ]
    # ... and the single acquisition is inside ``lease_deadline``, nowhere else.
    tree = ast.parse((source_root / "refine_lifecycle.py").read_text())
    owners = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
        and any(
            isinstance(inner, ast.Call)
            and isinstance(inner.func, ast.Attribute)
            and inner.func.attr == "start"
            and isinstance(inner.func.value, ast.Name)
            and inner.func.value.id == "RefineDeadline"
            for inner in ast.walk(node)
        )
    }
    assert owners == {"lease_deadline"}

    # THE SECOND SITE, and why it is not a second clock.  ``RefineDeadline`` is
    # a Python object and cannot cross a ``spawn``ed process boundary; only the
    # absolute monotonic instant does, inside ``NativeChildContext``.  R121's
    # child needs the dataclass because four collaborators type-check for it, so
    # ``NativeChildContext.carried_deadline`` rehydrates the transported field.
    #
    # This is asserted MUCH more tightly than the ban it replaces: the site must
    # be that one method, and its sole argument must be
    # ``self.expires_at_monotonic_s``.  ``RefineDeadline.start`` -- the call that
    # reads ``time.monotonic()`` and would hand the child a fresh lease -- stays
    # banned everywhere outside ``lease_deadline``, which the assertion above
    # pins.  A child that computed its own expiry would have to name something
    # other than the transported field and reddens here.
    child_tree = ast.parse((source_root / "refine_native_process.py").read_text())
    rehydrations = [
        (node.name, call)
        for node in ast.walk(child_tree)
        if isinstance(node, ast.FunctionDef)
        for call in ast.walk(node)
        if isinstance(call, ast.Call)
        and isinstance(call.func, ast.Name)
        and call.func.id == "RefineDeadline"
    ]
    assert [name for name, _call in rehydrations] == ["carried_deadline"]
    (_name, rehydration) = rehydrations[0]
    assert not rehydration.keywords and len(rehydration.args) == 1
    argument = rehydration.args[0]
    assert isinstance(argument, ast.Attribute)
    assert argument.attr == "expires_at_monotonic_s"
    assert isinstance(argument.value, ast.Name) and argument.value.id == "self"


def test_the_composed_module_list_covers_the_real_import_graph():
    """The list above is only trustworthy if it is complete."""

    source_root = pathlib.Path(refine_lifecycle.__file__).parent
    seen = set()
    pending = ["refine_lifecycle.py"]
    while pending:
        module_name = pending.pop()
        if module_name in seen:
            continue
        seen.add(module_name)
        tree = ast.parse((source_root / module_name).read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module:
                candidate = f"{node.module}.py"
                if (source_root / candidate).exists():
                    pending.append(candidate)

    # Modules that only define or carry the deadline, never acquire one.
    leaves = {
        "refine_adapter.py",
        "refine_colmap_backend.py",
        "refine_colmap_command.py",
        "refine_colmap_toolchain.py",
        "refine_evidence_builder.py",
        "refine_engine.py",
        "field_raster_materializer.py",
        "field_raster_qualification.py",
        "field_storage_acquirer.py",
        "colmap_qualification.py",
        "config.py",
        "db.py",
        "errors.py",
        "http.py",
        "keys.py",
        "storage.py",
        "telemetry.py",
        "untar.py",
    }
    assert seen - leaves == set(_COMPOSED_LIFECYCLE_MODULES)


def test_the_carried_deadline_is_the_same_object_at_every_seam(tmp_path):
    """No seam swaps the clock for one of its own."""

    carried = _deadline(300.0)
    seen: list[int] = []

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir(parents=True)
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700, parents=True)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700, parents=True)
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")
    bundle = _Bundle(bundle_root)
    probe = _materialize(bundle, scratch, _deadline())
    frames = probe.frames
    probe.cleanup()

    engine = _RecordedEngine(tmp_path / "engine-outputs", frames)
    inner = engine.__call__

    def recording_engine(request, *, deadline, **kwargs):
        seen.append(id(deadline))
        return inner(request, deadline=deadline, **kwargs)

    class _RecordingAcquirer(LocalScratchArtifactAcquirer):
        def acquire(self, *args, **kwargs):
            deadline = kwargs.get("deadline")
            if deadline is not None:
                seen.append(id(deadline))
            return super().acquire(*args, **kwargs)

    try:
        run_refine_lifecycle(
            RefineLifecycleRequest(
                user_id=USER_ID,
                scan_id=SCAN_ID,
                task_id=TASK_ID,
                lease_id=LEASE_ID,
                room_file_id=ROOM_FILE_ID,
                room_file_version=1,
                scratch_root=scratch,
                manifest=bundle.manifest,
                keyframe_index=bundle.index,
                keyframe_summary=bundle.summary,
                keyframes_archive=bundle.archive,
            ),
            acquirer=_RecordingAcquirer(bundle_root),
            raster_materializer=_PrematerializedRaster(),
            storage=LocalScratchStorageSink(publish),
            deadline=carried,
            native_engine_call=recording_engine,
            toolchain_manifest_path=str(manifest),
        )
    finally:
        engine.close()

    assert seen, "no seam reported the deadline it was handed"
    assert set(seen) == {id(carried)}


def test_the_cli_takes_its_deadline_from_the_lease_and_nowhere_else():
    """``main`` must not rebuild the arithmetic ``lease_deadline`` owns.

    Two clauses, because a sweep showed the first alone was not enough: keeping
    the ``lease_deadline`` call while assigning over ``arguments.lease_seconds``
    beforehand would still cap the run, and the call check cannot see that.
    """

    source_root = pathlib.Path(refine_lifecycle.__file__).parent
    tree = ast.parse((source_root / "refine_lifecycle.py").read_text())
    main_node = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "main"
    )
    called = {
        node.func.id
        for node in ast.walk(main_node)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    }
    assert "lease_deadline" in called

    # Nothing in ``main`` may overwrite the parsed lease before it is used.
    rebound = {
        target.attr
        for node in ast.walk(main_node)
        if isinstance(node, ast.Assign)
        for target in node.targets
        if isinstance(target, ast.Attribute)
        and isinstance(target.value, ast.Name)
        and target.value.id == "arguments"
    }
    assert rebound == set(), f"main reassigns parsed CLI arguments: {rebound}"


def test_the_cli_default_lease_buys_more_than_the_old_four_minute_cap():
    """The default is a lease, and the lease is what the deadline follows."""

    from patina_scan_worker.refine_lifecycle import (
        DEFAULT_LEASE_SECONDS,
        build_argument_parser,
        lease_deadline,
    )

    assert DEFAULT_LEASE_SECONDS == 3600.0
    arguments = build_argument_parser().parse_args(
        [
            "--bundle-dir", "/b", "--scratch-dir", "/s", "--publish-dir", "/p",
            "--user-id", "u", "--scan-id", "s", "--task-id", "t",
            "--lease-id", "l", "--room-file-id", "r",
        ]
    )
    assert arguments.lease_seconds == 3600.0
    deadline = lease_deadline(arguments.lease_seconds, now_monotonic_s=0.0)
    assert deadline.expires_at_monotonic_s == pytest.approx(3540.0)
    # The number the old unconditional cap would have produced instead.
    assert deadline.expires_at_monotonic_s != pytest.approx(240.0)


def test_the_cli_lease_flag_is_honoured_end_to_end():
    from patina_scan_worker.refine_lifecycle import (
        build_argument_parser,
        lease_deadline,
    )

    arguments = build_argument_parser().parse_args(
        [
            "--bundle-dir", "/b", "--scratch-dir", "/s", "--publish-dir", "/p",
            "--user-id", "u", "--scan-id", "s", "--task-id", "t",
            "--lease-id", "l", "--room-file-id", "r",
            "--lease-seconds", "5400",
        ]
    )
    assert arguments.lease_seconds == 5400.0
    deadline = lease_deadline(arguments.lease_seconds, now_monotonic_s=0.0)
    assert deadline.expires_at_monotonic_s == pytest.approx(5340.0)


def test_no_loop_in_the_lifecycle_waits_without_consulting_the_deadline():
    """An unbounded wait escapes the lease as surely as a fresh clock does.

    Every ``while`` in this module reads bytes from something -- a descriptor, a
    source file, a socket-free copy -- and any of them can stall.  Each must
    consult the carried deadline inside its own body, not merely before or after
    it.  Structural rather than behavioural on purpose: a stall that only a real
    slow disk produces is not something a fixture can stage, but a loop written
    without the check is something the source can be read for.
    """

    source_root = pathlib.Path(refine_lifecycle.__file__).parent
    tree = ast.parse((source_root / "refine_lifecycle.py").read_text())
    loops = [node for node in ast.walk(tree) if isinstance(node, ast.While)]
    assert len(loops) == 5, "a loop was added or removed; check it consults the deadline"

    for loop in loops:
        names = {
            inner.attr
            for inner in ast.walk(loop)
            if isinstance(inner, ast.Attribute)
        } | {
            inner.id for inner in ast.walk(loop) if isinstance(inner, ast.Name)
        }
        assert "remaining_seconds" in names or "_checkpoint" in names, (
            f"the while loop at line {loop.lineno} can spin without checking the "
            "carried deadline"
        )


# ===========================================================================
# The gauge-invariant shape floor (R119 ruling 1)
#
# The movement floor above refuses a child that republishes ``request.frames``.
# It cannot refuse a child that returns those frames carried by a rigid motion
# or a similarity: every pose then differs from the submitted one while no
# camera has moved relative to any other.  The tests below CONSTRUCT both of
# those children and show they are refused -- and, first, show that the fixture
# engine models an adjustment rather than a re-gauging, because against an
# engine that applies a pure similarity no floor above machine epsilon could
# exist at all.
# ===========================================================================
def test_the_recorded_engine_models_an_adjustment_and_not_a_re_gauging(tmp_path):
    """The measurement the whole floor rests on, taken rather than asserted.

    The engine perturbs each camera along a field with NO component in the
    similarity group's tangent space, then applies the alignment similarity.  Two
    consequences are both checked here because either failing alone would make
    every test below vacuous:

      1. the parent's own Horn solve still recovers the DECLARED transform to
         float noise -- so the fixture did not buy its shape change by making
         the alignment disagree, and item 6's three agreement clauses are still
         being cleared with margin; and
      2. the residual it leaves is the RMS of that field, four decades above the
         floor and nearly two below the ceiling.

    The numbers are written out literally.  Reading them off the fixture's own
    constants would make this a tautology.
    """

    report, _engine, _sink, _scratch = _run(tmp_path)
    verification = report.alignment_verification

    # (1) The declared similarity is still recovered exactly.
    assert verification.scale_relative_difference < 1.0e-14
    assert verification.rotation_angle_difference_rad < 1.0e-14
    assert verification.translation_difference_m < 1.0e-14

    # (2) ... and the shape really changed.  2.0e-2 m of field, carried through a
    # 1.004 scale, is 2.008e-2 m of residual; the band is wide enough to survive
    # a different libm and narrow enough that a collapsed field fails it.
    assert 2.0e-2 < verification.fit_rmse_m < 2.1e-2
    assert verification.seed_rms_radius_m > 1.9

    # The aligned orientations moved too, so clause 15 is exercised against a
    # real number instead of against zero.
    assert 1.0e-3 < verification.max_aligned_orientation_change_rad < 2.0e-3

    # And the poses moved away from the submitted ones, which is what the
    # movement floor measures and why BOTH clauses pass on the happy path.
    assert report.refined_pose_movement.max_center_movement_m > 1.0e-3
    assert report.refined_pose_movement.max_rotation_movement_rad > 1.0e-3


def _degenerate_child_snapshots(mode: str):
    """Build the aligned model a degenerate child would ship, without running.

    Returns ``(aligned_snapshot, stand_in_frames)`` so a test can ask what the
    MOVEMENT floor alone makes of it.  The rows come from the same
    ``_RecordedEngine`` construction the composed run uses, so this cannot
    describe a child the composed test does not actually produce.
    """

    rows = _anchor_rows()
    engine = _RecordedEngine(
        pathlib.Path("/nonexistent-never-written"),
        (),
        seed_rows=rows,
        alignment_mode=mode,
    )
    return (
        _snapshot_from_rows(engine._aligned_rows, "aligned"),
        _stand_in_frames(rows),
    )


@pytest.mark.parametrize("mode", ["similarity", "rigid"])
def test_the_movement_floor_alone_accepts_the_seed_under_a_similarity(mode):
    """The gap, demonstrated before it is closed.

    This is the anti-vacuity control for the two tests below: if the movement
    floor already refused these children, refusing them again would prove
    nothing about the shape floor.  It does not refuse them -- it RETURNS, with
    centimetres of movement on every camera.
    """

    from patina_scan_worker.refine_lifecycle import require_refined_poses_moved

    aligned, frames = _degenerate_child_snapshots(mode)
    movement = require_refined_poses_moved(aligned, frames, deadline=_deadline())
    assert movement.max_center_movement_m > 1.0e-2
    assert movement.max_rotation_movement_rad > 1.0e-2


def test_a_child_that_returns_the_seed_under_a_similarity_is_refused(tmp_path):
    """Defeats every clause that existed before the shape floor.

    The child takes the seed the parent submitted, scales it by 1.004, rotates
    it by 0.012 rad and translates it by 4.3 cm, and ships that as the aligned
    result with the matching proposal.  The digest binding is satisfied, the
    anchor is satisfied, the movement floor is satisfied (proved directly
    above), all seventeen of item 6's clauses are satisfied -- and the cameras
    never moved with respect to each other.
    """

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, engine_kwargs={"alignment_mode": "similarity"})
    assert raised.value.code == "REFINE_UNCHANGED_EVIDENCE"
    assert "refined nothing in the gauge-invariant sense" in str(raised.value)


def test_a_child_that_returns_the_seed_under_a_rigid_motion_is_refused(tmp_path):
    """The same defect with the scale removed, so no scale clause can catch it.

    Carried separately because a reader may assume ``ALIGNED_GAUGE_MAX_SCALE_
    DEVIATION`` is what refuses the similarity case.  It is not: at scale exactly
    1.0 that clause reads zero, every other gauge margin shrinks, and the run is
    still refused -- by the residual, which is the only quantity that was ever
    looking at shape.
    """

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, engine_kwargs={"alignment_mode": "rigid"})
    assert raised.value.code == "REFINE_UNCHANGED_EVIDENCE"
    assert "refined nothing in the gauge-invariant sense" in str(raised.value)


@pytest.mark.parametrize("mode", ["similarity", "rigid"])
def test_item_six_accepts_the_re_gauged_model_this_composition_refuses(mode):
    """WHY the floor lives at the publish seam and not in item 6, again.

    A similarity of a model IS a self-consistent alignment of that model, so
    item 6 returns a verification rather than refusing -- and the residual it
    returns is float64 noise, which is the measurement the floor's lower bound
    is derived from.  Item 6's own scope is whether the child agreed with
    itself; whether the run refined anything is a decision about publishing.
    """

    from patina_scan_worker.refine_model_alignment import (
        ProposedAlignment,
        verify_child_alignment_proposal,
    )

    scale = 1.0 if mode == "rigid" else _ALIGNED_SCALE
    rows = _anchor_rows()
    seed = _snapshot_from_rows(rows, "seed")
    aligned = _snapshot_from_rows(_apply_similarity(rows, scale=scale), "aligned")
    verification = verify_child_alignment_proposal(
        seed=seed,
        raw_pre_ba=seed,
        aligned=aligned,
        proposal=ProposedAlignment(
            scale=scale,
            rotation=_ALIGNED_ROTATION,
            translation=_ALIGNED_TRANSLATION,
            raw_pose_digest_sha256=canonical_pose_digest(seed),
            aligned_pose_digest_sha256=canonical_pose_digest(aligned),
        ),
        deadline=_deadline(),
    )
    # It accepted.  Its residual is the NOISE BAND the floor sits ten decades
    # above -- a band, not a value: the last bits depend on the platform's libm.
    assert verification.fit_rmse_m < 1.0e-13
    assert verification.seed_rms_radius_m > 1.9


def test_the_shape_floor_is_the_anchor_tolerance_itself():
    """The threshold is not a new number; it is the anchor's own tolerance.

    The anchor says a camera within this distance of the submitted one IS the
    submitted one.  The shape floor says the same of a whole CONFIGURATION.  If
    these diverge, the module calls one displacement 'identical' in one function
    and 'a refinement' in another.
    """

    from patina_scan_worker.refine_lifecycle import (
        REFINED_MODEL_MIN_SHAPE_CHANGE_M,
        REFINED_POSE_MIN_CENTER_MOVEMENT_M,
    )

    assert REFINED_MODEL_MIN_SHAPE_CHANGE_M == SEED_ANCHOR_MAX_CENTER_DRIFT_M
    assert REFINED_MODEL_MIN_SHAPE_CHANGE_M == REFINED_POSE_MIN_CENTER_MOVEMENT_M
    assert REFINED_MODEL_MIN_SHAPE_CHANGE_M == 1.0e-6


def test_the_shape_floor_clears_the_measured_similarity_noise():
    """The lower half of the derivation, measured rather than argued.

    The parent's recomputation on a model that really is a similarity of its
    seed leaves a residual proportional to the trajectory's own extent: this
    1.926 m fixture leaves order 1e-16 m.  ``POSE_DIGEST_MAX_TRANSLATION_M``
    bounds any parsable trajectory at 1e6 m, so scaling that coefficient to the
    largest admissible model still leaves the worst-case noise decades below the
    floor.  The arithmetic is written out here so a change to either constant
    has to be re-argued.
    """

    from patina_scan_worker.refine_lifecycle import REFINED_MODEL_MIN_SHAPE_CHANGE_M
    from patina_scan_worker.refine_model_alignment import (
        POSE_DIGEST_MAX_TRANSLATION_M,
        ProposedAlignment,
        verify_child_alignment_proposal,
    )

    rows = _anchor_rows()
    seed = _snapshot_from_rows(rows, "seed")
    aligned = _snapshot_from_rows(_apply_similarity(rows), "aligned")
    verification = verify_child_alignment_proposal(
        seed=seed,
        raw_pre_ba=seed,
        aligned=aligned,
        proposal=ProposedAlignment(
            scale=_ALIGNED_SCALE,
            rotation=_ALIGNED_ROTATION,
            translation=_ALIGNED_TRANSLATION,
            raw_pose_digest_sha256=canonical_pose_digest(seed),
            aligned_pose_digest_sha256=canonical_pose_digest(aligned),
        ),
        deadline=_deadline(),
    )

    noise_per_metre = verification.fit_rmse_m / verification.seed_rms_radius_m
    assert noise_per_metre < 1.0e-14
    worst_case_noise = noise_per_metre * POSE_DIGEST_MAX_TRANSLATION_M
    assert worst_case_noise < REFINED_MODEL_MIN_SHAPE_CHANGE_M / 100.0


def test_the_shape_floor_can_never_cross_the_shape_ceiling():
    """The acceptance band is non-empty for EVERY model item 6 will parse.

    The ceiling is a fraction of the seed radius, so it shrinks with the child's
    own trajectory; the floor is absolute.  If they ever crossed, every run on a
    small enough model would be refused twice over and no input could reach
    either clause honestly.  The conditioning gate is what stops that: it bounds
    the seed radius below by ``sqrt(3) * ALIGNMENT_MIN_PRINCIPAL_EXTENT_M``,
    because the RMS radius of a point set is at least ``sqrt(3)`` times its
    weakest principal spread.
    """

    from patina_scan_worker.refine_lifecycle import REFINED_MODEL_MIN_SHAPE_CHANGE_M
    from patina_scan_worker.refine_model_alignment import (
        ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION,
        ALIGNMENT_MIN_PRINCIPAL_EXTENT_M,
    )

    smallest_radius = math.sqrt(3.0) * ALIGNMENT_MIN_PRINCIPAL_EXTENT_M
    smallest_ceiling = ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION * smallest_radius
    assert smallest_ceiling > REFINED_MODEL_MIN_SHAPE_CHANGE_M * 100.0


def _verification_with(**overrides):
    """A ``ParentAlignmentVerification`` carrying a chosen residual.

    The class is public, frozen and has no ``__post_init__``, so this is a value
    a caller really can hand the floor -- not a monkeypatch.
    """

    fields = {
        "transform": Sim3.identity(),
        "raw_pose_digest_sha256": "0" * 64,
        "aligned_pose_digest_sha256": "1" * 64,
        "correspondences": 12,
        "scale_relative_difference": 0.0,
        "rotation_angle_difference_rad": 0.0,
        "translation_difference_m": 0.0,
        "gauge_scale_deviation": 0.0,
        "gauge_rotation_rad": 0.0,
        "gauge_translation_m": 0.0,
        "fit_rmse_m": 1.0,
        "max_aligned_orientation_change_rad": 0.0,
        "seed_rms_radius_m": 2.0,
        "max_raw_pose_drift_m": 0.0,
        "max_raw_rotation_drift_rad": 0.0,
        "seed_min_principal_extent_m": 1.0,
        "aligned_min_principal_extent_m": 1.0,
    }
    fields.update(overrides)
    return ParentAlignmentVerification(**fields)


@pytest.mark.parametrize("factor", [0.0, 0.5, 1.0])
def test_shape_change_at_or_below_the_floor_is_a_re_gauging(factor):
    """A residual of at most the floor is refused, including exactly zero."""

    from patina_scan_worker.refine_lifecycle import (
        REFINED_MODEL_MIN_SHAPE_CHANGE_M,
        require_refined_shape_changed,
    )

    with pytest.raises(AdapterError) as raised:
        require_refined_shape_changed(
            _verification_with(
                fit_rmse_m=factor * REFINED_MODEL_MIN_SHAPE_CHANGE_M
            ),
            deadline=_deadline(),
        )
    assert raised.value.code == "REFINE_UNCHANGED_EVIDENCE"
    assert "refined nothing in the gauge-invariant sense" in str(raised.value)


def test_shape_change_just_above_the_floor_is_accepted():
    """The other side of the boundary, so the constant cannot be widened either."""

    from patina_scan_worker.refine_lifecycle import (
        REFINED_MODEL_MIN_SHAPE_CHANGE_M,
        require_refined_shape_changed,
    )

    residual = math.nextafter(REFINED_MODEL_MIN_SHAPE_CHANGE_M, math.inf)
    change = require_refined_shape_changed(
        _verification_with(fit_rmse_m=residual),
        deadline=_deadline(),
    )
    assert change.fit_rmse_m == residual
    assert change.floor_m == REFINED_MODEL_MIN_SHAPE_CHANGE_M
    assert change.seed_rms_radius_m == 2.0


def test_the_shape_floor_consults_the_carried_deadline_before_it_accepts():
    """An expired lease refuses even a residual that clears the floor.

    Without this the function's one checkpoint would be a clause no deletion
    could redden: every other test hands it a live deadline, and the accepting
    path would return happily on an expired one.
    """

    from patina_scan_worker.refine_lifecycle import require_refined_shape_changed

    with pytest.raises(AdapterError) as raised:
        require_refined_shape_changed(
            _verification_with(fit_rmse_m=2.0e-2),
            deadline=RefineDeadline(time.monotonic() - 1.0),
        )
    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
    assert "deadline is exhausted" in str(raised.value)


def test_the_shape_floor_refuses_a_verification_it_did_not_get_from_item_six():
    from patina_scan_worker.refine_lifecycle import require_refined_shape_changed

    class _Lookalike:
        fit_rmse_m = 1.0
        seed_rms_radius_m = 2.0

    with pytest.raises(AdapterError) as raised:
        require_refined_shape_changed(_Lookalike(), deadline=_deadline())
    assert "requires the parent's own alignment verification" in str(raised.value)


def test_the_shape_floor_refuses_a_deadline_that_is_not_the_carried_one():
    from patina_scan_worker.refine_lifecycle import require_refined_shape_changed

    class _Lookalike:
        def remaining_seconds(self):  # pragma: no cover - never reached
            return 60.0

    with pytest.raises(AdapterError) as raised:
        require_refined_shape_changed(_verification_with(), deadline=_Lookalike())
    assert "requires the carried refine deadline" in str(raised.value)


@pytest.mark.parametrize(
    "floor", [0.0, -1.0e-6, float("nan"), float("inf"), True, False, "1e-6", None]
)
def test_the_shape_floor_refuses_a_nonsense_threshold(floor):
    from patina_scan_worker.refine_lifecycle import require_refined_shape_changed

    with pytest.raises(AdapterError) as raised:
        require_refined_shape_changed(
            _verification_with(),
            deadline=_deadline(),
            min_shape_change_m=floor,
        )
    assert "shape change floor must be finite positive" in str(raised.value)


@pytest.mark.parametrize(
    "residual", [float("nan"), float("inf"), float("-inf"), -1.0e-9, True, "0.02", None]
)
def test_the_shape_floor_refuses_a_residual_that_is_not_a_distance(residual):
    """``nan <= floor`` is ``False``, so an unguarded NaN would PASS the floor.

    ``True`` is here for the same reason: ``bool`` is an ``int``, and
    ``True <= 1e-6`` is ``False``, so a residual of ``True`` would also sail
    through a bare comparison.
    """

    from patina_scan_worker.refine_lifecycle import require_refined_shape_changed

    with pytest.raises(AdapterError) as raised:
        require_refined_shape_changed(
            _verification_with(fit_rmse_m=residual),
            deadline=_deadline(),
        )
    assert raised.value.code == "REFINE_UNCHANGED_EVIDENCE"
    assert "not a finite non-negative distance" in str(raised.value)


def test_the_report_records_the_shape_change_and_the_floor_it_cleared(tmp_path):
    report, _engine, _sink, _scratch = _run(tmp_path)
    document = report.to_document()

    shape = document["refinedShapeChange"]
    assert shape["fitRmseMeters"] == report.alignment_verification.fit_rmse_m
    assert shape["floorMeters"] == 1.0e-6
    assert shape["fitRmseMeters"] > shape["floorMeters"]
    assert shape["seedRmsRadiusMeters"] > 1.9


# ---------------------------------------------------------------------------
# Clauses a mutation sweep found deletable with zero red, now falsifiable
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "payload",
    [-1, True, False, 1.0, "512", None, 2**64 + 0.5],
)
def test_the_ustar_member_arithmetic_refuses_a_nonsense_payload_size(payload):
    from patina_scan_worker.refine_lifecycle import ustar_member_bytes

    with pytest.raises(AdapterError) as raised:
        ustar_member_bytes(payload)
    assert "non-negative integer payload size" in str(raised.value)


def _hand_built_packet(tmp_path, *, chunks, digests):
    """A BuiltColmapPacket assembled by hand, not by the writer.

    The dataclass is public and frozen, so a caller really can hand
    ``pinned_packet_files`` a packet the builder would never have produced.
    That is the only way these two clauses are reachable, and it is a real way.
    """

    from patina_scan_worker.refine_lifecycle import BuiltColmapPacket

    manifest = tmp_path / "packet-manifest-v1.json"
    manifest.write_bytes(b"{}")
    return BuiltColmapPacket(
        manifest_path=manifest,
        chunk_paths=tuple(chunks),
        manifest_sha256="a" * 64,
        chunk_sha256s=tuple(digests),
        run_id="b" * 64,
        engine_request_sha256="c" * 64,
        child_request={},
    )


def test_pinning_refuses_a_packet_whose_chunks_and_digests_disagree(tmp_path):
    from patina_scan_worker.refine_lifecycle import pinned_packet_files

    chunk = tmp_path / "packet.chunk.000.tar"
    chunk.write_bytes(b"\x00" * 1024)
    packet = _hand_built_packet(tmp_path, chunks=[chunk, chunk], digests=["d" * 64])

    with pytest.raises(AdapterError) as raised:
        with pinned_packet_files(packet, deadline=_deadline()):
            pass
    assert "chunk paths and digests disagree in number" in str(raised.value)


def test_pinning_refuses_a_packet_with_more_chunks_than_the_boundary_allows(tmp_path):
    """64 chunks plus the manifest is 65 pinned files; the ceiling is 64."""

    from patina_scan_worker.refine_lifecycle import pinned_packet_files

    chunk = tmp_path / "packet.chunk.000.tar"
    chunk.write_bytes(b"\x00" * 1024)

    inside = _hand_built_packet(
        tmp_path, chunks=[chunk] * 63, digests=["d" * 64] * 63
    )
    assert inside.pinned_file_count == 64
    with pinned_packet_files(inside, deadline=_deadline()) as pinned:
        # All 63 point at one file, so the token map collapses; what matters is
        # that the count clause let it through.
        assert len(pinned) <= 64

    over = _hand_built_packet(tmp_path, chunks=[chunk] * 64, digests=["d" * 64] * 64)
    assert over.pinned_file_count == 65
    with pytest.raises(AdapterError) as raised:
        with pinned_packet_files(over, deadline=_deadline()):
            pass
    assert "more pinned files than the native boundary allows" in str(raised.value)


@pytest.mark.parametrize("ceiling", [8192, 16384, 32768, 65536])
def test_the_planner_predicts_the_bytes_the_writer_actually_writes(tmp_path, ceiling):
    """The tie between the arithmetic and the bytes, at four ceilings.

    This is what replaced three parent-side post-write assertions that no
    deletion could redden.  It compares the planner's predicted per-chunk sizes
    against the sizes on disk, so a writer that stopped matching its own plan
    reddens here instead of nowhere.
    """

    from patina_scan_worker.refine_lifecycle import plan_packet_chunks

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir()
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)
    bundle = _Bundle(bundle_root)
    materialization = _materialize(bundle, scratch, _deadline())
    try:
        packet = build_colmap_packet(
            materialization,
            destination=scratch / f"packet-{ceiling}",
            gpu_index="0",
            run_id="d" * 64,
            deadline=_deadline(),
            chunk_max_bytes=ceiling,
        )
        document = json.loads(packet.manifest_path.read_bytes())
        # The planner is fed the SAME ordered member sizes the writer used, read
        # back out of the manifest in its declared order rather than rebuilt
        # from a guess about which members exist.  That is what keeps this test
        # honest now that the packet carries two ledgers as well as the request.
        plan = plan_packet_chunks(
            [row["sizeBytes"] for row in document["members"]],
            chunk_max_bytes=ceiling,
        )
        actual = [path.stat().st_size for path in packet.chunk_paths]
        assert list(plan.chunk_sizes) == actual
        assert plan.total_chunk_bytes == sum(actual)
        assert len(plan.groups) == len(packet.chunk_paths)
        assert max(actual) <= ceiling
    finally:
        materialization.cleanup()


# ===========================================================================
# BLOCKING 3: the pinned capture raster profile (R119 ruling 3)
#
# I99 qualified ONE encoded raster profile on the physical device -- 1440x1920,
# the .right rotation of a 1920x1440 ARKit format -- and R119 ruling 3 admits
# that profile on the composed path and nothing else.  It rejected a
# receipt-lookup admitting a set of profiles and it rejected an operator
# override, both by name.
#
# The tests below do three separate things and none of them substitutes for
# another: they pin the constant to I99's own measured artifact (so a typo
# reddens), they CONSTRUCT the refusal for other profiles through the real
# adapter (so the fail-closed claim is exercised rather than asserted), and they
# read the CLI surface for any way to widen it (so "no override" is checked
# rather than promised).
# ===========================================================================
_I99_RECEIPT_SHA256 = (
    "f48fa56d905a8e57dac152c6d79c797f9060fe9421c18f449536708234ff1775"
)
_I99_MATERIALIZED_PPM_SHA256 = (
    "50dccb8a57741c4249a1db11fa3d49cd012dddaafb37b0d3f5ccbda74d116d2f"
)
#: The byte count and header I99 recorded for the PPM its receipt materialized.
#: Written out literally: reading them off the module would make every assertion
#: below a tautology.
_I99_MATERIALIZED_PPM_BYTES = 8_294_417
_I99_MATERIALIZED_PPM_HEADER = b"P6\n1440 1920\n255\n"
#: The helper source I99 was taken against (I98's protocol-v3 bytes).
_I99_HELPER_SOURCE_SHA256 = (
    "3b184937b755dc4acca4347ea6dba43dbeb111f090a91cd340e65d214937c626"
)


def test_the_pinned_profile_is_the_one_i99_qualified_and_only_that_one():
    from patina_scan_worker.field_raster_materializer import FieldRasterProfile
    from patina_scan_worker.refine_lifecycle import (
        QUALIFIED_CAPTURE_RASTER_HELPER_SOURCE_SHA256,
        QUALIFIED_CAPTURE_RASTER_MATERIALIZED_PPM_SHA256,
        QUALIFIED_CAPTURE_RASTER_PROFILE,
        QUALIFIED_CAPTURE_RASTER_RECEIPT_SHA256,
    )

    assert QUALIFIED_CAPTURE_RASTER_PROFILE == FieldRasterProfile(1440, 1920)
    assert QUALIFIED_CAPTURE_RASTER_RECEIPT_SHA256 == _I99_RECEIPT_SHA256
    assert (
        QUALIFIED_CAPTURE_RASTER_MATERIALIZED_PPM_SHA256
        == _I99_MATERIALIZED_PPM_SHA256
    )
    assert (
        QUALIFIED_CAPTURE_RASTER_HELPER_SOURCE_SHA256 == _I99_HELPER_SOURCE_SHA256
    )


def test_the_pinned_profile_reproduces_the_receipts_own_materialized_ppm():
    """The constant is checked against a MEASURED artifact, not against itself.

    I99's receipt materialized 8_294_417 bytes under the header
    ``P6\\n1440 1920\\n255\\n``.  Exactly one profile implies both, so a mistyped
    constant -- 1440x1290, 1400x1920 -- cannot satisfy this.
    """

    from patina_scan_worker.refine_lifecycle import (
        QUALIFIED_CAPTURE_RASTER_MATERIALIZED_PPM_BYTES,
        QUALIFIED_CAPTURE_RASTER_PROFILE,
    )

    assert QUALIFIED_CAPTURE_RASTER_PROFILE.ppm_size == _I99_MATERIALIZED_PPM_BYTES
    assert QUALIFIED_CAPTURE_RASTER_PROFILE.ppm_header == _I99_MATERIALIZED_PPM_HEADER
    assert (
        QUALIFIED_CAPTURE_RASTER_MATERIALIZED_PPM_BYTES == _I99_MATERIALIZED_PPM_BYTES
    )
    # 17 header bytes + 1440*1920*3, both halves stated so a change to either
    # moves a number rather than cancelling out.
    assert len(_I99_MATERIALIZED_PPM_HEADER) == 17
    assert 1440 * 1920 * 3 == 8_294_400


def test_a_profile_that_stops_matching_the_receipt_fails_the_composed_path_closed(
    monkeypatch,
):
    """The RUNTIME half of the check above, which a mutation sweep found vacuous.

    The assertion above compares two constants that agree in the shipped tree,
    so deleting the guard that compares them at run time reddened nothing --
    exactly the "clause no input can reach" this program keeps finding.  The
    condition is a divergence between two source constants and no input
    produces it, so one of them is moved directly, the same way the helper-source
    and posture-flag clauses are exercised.  The guard is kept rather than
    deleted because it is the thing that refuses a RUN, where the assertion only
    refuses a commit.
    """

    from patina_scan_worker.refine_lifecycle import (
        LIFECYCLE_RASTER_UNQUALIFIED_CODE,
        require_qualified_raster_profile,
    )

    monkeypatch.setattr(
        refine_lifecycle,
        "QUALIFIED_CAPTURE_RASTER_MATERIALIZED_PPM_BYTES",
        _I99_MATERIALIZED_PPM_BYTES + 1,
    )
    with pytest.raises(AdapterError) as failure:
        require_qualified_raster_profile(_PrematerializedRaster())
    assert failure.value.code == LIFECYCLE_RASTER_UNQUALIFIED_CODE
    assert "the qualification receipt measured" in str(failure.value)
    assert "8294417 PPM bytes" in str(failure.value)


def test_the_pinned_profile_is_inside_every_bound_the_adapter_enforces():
    """A pin the materializer would refuse is not a pin, it is a deferred outage."""

    from patina_scan_worker.field_raster_materializer import (
        _MAX_PROFILE_DIMENSION,
        _MAX_PROFILE_PPM_BYTES,
    )
    from patina_scan_worker.refine_lifecycle import QUALIFIED_CAPTURE_RASTER_PROFILE

    assert QUALIFIED_CAPTURE_RASTER_PROFILE.width <= _MAX_PROFILE_DIMENSION
    assert QUALIFIED_CAPTURE_RASTER_PROFILE.height <= _MAX_PROFILE_DIMENSION
    assert QUALIFIED_CAPTURE_RASTER_PROFILE.ppm_size <= _MAX_PROFILE_PPM_BYTES
    # ... and inside the per-pinned-file ceiling the frozen child enforces, so a
    # single frame can always cross the native boundary.
    assert QUALIFIED_CAPTURE_RASTER_PROFILE.ppm_size <= _NATIVE_PINNED_FILE_CEILING


def test_the_posture_flag_surface_is_exactly_what_the_program_has_established():
    """The posture surface, READ rather than described.

    R121 widened this in two ways at once and both matter.

    First, the SCAN.  It used to match only names ending ``_QUALIFIED``, and
    three module-level posture booleans do not --
    ``EVIDENCE_BUILDER_CONTRACT_COMPATIBLE``,
    ``PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE`` and
    ``NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT``.  All three were
    invisible to the check that existed to make a quiet flip impossible.  The
    scan is now every module-level ``UPPER_NAME = True/False`` in the package,
    identity-compared so ``0`` and ``1`` are not mistaken for booleans.

    Second, the EXPECTED SET.  It is compared for EQUALITY in both directions:
    a new true flag reddens, and a flag silently dropped from the package
    reddens too.
    """

    package_root = pathlib.Path(refine_lifecycle.__file__).parent
    true_flags: dict[str, str] = {}
    false_flags: dict[str, str] = {}
    for source in sorted(package_root.glob("*.py")):
        tree = ast.parse(source.read_text())
        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            if not isinstance(node.value, ast.Constant):
                continue
            if node.value.value is not True and node.value.value is not False:
                continue
            for target in node.targets:
                if not isinstance(target, ast.Name) or not target.id.isupper():
                    continue
                bucket = true_flags if node.value.value is True else false_flags
                bucket[f"{source.name}:{target.id}"] = target.id

    # WHAT IS TRUE, and the one sentence each rests on.  Every entry here was
    # established by R121's run of the real COLMAP 4.0.2 engine on scan
    # 004aa5b0 on the qualified host, except the two noted.
    assert set(true_flags.values()) == {
        # I99's physical-device raster receipt (unchanged since I100).
        "FIELD_RASTER_CAPTURE_PROFILE_QUALIFIED",
        # Item 5's measured byte-freeze (unchanged since I97).
        "NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS",
        # A real packet extracted inside the child and consumed by COLMAP.
        "PACKET_EXTRACTION_QUALIFIED",
        # Seven real engine artifacts crossed the boundary, parent-hashed.
        "OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED",
        # The child built the aligned model; the parent re-solved and agreed.
        "ALIGNED_MODEL_BUILD_QUALIFIED",
        "PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE",
        "NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT",
        # The evidence builder consumed real snapshots and reached the verdict.
        "EVIDENCE_BUILDER_CONTRACT_COMPATIBLE",
        # This one rests on a CONSTRUCTED test, not the host run: it names a
        # property of the guard, not of the box.
        "COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED",
    }
    # The flags R121 did NOT move, named individually so a flip reddens here
    # rather than in a report nobody re-reads.  ``PRIMARY_EXECUTION_QUALIFIED``
    # is the load-bearing one: the plan executed end to end on the host and was
    # then REFUSED by ``evaluate_refinement_evidence``, so no run has ever
    # produced an accepted refinement and the flag stays down.
    for expected in (
        "REFINE_LIFECYCLE_QUALIFIED",
        "REFINE_LIFECYCLE_STAGE_REGISTERED",
        "PILOT_200_400_FRAME_RANGE_QUALIFIED",
        "PRIMARY_EXECUTION_QUALIFIED",
        "RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED",
        "SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED",
        "MEASUREMENT_SNAPSHOT_QUALIFIED",
        "FALLBACK_QUALIFIED",
        "TOOLCHAIN_POLICY_QUALIFIED",
        "EXECUTABLE_IDENTITY_QUALIFIED",
        "COMMAND_ENVIRONMENT_QUALIFIED",
        "SNAPSHOT_ARTIFACT_HANDOFF_QUALIFIED",
    ):
        assert expected in false_flags.values(), f"{expected} is no longer False"


def test_withdrawing_the_receipt_admits_no_profile_rather_than_every_profile(
    monkeypatch,
):
    """The posture flag GATES the pin; it is not a label on it.

    With no receipt in force the honest reading is "no profile is admissible",
    not "any profile is".  That is the state this module was in before I99, and
    the state it must return to if the receipt is withdrawn -- so even the
    qualified profile is refused here.

    There is no INPUT that withdraws a receipt, so the flag is moved directly;
    the value it holds in the shipped tree is asserted by
    ``test_exactly_one_qualification_flag_is_true_and_it_names_the_raster_profile``,
    which reads the source rather than the import.
    """

    from patina_scan_worker.refine_lifecycle import (
        LIFECYCLE_RASTER_UNQUALIFIED_CODE,
        QUALIFIED_CAPTURE_RASTER_PROFILE,
        require_qualified_raster_profile,
    )

    class _Qualified:
        profile = QUALIFIED_CAPTURE_RASTER_PROFILE

    # In force: the qualified profile is admitted.
    assert require_qualified_raster_profile(_Qualified()) is (
        QUALIFIED_CAPTURE_RASTER_PROFILE
    )

    monkeypatch.setattr(
        refine_lifecycle, "FIELD_RASTER_CAPTURE_PROFILE_QUALIFIED", False
    )
    for candidate in (_Qualified(), _PrematerializedRaster()):
        with pytest.raises(AdapterError) as failure:
            require_qualified_raster_profile(candidate)
        assert failure.value.code == LIFECYCLE_RASTER_UNQUALIFIED_CODE
        assert "admits none" in str(failure.value)


def test_the_receipt_still_covers_the_helper_source_that_is_actually_packaged():
    """CONSTRUCTED, not asserted: the .c file on disk is hashed here.

    I98 made re-qualification mandatory by construction -- editing
    ``field_raster_libheif.c`` moves its digest and I99's receipt stops covering
    the shipped helper.  Hashing the real file is what turns that into a red
    test the moment somebody edits it, rather than a note in a decision log.
    """

    from patina_scan_worker import field_raster_materializer
    from patina_scan_worker.refine_lifecycle import (
        QUALIFIED_CAPTURE_RASTER_HELPER_SOURCE_SHA256,
    )

    source = pathlib.Path(field_raster_materializer.__file__).with_name(
        "field_raster_libheif.c"
    )
    measured = hashlib.sha256(source.read_bytes()).hexdigest()
    assert measured == _I99_HELPER_SOURCE_SHA256
    assert measured == field_raster_materializer.QUALIFIED_HELPER_SOURCE_SHA256
    assert measured == QUALIFIED_CAPTURE_RASTER_HELPER_SOURCE_SHA256


def test_a_helper_source_edit_fails_the_composed_path_closed(monkeypatch):
    """The refusal clause for a stale receipt, exercised.

    There is no INPUT that produces this condition -- it is a divergence between
    two source constants -- so the packaged digest is moved directly.  The test
    above is the one that proves the constants agree in the shipped tree; this
    one proves the code does something about it when they do not.
    """

    from patina_scan_worker import field_raster_materializer
    from patina_scan_worker.refine_lifecycle import (
        LIFECYCLE_RASTER_UNQUALIFIED_CODE,
        require_qualified_raster_profile,
    )

    monkeypatch.setattr(
        field_raster_materializer, "QUALIFIED_HELPER_SOURCE_SHA256", "0" * 64
    )
    with pytest.raises(AdapterError) as failure:
        require_qualified_raster_profile(_PrematerializedRaster())
    assert failure.value.code == LIFECYCLE_RASTER_UNQUALIFIED_CODE
    assert "no longer covers the shipped helper" in str(failure.value)


def _packaged_adapter(scratch: Path, profile):
    """The REAL production adapter, at whatever profile a test wants to pin.

    The release prefix is a fixture because the shipped one is ``/opt``,
    root-owned, and installed by the operator -- not because the adapter is
    stubbed.  Every other line of it is the shipped one.

    ``scratch`` need not exist yet: the constructor takes no descriptor, so a
    caller may name the same directory ``_run`` will create.
    """

    from patina_scan_worker.field_raster_materializer import (
        PackagedLibheifFieldRasterMaterializer,
    )

    return PackagedLibheifFieldRasterMaterializer(
        scratch_parent=scratch,
        profile=profile,
    )


@pytest.mark.parametrize(
    "width,height,why",
    [
        (360, 640, "the profile I92 qualified and R118 superseded"),
        (1920, 1440, "the NATIVE landscape pair, unrotated"),
        (1080, 1920, "a plausible downscale R118 rejected"),
        (1441, 1920, "one pixel wide of the receipt"),
        (1440, 1921, "one pixel tall of the receipt"),
    ],
)
def test_every_profile_except_the_qualified_one_fails_the_composed_run_closed(
    tmp_path, width, height, why
):
    """CONSTRUCTED through the real adapter, one row per profile.

    The 360x640 row matters most: it is the profile that WAS qualified, by I92,
    and it is refused now.  A pin that only refused nonsense would prove nothing
    about a superseded receipt.
    """

    from patina_scan_worker.field_raster_materializer import FieldRasterProfile
    from patina_scan_worker.refine_lifecycle import LIFECYCLE_RASTER_UNQUALIFIED_CODE

    adapter = _packaged_adapter(
        tmp_path / "scratch", FieldRasterProfile(width, height)
    )
    with pytest.raises(AdapterError) as failure:
        _run(tmp_path, raster_materializer=adapter)
    assert failure.value.code == LIFECYCLE_RASTER_UNQUALIFIED_CODE
    assert f"{width}x{height}" in str(failure.value), why
    assert "1440x1920" in str(failure.value)


def test_the_unqualified_profile_is_refused_before_a_single_byte_is_acquired(tmp_path):
    """A run at an unqualified profile must not read the bundle first."""

    from patina_scan_worker.field_raster_materializer import FieldRasterProfile
    from patina_scan_worker.refine_lifecycle import (
        LIFECYCLE_RASTER_UNQUALIFIED_CODE,
        RefineLifecycleRequest,
        run_refine_lifecycle,
    )

    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir(parents=True)
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700, parents=True)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700, parents=True)
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")
    bundle = _Bundle(bundle_root)

    class _CountingAcquirer(LocalScratchArtifactAcquirer):
        calls = 0

        def acquire(self, **kwargs):
            type(self).calls += 1
            return super().acquire(**kwargs)

    acquirer = _CountingAcquirer(bundle_root)
    with pytest.raises(AdapterError) as failure:
        run_refine_lifecycle(
            RefineLifecycleRequest(
                user_id=USER_ID,
                scan_id=SCAN_ID,
                task_id=TASK_ID,
                lease_id=LEASE_ID,
                room_file_id=ROOM_FILE_ID,
                room_file_version=1,
                scratch_root=scratch,
                manifest=bundle.manifest,
                keyframe_index=bundle.index,
                keyframe_summary=bundle.summary,
                keyframes_archive=bundle.archive,
            ),
            acquirer=acquirer,
            raster_materializer=_packaged_adapter(
                scratch, FieldRasterProfile(360, 640)
            ),
            storage=LocalScratchStorageSink(publish),
            deadline=_deadline(),
            toolchain_manifest_path=str(manifest),
        )
    assert failure.value.code == LIFECYCLE_RASTER_UNQUALIFIED_CODE
    assert _CountingAcquirer.calls == 0
    assert list(scratch.iterdir()) == []
    assert list(publish.iterdir()) == []


def test_the_packaged_adapter_must_declare_a_profile_at_all(tmp_path):
    """A subclass that hides the declaration is refused, not silently admitted."""

    from patina_scan_worker.field_raster_materializer import (
        PackagedLibheifFieldRasterMaterializer,
    )
    from patina_scan_worker.refine_lifecycle import (
        LIFECYCLE_RASTER_UNQUALIFIED_CODE,
        QUALIFIED_CAPTURE_RASTER_PROFILE,
        require_qualified_raster_profile,
    )

    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700)

    class _Undeclared(PackagedLibheifFieldRasterMaterializer):
        @property
        def profile(self):
            return None

    adapter = _Undeclared(
        scratch_parent=scratch, profile=QUALIFIED_CAPTURE_RASTER_PROFILE
    )
    with pytest.raises(AdapterError) as failure:
        require_qualified_raster_profile(adapter)
    assert failure.value.code == LIFECYCLE_RASTER_UNQUALIFIED_CODE
    assert "without declaring a profile" in str(failure.value)


def test_a_declaration_that_is_not_a_field_raster_profile_is_refused():
    """A bare tuple compares unequal to nothing useful; refuse the TYPE."""

    from patina_scan_worker.refine_lifecycle import (
        LIFECYCLE_RASTER_UNQUALIFIED_CODE,
        require_qualified_raster_profile,
    )

    class _TupleProfile:
        profile = (1440, 1920)

    with pytest.raises(AdapterError) as failure:
        require_qualified_raster_profile(_TupleProfile())
    assert failure.value.code == LIFECYCLE_RASTER_UNQUALIFIED_CODE
    assert "must declare a FieldRasterProfile" in str(failure.value)


def test_a_stand_in_that_declares_no_profile_is_recorded_as_a_stand_in(tmp_path):
    """The report cannot be read as a qualified run when it was not one."""

    report, _engine, _sink, _scratch = _run(tmp_path)
    raster = report.to_document()["raster"]
    assert raster["adapter"] == "_PrematerializedRaster"
    assert raster["declaredProfile"] is None
    assert raster["qualifiedProfile"] == "1440x1920"
    assert raster["profileQualified"] is True
    assert raster["receiptSha256"] == _I99_RECEIPT_SHA256
    assert raster["helperSourceSha256"] == _I99_HELPER_SOURCE_SHA256


# ===========================================================================
# BLOCKING 4: the entry point that had never been executed
#
# ``main`` constructed ``PackagedLibheifFieldRasterMaterializer()`` with no
# arguments from item 7's first commit (64f31021) until this one.  It is a
# hand-typed entry point with no console script, and it had no test, so a
# TypeError sat on the only line that names the production raster adapter
# through two agents who found it, fixed it and reverted -- correctly, because a
# repair had to name a profile and none was qualified.  R119 ruling 3 supplies
# one.  These tests are what make the line executable rather than merely edited.
# ===========================================================================
def _cli_bundle(tmp_path: Path) -> tuple[Path, Path, Path, _Bundle]:
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir(parents=True)
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700, parents=True)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700, parents=True)
    bundle = _Bundle(bundle_root)
    (bundle_root / "sources.json").write_text(
        json.dumps(
            {
                "bundleManifest": {
                    "objectKey": bundle.manifest.object_key,
                    "sha256": bundle.manifest.sha256,
                    "sizeBytes": bundle.manifest.size_bytes,
                },
                "keyframeIndex": {
                    "objectKey": bundle.index.object_key,
                    "sha256": bundle.index.sha256,
                    "sizeBytes": bundle.index.size_bytes,
                },
                "keyframeSummary": {
                    "objectKey": bundle.summary.object_key,
                    "sha256": bundle.summary.sha256,
                    "sizeBytes": bundle.summary.size_bytes,
                },
                "keyframesArchive": {
                    "objectKey": bundle.archive.object_key,
                    "sha256": bundle.archive.sha256,
                    "sizeBytes": bundle.archive.size_bytes,
                },
            }
        )
    )
    return bundle_root, scratch, publish, bundle


def _cli_argv(bundle_root: Path, scratch: Path, publish: Path) -> list[str]:
    return [
        "--bundle-dir", str(bundle_root),
        "--scratch-dir", str(scratch),
        "--publish-dir", str(publish),
        "--user-id", USER_ID,
        "--scan-id", SCAN_ID,
        "--task-id", TASK_ID,
        "--lease-id", LEASE_ID,
        "--room-file-id", ROOM_FILE_ID,
    ]


def test_the_cli_really_constructs_the_production_raster_adapter(tmp_path):
    """The regression for the latent TypeError, executed rather than read.

    Before this composition the construction below raised ``TypeError:
    __init__() missing 2 required keyword-only arguments: 'scratch_parent' and
    'profile'``.  Nothing in the suite called it, so nothing was red.
    """

    from patina_scan_worker.field_raster_materializer import (
        PackagedLibheifFieldRasterMaterializer,
    )
    from patina_scan_worker.refine_lifecycle import (
        QUALIFIED_CAPTURE_RASTER_PROFILE,
        build_argument_parser,
        build_composed_invocation,
    )

    bundle_root, scratch, publish, bundle = _cli_bundle(tmp_path)
    arguments = build_argument_parser().parse_args(
        _cli_argv(bundle_root, scratch, publish)
    )
    invocation = build_composed_invocation(arguments)

    adapter = invocation.raster_materializer
    assert type(adapter) is PackagedLibheifFieldRasterMaterializer
    assert adapter.profile == QUALIFIED_CAPTURE_RASTER_PROFILE
    assert adapter.production_enablement == "disabled"
    # The adapter's private scratch lives under the SAME tree the composed run
    # cleans, not a second root nothing purges.
    assert adapter._scratch_parent == scratch.resolve()
    assert invocation.request.scratch_root == scratch.resolve()
    assert invocation.request.manifest == bundle.manifest
    assert invocation.request.keyframes_archive == bundle.archive
    assert type(invocation.storage) is LocalScratchStorageSink
    assert type(invocation.acquirer) is LocalScratchArtifactAcquirer
    # ... and the pin admits what the CLI built.
    from patina_scan_worker.refine_lifecycle import require_qualified_raster_profile

    assert require_qualified_raster_profile(adapter) == QUALIFIED_CAPTURE_RASTER_PROFILE


def test_the_cli_offers_no_way_to_name_another_profile():
    """R119 rejected an operator override by name.  Read the parser for one."""

    from patina_scan_worker.refine_lifecycle import build_argument_parser

    parser = build_argument_parser()
    options = {
        option
        for action in parser._actions
        for option in action.option_strings
    }
    forbidden = ("profile", "width", "height", "resolution", "raster", "size")
    for option in options:
        assert not any(word in option.lower() for word in forbidden), option

    # ... and the one construction names the module constant rather than a
    # literal, so there is exactly one place a profile can be spelled.
    source_root = pathlib.Path(refine_lifecycle.__file__).parent
    tree = ast.parse((source_root / "refine_lifecycle.py").read_text())
    constructions = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "PackagedLibheifFieldRasterMaterializer"
    ]
    assert len(constructions) == 1, "more than one place constructs the adapter"
    profile_argument = next(
        keyword.value
        for keyword in constructions[0].keywords
        if keyword.arg == "profile"
    )
    assert isinstance(profile_argument, ast.Name)
    assert profile_argument.id == "QUALIFIED_CAPTURE_RASTER_PROFILE"


def test_main_fails_closed_when_the_qualified_toolchain_is_absent(tmp_path, capsys):
    """The whole entry point, run end to end, on the path a host takes today.

    The toolchain manifest generator is still owed by the operator (I97), so the
    pinned path is absent and ``main`` must return 2 with one diagnostic --
    having written nothing anywhere.
    """

    from patina_scan_worker.refine_lifecycle import (
        LIFECYCLE_TOOLCHAIN_MISSING_CODE,
        QUALIFIED_TOOLCHAIN_MANIFEST_PATH,
        main,
    )

    if os.path.exists(QUALIFIED_TOOLCHAIN_MANIFEST_PATH):
        pytest.skip(
            "the owner has installed the qualified toolchain manifest at "
            f"{QUALIFIED_TOOLCHAIN_MANIFEST_PATH}; this test measures its absence"
        )

    bundle_root, scratch, publish, _bundle = _cli_bundle(tmp_path)
    assert main(_cli_argv(bundle_root, scratch, publish)) == 2

    captured = capsys.readouterr()
    assert captured.out == ""
    assert "LOCAL SCRATCH ONLY" in captured.err
    # The banner states the profile, so an operator reading a terminal sees which
    # resolution the run would have used.
    assert "Raster profile: 1440x1920" in captured.err
    assert QUALIFIED_TOOLCHAIN_MANIFEST_PATH in captured.err
    assert LIFECYCLE_TOOLCHAIN_MISSING_CODE in captured.err
    assert list(publish.iterdir()) == []
    assert list(scratch.iterdir()) == []


def test_the_cli_refuses_a_scratch_directory_that_does_not_exist(tmp_path):
    """Resolve strictly, so the failure names the path instead of an errno."""

    from patina_scan_worker.refine_lifecycle import (
        build_argument_parser,
        build_composed_invocation,
    )

    bundle_root, scratch, publish, _bundle = _cli_bundle(tmp_path)
    argv = _cli_argv(bundle_root, scratch, publish)
    argv[argv.index("--scratch-dir") + 1] = str(tmp_path / "absent")
    arguments = build_argument_parser().parse_args(argv)
    with pytest.raises(FileNotFoundError):
        build_composed_invocation(arguments)


@pytest.mark.parametrize(
    "mutate,label",
    [
        (lambda rows: rows.pop("keyframeSummary"), "a missing kind"),
        (lambda rows: rows.update({"extra": rows["keyframeIndex"]}), "an extra kind"),
    ],
)
def test_the_cli_refuses_a_sources_manifest_off_the_closed_kind_set(
    tmp_path, mutate, label
):
    from patina_scan_worker.refine_lifecycle import (
        build_argument_parser,
        build_composed_invocation,
    )

    bundle_root, scratch, publish, _bundle = _cli_bundle(tmp_path)
    sources_path = bundle_root / "sources.json"
    rows = json.loads(sources_path.read_text())
    mutate(rows)
    sources_path.write_text(json.dumps(rows))
    arguments = build_argument_parser().parse_args(
        _cli_argv(bundle_root, scratch, publish)
    )
    with pytest.raises(AdapterError) as failure:
        build_composed_invocation(arguments)
    assert "sources.json must declare exactly" in str(failure.value), label


def test_the_cli_refuses_a_sources_manifest_that_is_not_an_object(tmp_path):
    """Its own clause, with its own sentence: a list of kinds is not a mapping."""

    from patina_scan_worker.refine_lifecycle import (
        build_argument_parser,
        build_composed_invocation,
    )

    bundle_root, scratch, publish, _bundle = _cli_bundle(tmp_path)
    sources_path = bundle_root / "sources.json"
    rows = json.loads(sources_path.read_text())
    sources_path.write_text(json.dumps(sorted(rows)))
    arguments = build_argument_parser().parse_args(
        _cli_argv(bundle_root, scratch, publish)
    )
    with pytest.raises(AdapterError) as failure:
        build_composed_invocation(arguments)
    assert "must be an object of source kinds" in str(failure.value)


# ===========================================================================
# BLOCKING 5: the composed path really drives the packaged raster adapter
#
# Everything above this point rasterises through ``_PrematerializedRaster``.
# That stand-in never exercised the adapter this composition actually ships:
# its descriptor-pinned private scratch, its packaged-source hash check, its
# release-manifest check, the helper process it spawns and reaps, the
# unlink-then-stream of the helper's output, or the canonical-PPM validation the
# enclosing materializer applies to what comes back.
#
# The test below runs the WHOLE lifecycle with the real adapter at the qualified
# 1440x1920 profile.  What it does NOT do, stated next to it: the helper it
# executes is a stand-in that writes a canonical PPM, not libheif decoding a
# real capture.  Decoding a real Field HEIC needs the installed release, which
# is root-owned and an operator's step.  So this proves the composed path
# reaches, drives and survives the real adapter -- not that libheif produced the
# pixels.
# ===========================================================================
_LINUX_ONLY = pytest.mark.skipif(
    sys.platform != "linux",
    reason=(
        "the packaged raster adapter spawns a helper into its own process "
        "group and pins /proc/self/fd aliases; both are Linux boundaries"
    ),
)


@_LINUX_ONLY
def test_the_composed_path_drives_the_real_raster_adapter_at_the_pinned_profile(
    tmp_path,
):
    from test_field_raster_materializer import _python_helper

    from patina_scan_worker.field_raster_materializer import (
        PackagedLibheifFieldRasterMaterializer,
    )
    from patina_scan_worker.refine_lifecycle import QUALIFIED_CAPTURE_RASTER_PROFILE

    profile = QUALIFIED_CAPTURE_RASTER_PROFILE
    # The helper logs the argv it was handed, so this test can show the pinned
    # profile crossing a real process boundary rather than merely being held in
    # the parent.  Protocol v3 carries WIDTH and HEIGHT on argv precisely so the
    # helper cannot agree with itself about a size compiled into it.
    argv_log = tmp_path / "helper-argv.txt"
    release = _python_helper(
        tmp_path / "release-root", profile=profile, argv_log=argv_log
    )
    # The adapter's private scratch is the SAME tree the lifecycle cleans, which
    # is what ``build_composed_invocation`` wires in production.  ``_run``
    # creates it; the constructor takes no descriptor, so naming it here is safe.
    adapter = PackagedLibheifFieldRasterMaterializer._for_test(
        scratch_parent=tmp_path / "scratch",
        release_prefix=release,
        profile=profile,
    )

    # Eight frames, not twelve: eight is exactly
    # ``refine_model_alignment.ALIGNMENT_MIN_CORRESPONDENCES``, the smallest
    # bundle the parent's own Sim3 recomputation will accept, and each 1440x1920
    # raster is 8.29 MB.  Anything smaller is refused by the alignment rather
    # than by the raster path this test is about.
    from patina_scan_worker.refine_model_alignment import (
        ALIGNMENT_MIN_CORRESPONDENCES,
    )

    assert ALIGNMENT_MIN_CORRESPONDENCES == 8
    report, engine, sink, _scratch = _run(
        tmp_path,
        bundle_kwargs={"count": ALIGNMENT_MIN_CORRESPONDENCES, "native": (1920, 1440)},
        raster_materializer=adapter,
    )

    document = report.to_document()
    assert document["raster"]["adapter"] == "PackagedLibheifFieldRasterMaterializer"
    assert document["raster"]["declaredProfile"] == "1440x1920"
    assert document["seedAnchor"]["correspondences"] == 8
    assert report.result.evidence_verdict.refinement_evidenced is True
    assert sink.published, "the composed run published nothing"

    # Every engine image the child received really is a canonical 1440x1920 P6
    # produced by the real adapter, at the receipt's own byte count.
    assert len(engine.pinned_snapshot) >= 1
    assert len(report.result.frame_inputs) == 8
    for frame in report.result.frame_inputs:
        assert frame.engine_size_bytes == _I99_MATERIALIZED_PPM_BYTES
        # The adapter stamps the profile it enforced into its materializer id,
        # so the run carries evidence of WHICH profile decoded it -- and the id
        # is the packaged adapter's, not the stand-in's.
        assert frame.materializer_id.startswith(
            "patina-field-raster-libheif-helper-v2-"
        )
        assert frame.materializer_id.endswith("-1440x1920")

    # A real child process really received the declared profile on argv.
    assert "'1440', '1920'" in argv_log.read_text()


@_LINUX_ONLY
def test_the_real_adapter_refuses_a_frame_outside_the_pinned_profile(tmp_path):
    """The per-frame half of the pin, constructed against the real adapter.

    ``require_qualified_raster_profile`` refuses a wrong DECLARATION.  This is
    the other direction: the declaration is the qualified one and the BUNDLE is
    not, which is exactly what a run against any other device would look like.
    """

    from test_field_raster_materializer import _python_helper

    from patina_scan_worker.field_raster_materializer import (
        PackagedLibheifFieldRasterMaterializer,
    )
    from patina_scan_worker.refine_lifecycle import QUALIFIED_CAPTURE_RASTER_PROFILE
    from patina_scan_worker.refine_materializer import RefineMaterializerError

    profile = QUALIFIED_CAPTURE_RASTER_PROFILE
    release = _python_helper(tmp_path / "release-root", profile=profile)
    adapter = PackagedLibheifFieldRasterMaterializer._for_test(
        scratch_parent=tmp_path / "scratch",
        release_prefix=release,
        profile=profile,
    )

    with pytest.raises(RefineMaterializerError) as failure:
        _run(tmp_path, raster_materializer=adapter)
    assert failure.value.token == "REFINE_RASTER_UNQUALIFIED"
    assert failure.value.fatal is True
    assert "outside the declared 1440x1920 profile" in str(failure.value)
