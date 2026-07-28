"""Item 6: the parent recomputes the alignment; the child's proposal is a claim.

WHAT THESE TESTS BUILD FOR REAL.  Every snapshot in this file is a real USTAR
archive carrying real COLMAP sparse-model binary records, packed byte by byte by
``_pack_ustar`` / ``_cameras_bin`` / ``_images_bin`` below.  Nothing monkeypatches
``os.pread``, ``os.fstat``, ``struct``, or any function inside the module under
test: a refusal is provoked by writing bytes that deserve it.

WHAT THE HAPPY PATH ACTUALLY PROVES.  The aligned model is constructed by
applying a similarity ``T_true`` -- chosen in closed form, never solved for -- to
the raw pre-BA model, with the pose rotations carried through by quaternion
algebra written here rather than borrowed from the module.  The parent then has
to RECOVER ``T_true`` from the two archives with its own Horn solve.  A test that
declared the proposal by calling the module's own solver would prove only that a
number equals itself.

THE ONE HONEST GAP, stated here because it belongs next to the tests rather than
in a report: no archive in this file came out of COLMAP.  The binary layout is
implemented from the documented sparse-model format on both sides, so these
tests prove the parser is self-consistent, bounded, and fails closed on drift --
they cannot prove it agrees with a real ``pycolmap==4.0.2`` writer.
"""

from __future__ import annotations

import ast
import hashlib
import inspect
import math
import os
import pathlib
import struct
import subprocess
import sys
import time

import pytest

from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker import refine_model_alignment as alignment
from patina_scan_worker.refine_model_alignment import (
    ALIGNED_GAUGE_MAX_ROTATION_RAD,
    ALIGNED_GAUGE_MAX_SCALE_DEVIATION,
    ALIGNED_GAUGE_MAX_TRANSLATION_M,
    ALIGNED_MAX_ORIENTATION_CHANGE_RAD,
    ALIGNMENT_DEGENERATE_CODE,
    ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION,
    ALIGNMENT_MIN_CORRESPONDENCES,
    ALIGNMENT_MIN_PRINCIPAL_EXTENT_M,
    ALIGNMENT_MIN_PRINCIPAL_EXTENT_RATIO,
    ALIGNMENT_MODEL_INVALID_CODE,
    ALIGNMENT_ROTATION_TOLERANCE_RAD,
    ALIGNMENT_SCALE_RELATIVE_TOLERANCE,
    ALIGNMENT_TRANSLATION_TOLERANCE_M,
    ALIGNMENT_UNVERIFIED_CODE,
    DEADLINE_CHECK_INTERVAL,
    PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE,
    POSE_DIGEST_MAX_QUANTISED_MAGNITUDE,
    POSE_DIGEST_MAX_TRANSLATION_M,
    POSE_DIGEST_QUATERNION_QUANTUM,
    POSE_DIGEST_TRANSLATION_QUANTUM_M,
    POSE_DIGEST_VERSION,
    RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M,
    RAW_SNAPSHOT_ROTATION_DRIFT_TOLERANCE_RAD,
    SPARSE_MODEL_CANONICAL_MEMBER_ORDER,
    SPARSE_MODEL_MAX_ARCHIVE_BYTES,
    SPARSE_MODEL_MAX_IMAGES,
    SPARSE_MODEL_MAX_IMAGE_NAME_BYTES,
    SPARSE_MODEL_MAX_PARSED_MEMBER_BYTES,
    SPARSE_MODEL_OPTIONAL_MEMBERS,
    SPARSE_MODEL_REQUIRED_MEMBERS,
    ProposedAlignment,
    SparseModelPose,
    SparseModelSnapshot,
    canonical_pose_digest,
    read_sparse_model_snapshot,
    verify_child_alignment_proposal,
)

# ---------------------------------------------------------------------------
# Byte-level builders.  These are the whole reason the suite can construct a
# refusal instead of injecting one.
# ---------------------------------------------------------------------------
_BLOCK = 512


def _checksummed(header: bytearray) -> bytes:
    header[148:156] = b" " * 8
    header[148:156] = ("%06o\x00 " % sum(header)).encode("ascii")
    return bytes(header)


def _tar_header(
    name: str,
    size: int,
    *,
    mode: int = 0o644,
    uid: int = 0,
    gid: int = 0,
    mtime: int = 0,
    typeflag: bytes = b"0",
    magic: bytes = b"ustar\x00",
    version: bytes = b"00",
    prefix: bytes = b"",
    linkname: bytes = b"",
    raw_size: bytes | None = None,
) -> bytearray:
    header = bytearray(_BLOCK)
    encoded = name.encode("ascii", "surrogateescape") if isinstance(name, str) else name
    header[0 : len(encoded)] = encoded
    header[100:108] = ("%07o\x00" % mode).encode("ascii")
    header[108:116] = ("%07o\x00" % uid).encode("ascii")
    header[116:124] = ("%07o\x00" % gid).encode("ascii")
    header[124:136] = raw_size if raw_size is not None else ("%011o\x00" % size).encode("ascii")
    header[136:148] = ("%011o\x00" % mtime).encode("ascii")
    header[156:157] = typeflag
    header[157 : 157 + len(linkname)] = linkname
    header[257:263] = magic
    header[263:265] = version
    header[345 : 345 + len(prefix)] = prefix
    return header


def _pack_ustar(members, *, end_blocks: int = 2, trailing: bytes = b"") -> bytes:
    blocks: list[bytes] = []
    for entry in members:
        if isinstance(entry, bytes):
            blocks.append(entry)
            continue
        name, payload = entry[0], entry[1]
        overrides = entry[2] if len(entry) > 2 else {}
        header = _tar_header(name, len(payload), **overrides)
        blocks.append(_checksummed(header))
        blocks.append(payload)
        blocks.append(bytes((-len(payload)) % _BLOCK))
    blocks.append(bytes(_BLOCK * end_blocks))
    blocks.append(trailing)
    return b"".join(blocks)


def _cameras_bin(camera_ids, *, model_id: int = 1, params: int = 4) -> bytes:
    payload = struct.pack("<Q", len(camera_ids))
    for camera_id in camera_ids:
        payload += struct.pack("<IiQQ", camera_id, model_id, 1920, 1440)
        payload += struct.pack("<%dd" % params, *([1000.0, 1000.0, 960.0, 720.0][:params]))
    return payload


def _images_bin(rows, *, declared_count: int | None = None) -> bytes:
    payload = struct.pack("<Q", len(rows) if declared_count is None else declared_count)
    for row in rows:
        image_id, qvec, tvec, camera_id, name, observations = row
        payload += struct.pack("<I7dI", image_id, *qvec, *tvec, camera_id)
        payload += (name.encode("ascii", "surrogateescape") if isinstance(name, str) else name)
        payload += b"\x00"
        payload += struct.pack("<Q", observations)
        for index in range(observations):
            payload += struct.pack("<ddQ", float(index), float(index) + 0.5, index + 1)
    return payload


def _archive(rows, *, camera_ids=None, extra_members=(), **pack_kwargs) -> bytes:
    ids = sorted({row[3] for row in rows}) if camera_ids is None else camera_ids
    members = [
        ("cameras.bin", _cameras_bin(ids)),
        ("images.bin", _images_bin(rows)),
        ("points3D.bin", struct.pack("<Q", 0)),
    ]
    members.extend(extra_members)
    members.sort(key=lambda member: SPARSE_MODEL_CANONICAL_MEMBER_ORDER.index(member[0]))
    return _pack_ustar(members, **pack_kwargs)


def _write(tmp_path, payload: bytes, name: str = "model.tar") -> int:
    path = tmp_path / name
    path.write_bytes(payload)
    return os.open(str(path), os.O_RDONLY)


def _write_with_hole(tmp_path, name: str, before: bytes, hole: int, after: bytes) -> int:
    """Write an archive whose middle is a filesystem HOLE, not written bytes.

    The ceiling tests need archives of half a gigabyte and two gigabytes.  An
    earlier revision materialised those for real, which is not a test cost worth
    paying -- across a mutation sweep it wrote tens of gigabytes and filled the
    host.  Seeking past the end of the file and writing after it leaves the gap
    unallocated on every filesystem this repository targets, and the file still
    reports its full size to ``fstat``, which is the only thing the ceiling
    checks read.  If a filesystem materialises it anyway, the test SKIPS rather
    than quietly consuming the disk.
    """

    path = tmp_path / name
    total = len(before) + hole + len(after)
    with open(path, "wb") as handle:
        handle.write(before)
        if hole:
            handle.seek(hole, os.SEEK_CUR)
        if after:
            handle.write(after)
        handle.flush()
        # Seeking past the end does not extend the file on its own, so set the
        # final length explicitly; ``ftruncate`` extends with a hole too.
        os.ftruncate(handle.fileno(), total)
    written = len(before) + len(after)
    allocated = os.stat(str(path)).st_blocks * 512
    if hole and allocated > written + 16 * 1024 * 1024:
        pytest.skip(
            "this filesystem materialised %d bytes for a %d-byte hole, so the"
            " ceiling cannot be constructed here without really writing it"
            % (allocated, hole)
        )
    return os.open(str(path), os.O_RDONLY)


# ---------------------------------------------------------------------------
# Quaternion algebra, written here so the fixtures never borrow the module's.
# ---------------------------------------------------------------------------
def _quat_mul(left, right):
    lw, lx, ly, lz = left
    rw, rx, ry, rz = right
    return (
        lw * rw - lx * rx - ly * ry - lz * rz,
        lw * rx + lx * rw + ly * rz - lz * ry,
        lw * ry - lx * rz + ly * rw + lz * rx,
        lw * rz + lx * ry - ly * rx + lz * rw,
    )


def _quat_conjugate(value):
    return (value[0], -value[1], -value[2], -value[3])


def _axis_angle_quaternion(axis, angle):
    norm = math.sqrt(sum(component * component for component in axis))
    unit = tuple(component / norm for component in axis)
    half = angle / 2.0
    sine = math.sin(half)
    return (math.cos(half), unit[0] * sine, unit[1] * sine, unit[2] * sine)


def _rotate(quaternion, vector):
    w, x, y, z = quaternion
    return (
        (1 - 2 * (y * y + z * z)) * vector[0]
        + 2 * (x * y - z * w) * vector[1]
        + 2 * (x * z + y * w) * vector[2],
        2 * (x * y + z * w) * vector[0]
        + (1 - 2 * (x * x + z * z)) * vector[1]
        + 2 * (y * z - x * w) * vector[2],
        2 * (x * z - y * w) * vector[0]
        + 2 * (y * z + x * w) * vector[1]
        + (1 - 2 * (x * x + y * y)) * vector[2],
    )


def _quaternion_matrix(quaternion):
    return tuple(
        _rotate(quaternion, basis)
        for basis in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
    )


def _transposed(matrix):
    return tuple(tuple(matrix[col][row] for col in range(3)) for row in range(3))


# The matrix built column-by-column above is R^T; transpose it once, here, so
# every caller works with R itself.
def _rotation_of(quaternion):
    return _transposed(_quaternion_matrix(quaternion))


# ---------------------------------------------------------------------------
# The fixture trajectory: a room-scale helical walk, genuinely three
# dimensional so it clears the conditioning floors on its own merits.
# ---------------------------------------------------------------------------
_IMAGE_COUNT = 12


def _seed_rows():
    rows = []
    for index in range(_IMAGE_COUNT):
        angle = 2.0 * math.pi * index / _IMAGE_COUNT
        centre = (
            2.0 * math.cos(angle),
            2.0 * math.sin(angle),
            0.4 + 0.9 * (index / (_IMAGE_COUNT - 1)),
        )
        quaternion = _axis_angle_quaternion((0.1, 0.2, 1.0), angle * 0.7 + 0.3)
        rotation = _rotation_of(quaternion)
        translation = tuple(
            -sum(rotation[row][col] * centre[col] for col in range(3)) for row in range(3)
        )
        rows.append(
            (
                100 + index,
                quaternion,
                translation,
                200 + index,
                "frame-%03d.jpg" % index,
                3,
            )
        )
    return rows


def _apply_similarity(rows, *, scale, quaternion, translation):
    """Return ``rows`` carried through the similarity, poses and all.

    ``centre' = s R centre + t`` and ``q_cam' = q_cam (x) conj(q_T)`` -- the
    quaternion form of ``R_cam' = R_cam R^T``, which is what a world Sim(3)
    does to a world-to-camera pose.
    """

    moved = []
    for image_id, cam_quaternion, cam_translation, camera_id, name, observations in rows:
        rotation = _rotation_of(cam_quaternion)
        centre = tuple(
            -sum(rotation[col][row] * cam_translation[col] for col in range(3))
            for row in range(3)
        )
        rotated = _rotate(quaternion, centre)
        new_centre = tuple(scale * rotated[axis] + translation[axis] for axis in range(3))
        new_quaternion = _quat_mul(cam_quaternion, _quat_conjugate(quaternion))
        new_rotation = _rotation_of(new_quaternion)
        new_translation = tuple(
            -sum(new_rotation[row][col] * new_centre[col] for col in range(3))
            for row in range(3)
        )
        moved.append(
            (image_id, new_quaternion, new_translation, camera_id, name, observations)
        )
    return moved


#: The transform the "child" is deemed to have computed.  Chosen, not solved:
#: recovering it is the parent's job and the whole point of the happy path.
_TRUE_SCALE = 1.0021
_TRUE_QUATERNION = _axis_angle_quaternion((0.3, -0.5, 0.81), 0.0037)
_TRUE_TRANSLATION = (0.012, -0.0231, 0.0074)


def _alive_deadline(seconds: float = 600.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _snapshot(tmp_path, rows, name):
    descriptor = _write(tmp_path, _archive(rows), name)
    try:
        return read_sparse_model_snapshot(
            descriptor, label=name, deadline=_alive_deadline()
        )
    finally:
        os.close(descriptor)


@pytest.fixture
def models(tmp_path):
    seed_rows = _seed_rows()
    aligned_rows = _apply_similarity(
        seed_rows,
        scale=_TRUE_SCALE,
        quaternion=_TRUE_QUATERNION,
        translation=_TRUE_TRANSLATION,
    )
    seed = _snapshot(tmp_path, seed_rows, "seed")
    raw = _snapshot(tmp_path, seed_rows, "raw")
    aligned = _snapshot(tmp_path, aligned_rows, "aligned")
    proposal = ProposedAlignment(
        scale=_TRUE_SCALE,
        rotation=_rotation_of(_TRUE_QUATERNION),
        translation=_TRUE_TRANSLATION,
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    return seed, raw, aligned, proposal


def _verify(models, **overrides):
    seed, raw, aligned, proposal = models
    return verify_child_alignment_proposal(
        seed=overrides.get("seed", seed),
        raw_pre_ba=overrides.get("raw_pre_ba", raw),
        aligned=overrides.get("aligned", aligned),
        proposal=overrides.get("proposal", proposal),
        deadline=overrides.get("deadline", _alive_deadline()),
    )


def _replace(proposal, **changes):
    fields = {
        "scale": proposal.scale,
        "rotation": proposal.rotation,
        "translation": proposal.translation,
        "raw_pose_digest_sha256": proposal.raw_pose_digest_sha256,
        "aligned_pose_digest_sha256": proposal.aligned_pose_digest_sha256,
    }
    fields.update(changes)
    return ProposedAlignment(**fields)


# ===========================================================================
# Posture
# ===========================================================================
def test_item_six_implements_the_capability_and_claims_nothing_more():
    """Implemented is not qualified, and this module must not blur the two."""

    from patina_scan_worker.refine_native_process import (
        NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT,
    )

    assert PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE is False
    assert NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT is False


#: The COMPLETE set of files inside ``patina_scan_worker`` that may import this
#: module, written out literally rather than derived from the tree.  Item 7's
#: composed lifecycle is the caller this module was built for; every other
#: importer would mean a disabled stage had quietly acquired one, which is the
#: drift this program keeps catching.  An unexpected edge reddens because the
#: comparison is EQUALITY against this tuple, not membership in it.
#:
#: THE SECOND EDGE IS THE CHILD BODY, and it is here deliberately rather than by
#: accident.  ``refine_colmap_engine_body`` runs inside the spawned child and
#: imports the PARSER half of this module -- the two reads, the snapshot type
#: and the two member-order constants, enumerated literally in
#: :data:`EXPECTED_CHILD_BODY_IMPORTS`.  It uses them to parse ITS OWN
#: just-written archives, so every scalar the child declares -- both similarity
#: solves and both pose digests -- is a statement about the bytes the parent is
#: about to receive rather than about an in-memory reconstruction.  The parent
#: then runs the SAME parser over the SAME bytes in
#: ``verify_child_alignment_proposal``.
#: A child that derived its numbers from a different parser could disagree with
#: the parent for reasons that are not the child's fault, and the disagreement
#: would be indistinguishable from a real refusal.
#:
#: What the child does NOT import is the verifier: ``verify_child_alignment_
#: proposal`` is the parent's, and ``test_the_child_body_imports_the_parser_and_
#: not_the_verifier`` below asserts that exact split, so this edge cannot widen
#: into the child grading its own proposal.
EXPECTED_IN_PACKAGE_IMPORTERS = (
    "refine_colmap_engine_body.py",
    "refine_lifecycle.py",
)


def test_exactly_the_composed_lifecycle_imports_this_module():
    """The "who composes the verifier" claim, made load-bearing.

    Before item 7 this asserted an empty set.  It now asserts the exact edge set,
    for the reason stated on :data:`EXPECTED_IN_PACKAGE_IMPORTERS`: widening the
    assertion to "at most one importer" or to a membership test would let a
    second, unreviewed caller appear without a failure.  Comments and docstrings
    may NAME the module; only the listed files may import it.
    """

    package = pathlib.Path(alignment.__file__).resolve().parent
    importers = []
    for module in sorted(package.rglob("*.py")):
        if module.name == "refine_model_alignment.py":
            continue
        tree = ast.parse(module.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module and (
                "refine_model_alignment" in node.module
            ):
                importers.append(module.name)
            elif isinstance(node, ast.ImportFrom) and node.level:
                if any(name.name == "refine_model_alignment" for name in node.names):
                    importers.append(module.name)
            elif isinstance(node, ast.Import) and any(
                "refine_model_alignment" in name.name for name in node.names
            ):
                importers.append(module.name)
    assert tuple(sorted(set(importers))) == EXPECTED_IN_PACKAGE_IMPORTERS
    # One edge per importing file, so a second import statement inside the same
    # file -- a plausible way to smuggle a second call site past a set-based
    # assertion -- is also visible here.
    assert importers == list(EXPECTED_IN_PACKAGE_IMPORTERS)


#: Exactly what the child body may take from this module, written out literally
#: so that deleting a name from the body's import list reddens rather than
#: silently shrinking the comparison.  Every entry is a PARSER concern.
EXPECTED_CHILD_BODY_IMPORTS = (
    "SPARSE_MODEL_CANONICAL_MEMBER_ORDER",
    "SPARSE_MODEL_REQUIRED_MEMBERS",
    "SparseModelSnapshot",
    "canonical_pose_digest",
    "read_sparse_model_snapshot",
)

#: The verifier half.  The child grading its own alignment proposal is the exact
#: failure the parent-side recomputation exists to prevent, so these names must
#: not appear in the child body at all -- not as an import, and not as an
#: attribute reached through a module object.
FORBIDDEN_CHILD_BODY_NAMES = (
    "verify_child_alignment_proposal",
    "ChildAlignmentProposal",
)


def test_the_child_body_imports_the_parser_and_not_the_verifier():
    """The second importer's edge is narrow, and narrow in the right direction.

    ``refine_colmap_engine_body`` is allowed to parse the archives it just wrote
    with the parent's parser -- that is what makes the child's declared digests
    statements about the exported bytes.  It is NOT allowed to reach the
    verifier: the parent recomputes the alignment precisely so that the child's
    proposal is graded by something the child did not run.
    """

    package = pathlib.Path(alignment.__file__).resolve().parent
    body = package / "refine_colmap_engine_body.py"
    assert body.is_file(), f"child body missing: {body}"
    source = body.read_text()
    tree = ast.parse(source)

    imported: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.module is None or "refine_model_alignment" not in node.module:
            continue
        imported.extend(name.name for name in node.names)
    assert tuple(sorted(imported)) == EXPECTED_CHILD_BODY_IMPORTS
    # One name per import, so a duplicate alias cannot hide inside the sort.
    assert len(imported) == len(EXPECTED_CHILD_BODY_IMPORTS)

    # The forbidden names must be absent as identifiers AND as attributes, so
    # `alignment.verify_child_alignment_proposal(...)` is caught too.
    reached: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_CHILD_BODY_NAMES:
            reached.append(node.id)
        elif isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_CHILD_BODY_NAMES:
            reached.append(node.attr)
    assert reached == []


def test_the_one_importer_is_not_reachable_from_the_worker_dispatch_table():
    """The edge is allowed because it lands somewhere unreachable, not because
    it is small.  ``stages/`` must import nothing named ``refine``, and the
    refine task type must still resolve to no handler."""

    from patina_scan_worker.stages import get_handler

    package = pathlib.Path(alignment.__file__).resolve().parent
    for module in sorted((package / "stages").rglob("*.py")):
        source = module.read_text()
        for node in ast.walk(ast.parse(source)):
            names: list[str] = []
            if isinstance(node, ast.ImportFrom):
                names.append(node.module or "")
                names.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.Import):
                names.extend(alias.name for alias in node.names)
            assert not any("refine" in name for name in names), module.name
    assert get_handler("scan_pipeline.refine") is None


def test_the_parent_recomputation_shares_no_dependency_with_the_child():
    """The independence claim is the design; pin it against the import list.

    Written out literally rather than derived from the module, so that adding an
    import reddens instead of silently widening an expected set.
    """

    source = inspect.getsource(alignment)
    imported: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            imported.update(name.name.split(".")[0] for name in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.add(node.module.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.level:
            imported.add("." + (node.module or ""))
    assert imported == {
        "__future__",
        "collections",
        "dataclasses",
        "hashlib",
        "math",
        "os",
        "struct",
        ".refine_adapter",
    }


def test_importing_the_module_pulls_in_neither_numpy_nor_pycolmap():
    """The independence claim says "directly or transitively"; measure it.

    A fresh isolated interpreter imports only this module, then reports what
    landed in ``sys.modules``.  The AST test above pins the direct imports; this
    one is the only thing that can catch a transitive one arriving through
    ``refine_adapter`` later.
    """

    package_root = pathlib.Path(alignment.__file__).resolve().parent.parent
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys;"
            " sys.path.insert(0, %r);" % str(package_root)
            + " import patina_scan_worker.refine_model_alignment;"
            " print(sorted(n for n in sys.modules if n.split('.')[0]"
            " in {'numpy', 'pycolmap', 'scipy', 'torch'}))",
        ],
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == "[]"


def test_the_member_universe_is_internally_consistent():
    """Required plus optional must be exactly the canonical order, or one lies."""

    assert set(SPARSE_MODEL_REQUIRED_MEMBERS) | set(SPARSE_MODEL_OPTIONAL_MEMBERS) == set(
        SPARSE_MODEL_CANONICAL_MEMBER_ORDER
    )
    assert not set(SPARSE_MODEL_REQUIRED_MEMBERS) & set(SPARSE_MODEL_OPTIONAL_MEMBERS)


def test_every_tolerance_is_a_pinned_constant_with_a_stated_unit():
    """Write the table out literally: deleting a row must redden, not shrink."""

    assert ALIGNMENT_SCALE_RELATIVE_TOLERANCE == 1.0e-6
    assert ALIGNMENT_ROTATION_TOLERANCE_RAD == 1.0e-6
    assert ALIGNMENT_TRANSLATION_TOLERANCE_M == 1.0e-6
    assert RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M == 1.0e-6
    assert RAW_SNAPSHOT_ROTATION_DRIFT_TOLERANCE_RAD == 1.0e-6
    assert ALIGNMENT_MIN_CORRESPONDENCES == 8
    assert ALIGNMENT_MIN_PRINCIPAL_EXTENT_M == 1.0e-3
    assert ALIGNMENT_MIN_PRINCIPAL_EXTENT_RATIO == 1.0e-3
    assert ALIGNED_GAUGE_MAX_SCALE_DEVIATION == 0.05
    assert ALIGNED_GAUGE_MAX_ROTATION_RAD == 0.05
    assert ALIGNED_GAUGE_MAX_TRANSLATION_M == 0.25
    assert ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION == 0.5
    assert ALIGNED_MAX_ORIENTATION_CHANGE_RAD == 0.5
    assert POSE_DIGEST_QUATERNION_QUANTUM == 1.0e-9
    assert POSE_DIGEST_TRANSLATION_QUANTUM_M == 1.0e-9
    assert POSE_DIGEST_VERSION == "refine-pose-digest-v1"
    assert DEADLINE_CHECK_INTERVAL == 32
    assert SPARSE_MODEL_MAX_IMAGES == 400
    assert SPARSE_MODEL_MAX_ARCHIVE_BYTES == 2 * 1024 * 1024 * 1024
    assert SPARSE_MODEL_MAX_PARSED_MEMBER_BYTES == 512 * 1024 * 1024
    assert SPARSE_MODEL_MAX_IMAGE_NAME_BYTES == 255
    assert SPARSE_MODEL_REQUIRED_MEMBERS == (
        "cameras.bin",
        "images.bin",
        "points3D.bin",
    )
    assert SPARSE_MODEL_OPTIONAL_MEMBERS == ("frames.bin", "rigs.bin")
    assert SPARSE_MODEL_CANONICAL_MEMBER_ORDER == (
        "cameras.bin",
        "frames.bin",
        "images.bin",
        "points3D.bin",
        "rigs.bin",
    )
    assert ALIGNMENT_MODEL_INVALID_CODE == "REFINE_ALIGNMENT_MODEL_INVALID"
    assert ALIGNMENT_DEGENERATE_CODE == "REFINE_ALIGNMENT_DEGENERATE"
    assert ALIGNMENT_UNVERIFIED_CODE == "REFINE_ALIGNMENT_UNVERIFIED"


def test_the_conditioning_floor_is_derived_from_the_rotation_tolerance():
    """The floor is not a magic number; the derivation has to hold arithmetically.

    An out-of-plane rotation solved from a set whose weak axis spans ``d`` metres
    with per-point noise ``n`` is determined to about ``n / d`` radians.  The
    module claims a 1e-9 m serialisation noise floor and a 1e-6 rad tolerance.
    """

    serialisation_noise_m = 1.0e-9
    assert (
        serialisation_noise_m / ALIGNMENT_MIN_PRINCIPAL_EXTENT_M
        <= ALIGNMENT_ROTATION_TOLERANCE_RAD
    )


# ===========================================================================
# Archive parsing
# ===========================================================================
def test_a_canonical_snapshot_parses_into_name_ordered_poses(tmp_path):
    rows = _seed_rows()
    descriptor = _write(tmp_path, _archive(rows))
    try:
        model = read_sparse_model_snapshot(
            descriptor, label="seed", deadline=_alive_deadline()
        )
    finally:
        os.close(descriptor)
    assert model.names() == tuple(sorted(row[4] for row in rows))
    assert model.camera_ids == tuple(sorted(row[3] for row in rows))
    assert len(model.poses) == _IMAGE_COUNT
    for pose in model.poses:
        assert math.isclose(sum(value * value for value in pose.qvec), 1.0, rel_tol=1e-12)


def test_poses_come_back_name_ordered_whatever_order_they_were_written_in(tmp_path):
    """Ordering is load-bearing, not cosmetic.

    :func:`verify_child_alignment_proposal` pairs the three models POSITIONALLY
    after checking their name tuples match, and the digest hashes rows in order.
    Both are only sound because the parser imposes name order on whatever
    sequence the writer chose.  Every other fixture in this file happens to be
    written in name order already, so without this test the sort is a no-op that
    no mutation could redden.
    """

    rows = _seed_rows()
    forward = _snapshot(tmp_path, rows, "forward")
    backward = _snapshot(tmp_path, list(reversed(rows)), "forward")
    assert [row[4] for row in reversed(rows)] != sorted(row[4] for row in rows)
    assert backward.names() == tuple(sorted(row[4] for row in rows))
    assert backward.names() == forward.names()
    assert canonical_pose_digest(backward) == canonical_pose_digest(forward)


def test_the_parse_never_moves_the_owner_s_file_offset(tmp_path):
    """The descriptor belongs to item 5's sink; a borrower must not seek it."""

    descriptor = _write(tmp_path, _archive(_seed_rows()))
    try:
        os.lseek(descriptor, 7, os.SEEK_SET)
        read_sparse_model_snapshot(
            descriptor, label="seed", deadline=_alive_deadline()
        )
        assert os.lseek(descriptor, 0, os.SEEK_CUR) == 7
    finally:
        os.close(descriptor)


def test_optional_colmap_four_members_are_accepted_in_canonical_order(tmp_path):
    payload = _archive(
        _seed_rows(),
        extra_members=[("rigs.bin", b"\x01" * 16), ("frames.bin", b"\x02" * 16)],
    )
    descriptor = _write(tmp_path, payload)
    try:
        model = read_sparse_model_snapshot(
            descriptor, label="seed", deadline=_alive_deadline()
        )
    finally:
        os.close(descriptor)
    assert len(model.poses) == _IMAGE_COUNT


def test_trailing_zero_padding_after_the_end_marker_is_accepted(tmp_path):
    """``tarfile`` pads to a 10 KiB record; refusing that would refuse reality."""

    descriptor = _write(tmp_path, _archive(_seed_rows(), trailing=bytes(_BLOCK * 6)))
    try:
        model = read_sparse_model_snapshot(
            descriptor, label="seed", deadline=_alive_deadline()
        )
    finally:
        os.close(descriptor)
    assert len(model.poses) == _IMAGE_COUNT


def _bad_checksum(payload: bytes) -> bytes:
    mutated = bytearray(payload)
    mutated[148:156] = b"0000000\x00"
    return bytes(mutated)


_ARCHIVE_REFUSALS = (
    (
        "not-block-multiple",
        lambda rows: _archive(rows)[:-1],
        "seed snapshot archive is not a whole number of tar blocks",
    ),
    (
        "empty",
        lambda rows: b"",
        "seed snapshot archive is not a whole number of tar blocks",
    ),
    (
        "bad-checksum",
        lambda rows: _bad_checksum(_archive(rows)),
        "seed snapshot archive header checksum does not verify",
    ),
    (
        "blank-checksum",
        lambda rows: bytes(bytearray(_archive(rows))[:148])
        + b"\x00" * 8
        + bytes(bytearray(_archive(rows))[156:]),
        "seed snapshot archive header checksum does not verify",
    ),
    (
        "bad-magic",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"magic": b"gnutar"}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive is not canonical USTAR",
    ),
    (
        "bad-version",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"version": b"01"}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive is not canonical USTAR",
    ),
    (
        "symlink-member",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", b"", {"typeflag": b"2", "linkname": b"elsewhere"}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive carries a non-regular member",
    ),
    (
        "prefix-set",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"prefix": b"sparse"}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member carries a prefix or link name",
    ),
    (
        "linkname-set",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"linkname": b"elsewhere"}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member carries a prefix or link name",
    ),
    (
        "non-ascii-name",
        lambda rows: _pack_ustar(
            [
                (b"cameras\xff.bin", b""),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member name is not ASCII",
    ),
    (
        "unknown-member",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1])),
                ("images.bin", b""),
                ("points3D.bin", b""),
                ("project.ini", b"x"),
            ]
        ),
        "seed snapshot archive member is outside the reviewed universe",
    ),
    (
        "repeated-member",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1])),
                ("cameras.bin", _cameras_bin([1])),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive repeats a member name",
    ),
    (
        "bad-mode",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"mode": 0o755}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member has a non-canonical mode",
    ),
    (
        "bad-uid",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"uid": 1000}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member has a non-canonical uid",
    ),
    (
        "bad-gid",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"gid": 1000}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member has a non-canonical gid",
    ),
    (
        "bad-mtime",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"mtime": 1_700_000_000}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member has a non-canonical mtime",
    ),
    (
        "malformed-size",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"raw_size": b"0000000ZZZZ\x00"}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive has a malformed size field",
    ),
    (
        "member-past-archive",
        lambda rows: _pack_ustar(
            [
                ("cameras.bin", _cameras_bin([1]), {"raw_size": b"00000100000\x00"}),
                ("images.bin", b""),
                ("points3D.bin", b""),
            ]
        ),
        "seed snapshot archive member runs past the archive",
    ),
    (
        "no-end-marker",
        lambda rows: _archive(rows, end_blocks=0),
        "seed snapshot archive has no end-of-archive marker",
    ),
    (
        "bytes-after-end",
        lambda rows: _archive(rows, trailing=b"\x01" + bytes(_BLOCK - 1)),
        "seed snapshot archive carries bytes after its end marker",
    ),
    (
        "missing-cameras",
        lambda rows: _pack_ustar([("images.bin", b""), ("points3D.bin", b"")]),
        "seed snapshot archive is missing cameras.bin",
    ),
    (
        "missing-images",
        lambda rows: _pack_ustar(
            [("cameras.bin", _cameras_bin([1])), ("points3D.bin", b"")]
        ),
        "seed snapshot archive is missing images.bin",
    ),
    (
        "missing-points",
        lambda rows: _pack_ustar(
            [("cameras.bin", _cameras_bin([1])), ("images.bin", b"")]
        ),
        "seed snapshot archive is missing points3D.bin",
    ),
    (
        "non-canonical-order",
        lambda rows: _pack_ustar(
            [
                ("images.bin", _images_bin(rows)),
                ("cameras.bin", _cameras_bin(sorted({row[3] for row in rows}))),
                ("points3D.bin", struct.pack("<Q", 0)),
            ]
        ),
        "seed snapshot archive members are not in canonical order",
    ),
)


@pytest.mark.parametrize(
    "label,builder,message",
    _ARCHIVE_REFUSALS,
    ids=[row[0] for row in _ARCHIVE_REFUSALS],
)
def test_a_non_canonical_snapshot_archive_is_refused(tmp_path, label, builder, message):
    descriptor = _write(tmp_path, builder(_seed_rows()), "%s.tar" % label)
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor, label="seed", deadline=_alive_deadline()
            )
    finally:
        os.close(descriptor)
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_an_archive_over_the_reviewed_ceiling_is_refused_before_it_is_parsed(tmp_path):
    """Built by extending a real archive, not by patching the size check."""

    payload = _archive(_seed_rows())
    descriptor = _write_with_hole(
        tmp_path,
        "huge.tar",
        payload,
        SPARSE_MODEL_MAX_ARCHIVE_BYTES + _BLOCK - len(payload),
        b"",
    )
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor, label="seed", deadline=_alive_deadline()
            )
    finally:
        os.close(descriptor)
    assert str(caught.value) == "seed snapshot archive exceeds the reviewed archive ceiling"
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


@pytest.mark.parametrize("member", ("cameras.bin", "images.bin"))
def test_a_parsed_member_over_its_ceiling_is_refused(tmp_path, member):
    """A member whose declared size clears the archive ceiling but not the parse one."""

    oversized = SPARSE_MODEL_MAX_PARSED_MEMBER_BYTES + _BLOCK
    assert oversized % _BLOCK == 0
    if member == "cameras.bin":
        before = _checksummed(_tar_header("cameras.bin", oversized))
        after = _pack_ustar([("images.bin", b""), ("points3D.bin", b"")])
    else:
        cameras = _cameras_bin([1])
        before = (
            _checksummed(_tar_header("cameras.bin", len(cameras)))
            + cameras
            + bytes((-len(cameras)) % _BLOCK)
            + _checksummed(_tar_header("images.bin", oversized))
        )
        after = _pack_ustar([("points3D.bin", b"")])
    descriptor = _write_with_hole(
        tmp_path, "big-%s.tar" % member, before, oversized, after
    )
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor, label="seed", deadline=_alive_deadline()
            )
    finally:
        os.close(descriptor)
    assert str(caught.value) == "seed snapshot %s exceeds the reviewed parse ceiling" % member
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


# ===========================================================================
# COLMAP record parsing
# ===========================================================================
def _record_archive(*, cameras: bytes | None = None, images: bytes | None = None) -> bytes:
    rows = _seed_rows()
    return _pack_ustar(
        [
            (
                "cameras.bin",
                _cameras_bin(sorted({row[3] for row in rows}))
                if cameras is None
                else cameras,
            ),
            ("images.bin", _images_bin(rows) if images is None else images),
            ("points3D.bin", struct.pack("<Q", 0)),
        ]
    )


def _too_many_camera_ids():
    return list(range(1, SPARSE_MODEL_MAX_IMAGES + 2))


_RECORD_REFUSALS = (
    (
        "zero-cameras",
        lambda: _record_archive(cameras=struct.pack("<Q", 0)),
        "seed snapshot camera count is outside the reviewed range",
    ),
    (
        "too-many-cameras",
        lambda: _record_archive(cameras=_cameras_bin(_too_many_camera_ids())),
        "seed snapshot camera count is outside the reviewed range",
    ),
    (
        "non-pinhole-camera",
        lambda: _record_archive(cameras=_cameras_bin([1], model_id=0, params=4)),
        "seed snapshot camera is not the reviewed PINHOLE model",
    ),
    (
        "repeated-camera-id",
        lambda: _record_archive(cameras=_cameras_bin([7, 7])),
        "seed snapshot repeats a camera id",
    ),
    (
        "cameras-trailing-bytes",
        lambda: _record_archive(cameras=_cameras_bin([200]) + b"\x00" * 8),
        "seed snapshot cameras.bin member carries 8 trailing bytes",
    ),
    (
        "zero-images",
        lambda: _record_archive(images=struct.pack("<Q", 0)),
        "seed snapshot registered image count is outside the reviewed range",
    ),
    (
        "too-many-images",
        lambda: _record_archive(
            images=struct.pack("<Q", SPARSE_MODEL_MAX_IMAGES + 1)
        ),
        "seed snapshot registered image count is outside the reviewed range",
    ),
    (
        "images-trailing-bytes",
        lambda: _record_archive(images=_images_bin(_seed_rows()) + b"\x00" * 5),
        "seed snapshot images.bin member carries 5 trailing bytes",
    ),
    (
        "record-past-member",
        lambda: _record_archive(
            images=_images_bin(_seed_rows(), declared_count=_IMAGE_COUNT + 1)
        ),
        "seed snapshot images.bin record runs past the end of its member",
    ),
    (
        "unknown-camera-id",
        lambda: _record_archive(images=_images_bin(_mutated_rows(camera_id=999))),
        "seed snapshot image references an unknown camera id",
    ),
)


@pytest.mark.parametrize(
    "label,builder,message",
    _RECORD_REFUSALS,
    ids=[row[0] for row in _RECORD_REFUSALS],
)
def test_a_malformed_colmap_record_is_refused(tmp_path, label, builder, message):
    descriptor = _write(tmp_path, builder(), "%s.tar" % label)
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor, label="seed", deadline=_alive_deadline()
            )
    finally:
        os.close(descriptor)
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def _mutated_rows(**changes):
    rows = _seed_rows()
    index = changes.pop("index", 0)
    fields = list(rows[index])
    for key, value in changes.items():
        fields[{"image_id": 0, "qvec": 1, "tvec": 2, "camera_id": 3, "name": 4}[key]] = value
    rows[index] = tuple(fields)
    return rows


_IMAGE_ROW_REFUSALS = (
    (
        "repeated-image-id",
        lambda: _mutated_rows(index=1, image_id=100),
        "seed snapshot repeats an image id",
    ),
    (
        "repeated-image-name",
        lambda: _mutated_rows(index=1, name="frame-000.jpg"),
        "seed snapshot repeats an image name",
    ),
    (
        "non-finite-pose",
        lambda: _mutated_rows(tvec=(float("inf"), 0.0, 0.0)),
        "seed snapshot image pose carries a non-finite value",
    ),
    (
        "nan-quaternion",
        lambda: _mutated_rows(qvec=(float("nan"), 0.0, 0.0, 1.0)),
        "seed snapshot image pose carries a non-finite value",
    ),
    (
        "zero-quaternion",
        lambda: _mutated_rows(qvec=(0.0, 0.0, 0.0, 0.0)),
        "seed snapshot image quaternion must have a non-zero finite norm",
    ),
    (
        "empty-image-name",
        lambda: _mutated_rows(name=""),
        "seed snapshot image name is not printable ASCII",
    ),
    (
        "space-in-image-name",
        lambda: _mutated_rows(name="frame 000.jpg"),
        "seed snapshot image name is not printable ASCII",
    ),
    (
        "non-ascii-image-name",
        lambda: _mutated_rows(name=b"frame-\xff.jpg"),
        "seed snapshot image name is not ASCII",
    ),
)


@pytest.mark.parametrize(
    "label,builder,message",
    _IMAGE_ROW_REFUSALS,
    ids=[row[0] for row in _IMAGE_ROW_REFUSALS],
)
def test_a_malformed_image_row_is_refused(tmp_path, label, builder, message):
    descriptor = _write(tmp_path, _archive(builder()), "%s.tar" % label)
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor, label="seed", deadline=_alive_deadline()
            )
    finally:
        os.close(descriptor)
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_an_overlong_image_name_is_refused(tmp_path):
    rows = _mutated_rows(name="f" * (SPARSE_MODEL_MAX_IMAGE_NAME_BYTES + 1))
    descriptor = _write(tmp_path, _archive(rows), "longname.tar")
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor, label="seed", deadline=_alive_deadline()
            )
    finally:
        os.close(descriptor)
    assert (
        str(caught.value)
        == "seed snapshot images.bin image name exceeds the reviewed length"
    )
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_a_name_at_exactly_the_reviewed_length_is_accepted(tmp_path):
    """The overlong refusal must be a boundary, not a blanket."""

    rows = _mutated_rows(name="f" * SPARSE_MODEL_MAX_IMAGE_NAME_BYTES)
    descriptor = _write(tmp_path, _archive(rows), "maxname.tar")
    try:
        model = read_sparse_model_snapshot(
            descriptor, label="seed", deadline=_alive_deadline()
        )
    finally:
        os.close(descriptor)
    assert any(len(pose.name) == SPARSE_MODEL_MAX_IMAGE_NAME_BYTES for pose in model.poses)


def test_an_image_claiming_more_observations_than_it_carries_is_refused(tmp_path):
    rows = _seed_rows()
    payload = bytearray(_images_bin(rows))
    # The first record's observation count sits after 8 header bytes, 64 pose
    # bytes and the NUL-terminated name.
    offset = 8 + 64 + len(rows[0][4]) + 1
    payload[offset : offset + 8] = struct.pack("<Q", 1 << 40)
    descriptor = _write(tmp_path, _record_archive(images=bytes(payload)), "obs.tar")
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor, label="seed", deadline=_alive_deadline()
            )
    finally:
        os.close(descriptor)
    assert (
        str(caught.value)
        == "seed snapshot image claims more observations than it carries"
    )
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


_PARSE_ARGUMENT_REFUSALS = (
    ("negative-descriptor", {"descriptor": -1}, "snapshot descriptor must be a non-negative file descriptor"),
    ("bool-descriptor", {"descriptor": True}, "snapshot descriptor must be a non-negative file descriptor"),
    ("float-descriptor", {"descriptor": 3.0}, "snapshot descriptor must be a non-negative file descriptor"),
    ("empty-label", {"label": ""}, "snapshot label must be a non-empty string"),
    ("bytes-label", {"label": b"seed"}, "snapshot label must be a non-empty string"),
    ("no-deadline", {"deadline": None}, "snapshot parse requires the carried refine deadline"),
    ("float-deadline", {"deadline": 1.0}, "snapshot parse requires the carried refine deadline"),
)


@pytest.mark.parametrize(
    "label,changes,message",
    _PARSE_ARGUMENT_REFUSALS,
    ids=[row[0] for row in _PARSE_ARGUMENT_REFUSALS],
)
def test_the_parse_entry_contract_is_exact(tmp_path, label, changes, message):
    descriptor = _write(tmp_path, _archive(_seed_rows()))
    arguments = {
        "descriptor": descriptor,
        "label": "seed",
        "deadline": _alive_deadline(),
    }
    arguments.update(changes)
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                arguments["descriptor"],
                label=arguments["label"],
                deadline=arguments["deadline"],
            )
    finally:
        os.close(descriptor)
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_an_exhausted_deadline_refuses_the_parse_before_any_read(tmp_path):
    descriptor = _write(tmp_path, _archive(_seed_rows()))
    try:
        with pytest.raises(AdapterError) as caught:
            read_sparse_model_snapshot(
                descriptor,
                label="seed",
                deadline=RefineDeadline(time.monotonic() - 1.0),
            )
    finally:
        os.close(descriptor)
    assert caught.value.code == "REFINE_ENGINE_TIMEOUT"


def test_the_deadline_checkpoint_stride_is_the_pinned_interval():
    """The stride carries the contract; the call sites are not falsifiable."""

    expired = RefineDeadline(time.monotonic() - 1.0)
    for index in range(DEADLINE_CHECK_INTERVAL * 3):
        if index % DEADLINE_CHECK_INTERVAL == 0:
            with pytest.raises(AdapterError):
                alignment._deadline_checkpoint(expired, index)
        else:
            alignment._deadline_checkpoint(expired, index)


def test_a_closed_descriptor_is_reported_rather_than_raised_raw(tmp_path):
    descriptor = _write(tmp_path, _archive(_seed_rows()))
    os.close(descriptor)
    with pytest.raises(AdapterError) as caught:
        read_sparse_model_snapshot(descriptor, label="seed", deadline=_alive_deadline())
    assert str(caught.value).startswith("cannot stat seed snapshot archive: ")
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_a_positional_read_longer_than_one_chunk_returns_the_bytes_in_order(tmp_path):
    """The CONTINUATION path of ``_read_exact_at``, driven at the helper directly.

    No public entry can reach it: ``_MemberCursor.read_exact`` caps every pull at
    ``_PREAD_CHUNK_BYTES`` and the observation skip steps in the same units, so
    through ``read_sparse_model_snapshot`` the loop always runs exactly once and
    both its offset arithmetic and its chunk-size arithmetic are inert.  Calling
    the helper with a longer count is therefore the only way to make that
    arithmetic falsifiable -- and it is worth falsifying, because dropping the
    ``+ read`` term does not raise, it silently DUPLICATES the first chunk.

    The payload is a non-repeating sha256 stream rather than a pattern, so no
    duplicated or misaligned chunk can accidentally compare equal.  The
    ``if not chunk:`` EOF clause in the same loop stays unfalsifiable and this
    test does not claim it: a regular file whose length ``fstat`` just reported
    cannot end early.
    """

    size = 3 * alignment._PREAD_CHUNK_BYTES + 1237
    payload = b"".join(
        hashlib.sha256(b"item6-chunk-%d" % index).digest()
        for index in range(size // 32 + 1)
    )[:size]
    path = tmp_path / "chunked.bin"
    path.write_bytes(payload)
    descriptor = os.open(str(path), os.O_RDONLY)
    try:
        assert (
            alignment._read_exact_at(descriptor, 811, size - 811, label="chunked")
            == payload[811:]
        )
        assert (
            alignment._read_exact_at(
                descriptor, 0, alignment._PREAD_CHUNK_BYTES, label="chunked"
            )
            == payload[: alignment._PREAD_CHUNK_BYTES]
        )
        # A read that stops WELL SHORT of the end, on a count that is not a whole
        # number of chunks.  The read above cannot see a chunk-size error,
        # because the file ends exactly where the last pull would have to stop
        # and the kernel truncates the over-long request back to the right
        # answer.  This one over-reads by a whole chunk if the remaining count is
        # not what bounds the pull.
        short = 2 * alignment._PREAD_CHUNK_BYTES + 55
        assert (
            alignment._read_exact_at(descriptor, 100, short, label="chunked")
            == payload[100 : 100 + short]
        )
    finally:
        os.close(descriptor)


# ===========================================================================
# The pose digest
# ===========================================================================
def _expected_digest(rows) -> str:
    """Reimplement the published canonicalisation, independently of the module.

    If this drifts from :func:`canonical_pose_digest`, one of the two is wrong
    and the suite says so -- which is the only way a written-down spec can be a
    spec rather than a description of whatever the code happens to do.
    """

    def canonical(quaternion):
        length = math.sqrt(sum(value * value for value in quaternion))
        unit = tuple(value / length for value in quaternion)
        for value in unit:
            if abs(value) > 1e-14:
                if value < 0.0:
                    unit = tuple(-component for component in unit)
                break
        return unit

    lines = [POSE_DIGEST_VERSION]
    for row in sorted(rows, key=lambda entry: entry[4]):
        image_id, quaternion, translation, camera_id, name, _ = row
        unit = canonical(quaternion)
        rotation = _rotation_of(unit)
        centre = tuple(
            -sum(rotation[col][row_index] * translation[col] for col in range(3))
            for row_index in range(3)
        )
        fields = [name, str(image_id), str(camera_id)]
        fields.extend(str(int(round(value / POSE_DIGEST_QUATERNION_QUANTUM))) for value in unit)
        fields.extend(
            str(int(round(value / POSE_DIGEST_TRANSLATION_QUANTUM_M)))
            for value in translation
        )
        fields.extend(
            str(int(round(value / POSE_DIGEST_TRANSLATION_QUANTUM_M))) for value in centre
        )
        lines.append("\x1f".join(fields))
    return hashlib.sha256(("\n".join(lines) + "\n").encode("utf-8")).hexdigest()


def test_the_pose_digest_matches_an_independent_reading_of_its_spec(tmp_path):
    rows = _seed_rows()
    assert canonical_pose_digest(_snapshot(tmp_path, rows, "seed")) == _expected_digest(rows)


def test_the_pose_digest_is_blind_to_the_quaternion_sign(tmp_path):
    """``q`` and ``-q`` are the same rotation, so they must digest the same."""

    rows = _seed_rows()
    flipped = [
        (row[0], tuple(-value for value in row[1]), row[2], row[3], row[4], row[5])
        for row in rows
    ]
    assert canonical_pose_digest(
        _snapshot(tmp_path, rows, "seed")
    ) == canonical_pose_digest(_snapshot(tmp_path, flipped, "flipped"))


def test_the_pose_digest_is_blind_to_a_sub_quantum_difference(tmp_path):
    """Two translations that round to the same grid integer must agree.

    ``1.0 / 1e-9`` is exactly ``1e9``; adding ``0.4`` of a quantum still rounds
    there, so this is a deterministic statement about the grid rather than a
    hopeful one about floating point.
    """

    rows = _mutated_rows(tvec=(1.0, 2.0, 3.0))
    nudged = _mutated_rows(tvec=(1.0 + 0.4e-9, 2.0, 3.0))
    assert canonical_pose_digest(
        _snapshot(tmp_path, rows, "a")
    ) == canonical_pose_digest(_snapshot(tmp_path, nudged, "b"))


def test_the_pose_digest_sees_a_supra_quantum_difference(tmp_path):
    rows = _mutated_rows(tvec=(1.0, 2.0, 3.0))
    nudged = _mutated_rows(tvec=(1.0 + 4.0e-9, 2.0, 3.0))
    assert canonical_pose_digest(
        _snapshot(tmp_path, rows, "a")
    ) != canonical_pose_digest(_snapshot(tmp_path, nudged, "b"))


def test_the_quantisation_grids_stay_inside_exact_float_integers():
    """The bound the module design rests on, asserted as arithmetic.

    There is deliberately no runtime check for this -- it could never fire -- so
    this assertion is the only thing that turns an edit to any of the four
    constants into a failure instead of a silent loss of exactness.
    """

    assert (
        POSE_DIGEST_MAX_TRANSLATION_M / POSE_DIGEST_TRANSLATION_QUANTUM_M
        <= POSE_DIGEST_MAX_QUANTISED_MAGNITUDE
    )
    assert 2.0 / POSE_DIGEST_QUATERNION_QUANTUM <= POSE_DIGEST_MAX_QUANTISED_MAGNITUDE


def _hand_built_snapshot(**changes):
    """A snapshot assembled directly, bypassing the parser's own validation.

    :func:`canonical_pose_digest` is public, so a caller can hand it values the
    parser would never have produced.  Building one here is how the digest's own
    guards get exercised rather than shadowed by the parse-time checks.
    """

    fields = {
        "image_id": 1,
        "camera_id": 2,
        "name": "frame-000.jpg",
        "qvec": (1.0, 0.0, 0.0, 0.0),
        "tvec": (0.1, 0.2, 0.3),
        "camera_center_m": (-0.1, -0.2, -0.3),
    }
    fields.update(changes)
    return SparseModelSnapshot(
        label="hand", poses=(SparseModelPose(**fields),), camera_ids=(2,)
    )


_DIGEST_FIELD_REFUSALS = (
    (
        "non-finite-translation",
        {"tvec": (float("inf"), 0.0, 0.0)},
        "hand translation component is not finite and cannot be canonicalised",
    ),
    (
        "nan-centre",
        {"camera_center_m": (float("nan"), 0.0, 0.0)},
        "hand camera centre component is not finite and cannot be canonicalised",
    ),
    (
        "non-finite-quaternion",
        {"qvec": (float("nan"), 0.0, 0.0, 0.0)},
        "hand quaternion component is not finite and cannot be canonicalised",
    ),
    (
        "oversized-quaternion",
        {"qvec": (5.0, 0.0, 0.0, 0.0)},
        "hand quaternion component is outside the canonicalisable range",
    ),
    (
        "oversized-centre",
        {"camera_center_m": (2.0e6, 0.0, 0.0)},
        "hand camera centre component is outside the canonicalisable range",
    ),
)


@pytest.mark.parametrize(
    "label,changes,message",
    _DIGEST_FIELD_REFUSALS,
    ids=[row[0] for row in _DIGEST_FIELD_REFUSALS],
)
def test_the_pose_digest_refuses_an_uncanonicalisable_field(label, changes, message):
    with pytest.raises(AdapterError) as caught:
        canonical_pose_digest(_hand_built_snapshot(**changes))
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_the_pose_digest_refuses_anything_that_is_not_a_snapshot():
    with pytest.raises(AdapterError) as caught:
        canonical_pose_digest(object())
    assert str(caught.value) == "pose digest requires an exact SparseModelSnapshot"
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_the_pose_digest_refuses_an_empty_snapshot():
    with pytest.raises(AdapterError) as caught:
        canonical_pose_digest(SparseModelSnapshot(label="seed", poses=(), camera_ids=(1,)))
    assert str(caught.value) == "pose digest requires at least one registered image"
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_a_translation_outside_the_canonicalisable_range_is_refused(tmp_path):
    rows = _mutated_rows(tvec=(2.0e6, 0.0, 0.0))
    with pytest.raises(AdapterError) as caught:
        canonical_pose_digest(_snapshot(tmp_path, rows, "far"))
    assert str(caught.value) == "far translation component is outside the canonicalisable range"
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


# ===========================================================================
# The parent's decision
# ===========================================================================
def test_the_parent_recovers_a_transform_it_was_never_given(models):
    """The happy path: Horn must find ``T_true`` from the two archives alone."""

    verification = _verify(models)
    assert verification.correspondences == _IMAGE_COUNT
    assert math.isclose(verification.transform.scale, _TRUE_SCALE, rel_tol=1e-9)
    assert verification.scale_relative_difference < ALIGNMENT_SCALE_RELATIVE_TOLERANCE
    assert verification.rotation_angle_difference_rad < ALIGNMENT_ROTATION_TOLERANCE_RAD
    assert verification.translation_difference_m < ALIGNMENT_TRANSLATION_TOLERANCE_M
    assert verification.fit_rmse_m < 1e-9
    assert verification.max_aligned_orientation_change_rad < 1e-14
    assert verification.max_raw_pose_drift_m == 0.0
    assert verification.max_raw_rotation_drift_rad < 1.0e-12
    assert verification.seed_rms_radius_m > 1.0
    assert verification.seed_min_principal_extent_m > ALIGNMENT_MIN_PRINCIPAL_EXTENT_M
    assert verification.aligned_min_principal_extent_m > ALIGNMENT_MIN_PRINCIPAL_EXTENT_M


def test_the_verification_returns_the_parents_digests_not_the_childs(models, tmp_path):
    seed, raw, aligned, proposal = models
    verification = _verify(models)
    assert verification.raw_pose_digest_sha256 == canonical_pose_digest(raw)
    assert verification.aligned_pose_digest_sha256 == canonical_pose_digest(aligned)
    assert verification.raw_pose_digest_sha256 != verification.aligned_pose_digest_sha256


_PROPOSAL_CONTRACT_REFUSALS = (
    ("int-scale", {"scale": 1}, "proposed alignment scale must be a finite positive float"),
    ("zero-scale", {"scale": 0.0}, "proposed alignment scale must be a finite positive float"),
    ("nan-scale", {"scale": float("nan")}, "proposed alignment scale must be a finite positive float"),
    ("list-rotation", {"rotation": [(1.0, 0.0, 0.0)] * 3}, "proposed alignment rotation must be a 3x3 tuple"),
    ("short-rotation", {"rotation": ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0))}, "proposed alignment rotation must be a 3x3 tuple"),
    (
        "short-rotation-row",
        {"rotation": ((1.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))},
        "proposed alignment rotation must be a 3x3 tuple",
    ),
    (
        "int-rotation-value",
        {"rotation": ((1, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))},
        "proposed alignment rotation must be finite floats",
    ),
    (
        "non-orthonormal-rotation",
        {"rotation": ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.1))},
        "proposed alignment rotation is not orthonormal",
    ),
    (
        "reflection-rotation",
        {"rotation": ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, -1.0))},
        "proposed alignment rotation is a reflection",
    ),
    ("list-translation", {"translation": [0.0, 0.0, 0.0]}, "proposed alignment translation must be a 3-tuple"),
    ("short-translation", {"translation": (0.0, 0.0)}, "proposed alignment translation must be a 3-tuple"),
    (
        "int-translation-value",
        {"translation": (0, 0.0, 0.0)},
        "proposed alignment translation must be finite floats",
    ),
    (
        "short-raw-digest",
        {"raw_pose_digest_sha256": "abc"},
        "proposed raw pose digest must be lowercase hex sha256",
    ),
    (
        "uppercase-aligned-digest",
        {"aligned_pose_digest_sha256": "A" * 64},
        "proposed aligned pose digest must be lowercase hex sha256",
    ),
)


@pytest.mark.parametrize(
    "label,changes,message",
    _PROPOSAL_CONTRACT_REFUSALS,
    ids=[row[0] for row in _PROPOSAL_CONTRACT_REFUSALS],
)
def test_a_structurally_invalid_proposal_is_refused(models, label, changes, message):
    with pytest.raises(AdapterError) as caught:
        _verify(models, proposal=_replace(models[3], **changes))
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


def test_a_proposal_of_the_wrong_type_is_refused(models):
    with pytest.raises(AdapterError) as caught:
        _verify(models, proposal=object())
    assert str(caught.value) == "alignment verification requires an exact ProposedAlignment"
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


@pytest.mark.parametrize(
    "role,keyword",
    (("seed", "seed"), ("raw pre-BA", "raw_pre_ba"), ("aligned", "aligned")),
)
def test_a_snapshot_of_the_wrong_type_is_refused(models, role, keyword):
    with pytest.raises(AdapterError) as caught:
        _verify(models, **{keyword: object()})
    assert str(caught.value) == "alignment verification requires an exact %s snapshot" % role
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_the_verification_requires_the_carried_deadline(models):
    with pytest.raises(AdapterError) as caught:
        _verify(models, deadline=None)
    assert str(caught.value) == "alignment verification requires the carried refine deadline"
    assert caught.value.code == ALIGNMENT_MODEL_INVALID_CODE


def test_an_exhausted_deadline_refuses_the_verification(models):
    with pytest.raises(AdapterError) as caught:
        _verify(models, deadline=RefineDeadline(time.monotonic() - 1.0))
    assert caught.value.code == "REFINE_ENGINE_TIMEOUT"


def test_snapshots_that_disagree_on_image_names_are_refused(models, tmp_path):
    renamed = _snapshot(tmp_path, _mutated_rows(name="frame-999.jpg"), "renamed")
    with pytest.raises(AdapterError) as caught:
        _verify(models, aligned=renamed)
    assert (
        str(caught.value)
        == "seed, raw pre-BA and aligned snapshots must carry identical image names"
    )
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


@pytest.mark.parametrize("field,value", (("image_id", 900), ("camera_id", 900)))
def test_snapshots_that_disagree_on_database_ids_are_refused(
    models, tmp_path, field, value
):
    rows = _mutated_rows(**{field: value})
    if field == "camera_id":
        rows = [
            (row[0], row[1], row[2], value if index == 0 else row[3], row[4], row[5])
            for index, row in enumerate(rows)
        ]
    drifted = _snapshot(tmp_path, rows, "drifted")
    with pytest.raises(AdapterError) as caught:
        _verify(models, aligned=drifted)
    assert str(caught.value) == "snapshots disagree on database image and camera ids"
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


def _short_models(tmp_path, count):
    rows = _seed_rows()[:count]
    aligned_rows = _apply_similarity(
        rows,
        scale=_TRUE_SCALE,
        quaternion=_TRUE_QUATERNION,
        translation=_TRUE_TRANSLATION,
    )
    seed = _snapshot(tmp_path, rows, "seed-%d" % count)
    raw = _snapshot(tmp_path, rows, "raw-%d" % count)
    aligned = _snapshot(tmp_path, aligned_rows, "aligned-%d" % count)
    proposal = ProposedAlignment(
        scale=_TRUE_SCALE,
        rotation=_rotation_of(_TRUE_QUATERNION),
        translation=_TRUE_TRANSLATION,
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    return seed, raw, aligned, proposal


def test_too_few_correspondences_fail_closed(tmp_path):
    with pytest.raises(AdapterError) as caught:
        _verify(_short_models(tmp_path, ALIGNMENT_MIN_CORRESPONDENCES - 1))
    assert (
        str(caught.value)
        == "alignment needs more paired camera centres than this run carries"
    )
    assert caught.value.code == ALIGNMENT_DEGENERATE_CODE


def test_exactly_the_minimum_correspondences_is_accepted(tmp_path):
    """The floor must be a boundary, not a blanket refusal of small models."""

    verification = _verify(_short_models(tmp_path, ALIGNMENT_MIN_CORRESPONDENCES))
    assert verification.correspondences == ALIGNMENT_MIN_CORRESPONDENCES


def _degenerate_models(tmp_path, centres, label):
    rows = []
    for index, centre in enumerate(centres):
        quaternion = _axis_angle_quaternion((0.1, 0.2, 1.0), 0.3 + 0.05 * index)
        rotation = _rotation_of(quaternion)
        translation = tuple(
            -sum(rotation[row][col] * centre[col] for col in range(3)) for row in range(3)
        )
        rows.append(
            (100 + index, quaternion, translation, 200 + index, "frame-%03d.jpg" % index, 2)
        )
    aligned_rows = _apply_similarity(
        rows,
        scale=_TRUE_SCALE,
        quaternion=_TRUE_QUATERNION,
        translation=_TRUE_TRANSLATION,
    )
    seed = _snapshot(tmp_path, rows, "%s-seed" % label)
    raw = _snapshot(tmp_path, rows, "%s-raw" % label)
    aligned = _snapshot(tmp_path, aligned_rows, "%s-aligned" % label)
    proposal = ProposedAlignment(
        scale=_TRUE_SCALE,
        rotation=_rotation_of(_TRUE_QUATERNION),
        translation=_TRUE_TRANSLATION,
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    return seed, raw, aligned, proposal


def test_collinear_camera_centres_fail_closed(tmp_path):
    centres = [(0.5 * index, 0.0, 0.0) for index in range(_IMAGE_COUNT)]
    with pytest.raises(AdapterError) as caught:
        _verify(_degenerate_models(tmp_path, centres, "line"))
    assert (
        str(caught.value)
        == "seed camera centres are too nearly degenerate to solve a similarity"
    )
    assert caught.value.code == ALIGNMENT_DEGENERATE_CODE


def test_coincident_camera_centres_fail_closed(tmp_path):
    centres = [(1.0, 2.0, 3.0)] * _IMAGE_COUNT
    with pytest.raises(AdapterError) as caught:
        _verify(_degenerate_models(tmp_path, centres, "point"))
    assert (
        str(caught.value)
        == "seed camera centres are too nearly degenerate to solve a similarity"
    )
    assert caught.value.code == ALIGNMENT_DEGENERATE_CODE


def test_a_nearly_planar_sweep_is_refused_as_too_anisotropic(tmp_path):
    """Weak axis clears the absolute floor but not the ratio: still degenerate."""

    centres = []
    for index in range(_IMAGE_COUNT):
        angle = 2.0 * math.pi * index / _IMAGE_COUNT
        centres.append(
            (
                40.0 * math.cos(angle),
                40.0 * math.sin(angle),
                0.002 * ((-1) ** index),
            )
        )
    with pytest.raises(AdapterError) as caught:
        _verify(_degenerate_models(tmp_path, centres, "plane"))
    assert (
        str(caught.value)
        == "seed camera centres are too anisotropic to solve a similarity"
    )
    assert caught.value.code == ALIGNMENT_DEGENERATE_CODE


def test_a_collapsed_aligned_model_is_refused_independently_of_the_seed(tmp_path):
    """The aligned set gets its own conditioning gate; the seed's does not cover it."""

    rows = _seed_rows()
    collapsed = _apply_similarity(
        rows, scale=1.0e-5, quaternion=(1.0, 0.0, 0.0, 0.0), translation=(0.0, 0.0, 0.0)
    )
    seed = _snapshot(tmp_path, rows, "seed")
    raw = _snapshot(tmp_path, rows, "raw")
    aligned = _snapshot(tmp_path, collapsed, "collapsed")
    proposal = ProposedAlignment(
        scale=1.0e-5,
        rotation=((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
        translation=(0.0, 0.0, 0.0),
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    with pytest.raises(AdapterError) as caught:
        _verify((seed, raw, aligned, proposal))
    assert (
        str(caught.value)
        == "aligned camera centres are too nearly degenerate to solve a similarity"
    )
    assert caught.value.code == ALIGNMENT_DEGENERATE_CODE


def _drifted_raw(tmp_path, *, centre_delta=(0.0, 0.0, 0.0), rotation_angle=0.0):
    rows = _seed_rows()
    drifted = []
    for image_id, quaternion, translation, camera_id, name, observations in rows:
        rotation = _rotation_of(quaternion)
        centre = tuple(
            -sum(rotation[col][row] * translation[col] for col in range(3))
            for row in range(3)
        )
        moved = tuple(centre[axis] + centre_delta[axis] for axis in range(3))
        turned = (
            _quat_mul(_axis_angle_quaternion((0.0, 0.0, 1.0), rotation_angle), quaternion)
            if rotation_angle
            else quaternion
        )
        turned_rotation = _rotation_of(turned)
        new_translation = tuple(
            -sum(turned_rotation[row][col] * moved[col] for col in range(3))
            for row in range(3)
        )
        drifted.append(
            (image_id, turned, new_translation, camera_id, name, observations)
        )
    return _snapshot(tmp_path, drifted, "drifted-raw")


def test_a_triangulator_that_moved_a_known_camera_centre_is_refused(models, tmp_path):
    raw = _drifted_raw(tmp_path, centre_delta=(1.0e-3, 0.0, 0.0))
    with pytest.raises(AdapterError) as caught:
        _verify(models, raw_pre_ba=raw)
    assert str(caught.value) == "raw pre-BA snapshot moved a known seed camera centre"
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


def test_a_triangulator_that_rotated_a_known_camera_is_refused(models, tmp_path):
    raw = _drifted_raw(tmp_path, rotation_angle=1.0e-3)
    with pytest.raises(AdapterError) as caught:
        _verify(models, raw_pre_ba=raw)
    assert str(caught.value) == "raw pre-BA snapshot rotated a known seed camera"
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


def test_a_centre_drift_just_inside_the_tolerance_is_accepted(models, tmp_path):
    raw = _drifted_raw(
        tmp_path, centre_delta=(RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M * 0.1, 0.0, 0.0)
    )
    verification = _verify(
        models,
        raw_pre_ba=raw,
        proposal=_replace(models[3], raw_pose_digest_sha256=canonical_pose_digest(raw)),
    )
    assert 0.0 < verification.max_raw_pose_drift_m <= RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M


def test_a_centre_drift_just_outside_the_tolerance_is_refused(models, tmp_path):
    raw = _drifted_raw(
        tmp_path, centre_delta=(RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M * 4.0, 0.0, 0.0)
    )
    with pytest.raises(AdapterError) as caught:
        _verify(
            models,
            raw_pre_ba=raw,
            proposal=_replace(
                models[3], raw_pose_digest_sha256=canonical_pose_digest(raw)
            ),
        )
    assert str(caught.value) == "raw pre-BA snapshot moved a known seed camera centre"


def test_a_rotation_drift_just_inside_the_tolerance_is_accepted(models, tmp_path):
    raw = _drifted_raw(
        tmp_path, rotation_angle=RAW_SNAPSHOT_ROTATION_DRIFT_TOLERANCE_RAD * 0.25
    )
    verification = _verify(
        models,
        raw_pre_ba=raw,
        proposal=_replace(models[3], raw_pose_digest_sha256=canonical_pose_digest(raw)),
    )
    assert (
        0.0
        < verification.max_raw_rotation_drift_rad
        <= RAW_SNAPSHOT_ROTATION_DRIFT_TOLERANCE_RAD
    )


# --- which model each clause is actually reading -----------------------------
#: A trajectory small enough that a centre drift INSIDE the known-pose tolerance
#: is a large RELATIVE change.  On the 2 m fixture the two are matched by
#: construction -- a 1e-6 m drift moves the solved scale by about 5e-7, just
#: under the 1e-6 agreement tolerance -- so on that fixture "raw" and "seed" are
#: interchangeable inputs and nothing can tell the two apart.  Shrink the
#: trajectory to ~2 cm and the same 1e-6 m of permitted drift becomes 3e-5
#: relative, thirty times the agreement tolerance, and the substitution becomes
#: observable.  That is the only reason these numbers are what they are.
_SMALL_RADIUS_M = 0.02
_SMALL_HEIGHT_M = 0.012
_SMALL_SCALE_DRIFT = 3.0e-5


def _small_seed_rows():
    rows = []
    for index in range(_IMAGE_COUNT):
        angle = 2.0 * math.pi * index / _IMAGE_COUNT
        centre = (
            _SMALL_RADIUS_M * math.cos(angle),
            _SMALL_RADIUS_M * math.sin(angle),
            _SMALL_HEIGHT_M * (2.0 * index / (_IMAGE_COUNT - 1) - 1.0),
        )
        quaternion = _axis_angle_quaternion((0.2, -0.3, 1.0), angle * 0.5 + 0.11)
        rotation = _rotation_of(quaternion)
        translation = tuple(
            -sum(rotation[row][col] * centre[col] for col in range(3)) for row in range(3)
        )
        rows.append(
            (
                100 + index,
                quaternion,
                translation,
                200 + index,
                "small-%03d.jpg" % index,
                2,
            )
        )
    return rows


def _small_models(tmp_path):
    """seed, raw = seed dilated inside the drift tolerance, aligned = T(raw).

    The dilation is a legal raw pre-BA snapshot: every camera centre moves less
    than :data:`RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M`, which clause 6 permits and
    this fixture asserts.  But the raw point set is a different SHAPE from the
    seed by 3e-5 relative, so a parent that solved ``seed -> aligned`` instead of
    ``raw -> aligned`` would report a scale 30x outside the agreement tolerance
    and refuse.  Accepting this fixture is therefore a statement about which
    model the solve reads, which is the module's central design argument.
    """

    seed_rows = _small_seed_rows()
    seed_centres = _centres_of(seed_rows)
    centroid = tuple(
        sum(centre[axis] for centre in seed_centres) / len(seed_centres)
        for axis in range(3)
    )
    raw_centres = [
        tuple(
            centroid[axis] + (1.0 + _SMALL_SCALE_DRIFT) * (centre[axis] - centroid[axis])
            for axis in range(3)
        )
        for centre in seed_centres
    ]
    raw_rows = _rows_with_centres(seed_rows, raw_centres)
    quaternion = _axis_angle_quaternion((0.4, 0.2, -0.89), 0.003)
    aligned_rows = _apply_similarity(
        raw_rows, scale=1.002, quaternion=quaternion, translation=(0.004, -0.002, 0.001)
    )
    seed = _snapshot(tmp_path, seed_rows, "small-seed")
    raw = _snapshot(tmp_path, raw_rows, "small-raw")
    aligned = _snapshot(tmp_path, aligned_rows, "small-aligned")
    proposal = ProposedAlignment(
        scale=1.002,
        rotation=_rotation_of(quaternion),
        translation=(0.004, -0.002, 0.001),
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    return seed, raw, aligned, proposal


def test_the_similarity_is_solved_from_the_raw_model_not_the_seed(tmp_path):
    seed, raw, aligned, proposal = _small_models(tmp_path)
    # The fixture is legal: the drift really is inside the clause-6 tolerance.
    drift = max(
        math.sqrt(
            sum(
                (raw.centres()[index][axis] - seed.centres()[index][axis]) ** 2
                for axis in range(3)
            )
        )
        for index in range(len(seed.poses))
    )
    assert 0.0 < drift < RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M
    # ... and solving from the SEED really would disagree, by a wide margin.
    from_seed = _solved(seed.centres(), aligned.centres())
    assert (
        abs(from_seed.scale - proposal.scale) / proposal.scale
        > ALIGNMENT_SCALE_RELATIVE_TOLERANCE * 10.0
    )

    verification = _verify((seed, raw, aligned, proposal))
    assert verification.scale_relative_difference < ALIGNMENT_SCALE_RELATIVE_TOLERANCE
    assert verification.fit_rmse_m < 1.0e-12


def test_the_seed_conditioning_gate_is_judged_on_the_seed(tmp_path):
    """``seed_min_principal_extent_m`` must be the SEED's, not the raw model's.

    ``_principal_extents_m`` is borrowed rather than reimplemented on purpose:
    what is under test is WHICH point set the module hands it, and the mutant
    that swaps the argument leaves the function alone.  The two answers differ
    by the fixture's 3e-5 dilation, five decades above the 1e-9 tolerance here.
    """

    seed, raw, aligned, proposal = _small_models(tmp_path)
    verification = _verify((seed, raw, aligned, proposal))
    expected = alignment._principal_extents_m(seed.centres())[0]
    from_raw = alignment._principal_extents_m(raw.centres())[0]
    assert expected != from_raw
    assert math.isclose(
        verification.seed_min_principal_extent_m, expected, rel_tol=1.0e-9
    )


def test_the_returned_transform_is_the_parents_solve_not_the_childs_claim(models):
    """``transform`` is ``recomputed``; the docstring says so and now a test does.

    The claim is made WRONG -- but inside every agreement tolerance, so the
    verification still succeeds -- which is the only state in which the two
    candidate return values differ and the difference is observable.
    """

    seed, raw, aligned, _ = models
    recomputed = _solved(raw.centres(), aligned.centres())
    claim = ProposedAlignment(
        scale=_TRUE_SCALE * (1.0 + 5.0e-7),
        rotation=_rotation_of(
            _quat_mul(
                _axis_angle_quaternion((0.0, 0.0, 1.0), 5.0e-7), _TRUE_QUATERNION
            )
        ),
        translation=tuple(value + 2.5e-7 for value in _TRUE_TRANSLATION),
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    verification = _verify(models, proposal=claim)
    assert verification.transform.scale == recomputed.scale
    assert verification.transform.rotation == recomputed.rotation
    assert verification.transform.translation == recomputed.translation
    assert verification.transform.scale != claim.scale
    assert verification.transform.rotation != claim.rotation
    assert verification.transform.translation != claim.translation


# --- the agreement tolerances, mutation-tested from both sides --------------
def _scaled_proposal(proposal, factor):
    return _replace(proposal, scale=proposal.scale * (1.0 + factor))


def _turned_proposal(proposal, angle):
    turned = _quat_mul(_axis_angle_quaternion((0.0, 0.0, 1.0), angle), _TRUE_QUATERNION)
    return _replace(proposal, rotation=_rotation_of(turned))


def _shifted_proposal(proposal, delta):
    return _replace(
        proposal,
        translation=tuple(
            value + (delta if axis == 0 else 0.0)
            for axis, value in enumerate(proposal.translation)
        ),
    )


_AGREEMENT_MUTATIONS = (
    (
        "scale",
        _scaled_proposal,
        ALIGNMENT_SCALE_RELATIVE_TOLERANCE,
        "recomputed alignment scale disagrees with the child's proposal",
    ),
    (
        "rotation",
        _turned_proposal,
        ALIGNMENT_ROTATION_TOLERANCE_RAD,
        "recomputed alignment rotation disagrees with the child's proposal",
    ),
    (
        "translation",
        _shifted_proposal,
        ALIGNMENT_TRANSLATION_TOLERANCE_M,
        "recomputed alignment translation disagrees with the child's proposal",
    ),
)


@pytest.mark.parametrize(
    "label,mutate,tolerance,message",
    _AGREEMENT_MUTATIONS,
    ids=[row[0] for row in _AGREEMENT_MUTATIONS],
)
def test_a_proposal_just_outside_the_agreement_tolerance_is_refused(
    models, label, mutate, tolerance, message
):
    with pytest.raises(AdapterError) as caught:
        _verify(models, proposal=mutate(models[3], tolerance * 10.0))
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


@pytest.mark.parametrize(
    "label,mutate,tolerance,message",
    _AGREEMENT_MUTATIONS,
    ids=[row[0] for row in _AGREEMENT_MUTATIONS],
)
def test_a_proposal_just_inside_the_agreement_tolerance_is_accepted(
    models, label, mutate, tolerance, message
):
    """Without this half, the tolerance could be zero and nothing would notice."""

    verification = _verify(models, proposal=mutate(models[3], tolerance * 0.1))
    assert verification.correspondences == _IMAGE_COUNT


def test_a_child_that_shipped_bytes_it_did_not_declare_is_caught(models, tmp_path):
    """The proposal is a claim about the ARCHIVE, so changing the archive breaks it.

    This is the falsification the design exists for: the child keeps its declared
    transform and quietly ships a differently-aligned model.
    """

    seed, raw, _aligned, proposal = models
    substituted = _apply_similarity(
        _seed_rows(),
        scale=_TRUE_SCALE * 1.01,
        quaternion=_TRUE_QUATERNION,
        translation=_TRUE_TRANSLATION,
    )
    aligned = _snapshot(tmp_path, substituted, "substituted")
    with pytest.raises(AdapterError) as caught:
        _verify(
            (seed, raw, aligned, proposal),
            proposal=_replace(
                proposal, aligned_pose_digest_sha256=canonical_pose_digest(aligned)
            ),
        )
    assert str(caught.value) == "recomputed alignment scale disagrees with the child's proposal"
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


# --- gauge sanity -----------------------------------------------------------
def _gauge_models(tmp_path, *, scale=1.0, angle=0.0, translation=(0.0, 0.0, 0.0)):
    rows = _seed_rows()
    quaternion = _axis_angle_quaternion((0.0, 0.0, 1.0), angle)
    aligned_rows = _apply_similarity(
        rows, scale=scale, quaternion=quaternion, translation=translation
    )
    seed = _snapshot(tmp_path, rows, "gauge-seed")
    raw = _snapshot(tmp_path, rows, "gauge-raw")
    aligned = _snapshot(tmp_path, aligned_rows, "gauge-aligned")
    proposal = ProposedAlignment(
        scale=scale,
        rotation=_rotation_of(quaternion),
        translation=translation,
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    return seed, raw, aligned, proposal


_GAUGE_REFUSALS = (
    (
        "scale",
        {"scale": 1.0 + ALIGNED_GAUGE_MAX_SCALE_DEVIATION * 2.0},
        "aligned model is not in the seed's metric scale",
    ),
    (
        "rotation",
        {"angle": ALIGNED_GAUGE_MAX_ROTATION_RAD * 2.0},
        "aligned model is not in the seed's metric orientation",
    ),
    (
        "translation",
        {"translation": (ALIGNED_GAUGE_MAX_TRANSLATION_M * 2.0, 0.0, 0.0)},
        "aligned model is not in the seed's metric origin",
    ),
)


@pytest.mark.parametrize(
    "label,changes,message",
    _GAUGE_REFUSALS,
    ids=[row[0] for row in _GAUGE_REFUSALS],
)
def test_an_aligned_model_left_in_the_ba_gauge_is_refused(
    tmp_path, label, changes, message
):
    with pytest.raises(AdapterError) as caught:
        _verify(_gauge_models(tmp_path, **changes))
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


_GAUGE_ACCEPTANCES = (
    ("scale", {"scale": 1.0 + ALIGNED_GAUGE_MAX_SCALE_DEVIATION * 0.5}),
    ("rotation", {"angle": ALIGNED_GAUGE_MAX_ROTATION_RAD * 0.5}),
    ("translation", {"translation": (ALIGNED_GAUGE_MAX_TRANSLATION_M * 0.5, 0.0, 0.0)}),
)


@pytest.mark.parametrize(
    "label,changes", _GAUGE_ACCEPTANCES, ids=[row[0] for row in _GAUGE_ACCEPTANCES]
)
def test_a_gauge_margin_inside_the_floor_is_accepted(tmp_path, label, changes):
    verification = _verify(_gauge_models(tmp_path, **changes))
    assert verification.gauge_scale_deviation <= ALIGNED_GAUGE_MAX_SCALE_DEVIATION
    assert verification.gauge_rotation_rad <= ALIGNED_GAUGE_MAX_ROTATION_RAD
    assert verification.gauge_translation_m <= ALIGNED_GAUGE_MAX_TRANSLATION_M


def _rows_with_centres(rows, centres):
    """Rebuild ``tvec`` from new camera centres, keeping each orientation."""

    rebuilt = []
    for row, centre in zip(rows, centres, strict=True):
        image_id, quaternion, _translation, camera_id, name, observations = row
        rotation = _rotation_of(quaternion)
        translation = tuple(
            -sum(rotation[axis][col] * centre[col] for col in range(3))
            for axis in range(3)
        )
        rebuilt.append((image_id, quaternion, translation, camera_id, name, observations))
    return rebuilt


def _centres_of(rows):
    centres = []
    for _image_id, quaternion, translation, _camera_id, _name, _observations in rows:
        rotation = _rotation_of(quaternion)
        centres.append(
            tuple(
                -sum(rotation[col][axis] * translation[col] for col in range(3))
                for axis in range(3)
            )
        )
    return centres


def _solved(raw, aligned):
    """Solve the very transform the parent will recompute.

    Used ONLY to build fixtures whose earlier clauses pass, so that a later
    clause is the one under test.  Legitimate precisely because the assertion in
    those tests is downstream of the agreement comparison rather than being it.
    """

    from patina_scan_worker.refine_adapter import estimate_sim3

    return estimate_sim3(raw, aligned)


def test_a_scattered_aligned_model_is_refused_on_its_fit_residual(tmp_path):
    """A near-identity best fit can still leave a garbage residual.

    The displacement is deliberately projected ONTO THE RESIDUAL SPACE of the
    similarity fit -- noise is applied, the best-fit transform is solved, and the
    noisy centres are pulled back through it.  What survives is orthogonal to
    every similarity direction, so the recomputed transform sits inside all three
    gauge floors and only the residual clause can fire.  That is what makes the
    residual clause independent of the gauge clauses rather than shadowed by
    them.
    """

    rows = _seed_rows()
    raw_centres = _centres_of(rows)
    state = 12345
    noisy = []
    for centre in raw_centres:
        offsets = []
        for _axis in range(3):
            state = (1103515245 * state + 12345) % (1 << 31)
            offsets.append((state / (1 << 30)) - 1.0)
        noisy.append(tuple(centre[axis] + 3.0 * offsets[axis] for axis in range(3)))
    forward = _solved(raw_centres, noisy)
    inverse_rotation = _transposed(forward.rotation)
    pulled = []
    for point in noisy:
        shifted = tuple(point[axis] - forward.translation[axis] for axis in range(3))
        rotated = tuple(
            sum(inverse_rotation[axis][col] * shifted[col] for col in range(3))
            for axis in range(3)
        )
        pulled.append(tuple(value / forward.scale for value in rotated))

    seed = _snapshot(tmp_path, rows, "scatter-seed")
    raw = _snapshot(tmp_path, rows, "scatter-raw")
    aligned = _snapshot(tmp_path, _rows_with_centres(rows, pulled), "scatter-aligned")
    recomputed = _solved(raw.centres(), aligned.centres())
    proposal = ProposedAlignment(
        scale=recomputed.scale,
        rotation=recomputed.rotation,
        translation=recomputed.translation,
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    with pytest.raises(AdapterError) as caught:
        _verify((seed, raw, aligned, proposal))
    assert (
        str(caught.value)
        == "alignment fit residual is too large a fraction of the trajectory"
    )
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


def _jittered_aligned_models(tmp_path, amount, *, single=None, state=12345):
    """The happy path with the ALIGNED centres displaced, claim re-solved.

    The claim is re-solved rather than kept, so the agreement clauses cannot be
    what fires: what is being measured is how much per-camera corruption the
    module's own gauge and residual floors will admit from a child whose
    declared numbers honestly describe the bytes it shipped.
    """

    rows = _seed_rows()
    aligned_rows = _apply_similarity(
        rows,
        scale=_TRUE_SCALE,
        quaternion=_TRUE_QUATERNION,
        translation=_TRUE_TRANSLATION,
    )
    centres = list(_centres_of(aligned_rows))
    if single is None:
        moved = []
        for centre in centres:
            offsets = []
            for _axis in range(3):
                state = (1103515245 * state + 12345) % (1 << 31)
                offsets.append((state / (1 << 30)) - 1.0)
            moved.append(
                tuple(centre[axis] + amount * offsets[axis] for axis in range(3))
            )
        centres = moved
    else:
        centres[single] = tuple(
            centres[single][axis] + (amount if axis == 0 else 0.0) for axis in range(3)
        )
    seed = _snapshot(tmp_path, rows, "jit-seed")
    raw = _snapshot(tmp_path, rows, "jit-raw")
    aligned = _snapshot(tmp_path, _rows_with_centres(aligned_rows, centres), "jit-aligned")
    recomputed = _solved(raw.centres(), aligned.centres())
    proposal = ProposedAlignment(
        scale=recomputed.scale,
        rotation=recomputed.rotation,
        translation=recomputed.translation,
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    return seed, raw, aligned, proposal


def test_the_measured_shape_change_envelope_is_what_the_gauge_floors_leave(tmp_path):
    """Pin the envelope the shape fraction's comment quotes, and WHICH clause binds.

    The point is not the four numbers on their own; it is that at room scale
    ``ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION`` is NOT what refuses the next step up.
    Both refusals below name a gauge floor, and both accepted residuals sit well
    under the 1.0099 m this fraction would allow.  An operator reading the
    constant needs that, and a future edit to any of the four constants involved
    has to come here and contradict it.
    """

    inside = _verify(_jittered_aligned_models(tmp_path, 0.55))
    assert 0.46 < inside.fit_rmse_m < 0.48
    assert inside.fit_rmse_m < ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION * inside.seed_rms_radius_m
    with pytest.raises(AdapterError) as caught:
        _verify(_jittered_aligned_models(tmp_path, 0.60))
    assert str(caught.value) == "aligned model is not in the seed's metric orientation"

    single_inside = _verify(_jittered_aligned_models(tmp_path, 1.10, single=0))
    assert 0.28 < single_inside.fit_rmse_m < 0.30
    with pytest.raises(AdapterError) as caught:
        _verify(_jittered_aligned_models(tmp_path, 1.20, single=0))
    assert str(caught.value) == "aligned model is not in the seed's metric scale"


# --- the aligned orientations ----------------------------------------------
def _rows_with_reoriented_cameras(rows, quaternion, indices=None):
    """Re-orient cameras while leaving every camera CENTRE bit-identical.

    ``tvec`` is rebuilt from the unchanged centre and the new rotation, so the
    derived ``-R^T t`` the parent recovers is the same float it was before.  A
    fixture that let the centre move would be caught by a clause that already
    exists, and would prove nothing about the orientations.
    """

    rebuilt = []
    for index, row in enumerate(rows):
        image_id, camera_quaternion, translation, camera_id, name, observations = row
        if indices is not None and index not in indices:
            rebuilt.append(row)
            continue
        rotation = _rotation_of(camera_quaternion)
        centre = tuple(
            -sum(rotation[col][axis] * translation[col] for col in range(3))
            for axis in range(3)
        )
        turned = _quat_mul(quaternion, camera_quaternion)
        new_rotation = _rotation_of(turned)
        new_translation = tuple(
            -sum(new_rotation[axis][col] * centre[col] for col in range(3))
            for axis in range(3)
        )
        rebuilt.append(
            (image_id, turned, new_translation, camera_id, name, observations)
        )
    return rebuilt


def _reoriented_models(tmp_path, *, angle, indices=None, axis=(0.31, -0.62, 0.72)):
    """An aligned model that is a TRUE similarity of the raw one, then turned.

    Everything the parent checks before the orientation clause is left exactly
    as the happy path leaves it: the centres are untouched, so the recomputed
    transform, all three gauge margins and the fit residual are the happy
    path's own numbers.  The child then digests the model it really shipped,
    which is what makes the digest clauses powerless here -- and is precisely
    the attack the digest was mistakenly credited with catching.
    """

    rows = _seed_rows()
    aligned_rows = _apply_similarity(
        rows,
        scale=_TRUE_SCALE,
        quaternion=_TRUE_QUATERNION,
        translation=_TRUE_TRANSLATION,
    )
    turned_rows = _rows_with_reoriented_cameras(
        aligned_rows, _axis_angle_quaternion(axis, angle), indices
    )
    seed = _snapshot(tmp_path, rows, "turn-seed")
    raw = _snapshot(tmp_path, rows, "turn-raw")
    honest = _snapshot(tmp_path, aligned_rows, "turn-honest")
    aligned = _snapshot(tmp_path, turned_rows, "turn-aligned")
    # The centres really are untouched.  Not BIT-identical -- ``tvec`` is
    # rebuilt as ``-R' c`` and the parser derives ``-R'^T t`` back out, and that
    # round trip carries float64 noise -- but MEASURED below 1e-12 m, which is a
    # million times under the tightest centre-driven tolerance in the module
    # (1e-6 m) and 1e12 times under the fit-residual ceiling this fixture would
    # otherwise be at risk of tripping.  Without this the test could pass for
    # the wrong reason, on a clause that reads centres.
    drift = max(
        abs(moved[component] - straight[component])
        for moved, straight in zip(aligned.centres(), honest.centres())
        for component in range(3)
    )
    assert drift < 1.0e-12
    proposal = ProposedAlignment(
        scale=_TRUE_SCALE,
        rotation=_rotation_of(_TRUE_QUATERNION),
        translation=_TRUE_TRANSLATION,
        raw_pose_digest_sha256=canonical_pose_digest(raw),
        aligned_pose_digest_sha256=canonical_pose_digest(aligned),
    )
    return seed, raw, aligned, proposal


_ORIENTATION_REFUSALS = (
    ("every-camera-reversed", math.pi, None),
    ("one-camera-reversed", math.pi, (0,)),
    ("every-camera-a-radian-out", 1.0, None),
    ("one-camera-a-radian-out", 1.0, (7,)),
)


@pytest.mark.parametrize(
    "label,angle,indices",
    _ORIENTATION_REFUSALS,
    ids=[row[0] for row in _ORIENTATION_REFUSALS],
)
def test_aligned_orientations_the_transform_cannot_explain_are_refused(
    tmp_path, label, angle, indices
):
    """A Sim(3) fixes the orientations too; centres alone do not pin them.

    ``R'_i = R_i R^T`` holds exactly for a similarity, so an aligned model whose
    cameras point somewhere else is not the transform of the raw one no matter
    how perfectly its centres line up.
    """

    with pytest.raises(AdapterError) as caught:
        _verify(_reoriented_models(tmp_path, angle=angle, indices=indices))
    assert (
        str(caught.value)
        == "aligned camera orientations disagree with the recomputed alignment"
    )
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


def test_an_orientation_change_just_outside_the_ceiling_is_refused(tmp_path):
    """The refusing side of the ceiling, at a margin the float noise cannot reach.

    The measured noise on this comparison is 8e-16 rad (the acceptance test
    below asserts it), so 1e-6 rad of margin is nine decades of headroom -- the
    boundary is the constant's, not the arithmetic's.
    """

    with pytest.raises(AdapterError) as caught:
        _verify(
            _reoriented_models(
                tmp_path, angle=ALIGNED_MAX_ORIENTATION_CHANGE_RAD + 1.0e-6
            )
        )
    assert (
        str(caught.value)
        == "aligned camera orientations disagree with the recomputed alignment"
    )
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE


def test_an_orientation_change_just_inside_the_ceiling_is_accepted(tmp_path):
    """The accepting side.  Without it the constant could be narrowed to zero."""

    verification = _verify(
        _reoriented_models(tmp_path, angle=ALIGNED_MAX_ORIENTATION_CHANGE_RAD - 1.0e-6)
    )
    assert verification.max_aligned_orientation_change_rad <= (
        ALIGNED_MAX_ORIENTATION_CHANGE_RAD
    )
    assert (
        abs(
            verification.max_aligned_orientation_change_rad
            - (ALIGNED_MAX_ORIENTATION_CHANGE_RAD - 1.0e-6)
        )
        < 1.0e-12
    )
    # Every earlier clause is at its happy-path value, so the ceiling really is
    # the only thing this pair moves.
    assert verification.fit_rmse_m < 1.0e-9
    assert verification.scale_relative_difference < ALIGNMENT_SCALE_RELATIVE_TOLERANCE


def test_a_pure_similarity_leaves_the_orientation_residual_at_float_noise(tmp_path):
    """``R'_i = R_i R^T`` is EXACT, so the honest margin is measured, not assumed.

    This is what makes the ceiling a sanity floor rather than a fitted number:
    an aligned model that really is the similarity of the raw one reports a
    residual nine decades under it.
    """

    verification = _verify(_reoriented_models(tmp_path, angle=0.0))
    assert verification.max_aligned_orientation_change_rad < 1.0e-14


# --- the digests ------------------------------------------------------------
@pytest.mark.parametrize(
    "field,message",
    (
        (
            "raw_pose_digest_sha256",
            "recomputed raw pre-BA pose digest disagrees with the child's proposal",
        ),
        (
            "aligned_pose_digest_sha256",
            "recomputed aligned pose digest disagrees with the child's proposal",
        ),
    ),
)
def test_a_declared_pose_digest_that_is_not_the_parents_is_refused(
    models, field, message
):
    with pytest.raises(AdapterError) as caught:
        _verify(models, proposal=_replace(models[3], **{field: "0" * 64}))
    assert str(caught.value) == message
    assert caught.value.code == ALIGNMENT_UNVERIFIED_CODE
