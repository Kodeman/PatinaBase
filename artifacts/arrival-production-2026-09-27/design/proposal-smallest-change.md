# Arrival to production: the smallest change

## Spine

The page is the brief. The arrival never computes a sentence, a date or a rank. It reads its card from nodes the page already rendered and animates those same nodes. So T3 holds by construction, the shipped rankers win, and the 19 `NeedKind`s, the timezone and the refetch stay the page's business.

`arrival.js` is ported near-verbatim to `src/lib/arrival/`, minus `select()`, `desk()`, `NEED_RANK` and the since composer. A `readBrief()` selector map over attributes the portal already prints replaces them.

One `<Arrival/>` is mounted once in the `(document)` layout and keyed on pathname. Existing components gain four attributes and one call. No inline script, no body hide, no `packages/` edit; the anchor ships write-only and F2 waits.

## S1: the headline

**Decision.** Lift, don't rank.

- The Desk ranker is `deriveDeskClaims` (`desk-roster-derivation.ts:739-744`), read through the first rendered claim card.
- The Document ranker is `deriveLensBand`/`rankStanding` (`lens-band-derivation.ts:711-718`), read through line 2.
- The card is the node's text, so it cannot disagree with the page.

R2/R5 are the page's `Overdue {elapsed} — {text}` (`desk-roster-derivation.ts:412-415`). R1: a paused job has no needs, so no claim card (`desk-roster-derivation.ts:371-375`), and its Document's guide says it is paused (`:80`). For R3/R4:

- **Desk:** the overdue line "Nothing is overdue." (`:314`).
- **Document:** the band's guide sentence. When line 2 is `none`, the headline is the letterhead `<h1>` (34px, the mockup's `t-d1`), so every Document still arrives.

T2 caps apply by omission, never rewording. A fact over 9 words is dropped; a headline over 12 words declines (`budget`).

**Seam.** `PARTS` in `brief.ts` takes the first node rendered at this width.

| part | Desk | Document |
|---|---|---|
| headline | `[data-claim-card] [data-register="sentence"]` (`desk-claim-card.tsx:170-181`), else **new** `[data-desk-overdue-line]` (`desk-roster.tsx:293`) | `[data-lens-sentence]` if non-empty (`lens-band.tsx:273-282`), else `#document-project-status h1` |
| act | `[data-claim-card] [data-register="act"] :is(a,button)` (`:183-205`) | `[data-lens-line="2"] button:not([data-lens-more])` (`lens-band.tsx:283-301`) |
| job | `[data-claim-card] [data-roster-name]` (`:145-154`) | none |
| place | `[data-tour-anchor="desk-greeting"]` plus the next `p` (`desk/page.tsx:333-349`) | `[data-rail-label]`, `[data-spine-stage-phrase]` (`doc-spine.tsx:172-252`) |
| facts / warn | `[data-day-line]` lines 2–3 (`desk-roster.tsx:306-313`); warn is the one reading "overdue" | f1 = `[data-letterhead-vitals]` (**new** on `letterhead-vitals.tsx:405`; exists at `doc-letterhead.tsx:100`) |
| crown | none | `[data-spine-mark]` (`doc-spine.tsx:200`), then **new** `[data-letterhead-mark]` (`doc-letterhead.tsx:66`) |
| head | `#every-job` (`desk-roster.tsx:269`) | `#document-project-status` (`doc-letterhead.tsx:65`) |

**Verify.** `pnpm --filter @patina/designer-portal test -- src/lib/arrival/__tests__/brief.test.tsx`. It renders the real `DeskClaimCard`, `LensBand` and `DocLetterhead`, so selector drift fails in jest.

**Cost.** S.

**Forecloses.** The mockup's kind-rank tie-breaks and the `Job: brief` recomposition. The card keeps the page's em dash.

## S2: since line and anchor

**Decision.** Ship `00675_arrival_anchors.sql` write-only.

No reader, no SELECT on mount: `mark_arrival` fires once per entry after rest or decline, fire-and-forget, off the critical path. **F2 is omitted on both surfaces, "First visit." included**, because production prints no since line at rest, so a card-only F2 breaks T3 and constraint 5. Rows accrue now, so v2 starts with true history; its SECURITY INVOKER reader counts only what the viewer's RLS shows (co-members lose `decision_events`, 00584; SMS inbound only) and never prints "nothing new".

**Seam.** The briefing-data §3 draft, changed three ways: `engagement_key` with `user_id DEFAULT auth.uid()`; **SECURITY INVOKER** with one `FOR ALL` own-row policy and `GRANT SELECT, INSERT, UPDATE TO authenticated`; the key goes through the chain (`00590:62,224`) under the caller's RLS, so there is no linkage oracle:

```sql
v_key := coalesce((SELECT coalesce(pr.parent_proposal_id, pr.id) FROM proposals pr
  WHERE pr.id = p_route_id OR pr.project_id = p_route_id ORDER BY pr.created_at, pr.id LIMIT 1), p_route_id);
```

The hook is `src/hooks/use-mark-arrival.ts`, untyped like `use-desk-engagements.ts:58`, so no type regen is needed. Grants go into `seed/00-legacy-grants.sql`.

**Verify.** `supabase migration up && psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/arrival_anchors.sql`. It checks:

- two desk upserts leave one row (NULLS NOT DISTINCT)
- a reload keeps `previous_seen_at`
- the proposal id and the project id give the same key
- user B cannot see A's row, and anon cannot execute

**Cost.** S.

**Forecloses.** The v1 "since".

## S3: port and mount

**Decision.** The code is portal-local, since there is one consumer. It lives in `src/lib/arrival/{types,gate,brief,engine}.ts` and `arrival.css`. `components/document/arrival.tsx` is mounted after `{children}` in `(document)/layout.tsx:91-134`.

Deltas from the mockup: (1) `busy()` = `[role="dialog"]` (sheets; `WelcomeModal.tsx:249`, `TourController.tsx:652`) or `[data-shelf-open]` (`page.tsx:2796`) or `isEditableTarget(activeElement)` (`use-lens-state.ts:81`) or a selection; (2) listeners on `window` capture, Escape `stopPropagation`s so the bubble put-down (`page.tsx:1370-1389`) never fires mid-flight; (3) `collect()` walks the `[data-arrival]` root, not `body`; (4) `view()` subtracts `[data-testid="mobile-bar"]`; (5) FACES = `getComputedStyle(node).font` of H and each card line (the hashed next/font family in use) into `document.fonts.load`, where exporting fonts would mean moving `app/layout.tsx:9-27`; (6) `VISIT` imports `VISIT_GAP_MS` (`lib/teaching/constants.ts:15`); (7) replay, `.mc`, `?rm` and `?scale` go.

`gate()` is pure and the visit writes move into `start()`, so the StrictMode double effect re-gates identically. The cleanup calls `finish()` and unwires.

**Verify.** `pnpm --filter @patina/designer-portal type-check && … lint && … test -- src/lib/arrival`.

**Cost.** M.

**Forecloses.** Client-portal reuse without a later lift.

## S4: hide, ready, budget

**Decision.** There is no pre-paint script, and `'unsafe-inline'` goes unused. The resting roots mount only after client data arrives, which is always after hydration. Until then the page shows its own loading tree.

The gate runs in `useLayoutEffect`. When it may play, it adds `html.arr-pre`, which hides **only** `[data-arrival]`:

- the Desk `<main>` (`desk/page.tsx:328`), marked only when it is not loading
- the Document shell (`page.tsx:2738`)

So the loading trees, CommandBar, MobileBar and TesterWidget stay visible.

**Ready** = the root is present, `useIsFetching()===0`, and 200 ms pass with no root mutations (so `ticketRows` and the enriched needs have settled the band). **Budgets:** entry to ready ≤ 8,000 ms; ready to start ≤ 300 ms for fonts and the `--arr-ok` sentinel; total hidden ≤ 1,200 ms behind a safety timer. Any non-Tab input, or `document.hidden`, first declines.

On a cold 2–4 s read she sees the greeting, the date and three skeleton bars (`desk/page.tsx:305-349`), or "Picking up…" (`page.tsx:2426-2434`). Then a bare-paper breath of about 250 ms under unchanged chrome, then the card. The mockup's replay accepts the same cut (`arrival.js:898-905`). The morning open is a new visit, so it plays.

```css
html.arr-pre [data-arrival]{opacity:0}
html.arr-pre [data-arrival],html.arr-pre [data-arrival] *{animation-play-state:paused!important}
```

**Verify.** `pnpm --filter @patina/designer-portal exec playwright test --config playwright.arrival.config.ts -g "cold|soft|budget"`.

**Cost.** S.

**Forecloses.** Arrivals after reads slower than 8 s.

## Play matrix

| Entry | Desk | Document | Budget / what she sees |
|---|---|---|---|
| Hard load (sign-in `location.replace`, bookmark, reload) | **plays** on the first Desk of the visit; otherwise **declines** | **plays**; `back_forward` **declines** | ≤8 s skeleton or "Picking up…", then ≤1.2 s of paper |
| Soft entry (`next/link`, put-down push) | **plays** if the Desk is unshown this visit, else **declines** | name link **plays**; act click **declines** | warm: about 250 ms of paper |
| `router.replace` (proposal to project, `page.tsx:1266-1271`) | none | **declines** (`markLanding`) | ordinary page with `doc-raise` |
| popstate / BFCache | **declines** (popstate <1 s) / **suppressed** | same | page as left |
| Query change, same pathname | **suppressed** (mid-flight: MO, then `finish()`) | same | none |
| Query or hash at entry | **declines** | **declines** | ordinary page |

## S4b: addresses that decline

**Decision.** Any query string or hash at entry declines. That covers:

- `DOORWAY_KEYS` (`desk-doorway.tsx:83-97`), including Stripe's `?book=orders&checkout=success`
- `?tour=` (`desk-walkthrough.tsx:376`)
- the authorization hop's `/doc/{id}?authorization=…` (`desk-doorway.tsx:143-150`)
- `?ffeItemId=` (`page.tsx:1102-1106`) and `?sheet=call` (`:1236`), both read from `window.location`
- `?arrive=0`, kept as a test seam only

On these routes the only `useSearchParams` consumers are `DeskDoorway` and `DeskWalkthrough`; the gate reads `location.search` in a layout effect, before `DeskDoorway` erases it. `callSheetPending.value` (`page.tsx:1227`) also declines.

**R-DM21.** A capture click listener in `arrival.tsx` watches unmodified clicks on `[data-claim-card] [data-register="act"] a[href^="/doc/"]`. It writes `pl-land={id,at}`, which the Document gate consumes within 5 s. There is no new landing call: the destination stays today's (`desk-roster-derivation.ts:395-402`), whose band prints the need and act at the top. Name links write `pl-arrive` verbatim.

**Verify.** `test -- src/lib/arrival/__tests__/gate.test.ts` (a URL table) and Playwright `-g decline`.

**Cost.** S.

**Forecloses.** A scroll to the record, deferred.

## S5: assembly and precedence

**Decision.** The assembly field is the root. On the Document that is the spine plus the paper: letterhead, band, rule region and the **one** `[data-active-section]` (`page.tsx:2939`). Everything below the fold is final from frame 0. `seen()` already respects the spine's overflow, and `html.arr-on body{overflow-x:clip}` outranks `globals.css:1555`.

`start()` sets `data-arr-played` and swaps `arr-pre` for `arr-on` in one task, *before* measuring. That kills the paused `doc-raise` scale, which would otherwise skew the rects by 1.4%. One MutationObserver on the root (subtree) and one on `body` children (portals, excluding `[data-arr]`) call `finish()`. That covers the 60 s refetch (`use-desk-engagements.ts:179`), sheets and toasts. An unchanged refetch mutates nothing.

**Precedence**, highest first: `[role="dialog"]` (sheets, walkthrough, ceremony overlay) → the arbiter's `aside[role="note"]` (`margin-note.tsx:265-266`, `desk-arbiter.tsx:149-161`; declines at ready, finishes mid-flight, so teaching keeps its visit) → `markSealTurn`'s redirect (declines) → Match Ceremony (`/ceremony/*`, outside the filter; `arrival-arc` never reused) → the arrival → `desk-settle`/`doc-raise` (`globals.css:288,447-458`), the decline path, replaying from the start once unpaused.

```css
[data-arrival][data-arr-played],[data-arr-played] .desk-settle{animation:none!important}
```

**Verify.** Playwright `-g "assemble|escape|mutation"`.

**Cost.** S.

**Forecloses.** An arrival that coexists with a teaching note.

## S6: phone and put-down

**Decision.**

- **Phone:** the mockup's `plan()` verbatim (s=1, flush-left, 16px gutter at ≤760); `readingY` drops `.spine` (bar=0, the MobileBar sits at the bottom, `mobile-bar.tsx:289`, and `view()` subtracts it); the crown is `[data-letterhead-mark]` since the rail is `hidden` below 1180 (`doc-spine.tsx:140`); scroll is native after Act 3.
- **Put-downs:** all three (`page.tsx:1386`, `doc-spine.tsx:147-156`, `mobile/mobile-sheets.tsx:604-607`) `router.push('/desk')`, which is a Desk entry and usually same-visit. `pl-from-doc` is not ported.
- **Timezone:** the engine prints no dates. Every date is the page's, in browser-local time (`desk/page.tsx:178-180`).

**Verify.** Playwright `-g phone`.

**Cost.** S.

**Forecloses.** Nothing.

## S7: verification

**Decision.**

- **jest** covers `gate` and `brief` only.
- **Existing specs:** the gate declines under `navigator.webdriver` unless `sessionStorage['pl-e2e-arrive']==='1'`. That means zero edits to the 36 specs and to `playwright.config.ts`, whose edits trip the secret scan (`playwright.hours.config.ts:14-19`). The trade-off is that any automation sees the ordinary page.
- **Arrival lane:** `playwright.arrival.config.ts` extends the base the way the hours config does. It runs on port 3100 with `next build --webpack && next start -p 3100`, the loopback trio from `supabase status -o env`, and an opt-in `addInitScript`.
- **Specs:** mockup B1–B6 and B9–B13 as written; B7 as an injected `:root{--arr-ok:0}`; B8 as the safety timer with `fonts.load` never resolving. New: P1 warm soft entry plays; P2 cold Desk plays (fresh context, REST delayed 2.5 s); P3 Escape in compose stays on `/doc`; P4 the decline matrix; P5 a mid-hold mutation finishes with no inline transforms left.
- **Seed:** `designer@patina.dev`, project `b0000000-0000-0000-0000-0000000000d1` (a decision 3 days overdue, `seed/decisions.sql:4-25`) gives a claim card and a standing line; assertions compare rendered text.

**Verify.** `pnpm --filter @patina/designer-portal test:e2e -- --config playwright.arrival.config.ts`, plus the legacy set `test:e2e -- --project=chromium $(grep -rlE "/(desk|doc/)" apps/designer-portal/e2e)`.

**Cost.** M.

**Forecloses.** Arrival coverage inside the legacy specs.

## S8: rollout without a flag

**Decision.**

- **W0** reserves 00675; locally, `supabase migration up`, never a reset.
- **Before the push**, `supabase migration list --linked` must show only 00675 pending. Then `supabase db push --linked --include-all`; the stray `20260910152111_*` sorts after 00675.
- **Portal:** export the trio from `apps/designer-portal/wrangler.jsonc` in the same shell, then `./infra/deploy-portal.sh designer`.
- **Probe:** `npx wrangler deployments list --name patina-designer-portal` (bottom row); curl `/desk` and grep served CSS for `--arr-ok`, JS for `document_arrival_ended`; Kody's signed-in walk.
- **Rollback:** redeploy the prior SHA. The migration is additive and stays.
- **Telemetry:** `documentEvents.arrivalEnded({surface, how})` (`document-events.ts:329`), how ∈ skip/timer/key/pointer/focus/decline, only for started or guard-declined arrivals; no duration, no reason.

**Verify.** The probe above.

**Cost.** S.

**Forecloses.** Per-reason decline diagnosis in production. The reason stays on local `html[data-arr-why]`.

## Piece split

**W0 (orchestrator).** Check `df -h` for at least 45 GiB and the worktree count. Commit the 00675 reservation. Run a read-only `migration list --linked`.

**W1 (one worktree, Haiku).** Inert on its own. Pathspecs, all under `apps/designer-portal/src/`:

- `lib/arrival/types.ts`
- `lib/arrival/landing.ts`
- `app/(document)/desk/page.tsx`
- `app/(document)/doc/[id]/page.tsx`
- `components/document/{desk-roster,doc-letterhead,letterhead-vitals}.tsx`

Verify: `type-check && test -- --findRelatedTests <files>`.

```ts
// types.ts: FROZEN at W1 merge. A change needs an orchestrator re-freeze.
export type ArrivalSurface = 'desk' | 'doc';
export type ArrivalEnd = 'skip' | 'timer' | 'key' | 'pointer' | 'focus' | 'decline';
export type DeclineReason =
  | 'query' | 'hash' | 'history' | 'landing' | 'same-visit' | 'automation' | 'input'
  | 'hidden' | 'late' | 'busy' | 'note' | 'no-headline' | 'budget' | 'sentinel' | 'fonts' | 'geometry';
export interface ArrivalEntry { surface: ArrivalSurface; routeId: string | null; at: number; hard: boolean }
export interface ArrivalStore { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void }
export interface GateInputs {
  entry: ArrivalEntry; search: string; hash: string; navType: string | null;
  popAgoMs: number; webdriver: boolean; callSheetPending: boolean; store: ArrivalStore; now: number;
}
export type GateResult = { play: true; kbd: boolean } | { play: false; why: DeclineReason };
export interface Brief {
  surface: ArrivalSurface; place: string; headline: string; facts: string[];
  warn: number; act: string | null; job: string | null;
}
export interface BriefNodes {
  headline: HTMLElement; act: HTMLElement | null; job: HTMLElement | null; factSources: HTMLElement[];
  head: HTMLElement | null; crown: HTMLElement | null; name: HTMLElement | null; stage: HTMLElement | null;
}
export type ReadBrief = (root: HTMLElement, surface: ArrivalSurface)
  => { brief: Brief; nodes: BriefNodes } | { why: DeclineReason };
export interface ArrivalEngine {
  start(root: HTMLElement, brief: Brief, nodes: BriefNodes,
        opts: { kbd: boolean; onEnd: (how: ArrivalEnd) => void; onDecline: (why: DeclineReason) => void }): void;
  finish(): void; // idempotent: restores inline styles, unwires listeners
}
export type MarkArrival = (scope: 'desk' | 'document', routeId: string | null) => void;
```

**W2 (three worktrees).**

- **A (Sonnet).** Pathspecs:
  - `supabase/migrations/00675_arrival_anchors.sql`
  - `supabase/tests/arrival_anchors.sql`
  - `supabase/seed/00-legacy-grants.sql`
  - `apps/designer-portal/src/hooks/use-mark-arrival.ts`

  Consumes `MarkArrival`. Verify: the S2 command and `type-check`.
- **B (Opus).** Pathspecs: `apps/designer-portal/src/lib/arrival/{gate,brief,engine}.ts`, `arrival.css`, `__tests__/*`. Consumes all the types except `MarkArrival`. Verify: the S3 command.
- **C (Sonnet).** Pathspecs:
  - `apps/designer-portal/src/components/document/arrival.tsx`
  - `src/app/(document)/layout.tsx` (two lines)
  - `src/lib/analytics/document-events.ts`

  Consumes `ArrivalEngine`, `ReadBrief`, `MarkArrival`. Verify: `type-check && lint && test -- --findRelatedTests`.

**W3 (integrated branch).**

- Sonnet writes `playwright.arrival.config.ts` and `e2e/arrival/*`, and runs S7.
- A separate Opus context does the adversarial review.

**W4.** S8, gated on a clean review and a green lane.

## Refuse to ship without

1. Legacy specs green: the S7 grep run.
2. Plays warm-soft and cold under `next start`: P1/P2 assert `html.arr-on`, a visible `.arr-card`, no `data-arr-why`.
3. Escape in compose stays on `/doc/{id}`: P3.
4. Failure is the ordinary page: B7–B9 reach root opacity 1 within 1.2 s of ready.
5. Mid-flight mutation finishes cleanly: P5.
6. Anchor correct: `arrival_anchors.sql` (one desk row, one chain key, RLS).
7. Only 00675 pending: `migration list --linked`.
8. Lane build never touched Strata: `grep -rl bkvcixdmuyejfzcijpdg apps/designer-portal/.next/static` empty.
9. One announcement under reduced motion: B11/B12.

## Design-reopen evidence

- The 16px band sentence (`lens-band.tsx:266`) looks soft laddered, or fits under ~30px at 1440: reopen the S1 Document headline.
- Paper breath over 400 ms warm, or Leah finds the skeleton-to-card cut jarring: reopen S4.
- Ready never settles on a real studio, so `late`/`decline` dominates week one: reopen S4 with a page-owned ready prop.
- Leah expects an act to land on its record: add `pl-land.region` → `jumpToRegion` (`page.tsx:1837-1844`).
- Kody wants F2 in v1: needs an at-rest since line plus the reader (a non-goal breach).
- A `PARTS` attribute is renamed past `brief.test`: switch to `data-part` marks.
