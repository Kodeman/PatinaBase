# E3 Edge & bundle: middleware hops, placement, OpenNext cache, bundle weight, RUM (US-33, SQ-955)

Seat: infra engineer. I read code and docs only. I changed no product code, deployed nothing and ran
no install. The base is main `0c474d53b`. Every claim cites a `file:line`, a `baseline/…` file or a
vendor-doc URL. "Analyzer report" means the SQ-952 build's
`agent-ab82308fb5b5dc77f/apps/designer-portal/.next/analyze.html` and the `.next/server` tree next
to it. That is the same build `baseline/bundle.md` was written from. I parsed it with a scratch
script and did not commit it.

## Headline: ranked by what each one buys on prod

1. **Hashed chunks are never cached.** All 63 scripts were revalidated with a 304 on every hard
   load (`baseline/data/prod-walk.json:38`). The cause is Cloudflare's default asset header. The
   fix is one `public/_headers` file (§3a). Effort S, risk lowest, prod gain highest per line of
   code.
2. **The design-system barrel leaks into every route.** The root layout is a server component,
   and it imports the design-system barrel. That registers 84 design-system client components as
   client references on every route, `/auth/signin` included. One of those components pulls in all
   1,584 lucide icons through a dynamic `icons[name]` lookup. This is the importer `bundle.md`
   could not find (§4b–c). Together with the `crypto` re-export (§4a), about **220–390 KB gzip**
   can come off every route.
3. **The cold Worker** costs 1.6–3.7 s of Worker time on 4 of 16 navigations
   (`baseline/BASELINE.md:77-78`). Placement does not fix it. The levers are a smaller startup
   (measure it first), serving the 28 prerendered shells from static assets with cache
   interception (§3b), and an honest look at keep-warm (§2b).
4. **Middleware hops** cost about 60 ms warm on every protected hard load
   (`baseline/BASELINE.md:122`). Switching to `getClaims()` plus a role claim makes that zero
   network hops (§1). Strata already signs with ES256, so no key migration is needed.

Two upstream premises are refuted below. The design-system tsup rebuild (splitting, ESM,
per-component entries) **changes nothing** for this portal, because the portal compiles the design
system from source (§4b). Matcher exclusions for `public/three` **save nothing in prod**, because
static assets never reach the Worker (§1d).

---

## 1. Middleware

### 1a. What runs today

`middleware.ts:40` calls `supabase.auth.getUser()`. That is a network call to Strata Auth on
every matched request, made **before** the `/api` passthrough at `middleware.ts:88-90`. So every
`/api/*` call pays one auth hop in middleware and then authenticates again inside its own
`route.ts`. Protected pages, `/auth/*` and `/` then also call `userHasDesignerPortalRole`
(`middleware.ts:139,155,180`). That is a second, serial PostgREST query to `user_roles` under the
service-role key (`middleware.ts:19-33`). The matcher (`middleware.ts:188-191`) includes `/api`
and every RSC request.

On prod with a warm Worker, getUser adds about 30 ms, and getUser plus roles adds about 60 ms over a
route that does no middleware work. This is measured against `/auth/error`, which the matcher
excludes (`baseline/BASELINE.md:108-123`). Local runs agree at 26–32 ms (`baseline/BASELINE.md:135`).

### 1b. `getUser()` → `getClaims()`

**Versions.** The lockfile resolves `@supabase/ssr@0.5.2` with `@supabase/supabase-js@2.98.0` and
`@supabase/auth-js@2.98.0` (`pnpm-lock.yaml:10025,10041,10050`). In the installed copy,
`auth-js` ships `getClaims()` (`node_modules/.pnpm/@supabase+auth-js@2.98.0/…/GoTrueClient.js:2792`).
Here is how it behaves:

- With no `jwt` argument, it reads the session through `getSession()` (`:2795-2801`). That is the
  path that refreshes an expired token and writes the cookies back through the existing `setAll`
  (`packages/supabase/src/client.ts:280-293`).
- It verifies the signature **locally** with WebCrypto when the header has an asymmetric `alg`
  and a `kid` (`:2807-2812`, `:2831-2838`).
- It **falls back to `getUser()`** for HS* tokens (`:2813-2828`).

The JWKS cache is module-global, keyed by storage key (`GLOBAL_JWKS`, `:39-56`), with a 10-minute
TTL (`lib/constants.js:27`). A Worker isolate therefore fetches `/.well-known/jwks.json` at most
once per 10 minutes. `getClaims(undefined, { jwks })` also accepts caller-supplied keys, and an
unknown `kid` falls through to the cache and then to a network fetch (`:2744-2757`). Supabase's
Next guide names `getClaims()` as the call to protect pages in middleware/proxy
(https://supabase.com/docs/guides/auth/server-side/nextjs). No ssr upgrade is needed: `getClaims`
lives on `supabase.auth`, and the ssr client already exposes it.

**Does Strata use asymmetric keys? Yes.** Strata's public JWKS
(`https://bkvcixdmuyejfzcijpdg.supabase.co/auth/v1/.well-known/jwks.json`, fetched 2026-10-14)
publishes one ES256 P-256 key, `kid f8b21bce-…`. The repo already depends on that key: the edge-api
Worker verifies prod user tokens against the same JWKS
(`infra/edge-api-worker/src/auth.ts:20-50`, `infra/edge-api-worker/wrangler.jsonc:133`), and the
positive probe passes end to end (`docs/ops/authcheck-positive-probe.md:128,156`). Staging
evidence shows the issued tokens carry `alg=ES256` (`docs/engineering/patina-cloudflare-phase-1-staging-evidence.md:323`).
**Enabling cost: none.** Before the switch, run one check: decode a fresh prod access token's
header and confirm `alg: ES256` with that `kid`. If it said HS256, `getClaims` would quietly fall
back to `getUser` (`:2807-2815`), so the change would be safe but save nothing.

**Recommendation.** Pass the JWKS into the call from a wrangler var as `getClaims(undefined, { jwks })`.
Then a cold isolate opens **no** TLS connection to Strata just to authenticate. That matters
because a fresh isolate pays a new handshake per origin (§2b). On key rotation the `kid` misses,
and the call falls back to a fetch (`:2746-2757`), so a stale var costs one hop and never fails
closed.

### 1c. The designer-role check

There are two ways to carry the role.

**Option A (recommended): a Custom Access Token Hook adds `portal_domains: ['designer', …]`.**
The hook runs before every token issue, including `token_refresh`
(https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook). One migration adds
the following:

- a `custom_access_token_hook(event jsonb)` that reads `user_roles ⋈ roles.domain`, the same join
  as `middleware.ts:24-28`;
- `grant execute` on it, plus `select` on the two tables, to `supabase_auth_admin`, and a revoke
  from `authenticated`, `anon` and `public` (same page);
- the `[auth.hook.custom_access_token]` block, which is commented out today in
  `supabase/config.toml:243`, plus the Strata dashboard toggle.

No hook exists yet (`supabase/config.toml:243`; no `custom_access_token_hook` in
`supabase/migrations/`). Middleware then reads `claims.portal_domains` from the verified token.
When the claim is **absent**, it falls back to today's query. That covers tokens minted before the
hook, for up to one token lifetime, and makes the rollout reversible.

**Option B: a short-lived signed cookie** (HMAC over `user_id | session_id | domains | exp`,
5 min, set after a DB check). No Auth change, but it needs a new Worker secret, its own revocation
window and more hot-path code.

I recommend A: the claim rides the already-verified token and needs no new secret. Its real cost
is **blast radius**. Strata Auth serves every portal and both iOS apps, so an erroring hook breaks
sign-in everywhere. The hook must catch its own exceptions and return the event unchanged, and it
must be proven on staging first. Keep the claim small: Supabase warns large JWTs hurt SSR (same
page).

### 1d. Security and threat model (RLS untouched)

- **What middleware is today.** It is a shell gate, not a data authority. It already fails
  **open** when the service-role key is missing or the query throws (`middleware.ts:16-21,30-31`).
  No protected page or layout reads data on the server: no file under `src/app/**/{page,layout}.tsx`
  uses `next/headers`, `createServerClient`, `createAdminClient` or `generateMetadata`. The 6 pages
  without `'use client'` are the landing page, the legal pages, `compose` and the token-checked
  unsubscribe page. Data is authorised by RLS on every browser query and by each API route's own
  checks.
- **Stale role after revocation.** A claim reflects `user_roles` at issue or refresh time. Removing
  a designer's role leaves the shell reachable until the access token expires. That is at most
  `jwt_expiry`: 3600 s locally (`supabase/config.toml:150`), with Supabase recommending 5 min to
  1 h (https://supabase.com/docs/guides/auth/sessions). The prod value was not read. Their data is
  already cut off by RLS at revocation time. Option B's window would be its cookie TTL (5 min).
- **Stale sign-out.** `getClaims` cannot see a session revoked elsewhere until `exp`. Supabase's
  only stronger check is to look up `session_id` in `auth.sessions`, which is a DB hop
  (https://supabase.com/docs/guides/auth/sessions). The Next guide accepts this trade for proxy use.
- **Rules.**
  - RLS policies must **not** start reading `portal_domains`. A JWT claim is stale by design, and
    RLS stays on the tables.
  - API routes keep their own authorisation.
  - The service-role key leaves the middleware hot path. Today it is used on every protected
    navigation (`middleware.ts:20-23`), so that is a net security gain.

### 1e. The matcher

- **`public/three`, `public/vendor`: no prod gain.** On Workers Static Assets, the Worker does not
  sit in front of `public/` or `_next/static` (https://opennext.js.org/cloudflare/caching). These
  files never reach middleware in prod. `public/vendor` does not exist (`apps/designer-portal/public/`
  holds only `three/` and `fixtures/`). A matcher edit here only helps `next start`.
- **`/api`: exclude it.** Every API route authenticates itself, which is the stated reason for the
  passthrough at `middleware.ts:87-90`. Today's ordering makes each API call pay about 30 ms of
  getUser for nothing (`baseline/BASELINE.md:113,122`: `/api/version` is the "getUser only" row).
- **RSC prefetches: skip them** with
  `missing: [{type:'header',key:'next-router-prefetch'}, {type:'header',key:'purpose',value:'prefetch'}]`.
  This is the documented form (https://nextjs.org/docs/app/api-reference/file-conventions/proxy,
  "Negative matching"). It is safe for the reason in §1d: a prefetched payload is a data-free
  shell. There are 64 files with `<Link>` (`grep -rl "<Link" apps/designer-portal/src`) and none
  disables prefetch, so every viewport prefetch currently pays about 60 ms of serial Supabase work.
  The same doc warns that a matcher change can remove proxy coverage from Server Functions. The
  portal has none on these routes, but the gate below proves it.
- **Do not** rename `middleware.ts` to `proxy.ts` in this change, even though it is deprecated
  (same doc, version history v16.0.0). That rename is its own risk on OpenNext.

### 1f. Saved ms (from the baseline)

| Request | Today (warm) | After 1b + 1c + 1e |
|---|---|---|
| Protected hard load (`/desk`, `/doc`, …) | +60 ms (`BASELINE.md:122`) | ≈ 0 network. Local ES256 verify was not measured; expect ≤ a few ms |
| `/api/*` call | +30 ms (`BASELINE.md:113,122`) | 0 (excluded from matcher) |
| RSC prefetch | +60 ms each | 0 (excluded) |
| Cold isolate | Fresh TLS to Strata for getUser and again for roles | None if JWKS is inlined (1b) |

B4 (middleware ≤100 ms) is already met warm. The gain is that **every** hard load drops about
60 ms, out of a warm TTFB of 194–583 ms (`BASELINE.md:77-78`). The cold-path saving is
plausible but unmeasured.

---

## 2. Placement

### 2a. Smart Placement or a region hint vs edge TTFB

- **What the Worker does per hard load.** It runs one or two serial round trips to Strata in
  us-east-1 (`docs/ops/wave1-prod-reconciliation-plan.md:72`, `aws-1-us-east-1` pooler), then
  renders a prerendered client shell. That render takes a further 30–65 ms
  (`baseline/BASELINE.md:124`).
- **Static assets ignore placement.** They are "always served from the location nearest the
  incoming request" (https://developers.cloudflare.com/workers/configuration/placement/).
- **Smart Placement needs traffic.** It needs "consistent traffic … from multiple locations",
  takes up to 15 minutes to analyse, and can report `INSUFFICIENT_INVOCATIONS` (same page). A
  portal used by one studio is the textbook case where it never engages.
- **A region hint is deterministic.** `"placement": { "region": "aws:us-east-1" }` (same page)
  moves the run to the colo nearest Strata. It saves each Strata RTT, but adds one forward hop from
  the user's colo.

**What the baseline implies.** One Strata hop costs about 30 ms warm (`BASELINE.md:122`), so the
serving colo is already near us-east-1. Pinning saves at most about 30–60 ms per hard load today,
and after §1 there are **zero** Strata round trips left in the Worker, so pinning becomes pure added
latency. **Recommendation: do not enable either now.** Revisit a `region` hint only if E2's
server-side `prefetchQuery` + `HydrationBoundary` option is adopted. That option would put several
Strata round trips back into the Worker per hard load. In that case, A/B it with the `cf-placement`
response header (same page).

### 2b. The cold Worker (baseline finding a)

The cold rows are `prod-walk.json:13-14,20,26`. Their TTFB was 2,102–5,246 ms, with `cfWorker`
1,576–3,673 ms and `cfEdge` 470–1,424 ms, after at least about 1 minute idle. Warm rows show
`cfWorker` 146–516 ms. Placement does nothing for this. Each option:

| Lever | Evidence | Assessment |
|---|---|---|
| Startup size | `handler.mjs` was 18,026,133 B on 2026-09-26 (`artifacts/return-teaching-2026-09-25/build/deploy-report.md:252`). "Larger Worker bundles can impact startup time"; global scope must run in 1 s; `wrangler deploy` reports `startup_time_ms` (https://developers.cloudflare.com/workers/platform/limits/) | **Measure first.** 1.6–3.7 s exceeds the 1 s global-scope cap, so most of it is first-request module evaluation and fresh connections. Record `startup_time_ms` per deploy and take one startup CPU profile |
| Cache interception, 28 shells (§3b) | Cached pages skip `NextServer`, which "improves cold starts" (https://opennext.js.org/aws/inner_workings/cache_interception) | Best cold fix for static routes. Not `/doc/[id]` |
| No Strata TLS when cold (§1b, inlined JWKS) | A fresh isolate opens fresh connections | Removes two cold handshakes. Unmeasured |
| Keep-warm cron | Crons "run on underutilized machines" (https://developers.cloudflare.com/workers/configuration/cron-triggers/) | Does not warm the user's colo. **Reject** |
| External 1-min ping | Sharding coalesces a Worker onto one server per data center; low-traffic Workers suffered most (https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/) | Warms only the pinger's colo and hides startup cost from RUM. Last resort, only if RUM TTFB p75 still spikes |
| Workers plan | Free allows 10 ms CPU per request, Paid up to 5 min (limits page) | Not a lever. No plan offers warm or provisioned isolates. Account plan not read |

---

## 3. Static caching and the OpenNext cache

### 3a. `cache-control: max-age=0, must-revalidate` (baseline finding b)

**Origin.** This is Cloudflare's default for Workers Static Assets. Per OpenNext: "the worker
doesn't sit in front of static assets, so `headers` in `next.config` has no effect on `public` files
or `_next/static`", and the defaults "use `max-age=0` with `must-revalidate`"
(https://opennext.js.org/cloudflare/caching). `wrangler.jsonc:13-16` binds the assets directory
with no header config, and `apps/designer-portal/public/` has no `_headers` file.

**Fix.** Add `apps/designer-portal/public/_headers` with the snippet from the same page:

```
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

Hashed chunk names make `immutable` safe. Leave `public/three/*` and other unhashed public files on
the default. Today a hard load's `load` event waits behind 63 conditional round trips
(`prod-walk.json:38`), and the first API request starts only after `load`, 1.4–5 s in
(`BASELINE.md:88`; baseline finding c). This file removes those round trips on every repeat visit.
The "API only after load" ordering itself belongs to E2: data starts in client effects after
hydration. Shrinking §4 and caching §3a are the E3 share of finding c.

### 3b. R2/KV incremental cache and tag cache for the 28 prerenderable shells

The baseline build prerendered exactly **28** HTML shells, all under `.next/server/app/*.html`:
`desk`, `people`, `library`, `boards`, `rooms`, `compose`, `help`, `preferences`, the legal pages,
11 `auth/*` pages and others. Today `open-next.config.ts:3-8` keeps the "dummy" caches, so every
request re-renders its shell through NextServer.

These pages are client-rendered and data-free, so the HTML is identical for every user and can only
change at deploy time. That calls for the **static assets incremental cache**: "a read-only store
… serving build-time values from Workers Static Assets", with no revalidation, and no queue or tag
cache needed (https://opennext.js.org/cloudflare/caching). Pair it with `enableCacheInterception`.

- **R2 + regional cache: not worth it.** It adds a bucket, a `WORKER_SELF_REFERENCE` binding and a
  single-region store (same page) to cache content that never changes between deploys.
- **KV:** OpenNext advises against it because it is eventually consistent (same page).
- **Tag cache (D1/DO):** only needed for `revalidateTag`/`revalidatePath`, which the portal never
  calls (`open-next.config.ts:5-17`).

**Expected gain.** It removes the 30–65 ms shell render per warm hard load (`BASELINE.md:124`) and
most of the cold page-JS load on those routes (§2b). It does nothing for `/doc/[id]` or
`/doc/[id]/pieces`: they are dynamic, and they are P2/P3.

**Must verify.** Middleware has to still run before an intercepted response. OpenNext's
interception page does not state the order relative to middleware
(https://opennext.js.org/aws/inner_workings/cache_interception). If it ran first, a signed-out
visitor would get the (data-free) shell instead of the 307 to sign-in. The gate below tests exactly
that.

**Verdict.** Worth it as one M item **after** §3a and §1, not before.

---

## 4. Bundle

The per-route figures are a gzip transfer of 1,074.7 KB on `/auth/signin`, 1,586.0 KB on `/desk`
and 1,935.3 KB on `/doc/[id]` (`baseline/bundle.md:21-26`). Three shared chunks load on every
route: `9078` (213.5 KB gz), `6034` (79.2 KB gz) and `d25a86d5` (97.6 KB gz) (`bundle.md:28-29,41-48`).

### 4a. `@patina/utils`: crypto

The chain confirmed by the baseline: `index.ts:6` re-exports `./crypto`, which imports Node's
`crypto` at `crypto.ts:5`. That pulls in `crypto-browserify`, 97.6 KB gz on every route
(`bundle.md:53-69`).

- **ESM build: not needed.** The portal maps `@patina/utils` to **source**
  (`apps/designer-portal/tsconfig.json:28`), the source is already ESM, and the analyzer shows it
  module-concatenated (`bundle.md:59-61,66-69`). `package.json:6` `main: dist/index.js` is never
  read by this portal.
- **Fix: server-only entry by deletion.** There are 61 files in the portal and `packages/supabase`
  that import `@patina/utils`. None of them imports a crypto export: a grep for all 16 export
  names in `crypto.ts:10-163` across those trees returns zero. The only repo consumers are
  `services/orders/src/modules/checkout/checkout.service.ts:6` and
  `services/orders/src/modules/fulfillment/fulfillment.service.ts:29`, which import
  `generateIdentifierSuffix`. The change is:
  - delete `index.ts:6`;
  - point those two imports at `@patina/utils/dist/crypto`.

  That follows the package's existing server-only convention for `logging`/`error-tracking`
  (`index.ts:24-31`).
- **`sideEffects: false`** in `packages/utils/package.json` would likely drop `crypto.ts` too,
  since no client export of it is used. It depends on bundler behaviour, though, and needs an
  audit of every utils module for top-level effects. Treat it as a follow-up, not the fix.
- **Saving: 97.6 KB gz and 317.7 KB parsed on every route** (`bundle.md:47`).

### 4b. The design system: why the whole barrel ships

The upstream premise is that the portal consumes the design system as "one built file" (dist), so
the plan was a tsup rebuild with splitting, ESM and per-component entries. That premise is
**refuted for this portal.** `tsconfig.json:25` maps `@patina/design-system` to
`packages/patina-design-system/src`, and every analyzer module path is under `…/src/components/…`.
`tsup.config.ts` and `dist/` are not in the designer client graph, so **splitting:true / ESM /
per-component entries would change nothing here.** Skip that item for the designer portal.

The real cause is the client-reference boundary:

- `app/layout.tsx:6` is the server-component root layout. It imports `DebugPanel` from
  `components/DebugPanel.tsx:5`, which is a bare `export { DebugPanel } from '@patina/design-system'`
  with **no `'use client'`**.
- The source barrel has no directive either. The directive is only injected into `dist` by
  `tsup.config.ts:22-46`. But 111 design-system source files are `'use client'`.
- Because the barrel is imported in the server layer, its client components are registered as
  client references for every route. The baseline build's
  `.next/server/app/auth/signin/page_client-reference-manifest.js` lists **84 design-system `.tsx`
  modules**, among them `Confetti` and `DevAccountsPanel`, for a sign-in page that renders none of
  them.
- Chunk `6034` holds **114** design-system modules: the barrel, including ImmersiveTimeline,
  ApprovalTheater and the Media suite (analyzer report).
- `optimizePackageImports: ['@patina/design-system', …]` (`next.config.js:262-270`) evidently did
  not prevent this.
- `DebugPanel` renders only when `NEXT_PUBLIC_DEBUG_MODE === 'true'`
  (`packages/patina-design-system/src/components/DebugPanel/DebugPanel.tsx:72`). Prod therefore
  ships the whole barrel for a component that renders nothing.

**Fix (S):** make `components/DebugPanel.tsx` the client boundary by adding `'use client'` as its
first line, or remove it from the root layout. Webpack then tree-shakes the barrel in the client
graph like any other import. Apply the same check to every non-`'use client'` file that imports the
barrel. There are two: `app/auth/auth-shell.tsx:2`, which today is only reached from `'use client'`
auth pages, and `packages/catalog-ui/src/components/prefilled-input.tsx`.

### 4c. The "MIME-table" chunk 9078 and the lucide importer

**Origin.** The MIME table is `file-selector`, which `react-dropzone` pulls in through
`Media/media-uploader.tsx` (`bundle.md:73-76`). The bulk of the chunk is **lucide-react: 1,584 icon
modules, 448.6 KB parsed**, about 125 KB gz by its share of the chunk (analyzer report;
`bundle.md:78-79`).

**The importer `bundle.md` could not find.** It is
`packages/patina-design-system/src/components/Icon/Icon.tsx:2,44`:
`import { icons } from 'lucide-react'`, followed by `icons[name]`. A runtime-keyed lookup into the
full `icons` map keeps every icon, whatever `sideEffects` or `optimizePackageImports` says. `Icon`
is used by `Calendar.tsx:7,72-73,149,243`, `ProductCard`, `Carousel`, `ColorSwatch` and
`StyleQuizCard`. `Calendar` is `'use client'`, so the barrel leak in 4b registers it on every route,
and the icon map comes with it. `react-day-picker`, `embla`, `@tanstack/table-core`, `framer-motion`
and `react-dropzone`/`file-selector` in `9078` arrive through the same client references.

**Eviction.**

1. Fix 4b. Then only components that a route actually renders remain. A single-line grep of
   `@patina/design-system` imports in `apps/designer-portal/src` finds none of `Calendar`,
   `Carousel`, `ProductCard`, `StyleQuizCard` or `Icon`. Multi-line imports were not checked, so
   the post-fix analyze build is the proof.
2. Rewrite `Icon` so it cannot defeat tree-shaking. Either import the icons each component uses
   directly, or use a small static `{ ChevronLeft, … }` map. Keep `IconName` as a type-only import.
3. If a route really uses `MediaUploader`, load it with `next/dynamic` so `react-dropzone` and
   `file-selector` leave the shared chunk.

### 4d. Does `optimizePackageImports` still help afterwards?

Barely:

- `lucide-react` is already in Next's default optimised list, so its entry in `next.config.js:262`
  is redundant
  (https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports).
- The option is still marked experimental (same page).
- Its `@patina/design-system` entry did not stop the leak in 4b.

Leave the list as it is (deleting it is unmeasured churn) and add nothing to it. The CI budget in
§5 is the arbiter.

### 4e. Estimated saving per route (gzip, as transferred)

| Change | Every route | Basis |
|---|---|---|
| 4a crypto | −97.6 KB | `bundle.md:47` |
| 4c lucide (all icons → used icons) | about −120 KB | 213.5 KB × 448.6/768.3 of chunk `9078` (`bundle.md:41`) |
| 4b the rest of `9078` (design-system third-party deps) + `6034` (unused design-system components) | 0 to −168 KB | 88.8 + 79.2 KB is the ceiling. The floor is unknown until a build shows which components routes really render |
| **Total** | **about −220 to −390 KB** | |

That is roughly `/desk` 1,586 → 1,200–1,370 KB, `/doc/[id]` 1,935 → 1,550–1,720 KB and
`/auth/signin` 1,075 → 690–855 KB. It also means less parse and execute time under the 4× CPU lab,
where long tasks were 833–1,044 ms (`BASELINE.md:48,50`). The parse-time effect is not modelled
here. Re-run `baseline/harness/lab.mjs jsweight` to confirm.

---

## 5. RUM and CI budgets

### 5a. `useReportWebVitals` → PostHog, vitals only

PostHog is already initialised client-side (`apps/designer-portal/src/lib/analytics/posthog.ts:161-173`),
with `respect_dnt`, `ip: false` and a `before_send` sanitiser. Autocapture is left at its default.
The proposal:

- Add one `'use client'` `WebVitals` component in the root layout that calls `useReportWebVitals`
  with a **stable** callback. This is the pattern in
  https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals. It reports TTFB, FCP,
  LCP, CLS and INP; the doc also lists `navigationType` values including `soft-navigation`, but
  confirm the installed Next 16.2 reports those before relying on SPA numbers.
- Capture one event, `portal_web_vital`, with only these properties: `name`, `value`, `rating`,
  `navigationType`, and a **route template** such as `/doc/[id]`, never the raw URL. The sanitiser
  exists because URLs can carry tokens (`posthog.ts:79-91`).
- Sample it with PostHog's `sampleByEvent` helper (https://posthog.com/docs/web-analytics/web-vitals).
- No new identify, no replay, no new autocapture. That keeps the studio promise: it measures the
  tool, not the designer.

**Why not PostHog's built-in `$web_vitals` toggle?** It needs no code and SDK ≥1.141.2, and the
portal has `posthog-js ^1.359.1` (`apps/designer-portal/package.json:72`). But it captures only
LCP, CLS, FCP and INP (same PostHog page). It has **no TTFB**, and TTFB is the metric that exposes
the cold Worker (§2b). It is an acceptable zero-code stopgap.

Do not reuse `packages/utils/src/performance/web-vitals.ts:65,110`. It posts to
`/api/analytics/web-vitals`, which nothing calls today. The analytics flag hooks in
`hooks/use-feature-flags.ts` are unaffected, since vitals need no flag.

### 5b. CI bundle-size budget in `ai-quality-gate.yml`

Today the gate runs `pnpm verify:affected` (`.github/workflows/ai-quality-gate.yml:51-55`). For the
designer portal that is type-check plus jest only, with **no build**
(`scripts/verify-affected.sh:44-46`). The budget therefore needs a build step. An analyze build
takes about 1 min 22 s (`bundle.md:4`).

The proposal is a dependency-free `scripts/bundle-budget.mjs`, run after `next build --webpack`
only when `apps/designer-portal/**`, `packages/{utils,patina-design-system,supabase}/**` or the
lockfile changes. It checks (1) a gzip ceiling on the root shared files (`build-manifest.json`
rootMainFiles, 162.9 KB today, `bundle.md:15`); (2) a gzip ceiling on all non-async chunks; and
(3) **tripwires**: no chunk contains `crypto-browserify`, no chunk holds more than N lucide icon
modules, and `/auth/signin`'s client-reference manifest lists at most M design-system modules.
Build manifests cannot give per-route numbers, because Next 16 dropped `entryJSFiles`
(`bundle.md:31-33`), hence totals plus tripwires. `size-limit` would add a dependency and still
lack a per-route view. Set ceilings from the first post-fix build plus 5%.

### 5c. Keeping the 55 MiB handler gate healthy

`infra/deploy-portal.sh:537-551` fails a deploy whose `handler.mjs` is over 55 MiB. Cloudflare's hard
limit is 64 MiB uncompressed (limits page). The last recorded size was 17.2 MiB
(`deploy-report.md:252`). Proposals:

- Keep the hard gate.
- Add a **warn-only** line at 30 MiB that prints the delta from the previous deploy, so growth is
  seen while there is still about 38 MiB of headroom.
- Write `handler.mjs` bytes and wrangler's `startup_time_ms` into every deploy report. The second
  is the cold-start signal from §2b.

---

## 6. Worker size risk of each proposal

Context:

- There are **121** `route.ts` files (`find apps/designer-portal/src/app -name route.ts`) and 42
  pages.
- Next ≥16.2 (`package.json:69` `~16.2.6`) fixed the per-route client-reference-manifest bloat
  upstream. `scripts/dedupe-client-reference-manifests.mjs` therefore self-retires through Gate 1:
  it skips when there are under 100 manifests **or** under 8 MiB aggregate
  (`:66-68,197`, header `:28-31`).
- With 121 manifests, only the 8 MiB condition keeps it dormant. If anything re-inflates
  `clientModules`, it re-arms, and the 55 MiB gate backstops it.

Effect on `handler.mjs`: middleware, placement, `_headers`, crypto, RUM and the CI budget are
about zero (`auth-js` is already bundled; the hook is DB-side). The static-assets cache adds small
override code, and the prerendered HTML/RSC sit in assets. The 4b boundary fix and the Icon rewrite
**shrink** it: every page and route manifest's `clientModules` loses about 84 design-system entries,
which also lowers the Gate-1 aggregate. No proposal moves toward 55 MiB. Watch E2's server-prefetch
option, which would add server data code to the Worker.

---

## 7. Per item: effort, risk, gate, rollback

| # | Item | Effort | Risk | Gate that proves it | Rollback |
|---|---|---|---|---|---|
| E3-1 | `public/_headers` immutable for `/_next/static/*` | S | Low. Hashed names only; never apply it to unhashed `public/` | `curl -sI https://app.patina.cloud/_next/static/chunks/<hash>.js` shows `immutable`. Re-run `baseline/harness/prod-collector.js`: `staticAssetCaching.revalidated_304` falls 63 → 0 on a second hard load | Delete the file and `wrangler deploy` |
| E3-2 | `getClaims()` with inlined JWKS | S | Low. HS256 falls back to getUser, and an unknown kid falls back to a fetch | `pnpm exec turbo run type-check --filter=@patina/designer-portal`. Extend `src/__tests__/middleware-auth.test.ts` with these cases: signed-out → 307; expired cookie → refresh cookie written; tampered token → treated as signed out. Re-run `prod-server-probes`: `/desk` minus `/auth/error` falls from about 120 ms to about 60 ms or less | Revert the middleware commit and redeploy |
| E3-3 | Role claim via Custom Access Token Hook, with DB fallback | M | **Medium. The hook is on every sign-in for every app.** Stale role ≤ token lifetime | Staging first. Two-user probe: a designer gets `portal_domains`, and a client-only user gets `/unauthorized`. Every app signs in (designer, client and admin portals, both iOS apps). Middleware test for the claim-present and claim-absent paths. Prod probes: `/auth/signin` 307 cost falls to about `/auth/error` | Disable the hook in the dashboard. The middleware fallback keeps working with no deploy |
| E3-4 | Matcher: exclude `/api` and prefetches | S | Low. Verify that no route depends on middleware cookie refresh | Use `unstable_doesProxyMatch` (Next proxy doc) to assert: `/api/x` false; a prefetch header false; `/desk` true. Signed-out `/desk` still gets a 307 | Revert the matcher |
| E3-5 | Placement | — | — | Not recommended. If E2 adopts server prefetch, A/B `region: aws:us-east-1` using the `cf-placement` header | Remove the `placement` block |
| E3-6 | Cold-start measurement: record `startup_time_ms` and handler bytes; one startup CPU profile | S | None | The numbers appear in the deploy report | n/a |
| E3-7 | `staticAssetsIncrementalCache` + `enableCacheInterception` for the 28 shells | M | Medium. Interception vs middleware order is not documented | Signed-out `curl -I /desk` → 307 to `/auth/signin?callbackUrl=…`. Signed-in hard load of `/desk` → 200. Warm TTFB `/desk` ≈ `/auth/error` plus middleware. Cold rows in a fresh prod walk | Restore `open-next.config.ts` and redeploy |
| E3-8 | Drop the crypto re-export (`utils/index.ts:6`) and move the 2 orders imports | S | Low | `pnpm exec turbo run build --filter=@patina/orders` and `pnpm exec turbo run type-check --filter=@patina/designer-portal`. Analyze build: no `crypto-browserify` chunk | Restore the line |
| E3-9 | `'use client'` boundary on `components/DebugPanel.tsx` (and audit the other barrel importers) | S | Low | Analyze build: `auth/signin/page_client-reference-manifest.js` design-system count falls 84 → about 0. `/auth/signin` and `/desk` jsweight drop. Jest and e2e smoke stay green | Revert one line |
| E3-10 | Rewrite `Icon` without the `icons` map | S | Low. A visual check of Calendar and Carousel chevrons | Analyze build: lucide module count is in the tens, not 1,584. Storybook/visual check of the 5 consumers | Revert |
| E3-11 | `MediaUploader` behind `next/dynamic`, only if still shared after E3-9 | S | Low | Analyze build: `file-selector` is absent from shared chunks | Revert |
| E3-12 | RUM: `WebVitals` → `portal_web_vital`, sampled, route template only | S | Low. Privacy is held by properties and sampling | Read-only PostHog query shows events carrying only the listed properties, with no raw URL | Remove the component |
| E3-13 | CI bundle budget script plus a 30 MiB warn on the handler | M | Low. Adds about 1.5 min to PRs that touch the portal | The budget fails on a deliberately reintroduced `export * from './crypto'` | Remove the step |

**Suggested order:** E3-1, E3-9, E3-8, E3-10 (Fix now: four small changes, no infra risk). Then
E3-2, E3-4, E3-6, E3-12 (Next). Then E3-3, E3-7, E3-13 (Structural, each with its staging gate).
E3-5 stays parked.

## What I did not do

- I did not build. Every number comes from the SQ-952 build artifacts or the cited baseline files.
- I did not run `wrangler`, so `startup_time_ms` is unknown.
- I did not decode a prod access token header: the ES256 conclusion comes from the JWKS and the
  edge-worker probe.
- I did not read the prod `jwt_expiry` value.
- The local ES256 verify cost and the cold-path TLS saving are unmeasured.
- Whether OpenNext cache interception runs before or after middleware is unverified and is listed
  as a gate.
