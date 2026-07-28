"""Item 7, the blocking gap: the CHILD-SIDE Refine engine body.

WHAT THIS MODULE IS.  Everything on the parent's side of the native boundary was
composed by ``refine_lifecycle``, and the child entry point that composition
named was the FROZEN disabled backend --
``refine_colmap_backend:run_refine_colmap_native`` -- which refuses with
``REFINE_BACKEND_DISABLED``.  A real host run therefore failed closed on that
exact code with no COLMAP process ever launched.  This module is the body that
call was missing: the code that runs inside the spawned child, executes the I87
primary operation plan against the QUALIFIED COLMAP toolchain, and produces the
seven descriptors the parent freezes and hands to the runner.

THE ENGINE PATH IS THE REVIEWED ONE, and nothing here widens it.
``docs/design/field-capture/p2-item4-colmap-adapter-spike-2026-07-18.md`` rules:

  * PRIMARY  = seed registered sparse model -> ``point_triangulator`` ->
    ``bundle_adjuster``, retaining the full ARKit rotation AND translation;
  * FALLBACK = database position priors -> ``pose_prior_mapper``; and
  * ``global_mapper`` is a DIAGNOSTIC ONLY, standalone GLOMAP is archived.

:func:`run_primary_engine_body` implements the primary and only the primary.
There is no fallback in this module: the packet contract the frozen child
enforces refuses any ``fallbackPolicy`` other than ``primary-only``
(``REFINE_FALLBACK_UNQUALIFIED``), so a fallback body here would be code no
admissible packet could reach.  ``global_mapper`` is not referenced, and the
CLI allowlist this module goes through
(:data:`~patina_scan_worker.refine_colmap_toolchain.COLMAP_COMMAND_ALLOWLIST`)
contains exactly one subcommand, ``point_triangulator``.

FAIL CLOSED ON THE TOOLCHAIN, WITH NO SECOND DOOR.  The first thing
:func:`run_refine_colmap_native_engine` does is
:func:`~patina_scan_worker.refine_colmap_toolchain.load_qualified_colmap_toolchain`,
which opens ``/opt/colmap/4.0.2`` through a root-owned descriptor walk, hashes
the executable, and compares it against the installed manifest.  When that
manifest is absent -- which is its state on every host in this repository -- the
load raises ``REFINE_TOOLCHAIN_UNQUALIFIED`` and this module stops.  It does not
look for ``colmap`` on ``PATH``, does not accept a caller-supplied prefix, and
has no unqualified branch to fall into: every command is planned by
:func:`~patina_scan_worker.refine_colmap_toolchain.plan_qualified_colmap_command`,
which refuses a toolchain that is not both box-identity-proved and
descriptor-pinned.  That is the whole point of item 3's pins and nothing here
may route around them.

WHAT RUNS IN-PROCESS AND WHAT RUNS AS A COMMAND.  The I87 plan is mostly
PyCOLMAP binding calls; exactly one phase is a CLI subprocess.  So this module
has two seams, and they are different in kind:

  * :class:`ColmapEngineBinding` is the version-sensitive PyCOLMAP surface.
    ``refine_engine.PycolmapBackend`` already owns six of those calls and the
    Item 4A qualification harness runs that same implementation;
    :class:`PycolmapEngineBinding` composes over it and adds only the four reads
    a handler needs that a qualification probe does not (keypoint tables,
    two-view geometries, model tracks, and the similarity transform).
  * The ``point_triangulator`` phase goes through
    :func:`~patina_scan_worker.refine_colmap_command.run_inherited_colmap_command`,
    which keeps the exec'd COLMAP inside the child's already-isolated process
    group and proves that group quiescent afterwards.

THE CHILD DECLARES WHAT IT EXPORTED, NOT WHAT IT COMPUTED.  Every number this
module hands up is derived from the bytes it is about to hand up.  The pose
digests and both similarity solves are computed by parsing the child's own
finished archives with :func:`~patina_scan_worker.refine_model_alignment
.read_sparse_model_snapshot` -- the SAME parser the parent will run on the SAME
bytes -- rather than from the in-memory reconstruction.  A transform solved on
the in-memory model and an archive that differs from it is the one drift this
arrangement cannot have.

THE ALIGNMENT CONTRACT IS THE PARENT'S, NOT A CHOICE MADE HERE.
``refine_model_alignment``'s ``CHILD PROPOSAL CONTRACT`` requires the declared
similarity to be the one carrying the RAW PRE-BA camera centres onto the ALIGNED
camera centres, solved on CAMERA CENTRES ONLY.  That is not the transform used
to align: the metric gauge is restored by solving refined -> raw and applying it
(:func:`_restore_metric_gauge`), and the DECLARED proposal is then a second,
near-identity solve raw -> aligned over the exported archives
(:func:`_declare_alignment_proposal`).  Both are :func:`refine_adapter
.estimate_sim3`.  Declaring the gauge transform instead would be refused by the
parent, and correctly so: it is a different transform.

WHAT ONLY A REAL RUN CAN ESTABLISH.  Stated here rather than in a report,
because every one of these is a thing this repository's tests CANNOT reach:

  * no COLMAP process has ever been launched by this code, and no PyCOLMAP
    wheel exists off the GPU box, so :class:`PycolmapEngineBinding` has never
    executed a single binding call.  Its method bodies are unexercised;
    :data:`PYCOLMAP_BINDING_EXECUTED` records that as a flag rather than as
    prose.
  * the exact 4.0.2 signatures of the four reads added here
    (``Database.read_keypoints`` and friends,
    ``Reconstruction.transform``/``points3D``) are taken from the documented
    API.  A signature drift is a ``TypeError`` on the box, not a refusal here.
  * no archive this repository has parsed came out of COLMAP, so the canonical
    USTAR archives :func:`write_sparse_model_archive` builds are proved against
    the parent's parser and against nothing else.
  * whether a 100-frame reconstruction fits the claimed lease, what VRAM it
    peaks at, and whether the deterministic pair graph yields a verified loop on
    a real room are all host questions.  ``vramPeakMb`` is reported as ``0`` and
    ``vramPeakMeasured`` as ``False`` for exactly that reason.
  * the residual seam recorded on :func:`_evidence_frames`: the pairs file is
    built from the packet's DECLARED ``rawCameraCenterMeters`` while the
    evidence builder rebuilds the same graph from centres it derives as
    ``-R^T t``.  The frozen child proves those agree to 1e-6 m; a candidate pair
    whose baseline sits within 1e-6 m of the 0.25 m or 1.5 m boundary could
    still fall on opposite sides, and the run then fails closed on
    ``two-view snapshot must cover the complete deterministic candidate graph``.
    Nothing here can close that; only one producer of the centres could.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import time
from collections.abc import Mapping, Sequence
from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .refine_adapter import (
    COLMAP_TARGET_VERSION,
    MIN_VERIFIED_INLIERS,
    POSE_PRIOR_STD_M,
    AdapterError,
    ColmapPose,
    NormalizedFrame,
    PinholeIntrinsics,
    PositionPrior,
    RefineDeadline,
    Sim3,
    classify_overlap,
    colmap_w2c_to_arkit_c2w,
    estimate_sim3,
)
from .refine_colmap_backend import (
    ColmapEngineFrame,
    ColmapEngineRequest,
    build_engine_pair_graph,
    build_primary_operation_plan,
    extract_colmap_packet,
    primary_point_triangulator_argv,
)
from .refine_colmap_command import run_inherited_colmap_command
from .refine_colmap_toolchain import (
    ColmapToolchain,
    leased_command_surfaces,
    load_qualified_colmap_toolchain,
    plan_qualified_colmap_command,
)
from .refine_adapter import _canonical_quaternion as _canonical_quaternion_sign
from .refine_adapter import _rotation_to_quaternion as _matrix_to_quaternion
from .refine_engine import (
    EngineImage,
    ModelEvidence,
    PycolmapBackend,
    PycolmapBackendConfig,
    _bounded_binding_output,
)
from .refine_evidence_builder import (
    PRIMARY_ENGINE,
    RAW_BASELINE_KIND,
    REFINED_MODEL_KIND,
    CandidateTwoViewGeometry,
    EvidenceEngineArtifactIdentity,
    EvidenceFrameSnapshot,
    EvidencePathProvenance,
    ModelTrackObservation,
    ModelTrackSnapshot,
    RefinementEvidenceBuildRequest,
    build_refinement_evidence,
)
from .refine_model_alignment import (
    SPARSE_MODEL_CANONICAL_MEMBER_ORDER,
    SPARSE_MODEL_REQUIRED_MEMBERS,
    SparseModelSnapshot,
    canonical_pose_digest,
    read_sparse_model_snapshot,
)
from .refine_native_process import (
    NATIVE_ENGINE_OUTPUT_TOKENS,
    NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
    NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
    NativeChildContext,
    native_engine_entrypoint,
)
from .refine_packet_extractor import ExtractedColmapPacket

# ---------------------------------------------------------------------------
# Posture
# ---------------------------------------------------------------------------
#: This module is a body, not an enablement.  ``stages.get_handler`` still
#: returns ``None`` for ``scan_pipeline.refine``, ``config.DEFAULT_STAGES`` is
#: unchanged, and nothing under ``stages/`` imports this file.
PRODUCTION_ENABLEMENT = "composed-child-body-unqualified"

#: Qualification is host evidence plus a ruling.  Writing the body is neither.
REFINE_ENGINE_BODY_QUALIFIED = False

#: Whether any PyCOLMAP binding call in this module has ever executed.  It has
#: not: the 4.0.2 CUDA wheel exists only on the GPU box and no test in this
#: repository imports it.  Every proof below drives :class:`ColmapEngineBinding`
#: with a recorded stand-in, which measures the composition and not the binding.
PYCOLMAP_BINDING_EXECUTED = False

#: Whether a COLMAP process has ever been launched by this module.  It has not.
COLMAP_PROCESS_LAUNCHED = False

#: The entry point this body REPLACES, kept named so the previous refusal stays
#: legible: it is the frozen disabled backend, which raises
#: ``REFINE_BACKEND_DISABLED`` and must keep doing so.
DISABLED_BACKEND_ENTRYPOINT = (
    "patina_scan_worker.refine_colmap_backend:run_refine_colmap_native"
)

#: This module's own child entry point, named here so ``refine_lifecycle`` can
#: import the string rather than retype it.
CHILD_ENTRYPOINT = (
    "patina_scan_worker.refine_colmap_engine_body:run_refine_colmap_native_engine"
)

ENGINE_REPORT_CONTRACT = "patina-refine-colmap-engine-report-v1"
ENGINE_REPORT_SCHEMA_VERSION = 1
ENGINE_ADAPTER_CONTRACT = "patina-refine-colmap-engine-adapter-v2"
ENGINE_ADAPTER_SCHEMA_VERSION = 2
COMMAND_EVIDENCE_CONTRACT = "patina-refine-colmap-command-evidence-v1"
COMMAND_EVIDENCE_SCHEMA_VERSION = 1

ENGINE_FAILED_CODE = "REFINE_ENGINE_FAILED"
ENGINE_VERSION_MISMATCH_CODE = "REFINE_ENGINE_VERSION_MISMATCH"
LOW_OVERLAP_CODE = "REFINE_LOW_OVERLAP"

#: Deterministic RNG seed and per-image feature ceiling for the primary path.
#: Both are the values ``build_primary_operation_plan`` already records in the
#: reviewed plan (``randomSeed`` 0); the feature ceiling is a bounded-work
#: choice, not a measurement, and the box run is what will judge it.
ENGINE_RANDOM_SEED = 0
ENGINE_MAX_FEATURES_PER_IMAGE = 8192

#: Sub-directories of the leased ``work/`` surface this body creates.  Model
#: directories are COLMAP's own output shape; the archives beside them are what
#: leaves the boundary.
SEED_MODEL_DIRECTORY = "seed-model"
TRIANGULATED_MODEL_DIRECTORY = "triangulated-model"
REFINED_MODEL_DIRECTORY = "refined-model"
ALIGNED_MODEL_DIRECTORY = "aligned-model"
COMMAND_LOG_DIRECTORY = "logs"

#: The scratch snapshot the evidence builder requires an identity for and the
#: boundary has no token for.  It is hashed and named, never exported: the
#: child-to-parent universe is closed at seven.
REFINED_MODEL_SNAPSHOT_NAME = "refined-model-snapshot-v1.tar"

#: The three artifact identities ``refine_evidence_builder`` requires, with the
#: exact relative paths and media types it pins.  Restated here as a literal so
#: a change on either side contradicts a test rather than silently agreeing.
EVIDENCE_ARTIFACT_ROLES: Mapping[str, tuple[str, str]] = {
    "database-v1.db": ("engine/database-v1.db", "application/vnd.sqlite3"),
    "raw-triangulated-model-snapshot-v1.tar": (
        "evidence/raw-triangulated-model-snapshot-v1.tar",
        "application/x-tar",
    ),
    REFINED_MODEL_SNAPSHOT_NAME: (
        "evidence/refined-model-snapshot-v1.tar",
        "application/x-tar",
    ),
}

#: Re-check the carried deadline every this many items in this body's own loops.
DEADLINE_CHECK_INTERVAL = 32

_TAR_BLOCK = 512
_READ_BYTES = 1024 * 1024


def _fail(message: str, code: str = ENGINE_FAILED_CODE) -> AdapterError:
    return AdapterError(message, code)


def _checkpoint(deadline: RefineDeadline, index: int = 0) -> None:
    if index % DEADLINE_CHECK_INTERVAL == 0:
        deadline.remaining_seconds()


def _canonical_json_bytes(value: object) -> bytes:
    try:
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
    except (RecursionError, TypeError, ValueError, UnicodeEncodeError) as exc:
        raise _fail("engine document is not canonicalizable") from exc


# ---------------------------------------------------------------------------
# The binding seam
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class TwoViewGeometryRow:
    """One candidate pair's post-verification database state.

    ``relative_rotation``/``translation_direction`` are ``None`` together when
    the pair carries no two-view geometry at all.  The evidence builder refuses
    a half-populated row, so this type keeps them paired.
    """

    first: str
    second: str
    inlier_index_pairs: tuple[tuple[int, int], ...]
    relative_rotation: tuple[tuple[float, float, float], ...] | None
    translation_direction: tuple[float, float, float] | None


class ColmapEngineBinding(Protocol):
    """The version-sensitive PyCOLMAP surface the primary body needs.

    Ten calls, and no more.  Everything else in this module -- the pair graph,
    the overlap verdict, both similarity solves, the archives, the digests, the
    documents and the report -- is dependency-free Python that runs on any host,
    which is what makes the composition testable without the GPU box.
    """

    @property
    def binding_version(self) -> str: ...

    def toolchain_evidence(self) -> Mapping[str, Any]: ...

    def extract_gpu_features(
        self,
        *,
        database_path: Path,
        image_dir: Path,
        images: Sequence[EngineImage],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    def rewrite_intrinsics_preserving_ids(
        self,
        *,
        database_path: Path,
        images: Sequence[EngineImage],
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    def match_explicit_pairs(
        self,
        *,
        database_path: Path,
        pairs_path: Path,
        image_pairs: Sequence[tuple[str, str]],
        gpu_index: str,
        log_path: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    def read_two_view_geometries(
        self,
        *,
        database_path: Path,
        image_pairs: Sequence[tuple[str, str]],
        log_path: Path,
    ) -> Sequence[TwoViewGeometryRow]: ...

    def read_keypoint_tables(
        self,
        *,
        database_path: Path,
        image_names: Sequence[str],
        log_path: Path,
    ) -> Mapping[str, tuple[tuple[float, float], ...]]: ...

    def build_known_pose_seed(
        self,
        *,
        database_path: Path,
        images: Sequence[EngineImage],
        output_path: Path,
        log_path: Path,
    ) -> ModelEvidence: ...

    def inspect_model(self, path: Path, *, log_path: Path) -> ModelEvidence: ...

    def bundle_adjust_with_success_evidence(
        self,
        *,
        input_path: Path,
        output_path: Path,
        log_path: Path,
    ) -> Mapping[str, Any]: ...

    def read_model_tracks(
        self,
        path: Path,
        *,
        log_path: Path,
    ) -> Sequence[ModelTrackSnapshot]: ...

    def write_similarity_transformed_model(
        self,
        *,
        input_path: Path,
        output_path: Path,
        transform: Sim3,
        log_path: Path,
    ) -> None: ...


class PycolmapEngineBinding:
    """The real binding: :class:`PycolmapBackend` plus four handler-only reads.

    Composition rather than subclassing, and rather than editing
    ``refine_engine``: that module is the seam the Item 4A qualification harness
    imports, and a handler's extra reads have no business changing what a
    qualification probe executes.

    NEVER EXECUTED.  See :data:`PYCOLMAP_BINDING_EXECUTED`.  The four added
    methods call documented COLMAP 4.0.2 APIs; a signature drift surfaces on the
    box as an exception from this module, which the child boundary normalizes to
    ``REFINE_ENGINE_FAILED``.
    """

    def __init__(self, backend: PycolmapBackend, pycolmap_module: Any) -> None:
        self._backend = backend
        self._p = pycolmap_module

    @classmethod
    def load(cls) -> "PycolmapEngineBinding":
        import importlib

        backend = PycolmapBackend.load(
            config=PycolmapBackendConfig(
                random_seed=ENGINE_RANDOM_SEED,
                maximum_features_per_image=ENGINE_MAX_FEATURES_PER_IMAGE,
                geometric_verification_minimum_inliers=MIN_VERIFIED_INLIERS,
            )
        )
        return cls(backend, importlib.import_module("pycolmap"))

    @property
    def binding_version(self) -> str:
        return self._backend.version

    def toolchain_evidence(self) -> Mapping[str, Any]:
        return self._backend.toolchain_evidence()

    def extract_gpu_features(self, **kwargs: Any) -> Sequence[Mapping[str, Any]]:
        return self._backend.extract_gpu_features(**kwargs)

    def rewrite_intrinsics_preserving_ids(
        self, **kwargs: Any
    ) -> Sequence[Mapping[str, Any]]:
        return self._backend.rewrite_intrinsics_preserving_ids(**kwargs)

    def match_explicit_pairs(self, **kwargs: Any) -> Sequence[Mapping[str, Any]]:
        return self._backend.match_explicit_pairs(**kwargs)

    def build_known_pose_seed(self, **kwargs: Any) -> ModelEvidence:
        return self._backend.build_known_pose_seed(**kwargs)

    def inspect_model(self, path: Path, *, log_path: Path) -> ModelEvidence:
        return self._backend.inspect_model(path, log_path=log_path)

    def bundle_adjust_with_success_evidence(
        self, **kwargs: Any
    ) -> Mapping[str, Any]:
        return self._backend.bundle_adjust_with_success_evidence(**kwargs)

    # --- the four handler-only reads ------------------------------------
    def read_keypoint_tables(
        self,
        *,
        database_path: Path,
        image_names: Sequence[str],
        log_path: Path,
    ) -> Mapping[str, tuple[tuple[float, float], ...]]:
        tables: dict[str, tuple[tuple[float, float], ...]] = {}
        with _bounded_binding_output(self._p, log_path):
            with self._p.Database.open(database_path) as database:
                for name in image_names:
                    image = database.read_image_with_name(name)
                    if image is None:
                        raise _fail(f"database is missing engine image {name}")
                    rows = database.read_keypoints(int(image.image_id))
                    tables[name] = tuple(
                        (float(row[0]), float(row[1])) for row in rows
                    )
        return tables

    def read_two_view_geometries(
        self,
        *,
        database_path: Path,
        image_pairs: Sequence[tuple[str, str]],
        log_path: Path,
    ) -> Sequence[TwoViewGeometryRow]:
        rows: list[TwoViewGeometryRow] = []
        with _bounded_binding_output(self._p, log_path):
            with self._p.Database.open(database_path) as database:
                for first_name, second_name in image_pairs:
                    first = database.read_image_with_name(first_name)
                    second = database.read_image_with_name(second_name)
                    if first is None or second is None:
                        raise _fail("database is missing a candidate pair endpoint")
                    first_id = int(first.image_id)
                    second_id = int(second.image_id)
                    if not database.exists_two_view_geometry(first_id, second_id):
                        rows.append(
                            TwoViewGeometryRow(first_name, second_name, (), None, None)
                        )
                        continue
                    geometry = database.read_two_view_geometry(first_id, second_id)
                    inliers = tuple(
                        (int(pair[0]), int(pair[1]))
                        for pair in geometry.inlier_matches
                    )
                    pose = geometry.cam2_from_cam1
                    rotation = tuple(
                        tuple(float(value) for value in row)
                        for row in pose.rotation.matrix()
                    )
                    translation = tuple(float(value) for value in pose.translation)
                    norm = math.sqrt(sum(value * value for value in translation))
                    if not math.isfinite(norm) or norm <= 0.0:
                        raise _fail(
                            "verified two-view geometry has no translation direction"
                        )
                    rows.append(
                        TwoViewGeometryRow(
                            first_name,
                            second_name,
                            inliers,
                            rotation,  # type: ignore[arg-type]
                            tuple(value / norm for value in translation),  # type: ignore[arg-type]
                        )
                    )
        return rows

    def read_model_tracks(
        self,
        path: Path,
        *,
        log_path: Path,
    ) -> Sequence[ModelTrackSnapshot]:
        tracks: list[ModelTrackSnapshot] = []
        with _bounded_binding_output(self._p, log_path):
            reconstruction = self._p.Reconstruction(path)
            names = {
                int(image_id): str(reconstruction.image(image_id).name)
                for image_id in reconstruction.reg_image_ids()
            }
            for point3d_id, point in reconstruction.points3D.items():
                observations = tuple(
                    ModelTrackObservation(
                        engine_image_name=names[int(element.image_id)],
                        point2d_index=int(element.point2D_idx),
                    )
                    for element in point.track.elements
                )
                del point3d_id
                tracks.append(
                    ModelTrackSnapshot(
                        point3d=tuple(float(value) for value in point.xyz),  # type: ignore[arg-type]
                        observations=observations,
                    )
                )
        return tracks

    def write_similarity_transformed_model(
        self,
        *,
        input_path: Path,
        output_path: Path,
        transform: Sim3,
        log_path: Path,
    ) -> None:
        if output_path.exists():
            raise _fail("aligned model output path already exists")
        with _bounded_binding_output(self._p, log_path):
            reconstruction = self._p.Reconstruction(input_path)
            matrix = [
                [
                    transform.scale * transform.rotation[row][column]
                    for column in range(3)
                ]
                + [transform.translation[row]]
                for row in range(3)
            ]
            reconstruction.transform(self._p.Sim3d(matrix))
            output_path.mkdir(exist_ok=False)
            reconstruction.write(output_path)


# ---------------------------------------------------------------------------
# Canonical USTAR sparse-model archives
# ---------------------------------------------------------------------------
def _ustar_header(name: str, size: int) -> bytes:
    """Build the exact header ``refine_model_alignment`` will accept.

    Mode 0644, uid/gid/mtime 0, regular typeflag, USTAR magic and version, and
    empty link name and prefix -- every one of which that parser checks.  The
    field layout is duplicated from ``refine_lifecycle._ustar_header`` on
    purpose: this runs in the CHILD, and the child may not import the parent's
    composition module.  ``test_the_child_and_parent_ustar_headers_agree``
    compares the two byte for byte so the duplication cannot drift.
    """

    encoded = name.encode("ascii")
    if len(encoded) > 100:
        raise _fail("sparse model member name does not fit a canonical USTAR header")
    # A "size must be non-negative" clause stood here and was REMOVED.  The only
    # caller derives ``size`` from ``os.stat``, which cannot report a negative
    # size, and the parent's byte-identical twin in ``refine_lifecycle`` never
    # had one -- so it was a clause no input could reach, and this codebase does
    # not keep those.  The name clause above stays because it IS reachable, and
    # ``test_the_ustar_header_refuses_a_name_that_does_not_fit`` reaches it.
    header = bytearray(_TAR_BLOCK)
    header[0 : len(encoded)] = encoded
    header[100:108] = b"0000644\x00"
    header[108:116] = b"0000000\x00"
    header[116:124] = b"0000000\x00"
    header[124:136] = ("%011o\x00" % size).encode("ascii")
    header[136:148] = b"00000000000\x00"
    header[156:157] = b"0"
    header[257:263] = b"ustar\x00"
    header[263:265] = b"00"
    header[148:156] = b" " * 8
    header[148:156] = ("%06o\x00 " % sum(header)).encode("ascii")
    return bytes(header)


def write_sparse_model_archive(
    model_directory: Path,
    destination: Path,
    *,
    deadline: RefineDeadline,
) -> tuple[str, int]:
    """Pack one COLMAP model directory into a canonical USTAR archive.

    Members are emitted in :data:`SPARSE_MODEL_CANONICAL_MEMBER_ORDER`, which is
    the only order the parent's parser accepts and the only thing that makes the
    archive byte-deterministic for a given model.  The three required members
    must exist; the two optional COLMAP 4 members (``frames.bin``/``rigs.bin``)
    are carried when present and refused nowhere.

    Returns ``(sha256, size_bytes)`` measured on the bytes written, so the
    caller never re-reads a path to learn what it just produced.
    """

    if not isinstance(model_directory, Path) or not isinstance(destination, Path):
        raise _fail("sparse model archiving needs exact paths")
    if type(deadline) is not RefineDeadline:
        raise _fail("sparse model archiving requires the carried refine deadline")
    deadline.remaining_seconds()
    present: list[tuple[str, Path, int]] = []
    for member in SPARSE_MODEL_CANONICAL_MEMBER_ORDER:
        candidate = model_directory / member
        try:
            is_file = candidate.is_file()
        except OSError as exc:
            raise _fail(f"cannot inspect sparse model member {member}") from exc
        if not is_file:
            if member in SPARSE_MODEL_REQUIRED_MEMBERS:
                raise _fail(f"sparse model is missing {member}")
            continue
        present.append((member, candidate, candidate.stat().st_size))
    # A post-loop "did every required member arrive" count belonged here and was
    # REMOVED rather than kept.  The loop above raises on the first missing
    # required member, so the count could only ever be satisfied -- and this
    # codebase's own rule is that a clause no input can reach is a clause no
    # deletion can redden.  ``test_the_archive_refuses_a_model_missing_a_
    # required_member`` covers the refusal that does fire, once per member.

    digest = hashlib.sha256()
    total = 0
    descriptor = os.open(
        destination,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    with os.fdopen(descriptor, "wb", closefd=True) as archive:

        def emit(payload: bytes) -> None:
            nonlocal total
            archive.write(payload)
            digest.update(payload)
            total += len(payload)

        for index, (member, path, size) in enumerate(present):
            _checkpoint(deadline, index)
            emit(_ustar_header(member, size))
            written = 0
            with path.open("rb") as source:
                while written < size:
                    deadline.remaining_seconds()
                    block = source.read(min(_READ_BYTES, size - written))
                    if not block:
                        raise _fail(f"sparse model member {member} ended early")
                    emit(block)
                    written += len(block)
            pad = (-size) % _TAR_BLOCK
            if pad:
                emit(b"\x00" * pad)
        emit(b"\x00" * (_TAR_BLOCK * 2))
        archive.flush()
        os.fsync(archive.fileno())
    return digest.hexdigest(), total


def _hash_file(path: Path, *, deadline: RefineDeadline) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while True:
            deadline.remaining_seconds()
            block = handle.read(_READ_BYTES)
            if not block:
                break
            digest.update(block)
            size += len(block)
    return digest.hexdigest(), size


def _parse_own_archive(
    path: Path,
    *,
    label: str,
    deadline: RefineDeadline,
) -> SparseModelSnapshot:
    """Parse an archive this child just wrote, with the PARENT's parser.

    Using the same parser on the same bytes is the whole point: every scalar the
    child declares about a model is then a statement about the archive that will
    actually be handed up, not about an in-memory reconstruction that may or may
    not have serialized to it.
    """

    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        return read_sparse_model_snapshot(descriptor, label=label, deadline=deadline)
    finally:
        os.close(descriptor)


# ---------------------------------------------------------------------------
# The two similarity solves
# ---------------------------------------------------------------------------
def _restore_metric_gauge(
    raw: SparseModelSnapshot,
    refined: SparseModelSnapshot,
) -> Sim3:
    """Solve the transform that carries the POST-BA model back to metric.

    Source is the refined camera centres, target the raw pre-BA ARKit centres,
    exactly as the I87 "restore the metric gauge" step prescribes.  This is the
    transform that is APPLIED; it is not the transform that is DECLARED.
    """

    if raw.names() != refined.names():
        raise _fail("raw and refined snapshots carry different image names")
    return estimate_sim3(refined.centres(), raw.centres())


def _declare_alignment_proposal(
    raw: SparseModelSnapshot,
    aligned: SparseModelSnapshot,
) -> Sim3:
    """Solve the transform the PARENT will recompute, on the exported bytes.

    ``refine_model_alignment``'s child proposal contract defines the declared
    similarity as raw pre-BA centres -> aligned centres, centres only.  On a
    correctly aligned model this is near identity, which is exactly what the
    parent's gauge clauses (13) require.  It is solved here rather than inverted
    from :func:`_restore_metric_gauge` so that a transform the binding applied
    imperfectly -- or applied to a model that then serialized differently --
    shows up as a disagreement rather than as an algebraic tautology.
    """

    if raw.names() != aligned.names():
        raise _fail("raw and aligned snapshots carry different image names")
    return estimate_sim3(raw.centres(), aligned.centres())


# ---------------------------------------------------------------------------
# The overlap verdict, decided by the REVIEWED classifier
# ---------------------------------------------------------------------------
def _overlap_frames(frames: Sequence[ColmapEngineFrame]) -> tuple[NormalizedFrame, ...]:
    """Re-express engine frames as the rows ``classify_overlap`` consumes.

    ``refine_adapter.classify_overlap`` is the reviewed policy -- the three
    stable reasons, the 30-inlier floor, the 80% component fraction and the
    candidate-graph-only rule all live there -- and this body calls it rather
    than keeping a second copy of those thresholds.  What the classifier reads
    is ``frame_timestamp_s``, ``image_name`` and ``camera_center_m``; every
    other field below is a real conversion of packet data
    (:func:`refine_adapter.colmap_w2c_to_arkit_c2w` for the ARKit transform,
    :data:`refine_adapter.POSE_PRIOR_STD_M` for the prior covariance), not a
    placeholder, so nothing here would become a lie if the classifier grew.

    ``image_name`` is the canonical PPM engine identity, which is what makes the
    graph this rebuilds identical to :func:`build_engine_pair_graph`'s.
    """

    rows: list[NormalizedFrame] = []
    variance = POSE_PRIOR_STD_M * POSE_PRIOR_STD_M
    for frame in frames:
        fx, fy, cx, cy, width, height = frame.intrinsics
        intrinsics = PinholeIntrinsics(fx, fy, cx, cy, width, height)
        pose = ColmapPose(
            rotation=frame.cam_from_world_rotation,
            translation=frame.cam_from_world_translation,
            qvec=_rotation_to_quaternion(frame.cam_from_world_rotation),
        )
        rows.append(
            NormalizedFrame(
                ordinal=frame.ordinal,
                frame_timestamp_s=frame.frame_timestamp_s,
                heic_path=frame.source_image_name,
                image_name=frame.engine_image_name,
                arkit_camera_to_world=tuple(colmap_w2c_to_arkit_c2w(pose)),
                native_intrinsics=intrinsics,
                intrinsics=intrinsics,
                colmap_pose=pose,
                camera_center_m=frame.raw_camera_center_m,
                pose_prior=PositionPrior(
                    position_m=frame.raw_camera_center_m,
                    covariance_m2=(
                        (variance, 0.0, 0.0),
                        (0.0, variance, 0.0),
                        (0.0, 0.0, variance),
                    ),
                ),
            )
        )
    return tuple(rows)


def _rotation_to_quaternion(
    rotation: Sequence[Sequence[float]],
) -> tuple[float, float, float, float]:
    """Hamilton ``(qw, qx, qy, qz)`` with the ADAPTER's canonical sign.

    The two helpers this delegates to are ``refine_adapter`` privates, imported
    at module scope rather than reimplemented.  That is the deliberate choice:
    the sign convention is a package-wide contract -- the parent's pose digest
    canonicalises the same way -- and a second implementation of it here would
    be a second convention that could drift silently.  Importing a sibling
    module's private inside the same package makes the sharing visible.
    """

    return _canonical_quaternion_sign(
        _matrix_to_quaternion(tuple(tuple(row) for row in rotation))
    )


# ---------------------------------------------------------------------------
# Evidence assembly
# ---------------------------------------------------------------------------
def _pose_from_snapshot(snapshot: SparseModelSnapshot, name: str) -> ColmapPose:
    for pose in snapshot.poses:
        if pose.name == name:
            return ColmapPose(
                rotation=_quaternion_to_rotation(pose.qvec),
                translation=tuple(float(value) for value in pose.tvec),  # type: ignore[arg-type]
                qvec=tuple(float(value) for value in pose.qvec),  # type: ignore[arg-type]
            )
    raise _fail(f"snapshot does not carry engine image {name}")


def _quaternion_to_rotation(
    quaternion: Sequence[float],
) -> tuple[tuple[float, float, float], ...]:
    qw, qx, qy, qz = (float(value) for value in quaternion)
    return (
        (
            1.0 - 2.0 * (qy * qy + qz * qz),
            2.0 * (qx * qy - qz * qw),
            2.0 * (qx * qz + qy * qw),
        ),
        (
            2.0 * (qx * qy + qz * qw),
            1.0 - 2.0 * (qx * qx + qz * qz),
            2.0 * (qy * qz - qx * qw),
        ),
        (
            2.0 * (qx * qz - qy * qw),
            2.0 * (qy * qz + qx * qw),
            1.0 - 2.0 * (qx * qx + qy * qy),
        ),
    )


def _evidence_frames(
    packet: ExtractedColmapPacket,
    *,
    raw: SparseModelSnapshot,
    aligned: SparseModelSnapshot,
    database_rows: Mapping[str, Mapping[str, Any]],
    keypoints: Mapping[str, tuple[tuple[float, float], ...]],
    deadline: RefineDeadline,
) -> tuple[EvidenceFrameSnapshot, ...]:
    """Bind every evidence row to something the packet or an archive declared.

    The source identity comes from the packet's ``source-ledger`` and the
    materializer identity from its ``adapter-ledger``; both are optional by
    packet contract and both are REQUIRED here, because ``refine_evidence_builder``
    demands the fields they carry and nothing else in the packet has them.  A
    packet without them is refused rather than filled in with a guess.

    RESIDUAL, recorded here because it belongs next to the code: the ``refined``
    pose written into each row is the ALIGNED model's, not the pre-alignment
    post-BA model's.  Reprojection is invariant under a similarity applied to
    poses AND points together, and the aligned tracks are what this body passes
    as ``refined_tracks``, so the reprojection numbers are the same either way.
    What the choice does buy is that every published number describes the model
    that is actually published.
    """

    ledger = packet.source_ledger
    adapter = packet.adapter_ledger
    if ledger is None:
        raise _fail("engine evidence requires the packet's source ledger")
    if adapter is None:
        raise _fail("engine evidence requires the packet's adapter ledger")
    rows: list[EvidenceFrameSnapshot] = []
    for index, frame in enumerate(packet.engine_request.frames):
        _checkpoint(deadline, index)
        source = ledger.rows[index]
        identity = database_rows.get(frame.engine_image_name)
        if identity is None:
            raise _fail(
                f"database identity is missing for {frame.engine_image_name}"
            )
        table = keypoints.get(frame.engine_image_name)
        if not table:
            raise _fail(
                f"database keypoint table is missing for {frame.engine_image_name}"
            )
        fx, fy, cx, cy, width, height = frame.intrinsics
        rows.append(
            EvidenceFrameSnapshot(
                ordinal=frame.ordinal,
                frame_timestamp_s=frame.frame_timestamp_s,
                engine_image_name=frame.engine_image_name,
                engine_relative_path=frame.engine_relative_path,
                engine_sha256=frame.engine_sha256,
                engine_size_bytes=frame.engine_size_bytes,
                source_archive_key=source.source_archive_key,
                source_member=source.source_member,
                source_image_name=source.source_image_name,
                source_sha256=source.source_sha256,
                source_size_bytes=source.source_size_bytes,
                materializer_id=adapter.materializer_id,
                intrinsics=PinholeIntrinsics(fx, fy, cx, cy, width, height),
                database_image_id=int(identity["imageId"]),
                database_camera_id=int(identity["cameraId"]),
                database_keypoints=table,
                raw_cam_from_world=_pose_from_snapshot(raw, frame.engine_image_name),
                refined_cam_from_world=_pose_from_snapshot(
                    aligned, frame.engine_image_name
                ),
            )
        )
    return tuple(rows)


def _evidence_artifacts(
    identities: Mapping[str, tuple[str, int]],
) -> tuple[EvidenceEngineArtifactIdentity, ...]:
    rows: list[EvidenceEngineArtifactIdentity] = []
    for name, (relative_path, media_type) in sorted(EVIDENCE_ARTIFACT_ROLES.items()):
        try:
            sha256, size_bytes = identities[name]
        except KeyError as exc:
            raise _fail(f"engine evidence is missing the identity of {name}") from exc
        rows.append(
            EvidenceEngineArtifactIdentity(
                name=name,
                relative_path=relative_path,
                sha256=sha256,
                size_bytes=size_bytes,
                semantic_media_type=media_type,
            )
        )
    return tuple(rows)


# ---------------------------------------------------------------------------
# The command phase
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ExecutedCommand:
    """One CLI phase, recorded for ``engine-command-evidence-v1.json``."""

    phase: str
    argv: tuple[str, ...]
    returncode: int
    output_tail: str


def _run_point_triangulator(
    *,
    toolchain: ColmapToolchain,
    context: NativeChildContext,
    deadline: RefineDeadline,
    database_path: Path,
    image_path: Path,
    seed_model_path: Path,
    output_path: Path,
    log_path: Path,
    command_runner: Any,
    planner: Any,
) -> ExecutedCommand:
    """Plan and run the ONE allowlisted CLI phase, through the qualified door.

    ``plan_qualified_colmap_command`` is not a convenience wrapper: it refuses a
    toolchain that was not proved against :data:`QUALIFIED_BOX_LOCATION` and it
    requires the Linux ``/proc/self/fd`` descriptor exec, so there is no route
    from here to an unqualified binary.  The argv itself is the frozen backend's
    :func:`primary_point_triangulator_argv`, so this body cannot invent options.
    """

    workspace, cwd, temp_directory = leased_command_surfaces(context)
    argv = primary_point_triangulator_argv(
        colmap=Path(toolchain.identity.path),
        database_path=database_path,
        image_path=image_path,
        seed_model_path=seed_model_path,
        triangulated_model_path=output_path,
    )
    plan = planner(
        argv,
        toolchain=toolchain,
        workspace=workspace,
        cwd=cwd,
        temp_directory=temp_directory,
        context=context,
        deadline=deadline,
    )
    result = command_runner(
        plan,
        context=context,
        deadline=deadline,
        log_path=log_path,
        cwd=cwd,
    )
    if int(result.returncode) != 0:
        raise _fail(
            "COLMAP point_triangulator exited "
            f"{int(result.returncode)}: {result.output_tail}"
        )
    return ExecutedCommand(
        phase="colmap.point_triangulator",
        argv=tuple(plan.argv),
        returncode=int(result.returncode),
        output_tail=str(result.output_tail),
    )


# ---------------------------------------------------------------------------
# The composed primary body
# ---------------------------------------------------------------------------
def run_primary_engine_body(
    packet: ExtractedColmapPacket,
    *,
    context: NativeChildContext,
    deadline: RefineDeadline,
    binding: ColmapEngineBinding,
    toolchain: ColmapToolchain,
    command_runner: Any = run_inherited_colmap_command,
    planner: Any = plan_qualified_colmap_command,
) -> dict[str, Any]:
    """Execute the I87 primary plan and return the child's bounded report.

    Every phase receives the SAME carried deadline object.  No clock is created
    here: ``deadline`` is the parent's, re-materialized from the context's
    carried absolute expiry by :func:`run_refine_colmap_native_engine` exactly as
    the existing native-command tests do, and
    ``refine_colmap_toolchain.shared_remaining_seconds`` takes the minimum of the
    two on every toolchain read.
    """

    if type(packet) is not ExtractedColmapPacket:
        raise _fail("engine body requires an exact ExtractedColmapPacket")
    if type(context) is not NativeChildContext:
        raise _fail("engine body requires the carried native child context")
    if type(deadline) is not RefineDeadline:
        raise _fail("engine body requires the carried refine deadline")
    if type(toolchain) is not ColmapToolchain or toolchain.qualified is not True:
        raise _fail(
            "engine body requires the qualified COLMAP toolchain",
            "REFINE_TOOLCHAIN_UNQUALIFIED",
        )
    started = time.monotonic()
    deadline.remaining_seconds()

    # THE CLI VERSION IS NOT RE-CHECKED HERE, and that is not an omission.  A
    # toolchain can only be ``qualified`` because ``assert_qualified_box_identity``
    # already compared ``colmapVersion`` against :data:`QUALIFIED_COLMAP_VERSION`
    # -- so a clause here could never fire, and this codebase's own rule is that
    # a clause no input can reach is a clause no deletion can redden.  What is
    # NOT already proved is the wheel that got IMPORTED: the manifest declares
    # ``pycolmapVersion``, and the module actually loaded reports its own.  Those
    # are two independent facts and the check below is the only place they meet.
    cli_version = str(toolchain.manifest.colmap_version)
    binding_version = str(binding.binding_version)
    declared_binding = str(toolchain.manifest.pycolmap_version)
    if binding_version != declared_binding:
        raise _fail(
            "imported PyCOLMAP disagrees with the toolchain manifest",
            ENGINE_VERSION_MISMATCH_CODE,
        )

    request: ColmapEngineRequest = packet.engine_request
    frames = request.frames
    work = Path(context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY))
    packet_root = Path(
        context.workspace_subdirectory_path(NATIVE_WORKSPACE_PACKET_SUBDIRECTORY)
    )
    logs = work / COMMAND_LOG_DIRECTORY
    logs.mkdir(mode=0o700, exist_ok=False)
    database_path = work / "database-v1.db"
    pairs_path = work / "pairs-v2.txt"
    image_dir = packet_root / "images"

    images = tuple(
        EngineImage(
            name=frame.engine_image_name,
            intrinsics=PinholeIntrinsics(*frame.intrinsics),
            cam_from_world=ColmapPose(
                rotation=frame.cam_from_world_rotation,
                translation=frame.cam_from_world_translation,
                qvec=_rotation_to_quaternion(frame.cam_from_world_rotation),
            ),
        )
        for frame in frames
    )

    # 1. The deterministic candidate graph, written where COLMAP reads it and
    #    where the publisher will later ship it: they are the same file.
    pairs = build_engine_pair_graph(frames)
    # An "empty pair graph" refusal stood here and was REMOVED as unreachable.
    # The frozen packet parser admits no packet with fewer than
    # ``COLMAP_PACKET_MIN_ENGINE_IMAGES`` (3) engine images, and the temporal
    # window is 10, so ``build_engine_pair_graph`` emits at least one pair for
    # every admissible packet.  Real low overlap is not this clause's job
    # either: ``classify_overlap`` below owns that verdict and its three stable
    # reasons, and it is reached on every run.
    pairs_payload = "".join(f"{first} {second}\n" for first, second in pairs).encode(
        "ascii"
    )
    pairs_path.write_bytes(pairs_payload)
    deadline.remaining_seconds()

    # 2-3. Features, then the per-image intrinsic rewrite that preserves the ids
    #      keypoints and matches are already keyed on.
    feature_rows = binding.extract_gpu_features(
        database_path=database_path,
        image_dir=image_dir,
        images=images,
        gpu_index=request.gpu_index,
        log_path=logs / "extract-features.log",
    )
    database_rows = {str(row["name"]): row for row in feature_rows}
    if set(database_rows) != {image.name for image in images}:
        raise _fail("feature extraction did not cover the engine image universe")
    deadline.remaining_seconds()
    binding.rewrite_intrinsics_preserving_ids(
        database_path=database_path,
        images=images,
        log_path=logs / "rewrite-intrinsics.log",
    )
    deadline.remaining_seconds()

    # 4-5. Match the explicit graph, then classify overlap with the REVIEWED
    #      classifier over the candidate graph only.
    match_rows = binding.match_explicit_pairs(
        database_path=database_path,
        pairs_path=pairs_path,
        image_pairs=pairs,
        gpu_index=request.gpu_index,
        log_path=logs / "match-pairs.log",
    )
    verified_inliers = {
        (str(row["first"]), str(row["second"])): int(row["verifiedInliers"])
        for row in match_rows
    }
    verdict = classify_overlap(_overlap_frames(frames), verified_inliers)
    if not verdict.ok:
        raise _fail(verdict.reason, verdict.code or LOW_OVERLAP_CODE)
    deadline.remaining_seconds()

    geometry_rows = tuple(
        binding.read_two_view_geometries(
            database_path=database_path,
            image_pairs=pairs,
            log_path=logs / "two-view-geometries.log",
        )
    )
    if tuple((row.first, row.second) for row in geometry_rows) != pairs:
        raise _fail("two-view geometry read did not cover the candidate graph")
    keypoints = binding.read_keypoint_tables(
        database_path=database_path,
        image_names=tuple(image.name for image in images),
        log_path=logs / "keypoints.log",
    )
    deadline.remaining_seconds()

    # 6. The known-pose seed, with the database's own image and camera ids.
    seed_directory = work / SEED_MODEL_DIRECTORY
    seed_evidence = binding.build_known_pose_seed(
        database_path=database_path,
        images=images,
        output_path=seed_directory,
        log_path=logs / "build-seed.log",
    )
    _require_model_covers(seed_evidence, images, database_rows, role="seed")
    if seed_evidence.num_points3d != 0:
        raise _fail("known-pose seed must start with no triangulated points")
    seed_sha256, seed_size = write_sparse_model_archive(
        seed_directory,
        work / "seed-model-v1.tar",
        deadline=deadline,
    )

    # 7. The one CLI phase.
    triangulated_directory = work / TRIANGULATED_MODEL_DIRECTORY
    commands = [
        _run_point_triangulator(
            toolchain=toolchain,
            context=context,
            deadline=deadline,
            database_path=database_path,
            image_path=image_dir,
            seed_model_path=seed_directory,
            output_path=triangulated_directory,
            log_path=logs / "point-triangulator.log",
            command_runner=command_runner,
            planner=planner,
        )
    ]
    triangulated_evidence = binding.inspect_model(
        triangulated_directory,
        log_path=logs / "inspect-triangulated.log",
    )
    _require_model_covers(
        triangulated_evidence, images, database_rows, role="triangulated"
    )
    if triangulated_evidence.num_points3d < 1:
        raise _fail("triangulation produced no points", LOW_OVERLAP_CODE)
    raw_sha256, raw_size = write_sparse_model_archive(
        triangulated_directory,
        work / "raw-triangulated-model-snapshot-v1.tar",
        deadline=deadline,
    )
    raw_tracks = tuple(
        binding.read_model_tracks(
            triangulated_directory,
            log_path=logs / "raw-tracks.log",
        )
    )

    # 8. Bundle adjustment.  A failed solve is never silently downgraded to the
    #    raw ARKit output; it is a refusal.
    refined_directory = work / REFINED_MODEL_DIRECTORY
    bundle = binding.bundle_adjust_with_success_evidence(
        input_path=triangulated_directory,
        output_path=refined_directory,
        log_path=logs / "bundle-adjuster.log",
    )
    if not bool(bundle.get("usable")) or not bool(bundle.get("modelWritten")):
        raise _fail("bundle adjustment did not produce a usable refined model")
    refined_evidence = binding.inspect_model(
        refined_directory,
        log_path=logs / "inspect-refined.log",
    )
    _require_model_covers(refined_evidence, images, database_rows, role="refined")
    refined_snapshot_sha256, refined_snapshot_size = write_sparse_model_archive(
        refined_directory,
        work / REFINED_MODEL_SNAPSHOT_NAME,
        deadline=deadline,
    )

    # 9. Restore the metric gauge, from the archives rather than from memory.
    raw_snapshot = _parse_own_archive(
        work / "raw-triangulated-model-snapshot-v1.tar",
        label="raw pre-BA",
        deadline=deadline,
    )
    refined_parsed = _parse_own_archive(
        work / REFINED_MODEL_SNAPSHOT_NAME,
        label="refined",
        deadline=deadline,
    )
    gauge = _restore_metric_gauge(raw_snapshot, refined_parsed)
    aligned_directory = work / ALIGNED_MODEL_DIRECTORY
    binding.write_similarity_transformed_model(
        input_path=refined_directory,
        output_path=aligned_directory,
        transform=gauge,
        log_path=logs / "align-model.log",
    )
    aligned_sha256, aligned_size = write_sparse_model_archive(
        aligned_directory,
        work / "aligned-sparse-model-v1.tar",
        deadline=deadline,
    )
    aligned_snapshot = _parse_own_archive(
        work / "aligned-sparse-model-v1.tar",
        label="aligned",
        deadline=deadline,
    )
    proposal = _declare_alignment_proposal(raw_snapshot, aligned_snapshot)
    aligned_tracks = tuple(
        binding.read_model_tracks(
            aligned_directory,
            log_path=logs / "aligned-tracks.log",
        )
    )
    deadline.remaining_seconds()

    # 10. Evidence, on identical tracks before and after.
    database_sha256, database_size = _hash_file(database_path, deadline=deadline)
    evidence = build_refinement_evidence(
        RefinementEvidenceBuildRequest(
            frames=_evidence_frames(
                packet,
                raw=raw_snapshot,
                aligned=aligned_snapshot,
                database_rows=database_rows,
                keypoints=keypoints,
                deadline=deadline,
            ),
            engine_artifacts=_evidence_artifacts(
                {
                    "database-v1.db": (database_sha256, database_size),
                    "raw-triangulated-model-snapshot-v1.tar": (raw_sha256, raw_size),
                    REFINED_MODEL_SNAPSHOT_NAME: (
                        refined_snapshot_sha256,
                        refined_snapshot_size,
                    ),
                }
            ),
            provenance=EvidencePathProvenance(
                selected_engine=PRIMARY_ENGINE,
                fallback_trigger=None,
                raw_baseline_kind=RAW_BASELINE_KIND,
                refined_model_kind=REFINED_MODEL_KIND,
                rotation_prior_represented=True,
            ),
            raw_tracks=raw_tracks,
            refined_tracks=aligned_tracks,
            two_view_geometries=tuple(
                CandidateTwoViewGeometry(
                    first_engine_image_name=row.first,
                    second_engine_image_name=row.second,
                    inlier_correspondences=row.inlier_index_pairs,
                    verified_relative_rotation=row.relative_rotation,
                    verified_translation_direction=row.translation_direction,
                )
                for row in geometry_rows
            ),
        ),
        deadline=deadline,
    )

    # 11. The two remaining documents, then the seven digests.
    adapter_payload = _canonical_json_bytes(
        _adapter_document(packet, pairs=pairs, verdict_reason=verdict.reason)
    )
    (work / "adapter-v2.json").write_bytes(adapter_payload)
    command_payload = _canonical_json_bytes(
        _command_evidence_document(commands, plan=build_primary_operation_plan(request))
    )
    (work / "engine-command-evidence-v1.json").write_bytes(command_payload)

    digests: dict[str, str] = {}
    sizes: dict[str, int] = {}
    for index, token in enumerate(NATIVE_ENGINE_OUTPUT_TOKENS):
        _checkpoint(deadline, index)
        digest, size = _hash_file(work / token, deadline=deadline)
        digests[token] = digest
        sizes[token] = size
    for token, expected in (
        ("seed-model-v1.tar", seed_sha256),
        ("raw-triangulated-model-snapshot-v1.tar", raw_sha256),
        ("aligned-sparse-model-v1.tar", aligned_sha256),
    ):
        if digests[token] != expected:
            raise _fail(f"{token} changed between packing and hashing")

    aligned_evidence = binding.inspect_model(
        aligned_directory,
        log_path=logs / "inspect-aligned.log",
    )
    _require_model_covers(aligned_evidence, images, database_rows, role="aligned")
    telemetry_metrics = {
        "alignedPoints": int(aligned_evidence.num_points3d),
        # Not measured, and flagged as such rather than omitted: neither this
        # body nor ``refine_engine`` reads a solver iteration count or a VRAM
        # peak, so ``iterations``/``vramPeakMb`` below are structural zeros.
        "bundleIterationsMeasured": False,
        "vramPeakMeasured": False,
        "bundleAdjustmentResiduals": int(bundle.get("numResiduals", 0)),
        "bundleAdjustmentTermination": str(bundle.get("terminationType", "unknown")),
        "candidatePairs": len(pairs),
        "engineImages": len(frames),
        "gaugeScale": float(gauge.scale),
        "largestComponentFraction": float(verdict.largest_component_fraction),
        "packetChunks": len(packet.manifest.chunks),
        "proposalScale": float(proposal.scale),
        "refinedPoints": int(refined_evidence.num_points3d),
        "triangulatedPoints": int(triangulated_evidence.num_points3d),
        "verifiedEdges": int(verdict.verified_edges),
        "verifiedLoopEdges": int(verdict.verified_loop_edges),
        "withinPilotFrameRange": bool(packet.within_pilot_frame_range),
    }
    # A ">32 metrics" refusal stood here and was REMOVED, together with the
    # constant it read.  The dict above is a literal with a fixed number of
    # keys, so the clause could never fire at runtime -- it could only ever be
    # violated by editing this function, which is a review-time event, not a
    # run-time one.  The bound is enforced where it can actually redden:
    # ``test_the_telemetry_is_bounded_and_says_what_it_did_not_measure``
    # asserts ``len(metrics) <= 32`` on the REPORT a composed run produced.

    return {
        "contract": ENGINE_REPORT_CONTRACT,
        "schemaVersion": ENGINE_REPORT_SCHEMA_VERSION,
        "cliVersion": cli_version,
        "bindingVersion": binding_version,
        "selectedEngine": PRIMARY_ENGINE,
        "evidence": {
            "inputImages": evidence.input_images,
            "registeredImagesBefore": evidence.registered_images_before,
            "registeredImagesAfter": evidence.registered_images_after,
            "commonObservations": evidence.common_observations,
            "commonObservationSetSha256": evidence.common_observation_set_sha256,
            "reprojectionRmsePxBefore": evidence.reprojection_rmse_px_before,
            "reprojectionRmsePxAfter": evidence.reprojection_rmse_px_after,
            "verifiedLoopEdges": evidence.verified_loop_edges,
            "verifiedLoopSetSha256": evidence.verified_loop_set_sha256,
            "loopRotationRmseDegBefore": evidence.loop_rotation_rmse_deg_before,
            "loopRotationRmseDegAfter": evidence.loop_rotation_rmse_deg_after,
            "loopTranslationDirectionRmseDegBefore": (
                evidence.loop_translation_direction_rmse_deg_before
            ),
            "loopTranslationDirectionRmseDegAfter": (
                evidence.loop_translation_direction_rmse_deg_after
            ),
        },
        "alignment": {
            "scale": float(proposal.scale),
            "rotation": [list(row) for row in proposal.rotation],
            "translationMeters": list(proposal.translation),
            "rawPoseDigestSha256": canonical_pose_digest(raw_snapshot),
            "alignedPoseDigestSha256": canonical_pose_digest(aligned_snapshot),
        },
        "telemetry": {
            "durationMs": max(0, int((time.monotonic() - started) * 1000.0)),
            # Structural zeros, flagged by ``bundleIterationsMeasured`` and
            # ``vramPeakMeasured`` in the metrics above.  ``refine_engine``'s
            # bundle-adjustment evidence carries a residual count and a
            # termination type, not an iteration count, and nothing in this
            # process reads GPU memory.  A fabricated number would be worse
            # than a zero the report says is unmeasured.
            "iterations": 0,
            "vramPeakMb": 0,
            "commandCount": len(commands),
            "metrics": telemetry_metrics,
        },
        "outputs": {
            token: {"sha256": digests[token], "sizeBytes": sizes[token]}
            for token in NATIVE_ENGINE_OUTPUT_TOKENS
        },
    }


def _require_model_covers(
    evidence: ModelEvidence,
    images: Sequence[EngineImage],
    database_rows: Mapping[str, Mapping[str, Any]],
    *,
    role: str,
) -> None:
    """Refuse a model that registered a different image set than the database.

    The I87 plan says the triangulator's registered-image set must equal its
    input's; this applies the same rule to every model the body produces, and
    binds each registration to the DATABASE identity the features were extracted
    under rather than to a name alone.
    """

    if not evidence.valid:
        raise _fail(f"{role} model is internally invalid")
    expected_ids = tuple(
        sorted(int(database_rows[image.name]["imageId"]) for image in images)
    )
    if evidence.registered_image_ids != expected_ids:
        raise _fail(f"{role} model registered a different image set than the database")
    for image in images:
        row = database_rows[image.name]
        image_id = int(row["imageId"])
        if evidence.image_names_by_id.get(image_id) != image.name:
            raise _fail(f"{role} model image id does not carry its database name")
        if evidence.camera_ids_by_image_id.get(image_id) != int(row["cameraId"]):
            raise _fail(f"{role} model image does not carry its database camera")


def _adapter_document(
    packet: ExtractedColmapPacket,
    *,
    pairs: Sequence[tuple[str, str]],
    verdict_reason: str,
) -> dict[str, Any]:
    """The engine-side adapter record, keyed on ENGINE identity.

    This is deliberately not ``refine_adapter.build_adapter_artifacts``'s
    document: that one is the standalone spike's, is keyed on HEIC paths, and
    reads a keyframe index this child never sees.  Source identity and engine
    identity stay separate exactly as the spike requires -- the source ledger's
    HEIC names appear as ``sourceImageName`` and never as an engine file name.
    """

    frames = packet.engine_request.frames
    ledger = packet.source_ledger
    return {
        "contract": ENGINE_ADAPTER_CONTRACT,
        "schemaVersion": ENGINE_ADAPTER_SCHEMA_VERSION,
        "targetColmapVersion": COLMAP_TARGET_VERSION,
        "runId": packet.manifest.run_id,
        "gpuIndex": packet.engine_request.gpu_index,
        "selectedEngine": PRIMARY_ENGINE,
        "rotationPriorRepresented": True,
        "overlapVerdict": verdict_reason,
        "pairCount": len(pairs),
        "frames": [
            {
                "ordinal": frame.ordinal,
                "engineImageName": frame.engine_image_name,
                "engineRelativePath": frame.engine_relative_path,
                "engineSha256": frame.engine_sha256,
                "engineSizeBytes": frame.engine_size_bytes,
                "sourceImageName": frame.source_image_name,
                "sourceArchiveKey": (
                    None if ledger is None else ledger.rows[index].source_archive_key
                ),
                "sourceMember": (
                    None if ledger is None else ledger.rows[index].source_member
                ),
                "sourceSha256": (
                    None if ledger is None else ledger.rows[index].source_sha256
                ),
                "frameTimestampSeconds": frame.frame_timestamp_s,
                "intrinsics": {
                    "model": "PINHOLE",
                    "fx": frame.intrinsics[0],
                    "fy": frame.intrinsics[1],
                    "cx": frame.intrinsics[2],
                    "cy": frame.intrinsics[3],
                    "width": frame.intrinsics[4],
                    "height": frame.intrinsics[5],
                },
                "camFromWorld": {
                    "rotation": [list(row) for row in frame.cam_from_world_rotation],
                    "translation": list(frame.cam_from_world_translation),
                },
                "rawCameraCenterMeters": list(frame.raw_camera_center_m),
            }
            for index, frame in enumerate(frames)
        ],
    }


def _command_evidence_document(
    commands: Sequence[ExecutedCommand],
    *,
    plan: Sequence[Any],
) -> dict[str, Any]:
    """The bounded command record; timestamped logs stay scratch-only.

    Only the canonical bounded tail crosses the publication boundary, which is
    the spike's rule.  ``run_inherited_colmap_command`` already caps that tail at
    :data:`refine_adapter.COLMAP_LOG_TAIL_BYTES`.
    """

    return {
        "contract": COMMAND_EVIDENCE_CONTRACT,
        "schemaVersion": COMMAND_EVIDENCE_SCHEMA_VERSION,
        "selectedEngine": PRIMARY_ENGINE,
        "logicalPlan": [
            {
                "operation": operation.operation,
                "options": [
                    {"name": name, "value": value} for name, value in operation.options
                ],
            }
            for operation in plan
        ],
        "commands": [
            {
                "phase": command.phase,
                "argv": list(command.argv),
                "returncode": command.returncode,
                "outputTail": command.output_tail,
            }
            for command in commands
        ],
    }


# ---------------------------------------------------------------------------
# The child entry point
# ---------------------------------------------------------------------------
@native_engine_entrypoint
def run_refine_colmap_native_engine(
    request: Mapping[str, Any],
    context: NativeChildContext,
) -> dict[str, Any]:
    """Run one primary Refine engine pass inside the isolated native child.

    The order is deliberate.  The toolchain is loaded FIRST, so a host without
    the installed manifest refuses with ``REFINE_TOOLCHAIN_UNQUALIFIED`` before
    a single packet byte is extracted or a single file is created.  There is no
    second attempt and no unqualified branch.
    """

    deadline = RefineDeadline(context.expires_at_monotonic_s)
    with ExitStack() as stack:
        toolchain = load_qualified_colmap_toolchain(
            context=context,
            deadline=deadline,
        )
        stack.callback(toolchain.close)
        packet = stack.enter_context(extract_colmap_packet(request, context))
        return run_primary_engine_body(
            packet,
            context=context,
            deadline=deadline,
            binding=PycolmapEngineBinding.load(),
            toolchain=toolchain,
        )


__all__ = (
    "CHILD_ENTRYPOINT",
    "COLMAP_PROCESS_LAUNCHED",
    "COMMAND_EVIDENCE_CONTRACT",
    "DISABLED_BACKEND_ENTRYPOINT",
    "ENGINE_ADAPTER_CONTRACT",
    "ENGINE_REPORT_CONTRACT",
    "ENGINE_REPORT_SCHEMA_VERSION",
    "EVIDENCE_ARTIFACT_ROLES",
    "PRODUCTION_ENABLEMENT",
    "PYCOLMAP_BINDING_EXECUTED",
    "REFINE_ENGINE_BODY_QUALIFIED",
    "ColmapEngineBinding",
    "ExecutedCommand",
    "PycolmapEngineBinding",
    "TwoViewGeometryRow",
    "run_primary_engine_body",
    "run_refine_colmap_native_engine",
    "write_sparse_model_archive",
)
