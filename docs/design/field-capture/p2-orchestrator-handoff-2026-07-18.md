# Field Capture — orchestrator handoff — active 2026-07-23

You are picking up the Field Capture program mid-P2. This document is the
working state an orchestrator needs beyond what the repo already records.
Read it with, not instead of, the canonical sources below.

## Read first, in this order

1. `docs/design/field-capture/field-capture-p1-package.md` — how this program
   runs (rulings → numbered plan → hard gates). P1 is COMPLETE.
2. `docs/design/field-capture/field-capture-p2-package.md` — the ACTIVE plan.
   Part B carries Kody's R114 rulings inline; Part E is the numbered plan.
3. `docs/design/the-document/DECISIONS.md` — entries **R108–R115 and I84–I90**
   are this program's full decision history. R115 is the latest gate; I90 is
   the latest implementation record.
4. `docs/design/field-capture/p2-item3-gpu-box-acceptance-2026-07-19.md` — the
   completed real-DeskDev dependency/sandbox receipt (I88).
5. `docs/design/field-capture/p2-item4-colmap-adapter-spike-2026-07-18.md` —
   item 4's exact engine/API/fixture decision and remaining proof boundary.
6. `docs/design/field-capture/scan-pipeline-worker-design.md` — §10 is the
   P2 stage contract (the fork-join in §10.1.1 and budgets in §10.9 are
   implementation law).
7. Auto-memory `project_field_capture_p1.md` — the compressed ledger with
   every warning flag.
8. `docs/design/field-capture/m4-pilot-checklist.md` — the still-owed Leah
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
  `p2-item4a-colmap-qualification-2026-07-22.md`. The physical Field/Core Image
  raster/materializer fixture remains unqualified. Newer 4.x still needs
  separate qualification.
- **Item 4A COLMAP qualification passed; the physical raster half remains
  open.** Failed v1/v2 evidence and passing v3 evidence are preserved; v3's
  canonical receipt payload SHA-256 is
  `7d60da6b6f67c864e4584b417ed36c209ceea4aee1b9811441d244574f40f278`.
  The disabled storage/deadline/native/runner foundations are packaged but no
  production queue handler is registered or composed yet. Before handler
  enablement/deployment or any real run, pass the physical raster fixture,
  then prove comparable
  reprojection/registration/verified-loop evidence (unchanged evidence cannot
  pass; trajectory shape is diagnostic-only), use the carried lease-aware
  4-minute deadline, and preserve the canonical
  refine → {fuse→mesh-solve, splat} → Present four-manifest join. Scan
  `95266be1` remains the local-scratch proof subject before any DB/storage run.
- **GPU stages remain disabled and unregistered.** The observed queue-worker
  posture after I88 is inactive; its persistent `STAGES` remains the safe CPU
  set. Do not add `refine`, `fuse`, or `splat`, and do not start a GPU-stage
  worker merely because the doctor passed.
- **Next safe execution packet:** finish the physical Field/Core Image raster
  receipt, ratify source-to-engine image naming plus deterministic engine
  artifacts, and build/prove the materializer/backend/publisher/lease-aware
  Refine composition while keeping the stage unregistered. Disable DeskDev
  suspend before any Refine enablement. Do not claim a GPU queue task or run
  `95266be1` through production DB/Storage until those gates pass.

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
