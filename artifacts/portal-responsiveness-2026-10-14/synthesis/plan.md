# Designer portal responsiveness: synthesis and plan (US-33, seat 9, SQ-959)

**14 October 2026 · Lead synthesis (Opus 5.5) of the US-33 seats.** The inputs are `baseline/BASELINE.md`,
`baseline/bundle.md` and the six reviews: E1 data and writes, E2 page architecture, E3 edge and bundle, D1 loading
language, D2 action feedback, and R field patterns. The companion file `synthesis/pairings.md` maps every design
proposal to its engineering change, and every engineering change to what the studio feels. It also lists the
mismatches (M1–M18) and open checks (O1–O10) cited below.

**Rules.** Numbers cite a `baseline/` file or a seat section; **EST** marks an estimate. Lab figures are local,
4× CPU, Fast 4G, unless marked prod. The design canon is waived, so each departure is a PQ. Not waived: the
studio promise, "never AI", 44 px targets, accessibility, honesty. Stable ids for seats 10–13: **F1–F17**,
**N1–N15**, **S1–S8**, **PQ1–PQ20**, **RJ1–RJ18**; E1-1 to E1-12 are assigned in `pairings.md` §0.

## 1. Thesis

The portal feels slow because each hard load spends about seven seconds in a fixed queue before the studio sees
her work, and because no screen tells her anything is happening while it waits. The causes, ranked by measured
contribution:

1. **The auth lock queue, about 2.7 s per hard load.** Sixteen `auth/v1/user` calls run strictly one after
   another, about 172 ms each (`e2-page-architecture.md` §0). The installed auth-js runs `getUser()` inside its
   client lock, and every data read takes the same lock for its token (`pairings.md` M11). Nothing reads until
   the queue drains. The first Desk read starts at 5,951 ms. The Document adds five more serial calls, about
   1.6 s more.
2. **JavaScript before anything, about 3.0–3.3 s.** That is 1,586 KB gzip on `/desk` and 1,935 KB on `/doc/[id]`
   (`bundle.md:22-23`). Three chunks ride on every route, sign-in included: lucide's whole icon set, the
   design-system barrel and crypto-browserify. About 220–390 KB of that is removable (`e3-infra-bundle.md` §4e).
3. **The Desk read runs everywhere.** It is 24 requests plus a per-PO RPC. It runs twice on `/desk`, on every
   Document through the CommandBar and the page's enrichment, on every write (24 of a tick's 27 refetches), and
   every 60 s (`e1-data-writes.md` §0, `e2-page-architecture.md` §3).
4. **The Document's 25-deep dependency chain and whole-page re-render.** It makes 145 requests, 130 mutation
   batches and about 1 s of long tasks (`BASELINE.md:50`). The arrival then hides the finished paper until the
   last lens settles: usable at 6.8 s, LCP at 10.7 s (M14).
5. **Prod-only costs.** A cold Worker adds 1.6–3.7 s on 4 of 16 navigations. All 63 of 63 scripts revalidate on
   every hard load. Middleware adds 60 ms warm, the smallest item (`BASELINE.md:77-78,99-102,122`).

Perception compounds all of this. There is dead air for 215–608 ms after a navigation click. Two rooms are blank
until their data lands, and People shows "empty" while it loads. A task tick changes nothing for 465–748 ms
(`data/e1-P6-1440.json`). The first two causes are about half of every hard load, and both are small changes.

## 2. Scenario scorecard

Budgets (contract, to be ratified in PQ1): **B1** a visible change ≤100 ms after any click. **B2** a shaped
placeholder ≤200 ms after navigation (for a hard load, read as "at first paint"). **B3** usable content
≤1.5 s p75. **B4** middleware adds ≤100 ms. "miss" or "pass" is judged against the budget. Track columns are
cumulative **EST** unless stated.

| # | Scenario · budget | Today (measured) | After Fix now (EST) | After Next (EST) | After Structural (EST) |
|---|---|---|---|---|---|
| 2.1 | P1 sign-in → Desk · B1 | 159 ms miss (`BASELINE.md:46`) | ≤100 pass (F16 press) | pass | pass |
| 2.2 | P1 · B2 | 2,476 ms miss | ~2.3 s miss (the Desk's face waits on PQ3) | ≤200 pass (N10 plus a `/desk` prefetch on the sign-in page) | pass |
| 2.3 | P1 · B3 | 7,153 ms miss | 3.6–4.2 s miss | 3.1–3.7 s miss | 2.7–3.4 s miss (see PQ1) |
| 2.4 | P1hard `/desk` · B2 / B3 | 687 ms at FCP 704 pass / 6,974 ms miss | pass / 3.5–4.0 s | pass / 3.0–3.5 s | pass / 2.6–3.2 s |
| 2.5 | P2 Desk → Document · B1 | 215 ms local, 608 ms prod, miss | ≤100 pass (press) | pass | pass |
| 2.6 | P2 · B2 | 1,004 ms miss | ~1.0 s miss | ≤200 pass (N10, prefetched on intent) | pass |
| 2.7 | P2 · B3 | 1,464 ms pass; prod settle 2.0 s | 0.7–1.0 s pass (F1, F3) | 0.6–0.9 s pass | same |
| 2.8 | P2hard `/doc/[id]` · B3 | usable 6,773 ms, LCP 10,728 ms, miss | usable 3.6–4.1 s, LCP 5–6 s | usable 3.3–3.8 s, LCP ≈ usable (PQ3 C) | 3.1–3.6 s |
| 2.9 | P3 Document → build room | rail scrolls in place, 31 ms (`BASELINE.md:51`); SPA route not measured | lines warm on arrival (F4) | same | same |
| 2.10 | P3hard `/pieces` · B2 / B3 | none miss / 6,154 ms miss | ≈ FCP 0.7 s pass (F13) / 3.3–3.8 s | pass / 3.0–3.5 s | pass / 2.8–3.3 s |
| 2.11 | P4 Document → People · B1 / B2 / B3 | 251 miss / none miss / 1,136 pass | pass / ≤200 pass (F13) / 0.9–1.1 s | pass | pass |
| 2.12 | P5 People → Library · B1 / B2 / B3 | 247 miss / 647 miss / 862 pass | pass / ≤200 pass / pass | pass | pass |
| 2.13 | P5 search · B1 / B3 | 15 pass / results 454 pass | pass | pass | pass |
| 2.14 | P6 tick a task · B1 | value at 748 ms (untick 465), miss (`e1-P6-1440.json`) | held state ≤100 pass; value still ~0.5–0.75 s | value ≤50 ms pass (N3, `e1-data-writes.md` §2.3) | pass, less re-render hitching (S1) |
| 2.15 | P6 · settle | 1,368 ms, 27 refetches | ~0.6–0.8 s, 3 refetches (F5) | at the write, ~0.2–0.45 s | same |
| 2.16 | P7 advance a phase · B1 / list agrees | "Completing…" at the press, pass (code read, not measured) / ≥29 refetches, 1.05–1.6 s prod EST (`e1-data-writes.md` #4) | pass / ~5 refetches, 0.5–0.8 s prod | pass / at the write, 0.24 s p50, 0.8 s p90 prod (N5) | same |
| 2.17 | P8 add a room · B1 / row | form closes at 0 ms and wipes her text / 0.73 s p50, 2.4 s p90 prod EST (3 serial round trips) | "Adding…" held, text kept, pass / unchanged | ghost row ≤100 pass / confirmed in one round trip, 0.24 s p50 (N4) | same |
| 2.18 | P9 approve or send · B1 | "Sending" at the press, pass (code); never optimistic | pass; the Desk card clears after a send (F6) | pass; 8 s line (N12) | same |
| 2.19 | P10 Document → Desk · B1 / B2 / B3 | 237 miss / 259 miss / 1,415 pass | pass / ~250 miss / 1.0–1.3 s | pass / ≤200 pass / 0.4–0.8 s | same |
| 2.20 | B4 middleware (prod, warm) | +60 ms pass; local 26–32 pass (`BASELINE.md:122,135`) | same | ≈0 network (N13) | the role-query fallback retired (S4, if ruled) |
| 2.21 | Cold Worker TTFB (prod, not a budget today) | 2.1–5.2 s on 4 of 16 | measured per deploy and in RUM (F11, F12) | same | fewer cold opens on the 28 shells (S2, S6) |
| 2.22 | Repeat-visit static revalidation (prod) | 63 of 63 scripts return 304 | 0 (F7) | 0 | 0 |

**Estimates.** F1 removes the measured `getUser` span (E2 §0); bundle cuts are priced at the lab's ~1 MB/s; later
tracks take each seat's stated saving, low end where seats overlap. **Hard-load B3 of 1.5 s is unreachable in the
lab on any track**: ~1.2 MB of JavaScript still crosses a ~1 MB/s link and parses at 4× CPU. Hence PQ1.

## 3. Three tracks

Owners: **E1** data and writes, **E2** page architecture, **E3** edge and bundle, **D1** loading design, **D2**
feedback design, **Perf** the measurement harness. Paths are relative to `apps/designer-portal/src/` unless they
start with `packages/`, `services/`, `infra/` or `public/`. Every gate reruns `baseline/harness/lab.mjs` under the
same throttling unless stated.

### 3.1 Fix now (each about a day or less; no ruling needed; no flag)

| Id | Owner | Change and files | Expected effect | Risk | Proving gate |
|---|---|---|---|---|---|
| F1 | E1 | Session-user store (E1-9 core): new `packages/supabase/src/auth/session-user.ts` seeded from `getSession()`, one `onAuthStateChange`, `getSessionUserId()`/`useSessionUserId()`. Migrate only hooks on the P1/P2 hard-load waterfall per `baseline/traces/*` initiators (e.g. `use-inbox.ts:98,137,254`, `use-permissions.ts:123,155,231,260`); `queryClient.clear()` on `SIGNED_OUT` | −~2.7 s per Desk hard load, ~4.2 s per Document | Cross-user cache bleed; writes keep server attribution (`auth.uid()`) | `auth/v1/user` 16–21 → ≤2 per hard load; account-switch test shows no prior-user rows |
| F2 | E2 | One Desk key (E2-3): drop `orgId` from `desk/page.tsx:131`, filter studio drafts in `select` (`hooks/use-desk-engagements.ts:1071`) | About 48 fewer requests per Desk hard load; −0.2 to −0.5 s | Low | Each Desk table requested once in the Desk waterfall; walkthrough and studio-drafts tests unchanged |
| F3 | E2 | Intent prefetch and seed (E2-6): `prefetch={false}` plus `router.prefetch` and `prefetchQuery` on pointerenter/focus in `desk-job-card.tsx:72-73` and ⌘K rows; `useDocumentEngagement` takes `placeholderData` from the Desk cache (`hooks/use-document-state.ts`) | P2 usable −0.3 to −0.6 s; the title is in hand at commit (M4) | Low; the seeded row is the one the Desk just showed | Hover → click run: 0 `document_state` requests after the click; P2 usable |
| F4 | E2 | One FF&E key (E2-7): `packages/supabase/src/hooks/use-project-v2.ts:185` keyed without the lifecycle variant; callers `doc/[id]/page.tsx:640,1934,2601`, `pieces/page.tsx:63`, `care-band.tsx:136`, `command-bar.tsx:249` | 3 → 1 `project_ffe_items` request per Document; the build room opens warm | Low; a wider embed | Document hard load shows 1 request; P3 SPA shows 0 |
| F5 | E1 | Narrow the P6/P7 hooks (E1-3 subset): a minimal `docKeys` factory in `packages/supabase/src/query-keys/document.ts`; `hooks/use-section-work.ts:133-137,155-159` and `use-project-v2.ts:638-642` invalidate their own keys plus the engagement row, and the Desk with `refetchType: 'none'` | Tick refetches 27 → 3; settle about halves | Under-invalidation of a Desk input | The `e1-P6` harness shows ≤3 refetches; a Desk test shows a ticked overdue task gone after navigating to `/desk` |
| F6 | E1 | Send and discard mark the Desk stale (E1-5): `packages/supabase/src/hooks/use-outbound-drafts.ts:47,59,67` | The Desk stops showing a sent draft as ready to send (today up to 60 s) | None | Unit test: send invalidates `docKeys.desk()` |
| F7 | E3 | `public/_headers`: `/_next/static/*` → `Cache-Control: public,max-age=31536000,immutable` (E3-1) | 63 revalidations → 0 on repeat hard loads | Low; hashed names only, never unhashed `public/` | `curl -sI` shows `immutable`; `prod-collector.js` `revalidated_304` 63 → 0 |
| F8 | E3 | Delete `packages/utils/src/index.ts:6` (`export * from './crypto'`); point `services/orders/src/modules/checkout/checkout.service.ts:6` and `fulfillment/fulfillment.service.ts:29` at the crypto module (E3-8) | −97.6 KB gzip on every route | Low | Orders build and portal type-check pass; the analyze build has no `crypto-browserify` chunk |
| F9 | E3 | `'use client'` on `components/DebugPanel.tsx`; audit `app/auth/auth-shell.tsx:2` and `packages/catalog-ui/src/components/prefilled-input.tsx` (E3-9). E3-11 follows only if the uploader is still shared | Part of −220 to −390 KB per route | Low | `auth/signin` client-reference manifest: design-system modules 84 → about 0 |
| F10 | E3 | Rewrite `packages/patina-design-system/src/components/Icon/Icon.tsx:2,44` without the `icons[name]` map (E3-10) | About −120 KB gzip per route | Low; check chevrons in Calendar and Carousel | Analyze build: lucide modules in the tens, not 1,584 |
| F11 | E3 | RUM (E3-12): a `'use client'` `WebVitals` in `app/layout.tsx` sends sampled `portal_web_vital` {name, value, rating, navigationType, route template} via `lib/analytics/posthog.ts`; O6 first | The only proof of B3 p75 in prod | Privacy rests on the property list; no new identify | PostHog query shows only listed properties, no raw URL |
| F12 | E3 | Cold-start instrumentation (E3-6): `handler.mjs` bytes and `startup_time_ms` in each deploy report (`infra/deploy-portal.sh`) | The cold path becomes visible | None | Numbers in the next deploy report |
| F13 | E2 + D1 | Shaped placeholders for rooms without an arrival (E2-1 subset): `loading.tsx` plus one skeleton at E2's mount points for `doc/[id]/pieces`, `people` (`directory-view.tsx:571` gains `role="status"`), `library`, `rooms`, `room/[id]` (`room-view.tsx:279-289`, three states), `boards`, `board/[boardId]`, `drafting`, `ceremony`. Still pearl bars, no breath; H1–H4 (`d1-loading.md` §2). `desk`, `doc/[id]` and the catch-all wait for N10 (M3) | P3hard and P4 placeholder "none" → first paint; People never reads empty while loading | Low; geometry must match (D1.19) | B2 on P3hard, P4, P5; no blank `screens/*-200ms` frame; `aria-busy` on every fallback |
| F14 | E2 | `app/error.tsx`, `app/(document)/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` (E2-2), in D1 §6's in-frame error line | A broken page keeps the drawer and ⌘K | Low | Jest: a page throw renders the boundary inside the chrome; unknown URL shows the paper not-found |
| F15 | D2 + E1 | Act-site honesty (not waived, so no ruling). `ffe-section.tsx:934-946` keeps name and budget until success ("Adding…"). `palette-swatch-editor.tsx:61-62` rolls back on error; `:72-73` delete and `piece-folio.tsx:96` image remove become pending-only until PQ14, with `role="alert"` at `:283-286`. `retry: false` on send and money hooks unless keyed (`use-outbound-drafts.ts`, `use-invoices.ts:1058,1111`, PO release, transmittals). Background stamps (`compose-decision-sheet.tsx:81`, `com-slot.tsx:187`, `board-suggestions-rail.tsx:81`) never raise the global toast. Inline `onError` in `rooms-rail.tsx:74-86`, `resolve-signoff.tsx:48-75` | No lost words; no state the database lacks; no double send on retry | Low | RTL: forced failure keeps the typed name; the swatch shows the server value after a refusal; `retry` false on send/money hooks |
| F16 | D2 + E1 | Silent acts answer at once (D2.2, D2.4, D2.18, D2.19, E1-10). Ticks in `work-block.tsx:312-349` and `coordination-work.tsx:152,160` get a press state, a 44 px row (13 px today, `:177-178`), `aria-pressed`, `aria-busy` while pending. `exclusions-list.tsx:143`, `gate-conditions-editor.tsx:302,310` disabled while pending. `.da-act:active` on Desk cards, rail links, sign-in submit | B1 met by a truthful held state on P1, P2, P4–P6, P10 | Work blocks get taller | Playwright: visible change ≤100 ms, 3 of 3 runs; RTL `aria-busy` while pending; 44 px measured |
| F17 | Perf | The harness grows: E1's P6 script standard; P7 and P8 with fixture-and-delete; P9 up to "Sending" on draft edits only, never a send; Profiler commit counts; a CLS mark; per-scenario `auth/v1/user` and refetch counts | Every later gate runnable; S1's precondition | Shared local Postgres needs a reset window | Reproduces today's P6 (748 ms, 27 refetches) before any fix lands |

**Order inside Fix now.** F17 first, so every other gate has a baseline. Then F1 and F7–F10, the largest gains.
F5 must land before N3 (M1). F13 and F16 can run in parallel with everything.

### 3.2 Next

| Id | Owner | Change and files | Expected effect | Risk | Proving gate |
|---|---|---|---|---|---|
| N1 | E1 | Finish the session-user sweep (E1-9): remaining ≥55 `queryFn` and 76 `mutationFn` `getUser` sites; rebase `useSession` (`packages/supabase/src/hooks/use-auth.ts:22-46`); keep `getUser` for auth flows only | `auth/v1/user` ≤2 everywhere (P2 SPA makes 5) | Cross-user bleed, as F1 | Per-route counts in F17 |
| N2 | E1 | `useOptimisticMutation` (E1-1) in `packages/supabase/src/hooks/optimistic.ts`: cancel, snapshot, patch, reverse restore, required `scopeId`, `honesty: 'internal'`, deny-list test. M1b: optimistic classes end `isPending` at the write; reconcile unawaited | N3–N5 safe and uniform | A wrong `apply` hidden in the helper | Jest: restore over 2 keys; scope serializes 2 rapid calls; deny-list grep |
| N3 | E1 + D2 | Optimistic ink wave 1, flag `optimistic-ink` (PQ9, PQ10): tick (`use-section-work.ts:141`), coordination tick, add-task ghost (M13), milestone (`use-account-page.ts:300`), reaction (`use-feedback.ts:293`), draft text (`use-outbound-drafts.ts:33`), schedule line (`use-project-ffe-ga.ts:224`) | P6 value ≤50 ms; no milestone snap-back | Double-click race (scoped); filters hiding the row | Value ≤100 ms, 3 of 3; forced 500 restores with an inline line |
| N4 | E1 + D2 | Add a room in one round trip (E1-6, D2.9): client UUID, `sort_order` from cache or server default (`hooks/use-document-rooms.ts:40-66`); ghost row in `ffe-section.tsx`, `rooms-rail.tsx:74` | Row ≤100 ms | `sort_order` collision | Row ≤100 ms; forced error keeps the name |
| N5 | E1 + D2 | Phase advance (D2.11): receipt written into `['project-phases', id]`; narrowed invalidations; 8 s line (`use-project-v2.ts:592-642`). Stays pending-only | List changes with the notice | None new | Lab P7: same frame |
| N6 | E1 | Remaining narrowing (E1-3, E1-11): 51 whole-`document-state` sites, margin-items, `['projects']`, invoices, procurement, 112 `Keys.all` sites; delete dead `['desk-engagements']` invalidations | Every write's fan-out shrinks like the tick's | Under-invalidation | Per-action refetch counts in F17 |
| N7 | E2 + E1 | The Desk leaves the Document (E1-4, E2-5, M12, PQ18): `command-bar.tsx:404` `enabled: open`; enrichment (`page.tsx:1103-1110,2928-2943,380-387`) reads one engagement's scoped need | Document no-busy −0.5 to −1.5 s; no Desk poll | Medium; red-letter need must stay exact | 0 Desk-shaped tables on a Document; `selectOperationalNeedForDocument` tests pass |
| N8 | E2 | `desk_read` RPC (E2-8) incl. claim deadlines (E2-4), SECURITY INVOKER, per-feed exception blocks, `p_engagement_id` scope; migration → `review-audit-frontier` | 24 + 1 + N requests → 1; −0.2 to −0.5 s prod | Sequential can be slower | `EXPLAIN ANALYZE` ≤150 ms prod-shaped; RLS parity for three identities; `buildDesk*` tests unchanged |
| N9 | E2 | `document_open(p_id)` RPC (E2-9): row, ids, redirect resolution (`hooks/use-document-state.ts:47-150`) | Depth −1; up to 5 fewer round trips on redirects | Medium; redirect semantics | Jest over six resolution branches |
| N10 | D1 + E2 | The loading register on Desk and Document, behind `loading-register` (PQ2, PQ3, PQ5–PQ7): `desk/`, `doc/[id]/` and `(document)/` `loading.tsx`; the held state renders `<DocumentSkeleton/>` (`doc/[id]/page.tsx:3013-3021,3345-3351`); arrival C (`lib/arrival/arrival.css:8-24`, `arrival-run.tsx:401`); Desk frames become filled bars; prose lines retired; StrataSweep for unknown-shape work only | P2 placeholder ≤200 ms; Document LCP ≈ usable | Medium; US-14 continuity, `arrival_ended` telemetry | B2 on P2/P10; CLS under 0.05; updated `page.test.tsx` arrival tests pass |
| N11 | D1 + E2 | The navigation rule (PQ4) in `(document)/layout.tsx`: capture-phase anchor listener and wrapped `router.push` start it; no `aria-busy` in `<main>` ends it; shows at 300 ms (M6) | Something speaks on a cold navigation | Low | No rule under 300 ms; rule on a forced 1 s delay; reduced motion steps |
| N12 | D2 + E1 | The grammar everywhere (D2.5–D2.8, D2.10, D2.12, D2.14–D2.16): `saving…` at 400 ms held ≥500 ms; R83 inline failures (PQ11); quiet band `saving…` (PQ12); `beforeunload` while pending; 8 s lines (PQ16); offline after O3 (PQ15) | One consistent answer to every click | Copy volume | RTL per act class; no global "Error" toast from a `(document)` mutation |
| N13 | E3 | `getClaims()` with an inlined JWKS in `middleware.ts:40` (E3-2); matcher excludes `/api` and prefetch (E3-4); then viewport prefetch returns (M7). After O2; `review-audit-frontier` | B4 ≈0 network; −30 to −60 ms per API call | Low; HS256 and unknown `kid` fall back | `middleware-auth.test.ts` signed-out/expired/tampered; prod `/desk` minus `/auth/error` ≤60 ms |
| N14 | E2 | Images (E2-12): width/height or aspect-ratio, `loading="lazy"`, `decoding="async"`, `fetchpriority="high"` on the folio hero (`piece-folio.tsx:60`); the 6 unboxed sites first | No layout shift on the Library, boards, Pieces and Room views | Low | CLS under 0.05 on those rooms; off-screen images not requested before scroll |
| N15 | E1 + D2 | Undo where PQ14 rules it: folio image remove (re-persist the previous list) and swatch delete | Deletes answer at once, honestly ("Removing… Undo") | Low | RTL: Undo restores the row; the row reads "Removed" only on receipt |

### 3.3 Structural

| Id | Owner | Change and files | Expected effect | Risk | Proving gate |
|---|---|---|---|---|---|
| S1 | E2 | Split `doc/[id]/page.tsx` into lenses owning their reads, `memo`, a settled context instead of setter reports (E2-10), four slices; only after F17 Profiler counts | −0.2 to −0.5 s long tasks; less hitching | Medium; arrival readiness | Commits per settle −50%; arrival tests pass |
| S2 | E3 | `staticAssetsIncrementalCache` + `enableCacheInterception` for 28 shells (`open-next.config.ts`, E3-7) | Fewer cold opens; −30 to −65 ms | Medium; order vs middleware (O7) | Signed-out `/desk` → 307, signed-in 200 |
| S3 | E2 | Desk-only server prefetch + `HydrationBoundary`, flagged (E2-13), after F1, N8, N13, PQ3; region A/B rides along (E3-5) | +0.2 to 0.5 s hard load | High; Worker CPU, arrival flash | Keep only if RUM shows ≥500 ms p75 off LCP |
| S4 | E3 | Role claim via Custom Access Token Hook with DB fallback (E3-3), only if PQ20 | ~−30 ms per hard load | Medium; every app's sign-in | Staging; every app signs in; claim present/absent tests |
| S5 | E3 | CI bundle budget `scripts/bundle-budget.mjs` with tripwires, 30 MiB handler warning (E3-13) | The weight stays off | ~1.5 min per portal PR | Fails on a reintroduced crypto re-export |
| S6 | E3 | Cold-start reduction from F12's `startup_time_ms` and a startup CPU profile (E3 §2b) | Fewer 1.6–3.7 s cold opens | Unknown | RUM TTFB p75 trend |
| S7 | E1 + E2 | Realtime only if PQ17 publishes: channel registry, apply-not-invalidate, echo drop (E1-7), then de-overlap (E2-11) | Live co-member changes | Echo doubling | Mocked channel: 2 acquirers → 1 subscribe; own echo dropped |
| S8 | E2 | Virtualization (E2-14) via `VirtualList`, only for lists O9 shows over ~150 rows p95 | 0 s today | Low | After the count |

## 4. Loading direction

**Recommendation: Q, "Quiet paper", with arrival option C (PQ2, PQ3).** Both directions share D1's spine: frame,
placeholders, indicator and words. Both meet B2 equally, because the mechanics are E2's mount points, not the
material. The choice is about voice. Q builds from materials the paper already uses: SectionLoadingLine's pearl,
the R15 breath, and the arrival's own 40% ink crawl. Under option C the arrival stops being a performance laid
over the load and becomes the way the paper is set, so its 2–4 s hold on the Document goes away (M14). X adds
three moving things in the first second (shimmer, a glowing bar and a card) and toasts, which pull the eye to the
corner. The studio promise points at Q.

**The strongest argument against Q.** Kody asked for "a loading indicator or skeletons", and a 1 px rule at 40%
ink, starting at 300 ms, may not register as an indicator at all. Branaghan and Sanchez (2009) found people prefer
*more* feedback, even when it makes a wait seem less reasonable (`r-patterns.md` §2). No first-party source shows
calm tools deliberately omitting progress chrome (R-5 in `pairings.md`), so Q's quietness is a taste call, not
evidence. If the studio walk shows the rule goes unnoticed, the fallback inside Q is a 2 px rule at 60%. That is
still not X's bar and toasts.

## 5. Action feedback

**5.1 The grammar (D2 §2, quiet treatment).** Within 100 ms, exactly one thing answers the click.

| Stage | When | Optimistic classes | Pending-only classes |
|---|---|---|---|
| S0 press | 0 ms | `.da-act:active` press; the row warms | Same |
| S1 answer | ≤100 ms | The value changes (✓ in sage; a faint ghost row for creates) | The verb changes ("Completing…", "Sending"), held, `aria-busy`, guarded |
| S2 pending | only after 400 ms; held ≥500 ms | `saving…` in the row's meta column | Already showing; "Still working." at 8 s |
| S3 settled | on the write's own response (M1b) | Meta returns to server truth; nothing celebrates | A receipt in plain words |
| S4 failure | on error | Restore truth; one `role="alert"` line; 44 px Try again; keep her typed words | The word returns; say what is true *now* ("Nothing was sent.") |
| S5 Undo | only where a restore path exists | The in-flow Undo row takes focus | Never |

Reduced motion keeps the words and colours and drops every transition. Never, in either direction: confetti,
checkmark bursts, counters that animate up, streaks, "nice work", or sound.

**5.2 Never optimistic** (E1 §2.2 deny list, D2 §3, contract honesty rule):

1. External sends: outbound drafts (P9), invoice send, plan issue and transmittals, trade texts.
2. Money: record payment, invoice lines and commercials, PO release, timer stop (billable minutes).
3. Deletes without Undo: discard a draft, remove an exclusion or a gate, swatch delete and folio image remove
   until N15.
4. Server-decided outcomes: phase advance, placing a piece (it may be held for duplicate review), promote to the
   studio library, install-window holds, schedule milestones, archive.
5. Words that claim an outside fact before receipt: "sent", "paid", "removed" (without Undo), "approved by
   client". A resolved coordination item may read "answered", never "sent to GC".

## 6. Founder questions

| Id | Question | Canon or ruling touched | Recommendation |
|---|---|---|---|
| PQ1 | Ratify B1–B4. Split B3 into **B3a** (SPA navigation usable ≤1.5 s p75) and **B3b** (hard load usable ≤3.5 s p75 in the lab, and in RUM). Read B2 on a hard load as "at first paint". Add a watch on cold Worker TTFB p75 through RUM | Contract budgets | Yes. §2 shows B3 at 1.5 s cannot hold on a cold hard load under the lab's network on any track |
| PQ2 | Loading direction: Q, X, or a hybrid | Paper canon, ink-word state | Q (§4) |
| PQ3 | Arrival: A keep, B shorten, C the skeleton becomes the arrival, D retire | V12 (arrival v3, patch 1 hold caps) | C. A keeps a 2–4 s hidden paper on the Document; B rarely plays; D loses US-14 for nothing C does not give |
| PQ4 | A navigation indicator exists, as Q's ink rule at the top of the paper | "Nothing on the Desk ever moves" (`globals.css:305-306`) | Yes, at 300 ms |
| PQ5 | Placeholders breathe on R15, beyond the spine marker | R15 | Yes; a still bar on a 4 s wait reads as frozen. Reduced motion stills it |
| PQ6 | StrataSweep is demoted to unknown-shape work only | R35 | Yes |
| PQ7 | The ~20 prose loading lines are retired; words appear only for slow, stall and error | House loading voice | Yes |
| PQ8 | Thresholds: placeholders 150 ms, rule 300 ms, pending word 400 ms (held ≥500 ms), slow 4 s, still-working 8 s for writes, stall 10 s | — | As listed; each is design practice, not research (`r-patterns.md` §2) |
| PQ9 | Optimistic ink for internal toggles, edits, creates and reorder, with the §5.2 list never optimistic | Ink shows intent before the server confirms | Yes |
| PQ10 | Flag strategy | — | Fix now ships unflagged. Two PostHog flags: `optimistic-ink` (N3–N5, N15) and `loading-register` (N10, N11). Each is verified before enabling, rolled to Leah's studio by user id first, then 100% after a week with no rise in failed writes or in `arrival_ended` declines. Never target by email |
| PQ11 | Retire the red global "Error" toast for `(document)` mutations; every act gets an R83 inline line | Extends R83 | Yes |
| PQ12 | One band-level `saving…`, quiet (it disappears), not "Saved · 10:42" | New chrome | Quiet |
| PQ13 | The expressive extras: shimmer, glow, toasts, hairline, settle wash, a fixed Undo row with a shadow | D4 no shadows; R15; ink-word state | No, unless PQ2 picks X |
| PQ14 | Undo for folio image remove and swatch delete (instead of `window.confirm`) | New Undo surfaces | Yes |
| PQ15 | Offline: ticks and edits wait and save on reconnect; sends and money refuse with "You're offline. Nothing was sent." | New band copy | Yes, after O3 |
| PQ16 | The 8 s send line: "Still sending." always; "Nothing is sent twice." only if O4 proves idempotency | New copy | Yes, conditional |
| PQ17 | Publish the coordination tables to `supabase_realtime` | Product behaviour; WAL and RLS cost per subscriber | Not now. The 30 s polls are honest. Revisit after O1 and only with S7's registry |
| PQ18 | The Document reads a scoped "this job's needs" instead of the whole Desk | The letterhead's source | Yes (N7) |
| PQ19 | Authorise three read-only prod checks: the publication list (O1), one token header and `jwt_expiry` (O2), and p95 list sizes (O9) | Prod access is read-only and walk-only today | Yes, read-only SQL with no client data |
| PQ20 | A Custom Access Token Hook carrying the designer role, which runs on every app's sign-in | Auth blast radius | Defer. After N13 the role query costs about 30 ms; revisit only if RUM shows middleware matters |

Not a PQ: 44 px task rows (D2-PQ7). The 44 px rule is not waivable, so F16 ships it. The only effect is denser
work blocks growing taller.

## 7. Rejected ideas and why

| Id | Idea | Why it is rejected |
|---|---|---|
| RJ1 | Rebuild the design system with tsup splitting | The portal compiles it from source (`tsconfig.json:25`); the leak is the client boundary (F9, F10) (E3 §4b) |
| RJ2 | Exclude `public/three`, `public/vendor` from the matcher | Static assets never reach the Worker in prod; `public/vendor` does not exist (E3 §1e) |
| RJ3 | Smart Placement or a region hint now | One studio's traffic never engages it; after N13 pinning only adds a hop. Revisit with S3 (E3 §2a) |
| RJ4 | A keep-warm cron | Crons do not warm the user's colo; an external ping hides cold starts from RUM (E3 §2b) |
| RJ5 | Fix realtime echo and double subscription now | Neither exists: tables unpublished, CoordinationBand unmounted (E1 §0.3-4). Latent, so S7 |
| RJ6 | Slow polls while `SUBSCRIBED` (E2-11 as written) | A subscribed channel can receive nothing; data gets staler (M8) |
| RJ7 | React 19 `useOptimistic` | A second optimistic system beside nine TanStack `onMutate` sites (R §3) |
| RJ8 | Cache Components, PPR, Partial Prefetching | Partial Prefetching is 16.3+, 16.2.10 installed; OpenNext #1369, #1223 open (R §0, §5) |
| RJ9 | An R2 or KV incremental cache | Shells change only at deploy; R2 is single-region, KV eventually consistent (E3 §3b) |
| RJ10 | `next/image` on Workers by default | Needs a Cloudflare Images loader and cost; N14 fixes the real problems (E2 §7) |
| RJ11 | Virtualization now | Seeded lists are 4–41 items; waits on O9 (S8) |
| RJ12 | Hyperdrive | The portal talks PostgREST over HTTP (R §5) |
| RJ13 | `getClaims` in browser hooks | Hooks need only the id; the session-user store is cheaper (M10) |
| RJ14 | Rename `middleware.ts` to `proxy.ts` now | Experimental on OpenNext, reported bundle bloat (R §5) |
| RJ15 | `sideEffects: false` on `@patina/utils` | Bundler-dependent; deleting the re-export is exact (E3 §4a) |
| RJ16 | `useLinkStatus` as the navigation signal | It skips prefetched links (M5) |
| RJ17 | Optimistic phase advance, sends, payments, deletes without Undo | Honesty; the server decides (§5.2) |
| RJ18 | Success toasts, "Saved!" badges, checkmark bursts | The studio promise: a settle is a return to truth, never a reward (D2 §2.2) |
