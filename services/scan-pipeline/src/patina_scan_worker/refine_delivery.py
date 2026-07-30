"""Delivery of an ALREADY-PUBLISHED local Refine scratch tree to Supabase.

WHAT THIS IS, AND WHY IT IS A SECOND MODULE.

``refine_lifecycle`` reconstructs.  It runs materializer -> raster -> COLMAP ->
runner -> publisher and writes eleven immutable artifacts into a caller-named
LOCAL directory through :class:`~patina_scan_worker.refine_lifecycle.
LocalScratchStorageSink`.  Its banner says, and a test asserts, that it
publishes "to a local directory, never to Supabase Storage".  That sentence is
load-bearing and this module exists so it can stay literally true.

This module DELIVERS.  It takes one such already-published tree, reads every
byte a second time, and -- only under an explicit ``--commit`` -- uploads the
eleven objects create-only in manifest-last order through the real
:class:`~patina_scan_worker.storage.StorageClient`, then writes ONE record into
``room_files.present``.  It reconstructs nothing: no GPU, no COLMAP, no
toolchain manifest, no hour-long lease.  That is what makes it verifiable end to
end against a local ``supabase start`` stack, which is the only honest
verification available in a repository with no CI.

WHY NOT A FLAG ON ``refine_lifecycle``.  Three reasons, in descending order of
how much they would cost to unlearn later:

* R119 ruling 3 already ruled on this SHAPE.  It rejected an operator override
  because "an escape hatch that skips re-qualification reintroduces exactly the
  gap this program closed."  A boolean that switches one entry point between
  *touches no production system* and *writes eleven immutable objects into
  production Storage* is the same shape with a larger blast radius.
* The banner would become a lie, and a test asserts the banner reaches stderr.
* The credential asymmetry is STRUCTURAL, not stylistic.
  ``LocalScratchStorageSink`` deliberately never calls ``StorageClient.
  __init__`` -- it has no session, no settings and no service-role key.  One
  entry point cannot honestly be both "has no credential" and "has the
  credential".

THE VALIDATOR IS THE SUBSTANTIVE NEW CODE, AND ITS INDEPENDENCE IS THE FEATURE.
:func:`verify_published_tree` is deliberately a SECOND reading of the same
bytes, not a call into ``refine_publisher._validate_result`` -- which needs a
live in-memory ``RefineRunResult`` and cannot be reached from files at all.  Two
implementations reading one artifact set is a cross-check, in this program's own
idiom (the parent re-solves the child's Sim(3); the runner re-hashes the
engine's outputs).  Every refusal below precedes the first network call.

WHAT THIS MODULE DOES NOT DO.  It does not register a stage.  ``DEFAULT_STAGES``
is untouched, ``scan_pipeline.refine`` stays unregistered, nothing enqueues it,
and nothing under ``stages/`` imports this file.  Reachability of an artifact is
not enablement of a pipeline, and the three enabling levers -- no enqueue, no
handler, no advertised stage -- are all still down.

R123 EXPOSURE, STATED RATHER THAN GLOSSED.  ``evaluate_refinement_evidence`` no
longer vetoes on the loop comparables, so a self-consistent but globally wrong
reconstruction PASSES and this module will deliver it.  The advisory carried
into the record and into ``refine.published`` is a REPORT, not a guard; it
mitigates only if a human reads it.  Nothing here compensates for the absent
magnitude bound.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import stat
import sys
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import ConfigError, settings_from_env
from .db import DbClient
from .errors import PermanentError
from .http import build_session
from .refine_adapter import AdapterError, canonical_present_manifest_keys
from .refine_runner import PUBLISHED_REFINE_ARTIFACT_NAMES, REFINE_MANIFEST_NAME
from .storage import StorageClient
from .telemetry import Telemetry

# ---------------------------------------------------------------------------
# Posture
# ---------------------------------------------------------------------------
#: No delivery has ever run against production Storage or ``room_files``.  This
#: flag says so, and it is read by the package-wide AST posture scan rather than
#: taken on report.  Building the writer did not qualify the path.
REFINE_DELIVERY_QUALIFIED = False

#: Delivery is not a queue stage and is not reachable from ``stages/``.  Kept as
#: its own flag beside ``REFINE_LIFECYCLE_STAGE_REGISTERED`` so a future agent
#: who registers one has to look at the other.
REFINE_DELIVERY_STAGE_REGISTERED = False

DELIVERY_CONTRACT = "patina-refine-delivery-v1"
DELIVERY_REPORT_CONTRACT = "patina-refine-delivery-report-v1"
DELIVERY_SCHEMA_VERSION = 1

# ---------------------------------------------------------------------------
# Refusal tokens.  One per refusal so a test names the condition it constructed
# rather than matching prose.
# ---------------------------------------------------------------------------
TREE_SHAPE_CODE = "REFINE_DELIVERY_TREE_SHAPE"
PREFIX_IDENTITY_CODE = "REFINE_DELIVERY_PREFIX_IDENTITY"
MANIFEST_NONCANONICAL_CODE = "REFINE_DELIVERY_MANIFEST_NONCANONICAL"
POSTURE_CODE = "REFINE_DELIVERY_POSTURE"
IDENTITY_CODE = "REFINE_DELIVERY_IDENTITY"
LEDGER_CODE = "REFINE_DELIVERY_LEDGER"
DIGEST_CODE = "REFINE_DELIVERY_DIGEST"
CAPACITY_CODE = "REFINE_DELIVERY_CAPACITY"
ADVISORY_CODE = "REFINE_DELIVERY_ADVISORY"
TRANSPORT_CODE = "REFINE_DELIVERY_TRANSPORT"
BUCKET_MISMATCH_CODE = "REFINE_DELIVERY_BUCKET"
RECORD_CONFLICT_CODE = "REFINE_DELIVERY_RECORD_CONFLICT"
RECORD_NOT_ADVANCED_CODE = "REFINE_DELIVERY_RECORD_NOT_ADVANCED"

#: ``room-scans`` per-object ceiling (00077 raised it to 500 MB and nothing has
#: moved it since).  This is a REAL bound for this artifact set, not a
#: formality: ``database-v1.db`` carries SIFT descriptors for every registered
#: frame, and no run in this program has ever measured how large that gets at
#: 1440x1920.  Checking the whole set BEFORE the first upload turns "seven
#: objects landed and the eighth was rejected" into one clean refusal.
BUCKET_OBJECT_LIMIT_BYTES = 524_288_000

#: The transport content types ``room-scans`` admits AND Refine actually emits.
#: The runner ships every file-backed artifact as ``application/octet-stream``
#: and every inline document as ``application/json``; the *semantic* type
#: (``application/vnd.sqlite3``, ``application/x-tar``, ``text/plain``) rides the
#: manifest ledger, because the bucket's ``allowed_mime_types`` would 400 them.
#: Refusing anything else here pre-empts a mid-publication 400.
ALLOWED_TRANSPORT_CONTENT_TYPES = frozenset(
    {"application/json", "application/octet-stream"}
)

#: The ``room_files.present`` keys ``scan_present_stats`` (00377) CASTS to a
#: numeric SQL type.  00377's own header warns that a malformed value "would
#: raise on cast and dark-fail the WHOLE view for every row" -- every
#: deliverable's telemetry, not just the offending one.  So every value this
#: module writes under one of these keys must be a JSON NUMBER or the key must
#: be absent: never ``""``, never a stringified number, never a bool, never a
#: non-finite float.  :func:`assert_present_manifest_is_cast_safe` is the guard
#: and it is the cheapest possible insurance against dark-failing a prod view.
PRESENT_NUMERIC_CAST_KEYS: tuple[str, ...] = (
    "gaussian_count",
    "train_seconds",
    "vram_peak_mb",
    "mesh_vertices",
    "sfm_residual_pct",
    "masked_frames",
    "splat_bytes",
    "mesh_bytes",
)

#: The two ``present`` keys the same view reads as TEXT.  Listed for
#: completeness -- they carry no cast hazard -- so the set of view-visible keys
#: is written down once, here, rather than inferred.
PRESENT_TEXT_KEYS: tuple[str, ...] = ("splat_format", "refine_engine")

#: Keys Refine must NOT write, whatever their type.  ``sfm_residual_pct`` has no
#: defined meaning for this stage: the refine evidence reports
#: ``reprojection_rmse_px_after``, which is PIXELS, not a percentage, and
#: converting one to the other would invent a denominator nobody has authority
#: to choose.  Ruling R-D is open; until it is made the key stays absent, which
#: reads as NULL in the view -- the honest value for "not defined here".
PRESENT_KEYS_REFINE_MUST_NOT_WRITE: tuple[str, ...] = ("sfm_residual_pct",)

#: The Present lifecycle values a refine record may be written over.  00376
#: defines ``ready`` as *the Present layer is ready* and pairs it with
#: ``presented_at``; Refine completing is neither, so the record advances to
#: ``refining`` and stops.  Writing forward-only against this set is what makes
#: a replay unable to regress a version Fuse or Splat has already moved on.
PRESENT_STATUS_REFINE_MAY_ADVANCE: tuple[str, ...] = ("pending", "refining")
PRESENT_STATUS_AFTER_REFINE = "refining"


def _refuse(message: str, code: str) -> PermanentError:
    return PermanentError(message, token=code)


# ---------------------------------------------------------------------------
# Canonical JSON -- an INDEPENDENT implementation
# ---------------------------------------------------------------------------
def canonical_json_bytes(value: object) -> bytes:
    """Re-encode ``value`` the way the runner encodes every published document.

    Written out here rather than imported from ``refine_publisher``: the whole
    point of this module is that two implementations read one artifact set, and
    a shared private helper would make the canonical-form check a tautology.
    The FORM is pinned by the artifacts themselves -- sorted keys, no spaces,
    UTF-8, no NaN/Infinity, one trailing newline -- so a drift between the two
    encoders reddens :func:`verify_published_tree` against a real tree, which is
    exactly the signal a cross-check is supposed to give.
    """

    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )
    return (encoded + "\n").encode("utf-8")


def _no_duplicate_keys(pairs: Sequence[tuple[str, Any]]) -> dict[str, Any]:
    """``object_pairs_hook`` that refuses a repeated key.

    ``json.loads`` keeps the LAST value for a duplicated key and says nothing.
    A manifest carrying ``"status":"complete"`` twice with different values
    would parse cleanly, re-encode to a form that differs from the file, and be
    caught by the byte-equality check below -- but only by accident of the
    re-encode.  Refusing here names the actual defect.
    """

    seen: dict[str, Any] = {}
    for key, value in pairs:
        if key in seen:
            raise ValueError(f"duplicate JSON key {key!r}")
        seen[key] = value
    return seen


# ---------------------------------------------------------------------------
# The verified tree
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class DeliveryArtifact:
    """One of the eleven, bound to the bytes on disk that carry it."""

    name: str
    path: Path
    object_key: str
    sha256: str
    size_bytes: int
    transport_content_type: str
    semantic_media_type: str

    def record_row(self) -> dict[str, Any]:
        return {
            "key": self.object_key,
            "name": self.name,
            "sha256": self.sha256,
            "sizeBytes": self.size_bytes,
            "semanticMediaType": self.semantic_media_type,
        }


@dataclass(frozen=True)
class VerifiedDelivery:
    """An eleven-artifact tree that has passed every content refusal."""

    prefix: str
    manifest: DeliveryArtifact
    artifacts: tuple[DeliveryArtifact, ...]
    document: Mapping[str, Any]
    user_id: str
    scan_id: str
    room_file_id: str
    room_file_version: int

    @property
    def all_artifacts(self) -> tuple[DeliveryArtifact, ...]:
        """Publication order: the ten data artifacts, then the manifest.

        Manifest-last is the commit marker, and it is the same order
        ``RefinePublisher`` uses.  A reader that finds the manifest finds every
        object it names.
        """

        return (*self.artifacts, self.manifest)

    @property
    def largest(self) -> DeliveryArtifact:
        return max(self.all_artifacts, key=lambda artifact: artifact.size_bytes)

    @property
    def total_bytes(self) -> int:
        return sum(artifact.size_bytes for artifact in self.all_artifacts)

    @property
    def loop_consistency_advisory(self) -> str:
        evidence = self.document["refinementEvidence"]
        return str(evidence["loopConsistencyAdvisory"])


def _hash_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
            size += len(block)
    return digest.hexdigest(), size


def _walk_regular_files(root: Path) -> list[tuple[str, Path]]:
    """Every regular file under ``root``, refusing anything that is not one.

    ``os.walk(followlinks=False)`` does not DESCEND through a symlinked
    directory but still lists it, and a symlinked FILE is indistinguishable from
    a real one in ``filenames``.  Both are refused by ``lstat`` here rather than
    by ``open`` later, because by the time ``open`` follows a link the bytes
    hashed are not the bytes the name promised.
    """

    found: list[tuple[str, Path]] = []
    for current, directories, filenames in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in sorted(directories):
            entry = current_path / name
            if entry.is_symlink():
                raise _refuse(
                    "published tree contains a symlinked directory: "
                    f"{entry.relative_to(root).as_posix()}",
                    TREE_SHAPE_CODE,
                )
        for name in sorted(filenames):
            entry = current_path / name
            relative = entry.relative_to(root).as_posix()
            metadata = os.lstat(entry)
            if not stat.S_ISREG(metadata.st_mode):
                raise _refuse(
                    f"published tree entry is not a regular file: {relative}",
                    TREE_SHAPE_CODE,
                )
            found.append((relative, entry))
    return sorted(found)


def _strict_mapping(document: Any, label: str, code: str) -> Mapping[str, Any]:
    if type(document) is not dict:
        raise _refuse(f"{label} is not a JSON object", code)
    return document


def verify_published_tree(
    published_root: Path,
    *,
    user_id: str,
    scan_id: str,
    room_file_id: str,
    room_file_version: int,
    bucket_object_limit_bytes: int = BUCKET_OBJECT_LIMIT_BYTES,
) -> VerifiedDelivery:
    """Re-read a published scratch tree from scratch and refuse anything off.

    NINE REFUSALS, ALL BEFORE ANY NETWORK CALL, in the order a defect would be
    cheapest to find:

    1. Exactly eleven regular files, no symlinks, no extras, one directory.
    2. The TREE-derived key equals ``canonical_present_manifest_keys(...)`` --
       so a mistyped ``--scan-id`` gets a legible refusal instead of a
       correctly-formed publication under the wrong prefix.
    3. The manifest re-encoded canonically is BYTE-EQUAL to the file, and a
       duplicated JSON key is refused.
    4. ``schemaVersion == 1``, ``status == "complete"`` and
       ``productionEnablement == "disabled"`` -- the published bytes assert
       their own posture, and it costs one comparison to check they still do.
    5. ``identity.*`` equals the four operator-supplied values.
    6. The ledger's names, plus the manifest, are exactly the eleven -- derived
       from ``PUBLISHED_REFINE_ARTIFACT_NAMES``, not restated here.
    7. Every byte: ``st_size == sizeBytes`` and a full streaming ``sha256``
       match.  THIS is where the manifest stops being a claim.
    8. Every object fits under the bucket's per-object ceiling.
    9. ``loopConsistencyAdvisory`` is a non-blank string -- a delivery that
       would strip the loop numbers R123 made advisory refuses instead.

    A tenth guard, folded into 6: each transport content type must be one the
    bucket admits, so a type change cannot be discovered as a 400 halfway
    through publication.
    """

    if not isinstance(published_root, Path):
        raise _refuse("published root must be a Path", TREE_SHAPE_CODE)
    if published_root.is_symlink():
        raise _refuse("published root must not be a symlink", TREE_SHAPE_CODE)
    try:
        root = published_root.resolve(strict=True)
    except OSError as exc:
        raise _refuse(f"published root is unavailable: {exc}", TREE_SHAPE_CODE) from exc
    if not root.is_dir():
        raise _refuse("published root must be a directory", TREE_SHAPE_CODE)

    # There is deliberately NO local pre-check on ``room_file_version`` here.
    # ``canonical_present_manifest_keys`` -> ``_positive_int`` already refuses a
    # bool, a non-int and anything <= 0, and the ``except`` below gives that
    # refusal this module's token.  A local copy of the same three clauses
    # survived a mutation sweep -- no input could reach it -- which is the
    # definition of a clause that is not doing anything.
    try:
        canonical_manifest_key = canonical_present_manifest_keys(
            user_id,
            scan_id,
            room_file_version,
        )["refine"]
    except (AdapterError, TypeError, ValueError) as exc:
        raise _refuse(
            f"delivery identity is not a canonical manifest key: {exc}",
            IDENTITY_CODE,
        ) from exc
    canonical_prefix = canonical_manifest_key.removesuffix(f"/{REFINE_MANIFEST_NAME}")

    # ── 1. exactly eleven regular files under exactly one directory ──────────
    entries = _walk_regular_files(root)
    if len(entries) != len(PUBLISHED_REFINE_ARTIFACT_NAMES):
        raise _refuse(
            f"published tree holds {len(entries)} regular files, expected "
            f"{len(PUBLISHED_REFINE_ARTIFACT_NAMES)}: "
            + ", ".join(relative for relative, _ in entries),
            TREE_SHAPE_CODE,
        )
    directories = {relative.rsplit("/", 1)[0] for relative, _ in entries if "/" in relative}
    if len(directories) != 1 or any("/" not in relative for relative, _ in entries):
        raise _refuse(
            "published tree must hold every artifact under one refine directory",
            TREE_SHAPE_CODE,
        )
    derived_prefix = directories.pop()

    # ── 2. the tree-derived key IS the canonical key ─────────────────────────
    if derived_prefix != canonical_prefix:
        raise _refuse(
            "published tree prefix does not match the supplied identity: tree "
            f"carries {derived_prefix!r}, the identity derives {canonical_prefix!r}",
            PREFIX_IDENTITY_CODE,
        )

    by_name = {relative.rsplit("/", 1)[1]: path for relative, path in entries}
    # NOT redundant with the count check above, and the difference is a renamed
    # file: eleven files under one directory whose NAMES are not the eleven pass
    # the count, and the ledger check below reads the MANIFEST's names, not the
    # tree's -- so without this the first ``by_name[name]`` lookup in refusal 7
    # would be a bare ``KeyError`` three frames deeper instead of a refusal.
    if tuple(sorted(by_name)) != PUBLISHED_REFINE_ARTIFACT_NAMES:
        raise _refuse(
            "published tree names are not the canonical eleven: "
            + ", ".join(sorted(by_name)),
            TREE_SHAPE_CODE,
        )

    # ── 3. the manifest is canonical, and parses without duplicate keys ──────
    manifest_path = by_name[REFINE_MANIFEST_NAME]
    manifest_bytes = manifest_path.read_bytes()
    try:
        document = json.loads(
            manifest_bytes.decode("utf-8"),
            object_pairs_hook=_no_duplicate_keys,
        )
    except (UnicodeDecodeError, ValueError) as exc:
        raise _refuse(
            f"refine manifest cannot be parsed: {exc}",
            MANIFEST_NONCANONICAL_CODE,
        ) from exc
    document = _strict_mapping(document, "refine manifest", MANIFEST_NONCANONICAL_CODE)
    try:
        reencoded = canonical_json_bytes(document)
    except (TypeError, ValueError) as exc:
        raise _refuse(
            f"refine manifest is not canonically encodable: {exc}",
            MANIFEST_NONCANONICAL_CODE,
        ) from exc
    if reencoded != manifest_bytes:
        raise _refuse(
            "refine manifest bytes are not the canonical encoding of their own "
            "document",
            MANIFEST_NONCANONICAL_CODE,
        )

    # ── 4. the published bytes assert their own posture ──────────────────────
    if (
        type(document.get("schemaVersion")) is not int
        or document["schemaVersion"] != 1
        or document.get("status") != "complete"
        or document.get("productionEnablement") != "disabled"
    ):
        raise _refuse(
            "refine manifest is not the disabled canonical contract "
            f"(schemaVersion={document.get('schemaVersion')!r}, "
            f"status={document.get('status')!r}, "
            f"productionEnablement={document.get('productionEnablement')!r})",
            POSTURE_CODE,
        )

    # ── 5. identity equals the four operator-supplied values ─────────────────
    identity = _strict_mapping(document.get("identity"), "manifest identity", IDENTITY_CODE)
    expected_identity = {
        "userId": user_id,
        "scanId": scan_id,
        "roomFileId": room_file_id,
        "roomFileVersion": room_file_version,
    }
    for key, expected in expected_identity.items():
        actual = identity.get(key)
        if actual != expected or type(actual) is not type(expected):
            raise _refuse(
                f"manifest identity.{key} is {actual!r}, operator supplied "
                f"{expected!r}",
                IDENTITY_CODE,
            )

    # ── 6. the ledger names, plus the manifest, are exactly the eleven ───────
    ledger = document.get("artifacts")
    if type(ledger) is not list:
        raise _refuse("manifest artifact ledger is not a list", LEDGER_CODE)
    rows: dict[str, Mapping[str, Any]] = {}
    for index, row in enumerate(ledger):
        row = _strict_mapping(row, f"manifest artifact ledger row {index}", LEDGER_CODE)
        if set(row) != {
            "name",
            "transportContentType",
            "semanticMediaType",
            "sha256",
            "sizeBytes",
        }:
            raise _refuse(
                f"manifest artifact ledger row {index} has the wrong key set: "
                + ", ".join(sorted(row)),
                LEDGER_CODE,
            )
        name = row["name"]
        if type(name) is not str or name in rows:
            raise _refuse(
                f"manifest artifact ledger row {index} names {name!r}",
                LEDGER_CODE,
            )
        if (
            type(row["sha256"]) is not str
            or len(row["sha256"]) != 64
            or any(character not in "0123456789abcdef" for character in row["sha256"])
            or type(row["sizeBytes"]) is not int
            or row["sizeBytes"] < 0
            or type(row["transportContentType"]) is not str
            or type(row["semanticMediaType"]) is not str
        ):
            raise _refuse(
                f"manifest artifact ledger row {index} ({name!r}) has invalid "
                "metadata",
                LEDGER_CODE,
            )
        if row["transportContentType"] not in ALLOWED_TRANSPORT_CONTENT_TYPES:
            raise _refuse(
                f"artifact {name!r} declares transport content type "
                f"{row['transportContentType']!r}, which the room-scans bucket "
                "does not admit",
                TRANSPORT_CODE,
            )
        rows[name] = row
    if tuple(sorted((*rows, REFINE_MANIFEST_NAME))) != PUBLISHED_REFINE_ARTIFACT_NAMES:
        raise _refuse(
            "manifest artifact ledger plus the manifest is not the canonical "
            "eleven: " + ", ".join(sorted((*rows, REFINE_MANIFEST_NAME))),
            LEDGER_CODE,
        )

    # ── 7. every byte: size AND a full streaming digest ──────────────────────
    artifacts: list[DeliveryArtifact] = []
    for name in sorted(rows):
        row = rows[name]
        path = by_name[name]
        measured_size = os.stat(path).st_size
        if measured_size != row["sizeBytes"]:
            raise _refuse(
                f"artifact {name!r} is {measured_size} bytes on disk, the "
                f"manifest claims {row['sizeBytes']}",
                DIGEST_CODE,
            )
        digest, streamed = _hash_file(path)
        if streamed != row["sizeBytes"] or digest != row["sha256"]:
            raise _refuse(
                f"artifact {name!r} hashes to {digest} over {streamed} bytes, "
                f"the manifest claims {row['sha256']} over {row['sizeBytes']}",
                DIGEST_CODE,
            )
        artifacts.append(
            DeliveryArtifact(
                name=name,
                path=path,
                object_key=f"{canonical_prefix}/{name}",
                sha256=digest,
                size_bytes=streamed,
                transport_content_type=row["transportContentType"],
                semantic_media_type=row["semanticMediaType"],
            )
        )
    manifest_digest = hashlib.sha256(manifest_bytes).hexdigest()
    manifest_artifact = DeliveryArtifact(
        name=REFINE_MANIFEST_NAME,
        path=manifest_path,
        object_key=canonical_manifest_key,
        sha256=manifest_digest,
        size_bytes=len(manifest_bytes),
        transport_content_type="application/json",
        semantic_media_type="application/json",
    )
    if os.stat(manifest_path).st_size != len(manifest_bytes):
        raise _refuse(
            "refine manifest changed size between read and stat",
            DIGEST_CODE,
        )

    # ── 8. every object fits under the bucket's per-object ceiling ───────────
    for artifact in (*artifacts, manifest_artifact):
        if artifact.size_bytes > bucket_object_limit_bytes:
            raise _refuse(
                f"artifact {artifact.name!r} is {artifact.size_bytes} bytes, "
                f"over the room-scans per-object limit of "
                f"{bucket_object_limit_bytes}",
                CAPACITY_CODE,
            )

    # ── 9. the advisory R123 made the only loop report is present ────────────
    evidence = _strict_mapping(
        document.get("refinementEvidence"),
        "manifest refinementEvidence",
        ADVISORY_CODE,
    )
    advisory = evidence.get("loopConsistencyAdvisory")
    if type(advisory) is not str or not advisory.strip():
        raise _refuse(
            "refine manifest carries no loop-consistency advisory; R123 made "
            "that string the only report of the loop comparables and a "
            "delivery that strips it publishes a verdict nobody can read",
            ADVISORY_CODE,
        )

    return VerifiedDelivery(
        prefix=canonical_prefix,
        manifest=manifest_artifact,
        artifacts=tuple(artifacts),
        document=document,
        user_id=user_id,
        scan_id=scan_id,
        room_file_id=room_file_id,
        room_file_version=room_file_version,
    )


# ---------------------------------------------------------------------------
# Capacity preflight -- the second half of refusal 8
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class CapacityPreflight:
    work_dir: str
    free_bytes: int | None
    required_bytes: int
    probe_error: str | None

    @property
    def sufficient(self) -> bool:
        return self.free_bytes is not None and self.free_bytes >= self.required_bytes


def preflight_work_dir_capacity(
    verified: VerifiedDelivery,
    work_dir: str,
    *,
    require: bool,
) -> CapacityPreflight:
    """Require WORK_DIR to hold one more copy of the largest artifact.

    ``StorageClient.publish_immutable_descriptor`` stages every upload into a
    private unlinked temporary under ``settings.work_dir`` before a single byte
    goes out, so the spool costs 1x the largest artifact in extra disk and a
    full filesystem is an ``OSError`` mid-publication rather than a refusal.

    ``require`` is the commit flag.  A dry-run on a machine with no
    ``/var/lib/patina/scan-work`` reports the probe as unavailable and carries
    on, because it is not going to write anything; a commit refuses, because it
    is.
    """

    required = verified.largest.size_bytes
    try:
        statistics = os.statvfs(work_dir)
    except OSError as exc:
        preflight = CapacityPreflight(
            work_dir=work_dir,
            free_bytes=None,
            required_bytes=required,
            probe_error=str(exc),
        )
        if require:
            raise _refuse(
                f"work dir {work_dir!r} cannot be probed for free space, and "
                "every upload is staged there first: " + str(exc),
                CAPACITY_CODE,
            ) from exc
        return preflight
    free = statistics.f_bavail * statistics.f_frsize
    preflight = CapacityPreflight(
        work_dir=work_dir,
        free_bytes=free,
        required_bytes=required,
        probe_error=None,
    )
    if require and not preflight.sufficient:
        raise _refuse(
            f"work dir {work_dir!r} has {free} bytes free; staging the largest "
            f"artifact ({verified.largest.name!r}) needs {required}",
            CAPACITY_CODE,
        )
    return preflight


# ---------------------------------------------------------------------------
# The record
# ---------------------------------------------------------------------------
def _engine_duration_ms(document: Mapping[str, Any]) -> int | None:
    telemetry = document.get("engineTelemetry")
    if type(telemetry) is not dict:
        return None
    value = telemetry.get("durationMs")
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _engine_vram_peak_mb(document: Mapping[str, Any]) -> int | None:
    telemetry = document.get("engineTelemetry")
    if type(telemetry) is not dict:
        return None
    value = telemetry.get("vramPeakMb")
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _selected_engine(document: Mapping[str, Any]) -> str | None:
    engine = document.get("engine")
    if type(engine) is not dict:
        return None
    value = engine.get("selected")
    return value if isinstance(value, str) and value else None


def build_delivery_record(
    verified: VerifiedDelivery,
    *,
    bucket: str,
    created_keys: Sequence[str],
    replayed_keys: Sequence[str],
) -> dict[str, Any]:
    """The one record a consumer can read with a single ``select``.

    BARE OBJECT KEYS, NOT URLS.  R122 repaired columns that carried a
    non-resolving ``/object/public/`` form for a private bucket, and I105
    recorded that ``stages/drawings.py`` still carries it.  This is not going to
    be the eleventh instance of a known defect, and it costs the portal nothing:
    ``publicUrlToPath`` passes a scheme-less value through unchanged, so bare
    keys flow into the existing signing path with zero portal changes.

    THE ADVISORY IS DUPLICATED INTO THE ROW ON PURPOSE.  R123 requires the loop
    numbers be reported MORE prominently than before, and I106 records that
    nothing reads the string -- "it exists to be read".  In the row it is one
    ``select`` away with no Storage round-trip, which is the minimum condition
    for a consumer to ever exist.  It is copied VERBATIM; paraphrasing it into
    "loop consistency good/poor" would launder a number nobody has authority to
    interpret.
    """

    evidence = verified.document["refinementEvidence"]
    return {
        "schemaVersion": DELIVERY_SCHEMA_VERSION,
        "contract": DELIVERY_CONTRACT,
        "bucket": bucket,
        "prefix": verified.prefix,
        "manifestKey": verified.manifest.object_key,
        "manifestSha256": verified.manifest.sha256,
        "artifacts": [
            artifact.record_row() for artifact in verified.all_artifacts
        ],
        "createdKeys": list(created_keys),
        "replayedKeys": list(replayed_keys),
        "engine": {
            "selected": _selected_engine(verified.document),
            "durationMs": _engine_duration_ms(verified.document),
        },
        "verdict": {
            "refinementEvidenced": evidence.get("refinementEvidenced"),
            "absoluteAccuracyCertified": evidence.get("absoluteAccuracyCertified"),
            "verdictReason": evidence.get("verdictReason"),
            "loopConsistencyAdvisory": verified.loop_consistency_advisory,
        },
        # The posture the published bytes assert, copied into the row so a
        # reader who never opens Storage still sees it.
        "posture": {
            "productionEnablement": verified.document["productionEnablement"],
            "refineDeliveryQualified": REFINE_DELIVERY_QUALIFIED,
            "refineDeliveryStageRegistered": REFINE_DELIVERY_STAGE_REGISTERED,
            "stageRegistered": False,
            "enqueued": False,
        },
    }


#: The fields of a delivery record that are OBSERVATIONS of one delivery rather
#: than properties of the artifact set.  A replay legitimately produces
#: different values for these (eleven replays where the first run had eleven
#: creations), so they are excluded from the divergence comparison -- and,
#: because an identical replay writes nothing at all, the row keeps the FIRST
#: delivery's observation rather than being rewritten with the latest.
RECORD_OBSERVATION_FIELDS: tuple[str, ...] = ("createdKeys", "replayedKeys")


def record_core(record: Mapping[str, Any]) -> dict[str, Any]:
    """The part of a delivery record that immutable artifacts make immutable."""

    return {
        key: value
        for key, value in record.items()
        if key not in RECORD_OBSERVATION_FIELDS
    }


def assert_present_manifest_is_cast_safe(present: Mapping[str, Any]) -> None:
    """Refuse any ``present`` document that would dark-fail ``scan_present_stats``.

    00377 casts eight ``present`` keys to ``bigint``/``numeric``/``int`` and its
    own header warns that ONE malformed value blanks the view FOR EVERY ROW --
    not just for the deliverable that carries it.  The view has no
    ``NULLIF(...,'')`` guard (adding one would be a DDL change, and 00377
    deliberately flagged rather than fixed it), so the writer is the guard.

    An ABSENT key is fine: ``present->>'key'`` yields SQL NULL and
    ``NULL::numeric`` is safe.  What is not fine is ``""``, a stringified
    number, a bool, or a non-finite float.
    """

    for key in PRESENT_NUMERIC_CAST_KEYS:
        if key not in present:
            continue
        value = present[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise _refuse(
                f"present.{key} is {value!r}; scan_present_stats casts it to a "
                "numeric SQL type and one malformed value dark-fails the whole "
                "view for every deliverable",
                POSTURE_CODE,
            )
        if not math.isfinite(float(value)):
            raise _refuse(
                f"present.{key} is {value!r}, which is not a finite JSON number",
                POSTURE_CODE,
            )


def build_present_patch(
    verified: VerifiedDelivery,
    record: Mapping[str, Any],
) -> dict[str, Any]:
    """The keys this delivery contributes to ``room_files.present``.

    ``refine_engine`` is a TEXT column in ``scan_present_stats`` and is what
    lights the whole 00377 surface for this deliverable.  ``vram_peak_mb`` is
    written only when the engine reported one, and only ever as a JSON NUMBER.
    ``sfm_residual_pct`` is not written at all (R-D open; see
    :data:`PRESENT_KEYS_REFINE_MUST_NOT_WRITE`).
    """

    patch: dict[str, Any] = {"refine": dict(record)}
    engine = _selected_engine(verified.document)
    if engine is not None:
        patch["refine_engine"] = engine
    vram = _engine_vram_peak_mb(verified.document)
    if vram is not None:
        patch["vram_peak_mb"] = vram
    for forbidden in PRESENT_KEYS_REFINE_MUST_NOT_WRITE:
        if forbidden in patch:  # pragma: no cover - defensive, nothing sets it
            raise _refuse(
                f"refine must not write present.{forbidden}",
                POSTURE_CODE,
            )
    assert_present_manifest_is_cast_safe(patch)
    return patch


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class DeliveryReceipt:
    committed: bool
    created_keys: tuple[str, ...]
    replayed_keys: tuple[str, ...]
    record: dict[str, Any]
    record_outcome: str
    present_status: str | None
    delivery_ms: int


def _open_borrowed(path: Path) -> int:
    flags = os.O_RDONLY
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    return os.open(path, flags)


def publish_verified_tree(
    verified: VerifiedDelivery,
    storage: StorageClient,
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Upload the eleven create-only, manifest last, and report what happened.

    ``StorageClient.publish_immutable_descriptor`` is reused UNCHANGED.  It
    already gives every property this step needs and none of them is worth a
    second implementation: owner-key assertion (the RLS-equivalent for a service
    key, since the service role bypasses storage RLS), a descriptor-identity
    check so the bytes uploaded are the inode that was measured, digest+size
    binding to the manifest, create-only ``x-upsert: false``, and a duplicate
    path that VERIFIES the existing bytes match before returning ``False``.
    Replay is therefore idempotent by construction rather than by convention.
    """

    created: list[str] = []
    replayed: list[str] = []
    for artifact in verified.all_artifacts:
        descriptor = _open_borrowed(artifact.path)
        try:
            metadata = os.fstat(descriptor)
            was_created = storage.publish_immutable_descriptor(
                artifact.object_key,
                descriptor,
                artifact.transport_content_type,
                expected_sha256=artifact.sha256,
                expected_size=artifact.size_bytes,
                user_id=verified.user_id,
                scan_id=verified.scan_id,
                expected_identity=(metadata.st_dev, metadata.st_ino),
            )
        finally:
            os.close(descriptor)
        (created if was_created else replayed).append(artifact.object_key)
    return tuple(created), tuple(replayed)


def deliver(
    verified: VerifiedDelivery,
    *,
    storage: StorageClient | None,
    db: DbClient | None,
    telemetry: Telemetry | None,
    bucket: str,
    commit: bool,
) -> DeliveryReceipt:
    """Publish, then record.  ``commit=False`` touches nothing at all.

    ORDERING IS DELIBERATE: publish all eleven (manifest last), THEN write the
    record.  A failed record write leaves immutable, idempotently republishable
    artifacts behind -- re-running replays all eleven and retries the record --
    so there is no partial state that LIES.  The reverse order would leave a row
    pointing at objects that do not exist.

    Dry-run is the default and it is not a simulation: it performs zero writes
    because it makes zero calls, which a counting double proves rather than a
    comment.
    """

    started = time.monotonic()
    if not commit:
        record = build_delivery_record(
            verified,
            bucket=bucket,
            created_keys=(),
            replayed_keys=(),
        )
        # Built even in dry-run so the cast guard runs on the exact document a
        # commit would write.  Costs nothing and moves the 00377 hazard to the
        # cheapest possible place to find it.
        build_present_patch(verified, record)
        return DeliveryReceipt(
            committed=False,
            created_keys=(),
            replayed_keys=(),
            record=record,
            record_outcome="not-attempted",
            present_status=None,
            delivery_ms=int((time.monotonic() - started) * 1000),
        )

    if storage is None or db is None or telemetry is None:
        raise _refuse(
            "a committing delivery needs storage, database and telemetry "
            "collaborators",
            TREE_SHAPE_CODE,
        )

    # The record NAMES a bucket and the client WRITES to one.  They come from
    # the same ``Settings`` on every path that exists, and that is exactly why
    # the mismatch would never be noticed: the row would point, resolvably and
    # wrongly, at a bucket nobody published to.  One comparison turns a latent
    # lie into a refusal.
    if storage.bucket != bucket:
        raise _refuse(
            f"the record would name bucket {bucket!r} while the storage client "
            f"writes to {storage.bucket!r}",
            BUCKET_MISMATCH_CODE,
        )
    created, replayed = publish_verified_tree(verified, storage)
    record = build_delivery_record(
        verified,
        bucket=bucket,
        created_keys=created,
        replayed_keys=replayed,
    )
    patch = build_present_patch(verified, record)
    outcome = db.record_room_file_refine(
        verified.room_file_id,
        scan_id=verified.scan_id,
        version=verified.room_file_version,
        present_patch=patch,
        present_status=PRESENT_STATUS_AFTER_REFINE,
        allowed_present_status=PRESENT_STATUS_REFINE_MAY_ADVANCE,
        record_observation_fields=RECORD_OBSERVATION_FIELDS,
    )
    delivery_ms = int((time.monotonic() - started) * 1000)

    # TWO events, both stage='refine', and they carry different clocks on
    # purpose.  'refine.succeeded' carries the ENGINE's durationMs, which is what
    # lights scan_pipeline_runs.refine_ms (00377 reads exactly that event); it is
    # a reconstruction time.  'refine.published' carries the DELIVERY wall time.
    # Conflating them would put an upload time in a column labelled
    # reconstruction, and nobody reading that column would know.
    engine_ms = _engine_duration_ms(verified.document)
    telemetry.emit(
        verified.scan_id,
        "refine",
        "refine.succeeded",
        status="succeeded",
        room_file_id=verified.room_file_id,
        duration_ms=engine_ms,
        detail={
            "engine": _selected_engine(verified.document),
            "roomFileVersion": verified.room_file_version,
            "refinementEvidenced": record["verdict"]["refinementEvidenced"],
            "absoluteAccuracyCertified": record["verdict"][
                "absoluteAccuracyCertified"
            ],
            "loopConsistencyAdvisory": verified.loop_consistency_advisory,
        },
    )
    telemetry.emit(
        verified.scan_id,
        "refine",
        "refine.published",
        status="succeeded",
        room_file_id=verified.room_file_id,
        duration_ms=delivery_ms,
        detail={
            "bucket": bucket,
            "prefix": verified.prefix,
            "manifestKey": verified.manifest.object_key,
            "manifestSha256": verified.manifest.sha256,
            "createdCount": len(created),
            "replayedCount": len(replayed),
            "totalBytes": verified.total_bytes,
            "recordOutcome": outcome,
            "loopConsistencyAdvisory": verified.loop_consistency_advisory,
        },
    )
    return DeliveryReceipt(
        committed=True,
        created_keys=created,
        replayed_keys=replayed,
        record=record,
        record_outcome=outcome,
        present_status=PRESENT_STATUS_AFTER_REFINE if outcome == "written" else None,
        delivery_ms=delivery_ms,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
_BANNER = (
    "patina refine delivery -- publishes to Supabase Storage under --commit.\n"
    "This is not a stage: it claims no queue task, registers no handler, and\n"
    "enqueues nothing. It reconstructs nothing either -- it re-verifies an\n"
    "already-published local scratch tree and uploads exactly those bytes.\n"
    "Dry-run is the DEFAULT and performs zero reads and zero writes.\n"
)


def build_argument_parser() -> argparse.ArgumentParser:
    """The CLI surface, extracted so its defaults are falsifiable.

    ``--commit`` is required to write.  There is deliberately no ``--force``, no
    ``--overwrite`` and no way to name a bucket other than the configured one:
    every object is create-only, and an operator who wants to replace published
    bytes is asking for something immutability does not offer.
    """

    parser = argparse.ArgumentParser(
        prog="python -m patina_scan_worker.refine_delivery",
        description=_BANNER,
    )
    parser.add_argument("--published-dir", required=True)
    parser.add_argument("--user-id", required=True)
    # ``--scan-id`` is room_scans.id and governs the PUBLICATION prefix
    # room_file/{user}/{scan}/v{n}/refine/. There is no --room-id here because
    # delivery never touches the READ prefix -- it reads no bundle.
    parser.add_argument("--scan-id", required=True)
    parser.add_argument("--room-file-id", required=True)
    parser.add_argument("--room-file-version", type=int, default=1)
    parser.add_argument(
        "--commit",
        action="store_true",
        help=(
            "actually publish to Storage and write the room_files record; "
            "omitted, this run reads and writes nothing"
        ),
    )
    return parser


def build_report(
    verified: VerifiedDelivery,
    receipt: DeliveryReceipt,
    capacity: CapacityPreflight,
    *,
    bucket: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": DELIVERY_SCHEMA_VERSION,
        "contract": DELIVERY_REPORT_CONTRACT,
        "committed": receipt.committed,
        "bucket": bucket,
        "prefix": verified.prefix,
        "manifestKey": verified.manifest.object_key,
        "manifestSha256": verified.manifest.sha256,
        "artifactCount": len(verified.all_artifacts),
        "totalBytes": verified.total_bytes,
        "largestArtifactName": verified.largest.name,
        "largestArtifactBytes": verified.largest.size_bytes,
        "bucketObjectLimitBytes": BUCKET_OBJECT_LIMIT_BYTES,
        "workDir": capacity.work_dir,
        "workDirFreeBytes": capacity.free_bytes,
        "workDirProbeError": capacity.probe_error,
        "createdKeys": list(receipt.created_keys),
        "replayedKeys": list(receipt.replayed_keys),
        "recordOutcome": receipt.record_outcome,
        "presentStatus": receipt.present_status,
        "deliveryMs": receipt.delivery_ms,
        "loopConsistencyAdvisory": verified.loop_consistency_advisory,
        "record": receipt.record,
    }


def main(argv: Sequence[str] | None = None) -> int:
    """Deliver one already-published tree.

    There is no console-script entry for this in ``pyproject.toml``, on purpose
    and for the same reason ``refine_lifecycle`` has none: the only way to reach
    it is ``python -m patina_scan_worker.refine_delivery``, typed by a person.
    """

    parser = build_argument_parser()
    arguments = parser.parse_args(argv)
    sys.stderr.write(_BANNER)

    try:
        settings = settings_from_env()
    except ConfigError as exc:
        sys.stderr.write(f"config error: {exc}\n")
        return 2

    try:
        verified = verify_published_tree(
            Path(arguments.published_dir),
            user_id=arguments.user_id,
            scan_id=arguments.scan_id,
            room_file_id=arguments.room_file_id,
            room_file_version=int(arguments.room_file_version),
        )
        capacity = preflight_work_dir_capacity(
            verified,
            settings.work_dir,
            require=bool(arguments.commit),
        )
    except PermanentError as exc:
        sys.stderr.write(f"{exc.token}: {exc}\n")
        return 3

    if not arguments.commit:
        receipt = deliver(
            verified,
            storage=None,
            db=None,
            telemetry=None,
            bucket=settings.room_scans_bucket,
            commit=False,
        )
        json.dump(
            build_report(
                verified,
                receipt,
                capacity,
                bucket=settings.room_scans_bucket,
            ),
            sys.stdout,
            indent=2,
            sort_keys=True,
        )
        sys.stdout.write("\n")
        sys.stderr.write(
            "DRY RUN: nothing was read from and nothing was written to "
            f"{settings.supabase_url}. Re-run with --commit to publish.\n"
        )
        return 0

    with build_session(settings) as session:
        try:
            receipt = deliver(
                verified,
                storage=StorageClient(session, settings),
                db=DbClient(session, settings),
                telemetry=Telemetry(session, settings),
                bucket=settings.room_scans_bucket,
                commit=True,
            )
        except PermanentError as exc:
            sys.stderr.write(f"{exc.token}: {exc}\n")
            return 3
    report = build_report(
        verified,
        receipt,
        capacity,
        bucket=settings.room_scans_bucket,
    )
    json.dump(report, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    if receipt.record_outcome == "skipped":
        sys.stderr.write(
            "PUBLISHED WITHOUT A RECORD: the room_files version has already "
            "moved past the Present states refine may advance, so the record "
            "was not written. The artifacts are immutable and republishable; "
            "the row is not this delivery's to write.\n"
        )
        return 4
    return 0


if __name__ == "__main__":  # pragma: no cover - manual entry point
    raise SystemExit(main())
