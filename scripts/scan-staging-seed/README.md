# scan-staging-seed

Seeds ONE synthetic test scan on the **staging** Supabase project
(`vuesoyhfrjabfxbrzekd`) so the Rendered Room v2 W1 `verify` lane
(`services/scan-modal`'s Modal `verify` function, dispatched by
`supabase/functions/dispatch-scan-modal`) can be exercised end to end there.

Context: `docs/architecture/CAD Generation Pipeline/DELIVERY-PLAN.md` W1.

## Hard guard

`seed_scan.py` refuses to run — including under `--dry-run` — unless the
target Supabase URL names the staging ref `vuesoyhfrjabfxbrzekd`, and raises a
named error if it sees the production ref `bkvcixdmuyejfzcijpdg` anywhere in
the URL. This is enforced by `validate_target_url`, called unconditionally
before anything else in `main()`. See `test_seed_scan.py`'s guard tests for
proof the prod ref is rejected.

## Why a real, pre-existing `user_id`/`room_id`

`room_scans.room_id` carries a real foreign key to `rooms(id)` (migration
`00019`), and `dispatch-scan-modal`'s `keyMatchesScanOwner` check requires a
non-empty `room_id` that literally matches the storage key's owner segment
before it will ever spawn Modal — an absent/NULL `room_id` is rejected as a
fatal `KeyPrefixError` before `verify` runs at all. So this script does not
fabricate a `profiles` → `rooms` identity chain from nothing; it seeds a scan
+ room_file + verify task underneath an **operator-designated staging test
account and room that already exist** on staging. Point it at a real one via
`--user-id`/`--room-id` or `STAGING_SEED_USER_ID`/`STAGING_SEED_ROOM_ID`.

## Setup

```bash
cd scripts/scan-staging-seed
/Users/kody/.local/share/uv/python/cpython-3.12-macos-aarch64-none/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Usage

```bash
# Print the full plan (rows, keys, verify task payload) and generate the
# synthetic mesh — no network calls, no credentials required:
.venv/bin/python seed_scan.py --dry-run

# ... with real staging ids, to preview exactly what would be written:
.venv/bin/python seed_scan.py --dry-run \
  --user-id <staging profiles.id> --room-id <staging rooms.id>

# Actually seed staging:
STAGING_SUPABASE_URL=https://vuesoyhfrjabfxbrzekd.supabase.co \
STAGING_SUPABASE_SERVICE_ROLE_KEY=<staging service_role key> \
STAGING_SEED_USER_ID=<staging profiles.id> \
STAGING_SEED_ROOM_ID=<staging rooms.id, owned by that user> \
.venv/bin/python seed_scan.py
```

What it does, on a real (non-dry-run) invocation:

1. Generates a synthetic rectangular room: a parametric `captured_room.json`
   (imported from `services/scan-modal/tests/_synthetic.py`) and a matching
   `mesh.ply` deliberately scaled 1% larger (`mesh_scale=1.01`) — a
   disagreement `verify` should find and report.
2. Uploads both to the staging `room-scans` bucket under
   `mesh/{userId}/{roomId}/mesh.ply` and
   `captured_room/{userId}/{roomId}/captured_room.json` (the canonical
   per-kind-folder shape from `services/scan-pipeline/.../keys.py`).
3. Upserts a `room_scans` row (`status='ready'`, `mesh_url`/
   `captured_room_json_url` as **bare bucket-relative keys**, per the I104
   rule — the bucket is private, so a public URL there never resolves).
4. Upserts a `room_files` row (`version=1`, `status='solved'` — `verify`
   dispatches against an already-solved room file in the real pipeline).
5. Enqueues exactly ONE `scan_pipeline.verify` task via `enqueue_agent_task`,
   with a payload carrying both the dispatcher's snake_case contract
   (`scan_id`, `room_file_version` — read by
   `dispatch-scan-modal/lib.ts`'s `extractTaskInputIds`) and the camelCase
   contract 00490's `scan_worker_update_room_file` task-binding check reads
   off the same payload column (`roomFileId`/`scanId`).

## Idempotency

`room_scans.name` carries the fixed marker `seed:rendered-room-v2-w1-verify-
staging` (the existing `seed:<slug>` pattern). The scan/room_file ids are
derived deterministically (`uuid5`) from `(marker, user_id, room_id)`, so
re-running against the same user/room reuses the same rows (upsert, never a
duplicate insert) and re-arms the verify task via
`enqueue_agent_task(p_on_conflict='resurrect')` — a done/failed/cancelled
task from a prior exercise is requeued rather than left stale, so the script
is safe to re-run to exercise the lane again.

## Testing

This lane has no staging credentials, so `seed_scan.py` was never run
against real staging here — only `--dry-run` (no network) and the unit
tests below:

```bash
.venv/bin/pytest -q
```

`test_seed_scan.py` covers: the guard rejects the production ref (and a URL
naming both refs), rejects any non-staging URL, accepts the staging ref;
`--dry-run` succeeds with no credentials and is refused against the prod
ref before anything else runs; plan-building produces the canonical bare
I104 keys, a verify payload satisfying both the dispatcher's and 00490's
contracts, and is idempotent for a given `(user_id, room_id)`.
