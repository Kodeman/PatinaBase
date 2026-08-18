# The Rendered Room v2 — Delivery Plan

> **Status:** delivery plan · **Date:** 2026-08-18 · **Companions:** `PROPOSAL.md` and `the-rendered-room.html` (same folder)

This plan delivers the ratified direction in `PROPOSAL.md`. It **supersedes two of that document's assumptions**, on Kody's rulings:

1. **Compute placement.** The GPU stages do not go on the DeskDev CUDA box. They go on **Modal**. PROPOSAL.md was revised 2026-08-18 to adopt these rulings in place; this plan carries the delivery sequencing and the full risk register.
2. **Storage.** The platform is migrating to Cloudflare Workers as the API front end and R2 as the file store — the `phase1-close` program, PR #28. `PROPOSAL.md` assumes every scan object stays resident in Supabase Storage and declines R2 for scans. That assumption is withdrawn. This pipeline lands on the target platform, and it does so as that platform's first real workload.

Everything else in `PROPOSAL.md` stands: one capture, three lanes, one queue of record, the parametric model as the source of truth for dimensions, and the portal work in §4.

---

## 1. Ground truth this plan builds on

### Migration state

The `phase1-close` program (branch `phase1-close/staging-ready`, PR #28; docs `docs/engineering/patina-cloudflare-phase-1-runbook.md`, `patina-cloudflare-plan.md`, `patina-cloudflare-phase-1-staging-evidence.md`).

**Branch dependency — a sequencing gate, not a soft preference.** The runbook, the Phase 2 design, and `infra/edge-api-worker` exist only on branch `phase1-close/staging-ready` (PR #28, still open). W0's role migrations can proceed against staging regardless. W2's typed `/v1/scan/*` routes cannot: they need PR #28 merged, or this work stacked directly on that branch, before they can land.

**Phase 1 is live on staging.** Staging project `vuesoyhfrjabfxbrzekd`, worker `patina-edge-api-staging` on workers.dev, catalog route promoted to `hyperdrive`/100, rollback drill timed at 8 seconds. What is running is a **strangler compatibility proxy**: six Supabase prefixes — including `/storage/v1/*` — pass through verbatim, plus exactly two typed routes (catalog, health) and an authenticated `/v1/_authcheck` JWT→RLS path on the stacked PR `feat/edge-api-auth-path`. Nothing has been rewritten. The Worker is a seam, not a replacement.

**Postgres stays the system of record.** Strata sits behind two Hyperdrive bindings with different jobs: an uncached `DB_FRESH`-shaped binding for anything touching RLS, writes, or authorization, and a cached `DB_PUBLIC_CACHE` binding used only for approved public reads. `infra/edge-api-worker/src/env.ts` enforces this at boot — a promoted rung that comes up without both bindings is refused rather than allowed to serve 100% legacy while reporting success. GoTrue auth is untouched.

**The R2 file store is Phase 2: designed, zero built.** The design is real and specific, and none of it exists yet:

- A private per-environment bucket pair. Staging: `patina-staging-media-originals-us` and `patina-staging-media-artifacts-us`. Production (future, not provisioned in this plan): `patina-media-originals-us` and `patina-media-artifacts-us` — no env token. Not provisioned.
- A **universal object registry** — opaque object id plus version, sha256 and ETag, MIME and size, provenance, access class, lifecycle state. Canonical domain rows reference object id and version. They never store a signed URL.
- An **upload-intent flow**: `POST /v1/media/uploads` returns an idempotent, domain-authorized intent; confirmation matches actor, route/body ids, and the R2-observed checksum, type, and size before anything downstream is enqueued.
- **Delivery through `assets.patina.cloud`** with a fixed set of presets and short-lived capability URLs issued only after domain authorization.
- An **access-class matrix** with six rows: public catalog, authenticated project, guest share, released deliverable, legal hold, third-party source. Each row fixes its authorization owner, URL shape, cache behavior, and retention rule.

**Phase 3's capture-enrichment contract is designed-only, and it is not this pipeline's slot.** `CaptureEnrichmentMessageV1` (schemaVersion, enrichmentRunId, contentRevision, traceId) over an outbox into a Cloudflare Queue with Workers AI is a committed contract on paper. The plan document explicitly excludes this work from it: "LiDAR and site-scan reconstruction remain separate" (`patina-cloudflare-plan.md:149`). What we take from Phase 3 is its **principles**, which are correct and hard-won:

- The database ledger decides idempotency and current revision. Queue delivery order does not.
- The message is minimal — ids, revision, trace id. Payloads live in the ledger.
- Content revision joins the job key, so a stale delivery is a no-op rather than a corruption.

**Hard rails, inherited without negotiation:**

- **Stop at staging.** No production mutation and no production route until Kody authorizes it separately.
- **Supabase MCP `merge_branch`, `reset_branch`, and `rebase_branch` are forbidden.** `branches.main` *is* production (`bkvcixdmuyejfzcijpdg`).
- **New surfaces get their own least-privilege roles and views.** The `00481` pattern: a NOLOGIN group role carrying the grants, an out-of-band LOGIN role reachable only via connection string, and a `security_barrier` view as the read surface. Never reuse `edge_catalog_reader` or `edge_rls_user`.
- **The ACL conformance gate and its exception registry** (`supabase/tests/edge_api/`) must cover every new role, and the coverage must include **negative tests proving the gate is not vacuous**. The registry matches on exact signature, never a pattern; every row carries a reason and an acceptance.
- **Allow-list structured logging only.** No tokens, keys, cookies, SQL parameters, URLs, PII, or bodies.
- **A fail-closed validated config contract** — the `env.ts` plus `scripts/validate-config.mjs` pattern — for any new worker or dispatcher.
- **Shadow or canary with positive match evidence before any cutover.** "No mismatches" is not evidence; a counted positive match is.
- **`00-legacy-grants.sql` regeneration** after any migration that touches grants.
- **The `infra/*` workspace-gate fix must cover any new worker package.**

**Registered-not-fixed proxy findings become pre-production items** for this work as much as for the edge API: `proxySupabaseRequest` boundary re-validation (URL-relative escape), `requiredHttpUrl` accepting `http:`, the exact-string proxy-loop guard, and the `parseCatalogIds` raw-length bound.

### Scan pipeline state

Per `PROPOSAL.md` §1, verified: the schema-v3 bundle lands in the private Supabase bucket `room-scans`; `services/scan-pipeline` is a Python worker polling `agent_tasks` (Postgres-native; the `00370` trigger enqueues on `room_scans` → ready); the Room File is a versioned SVG/PDF/DXF set plus an accuracy certificate.

Three storage touchpoints are Supabase-Storage-resident today, and all three are in scope for W3:

- **iOS.** A background `URLSession` JWT PUT direct to Storage, with RLS enforced over the key shape `{folder}/{userId}/{roomId}/{file}` (the migration comment in 00077 calls it `artifactType`). The **segment order is load-bearing** — the policy derives authorization by parsing the path.
- **Worker.** Service-role Storage REST calls in `storage.py`.
- **Portal.** `createSignedUrl` in `use-room-scans.ts`, and the batched `createSignedUrls` calls in `use-room-scan-photos.ts`.

Plus the live data-shape defect: iOS writes public-style URLs into database columns and `storage-url.ts` re-signs them on read. This is the I104 bug class, still present.

### Modal facts (researched 2026-08)

**Interface.** `@modal.fastapi_endpoint` is current; `web_endpoint` is the deprecated name for the same thing. **Web functions are hard-capped at 150 seconds**, so any real job must be `.spawn()`ed and its result collected by callback or poll — spawned results are retrievable for 7 days. Function timeouts are configurable up to 24 hours.

**Economics.** Per-second billing, scale to zero, sub-second cold starts on cached images. GPU list: T4 $0.59/hr, L4 $0.80/hr, A10 $1.10/hr, H100 $3.95/hr. Region pinning costs 1.5–1.75×; non-preemptible costs 3× on CPU and memory. We run **unpinned and preemptible**, and absorb preemption with Modal's resumable-training pattern for the splat stage.

**Operations.** Modal Environments give clean staging/production separation with per-environment secrets. Hard budget caps **stop execution** rather than merely alerting. OpenTelemetry log and metric export is available.

**Connectivity.** Modal → Postgres is plain direct TCP. Hyperdrive is Workers-only and therefore irrelevant to Modal; this is worth saying because it is the obvious wrong assumption. Static outbound IPs are available if we want an allow-list. R2 from Modal is boto3 with `region_name="auto"` and an R2 token held as a Modal Secret — and set `request_checksum_calculation="when_required"` plus `response_checksum_validation="when_required"` defensively, because the 2025 AWS-SDK checksum default change collides with R2's partial checksum matrix. **R2 egress is $0**, which is most of the reason this arrangement is affordable.

**Splat training.** nerfstudio's `splatfacto` (on gsplat) accepts external ARKit poses through a COLMAP-free `transforms.json`. It wants roughly 6–12 GB of VRAM and takes about 10–25 minutes per room on L4-class hardware, so **L4 is the primary and T4 is the budget fallback**. The known failure mode: raw external poses without a consistent point-cloud initialization can misalign. The parked COLMAP refine engine is exactly the mitigation — a pose-*prior* improver, which is a far smaller claim than the full SfM solve it was built for.

**Output format.** `.ply` out of training, compressed to **SPZ 4** (Niantic, May 2026), then carried as `KHR_gaussian_splatting` (with `_compression_spz`) glTF as that extension ratifies.

**Cycles on Modal.** This is a first-party Modal example: the `bpy` pip wheel rather than a full Blender install, with `xorg` and `libxkbcommon` in the image, on L40S, selecting the CUDA device through the bpy API, at roughly 6 seconds per frame. Per-image cost lands in the cents.

**Open3D.** `segment_plane` is CPU-backed even through the tensor API. `verify` therefore runs on a **CPU-only Modal function** — no `gpu` kwarg — sized on core count. The ~1.1 GB Open3D layer is cached, so it costs at image build, not per invocation.

**One thing that does not exist:** there is no Modal template for Gaussian splatting. The image is a standard CUDA base with `pip install nerfstudio gsplat`, and building it is engineering time that must be budgeted rather than assumed away.

---

## 2. Architecture rulings

**R1 — `agent_tasks` remains the single queue of record. Modal is a spawn target, never a poller and never a second queue.**
*Rationale: the platform rule is that there is exactly one queue, and Phase 3's principle is that the ledger, not the transport, decides truth.*

Dispatch takes the shape already proven by `convert-room-scan-glb`: a billing-guarded edge function, swept by pg_cron, claims `scan_pipeline.verify | splat | renders` through `claim_agent_tasks(p_task_types)` and POSTs `{ taskId, scanId, roomFileVersion, traceId, objectRefs }` to the Modal endpoint, which spawns and returns 202 inside the 150-second web cap. The message is minimal by design. The Modal function's first act is a lease-guard `UPDATE` against the ledger, and the room-file version joins the job key — so a duplicate delivery or a stale version is a no-op, not a corruption.

The dispatcher's billing guard and Modal's hard budget caps are complementary layers, not redundant ones: the guard bounds *how often* the dispatcher invokes Modal, the caps bound *how much* any invocation (or environment) can spend. One governs frequency, the other governs dollars.

**R2 — Completion and progress are written over direct Postgres by a new scan-worker-scoped role pair. Never `service_role` in Modal.**
*Rationale: a third-party cloud holding a `BYPASSRLS` credential is the whole database in someone else's process table.* The existing CPU-box worker already carries this same risk class on first-party infra — `storage.py`'s Storage REST calls run on `SUPABASE_SERVICE_ROLE_KEY` today. W3's storage-interface work is the natural moment to move it onto scoped credentials too, and is scoped there explicitly below.

The `00481` pattern applies **adapted, not verbatim**: a NOLOGIN group role `scan_worker` granted exactly the scan RPCs — complete task, fail task, append `scan_pipeline_events`, update `room_files` — and an out-of-band LOGIN role `scan_worker_login` whose connection string is held as a **Modal Secret**, rather than living only inside a Hyperdrive connection string the way the Worker case does (Hyperdrive is Workers-only, so it isn't an option here). That widens the credential's surface relative to the original pattern — acknowledged in the risk register below. Nothing broader than the scan RPCs, though.

*Alternative considered, not chosen now:* callbacks to a typed Worker endpoint rather than direct Postgres. That is the better long-run shape and becomes attractive once the `/v1/scan/*` surface matures. Today it would mean building a write API before we have a read API, so it waits.

**R3 — Modal hosts the accuracy and quality stages. The systemd CPU box keeps the stages that already work.**
*Rationale: migrate software for a reason, not for tidiness.*

| Where | Runs |
|---|---|
| Modal (CPU-only function) | `verify` |
| Modal (L4, preemptible, resumable) | `splat` |
| Modal (L40S, bpy wheel) | `renders` — Cycles; splat-native renders once the splat exists |
| CPU box (systemd worker) | `ingest`, `solve`, `drawings` — unchanged |
| aesthete-inference Container | USDZ→GLB plus gltf-transform optimization, billing-guarded — unchanged |
| Portal | viewing only |

The DeskDev CUDA box is **out** — that is the superseded ruling. Modal Environments provide staging/production separation, with per-environment secrets, hard budget caps, OTel export, and unpinned regions. **Only `patina-staging` is provisioned by this plan**, in W0, with its own budget cap. `patina-production`'s creation, secrets, and budget cap are documented in the W4 prod-ready package and executed only upon Kody's separate prod authorization — this plan does not create it.

**R4 — Storage: the scan pipeline pilots Phase 2.**
*Rationale: Phase 2 needs a first workload to prove its mechanics, and this pipeline is the one generating new artifacts anyway.*

New derived artifacts — the optimized GLB, the `.spz` splat, the renders, and future Room File sheets — land in R2 (`patina-staging-media-artifacts-us` on staging; `patina-media-artifacts-us` in the future production bucket) with registry rows and access classes from day one. Scan **originals** (the schema-v3 bundle) stay in Supabase `room-scans` until the dedicated cutover in W3, which follows Phase 2's mechanics exactly: upload intent, presigned R2 PUT, confirm against the R2-observed checksum; shadow dual-write with counted positive sha256 matches; a 7-day read-only window on the source; two-pass GC with a legal-hold check before either pass deletes anything.

Access classes: **scan media = authenticated project**; **Room File deliverables = released deliverable**. Canonical rows store object id and version, never URLs — which retires the I104 public-URL bug class permanently rather than dodging it again.

**R5 — Read path: typed `/v1/scan/*` routes on the edge-api-worker, on staging.**
*Rationale: user-scoped data must never ride a cached binding, and a capability URL is the only URL shape that expires.*

The routes issue short-lived capability URLs after domain authorization, backed by scan-specific `security_barrier` views over an uncached `DB_FRESH`-shaped Hyperdrive binding. They get their own NOLOGIN read role. ACL conformance coverage is required, and so are negative tests — explicitly including one for the mood-board bug class: **a storage or read policy whose predicate proves an object exists without binding the caller must fail the gate.**

**R6 — Every leg that replaces a live behavior goes through a shadow rung first.**
*Rationale: the catalog cutover established the pattern and the rollback drill established the cost — 8 seconds.*

Portal reads, iOS upload, and worker storage each shadow with **positive match counts** emitted, in the `catalog.ts` shape, before promotion. Rollback is a config flip, not a deploy.

---

## 3. Waves

**Mapping to `PROPOSAL.md`'s phases.** PROPOSAL §6's P1–P4 stay the product framing — what a designer notices shipping, and why. W0–W4 below are the authoritative execution sequence — what actually gets built, on which compute, in what order, and what gates what. Correspondence: **P1** ("see the real room") is the parallel portal track below — storage-agnostic, running alongside every wave rather than inside one. **P2** ("trust the numbers") splits: `verify` is **W1**; IFC, which P2's product framing bundles alongside `verify`, actually lands in **W2** (see W1/W2 below). **P3** ("the rich record") is **W2**. **P4** is unchanged, demand-driven, and outside these waves entirely.

### W0 — Foundations (~1 week)

**Scope.** Stand up the Modal workspace with the `patina-staging` environment, its hard budget cap, and OTel export — `patina-production` is **not** created in W0–W4; see R3. Provision the **staging** R2 bucket pair. Land the minimal media-registry table — the Phase 2 kernel: id, version, bucket/key, sha256, mime, size, access_class, lifecycle_state, provenance — as a hand-numbered migration applied to staging only, within the MCP rails. This kernel is scan-scoped: its schema may change freely until a second consumer adopts it, and the pilot owns the schema until then. Land the `scan_worker` and scan-reader role migrations on the `00481` pattern, extend ACL conformance coverage to them, and regenerate `00-legacy-grants.sql`. Build the dispatcher edge-function skeleton behind a fail-closed flag.

**Exit.** `modal deploy` of a hello-world spawn-and-callback round trip whose completion is visible in `scan_pipeline_events` on staging, written by `scan_worker_login`.

**Does not.** No production resources. No real stage logic. No change to any live read path.

### W1 — Accuracy lane (~1–2 weeks)

**Scope.** `verify` on a CPU-only Modal function: sample `mesh.ply` into a point cloud, run seeded RANSAC plane fits, compute mesh-versus-parametric residuals, and emit certificate QA notes, `mesh`-sourced measurement rows, and the curved-wall flag. Inputs are read via presigned Supabase URLs — the `convert-room-scan-glb` pattern — which works before any storage cutover and keeps this wave independent of W3. Wire the output into the accuracy certificate and the Room File. Write golden cases for duplicate delivery, stale room-file version, and lease expiry.

**Exit.** `verify` QA visible on a staging Room File certificate, plus a determinism test: two runs over the same bundle produce identical residuals.

**Does not.** No GPU. No R2. No storage migration. IFC lands in W2, not on W1's critical path.

### W2 — Rich record (~2–3 weeks)

**Scope.** The `splat` stage on Modal L4: `splatfacto` from ARKit poses, COLMAP pose-prior refine available behind config, `.ply` → SPZ, resumable across preemption. The `renders` stage on L40S via the bpy wheel: four corner perspectives, one top-down, a short turntable strip. IFC export lands here too: IfcOpenShell drives a fourth `drawings` serializer on the CPU box — storage-agnostic, so it rides alongside without any R2 or Modal dependency. Artifacts and their registry rows go to R2. Typed `/v1/scan/*` read routes and capability URLs ship on the staging edge-api-worker, gated on PR #28 merged or this work stacked on `phase1-close/staging-ready` (see §1). The portal's ModelStage reads the mesh GLB, splat, and renders through them, on staging portals.

**Exit.** A staging scan shows mesh GLB, splat, and render gallery end to end through the new read path.

**Does not.** Does not touch scan originals or the iOS upload path. Does not deploy any route to production. Does not remove the existing signed-URL read path — the portal keeps it until W3.

### W3 — Originals cutover (~2 weeks)

**Scope.** iOS gains the upload-intent flow and presigned R2 PUT against the Phase 2 interface, behind shadow dual-write with sha256 match evidence. `storage.py` gains an R2/S3 backend behind a storage interface, with the boto3 checksum configuration above, and moves off `SUPABASE_SERVICE_ROLE_KEY` onto a scoped role in the same pass — the same precedent as R2's `scan_worker` role. Portal `createSignedUrl` and the batched `createSignedUrls` call sites both move to capability URLs. Supabase objects go read-only for 7 days after verification, then two-pass GC with a legal-hold check.

**Exit.** Shadow dual-write over the full staging capture corpus — minimum 50 bundles and 7 days — with 100% sha256 match and zero promotions of unverified objects; promotion by config flip; a timed rollback drill.

**Does not.** Does not delete anything inside the read-only window. Does not carry the RLS path-parsing pattern into R2 — see the risk register.

### W4 — Hardening and production package (~1 week)

**Scope.** The full golden set in runbook style: duplicate delivery, stale revision, preemption-and-resume, checksum mismatch, RLS negatives including the mood-board bug class, budget-cap behavior, and a proof that Modal environment separation actually separates. An evidence document in the `patina-cloudflare-phase-1-staging-evidence.md` style. The registered-not-fixed proxy findings tracked as pre-production blockers alongside the existing edge-api ones.

**Exit.** An evidence document in the staging-evidence format with every golden case green, the timed rollback drill, and a demonstrated budget-cap halt — reviewed by Kody as the prod-authorization input.

**Does not.** **Production deploy is explicitly not in this plan.** It awaits Kody's separate authorization, per the stop-at-staging rule.

### Parallel track

`PROPOSAL.md` P1 — the ModelStage GLB viewer, the inline SVG plan on the Room File page, and the client-portal r3f crash fix at `apps/client-portal/src/components/scans/ClientViewerCanvas.tsx` — is storage-agnostic. It starts immediately against today's signed URLs and swaps to capability URLs in W2 and W3. The client-portal fix in particular should not wait on a lane; it is a live crash on a surface clients reach.

---

## 4. Budget and unit economics

Per-scan Modal cost, at unpinned preemptible rates:

| Stage | Hardware | Time | Cost |
|---|---|---|---|
| `verify` | CPU only | ~1–2 min | < $0.01 |
| `splat` | L4 | 10–25 min | $0.13 – $0.33 |
| `renders` | L40S | ~10 stills + turntable @ ~6 s/frame | < $0.10 |
| **Total** | | | **well under $0.50 per scan** |

Rate anchors, so each line is derivable rather than asserted: Modal CPU billing is ≈ $0.0000131/core/sec, the basis for `verify`'s <$0.01 (a few core-minutes at that rate is a fraction of a cent). `splat`'s $0.13–0.33 derives from L4 at $0.80/hr over 10–25 minutes. `renders`'s <$0.10 is an **estimate**, anchored on Modal's published ~6 s/frame L40S bpy example for roughly 10 stills plus a turntable strip; the exact L40S per-second rate is not yet pinned to this workload — estimate; confirm at W0.

Against the market: Twindo publishes $0.18–0.29 per square foot, which is a $45–73 deliverable for a 250 sq ft room. The compute is not the constraint on this product.

Plan tier: Starter now; Team ($250/mo) when concurrency demands it, not before. Hard budget caps per environment from day one — the caps stop execution, which is the behavior we want from a spawn target we do not watch continuously.

---

## 5. Risks and pre-production register

**Modal-specific**

- **Preemption mid-training.** Mitigated by the resumable-training pattern plus retry through the task lease. A preempted job must resume, not restart from zero, or the L4 cost estimate is wrong.
- **Checksum-matrix drift.** The 2025 AWS-SDK default change against R2's partial checksum support. Mitigated by setting both checksum options to `when_required` explicitly rather than relying on defaults that have already moved once.
- **Pose-quality misalignment.** Raw ARKit poses without point-cloud initialization can produce a misaligned splat. Mitigated by the COLMAP pose-prior option, which is the parked refine engine's natural and much narrower justification.
- **Database credentials in a third-party cloud.** Mitigated by the scoped `scan_worker` role, optionally a static-outbound-IP allow-list, and rotation via `ALTER ROLE`. The blast radius of a leaked `scan_worker_login` is the scan RPCs, not the database — though holding that credential as a Modal Secret, rather than inside a Hyperdrive connection string the way the Worker case does, is a wider surface than the `00481` pattern's original shape, and that gap is accepted knowingly (see R2 above).
- **Single-vendor exposure to Modal.** Mitigated by a thin adapter seam: the stage core stays framework-agnostic — `reconstruct(inputs, cfg) -> (artifacts, metrics)` — with Modal as one transport shim. This is the one idea from the outside `ARCHITECTURE.md` spec adopted directly as written.

**Platform**

- **Staging-only rail.** Nothing in W0–W4 touches production. Any drift from that is a stop.
- **MCP mutation rails.** `merge_branch`, `reset_branch`, `rebase_branch` remain forbidden; `branches.main` is production.
- **Edge-api registered findings.** The four proxy findings are pre-production blockers for this work too, not someone else's ticket.
- **The `net.*` residual.** `PUBLIC` holds full DML on `net.http_request_queue` and `net._http_response`, and the credential transiting that queue is a live `service_role` JWT. This is an accepted residual, and any new `pg_net` use in the dispatcher inherits it knowingly.
- **No Phase 2 register document exists.** The runbook's Phase 2 sections are the source of truth for the media matrix and the upload-intent contract. Treat them as such rather than waiting for a document that was never produced.
- **`room-scans` RLS and key-shape coupling.** Today's policy derives authorization by parsing `{folder}/{userId}/{roomId}/{file}` — segment order is load-bearing. The R2 key and registry design must **preserve an authorization derivation**, not reproduce the path-parsing pattern. Authorization belongs in the registry row and the domain policy; the key should be opaque.

---

The scan pipeline is the right first production workload for the Phase 2 media architecture and the right first Modal consumer. It generates new artifacts on every run, so R2 residency costs nothing to adopt for the derived set; it already has a queue, a ledger, and a versioned output, so the idempotency and revision discipline Phase 3 wrote down has somewhere real to be tested; and its GPU stages are exactly the shape — bursty, expensive per second, idle most of the day — that makes scale-to-zero worth the seam. What comes out the far end is the Rendered Room's three lanes, delivered on the platform Patina is actually moving to rather than the one it is leaving, with every cutover standing behind counted evidence and a config-flip rollback.
