# The Rendered Room v2 — W2 staging evidence

> **Status:** staging evidence · **Date:** 2026-08-19 · **Wave:** W2 (GPU lane)
> **Companions:** `W1-EVIDENCE.md`, `DELIVERY-PLAN.md`, `ARCHITECTURE.md`, `PROPOSAL.md`
> **Format:** follows `docs/engineering/patina-cloudflare-phase-1-staging-evidence.md`

Everything below ran against **staging only** — Supabase project
`vuesoyhfrjabfxbrzekd` and Modal environment `patina-staging`. The production
ref `bkvcixdmuyejfzcijpdg` was not read, written, or contacted, and no
production Modal environment exists.

**Headline.**

| Lane | Outcome |
|---|---|
| `renders` (Cycles, L40S) | **PASS end to end** on the real prod-copied scan — twice. Artifacts in R2, registry rows, `room_files.artifacts.renders`, ledger complete. |
| `splat` (splatfacto, L4) | **BLOCKED.** Training runs; the artifact tail cannot. Four distinct defects found, two of them hard blockers. |

Total Modal spend for the whole wave: **$0.79 metered, $0.00 billed** (credits).
No run exceeded its budget; nothing is left running.

---

## 1. What is deployed

`modal deploy -m scan_modal.app --env patina-staging` — app `patina-scan`
(`ap-zLm5zIIytE9TgWWkipevm8`), functions `verify`, `splat` (L4), `renders`
(L40S), `spawn`. The three images built during W2 prep and are cached: each
redeploy in this session completed in **~1.9 s**.

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

## 3. `renders` — PASS, end to end, on real geometry

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

## 4. `splat` — training runs; the artifact tail is blocked

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

## 5. Fixes made this wave

| Commit | What |
|---|---|
| `a6d5c04f` | `fix(scan-staging-seed)`: copy `camera_transform` / `camera_intrinsics`, without which splat cannot run (§2) |
| `e1654150` | `fix(scan-modal)`: the top-down plate cropped every room deeper than 3:4 (§3) |
| `2a04a8eb` | `fix(scan-modal)`: nerfstudio's run directory is four levels, not three (§4 A) |

Unit suite after all three: **246 passed** (`.venv/bin/python -m pytest -q` in
`services/scan-modal`) and **44 passed** in `scripts/scan-staging-seed`.

---

## 6. Cost

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

## 7. Open items

1. **`scan.glb` is floor-only, so the render set is a picture of nothing.**
   The room's walls, openings and objects are all present in
   `captured_room.json` and absent from the GLB the `renders` stage consumes.
   Needs a ruling: fix `convert_usdz_to_glb` / the USDZ export upstream, or
   build the render source from `captured_room.json` (which `verify` already
   parses into walls). Until then the lane is machinery without a subject.

2. **No PLY → SPZ converter exists in `_SPLAT_IMAGE`** (§4 B). Hard blocker on
   the splat artifact. Needs a converter chosen and pinned before any further
   L4 time is spent.

3. **The fixture needs one `copy-prod` re-run** with `a6d5c04f` applied, to
   bring the 42 poses across. That is a read against prod and was outside this
   lane's rails; it is the single step between here and a real posed splat.

4. **Reconcile the three splat time budgets with measured reality** (§4 C):
   `TRAIN_TIMEOUT_S`, `SPLAT_TIMEOUT_SECONDS`, and the dispatcher's 30-minute
   visibility timeout. The lease is the one that silently discards completed
   work.

5. **Commit the checkpoint Volume during training, not only after it** (§4 D),
   or the preemption-resume design cannot fire.

6. **Decide whether `inputs.config` should reach the stage** (§4 E). The
   closed per-stage contract is a good design; the cost knob still needs a
   route, and today has none.

7. **`media_objects.owner_user_id` is NULL on all 29 rows.**
   `scan_worker_register_media_object` does not set it. Harmless while nothing
   reads through it; worth settling before the W2 read routes land.

8. **Cycles output is not byte-reproducible.** Re-rendering unchanged cameras
   produced identical file *sizes* and different sha256s
   (`corner_ne.jpg`: 29,091 B both times, `1304c63d…` → `620f6402…`). The
   camera *plan* is deterministic and unit-tested; the pixels are not. Any
   determinism claim for `renders` has to be made about the plan, not the bytes
   — unlike W1's `verify`, which is byte-identical across runs.

9. **A task that can never complete is re-dispatched forever.** W1's verify
   task `abad722d-1f97-429e-b267-66c8a74c8770` is superseded (`room_files` v1
   against a scan now at v3), so every 5-minute cron sweep spawns it again and
   it exits clean on `StaleVersion` without ever completing — `attempts` is at
   7 against `max_attempts` 5. Free for a CPU stage; for `splat` this shape
   would allocate an L4 every five minutes indefinitely.

10. **The staging fixtures persist.** Markers
    `seed:rendered-room-v2-w2-prod-copy` and
    `seed:rendered-room-v2-w2-splat-smoke-synthetic-poses` on
    `room_scans.name`. The second holds **fabricated** camera poses and must
    never be read as real capture data. Staging only; no cleanup owed unless
    the branch is reset.

11. **No production anything.** No production Modal environment, no production
    role, no production secret, no production read. Unchanged from W1.
