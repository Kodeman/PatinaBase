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
