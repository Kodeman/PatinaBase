# Dense-frame feasibility — can we train the splat on the capture stream, not the 42 heroes?

> **Status:** investigation + planning · **Date:** 2026-08-19 · **Lane:** dense-frame feasibility (Rendered Room v2 splat-quality)
> **Companions:** `W2-EVIDENCE.md` (§12 item 8 — the splat is "a dense clump, not a room"), `ARCHITECTURE.md`, `DELIVERY-PLAN.md`
> **Scope:** read-only. No GPU, no training, no deploy. Staging read-only; prod read-only (CLI storage GETs + REST, Kody's authorized scan only).

## Verdict, up front

**FEASIBLE-NOW for the existing fixture.** The dense capture stream for the copied prod
scan is not lost and not device-local — it is **already uploaded to prod storage** and
sitting there intact: **100 posed RGB keyframes** (`keyframes.tar`, 33.1 MiB) and
**86 posed depth frames** (`depth.tar`, 12.2 MiB), each with per-frame ARKit pose +
intrinsics in NDJSON side-indexes. The staging copy simply never brought them across —
`copy-prod` skips both by design. Bringing them to staging is a bounded `copy-prod`
extension plus a keyframe-index parser; no iOS change and no new capture are required to
run the comparison that answers §12 item 8.

**But two honest scope lines:**

1. The **10×** the brief hoped for is not there. The dense RGB win is **2.38×** more
   views (100 vs 42), not 10×. The depth stream adds 86 posed depth maps, but **depth
   frames carry no RGB** — they cannot be photometric training views; their value is a
   dense, photo-consistent **seed cloud** and (a larger change) depth supervision.
2. This scan's keyframes exist because it was captured by the **older** upload path
   (2026-07-29, the v3-instrument-graft era, `.tar` artifacts). The **current** Patina
   client (ScanManifest v3, `apps/mobile/Patina`) uploads `depth.zip` but **does not
   upload a keyframes archive at all** — the `keyframesArchive` / `keyframeIndex` /
   `keyframeSummary` artifact kinds were never brought across from Field's vocabulary
   (`ScanManifest.swift` lines 439–450). So for *future* captures the dense RGB stream is
   **captured-then-dropped**, and getting it going forward is path (b), an ingest change.

**One recommended next action:** build the path-(a) copy-prod extension + a
`parse_keyframe_index` adapter in `core/transforms.py` (+ optional depth-backprojected
seed), then run **one** seeded 100-keyframe splat on staging against the same fixture and
compare it to the 42-hero clump. It is the cheapest decision-grade test of the whole
hypothesis and it uses data we already have.

---

## 1. What the bundle actually contains — and what reaches the server

### 1a. The current client pipeline (ScanManifest v3)

`apps/mobile/Patina/Patina/Features/Walk/Models/ScanManifest.swift` defines the
`ArtifactKind` set and `ArtifactUploader.swift` maps each kind to a `room_scans` URL
column or drops it as device-local:

| ArtifactKind | Uploaded? | Column / note |
|---|---|---|
| `usdz`, `capturedRoomJson`, `worldMap`, `mesh`, `heroThumbnail`, `coverageHeatmap`, `bundleManifest`, `photosManifest` | yes | one column each |
| **`depthArchive` (depth.zip)** | **yes** | `depth_archive_url`, folder `depth/` |
| `bundleArchive` (bundle.zip) | yes (optional) | `scan_bundle_url` |
| `depthIndex`, `photoThumbnails`, `annotations` | **no** — device-local | `depthIndex` rides *inside* depth.zip; annotations ship as a manifest field |
| `keyframesArchive`, `keyframeIndex`, `keyframeSummary` | **N/A — not in the client enum** | Field-only; "NOT YET BROUGHT ACROSS" (ScanManifest.swift:439) |

**depth.zip is produced and uploaded** when `highFidelityDepthEnabled` (default **true**,
`RoomCaptureService.swift:88`) and the recorder wrote ≥1 frame
(`RoomCaptureBundleAdapter.swift:219`). Its contents (`DepthFrameRecorder.swift`):
`depth_<ts>.png` (16-bit mm depth), `conf_<ts>.png` (8-bit ARConfidenceLevel), and
`depth_index.ndjson` — **per frame: pose (row-major 4×4), intrinsics, timestamp,
associatedPhotoId, width/height. No RGB.**

**Crucial:** the current client captures posed photos (auto @ 2 s) + depth frames. It does
**not** record or upload a separate dense RGB keyframe stream. So on a current-build scan
the only RGB the server ever sees is the ~42 posed photos.

### 1b. The real prod scan predates that — and it *did* upload keyframes

Prod scan `83f0d63d-cc35-4320-bf80-67d473af52f3` ("Site scan Jul 28, 2026", status
`ready`, `upload_completed_at` set) was captured on the **older** path. Storage keys under
`room-scans/<folder>/74056c2a…/da3af6b7…/` (the storage scanId `da3af6b7` differs from the
row id — an old-pipeline trait), sizes read from `storage.objects.metadata`:

| Object | Size | What it is |
|---|---|---|
| **`bundle/…/keyframes.tar`** | **34,719,232 B** | dense RGB keyframes (→ `scan_bundle_url`) |
| `keyframes/…/keyframe_index.ndjson` | 69,818 B | per-keyframe pose + intrinsics + heicPath + sharpness |
| `keyframes/…/keyframe_summary.json` | 91 B | `{"fired":100, …}` |
| **`depth/…/depth.tar`** | **12,770,304 B** | dense depth frames (→ `depth_archive_url`) |
| `depth/…/depth_index.ndjson` | 53,872 B | per-depth-frame pose + intrinsics |
| `captured_room/…/captured_room.json` | 253,804 B | parametric room (4 walls, floor, 2 windows, door, opening, 20 objects) |
| `manifests/…/manifest.json` | 34,047 B | bundle manifest |
| `usdz/…/scan.usdz` | 53,425 B | RoomPlan export |
| `glb/…/scan.glb` | 1,196 B | the floor-only GLB (W2 §8) |
| `photos/…/auto_*.jpg` ×42 (+42 thumbs) | ~400 KB ea | the "42 heroes" |
| `scorecard/…/scorecard.json` | 519 B | QA scorecard |

So for **this** scan the ground truth is: **the dense frame material exists server-side,
fully posed, in two tar archives with side-indexes.**

### 1c. `room_scans` columns — prod vs the staging copy

| | prod `83f0d63d` | staging copy `cd72ad9b` |
|---|---|---|
| `depth_archive_url` | `…/depth/…/depth.tar` ✅ | **null** |
| `scan_bundle_url` | `…/bundle/…/keyframes.tar` ✅ | **null** |
| `captured_room_json_url` | ✅ | ✅ |
| `model_url` (usdz) | ✅ | ✅ |
| `room_scan_images` | 42, all 42 with `camera_transform` | 42, all 42 with transform (after `a6d5c04f`) |

`copy-prod` (`scripts/scan-staging-seed/seed_scan.py`, `build_copy_manifest`, lines
525–568) **deliberately skips** depth archive, bundle/keyframes archive, world map, and
bundle manifest — recorded in `skipped` as "out of scope for splat/renders". That decision
is exactly why the staging fixture is untrainable on dense frames today, and it is a
one-function change to lift.

---

## 2. The probe — exact frame counts and poses

Both side-index NDJSONs were pulled read-only via the linked Supabase CLI (Kody's scan)
and parsed locally.

**Capture envelope** (from `room_scan_images.timestamp_seconds`): 42 auto photos,
**t = 2.54 s … 84.84 s → 82.3 s walk**, mean gap **2.01 s** (= `autoPhotoInterval` default),
portrait 1440×1920.

**Keyframes** (`keyframe_index.ndjson`, 100 lines; summary `"fired":100`):

| Property | Value |
|---|---|
| Count | **100** |
| With a real (non-identity) pose | **99 / 100** (only the first frame is identity — pre-tracking) |
| RGB payload | full-res **1440×1920 HEIC** (`heicPath`), one per keyframe, in `keyframes.tar` |
| Intrinsics | per-frame `{fx, fy, cx, cy, imageWidth 1920, imageHeight 1440}` (native landscape) |
| Sharpness | scored per frame (min 269, median 2266, max 4627) — blur filtering already ran |
| Cadence | t = 0.54 … 92.06 s, mean gap **0.92 s** |
| `hasDepth` | 98 / 100 flag an aligned depth frame |

**Depth** (`depth_index.ndjson`, 86 lines):

| Property | Value |
|---|---|
| Count | **86** |
| With a real pose | **86 / 86** |
| Payload | 256×192, `u16mm+u8conf` (16-bit mm depth + 8-bit confidence) |
| Intrinsics | per-frame, native landscape frame |
| Cadence | t = 0.67 … 85.68 s, mean gap **1.00 s** (≈ 1 Hz, as designed) |

Keyframe→nearest-depth time delta: median 0.284 s (only 17/100 within 0.1 s), so depth and
keyframes are **separate ~1 Hz streams on the same clock**, not a paired RGBD stream — but
every keyframe has its *own* pose, so pairing is not needed to use them as views.

---

## 3. Frame-count math — the honest multipliers

| Signal | Count | vs 42 heroes | Usable as splatfacto… |
|---|---|---|---|
| Hero photos (today's input) | 42 | 1.0× | RGB training views |
| **Keyframes (RGB, posed)** | **100** | **2.38×** | **RGB training views** (the real win) |
| Depth frames (posed, no RGB) | 86 | — | seed cloud / (bigger) depth supervision |
| Combined posed constraints | 186 | 4.4× | mixed |

**Seed-cloud budget from depth:** 86 frames × (256×192 = 49,152 px) = 4.23 M depth samples.
Keeping even ~5 % after a confidence mask + voxel subsample yields **~200 k** photo-consistent
seed points — twice the 100 k the parametric sampler produces today (`seed_points.py`,
`SEED_TARGET_POINTS = 100_000`) and, unlike the parametric boxes, colored from the real
keyframes and shaped to the real surfaces (objects included).

The brief's "10×" is not realizable from this capture: the dense stream is ~1 Hz over an
82 s walk, and RGB tops out at the 100 keyframes. The lever is **2.4× more views + a real
depth seed**, not an order of magnitude more views.

---

## 4. What splatfacto / gsplat can actually consume

Grounded in the already-built pipeline (`core/transforms.py`, `core/seed_points.py`,
`jobs/splat_job.py`, nerfstudio 1.1.5) and the W2 run:

1. **RGB keyframes → additional posed training views. This is the primary win.** splatfacto
   is photometric: every posed RGB view is a photometric constraint. W2 §14.5 diagnosed the
   42-view result as "a dense clump with long spiky Gaussians" — the classic under-constrained
   splat, where regions few cameras see collapse into floaters. 2.4× the views, better spread
   along the walk, is the direct remedy. `core/transforms.py` already performs the exact
   ARKit→nerfstudio conversion (camera axes need **no** flip; the 90° portrait rotation
   `needs_right_rotation` fires for 1440×1920-vs-1920×1440; world Y-up→Z-up via
   `ARKIT_TO_NERFSTUDIO`). Keyframes use the **identical** convention — only the NDJSON
   schema differs (`heicPath` not `relativePath`; `intrinsics.imageWidth/imageHeight` not
   `width/height`), so a thin `parse_keyframe_index` adapter feeds the existing
   `build_transforms` unchanged. `splat_job._write_frame` already transcodes HEIC→JPEG.

2. **Depth frames → seed cloud (not views).** Depth carries no RGB, so it cannot be a
   photometric view. Its highest-value use is replacing/augmenting the parametric seed with a
   **back-projected, confidence-masked, keyframe-colored** point cloud. W2 §13.4 already proved
   the seeding *mechanism* end-to-end (nerfstudio reads `ply_file_path` / `sparse_pc.ply`;
   `gaussian_count` at step 0 measured 100 k, confirming the seed was read). Swapping the
   sampler's source from `captured_room.json` boxes to depth back-projection is a new
   `core/seed_points_depth.py` reusing the same PLY encoder and the same frame convention
   (`seed_points.py` docstring: a `SceneSpec` is already in nerfstudio world; depth points
   land there too after applying each frame's pose).

3. **Depth-as-geometry-supervision (per-pixel depth loss)** is the *largest* change and is
   **not** recommended for the first comparison: base `splatfacto` in nerfstudio 1.1.5 uses
   3D points for **initialization**, not a depth-ranking loss (that lives in `depth-nerfacto`
   / `splatfacto` depth variants and needs per-frame depth registered as a dataparser output).
   Prove the view-count + seed win first; only reach for depth supervision if the clump
   persists.

**Verdict:** the biggest, cheapest quality lever is **more RGB views (the 100 keyframes)**,
seeded by a **depth-backprojected point cloud**. Both are consumable by the pipeline as it
stands, with a parser adapter and a seed module — no nerfstudio patch.

**Preprocessing the dense frames need:** (a) untar `keyframes.tar` → transcode 100 HEIC→JPEG
(existing `_write_frame`); (b) `parse_keyframe_index` → `PhotoPose` list → existing
`build_transforms` (undistort is a no-op — ARKit hands a rectilinear PINHOLE model, no
k1/k2); (c) for the seed: untar `depth.tar`, decode u16mm + u8conf, back-project with each
frame's pose+intrinsics, confidence-mask, voxel-downsample, color from the nearest keyframe,
encode via `seed_points.encode_ply`. No pose *estimation* is required — ARKit poses are
ground-truth and already present, which is the whole reason this is cheap versus a COLMAP path.

---

## 5. The three paths, ranked

### ▶ Path (a) — RECOMMENDED — dense frames ARE uploaded; bring them to staging and run one comparison

Feasible now for the fixture. Scope:

1. **`copy-prod` extension** (`scripts/scan-staging-seed/seed_scan.py`)
   - In `build_copy_manifest`, stop skipping and instead copy: `depth.tar` +
     `depth_index.ndjson`, `keyframes.tar` + `keyframe_index.ndjson` +
     `keyframe_summary.json`. Rewrite keys with the existing `rewrite_key`; set
     `depth_archive_url` and `scan_bundle_url` on the staging row via the existing
     `_download_verify_upload` (size+sha256 verify already built in).
   - The read-only prod-source guard (`validate_source_url`) and the deterministic staging
     ids (`derive_copy_ids`) are unchanged. Re-run is idempotent.
   - Effort: ~1 module, existing helpers. No new infra.

2. **`parse_keyframe_index`** in `core/transforms.py`
   - Adapter: map each keyframe NDJSON line → the `_photo_pose` shape (`heicPath`→
     `relativePath`; `intrinsics.imageWidth/imageHeight`→`width`/`height`). Reuse
     `nerfstudio_pose` / `build_transforms` verbatim. Order by `timestampSeconds`. Drop the
     1 identity-pose frame.
   - `splat_job._prepare_workspace`: add a `keyframesSource` branch (untar → transcode 100
     HEIC) parallel to the existing manifest/`photoRecords` branches; record which fired on
     the artifact as `photosSource: "keyframes"`.

3. **Depth-backprojected seed (optional but cheap)** — `core/seed_points_depth.py` +
   `ensure_seed_points` gains a "prefer depth cloud, fall back to parametric" branch. Ship
   parametric-seed first if time-boxed.

4. **One staging splat run** on `cd72ad9b` with 100 keyframes (seeded), 12 000 iters
   (`default_max_iterations` for ≤60 frames returns 12 000; 100 frames → keeps 30 000 — note
   this, it changes the budget), on L4. Compare the `.spz` visually in the portal against the
   42-hero clump. Cost ≈ one L4 pass (~$0.9, per W2 §11).

**Deliverable of the run:** the first apples-to-apples answer to "does dense-frame training
fix the clump", for < $1 and no iOS work.

### Path (b) — for FUTURE captures — bring keyframe upload across in the client (scope only)

The current Patina client captures posed photos + depth but **not** a keyframe RGB stream,
and does not upload keyframe archives (`keyframesArchive`/`keyframeIndex`/`keyframeSummary`
absent from the client `ArtifactKind`). To make dense RGB available going forward:

- Add the three keyframe `ArtifactKind` cases (coupled change: three exhaustive switches in
  `ScanBundleWriter.defaultFileName`, `ArtifactUploader.scanColumn`, `.storagePathComponents`
  each need a real folder/column decision — see ScanManifest.swift:444–450). New columns
  `keyframes_archive_url` / index handling.
- Add a keyframe recorder (RGB @ ~1 Hz with pose+sharpness) mirroring `DepthFrameRecorder`,
  or raise `autoPhotoInterval` so the posed-photo stream itself densifies (simpler, but heros
  are full-res HEIC — bandwidth cost). **Scope only; do not build until path (a) proves the
  quality win is real.**

### Path (c) — fallback if a scan genuinely lacks dense frames

For current-build scans with no keyframes: the ceiling is **denser hero sampling**
(lower `autoPhotoInterval`, a capture-side product change) plus the **parametric seed already
shipped** (§13.4). Depth.zip (which current scans *do* upload) still enables the depth seed —
so even the current pipeline can get the seed-cloud half of the win without any RGB change.

---

## 6. Evidence index

- iOS: `ScanManifest.swift` (kinds, lines 417–451), `ArtifactUploader.swift` (routing 380–432),
  `DepthFrameRecorder.swift` (depth.zip contents, no RGB), `RoomCaptureBundleAdapter.swift:219`
  (depth.zip produced iff frames written), `RoomCaptureService.swift:88` (`highFidelityDepthEnabled` default true).
- Pipeline: `core/transforms.py` (ARKit→nerfstudio + portrait rotation), `core/seed_points.py`
  (seed mechanism, `SEED_TARGET_POINTS`), `jobs/splat_job.py` (`_prepare_workspace`,
  `_write_frame` HEIC transcode, `default_max_iterations`), `scripts/scan-staging-seed/seed_scan.py`
  (`build_copy_manifest` skips depth/keyframes).
- DB: prod `room_scans.83f0d63d` (`depth_archive_url`, `scan_bundle_url` set), `storage.objects`
  sizes, `room_scan_images` timing (82.3 s / 2.01 s). Staging `cd72ad9b` (both URLs null).
- Prod objects (read-only): `keyframe_index.ndjson` (100 posed RGB keyframes), `depth_index.ndjson`
  (86 posed depth frames), `keyframe_summary.json` (`fired:100`).
- Prior: `W2-EVIDENCE.md` §12 item 8, §13.4 (seeding proven), §14.5 (the 42-hero clump).
