# Pairings: engineering × design (US-33, seat 8, merged into SQ-959)

Lead: Opus 5.5 (SQ-959). This is a read-only synthesis. It reads `baseline/` and the six `review/*.md` seats
with their sketches. No product code changed. `plan.md` is the companion file. Its track ids (F1…, N1…, S1…),
founder questions (PQ1…) and rejected ideas (RJ1…) are cited here in the "Track" column.

## 0. Notation and ids

**Seat ids used as they stand.** E2-1 to E2-14 (`e2-page-architecture.md` §8). E3-1 to E3-13
(`e3-infra-bundle.md` §7). D1-a to D1-k (`d1-loading.md` §10). D2-PQ1 to D2-PQ11 (`d2-feedback.md` §8). C1–C9
are D2's nine components (`d2-feedback.md` §4).

**E1 ids, assigned here.** E1 did not number its items. Seats 10–13 cite these ids, which follow E1's own §7
order:

| Id | E1 item | E1 section |
|---|---|---|
| E1-1 | Shared `useOptimisticMutation` helper | §2 |
| E1-2 | Optimistic tick and add-task (#1, #2) | §1.2, §7 |
| E1-3 | Narrow the 51 whole-`['document-state']` invalidations, with a `docKeys` factory | §3 |
| E1-4 | CommandBar reads the Desk only when open (`enabled: open`) | §3.2, last row |
| E1-5 | Send and discard mark the Desk stale (an under-invalidation today) | §3.2 |
| E1-6 | Optimistic room add plus a one-round-trip insert (#5) | §1.2, §7 |
| E1-7 | Realtime: apply instead of invalidate, drop the echo, ref-counted channel registry | §4 |
| E1-8 | Publish the coordination tables to `supabase_realtime` (a PQ) | §4 |
| E1-9 | Session-user store (`getSession`-seeded) replacing hook-level `getUser` | §5 |
| E1-10 | Pending-only fixes for §6 #6–8 (exclusions, gate conditions) | §6 |
| E1-11 | The other narrowing rows: margin-items, `['projects']`, invoices, procurement, 112 `Keys.all`, the dead `['desk-engagements']` key | §3.2 |
| E1-12 | The per-mutation verdicts #3–#26 (optimistic, pending-only, leave) | §1.2 |

**Design proposal ids, assigned here.** D1.1–D1.20 and D2.1–D2.22 in §1 and §2 below. Each row maps to the seat
section it came from.

**Cost** uses the seats' sizes: S (≤1 day), M (several days), L (multi-slice). "Baseline" names the file and
figure the change improves. Figures marked ESTIMATE are not measured.

## 1. D1 loading proposals

| Id | D1 proposal (section) | Enabling engineering | Cost | Baseline it improves | Track |
|---|---|---|---|---|---|
| D1.1 | One register in four layers: frame, placeholders, indicator, words (§2) | E2-1 mount points; E2-2 boundaries | M in all | Five treatments plus blank (`d1-loading.md` §1); P3hard and P4 placeholder "none" (`BASELINE.md:52-53`) | F13, N10 |
| D1.2 | Frame painted by a static, data-free `loading.tsx` per segment (§2 layer 1, §9 E2-D1) | E2-1 | S per route | P4 placeholder none → ≤200 ms ESTIMATE; P5 647 ms → ≤200 ms ESTIMATE (`BASELINE.md:53-54`) | F13, N10 |
| D1.3 | One skeleton component per room, shared by `loading.tsx`, the inner Suspense fallback and the page's pending branch (§9 E2-D2) | E2-1 §1.2 three mount points | M | P3hard blank to 6,154 ms (`BASELINE.md:52`) | F13, N10 |
| D1.4 | H1: an empty state needs a successful read | E2-D7 helper (a `status === 'success'` predicate) | S | People reads "empty" while loading (`screens/P4-200ms.jpg`) | F13 |
| D1.5 | H2: filled bars, never hollow frames or white tiles (Desk frames, recent-boards tiles) | None (CSS) | S | `screens/P1-1000ms.jpg`: the Desk at 1 s looks like three empty boards | N10 (Desk carries the arrival) |
| D1.6 | H3: no input, tab or button in a skeleton before hydration | None (markup rule) | S | Prod hydration starts 1.4–5 s in (`BASELINE.md:88`); typing before then is lost | F13, N10 |
| D1.7 | H4: `aria-busy`, an `sr-only` sentence, `role="status"` / `role="alert"` | None | S | "Reading the roster…" has no status role, so the lab and screen readers miss it (`directory-view.tsx:571`) | F13 |
| D1.8 | Thresholds: indicator 100 ms, placeholders 150 ms, 120 ms fade, slow 4 s (Q) / 3 s (X), stall 10 s (§2) | CSS `animation-delay`; no JS before hydration | S | SPA dead air 215–251 ms local, 248–608 ms prod (`BASELINE.md:49-60`, `:89-96`) | PQ8 amends the indicator to 300 ms (M6) |
| D1.9 | Navigation indicator with start, end and fail signals (§3, §9 E2-D5) | A layout-resident client component; capture-phase anchor listener plus a wrapped `router.push`; end on "no `aria-busy` in `<main>`"; fail when `error.tsx` mounts | S–M | Same dead air; cold Worker 1.6–3.7 s on SPA (`BASELINE.md:77-78`) | N11, PQ4 |
| D1.10 | Slow and stall voice: one italic line at 4 s; "Reload the page" at 10 s (Q) | None | S | No current signal past first paint on a 7 s load | N10 |
| D1.11 | Loading / empty / error / slow states, with region-level errors and `error.tsx` per segment (§6) | E2-2 | S | Only `board/[boardId]/error.tsx` exists (`e2-page-architecture.md` §1.4) | F14 |
| D1.12 | Arrival options A keep / B shorten / C skeleton becomes the arrival / D retire (§7) | E2-D9: remove `arr-pre` and the held path (`arrival.css:8-24`, `doc/[id]/page.tsx:2956-2958,3345-3351`); put the job title in the arrival token; E2-6 seed puts the title in hand on SPA | M | P2hard usable 6,773 ms vs LCP 10,728 ms (`BASELINE.md:50`) | N10, PQ3 |
| D1.13 | StrataSweep only for unknown-shape work (§8) | None | S | Library shelf uses a word-sized sweep as a region loader (`library-shelf.tsx:133`) | N10, PQ6 |
| D1.14 | Retire the ~20 prose loading lines; words only for slow, stall and error | None | S | "Picking up…" alone on blank paper (`screens/P2-1000ms.jpg`) | N10, PQ7 |
| D1.15 | Direction Q: pearl bars that breathe on R15; a 1 px ink rule at 40% (§3) | D1.9 signals | S on top of D1.3 | — | PQ2, PQ5 |
| D1.16 | Direction X: shimmer, clay bar with glow, toasts (§4) | D1.9 signals; a toast host | M | — | PQ2, PQ13 |
| D1.17 | Room view: loading, processing and error as three states; today a failed read prints the processing sentence (§5) | E2-D7 | S | `room-view.tsx:279` returns `null` while loading | F13 |
| D1.18 | Desk scroll restore survives the skeleton (§9 E2-D10) | Restore after the content swap (`desk/page.tsx:514-530`) | S | P10 place-keeping | N10 |
| D1.19 | Shift-free swap: skeleton line boxes equal the rendered ones (§9 E2-D8) | A CLS mark in `harness/lab.mjs` | S | No CLS is measured today | F17 |
| D1.20 | Before any HTML: nothing paints during a cold Worker or 63 revalidations (§9.12) | E3-1, E3-6, E3-7 | S / M | Cold TTFB 2.1–5.2 s; 63 of 63 scripts revalidated (`BASELINE.md:77-78,99-102`) | F7, F12, S2 |

## 2. D2 action-feedback proposals

| Id | D2 proposal (section) | Enabling engineering | Cost | Baseline it improves | Track |
|---|---|---|---|---|---|
| D2.1 | The grammar S0–S5: exactly one thing answers within 100 ms (§2) | E1-1, E1-3 | M in all | P6 tick: no change for 465–748 ms (`data/e1-P6-1440.json`) | F16, N2, N12 |
| D2.2 | S0 press on every act, rows included (`.da-act:active`, `globals.css:943-955`) | None | S | The tick is a raw `<button>` with hover only (`work-block.tsx:312-317`) | F16 |
| D2.3 | S1 optimistic value change for toggles (P6, C3, C6) | E1-1, E1-2, scope per task | S after E1-1 | P6 visible 748 ms → ≤50 ms ESTIMATE (`e1-data-writes.md` §2.3) | N3, PQ9 |
| D2.4 | S1 held word for pending-only classes (advance, send, money, delete without Undo) | None (`DocumentAction loading`, `phase-advance-control.tsx:324-347` already do it) | S | Pending-only acts that are silent today (C9 delete, E1 §6 #6–8) | F16 |
| D2.5 | S2 `saving…` at 400 ms with a 500 ms minimum hold, optimistic classes only | E1-1 must expose the start time (D2 §7 #10) | S | Tick write 177–233 ms, visible 465–748 ms (`e1-P6-1440.json`) | N12, PQ8 |
| D2.6 | S3 settle on the write's own response; the refetch reconciles silently | E1-1 settle semantics (see M1b) and E1-3 narrowing | S | Settled 1,368 ms, of which 650–700 ms is the Desk sweep (`e1-data-writes.md` §1.1) | N2, F5 |
| D2.7 | S4 inline failure: restore truth, one `role="alert"` line, 44 px Try again; retire the red global "Error" toast | `meta.errorSurface: 'inline'` (`lib/react-query.ts:14-22,112-163`) on each hook | S per hook | Failed tick → raw DB message in a toast far from the row (`lib/error-handler.ts:811-820`) | N12, PQ11 |
| D2.8 | S5 Undo only where it already exists; "Removing… Undo" until receipt | None | S | — | N12 |
| D2.9 | Ghost row for creates (P8 room, task), from mutation `variables` | E1-6 one-RTT insert; client UUID for idempotent retry | S | Add room: 3 serial RTTs, ESTIMATE 0.73 s p50 / 2.4 s p90 prod (`e1-data-writes.md` #5) | N4 |
| D2.10 | Reorder announces "Moved Sofa to 3 of 7" | None (reorder is already optimistic, `use-scope-builder.ts:235,285`) | S | — | N12 |
| D2.11 | P7: write the receipt into `['project-phases', id]` so the list changes with the notice; add the 8 s line | E1-12 (#4 stays pending-only); narrow its 5 invalidations | S | Phase list lags the notice by ≥29 refetches, ESTIMATE 1.05–1.6 s prod (`e1-data-writes.md` #4) | F5, N5 |
| D2.12 | P9: never optimistic; "Still sending." at 8 s; "Nothing is sent twice." only if idempotent | E1-5 Desk stale after send; O4 idempotency check | S | The Desk shows "ready to send" up to 60 s after a send (`use-desk-engagements.ts:692,707`) | F6, N12, PQ16 |
| D2.13 | Money: pending-only; retry only with an idempotency key | `retry: false` on send and money hooks unless keyed | S | Every mutation retries once on a network error today (`lib/react-query.ts:242-249`) | F15 |
| D2.14 | One band-level `saving…` (`useIsMutating() > 0` for over 400 ms), quiet | None | S | — | N12, PQ12 |
| D2.15 | `beforeunload` while a write is pending | `useIsMutating` | S | — | N12 (data-loss prevention, no ruling) |
| D2.16 | Offline: optimistic classes pause; sends and money refuse (`networkMode: 'always'`) | O3 confirms TanStack pause semantics | S | — | N12, PQ15 |
| D2.17 | Double-click guards: a ref guard for pending-only; scope serialization for toggles; a second ghost, never a duplicate | E1-1 `scope` (supported in query-core 5.90.20, `e1-data-writes.md` §2.1) | S | — | N2 |
| D2.18 | Focus rules; `aria-pressed` on the tick (§6.4) | None | S | The tick glyph is `aria-hidden`, so its state is heard only through meta text (`work-block.tsx:337-349`) | F16 |
| D2.19 | Task rows at 44 px | None | S | The work-block row is ~29 px (from classes); the coordination tick is 13 px (`coordination-work.tsx:177-178`) | F16 (not waivable, so not a PQ) |
| D2.20 | The component fixes: C2 and C7 background stamps never toast; C3 coordination tick and create; C5 folio S2/S4 and image remove; C6 work-block; C8 dismiss announcement; C9 swatch role rollback and pending delete. Plus the three the heuristic missed: `ffe-section.tsx:934-946`, `rooms-rail.tsx:74-86`, `resolve-signoff.tsx:48-75` | E1-10; per-hook `errorSurface` | S each | Add room wipes her typed name on failure (`d2-feedback.md` §4) | F15, F16, N4 |
| D2.21 | Undo for folio image remove and swatch delete (D2-PQ8, D2-PQ11) | A restore path per hook (re-persist the previous list) | S each | Two optimistic deletes without Undo today (`piece-folio.tsx:96`, `palette-swatch-editor.tsx:73`) | F15 (pending-only now), N15, PQ14 |
| D2.22 | Expressive extras: hairline, settle wash, fixed Undo row with a shadow, "Saved · 10:42" | None | S | — | PQ13 (recommended no) |

## 3. Engineering changes: what a studio member will feel

| Id | Change | What she feels | Track |
|---|---|---|---|
| E1-1 | Optimistic helper | Invisible by itself. It is what makes N3 safe to build | N2 |
| E1-2 | Optimistic tick and add task | The tick lands under her finger. Today it takes about three quarters of a second (`e1-P6-1440.json`) | N3 |
| E1-3 | Narrow `document-state` | Invisible but measurable: 27 → 3 refetches per tick. She may notice the page stop "settling" a second after each tick | F5, N6 |
| E1-4 | CommandBar lazy | Invisible but measurable: no 24-request Desk poll every 60 s on an open Document | N7 |
| E1-5 | Desk stale after send | She stops seeing a draft as "ready to send" after she has sent it | F6 |
| E1-6 | Room add | The room appears as she presses Enter, and her words survive a failure | N4 |
| E1-7 | Realtime registry and echo drop | Invisible today: nothing is published (`e1-data-writes.md` §0.3) | S7 |
| E1-8 | Publish coordination tables | A co-member's tick would appear without a reload. A product change, so it is a ruling | PQ17 |
| E1-9 | Session-user store | Every hard load is roughly 2.7 s shorter (`e2-page-architecture.md` §0). This is the largest single change she will feel | F1, N1 |
| E1-10 | Pending-only fixes | Remove and Mark satisfied answer the press instead of doing nothing | F16 |
| E1-11 | Other narrowing | Invisible but measurable: fewer background refetches | N6 |
| E1-12 | Per-mutation verdicts | Ticks, edits and creates answer at once. Money, sends and the phase advance say what they are doing and never pretend | N3, N12 |
| E2-1 | `loading.tsx` per segment | No room is ever blank. People stops looking empty while it loads | F13, N10 |
| E2-2 | Error and not-found boundaries | A broken page keeps the drawer and ⌘K, and offers Try again | F14 |
| E2-3 | Desk key unification | The Desk lands a little sooner. Invisible but measurable: about 48 fewer requests per hard load | F2 |
| E2-4 | Claim-deadline set RPC | Invisible but measurable: one serial hop fewer when POs are live | N8 |
| E2-5 | CommandBar lazy plus a scoped need read | The Document stops "finishing" seconds after it looks ready. ESTIMATE −0.5 to −1.5 s to no-busy | N7 |
| E2-6 | Intent prefetch plus the Desk-cache seed | Desk → Document opens with the job's name already set. ESTIMATE −0.3 to −0.6 s | F3 |
| E2-7 | One FF&E key | The build room opens with its lines already there | F4 |
| E2-8 | `desk_read` RPC | The Desk lands sooner on a hard load. ESTIMATE −0.2 to −0.5 s prod | N8 |
| E2-9 | `document_open` RPC | Invisible but measurable: one dependency level fewer. Old links that redirect stop stalling | N9 |
| E2-10 | Lens split plus memo | Less hitching after a tick, and while the page settles. Unmeasured until Profiler counts exist | S1 |
| E2-11 | Poll/realtime de-overlap | Rejected for now (RJ6). It would make data staler, not fresher | RJ6, S7 |
| E2-12 | Image sizes and lazy loading | Thumbnails stop pushing text around on the Library, boards and Pieces | N14 |
| E2-13 | Server prefetch, Desk only | Maybe 0.2–0.5 s on a hard load (ESTIMATE). Nothing on a click | S3 |
| E2-14 | Virtualization | Nothing at today's list sizes | S8 |
| E3-1 | Immutable `_next/static` | Repeat visits open faster. Invisible as a mechanism | F7 |
| E3-2 | `getClaims` in middleware | Invisible but measurable: about 30 ms per hard load | N13 |
| E3-3 | Role claim via an Auth hook | Invisible but measurable: about 30 ms more. A risk to every app's sign-in | S4, PQ20 |
| E3-4 | Matcher excludes `/api` and prefetches | Invisible but measurable: 30–60 ms off every API call and prefetch | N13 |
| E3-5 | Placement | Nothing (RJ3) | RJ3 |
| E3-6 | Cold-start measurement | Invisible. It makes the 2–5 s cold opens visible to us | F12 |
| E3-7 | Static-assets cache for 28 shells | Fewer 2–5 s cold opens on the Desk, People and Library. Not on a Document | S2 |
| E3-8 | Drop the crypto re-export | Invisible but measurable: −97.6 KB gzip on every route (`bundle.md:47`) | F8 |
| E3-9 | DebugPanel client boundary | Invisible but measurable: part of the −220 to −390 KB per route | F9 |
| E3-10 | Icon rewrite | Invisible but measurable: about −120 KB gzip per route ESTIMATE | F10 |
| E3-11 | `MediaUploader` dynamic | Invisible but measurable, only if still shared after E3-9 | F9 (follow-on) |
| E3-12 | RUM (`portal_web_vital`) | Invisible. It measures the tool, never the designer | F11 |
| E3-13 | CI bundle budget | Invisible. It stops the weight coming back | S5 |

## 4. Mismatches

**M1. Design wants instant ticks, but the write fans out.** (a) Today one tick triggers 27 refetches, 24 of them
the Desk (`e1-P6-1440.json`). An optimistic ✓ on top of that fan-out would land instantly and then sit on a page
re-rendering the whole 4,112-line body, which has no `memo` (`e2-page-architecture.md` §4.1), for 650–700 ms of
Desk traffic. The ✓ itself is fine. The hitch after it is not. **Resolution:** narrowing (F5) ships before or
with the optimistic tick (N3). (b) Settle semantics conflict. D2 §0.2 settles on the write's response. E1 §2.1
returns the invalidation promise so that `isPending` covers the reconcile. With E1's rule, the 400 ms `saving…`
word would appear on most ticks (write 177–233 ms plus refetch ~170 ms plus render). **Resolution:** for
optimistic classes the helper does not await the reconcile. `isPending` ends at the write, and the reconcile runs
in the background. For pending-only classes, the success handler writes the receipt into the cache (D2.11), so
the visible state matches the notice without waiting for the refetch.

**M2. The skeleton must be static server markup, but the pages are client pages.** D1 §0 says the register is
"painted by a `loading.tsx` before hydration". That holds only on an SPA navigation. On a hard load the client
pages never suspend on the server, so `loading.tsx` is not what paints (`e2-page-architecture.md` §1.2). The
page's own pre-hydration render paints: `!hydrated` guards and `Suspense fallback={null}`. **Resolution:** E2's
three mount points (`loading.tsx`, the inner Suspense fallback, the page's pending branch) render one component
with identical geometry. D1's "no JS before hydration" constraint still holds at all three, because all three
render as server HTML on first load.

**M3. The arrival conflicts with `loading.tsx`.** `arr-pre` is added after hydration and hides only
`[data-arrival]` (`arrival-run.tsx:401`, `arrival.css:8`). A `loading.tsx` fallback carries no `data-arrival`.
On the Document that gives three waiting faces in a row: the fallback, then "Picking up…", then the hidden paper
(up to 8.5 s), then the card. Option A (keep) cannot coexist with D1's register without that seam. Option C
removes it. This is why the Desk and Document `loading.tsx` wait for PQ3 (N10), while the rooms without an
arrival get theirs in Fix now (F13). A `(document)/loading.tsx` catch-all would also wrap `/desk` and
`/doc/[id]`, so it waits too.

**M4. Option C needs the job's name at first paint.** On Desk → Document the Desk cache already holds every
`document_state` row, so E2-6's seed puts the title in hand at commit. On a hard load from a bookmark it does not,
and D1 accepts a title bar there. C therefore depends on F3.

**M5. The navigation signal.** E2's "What D1 can render" suggests a wrapped `Link` that publishes
`useLinkStatus`. R §3 shows `useLinkStatus` skips the pending state for prefetched links. Once `loading.tsx` makes
dynamic routes prefetchable, it would go silent on exactly the links that matter. D1 §9.5's capture-phase
listener plus a wrapped `router.push` is the right source. **R contradicts E2 here.**

**M6. Indicator timing.** D1 starts the rule at 100 ms, citing Next's `useLinkStatus` example. R §2 cites NN/G
(no indicator under 1 s, because a flash makes people feel they cannot keep up) and Turbo's 500 ms default. B1 is
already met by the S0 press state at 0 ms (D2.2). **Resolution:** the rule appears at 300 ms. That is inside the
practice range and above the warm prod request p50 of 243 ms (`BASELINE.md:97`). Most local navigations
(215–251 ms first change) would then show no rule, and prod desk→doc (608 ms) would. **R contradicts D1 here**;
ratified through PQ8.

**M7. `loading.tsx` switches on viewport prefetch for dynamic routes.** Every visible Desk card would then
prefetch through middleware: about 60 ms warm and two Strata calls each (`data/prod-server-probes.csv`).
**Resolution:** Fix now uses `prefetch={false}` plus intent prefetch (F3). N13 excludes prefetch requests from the
matcher (E3-4), after which viewport prefetch can return.

**M8. Slower polls against dead realtime.** E2-11 slows polls "while the channel is `SUBSCRIBED`". E1 §0.3 shows
`client_decisions`, `project_tasks` and `project_ffe_items` are not in the local publication, and the lab saw 0
`postgres_changes` frames. A channel can be `SUBSCRIBED` and receive nothing, so E2-11 would make data staler.
**E1 contradicts E2.** Rejected until O1 (RJ6).

**M9. The double subscription.** E2 §6 says the coordination channel mounts twice (`schedule-spine.tsx:202` plus
`coordination-band.tsx:80`). E1 §0.4 shows `CoordinationBand` "no longer mounts anywhere"
(`doc/[id]/page.tsx:3780-3783`). **E1 wins.** But E2 also reports the inbox channel `notification_log:${userId}`
mounted twice (`studio-drawer.tsx:168`, `mobile-bar.tsx:120`). By E1 §4's realtime-js reading
(`RealtimeClient.js:277-287`, `RealtimeChannel.js:160-178`), a duplicate topic unsubscribes silently on a binding
mismatch. The 30 s poll would mask that. Open check O5.

**M10. `getClaims`: E1 §5 against E3 §1b.** E1 says `getClaims()` falls back to `getUser()` for HS256 tokens
(`GoTrueClient.js:2810-2822`), so it saves nothing in hooks. E3 says Strata signs ES256, so middleware gets zero
hops. **Both hold, for different callers.** Middleware needs *verification*, so it uses `getClaims` with an
inlined JWKS (N13). Browser hooks need only the *id*: RLS is the authority on every request, so they use E1's
`getSession`-seeded store (F1, N1), and never `getClaims`. Local Supabase may well sign HS256, which is why E1 saw
the fallback; prod is ES256 by E3's evidence (edge-api JWKS verification, `docs/ops/authcheck-positive-probe.md`).
R §4 adds a caution: an advertised JWKS key is not proof of the signing key. Gate O2 decodes one live token header.

**M11. The serializer behind the `getUser` queue (new, verified for this synthesis).** E2 §0 found 16
`auth/v1/user` calls running strictly back to back, ~172 ms each, and asked why. The installed auth-js runs
`getUser()`'s network call *inside* the client lock (`@supabase/auth-js@2.98.0 dist/main/GoTrueClient.js:1258-1265`).
`getSession()` takes the same lock (`:1100-1107`), and supabase-js fetches every PostgREST request's token through
`auth.getSession()` (`@supabase/supabase-js@2.98.0 dist/index.mjs:329-335`). So the hook-level `getUser` calls run
one at a time, and every data read waits in the same queue behind them. That is why the first Desk read starts at
5,951 ms, after 15 of the 16 `getUser` calls (`e2-page-architecture.md` §0). E1-9 is therefore the largest lever
on hard-load time, not a mid-tier cleanup.

**M12. CommandBar gating alone does not take the Desk off the Document.** E1-4 (S) removes the CommandBar's
observer. But the Document page itself observes the Desk key for enrichment (`page.tsx:1103`), and
`deskEnrichmentApplies` is true for nearly every live document (`page.tsx:380-387`), with `paperSettled` waiting
on it (`:2928-2943`). E1-4 alone removes the poll's re-runs. It does not remove the Desk from the Document's
arrival critical path. That needs E2-5's scoped need read. N7 pairs the two.

**M13. Creates: cache patch or ghost row.** E1 #2 and #5 patch the cache with a client UUID and roll back on
error. D2 §3 and R §3 ("the simpler variant") draw the ghost from mutation `variables`. `variables` survive an
error, so her words stay with Try again / Discard. **Resolution:** creates that render in one list use the
`variables` ghost. Toggles and edits that show in several places (tally, Desk, gates) use E1's cache patch. Both
keep E1's client UUID, so a retry after an ambiguous failure cannot make two rooms.

**M14. What the arrival actually costs.** `BASELINE.md:159` and D1 §0 frame the arrival hold as the ~7 s. E2's
timeline contradicts that on the Desk: the first Desk read starts at 5,951 ms and content shows at 6,926 ms, so the
hold hides almost nothing there. The 7 s is JS (to ~3.0 s) plus the auth-lock queue (~2.7 s) plus the reads. On
the Document the hold *does* cost: usable 6,773 ms against LCP 10,728 ms (`BASELINE.md:50`), because the held
paper waits for the Desk enrichment (`e2-page-architecture.md` §3.4). **Consequence:** PQ3 is about honesty and
continuity on the Desk, and about ~2–4 s of hidden content on the Document. Retiring the arrival alone would not
make the Desk fast.

**M15. Server prefetch while the hydration gates stand.** E2-13 is a no-op while `!hydrated` placeholders remain
(`doc/[id]/page.tsx:3013`, `desk/page.tsx:404`), and removing them needs an arrival ruling. So S3 sits behind
PQ3 and the RUM gate.

**M16. Settle estimates.** D2 designed against "0.5–3 s, estimate". E1 measured 465–748 ms visible and
1,126–1,368 ms settled (`e1-P6-1440.json`). The plan uses E1's numbers. D2's 400 ms threshold still sits inside the
measured range.

**M17. Counts.** D2 counts 10 `onMutate` sites. E1 enumerates 9 across 7 files (`e1-data-writes.md` §0.5), and
D2's tenth is not named. The plan uses 9. The plan's sweep said 530 `useMutation` and 1,094 `invalidateQueries`;
E1 counted 655 and 1,400, and `doc/[id]/page.tsx` is 4,112 lines, not 4,019.

**M18. P10 after CommandBar gating.** Gating the Desk read on Documents could leave `/desk` cold on return.
`gcTime` is 30 minutes (`lib/react-query.ts:223`), so the cache survives a normal Document visit and renders at
once while it refetches. The risk is small and needs no extra work.

## 5. Where R's evidence contradicts a seat

| # | Seat claim | R evidence | Ruling here |
|---|---|---|---|
| R-1 | D1: indicator at 100 ms | NN/G: no indicator under 1 s; Turbo 500 ms (R §2) | 300 ms, since the press state covers B1 (M6) |
| R-2 | E2: feed the rule from `useLinkStatus` | It skips prefetched links (R §3) | D1's capture-phase signal (M5) |
| R-3 | E3: "Strata already signs ES256" | JWKS shows an advertised key, not the signing key (R §4) | Likely true; verify a live token (O2) |
| R-4 | E2 Option A: `prefetchQuery` | Current TanStack docs use `queryClient.query` (R §3) | Check against 5.90.21 before S3 (O10) |
| R-5 | D1 Q / D2 quiet: calm tools omit spinners and sync chrome | No first-party source documents omitting them (R §1) | Q is a taste call consistent with VISION §4, not an evidenced pattern |
| R-6 | D1 X: shimmer reads faster | Mejtoft 2018 and Viget 2017 disagree (R §2) | No evidence either way; not a reason to pick X |
| R-7 | D2: 400 ms is a threshold | Doherty is a heuristic; no primary study sets a flash delay (R §2) | Keep 400 ms as a design value, ratified through PQ8 |
| R-8 | E3-7: cache interception for the shells | Interception "doesn't work with PPR"; #1223 500s with Cache Components (R §5) | Fine without Cache Components; gate on middleware order (O7) |
| R-9 | Plan: PPR / Partial Prefetching | Not in installed 16.2.10; OpenNext 1.20.1 has open stream bugs (R §0, §5) | Rejected (RJ8) |
| R-10 | E3 RUM: custom event | PostHog may already collect `$web_vitals` from the remote setting (R §6) | Check first (O6) so vitals are not captured twice |

## 6. Open checks the pairings depend on

| # | Check | Blocks | Who |
|---|---|---|---|
| O1 | Prod `supabase_realtime` publication membership | S7, PQ17 | Read-only prod SQL (PQ19) |
| O2 | One live prod access-token header (`alg`, `kid`) and prod `jwt_expiry` | N13, S4 | Read-only (PQ19) |
| O3 | Does TanStack 5.90.21 pause mutations offline under `networkMode: 'online'`? | PQ15, N12 | E1 unit test |
| O4 | Are `outbound-draft-send` and `invoice-send` idempotent? | PQ16 wording, F15 retry rule | E1 code read |
| O5 | Does the doubly mounted inbox channel unsubscribe itself? | S7 | E1 jest with a mocked channel |
| O6 | Is PostHog `$web_vitals` autocapture already on? | F11 | Read-only PostHog |
| O7 | Does OpenNext cache interception run before or after middleware? | S2 | E3 staging gate |
| O8 | The Workers simultaneous-connection cap (E2 recalled 6, unverified) | S3 | E3 doc read |
| O9 | p95 FF&E lines per project, Library shelf size, board items | S8 | Read-only prod SQL (PQ19) |
| O10 | `queryClient.query` vs `prefetchQuery` in 5.90.21 | S3 | E2 code read |
