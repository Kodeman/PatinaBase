# W3 Gates — client-page-2/integration

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`
Head at start: `99c02e67f488b2df479a6770ec57213861ffeeef`
Run date: 2026-09-04

---

## Gate 1 — DB (reset · types · SQL tests)

**Local target confirmed.** `supabase/config.toml` `[db] port = 54322`, `project_id = "supabase"` (identical in the main checkout, so the same container set).

```
$ supabase status
{"DB_URL":"postgresql://postgres:postgres@127.0.0.1:54322/postgres","API_URL":"http://127.0.0.1:54321", ...
 "STUDIO_URL":"http://127.0.0.1:54323", ...}
```
All 127.0.0.1 — local, not Strata.

### 1a. `pnpm supabase:reset` (with `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`)

```
Applying migration 00562_notification_log_owner_opened.sql...
Applying migration 00563_proposal_signing_multi_studio.sql...
Applying migration 00564_client_signoff_approval.sql...
Applying migration 00565_the_client_page.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
...
Seeding data from supabase/seed/the-client-page.sql...
...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```
PASS — full replay through `00565_the_client_page.sql`, all seeds applied.

### 1b. `pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts`

```
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
Connecting to db 5432
=== EXIT 0 ===
TYPES-IN-SYNC
```
PASS — no drift in `packages/supabase/src/database.types.ts`.

### 1c. `bash scripts/run-sql-tests.sh`

```
================ summary ================
total:             154
green:              133
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:    154 / 154  (green + expected-fail)
===========================================
```
PASS — **unexpected-fail: 0**.

---

## Gate 2 — `@patina/supabase`

### `pnpm --filter @patina/supabase test` (vitest)
```
 Test Files  84 passed (84)
      Tests  989 passed | 12 skipped (1001)
   Duration  3.61s
```
PASS

### `pnpm --filter @patina/supabase type-check`
```
> tsc --noEmit
(no output, exit 0)
```
PASS

---

## Gate 3 — `@patina/client-portal`

### `pnpm --filter @patina/client-portal type-check`
```
> tsc --noEmit
(no output, exit 0)
```
PASS

### `pnpm --filter @patina/client-portal test:coverage`
```
Summary of all failing tests
FAIL src/lib/__tests__/portal-access.test.ts
  ● foreignPortalFromDomain (authoritative, from middleware hint) › returns null for manufacturer (no manufacturer portal) and unknown values
    expect(received).toBeNull()
    Received: {"label": "the Patina maker workspace", "url": "https://manufacturer.patina.cloud"}
      > 122 |     expect(foreignPortalFromDomain('manufacturer')).toBeNull();

Test Suites: 1 failed, 114 passed, 115 total
Tests:       1 failed, 1512 passed, 1513 total
Time:        12.124 s
```

Global coverage line:
```
File            | % Stmts | % Branch | % Funcs | % Lines |
All files       |   71.23 |    65.82 |   71.51 |   73.34 |
```
- Floor 70 / 60 / 70 / 70 → **71.23 / 65.82 / 71.51 / 73.34 — coverageFloorMet = true.** Jest printed no coverage-threshold error; the only non-zero exit came from the one failing suite.
- The single failing suite is `src/lib/__tests__/portal-access.test.ts` — on the allowed list.
- `src/lib/data/__tests__/orders.test.ts` **no longer exists** (R2a deleted the dead orders suite). Remaining files in that dir: `active-project.test.ts`, `projects.test.ts`, `service-binding.test.ts`.

PASS (within the allowed-failure envelope).

### `npx eslint src` (from `apps/client-portal`)
```
✖ 54 problems (10 errors, 44 warnings)
```
**10 errors — gate expected 0. DEVIATION.** Errors by file:
```
src/app/auth/invite/[token]/page.tsx        111:44  react-hooks/purity
src/app/auth/verify-otp/page.tsx            131:23  react-hooks/refs  (×2)
src/app/field/[token]/site-request-guest.tsx 609:10 react-hooks/set-state-in-effect
src/app/quiz/results/results-view.tsx       348:5   react-hooks/set-state-in-effect
src/components/auth/ClientPortalLogin.tsx   120:46  react-hooks/set-state-in-effect
src/components/proposal-document.tsx        109:5   react-hooks/preserve-manual-memoization
src/hooks/use-aesthete-matches.ts            84:3   react-hooks/refs
src/hooks/use-feature-flag.ts               144:7   react-hooks/set-state-in-effect
src/hooks/use-hydrated.ts                    23:5   react-hooks/set-state-in-effect
```
All 10 are **pre-existing baseline, not introduced by this branch**: every one of those 9 files is byte-identical to `origin/main` (`git diff --quiet origin/main...HEAD -- <file>` returns clean for all 9), and neither `apps/client-portal/eslint.config.mjs` nor any package.json / pnpm-lock changed on this branch. So the same 10 errors reproduce on `origin/main`. Nothing in the client-page work added an error.

---

## Gate 4 — designer-portal + admin-portal

### `pnpm --filter @patina/designer-portal type-check`
```
> tsc --noEmit
(no output, exit 0)
```
PASS

### `pnpm --filter @patina/designer-portal test`
```
Test Suites: 510 passed, 510 total
Tests:       6104 passed, 6104 total
Snapshots:   1 passed, 1 total
Time:        22.722 s
```
PASS

### `pnpm --filter @patina/admin-portal build` (sandbox disabled)
Route table printed in full (55+ routes: `/`, `/dashboard`, `/studios`, `/studios/[id]`, `/fulfillment/*`, `/mission-control/*`, `/users/[id]`, `/preferences/unsubscribe`, …) plus:
```
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
```
$ ls -la apps/admin-portal/.next/BUILD_ID
.rw-r--r--@ 21 kody  4 Sep 15:58 .../apps/admin-portal/.next/BUILD_ID
$ cat .next/BUILD_ID
pbsgys40BbW_DCqiUwseM
```
PASS — admin-portal is the repo's strictest type gate (`typedRoutes: true`, no `ignoreBuildErrors`).

---

## Gate 5 — Edge functions (Deno)

Changed since `origin/main` (`git diff --name-only origin/main...HEAD -- supabase/functions`):
```
supabase/functions/_shared/client-portal-links.ts (+ .test.ts)
supabase/functions/commercial-document-notify/index.ts (+ core.test.ts)
supabase/functions/comms-mute/index.ts
supabase/functions/comms-notification-dispatch/index.ts
supabase/functions/create-checkout-session/index.ts
supabase/functions/notification-digest/index.ts (+ logic.test.ts)
supabase/functions/review-requests/index.ts
supabase/functions/stripe-webhook/index.ts
```
(No migrations changed on this branch.)

### `deno test --allow-all --config supabase/functions/deno.json` over every changed function
```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/commercial-document-notify/ \
    supabase/functions/create-checkout-session/ \
    supabase/functions/notification-digest/ \
    supabase/functions/stripe-webhook/ \
    supabase/functions/_shared/client-portal-links.test.ts

ok | 82 passed | 0 failed (282ms)
```
`comms-mute`, `comms-notification-dispatch` and `review-requests` carry no test files — nothing to run there; their type gate is the `deno check` below.

### `deno check` on every changed module
```
commercial-document-notify/index.ts   OK
comms-mute/index.ts                   OK
comms-notification-dispatch/index.ts  OK
create-checkout-session/index.ts      OK
notification-digest/index.ts          OK
review-requests/index.ts              OK
stripe-webhook/index.ts               OK
_shared/client-portal-links.ts        OK
```
PASS. Ran with `--config supabase/functions/deno.json`, so no stray root `deno.lock` was written.

---

## Gate 6 — E2E + curl probes

One dev server on `:3002` (`next dev --webpack -p 3002`, Next 16.2.10), started by hand with the local Supabase pins exported into the shell (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the CLI demo anon key, and the local service-role key from `supabase status`) so nothing could read a prod-pointed `.env.local`. Playwright's `webServer` then reused it (`reuseExistingServer: true`).

### `pnpm --filter @patina/client-portal test:e2e`
```
  2 failed
    [chromium] › tests/plans-link.spec.ts:190:7 › plan transmittal guest link (Plan Room 00429) › renders the set for the holder, signs prints, and dies on revoke
    [chromium] › tests/share-link.spec.ts:114:7 › guest share link (C2) › a share with a board renders it view-only for a guest (B3)
  26 passed (1.6m)
```

All 12 `threshold.spec.ts` cases passed, including *"answers the retired routes with a 308 to the page anchor"* and *"collapses /invoices onto the letterbox on the one page"*.

**The two failures are NOT route rot and are NOT from this branch.** Both die in spec *setup*, on a Postgres error, before any page renders:

```
plans-link.spec.ts:190
  { code: 'P0001', message: 'studio_id_not_designer_studio' }

share-link.spec.ts:114
  { code: '23514',
    message: 'proposal b0000000-0000-0000-0000-000000000002 is sent, so its authored copy is immutable' }
```

Evidence they are pre-existing baseline:
- The routes they drive still exist — `apps/client-portal/src/app/share/[token]` and `src/app/plans/[token]` are both present. Nothing was retired out from under them.
- `git diff --name-only <origin/main>...HEAD -- apps/client-portal/src/app/share apps/client-portal/src/app/plans apps/client-portal/tests/share-link.spec.ts apps/client-portal/tests/plans-link.spec.ts` → **empty**. Routes and specs are byte-identical to main.
- `git diff --name-only origin/main...HEAD -- supabase/migrations supabase/seed` → **empty**. The DB these specs hit was rebuilt from migrations and seeds identical to main's, and `git merge-base --is-ancestor origin/main HEAD` is true (branch contains main @ `d3f094739`).

So both failures reproduce on `origin/main` with the same reset. They are seed-vs-spec conflicts (a seeded proposal now sits `sent`, so the board seeder trips 00xxx's immutability check; the plans seeder's studio is not a designer studio) that belong to whoever owns those guest-link fixtures — **not** to the client-page work, and deleting them would be wrong: they are not driving deleted routes.

I did **not** delete any spec and made no commit; there was nothing rotten to remove.

### curl probes — signed OUT
```
/preferences/unsubscribe                              200
/projects/b0000000-0000-0000-0000-00000000c0d1        307 → /auth/signin?callbackUrl=%2Fprojects%2Fb0000000-...-c0d1
```
Both as specified.

Signed out, the ten retired paths answer `307 → /auth/signin?callbackUrl=…` — the auth gate fires in middleware *before* the retirement rewrite, which is correct behaviour but means the 308 is only observable with a session.

### retired-route probes — signed IN as `client-solo@patina.dev`
(issued from the authenticated browser context with `maxRedirects: 0`)
```
/today        308  /#doorstep
/decisions    308  /#doorstep
/proposals    308  /#door
/invoices     308  /#letterbox
/budget       308  /#ledger
/documents    308  /#mat-papers
/orders       308  /#road
/messages     308  /#note
/inbox        308  /#note
/projects     308  /
```
All ten: **308, Location anchored on `/`**. PASS.

---

## Gate 7 — Renders

Signed in through the real sign-in ceremony (email-first disclosure → password `password123`), waited on the `threshold-hold` gate to clear before every capture.

| File | Actor | Viewport | Size |
|---|---|---|---|
| `local-dev-desktop.png` | `client-solo@patina.dev` | 1440×900, full page | 324 KB |
| `local-dev-phone.png` | `client-solo@patina.dev` | 390×844, full page | 273 KB |
| `local-dev-multi.png` | `client@patina.dev` | 1440×900, full page | 60 KB |

All under the 600 KB cap. All three land on `/` (no redirect).

### First viewport, honestly, against `docs/design/the-client-page/shots/path-b-first-viewport.png`

**Desktop — `client-solo@patina.dev` (`local-dev-desktop.png`)**

- **Header absent?** Yes. `document.querySelectorAll('[data-testid^="header-"]')` → **0**. The page opens on the studio line (`LOCAL DEV STUDIO` / `PREPARED FOR NORA ELLISON`) and the doorplate `Cedar Lane Study`, exactly the mock's chrome-less opening.
- **Any red ink?** **No.** A programmatic sweep of every element's computed `color`, `background-color` and `border-top-color` for red-dominant or green-dominant values returned **zero hits**. The only non-ink colour on the page is the warm ochre used for the story-pole marker, `HATCHED`, `OPEN` and the "Read here on the fourth of September" line — the same ochre the mock uses for `PROCUREMENT / the house stands here` and `SHUT / HATCHED / OPEN`. Nothing uses `var(--color-error)` or any red/green, per the 2026-09-04 ruling.
- **Any error string as content?** **No.** Body text scanned for `error`, `failed to`, `undefined`, `NaN`, `[object Object]`, `null`, `something went wrong`, `unavailable` — zero matches.
- **Ledger rows present?** Yes, but **one row, not three.** Rendered: `The house stands at $11,100 agreed.` then `Owed on the open invoice — $4,060 · due 11 September`. The mock shows three rows (owed / held / awaiting). `house-ledger.tsx` emits all three, but `flatMap`s away any row whose cents are falsy, and for this fixture `heldCents` and `awaitingCents` derive to 0 — the $2,980 trade scope is carried as the **gate/act** (`A GATE · THE LINE STOPS UNTIL YOU ACCEPT`, `ACCEPT THE FINISHED WORK`) and as `HATCHED` on the drawing, not as a ledger line. That is a fixture/derivation characteristic, not a render fault; the three-row case is covered by `src/components/threshold/__tests__/house-ledger.test.tsx`. **Flagging it for the parent to rule on**, since the mock's first viewport reads three rows and the live one reads one.
- **Story pole?** Yes — `THE STORY POLE` with all six phases (Discovery, Design, Design Refinement, Procurement, **Installation** ← marked `the house stands here` in ochre, Completion) and the `▶ You stand at the doorstep` marker. **One difference from the mock:** the mock prints a date subline under each phase (`March`, `April–May`, `July–September`, `week of 12 October`, `late October`); the live pole prints phase names only, with a date line on the current phase alone.
- **Other houses in the mat?** Correctly **absent** — the solo client keeps one house, so the mat shows `THE PEOPLE, WHERE THEY WORK` / `THE PAPERS` / `YOUR DETAILS` / `LEAVE THE HOUSE` / `ASK FOR A CHANGE` and no `YOUR OTHER HOUSES` block.
- **Other first-viewport deltas vs the mock, all fixture-shaped:** the mock's `The house stands at $61,400 agreed of $85,000 planned.` reads here as `The house stands at $11,100 agreed.` (no planned figure in the seed, so the "of $X planned" clause is dropped); the mock's overage sentence ("The library stands about eleven hundred past its target…") has no counterpart because no room band is over target; the mock's drawing keys three marks, the live one keys one (`One mark stands open on this drawing.`). The letterbox card, `OPEN THE LETTERBOX`, and the invoice line are all present and match the mock's shape; the live one adds a `PRINT` act beside `OPEN THE LETTERBOX`.
- **One thing on screen that is NOT app UI:** a dark circular badge with an `N` sits at the bottom-left of all three captures. `document.elementFromPoint(38, 862)` resolves it to `<script data-nextjs-dev-overlay="true"><nextjs-portal>` — it is the **Next.js dev-tools indicator**, an artifact of `next dev`, and will not exist in a production build. It is not client-page chrome.

**Phone — `client-solo@patina.dev` (`local-dev-phone.png`)**

Same page, one column. Header absent. Story pole collapses to a row of six dots with the current phase filled in ochre, under `THE STORY POLE`, with `You stand at the doorstep` beneath. Studio line and `PREPARED FOR NORA ELLISON` stack above the doorplate. The ledger's single row wraps its label over two lines; the letterbox card and its invoice sentence sit below. No red ink, no error string, nothing clipped horizontally. The Next.js dev badge again sits bottom-left.

**Multi-house — `client@patina.dev` (`local-dev-multi.png`)**

- Header absent (`[data-testid^="header-"]` → 0). Doorplate reads `Birch Hollow`, `LEAH HARTWELL` / `PREPARED FOR CLIENT USER`, `Discovery · September 2026`.
- **Other houses in the mat?** **Yes** — `YOUR OTHER HOUSES` lists `Marrow & Vale Residence` and `Aspen Loft Refresh` (2, matching the spec's `MULTI_OTHER_HOUSE_COUNT`). The chrome-less house is the same surface for a multi-project client; the mat, not a header, carries the other houses. Ruling honoured.
- **No story pole** on this house — it sits in Discovery with no dated phases in the fixture, so the pole does not draw. The page opens straight from the doorplate into `Nothing waits for your name.`
- **Ledger rows: none.** Nothing is agreed, owed, held or awaiting on this house, so the whole ledger unit is absent rather than showing zeros.
- `THE LETTERBOX` renders its empty card with the assertion `Nothing in the letterbox.` — an assertion, not a blank, as the surface intends.
- No red ink, no error string as content. The `THE PAPERS` column of the mat is empty apart from the `THE PAPERS, IN FULL` act (this house has no executed papers), which reads slightly ragged against the neighbouring columns — cosmetic, worth a look, not a fault.

---

## Summary

| Gate | Result |
|---|---|
| 1 · DB reset + `db:generate` diff + SQL tests | **PASS** — types in sync, unexpected-fail **0** / 154 |
| 2 · `@patina/supabase` test + type-check | **PASS** — 989 passed, tsc clean |
| 3a · client-portal `type-check` | **PASS** |
| 3b · client-portal `test:coverage` | **PASS (allowed failure only)** — 1512/1513; only `portal-access.test.ts` fails; `orders.test.ts` already deleted |
| 3c · coverage floor 70/60/70/70 | **MET** — 71.23 / 65.82 / 71.51 / 73.34 |
| 3d · `npx eslint src` = 0 errors | **DEVIATION — 10 errors**, all pre-existing on `origin/main` in 9 files this branch never touched |
| 4a · designer-portal `type-check` | **PASS** |
| 4b · designer-portal `test` | **PASS** — 510 suites, 6104 tests |
| 4c · admin-portal `build` | **PASS** — route table printed, `.next/BUILD_ID` = `pbsgys40BbW_DCqiUwseM` |
| 5 · edge `deno test` + `deno check` | **PASS** — 82 passed / 0 failed; 8 modules check clean |
| 6a · client-portal e2e | **26 passed, 2 failed** — both pre-existing guest-link fixture failures, unchanged from main, not route rot |
| 6b · retired-route + unsubscribe probes | **PASS** — 10 × 308 to `/`-anchors signed in; unsubscribe 200 signed out; solo project 307 → sign-in signed out |
| 7 · renders | **PASS** — 3 screenshots captured, all ≤ 600 KB; no header, no red ink, no error strings |

**allGreen = false.** Two gates did not meet the letter of their bar: `eslint src` (10 errors) and the e2e suite (2 failures). Both are demonstrably inherited from `origin/main` — the files and specs involved are byte-identical to main and no migration, seed, or eslint config changed on this branch — so neither is a regression introduced by the client-page work, but neither was green either, and the brief's bar was "0" and "the whole surviving suite must be green".

### Not verified
- The two failing e2e specs were reasoned to be pre-existing from git evidence, **not** executed against a separate `origin/main` checkout (that would have needed a second worktree, outside this lane's remit).
- `eslint` errors likewise proven pre-existing by file-identity + unchanged config, not by a run on a main checkout.
- E2E ran chromium only — that is the whole of `apps/client-portal/playwright.config.ts` (one project), not a shortcut.
- No prod anything was touched. No commit was made and nothing was pushed: the worktree tree is clean apart from `docs/design/the-document/screenshots/schedule-boards-wave2/2-guest-share-desktop.png`, which was already modified before this run (an earlier e2e byproduct) and is not mine to land.
- `apps/client-portal/.env.local` was never read or written; the dev server took its Supabase pins from exported shell vars, which Next.js prefers over `.env` files.
