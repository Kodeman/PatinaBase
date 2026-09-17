# L8 re-review — Multi-project and routing, no flag

- Branch: `client-page-2/l8` @ `2bf23a0a8ef2459b71845aebcc92775d303ea5ca`
  (fix commit `ab45411b9`, report commit `2bf23a0a8`) — read-only review, no edits, no git writes.
- Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l8`
- Reviewed: `git diff 159fd8e05 ab45411b9` (31 files, +719/−196), against
  `l8-review.md` (22 findings) and the fix round at the end of `l8-impl.md`.
- Fresh context: the diff was read before the fix-round narrative.

## Gates (run in this worktree)

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
Time:        5.326 s
Ran all test suites matching /threshold|making/i.
```

Both reproduce the lane's reported output exactly. No sandbox retries were needed.

Because the mandated pattern misses three suites this round changed
(`src/app/__tests__/page.test.tsx`, `src/__tests__/middleware.test.ts`,
`src/lib/data/__tests__/active-project.test.ts` do not match `/threshold|making/i`),
I widened once:

```
test -- "app/__tests__/page|middleware|active-project|auth-redirect|app-chrome|__tests__/error|AcceptInviteForm|portal-access"
Test Suites: 1 failed, 9 passed, 10 total
Tests:       1 failed, 111 passed, 112 total
```

The single failure is `src/lib/__tests__/portal-access.test.ts` ›
"returns null for manufacturer (no manufacturer portal)…" — the stale assertion the
lane already flagged as pre-existing. Verified untouched by the lane:
`git log 26b15145e..HEAD -- src/lib/portal-access.ts src/lib/__tests__/portal-access.test.ts`
is empty. (`src/lib/data/__tests__/orders.test.ts`, the lane's other reported
pre-existing failure, is likewise empty in that log.) It is worth naming again for
integration: `portal-access.ts` is the module that decides the role gate this lane just
put on `/`, so integration's full-jest gate trips on the file the front door now depends on.

`npx eslint` over the ten files this round touched: 0 errors, 0 warnings.

---

## 1. Prior blockers and majors — fixed or not

| # | Sev | Verdict | Evidence |
|---|---|---|---|
| 1 | blocker-adjacent MAJOR | **FIXED** | `src/middleware.ts:148-157` — `req.nextUrl.pathname === '/'` is gone from `isPublicPage`; `src/app/page.tsx` no longer carries its own `redirect`. `/` now falls through both gates: the signed-out redirect at `middleware.ts:229-233` and the portal-role check at `:240-258`. Matcher covers `/` (`middleware.ts:263-267`). Three new tests pin it (`src/__tests__/middleware.test.ts` — signed-out → `/auth/signin?callbackUrl=/`; `roles.domain='designer'` → `/wrong-portal`; `'consumer'` → no redirect, no `x-patina-role-check`). The AASA exemption still short-circuits *before* auth (`middleware.ts:85`), so Universal Links are unaffected. |
| 2 | major | **FIXED at the root** | `src/lib/data/active-project.ts:16-19` — `hasClientSession()` and the `ActiveHouse` tri-state are deleted; the function is `resolveActiveHouse(projectIds): Promise<string \| null>` and has no "signed-out" answer to return. The `/` ↔ `/auth/signin` bounce required the page and middleware to disagree about the session; they now read the same one source. A transient `getUser()` failure in middleware now leaves the visitor *on* `/auth/signin` (that page is `isAuthPage`, so the redirect-to-callbackUrl branch never fires) — no loop. |
| 3 | major | **MITIGATED, residual carried** | `apps/client-portal/wrangler.jsonc:21-26` — the var stays (the plan assigns its removal to the ship lane) but the lying comment is replaced: "INERT… pins nothing and is NOT a kill switch… only way back from a bad deploy is a Worker rollback… The ship lane deletes this var". The *risk* the finding named (first deploy of this branch flips every prod client with no flag rollback) is unchanged and now truthfully recorded, plus carried in `l8-impl.md` § "For the ship lane" item 1. Correct disposition for this lane's scope; integration must not lose the carry. |
| 4 | major | **FIXED** | New `src/app/__tests__/page.test.tsx` (5 cases): opens the chosen house; `data-view-source="front-door"`; three houses in / `p1,p3` out (the self-exclusion); empty state with zero houses *and* `fetchClientProjectView` never called; empty state — not `notFound()` — when the detail read returns null. The exclusion is now shared code (`src/lib/threshold/other-houses.ts:31-45`, `toOtherHouses`) used by both `/` (`page.tsx:45`) and `/projects/[projectId]/page.tsx:36`, so the sibling line the finding called equally untested is covered — plus 3 direct cases in `src/lib/threshold/__tests__/other-houses.test.ts:19-53`. `jest.config.js` no longer excludes `src/app/page.tsx` from coverage. |
| 5 | major | **FIXED (one literal left, see N2)** | `src/lib/auth-redirect.ts:16` — `CLIENT_AUTH_DESTINATION = '/'`; `src/middleware.ts:5,212` imports that constant instead of repeating `'/projects'`. `route-collapse.ts:1-8` no longer claims sign-in lands on `/projects`. Three suites re-pointed at the constant (`lib/__tests__/auth-redirect.test.ts`, `__tests__/middleware.test.ts:177`, `components/auth/__tests__/AcceptInviteForm.test.tsx`). |
| 6 | major | **FIXED** | `src/components/layout/threshold-chrome-gate.tsx:19-36` — `hasHouse` is required and the header drops only when `hasHouse && HOUSE_ROUTES.test(pathname)`; `src/components/layout/app-chrome.tsx:82` passes `projects.length > 0`. Tests in both suites (`threshold-chrome-gate.test.tsx:73-77`, `app-chrome.test.tsx:117-124`). Note the safe-direction degradation the lane calls out: `layout.tsx:56` reads projects with `.catch(() => [])`, so a transient list failure now shows *more* navigation, not less. |

### Minors and nits

| # | Verdict | Evidence |
|---|---|---|
| 7 (cycle) | **FIXED** | New `src/components/threshold/mat-classes.ts` holds `LINE_CLASS` / `COLUMN_HEAD_CLASS` / `SUBLINE_CLASS`; `mat.tsx:7` and `other-houses.tsx:7` both import from it and `mat.tsx` exports neither constant any more — the lane's footprint on that merge point is now *smaller* than at review time. |
| 8 (awaits + duplicate auth) | **PARTLY FIXED, rest rejected** | The duplicate `auth.getUser()` is gone on the solo and zero-house paths (`active-project.ts:20-23` returns before touching Supabase). The multi-house branch still makes a second `getUser()` (`:26-31`) — now load-bearing, since it supplies the `client_id` predicate for fix 10. The remaining two awaits in `page.tsx:18-21` are a genuine dependency chain. Rejection of the shared `cache()`d user read (would edit `lib/data/projects.ts`, a multi-lane file) is reasonable. |
| 9 (`notFound()` at the root) | **FIXED — with a consequence, see N1** | `page.tsx:21-34` falls through to `ProjectsEmptyState`; `/projects/<id>` still 404s. |
| 10 (owner predicate) | **FIXED** | `active-project.ts:36-39` — `.select('id, updated_at').eq('client_id', user.id).in('id', projectIds)`, with `!user → freshest` above it. Test mock now models both `.select().in()` and `.select().eq().in()` shapes. |
| 11 (invented env var) | **FIXED** | `active-project.test.ts:12` — `jest.mock('@/lib/env', () => ({ env: { useProjectFixtures: false } }))`, the real module's actual shape. |
| 12 (`querySelector('span')`) | **FIXED** | `other-houses.test.tsx` now asserts `queryByText('Des Moines')` absent plus the link still findable by accessible name. |
| 13 (accessible name) | **FIXED** | `other-houses.tsx:20-23` `accessibleName()` → `aria-label`; asserted as `'The Linden house · Des Moines'` and `'The Linden house · Des Moines. A paper is waiting there.'`. |
| 14 (per-house attention lost) | **FIXED, and well** | `lib/threshold/other-houses.ts:52-61` `waitingSentence()` turns the counts `fetchClientProjects` already returns into one muted line ("A paper is waiting there." / "Notes are waiting there."), silent when nothing waits. Prose in `SUBLINE_CLASS` — no badge, count or colour (VISION §6). I checked the count's provenance rather than assuming it: `approvalsPending` comes from `computeProjectCounts` (`lib/data/projects.ts:600-623`), whose stage-2 leg is `list_my_project_decision_reviews` filtered by `isClientActionableProjectApproval` (`:508-518`) — it is *her* actionable count, so the sentence cannot claim a paper that is not hers. |
| 15 (join/re-split) | **FIXED** | `threshold-route-collapse.tsx:43-46,58,88-91` — deps are `houseCount` + `firstHouseId`, `collapsedHref` gets the array. Sound: `collapsedHref` reads only `.length` and `[0]` (`route-collapse.ts:47-57`), so no id change can alter the answer without changing one of the two deps. |
| 16, 18, 20, 21 | **REJECTED, reasons accepted** | 16 (delete `single-pane-solo-redirect.tsx`) and 18 (four-column wrap) belong to the retirement lane and to wave 2's viewport capture respectively; 16 is named explicitly in `l8-impl.md` § "For the retirement lane", which is what the finding actually asked for. 20 and 21 were noted-not-defect / integration-scoped in the original review. |
| 17 (stale e2e text) | **PARTLY FIXED, remainder deferred with a reason** | `tests/threshold.spec.ts:8-21` and `playwright.config.ts:34-36` now say the override is inert; the override value and the two-server split stay for wave 2 to remove with the spec that depends on them. Defensible. |
| 19 (error boundary) | **FIXED** | `src/app/error.tsx:41` → `href="/"`, test updated. |
| 22 (`client_project_view` meaning) | **FIXED** | `lib/analytics/events.ts:27-31` — `projectView(projectId, source = 'named')`; `project-surface-switch.tsx:18,36,42` takes `viewSource` and `/` passes `'front-door'` (`page.tsx:46`). Carried into the ship note. |

Net: **2 of 3 must-close-before-prod items closed in code; the third (3) closed as far as this lane's scope allows and carried. All three must-close-before-integration items (4, 5, 6) closed.**

---

## 2. New defects the fix round introduced

**N1 · major (narrow path) · high confidence** — `src/app/page.tsx:21-34` with
`src/components/layout/threshold-chrome-gate.tsx:31` and
`src/components/layout/app-chrome.tsx:82`. Fix 9 made `/` fall through to
`ProjectsEmptyState` when the *detail* read returns null, but `hasHouse` is derived from
the *list* (`projects.length > 0`) in the layout. A client who has houses and whose
chosen house will not open therefore gets the empty state with the header dropped — the
exact stranding trap fix 6 just closed, reached through a different door — and is told
"No active projects yet" when she has projects. Narrow (delete race, or RLS skew between
`PROJECT_LIST_SELECT` and `PROJECT_DETAIL_SELECT`), and strictly better than the old
`notFound()` in one respect only: the not-found page at least carried a link out.
*Fix: try the next candidate house before giving up, or render this branch with the
header (a `hasHouse` that means "a house opened", threaded from the page, not the list).*

**N2 · minor · high** — `src/hooks/use-auth.ts:44` — `async (callbackUrl = '/projects')`
is the last hardcoded client auth destination, missed by fix 5's sweep of
`CLIENT_AUTH_DESTINATION` and `middleware.ts:212`. Inert today: the sole caller
(`src/app/quiz/results/results-view.tsx:473`) passes an explicit path. It is exactly the
literal the fix centralised, and the next caller that omits the argument lands on the
retired list. *Fix: default it to `CLIENT_AUTH_DESTINATION`.*

**N3 · nit · high** — `src/app/not-found.tsx:19` and `src/app/auth/error/page.tsx:46`
still `href="/projects"`. Fix 19 corrected `src/app/error.tsx` alone; these two are the
same class and now route the client through a page that exists only to be replaced by
the collapse. *Fix: point both at `/` alongside 19.*

**N4 · nit · low** — `src/app/error.tsx:41-46` — the copy "Back to your projects" is
byte-unchanged (deliberately) but the button now opens one house. A copy pass belongs
with wave 2's, not here; noting so it is not lost.

**N5 · nit · medium** — `src/middleware.ts:5` now imports `@/lib/auth-redirect`, a module
that also exports `replaceAuthDestination` (`auth-redirect.ts:78-83`, whose default
parameter reads `window.location`). Safe today — the read is at call time, not module
scope, and middleware already pulled `@patina/supabase/auth` — but the edge bundle now
depends on an app module that holds browser-only helpers, so a future module-scope
`window` or `document` there breaks middleware with no local signal. *Fix (optional):
put the constant in its own module both sides import.*

Nothing else in the diff regressed: the AASA short-circuit still precedes auth
(`middleware.ts:85`), `PUBLIC_PREFIXES` in `app-chrome.tsx:19-30` does not contain `/`
so the front door still goes through `AuthenticatedAppChrome`, `manifest.json`'s
`start_url: "/"` behaves as it always did (the root was never renderable without a
session), and the prod `/demo` redirect to `/` (`middleware.ts:196-198`) simply gains one
hop to sign-in for an anonymous visitor.

Unchanged and pre-existing, not introduced here but worth integration's attention:
`tests/projects-load.spec.ts` drives `/projects` unauthenticated and asserts the list's
own heading — with the flag gone, that route always collapses for a client with houses.
It runs only in `integration.yml` (dispatch/nightly), never at PR time.

---

## 3. Assessment

The fix round is unusually disciplined: it fixes 1 and 2 at the root rather than
patching symptoms (deleting the tri-state entirely rather than adding a branch), it makes
the lane's footprint on `mat.tsx` *smaller* than before, it closes finding 14 with prose
instead of recording the loss, and every rejection is argued from the plan or from the
original finding's own wording. The new tests assert behaviour, not structure, and the
one gate failure in the widened run is verifiably pre-existing.

What remains is one narrow major (N1), one dead-literal minor (N2), three nits, and the
ship-lane carry for the wrangler var.

**Verdict: MERGEABLE_WITH_FIXES** — 5 new findings, 0 blockers, 1 major. Both mandated
gates are green (type-check clean, 33 suites / 609 tests passing). Every prior blocker
and major is fixed in code except finding 3, which is correctly deferred to the ship lane
with a truthful comment and an explicit carry. Close N1 before the integration merge —
it re-opens fix 6's stranding trap through the branch fix 9 created — and N2/N3 with it;
carry `l8-impl.md`'s three ship-lane items (delete the inert `NEXT_PUBLIC_FLAG_OVERRIDES`
and accept that only a Worker rollback reverses a bad deploy; the `client_project_view`
`source` property; `SUPABASE_SERVICE_ROLE_KEY` must be present on the Worker or every `/`
hit now stamps `x-patina-role-check: skipped`) into the ship note, and the
`portal-access` / `orders` stale-test cleanup into integration's full-jest gate.
