# W0 — legacy-spec baseline on main (read-only)

Program: US-14 arrival v3 → production. This piece changed **no source file** — it is a
read-only baseline run against `main` so the later ship gate can be "no NEW reds" instead
of a blanket "36 green."

- **main SHA (pinned):** `7dbd203bc15cf226460da6d96f016faf887a75b6` (short `7dbd203bc`)
- **Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w0-baseline`
  on branch `arrival-prod/w0-baseline`, created from that exact SHA, retired at the end of
  this run (see §6).
- **Server under test:** `next build --webpack` (production-style) + `next start -p 3000`,
  **not** `next dev`.

## 0. Preflight

```
df -h /
```
→ `926Gi` total, `53Gi` avail (≥ 45 GiB required — OK).

```
lsof -nP -iTCP:3000 -sTCP:LISTEN
```
→ empty (port free — OK).

## 1. Worktree

```
git -C /Users/kody/Code/patina-merged worktree add \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w0-baseline \
  -b arrival-prod/w0-baseline 7dbd203bc
```
First attempt failed sandboxed (`Operation not permitted` creating several `.env.example`
files during checkout — a Seatbelt read/write-deny pattern on `**/.env.*` collides with
git's checkout-time file creation). Cleaned up the half-created branch
(`git branch -D arrival-prod/w0-baseline`) and re-ran the identical command with
`dangerouslyDisableSandbox: true`; it then completed cleanly.

```
git -C .../agent-arr-w0-baseline rev-parse --show-toplevel HEAD
```
→
```
/Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w0-baseline
7dbd203bc15cf226460da6d96f016faf887a75b6
```
Confirmed: toplevel matches, HEAD matches the pinned SHA.

## 2. Bootstrap

`pnpm --dir <WT> install` — sandboxed run failed (`ERR_PNPM_GenericFailure … Operation not
permitted … reflink` into `node_modules`); re-ran unsandboxed → succeeded (`Done in 24s`,
3403 packages resolved, Prisma clients generated for services/media, orders, projects).

`pnpm turbo build --filter=@patina/designer-portal^...` (run via `cd <WT> && pnpm turbo …`;
`pnpm --dir <WT> turbo …` itself failed with `EACCES` spawning the directory as an
executable — a pnpm/turbo CLI-parsing quirk, not a sandbox issue) →
**6 successful, 6 total** (5 cache hits + 1 fresh build of `@patina/help-system`; packages in
scope: agent-queue, api-routes, auth, catalog-ui, design-system, email, help-system,
notifications, shared, supabase, types, utils).

## 3. Local stack + env

`.env.example` could not be read directly — the session's sandbox `read.denyOnly` list
includes `/Users/kody/Code/patina-merged/**/.env.*`, which matches `.env.example` too (a
tool-level denial before any command ran, not a bash-runtime EPERM, so it was not retried
unsandboxed). The **exact `NEXT_PUBLIC_SUPABASE_*` variable names** were instead confirmed
from source (grep across `apps/designer-portal/src` and `wrangler.jsonc`'s committed prod
`vars` keys — names only, no values printed):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_STORAGE_KEY`
- `SUPABASE_ORIGIN_RUNTIME` (confirmed present as a wrangler var key; left **unset** per
  instructions)
- (`NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL` also referenced in source; not required for this
  build/run)

`supabase status` (from `<WT>`, unsandboxed — sandboxed run hit `EPERM` writing
`~/.supabase/telemetry.json.tmp…`): stack **running**, `API_URL = http://127.0.0.1:54321`.

**Build env vars exported (names only):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from `supabase status -o env`'s
`API_URL`/`ANON_KEY`), `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` (same anon key, per instruction),
`NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'`.
`SUPABASE_ORIGIN_RUNTIME` confirmed unset in the same shell. Key values were piped directly
from `supabase status -o env` into shell variables and never echoed.

**Deviation (necessary, not scope creep):** running the 36-file Playwright batch also
required `SUPABASE_SERVICE_ROLE_KEY` in the **test-runner process's** own env — several specs
import `e2e/helpers/supabase-admin.ts`, which throws synchronously
(`SUPABASE_SERVICE_ROLE_KEY missing…`) if that var is absent, independent of the server under
test. This is the same **local** demo service-role key `supabase status` prints (not a prod
secret; `playwright.config.ts`'s own `webServer.env` block already inlines the equivalent
local demo keys literally, with a comment stating they are "not secrets, safe to inline").
Exported it the same way (piped from `supabase status -o env`, never echoed) for the test
run only.

## 4. Build

```
next build --webpack
```
(with the trio above exported, `NEXT_PUBLIC_FLAG_OVERRIDES` set, `SUPABASE_ORIGIN_RUNTIME`
unset) → succeeded. Route manifest includes `○ /desk` and `ƒ /doc/[id]` (confirms the routes
under test compiled). One pre-existing warning, unrelated to this baseline:
`⚠ "next start" does not work with "output: standalone" configuration` (next start still
served correctly — see §5).

```
grep -rl bkvcixdmuyejfzcijpdg apps/designer-portal/.next/static
```
→ **empty** (exit 1 / no matches). Confirmed: the prod Supabase ref is **not** inlined.

## 5. Serve

```
next start -p 3000
```
(same env, backgrounded). `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/version`
→ **200** on the first attempt (`✓ Ready in 89ms`).

## 6. Spec list

```
grep -rlE "goto\(['\"\`]/(desk|doc/)" apps/designer-portal/e2e
```
→ **36 files** (matches the ~36 expectation):

```
census/lens-cost-census.spec.ts
document/action-visibility.spec.ts
document/arrival-arc.spec.ts
document/desk-claims.spec.ts
document/desk-error-state.spec.ts
document/desk-walkthrough.spec.ts
document/gate-ceremony.spec.ts
document/help-panel.spec.ts
document/hours.spec.ts
document/lens-a11y.spec.ts
document/lens-band-height.spec.ts
document/lens-cls.spec.ts
document/lens-contrast.spec.ts
document/lens-density.spec.ts
document/lens-fling.spec.ts
document/lens-rail-budget.spec.ts
document/lens-reduced-motion.spec.ts
document/margin-handoffs.spec.ts
document/mobile-margin-sheet.spec.ts
document/plan-room.spec.ts
document/prework-regions.spec.ts
document/quiet-release-contracts.spec.ts
document/quiet-responsive-shell.spec.ts
document/spec-book-workspace.spec.ts
document/workflow-stage-responsive.spec.ts
field/field-coordination.spec.ts
library-configuration/commission-walk.spec.ts
library-configuration/decisions-compare.spec.ts
library-configuration/picker-configure.spec.ts
library-configuration/spec-book-dimensions.spec.ts
mood-board/project-board-paths.spec.ts
people/bring-forward.spec.ts
people/call-sheet.spec.ts
wave2-screenshots.spec.ts
wp3-screenshots.spec.ts
wp4-screenshots.spec.ts
```

## 7. `playwright.config.ts` — confirmed

`baseURL: 'http://localhost:3000'`; `webServer.command: 'pnpm dev'`,
`webServer.url: 'http://localhost:3000'`, **`reuseExistingServer: !process.env.CI`** — true
whenever `CI` is unset, so with `CI` unset Playwright reuses the already-running `:3000`
server instead of spawning its own `pnpm dev`. Projects: `chromium`, `firefox`, `webkit` (no
`mobile-chrome` project in this base config).

**Misstep caught and corrected:** the first run attempt exported `CI=1` to silence
`forbidOnly`-style noise, which had the side effect of flipping `reuseExistingServer` to
`false`; Playwright immediately refused with
`Error: http://localhost:3000 is already used, make sure that nothing is running on the
port/url or set reuseExistingServer:true` and **zero tests ran** (verified the `:3000` server
was still healthy afterward, then re-ran with `CI` unset).

## 8. Playwright run — exact command

```
cd apps/designer-portal
# in one shell, after exporting the trio above (+ SUPABASE_SERVICE_ROLE_KEY) and
# confirming CI is unset:
pnpm exec playwright test --project=chromium \
  e2e/census/lens-cost-census.spec.ts e2e/document/action-visibility.spec.ts \
  e2e/document/arrival-arc.spec.ts e2e/document/desk-claims.spec.ts \
  e2e/document/desk-error-state.spec.ts e2e/document/desk-walkthrough.spec.ts \
  e2e/document/gate-ceremony.spec.ts e2e/document/help-panel.spec.ts \
  e2e/document/hours.spec.ts e2e/document/lens-a11y.spec.ts \
  e2e/document/lens-band-height.spec.ts e2e/document/lens-cls.spec.ts \
  e2e/document/lens-contrast.spec.ts e2e/document/lens-density.spec.ts \
  e2e/document/lens-fling.spec.ts e2e/document/lens-rail-budget.spec.ts \
  e2e/document/lens-reduced-motion.spec.ts e2e/document/margin-handoffs.spec.ts \
  e2e/document/mobile-margin-sheet.spec.ts e2e/document/plan-room.spec.ts \
  e2e/document/prework-regions.spec.ts e2e/document/quiet-release-contracts.spec.ts \
  e2e/document/quiet-responsive-shell.spec.ts e2e/document/spec-book-workspace.spec.ts \
  e2e/document/workflow-stage-responsive.spec.ts e2e/field/field-coordination.spec.ts \
  e2e/library-configuration/commission-walk.spec.ts \
  e2e/library-configuration/decisions-compare.spec.ts \
  e2e/library-configuration/picker-configure.spec.ts \
  e2e/library-configuration/spec-book-dimensions.spec.ts \
  e2e/mood-board/project-board-paths.spec.ts e2e/people/bring-forward.spec.ts \
  e2e/people/call-sheet.spec.ts e2e/wave2-screenshots.spec.ts \
  e2e/wp3-screenshots.spec.ts e2e/wp4-screenshots.spec.ts \
  --reporter=line --workers=2
```

Run twice against the same live server for evidence: once with `--reporter=line` (human-
readable failure detail) and once with `--reporter=json` (for an exact per-file breakdown —
`line` only lists individual failing tests, it doesn't attribute the large "did not run"
count to files). **Totals matched exactly between the two runs**, confirming no flakiness
between passes:

- line run: `45 passed`, `37 failed`, `4 skipped`, `86 did not run` (172 total)
- json run: `expected: 45`, `unexpected: 37`, `skipped: 90` (= 4 + 86) (172 total)

The large "did not run" count is `test.describe.configure({ mode: 'serial' })` fallout: once
one test in a serial-mode file fails, Playwright marks the rest of that file's tests as not
run — a same-file cascade, not 86 independent new failures.

## 9. Result table — spec → verdict → first error line

`PASS` = every test in the file passed. `FAIL` = at least one test failed (cascade skips in
the same file are folded into that file's `FAIL`, not counted separately).
`SKIP (fixme, pre-existing)` = the file's only test carries a `test.fixme()` annotation in
the source today — not something this baseline run caused.

| Spec | Verdict | pass/fail/skip | First error line |
|---|---|---|---|
| census/lens-cost-census.spec.ts | FAIL | 0/1/0 | `Error: expect(locator).toBeVisible() failed` |
| document/action-visibility.spec.ts | FAIL | 1/1/2 | `Error: expect(locator).toContainText(expected) failed` |
| document/arrival-arc.spec.ts | SKIP (fixme, pre-existing) | 0/0/1 | — |
| document/desk-claims.spec.ts | **PASS** | 6/0/0 | — |
| document/desk-error-state.spec.ts | FAIL | 1/1/0 | `Error: expect(locator).toBeVisible() failed` |
| document/desk-walkthrough.spec.ts | FAIL | 2/1/0 | `Test timeout of 60000ms exceeded.` |
| document/gate-ceremony.spec.ts | **PASS** | 4/0/0 | — |
| document/help-panel.spec.ts | FAIL | 0/1/3 | `Test timeout of 60000ms exceeded.` |
| document/hours.spec.ts | FAIL — **needs own config** (STUDIO-gated subtests skip without `studio-workspaces:true`, per contract note; the 1 failure below is independent of that flag) | 0/1/7 | `Error: expect(received).toBe(expected) // Object.is equality` (doorway leaves `?sheet=hours` in the URL) |
| document/lens-a11y.spec.ts | FAIL | 0/1/6 | `Error: the long paper (b0000000-0000-0000-0000-0000000000d5) is not seeded: 0 lines across 0 rooms, need >=60 lines and >=4 rooms. Run scripts/the-document-lens-seed.sql.` |
| document/lens-band-height.spec.ts | FAIL | 0/1/23 | same "long paper not seeded" error |
| document/lens-cls.spec.ts | FAIL | 0/1/1 | same "long paper not seeded" error |
| document/lens-contrast.spec.ts | FAIL | 0/1/6 | same "long paper not seeded" error |
| document/lens-density.spec.ts | FAIL | 0/1/12 | same "long paper not seeded" error |
| document/lens-fling.spec.ts | FAIL | 0/1/0 | same "long paper not seeded" error |
| document/lens-rail-budget.spec.ts | FAIL | 0/1/5 | same "long paper not seeded" error |
| document/lens-reduced-motion.spec.ts | FAIL | 0/1/5 | same "long paper not seeded" error |
| document/margin-handoffs.spec.ts | FAIL | 3/1/1 | `Error: expect(locator).toHaveCount(expected) failed` |
| document/mobile-margin-sheet.spec.ts | FAIL | 0/2/3 | same "long paper not seeded" error |
| document/plan-room.spec.ts | FAIL | 0/1/0 | `Error: expect(locator).toHaveCount(expected) failed` |
| document/prework-regions.spec.ts | FAIL | 0/1/9 | `Error: expect(locator).toBeVisible() failed` |
| document/quiet-release-contracts.spec.ts | FAIL | 2/1/0 | `Error: expect(received).toBe(expected) // Object.is equality` |
| document/quiet-responsive-shell.spec.ts | FAIL | 10/1/1 | `Error: expect(locator).toBeVisible() failed` |
| document/spec-book-workspace.spec.ts | **PASS** | 1/0/0 | — |
| document/workflow-stage-responsive.spec.ts | FAIL | 1/6/0 | `Error: expect(locator).toBeVisible() failed` |
| field/field-coordination.spec.ts | FAIL | 0/2/0 | `Error: seed project failed: studio_id_not_designer_studio` |
| library-configuration/commission-walk.spec.ts | FAIL | 0/1/0 | `P0001 studio_id_not_designer_studio` (DB check/FK tied to studio ownership, via seed RPC) |
| library-configuration/decisions-compare.spec.ts | FAIL | 0/1/0 | `P0001 studio_id_not_designer_studio` |
| library-configuration/picker-configure.spec.ts | FAIL | 0/1/2 | `P0001 studio_id_not_designer_studio` |
| library-configuration/spec-book-dimensions.spec.ts | FAIL | 0/1/1 | `P0001 studio_id_not_designer_studio` |
| mood-board/project-board-paths.spec.ts | **PASS** | 7/0/0 | — |
| people/bring-forward.spec.ts | **PASS** | 2/0/0 | — |
| people/call-sheet.spec.ts | **PASS** | 3/0/0 | — |
| wave2-screenshots.spec.ts | FAIL | 0/2/0 | `Test timeout of 60000ms exceeded.` |
| wp3-screenshots.spec.ts | FAIL | 2/1/1 | `Error: expect(locator).toBeVisible() failed` |
| wp4-screenshots.spec.ts | FAIL | 0/1/1 | `Error: Command failed: psql … WP4 procurement-lifecycle screenshot fixture (ruling R7, DECISIONS I121–I125)` |

**Summary: 6 PASS, 29 FAIL, 1 SKIP (pre-existing fixme). 36/36 files accounted for.**
Individual-test totals (both runs agreed): 45 passed, 37 failed, 90 skipped/did-not-run
(172 total).

Two failure families dominate and are almost certainly single root causes, not 29
independent regressions:
- **8 files** fail on `the long paper (…d5) is not seeded: 0 lines across 0 rooms` — the
  shared local Postgres's long-paper fixture isn't currently seeded for this stack.
- **4 files + field-coordination** fail on `P0001 studio_id_not_designer_studio` — a
  seed/RPC-side studio-ownership check rejecting the fixture's project insert.

Neither is arrival-related; both are pre-existing conditions of the shared local Postgres at
the time of this run. The **gate for later waves is "no NEW reds" against this table**, not
these totals being green.

## 10. Cleanup

```
kill <next start pid>
git -C /Users/kody/Code/patina-merged worktree remove --force \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-arr-w0-baseline
git -C /Users/kody/Code/patina-merged branch -D arrival-prod/w0-baseline
lsof -nP -iTCP:3000 -sTCP:LISTEN   # empty afterward
```

No source file was modified. `supabase db reset` was never run; no seed data was written
outside the specs' own fixtures (which produced their own pre-existing failures, documented
above, not created by this run).
