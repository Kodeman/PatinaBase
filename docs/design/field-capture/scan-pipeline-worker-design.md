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
  install.sh                     # stage/verify/smoke, transactionally activate venv + units
  install-venv-lib.sh            # durable snapshot/switch/rollback/recovery state machine
  patina-scan-worker.service     # systemd unit (§5)
  patina-scan-worker-doctor.service # doctor-only acceptance oneshot (§5/§6)
  patina-scan-worker.gpu.conf    # identical worker + doctor GPU drop-in
  patina-scan-worker-nvidia-prepare.service # GPU-only root device-node oneshot
  scan-worker.env.example        # → /etc/patina/scan-worker.env (root:root 0600)
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

Dependencies are stage-named extras, so a CPU worker never resolves CUDA by
accident: `[solve]` (numpy/scipy), `[drawings]` (ezdxf/cairosvg), `[refine]`
(pycolmap + numpy/scipy), `[fuse]` (Open3D/trimesh), and `[splat]` (the pinned
cu118 torch + gsplat band). `[gpu]` is only the box convenience meta-extra for
`refine+fuse+splat`; it is not a new execution mode.

`install.sh` builds an immutable candidate release, runs `pip check`, an
installed-package import/entrypoint smoke, and—on Linux—`systemd-analyze verify`
against a staged unit tree. It then fsyncs a root-only snapshot at
`/etc/patina/.scan-worker-install-transaction` of installed unit
presence/content and current/previous release references before stopping an
active service. Unit replacement and the normal `.venv` symlink switch are
same-filesystem atomic renames. A failed activation restores all unit/release
snapshots, daemon-reloads, and restarts the prior service; a durable transaction
marker makes the next invocation recover an interrupted switch. A legacy real
`.venv` directory is converted once while stopped under that same recovery
record. The installer never runs doctor from its root shell.

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
Environment=XDG_CONFIG_HOME=/opt/patina/scan-pipeline/.config
Environment=XDG_CACHE_HOME=/opt/patina/scan-pipeline/.cache
Environment=XDG_DATA_HOME=/opt/patina/scan-pipeline/.data
Environment=XDG_STATE_HOME=/opt/patina/scan-pipeline/.state
ExecStartPre=/opt/patina/scan-pipeline/.venv/bin/patina-scan-worker doctor
ExecStart=/opt/patina/scan-pipeline/.venv/bin/patina-scan-worker run
TimeoutStartSec=15min
Restart=always
RestartSec=5
# hardening — outbound-only worker needs no privilege and no host write beyond scratch
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/patina/scan-work /opt/patina/scan-pipeline/.config /opt/patina/scan-pipeline/.cache /opt/patina/scan-pipeline/.data /opt/patina/scan-pipeline/.state
# logs to journald
StandardOutput=journal
StandardError=journal
SyslogIdentifier=patina-scan-worker

[Install]
WantedBy=multi-user.target
```

`Restart=always` makes a crash self-healing; combined with the queue's visibility timeout, a job the worker died mid-way through is reclaimed and re-run without operator action.

GPU installs apply one identical additive drop-in to this worker and to a
separate `patina-scan-worker-doctor.service` oneshot. The drop-in requires the
root `patina-scan-worker-nvidia-prepare.service`, grants the exact single-card
compute/control/UVM nodes, disables `PrivateDevices` for those allowed nodes,
and confines torch/CUDA/JIT caches under the base unit's writable `.cache`.
The doctor oneshot duplicates the worker's `User`/`Group`, `EnvironmentFile`,
XDG environment, timeout, sandbox, and `ReadWritePaths`; its only `ExecStart` is
`patina-scan-worker doctor`. It has no `run`, restart policy, or `[Install]`
section, so item-3 GPU acceptance cannot claim queue work or be enabled.

### 5.2 Storage path convention

Bundles arrive under the established `room-scans` layout (00077/00287): `{artifactType}/{userId}/{scanId}/…`. The 00287 designer-read RLS reads segment `[2]` as `userId` and segment `[3]` as `scanId`, so **any** object a designer must read has to keep the user and scan ids in those positions. Drawings therefore land under a `room_files`-versioned prefix that preserves them:

```
room_file/{userId}/{scanId}/v{version}/plan.svg
room_file/{userId}/{scanId}/v{version}/plan.pdf
room_file/{userId}/{scanId}/v{version}/plan.dxf
```

The worker writes with the service-role key (bypassing storage RLS on write), but the path must still satisfy 00287 so the **designer read** resolves. `room_files.svg_url/pdf_url/dxf_url` store these object paths; the portal downloads them the same way the spec-pdf edge function does (signed/authorized GET → blob). No new bucket (R-e); the 500 MB object limit and 00077 MIME list govern.

**D2 verdict (settled by evidence — the P1 item 12 Room File read depends on it; not the P2 item-12 present preview).** The 00287 policy body is:
`rs.user_id::text = (storage.foldername(name))[2] AND ( rs.id::text = (…)[3] OR (rs.room_id IS NOT NULL AND rs.room_id::text = (…)[3]) )`.
The drawings prefix `room_file/{userId}/{scanId}/v{version}/…` puts the **scan id** at segment `[3]`, which satisfies the **first branch** (`rs.id::text = [3]`) — exactly the segment the iOS bundle uploader writes, and the case 00287 was authored to fix. So a designer with an `active`/`full`|`preview` association reads the drawings without a `room_id`-shaped path. No later migration overrides this (00306/00320 touch unrelated storage policies). **`scanId` at `[3]` is correct; the prefix stays as-is.**

**Capture-context resolution (P1 item 12, the Room File page — distinct from the P2 item-12 present preview) — provenance is FLAT, not nested.** The Room File page's capture-context list resolves `field_captures` to a scan via `provenance`, because the inbox row does **not** persist project/scan columns (00233/00235). The iOS `ContextCaptureProvenance` contract flattens provenance to a `[String:String]` map with **dotted top-level keys** — the value lives under `"siteScanContext.scanId"`, NOT a nested `{ siteScanContext: { scanId } }` object. Resolve by `@>` containment, never a `->siteScanContext->>scanId` path (that matches nothing and misparses the dot):
`field_captures.provenance @> '{"siteScanContext.scanId":"<scanId>"}'`.
**P2 scale:** add a GIN index on `field_captures(provenance)` (or an expression index on the `scanId` key) before this runs against a large inbox — the `@>` filter is a seq scan without it (fine at pilot volume).

---

## 6. `doctor` — preflight

`patina-scan-worker doctor` exits non-zero on any red, and prints a line per check. It touches nothing in the queue.

- **Env completeness** — every `*(required)*` var present; `STAGES` values are known; `GPU` is a legal value.
- **DB reachability** — `agent_queue_stats()` returns (proves the service-role key authenticates and the RPCs are reachable over 443).
- **Storage reachability** — a HEAD/list against `room-scans` succeeds.
- **GPU visibility and stage runtime** — GPU absence is informational for a CPU
  stage set and red for `refine`/`fuse`/`splat`. Readiness is scoped to enabled
  stages: the refine command/module surface is a preflight only (runtime engine
  qualification belongs to the item-4 decision record); fuse requires Open3D's
  public CUDA availability/device probe; splat requires CUDA 11.8 `nvcc`, a
  cu118 torch wheel with `sm_75` plus a real CUDA arithmetic op, and gsplat's
  public rasterizer returning the expected CUDA shapes, finite values, and a
  positive alpha. See
  `p2-item4-colmap-adapter-spike-2026-07-18.md` for the refine runtime decision.
- **Disk headroom** — free space in `WORK_DIR` against `MAX_CONCURRENT × ~1.5 GB` plus the retention window; warns below headroom.

`install.sh` never invokes doctor as root. Normal worker activation runs it as
`ExecStartPre`, which inherits the exact service user, root-read
`EnvironmentFile`, XDG/cache paths, filesystem sandbox, and—on GPU installs—the
NVIDIA dependency and `DeviceAllow`. For acceptance before GPU handlers are
registered, Kody starts `patina-scan-worker-doctor.service`; that oneshot inherits
the same context but can never execute `run`. The empty GPU-queue query is kept
as rollout evidence only, not as a race-prone safety gate.

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

- **One credential, server-side.** The worker's only secret is
  `SUPABASE_SERVICE_ROLE_KEY`, held in `/etc/patina/scan-worker.env` as
  **`root:root` mode `0600`**. PID 1 reads `EnvironmentFile` before launching
  `User=patina`; the unprivileged process neither needs nor receives file access,
  and the secret never appears in `argv` or the unit file. It lives on the
  Kody-managed box, never on any client (house rule: `service_role` stays
  server-side).
- **Zero-ingress.** All traffic is outbound HTTPS/443 to Strata (PostgREST + Storage). The worker opens no socket. The host firewall can deny all inbound. Kody's **Cloudflare Tunnel is ops access** (SSH/monitoring), an independent process (`cloudflared`); the worker neither requires nor uses it — the pipeline drains with the tunnel stopped.
- **systemd hardening** — `NoNewPrivileges`, `ProtectSystem=strict`,
  `ProtectHome`, `PrivateTmp`, and a `ReadWritePaths` allowlist scoped to scratch
  plus the four app-owned XDG directories (§5.1). GPU policy grants only the
  accepted card's compute/control/UVM nodes and redirects all CUDA/JIT caches
  under the allowed app cache. The root NVIDIA oneshot prepares device nodes;
  worker and doctor processes remain unprivileged.
- **Storage discipline** — writes only under the `room_file/{userId}/{scanId}/v{version}/…` prefix so 00287 designer-read RLS resolves; reads only the `room-scans` bucket.

**Hardening follow-up (not P1 scope).** The service-role key is broad — it can read and write every table. A P2/hardening option is to replace it with a **least-privilege LOGIN role** or a **scoped JWT** minted for the worker, granted only: `EXECUTE` on the five queue RPCs it calls; write on the three server-generated tables (`room_files`, `room_file_measurements`, `scan_pipeline_events`); read on `room_scans` + `scan_anchors`; and Storage read/write on `room-scans`. This is a documented follow-up, not a P1 blocker — P1 accepts the service-role key on a single trusted box.

---

## 10. P2 stage contract — the Present Layer (deck SC-10/SC-11)

> **Status:** this section was P1's growth stub; it is now the **P2-M1 stage
> contract** (field-capture-p2-package.md item 1, ruled R114). P2 ("Presence")
> lands three new GPU stages + a solve upgrade + a Present lifecycle **as new
> stages, not a new system** — the same package, the same `agent_tasks` queue,
> the same telemetry/storage conventions. No new NestJS service, no new bucket.
> Schema is 00376/00377 (§10.6). Budgets are ratified in **R114.2** (≤10 min
> wall-clock for the full GPU chain per room on the 2080 Ti, MCMC-capped; amber
> past ~20 min; GS-Scale host-offload is the over-budget escape hatch).

### 10.1 Topology — how the stages chain

The P1 chain (`ingest → solve → drawings → delivery`) is untouched. P2 appends a
GPU branch that reads the same bundle the P1 rig already wrote (keyframes + depth
+ ARKit poses + intrinsics + `mesh.ply`; capture-bundle-spec §3/§4):

```
ingest ──▶ solve(P1) ──▶ drawings ──▶ delivery        (True Layer, P1 — unchanged)
   │
   └─▶ refine ──▶ fuse ──▶ solve-upgrade(mesh) ─┐
                    │                            ├─▶ present (rollup)   (Present Layer, P2)
                    └─▶ splat ───────────────────┘
```

- `refine` warm-starts from the bundle's ARKit trajectory; `fuse` needs
  `refine`'s poses; the **mesh-aware solve upgrade** (item 6) needs `fuse`'s dense
  mesh; `splat` is a **parallel branch off `refine`** (it needs refined poses +
  keyframe images, not the mesh or the drawings), so it runs concurrently with
  `fuse`+solve on a second GPU lease or serially on one card.
- Each hop is one `enqueue_agent_task` of the next `scan_pipeline.*` type against
  the **same reserved `room_files` version** (entry-point allocation, 00370; §2.2).
  A P2 run does **not** mint a new version; a **retroactive re-solve** (R114.3) of
  an existing scan mints v+1 per R-f, then runs this same chain against it.
- `present` is a bookkeeping rollup: when `fuse`+solve-upgrade and `splat` have
  both succeeded it flips `room_files.present_status='ready'` + `presented_at`.

### 10.1.1 Fork-join coordination — enqueue-both, join-on-both (no barrier primitive)

The P1 chain enqueues exactly one successor per stage. P2's `refine → {fuse,
splat}` fork and the `{solve-upgrade, splat} → present` join need more, but reuse
the SAME queue primitives (00297) — no barrier, no coordinator, no new table:

- **The fork.** `refine`, on success, enqueues BOTH successors —
  `enqueue_agent_task('scan_pipeline.fuse', …, idempotency_key '{scan}:fuse:{v}')`
  AND `enqueue_agent_task('scan_pipeline.splat', …, idempotency_key
  '{scan}:splat:{v}')` — both `p_on_conflict='ignore'`, both `parent_task_id =
  refine.id`. The two then run independently (concurrently on two GPU leases,
  serially on one — §10.9). A crash between the two enqueues just re-runs `refine`;
  the idempotency keys de-dupe both successors (§2.3 crash-safety, unchanged).
- **The join (the trick).** BOTH terminal branches enqueue `present` on the SAME
  key: the fuse branch tip (`solve-upgrade`, §10.4) enqueues `scan_pipeline.present`
  with `'{scan}:present:{v}'`, and `splat` enqueues the identical
  `'{scan}:present:{v}'` — both `p_on_conflict='ignore'`. The SECOND enqueue is a
  no-op, so `present` is created **exactly once**, by whichever branch finishes
  first, with zero coordination. That double-enqueue-onto-one-key IS the join;
  there is no barrier primitive to build or get wrong.
- **The wait (present self-gates on the data).** When `present` runs it re-reads
  the `room_files` row and checks BOTH prerequisites: the fuse branch's outputs
  (`dense_mesh_url` **and** `measure_mesh_url` set) **and** the splat branch's
  output (`splat_url` set). If either is still NULL — the slower branch hasn't
  landed — `present` raises **`TransientError`** (NOT fatal): `complete_agent_task(
  outcome='failed', p_fatal=false)` → backoff-requeue on the same key. It never
  fires early (it reads the actual columns, not a timer), never partially rolls
  up, and needs no wake-up event. When the slower branch lands, the next `present`
  attempt sees all three URLs set → flips `present_status='ready' + presented_at`
  and completes `done`.
- **Visibility-timeout / cost implications.** A `present` retry is a CHEAP no-op —
  a single indexed read of three URL columns; no GPU, no download, no lease held
  between attempts. The backoff (1m/5m/25m keyed on attempts, §7) at the default
  `max_attempts=5` gives ~80 min of retry headroom, comfortably outlasting the
  slower branch's R114.2 budget (~20 min), so `present` waits `splat` out without
  parking. Size `present`'s `max_attempts` to the slower branch's worst-case
  budget, never below. The slower branch's own enqueue-present stays a
  conflict-ignore no-op while `present` is still queued/running, so the join never
  double-runs.
- **Failure semantics — inspect-and-requeue, by design.** If EITHER branch parks
  **fatal** (a degenerate `refine`, an empty `fuse` volume, a VRAM blow-out with
  GS-Scale unavailable — §10.2/10.3/10.5), its URL column never gets set, so
  `present` keeps transient-failing on backoff until it exhausts `max_attempts`
  and parks `failed` too. That is the INTENDED posture, not a bug: the parked
  `present` and the parked branch are both inspectable rows
  (`agent_tasks.last_error`, `scan_pipeline_events.*.failed`, the `parent_task_id`
  chain), and the operator fixes the ROOT cause — `requeue_agent_task(<branch>)` —
  then requeues `present` (or lets the 6-hourly groom auto-requeue it once, 00300).
  A fatal branch never produces a half-rolled-up Present Layer; the room stays at
  its last real branch state until a human clears the branch.

### 10.2 Stage `scan_pipeline.refine` — SfM/BA pose refinement (GPU)

- **Reads:** keyframes (sharp, ~200–400), ARKit per-frame poses + camera
  intrinsics from the bundle (warm start), the sparse loop.
- **Engine:** **GLOMAP** global SfM warm-started on the known poses/intrinsics
  (reuses COLMAP's feature-extraction + matching front-end, same DB format);
  **COLMAP-incremental pose-prior** fallback behind config (`REFINE_ENGINE`).
- **Writes (scratch/derived):** refined per-frame poses, a sparse point cloud,
  per-frame pose deltas. Not a deliverable artifact — consumed by `fuse`/`splat`.
- **DB:** `present_status='refining'`; `present.refine_engine`, `present.sfm_residual_pct`.
- **Budget:** GPU; SIFT extraction on-GPU, the global solve is CPU/RAM-bound and
  VRAM-light on the 11 GB card. Target: the drift residual falls to ~0.2–0.5 %
  (SC-13) inside the R114.2 chain budget.
- **Telemetry:** `refine.started` / `refine.succeeded` (`duration_ms`, residual,
  iterations, `vram_peak_mb`) / `refine.failed`.
- **Failure classes:** a low-overlap / degenerate single-room loop fails
  **permanent** (`p_fatal=true`) — it never hangs the lease, never silently ships
  raw ARKit poses as "refined." OOM / driver blip / transient IO = **transient**
  (retry with backoff, §7).

### 10.3 Stage `scan_pipeline.fuse` — TSDF dense mesh + web mesh (GPU)

- **Reads:** `refine`'s refined poses + the bundle's per-frame depth.
- **Method:** TSDF volumetric fusion (Open3D-class) → a full dense mesh; then
  **decimate** to a browser-sized watertight-ish `measure_mesh.glb`; extract
  **true ceiling planes/slopes** from the fused geometry (verbatim, not the P1
  R111.2 corner-height chord synthesis). Bless-class params: voxel size,
  truncation, decimation target.
- **Writes (deliverable):** `dense_mesh.(ply|glb)` (measurement source of truth,
  server-side) + `measure_mesh.glb` (the invisible browser raycast target), both
  under `room_file/{userId}/{scanId}/v{version}/` (§5.2), sha256 recorded.
- **DB:** `present_status='fusing'`; `room_files.dense_mesh_url`,
  `measure_mesh_url`; `present.mesh_vertices`, `present.mesh_bytes`.
- **Budget:** GPU/RAM for the volume; `measure_mesh.glb` must land under the
  browser size budget (the item-8 viewer target).
- **Telemetry:** `fuse.started` / `fuse.succeeded` (`duration_ms`, mesh vertices,
  decimated bytes, `vram_peak_mb`) / `fuse.failed`.
- **Failure classes:** insufficient depth coverage / empty volume = **permanent**;
  transient IO/OOM = **transient**.

### 10.4 Solve upgrade — mesh-aware re-fit, `source='mesh'` (item 6, CPU)

Not a new GPU stage — the P1 anchor-solve widened to re-measure walls / openings /
ceilings against the **dense mesh**. Emits `room_file_measurements` with
`source='mesh'` (00376) + tightened `tolerance_mm`; replaces the R111.2 chord
synthesis with true ceiling geometry where present. **Anchor discipline unchanged:**
`'verified'` still requires an anchor (`rfm_anchor_source_shape`), so mesh evidence
tightens `'measured'` — it never manufactures `'verified'` under the short P1
anchors. The certificate records the source shift + tolerance change honestly.
Writes the measurement set delete-then-insert under `rfm_element_ref_uniq`.

### 10.5 Stage `scan_pipeline.splat` — 3DGS training → SPZ (GPU)

- **Reads:** `refine`'s refined poses + the keyframe images (parallel to `fuse`).
- **Trainer:** **gsplat / splatfacto** with a **Gaussian-count-capped (MCMC)**
  densification — a **predictable VRAM ceiling + time budget** on the 11 GB Turing
  card (the R114.2 cap is what makes ~10–20 GPU-min *bounded*). Export **SPZ 4**
  ("JPG for splats," ~10× smaller than PLY). **Transient masking** of people/pets
  (SC-14): flagged frames are **excluded and logged**, never silently trained on.
  GS-Scale CPU host-offload is the escape hatch for a room that blows 11 GB.
- **Writes (deliverable):** `scene.spz` under `room_file/{userId}/{scanId}/v{version}/`,
  sha256 recorded.
- **DB:** `present_status='training'`; `room_files.splat_url`;
  `present.splat_format='spz4'`, `gaussian_count`, `train_seconds`, `vram_peak_mb`,
  `masked_frames`, `splat_bytes`.
- **Budget:** the dominant GPU cost; must fit the R114.2 per-room budget on the
  2080 Ti (preview-grade quality at pilot scale).
- **Telemetry:** `splat.started` / `splat.succeeded` (`gaussian_count`,
  `train_seconds`, `vram_peak_mb`, masked count) / `splat.failed`.
- **Failure classes:** VRAM blow-out past the cap **with** GS-Scale unavailable =
  **permanent**; transient OOM/driver = **transient**.

### 10.6 Schema — 00376 / 00377 (additive; §D of the P2 package)

- **00376** — `room_file_measurements.source` CHECK `+ 'mesh'`;
  `scan_pipeline_events.stage` CHECK `+ 'refine','fuse','splat','present'`;
  `room_files` Present columns (`dense_mesh_url`, `measure_mesh_url`, `splat_url`,
  `present jsonb NOT NULL DEFAULT '{}'`, `present_status` CHECK
  `pending|refining|fusing|training|ready|error`, `presented_at`). Additive,
  idempotent, catalog-guarded; no GRANT change.
- **00377** — `scan_pipeline_runs` (CREATE OR REPLACE) gains
  `refine_ms/fuse_ms/splat_ms + present_status`; new **`scan_present_stats`** view
  (gaussian count, train seconds, VRAM peak, mesh vertices, SPZ+mesh bytes) for
  the GPU-budget telemetry. Both SECURITY DEFINER + admin-domain gated (00372
  idiom); the new view's GRANT regenerates the legacy-grants seed.
- **No migration needed for the task types** — `agent_tasks.task_type` has no
  CHECK, so `scan_pipeline.refine/fuse/splat` are claimed by config alone (§2.1).

### 10.7 Packaging, workers, and the burst contract

- **GPU workers are config, not code.** A splat-capable worker is the same package
  with the `[splat]`/`[solve]` extras installed, `GPU=auto`, and
  `STAGES=…,refine,fuse,splat` on the box with the card. CPU-only workers omit
  those stages and never claim them — `claim_agent_tasks(p_task_types := STAGES)`
  filters by exactly the stages a worker opted into.
- **Extras** (item 3): `[solve]` (pycolmap / GLOMAP bindings-or-CLI, numpy/scipy),
  `[splat]` (torch cu-xx for Turing SM 7.5, gsplat, SPZ tooling) — a CPU worker
  never pulls CUDA. `doctor` treats the GPU as **required** when `STAGES` includes
  a GPU stage (nvidia-smi + torch/CUDA import + every cache dir writable).
  CUDA/torch caches confine under `APP_DIR` (I85 finding 3, extended to the
  torch-hub / CUDA-JIT / nvidia cache surfaces).
- **The burst contract is the same contract (R114.6).** R108.4/R109.1's "cloud
  worker = config change, not code" holds for the GPU stages: same package, GPU
  env on, GPU stages enabled, on a rented cloud GPU (L4 / A10 / 4090-class). Flip
  trigger stays **first non-Leah designer in production**; a **per-room GPU-cost
  ceiling** attaches to the flip (unlike P1's free CPU stages, a GPU burst costs
  money per room). Pilot volume stays on Kody's 2080 Ti box.

### 10.8 What P2 does NOT change here

The `present` device **preview** (P2 package item 12, R114.1) is **capture-side
iOS**, not a worker stage — it is device-local, disposable, and never enters this
pipeline or the bundle. The server-trained `splat` above stays the Room File
deliverable; click-to-measure rays only the hidden `measure_mesh.glb`.

### 10.9 Wall-clock budget — per stage, and the parallel-vs-serial honesty (R114.2)

Per-room budget on Kody's **2080 Ti (11 GB Turing)**, MCMC-capped, at pilot
quality — realistic against the §10.2–10.5 engine survey:

| stage | resource | per-room budget (2080 Ti) |
|---|---|---|
| `refine` (GLOMAP SfM/BA, warm-started, ~200–400 keyframes) | GPU front-end + CPU/RAM solve | **2–4 min** (~3) |
| `fuse` (TSDF dense mesh + decimate) + `solve-upgrade` (CPU mesh re-fit) | GPU volume + CPU | **3–5 min** (~4 + ~1) |
| `splat` (MCMC-capped gsplat/splatfacto → SPZ) — the dominant cost | GPU | **6–14 min** (~8–9) |
| `present` (rollup) | none | **< 0.5 min** |

- **Serial (one card — the pilot).** A single 2080 Ti runs every GPU stage in
  series: `refine + fuse + solve-upgrade + splat + present` ≈ **~15–24 min**. That
  is **R114.2's amber band (~15–25 min) BY DESIGN** — amber is the
  ruled-acceptable pilot outcome, not a miss. One card is the pilot's reality and
  the honest number.
- **Parallel (two leases — the ≤10 aspiration).** `splat` is a parallel branch off
  `refine` (§10.1), so a second GPU lease overlaps it with `fuse+solve-upgrade`.
  The critical path collapses to `refine + max(fuse+solve, splat) + present` ≈
  `3 + max(~5, ~8) + 0.5` ≈ **~11–12 min**; on a **faster cloud card** (L4 / A10 /
  4090-class, R114.6) `splat` itself drops enough to bring the whole chain **under
  the ≤10-min R114.2 target**. The ≤10 target therefore assumes the branches
  parallelize across GPU leases — it is *not* reachable on a single 2080 Ti.
- **The cloud-burst contract (R114.6) is the path back under 10** — the same
  package on a rented GPU (config, not code — §10.7) both parallelizes the branches
  AND shortens `splat`. Pilot volume (single-designer, one card) stays amber and
  accepted; the burst flip (first non-Leah designer) is what buys ≤10, with a
  per-room GPU-cost ceiling attached.
- **Watch it live:** `scan_present_stats` (00377) surfaces `train_seconds`,
  `vram_peak_mb`, `gaussian_count`, and `mesh_vertices` per room — the budget is
  measured, not assumed; a room drifting toward the GS-Scale escape hatch shows up
  there before it parks.

---

## Appendix A — Box-prep for Kody

What the Linux box needs to run P1 (and to be P2-ready):

- **Distro** — Ubuntu 22.04/24.04 LTS or Debian 12, x86_64. A service user `patina` and `systemd` (present on all three).
- **Python** — 3.11 or newer, with `venv` (`apt install python3.11-venv`). `install.sh` builds the venv; no system-wide Python packages.
- **CPU only for P1** — the three P1 stages (validate, least-squares scale fit, SVG/PDF/DXF) are CPU-bound. No GPU driver is needed to run P1. `doctor` will report GPU absent as a warning, which is expected.
- **Optional NVIDIA for P2** — the proprietary NVIDIA driver, CUDA 11.8 toolkit,
  and `/usr/bin/nvidia-modprobe` for the accepted RTX 2080 Ti/cu118 stack.
  `nvidia-smi` and the stage-scoped systemd doctor must both pass before any GPU
  stage is enabled.
- **Disk** — bundles are 300–600 MB each; scratch sizing ≈ `MAX_CONCURRENT × ~1.5 GB` (download + render headroom) plus the retention window. Provision **≥ 50–100 GB** on the `WORK_DIR` volume; `RETENTION_HOURS` prunes downloaded bundles and rendered sets. (P2 splat outputs will want considerably more — size that when P2 lands.)
- **Network** — **outbound 443 only**. No inbound ports, no forwarding, no reverse proxy in front of the worker. The firewall may deny all inbound. `cloudflared` (Kody's tunnel) is a separate, optional install for SSH/ops in — independent of the worker.
- **Time** — `chrony`/NTP so `scan_pipeline_events` and audit timestamps are sane.
- **Files** — `/etc/patina/scan-worker.env` at `0600` owned by `root:root`;
  stable venv symlink at `/opt/patina/scan-pipeline/.venv`; immutable releases
  beside it; scratch at `/var/lib/patina/scan-work`.

Bring-up: `sudo ./install.sh` → edit `/etc/patina/scan-worker.env` (URL, key,
`WORKER_ID`) → `systemctl start patina-scan-worker-doctor` for a context-accurate
preflight → `systemctl enable --now patina-scan-worker` → watch
`journalctl -u patina-scan-worker -f`. Item-3 GPU-only acceptance stops at the
doctor unit and never starts the queue worker with unregistered GPU stages.

---

## Appendix B — Open questions (for blessing)

Only genuinely open items; everything else here is a code-only call already made.

1. **PDF renderer (item 11).** SVG is native and DXF is `ezdxf`. PDF can be (a) **render the SVG → PDF** with a converter (`cairosvg`/`resvg` — one draw path, but adds a native dependency), or (b) **draw the PDF directly** (`reportlab` — pure-Python, independent draw path, dimension styling duplicated). Recommendation: (a) `cairosvg`, so plan/elevation geometry is authored once as SVG. A blessable item-11 decision — needs a nod because the drawing's rendered appearance is designer-visible (M3), so the *choice of engine* should be confirmed against the first CAD-opened output.
2. **Version-allocation point.** This design reserves `room_file_version` (and the pending `room_files` row) at the **entry point**, so a failed-validation run consumes a version number (a gap-free record of a started run). If Kody prefers versions to represent only *successful* deliverables, allocation moves into `solve` and ingest keys off the bundle-manifest identity instead. Default: reserve-at-entry.
3. **Ingest-enqueue trigger.** The initial `scan_pipeline.ingest` job is enqueued by the upload-completion path (the `confirm-scan-bundle` successor edge function vs. a DB trigger on upload-complete). This is the item-9 boundary between the DB/edge side and the worker; called out so it isn't dropped between the two.
