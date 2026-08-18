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


# ─── CLI ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
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
