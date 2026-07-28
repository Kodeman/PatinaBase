"""Parent-side recomputation of the Refine Sim(3) alignment and pose digests.

WHAT THIS MODULE IS FOR.  The native engine child (item 5) hands seven
descriptors back up: the six persistent engine artifacts plus a scratch raw
pre-bundle-adjustment model snapshot.  Item 5 proves those bytes are *frozen* --
a private ``O_TMPFILE`` copy the parent made and hashed itself -- but it
deliberately proves nothing about whether ``aligned-sparse-model-v1.tar`` is a
correct Sim(3) alignment.  Those bytes are a child PROPOSAL.  This module is the
parent's decision about whether the proposal is SELF-CONSISTENT.

THE SCOPE OF THAT DECISION, STATED NARROWLY, because an earlier draft of that
sentence claimed the whole of it.  All three archives this module reads are
CHILD OUTPUTS.  ``seed-model-v1.tar`` is a persistent engine artifact, and the
seed inside it is built by the child's own ``pycolmap.build_known_pose_seed``
operation; the raw pre-BA and aligned snapshots are the child's too.  So the
decision made here is whether the child's declared SCALARS -- the Sim(3) and the
two pose digests -- agree with the child's own BYTES, and whether those bytes are
consistent with each other as a similarity.  That is a real decision and it
refuses a great deal, but it is NOT an anchor to anything the parent holds
independently.  The parent DOES hold the ground truth the seed poses must equal:
``request.frames``, which it fed the child.  This module never takes it and never
compares.  Until something does, the "known-pose invariant" of clauses 6 and 7
compares one child archive against another child archive -- it shows the
triangulator agreed with the seed the child built, not that either preserved the
device's poses.  Supplying that anchor is item 7's job, and it is what
``NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT`` would have to mean.

THE ONE DESIGN CONSTRAINT THAT SHAPES EVERYTHING HERE: the parent's
recomputation may not depend on the child's toolchain.  A parent that re-ran the
same ``pycolmap`` build on the same in-memory reconstruction would be repeating,
not verifying, and it would also be ungatable -- ``pycolmap==4.0.2`` is a custom
CUDA wheel that exists only on the GPU box.  So this module

  * parses the COLMAP sparse-model binary format itself, from the archive bytes
    the parent will actually publish, and
  * solves the similarity transform itself with :func:`refine_adapter.
    estimate_sim3` -- a closed-form Horn absolute-orientation solve whose
    implementation uses nothing beyond ``math``.

Neither ``pycolmap`` nor ``numpy`` is imported, directly or transitively.  That
is not an aesthetic preference: ``numpy`` is itself part of the ``refine`` extra
the child runs on, so a ``numpy``-based recomputation would share a dependency
with the thing it is checking.  Plain ``math`` shares nothing.

WHAT THE PARENT ACTUALLY VERIFIES, and what it cannot.  The parent holds three
models: the seed known-pose model, the raw pre-BA triangulated snapshot, and the
aligned post-BA model.  It does NOT hold the pre-alignment refined model -- the
child-to-parent token universe is closed at seven and there is no token for it.
That has a consequence worth stating flatly, because an earlier draft of this
design got it wrong:

    The parent CANNOT verify the child's alignment Sim(3) by reconstructing the
    pre-alignment model from the child's own claim.  Horn's solve is equivariant
    under a similarity applied to its source points, so re-solving
    ``Horn(T_child^-1(aligned) -> seed)`` returns ``U . T_child`` for ANY
    invertible ``T_child``, and comparing that back to ``T_child`` is vacuous:
    every invertible claim passes.

So the proposal is defined -- as a CONTRACT on item 7's child, not as an
assumption about one -- to be the similarity that carries the RAW PRE-BA camera
centres onto the ALIGNED camera centres.  Both of those point sets live in
archives the parent parses for itself, so the parent can re-solve exactly that
problem from bytes it read, and disagreement is a refusal.  See
:func:`verify_child_alignment_proposal` for the full clause list and
``docs`` note ``CHILD PROPOSAL CONTRACT`` below for what item 7 must emit.

TOLERANCES ARE PINNED CONSTANTS, NOT MAGIC NUMBERS.  Every threshold below is a
module constant with a stated unit and a stated derivation, and every one is
mutation-tested from the refusing side.  The ones where an acceptance just
inside the threshold can be constructed -- the three agreement tolerances, both
known-pose drift tolerances, all three gauge floors, the correspondence floor
and both digest grids -- are tested from BOTH sides, so a constant cannot be
quietly widened OR narrowed to zero.  The two conditioning floors and the
shape-change fraction are tested from the refusing side only, with the happy
path as their far-from-boundary acceptance.  Two families exist and they are NOT
interchangeable:

  * *Agreement* tolerances (scale / rotation / translation between the child's
    declared transform and the parent's own solve).  These are float-noise
    scale.  Both sides solve the same well-posed least-squares problem on the
    same float64 numbers.  MEASURED in this suite, on a 12-pose room-scale
    trajectory round-tripped through the archive format: the parent's solve
    recovers a closed-form transform it was never given to 4.4e-16 relative in
    scale, 2.1e-16 rad in rotation and 8.1e-16 m in translation.  A 1e-6
    tolerance therefore sits about ten decades above the parent's own numerical
    floor while still being 1e-6 rad / 1 um -- far below anything geometrically
    meaningful.  WHAT THAT MEASUREMENT DOES NOT COVER, and this is the material
    gap: a real ``pycolmap`` transform has never been compared, because the
    wheel exists only on the GPU box.  The headroom against a DIFFERENT solver's
    arithmetic is reasoning, not measurement.
  * *Gauge sanity* floors (how far the aligned model may sit from the seed's
    metric frame).  These are deliberately loose.  They exist to refuse a model
    left in the arbitrary bundle-adjustment gauge, not to judge refinement
    quality -- that judgement belongs to ``evaluate_refinement_evidence``.

DEGENERACY FAILS CLOSED.  A correspondence set that is too small, collinear,
coincident, or too nearly planar does not produce a garbage transform with a
confident digest; it produces a refusal.  The conditioning floor is not a
guess -- it is derived from the agreement tolerance in
:data:`ALIGNMENT_MIN_PRINCIPAL_EXTENT_M`.

THE POSE DIGEST IS A DIGEST OVER CANONICALISED VALUES.  Floating-point alignment
is not bit-reproducible, so hashing raw IEEE-754 bytes would be a coin flip.
:func:`canonical_pose_digest` therefore hashes a fixed textual rendering of
QUANTISED integers on a pinned grid, after canonicalising quaternion sign and
norm.  The grid is not a tolerance: two values straddling a grid boundary hash
differently, and the parent then REFUSES.  The digest can produce a false
refusal; it cannot produce a false acceptance.  That asymmetry is the point.

WHAT THIS MODULE DOES NOT DO, stated so nothing here can be misread as more:

  * It does not verify the 3D POINTS.  Bundle adjustment changes the points, and
    the parent has no pre-alignment refined model to compare them against, so
    there is no exact relation available.  Point integrity rests on item 5's
    byte freeze and on item 7's reprojection evidence.
  * It does not ANCHOR any snapshot to data the parent holds independently, per
    the scope paragraph above.  MEASURED consequences on this suite's fixture,
    every one of them an acceptance with float-noise margins: a "room" whose
    trajectory radius is 403.97 m passes (fit residual 1.6e-13 m); an aligned
    model that reproduces the seed to 2e-15 m -- refinement having done nothing
    at all -- passes (7.3e-16 m).  No clause bounds trajectory extent above
    except :data:`POSE_DIGEST_MAX_TRANSLATION_M` at 1e6 m, and below only the
    conditioning floor does, which on this fixture's aspect ratio puts the small
    end at 11.8 mm of RMS radius.  Because the shape-change budget is a FRACTION
    of the seed radius, its absolute size scales with a number the child chose.
  * It does not pin the aligned ORIENTATIONS beyond a sanity ceiling.  Clause 15
    refuses a camera that points more than
    :data:`ALIGNED_MAX_ORIENTATION_CHANGE_RAD` away from where the recomputed
    similarity puts it -- which is what stops a model whose cameras face
    backwards from being certified -- but a uniform sub-ceiling misorientation
    is accepted, and no clause available to this module could refuse it.
  * It does not compose anything.  Nothing in ``refine_runner``,
    ``refine_publisher`` or ``refine_native_process`` calls into this module.
    ``NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT`` stays ``False``
    because that flag means QUALIFIED, and qualification needs item 7's
    composition plus host evidence.  See
    :data:`PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE`.
  * It has never parsed a real COLMAP 4.0.2 archive.  The binary layout here is
    implemented from the documented sparse-model format.  Every mismatch is a
    refusal rather than a silent misparse -- exact sizes, exact member order,
    exact trailing bytes -- but "fails closed on drift" is not the same claim as
    "known to match COLMAP 4.0.2 output", and only a host run can make the
    second one.

CHILD PROPOSAL CONTRACT (what item 7's child must emit alongside the archives):

  * ``scale`` / ``rotation`` / ``translation`` -- the similarity mapping the RAW
    PRE-BA camera centres onto the ALIGNED camera centres, solved on CAMERA
    CENTRES ONLY.  A transform solved on a different objective (COLMAP's
    ``align_centers_points_orientations`` also weighs orientations and points)
    will not agree with the parent's centres-only solve at the agreement
    tolerance and will be refused.  The child must declare the centres-only
    solve.
  * ``raw_pose_digest_sha256`` / ``aligned_pose_digest_sha256`` -- the child's
    :func:`canonical_pose_digest` over each of those two models.
"""

from __future__ import annotations

import hashlib
import math
import os
import struct
from collections.abc import Sequence
from dataclasses import dataclass

from .refine_adapter import (
    AdapterError,
    Matrix3,
    RefineDeadline,
    Sim3,
    Vector3,
    estimate_sim3,
)

# ---------------------------------------------------------------------------
# Stable failure codes
# ---------------------------------------------------------------------------
#: A snapshot archive or a COLMAP record inside it is not the reviewed shape.
ALIGNMENT_MODEL_INVALID_CODE = "REFINE_ALIGNMENT_MODEL_INVALID"
#: The correspondence set cannot determine a similarity to the stated tolerance.
ALIGNMENT_DEGENERATE_CODE = "REFINE_ALIGNMENT_DEGENERATE"
#: The child's proposal did not survive the parent's own recomputation.
ALIGNMENT_UNVERIFIED_CODE = "REFINE_ALIGNMENT_UNVERIFIED"

#: Nothing calls this module yet.  Item 6 implements the capability; item 7
#: composes it and produces the host evidence that could justify flipping
#: ``NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT``.  Keeping the two
#: statements separate is deliberate: "implemented" and "qualified" have been
#: conflated before in this program and the conflation is how a disabled stage
#: gets treated as a working one.
#:
#: WHAT COMPOSITION STILL OWES BEFORE THAT FLAG COULD MEAN "VERIFIED".  Not just
#: a call site: an ANCHOR.  Every archive this module reads is a child output,
#: so composing it as it stands would publish a decision that the child agreed
#: with itself.  ``request.frames`` is the parent's own copy of the device poses
#: the seed must carry, and item 7 has it; comparing the parsed seed centres and
#: orientations against those frames is what turns clauses 6 and 7 from an
#: internal-consistency check into a verification.  Composition is also what
#: makes a false acceptance PUBLISHABLE, which is why the order matters.
PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE = False

# ---------------------------------------------------------------------------
# The snapshot archive contract
# ---------------------------------------------------------------------------
#: Members a sparse-model snapshot MUST carry.  ``points3D.bin`` is required to
#: be present -- an archive without it is not a loadable COLMAP model -- but its
#: contents are deliberately not parsed (see the module docstring).
SPARSE_MODEL_REQUIRED_MEMBERS = ("cameras.bin", "images.bin", "points3D.bin")
#: Members a snapshot MAY carry.  COLMAP 4 writes rigs and frames alongside the
#: three classic files; the reviewed operation plan pins trivial rigs/frames, so
#: they carry no information this module needs, but refusing them outright would
#: make a faithful snapshot unrepresentable.  Header-validated, contents skipped.
SPARSE_MODEL_OPTIONAL_MEMBERS = ("frames.bin", "rigs.bin")
#: The only member ordering a canonical snapshot may use.  Fixing the order (and
#: not merely the set) is what makes the archive byte-deterministic for a given
#: model, which is what lets the freeze digest in item 5 mean anything.
SPARSE_MODEL_CANONICAL_MEMBER_ORDER = (
    "cameras.bin",
    "frames.bin",
    "images.bin",
    "points3D.bin",
    "rigs.bin",
)
#: Whole-archive ceiling.  At the 400-frame pilot cap the dominant member is
#: ``points3D.bin``; 2 GiB sits well above a plausible room-scale model while
#: still refusing a runaway.  ENGINEERING ESTIMATE, not a measurement.
SPARSE_MODEL_MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
#: Ceiling on the two members this module actually parses.  ``images.bin``
#: carries every 2D observation, so it is the larger of the two: 400 frames x
#: ~8000 features x 24 bytes is roughly 77 MiB.  512 MiB is generous headroom.
#: ESTIMATE, not a measurement.
SPARSE_MODEL_MAX_PARSED_MEMBER_BYTES = 512 * 1024 * 1024
#: Registered-image ceiling, matching the pilot 400-frame cap the rest of the
#: Refine contract uses.  A snapshot claiming more is refused rather than parsed.
SPARSE_MODEL_MAX_IMAGES = 400
#: COLMAP's ``PINHOLE`` camera model id and its parameter count.  The reviewed
#: operation plan pins ``("model", "PINHOLE")``, so any other model in a snapshot
#: is drift from the reviewed plan and is refused rather than accommodated.
COLMAP_PINHOLE_MODEL_ID = 1
COLMAP_PINHOLE_PARAM_COUNT = 4
#: Longest image name a snapshot may carry.  Names are the correspondence key,
#: so an unbounded name is an unbounded parse.
SPARSE_MODEL_MAX_IMAGE_NAME_BYTES = 255

_TAR_BLOCK_BYTES = 512
_TAR_USTAR_MAGIC = b"ustar\x00"
_TAR_USTAR_VERSION = b"00"
_TAR_REGULAR_TYPEFLAG = b"0"
#: Canonical member metadata.  A snapshot packer that emits anything else is
#: emitting a non-reproducible archive, so these are requirements, not defaults.
_TAR_CANONICAL_MODE = 0o644
_PREAD_CHUNK_BYTES = 256 * 1024

#: How often a bounded per-image loop re-checks the carried deadline.  Mirrors
#: ``refine_runner._DEADLINE_CHECK_INTERVAL``: often enough that a 400-image
#: parse cannot outrun a lease, rare enough that the check is not the cost.
DEADLINE_CHECK_INTERVAL = 32

# ---------------------------------------------------------------------------
# The pose digest
# ---------------------------------------------------------------------------
#: Version tag hashed first, so a future canonicalisation change cannot collide
#: with a digest produced by this one.
POSE_DIGEST_VERSION = "refine-pose-digest-v1"
#: Quantisation grid for the canonicalised unit quaternion components
#: (dimensionless).  1e-9 on a unit quaternion is ~1e-9 rad of attitude -- five
#: decades finer than the alignment agreement tolerance, so the digest never
#: becomes the loosest link, and still 1e7 times coarser than float64 epsilon on
#: a unit-magnitude value, so it absorbs ordinary reassociation noise.
POSE_DIGEST_QUATERNION_QUANTUM = 1.0e-9
#: Quantisation grid for translations and camera centres, in metres: 1 nm.
POSE_DIGEST_TRANSLATION_QUANTUM_M = 1.0e-9
#: Magnitude ceiling for a translation or centre component, in metres.  A scan
#: world frame is room scale; 1e6 m is absurd, and bounding it keeps every
#: quantised integer inside float64's exactly-representable range.
POSE_DIGEST_MAX_TRANSLATION_M = 1.0e6
#: The bound the two grids above are CHOSEN to respect: ``2**53`` is where
#: float64 stops representing consecutive integers exactly, and a rounding step
#: that is not exact is not a canonicalisation.  It is a design constraint on the
#: constants, not a runtime check -- ``maximum / quantum`` is 1e15 for
#: translations and 2e9 for quaternion components, both comfortably under it.
#: ``test_the_quantisation_grids_stay_inside_exact_float_integers`` is what makes
#: an edit to any of those four constants fail rather than silently break it.
POSE_DIGEST_MAX_QUANTISED_MAGNITUDE = 2**53
_DIGEST_FIELD_SEPARATOR = "\x1f"

# ---------------------------------------------------------------------------
# Agreement tolerances -- float-noise scale.  See the module docstring.
# ---------------------------------------------------------------------------
#: Relative difference permitted between the child's declared scale and the
#: parent's own solve.  Dimensionless.
ALIGNMENT_SCALE_RELATIVE_TOLERANCE = 1.0e-6
#: Geodesic angle permitted between the declared and recomputed rotations, in
#: radians.  Over a 10 m lever arm 1e-6 rad displaces a camera by 10 um.
ALIGNMENT_ROTATION_TOLERANCE_RAD = 1.0e-6
#: Euclidean difference permitted between the declared and recomputed
#: translations, in metres: 1 um.
ALIGNMENT_TRANSLATION_TOLERANCE_M = 1.0e-6

# ---------------------------------------------------------------------------
# Known-pose invariant -- the triangulator is not permitted to move cameras.
# ---------------------------------------------------------------------------
#: The reviewed plan runs ``point_triangulator`` with ``--clear_points 1
#: --refine_intrinsics 0`` against a full-pose seed, so the raw pre-BA snapshot
#: must carry the SEED poses unchanged.  These are float round-trip tolerances,
#: not accuracy budgets: any drift above them means the phase did something the
#: reviewed plan does not allow.
RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M = 1.0e-6
RAW_SNAPSHOT_ROTATION_DRIFT_TOLERANCE_RAD = 1.0e-6

# ---------------------------------------------------------------------------
# Degeneracy floors
# ---------------------------------------------------------------------------
#: Minimum number of paired camera centres.  Horn needs three, but three gives
#: zero redundancy, so the fit residual carries no information and a single bad
#: pose is unobservable.  Eight gives 24 equations for 7 unknowns.  The pilot
#: range is 200-400 frames, so this floor never binds on a real run -- it binds
#: on a truncated or filtered model, which is exactly when it should.
ALIGNMENT_MIN_CORRESPONDENCES = 8
#: Minimum RMS spread of the camera centres along their WEAKEST principal axis,
#: in metres.  DERIVED, not chosen: an out-of-plane rotation solved from a set
#: whose weak axis spans ``d`` metres, given per-point positional noise ``n``,
#: is determined to about ``n / d`` radians.  Requiring that to stay under
#: :data:`ALIGNMENT_ROTATION_TOLERANCE_RAD` (1e-6 rad) at a serialisation noise
#: floor of ``n`` = 1e-9 m gives ``d >= 1e-3`` m.  So this floor is what makes
#: the rotation tolerance meaningful rather than arbitrary.
#:
#: THIS CLAUSE IS ONLY REACHABLE BECAUSE IT IS EVALUATED FIRST, and a future
#: reorder would silently make it dead.  For any trajectory whose STRONGEST
#: extent exceeds 1 m, the ratio floor below already demands a weak axis of at
#: least ``1e-3 x strongest >= 1e-3`` m, so it dominates this one entirely; both
#: fire only on trajectories under a metre.  MEASURED on a 2 m-radius ring whose
#: strongest principal spread is 1.4142 m: a weak axis of 5.657e-4 m fires THIS
#: floor, and 1.202e-3 m fires the ratio floor.  Not wrong today, but the
#: dominated ``ALIGNMENT_MIN_SEED_RMS_RADIUS_M`` clause was deleted for exactly
#: this shape and this one survives on evaluation order alone.
ALIGNMENT_MIN_PRINCIPAL_EXTENT_M = 1.0e-3
#: Minimum ratio of weakest to strongest principal spread.  Independent of the
#: absolute floor above: a 40 m trajectory with a 2 cm weak axis clears the
#: absolute floor easily while still being conditioned ~2000:1.  A handheld room
#: walk is nowhere near this (hand-height variation alone is decimetres against
#: metres of extent), so this binds on a rail/tripod slide, which genuinely does
#: not determine the out-of-plane rotation.  REASONING, not a measurement.
ALIGNMENT_MIN_PRINCIPAL_EXTENT_RATIO = 1.0e-3

# ---------------------------------------------------------------------------
# Gauge sanity floors -- deliberately loose.  See the module docstring.
# ---------------------------------------------------------------------------
#: How far the recomputed raw->aligned similarity may sit from identity before
#: the aligned model is treated as still living in the bundle-adjustment gauge.
#: A free-gauge BA solution has an arbitrary scale, so "within 5%" refuses that
#: case with certainty while accepting any plausible refinement.  These are
#: sanity floors, NOT quality gates: refinement quality is
#: ``evaluate_refinement_evidence``'s decision, not this module's.
ALIGNED_GAUGE_MAX_SCALE_DEVIATION = 0.05
ALIGNED_GAUGE_MAX_ROTATION_RAD = 0.05
ALIGNED_GAUGE_MAX_TRANSLATION_M = 0.25
#: Ceiling on the alignment fit residual, as a fraction of the seed trajectory's
#: own RMS radius.  A best-fit similarity that still leaves cameras scattered by
#: half the trajectory's own extent has not aligned anything.  Loose on purpose.
#: MEASURED on this suite's 12-pose, 2.0198 m-radius fixture, so an operator can
#: see what "loose" admits rather than having to infer it.  Independent uniform
#: jitter on EVERY aligned camera centre: +-0.55 m accepted (fit residual
#: 0.4695 m), +-0.60 m refused.  A single aligned camera displaced along one
#: axis: +1.10 m accepted (0.2888 m), +1.20 m refused.  AT THAT SCALE THIS
#: FRACTION IS NOT THE BINDING CLAUSE and the numbers say which is: the 1.0099 m
#: of residual it would permit is never reached, because the rotation gauge
#: refuses the jitter case and the scale gauge refuses the single-camera case
#: first.  This fraction binds on trajectories small enough that the absolute
#: gauge floors go slack, which is the range it was written for.
#: ``test_the_measured_shape_change_envelope_is_what_the_gauge_floors_leave``
#: is what makes an edit to any of those four constants contradict this note
#: rather than silently outdate it.
ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION = 0.5
#: Ceiling on how far the ALIGNED model's cameras may point away from where the
#: recomputed similarity puts them, in radians, taken over the worst camera.
#:
#: A Sim(3) applied to a COLMAP model determines the ORIENTATIONS exactly, not
#: only the centres: a camera images ``R_i (X - c_i)``, and ``X' = s R X + t``
#: forces ``R'_i = R_i R^T``.  So the quantity this bounds is not a fitted
#: residual -- it is exactly the rotation bundle adjustment applied to camera
#: ``i``, the orientation counterpart of the centre residual above.  Without this
#: clause the aligned orientations would be constrained by nothing at all: the
#: centres, the three agreement margins, the gauge floors and the fit residual
#: are every one of them blind to a camera that points the wrong way, and so is
#: the digest, which is only ever compared against a value the child derived from
#: the same bytes.
#:
#: WHY 0.5 rad (29 degrees).  REASONING, not a measurement.  Clause 7 pins the
#: raw orientations to the DEVICE's own attitude, whose roll and pitch are
#: gravity-anchored to about a degree and whose yaw drifts slowly over a room
#: walk; a refinement that re-points a camera by 29 degrees has replaced the
#: device pose rather than refined it.  Like the gauge floors this is a sanity
#: ceiling set far from any plausible run, NOT a quality gate.
#:
#: WHAT IT THEREFORE DOES NOT BUY, stated because the gap is real: an aligned
#: model whose cameras are uniformly 0.4 rad (23 degrees) out still passes.
#: Nothing in this module can close that, because all three archives are child
#: outputs and no independent attitude is available to compare against -- see
#: "WHAT THIS MODULE DOES NOT DO" in the module docstring.
ALIGNED_MAX_ORIENTATION_CHANGE_RAD = 0.5
#: There is deliberately NO separate floor on the seed trajectory's RMS radius.
#: One was written and then removed: ``rms_radius >= sqrt(3) * weakest principal
#: extent``, so :data:`ALIGNMENT_MIN_PRINCIPAL_EXTENT_M` already guarantees a
#: radius above 1.7e-3 m and a second floor at 1e-3 m could never fire.  A clause
#: no input can reach is a clause no deletion can redden.


# ---------------------------------------------------------------------------
# Contract types
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SparseModelPose:
    """One registered image, canonicalised at parse time.

    ``qvec`` is unit-normalised with a canonical sign, so ``q`` and ``-q`` --
    the same rotation -- always produce the same digest.  ``camera_center_m`` is
    derived (``-R^T t``) rather than read, because the centre is what the
    similarity solve consumes and deriving it means a malformed rotation cannot
    reach the solver disguised as a plausible centre.
    """

    image_id: int
    camera_id: int
    name: str
    qvec: tuple[float, float, float, float]
    tvec: Vector3
    camera_center_m: Vector3


@dataclass(frozen=True)
class SparseModelSnapshot:
    """A parsed COLMAP sparse model, poses ordered canonically by image name."""

    label: str
    poses: tuple[SparseModelPose, ...]
    camera_ids: tuple[int, ...]

    def names(self) -> tuple[str, ...]:
        return tuple(pose.name for pose in self.poses)

    def centres(self) -> tuple[Vector3, ...]:
        return tuple(pose.camera_center_m for pose in self.poses)


@dataclass(frozen=True)
class ProposedAlignment:
    """The child's CLAIM.  Carried and recorded; never authoritative.

    See ``CHILD PROPOSAL CONTRACT`` in the module docstring for exactly which
    transform this must be.  Nothing in this module trusts these numbers: every
    field is compared against something the parent computed for itself.
    """

    scale: float
    rotation: Matrix3
    translation: Vector3
    raw_pose_digest_sha256: str
    aligned_pose_digest_sha256: str


@dataclass(frozen=True)
class ParentAlignmentVerification:
    """What the PARENT computed, plus every margin it decided on.

    Returning the margins rather than a bare boolean is deliberate: an operator
    reading a refusal needs to know how far out the run was, and item 7's
    evidence builder needs the numbers rather than the verdict.
    """

    transform: Sim3
    raw_pose_digest_sha256: str
    aligned_pose_digest_sha256: str
    correspondences: int
    scale_relative_difference: float
    rotation_angle_difference_rad: float
    translation_difference_m: float
    gauge_scale_deviation: float
    gauge_rotation_rad: float
    gauge_translation_m: float
    fit_rmse_m: float
    max_aligned_orientation_change_rad: float
    seed_rms_radius_m: float
    max_raw_pose_drift_m: float
    max_raw_rotation_drift_rad: float
    seed_min_principal_extent_m: float
    aligned_min_principal_extent_m: float


# ---------------------------------------------------------------------------
# Small linear algebra, deliberately dependency-free
# ---------------------------------------------------------------------------
def _deadline_checkpoint(deadline: RefineDeadline, index: int) -> None:
    """Re-check the carried deadline every :data:`DEADLINE_CHECK_INTERVAL` items.

    Extracted rather than inlined because an inlined checkpoint is a clause no
    deletion can redden: every call site raises the identical error from
    ``RefineDeadline.remaining_seconds``, so a test cannot tell which one fired.
    As a function the STRIDE is directly falsifiable, which is the part that
    carries the contract.  The individual call sites remain unfalsifiable and
    this module does not claim otherwise.
    """

    if index % DEADLINE_CHECK_INTERVAL == 0:
        deadline.remaining_seconds()


def _transpose(matrix: Matrix3) -> Matrix3:
    return tuple(tuple(matrix[col][row] for col in range(3)) for row in range(3))  # type: ignore[return-value]


def _mat_mul(left: Matrix3, right: Matrix3) -> Matrix3:
    return tuple(  # type: ignore[return-value]
        tuple(sum(left[row][k] * right[k][col] for k in range(3)) for col in range(3))
        for row in range(3)
    )


def _mat_vec(matrix: Matrix3, vector: Sequence[float]) -> Vector3:
    return tuple(sum(matrix[row][col] * vector[col] for col in range(3)) for row in range(3))  # type: ignore[return-value]


def _rotation_geodesic_angle(left: Matrix3, right: Matrix3) -> float:
    """Return the rotation angle of ``left . right^T``, in radians.

    Computed as ``2 asin(||R - I||_F / (2 sqrt 2))`` rather than
    ``acos((tr R - 1) / 2)``.  The two are algebraically identical -- for a
    rotation by ``theta``, ``||R - I||_F = 2 sqrt(2) |sin(theta/2)|`` -- but the
    ``acos`` form is catastrophically imprecise exactly where this module cares
    most.  Near identity ``acos(1 - x) ~ sqrt(2x)``, so a float64 trace error of
    ~2e-16 shows up as ~2e-8 rad of phantom rotation, which would leave the 1e-6
    rad tolerances only fifty-fold headroom over noise.  MEASURED: the identical
    fixture reported 2.1e-8 rad of drift between two bit-identical models under
    the ``acos`` form.  ``asin`` of a quantity that is itself O(theta) has no
    such amplification, and remains exact over the whole ``[0, pi]`` range
    because ``sin(theta/2)`` is monotone there.
    """

    relative = _mat_mul(left, _transpose(right))
    squared = sum(
        (relative[row][col] - (1.0 if row == col else 0.0)) ** 2
        for row in range(3)
        for col in range(3)
    )
    sine_half = math.sqrt(squared) / (2.0 * math.sqrt(2.0))
    if sine_half > 1.0:
        sine_half = 1.0
    return 2.0 * math.asin(sine_half)


def _symmetric_3x3_eigenvalues(matrix: Matrix3) -> tuple[float, float, float]:
    """Closed-form eigenvalues of a symmetric 3x3, ascending.

    Smith's trigonometric solution.  Used only for the conditioning floor, where
    an exact eigen-decomposition would be overkill: what matters is the ratio of
    the weakest to the strongest principal spread, and that is stable here.
    """

    off_diagonal = matrix[0][1] ** 2 + matrix[0][2] ** 2 + matrix[1][2] ** 2
    mean = (matrix[0][0] + matrix[1][1] + matrix[2][2]) / 3.0
    if off_diagonal <= 0.0:
        return tuple(sorted((matrix[0][0], matrix[1][1], matrix[2][2])))  # type: ignore[return-value]
    scatter = (
        (matrix[0][0] - mean) ** 2
        + (matrix[1][1] - mean) ** 2
        + (matrix[2][2] - mean) ** 2
        + 2.0 * off_diagonal
    )
    spread = math.sqrt(scatter / 6.0)
    if spread <= 0.0:
        return (mean, mean, mean)
    shifted = tuple(
        tuple(
            (matrix[row][col] - (mean if row == col else 0.0)) / spread for col in range(3)
        )
        for row in range(3)
    )
    determinant = (
        shifted[0][0] * (shifted[1][1] * shifted[2][2] - shifted[1][2] * shifted[2][1])
        - shifted[0][1] * (shifted[1][0] * shifted[2][2] - shifted[1][2] * shifted[2][0])
        + shifted[0][2] * (shifted[1][0] * shifted[2][1] - shifted[1][1] * shifted[2][0])
    )
    half = determinant / 2.0
    if half > 1.0:
        half = 1.0
    elif half < -1.0:
        half = -1.0
    angle = math.acos(half) / 3.0
    largest = mean + 2.0 * spread * math.cos(angle)
    smallest = mean + 2.0 * spread * math.cos(angle + (2.0 * math.pi / 3.0))
    middle = 3.0 * mean - largest - smallest
    return tuple(sorted((smallest, middle, largest)))  # type: ignore[return-value]


def _principal_extents_m(points: Sequence[Vector3]) -> tuple[float, float]:
    """Return ``(weakest, strongest)`` RMS principal spread, in metres."""

    count = len(points)
    centroid = tuple(sum(point[axis] for point in points) / count for axis in range(3))
    covariance = tuple(
        tuple(
            sum(
                (point[row] - centroid[row]) * (point[col] - centroid[col])
                for point in points
            )
            / count
            for col in range(3)
        )
        for row in range(3)
    )
    eigenvalues = _symmetric_3x3_eigenvalues(covariance)  # type: ignore[arg-type]
    weakest = math.sqrt(eigenvalues[0]) if eigenvalues[0] > 0.0 else 0.0
    strongest = math.sqrt(eigenvalues[2]) if eigenvalues[2] > 0.0 else 0.0
    return weakest, strongest


def _rms_radius_m(points: Sequence[Vector3]) -> float:
    count = len(points)
    centroid = tuple(sum(point[axis] for point in points) / count for axis in range(3))
    total = sum(
        sum((point[axis] - centroid[axis]) ** 2 for axis in range(3)) for point in points
    )
    return math.sqrt(total / count)


def _canonical_unit_quaternion(
    values: Sequence[float],
    *,
    label: str,
) -> tuple[float, float, float, float]:
    """Unit-normalise and sign-canonicalise a Hamilton quaternion.

    ``q`` and ``-q`` are the same rotation, so a digest that did not fix the
    sign would depend on which representative the writer happened to emit.
    """

    length = math.sqrt(sum(value * value for value in values))
    if not math.isfinite(length) or length <= 1e-12:
        raise AdapterError(
            f"{label} quaternion must have a non-zero finite norm",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    quaternion = tuple(value / length for value in values)
    for value in quaternion:
        if abs(value) > 1e-14:
            if value < 0.0:
                quaternion = tuple(-component for component in quaternion)
            break
    return quaternion  # type: ignore[return-value]


def _quaternion_to_rotation(quaternion: Sequence[float]) -> Matrix3:
    w, x, y, z = quaternion
    return (
        (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
        (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
        (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
    )


# ---------------------------------------------------------------------------
# Bounded positional archive reading
# ---------------------------------------------------------------------------
def _read_exact_at(descriptor: int, offset: int, count: int, *, label: str) -> bytes:
    """Positional read of exactly ``count`` bytes, or a refusal.

    WHAT IS AND IS NOT COVERED, because the loop below has two separable parts
    and an earlier revision of this note conflated them.  No caller inside this
    module can make the loop run twice -- ``_MemberCursor.read_exact`` caps every
    pull at ``_PREAD_CHUNK_BYTES`` and the observation skip steps in the same
    units -- so through the public entry the continuation is inert.  The suite
    therefore drives THIS FUNCTION directly with a multi-chunk count, which makes
    the offset arithmetic and the chunk-size arithmetic falsifiable (dropping the
    ``+ read`` term duplicates bytes silently rather than raising).  The
    ``if not chunk:`` clause is a different case and stays uncovered; see its own
    comment.
    """

    chunks: list[bytes] = []
    read = 0
    while read < count:
        try:
            chunk = os.pread(
                descriptor, min(count - read, _PREAD_CHUNK_BYTES), offset + read
            )
        except OSError as exc:
            raise AdapterError(
                f"cannot read {label} snapshot archive: {exc.strerror or exc.errno}",
                ALIGNMENT_MODEL_INVALID_CODE,
            ) from exc
        if not chunk:
            # DECLARED UNFALSIFIABLE, and kept anyway -- this ONE clause, not the
            # continuation path around it, which the suite now drives directly.
            # Every call here is bounded by a size this process just read from
            # ``fstat``, so a regular file cannot reach EOF mid-read and no test
            # in this suite can construct the condition.  What it guards is a
            # CONCURRENT truncation, where the alternative to raising is an
            # unbounded loop.  Nothing claims a test covers it.
            raise AdapterError(
                f"{label} snapshot archive ended before a complete record",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        chunks.append(chunk)
        read += len(chunk)
    return b"".join(chunks)


class _MemberCursor:
    """A bounded forward cursor over one archive member's data region.

    Two labels, not one: ``label`` names the archive (so an I/O failure reads
    "cannot read seed snapshot archive") while ``member`` names the file inside
    it (so a structural refusal names which member was wrong).  A single label
    would have to be wrong for one of the two.
    """

    __slots__ = (
        "_descriptor",
        "_label",
        "_member",
        "_offset",
        "_remaining",
        "_buffer",
        "_used",
    )

    def __init__(
        self, descriptor: int, offset: int, size: int, label: str, member: str
    ) -> None:
        self._descriptor = descriptor
        self._label = label
        self._member = member
        self._offset = offset
        self._remaining = size
        self._buffer = b""
        self._used = 0

    @property
    def remaining(self) -> int:
        return self._remaining + len(self._buffer) - self._used

    def read_exact(self, count: int) -> bytes:
        """Return exactly ``count`` bytes, refilling at most once.

        Written without a refill LOOP on purpose.  An earlier revision looped
        until the buffer held enough, with the bound check as a separate
        precondition; deleting that precondition then made the loop spin
        forever, so the guard could not be reddened by any test -- a hanging
        suite is detectable but it is not a failing assertion.  Here the single
        pull is always at least what is needed, so removing the bound check
        yields a SHORT return, which the caller's ``struct.unpack`` turns into a
        visible failure.
        """

        available = len(self._buffer) - self._used
        if count > available:
            needed = count - available
            if needed > self._remaining:
                raise AdapterError(
                    f"{self._label} snapshot {self._member} record runs past the"
                    " end of its member",
                    ALIGNMENT_MODEL_INVALID_CODE,
                )
            pull = min(max(needed, _PREAD_CHUNK_BYTES), self._remaining)
            chunk = _read_exact_at(
                self._descriptor, self._offset, pull, label=self._label
            )
            self._offset += pull
            self._remaining -= pull
            self._buffer = self._buffer[self._used :] + chunk
            self._used = 0
        value = self._buffer[self._used : self._used + count]
        self._used += count
        return value

    def read_until_nul(self, *, maximum: int) -> bytes:
        collected = bytearray()
        while True:
            if len(collected) > maximum:
                raise AdapterError(
                    f"{self._label} snapshot {self._member} image name exceeds"
                    " the reviewed length",
                    ALIGNMENT_MODEL_INVALID_CODE,
                )
            byte = self.read_exact(1)
            if byte == b"\x00":
                return bytes(collected)
            collected.extend(byte)

    def require_exhausted(self) -> None:
        if self.remaining != 0:
            raise AdapterError(
                f"{self._label} snapshot {self._member} member carries"
                f" {self.remaining} trailing bytes",
                ALIGNMENT_MODEL_INVALID_CODE,
            )


def _octal_field(header: bytes, start: int, length: int, *, field: str, label: str) -> int:
    raw = header[start : start + length]
    text = raw.split(b"\x00")[0].strip()
    if not text:
        return 0
    try:
        return int(text, 8)
    except ValueError as exc:
        raise AdapterError(
            f"{label} snapshot archive has a malformed {field} field",
            ALIGNMENT_MODEL_INVALID_CODE,
        ) from exc


def _tar_header_checksum_ok(header: bytes) -> bool:
    stored = header[148:156].split(b"\x00")[0].strip()
    if not stored:
        return False
    try:
        expected = int(stored, 8)
    except ValueError:
        return False
    blanked = header[:148] + b" " * 8 + header[156:]
    return sum(blanked) == expected


def _archive_member_map(descriptor: int, *, label: str) -> dict[str, tuple[int, int]]:
    """Parse the canonical USTAR directory and return ``{name: (offset, size)}``.

    Every deviation from the canonical form is a refusal.  The archive is
    something the parent will publish; an archive it can only partly account for
    is not one it should publish.
    """

    try:
        total = os.fstat(descriptor).st_size
    except OSError as exc:
        raise AdapterError(
            f"cannot stat {label} snapshot archive: {exc.strerror or exc.errno}",
            ALIGNMENT_MODEL_INVALID_CODE,
        ) from exc
    if total <= 0 or total % _TAR_BLOCK_BYTES != 0:
        raise AdapterError(
            f"{label} snapshot archive is not a whole number of tar blocks",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    if total > SPARSE_MODEL_MAX_ARCHIVE_BYTES:
        raise AdapterError(
            f"{label} snapshot archive exceeds the reviewed archive ceiling",
            ALIGNMENT_MODEL_INVALID_CODE,
        )

    members: dict[str, tuple[int, int]] = {}
    order: list[str] = []
    offset = 0
    saw_end_marker = False
    while offset < total:
        header = _read_exact_at(descriptor, offset, _TAR_BLOCK_BYTES, label=label)
        if header == bytes(_TAR_BLOCK_BYTES):
            saw_end_marker = True
            break
        if not _tar_header_checksum_ok(header):
            raise AdapterError(
                f"{label} snapshot archive header checksum does not verify",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        if header[257:263] != _TAR_USTAR_MAGIC or header[263:265] != _TAR_USTAR_VERSION:
            raise AdapterError(
                f"{label} snapshot archive is not canonical USTAR",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        if header[156:157] != _TAR_REGULAR_TYPEFLAG:
            raise AdapterError(
                f"{label} snapshot archive carries a non-regular member",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        if header[345:500] != bytes(155) or header[157:257] != bytes(100):
            raise AdapterError(
                f"{label} snapshot archive member carries a prefix or link name",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        name = header[:100].split(b"\x00")[0]
        try:
            decoded = name.decode("ascii")
        except UnicodeDecodeError as exc:
            raise AdapterError(
                f"{label} snapshot archive member name is not ASCII",
                ALIGNMENT_MODEL_INVALID_CODE,
            ) from exc
        if decoded not in SPARSE_MODEL_CANONICAL_MEMBER_ORDER:
            raise AdapterError(
                f"{label} snapshot archive member is outside the reviewed universe",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        if decoded in members:
            raise AdapterError(
                f"{label} snapshot archive repeats a member name",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        mode = _octal_field(header, 100, 8, field="mode", label=label)
        if mode != _TAR_CANONICAL_MODE:
            raise AdapterError(
                f"{label} snapshot archive member has a non-canonical mode",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        for start, length, field in (
            (108, 8, "uid"),
            (116, 8, "gid"),
            (136, 12, "mtime"),
        ):
            if _octal_field(header, start, length, field=field, label=label) != 0:
                raise AdapterError(
                    f"{label} snapshot archive member has a non-canonical {field}",
                    ALIGNMENT_MODEL_INVALID_CODE,
                )
        size = _octal_field(header, 124, 12, field="size", label=label)
        data_offset = offset + _TAR_BLOCK_BYTES
        padded = (size + _TAR_BLOCK_BYTES - 1) // _TAR_BLOCK_BYTES * _TAR_BLOCK_BYTES
        if data_offset + padded > total:
            raise AdapterError(
                f"{label} snapshot archive member runs past the archive",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        members[decoded] = (data_offset, size)
        order.append(decoded)
        offset = data_offset + padded

    if not saw_end_marker:
        raise AdapterError(
            f"{label} snapshot archive has no end-of-archive marker",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    while offset < total:
        chunk = _read_exact_at(
            descriptor,
            offset,
            min(_PREAD_CHUNK_BYTES, total - offset),
            label=label,
        )
        if chunk.strip(b"\x00"):
            raise AdapterError(
                f"{label} snapshot archive carries bytes after its end marker",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        offset += len(chunk)

    missing = [name for name in SPARSE_MODEL_REQUIRED_MEMBERS if name not in members]
    if missing:
        raise AdapterError(
            f"{label} snapshot archive is missing {missing[0]}",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    canonical = [
        name for name in SPARSE_MODEL_CANONICAL_MEMBER_ORDER if name in members
    ]
    if order != canonical:
        raise AdapterError(
            f"{label} snapshot archive members are not in canonical order",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    return members


# ---------------------------------------------------------------------------
# COLMAP sparse-model binary parsing
# ---------------------------------------------------------------------------
def _parse_cameras_bin(cursor: _MemberCursor, *, label: str) -> tuple[int, ...]:
    (count,) = struct.unpack("<Q", cursor.read_exact(8))
    if count == 0 or count > SPARSE_MODEL_MAX_IMAGES:
        raise AdapterError(
            f"{label} snapshot camera count is outside the reviewed range",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    camera_ids: list[int] = []
    for _ in range(count):
        camera_id, model_id, _width, _height = struct.unpack(
            "<IiQQ", cursor.read_exact(24)
        )
        if model_id != COLMAP_PINHOLE_MODEL_ID:
            raise AdapterError(
                f"{label} snapshot camera is not the reviewed PINHOLE model",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        cursor.read_exact(8 * COLMAP_PINHOLE_PARAM_COUNT)
        if camera_id in camera_ids:
            raise AdapterError(
                f"{label} snapshot repeats a camera id",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        camera_ids.append(camera_id)
    cursor.require_exhausted()
    return tuple(sorted(camera_ids))


def _parse_images_bin(
    cursor: _MemberCursor,
    *,
    label: str,
    camera_ids: tuple[int, ...],
    deadline: RefineDeadline,
) -> tuple[SparseModelPose, ...]:
    (count,) = struct.unpack("<Q", cursor.read_exact(8))
    if count < 1 or count > SPARSE_MODEL_MAX_IMAGES:
        raise AdapterError(
            f"{label} snapshot registered image count is outside the reviewed range",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    poses: list[SparseModelPose] = []
    seen_ids: set[int] = set()
    seen_names: set[str] = set()
    for index in range(count):
        _deadline_checkpoint(deadline, index)
        image_id, qw, qx, qy, qz, tx, ty, tz, camera_id = struct.unpack(
            "<I7dI", cursor.read_exact(64)
        )
        raw_name = cursor.read_until_nul(maximum=SPARSE_MODEL_MAX_IMAGE_NAME_BYTES)
        (observations,) = struct.unpack("<Q", cursor.read_exact(8))
        observation_bytes = observations * 24
        if observation_bytes > cursor.remaining:
            raise AdapterError(
                f"{label} snapshot image claims more observations than it carries",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        # The 2D observations are skipped on purpose: this module verifies the
        # pose gauge, and reading every keypoint would make the parse unbounded
        # in time for nothing it decides on.
        while observation_bytes > 0:
            step = min(observation_bytes, _PREAD_CHUNK_BYTES)
            cursor.read_exact(step)
            observation_bytes -= step
        if image_id in seen_ids:
            raise AdapterError(
                f"{label} snapshot repeats an image id",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        seen_ids.add(image_id)
        if camera_id not in camera_ids:
            raise AdapterError(
                f"{label} snapshot image references an unknown camera id",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        try:
            name = raw_name.decode("ascii")
        except UnicodeDecodeError as exc:
            raise AdapterError(
                f"{label} snapshot image name is not ASCII",
                ALIGNMENT_MODEL_INVALID_CODE,
            ) from exc
        if not name or any(character < "!" or character > "~" for character in name):
            raise AdapterError(
                f"{label} snapshot image name is not printable ASCII",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        if name in seen_names:
            raise AdapterError(
                f"{label} snapshot repeats an image name",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        seen_names.add(name)
        components = (qw, qx, qy, qz, tx, ty, tz)
        if any(not math.isfinite(value) for value in components):
            raise AdapterError(
                f"{label} snapshot image pose carries a non-finite value",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
        quaternion = _canonical_unit_quaternion(
            (qw, qx, qy, qz), label=f"{label} snapshot image"
        )
        rotation = _quaternion_to_rotation(quaternion)
        translation = (tx, ty, tz)
        centre = tuple(
            -value for value in _mat_vec(_transpose(rotation), translation)
        )
        poses.append(
            SparseModelPose(
                image_id=image_id,
                camera_id=camera_id,
                name=name,
                qvec=quaternion,
                tvec=translation,
                camera_center_m=centre,  # type: ignore[arg-type]
            )
        )
    cursor.require_exhausted()
    return tuple(sorted(poses, key=lambda pose: pose.name))


def read_sparse_model_snapshot(
    descriptor: int,
    *,
    label: str,
    deadline: RefineDeadline,
) -> SparseModelSnapshot:
    """Parse one snapshot archive from a parent-owned read-only descriptor.

    ``descriptor`` is expected to be one of the frozen anonymous copies item 5
    hands back, which is why every read here is positional: the descriptor's file
    offset belongs to its owner and this function must not move it.
    """

    if type(descriptor) is not int or isinstance(descriptor, bool) or descriptor < 0:
        raise AdapterError(
            "snapshot descriptor must be a non-negative file descriptor",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    if type(label) is not str or not label:
        raise AdapterError(
            "snapshot label must be a non-empty string",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    if type(deadline) is not RefineDeadline:
        raise AdapterError(
            "snapshot parse requires the carried refine deadline",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    deadline.remaining_seconds()
    members = _archive_member_map(descriptor, label=label)
    for name in ("cameras.bin", "images.bin"):
        if members[name][1] > SPARSE_MODEL_MAX_PARSED_MEMBER_BYTES:
            raise AdapterError(
                f"{label} snapshot {name} exceeds the reviewed parse ceiling",
                ALIGNMENT_MODEL_INVALID_CODE,
            )
    camera_offset, camera_size = members["cameras.bin"]
    camera_ids = _parse_cameras_bin(
        _MemberCursor(descriptor, camera_offset, camera_size, label, "cameras.bin"),
        label=label,
    )
    image_offset, image_size = members["images.bin"]
    poses = _parse_images_bin(
        _MemberCursor(descriptor, image_offset, image_size, label, "images.bin"),
        label=label,
        camera_ids=camera_ids,
        deadline=deadline,
    )
    return SparseModelSnapshot(label=label, poses=poses, camera_ids=camera_ids)


# ---------------------------------------------------------------------------
# The canonical pose digest
# ---------------------------------------------------------------------------
def _quantised(value: float, quantum: float, *, maximum: float, label: str) -> int:
    if not math.isfinite(value):
        raise AdapterError(
            f"{label} is not finite and cannot be canonicalised",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    if abs(value) > maximum:
        raise AdapterError(
            f"{label} is outside the canonicalisable range",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    # No runtime check that the quotient stays inside
    # ``POSE_DIGEST_MAX_QUANTISED_MAGNITUDE``: the magnitude ceilings above
    # already guarantee it (1e6 / 1e-9 = 1e15 and 2 / 1e-9 = 2e9, both under
    # 2**53), so such a check could never fire and no deletion of it could
    # redden.  The relationship is asserted as arithmetic in the test suite
    # instead, which is where a constant edit that broke it would be caught.
    return int(round(value / quantum))


def canonical_pose_digest(snapshot: SparseModelSnapshot) -> str:
    """Hash a snapshot's poses after canonicalisation.

    THE CANONICALISATION, stated exactly so a second implementation can
    reproduce it:

      1. Poses are ordered by image name, compared as Python ``str`` (the names
         are validated printable ASCII, so this is byte order).
      2. Each quaternion is unit-normalised and sign-canonicalised at parse time
         (first component with ``|c| > 1e-14`` made positive).
      3. Every float is divided by its grid quantum and rounded half-to-even to
         an integer -- exactly, because the magnitude bounds keep the quotient
         inside ``2**53``.  Rendering the INTEGER is what makes the digest
         reproducible; rendering the float would not be.
      4. Fields are joined with ``U+001F`` and rows with ``\\n``, prefixed by
         :data:`POSE_DIGEST_VERSION`.

    The camera centre is included as well as the translation even though one is
    derived from the other: they round differently, so covering both narrows the
    set of records that can collide on the grid.

    WHAT A DIGEST MATCH DOES AND DOES NOT MEAN.  This digest is only ever
    compared against a value the CHILD declared, and the child derives its value
    from the same bytes the parent is reading.  A match therefore says the child
    described the archive it really shipped; it says nothing whatever about
    whether that archive is right.  In particular it cannot see a model that is
    wrong but self-consistent: a child that mis-orients every camera and then
    honestly digests the result matches here, which is why the aligned
    orientations need their own clause
    (:data:`ALIGNED_MAX_ORIENTATION_CHANGE_RAD`) and get no coverage from this
    function.  An earlier revision of this paragraph implied otherwise.
    """

    if type(snapshot) is not SparseModelSnapshot:
        raise AdapterError(
            "pose digest requires an exact SparseModelSnapshot",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    if not snapshot.poses:
        raise AdapterError(
            "pose digest requires at least one registered image",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    lines = [POSE_DIGEST_VERSION]
    for pose in snapshot.poses:
        fields = [pose.name, str(pose.image_id), str(pose.camera_id)]
        fields.extend(
            str(
                _quantised(
                    component,
                    POSE_DIGEST_QUATERNION_QUANTUM,
                    maximum=2.0,
                    label=f"{snapshot.label} quaternion component",
                )
            )
            for component in pose.qvec
        )
        fields.extend(
            str(
                _quantised(
                    component,
                    POSE_DIGEST_TRANSLATION_QUANTUM_M,
                    maximum=POSE_DIGEST_MAX_TRANSLATION_M,
                    label=f"{snapshot.label} translation component",
                )
            )
            for component in pose.tvec
        )
        fields.extend(
            str(
                _quantised(
                    component,
                    POSE_DIGEST_TRANSLATION_QUANTUM_M,
                    maximum=POSE_DIGEST_MAX_TRANSLATION_M,
                    label=f"{snapshot.label} camera centre component",
                )
            )
            for component in pose.camera_center_m
        )
        lines.append(_DIGEST_FIELD_SEPARATOR.join(fields))
    payload = ("\n".join(lines) + "\n").encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


# ---------------------------------------------------------------------------
# The parent's decision
# ---------------------------------------------------------------------------
def _require_snapshot(value: object, *, role: str) -> SparseModelSnapshot:
    if type(value) is not SparseModelSnapshot:
        raise AdapterError(
            f"alignment verification requires an exact {role} snapshot",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    return value


def _validated_proposal(proposal: object) -> ProposedAlignment:
    if type(proposal) is not ProposedAlignment:
        raise AdapterError(
            "alignment verification requires an exact ProposedAlignment",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    scale = proposal.scale
    if type(scale) is not float or not math.isfinite(scale) or scale <= 0.0:
        raise AdapterError(
            "proposed alignment scale must be a finite positive float",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    rotation = proposal.rotation
    if type(rotation) is not tuple or len(rotation) != 3:
        raise AdapterError(
            "proposed alignment rotation must be a 3x3 tuple",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    for row in rotation:
        if type(row) is not tuple or len(row) != 3:
            raise AdapterError(
                "proposed alignment rotation must be a 3x3 tuple",
                ALIGNMENT_UNVERIFIED_CODE,
            )
        for value in row:
            if type(value) is not float or not math.isfinite(value):
                raise AdapterError(
                    "proposed alignment rotation must be finite floats",
                    ALIGNMENT_UNVERIFIED_CODE,
                )
    translation = proposal.translation
    if type(translation) is not tuple or len(translation) != 3:
        raise AdapterError(
            "proposed alignment translation must be a 3-tuple",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    for value in translation:
        if type(value) is not float or not math.isfinite(value):
            raise AdapterError(
                "proposed alignment translation must be finite floats",
                ALIGNMENT_UNVERIFIED_CODE,
            )
    identity = _mat_mul(rotation, _transpose(rotation))  # type: ignore[arg-type]
    deviation = max(
        abs(identity[row][col] - (1.0 if row == col else 0.0))
        for row in range(3)
        for col in range(3)
    )
    if deviation > 1.0e-9:
        raise AdapterError(
            "proposed alignment rotation is not orthonormal",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    determinant = (
        rotation[0][0] * (rotation[1][1] * rotation[2][2] - rotation[1][2] * rotation[2][1])
        - rotation[0][1] * (rotation[1][0] * rotation[2][2] - rotation[1][2] * rotation[2][0])
        + rotation[0][2] * (rotation[1][0] * rotation[2][1] - rotation[1][1] * rotation[2][0])
    )
    if abs(determinant - 1.0) > 1.0e-9:
        raise AdapterError(
            "proposed alignment rotation is a reflection",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    for field, digest in (
        ("raw", proposal.raw_pose_digest_sha256),
        ("aligned", proposal.aligned_pose_digest_sha256),
    ):
        if (
            type(digest) is not str
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise AdapterError(
                f"proposed {field} pose digest must be lowercase hex sha256",
                ALIGNMENT_UNVERIFIED_CODE,
            )
    return proposal


def _require_conditioned(
    centres: Sequence[Vector3],
    *,
    role: str,
) -> float:
    weakest, strongest = _principal_extents_m(centres)
    if weakest < ALIGNMENT_MIN_PRINCIPAL_EXTENT_M:
        raise AdapterError(
            f"{role} camera centres are too nearly degenerate to solve a similarity",
            ALIGNMENT_DEGENERATE_CODE,
        )
    if strongest <= 0.0 or weakest / strongest < ALIGNMENT_MIN_PRINCIPAL_EXTENT_RATIO:
        raise AdapterError(
            f"{role} camera centres are too anisotropic to solve a similarity",
            ALIGNMENT_DEGENERATE_CODE,
        )
    return weakest


def verify_child_alignment_proposal(
    *,
    seed: SparseModelSnapshot,
    raw_pre_ba: SparseModelSnapshot,
    aligned: SparseModelSnapshot,
    proposal: ProposedAlignment,
    deadline: RefineDeadline,
) -> ParentAlignmentVerification:
    """Recompute the alignment and the pose digests; refuse on disagreement.

    The clauses, in the order they run.  Each raises a DISTINCT message, because
    a suite that can only see the exception class cannot tell which clause fired
    and every clause but one becomes deletable with zero red:

      1.  every snapshot is an exact :class:`SparseModelSnapshot`;
      2.  the proposal is an exact, structurally valid :class:`ProposedAlignment`
          (finite positive scale, orthonormal proper rotation, hex digests);
      3.  the three models carry identical image-name sets;
      4.  ... and identical ``(image_id, camera_id)`` membership per name;
      5.  at least :data:`ALIGNMENT_MIN_CORRESPONDENCES` of them;
      6.  the raw pre-BA centres match the seed centres -- the triangulator is
          not permitted to move a known pose;
      7.  ... and so do the raw pre-BA orientations;
      8.  the seed centres are conditioned well enough to solve a similarity;
      9.  ... and so are the aligned centres, independently;
      10. the parent's own solve agrees with the declared scale;
      11. ... with the declared rotation;
      12. ... with the declared translation;
      13. the recomputed transform is near enough to identity that the aligned
          model is in the seed's metric gauge rather than the BA gauge (three
          separate margins: scale, rotation, translation);
      14. the fit residual is a sane fraction of the seed trajectory's radius;
      15. ... and no aligned camera POINTS further from ``R_i R^T`` than
          :data:`ALIGNED_MAX_ORIENTATION_CHANGE_RAD` -- the orientation
          counterpart of clause 14, and the only clause that reads the aligned
          orientations at all;
      16. the parent's digest of the raw snapshot matches the declared one;
      17. ... and so does the parent's digest of the aligned snapshot.

    Returns the parent's numbers on success.  The child's numbers are never
    returned: a caller that wants them already has the proposal --
    ``transform`` in particular is ``recomputed``, never ``claim``.
    """

    if type(deadline) is not RefineDeadline:
        raise AdapterError(
            "alignment verification requires the carried refine deadline",
            ALIGNMENT_MODEL_INVALID_CODE,
        )
    deadline.remaining_seconds()
    seed_model = _require_snapshot(seed, role="seed")
    raw_model = _require_snapshot(raw_pre_ba, role="raw pre-BA")
    aligned_model = _require_snapshot(aligned, role="aligned")
    claim = _validated_proposal(proposal)

    names = seed_model.names()
    if raw_model.names() != names or aligned_model.names() != names:
        raise AdapterError(
            "seed, raw pre-BA and aligned snapshots must carry identical image names",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    membership = tuple((pose.image_id, pose.camera_id) for pose in seed_model.poses)
    for model in (raw_model, aligned_model):
        if tuple((pose.image_id, pose.camera_id) for pose in model.poses) != membership:
            raise AdapterError(
                "snapshots disagree on database image and camera ids",
                ALIGNMENT_UNVERIFIED_CODE,
            )
    if len(names) < ALIGNMENT_MIN_CORRESPONDENCES:
        raise AdapterError(
            "alignment needs more paired camera centres than this run carries",
            ALIGNMENT_DEGENERATE_CODE,
        )

    max_pose_drift = 0.0
    max_rotation_drift = 0.0
    for index, seed_pose in enumerate(seed_model.poses):
        _deadline_checkpoint(deadline, index)
        raw_pose = raw_model.poses[index]
        drift = math.sqrt(
            sum(
                (raw_pose.camera_center_m[axis] - seed_pose.camera_center_m[axis]) ** 2
                for axis in range(3)
            )
        )
        if drift > max_pose_drift:
            max_pose_drift = drift
        angle = _rotation_geodesic_angle(
            _quaternion_to_rotation(raw_pose.qvec),
            _quaternion_to_rotation(seed_pose.qvec),
        )
        if angle > max_rotation_drift:
            max_rotation_drift = angle
    if max_pose_drift > RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M:
        raise AdapterError(
            "raw pre-BA snapshot moved a known seed camera centre",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    if max_rotation_drift > RAW_SNAPSHOT_ROTATION_DRIFT_TOLERANCE_RAD:
        raise AdapterError(
            "raw pre-BA snapshot rotated a known seed camera",
            ALIGNMENT_UNVERIFIED_CODE,
        )

    raw_centres = raw_model.centres()
    aligned_centres = aligned_model.centres()
    seed_min_extent = _require_conditioned(seed_model.centres(), role="seed")
    aligned_min_extent = _require_conditioned(aligned_centres, role="aligned")

    # THE INDEPENDENT RECOMPUTATION.  Both point sets came out of archives this
    # process parsed itself; the solver is plain-Python Horn.  Nothing the child
    # computed enters this line.
    #
    # ``estimate_sim3`` carries its own collinearity and positive-scale guards.
    # They are NOT wrapped here, and no test claims them, because the
    # conditioning floors above are strictly stronger: a set that clears
    # ``ALIGNMENT_MIN_PRINCIPAL_EXTENT_RATIO`` cannot trip a 1e-9 cross-product
    # collinearity test.  Wrapping an unreachable branch to give it a nicer code
    # would be a clause no deletion could redden.
    recomputed = estimate_sim3(raw_centres, aligned_centres)

    scale_difference = abs(recomputed.scale - claim.scale) / claim.scale
    if scale_difference > ALIGNMENT_SCALE_RELATIVE_TOLERANCE:
        raise AdapterError(
            "recomputed alignment scale disagrees with the child's proposal",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    rotation_difference = _rotation_geodesic_angle(recomputed.rotation, claim.rotation)
    if rotation_difference > ALIGNMENT_ROTATION_TOLERANCE_RAD:
        raise AdapterError(
            "recomputed alignment rotation disagrees with the child's proposal",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    translation_difference = math.sqrt(
        sum(
            (recomputed.translation[axis] - claim.translation[axis]) ** 2
            for axis in range(3)
        )
    )
    if translation_difference > ALIGNMENT_TRANSLATION_TOLERANCE_M:
        raise AdapterError(
            "recomputed alignment translation disagrees with the child's proposal",
            ALIGNMENT_UNVERIFIED_CODE,
        )

    gauge_scale = abs(recomputed.scale - 1.0)
    if gauge_scale > ALIGNED_GAUGE_MAX_SCALE_DEVIATION:
        raise AdapterError(
            "aligned model is not in the seed's metric scale",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    gauge_rotation = _rotation_geodesic_angle(
        recomputed.rotation,
        ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
    )
    if gauge_rotation > ALIGNED_GAUGE_MAX_ROTATION_RAD:
        raise AdapterError(
            "aligned model is not in the seed's metric orientation",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    gauge_translation = math.sqrt(sum(value**2 for value in recomputed.translation))
    if gauge_translation > ALIGNED_GAUGE_MAX_TRANSLATION_M:
        raise AdapterError(
            "aligned model is not in the seed's metric origin",
            ALIGNMENT_UNVERIFIED_CODE,
        )

    # No floor is applied to this radius; the conditioning gate above already
    # bounds it below by ``sqrt(3) * ALIGNMENT_MIN_PRINCIPAL_EXTENT_M``.
    seed_radius = _rms_radius_m(seed_model.centres())
    inverse_rotation = _transpose(recomputed.rotation)
    residuals: list[float] = []
    max_orientation_change = 0.0
    for index in range(len(names)):
        _deadline_checkpoint(deadline, index)
        mapped = recomputed.apply(raw_centres[index])
        residuals.append(
            math.sqrt(
                sum(
                    (aligned_centres[index][axis] - mapped[axis]) ** 2
                    for axis in range(3)
                )
            )
        )
        # ``R'_i = R_i R^T``.  Both rotations are rebuilt from quaternions this
        # process parsed and canonicalised itself, and ``R`` came out of the
        # parent's own solve, so nothing the child computed enters this either.
        change = _rotation_geodesic_angle(
            _quaternion_to_rotation(aligned_model.poses[index].qvec),
            _mat_mul(
                _quaternion_to_rotation(raw_model.poses[index].qvec), inverse_rotation
            ),
        )
        if change > max_orientation_change:
            max_orientation_change = change
    fit_rmse = math.sqrt(sum(value * value for value in residuals) / len(residuals))
    if fit_rmse > ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION * seed_radius:
        raise AdapterError(
            "alignment fit residual is too large a fraction of the trajectory",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    if max_orientation_change > ALIGNED_MAX_ORIENTATION_CHANGE_RAD:
        raise AdapterError(
            "aligned camera orientations disagree with the recomputed alignment",
            ALIGNMENT_UNVERIFIED_CODE,
        )

    raw_digest = canonical_pose_digest(raw_model)
    if raw_digest != claim.raw_pose_digest_sha256:
        raise AdapterError(
            "recomputed raw pre-BA pose digest disagrees with the child's proposal",
            ALIGNMENT_UNVERIFIED_CODE,
        )
    aligned_digest = canonical_pose_digest(aligned_model)
    if aligned_digest != claim.aligned_pose_digest_sha256:
        raise AdapterError(
            "recomputed aligned pose digest disagrees with the child's proposal",
            ALIGNMENT_UNVERIFIED_CODE,
        )

    return ParentAlignmentVerification(
        transform=recomputed,
        raw_pose_digest_sha256=raw_digest,
        aligned_pose_digest_sha256=aligned_digest,
        correspondences=len(names),
        scale_relative_difference=scale_difference,
        rotation_angle_difference_rad=rotation_difference,
        translation_difference_m=translation_difference,
        gauge_scale_deviation=gauge_scale,
        gauge_rotation_rad=gauge_rotation,
        gauge_translation_m=gauge_translation,
        fit_rmse_m=fit_rmse,
        max_aligned_orientation_change_rad=max_orientation_change,
        seed_rms_radius_m=seed_radius,
        max_raw_pose_drift_m=max_pose_drift,
        max_raw_rotation_drift_rad=max_rotation_drift,
        seed_min_principal_extent_m=seed_min_extent,
        aligned_min_principal_extent_m=aligned_min_extent,
    )


__all__ = (
    "ALIGNED_GAUGE_MAX_ROTATION_RAD",
    "ALIGNED_GAUGE_MAX_SCALE_DEVIATION",
    "ALIGNED_GAUGE_MAX_TRANSLATION_M",
    "ALIGNED_MAX_ORIENTATION_CHANGE_RAD",
    "ALIGNMENT_DEGENERATE_CODE",
    "ALIGNMENT_MAX_SHAPE_CHANGE_FRACTION",
    "ALIGNMENT_MIN_CORRESPONDENCES",
    "ALIGNMENT_MIN_PRINCIPAL_EXTENT_M",
    "ALIGNMENT_MIN_PRINCIPAL_EXTENT_RATIO",
    "ALIGNMENT_MODEL_INVALID_CODE",
    "ALIGNMENT_ROTATION_TOLERANCE_RAD",
    "ALIGNMENT_SCALE_RELATIVE_TOLERANCE",
    "ALIGNMENT_TRANSLATION_TOLERANCE_M",
    "ALIGNMENT_UNVERIFIED_CODE",
    "PARENT_ALIGNMENT_VERIFICATION_COMPOSED_INTO_REFINE",
    "POSE_DIGEST_QUATERNION_QUANTUM",
    "POSE_DIGEST_TRANSLATION_QUANTUM_M",
    "POSE_DIGEST_VERSION",
    "ParentAlignmentVerification",
    "ProposedAlignment",
    "RAW_SNAPSHOT_POSE_DRIFT_TOLERANCE_M",
    "RAW_SNAPSHOT_ROTATION_DRIFT_TOLERANCE_RAD",
    "SPARSE_MODEL_CANONICAL_MEMBER_ORDER",
    "SPARSE_MODEL_MAX_ARCHIVE_BYTES",
    "SPARSE_MODEL_MAX_IMAGES",
    "SPARSE_MODEL_MAX_PARSED_MEMBER_BYTES",
    "SPARSE_MODEL_OPTIONAL_MEMBERS",
    "SPARSE_MODEL_REQUIRED_MEMBERS",
    "SparseModelPose",
    "SparseModelSnapshot",
    "canonical_pose_digest",
    "read_sparse_model_snapshot",
    "verify_child_alignment_proposal",
)
