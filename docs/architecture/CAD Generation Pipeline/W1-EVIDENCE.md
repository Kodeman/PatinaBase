# The Rendered Room v2 — W1 staging evidence

> **Status:** staging evidence · **Date:** 2026-08-18 · **Wave:** W1 (accuracy lane)
> **Companions:** `DELIVERY-PLAN.md` (W1 scope and exit), `ARCHITECTURE.md`, `PROPOSAL.md`
> **Format:** follows `docs/engineering/patina-cloudflare-phase-1-staging-evidence.md`

This document records what was deployed, the queries that prove it works, and
what is still open. Everything below ran against **staging only** — Supabase
project `vuesoyhfrjabfxbrzekd` (a persistent, data-less branch of Strata,
`us-east-1`) and Modal environment `patina-staging`. The production ref
`bkvcixdmuyejfzcijpdg` was not touched, and no production resource of any kind
was created, read, or mutated.

W1's exit criterion, per the delivery plan:

> `verify` QA visible on a staging Room File certificate, plus a determinism
> test: two runs over the same bundle produce identical residuals.

**Both halves are met.** The verify document is on the staging Room File, and
two independent Modal runs over the same bundle produced **byte-identical**
documents (`md5 = 22fc7adab35c274e5bd4b3bf63ef5a06` for both).

---

## 1. What is deployed

### Modal

| Item | Value |
|---|---|
| Workspace | `kodeman` |
| Environment | `patina-staging` (created this wave; `patina-production` does not exist) |
| App | `patina-scan` — `ap-zLm5zIIytE9TgWWkipevm8` |
| Functions | `verify` (CPU), `splat` (W2 stub), `renders` (W2 stub), `spawn` (web) |
| Spawn endpoint | `https://kodeman-patina-staging--patina-scan-spawn.modal.run` |
| Deploy command | `.venv/bin/modal deploy -m scan_modal.app --env patina-staging` |

The `verify` image carries Open3D; the stage reported `"backend": "open3d"`, so
the production plane-segmentation path ran, not `core/verify.py`'s numpy RANSAC
fallback. `splat` and `renders` deploy as functions but raise
`NotImplementedError` by design — no GPU is allocated to reach that raise.

**Interpreter note.** System `python3` is 3.9 and cannot run the Modal CLI.
Everything above ran from `services/scan-modal/.venv` (CPython 3.12, created
from the uv-managed interpreter). The Modal token in `~/.modal.toml` applies
globally, so no per-venv auth was needed.

### Modal Secrets (environment `patina-staging`)

Names and contents only — **no values appear in this document or in the repo**.

| Secret | Key(s) | Purpose |
|---|---|---|
| `scan-worker-db` | `SCAN_WORKER_DSN` | Direct Postgres as `scan_worker_login`. Read by `scan_modal.io.db`. |
| `scan-modal-auth` | `SCAN_MODAL_AUTH_TOKEN` | The dispatcher's bearer, checked by `scan_modal.app.check_bearer_token`. |
| `scan-r2` | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | **Placeholder — all three empty.** See §6, open item 2. |

### Supabase (staging `vuesoyhfrjabfxbrzekd`)

| Item | State |
|---|---|
| Migrations `00489`, `00490`, `00491` | Applied (W0). |
| Edge function `dispatch-scan-modal` | `ACTIVE`, `verify_jwt = true`. |
| Function secrets | `MODAL_SPAWN_URL`, `MODAL_BEARER_TOKEN` set via `supabase secrets set --project-ref vuesoyhfrjabfxbrzekd`. Read at invocation, so no redeploy was needed — confirmed by a manual invoke against the already-deployed function. |
| pg_cron job `dispatch-scan-modal-sweep` | `jobid 49`, `*/5 * * * *`, `active = true`. |

### The `scan_worker_login` role (out-of-band, per 00490's header)

Created against staging only, with a password minted locally
(`openssl rand -base64 36`, URL-safe alphabet) that exists **only** inside the
`scan-worker-db` Modal Secret. It was never written to the repo, never printed
to a report, and never entered a migration. `scan_reader_login` was
deliberately **not** created — nothing in W1 reads through `scan_reader`.

```sql
CREATE ROLE scan_worker_login
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT LOGIN NOREPLICATION NOBYPASSRLS
  PASSWORD '<held only as a Modal Secret>';
GRANT scan_worker TO scan_worker_login WITH INHERIT TRUE, SET FALSE;
```

`NOINHERIT` on the role with `WITH INHERIT TRUE` on the membership is the
PG16+ shape 00490's header specifies: the per-membership option wins, so the
role inherits `scan_worker`'s grants without being able to `SET ROLE` to it.
Verified below.

### The DSN shape (a finding worth recording)

Modal → Postgres is plain outbound TCP and prefers IPv4, so the connection goes
through the Supavisor **session-mode pooler on port 5432**, not the direct
`db.<ref>.supabase.co` host.

**The staging branch's pooler host is `aws-0-us-east-1`, not `aws-1-us-east-1`.**
Strata production uses `aws-1-us-east-1` (see `supabase/.temp/pooler-url`), and
assuming the branch inherits the parent's pooler host fails with a misleading
error rather than a timeout:

```
FATAL: (ENOTFOUND) tenant/user scan_worker_login.vuesoyhfrjabfxbrzekd not found
```

That message reads like a missing role. It is not — the role exists; the
*tenant* does not exist on that pooler node. The working shape:

```
postgresql://scan_worker_login.vuesoyhfrjabfxbrzekd:<secret>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

---

## 2. The seed

`scripts/scan-staging-seed/seed_scan.py`, run for real against staging for the
first time (it had only ever been exercised via `--dry-run` and unit tests).

It requires a pre-existing staging `user_id` / `room_id`, because
`dispatch-scan-modal`'s `keyMatchesScanOwner` rejects a NULL `room_id` as a
fatal `KeyPrefixError` before Modal is ever reached. Staging had 16 seeded
profiles but **zero rooms**, so both were provisioned idempotently:

| Identity | Value |
|---|---|
| Auth user | `rr2-seed@staging.patina.cloud` → `c9740823-c2dc-401e-9289-500efe2cb496` (GoTrue admin API, `email_confirm: true`, random password) |
| Profile | Auto-created by the existing `auth.users` trigger; `role = 'homeowner'` |
| Room | `aaffe401-5650-5bd2-bd0c-9baa3e7a341c`, name `seed:rendered-room-v2-w1-verify-staging`, 4.0 × 3.0 × 2.5 m |

What the seed then wrote:

| Row | Value |
|---|---|
| `room_scans` | `f2a07e6d-bf5d-57b9-b86b-453cc8922fe4`, `status='ready'`, name = the seed marker |
| `mesh_url` | `mesh/c9740823-…/aaffe401-…/mesh.ply` — a **bare bucket-relative key**, per the I104 rule |
| `captured_room_json_url` | `captured_room/c9740823-…/aaffe401-…/captured_room.json` |
| `room_files` v1 | `edd18085-375f-5054-94d6-2fdf8e2aa2a2`, `status='solved'` |
| `agent_tasks` | one `scan_pipeline.verify`, `abad722d-1f97-429e-b267-66c8a74c8770` |

The bundle is a synthetic 4.0 × 3.0 × 2.5 m rectangular room with the mesh
scaled to **1.01** — a deliberate 1% disagreement for `verify` to find.

---

## 3. End-to-end run

The pg_cron sweep fires every 5 minutes and would have picked this up on its
own; the function was invoked directly with the service-role bearer to skip the
wait. Both paths are evidenced.

```bash
curl -X POST https://vuesoyhfrjabfxbrzekd.supabase.co/functions/v1/dispatch-scan-modal \
  -H "Authorization: Bearer <staging service_role>" -d '{}'
# → {"claimed":1,"spawned":1,"failed":0,"deferred":0,"error":null}  HTTP 200
```

Cron liveness (independent of the manual invoke):

```sql
select d.runid, d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname = 'dispatch-scan-modal-sweep' order by d.start_time desc limit 5;
```

| runid | status | return_message | start_time |
|---|---|---|---|
| 15006 | succeeded | 1 row | 2026-08-18 19:40:00Z |
| 14984 | succeeded | 1 row | 2026-08-18 19:35:00Z |
| 14960 | succeeded | 1 row | 2026-08-18 19:30:00Z |
| 14937 | succeeded | 1 row | 2026-08-18 19:25:00Z |
| 14916 | succeeded | 1 row | 2026-08-18 19:20:00Z |

Task ledger:

```sql
select id, status, attempts, last_error, payload->>'roomFileVersion' as rfv
from public.agent_tasks where task_type = 'scan_pipeline.verify' order by created_at;
```

| id | status | attempts | last_error | rfv |
|---|---|---|---|---|
| `abad722d-1f97-429e-b267-66c8a74c8770` | **done** | 1 | — | 1 |
| `b211a47e-b254-43e6-b701-22e89dea3867` | **done** | 1 | — | 2 |

Stage ledger — every row written by Modal over the `scan_worker` role, never
`service_role`:

```sql
select e.stage, e.event, e.status, e.duration_ms, e.created_at, rf.version
from public.scan_pipeline_events e
left join public.room_files rf on rf.id = e.room_file_id
order by e.created_at asc;
```

| stage | event | status | duration_ms | created_at | room_file_version |
|---|---|---|---|---|---|
| verify | started | started | 0 | 19:43:30.563Z | 1 |
| verify | completed | succeeded | 6 944 | 19:43:37.239Z | 1 |
| verify | started | started | 0 | 19:45:10.771Z | 2 |
| verify | completed | succeeded | 9 114 | 19:45:18.559Z | 2 |

Two rows per run — `started` then `completed` — is the shape `verify_job.py`
promises. Wall clock per run is ~7–9 s including cold start, comfortably inside
the plan's `verify` budget of "~1–2 min, < $0.01".

---

## 4. The verify document

`room_files.verify` on the staging Room File (`version = 1`, scan
`f2a07e6d-…`), verbatim:

| wall_ref | parametric_mm | mesh_mm | delta_mm | offset_mm | planarity_rms_mm | within_tolerance | curved_flag | mesh_points |
|---|---|---|---|---|---|---|---|---|
| wall-north | 4000.0 | 4040.0 | **+40.0** | +15.0 | 0.0 | true | false | 3 772 |
| wall-south | 4000.0 | 4040.0 | **+40.0** | +15.0 | 0.0 | true | false | 3 772 |
| wall-west | 3000.0 | 3030.0 | **+30.0** | +20.0 | 0.0 | true | false | 2 852 |
| wall-east | 3000.0 | 3030.0 | **+30.0** | +20.0 | 0.0 | true | false | 2 852 |

```json
"summary": {
  "walls_checked": 4,
  "walls_within_tolerance": 4,
  "max_delta_mm": 40.0,
  "curved_walls": [],
  "unmatched": { "planes": [], "parametric_walls": [] }
},
"backend": "open3d",
"warnings": []
```

**Sanity check — every number is derivable from the 1.01 scale:**

- `delta_mm` is mesh wall *length* minus parametric length. 4000 → 4040 is
  exactly +1.00%; 3000 → 3030 is exactly +1.00%. Both correct.
- `offset_mm` is the perpendicular displacement of the fitted plane from the
  parametric centreline, positive = captured wall outside the model. The 4 m
  walls sit at z = ±1.5 m, scaled to ±1.515 → **15 mm**. The 3 m walls sit at
  x = ±2.0 m, scaled to ±2.02 → **20 mm**. Both correct, and note they are the
  *opposite* pairing from `delta_mm` — a wall's length comes from the span it
  covers, its offset from the axis it sits on. Getting these two the right way
  round is the real check here, and the stage does.
- `planarity_rms_mm = 0.0` — the synthetic planes are exact, `noise_m = 0`.
- Zero unmatched walls and zero unmatched planes: the plane→wall matcher paired
  all four correctly.

**One expectation correction.** W1's brief anticipated the 1% offset would push
walls *out* of tolerance. It does not, and should not: `VerifyConfig.tolerance_mm`
defaults to **50 mm**, and 1% of a 3–4 m wall is 30–40 mm. So a 1% capture error
on a room this size is inside the default gate. `within_tolerance: true` on all
four walls is the **correct** result for these inputs, not a missed detection —
the disagreement is fully reported in `delta_mm` / `offset_mm` regardless. If a
future golden case wants a tolerance breach, it needs either a larger scale
error (≳1.7% at 3 m) or a per-task `inputs.config.tolerance_mm` override, which
`build_config` already supports.

---

## 5. Determinism (the W1 exit criterion)

A second `room_files` row (`version = 2`,
`ab2c9ffb-3779-5dd5-86bf-10d8ce5e7558`) was created over the same scan and the
same stored bundle, and a second `scan_pipeline.verify` task enqueued against
it through `enqueue_agent_task`. It was dispatched and run as an entirely
separate Modal invocation, in a separate container.

```sql
select
  (select verify from public.room_files where version=1 and scan_id='f2a07e6d-…')
= (select verify from public.room_files where version=2 and scan_id='f2a07e6d-…') as jsonb_identical,
  (select md5(verify::text) from public.room_files where version=1 and scan_id='f2a07e6d-…') as md5_v1,
  (select md5(verify::text) from public.room_files where version=2 and scan_id='f2a07e6d-…') as md5_v2;
```

| jsonb_identical | text_identical | md5_v1 | md5_v2 |
|---|---|---|---|
| **true** | **true** | `22fc7adab35c274e5bd4b3bf63ef5a06` | `22fc7adab35c274e5bd4b3bf63ef5a06` |

Identical as `jsonb`, identical as serialized `text`, identical md5. The verify
document carries no timestamps, so this is a whole-document comparison with
nothing excluded. **Determinism: PASS.**

This is stronger than re-running into the same row would have been — both
documents still exist side by side on staging and can be re-compared at any
time.

---

## 6. Least-privilege proof (negative tests)

Run as `scan_worker_login` over the Modal DSN. A gate nothing can fail is not a
gate, so these are recorded as refusals, not as absences.

| Statement | Result |
|---|---|
| `select count(*) from public.room_files` | `ERROR: permission denied for table room_files` |
| `select count(*) from public.agent_tasks` | `ERROR: permission denied for table agent_tasks` |
| `select count(*) from public.profiles` | `ERROR: permission denied for table profiles` |
| `select count(*) from storage.objects` | `ERROR: permission denied for schema storage` |
| `select public.enqueue_agent_task(...)` | `ERROR: permission denied for function enqueue_agent_task` |

And the positive side — exactly four functions reachable, no more:

```sql
select p.proname, has_function_privilege('scan_worker_login', p.oid, 'EXECUTE')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'scan_worker_%';
```

`scan_worker_append_event`, `scan_worker_complete_task`, `scan_worker_fail_task`,
`scan_worker_update_room_file` — all `true`.

A leaked `SCAN_WORKER_DSN` therefore reaches the four scan RPCs and nothing
else: no table, no storage, no other queue lane. That is the posture 00490 was
written for, now demonstrated rather than asserted.

---

## 7. The bug this wave found and fixed

**`fix(scan-modal): annotate the spawn endpoint's Request parameter`** —
`d6071a37`.

The first live probe of the deployed endpoint returned **HTTP 422** for every
request, authenticated or not:

```json
{"detail":[{"type":"missing","loc":["query","request"],"msg":"Field required"}]}
```

`scan_modal.app.spawn` was declared `async def spawn(request):` with the
annotation left off and a comment asserting it would resolve in-image. FastAPI
decides "inject the `Request` object" versus "bind a query parameter" from the
**annotation alone** — unannotated, `request` was read as a required *query*
parameter, so the dispatcher's POST body was never even parsed and the bearer
check never ran. The whole lane would have been dead on arrival.

The fix binds the name defensively, because `fastapi` lives only in
`_ENDPOINT_IMAGE` while the verify image imports the same module:

```python
try:
    from fastapi import Request as _FastAPIRequest
except ImportError:      # verify image, and the unit-test environment
    _FastAPIRequest = Any

async def spawn(request: _FastAPIRequest):
```

`from __future__ import annotations` at the top of the module makes the
annotation a string, resolved against module globals in-container.

**Why the suite did not catch it.** `tests/test_endpoint.py` is thorough — 14
cases over auth, validation, and dispatch — but every one of them calls
`handle_spawn` directly. That is the pure seam, and it was always correct. The
defect lived entirely in the FastAPI wiring *around* it, which no test touches
and which cannot be unit-tested without `fastapi` installed. The gap is
structural, not an oversight, and it argues for a live post-deploy probe as a
standing step rather than for a new unit test.

Post-fix probes against the redeployed endpoint:

| Request | Response |
|---|---|
| No `Authorization` header | `401 {"spawned":false,"error":"missing_bearer"}` |
| `Authorization: Bearer wrong` | `401 {"spawned":false,"error":"bad_token"}` |
| Valid bearer, `{}` body | `400 {"spawned":false,"error":"missing_fields:taskId,leaseToken,scanId,roomFileId,roomFileVersion,taskType"}` |

Unit suite after the change: **93 passed, 1 xfailed** (`.venv/bin/python -m pytest -q`
in `services/scan-modal`, with the `[dev]` extra installed — without `httpx`
one redaction test errors on a missing import rather than failing on logic).

---

## 8. Open items

1. **No Modal spend cap is set.** `modal billing` exposes only `report`,
   `summary`, and `rates` — there is no budget CLI in client 1.5.4, so hard
   caps are a **dashboard-only** action. **Kody: set a spend limit for the
   `kodeman` workspace in the Modal dashboard.** Interim guard: the workspace
   is on the Starter plan, which halts execution on credit exhaustion, and W1's
   only real function is CPU-only at well under a cent per run (metered cost is
   currently $0.00). This becomes materially more important before W2, which
   introduces L4 and L40S GPU stages. The delivery plan's W4 exit explicitly
   requires "a demonstrated budget-cap halt", so this is owed regardless.

2. **`scan-r2` is a placeholder with empty values.** `app.py` attaches it
   unconditionally to `splat` and `renders`, so the secret must *exist* for the
   app to deploy at all, but `verify` never reads it — W1's inputs are
   presigned Supabase URLs and its outputs go to Postgres. Minting the real R2
   token is a W2 item and needs a Cloudflare dashboard step from Kody.

3. **`scan_reader_login` was not created.** Nothing in W1 reads through
   `scan_reader`. It will be needed when a read surface lands (W2's typed
   `/v1/scan/*` routes); provision it then, by the same out-of-band procedure.

4. **The tolerance expectation in §4** — a 1% error on a 3–4 m room does not
   breach the 50 mm default. Worth a ruling on whether `tolerance_mm` is right
   for rooms of this size before the certificate surfaces it to a designer, and
   worth encoding as an explicit golden case either way.

5. **Staging seed rows are live and will persist.** Marker
   `seed:rendered-room-v2-w1-verify-staging` on `rooms.name` and
   `room_scans.name`; auth user `rr2-seed@staging.patina.cloud`. They are
   deliberately re-runnable (the seed upserts by `uuid5`-derived ids and re-arms
   the task via `p_on_conflict='resurrect'`). Staging-only; no cleanup owed
   unless the branch is reset.

6. **No production anything.** Per the stop-at-staging rail, no production
   Modal environment exists, no production role was minted, and no production
   secret was set. Production remains gated on Kody's separate authorization,
   after W4.
