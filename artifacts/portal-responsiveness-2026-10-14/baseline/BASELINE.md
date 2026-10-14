# Designer portal responsiveness: baseline (US-33, SQ-952)

Measured on 2026-10-14. This file reports measurements only and makes no recommendations.
Every number links to the data file it comes from. Values are given as **median [min–max]** in ms
unless a different unit is stated.

## Method

| Lane | What ran | Where the data is |
|---|---|---|
| Local throttled lab | `next build` + `next start -p 3110` from this worktree (base main `515263fcc`), local Supabase CLI stack (no reset, no reseed), Playwright Chromium headless, **CPU 4× slowdown, Fast-4G profile** (165 ms latency, 9 Mbps×0.9 down, 1.5 Mbps×0.9 up), viewports 1440×900 and 390×844, 3 runs per scenario, cold cache per run | `data/local-P*.json`, `data/local-summary.json`, `harness/lab.mjs`, `harness/run-all.sh`, `harness/summarize.mjs` |
| Prod walk (read-only) | Kody's signed-in Chrome on app.patina.cloud, hard navigations + SPA navigations + search typing, with no writing clicks and the spec book never opened | `data/prod-walk.json`, `harness/prod-collector.js`, `harness/prod-spa.js` |
| Prod server probes | `fetch` TTFB from the signed-in tab, 7 rounds, on routes that do no middleware work, routes that call getUser only, and routes that call getUser plus roles | `data/prod-server-probes.csv` |
| B4 middleware (local) | Same probe set against `next start` | `data/local-b4-probes.csv`, `harness/b4-local.mjs` |
| Bundle | `pnpm run analyze` (ANALYZE build) plus browser-side resource sizes | `bundle.md`, `data/bundle.json`, `data/local-jsweight.json`, `harness/bundle.mjs` |

**Marks the lab records** (see `harness/lab.mjs`): *first change* is the first DOM mutation or URL change
after the input. *Placeholder* is the first loader, skeleton or "Picking up…" line. *Usable* is the
first primary content mark with no arrival hold. *No-busy* means no loader is visible. *Settled*
means the network has been idle for 500 ms. `getUser` is the number of `auth/v1/user` requests.
*Depth* is the longest chain of dependent requests (a request that starts after a prior API
response ends). *Mutation batches* (DOM `MutationObserver` callbacks) stand in for re-render counts.
React Profiler commit counts were not collected.

### Caveats

- **Thin local data.** Leah (`designer@patina.dev`) has 16 projects locally (11 in her studio), not
  43, and the US-24 Whole Home project does not exist locally. The document scenarios use Cedar Lane
  Study (`…c0d1`: 4 FF&E lines, 3 rooms, 0 tasks). Counts and times on prod's heavier documents
  will be equal or higher.
- **The prod tab was hidden** during the walk (the automation tab was not in the foreground). The
  browser therefore recorded no paint or LCP, and timers were clamped, so the search debounce reads
  about 978 ms instead of 220 ms. Prod numbers here are network and TTFB timings, not paint timings.
- **One local write.** Before the runs, the harness `setup` clicked "Skip for now" on the
  help-system welcome modal so that it would not block clicks. That stored the tour state for the
  local Leah.
- The first P1 rows ran while a concurrent `grep` was active (it was killed partway). The P1 ranges
  may be slightly wide for that reason.
- Headless Chromium against localhost leaves out the edge→us-east-1 hop. The prod probes measure
  that hop on its own.

## Scenarios (local throttled lab, 1440 unless noted)

| # | Scenario | First change | Placeholder | Usable | No-busy / settled | API reqs | getUser | Depth | Notes | Data |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Sign-in submit → Desk | 159 | 2476 | **7153** | settled 21177 | 100 | 18 | 23 | 4 long tasks, 400 ms total. The sign-in page FCP is about 1021. Background requests keep the network busy for about 21 s | `local-P1-1440.json` |
| P1 | same, 390 | ≈ | ≈ | 7108 | — | — | — | — | Close to the 1440 figures | `local-P1-390.json` |
| P1hard | Hard load /desk | TTFB 39, FCP 704 | 687 | **6974** (LCP 6976) | — | 95 | 16 | 19 | Long tasks 833 ms | `local-P1hard-1440.json` |
| P2 | Desk → Document (SPA) | 215 | 1004 | **1464** | no-busy 3574 / settled 4513 | 81 | 5 | 10 | 16 rpc, 62 mutation batches. The 390 run is close to these figures | `local-P2-1440.json`, `local-P2-390.json` |
| P2hard | Hard load /doc/[id] | TTFB 44, FCP 728 | — | **6773** | no-busy 9372, LCP 10728 | 145 | 21 | 25 | 130 mutation batches, long tasks 1044 ms | `local-P2hard-1440.json` |
| P3 | Rail "Pieces" click inside the Document | 31 | — | capped | — | 8 | — | — | The rail scrolls to the in-document section. It does not route to `/pieces`, so there is no `/pieces` content mark | `local-P3-1440.json` |
| P3hard | Hard load /doc/[id]/pieces | FCP 736 | **none** | **6154** | — | 72 | 17 | 20 | The page is blank until content arrives, with no placeholder at any point | `local-P3hard-1440.json` |
| P4 | Document → People (SPA) | 251 | **none** | 1136 | settled 1501 | 9 | — | — | The list area stays empty until the data lands | `local-P4-1440.json` |
| P5 | People → Library (SPA) | 247 | 647 | 862 | settled 1605 | 14 | — | — | | `local-P5-1440.json` |
| P5 search | Type "chair" in Library | 15 | 248 | results 454 | settled 807 | — | — | — | | `local-P5-1440.json` (`search`) |
| P6 | Tick a task | — | — | — | — | — | — | — | **NOT MEASURED** (see below) | `local-P6-1440.json` (3 error rows) |
| P7 | Status / phase change | — | — | — | — | — | — | — | **NOT MEASURED** | — |
| P8 | Add an FF&E line | — | — | — | — | — | — | — | **NOT MEASURED** | — |
| P9 | Send / outbound | — | — | — | — | — | — | — | **NOT MEASURED** (sending is never allowed) | — |
| P10 | Document → Desk (SPA) | 237 | 259 | 1415 | — | 33 | — | — | | `local-P10-1440.json` |

The min–max range for every cell is in `data/local-summary.json`. Screenshots at 0 ms, 200 ms,
1000 ms and settled for P1–P5 are in `screens/` (JPEG, resized with `sips -Z 1600`; `shots/` is gitignored). The request waterfalls
are in `traces/local-desk-waterfall.json` and `traces/local-doc-waterfall.json`.

**Why the write scenarios were not measured.** P6: the Cedar Lane document has no tasks. On the
retry against `…00d1` (3 tasks), the harness selector found no task row, so all three rows are
error rows and contain no timings. P7 and P8 write to the local Postgres that other sessions share.
That data cannot be cleanly reverted without a reset, and a reset is forbidden. P9 must never send.
The code paths named in the plan (`components/document/work-block.tsx:314`,
`hooks/use-section-work.ts:141`) were **not exercised**.

## Prod walk (app.patina.cloud, read-only, hidden tab)

From `data/prod-walk.json`:

- **Cold Worker.** After about a minute or more of idle time, 4 of 16 hard navigations had a TTFB
  of 2.1–5.2 s, of which 1.6–3.7 s was Cloudflare Worker time. Warm TTFB was 194–583 ms.
- **Requests per hard load:**

  | Route | API requests | `auth/v1/user` | Depth |
  |---|---|---|---|
  | /desk | 97 | 16 | 22 |
  | /doc | 79 | 20 | 25 |
  | /pieces | 62 | 16 | 19 |
  | /people | 68 | 16 | 19 |
  | /library | 70 | 16 | 19 |
- The first API request starts only after the window `load` event, about 1.4–5 s into the load.
- **SPA navigations** (first change / settle):

  | Navigation | First change | Settle | Requests |
  |---|---|---|---|
  | desk→doc | 608 ms | 2.0 s | 17 |
  | doc→desk | 248 ms | — | — |
  | doc→people | 310 ms | 604 ms | — |
  | people→library | 285 ms | 771 ms | — |
- **Request durations:** `auth/v1/user` p50 104 ms, p90 367 ms. The rest of the API: p50 243 ms,
  p90 803 ms.
- **Static caching (not in the plan):** every `_next/static` asset is served with
  `cache-control: public, max-age=0, must-revalidate`. On the document load, all 63 of 63 scripts
  were revalidated with a 304. The browser makes a round trip for every hashed chunk on every hard
  load.
- Browser Supabase traffic in prod goes through `api.patina.cloud` (`SUPABASE_ORIGIN_RUNTIME` in
  `wrangler.jsonc`).

## B4: middleware cost

**Prod** (`data/prod-server-probes.csv`, TTFB medians over 7 rounds):

| Route | Middleware work | TTFB (ms) |
|---|---|---|
| `/auth/error` | none | 72 |
| `/api/version` | getUser only | 102 |
| `/terms` | — | 127 |
| `/auth/signin` (307) | getUser + roles | 131 |
| `/desk` | full page | 195 |
| `/doc` | full page | 166 |
| `/pieces` | full page | 162 |
| `/people` | full page | 197 |
| `/library` | full page | 183 |

- The getUser hop adds about **30 ms**. getUser plus roles adds about **60 ms** over the route that
  does no middleware work.
- Pages add a further 30–65 ms of render on top of that, and all of these are warm-Worker figures.

**Local** (`data/local-b4-probes.csv`):

| Route | TTFB (ms) |
|---|---|
| `/auth/error` | 2 |
| `/api/version` | 28 |
| `/auth/signin` | 34 |
| `/desk` | 34 |

- Locally the middleware costs about **26–32 ms**, measured against local Auth.
- `opennextjs-cloudflare` + `wrangler dev` was **not run**. The prod differential probe already
  measures the real edge→us-east-1 hop, and `wrangler dev` would still talk to local Supabase.

## Bundle

See `bundle.md`. Hard-load client JS (gzip as transferred):

| Route | Gzip transferred |
|---|---|
| /auth/signin | 1,074.7 KB |
| /desk | **1,586 KB** |
| /doc/[id] | 1,935.3 KB |
| /pieces | 1,671 KB |
| /people | 1,644.8 KB |
| /library | 1,611.1 KB |

## Plan hypotheses: confirmed or refuted

| Hypothesis (plan lines 22–75) | Verdict | Evidence |
|---|---|---|
| Zero `loading.tsx`, so routes show nothing until JS hydrates and queries run | **Confirmed** | P1hard/P2hard usable at about 7 s with FCP about 0.7 s. In prod, the first API request starts only after window load (1.4–5 s) |
| Blank screens on `/pieces`, `/people`, `/library` | **Confirmed for /pieces and /people**, **refuted for /library** | P3hard and P4 show no placeholder. P5 shows a placeholder at 647 |
| Design-system `Skeleton` is unused | Not measured (code fact). No skeleton mark fired outside the Desk roster | — |
| Arrival hold (up to 1.5 s / 8.5 s) delays content | **Confirmed, magnitude measured** | Desk usable about 7.0 s. Document hard load: usable 6.8 s, no-busy 9.4 s, LCP 10.7 s (the memory's "≈6.6 s doc first paint" reproduces) |
| No navigation progress indicator | **Confirmed** | SPA first change 215–251 ms local and 248–608 ms prod, with nothing shown before that (`screens/P2-0ms.jpg`, `screens/P4-0ms.jpg`) |
| Only 5 optimistic mutations; clicks wait for write + refetch | **Not measured** | P6–P9 were not run (see above) |
| Broad `['document-state']` invalidation re-runs the Desk's 18 queries | **Not measured** | No write scenario ran |
| Realtime double subscription and echo invalidation | **Not measured** | — |
| 217 `auth.getUser()` calls inside hooks | **Confirmed in effect** | 16–21 `auth/v1/user` requests per hard load, both local and prod. Even an SPA nav makes 5 (P2) |
| `/doc/[id]` 3-level waterfall, about 45 hooks, re-renders whole page | **Confirmed, deeper than stated** | Dependency depth 25 (local and prod), 145 API requests on a local hard load, 130 DOM mutation batches |
| `useProjectFFEItems` loaded 3× | Not isolated | — |
| Desk 60 s poll, N+1 RPC per open PO | **Partly seen** | Desk settled takes 21 s on sign-in, with background requests continuing. The 60 s poll and per-PO RPC count were not isolated (local data has few POs) |
| `select('*')` ×242; react-virtual unused; 22 raw `<img>` | Not measured (code facts) | — |
| Middleware getUser + roles in series on every request, edge→us-east-1 | **Confirmed** | Prod: +30 ms for getUser and +60 ms for getUser plus roles, warm |
| No Smart Placement / nothing cached | **Confirmed, plus cold start** | Cold Worker 1.6–3.7 s on 4 of 16 navigations. Static assets not immutable (max-age=0, 63/63 revalidated) |
| `open-next.config.ts` dummy caches do nothing | Not measured | No page is ISR/static in the paths walked, so the cost could not be observed |
| `/desk` ≈ 1.37 MB gzip | **Refuted upward** | 1,586 KB gzip on a signed-in hard load |
| 325 KB crypto-browserify from `@patina/utils` CommonJS re-export | **Confirmed in size, cause refined** | `d25a86d5` is 317.7 KB parsed / 97.6 KB gzip, on every route. The chain is `utils/src/index.ts:6` → `crypto.ts:5` `from 'crypto'`. utils resolves to ESM source, so the "CJS can't tree-shake" part is refuted: the Node `crypto` import itself pulls in the polyfill |
| Design system one 1.1 MB untreeshaken file | **Confirmed as a single built file** | Chunk `6034` is 300 KB parsed / 79 KB gzip, from `dist/index.js` |
| 790 KB "MIME-table" chunk with no source | **Refuted as MIME** | Chunk `9078` (768 KB parsed / 213.5 KB gzip) is mostly lucide-react (449 KB, all 1,584 icons). The MIME table is only 26 KB (file-selector via react-dropzone). The importer that defeats the tree-shaking was not found |
| Doc page chunk 833 KB | **Confirmed (parsed)** | 223 KB gzip as transferred |
| No web-vitals / RUM | Not measured (code fact) | This lab is the first measurement |

## Not done

- P6–P9 (writes) were not measured.
- `wrangler dev` was not run.
- React Profiler commit counts were not collected. DOM mutation batches stand in for them.
- The lucide importer was not found.
- Prod paint metrics are missing because the tab was hidden.
- The Desk 60 s poll and the N+1 RPC count were not isolated.
