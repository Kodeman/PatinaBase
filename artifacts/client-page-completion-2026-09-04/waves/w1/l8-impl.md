# L8 — Multi-project and routing, no flag

- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l8`
- Branch: `client-page-2/l8` from `origin/main` (`26b15145e`)
- Commit: `8024e2686`

## What was built

### (a) `/` renders the Threshold for the active project

`apps/client-portal/src/app/page.tsx` was a one-line `redirect('/projects')`. It is now a
server component that fetches the same way `/projects/[projectId]/page.tsx` does
(`fetchClientProjects` + `fetchClientProjectView`) and renders `ProjectSurfaceSwitch` inside
the identical wrapper markup (`min-h-screen` → `main.mx-auto.max-w-6xl.px-6.py-10`).

Active project = the greatest of three clocks among `client_id = auth.uid()`:
`projects.updated_at`, the latest `project_notes.sent_at`, the latest `invoices.updated_at`.
Split in two so the picking rule is testable without a database:

- `src/lib/threshold/active-project.ts` (pure) — `lastMovementAt`, `pickActiveProjectId`.
  Ties keep the earlier house (the caller hands them in `updated_at desc` order); a house
  whose clocks cannot be read is never *preferred*, but still stands if nothing else can be
  read.
- `src/lib/data/active-project.ts` (`server-only`) — `resolveActiveHouse(projectIds)`.
  Short-circuits: 1 project → that project, no query at all; ≥2 → three `.in()` reads run in
  parallel. Any query error, thrown client, or fixtures mode falls back to the freshest known
  house. Never throws, never surfaces an error string.

`fetchClientProjects` was **not** extended (the plan's "only if needed") — it returns `[]` both
for a signed-out visitor and a client with no projects, so `resolveActiveHouse` returns a
tri-state instead: `{status:'signed-out'}` vs `{status:'ok', activeProjectId}`. The auth read
only happens on the empty answer, because a non-empty list is itself proof of a session.

Zero projects → the existing `ProjectsEmptyState`, header-less (the chrome gate below drops it
on `/`). Signed-out → `redirect('/auth/signin?callbackUrl=%2F')`, matching what middleware does
for a protected path; `/` is in middleware's `isPublicPage` list, so without this a signed-out
visitor would have been shown the empty state.

### (b) Mat gains "Your other houses"

New `src/components/threshold/other-houses.tsx` — `OtherHouses` + the `OtherHouse` type. Each
other project is a line (`<Link href={/projects/<id>}>`) with its location under it in the same
mono/muted treatment the people column uses; nothing scored, because nothing here is an act.
Zero other houses renders nothing at all — no heading over an empty column.

Threaded server → client: both pages compute
`projects.filter(p => p.id !== project.id).map(...)` and pass `otherHouses` to
`ProjectSurfaceSwitch` → `Threshold` → `Mat`.

### (c) The flag is gone

- `components/making/project-surface-switch.tsx` — both `useFeatureFlag` reads deleted along
  with the `TheMaking` and `ProjectViewWrapper` branches; renders `<Threshold>` outright.
  `client_project_view` still fires from the same ref-free `useEffect([projectId])`, exactly
  once per project, and it is still the sole emitter.
- `app/projects/page.tsx` — the `SinglePaneSoloRedirect` mount and its import are removed. The
  component file itself is left in place (dead, still covered by its own test) for the
  retirement plan to delete.
- `components/layout/threshold-chrome-gate.tsx` — no flag, no `projectCount`. Drops the header
  on `/^\/$|^\/projects\/[^/]+$/` for every client, whatever the project count.
  `app-chrome.tsx`'s single call site loses the `projectCount` prop.
- `components/threshold/threshold-route-collapse.tsx` — no flag. `collapsedHref` now takes the
  whole `projectIds` array: 1 → `/projects/<id>#anchor`, ≥2 → `/#anchor`, 0 → `null`. Both
  destinations (`/projects/<id>` and `/`) are unmapped, so the effect self-terminates exactly
  as before. The effect depends on `projectIds.join(',')` rather than the array identity,
  which changes on every layout render.
- `wrangler.jsonc`'s `NEXT_PUBLIC_FLAG_OVERRIDES` was deliberately **not** touched (ship lane).

## Files

Modified:
- `apps/client-portal/src/app/page.tsx`
- `apps/client-portal/src/app/projects/[projectId]/page.tsx`
- `apps/client-portal/src/app/projects/page.tsx`
- `apps/client-portal/src/components/layout/app-chrome.tsx`
- `apps/client-portal/src/components/layout/threshold-chrome-gate.tsx`
- `apps/client-portal/src/components/making/project-surface-switch.tsx`
- `apps/client-portal/src/components/threshold/mat.tsx` *(shared — 4 additions: the import, an
  optional `otherHouses` field, `export` on the two existing class constants, one render line)*
- `apps/client-portal/src/components/threshold/route-collapse.ts`
- `apps/client-portal/src/components/threshold/threshold-route-collapse.tsx`
- `apps/client-portal/src/components/threshold/threshold.tsx` *(shared — 3 additions: a type
  import, an optional `otherHouses` prop, passing it to `<Mat>`)*
- tests: `layout/__tests__/app-chrome.test.tsx`,
  `layout/__tests__/threshold-chrome-gate.test.tsx`,
  `making/__tests__/project-surface-switch.test.tsx`,
  `threshold/__tests__/route-collapse.test.ts`,
  `threshold/__tests__/threshold-route-collapse.test.tsx`

New:
- `apps/client-portal/src/lib/threshold/active-project.ts` + `__tests__/active-project.test.ts`
- `apps/client-portal/src/lib/data/active-project.ts` + `__tests__/active-project.test.ts`
- `apps/client-portal/src/components/threshold/other-houses.tsx` + `__tests__/other-houses.test.tsx`

`making/*` was not edited. No `@patina/supabase` hook was added — the server fetchers already
had everything, so the package's vitest / admin-build gate did not apply.

## Hooks and copy sources

- Server fetchers copied from `app/projects/[projectId]/page.tsx`: `fetchClientProjects`,
  `fetchClientProjectView` (`src/lib/data/projects.ts`), same `notFound()` shape.
- Empty state copied wholesale from `app/projects/page.tsx`: `ProjectsEmptyState`
  (`src/components/projects/ProjectsEmptyState.tsx`), unchanged.
- Client hooks: none added. `ProjectSurfaceSwitch` keeps `useProjectApprovals` from
  `@patina/supabase` exactly as it was.
- Copy: "Your other houses" is the plan's own wording (plan §L8b) — the mock
  `docs/design/the-client-page/path-b-the-threshold.html` is a single-project specimen and has
  no other-houses region (grepped: no `other house` / `houses` / `switcher` hit; its mat
  section is lines 787–815, three columns only). The column head uses the mat's existing
  `COLUMN_HEAD_CLASS`, so it reads identically to "The people, where they work" and
  "The papers".

## Gate output (verbatim)

`pnpm --dir .../apps/client-portal type-check`:

```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l8/apps/client-portal
> tsc --noEmit
```

`pnpm --dir .../apps/client-portal test -- threshold making`:

```
Test Suites: 32 passed, 32 total
Tests:       593 passed, 593 total
Snapshots:   0 total
Time:        4.673 s
Ran all test suites matching /threshold|making/i.
```

Same command widened to include the lane's other dirs
(`test -- threshold making lib/data/__tests__/active-project lib/threshold layout`):

```
Test Suites: 35 passed, 35 total
Tests:       614 passed, 614 total
Snapshots:   0 total
Time:        4.529 s
```

`npx eslint src/app/page.tsx src/app/projects src/components/threshold src/components/layout src/components/making src/lib/data src/lib/threshold`:

```
✖ 11 problems (0 errors, 11 warnings)
```

0 errors. All 11 warnings are pre-existing "Unused eslint-disable directive" notices in files
this lane did not touch (`making/the-making.tsx`, `making/tracking-row.tsx`,
`lib/data/profile.ts`, `lib/data/projects.ts`).

Per-file coverage of the lane's own files (`npx jest --coverage --coverageThreshold='{}'`
scoped to them):

```
File                           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
All files                      |   97.91 |    84.48 |     100 |     100 |
  threshold-chrome-gate.tsx    |     100 |      100 |     100 |     100 |
  project-surface-switch.tsx   |     100 |      100 |     100 |     100 |
  mat.tsx                      |     100 |      100 |     100 |     100 |
  other-houses.tsx             |     100 |      100 |     100 |     100 |
  route-collapse.ts            |     100 |      100 |     100 |     100 |
  threshold-route-collapse.tsx |   94.73 |    66.66 |     100 |     100 | 41,62-71
  lib/data/active-project.ts   |   97.36 |    72.72 |     100 |     100 | 62-72
  lib/threshold/active-project.ts |  100 |      100 |     100 |     100 |
```

## Pre-existing, not caused by this lane

Full `pnpm test` in this worktree: `Test Suites: 2 failed, 133 passed` / `Tests: 1 failed,
1435 passed`. The same two suites already fail on `origin/main` (`26b15145e`), measured by
detaching this worktree to that commit and re-running: `Test Suites: 2 failed, 130 passed` /
`Tests: 1 failed, 1397 passed`.

- `src/lib/data/__tests__/orders.test.ts` — "Cannot find module `../orders`". `lib/data/orders.ts`
  was deleted in `4b9a0914d chore(client-portal): remove vestigial cart/checkout stack`; the
  test was left behind.
- `src/lib/__tests__/portal-access.test.ts:122` — one failing assertion.

The client-portal jest coverage floor (70/60/70/70) is **already unmet on `origin/main`**:

| | main `26b15145e` | this branch |
|---|---|---|
| Statements | 51.41% | 51.71% |
| Branches | 47.65% | 47.75% |
| Functions | 50.85% | 51.02% |
| Lines | 52.85% | 53.11% |

This lane moves all four up slightly. The integration lane's "full jest with coverage" gate
will fail on that pre-existing baseline regardless of what wave 1 lands.

The pre-commit hook reported Prettier drift on all 21 staged files ("Staged files have
formatting drift; this is advisory locally") — including files where only one line changed, so
the repo's committed style differs from its Prettier config broadly. Nothing was reformatted.

## NOT verified

- **No browser or e2e run.** `/` rendering the house, the empty state on `/` for a
  zero-project client, and the "Your other houses" column against real multi-project data were
  never exercised in a running portal — jest only. `threshold.spec.ts` was not extended (wave 2
  owns it).
- **The three-clock query was never run against Postgres.** Column names were read from
  `00178_invoices_v1.sql` (`invoices.project_id`, `invoices.updated_at`) and
  `00565_the_client_page.sql` (`project_notes.project_id`, `project_notes.sent_at`); the tests
  mock the Supabase client. Whether a client's RLS actually lets her SELECT `invoices` and
  `project_notes` for every one of her projects is assumed from the fact that the Threshold's
  own `useProjectInvoices` / `useProjectNotes` hooks read them client-side — not confirmed by
  a query. If a read is denied it errors and the fallback (freshest project row) stands, so
  the failure mode is a wrong-but-plausible house, never a crash.
- **`/` now bypasses the portal role check.** Middleware treats `/` as public, so an
  authenticated designer or manufacturer carrying the `.patina.cloud` SSO cookie is no longer
  bounced to `/wrong-portal` on it (the old `/` redirected to `/projects`, which is gated).
  They see the zero-project empty state — `fetchClientProjects` filters on
  `client_id = auth.uid()`, so no data leaks — but the interstitial no longer fires. Fixing
  that means removing `/` from `isPublicPage` and adding a signed-out branch, which is the
  retirement plan's middleware work (inventory §6); the page-level `redirect` here covers the
  signed-out case only. **Flagged for the integration/ship lane.**
- `fetchClientProjects` is called in both `app/layout.tsx` and `app/page.tsx`. It is wrapped in
  React `cache`, so this should be one request-scoped fetch — not measured.
- The report's claim that `single-pane-solo-redirect.tsx` and the `TheMaking` /
  `ProjectViewWrapper` trees are now dead is by import-graph reading, not by a bundle diff.

---

# Fix round (review `l8-review.md`, 22 findings)

Branch `client-page-2/l8`; fix commit `ab45411b9` on top of `159fd8e05`.

## Fixed, by finding number

**1 — `/` bypassed the portal-role gate (blocker-adjacent MAJOR).** Applied as the review
proposed. `req.nextUrl.pathname === '/'` is out of `isPublicPage` (`src/middleware.ts:143`),
and `page.tsx`'s own `redirect('/auth/signin')` is deleted. Middleware now owns both gates on
`/`: the unauthenticated visitor gets `/auth/signin?callbackUrl=/`, and a designer/manufacturer
role gets `/wrong-portal`. Three new middleware tests cover signed-out, wrong role, and the
consumer pass-through (no `x-patina-role-check` header).

**2 — a thrown auth read looped `/` ↔ sign-in (major).** Subsumed by (1) and fixed at the
root rather than patched: with `/` protected, `resolveActiveHouse` never has to tell a missing
session from a missing project, so the `ActiveHouse` tri-state and `hasClientSession()` are
gone. The function is now `resolveActiveHouse(projectIds): Promise<string | null>` and asks
the auth server nothing on the zero-project and solo paths. There is no "signed-out" answer
left to loop on.

**3 — the inert wrangler override with a lying comment (major).** The plan assigns removal of
the var itself to the ship lane ("Do NOT remove the wrangler override var"), so the var stays
and its comment is corrected: it now states that no code reads `threshold`, that the override
pins nothing and is **not** a kill switch, that only a Worker rollback reverses a bad deploy,
and that the ship lane deletes both. Carried into "For the ship lane" below.

**4 — the headline file had no test (major).** New `src/app/__tests__/page.test.tsx`, modelled
on `src/app/share/[token]/__tests__/page.test.tsx`. Five cases: opens the chosen house; names
the view source; **never puts the current house inside its own mat** (3 houses in, `p1,p3`
out); empty state with zero houses and no detail read fired; empty state — not `notFound()` —
when the chosen house will not open. The self-exclusion is now shared code
(`lib/threshold/other-houses.ts#toOtherHouses`) used by both `/` and `/projects/[id]`, so the
line the review flagged as untested at `projects/[projectId]/page.tsx:36` is covered too, by
`lib/threshold/__tests__/other-houses.test.ts` as well as by the page test. `jest.config.js`
no longer excludes `src/app/page.tsx` from coverage.

**5 — sign-in still landed on the retired list (major).** `CLIENT_AUTH_DESTINATION = '/'`
(`src/lib/auth-redirect.ts:9`), and `middleware.ts:207`'s hardcoded `'/projects'` default now
imports that same constant instead of repeating a literal. `route-collapse.ts`'s doc comment
no longer claims `/projects` is where sign-in lands — the collapse serves stale bookmarks and
old emails only. Tests updated in `lib/__tests__/auth-redirect.test.ts` (plus a new
"lands sign-in on the house"), `__tests__/middleware.test.ts`, and
`components/auth/__tests__/AcceptInviteForm.test.tsx`, all three now asserting against the
constant rather than a literal.

**6 — the zero-project client was stranded on a header-less `/` (major).** Took the review's
first option: `ThresholdChromeGate` gains a required `hasHouse` prop and drops the header only
when `hasHouse && HOUSE_ROUTES.test(pathname)`. `AppChrome` already had `projects`, so it
passes `projects.length > 0` — a one-line edit. A client with no house keeps the header on
`/`, and therefore keeps sign-out and `/account`. Tests added to both suites.
Note: `layout.tsx` reads projects with `.catch(() => [])`, so a transient list failure now
degrades toward *more* navigation (header shown) rather than less — the safe direction.

**7 — the `mat` ↔ `other-houses` import cycle (minor).** New
`src/components/threshold/mat-classes.ts` holds `LINE_CLASS`, `COLUMN_HEAD_CLASS` and a third
`SUBLINE_CLASS` (the muted second line, which both files were spelling out inline). Both
files import from it; `mat.tsx` exports neither constant any more, so this lane's net effect
on that multi-lane merge point is now *smaller* than before the fix round.

**8 — sequential awaits and a duplicate auth round trip (minor).** The duplicate
`auth.getUser()` is gone with `hasClientSession()` (see 2), so a solo or zero-project hit of
`/` makes exactly one auth call — inside `fetchClientProjects`, as the sibling route does.
The remaining two awaits are a genuine dependency chain (`projects` → which house → that
house's detail) and cannot be parallelised; for a solo client `resolveActiveHouse` returns
without touching the database, so `/` costs the same as `/projects/[id]`. The `cache()`d
shared user read the review suggests is not taken up — see rejections.

**9 — `notFound()` at the site root (minor).** `/` falls through to `ProjectsEmptyState` when
the detail read returns null for a house the list named. `/projects/<id>` still answers 404,
unchanged.

**10 — the `projects` read had no owner predicate (minor).** Added
`.eq('client_id', user.id)` alongside `.in('id', projectIds)`, with one `auth.getUser()` in
the multi-house branch only (no user → stand on the freshest known house). The notes and
invoices reads have no client column and are correctly left to RLS. Asserted by a new test.

**11 — the env mock invented `PATINA_TEST_PROJECT_FIXTURES` (minor).** `@/lib/env` is now
mocked as a plain `{ useProjectFixtures: boolean }` the tests set directly — the shape the
real module actually exposes.

**12 — `link.querySelector('span')` probed the DOM (minor).** Replaced with the behavioural
assertion the review names: `queryByText('Des Moines')` absent, and the location-less link
still findable by its accessible name.

**13 — the accessible name ran name into location (minor).** `aria-label` on the `Link`, built
by the same `·` the people column uses, with the waiting sentence appended after a full stop
when there is one. Two tests.

**14 — per-house attention was lost with the `/projects` list (minor).** Closed rather than
recorded: `OtherHouse` carries `approvalsPending` / `unreadMessages` (which
`fetchClientProjects` already returns), and `waitingSentence()` turns them into one quiet line
under the house name — "A paper is waiting there." / "Notes are waiting there." /
"A paper and a note are waiting there." A house with nothing waiting says nothing. Prose, in
the mat's existing muted subline style — no badge, no count, no colour (VISION §6). Eight
tests in `lib/threshold/__tests__/other-houses.test.ts` plus three in the component suite.

**15 — the join/re-split round trip (minor).** The effect depends on `houseCount` and
`firstHouseId`; `collapsedHref` receives `projectIds` directly.

**17 — stale e2e comments (nit).** `tests/threshold.spec.ts`'s header no longer claims "a
client with several keeps the header" (false since this lane) and no longer calls :3102 "the
flag-overridden server". `playwright.config.ts` gains three lines saying the override is inert
and that the two-server split comes out in wave 2. The override value itself is left in place
— striking it without collapsing the split would leave the split unexplained, and the split is
wave 2's to remove with the spec that depends on it.

**19 — the error boundary pointed at the retired list (nit).** `href="/"`; the copy "Back to
your projects" is byte-unchanged. Test updated.

**22 — `client_project_view` silently changed meaning (nit).** `clientEvents.projectView` takes
a second argument, `source: 'front-door' | 'named'` (default `'named'`); `ProjectSurfaceSwitch`
takes a `viewSource` prop and `/` passes `'front-door'`. The component's comment says so.
Three tests.

## Rejected, with one reason each

- **8 (the `cache()`d shared user read).** The duplicate call is already gone; wiring a shared
  cached user read would mean editing `lib/data/projects.ts`, a file several other wave-1 lanes
  touch, for no remaining round trip.
- **16 (delete `single-pane-solo-redirect.tsx`).** The plan assigns the deletion to the
  retirement lane, not this one. Named explicitly in the handoff below instead, which is what
  the finding actually asks for.
- **18 (the four-column mat wrap).** The review's own primary fix is "eyeball 1280 and 390 in
  wave 2's first-viewport capture", which this lane cannot run; moving the column under the
  papers is a layout ruling that belongs with that capture, not a blind edit.
- **20 ("Your other houses" is second person).** The review states it is noted for consistency,
  not as a defect, and the plan supplies the wording verbatim.
- **21 (the superseded spec §4/§5 note).** The review scopes it to integration, and the spec
  file is shared by all nine lanes — a doc edit here buys a merge conflict for no code effect.

## Gate output

`pnpm --dir .../apps/client-portal type-check`

```
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
```

(clean — no diagnostics)

`pnpm --dir .../apps/client-portal test -- threshold making`

```
Test Suites: 33 passed, 33 total
Tests:       609 passed, 609 total
Time:        5.437 s
Ran all test suites matching /threshold|making/i.
```

Full portal jest (run because this round touches middleware, auth-redirect and the layout):

```
Test Suites: 2 failed, 135 passed, 137 total
Tests:       1 failed, 1460 passed, 1461 total
```

Both failures are **pre-existing and untouched by this lane** —
`git log 26b15145e..HEAD --name-only` and `git status` are both empty for all three files:

- `src/lib/data/__tests__/orders.test.ts` — "Cannot find module '../orders'". `orders.ts` was
  deleted on main in `4b9a0914d` ("remove vestigial cart/checkout stack") and its test was left
  behind. **The integration lane's full-jest gate will trip on this**; the fix is to delete the
  orphaned test.
- `src/lib/__tests__/portal-access.test.ts` — "returns null for manufacturer (no manufacturer
  portal)" now receives `{label: 'the Patina maker workspace', url: 'https://manufacturer.patina.cloud'}`.
  The manufacturer portal exists; the assertion is stale. **Also trips integration's full jest.**

`npx eslint <lane dirs>` — 0 errors, 0 warnings across every file this round touched.
Whole-`src` eslint reports 33 errors, none in a file this lane has ever touched (list checked
file by file).

## For the ship lane

1. Delete `NEXT_PUBLIC_FLAG_OVERRIDES` and its comment from
   `apps/client-portal/wrangler.jsonc`. **There is no rollback flag left** — the only way back
   from a bad client-portal deploy is `wrangler rollback`.
2. `client_project_view` gains a `source` property from this deploy; any saved PostHog insight
   on that event should be re-read with that in mind.
3. `/` is now role-gated, so it calls `createAdminClient` (service role) per request exactly as
   `/projects` did. `SUPABASE_SERVICE_ROLE_KEY` must be present on the Worker or every `/` hit
   stamps `x-patina-role-check: skipped`.

## For the retirement lane

- `src/components/making/single-pane-solo-redirect.tsx` **and** its test are dead: the last
  `useFeatureFlag('single-pane')` read in the app, with no mount since `app/projects/page.tsx`
  dropped it. Name both files in the retirement file list or they will survive.
- `apps/client-portal/playwright.config.ts`'s two-server split (:3002 / :3102) exists only
  because the `threshold` flag used to change behaviour per server. Collapse it with the
  `threshold.spec.ts` extension.
