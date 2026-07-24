# Field Capture — orchestrator handoff — active 2026-07-24

You are picking up the Field Capture program mid-P2. This document is the
working state an orchestrator needs beyond what the repo already records.
Read it with, not instead of, the canonical sources below.

## Read first, in this order

1. `docs/design/field-capture/field-capture-p1-package.md` — how this program
   runs (rulings → numbered plan → hard gates). P1 is COMPLETE.
2. `docs/design/field-capture/field-capture-p2-package.md` — the ACTIVE plan.
   Part B carries Kody's R114 rulings inline; Part E is the numbered plan.
3. `docs/design/the-document/DECISIONS.md` — entries **R108–R115 and I84–I95**
   are this program's full decision history. R115 is the latest gate; I95 is
   the latest implementation record.
4. `docs/design/field-capture/p2-item3-gpu-box-acceptance-2026-07-19.md` — the
   completed real-DeskDev dependency/sandbox receipt (I88).
5. `docs/design/field-capture/p2-item4-colmap-adapter-spike-2026-07-18.md` —
   item 4's exact engine/API/fixture decision and remaining proof boundary.
6. `docs/design/field-capture/p2-item4a-field-raster-qualification-2026-07-24.md`
   — the completed physical iPhone/Core Image raster receipt (I92).
7. `docs/design/field-capture/scan-pipeline-worker-design.md` — §10 is the
   P2 stage contract (the fork-join in §10.1.1 and budgets in §10.9 are
   implementation law).
8. Auto-memory `project_field_capture_p1.md` — the compressed ledger with
   every warning flag.
9. `docs/design/field-capture/m4-pilot-checklist.md` — the still-owed Leah
   pilot runbook.

## Exact position (as of this handoff)

- **P1**: complete, deployed, first production run done (I85). The instrument
  is live end to end: iOS Field app on Kody's phone → Strata → worker on
  Kody's Linux box → drawings → Room File portal page (flag `room-file`,
  PostHog id 768495, kody-only).
- **P2 (presence)**: ruled (R114), P2-M1 passed (R115), schema **00376/00377
  live on Strata**, items 1–2 done (item 2 was verified-not-rebuilt — its
  deliverable landed inside item 1's commit `9db080d2`; recorded honestly).
- **Wave 0 and queue lease migration 00378 shipped 2026-07-18.** Integration
  `636acf75` reached remote `main` in merge `59abd0f5`; both commits are
  ancestors of current `origin/main`. Migration
  `00378_agent_task_lease_ownership.sql` was applied surgically with its ledger
  row in one transaction. At that production receipt unrelated 00374/00375
  remained absent, so no blanket `supabase db push` was used. The affected
  `catalog-normalizer`, `fulfillment-intake`, and `stripe-event-processor`
  bundles deployed at versions 8, 2, and 8 with JWT verification preserved;
  natural cron runs for the latter two succeeded with zero failures, while
  catalog's nightly business run was not forced.
- **Wave-0 pre-deploy integration receipt:** 290 scan-pipeline Python tests, 46 affected
  Deno tests, 20 `@patina/agent-queue` tests, queue + Supabase typechecks, all
  agent-task SQL cases inside an outer transaction/rollback, and a two-session
  `SKIP LOCKED` run with distinct claims and zero residue passed. The generated
  legacy-grants seed was byte-identical. A Linux two-UID hostile-umask race probe
  also passed. This remains code/integration evidence, not item-4 fixture proof.
- **Queue ownership hardening is live on Strata**:
  `00378_agent_task_lease_ownership.sql` makes claim owners fresh UUIDs and
  fences completion plus successor enqueue to the exact live lease owner. The
  generated Supabase/client types, edge callers, worker wrapper, SQL transaction
  tests, and two-session `SKIP LOCKED` runner are included. Live RPC definitions
  contain both actor/owner guards and remain executable only by `service_role`.
- **Item 3's real-DeskDev dependency/sandbox qualification is complete and
  recorded by I88.** The full receipt is
  `p2-item3-gpu-box-acceptance-2026-07-19.md`; acceptance hardening
  is on main at `14b01e89` and the receipt at `70ac232e`. A CUDA 11.8 compile/run
  smoke passed on the RTX 2080 Ti; COLMAP/PyCOLMAP 4.0.2, Open3D CUDA, torch
  cu118, and gsplat rasterization passed cold and warm doctor-only systemd runs.
  Cleanup left `patina-scan-worker` inactive with its persistent CPU stage set
  unchanged. This closes item 3 dependency/sandbox qualification, not item 4's
  database/model API, GPU-SIFT reconstruction, or physical Field-raster fixture.
  Item 3's real second-runtime-worker/disjoint GPU-task claim operator AC is
  still open; only the local two-session `SKIP LOCKED` code proof exists. Do not
  attempt that live claim until registered handlers and safe fixture tasks make
  it legal.
- **Item 4's lease-deadline prerequisite is integrated on current main at
  `c92c4190` and recorded by I89.** Claims now carry one immutable conservative
  monotonic expiry bound from request start plus the exact strictly validated
  visibility interval. The stage accessor fails closed on missing, non-finite,
  or expired metadata and feeds `min(stage start + 4 min, bound - 60 s)`.
  Verification passed 83 focused tests and all 333 scan-pipeline tests;
  independent adversarial review passed. The guarantee assumes the Linux host
  stays awake because its monotonic clock does not include suspend time: disable
  automatic and manual suspend before enabling Refine, or first replace/recheck
  the clock/lease contract with a suspend-aware design.
- **Item 4 engine decision is corrected by I87** (decision record:
  `p2-item4-colmap-adapter-spike-2026-07-18.md`): exact pilot target is COLMAP
  CLI 4.0.2 + `pycolmap==4.0.2`; primary = known-pose seed model → point
  triangulation → BA; fallback = position-prior mapper; integrated
  `global_mapper` is diagnostic-only and standalone GLOMAP is archived.
  **I90 closes the exact database/model API + GPU-SIFT reconstruction half** on
  DeskDev with the immutable v3 receipt in
  `p2-item4a-colmap-qualification-2026-07-22.md`. **I92 closes the separate
  physical Field/Core Image HEIC-to-raster convention** with the installed-run
  receipt in
  `p2-item4a-field-raster-qualification-2026-07-24.md`. **I93 packages and
  deploys the exact-profile adapter while keeping it disabled and uncomposed.**
  **I94 adds the disabled owner-scoped Storage acquirer and descriptor-transfer
  native-process prerequisite while keeping Refine unregistered.**
  **I95 adds the reviewed exact evidence-builder contract and lower-level
  COLMAP backend scaffold, still disabled and uncomposed.**
  The broader acquisition→runner→publisher lifecycle remains unqualified.
  Newer 4.x still needs separate qualification.
- **Item 4A COLMAP qualification passed; I91 records disabled Refine
  boundaries, not a composed stage.** Failed v1/v2 evidence and passing v3
  evidence are preserved; v3's canonical receipt payload SHA-256 is
  `7d60da6b6f67c864e4584b417ed36c209ceea4aee1b9811441d244574f40f278`.
  The packaged runner binds distinct source-HEIC/engine-PPM identities, exact
  engine outputs, bounded telemetry, and a strict publication contract. The
  materializer uses descriptor-pinned bounded workspaces, and the
  publisher/storage seam is owner-scoped, create-only, same-descriptor, and
  manifest-last under the carried deadline. These boundaries remain
  deliberately uncomposed. I94 now supplies a disabled concrete Field Storage
  acquirer and a bounded SCM_RIGHTS transport for read-only local-file
  descriptors. I95 now supplies an exact, queue-independent evidence builder
  and deterministic lower-level COLMAP protocol scaffold, but neither is
  composed into the runner and no production queue handler exists. The
  materializer's pinned descriptor still
  does not cross through a composed raster→runner→publisher lifetime, so
  absolute materializer paths remain display metadata rather than a safe
  handoff contract.
- **Item 4A physical raster qualification passed; I92 records the evidence,
  not a production materializer.** The installed immutable release
  `/opt/patina/scan-pipeline/.venv.release.5e55c004de1888d5984d0c2b` passed the
  physical iPhone 17 Pro Max fixture at code commit `df10a157`. The canonical
  v2 receipt SHA-256 is
  `930638e3e98aa49d27f6b305d886d45b51b94714aecd49a84452e0800e0feac6`;
  the materialized PPM SHA-256 is
  `78c68791b59f63fb080080d24c70bf6fdbe2fdcba6b6d798694e92c9a29e6f15`.
  The v2 Linux qualifier uses libheif's public API to
  require exactly one recognized primary-item-associated identity `irot`
  (`rotation_ccw=0`) and rejects zero/multiple recognized transforms, nonzero
  `irot`, primary-item-associated `imir`/`clap`, metadata, or any raw/default
  pixel difference. It does not claim unknown BMFF properties or raw
  association/payload bytes; the separate iOS BMFF regression owns the exact
  ImageIO `pitm`/`ipco`/`ipma` association and `irot` payload writer contract.
  Failed v1 evidence stays preserved.
- **I93 packages and deploys the disabled physical raster adapter.** Main
  `a7aee1f4` is installed as
  `/opt/patina/scan-pipeline/.venv.release.2fcccaf0feafa92fdca3fd2a`.
  The adapter pins source/helper/scratch descriptors, shares the carried
  deadline, kills and reaps the helper process group, validates and unlinks
  exact-profile output before streaming, and fails closed on cleanup or
  provenance uncertainty. Its canonical helper manifest binds binary/source
  hashes, compiler and pkg-config flags, and the exact live Noble libheif
  identity; reuse, activation, and runtime all reject drift. The installed
  adapter replayed the retained physical HEIC to the exact I92 PPM SHA-256
  `78c68791b59f63fb080080d24c70bf6fdbe2fdcba6b6d798694e92c9a29e6f15`.
  Deployment evidence is retained at
  `/var/lib/patina/scan-work/qualification/deploy-a7aee1f4-field-raster-v1`.
- **I94 adds two reviewed, disabled lifecycle prerequisites.** The Field
  Storage acquirer validates the exact owner/key ledger before constructing an
  HTTP client, performs one identity-encoded raw object GET with service-role
  credentials, checks status, declared length, exact byte count, and SHA-256,
  and writes only through the materializer's bounded private-file sink under
  the carried deadline. Operational auth/rate-limit/5xx failures stay
  retryable; missing or identity-invalid input is fatal. Credential-bearing
  exceptions are normalized without cause/context leakage. The native boundary
  transfers unique read-only regular-file descriptors with SCM_RIGHTS only
  after verified `setsid`, independently checks capped token/size/hash/inode
  ledgers in parent and child, revalidates the original stat snapshot and bytes
  after engine return, and closes descriptors on every path. The current proof
  boundary is 64 unique files, 128 MiB per file, and 4 GiB aggregate; a
  production evidence builder must fit that ceiling deliberately or introduce
  a separately reviewed batch/file-backed protocol. Process-group
  signals occur only while the unreaped original leader still owns its PGID;
  post-reap retry and verification never address that numeric group.
  Both pieces remain `production_enablement=disabled` or uncomposed
  prerequisites and made no queue, Strata, or Storage call.
- **I95 adds two more reviewed foundations without enabling Refine.** The exact
  evidence builder consumes complete immutable database keypoint tables,
  source/raster identities, a fixed post-triangulation/pre-BA track universe,
  the same memberships after BA, and the complete deterministic pair graph. It
  computes the existing `RefinementEvidence` schema from geometry, enforces
  exact database index membership, at least 80% verified connected coverage
  plus one verified non-temporal loop, canonical digests, a 400-frame cap, the
  carried deadline, and normalized overflow failures. The lower-level COLMAP
  scaffold defines a bounded archive-chunk packet, canonical PPM identities,
  the reviewed known-pose→triangulation→BA operation plan, and a direct child
  that stays in the native process group. Its parser rejects noncanonical
  schema/GPU/source tokens and numeric overflow. Adversarial review passed only
  for landing these as disabled scaffolds; it explicitly ruled NO-GO for
  execution or publishable evidence. Verification passed 338 Refine regression
  tests and all 144 installer/packaging tests. No install, deployment, queue,
  Strata, Storage, or real-scan run occurred.
- **Item 4's remaining hard gates begin at the disabled production
  lifecycle.** Packet extraction, a safe native output-descriptor channel,
  runner-path-reopen removal, aligned-output construction, and an artifact
  contract that carries both the raw pre-BA and refined models must close before
  the I95 builder can consume real engine snapshots. Sequential COLMAP
  command-group quiescence and complete exception normalization also remain
  unproved. Only then may a descriptor-safe
  materializer→raster→backend→runner→publisher lifetime compose the I93/I94/I95
  prerequisites under the single carried lease-aware deadline.
  Only after independent review may that composition produce comparable
  reprojection/registration/verified-loop evidence on local-scratch scan
  `95266be1`; unchanged evidence cannot pass and trajectory shape remains
  diagnostic-only. Queue replay/fork behavior, downstream consumers, and the
  canonical refine → {fuse→mesh-solve, splat} → Present four-manifest join
  remain unproved. No production DB or Storage run has occurred.
- **GPU stages remain disabled and unregistered.** DeskDev's worker and doctor
  remain inactive; persistent `STAGES` remains `ingest,solve,drawings`. Do not
  register `scan_pipeline.refine`, add a GPU stage, or start a GPU worker merely
  because the adapter and doctor pass.
- **Next safe execution packet:** implement and adversarially qualify archive
  extraction, the native output-descriptor handoff, raw/refined model snapshot
  construction, sequential command quiescence, exception normalization, and
  removal of runner display-path reopening. Then compose the I93 raster
  adapter, I94 owner-scoped acquirer/native descriptor transport, I95
  backend/evidence contracts, and existing runner/publisher boundaries under
  one descriptor-safe workspace and the single carried deadline. Enforce I94's
  service-owned local-file contract (or move parent hashing behind a killable
  helper); the current synchronous `pread` cannot preempt a kernel-stalled
  FUSE/network file. The archive packet must be proven for 200–400 frames
  without exceeding the 64-file/4-GiB native boundary.
  Keep `production_enablement=disabled`, keep the composition unregistered, and
  exercise it only on reviewed local scratch. Do not claim a GPU queue task or
  run `95266be1` through production DB/Storage. Disable DeskDev suspend before
  any Refine enablement, or first make the lease-clock contract suspend-aware.

## The operating cadence (do not drop it)

- **Fable-mode orchestration**: the orchestrator never executes; all work is
  dispatched to subagents (Opus for complex build, Sonnet standard, Haiku
  mechanical). Every build item gets an **adversarial review by a separate
  agent before the next item stacks on it**. This cadence caught a real
  device-class or contract bug in nearly every P1 increment. Do not skip it.
- **Gates are Kody's**: P2-M2 (first dense mesh from `95266be1` judged
  against the P1 certificate), P2-M3 (walkthrough + click-to-measure on his
  room), P2-M4 (maker quotes without a site visit). Present evidence, ask
  for "pass", log the ruling.
- **Decisions log discipline**: NEVER hand-edit DECISIONS.md. Draft the
  block with a literal `R_NEXT`/`I_NEXT` token; the executing agent runs
  `python3 scripts/workstream_state.py <repo>` for the real id, substitutes,
  then `python3 scripts/append_entry.py <repo> --block <file> --check` and
  the real run. Rulings = R entries; audits/receipts = I entries.
- **Escalate vs bless** (package authority notes): designer-visible things
  (viewer UX, measure-tool wording, registry presentation, drawing styling)
  go to Kody; library/pipeline/naming choices are blessed-and-logged.
- **Kody's style**: terse rulings at gates ("pass", "continue on"). He runs
  the box himself — give exact commands, wait for "done".

## Hard-won laws (violate these and you will repeat our incidents)

- **Git**: explicit pathspecs only, never `git add -A`, never
  `reset --hard`. The main checkout carries Kody's unrelated dirty files +
  a stash — untouchable. Harness-managed agents use isolated
  `.claude/worktrees/agent-*` worktrees; operator-managed Codex worktrees use
  isolated lowercase `.codex/worktrees/...` paths. Never execute task writes
  from the dirty shared main checkout. Conflicts in GENERATED files (pbxproj, legacy-grants
  seed, database.types.ts) are resolved by RE-RUNNING the generator
  (`generate_project.rb`, `scripts/generate-legacy-grants.py`,
  `pnpm db:generate` vs LOCAL only), never hand-spliced.
- **Migrations**: hand-numbered; the ledger is a battlefield of parallel
  programs. Field Capture's Strata queue head is **00378**. The Wave-0 receipt
  found unrelated 00374/00375 absent and therefore applied 00378 surgically;
  re-query the live ledger rather than assuming that historical absence.
  **NEVER run blanket `supabase db push`** when it would drag another program's
  migrations. The proven surgical path is the file's DDL plus a bare
  `(version, name)` ledger INSERT in the same transaction. Verify numbers free
  across branches and the live ledger at execution time.
- **The box** (Kody's Linux GPU machine, worker id `DeskDevProcess-1`,
  app at `/opt/patina/scan-pipeline`): `install.sh` does a **COPY pip
  install** — `git pull` alone NEVER updates a running worker; and the box's
  source may be an rsync snapshot, not a git clone. systemd runs
  `ProtectSystem=strict` — every writable surface (all four XDG dirs, and
  for P2 the torch/CUDA caches) must be confined to APP_DIR **and** listed
  in `ReadWritePaths`; `doctor` probes them preflight. Upgrade story: update
  source copy → `sudo ./install.sh` → `systemctl restart`. Keep the worker
  inactive/GPU stages absent during qualification, and disable host suspend
  before Refine is ever enabled.
- **Storage/schema invariants**: B-18 (bundle spec) is the storage layout
  contract — per-kind folders `{folder}/{uid}/{room}/{file}`, deliverables
  under `room_file/{uid}/{scanId}/v{n}/`. The worker service key bypasses
  RLS, so `assert_owner_prefix` is mandatory on every derived key. The
  accuracy contract is DB-enforced: `rfm_anchor_source_shape` means no
  dimension is ever `verified` without an anchor — mesh evidence may only
  tighten `measured`. The room-scans bucket has a MIME allow-list (00077):
  transport type must be on it (octet-stream for ndjson/tar/spz), semantic
  MIME lives in the manifest (B-17).
- **Prod ops**: read-only SQL via Supabase MCP is always fine; mutations
  only via sanctioned RPCs (`requeue_agent_task` for parked jobs) or
  explicitly authorized deploys. Edge fn confirm-scan-bundle is at v21; the
  Wave-0 receipt recorded catalog-normalizer/fulfillment-intake/
  stripe-event-processor at v8/v2/v8.
  Verify deploys by probes, never version strings.

## Parked / owed ledger

- **Leah pilot** (the deferred P1 human validation): device build + add her
  to flag 768495 + `m4-pilot-checklist.md` walk — photo-bundle ingest probe
  FIRST. Runs parallel to P2 whenever she's available (R114.5).
- Parked garbage: agent_task `69dd152c…` / scan `fa361ed4…` (abandoned
  pre-MIME-fix upload, no manifest) — leave failed; 7-day sweep reaps its
  partial objects.
- ⚠ PostHog flags `arrival-arc` and `schedule-spine` are at TRUE 100%
  rollout despite kody-only intent — flagged to Kody 2026-07-18, unruled.
- P2 ledger (package Part F): co-designer download walk before sharing
  ships; A3 deep-link gap; GIN index on field_captures.provenance at scale;
  voice-note audio seam; background-upload device edges; sharpness
  calibration; associative DXF dimensions.
- Cosmetic accepted: D4 (drawn outlines scale×model vs snapped dim text).

## Standing subject

Scan `95266be1-5185-4aeb-8b6a-a09dceecca21` (Kody's room, uid `74056c2a…`,
room `843b273a…`): P1-processed to a generated Room File (certificate: scale
0.9828, RMS 133.6 mm, 24 measured ±11%, all 3 short anchors flagged). It is
the P2-M2/M3 test subject — the dense-mesh re-solve (operator-triggered,
R114.3) should visibly tighten it. That before/after is the P2 story.
