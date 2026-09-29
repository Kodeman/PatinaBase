# Arrival → production: the risk-first proposal

Designer 3 of 3 · 2026-09-27 · read-only against `7dbd203bc`. Paths are under `apps/designer-portal/src/` unless rooted.

## 1. Spine

Every designer gets this on first deploy, and the only lever is a 15–25 minute redeploy. So every uncertain path falls back to **today's page, unchanged**, and never to a hidden, stuck or false page. Four choices make that true:

- **The card lifts its text from the page.** T3 therefore holds by construction, with one ranker per surface.
- **Card parts are clones in a fixed layer.** The page's React nodes in sticky, `aria-live` or ellipsis containers never move.
- **Only the route root hides, and only once its data is ready.** The chrome and the ordinary loading state stay visible.
- **F2 only claims presence, never absence.** Thinner RLS shortens the line; it never makes it false.

The blast radius equals "it did not play". A lane then proves that it *plays*.

## 2. Seams

### S1 · Headline: lift from the page

**Decision:** option (a). The card copies each surface's existing winner:

- **Desk:** the top Claim card's sentence, from `deriveDeskClaims` (`lib/document/desk-roster-derivation.ts:739-744`).
- **Document:** LensBand line 2, from `rankOperationalNeeds` (`app/(document)/doc/[id]/page.tsx:1027-1033`), or the guide headline for non-projects (`:2216-2234`).

The 19 `NeedKind`s never reach the engine, and `NEED_RANK` is not ported.

**Seam:** `data-part` marks only; nothing is restyled at rest.

| part | Desk | Document |
|---|---|---|
| headline | first card `[data-register="sentence"]` (`components/document/desk-claim-card.tsx:170-181`) | `[data-lens-sentence]` (`components/document/lens-band.tsx:273-282`) |
| act | card act (`desk-claim-card.tsx:183-205`) | band act (`lens-band.tsx:283-301`) |
| name / head | `[data-roster-name]` (`:145-154`) / Desk h1 (`app/(document)/desk/page.tsx:333-347`) | letterhead h1 / header (`components/document/doc-letterhead.tsx:65-83`) |
| f1, f3 | day-lines 2–3 (`components/document/desk-roster.tsx:302-329`) | vitals (`doc-letterhead.tsx:99-104`), custody |
| f2 | new `<p data-day-line="since">` | new `<p data-since>` under vitals |
| warn | `overdueLine` (`desk-roster.tsx:293-295`) | — |
| stage, crown | — | `<p data-spine-stage-phrase>`, not the L-6 span (`components/document/doc-spine.tsx:210-251`); `[data-spine-mark]` (`:200-208`), then letterhead StrataMark (`doc-letterhead.tsx:67`) |
| settle | claims grid (`desk-roster.tsx:384-389`) | active section (`page.tsx:2939-2957`) |

**Rules:**

- **R2/R5.** The page prints `Overdue {phrase} — {text}` (`desk-roster-derivation.ts:412-415`). Past 8 words, the headline is `text` alone and "Overdue N days" moves to F3. Both remain substrings of the page.
- **R1 and R3/R4.** Lifted as printed, with no act for R3/R4 (`desk-roster.tsx:402-409`).
- **DOORWAY.** Acts that fail it ("Send reminder", `lib/document/desk-derivation.ts:141-161`) are left off the card.

**Verify:** `pnpm --filter @patina/designer-portal test -- src/lib/arrival/__tests__/lift`, plus Playwright T3. **Cost:** M. **Forecloses:** card text the page does not print.

### S2 · Since line and anchor

**Decision:** SELECT on mount; `mark_arrival` after settle, on any end. An RPC on the critical path adds a cold-Strata write to the wait, and a failed write would decline the arrival.

**Reader scope in v1:**

- **In:** `decision_events`; non-system `comms_messages`; `project_notes.answered_at`, using the Desk's existing "replied" phrase (`desk-roster-derivation.ts:567-646`); and the client-side "fell overdue" pulse.
- **Out:** `sms_messages` (`party_id` is not a user id), and schedule, PO and invoice changes (no actor).

**Degradation.** The reader is INVOKER, so co-members (00584:100-105) see fewer rows, and every row is true. **"Nothing new since …" and "First visit" are never printed:**

- "Nothing new" is an absence claim that no v1 reader backs.
- On day one nobody has an anchor, so "First visit" would be false on every running job.

When F2 is unproven it is omitted, and the next fact closes up.

**Seam:** `supabase/migrations/00675_arrival_anchors.sql`. It extends the draft in `research/briefing-data.md` §3 with:

- `arrival_chain_key(uuid)`: returns `coalesce(parent_proposal_id,id)` of the proposal whose `project_id` matches, else the input. This matches `chain_root_id` (00590:224,292), so signing keeps "since".
- `arrival_anchor(p_scope text, p_engagement_id uuid) RETURNS TABLE(since timestamptz)`: DEFINER, caller-only, and it never returns the key. It returns `previous_seen_at` inside 30 minutes, else `seen_at`.
- `arrival_changes(p_scope, p_engagement_id, p_since) RETURNS TABLE(kind, at, actor_name, subject)`: INVOKER, `actor <> auth.uid()`, `LIMIT 12`, `statement_timeout 300ms`.

Hooks: `packages/supabase/src/hooks/use-arrival-anchor.ts`. The since row joins ready (≤ 600 ms); if late it is omitted, never inserted afterwards (no layout shift).

**Verify:**

- `supabase migration up`
- `supabase test db supabase/tests/document/arrival_anchors_test.sql`: owner-only reads, the desk `NULLS NOT DISTINCT` arbiter, the 30-minute window, proposal→project continuity, co-member truth
- `pnpm --filter @patina/supabase type-check && pnpm --filter @patina/supabase test`

**Cost:** M. **Forecloses:** absence claims, and SMS.

### S3 · Port and mount

**Decision:** a typed near-verbatim port in `lib/arrival/`, portal-local.

`components/document/arrival/arrival.tsx` mounts in each route root. `arrival-nav.tsx` sits beside `<Providers>` (`app/layout.tsx:77-81`); its first mount means a hard load.

**The one deviation.** `put()`, `run()` and `flight()` target clones of the card parts, pinned `position:fixed` at each part's rect r1 in an `aria-hidden` `[data-arr-layer]`. The transforms are already relative to r1, so the math is unchanged; page-node opacity is held inline and restored on landing (arrival.js:720-736). This avoids the sticky, clipped, live band (`lens-band.tsx:38,208-217,261-271`) and the spine scroller (`doc-spine.tsx:134-140`). Field parts stay page nodes.

**Headline.** Set in the mockup's Playfair on an absolute ladder `[56,44,34,28]` px (≤ 2 lines, ≤ 640 px; else decline `unmeasurable`), because the carrier's 15–16 px forces s = 1. It lands with a 120 ms crossfade, since the wrap differs.

**Host:**

- **`busy()`** is true for any of: `[role="dialog"]`; `isEditableTarget` (`hooks/use-lens-state.ts:81`); `openShelf` (`page.tsx:1140`); an open DeskWalkthrough; the arbiter lines `hire-handoff`, `desk-first-touch` and `desk-walkthrough-offer` (`desk/page.tsx:218-303`); a visible teaching note.
- **Listeners:** window capture, with `unwire()` on unmount or pathname change.
- **Escape:** `stopPropagation`. This beats React's `document` listeners and the put-down listener, which runs on `document` bubble (`page.tsx:1370-1388`).
- **`data-arr-skip`:** TesterWidget, DebugPanel and toasts.
- **Chrome** (`app/(document)/layout.tsx:92-134`): finishes the arrival, and the click is not swallowed.
- **StrictMode:** `gateFor(navKey)` is memoised, and cleanup is a write-free `finish('unmount')`.
- **Fonts:** `FACES` is built from the first family of next/font `.style.fontFamily`. The fonts move to `app/fonts.ts` (from `app/layout.tsx:9-28`).
- **CSS:** `arrival.css` is imported by `app/(document)/layout.tsx`, which provides `--arr-ok`.

**Verify:** `… test -- src/lib/arrival/__tests__/(gate|faces)`, `type-check`. **Cost:** L. **Forecloses:** page-node flight for card parts.

### S4 · Hide, ready, budget

**Decision:** no inline head script. `data-arr-pre` is set in a `useLayoutEffect` on the commit that first mounts the content, so it applies before paint. It goes on the Desk `<main>` (`desk/page.tsx:328`) or the Document grid (`page.tsx:2738-2745`), never on `<body>`.

**Ready** means all of these:

- **Desk:** the first non-placeholder `useDeskEngagements` success.
- **Document:** `lensLineSettled` (`page.tsx:2383-2389`, which covers the tier fix at `lens-band.tsx:129-158`), plus settled enrichment where it applies (`page.tsx:993-1014`).
- **Since row:** in (≤ 600 ms).
- **Marks and fonts:** marks mounted, and `fonts.load(FACES)` within **300 ms of ready**.

**Budget:** hard entries must be ready ≤ 8 s from `timeOrigin`; soft entries ≤ 4 s from the pathname commit. An advancing input or a hidden tab while waiting declines.

| Entry | Desk | Document |
|---|---|---|
| Hard load (sign-in `location.replace`, `app/auth/signin/page.tsx:82,258`; bookmark; refresh) | **Plays** on the first open of a 30-min visit (8 s); after that it declines. While waiting: chrome and the 3-bar skeleton (`desk/page.tsx:305-318`), then ≤ 300 ms of bare route paper. | **Plays** (8 s), refresh included. While waiting: chrome and "Picking up…" (`page.tsx:2426-2432`). |
| Soft entry (link, ⌘K, put-down) | **Declines**: the visit is spent. The first Desk of a visit, arriving from another group, **plays** (4 s). | **Plays** (4 s); an act-token click **declines**. |
| `router.replace` | **Suppressed** (DeskDoorway) | **Suppressed**: seal turn and `authorizationDoorway` (`page.tsx:1266-1279`) |
| popstate / BFCache | **Declines** | **Declines** |
| Query change | Nothing (no remount) | Nothing (`key={id}`, `page.tsx:899-915`) |

`suppressNextArrival(path)` precedes the three replaces; an unknown replace plays (a nuisance, never a hidden page).

**Verify:** Playwright `cold-desk` delays `**/rest/v1/**` 3 s; asserts skeleton and CommandBar visible while waiting, then the card plays. **Cost:** M. **Forecloses:** a hidden `<body>`.

### S4b · Addresses that decline

**Decision:** an allow-list. The arrival plays only on an empty search and hash, or the e2e opt-in `?arrive=1`. That covers:

- the DeskDoorway params `book`, `sheet`, `account`, `checkout` (including the Stripe `?book=orders&checkout=success`), `authorization`, `projectId`, `page`, `vendorId`, `invoiceId` (`components/document/desk-doorway.tsx:136-173`)
- `?tour=` (`components/document/help/desk-walkthrough-gate.ts:15-18,129-134`)
- `?sheet=call` (`page.tsx:1236`)
- `?ffeItemId=` (`page.tsx:1102-1106`)
- any future consumer

**R-DM21 token:**

1. A window-capture click on `[data-register="act"] a[href^="/doc/"]` stores `sessionStorage['pl-act']={path,kind,at}`. The kind comes from a new `data-need-kind` on the card (`desk-claim-card.tsx:91-98`).
2. The gate honours the token only on the same path and within 5 s. It then declines and calls the band act's own landing: `jumpToRegion`, `landOnFfeAnchor` or `jumpToSection` (`page.tsx:1160-1201,1837-1886`), else the top.
3. A refresh never inherits it.

**Verify:** a jest `gate` table covering every address, plus a Playwright act-click landing. **Cost:** S. **Forecloses:** arrivals on tagged links.

### S5 · Landing geometry and precedence

- **`collect()`:** walks the children of `[data-document-paper]` (`page.tsx:2793-2957`) or of the Desk `<main>`. It skips sticky and fixed nodes, and caps at 12 on desktop and 8 on phone.
- **`readingY`:** `max(bottom of [data-lens-band], top MobileBar) + 16`.
- **Crown:** the first *visible* mark, since the spine is hidden below 1180 px. The clone strips `doc-breath` and gets new `.arr-crown` rules for the span mark (`components/document/strata-mark.tsx:92-125`).
- **Mid-flight re-render:** a MutationObserver (`childList`, `characterData`, `subtree`) on part nodes and the field calls `finish()` (cause `mutation`). Mandatory: the 60 s refetch (`hooks/use-desk-engagements.ts:179,183`) also runs on Documents via enrichment; an identical refetch mutates nothing.

**Precedence (first match wins):**

1. Address or act-token decline.
2. Seal-turn replace.
3. DeskWalkthrough or a busy arbiter line (R-DM7 A).
4. A due teaching note.
5. Otherwise the arrival **replaces** `desk-settle` (`desk-roster.tsx:70-80`, `desk-claim-card.tsx:96`) and `doc-raise` (`page.tsx:2745`), using `animation:none` under `arr-*` and consuming `settledOnce`. Declines keep today's motion.

`arrival-arc` (`/ceremony/*`) never collides; the name is never reused.

**Verify:** Playwright checks that Escape mid-hold keeps `/doc/{id}`, and that a carrier mutated mid-hold leaves no `arr-*` class or inline transform. **Cost:** M. **Forecloses:** stacked entry moves.

### S6 · Phone, put-down, timezone

- **Phone:** flush-left with s = 1, and no stage part when the spine is hidden. After Act 3, touch-scroll is native: no `touch-action`, and `overflow-x:clip` goes on the route root, not `body` (`app/globals.css:1555-1562`).
- **Put-down:** the spine (`doc-spine.tsx:147-156`), mobile (`components/document/mobile-sheets.tsx:606-610`) and Escape all write `pl-from-doc`. The Desk scrolls to `rosterLineAnchorId` (`desk-claim-card.tsx:91`).
- **Timezone:** `today` is browser-local. No studio zone exists (`fmtDayTime` takes the ceremony's zone, `desk-derivation.ts:522`); `parseDue` is local (`lib/document/overdue-condition.ts:23-29`).

**Verify:** jest one-day-later under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`, plus Playwright `mobile-chrome`. **Cost:** S. **Forecloses:** a studio-zone "today".

### S7 · Verification lanes

**jest** (`package.json:18`) covers `gate`, `lift`, `since`, `presentation` and `faces`. jsdom has no `animate`.

**The 36 existing specs.** Decline under `navigator.webdriver` unless `sessionStorage['pl-arrive-e2e']='on'`: zero spec edits; the trade-off is that automation sees it only when opted in.

**Arrival lane.** `playwright.arrival.config.ts` imports the base config and overrides `testDir: './e2e/arrival'`, `webServer.command: 'pnpm exec next start -p 3107'` and `baseURL`. It adds `mobile-chrome` and copies no keys (the secret-scan trap).

**Specs.** B1–B13, plus warm soft entry plays, cold Desk plays, Escape, mutation, act-token, addresses, T3.

**Seed:**

- `seedWorkflowGateFixture()` (`e2e/document/desk-claims.spec.ts:9,29`) gives a Desk claim and a Document need.
- `LONG_PAPER_ID` (`e2e/document/lens-fixtures.ts:18`).
- For F2: a `psqlRun` anchor at `now() - 2 days`, plus a later `answered_at`.
- The co-member case is pgTAP only.

**Commands** (local trio exported, run in `apps/designer-portal`):

1. `next build --webpack`
2. `pnpm exec playwright test -c playwright.arrival.config.ts`
3. `next start -p 3000`, then `pnpm exec playwright test --project=chromium e2e/document` (it reuses the server; never `next dev`)

**Cost:** M. **Forecloses:** dev-server lanes.

### S8 · Rollout without a flag

**Preflight:**

- Reserve 00675 in `docs/engineering/migration-number-reservations.md`.
- `supabase migration list --linked` must show only 00675 pending; push with `--include-all` because of the stray `20260910152111_*`.
- Record the prior version: `npx wrangler deployments list --name patina-designer-portal`, bottom row.
- Stage a rollback worktree at the pre-merge SHA, installed.
- `df` must show room for at most two worktrees at ship.

**Ship:**

1. `supabase db push --include-all`.
2. Export the trio and `SUPABASE_ORIGIN_RUNTIME` from `wrangler.jsonc` in the same shell, then run `./infra/deploy-portal.sh designer`.
3. Probe: deployments bottom row; chunk grep `arr-ok`, no `127.0.0.1`; a signed-in Chrome walk.

**Rollback:**

- **Portal:** redeploy from the staged worktree: ~15–25 min of every designer seeing the fault, which is the whole cost. `wrangler rollback` only if verified live this session.
- **Database:** 00675 is additive and stays.
- **Client state:** the `pl-*` keys are inert.

**Telemetry:** one event, `arrival_ended {surface, reason: skip|timer|key|pointer|focus|decline, cause?}`, with no durations. `cause` (closed enum) is the only prod evidence of a silent decline. The zone-flight clock (`page.tsx:1294-1351`) starts at arrival end.

**Cost:** S. **Forecloses:** an in-product kill switch.

## 3. Piece split

**W1** (one worktree, Opus): `apps/designer-portal/src/lib/arrival/types.ts` and the 00675 reservation. Verify with `type-check`. Frozen text:

```ts
// FROZEN at W1 — B and C consume, W3 wires. Changing it reopens both.
export type Surface = 'desk' | 'document';
export type Part = 'headline' | 'act' | 'act2' | 'f1' | 'f2' | 'f3' | 'name' | 'stage'
  | 'crown' | 'job' | 'warn' | 'head' | 'settle';
export type EndReason = 'skip' | 'timer' | 'key' | 'pointer' | 'focus' | 'decline';
export type DeclineCause = 'address' | 'act-token' | 'pop' | 'replace' | 'visit-spent'
  | 'busy' | 'input-while-waiting' | 'budget' | 'fonts' | 'sentinel' | 'unmeasurable'
  | 'mutation' | 'unmount' | 'automation';
export interface Entry {
  kind: 'hard' | 'soft' | 'pop' | 'replace';
  at: number;               // 0 on hard load, else performance.now() at pathname commit
  path: string; search: string; hash: string;
}
export interface ActToken { path: string; kind: string; at: number }
export interface SinceChange {
  kind: 'decision' | 'message' | 'reply' | 'pulse';
  at: string; text: string; needKind: string | null;
}
export interface Briefing {          // lifted from the DOM; every string is printed at rest
  surface: Surface;
  rule: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'Desk';
  place: string; headline: string;
  act: { label: string } | null;     // null when DOORWAY fails or quiet
  facts: string[];                   // ≤ 3, slot order; f2 omitted when unproven
  message: string;                   // the one polite SR string
}
export interface GateResult { play: boolean; cause?: DeclineCause }
export interface Host {
  busy(): boolean; reducedMotion(): boolean; readingY(): number;
  faces: readonly string[];
  onEnd(reason: EndReason, cause?: DeclineCause): void;
}
```

**W2** runs three parallel worktrees. None of them runs `next build`.

| Piece | Owns | Verify | Model |
|---|---|---|---|
| A · DB + hooks | `supabase/migrations/00675_arrival_anchors.sql`, `supabase/tests/document/arrival_anchors_test.sql`, `supabase/seed/00-legacy-grants.sql`, `packages/supabase/src/hooks/{use-arrival-anchor,index}.ts`, `packages/supabase/src/database.types.ts` | S2 commands | Sonnet |
| B · engine | `apps/designer-portal/src/lib/arrival/{gate,nav,engine,plan,input,faces}.ts`, `…/arrival/arrival.css`, `…/arrival/__tests__/{gate,nav,faces}.test.ts` | `test -- src/lib/arrival/__tests__/(gate\|nav\|faces)`, `type-check`, `lint` | Opus |
| C · lift + since + analytics | `apps/designer-portal/src/lib/arrival/{lift-desk,lift-document,since,presentation}.ts`, `…/__tests__/{lift,since,presentation}.test.ts`, `apps/designer-portal/src/lib/analytics/arrival-events.ts` | `test -- src/lib/arrival/__tests__/(lift\|since\|presentation)`, `type-check`, `lint` | Sonnet |

**W3** (one owner, Opus) owns:

- `app/layout.tsx` and `app/fonts.ts`
- `app/(document)/layout.tsx`, `desk/page.tsx` and `doc/[id]/page.tsx`
- `components/document/{desk-roster,desk-claim-card,doc-spine,doc-letterhead,lens-band,desk-doorway,mobile-sheets}.tsx`
- `components/document/arrival/*`
- `playwright.arrival.config.ts` and `e2e/arrival/*`

Verify with `type-check`, `lint`, jest on the touched files, and the S7 commands.

**W4:** adversarial review in a separate context. Ship is gated on a clean review and a green lane.

## 4. Refuse to ship without

1. **A lane that proves it plays** (warm soft entry, 3 s cold Desk). Closes the silent fonts or sentinel decline.
2. **Escape mid-hold does not put down**, a mid-flight mutation leaves no `arr-*` class, transform or held opacity, and the chrome stays visible across compose. All three are closed by Playwright.
3. **T3 holds on both routes, and F2 never asserts absence.** Closed by jest and pgTAP, including the day-one and co-member cases.
4. **The 36 specs are green, unchanged,** under `next start`.
5. **The Stripe return does not play, and its sheet opens.** Closed by Playwright.
6. **Only 00675 is pending**, and it applies locally through `migration up`.
7. **The rollback worktree is staged** and the prior version is recorded.
8. **Local chunks contain no Strata origin**, so no local build writes anchors to prod.

## 5. Reopen evidence

- **The B-lane requires the page's own headline node to fly.** That cannot hold at a 15–16 px carrier; the typography reopens.
- **More than ~20% of live top sentences are `unmeasurable` at 28 px.** The copy or the carrier reopens.
- **`arrival_changes` takes more than 300 ms on Strata.** F2 would always be empty; a denormalised feed is needed.
- **Kody wants "First visit" or "Nothing new".** That needs backfilled anchors and a full-coverage reader.
- **`mark_arrival` write contention.** Move to an edge batch.
