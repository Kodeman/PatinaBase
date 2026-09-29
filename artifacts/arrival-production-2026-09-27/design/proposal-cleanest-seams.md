# Proposal: Cleanest Seams

**Path shorthand** (all under `apps/designer-portal/src/`):

| Shorthand | Path |
|---|---|
| `doc:` | `app/(document)/doc/[id]/page.tsx` |
| `desk:` | `app/(document)/desk/page.tsx` |
| bare component names | files in `components/document/` |
| `JS:` | the mockup's `arrival.js` |

## 1. Spine

**One Briefing, printed twice.** The arrival never ranks or rewords.

Two pure functions build it:

- `briefDesk` reads `deriveDeskClaims`.
- `briefDocument` reads `deriveLensBand`.

Both inputs are already pure over `document_state` rows. The resting page and the card print the same plain-JSON Briefing. The only new line at rest is the since line, which T3 needs.

A boundary test enforces four layers, each importing only from the layers above it:

1. `types.ts`
2. the pure `select` and `gate`
3. the DOM-only `engine`
4. the portal-coupled `host`, `inputs` and `<Arrival>`

So each future feature is a file move:

- **Per-need since feed:** reads `arrival_changes`.
- **Client-portal arrival:** moves layers 1–3 across with `git mv`.
- **iOS:** reads the same Briefing JSON.

None of these three ships now.

## 2. Seams

### S1 · Headline: lift the page's sentence (option a)

**Decision.** Each surface keeps its own ranker.

- **Desk:** `deriveDeskClaims` orders by band, then due date, then name (`lib/document/desk-roster-derivation.ts:709`).
- **Document:** band line 2 (`doc:2284`). It shows `redLetterRows` from `rankOperationalNeeds` (`doc:1770-1788`), or else the guide.
- **Dropped:** the mockup comparator and its 11 kinds. The 19 `NeedKind`s pass through opaque.

**Why the card can't disagree with the page:**

- **Same objects.** The Briefing consumes the page's own data. On the Desk that is `claims`, lifted from `desk-roster.tsx:220-228` into a `desk:` memo. On a Document it is the `bandModel` memo that LensBand gets (`doc:2868-2878`).
- **Checked at frame 0.** The engine compares each part with its marked node's text. Any mismatch declines as `drift`.

**Desk marks.** These go on claims 0–2 only, via an `arrPart` prop.

| Part | Where it points |
|---|---|
| `headline` | `desk-claim-card.tsx:170-181` |
| `job` | `desk-claim-card.tsx:145-154` |
| `stage` | `desk-claim-card.tsx:111-116` |
| `act` | `desk-claim-card.tsx:183-205` |
| `f1`, `f2` | claims 1–2, as `${name}: ${sentence}` |
| `f3` | the since line |
| `warn` | `desk-roster.tsx:293-295` |
| `head` | `desk-roster.tsx:268-272` |
| `settle` | `desk-roster.tsx:384-389` |

**Document marks.**

| Part | Where it points |
|---|---|
| `headline` | `lens-band.tsx:273-282` |
| `act` | `lens-band.tsx:283-301` |
| `name` | `doc-letterhead.tsx:76-86` |
| `stage` | `doc-spine.tsx:210` |
| `crown` | the rail (`doc-spine.tsx:200-207`) first, then the letterhead (`doc-letterhead.tsx:66-68`). On a phone, the letterhead is the one found. |
| `f1` | the vitals, `doc-letterhead.tsx:89-107` |
| `f2` | the since line |
| `f3` | none. Nothing at rest prints custody. |

**Rules.**

- **R5** comes from `deriveOverdue` (`lib/document/overdue-condition.ts:37-49`). R-DM24-A retemplates the page's own overdue text as `Overdue ${phrase}: ` (`desk-roster-derivation.ts:412-415`).
- **R2** is a standing row.
- **R1** is `row.is_paused` (`doc:313`).
- **R3** is the guide.
- **R4** on the Desk is `NOTHING_NEEDS_YOU` (`desk-roster-derivation.ts:800`). A Document whose line 2 is `none` declines as `no-sentence`.

**Verify:** `pnpm --filter @patina/designer-portal test -- src/lib/arrival`

**Cost:** M.

**Forecloses:** composed headlines, ranking by kind, and a third fact on the Document.

### S2 · Since line and anchor

**Decision.** The anchor ships (R-DM19 A). F2 only ever says something positive: "Since {weekday}: {change}." Otherwise it is omitted.

- It never says "First visit.", because every anchor is null on deploy day.
- It never says "Nothing new…", because co-members cannot see `decision_events` (00584).

At rest the page prints the same line as `[data-briefing-since]`:

- **Desk:** under the day line (`desk-roster.tsx:302-329`).
- **Document:** under the vitals.

**Seam: `supabase/migrations/00675_arrival_anchors.sql`.**

- **`arrival_anchors`** follows the `research/briefing-data.md` §3 draft, keyed `(user_id, scope, chain_key)`.
- **`arrival_chain_key(uuid)`** is STABLE and INVOKER:

  ```sql
  coalesce((select coalesce(parent_proposal_id,id) from proposals
            where project_id=$1 order by version desc limit 1), $1)
  ```

  Signing therefore keeps the anchor (`00590:62` vs `:224`).
- **`arrival_anchor(scope, engagement)`** is read at mount, in parallel with the page data.
- **`mark_arrival`** is SECURITY DEFINER. It runs after the run, off the critical path.
- **`arrival_changes(p_since, p_engagement_id)`** is INVOKER. It returns `(at, kind, need_kind, subject, by_viewer)` from:
  - `coordination_item_revisions`
  - `project_notes.answered_at`
  - `schedule_revisions`
  - `install_windows.confirmed_at`
  - `weekly_pulses`
  - `decision_events`

Comms and SMS are deferred: `party_id` is not a user id. "Fell overdue" is derived in `select.ts` (JS:106-109), and `select.ts` owns all the wording.

**Seam: hooks.** `packages/supabase/src/hooks/use-arrival-anchor.ts` exports `useArrivalSince()` and `useMarkArrival()`. If since is still unsettled when the page is ready, F2 stays off the card, and the resting line waits for the run to end.

**Verify:** `supabase migration up --local && supabase test db supabase/tests/document/arrival_anchors_test.sql`, then `pnpm --filter @patina/supabase test -- use-arrival-anchor`.

**Cost:** M.

**Forecloses:** "Nothing new", and comms or SMS as since sources in v1.

### S3 · Port and mount

**Decision.** A typed, near-verbatim port of JS:240-866 into `lib/arrival/`. `day()` uses local midnight.

**Fonts.** `next/font` moves from `app/layout.tsx:9-28` to `app/fonts.ts`. `faces` comes from `.style.fontFamily` (critique R13).

**Mount.** `components/arrival/arrival.tsx` mounts in `desk:` and in `DocumentPageBody`, which remounts per id (`doc:899-915`). It never mounts in the layout, which persists. The engine chunk is prefetched.

**Listeners.** They attach to `window` in the capture phase. During compose and hold, Escape is prevented, stopped and then advances. Capture runs before the `document`-bubble put-down (`doc:1370-1389`).

**StrictMode.** The visit stamp and the token are both consumed at frame 0, never at mount.

**`busy()`.** It is true when any of these holds:

- `[role="dialog"]` is open;
- `isEditableTarget` (`doc:1377-1378`);
- there is a selection;
- `extraBusy` is set: `openShelf` (`doc:1379`), or a walkthrough, first-touch or hire-handoff line from the Desk arbiter (`desk:218-303`).

**`data-arr-skip`.** This covers only TesterWidget and DebugPanel (`app/layout.tsx:77-81`). CommandBar (`(document)/layout.tsx:107`), LogStrip (`:92`) and MobileBar (`:123`) stay live and advance the arrival, never swallowed.

**Verify:** `type-check`, `lint`, and `boundaries.test.ts`.

**Cost:** L.

**Forecloses:** a package today.

### S4 · Hide and budget, with no inline script

**Decision.** She sees today's skeletons, with live chrome: the Desk rows (`desk:305-318`) or "Picking up…" (`doc:2426-2434`).

**Ready** means:

- **Desk:** `useDeskEngagements` has settled (`desk:73`) and the walkthrough offer has resolved (`desk:78`).
- **Document:** the row has resolved, plus the enrichment where it applies (`doc:993-996`).

**Hide.** In that commit, `useLayoutEffect` runs the gate. On a play it sets `arr-pre` on `[data-arr-field]`, never on `<body>`.

**Budgets.**

- **Fonts and rects:** 300 ms after ready, for the fonts plus two matching rAF rect reads. That is the most bare paper she sees.
- **Data:** a 5,000 ms ceiling, counted from `timeOrigin` on a hard entry or from the click token on a soft one. That covers a 2–4 s cold Strata read.
- **Past the ceiling:** declines as `late`, and the page's own entry move plays.
- **Hand input:** declines as `input`.

**Freeze.** `focusManager.setFocused(false)` pauses `refetchInterval` (`lib/react-query.ts:217`). A MutationObserver calls `finish()`.

**No inline script.** CSP would allow one (`next.config.js:89`), but it would duplicate the gate and hide pages before a Briefing exists.

**Verify.**

- B1 on a cold Desk.
- A warm soft entry plays.
- A 6 s `document_state` delay (`late`) leaves the ordinary page.

**Cost:** M.

**Forecloses:** an arrival at first byte.

### S4b · Addresses that decline

**Decision.** Any query or hash present at entry suppresses the run as `address`. It is read at first render, before DeskDoorway strips it. That covers:

- the DeskDoorway keys, including `checkout` (`desk-doorway.tsx:83-95`);
- `tour` (`help/desk-walkthrough-gate.ts:18`);
- `?sheet=call` (`doc:1236`) and `?ffeItemId` (`doc:1104`);
- `?arrive=0` (test-only).

**R-DM21 token.** A claim card writes `sessionStorage['pl-arrive']={via,to,at}` (`desk-claim-card.tsx:145-154`, `:183-205`):

- the name link writes `ptr`, or `kbd` when `e.detail===0`, and only when no modifier key is held;
- the act band writes `act`.

The token is consumed once, only if `to===pathname` and it is under 5 s old. An `act` token suppresses the run as `act-link`. The page then calls `jumpToRegion` (`doc:1837-1844`) on the region of the first red-letter row. Focus moves only on a keyboard entry.

**Verify:** a jest gate table, plus Playwright on `/desk?book=orders&checkout=success`.

**Cost:** S.

**Forecloses:** arrivals from email deep links.

### S5 · Geometry

**Decision.** The field is the Desk's `<main>` (`desk:328`), or `[data-document-shell]` (`doc:2738-2746`).

- `collect()` stays inside the field, capped at 12 parts on desktop and 8 on phone.
- It assembles the page as rendered: the active section, SettledBars, letterhead, band and spine.
- `readingY` keeps `scrollY` unless the carrier sits below the viewport (JS:258).

**Clipping.** Clipping ancestors of a carrier get `data-arr-unclip`. That covers the shell's `overflow-x-clip` (`doc:2745`) and the sentence clip (`lens-band.tsx:38`). The crown is a clone (JS:271), so the spine's overflow (`doc-spine.tsx:134-141`) doesn't matter.

**Entry moves.** `doc-raise` (`doc:2745`) and `desk-settle` (`desk-roster.tsx:70-80`) sit behind `[data-entry="raise"]`. That is set only on a decline before paint.

Precedence, highest first:

1. `markSealTurn`
2. teaching, which counts as busy
3. the arrival
4. raise and settle

**Ladder.** `[56,44]`, verbatim. The carriers are 15–16px (`desk-claim-card.tsx:172`, `lens-band.tsx:267`), so 56 fits only sentences of about 180px or less. Longer ones use `s=1` (Q1).

**Verify.**

- B2, B3, B6, B10 and B13 on both routes.
- `page.clock.fastForward(60_000)` during the hold ends on the ordinary page.

**Cost:** L.

**Forecloses:** assembling anything that isn't rendered.

### S6 · Phone and put-down

**Decision.** The phone card is flush-left at `s=1` (JS:292), with a reading inset of 0.

**Put-down.** Every put-down writes `pl-from-doc`: Escape (`doc:1383`), the rail link (`doc-spine.tsx:147-156`) and the sheet (`mobile/mobile-sheets.tsx:604-607`). The Desk then suppresses the run as `same-visit` and scrolls `#roster-line-{id}` (`desk-claim-card.tsx:91`) into view before paint.

**Touch.** Act 3 releases `arr-on`. After that, `touchmove` is never prevented.

**Dates.** "Today" is the browser's local day, the same basis `deriveOverdue` uses (`overdue-condition.ts:23-49`).

**Verify:** B4 and B11 at 390×844.

**Cost:** S.

**Forecloses:** studio-zone dates.

### S7 · Verification

**Decision.** The run declines as `automation` under `navigator.webdriver`, unless `sessionStorage['pl-e2e-arrival']==='1'`. The 36 existing specs need no edits. Trade-off: automation never sees the arrival, but Chrome-extension walks do.

**Jest.** `lib/arrival/__tests__/{select,gate,inputs,boundaries}.test.ts` covers:

- T2, with the headline exempt
- T3 by type
- T4: shuffled `DocumentStateRow[]` through `deriveDeskRoster`, then `deriveDeskClaims`, then `briefDesk`
- T5 at local midnight
- T7

**Playwright.** `playwright.arrival.config.ts` derives from base, like `playwright.hours.config.ts`, including its loopback guard (`:65`).

- It runs `next build --webpack && next start -p 3100` on chromium, with the local trio exported.
- `e2e/arrival/*.spec.ts` opt in via `addInitScript` and port B1–B13.
- They add live T3, warm-soft and cold-Desk plays, Escape in the hold, and each suppression row.

**Seeds.** No changes needed.

- `seedWorkflowGateFixture()` for `a0000000-…-0004`, plus `help_state` (`e2e/document/desk-claims.spec.ts:26-41`).
- `…00d5` gives a standing need and `…00d6` a guide (`e2e/document/lens-fixtures.ts`).

**Cost:** M.

**Forecloses:** watching the arrival from automation.

### S8 · Rollout without a flag

**Order.**

1. Reserve 00675 in `docs/engineering/migration-number-reservations.md`.
2. Check that `supabase migration list --linked` shows only 00675 pending. The stray `20260910152111_*` may force `--include-all`.
3. Run `supabase db push`.
4. Export the trio from `wrangler.jsonc` in the same shell (`research/gates-deploy.md:80-95`).
5. Run `./infra/deploy-portal.sh designer`.

**Probe.**

- Read the bottom row of `npx wrangler deployments list --name patina-designer-portal`.
- Grep the chunks: `arr-ok` and `pl-arrive` must be present, and `127.0.0.1` absent.
- Do a signed-in Chrome walk.

**Rollback.** Redeploy the prior SHA.

**Telemetry.** A single event, `arrival_ended {surface, reason, cause?}`, sent through `deskRendered`'s path (`desk:119-130`). `cause` is sent only on `decline`. Suppressions send nothing. No durations.

**Cost:** S.

**Forecloses:** a staged rollout.

## 3. Play matrix

| Entry | Desk | Document |
|---|---|---|
| Hard load (sign-in, bookmark, refresh) | **Plays** once per 30-min visit, otherwise **suppressed**. She sees skeleton rows for up to 5 s, then a bare field for up to 300 ms | **Plays**. She sees "Picking up…" for up to 5 s, then up to 300 ms |
| Soft entry | **Plays** once the visit has lapsed. A put-down inside the visit is **suppressed** and scrolls to the row | **Plays**, within 5 s of the click (usually ready at the first commit). An act token is **suppressed** and lands on the region |
| `router.replace` | DeskDoorway strip: **suppressed** | Signing (`doc:1266-1271`) and the authorization doorway (`doc:1277-1279`) write `via:'replace'`: **suppressed** |
| popstate / BFCache | **Suppressed**; `pagehide` calls `finish()` | **Suppressed** |
| Query change on the same path | No replay; a query at entry **suppresses** | Same as the Desk |

## 4. Pieces

**W1 · shared** (one worktree, Opus) owns:

- the frozen types and conforming stubs of `select`, `gate`, `engine`, `host` and `inputs`;
- `boundaries.test.ts`;
- `app/fonts.ts` and `app/layout.tsx`;
- the inert `data-part` and `data-arr-field` marks in `desk-claim-card.tsx`, `desk-roster.tsx`, `lens-band.tsx`, `doc-letterhead.tsx`, `doc-spine.tsx`, `desk:` and `doc:`;
- a stub `use-arrival-anchor.ts`;
- the reservation row.

**Verify:** portal `type-check && lint && test`.

```ts
// apps/designer-portal/src/lib/arrival/types.ts — FROZEN at W1. Imports nothing. Plain JSON only.
export type Surface = 'desk'|'document';
export type Rule = 'R1'|'R2'|'R3'|'R4'|'R5'|'Desk';
export type PartName = 'headline'|'act'|'act2'|'f1'|'f2'|'f3'|'job'|'warn'|'name'|'stage'|'settle'|'head'|'crown';
export interface BriefAct { label: string; href: string|null }
export interface BriefRow { engagementId: string; name: string; stage: string|null; sentence: string; overdue: boolean; needKind: string|null; act: BriefAct|null }
export interface Change { at: string; kind: string; needKind: string|null; subject: string; byViewer: boolean }
export interface SinceInput { anchor: string|null; changes: Change[] }
export interface DeskInput { studio: string; dateLine: string; rows: BriefRow[]; since: SinceInput|null; today: string }
export interface DocumentInput { row: BriefRow|null; name: string; stage: string; vitals: string|null; paused: boolean; line2: 'standing'|'guide'|'none'; since: SinceInput|null; today: string }
export interface Briefing { surface: Surface; rule: Rule; place: string; headline: string; job: string|null; facts: string[]; warn: number; since: string|null; act: BriefAct|null; act2: BriefAct|null; needKind: string|null; engagementId: string|null }
export type EntryKind = 'hard'|'soft'|'replace'|'pop'|'query';
export interface ArriveToken { via: 'ptr'|'kbd'|'act'|'replace'; to: string; at: number }
export interface GateInput { surface: Surface; entry: EntryKind; pathname: string; search: string; hash: string; token: ArriveToken|null; now: number; lastVisitAt: number|null; webdriver: boolean; e2eOptIn: boolean }
export type Suppress = 'address'|'history'|'replace'|'same-visit'|'act-link'|'automation';
export type GateResult = { play: true; via: 'ptr'|'kbd'|null }|{ play: false; why: Suppress };
export type EndReason = 'skip'|'timer'|'key'|'pointer'|'focus'|'decline';
export type DeclineCause = 'late'|'input'|'fonts'|'css'|'busy'|'drift'|'mutation'|'engine'|'no-sentence';
export interface Ending { reason: EndReason; cause: DeclineCause|null }
export interface ArrivalHost { field: HTMLElement; reducedMotion: boolean; faces: string[]; ladder: number[]; busy(): boolean; freeze(): () => void; entry(move: 'raise'|'none'): void; onEnd(e: Ending): void }
export interface ArrivalRun { done: Promise<Ending>; abort(): void }
export type StartArrival = (host: ArrivalHost, b: Briefing, via: 'ptr'|'kbd'|null) => ArrivalRun;
```

**W2** runs three parallel pieces, all on Opus.

| Piece | Owns | Verify |
|---|---|---|
| **A · db** | `supabase/migrations/00675_arrival_anchors.sql`, `supabase/tests/document/arrival_anchors_test.sql`, `supabase/seed/00-legacy-grants.sql`, `packages/supabase/src/{database.types.ts,hooks/use-arrival-anchor.ts,hooks/__tests__/use-arrival-anchor.test.ts}` | S2, plus `pnpm --filter @patina/supabase type-check` |
| **B · engine** | `src/lib/arrival/{select,gate,engine,host}.ts` with their tests, and `src/styles/arrival.css` | `type-check`, `lint`, `test -- src/lib/arrival` |
| **C · integrate** | `src/lib/arrival/inputs.ts` with its test, `src/components/arrival/arrival.tsx`, `desk:`, `desk-roster.tsx`, `desk-claim-card.tsx`, `desk-roster-derivation.ts` with its test, `doc:`, `doc-letterhead.tsx`, `doc-spine.tsx`, `mobile/mobile-sheets.tsx` | `type-check`, `lint`, `test -- src/lib/arrival src/components/document` |

**W3 · lane** runs once A, B and C are merged. It owns `playwright.arrival.config.ts` and `e2e/arrival/*`. In order, it runs:

1. the arrival lane;
2. `test:e2e -- --project=chromium`;
3. an adversarial review in a separate context.

**W4 · ship** runs S8, gated on a clean W3.

## 5. Refuse to ship without

- **The faces must resolve.** The arrival plays on a warm soft entry and on a cold Desk (W3).
- **Escape in the hold must not put the page down** (`doc:1370-1389`). A spec proves it.
- **The 36 existing specs pass** on chromium.
- **Strata stays untouched.** The lane build contains no `bkvcixdmuyejfzcijpdg`, and Strata has zero `arrival_anchors` rows before the push.
- **Failure means the ordinary page.** B7 (CSS 404), B8 (hung chunk), B9 (fonts blocked) and `late` each leave the field visible and clickable.
- **T3 holds live** on the seeds, and `drift` fires on a mismatch.
- **Screen readers hear it once.** Line 2 is `aria-live` (`lens-band.tsx:264-265`), and B12 must pass.
- **Migrations.** Only 00675 is pending.

## 6. Design-reopen evidence

- **The headline stays at body size.** `plan().s` is 1 for most real sentences at 1440, so headlines compose at 15–16px Inter rather than 34px display. Reopen S1 with a display carrier.
- **The two rankers diverge.** The Desk takes `needs[0]` in rule order (`lib/document/desk-derivation.ts:1305`); the Document ranks its needs (`lib/document/need-tie-break.ts:134-159`). If one seeded job leads with a different need on each, the cards contradict each other a second apart. Reopen with a single ranker.
- **The freeze leaks.** A 60 s tick cuts more than 1 run in 10.
- **The since line is starved.** `arrival_changes` is empty for most owners for a week. Add comms.
- **Declines dominate `arrival_ended`.** Revisit the S4 budgets.
- **`Briefing` breaks.** A client-portal or iOS consumer needs a breaking change to it.

**Q1 for Kody.** The page's sentence is 15–16px body copy with no closing period, which contradicts constraint 2. There are two ways to handle it:

1. **Ship it verbatim.** The headline stays small.
2. **Rule a display step or a period at rest.** Either one changes the page at rest.

My default is option 1.
