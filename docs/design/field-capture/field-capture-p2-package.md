# Field Capture · P2 Build Package — "Presence"

Issued 2026-07-18 · Design authority → Claude Code · **Pre-ruling draft for Kody's session**
Companion artifacts: `patina-field-capture-architecture.html` (the SC deck — SC-05 thesis, SC-10 reconstruction, SC-11 the Room File, SC-15 the P2 gate), `field-capture-p1-package.md` (the shipped P1 order), `scan-pipeline-worker-design.md` (the worker plumbing; §10 is P2's growth stub), `capture-bundle-spec-v1.md` (the evidence P2 consumes). The deck is the system definition; this package is the build order. **If they conflict, this package wins for P2 scope.**

This document is the **agenda for a ruling session**, not a record of one. P1 shipped after its six rulings were made (R108, appended as Part A of the P1 package). P2's rulings do **not** exist yet — the open questions in Part B are framed with a recommendation each, the way the P1 interview ran. Once Kody rules, the answers append as **R113** via `append_entry.py` (resolve the next `R{n}` from `workstream_state.py`, let the script rewrite the integrity footer — never edit the ledger by hand). No ruling text is pre-filled here.

**Where P1 stands (I85, 2026-07-18):** P1 build is complete, items 1–13 shipped and adversarially reviewed; the first full production run cleared Kody's box in ≈13 s compute (ingest → solve → drawings → delivery); `room_files` v1 generated for scan `95266be1` with an honest certificate (all 3 short-span anchors flagged/excluded, RMS 133.6 mm, 24 dimensions measured ±11%, zero verified). M4 (Leah's device build + flag + pilot day) is the one open P1 gate — **operational, not a build blocker for P2**. See Part F.

---

## Part A — Scope statement, stated once

**P2 delivers presence: the room she steps into, and the mesh she measures.** It turns the P1 evidence bundle — already on the box, already checksummed — into (1) a drift-corrected, dense, *measurable* mesh, and (2) a photoreal splat walkthrough in the portal, with click-to-measure rays that hit the hidden mesh and a pinned photo/context registry on both the plan and the walk. It is the deck's **Present Layer** (SC-11) landing on top of P1's **True Layer**, under one truth (SC-05: *the splat is what she sees, the mesh is what she measures*).

P2 is **server + portal + GPU-box** work. iOS is **untouched at P2 start** (see Part B, keyframe cadence) — the P1 capture rig already writes everything P2 needs. That is the single most important scoping fact: P2 does not re-open the long iOS pole.

**In P2 (SC-10 steps 1, 3, 4, 5 + SC-11 Present Layer):**
- **(a) Pose refinement** — SfM / bundle adjustment warm-started from the ARKit trajectory (the drift killer, SC-13: 1–2 % → ~0.2–0.5 %).
- **(b) Dense fusion** — TSDF over the refined depth → a dense, measurable mesh of the actual room.
- **(c) Parametric re-fit against dense evidence** — re-measure walls, openings, and **true ceiling planes / slopes** against the mesh; upgrades P1's corner-height chord synthesis (R111.2) to real geometry. Keep RoomPlan's semantics, replace its geometry.
- **(d) Splat training** — 3D Gaussian splatting → a compact web format.
- **(e) The portal walkthrough viewer** — plain three.js (the R107 discipline — **no react-three-fiber**), browser-native splat rendering, click-to-measure rays against the hidden dense mesh.
- **(f) The pinned photo / context registry** on the plan and the walkthrough.

**Not in P2 unless Kody rules otherwise (P3, SC-15):** multi-room structures / capture-to-spec continuity; designer-taught finish & fixture tagging seeded by corrections (the learning loop). On-device splat *preview* stays out per R108.3 (see Part B.1). DISTO BLE stays out per R108.1.

**The P2 gate (SC-15):** *a maker quotes from the Room File without a site visit.*

---

## Part A′ — Technology survey & recommendations

The deck named its stack in **draft, 2026-era** (SC-10/SC-11/SC-16 SOURCES: COLMAP, nerfstudio splatfacto / gsplat, Niantic SPZ, Spark). Each was re-checked against the 2026 state of the art below; the currency verdict is stated per line. All library/pipeline picks are **bless-class** (Part C) — logged, reversible, designer-invisible.

### (a) Pose refinement — **recommend GLOMAP**, COLMAP incremental (pose-prior) as the proven fallback

The deck said "COLMAP-class, fast because it starts warm." That instinct is right; the specific engine has moved on.

- **✅ GLOMAP** (ECCV '24, "Global Structure-from-Motion Revisited", from the COLMAP authors) — **the recommendation.** Global SfM: solves camera translations and 3D points in one global step instead of COLMAP's incremental Gauss-Newton loop, so it is **1–2 orders of magnitude faster** (~3.5× in the common case) at **on-par or better accuracy** (+~8 % recall, +8–9 AUC pts). It reuses COLMAP's mature feature-extraction + matching front-end and the **same database format**, so it slots straight onto a warm ARKit start (known intrinsics, ~200–400 keyframes, a single-room loop). VRAM-light on an 11 GB 2080 Ti: SIFT feature extraction runs on the GPU; the global solve is CPU/RAM-bound. Rationale: fastest path to the SC-13 drift residual at room scale, minimal integration risk (COLMAP-compatible), and it directly consumes the P1 bundle.
- COLMAP incremental with the **pose-prior mapper** — the conservative fallback; the exact "COLMAP-class" the deck named. Slower, but battle-tested, and the natural degrade if GLOMAP's rotation/translation averaging destabilizes on a sparse single-room loop.
- FastMap (arXiv 2505.04612, 2025) — first-order, GPU-accelerated, up to ~10× faster than COLMAP/GLOMAP at comparable accuracy; newer, less proven — a watch-item, not a pilot dependency.
- VGGSfM / deep SfM — learning-based, heavier VRAM, overkill for warm-started room-scale.

### (b) Dense fusion — **recommend TSDF volumetric fusion** (Open3D-class), decimated glb for the browser

No survey drama here — TSDF over refined depth+poses is the deck's call (SC-10 step 3) and the standard. Bless-class parameter picks (voxel size, truncation, decimation target). Two outputs: a full dense mesh (measurement source of truth, server-side) and a **decimated, watertight-ish web mesh (glb)** small enough to ship to the browser as the invisible raycast target for click-to-measure. True ceiling planes/slopes fall out of the fused mesh — the upgrade R111.2 flagged as P2.

### (c) Parametric re-fit — **recommend mesh-aware re-measure, `source='mesh'`**

The P1 anchor-solve fits scale against typed anchors and measures the RoomPlan graph (`source='parametric'`/`'estimated'`). P2 re-measures walls, openings, and true ceilings against the **dense mesh**, emitting measurements with `source='mesh'` and tighter `tolerance_mm`. The anchor discipline is unchanged: `'verified'` still requires an anchor (`rfm_anchor_source_shape`), so mesh evidence tightens `'measured'`, it does not manufacture `'verified'`. This is where retroactive re-solve lives (Part B.3).

### (d) Splat training — **recommend gsplat / splatfacto with a bounded (MCMC-cap) densification**, export SPZ

- **✅ gsplat (nerfstudio) + splatfacto** — **the recommendation, and still current in 2026.** gsplat is the mature CUDA rasterization substrate; splatfacto is the pipeline harness on top. The advance since the deck is **not** a new engine — it's the **densification strategy**: a **Gaussian-count-capped / MCMC** strategy (available in gsplat) gives a **predictable VRAM ceiling and a predictable time budget**, which is exactly what an 11 GB Turing card needs. The deck's "~10–20 GPU-minutes/room" holds; the cap makes it *bounded* rather than hopeful.
- 2025 training accelerators are real and drop-in-adjacent — FastGS (train in ~100 s, 2–7× accel), Taming-3DGS / DashGaussian (densification schedulers), GS-Scale (CPU host-offload for VRAM-limited GPUs — the escape hatch if a big room blows 11 GB). Adopt as tuning, not as a rewrite.
- **Compact web format: ✅ SPZ (v4).** The deck named SPZ; it is **current** — SPZ 4 (2025, Niantic Spatial) compresses faster, handles bigger scenes, adds vendor extensions; "JPG for splats," ~10× smaller than PLY. Recommend SPZ 4. One-line alt: **SOGS / SOG** (Self-Organizing Gaussians, ECCV '24; PlayCanvas SuperSplat exports it) — higher compression + progressive load, heavier decode; hold as a format upgrade if SPZ payloads strain the mobile budget.

### (e) Browser walkthrough viewer — **recommend Spark on plain three.js**, mkkellogg GaussianSplats3D as fallback

Hard constraint from **R107 (Room View, the shipped precedent):** the orbit viewer is **plain three.js** — `@react-three/fiber@8 × React 19` crashes, so **no react-three-fiber** anywhere in P2.

- **✅ Spark (`sparkjsdev/spark`)** — **the recommendation, and the deck's draft pick ("Spark / Three.js").** An advanced 3DGS renderer *built for three.js*, WebGL2, **mobile-first** (small payloads, battery-aware — Leah opens this on her phone, SC-11), **native SPZ** (also reads ply/sog/splat/ksplat). It integrates as ordinary `THREE` objects (a `SplatMesh` you add to a `THREE.Scene`) — imperative, fiber-free, exactly the R107 mount discipline. It is the WebGL2 path the deck sketched.
- mkkellogg **GaussianSplats3D** (`.ksplat`) — the most popular three.js splat renderer; mature; the fallback if Spark's bundling misbehaves under the OpenNext/Workers build. Costs an SPZ→ksplat conversion at delivery.
- PlayCanvas SuperSplat / engine — strong playback but a *PlayCanvas* engine, not three.js — off-target for a three.js portal; use only as an authoring/inspection tool.

**The two-layer scene is the whole point (SC-05):** the visible **Spark `SplatMesh`** (what she sees) plus an **invisible three.js `Mesh`** loaded from the decimated dense mesh (what she measures). Click-to-measure raycasts against the invisible mesh only; the splat is never a measurement surface.

### (f) The registry — **recommend reusing the R107 orbit photo-marker precedent**

R107 already ships plain-three.js photo markers on the orbit view; item-12 already resolves capture context via the **real flat dotted-key provenance contract** (`field_captures.provenance @> '{"siteScanContext.scanId":"…"}'`). P2 pins those same context items as 3D markers in the walkthrough and on the plan — reuse, not invention.

**State-of-the-art check performed 2026-07-18** (web): GLOMAP/FastMap SfM; FastGS/GS-Scale/Taming-3DGS training; SPZ 4 + SOGS formats; Spark/GaussianSplats3D/SuperSplat renderers. The deck's draft names hold up — SPZ, gsplat, Spark are current; the one substantive move is **GLOMAP over incremental COLMAP** for pose refinement. Sources footnoted at the end.

---

## Part B — Open questions for Kody's rulings

Each is framed with a recommendation. These are the SC-16 leftovers plus the new P2 forks. Ruled answers append as R113.

**B.1 — On-device splat preview vs server-only.** SC-16's open question; R108.3 already ruled *no on-device splat training* for P1 (the on-site question is coverage, answered by the QA mesh gate; Metal training buys neither pillar). Scaniverse proves a ~1-minute phone splat is *possible*. **Recommendation: hold server-only for P2.** A phone preview is a different, lower-fidelity artifact that doesn't feed the measurable deliverable and re-opens the Metal-training cost R108.3 closed. Re-open only on field evidence that designers want on-site gratification. *(No iOS work → protects the P2-start "iOS untouched" property.)*

**B.2 — Splat quality/time budget per room on the 2080 Ti.** The deck says ~10–20 GPU-min. **Recommendation: ratify a ≤10-minute wall-clock target for the full GPU chain (refine + fuse + splat) at pilot quality, with a bounded Gaussian cap (MCMC) so VRAM and time are predictable on 11 GB; amber past ~20 min, and GS-Scale host-offload is the escape hatch for an over-budget large room.** This is a number to nail down because it sets the cap and the cloud-burst economics (B.6).

**B.3 — Does pose refinement upgrade existing P1 measurements retroactively, or new scans only?** The P1 bundle already carries the evidence P2 needs (keyframes + depth + poses + mesh.ply — spec §3/§4), so an existing `room_scans` row can be re-run through refine → fuse → mesh-aware solve, minting `room_files` v+1 with `source='mesh'` and tighter tolerances (per R-f, a re-solve mints a new version — the schema already supports it). **Recommendation: retroactive re-solve is IN — but as an explicit, operator/enqueue-triggered action, not an automatic sweep.** Rationale: Kody's own `95266be1` (RMS 133.6 mm, 24 dims ±11 %, zero verified) is the ideal first retroactive subject and the M2 proof; but auto-re-solving every historical scan is a cost + surprise-versioning event. Ruling needed: which existing scans get re-solved, and on whose button. *(Note: short P1 anchors cap how much a re-solve can tighten `'verified'` — mesh evidence upgrades `'measured'`, the long-span coach is what earns `'verified'` on the next capture.)*

**B.4 — Keyframe cadence / count changes if SfM wants more.** P1 fires 200–400 keyframes (0.5 m / 15°, sharpness-gated); GLOMAP warm-started is happy with that — it needs *well-distributed, sharp, overlapping* frames, not *more* frames, and the bundle budget (300–600 MB) + capture time (≤12 min) are already tight. **Recommendation: no cadence change for P2 start; validate at M2 against real refine output, and if regions come back under-constrained, tighten the coverage coach / sharpness gate rather than raise the raw count.** *(Keeps iOS untouched — the reason this is the recommendation, not just the default.)*

**B.5 — The Leah-walk timing (carried).** P1's M4 (Leah retires the tape for one real project) is still open — operational only (device build + flag + pilot day, m4-pilot-checklist.md, I85). **Recommendation: land the P1 Leah pilot before or in parallel with P2-M1/M2 server work, and do not gate P2-M4 (the maker quote) on it** — the two gates test different pillars (drawings-trust vs presence-for-quoting) and the P2 GPU/portal build has no dependency on Leah's P1 pilot completing. Ruling: is the P1 Leah pilot a hard predecessor to *starting* P2, or can server-side P2-M1/M2 begin now against Kody's box and prod bundle?

**B.6 — Cloud-burst posture for GPU stages.** R108.4/R109.1's contract — *a cloud worker is a config change, not code; flip trigger = the first non-Leah designer in production* — now meets a real GPU workload (unlike P1's CPU stages, which cost nothing inside existing infra, a GPU burst instance costs money per room). **Recommendation: keep the config-not-code contract unchanged — the burst GPU worker is the same package with the `[splat]` extras, `GPU=auto`, `STAGES=refine,fuse,splat` on a rented cloud GPU (L4 / A10 / 4090-class) — but add a cost ceiling to the flip:** document the burst instance class + a per-room GPU-cost estimate, keep the pilot on Kody's 2080 Ti box, and defer actual cloud provisioning until the flip trigger fires *and* the per-room cost is ruled acceptable. Ruling: confirm the flip trigger stays "first non-Leah designer," and set (or defer) the per-room GPU-cost ceiling.

---

## Part C — Authority notes (bless vs escalate)

Same split as P1 (the P1 package's authority note + spec §11): the question is *would a designer or a maker notice?*

**Claude Code blesses** (code-only; log as I-entries with rationale): the SfM engine (GLOMAP) and its fallback; the fusion method + voxel/truncation/decimation params; the splat trainer (gsplat/splatfacto) + densification cap + SPZ export; the renderer *library* (Spark) as an implementation substrate; task-stage names (`scan_pipeline.refine/fuse/splat`); migration numbering; artifact packaging, storage prefixes, and MIME transport; worker `STAGES` / extras layout; GPU scheduling and cache confinement; transient-frame masking mechanics.

**Claude Code escalates** (designer/maker-visible): the walkthrough page layout and camera behavior; the **measure-tool interaction and its wording** (how a distance is invoked, shown, and labeled); how a measured readout reconciles to the tolerance badge triad (`verified / measured ± x / estimated`); the **registry presentation** (marker look, what a tap reveals, plan↔walk linkage); any splat quality-vs-load tradeoff the designer *perceives* (visible artifacting, load spinner behavior); how mesh/splat visual disagreement is surfaced; the SLOPED/true-ceiling labeling change in drawings. Portal surfaces follow the brand grain: typography-first, **no box shadows on content** (D4). These are decided at the M3 slice review against screenshots and a live scene, not settled here.

---

## Part D — Additive-schema sketch

Additive only; no modification of existing behavior. 00341 is **deployed to Strata** (I85), so every change is **fix-forward in a new numbered migration**, catalog-guarded (the 00373 idiom) so it is a no-op where already-final. Numbers below are illustrative from the write-time head — **verify free across main + all branches at the moment each file is written** (patina-db-migrations): main head is **00373**; a parallel `field-site-request` branch already holds a colliding `00373` and an `00375`; **00365–00369 remain the BOH soft reservation**. P2 therefore mints from **00376**, re-checked at write time.

### D.1 — No migration needed (the schema already anticipated P2)
- **Task-type namespace is open** (`agent_tasks.task_type` has no CHECK, worker-design §2.1) → `scan_pipeline.refine`, `scan_pipeline.fuse`, `scan_pipeline.splat` need **zero DDL**. They are new `STAGES` values, claimed by config alone (§10).
- **Storage: no new bucket** (R-e). P2 deliverables land under the existing versioned prefix `room_file/{userId}/{scanId}/v{version}/…` (worker-design §5.2) — the 00287 designer-read RLS already resolves it. New filenames: `scene.spz`, `dense_mesh.glb` (or `.ply`), `measure_mesh.glb`. **MIME: no bucket migration** — `model/gltf-binary` and `model/ply` are already in the 00077 allow-list; SPZ transports as `application/octet-stream` (the B-17 semantic-vs-transport split), its semantic type recorded in `room_files.present`.

### D.2 — `00376_field_capture_p2_present_schema.sql` (additive tables/columns/CHECKs)
- **`room_file_measurements.source` CHECK → add `'mesh'`** (dense-fusion evidence). Was `IN ('anchor','parametric')` (00341, R-d) → `IN ('anchor','parametric','mesh')`. `tolerance_class` unchanged — mesh evidence tightens `'measured'`; `'verified'` still requires an anchor (`rfm_anchor_source_shape` holds untouched).
- **`scan_pipeline_events.stage` CHECK → add `'refine','fuse','splat','present'`.** Was `IN ('capture','upload','ingest','solve','drawing','delivery')` (00341). `event` stays free-form (new instrumentation needs no migration).
- **`room_files` Present-Layer columns** (append-only deliverable, R-f; mirrors the P1 `drawings jsonb` precedent):
  - `dense_mesh_url text` — the measurement-grade fused mesh (server/derived pointer).
  - `measure_mesh_url text` — the decimated glb the browser raycasts against.
  - `splat_url text` — the SPZ walkthrough asset.
  - `present jsonb NOT NULL DEFAULT '{}'` — Present-Layer manifest: `{ splat_format:'spz4', gaussian_count, train_seconds, vram_peak_mb, mesh_vertices, refine_engine, sfm_residual_pct, masked_frames }`.
  - `present_status text CHECK (present_status IN ('pending','refining','fusing','training','ready','error'))` — the Present-Layer lifecycle, **independent of `status`** (the True-Layer/drawings lifecycle), so drawings can be `generated` while the splat is still training.
  - `presented_at timestamptz`.
  - Column adds inherit table grants (no GRANT change → legacy-grants seed unaffected).

### D.3 — `00377_scan_pipeline_present_query_surface.sql` (view redefinition)
- **`CREATE OR REPLACE VIEW scan_pipeline_runs`** (00372) → add `refine_ms` / `fuse_ms` / `splat_ms` (from `refine.succeeded` / `fuse.succeeded` / `splat.succeeded` events) and `present_status`. Keep the SECURITY DEFINER + admin-domain WHERE gate.
- Optional **`scan_present_stats`** view — per `room_file`: gaussian count, SPZ + mesh byte sizes, train seconds, VRAM peak — for the GPU-budget telemetry (item 11). SECURITY DEFINER, admin-gated, `GRANT SELECT … TO authenticated` (adds a GRANT → **regenerate the legacy-grants seed**, `scripts/generate-legacy-grants.py`, as 00372 did).

### D.4 — Versioning semantics for Present-Layer artifacts
A P2 run is the **same `room_file` version** as its drawings — one version carries both layers (True: `svg/pdf/dxf/drawings`; Present: `dense_mesh/measure_mesh/splat/present`). A **retroactive re-solve** (B.3) of an existing scan mints **v+1** per R-f — a fresh `room_files` row with mesh-sourced measurements and a new Present Layer. The entry-point version allocator (00370) and the `UNIQUE(scan_id, version)` guarantee are unchanged; the P2 chain just enqueues more stages against the reserved version.

---

## Part E — The numbered plan, with gates

Sequence with hard review stops in the P1 style. Per-item ACs are concrete and testable, and respect the box realities from **I85** (install.sh copy-semantics; XDG/CUDA cache confinement; CUDA deps in `[solve]`/`[splat]` extras; `STAGES` config).

### Sequence gates
- **P2-M1** after items 1–2: **pipeline-stage specs + schema review.** No GPU stage code beyond a skeleton until M1 passes.
- **P2-M2** after item 6: **first refined + fused mesh from Kody's existing prod bundle (`95266be1`), mesh-aware re-solve accuracy compared against the P1 certificate.**
- **P2-M3** after item 9: **first splat walkthrough in the portal on Kody's room, with click-to-measure against the hidden mesh** (item 8 = the render sub-checkpoint inside it). Slice review against screenshots + a live scene (escalate-class UX ruled here).
- **P2-M4** after item 12: **the maker-quote pilot — the P2 gate (SC-15).**

### The items

**1 · Audit + P2 stage spec (build nothing first).**
Audit prod state: the deployed P1 worker (`services/scan-pipeline/`); what evidence real prod bundles actually carry (probe `95266be1` and any Leah pilot scans for keyframes/depth/`mesh.ply` presence + sha256); Kody's GPU box readiness (the I85 box, driver/CUDA); the R107 Room-View plain-three.js orbit + photo-marker code (the walkthrough reuse target); the item-12 Room File page (the extend target). Then write the P2 stage contract into `scan-pipeline-worker-design.md` §10 → full stage specs (refine/fuse/splat I/O, VRAM + time budget, artifact outputs, failure classes). *AC:* a written audit I-entry (found/absent per area with file paths); §10 becomes a complete stage spec, not a stub; pre-emptions flagged before item 2. **P2-M1 gate = this spec + item 2 reviewed.**

**2 · Additive migrations + storage/kind extension (00376+).**
Part D, minted from the verified-free head. *AC:* `pnpm supabase:reset` applies clean; `source` accepts `'mesh'` and rejects garbage; `stage` accepts `refine/fuse/splat/present`; the `room_files` Present columns + `present_status` CHECK exist; a re-run against an existing version is idempotent; `pnpm db:generate` regenerates `database.types.ts` with no hand edits; catalog-guarded clauses are no-ops on an already-final schema. Reviewed at **M1**.

**3 · Worker packaging: GPU extras + box hardening (I85-respecting).**
`pyproject` optional extras — `[solve]` (pycolmap / GLOMAP bindings-or-CLI, numpy/scipy) and `[splat]` (torch cu-xx for Turing SM 7.5, gsplat, SPZ tooling) — so a CPU-only worker never pulls CUDA. Extend the XDG/cache confinement (I85 finding 3) to the CUDA/torch surfaces (torch hub, CUDA JIT/kernel cache, matplotlib, nvidia caches) under `APP_DIR` via `ReadWritePaths`. A GPU systemd unit variant: `DeviceAllow` for `/dev/nvidia*`, **no** `PrivateDevices`, GPU cache dirs writable. `doctor` treats GPU as **required** when `STAGES` includes a GPU stage (nvidia-smi + torch/CUDA import + every cache dir writable), warning otherwise. Document the **re-run-`install.sh` upgrade path** (I85 finding 2: a COPY pip-install means `git pull` alone never updates a running worker) and add an `install.sh --upgrade` that rebuilds the venv. *AC:* on Kody's box, `install.sh` + `[splat]` → `doctor` green including GPU and all cache dirs; a CPU-only worker with default `STAGES=ingest,solve,drawings` stays green (GPU absent = warning); a deliberate `git pull` without re-install is proven **not** to change worker behavior, and `--upgrade` is proven to; a second worker (`WORKER_ID` distinct) claims disjoint GPU tasks by config alone.

**4 · Stage `scan_pipeline.refine` — SfM/BA pose refinement.**
GLOMAP warm-started from the bundle's ARKit poses + intrinsics over the keyframes; outputs refined poses + a sparse cloud + per-frame pose deltas into scratch/derived storage; COLMAP-incremental (pose-prior) fallback behind config. GPU-bound; runs on the box. *AC:* on `95266be1`, refine completes inside the ratified GPU-minute budget (B.2); refined-trajectory drift vs raw ARKit is reported (target ~0.2–0.5 %, SC-13); `refine.*` telemetry (residual, iterations, duration, VRAM); a low-overlap / degenerate room fails **permanent** (`p_fatal=true`), never hangs the lease.

**5 · Stage `scan_pipeline.fuse` — TSDF dense mesh + web mesh.**
TSDF over refined depth+poses → dense mesh; decimate to a browser-sized `measure_mesh.glb`; extract true ceiling planes/slopes. *AC:* dense mesh + decimated glb produced and stored under `room_file/…/v{version}/` with sha256 recorded; `measure_mesh.glb` under the browser size budget; ceiling plane/slope surfaces present where the geometry supports them (verbatim, not chord-synthesized); `fuse.*` telemetry.

**6 · Stage: solve upgrade — mesh-aware re-fit, `source='mesh'`, true ceilings.**
Widen the P1 anchor-solve to re-measure walls/openings/ceilings against the dense mesh; emit `room_file_measurements` with `source='mesh'` + tightened `tolerance_mm`; replace the R111.2 corner-height chord synthesis with true ceiling geometry where present; UNVERIFIED / anchor discipline unchanged. *AC:* on `95266be1`, mesh-sourced dimensions replace the P1 `parametric`/`estimated` ones where evidence supports; the certificate shows the source shift and the tolerance change **honestly** (tightening where anchors/geometry allow, no false precision under the short P1 anchors); `rfm_anchor_source_shape` still holds; the re-solve mints `room_files` v+1 (the retroactive path from B.3, proven end-to-end). **P2-M2 gate = first refined+fused mesh + accuracy vs the P1 certificate.**

**7 · Stage `scan_pipeline.splat` — Gaussian training → SPZ.**
gsplat/splatfacto from refined poses + keyframe images; **Gaussian-count-capped (MCMC)** densification for the 11 GB / time budget; export **SPZ 4**; transient masking of people/pets (SC-14) — flagged frames excluded, never silently used. A parallel branch off `fuse` (needs refined poses + images, not the drawings). *AC:* splat trains inside the ratified per-room budget (B.2) on the 2080 Ti; the SPZ loads in the item-8 renderer; masked frames are excluded and logged; `splat.*` telemetry (`gaussian_count`, `train_seconds`, `vram_peak_mb`); `scene.spz` under `room_file/…/v{version}/`, sha256 recorded; `room_files.present` + `present_status='ready'` written.

**8 · Portal: the walkthrough viewer (plain three.js, Spark, NO fiber).**
Mount a Spark `SplatMesh` in a **vanilla three.js** scene (the R107 discipline — imperative mount, no `@react-three/fiber`); load the SPZ; overlay the invisible `measure_mesh.glb` as a hidden `THREE.Mesh`; orbit + first-person camera; mobile-capable. *AC:* renders Kody's room SPZ at interactive FPS on desktop **and** a phone (SC-11); a static check confirms **zero** react-three-fiber imports in the P2 portal code; the hidden mesh loads but never renders; a console/Playwright probe confirms a WebGL2 context and no fiber reconciler on the page.

**9 · Portal: click-to-measure.**
Raycast clicks against the hidden dense mesh only; two-tap distance readout in ft-in (the drawings unit, spec §5); the readout reconciles to the certificate tolerance for that region and wears the badge triad; escalate-class wording. *AC:* two clicks on a known span return a distance within that span's published tolerance of the certificate value; the readout carries the correct `verified/measured/estimated` badge; the tool provably never hits the splat. **P2-M3 gate = walkthrough render (item 8) + measure, on Kody's room, reviewed against screenshots + a live scene.**

**10 · Portal: the pinned photo/context registry on plan + walkthrough (SC-11).**
Extend item-12's provenance-resolved context (the real flat dotted-key contract, `provenance @> '{"siteScanContext.scanId":"…"}'`) to **3D markers pinned in the walkthrough at their capture pose** (reuse the R107 orbit photo-marker precedent) and on the plan; tap a wall / marker → its photos + voice note. *AC:* a keyframe / detail photo / voice note captured during the scan appears as a marker in the walkthrough at its pose **and** on the plan; tapping opens it; the resolve uses the containment contract with the **GIN index on `field_captures.provenance`** applied first (carried from the R112 ledger — required before inbox scale, and this is the surface that scales it).

**11 · Telemetry + present-layer query surface.**
Land D.3: `scan_pipeline_runs` gains `refine_ms/fuse_ms/splat_ms + present_status`; `scan_present_stats` gives the GPU-budget + artifact-size distribution; the end-to-end one-scan timeline now spans all P2 stages. *AC:* the full P2 chain for one scan reads in `created_at` order including `refine/fuse/splat/present`; GPU-minute + SPZ/mesh size + gaussian-count distributions are queryable; both surfaces are admin-gated per the 00372 idiom and certified non-leaking to a non-admin / service-role caller.

**12 · The maker-quote pilot.**
Put the finished Room File (True + Present layers) in front of a real maker to quote a real piece **without a site visit**. A runbook mirroring `m4-pilot-checklist.md` — prod prerequisites, pilot-day walk against SC-15, rollback lines, owed-items ledger. *AC:* a maker produces a quote from the Room File alone; every dimension the quote relies on is inside its published tolerance; zero site re-visit caused by missing information. **P2-M4 gate — the P2 gate.**

---

## Part F — Carried ledger

**The P2 ledger from R112, verbatim** (there is no R113 yet — the next ruling id is this session's; R112 is where the "P2 ledger" was recorded at P1 build-complete). Each item is slotted or parked:

> *co-designer drawing-download walk before shared access ships* — **parked** (P1 sharing/RLS follow-up; not a P2-presence dependency, revisit with the maker-share surface at item 12).
> *A3 deep-link gap on shared Room File links* — **parked** (P1 deep-link defect; carry into the item-8/12 portal work if shared walkthrough links reopen it).
> *GIN index on `field_captures.provenance` at inbox scale* — **slotted into item 10** (the registry is the surface that reaches inbox scale; the index is its precondition).
> *voice-note audio seam* — **slotted into item 10** (the registry surfaces voice notes; the audio playback seam lands with it).
> *background-upload device edges* — **parked** (iOS P1 device-hardening: airplane-mode resume, 500 MB unattended completion, background-relaunch rehydration — R110's carried edges; not P2-server scope).
> *sharpness calibration* — **parked, with an M2 trigger** (iOS; only re-open if item-4 refine shows under-constrained regions — B.4).
> *associative DXF dimensions* — **parked** (P1 drawings polish; not presence scope).

**From I85 — the open P1 tail:** *M4 remaining — Leah's device build + flag, pilot day per `m4-pilot-checklist.md`.* Timing ruled in **B.5** (recommend: run in parallel; not a hard predecessor to P2 server-side start).

**Parked garbage (I85), no action:** the failed task for `fa361ed4` (abandoned pre-MIME-fix upload, no manifest) stays failed; 7-day retention reaps its partial objects.

---

## The kickoff line

> Read `docs/design/field-capture/field-capture-p2-package.md` and the SC deck beside it, rule the six B-questions (they append as R113), run the item-1 audit against Kody's box and prod bundle `95266be1`, and stop at P2-M1 — pipeline-stage specs and schema review — before writing any GPU stage code.

---

*Sources (state-of-the-art check, 2026-07-18): GLOMAP — "Global Structure-from-Motion Revisited," ECCV '24 (arXiv 2407.20219); FastMap (arXiv 2505.04612). Training — FastGS (arXiv 2511.04283), GS-Scale (arXiv 2509.15645), nerfstudio gsplat / splatfacto. Formats — Niantic SPZ 4 (nianticspatial.com/blog/spz4); Self-Organizing Gaussians / SOG, ECCV '24 (fraunhoferhhi.github.io/Self-Organizing-Gaussians). Renderers — Spark (github.com/sparkjsdev/spark); mkkellogg GaussianSplats3D; PlayCanvas SuperSplat. Plus the deck's SC-16 SOURCES (Apple RoomPlan/ARKit, Canvas/Trimble, Polycam, Niantic Scaniverse, LiDAR accuracy studies).*
