# Field Capture — orchestrator handoff — active 2026-07-27

You are picking up the Field Capture program mid-P2. This document is the
working state an orchestrator needs beyond what the repo already records.
Read it with, not instead of, the canonical sources below.

## Read first, in this order

1. `docs/design/field-capture/field-capture-p1-package.md` — how this program
   runs (rulings → numbered plan → hard gates). P1 is COMPLETE.
2. `docs/design/field-capture/field-capture-p2-package.md` — the ACTIVE plan.
   Part B carries Kody's R114 rulings inline; Part E is the numbered plan.
3. `docs/design/the-document/DECISIONS.md` — entries **R108–R116 and I84–I97**
   are this program's full decision history. R115 is the latest owner gate;
   **R116 closes ordered item 4**; I97 is the latest implementation record.
4. `docs/design/field-capture/p2-item3-gpu-box-acceptance-2026-07-19.md` — the
   completed real-DeskDev dependency/sandbox receipt (I88).
5. `docs/design/field-capture/p2-item4-colmap-adapter-spike-2026-07-18.md` —
   item 4's exact engine/API/fixture decision and remaining proof boundary.
6. `docs/design/field-capture/p2-item4a-field-raster-qualification-2026-07-24.md`
   — the completed physical iPhone/Core Image raster receipt (I92).
7. `docs/design/field-capture/p2-item4-qualified-host-acceptance-2026-07-27.md`
   — item 4's DeskDev receipt: the gate (1139/0 skipped, four runs), the four
   named acceptance clauses (subreaper, adopted-child reaping/quiescence,
   escaped-`setsid` handling, cleanup precedence), the kernel-thread parser on
   real `/proc`, the `PR_SET_DUMPABLE` seal, both descriptor-theft routes, and
   the `O_TMPFILE` freeze on real ext4. Read its boundary section before
   treating any of it as a gate.
8. `docs/design/field-capture/scan-pipeline-worker-design.md` — §10 is the
   P2 stage contract (the fork-join in §10.1.1 and budgets in §10.9 are
   implementation law).
9. Auto-memory `project_field_capture_p1.md` — the compressed ledger with
   every warning flag.
10. `docs/design/field-capture/m4-pilot-checklist.md` — the still-owed Leah
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
  **I96 adds exact packet-extraction and COLMAP command-supervision
  foundations, still disabled, unqualified, and uncomposed.**
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
- **I96 hardens two disabled boundaries without enabling Refine.** The packet
  extractor accepts only the exact manifest-ordered uncompressed USTAR
  regular-file universe from pinned chunk descriptors, uses positional and
  descriptor-relative I/O, rejects noncanonical metadata, undeclared or
  colliding members and trailing bytes, revalidates every chunk, and parses the
  extracted declared request. The command supervisor carries the native process
  group and deadline across sequential commands, uses Linux child-subreaper
  ownership plus exact reaping to refuse phase advancement while an adopted
  child remains, and normalizes setup, drain, wait, log, and cleanup failures
  with cleanup precedence. Both modules are in the exact installer and package
  trust lists, but all qualification flags remain false. Packet scratch is
  still child-owned and can survive SIGKILL, source/adapter ledger contents are
  not parsed, escaped descendants are detected but not contained, the command
  environment/toolchain is not bounded, and actual Linux lifecycle evidence is
  still missing.
  The reviewed output-handoff design is seven child→parent descriptors in
  transit: the six exact persistent engine artifacts (`adapter-v2.json`,
  `pairs-v2.txt`, `database-v1.db`, `seed-model-v1.tar`,
  `aligned-sparse-model-v1.tar`, and
  `engine-command-evidence-v1.json`) plus a scratch raw pre-BA model snapshot.
  The child may compute a proposed Sim3 and aligned bytes, but the parent must
  recompute and verify the alignment and pose digest before accepting them.
  That parent-owned descriptor lease/workspace is a design constraint, not an
  I96 implementation. Verification passed all 458 Refine tests with five
  Linux-only lifecycle skips on macOS and all 148 isolated
  installer/packaging tests. Focused Ruff correctness and formatting, Python
  compilation, shell syntax, diff integrity, posture probes, and independent
  adversarial review passed. The review verdict is GO only for this
  disabled/uncomposed landing and NO-GO for activation or publishable output.
  No install, deployment, queue, Strata, Storage, DeskDev, or real-scan run
  occurred.
- **I97 closes ordered next-work items 1, 2, 3 and 5, and produces item 4's
  qualified-host evidence — all still disabled and uncomposed.** Item 1 gives
  extraction a parent-provisioned descriptor-rooted 0700 workspace with a
  bounded reverse-FD lease and parent cleanup after normal return, timeout,
  SIGTERM and SIGKILL; its identity guard pins each entry with `O_PATH` first,
  because `(st_dev, st_ino)` alone is not an identity where inode numbers
  recycle. Item 3 adds executable-identity pinning re-proven immediately before
  `execve`, a 13-key closed command environment, argv confined **per option** to
  its own leased surface (`packet/` read, `work/` write, `tmp/` scratch), and a
  pinned toolchain identity that rejects drift. Item 2 parses the source and
  adapter ledgers with a closed role universe, cardinality and
  manifest-relationship validation; the adapter ledger is now envelope-only,
  because its per-row content proved derivable from the engine request. Item 5
  implements the seven-descriptor native output handoff and freezes it **by
  construction** — every output is copied at receipt into a parent-created
  `O_TMPFILE` and hashed there — behind a `PR_SET_DUMPABLE` seal that closes the
  descriptor-theft routes. Three exploits demonstrated against earlier revisions
  now fail: a `futimens` mtime forge, a same-UID `/proc/<pid>/fd` reopen, and
  `pidfd_open` + `pidfd_getfd` descriptor theft. Full receipt: **I97**.
- **Item 4's remaining hard gates begin at the composition, not at the
  foundations.** Items 1, 2, 3 and 5 are landed and reviewed; **item 4 is
  closed by R116** on its qualified-host evidence, with two scoped exceptions
  carried forward (escaped-`setsid` containment → item 7; `drain_errors`
  precedence in isolation → in-repo coverage only).
  What is still open is item 6 — raw pre-BA and
  refined model snapshot construction, a child-proposed alignment, and
  parent-recomputed Sim3 and pose digests — and then item 7's composition. Only
  after item 6 may a descriptor-safe
  materializer→raster→backend→runner→publisher lifetime compose the
  I93/I94/I95/I96/I97 prerequisites under the single carried lease-aware
  deadline. Only after independent review may that composition produce
  comparable reprojection/registration/verified-loop evidence on local-scratch
  scan `95266be1`; unchanged evidence cannot pass and trajectory shape remains
  diagnostic-only. Queue replay/fork behavior, downstream consumers, and the
  canonical refine → {fuse→mesh-solve, splat} → Present four-manifest join
  remain unproved. No production DB or Storage run has occurred.
- **GPU stages remain disabled and unregistered.** Persistent `STAGES` remains
  `ingest,solve,drawings` and nothing registers `scan_pipeline.refine`. Do not
  register it, add a GPU stage, or start a GPU worker merely because the
  adapter, toolchain pin and doctor pass. ⚠ **Corrected:** earlier revisions of
  this document said DeskDev's worker "remains inactive". It does not.
  `patina-scan-worker` is **enabled**, and the box has rebooted, so the unit is
  active and running (host observation; not checkable from this repository).
  That is a divergence between the intended qualification posture and reality,
  and reconciling it is **the owner's call, not an agent's** — do not
  `systemctl` anything to make the document true.
- **Next safe execution packet:** ordered item 6. Construct the raw pre-BA and
  refined model snapshots, have the child propose the alignment, and have the
  parent recompute and verify Sim3 and the pose digests before the six
  persistent engine artifacts are produced.
  `NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT` is the flag that names
  this gap and it is `False`. Only then item 7: compose the I93 raster adapter,
  I94 owner-scoped acquirer/native descriptor transport, I95 backend/evidence
  contracts, I96 packet/supervision foundations, and I97's lease, toolchain,
  ledgers and output channel with the existing runner/publisher boundaries under
  one descriptor-safe workspace and the single carried deadline. Enforce I94's
  service-owned local-file contract (or move parent hashing behind a killable
  helper); the current synchronous `pread` cannot preempt a kernel-stalled
  FUSE/network file. The archive packet must be proven for 200–400 frames
  without exceeding the 64-file/4-GiB native boundary, and
  `PILOT_200_400_FRAME_RANGE_QUALIFIED` is still `False`.
  Keep `production_enablement=disabled`, keep the composition unregistered, and
  exercise it only on reviewed local scratch. Do not claim a GPU queue task or
  run `95266be1` through production DB/Storage. Disable DeskDev suspend before
  any Refine enablement, or first make the lease-clock contract suspend-aware.

## Current repository and runtime state

This is the exact state at which a new agent should resume:

- The I97 line is on branch **`field-capture/refine-i97-final`**, pushed, with
  its record appended as I97. It descends from `d7861b6d` (the I96 tip that was
  `origin/main` at the previous handoff). Confirm where `origin/main` actually
  is before assuming; do not infer it from this document.
- The clean integration worktree used for the record work is
  `/Users/kody/Code/patina-merged/.claude/worktrees/agent-i97-final`.
  Do not use the shared `/Users/kody/Code/patina-merged` checkout for writes;
  it carries unrelated user changes and is intentionally not synchronized.
- The I97 line is a set of item branches merged into one integration line, each
  reviewed adversarially before the next stacked on it. The merge points, oldest
  first:

  | Commit | Purpose |
  | --- | --- |
  | `2ae6b8ae` | item 1 — parent-provisioned descriptor-rooted workspace lease |
  | `ca77bc4a` | item 3 — pinned toolchain identity and command allowlist |
  | `9dee8b23` | per-option COLMAP argv confinement + lease byte budget |
  | `10d6cc4d` | item 4 fix — accept a Linux kernel thread's zero process group |
  | `7ee854df` | item 2 — parse the optional source and adapter ledgers |
  | `efcc7720` | item 5 — freeze the seven-descriptor engine output handoff |
  | `e0bb309c` | lease errno classification: default retryable, symlinks pre-open |
  | `2887dd0e` | tip — comment defects on the pre-open symlink gate |

- The new implementation module is
  `services/scan-pipeline/src/patina_scan_worker/refine_colmap_toolchain.py`.
  The heavily changed integration points are `refine_native_process.py` (the
  lease, the output channel, the freeze vault and the seal),
  `refine_packet_extractor.py`, `refine_colmap_command.py`, `refine_runner.py`,
  `refine_publisher.py`, and `storage.py`. New test files are
  `tests/test_refine_native_outputs.py`, `tests/test_refine_workspace_seam.py`,
  `tests/test_refine_colmap_toolchain.py`, and the two helpers
  `tests/_colmap_toolchain.py` and `tests/_json_recursion.py`.
- The worker was not installed, restarted, or run as part of this line. No
  production DB, Storage, queue, DeskDev, or real-scan mutation occurred.
  ⚠ The *intended* posture remains `patina-scan-worker` inactive with
  `STAGES=ingest,solve,drawings`; the *actual* posture on the box is the unit
  enabled and running after a reboot (host observation). Persistent `STAGES` is
  unchanged and no Refine stage is registered, so nothing GPU-side can be
  claimed by it — but the document no longer describes the box, and closing that
  gap is Kody's decision.

### Resume verification

Run these read-only checks from the integration worktree before changing code:

```bash
cd <your own worktree>            # never the shared checkout
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short --branch
git diff --check origin/main...HEAD
python3 scripts/workstream_state.py .   # expect: next I = I98
```

The posture probes should remain visibly false/unregistered. There are now
**fourteen** `*_QUALIFIED` flags across three modules, not the three the I96
handoff listed:

```bash
rg -n '_QUALIFIED = ' services/scan-pipeline/src/patina_scan_worker   # 14, all False
rg -n '^NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT = ' \
  services/scan-pipeline/src/patina_scan_worker/refine_native_process.py
rg -n '^DEFAULT_STAGES = ' \
  services/scan-pipeline/src/patina_scan_worker/config.py
rg -n 'scan_pipeline\.refine' \
  services/scan-pipeline/src/patina_scan_worker   # comments only, no registration

# The byte-pin that says the backend did not move:
git rev-parse HEAD:services/scan-pipeline/src/patina_scan_worker/refine_colmap_backend.py
# expect 6743e66eb06369d18e34b0054d10734e03a109ec (identical at 0b7b47fa)
```

Expected values are all fourteen qualification flags `False`,
`NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT` `False`, `DEFAULT_STAGES =
"ingest,solve,drawings"`, and no stage registration or dispatch. Do not “prove”
a new runtime by editing a flag or adding a handler; that would invalidate the
disabled-foundation boundary.

### Verification commands

The I97 line's standing gate is a **Linux container**, not the macOS host —
most of what this code asserts is invisible off Linux (see *Verification
lessons* below). Run it first; anything else is supplementary.

```bash
# THE gate. Expect: 1136 passed, 3 skipped.
docker run --rm -v "$PWD":/w -w /w/services/scan-pipeline python:3.12-slim \
  sh -c "pip install -q 'pytest>=7.4' 'httpx>=0.24,<1.0' 'numpy>=1.26' && \
         python -m pytest -q tests/test_refine*.py tests/test_storage.py -rs"
```

The three skips are load-bearing and must be read, not counted: a root-owned
fixture that cannot express a non-root-owner refusal under a root euid, the
`pidfd_getfd` theft whose positive control Docker's default seccomp profile
refuses to let anyone build, and a mode-000 directory that cannot refuse a root
euid. Under `--security-opt seccomp=unconfined` the pidfd theft runs and the
count moves to 1137/2. Never convert a skip into a pass by weakening its
assertion; the skip text is the evidence.

Supplementary, in an isolated Python environment with the scan-pipeline test
dependencies — never the system Python and never the deployed worker:

```bash
PY=/path/to/scan-pipeline-test-venv/bin/python

# Full queue-independent Refine regression suite (macOS skips far more).
"$PY" -m pytest -q services/scan-pipeline/tests/test_refine*.py

# Exact isolated installer/package gate (no project environment or lockfile).
uv run --no-project --python 3.12 \
  --with 'pytest>=7.4' \
  --with 'build>=1.2,<2' \
  --with 'setuptools>=68' \
  --with 'wheel>=0.41' \
  --with 'httpx>=0.24,<1.0' \
  python -m pytest -q \
    services/scan-pipeline/tests/test_install_script.py \
    services/scan-pipeline/tests/test_packaging.py

python3 -m compileall -q services/scan-pipeline/src/patina_scan_worker \
  services/scan-pipeline/tests
bash -n services/scan-pipeline/install.sh
git diff --check
```

The recorded results at this handoff are **1136 passed / 3 skipped** in the
container gate, and **1139 passed / 0 skipped** on the qualified host (host
measurement, reported by the operator; not reproducible from this repository).
The container number is the one an agent can re-derive, and the one to quote.

## Verification lessons (procedure, not commentary)

I97 spent most of its cost on verification that was not verifying. Treat the
following as procedure.

**A green local gate is not evidence for this codebase.** Each environment is
blind to a different part of what the code asserts, and the blind spots are
exactly where the bugs were:

- **macOS** cannot see `/proc`, child-subreapers, `O_PATH`, or inode-number
  recycling. Whole guards are structurally unreachable there.
- **An aarch64 container** cannot see kernel threads (its PID namespace has
  none), real ext4 allocation, Yama, or `pidfd_getfd` (Docker's default seccomp
  profile refuses the syscall outright, so the exploit hides).
- **Only the qualified host** sees the rest. Item 4's blocker — `pgrp == 0`
  rejected, so every *successful* native Refine call failed
  `REFINE_ENGINE_CLEANUP_FAILED` — survived two green gate environments and
  every review round before it, and was found the first time the code met a real
  Linux `/proc`.

**Anti-vacuity habits.** The review rounds on this line converged on four, and
all four were learned by finding tests that proved nothing:

1. **Sweep every clause of a changed function against the full selection.** Not
   the file's own tests — the whole gate. Six of nine clauses of
   `_parse_linux_process_stat` were deletable with zero red, because they shared
   an exception class and `pytest.raises` could not tell them apart. Counting
   tests finds none of these; deleting a clause and demanding a red does.
2. **Assert the exact message per row.** A substring that every clause of a
   guard emits means whichever clause happens to fire satisfies the assertion,
   and the others are uncovered. One row per disjunct, each input chosen so only
   its own clause can reject it.
3. **Write expected tables out literally.** Reading an expectation off the
   module under test makes the test a tautology. Where the table must stay in
   sync with a constant, AST-parse the module's own literal and assert set
   equality, so drift on either side reddens.
4. **Construct the condition for real rather than monkeypatching the syscall.**
   Build the symlinked root, the self-looping root, the FIFO, the mode-000
   directory, the full filesystem — and assert the real errno before asserting
   the verdict. A patched `os.open` proves the handler runs, not that the
   condition reaches it.

**Retracted.** An earlier claim in this line that four tests fail under the
production non-root identity is **withdrawn**: they pass as uid 1000 on the
qualified host on both trees. The failures observed were environment-specific
(a fixture built under an inherited `umask 002` and refused, correctly, by the
shipped trust checks) and were fixed at `86c460f9` by giving every fixture
directory an explicit mode. Do not re-derive a permissions story from that
episode.

**Corrected.** The qualified host's kernel is **`7.0.0-28-generic`**, not
`6.17.0-35`. The `6.17.0-35` figure appeared in a docstring alongside
measurements that could not be reproduced and was removed from the source at
`b47ab2c8`; it should not be reintroduced anywhere. Both kernel strings are host
facts — neither is checkable from this repository.

## I97 implementation contract for the next agent

Treat the following as implementation law, not suggestions. Items 1–2 and 4 are
carried unchanged from the I96 contract; 3 and 5 are **superseded** by I97 and
rewritten here; 6–10 are new.

1. The packet is an exact uncompressed USTAR archive. It has one declared
   request, 3–400 engine images, at most one source ledger, at most one adapter
   ledger, no special files, no PAX/GNU/sparse extensions, exact canonical
   metadata, exact two-block termination, and no trailing bytes.
2. All packet reads are pinned to descriptors and use positional I/O. The
   extractor revalidates chunk size/hash and the extracted request before the
   caller can consume it. The native context must be the exact privately sealed
   `NativeChildContext`; a lookalike or property-inspection failure is rejected.
3. **(superseded)** The workspace is parent-provisioned, not child-owned. The
   parent creates a private 0700 lease beneath a caller-named container, pins
   both by descriptor, leases a duplicate down over SCM_RIGHTS with the reverse
   direction declared in the ready envelope and re-verified by the child, and
   purges the tree from the same `finally` that reaps the leader — after normal
   return, timeout, SIGTERM, and SIGKILL — bounded by depth and entry budget, not
   by the deadline. Cleanup pins each entry with `O_PATH` **before** touching it:
   `(st_dev, st_ino)` is not an identity where inode numbers recycle, and a held
   reference is what makes the later comparison mean sameness. The residual is
   named and unchanged: the final `unlinkat`/`rmdir` is still name-based.
4. The command helper accepts bounded absolute argv, inherits the native group
   and deadline, and refuses successful phase advancement while adopted
   children remain. It detects escaped descendants but does not yet contain
   them. Cleanup and exception failures are fail-closed with cleanup precedence.
5. **(superseded — now implemented)** The output handoff is seven
   child-to-parent descriptors: the six persistent engine artifacts plus a
   scratch raw pre-BA snapshot, named as a closed token universe before the child
   exists. The parent does **not** trust the child's size/digest ledger: it opens
   the same names relative to its own pinned lease descriptor, requires the same
   `(st_dev, st_ino)`, hashes its own descriptor, and refuses unless its own
   computation reproduces the declaration. The child may still propose
   aligned/Sim3 bytes and the parent must recompute and verify the alignment and
   the pose digest — that half is **item 6 and does not exist yet**, which is
   what `NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT = False` means. Do not
   make the child's proposal authoritative.
6. Output bytes are frozen **by construction, not by inspection**. Each output
   is copied at receipt into an `O_TMPFILE | O_EXCL` anonymous file the parent
   creates in a private 0700 vault on the lease's own filesystem, and hashed from
   that copy's own descriptor. No subset of `fstat` can prove bytes did not
   change — a same-length rewrite plus `futimens` forges every remaining field —
   so do not reintroduce a stat-comparison freeze proof.
7. The freeze vault drops the process's dumpable flag
   (`prctl(PR_SET_DUMPABLE, 0)`) before any copy exists, which closes
   `/proc/<pid>/fd` reopen and `pidfd_getfd` theft at their common gate,
   `ptrace_may_access`. The price is permanent: no core dump and no live
   debugger for this worker. Do not "temporarily" remove the seal to debug.
8. Argv path options are confined **per option**, each to one leased surface:
   `--image_path` reads `packet/`; `--input_path`, `--database_path` and
   `--output_path` are rooted at writable `work/`; `tmp/` is nobody's artifact
   surface. Collapsing these onto one root makes
   `--output_path <lease>/packet/images` plannable, which overwrites the
   hash-validated extracted source images the evidence builder binds to.
   `_validate_workspace_path` is **lexical only** — a symlink planted inside
   `work/` still escapes it.
9. The command environment is the exact 13-key `COMMAND_ENVIRONMENT_ALLOWLIST`,
   never inherited, with every writable value confined to `APP_DIR` or the
   private workspace so `ProtectSystem=strict` holds. The toolchain pin rejects
   drift rather than adapting to it, and every value knowable only from the box
   stays a declared input in `OWED_BOX_VALUES` — do not guess one to make a
   check pass.
10. Lease-provisioning refusals classify by **errno**, not exception type, and
    default **retryable**, with the fatal side enumerated (`ELOOP`, `ENOTDIR`,
    `EACCES`, `EPERM`, `EROFS`, `ENAMETOOLONG` — each a statement about the
    operator's configuration, not the host's momentary state). The reason is the
    bounded retry budget in `complete_agent_task`: a wrongly retryable permanent
    error costs a bounded attempt budget, while a wrongly fatal transient error
    is unrecoverable. Keep the known-transient rows even though they fall to the
    default — the row is what puts the errno's name in the journal line.

## Ordered next-work packet

Do not start composition or enablement until each item below has an owner,
tests, and an independent adversarial review. **Item 6 is where you resume.**

1. ✅ **DONE (I97).** Parent-provisioned, descriptor-rooted 0700 workspace with a
   bounded reverse-FD lease; parent cleanup after normal return, timeout,
   SIGTERM and SIGKILL; `O_PATH` entry pinning so an identity comparison is
   sound where inode numbers recycle. Also refuses a symlinked or non-canonical
   container before any `os.open`, and a lease root too long to host a COLMAP
   path option (960-byte cap, 64 reserved for the longest reviewed argv tail).
2. ✅ **DONE (I97).** Source and adapter ledgers parsed with a closed role
   universe, one-ledger-per-role cardinality, exact packet-root paths, a 4 MiB
   ledger ceiling, descriptor-relative re-read against the manifest digest, and
   source rows bound one-to-one to engine-request frames. The adapter ledger is
   envelope-only — its per-row content was derivable from the engine request, so
   it was removed rather than validated. The 200–400-frame pilot band is exposed
   as constants and deliberately **not** enforced
   (`PILOT_200_400_FRAME_RANGE_QUALIFIED` is `False`).
3. ✅ **DONE (I97).** Executable-identity pinning re-proven immediately before
   `execve`, a 13-key closed command environment, per-option argv confinement,
   and a pinned toolchain identity that rejects drift. The single lease-aware
   deadline is carried through every command, helper, and drain thread.
4. ✅ **CLOSED (R116).** Evidence: I97 plus
   `docs/design/field-capture/p2-item4-qualified-host-acceptance-2026-07-27.md`
   — a DeskDev run at commit `77b4ff19` re-measuring all four named acceptance
   clauses on the qualified x86_64/ext4 host.

   The qualified-host run paid for itself immediately:
   `_parse_linux_process_stat` rejected `pgrp == 0`, which every Linux kernel
   thread reports (283 of 547 live PIDs on that box), so **every successful
   native Refine call failed `REFINE_ENGINE_CLEANUP_FAILED`**. Fixed and
   re-proven on the host — zero parse failures across every live `/proc` row,
   every `pgrp 0` row confirmed a kernel thread by absent `VmSize` and absent
   `cmdline`, zero userland. The other clauses: subreaper state transition and
   adopted-grandchild reaping through the shipped helpers; adopted-child
   reaping and quiescence scoped to a real child group leader (member named
   when live, quiescent when the leader is dead and alone); the
   escaped-`setsid` descendant, accepted **as scoped** — the group scan cannot
   see an escapee (a blind spot by construction, since a `setsid` child has its
   own pgrp) while the shipped adoption/`waitpid` scan does see it and the call
   fails closed; and cleanup precedence, driven through the real
   `run_inherited_colmap_command` in a real `setsid` leader with no
   monkeypatching and with paired controls, showing
   `REFINE_ENGINE_CLEANUP_FAILED` replacing `REFINE_ENGINE_FAILED` and
   `REFINE_ENGINE_TIMEOUT`. The gate ran 1139 passed / 0 skipped four times
   (three under `umask 022`, one under the ambient `0002`), so the five
   Linux-only lifecycle tests that skip on macOS all executed.

   **Two scoped exceptions are carried forward by R116 — do not drop them:**
   (a) **escaped-`setsid` containment is still open** and belongs to item 7's
   composition; only *detection* was in item 4's scope, and the receipt records
   the group-scan blind spot as a measured fact rather than a pass.
   (b) **Precedence over the `drain_errors` branch in isolation is in-repo
   coverage only**, not a host measurement — on that host the drain fault
   surfaced as a *cleanup* error, so no case produced `drain_errors` non-empty
   with `cleanup_errors` empty to compare against.

   R116 is a pipeline/acceptance judgement, blessed and logged. It closes item 4
   and nothing else: skips still cannot be converted into acceptance by changing
   tests, every downstream hard gate is untouched, and Kody's P2 milestone gates
   (M2 dense mesh, M3 walkthrough/click-to-measure, M4 maker quote) remain his
   to call.
5. ✅ **DONE (I97).** Seven-descriptor native output handoff, frozen by
   construction (`O_TMPFILE` copy at receipt, hashed from the copy) behind a
   `PR_SET_DUMPABLE` seal. Runner display-path reopening is removed: engine
   artifacts and frame inputs are both descriptor-pinned, and a successful run
   has no reason to call `open` at all.
6. ⬅ **NEXT.** Construct raw pre-BA and refined model snapshots, have the child
   propose alignment, and have the parent recompute/verify Sim3 and pose digests
   before producing the exact six persistent engine artifacts. This is the half
   of the output contract I97 did **not** implement;
   `NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT` is the flag that says so.
7. Compose materializer → raster → backend → runner → publisher only on local
   scratch. Require comparable reprojection, registration, verified-loop, and
   evidence-builder results for `95266be1`; unchanged evidence is a failure and
   trajectory shape remains diagnostic-only.
8. Only after all of the above, Kody’s P2 gates (dense mesh, walkthrough/click-
   to-measure, and maker quote without a site visit) can be requested. Refine,
   Fuse, and Splat remain unregistered until Kody explicitly passes the gate.

## Safe operating rules for this handoff

- Never run `install.sh`, `systemctl`, a GPU doctor, a queue task, a real scan,
  `supabase db push`, or Storage writes as part of I98 resume work. This now
  includes *not* stopping or disabling `patina-scan-worker` to make the
  "intended posture" line true — that is Kody's call, not an agent's.
- Never blanket-push migrations. The live Field Capture queue head is 00378;
  re-query the ledger and use the sanctioned surgical path if a later task
  explicitly authorizes a migration.
- Never edit `DECISIONS.md` by hand. Draft an `I_NEXT` block, run
  `scripts/workstream_state.py`, then use `scripts/append_entry.py --check`
  followed by the real append.
- Never write from the shared dirty checkout, use `git add -A`, reset hard, or
  overwrite user work. Use a dedicated worktree and explicit pathspecs.
- Keep `field-capture/refine-i97-final` and `origin/main` aligned before
  beginning I98; if another commit has landed, rebase/merge in the isolated
  worktree and rerun the container gate before pushing.

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
  source copy → `sudo ./install.sh` → `systemctl restart`. Keep GPU stages
  absent during qualification, and disable host suspend before Refine is ever
  enabled. ⚠ The worker unit is `enabled` and the box has rebooted, so it is
  active and running — the older "keep the worker inactive" instruction no
  longer describes the box. Persistent `STAGES` is still
  `ingest,solve,drawings` and no Refine stage is registered, so the running unit
  claims no GPU work; reconciling posture with intent is Kody's decision. The
  host's kernel is `7.0.0-28-generic` (host observation); the `6.17.0-35` figure
  that once appeared in a docstring was wrong and was removed at `b47ab2c8`.
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
- **Operator items opened by I97:**
  - The **toolchain manifest generator is still owed.** I97's toolchain pin
    reads a canonical installed manifest at
    `/opt/colmap/4.0.2/share/patina/refine-colmap-toolchain-v1.manifest.json`,
    and `install-colmap-4.0.2.sh` does not emit it. Until it does, the pin is
    inert and `OWED_BOX_VALUES` lists exactly what an operator must produce
    (executable sha256 and size, `gcc-11 -dumpfullversion`, the PyCOLMAP wheel
    sha256, and the manifest itself). Do not guess any of them to make a check
    pass.
  - `/tmp/pytest-of-kody` on the box holds stale entries from a killed run
    (host observation). Harmless, but it will confuse the next person reading
    scratch on that machine.
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
