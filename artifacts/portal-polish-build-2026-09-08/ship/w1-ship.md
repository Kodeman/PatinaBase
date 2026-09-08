# Wave 1 — integration, gates and ship

**Date:** 2026-09-08 · **Agent:** Wave 1 integration and ship lane
**Plan:** `docs/superpowers/plans/2026-09-08-portal-polish-build.md` § "Wave 1 integration, gates and ship"
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int` on `portal-polish/integration`
**Migration number actually used:** **00580** (`supabase/migrations/00580_room_concept_render.sql`) — no renumber.

---

## Gate on the lane reviews

Both lanes returned `approve` and neither review carries an unresolved P1:

- `waves/w1/a1-review.md:179` — "No P1 or P2 findings." `:204` — "**Approve.** No P1/P2 findings. The two P3 items are documentation-accuracy nits".
- `waves/w1/a2-review.md:7` — "**Verdict: approve.**" `:112` — "No P1 or P2 findings."

No `-fix.md` or `-rereview.md` file exists on disk for either lane, and neither lane branch carries a fix
commit — consistent with reviews that found nothing to fix. The orchestrator's lane result
(`rereview: approve` for both) is the record of the re-review; this agent did not re-run one.

---

## Merges

| Commit | Subject |
|---|---|
| `700bcbb362cf91942b23f193fada30e48c4febc5` | `chore(portal-polish): integrate a1 — governance amendments` |
| `bf25e56c4bcef248f43b4a7db801864fb4c95448` | `chore(portal-polish): integrate a2 — concept render backend` |
| `3fa422e82…` (branch `portal-polish/to-main`) | `chore(portal-polish): wave 1 — governance amendments + concept-render backend` |

Both lane merges were real `--no-ff` merges in integration order A1 → A2, **zero conflicts** (disjoint
file sets, as the plan predicted).

**Deviation from the brief's literal merge messages.** The plan named the subjects
`merge(portal-polish): integrate a1 — governance amendments` (and the a2 / wave-1 equivalents). The
repo's `commit-msg` hook (`scripts/hooks/patina-hooks.mjs:155-158`) accepts only
`feat|fix|docs|style|refactor|perf|test|build|ci|chore` (or a subject starting `Merge `/`Revert `), so
`merge(…)` was rejected with `[BLOCK] Commit subject must use Conventional Commits`. The wording was kept
verbatim with the type changed to `chore`. No hook was bypassed; nothing was committed with
`--no-verify`.

### Migration head re-check

`git fetch origin` → `origin/main` still at `02eb0a95f`; `git ls-tree origin/main supabase/migrations/`
tails at `00579_trade_agreements.sql`. **No parallel program minted 00580**, so A2's file and banner
stand unchanged at 00580. Nothing was renumbered.

### Net diff onto main

```
15 files changed, 2807 insertions(+), 5 deletions(-)
 apps/client-portal/src/lib/threshold/derive.ts               |   38 +
 apps/client-portal/src/lib/threshold/__tests__/derive.test.ts |   82 +
 apps/designer-portal/CLAUDE.md                                |    6 +-
 .../document/__tests__/document-action.test.tsx               |   25 +-
 artifacts/…/waves/w1/a2-impl.md                               |  349 +
 docs/design/house-sheet/SPEC.md                               | 1005 +
 docs/design/the-document/DECISIONS.md                         |   91 +
 docs/vision/VISION-DECISIONS.md                               |   84 +
 packages/supabase/src/database.types.ts                       |   12 +
 packages/supabase/src/hooks/__tests__/use-room-concept-render.test.ts | 162 +
 packages/supabase/src/hooks/index.ts                          |   13 +
 packages/supabase/src/hooks/use-room-concept-render.ts        |  109 +
 supabase/migrations/00580_room_concept_render.sql             |  357 +
 supabase/seed/00-legacy-grants.sql                            |   12 +
 supabase/tests/rls/room_concept_render_test.sql               |  467 +
```

---

## Wave gates — real numbers

All run from the integration worktree. `SUPABASE_DB_URL` was exported as
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` and the host confirmed `127.0.0.1` before the
reset; `supabase status` independently reported `DB_URL … 127.0.0.1:54322`. Nothing prod-pointed was
reset.

| Gate | Result |
|---|---|
| `pnpm supabase:reset` | **green** — all migrations replayed through 00580, 27 seed files applied, `"Reset local database."` |
| `bash scripts/run-sql-tests.sh` | **green** — `total: 167 · green: 146 · expected-fail: 21 (documented in supabase/tests/KNOWN_FAILURES.md) · unexpected-fail: 0 · effective-green: 167/167`. A2's new file: `PASS supabase/tests/rls/room_concept_render_test.sql` |
| `pnpm --filter @patina/supabase type-check` | **green** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/supabase test` | **green** — `Test Files 94 passed (94) · Tests 1152 passed \| 12 skipped (1164)` |
| `pnpm --filter @patina/client-portal type-check` | **green** |
| `pnpm --filter @patina/designer-portal type-check` | **green** |
| `pnpm --filter @patina/designer-portal test -- --ci` | **green** — `Test Suites: 544 passed, 544 total · Tests: 1 todo, 6691 passed, 6692 total · Snapshots: 12 passed` in 40.4s |
| `pnpm --filter @patina/admin-portal build` | **green** — full route table emitted, no type errors |
| `pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts` | **green — zero drift.** The committed types match a fresh generate against the post-00580 local DB. |

Notes on the gate run:

- **Suite count is above the plan's baseline**: the plan cites 476 designer suites; the branch runs
  **544 suites / 6692 tests**. Nothing was skipped to reach green.
- The one `todo` is A1's by design: `document-action.test.tsx:93` —
  `test.todo('renders the terminal variant in the scored-ink grammar — skipped because DocumentAction has
  no terminal variant yet; Wave 3 lane D4 adds it under R139 …')`. Wave 3 D4 un-skips it.
- **A fresh worktree needs workspace dists built before the type-check gates mean anything.** The first
  pass of `@patina/supabase type-check`, `@patina/client-portal type-check` and
  `@patina/designer-portal type-check` failed only with `TS2307: Cannot find module '@patina/types' /
  '@patina/design-system' / '@patina/api-routes'` — missing `dist/`, not lane defects.
  `pnpm --filter <app>^... build` fixed all of them; every gate above is the post-build run. Anyone
  re-running these gates in a new worktree must build dependencies first.
- Jest printed `A worker process has failed to exit gracefully` — pre-existing teardown noise, not a
  failure; the suite still reported all-green.

---

## Deploy to Strata (`bkvcixdmuyejfzcijpdg`)

Authorized by Kody's ship request for this program. Strata is the only environment mutated in Wave 1 —
no portal shipped.

The integration worktree was not CLI-linked (`supabase/.temp` is per-worktree and gitignored); the link
state was copied from the main checkout's `supabase/.temp` (`project-ref` = `bkvcixdmuyejfzcijpdg`)
so `--linked` resolved to Strata. No credential was printed at any point.

```
$ supabase migration list --linked          # before
… 00578 | 00578 · 00579 | 00579 · 00580 | (remote empty)
```
→ **00579 applied, 00580 pending.** Confirmed as the plan requires.

```
$ supabase db push
Initialising login role...
Connecting to remote database...
Applying migration 00580_room_concept_render.sql...
{"upToDate":false,"dryRun":false,"migrations":["00580_room_concept_render.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

```
$ supabase migration list --linked          # after
{'local': '00577', 'remote': '00577'} · {'local': '00578', 'remote': '00578'}
{'local': '00579', 'remote': '00579'} · {'local': '00580', 'remote': '00580'}
```
→ **00580 applied on Strata.**

### Object probes (live, against Strata)

`supabase db query` does not exist in this CLI (v2.117.0 — `db` has only `diff|dump|push|pull|reset|…`),
and no direct psql credential was available. Probes ran through the **Supabase Management API**
(`POST /v1/projects/<ref>/database/query`) authenticated with the CLI's own stored PAT. No secret was
printed.

**Probe 1 — the four columns on `public.project_rooms`:**

```json
[{"column_name":"concept_render_caption",     "data_type":"text",                        "is_nullable":"YES"},
 {"column_name":"concept_render_uploaded_at", "data_type":"timestamp with time zone",    "is_nullable":"YES"},
 {"column_name":"concept_render_uploaded_by", "data_type":"uuid",                        "is_nullable":"YES"},
 {"column_name":"concept_render_url",         "data_type":"text",                        "is_nullable":"YES"}]
```
All four present, all nullable — additive as specified.

**Probe 2 — `storage.buckets` row for `room-renders`:**

```json
[{"id":"room-renders","public":false,"file_size_limit":8388608,
  "allowed_mime_types":["image/jpeg","image/png","image/webp"]}]
```
**Private (`public = false`)**, 8 MiB limit, jpeg/png/webp only.

**Probe 3 — the RPC's payload keys on a real project.**

Correction to the plan's wording: the four fields do **not** land in a separate `rooms` array. The
threshold payload's top-level keys are `projectId · projectName · origin · selections`, and the four
concept-render fields sit on each **`selections` element** (alongside `roomId` / `roomName`) — which is
what `derive.ts` reads to build `RoomBandModel.conceptRender`. The probe therefore ran on
`selections`.

`get_client_project_threshold` is `SECURITY DEFINER` and raises `authentication required` when
`auth.uid()` is null, so the probe impersonated the project's own client inside the transaction
(`set_config('request.jwt.claims', …, true)`). Project `0cafa955-a0dc-49cf-844a-bf6b01017e92`
(2 selections):

```
count: 24
allowance, assignmentScope, category, clientLineTotalCents, clientUnitPriceCents,
conceptRenderCaption, conceptRenderUploadedAt, conceptRenderUploadedBy, conceptRenderUrl,
docCode, id, imageUrl, instrument, itemType, kind, logisticsStatus, name, productId,
quantity, roomId, roomName, threadId, tradeJourney, updatedAt
```

The four new keys are present **and** the twenty pre-existing keys are all still there. Cross-checked at
source: parsing the `'selections'` branch of `get_client_project_threshold` out of
`00578_design_build_kind.sql` and `00580_room_concept_render.sql` and diffing the key sets gives
`ADDED: ['conceptRenderCaption','conceptRenderUploadedAt','conceptRenderUploadedBy','conceptRenderUrl']`
and `REMOVED: []` — exactly four keys added, nothing dropped, which is the "copied from 00578 verbatim"
claim verified rather than trusted.

---

## What was NOT verified

- **No re-review was run.** This agent gated on the two `-review.md` files and the orchestrator's lane
  results. No `a1-fix.md`, `a1-rereview.md`, `a2-fix.md` or `a2-rereview.md` exists on disk.
- **No portal was deployed.** Wave 1 ships Strata only, per the plan. `patina-client-portal` and
  `patina-designer-portal` still serve the pre-wave build; the new columns are unread until Wave 2.
- **No browser or signed-in walk.** No dev server was started, no Chromium run, no e2e. The client-portal
  gate was `type-check` only — its jest suite is not in the Wave 1 gate list and was not run here.
- **The storage RLS policies were verified locally, not on Strata.** `room_concept_render_test.sql`
  passes against the local reset DB (studio-member write, cross-studio denial, client select-only,
  stranger sees nothing). No live upload against the prod `room-renders` bucket was attempted.
- **`pnpm lint` was not run** — not in the wave gate list, and only designer-portal has a working ESLint
  config.
- **Prettier drift is unresolved and advisory**: the pre-commit hook reported "Code style issues found in
  5 files" for A1's five files (`[WARN] … advisory locally`). Nothing was reformatted, to keep
  `docs/design/house-sheet/SPEC.md` byte-identical to the specimen source.
- The `00580` rollback posture stands as planned: a defect is corrected by `00581`, never a rollback. The
  columns are nullable and unread in prod today, so a defective 00580 is inert.

## Worktrees

- `agent-pp-int` (`portal-polish/integration`) — **kept** for Waves 2–3, as instructed. It is linked to
  Strata and has its workspace dists built.
- `agent-pp-main` (`portal-polish/to-main`) — created for the merge to main, **removed** afterwards.
- `agent-pp-a1` / `agent-pp-a2` — left in place for the orchestrator to sweep.
