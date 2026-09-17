# W2 Gates — client-page-2/integration

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`
Branch: `client-page-2/integration` @ `930630794`
Date: 2026-09-04

## 0. Local stack confirmation

`supabase/config.toml` `[db] port = 54322`; `supabase status`:

```
"DB_URL":"postgresql://postgres:postgres@127.0.0.1:54322/postgres"
"API_URL":"http://127.0.0.1:54321"
"STUDIO_URL":"http://127.0.0.1:54323"
```

Local, not Strata. Safe to reset.

## 1. DB gate — PASS

`export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres; pnpm supabase:reset`

```
Applying migration 00563_proposal_signing_multi_studio.sql...
Applying migration 00564_client_signoff_approval.sql...
Applying migration 00565_the_client_page.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
... (28 seed files, incl. supabase/seed/the-client-page.sql)
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

`pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts` → **exit 0, no diff** (types in sync).

`bash scripts/run-sql-tests.sh`:

```
================ summary ================
total:             154
green:             133
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:   154 / 154  (green + expected-fail)
===========================================
```

unexpected-fail = 0. PASS.

## 2. `@patina/supabase` — PASS

`pnpm --filter @patina/supabase test` (vitest):

```
 Test Files  84 passed (84)
      Tests  989 passed | 12 skipped (1001)
   Duration  3.38s
```

`pnpm --filter @patina/supabase type-check` (`tsc --noEmit`) → exit 0, no output.

## 3. `@patina/client-portal` — PASS (with a pre-existing coverage-floor breach, see below)

### type-check
`pnpm --filter @patina/client-portal type-check` (`tsc --noEmit`) → **exit 0, no diagnostics**.

### full jest with coverage
`pnpm --filter @patina/client-portal test:coverage`

```
Test Suites: 2 failed, 159 passed, 161 total
Tests:       1 failed, 1947 passed, 1948 total
Snapshots:   0 total
Time:        16.345 s
```

Both failures are the two known, pre-existing ones and nothing else:
- `src/lib/data/__tests__/orders.test.ts` — suite fails to run: `Cannot find module '../orders'`
- `src/lib/__tests__/portal-access.test.ts` — `foreignPortalFromDomain('manufacturer')` returns the maker-workspace object, not null

Both reproduce identically at the merge-base `26b15145e` (see baseline below), so neither is a W2 regression.

### coverage table — requested sections

`src/components/threshold` (94.36 % stmts / 84.12 branch / 93.90 fn / 96.45 lines):

```
 src/components/threshold          |   94.36 |    84.12 |    93.9 |   96.45 |
  approval-ask.tsx                 |   94.85 |    85.36 |   94.73 |   96.85 | 137,187,199,625
  consent-copy.ts                  |     100 |      100 |     100 |     100 |
  correspondence.tsx               |   98.18 |    90.69 |     100 |     100 | 51,166,283-284
  details-sheet.tsx                |   96.09 |       76 |   90.47 |   96.66 | 300,527-550
  door-acts.tsx                    |   91.08 |    80.59 |   85.71 |   93.68 | 137-138,152,173,289,339
  door-gate.tsx                    |   94.23 |    85.03 |   83.33 |   97.87 | 265,442
  doorplate.tsx                    |     100 |      100 |     100 |     100 |
  doorstep.tsx                     |     100 |    94.73 |     100 |     100 | 51
  earlier-invoices.tsx             |   92.68 |    73.68 |     100 |   94.44 | 80-81
  ground-floor.tsx                 |     100 |      100 |     100 |     100 |
  house-ledger.tsx                 |     100 |      100 |     100 |     100 |
  instrument-reading.tsx           |     100 |      100 |     100 |     100 |
  letterbox.tsx                    |     100 |    94.59 |     100 |     100 | 198,265,293
  mat-classes.ts                   |     100 |      100 |     100 |     100 |
  mat.tsx                          |     100 |      100 |     100 |     100 |
  other-houses.tsx                 |     100 |      100 |     100 |     100 |
  papers-sheet.tsx                 |   92.23 |    86.56 |     100 |   93.81 | 398-399,455-456,461-462
  payment-method-chooser.tsx       |   96.15 |    93.75 |     100 |     100 | 98-106
  plan-key.tsx                     |    92.1 |    68.75 |   91.66 |   96.96 | 73
  previously.tsx                   |     100 |      100 |     100 |     100 |
  review-ask.tsx                   |   84.74 |    78.49 |   86.66 |   87.27 | 120-128,151,409,553-582
  road-orders.tsx                  |   93.33 |    82.97 |     100 |     100 | 40-41,83-95,109,168-169
  room-band.tsx                    |   98.76 |    88.46 |     100 |     100 | 96,109,268,283,294,297,349-352,451
  room-capture.tsx                 |   98.63 |    80.32 |     100 |     100 | 60-71,108,213-217,294-307,332-333
  route-collapse.ts                |     100 |      100 |     100 |     100 |
  scope-change-ask.tsx             |   86.84 |    72.88 |   81.63 |   89.28 | 171,175,286-287,328-329,401-402,...
  settlement.tsx                   |   92.85 |    89.47 |      80 |   95.12 | 100-101
  since-yesterday.tsx              |   95.23 |    76.47 |     100 |     100 | 35-91,100
  story-pole.tsx                   |    98.3 |    92.53 |     100 |     100 | 57,118,127,241
  the-note.tsx                     |   96.55 |    82.35 |     100 |     100 | 35,131,163
  the-road.tsx                     |     100 |    96.66 |     100 |     100 | 191
  threshold-route-collapse.tsx     |   94.87 |    57.14 |     100 |     100 | 41,64-73
  threshold.tsx                    |   95.33 |       82 |   93.93 |   97.88 | 182,370,640,736,1019
  use-scroll-lock.ts               |     100 |      100 |     100 |     100 |
  wall-gate.tsx                    |      98 |    83.09 |     100 |     100 | 36,113-114,137,148,168,198,213,220,...
```

`src/lib/threshold` (98.83 / 89.93 / 99.32 / 99.60):

```
 src/lib/threshold                 |   98.83 |    89.93 |   99.32 |    99.6 |
  active-project.ts                |     100 |      100 |     100 |     100 |
  canonical-phases.ts              |     100 |      100 |     100 |     100 |
  checkout-return.ts               |   95.08 |    96.29 |     100 |     100 | 68
  correspondence.ts                |   97.29 |    77.64 |   96.15 |   96.66 | 235-239
  derive.ts                        |   99.35 |    92.02 |     100 |     100 | 273,345-346,470,516,523,532-537,...
  expiry.ts                        |     100 |      100 |     100 |     100 |
  other-houses.ts                  |     100 |      100 |     100 |     100 |
  papers.ts                        |     100 |    89.47 |     100 |     100 | 137,190
  plan-key.ts                      |     100 |    95.23 |     100 |     100 | 104
  road-orders.ts                   |     100 |    80.64 |     100 |     100 | 79,108-113
  standing.ts                      |   99.04 |    95.31 |     100 |     100 | 29-34,235
```

`src/app` (the route-root files; `page.tsx` is the new front door):

```
 src/app                           |   69.04 |    66.66 |   57.14 |   66.66 |
  error.tsx                        |     100 |       50 |     100 |     100 | 54
  global-error.tsx                 |   83.33 |       50 |   66.66 |   83.33 | 110
  loading.tsx                      |       0 |      100 |       0 |       0 | 1
  not-found.tsx                    |       0 |      100 |       0 |       0 | 1-3
  page.tsx                         |      95 |      100 |      80 |   94.11 | 30
  providers.tsx                    |       0 |      100 |       0 |       0 | 9-22
```

### Coverage floor — PRE-EXISTING BREACH, improved by this branch

`jest --coverage` exits 1 on the global floor as well as on the failing suite:

```
All files                          |    57.5 |     53.3 |   57.33 |   58.99 |
Jest: "global" coverage threshold for statements (70%) not met: 57.5%
Jest: "global" coverage threshold for branches (60%) not met: 53.3%
Jest: "global" coverage threshold for lines (70%) not met: 58.99%
Jest: "global" coverage threshold for functions (70%) not met: 57.33%
```

Baseline check: ran the same `jest --coverage` in a scratch worktree at the merge-base
`26b15145e` (`chore(client-page): merge hotfix — /projects collapse`), node_modules symlinked
from this worktree:

```
All files                          |   51.41 |    47.65 |   50.85 |   52.85 |
Jest: "global" coverage threshold for statements (70%) not met: 51.41%
...
Test Suites: 2 failed, 130 passed, 132 total
Tests:       1 failed, 1397 passed, 1398 total
```

So the floor was already breached on main and this branch **raises** every metric
(stmts 51.41 → 57.50, branches 47.65 → 53.30, fns 50.85 → 57.33, lines 52.85 → 58.99).
The uncovered mass is long-standing untested legacy: `src/lib/websocket` (0 %),
`src/test-utils/**` (0 %), `src/components/today` (0 %), `src/lib/utils/format.ts` (37 %),
`src/types/project.ts` (0 %). Not a W2 regression; not fixed here (out of scope).

### eslint
`npx eslint src` → **87 problems (30 errors, 57 warnings)**.

Merge-base baseline `26b15145e`: **89 problems (33 errors, 56 warnings)** — so the branch
removes 3 errors and adds none. Every remaining error is in legacy code the retirement plan
deletes (`src/app/{inbox,messages,orders,proposals,quiz,field,auth}/…`, `src/hooks/use-*`,
`src/components/{timeline,notifications,auth,proposal-document}`), all react-compiler/
display-name/unescaped-entity rules.

Targeted run — `npx eslint src/components/threshold src/lib/threshold src/app/page.tsx src/middleware.ts`
→ **exit 0, no output: 0 errors and 0 warnings**. Confirmed clean in all four requested locations.

## 4. designer-portal + admin-portal — PASS

`pnpm --filter @patina/designer-portal type-check` → **exit 0, no diagnostics**.

`pnpm --filter @patina/designer-portal test` (full jest):

```
Test Suites: 510 passed, 510 total
Tests:       6104 passed, 6104 total
Snapshots:   1 passed, 1 total
Time:        32.26 s
Ran all test suites.
```

`pnpm --filter @patina/admin-portal build` (the repo's strictest gate — `next build --webpack`,
no `ignoreBuildErrors`, `typedRoutes: true`) → **exit 0**, full route table printed,
`.next/BUILD_ID` = `qLvohxWoVFGjXmRtot-bn`.

> ⚠ **False-green worth recording:** the FIRST admin build, run inside the Bash sandbox,
> exited **0** after printing only `Creating an optimized production build ...`. It had in
> fact been killed mid-compile: no `BUILD_ID`, no `.next/server`, and
> `.next/diagnostics/*.json` read `{"buildStage":"compile"}`. A sandboxed `next build`
> can report success without building. The pass above is the re-run with the sandbox
> disabled, verified by `BUILD_ID` + the emitted route table, not by exit code.

## 5. Edge functions (R1/L2-touched) — PASS

Functions changed vs the merge-base (all from R1's `33708cf07`):
`_shared/client-portal-links.ts`, `commercial-document-notify`, `comms-mute`,
`comms-notification-dispatch`, `create-checkout-session`, `notification-digest`,
`review-requests`, `stripe-webhook`.

```
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/_shared/client-portal-links.test.ts \
  supabase/functions/commercial-document-notify/ \
  supabase/functions/create-checkout-session/ \
  supabase/functions/notification-digest/ \
  supabase/functions/stripe-webhook/

ok | 82 passed | 0 failed (323ms)
```

**Not covered:** `comms-mute`, `comms-notification-dispatch` and `review-requests` ship no
`*.test.ts` at all, so there is no Deno suite to run for those three — their R1 edits
(deep-link URL changes) are covered only indirectly by `_shared/client-portal-links.test.ts`.
No stray root `deno.lock` was created (`--config` was passed).

## 6. E2E — `threshold.spec.ts` 12/12 PASS; the rest of the suite is pre-existing rot

### Playwright config collapsed to ONE server / ONE project

`apps/client-portal/playwright.config.ts` ran two dev servers: `:3002` (shipped surface) and
`:3102` (`NEXT_PUBLIC_FLAG_OVERRIDES=threshold:true`, `NEXT_DIST_DIR=.next-threshold`), with the
`threshold` project pinned to the second. The flag override was the ONLY difference in behaviour
and the flag is dead (no code reads `threshold` or `single-pane`), so:

- one `projects` entry — `chromium`, no `testIgnore`; `threshold.spec.ts` now runs in the default sweep
- one `webServer` — `:3002`, `reuseExistingServer: true`, Supabase pins unchanged (local URL + demo
  anon key inline, service-role key from the environment). The pinning is kept exactly as it was.
- `next.config.js`: `distDir: process.env.NEXT_DIST_DIR || '.next'` removed (it existed only for the
  second server), and `/.next-threshold/` dropped from `apps/client-portal/.gitignore`.

### `threshold.spec.ts` extended — 12 tests, all green

```
Running 12 tests using 3 workers
  ✓ opens chrome-less, with the house named on the doorplate (11.8s)
  ✓ prints the five facts the seed put in the house (11.8s)
  ✓ draws the key with one link per seeded room (11.8s)
  ✓ stands the standing note on the page, in the designer’s own words (12.1s)
  ✓ lands the solo client on “/” — her one house, and no header over it (11.8s)
  ✓ names the other houses on the mat for a client who keeps several (11.8s)
  ✓ stands the acceptance ask on the wall, with its act ready (11.6s)
  ✓ settling the balance reaches the checkout start and returns to the letterbox (18.7s)
  ✓ writes back to the note, in place (11.1s)
  ✓ opens the papers as a sheet laid in the page, not a route (10.8s)
  ✓ answers the retired routes with a 308 to the page anchor (6.4s)
  ✓ collapses /invoices onto the letterbox on the one page (10.5s)
  12 passed (54.0s)
```

Wave-2 coverage, item by item:

| Plan item | How it is covered |
|---|---|
| solo client lands on `/`, no header | `client-solo@patina.dev` signs in, lands `/`, doorplate = "Cedar Lane Study", `[data-testid^="header-"]` count 0, letterbox + mat both on `/` |
| multi-project client sees "Your other houses" | `client@patina.dev` lands `/`, `mat-other-houses` visible, heading present, exactly 2 `/projects/…` lines, none of them the house she is standing in |
| approve an approval | **the seed has none — the ask is asserted instead.** See the honest note below |
| settle the balance reaches checkout start | letterbox unfolded, `create-checkout-session` intercepted and asserted called exactly once carrying invoice `…cc01`, mocked receipt returns `/?checkout=success&invoice=…`, `letterbox-receipt` renders and the till params are struck off the address |
| write back to the note | on Aspen Loft (the seeded house that has a thread): "Write back" → field → "Send it" → `write-back-receipt`, no refusal, no route change |
| open the papers sheet | `mat-papers` → "The papers, in full" → `papers-sheet` with `role="dialog"`, `papers-sheet-instruments` present, URL unchanged, Esc dismisses |
| `/projects`, `/invoices` redirect (308) | `page.request.get(path, {maxRedirects: 0})` asserts status 308 and `Location` → `/` + the anchor, for `/projects`, `/invoices`, `/today` |
| `/today` redirects | same test, `/today` → `/#doorstep` |

**The approval, honestly.** There is no project-approval review in any seed. Verified directly on
the reset stack:

```sql
-- as each client, via SET LOCAL request.jwt.claims
select jsonb_array_length(coalesce(public.list_my_project_decision_reviews(),'[]'::jsonb));
--  client@patina.dev      → 0
--  client-solo@patina.dev → 0
```

So neither "approve an approval" nor "the ApprovalAsk renders" is reachable on this data. The ask
this fixture DOES stand is the maker's finished work held at the wall until the client signs for it
— the same ceremony, same shape — and the spec asserts `accept-trade-scope-name`, an enabled
"Accept the finished work", and the hint, while asserting `doorstep-approval` count 0. It does not
PRESS it: accepting is irreversible and would take the `$2,980` held draw off the page for every
later run of "prints the five facts". The ApprovalAsk's approve path stays covered by the unit suite
only (`approval-ask.test.tsx`), and I am flagging that as a real e2e gap, not papering it over.

### Three e2e mechanics the spec needed (all now in the file, with the reason written down)

1. **Hydration.** Every section is server-rendered before React attaches, so a click landing in that
   window is swallowed with no error. `signIn` and a shared `pressUntilOpen(act, opened)` press until
   the thing they open is actually there.
2. **The settle gate.** `threshold.tsx` holds everything below the doorplate behind
   `data-testid="threshold-hold"` until papers, goods, ledger, rooms AND letter have answered.
   A visible doorplate is NOT the page. A `settle(page)` helper waits for `threshold-hold` to reach
   count 0 — without it, five assertions raced the hold and failed.
3. **`load` never fires** reliably on these pages under `next dev`, so navigation waits are
   `domcontentloaded` + a rendered-testid wait, not `load`.

### `pnpm --filter @patina/client-portal test:e2e` (whole suite, incl. the smoke spec)

```
102 failed
2 did not run
16 passed (11.2m)
```

That looks alarming and is **pre-existing**. Baseline: the identical command at the merge-base
`26b15145e` (scratch worktree, node_modules symlinked, same local stack):

```
105 failed
2 did not run
6 passed (10.5m)
```

Per-file, failures are flat except where this branch fixed something:

| spec file | main | branch | delta |
|---|---:|---:|---:|
| tests/e2e/timeline-3d.spec.ts | 25 | 24 | −1 |
| tests/e2e/approvals.spec.ts | 17 | 17 | 0 |
| tests/e2e/project-timeline.spec.ts | 12 | 12 | 0 |
| tests/e2e/projects.spec.ts | 12 | 12 | 0 |
| tests/smoke.spec.ts | 12 | 12 | 0 |
| tests/e2e/timeline-3d-centering.spec.ts | 4 | 4 | 0 |
| tests/plans-link.spec.ts | 3 | 3 | 0 |
| tests/share-link.spec.ts | 3 | 3 | 0 |
| tests/projects-load.spec.ts | 4 | 3 | −1 |
| tests/field-link.spec.ts | 3 | 2 | −1 |
| tests/e2e/account.spec.ts | 2 | 2 | 0 |
| tests/e2e/quiz.spec.ts | 2 | 2 | 0 |
| tests/wave2-screenshots.spec.ts | 2 | 2 | 0 |
| tests/gate-ceremony.spec.ts | 1 | 1 | 0 |
| tests/plan-set.spec.ts | 1 | 1 | 0 |
| tests/spec-book-share.spec.ts | 1 | 1 | 0 |
| **tests/threshold.spec.ts** | **1** | **0** | **−1** |
| **tests/wp3-screenshots.spec.ts** | **0** | **1** | **+1** |
| **TOTAL** | **105** | **102** | **−3** |

- ~73 of the failures live in `tests/e2e/**` and are dead spec rot on both sides: they log in as
  `client@test.patina.local` / `TestClient123!` (an account that does not exist) at `/login`, and time
  out in `beforeEach`. Playwright's `testDir: './tests'` collects them; Jest's
  `testPathIgnorePatterns` does not. They have never passed on this stack.
- `tests/smoke.spec.ts` (12) fails identically on both sides — it drives `/dashboard`, `/projects`,
  `/profile`, `/timeline`, `/notifications`, `/settings`, all of which are the routes this program
  retires.
- **The one new failure is real and expected:** `wp3-screenshots.spec.ts` `openDecision()` goes to
  `/decisions/<id>` and waits for `project-approval-review`. R1 308s that path to `/#doorstep`, so the
  old page is gone. That spec belongs to the retirement plan's R1–R4 cleanup, not to this lane.
- `threshold.spec.ts`'s merge-base failure was the stale assertion this lane corrected: `/invoices`
  used to be asserted as landing on `/projects/<id>#letterbox`; R1 makes it `/#letterbox`.

**Bottom line:** the client-portal Playwright suite is 100+ failures deep on `origin/main`. This
branch does not regress it (net −3) and lands the one spec that matters at 12/12.

## 7. Renders — and one defect the render exposes

Captured signed in as `client-solo@patina.dev` on `/` against the local dev server (pinned at
`127.0.0.1:54321`), full page, `deviceScaleFactor: 1`:

- `artifacts/client-page-completion-2026-09-04/waves/w2/local-dev-desktop.png` — 1440×4489, 332 KB
- `artifacts/client-page-completion-2026-09-04/waves/w2/local-dev-phone.png` — 390×5127, 279 KB

Both under the 600 KB cap as captured; no `sips -Z` needed.

### First viewport, desktop (1440×900), against `docs/design/the-client-page/shots/path-b-first-viewport.png`

**What matches the mock.** The armature is right and reads as the same page. Studio name top-left in
mono caps, "PREPARED FOR NORA ELLISON" top-right, the house set in the display serif
("Cedar Lane Study"), a mono subline, the full-width hairline, then the two-column body with THE
STORY POLE in the left rail. The pole's current phase is marked in the accent ochre with "the house
stands here" under it, and "You stand at / the doorstep" sits at its foot with the caret. The
doorstep sentence is a real display-serif sentence ("Finished work waits for your acceptance."),
"Previously —" runs under it in mono, and WHAT CHANGED SINCE YESTERDAY + the reading-mark dateline
("Read here on the fourth of September.") sit on one line exactly as drawn. Right column: THE
LETTERBOX, the drawn envelope, the invoice line, OPEN THE LETTERBOX + PRINT as scored ink. Below the
fold, "One mark stands open on this drawing." with the plan key and HATCHED/SHUT/OPEN legend. No
header, no nav, no badges, no shadows, no tabs.

**Where it honestly differs.**

1. **A red error string is printed as content, in the first viewport.** Under the ledger:
   *"Project approvals could not be read just now. Refresh before taking action."* in a warm red.
   This is the exact thing VISION §6 and "absence is silence" forbid, and it is on screen for every
   homeowner on real data. Root cause is confirmed below — it is a defect, not a fixture gap.
2. **The ledger has one row where the mock has three.** Mock: "Owed on invoice No. 4", "Held on the
   paintwork", "Awaiting your name", then a two-line reading sentence. Ours: "The house stands at
   $11,100 agreed." and a single "Owed on the open invoice $4,060 · due 11 September" — no "Held"
   row, no "Awaiting your name" row, no closing sentence, and roughly 200px of dead white below it
   before the error line. The $2,980 held draw IS in the data (it renders further down in the plan
   key: "Built-in shelving, north wall — $2,980, held back until…"), so the ledger is not reading
   what the wall already knows. L9(b) asked for exactly those rows.
3. **"of $X planned" is missing.** Mock reads "The house stands at $61,400 agreed of $85,000
   planned."; ours stops at "$11,100 agreed." even though the seed sets `budget_cents = 1450000`.
4. **The story pole carries no date ranges** (mock: "March", "April–May", "week of 12 October").
   This one is correct by design — the seed has no `project_phases`, so L9(a)'s graduation omits
   ranges — but it does leave the rail thinner than the mock.
5. **No "CUT DEEPER" control** under the pole in the first viewport.
6. **A small stack of three hairlines floats above the studio name** top-left, with no counterpart in
   the mock.
7. Cosmetic/data, not defects: no place in the doorplate line ("Installation · September 2026" vs
   "Des Moines · Procurement · August 2026") because the seeded project has no location; the
   letterbox figures are the seed's, not the mock's.

### First viewport, phone (390×844)

Collapses correctly to one column: studio name and "PREPARED FOR…" stack, the house title, the story
pole becomes a row of six dots with the current one filled in ochre and "You stand at the doorstep"
under it, then the doorstep sentence, the changed line, the ledger, then THE LETTERBOX with the drawn
envelope. No header, no hamburger, no tabs — the promise holds at phone width.

**One phone defect:** the tester-notes widget (the dark circular "N") is anchored bottom-LEFT and
sits **on top of** the letterbox's last line — "…Balance $4,060, due September 11." is partly behind
it. L9(f) called for either padding the page by the widget's footprint or moving its anchor right on
≤600px; neither has taken effect here.

### ⛔ Defect found while rendering — CONFIRMED, high severity, first viewport, every client

`apps/client-portal/src/components/making/project-surface-switch.tsx:39` calls
`useProjectApprovals(projectId)`, which runs the **studio-scoped** RPC:

```
packages/supabase/src/hooks/use-project-approvals.ts:378
  runRpc('get_project_decision_reviews', { p_project_id: projectId })
```

`get_project_decision_reviews` (latest body: `supabase/migrations/00465_…`) authorizes only a design-
studio co-member or a `project_decision_authority_snapshots.decision_lead_id`. A homeowner is neither,
so it raises `insufficient_privilege`. Observed in the browser and reproduced in SQL:

```
# browser network log, signed in as client-solo@patina.dev on /
403 POST http://127.0.0.1:54321/rest/v1/rpc/get_project_decision_reviews   (×3)
threshold-approvals-error count = 1
text: Project approvals could not be read just now. Refresh before taking action.
```

```sql
begin; set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000c005","role":"authenticated"}';
select public.get_project_decision_reviews('b0000000-0000-0000-0000-00000000c0d1'::uuid);
-- ERROR: project decision reviews not found or access denied
-- CONTEXT: PL/pgSQL function get_project_decision_reviews(uuid) line 30 at RAISE
```

Grants are not the problem (`authenticated=X/postgres` on both RPCs) — the guard is.

**The retired page it absorbed did this correctly.** `src/app/decisions/page.tsx:48` uses
`useMyProjectApprovalReviews()` → `list_my_project_decision_reviews` (no args, caller-global,
sanitized inbox read, migration 00440), which returns `[]` cleanly for both seeded clients. L1's
brief said to copy the old page's exact hooks; this one was not copied.

**Fix (not applied — this is the gates lane):** `project-surface-switch.tsx` should read
`useMyProjectApprovalReviews()` and narrow to `projectId`, and the doorstep's error branch should say
nothing rather than print a sentence. The unit suite does not catch this because it mocks the hook.

## Commit

`83bab90ec` — `test(client): completion e2e — one page, acts in place, redirects`
Pathspecs: `apps/client-portal/{playwright.config.ts,next.config.js,.gitignore,tests/threshold.spec.ts}`
(4 files, +293 / −91). Pushed to `origin/client-page-2/integration` (`930630794..83bab90ec`).

The pre-commit hook warned of Prettier drift on all three edited source files. Verified the drift is
**pre-existing**: `npx prettier --check` fails on `next.config.js`, `playwright.config.ts` and
`threshold.spec.ts` as they stood at `930630794`, before this change. Not introduced here, not fixed
here (reformatting them would diverge from the surrounding code style).

## Verdict

| Gate | Result |
|---|---|
| 1 · DB reset + types + SQL suite | **PASS** — 154/154 effective, unexpected-fail 0, types diff clean |
| 2 · `@patina/supabase` test + type-check | **PASS** — 84 files / 989 tests, tsc clean |
| 3 · client-portal type-check | **PASS** |
| 3 · client-portal full jest w/ coverage | **PASS on tests** — only the two known failures; coverage floor breached but LOWER on main (51.41 % → 57.50 %) |
| 3 · client-portal eslint | **PASS in scope** — 0 errors and 0 warnings in `threshold/`, `lib/threshold/`, `app/page.tsx`, `middleware.ts`; 30 pre-existing errors elsewhere (33 on main) |
| 4 · designer type-check + full test | **PASS** — 510 suites / 6104 tests |
| 4 · admin build | **PASS** (only after re-running with the sandbox off — the sandboxed run exited 0 without building) |
| 5 · Deno edge tests | **PASS** — 82 passed / 0 failed |
| 6 · `threshold.spec.ts` | **PASS** — 12/12 |
| 6 · full client e2e suite | **NOT GREEN, and not green on main either** — 102 failed / 16 passed vs 105 failed / 6 passed at the merge-base; one new failure (`wp3-screenshots`) is R1 retiring `/decisions/[id]` |
| 7 · Renders | **CAPTURED** — and they expose a confirmed first-viewport defect (studio-only approvals RPC 403s for every client) |

**allGreen = false.** Two things stop it: the whole-suite e2e is deep in pre-existing failure (and
carries one new, expected R1 casualty), and the render walk found a real defect — the doorstep prints
`"Project approvals could not be read just now."` as content for every homeowner, because
`project-surface-switch.tsx` calls the studio-scoped `get_project_decision_reviews` instead of the
client-safe `list_my_project_decision_reviews` the retired `/decisions` page used.

## Not verified

- The ApprovalAsk's approve/decline/comment path end-to-end — no seed carries a project-approval
  review; unit tests only.
- The wall-gate acceptance act was asserted ready, never pressed (irreversible on shared seed data).
- Real Stripe. The checkout start is proven; the till itself is mocked at the edge-function boundary.
- Only chromium — the client-portal Playwright config has one browser project by design.
- `comms-mute`, `comms-notification-dispatch`, `review-requests` have no Deno tests to run.
- No prod anything: nothing pushed to Strata, no functions deployed, no portal deployed.
- Lint outside designer-portal is not trustworthy in this repo generally; the client-portal ESLint
  numbers above are reported as raw `npx eslint` output with a same-command merge-base baseline, not
  as "clean".
