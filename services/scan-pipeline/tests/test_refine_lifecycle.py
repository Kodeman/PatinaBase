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
import errno
import hashlib
import io
import json
import math
import os
import pathlib
import struct
import tarfile
import time
import tomllib
from dataclasses import replace
from pathlib import Path

import pytest

from patina_scan_worker import refine_lifecycle
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
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
    SparseModelPose,
    SparseModelSnapshot,
    canonical_pose_digest,
)
from patina_scan_worker.refine_native_process import (
    NATIVE_ENGINE_OUTPUT_TOKENS,
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
def _camera_transform(index: int) -> list[float]:
    """A helix, so the trajectory is genuinely three-dimensional.

    A straight line would be rejected by ``estimate_sim3``'s collinearity guard
    -- correctly -- and a fixture that could not be aligned would prove nothing
    about the alignment.
    """

    angle = index * (2.0 * math.pi / FRAME_COUNT)
    return [
        1.0, 0.0, 0.0, 1.5 * math.cos(angle),
        0.0, 1.0, 0.0, 1.5 * math.sin(angle),
        0.0, 0.0, 1.0, 0.35 * index,
        0.0, 0.0, 0.0, 1.0,
    ]


def _index_row(index: int) -> dict[str, object]:
    stem = f"keyframe_{index:06d}"
    return {
        "heicPath": f"keyframes/{stem}.heic",
        "depthPath": None,
        "timestampSeconds": float(index) + 1000.0,
        "frameTimestamp": float(index),
        "cameraTransform": _camera_transform(index),
        "intrinsics": {
            "fx": 2.5,
            "fy": 2.0,
            "cx": 1.5,
            "cy": 1.0,
            "imageWidth": 3,
            "imageHeight": 2,
        },
        "sharpness": 250.0,
        "width": 2,
        "height": 3,
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

    def __init__(self, root: Path) -> None:
        rows = [_index_row(index) for index in range(FRAME_COUNT)]
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


def _materialize(bundle: _Bundle, scratch: Path, deadline: RefineDeadline):
    materializer = RefineMaterializer(
        acquirer=LocalScratchArtifactAcquirer(bundle.root),
        raster_materializer=_PrematerializedRaster(),
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


def _apply_similarity(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    """Carry a Sim(3) through world-to-camera poses, by hand.

    If ``world' = s R world + t`` then ``R_cam' = R_cam R^T`` and
    ``t_cam' = s t_cam - R_cam R^T t``.  Written out here so the alignment the
    parent has to RECOVER was never produced by the parent's own solver.
    """

    transformed = []
    for row in rows:
        rotation = _quat_to_rot(row["qvec"])  # type: ignore[arg-type]
        new_rotation = _matmul(rotation, _transpose(_ALIGNED_ROTATION))
        old_translation = row["tvec"]
        shifted = _matvec(new_rotation, _ALIGNED_TRANSLATION)
        new_translation = tuple(
            _ALIGNED_SCALE * old_translation[axis] - shifted[axis]  # type: ignore[index]
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

    def __init__(
        self,
        artifact_root: Path,
        frames,
        *,
        seed_rows=None,
        aligned_rows=None,
        evidence: dict[str, float] | None = None,
        report_mutation=None,
        digest_mutation=None,
    ) -> None:
        self.artifact_root = artifact_root
        self.frames = frames
        self._seed_rows = seed_rows if seed_rows is not None else _seed_rows(frames)
        self._aligned_rows = (
            aligned_rows
            if aligned_rows is not None
            else _apply_similarity(self._seed_rows)
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
                "scale": _ALIGNED_SCALE,
                "rotation": [list(row) for row in _ALIGNED_ROTATION],
                "translationMeters": list(_ALIGNED_TRANSLATION),
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
):
    bundle_root = tmp_path / "bundle"
    bundle_root.mkdir(parents=True)
    scratch = tmp_path / "scratch"
    scratch.mkdir(mode=0o700, parents=True)
    publish = tmp_path / "publish"
    publish.mkdir(mode=0o700, parents=True)
    manifest = tmp_path / "toolchain.json"
    manifest.write_text("{}")

    bundle = _Bundle(bundle_root)
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
            raster_materializer=_PrematerializedRaster(),
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


def test_the_declared_child_entrypoint_refuses_today():
    """The named child is the FROZEN disabled backend, and it says so."""

    from patina_scan_worker.refine_colmap_backend import run_refine_colmap_native

    assert DEFAULT_CHILD_ENTRYPOINT == (
        "patina_scan_worker.refine_colmap_backend:run_refine_colmap_native"
    )
    with pytest.raises(AdapterError) as raised:
        run_refine_colmap_native({}, None)
    assert raised.value.code == "REFINE_BACKEND_DISABLED"
    assert "disabled and uncomposed" in str(raised.value)


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
        assert document["chunks"][0]["sha256"] == packet.chunk_sha256
        assert _sha256(packet.manifest_path.read_bytes()) == packet.manifest_sha256
        # The chunk really is a readable USTAR archive with the right members.
        with tarfile.open(packet.chunk_path, mode="r:") as archive:
            names = sorted(member.name for member in archive.getmembers())
        assert names == sorted(
            ["engine-request-v1.json"]
            + [f"images/{frame.engine_name}" for frame in materialization.frames]
        )
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
