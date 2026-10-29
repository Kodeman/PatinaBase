# RC-3c — RC-3b failure triage and G3 legacy on an owned stack

**Source candidate:** branch `r8-rc3-triage` off the program tip `1faae43c0` (code tip `7d5d872f3`). Test-only commits: `2cd4a05ae` (paper-order), `2dec0372b` (scale-profile origin), `d6e59889a` (help-state guard). No application code, Playwright config, migration or bundle budget changed.
**Date:** 2026-10-28–29
**Stack:** owned local Supabase project `patina-rc3c`, API `127.0.0.1:57321`, DB `127.0.0.1:57322` (shadow 57320, pooler 57329, analytics 57327), started from a scratch copy of this worktree's `supabase/` with only the five `.temp` version pins; `-x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`. 821 migrations applied through `00895`. DB system identifier `7701900121815347242`, distinct from the shared DB (`7701004642274893866`, read once, read-only, to prove the distinction; nothing else touched 54321/54322).
**Raw logs:** `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc3c.52w5bi/logs/` (cited below as `logs/`). Scratchpad paths are session-scoped and may not survive a session restart.

## Results at a glance

| Gate | RC-3b | RC-3c |
|---|---|---|
| G1 admin build | Failed: `Can't resolve '@patina/api-client'` | **Passes.** Harness artifact; see below. |
| G1 designer type-check / lint | Pass; 0 errors, 254 warnings | Pass; 0 errors, 254 warnings |
| G2 Jest | 984 suites passed, 1 failed; 15 tests failed | **985/985 suites, 14,159/14,159 tests passed** |
| G3 legacy Chromium | Blocked by the help-state guard | **15 passed, 2 failed, 1 skipped, 1 did not run.** After the missing lens seed was applied, 1 failure remains (desk-error-state:102, test budget). |
| G3 pieces (`playwright.pieces.config.ts`) | Not run | **41 passed, 33 skipped (WebKit, by design), 0 failed** |
| G4 scale-profile | 8 failed ("DB N, fetched 0") | **6 passed, 2 failed.** 36/80/500 pass on both projects; 2,000 fails on both on a real statement timeout. |
| G4 configured-placement:242 (Chromium) | Failed | Passed, first attempt |
| G4 rc4b-presentation:34 (WebKit-iPhone) | 320 failed (auth-setup timeout) | 390 and 320 both passed, first attempt |

## RC-3b failure classes: root cause and fix

### 1. G2 paper-order: `useServiceAcceptance is not a function` (fixed in `2cd4a05ae`)

The round-8 Closeout chapter lazy-loads `ServiceAcceptanceSection` and `StudioServiceSection`. `paper-order.test.tsx` mocks `@patina/supabase` explicitly, and that mock has no service-acceptance hooks, so both sections threw when they rendered. The fix mocks the two section modules in that test. The file passes 30/30, and the full suite passes (G2 below).

### 2. G4 scale-profile "Silent truncation: DB N, fetched 0" (fixed in `2dec0372b`)

`e2e/round8/scale-profile.spec.ts` filtered request and response capture on the literal origin `http://127.0.0.1:54321`. On the owned stack (57321) it recorded no `project_ffe_items` responses, so `fetched` was always 0 while the page still rendered N rows. The origin now comes from `NEXT_PUBLIC_SUPABASE_URL`; the file already requires that URL to be loopback. After the fix, the evidence JSON on both projects records fetched counts of 80, 80 and 500, each matching the DB, and rendered counts of 36, 80 and 500. The 36-line case renders a room subset of the 80-line job.

This fix uncovers a real failure at 2,000 lines, which RC-3b's zero count hid. See "Remaining failures".

### 3. G3 help-state guard (fixed in `d6e59889a`)

`e2e/helpers/help-state.ts` accepted only `127.0.0.1:54321` and `localhost:54321`. It now accepts `^https?://(127\.0\.0\.1|localhost):\d+(/|$)` and still throws `REFUSING …` for anything else. Probe (`logs/help-state-guard-probe.log`; tsx import of the real module, dummy service key, nothing contacted):

| `NEXT_PUBLIC_SUPABASE_URL` | Result |
|---|---|
| `https://bkvcixdmuyejfzcijpdg.supabase.co` | THROWS `REFUSING to run help-state e2e against a non-local Supabase URL` |
| `http://127.0.0.1:57321` | PASS (module loaded) |
| `http://localhost:57321/` | PASS (module loaded) |
| `http://127.0.0.1:57321@evil.example` | THROWS `REFUSING …` |
| `http://127.0.0.1.evil.example:57321` | THROWS `REFUSING …` |

No helper unit-test pattern exists under `e2e/helpers/`, so no test file was added.

**Port sweep** of `e2e/helpers/` and `e2e/round8/`. The only hard pins were the two above. Every other 54321/54322 occurrence is an `env ?? default` fallback that the run's env overrides (`psql.ts`, `supabase-admin.ts`, `workflow-gate-fixture.ts`, `lens.ts`, round-8 `global-setup`/`global-teardown`, `arrangements`, `cabinetry-cp01`, `identity-lineage`). The rest are deliberate shared-stack refusals (`consumer-journey.journey.ts`, `consumer-journey-fixture.sql`, `run-consumer-journey.mjs`). None was changed.

### 4. G1 admin build `@patina/api-client` (harness artifact, no change)

`@patina/api-client` is not in the designer portal's dependency closure. `turbo run build --filter=@patina/designer-portal^... --dry-run=json` lists 12 packages, and api-client is not among them (`logs/g1-designer-dep-scope.log`). RC-3b's G1 used that filter and then ran `pnpm --filter @patina/admin-portal build` directly, so `packages/api-client/dist` was never built. It was absent in this worktree before the run. The branch touches neither `packages/api-client` nor `apps/admin-portal` (`git diff --stat main...HEAD` is empty for both).

- `pnpm exec turbo run build --filter=@patina/admin-portal --concurrency=2` → exit 0, `Tasks: 8 successful, 8 total` (7 cached, admin build executed); `logs/g1-admin-build.log`.
- The cache hit for api-client was a replay, so it was also built from source: `pnpm exec turbo run build --filter=@patina/api-client --force` → exit 0, `2 successful, 2 total`, 0 cached; `logs/g1-api-client-force.log`.

**Correct G1 command for the admin build:** `pnpm exec turbo run build --filter=@patina/admin-portal`.

## G1 / G2 on the triage branch

- `pnpm --filter @patina/designer-portal exec jest --maxWorkers=2` → `Test Suites: 985 passed, 985 total`, `Tests: 14159 passed, 14159 total`, `Snapshots: 1 passed, 1 total`, 187.9 s, exit 0 (`logs/g2-jest.log`).
- `pnpm --filter @patina/designer-portal type-check` → exit 0 (`logs/g1-designer-typecheck.log`).
- `pnpm --filter @patina/designer-portal lint` → `✖ 254 problems (0 errors, 254 warnings)`, exit 0, equal to the baseline (`logs/g1-designer-lint.log`).

## G4 re-runs (round-8 config)

Env for every run: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:57321`, `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres`, `PLAYWRIGHT_DESIGNER_PORT=3420`, keys read from `supabase status --workdir <scratch> -o env` (never printed), and `PLAYWRIGHT_OUTPUT_DIR` set to a scratch directory.

| Command (from `apps/designer-portal`) | Result |
|---|---|
| `pnpm exec playwright test e2e/round8/scale-profile.spec.ts --config playwright.round8.config.ts --project=chromium --project=webkit-iphone --workers=1` | `2 failed`, `6 passed (5.7m)`. Failed: 2,000 lines on Chromium and on WebKit-iPhone. Log: `logs/g4-scale-profile.log`; per-size JSON in `../g4-scale/`. |
| `… e2e/round8/configured-placement.spec.ts:242 … --project=chromium` | `1 passed (1.2m)`, first attempt (`logs/g4-placement-r1.log`) |
| `… e2e/round8/rc4b-presentation.spec.ts:34 … --project=webkit-iphone` | `2 passed (1.2m)`, at 390 and 320, first attempt (`logs/g4-rc4b-r1.log`) |

**configured-placement:242 and rc4b-presentation:34.** Neither reproduces in isolation, and no retry was needed. In RC-3b, both failed during a single 214-test, 39-minute run on one long-lived dev server. That run hit an auth-setup timeout and a 60 s route-to-textbox wait. Classification: load- or order-dependent flakes. Confidence is medium, because isolation cannot rule out an ordering dependency on an earlier spec in the full run.

## G3 legacy on the owned stack

`playwright.config.ts` pins its webServer to 54321 and port 3000, with `reuseExistingServer: !CI`. Neither config was edited. Instead, a dev server owned by this run was started first on each port, so Playwright reused it (`next dev --webpack -p <port>` from `apps/designer-portal`; env pointed at 57321 with the owned keys; `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`). Ports 3000 and 3410 were free beforehand. The compiled dev output referenced `127.0.0.1:57321` and never `54321`.

**Flags.** The G3 gate is the legacy renderer ("G3 unchanged" in the program plan). The scored run therefore uses the flags the legacy config's own webServer sets: `procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true`. The pieces run adds the pieces config's `ask-the-paper:true,one-voice:true`. A control run with the round-8 flags is reported separately below.

### Legacy specs

`PLAYWRIGHT_HTML_OUTPUT_DIR=<scratch>/g3-base/html pnpm exec playwright test e2e/document/quiet-responsive-shell.spec.ts e2e/document/margin-handoffs.spec.ts e2e/document/desk-error-state.spec.ts --project=chromium --workers=1 --output=<scratch>/g3-base/results`

Result: **`2 failed`, `1 skipped`, `1 did not run`, `15 passed (5.8m)`** (19 tests; `logs/g3-legacy-baseflags.log`). Per-test outcomes come from the HTML report JSON:

| Test | Outcome |
|---|---|
| `desk-error-state.spec.ts:102` 20 consecutive desk loads | Failed: `run 12: expected exactly one of [empty-state line, job lines], got empty=false lines=false` / `Test timeout of 60000ms exceeded` |
| `quiet-responsive-shell.spec.ts:723` CROSS-project offer at 390 | Failed: `[data-document-shell]` not found; page read "No document answers to this name." |
| `quiet-responsive-shell.spec.ts:774` SAME-project control | Did not run (serial after :723) |
| `margin-handoffs.spec.ts:195` guide's gate act | Skipped (`test.fixme`) |
| All other 15, including `margin-handoffs.spec.ts:63` (failed in RC-3) and the three margin-handoffs cases RC-3 never ran | Passed |

**:723 root cause: missing precondition on a fresh stack.** Project `b0000000-…-0000000000d5` ("Aspen Loft — the long paper") comes from the manual seed `scripts/the-document-lens-seed.sql`. That file is not in `[db.seed]`, so `supabase start` does not load it. The shared stack used by RC-3 had it. The seed was applied to the owned DB container only (`docker exec -i supabase_db_patina-rc3c psql … < scripts/the-document-lens-seed.sql`, exit 0, 62 lines; `logs/g3-lens-seed.log`). Then one failure-only retry ran:

`… playwright test e2e/document/quiet-responsive-shell.spec.ts:723 …:774 e2e/document/desk-error-state.spec.ts:102 --project=chromium --workers=1 --reporter=list`

Result: `1 failed`, `2 passed (1.6m)`. Both :723 and :774 passed; :102 failed again with `run 13 … Test timeout of 60000ms exceeded` after 59.8 s (`logs/g3-legacy-baseflags-retry.log`).

**Net legacy G3 with the lens seed: 17 passed, 1 failed, 1 skipped.**

### Pieces config

`PLAYWRIGHT_OUTPUT_DIR=<scratch>/g3-pieces/results pnpm exec playwright test e2e/document/pieces-build-room.spec.ts --config playwright.pieces.config.ts --reporter=list` (reused the owned `:3410` server)

Result: **`33 skipped`, `41 passed (10.1m)`**, exit 0 (`logs/g3-pieces.log`). Chromium: 37 passed. WebKit-iPhone: 4 passed and 33 skipped by the spec's own `test.skip(browserName !== 'chromium', WALK_ONLY)`.

### Control: the legacy specs with the round-8 renderer on (informational, not scored)

The same three specs ran against a `:3000` server with the legacy flags plus the round-8 config's flags (`designer-paper-round8:true,one-voice:true,worktable:false,agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true`). Result: `3 failed`, `1 skipped`, `14 did not run`, `1 passed (1.8m)` (`logs/g3-legacy-round8flags.log`). The failures look for legacy-shell DOM that the round-8 renderer does not print: `getByTestId('day-sheet')`, `[data-document-spine]`, and `[data-margin-panel]` reading `stacked`. That confirms this suite covers the renderer-off path only. G4 is the round-8 coverage.

### Comparison with RC-3's G3

RC-3 ran the same three specs against shared 54321/54322 with base-config flags.

| | RC-3 | RC-3c (fresh stack) | RC-3c (with lens seed) |
|---|---|---|---|
| Passed | 13 | 15 | 17 |
| Failed | 2 (desk-error-state:102, margin-handoffs:63) | 2 (desk-error-state:102, quiet-responsive-shell:723) | 1 (desk-error-state:102) |
| Skipped | 1 | 1 (margin-handoffs:195 fixme) | 1 |
| Did not run | 3 | 1 (quiet-responsive-shell:774) | 0 |

`margin-handoffs:63`, which failed in RC-3 on `net::ERR_ABORTED; maybe frame was detached?`, passed here. So did the three serial cases that RC-3 never ran.

## Remaining failures and root causes

### A. G4 scale-profile 2,000 lines, both projects: a real defect at scale (statement timeout), not a harness problem

Evidence:

- **Test run.** The `project_ffe_items` page requests took 4.0 s and 6.8 s, and the third request hit 8.0 s and returned HTTP 500. The dev server logged `AppError: canceling statement due to statement timeout` for queryKey `['project-ffe-items', 'e6591000-…-000000002000']`. The query errored, the Pieces `spec-lens` never mounted, and the test failed on `toBeVisible` (60 s). WebKit showed the same pattern: 4.3 s, 7.3 s, then 500 at 8.0 s.
- **Standalone probe.** The probe signed in as the F01 actor and sent `useProjectFFEItems`'s exact select and order with `limit=1000` (`logs/probe-ffe-page-timing.log`, `logs/probe2-ffe-page-timing.log`).
  - The full select returned offset 0 in 3.7–5.9 s, and offset 1000 returned **500 / `57014` at 8.04 s** on all three tries. Offset 2000 returned 500 twice and 200 once, at 7.4 s.
  - `select=*` returned the same pages in 41–105 ms.
  - Running `ANALYZE` first did not help, so stale planner statistics are not the cause.
  - The `authenticated` role has `statement_timeout=8s`.
- **Per-column bisect** at offsets 0 and 1000 (`logs/probe-ffe-bisect.log`):
  - Each computed column costs about 0.7–1.8 s per page: `ffe_line_stage`, `ffe_line_authorization`, `ffe_item_suggested_lead_time_weeks/_source` and `ffe_item_effective_lead_time_weeks`.
  - `ffe_item_effective_lead_time_weeks` alone hit 8.0 s / 500 at offset 1000.
  - The embeds and `primary_image_url` cost 40–220 ms.
  - Cost rises with the offset. This suggests the computed columns are evaluated for the skipped offset rows too (inference, medium confidence; no `EXPLAIN` of PostgREST's generated SQL was captured).
- **History.**
  - The computed columns come from `00736` and `00839`, both already on `main`.
  - The paging loop (`range(offset, offset+999)` until a short page) is branch-only, from `bd5eac9a2` "fix(designer): page FF&E lines and bound spec transport". On `main`, the same job would silently truncate at 1,000 rows. On this branch, the second page times out and the whole Pieces read fails.
  - RC-3b's 2,000 runs did render 2,000 rows, so this load sits close to the 8 s limit and depends on the machine. Here it failed in 2 of 2 browser runs and 3 of 3 probe runs.

Severity: high for 2,000-line jobs. Confidence: high that the timeout is real and deterministic on this machine; medium on the offset-evaluation mechanism. **Not fixed here.** It is an application/data-path change outside RC-3c's harness scope, and it needs an owner decision: keyset paging, fewer computed columns in the list read, or cheaper functions.

### B. G3 desk-error-state:102: test budget, not a half-state

The 20-load loop has no `test.setTimeout`, so it runs under the config's 60 s default. Each `/desk` load on `next dev` takes about 4.5–5 s here, so the 60 s test timeout fires partway through run 12 or 13. RC-3 reached run 8. The `toPass` message printed is the last poll at the moment of the kill, not an observed half-state: `empty=false lines=false` is the still-loading desk. No load returned the error surface, and no load returned both states. Confidence: high that the failure is a budget problem. Whether the round-8 branch made `/desk` slower on dev than RC-3's tip was not measured. Not fixed: raising the spec's timeout is a spec change outside this brief.

## What was NOT verified

- No full 214-test G4 matrix rerun. Only the 10 RC-3b failures were re-run, so order and load dependence of the two singles stays unproven.
- No `EXPLAIN ANALYZE` of PostgREST's generated FF&E query. The offset-evaluation mechanism is inferred from timings.
- The `/desk` per-load time on `main` versus this branch was not compared (failure B).
- G5, RC-2, `@patina/supabase` tests, iOS, axe and screen-reader passes were not re-run here.
- The scored G3 is renderer-off by design. The round-8-on behaviour of these legacy specs is not a gate, and the control above only shows they target the legacy DOM.
- The lens seed is a manual precondition that the base config's documentation does not name for G3. It was applied only to the owned DB.

## Teardown

The probe fixtures were removed after each probe (scale cleanup, then the F01 global-teardown): 0 `e6591000-%`/F01 projects and 0 `f0180000-%` users remained. The owned dev servers on 3000, 3410 and 3420 were stopped by port. `supabase stop --workdir <scratch>/stack --no-backup` exited 0 with "Stopped supabase local development setup". After that, 0 `patina-rc3c` containers and 0 volumes remained, and `lsof` found no listeners on 57321, 57322, 3420, 3410 or 3000 (exit 1). The shared stack on 54321/54322 was still listening and was never stopped or reset (`logs/teardown.log`).
