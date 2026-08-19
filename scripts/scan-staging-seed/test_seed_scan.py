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


# ─── copy-prod (W2): the prod-read-only guard ──────────────────────────────


def test_validate_source_url_accepts_prod_ref():
    ss.validate_source_url(f"https://{ss.PROD_REF}.supabase.co")


def test_validate_source_url_rejects_staging_ref():
    """The mirror image of validate_target_url's guard: copy-prod's SOURCE
    must be prod, so a staging (or any non-prod) URL is refused."""
    with pytest.raises(ss.TargetGuardError, match=ss.PROD_REF):
        ss.validate_source_url(f"https://{ss.STAGING_REF}.supabase.co")


def test_validate_source_url_rejects_unrelated_url():
    with pytest.raises(ss.TargetGuardError):
        ss.validate_source_url("https://example.com")


def test_validate_source_url_rejects_empty_or_none():
    with pytest.raises(ss.TargetGuardError):
        ss.validate_source_url("")
    with pytest.raises(ss.TargetGuardError):
        ss.validate_source_url(None)


def test_read_only_client_refuses_non_prod_url():
    """The constructor runs validate_source_url — a ReadOnlyClient can never
    be pointed anywhere but prod, even before any request is made."""
    with pytest.raises(ss.TargetGuardError, match=ss.PROD_REF):
        ss.ReadOnlyClient(f"https://{ss.STAGING_REF}.supabase.co", "fake-key")


def test_read_only_client_has_no_write_methods():
    """Structural guard: the class must not expose put/post/patch/delete —
    the only way to touch prod through this object is a GET."""
    for verb in ("put", "post", "patch", "delete"):
        assert not hasattr(ss.ReadOnlyClient, verb), (
            f"ReadOnlyClient must not expose a {verb!r} method — it is the "
            "prod-read-only guard, not merely a convention"
        )
    # the only network-shaped methods are read ones, plus lifecycle/close
    public_methods = {
        name for name in vars(ss.ReadOnlyClient)
        if not name.startswith("_") and callable(getattr(ss.ReadOnlyClient, name))
    }
    assert public_methods <= {"get_rest", "get_storage_object", "close"}


def test_read_only_client_is_a_context_manager():
    assert hasattr(ss.ReadOnlyClient, "__enter__")
    assert hasattr(ss.ReadOnlyClient, "__exit__")


# ─── copy-prod: id derivation + key rewriting ──────────────────────────────


def test_derive_copy_ids_is_deterministic_for_same_staging_user():
    a = ss.derive_copy_ids("11111111-1111-1111-1111-111111111111")
    b = ss.derive_copy_ids("11111111-1111-1111-1111-111111111111")
    assert a == b


def test_derive_copy_ids_differs_across_staging_users():
    a = ss.derive_copy_ids("11111111-1111-1111-1111-111111111111")
    b = ss.derive_copy_ids("22222222-2222-2222-2222-222222222222")
    assert a != b


def test_derive_copy_ids_room_scan_room_file_are_distinct_uuids():
    room_id, scan_id, room_file_id = ss.derive_copy_ids("11111111-1111-1111-1111-111111111111")
    assert len({room_id, scan_id, room_file_id}) == 3


PROD_UID = "74056c2a-866d-42b0-9e2a-d473c2484316"
PROD_RID = "da3af6b7-a4e2-4fd7-be24-16529365c5a3"
STG_UID = "c9740823-c2dc-401e-9289-500efe2cb496"
STG_RID = "4d860fcc-976a-5d3b-b46b-e270ef7085f5"


def test_rewrite_key_swaps_owner_and_room_segments():
    src = f"captured_room/{PROD_UID}/{PROD_RID}/captured_room.json"
    dst = ss.rewrite_key(src, PROD_UID, PROD_RID, STG_UID, STG_RID)
    assert dst == f"captured_room/{STG_UID}/{STG_RID}/captured_room.json"


def test_rewrite_key_preserves_extra_path_segments():
    src = f"photos/{PROD_UID}/{PROD_RID}/sub/auto_002.jpg"
    dst = ss.rewrite_key(src, PROD_UID, PROD_RID, STG_UID, STG_RID)
    assert dst == f"photos/{STG_UID}/{STG_RID}/sub/auto_002.jpg"


def test_rewrite_key_rejects_owner_mismatch():
    src = f"captured_room/{'0' * 8}-0000-0000-0000-{'0' * 12}/{PROD_RID}/captured_room.json"
    with pytest.raises(ValueError):
        ss.rewrite_key(src, PROD_UID, PROD_RID, STG_UID, STG_RID)


def test_rewrite_key_rejects_room_mismatch():
    src = f"captured_room/{PROD_UID}/{'0' * 8}-0000-0000-0000-{'0' * 12}/captured_room.json"
    with pytest.raises(ValueError):
        ss.rewrite_key(src, PROD_UID, PROD_RID, STG_UID, STG_RID)


def test_rewrite_key_rejects_too_short_key():
    with pytest.raises(ValueError):
        ss.rewrite_key("captured_room/only-two-segments", PROD_UID, PROD_RID, STG_UID, STG_RID)


# ─── copy-prod: build_copy_manifest (pure) ─────────────────────────────────


def _keys_mod():
    return ss._load_keys()


def _scan_row(**overrides):
    row = {
        "user_id": PROD_UID,
        "room_id": PROD_RID,
        "captured_room_json_url": f"https://x/storage/v1/object/public/room-scans/captured_room/{PROD_UID}/{PROD_RID}/captured_room.json",
        "mesh_url": None,
        "photos_manifest_url": None,
        "model_url_gltf": f"https://x/storage/v1/object/public/room-scans/glb/{PROD_UID}/{PROD_RID}/scan.glb",
        "model_url": f"https://x/storage/v1/object/public/room-scans/usdz/{PROD_UID}/{PROD_RID}/scan.usdz",
        "depth_archive_url": f"https://x/storage/v1/object/public/room-scans/depth/{PROD_UID}/{PROD_RID}/depth.tar",
        "world_map_url": None,
        "scan_bundle_url": f"https://x/storage/v1/object/public/room-scans/bundle/{PROD_UID}/{PROD_RID}/keyframes.tar",
        "bundle_manifest_url": f"https://x/storage/v1/object/public/room-scans/manifests/{PROD_UID}/{PROD_RID}/manifest.json",
        "coverage_heatmap_url": None,
    }
    row.update(overrides)
    return row


def _image_row(i: int, is_primary: bool = False, role: str = "auto"):
    return {
        "id": f"img-{i}",
        "role": role,
        "is_primary": is_primary,
        "display_order": i,
        "captured_at": "2026-07-29T04:53:09+00:00",
        "image_url": f"https://x/storage/v1/object/public/room-scans/photos/{PROD_UID}/{PROD_RID}/auto_{i:03d}.jpg",
        "camera_transform": [0.0] * 16,
        "camera_intrinsics": {"fx": 1, "fy": 1, "cx": 1, "cy": 1, "width": 1, "height": 1},
    }


def test_build_copy_manifest_captures_the_present_artifacts():
    manifest = ss.build_copy_manifest(_scan_row(), [_image_row(i) for i in range(3)], _keys_mod())
    assert manifest.captured_room_src_key == f"captured_room/{PROD_UID}/{PROD_RID}/captured_room.json"
    assert manifest.glb_src_key == f"glb/{PROD_UID}/{PROD_RID}/scan.glb"
    assert manifest.mesh_src_key is None
    assert manifest.photos_manifest_src_key is None
    assert len(manifest.photo_src_keys) == 3
    assert manifest.photo_total_available == 3
    assert manifest.photo_capped is False


def test_build_copy_manifest_notes_null_columns_as_skipped():
    manifest = ss.build_copy_manifest(_scan_row(), [_image_row(0)], _keys_mod())
    joined = " | ".join(manifest.skipped)
    assert "mesh.ply" in joined
    assert "photos_manifest.json" in joined
    assert "hero thumbnail" in joined


def test_build_copy_manifest_notes_explicitly_out_of_scope_artifacts_as_skipped():
    manifest = ss.build_copy_manifest(_scan_row(), [_image_row(0)], _keys_mod())
    joined = " | ".join(manifest.skipped)
    assert "usdz" in joined
    assert "depth archive" in joined
    assert "bundle/keyframes archive" in joined
    assert "bundle manifest.json" in joined
    # never-present columns on this fixture aren't noted (nothing to skip)
    assert "world map" not in joined
    assert "coverage heatmap" not in joined


def test_build_copy_manifest_detects_hero_present():
    manifest = ss.build_copy_manifest(
        _scan_row(), [_image_row(0, is_primary=True), _image_row(1)], _keys_mod(),
    )
    assert not any("hero thumbnail" in s for s in manifest.skipped)


def test_build_copy_manifest_caps_photos_and_notes_it():
    rows = [_image_row(i) for i in range(5)]
    manifest = ss.build_copy_manifest(_scan_row(), rows, _keys_mod(), photo_cap=3)
    assert len(manifest.photo_src_keys) == 3
    assert manifest.photo_total_available == 5
    assert manifest.photo_capped is True
    assert any("beyond the 3-photo" in s for s in manifest.skipped)


def test_build_copy_manifest_dedupes_photo_keys():
    rows = [_image_row(0), _image_row(0)]  # identical image_url
    manifest = ss.build_copy_manifest(_scan_row(), rows, _keys_mod())
    assert len(manifest.photo_src_keys) == 1


def test_build_copy_manifest_rejects_a_key_outside_the_scan_owner_prefix():
    """Ownership rail (C2): a URL column pointing outside this scan's own
    {user}/{room} prefix must never be treated as copyable — it is SKIPPED
    with a reason, not silently accepted."""
    bad_row = _scan_row(
        captured_room_json_url="https://x/storage/v1/object/public/room-scans/captured_room/SOMEONE-ELSE/OTHER-ROOM/captured_room.json",
    )
    manifest = ss.build_copy_manifest(bad_row, [], _keys_mod())
    assert manifest.captured_room_src_key is None
    assert any("captured_room.json" in s and "SKIPPED" in s for s in manifest.skipped)


# ─── copy-prod: the "Kody's own data only" ownership rail ─────────────────


def test_execute_copy_prod_refuses_a_scan_belonging_to_another_user(monkeypatch):
    """execute_copy_prod must refuse to copy a scan whose user_id isn't
    PROD_KODY_USER_ID, even if the caller passed a --scan-id for someone
    else's data — this is a hard rail, not merely a selection filter the
    caller is trusted to have applied."""

    class FakeReadOnly:
        def __init__(self, base_url, key):
            ss.validate_source_url(base_url)

        def get_rest(self, table, params):
            assert table == "room_scans"
            return [{"id": "some-scan", "user_id": "not-kody", "room_id": "some-room"}]

        def close(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            pass

    monkeypatch.setattr(ss, "ReadOnlyClient", FakeReadOnly)

    with pytest.raises(RuntimeError, match="refusing to copy"):
        ss.execute_copy_prod(
            prod_url=f"https://{ss.PROD_REF}.supabase.co",
            prod_service_role_key="fake",
            staging_url=f"https://{ss.STAGING_REF}.supabase.co",
            staging_service_role_key="fake",
            scan_id="some-scan",
            staging_user_id=STG_UID,
            dry_run=True,
        )


def test_execute_copy_prod_refuses_non_prod_source_before_any_call():
    with pytest.raises(ss.TargetGuardError, match=ss.PROD_REF):
        ss.execute_copy_prod(
            prod_url=f"https://{ss.STAGING_REF}.supabase.co",
            prod_service_role_key="fake",
            staging_url=f"https://{ss.STAGING_REF}.supabase.co",
            staging_service_role_key="fake",
            scan_id="whatever",
            staging_user_id=STG_UID,
            dry_run=True,
        )


def test_execute_copy_prod_refuses_prod_as_write_target_before_any_call():
    with pytest.raises(ss.TargetGuardError, match=ss.PROD_REF):
        ss.execute_copy_prod(
            prod_url=f"https://{ss.PROD_REF}.supabase.co",
            prod_service_role_key="fake",
            staging_url=f"https://{ss.PROD_REF}.supabase.co",
            staging_service_role_key="fake",
            scan_id="whatever",
            staging_user_id=STG_UID,
            dry_run=True,
        )


# ─── copy-prod: CLI wiring doesn't disturb the legacy `seed` flow ─────────


def test_main_copy_prod_dispatches_before_the_legacy_parser(capsys):
    """--scan-id is copy-prod-only; if this were mis-routed to the legacy
    parser it would fail with 'unrecognized arguments', not a guard refusal."""
    rc = ss.main([
        "copy-prod",
        "--scan-id", "x",
        "--staging-user-id", STG_UID,
        "--prod-url", f"https://{ss.STAGING_REF}.supabase.co",  # wrong on purpose
    ])
    assert rc == 2
    assert "REFUSED" in capsys.readouterr().err


def test_main_copy_prod_requires_staging_user_id(monkeypatch, capsys):
    for var in ("STAGING_SEED_USER_ID", "PROD_SUPABASE_SERVICE_ROLE_KEY", "STAGING_SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(var, raising=False)
    rc = ss.main(["copy-prod", "--scan-id", "x"])
    assert rc == 2
    assert "staging-user-id" in capsys.readouterr().err.lower()
