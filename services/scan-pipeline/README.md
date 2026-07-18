# Patina scan-pipeline worker

The Field Capture **reconstruction worker**: it turns an uploaded capture bundle
into a versioned, tolerance-stamped Room File through three sequential jobs —
**ingest → solve → drawings** — each claimed from the existing `agent_tasks`
queue, each enqueuing its successor on success, each landing telemetry into
`scan_pipeline_events`.

- **Design authority:** `docs/design/field-capture/scan-pipeline-worker-design.md` (R109).
- **Bundle it consumes:** `docs/design/field-capture/capture-bundle-spec-v1.md`.
- **Queue it uses:** `supabase/migrations/00297_agent_tasks_queue.sql` (never a parallel queue).
- **Schema it reads/writes:** `supabase/migrations/00341_field_capture_p1_schema.sql`
  (`scan_pipeline_events`, `room_files`) + the ingest trigger/sweep migration
  `00370_scan_pipeline_ingest_trigger.sql`.

This build (**P1 item 9**) ships the **ingest** stage and the full worker
plumbing (config, queue, storage, telemetry, doctor, systemd packaging). `solve`
(item 10) and `drawings` (item 11) are **registered NOT-IMPLEMENTED stubs** that
park a claimed task fatally with a clear message — the chain is wired end to end,
so those items only replace a stub body.

## Architecture in one breath

- **Pull-based, zero-ingress.** Reaches production over **outbound HTTPS only**
  (PostgREST RPCs + the `room-scans` Storage API). No inbound listener, no port
  forwarded. Kody's Cloudflare Tunnel is ops access (SSH/monitoring), **not** a
  dependency — the pipeline drains with the tunnel down.
- **The queue is `agent_tasks`.** Claims/completes through the SECURITY DEFINER
  RPCs; `assignee` stays NULL and the `awaiting_review/approved/rejected` states
  are never used (a mechanical job has no human gate).
- **Native package, no orchestration.** Runs under `systemd` in a venv (R109.1).
- **Burst-ready by config.** Identity + behaviour come entirely from an env file;
  a cloud burst worker is the same package with a different `WORKER_ID`/`STAGES`.

## Install on a Linux box

Ubuntu 22.04/24.04 LTS or Debian 12, x86_64, Python 3.11+ with `venv`
(`apt install python3-venv`). Outbound 443 only — the host firewall may deny all
inbound.

```bash
sudo ./install.sh                       # CPU worker: venv + .[drawings] + unit + env template
sudo -e /etc/patina/scan-worker.env     # set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID
sudo systemctl enable --now patina-scan-worker  # ExecStartPre doctor gates worker start
systemctl status patina-scan-worker
journalctl -u patina-scan-worker -f
```

CPU is enough for the P1 stages (validate + least-squares fit + SVG/PDF/DXF) and
the CPU P2 stages. `install.sh` (no flags) installs **only** the CPU extras —
never CUDA. On a CPU worker a missing GPU is a `doctor` **warning**; it becomes a
hard **failure** only when `STAGES` lists a GPU stage (see below). Provision
**≥ 50–100 GB** on the `WORK_DIR` volume (bundles are 300–600 MB; scratch ≈
`MAX_CONCURRENT × ~1.5 GB` + the retention window).

### Box prep (GPU)

The GPU stages — `refine` (COLMAP), `fuse` (Open3D TSDF), `splat` (gsplat
3DGS → SPZ) — run on an NVIDIA box. **Turing pin reality (target GPU = RTX 2080
Ti, SM 7.5):** `sm_75` is *not* dropped from modern PyTorch — it stays in the
**cu118** (CUDA 11.8) wheel's arch list. The binding constraint is the box's
**CUDA-11.x-era driver**, which needs the cu118 *runtime*, so we install the
`+cu118` torch wheel via the PyTorch index. `install.sh --gpu` does this for you
(`--extra-index-url https://download.pytorch.org/whl/cu118`). The torch band is
pinned in `pyproject.toml` `[splat]`; the unit's stage-scoped `ExecStartPre`
doctor is the ground truth.

Prereqs to install **before** `./install.sh --gpu`:

1. **NVIDIA driver** new enough for CUDA 11.8 (≥ 520). Verify: `nvidia-smi`.
2. **CUDA 11.8 toolkit** (`nvcc`) — gsplat JIT-compiles its CUDA kernels at
   install against the torch CUDA version, so `nvcc` must be 11.8. Verify:
   `nvcc --version`.
3. **COLMAP** on `PATH` with `feature_extractor`, `sequential_matcher`,
   `exhaustive_matcher`, `point_triangulator`, `bundle_adjuster`, and
   `pose_prior_mapper`. These are the `refine` stage's known-pose path and
   fallback (not pip; `pycolmap` is pulled by `.[refine]`). `global_mapper` is
   reported when available but is not treated as a full-pose warm start.

Then:

```bash
sudo ./install.sh --gpu                 # + .[gpu] via cu118 index, + GPU systemd drop-in
sudo -e /etc/patina/scan-worker.env     # set STAGES to include the GPU stage(s), e.g.
                                        #   STAGES=ingest,refine,fuse,splat,present
sudo systemctl enable --now patina-scan-worker  # ExecStartPre must pass before claims
systemctl status patina-scan-worker
journalctl -u patina-scan-worker -n 100 --no-pager
sudo systemd-analyze verify /etc/systemd/system/patina-scan-worker.service
sudo systemctl show patina-scan-worker \
  -p User -p Environment -p ReadWritePaths -p PrivateDevices -p DevicePolicy -p DeviceAllow
```

`--gpu` also lays down `…/patina-scan-worker.service.d/gpu.conf`, which grants
the accepted single-2080-Ti box's exact `/dev/nvidia0`, control, UVM, and modeset
nodes. Systemd does not expand device-path globs; a future multi-GPU box must add
one exact `/dev/nvidiaN` line per card. The drop-in also confines `TORCH_HOME`,
`CUDA_CACHE_PATH`, and `TORCH_EXTENSIONS_DIR` under `APP_DIR/.cache` so
`ProtectSystem=strict` never redirects model, kernel, or extension-build caches
outside the app-owned write surface.

`install.sh` does not run doctor from its root shell. The authoritative doctor is
`ExecStartPre` in the worker unit, so it inherits `User=patina`, the real
`EnvironmentFile`, XDG/GPU variables, `DeviceAllow`, `ProtectSystem`, and
`ReadWritePaths`. Any RED check stops the worker before it can claim a task. A
manual `patina-scan-worker doctor` remains useful diagnostics, but does not prove
the systemd sandbox/device policy.

Optional pre-install resolver evidence on a networked Linux host:

```bash
python3 -m pip install --dry-run --report /tmp/patina-gpu-resolve.json \
  --extra-index-url https://download.pytorch.org/whl/cu118 '.[gpu]'
```

### Upgrading a running worker

The worker installs a **copy** of the source into its venv, so `git pull` alone
does **not** change a running worker's behaviour. `--upgrade` rebuilds the venv
from the pulled source. It fails before touching the venv if a GPU drop-in exists
but `--gpu` was omitted, preventing an accidental CUDA-dependency downgrade:

```bash
git pull
sudo ./install.sh --upgrade             # CPU worker
# or, on the accepted GPU box:
sudo ./install.sh --gpu --upgrade
sudo systemctl restart patina-scan-worker
```

## The env file (`/etc/patina/scan-worker.env`)

See `scan-worker.env.example`. Required (no default): `WORKER_ID`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is the worker's
**only** write credential — mode `0600`, owned by the `patina` user, delivered
via `EnvironmentFile` so it never appears in `argv`. Full schema: design §3.

| var | default | purpose |
|---|---|---|
| `WORKER_ID` | *(required)* | identity in `locked_by` + `app.actor` (audit); unique per worker |
| `SUPABASE_URL` | *(required)* | Strata PostgREST + Storage base |
| `SUPABASE_SERVICE_ROLE_KEY` | *(required)* | service-role JWT (server-side only) |
| `STAGES` | `ingest,solve,drawings` | which `scan_pipeline.*` stages this worker claims. Known: `ingest,solve,drawings` (CPU, live) + `refine,fuse,splat,present` (P2; `refine/fuse/splat` are GPU). Default stays CPU-only — a GPU box lists the GPU stages explicitly |
| `POLL_SECONDS` | `5` | sleep between empty polls |
| `MAX_CONCURRENT` | `2` | claim batch size / max in-flight |
| `GPU` | `auto` | `auto` = detect+report; `off` = never touch. `doctor` makes the GPU check a hard failure (not a warning) when `STAGES` lists a GPU stage; `GPU=off` + a GPU stage is a contradiction it flags |
| `VISIBILITY_TIMEOUT` | `60 minutes` | lease length; a dead worker's job is reclaimable after this (a 500 MB bundle on a slow link needs the room; the lost-race guard covers overruns) |
| `MAX_ATTEMPTS` | `5` | max attempts on enqueued successors (backoff parks here) |
| `ROOM_SCANS_BUCKET` | `room-scans` | bucket bundles arrive in / drawings write to |
| `WORK_DIR` | `/var/lib/patina/scan-work` | scratch root (on the `ReadWritePaths` allowlist) |
| `RETENTION_HOURS` | `48` | how long scratch lingers before the janitor prunes it |
| `HTTP_TIMEOUT_S` | `30` | per-request timeout |
| `LOG_LEVEL` | `info` | journald verbosity |

## Commands

```bash
patina-scan-worker run           # long-lived loop (what systemd starts)
patina-scan-worker run --once    # claim-and-drain one batch then exit
patina-scan-worker once          # alias for `run --once`
patina-scan-worker doctor        # diagnostics only; no queue interaction (systemd ExecStartPre is authoritative)
```

## Operate

- **Watch:** `journalctl -u patina-scan-worker -f`.
- **Inspect a failed job:** it is a row in `agent_tasks` (`last_error`,
  `attempts`, `task_type`, `payload` = `scan_id`/version, `parent_task_id`
  chain); `agent_task_audit` holds the transition history (`actor = WORKER_ID`);
  `scan_pipeline_events` holds the per-stage `*.failed` event with a structured
  `detail`. No bespoke admin table.
- **Re-run a parked `failed` job** (after fixing the cause):
  ```sql
  select public.requeue_agent_task('<task-uuid>', 'kody');  -- failed → queued, attempts reset, same version
  ```
  The worker re-runs the same `room_file_version` idempotently. Alternatively the
  6-hourly groom auto-requeues a cooled-down `failed` task **once**.
- **Fresh re-run / re-scan:** a new bundle upload flips the scan to `ready` again
  → the trigger allocates version+1 → a new ingest→solve→drawings chain and a new
  `room_files` row.
- **Burst:** stand up a second worker with a different `WORKER_ID` (same package,
  different env file). `claim_agent_tasks` uses `FOR UPDATE SKIP LOCKED`, so the
  two claim disjoint tasks with zero coordination.

## How ingest is enqueued (the DB side)

Migration `00370` adds a SECURITY DEFINER trigger on `room_scans`: when a scan
transitions to `status = 'ready'` with `scan_schema_version >= 3`, it enqueues
`scan_pipeline.ingest` (idempotent, conflict-ignore). A 15-minute pg_cron
**catch-up sweep** enqueues any ready schema-3 scan with no live/terminal ingest
task (belt-and-braces for a lost enqueue), logging to `job_runs`. The trigger
allocates the `room_file_version`; the ingest stage reserves the pending
`room_files` row.

## Troubleshooting

- **Drawings stage crashes with `[Errno 13] Permission denied` under the service
  user's home** — e.g. `…/.config/ezdxf/ezdxf.ini` (first incident) then
  `…/.cache/ezdxf/font_manager_cache.json` (second). ezdxf touches its XDG
  **config** AND its **font cache** on use; if the `patina` service user's
  `~/.config` / `~/.cache` are root-owned or absent (a fresh-install footgun,
  compounded by `ProtectHome=true`), those writes EACCES and the drawings stage
  errors.

  The worker confines **all four** XDG base dirs inside `APP_DIR`: the systemd
  unit sets `XDG_CONFIG_HOME` / `XDG_CACHE_HOME` / `XDG_DATA_HOME` /
  `XDG_STATE_HOME` to `/opt/patina/scan-pipeline/.{config,cache,data,state}`
  (each also on `ReadWritePaths`), and `install.sh` creates all four owned by
  `patina`. **Durable fix on a box that hit this: re-run `sudo ./install.sh`**
  (creates/chowns the dirs and refreshes the unit) → `systemctl daemon-reload &&
  systemctl restart patina-scan-worker`.

  **No-redeploy interim fix** (before pulling this repo change) — a systemd
  drop-in override:
  ```bash
  sudo systemctl edit patina-scan-worker    # writes …/patina-scan-worker.service.d/override.conf
  ```
  ```ini
  [Service]
  Environment=XDG_CONFIG_HOME=/opt/patina/scan-pipeline/.config
  Environment=XDG_CACHE_HOME=/opt/patina/scan-pipeline/.cache
  Environment=XDG_DATA_HOME=/opt/patina/scan-pipeline/.data
  Environment=XDG_STATE_HOME=/opt/patina/scan-pipeline/.state
  ReadWritePaths=/opt/patina/scan-pipeline/.config /opt/patina/scan-pipeline/.cache /opt/patina/scan-pipeline/.data /opt/patina/scan-pipeline/.state
  ```
  ```bash
  sudo install -d -o patina -g patina /opt/patina/scan-pipeline/.{config,cache,data,state}
  sudo systemctl daemon-reload && sudo systemctl restart patina-scan-worker
  ```

  `patina-scan-worker doctor` has an `xdg` check that fails preflight (naming the
  offending var) if any XDG base dir is not writable. A GPU stage also probes
  torch hub, CUDA kernel, and torch extension-build caches.

## Telemetry query surface (item 13)

Every run lands events in `scan_pipeline_events` across all six stages —
`capture` (metrics from the validated manifest), `upload` (timing snapshot from
the `room_scans` columns), `ingest` / `solve` / `drawing` / `delivery`. Two
admin-only views (migration `00372`) are the "minimal query surface":

```sql
-- per-scan run summary: stage durations (ms), wall time, room_file status,
-- and the last scan_pipeline.* task's status/attempts/error.
SELECT scan_id, room_file_version, room_file_status, tolerance_class,
       ingest_ms, solve_ms, drawing_ms, wall_seconds,
       last_task_status, last_task_attempts
FROM   public.scan_pipeline_runs
ORDER  BY last_event_at DESC
LIMIT  20;

-- per-deliverable tolerance distribution: counts + p50/p95 tolerance_mm by class.
SELECT tolerance_class, measurement_count, with_tolerance,
       p50_tolerance_mm, p95_tolerance_mm, max_tolerance_mm
FROM   public.scan_tolerance_distribution
WHERE  room_file_id = '<uuid>'
ORDER  BY tolerance_class;

-- the raw stage timeline for one scan (all six stages, created_at order).
SELECT stage, event, status, duration_ms, detail
FROM   public.scan_pipeline_events
WHERE  scan_id = '<uuid>'
ORDER  BY created_at;
```

**Append-only caveat.** `scan_pipeline_events` is append-only and a stage can
re-run (transient retry, `requeue_agent_task`, the groom auto-requeue), so
`capture.metrics` and `upload.snapshot` (and every other stage event) **re-emit
once per ingest attempt** — a scan with N ingest attempts has N `capture.metrics`
rows. `scan_pipeline_runs` already collapses this (it aggregates with `max(...)
FILTER` / `min`/`max` per scan), but any consumer *counting captures or uploads*
directly off the event stream must dedupe — e.g. `DISTINCT ON (scan_id, stage,
event) … ORDER BY scan_id, stage, event, created_at` (first attempt) or a
`GROUP BY scan_id` — never a raw `count(*)`.

Both views are SECURITY DEFINER + admin-domain gated (they read past the
event tables' delegated RLS, then self-restrict to `roles.domain = 'admin'`), so
they return rows only to an admin caller. To probe them locally, impersonate a
seeded admin:

```sql
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';
SELECT * FROM public.scan_pipeline_runs LIMIT 5;
```

## Stage seam (items 10 / 11 → P2 4–7)

`src/patina_scan_worker/stages/__init__.py` is the `task_type → handler` dispatch
table. Item 10 replaced `stages/solve.py`'s stub (`.[solve]`: numpy/scipy); item
11 replaced `stages/drawings.py`'s stub (`.[drawings]`: ezdxf/cairosvg). The P2
GPU stages slot in the same way: items 4–7 add handlers for `refine`
(`.[refine]`: pycolmap + numpy/scipy), `fuse` (`.[fuse]`: open3d/trimesh),
`splat` (`.[splat]`: torch cu118 + gsplat), and `present`. Those stage names are
already in `KNOWN_STAGES` so a GPU box can advertise them and `doctor` can gate
on them ahead of the handlers landing; a stage claimed before its handler exists
parks cleanly. `.[gpu]` is the box one-liner (= refine+fuse+splat). Nothing else
in the worker changes — the claim loop, telemetry, queue completion, and burst
contract are stage-agnostic.

## The vendored validator

`src/patina_scan_worker/stages/validator.py` is a **byte-identical** copy of
`scripts/validate_capture_bundle.py` (the single canonical source stays in
`scripts/`), so the device-side and server-side bundle verdicts run the same code
path (design §2.4, a blessed item-9 call). `tests/test_validator_drift.py`
asserts byte-identity and fails loudly if the two diverge — when the canonical
script changes, re-copy it:

```bash
cp scripts/validate_capture_bundle.py \
   services/scan-pipeline/src/patina_scan_worker/stages/validator.py
```

## Tests

```bash
cd services/scan-pipeline
python -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/pytest -q
```
