"""Ingest plan/decision logic (pure) — no network, no storage."""

from __future__ import annotations

import json

import pytest

from patina_scan_worker.errors import PermanentError, classify_failures
from patina_scan_worker.stages import validator
from patina_scan_worker.stages.ingest import (
    plan_downloads,
    reconcile_artifacts_sha256,
    _summarize,
)

UID = "faa8cb85-c74c-45d0-887c-d7826756c2b4"
ROOM = "11111111-2222-3333-4444-555555555555"
MANIFEST_KEY = f"manifests/{UID}/{ROOM}/manifest.json"


def _fixture_manifest(tmp_path) -> dict:
    bundle = tmp_path / "bundle"
    validator.make_fixture(str(bundle))
    with open(bundle / "manifest.json", encoding="utf-8") as fh:
        return json.load(fh)


def test_plan_downloads_real_layout_per_kind_folders(tmp_path):
    """Regression guard for C1: against the REAL iOS layout (manifest at
    manifests/{uid}/{room}/…, no columns set), column-less kinds resolve into
    their PER-KIND folder — never into the manifest's `manifests/` prefix."""
    manifest = _fixture_manifest(tmp_path)
    scan_row = {"user_id": UID, "room_id": ROOM}
    plan = plan_downloads(manifest, MANIFEST_KEY, scan_row)
    by_rel = {i.rel_path: i.object_key for i in plan}

    # column-less kinds → per-kind folder (the bug that C1 caught)
    assert by_rel["keyframes/keyframe_index.ndjson"] == f"keyframes/{UID}/{ROOM}/keyframe_index.ndjson"
    assert by_rel["keyframes/keyframe_summary.json"] == f"keyframes/{UID}/{ROOM}/keyframe_summary.json"
    # column-backed kinds (no URL set → fall through to their folder)
    assert by_rel["captured_room.json"] == f"captured_room/{UID}/{ROOM}/captured_room.json"
    assert by_rel["scan.usdz"] == f"usdz/{UID}/{ROOM}/scan.usdz"
    assert by_rel["mesh.ply"] == f"mesh/{UID}/{ROOM}/mesh.ply"
    assert by_rel["depth.tar"] == f"depth/{UID}/{ROOM}/depth.tar"
    assert by_rel["keyframes.tar"] == f"bundle/{UID}/{ROOM}/keyframes.tar"
    # every planned item carries a declared sha256 + a valid owner-anchored key
    assert all(len(i.declared_sha) == 64 for i in plan)
    assert all(k.split("/")[1] == UID and k.split("/")[2] == ROOM for k in by_rel.values())


def test_plan_downloads_column_key_preferred(tmp_path):
    manifest = _fixture_manifest(tmp_path)
    scan_row = {
        "user_id": UID,
        "room_id": ROOM,
        "captured_room_json_url": (
            f"https://p/storage/v1/object/public/room-scans/captured_room/{UID}/{ROOM}/captured_room.json"
        ),
    }
    plan = plan_downloads(manifest, MANIFEST_KEY, scan_row)
    by_rel = {i.rel_path: i.object_key for i in plan}
    assert by_rel["captured_room.json"] == f"captured_room/{UID}/{ROOM}/captured_room.json"


def test_plan_downloads_rejects_foreign_owner_prefix(tmp_path):
    """Regression guard for C2: a doctored column pointing at a FOREIGN uid prefix
    is rejected fatally (OWNERSHIP_VIOLATION) — the service-key RLS-equivalent."""
    manifest = _fixture_manifest(tmp_path)
    foreign = "00000000-0000-0000-0000-000000000000"
    scan_row = {
        "user_id": UID,
        "room_id": ROOM,
        "captured_room_json_url": (
            f"https://p/storage/v1/object/public/room-scans/captured_room/{foreign}/{ROOM}/captured_room.json"
        ),
    }
    with pytest.raises(PermanentError) as ei:
        plan_downloads(manifest, MANIFEST_KEY, scan_row)
    assert ei.value.token == "OWNERSHIP_VIOLATION"


def test_plan_downloads_rejects_path_escape(tmp_path):
    manifest = _fixture_manifest(tmp_path)
    manifest["artifacts"].append(
        {"kind": "mesh", "relativePath": "../escape.bin", "sha256": "0" * 64}
    )
    with pytest.raises(PermanentError) as ei:
        plan_downloads(manifest, MANIFEST_KEY, {"user_id": UID, "room_id": ROOM})
    assert ei.value.token == "PATH_VIOLATION"


def test_plan_downloads_bad_artifacts_shape():
    with pytest.raises(PermanentError) as ei:
        plan_downloads({"artifacts": "not-a-list"}, MANIFEST_KEY, {})
    assert ei.value.token == "SCHEMA_VIOLATION"


def test_plan_downloads_skips_unresolvable_kind(tmp_path):
    # a kind with no URL column and no B-18 folder (real M2 orphan photosManifest)
    # is SKIPPED, not hard-failed — the validator names MISSING_FILE instead.
    manifest = _fixture_manifest(tmp_path)
    manifest["artifacts"].append(
        {"kind": "photosManifest", "relativePath": "photos_metadata.json", "sha256": "0" * 64}
    )
    plan = plan_downloads(manifest, MANIFEST_KEY, {"user_id": UID, "room_id": ROOM})
    assert not any(i.kind == "photosManifest" for i in plan)   # skipped, no raise


def test_reconcile_artifacts_sha256_match_and_mismatch(tmp_path):
    manifest = _fixture_manifest(tmp_path)
    ledger = {a["kind"]: a["sha256"] for a in manifest["artifacts"]}
    assert reconcile_artifacts_sha256(manifest, ledger) == []

    ledger["usdz"] = "f" * 64
    tokens = reconcile_artifacts_sha256(manifest, ledger)
    assert len(tokens) == 1 and tokens[0].startswith("ARTIFACTS_SHA256_MISMATCH")

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
    fatal, _ = classify_failures(["CHECKSUM_MISMATCH"], attempts=1)
    assert fatal is True
    fatal, _ = classify_failures(["SCHEMA_VIOLATION", "MISSING_FILE"], attempts=1)
    assert fatal is True
    fatal, _ = classify_failures(["OWNERSHIP_VIOLATION"], attempts=1)
    assert fatal is True

    fatal, _ = classify_failures(["MISSING_FILE"], attempts=1)
    assert fatal is False
    fatal, _ = classify_failures(["MISSING_FILE"], attempts=2)
    assert fatal is True

    with pytest.raises(ValueError):
        classify_failures([], attempts=1)


def test_validator_end_to_end_on_fixture(tmp_path):
    bundle = tmp_path / "bundle"
    validator.make_fixture(str(bundle))
    assert validator.validate_bundle(str(bundle)) == []

    with open(bundle / "scan.usdz", "ab") as fh:
        fh.write(b"CORRUPTION")
    failures = validator.validate_bundle(str(bundle))
    tokens = {f.split(":", 1)[0] for f in failures}
    assert "CHECKSUM_MISMATCH" in tokens
