# E2 Page architecture (US-33, seat 3, SQ-954)

Seat: frontend architect. This is a read-only review. No product code changed and nothing was installed. It is
written against main `0c474d53b`. Every number cites a file under `baseline/` or a `file:line` in this worktree.
Paths are relative to `apps/designer-portal/` unless they start with `packages/`, `supabase/` or `baseline/`.
Every saving below is an **estimate**, labelled as one, and is measured against the local throttled lab
(4× CPU, Fast 4G) unless it says prod.

Anchor drift: `doc/[id]/page.tsx` is now **4,112 lines**, not 4,019 (`baseline/bundle.md:40` agrees). The
ticket's line anchors are approximate. The lines cited below were re-read today.

---

## 0. Where the ~7 s goes

The ranking only makes sense against the timeline. I re-read the two request waterfalls in
`baseline/traces/` with a scratch script (kept outside the repo).

**Desk hard load** (`baseline/traces/local-desk-waterfall.json`, usable 6,926 ms):

| Phase | When | Owner |
|---|---|---|
| HTML, CSS, fonts, JS; the last script ends | 0 → 3,016 ms (`desk/page-*.js` ends at 3,016) | E3 (bundle) |
| `auth/v1/user` × 16, **strictly back to back**, about 172 ms each | 3,258 → 6,485 ms | E1 (hook-level `getUser`) |
| The first data read starts | 5,951 ms, after 15 of the 16 `getUser` calls | — |
| Desk read: 24 parallel reads; content shows | 5,951 → 6,926 ms | **E2 (this seat)** |
| A second copy of the same reads, plus studio need facts and comms; settles | → 8,372 ms (last API end), settled 18.9 s | **E2** |

**Document hard load** (`baseline/traces/local-doc-waterfall.json`, usable 6,721 ms, no-busy 9,328 ms):

| Phase | When | Owner |
|---|---|---|
| The doc page chunk ends | 3,302 ms | E3 |
| `auth/v1/user` × 15, back to back | 3,588 → 6,269 ms | E1 |
| Level 1: `document_state`, **plus about 25 Desk-shaped tables** (`purchase_orders`, `invoices`, `procurement_*`, `item_feedback` …) | starts at 6,275 ms | **E2** (§3, the CommandBar) |
| Five more serial `getUser` calls | 6,296 → 7,863 ms | E1 |
| Level 2: 33 project reads start in one burst | 7,893 ms | **E2** (§4) |
| Level 3: plans, profiles, `resolve_studio_identity`; then FF&E readiness, `can_see_studio_margin` | 8,267 / 8,831 / 10,032 ms | **E2** (§4) |

So **about 2.7 s of each hard load is the serialized `getUser` queue** (E1's item, which E1 owns). About 3.0–3.3 s is
JS (E3). This seat's items act on what is left: about 1 s to "usable" on the Desk, and about 2.6 s from usable to
no-busy on the Document. Every E2 estimate below assumes E1's `getUser` fix has landed. Without it, the queue
hides most of what E2 saves.

One caveat inflates the local lab against prod. Local Supabase is plain `http://127.0.0.1:54321`, so Chrome uses
HTTP/1.1 with six connections per host. That is why the "parallel" 24-read burst stretches across about 2 s.
Prod goes through `api.patina.cloud` on Cloudflare, where HTTP/2 multiplexes, so request *count* costs less there
and dependency *depth* costs relatively more. Prod API p50 is 243 ms and p90 is 803 ms (`baseline/BASELINE.md`,
"Request durations").

---

## 1. Route-level `loading.tsx`, `error.tsx`, `not-found.tsx`

### 1.1 What paints before hydration today

The route files contain no `loading.tsx` at all. A `find` over `src/app` returns 51 route files and none of
them is a loading file. There is one `error.tsx` (`app/(document)/board/[boardId]/error.tsx`). What a
**hard load** paints before hydration is whatever the client page renders on the server with no data:

| Segment | Today's server render (pre-hydration) | Evidence |
|---|---|---|
| `/desk` | The roster skeleton and greeting (hydration-gated) | `desk/page.tsx:134`, `:238`; P1hard placeholder 687 ms (`baseline/BASELINE.md`) |
| `/doc/[id]` | "Picking up…" on paper (`!hydrated` gate) | `doc/[id]/page.tsx:3013-3020`; P2hard placeholder 721 ms (`traces/local-doc-waterfall.json` summary) |
| `/doc/[id]/pieces` | **Nothing.** `Suspense fallback={null}` around a `useSearchParams` reader, then `<main aria-busy/>` until the row arrives | `doc/[id]/pieces/page.tsx:46`, `:54`, `:109`; P3hard "placeholder: none" |
| `/doc/[id]/plans`, `/spec-book`, `/boards` | Client page under a pass-through layout | `plans/layout.tsx`, `spec-book/layout.tsx`, `boards/layout.tsx` (7 lines each) |
| `/people` | **Nothing.** `Suspense fallback={null}` | `people/page.tsx`; `people-room.tsx:79` (`useSearchParams`); P4 placeholder none |
| `/library` | The shelf shell (no Suspense) | `library/page.tsx`; P5 placeholder 647 ms |
| `/rooms` | StrataSweep "Loading measured rooms" | `rooms-index.tsx:69` |
| `/room/[id]` | `RoomShell` titled "A room", with `isLoading` passed to `RoomView` | `room/[id]/page.tsx:191-209` (the plan's "return null" is a memo at `:127`, not the page) |
| `/boards` | **Nothing.** `Suspense fallback={null}` | `boards/page.tsx` |
| `/board/[boardId]` | A bare route (no Desk chrome) with its own `isPending` branch | `board/[boardId]/page.tsx:70`; `document-route-boundary.tsx:10-12` |
| `/drafting/[proposalId]` | "Opening the draft…" gate message | `drafting-room.tsx:191-192` |
| `/ceremony/[leadId]` | An `aria-busy` paper div | `ceremony-surface.tsx:305` |

On an **SPA navigation** nothing paints until the next route's page mounts. That is the 215–251 ms "first
change" in the local lab and 248–608 ms in prod (`baseline/BASELINE.md`, "No navigation progress indicator").

### 1.2 Why `loading.tsx` matters more for navigation than for hard loads

Per Next's docs (cited in `review/r-patterns.md` §3), `loading.js` wraps the segment's page in a Suspense
boundary, and its fallback is prefetched. A **dynamic** route is prefetched "No, unless `loading.js`". Every
`[id]` segment here is dynamic (no `generateStaticParams`), so today a Desk card's `<Link href="/doc/…">`
(`desk-job-card.tsx:72-73`) prefetches nothing for the document. The click waits for a Worker round trip
before anything changes. That fits the prod split: desk→doc first change 608 ms against doc→desk 248 ms
(`baseline/data/prod-walk.json` → `spa`). That prod tab was hidden, so treat the figures as indicative.
With a `doc/[id]/loading.tsx`, the fallback is in hand before the click and paints on the next frame, even
when the Worker is cold (1.6–3.7 s cold on 4 of 16 navigations, `baseline/BASELINE.md`).

On a hard load the pages never suspend on the server, so `loading.tsx` is mostly *not* what paints.
What paints is the page's own pre-data render, or the inner `Suspense fallback={null}`. **One skeleton
component per room, used at three mount points**, is therefore the rule:

1. `loading.tsx`, which paints on SPA navigation from the prefetch;
2. the page's inner `<Suspense fallback>`, in place of today's `null`, which paints in the server HTML on a
   hard load;
3. the page's own "no data yet" branch after hydration (for example `pieces/page.tsx:109`,
   `doc/[id]/page.tsx:3013`).

The three must render the same geometry so that nothing jumps between them. D1 owns the drawing; E2 owns the
mount points.

### 1.3 The map

| File to add | Fallback shape (D1 draws it) | Notes |
|---|---|---|
| `app/(document)/loading.tsx` | A generic paper sheet | The catch-all for `compose`, `library/judgments`, `room/[id]/file`, `library/[id]` until they get their own |
| `desk/loading.tsx` | The Desk roster skeleton (reuse the existing one) | The skeleton already exists. Lift it so `loading.tsx` and the page share it |
| `doc/[id]/loading.tsx` | Letterhead, band, spine and paper column | Also wraps the sub-routes, so each sub-route below needs its own |
| `doc/[id]/pieces/loading.tsx` | Room rail and line table | Fixes P3hard's blank screen together with the Suspense-fallback swap |
| `doc/[id]/plans/loading.tsx`, `spec-book/loading.tsx`, `boards/loading.tsx` | Light table, book, board grid | Spec book: the fallback paints only. It must never call `ensure_project_spec_book` |
| `people/loading.tsx` | The People index list | Swap `people/page.tsx`'s `fallback={null}` too, so loading no longer reads as an empty roster |
| `library/loading.tsx`, `library/[id]/loading.tsx` | Shelf grid; piece folio | |
| `rooms/loading.tsx`, `room/[id]/loading.tsx` | Room index; `RoomShell` with a canvas box | |
| `boards/loading.tsx` | Board grid | Swap `fallback={null}` |
| `board/[boardId]/loading.tsx` | A **chrome-less** board | The bare route renders no Desk chrome (`document-route-boundary.tsx:22`) |
| `drafting/[proposalId]/loading.tsx`, `ceremony/[leadId]/loading.tsx` | Drafting paper; ceremony paper | Today both have gate copy in the page |

All of these are server components with no data and no `'use client'`. They cost nothing on the Worker beyond
the RSC bytes.

**Interaction with the US-14 arrival hold.** `arr-pre` is added in `ArrivalRun`'s effect after hydration
(`arrival-run.tsx:401`). It hides only `[data-arrival]`, the route root, "never body or chrome"
(`arrival.css:3`, `:8`, `:16`). A `loading.tsx` fallback carries no `data-arrival`, so the hold never hides it.
The seam comes after it. On the Document the sequence today is:
- the fallback;
- "Picking up…" (`page.tsx:3013`);
- the held paper, hidden for up to 8.5 s (`arrival.css:23-24`), with only the `h-0` "Picking up…" line at
  `page.tsx:3346-3351` visible;
- the arrival card.

That is three different "waiting" faces. The Desk already avoids this: its held root stays a visible skeleton
(`arrival.css:18`, `desk/page.tsx:799`). For continuity, the Document's held state should render the same
skeleton in place of the "Picking up…" line, and the skeleton should hand straight to the arrival.
Keeping the hold, shortening it, letting the skeleton *be* the arrival, or retiring it are all D1 options and
each one is a PQ ruling. Whichever D1 picks, the mount points above are the same.

**Side effect to price in.** Adding `doc/[id]/loading.tsx` switches on viewport prefetch for every visible
Desk card. Each prefetch is a Worker request through `middleware.ts:40` (`getUser`, then the `user_roles`
read), which costs about 60 ms warm per request in prod (`baseline/data/prod-server-probes.csv`) and two
Strata calls each. Until E3's `getClaims` change makes the middleware network-free, use `prefetch={false}` on
Desk cards and prefetch on **intent** (pointerenter / focus, see §2). Turn viewport prefetch back on after E3
lands.

### 1.4 Error and not-found

- `app/error.tsx` (client): a plain paper sheet with "Try again" (`reset()`) and a link to the Desk. It catches
  render throws in any segment that has no closer boundary.
- `app/(document)/error.tsx`: catches a page throw *inside* the Document chrome. Its parent layout
  (`(document)/layout.tsx`) keeps rendering, so the drawer, ⌘K and the log strip survive a broken page.
  `board/[boardId]/error.tsx` already shows the pattern.
- `app/global-error.tsx`: the only boundary that catches a throw in the root `layout.tsx` or `Providers`.
- `app/not-found.tsx`: the paper "No document answers to this name" register already used at
  `page.tsx:3045-3058`, served for unknown URLs instead of Next's default.

Each is S effort, carries no data and needs no ruling. The copy passes `patina-brand-voice`.

---

## 2. First query for the Desk and the Document: server hydration or client intent?

### Option A: server `prefetchQuery` + `HydrationBoundary`

`page.tsx` becomes a server component. It builds a per-request `QueryClient`, creates a server Supabase client
from the user's cookies (`packages/supabase/src/server.ts:73` `createServerClient()` already exists), awaits
the first query, and wraps the client page in `<HydrationBoundary state={dehydrate(qc)}>`. TanStack's guide is
summarised in `review/r-patterns.md` §3. It flags that the current docs use `queryClient.query(...)` and not
`prefetchQuery`, so check that against the installed 5.90.21.

**What it buys.** On a hard load the data is in the client cache at hydration, so the first query no longer
waits for "JS done → `getUser` → read". Prod shows the first API request starting only after window load, at
1.4–5 s (`baseline/BASELINE.md`). Locally, the Desk content would land at about hydration (~3.0 s) instead of
6.9 s.

**What it costs, and what stands in the way:**
1. **It is a no-op while the hydration gates stand.** Both pages show a placeholder whenever `!hydrated`
   (`doc/[id]/page.tsx:3013`; `desk/page.tsx:404`). Server data would still show only at hydration, which is
   where Option B gets to once E1 lands.
2. **Arrival flash.** If the gates are removed, server-rendered content shows and then hides when `arr-pre`
   arrives (`arrival-run.tsx:401`, `arrival.css:8`). This needs a PQ ruling.
3. **Isomorphic query functions.** Every `queryFn` builds a browser client inside the hook
   (`use-desk-engagements.ts:698`, `use-document-state.ts:47`). That is tractable for one RPC (§3), but not
   for the Document's ~45 hooks.
4. **Worker limits and CPU.** Firing 24 parallel reads from one invocation hits the Workers cap on simultaneous
   connections. I recall the cap as 6, but I have **not verified that here; check Cloudflare's limits page**.
   So this needs the Desk RPC first. Each request also pays for an RSC render, a dehydrate and an SSR of a
   tree full of data.
5. **Cold Worker.** 4 of 16 prod hard navigations spent 1.6–3.7 s in the Worker (`baseline/BASELINE.md`), and
   the read would queue behind that. Await the prefetch *inside* the Suspense boundary so that the
   `loading.tsx` fallback still streams first.
6. **SPA navigation gets worse.** Each navigation pays an RSC round trip that runs a server query, even when the
   client cache is warm.
7. **OpenNext 1.20.1** has open stream-corruption reports under Cache Components (`review/r-patterns.md` §5,
   #1369). Plain dynamic SSR avoids those, but the payload enlarges the flight stream.

### Option B: client-only, with intent prefetch and cache seeding

- Keep the pages client components.
- On **pointerenter / focus** of a Desk card or ⌘K row, call `router.prefetch('/doc/' + id)` (it fetches the
  `loading.tsx` shell) and `queryClient.prefetchQuery(['document-state','engagement',id])`.
- **Seed** the engagement row from the Desk cache. The Desk read already holds every `document_state` row
  (`use-desk-engagements.ts:740`, `select('*')`). `useDocumentEngagement` can take
  `initialData`/`placeholderData` from `['document-state','desk']` → `live[]` and refetch in the background.
  P2's level 1 then costs zero.
- Hover-to-click is typically 100–300 ms. That is an assumption, not measured here; the R seat cites Turbo's
  hover-prefetch default (`review/r-patterns.md` §1).

**Cost.** About one request per hovered card, deduplicated by the 5-minute `staleTime`
(`lib/react-query.ts:222`). No Worker CPU. No arrival ruling.

**Risk.** Low. Seeded data is the same row the Desk just showed. `keepPreviousData`-style refresh semantics
already exist (`use-desk-engagements.ts:696`).

### Recommendation

**Option B now, Option A only for the Desk and only as a Structural experiment.** Option A's hard-load gain
over "E1 `getUser` fix + Desk RPC + Option B" is about one round trip after hydration. That is an **estimate of
0.2–0.5 s** on a hard load, and roughly 0 or negative on SPA navigation. It is paid for with an arrival ruling,
removing the hydration gates, an isomorphic query layer, more Worker CPU and cold-start exposure. Run the
experiment for the Desk only after three things land: E1, the Desk RPC (§3) and E3's network-free middleware.
Keep it only if prod RUM (E3's `useReportWebVitals`) shows at least 500 ms p75 off hard-load LCP. Do not do it
for the Document. Its first screen needs about 45 reads, and server-fetching only the resolution row saves one
round trip.

**Estimated effect of Option B.** P2 (Desk → Document SPA) usable is 1,464 ms today (`baseline/BASELINE.md`).
The level-1 engagement read and its `getUser` calls disappear, which is an **estimated −0.3 to −0.6 s**. P2's
5 `getUser` calls (`baseline/BASELINE.md`) are E1's.

---

## 3. The Desk

### 3.1 What the read actually is

`useDeskEngagements` (`hooks/use-desk-engagements.ts:681-1145`) makes, per run:
- **23 reads in one `Promise.all`** (`:716-958`; the destructured list runs from `:716` to `:739`) plus the
  `outbound_drafts` read (`:706-714`), so **24 PostgREST requests**;
- inside the held-PO read, **one `is_org_admin_or_owner` RPC per studio** (`packages/supabase/src/hooks/use-buying-phase2.ts:1941-1947`);
- after the batch, **one `procurement_claim_deadline` RPC per live PO** (`:486-494`): the N+1, run serially
  *after* the batch;
- on a zero-row read, an `auth.getSession()` (`:971`).

That is more than the plan's "18".

**It runs twice on `/desk`.** `desk/page.tsx:131` keys it `['document-state','desk', orgId]`. CommandBar
(`command-bar.tsx:404`), DeskWalkthrough (`desk-walkthrough.tsx:316`), the People directory
(`directory-view.tsx:396`) and the Document (`page.tsx:1103`) key it `['document-state','desk']`. Both
observers are mounted on `/desk`. The org id also arrives *after* `useOrganizations`
(`desk/page.tsx:127-129`), which changes the key a second time. The waterfall agrees: every Desk table
appears twice (`document_state` 2, `purchase_orders` 4, `invoices` 4, `item_feedback` 4;
`traces/local-desk-waterfall.json`). `organizationId` is used only to filter studio drafts
(`buildDeskStudioDrafts(outboundRows, organizationId)`, `:1071`). **Fix (S):** drop it from the key and apply it
in a `select`. **Estimate:** halves the Desk's 95 hard-load API requests by about 48 and frees the local
6-connection queue. That is −0.2 to −0.5 s to Desk usable locally, less in prod, and a large cut to the 18.9 s
settle.

### 3.2 Collapse into one RPC: yes, with two guards

```sql
-- SKETCH ONLY, not a migration. supabase/migrations/NNNNN_desk_read.sql
create or replace function public.desk_read(p_today date, p_horizon date)
returns jsonb
language plpgsql
stable
security invoker              -- every read below runs under the caller's RLS, exactly as PostgREST does today
set search_path = ''
as $$
declare
  out jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('session', false);          -- replaces the desk_session_degraded getSession probe
  end if;

  -- One block per feed, so a failing side feed degrades to null, never the whole Desk
  -- ("The Desk never dies on a side feed", use-desk-engagements.ts:1000).
  begin
    out := out || jsonb_build_object('engagements',
      coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at desc) from public.document_state d), '[]'));
  exception when others then out := out || '{"engagements":null}'; end;

  begin
    out := out || jsonb_build_object('receivables', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'project_id', i.project_id, 'status', i.status,
             'due_date', i.due_date, 'total_cents', i.total_cents, 'amount_paid_cents', i.amount_paid_cents,
             'invoice_number', i.invoice_number, 'ar_last_chased_at', i.ar_last_chased_at))
      from public.invoices i where i.status in ('sent','partially_paid')), '[]'));
  exception when others then out := out || '{"receivables":null}'; end;

  -- … one block for each of the other 21 reads, with the same columns, filters and LIMIT constants as today …

  begin  -- the N+1, as one set: the definer keeps its own purchase_orders_studio_read predicate (00700:511)
    out := out || jsonb_build_object('claim_deadlines', coalesce((
      select jsonb_object_agg(po_id, d.vendor_deadline)
      from unnest(public.desk_live_claim_po_ids()) as po_id     -- or: the same notice filter, inline
      cross join lateral public.procurement_claim_deadline(po_id) d), '{}'));
  exception when others then out := out || '{"claim_deadlines":null}'; end;

  begin  -- held POs plus the viewer's seat, one call instead of one per studio
    out := out || jsonb_build_object('held', coalesce((
      select jsonb_agg(jsonb_build_object('id', po.id, 'project_id', po.project_id, 'studio_id', p.studio_id,
             'viewer_can_release', public.is_org_admin_or_owner(p.studio_id)))
      from public.purchase_orders po join public.projects p on p.id = po.project_id
      where po.held_at is not null /* + today's filter */), '[]'));
  exception when others then out := out || '{"held":null}'; end;

  return out;
end $$;

revoke all on function public.desk_read(date, date) from public, anon;
grant execute on function public.desk_read(date, date) to authenticated;
```

**RLS.** SECURITY INVOKER means each inner select sees exactly the rows the same PostgREST read sees today.
`document_state` is itself `security_invoker = true` (`supabase/migrations/00590_engagement_subject.sql:57`).
The two definers it calls, `procurement_claim_deadline` (`00700:485-524`) and `is_org_admin_or_owner`, are the
functions the client already calls, with their own predicates. Nothing widens. A facts-only definer in the
00766 style (`00766_studio_need_states_select_studio.sql:35-56`) is **not** needed, because nothing here reads
a row the caller cannot already read. The migration still goes to `review-audit-frontier`, as every RLS-adjacent
change does.

**Guard 1: sequential execution.** PostgREST runs the 24 reads on parallel backends. One function runs them
one after another on one backend. If the sum of the statement times exceeds the slowest single statement plus
the saved round trips, the RPC is *slower*. `document_state` alone is a four-shape UNION
(`00590:55-460`). **Gate:** run `EXPLAIN (ANALYZE, BUFFERS)` per block on the local seed and a prod-shaped
volume. If the total exceeds about 150 ms, split by cost into two or three RPCs called in parallel, for example
"engagements" and "signals".

**Guard 2: exception blocks** open a subtransaction each, about 24 per call. That is cheap at Desk scale, but
measure it under the same gate.

**Estimate:** 24 + 1 + N requests become 1, and the dependent N+1 step disappears. Locally that is
**−0.3 to −0.6 s** to Desk usable (queueing plus one serial hop). In prod it is about one to two round trips,
**−0.2 to −0.5 s** at p50 243 ms, plus the cut in request count on every poll. The client side keeps every
`buildDesk*` function unchanged by mapping the JSON keys onto today's variables. That keeps the C-20 / C-32
behaviour tests meaningful. **Cheaper interim step (S):** ship only `procurement_claim_deadlines(p_po_ids uuid[])`
with the 00700 predicate. That removes the N+1 without the full RPC.

### 3.3 Is the 60 s poll still needed?

**Yes, but cheaper and narrower.** The Desk aggregates about 20 tables through a view. Supabase
`postgres_changes` subscribes to tables, not views, so realtime cannot replace it without about 20 channels.
Keep `refetchInterval: 60_000` (`use-desk-engagements.ts:692`) on the RPC: one request a minute instead of
about 26. TanStack already pauses intervals in background tabs by default. Add `refetchOnWindowFocus: true`
for this one query only (the global default is `false`, `lib/react-query.ts:239`), so a returning designer sees
fresh signals without waiting for the tick.

### 3.4 Should CommandBar keep the Desk alive on every doc?

**No.** `CommandBar` is mounted once in `(document)/layout.tsx:125` and calls `useDeskEngagements()`
unconditionally (`command-bar.tsx:404`). It uses only `live[]`, `folders` and `chips` to build document rows
(`:572-577`, `:587-591`). The page itself notes the cost (`page.tsx:1106-1110`, "the CommandBar … holds this
key hot on every document route"). Consequences:
- about 25 Desk reads on every Document hard load (§0);
- a 60 s re-run of the whole set while a document is open;
- every coordination realtime echo invalidates `['document-state']` whole (`use-coordination.ts:1613`), which
  re-runs it all.

**Change (S/M):**
- gate CommandBar's read with `enabled: open` (or on the first ⌘K keydown);
- serve the doc rows from a light `document_state` list (`engagement_id, title, active_section …`) when the
  Desk cache is cold.

The Document's own enrichment (`page.tsx:1103`) is the harder half. `paperSettled` includes
`deskEnrichmentSettled` (`page.tsx:2928-2943`), and `deskEnrichmentApplies` is true for nearly every live
document (`page.tsx:380-387`). **The whole Desk read is on the Document's arrival critical path.** Replace it
with `desk_read` scoped to one engagement (a `p_engagement_id` argument that filters each feed to that
project/proposal/lead), keyed `['document-state','need', engagementId]`. **Estimate:** −0.5 to −1.5 s off Document
no-busy (9,328 ms). The Desk-shaped tables on the doc trace end between 6.5 and 10.5 s and share the local
connection queue with the 33 level-2 reads.

---

## 4. Splitting `doc/[id]/page.tsx`

### 4.1 Why every settle repaints everything

`DocumentPageBody` (`page.tsx:986`) calls about 45 data hooks and about 90 hooks in all (`:989-3003`). It holds
8 `useState`s. The file has **zero** `memo(`, and no document component uses `React.memo`
(`grep` over `components/document`). There is no React Compiler in `next.config.js` or `package.json`. Any query
settling re-renders the 4,112-line body and every child it passes props to. Children also *report up* with
setter props:
- `onRows`, `onInput`, `onDamagedOn` (`:600-636`, `:673`);
- `onEyebrow` (`:3672`, `:3693`);
- `onHoverLine` (`:4045`).

Each report causes one more full-page render. The lab saw 130 DOM mutation batches and 1,001 ms of long tasks on
the Document hard load (`traces/local-doc-waterfall.json` summary). React Profiler commits were not collected
(`baseline/BASELINE.md`, "Not done").

### 4.2 The split

The rule: **a lens component owns its reads, and the page owns only the spine.**

| Layer | Owns (reads) | Gets from above |
|---|---|---|
| `DocumentPage` (spine) | `useDocumentEngagement` / `document_open` (§4.3), `useHydrated`, arrival state, lens/tier state | — |
| `Letterhead` (`DocLetterhead`, `FolioLetterhead`, `HouseholdChip`, `HandoffNote`) | `useProjectLead`, `useOrganizationMembers(studioId)`, the scoped need read (§3.4) | ids |
| `LensBand` + `SettledBar` | the band model, by moving the band derivation (`:2236-2900`) into a `useBandModel(ids)` hook | ids, phase |
| `TicketFacts` (`ProjectTicketFacts` `:585`, `ProjectlessTicketFacts` `:794`) | the FF&E (one key, §4.4), invoices, schedule | ids |
| `DiscoverySection` / `DiscoveryRecap` / `DiscoveryMargin` | `useDiscovery` (`:1087`, `:1093`) | `engagementId`, `designerClientId` |
| `BriefSection` / `BriefRecap` | lead reads | `leadId` |
| `FFESection` (×3 mounts) | already owns its reads | ids |
| `MoneyRegion` / `AccountBand` | `useMarginItems` (`:1076`), approvals (`:1065`) | ids |
| `ScheduleSpine` / `ScheduleRuleRegion` | `useResolvedSchedule` (`:1068`), coordination | ids |
| `MarginRail` / `ResponsiveMarginRail` | margin sheet | ids |
| Overlays (`RecordAChangeSheet`, `HouseholdSheet`, `CallSheetMount`) | mount on open, not on page load | ids |

Cross-lens facts that the guide and band need today through `onRows`/`onInput` become **shared hooks** that
both the producer and the consumer call. React Query deduplicates by key, so this costs no second fetch and
needs no setter. The readiness signal for the arrival (`ticketRowsSettled`, `guideInputsInFlight`,
`:2934-2943`) becomes a small context in which each lens registers "settled". Only the spine re-renders when
the last lens settles.

**Order of work (M, in about 4 slices):**
1. extract the band model hook;
2. move TicketFacts' reports onto shared hooks;
3. move the Discovery and Brief reads into their sections;
4. mount the overlays lazily.

Wrap each extracted lens in `memo`. The props are ids and primitives, so equality is cheap.

**Estimate:** −0.2 to −0.5 s of the 1.0 s long-task total on a Document hard load. This is **unmeasured**:
it needs Profiler commit counts before and after. P6/P7 interaction latency should improve most, because each
settle after a tick repaints one lens instead of the page. P6/P7 were not measured either
(`baseline/BASELINE.md`).

### 4.3 Breaking the engagement → dependents → discovery waterfall

**Level 1 → 2.** Every project hook waits for `row` (`page.tsx:1032-1076`). That wait is inherent, but it can
cost zero on P2 through the Desk-cache seed (§2, Option B).

**Level 2 → 3** has two avoidable chains:
- `useProposal(proposalId)` → `liveProposal.designer_client_id` → `useDiscovery` (`:1069`, `:1093-1097`);
- `useProjectLead(projectId)` → `handoffTarget.studioId` → `useOrganizationMembers` (`:1036-1038`).

`DocumentStateRow` carries `project_id`, `proposal_id`, `lead_id`, `designer_id` and `client_profile_id`, but
not `designer_client_id` or `studio_id` (`lib/document/desk-derivation.ts:56-61`).

**Proposal:** `document_open(p_id uuid) returns jsonb`, SECURITY INVOKER, returning:
- `{kind, row, ids: {project_id, proposal_id, designer_client_id, lead_id, studio_id, lead_user_id}}`;
- the redirect resolution that `useDocumentEngagement` today walks in **up to six sequential reads**
  (`use-document-state.ts:47-150`: `document_state`, then `proposals`, `leads`, `designer_clients`, the
  proposal chain and `client_decisions`).

Every level-3 hook then enables at level 2. **Estimate:** one level and one serial `getUser` fewer, which is
**−0.2 to −0.5 s** off Document no-busy, and up to five round trips fewer on a redirecting id.
Parallelising without the RPC is not possible, because the ids really do come from the earlier reads.

### 4.4 `useProjectFFEItems`: three call sites, two keys

The key is `['project-ffe-items', projectId, filters, {withLifecycle}]`
(`packages/supabase/src/hooks/use-project-v2.ts:185`):
- `{withLifecycle:false}`: `page.tsx:640` (ProjectTicketFacts), `pieces/page.tsx:63`, `care-band.tsx:136`;
- `{withLifecycle:true}`: `page.tsx:1934` (silence lines), `page.tsx:2601` (own act), and
  `command-bar.tsx:249` (`PaperLinesSource`, mounted for the in-hand doc at `:1790`).

The doc trace shows 3 `project_ffe_items` requests (`traces/local-doc-waterfall.json`). **Fix (S):** fetch with
lifecycle everywhere on the Document and Pieces. The lifecycle row is a superset (`use-project-v2.ts:170-173`),
so drop the variant from the key, and let lighter callers ignore the embedded PO payments. The cost is a
slightly wider embed (PO lifecycle and payments) for callers that did not need it. That is acceptable at
per-project FF&E sizes. Re-check if prod shows over 200 lines. **Estimate:** one request and about one render
pass fewer per Document load, worth less than 0.1 s. Its value is that the Pieces build room and the Document
then share one warm entry, so P3 opens with its lines already in cache.

---

## 5. Virtualization

`@tanstack/react-virtual` is a portal dependency (`package.json:57`) that the portal never imports. The design
system already wraps it: `packages/patina-design-system/src/components/VirtualList/VirtualList.tsx` and
`Media/media-gallery.tsx`. Reuse those; do not write a new wrapper.

List sizes from the committed seeds (a scratch tuple count over `supabase/seed/**/*.sql`) are small:

| Target | Render site | Seeded size | Verdict |
|---|---|---|---|
| FF&E lines | `ffe-section.tsx:2584-2652` (grouped by room; plus "throughout" and unassigned) | ≤ 8 per job (`running_a_job_walk_dev.sql` 8, `the-client-page.sql` 6, `procurement_workspace_dev.sql` 2); Cedar Lane 4 (`baseline/BASELINE.md`) | **Not at seed size.** Grouped rows make a virtualizer awkward. Try CSS `content-visibility: auto` + `contain-intrinsic-size` per room group first: no JS, and find-in-page and screen readers keep working |
| Hours entries | `hours-ledger.tsx:1309-1351` (day groups) | 0 `project_time_entries` rows seeded; the views are week-bounded (`:555`) | Not a target |
| Library shelf | `rooms/library/library-shelf.tsx:155` | 41 products seeded (`products.sql` 13, `first-flight-catalog.sql` 18, `cloudflare-phase1-staging.sql` 7, `fulfillment-catalog-dev.sql` 3) | A grid. Virtualize only if prod shelves exceed about 200 |
| People directory | `people/views/directory-view.tsx` | 27 `studio_contacts` (`people_crm_dev.sql`) | Not a target |
| Desk ledger | `desk/page.tsx` ledger | 16 projects locally (`baseline/BASELINE.md`) | Not a target |
| Board items / deck import ledger | `mood-board/board-deck-import-ledger.tsx` | not seeded | Unknown |

**Recommendation:** no virtualization in "Fix now" or "Next". Ask Kody for one read-only prod count first: the
p95 FF&E lines per project, Library shelf size and board items. Virtualize only a list that exceeds about 150
rendered rows at p95. **Estimate: 0 s of the 7 s at the sizes measured.**

---

## 6. Polling and realtime

**Both run** in these places:

| Data | Poll | Realtime | What can stop |
|---|---|---|---|
| Coordination items | 30 s (`use-coordination.ts:312`, `:358`) | `coordination:${projectId}` on `client_decisions`, `project_tasks`, `project_ffe_items` (`:1618-1648`); mounted **twice**, `schedule-spine.tsx:202` + `coordination-band.tsx:80` | While the channel is `SUBSCRIBED`, slow the poll to a 120 s fallback (thread-post previews are not covered by the channel). E1 owns the second subscription |
| Unread inbox count | 30 s (`packages/supabase/src/hooks/use-inbox.ts:279`) | `notification_log:${userId}` (`:226`); mounted twice, `studio-drawer.tsx:168` + `mobile-bar.tsx:120` | Poll → 5 min fallback while subscribed. Mount the channel once in the layout, not per consumer |
| Comms thread | 60 s "fallback" (`hooks/use-comms.ts:51`) | `thread:${threadId}` (`packages/supabase/src/hooks/use-comms.ts:539`) | Poll → off while subscribed |
| Margin items | 30 s (`hooks/use-margin-items.ts:20`) | Partly: the coordination echo invalidates `['margin-items']` (`use-coordination.ts:1612`) | Keep; it is partial cover only |

**Poll only** (keep, but see the notes):
- the Desk, 60 s (§3.3; the RPC makes it 1 request);
- `document-time-today`, 60 s (`document-time-provider.tsx:714`); a candidate to fold into the time provider's
  own write path;
- answered notes, 60 s (`use-answered-notes.ts:38`); a candidate to fold into `desk_read`;
- approvals, 30 s foreground (`use-project-approvals.ts:171-179`);
- handoffs, 30 s foreground (`use-project-contextual-handoffs.ts:127-131`);
- discovery margin, 30 s (`use-discovery-margin.ts:43`).

**Steady-state load of one open Document tab**, from the intervals in code (an estimate, not a trace):
- Desk ≈ 26 requests a minute (24 reads + seat + N+1);
- margin 2/min, coordination 2/min, approvals 2/min, handoffs 2/min, inbox 2/min, time 1/min.

That is **about 37 requests a minute, about 70% of them the Desk**. With the CommandBar gated (§3.4), the
Desk's share on a Document goes to 0. With the RPC, it is 1 a minute on the Desk itself. None of this
changes first-load time. It changes how often the page re-renders while a designer is reading, which §4
makes cheaper again.

---

## 7. Images

The plan's "22 raw `<img>`" undercounts. A scratch scan of non-test `.tsx` under `src/` (a heuristic tag parse)
finds **91 raw `<img>`**:
- **18** set `loading=`;
- **0** set both `width` and `height` attributes;
- **84** sit in a Tailwind size or aspect class (that can still be width-only, which leaves layout shift);
- **6** have neither lazy loading nor a box: `judgment-card.tsx:29`, `spec-book-workspace.tsx:307`, `:969`,
  `:1605`, `board-deck-import-sheet.tsx:47`, and the shared `media/image-with-fallback.tsx:167`, whose
  callers set the box.

There are 6 `next/image` uses in all.

**What the fix buys.**
- `width`/`height` (or `aspect-ratio`) on every thumbnail removes layout shift as images land. The lens
  re-flows that §4 is trying to avoid are partly image-driven.
- `loading="lazy"` + `decoding="async"` on everything below the fold stops off-screen requests competing with
  the data reads. On HTTP/1.1 locally they share the six-connection queue.
- Never lazy-load the above-the-fold hero (piece folio, `piece-folio.tsx:60`). Give it `fetchpriority="high"`.

**Sizing at the source.** The doc trace pulls full-size originals from
`storage/v1/object/public/product-images/…` (`traces/local-doc-waterfall.json`). Thumbnails should request a
transformed size, through Supabase's `render/image` endpoint (whether that is available depends on the Strata
plan; verify it) or through a pre-sized derivative from the media service on R2. Do **not** move to `next/image`
on Workers by default. Its optimizer needs a Cloudflare Images loader and cost, which is E3's call.

**Estimate:** about 0 s of the Desk/Document 7 s; the doc load fetched 2 product images. The gain is on the
Library, boards, Pieces and Room views. Its gates are CLS and bytes, not usable time.

---

## 8. Effort, risk and gates

The "removes" column holds **estimates against the local hard-load timelines in §0**, assuming E1's `getUser`
fix. Gates rerun `baseline/harness/lab.mjs` with the same throttling unless stated.

| # | Item | Effort | Removes (estimate) | Risk | Gate that proves it |
|---|---|---|---|---|---|
| E2-1 | `loading.tsx` per segment + shared skeleton at three mount points + Suspense `fallback={null}` swaps (§1) | S per route, M in all | 0 s of usable. Placeholder: P3hard and P4 from none to ≤ FCP (~0.7 s); SPA first change ≤ 50 ms when prefetched | Low; continuity with the arrival hold (PQ) | B2: placeholder ≤ 200 ms on P2/P3/P4/P5/P10 and on P3hard; `aria-busy` on each fallback; no blank frame in `screens/*-200ms` |
| E2-2 | Root `error.tsx`, `(document)/error.tsx`, `global-error.tsx`, `not-found.tsx` | S | — | Low | Jest: throw in a page → boundary renders, chrome survives; unknown URL → paper not-found |
| E2-3 | Desk key unification: drop `orgId` from the key, filter in `select` (§3.1) | S | −0.2 to −0.5 s Desk usable locally; about 48 fewer requests per hard load | Low | Desk hard load: each Desk table requested once (waterfall); the walkthrough and studio-drafts tests unchanged |
| E2-4 | `procurement_claim_deadlines(uuid[])`, the N+1 only (§3.2 interim) | S | One serial hop, ~0.1–0.3 s when POs are live | Low; same predicate as 00700 | SQL test: as Leah, the hire and an outsider, the set result equals the per-PO calls |
| E2-5 | CommandBar reads the Desk lazily; Document enrichment uses a scoped need read (§3.4) | S (bar) + M (scoped need) | −0.5 to −1.5 s Document no-busy; Desk poll off on docs | Medium: the doc's red-letter need must stay exact | Doc hard load: zero Desk-shaped tables; `selectOperationalNeedForDocument` tests pass on the scoped read |
| E2-6 | Intent prefetch + Desk-cache seed for the engagement (§2 B) | S | P2 usable −0.3 to −0.6 s (1,464 → ~0.9–1.1 s) | Low | P2 usable and request count; a hover → click run shows 0 `document_state` requests after the click |
| E2-7 | `useProjectFFEItems` single key (§4.4) | S | < 0.1 s; P3 opens warm | Low; a wider embed | Doc hard load: 1 `project_ffe_items` request; P3 SPA: 0 |
| E2-8 | `desk_read` RPC, SECURITY INVOKER, per-feed exception blocks (§3.2) | M | Desk usable −0.3 to −0.6 s local, −0.2 to −0.5 s prod; Desk poll 26 → 1 req/min | Medium: sequential execution can be slower; needs `review-audit-frontier` | `EXPLAIN ANALYZE` total ≤ 150 ms on prod-shaped data; an RLS-parity SQL test per feed for three identities; `buildDesk*` unit tests unchanged |
| E2-9 | `document_open` RPC (§4.3) | M | Document no-busy −0.2 to −0.5 s; up to 5 hops fewer on a redirect | Medium: redirect semantics | Jest over the six resolution branches against the RPC; doc waterfall depth −1 |
| E2-10 | Doc page lens split + `memo` + shared hooks instead of setter reports (§4.2) | L (about 4 slices) | −0.2 to −0.5 s long-task on hard load; most gain on P6/P7 (unmeasured) | Medium: arrival readiness and guide wiring | Add React Profiler commit counts to the harness: commits per settle on doc load drop by more than 50%; the existing `page.test.tsx` arrival tests pass |
| E2-11 | Poll/realtime de-overlap (§6) | S | 0 s first load; about −6 req/min per doc | Low: keep a fallback poll | 5-minute idle network log on a Document: requests a minute before and after |
| E2-12 | Image size + lazy (§7) | S per site, M in all | ≈ 0 s on the Desk/Document | Low | CLS on Library/Pieces/Room under 0.05 (needs E3's RUM); off-screen images not requested before scroll |
| E2-13 | Server prefetch + `HydrationBoundary`, Desk only (§2 A) | L | +0.2 to 0.5 s hard-load beyond E2-6/E2-8 + E1; ≤ 0 on SPA | High: arrival flash, Worker CPU, cold start, OpenNext | An experiment behind a flag; keep only if prod RUM shows ≥ 500 ms p75 off hard-load LCP |
| E2-14 | Virtualization (§5) | M per list | 0 s at measured sizes | Low | Only after a prod size count shows over 150 rows at p95 |

**Proposed tracks for synthesis:**
- Fix now: E2-1, E2-2, E2-3, E2-4, E2-6, E2-7, E2-11.
- Next: E2-5, E2-8, E2-9, E2-10, E2-12.
- Structural: E2-13, E2-14.

---

## What D1 can render, and when

- **Now (no engineering dependency):** a skeleton per room, drawn to the real geometry (Desk roster;
  Document letterhead, band, spine and paper; Pieces room rail and lines; People index; Library shelf;
  RoomShell plus the canvas box; board grid, chrome-less). Each one ships as one component used at the three
  mount points in §1.2. The `(document)` group fallback is a plain paper sheet.
- **With E2-1:** these paint on the first frame of an SPA navigation (prefetched), and in the server HTML of a
  hard load (the Suspense fallbacks). D1 can rely on "nothing blank, ever", but not on data inside the
  skeleton.
- **The Document's held state:** D1 decides what stands in place of the hidden held paper and the "Picking
  up…" line (`page.tsx:3346-3351`). The mount is already there. The arrival options are PQ rulings.
- **The navigation progress rule:** it renders from a small client component in `(document)/layout.tsx`, fed
  by a wrapped `Link` that publishes `useLinkStatus` (installed 16.2.10 has it since 15.3; `review/r-patterns.md`
  §3). It is useful mainly when a route was *not* prefetched, so it pairs with E2-6's intent prefetch.
- **Not before E2-13 and a ruling:** content-in-HTML (server data) under the arrival.

## Founder questions this seat raises (for synthesis to number)

1. The arrival hides the Document paper for up to 8.5 s while a skeleton could stand there. Keep the hold, let
   the skeleton be the arrival, or retire it? (D1 draws the options.)
2. A read-only prod count of FF&E lines per project, Library shelf size and board items, so that virtualization
   is decided on real sizes.
3. The Desk on the Document: is a scoped "this document's needs" read acceptable as the letterhead's source,
   rather than the whole Desk?
