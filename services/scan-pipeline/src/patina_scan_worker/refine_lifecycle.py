"""Item 7: the composed Refine lifecycle, on local scratch, behind a named CLI.

WHAT THIS MODULE IS.  Every landed Refine packet -- the raster adapter (I93), the
owner-scoped acquirer and descriptor transport (I94), the evidence builder (I95),
packet extraction and command supervision (I96), the workspace lease (item 1),
the pinned toolchain (item 3), the seven-descriptor output handoff (item 5) and
the parent's alignment recomputation (item 6) -- landed disabled and uncomposed.
This module is the one place that wires them together, under ONE carried
lease-aware deadline, and it is deliberately reachable only from its own
``main``.

WHAT IT IS NOT.  It is not a stage.  ``config.DEFAULT_STAGES`` is unchanged,
``stages.get_handler('scan_pipeline.refine')`` is still ``None``, nothing in
``stages/`` imports this file, and this file claims no queue task, opens no
business database connection and reaches no Supabase Storage endpoint.  The
publisher seam takes a :class:`~patina_scan_worker.storage.StorageClient`; the
CLI supplies :class:`LocalScratchStorageSink`, whose only I/O is
``open``/``write`` beneath a caller-named scratch directory.

THE ANCHOR THIS ADDS, which is the substantive increment over item 6.
``refine_model_alignment`` says, in its own words, that all three archives it
reads are child outputs, that the parent holds the ground truth the seed poses
must equal -- ``request.frames`` -- and that supplying that anchor is item 7's
job.  :func:`anchor_seed_snapshot_to_request` is that anchor: it compares the
camera centres and orientations parsed out of ``seed-model-v1.tar`` against the
poses the PARENT put into the packet, pose by pose, by name.  Only after that
comparison passes is any archive treated as describing the scan that was
submitted rather than merely as being self-consistent.

WHAT REMAINS UNANCHORED even so, stated here rather than in a report:

  * The reprojection, loop and observation-count numbers in
    :class:`~patina_scan_worker.refine_adapter.RefinementEvidence` are computed
    by the child from the child's own database and models.  The parent binds
    every artifact identity in that evidence to a digest it computed itself over
    the frozen descriptor (:func:`_require_parent_hashed_artifacts`), so the
    evidence cannot claim to have been read from bytes the parent never saw.
    That is provenance, not recomputation: the parent does not re-measure a
    single reprojection residual and could not without the whole database.
  * The P1 solve certificate is external evidence about a DIFFERENT quantity
    (tape-measured anchor distances), and :func:`compare_against_p1_certificate`
    reports every row's comparability explicitly rather than differencing
    numbers that do not share a definition.
  * Trajectory shape change stays ``certification_role='diagnostic-only'``.  It
    is carried into the report and is never an accuracy claim.

UNCHANGED EVIDENCE IS A FAILURE.  Three separate clauses now carry that rule,
because the first two are about the child's NUMBERS and neither of them looks at
the poses actually published:

  * ``refine_runner`` calls ``evaluate_refinement_evidence``, which returns
    ``REFINE_NO_MEASURABLE_IMPROVEMENT`` when the best relative improvement is
    below
    :data:`~patina_scan_worker.refine_adapter.MIN_REFINEMENT_RELATIVE_IMPROVEMENT`;
  * :func:`_require_evidence_moved` refuses a report whose before and after
    scalars are bit-identical, which is the signature of one snapshot measured
    twice rather than of a run that improved by exactly nothing;
  * :func:`require_refined_poses_moved` refuses the POSES.  Until it existed the
    rule was documentation: substituting the seed snapshot for the aligned one
    at the publish seam produced an identity refinement -- no refinement at all
    -- and left the entire suite green.  It compares what is about to be
    published against ``request.frames``, both of them parent-held, at the same
    tolerance :func:`anchor_seed_snapshot_to_request` uses to call two poses
    identical.

WHICH ARCHIVE GETS PUBLISHED is now proved rather than intended.
:class:`NativeEngineInvocation` refuses at construction unless the snapshot it
carries hashes to the ``aligned_pose_digest_sha256`` the parent computed while
verifying the alignment, so the model published and the model verified cannot
drift apart.  That check belongs HERE and not in ``refine_model_alignment``:
item 6 is handed three archives and returns before anything is published, so it
can neither see the substitution nor measure against ``request.frames``, which
it has never been given.  What it CAN see -- that a model refined nothing in the
gauge-invariant sense -- it does not refuse: three identical models and an
identity proposal satisfy all seventeen of its clauses.  Its ``fit_rmse_m`` is
bounded above and has no floor, and giving it one needs a fixture whose engine
models bundle adjustment rather than a pure similarity.  Recorded in
:func:`require_refined_poses_moved`, not fixed here.

THE PACKET IS CHUNKED, and it has to be.  The subject scan's 100 keyframes are
uniformly 1440x1920, so one archive of them is 0.77 GiB against a 128 MiB
per-pinned-file ceiling the frozen child enforces itself -- 6.2x over, refused
before a pixel was read.  :func:`plan_packet_chunks` packs members under that
ceiling: 7 chunks and 8 pinned files for 100 frames, 25 and 26 at the 400-frame
contract maximum, inside 64 files and 4 GiB either way.

ONE DEADLINE, AND THE LEASE GOVERNS IT.  ``RefineDeadline.start`` applied its
240 s stage budget as an unconditional ``min``, so every composed run was capped
at four minutes however long a lease it claimed, and a 100-frame reconstruction
cannot finish in four.  The budget is now a parameter defaulting to the same
240 s for every existing caller, and :func:`lease_deadline` passes the lease
itself, so the only term that binds is the lease less the completion reserve.

THE FRAME BAND.  ``COLMAP_PACKET_MIN_ENGINE_IMAGES``/``MAX`` (3..400) is the
contract this module honours.  The 200-400 operational pilot band remains
unqualified (``PILOT_200_400_FRAME_RANGE_QUALIFIED`` is ``False``) and nothing
here special-cases any particular count, including the 100 frames of the subject
scan.

THE CHILD BODY NOW EXISTS, and :data:`DEFAULT_CHILD_ENTRYPOINT` names it.  Until
it did, the named child was the frozen disabled backend and a host run refused
with ``REFINE_BACKEND_DISABLED`` before COLMAP was reached at all; that entry
point is still named, as :data:`DISABLED_CHILD_ENTRYPOINT`, and still refuses.
The body is ``refine_colmap_engine_body:run_refine_colmap_native_engine``.

WHAT ONLY A REAL RUN CAN ESTABLISH, unchanged in substance by that.  A host run
still fails closed today -- on ``REFINE_TOOLCHAIN_UNQUALIFIED``, because the
toolchain manifest is not installed on any host in this repository and the body
has no unqualified branch.  Everything upstream and downstream of the child call
is real code exercised end to end here against a recorded engine, and the body
itself is exercised the same way in ``test_refine_colmap_engine_body``; but no
COLMAP process has ever run, no PyCOLMAP binding call has ever executed, and no
archive this repository has parsed came out of COLMAP.  Those three facts are
what the box run exists to change, and nothing in a green suite substitutes for
them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import stat
import sys
import time
from collections.abc import Iterator, Mapping, Sequence
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Protocol

from .keys import OwnershipError, assert_owner_prefix
from .refine_adapter import (
    COLMAP_TARGET_VERSION,
    AdapterError,
    ColmapPose,
    NormalizedFrame,
    RefineDeadline,
    RefinementEvidence,
    Sim3,
)
from .refine_colmap_backend import (
    COLMAP_PACKET_MAX_ENGINE_IMAGES,
    COLMAP_PACKET_MIN_ENGINE_IMAGES,
    ENGINE_REQUEST_CONTRACT,
    ENGINE_REQUEST_SCHEMA_VERSION,
    PACKET_CONTRACT,
    PACKET_SCHEMA_VERSION,
)
from .refine_colmap_toolchain import (
    QUALIFIED_COLMAP_PREFIX,
    TOOLCHAIN_MANIFEST_RELATIVE_PATH,
)
from .refine_materializer import (
    MaterializedRefineFrame,
    RefineMaterialization,
    RefineMaterializationLimits,
    RefineMaterializationRequest,
    RefineMaterializer,
    RefineSourceArtifact,
)
from .refine_model_alignment import (
    ParentAlignmentVerification,
    ProposedAlignment,
    SparseModelSnapshot,
    canonical_pose_digest,
    read_sparse_model_snapshot,
    verify_child_alignment_proposal,
)
from .refine_packet_extractor import (
    ADAPTER_LEDGER_CONTRACT,
    ADAPTER_LEDGER_SCHEMA_VERSION,
    SOURCE_LEDGER_CONTRACT,
    SOURCE_LEDGER_SCHEMA_VERSION,
)
from .refine_native_process import (
    NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
    NATIVE_CHILD_MAX_PINNED_FILES,
    NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES,
    NATIVE_ENGINE_OUTPUT_TOKENS,
    NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS,
    NativeEngineOutput,
    NativeEngineOutputs,
    NativePinnedFile,
    run_native_engine_child,
)
from .refine_publisher import RefinePublicationReceipt, RefinePublisher
from .refine_runner import (
    PRIMARY_ENGINE,
    InputArtifact,
    NamedRefinedPose,
    PreparedRefineRunRequest,
    RefineEngineCandidate,
    RefineEngineOutputReference,
    RefineEngineTelemetry,
    RefineFallbackPolicy,
    RefineFileArtifact,
    RefineFrameInput,
    RefineRunRequest,
    RefineRunResult,
    RefineRunner,
)
from .storage import StorageClient

# ---------------------------------------------------------------------------
# Posture
# ---------------------------------------------------------------------------
#: Composed, on local scratch, behind a named CLI.  Not a stage, not enabled.
PRODUCTION_ENABLEMENT = "composed-local-scratch-only"

#: Qualification is evidence plus a ruling.  Composition is neither, so this
#: stays ``False`` no matter how green the suite below is.
REFINE_LIFECYCLE_QUALIFIED = False

#: The single fact that keeps this module out of production dispatch.  It is a
#: statement about ``stages/``, and ``test_refine_lifecycle`` proves it by
#: reading the real registry rather than by reading this constant.
REFINE_LIFECYCLE_STAGE_REGISTERED = False

#: The child entry point a real run executes.  It is now the composed engine
#: body (``refine_colmap_engine_body``), which runs the I87 primary plan through
#: the qualified toolchain.
#:
#: IT IS A STRING, NOT AN IMPORT, and deliberately so.  The parent must not
#: import the child body: the body is what the spawned child resolves by name,
#: it reaches for a PyCOLMAP wheel that exists only on the GPU box, and pulling
#: it into this module's import graph would put a module that re-materializes
#: the carried deadline onto the parent's composed path.
#: ``test_the_lifecycle_and_the_engine_body_agree_on_the_entrypoint`` in
#: ``test_refine_colmap_engine_body`` proves the two strings are the same and
#: that this one resolves to the decorated callable.
DEFAULT_CHILD_ENTRYPOINT = (
    "patina_scan_worker.refine_colmap_engine_body:run_refine_colmap_native_engine"
)

#: The entry point the composition named BEFORE the body existed: the frozen
#: disabled backend, which refuses with ``REFINE_BACKEND_DISABLED``.  Kept named
#: because it must keep refusing -- it is the fail-closed floor under the body,
#: and ``refine_colmap_backend.py`` is byte-frozen.
DISABLED_CHILD_ENTRYPOINT = (
    "patina_scan_worker.refine_colmap_backend:run_refine_colmap_native"
)

#: Where the owner installs the toolchain manifest.  Absent today; the preflight
#: below turns its absence into one diagnostic instead of a fallback.
QUALIFIED_TOOLCHAIN_MANIFEST_PATH = (
    f"{QUALIFIED_COLMAP_PREFIX}/{TOOLCHAIN_MANIFEST_RELATIVE_PATH}"
)

LIFECYCLE_CONTRACT = "patina-refine-lifecycle-report-v1"
LIFECYCLE_SCHEMA_VERSION = 1
ENGINE_REPORT_CONTRACT = "patina-refine-colmap-engine-report-v1"
ENGINE_REPORT_SCHEMA_VERSION = 1

LIFECYCLE_INVALID_CODE = "REFINE_LIFECYCLE_INVALID"
LIFECYCLE_UNANCHORED_CODE = "REFINE_SEED_UNANCHORED"
LIFECYCLE_TOOLCHAIN_MISSING_CODE = "REFINE_TOOLCHAIN_UNQUALIFIED"
#: The run published the poses it was given.  See :func:`require_refined_poses_moved`.
LIFECYCLE_UNCHANGED_CODE = "REFINE_UNCHANGED_EVIDENCE"
#: The snapshot about to be published is not the one the parent verified.
LIFECYCLE_UNVERIFIED_PUBLICATION_CODE = "REFINE_PUBLISHED_MODEL_UNVERIFIED"

# ---------------------------------------------------------------------------
# The anchor tolerances
# ---------------------------------------------------------------------------
#: How far a seed camera centre parsed out of ``seed-model-v1.tar`` may sit from
#: the centre the PARENT put into the packet, in metres.
#:
#: DERIVATION, not a guess.  The parent writes the pose into the packet as
#: canonical JSON with full float64 repr, the child reads that JSON and writes
#: the same double into ``images.bin``, and the parent derives the centre back as
#: ``-R^T t``.  The only loss is the two matrix-vector products, which for a
#: room-scale translation (order 10 m) cost a few ULPs -- order 1e-14 m.  1e-6 m
#: is eight decades above that and still one micrometre, far below anything the
#: reconstruction could mean.  It is NOT a measurement against a real COLMAP
#: writer: no archive this repository has ever parsed came out of COLMAP.
SEED_ANCHOR_MAX_CENTER_DRIFT_M = 1.0e-6

#: The orientation counterpart, in radians, on the same reasoning.  A rotation
#: round-tripped through a unit quaternion and back loses a few ULPs; 1e-6 rad is
#: 0.2 arcseconds.
SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD = 1.0e-6

# ---------------------------------------------------------------------------
# The unchanged-evidence floor
# ---------------------------------------------------------------------------
#: How far the poses the parent is ABOUT TO PUBLISH must sit from the poses the
#: parent SUBMITTED before the run counts as having refined anything, in metres.
#:
#: THE THRESHOLD IS NOT A NEW NUMBER, and that is the entire justification.  It
#: is :data:`SEED_ANCHOR_MAX_CENTER_DRIFT_M` -- the tolerance within which this
#: module already declares two poses to be THE SAME POSE.  The anchor says: a
#: seed centre within 1e-6 m of the submitted centre IS the submitted centre,
#: unmoved.  The floor says the contrapositive about the same two quantities
#: measured by the same helper: a PUBLISHED centre within 1e-6 m of the
#: submitted centre is also the submitted centre, and publishing it is
#: publishing the input.  Choosing any other number would make this module call
#: one displacement "identical" in :func:`anchor_seed_snapshot_to_request` and
#: "changed" in :func:`require_refined_poses_moved`, which is incoherent.
#: ``test_the_movement_floor_is_the_anchor_tolerance_itself`` is what makes an
#: edit to either constant contradict this note rather than silently outdate it.
#:
#: WHY THE ANCHOR TOLERANCE IS ITSELF FAR BELOW ANY REAL REFINEMENT, so that the
#: floor cannot refuse a genuine run.  REASONING, not a measurement -- no archive
#: this repository has parsed came out of COLMAP.  The keyframes are 1440x1920;
#: a camera a metre from structure resolves roughly 0.7 mm per pixel, so a
#: 1e-6 m camera displacement is about 1.4e-3 pixels.  Bundle adjustment does not
#: converge to a change that small, and
#: ``MIN_REFINEMENT_RELATIVE_IMPROVEMENT`` could not be met by one.  The floor
#: therefore sits between float64 round-trip noise (order 1e-14 m, derived above)
#: and the smallest displacement any real reconstruction could produce.
REFINED_POSE_MIN_CENTER_MOVEMENT_M = SEED_ANCHOR_MAX_CENTER_DRIFT_M

#: The orientation counterpart, in radians, on exactly the same argument: it is
#: :data:`SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD`, the angle within which this module
#: already declares two orientations to be the same orientation.
REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD = SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD

#: Re-check the carried deadline every this many items in the parent's own
#: per-frame loops.  Extracted rather than inlined so the STRIDE is falsifiable.
DEADLINE_CHECK_INTERVAL = 32

# ---------------------------------------------------------------------------
# The one deadline
# ---------------------------------------------------------------------------
def lease_deadline(
    lease_seconds: float,
    *,
    now_monotonic_s: float | None = None,
) -> RefineDeadline:
    """Build the SINGLE carried deadline this lifecycle threads everywhere.

    ``--lease-seconds`` is the claimed lease, and it GOVERNS.  The engine budget
    passed to :meth:`RefineDeadline.start` is the whole lease, so the only term
    that can bind is ``lease - refine_adapter.LEASE_COMPLETION_RESERVE_S`` -- the reserve that
    keeps the completion path (publication, receipt, cleanup) inside the lease.

    WHAT THIS FIXES.  ``RefineDeadline.start``'s default budget is 240 s, and it
    was applied as an unconditional ``min``, so every composed run was capped at
    four minutes however long a lease it claimed.  A 100-frame COLMAP
    reconstruction does not finish in four minutes, so the lifecycle could only
    ever have timed out.  The cap is now a default the caller replaces, not a
    ceiling the caller cannot see.

    There is exactly ONE call to this function in the module, in :func:`main`,
    and no other code path in the composed lifecycle constructs a deadline;
    ``test_no_composed_module_acquires_a_second_deadline`` reads the source of
    every module on the path and proves it.
    """

    if (
        isinstance(lease_seconds, bool)
        or not isinstance(lease_seconds, (int, float))
        or not math.isfinite(lease_seconds)
    ):
        raise _fail("lifecycle lease seconds must be a finite number")
    now = time.monotonic() if now_monotonic_s is None else now_monotonic_s
    return RefineDeadline.start(
        lease_expires_at_monotonic_s=now + float(lease_seconds),
        now_monotonic_s=now,
        engine_budget_s=float(lease_seconds),
    )


# ---------------------------------------------------------------------------
# The native boundary's ceilings, re-exported so the packet builder honours the
# SAME numbers the frozen child enforces rather than a second copy of them.
# ---------------------------------------------------------------------------
PACKET_CHUNK_MAX_BYTES = NATIVE_CHILD_MAX_PINNED_FILE_BYTES
PACKET_MAX_PINNED_FILES = NATIVE_CHILD_MAX_PINNED_FILES
PACKET_MAX_AGGREGATE_BYTES = NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_ENGINE_NAME_RE = re.compile(r"^frame_[0-9]{6}\.ppm$")
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_TAR_BLOCK = 512
_MAX_ENGINE_REPORT_METRICS = 32
_COPY_CHUNK_BYTES = 1 << 20


def _fail(message: str, code: str = LIFECYCLE_INVALID_CODE) -> AdapterError:
    return AdapterError(message, code)


def _checkpoint(deadline: RefineDeadline, index: int = 0) -> None:
    if index % DEADLINE_CHECK_INTERVAL == 0:
        deadline.remaining_seconds()


# ---------------------------------------------------------------------------
# The P1 solve certificate for scan 95266be1 -- external, and not this run's
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class P1SolveCertificate:
    """One published P1 solve certificate, transcribed, never recomputed here.

    These are the numbers the P1 stage published for a scan.  They are carried
    so a Refine run can be reported ALONGSIDE them.  Nothing in this module
    recomputes them and nothing differences them against a Refine quantity
    without first saying whether the two share a definition.
    """

    scan_id: str
    sim3_scale: float
    anchor_rms_m: float
    measured_anchor_count: int
    anchor_tolerance_fraction: float
    short_anchors_flagged: int


#: The P1 certificate for the subject scan, transcribed from the P1 record:
#: scale 0.9828, RMS 133.6 mm, 24 measured anchors at +-11%, all 3 short anchors
#: flagged.  Transcription, not measurement: this module never read the P1 run.
P1_CERTIFICATE_95266BE1 = P1SolveCertificate(
    scan_id="95266be1",
    sim3_scale=0.9828,
    anchor_rms_m=0.1336,
    measured_anchor_count=24,
    anchor_tolerance_fraction=0.11,
    short_anchors_flagged=3,
)


@dataclass(frozen=True)
class ComparisonRow:
    """One quantity, both sides of it, and whether they may be differenced."""

    quantity: str
    p1_value: float | int | None
    refine_value: float | int | None
    comparable: bool
    note: str


def compare_against_p1_certificate(
    result: RefineRunResult,
    certificate: P1SolveCertificate,
) -> tuple[ComparisonRow, ...]:
    """Lay the P1 certificate beside a Refine result, row by row.

    The comparability column is the whole point.  Only ONE row is comparable,
    and it is comparable as a BAND rather than as an equality; every other row
    exists so that a reader cannot mistake a coincidence for corroboration.
    """

    if type(result) is not RefineRunResult:
        raise _fail("P1 comparison requires an exact RefineRunResult")
    if type(certificate) is not P1SolveCertificate:
        raise _fail("P1 comparison requires an exact P1SolveCertificate")
    evidence_before = result.evidence_verdict.registration_coverage_before
    evidence_after = result.evidence_verdict.registration_coverage_after
    return (
        ComparisonRow(
            quantity="sim3_scale",
            p1_value=certificate.sim3_scale,
            refine_value=result.alignment.scale,
            comparable=True,
            note=(
                "COMPARABLE AS A BAND, NOT AN EQUALITY. Both are the uniform "
                "scale of a similarity whose SOURCE is the same raw ARKit "
                "trajectory, so they are the same kind of number and a Refine "
                "scale far from the P1 scale means the reconstruction moved the "
                "metric gauge. They are NOT the same transform: P1 maps ARKit "
                "onto tape-measured anchors, Refine maps ARKit onto the "
                "bundle-adjusted COLMAP model. Differencing them is not "
                "meaningful; noticing an order-of-magnitude divergence is."
            ),
        ),
        ComparisonRow(
            quantity="anchor_rms_m",
            p1_value=certificate.anchor_rms_m,
            # Deliberately ``None``: a Refine run that measured no tape anchors
            # has no counterpart here, and inventing one from a different
            # quantity is exactly the mistake this table exists to prevent.
            refine_value=None,
            comparable=False,
            note=(
                "NOT COMPARABLE. P1's RMS is a residual against physical tape "
                "measurements. This run measured no tape anchors: "
                "external_error_m_before/after are None and "
                "absolute_accuracy_certified is False. Supplying anchors as "
                "external evidence would make a Refine counterpart exist; "
                "nothing here fabricates one."
            ),
        ),
        ComparisonRow(
            quantity="measured_anchor_count",
            p1_value=certificate.measured_anchor_count,
            refine_value=None,
            comparable=False,
            note=(
                "NOT COMPARABLE. Refine has no anchor concept; the nearest "
                "Refine count is registered images, which counts something else."
            ),
        ),
        ComparisonRow(
            quantity="short_anchors_flagged",
            p1_value=certificate.short_anchors_flagged,
            refine_value=None,
            comparable=False,
            note=(
                "NOT COMPARABLE. A short-anchor flag is a P1 tape-measurement "
                "quality signal with no Refine counterpart."
            ),
        ),
        ComparisonRow(
            quantity="reprojection_rmse_px_before_after",
            p1_value=None,
            refine_value=None,
            comparable=False,
            note=(
                "REFINE-INTERNAL, ABSENT FROM P1. Reported in the run manifest "
                f"as {result.evidence_verdict.reason}; the before/after pair is "
                "evaluated on one fixed track set and is the load-bearing "
                "refinement evidence."
            ),
        ),
        ComparisonRow(
            quantity="registration_coverage_before_after",
            p1_value=None,
            refine_value=None,
            comparable=False,
            note=(
                "REFINE-INTERNAL, ABSENT FROM P1. Coverage moved "
                f"{evidence_before} -> {evidence_after}."
            ),
        ),
        ComparisonRow(
            quantity="trajectory_shape_change_pct",
            p1_value=None,
            refine_value=result.trajectory_shape_change.trajectory_shape_change_pct,
            comparable=False,
            note=(
                "DIAGNOSTIC ONLY, and not an accuracy figure on either side. "
                "certification_role is "
                f"{result.trajectory_shape_change.certification_role!r}. It is a "
                "similarity-invariant description of how far the trajectory "
                "moved, which says nothing about whether it moved the right way."
            ),
        ),
    )


# ---------------------------------------------------------------------------
# The qualified-toolchain preflight
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ToolchainPreflight:
    """Whether the owner-installed toolchain manifest is present and readable."""

    manifest_path: str
    present: bool
    diagnostic: str


def preflight_qualified_toolchain(
    *,
    manifest_path: str = QUALIFIED_TOOLCHAIN_MANIFEST_PATH,
) -> ToolchainPreflight:
    """Report on the pinned manifest without opening any fallback door.

    This runs in the PARENT, before a child exists, purely so the operator gets
    a sentence instead of a stack trace from inside a spawned process.  It is not
    the check that matters: the child calls
    ``load_qualified_colmap_toolchain``, which re-reads this file by descriptor
    from the pinned prefix and refuses on any drift.  Passing here buys nothing
    and is not treated as buying anything.
    """

    if type(manifest_path) is not str or not manifest_path.startswith("/"):
        raise _fail("toolchain manifest path must be absolute")
    try:
        metadata = os.stat(manifest_path)
    except OSError as exc:
        return ToolchainPreflight(
            manifest_path=manifest_path,
            present=False,
            diagnostic=(
                f"the qualified COLMAP toolchain manifest is not readable at "
                f"{manifest_path} ({exc.strerror or type(exc).__name__}). Refine "
                f"has no unqualified path: the owner installs COLMAP "
                f"{COLMAP_TARGET_VERSION} at {QUALIFIED_COLMAP_PREFIX} together "
                f"with this manifest, and until then every run refuses with "
                f"{LIFECYCLE_TOOLCHAIN_MISSING_CODE}."
            ),
        )
    if not stat.S_ISREG(metadata.st_mode):
        return ToolchainPreflight(
            manifest_path=manifest_path,
            present=False,
            diagnostic=(
                f"the qualified COLMAP toolchain manifest at {manifest_path} is "
                f"not a regular file; Refine refuses with "
                f"{LIFECYCLE_TOOLCHAIN_MISSING_CODE} rather than reading it."
            ),
        )
    return ToolchainPreflight(
        manifest_path=manifest_path,
        present=True,
        diagnostic=(
            f"a toolchain manifest exists at {manifest_path}; the child still "
            f"re-verifies it by descriptor against the pinned prefix and this "
            f"preflight grants it nothing."
        ),
    )


def require_qualified_toolchain(
    *,
    manifest_path: str = QUALIFIED_TOOLCHAIN_MANIFEST_PATH,
) -> ToolchainPreflight:
    """Fail closed, with the preflight's own sentence, when the manifest is gone."""

    preflight = preflight_qualified_toolchain(manifest_path=manifest_path)
    if not preflight.present:
        raise _fail(preflight.diagnostic, LIFECYCLE_TOOLCHAIN_MISSING_CODE)
    return preflight


# ---------------------------------------------------------------------------
# The anchor: the child's seed model against the parent's own request frames
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SeedAnchorVerification:
    """The parent's comparison of a child seed archive to its own inputs."""

    correspondences: int
    max_center_drift_m: float
    max_rotation_drift_rad: float


def _rotation_from_pose(pose: ColmapPose) -> tuple[tuple[float, float, float], ...]:
    return tuple(tuple(float(value) for value in row) for row in pose.rotation)


def _transpose3(matrix: Sequence[Sequence[float]]) -> tuple[tuple[float, ...], ...]:
    return tuple(tuple(matrix[row][column] for row in range(3)) for column in range(3))


def _matmul3(
    left: Sequence[Sequence[float]],
    right: Sequence[Sequence[float]],
) -> tuple[tuple[float, ...], ...]:
    return tuple(
        tuple(
            sum(left[row][inner] * right[inner][column] for inner in range(3))
            for column in range(3)
        )
        for row in range(3)
    )


def _matvec3(
    matrix: Sequence[Sequence[float]],
    vector: Sequence[float],
) -> tuple[float, float, float]:
    return tuple(  # type: ignore[return-value]
        sum(matrix[row][column] * vector[column] for column in range(3))
        for row in range(3)
    )


def _geodesic_angle_rad(
    left: Sequence[Sequence[float]],
    right: Sequence[Sequence[float]],
) -> float:
    """Angle of ``left @ right^T``, clamped before ``acos`` so noise cannot NaN."""

    product = _matmul3(left, _transpose3(right))
    trace = product[0][0] + product[1][1] + product[2][2]
    cosine = (trace - 1.0) / 2.0
    return math.acos(max(-1.0, min(1.0, cosine)))


def _quaternion_to_rotation(
    quaternion: Sequence[float],
) -> tuple[tuple[float, float, float], ...]:
    w, x, y, z = (float(value) for value in quaternion)
    return (
        (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
        (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
        (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
    )


def anchor_seed_snapshot_to_request(
    seed: SparseModelSnapshot,
    frames: Sequence[MaterializedRefineFrame] | Sequence[RefineFrameInput],
    *,
    deadline: RefineDeadline,
    max_center_drift_m: float = SEED_ANCHOR_MAX_CENTER_DRIFT_M,
    max_rotation_drift_rad: float = SEED_ANCHOR_MAX_ROTATION_DRIFT_RAD,
) -> SeedAnchorVerification:
    """Compare a child seed archive against the poses the parent submitted.

    This is the anchor ``refine_model_alignment`` names and declines to supply.
    Item 6's clauses 6 and 7 compare one child archive against another child
    archive; this compares a child archive against ``request.frames``, which the
    parent built from the device's own keyframe index and never handed to the
    child except as the packet it also hashed.

    The clauses, each raising a DISTINCT message so that no clause can be deleted
    without a specific test going red:

      1. the snapshot is an exact :class:`SparseModelSnapshot`;
      2. the frame sequence is non-empty and inside the packet's engine-image
         band;
      3. the snapshot's image names are exactly the frames' engine names;
      4. no seed camera centre is further than ``max_center_drift_m`` from the
         parent's own;
      5. no seed orientation is further than ``max_rotation_drift_rad`` from the
         parent's own.

    WHAT THIS DOES NOT PROVE.  It proves the child did not move, drop, rename or
    re-order the poses it was given.  It says nothing about the triangulated or
    adjusted models beyond what item 6 already decides, and nothing at all about
    whether the device's poses were right in the first place.
    """

    if type(seed) is not SparseModelSnapshot:
        raise _fail("seed anchoring requires an exact SparseModelSnapshot")
    if type(deadline) is not RefineDeadline:
        raise _fail("seed anchoring requires the carried refine deadline")
    for label, value in (
        ("centre", max_center_drift_m),
        ("rotation", max_rotation_drift_rad),
    ):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
            or float(value) <= 0
        ):
            raise _fail(f"seed anchoring {label} tolerance must be finite positive")
    deadline.remaining_seconds()

    separation = _separation_from_submitted_frames(
        seed,
        frames,
        deadline=deadline,
        subject="seed anchoring",
        snapshot_label="seed snapshot",
        code=LIFECYCLE_UNANCHORED_CODE,
    )
    if separation.max_center_m > float(max_center_drift_m):
        raise _fail(
            "seed snapshot camera centres drifted from the submitted poses",
            LIFECYCLE_UNANCHORED_CODE,
        )
    if separation.max_rotation_rad > float(max_rotation_drift_rad):
        raise _fail(
            "seed snapshot orientations drifted from the submitted poses",
            LIFECYCLE_UNANCHORED_CODE,
        )
    deadline.remaining_seconds()
    return SeedAnchorVerification(
        correspondences=separation.correspondences,
        max_center_drift_m=separation.max_center_m,
        max_rotation_drift_rad=separation.max_rotation_rad,
    )


@dataclass(frozen=True)
class _FrameSeparation:
    """Worst per-pose gap between a parsed snapshot and the submitted frames."""

    correspondences: int
    max_center_m: float
    max_rotation_rad: float


def _separation_from_submitted_frames(
    snapshot: SparseModelSnapshot,
    frames: Sequence[MaterializedRefineFrame] | Sequence[RefineFrameInput],
    *,
    deadline: RefineDeadline,
    subject: str,
    snapshot_label: str,
    code: str,
) -> _FrameSeparation:
    """Measure a parsed snapshot against ``request.frames``, pose by pose, by name.

    Extracted so that the ANCHOR and the UNCHANGED-EVIDENCE FLOOR measure the
    identical quantity against the identical ground truth and can only ever
    disagree about which side of the tolerance is acceptable.  That is the whole
    argument for the floor's threshold: see
    :data:`REFINED_POSE_MIN_CENTER_MOVEMENT_M`.
    """

    ordered = tuple(frames)
    if not (
        COLMAP_PACKET_MIN_ENGINE_IMAGES
        <= len(ordered)
        <= COLMAP_PACKET_MAX_ENGINE_IMAGES
    ):
        raise _fail(
            f"{subject} needs a frame count inside the reviewed packet band",
            code,
        )
    expected: dict[str, NormalizedFrame] = {}
    for frame in ordered:
        engine_name = frame.engine_name
        if engine_name in expected:
            raise _fail(
                f"{subject} received a duplicate engine image name",
                code,
            )
        expected[engine_name] = frame.frame
    if snapshot.names() != tuple(sorted(expected)):
        raise _fail(
            f"{snapshot_label} image names disagree with the submitted frames",
            code,
        )

    worst_center = 0.0
    worst_rotation = 0.0
    for index, pose in enumerate(snapshot.poses):
        _checkpoint(deadline, index)
        submitted = expected[pose.name].colmap_pose
        submitted_rotation = _rotation_from_pose(submitted)
        submitted_center = tuple(
            -value
            for value in _matvec3(
                _transpose3(submitted_rotation),
                tuple(float(value) for value in submitted.translation),
            )
        )
        drift = math.sqrt(
            sum(
                (pose.camera_center_m[axis] - submitted_center[axis]) ** 2
                for axis in range(3)
            )
        )
        worst_center = max(worst_center, drift)
        angle = _geodesic_angle_rad(
            _quaternion_to_rotation(pose.qvec),
            submitted_rotation,
        )
        worst_rotation = max(worst_rotation, angle)
    return _FrameSeparation(
        correspondences=len(snapshot.poses),
        max_center_m=worst_center,
        max_rotation_rad=worst_rotation,
    )


@dataclass(frozen=True)
class RefinedPoseMovement:
    """How far the poses ABOUT TO BE PUBLISHED sit from the ones submitted."""

    correspondences: int
    max_center_movement_m: float
    max_rotation_movement_rad: float


def require_refined_poses_moved(
    published: SparseModelSnapshot,
    frames: Sequence[MaterializedRefineFrame] | Sequence[RefineFrameInput],
    *,
    deadline: RefineDeadline,
    min_center_movement_m: float = REFINED_POSE_MIN_CENTER_MOVEMENT_M,
    min_rotation_movement_rad: float = REFINED_POSE_MIN_ROTATION_MOVEMENT_RAD,
) -> RefinedPoseMovement:
    """Refuse a publication whose poses are the ones the parent submitted.

    "UNCHANGED EVIDENCE IS A FAILURE" is the program's rule, and until this
    function existed it was documentation.  The composed lifecycle would happily
    publish the SEED model as the refined result -- an identity refinement, no
    refinement at all -- and every test stayed green.

    WHAT IS COMPARED, and why it is comparable at all.  Both sides are held by
    the PARENT: ``published`` is the snapshot the parent parsed out of the
    archive it is about to turn into refined poses, and ``frames`` is
    ``request.frames``, the parent's own copy of the device poses it put into the
    packet.  Neither side is a number the child computed.  This is the same pair
    :func:`anchor_seed_snapshot_to_request` compares, measured by the same
    helper, which is what makes the threshold argument below hold.

    WHAT THIS DOES NOT BUY, stated plainly because the gap is real.  A child that
    returns the seed poses transported by a rigid motion or a similarity moves
    every camera and therefore PASSES here, while having refined nothing: the
    cameras did not move RELATIVE TO EACH OTHER.  The gauge-invariant quantity
    that would catch it is the alignment fit residual item 6 already computes
    (``ParentAlignmentVerification.fit_rmse_m``), which today is bounded above
    and has no floor.  A floor cannot be added against this suite's evidence,
    because the recorded engine's aligned model is the seed under a PURE
    similarity and so carries exactly zero shape change; giving it a real one
    means modelling bundle adjustment in the child, which is the child-side
    engine body and is not this change.  Recorded rather than fixed.
    """

    if type(published) is not SparseModelSnapshot:
        raise _fail("refinement movement requires an exact SparseModelSnapshot")
    if type(deadline) is not RefineDeadline:
        raise _fail("refinement movement requires the carried refine deadline")
    for label, value in (
        ("centre", min_center_movement_m),
        ("rotation", min_rotation_movement_rad),
    ):
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
            or float(value) <= 0
        ):
            raise _fail(f"refinement movement {label} floor must be finite positive")
    deadline.remaining_seconds()

    separation = _separation_from_submitted_frames(
        published,
        frames,
        deadline=deadline,
        subject="refinement movement",
        snapshot_label="published snapshot",
        code=LIFECYCLE_UNCHANGED_CODE,
    )
    if (
        separation.max_center_m <= float(min_center_movement_m)
        and separation.max_rotation_rad <= float(min_rotation_movement_rad)
    ):
        raise _fail(
            "refined poses are the submitted poses; the run published an "
            "identity refinement rather than a refinement",
            LIFECYCLE_UNCHANGED_CODE,
        )
    deadline.remaining_seconds()
    return RefinedPoseMovement(
        correspondences=separation.correspondences,
        max_center_movement_m=separation.max_center_m,
        max_rotation_movement_rad=separation.max_rotation_rad,
    )


# ---------------------------------------------------------------------------
# The COLMAP input packet the parent builds
# ---------------------------------------------------------------------------
def _canonical_json_bytes(value: object) -> bytes:
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


def _ustar_header(name: str, size: int) -> bytes:
    if len(name.encode("ascii")) > 100:
        raise _fail("packet member name does not fit a canonical USTAR header")
    header = bytearray(_TAR_BLOCK)
    encoded = name.encode("ascii")
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


@dataclass(frozen=True)
class BuiltColmapPacket:
    """The files the parent pins down to the child, plus its own request.

    ``chunk_paths`` is a TUPLE because one archive cannot carry the subject
    scan: see :func:`plan_packet_chunks` for the arithmetic.
    """

    manifest_path: Path
    chunk_paths: tuple[Path, ...]
    manifest_sha256: str
    chunk_sha256s: tuple[str, ...]
    run_id: str
    engine_request_sha256: str
    child_request: Mapping[str, Any]

    @property
    def pinned_file_count(self) -> int:
        """The manifest plus every chunk -- what the native boundary counts."""

        return 1 + len(self.chunk_paths)


def ustar_member_bytes(payload_bytes: int) -> int:
    """Bytes one USTAR member occupies: a 512 B header plus padded payload."""

    if (
        isinstance(payload_bytes, bool)
        or type(payload_bytes) is not int
        or payload_bytes < 0
    ):
        raise _fail("a USTAR member needs a non-negative integer payload size")
    return _TAR_BLOCK + ((payload_bytes + _TAR_BLOCK - 1) // _TAR_BLOCK) * _TAR_BLOCK


@dataclass(frozen=True)
class PacketChunkPlan:
    """Which members go in which chunk, and what that will cost, before writing.

    Separated from the writer so the arithmetic is checkable without
    materialising three gigabytes: ``test_the_hundred_frame_packet_fits_the_native
    _ceilings`` and its 400-frame sibling call this with the subject scan's real
    per-frame byte count and assert the resulting shape.
    """

    groups: tuple[tuple[int, ...], ...]
    chunk_sizes: tuple[int, ...]
    total_chunk_bytes: int

    @property
    def pinned_file_count(self) -> int:
        return 1 + len(self.groups)


def plan_packet_chunks(
    payload_sizes: Sequence[int],
    *,
    chunk_max_bytes: int = PACKET_CHUNK_MAX_BYTES,
) -> PacketChunkPlan:
    """Pack members into as few chunks as the per-file ceiling allows.

    WHY THIS EXISTS AT ALL.  The packet used to be ONE archive.  The native
    boundary's ceilings are 64 unique pinned files, 128 MiB per file and 4 GiB
    aggregate (``NATIVE_CHILD_MAX_PINNED_FILE_BYTES`` and friends), and the
    frozen child enforces every one of them -- ``COLMAP packet archive chunk
    exceeds 128 MiB`` is its own message.  The subject scan's 100 keyframes are
    uniformly 1440x1920, so each engine raster is a P6 file of
    ``17 + 1440*1920*3 = 8_294_417`` bytes and each USTAR member costs
    ``512 + 8_294_912 = 8_295_424`` bytes.  One archive of them is 829_549_568
    bytes -- 0.77 GiB, or 6.2x the 128 MiB per-file ceiling -- so the child would
    have refused every run before reading a pixel.

    THE PACKING, and what it yields.  A chunk's budget is the ceiling less the
    1024-byte end-of-archive terminator every archive carries, i.e. 134_216_704
    bytes, which holds 16 whole frames (16 x 8_295_424 = 132_726_784, and a
    seventeenth would need 141_022_208).  The engine request rides in the first
    chunk and fits in the 1_489_920 bytes left over there.  So 100 frames pack
    into 7 chunks and 8 pinned files, and the contract maximum of 400 frames
    packs into 25 chunks and 26 pinned files -- inside 64 either way.  These
    numbers are asserted literally in the suite rather than recomputed from this
    docstring, so a change to the packing contradicts a test.

    A member too large for an empty chunk is REFUSED here rather than silently
    split: splitting a member across archives is not a thing USTAR does, and the
    raster size that would cause it is a question for the owner, not for this
    function to paper over.
    """

    if (
        isinstance(chunk_max_bytes, bool)
        or type(chunk_max_bytes) is not int
        or chunk_max_bytes <= 0
    ):
        raise _fail("packet chunk ceiling must be a positive integer")
    if chunk_max_bytes > PACKET_CHUNK_MAX_BYTES:
        raise _fail("packet chunk ceiling may be tightened but never raised")
    sizes = tuple(payload_sizes)
    if not sizes:
        raise _fail("packet planning needs at least one member")
    groups: list[tuple[int, ...]] = []
    chunk_sizes: list[int] = []
    current: list[int] = []
    used = _TAR_BLOCK * 2
    for index, size in enumerate(sizes):
        cost = ustar_member_bytes(size)
        if _TAR_BLOCK * 2 + cost > chunk_max_bytes:
            raise _fail(
                "a single packet member is larger than one whole archive chunk"
            )
        if current and used + cost > chunk_max_bytes:
            groups.append(tuple(current))
            chunk_sizes.append(used)
            current = []
            used = _TAR_BLOCK * 2
        current.append(index)
        used += cost
    groups.append(tuple(current))
    chunk_sizes.append(used)
    if 1 + len(groups) > PACKET_MAX_PINNED_FILES:
        raise _fail("packet needs more pinned files than the native boundary allows")
    total = sum(chunk_sizes)
    if total > PACKET_MAX_AGGREGATE_BYTES:
        raise _fail("packet exceeds the native aggregate byte ceiling")
    return PacketChunkPlan(
        groups=tuple(groups),
        chunk_sizes=tuple(chunk_sizes),
        total_chunk_bytes=total,
    )


def build_colmap_packet(
    materialization: RefineMaterialization,
    *,
    destination: Path,
    gpu_index: str,
    run_id: str,
    deadline: RefineDeadline,
    chunk_max_bytes: int = PACKET_CHUNK_MAX_BYTES,
) -> BuiltColmapPacket:
    """Assemble one immutable engine-request + engine-image packet on scratch.

    Every byte written here comes from the materialization's descriptor-pinned
    ledger via ``open_verified_file``, never from re-opening a display path, so
    the packet's members carry the digests the materializer already proved.
    """

    if type(materialization) is not RefineMaterialization:
        raise _fail("packet building requires an exact RefineMaterialization")
    if type(deadline) is not RefineDeadline:
        raise _fail("packet building requires the carried refine deadline")
    if type(gpu_index) is not str or re.fullmatch(r"0|[1-9][0-9]*", gpu_index) is None:
        raise _fail("packet gpu index must be a canonical non-negative integer string")
    if type(run_id) is not str or _SHA256_RE.fullmatch(run_id) is None:
        raise _fail("packet run id must be a lowercase sha256")
    if not isinstance(destination, Path) or not destination.is_absolute():
        raise _fail("packet destination must be an absolute path")
    frames = materialization.frames
    if not (
        COLMAP_PACKET_MIN_ENGINE_IMAGES
        <= len(frames)
        <= COLMAP_PACKET_MAX_ENGINE_IMAGES
    ):
        raise _fail("packet engine image count is outside the reviewed 3-400 band")
    deadline.remaining_seconds()

    frame_rows: list[dict[str, Any]] = []
    for index, frame in enumerate(frames):
        _checkpoint(deadline, index)
        if _ENGINE_NAME_RE.fullmatch(frame.engine_name) is None:
            raise _fail("packet engine image name is not the canonical frame form")
        pose = frame.frame.colmap_pose
        frame_rows.append(
            {
                "ordinal": frame.frame.ordinal,
                "sourceImageName": frame.source_member.rsplit("/", 1)[-1],
                "frameTimestampSeconds": float(frame.frame.frame_timestamp_s),
                "engineImageName": frame.engine_name,
                "engineRelativePath": f"images/{frame.engine_name}",
                "engineSha256": frame.engine_sha256,
                "engineSizeBytes": frame.engine_size_bytes,
                "intrinsics": {
                    "fx": frame.frame.intrinsics.fx,
                    "fy": frame.frame.intrinsics.fy,
                    "cx": frame.frame.intrinsics.cx,
                    "cy": frame.frame.intrinsics.cy,
                    "width": frame.frame.intrinsics.image_width,
                    "height": frame.frame.intrinsics.image_height,
                },
                "camFromWorld": {
                    "rotation": [list(row) for row in pose.rotation],
                    "translation": list(pose.translation),
                },
                "rawCameraCenterMeters": list(frame.frame.camera_center_m),
            }
        )
    engine_payload = _canonical_json_bytes(
        {
            "schemaVersion": ENGINE_REQUEST_SCHEMA_VERSION,
            "contract": ENGINE_REQUEST_CONTRACT,
            "targetColmapVersion": COLMAP_TARGET_VERSION,
            "gpuIndex": gpu_index,
            "frames": frame_rows,
        }
    )

    # BOTH LEDGERS ARE EMITTED, and they are not optional in practice.  The
    # packet contract makes ``source-ledger``/``adapter-ledger`` optional
    # members, but ``refine_evidence_builder`` REQUIRES the fields they carry --
    # every frame's pre-raster archive key, member, digest and size, plus the
    # raster adapter's identity -- and nothing else in the packet has them.  A
    # packet without them cannot produce evidence, so the child refuses one;
    # emitting them here is what makes the composed run possible at all.
    materializer_ids = {frame.materializer_id for frame in frames}
    if len(materializer_ids) != 1:
        raise _fail("packet frames disagree on their raster materializer identity")
    source_payload = _canonical_json_bytes(
        {
            "schemaVersion": SOURCE_LEDGER_SCHEMA_VERSION,
            "contract": SOURCE_LEDGER_CONTRACT,
            "runId": run_id,
            "frames": [
                {
                    "ordinal": index,
                    "sourceArchiveKey": frame.source_archive_key,
                    "sourceMember": frame.source_member,
                    "sourceImageName": frame.source_member.rsplit("/", 1)[-1],
                    "sourceSha256": frame.source_sha256,
                    "sourceSizeBytes": frame.source_size_bytes,
                }
                for index, frame in enumerate(frames)
            ],
        }
    )
    adapter_payload = _canonical_json_bytes(
        {
            "schemaVersion": ADAPTER_LEDGER_SCHEMA_VERSION,
            "contract": ADAPTER_LEDGER_CONTRACT,
            "runId": run_id,
            "materializerId": next(iter(materializer_ids)),
        }
    )

    # ONE ordered member list, and its order is not free.  The manifest requires
    # members sorted by ``(chunkToken, archiveMember)``, and the writer appends
    # in this list's order, so the two agree only if each chunk's slice is
    # already sorted by name.  ``adapter-ledger-v1.json`` therefore leads (``a``
    # < ``e`` < ``i``) and ``source-ledger-v1.json`` trails (``s`` > ``i``);
    # putting either anywhere else makes the frozen child refuse the manifest
    # with "members must use canonical chunk/member order".
    member_names = (
        ["adapter-ledger-v1.json", "engine-request-v1.json"]
        + [f"images/{frame.engine_name}" for frame in frames]
        + ["source-ledger-v1.json"]
    )
    member_sizes = (
        [len(adapter_payload), len(engine_payload)]
        + [frame.engine_size_bytes for frame in frames]
        + [len(source_payload)]
    )
    member_digests = (
        [
            hashlib.sha256(adapter_payload).hexdigest(),
            hashlib.sha256(engine_payload).hexdigest(),
        ]
        + [frame.engine_sha256 for frame in frames]
        + [hashlib.sha256(source_payload).hexdigest()]
    )
    member_roles = (
        ["adapter-ledger", "engine-request"]
        + ["engine-image"] * len(frames)
        + ["source-ledger"]
    )
    #: Which member indices carry bytes this function holds rather than a frame
    #: descriptor.  The writer consults this instead of testing for index 0,
    #: which was only ever correct while the request was the first member.
    inline_payloads = {
        0: adapter_payload,
        1: engine_payload,
        len(member_names) - 1: source_payload,
    }
    plan = plan_packet_chunks(member_sizes, chunk_max_bytes=chunk_max_bytes)

    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    members: list[dict[str, Any]] = []
    chunk_paths: list[Path] = []
    chunk_digests: list[str] = []
    chunk_rows: list[dict[str, Any]] = []
    for chunk_index, group in enumerate(plan.groups):
        _checkpoint(deadline, chunk_index)
        token = f"packet.chunk.{chunk_index:03d}"
        chunk_path = destination / f"{token}.tar"
        chunk_descriptor = os.open(
            chunk_path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
        try:
            with os.fdopen(chunk_descriptor, "wb", closefd=True) as chunk:
                chunk_descriptor = -1
                for member_index in group:
                    _checkpoint(deadline, member_index)
                    name = member_names[member_index]
                    size = member_sizes[member_index]
                    chunk.write(_ustar_header(name, size))
                    inline = inline_payloads.get(member_index)
                    if inline is not None:
                        chunk.write(inline)
                    else:
                        frame = frames[member_index - 2]
                        with materialization.open_verified_file(
                            frame.engine_relative_path,
                            deadline=deadline,
                        ) as source:
                            copy_exact(
                                source,
                                chunk,
                                size_bytes=size,
                                deadline=deadline,
                            )
                    pad = (-size) % _TAR_BLOCK
                    if pad:
                        chunk.write(b"\x00" * pad)
                    members.append(
                        {
                            "relativePath": name,
                            "chunkToken": token,
                            "archiveMember": name,
                            "sha256": member_digests[member_index],
                            "sizeBytes": size,
                            "role": member_roles[member_index],
                        }
                    )
                chunk.write(b"\x00" * (_TAR_BLOCK * 2))
        finally:
            if chunk_descriptor >= 0:  # pragma: no cover - fdopen failure only
                os.close(chunk_descriptor)

        # NO post-write size assertion here, deliberately.  Three were written
        # -- written-vs-planned, written-vs-ceiling, and a second aggregate --
        # and a mutation sweep showed all three deletable with ZERO red: none of
        # them can fire unless this writer disagrees with the planner directly
        # above it, which no input can arrange.  This codebase has removed such
        # a clause before ("a clause no input can reach is a clause no deletion
        # can redden") and the same reasoning applies here.  What replaces them
        # is real: ``test_the_planner_predicts_the_bytes_the_writer_actually_
        # writes`` compares ``plan.chunk_sizes`` against the sizes on disk at
        # several ceilings, and the FROZEN child independently refuses an
        # over-ceiling chunk with "COLMAP packet archive chunk exceeds 128 MiB",
        # which its own suite covers.
        written = chunk_path.stat().st_size
        chunk_paths.append(chunk_path)
        chunk_digests.append(_hash_path(chunk_path, deadline=deadline))
        chunk_rows.append(
            {
                "token": token,
                "sha256": chunk_digests[-1],
                "sizeBytes": written,
            }
        )

    manifest_payload = _canonical_json_bytes(
        {
            "schemaVersion": PACKET_SCHEMA_VERSION,
            "contract": PACKET_CONTRACT,
            "runId": run_id,
            "requestMember": "engine-request-v1.json",
            "chunks": chunk_rows,
            "members": members,
        }
    )
    manifest_path = destination / "packet-manifest-v1.json"
    manifest_path.write_bytes(manifest_payload)
    manifest_digest = hashlib.sha256(manifest_payload).hexdigest()
    return BuiltColmapPacket(
        manifest_path=manifest_path,
        chunk_paths=tuple(chunk_paths),
        manifest_sha256=manifest_digest,
        chunk_sha256s=tuple(chunk_digests),
        run_id=run_id,
        # Indexed off the ordered member list, not off ``members[0]``: the
        # latter is only the request while the planner happens to put that
        # member in chunk 000 first, which is a property of the packing rather
        # than a promise it makes.  Index 1 is the request because index 0 is
        # now the adapter ledger; the constant below is asserted against
        # ``member_names`` so the two cannot drift.
        engine_request_sha256=member_digests[member_names.index("engine-request-v1.json")],
        child_request={
            "schemaVersion": PACKET_SCHEMA_VERSION,
            "contract": PACKET_CONTRACT,
            "manifestToken": "packet.manifest",
            "manifestSha256": manifest_digest,
            "runId": run_id,
            "fallbackPolicy": "primary-only",
        },
    )


def copy_exact(source: Any, destination: Any, *, size_bytes: int, deadline: RefineDeadline) -> int:
    """Copy exactly ``size_bytes`` from ``source``, refusing a short source.

    Extracted from the packet writer rather than inlined for one reason: inlined,
    the short-source guard was unreachable through the packet door -- the
    materialization's ledger already proved every engine raster's size -- so no
    deletion of it could redden.  As a named function it is directly falsifiable,
    which matters because the alternative to the guard is not a wrong packet but
    a LOOP THAT NEVER ENDS: ``while written < size`` on a source returning ``b""``
    spins until the deadline is checked, and the deadline is only checked after
    the read.
    """

    if isinstance(size_bytes, bool) or type(size_bytes) is not int or size_bytes <= 0:
        raise _fail("exact copy needs a positive byte count")
    written = 0
    while written < size_bytes:
        deadline.remaining_seconds()
        block = source.read(min(_COPY_CHUNK_BYTES, size_bytes - written))
        if not block:
            raise _fail("packet engine image ended before its declared size")
        if written + len(block) > size_bytes:
            raise _fail("packet engine image ran past its declared size")
        destination.write(block)
        written += len(block)
    deadline.remaining_seconds()
    return written


def _hash_path(path: Path, *, deadline: RefineDeadline) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            deadline.remaining_seconds()
            block = handle.read(_COPY_CHUNK_BYTES)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


@contextmanager
def pinned_packet_files(
    packet: BuiltColmapPacket,
    *,
    deadline: RefineDeadline,
) -> Iterator[Mapping[str, NativePinnedFile]]:
    """Open the manifest and EVERY chunk read-only and yield them as pinned inputs.

    The descriptors are owned HERE and closed on every exit, including an
    exception, because ``run_native_engine_child`` borrows them and explicitly
    does not take ownership.

    The token set is ``(packet.manifest, packet.chunk.000, ...)``.  The frozen
    child recomputes ``sorted((manifest_token, *chunk_order))`` and refuses any
    ledger that does not match exactly, so the count here is not cosmetic: it is
    the same number :func:`plan_packet_chunks` had to keep under 64.
    """

    if type(packet) is not BuiltColmapPacket:
        raise _fail("pinning requires an exact BuiltColmapPacket")
    if len(packet.chunk_paths) != len(packet.chunk_sha256s):
        raise _fail("packet chunk paths and digests disagree in number")
    if packet.pinned_file_count > PACKET_MAX_PINNED_FILES:
        raise _fail("packet needs more pinned files than the native boundary allows")
    deadline.remaining_seconds()
    with ExitStack() as stack:
        pinned: dict[str, NativePinnedFile] = {}
        entries = [("packet.manifest", packet.manifest_path, packet.manifest_sha256)]
        for chunk_index, chunk_path in enumerate(packet.chunk_paths):
            entries.append(
                (
                    f"packet.chunk.{chunk_index:03d}",
                    chunk_path,
                    packet.chunk_sha256s[chunk_index],
                )
            )
        for token, path, digest in entries:
            _checkpoint(deadline, len(pinned))
            handle = stack.enter_context(path.open("rb"))
            metadata = os.fstat(handle.fileno())
            pinned[token] = NativePinnedFile(
                descriptor=handle.fileno(),
                sha256=digest,
                size_bytes=metadata.st_size,
            )
        deadline.remaining_seconds()
        yield pinned


# ---------------------------------------------------------------------------
# The child's report, parsed strictly by the parent
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ParsedEngineReport:
    """The child's bounded JSON claim, validated but never yet believed."""

    cli_version: str
    binding_version: str
    selected_engine: str
    evidence: RefinementEvidence
    proposal: ProposedAlignment
    telemetry: RefineEngineTelemetry
    artifact_digests: Mapping[str, str]


def _strict_str(document: Mapping[str, Any], key: str) -> str:
    value = document.get(key)
    if type(value) is not str or not value:
        raise _fail(f"engine report field {key} must be a non-empty string")
    return value


def _strict_sha256(document: Mapping[str, Any], key: str) -> str:
    value = _strict_str(document, key)
    if _SHA256_RE.fullmatch(value) is None:
        raise _fail(f"engine report field {key} must be a lowercase sha256")
    return value


def _strict_int(document: Mapping[str, Any], key: str, *, minimum: int = 0) -> int:
    value = document.get(key)
    if isinstance(value, bool) or type(value) is not int or value < minimum:
        raise _fail(f"engine report field {key} must be an integer >= {minimum}")
    return value


def _strict_float(document: Mapping[str, Any], key: str, *, minimum: float) -> float:
    value = document.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _fail(f"engine report field {key} must be a finite number")
    number = float(value)
    if not math.isfinite(number) or number < minimum:
        raise _fail(f"engine report field {key} must be a finite number >= {minimum}")
    return number


def _strict_mapping(document: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    value = document.get(key)
    if type(value) is not dict:
        raise _fail(f"engine report field {key} must be an object")
    return value


def _strict_vector3(document: Mapping[str, Any], key: str) -> tuple[float, ...]:
    value = document.get(key)
    if type(value) is not list or len(value) != 3:
        raise _fail(f"engine report field {key} must be a 3-vector")
    numbers = []
    for component in value:
        if isinstance(component, bool) or not isinstance(component, (int, float)):
            raise _fail(f"engine report field {key} must hold finite numbers")
        number = float(component)
        if not math.isfinite(number):
            raise _fail(f"engine report field {key} must hold finite numbers")
        numbers.append(number)
    return tuple(numbers)


def _strict_matrix3(document: Mapping[str, Any], key: str) -> tuple[tuple[float, ...], ...]:
    value = document.get(key)
    if type(value) is not list or len(value) != 3:
        raise _fail(f"engine report field {key} must be a 3x3 matrix")
    rows = []
    for row in value:
        if type(row) is not list or len(row) != 3:
            raise _fail(f"engine report field {key} must be a 3x3 matrix")
        parsed = []
        for component in row:
            if isinstance(component, bool) or not isinstance(component, (int, float)):
                raise _fail(f"engine report field {key} must hold finite numbers")
            number = float(component)
            if not math.isfinite(number):
                raise _fail(f"engine report field {key} must hold finite numbers")
            parsed.append(number)
        rows.append(tuple(parsed))
    return tuple(rows)


def parse_engine_report(document: object) -> ParsedEngineReport:
    """Validate the child's response shape before a single field is used.

    Everything the child sends is a claim.  This function only proves the claim
    is well-formed; :func:`_require_parent_hashed_artifacts` and
    :func:`verify_child_alignment_proposal` are what decide whether to believe
    any of it.
    """

    if type(document) is not dict:
        raise _fail("engine report must be a JSON object")
    if document.get("contract") != ENGINE_REPORT_CONTRACT:
        raise _fail("engine report carries the wrong contract")
    if document.get("schemaVersion") != ENGINE_REPORT_SCHEMA_VERSION:
        raise _fail("engine report carries the wrong schema version")

    evidence_document = _strict_mapping(document, "evidence")
    evidence = RefinementEvidence(
        input_images=_strict_int(evidence_document, "inputImages", minimum=1),
        registered_images_before=_strict_int(
            evidence_document, "registeredImagesBefore"
        ),
        registered_images_after=_strict_int(
            evidence_document, "registeredImagesAfter"
        ),
        common_observations=_strict_int(
            evidence_document, "commonObservations", minimum=1
        ),
        common_observation_set_sha256=_strict_sha256(
            evidence_document, "commonObservationSetSha256"
        ),
        reprojection_rmse_px_before=_strict_float(
            evidence_document, "reprojectionRmsePxBefore", minimum=0.0
        ),
        reprojection_rmse_px_after=_strict_float(
            evidence_document, "reprojectionRmsePxAfter", minimum=0.0
        ),
        verified_loop_edges=_strict_int(evidence_document, "verifiedLoopEdges"),
        verified_loop_set_sha256=_strict_sha256(
            evidence_document, "verifiedLoopSetSha256"
        ),
        loop_rotation_rmse_deg_before=_strict_float(
            evidence_document, "loopRotationRmseDegBefore", minimum=0.0
        ),
        loop_rotation_rmse_deg_after=_strict_float(
            evidence_document, "loopRotationRmseDegAfter", minimum=0.0
        ),
        loop_translation_direction_rmse_deg_before=_strict_float(
            evidence_document, "loopTranslationDirectionRmseDegBefore", minimum=0.0
        ),
        loop_translation_direction_rmse_deg_after=_strict_float(
            evidence_document, "loopTranslationDirectionRmseDegAfter", minimum=0.0
        ),
    )

    alignment_document = _strict_mapping(document, "alignment")
    proposal = ProposedAlignment(
        scale=_strict_float(alignment_document, "scale", minimum=0.0),
        rotation=_strict_matrix3(alignment_document, "rotation"),  # type: ignore[arg-type]
        translation=_strict_vector3(alignment_document, "translationMeters"),  # type: ignore[arg-type]
        raw_pose_digest_sha256=_strict_sha256(
            alignment_document, "rawPoseDigestSha256"
        ),
        aligned_pose_digest_sha256=_strict_sha256(
            alignment_document, "alignedPoseDigestSha256"
        ),
    )

    telemetry_document = _strict_mapping(document, "telemetry")
    metrics_document = _strict_mapping(telemetry_document, "metrics")
    if len(metrics_document) > _MAX_ENGINE_REPORT_METRICS:
        raise _fail("engine report telemetry carries too many metrics")
    metrics: list[tuple[str, bool | int | float | str]] = []
    for name in sorted(metrics_document):
        value = metrics_document[name]
        if type(value) not in (bool, int, float, str):
            raise _fail("engine report telemetry metric is not a JSON scalar")
        if isinstance(value, float) and not math.isfinite(value):
            raise _fail("engine report telemetry metric is not finite")
        metrics.append((name, value))
    telemetry = RefineEngineTelemetry(
        duration_ms=_strict_int(telemetry_document, "durationMs"),
        iterations=_strict_int(telemetry_document, "iterations"),
        vram_peak_mb=_strict_int(telemetry_document, "vramPeakMb"),
        command_count=_strict_int(telemetry_document, "commandCount"),
        metrics=tuple(metrics),
    )

    outputs_document = _strict_mapping(document, "outputs")
    if tuple(sorted(outputs_document)) != NATIVE_ENGINE_OUTPUT_TOKENS:
        raise _fail("engine report does not declare the closed output token set")
    digests: dict[str, str] = {}
    for token in NATIVE_ENGINE_OUTPUT_TOKENS:
        row = outputs_document[token]
        if type(row) is not dict:
            raise _fail("engine report output row must be an object")
        digests[token] = _strict_sha256(row, "sha256")

    selected_engine = _strict_str(document, "selectedEngine")
    if selected_engine != PRIMARY_ENGINE:
        # The composition runs one primary attempt.  A child announcing the
        # position-prior fallback would be announcing an engine path I90 never
        # qualified, and the runner's fallback policy would never have asked for
        # it, so the disagreement is refused here rather than published.
        raise _fail("engine report selected an engine this composition never runs")

    return ParsedEngineReport(
        cli_version=_strict_str(document, "cliVersion"),
        binding_version=_strict_str(document, "bindingVersion"),
        selected_engine=selected_engine,
        evidence=evidence,
        proposal=proposal,
        telemetry=telemetry,
        artifact_digests=dict(digests),
    )


def _require_parent_hashed_artifacts(
    report: ParsedEngineReport,
    outputs: Mapping[str, NativeEngineOutput],
) -> None:
    """Refuse a report whose artifact digests are not the PARENT's own numbers.

    ``NativeEngineOutput.sha256`` is the parent's measurement of its own private
    ``O_TMPFILE`` copy, read positionally out of the descriptor it is handing on.
    Binding the child's declared digests to those values is what stops a report
    from describing artifacts other than the ones about to be published.  It does
    not make the CONTENT of the evidence parent-computed; see the module
    docstring.
    """

    if tuple(sorted(outputs)) != NATIVE_ENGINE_OUTPUT_TOKENS:
        raise _fail("the native boundary did not return the closed output token set")
    for token in NATIVE_ENGINE_OUTPUT_TOKENS:
        if report.artifact_digests[token] != outputs[token].sha256:
            raise _fail(
                "engine report artifact digest disagrees with the parent's own hash"
            )


def _require_evidence_moved(evidence: RefinementEvidence) -> None:
    """Refuse a before/after pair that is bit-identical on every metric.

    ``evaluate_refinement_evidence`` already refuses an improvement below its
    floor, and that is the load-bearing check.  This one separates a different
    failure: every comparable metric identical to the last bit is the signature
    of the same snapshot being measured twice, which is a plumbing defect and
    deserves a plumbing diagnostic rather than
    ``REFINE_NO_MEASURABLE_IMPROVEMENT``.
    """

    identical = (
        evidence.reprojection_rmse_px_before == evidence.reprojection_rmse_px_after
        and evidence.loop_rotation_rmse_deg_before
        == evidence.loop_rotation_rmse_deg_after
        and evidence.loop_translation_direction_rmse_deg_before
        == evidence.loop_translation_direction_rmse_deg_after
        and evidence.registered_images_before == evidence.registered_images_after
    )
    if identical:
        raise _fail(
            "refinement evidence is bit-identical before and after; the run "
            "measured one snapshot twice rather than refining anything"
        )


# ---------------------------------------------------------------------------
# The runner seams, driven by one already-completed native invocation
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class NativeEngineInvocation:
    """One completed child call: its report and the parent-owned descriptors.

    ``aligned_snapshot`` is the PARENT's parse of ``aligned-sparse-model-v1.tar``,
    not a pose list the child sent: the refined poses the runner aligns and the
    publisher records therefore come from bytes the parent hashed and parsed for
    itself.  The seed and raw pre-BA snapshots are deliberately absent -- they
    were already consumed, by the anchor and by the alignment verification.

    WHICH ARCHIVE THIS IS, PROVED RATHER THAN INTENDED.  Nothing used to pin
    which of the three parsed snapshots arrived here.  Substituting the SEED
    snapshot for the aligned one published an identity refinement and left the
    whole suite green, because the alignment verification ran on a snapshot that
    then had no connection to the one being published.  ``__post_init__`` closes
    that seam: the verification carries ``aligned_pose_digest_sha256``, which the
    PARENT computed with :func:`canonical_pose_digest` over the aligned model it
    checked, and the snapshot carried here must hash to exactly that value.  Any
    other snapshot -- seed, raw pre-BA, or a third one built from thin air --
    hashes differently and is refused here, at construction, which is the line
    the substitution touches.
    """

    report: ParsedEngineReport
    outputs: Mapping[str, NativeEngineOutput]
    aligned_snapshot: SparseModelSnapshot
    alignment_verification: ParentAlignmentVerification

    def __post_init__(self) -> None:
        if type(self.aligned_snapshot) is not SparseModelSnapshot:
            raise _fail(
                "the published snapshot must be an exact SparseModelSnapshot",
                LIFECYCLE_UNVERIFIED_PUBLICATION_CODE,
            )
        if type(self.alignment_verification) is not ParentAlignmentVerification:
            raise _fail(
                "publishing requires the parent's own alignment verification",
                LIFECYCLE_UNVERIFIED_PUBLICATION_CODE,
            )
        if (
            canonical_pose_digest(self.aligned_snapshot)
            != self.alignment_verification.aligned_pose_digest_sha256
        ):
            raise _fail(
                "the snapshot about to be published is not the aligned model the "
                "parent verified",
                LIFECYCLE_UNVERIFIED_PUBLICATION_CODE,
            )


_TRANSPORT_CONTENT_TYPE = "application/octet-stream"
_SEMANTIC_MEDIA_TYPES: Mapping[str, str] = {
    "adapter-v2.json": "application/json",
    "aligned-sparse-model-v1.tar": "application/x-tar",
    "database-v1.db": "application/vnd.sqlite3",
    "engine-command-evidence-v1.json": "application/json",
    "pairs-v2.txt": "text/plain",
    "seed-model-v1.tar": "application/x-tar",
}


class ComposedRefineBackend:
    """A :class:`RefineExecutionBackend` over one already-completed child call.

    The engine has ALREADY run by the time the runner asks: the native boundary
    owns the process lifetime and the workspace lease, and neither can be nested
    inside the runner's call graph without giving the runner a second cleanup
    obligation it was never designed to carry.  So this seam replays the
    invocation the lifecycle performed, which is why ``run_fallback`` refuses:
    there is no second engine to fall back to, and a policy of
    ``PRIMARY_ONLY`` is what the lifecycle uses.
    """

    def __init__(self, invocation: NativeEngineInvocation) -> None:
        if type(invocation) is not NativeEngineInvocation:
            raise TypeError("invocation must be a NativeEngineInvocation")
        self._invocation = invocation

    def run_primary(
        self,
        request: PreparedRefineRunRequest,
        *,
        deadline: RefineDeadline,
    ) -> RefineEngineCandidate:
        deadline.remaining_seconds()
        invocation = self._invocation
        report = invocation.report
        refined: list[NamedRefinedPose] = []
        for index, pose in enumerate(invocation.aligned_snapshot.poses):
            _checkpoint(deadline, index)
            rotation = _quaternion_to_rotation(pose.qvec)
            refined.append(
                NamedRefinedPose(
                    engine_image_name=pose.name,
                    cam_from_world=ColmapPose(
                        rotation=rotation,  # type: ignore[arg-type]
                        translation=tuple(float(v) for v in pose.tvec),  # type: ignore[arg-type]
                        qvec=tuple(float(v) for v in pose.qvec),  # type: ignore[arg-type]
                    ),
                )
            )
        references = tuple(
            RefineEngineOutputReference(
                name=token,
                relative_path=f"engine/{token}",
                sha256=invocation.outputs[token].sha256,
                size_bytes=invocation.outputs[token].size_bytes,
                transport_content_type=_TRANSPORT_CONTENT_TYPE,
                semantic_media_type=_SEMANTIC_MEDIA_TYPES[token],
            )
            for token in NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS
        )
        deadline.remaining_seconds()
        return RefineEngineCandidate(
            cli_version=report.cli_version,
            binding_version=report.binding_version,
            refined_poses=tuple(refined),
            evidence=report.evidence,
            outputs=references,
            telemetry=report.telemetry,
        )

    def run_fallback(
        self,
        request: PreparedRefineRunRequest,
        *,
        deadline: RefineDeadline,
    ) -> RefineEngineCandidate:
        raise _fail(
            "the composed lifecycle runs one primary engine attempt and has no "
            "fallback to replay",
            "REFINE_FALLBACK_UNQUALIFIED",
        )


class ComposedArtifactBuilder:
    """A :class:`RefineArtifactBuilder` over the parent-owned frozen outputs.

    Every artifact is the descriptor item 5 handed back -- an anonymous private
    copy the parent made and hashed -- so nothing here re-opens a path and
    nothing here can publish bytes the parent did not measure.  The descriptors
    are BORROWED from the caller's :class:`NativeEngineOutputs` sink; this class
    never closes one.
    """

    def __init__(self, outputs: Mapping[str, NativeEngineOutput]) -> None:
        if tuple(sorted(outputs)) != NATIVE_ENGINE_OUTPUT_TOKENS:
            raise TypeError("artifact builder needs the closed output token set")
        self._outputs = dict(outputs)

    def build_engine_artifacts(
        self,
        *,
        request: PreparedRefineRunRequest,
        candidate: RefineEngineCandidate,
        selected_engine: str,
        alignment: Sim3,
        aligned_poses: Sequence[NamedRefinedPose],
        deadline: RefineDeadline,
    ) -> Sequence[RefineFileArtifact]:
        deadline.remaining_seconds()
        artifacts: list[RefineFileArtifact] = []
        for index, token in enumerate(NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS):
            _checkpoint(deadline, index)
            output = self._outputs[token]
            artifacts.append(
                RefineFileArtifact(
                    name=token,
                    descriptor=output.descriptor,
                    sha256=output.sha256,
                    size_bytes=output.size_bytes,
                    transport_content_type=_TRANSPORT_CONTENT_TYPE,
                    semantic_media_type=_SEMANTIC_MEDIA_TYPES[token],
                    display_path=f"engine/{token}",
                    identity=output.identity,
                )
            )
        deadline.remaining_seconds()
        return tuple(artifacts)


# ---------------------------------------------------------------------------
# Local scratch sinks.  Neither of these can reach a network.
# ---------------------------------------------------------------------------
class LocalScratchArtifactAcquirer:
    """A :class:`RefineArtifactAcquirer` that reads a local bundle directory.

    Owner scoping is repeated here exactly as the Storage acquirer repeats it,
    because the check is about the object key's shape and is worth keeping on
    both paths; what is NOT repeated is any authentication, because there is no
    remote party to authenticate to.
    """

    def __init__(self, bundle_root: Path) -> None:
        if not isinstance(bundle_root, Path) or not bundle_root.is_absolute():
            raise ValueError("bundle_root must be an absolute Path")
        resolved = bundle_root.resolve(strict=True)
        if not resolved.is_dir():
            raise ValueError("bundle_root must be a directory")
        self._root = resolved

    def acquire(
        self,
        *,
        source: RefineSourceArtifact,
        user_id: str,
        scan_id: str,
        destination: Any,
        deadline: RefineDeadline,
    ) -> None:
        # The SAME guard the Storage acquirer runs, not a local paraphrase of
        # it: segment[1] is the owner and segment[2] is the scan.  A local
        # directory has no RLS, so this is the only thing standing between a
        # mistyped key and another owner's bundle on the same scratch disk.
        try:
            assert_owner_prefix(source.object_key, user_id, scan_id)
        except OwnershipError as exc:
            raise _fail(f"local scratch object key is not owner scoped: {exc}") from exc
        relative = PurePosixPath(source.object_key)
        if relative.is_absolute() or any(
            part in ("", ".", "..") for part in relative.parts
        ):
            raise _fail("local scratch object key is not canonical")
        path = self._root / Path(*relative.parts)
        deadline.remaining_seconds()
        with path.open("rb") as handle:
            while True:
                deadline.remaining_seconds()
                block = handle.read(_COPY_CHUNK_BYTES)
                if not block:
                    break
                destination.write(block)
                deadline.remaining_seconds()


class LocalScratchStorageSink(StorageClient):
    """A create-only publish target under one caller-named scratch directory.

    It subclasses :class:`StorageClient` because :class:`RefinePublisher` type-
    checks its collaborator, and it deliberately does NOT call
    ``StorageClient.__init__``: there is no session, no settings and no service
    role key on this object, so no inherited method that needs one can run.  The
    only method the publisher calls is overridden below.
    """

    def __init__(self, root: Path) -> None:
        if not isinstance(root, Path) or not root.is_absolute():
            raise ValueError("root must be an absolute Path")
        resolved = root.resolve(strict=True)
        if not resolved.is_dir():
            raise ValueError("root must be a directory")
        self._root = resolved
        self.published: dict[str, tuple[str, int]] = {}

    @property
    def root(self) -> Path:
        return self._root

    def publish_immutable_descriptor(
        self,
        object_key: str,
        source_descriptor: int,
        content_type: str,
        *,
        expected_sha256: str,
        expected_size: int,
        user_id: str,
        scan_id: str,
        expected_identity: tuple[int, int] | None = None,
        deadline: RefineDeadline | None = None,
        reserve_seconds: float = 0,
    ) -> bool:
        if deadline is None:
            raise _fail("local scratch publication requires the carried deadline")
        deadline.remaining_seconds()
        try:
            assert_owner_prefix(object_key, user_id, scan_id)
        except OwnershipError as exc:
            raise _fail(
                f"local scratch publication key is not owner scoped: {exc}"
            ) from exc
        if any(part in ("", ".", "..") for part in object_key.split("/")):
            raise _fail("local scratch publication key is not canonical")
        if expected_identity is not None:
            metadata = os.fstat(source_descriptor)
            if (metadata.st_dev, metadata.st_ino) != expected_identity:
                raise _fail("local scratch publication descriptor changed identity")
        digest = hashlib.sha256()
        offset = 0
        while offset < expected_size:
            deadline.remaining_seconds()
            block = os.pread(
                source_descriptor,
                min(_COPY_CHUNK_BYTES, expected_size - offset),
                offset,
            )
            if not block:
                raise _fail("local scratch publication source ended early")
            digest.update(block)
            offset += len(block)
        if digest.hexdigest() != expected_sha256:
            raise _fail("local scratch publication digest mismatch")
        destination = self._root / Path(*object_key.split("/"))
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        existing = self.published.get(object_key)
        if existing is not None:
            if existing != (expected_sha256, expected_size):
                raise _fail("local scratch publication would overwrite divergent bytes")
            return False
        with destination.open("xb") as handle:
            offset = 0
            while offset < expected_size:
                deadline.remaining_seconds()
                block = os.pread(
                    source_descriptor,
                    min(_COPY_CHUNK_BYTES, expected_size - offset),
                    offset,
                )
                handle.write(block)
                offset += len(block)
        self.published[object_key] = (expected_sha256, expected_size)
        return True


# ---------------------------------------------------------------------------
# The composed lifecycle
# ---------------------------------------------------------------------------
class NativeEngineCall(Protocol):
    """The seam a recorded engine replaces in tests.

    Production is :func:`run_native_engine_child` with
    :data:`DEFAULT_CHILD_ENTRYPOINT`; a test supplies a recording.  The signature
    is the boundary's own, minus the entry point, so a fake cannot quietly widen
    it.
    """

    def __call__(
        self,
        request: Mapping[str, Any],
        *,
        deadline: RefineDeadline,
        pinned_files: Mapping[str, NativePinnedFile],
        workspace_parent_directory: str,
        outputs: NativeEngineOutputs,
    ) -> Any: ...


def production_native_engine_call(
    request: Mapping[str, Any],
    *,
    deadline: RefineDeadline,
    pinned_files: Mapping[str, NativePinnedFile],
    workspace_parent_directory: str,
    outputs: NativeEngineOutputs,
) -> Any:
    """Call the real boundary against the declared child entry point."""

    return run_native_engine_child(
        DEFAULT_CHILD_ENTRYPOINT,
        request,
        deadline=deadline,
        pinned_files=pinned_files,
        workspace_parent_directory=workspace_parent_directory,
        outputs=outputs,
    )


@dataclass(frozen=True)
class RefineLifecycleRequest:
    """One local-scratch lifecycle run."""

    user_id: str
    scan_id: str
    task_id: str
    lease_id: str
    room_file_id: str
    room_file_version: int
    scratch_root: Path
    manifest: RefineSourceArtifact
    keyframe_index: RefineSourceArtifact
    keyframe_summary: RefineSourceArtifact
    keyframes_archive: RefineSourceArtifact
    gpu_index: str = "0"


@dataclass(frozen=True)
class RefineLifecycleReport:
    """Everything one composed run decided, with its provenance attached."""

    schema_version: int
    contract: str
    production_enablement: str
    toolchain: ToolchainPreflight
    seed_anchor: SeedAnchorVerification
    refined_pose_movement: RefinedPoseMovement
    alignment_verification: Any
    result: RefineRunResult
    publication: RefinePublicationReceipt
    p1_comparison: tuple[ComparisonRow, ...]

    def to_document(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "contract": self.contract,
            "productionEnablement": self.production_enablement,
            "stageRegistered": REFINE_LIFECYCLE_STAGE_REGISTERED,
            "qualified": REFINE_LIFECYCLE_QUALIFIED,
            "toolchain": {
                "manifestPath": self.toolchain.manifest_path,
                "present": self.toolchain.present,
                "diagnostic": self.toolchain.diagnostic,
            },
            "seedAnchor": {
                "correspondences": self.seed_anchor.correspondences,
                "maxCenterDriftMeters": self.seed_anchor.max_center_drift_m,
                "maxRotationDriftRadians": self.seed_anchor.max_rotation_drift_rad,
            },
            "refinedPoseMovement": {
                "correspondences": self.refined_pose_movement.correspondences,
                "maxCenterMovementMeters": (
                    self.refined_pose_movement.max_center_movement_m
                ),
                "maxRotationMovementRadians": (
                    self.refined_pose_movement.max_rotation_movement_rad
                ),
            },
            "alignment": {
                "scale": self.alignment_verification.transform.scale,
                "fitRmseMeters": self.alignment_verification.fit_rmse_m,
                "correspondences": self.alignment_verification.correspondences,
            },
            "evidence": {
                "refinementEvidenced": self.result.evidence_verdict.refinement_evidenced,
                "absoluteAccuracyCertified": (
                    self.result.evidence_verdict.absolute_accuracy_certified
                ),
                "reason": self.result.evidence_verdict.reason,
            },
            "trajectoryShapeChange": {
                "certificationRole": (
                    self.result.trajectory_shape_change.certification_role
                ),
                "shapeChangePct": (
                    self.result.trajectory_shape_change.trajectory_shape_change_pct
                ),
            },
            "publication": {
                "manifestKey": self.publication.manifest.object_key,
                "createdKeys": list(self.publication.created_keys),
                "replayedKeys": list(self.publication.replayed_keys),
            },
            "p1Comparison": [
                {
                    "quantity": row.quantity,
                    "p1Value": row.p1_value,
                    "refineValue": row.refine_value,
                    "comparable": row.comparable,
                    "note": row.note,
                }
                for row in self.p1_comparison
            ],
        }


def run_refine_lifecycle(
    request: RefineLifecycleRequest,
    *,
    acquirer: Any,
    raster_materializer: Any,
    storage: StorageClient,
    deadline: RefineDeadline,
    native_engine_call: NativeEngineCall = production_native_engine_call,
    toolchain_manifest_path: str = QUALIFIED_TOOLCHAIN_MANIFEST_PATH,
    certificate: P1SolveCertificate = P1_CERTIFICATE_95266BE1,
    limits: RefineMaterializationLimits | None = None,
) -> RefineLifecycleReport:
    """Run materializer -> raster -> engine -> runner -> publisher, once.

    ONE deadline is created by the caller and carried the whole way down: into
    the materializer, into the packet build, into the native boundary (which
    re-derives the child's copy from it), into the parent's snapshot parses and
    alignment verification, into the runner, and into the publisher's reserve.
    No step creates a second clock.

    CLEANUP.  The materialization's private workspace and the packet scratch are
    removed on every outcome; the native boundary owns and purges its own lease,
    including after a SIGKILLed child; the output sink is closed by the ``with``
    below on every path, and the boundary itself closes it on any path that
    raises.
    """

    if type(request) is not RefineLifecycleRequest:
        raise _fail("lifecycle requires an exact RefineLifecycleRequest")
    if type(deadline) is not RefineDeadline:
        raise _fail("lifecycle requires the carried refine deadline")
    if not isinstance(storage, StorageClient):
        raise _fail("lifecycle publication requires a StorageClient")
    for label, value in (
        ("user id", request.user_id),
        ("scan id", request.scan_id),
        ("task id", request.task_id),
        ("lease id", request.lease_id),
        ("room file id", request.room_file_id),
    ):
        if type(value) is not str or _IDENTIFIER_RE.fullmatch(value) is None:
            raise _fail(f"lifecycle {label} is not a safe identifier")
    if not isinstance(request.scratch_root, Path) or not request.scratch_root.is_absolute():
        raise _fail("lifecycle scratch root must be an absolute path")

    toolchain = require_qualified_toolchain(manifest_path=toolchain_manifest_path)
    deadline.remaining_seconds()

    materializer = RefineMaterializer(
        acquirer=acquirer,
        raster_materializer=raster_materializer,
        limits=limits,
    )
    materialization = materializer.materialize(
        RefineMaterializationRequest(
            user_id=request.user_id,
            scan_id=request.scan_id,
            task_id=request.task_id,
            lease_id=request.lease_id,
            workspace_parent=request.scratch_root,
            manifest=request.manifest,
            keyframe_index=request.keyframe_index,
            keyframe_summary=request.keyframe_summary,
            keyframes_archive=request.keyframes_archive,
        ),
        deadline=deadline,
    )
    with materialization:
        run_id = hashlib.sha256(
            f"{request.user_id}/{request.scan_id}/{request.task_id}".encode()
        ).hexdigest()
        packet_root = request.scratch_root / f"packet-{request.task_id}"
        try:
            packet = build_colmap_packet(
                materialization,
                destination=packet_root,
                gpu_index=request.gpu_index,
                run_id=run_id,
                deadline=deadline,
            )
            invocation_outputs = NativeEngineOutputs(NATIVE_ENGINE_OUTPUT_TOKENS)
            with invocation_outputs:
                with pinned_packet_files(packet, deadline=deadline) as pinned:
                    raw_report = native_engine_call(
                        packet.child_request,
                        deadline=deadline,
                        pinned_files=pinned,
                        workspace_parent_directory=str(request.scratch_root),
                        outputs=invocation_outputs,
                    )
                deadline.remaining_seconds()
                report = parse_engine_report(raw_report)
                received = invocation_outputs.received
                _require_parent_hashed_artifacts(report, received)
                _require_evidence_moved(report.evidence)

                seed = read_sparse_model_snapshot(
                    received["seed-model-v1.tar"].descriptor,
                    label="seed",
                    deadline=deadline,
                )
                raw = read_sparse_model_snapshot(
                    received["raw-triangulated-model-snapshot-v1.tar"].descriptor,
                    label="raw pre-BA",
                    deadline=deadline,
                )
                aligned = read_sparse_model_snapshot(
                    received["aligned-sparse-model-v1.tar"].descriptor,
                    label="aligned",
                    deadline=deadline,
                )
                seed_anchor = anchor_seed_snapshot_to_request(
                    seed,
                    materialization.frames,
                    deadline=deadline,
                )
                alignment_verification = verify_child_alignment_proposal(
                    seed=seed,
                    raw_pre_ba=raw,
                    aligned=aligned,
                    proposal=report.proposal,
                    deadline=deadline,
                )
                # THE PUBLISH SEAM.  Both clauses guard this one line, and they
                # are independent: the first proves the snapshot below IS the
                # aligned model just verified, the second proves that model is
                # not simply the poses the parent submitted.  Neither implies
                # the other -- a third snapshot far from the frames defeats only
                # the first, and a genuinely identity-refining child defeats
                # only the second.
                movement = require_refined_poses_moved(
                    aligned,
                    materialization.frames,
                    deadline=deadline,
                )
                invocation = NativeEngineInvocation(
                    report=report,
                    outputs=received,
                    aligned_snapshot=aligned,
                    alignment_verification=alignment_verification,
                )
                with _borrowed_frame_descriptors(
                    materialization,
                    deadline=deadline,
                ) as frame_inputs:
                    runner = RefineRunner(
                        backend=ComposedRefineBackend(invocation),
                        artifact_builder=ComposedArtifactBuilder(received),
                        fallback_policy=RefineFallbackPolicy.PRIMARY_ONLY,
                    )
                    result = runner.run(
                        RefineRunRequest(
                            user_id=request.user_id,
                            scan_id=request.scan_id,
                            room_file_id=request.room_file_id,
                            room_file_version=request.room_file_version,
                            workspace_root=materialization.workspace_root,
                            frames=frame_inputs,
                            inputs=tuple(
                                InputArtifact(
                                    key=source.object_key,
                                    sha256=source.sha256,
                                    size_bytes=source.size_bytes,
                                )
                                for source in materialization.inputs
                            ),
                        ),
                        deadline=deadline,
                    )
                    publisher = RefinePublisher(
                        storage,
                        spool_root=request.scratch_root,
                        completion_reserve_seconds=0.0,
                    )
                    publication = publisher.publish(
                        result,
                        user_id=request.user_id,
                        scan_id=request.scan_id,
                        deadline=deadline,
                    )
        finally:
            _remove_tree(packet_root)

    return RefineLifecycleReport(
        schema_version=LIFECYCLE_SCHEMA_VERSION,
        contract=LIFECYCLE_CONTRACT,
        production_enablement=PRODUCTION_ENABLEMENT,
        toolchain=toolchain,
        seed_anchor=seed_anchor,
        refined_pose_movement=movement,
        alignment_verification=alignment_verification,
        result=result,
        publication=publication,
        p1_comparison=compare_against_p1_certificate(result, certificate),
    )


@contextmanager
def _borrowed_frame_descriptors(
    materialization: RefineMaterialization,
    *,
    deadline: RefineDeadline,
) -> Iterator[tuple[RefineFrameInput, ...]]:
    """Open both descriptors per frame through the pinned workspace, once.

    The runner and the publisher both read through THESE descriptors; nothing
    downstream re-opens a display path.  They are closed here on every path,
    which is why the runner call is nested inside rather than beside.
    """

    with ExitStack() as stack:
        frames: list[RefineFrameInput] = []
        for index, frame in enumerate(materialization.frames):
            _checkpoint(deadline, index)
            source = stack.enter_context(
                materialization.open_verified_file(
                    f"extracted/{frame.source_member}",
                    deadline=deadline,
                )
            )
            engine = stack.enter_context(
                materialization.open_verified_file(
                    frame.engine_relative_path,
                    deadline=deadline,
                )
            )
            frames.append(
                RefineFrameInput(
                    frame=frame.frame,
                    source_descriptor=source.fileno(),
                    relative_source_path=f"extracted/{frame.source_member}",
                    source_archive_key=frame.source_archive_key,
                    source_member=frame.source_member,
                    source_sha256=frame.source_sha256,
                    source_size_bytes=frame.source_size_bytes,
                    engine_name=frame.engine_name,
                    engine_descriptor=engine.fileno(),
                    engine_relative_path=frame.engine_relative_path,
                    engine_sha256=frame.engine_sha256,
                    engine_size_bytes=frame.engine_size_bytes,
                    materializer_id=frame.materializer_id,
                )
            )
        deadline.remaining_seconds()
        yield tuple(frames)


def _remove_tree(root: Path) -> Path | None:
    """Remove one scratch tree deepest-first; return what survived, if anything.

    A symlink is unlinked rather than descended into, so a link planted inside
    the packet scratch cannot make this delete something outside it.

    WHAT THIS DOES NOT DO, because it runs in a ``finally``: it does not raise.
    An exception here would replace whatever error sent control into the
    ``finally``, which is how a cleanup failure comes to be reported instead of
    the outage that caused it.  The return value is the honest alternative --
    ``None`` when the tree is gone, the surviving root when it is not -- and the
    caller may report it without discarding a primary error.  ``run_refine_
    lifecycle`` does not currently read it: on the composed path the packet
    scratch is a directory this process created 0700 and filled itself, so the
    only way for removal to fail is a host-level fault that the operator will
    also see in the exception that is propagating.
    """

    if not root.exists():
        return None
    for path in sorted(root.rglob("*"), key=lambda item: len(item.parts), reverse=True):
        try:
            if path.is_dir() and not path.is_symlink():
                path.rmdir()
            else:
                path.unlink()
        except OSError:
            pass
    try:
        root.rmdir()
    except OSError:
        return root
    return None


# ---------------------------------------------------------------------------
# The named, obviously non-production entry point
# ---------------------------------------------------------------------------
_BANNER = (
    "patina refine lifecycle -- LOCAL SCRATCH ONLY.\n"
    "This is not a stage. It claims no queue task, opens no business database\n"
    "connection, and publishes to a local directory, never to Supabase Storage.\n"
)


#: The lease the CLI claims by default, in seconds.  The engine gets this less
#: ``refine_adapter.LEASE_COMPLETION_RESERVE_S``, i.e. 3540 s of reconstruction
#: and 60 s of completion.  It is an hour rather than the old 900 s because the
#: 900 was never reachable: the four-minute cap bound first.  Whether an hour is
#: the right lease for a 100-frame reconstruction is a HOST question no run in
#: this repository has yet answered.
DEFAULT_LEASE_SECONDS = 3600.0


def build_argument_parser() -> argparse.ArgumentParser:
    """The CLI surface, extracted so its defaults are falsifiable."""

    parser = argparse.ArgumentParser(
        prog="python -m patina_scan_worker.refine_lifecycle",
        description=_BANNER,
    )
    parser.add_argument("--bundle-dir", required=True)
    parser.add_argument("--scratch-dir", required=True)
    parser.add_argument("--publish-dir", required=True)
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--scan-id", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--lease-id", required=True)
    parser.add_argument("--room-file-id", required=True)
    parser.add_argument("--room-file-version", type=int, default=1)
    parser.add_argument("--gpu-index", default="0")
    # The lease GOVERNS the one carried deadline; see :func:`lease_deadline`.
    parser.add_argument(
        "--lease-seconds", type=float, default=DEFAULT_LEASE_SECONDS
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run one local-scratch lifecycle from a local bundle directory.

    There is no console-script entry for this in ``pyproject.toml`` on purpose:
    the only way to reach it is ``python -m
    patina_scan_worker.refine_lifecycle``, typed by a person.
    """

    parser = build_argument_parser()
    arguments = parser.parse_args(argv)

    sys.stderr.write(_BANNER)
    preflight = preflight_qualified_toolchain()
    if not preflight.present:
        sys.stderr.write(preflight.diagnostic + "\n")
        return 2

    bundle = Path(arguments.bundle_dir).resolve()
    manifest_document = json.loads((bundle / "sources.json").read_text())
    sources = {
        kind: RefineSourceArtifact(
            object_key=row["objectKey"],
            sha256=row["sha256"],
            size_bytes=int(row["sizeBytes"]),
        )
        for kind, row in manifest_document.items()
    }

    from .field_raster_materializer import PackagedLibheifFieldRasterMaterializer

    deadline = lease_deadline(float(arguments.lease_seconds))
    report = run_refine_lifecycle(
        RefineLifecycleRequest(
            user_id=arguments.user_id,
            scan_id=arguments.scan_id,
            task_id=arguments.task_id,
            lease_id=arguments.lease_id,
            room_file_id=arguments.room_file_id,
            room_file_version=int(arguments.room_file_version),
            scratch_root=Path(arguments.scratch_dir).resolve(),
            manifest=sources["bundleManifest"],
            keyframe_index=sources["keyframeIndex"],
            keyframe_summary=sources["keyframeSummary"],
            keyframes_archive=sources["keyframesArchive"],
            gpu_index=arguments.gpu_index,
        ),
        acquirer=LocalScratchArtifactAcquirer(bundle),
        raster_materializer=PackagedLibheifFieldRasterMaterializer(),
        storage=LocalScratchStorageSink(Path(arguments.publish_dir).resolve()),
        deadline=deadline,
    )
    json.dump(report.to_document(), sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover - manual entry point
    raise SystemExit(main())
