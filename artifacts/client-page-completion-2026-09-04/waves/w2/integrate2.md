# W2 · Integration step 2 — r1 and r3 onto `client-page-2/integration`

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`
**Branch** `client-page-2/integration`
**Head after** `d39a12af3164da3a4ff0786c462a02cc78388c41`
**Date** 2026-09-04

## What landed

| Order | Merge commit | Source | Shape |
| --- | --- | --- | --- |
| 1 | `c26f63ea2` | `origin/client-page-2/r1` @ `33708cf07` | Route retirement — middleware redirect map, shared edge-function deep links |
| 2 | `d39a12af3` | `origin/client-page-2/r3` @ `a2c0ecbac` | Docs — decisions, V8, READMEs |
| 3 | — | `origin/main` @ `26b15145e` | **Already up to date** — no merge commit created |

All three shared one merge base with the integration line: `26b15145e`
(`chore(client-page): merge hotfix — /projects collapse`). That commit *is*
`origin/main`, so the "merge origin/main" step was a no-op and
`supabase/seed/00-legacy-grants.sql` never entered the merge —
`scripts/generate-legacy-grants.py` was not needed and was not run.

## r1 — three conflicts, all resolved

r1 brings 16 files: the middleware redirect map
(`apps/client-portal/src/lib/retired-routes.ts`, new), its middleware wiring,
a new shared Deno module `supabase/functions/_shared/client-portal-links.ts`
plus its test, and eight edge functions retargeted onto it. Everything else
auto-merged; `create-checkout-session/index.ts` merged silently because both
lines had already made the identical change.

### 1. `apps/client-portal/src/middleware.ts`

The auth-page fallback destination.

```
HEAD:  CLIENT_AUTH_DESTINATION,
r1:    '/',
```

**Kept HEAD.** `CLIENT_AUTH_DESTINATION` is `'/'` — the same value — but it
lives in its own module (`src/lib/client-auth-destination.ts`) precisely so
the edge bundle does not pull in `auth-redirect.ts`, whose helper defaults
read `window`. Taking r1's literal would have left that module unimported and
undone a deliberate bundling decision from the W2 line. No behaviour change.

The rest of r1's middleware work — the import of `retiredRouteTarget` and the
308 block after the role gate — applied cleanly alongside it.

### 2. `apps/client-portal/src/__tests__/middleware.test.ts`

A test *name* only:

```
HEAD:  'rejects an authenticated open redirect and falls back to the house'
r1:    'rejects an authenticated open redirect and falls back to the active project'
```

**Kept HEAD**, to match the resolution above. r1's 220 new lines of
retired-route coverage merged around it untouched.

### 3. `supabase/functions/review-requests/index.ts`

Both lanes had independently fixed the same 404 (`/review/<projectId>` was
never a route) and both landed on the same URL:

```
HEAD:  `${CLIENT_PORTAL_URL}/projects/${opts.projectId}#doorstep`
r1:    clientProjectLink(CLIENT_PORTAL_URL, opts.projectId, 'doorstep')
```

**Took r1.** Identical output for a well-formed id, but `clientProjectLink()`
is what r1's other seven functions now call, and it adds the id-shape guard
(`/^[A-Za-z0-9_-]+$/`, falling back to `/`) before interpolating a value into
a `Location` header. Keeping the hand-built string would have left one
function off the shared contract. HEAD's comment was dropped in favour of
r1's, which says the same thing.

## r3 — clean

Docs only, five files, no conflicts:
`.agents/skills/patina-portal-features/SKILL.md`,
`apps/client-portal/README.md`, `docs/design/the-client-page/README.md`,
`docs/design/the-document/DECISIONS.md`, `docs/vision/VISION-DECISIONS.md`.

## Gates

```
pnpm --dir …/apps/client-portal type-check
  > tsc --noEmit   — clean

pnpm --dir …/apps/client-portal test -- threshold making middleware
  Test Suites: 56 passed, 56 total
  Tests:       1092 passed, 1092 total
  Time:        8.8 s
```

`src/__tests__/middleware.test.ts` (r1's new redirect-map coverage) and
`src/components/threshold/__tests__/threshold-route-collapse.test.ts` both
pass on the merged tree.

## Advisory — not fixed, flagged for the next pass

**The client-side route collapse is now shadowed by the middleware.**
`src/components/threshold/route-collapse.ts` maps the same eight exact paths
(`/today`, `/decisions`, `/proposals`, `/invoices`, `/budget`, `/documents`,
`/orders`, `/messages`, plus `/projects`) to the same anchors that r1's
`retiredRouteTarget()` now 308s in the middleware. The middleware runs first,
so `ThresholdRouteCollapse` can no longer be reached for those paths in a real
request — its tests still pass because they call the component directly.

Not a defect: the 308 sends the visitor to the same anchor, permanently, and
one hop earlier. One nuance worth a decision, though — the client-side
collapse sent a *solo* client to `/projects/<id>#anchor` while the middleware
sends everyone to `/#anchor`. `/` resolves to the active project, so a solo
client lands in the same house either way; the difference is only in the URL
she ends up looking at. Either delete the now-dead client-side module or
record that it is kept as a belt-and-braces fallback.

Two other things the merge left consistent and did not need touching:

- `retired-routes.ts` deliberately leaves `/projects/<id>` and
  `/invoices/<id>/print` unmapped, so those pages keep serving.
- `/preferences/unsubscribe` stays public in the middleware and is excluded
  from the map — the retirement does not put a sign-in wall back in front of
  an outcome page.

## Push

Pushed `client-page-2/integration` → `origin/client-page-2/integration`.
