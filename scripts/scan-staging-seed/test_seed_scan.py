"""Unit tests for scripts/scan-staging-seed/seed_scan.py.

No network, no staging creds — these prove the HARD GUARD (the prod ref is
rejected, only the staging ref is accepted) and the plan-building logic
(bare I104 keys, the dual snake_case/camelCase verify payload contract,
idempotent derivation). `--dry-run` is exercised through `main()` directly,
which is also this deliverable's manual test plan (no staging creds
assumed present in this lane).
"""

from __future__ import annotations

import json

import pytest

import seed_scan as ss


# ─── the hard guard ─────────────────────────────────────────────────────────


def test_validate_target_url_accepts_staging():
    ss.validate_target_url(f"https://{ss.STAGING_REF}.supabase.co")


def test_validate_target_url_rejects_prod_ref():
    with pytest.raises(ss.TargetGuardError, match=ss.PROD_REF):
        ss.validate_target_url(f"https://{ss.PROD_REF}.supabase.co")


def test_validate_target_url_rejects_prod_ref_even_when_staging_ref_also_present():
    """Belt-and-suspenders: a URL naming BOTH refs (a copy/paste accident, a
    malformed override) must still be refused — prod presence wins."""
    with pytest.raises(ss.TargetGuardError, match=ss.PROD_REF):
        ss.validate_target_url(f"https://{ss.PROD_REF}.supabase.co/{ss.STAGING_REF}")


def test_validate_target_url_rejects_unrelated_url():
    with pytest.raises(ss.TargetGuardError):
        ss.validate_target_url("https://example.com")


def test_validate_target_url_rejects_empty_or_none():
    with pytest.raises(ss.TargetGuardError):
        ss.validate_target_url("")
    with pytest.raises(ss.TargetGuardError):
        ss.validate_target_url(None)


def test_main_dry_run_refuses_prod_url(capsys):
    rc = ss.main(["--dry-run", "--supabase-url", f"https://{ss.PROD_REF}.supabase.co"])
    assert rc == 2
    err = capsys.readouterr().err
    assert "REFUSED" in err
    assert ss.PROD_REF in err


def test_main_real_run_refuses_prod_url_before_checking_creds(capsys, monkeypatch):
    """The guard runs before anything else — even before the missing-creds
    check a real (non-dry-run) invocation would otherwise hit next."""
    monkeypatch.delenv("STAGING_SUPABASE_SERVICE_ROLE_KEY", raising=False)
    rc = ss.main(["--supabase-url", f"https://{ss.PROD_REF}.supabase.co"])
    assert rc == 2
    assert "REFUSED" in capsys.readouterr().err


def test_main_real_run_without_dry_run_requires_user_and_room_id(capsys):
    rc = ss.main(["--supabase-url", f"https://{ss.STAGING_REF}.supabase.co"])
    assert rc == 2
    assert "user-id" in capsys.readouterr().err.lower()


# ─── --dry-run as the manual test plan for deliverable 2 ──────────────────


def test_main_dry_run_against_staging_succeeds_with_no_creds(capsys, monkeypatch):
    for var in ("STAGING_SUPABASE_SERVICE_ROLE_KEY", "STAGING_SEED_USER_ID", "STAGING_SEED_ROOM_ID"):
        monkeypatch.delenv(var, raising=False)

    rc = ss.main(["--dry-run", "--supabase-url", f"https://{ss.STAGING_REF}.supabase.co"])
    assert rc == 0

    out = capsys.readouterr()
    plan = json.loads(out.out)
    assert plan["placeholder_ids"] is True
    assert "dry run" in out.err


def test_main_dry_run_with_real_ids_uses_them(capsys):
    rc = ss.main([
        "--dry-run",
        "--supabase-url", f"https://{ss.STAGING_REF}.supabase.co",
        "--user-id", "11111111-1111-1111-1111-111111111111",
        "--room-id", "22222222-2222-2222-2222-222222222222",
    ])
    assert rc == 0
    plan = json.loads(capsys.readouterr().out)
    assert plan["placeholder_ids"] is False
    assert plan["user_id"] == "11111111-1111-1111-1111-111111111111"
    assert plan["room_id"] == "22222222-2222-2222-2222-222222222222"


# ─── plan building ──────────────────────────────────────────────────────────

UID = "33333333-3333-3333-3333-333333333333"
RID = "44444444-4444-4444-4444-444444444444"


def test_build_plan_keys_match_the_canonical_folder_shape():
    """{folder}/{userId}/{roomId}/{file}, folders per keys.py's KIND_TO_FOLDER."""
    plan, mesh_bytes = ss.build_plan(UID, RID)
    assert plan.mesh_key == f"mesh/{UID}/{RID}/mesh.ply"
    assert plan.captured_room_key == f"captured_room/{UID}/{RID}/captured_room.json"
    assert len(mesh_bytes) > 0
    assert plan.placeholder_ids is False


def test_build_plan_room_scans_row_uses_bare_keys_not_urls():
    """I104: mesh_url/captured_room_json_url are bare bucket-relative keys —
    the room-scans bucket is private, so a public:// URL there never
    resolves. See keys.py's module docstring."""
    plan, _ = ss.build_plan(UID, RID)
    row = plan.room_scan_row
    assert row["mesh_url"] == plan.mesh_key
    assert row["captured_room_json_url"] == plan.captured_room_key
    assert "http://" not in row["mesh_url"]
    assert "https://" not in row["mesh_url"]
    assert row["status"] == "ready"
    assert row["user_id"] == UID
    assert row["room_id"] == RID
    assert row["name"] == ss.SEED_MARKER


def test_build_plan_room_file_row_is_version_one():
    plan, _ = ss.build_plan(UID, RID)
    assert plan.room_file_row["version"] == 1
    assert plan.room_file_row["scan_id"] == plan.room_scan_row["id"]


def test_build_plan_verify_payload_satisfies_both_readers():
    """The payload must satisfy dispatch-scan-modal/lib.ts's
    extractTaskInputIds (scan_id, room_file_version — snake_case) AND 00490's
    scan_worker_update_room_file task-binding check (payload->>'roomFileId' /
    payload->>'scanId' — camelCase) off the SAME payload column."""
    plan, _ = ss.build_plan(UID, RID)
    payload = plan.verify_task_payload

    assert payload["scan_id"] == plan.room_scan_row["id"]
    assert isinstance(payload["room_file_version"], int)
    assert payload["room_file_id"] == plan.room_file_row["id"]

    assert payload["scanId"] == plan.room_scan_row["id"]
    assert payload["roomFileId"] == plan.room_file_row["id"]
    assert payload["roomFileVersion"] == 1


def test_build_plan_is_idempotent_for_the_same_user_and_room():
    plan_a, _ = ss.build_plan(UID, RID)
    plan_b, _ = ss.build_plan(UID, RID)
    assert plan_a.room_scan_row["id"] == plan_b.room_scan_row["id"]
    assert plan_a.room_file_row["id"] == plan_b.room_file_row["id"]
    assert plan_a.idempotency_key == plan_b.idempotency_key


def test_build_plan_differs_for_different_room():
    other_room = "55555555-5555-5555-5555-555555555555"
    plan_a, _ = ss.build_plan(UID, RID)
    plan_b, _ = ss.build_plan(UID, other_room)
    assert plan_a.room_scan_row["id"] != plan_b.room_scan_row["id"]
    assert plan_a.idempotency_key != plan_b.idempotency_key


def test_build_plan_mesh_scale_is_recorded():
    plan, _ = ss.build_plan(UID, RID, mesh_scale=1.01)
    assert plan.mesh_scale == 1.01
