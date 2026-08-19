# The Rendered Room — Scan Processing Pipeline v2

> **Status:** proposed, not ruled · **Date:** 2026-08-18 · **Companion presentation:** `the-rendered-room.html` (same folder) · **Responds to:** `ARCHITECTURE.md`
>
> **Revised 2026-08-18:** GPU stages ruled onto Modal; storage/read paths re-targeted to the Workers + R2 architecture (phase1-close). Delivery sequencing in `DELIVERY-PLAN.md`.

---

## 1. Where we are today (verified)

Patina already runs a scan-to-CAD pipeline end to end. It was not built to the spec in `ARCHITECTURE.md`; it was built to the Supabase spine, and it works. Before proposing anything, the honest inventory.

### Capture

Both iOS apps — Patina (client) and Patina Field (designer/trades) — produce the same **schema-v3 scan bundle**. A single walk yields:

- `captured_room.json` — the parametric `CapturedRoom`, serialized through its `Codable` conformance. Walls, doors, windows, openings, objects, each with dimensions, a `simd_float4x4` transform, and a category.
- `scan.usdz` — the RoomPlan export.
- `mesh.ply` — written from accumulated `ARMeshAnchors`. This matters and is easy to misread: it is a **reconstructed mesh**, not a raw `sceneDepth` point cloud. It has already been fused and triangulated by ARKit's scene reconstruction.
- `depth.zip` — sceneDepth frames at roughly 1 Hz, the actual raw-depth record.
- `world_map.arworldmap` — for relocalization and re-entry.
- Posed HEIC photos, each carrying its camera transform and intrinsics.
- A coverage heatmap, annotations, and `manifest.json`.

The load-bearing files: `apps/mobile/Patina/Patina/Features/Walk/Services/RoomCaptureService.swift`, `.../Walk/Services/ScanBundleWriter.swift`, `apps/mobile/Patina/Patina/Features/Walk/Models/ScanManifest.swift` (schema v3), `apps/mobile/Patina/Patina/Services/Sync/ArtifactUploader.swift`.

### Storage

Private Supabase bucket `room-scans`, keyed `{folder}/{userId}/{roomId}/{file}`. No R2 for scans. No presigned client uploads: the device authenticates with its JWT and PUTs directly, switching to a background `URLSession` above a 5 MB threshold.

### Server processing

`services/scan-pipeline` — a Python worker on a systemd box, claiming work from the `agent_tasks` Postgres queue. (Platform rule, not preference: `agent_tasks` is the queue. There is never a parallel one.) Three stages, in `src/patina_scan_worker/stages/`:

1. **`ingest`** — bundle validation, checksums, untar, storage acquisition.
2. **`solve`** — parses the parametric model into metres, fits scale against typed ground-truth `scan_anchors`, and classes every single dimension as **verified**, **measured**, or **estimated**. Writes `room_file_measurements` and an accuracy certificate.
3. **`drawings`** — a plan and four elevations, hand-built as SVG (`drawing/svg.py`), rasterized to PDF through cairosvg (`drawing/pdf.py`), and written to DXF through ezdxf targeting **R2010**, in inches, on layers walls / openings / dimensions / text (`drawing/dxf.py`).

The output is the **Room File** — versioned and append-only, `room_files` with `UNIQUE(scan_id, version)`. Telemetry lands in `scan_pipeline_events`.

### Edge lanes

Deno functions swept by pg_cron, each billing-guarded:

- `parse-room-scan` — geometry rows for the portal.
- `convert-room-scan-glb` — USDZ → GLB via the aesthete-inference Cloudflare Container.
- `derive-scan-photo-media` — HEIC → JPEG derivatives at 512 and 1600.

### The parked engine

A COLMAP 4.0.2 pose-refinement engine lives in scan-pipeline (fifteen `refine_*` modules with matching test files). It is deliberately unregistered and fail-closed — P2 work, built and shelved.

### The portal

This is the gap, and it is the reason for this document.

Room View renders a hand-rolled SVG plan (`apps/designer-portal/src/components/document/rooms/room-view/plan-stage.tsx`) and a **synthetic** reconstruction called Orbit (`.../room-view/orbit/`) — plain three.js, BoxGeometry walls extruded from the measured numbers. It is a diagram of the solve output. It loads no model file at all. Alongside it, the scan photos.

The Room File page offers SVG, PDF, and DXF as **downloads only**. Nothing renders inline. We generate a beautiful plan drawing and then hand the designer a file to open somewhere else.

And there is a live defect. A legacy react-three-fiber GLTF viewer at `apps/designer-portal/src/components/rooms/viewer/` crashes under React 19 (fiber@8 against React 19 — the known incompatibility). In the designer portal it is dead code behind ErrorBoundaries. The **client portal still ships it, with no scan-specific fallback** — no ErrorBoundary/ScanStill degrade like the designer portal's — so a crash falls through to the route's generic error page: `apps/client-portal/src/components/scans/ClientViewerCanvas.tsx`. A client who opens a shared scan hits it. This proposal folds the fix in.

---

## 2. The outside recommendation, audited

### What it proposes

`ARCHITECTURE.md` describes a scan-to-CAD system in three fidelity tiers, orchestrated on Cloudflare.

**Tier 1** runs on-device: `CapturedRoom` walls → centerlines → mitered corners → a hand-written R12/AC1009 DXF, no server involved. **Tier 2** is the default server path: a raw PLY point cloud into a CPU pipeline inside a Cloudflare Container — voxel downsample, normals, outlier removal, Y-up→Z-up rotation, iterative RANSAC plane extraction, classify by normal, reject furniture by vertical extent, find the dominant grid angle by 90°-circular statistics, snap walls to axes and merge collinear fragments, assemble the room as a corner-graph cycle, and offset ±half-thickness through Shapely into an ezdxf DXF. **Tier 3** escalates to a GPU host — a RoomFormer/PolyRoom-class transformer over a rasterized density map, with a classical scikit-image contour backend as the weightless fallback that handles curved and angled rooms.

Around all of it: a new Worker API (`PUT /scan/:id`, `POST /process/:id`, `GET /status/:id`, `GET /result/:id`), R2 for objects, a `scan-jobs` Queue with a dead-letter queue and `max_batch_size: 1`, and D1 for job state — D1 specifically, for read-after-write consistency on status polls.

It is a coherent document. It is well-informed about DXF's sharp edges and honest about its own fidelity bar.

### Verdict: none of it is implemented

Zero hits across the repository for the Worker endpoints, an R2 scan bucket, the `scan-jobs` queue, a D1 jobs table, `FloorplanContainer`, the Open3D pipeline, or the GPU tier. Not partially built, not stubbed — absent.

What exists instead is functionally analogous and architecturally different: the Room File pipeline in §1. Someone solved the same problem on a different spine. The spec's evaluation instructions ask the reader to classify divergences; the correct global classification is that this is a **different system**, not a partial implementation of that one.

### What it gets right — adopt

- **Point-cloud geometry as a cross-check on dimensions.** This is the single best idea in the document, and we do not do it. We have a mesh and we ignore it.
- **The tiered fidelity model, and especially its honesty rule.** Return a QA note and no polygon rather than a mangled one. That instinct is exactly right, and it is the same instinct behind our accuracy certificate.
- **The DXF craft gotchas.** Fixed-point coordinates, a real LAYER table or entities silently vanish, units carried in the file. Whoever wrote §8 has shipped DXF before.
- **Async orchestration with retries and dead-letter thinking.** Correct shape, regardless of which queue implements it.
- **Scale-to-zero GPU for heavy stages, sized T4/L4.** An A100 for room-scale reconstruction is money on fire, and the doc says so.
- **A framework-agnostic core with thin deploy adapters.** `reconstruct(ply_bytes, cfg) -> (dxf_bytes, metrics)` wrapped by Modal, RunPod, and Cloud Run shims that change nothing but the transport. This is the one structural idea we should reuse verbatim, and §3 does.

### Where it misfits Patina — decline

**(a) It stands up a second orchestration stack.** Worker + R2 + Queues + D1, running parallel to the Supabase spine. But `agent_tasks` is already the queue, with successor-enqueue and full audit. `room_files.status` is already job state, in Postgres, with read-after-write consistency by construction — the exact property D1 was chosen for. Supabase Storage is already the object store, private and RLS-governed. Duplicating all three buys a seam and no capability. Every scan would then live half in Supabase and half in Cloudflare, and every debugging session would start by asking which half.

**(b) It is point-cloud-first, and that is backwards here.** Tier 2 re-derives walls by RANSAC from a PLY and discards the parametric `CapturedRoom` entirely. But our `solve` stage already produces anchor-corrected, provenance-classed dimensions from that parametric model. Against the spec's own LOD-200 bar, anchor-corrected parametric output beats schematic RANSAC output — and it carries a per-dimension accuracy certificate the spec has no equivalent of. The spec would have us throw away the better source to reconstruct a worse one.

The point cloud's right role here is **verifier and enricher, not primary source — and not a truly independent check**. The mesh and the parametric model come from the same ARKit session, so they share tracking and scale error. What the cross-check actually catches is RoomPlan-specific misclassification and geometry errors; typed `scan_anchors` remain the only true ground truth. That is still genuinely valuable — see Lane C below.

**(c) It is floor-plan-only.** A DXF and nothing else. Nothing toward the rich 3D model, nothing toward imagery, nothing about what a designer sees when they open the room in the portal. That is not a flaw in the spec — it is scoped to scan-to-CAD and says so — but it means it cannot answer the question we actually have.

### 2026 corrections to its factual claims

- **Cloudflare Containers are not request-scoped.** §8 says "no long-running/persistent containers (request-scoped)". They are Durable-Object-backed long-running processes with idle sleep, default 10 minutes, configurable via `sleepAfter`. The architectural advice that follows from the wrong premise — never run an in-container daemon — is therefore over-cautious.
- **The instance ceiling is right.** standard-4 at 4 vCPU / 12 GiB / 20 GB is confirmed current.
- **Still no customer GPU on Containers.** That part holds, and it is why Lane M Phase B goes elsewhere.
- **Simultaneous RoomPlan + sceneDepth capture is not free.** The spec presents it as a matter of choosing `RoomCaptureSession` over `RoomCaptureView`. In practice `sceneDepth` stops arriving on `ARFrame` callbacks while a `RoomCaptureSession` is running; the known workaround is to re-`run` a sceneDepth-configured configuration after the `didStart` delegate fires. Our ~1 Hz `DepthFrameRecorder` already navigates exactly this, which is why we have `depth.zip` at all. Worth saying out loud, because it is the kind of thing that quietly breaks on an iOS point release.
- **It predates the single most important development for rich capture.** The spec's fidelity ceiling is a polygon. Since it was written, 3D Gaussian splatting went from research to production tooling, and Khronos published `KHR_gaussian_splatting` as a glTF extension — release candidate February 2026. Photoreal room capture from posed frames is now a normal thing to ship, and it is a far better answer to "what does the designer see" than any polygon.

---

## 3. The proposal: one capture, three lanes

**The principle:** the schema-v3 bundle already contains everything the three lanes need. Nothing new is asked of capture. One optional check only — confirm the USDZ we export is the mesh variant rather than the parametric one, or simply export both.

Everything rides the existing spine. `scan_pipeline.ingest` completes and fans out — not chains — into the lanes below: it enqueues `scan_pipeline.solve` for Lane C, and, in Phase B, `scan_pipeline.splat` for Lane M. `agent_tasks` successor-enqueue within a lane, `room_files` status and versioning, `scan_pipeline_events` telemetry, billing-guarded pg_cron sweeps for edge lanes. Lanes fail independently — a `drawings` failure never blocks `renders`, and vice versa. **No new NestJS services. No Cloudflare Queues or D1 for scans.** Derived artifacts do land on R2 — see §5, piloting the phase1-close target platform, not standing up a parallel one.

### Lane C — CAD (exists; extend)

Keep `solve` → `drawings` as the primary path. The parametric model with anchor correction stays the source of truth for dimensions.

**New `verify` stage, between solve and drawings.** Open3D's plane segmentation operates on point clouds, not meshes, so the stage first samples `mesh.ply` into a point cloud (vertex sampling / poisson-disk over faces), then runs seeded RANSAC to fit wall planes, extract their spans, and compare against the parametric dimensions. It deploys as a **CPU-only Modal function** — Open3D's `segment_plane` is CPU-backed even in its tensor API, so GPU is irrelevant here, not merely optional.

- Divergence beyond tolerance lands as a QA note on the accuracy certificate. The designer learns that the mesh disagrees with the parametric model about the north wall by 40 mm, which is exactly the kind of thing they want to know before ordering millwork.
- Where the mesh is confidently better, it can **source** per-dimension rows as `mesh`. The P2 schema widening of `room_file_measurements.source` already anticipates this value.
- **Planarity residuals flag curved and irregular walls.** This is the highest-value output of the whole stage. Today a curved wall silently becomes a straight one. With residuals in hand we can trace its true contour into the DXF on a dedicated layer, and the drawing stops lying.
- **Seed the RANSAC RNG.** The spec is right that unseeded plane segmentation gives different answers run to run; for a verification stage that would be intolerable.

**New IFC output in `drawings`.** IfcOpenShell drives `IfcWall` and `IfcOpeningElement` from the same `RoomModel` (defined in `stages/captured_room.py`, consumed by `drawing/model.py`) that already feeds SVG, PDF, and DXF. The geometry work is done; this is a fourth serializer. Low incremental cost, and it is a real doorway into BIM for the architects our designers work alongside.

**DXF stays R2010.** The spec's R12/AC1009 rules applied to its on-device Tier-1 path — a hand-written DXF with no library underneath, where maximum-compatibility minimalism is the right call. We write through ezdxf on a server. R2010 is deliberate and stays.

**Deferred, explicitly:**

- **Native DWG.** ODA membership is a recurring license with distribution lock-in. That is a business decision, not a technical addition, and it should be made as one.
- **SketchUp/Revit/Chief Architect native exports.** Market signal worth recording: Twindo prices DXF as the commodity tier at roughly $0.18/sqft (Twindo's published pricing, 2026) and charges a premium for native-format exports. That is the shape of the opportunity. Revisit when clients ask, not before.
- **PolyRoom-class ML reconstruction.** Public checkpoints exist; there is no hosted API. Self-hosting is only worth it if `verify` shows parametric failures at a meaningful rate — which is another reason to build `verify` first. It generates the evidence that would justify the next step.

### Lane M — Model (rich 3D)

**Phase A (now): make the existing GLB real.**

`convert-room-scan-glb` already produces a GLB and nothing renders it. There is no `scan_pipeline.model` queue stage for this: add a gltf-transform optimization pass — Draco or meshopt geometry compression, KTX2/Basis texture compression, plus a poster frame — directly to the aesthete-inference container's conversion endpoint (gltf-transform CLI baked into the container image), so the edge function's USDZ→GLB call comes back with an already-optimized asset. GLB becomes the canonical web asset. USDZ stays, but purely for iOS AR Quick Look handoff; USDZ in a browser is still effectively Safari-only in 2026.

This phase asks for no new infrastructure whatsoever. The asset exists. We are compressing it and then, in §4, showing it.

**Phase B (rich): a Gaussian-splat stage.**

The inputs are already in the bundle: posed keyframes with intrinsics, depth, and ARKit world poses. That means **COLMAP-free** training — the poses are the hard part of splatting and we get them for free from ARKit.

Training runs ~10–25 minutes per room on Modal L4. Output is `.spz` at 15–60 MB compressed, migrating to `KHR_gaussian_splatting` glTF as the extension ratifies.

**GPU placement: Modal, ruled.** The splat stage deploys as a Modal function on an **L4**, preemptible/resumable — splatfacto+gsplat training directly from ARKit poses, no COLMAP solve required. Modal's preemption model means the training loop checkpoints and resumes rather than restarting from zero, so a reclaimed L4 costs wall-clock, not the run. Output compresses `.ply` → SPZ before it leaves the function. COLMAP pose-prior refine — the parked engine from §1 — stays the optional upstream mitigation for raw-ARKit-pose misalignment, not a hard dependency; it un-parks only if `verify` or splat quality shows the raw poses are the bottleneck. This reuses the spec's framework-agnostic-core idea exactly as written (§2): `reconstruct`/`train` stays a pure function, Modal is the thin deploy adapter around it, not the core.

### Lane I — Images

**Exists:** hero frame selection, posed photos, the HEIC derivative ladder from `derive-scan-photo-media`.

**New `renders` stage, enqueued when the optimized GLB lands.** The `convert-room-scan-glb` edge function calls the `enqueue_agent_task` RPC (edge functions already have that doorway) to fan out `scan_pipeline.renders` once the optimized GLB is written — no dependency on a `model` queue stage, because there isn't one. In Phase B, the splat stage enqueues a renders refresh the same way. Headless renders of the GLB (and later the splat): four corner perspectives, one top-down, and a short turntable strip. Stored as JPEGs, referenced from the Room File manifest.

Renders run **Blender Cycles on Modal L40S**, via the bpy wheel — Modal's own published example for this exact workload, at roughly 6 seconds per frame. That number answers the benchmarking question directly, so the earlier three.js-plus-headless-Chromium-first ladder is unnecessary: there is no need to stand up a CPU rasterization path and defer photoreal rendering to "later, after benchmarking" when Modal's published figures already price the photoreal path in cents per image.

---

## 4. The portal: the viewing story

### One viewer substrate

Extend the Orbit canvas infrastructure into a **ModelStage** that loads real assets.

Orbit's plumbing is the part worth keeping: dynamic import, an imperative `WebGLRenderer` owned outside React's render cycle, an on-demand render loop, an ErrorBoundary, and StrictMode-safe mount/unmount. That is the proven React-19-safe pattern, and it is proven precisely because it does not go through react-three-fiber. ModelStage keeps all of it and swaps the scene contents:

- **GLTFLoader with Draco and KTX2 transcoders** for the scan mesh GLB.
- **A splat renderer** for Phase B — Spark or the PlayCanvas SuperSplat viewer, both MIT and actively maintained through 2026.

View modes on Room View: **Plan** (today's SVG) / **Orbit** (today's synthetic reconstruction — it stays, it is a good diagram) / **Mesh** (the scan GLB) / **Splat** / **Photos**.

### Room File page

Render the plan SVG **inline**. We already generate it. Showing it instead of only offering it as a download is the cheapest single improvement in this document. Add the render gallery strip from Lane I.

DXF stays a download. An in-browser DXF preview via dxf-parser/three-dxf is a later nicety and not required — our own SVG *is* the preview, drawn from the same `RoomModel`.

### Client portal

Remove or guard the dead r3f stack now. `ClientViewerCanvas.tsx` is a live crash on a surface clients actually reach, and it should not wait on a lane. Port ModelStage across when Lane M Phase A lands.

### Design language

The viewer composes with the existing stage chrome — the bordered stage with its mono stagecap, `FullScreenViewerShell` (`apps/designer-portal/src/components/document/overlays/full-screen-viewer-shell.tsx`) for the expanded view, and the `region/` primitives for the surrounding layout. ModelStage is a new thing to look at inside furniture the portal already owns, not a new kind of furniture.

---

## 5. Orchestration and schema deltas

### agent_tasks kinds — fan-out at ingest, not one chain

```
                    ┌─→ Lane C:  solve → verify → drawings
scan_pipeline.ingest ┤
                    └─→ Lane M (Phase B only):  splat
```

`scan_pipeline.ingest` completing enqueues both branches independently: `scan_pipeline.solve` starts the CAD chain (Lane C), and, in Phase B, `scan_pipeline.splat` starts alongside it. Lanes fail independently: a `drawings` failure never blocks `renders`, and vice versa.

Within Lane C, `solve → verify → drawings` is successor-enqueue on success, exactly as today. `solve` and `drawings` stay on the systemd CPU box; `verify`, `splat`, and `renders` are Modal-placed (below), so — unlike Lane C's original single-worker-variant story — they need a dispatcher rather than a bare `claim_agent_tasks(p_task_types)` predicate.

**Modal is a spawn target, not a second queue.** `agent_tasks` remains the single queue, full stop. A small billing-guarded dispatcher process claims `verify`/`splat`/`renders` tasks from `agent_tasks` and POSTs each to a bearer-secret-protected Modal `fastapi_endpoint`, which immediately `.spawn()`s the actual function — Modal web endpoints hard-cap at 150 seconds, so a splat or render job that runs minutes has to spawn, not run inline behind the HTTP response. The Modal function does its work, then writes its completion and event rows back over a direct Postgres connection, authenticated as a new least-privilege `scan_worker` role — never `service_role` — so a Modal-side credential leak exposes exactly the scan tables it needs and nothing else. Modal Environments `patina-staging` and `patina-production` carry separate secrets and hard budget caps, so a runaway job fails closed on cost before it fails closed on anything else.

There is no `scan_pipeline.model` stage. Lane M's GLB optimization is not a queue stage at all — it folds into the `convert-room-scan-glb` edge function's call to the aesthete-inference container's conversion endpoint (gltf-transform CLI baked into the container image), so the lane emits an optimized GLB directly. When that GLB lands, the edge function enqueues `scan_pipeline.renders` (Lane I) itself, via the `enqueue_agent_task` RPC — edge functions already have that doorway. In Phase B, the splat stage enqueues a renders refresh the same way.

Failures land status and error on `room_files` and event to `scan_pipeline_events`; its stage enum extends with `verify`, `renders`, `splat`.

### Schema

`room_files` gains manifest keys and columns:

| Field | Holds |
|---|---|
| `glb_url` | the optimized web GLB |
| `splat_url` | the `.spz` / glTF splat asset |
| `renders` (jsonb) | the render gallery manifest |
| `verify` (jsonb) | plane-fit residuals, divergences, QA notes |

One reconciliation to make deliberately: `room_scans.model_url_gltf` already exists. Decide the single canonical home for the model URL — see §7; this should not be settled by whichever lane ships first.

Versioning and append-only rules are unchanged. A new lane produces a new Room File version; nothing is ever mutated in place.

### Compute placement

| Where | Runs |
|---|---|
| systemd CPU box | `ingest`, `solve`, `drawings` |
| Modal CPU | `verify` (CPU-only — Open3D's `segment_plane` is CPU-backed) |
| Modal L4 (preemptible/resumable) | `splat` — splatfacto+gsplat from ARKit poses |
| Modal L40S | `renders` — Blender Cycles via the bpy wheel, ~6 s/frame |
| aesthete-inference Container | USDZ→GLB conversion + gltf-transform optimization, billing-guarded |
| Portal | viewing only — no compute, no conversion |

### Storage and reads: piloting the R2 target

`ARCHITECTURE.md`'s object store was one of the pieces we declined in §2(a) — but the ground it stood on has since shifted. The phase1-close program (PR #28, staging-live) has already ruled the *portal's* target platform: Supabase Postgres stays system of record behind the edge-api-worker's dual Hyperdrive bindings, but Supabase Storage is being replaced by R2, per the runbook's Phase 2 media design — an originals/artifacts bucket pair, an object registry, an access-class matrix, and capability URLs served from `assets.patina.cloud`. The scan pipeline does not join that program; it **pilots** that design, the same way it copies the runbook's Phase 3 capture-contract principles (a DB ledger deciding idempotency, minimal message shape) without joining Phase 3 itself, which explicitly excludes LiDAR/site-scan.

New derived artifacts — GLB, splat, renders — land on R2 with registry rows from day one: access class *authenticated project* for GLB and splat, *released deliverable* for Room File render sheets. Portal reads move from `createSignedUrl` to short-lived capability URLs issued by typed `/v1/scan/*` routes on the edge-api-worker, using scan-specific NOLOGIN roles and security_barrier views — the 00481 pattern. Scan **originals** — the `room-scans` Supabase bucket — cut over in a later wave, behind a shadow rung that requires positive sha256-match evidence before anything reads from R2 instead of Supabase Storage. Everything here is staging-only until Kody authorizes prod — the stop-at-staging rule applies to the scan pipeline exactly as it does to the rest of phase1-close. Wave sequencing for both the Modal rollout and the R2 pilot is in `DELIVERY-PLAN.md`.

---

## 6. Phasing

**P1 — See the real room. (~1–2 weeks)**
GLB optimization pass in `convert-room-scan-glb`. ModelStage with the GLB viewer in Room View. Inline SVG plan on the Room File page. Client-portal r3f guard, then port. Pure wins, no new infrastructure, and the first time a designer sees the actual geometry of their scan in the portal.

**P2 — Trust the numbers. (~2–3 weeks)**
The `verify` stage: Open3D cross-check against `mesh.ply`, curved-wall flagging into the accuracy certificate, `mesh`-sourced dimension rows. IFC export in `drawings`.

**P3 — The rich record. (~3–4 weeks)**
The splat lane on Modal. The render gallery. The splat view mode in ModelStage.

**P4 — Demand-driven, optional.**
Premium native-format exports (SketchUp, Revit) if clients ask. `StructureBuilder` multi-room merge — noting Apple's practical ceiling of roughly 2,000 sq ft per structure. ML reconstruction only if the `verify` data from P2 shows parametric failures at a rate that justifies it.

P1–P4 above are the product framing. `DELIVERY-PLAN.md`'s W0–W4 waves are the authoritative execution sequencing — including where P2's `verify` and IFC actually split across waves.

---

## 7. Risks and open questions

**RoomPlan has been effectively frozen since WWDC23.** No meaningful API movement in three years. Our entire capture path is a single-vendor dependency on a framework Apple appears finished with. Nothing to do about it today, but it argues for keeping the mesh and depth records — which are ARKit-level, not RoomPlan-level — rather than betting everything on the parametric model.

**sceneDepth / RoomCaptureSession coexistence is fragile.** The workaround described in §2 is undocumented behavior. It has broken before across iOS releases and could again. `depth.zip` going quietly empty would not fail any current test.

**Splat asset sizes on real hardware.** 15–60 MB is fine on a designer's laptop over office wifi and questionable on a phone in a client's living room. Needs a size budget and a mobile fallback to the GLB before Phase B ships to the client portal.

**Modal preemption mid-training.** An L4 splat run can be reclaimed under load. Mitigation is the resumable-training pattern (checkpoint + resume) plus task-lease retry at the `agent_tasks` level, so a preempted run picks back up rather than restarting or silently vanishing.

**Modal is a single vendor.** The framework-agnostic core from `ARCHITECTURE.md` — `reconstruct`/`train` as a pure function behind a thin deploy adapter — is exactly the seam that keeps this from being a hard lock-in; it is worth holding that seam even though Modal is the only adapter we ship today.

**Scoped DB credentials leaving our network.** The new `scan_worker` role writes completion/events back over direct Postgres from inside Modal — a third-party cloud. Mitigation: least-privilege grants scoped to exactly the scan tables it touches, credential rotation, and a static-IP allowlist option if Modal's egress IPs are stable enough to pin.

**R2/boto3 checksum-matrix drift.** boto3's checksum behavior has shifted across versions and can silently change whether a request or response checksum is computed, which breaks integrity assumptions quietly rather than loudly. Pin checksum calculation to `when_required` explicitly rather than trusting the SDK default.

**RANSAC seeding.** `verify` must be deterministic or its QA notes are noise. Seed it, and test that two runs over the same bundle produce identical residuals.

**Private-bucket URL shapes.** I104/R122 history: store **bare keys**, sign at read. Every new URL column in §5 is a chance to reintroduce that bug.

**`room_files` RLS asymmetry**, noted in code comments during P2 (`use-room-files.ts`); unresolved. New columns carrying model and render URLs make it more consequential, not less.

**Billing guards are mandatory** on any container-invoked lane. The inference-worker billing incident is the precedent; nothing that can call the aesthete-inference container ships without a guard.

**ODA licensing lock-in** if DWG ever ships. Recurring fee, distribution restrictions. A decision to make with eyes open or not at all.

**Open question, needs a ruling:** where does the model URL canonically live — `room_scans` (one row per scan, mutable) or a `room_files` version (append-only, versioned)? The append-only argument says `room_files`: a re-solve produces a new GLB and both should be retrievable. The convenience argument says `room_scans`: the portal wants "the current model" without resolving a version. My recommendation is `room_files` with a view for convenience, but this should be ruled before P1 writes the column.

---

The outside spec asked a good question and answered it well: *how do we build scan-to-CAD from nothing?* Given an empty repository and a LiDAR phone, its three tiers on Cloudflare are a defensible plan.

But that was never Patina's question. We already shipped scan-to-CAD — anchor-corrected, provenance-classed, versioned, with an accuracy certificate the spec has no equivalent of. Our question is *how does the pipeline we already shipped grow into the full record of the room?* — the drawing a contractor can build from, the model a designer can walk, and the images a client can hold in their hand. One capture, three lanes, one spine. That is this proposal.
