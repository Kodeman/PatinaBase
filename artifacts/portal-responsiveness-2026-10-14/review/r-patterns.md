# R Field patterns: cited evidence (US-33, seat 7)

Scope: evidence only. This file makes no recommendations; pairing and the plan belong to later seats. Every URL below was accessed on 2026-10-14.

Evidence grades, used in brackets after a claim:
- **[F]** I fetched and read the page itself.
- **[S]** I only saw a search-result summary of the page. Treat these as leads to re-check, not verified quotes.
- **[V]** The source is a vendor's own marketing or product-positioning claim.
- **[L]** A local fact from this repo or a read-only probe I ran.

## 0. Installed versions and local facts

Resolved from `pnpm-lock.yaml` (the `package.json` ranges are looser) [L]:

| Package | package.json | Resolved |
|---|---|---|
| next | `~16.2.6` (apps/designer-portal/package.json:69) | 16.2.10 (pnpm-lock.yaml:16149) |
| react | `^19.0.0` (:74) | 19.2.8 |
| @tanstack/react-query | `^5.17.19` (:54) | 5.90.21 |
| @supabase/ssr / supabase-js | `^0.5.0` / `^2.98.0` (:52-53) | 0.5.2 / 2.98.0 |
| posthog-js | `^1.359.1` (:72) | 1.359.1 |
| @opennextjs/cloudflare / wrangler | `^1.20.1` / `^4.107.0` (:91, :114) | 1.20.1 / 4.107.0 |

Other local facts the sections below refer to [L]:
- `dev` and `build` both pass `--webpack` (package.json:10, :13).
- `open-next.config.ts` uses the default (dummy) incremental cache, tag cache and queue. Its comment says no page needs ISR.
- `wrangler.jsonc` has no `placement` block.
- `src/middleware.ts:40` calls `supabase.auth.getUser()`. `getClaims` appears nowhere in `packages/supabase/src`.
- The PostHog init (`src/lib/analytics/posthog.ts:161-173`) sets `capture_pageview: false`, `respect_dnt: true`, `ip: false` and a `before_send` sanitiser. It does not set `capture_performance`.

**Version skew warning.** The Next.js docs I fetched describe later releases than the installed 16.2.10. The `useLinkStatus` page is stamped version 16.4.0, and the prefetching guide covers Partial Prefetching. Next 16.3 (published 2026-08-03) introduced Partial Prefetching, and 16.4 (published 2026-10-06) made Cache Components the recommended default for new apps [F: https://nextjs.org/blog/next-16-4; S: https://nextjs.org/blog/next-16-3]. Anything labelled "16.3+" or "16.4+" below is not in the installed version.

---

## 1. Calm, document-first tools

Published engineering material is thin for most of these products. Where I found none, I say so rather than describe behaviour from memory. I did not run signed-in sessions in these products, so "observable behaviour" below is only what the vendors themselves document.

### Linear
- Linear's CTO describes a sync engine that downloads the project's data into IndexedDB, builds the object model from that local copy, and applies user mutations locally first. The server is updated asynchronously over WebSockets [S: https://www.localfirst.fm/15; https://press.farm/local-first-synchronization-why-linear-built-its-own/; https://www.fujimon.com/blog/linear-sync-engine].
- Linear's own blog post "Scaling the Linear Sync Engine" (2023-06-29) is only a page introducing a recorded talk. It has no transcript and says nothing about optimistic writes, queues or sync indicators [F: https://linear.app/now/scaling-the-linear-sync-engine].
- There is a third-party reverse-engineering of the engine that Linear's CTO is reported to have endorsed [S: https://github.com/wzhudev/reverse-linear-sync-engine]. It is not a Linear publication.
- I found no first-party statement on what Linear deliberately does not show (spinners, sync badges).

### Figma
- First-party engineering post (Evan Wallace, 2019-10-16): local property changes appear immediately instead of waiting for the server. The server is the authority on order. For two clients changing the same property, last-writer-wins. The client discards incoming server updates that conflict with its own unacknowledged property changes, which the post says avoids "flicker." Offline edits are replayed on reconnect [F: https://www.figma.com/blog/how-figmas-multiplayer-technology-works/].
- The post describes data flow, not UI chrome, so it does not say what Figma hides or shows about sync state.

### Notion
- First-party engineering post on offline mode: SQLite as a persistent local store, a record of why each page is available offline, CRDT migration for offline pages, and per-page channel messages telling clients to fetch updates [S: https://www.notion.com/blog/how-we-made-notion-available-offline].
- Help-centre material says a progress bar shows a page downloading for offline use, unavailable pages are greyed out in search, and offline mode is not available in web browsers [S: https://www.notion.com/help/use-pages-offline; https://www.notion.com/releases/2025-08-19].
- I found no first-party description of Notion's web-app skeletons or save indicators.

### Things (Cultured Code)
- Cultured Code's blog posts say each device has its own database, changes are sent to the cloud "almost immediately," and the merge algorithm resolves conflicts across devices. They explicitly reject a server-side authoritative database because merging there was "really slow." A 2015 post says Things Cloud asks Apple's push service to notify other devices, and a 2025 post says the backend was rewritten in Swift with a stated fourfold speedup in processing sync requests [S: https://culturedcode.com/things/blog/2010/12/state-of-sync-part-1/; https://culturedcode.com/things/blog/2015/08/things-cloud-nimbus-released/; https://culturedcode.com/things/blog/2025/05/a-swift-cloud/]. The fourfold figure is a vendor claim [V].
- This is a native-app design, not a web one. I found no published statement about sync indicators.

### Basecamp / HEY (Hotwire Turbo)
- Turbo Drive adds a CSS progress bar during navigation that appears only after a delay, 500 ms by default (`Turbo.config.drive.progressBarDelay`). It toggles `aria-busy="true"` on the `html` element during navigation. Prefetching on hover has been the default since Turbo 8 [S: https://turbo.hotwired.dev/reference/drive; https://turbo.hotwired.dev/handbook/drive]. A third-party blog claims hover prefetch saves "500-800ms per click"; that figure is not in the Turbo docs I saw [S: https://writesoftwarewell.com/turbo-drive-essentials/].
- I found no 37signals statement about optimistic writes, and none about why they chose no skeletons. Turbo is the framework, not HEY or Basecamp's own UI policy.

### Apple Notes on the web (iCloud.com)
- Apple Support documents what the web app can do (create, edit lists, organise, search, share) and that changes sync across devices, with collaborators seen "in real time." Nothing I found covers offline use, local caching, autosave cadence, or loading indicators [S: https://support.apple.com/guide/icloud/notes-on-icloudcom-overview-mm6704cac5/icloud; https://support.apple.com/guide/icloud/what-you-can-do-with-icloud-and-notes-mm2d069f7097/icloud].

### Summary of what the evidence says
- Linear, Figma and Things document local-first or apply-locally-then-sync architectures, not UI chrome. No source here describes a deliberate decision to omit a spinner, skeleton or toast. The one explicit "do not show yet" mechanism is Turbo's 500 ms progress-bar delay.

---

## 2. Research on perceived performance

### Response-time thresholds
- **Nielsen's three limits.** 0.1 s: feels instantaneous, "directly manipulating" objects. 1 s: flow of thought stays uninterrupted; past it the system should signal that it is working. 10 s: attention limit; past it use a percent-done indicator and an interrupt. Published 1993 (excerpt of *Usability Engineering*), updated 2014, citing Miller (1968) and Card, Robertson & Mackinlay (1991) [F: https://www.nngroup.com/articles/response-times-3-important-limits/]. The primary sources are Miller, *Proc. AFIPS Fall Joint Computer Conference* 33:267-277 (1968), and Card et al., *Proc. CHI '91*:181-188. I did not open either.
- The same article says a percent-done bar for 2-10 s waits "may be overkill," and recommends subtler feedback there. It says feedback matters most when response times are "highly variable" [F: same URL].
- **Doherty threshold (400 ms).** The source is Doherty & Thadhani, "The Economic Value of Rapid Response Time," IBM report GE20-0752-0, Nov 1982. Secondary sources give conflicting venue details (IBM Systems Journal, CHI '82) and conflicting productivity numbers (25-30% and 45%). The report number looks the most reliable, and I could not open the original [S: https://uxuiprinciples.com/en/principles/doherty-threshold; https://www.ux-guidelines.com/doherty-threshold.html]. One of the summaries cautions that 400 ms is a design heuristic, not a sharp biological boundary [S, same results].
- **Tolerable waiting.** Nah (2004), *Behaviour & Information Technology* 23(3):153-163, reports that feedback prolongs tolerable waiting and that tolerable waiting for information retrieval is "approximately 2 seconds." It was an experiment with simulated page loads; a later citing paper says about 40 participants [S: https://doi.org/10.1080/01449290410001669914]. A companion study, Galletta et al. (2004, JAIS), tested delays of 0-12 s with 196 students [S, same search].
- **Google RAIL (legacy).** "Complete a transition initiated by user input within 100 ms" and process input events within 50 ms. Page last updated 2020, and it says Core Web Vitals is the recommended approach "over RAIL" [F: https://web.dev/articles/rail].
- **INP.** Good is 200 ms or less, poor is over 500 ms, judged at the 75th percentile. INP measures time to the next paint, not network completion [F: https://web.dev/articles/inp].

### Skeleton vs spinner: the studies conflict
- **Mejtoft, Långström & Söderström (2018, ECCE '18, ACM DOI 10.1145/3232078.3232086).** Test of a fictional news site. The skeleton version scored higher on average for perceived speed and ease of navigation, but the spinner users were faster at finding the article on first entry [S: https://dl.acm.org/doi/10.1145/3232078.3232086]. One secondary source describes it as exploratory; I could not see participant counts or significance tests.
- **Viget (2017-10-19), 136 participants** (about half from Mechanical Turk). Three equal-duration GIF loaders (spinner, skeleton, blank), judged on perceived load time and "loaded quickly" agreement [S: https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens]. The reported means, 2.82 s skeleton, 2.41 s spinner, 2.29 s blank, come from a 2026 secondary blog, not from the original text I could read [S: https://theplusaddons.com/blog/skeleton-loading-screen/]. This is a lean web experiment with GIF stimuli, not a peer-reviewed study.
- **How they reconcile.** They disagree on perceived duration. They also differ on method: a within-task site test (Mejtoft) versus passive GIF viewing (Viget). Neither tests a real authenticated app. The NN/G guidance cites Mejtoft only in its reference list, not inline [F: https://www.nngroup.com/articles/skeleton-screens/].
- **NN/G practice guidance (2023-06-04, reviewed 2026-09-02).** Under 1 s: no indicator, because a quick flash makes users feel they cannot keep up. 2-10 s: spinner for a single module, skeleton for a full-page load. Over 10 s: progress bar. Skeletons "do not replace performance-optimization efforts." It warns against skeletons that show only header/footer/background [F: same URL].

### Progress-indicator studies
- **Harrison, Amento, Kuznetsov & Bell, "Rethinking the progress bar," UIST '07**, DOI 10.1145/1294211.1294231: 22 participants, nine progress functions, all 5.5 s. Bars that accelerate toward the end were judged faster than linear, and people tolerated early pauses more than late ones [S: search result summarising the paper].
- **Harrison, Yeo & Hudson, "Faster progress bars," CHI '10**, DOI 10.1145/1753326.1753556: backwards-moving animated ribbing cut perceived duration by about 11% in a 16-person final study [S: https://dl.acm.org/doi/10.1145/1753326.1753556].
- **Conflict.** A later JSMS paper reports a finding "opposite to" the ribbing result [S: https://www.aasmr.org/jsms/Vol14/No.4/Vol.14.No.4.21.pdf], and an arXiv Bayesian study found constant and speed-up bars perceived as faster [S: https://arxiv.org/pdf/2211.13909]. The three do not reconcile cleanly, since they use different bar designs and durations.
- **Branaghan & Sanchez (2009), *Human Factors* 51(4):528-538**, DOI 10.1177/0018720809345684: users prefer more feedback, even when it makes the wait seem less reasonable, and a constant progress bar did best on both preference and reasonableness. I could not confirm whether a spinner was a condition [S: https://pubmed.ncbi.nlm.nih.gov/19899362].

### Flash-of-loading-state thresholds
- No primary study set a minimum delay before showing a loader. The numbers in circulation are design practice:
  - Vue write-up: 200 ms delay plus 500 ms minimum display time [S: https://dev.to/navidjaberi/why-your-loading-spinner-flashes-and-the-two-numbers-that-fix-it-in-vue-45ja].
  - Eleken guide: roughly 250 ms [S: https://www.eleken.co/blog-posts/spinner-ui].
  - Semrush's Intergalactic design system: 600 ms before a skeleton shows, and a progress bar after 5 s [S: https://developer.semrush.com/intergalactic/v15.131.0/patterns/loading-states/loading-states].
  - Next.js's own `useLinkStatus` example: 100 ms animation delay with a 200 ms fade in [F: https://nextjs.org/docs/app/api-reference/functions/use-link-status].
  - Turbo: 500 ms [S: https://turbo.hotwired.dev/reference/drive].
- React itself limits reveals: it reveals suspended content at most once every 300 ms, and a Transition keeps already-revealed content instead of re-showing a fallback [S: https://react.dev/reference/react/Suspense].

---

## 3. The platform as of 2026-10

### Next.js (installed 16.2.10)

**`loading.js` and streaming** [F: https://nextjs.org/docs/app/api-reference/file-conventions/loading, last updated 2026-09-23]:
- `loading.js` wraps `page.js` and nested layouts in a Suspense boundary. It does not wrap the layout or template in the same segment.
- The fallback is prefetched, "making navigation immediate unless prefetching hasn't completed." Navigation is interruptible and shared layouts stay interactive.
- If the layout reads `cookies()`, `headers()` or uncached data, `loading.js` shows no fallback for it. Without Cache Components, "navigation blocks until the layout finishes rendering."
- Streaming starts when a Suspense fallback renders, and the 200 status is then fixed. Some browsers buffer streams under 1,024 bytes.
- The doc stamps `loading` as introduced in v13.0.0.

**Prefetching** [F: https://nextjs.org/docs/app/guides/prefetching, last updated 2026-10-05]:
- Automatic prefetch runs "only in production."
- Without Cache Components, a static route is prefetched in full (client cache TTL 5 min), while a dynamic route is "No, unless `loading.js`." A dynamic route with `loading.js` prefetches layout down to the first loading boundary, with client TTL off by default. A dynamic route's click costs a server round trip.
- The guide's one reference to client versus server components: on later navigations the browser fetches "the RSC Payload for Server Components and JS bundle for Client Components." It makes no separate statement about routes composed of client-component pages.
- Prefetch scheduling order: viewport links, then hover/touch intent, newer replaces older, off-screen discarded.
- Side effects in layouts can run at prefetch time, not at visit time.

**`useLinkStatus`** [F: https://nextjs.org/docs/app/api-reference/functions/use-link-status]: introduced in v15.3.0. `pending` is true before the history update. If the route was prefetched the pending state is skipped, and only the last-clicked link shows pending. The doc says it is most useful with `prefetch={false}`, and that "Prefer route-level fallbacks with `loading.js`, and prefetching for instant transitions."

**Partial Prerendering and Cache Components:**
- Cache Components (`cacheComponents: true`) shipped in 16.0.0; PPR is "the default behavior with Cache Components" and there is no standalone PPR flag now [F: https://nextjs.org/docs/app/getting-started/cache-components; S: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents].
- Partial Prefetching (`partialPrefetching: true`, requires Cache Components) arrived in 16.3 and is not in 16.2.10 [S: https://nextjs.org/blog/next-16-3]. Next says both "will be enabled everywhere in the next major release" [F: Cache Components page above].
- By default `use cache` entries are held in memory per instance. On serverless they do not persist across requests. `use cache: remote` gives durable shared caching, "a network roundtrip that pays off only at a high hit rate" [F: same page].
- Next.js labels stability itself: the 16.4 post recommends Cache Components "as the best choice for every Next.js app" and says earlier releases lacked some cost and performance guarantees [F: https://nextjs.org/blog/next-16-4]. That is a vendor statement [V].

**Turbopack vs webpack in production:**
- Turbopack has been stable and the default for `next dev` and `next build` since 16.0.0, with `--webpack` as the opt-out [S: https://nextjs.org/docs/app/guides/upgrading/version-16]. The upgrade guide's own example is `"dev": "next dev"` with `"build": "next build --webpack"`. The portal passes `--webpack` to both.
- The Next.js 16 blog's "2-5x faster production builds" claim is about build time, not runtime speed, and is a vendor claim [V, S: https://nextjs.org/blog/next-16]. I found no first-party measurement comparing runtime page performance of webpack vs Turbopack output.
- OpenNext issue #1369 reproduces on Turbopack with Cache Components (see section 5), so Turbopack is not a clean baseline on Workers.

### React 19 (installed 19.2.8)
- **`useOptimistic`**: optimistic state exists only while an Action is pending, then React renders the `value` argument. The setter must be called inside an Action, otherwise React warns and the optimistic state "will briefly render." If the Action throws, React renders the current `value`, so the UI reverts to the pre-optimistic view when the parent did not update it [S: https://react.dev/reference/react/useOptimistic; https://react.dev/blog/2024/12/05/react-19].
- **`useTransition`**: `isPending` is true from the first `startTransition` until all Actions finish and the final state shows. Async calls awaited in the Action are included, but "currently require wrapping any set functions after the await in an additional startTransition" [S: https://react.dev/reference/react/useTransition].
- **`useFormStatus`**: returns status only for a *parent* `<form>`. If the calling component is not nested inside a form, `pending` is always false [S: https://react.dev/reference/react-dom/hooks/useFormStatus].
- **`useActionState`**: its `dispatchAction` must be called inside a Transition or passed to an `action`/`formAction` prop, or `isPending` will not update correctly [S: https://react.dev/reference/react/useActionState].
- Suspense and Transitions: see the flash discussion in section 2. A suspended update outside a Transition triggers React error #426 ("replaced with a loading indicator") [S: https://react.dev/errors/426].
- React 19.3 (2026-09-09) adds stable View Transitions; it ships with Next 16.4, not the installed 19.2.8 [S: https://nextjs.org/blog/next-16-4; https://react.dev/blog/2026/09/09/react-19-3].

### TanStack Query v5 (installed 5.90.21)
**Optimistic updates** [F: https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates]:
- *Via the UI (variables):* render a temporary item from `useMutation`'s `variables` while `isPending`. The docs call it "the simpler variant," with "no need to handle rollbacks at all." If the query and mutation are in different components, `useMutationState` (with a `mutationKey`) exposes variables. `variables` are not cleared on error, so the UI can keep showing the item with a retry.
- *Via the cache (`onMutate`):* cancel outgoing refetches, snapshot with `getQueryData`, write with `setQueryData`, return the snapshot to `onError`/`onSettled`. The docs say this suits updates that must show in several places on screen.
- Both patterns invalidate in `onSettled`. For the variables approach, return the invalidation promise so the mutation stays pending until the refetch completes.

**`HydrationBoundary` / SSR** [F: https://tanstack.com/query/v5/docs/framework/react/guides/advanced-ssr]:
- A server component creates a per-request client, fetches, and wraps a client child in `<HydrationBoundary state={dehydrate(queryClient)}>`. Treat server components "as a place to prefetch data, nothing more."
- Default `staleTime` above 0 (the example uses 60 s) avoids immediate client refetch after SSR.
- Since v5.40.0, pending queries can be dehydrated so a non-awaited server fetch streams to a client `useSuspenseQuery`. `useQuery` in that case renders pending and skips server rendering of that content.
- Awaiting several prefetches in sequence in nested server components produces server-side waterfalls.
- **Doc-skew flag:** the current guide's examples use `queryClient.query(...)`, not `prefetchQuery`. I could not confirm which of these exists in the installed 5.90.21.

---

## 4. Supabase auth: `getClaims`, signing keys, and the access-token hook

**`getClaims()` vs `getUser()`:**
- `getUser()` "always sends a request to the Auth server for each JWT" and returns the user object from the database [F: https://supabase.com/docs/reference/javascript/auth-getclaims; S for the getUser details].
- `getClaims()` verifies the JWT against the project's `/.well-known/jwks.json`, "often cached, resulting in significantly faster responses." With an asymmetric project key the verification is local via WebCrypto. With a symmetric (HS256) secret it "always sends a request to the Auth server (similar to getUser)" [F: same page].
- The returned claims come from decoding the JWT, not from a user lookup. If the token is about to expire, the session is refreshed first [S: search summary; the fetched reference page does not discuss refresh].
- The reference page does not state the introduction version. I did not confirm from a changelog that installed supabase-js 2.98.0 or `@supabase/ssr` 0.5.2 supports it as documented. Not verified.

**Signing keys** [F: https://supabase.com/docs/guides/auth/signing-keys]:
- Legacy secret: "Increased app latency as JWT validation is done by Auth server." Asymmetric keys: validation "is fast and does not involve Auth server."
- JWKS is cached at Supabase's edge for 10 minutes, and clients "may cache the keys in memory for an additional 10 minutes," so a revoked key can still be trusted for roughly 20 minutes in your own backend. Supabase's Auth, Data API, Storage and Realtime do not use this cache, so revocation there is instant.
- Rotation does not sign anyone out: non-expired tokens signed by the previous key remain accepted. The page's own migration example assumes a 1-hour token expiry.
- Migrating can break code verifying against the legacy secret. Edge Functions with Verify JWT enabled need it turned off. Revoking the legacy secret requires disabling the `anon` and `service_role` keys first.
- Projects created after 2025-05-01 default to RSA asymmetric keys [S: https://supabase.com/docs/guides/auth/signing-keys, summary only].

**Local probe of the Strata project** [L, read-only]:
- Supabase MCP `get_project` for ref `bkvcixdmuyejfzcijpdg`: name Strata, region `us-east-1`, created 2026-01-13.
- Public GET `https://bkvcixdmuyejfzcijpdg.supabase.co/auth/v1/.well-known/jwks.json` returned HTTP 200 with one ES256 (P-256) key and `cache-control: public, max-age=600`.
- That shows an asymmetric key is advertised. It does not show whether it is the key currently signing user tokens or a standby. I did not decode any user token.

**Revocation and staleness caveats** [S: https://supabase.com/docs/guides/auth/signout; https://supabase.com/docs/reference/javascript/auth-signout; https://github.com/orgs/supabase/discussions/36612]:
- Signing out revokes the refresh token and deletes the client copy, but an already-issued access token "will still be valid until it expires." Deleting a user has the same limit.
- Supabase's suggested closers are a shorter token expiry, or validating the `session_id` claim against `auth.sessions` on sensitive operations. A GitHub discussion shows a `pgrst.db_pre_request` workaround that checks `auth.sessions` on every Data API request.

**Custom Access Token Hook** [S: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook; https://supabase.com/docs/guides/auth/auth-hooks]:
- It runs each time a new JWT is created, including token refresh. Postgres hooks have 2 s and HTTP hooks 5 s before timeout errors, and run in a transaction.
- Required claims must stay present. The hook only changes the access token, not the auth response, so the client must decode the token to read custom claims. A large JWT can cause problems, "especially with SSR."
- Inference, not stated by a source I read: since the hook runs only at issue and refresh time, a claim reflects database state as of the last refresh, so it can be stale until the next token is issued.

---

## 5. Cloudflare

### Smart Placement and placement hints [F: https://developers.cloudflare.com/workers/configuration/placement/]
- By default a Worker runs in the data center nearest the request. Smart Placement (`mode = "smart"`, all plans) analyses request duration and forwards the request only "if a candidate location is significantly faster." Analysis can take up to 15 minutes, 1% of requests skip placement as a baseline, and it "only considers locations where the Worker has previously run."
- Needs steady traffic from multiple locations. Statuses include `INSUFFICIENT_INVOCATIONS` and `UNSUPPORTED_APPLICATION` (placement made it slower and was reverted, fewer than 1% of Workers). A `cf-placement` header shows the outcome, and the docs say the header may be removed before Smart Placement exits beta.
- Only fetch handlers are affected. Static assets "are always served from the location nearest to the incoming request," but code that fetches assets through the binding is served from wherever the Worker runs.
- Explicit hints (`region`, `host`, `hostname`) are for a single-homed back end and are mutually exclusive with smart mode. `region` takes `{provider}:{region}` such as `aws:us-east-1`. The docs call host-based placement "experimental" and warn it does not work for anycast or replicated resources.
- The docs recommend splitting auth and routing at the edge from a placed back-end Worker reached by Service Bindings. **Internal contradiction:** the same page says placement does not affect RPC methods, yet its two-Worker example calls the placed worker over RPC. Verify before relying on that example.
- Hyperdrive's docs give an order of magnitude: each database query costs "20-30ms from a distant region, or 1-3ms when placed nearby" [F: https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/].

### OpenNext for Cloudflare caching [F: https://opennext.js.org/cloudflare/caching]
- **Incremental cache:** R2 (recommended for sites using revalidation, but "stored in a single region"), Workers KV ("We do not recommend using KV because it is eventually consistent"), or Workers Static Assets (read-only, no revalidation). A regional cache wrapper reuses entries for up to 1 minute (`short-lived`) or up to 30 minutes for ISR/SSG (`long-lived`).
- **Tag cache** (only for `revalidateTag`/`revalidatePath`): D1 for small sites, Durable Objects sharded for large.
- **Queue** (time-based revalidation): DO Queue recommended. The memory queue "is not fully suitable for production deployments."
- Cache interception "doesn't work with PPR" and is off by default.
- The page does not document the dummy default that the portal's `open-next.config.ts` relies on. That config's own comment says the dummy cache is a no-op [L].
- SSR routes "need no caching config."

### OpenNext maturity: open issues on the pinned version
- **#1369** (open, opened 2026-08-30, no maintainer response): on `@opennextjs/cloudflare` 1.20.1 (the portal's resolved version), Next 16.2.11 with Turbopack, `cacheComponents: true`, R2 + DO queue + D1 tag cache. Routes whose shell uses `use cache` never resume their Suspense holes (React #419 on every load), and non-cached routes with parallel holes of about 36 KB corrupt the stream (12 of 12 requests failed). A `next start` control showed no problem [F: https://github.com/opennextjs/opennextjs-cloudflare/issues/1369].
- **#1223**: with `cacheComponents` and `enableCacheInterception: true`, RSC requests to PPR-cached routes return HTTP 500; setting interception false works around it. #1130 (4 KiB flight-stream truncation) and #662 are listed as related [S: https://github.com/opennextjs/opennextjs-cloudflare/issues/1223].
- **Node middleware (`proxy.ts`)**: Next 16 renames `middleware.ts` to `proxy.ts`, which always runs on Node. OpenNext added it as experimental. Reports include a ~4.6 MB bundle for a no-op handler (#1373), and one project measured a gzipped upload going from 1,581 KiB to 2,748 KiB [S: https://github.com/opennextjs/opennextjs-cloudflare/pull/1309; https://github.com/opennextjs/opennextjs-cloudflare/issues/1376]. Another report says adapter 1.20.1 exits with "Node.js middleware is not currently supported," while ≥1.20.4 supports it [S, search summary]. The portal still uses `middleware.ts` [L].
- There is no OpenNext roadmap page for Cache Components in what I found. Statements that Workers cannot run PPR in practice come from issues, not from the OpenNext docs.

### Hyperdrive relevance
- Hyperdrive accelerates *database-driver* connections (connection setup near the Worker, a pool near the origin database, and query caching of non-mutating results) [F: https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/]. Writes do not invalidate its cache.
- It supports Postgres (including Supabase) and MySQL, using drivers such as node-postgres or Postgres.js "not the Supabase JavaScript client" [S: https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/; https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/].
- The Hyperdrive page I fetched does not address HTTP or REST APIs at all. The portal uses PostgREST over HTTP, so none of the sources I read describes Hyperdrive acting on that traffic [L + F].

---

## 6. RUM in PostHog

**Web vitals** [F: https://posthog.com/docs/web-analytics/web-vitals; https://posthog.com/docs/libraries/js/config]:
- posthog-js captures LCP, INP, CLS and FCP using Google's web-vitals library, in `$web_vitals` events. It needs the project-level "Web vitals autocapture" setting enabled and SDK ≥ 1.141.2 (installed 1.359.1).
- `capture_performance` is a boolean or config object, default `undefined`. When unset it "falls back to the remote configuration from your project settings." If `false`, neither network timing nor web vitals are captured. The config page documents no sub-keys; tunables on the web-vitals page are `web_vitals_allowed_metrics` (default all four), `web_vitals_delayed_flush_ms` (5,000) and `__web_vitals_max_value` (15 minutes).
- None of the `defaults` date snapshots turn web vitals on.
- Events are batched: up to 5 s after page load or the last `$web_vitals` event. INP and CLS have no fixed availability time.
- PostHog's dashboard offers p75/p90/p99 and PostHog "recommends p90." **Source conflict:** the same page's prose calls good INP "100ms or less" while its table says ≤200 ms, which matches web.dev [F: both pages].

**Cost** [F: web-vitals page]: `$web_vitals` events are billed as regular events, and the first 1 M events are free. PostHog expects roughly 30% as many `$web_vitals` events as `$pageview` events. Sampling is possible via `before_send` with `sampleByEvent(['$web_vitals'], 0.5)` from `posthog-js/customizations`, "at the cost of some accuracy." This is vendor guidance [V].

**Privacy** [F + S]:
- The web-vitals page has no privacy notes [F].
- Network timing is part of `capture_performance` and is used by session replay. Network recording captures request URLs and performance data when enabled in project settings, and payload/body capture is a separate opt-in [S: https://posthog.com/docs/session-replay/network-recording]. Names of the header, body and masking options (`recordHeaders`, `recordBody`, `maskCapturedNetworkRequestFn`) came from the search tool's memory, not the pages, and are unverified.
- Locally, the portal already sets `respect_dnt: true`, `ip: false` and a `before_send` sanitiser [L]. I did not read the sanitiser's rules, so I do not know whether `$web_vitals` URL properties pass through it.
- Because `capture_performance` is unset in the portal's init, whether web vitals are currently collected depends on the PostHog project's remote setting, which I did not query (PostHog access is read-only and out of this seat's scope).

---

## 7. Open gaps

Conflicts are reconciled inline in each section. Not found or not confirmed: first-party descriptions of optimistic writes, skeletons or sync indicators for Linear, Notion web, Apple Notes web and HEY; the Doherty original; whether TanStack Query 5.90.21 has `queryClient.query`; the `getClaims` introduction version; the OpenNext dummy-cache default; and whether the PostHog project currently collects web vitals.
