"""Item 7's child-side engine body, driven end to end by a recorded engine.

WHAT THESE TESTS BUILD FOR REAL, and it is most of the run.  The engine request
is a real canonical-JSON packet member parsed by the FROZEN
``parse_engine_request_member``; both ledgers are real documents parsed by the
FROZEN ledger parsers; the three sparse models are real directories of real
COLMAP binary records; the archives are packed by the body's own
:func:`write_sparse_model_archive` and parsed back by the PARENT's
``read_sparse_model_snapshot``; both similarity solves, both pose digests, the
overlap verdict, the evidence build and every document are the body's own code
running on those bytes.  The parent's independent
``verify_child_alignment_proposal`` is then run against what the body declared,
which is the only check that can tell a correct proposal from a plausible one.

WHAT THE RECORDED BINDING STANDS IN FOR, stated plainly.  ``_RecordedBinding``
replaces :class:`ColmapEngineBinding` -- the ten version-sensitive PyCOLMAP
calls.  It does not run COLMAP, does not import ``pycolmap``, and its model
directories were written by this file rather than by a reconstruction.  The
command seam is replaced too: ``run_inherited_colmap_command`` needs Linux
session isolation and a real binary, so the CLI phase is recorded and the
DEFAULT runner/planner identities are asserted separately.

THE HONEST GAP, next to the tests rather than in a report.  Three things no test
in this repository can reach, each pinned as a flag rather than as prose:
``PYCOLMAP_BINDING_EXECUTED`` and ``COLMAP_PROCESS_LAUNCHED`` are both ``False``,
and no archive here came out of COLMAP.  A green run of this file says the
composition is right about bytes it produced itself; it says nothing about
whether COLMAP 4.0.2 produces those bytes, whether the four added binding reads
match the 4.0.2 signatures, or whether a real room yields a verified loop.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import struct
import time
from pathlib import Path

import pytest

from patina_scan_worker import refine_colmap_engine_body as body
from patina_scan_worker.refine_adapter import (
    MIN_VERIFIED_INLIERS,
    AdapterError,
    ColmapCommandResult,
    ColmapPose,
    PinholeIntrinsics,
    RefineDeadline,
    Sim3,
    estimate_sim3,
)
from patina_scan_worker.refine_colmap_backend import (
    ColmapPacketChunk,
    ColmapPacketManifest,
    ColmapPacketMember,
    build_engine_pair_graph,
    parse_engine_request_member,
)
from patina_scan_worker.refine_colmap_engine_body import (
    CHILD_ENTRYPOINT,
    COLMAP_PROCESS_LAUNCHED,
    DISABLED_BACKEND_ENTRYPOINT,
    EVIDENCE_ARTIFACT_ROLES,
    PYCOLMAP_BINDING_EXECUTED,
    REFINE_ENGINE_BODY_QUALIFIED,
    ModelTrackObservation,
    ModelTrackSnapshot,
    TwoViewGeometryRow,
    run_primary_engine_body,
    write_sparse_model_archive,
)
from patina_scan_worker.refine_colmap_toolchain import (
    plan_pinned_colmap_command,
    plan_qualified_colmap_command,
)
from patina_scan_worker.refine_engine import EngineImage, ModelEvidence
from patina_scan_worker.refine_model_alignment import (
    SPARSE_MODEL_REQUIRED_MEMBERS,
    ProposedAlignment,
    canonical_pose_digest,
    read_sparse_model_snapshot,
    verify_child_alignment_proposal,
)
from patina_scan_worker.refine_native_process import (
    NATIVE_ENGINE_OUTPUT_TOKENS,
    NativeChildContext,
)
from patina_scan_worker.refine_packet_extractor import (
    ExtractedColmapPacket,
    _parse_adapter_ledger,
    _parse_source_ledger,
)

FRAME_COUNT = 14
TRACK_COUNT = 8
KEYPOINTS_PER_FRAME = 40
RUN_ID = "c" * 64
MATERIALIZER_ID = "field-raster-libheif-v1"
ARCHIVE_KEY = "capture/scan-1/keyframes.tar"

# The recorded bundle-adjustment gauge: a deliberately NON-identity similarity.
# The refined model is expressed in it, so a body that declared the gauge it
# applied -- instead of the raw -> aligned similarity the parent's contract asks
# for -- would declare a scale of ~0.73 and be refused.  See
# ``test_the_declared_proposal_is_not_the_gauge_that_was_applied``.
GAUGE_SCALE = 1.37
GAUGE_AXIS = (1.0, 2.0, 3.0)
GAUGE_ANGLE_RAD = 0.4
GAUGE_TRANSLATION = (2.0, -1.0, 0.5)


# ===========================================================================
# Small linear algebra, written here so the fixture never borrows the code
# under test to build the thing that code is meant to check.
# ===========================================================================
def _normalize(vector):
    norm = math.sqrt(sum(value * value for value in vector))
    return tuple(value / norm for value in vector)


def _cross(first, second):
    return (
        first[1] * second[2] - first[2] * second[1],
        first[2] * second[0] - first[0] * second[2],
        first[0] * second[1] - first[1] * second[0],
    )


def _matvec(matrix, vector):
    return tuple(
        sum(matrix[row][axis] * vector[axis] for axis in range(3)) for row in range(3)
    )


def _matmul(left, right):
    return tuple(
        tuple(
            sum(left[row][inner] * right[inner][col] for inner in range(3))
            for col in range(3)
        )
        for row in range(3)
    )


def _transpose(matrix):
    return tuple(tuple(matrix[row][col] for row in range(3)) for col in range(3))


def _axis_angle(axis, angle):
    x, y, z = _normalize(axis)
    c = math.cos(angle)
    s = math.sin(angle)
    return (
        (c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s),
        (y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s),
        (z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)),
    )


def _quaternion(matrix):
    """Hamilton ``(qw, qx, qy, qz)``, positive-``qw`` canonical sign."""

    trace = matrix[0][0] + matrix[1][1] + matrix[2][2]
    if trace > 0.0:
        scale = math.sqrt(trace + 1.0) * 2.0
        qw = 0.25 * scale
        qx = (matrix[2][1] - matrix[1][2]) / scale
        qy = (matrix[0][2] - matrix[2][0]) / scale
        qz = (matrix[1][0] - matrix[0][1]) / scale
    elif matrix[0][0] > matrix[1][1] and matrix[0][0] > matrix[2][2]:
        scale = math.sqrt(1.0 + matrix[0][0] - matrix[1][1] - matrix[2][2]) * 2.0
        qw = (matrix[2][1] - matrix[1][2]) / scale
        qx = 0.25 * scale
        qy = (matrix[0][1] + matrix[1][0]) / scale
        qz = (matrix[0][2] + matrix[2][0]) / scale
    elif matrix[1][1] > matrix[2][2]:
        scale = math.sqrt(1.0 + matrix[1][1] - matrix[0][0] - matrix[2][2]) * 2.0
        qw = (matrix[0][2] - matrix[2][0]) / scale
        qx = (matrix[0][1] + matrix[1][0]) / scale
        qy = 0.25 * scale
        qz = (matrix[1][2] + matrix[2][1]) / scale
    else:
        scale = math.sqrt(1.0 + matrix[2][2] - matrix[0][0] - matrix[1][1]) * 2.0
        qw = (matrix[1][0] - matrix[0][1]) / scale
        qx = (matrix[0][2] + matrix[2][0]) / scale
        qy = (matrix[1][2] + matrix[2][1]) / scale
        qz = 0.25 * scale
    norm = math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz)
    quaternion = (qw / norm, qx / norm, qy / norm, qz / norm)
    for value in quaternion:
        if value > 0.0:
            return quaternion
        if value < 0.0:
            return tuple(-component for component in quaternion)
    return quaternion


def _look_at(centre):
    """A proper right-handed ``cam_from_world`` looking at the world origin."""

    forward = _normalize(tuple(-value for value in centre))
    right = _normalize(_cross((0.0, 0.0, 1.0), forward))
    down = _cross(forward, right)
    rotation = (right, down, forward)
    translation = tuple(-value for value in _matvec(rotation, centre))
    return rotation, translation


# ===========================================================================
# The fixture geometry: a helical returning walk, then a small perturbation
# ===========================================================================
def _seed_centres():
    centres = []
    for index in range(FRAME_COUNT):
        angle = 2.0 * math.pi * index / FRAME_COUNT
        centres.append(
            (
                1.4 * math.cos(angle),
                1.4 * math.sin(angle),
                0.15 * math.sin(2.0 * math.pi * index / 7.0),
            )
        )
    return tuple(centres)


def _perturbed_centres(centres):
    """The 'true' post-bundle-adjustment metric trajectory.

    Millimetre-scale and deliberately NOT a global similarity of the seed, so
    the parent's fit residual is non-zero and the movement floor is cleared by a
    real displacement rather than by a rigid motion of the whole trajectory.
    """

    moved = []
    for index, centre in enumerate(centres):
        moved.append(
            (
                centre[0] + 0.004 * math.sin(index * 1.7),
                centre[1] - 0.005 * math.cos(index * 2.3),
                centre[2] + 0.003 * math.sin(index * 0.9),
            )
        )
    return tuple(moved)


def _track_points():
    return tuple(
        (
            0.20 * math.cos(2.0 * math.pi * index / TRACK_COUNT),
            0.20 * math.sin(2.0 * math.pi * index / TRACK_COUNT),
            0.10 * (index - TRACK_COUNT / 2.0) / TRACK_COUNT,
        )
        for index in range(TRACK_COUNT)
    )


INTRINSICS = (1200.0, 1201.5, 719.25, 959.75, 1440, 1920)


def _project(rotation, translation, point):
    camera = _matvec(rotation, point)
    camera = tuple(camera[axis] + translation[axis] for axis in range(3))
    assert camera[2] > 0.0, "fixture point must sit in front of the camera"
    fx, fy, cx, cy = INTRINSICS[:4]
    return (fx * camera[0] / camera[2] + cx, fy * camera[1] / camera[2] + cy)


def _apply_sim3(transform: Sim3, point):
    rotated = _matvec(transform.rotation, point)
    return tuple(
        transform.scale * rotated[axis] + transform.translation[axis]
        for axis in range(3)
    )


# ===========================================================================
# COLMAP sparse-model binary writers
# ===========================================================================
def _cameras_bin(camera_ids):
    payload = struct.pack("<Q", len(camera_ids))
    for camera_id in camera_ids:
        payload += struct.pack(
            "<IiQQ", camera_id, 1, INTRINSICS[4], INTRINSICS[5]
        ) + struct.pack("<4d", *INTRINSICS[:4])
    return payload


def _images_bin(rows):
    """``rows`` = ``(image_id, camera_id, name, qvec, tvec, observations)``."""

    payload = struct.pack("<Q", len(rows))
    for image_id, camera_id, name, qvec, tvec, observations in rows:
        payload += struct.pack("<I", image_id)
        payload += struct.pack("<7d", *qvec, *tvec)
        payload += struct.pack("<I", camera_id)
        payload += name.encode("ascii") + b"\x00"
        payload += struct.pack("<Q", len(observations))
        for x, y, point3d_id in observations:
            payload += struct.pack("<ddq", x, y, point3d_id)
    return payload


def _points3d_bin(points):
    """``points`` = ``(point3d_id, xyz, track)`` with ``track`` = ids/indices."""

    payload = struct.pack("<Q", len(points))
    for point3d_id, xyz, track in points:
        payload += struct.pack("<Q", point3d_id)
        payload += struct.pack("<3d", *xyz)
        payload += bytes((128, 128, 128))
        payload += struct.pack("<d", 0.5)
        payload += struct.pack("<Q", len(track))
        for image_id, point2d_index in track:
            payload += struct.pack("<II", image_id, point2d_index)
    return payload


def _write_model(directory: Path, *, poses, points, keypoints):
    """Write one COLMAP sparse model directory.

    ``poses`` maps engine name -> ``(image_id, camera_id, rotation, translation)``
    and ``points`` maps point3D id -> xyz.  Observations are dense: every frame
    observes every track at point2D index ``track_ordinal``.
    """

    directory.mkdir(parents=True, exist_ok=False)
    camera_ids = sorted(row[1] for row in poses.values())
    (directory / "cameras.bin").write_bytes(_cameras_bin(camera_ids))
    rows = []
    for name in sorted(poses):
        image_id, camera_id, rotation, translation = poses[name]
        observations = []
        for index in range(KEYPOINTS_PER_FRAME):
            point3d_id = index + 1 if index < TRACK_COUNT else -1
            observations.append((*keypoints[name][index], point3d_id))
        rows.append(
            (
                image_id,
                camera_id,
                name,
                _quaternion(rotation),
                translation,
                observations,
            )
        )
    (directory / "images.bin").write_bytes(_images_bin(rows))
    point_rows = []
    for point3d_id in sorted(points):
        track = [
            (poses[name][0], point3d_id - 1) for name in sorted(poses)
        ]
        point_rows.append((point3d_id, points[point3d_id], track))
    (directory / "points3D.bin").write_bytes(_points3d_bin(point_rows))


# ===========================================================================
# The packet, assembled through the FROZEN validators
# ===========================================================================
def _canonical_json(value) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
        + "\n"
    ).encode("ascii")


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


class _Fixture:
    """Every number this suite reasons about, built once and shared."""

    def __init__(self) -> None:
        self.seed_centres = _seed_centres()
        self.true_centres = _perturbed_centres(self.seed_centres)
        self.points = _track_points()
        self.names = tuple(f"frame_{index:06d}.ppm" for index in range(FRAME_COUNT))
        self.image_ids = tuple(index + 1 for index in range(FRAME_COUNT))
        self.camera_ids = tuple(index + 1 for index in range(FRAME_COUNT))

        self.seed_poses = {}
        self.true_poses = {}
        for index, name in enumerate(self.names):
            self.seed_poses[name] = _look_at(self.seed_centres[index])
            # The true metric pose also rotates a little, so the movement floor
            # is cleared on orientation as well as on position.
            rotation, _ = _look_at(self.true_centres[index])
            twist = _axis_angle((0.2, 1.0, 0.3), 0.0009 * (index + 1))
            rotation = _matmul(twist, rotation)
            translation = tuple(
                -value for value in _matvec(rotation, self.true_centres[index])
            )
            self.true_poses[name] = (rotation, translation)

        # Observed keypoints ARE the true-model projections, so the refined
        # reprojection is ~0 and the raw one is not.  Indices >= TRACK_COUNT are
        # unassociated detections; they exist so a verified edge can carry the
        # 30-inlier floor without inventing tracks.
        self.keypoints = {}
        for name in self.names:
            rotation, translation = self.true_poses[name]
            table = [
                _project(rotation, translation, self.points[track])
                for track in range(TRACK_COUNT)
            ]
            table += [
                (100.0 + 3.0 * index, 200.0 + 5.0 * index)
                for index in range(KEYPOINTS_PER_FRAME - TRACK_COUNT)
            ]
            self.keypoints[name] = tuple(table)

        self.gauge = Sim3(
            scale=GAUGE_SCALE,
            rotation=_axis_angle(GAUGE_AXIS, GAUGE_ANGLE_RAD),
            translation=GAUGE_TRANSLATION,
        )

    # --- packet documents ------------------------------------------------
    def engine_request_document(self) -> dict:
        frames = []
        for index, name in enumerate(self.names):
            rotation, translation = self.seed_poses[name]
            centre = tuple(-value for value in _matvec(_transpose(rotation), translation))
            frames.append(
                {
                    "ordinal": index,
                    "sourceImageName": f"keyframe-{index:06d}.heic",
                    "frameTimestampSeconds": 0.5 * index,
                    "engineImageName": name,
                    "engineRelativePath": f"images/{name}",
                    "engineSha256": _sha256(f"raster-{index}".encode()),
                    "engineSizeBytes": 8_294_417,
                    "intrinsics": {
                        "fx": INTRINSICS[0],
                        "fy": INTRINSICS[1],
                        "cx": INTRINSICS[2],
                        "cy": INTRINSICS[3],
                        "width": INTRINSICS[4],
                        "height": INTRINSICS[5],
                    },
                    "camFromWorld": {
                        "rotation": [list(row) for row in rotation],
                        "translation": list(translation),
                    },
                    "rawCameraCenterMeters": list(centre),
                }
            )
        return {
            "schemaVersion": 1,
            "contract": "patina-refine-colmap-engine-request-v1",
            "targetColmapVersion": "4.0.2",
            "gpuIndex": "0",
            "frames": frames,
        }

    def source_ledger_document(self) -> dict:
        return {
            "schemaVersion": 1,
            "contract": "patina-refine-colmap-source-ledger-v1",
            "runId": RUN_ID,
            "frames": [
                {
                    "ordinal": index,
                    "sourceArchiveKey": ARCHIVE_KEY,
                    "sourceMember": f"keyframes/keyframe-{index:06d}.heic",
                    "sourceImageName": f"keyframe-{index:06d}.heic",
                    "sourceSha256": _sha256(f"source-{index}".encode()),
                    "sourceSizeBytes": 2_000_000 + index,
                }
                for index in range(FRAME_COUNT)
            ],
        }

    def adapter_ledger_document(self) -> dict:
        return {
            "schemaVersion": 1,
            "contract": "patina-refine-colmap-adapter-ledger-v1",
            "runId": RUN_ID,
            "materializerId": MATERIALIZER_ID,
        }

    def packet(self) -> ExtractedColmapPacket:
        request_payload = _canonical_json(self.engine_request_document())
        source_payload = _canonical_json(self.source_ledger_document())
        adapter_payload = _canonical_json(self.adapter_ledger_document())
        members = [
            ColmapPacketMember(
                "adapter-ledger-v1.json",
                "packet.chunk.000",
                "adapter-ledger-v1.json",
                _sha256(adapter_payload),
                len(adapter_payload),
                "adapter-ledger",
            ),
            ColmapPacketMember(
                "engine-request-v1.json",
                "packet.chunk.000",
                "engine-request-v1.json",
                _sha256(request_payload),
                len(request_payload),
                "engine-request",
            ),
        ]
        for index, name in enumerate(self.names):
            members.append(
                ColmapPacketMember(
                    f"images/{name}",
                    "packet.chunk.000",
                    f"images/{name}",
                    _sha256(f"raster-{index}".encode()),
                    8_294_417,
                    "engine-image",
                )
            )
        members.append(
            ColmapPacketMember(
                "source-ledger-v1.json",
                "packet.chunk.000",
                "source-ledger-v1.json",
                _sha256(source_payload),
                len(source_payload),
                "source-ledger",
            )
        )
        manifest = ColmapPacketManifest(
            "packet.manifest",
            "d" * 64,
            RUN_ID,
            "engine-request-v1.json",
            (ColmapPacketChunk("packet.chunk.000", "e" * 64, 1024),),
            tuple(members),
        )
        # The FROZEN parsers, on real bytes, are what make this a packet rather
        # than a bag of dataclasses.
        engine_request = parse_engine_request_member(request_payload, manifest)
        source_ledger = _parse_source_ledger(
            source_payload,
            manifest=manifest,
            member=manifest.member_by_path["source-ledger-v1.json"],
            engine_request=engine_request,
        )
        adapter_ledger = _parse_adapter_ledger(
            adapter_payload,
            manifest=manifest,
            member=manifest.member_by_path["adapter-ledger-v1.json"],
        )
        return ExtractedColmapPacket(
            -1,
            manifest,
            engine_request,
            tuple(sorted(member.relative_path for member in members)),
            source_ledger=source_ledger,
            adapter_ledger=adapter_ledger,
        )


FIXTURE = _Fixture()


# ===========================================================================
# The recorded binding
# ===========================================================================
class _RecordedBinding:
    """A stand-in for the ten PyCOLMAP calls, writing REAL model bytes.

    It models the one thing that matters for the composition: bundle adjustment
    moves the cameras a little AND leaves the model in an arbitrary gauge.  The
    seed and triangulated models carry the submitted poses exactly (the parent
    refuses a triangulator that moved a known pose); the refined model is the
    true metric trajectory expressed under :data:`GAUGE_SCALE` and friends.
    """

    def __init__(self, fixture: _Fixture, *, inliers: int = 32) -> None:
        self.fixture = fixture
        self.inliers = inliers
        self.calls: list[str] = []
        self.binding_version = "4.0.2"

    def _record(self, name: str) -> None:
        self.calls.append(name)

    def toolchain_evidence(self):
        return {"version": "4.0.2", "hasCuda": True}

    def extract_gpu_features(self, *, database_path, image_dir, images, gpu_index, log_path):
        self._record("extract_gpu_features")
        assert image_dir.name == "images"
        assert gpu_index == "0"
        database_path.write_bytes(b"SQLite format 3\x00" + b"\x00" * 2048)
        return tuple(
            {
                "name": image.name,
                "imageId": self.fixture.image_ids[index],
                "cameraId": self.fixture.camera_ids[index],
                "keypoints": KEYPOINTS_PER_FRAME,
                "descriptors": KEYPOINTS_PER_FRAME,
            }
            for index, image in enumerate(images)
        )

    def rewrite_intrinsics_preserving_ids(self, *, database_path, images, log_path):
        self._record("rewrite_intrinsics_preserving_ids")
        return tuple({"name": image.name, "idsPreserved": True} for image in images)

    def match_explicit_pairs(self, *, database_path, pairs_path, image_pairs, gpu_index, log_path):
        self._record("match_explicit_pairs")
        assert pairs_path.read_bytes() == "".join(
            f"{first} {second}\n" for first, second in image_pairs
        ).encode("ascii")
        return tuple(
            {
                "first": first,
                "second": second,
                "rawMatches": self.inliers + 10,
                "verifiedInliers": self.inliers,
            }
            for first, second in image_pairs
        )

    def read_two_view_geometries(self, *, database_path, image_pairs, log_path):
        self._record("read_two_view_geometries")
        rows = []
        for first, second in image_pairs:
            first_rotation, first_translation = self.fixture.true_poses[first]
            second_rotation, second_translation = self.fixture.true_poses[second]
            relative = _matmul(second_rotation, _transpose(first_rotation))
            rotated = _matvec(relative, first_translation)
            direction = _normalize(
                tuple(second_translation[axis] - rotated[axis] for axis in range(3))
            )
            rows.append(
                TwoViewGeometryRow(
                    first,
                    second,
                    tuple((index, index) for index in range(self.inliers)),
                    relative,
                    direction,
                )
            )
        return tuple(rows)

    def read_keypoint_tables(self, *, database_path, image_names, log_path):
        self._record("read_keypoint_tables")
        return {name: self.fixture.keypoints[name] for name in image_names}

    def _model_evidence(self, poses, points_count):
        registered = tuple(sorted(self.fixture.image_ids))
        names = {
            self.fixture.image_ids[index]: name
            for index, name in enumerate(self.fixture.names)
        }
        cameras = {
            self.fixture.image_ids[index]: self.fixture.camera_ids[index]
            for index in range(FRAME_COUNT)
        }
        centres = {}
        matrices = {}
        for index, name in enumerate(self.fixture.names):
            rotation, translation = poses[name]
            centres[self.fixture.image_ids[index]] = tuple(
                -value for value in _matvec(_transpose(rotation), translation)
            )
            matrices[self.fixture.image_ids[index]] = tuple(
                (*rotation[row], translation[row]) for row in range(3)
            )
        return ModelEvidence(
            valid=True,
            registered_image_ids=registered,
            image_names_by_id=names,
            camera_ids_by_image_id=cameras,
            camera_contract_by_id={
                camera_id: {
                    "model": "PINHOLE",
                    "width": INTRINSICS[4],
                    "height": INTRINSICS[5],
                    "params": list(INTRINSICS[:4]),
                }
                for camera_id in self.fixture.camera_ids
            },
            camera_centers_by_image_id=centres,
            num_points3d=points_count,
            cam_from_world_by_image_id=matrices,
        )

    def _poses_for(self, directory: Path):
        if directory.name == body.SEED_MODEL_DIRECTORY:
            return self.fixture.seed_poses, {}
        if directory.name == body.TRIANGULATED_MODEL_DIRECTORY:
            return self.fixture.seed_poses, self._point_map(lambda point: point)
        if directory.name == body.REFINED_MODEL_DIRECTORY:
            return self._gauged_poses(), self._point_map(
                lambda point: _apply_sim3(self.fixture.gauge, point)
            )
        raise AssertionError(f"unexpected model directory {directory}")

    def _point_map(self, transform):
        return {
            index + 1: transform(point)
            for index, point in enumerate(self.fixture.points)
        }

    def _gauged_poses(self):
        gauge = self.fixture.gauge
        inverse_rotation = _transpose(gauge.rotation)
        poses = {}
        for name, (rotation, translation) in self.fixture.true_poses.items():
            centre = tuple(-value for value in _matvec(_transpose(rotation), translation))
            moved = _apply_sim3(gauge, centre)
            gauged_rotation = _matmul(rotation, inverse_rotation)
            poses[name] = (
                gauged_rotation,
                tuple(-value for value in _matvec(gauged_rotation, moved)),
            )
        return poses

    def build_known_pose_seed(self, *, database_path, images, output_path, log_path):
        self._record("build_known_pose_seed")
        _write_model(
            output_path,
            poses=self._model_poses(self.fixture.seed_poses),
            points={},
            keypoints=self.fixture.keypoints,
        )
        return self._model_evidence(self.fixture.seed_poses, 0)

    def _model_poses(self, poses):
        return {
            name: (
                self.fixture.image_ids[index],
                self.fixture.camera_ids[index],
                *poses[name],
            )
            for index, name in enumerate(self.fixture.names)
        }

    def write_triangulated(self, output_path: Path) -> None:
        """Stand in for the CLI phase's on-disk product."""

        _write_model(
            output_path,
            poses=self._model_poses(self.fixture.seed_poses),
            points=self._point_map(lambda point: point),
            keypoints=self.fixture.keypoints,
        )

    def inspect_model(self, path: Path, *, log_path):
        self._record(f"inspect_model:{path.name}")
        if path.name == body.ALIGNED_MODEL_DIRECTORY:
            snapshot = read_sparse_model_snapshot(
                os.open(path.parent / "aligned-sparse-model-v1.tar", os.O_RDONLY),
                label="aligned",
                deadline=_deadline(),
            )
            del snapshot
            return self._model_evidence(self._aligned_poses(), TRACK_COUNT)
        poses, points = self._poses_for(path)
        return self._model_evidence(poses, len(points))

    def bundle_adjust_with_success_evidence(self, *, input_path, output_path, log_path):
        self._record("bundle_adjust_with_success_evidence")
        poses, points = self._poses_for(output_path)
        _write_model(
            output_path,
            poses=self._model_poses(poses),
            points=points,
            keypoints=self.fixture.keypoints,
        )
        return {
            "api": "pycolmap.create_default_bundle_adjuster",
            "usable": True,
            "terminationType": "CONVERGENCE",
            "numResiduals": FRAME_COUNT * TRACK_COUNT * 2,
            "modelWritten": True,
        }

    def read_model_tracks(self, path: Path, *, log_path):
        self._record(f"read_model_tracks:{path.name}")
        if path.name == body.TRIANGULATED_MODEL_DIRECTORY:
            points = self._point_map(lambda point: point)
        elif path.name == body.ALIGNED_MODEL_DIRECTORY:
            points = self._aligned_points()
        else:  # pragma: no cover - the body reads only those two
            raise AssertionError(f"unexpected track read {path}")
        return tuple(
            ModelTrackSnapshot(
                point3d=points[index + 1],
                observations=tuple(
                    ModelTrackObservation(
                        engine_image_name=name,
                        point2d_index=index,
                    )
                    for name in self.fixture.names
                ),
            )
            for index in range(TRACK_COUNT)
        )

    # The aligned model is whatever the BODY asked for, applied here.
    _applied: Sim3 | None = None

    def write_similarity_transformed_model(self, *, input_path, output_path, transform, log_path):
        self._record("write_similarity_transformed_model")
        self._applied = transform
        poses = {}
        inverse_rotation = _transpose(transform.rotation)
        for name in self.fixture.names:
            rotation, translation = self._gauged_poses()[name]
            centre = tuple(-value for value in _matvec(_transpose(rotation), translation))
            moved = _apply_sim3(transform, centre)
            rebased = _matmul(rotation, inverse_rotation)
            poses[name] = (
                rebased,
                tuple(-value for value in _matvec(rebased, moved)),
            )
        self._aligned_pose_cache = poses
        points = {
            key: _apply_sim3(transform, value)
            for key, value in self._point_map(
                lambda point: _apply_sim3(self.fixture.gauge, point)
            ).items()
        }
        self._aligned_point_cache = points
        _write_model(
            output_path,
            poses=self._model_poses(poses),
            points=points,
            keypoints=self.fixture.keypoints,
        )

    def _aligned_poses(self):
        return self._aligned_pose_cache

    def _aligned_points(self):
        return self._aligned_point_cache


def _deadline(seconds: float = 300.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _lease(tmp_path: Path) -> tuple[NativeChildContext, Path]:
    lease = tmp_path / "lease"
    lease.mkdir(mode=0o700)
    for name in ("packet", "tmp", "work"):
        (lease / name).mkdir(mode=0o700)
    (lease / "packet" / "images").mkdir(mode=0o700)
    context = NativeChildContext(
        time.monotonic() + 300.0,
        {},
        None,
        str(lease),
        {name: str(lease / name) for name in ("packet", "tmp", "work")},
    )
    return context, lease


def _toolchain(tmp_path: Path, *, qualified: bool = True):
    """Load a REAL :class:`ColmapToolchain` from a fake, root-shaped prefix.

    The body type-checks its toolchain and reads its manifest, so a duck-typed
    stand-in would test nothing about the real object.  ``load_fake_toolchain``
    runs the production loader -- descriptor walk, manifest parse, executable
    hash, and (when ``qualified``) the full box-identity assertion -- against a
    prefix under ``tmp_path``.  Only the three install-location paths are
    substituted; every version and build constant is the pinned one.
    """

    from _colmap_toolchain import load_fake_toolchain, write_toolchain

    prefix = tmp_path / "prefix"
    if not prefix.exists():
        write_toolchain(prefix)
    return load_fake_toolchain(prefix, qualified=qualified)


def _run(
    tmp_path: Path,
    *,
    binding: _RecordedBinding | None = None,
    toolchain=None,
    inliers: int = 32,
):
    """Drive the composed body once, recording the CLI phase."""

    context, lease = _lease(tmp_path)
    engine = binding if binding is not None else _RecordedBinding(FIXTURE, inliers=inliers)
    planned: dict = {}

    def planner(argv, **kwargs):
        planned["argv"] = tuple(argv)
        planned["workspace"] = kwargs["workspace"]
        planned["cwd"] = kwargs["cwd"]
        planned["temp_directory"] = kwargs["temp_directory"]

        class _Plan:
            pass

        plan = _Plan()
        plan.argv = tuple(argv)
        return plan

    def runner(plan, *, context, deadline, log_path, cwd):
        planned["log_path"] = log_path
        planned["cwd_at_run"] = cwd
        # The CLI phase's real effect: the triangulated model on disk.
        engine.write_triangulated(Path(plan.argv[plan.argv.index("--output_path") + 1]))
        log_path.write_text("point_triangulator ok\n", encoding="utf-8")
        return ColmapCommandResult(0, log_path, "point_triangulator ok")

    report = run_primary_engine_body(
        FIXTURE.packet(),
        context=context,
        deadline=_deadline(),
        binding=engine,
        toolchain=toolchain if toolchain is not None else _toolchain(tmp_path),
        command_runner=runner,
        planner=planner,
    )
    return report, engine, lease, planned


# ===========================================================================
# Posture
# ===========================================================================
def test_the_body_claims_no_qualification_and_no_execution():
    assert REFINE_ENGINE_BODY_QUALIFIED is False
    assert PYCOLMAP_BINDING_EXECUTED is False
    assert COLMAP_PROCESS_LAUNCHED is False
    assert body.PRODUCTION_ENABLEMENT == "composed-child-body-unqualified"


def test_refine_is_still_not_a_registered_stage():
    """Runtime, not a grep: the registry itself is asked."""

    from patina_scan_worker import config, stages

    assert stages.get_handler("scan_pipeline.refine") is None
    assert config.DEFAULT_STAGES == "ingest,solve,drawings"


def test_the_lifecycle_and_the_engine_body_agree_on_the_entrypoint():
    from patina_scan_worker.refine_lifecycle import (
        DEFAULT_CHILD_ENTRYPOINT,
        DISABLED_CHILD_ENTRYPOINT,
    )

    assert DEFAULT_CHILD_ENTRYPOINT == CHILD_ENTRYPOINT
    assert DISABLED_CHILD_ENTRYPOINT == DISABLED_BACKEND_ENTRYPOINT
    module_name, _, attribute = CHILD_ENTRYPOINT.partition(":")
    assert module_name == body.__name__
    assert getattr(body, attribute) is body.run_refine_colmap_native_engine


@pytest.mark.skipif(
    Path("/opt/colmap/4.0.2").exists(),
    reason="this host has an installed COLMAP prefix; the refusal below is about "
    "a host that does not",
)
def test_the_entrypoint_fails_closed_on_this_host_before_touching_the_packet():
    """The real fail-closed, on the real host, with no substitution at all.

    ``run_refine_colmap_native_engine`` is called with a request that is not a
    valid packet.  If the toolchain load ran second, the refusal would be a
    packet error; it is a toolchain error, which is what proves the order.  On
    this machine ``/opt/colmap/4.0.2`` does not exist and the loader refuses to
    resolve it -- there is no PATH search, no bundled binary and no unqualified
    branch to fall into.
    """

    context = NativeChildContext(time.monotonic() + 60.0)
    with pytest.raises(AdapterError) as raised:
        body.run_refine_colmap_native_engine({"not": "a packet"}, context)
    assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert str(raised.value) == "cannot resolve the COLMAP toolchain prefix"


def test_the_frozen_disabled_backend_is_still_the_floor():
    from patina_scan_worker.refine_colmap_backend import run_refine_colmap_native

    with pytest.raises(AdapterError) as raised:
        run_refine_colmap_native({}, None)
    assert raised.value.code == "REFINE_BACKEND_DISABLED"


def test_the_production_command_seams_are_the_qualified_ones():
    """The defaults are not incidental; a test pins each one.

    The suite substitutes both, so without this the body could default to an
    unqualified planner or a session-escaping runner and stay green.
    """

    import inspect

    signature = inspect.signature(run_primary_engine_body)
    from patina_scan_worker.refine_colmap_command import run_inherited_colmap_command

    assert signature.parameters["planner"].default is plan_qualified_colmap_command
    assert signature.parameters["command_runner"].default is run_inherited_colmap_command


def test_the_body_never_reaches_an_unqualified_toolchain_door():
    """AST, not grep: what the module CALLS, not what its prose mentions.

    ``load_colmap_toolchain`` and ``plan_pinned_colmap_command`` are the two
    functions that accept an arbitrary prefix or a ``descriptor_exec=False``
    plan.  Both are named in this module's docstrings on purpose; neither may be
    called.
    """

    import ast

    tree = ast.parse(Path(body.__file__).read_text(encoding="utf-8"))
    called: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        function = node.func
        if isinstance(function, ast.Name):
            called.add(function.id)
        elif isinstance(function, ast.Attribute):
            called.add(function.attr)
    assert "load_colmap_toolchain" not in called
    assert "plan_pinned_colmap_command" not in called
    assert "which" not in called
    assert "load_qualified_colmap_toolchain" in called
    assert "plan_qualified_colmap_command" not in called  # it is a DEFAULT, not a call


def test_the_only_executable_subcommand_is_the_primary_one():
    """``global_mapper`` and the fallback mapper are not reachable at all.

    The structural guarantee is the allowlist, not this body's restraint: the
    supervisor validates every argv against it, so a subcommand outside it
    cannot be launched however the body were written.
    """

    from patina_scan_worker.refine_colmap_toolchain import COLMAP_COMMAND_ALLOWLIST

    assert tuple(COLMAP_COMMAND_ALLOWLIST) == ("point_triangulator",)
    for forbidden in ("global_mapper", "pose_prior_mapper", "mapper", "gui"):
        assert forbidden not in COLMAP_COMMAND_ALLOWLIST


# ===========================================================================
# The composed run
# ===========================================================================
def test_the_body_produces_every_output_token_once(tmp_path):
    report, engine, lease, planned = _run(tmp_path)
    work = lease / "work"
    for token in NATIVE_ENGINE_OUTPUT_TOKENS:
        path = work / token
        assert path.is_file(), token
        payload = path.read_bytes()
        assert report["outputs"][token]["sha256"] == _sha256(payload)
        assert report["outputs"][token]["sizeBytes"] == len(payload)
    assert tuple(sorted(report["outputs"])) == NATIVE_ENGINE_OUTPUT_TOKENS
    assert report["contract"] == body.ENGINE_REPORT_CONTRACT
    assert report["schemaVersion"] == body.ENGINE_REPORT_SCHEMA_VERSION
    assert report["selectedEngine"] == "colmap-4-known-pose-triangulate-ba"
    assert report["cliVersion"] == "4.0.2"
    assert report["bindingVersion"] == "4.0.2"


def test_the_parent_accepts_the_report_it_is_handed(tmp_path):
    """The body's report really parses under the PARENT's strict parser."""

    from patina_scan_worker.refine_lifecycle import parse_engine_report

    report, _engine, _lease, _planned = _run(tmp_path)
    parsed = parse_engine_report(report)
    assert parsed.selected_engine == "colmap-4-known-pose-triangulate-ba"
    assert parsed.evidence.input_images == FRAME_COUNT
    assert set(parsed.artifact_digests) == set(NATIVE_ENGINE_OUTPUT_TOKENS)


def test_the_parent_verifies_the_alignment_the_body_declared(tmp_path):
    """The whole point: an INDEPENDENT recomputation accepts the proposal."""

    report, _engine, lease, _planned = _run(tmp_path)
    work = lease / "work"
    snapshots = {}
    for label, token in (
        ("seed", "seed-model-v1.tar"),
        ("raw pre-BA", "raw-triangulated-model-snapshot-v1.tar"),
        ("aligned", "aligned-sparse-model-v1.tar"),
    ):
        descriptor = os.open(work / token, os.O_RDONLY)
        try:
            snapshots[label] = read_sparse_model_snapshot(
                descriptor, label=label, deadline=_deadline()
            )
        finally:
            os.close(descriptor)
    alignment = report["alignment"]
    verification = verify_child_alignment_proposal(
        seed=snapshots["seed"],
        raw_pre_ba=snapshots["raw pre-BA"],
        aligned=snapshots["aligned"],
        proposal=ProposedAlignment(
            scale=alignment["scale"],
            rotation=tuple(tuple(row) for row in alignment["rotation"]),
            translation=tuple(alignment["translationMeters"]),
            raw_pose_digest_sha256=alignment["rawPoseDigestSha256"],
            aligned_pose_digest_sha256=alignment["alignedPoseDigestSha256"],
        ),
        deadline=_deadline(),
    )
    assert verification.correspondences == FRAME_COUNT
    assert verification.raw_pose_digest_sha256 == alignment["rawPoseDigestSha256"]
    assert verification.aligned_pose_digest_sha256 == alignment["alignedPoseDigestSha256"]


def test_the_declared_proposal_is_not_the_gauge_that_was_applied(tmp_path):
    """Declaring the applied transform would be refused, and materially so.

    This is the clause the body's two-solve structure exists for.  The applied
    gauge maps the BA frame back to metric and carries a scale near
    ``1 / GAUGE_SCALE``; the declared proposal maps raw onto aligned and is near
    identity.  Substituting one for the other is not a rounding difference.
    """

    report, engine, lease, _planned = _run(tmp_path)
    applied = engine._applied
    assert applied is not None
    # The applied gauge is ``G^-1`` composed with the best-fit similarity of the
    # millimetre perturbation, so it is near ``1/GAUGE_SCALE`` but not equal to
    # it; the tolerance is the perturbation's own scale, not float noise, and
    # writing 1e-6 here would be claiming a measurement the fixture cannot make.
    assert abs(applied.scale - 1.0 / GAUGE_SCALE) < 1e-3
    assert abs(applied.scale - 1.0 / GAUGE_SCALE) > 1e-9
    # The declared proposal, by contrast, is near IDENTITY -- the two numbers are
    # 0.73 and 1.00, which no tolerance could confuse.
    assert abs(report["alignment"]["scale"] - 1.0) < 1e-3
    assert abs(applied.scale - report["alignment"]["scale"]) > 0.2

    work = lease / "work"
    snapshots = {}
    for label, token in (
        ("seed", "seed-model-v1.tar"),
        ("raw pre-BA", "raw-triangulated-model-snapshot-v1.tar"),
        ("aligned", "aligned-sparse-model-v1.tar"),
    ):
        descriptor = os.open(work / token, os.O_RDONLY)
        try:
            snapshots[label] = read_sparse_model_snapshot(
                descriptor, label=label, deadline=_deadline()
            )
        finally:
            os.close(descriptor)
    with pytest.raises(AdapterError) as raised:
        verify_child_alignment_proposal(
            seed=snapshots["seed"],
            raw_pre_ba=snapshots["raw pre-BA"],
            aligned=snapshots["aligned"],
            proposal=ProposedAlignment(
                scale=applied.scale,
                rotation=applied.rotation,
                translation=applied.translation,
                raw_pose_digest_sha256=report["alignment"]["rawPoseDigestSha256"],
                aligned_pose_digest_sha256=report["alignment"][
                    "alignedPoseDigestSha256"
                ],
            ),
            deadline=_deadline(),
        )
    assert str(raised.value) == (
        "recomputed alignment scale disagrees with the child's proposal"
    )


def test_the_declared_digests_are_over_the_exported_bytes(tmp_path):
    """A digest computed from anything but the archive would drift here."""

    report, _engine, lease, _planned = _run(tmp_path)
    work = lease / "work"
    for token, key in (
        ("raw-triangulated-model-snapshot-v1.tar", "rawPoseDigestSha256"),
        ("aligned-sparse-model-v1.tar", "alignedPoseDigestSha256"),
    ):
        descriptor = os.open(work / token, os.O_RDONLY)
        try:
            snapshot = read_sparse_model_snapshot(
                descriptor, label=token, deadline=_deadline()
            )
        finally:
            os.close(descriptor)
        assert canonical_pose_digest(snapshot) == report["alignment"][key]


def test_the_evidence_really_improves_and_is_not_one_snapshot_twice(tmp_path):
    from patina_scan_worker.refine_lifecycle import _require_evidence_moved
    from patina_scan_worker.refine_lifecycle import parse_engine_report

    report, _engine, _lease, _planned = _run(tmp_path)
    parsed = parse_engine_report(report)
    evidence = parsed.evidence
    # Not a tautology: the parent's own "bit-identical" refusal is run.
    _require_evidence_moved(evidence)
    assert evidence.reprojection_rmse_px_after < evidence.reprojection_rmse_px_before
    assert evidence.loop_rotation_rmse_deg_after < evidence.loop_rotation_rmse_deg_before
    assert (
        evidence.loop_translation_direction_rmse_deg_after
        < evidence.loop_translation_direction_rmse_deg_before
    )
    assert evidence.verified_loop_edges >= 1
    assert evidence.common_observations == FRAME_COUNT * TRACK_COUNT


def test_the_runner_verdict_accepts_this_evidence(tmp_path):
    """The reviewed verdict function, not a restatement of its thresholds."""

    from patina_scan_worker.refine_adapter import evaluate_refinement_evidence
    from patina_scan_worker.refine_lifecycle import parse_engine_report

    report, _engine, _lease, _planned = _run(tmp_path)
    verdict = evaluate_refinement_evidence(parse_engine_report(report).evidence)
    assert verdict.refinement_evidenced is True
    assert verdict.absolute_accuracy_certified is False


def test_the_cli_phase_is_the_frozen_argv_on_the_leased_surfaces(tmp_path):
    _report, _engine, lease, planned = _run(tmp_path)
    argv = planned["argv"]
    assert argv[0] == str(tmp_path / "prefix" / "bin" / "colmap")
    assert argv[1] == "point_triangulator"
    assert argv[-6:] == (
        "--clear_points",
        "1",
        "--refine_intrinsics",
        "0",
        "--Mapper.random_seed",
        "0",
    )
    options = dict(zip(argv[2:-1:2], argv[3::2]))
    assert options["--image_path"] == str(lease / "packet" / "images")
    assert options["--database_path"] == str(lease / "work" / "database-v1.db")
    assert options["--input_path"] == str(lease / "work" / "seed-model")
    assert options["--output_path"] == str(lease / "work" / "triangulated-model")
    assert planned["workspace"] == lease
    assert planned["cwd"] == lease / "work"
    assert planned["temp_directory"] == lease / "tmp"
    assert planned["cwd_at_run"] == lease / "work"


def test_that_argv_really_passes_the_production_allowlist(tmp_path):
    """The recorded planner records; the REAL allowlist is what accepts.

    ``plan_qualified_colmap_command`` cannot run off the box -- it re-proves the
    installed prefix against ``/opt/colmap/4.0.2`` -- so the argv this body emits
    is put through the same ``validate_allowlisted_argv`` the qualified planner
    calls, with a fake prefix.  What that proves is the SHAPE and the per-option
    surface confinement; what it cannot prove is the box identity.
    """

    from patina_scan_worker.refine_colmap_toolchain import validate_allowlisted_argv

    _report, _engine, lease, planned = _run(tmp_path)
    toolchain = _toolchain(tmp_path)
    try:
        argv = (str(Path(toolchain.identity.path)),) + planned["argv"][1:]
        accepted = validate_allowlisted_argv(
            argv,
            executable_path=toolchain.identity.path,
            workspace=lease,
        )
        assert accepted == argv
        # ... and the write option may not name the read-only packet surface.
        hostile = list(argv)
        hostile[hostile.index("--output_path") + 1] = str(
            lease / "packet" / "images"
        )
        with pytest.raises(AdapterError) as raised:
            validate_allowlisted_argv(
                hostile,
                executable_path=toolchain.identity.path,
                workspace=lease,
            )
        assert "must stay inside its workspace" in str(raised.value)
    finally:
        toolchain.close()


def test_the_pairs_file_is_the_deterministic_graph_and_is_exported(tmp_path):
    _report, _engine, lease, _planned = _run(tmp_path)
    pairs = build_engine_pair_graph(FIXTURE.packet().engine_request.frames)
    assert (lease / "work" / "pairs-v2.txt").read_bytes() == "".join(
        f"{first} {second}\n" for first, second in pairs
    ).encode("ascii")
    # The fixture really contains non-temporal loop candidates; without one the
    # overlap verdict below would be vacuous.
    ordinals = {name: index for index, name in enumerate(FIXTURE.names)}
    loops = [
        pair for pair in pairs if abs(ordinals[pair[0]] - ordinals[pair[1]]) > 10
    ]
    assert loops == [
        ("frame_000000.ppm", "frame_000012.ppm"),
        ("frame_000000.ppm", "frame_000013.ppm"),
        ("frame_000001.ppm", "frame_000013.ppm"),
    ]


def test_the_documents_are_canonical_and_carry_both_identities(tmp_path):
    _report, _engine, lease, _planned = _run(tmp_path)
    work = lease / "work"
    adapter_payload = (work / "adapter-v2.json").read_bytes()
    adapter = json.loads(adapter_payload)
    assert adapter_payload == _canonical_json(adapter)
    assert adapter["contract"] == body.ENGINE_ADAPTER_CONTRACT
    assert adapter["runId"] == RUN_ID
    assert adapter["selectedEngine"] == "colmap-4-known-pose-triangulate-ba"
    assert adapter["rotationPriorRepresented"] is True
    for index, row in enumerate(adapter["frames"]):
        assert row["engineImageName"] == f"frame_{index:06d}.ppm"
        assert row["sourceImageName"] == f"keyframe-{index:06d}.heic"
        assert row["sourceArchiveKey"] == ARCHIVE_KEY
        # Source identity never becomes an engine file name.
        assert not row["engineRelativePath"].endswith(".heic")

    command_payload = (work / "engine-command-evidence-v1.json").read_bytes()
    commands = json.loads(command_payload)
    assert command_payload == _canonical_json(commands)
    assert commands["contract"] == body.COMMAND_EVIDENCE_CONTRACT
    assert [row["phase"] for row in commands["commands"]] == [
        "colmap.point_triangulator"
    ]
    assert commands["commands"][0]["returncode"] == 0
    assert commands["commands"][0]["outputTail"] == "point_triangulator ok"
    assert [row["operation"] for row in commands["logicalPlan"]][:3] == [
        "pycolmap.extract_features",
        "pycolmap.rewrite_camera_rows",
        "pycolmap.match_image_pairs",
    ]


def test_the_telemetry_is_bounded_and_says_what_it_did_not_measure(tmp_path):
    report, _engine, _lease, _planned = _run(tmp_path)
    telemetry = report["telemetry"]
    assert telemetry["commandCount"] == 1
    assert telemetry["vramPeakMb"] == 0
    assert telemetry["iterations"] == 0
    metrics = telemetry["metrics"]
    assert len(metrics) <= 32
    assert metrics["vramPeakMeasured"] is False
    assert metrics["bundleIterationsMeasured"] is False
    assert metrics["verifiedLoopEdges"] == 3
    assert metrics["largestComponentFraction"] == 1.0
    assert metrics["engineImages"] == FRAME_COUNT
    assert metrics["withinPilotFrameRange"] is False
    # See ``test_the_declared_proposal_is_not_the_gauge_that_was_applied`` for
    # why this is 1e-3 rather than float noise.
    assert abs(metrics["gaugeScale"] - 1.0 / GAUGE_SCALE) < 1e-3
    assert abs(metrics["proposalScale"] - 1.0) < 1e-3
    for value in metrics.values():
        assert type(value) in (bool, int, float, str)


def test_the_binding_is_called_in_the_reviewed_order(tmp_path):
    _report, engine, _lease, _planned = _run(tmp_path)
    assert engine.calls == [
        "extract_gpu_features",
        "rewrite_intrinsics_preserving_ids",
        "match_explicit_pairs",
        "read_two_view_geometries",
        "read_keypoint_tables",
        "build_known_pose_seed",
        "inspect_model:triangulated-model",
        "read_model_tracks:triangulated-model",
        "bundle_adjust_with_success_evidence",
        "inspect_model:refined-model",
        "write_similarity_transformed_model",
        "read_model_tracks:aligned-model",
        "inspect_model:aligned-model",
    ]


# ===========================================================================
# Refusals, one clause each, each with its exact message
# ===========================================================================
def test_an_unqualified_toolchain_is_refused_before_anything_runs(tmp_path):
    context, lease = _lease(tmp_path)
    engine = _RecordedBinding(FIXTURE)
    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            FIXTURE.packet(),
            context=context,
            deadline=_deadline(),
            binding=engine,
            toolchain=_toolchain(tmp_path, qualified=False),
            command_runner=lambda *a, **k: None,
            planner=lambda *a, **k: None,
        )
    assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert str(raised.value) == "engine body requires the qualified COLMAP toolchain"
    assert engine.calls == []
    assert not list((lease / "work").iterdir())


def test_the_cli_version_is_already_pinned_by_the_box_identity(tmp_path):
    """Why the body does NOT re-check ``colmapVersion``, proved not asserted.

    A drifted CLI version cannot reach the body: the loader refuses to produce a
    qualified toolchain at all.  Writing a clause for it in the body would be a
    clause no input could reach, so this test stands in its place -- and it
    reddens if that loader guarantee is ever relaxed.
    """

    from _colmap_toolchain import load_fake_toolchain, write_toolchain

    prefix = tmp_path / "drifted"
    write_toolchain(prefix, manifest_overrides={"colmapVersion": "4.1.1"})
    with pytest.raises(AdapterError) as raised:
        load_fake_toolchain(prefix, qualified=True)
    assert str(raised.value) == (
        "COLMAP toolchain colmapVersion drifted from the qualified box"
    )


def test_an_imported_binding_that_disagrees_with_the_manifest_is_refused(tmp_path):
    """The one version fact the box identity does not already prove.

    ``pycolmapVersion`` in the manifest is a DECLARATION about a wheel; the
    module that actually imported reports its own ``__version__``.  A box whose
    installed wheel drifted from its manifest passes every toolchain check and
    is caught only here.
    """

    context, _lease_root = _lease(tmp_path)
    engine = _RecordedBinding(FIXTURE)
    engine.binding_version = "4.1.1"
    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            FIXTURE.packet(),
            context=context,
            deadline=_deadline(),
            binding=engine,
            toolchain=_toolchain(tmp_path),
            command_runner=lambda *a, **k: None,
            planner=lambda *a, **k: None,
        )
    assert raised.value.code == "REFINE_ENGINE_VERSION_MISMATCH"
    assert str(raised.value) == (
        "imported PyCOLMAP disagrees with the toolchain manifest"
    )
    assert engine.calls == []


def test_low_overlap_is_permanent_and_names_its_reason(tmp_path):
    """29 inliers is one below the reviewed floor, so every edge dies.

    THE CODE AND MESSAGE ARE NOT ENOUGH, and asserting only those left the
    clause deletable with zero red.  ``refine_evidence_builder`` runs the same
    reviewed classifier at the END of the run, so a body with no post-match
    verdict still fails with this exact code and this exact message -- after
    triangulating, bundle-adjusting and aligning, i.e. after spending the whole
    engine budget on a scan that was already known to be unusable.

    What the clause is FOR is failing before that, so that is what is asserted:
    the recorded binding must have stopped at ``match_explicit_pairs``, and the
    CLI phase must never have been planned.
    """

    context, _lease_root = _lease(tmp_path)
    engine = _RecordedBinding(FIXTURE, inliers=MIN_VERIFIED_INLIERS - 1)
    planned: dict = {}

    def planner(argv, **kwargs):
        planned["argv"] = tuple(argv)
        raise AssertionError("the CLI phase must not be reached on low overlap")

    def runner(plan, *, context, deadline, log_path, cwd):
        raise AssertionError("the CLI phase must not be run on low overlap")

    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            FIXTURE.packet(),
            context=context,
            deadline=_deadline(),
            binding=engine,
            toolchain=_toolchain(tmp_path),
            command_runner=runner,
            planner=planner,
        )
    assert raised.value.code == "REFINE_LOW_OVERLAP"
    assert str(raised.value) == "insufficient_verified_connected_coverage"
    # The verdict is taken immediately after matching, so these three calls and
    # no others may have happened.  Written out literally.
    assert engine.calls == [
        "extract_gpu_features",
        "rewrite_intrinsics_preserving_ids",
        "match_explicit_pairs",
    ]
    assert planned == {}


def test_a_failed_bundle_adjustment_is_never_downgraded(tmp_path):
    class _Unusable(_RecordedBinding):
        def bundle_adjust_with_success_evidence(self, **kwargs):
            super().bundle_adjust_with_success_evidence(**kwargs)
            return {"usable": False, "modelWritten": False, "numResiduals": 0}

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, binding=_Unusable(FIXTURE))
    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "bundle adjustment did not produce a usable refined model"
    )


def test_a_nonzero_triangulator_exit_is_a_refusal(tmp_path):
    context, lease = _lease(tmp_path)
    engine = _RecordedBinding(FIXTURE)

    def planner(argv, **kwargs):
        class _Plan:
            pass

        plan = _Plan()
        plan.argv = tuple(argv)
        return plan

    def runner(plan, *, context, deadline, log_path, cwd):
        log_path.write_text("boom\n", encoding="utf-8")
        return ColmapCommandResult(3, log_path, "segmentation fault")

    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            FIXTURE.packet(),
            context=context,
            deadline=_deadline(),
            binding=engine,
            toolchain=_toolchain(tmp_path),
            command_runner=runner,
            planner=planner,
        )
    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "COLMAP point_triangulator exited 3: segmentation fault"
    )


def test_a_model_that_registered_a_different_image_set_is_refused(tmp_path):
    class _DropsAnImage(_RecordedBinding):
        def inspect_model(self, path, *, log_path):
            evidence = super().inspect_model(path, log_path=log_path)
            if path.name == body.TRIANGULATED_MODEL_DIRECTORY:
                return ModelEvidence(
                    valid=True,
                    registered_image_ids=evidence.registered_image_ids[:-1],
                    image_names_by_id=evidence.image_names_by_id,
                    camera_ids_by_image_id=evidence.camera_ids_by_image_id,
                    camera_contract_by_id=evidence.camera_contract_by_id,
                    camera_centers_by_image_id=evidence.camera_centers_by_image_id,
                    num_points3d=evidence.num_points3d,
                    cam_from_world_by_image_id=evidence.cam_from_world_by_image_id,
                )
            return evidence

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, binding=_DropsAnImage(FIXTURE))
    assert str(raised.value) == (
        "triangulated model registered a different image set than the database"
    )


def test_a_seed_carrying_points_is_refused(tmp_path):
    class _SeedsWithPoints(_RecordedBinding):
        def build_known_pose_seed(self, **kwargs):
            evidence = super().build_known_pose_seed(**kwargs)
            return ModelEvidence(
                valid=evidence.valid,
                registered_image_ids=evidence.registered_image_ids,
                image_names_by_id=evidence.image_names_by_id,
                camera_ids_by_image_id=evidence.camera_ids_by_image_id,
                camera_contract_by_id=evidence.camera_contract_by_id,
                camera_centers_by_image_id=evidence.camera_centers_by_image_id,
                num_points3d=7,
                cam_from_world_by_image_id=evidence.cam_from_world_by_image_id,
            )

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, binding=_SeedsWithPoints(FIXTURE))
    assert str(raised.value) == (
        "known-pose seed must start with no triangulated points"
    )


def test_an_empty_triangulation_is_low_overlap(tmp_path):
    class _NoPoints(_RecordedBinding):
        def inspect_model(self, path, *, log_path):
            evidence = super().inspect_model(path, log_path=log_path)
            if path.name == body.TRIANGULATED_MODEL_DIRECTORY:
                return ModelEvidence(
                    valid=True,
                    registered_image_ids=evidence.registered_image_ids,
                    image_names_by_id=evidence.image_names_by_id,
                    camera_ids_by_image_id=evidence.camera_ids_by_image_id,
                    camera_contract_by_id=evidence.camera_contract_by_id,
                    camera_centers_by_image_id=evidence.camera_centers_by_image_id,
                    num_points3d=0,
                    cam_from_world_by_image_id=evidence.cam_from_world_by_image_id,
                )
            return evidence

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, binding=_NoPoints(FIXTURE))
    assert raised.value.code == "REFINE_LOW_OVERLAP"
    assert str(raised.value) == "triangulation produced no points"


def test_a_geometry_read_that_misses_a_candidate_pair_is_refused(tmp_path):
    class _ShortGeometry(_RecordedBinding):
        def read_two_view_geometries(self, **kwargs):
            return super().read_two_view_geometries(**kwargs)[:-1]

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, binding=_ShortGeometry(FIXTURE))
    assert str(raised.value) == (
        "two-view geometry read did not cover the candidate graph"
    )


def test_a_feature_pass_that_misses_an_image_is_refused(tmp_path):
    class _ShortFeatures(_RecordedBinding):
        def extract_gpu_features(self, **kwargs):
            return super().extract_gpu_features(**kwargs)[:-1]

    with pytest.raises(AdapterError) as raised:
        _run(tmp_path, binding=_ShortFeatures(FIXTURE))
    assert str(raised.value) == (
        "feature extraction did not cover the engine image universe"
    )


def test_a_packet_without_a_source_ledger_cannot_produce_evidence(tmp_path):
    from dataclasses import replace

    packet = replace(FIXTURE.packet(), source_ledger=None)
    context, _lease_root = _lease(tmp_path)
    engine = _RecordedBinding(FIXTURE)

    def planner(argv, **kwargs):
        class _Plan:
            pass

        plan = _Plan()
        plan.argv = tuple(argv)
        return plan

    def runner(plan, *, context, deadline, log_path, cwd):
        engine.write_triangulated(
            Path(plan.argv[plan.argv.index("--output_path") + 1])
        )
        log_path.write_text("ok\n", encoding="utf-8")
        return ColmapCommandResult(0, log_path, "ok")

    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            packet,
            context=context,
            deadline=_deadline(),
            binding=engine,
            toolchain=_toolchain(tmp_path),
            command_runner=runner,
            planner=planner,
        )
    assert str(raised.value) == "engine evidence requires the packet's source ledger"


def test_an_exhausted_deadline_stops_the_body_before_the_engine(tmp_path):
    context, _lease_root = _lease(tmp_path)
    engine = _RecordedBinding(FIXTURE)
    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            FIXTURE.packet(),
            context=context,
            deadline=RefineDeadline(time.monotonic() - 1.0),
            binding=engine,
            toolchain=_toolchain(tmp_path),
            command_runner=lambda *a, **k: None,
            planner=lambda *a, **k: None,
        )
    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
    assert engine.calls == []


def test_the_body_refuses_a_context_or_deadline_it_was_not_given(tmp_path):
    context, _lease_root = _lease(tmp_path)
    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            object(),  # type: ignore[arg-type]
            context=context,
            deadline=_deadline(),
            binding=_RecordedBinding(FIXTURE),
            toolchain=_toolchain(tmp_path),
        )
    assert str(raised.value) == "engine body requires an exact ExtractedColmapPacket"
    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            FIXTURE.packet(),
            context=object(),  # type: ignore[arg-type]
            deadline=_deadline(),
            binding=_RecordedBinding(FIXTURE),
            toolchain=_toolchain(tmp_path),
        )
    assert str(raised.value) == "engine body requires the carried native child context"
    with pytest.raises(AdapterError) as raised:
        run_primary_engine_body(
            FIXTURE.packet(),
            context=context,
            deadline=object(),  # type: ignore[arg-type]
            binding=_RecordedBinding(FIXTURE),
            toolchain=_toolchain(tmp_path),
        )
    assert str(raised.value) == "engine body requires the carried refine deadline"


# ===========================================================================
# The archive writer
# ===========================================================================
def test_the_archive_is_canonical_and_round_trips_through_the_parent(tmp_path):
    model = tmp_path / "model"
    _write_model(
        model,
        poses={
            name: (
                FIXTURE.image_ids[index],
                FIXTURE.camera_ids[index],
                *FIXTURE.seed_poses[name],
            )
            for index, name in enumerate(FIXTURE.names)
        },
        points={},
        keypoints=FIXTURE.keypoints,
    )
    destination = tmp_path / "model.tar"
    sha256, size = write_sparse_model_archive(model, destination, deadline=_deadline())
    payload = destination.read_bytes()
    assert sha256 == _sha256(payload)
    assert size == len(payload)
    assert len(payload) % 512 == 0
    assert payload[-1024:] == b"\x00" * 1024
    descriptor = os.open(destination, os.O_RDONLY)
    try:
        snapshot = read_sparse_model_snapshot(
            descriptor, label="round trip", deadline=_deadline()
        )
    finally:
        os.close(descriptor)
    assert snapshot.names() == FIXTURE.names


#: One row per required member, with the EXACT message each omission must
#: produce.  Written out literally rather than derived from
#: ``SPARSE_MODEL_REQUIRED_MEMBERS`` so that dropping a member from that tuple
#: reddens here instead of silently shrinking this parametrization.
_MISSING_REQUIRED_MEMBER_ROWS = (
    ("cameras.bin", "sparse model is missing cameras.bin"),
    ("images.bin", "sparse model is missing images.bin"),
    ("points3D.bin", "sparse model is missing points3D.bin"),
)


def test_the_missing_member_rows_cover_every_required_member():
    """The table above is the whole required set, not a convenient subset."""

    assert tuple(row[0] for row in _MISSING_REQUIRED_MEMBER_ROWS) == tuple(
        sorted(SPARSE_MODEL_REQUIRED_MEMBERS)
    )


@pytest.mark.parametrize(
    ("omitted", "message"),
    _MISSING_REQUIRED_MEMBER_ROWS,
    ids=[row[0] for row in _MISSING_REQUIRED_MEMBER_ROWS],
)
def test_the_archive_refuses_a_model_missing_a_required_member(
    tmp_path, omitted, message
):
    model = tmp_path / "model"
    _write_model(
        model,
        poses={
            name: (
                FIXTURE.image_ids[index],
                FIXTURE.camera_ids[index],
                *FIXTURE.seed_poses[name],
            )
            for index, name in enumerate(FIXTURE.names)
        },
        points={},
        keypoints=FIXTURE.keypoints,
    )
    (model / omitted).unlink()
    with pytest.raises(AdapterError) as raised:
        write_sparse_model_archive(
            model, tmp_path / "out.tar", deadline=_deadline()
        )
    assert str(raised.value) == message
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_the_archive_carries_the_optional_colmap_four_members_in_order(tmp_path):
    model = tmp_path / "model"
    _write_model(
        model,
        poses={
            name: (
                FIXTURE.image_ids[index],
                FIXTURE.camera_ids[index],
                *FIXTURE.seed_poses[name],
            )
            for index, name in enumerate(FIXTURE.names)
        },
        points={},
        keypoints=FIXTURE.keypoints,
    )
    (model / "rigs.bin").write_bytes(b"rig")
    (model / "frames.bin").write_bytes(b"frame")
    destination = tmp_path / "model.tar"
    write_sparse_model_archive(model, destination, deadline=_deadline())
    payload = destination.read_bytes()
    names = []
    offset = 0
    while offset < len(payload):
        header = payload[offset : offset + 512]
        if header == bytes(512):
            break
        name = header[:100].split(b"\x00")[0].decode("ascii")
        size = int(header[124:136].split(b"\x00")[0].strip() or b"0", 8)
        names.append(name)
        offset += 512 + ((size + 511) // 512) * 512
    assert names == ["cameras.bin", "frames.bin", "images.bin", "points3D.bin", "rigs.bin"]
    descriptor = os.open(destination, os.O_RDONLY)
    try:
        snapshot = read_sparse_model_snapshot(
            descriptor, label="optional members", deadline=_deadline()
        )
    finally:
        os.close(descriptor)
    assert snapshot.names() == FIXTURE.names


def test_the_child_and_parent_ustar_headers_agree(tmp_path):
    """The duplicated header builder must stay byte-identical to the parent's."""

    from patina_scan_worker.refine_lifecycle import _ustar_header as parent_header

    for name, size in (
        ("cameras.bin", 0),
        ("images.bin", 1),
        ("points3D.bin", 511),
        ("rigs.bin", 512),
        ("frames.bin", 8_294_417),
    ):
        assert body._ustar_header(name, size) == parent_header(name, size)


def test_the_evidence_artifact_roles_are_the_builders_own(tmp_path):
    """A literal table, so deleting a row on either side reddens."""

    from patina_scan_worker.refine_evidence_builder import _REQUIRED_SNAPSHOT_ARTIFACTS

    assert dict(EVIDENCE_ARTIFACT_ROLES) == {
        "database-v1.db": ("engine/database-v1.db", "application/vnd.sqlite3"),
        "raw-triangulated-model-snapshot-v1.tar": (
            "evidence/raw-triangulated-model-snapshot-v1.tar",
            "application/x-tar",
        ),
        "refined-model-snapshot-v1.tar": (
            "evidence/refined-model-snapshot-v1.tar",
            "application/x-tar",
        ),
    }
    assert dict(EVIDENCE_ARTIFACT_ROLES) == dict(_REQUIRED_SNAPSHOT_ARTIFACTS)


def test_the_refined_scratch_snapshot_is_never_an_exported_token():
    assert body.REFINED_MODEL_SNAPSHOT_NAME not in NATIVE_ENGINE_OUTPUT_TOKENS


def test_the_scratch_refined_snapshot_exists_but_does_not_leave(tmp_path):
    report, _engine, lease, _planned = _run(tmp_path)
    assert (lease / "work" / body.REFINED_MODEL_SNAPSHOT_NAME).is_file()
    assert body.REFINED_MODEL_SNAPSHOT_NAME not in report["outputs"]


# ===========================================================================
# The two solves, as arithmetic
# ===========================================================================
def test_the_gauge_and_the_proposal_are_different_solves(tmp_path):
    """Both are ``estimate_sim3``; they are not the same problem.

    Written as an independent recomputation from the exported archives rather
    than by reading the body's internals, so a body that solved the wrong pair
    of point sets reddens.
    """

    report, _engine, lease, _planned = _run(tmp_path)
    work = lease / "work"
    centres = {}
    for label, token in (
        ("raw", "raw-triangulated-model-snapshot-v1.tar"),
        ("aligned", "aligned-sparse-model-v1.tar"),
    ):
        descriptor = os.open(work / token, os.O_RDONLY)
        try:
            centres[label] = read_sparse_model_snapshot(
                descriptor, label=label, deadline=_deadline()
            ).centres()
        finally:
            os.close(descriptor)
    expected = estimate_sim3(centres["raw"], centres["aligned"])
    assert abs(expected.scale - report["alignment"]["scale"]) < 1e-12
    for row in range(3):
        for column in range(3):
            assert (
                abs(expected.rotation[row][column] - report["alignment"]["rotation"][row][column])
                < 1e-12
            )
        assert (
            abs(expected.translation[row] - report["alignment"]["translationMeters"][row])
            < 1e-12
        )


# ===========================================================================
# The helper guards the composed happy path never reaches
# ===========================================================================
# A composed run drives every helper below through its SUCCESS path only, so a
# mutation sweep found each of these clauses deletable with zero red.  Each test
# here constructs the refusing input for real -- a real over-long member name, a
# real short-read, a real name disagreement -- and asserts the exact message, so
# deleting the clause reddens exactly one row rather than none.


def test_the_ustar_header_refuses_a_name_that_does_not_fit(tmp_path):
    """100 bytes is the USTAR name field; 101 must refuse, not truncate."""

    del tmp_path
    with pytest.raises(AdapterError) as raised:
        body._ustar_header("a" * 101, 0)
    assert str(raised.value) == (
        "sparse model member name does not fit a canonical USTAR header"
    )
    assert raised.value.code == "REFINE_ENGINE_FAILED"
    # 100 is accepted, so the boundary is the boundary and not an off-by-one.
    assert len(body._ustar_header("a" * 100, 0)) == 512


@pytest.mark.parametrize(
    ("model", "destination"),
    (
        ("model", Path("out.tar")),
        (Path("model"), "out.tar"),
    ),
    ids=("model-is-a-str", "destination-is-a-str"),
)
def test_the_archive_writer_refuses_a_path_that_is_not_a_path(
    tmp_path, model, destination
):
    del tmp_path
    with pytest.raises(AdapterError) as raised:
        write_sparse_model_archive(model, destination, deadline=_deadline())
    assert str(raised.value) == "sparse model archiving needs exact paths"
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_the_archive_writer_refuses_a_deadline_it_was_not_given(tmp_path):
    """A bare float expiry is the plausible substitution; it is not a deadline."""

    with pytest.raises(AdapterError) as raised:
        write_sparse_model_archive(
            tmp_path / "model",
            tmp_path / "out.tar",
            deadline=time.monotonic() + 300.0,
        )
    assert str(raised.value) == (
        "sparse model archiving requires the carried refine deadline"
    )
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_the_archive_writer_refuses_a_member_that_ended_early(tmp_path):
    """A member that shrinks between its stat and its read is a short archive.

    WHAT IS REAL AND WHAT IS A TRIGGER, stated exactly.  The failure itself is
    real: ``points3D.bin`` is truncated on disk with ``os.truncate``, so the
    writer performs a genuine short read against a size it obtained from a
    genuine ``stat``.  Nothing fakes the read, the size, or the exception.

    ``Path.open`` is patched, but only as a CLOCK -- it fires the truncation at
    the one moment that makes the shrink observable (after every member has been
    stat-ed, before the last one is read).  A shrink-after-stat is otherwise a
    race, and a race is not a test.  The patch is not what the assertion
    measures: delete the ``if not block`` clause and this test still reddens,
    which is the property the mutation sweep checks.
    """

    model = tmp_path / "model"
    _write_model(
        model,
        poses={
            name: (
                FIXTURE.image_ids[index],
                FIXTURE.camera_ids[index],
                *FIXTURE.seed_poses[name],
            )
            for index, name in enumerate(FIXTURE.names)
        },
        points={},
        keypoints=FIXTURE.keypoints,
    )
    # cameras.bin is read first; points3D.bin is read last.  Truncating the last
    # member after the writer has already stat-ed it is exactly the shrink the
    # clause defends against.
    last = model / "points3D.bin"
    recorded = last.stat().st_size
    assert recorded > 0

    real_open = Path.open
    truncated = {"done": False}

    def opening(self, *args, **kwargs):
        # Fire once, when the writer opens the FIRST member for reading -- i.e.
        # after every stat has already been taken.
        if not truncated["done"] and self.name == "cameras.bin":
            truncated["done"] = True
            os.truncate(last, 0)
        return real_open(self, *args, **kwargs)

    Path.open = opening
    try:
        with pytest.raises(AdapterError) as raised:
            write_sparse_model_archive(
                model, tmp_path / "out.tar", deadline=_deadline()
            )
    finally:
        Path.open = real_open
    assert truncated["done"] is True
    assert str(raised.value) == "sparse model member points3D.bin ended early"
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def _snapshot_of(tmp_path, names, *, label):
    """Build a real SparseModelSnapshot by writing and parsing a real archive."""

    model = tmp_path / f"model-{label}"
    _write_model(
        model,
        poses={
            name: (
                index + 1,
                index + 1,
                *FIXTURE.seed_poses[FIXTURE.names[index]],
            )
            for index, name in enumerate(names)
        },
        points={},
        keypoints={name: FIXTURE.keypoints[FIXTURE.names[0]] for name in names},
    )
    destination = tmp_path / f"{label}.tar"
    write_sparse_model_archive(model, destination, deadline=_deadline())
    descriptor = os.open(destination, os.O_RDONLY)
    try:
        return read_sparse_model_snapshot(
            descriptor, label=label, deadline=_deadline()
        )
    finally:
        os.close(descriptor)


def test_the_gauge_solve_refuses_snapshots_with_different_names(tmp_path):
    left = _snapshot_of(tmp_path, FIXTURE.names, label="left")
    right = _snapshot_of(
        tmp_path, tuple(f"other_{index:06d}.ppm" for index in range(len(FIXTURE.names))),
        label="right",
    )
    with pytest.raises(AdapterError) as raised:
        body._restore_metric_gauge(left, right)
    assert str(raised.value) == "raw and refined snapshots carry different image names"
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_the_declared_proposal_refuses_snapshots_with_different_names(tmp_path):
    left = _snapshot_of(tmp_path, FIXTURE.names, label="left")
    right = _snapshot_of(
        tmp_path, tuple(f"other_{index:06d}.ppm" for index in range(len(FIXTURE.names))),
        label="right",
    )
    with pytest.raises(AdapterError) as raised:
        body._declare_alignment_proposal(left, right)
    assert str(raised.value) == "raw and aligned snapshots carry different image names"
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def _model_evidence(images, database_rows, **overrides):
    """A ModelEvidence that agrees with the database unless told otherwise."""

    ids = tuple(sorted(int(database_rows[image.name]["imageId"]) for image in images))
    fields = {
        "valid": True,
        "registered_image_ids": ids,
        "image_names_by_id": {
            int(database_rows[image.name]["imageId"]): image.name for image in images
        },
        "camera_ids_by_image_id": {
            int(database_rows[image.name]["imageId"]): int(
                database_rows[image.name]["cameraId"]
            )
            for image in images
        },
        "camera_contract_by_id": {},
        "camera_centers_by_image_id": {},
        "num_points3d": 1,
        "cam_from_world_by_image_id": {},
    }
    fields.update(overrides)
    return ModelEvidence(**fields)


def _covers_inputs():
    images = tuple(
        EngineImage(
            name=name,
            intrinsics=PinholeIntrinsics(*INTRINSICS),
            cam_from_world=ColmapPose(
                rotation=FIXTURE.seed_poses[name][0],
                translation=FIXTURE.seed_poses[name][1],
                qvec=(1.0, 0.0, 0.0, 0.0),
            ),
        )
        for name in FIXTURE.names
    )
    rows = {
        name: {"imageId": index + 1, "cameraId": index + 1}
        for index, name in enumerate(FIXTURE.names)
    }
    return images, rows


#: One row per clause in ``_require_model_covers``, with the exact message and
#: the exact evidence deformation that must produce it.  Written out literally
#: so deleting a clause reddens one row instead of shrinking this table.
_COVERS_ROWS = (
    ("invalid", {"valid": False}, "seed model is internally invalid"),
    (
        "wrong-id-set",
        {"registered_image_ids": (9999,)},
        "seed model registered a different image set than the database",
    ),
    (
        "wrong-name",
        {"image_names_by_id": {1: "frame_999999.ppm"}},
        "seed model image id does not carry its database name",
    ),
    (
        "wrong-camera",
        {"camera_ids_by_image_id": {1: 4242}},
        "seed model image does not carry its database camera",
    ),
)


@pytest.mark.parametrize(
    ("overrides", "message"),
    [(row[1], row[2]) for row in _COVERS_ROWS],
    ids=[row[0] for row in _COVERS_ROWS],
)
def test_the_model_cover_check_refuses_each_disagreement(overrides, message):
    images, rows = _covers_inputs()
    if "image_names_by_id" in overrides:
        base = {
            int(rows[image.name]["imageId"]): image.name for image in images
        }
        base.update(overrides["image_names_by_id"])
        overrides = dict(overrides, image_names_by_id=base)
    if "camera_ids_by_image_id" in overrides:
        base = {
            int(rows[image.name]["imageId"]): int(rows[image.name]["cameraId"])
            for image in images
        }
        base.update(overrides["camera_ids_by_image_id"])
        overrides = dict(overrides, camera_ids_by_image_id=base)
    evidence = _model_evidence(images, rows, **overrides)
    with pytest.raises(AdapterError) as raised:
        body._require_model_covers(evidence, images, rows, role="seed")
    assert str(raised.value) == message
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_the_model_cover_check_accepts_an_agreeing_model():
    """The four refusals above are refusals, not an unconditional raise."""

    images, rows = _covers_inputs()
    body._require_model_covers(_model_evidence(images, rows), images, rows, role="seed")


def _evidence_inputs(tmp_path):
    """Real packet, real parsed snapshots, real database rows and keypoints."""

    packet = FIXTURE.packet()
    raw = _snapshot_of(tmp_path, FIXTURE.names, label="ev-raw")
    aligned = _snapshot_of(tmp_path, FIXTURE.names, label="ev-aligned")
    rows = {
        name: {"imageId": index + 1, "cameraId": index + 1}
        for index, name in enumerate(FIXTURE.names)
    }
    return packet, raw, aligned, rows, dict(FIXTURE.keypoints)


def test_the_evidence_rows_are_built_when_every_binding_is_present(tmp_path):
    """The four refusals below are refusals, not an unconditional raise."""

    packet, raw, aligned, rows, keypoints = _evidence_inputs(tmp_path)
    built = body._evidence_frames(
        packet,
        raw=raw,
        aligned=aligned,
        database_rows=rows,
        keypoints=keypoints,
        deadline=_deadline(),
    )
    assert tuple(row.engine_image_name for row in built) == FIXTURE.names


def test_the_evidence_refuses_a_packet_without_its_adapter_ledger(tmp_path):
    from dataclasses import replace

    packet, raw, aligned, rows, keypoints = _evidence_inputs(tmp_path)
    with pytest.raises(AdapterError) as raised:
        body._evidence_frames(
            replace(packet, adapter_ledger=None),
            raw=raw,
            aligned=aligned,
            database_rows=rows,
            keypoints=keypoints,
            deadline=_deadline(),
        )
    assert str(raised.value) == "engine evidence requires the packet's adapter ledger"
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_the_evidence_refuses_a_packet_without_its_source_ledger(tmp_path):
    from dataclasses import replace

    packet, raw, aligned, rows, keypoints = _evidence_inputs(tmp_path)
    with pytest.raises(AdapterError) as raised:
        body._evidence_frames(
            replace(packet, source_ledger=None),
            raw=raw,
            aligned=aligned,
            database_rows=rows,
            keypoints=keypoints,
            deadline=_deadline(),
        )
    assert str(raised.value) == "engine evidence requires the packet's source ledger"
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_the_evidence_refuses_a_frame_with_no_database_identity(tmp_path):
    packet, raw, aligned, rows, keypoints = _evidence_inputs(tmp_path)
    del rows[FIXTURE.names[0]]
    with pytest.raises(AdapterError) as raised:
        body._evidence_frames(
            packet,
            raw=raw,
            aligned=aligned,
            database_rows=rows,
            keypoints=keypoints,
            deadline=_deadline(),
        )
    assert str(raised.value) == (
        f"database identity is missing for {FIXTURE.names[0]}"
    )
    assert raised.value.code == "REFINE_ENGINE_FAILED"


@pytest.mark.parametrize("empty", (False, True), ids=("absent", "empty"))
def test_the_evidence_refuses_a_frame_with_no_keypoint_table(tmp_path, empty):
    """An EMPTY table is refused as well as a missing one.

    ``not table`` is one clause covering both, and both are real database
    states: an image with no detected features has a row and an empty table.
    """

    packet, raw, aligned, rows, keypoints = _evidence_inputs(tmp_path)
    if empty:
        keypoints[FIXTURE.names[0]] = ()
    else:
        del keypoints[FIXTURE.names[0]]
    with pytest.raises(AdapterError) as raised:
        body._evidence_frames(
            packet,
            raw=raw,
            aligned=aligned,
            database_rows=rows,
            keypoints=keypoints,
            deadline=_deadline(),
        )
    assert str(raised.value) == (
        f"database keypoint table is missing for {FIXTURE.names[0]}"
    )
    assert raised.value.code == "REFINE_ENGINE_FAILED"


def test_an_artifact_that_changed_between_packing_and_hashing_is_refused(tmp_path):
    """The three archives are hashed twice, and the two hashes must agree.

    Same split as the short-read test above: the CHANGE is real -- the seed
    archive's bytes are genuinely overwritten on disk -- and ``Path.open`` is
    used only to fire it after the archive was packed and before the report's
    hashing loop reaches it.  The clause under test is the comparison, and
    deleting it reddens this row.
    """

    context, lease = _lease(tmp_path)
    engine = _RecordedBinding(FIXTURE)
    work = lease / "work"
    fired = {"done": False}
    real_open = Path.open

    def opening(self, *args, **kwargs):
        # ``adapter-v2.json`` is the FIRST token in canonical order, so its open
        # is the start of the hashing loop -- every archive is already packed.
        if not fired["done"] and self.name == "adapter-v2.json":
            fired["done"] = True
            seed = work / "seed-model-v1.tar"
            if seed.is_file():
                real_open(seed, "r+b").write(b"\xff" * 512)
        return real_open(self, *args, **kwargs)

    def planner(argv, **kwargs):
        class _Plan:
            pass

        plan = _Plan()
        plan.argv = tuple(argv)
        return plan

    def runner(plan, *, context, deadline, log_path, cwd):
        engine.write_triangulated(
            Path(plan.argv[plan.argv.index("--output_path") + 1])
        )
        log_path.write_text("ok\n", encoding="utf-8")
        return ColmapCommandResult(0, log_path, "ok")

    Path.open = opening
    try:
        with pytest.raises(AdapterError) as raised:
            run_primary_engine_body(
                FIXTURE.packet(),
                context=context,
                deadline=_deadline(),
                binding=engine,
                toolchain=_toolchain(tmp_path),
                command_runner=runner,
                planner=planner,
            )
    finally:
        Path.open = real_open
    assert fired["done"] is True
    assert str(raised.value) == (
        "seed-model-v1.tar changed between packing and hashing"
    )
    assert raised.value.code == "REFINE_ENGINE_FAILED"
