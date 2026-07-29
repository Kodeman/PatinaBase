# Patina scan-pipeline worker

The Field Capture **reconstruction worker**: it turns an uploaded capture bundle
into a versioned, tolerance-stamped Room File through three sequential jobs —
**ingest → solve → drawings** — each claimed from the existing `agent_tasks`
queue, each enqueuing its successor on success, each landing telemetry into
`scan_pipeline_events`.

- **Design authority:** `docs/design/field-capture/scan-pipeline-worker-design.md` (R109).
- **Bundle it consumes:** `docs/design/field-capture/capture-bundle-spec-v1.md`.
- **Queue it uses:** `supabase/migrations/00297_agent_tasks_queue.sql`, with
  lease-owner fencing from `00378_agent_task_lease_ownership.sql` (never a
  parallel queue).
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
- **The queue is `agent_tasks`.** Claims, completions, and successor enqueues
  use SECURITY DEFINER RPCs. Each successor is created through
  `enqueue_agent_successor_if_owned`, which locks the running owner task and checks
  its exact UUID-backed lease owner before the idempotent enqueue. The RPC's
  `owner_task_id` is lease authority; `parent_task_id` is lineage and can differ
  at a fork/join (I87 Present). `assignee` stays NULL and the
  `awaiting_review/approved/rejected` states are never used (a mechanical job
  has no human gate).
- **Native package, no orchestration.** Runs under `systemd` in a venv (R109.1).
- **Burst-ready by config.** Behaviour and a readable identity prefix come from
  the env file; each claim batch adds a UUID, so overlapping workers never
  share completion authority. A cloud burst worker is the same package with
  its own `WORKER_ID`/`STAGES` labels.

## Install on a Linux box

Ubuntu 22.04/24.04 LTS or Debian 12, x86_64, Python 3.11+ with `venv`
(`apt install python3-venv`). Those bases support CPU workers. The CUDA 11.8
GPU pilot is officially qualified only on Ubuntu 22.04; Ubuntu 24.04 and Debian
12 GPU installs remain explicit qualification experiments and must not claim
GPU-stage tasks before the doctor and real fixtures pass. Outbound 443 only —
the host firewall may deny all inbound.

```bash
# Stop the worker and fail unless the service UID holds no old source inode.
(
set -eu
sudo systemctl stop patina-scan-worker 2>/dev/null || true
if id patina >/dev/null 2>&1 && sudo pgrep -u patina; then
  echo 'ERROR: stop every patina process before source staging.' >&2
  exit 1
fi

# Stage only reviewed build inputs in a separate root-owned trust tree.
sudo install -d -o root -g root -m 0755 /opt/patina/scan-pipeline-source
sudo rsync -a --delete --delete-excluded --ignore-times \
  --chown=root:root --chmod=Dgo-w,Fgo-w \
  --include='/README.md' \
  --include='/install-colmap-4.0.2.sh' \
  --include='/install.sh' \
  --include='/install-path-guard.py' \
  --include='/install-venv-lib.sh' \
  --include='/pycolmap-build-requirements.txt' \
  --include='/pyproject.toml' \
  --include='/patina-scan-worker.service' \
  --include='/patina-scan-worker-doctor.service' \
  --include='/patina-scan-worker.gpu.conf' \
  --include='/patina-scan-worker-nvidia-prepare.service' \
  --include='/scan-worker.env.example' \
  --include='/src/' --include='/src/patina_scan_worker/' \
  --include='/src/patina_scan_worker/*.py' \
  --include='/src/patina_scan_worker/*.c' \
  --include='/src/patina_scan_worker/**/' \
  --include='/src/patina_scan_worker/**/*.py' \
  --exclude='*' \
  ./ /opt/patina/scan-pipeline-source/
sudo chmod -R go-w -- /opt/patina/scan-pipeline-source
sudo /opt/patina/scan-pipeline-source/install.sh  # CPU + drawings + units
)
sudo -e /etc/patina/scan-worker.env        # set URL/key/WORKER_ID
sudo systemctl enable --now patina-scan-worker  # ExecStartPre doctor gates start
systemctl status patina-scan-worker
journalctl -u patina-scan-worker -f
```

That staging is the explicit first-run bootstrap trust event. Review the source,
stop every `patina` process, and let `--ignore-times` create fresh destination
inodes while `--delete --delete-excluded` removes stale inputs such as
`setup.py`, `setup.cfg`, `MANIFEST.in`, or `sitecustomize.py`. The installer
accepts an exact top-level and package file manifest below
`src/patina_scan_worker`, and the one packaged
`field_raster_libheif.c` qualification helper; every file must be root-owned,
non-group/world-writable, non-symlinked, regular, and single-linked. It validates
that closed snapshot before sourcing a helper or invoking the build backend.
The Python build backend runs only against a second validated copy inside the
durable install transaction; it never runs against this trust tree. The
installer revalidates the original snapshot before candidate activation, and
normal completion or interrupted-build recovery removes the private build copy.
The resulting worker wheel is closed-content validated, SHA-256 pinned into the
same dependency resolution as its extras, and retained under the immutable
release's `.artifacts/` directory so installed `direct_url.json` provenance never
points at deleted transaction state. Its package member names and bytes must
match that trusted source manifest exactly, and its dependency/extra metadata is
checked before pip is allowed to resolve it.
The package manifest now includes the queue-independent
`refine_native_process.py` and `refine_runner.py` foundations, and every
candidate release imports both as the `patina` service user before activation.
They remain deliberately unregistered: installing or importing them does not
add `scan_pipeline.refine` to the stage registry or change persistent/default
`STAGES`.
Archive-mode rsync also copies the checkout directory's mode onto the staged
tree. `--chmod=Dgo-w,Fgo-w` removes unsafe write bits during transfer; the
explicit `chmod -R go-w` repeats that hardening as defense-in-depth.

`/opt/patina/scan-pipeline` is runtime-only: immutable venv releases and the
service's delegated cache/state directories live there, never installer source.
The trusted installer atomically replaces any legacy `APP_DIR/install.sh` with
a fail-closed pointer to the separate source tree. Subsequent runs revalidate
the same source contract. Never run a patina-writable checkout with `sudo`.

If `/usr/bin/python3` is older than 3.11, select the installed interpreter for
a CPU worker with an absolute path, for example
`sudo PYTHON=/usr/bin/python3.11 /opt/patina/scan-pipeline-source/install.sh`.
The
installer canonicalizes that value and rejects an interpreter or ancestry that
is not root-owned, executable, and free of group/world writes before any
transaction helper runs.
GPU installs are intentionally narrower: the qualified local wheel targets the
exact `/usr/bin/python3` CPython 3.12 x86_64 ABI, so `--gpu` rejects a `PYTHON`
override even when another interpreter happens to report Python 3.12.

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
2. **`nvidia-modprobe` at `/usr/bin/nvidia-modprobe`** — the GPU install fails
   before making changes if it is absent. A root oneshot uses `-c 0` and `-u`
   on cold boot to create the compute/control and UVM device nodes before the
   unprivileged worker starts; modeset is not required.
3. **CUDA 11.8 toolkit** (`nvcc`) — gsplat may JIT-compile its CUDA kernels on
   the first public rasterization (the doctor deliberately triggers it) against
   the torch CUDA version, so `nvcc` must be 11.8. Verify: `nvcc --version`.
   The managed GPU drop-in selects `/usr/local/cuda-11.8` for both worker and
   doctor without changing the host's global CUDA selection. Architecture
   selection stays box-local so the same package can serve Turing, Ampere, and
   Ada workers; the DeskDev acceptance override below pins `7.5` explicitly.
4. **COLMAP CLI and CUDA PyCOLMAP 4.0.2 artifact**, with the CLI exposing
   `feature_extractor`, `sequential_matcher`,
   `exhaustive_matcher`, `point_triangulator`, `bundle_adjuster`, and
   `pose_prior_mapper`. `pyproject.toml` retains the truthful
   `pycolmap==4.0.2` refine requirement, but the ordinary PyPI wheel is CPU-only.
   `install.sh --gpu` supplies the separately qualified local wheel as a
   hash-pinned direct requirement in the same resolver transaction and verifies
   both pip's report and installed `direct_url.json`; it never accepts the
   same-version index wheel. This is the I87 pilot qualification target, not the
   current release or a completed validation (COLMAP 4.1.1 is current as of
   2026-07-18). The still-owed item-4 fixture must prove CLI/binding parity,
   exact DB/model APIs, GPU SIFT, and the real Field/Core Image raster
   materializer. COLMAP is a system binary, not a pip dependency. Standalone
   GLOMAP is archived and is not a prerequisite; integrated `global_mapper` is
   diagnostic-only, not the full-pose primary. The engine contract is owned by
   `docs/design/field-capture/p2-item4-colmap-adapter-spike-2026-07-18.md`, which
   supersedes the handoff's stale standalone-GLOMAP wording.

   DeskDev's Ubuntu 24.04 experiment has a repository-owned installer for the
   exact `d927f7e518fc20afa33390712c4cc20d85b730b8` source commit. Run it as the
   normal sudo-capable operator, **not** with `sudo`:

   ```bash
   install -d -m 0700 /mnt/ada-data/Patina/.patina-builds
   /opt/patina/scan-pipeline-source/install-colmap-4.0.2.sh \
     --work-dir "/mnt/ada-data/Patina/.patina-builds/patina-colmap-4.0.2-$UID" \
     --acknowledge-experimental-ubuntu-24.04
   ```

   The custom parent must be precreated as a real, canonical directory owned by
   the operator with mode `0700`; the installer securely creates the exact
   `patina-colmap-4.0.2-$UID` leaf. It rejects symlinks, mount-root targets,
   group/world-writable leaves, and filesystems mounted `noexec`. Omitting
   `--work-dir` preserves the default
   `/var/tmp/patina-colmap-4.0.2-$UID`. The initial 30 GiB free-space gate
   applies to whichever filesystem is selected; after the retained native
   executable exists, an 8 GiB resume gate allows the binding build to finish.

   It hard-gates Noble/amd64, `/usr/local/cuda-11.8`, GCC/G++ 11, a real SM 7.5
   compile/run probe, 30 GiB of free build space, the exact tag commit, required
   commands, and the CUDA build header. It installs an immutable tree at
   `/opt/colmap/4.0.2` and creates `/usr/local/bin/colmap` only when that path is
   absent or already resolves to the exact tree. It does not install or switch
   the driver or global CUDA selection. The script uses scoped sudo only for OS
   packages and the final checked-tree copy; CMake configure/build/install runs
   unprivileged. It then builds PyCOLMAP outside the worker venv from the same
   exact source tree with hash-pinned build wheels, GCC/G++ 11, CUDA 11.8, and
   SM 7.5. Before atomically publishing the closed immutable artifact under
   `/opt/patina/scan-pipeline-artifacts/pycolmap-4.0.2-cuda118-sm75`, it checks
   wheel metadata/RECORD, ELF links/RPATH, exact binding build identity, and a
   timeout-bounded real CUDA SIFT extraction. Existing valid artifacts are
   reused; invalid existing content fails closed rather than being replaced.
   A failed privileged copy is retained only at the exact
   `/opt/patina/scan-pipeline-artifacts/.pycolmap-4.0.2-candidate-$UID` path and
   blocks retries. Keep the worker stopped, confirm no installer is running,
   inspect that directory with `sudo find -P ... -maxdepth 1 -ls` plus the
   retained `install.log`, then quarantine or remove only that exact candidate
   before retrying. Never alter the published versioned artifact in place.

   Builds resume in the selected work directory; every build attempt after the
   host gates appends to its `install.log`, and failures retain source, build,
   staged install, and logs. Re-run the same command after correcting a failure.
   Afterwards, the non-mutating verification command is:

   ```bash
   /opt/patina/scan-pipeline-source/install-colmap-4.0.2.sh --verify-only
   ```

   A green installer closes the pinned CLI, binding-build, and bounded synthetic
   GPU-SIFT installation gates. It does **not** qualify item 4; the database/API
   fixture and real Field raster evidence below are still required.

5. **Full Open3D wheel/build with CUDA**, not `open3d-cpu`. `doctor` requires
   Open3D's public CUDA availability probe and at least one visible device for
   `fuse`; an importable CPU-only wheel is a failure.

Then:

```bash
sudo /opt/patina/scan-pipeline-source/install.sh --gpu  # GPU deps + policy
sudo systemd-analyze verify /etc/systemd/system/patina-scan-worker.service
sudo systemd-analyze verify /etc/systemd/system/patina-scan-worker-doctor.service
sudo systemd-analyze verify \
  /etc/systemd/system/patina-scan-worker-nvidia-prepare.service
sudo systemctl show patina-scan-worker \
  -p User -p Environment -p ReadWritePaths -p PrivateDevices -p DevicePolicy -p DeviceAllow
```

`--gpu` first requires that verified local artifact and exact interpreter ABI,
then lays down a root `patina-scan-worker-nvidia-prepare.service` plus the
same `gpu.conf` under both `patina-scan-worker.service.d/` and
`patina-scan-worker-doctor.service.d/`. The prepare oneshot creates the
single-card compute/control and UVM nodes at cold boot. Both drop-ins order and
require it, then grant only `/dev/nvidia0`, `/dev/nvidiactl`, and
`/dev/nvidia-uvm`; `/dev/nvidia-modeset` and `/dev/nvidia-uvm-tools` are optional
and intentionally not granted to this headless compute worker. Systemd does not
expand device-path globs; a future multi-GPU box must add one exact
`/dev/nvidiaN` line per card. The drop-in also confines `TORCH_HOME`,
`CUDA_CACHE_PATH`, and `TORCH_EXTENSIONS_DIR` under `APP_DIR/.cache` so
`ProtectSystem=strict` never redirects model, kernel, or extension-build caches
outside the app-owned write surface.

`install.sh` does not run doctor from its root shell. Normal service activation
is gated by `ExecStartPre` in the worker unit. A separate
`patina-scan-worker-doctor.service` oneshot duplicates the worker's
`User=patina`, real `EnvironmentFile`, XDG/GPU variables, NVIDIA dependency,
`DeviceAllow`, `ProtectSystem`, and `ReadWritePaths`, but its only command is
`patina-scan-worker doctor`: it cannot enter `run` or claim a queue task. A
manual shell invocation remains useful diagnostics, but does not prove the
systemd sandbox/device policy.

The splat check is intentionally stronger than an import: it calls gsplat's
public `rasterization` API for one Gaussian on a 16×16 CUDA target. A cold cache
may spend several minutes compiling the extension. The unit allows **15 minutes**
for startup; do not interrupt the first start, and confirm the subsequent warm
start is materially faster.

#### Item-3-only GPU acceptance (handlers not registered yet)

At item 3, `refine`, `fuse`, and `splat` are valid config names solely so doctor
can preflight their dependencies; their handlers arrive in items 4–7. Leaving
them enabled could claim and fatally park a matching task. Use this controlled
window only:

1. In the Strata SQL editor, capture rollout evidence that there are no
   claimable/requeueable GPU-stage tasks. The query must return **zero rows**:

   ```sql
   SELECT task_type, status, count(*)
   FROM public.agent_tasks
   WHERE task_type IN (
     'scan_pipeline.refine', 'scan_pipeline.fuse', 'scan_pipeline.splat'
   )
     AND status IN ('queued', 'running', 'failed')
   GROUP BY task_type, status;
   ```

   This is acceptance evidence, not a runtime safety mechanism: the next step
   is doctor-only and never enters the claim loop.

2. Copy/paste this as one subshell. It never edits the persistent shared env.
   Instead it stops the normal worker for resource isolation, creates a
   root-only temporary env plus a **doctor-only** `EnvironmentFile=` reset
   drop-in under `/run`, runs cold and warm doctors, removes the override, and
   restores the prior active/inactive posture. A reboot clears `/run`, so an
   enabled queue worker can boot only with its unchanged normal CPU stages. The
   temporary clone selects GCC/G++ 11 for CUDA host compilation, exposes the
   CUDA 11.8 runtime libraries, pins DeskDev's SM 7.5 target, and caps Ninja at
   four jobs; it does not change Ubuntu's global compiler or CUDA selection.
   The packet rejects every pre-existing doctor runtime `*.conf` (including an
   older diagnostic override) without deleting it. Inspect and explicitly
   remove or relocate a reported file before retrying:

   ```bash
   (
     set -eu
     env_file=/etc/patina/scan-worker.env
     item3_env=/run/patina/scan-worker-item3-gpu.env
     item3_dropin_dir=/run/systemd/system/patina-scan-worker-doctor.service.d
     item3_dropin=$item3_dropin_dir/90-item3-gpu-acceptance.conf
     assert_no_item3_runtime_dropins() {
       if [ -L "$item3_dropin_dir" ] || \
          { [ -e "$item3_dropin_dir" ] && [ ! -d "$item3_dropin_dir" ]; }; then
         echo "refusing unsafe doctor /run drop-in directory: $item3_dropin_dir" >&2
         return 1
       fi
       if [ -d "$item3_dropin_dir" ]; then
         item3_conflict="$(sudo /usr/bin/find -P "$item3_dropin_dir" \
           -mindepth 1 -maxdepth 1 -name '*.conf' -print -quit)"
         if [ -n "$item3_conflict" ]; then
           echo "refusing pre-existing doctor /run drop-in: $item3_conflict" >&2
           return 1
         fi
       fi
     }
     if [ -e "$item3_env" ] || [ -L "$item3_env" ]; then
       echo "refusing pre-existing item-3 /run env: $item3_env" >&2
       exit 1
     fi
     assert_no_item3_runtime_dropins
     was_active="$(systemctl show --property=ActiveState --value patina-scan-worker)"
     case "$was_active" in
       active|inactive|failed) ;;
       *) echo "refusing transitional worker state: $was_active" >&2; exit 1 ;;
     esac
     restore_item3_gpu() {
       trap - EXIT INT TERM
       sudo systemctl stop patina-scan-worker-doctor >/dev/null 2>&1 || true
       sudo rm -f -- "$item3_dropin" "$item3_env"
       sudo rmdir "$item3_dropin_dir" /run/patina 2>/dev/null || true
       sudo systemctl daemon-reload
       if [ "$was_active" = active ]; then
         sudo systemctl start patina-scan-worker
       fi
     }
     run_item3_doctor() {
       item3_label=$1
       echo "-- $item3_label item-3 GPU doctor"
       sudo journalctl --sync
       item3_cursor="$(sudo journalctl -n 1 --show-cursor --no-pager --quiet | \
         sed -n 's/^-- cursor: //p')"
       if [ -z "$item3_cursor" ]; then
         echo "could not capture journal cursor for $item3_label doctor" >&2
         return 1
       fi
       if sudo systemctl start patina-scan-worker-doctor; then
         item3_doctor_status=0
       else
         item3_doctor_status=$?
       fi
       sudo journalctl -u patina-scan-worker-doctor \
         --after-cursor="$item3_cursor" --no-pager --full -o cat
       return "$item3_doctor_status"
     }
     trap restore_item3_gpu EXIT INT TERM
     sudo systemctl stop patina-scan-worker
     sudo systemctl stop patina-scan-worker-doctor
     item3_doctor_state="$(systemctl show --property=ActiveState --value \
       patina-scan-worker-doctor)"
     case "$item3_doctor_state" in
       inactive|failed) ;;
       *) echo "refusing non-quiescent doctor state: $item3_doctor_state" >&2; exit 1 ;;
     esac
     assert_no_item3_runtime_dropins
     sudo install -d -o root -g root -m 0755 /run/patina "$item3_dropin_dir"
     sudo install -o root -g root -m 0600 "$env_file" "$item3_env"
     printf '%s\n' \
       '' \
       'STAGES=refine,fuse,splat' \
       'GPU=auto' \
       'CC=/usr/bin/gcc-11' \
       'CXX=/usr/bin/g++-11' \
       'CUDAHOSTCXX=/usr/bin/g++-11' \
       'LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64' \
       'TORCH_CUDA_ARCH_LIST=7.5' \
       'MAX_JOBS=4' | \
       sudo tee -a "$item3_env" >/dev/null
     printf '[Service]\nEnvironmentFile=\nEnvironmentFile=%s\n' "$item3_env" | \
       sudo install -o root -g root -m 0644 /dev/stdin "$item3_dropin"
     sudo systemctl daemon-reload
     run_item3_doctor cold
     run_item3_doctor warm
     restore_item3_gpu
   )
   ```

3. Require green `gpu`, `colmap`, `pycolmap`, `open3d-cuda`, `trimesh`, `nvcc`,
   `torch-cuda`, `gsplat-cuda`, and `xdg` lines. The persistent env is unchanged;
   a previously inactive/failed worker remains stopped. Do not enable GPU stages
   persistently until their handlers register. The doctor oneshot has no
   `[Install]` section and must never be enabled. Each run captures a fresh
   journal cursor before starting the doctor and prints only entries after that
   cursor, including the current failure output when `systemctl start` fails;
   older CPU-only or failed doctor records are excluded.

   If the shell is killed without running its trap on the same boot, the queue
   worker remains safely stopped. Recover by stopping the doctor, deleting only
   `/run/patina/scan-worker-item3-gpu.env` and
   `/run/systemd/system/patina-scan-worker-doctor.service.d/90-item3-gpu-acceptance.conf`,
   running `sudo systemctl daemon-reload`, and restarting the queue worker only
   if it was previously active. After a reboot those `/run` files are already
   gone; the persistent CPU env was never touched.

Optional pre-install resolver evidence is not a standalone command. Do not use
a standalone `pip install --dry-run '.[gpu]'` as GPU evidence: it
can select the ordinary CPU-only PyCOLMAP wheel. The managed GPU installer puts
the manifest-hashed local wheel and `.[drawings,gpu]` in one resolver request,
writes a pip report, and fails before activation unless that report and the
installed `direct_url.json` both identify the exact direct artifact.

### Item 4A — exact COLMAP/PyCOLMAP qualification

After the cold and warm Item 3 doctor runs pass, keep the queue worker stopped
and run the repository-owned local-only qualification harness. It exercises
the pinned CLI and the exact shared PyCOLMAP 4.0.2 database/model seam in
`patina_scan_worker.refine_engine` against a deterministic five-view PNG
fixture: CUDA SIFT, per-image camera IDs and
in-place PINHOLE rewrite, explicit-pair matching, trivial rig/frame known-pose
seed construction, point triangulation, and bundle adjustment. It retains
hard-capped 64 KiB engine-log tails and publishes a canonical evidence receipt
last. A separate non-identity full-pose seed is written and reopened to prove
3×4 `[R|t]` serialization without changing the identity-oriented imagery used
for triangulation, and the receipt binds both harness and shared-engine source
hashes. CLI `bundle_adjuster` is a compatibility probe; the pass/fail verdict
comes from the exact PyCOLMAP solver API's affirmative solution summary rather
than the CLI's unreliable zero exit status. It never imports the task queue,
Strata client, or Storage client, and it does not register a stage.

Use the exact environment-isolated operator packet and receipt criteria in
[`p2-item4a-colmap-qualification-runbook.md`](../../docs/design/field-capture/p2-item4a-colmap-qualification-runbook.md).
A green receipt closes only the tiny-fixture CLI/binding/API/GPU gate; the real
Field raster and real-room qualification gates remain open.

### P2 item 4A Field/Core Image raster qualification

This is a **standalone, local, non-mutating qualification gate**, not a worker
stage. It accepts only the three files produced by the physical-device Debug
fixture `field-core-image-raster-v1`, creates a deterministic P6 RGB raster and
canonical JSON receipt in a new local directory, and has no queue, database,
Storage, or Supabase imports. Keep `patina-scan-worker` stopped throughout the
run. Do not point it at arbitrary uploads.

The Noble `openimageio-tools` package is not used: its 2.4.17 HEIF reader lets
libheif apply transformations and then erases `Orientation`, which cannot prove
the raw stored raster. Instead, the Python gate copies the already-hash-verified
HEIC bytes to private `0700` scratch, compiles the packaged C helper
unprivileged with `/usr/bin/cc` and `/usr/bin/pkg-config`, and uses the public
system-libheif API. The helper requires the public file-type probe to report
exactly `image/heic` (HEIF using H.265), requires zero `irot`/`imir`/`clap`
properties, enumerates the public HEVC decoder descriptors and requires exactly
one available `libde265` descriptor, then decodes strict RGB twice (raw
`ignore_transformations=1` and default `ignore_transformations=0`) with that
descriptor's ID and requires byte identity. It also requires zero attached
metadata blocks, so no unseen Exif/XMP
orientation survives the gate. The asymmetric markers independently prove
exactly one physical clockwise rotation, and the materialized PPM deliberately
carries no metadata. HEIC marker matching is deliberately narrow and recorded
in the receipt: search radius `3 px`, maximum absolute error `64` in each RGB
channel. See the upstream
[libheif decode API](https://raw.githubusercontent.com/strukturag/libheif/v1.17.6/libheif/heif.h),
[transform-property API](https://raw.githubusercontent.com/strukturag/libheif/v1.17.6/libheif/heif_properties.h),
and [Ubuntu USN-8526-2](https://ubuntu.com/security/notices/USN-8526-2).

On Ubuntu 24.04, `install.sh --gpu` directly installs `build-essential`,
`pkg-config`, `zlib1g-dev` (required by Noble's `libheif.pc`), `libheif1`,
`libheif-dev`, and
`libheif-plugin-libde265`, then fails unless all three libheif packages match
and are at least `1.17.6-1ubuntu4.6`. If apt metadata is stale, run
`sudo apt-get update` and rerun the GPU install. The qualifier repeats the OS,
package-status, revision, header/runtime-version, and decoder checks and records
their exact evidence in its receipt.

After staging this commit and completing `install.sh --gpu --upgrade`, export
the fixture per `apps/mobile/Capture/README.md`. Then run the root-owned,
immutable installed package as the normal operator—never with `sudo`. The
receipt binds both installed Python harness and packaged C-helper source hashes:

```bash
cd /mnt/ada-data/Patina/PatinaBase

FIELD_RASTER_FIXTURE_DIR=/absolute/path/to/field-core-image-raster-v1-export
FIELD_RASTER_OUTPUT_DIR="/mnt/ada-data/Patina/.patina-builds/field-raster-qualification-v1-$UID"
FIELD_RASTER_PYTHON=/opt/patina/scan-pipeline/.venv/bin/python

if [ "$(systemctl is-active patina-scan-worker || true)" != inactive ]; then
  echo 'ERROR: stop patina-scan-worker before qualification.' >&2
  exit 1
fi
test ! -e "$FIELD_RASTER_OUTPUT_DIR"
test -x "$FIELD_RASTER_PYTHON"

"$FIELD_RASTER_PYTHON" -m patina_scan_worker.field_raster_qualification \
  --manifest "$FIELD_RASTER_FIXTURE_DIR/field-core-image-raster-v1.json" \
  --native-bgra "$FIELD_RASTER_FIXTURE_DIR/field-core-image-raster-v1-native.bgra" \
  --heic "$FIELD_RASTER_FIXTURE_DIR/field-core-image-raster-v1.heic" \
  --output-dir "$FIELD_RASTER_OUTPUT_DIR"

python3 -m json.tool \
  "$FIELD_RASTER_OUTPUT_DIR/field-raster-qualification-receipt-v1.json"
sha256sum "$FIELD_RASTER_OUTPUT_DIR"/*
systemctl is-active patina-scan-worker || true
```

Success prints `Field raster qualification: PASS`; the final service status
must remain `inactive`. Mac protocol/fake-tool tests prove fail-closed behavior
and canonicalization, but they do not close item 4A: retain the real exported
HEIC/BGRA/manifest, materialized PPM, receipt, package versions, and command
output from DeskDev as the qualification evidence packet.

### Upgrading a running worker

The worker installs a **copy** of the source into its venv, so `git pull` alone
does **not** change a running worker's behaviour. `--upgrade` builds a fresh
immutable `.venv.release.*`, runs `pip check`, imports the installed package,
exercises the console entrypoint, stages a complete systemd tree, and requires
`systemd-analyze verify` on Linux while the existing worker continues. The
executable namespace (`APP_DIR`, `.venv`, and every release tree) is root-owned
and not writable by `patina`; only `.config/.cache/.data/.state` and `WORK_DIR`
are delegated to the service account. Candidate and existing-release smoke
commands run as `patina`, never in the installer's root shell. Python venv
scripts embed their absolute build path, so a high-entropy final release name is
durably recorded before its atomic directory creation and is never renamed.
After the one-time legacy migration, the source tree is permanently root-owned
and never consumed by the running worker. For routine upgrades, repeat only the
root-owned `rsync --delete --delete-excluded --ignore-times` plus
`chmod -R go-w` staging block above while the worker remains active—do **not** repeat the first-run
`systemctl stop`/`pgrep` block. The transaction will observe and restore the
worker's active posture.

The installer then fsyncs a root-only snapshot under
`/etc/patina/.scan-worker-install-transaction` of every managed unit's installed
presence/content, the current/previous release references, and a durable state
marker. Recovery first requires a symlink-free root-owned `/etc/patina` and
transaction tree; every marker/snapshot input must be a regular root-owned,
non-group/world-writable file, and restored unit targets must exactly match the
installer's five-path allowlist. Relative release links are canonicalized
against `APP_DIR` before snapshot, never against process cwd. It inspects
`ActiveState` explicitly, treats an unloaded first-install unit as already
quiescent, and fails closed on `activating`, `deactivating`, or `reloading`. Only after a stable
`active` worker is stopped and confirmed quiescent does it atomically
replace units and the stable `.venv` symlink, reload systemd, and activate. If
candidate activation fails, it restores every unit and both release references,
daemon-reloads, and restarts the old worker. If power loss or SIGKILL interrupts
a switch, the next invocation performs that rollback before doing new work;
an interruption after the durable `committed` marker keeps the new release and
finishes cleanup instead of rolling it back.

A pre-transaction real-directory `.venv` is converted once while the worker is
stopped and `pgrep -u patina` proves no other service-account process remains.
The transaction durably records high-entropy materialized and quarantine paths,
then copies every regular entry to a fresh root-owned inode (source hardlinks are
copied independently), recreates only internal lexical symlinks, and permits an
external terminal only for `bin/python*` resolving through the selected trusted
interpreter. It normalizes directories/executables to `0755` and data/modules to
`0644`, validates and service-user-smokes through the fresh interpreter, and
fsyncs the complete tree before atomically renaming raw `.venv` to quarantine.
Only after that one-way rename is fsynced does it write the durable ready marker,
install units, or link the candidate.

Recovery infers whether the rename happened from the exact stable/quarantine
pair. Before quarantine it discards any unready fresh copy and repeats the full
copy; after quarantine it revalidates/smokes the already-complete fresh tree and
never renames or restarts the raw tree. Rollback links `.venv` to the fresh old
materialization, while successful activation links `.venv.previous` to it. Raw
quarantine is durably deleted only after successful rollback or commit. A copy,
policy, or smoke failure before quarantine deliberately leaves an originally
active worker stopped and retains the transaction rather than restarting raw
service-controlled inodes. If an obsolete `.venv.previous` is itself a real
directory, the installer fails without deleting it: stop all Patina processes,
review and move/archive it outside `APP_DIR`, then rerun.

Stable release links are accepted only when their no-follow target is directly
contained by the trusted release namespace.
Failed/abandoned stages are deleted only inside the installer's
`.venv.release.*` namespace and only when neither `.venv` nor `.venv.previous`
references them. When the service was already inactive, it is not started; the
previous release remains available for rollback. Rebuilding also fails before
activation if a GPU drop-in exists but `--gpu` was omitted, preventing an
accidental CUDA-dependency downgrade:

```bash
# Re-stage with only the root-owned rsync block above; do not pre-stop worker.
sudo /opt/patina/scan-pipeline-source/install.sh --upgrade  # CPU worker
# or, on the accepted GPU box:
sudo /opt/patina/scan-pipeline-source/install.sh --gpu --upgrade
```

## The env file (`/etc/patina/scan-worker.env`)

See `scan-worker.env.example`. Required (no default): `WORKER_ID`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is the worker's
**only** write credential — mode `0600`, owned by `root:root`, delivered via
`EnvironmentFile` so it never appears in `argv`. The system manager (PID 1)
reads it before launching `User=patina`; the worker process does not need direct
file access. Full schema: design §3.

| var | default | purpose |
|---|---|---|
| `WORKER_ID` | *(required)* | readable audit prefix; each claim appends a fresh UUID for the exact `locked_by` + completion `app.actor` identity |
| `SUPABASE_URL` | *(required)* | Strata PostgREST + Storage base |
| `SUPABASE_SERVICE_ROLE_KEY` | *(required)* | service-role JWT (server-side only) |
| `STAGES` | `ingest,solve,drawings` | which `scan_pipeline.*` stages this worker claims. Known: `ingest,solve,drawings` (CPU, live) + `refine,fuse,splat,present` (P2; `refine/fuse/splat` are GPU). Default stays CPU-only. Before items 4–7 register handlers, GPU names are allowed only for the controlled empty-queue item-3 preflight above, never persistent operation |
| `POLL_SECONDS` | `5` | sleep between empty polls |
| `MAX_CONCURRENT` | `2` | claim batch size / max in-flight |
| `GPU` | `auto` | `auto` = detect+report; `off` = never touch. `doctor` makes the GPU check a hard failure (not a warning) when `STAGES` lists a GPU stage; `GPU=off` + a GPU stage is a contradiction it flags |
| `VISIBILITY_TIMEOUT` | `60 minutes` | lease length as one positive seconds/minutes/hours value; a dead worker's job is reclaimable after this. Each claim carries a conservative monotonic expiry bounded from request start, so response latency consumes rather than extends the engine budget |
| `MAX_ATTEMPTS` | `5` | max attempts on enqueued successors (backoff parks here) |
| `ROOM_SCANS_BUCKET` | `room-scans` | bucket bundles arrive in / drawings write to |
| `WORK_DIR` | `/var/lib/patina/scan-work` | scratch root (on the `ReadWritePaths` allowlist) |
| `RETENTION_HOURS` | `48` | how long scratch lingers before the janitor prunes it |
| `HTTP_TIMEOUT_S` | `30` | per-request timeout |
| `LOG_LEVEL` | `info` | journald verbosity |

`refine` never treats the configured visibility default as its command timeout.
Each claimed task carries the immutable request-start monotonic lower bound for
that claim's expiry. Item 4 shares one deadline across engine commands:
`min(stage start + 4 minutes, claimed lease bound - 60 seconds)`. Starting the
bound before the RPC is deliberately conservative: network/response time can
only reduce the remaining engine budget, never overrun the database lease.

## Commands

```bash
patina-scan-worker run           # long-lived loop (what systemd starts)
patina-scan-worker run --once    # claim-and-drain one batch then exit
patina-scan-worker once          # alias for `run --once`
patina-scan-worker doctor        # shell diagnostics; systemd doctor oneshot proves the real context
```

## Operate

- **Watch:** `journalctl -u patina-scan-worker -f`.
- **Inspect a failed job:** it is a row in `agent_tasks` (`last_error`,
  `attempts`, `task_type`, `payload` = `scan_id`/version, `parent_task_id`
  chain); `agent_task_audit` holds the transition history (claim/completion
  actors are `WORKER_ID:<claim-uuid>`);
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
- **Burst:** stand up a second worker with its own readable `WORKER_ID` label
  (same package, different env file). `claim_agent_tasks` uses `FOR UPDATE SKIP
  LOCKED`, and every claim batch has a fresh UUID-backed lease owner, so the two
  claim disjoint tasks with zero coordination even if labels are accidentally
  reused.

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
  `patina`. **Durable fix on a box that hit this: re-run the trusted source
  installer**
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
(`.[refine]`: exactly pycolmap 4.0.2 + numpy/scipy; known-pose triangulation/BA),
`fuse` (`.[fuse]`: open3d/trimesh),
`splat` (`.[splat]`: torch cu118 + gsplat), and `present`. Those stage names are
already in `KNOWN_STAGES` so `doctor` can gate on them ahead of the handlers
landing. A stage claimed before its handler exists parks fatally, so item 3 uses
them only in the doctor-only preflight above; the empty-queue query is retained
as rollout evidence, and no `run` process sees those temporary stages. `.[gpu]`
is the box one-liner (= refine+fuse+splat). Nothing else
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
python -m venv .venv && .venv/bin/pip install -e '.[dev,drawings]'
.venv/bin/pytest -q
```
