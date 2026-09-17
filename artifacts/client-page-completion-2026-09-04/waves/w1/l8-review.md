# L8 review — Multi-project and routing, no flag

- Branch: `client-page-2/l8` @ `159fd8e0564dc467ceeded368f7d50ba9825a597` (pushed to `origin/client-page-2/l8`)
- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l8` (read-only review; no edits, no git writes)
- Reviewer context: fresh; implementer's report read after the diff.

## Gate results (run in this worktree)

`pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l8/apps/client-portal type-check`

```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l8/apps/client-portal
> tsc --noEmit
```

(clean — no diagnostics)

`pnpm --dir .../apps/client-portal test -- threshold making`

```
Test Suites: 32 passed, 32 total
Tests:       593 passed, 593 total
Snapshots:   0 total
Time:        5.338 s
Ran all test suites matching /threshold|making/i.
```

Widened to the lane's other new dirs (`test -- lib/data/__tests__/active-project layout`):

```
Test Suites: 4 passed, 4 total
Tests:       29 passed, 29 total
Time:        1.62 s
```

Both gates reproduce the lane's reported output. No sandbox retries were needed.

## (1) Absorb list — act by act

L8's absorb list is `/projects` (the list) + the header's project switcher, plus the flag removal.

| Old act | Where it lived | Works in place now? |
|---|---|---|
| Land somewhere after sign-in | `/projects` list | ⚠ **Yes, but via a flash.** `CLIENT_AUTH_DESTINATION` is still `/projects` (`src/lib/auth-redirect.ts:9`), so the list renders server-side and only then `ThresholdRouteCollapse` replaces to `/#doorstep` or `/projects/<id>#doorstep`. See finding 5. |
| Pick a project (solo client) | `/projects` list → detail | ✅ `collapsedHref('/projects', ['p1'])` → `/projects/p1#doorstep` (`route-collapse.ts:52-54`); e2e path in `tests/threshold.spec.ts:137` still holds. |
| Pick a project (multi-project client) | header `project-switcher.tsx` (inventory §8 gap 13 — "the **only** multi-project switcher") | ✅ **Closed.** `OtherHouses` in the mat names every other house and links to `/projects/<id>` (`other-houses.tsx:26-40`). This is the gap the inventory called a hard blocker. |
| See per-house attention (approvals pending, unread, progress, next milestone) | `/projects` list cards + header counts | ❌ **Lost.** `OtherHouses` renders name + `site_address` only. Finding 14. |
| Zero-project empty state | `/projects` → `ProjectsEmptyState` | ⚠ **Rendered on `/`, but header-less and therefore act-less** (no sign-out, no `/account`). Finding 6. |
| `/` itself | `redirect('/projects')` | ✅ Now renders the Threshold for the active house (`src/app/page.tsx:17-55`). |
| Flag reads (`threshold`, `single-pane`) | switch, chrome gate, route collapse, `SinglePaneSoloRedirect` mount | ✅ All four removed; `grep -rn useFeatureFlag src` leaves only the dead `single-pane-solo-redirect.tsx` and the hook itself. Findings 3, 16. |

Active-house rule matches the plan verbatim: `greatest(projects.updated_at, latest project_notes.sent_at, latest invoices.updated_at)` (`lib/data/active-project.ts:50-54`, `lib/threshold/active-project.ts:38-54`).

## (2) Hooks / payloads vs the old routes

No hooks or payloads were copied in this lane — nothing to diff byte-for-byte. Verified instead:

- `/` reuses the exact fetchers `/projects/[projectId]/page.tsx` uses (`fetchClientProjects`, `fetchClientProjectView`) and the same `notFound()` shape; the wrapper markup differs only in the empty-state branch (`py-12` + `flex-col`, copied from `app/projects/page.tsx:19`).
- `ProjectsEmptyState` is imported unchanged — no copy edited, no legal line touched.
- `ProjectSurfaceSwitch` keeps `useProjectApprovals(projectId)` and the same six props to `Threshold`; `client_project_view` still fires from the same ref-free `useEffect([projectId])` and is still the sole emitter.
- No confirmation copy or legal line exists in this lane's surface area. Nothing reversed.

The three new SQL reads were checked against the schema rather than assumed: `project_notes` has table-wide `GRANT SELECT ... TO authenticated` plus `project_notes_client_select USING (is_project_client(project_id) AND sent_at <= now())` (`00565_the_client_page.sql:270-315`), and `invoices` has `"Clients can view issued invoices on their projects"` (`00178_invoices_v1.sql:257-265`). Both columns are `timestamptz`, so `Date.parse` is offset-safe. The lane's "NOT verified" caveat on RLS is discharged: the reads are permitted.

## (3) Hooks discipline / settle / silence

- `Threshold`'s new `otherHouses` prop is consumed at `threshold.tsx:605-613`, inside the single render body, above the only branch (`threshold.tsx:694`) and below every hook. No hook moved, none added. ✅
- `OtherHouses` has no hooks, no `window`/`document` at render, no `useEffect`. Hydration-safe. ✅
- `ThresholdChromeGate` is now a pure function of `pathname` — it can no longer render one answer then a different one (the flag's one-commit swap is gone). ✅
- `ThresholdRouteCollapse` keeps its effect-only shape and its self-terminating destinations (`/` and `/projects/<id>` are both unmapped; `collapsedHref('/', …)` → `null`, asserted at `route-collapse.test.ts`). ✅
- Silence: `resolveActiveHouse` never surfaces an error string and never throws — it degrades to the freshest known house (`active-project.ts:48-78`). ✅ The one place it speaks wrongly is the signed-out branch (finding 2).

## (4) VISION §6

No shadows, no red/green, no badges, no tabs. `OtherHouses` uses the mat's existing `COLUMN_HEAD_CLASS`/`LINE_CLASS`, so it is typography-only and deliberately not `ScoredAction` ("nothing here is an act") — correct: the two scored acts stay the mat's `Your details` / `Leave the house`. No "AI" anywhere. The header is removed further, not added. Voice: "Your other houses" is second person, matching the region's existing "Your details" (finding 20). The zero-project branch on `/` renders a lucide `Folder` icon and a bordered pill button (`ProjectsEmptyState.tsx:57,66-71`) on a now chrome-less page — pre-existing copy, but newly placed on the house route.

## (5) Accessibility

No overlay or sheet in this lane — nothing needs `role="dialog"`, focus trap or Esc. The new column is a `<h2>` + `<Link>` list matching its siblings' heading level. One naming nit at finding 13.

## (6) Security

- No path exposes another client's or project's data. `createServerClient` is the cookie/anon (RLS-enforced) client, not the service client; `resolveActiveHouse` only ever passes ids that came from `fetchClientProjects`, which is itself `.eq('client_id', user.id)`. A row for an unrequested project is discarded (`active-project.ts:64-66`, asserted in test "ignores a row for a house the client did not ask about").
- **One authorization the old route enforced is now skipped** — the portal-role gate on `/`. Finding 1.

## (7) Shared-file discipline

`threshold.tsx`: +3 lines (type import, optional prop, pass-through) — minimal, merges cleanly with L1–L9. `mat.tsx`: +5 (import, optional prop, default, one render line, `export` on two consts) — minimal, but the two new `export`s create a cycle (finding 7). `derive.ts`: untouched, as the plan requires. `making/*`: only `project-surface-switch.tsx`, which the plan explicitly assigns to L8.

## (8) Tests

Mocks match the `making/__tests__` house style (plain function component for `Threshold`, not a `jest.fn`, with the `resetMocks: true` rationale carried over). `server-only` is mocked exactly as `lib/data/__tests__/projects.test.ts:13` does. The pure picker has good adversarial coverage (ties, unreadable clocks, mixed readability). Gaps at findings 4, 11, 12.

---

## Findings

1. **blocker-adjacent MAJOR · high** · `apps/client-portal/src/middleware.ts:142-152` (with `src/app/page.tsx:17`) — `/` is in `isPublicPage`, so the portal-role gate at `middleware.ts:235-253` never runs on the route that is now the client's house. The old `/` redirected to `/projects` (protected), which bounced a designer/manufacturer carrying the `.patina.cloud` SSO cookie to `/wrong-portal`; that interstitial no longer fires and `x-patina-role-check: skipped` is never emitted for `/`. No data leaks (every read is `client_id = auth.uid()` under RLS), but an authorization the old route enforced is gone. *Fix: drop `/` from `isPublicPage` and delete `page.tsx`'s own `redirect`, letting middleware own both the signed-out redirect and the role check.*

2. **major · medium** · `apps/client-portal/src/lib/data/active-project.ts:33-35` (test at `src/lib/data/__tests__/active-project.test.ts:67`) — `hasClientSession()` catches every exception and answers "signed out"; `page.tsx:21-23` turns that into `redirect('/auth/signin?callbackUrl=%2F')`; middleware's `isAuthenticated && isAuthPage` branch (`middleware.ts:200-222`) redirects an authenticated visitor straight back to the callbackUrl. A transient auth read failure for a zero-project client is therefore an infinite `/` ↔ `/auth/signin` bounce rather than an error page, and the current test enshrines the behaviour. *Fix: on a thrown auth read return `{status:'ok', activeProjectId:null}` (or rethrow to the error boundary) — never "signed out".*

3. **major · high** · `apps/client-portal/wrangler.jsonc:21-26` — `NEXT_PUBLIC_FLAG_OVERRIDES: "threshold:false"` is now inert (no code reads `threshold`), yet its comment still says it "pins the Threshold, its chrome gate and its route collapse OFF for everyone. REMOVE once the flag is retargeted." The first deploy carrying this branch flips every prod client onto the Threshold with no kill switch, while the committed comment tells the next reader the opposite. *Fix: delete the var and its comment in the ship change, and state in the ship note that there is no rollback flag left — only a Worker rollback.*

4. **major · high** · `apps/client-portal/src/app/page.tsx:17` — the lane's headline file has no test at all. Untested: the signed-out redirect, the zero-project branch, `notFound()`, and the `otherHouses` derivation (the `filter(house.id !== project.id)` at `page.tsx:50` that keeps the current house out of its own list — the one line whose failure would put "The Vale Residence" inside The Vale Residence's mat). The same filter at `src/app/projects/[projectId]/page.tsx:36` is equally untested. The repo has clear precedent for testing async server pages (`src/app/share/[token]/__tests__/page.test.tsx`). *Fix: add `src/app/__tests__/page.test.tsx` mocking `@/lib/data/projects` and `@/lib/data/active-project`, asserting all four branches and the self-exclusion.*

5. **major · medium** · `apps/client-portal/src/lib/auth-redirect.ts:9` (and the hardcoded `'/projects'` at `src/middleware.ts:207`) — sign-in still lands every client on the retired list, which renders in full server-side before the client-side `router.replace`. Under the flag this hit only pilot clients; now it is every client, every sign-in. *Fix: set `CLIENT_AUTH_DESTINATION = '/'` and the middleware default to `/`, leaving the `/projects` collapse for stale bookmarks only.*

6. **major · medium** · `apps/client-portal/src/components/layout/threshold-chrome-gate.tsx:11,21` with `src/app/page.tsx:25-33` — a signed-in client with zero projects who reaches `/` gets `ProjectsEmptyState` with the global header dropped and no Mat rendered, so the page carries no sign-out, no `/account`, no navigation of any kind. `mat.tsx:14-16` states this exact trap as the reason "Leave the house" is mandatory. The plan did say "empty state minus header", so this is the plan's instruction faithfully executed into a dead end. *Fix: keep `/` out of `HOUSE_ROUTES` when the client has no house (thread a `hasHouse` prop), or render the empty state with the mat's two acts beneath it.*

7. **minor · high** · `apps/client-portal/src/components/threshold/other-houses.tsx:5` ↔ `src/components/threshold/mat.tsx:7` — circular import: `mat` imports `OtherHouses`, `other-houses` imports `mat`'s `COLUMN_HEAD_CLASS`/`LINE_CLASS`. It only works because both constants are referenced inside the component body, not at module scope; a later module-scope use in `other-houses.tsx` becomes a TDZ `ReferenceError`. It also widens `mat.tsx` — a file the plan names as a multi-lane merge point — with two new exports. *Fix: move both constants to `threshold/mat-classes.ts` and import from each.*

8. **minor · medium** · `apps/client-portal/src/app/page.tsx:18-35` — three sequential awaits (`fetchClientProjects` → `resolveActiveHouse` → `fetchClientProjectView`) where the sibling route parallelises its two (`src/app/projects/[projectId]/page.tsx:12`), and `hasClientSession()` (`lib/data/active-project.ts:28-31`) repeats the `auth.getUser()` that `fetchClientProjects` (`lib/data/projects.ts:650-653`) just made — an extra auth round trip on every anonymous or zero-project hit of the portal root. *Fix: have `fetchClientProjects` report the tri-state itself (or share a `cache()`d user read) so `/` makes one auth call and can start the detail fetch sooner.*

9. **minor · medium** · `apps/client-portal/src/app/page.tsx:36-38` — `notFound()` renders a 404 at the site root when the detail read returns null for a project the list just reported (delete race, or RLS skew between `PROJECT_LIST_SELECT` and `PROJECT_DETAIL_SELECT`). A 404 is right at `/projects/<id>`; at the front door the answer is another house or the empty state. *Fix: fall through to `ProjectsEmptyState` (or the next candidate id) instead of `notFound()` on `/`.*

10. **minor · medium** · `apps/client-portal/src/lib/data/active-project.ts:51` — the `projects` read is `.select('id, updated_at').in('id', projectIds)` with no `client_id` predicate, unlike every other fetcher in `lib/data/projects.ts` (`:658`, `:708`). RLS and the caller-supplied ids make it safe today; it is one policy change away from not being. *Fix: add `.eq('client_id', user.id)` to the `projects` read (the notes/invoices reads have no client column and are correctly left to RLS).*

11. **minor · medium** · `apps/client-portal/src/lib/data/__tests__/active-project.test.ts:11-17` — the `@/lib/env` mock invents `PATINA_TEST_PROJECT_FIXTURES`, a variable the real module never reads: `src/lib/env.ts:30` is `isDevelopment && NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE === 'fixtures'`. The two fixtures tests therefore exercise a predicate that does not exist in the product. *Fix: drive the mock from `NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE`, or mock `env` as a plain `{ useProjectFixtures: boolean }` set per test.*

12. **minor · medium** · `apps/client-portal/src/components/threshold/__tests__/other-houses.test.tsx:41` — `expect(link.querySelector('span')).toBeNull()` probes DOM structure, so it breaks the day the link gains any span for an unrelated reason. *Fix: assert the behaviour — `expect(screen.queryByText('Des Moines')).not.toBeInTheDocument()` for the location-less house.*

13. **minor · low** · `apps/client-portal/src/components/threshold/other-houses.tsx:31-37` — the link's accessible name concatenates name and location with no separator ("The Linden houseDes Moines"), where the people column joins with `·` (`mat.tsx:91`). *Fix: `aria-label={location ? `${name} · ${location}` : name}` on the `Link`.*

14. **minor · medium** · `apps/client-portal/src/components/threshold/other-houses.tsx:26-40` — absorb gap. The `/projects` list carried `approvalsPending`, `unreadMessages`, progress and next milestone per project, and the header switcher carried the same counts; the mat's column names the house and its `site_address` only. A client with two houses can no longer tell, from the house she is standing in, that the other one is waiting on her — the exact thing the front door's active-house rule is trying to solve for her. VISION §6 forbids badges, but a line of prose is available. *Fix: add one quiet sentence per other house ("A paper is waiting there.") from the counts `fetchClientProjects` already returns, or record the loss explicitly for wave 2 to rule on.*

15. **minor · medium** · `apps/client-portal/src/components/threshold/threshold-route-collapse.tsx:44,56,86` — the array is round-tripped through `projectIds.join(',')` and re-split, which is opaque and would mis-split an id containing a comma (none today). The effect only needs two scalars. *Fix: derive `const houseCount = projectIds.length` and `const firstHouseId = projectIds[0]`, depend on those, and pass `projectIds` straight to `collapsedHref`.*

16. **minor · medium** · `apps/client-portal/src/components/making/single-pane-solo-redirect.tsx:29` — now dead (its only mount was removed at `src/app/projects/page.tsx:10`) but still compiled, still the last `useFeatureFlag('single-pane')` read in the app, and still carrying a green test suite that reports coverage on unreachable code. The lane report says "left in place for the retirement plan"; the retirement plan's file list should name it explicitly or it will survive. *Fix: delete the component and its test in the retirement lane, and name the file in the handoff.*

17. **nit · high** · `apps/client-portal/tests/threshold.spec.ts:9-10` and `apps/client-portal/playwright.config.ts:25,103` — the e2e spec's header comment still says "a client with several keeps the header" and the config still sets `NEXT_PUBLIC_FLAG_OVERRIDES: 'threshold:true'`, both now false/no-ops. The suite's assertions still pass (the seeded client is solo). *Fix: strike the override and the comment when wave 2 extends `threshold.spec.ts`.*

18. **nit · medium** · `apps/client-portal/src/components/threshold/mat.tsx:83,108` — the grid is `auto-fit minmax(230px,1fr)`; the new column makes four where `docs/design/the-client-page/path-b-the-threshold.html` (mat section, ~787-815) has three, so at common widths a multi-house client's "Your details"/"Leave the house" acts wrap to a second row. *Fix: eyeball 1280 and 390 in wave 2's first-viewport capture, or place other-houses beneath the papers column instead of beside it.*

19. **nit · low** · `apps/client-portal/src/app/error.tsx` ("Back to your projects" → `/projects`, asserted at `src/app/__tests__/error.test.tsx:38-39`) — the root error boundary now sends the client through a route this lane collapses. *Fix: point it at `/`.*

20. **nit · low** · `apps/client-portal/src/components/threshold/other-houses.tsx:31` — "Your other houses" is second person on a page whose global constraint is third-person voice. The plan supplies this exact wording and the same region already says "Your details" (`mat.tsx:121`), so this is noted for consistency, not as a defect.

21. **nit · medium** · `docs/superpowers/specs/2026-09-04-the-client-page-design.md:145-162` — §3.11/§4/§5 still specify the flag-gated switch, the count-gated chrome gate, and "Multi-project clients: /projects list unchanged, full header everywhere". The lane correctly follows the newer plan ruling ("everyone gets the new portal, no feature flag"), so the spec now contradicts shipped code. *Fix: add a superseded-by-plan note at §4/§5 during integration.*

22. **nit · medium** · `apps/client-portal/src/components/making/project-surface-switch.tsx:34-36` — `client_project_view` now also fires for the house `/` auto-selected, so the metric silently starts counting "landed at the front door" alongside "deliberately opened this project". The comment still claims the emitter's meaning is unchanged. *Fix: add a `source: 'front-door' | 'named'` property, or note the semantic change in the ship report.*

---

**Verdict: MERGEABLE_WITH_FIXES** — 22 findings, 0 blockers, 6 major. The lane delivers its whole absorb list (including inventory §8 gap 13, the multi-project switcher, which was called a hard blocker), both gates are green, shared-file edits are minimal and mergeable, and the flag is genuinely gone from every live path. Findings 1, 2 and 3 must be closed before this reaches prod: the portal-role gate no longer runs on the portal's primary route, a caught auth error can loop a client between `/` and sign-in, and the only remaining kill switch is inert while its comment claims otherwise. Findings 4, 5 and 6 should be closed before the integration merge.
