#!/usr/bin/env python3
"""Seed ONE synthetic test scan on STAGING so the Rendered Room v2 W1 verify
lane (`services/scan-modal`'s `verify` Modal function, dispatched by
`supabase/functions/dispatch-scan-modal`) can be exercised end to end there.

Context: docs/architecture/CAD Generation Pipeline/DELIVERY-PLAN.md W1.

── HARD GUARD (never move this) ─────────────────────────────────────────────
This script refuses to run — including in --dry-run mode — unless the target
Supabase URL/ref names the STAGING project (`vuesoyhfrjabfxbrzekd`), and
raises a NAMED error if it sees the PRODUCTION ref (`bkvcixdmuyejfzcijpdg`).
See `validate_target_url` / `TargetGuardError`.

── Provenance ────────────────────────────────────────────────────────────────
The synthetic rectangular-room generator (`captured_room_json`, `mesh_points`,
`write_ply`) is IMPORTED from services/scan-modal/tests/_synthetic.py rather
than duplicated here — see `_load_synthetic()`. If that module's function
signatures move, this script moves with them. `mesh_scale=1.01` (its own
docstring's convention) gives verify a deliberate 1% disagreement to find.

── Why this needs a real, pre-existing user_id/room_id ──────────────────────
`room_scans.room_id` carries a real FK to `rooms(id) ON DELETE SET NULL`
(00019), and dispatch-scan-modal's `keyMatchesScanOwner` REQUIRES a non-empty
`room_id` matching the storage key's segment [2] before it will ever spawn
Modal (an absent/NULL room_id is rejected as KeyPrefixError, fatal, before
verify runs at all). So this script does not fabricate a user/room identity
chain (profiles → rooms) from nothing — it takes an EXISTING staging
user_id/room_id (an operator-designated staging test account + room) via
`--user-id`/`--room-id` or the STAGING_SEED_USER_ID/STAGING_SEED_ROOM_ID env
vars, and seeds a scan+room_file+verify task underneath them. See README.md.

── Idempotency ────────────────────────────────────────────────────────────────
SEED_MARKER is the fixed, human-recognizable name written to `room_scans.name`
(pattern: the existing "seed:<slug>" markers, e.g. `seed:kody-2026-07-07-
strata`). The scan/room_file ids are DERIVED (uuid5) from
(marker, user_id, room_id), so re-running with the same user/room reuses the
same rows (upsert, not insert) and RE-ARMS the verify task via
`enqueue_agent_task`'s `p_on_conflict='resurrect'` — useful for re-exercising
the verify lane without ever accumulating duplicate seed rows.

Usage:
    # print the full plan, make no network calls, no creds required:
    python3 seed_scan.py --dry-run

    # actually seed staging (real staging user/room id + service-role key):
    STAGING_SUPABASE_URL=https://vuesoyhfrjabfxbrzekd.supabase.co \\
    STAGING_SUPABASE_SERVICE_ROLE_KEY=... \\
    STAGING_SEED_USER_ID=<staging profiles.id> \\
    STAGING_SEED_ROOM_ID=<staging rooms.id, owned by that user> \\
    python3 seed_scan.py

── `copy-prod` subcommand (W2) ────────────────────────────────────────────────
Copies ONE real scan bundle from Strata PROD (read-only: storage GETs + REST
selects only, via `ReadOnlyClient`, which has no write method at all — see
`validate_source_url`) to STAGING, so the splat/renders Modal stages have a
genuine posed-photo scan to run against (W1's `seed_scan.py` lane above only
ever wrote a synthetic rectangular room). Marker `COPY_SEED_MARKER`; the
staging scan/room/room_file ids are derived (uuid5) from
`(COPY_SEED_MARKER, staging_user_id)` — deterministic and idempotent, same
shape as the `seed` lane above, but note this means every `copy-prod` run
targets the SAME staging scan regardless of which prod scan_id was given (by
design: ONE prod-copy fixture, replaced wholesale, never accumulating).

    STAGING_SUPABASE_URL=https://vuesoyhfrjabfxbrzekd.supabase.co \\
    STAGING_SUPABASE_SERVICE_ROLE_KEY=... \\
    PROD_SUPABASE_SERVICE_ROLE_KEY=... \\
    python3 seed_scan.py copy-prod \\
      --scan-id <prod room_scans.id, owned by PROD_KODY_USER_ID> \\
      --staging-user-id <staging profiles.id>
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

__all__ = [
    "STAGING_REF",
    "PROD_REF",
    "SEED_MARKER",
    "TargetGuardError",
    "validate_target_url",
    "SeedPlan",
    "build_plan",
    "execute_plan",
    "main",
    # copy-prod (W2)
    "COPY_SEED_MARKER",
    "PROD_KODY_USER_ID",
    "PHOTO_CAP",
    "validate_source_url",
    "ReadOnlyClient",
    "derive_copy_ids",
    "rewrite_key",
    "CopyManifest",
    "build_copy_manifest",
    "execute_copy_prod",
]

# ─── target refs (the hard guard) ───────────────────────────────────────────
STAGING_REF = "vuesoyhfrjabfxbrzekd"
PROD_REF = "bkvcixdmuyejfzcijpdg"

SEED_MARKER = "seed:rendered-room-v2-w1-verify-staging"

BUCKET = "room-scans"
MESH_FOLDER = "mesh"                 # keys.py KIND_TO_FOLDER["mesh"]
CAPTURED_ROOM_FOLDER = "captured_room"  # keys.py KIND_TO_FOLDER["capturedRoomJson"]

# A scale of 1.01 is a mesh that disagrees with the parametric model by 1% —
# _synthetic.py's own documented convention for giving verify something to
# find. See services/scan-modal/tests/_synthetic.py's module docstring.
MESH_SCALE = 1.01

# Obviously-fake placeholders used ONLY for --dry-run when no real staging
# user/room id was supplied — never sent over the network.
_PLACEHOLDER_USER_ID = "00000000-0000-4000-a000-0000dryrun01"
_PLACEHOLDER_ROOM_ID = "00000000-0000-4000-a000-0000dryrun02"


class TargetGuardError(RuntimeError):
    """Refused: this script's target is not the staging Supabase project."""


def validate_target_url(url: str | None) -> None:
    """HARD GUARD. Raises TargetGuardError unless `url` names the staging
    ref, and names the production ref explicitly when that's what was seen.
    Called unconditionally — including under --dry-run — so a misconfigured
    environment can never even print a plan against the wrong target."""
    if not url or not url.strip():
        raise TargetGuardError(
            "no Supabase URL provided — set --supabase-url or STAGING_SUPABASE_URL"
        )
    if PROD_REF in url:
        raise TargetGuardError(
            f"refusing to run against PRODUCTION (ref {PROD_REF!r} found in "
            f"{url!r}) — this script seeds synthetic test data and must NEVER "
            "touch Strata prod"
        )
    if STAGING_REF not in url:
        raise TargetGuardError(
            f"refusing to run: {url!r} does not name the staging ref "
            f"({STAGING_REF!r}) — this script only ever runs against the "
            "staging Supabase project"
        )


# ─── copy-prod (W2): read-only PROD source + the staging write target ──────

# The only prod identity this lane is ever allowed to read from (task rail:
# "The scan MUST belong to Kody's prod user ... No other user's scan is
# eligible"). Baked in as a hard assertion in fetch_prod_scan, not just a
# selection filter the caller is trusted to have applied upstream.
PROD_KODY_USER_ID = "74056c2a-866d-42b0-9e2a-d473c2484316"

# The existing seed:<slug> marker convention (see SEED_MARKER above). A
# DIFFERENT marker from W1's, deliberately: this lane's ids are derived from
# (marker, staging_user_id) only — see derive_copy_ids — so it never collides
# with W1's synthetic verify fixture, which lives under its own room/marker.
COPY_SEED_MARKER = "seed:rendered-room-v2-w2-prod-copy"

# dispatch-scan-modal/lib.ts's PHOTO_URL_CAP — the dispatcher's exact cap on
# how many photo keys it will ever sign+send to Modal for one splat task.
# Copying anything past this cap would be dead weight staging will never use.
PHOTO_CAP = 80


def validate_source_url(url: str | None) -> None:
    """HARD GUARD for copy-prod's READ-ONLY source. The mirror image of
    validate_target_url: that function forbids the production ref on a WRITE
    target; this one REQUIRES it on the read source (copy-prod's whole point
    is reading real prod data). Called unconditionally before any prod call."""
    if not url or not url.strip():
        raise TargetGuardError(
            "no source Supabase URL provided — set --prod-url or PROD_SUPABASE_URL"
        )
    if PROD_REF not in url:
        raise TargetGuardError(
            f"refusing to read from {url!r} as the copy-prod source — it does "
            f"not name the production ref ({PROD_REF!r}); copy-prod only ever "
            "reads from Strata prod, never anywhere else"
        )


class ReadOnlyClient:
    """The prod-read-only guard, structural rather than merely conventional:
    this object exposes ONLY `get_rest` / `get_storage_object` (both plain
    HTTP GETs). There is no put/post/patch/delete method anywhere on this
    class — a coding mistake that tries to write through it fails with an
    AttributeError, not a silent prod write. `validate_source_url` runs in
    the constructor, so an instance can never be pointed anywhere but prod."""

    def __init__(self, base_url: str, service_role_key: str):
        validate_source_url(base_url)
        import httpx  # local import — mirrors execute_plan's lazy httpx dependency

        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers=_rest_headers(service_role_key),
            timeout=60.0,
        )

    def get_rest(self, table: str, params: dict[str, str]) -> Any:
        resp = self._client.get(f"/rest/v1/{table}", params=params)
        if resp.status_code >= 400:
            raise RuntimeError(f"GET {table} -> HTTP {resp.status_code}: {resp.text[:400]}")
        return resp.json()

    def get_storage_object(self, bucket: str, key: str) -> bytes:
        resp = self._client.get(f"/storage/v1/object/{bucket}/{key}")
        if resp.status_code >= 400:
            raise RuntimeError(f"GET storage {bucket}/{key} -> HTTP {resp.status_code}: {resp.text[:200]}")
        return resp.content

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "ReadOnlyClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


def _load_keys():
    """Import services/scan-pipeline/.../keys.py by EXACT FILE PATH via
    importlib — deliberately NOT sys.path insertion (unlike _load_synthetic()
    below): that package directory also contains its own http.py, which would
    shadow Python's stdlib `http` package for the rest of the process the
    moment anything (including this script's own httpx dependency) imports
    `http`/`http.client`. keys.py has no sibling-module imports of its own, so
    loading it standalone by path is safe and sys.path stays untouched."""
    import importlib.util

    repo_root = Path(__file__).resolve().parents[2]
    keys_path = repo_root / "services" / "scan-pipeline" / "src" / "patina_scan_worker" / "keys.py"
    if not keys_path.exists():
        raise RuntimeError(f"expected keys.py at {keys_path} — repo layout changed?")
    spec = importlib.util.spec_from_file_location("patina_scan_worker_keys", keys_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not build an import spec for {keys_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def derive_copy_ids(staging_user_id: str) -> tuple[str, str, str]:
    """Deterministic (room_id, scan_id, room_file_id) for the copy-prod
    fixture, derived from (COPY_SEED_MARKER, staging_user_id) ONLY — not from
    the source prod scan_id, so re-running copy-prod (even against a
    different prod scan) always targets the SAME staging scan (idempotent
    replace, never a duplicate — see module docstring)."""
    room_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{COPY_SEED_MARKER}:{staging_user_id}:room"))
    identity_seed = f"{COPY_SEED_MARKER}:{staging_user_id}:{room_id}"
    scan_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{identity_seed}:scan"))
    room_file_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{identity_seed}:room_file:1"))
    return room_id, scan_id, room_file_id


def rewrite_key(source_key: str, prod_user_id: str, prod_room_id: str, staging_user_id: str, staging_room_id: str) -> str:
    """`{folder}/{prodUserId}/{prodRoomId}/{file}` -> `{folder}/{stagingUserId}/
    {stagingRoomId}/{file}`. Asserts the source key's owner/room segments
    match the expected prod identity FIRST (the C2/OWNERSHIP_VIOLATION check
    keys.py's assert_owner_prefix does on the write side) — refuses to rewrite
    a key that doesn't actually belong to the scan we think we're copying."""
    parts = source_key.split("/")
    if len(parts) < 3:
        raise ValueError(f"key too short to rewrite (need {{folder}}/{{uid}}/{{room}}/...): {source_key!r}")
    if parts[1] != prod_user_id or parts[2] != prod_room_id:
        raise ValueError(
            f"key owner/room segments {parts[1]!r}/{parts[2]!r} do not match the "
            f"expected prod scan identity {prod_user_id!r}/{prod_room_id!r}: {source_key!r}"
        )
    return "/".join([parts[0], staging_user_id, staging_room_id, *parts[3:]])


# ─── the synthetic-room generator (imported, not duplicated) ───────────────


def _load_synthetic():
    """Import services/scan-modal/tests/_synthetic.py by path. See module
    docstring's Provenance note — this is a deliberate reuse, not a copy, so
    a change to that module's fixtures is felt here rather than drifting."""
    repo_root = Path(__file__).resolve().parents[2]
    synthetic_dir = repo_root / "services" / "scan-modal" / "tests"
    if not (synthetic_dir / "_synthetic.py").exists():
        raise RuntimeError(
            f"expected services/scan-modal/tests/_synthetic.py at {synthetic_dir} "
            "— repo layout changed?"
        )
    if str(synthetic_dir) not in sys.path:
        sys.path.insert(0, str(synthetic_dir))
    import _synthetic  # type: ignore  # noqa: PLC0415

    return _synthetic


# ─── the plan (pure — no network) ───────────────────────────────────────────


@dataclasses.dataclass
class SeedPlan:
    target_url: str
    bucket: str
    mesh_key: str
    captured_room_key: str
    user_id: str
    room_id: str
    scan_name: str
    mesh_scale: float
    mesh_bytes_len: int
    captured_room_json: dict[str, Any]
    room_scan_row: dict[str, Any]
    room_file_row: dict[str, Any]
    verify_task_payload: dict[str, Any]
    idempotency_key: str
    placeholder_ids: bool


def build_plan(
    user_id: str | None,
    room_id: str | None,
    mesh_scale: float = MESH_SCALE,
) -> tuple[SeedPlan, bytes]:
    """Build the full seed plan and the mesh.ply bytes. Pure: no network, no
    env reads beyond what the caller passed in. `user_id`/`room_id` may be
    None only for a --dry-run preview (placeholder ids are substituted and
    `placeholder_ids=True` is set so the caller can warn about it)."""
    placeholder_ids = user_id is None or room_id is None
    resolved_user_id = user_id or _PLACEHOLDER_USER_ID
    resolved_room_id = room_id or _PLACEHOLDER_ROOM_ID

    synthetic = _load_synthetic()
    captured = synthetic.captured_room_json()
    points = synthetic.mesh_points(mesh_scale=mesh_scale)
    mesh_bytes = synthetic.write_ply(points, fmt="binary_little_endian")

    mesh_key = f"{MESH_FOLDER}/{resolved_user_id}/{resolved_room_id}/mesh.ply"
    captured_room_key = (
        f"{CAPTURED_ROOM_FOLDER}/{resolved_user_id}/{resolved_room_id}/captured_room.json"
    )

    identity_seed = f"{SEED_MARKER}:{resolved_user_id}:{resolved_room_id}"
    scan_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{identity_seed}:scan"))
    room_file_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{identity_seed}:room_file:1"))

    room_scan_row = {
        "id": scan_id,
        "user_id": resolved_user_id,
        "room_id": resolved_room_id,
        "name": SEED_MARKER,
        "status": "ready",
        # I104: the URL columns carry a bare bucket-relative KEY, never a
        # (never-resolving, bucket is private) public URL. See keys.py.
        "mesh_url": mesh_key,
        "captured_room_json_url": captured_room_key,
    }
    room_file_row = {
        "id": room_file_id,
        "scan_id": scan_id,
        "version": 1,
        # 'solved' — verify is dispatched against an already-solved room
        # file in the real pipeline (solve enqueues it); this seed starts
        # verify from that same state rather than 'pending'.
        "status": "solved",
    }
    verify_task_payload = {
        # dispatch-scan-modal/lib.ts's extractTaskInputIds contract:
        "scan_id": scan_id,
        "room_file_id": room_file_id,
        "room_file_version": 1,
        # 00490 scan_worker_update_room_file's task-binding check contract
        # (payload->>'roomFileId' / payload->>'scanId'):
        "scanId": scan_id,
        "roomFileId": room_file_id,
        "roomFileVersion": 1,
    }
    idempotency_key = f"{identity_seed}:verify:1"

    plan = SeedPlan(
        target_url="",
        bucket=BUCKET,
        mesh_key=mesh_key,
        captured_room_key=captured_room_key,
        user_id=resolved_user_id,
        room_id=resolved_room_id,
        scan_name=SEED_MARKER,
        mesh_scale=mesh_scale,
        mesh_bytes_len=len(mesh_bytes),
        captured_room_json=captured,
        room_scan_row=room_scan_row,
        room_file_row=room_file_row,
        verify_task_payload=verify_task_payload,
        idempotency_key=idempotency_key,
        placeholder_ids=placeholder_ids,
    )
    return plan, mesh_bytes


def plan_to_dict(plan: SeedPlan) -> dict[str, Any]:
    return dataclasses.asdict(plan)


# ─── execution (network — real staging only) ───────────────────────────────


def _rest_headers(service_role_key: str) -> dict[str, str]:
    return {"apikey": service_role_key, "Authorization": f"Bearer {service_role_key}"}


def _upload(client, bucket: str, key: str, data: bytes, content_type: str) -> None:
    resp = client.post(
        f"/storage/v1/object/{bucket}/{key}",
        content=data,
        headers={"Content-Type": content_type, "x-upsert": "true"},
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"upload {bucket}/{key} -> HTTP {resp.status_code}: {resp.text[:400]}")


def _upsert_row(client, table: str, row: dict[str, Any]) -> None:
    """GET-then-PATCH-or-POST by id — idempotent, no reliance on an upsert
    Prefer header + unique-constraint target (mirrors the local dev fixture's
    scripts/dev/seed-room-scan-fixture.mjs REST idiom)."""
    row_id = row["id"]
    existing = client.get(f"/rest/v1/{table}", params={"id": f"eq.{row_id}", "select": "id"})
    if existing.status_code >= 400:
        raise RuntimeError(f"GET {table}?id=eq.{row_id} -> HTTP {existing.status_code}: {existing.text[:400]}")
    if existing.json():
        resp = client.patch(
            f"/rest/v1/{table}",
            params={"id": f"eq.{row_id}"},
            json={k: v for k, v in row.items() if k != "id"},
            headers={"Prefer": "return=minimal"},
        )
    else:
        resp = client.post(
            f"/rest/v1/{table}",
            json=row,
            headers={"Prefer": "return=minimal"},
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"upsert {table} id={row_id} -> HTTP {resp.status_code}: {resp.text[:400]}")


def _enqueue_verify(client, plan: SeedPlan) -> None:
    """`enqueue_agent_task` with p_on_conflict='resurrect': the first run
    lands the task; every subsequent seed run re-arms it (requeues a
    done/failed/cancelled row) rather than creating a duplicate — the
    point of a re-runnable staging exercise fixture."""
    body = {
        "p_task_type": "scan_pipeline.verify",
        "p_payload": plan.verify_task_payload,
        "p_source": "scan-staging-seed",
        "p_entity_type": "room_scan",
        "p_entity_id": plan.room_scan_row["id"],
        "p_idempotency_key": plan.idempotency_key,
        "p_on_conflict": "resurrect",
        "p_summary": f"{SEED_MARKER} — staging verify exercise",
    }
    resp = client.post("/rest/v1/rpc/enqueue_agent_task", json=body)
    if resp.status_code >= 400:
        raise RuntimeError(f"enqueue_agent_task -> HTTP {resp.status_code}: {resp.text[:400]}")


def execute_plan(target_url: str, service_role_key: str, plan: SeedPlan, mesh_bytes: bytes) -> None:
    """The only function in this module that touches the network. Callers
    MUST have already passed `target_url` through `validate_target_url`."""
    import httpx  # local import: --dry-run and the guard tests need no network deps

    with httpx.Client(
        base_url=target_url.rstrip("/"),
        headers=_rest_headers(service_role_key),
        timeout=60.0,
    ) as client:
        _upload(client, plan.bucket, plan.mesh_key, mesh_bytes, "application/octet-stream")
        _upload(
            client, plan.bucket, plan.captured_room_key,
            json.dumps(plan.captured_room_json).encode("utf-8"), "application/json",
        )
        _upsert_row(client, "room_scans", plan.room_scan_row)
        _upsert_row(client, "room_files", plan.room_file_row)
        _enqueue_verify(client, plan)


# ─── copy-prod (W2): manifest building (pure) + execution (network) ────────


@dataclasses.dataclass
class CopyManifest:
    """What copy-prod will copy vs skip, and why. Built PURELY from the
    already-fetched prod room_scans row + room_scan_images rows — no network
    of its own, so it's fully unit-testable (see test_seed_scan.py)."""

    captured_room_src_key: str | None
    mesh_src_key: str | None
    photos_manifest_src_key: str | None
    glb_src_key: str | None
    photo_src_keys: list[str]  # capped, in display_order/captured_at/id order
    photo_source_image_ids: list[str]  # same order/length as photo_src_keys
    photo_total_available: int
    photo_capped: bool
    skipped: list[str]  # human-readable reasons, e.g. "mesh.ply: mesh_url is null on source"


def _owned_key_or_none(url: str | None, prod_user_id: str, prod_room_id: str, keys_mod, label: str, skipped: list[str]) -> str | None:
    key = keys_mod.object_key_from_url(url)
    if not key:
        skipped.append(f"{label}: source column is null")
        return None
    try:
        keys_mod.assert_owner_prefix(key, prod_user_id, prod_room_id)
    except keys_mod.OwnershipError as exc:
        skipped.append(f"{label}: SKIPPED — {exc}")
        return None
    return key


def build_copy_manifest(
    scan_row: dict[str, Any],
    image_rows: list[dict[str, Any]],
    keys_mod,
    photo_cap: int = PHOTO_CAP,
) -> CopyManifest:
    """Decide what to copy from one prod room_scans row + its room_scan_images,
    per the task contract: captured_room.json, mesh.ply (if present),
    photos manifest (if present), up to `photo_cap` full-res photos in
    display_order/captured_at/id order (the rows arrive pre-ordered — this
    function does not re-sort), a hero thumbnail (if present), and scan.glb
    IFF model_url_gltf is set. Deliberately SKIPS depth archive, world map,
    bundle/keyframes archive, and the USDZ — recorded in `skipped` with a
    reason rather than silently dropped."""
    prod_user_id = str(scan_row["user_id"])
    prod_room_id = str(scan_row["room_id"])
    skipped: list[str] = []

    captured_room_key = _owned_key_or_none(
        scan_row.get("captured_room_json_url"), prod_user_id, prod_room_id, keys_mod,
        "captured_room.json", skipped,
    )
    mesh_key = _owned_key_or_none(
        scan_row.get("mesh_url"), prod_user_id, prod_room_id, keys_mod, "mesh.ply", skipped,
    )
    manifest_key = _owned_key_or_none(
        scan_row.get("photos_manifest_url"), prod_user_id, prod_room_id, keys_mod,
        "photos_manifest.json", skipped,
    )
    glb_key = _owned_key_or_none(
        scan_row.get("model_url_gltf"), prod_user_id, prod_room_id, keys_mod, "scan.glb", skipped,
    )

    # Explicitly-skipped artifact kinds — never attempted, always noted.
    for label, col in (
        ("usdz (scan.usdz)", "model_url"),
        ("depth archive (depth.tar)", "depth_archive_url"),
        ("world map", "world_map_url"),
        ("bundle/keyframes archive", "scan_bundle_url"),
        ("bundle manifest.json", "bundle_manifest_url"),
        ("coverage heatmap", "coverage_heatmap_url"),
    ):
        if scan_row.get(col):
            skipped.append(f"{label}: present on source but out of scope for copy-prod (not needed by splat/renders)")

    hero_present = any(row.get("is_primary") or row.get("role") == "hero" for row in image_rows)
    if not hero_present:
        skipped.append("hero thumbnail: no is_primary/role='hero' row on source scan")

    photo_keys: list[str] = []
    photo_ids: list[str] = []
    seen: set[str] = set()
    for row in image_rows:
        key = _owned_key_or_none(row.get("image_url"), prod_user_id, prod_room_id, keys_mod, f"photo {row.get('id')}", skipped)
        if not key or key in seen:
            continue
        seen.add(key)
        photo_keys.append(key)
        photo_ids.append(str(row["id"]))

    total_available = len(photo_keys)
    capped = total_available > photo_cap
    if capped:
        skipped.append(f"{total_available - photo_cap} photo(s) beyond the {photo_cap}-photo dispatcher cap")

    return CopyManifest(
        captured_room_src_key=captured_room_key,
        mesh_src_key=mesh_key,
        photos_manifest_src_key=manifest_key,
        glb_src_key=glb_key,
        photo_src_keys=photo_keys[:photo_cap],
        photo_source_image_ids=photo_ids[:photo_cap],
        photo_total_available=total_available,
        photo_capped=capped,
        skipped=skipped,
    )


# room_scans metadata copied verbatim from the prod row (everything else on
# the staging row is either a fresh identity column or a rewritten URL key).
_COPY_METADATA_FIELDS = [
    "dimensions", "floor_area", "room_type", "features", "furniture_detected",
    "style_signals", "suggested_styles", "coverage_percentage",
    "scan_schema_version", "device_model", "os_version", "has_lidar",
    "capture_environment", "scanned_at", "quality_grade",
]


def _download_verify_upload(
    source: ReadOnlyClient,
    staging_client,
    bucket: str,
    src_key: str,
    dst_key: str,
    content_type: str,
) -> dict[str, Any]:
    """Download one object from prod (read-only), upload it to staging at the
    rewritten key, then re-download the staging copy and compare size+sha256
    against the source bytes — the verification the task asks for, not merely
    trusting the PUT response."""
    import hashlib

    data = source.get_storage_object(bucket, src_key)
    src_sha = hashlib.sha256(data).hexdigest()
    _upload(staging_client, bucket, dst_key, data, content_type)

    resp = staging_client.get(f"/storage/v1/object/{bucket}/{dst_key}")
    if resp.status_code >= 400:
        raise RuntimeError(f"post-upload verify GET {bucket}/{dst_key} -> HTTP {resp.status_code}")
    dst_bytes = resp.content
    dst_sha = hashlib.sha256(dst_bytes).hexdigest()
    ok = len(dst_bytes) == len(data) and dst_sha == src_sha
    return {
        "src_key": src_key,
        "dst_key": dst_key,
        "bytes": len(data),
        "sha256": src_sha,
        "verified": ok,
    }


def execute_copy_prod(
    prod_url: str,
    prod_service_role_key: str,
    staging_url: str,
    staging_service_role_key: str,
    scan_id: str,
    staging_user_id: str,
    photo_cap: int = PHOTO_CAP,
    dry_run: bool = False,
) -> dict[str, Any]:
    """The whole copy-prod lane. Guards run first and unconditionally
    (including under dry_run): validate_source_url on `prod_url`,
    validate_target_url on `staging_url` — a misconfigured environment can
    never reach a network call against the wrong project in either
    direction."""
    validate_source_url(prod_url)
    validate_target_url(staging_url)

    import httpx  # local import — dry_run + guard tests need no network deps

    keys_mod = _load_keys()
    room_id, new_scan_id, room_file_id = derive_copy_ids(staging_user_id)

    with ReadOnlyClient(prod_url, prod_service_role_key) as source:
        scan_rows = source.get_rest("room_scans", {"id": f"eq.{scan_id}", "select": "*"})
        if not scan_rows:
            raise RuntimeError(f"prod room_scans id={scan_id} not found")
        scan_row = scan_rows[0]

        # The ownership rail, baked in — never trust the caller applied the
        # "Kody's own data only" filter upstream.
        if str(scan_row.get("user_id")) != PROD_KODY_USER_ID:
            raise RuntimeError(
                f"refusing to copy prod scan {scan_id}: user_id "
                f"{scan_row.get('user_id')!r} != required {PROD_KODY_USER_ID!r}"
            )

        image_rows = source.get_rest(
            "room_scan_images",
            {
                "scan_id": f"eq.{scan_id}",
                "select": (
                    "id,role,is_primary,display_order,feature_category,feature_confidence,"
                    "image_url,quality_score,sharpness_score,brightness_score,composition_score,"
                    "stability_score,width,height,file_size_bytes,mime_type,captured_at,"
                    "device_orientation,light_estimate,camera_transform,camera_intrinsics"
                ),
                "order": "display_order.asc,captured_at.asc,id.asc",
            },
        )

        manifest = build_copy_manifest(scan_row, image_rows, keys_mod, photo_cap=photo_cap)

        report: dict[str, Any] = {
            "prod_scan_id": scan_id,
            "prod_scan_name": scan_row.get("name"),
            "staging_scan_id": new_scan_id,
            "staging_room_id": room_id,
            "staging_room_file_id": room_file_id,
            "photo_total_available": manifest.photo_total_available,
            "photo_copied_count": len(manifest.photo_src_keys),
            "photo_capped": manifest.photo_capped,
            "skipped": manifest.skipped,
            "dry_run": dry_run,
            "uploads": [],
            "ingest_enqueued": None,
        }

        if dry_run:
            return report

        prod_user_id = str(scan_row["user_id"])
        prod_room_id = str(scan_row["room_id"])

        with httpx.Client(
            base_url=staging_url.rstrip("/"),
            headers=_rest_headers(staging_service_role_key),
            timeout=120.0,
        ) as staging:
            # 1. Ensure the staging room exists (GET-then-POST, mirrors _upsert_row).
            room_row = {
                "id": room_id,
                "user_id": staging_user_id,
                "name": f"{COPY_SEED_MARKER}",
                "type": "other",
            }
            _upsert_row(staging, "rooms", room_row)

            uploads: list[dict[str, Any]] = []
            url_columns: dict[str, str | None] = {
                "mesh_url": None,
                "captured_room_json_url": None,
                "photos_manifest_url": None,
                "model_url_gltf": None,
            }

            if manifest.captured_room_src_key:
                dst = rewrite_key(manifest.captured_room_src_key, prod_user_id, prod_room_id, staging_user_id, room_id)
                uploads.append(_download_verify_upload(source, staging, BUCKET, manifest.captured_room_src_key, dst, "application/json"))
                url_columns["captured_room_json_url"] = dst

            if manifest.mesh_src_key:
                dst = rewrite_key(manifest.mesh_src_key, prod_user_id, prod_room_id, staging_user_id, room_id)
                uploads.append(_download_verify_upload(source, staging, BUCKET, manifest.mesh_src_key, dst, "application/octet-stream"))
                url_columns["mesh_url"] = dst

            if manifest.photos_manifest_src_key:
                dst = rewrite_key(manifest.photos_manifest_src_key, prod_user_id, prod_room_id, staging_user_id, room_id)
                uploads.append(_download_verify_upload(source, staging, BUCKET, manifest.photos_manifest_src_key, dst, "application/json"))
                url_columns["photos_manifest_url"] = dst

            if manifest.glb_src_key:
                dst = rewrite_key(manifest.glb_src_key, prod_user_id, prod_room_id, staging_user_id, room_id)
                uploads.append(_download_verify_upload(source, staging, BUCKET, manifest.glb_src_key, dst, "model/gltf-binary"))
                url_columns["model_url_gltf"] = dst

            photo_dst_keys: list[str] = []
            for src_key in manifest.photo_src_keys:
                dst = rewrite_key(src_key, prod_user_id, prod_room_id, staging_user_id, room_id)
                ct = "image/jpeg" if src_key.lower().endswith((".jpg", ".jpeg")) else "image/heic"
                uploads.append(_download_verify_upload(source, staging, BUCKET, src_key, dst, ct))
                photo_dst_keys.append(dst)

            report["uploads"] = uploads
            if not all(u["verified"] for u in uploads):
                raise RuntimeError("one or more uploads failed sha256/size verification — aborting before any DB write")

            # 2. Upsert the room_scans row.
            room_scan_row: dict[str, Any] = {
                "id": new_scan_id,
                "user_id": staging_user_id,
                "room_id": room_id,
                "name": COPY_SEED_MARKER,
                "status": "ready",
                "image_count": len(manifest.photo_src_keys),
                **{k: v for k, v in url_columns.items()},
            }
            for field in _COPY_METADATA_FIELDS:
                if field in scan_row:
                    room_scan_row[field] = scan_row[field]
            _upsert_row(staging, "room_scans", room_scan_row)

            # 3. Replace room_scan_images wholesale for this scan_id (delete-then-
            # insert, not per-row upsert) so a re-run with fewer photos than a
            # prior run never leaves orphaned rows behind.
            del_resp = staging.delete(
                "/rest/v1/room_scan_images",
                params={"scan_id": f"eq.{new_scan_id}"},
                headers={"Prefer": "return=minimal"},
            )
            if del_resp.status_code >= 400:
                raise RuntimeError(f"delete room_scan_images -> HTTP {del_resp.status_code}: {del_resp.text[:400]}")

            image_by_id = {str(r["id"]): r for r in image_rows}
            new_image_rows = []
            for src_id, dst_key in zip(manifest.photo_source_image_ids, photo_dst_keys):
                src_row = image_by_id[src_id]
                new_image_rows.append({
                    "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{COPY_SEED_MARKER}:{new_scan_id}:image:{src_id}")),
                    "scan_id": new_scan_id,
                    "room_id": room_id,
                    "role": src_row.get("role") or "auto",
                    "is_primary": bool(src_row.get("is_primary")),
                    "display_order": src_row.get("display_order") or 0,
                    "feature_category": src_row.get("feature_category"),
                    "feature_confidence": src_row.get("feature_confidence"),
                    "image_url": dst_key,
                    "quality_score": src_row.get("quality_score"),
                    "sharpness_score": src_row.get("sharpness_score"),
                    "brightness_score": src_row.get("brightness_score"),
                    "composition_score": src_row.get("composition_score"),
                    "stability_score": src_row.get("stability_score"),
                    "width": src_row.get("width"),
                    "height": src_row.get("height"),
                    "file_size_bytes": src_row.get("file_size_bytes"),
                    "mime_type": src_row.get("mime_type"),
                    "captured_at": src_row.get("captured_at"),
                    "device_orientation": src_row.get("device_orientation"),
                    "light_estimate": src_row.get("light_estimate"),
                })
            if new_image_rows:
                ins_resp = staging.post(
                    "/rest/v1/room_scan_images",
                    json=new_image_rows,
                    headers={"Prefer": "return=minimal"},
                )
                if ins_resp.status_code >= 400:
                    raise RuntimeError(f"insert room_scan_images -> HTTP {ins_resp.status_code}: {ins_resp.text[:400]}")

            # 4. Ensure a room_files v1 row exists (mirrors seed_scan.py's shape).
            room_file_row = {
                "id": room_file_id,
                "scan_id": new_scan_id,
                "version": 1,
                "status": "solved",
            }
            _upsert_row(staging, "room_files", room_file_row)

            # 5. Report whether the 00370 ingest sweep picked this row up. The
            # AFTER UPDATE trigger does NOT fire on our INSERT (it only fires
            # on a status transition), but the 15-min catch-up sweep
            # (sweep_scan_pipeline_ingest) will enqueue scan_pipeline.ingest for
            # any ready/schema>=3 scan with no ingest task at all — invoke it
            # directly (it's designed to be safely re-run) so this report is
            # accurate now rather than "check back in 15 minutes".
            sweep_resp = staging.post("/rest/v1/rpc/sweep_scan_pipeline_ingest", json={})
            sweep_detail = sweep_resp.json() if sweep_resp.status_code < 400 else {"error": sweep_resp.text[:200]}
            task_resp = staging.get(
                "/rest/v1/agent_tasks",
                params={
                    "entity_id": f"eq.{new_scan_id}",
                    "task_type": "eq.scan_pipeline.ingest",
                    "select": "id,status,idempotency_key",
                },
            )
            report["ingest_enqueued"] = {
                "sweep_result": sweep_detail,
                "ingest_tasks": task_resp.json() if task_resp.status_code < 400 else None,
            }

        return report


# ─── CLI ────────────────────────────────────────────────────────────────────


def main_copy_prod(argv: list[str]) -> int:
    """`seed_scan.py copy-prod ...` — see the module docstring's "copy-prod
    subcommand (W2)" section. A SEPARATE small parser (not argparse
    subparsers) so the legacy `seed` flow's flags/tests above are completely
    untouched by this addition."""
    parser = argparse.ArgumentParser(
        prog="seed_scan.py copy-prod",
        description="Copy one real scan bundle from Strata PROD (read-only) to STAGING.",
    )
    parser.add_argument(
        "--prod-url",
        default=os.environ.get("PROD_SUPABASE_URL", f"https://{PROD_REF}.supabase.co"),
        help="Prod Supabase URL — READ-ONLY source (default: env PROD_SUPABASE_URL, else the canonical prod URL)",
    )
    parser.add_argument(
        "--staging-url",
        default=os.environ.get("STAGING_SUPABASE_URL", f"https://{STAGING_REF}.supabase.co"),
        help="Staging Supabase URL — the only write target (default: env STAGING_SUPABASE_URL, else canonical staging URL)",
    )
    parser.add_argument("--scan-id", required=True, help="prod room_scans.id to copy — MUST belong to PROD_KODY_USER_ID")
    parser.add_argument("--staging-user-id", default=os.environ.get("STAGING_SEED_USER_ID"), required=False)
    parser.add_argument("--photo-cap", type=int, default=PHOTO_CAP)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="fetch+report the plan from prod (read-only) but make NO staging writes",
    )
    args = parser.parse_args(argv)

    try:
        validate_source_url(args.prod_url)
        validate_target_url(args.staging_url)
    except TargetGuardError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 2

    if not args.staging_user_id:
        print(
            "FATAL: --staging-user-id (or STAGING_SEED_USER_ID) is required — "
            "the staging profiles.id that will own the copied scan.",
            file=sys.stderr,
        )
        return 2

    prod_key = os.environ.get("PROD_SUPABASE_SERVICE_ROLE_KEY")
    if not prod_key:
        print("FATAL: PROD_SUPABASE_SERVICE_ROLE_KEY is not set (read-only use only)", file=sys.stderr)
        return 2

    staging_key = None
    if not args.dry_run:
        staging_key = os.environ.get("STAGING_SUPABASE_SERVICE_ROLE_KEY")
        if not staging_key:
            print("FATAL: STAGING_SUPABASE_SERVICE_ROLE_KEY is not set", file=sys.stderr)
            return 2

    report = execute_copy_prod(
        prod_url=args.prod_url,
        prod_service_role_key=prod_key,
        staging_url=args.staging_url,
        staging_service_role_key=staging_key or "",
        scan_id=args.scan_id,
        staging_user_id=args.staging_user_id,
        photo_cap=args.photo_cap,
        dry_run=args.dry_run,
    )
    print(json.dumps(report, indent=2, sort_keys=True, default=str))
    return 0


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    if argv and argv[0] == "copy-prod":
        return main_copy_prod(argv[1:])

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--supabase-url",
        default=os.environ.get("STAGING_SUPABASE_URL", f"https://{STAGING_REF}.supabase.co"),
        help="Staging Supabase URL (default: env STAGING_SUPABASE_URL, else the canonical staging URL)",
    )
    parser.add_argument("--user-id", default=os.environ.get("STAGING_SEED_USER_ID"))
    parser.add_argument("--room-id", default=os.environ.get("STAGING_SEED_ROOM_ID"))
    parser.add_argument("--mesh-scale", type=float, default=MESH_SCALE)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="build and print the plan; make no network calls; no creds required",
    )
    args = parser.parse_args(argv)

    try:
        validate_target_url(args.supabase_url)
    except TargetGuardError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 2

    if not args.dry_run and (not args.user_id or not args.room_id):
        print(
            "FATAL: --user-id/--room-id (or STAGING_SEED_USER_ID/STAGING_SEED_ROOM_ID) "
            "are required for a real run — see README.md (\"Why this needs a real, "
            "pre-existing user_id/room_id\").",
            file=sys.stderr,
        )
        return 2

    plan, mesh_bytes = build_plan(args.user_id, args.room_id, mesh_scale=args.mesh_scale)
    plan.target_url = args.supabase_url

    if args.dry_run:
        print(json.dumps(plan_to_dict(plan), indent=2, sort_keys=True))
        if plan.placeholder_ids:
            print(
                "\n(dry run — no --user-id/--room-id given, so the plan above uses "
                "obviously-fake placeholder ids; a real run requires real staging ones)",
                file=sys.stderr,
            )
        print(f"(dry run — {len(mesh_bytes)} bytes of mesh.ply generated, nothing sent)", file=sys.stderr)
        return 0

    service_role_key = os.environ.get("STAGING_SUPABASE_SERVICE_ROLE_KEY")
    if not service_role_key:
        print("FATAL: STAGING_SUPABASE_SERVICE_ROLE_KEY is not set", file=sys.stderr)
        return 2

    execute_plan(args.supabase_url, service_role_key, plan, mesh_bytes)
    print(
        f"seeded: scan={plan.room_scan_row['id']} room_file={plan.room_file_row['id']} "
        f"verify_task_idempotency_key={plan.idempotency_key}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
