# The Rendered Room v2 — W2 staging evidence

> **Status:** staging evidence · **Date:** 2026-08-19 · **Wave:** W2 (GPU lane)
> **Companions:** `W1-EVIDENCE.md`, `DELIVERY-PLAN.md`, `ARCHITECTURE.md`, `PROPOSAL.md`
> **Format:** follows `docs/engineering/patina-cloudflare-phase-1-staging-evidence.md`

Everything below ran against **staging only** — Supabase project
`vuesoyhfrjabfxbrzekd` and Modal environment `patina-staging`. The production
ref `bkvcixdmuyejfzcijpdg` was read exactly twice, read-only and under standing
authorization, for the two things staging cannot synthesize: the posed-photo
scan bundle (§2) and one source USDZ (§8). No production Modal environment
exists.

This document is in two halves. **§1–§6 are the first pass** — what was built,
what ran, and the five defects it found. **§7 onward is the close** — those
defects fixed and the lane run to a real artifact.

**Headline.**

| Lane | Outcome |
|---|---|
| `renders` (Cycles, L40S) | **PASS**, and then re-pointed. The stage worked mechanically from the first run; its *subject* was wrong (a floor-only GLB) and is now the parametric room (§10). |
| `splat` (splatfacto, L4) | **PASS end to end** after four fixes. Real posed photos → `.spz` in R2, registered, verified, referenced (§9). First pass was BLOCKED. |

---

## 1. What is deployed

`modal deploy -m scan_modal.app --env patina-staging` — app `patina-scan`
(`ap-zLm5zIIytE9TgWWkipevm8`), functions `verify`, `splat` (L4), `renders`
(L40S), `spawn`. The three images built during W2 prep and are cached: each
redeploy in the first pass completed in **~1.9 s**.

The close redeployed once more, rebuilding only the SPZ tail (§7.1) — **51.8 s**
total, of which 44 s was the C++ build — and redeployed the
`dispatch-scan-modal` edge function to `vuesoyhfrjabfxbrzekd`. Nothing else was
deployed anywhere; in particular `services/aesthete-inference` is **committed but
not deployed** (§8, open item 3).

### `scan-r2` is real now — W1 open item 2 is CLOSED

W1 recorded the `scan-r2` Secret as "a placeholder, all three values empty".
It now carries all **four** required keys and works. Probed on CPU from inside
`patina-staging` (values never printed):

```json
{"bucket": "patina-staging-media-artifacts-us",
 "present": {"R2_ENDPOINT": true, "R2_ACCESS_KEY_ID": true,
             "R2_SECRET_ACCESS_KEY": true, "R2_ARTIFACTS_BUCKET": true},
 "list_ok": true, "key_count": 0, "rw_ok": true}
```

`rw_ok` is a full PUT → GET → DELETE round trip, so the credential has real
write scope on the right bucket, not merely read. `key_count: 0` is the
pre-run state — the bucket was empty before this wave.

---

## 2. The fixture, and the defect that came with it

`room_scans` `cd72ad9b-da14-5eee-a8c7-1f71ace9db12`
(`seed:rendered-room-v2-w2-prod-copy`), `room_files`
`5bc4cef2-44fd-5d6f-b7fc-3dfe005e99ab` v1, copied from prod by `08d7be60`.

It is a genuinely rich room. `captured_room.json` (253,804 B) carries
**4 walls, 1 floor, 2 windows, 1 door, 1 opening, 20 objects, 2 sections**
(one labelled `kitchen`), and 42 photos at 1440 × 1920.

**But it landed with zero camera poses.**

```sql
select count(*) as images, count(camera_transform) as with_transform,
       count(camera_intrinsics) as with_intrinsics
from public.room_scan_images where scan_id = 'cd72ad9b-…';
-- images = 42, with_transform = 0, with_intrinsics = 0
```

`scripts/scan-staging-seed/seed_scan.py`'s `copy-prod` **SELECTs**
`camera_transform, camera_intrinsics` from the prod rows and then omits both
from the insert dict it builds for staging. The bundle also has no
`photos_metadata.ndjson` sidecar, so those two columns were the *only* pose
carrier — and copying a real posed scan is the entire reason `copy-prod` was
written.

The pipeline refused correctly and cheaply. Dispatch, not a GPU:

```
{"claimed":2,"spawned":1,"failed":1,"deferred":0,"error":null}
agent_tasks.last_error = "scan has no photos manifest and no pose-bearing
                          room_scan_images rows"
```

`isPoseBearing` dropped all 42 rows before the cap and `resolveDispatchInputs`
threw before signing a single URL. **No GPU was allocated.** That is the
guard working exactly as designed — but it leaves the fixture untrainable.

**Fixed** in `a6d5c04f`. The remedy is one re-run of `copy-prod`, which needs a
read against prod and therefore sits outside this lane's rails.

---

## 3. `renders` — first pass: PASS end to end, on the wrong subject

### Run 1 (as dispatched)

Enqueued through `enqueue_agent_task`, dispatched by invoking
`dispatch-scan-modal` directly with the staging service-role bearer.

| | |
|---|---|
| Task | `a4bfca96-49f3-40ea-9835-2acc9b114b4b` → `done`, attempts 1 |
| Dispatch | `{"claimed":1,"spawned":1,"failed":0,"deferred":0}` HTTP 200 |
| Wall clock | **70,649 ms** for 29 frames, including cold start |
| GPU | L40S, Cycles + OptiX, 96 samples/frame, ~1.5–1.9 s per frame |
| Output | 29 JPEGs, 821,899 B total (26,427–39,219 B each) |

Ledger — the two-row shape `renders_job` promises:

| stage | event | status | duration_ms | created_at |
|---|---|---|---|---|
| renders | started | started | 0 | 03:44:29.033Z |
| renders | completed | succeeded | **70 649** | 03:45:38.957Z |

Registry, all 29 rows:

```sql
select count(*) rows, count(*) filter (where lifecycle_state='stored') stored,
       count(distinct sha256) distinct_sha, sum(size_bytes) total
from public.media_objects
where object_key like 'scan_artifacts/cd72ad9b-…/v1/%';
-- rows 29 | stored 29 | distinct_sha 29 | total 821899
-- bucket patina-staging-media-artifacts-us | mime image/jpeg
-- access_class authenticated_project
```

`room_files.artifacts.renders` carries the hoisted cover and the full manifest:

```json
{"object_id": "7ca139c2-adb7-4177-b9f6-26331244b548",
 "version": 1, "cover": "top_down", "count": 29,
 "shots": { "corner_ne": …, "corner_nw": …, "corner_se": …, "corner_sw": …,
            "top_down": …, "turntable_000" … "turntable_023" }}
```

**R2 reconciles against the registry exactly.** Listing the prefix from inside
Modal returned **29 objects, 821,899 B**, and each object's sha256 computed
over the downloaded bytes equals the `media_objects.sha256` written at upload
time. The registry describes what is actually in the bucket.

### The bug run 1 exposed, and run 2's proof

The cover plate — the one image `artifacts.renders.object_id` hoists — was
**clipped**. The floor ran off the top and the bottom-right of the frame.

`_top_down_shot` framed on `max(sx, sy)`. Blender maps `ortho_scale` onto the
**larger render dimension** (the 1280 px width), so the visible height is only
`ortho_scale × 960/1280`. The expression compared a depth measured in height
units against a width measured in width units, and cropped any room deeper
than three quarters of its width. This room is 8.23 m × 7.51 m — a 0.91 ratio
— so it framed at 9.05 m and needed 10.01 m.

The golden case is a 4 m × 3 m room. **Its 0.75 aspect is exactly the render's**,
the one shape for which the old expression is also correct, so the assertion
passed on the single fixture that could not fail.

Fixed in `e1654150`:
`ortho_scale = max(sx, sy × RENDER_WIDTH/RENDER_HEIGHT) × TOP_DOWN_PADDING`.

Redeployed and re-run over the same scan:

| | Run 1 | Run 2 (post-fix) |
|---|---|---|
| duration_ms | 70 649 | **65 087** |
| frames | 29 | 29 |
| `top_down.jpg` sha256 | `b4d6fb9d…` | `3c520ae6…` |
| cover framing | clipped top + bottom-right | **fully contained, padded on all sides** |

Verified visually: both plates were downloaded from R2 and read as images. The
post-fix plate contains the whole floor polygon with margin. The `media_objects`
row for `top_down.jpg` kept its id (`7ca139c2-…`) across the re-run and took a
new sha256 and size — register-by-key is idempotent, and a re-render updates in
place rather than orphaning a row.

### The finding the renders lane cannot fix for itself

**`scan.glb` contains a floor and nothing else.** 1,196 bytes, one mesh node:

```
meshes: ['Floor0']   nodes: ['Floor0']   materials: []
accessors: VEC3 × 24, SCALAR × 36
generator: pygltflib@v1.16.5
```

So every one of the 29 renders is a bare white slab on a grey ground. They are
correct renders of the model they were given. But the walls, windows, door,
opening and 20 objects all exist — in `captured_room.json`, which the
`renders` stage never reads. The GLB comes from `convert_usdz_to_glb`
(`services/aesthete-inference/app/usdz.py`), one node per USD mesh prim, and
for this scan the USDZ evidently carried only the floor prim.

The renders lane is mechanically complete and its output is presently
worthless as a picture of a room. Resolving that is an upstream decision — see
open item 1.

---

## 4. `splat` — first pass: training runs, the artifact tail is blocked

Because §2 left the real fixture unposed, a clearly-marked staging-only twin
was built to exercise the stage's runtime:
`room_scans` `95284896-de86-55c1-9877-3ecc12333629`
(`seed:rendered-room-v2-w2-splat-smoke-synthetic-poses`), `room_files`
`6762898e-a617-500d-8c98-6596c261f650` v1.

It reuses the **same `user_id`, the same `room_id`, and the same storage object
keys** — no bytes were copied and the real fixture's rows were never touched —
and attaches a synthetic 1 m ring of outward-looking ARKit cameras plus
intrinsics in the native landscape frame (1920 × 1440 against 1440 × 1920
pixels, so `PhotoPose.needs_right_rotation` fires — the portrait correction
that had never run on real image extents).

**The reconstruction this produces is meaningless as geometry.** Real photos
paired with fabricated poses. It is a mechanical smoke of the stage, and every
conclusion below is about machinery, not about splat quality.

### The photoRecords fallback fired — proven at the dispatcher

```json
{"ts":"2026-08-19T03:59:50.190Z","fn":"dispatch-scan-modal",
 "event":"dispatch_spawned","task_id":"90e1fbe8-…","scan_id":"95284896-…",
 "task_type":"scan_pipeline.splat","http_status":202,
 "photos_source":"rows"}
```

`photos_source: "rows"` with `http_status: 202`. The sidecar is absent, the
dispatcher read `room_scan_images`' own pose columns, inlined 42 records, and
Modal accepted the body. **The fallback path works.**

### What ran

| Run | Iterations | Started | Ended | Duration | Outcome |
|---|---|---|---|---|---|
| 1 (dispatched) | 30 000 | 03:59:56Z | 04:25:33Z | 1 537 225 ms | stopped by the operator at ~step 10 000 |
| 2 (direct) | 3 000 | 04:26:53Z | 04:31:49Z | 296 291 ms | `ns-train splatfacto exited 1` |

Run 1 got the whole head of the stage working on real inputs: 42 photos
downloaded, transcoded to JPEG, `transforms.json` written, nerfstudio loaded
the dataset, gsplat compiled its CUDA kernels, and splatfacto trained —
**1,372,643 Gaussians by step 4,600**.

### Defect A — nerfstudio's run directory is four levels, not three (FIXED)

Run 1 logged:

```
logging events to: /splat-cache/95284896-…/v1/output/splatfacto/splatfacto/patina
```

`workspace_paths` modelled `<output-dir>/<method>/<timestamp>`. nerfstudio
writes `<output-dir>/<experiment-name>/<method>/<timestamp>` — experiment and
method are separate levels even when both are `splatfacto`.

Two silent consequences: `ns-export --load-config` pointed at a `config.yml`
nerfstudio never wrote, so **every run would have failed after paying for a
full training pass**; and `resume` could never find a checkpoint, defeating the
preemption Volume the whole stage is built around.

The unit suite could not see it — every test builds its fixture directories
from `workspace_paths` and then asserts `workspace_paths`, so both sides moved
together. Fixed in `2a04a8eb`, with a test that derives the expected path from
the `ns-train` argv instead.

### Defect B — the SPZ converter does not exist in the image (HARD BLOCKER)

`core/spz.py` ships `DEFAULT_SPZ_COMMAND = "spz convert {input} {output}"`.
The binary is installed and on PATH. Its complete command surface:

```
$ which spz     → /usr/local/bin/spz
$ spz --version → spz 0.0.5
$ spz --help
SPZ file format handling for Rust, and CLI tooling.
Usage: spz [COMMAND]
Commands:
  info
  help  Print this message or the help of the given subcommand(s)

$ spz info --help
Usage: spz info [OPTIONS] <SPZ_PATH> [COORDINATE_SYSTEM]
```

**There is no `convert` subcommand.** `info` *reads* an existing `.spz`. The
crate is pinned to 0.0.5 because 0.0.6 dropped the binary target entirely, so
no version of this crate converts anything.

The documented fallback is not a fallback either — the PyPI `spz` package does
not import inside the image at all:

```
ImportError: cannot import name 'BoundingBox' from partially initialized
module 'spz' (most likely due to a circular import)
  (/usr/local/lib/python3.11/site-packages/spz/__init__.py)
```

It has no cp311 wheel and was built from sdist through maturin; the built
extension is broken.

**As built, `_SPLAT_IMAGE` has no working PLY → SPZ path.** Every splat run
would train for tens of minutes, export a `.ply`, and then fail at
`compress_ply_to_spz` with `spz exited 2`. Picking the replacement converter
(Niantic's reference C++ `nianticlabs/spz`, or something else) is a dependency
decision and is left for a ruling — see open item 2.

This was established on **CPU, for $0.00**, by running the same cached image
without a GPU. `core/spz.py`'s own docstring predicted exactly this failure
mode: "the CLI's exact argument spelling is the part most likely to move under
us". It had moved before the first run.

### Defect C — the iteration budget does not fit the time budget

Measured on the L4 at 1440 × 1920 × 42 frames:

| Step | ms/iter | Reported ETA |
|---|---|---|
| 4 550 | 48.8 | 20 m 41 s |
| 7 470 | 119.2 | 44 m 45 s |

Iteration cost more than doubles as densification proceeds. Extrapolating,
30 000 iterations is **~55 minutes**, against:

- `TRAIN_TIMEOUT_S = 3000` (50 min) — the run is killed before it finishes;
- `SPLAT_TIMEOUT_SECONDS = 3600` (60 min) — no headroom for download,
  transcode, export, compression and upload;
- `claim_agent_tasks(p_visibility_timeout: "30 minutes")` — commented in
  `index.ts` as covering "splat's 10-25min Modal run".

The lease is the sharpest of the three. A run that trains for 35 minutes and
succeeds would find its lease expired and have **every ledger write refused
with P0403** — it would burn a full L4 pass and then discard the result as
`lease_rejected`. The plan's "10–25 minutes on an L4" holds only at a much
smaller frame count or a downscaled input.

### Defect D — the checkpoint is committed only on success

`run_splat` calls `checkpoint_commit()` after `ns-train` returns 0. An
uncommitted Modal Volume write does not survive the container, so a run killed
mid-training — a preemption, the 3000 s timeout, an operator stop — loses
everything, which is precisely the case the Volume exists for. Observed: run 2
found no workspace from run 1 and re-downloaded and re-transcoded all 42
photos. `retries=modal.Retries(max_retries=2)` therefore retries from zero, not
from a checkpoint.

### Defect E — `inputs.config` is unreachable from the queue

`splat_job` reads `inputs.config.maxIterations`, but `resolveDispatchInputs`
builds each stage's `inputs` field-by-field from a deliberately **closed**
shape and never receives the task payload, so nothing enqueued can set it.
The cost knob the delivery plan will want is dead configuration today. This is
why run 2 was invoked directly against the deployed function rather than
through the dispatcher.

### What the ledger discipline did right under all of this

Worth recording, because these are the paths that cost money when they are
wrong, and all three fired correctly on real failures:

- **Operator stop → clean release.** Killing run 1's container raised
  `KeyboardInterrupt` inside the job; the `finally` wrote a `failed` event and
  `fail_task`, and the task returned to `queued` with `locked_by = null`. No
  task was left claimed.
- **Superseded lease → clean abandon.** Modal's automatic retry of run 1's
  original spawn arrived after the lease had moved, and exited without writing:
  `{"fn":"scan-modal-splat","event":"lease_rejected","taskId":"90e1fbe8-…"}`.
- **Redacted errors.** `agent_tasks.last_error` reads
  `RuntimeError: ns-train splatfacto exited 1` — no signed URL, no workspace
  path.

Run 2's own failure was `CUDA error: device-side assert triggered` inside
`gsplat/strategy/ops.py::split` during densification. That is almost certainly
the fabricated poses — real pixels against invented cameras give a nonsense
photometric loss — and is **not** offered as evidence about the real pipeline.

---

## 5. Fixes made in the first pass

| Commit | What |
|---|---|
| `a6d5c04f` | `fix(scan-staging-seed)`: copy `camera_transform` / `camera_intrinsics`, without which splat cannot run (§2) |
| `e1654150` | `fix(scan-modal)`: the top-down plate cropped every room deeper than 3:4 (§3) |
| `2a04a8eb` | `fix(scan-modal)`: nerfstudio's run directory is four levels, not three (§4 A) |

Unit suite after all three: **246 passed** (`.venv/bin/python -m pytest -q` in
`services/scan-modal`) and **44 passed** in `scripts/scan-staging-seed`.

---

## 6. Cost — first pass

| Item | Measure |
|---|---|
| Modal metered, whole wave | **$0.79** (Deployed Apps $0.79, Ephemeral $0.01) |
| Modal billed | **$0.00** — covered by credits |
| `renders`, per run | ~65–71 s on L40S ≈ **$0.035–0.038** |
| `splat`, run 1 | 25.6 min on L4 ≈ **$0.34** (stopped early, no artifact) |
| `splat`, run 2 | 4.9 min on L4 ≈ **$0.07** (failed, no artifact) |
| CPU probes (R2, spz, ns-export, artifact pulls) | ≈ **$0.01** |

Well inside the $5 abort threshold and the $42.50 workspace cap. No container
was left running; `modal container list --env patina-staging` is empty.

The two splat tasks were **cancelled** rather than left to back off, because
pg_cron sweeps every 5 minutes and each retry allocates an L4 that cannot
succeed until Defect B is resolved.

---

## 7. The close — what changed

Five defects from §2–§4, plus the floor-only GLB from §3, resolved in four
commits. Each is stated as the thing that was wrong, not the code that moved.

| Commit | What it fixes |
|---|---|
| `35aae854` | `scan-modal`: the SPZ converter, the three time budgets, the checkpoint commit, and the renders subject |
| `d4759383` | `dispatch-scan-modal`: per-task-type lease, the superseded-task guard, the renders input contract |
| `386baaad` | `aesthete-inference`: the USDZ→GLB converter dropped every wall and object |
| `a6d5c04f` | (first pass) `scan-staging-seed`: `copy-prod` selected the pose columns and dropped them |

### 7.1 The SPZ converter now exists — open item 2 CLOSED

The crates.io route could not be made to work at any version: 0.0.5's entire
CLI is `spz info`, and 0.0.6 dropped the binary target. The PyPI wheel has no
cp311 build and its maturin sdist does not import.

The converter is now **Niantic's own C++ reference implementation**, the one the
format is defined by, built from source in `_SPLAT_IMAGE`:

- repo `github.com/nianticlabs/spz`, tag **`v3.0.0`**, pinned by commit
  **`5bf2945de1a003cee07133b1e495fe9c6ffdc7e7`** — and the SHA is asserted
  after checkout, because a tag is a movable ref and "we built the tag" is not
  the same claim as "we built these bytes";
- `SPZ_BUILD_TOOLS=ON` (its default) produces `ply_to_spz`, installed at
  `/usr/local/bin/ply_to_spz`;
- zlib and zstd come from `apt` so CMake's `find_package` succeeds rather than
  `FetchContent`-ing both over the network on every rebuild;
- the last build step **runs the binary** and greps its usage line, so a
  converter that does not execute fails the image build rather than an L4.

Its argv is two positionals and nothing else — read off `ply_to_spz.cpp`, a
24-line file whose whole usage string is `Usage: ply_to_spz <input.ply>
<output.spz>`. `DEFAULT_SPZ_COMMAND` is now that, spelled as an absolute path
because the image rewrites `PATH` twice during the build.

The layers *above* this one were deliberately left alone, including the inert
PyPI `spz` install: removing them would invalidate the torch/nerfstudio layers
and force a multi-hour rebuild to delete something that does nothing. The
redeploy that shipped this took **51.8 s**.

**The escape hatch.** `SPZ_MODE=gzip-ply` skips the converter, gzips the PLY,
and stores it as `room.ply.gz` with `Content-Encoding: gzip` — so an HTTP client
inflates it in transit and receives exactly the `.ply` the portal's Spark reader
already parses. The encoding is recorded two ways on purpose: R2 gets a bare
`Content-Type` plus the encoding header, and `media_objects.mime` gets
`application/octet-stream; content-encoding=gzip`, so the row describes the
bytes without anyone fetching them. The gzip is written with `mtime=0`, because
the default header stamps the wall clock and would make two runs of an unchanged
splat differ in sha256 for no reason anyone could act on.

Both modes are unit-tested: the `spz` path with the subprocess faked (the argv
is data, and the point is that its spelling is checked), the `gzip-ply` path for
real — it must produce bytes that actually inflate back to the PLY, or it is not
a fallback.

### 7.2 The three time budgets, reconciled — open item 4 CLOSED

§4 C measured what §4's plan had guessed at. All three numbers now come from the
measurement:

| Budget | Was | Now | Why |
|---|---|---|---|
| `TRAIN_TIMEOUT_S` | 3000 s (50 min) | **4800 s** | 30k iterations is ~55 min; the old value killed a correct run |
| `SPLAT_TIMEOUT_SECONDS` | 3600 s | **7200 s** | training plus the download head and the export/compress/upload tail |
| dispatcher visibility timeout | 30 min, all stages | **90 min for splat**, 30 for the rest | the lease is the one that silently discards completed work |

`claim_agent_tasks` takes a single `p_visibility_timeout` per call, so the batch
is now claimed in **groups by lease length** — splat first and alone, then
verify/renders — with `BATCH_LIMIT` spent across the groups rather than per
group, so the split cannot double the batch.

### 7.3 The checkpoint is committed during training — open item 5 CLOSED

A `CheckpointCommitter` polls the checkpoint directory on a daemon thread and
commits the Volume each time a **new** checkpoint lands. Identity is
`(name, mtime_ns, size)`, not name alone, because nerfstudio rewrites
`step-000030000.ckpt` in place on the final save — the most valuable write of
the run, and the one a name-only marker would miss.

Two properties are the whole point and both are tested:

- the watcher's shutdown is in a `finally`, so a run killed by preemption, by
  the training timeout, or by an operator still leaves its last checkpoint
  durable — `modal.Retries` now resumes rather than restarting from zero;
- a failing commit is logged and swallowed **and does not advance the marker**,
  so a transient Volume error cannot kill a training run minutes from a usable
  result, and the next poll retries.

### 7.4 A superseded task can no longer be re-dispatched forever — open item 9 CLOSED

The guard runs before input resolution and before the spawn: if the task's
`room_file_version` is no longer the max for its scan, the task is completed as
`done` with a fixed literal `{"dispatch_outcome": "superseded"}` instead of
being dispatched. A failed `room_files` lookup is deliberately **not**
superseded — an unreadable table is a transient fault and must never park a live
task permanently.

**It fired on real data on its first invocation.** W1's verify task
`abad722d-1f97-429e-b267-66c8a74c8770` — room_files v1 against a scan at v4, and
the exact task §7's first pass recorded at `attempts` 7 against `max_attempts` 5
— was claimed and closed out:

```
{"claimed":2,"spawned":1,"failed":0,"deferred":0,"superseded":1,"error":null}
```
```sql
-- abad722d: status = done, attempts = 9, locked_by = null,
--           artifacts->>'dispatch_outcome' = 'superseded',
--           last_error = 'room_file_version superseded by a newer version for this scan',
--           completed_at = 2026-08-19 05:03:44Z
```

Nine attempts is what an unbounded loop looks like against a cap of five. It is
free on a CPU stage; on `splat` this shape would have allocated an L4 every five
minutes, indefinitely.

---

## 8. The floor-only GLB — diagnosed, and it is a converter bug

Open item 1 asked whether the USDZ was floor-only (an iOS/RoomPlan export
problem) or whether the converter dropped nodes. **It is the converter.**

The source USDZ for prod scan `83f0d63d-cc35-4320-bf80-67d473af52f3` was pulled
read-only (53,425 bytes, sha256 matching that row's own
`artifacts_sha256.usdz`) and read locally. It is an uncompressed zip of plain
ASCII `.usda`, so no USD tooling was needed to answer the question: it
references **4 walls, 1 door, 2 windows, 1 opening, 1 floor and 20 objects** —
the same inventory `captured_room.json` carries.

The cause is one line in `services/aesthete-inference/app/usdz.py`:

```python
for prim in stage.Traverse():
    if not prim.IsA(UsdGeom.Mesh):
        continue
```

RoomPlan writes exactly **one** `UsdGeom.Mesh` per capture — the floor, which it
pre-triangulates from the room outline. Every wall, door, window, opening and
object is a `UsdGeom.Cube` (`def Cube "Wall0"`, sized by a non-uniform
`xformOp:scale`), and `Cube` is a sibling `Gprim`, not a `Mesh` subclass. So the
traversal skipped all 28 of them and emitted the floor.

Fixed in `386baaad`. A `Cube`'s geometry is implicit — `size` is the edge length
of a cube on its own origin, and RoomPlan always leaves it at 1, carrying the
real dimensions in the scale — so the branch synthesizes the 8 corners and a
fixed 12-triangle index table and hands them to the existing world-transform and
accessor path unchanged. Measured on that same USDZ:

| | Before | After |
|---|---|---|
| GLB bytes | 1,196 | **23,948** |
| nodes | 1 | **29** |
| names | `Floor0` | 4 walls, 2 windows, `Door0`, `Opening0`, 20 objects, `Floor0` |

**The old fixture could not have caught this.** `tests/fixtures/box-room.usdz` is
made entirely of Meshes — the one shape for which a Mesh-only traversal is also
correct. The same failure as the top-down cropping bug in §3: a golden case
whose geometry was exactly the degenerate case. A second fixture,
`roomplan-room.usdz`, now has RoomPlan's real encoding, and the new tests assert
both that the cubes survive and that their non-uniform scale reaches the vertex
data.

**Not deployed.** `aesthete-inference` is outside this lane's rails. The fix is
committed and tested; shipping it is a separate, cheap step — and the renders
lane no longer depends on it either way (§10).

---

## 9. `splat` — the real run

### 9.0 The converter proved before the GPU, not after

The whole reason §4 B was expensive is that it was found *after* a training run.
So the pinned binary was exercised against a **nerfstudio-shaped 3DGS PLY** —
the exact property set `ns-export gaussian-splat` writes (`x,y,z`, `nx,ny,nz`,
`f_dc_0..2`, `f_rest_0..44`, `opacity`, `scale_0..2`, `rot_0..3`, all
`property float`, binary little-endian) — inside the same cached `_SPLAT_IMAGE`,
**on CPU, for $0.00**, while the real run was still training:

```json
{"binary_present": true, "gaussians": 500,
 "ply_bytes": 125528, "returncode": 0,
 "stdout": "[SPZ] Loading: /tmp/splat.ply\n[SPZ] Loading 500 points\n",
 "stderr": "", "spz_bytes": 19802, "ratio": 6.34,
 "spz_magic": "4e475350"}
```

`4e475350` is `NGSP` — SPZ's own container magic. The property names matter:
`load-spz.cc` looks up `f_dc_0`, `scale_0`, `rot_0`, `opacity` by name and
rejects any non-`float` vertex property, so "it compiles" and "it accepts our
exporter's output" are different claims and both are now made.

### 9.1 The run

Task `0ec918dd-9291-4c1f-8e7f-7697e5012df5`, enqueued through
`enqueue_agent_task`, dispatched by invoking `dispatch-scan-modal` with the
staging service-role bearer. One attempt, no retry, no resume.

| | |
|---|---|
| Dispatch | `{"claimed":2,"spawned":1,"failed":0,"deferred":0,"superseded":1}` HTTP 200 |
| Fixture | `cd72ad9b-…` v1 — the prod copy, **now posed** (§2 re-run) |
| Pose carrier | `photosSource: "rows"` — the inline `room_scan_images` fallback |
| Frames | **42** used, **0** missing |
| Iterations | 30 000 (unchanged) |
| Wall clock | **3 846 244 ms = 64.1 min** (05:03:50Z → 06:07:56Z) |
| Gaussians | **1 151 258** exported of 1 153 078 trained (1 820 dropped for low opacity, **0 NaN/Inf**) |
| `.ply` | **285 513 578 B** (272.3 MiB) |
| `.spz` | **25 798 805 B** (24.6 MiB) — **11.07×** |
| Compression | `spz` — the real converter, not the fallback |
| Checkpoint commits | **15** — one per `STEPS_PER_SAVE`, exactly as designed |

Ledger, the two-row shape:

| stage | event | status | duration_ms | created_at |
|---|---|---|---|---|
| splat | started | started | 0 | 05:03:50.423Z |
| splat | completed | succeeded | **3 846 244** | 06:07:56.416Z |

Registry and reference:

```sql
-- media_objects
-- a9b6cbb8-4d32-4967-a23d-7b4c50174657
-- bucket patina-staging-media-artifacts-us
-- key    scan_artifacts/cd72ad9b-…/v1/room.spz
-- state  stored | mime application/octet-stream | 25798805 B
-- sha256 36e27fe937e3a33474cb2c3eff20db0aa880d63fb978188e54b9d47f33536b91
-- access_class authenticated_project

-- room_files.artifacts->'splat'
-- {"version": 1, "object_id": "a9b6cbb8-4d32-4967-a23d-7b4c50174657"}
```

`artifacts.renders` **survived the write** (still `count: 29`) — 00490's
`artifacts || p_artifacts` is a merge, so a second stage adds its ref rather
than replacing the first's.

### 9.2 The three budgets, checked against the run that used them

This is the number that matters most, because every one of the old values would
have destroyed this run:

| Budget | Old value | Actual 64.1 min run | New value |
|---|---|---|---|
| `TRAIN_TIMEOUT_S` | 3000 s (50 min) | **would have been killed** at 50 min | 4800 s — held |
| `SPLAT_TIMEOUT_SECONDS` | 3600 s (60 min) | **would have been killed** at 60 min | 7200 s — held |
| dispatcher lease | 30 min | **every ledger write refused with P0403** at 30 min | 90 min — held |

The run finished at 64.1 minutes. The plan's "10–25 minutes on an L4" was wrong
by a factor of three, and all three guards were sized against the plan rather
than against a measurement. They are now sized against this row.

### 9.3 The artifact is real, and the registry describes it

Fetched through the capability URL (§9.4) and parsed locally:

```
magic     : 4e475350  = "NGSP"      (SPZ container magic)
version   : 4                        (SPZ 4 — the current generation)
numPoints : 1,151,258                (== the exporter's own count)
shDegree  : 3                        (full spherical harmonics)
sha256    : 36e27fe9…                (== media_objects.sha256, exactly)
bytes     : 25,798,805               (== media_objects.size_bytes, exactly)
```

The sha256 of the bytes a client actually receives equals the digest written at
upload time. The registry is not merely present, it is **correct**.

### 9.4 The read path — capability URL, end to end

`GET /v1/scan/room-files/{roomFileId}/artifacts/{kind}` on the staging edge
worker, authenticated with a **user** JWT (never service_role) minted by a
Supabase password grant for the staging seed account `rr2-seed@…` — the same
identity that owns the scan.

```
JWT claims : role=authenticated  sub=c9740823-…  aud=authenticated
             iss=https://vuesoyhfrjabfxbrzekd.supabase.co/auth/v1
```

| Probe | Before the run | After |
|---|---|---|
| `…/artifacts/splat` | **404** `{"error":"not_found"}` | **200** `{kind, url, expiresAt}` |
| the presigned `url` | — | **200**, `application/octet-stream`, **25 798 805 bytes** |

The 404 is worth as much as the 200: it was taken before the splat existed, on
the same room file, with the same token, so the 200 is the artifact appearing
and not a permissions accident. The URL is a 10-minute presigned R2 GET.

---

## 10. `renders`, re-pointed at the room

Task `d9ef80a0-e165-4e6e-88f3-dcd1bff4d19b`, one attempt, **97 383 ms** for 29
frames on the L40S. The scene it built:

```json
{"source": "parametric", "boxes": 29, "frames": 29, "glbMerged": true,
 "geometry": {"wall": 4, "floor": 1, "window": 2, "door": 1,
              "opening": 1, "object": 20},
 "sceneWarnings": []}
```

**29 boxes, zero warnings** — the same inventory `captured_room.json` carries and
the same inventory the fixed converter now gets out of the USDZ. The scene
builder was also run against the **full 253,804-byte** capture locally before
any GPU time was spent: identical counts, room extent 8.80 × 8.18 × 3.35 m, all
four wall bases coplanar with the floor slab, and a valid bbox that
`plan_cameras` turns into 29 shots.

`glbMerged: true` — the floor-only GLB was merged on top, contributing its floor
and nothing else, exactly as designed. It is no longer load-bearing.

### The registry replaced in place — idempotent, as claimed

```sql
select count(*) rows, count(*) filter (where lifecycle_state='stored') stored,
       count(distinct sha256) distinct_sha, sum(size_bytes) total,
       count(*) filter (where provenance->>'source'='parametric') parametric
from public.media_objects
where object_key like 'scan_artifacts/cd72ad9b-…/v1/renders/%';
-- rows 29 | stored 29 | distinct_sha 29 | total 1048981 | parametric 29
```

**29 rows, not 58.** Register-by-key updated every row in place — new sha256,
new size, same object ids — so the second render set replaced the first rather
than orphaning it. Total bytes rose from 821,899 to 1,048,981, which is what
having actual geometry costs.

### The cover verdict

**It shows a room.** Downloaded through the capability URL and read as an image:

| | Before (W2 first pass) | After |
|---|---|---|
| `top_down.jpg` | a bare white slab on grey | the room's full footprint, wall tops, an opening |
| `corner_ne.jpg` | a bare white slab on grey | a **wall** at full height, floor line, window/door/opening panels, an object |
| `turntable_006.jpg` | a bare white slab on grey | **two walls meeting at a corner**, floor slab, openings, an object |

Against the brief's question — walls visible, not a bare floor plate — the
answer is unambiguous. The turntable frames read immediately as an architectural
model of a room.

**And two honest qualifications, both new findings.**

1. **The set is exterior, not interior.** `CORNER_STANDOFF = 1.35` and
   `TURNTABLE_STANDOFF = 1.6` put every perspective camera *outside* the bounding
   box. That was invisible when the model was a flat slab — there was no shell to
   be outside of. Now there is, so the 28 perspective frames photograph the
   outside of the room, like a massing model. The camera plan was deliberately
   left unchanged this wave (it is a separate, tested module and the brief scoped
   it out), but "a picture of a room" and "a picture of the outside of a room"
   are different products and the shot plan now has to choose.

2. **The top-down plate is blown out.** The key light sits at `bbox top + 1.0 m`
   and the walls are now 3.3 m tall, so it is about a metre above the wall tops
   and burns them to white. Geometry is discernible but barely. Lighting was
   sized for a floor slab; it needs sizing for a room with a ceiling plane.

Neither is a regression — both are the first time this stage has had a shell to
light or to stand inside of. They are the next wave's work, not this one's.

---

## 11. Cost — the close

| Item | Measure |
|---|---|
| `splat`, the real run | 64.1 min on L4 ≈ **$0.86** |
| `renders`, parametric re-run | 97 s on L40S ≈ **$0.05** |
| Image build (spz tail only) | 44 s CPU ≈ **$0.01** |
| CPU probes (spz converter, R2, artifact pulls) | ≈ **$0.02** |
| **This close, total** | ≈ **$0.94** |
| W2 first pass (§6 of the earlier draft) | $0.79 metered |

Well inside the $10 ceiling for this lane. `modal container list --env
patina-staging` is empty; nothing is left running.

---

## 12. Open items

**Closed this wave** — 1 (§8), 2 (§7.1), 3 (§2 re-run), 4 (§7.2/§9.2),
5 (§7.3), 9 (§7.4). Six of the eleven. What remains:

1. **The `renders` camera plan photographs the room from outside** (§10). Every
   perspective shot stands 1.35–1.6× outside the bounding box, which was
   invisible while the model was a flat slab and is now the defining property of
   the set. Needs a ruling on what the render set is *for*: interior views
   (cameras inside the shell, wall culling or backface-only hiding for the near
   wall) or exterior massing (what it does today, deliberately). This is the
   single largest remaining gap between "a picture of a room" and a picture a
   designer would want.

2. **The top-down plate is blown out** (§10). The key light sits 1 m above the
   bbox top; with 3.3 m walls it is a metre off the wall tops. Lighting is sized
   for a floor slab and needs sizing for a room.

3. **The fixed USDZ→GLB converter is committed but not deployed** (§8,
   `386baaad`). `services/aesthete-inference` is outside this lane's rails, so
   the staging scan's `scan.glb` is still the 1,196-byte floor-only artifact —
   which is now harmless, because `renders` no longer depends on it. Deploying
   the inference container and re-running `convert-room-scan-glb` for existing
   scans would make the merged GLB carry real mesh; it is an improvement, not a
   blocker. Note that every scan converted before that deploy carries a
   floor-only GLB and would need re-conversion to benefit.

4. **`inputs.config` is unreachable from the queue** (§4 E). Unchanged. The
   closed per-stage contract is a good design; the cost knob (`maxIterations`)
   still has no route, and 30 000 iterations is now known to cost 64 minutes of
   L4, which makes the knob worth more than it was.

5. **`media_objects.owner_user_id` is NULL on all rows**, splat's included.
   `scan_worker_register_media_object` does not set it. Still harmless — the
   read path resolves by `object_id` and authorizes through the scan's own
   ownership, proven end to end in §9.4 — but worth settling.

6. **Cycles output is not byte-reproducible.** Unchanged and now re-confirmed:
   the parametric re-render produced 29 distinct sha256s over the same camera
   plan. The *plan* is deterministic and unit-tested; the pixels are not. Any
   determinism claim for `renders` must be made about the plan.

7. **`splat` has no determinism claim at all.** splatfacto's optimizer is
   stochastic and CUDA reductions are not associative, so two runs of the same
   input will not produce the same `.spz`. Unlike `verify` (byte-identical
   across runs, W1) this stage cannot make that claim, and nothing should be
   built that assumes it.

8. **Splat quality is unassessed.** This wave proves the *pipeline* — real posed
   photos in, a valid SPZ 4 container with 1.15 M Gaussians out, registered and
   served. Nobody has looked at the reconstruction. 42 frames of a 8.8 × 8.2 m
   room is sparse for splatting, and `load_3D_points set to true but no point
   cloud found — splatfacto will use random point cloud initialization` appears
   in the log: the mesh/depth data that would seed initialization is not being
   passed, and random init on 42 views is the weakest starting point available.
   A visual pass on the splat, and a decision about seeding from `mesh.ply`, are
   both owed before anyone calls this good.

9. **The staging fixtures persist.** Markers
   `seed:rendered-room-v2-w2-prod-copy` and
   `seed:rendered-room-v2-w2-splat-smoke-synthetic-poses` on `room_scans.name`.
   The second holds **fabricated** camera poses and must never be read as real
   capture data. Staging only; no cleanup owed unless the branch is reset.

10. **The staging seed account's password was reset** to mint the user JWT for
    the §9.4 probe (`rr2-seed@…`, staging GoTrue admin API). Staging only, and
    the account is a seed identity with no production counterpart.

11. **Production remains read-only and read-twice.** Two reads, both sanctioned:
    the posed-photo bundle (§2) and one source USDZ (§8). No production Modal
    environment, no production role, no production secret, no production write.
