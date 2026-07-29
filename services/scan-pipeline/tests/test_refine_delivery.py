"""Delivery of an already-published Refine scratch tree.

EVERY FIXTURE HERE IS A REAL PUBLISHED TREE.  ``_published_tree`` drives the
SHIPPED runner and the SHIPPED publisher into ``LocalScratchStorageSink``, which
is the exact path ``refine_lifecycle`` takes, and the resulting eleven files are
what the validator reads.  That matters: a hand-built fixture would let the
validator and the artifact set agree because one was written from the other,
which is precisely the agreement a second reading is supposed to be unable to
manufacture.

Each refusal below is then CONSTRUCTED by changing ONE variable against that
real tree -- a twelfth file, one flipped byte, a symlink, one manifest field --
so the test names the defect it introduced rather than matching prose.
"""

from __future__ import annotations

import ast
import json
import os
import pathlib
import re
import shutil
from pathlib import Path
from typing import Any

import httpx
import pytest

import patina_scan_worker.refine_delivery as delivery_module
from patina_scan_worker.config import Settings
from patina_scan_worker.db import DbClient
from patina_scan_worker.errors import PermanentError
from patina_scan_worker.refine_delivery import (
    ALLOWED_TRANSPORT_CONTENT_TYPES,
    BUCKET_OBJECT_LIMIT_BYTES,
    PRESENT_KEYS_REFINE_MUST_NOT_WRITE,
    PRESENT_NUMERIC_CAST_KEYS,
    PRESENT_STATUS_AFTER_REFINE,
    PRESENT_STATUS_REFINE_MAY_ADVANCE,
    RECORD_OBSERVATION_FIELDS,
    REFINE_DELIVERY_QUALIFIED,
    REFINE_DELIVERY_STAGE_REGISTERED,
    assert_present_manifest_is_cast_safe,
    build_delivery_record,
    build_present_patch,
    canonical_json_bytes,
    deliver,
    main,
    preflight_work_dir_capacity,
    record_core,
    verify_published_tree,
)
from patina_scan_worker.refine_lifecycle import LocalScratchStorageSink
from patina_scan_worker.refine_publisher import RefinePublisher
from patina_scan_worker.refine_runner import (
    PUBLISHED_REFINE_ARTIFACT_NAMES,
    REFINE_MANIFEST_NAME,
)
from patina_scan_worker.storage import StorageClient
from patina_scan_worker.telemetry import Telemetry
from test_refine_publisher import (  # noqa: F401 - autouse fd cleanup fixture
    _deadline,
    _release_artifact_descriptors,
    _result,
)

USER_ID = "user-1"
SCAN_ID = "scan-1"
ROOM_FILE_ID = "room-file-1"
ROOM_FILE_VERSION = 3
PREFIX = f"room_file/{USER_ID}/{SCAN_ID}/v{ROOM_FILE_VERSION}/refine"


# ---------------------------------------------------------------------------
# The real tree
# ---------------------------------------------------------------------------
def _published_tree(tmp_path: Path) -> Path:
    """Run the shipped runner + publisher into a local scratch sink."""

    result = _result(tmp_path)
    publish_root = tmp_path / "publish"
    publish_root.mkdir(mode=0o700)
    spool = tmp_path / "spool"
    spool.mkdir(mode=0o700)
    RefinePublisher(
        LocalScratchStorageSink(publish_root),
        spool_root=spool,
        completion_reserve_seconds=5.0,
    ).publish(
        result,
        user_id=USER_ID,
        scan_id=SCAN_ID,
        deadline=_deadline(),
    )
    return publish_root


def _refine_dir(root: Path) -> Path:
    return root / Path(*PREFIX.split("/"))


def _verify(root: Path, **overrides: Any):
    arguments: dict[str, Any] = {
        "user_id": USER_ID,
        "scan_id": SCAN_ID,
        "room_file_id": ROOM_FILE_ID,
        "room_file_version": ROOM_FILE_VERSION,
    }
    arguments.update(overrides)
    return verify_published_tree(root, **arguments)


def _rewrite_manifest(root: Path, mutate) -> None:
    """Change ONE manifest field and re-encode in the canonical form.

    Re-encoding canonically is what keeps the mutation to one variable: a test
    that also changed the encoding would not know which of the two the refusal
    came from.
    """

    path = _refine_dir(root) / REFINE_MANIFEST_NAME
    document = json.loads(path.read_text())
    mutate(document)
    path.write_bytes(canonical_json_bytes(document))


def _refuses(root: Path, code: str, **overrides: Any) -> PermanentError:
    with pytest.raises(PermanentError) as raised:
        _verify(root, **overrides)
    assert raised.value.token == code, raised.value
    return raised.value


# ---------------------------------------------------------------------------
# Counting doubles -- what proves a dry run writes nothing
# ---------------------------------------------------------------------------
class _CountingStorage(StorageClient):
    def __init__(self, *, replay: bool = False, bucket: str = "room-scans") -> None:
        self.calls: list[dict[str, Any]] = []
        self.replay = replay
        # The real client takes this from Settings in ``__init__``; a double that
        # skipped it would let the bucket guard pass vacuously.
        self._bucket = bucket

    def publish_immutable_descriptor(
        self,
        object_key,
        source_descriptor,
        content_type,
        *,
        expected_sha256,
        expected_size,
        user_id,
        scan_id,
        expected_identity=None,
        deadline=None,
        reserve_seconds=0,
    ):
        metadata = os.fstat(source_descriptor)
        payload = os.pread(source_descriptor, metadata.st_size, 0)
        self.calls.append(
            {
                "key": object_key,
                "contentType": content_type,
                "sha256": expected_sha256,
                "sizeBytes": expected_size,
                "userId": user_id,
                "scanId": scan_id,
                "identity": expected_identity,
                "measured": (metadata.st_dev, metadata.st_ino),
                "payload": payload,
            }
        )
        return not self.replay


class _CountingDb(DbClient):
    def __init__(self, outcome: str = "written") -> None:
        self.calls: list[dict[str, Any]] = []
        self.outcome = outcome

    def record_room_file_refine(self, room_file_id, **kwargs):
        self.calls.append({"roomFileId": room_file_id, **kwargs})
        return self.outcome


class _CountingTelemetry(Telemetry):
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    def emit(
        self,
        scan_id,
        stage,
        event,
        status="info",
        room_file_id=None,
        duration_ms=None,
        detail=None,
    ):
        self.events.append(
            {
                "scanId": scan_id,
                "stage": stage,
                "event": event,
                "status": status,
                "roomFileId": room_file_id,
                "durationMs": duration_ms,
                "detail": detail or {},
            }
        )


# ---------------------------------------------------------------------------
# The happy path
# ---------------------------------------------------------------------------
def test_a_real_published_tree_verifies_and_derives_the_canonical_prefix(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)

    assert verified.prefix == PREFIX
    assert len(verified.all_artifacts) == 11
    assert tuple(
        artifact.name for artifact in verified.all_artifacts
    ) == (*PUBLISHED_REFINE_ARTIFACT_NAMES[:6], *PUBLISHED_REFINE_ARTIFACT_NAMES[7:], REFINE_MANIFEST_NAME)
    # Manifest LAST -- the commit marker, same order as RefinePublisher.
    assert verified.all_artifacts[-1].name == REFINE_MANIFEST_NAME
    assert verified.manifest.object_key == f"{PREFIX}/{REFINE_MANIFEST_NAME}"
    for artifact in verified.all_artifacts:
        assert artifact.object_key == f"{PREFIX}/{artifact.name}"
        assert artifact.transport_content_type in ALLOWED_TRANSPORT_CONTENT_TYPES


def test_the_published_name_set_is_derived_from_the_runner_not_restated():
    """A hand-copied list is a place for two readings to disagree in silence."""

    from patina_scan_worker.refine_runner import (
        _REQUIRED_ENGINE_ARTIFACT_NAMES,
        _RUNNER_ARTIFACT_NAMES,
    )

    assert PUBLISHED_REFINE_ARTIFACT_NAMES == tuple(
        sorted(
            _REQUIRED_ENGINE_ARTIFACT_NAMES
            | _RUNNER_ARTIFACT_NAMES
            | {REFINE_MANIFEST_NAME}
        )
    )
    assert len(PUBLISHED_REFINE_ARTIFACT_NAMES) == 11
    assert len(set(PUBLISHED_REFINE_ARTIFACT_NAMES)) == 11


def test_every_artifact_digest_is_recomputed_from_the_bytes_on_disk(tmp_path):
    """The manifest stops being a claim here."""

    root = _published_tree(tmp_path)
    verified = _verify(root)
    import hashlib

    for artifact in verified.all_artifacts:
        payload = artifact.path.read_bytes()
        assert hashlib.sha256(payload).hexdigest() == artifact.sha256
        assert len(payload) == artifact.size_bytes


# ---------------------------------------------------------------------------
# Refusal 1 -- the tree's shape
# ---------------------------------------------------------------------------
def test_a_twelfth_file_anywhere_in_the_tree_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    _verify(root)  # clean before the mutation, so the refusal is the mutation
    (_refine_dir(root) / "notes.txt").write_text("one extra file\n")
    error = _refuses(root, delivery_module.TREE_SHAPE_CODE)
    assert "12 regular files" in str(error)


def test_a_twelfth_file_outside_the_refine_directory_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    (root / "stray.json").write_text("{}\n")
    _refuses(root, delivery_module.TREE_SHAPE_CODE)


def test_a_missing_artifact_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    (_refine_dir(root) / "pairs-v2.txt").unlink()
    _refuses(root, delivery_module.TREE_SHAPE_CODE)


def test_a_symlinked_artifact_is_refused_before_its_bytes_are_read(tmp_path):
    """``open`` would follow the link and hash bytes the name did not promise."""

    root = _published_tree(tmp_path)
    target = _refine_dir(root) / "adapter-v2.json"
    elsewhere = tmp_path / "elsewhere.json"
    shutil.copyfile(target, elsewhere)
    target.unlink()
    target.symlink_to(elsewhere)
    error = _refuses(root, delivery_module.TREE_SHAPE_CODE)
    assert "not a regular file" in str(error)


def test_a_symlinked_directory_in_the_tree_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    other = tmp_path / "other-dir"
    other.mkdir()
    (_refine_dir(root) / "shadow").symlink_to(other, target_is_directory=True)
    error = _refuses(root, delivery_module.TREE_SHAPE_CODE)
    assert "symlinked directory" in str(error)


def test_a_published_root_that_is_a_symlink_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    link = tmp_path / "link-to-publish"
    link.symlink_to(root, target_is_directory=True)
    with pytest.raises(PermanentError) as raised:
        _verify(link)
    assert raised.value.token == delivery_module.TREE_SHAPE_CODE


def test_a_renamed_artifact_is_refused_rather_than_raising_a_key_error(tmp_path):
    """The reaching test for the tree-name-set check.

    Eleven files, one directory, manifest present, ledger untouched -- so the
    count check and the ledger check both pass.  Without the tree-name-set check
    the first ``by_name[name]`` lookup in refusal 7 is a bare ``KeyError``.  A
    mutation sweep found this clause unreachable; this is the input that reaches
    it.
    """

    root = _published_tree(tmp_path)
    source = _refine_dir(root) / "pairs-v2.txt"
    source.rename(_refine_dir(root) / "pairs-v3.txt")
    error = _refuses(root, delivery_module.TREE_SHAPE_CODE)
    assert "not the canonical eleven" in str(error)
    assert "pairs-v3.txt" in str(error)


def test_artifacts_split_across_two_directories_are_refused(tmp_path):
    root = _published_tree(tmp_path)
    second = root / Path(*f"room_file/{USER_ID}/{SCAN_ID}/v4/refine".split("/"))
    second.mkdir(parents=True)
    source = _refine_dir(root) / "pairs-v2.txt"
    shutil.move(str(source), str(second / "pairs-v2.txt"))
    _refuses(root, delivery_module.TREE_SHAPE_CODE)


# ---------------------------------------------------------------------------
# Refusal 2 -- the tree-derived key IS the canonical key
# ---------------------------------------------------------------------------
def test_a_mistyped_scan_id_gets_a_legible_refusal_not_a_misplaced_publication(
    tmp_path,
):
    root = _published_tree(tmp_path)
    error = _refuses(root, delivery_module.PREFIX_IDENTITY_CODE, scan_id="scan-2")
    assert "room_file/user-1/scan-2/v3/refine" in str(error)
    assert PREFIX in str(error)


@pytest.mark.parametrize(
    "override",
    (
        {"user_id": "user-2"},
        {"room_file_version": 4},
    ),
    ids=("mistyped-user-id", "mistyped-version"),
)
def test_any_identity_that_moves_the_prefix_is_refused(tmp_path, override):
    root = _published_tree(tmp_path)
    _refuses(root, delivery_module.PREFIX_IDENTITY_CODE, **override)


@pytest.mark.parametrize(
    "override",
    (
        {"scan_id": ""},
        {"scan_id": "with/slash"},
        {"room_file_version": 0},
        {"room_file_version": True},
    ),
    ids=("empty", "path-separator", "zero-version", "bool-version"),
)
def test_an_unusable_identity_is_refused_before_the_tree_is_walked(tmp_path, override):
    root = _published_tree(tmp_path)
    _refuses(root, delivery_module.IDENTITY_CODE, **override)


# ---------------------------------------------------------------------------
# Refusal 3 -- the manifest is its own canonical encoding
# ---------------------------------------------------------------------------
def test_non_canonical_spacing_in_the_manifest_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    path = _refine_dir(root) / REFINE_MANIFEST_NAME
    document = json.loads(path.read_text())
    # Same document, pretty-printed. Nothing about the CONTENT changed.
    path.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
    error = _refuses(root, delivery_module.MANIFEST_NONCANONICAL_CODE)
    assert "canonical encoding" in str(error)


def test_a_duplicate_json_key_in_the_manifest_is_refused(tmp_path):
    """``json.loads`` keeps the last value and says nothing; this names it."""

    root = _published_tree(tmp_path)
    path = _refine_dir(root) / REFINE_MANIFEST_NAME
    text = path.read_text()
    assert text.startswith("{")
    path.write_text('{"status":"partial",' + text[1:])
    error = _refuses(root, delivery_module.MANIFEST_NONCANONICAL_CODE)
    assert "duplicate JSON key" in str(error)


def test_an_unparseable_manifest_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    (_refine_dir(root) / REFINE_MANIFEST_NAME).write_bytes(b"{not json\n")
    _refuses(root, delivery_module.MANIFEST_NONCANONICAL_CODE)


def test_a_manifest_that_is_a_json_array_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    (_refine_dir(root) / REFINE_MANIFEST_NAME).write_bytes(canonical_json_bytes([]))
    _refuses(root, delivery_module.MANIFEST_NONCANONICAL_CODE)


# ---------------------------------------------------------------------------
# Refusal 4 -- the published bytes assert their own posture
# ---------------------------------------------------------------------------
def test_production_enablement_enabled_is_refused(tmp_path):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["productionEnablement"] = "enabled"

    _rewrite_manifest(root, mutate)
    error = _refuses(root, delivery_module.POSTURE_CODE)
    assert "productionEnablement='enabled'" in str(error)


@pytest.mark.parametrize(
    ("key", "value"),
    (
        ("schemaVersion", 2),
        ("schemaVersion", "1"),
        ("schemaVersion", True),
        ("status", "partial"),
    ),
    ids=("version-2", "version-string", "version-bool", "status-partial"),
)
def test_a_manifest_off_the_disabled_canonical_contract_is_refused(tmp_path, key, value):
    root = _published_tree(tmp_path)

    def mutate(document):
        document[key] = value

    _rewrite_manifest(root, mutate)
    _refuses(root, delivery_module.POSTURE_CODE)


# ---------------------------------------------------------------------------
# Refusal 5 -- identity equals the four operator-supplied values
# ---------------------------------------------------------------------------
def test_a_room_file_id_the_manifest_does_not_name_is_refused(tmp_path):
    """The one identity that does NOT move the prefix, so nothing else catches it."""

    root = _published_tree(tmp_path)
    error = _refuses(
        root,
        delivery_module.IDENTITY_CODE,
        room_file_id="room-file-2",
    )
    assert "identity.roomFileId" in str(error)


def test_a_manifest_identity_edited_away_from_the_operator_values_is_refused(tmp_path):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["identity"]["roomFileVersion"] = 4

    _rewrite_manifest(root, mutate)
    _refuses(root, delivery_module.IDENTITY_CODE)


def test_a_manifest_with_no_identity_object_is_refused(tmp_path):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["identity"] = "user-1"

    _rewrite_manifest(root, mutate)
    _refuses(root, delivery_module.IDENTITY_CODE)


# ---------------------------------------------------------------------------
# Refusal 6 -- the ledger, plus the manifest, is exactly the eleven
# ---------------------------------------------------------------------------
def test_a_ledger_missing_a_row_is_refused(tmp_path):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["artifacts"] = [
            row for row in document["artifacts"] if row["name"] != "pairs-v2.txt"
        ]

    _rewrite_manifest(root, mutate)
    _refuses(root, delivery_module.LEDGER_CODE)


def test_a_ledger_row_with_an_unexpected_key_set_is_refused(tmp_path):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["artifacts"][0]["extra"] = 1

    _rewrite_manifest(root, mutate)
    _refuses(root, delivery_module.LEDGER_CODE)


def test_a_ledger_that_names_the_manifest_itself_is_refused(tmp_path):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["artifacts"][0]["name"] = REFINE_MANIFEST_NAME

    _rewrite_manifest(root, mutate)
    _refuses(root, delivery_module.LEDGER_CODE)


def test_a_transport_content_type_the_bucket_rejects_is_refused(tmp_path):
    """A 400 halfway through publication, moved to before the first upload."""

    root = _published_tree(tmp_path)

    def mutate(document):
        for row in document["artifacts"]:
            if row["name"] == "pairs-v2.txt":
                row["transportContentType"] = "text/plain"

    _rewrite_manifest(root, mutate)
    error = _refuses(root, delivery_module.TRANSPORT_CODE)
    assert "room-scans bucket does not admit" in str(error)


# ---------------------------------------------------------------------------
# Refusal 7 -- every byte
# ---------------------------------------------------------------------------
def test_one_flipped_byte_in_one_artifact_is_refused(tmp_path):
    root = _published_tree(tmp_path)
    _verify(root)
    path = _refine_dir(root) / "pairs-v2.txt"
    payload = bytearray(path.read_bytes())
    assert payload, "the fixture artifact must have bytes to flip"
    payload[0] ^= 0x01
    path.write_bytes(bytes(payload))
    error = _refuses(root, delivery_module.DIGEST_CODE)
    assert "hashes to" in str(error)


def test_a_truncated_artifact_is_refused_on_size_before_it_is_hashed(tmp_path):
    root = _published_tree(tmp_path)
    path = _refine_dir(root) / "adapter-v2.json"
    payload = path.read_bytes()
    path.write_bytes(payload[:-1])
    error = _refuses(root, delivery_module.DIGEST_CODE)
    assert "bytes on disk" in str(error)


def test_a_ledger_digest_edited_to_match_nothing_is_refused(tmp_path):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["artifacts"][0]["sha256"] = "0" * 64

    _rewrite_manifest(root, mutate)
    _refuses(root, delivery_module.DIGEST_CODE)


# ---------------------------------------------------------------------------
# Refusal 8 -- capacity
# ---------------------------------------------------------------------------
def test_an_oversized_artifact_is_refused_before_the_first_upload(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    limit = verified.largest.size_bytes - 1
    error = _refuses(
        root,
        delivery_module.CAPACITY_CODE,
        bucket_object_limit_bytes=limit,
    )
    assert verified.largest.name in str(error)
    assert "per-object limit" in str(error)


def test_the_bucket_ceiling_is_the_one_00077_set():
    assert BUCKET_OBJECT_LIMIT_BYTES == 524_288_000


def test_a_work_dir_without_room_for_the_spool_refuses_a_commit(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    with pytest.raises(PermanentError) as raised:
        preflight_work_dir_capacity(
            verified,
            str(tmp_path / "does-not-exist"),
            require=True,
        )
    assert raised.value.token == delivery_module.CAPACITY_CODE


def test_a_work_dir_that_exists_but_is_too_full_refuses_a_commit(tmp_path, monkeypatch):
    """The reaching test for the free-space clause, as distinct from the probe.

    The nonexistent-directory case above exercises the OSError branch; this one
    exercises ``require and not sufficient``, which a mutation sweep found no
    input reached.  Every upload is staged into WORK_DIR before a byte goes out,
    so a full filesystem is otherwise an ``OSError`` mid-publication.
    """

    root = _published_tree(tmp_path)
    verified = _verify(root)

    class _Full:
        f_bavail = 1
        f_frsize = 1

    monkeypatch.setattr(delivery_module.os, "statvfs", lambda path: _Full())
    with pytest.raises(PermanentError) as raised:
        preflight_work_dir_capacity(verified, str(tmp_path), require=True)
    assert raised.value.token == delivery_module.CAPACITY_CODE
    assert "1 bytes free" in str(raised.value)
    # And the same shortage is REPORTED, not refused, when nothing will be written.
    preflight = preflight_work_dir_capacity(verified, str(tmp_path), require=False)
    assert preflight.free_bytes == 1
    assert preflight.sufficient is False


def test_an_unprobeable_work_dir_reports_rather_than_refuses_a_dry_run(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    preflight = preflight_work_dir_capacity(
        verified,
        str(tmp_path / "does-not-exist"),
        require=False,
    )
    assert preflight.free_bytes is None
    assert preflight.probe_error
    assert preflight.sufficient is False


def test_a_real_work_dir_reports_free_space_and_the_spool_requirement(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    preflight = preflight_work_dir_capacity(verified, str(tmp_path), require=True)
    assert preflight.required_bytes == verified.largest.size_bytes
    assert preflight.free_bytes is not None and preflight.free_bytes > 0
    assert preflight.sufficient


# ---------------------------------------------------------------------------
# Refusal 9 -- the R123 advisory
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "value",
    ("", "   ", None, 12, ["advisory"]),
    ids=("empty", "blank", "null", "number", "list"),
)
def test_a_delivery_that_would_strip_the_loop_advisory_is_refused(tmp_path, value):
    root = _published_tree(tmp_path)

    def mutate(document):
        document["refinementEvidence"]["loopConsistencyAdvisory"] = value

    _rewrite_manifest(root, mutate)
    error = _refuses(root, delivery_module.ADVISORY_CODE)
    assert "R123" in str(error)


def test_the_advisory_reaches_the_record_verbatim(tmp_path):
    """R123 requires the loop numbers be reported MORE prominently, and I106
    records that nothing reads the string -- 'it exists to be read'.  A
    paraphrase would launder a number nobody has authority to interpret."""

    root = _published_tree(tmp_path)
    verified = _verify(root)
    published = json.loads(
        (_refine_dir(root) / REFINE_MANIFEST_NAME).read_text()
    )["refinementEvidence"]["loopConsistencyAdvisory"]
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=(),
        replayed_keys=(),
    )
    assert record["verdict"]["loopConsistencyAdvisory"] == published
    assert verified.loop_consistency_advisory == published


# ---------------------------------------------------------------------------
# Dry run performs zero writes
# ---------------------------------------------------------------------------
def test_a_dry_run_makes_zero_calls_against_storage_database_and_telemetry(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    storage = _CountingStorage()
    db = _CountingDb()
    telemetry = _CountingTelemetry()

    receipt = deliver(
        verified,
        storage=storage,
        db=db,
        telemetry=telemetry,
        bucket="room-scans",
        commit=False,
    )

    assert storage.calls == []
    assert db.calls == []
    assert telemetry.events == []
    assert receipt.committed is False
    assert receipt.created_keys == ()
    assert receipt.replayed_keys == ()
    assert receipt.record_outcome == "not-attempted"
    assert receipt.present_status is None
    # The record is still BUILT, so the 00377 cast guard runs on exactly the
    # document a commit would write.
    assert receipt.record["prefix"] == PREFIX


def test_a_committing_delivery_publishes_eleven_manifest_last_then_records(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    storage = _CountingStorage()
    db = _CountingDb()
    telemetry = _CountingTelemetry()

    receipt = deliver(
        verified,
        storage=storage,
        db=db,
        telemetry=telemetry,
        bucket="room-scans",
        commit=True,
    )

    keys = [call["key"] for call in storage.calls]
    assert len(keys) == 11
    assert keys[-1] == f"{PREFIX}/{REFINE_MANIFEST_NAME}"
    assert keys[:-1] == sorted(keys[:-1])
    assert all(key.startswith(f"{PREFIX}/") for key in keys)
    for call in storage.calls:
        assert call["userId"] == USER_ID and call["scanId"] == SCAN_ID
        # The descriptor identity is asserted, so a recycled fd number cannot
        # publish a different inode under a verified digest.
        assert call["identity"] == call["measured"]
    assert receipt.created_keys == tuple(keys)
    assert receipt.replayed_keys == ()
    assert len(db.calls) == 1
    assert db.calls[0]["present_status"] == PRESENT_STATUS_AFTER_REFINE
    assert db.calls[0]["allowed_present_status"] == PRESENT_STATUS_REFINE_MAY_ADVANCE


def test_the_record_is_written_after_every_object_not_before(tmp_path):
    """A failed record write must leave republishable artifacts, never a row
    pointing at objects that do not exist."""

    root = _published_tree(tmp_path)
    verified = _verify(root)
    order: list[str] = []

    class _OrderedStorage(_CountingStorage):
        def publish_immutable_descriptor(self, object_key, *args, **kwargs):
            order.append(f"publish:{object_key.rsplit('/', 1)[1]}")
            return super().publish_immutable_descriptor(object_key, *args, **kwargs)

    class _OrderedDb(_CountingDb):
        def record_room_file_refine(self, room_file_id, **kwargs):
            order.append("record")
            return super().record_room_file_refine(room_file_id, **kwargs)

    deliver(
        verified,
        storage=_OrderedStorage(),
        db=_OrderedDb(),
        telemetry=_CountingTelemetry(),
        bucket="room-scans",
        commit=True,
    )
    assert order[-1] == "record"
    assert order[-2] == f"publish:{REFINE_MANIFEST_NAME}"
    assert len([step for step in order if step.startswith("publish:")]) == 11


def test_a_replay_reports_eleven_replays_and_zero_creations(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    storage = _CountingStorage(replay=True)
    db = _CountingDb(outcome="replayed")

    receipt = deliver(
        verified,
        storage=storage,
        db=db,
        telemetry=_CountingTelemetry(),
        bucket="room-scans",
        commit=True,
    )
    assert receipt.created_keys == ()
    assert len(receipt.replayed_keys) == 11
    assert receipt.record_outcome == "replayed"
    assert receipt.present_status is None


def test_a_commit_without_collaborators_refuses_rather_than_pretending(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    with pytest.raises(PermanentError):
        deliver(
            verified,
            storage=None,
            db=None,
            telemetry=None,
            bucket="room-scans",
            commit=True,
        )


# ---------------------------------------------------------------------------
# The two events, and their two clocks
# ---------------------------------------------------------------------------
def test_two_refine_events_carry_two_different_clocks(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    telemetry = _CountingTelemetry()

    deliver(
        verified,
        storage=_CountingStorage(),
        db=_CountingDb(),
        telemetry=telemetry,
        bucket="room-scans",
        commit=True,
    )

    assert [event["event"] for event in telemetry.events] == [
        "refine.succeeded",
        "refine.published",
    ]
    assert all(event["stage"] == "refine" for event in telemetry.events)
    assert all(event["status"] == "succeeded" for event in telemetry.events)
    assert all(event["roomFileId"] == ROOM_FILE_ID for event in telemetry.events)

    engine_duration = json.loads(
        (_refine_dir(root) / REFINE_MANIFEST_NAME).read_text()
    )["engineTelemetry"]["durationMs"]
    # refine.succeeded is what lights scan_pipeline_runs.refine_ms (00377 reads
    # exactly that event name), so it must carry the RECONSTRUCTION time.
    assert telemetry.events[0]["durationMs"] == engine_duration
    # refine.published carries the DELIVERY wall time, which is a different
    # quantity and would be a lie in a column labelled reconstruction.
    assert telemetry.events[1]["durationMs"] is not None
    assert telemetry.events[1]["detail"]["manifestKey"] == verified.manifest.object_key
    for event in telemetry.events:
        assert (
            event["detail"]["loopConsistencyAdvisory"]
            == verified.loop_consistency_advisory
        )


def test_the_event_stage_and_status_are_values_the_checks_admit():
    """00376 widened scan_pipeline_events.stage to include 'refine'; 00341's
    status CHECK has always been the same four values."""

    migrations = _repository_root() / "supabase" / "migrations"
    if not migrations.is_dir():  # pragma: no cover - installed release
        pytest.skip("running outside a repository checkout")
    stage_check = (migrations / "00376_field_capture_p2_present_schema.sql").read_text()
    assert "'refine'" in stage_check
    status_check = (
        migrations / "00341_field_capture_p1_schema.sql"
    ).read_text()
    assert "'started','succeeded','failed','info'" in status_check


# ---------------------------------------------------------------------------
# The record's shape
# ---------------------------------------------------------------------------
def test_the_record_carries_bare_object_keys_never_a_public_url(tmp_path):
    """R122 repaired columns carrying a non-resolving ``/object/public/`` form
    for a private bucket, and I105 recorded that ``stages/drawings.py`` still
    carries it.  This is not going to be the eleventh instance."""

    root = _published_tree(tmp_path)
    verified = _verify(root)
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=[artifact.object_key for artifact in verified.all_artifacts],
        replayed_keys=[],
    )
    blob = json.dumps(record)
    assert "/object/public/" not in blob
    assert "http://" not in blob and "https://" not in blob
    assert len(record["artifacts"]) == 11
    for row in record["artifacts"]:
        assert set(row) == {"key", "name", "sha256", "sizeBytes", "semanticMediaType"}
        assert row["key"].startswith("room_file/")
    assert record["manifestKey"] == verified.manifest.object_key
    assert record["manifestSha256"] == verified.manifest.sha256
    assert record["bucket"] == "room-scans"
    assert record["prefix"] == PREFIX


def test_the_record_copies_the_posture_the_published_bytes_assert(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=(),
        replayed_keys=(),
    )
    assert record["posture"] == {
        "productionEnablement": "disabled",
        "refineDeliveryQualified": False,
        "refineDeliveryStageRegistered": False,
        "stageRegistered": False,
        "enqueued": False,
    }


def test_the_record_core_excludes_only_this_deliverys_observations(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    first = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=[a.object_key for a in verified.all_artifacts],
        replayed_keys=[],
    )
    replayed = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=[],
        replayed_keys=[a.object_key for a in verified.all_artifacts],
    )
    assert first != replayed
    assert record_core(first) == record_core(replayed)
    assert RECORD_OBSERVATION_FIELDS == ("createdKeys", "replayedKeys")


def test_the_record_is_json_serialisable_without_losing_a_field(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=(),
        replayed_keys=(),
    )
    assert json.loads(json.dumps(record)) == record


# ---------------------------------------------------------------------------
# The 00377 cast hazard -- the sharpest implementation risk
# ---------------------------------------------------------------------------
def test_the_present_patch_writes_no_non_numeric_value_under_a_cast_key(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=(),
        replayed_keys=(),
    )
    patch = build_present_patch(verified, record)

    for key in PRESENT_NUMERIC_CAST_KEYS:
        if key not in patch:
            continue
        value = patch[key]
        assert isinstance(value, (int, float)) and not isinstance(value, bool), key
    # And the same statement made against the SERIALISED form, because what the
    # view casts is what PostgREST stored, not what Python held.
    encoded = json.loads(json.dumps(patch))
    for key in PRESENT_NUMERIC_CAST_KEYS:
        if key in encoded:
            assert not isinstance(encoded[key], str), key
    assert re.search(r'"vram_peak_mb":\s*\d', json.dumps(patch)) or (
        "vram_peak_mb" not in patch
    )


def test_refine_never_writes_sfm_residual_pct(tmp_path):
    """R-D is open.  ``reprojection_rmse_px_after`` is PIXELS, not a percentage,
    and converting one to the other would invent a denominator nobody has
    authority to choose.  Absent reads as NULL, which is the honest value."""

    root = _published_tree(tmp_path)
    verified = _verify(root)
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=(),
        replayed_keys=(),
    )
    patch = build_present_patch(verified, record)
    assert PRESENT_KEYS_REFINE_MUST_NOT_WRITE == ("sfm_residual_pct",)
    for forbidden in PRESENT_KEYS_REFINE_MUST_NOT_WRITE:
        assert forbidden not in patch


@pytest.mark.parametrize("key", PRESENT_NUMERIC_CAST_KEYS)
@pytest.mark.parametrize(
    "value",
    ("", "12", "12.5", True, False, float("nan"), float("inf"), None, {}),
    ids=(
        "empty-string",
        "stringified-int",
        "stringified-float",
        "true",
        "false",
        "nan",
        "inf",
        "null",
        "object",
    ),
)
def test_one_malformed_cast_value_would_dark_fail_the_whole_view_and_is_refused(
    key, value
):
    """00377's own header: a malformed value 'would raise on cast and dark-fail
    the WHOLE view for every row'.  Not just this deliverable's row."""

    with pytest.raises(PermanentError) as raised:
        assert_present_manifest_is_cast_safe({key: value})
    assert raised.value.token == delivery_module.POSTURE_CODE


@pytest.mark.parametrize("key", PRESENT_NUMERIC_CAST_KEYS)
def test_an_absent_cast_key_is_safe_because_null_casts(key):
    """``present->>'key'`` on a missing key yields SQL NULL and ``NULL::numeric``
    is safe -- which is why omitting a key is a legitimate choice."""

    assert_present_manifest_is_cast_safe({"refine_engine": "colmap-4"})
    assert_present_manifest_is_cast_safe({key: 0})
    assert_present_manifest_is_cast_safe({key: 1.5})


def _repository_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[3]


def test_the_guarded_cast_key_set_is_the_one_00377_actually_casts():
    """Read the migration rather than trusting the constant's comment.

    If a future migration adds a cast, this reddens and the writer's guard is
    extended before the view can be dark-failed by a key nobody knew was cast.
    """

    migration = (
        _repository_root()
        / "supabase"
        / "migrations"
        / "00377_scan_pipeline_present_query_surface.sql"
    )
    if not migration.is_file():  # pragma: no cover - installed release
        pytest.skip("running outside a repository checkout")
    body = migration.read_text()
    view = body.split("CREATE OR REPLACE VIEW public.scan_present_stats", 1)[1]
    view = view.split("COMMENT ON VIEW public.scan_present_stats", 1)[0]
    cast_keys = set(
        re.findall(
            r"\(rf\.present\s*->>\s*'([a-z_]+)'\)::(?:bigint|numeric|int)",
            view,
        )
    )
    assert cast_keys == set(PRESENT_NUMERIC_CAST_KEYS), sorted(
        cast_keys.symmetric_difference(PRESENT_NUMERIC_CAST_KEYS)
    )
    text_keys = set(re.findall(r"\(rf\.present\s*->>\s*'([a-z_]+)'\)\s+AS", view))
    assert text_keys == set(delivery_module.PRESENT_TEXT_KEYS)


def test_the_cast_guard_actually_runs_on_the_patch_this_module_builds(
    tmp_path, monkeypatch
):
    """The reaching test for the guard's CALL SITE, not just the guard.

    ``_engine_vram_peak_mb`` returns ``None`` for anything that is not a
    non-negative int, so no manifest can currently drive a bad value into the
    patch -- which is why deleting the call survived a mutation sweep.  The
    defect the call exists to catch is a helper that starts returning something
    else, so that is what this constructs.
    """

    root = _published_tree(tmp_path)
    verified = _verify(root)
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=(),
        replayed_keys=(),
    )
    monkeypatch.setattr(delivery_module, "_engine_vram_peak_mb", lambda document: "512")
    with pytest.raises(PermanentError) as raised:
        build_present_patch(verified, record)
    assert raised.value.token == delivery_module.POSTURE_CODE
    assert "vram_peak_mb" in str(raised.value)


def test_a_record_that_would_name_a_bucket_the_client_does_not_write_to_refuses(
    tmp_path,
):
    """Both values come from the same ``Settings`` today, which is exactly why a
    mismatch would never be noticed: the row would point, resolvably and
    wrongly, at a bucket nobody published to."""

    root = _published_tree(tmp_path)
    verified = _verify(root)
    storage = _CountingStorage(bucket="some-other-bucket")
    with pytest.raises(PermanentError) as raised:
        deliver(
            verified,
            storage=storage,
            db=_CountingDb(),
            telemetry=_CountingTelemetry(),
            bucket="room-scans",
            commit=True,
        )
    assert raised.value.token == delivery_module.BUCKET_MISMATCH_CODE
    assert storage.calls == []


def test_the_present_patch_lights_refine_engine_which_is_what_the_view_reads(tmp_path):
    root = _published_tree(tmp_path)
    verified = _verify(root)
    record = build_delivery_record(
        verified,
        bucket="room-scans",
        created_keys=(),
        replayed_keys=(),
    )
    patch = build_present_patch(verified, record)
    manifest = json.loads((_refine_dir(root) / REFINE_MANIFEST_NAME).read_text())
    assert patch["refine_engine"] == manifest["engine"]["selected"]
    assert isinstance(patch["refine_engine"], str)
    assert patch["refine"] == record


# ---------------------------------------------------------------------------
# The database writer
# ---------------------------------------------------------------------------
def _db_with(handler) -> tuple[DbClient, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def transport_handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    settings = Settings(
        worker_id="test",
        supabase_url="https://example.invalid",
        service_role_key="service-role",
    )
    session = httpx.Client(
        base_url=settings.supabase_url,
        transport=httpx.MockTransport(transport_handler),
    )
    return DbClient(session, settings), seen


_ROW = {
    "id": ROOM_FILE_ID,
    "scan_id": SCAN_ID,
    "version": ROOM_FILE_VERSION,
    "present": {},
    "present_status": None,
}


def test_the_record_patch_is_forward_only_against_the_present_lifecycle():
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[_ROW])
        return httpx.Response(200, json=[{"id": ROOM_FILE_ID}])

    db, seen = _db_with(handler)
    outcome = db.record_room_file_refine(
        ROOM_FILE_ID,
        scan_id=SCAN_ID,
        version=ROOM_FILE_VERSION,
        present_patch={"refine": {"a": 1}, "refine_engine": "colmap-4"},
        present_status=PRESENT_STATUS_AFTER_REFINE,
        allowed_present_status=PRESENT_STATUS_REFINE_MAY_ADVANCE,
        record_observation_fields=RECORD_OBSERVATION_FIELDS,
    )
    assert outcome == "written"
    patch = [request for request in seen if request.method == "PATCH"][0]
    url = str(patch.url)
    assert "or=(present_status.is.null,present_status.in.(pending,refining))" in (
        httpx.URL(url).query.decode()
    )
    body = json.loads(patch.content)
    assert body["present_status"] == "refining"
    assert body["present"]["refine_engine"] == "colmap-4"


def test_a_room_file_already_past_refining_is_skipped_not_regressed():
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[_ROW])
        # PostgREST returns an empty representation when the filter matched
        # nothing -- the forward-only guard declining.
        return httpx.Response(200, json=[])

    db, _ = _db_with(handler)
    assert (
        db.record_room_file_refine(
            ROOM_FILE_ID,
            scan_id=SCAN_ID,
            version=ROOM_FILE_VERSION,
            present_patch={"refine": {"a": 1}},
            present_status=PRESENT_STATUS_AFTER_REFINE,
            allowed_present_status=PRESENT_STATUS_REFINE_MAY_ADVANCE,
        )
        == "skipped"
    )


def test_an_identical_existing_record_replays_and_writes_nothing():
    existing = {"refine": {"prefix": PREFIX, "createdKeys": ["a"], "replayedKeys": []}}
    row = {**_ROW, "present": existing, "present_status": "refining"}

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[row])
        raise AssertionError("a replay must not write")

    db, seen = _db_with(handler)
    outcome = db.record_room_file_refine(
        ROOM_FILE_ID,
        scan_id=SCAN_ID,
        version=ROOM_FILE_VERSION,
        # Same core, DIFFERENT observation -- eleven replays where the first run
        # had a creation.
        present_patch={
            "refine": {"prefix": PREFIX, "createdKeys": [], "replayedKeys": ["a"]}
        },
        present_status=PRESENT_STATUS_AFTER_REFINE,
        allowed_present_status=PRESENT_STATUS_REFINE_MAY_ADVANCE,
        record_observation_fields=RECORD_OBSERVATION_FIELDS,
    )
    assert outcome == "replayed"
    assert [request.method for request in seen] == ["GET"]


def test_a_divergent_existing_record_refuses_rather_than_overwriting():
    row = {**_ROW, "present": {"refine": {"prefix": "room_file/other/v1/refine"}}}

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[row])
        raise AssertionError("a divergent record must not be overwritten")

    db, _ = _db_with(handler)
    with pytest.raises(PermanentError) as raised:
        db.record_room_file_refine(
            ROOM_FILE_ID,
            scan_id=SCAN_ID,
            version=ROOM_FILE_VERSION,
            present_patch={"refine": {"prefix": PREFIX}},
            present_status=PRESENT_STATUS_AFTER_REFINE,
            allowed_present_status=PRESENT_STATUS_REFINE_MAY_ADVANCE,
            record_observation_fields=RECORD_OBSERVATION_FIELDS,
        )
    assert raised.value.token == "REFINE_DELIVERY_RECORD_CONFLICT"


def test_a_room_file_row_for_another_scan_or_version_refuses():
    row = {**_ROW, "scan_id": "scan-9"}

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[row])
        raise AssertionError("must not write to another scan's row")

    db, _ = _db_with(handler)
    with pytest.raises(PermanentError) as raised:
        db.record_room_file_refine(
            ROOM_FILE_ID,
            scan_id=SCAN_ID,
            version=ROOM_FILE_VERSION,
            present_patch={"refine": {}},
            present_status=PRESENT_STATUS_AFTER_REFINE,
            allowed_present_status=PRESENT_STATUS_REFINE_MAY_ADVANCE,
        )
    assert raised.value.token == "REFINE_DELIVERY_IDENTITY"


def test_the_merge_preserves_present_keys_this_delivery_does_not_own():
    row = {**_ROW, "present": {"splat_format": "spz", "gaussian_count": 12}}
    captured: dict[str, Any] = {}

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[row])
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=[{"id": ROOM_FILE_ID}])

    db, _ = _db_with(handler)
    db.record_room_file_refine(
        ROOM_FILE_ID,
        scan_id=SCAN_ID,
        version=ROOM_FILE_VERSION,
        present_patch={"refine": {"a": 1}, "refine_engine": "colmap-4"},
        present_status=PRESENT_STATUS_AFTER_REFINE,
        allowed_present_status=PRESENT_STATUS_REFINE_MAY_ADVANCE,
    )
    assert captured["body"]["present"]["splat_format"] == "spz"
    assert captured["body"]["present"]["gaussian_count"] == 12
    assert captured["body"]["present"]["refine_engine"] == "colmap-4"


# ---------------------------------------------------------------------------
# The CLI
# ---------------------------------------------------------------------------
def _cli_env(monkeypatch, tmp_path):
    monkeypatch.setenv("WORKER_ID", "layer2-test")
    monkeypatch.setenv("SUPABASE_URL", "https://example.invalid")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role")
    monkeypatch.setenv("WORK_DIR", str(tmp_path))


def _cli_arguments(root: Path) -> list[str]:
    return [
        "--published-dir",
        str(root),
        "--user-id",
        USER_ID,
        "--scan-id",
        SCAN_ID,
        "--room-file-id",
        ROOM_FILE_ID,
        "--room-file-version",
        str(ROOM_FILE_VERSION),
    ]


def test_the_cli_defaults_to_a_dry_run_that_never_opens_a_session(
    tmp_path, monkeypatch, capsys
):
    """Dry-run is the DEFAULT and it is not a simulation: ``build_session`` is
    replaced by a detonator and the run still succeeds."""

    root = _published_tree(tmp_path)
    _cli_env(monkeypatch, tmp_path)

    def _detonate(settings):  # pragma: no cover - must never run
        raise AssertionError("a dry run must not open an HTTP session")

    monkeypatch.setattr(delivery_module, "build_session", _detonate)
    assert main(_cli_arguments(root)) == 0
    captured = capsys.readouterr()
    report = json.loads(captured.out)
    assert report["committed"] is False
    assert report["prefix"] == PREFIX
    assert report["artifactCount"] == 11
    assert report["createdKeys"] == []
    assert report["recordOutcome"] == "not-attempted"
    assert report["bucketObjectLimitBytes"] == BUCKET_OBJECT_LIMIT_BYTES
    assert report["largestArtifactBytes"] > 0
    assert "DRY RUN" in captured.err
    assert "LOCAL SCRATCH" not in captured.err


def test_the_cli_dry_run_reports_the_largest_artifact_against_the_bucket_cap(
    tmp_path, monkeypatch, capsys
):
    """The first dry-run is the first time this program learns that number."""

    root = _published_tree(tmp_path)
    _cli_env(monkeypatch, tmp_path)
    assert main(_cli_arguments(root)) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["largestArtifactName"] in PUBLISHED_REFINE_ARTIFACT_NAMES
    assert report["totalBytes"] >= report["largestArtifactBytes"]
    assert report["workDirFreeBytes"] is not None


def test_the_cli_refuses_a_mistyped_scan_id_with_a_legible_exit(
    tmp_path, monkeypatch, capsys
):
    root = _published_tree(tmp_path)
    _cli_env(monkeypatch, tmp_path)
    arguments = _cli_arguments(root)
    arguments[arguments.index(SCAN_ID)] = "scan-2"
    assert main(arguments) == 3
    captured = capsys.readouterr()
    assert delivery_module.PREFIX_IDENTITY_CODE in captured.err
    assert captured.out == ""


def test_the_cli_refuses_to_start_without_a_configured_environment(
    tmp_path, monkeypatch, capsys
):
    root = _published_tree(tmp_path)
    for name in ("WORKER_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(name, raising=False)
    assert main(_cli_arguments(root)) == 2
    assert "config error" in capsys.readouterr().err


def test_committing_is_opt_in_and_the_flag_is_the_only_way_in():
    parser = delivery_module.build_argument_parser()
    actions = {action.dest: action for action in parser._actions}
    assert actions["commit"].default is False
    assert "--force" not in {
        option for action in parser._actions for option in action.option_strings
    }
    assert "--bucket" not in {
        option for action in parser._actions for option in action.option_strings
    }


# ---------------------------------------------------------------------------
# Posture -- re-verified, not taken on report
# ---------------------------------------------------------------------------
def test_delivery_declares_its_own_posture_and_neither_flag_is_true():
    assert REFINE_DELIVERY_QUALIFIED is False
    assert REFINE_DELIVERY_STAGE_REGISTERED is False


def test_refine_is_still_absent_from_the_worker_dispatch_table():
    from patina_scan_worker.config import DEFAULT_STAGES
    from patina_scan_worker.stages import get_handler

    assert DEFAULT_STAGES == "ingest,solve,drawings"
    assert get_handler("scan_pipeline.refine") is None


def test_nothing_under_stages_imports_the_delivery_module():
    package = pathlib.Path(delivery_module.__file__).resolve().parent
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
            if any("refine_delivery" in name for name in names):
                offenders.append((module.name, names))
    assert offenders == []


def _executable_text(path: pathlib.Path) -> str:
    """The module's CODE, with every comment, docstring and literal removed.

    A prose assertion over raw source is worthless: this module's docstring
    explains at length that nothing enqueues ``scan_pipeline.refine``, which is
    exactly the string such an assertion would then find.  Tokenising and
    dropping COMMENT/STRING leaves only what actually runs.
    """

    import io
    import tokenize

    kept: list[str] = []
    for token in tokenize.generate_tokens(io.StringIO(path.read_text()).readline):
        if token.type in (tokenize.COMMENT, tokenize.STRING):
            continue
        if token.type == getattr(tokenize, "FSTRING_MIDDLE", -1):
            continue
        kept.append(token.string)
    return " ".join(kept)


def test_delivery_enqueues_nothing_and_names_no_task_type():
    """The quietest enabling lever, and the strongest: nothing enqueues
    ``scan_pipeline.refine``.  This module does not become the first thing that
    does."""

    path = pathlib.Path(delivery_module.__file__)
    source = path.read_text()
    executable = _executable_text(path)
    assert "scan_pipeline." not in executable
    assert "enqueue" not in executable
    assert "TASK_TYPE_PREFIX" not in executable
    tree = ast.parse(source)
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
        elif isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
    assert "queue" not in imported
    assert "worker" not in imported


def test_delivery_does_not_import_the_lifecycle():
    """Independence is the point.  The lifecycle's banner -- 'never to Supabase
    Storage' -- stays literally true because this module is a different door."""

    source = pathlib.Path(delivery_module.__file__).read_text()
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            assert node.module != "refine_lifecycle"
        elif isinstance(node, ast.Import):
            for alias in node.names:
                assert "refine_lifecycle" not in alias.name


def test_the_validator_is_a_second_reading_not_a_call_into_the_publisher():
    """``refine_publisher._validate_result`` needs a live in-memory
    ``RefineRunResult`` and cannot be reached from files at all; a delegation
    would be a tautology rather than a cross-check."""

    executable = _executable_text(pathlib.Path(delivery_module.__file__))
    assert "_validate_result" not in executable
    assert "RefineRunResult" not in executable
    assert "_canonical_json_bytes" not in executable
    assert "refine_publisher" not in executable


def test_delivery_has_no_console_script_entry_point():
    import tomllib

    root = pathlib.Path(__file__).resolve().parent.parent
    with (root / "pyproject.toml").open("rb") as handle:
        document = tomllib.load(handle)
    scripts = document["project"].get("scripts", {})
    assert all("delivery" not in target for target in scripts.values())
    assert all("refine" not in target for target in scripts.values())


def test_the_canonical_encoder_agrees_with_the_bytes_the_runner_published(tmp_path):
    """Two encoders, one artifact set.  A drift reddens here rather than in
    production."""

    root = _published_tree(tmp_path)
    for name in PUBLISHED_REFINE_ARTIFACT_NAMES:
        if not name.endswith(".json"):
            continue
        payload = (_refine_dir(root) / name).read_bytes()
        assert canonical_json_bytes(json.loads(payload)) == payload
