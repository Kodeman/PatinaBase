# Arrival v3 → production — pinned contract

Program: US-14 (designer-portal motion) · production delivery, 2026-09-27
Inputs: `research/*.md` (9 recon reports + critique), `design/PANEL-BRIEF.md`, three panel
proposals (`proposal-{smallest-change,cleanest-seams,risk-first}.md`), three judge verdicts
(react/next correctness · doctrine/UX fidelity · ship risk/rollback).
Status: PINNED. **D1–D4 RULED by Kody 2026-09-28 — every default in §2 stands** (display clone;
page words + card-side punctuation with phone long-form; F2 omitted in v1, write-only anchor;
`arrival_ended {surface, how, cause?}`). Nothing here is reopened in code.

## 0. Rulings fixed by Kody

1. **No feature flag. 100 % of production on the first deploy.** The only lever is redeploy of the
   prior version. Failure of any kind = the ordinary page (today's Desk / Document with today's
   `desk-settle` / `doc-raise` entry moves).
2. **Every open R-DM ruling (R-DM18–38) ships as the option-A build already in the mockup**
   (`artifacts/designer-portal-motion-2026-09-25/design/cinematic/arrival.{js,css}`, artifact v4).
3. From the brief: every Document arrives; the Desk arrives once per visit; any input advances;
   Escape advances; **Skip is the only path straight to rest**; the morning open must play; nothing
   on the card is exclusive to the card (T3); one screen-reader announcement; reduced-motion floor
   is the opacity-only card layer; the studio never notices Patina at rest (no redesign at rest).

## 1. Panel outcome — spine and grafts

**Spine = smallest-change.** Lift the text the page actually printed (T3 by construction); no
inline pre-paint script; hide only the route root, never body or chrome; write-only anchor;
any query/hash at entry declines; `navigator.webdriver` declines unless opted in; entry moves
suppressed only after a played arrival (fails open); telemetry is the one allowed event.

**Grafted from risk-first:** clone layer for clipped/truncated carriers; the complete `busy()`
list; closed-enum decline `cause` (D4); split mount (persistent nav/input observer + per-route
run); `suppressNextArrival(path)` before the known same-path replaces; MutationObserver options
`childList + characterData + subtree` only; wall-clock watchdog + `error`/`unhandledrejection`
→ `finish()` in `try/finally`; the rollback staging + prior-version record; the lane discipline
(own config, own port, `reuseExistingServer:false`, `next build --webpack` + `next start`,
mobile-chrome project); the chunk probe from `.open-next/assets`; pgTAP for the anchor.

**Grafted from cleanest-seams:** frame-0 drift check (card part text ≠ marked node text →
decline `drift`); explicit `data-part` marks; the click token `{via:'ptr'|'kbd'|'act', to, at}`;
`boundaries.test.ts` (types → pure → DOM → host layering).

**Why the losers lost (for the next session, so they are not re-proposed):**
- *cleanest-seams:* built the card from the derivation, not the printed node — at phone widths
  LensBand prints the tier-chosen short form, so its own drift check declines every phone
  Document; Desk R4 headline (`NOTHING_NEEDS_YOU`) prints at rest only with a facet on, so it
  was exclusive to the card; a `none` line-2 Document declined (breaks "every Document
  arrives"); hid the field at the *ready* commit (page → blank → card); 5 s from `timeOrigin`
  declines the cold morning open; `focusManager.setFocused(false)` is a process-global freeze;
  inserted the since line after landing (layout shift at rest); retemplated shipped Desk copy;
  regenerated `database.types.ts` from the shared local Postgres.
- *risk-first:* no cap on hidden time; act as a clone breaks Tab/activation and R-DM22; chrome
  click as a second path straight to rest; `?arrive=1` prod-reachable forcing seam; `readingY`
  formula lands at the MobileBar; `animation:none under arr-*` lifts at finish so entry moves
  replay; `pl-from-doc` scroll undone by Next's post-navigation scroll handler; legacy lane
  covers 24/36 specs; the integrator writes its own acceptance lane; `statement_timeout` as a
  function SET bounds nothing; INVOKER union over 4–6 tables whose prod grants are unproven, on
  every open, with no flag.

## 2. Open decisions → defaults (the only Kody questions)

| # | Decision | Default (stands unless ruled otherwise) |
|---|---|---|
| **D1** | Card headline typography | **Display clone.** The headline flies as an aria-hidden clone set in the heading face (`--font-heading`, Playfair) on the ladder 56 → 44 → 34 → 28 px, largest rung that fits ≤ 2 lines (3 at 28) inside `min(640px, view − 2·gutter)`; **never declines on length**. It lands on the page node's rect with a ≤ 120 ms crossfade into the real node. Alternative A′: fly/clone the page's own 15–16 px Inter text with the mockup's relative ladder (`k = z/fs`, most real sentences compose at s = 1). |
| **D2** | Voice vs the preview rule | **Card prints the page's words; card-side punctuation allowed.** Terminal period appended when the page has none; R-DM24 A composed as `Overdue {phrase}: {text}` from the page's own phrase and text substrings (page keeps its em dash at rest). On the phone the card headline uses the same `printed` model's **long-form** sentence (the form desktop prints), not the `OVERDUE 3D · subject` short form; the page is unchanged at rest. Alternative: strict verbatim (short form on the phone card), or retemplating the page at rest (visible copy change day one). |
| **D3** | F2 / since line in v1 | **Omit.** The anchor ships write-only (`mark_arrival` after settle or decline, off the critical path); rows accrue for a v2 reader. The card never prints "First visit", "Nothing new since" or any since fact in v1. Alternative: positive-only INVOKER reader over `decision_events` / `comms_messages` / `project_notes` (+ schedule actors), one RPC per open, unproven prod grants, no flag. |
| **D4** | Telemetry shape | **`arrival_ended { surface, how, cause? }`** — `cause` is a closed enum set only when `how = 'declined'`; no durations, no dwell. Alternative: exactly `{ surface, how }` (a silent never-plays is then invisible in prod). |

## 3. Decided here (not asked)

- **Chrome in Acts 1–2 is inert, mockup-verbatim** (`html.arr-on:not(.arr-asm) body{pointer-events:none}`, engine nodes `[data-arr]{pointer-events:auto}`). A chrome click advances and is swallowed. Only in Act 3 does a control snap to rest first, then act once (O1(d)). Skip stays the only path straight to rest.
- **Keys during the wait and Acts 1–3:** Escape is swallowed in every act *and during the ready wait* (`stopImmediatePropagation` + `preventDefault`). Bare-key shortcuts (`t`, `?`, `g`-chords, ⌘K) in Acts 1–2 **advance only** — propagation stopped. Tab/Shift-Tab behave as the mockup (focus in the card pauses the hold, R-DM22).
- **Listener registration:** the arrival's window-capture keydown/pointer listeners are registered ONCE, before every chrome listener (CommandBar, LogStrip, MarginNote, LogTimeOverlay, DraftProposalOverlay), from the persistent mount (module-scope guarded install or first sibling in the layout — a jest test proves order: Escape during a run never reaches `LogStrip`'s `discardOffer`).
- **`busy()` (decline `busy` at ready):** open dialog (`[role=dialog]`, Radix incl. WelcomeModal), editable focus target, open shelf, walkthrough offer/active, a due teaching note (`teaching-notes`), the arbiter hire-handoff / first-touch / walkthrough-offer lines, **a pending log-time offer** (`LogStrip` listens whenever an offer exists, even when hidden), a live text selection. **Not busy:** the Studio setup whisper (`aside[role=note]`, a live Desk line — the owner's morning open must play), `TesterWidget`, `DebugPanel`, toasts.
- **Desk after a Document-first visit still briefs once** (ORC:1123). Only `pl-desk` suppresses the Desk; `pl-from-doc` only scrolls.
- **`pl-from-doc` row landing ships** (ruling 2) via a post-commit `requestAnimationFrame` scroll to `#roster-line-{id}` from the persistent mount — not via `scroll={false}` edits to the three put-down sites (Next's `InnerScrollAndFocusHandler` runs after child layout effects; the rAF runs after it).
- **R-DM21 A "straight to the record":** the Desk act link writes the token `{via:'act', to, at, landing}`; the Document consumes it on mount and calls its own landing (`jumpToRegion` / `landOnFfeAnchor` / `jumpToSection`) and the arrival declines `token`. Name links write `via: 'ptr'|'kbd'`; a `kbd` token lands focus on the act when the hold times out (arrival.js:735). Tokens are consumed once, honoured only when `to === pathname` and `at` is < 5 s old; a refresh never inherits a token.
- **Quiet Document (band line 2 = `none`, empty sentence):** arrives. Headline part = the letterhead `h1` (job name, printed at rest); no act; F-lines from printed vitals. Never a no-arrival branch.
- **Desk quiet form (R4):** headline = the always-printed overdue line (`Nothing is overdue.`, desk-roster-derivation.ts:314); when the roster has no groups, the printed `Nothing needs your hand. The work is in motion.` Never `NOTHING_NEEDS_YOU` (facet-only).
- **R2/R5 past 8 words:** headline = the need text alone; `Overdue N days` moves to F3 — both page substrings (mockup arrival.js:118–123). **No headline-length decline** (real overdue claims run 13–14 words).
- **Desk place/head line:** the date line only, or `studio · date` where the studio name is printed on the page — never the greeting ("Good morning, Leah" is off-voice).
- **Acts that fail DOORWAY** still ride the card as the mockup does; DOORWAY decides landing focus only.
- **Carriers:** `collect()` classifies each marked node `'node' | 'clone'`. A node flies itself when it wraps normally and has no clipping ancestor; it is cloned when it is `nowrap`/ellipsis-clipped, sticky/fixed, or inside `overflow:hidden|clip` (the LensBand sentence; everything inside `.desk-claim-card`). **The act is always the real node**; its clipping ancestors get `data-arr-unclip` for the run only (restored at finish). The clone layer is `position:absolute` in document coordinates (`fixed` only for sticky parts) so a native Act-3 scroll never mis-lands a flight; clones are `aria-hidden`, real carriers hold opacity 0 while their clone flies.
- **Hide/ready/budgets:** `html.arr-pre` is set in a layout effect at the pathname commit; CSS `html.arr-pre [data-arrival]{opacity:0; animation-play-state:paused}` hides the route root from its first paint (chrome, skeletons and "Picking up…" stay visible; `[data-arrival]` is only present once real content renders). Ready = the page's own readiness mark (`data-arrival-ready`: Desk = first non-placeholder `useDeskEngagements` success; Document = `lensLineSettled` ∧ enrichment settled) **AND** 200 ms without mutations in the route root **AND** fonts resolved. Caps: **hidden ≤ 1.2 s** from `[data-arrival]` appearing; **entry → ready ≤ 8 s** on a hard entry (from `timeOrigin`) / **≤ 4 s** on a soft entry (from the pathname commit). Past a cap → decline `late`/`hidden`, `arr-pre` removed, the page's own entry move plays from the start. CSS failsafe: `arr-pre` reveal keyframe with a 1.5 s delay so a thrown gate still shows the page. Quiescence is scoped to the route root's mutations, **never** global `useIsFetching`.
- **Before measuring:** swap `arr-pre → arr-on` and set `data-arr-played` on the route root (kills the paused `doc-raise` scale so rects are true). `[data-arr-played] .desk-settle, [data-arr-played].doc-raise-shell` → `animation:none`; the attribute outlives `finish()` for that mount.
- **Guards during the run:** MutationObserver on the route root (`childList`, `characterData`, `subtree`; never `attributes`) + a second on `body` children excluding `[data-arr]` → `finish('mutation')`; watchdog = compose + hold + 5 s → `finish('watchdog')`; `window` `error` / `unhandledrejection` → `finish('error')`; `finish()` body in `try/finally` that always removes `arr-*`, restores `pointer-events`, unclips, restores `aria-live`. Reset `inputAt` at entry so a page-driven scroll < 800 ms after the navigating click does not count as her scroll.
- **One announcement:** the engine sets `aria-live="off"` on `[data-lens-announce]` at start and restores it at finish (React never rewrites a constant prop), so the band's stop line cannot double the arrival's `role=status` message.
- **`readingY`** = the mockup's rule (view top + offset; `view()` subtracts the fixed MobileBar `[data-testid="mobile-bar"]`). Not the band/MobileBar max formula.
- **FACES** from the body's CSS custom properties `--font-heading / --font-inter / --font-mono` (globals.css:1556–1561), literal families as fallback; `document.fonts.load` with a 600 ms timeout → decline `fonts`. Never `getComputedStyle(node).font`.
- **`today`** = browser-local date (matches `deriveOverdue`'s local midnight); jest cases under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`.
- **Entry classification:** `navType` from navigation timing on the hard load only; **nulled on soft entries**; `popstate` within `popAgoMs` = back/forward → decline `back_forward`.
- **Zone-flight stuck signal:** its clock starts at arrival end (`patina:arrival-ended` event) so the 10 s hold never eats the 10 s thrash window.
- **Test seam:** decline `webdriver` when `navigator.webdriver === true` unless `sessionStorage['pl-arrive-e2e'] === '1'`. `?arrive=0` is the only URL seam (ruling 1); **no `?arrive=1`**.
- **Fire-and-forget RPC:** plain `supabase.rpc('mark_arrival', …)` with swallowed errors — never a `useMutation` without `meta.errorSurface:'inline'` (react-query.ts:114 raises the red toast otherwise).
- **Prod worktree hygiene:** ≤ 3 build worktrees at once, one `.next` at a time; each wave's worktrees retired before the next wave opens.

## 4. Shared surface — `apps/designer-portal/src/lib/arrival/types.ts` (FROZEN in W1)

```ts
export type Surface = 'desk' | 'document'
export type Part =
  | 'headline' | 'act' | 'act2' | 'f1' | 'f2' | 'f3'
  | 'name' | 'stage' | 'crown' | 'job' | 'warn' | 'head' | 'settle'
export type Carrier = 'node' | 'clone'
export type Via = 'ptr' | 'kbd' | 'act'
export type EntryKind = 'hard' | 'soft' | 'replace' | 'back_forward' | 'reload'
export type Landing =
  | { kind: 'region'; region: string }
  | { kind: 'ffe'; ffeItemId: string }
  | { kind: 'section'; sectionKey: string }

export interface ArriveToken { via: Via; to: string; at: number; landing?: Landing }

export type DeclineCause =
  | 'query' | 'token' | 'visit' | 'desk-shown' | 'busy' | 'late' | 'hidden'
  | 'fonts' | 'sentinel' | 'drift' | 'no-root' | 'no-headline' | 'webdriver'
  | 'replace' | 'back_forward' | 'reload' | 'unsupported' | 'error'
export type EndHow =
  | 'settled' | 'input' | 'escape' | 'skip' | 'mutation' | 'watchdog' | 'error'
  | 'hidden-tab' | 'declined'

export interface GateInput {
  surface: Surface; pathname: string; search: string; hash: string
  entry: EntryKind; entryAt: number; now: number
  webdriver: boolean; e2eOptIn: boolean
  visitAt: number | null; deskShown: boolean; token: ArriveToken | null
  suppressedPath: string | null; reducedMotion: boolean
}
export type GateResult =
  | { play: true; via: Via | null; reduced: boolean }
  | { play: false; cause: DeclineCause }
// gate() is PURE: no storage reads or writes. start() performs every write
// (pl-visit, pl-desk, token consumption) so a StrictMode double effect re-gates identically.

export interface CardPart { part: Part; text: string; node: HTMLElement; carrier: Carrier }
export interface Brief {
  surface: Surface; parts: CardPart[]; headline: CardPart; act: CardPart | null
  today: string /* browser-local YYYY-MM-DD */
}
// brief(root) lifts ONLY from [data-part] nodes inside the route root; returns null →
// decline 'no-headline'. Frame-0 re-read must equal each part.text or decline 'drift'.

export interface Host {
  root(): HTMLElement | null            // [data-arrival] route root
  ready(): boolean                      // [data-arrival-ready] present
  busy(): boolean                       // §3 list
  faces(): string[]                     // CSS-var families
  view(): { top: number; height: number; width: number; bottom: number } // minus MobileBar
  telemetry(e: ArrivalEnded): void
  markArrival(surface: Surface, engagementId: string | null): void  // fire-and-forget
}

export interface ArrivalEnded { surface: Surface; how: EndHow; cause?: DeclineCause }

export const BUDGET = {
  HOLD_MS: 10_000, HIDDEN_CAP_MS: 1_200, HARD_ENTRY_READY_MS: 8_000, SOFT_ENTRY_READY_MS: 4_000,
  QUIET_MS: 200, FONTS_MS: 600, TOKEN_TTL_MS: 5_000, VISIT_MS: 30 * 60_000,
  WATCHDOG_MARGIN_MS: 5_000, INPUT_SCROLL_WINDOW_MS: 800, LANDING_FADE_MS: 120,
} as const
export const KEYS = {
  ARRIVE: 'pl-arrive', VISIT: 'pl-visit', DESK: 'pl-desk', FROM_DOC: 'pl-from-doc', E2E: 'pl-arrive-e2e',
} as const  // sessionStorage, window.name fallback
export const SENTINEL = '--arr-ok'   // :root{--arr-ok:1} — CSS missing → decline 'sentinel'
export const EVENT_ENDED = 'patina:arrival-ended'
```

Marks (W1, inert, zero behavior):
- Route roots: Desk `<main data-arrival="desk">` only while roster content (not the skeleton) renders, `data-arrival-ready` when `useDeskEngagements` has its first non-placeholder success; Document shell grid `data-arrival="document"` when resolved, `data-arrival-ready` when `lensLineSettled && enrichmentSettled`.
- `data-part` on the printed nodes per `research/engine-spec.md §1` and `proposal-smallest-change.md §S1`: Desk — `headline` = top Claim card sentence (`desk-claim-card.tsx:170-181`, `data-register="sentence"`), `act` = its act control, `f1|f2` = day lines 2–3 (quotes of cards 2–3), `f3` = the overdue clause node when the 8-word rule moves it, `head` = the date line, `settle` = the overdue/quiet line; Document — `headline` = `[data-lens-sentence]` (lens-band.tsx:273-282), `act` = the band act, `name` = letterhead `h1`, `stage`, `crown` (letterhead below 1180 px / spine above), `job`, `warn`, `f1..f3` = printed vitals. Every part is a node that prints at rest.
- `data-arr-unclip` is NOT a mark; the engine sets/removes it at runtime.

### 4a. W1 outcomes and amendments (2026-09-28, branch `arrival-prod/w1-surface`, reviewed twice, fixed twice)

These are rulings from the W1 reviews; they amend §3/§4 where the two differ and bind W2/W3.

- **Marks may be token lists** (`data-part="headline settle"`); always select with `[data-part~=X]`; `collect()` yields one CardPart per token (the same node may carry two roles); the settle tween runs only after the headline's landing crossfade.
- **Desk quiet form:** when no claim card renders, the overdue/quiet summary line is marked `headline settle`; with cards it is `settle` only.
- **`head` = the landing-focus target on both surfaces, always a `tabIndex=-1` node.** Desk: the date line (its text is also the card's place line). Document: `<header id="document-project-status" tabIndex={-1}>` — **focus only, never card text** (its textContent is the whole letterhead).
- **`job` lives on the Desk** (top card's name link `[data-roster-name]`), not the Document (the name `h1` is the job's name). **`warn` is unmarked on both surfaces in v1** (the overdue signal is inside f1/f2 or the headline). `act2` has no node.
- **Desk F3** = the `Overdue N days` prefix of the headline part's text, split on ` — ` (a substring; no node). Desk `f1`/`f2` are the day lines quoting cards 2–3 (index 1 and 2 of `card-*` lines); the ` — ` leading separator in `[data-day-line-overdue]` is stripped.
- **Document phone long form:** the marked `[data-lens-sentence]` span carries `data-arr-long={printed.long.sentence}` whenever it prints; `brief()`/`verifyFrame0()` read `data-arr-long ?? textContent` for that part (this is the `data-part-long` rule in §4 — the attribute name is **`data-arr-long`**).
- **Document f1/f2** are inner `<span class="inline-flex items-baseline gap-1">` wrappers holding only the vital's label + value (the `×` clear button, SaveDot and popover sit outside the mark). Document `f3` = the contract total; W3b asserts it is visible at 1180/1280 (nowrap row) or `collect()` skips a fully clipped part. Pre-project Documents: `f1` = `[data-letterhead-vitals]`, `name` = the static `h1`, no `stage`.
- **Crown:** the mark sits on the wrapper `div` around `StrataMark` (letterhead; spine ≥ 1180). Clone and measure `[data-part~=crown] .strata-mark` (span-based, not svg) and restyle `.arr-crown` for spans. Two candidates exist; `part()` takes the first rendered.
- **Quiet Document** (band line 2 `none`): no headline mark by design → the engine falls back to `[data-part~=name]`, no act. A **held/disabled band act** (`:disabled` / `aria-disabled=true`) counts as no act.
- **Entry-move suppression selector:** `[data-arr-played][data-arrival="document"]{animation:none}` (covers `doc-raise` and `doc-fade`; there is no `.doc-raise-shell` class) and `[data-arr-played] .desk-settle{animation:none}`.
- **Ready marks as built:** Desk `data-arrival="desk"` iff `!isError && !!data`; `data-arrival-ready` iff that ∧ `hydrated` ∧ `isSuccess` ∧ `!isPlaceholderData`. Document `data-arrival="document"` on the resolved shell `[data-document-shell]`; `data-arrival-ready` iff `lensLineSettled ∧ deskEnrichmentSettled ∧ ticketRowsSettled ∧ !guideInputsInFlight` (all pre-existing state). The band may still re-print up to one commit + 90 ms after the enrichment lands; the 200 ms quiet window + frame-0 drift guard cover it — **W3b runs a cold-Document lane with delayed project/ticket reads and asserts no `drift`/`mutation` declines.**
- **Desk route root is `<main>`,** which includes the page header (greeting, date, Capture/Open/Find). On a cold Desk the header is visible with the skeleton, then hides with the root when data lands (≤ 1.2 s), then returns at settle. **Accepted** (mockup-faithful; the header's vanishing is the paper clearing). W3b's cold-Desk spec asserts that sequence.
- **Token writes (W2-C)** key on `[data-register="act"] a`, `[data-roster-name]` and any `[data-claim-card] a[href^="/doc/"]` — NOT on `data-part` (only the top card carries marks).
- `VitalDate` text no longer includes the `×` glyph (moved outside the mark); `[data-lens-announce]` has no `aria-live` of its own — its parent `<p>` does: the engine sets `aria-live="off"` on the closest `[aria-live]` ancestor of `[data-lens-announce]` and restores it.
- Sandbox note for executors: the read-deny `**/.env.*` also blocks `.env.example`; take variable names from source/wrangler.jsonc instead.

### 4b. W2 outcomes and rulings (2026-09-28, run wf_fb3f2ace-298; A clean at first review, B and C fixed twice, W1 fixed twice more)

Heads: W1 `arrival-prod/w1-surface` **e9d4dca64** (seam ce2051d8e + Desk ready `hydrated` + glued-vitals space + Desk ready widened by two reads) · A `arrival-prod/w2-db` **6b91a755d** · B `arrival-prod/w2-engine` **abf0fa0de** · C `arrival-prod/w2-host` **5e51633c5**. All three pieces branch from the seam. Rulings taken at synthesis (Fable), not reopened in W3:

- **The frozen `run-contract.ts` comment says `data-part-long`; the attribute is `data-arr-long`** (§4a). B already reads `data-arr-long`; the stale comment stays (frozen file). W3 asserts the engine never reads `data-part-long`.
- **Reload plays.** `gate()` no longer declines `entry === 'reload'`; a refresh never inherits a token (`honoured()` drops it) and the Desk once-per-visit rule still suppresses a same-visit Desk reload. `'reload'` and `'visit'` stay in the closed enum, unused.
- **Input during the ready wait halts the wait and declines `busy`** (the mockup's `halt()`): any key other than Escape, pointerdown, wheel or touchmove while `arr-pre` is armed removes `arr-pre`, ends the wait, writes no run. Escape stays swallowed for the whole wait. A press during the wait that lands inside the hidden root is swallowed once (`swallowClick`) so the click never activates content she could not see.
- **The anchor is written once per entry on EVERY end** (played, engine-declined, gate/commit/cap/hidden-tab declines) from the host's single `report()` funnel; `pl-desk` is stamped only after `run.start()` returned with the run not already `done`; `pl-visit` and token consumption stay before `start()`.
- **Anchor key = the URL `[id]` segment** of `/doc/[id]` (any of the engagement's keys) and `NULL` for the Desk. Known v1 limitation: rows for one engagement may split across its keys; a v2 reader normalizes through `document_state` (never inside the SECURITY DEFINER RPC — that would be an existence oracle). No `database.types.ts` regen (§5 W2-A stands; `mark-arrival.ts` uses a plain `rpc` cast).
- **`busy()` additions:** a standing `ReturnToLeadUndo` offer (`[data-testid="return-to-lead-undo"]` inner band) is busy; MarginNotes inside `[data-margin-panel]` (doc-first-touch, file-change) are NOT busy; the Desk arbiter's dismissible notes, teaching notes, dialogs, editable focus, `[data-shelf-open]`, walkthrough, log offer and a live selection remain busy. `callSheetPending` declines `busy` at the commit without hiding the root.
- **Clicks in Acts 1–2 are blocked by `pointer-events:none!important` on every non-`[data-arr]` descendant** (the MarginRail aside and toasts set `pointer-events:auto` themselves); the act's `pointer-events` is written inline with `important`. Frame-0 hides set `transition:none` first (`hide()`); the act gets `transition:none` at staging and `end()` restores saved `transition` values LAST after a style flush, so nothing glides home after Skip/mutation/watchdog.
- **Skip sits above the MobileBar:** `bottom:calc(16px + max(var(--doc-mobile-bar-height,72px), env(safe-area-inset-bottom)))` below 1180.
- **Clock domain:** epoch ms everywhere the host and engine meet — `GateInput.now = Date.now()`, `entryAt = performance.timeOrigin` (hard) or the commit's `Date.now()` (soft), `RunOptions.now = () => Date.now()`. W3 asserts the engine never mixes `performance.now()` into a comparison with `entryAt`.
- **Listeners:** the mount installs once from the render body (`installed` guard); `wheel`/`touchmove`/`scroll` are `passive:true` (the engine never calls `preventDefault` on them — W3 asserts). Substitutes for hooks the frozen `Run` lacks: `focusout` on act/Skip as element listeners; a width `ResizeObserver` on `<html>` ends the run as `mutation`; the host itself calls `finish()` on unmount/pathname change, `pagehide`, `beforeprint`, `pageshow(persisted)`, a non-collapsed `selectionchange` in Acts 1–2, and a reduced-motion change.
- **`EVENT_ENDED` fires exactly once per entry:** the engine dispatches for runs it started; the host dispatches only for its own pre-start declines. W3b asserts one event and one `arrival_ended` capture per entry.
- **Fonts:** one loader. W3a keeps B's `faces.ts` (`readFaces`/`loadFaces`) and removes the host's duplicate loader if the two disagree; otherwise the host's stays and B's is unused (report which).
- **Desk ready widens (W3a, page-file owner):** the reviewer showed reads that print inside `<main data-arrival="desk">` after ready end the run as `mutation` on a cold or ORC:1123 Desk. `arrivalReady` becomes `arrivalRoot && hydrated && isSuccess && !isPlaceholderData && !answeredNotesRead.isPending && !reactionRollupRead.isPending && !recentBoardsRead.isPending && viewerStudio.isSettled && !unbilledTimeRead.isPending && deskLineDecided`, where `useDeskLine` exposes `decided` (`line !== undefined`) — all existing hooks, same query keys as the children (dedupes). A slow read then declines `hidden`/`late` (the ordinary page) instead of cutting a played run. Document ready is unchanged; W3b's cold-Document lane delays `projects*` and `proposals*` individually and must show no `mutation`/`drift` declines; if it does, W3a adds `!(row?.engagement_kind === 'project' && projectIsLoading)`.
- **Test style:** `supabase/tests/**` are psql assert scripts, not pgTAP; the gate is `psql -v ON_ERROR_STOP=1 -f <file>` against the local DB (or `scripts/run-sql-tests.sh`). `supabase test db` is not the gate for this repo.
- **Deferred to W3c review, not blockers:** A's minor test gaps (seen_at advance, NULL-uid guard, co-member policy case); `service_role` holds EXECUTE on `mark_arrival` through a pre-existing schema default ACL (not granted by 00675; cannot be narrowed there); the Escape swallow during a cold-load wait can keep a ⌘K palette open for up to 8 s (contract §3 stands).

### 4c. W3 review outcomes and round-4 rulings (2026-09-28, run wf_342ea751-183: integrate 47743dcf1 → lane 54c72659a → three review rounds, fixes 9d241a4bb / 632c6839a / 601454a32; lane at 601454a32 = 83 pass, 1 known cold-server flake, 0 new legacy reds, 0 arrival faults)

Three rounds fixed R-DM21 (act token declines, `data-landing` on the act), the §4b host finishes, the lane's zero-height probe, the trapped act stacking context, the three identity-move replaces, the T3 phone long form and the touch tap click-through. The loop did not converge: nine reviewer contexts raised the same minors in every round. Rulings (Fable), binding on round 4 — the fixer implements all of them, reviewers verify each:

- **Every entry ends with `report()`, including an abandoned wait.** An unmount or pathname change while `arr-pre` is armed reports `{surface, how:'mutation'}` (no cause) exactly once — telemetry, `markArrival`, `EVENT_ENDED` — the same class as a run cut by navigation. `endWait()` alone is never an end.
- **Escape during the ready wait halts the wait** (the mockup's `halt()`), stays swallowed (`preventDefault` + `stopImmediatePropagation`) and reports `{how:'escape'}` with no cause. Other input keeps declining `busy`. §4b's "Escape stays swallowed for the whole wait" is amended to this; Escape is the one gesture that always means "no ceremony", before or during.
- **`pointercancel` releases the press.** The engine installs its own window-capture `pointercancel` listener for the run's lifetime (start → end) that clears the press state, `arr-press` and any pending tap hold; the mount clears `swallowClick` (already). The frozen `Run` surface stays untouched.
- **Nav state advances on every `(document)` commit.** `ArrivalRun` calls `enterRoute()` for non-surface pathnames too (previousPath, the popstate window, the suppression map are spent there); those commits run nothing, set no `arr-pre`, report nothing. A soft commit to `/doc/{id}` whose previous path is under `/doc/{id}/…` (same id) is an identity move → `entry:'replace'`. `pl-from-doc` carries a timestamp, is consumed on the next `/desk` commit whether or not the Desk becomes ready, honoured only within 15 s (`FROM_DOC_TTL_MS` in session.ts), and cleared when `/desk` is left unconsumed. If the Desk roster keys rows by engagement id while `/doc/[id]` may carry another key, the Document stamps `data-arr-engagement` on its route root at ready and the host writes that id on put-down (the fixer checks `desk-claim-card.tsx` hrefs vs `rosterLineAnchorId`; if they always agree, no change, report why).
- **Identity moves are announced.** Every same-engagement programmatic move into `/doc/{id}` calls `suppressNextArrival(target)` immediately before `router.replace`/`router.push`: Brief "Accept · begin", sign/activate moves, the ceremony room's quiet redirects, the drafting room's eviction, the return-to-lead pair (done), the seal turn and authorization doorway (done). The fixer greps every `router.replace(`/`router.push(` under `src/app/(document)` and `src/components/document` and classifies each; a move she chose into another job is a real arrival and stays unsuppressed. Report the table.
- **Busy at the commit** covers every "walk to /desk with a sheet flagged to open on mount" path: `callSheetPending` (done) plus whatever the CommandBar's capture-lead and open-project walks set (read command-bar.tsx; same pattern: cached in the layout effect, declines `busy`, never hides the root).
- **A played arrival owns the viewport.** `begin()` keeps scrolling to `readingY`. The put-down row landing (`pl-from-doc`) and the Document's returning-visitor A8 landing run only for an entry that ends `declined` (they wait on `EVENT_ENDED` while `arr-pre`/`arr-on` is set and run then, or run at once when neither class is present); `pl-from-doc` is consumed either way. A reload plays, so `readingY` wins over scroll restoration (unchanged).
- **The `ARRIVAL_E2E` CSP seam cannot reach prod.** The relaxation applies only when `ARRIVAL_E2E=1` AND `OPEN_NEXT` is unset (`infra/deploy-portal.sh` exports `OPEN_NEXT=true`). W4 also `unset ARRIVAL_E2E` before the deploy and probes the live `content-security-policy` header for `upgrade-insecure-requests`.
- **`deskLineDecided` must be bounded when PostHog is unreachable.** The fixer proves how `useDeskLine` resolves with no `NEXT_PUBLIC_POSTHOG_KEY`, with the flags endpoint blocked, and with it hanging: if `decided` settles within ~1 s in all three (fail-closed default rendered, no later text change), no change; otherwise `decided` becomes true after 800 ms with the fail-closed default rendered so a late resolution never mutates the printed line.
- **`data-arr-long` only where the page prints a label.** `lens-band.tsx` sets `data-arr-long` only when the rendered form is not a sentence (the phone/condensed label); when the band renders a sentence (long or medium tier) the card prints that rendered sentence — D2 "page words" holds at every tier. T3 generalizes: whenever `data-arr-long` is present the headline part is compared to `period(collapse(data-arr-long))`, otherwise to the page; no per-project special case.
- **Test hygiene:** e2e and jest selectors use the token-list form `[data-part~=X]`; a jest test asserts no source under `src/lib/arrival` or `src/components/document/arrival` reads `data-part-long` and that `brief` reads `data-arr-long`; one face reader — `host.faces()` calls `readFaces()` (or the unused export goes).
- **Fix-3 deviation to verify, not undo:** on touch/pen the engine forwards one synthetic act click on release inside the act's pressed rect (a tap's hit test otherwise lands on a `p` after the act goes home); mouse keeps the native click. Reviewers confirm no double activation (native + synthetic) on any pointer type and that a cancelled tap forwards nothing.
- **Deferred, recorded in the ship record, not blockers:** lazy-loading the engine chunk (~16 KB gz on every `(document)` route — a `dynamic import` at commit for surface routes is the v2 shape); the wall-clock watchdog during a focus-paused hold (mockup rule); `window.error`/`unhandledrejection` ending a run (mockup rule; watch the `error` rate); the body `childList` guard vs third-party nodes (watch the `mutation` rate); `@property`-without-`:has()` browsers see the ordinary page; the 1 s popstate window; the `hidden` cause covering both the cap and a tab hide; the first-test cold-server SR flake in the lane (a warm-up request in the lane's global setup if it recurs).
- **Worktree hygiene:** the 16 tracked PNGs under `docs/design` rewritten by the screenshot specs are restored with `git checkout -- <paths>` before W4 (never staged, never `reset --hard`); main's docs commit c5d6090c8 (written on the shared checkout by the round-1 rerun, disclosed, kept) is merged into the program branch so W4's ancestry check holds.

### 4d. Rounds 4–5 outcomes and round-6 rulings (2026-09-29, run wf_0b69d7c9-16a: main merged d6a68a3d5 → fix-4 ea4c80dcf → lane 271b4b788 → fix-5 b2e8fb3f3 → lane 22cc1891c; round 5 = three lenses clean, lane 30/30, 0 new legacy reds, 0 arrival faults)

Every §4c ruling is implemented and verified (a–k, plus the zone-flight listener now ignores ends for other pathnames and the PNGs are restored). Round 5 left minors only. Rulings (Fable), binding on round 6 — small fixes with a confirming review, then W4:

- **Pending-sheet flags are busy only on the surface that opens them.** `captureLeadPending` and `openProjectPending` are Desk flags (busy when `surface === 'desk'` only); `callSheetPending` is a Document flag (busy when `surface === 'document'` only). A stale Desk flag set off the Desk never declines a Document arrival.
- **A wait halted by Escape is unplayed.** `afterArrival` hands the landings `true` when the entry ended `declined` OR when no run ever started for that entry (a run-started marker shared by `ArrivalRun` and the mount; the frozen `ArrivalEnded` shape is unchanged). Escape during the wait therefore still lands the put-down row and the returning-visitor section.
- **Her own scroll during the wait stands.** A `busy` decline whose input was `wheel`/`touchmove`/`scroll` runs no declined-landing (the viewport is hers); key and pointer `busy` declines still land.
- **One landing per entry.** When the entry consumed an act token that carries a landing, the Document's A8 section landing is skipped; the token landing is the only scroll.
- **Lifecycle halts carry their cause:** `pagehide`/`pageshow(persisted)` → `hidden`; `beforeprint` → `busy`; a reduced-motion change → `unsupported`. Never `busy` for a tab hide.
- **href identity moves are suppressed too:** the SignedSeal "Open the project" `DocumentAction` (proposal-watch.tsx), the `open-authorized-project` href (service-agreement-instruments.tsx) and the phone lifecycle action's `/doc/{projectId}` href call `suppressNextArrival(target)` on click. One jest case per site.
- **A touch/pen press on the act that releases after the run ended activates exactly once** (native or synthetic — never zero, never twice); engine + mount test.
- **`EVENT_ENDED` is dispatched even if the telemetry client throws** (separate try blocks in the host's report path).
- **Test hygiene:** the duplicate-key warning in the round-5 page.test regression (siblings with the same key) is removed; `brief.test.ts`'s exact `data-part` equality becomes token-list aware.
- **Deferred (recorded, not blockers):** nav module state across routes outside the `(document)` group (bounded by the group-exit clear and `FROM_DOC_TTL_MS`); the engagement-watch observer's cost on Documents that never stamp; `DESK_LINE_BOUND_MS` 800 ms + quiet window sitting near the 1.2 s cap (monitor `arrival_ended{surface:'desk', how:'declined', cause:'hidden'}` after ship); the lane's first-test SR flake (an authenticated warm-up is the post-ship remedy); the legacy comparison being file-level (the 7 passing files stayed passing; a test-level diff is a post-ship lane task); ledger/accounts/invoice `router.push('/doc/…')` sites (low confidence they are same-engagement moves); the round-3 bundle baseline was not retained — absolute sizes go in the ship record.

### 4e. Rounds 6–7 outcomes and round-8 rulings (2026-09-29, run wf_66331e46-9fd: fix-6 9b8dafae2 → lane green (86/93 pass, 7 skips, 0 new legacy reds) → round 6 = one shared major → fix-7 e08cc9635 → lane INCOMPLETE (agent out of turns at 14/93) → round 7 = doctrine and react-next clean, ship-risk blocked only on the incomplete lane)

Every §4d ruling is implemented (fix-6, 15 files, whole jest green). Round 6 found one real defect, raised by all three lenses: on touch hardware a swipe fires `pointerdown` before `touchmove`, so the wait halted as a pointer press, `waitScrolled` never set, and the put-down row and A8 landings still moved the viewport over her swipe. Fix-7 answers it with a **wait gesture**: a touch/pen `pointerdown` during the wait still halts it (§4b) but records the pointer; the landings' decision is deferred until that gesture closes — `pointerup` = tap (lands), `touchmove` or `pointercancel` = the browser took it for a pan (no landing); mouse presses decide at once. Jest models the real event order; not yet proven in a real browser. Rulings (Fable), binding on round 8 — a small fix, then the lane must COMPLETE, then a confirming review, then W4:

- **Her scroll stands until the landing fires, not only during the wait.** A pending put-down row landing (waiting for `DESK_READY`, up to `HARD_ENTRY_READY_MS`) is cancelled by any `wheel`, `touchmove`, or scroll key (`Space`, `PageUp`/`PageDown`, `Home`/`End`, the arrow keys, with a non-editable target) that arrives after the unplayed decision and before the landing runs. The same scroll keys during the wait itself count as her scroll (`waitScrolled`), like wheel and touchmove. The A8 landing already runs at once on decision and needs no change.
- **A waiter's callback cannot break the press bookkeeping:** each deferred decision runs inside its own try/catch; a throwing landing is swallowed (reported through the existing telemetry path only if one exists) and the remaining waiters and the pointer handlers finish normally.
- **The round-7 change gets a real-browser proof:** one mobile-chrome lane spec — a touch swipe during the wait (CDP `Input.synthesizeScrollGesture` with `gestureSourceType: 'touch'`, or `Input.dispatchTouchEvent` start/move/end) declines `busy`, the row never lands, and `window.scrollY` stays where her swipe left it; a touch tap during the wait declines `busy` and the row lands. If the harness cannot synthesize a real touch pan, the spec is written as `test.fixme` with the reason and the lane report says so.
- **Lane discipline (the rerun-7 failure was procedural):** the lane runs unsandboxed from the first attempt (sandboxed Chromium dies on mach-port rendezvous), one `--project` at a time in the foreground, each with its own log file; no background tasks, no Monitors. The 36 legacy specs are a separate agent after the lane, on :3000, in three batches of 12. `laneGreen` reads a closed status enum, not free text.
- **Accepted as built (the safe direction is "no landing", never a yank):** a `touchmove` without a distance threshold (a jittery tap skips its landing); a gesture that never closes (an OS gesture stole the pointer, the tab hid mid-press) never lands and is cleared at the next entry; a long-press `pointercancel` counts as a pan.
- **Deferred (recorded, not blockers):** the lens band's `aria-live` region during the wait (the engine silences it only from run start; silencing earlier from the host would collide with the engine's save/restore — v2 moves the silence into the host with a single owner); `data-arr-played` set before measurement that can throw (an `error` end before compose suppresses entry moves once); href suppressions on modifier/middle clicks (bounded by the next commit's clear and the 5 s TTL); multi-touch second-finger cancel/up edge cases; a route error boundary swapping the subtree mid-run ends via the watchdog; **correction to §4d's nav deferral:** there is no group-exit clear — `previousPath`/`docEngagement` survive any stay outside the `(document)` group, bounded only by `FROM_DOC_TTL_MS` at write time (a return to `/desk` via `/settings` may still land the last Document's row — acceptable); a put-down from a Document sub-route (`/doc/X/plans`, `/spec-book`, `/boards`) writes no `pl-from-doc`; the unused `eslint-disable` directive at proposal-watch.tsx:147 predates the program; page.test.tsx's pre-existing `flushSync`/`act()` warning noise. Ship record: arrival code ≈ 52 KB min / 20 KB gzip on the `(document)` layout chunk (the §4c "~16 KB" figure was the engine alone). W4: the "no prod ref / no loopback" chunk probe runs on the deploy-portal.sh output and the live site, never on the lane `.next`; `git status` under the sandbox shows `.env*.example` as deleted or EPERM — confirm unsandboxed before merging.

### 4f. Round-8 outcomes and round-9 rulings (2026-09-29, run wf_99f87e8f-be5: fix-8 e2aabbe36 → lane COMPLETE and clean (86 pass + 2 flake-then-pass + 11 skips, 0 arrival faults; the new mobile-chrome swipe spec passes with the real order pointerdown → touchmove → pointercancel) → legacy 36 NOT identical (3 file-level reds under machine contention) → round 8 = doctrine and react-next clean, ship-risk major on the legacy reds only; round 9 lost to an API outage)

Every §4e ruling is implemented. The three legacy reds (`e2e/mood-board/project-board-paths.spec.ts`, `e2e/people/bring-forward.spec.ts`, `e2e/people/call-sheet.spec.ts`) failed only in multi-file groupings, passed alone, and their error contexts are failed data reads from the local stack ("This document could not be picked up", "This paper has no project yet", a GoTrue `Failed to fetch`) while ~40 agent sessions shared the local Postgres at load ≈ 40. The code since the last identical comparison (round 6) touches only arrival-mount.tsx, one exported constant in engine.ts and tests, none of which runs for a webdriver-declined entry. Rulings (Fable):

- **The legacy comparison reruns in a quiet window** (load average under 8, ports 3000/3107 free) with the baseline recipe. A file red in a batch but green when rerun alone AND green when its batch is rerun once is a **file-level flake**, recorded with both results, not a new red. A file red in both reruns is a new red and blocks W4 until the same grouping is shown red on a build of main (test-order or data coupling) or bisected.
- **Confirming review at e2aabbe36 is the round-8 doctrine and react-next verdicts plus a ship-risk rerun** once the legacy comparison is identical or flake-explained; no new code round is required for the round-8 minors.
- **Deferred to post-ship (recorded in the ship record):** a wheel or scroll key that arrives while a touch/pen press that ended the wait is still down is not counted as her scroll (needs a finger held on a touchscreen while a trackpad or keyboard scrolls; the one-line fix is `closeGesture(true)` at the top of `herScroll()` — first post-ship patch); a scrollbar drag, middle-click autoscroll or find-in-page scroll is not seen (§4e lists wheel/touchmove/scroll keys only); the Document's R-DM21 token landing is her chosen destination and is not cancelled by a scroll before `arrivalReady` (design call, §3); the swipe spec proves the outcome and the event order but not the round-7 path in isolation (jest covers that case — optional hardening: a "Desk already ready while the wait is armed" mobile-chrome case).
- **Accepted as built:** Space or an arrow key on a focused button/select/checkbox/ARIA widget counts as her scroll (§4e's "non-editable target" as written; the direction is "no landing", never a yank).
- **W4 ship record and Kody's walk:** touch order is proven in Blink only (the lane's touch project is the iPhone 14 profile on Chromium; the WebKit project is Desktop Safari without touch). The signed-in iPhone walk includes one put-down with a swipe during the wait (the row must not land) and one tap during the wait (the row lands).

### 4g. Round-9 outcome — ship ruling (2026-09-29, run wf_99f87e8f-be5 resumed after the outage: legacy 36 byte-identical to the baseline in two consecutive quiet-window passes at e2aabbe36 (45 pass / 37 fail / 4 skip / 86 did-not-run, 29 failing files, `fileSetIdentical: true`); round 9 = doctrine, react-next and ship-risk all clean, 0 majors, 2 minors at confidence 0.45, 28 notes)

**Ship head = `e2aabbe367ef04f69dc755980ee10567c695cfd1` on `arrival-prod/w3-integration`. No further code round.** The confirming review found nothing above minor and re-verified 00675 live (idempotent, ACL as ruled, anchor test green). Rulings (Fable):

- **Deferred to the first post-ship patch (with §4f's `closeGesture(true)`):** a stationary long-press on the act in Acts 1–2 that the browser takes over (pointercancel with no touchmove — a link preview or context menu on iOS/Android) only clears the press; the mockup advances the card. The card then holds until the 10 s hold timer or any other input, so the failure is a longer hold, never a yank or a broken page. Fix: in the engine's `onCancel`, when the cancelled pointer is the pressed one and `early()`, `advance('input')`; one engine test (pointerdown on the act in hold → pointercancel → phase `assemble`).
- **Accepted as built, optional post-ship:** the put-down landing's `HARD_ENTRY_READY_MS` window is measured from the unplayed decision, not from the Desk commit, so a Desk that declined `late` can still land the roster row up to ~12 s (soft) / ~16 s (hard) after the put-down for a reader who has not scrolled. The landing is her own put-down row and any wheel, swipe or scroll key cancels it (§4e). If "never a yank" is later read strictly, arm the window from the commit.
- **Accepted as built:** A8 on a commit-time-declined Document with a cold row read decides at row load (pre-existing behaviour, §4e says A8 needs no change); the touch specs' `beforeAll` seeds also run on the two skipped projects (idempotent, cost only); the persistent mount imports one regex from `engine.ts` (host side of the seam; no new chunk).
- **Ship-risk monitor (extends §4d's Desk-only monitor to both surfaces):** for the first 24 h after deploy, count `arrival_ended` with `how = 'declined'` and `cause in ('hidden', 'late')` per `surface` against total `arrival_ended` per surface (PostHog). A blank route root for up to `HIDDEN_CAP_MS` (1.2 s) followed by the ordinary page is the ruled fail-safe, but production latency (Worker cold start plus Strata reads) is unmeasured by the lane. **Thresholds: above 25 % of entries on either surface → investigate (the ready marks, not the cap); above 50 % → redeploy the prior version from the rollback worktree** (the W4 ship record carries the command). Kody rules on any change to the budget.
- **Ship record figures come from raw evidence, not summaries:** the lane line is §AA.5 of `qa/arrival-lane.md` — 99 test instances at e2aabbe36: chromium 27 pass / 1 flake-then-pass / 5 skip, mobile-chrome 32 pass / 1 skip, webkit 27 pass / 1 flake-then-pass / 5 skip; the one flake is `accessibility.spec.ts:24` (first test, cold server; the review reads it as a baseline-read race in the spec, not an announcement defect). The legacy line is §AC (two identical quiet-window passes). Bundle figures: lane build ≈ 45.7 KB minified / 18.0 KB gzip of arrival JS across the shared chunk and the (document) layout chunk plus a 3.9 KB CSS file; the deploy build's figures are taken from `.open-next/assets` at ship time.
- **Owed to Kody after the ship:** the signed-in walk on a real screen, phone and VoiceOver (with §4f's swipe-during-wait and tap cases); the first post-ship patch (this section's long-press advance + §4f's `closeGesture(true)`); retire the rollback worktree after the walk; the deferred lists in §4c–§4g stay open as recorded.

### 4h. Post-ship patch 1 — the hidden cap on production latency (2026-09-30)

**Symptom.** In production, opening a Document shows no arrival. The wait arms `HIDDEN_CAP_MS` (1200 ms) at its first sighting of `[data-arrival]`. The Document paints that root as soon as its row resolves, but it earns `data-arrival-ready` only after a waterfall of project-keyed reads (the ticket's rows, the Desk composition, the stage's guide read). At production round trips (Worker → Strata, roughly 300–400 ms) that waterfall outlasts the cap, so the entry ends `declined · hidden` (or `late`) and she sees the ordinary page.

**Before** (`e2e/arrival/latency.spec.ts`, CDP latency added to every request, lane build at 989a8762d; two runs agreed; ms are root → ready):

| project · mode | +0 ms | +150 ms | +350 ms |
|---|---|---|---|
| chromium · hard | played (skip) · 287 | declined hidden · 2558 | declined late at 8003 · page error ("could not be picked up"), auth lock 23 not released / 11 broken |
| chromium · soft | played (skip) · 284 | declined hidden · 2087 | declined hidden · 5042 (entry → ready 6588) |
| mobile-chrome · hard | played (skip) · 255 | declined hidden · 2568 | declined late at 8001 · page error, same lock counts |
| mobile-chrome · soft | played (skip) · 251 | declined hidden · 2111 | declined hidden · 5093 (entry → ready 6643) |

**Ruling: option A.** While an arrival wait is armed for a path, that path's page keeps its own loading state until ready, so the route root first appears already ready and the hidden cap covers only quiet + faces. The budget is unchanged (§4g: Kody rules on any change to it); `types.ts` stays frozen.

**Changes.**
- `arrival-mount.tsx` — a `useSyncExternalStore` store: `setArrivalWaiting(cancel, pathname)` records the armed path; `useArrivalWaiting(pathname)` is true while that path's wait is armed (server snapshot false). It goes false when the wait ends (begin, decline, her hand, Escape), on abandon and on route exit.
- `arrival-run.tsx` — the arm passes `pathname`; one comment at the hidden cap on why it now covers only quiet + faces. The `arr-pre` CSS failsafe (1.5 s from the root's first appearance) still composes: the root now first appears ready.
- `doc/[id]/page.tsx` — after the error and missing returns, `arrivalHeld = waiting && !arrivalReady && !rootShownThisMount`. Round 1 rendered a "Picking up…" tree with only `{ticketFacts}` mounted beneath it; **round 2 (review fixes) keeps the whole paper mounted at its own tree position** (every read starts beside the ready waterfall, so no answer lands after ready into a played run), unmarked: `data-arrival-held="document"` in place of `data-arrival`, hidden by `html.arr-pre [data-arrival-held="document"]{opacity:0}` (arrival.css), with "Picking up…" as a zero-height sibling ahead of it. `data-arrival="document"` is set in the same render in which ready turns true. All four ready conditions are kept. A root this mount has shown is never taken back. The lens line's impression does not fire from the held paper (N-11). The resume jump is back to its pre-patch form (the paper is mounted when the wait ends).
- `desk/page.tsx` — the skeleton stands (no route root, no roster) while `arrivalHeld`; the same latch. The error state is never held. Round 2: `<main>` carries `data-arrival-held="desk"` while held with its read in hand (not while the read is still loading, nor in the error state).
- `arrival-mount.tsx` (round 2) — a press during the wait swallows its click when it lands in `[data-arrival]` **or** `[data-arrival-held]`: ending the wait shows the page in the held tree's place before the tap's click is hit-tested. The Desk's header controls sit inside the held `<main>`, so a press on one during a data-present hold now ends the wait without its click.
- Tests: the store (arrival-run.test.tsx), the Document hold (page.test.tsx: the whole paper mounted but unmarked, the same node once ready), the Desk mirror (desk/page.test.tsx), the held-tree swallow (arrival-mount.test.tsx), the CSS rule (engine.test.ts B8). `latency.spec.ts` asserts that the Document plays in every cell: card visible → **dwell** (round 2: at least 1.5 s, and until 2 s after the last Supabase request, capped at 6 s) → the card is still up (no `how: 'mutation'` cut) → Skip → last end `how: 'skip'`; `awaitReady`'s trailing wait is 3 s. `play-document.spec.ts`'s cold-Document test dwells the same way before its Skip. `touch-tap.spec.ts` (hasTouch) taps the held Desk skeleton and the Document's "Picking up…" during an armed hold: the wait ends `declined · busy`, no click reaches the page, no navigation.

**After, round 1** (same spec, asserting, but Skip pressed the moment the card showed, which hides a `mutation` cut; lane build `nUjk05YEzwtRsy5koUGVs`; 10 passed / 2 failed / 6 skipped (webkit); root → ready is 0 ms in every cell whose root rendered; ms are entry → ready. The review found 39–45 root mutations after ready in the +150 cells, the last ~1.27 s after ready, from reads the unmounted paper started at ready):

| project · mode | +0 ms | +150 ms | +350 ms |
|---|---|---|---|
| chromium · hard | played (skip) · 1129 | played (skip) · 4734 | **red**: declined late at 8002 · page error ("could not be picked up"), no root ever rendered, auth lock 23 not released / 11 broken (unchanged from before) |
| chromium · soft | played (skip) · 309 | played (skip) · 1547 | played (skip) · 3741 |
| mobile-chrome · hard | played (skip) · 756 | played (skip) · 4746 | **red**: declined late at 8001 · page error, same lock counts |
| mobile-chrome · soft | played (skip) · 272 | played (skip) · 1541 | played (skip) · 3721 |

The two reds are not arrival declines. The Document's own resolution fails behind supabase-js's `auth.getUser()` navigator lock (16 serial `/auth/v1/user` calls, the lock stolen past 5 s), which is the rig limit the spec's header names (HTTP/1.1, six connections). The incident report saw "no arrival" in production, not this error page. Soft +350 played with ~260 ms to spare under `SOFT_ENTRY_READY_MS` (entry → ready 3721–3741 ms, down from ~6.6 s before).

**After, round 2** (review fixes: the whole paper held mounted; the spec now dwells before Skip and asserts the card is still up; lane build `BeIJMW1iRpgY5tTZ_LxFu`; two runs, each 6 passed / 6 failed / 6 skipped (webkit), the same six cells red; the table is run 1; root → ready is 0 ms in every cell whose root first rendered ready; ms are entry → ready):

| project · mode | +0 ms | +150 ms | +350 ms |
|---|---|---|---|
| chromium · hard | played (dwell, skip) · 1359 | played (dwell, skip) · 5701 | **red** (unchanged): declined late at 8002 · page error, no root, auth lock 23 not released / 11 broken |
| chromium · soft | played (dwell, skip) · 503 | **red**: card cut `how: 'mutation'` 1054 ms after ready (entry → ready 2668) | **red**: declined late at 5123 (entry → ready 6575); the Desk declined late too and needed one retry; auth lock 26 / 14 |
| mobile-chrome · hard | played (dwell, skip) · 964 | played (dwell, skip) · 5647 | **red** (unchanged): declined late at 8003 · page error, auth lock 22 / 10 |
| mobile-chrome · soft | played (dwell, skip) · 445 | **red**: card cut `how: 'mutation'` 1063 ms after ready (entry → ready 2674) | **red**: declined late at 5134 (entry → ready 6587); the Desk the same, one retry; auth lock 26 / 14 |

Run 2 (same build) agrees cell for cell: chromium hard 1202 / 5698 / late at 8003 with a page error; chromium soft 509 / cut 1033 ms after ready (ready 2704) / late at 5110 (ready 6578); mobile-chrome hard 933 / 5686 / late at 8001 with a page error; mobile-chrome soft 448 / cut 1089 ms after ready (ready 2647) / late at 5144 (ready 6618).

What the round-2 reds are:
- **Soft +150 — the lens's resolve pass, not a late read.** A diagnostic spec (scratch, not committed) recorded every root mutation after ready with its path, and every non-static request; its third run also recorded `data-lens-resolved` and `data-density` writes. In all three runs the cutting mutation is the same one: the in-frame `approvals` region promoted `quiet → full` (its quiet leader replaced by "New approval", the status line reprinted, the body printed), at ready + 1040 / 1064 / 875 ms. In the third run the shell's `data-lens-resolved="true"` and the region's `data-density="full"` are written in that same frame. The lens resolves the paper when no query is fetching and its height has held three frames, or 3 s after mount (D-B46, `use-lens-density.ts`). Which of the two fired here was not isolated: the only reads in flight after ready were serial Sanity `helpContent` fallback chains that started after ready, and in the third run one of them was still in flight at the resolve, which points to the 3 s deadline. The resolve pass is exempt from the lens freeze by the W4F3-05 architect ruling. In none of the three runs did a Supabase read end in the last 575 ms before the cut. Round 1 had the same exposure (masked by its instant Skip); before the patch no +150 cell played. In the hard +150 cells the last root mutation after ready lands at ready + 191 / 200 ms, before the run begins (the quiet window absorbs it); that the lens resolves inside their longer ready waterfall is an inference, since the diagnostic ran on soft only.
- **Soft +350 — the paper's reads compete again.** With the whole paper reading beside the ready waterfall, entry → ready returns to its pre-patch ~6.6 s (round 1, with only the ticket mounted: 3.7 s), past `SOFT_ENTRY_READY_MS`. On this rig the six HTTP/1.1 connections to 127.0.0.1:54321 queue those reads and the auth lock breaks (26 / 14, where round 1 had none at soft); production Supabase is HTTP/2. How much of the gap the rig's connection limit makes is not measured.
- **Hard +350** — unchanged from before and from round 1 (the rig's auth-lock limit, not an arrival decline).

**Known limits.**
- A warm Desk entry whose root renders in the same commit that arms the wait (the put-down, the CommandBar keeps the Desk read hot) is not held; the cap runs from that commit as before. Restarting the cap per root appearance, or holding on `!hydrated`, would each need a ruling.
- The Desk's header controls sit inside the held `<main>`: during a data-present hold, a press on one ends the wait and its click is swallowed (the reviewer's marking of `<main>`). Before the patch the whole root, header included, was hidden and swallowed the same way.

**Owed.**
- **Kody ruling — the late hold.** As built (option A as ruled), a wait that has not reached ready holds "Picking up…" over the hidden paper (Document) or the skeleton (Desk) until the entry cap: 4 s from the pathname commit on a soft entry, 8 s from `timeOrigin` on a hard load. Before the patch the root showed as soon as it could render and the hidden cap declined 1.2 s later. **Alternative to rule on: bound the hold to row-resolution + `HIDDEN_CAP_MS`** — the page shows at most 1.2 s after its first renderable commit, declining `hidden` wherever the ready waterfall outlasts that (the production symptom at +150 / +350 comes back for those entries). Either way a press, key, wheel or swipe ends the hold at once.
- **Kody ruling — the soft +150 cut.** Accept it (the card is cut ~1 s in whenever the lens resolves after the run begins), or choose a fix: (a) the Document's ready also waits for `data-lens-resolved` (bounded by `LENS_RESOLVE_MAX_MS`, 3 s after mount) — this contradicts §3's "quiescence is never global `useIsFetching`"; or (b) the lens holds its resolve pass while a run is in Acts 1–2 — this reopens the W4F3-05 ruling. Neither is built.
- **Kody ruling — soft +350 on the rig.** Accept it as the rig's HTTP/1.1 connection limit alongside the hard +350 red, or measure soft entry → ready on HTTP/2 (production, after deploy) before ruling.
- **Kody ruling — the hard +350 red** (unchanged): accept it as the rig's auth-lock limit, or open the hard-load `auth.getUser()` waterfall as its own item.
- **PostHog watch after deploy**, first 24 h, per `surface`: `arrival_ended` with `how = 'declined'` and **`cause = 'late'`** against all `arrival_ended`. **Above 10 % of entries on either surface → put the alternative bound (row-resolution + `HIDDEN_CAP_MS`) to Kody**; §4g's thresholds on `hidden` + `late` together (25 % investigate, 50 % roll back) still stand. Also count `how = 'mutation'` per surface: above 10 % of played Document runs → the soft +150 ruling above is no longer theoretical.
- Option C (prefetch the Document's ready reads from the name link) is parked.

## 5. Pieces, owners, file boundaries, scoped verify

Fixed shared runtime: **one** local Postgres (:54322, shared across sessions — `migration up`, never reset), lane port **3107**, legacy port **3000** (assert free first). Disk: ≥ 45 GiB before any wave.

### W0 — orchestrator + one baseline agent (read-only main; own worktree, retired)
- Reserve `00675` in `docs/engineering/migration-number-reservations.md` (lands in W1's commit).
- Baseline the 36 legacy specs (`grep -rlE "goto\(['\"\`]/(desk|doc/)" apps/designer-portal/e2e`) on main `7dbd203bc`: `NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'` + LOCAL trio exported, `SUPABASE_ORIGIN_RUNTIME` unset, `next build --webpack && next start -p 3000`, base config reuses the server. Record pass/fail per spec → `artifacts/arrival-production-2026-09-27/qa/legacy-baseline.md`. Gate later = **no new reds**.
- Kody: `cd apps/designer-portal && npx wrangler login` (auth expired). Then read-only `npx wrangler versions list --name patina-designer-portal` to confirm a prior version id exists.

### W1 — shared surface (one worktree, **Opus**, retired before W2)
Pathspecs: `src/lib/arrival/types.ts` (verbatim §4), `src/lib/arrival/__tests__/boundaries.test.ts` (layering) and `brief-marks.test.tsx` (renders the real `DeskClaimCard`, `LensBand`, `DocLetterhead` in jest and asserts the marks), the inert marks in `desk/page.tsx`, `doc/[id]/page.tsx`, `desk-roster.tsx`, `desk-claim-card.tsx`, `doc-letterhead.tsx`, `letterhead-vitals.tsx`, `lens-band.tsx`, `doc-spine.tsx`; the reservation doc line.
Verify: `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal lint && pnpm --filter @patina/designer-portal test -- --findRelatedTests <touched files>`.

### W2 — three disjoint worktrees, none runs `next build`
**A · DB, write-only (Sonnet).** `supabase/migrations/00675_arrival_anchors.sql` (table per `research/briefing-data.md §3`: `UNIQUE NULLS NOT DISTINCT`, shape check, RLS owner-only SELECT, REVOKE ALL from PUBLIC/anon/authenticated then GRANT SELECT to authenticated; `mark_arrival(p_scope text, p_engagement_id uuid default null) returns timestamptz` SECURITY DEFINER `SET search_path = public, pg_temp`, `auth.uid()` guard, 30-min `previous_seen_at` rule, EXECUTE to authenticated only); `supabase/tests/document/arrival_anchors_test.sql` (pgTAP, `BEGIN … ROLLBACK`: first call returns null, second within 30 min keeps previous, after 30 min rolls, desk NULL key upserts once, anon denied, co-member cannot read another's row); `supabase/seed/00-legacy-grants.sql` **regenerated via `scripts/generate-legacy-grants.py`** (never hand-edited); `apps/designer-portal/src/lib/arrival/mark-arrival.ts` (plain `rpc`, errors swallowed, no react-query). No `database.types.ts` regen.
Verify (unsandboxed Supabase CLI — it reads `supabase/.env.local`): `supabase migration up --include-all && supabase test db supabase/tests/document/arrival_anchors_test.sql`, then `psql … -c "\df+ public.mark_arrival"` shows SECURITY DEFINER + ACL.

**B · engine (Opus).** `src/lib/arrival/{gate,brief,plan,collect,engine,faces}.ts`, `src/lib/arrival/arrival.css` (mockup CSS ported: `arr-pre/arr-on/arr-asm`, sentinel, reduced-motion layer, Skip, hint, status, `[data-arr]` pointer exemption, `[data-arr-played]` suppressions, `[data-arr-unclip]{overflow:visible!important}`), `src/lib/arrival/__tests__/*` (jest; WAAPI mocked — jsdom lacks `Element.animate`; ports of the mockup's B1–B13 pure/DOM assertions; T4 shuffled rows; TZ cases; StrictMode double-invocation of a gate+start pair yields one visit stamp and one token consumption). Implements §3 carriers, clone layer, D1 ladder, D2 composition, guards, watchdog, one-announcement, `readingY`, Skip, Tab/focus rules.
Verify: `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal lint && pnpm --filter @patina/designer-portal test -- src/lib/arrival`.

**C · host (Opus).** `src/components/document/arrival/arrival-mount.tsx` (persistent, non-keyed: once-installed window-capture listeners, `mark()` visit refresh on any hand input, popstate/entry classification, token write on `[data-part="act"]`/name-link clicks via delegated capture, `pl-from-doc` rAF scroll), `src/components/document/arrival/arrival-run.tsx` (keyed on pathname: layout-effect `arr-pre`, `location.search`/hash read in the layout effect — before DeskDoorway's passive strip — `callSheetPending` decline, ready wait with caps, `start()`, `finish()` → `markArrival` + telemetry + `EVENT_ENDED`), `src/lib/arrival/host.ts` (`busy()`, `ready()`, `view()`, `faces()`, `suppressNextArrival(path)` store), `src/lib/analytics/document-events.ts` (`arrivalEnded`). **No page-file edits; no layout.tsx edit** (W3 wires it). Standalone jest renders with the chrome stubs proving listener order and StrictMode idempotence.
Verify: `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal lint && pnpm --filter @patina/designer-portal test -- --findRelatedTests <touched files>`.

### W3 — one merged branch (W2 worktrees retired first; ≤ 3 worktrees incl. W3b/W3c)
**W3a · integrator (Opus, single owner of every page file).** Mount `<ArrivalMount/>`/`<ArrivalRun/>` first in `(document)/layout.tsx`; `suppressNextArrival(path)` before the three same-path `router.replace` sites (`doc/[id]/page.tsx:1266-1279` seal turn + authorization doorway; `desk-doorway.tsx:148,203`); Document consumes the act token → its own landing call (`page.tsx:1160-1201, 1837-1886`); zone-flight clock reset on `EVENT_ENDED` (`page.tsx:1294-1351`); anything W2 proved impossible without a page edit. Full-tree gates: `type-check`, `lint`, `test` (whole designer-portal jest suite).
**W3b · lane author (Sonnet, separate context).** `apps/designer-portal/playwright.arrival.config.ts` (port 3107, `reuseExistingServer:false`, projects `chromium`, `mobile-chrome`, `webkit`, **no literal keys** — the secret-scan trap), `e2e/arrival/*.spec.ts`: B1–B13 on the real routes (visibility via `elementFromPoint`/screenshot, not rects), P1–P5 (P1 plays on the seeded Desk; P5 mid-hold mutation leaves no inline transforms), failure injections B7–B9 (CSS missing → sentinel decline; fonts never resolve → decline; `--arr-ok` absent), cold Desk (`**/rest/v1/**` delayed 3 s: skeleton + CommandBar visible, then the card plays), Escape mid-hold stays on `/doc`, Escape in the wait, chrome clicks and `t`/`?`/`g l` in Acts 1–2 advance only, Stripe return `?book=orders&checkout=success` declines and its sheet opens, T3 live drift on both routes, one-announcement incl. the band stop line, Desk-after-Document-first-visit plays, setup-whisper coexistence, phone long-form headline, `window.__PATINA_SUPABASE_ORIGIN` is loopback. Seeds: `seedWorkflowGateFixture()` + `LONG_PAPER_ID`, **settle `help_state` walkthrough** (else the WelcomeModal is busy). Build once: flag overrides + loopback trio exported, `SUPABASE_ORIGIN_RUNTIME` unset, `next build --webpack`; `grep -rl bkvcixdmuyejfzcijpdg .next/static` must be empty; lane on `next start -p 3107`; the grep-derived 36 legacy specs on `next start -p 3000` (assert :3000 free) vs the W0 baseline → **no new reds**. Findings → W3a.
**W3c · adversarial review (Opus, separate context; loop until dry).** Report every finding with confidence + severity — no severity filter. Checklist: T3 live on seeds; T7 + D2; one SR announcement; Escape swallowed in Act 3 and the wait; chrome/shortcut swallowing; setup-whisper coexistence; ORC:1123; R-DM21 landing; `finish()` always restores; hidden cap honoured on a cold Desk; StrictMode; nothing hides chrome; no `useIsFetching`; `errorSurface` on any mutation; migration ACL. Fixes → W3a, then re-review.

### W4 — ship (one agent, unsandboxed Supabase/wrangler; gated on W3c clean + W3b green + no new reds)
1. `git diff --stat -- .claude/settings.json` empty; `df -h`; `npx wrangler whoami` authenticated; merge the program branch into `main` (real merge), push.
2. Record the prior version: `npx wrangler deployments list --name patina-designer-portal` **bottom row** + `versions list`; stage the rollback worktree at the pre-merge SHA (`pnpm install`, package dists built).
3. `supabase migration list --linked` shows **only 00675** pending → `supabase db push --include-all` → probe: authenticated `select public.mark_arrival('desk')` returns; anon `rpc/mark_arrival` → 401/403; `arrival_anchors` row exists for Kody.
4. Same shell: export `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY`, `SUPABASE_ORIGIN_RUNTIME` from `apps/designer-portal/wrangler.jsonc` production vars (node JSONC strip, `research/gates-deploy.md §d`) → `./infra/deploy-portal.sh designer`.
5. Verify: deployments bottom row newer than the deploy start; enumerate CSS/JS chunk paths from `.open-next/assets` and `curl` them on `https://app.patina.cloud/_next/static/...`: `--arr-ok` present, `127.0.0.1` and placeholder strings absent (the 2026-08-26 incident class); `/api/version` 200; `wrangler tail` quiet.
6. Signed-in walk (Kody, or claude-in-chrome after confirming `navigator.webdriver === false`): Desk plays; a Document plays; Escape; Skip; Stripe return declines; put-down lands the row.
7. Rollback lever, documented in the ship record: `deploy-portal.sh designer` from the staged worktree (or `npx wrangler rollback <id> --name patina-designer-portal --yes` only if verified live). The migration stays (additive); `pl-*` keys are inert.

Post-ship: `docs/vision/VISION-DECISIONS.md` ship record (R155); US-14 story log; memory; retire every worktree; push.

## 6. Design-reopen evidence
- A reachable page state whose card part has no printed node (T3 cannot hold) → reopen §4 marks.
- The seeded Desk under `next start` cannot reach ready inside the hidden cap → reopen §3 budgets.
- The frame-0 drift check declines on seeded routes → reopen the marks/lift.
- A legacy spec goes red for an arrival cause the webdriver seam should have prevented → reopen the seam.
- The clone landing (D1) cannot land within ±1 px / 120 ms on the real node → reopen D1.
