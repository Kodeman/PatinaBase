"""Ingest plan/decision logic (pure) — no network, no storage."""

from __future__ import annotations

import json
import os

import pytest

from patina_scan_worker.errors import PermanentError, TransientError, classify_failures
from patina_scan_worker.stages import validator
from patina_scan_worker.stages.ingest import (
    plan_downloads,
    reconcile_artifacts_sha256,
    _summarize,
)


def _fixture_manifest(tmp_path) -> dict:
    bundle = tmp_path / "bundle"
    validator.make_fixture(str(bundle))
    with open(bundle / "manifest.json", encoding="utf-8") as fh:
        return json.load(fh)


def test_plan_downloads_resolves_keys_prefix_and_column(tmp_path):
    manifest = _fixture_manifest(tmp_path)
    scan_row = {
        # dedicated column for capturedRoomJson → column-derived key wins
        "captured_room_json_url": (
            "https://p/storage/v1/object/public/room-scans/uid/scan/captured_room.json"
        )
    }
    plan = plan_downloads(manifest, "uid/scan", scan_row)
    by_rel = {i.rel_path: i.object_key for i in plan}
    # column-derived
    assert by_rel["captured_room.json"] == "uid/scan/captured_room.json"
    # prefix-derived (no column)
    assert by_rel["keyframes/keyframe_index.ndjson"] == "uid/scan/keyframes/keyframe_index.ndjson"
    assert by_rel["depth.tar"] == "uid/scan/depth.tar"
    assert by_rel["keyframes.tar"] == "uid/scan/keyframes.tar"
    # every planned item carries a declared sha256 from the manifest
    assert all(len(i.declared_sha) == 64 for i in plan)


def test_plan_downloads_rejects_path_escape(tmp_path):
    manifest = _fixture_manifest(tmp_path)
    manifest["artifacts"].append(
        {"kind": "evil", "relativePath": "../escape.bin", "sha256": "0" * 64}
    )
    with pytest.raises(PermanentError) as ei:
        plan_downloads(manifest, "uid/scan", {})
    assert ei.value.token == "PATH_VIOLATION"


def test_plan_downloads_bad_artifacts_shape():
    with pytest.raises(PermanentError) as ei:
        plan_downloads({"artifacts": "not-a-list"}, "p", {})
    assert ei.value.token == "SCHEMA_VIOLATION"


def test_reconcile_artifacts_sha256_match_and_mismatch(tmp_path):
    manifest = _fixture_manifest(tmp_path)
    # Build a ledger that agrees for every kind → no tokens.
    ledger = {a["kind"]: a["sha256"] for a in manifest["artifacts"]}
    assert reconcile_artifacts_sha256(manifest, ledger) == []

    # Flip one ledger entry → exactly one ARTIFACTS_SHA256_MISMATCH.
    ledger["usdz"] = "f" * 64
    tokens = reconcile_artifacts_sha256(manifest, ledger)
    assert len(tokens) == 1 and tokens[0].startswith("ARTIFACTS_SHA256_MISMATCH")

    # Empty / missing ledger → no reconciliation (uploader hadn't recorded).
    assert reconcile_artifacts_sha256(manifest, {}) == []
    assert reconcile_artifacts_sha256(manifest, None) == []


def test_summarize(tmp_path):
    manifest = _fixture_manifest(tmp_path)
    s = _summarize(manifest)
    assert s["anchor_count"] == 3
    assert s["unverified"] is False
    assert s["artifact_count"] == len(manifest["artifacts"])
    assert s["total_bytes"] > 0


def test_classify_failures_permanent_vs_transient():
    # any permanent token → fatal
    fatal, _ = classify_failures(["CHECKSUM_MISMATCH"], attempts=1)
    assert fatal is True
    fatal, _ = classify_failures(["SCHEMA_VIOLATION", "MISSING_FILE"], attempts=1)
    assert fatal is True

    # MISSING_FILE alone: transient early, fatal after the bounded attempts
    fatal, _ = classify_failures(["MISSING_FILE"], attempts=1)
    assert fatal is False
    fatal, _ = classify_failures(["MISSING_FILE"], attempts=2)
    assert fatal is True

    # reconciliation mismatch is permanent
    fatal, _ = classify_failures(["ARTIFACTS_SHA256_MISMATCH"], attempts=1)
    assert fatal is True

    with pytest.raises(ValueError):
        classify_failures([], attempts=1)


def test_validator_end_to_end_on_fixture(tmp_path):
    """The vendored validator accepts a fresh fixture and names CHECKSUM_MISMATCH
    when an artifact's bytes are corrupted (the re-run proof's mechanism)."""
    bundle = tmp_path / "bundle"
    validator.make_fixture(str(bundle))
    assert validator.validate_bundle(str(bundle)) == []

    with open(bundle / "scan.usdz", "ab") as fh:
        fh.write(b"CORRUPTION")
    failures = validator.validate_bundle(str(bundle))
    tokens = {f.split(":", 1)[0] for f in failures}
    assert "CHECKSUM_MISMATCH" in tokens
