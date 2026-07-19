# P2 item 4 — COLMAP refine adapter spike

**Date:** 2026-07-18
**Scope:** format/geometry/engine-path proof only; no queue handler, database,
storage, migration, or production mutation.

## Verdict

Proceed with the `scan_pipeline.refine` handler using **COLMAP 4 known-pose
triangulation + bundle adjustment as the primary path** and COLMAP's
**position-prior mapper as the fallback**. Do not build against the archived
standalone GLOMAP repository, and do not make COLMAP 4's `global_mapper` the
production default: the supported global mapper consumes intrinsic priors but
does not expose the full ARKit rotation/translation seed required by item 4.

This spike makes the adapter math, deterministic pair graph, overlap verdict,
deadline, and immutable artifact contract executable in
`patina_scan_worker.refine_adapter`. It is a **go for handler implementation**,
but a **no-go for deployment or a run on `95266be1`** until the box gates in
“What this spike does not prove” pass. “Implementation” means code/test
development; the handler must remain disabled until qualification passes.

## Engine decision and current support reality

The original P2 language says “GLOMAP warm-started on known poses.” That exact
path no longer exists as a supported standalone integration:

- The standalone [COLMAP/GLOMAP repository](https://github.com/colmap/glomap)
  was archived on 2026-03-09 and says its implementation moved into COLMAP.
- [COLMAP 4.0](https://github.com/colmap/colmap/releases) integrated GLOMAP as
  `global_mapper`; **4.0.2 is the exact target**, not a validated runtime.
- The official [COLMAP CLI](https://colmap.github.io/cli.html) exposes
  `global_mapper`, `pose_prior_mapper`, `point_triangulator`, and
  `bundle_adjuster`.
- COLMAP's official [known-pose FAQ](https://colmap.github.io/faq.html) prescribes
  a model containing cameras and registered images with known poses, followed
  by `point_triangulator`. The pose-prior path accepts positions/covariances;
  it is not a full-orientation warm start.

Therefore:

| Role | Supported path | Pose information retained |
|---|---|---|
| Primary | Seed registered sparse model → `point_triangulator` → `bundle_adjuster` | Full ARKit rotation and translation |
| Fallback | Database position priors → `pose_prior_mapper` → `bundle_adjuster` | Metric camera centres and covariance; rotations intentionally discarded |
| Optional diagnostic only | COLMAP 4 `global_mapper` | Intrinsic priors, no full-pose warm start |

As of 2026-07-18, official COLMAP **4.1.1** is the current release. The package
nonetheless pins `pycolmap==4.0.2` as the **pilot qualification target** so the
CLI and binding can be proven at exact parity against the adapter/API fixture;
this is not a claim that 4.0.2 is current or already validated. The future box
fixture must prove that both the first `colmap -h` header line and
`pycolmap.__version__` report exactly 4.0.2 before it
touches a real scan; CLI/binding mismatch is `REFINE_ENGINE_VERSION_MISMATCH`.
The artifact says `targetColmapVersion` and
`qualificationStatus=unvalidated-pending-field-and-box-fixture`. A later 4.x
requires a new explicit qualification and pin. Standalone `glomap` is not a
runtime prerequisite.

## Field v3 bundle seam

Source inspection establishes a **hypothesis**, not a qualified raster contract:

- `FieldKeyframeRecorder.swift` creates a `CIImage` from the native ARKit pixel
  buffer and writes `ciImage.oriented(.right)` to HEIC.
- The same index row records the **unrotated/native** ARKit intrinsics and
  `imageResolution`, while `width`/`height` are the physically rotated CGImage
  dimensions.
- `cameraTransform` is a row-major ARKit camera-to-world matrix in metres.

The proposed adapter therefore applies no second orientation transform. However,
the Swift source plus synthetic math does not prove the actual encoded Field
HEIC/Core Image pixel raster or the Linux decoder behavior. A real Field fixture
must compare known off-centre pixels before this becomes production law. If the
hypothesis passes, a copied/decoded raster must remain
`width = nativeHeight`, `height = nativeWidth`; otherwise the adapter math and
fixture change together before deployment.

### Intrinsics for the physical clockwise rotation

Use the continuous top-left image-coordinate convention used by ARKit K, where
an image centred at width `W` has `cx = W/2`. A physical clockwise rotation maps

```text
(u, v) -> (H - v, u)
(W', H') = (H, W)
(fx', fy', cx', cy') = (fy, fx, H - cy, cx)
```

The proposed convention is intentionally `H - cy`, not `H - 1 - cy`. The unit
fixture uses an off-centre principal point and projects a synthetic 3D ray
through both bases, proving only the internal math. The real Core Image/HEIC
fixture is still a deployment gate.

Apple's documentation separates the camera's native
[`imageResolution`](https://developer.apple.com/documentation/arkit/arcamera/imageresolution),
[`intrinsics`](https://developer.apple.com/documentation/arkit/arcamera/intrinsics),
and world [`transform`](https://developer.apple.com/documentation/arkit/arcamera/transform).
That separation is why the stored native K must be transformed to match the
physically rotated file.

### ARKit to COLMAP axes and pose

ARKit camera coordinates are `+x` right, `+y` up, and forward is `-z`. COLMAP
camera coordinates are `+x` right, `+y` down, and forward is `+z`. For the native
raster the basis change is

```text
D = diag(1, -1, -1)
```

The physical clockwise raster adds

```text
C = [[0, -1, 0],
     [1,  0, 0],
     [0,  0, 1]]
```

so the combined proper rotation is

```text
B = C D = [[0, 1,  0],
           [1, 0,  0],
           [0, 0, -1]], det(B) = +1
```

For ARKit `T_world_from_camera = [Rwa | Cw]`:

```text
R_colmap_from_world = B Rwa^T
t_colmap_from_world = -R_colmap_from_world Cw
```

The inverse used by the proof is:

```text
Cw  = -R_colmap_from_world^T t_colmap_from_world
Rwa =  R_colmap_from_world^T B
```

COLMAP text/model quaternion order is Hamilton `(qw, qx, qy, qz)`. The adapter
canonicalizes quaternion sign so identical inputs produce identical bytes.

## Exact primary execution path

The handler should perform these steps in this order. The ordering protects the
database image IDs that keypoints, descriptors, matches, and the seed model all
share. The relevant current bindings are in the official
[PyCOLMAP API](https://colmap.github.io/pycolmap/pycolmap.html); database IDs and
pair encoding follow the official [database format](https://colmap.github.io/database.html),
and sparse outputs follow the official [model format](https://colmap.github.io/format.html).

1. **Start one lease-aware stage deadline.** At claim-request start, capture a
   monotonic timestamp and add the exact validated `VISIBILITY_TIMEOUT` sent to
   PostgreSQL. Carry that immutable conservative expiry bound on the claimed
   task. PostgreSQL cannot establish the lease before the request begins, so
   response latency can only shorten this bound, never extend it beyond the
   actual database lease. At handler entry set
   `deadline = min(start + 240 seconds, claimed lease bound - 60 seconds)`.
   Four minutes is §10.9's ratified refine ceiling; the 60-second reserve is for
   checksums, durable publication, fork enqueues, and completion. Every command
   receives only `deadline - now`; never infer a static lease length or create a
   fresh timeout per command. If the claimed lease is short, the engine budget
   shrinks; if no reserve remains, fail transient before launching COLMAP. This
   bound assumes the host stays awake because Linux's monotonic clock excludes
   suspend time; disable suspend before Refine is enabled unless the contract is
   first moved to a suspend-aware clock or revalidated against the live lease.
2. **Materialize images under the still-unproved raster hypothesis.** Verify each
   source checksum and indexed dimensions. The Field/Core Image fixture first
   establishes whether copy/link or a no-autorotate PNG decode preserves the
   expected raster. The materialized name then becomes the canonical COLMAP
   image name. Source inspection alone does not authorize this step in prod.
3. **Extract features in per-image camera mode.** Run
   `pycolmap.extract_features(..., camera_mode=CameraMode.PER_IMAGE)`. This
   creates database image/camera IDs and keypoints/descriptors first.
4. **Rewrite each per-image camera, preserving IDs.** Resolve the database image
   by canonical name, read its unique camera, replace it with `PINHOLE` width,
   height, and `[fx', fy', cx', cy']`, mark focal length as prior, and update the
   same camera row. Do not delete/reinsert images after features exist.
5. **Build and match the explicit graph.** Write sorted unique image pairs from:
   all pairs within a 10-frame temporal window, plus up to 8 closest
   non-temporal ARKit-spatial neighbours per frame whose baseline is
   `0.25 m <= d <= 1.5 m`. Use `pycolmap.match_image_pairs` with geometric
   verification. This keeps bounded loop candidates without a vocabulary-tree
   dependency.
6. **Create the seed sparse model with the database IDs.** For every database
   camera/image, add the camera with a trivial rig and the image with a trivial
   frame using the exact database IDs. Set `cam_from_world` from the converted
   full ARKit pose. Assert name, image ID, and camera ID equality against the
   database before writing `cameras.bin`/`images.bin`; start with no points.
   Current PyCOLMAP exposes the needed database reads/updates and reconstruction
   `add_*_with_trivial_*`/ID transcription helpers. The integration fixture must
   pin their exact 4.0.2 signatures rather than relying on a pre-4.x shape.
7. **Triangulate known poses.** Run `point_triangulator` (or the equivalent
   `pycolmap.triangulate_points`) against the database, materialized images, and
   seed model. Reject a model whose registered-image set differs from the input.
8. **Refine.** Run global `bundle_adjuster` over the triangulated model with the
   intended camera parameter-refinement flags explicit. Never silently switch to
   raw ARKit output when BA fails. Stream command output to a scratch log, retain
   only a bounded 64 KiB tail in memory/errors, and give every command the shared
   lease-aware deadline.
9. **Restore the metric gauge.** Estimate Sim(3) from refined COLMAP camera
   centres (source) to the corresponding raw ARKit centres in metres (target),
   transform the refined poses/points **and camera orientations**, compute the
   exact metrics below, and persist the aligned model and pose deltas.

### Fallback execution path

The fallback shares image materialization, per-image corrected intrinsics, and
the exact pair graph. It then writes each ARKit camera centre as a Cartesian
position prior with covariance

```text
diag(0.10^2, 0.10^2, 0.10^2) metres^2
```

and runs `pose_prior_mapper`, followed by `bundle_adjuster` and the same Sim(3)
alignment. The adapter artifact explicitly says `rotationRepresented: false`.
This prevents the fallback from being mistaken for a full-pose warm start.

Engine selection must be explicit in configuration and telemetry:

```text
primary  = colmap-4-known-pose-triangulate-ba
fallback = colmap-4-position-prior-mapper
```

Fallback is for an unsupported/failed known-pose construction path that the
operator can diagnose, not an automatic way to hide deterministic low overlap.

## Metric gauge, shape diagnostic, and actual refinement evidence

For corresponding refined centres `x_i` and raw ARKit centres `y_i`, solve the
positive-scale Horn/Umeyama objective

```text
min over s>0,R,t  sum_i ||y_i - (s R x_i + t)||^2
```

The prototype uses a dependency-free Horn quaternion eigensolve and rejects
fewer than three, zero-variance, or collinear correspondences.

Sim(3)-to-raw residual is only a **trajectory-shape change diagnostic**:

```text
e_i                         = y_i - (s R x_i + t)
shape_change_rmse_m          = sqrt(mean(||e_i||^2))
raw_keyframe_rms_radius_m    = sqrt(mean(||y_i - mean(y)||^2))
trajectory_shape_change_pct = 100 * shape_change_rmse_m
                              / raw_keyframe_rms_radius_m
mean_keyframe_displacement_pct
                             = 100 * mean(||e_i||)
                              / raw_keyframe_rms_radius_m
```

This denominator weights captured keyframes equally and is explicitly
**cadence-sensitive**. It is useful for detecting how strongly BA reshaped the
raw trajectory, but it cannot say the result is correct: a no-op always scores
0%. It must never be named `sfm_residual_pct`, presented as drift/accuracy, or
compared to the old 0.2–0.5% aspiration. That number has no acceptance role
until an external-ground-truth metric and threshold are separately validated.

The handler must persist a separate `refinement-evidence-v1.json`, computed on
identical features/tracks before and after:

- input and registered-image counts/coverage before and after;
- common observation count, observation-set SHA-256, and reprojection RMSE in
  pixels before and after;
- count of verified non-temporal loop edges;
- verified-loop set SHA-256 so the before/after comparison is the same set;
- RMS rotation disagreement (degrees) between each verified two-view loop and
  the trajectory relative pose, before and after;
- RMS translation-direction disagreement (degrees) on those same loops, before
  and after; and
- optional tape-anchor or independent ground-truth error in metres, before and
  after, with provenance.

Refinement is internally evidenced only when after-coverage is at least 80% and
does not regress, at least one verified loop exists, no comparable geometric
metric regresses, and at least one comparable metric improves by 1% relative.
The shape diagnostic is not an input to that verdict: it can neither grant nor
veto refinement evidence. An unchanged comparable evidence set is
`REFINE_NO_MEASURABLE_IMPROVEMENT` and is not certifying output. Reprojection
and loop improvement still do **not** certify absolute room accuracy; only
validated external evidence can eventually do that, and this spike deliberately
sets no absolute-accuracy pass threshold.

The Sim(3) world rotation `Rg` must also rebase every refined orientation. If a
refined pose is `R_cam_from_source_world`, the aligned COLMAP pose is

```text
R_cam_from_metric_world = R_cam_from_source_world Rg^T
C_metric                = s Rg C_source + t
t_cam_from_metric_world = -R_cam_from_metric_world C_metric
```

For an ARKit camera-to-world export, remove the right-rotated COLMAP camera basis
as well:

```text
R_metric_world_from_arkit_camera
    = R_cam_from_metric_world^T B
    = Rg R_cam_from_source_world^T B
```

Scale never enters an orientation. Merely aligning centres and sparse points
while retaining the pre-alignment rotations would give Fuse/Splat internally
inconsistent rays.

## Deterministic low-overlap fatal verdict

After geometric verification, only edges that were actually emitted by the
deterministic temporal/spatial candidate graph may count:

- an edge is verified at **at least 30 inliers**;
- at least three frames must exist;
- the largest verified connected component must cover **at least 80%** of input
  frames; and
- at least one verified edge must span more than the 10-frame temporal window.

A high-inlier edge injected outside the candidate graph is ignored. The
integration fixture uses a physically plausible ~0.5 m-step returning walk,
never a synthetic one-frame teleport, to prove the loop candidate.

Failure of any condition is permanent `REFINE_LOW_OVERLAP` with a stable reason
(`fewer_than_three_frames`, `insufficient_verified_connected_coverage`, or
`no_verified_non_temporal_loop`). Transient I/O, driver, OOM, or absolute engine
deadline failures remain retryable at the handler layer. Invalid bundle shape,
non-rigid pose data, or an immutable artifact conflict are permanent.

These are conservative starting thresholds, not yet calibrated product truth.
The first real-room dry run must record the inlier/component distributions
before they are blessed for general rooms.

## Persistent artifacts and concurrency contract

The production handler owns this versioned prefix:

```text
room_file/{uid}/{scanId}/v{roomFileVersion}/refine/
```

The spike writes:

```text
adapter-v2.json
pairs-v2.txt
adapter-manifest-v2.json       # commit marker, always last
```

The rejected `adapter-v1` proof is superseded and was never a production/storage
contract; v2 carries the corrected evidence, deadline, qualification, and join
semantics.

The handler adds at least:

```text
database-v1.db or deterministic archive
seed-model-v1.tar
aligned-sparse-model-v1.tar
refined-poses-v1.json
pose-deltas-v1.json
refine-manifest-v1.json        # checksums/sizes/engine+version/input hashes, last
```

Every document is byte-deterministic: sorted records, canonical quaternion sign,
no wall-clock field in hashed content, SHA-256 and byte size for every input and
artifact. Publication is create-only. Concurrent writers behave as follows:

- absent object/path: atomically create;
- existing identical bytes/checksum: idempotent success;
- existing different bytes/checksum: `REFINE_ARTIFACT_CONFLICT`, never overwrite;
- the manifest is the only completeness marker and is published after every
  referenced artifact is durable.

The local prototype fsyncs the temporary file, atomically hard-links it, then
fsyncs the destination directory. A real multi-process race test proves exactly
one creator and identical no-op replays. The storage implementation should use
create-only upload (`upsert=false`) and, on conflict, compare the existing
object's checksum before treating it as an idempotent replay. COLMAP stdout/stderr
streams to per-command scratch logs; only a bounded 64 KiB tail is retained in
memory or an error, so engine chatter cannot become unbounded capture.

## Queue and Present lifecycle invariants for the future handler

This spike intentionally contains no stage registration or queue call. The
handler must preserve §10.1.1 of `scan-pipeline-worker-design.md`:

1. Refine may set `present_status='refining'` once and emit refine events. It
   must never touch the independent P1 `room_files.status`, set
   `present_status='ready'`, or set `presented_at`.
2. After all refine artifacts are durable, enqueue both
   `scan_pipeline.fuse` (`{scan}:fuse:{v}`) and `scan_pipeline.splat`
   (`{scan}:splat:{v}`), each with conflict-ignore and the refine task as parent.
   Both successor payloads carry the same immutable `refine_manifest_key` and
   `refine_manifest_sha256`; consumers verify that contract before reading any
   aligned pose/model artifact.
3. A crash between enqueues is safe: the replay gets identical refine artifacts
   and both idempotency keys deduplicate.
4. Complete refine only after both successor enqueue attempts succeed. It does
   not enqueue `present`.
5. Fuse must enqueue and complete mesh `solve-upgrade`; only solve-upgrade may
   publish `solve-upgrade/mesh-solve-manifest-v1.json` and act as that branch tip.
6. The mesh-solve tip and Splat both construct the **same** Present enqueue from
   stable IDs only: `{scan_id, room_file_id, room_file_version, user_id,
   refine_task_id}`, idempotency key `{scan}:present:{v}`, common
   `parent_task_id=refine_task_id`, conflict-ignore. No branch-specific manifest,
   checksum, completion timestamp, or branch task ID may enter that payload/row;
   first-finisher order therefore cannot change it.
7. Present derives canonical manifest keys from the stable IDs and refuses ready
   until verified durable `refine`, `fuse`, **mesh-solve**, and `splat` manifests
   exist and their outputs agree. URL presence alone is insufficient.

Refine must **not** read-modify-write `room_files.present`. Fuse and Splat run in
parallel, so neither branch may merge a stale JSON document or race the scalar
`present_status` backward through `fusing`/`training`. Each branch writes only
its dedicated URL column, immutable branch artifacts, and events; both terminal
branches enqueue the identical stable-ID Present contract. Only Present derives
and verifies the canonical four manifests, composes `room_files.present` once,
and changes the scalar lifecycle to `ready` with `presented_at`. A fatal
branch/Present failure may set `present_status='error'`; ordinary branch progress
is represented by events, not competing scalar writes.

## Executable proof

`services/scan-pipeline/tests/test_refine_adapter.py` covers:

- proposed off-centre physical-right intrinsics and equivalent synthetic 3D ray
  projection (not the real Field/Core Image raster);
- ARKit ↔ COLMAP pose/axis conversion and inverse;
- exact known Sim(3), orientation rebasing, diagnostic-only shape-change naming,
  and degeneracy rejection;
- separate comparable reprojection/registration/verified-loop evidence verdict,
  including unchanged-evidence no-op non-certification;
- deterministic temporal + ARKit-spatial pairing on a plausible returning walk;
- candidate-only connected-coverage/verified-loop fatal classification;
- full-pose primary versus position-only fallback contract;
- exact target CLI/binding parity and mismatch rejection;
- versioned source/output checksums without mutating HEIC bytes;
- fsynced immutable multiprocess publication, conflict detection, manifest last;
- identical stable-ID Present enqueue and canonical mesh-solve-aware manifests;
- bounded engine-log tail; and
- one shared deadline `min(start+240s, claimed lease bound-60s)`, including a
  short-lease case.

## What this spike does not prove

The following are hard gates before deployment:

1. **COLMAP 4.0.2 box probe:** use
   `services/scan-pipeline/install-colmap-4.0.2.sh` on DeskDev's Ubuntu 24.04
   experiment to install commit
   `d927f7e518fc20afa33390712c4cc20d85b730b8`, CUDA 11.8, GCC/G++ 11, and
   SM 7.5. Invoke it as the normal operator with
   `--acknowledge-experimental-ubuntu-24.04`. DeskDev may use
   `--work-dir /mnt/ada-data/Patina/.patina-builds/patina-colmap-4.0.2-$UID`
   after precreating the parent as operator-owned mode `0700`; otherwise the
   default remains `/var/tmp/patina-colmap-4.0.2-$UID`. Retain the selected
   work directory's `install.log`, and rerun with `--verify-only` for the
   installed CLI contract. Installer success alone does not qualify item 4.
   Then execute the repository-owned, local-only
   `patina_scan_worker.colmap_qualification` harness on the deterministic tiny
   multiview fixture using
   `p2-item4a-colmap-qualification-runbook.md`. The harness contains the exact
   PyCOLMAP database/model calls above and remains unregistered from the worker.
   Save
   the `colmap -h` version/build header, `pycolmap.__version__`, mismatch
   rejection, GPU SIFT
   result, IDs before/after camera rewrite, and the triangulated model as
   evidence. No artifact may say validated before this passes.
2. **Field/Core Image materialization probe:** capture a known off-centre raster
   through the real Field `.oriented(.right)` HEIC path. Prove its pixel mapping,
   metadata/dimensions, and the box decoder/materializer result. Source inspection
   and synthetic projection math do not close this gate.
3. **Real geometric proof:** run read-only/local scratch refinement on the
   already-confirmed inputs for `95266be1`; validate registration coverage,
   same-track reprojection RMSE, verified-loop relative-pose consistency, shape
   diagnostic, runtime/VRAM, and any available anchor error before/after. An
   unchanged comparable evidence set does not pass; shape change itself is not
   an acceptance input. No DB/storage write.
4. **Handler tests:** add queue replay tests for a crash between fork enqueues,
   same-version duplicate tasks, create-only storage races, transient deadline,
   permanent low overlap, and proof that Refine cannot mark Present ready.
5. **Artifact consumer/join contract:** Fuse and Splat must read the same aligned
   pose schema/checksums; mesh solve-upgrade must publish its durable manifest;
   Present replay/order/race tests must prove canonical four-manifest derivation
   and single JSON/status composition before the fork is enabled.

Until those gates pass, `global_mapper` may be benchmarked as an optional
diagnostic, but it must not replace the full-pose primary or be described as a
known-pose warm start.
