# Scan-Pipeline Reconstruction Worker — Design

Field Capture P1 · Part B items 9, 10, 11, 13 · package design per **R109.1**
Issued 2026-07-17 · Design authority → Claude Code

Companions:
- `field-capture-p1-package.md` — the build order (items 9–13 are this worker's jobs).
- `capture-bundle-spec-v1.md` — the bundle this worker consumes.
- `../the-document/DECISIONS.md` — **R108.4** (burst-ready contract), **R108.5** (UNVERIFIED propagation), **R108.6** (DXF in P1), **R109.1** (native Linux worker home, no Coolify), **I84** (schema reconciliation).
- `00341_field_capture_p1_schema.sql` — the four additive tables this worker reads and writes.
- `00297_agent_tasks_queue.sql` + `packages/agent-queue/` — the mandated queue and its RPCs.
- `scripts/validate_capture_bundle.py` — the reference validator the ingest stage reuses.

This document defines the **plumbing** of the reconstruction worker: how it claims work, what it reads and writes, how it is packaged and run on Kody's Linux box, and how it fails and recovers. It does **not** define drawing layout, dimension styling, the UNVERIFIED stamp, or the title block — those are designer-visible (escalate-class per the package's authority note) and are decided at item 11 / M3 against screenshots, not here.

---

## 1. Overview

The reconstruction worker turns an uploaded capture bundle into a versioned, tolerance-stamped Room File deliverable. It runs as three sequential jobs — **ingest → solve → drawings** — each claimed from the existing `agent_tasks` queue, each enqueuing its successor on success, each landing telemetry into `scan_pipeline_events`.

Four properties fix the architecture:

1. **Pull-based, zero-ingress.** The worker reaches production over **outbound HTTPS only** — Supabase PostgREST RPCs (the queue) and the Storage API (the `room-scans` bucket). It opens no inbound listener and needs no port forwarded to operate. Kody's Cloudflare Tunnel is his **ops access** (SSH, monitoring) into the box; it is **not** a dependency of the worker — the pipeline runs with the tunnel down.
2. **The queue is `agent_tasks`, not a new one.** Per CLAUDE.md ("Never create parallel queues") and I84, the worker claims and completes through the existing SECURITY DEFINER RPCs. No BullMQ, no pg-boss, no `scan_jobs` table.
3. **Native package, no orchestration.** Per R109.1, the worker ships as a Python package that runs natively under `systemd` on a Linux box Kody manages. No Docker is required to operate it. A `Dockerfile` may be sketched as the *future cloud-burst artifact*, but it is not part of running natively.
4. **Burst-ready by config (R108.4, preserved by R109.1).** Worker identity and behavior come entirely from an env file. A cloud burst worker is the same package with a different env file — a config change, not a code change. The flip trigger stays the first non-Leah designer in production.

P1's three stages are **CPU-bound**. The GPU on the box earns its keep at **P2 splat training**; in P1 it is dormant and only reported by `doctor`.

---

## 2. Job / stage contract

### 2.1 Task-type namespace

One task type per stage, under a `scan_pipeline.*` namespace (the `agent_tasks.task_type` column is an open set — no CHECK):

| Task type | Stage | Reads | Writes | Enqueues on success |
|---|---|---|---|---|
| `scan_pipeline.ingest` | Validate the uploaded bundle; reconcile checksums; reserve the deliverable version | `room-scans` bucket (manifest + artifacts), `room_scans` (`artifacts_sha256`) | `room_files` (pending row for the reserved version) | `scan_pipeline.solve` |
| `scan_pipeline.solve` | Least-squares anchor scale fit; per-dimension tolerance classes; accuracy certificate; UNVERIFIED propagation (R108.5) | `scan_anchors`, `room_scan_geometry(_elements)`, `room_files` | `room_files` (certificate, rollup, `anchor_count`), `room_file_measurements` | `scan_pipeline.drawings` |
| `scan_pipeline.drawings` | Dimensioned floor plan + four elevations → SVG (native), PDF, DXF (ezdxf, layered) per R108.6 | `room_files`, `room_file_measurements`, corrected graph | `room_files` (`svg_url`/`pdf_url`/`dxf_url`, `status='generated'`), Storage objects | — (terminal; delivery event emitted) |

Every task in the chain carries:
- `entity_type = 'room_scan'`, `entity_id = <scan_id>` (`room_scans.id`).
- `source = 'scan-pipeline'`.
- `idempotency_key = '{scan_id}:{stage}:{room_file_version}'` — e.g. `…:solve:2`.
- `payload = { scan_id, room_file_version, room_file_id?, user_id }` (`room_file_id` known from solve onward; `user_id` = `room_scans.user_id`, needed for storage paths).
- `parent_task_id` = the id of the stage that enqueued it (ingest→solve→drawings forms a traceable chain in `agent_tasks`).

**Agent-OS baggage — explicitly unused.** `agent_tasks` carries fields for the human-review workflow it was built for. These mechanical jobs do **not** use them:
- `assignee` (CHECK `kody | leah`) is left **NULL** — a scan job has no human owner.
- The **`awaiting_review` / `approved` / `rejected`** states are **never** entered. A stage completes only as `done` or `failed`; there is no human gate on a mechanical reconstruction. (The design gate lives at M3/M4 against real output, not per-job.)
- `confidence` is optional; the worker may stamp a solve-quality scalar but nothing routes on it.

### 2.2 Version allocation and the deliverable row

`room_files` is append-only and versioned: `UNIQUE(scan_id, version)`, a new generation mints a new row, a deliverable is never overwritten (R-f / 00341). A **pipeline run** is identified by its `room_file_version`, allocated once at the **entry point** and threaded through all three stages so the idempotency keys are deterministic.

- **Entry point** (the upload-completion edge function — the `confirm-scan-bundle` successor, item 9's DB side, out of scope for *this* worker code): on a completed bundle upload it reserves the next version by inserting the pending `room_files` row atomically —
  `INSERT INTO room_files (scan_id, version, status) VALUES (:scan, (SELECT COALESCE(MAX(version),0)+1 FROM room_files WHERE scan_id=:scan), 'pending')` with `ON CONFLICT (scan_id, version) DO NOTHING` and a bump-and-retry on conflict — then enqueues `scan_pipeline.ingest` with that `room_file_version` in the payload and key.
- The `UNIQUE(scan_id, version)` constraint makes the allocation race-safe: two runs never share a version, and a reserved-but-failed version is simply a gap-free monotonic record of a run that started (its `status` ends `error`). Realistic re-scan cadence (minutes-to-hours apart) never collides; the constraint is the guarantee, not the timing.
- A **re-scan** (new bundle) → a new run → version + 1 → a new `room_files` row. A **re-run of the same version** (transient retry, operator requeue) reuses the reserved row and is idempotent (writes are keyed by `(scan_id, version)` / upsert). This is exactly R-f's "a re-scan/re-solve mints a new version."

### 2.3 The RPC call sequence for one job lifecycle

The worker holds a **service-role** Supabase client (the queue RPCs are granted to `service_role` only). Below is the exact sequence for a `scan_pipeline.solve` job; ingest and drawings differ only in the work between claim and complete, and in the successor they enqueue.

```
# ── poll ────────────────────────────────────────────────────────────────────
rows = claim_agent_tasks(
    p_task_types        := ARRAY[<enabled STAGES>],   # e.g. {'scan_pipeline.ingest','scan_pipeline.solve','scan_pipeline.drawings'}
    p_batch             := MAX_CONCURRENT,
    p_worker            := WORKER_ID,
    p_visibility_timeout := VISIBILITY_TIMEOUT        # default '15 minutes'
)
# → each returned row is now status='running', attempts+1, locked_by=WORKER_ID.
# If rows is empty: sleep POLL_SECONDS, poll again.

# ── per claimed task (dispatched by task.task_type) ─────────────────────────
scan_pipeline_events.insert(scan_id, room_file_id, stage='solve',
                            event='solve.started', status='started')      # service-role write

try:
    anchors   = read scan_anchors WHERE scan_id = task.payload.scan_id     # delegated/bypassed read
    geometry  = read room_scan_geometry(_elements) / captured_room.json
    fit       = least_squares_scale_fit(anchors, geometry)                 # CPU
    measures  = per_dimension_tolerance(fit, geometry, anchors)            # verified|measured|estimated
    cert      = accuracy_certificate(fit, anchors, measures)               # anchors used, residuals, class/dim

    # write outputs (service-role; bypasses RLS)
    UPDATE room_files SET certificate=cert, anchor_count=len(anchors),
           unverified=(len(anchors) < 3), tolerance_class=<broadest>       # R108.5 rollup
     WHERE id = task.payload.room_file_id
    INSERT room_file_measurements (...)                                    # one row per dimension

    # enqueue successor — idempotent on its own key
    enqueue_agent_task(
        p_task_type      := 'scan_pipeline.drawings',
        p_payload        := {scan_id, room_file_id, room_file_version},
        p_source         := 'scan-pipeline',
        p_entity_type    := 'room_scan',
        p_entity_id      := scan_id,
        p_idempotency_key := '{scan_id}:drawings:{room_file_version}',
        p_parent_task_id := task.id,
        p_on_conflict    := 'ignore',
        p_actor          := WORKER_ID
    )

    scan_pipeline_events.insert(..., event='solve.succeeded', status='succeeded',
                                duration_ms=..., detail={tolerance_counts, mean_residual_mm})
    complete_agent_task(p_id := task.id, p_outcome := 'done',
                        p_artifacts := {room_file_id, tolerance_counts},
                        p_actor := WORKER_ID)

except TransientError as e:      # storage blip, network, lock contention
    scan_pipeline_events.insert(..., event='solve.failed', status='failed', detail={error})
    complete_agent_task(task.id, 'failed', p_error := str(e), p_fatal := False,
                        p_actor := WORKER_ID)          # → backoff requeue, SAME version

except PermanentError as e:      # unsolvable inputs, corrupt geometry, poison
    UPDATE room_files SET status='error', generation_error := str(e) WHERE id = room_file_id
    scan_pipeline_events.insert(..., event='solve.failed', status='failed', detail={error, fatal:true})
    complete_agent_task(task.id, 'failed', p_error := str(e), p_fatal := True,
                        p_actor := WORKER_ID)          # → parked failed, no more retries
```

Ordering note: the successor is enqueued **before** `complete_agent_task('done')`, and the successor enqueue is idempotent. A crash between the two leaves the job `running`; the visibility timeout reclaims it, the stage re-runs (writes are idempotent by `(scan_id, version)`), the successor enqueue de-dupes on its key, and the job completes. A crash *before* the enqueue simply re-runs the whole stage. Every path converges.

Stage-specific bodies:
- **ingest** — downloads `manifest.json` + listed artifacts from `room-scans` into scratch; runs the reference validator's checks (§2.4); reconciles each `sha256` against `room_scans.artifacts_sha256` (00082); on pass, enqueues `scan_pipeline.solve`. `SCHEMA_VIOLATION` / `MISSING_ARTIFACT` / `CHECKSUM_MISMATCH` / `PATH_VIOLATION` / `ANCHOR_INCONSISTENCY` are **permanent** (`p_fatal := true`) — a bad bundle will not get better on retry; `MISSING_FILE` on a not-yet-consistent read is transient once, permanent after a bounded number of attempts.
- **drawings** — renders the corrected graph to SVG (native), PDF, and layered DXF (ezdxf: walls / openings / dimensions / text); uploads all three to Storage (§5); `UPDATE room_files SET svg_url, pdf_url, dxf_url, status='generated', generated_at=now()`; emits a `delivery.published` event. No successor.

### 2.4 Validator reuse (ingest)

The ingest stage is the server half of the integrity contract (spec §7, §10). It reuses the **named checks** of `scripts/validate_capture_bundle.py` — `SCHEMA_VIOLATION`, `MISSING_ARTIFACT`, `PATH_VIOLATION`, `MISSING_FILE`, `CHECKSUM_MISMATCH`, `SIZE_MISMATCH`, `ANCHOR_INCONSISTENCY`, `PHOTO_COUNT_MISMATCH` — so the device-side and server-side verdicts are the same code path. The packaging mechanism (extract the checks into an importable module that both the CLI script and the worker call, vs. vendoring a copy) is a code-only, blessable item-9 call; the recommendation is a single shared module so the script and worker never drift.

---

## 3. Configuration schema

Everything about a worker — identity, which stages it runs, cadence, concurrency, GPU posture, and its one credential — comes from the environment (an `EnvironmentFile`, `/etc/patina/scan-worker.env`). This is what makes a cloud burst worker a config change, not a code change.

| Env var | Type | Default | Purpose |
|---|---|---|---|
| `WORKER_ID` | string | *(required)* | Identity stamped into `locked_by` and `app.actor` (audit). Unique per running worker (`homelab-1`, `cloud-burst-a`). |
| `STAGES` | csv | `ingest,solve,drawings` | Which `scan_pipeline.*` stages this worker claims. A cloud worker might run `drawings` only; a P2 GPU worker adds `splat` (§8). |
| `POLL_SECONDS` | int | `5` | Sleep between polls when a claim returns zero tasks. |
| `MAX_CONCURRENT` | int | `2` | Claim batch size and max in-flight jobs (`p_batch`). Bounds scratch disk and CPU. |
| `GPU` | enum `auto`\|`off` | `auto` | `auto` = detect and report a CUDA device (P1: report only). `off` = never touch the GPU. No P1 stage uses it either way. |
| `VISIBILITY_TIMEOUT` | duration | `15 minutes` | Lease length (`p_visibility_timeout`); a job whose worker dies is reclaimable after this. |
| `MAX_ATTEMPTS` | int | `5` | `p_max_attempts` set on enqueued successors (backoff parks at this count). |
| `SUPABASE_URL` | url | *(required)* | Strata PostgREST + Storage base. Outbound-443 only. |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | *(required)* | The service-role JWT. The worker's **only** write credential; server-side only. |
| `ROOM_SCANS_BUCKET` | string | `room-scans` | Bucket the bundles arrive in and drawings are written to. |
| `WORK_DIR` | path | `/var/lib/patina/scan-work` | Scratch root for bundle download + drawing render. On the `ReadWritePaths` allowlist. |
| `RETENTION_HOURS` | int | `48` | How long a downloaded bundle / rendered set lingers in `WORK_DIR` before the janitor prunes it. |
| `HTTP_TIMEOUT_S` | float | `30` | Per-request timeout for PostgREST + Storage calls. |
| `LOG_LEVEL` | enum | `info` | journald log verbosity. |

Rules: no default for the three `*(required)*` values — the worker refuses to start without them (the `aesthete-inference` `INFERENCE_TOKEN` precedent). Nothing about a worker's identity or behavior lives in code; two workers differ only by this file.

---

## 4. Packaging and install layout (R109.1)

Repo home `services/scan-pipeline/`. Python 3.11+, `pyproject.toml`, console entry point `patina-scan-worker`. Installs into a venv under `systemd`; **no Docker required to run it**.

```
services/scan-pipeline/
  pyproject.toml                 # deps + [project.scripts] patina-scan-worker = "patina_scan_worker.cli:main"
  README.md                      # box-prep + run instructions (appendix A, mirrored)
  install.sh                     # create venv, pip install ., install unit + env template, enable service
  patina-scan-worker.service     # systemd unit (§5)
  scan-worker.env.example        # config template → copied to /etc/patina/scan-worker.env (0600)
  Dockerfile                     # OPTIONAL — future cloud-burst artifact; NOT used for native operation
  src/patina_scan_worker/
    __init__.py
    __main__.py                  # `python -m patina_scan_worker`
    cli.py                       # subcommands: run | once | doctor
    config.py                    # env → frozen Settings (mirrors aesthete-inference/app/config.py)
    queue.py                     # PostgREST RPC client: claim / complete / enqueue / requeue / cancel
    storage.py                   # room-scans bucket: download bundle, upload drawings (Storage REST)
    telemetry.py                 # scan_pipeline_events emitter (+ optional job_runs heartbeat)
    worker.py                    # the claim → dispatch → complete loop
    doctor.py                    # env / DB / Storage / GPU / disk preflight
    stages/
      __init__.py                # task_type → handler dispatch table
      ingest.py                  # scan_pipeline.ingest
      solve.py                   # scan_pipeline.solve  (least-squares scale fit)
      drawings.py                # scan_pipeline.drawings
      validator.py               # shared bundle-validation checks (single source with the CLI script)
    drawing/
      svg.py                     # native SVG plan + four elevations
      pdf.py                     # PDF (renderer choice — open question §9)
      dxf.py                     # ezdxf layered DXF (walls/openings/dimensions/text)
  tests/
    test_config.py  test_ingest.py  test_solve_fit.py  test_dxf.py  test_doctor.py
```

`cli.py` subcommands:
- `run` — the long-lived loop (what `systemd` starts).
- `once` — claim-and-drain one batch, then exit (cron-style / manual re-drain / debugging).
- `doctor` — preflight, no queue interaction (§6).

Dependencies are ordinary PyPI wheels: a Supabase/PostgREST HTTP client (or `httpx` + hand-rolled RPC calls, as `aesthete-inference` does), `numpy`/`scipy` (least-squares fit), `ezdxf` (DXF), and the chosen PDF path. `install.sh` builds the venv, `pip install .`, drops the unit and env template, and prints the doctor result — the same venv-bootstrap shape as `aesthete-inference/Makefile`.

---

## 5. systemd unit and storage paths

### 5.1 Unit sketch

```ini
# /etc/systemd/system/patina-scan-worker.service
[Unit]
Description=Patina Field Capture scan-pipeline worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=patina
Group=patina
EnvironmentFile=/etc/patina/scan-worker.env
ExecStart=/opt/patina/scan-pipeline/.venv/bin/patina-scan-worker run
Restart=always
RestartSec=5
# hardening — outbound-only worker needs no privilege and no host write beyond scratch
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/patina/scan-work
# logs to journald
StandardOutput=journal
StandardError=journal
SyslogIdentifier=patina-scan-worker

[Install]
WantedBy=multi-user.target
```

`Restart=always` makes a crash self-healing; combined with the queue's visibility timeout, a job the worker died mid-way through is reclaimed and re-run without operator action.

### 5.2 Storage path convention

Bundles arrive under the established `room-scans` layout (00077/00287): `{artifactType}/{userId}/{scanId}/…`. The 00287 designer-read RLS reads segment `[2]` as `userId` and segment `[3]` as `scanId`, so **any** object a designer must read has to keep the user and scan ids in those positions. Drawings therefore land under a `room_files`-versioned prefix that preserves them:

```
room_file/{userId}/{scanId}/v{version}/plan.svg
room_file/{userId}/{scanId}/v{version}/plan.pdf
room_file/{userId}/{scanId}/v{version}/plan.dxf
```

The worker writes with the service-role key (bypassing storage RLS on write), but the path must still satisfy 00287 so the **designer read** resolves. `room_files.svg_url/pdf_url/dxf_url` store these object paths; the portal downloads them the same way the spec-pdf edge function does (signed/authorized GET → blob). No new bucket (R-e); the 500 MB object limit and 00077 MIME list govern.

**D2 verdict (settled by evidence — item 12 read depends on it).** The 00287 policy body is:
`rs.user_id::text = (storage.foldername(name))[2] AND ( rs.id::text = (…)[3] OR (rs.room_id IS NOT NULL AND rs.room_id::text = (…)[3]) )`.
The drawings prefix `room_file/{userId}/{scanId}/v{version}/…` puts the **scan id** at segment `[3]`, which satisfies the **first branch** (`rs.id::text = [3]`) — exactly the segment the iOS bundle uploader writes, and the case 00287 was authored to fix. So a designer with an `active`/`full`|`preview` association reads the drawings without a `room_id`-shaped path. No later migration overrides this (00306/00320 touch unrelated storage policies). **`scanId` at `[3]` is correct; the prefix stays as-is.**

---

## 6. `doctor` — preflight

`patina-scan-worker doctor` exits non-zero on any red, and prints a line per check. It touches nothing in the queue.

- **Env completeness** — every `*(required)*` var present; `STAGES` values are known; `GPU` is a legal value.
- **DB reachability** — `agent_queue_stats()` returns (proves the service-role key authenticates and the RPCs are reachable over 443).
- **Storage reachability** — a HEAD/list against `room-scans` succeeds.
- **GPU visibility** — reports whether a CUDA device is present (`nvidia-smi` / driver query). In P1 this is **informational** — a red GPU line is a warning, not a failure, because no P1 stage uses it. At P2 a splat-enabled worker treats it as required.
- **Disk headroom** — free space in `WORK_DIR` against `MAX_CONCURRENT × ~1.5 GB` plus the retention window; warns below headroom.

`doctor` is what `install.sh` runs last and what Kody runs after any env change.

---

## 7. Failure, retry, and re-run semantics

All retry logic lives in the queue (00297), not the worker. The worker's job is to classify an error and call `complete_agent_task` with the right `p_fatal`.

| Situation | Worker action | Queue behavior |
|---|---|---|
| Transient (network, storage blip, lock contention) | `complete_agent_task(outcome='failed', p_fatal=false)` | Requeued with backoff: `1m → 5m → 25m` keyed on `attempts`; parks at `max_attempts`. Same `room_file_version`. |
| Permanent (corrupt/invalid bundle, unsolvable geometry, poison) | `complete_agent_task(outcome='failed', p_fatal=true)` + `room_files.status='error'` | Immediately `failed` (parked), no further retries. |
| Worker died mid-job | *(none — process gone)* | Lease expires after `VISIBILITY_TIMEOUT`; `claim_agent_tasks` reclaims the stale `running` row; `groom_agent_tasks` (every 6h) also resets orphaned `running` rows. |
| Parked `failed`, operator wants a retry | — | `requeue_agent_task(id, actor)` → `failed → queued`, attempts reset. Same version, idempotent re-run. |
| Parked `failed`, unattended | — | `groom_agent_tasks` auto-requeues **once** after the failed cooldown (6h), marked `payload.groom_requeued_at` so it never auto-loops. |
| Deliberate fresh re-run / re-scan | Entry point reserves version + 1 | A new `room_files` row and a new ingest→solve→drawings chain. |

**Inspectability.** Every failed job is a row in `agent_tasks` with `last_error`, `attempts`, `task_type`, `payload` (scan_id, version), and its `parent_task_id` chain; `agent_task_audit` holds the full transition history with `actor = WORKER_ID`; `scan_pipeline_events` holds the per-stage `*.failed` event with a structured `detail`. Item 9's AC — "failed jobs are inspectable and re-runnable" — is satisfied by the queue's own surfaces; no bespoke admin table.

**Second-worker AC.** Because `claim_agent_tasks` uses `FOR UPDATE SKIP LOCKED`, a second worker attaching (even a stub) with a different `WORKER_ID` claims disjoint tasks with zero coordination. That is the burst-ready proof (item 9 AC) and it is purely a config act.

---

## 8. Telemetry contract

### 8.1 `scan_pipeline_events`

The worker is a `service_role` writer of `scan_pipeline_events` (00341). `stage` is the coarse CHECK-bounded phase; `event` is a free-form name within the stage (new instrumentation needs no migration); `detail` carries the structured payload; `duration_ms` times the work.

| `stage` | `event` (examples) | `status` | `detail` shape |
|---|---|---|---|
| `ingest` | `ingest.started` / `ingest.validated` / `ingest.succeeded` / `ingest.failed` | started/succeeded/failed | `{ artifact_count, total_bytes, anchor_count, unverified, failure_token? }` |
| `solve` | `solve.started` / `solve.fit` / `solve.succeeded` / `solve.failed` | started/succeeded/failed | `{ anchors_used, scale_factor, mean_residual_mm, per_anchor_residual_mm[], tolerance_counts{verified,measured,estimated} }` |
| `drawing` | `drawings.started` / `drawings.rendered` / `drawings.succeeded` / `drawings.failed` | started/succeeded/failed | `{ formats[], bytes{svg,pdf,dxf}, sloped_ceiling_estimated? }` |
| `delivery` | `delivery.published` | succeeded | `{ room_file_id, version, svg_url, pdf_url, dxf_url }` |

Every event names `scan_id`; `solve`/`drawing`/`delivery` events also set `room_file_id`. The `capture` and `upload` stages (also CHECK-valid) are populated by the iOS app and the upload-completion path — they bracket the worker's stages but are not the worker's writes; item 13's end-to-end query surface reads all six stages for one scan in `created_at` order.

### 8.2 `agent_tasks` payload / artifacts shapes

| Stage | `payload` (set at enqueue) | `artifacts` (merged at `complete`) |
|---|---|---|
| `scan_pipeline.ingest` | `{ scan_id, room_file_version, user_id }` | `{ validated: true, artifact_count, unverified }` |
| `scan_pipeline.solve` | `{ scan_id, room_file_id, room_file_version }` | `{ room_file_id, tolerance_counts, mean_residual_mm }` |
| `scan_pipeline.drawings` | `{ scan_id, room_file_id, room_file_version }` | `{ svg_url, pdf_url, dxf_url }` |

`complete_agent_task` merges `p_artifacts` into the row (`artifacts || p_artifacts`), so the terminal `agent_tasks` row for each stage records what it produced — a second inspection surface alongside the events stream.

### 8.3 `job_runs` (optional heartbeat)

`job_runs` (00300) is built for pg_cron jobs and is **not** required by this worker — `agent_tasks` + `scan_pipeline_events` already give full inspectability. If an ops heartbeat is wanted, the worker may write a `job_runs` row (`job_name='scan-pipeline-worker'`) per shift/drain, following the groom pattern. This is a secondary, optional signal, not the telemetry of record.

---

## 9. Security posture

- **One credential, server-side.** The worker's only secret is `SUPABASE_SERVICE_ROLE_KEY`, held in `/etc/patina/scan-worker.env` (mode `0600`, owned by the `patina` service user, delivered via `EnvironmentFile` so it never appears in `argv` or the unit file). It lives on the Kody-managed box, never on any client (house rule: `service_role` stays server-side).
- **Zero-ingress.** All traffic is outbound HTTPS/443 to Strata (PostgREST + Storage). The worker opens no socket. The host firewall can deny all inbound. Kody's **Cloudflare Tunnel is ops access** (SSH/monitoring), an independent process (`cloudflared`); the worker neither requires nor uses it — the pipeline drains with the tunnel stopped.
- **systemd hardening** — `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, and a `ReadWritePaths` allowlist scoped to the scratch dir (§5.1). The worker needs no privilege and no host write beyond scratch.
- **Storage discipline** — writes only under the `room_file/{userId}/{scanId}/v{version}/…` prefix so 00287 designer-read RLS resolves; reads only the `room-scans` bucket.

**Hardening follow-up (not P1 scope).** The service-role key is broad — it can read and write every table. A P2/hardening option is to replace it with a **least-privilege LOGIN role** or a **scoped JWT** minted for the worker, granted only: `EXECUTE` on the five queue RPCs it calls; write on the three server-generated tables (`room_files`, `room_file_measurements`, `scan_pipeline_events`); read on `room_scans` + `scan_anchors`; and Storage read/write on `room-scans`. This is a documented follow-up, not a P1 blocker — P1 accepts the service-role key on a single trusted box.

---

## 10. P2 growth path

P2 (SfM pose refinement, dense fusion, splat training — deck SC-10) slots in **as new stages**, not a new system:

- **New task types** extend the namespace: e.g. `scan_pipeline.densefuse`, `scan_pipeline.splat`. The chain grows by one enqueue — the point that today ends at `drawings` (or a parallel branch off `solve`) enqueues the GPU stage.
- **GPU workers are config, not code.** A splat-capable worker is the same package with `GPU=auto` and `STAGES=splat` (or `…,splat`) on the box with the card. CPU-only workers simply don't enable those stages, so they never claim them — `claim_agent_tasks(p_task_types := STAGES)` filters by exactly the stages a worker opted into.
- **Schema already anticipates it.** `room_file_measurements.source` widens its CHECK to add `'mesh'` (dense-fusion evidence) — noted as P2 in 00341; no structural change. `scan_pipeline_events.stage` and `event` absorb new phases without a migration.
- **The burst contract is the same contract.** R108.4/R109.1's "cloud worker = config change" applies unchanged to a GPU cloud burst worker: same package, GPU env on, splat stage enabled.

---

## Appendix A — Box-prep for Kody

What the Linux box needs to run P1 (and to be P2-ready):

- **Distro** — Ubuntu 22.04/24.04 LTS or Debian 12, x86_64. A service user `patina` and `systemd` (present on all three).
- **Python** — 3.11 or newer, with `venv` (`apt install python3.11-venv`). `install.sh` builds the venv; no system-wide Python packages.
- **CPU only for P1** — the three P1 stages (validate, least-squares scale fit, SVG/PDF/DXF) are CPU-bound. No GPU driver is needed to run P1. `doctor` will report GPU absent as a warning, which is expected.
- **Optional NVIDIA for P2** — the proprietary NVIDIA driver + a CUDA toolkit matching the card (the 2080 Ti is Turing; a newer card is fine). `nvidia-smi` should list the device; then `doctor` reports the GPU green. Only needed when a splat stage is enabled.
- **Disk** — bundles are 300–600 MB each; scratch sizing ≈ `MAX_CONCURRENT × ~1.5 GB` (download + render headroom) plus the retention window. Provision **≥ 50–100 GB** on the `WORK_DIR` volume; `RETENTION_HOURS` prunes downloaded bundles and rendered sets. (P2 splat outputs will want considerably more — size that when P2 lands.)
- **Network** — **outbound 443 only**. No inbound ports, no forwarding, no reverse proxy in front of the worker. The firewall may deny all inbound. `cloudflared` (Kody's tunnel) is a separate, optional install for SSH/ops in — independent of the worker.
- **Time** — `chrony`/NTP so `scan_pipeline_events` and audit timestamps are sane.
- **Files** — `/etc/patina/scan-worker.env` at `0600` owned by `patina`; venv at `/opt/patina/scan-pipeline/.venv`; scratch at `/var/lib/patina/scan-work`.

Bring-up: `sudo ./install.sh` → edit `/etc/patina/scan-worker.env` (URL, key, `WORKER_ID`) → `patina-scan-worker doctor` → `systemctl enable --now patina-scan-worker` → watch `journalctl -u patina-scan-worker -f`.

---

## Appendix B — Open questions (for blessing)

Only genuinely open items; everything else here is a code-only call already made.

1. **PDF renderer (item 11).** SVG is native and DXF is `ezdxf`. PDF can be (a) **render the SVG → PDF** with a converter (`cairosvg`/`resvg` — one draw path, but adds a native dependency), or (b) **draw the PDF directly** (`reportlab` — pure-Python, independent draw path, dimension styling duplicated). Recommendation: (a) `cairosvg`, so plan/elevation geometry is authored once as SVG. A blessable item-11 decision — needs a nod because the drawing's rendered appearance is designer-visible (M3), so the *choice of engine* should be confirmed against the first CAD-opened output.
2. **Version-allocation point.** This design reserves `room_file_version` (and the pending `room_files` row) at the **entry point**, so a failed-validation run consumes a version number (a gap-free record of a started run). If Kody prefers versions to represent only *successful* deliverables, allocation moves into `solve` and ingest keys off the bundle-manifest identity instead. Default: reserve-at-entry.
3. **Ingest-enqueue trigger.** The initial `scan_pipeline.ingest` job is enqueued by the upload-completion path (the `confirm-scan-bundle` successor edge function vs. a DB trigger on upload-complete). This is the item-9 boundary between the DB/edge side and the worker; called out so it isn't dropped between the two.
