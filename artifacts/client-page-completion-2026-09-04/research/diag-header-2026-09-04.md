# Diagnosis — "Threshold still shows the top nav bar" (client.patina.cloud)

Read-only. Repo at `/Users/kody/Code/patina-merged`, main `da4ca4328`. No code, flag, or prod writes made.

## Headline

**The `threshold` flag is not the blocker — it resolves TRUE for everyone, including anonymous
pre-login visitors.** The header stays because of the *count* half of the gate, and because the
page-body switch and the chrome gate disagree about what "solo" means:

| Component | Condition to show the Threshold / drop the header |
|---|---|
| `ProjectSurfaceSwitch` (page body) | flag true. **No project-count check.** |
| `ThresholdChromeGate` (header) | flag true **AND `projectCount === 1`** AND bare `/projects/[id]` |

So a client with 2+ projects gets **the Threshold page body with the header still on it** — exactly
the reported symptom. Two of Kody's five ids are multi-project.

---

## 1. Flag evaluation as PostHog sees it

Key/host from `apps/client-portal/wrangler.jsonc` `vars`:
`NEXT_PUBLIC_POSTHOG_KEY=phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`,
`NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`.

`POST https://us.i.posthog.com/flags/?v=2` with `{"api_key": …, "distinct_id": …}`:

| distinct_id | `threshold.enabled` | reason |
|---|---|---|
| 95b80df2-…8e91 (Test Walker) | **true** | `condition_match`, condition_index 0, "Matched condition set 1" |
| 6599ba39-…6ec8 (The First Client) | **true** | same |
| d7c72fdb-…a596 | **true** | same |
| aca048c5-…7bc (The Kody's) | **true** | same |
| 74056c2a-…4316 (designer) | **true** | same |
| `00000000-0000-4000-8000-000000000000` (random) | **true** | same |
| `deadbeef-0000-4000-8000-ffffffffffff` (random) | **true** | same |
| `zzz-not-a-uuid-12345` (garbage) | **true** | same |
| `anonymous-visitor-abc` (garbage) | **true** | same |
| brand-new `uuidgen` id, real Chrome UA, SDK-shaped base64 body | **true** | same |

`errorsWhileComputingFlags: false` throughout. Control: `field-companion-voice` returns
`no_condition_match`, `direct-orders` returns `out_of_rollout_bound`, `tester-notes` returns
`no_condition_match` for the same random ids — so the endpoint *is* discriminating; `threshold`
specifically matches everybody.

**Conclusion: flag id 866364's single condition set matches every distinct id, not the 7 listed.**
Whatever the UI shows, the saved condition is effectively "everyone @100%". This is a live exposure:
any signed-in client on client.patina.cloud with exactly one project is already getting the
chrome-less Threshold, and any client at all is getting the Threshold page body.

### Trap discovered (record this)
A headless-Chromium probe of PostHog flags is **useless** — it always returns `flags: {}`.
`posthog-js@1.359.1` ships a bot list containing `"headlesschrome"`
(`node_modules/.pnpm/posthog-js@1.359.1/node_modules/posthog-js/dist/module.js`), and the
**server applies the same filter**. Bisected with curl, one variable at a time, same body/URL:

```
no UA            → nflags=15, threshold=true
Origin header    → nflags=15
_=<ts> param     → nflags=15
config=true      → nflags=23 keys
HeadlessChrome UA→ nflags=0     ← the only discriminator
real Chrome UA   → nflags=16, threshold=true
iOS Safari UA    → nflags=16, threshold=true
```

## 2. Identify flow and flag resolution

- `apps/client-portal/src/lib/analytics/PostHogProvider.tsx:31` — `AuthTracker` calls
  `identifyUser(session.user.id, …)`, i.e. the **Supabase auth user id** (`auth.users.id`), keyed on
  `[session?.user?.id]`. That is the same id space as the 7 ids in the flag and as
  `projects.client_id`. Correct.
- `apps/client-portal/src/lib/analytics/posthog.ts:192-203` — `identifyUser` → `posthog.identify(userId, …)`.
  It does **not** call `reloadFeatureFlags()` itself, but it doesn't need to: posthog-js's own
  `identify()` ends with `t !== r && (this.reloadFeatureFlags(), …)` (verified in the bundled
  `dist/module.js`), so a distinct-id change reloads flags and re-fires `onFeatureFlags`.
- `apps/client-portal/src/hooks/use-feature-flag.ts:104-157` — subscribes to `posthog.onFeatureFlags`,
  plus an immediate `isFeatureEnabled` read, plus an `onAnalyticsInit` queue for the
  child-effects-run-first race. So **yes, the hook flips to true after a late identify without a
  page reload.**
- `NEXT_PUBLIC_FLAG_OVERRIDES` is **not** set in `apps/client-portal/wrangler.jsonc` (checked both
  the top-level `vars` and the `staging` env). In the served bundle the read survives as a runtime
  `process.env` shim lookup (`i.env.NEXT_PUBLIC_FLAG_OVERRIDES`), which is `undefined` in the
  browser → no override in prod. Nothing pins the flag.
- Live headless load of `/auth/signin` confirms PostHog initializes (`window.posthog` present,
  `distinct_id` = a fresh UUID pre-login, one `POST /flags/?v=2` fires). Only console error is an
  unrelated CSP block of `static.cloudflareinsights.com/beacon.min.js` (`script-src` allows only
  `'self' 'unsafe-inline' https://us-assets.i.posthog.com`). The empty flag set in that run is the
  headless-UA artifact above, not a prod fault.

## 3. Project counts (prod Strata, read-only)

`fetchClientProjects` (`apps/client-portal/src/lib/data/projects.ts:645`) counts
`projects` where `client_id = auth.uid()`, ordered by `updated_at` — **no status filter, no
archived filter, no non-client party rows**. So the raw count is the count.

```sql
select client_id, count(*) from public.projects where client_id in (…) group by client_id;
```

| client_id | projects | `projectCount === 1`? |
|---|---|---|
| 6599ba39-…6ec8 (The First Client) | 1 | ✅ header drops |
| 95b80df2-…8e91 (Test Walker) | 1 | ✅ header drops |
| **aca048c5-…7bc (The Kody's)** | **2** | ❌ **header stays** |
| **d7c72fdb-…a596** | **4** | ❌ **header stays** |
| 74056c2a-…4316 (designer) | 0 rows | ❌ header stays |

## 4. The gate in the served bundle — present

`https://client.patina.cloud/auth/signin` references
`/_next/static/chunks/app/layout-e80d051923696950.js` (20,635 B). It contains both gates, minified:

```js
let X=/^\/projects\/[^/]+$/;
function Y({pathname:e,projectCount:t,children:a}){
  let{value:s,isLoading:i}=(0,U.u)("threshold");
  return!i&&s&&1===t&&X.test(e)?null:(0,r.jsx)(r.Fragment,{children:a})}
```

```js
let n={"/today":"doorstep","/decisions":"doorstep","/proposals":"door","/invoices":"letterbox",
       "/budget":"ledger","/documents":"mat-papers","/orders":"road","/messages":"note"};
```

`/_next/static/chunks/app/projects/%5BprojectId%5D/page-542237cc0f79c949.js` → 200, 162,824 B,
51 occurrences of `threshold`. The shipped code matches `da4ca4328`. **Nothing stale.**

## 5. Conditions + landing route

- `apps/client-portal/src/components/layout/app-chrome.tsx:82` — passes `projects.length` from the
  root layout into the gate.
- `apps/client-portal/src/components/layout/threshold-chrome-gate.tsx:30` —
  `!isLoading && value && projectCount === 1 && /^\/projects\/[^/]+$/.test(pathname)`.
- `apps/client-portal/src/components/making/project-surface-switch.tsx:62` — renders `<Threshold>`
  on `!thresholdLoading && threshold` **only**. No count, no route condition. This is the asymmetry.
- `apps/client-portal/src/app/layout.tsx:56` — `await fetchClientProjects().catch(() => [])`.
  A transient failure silently yields `projectCount === 0` for the whole page load.
- **Landing route after sign-in:** `apps/client-portal/src/lib/auth-redirect.ts:9`
  `CLIENT_AUTH_DESTINATION = '/projects'`, and `ClientPortalLogin.tsx:83-91` does a hard
  `window.location.replace('/projects')`. `/projects` is **not** in `ROUTE_COLLAPSE`
  (`components/threshold/route-collapse.ts:26-35` — only `/today /decisions /proposals /invoices
  /budget /documents /orders /messages`). So a solo client signing in lands on the **projects list,
  with the header, by design**, and must click through to `/projects/<id>` to reach the Threshold.
  (Note: the brief's design summary claims the `/projects` list collapses. The shipped map does not
  include it.)

---

## Ranked root causes

### 1. Kody was signed in as a multi-project client (HIGH confidence)
`The Kody's` = 2 projects, `d7c72fdb` = 4. `projectCount === 1` is false → header renders
(`threshold-chrome-gate.tsx:30`), while `ProjectSurfaceSwitch` renders the Threshold body anyway
(`project-surface-switch.tsx:62`, no count check) → "the Threshold, with the nav bar".
Evidence: prod SQL counts; both gate conditions read from the served bundle.
*Minimal fix (do not apply): gate the page body on the same solo condition the chrome gate uses —
thread `projectCount` (or a `soloProject` boolean) into `ProjectSurfaceSwitch` and require it
alongside the flag, so the two halves can never disagree. Alternatively drop `projectCount === 1`
from the chrome gate — but that contradicts the stated design.*

### 2. He was on `/projects` (the list), not `/projects/<id>` (HIGH confidence if he only just signed in)
`/projects` is the post-sign-in destination and is not collapsible. Header is correct there.
*Minimal fix: add `'/projects': <anchor>` to `ROUTE_COLLAPSE`, or set `CLIENT_AUTH_DESTINATION` to
resolve to the solo project. Either is a design decision, not a bug fix.*

### 3. Root-layout project fetch returned `[]` for that render (MEDIUM-LOW)
`layout.tsx:56` swallows any error into `[]` → `projectCount === 0` → header stays even for a solo
client, while the page body still renders the Threshold (same visible symptom as #1). Sign-in does a
hard `location.replace`, so the layout does re-run authenticated — this only bites on a transient
RLS/network failure, and it fails silently.
*Minimal fix: let the layout distinguish "no projects" from "fetch failed" (e.g. `null` on error)
and keep the chrome up explicitly, rather than collapsing both into `[]`.*

### 4. PostHog blocked in his browser (LOW, and self-disproving)
An ad blocker / tracking protection would leave `isLoading` true forever → header stays. But it
would ALSO leave `ProjectSurfaceSwitch` on the old `ProjectViewWrapper`, so he would not have seen a
Threshold at all. If what he saw was the *old* project dashboard plus the header, this moves to #1.

### 5. Flag scope (NOT the cause of the header, but a live defect)
Flag 866364 evaluates true for arbitrary distinct ids. The pilot is not limited to 7 people. Worth
fixing before more clients land on `/projects/<id>`.

## The one fact to ask Kody

**Which client account, and what was the exact URL in the address bar?**
Specifically: was it `The Kody's` (aca048c5-…, 2 projects) or the 4-project account
(d7c72fdb-…) — both keep the header by design — and was the path `/projects` (the list) or
`/projects/<uuid>`? If it was `Test Walker` (95b80df2) or `The First Client` (6599ba39) on a bare
`/projects/<uuid>`, then cause #3 or #4 is live and worth instrumenting.
