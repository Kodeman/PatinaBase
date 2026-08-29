# Shared planks — the floor under both proposals

*Written for X and Y before either of them drafts, for the two revisers, for the merge author, and for the mockup builder. Fourteen moves. Neither author argues them; both adopt them, both mockups draw them the same way. What is left after these is the argument the program is actually for.*

---

## The test for a plank

**A plank that could appear in only one proposal is not a plank.** If a move only makes sense when the spine is the instrument, or only when the header is, it belongs to that author and it has been struck from this file. What survives here is the set of moves the measured evidence forces whatever thesis wins — so that a judge comparing X and Y is comparing two theses and not comparing two accidents.

Every plank carries four lines: **the move** in one sentence; **forced by**, with the F-ids from `research/31-verified-findings.md` and the number each one carries; **drawn**, one sentence, so both mockups draw it identically; **forbids**, the one thing it takes off the table.

Three standing notes.

- The seed is thin — 3 FF&E lines, 0 rooms (F05). Where a plank moves differently on the Vandersteen specimen's 60-line schedule, the plank says so.
- The engineering path here agrees with `research/29-panel-e1.md`. Where E1 names a fork — continuous seam versus three discrete steps, index rows with values versus index rows without — the fork is the author's, not the floor's.
- Canon latitude applies (instruments §5). Amendments are named, never priced. NG1–NG4 stand.

---

## SP-01 · One region-spacing token, and the fold does not change it

**The move.** One token — call it `--doc-region-gap` — sets the distance between one region and the next, `RegionHead` or its wrapper owns it instead of each call site, and a region's gap is the same whether that region is open, condensed or folded.

**Forced by.** F73 — measured button-to-button on the same document at every width and every scroll state: header-stack-end→`Schedule` **56px**, `Schedule`→`Pieces` **29px**, `Pieces`→`money-head` **6px**. Three answers to one question, scroll-invariant and width-invariant, on a set of seams that reads as one uniform list; the ask's own words are *each section is crammed into the next*. F154 — the guide (`document-guide.tsx:75`, `my-5 … py-4`) and the red-letter zone (`red-letter-zone.tsx:85-88`, no margin at all) have different heights, so which one renders moves every region below it, per document. F91 — the measuring instrument itself mis-attributes 433 of 775px at rich/1440/s2, because nothing on the page marks where one region stops. The call-site table (`research/10-code-anatomy.md` §6) carries the sharpest case: approvals open is `mt-6 … py-6` and **approvals folded is a bare `<div data-index-region="approvals">` with no wrapper at all** (`approvals/project-approval-document.tsx:588` vs `:565`) — so today folding a region silently changes the gap around it as well as its height.

**Drawn.** Every region seam in both mockups sits at the identical vertical distance from its neighbour, measurable with a ruler laid on the PNG, in every state including folded and condensed.

**Forbids.** No region may set its own outer margin at its call site.

---

## SP-02 · Condensed, folded and empty are three different readings in a still

**The move.** A region the lens has quieted, a region she folded herself, and a region with nothing in it are three visibly distinct things on a screenshot — no hover, no expansion, no memory of the transition required — and the same discipline applies one level down, where *nothing yet* and *not known yet* get one printed form each.

**Forced by.** F54 — `FoldSeam` renders identically (italic name, mono summary, `UNFOLD ↓`) whether the fold came from her own `localStorage` choice or from a live-derived default. F89 — `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED UNFOLD ↓` and `Schedule dates UNFOLD ↓` are both folded on arrival; the key `patina:doc-fold:{docId}:{region}` outlives the session, so a fold from three weeks ago is indistinguishable from a shipped default. F59 — the pinned ticket seam and a chosen region fold already share one three-part grammar (name · summary · unfold verb) and so read as one kind of thing. F108 — in the rail, the fallback string (`Money unread`, `Nothing moving yet`) and the live value (`$6,200 OWED`) print at the same size, weight and row position. F156 — seven regions invent three negation patterns for the same zero: `no budget yet`, `NO DECISION LEAD · NO APPROVALS AUTHORED`, `No rooms yet` / `Nothing filed` / `Nobody on it yet`. A lens that condenses on scroll performs this ambiguity ten times as often as the fold does, unasked.

**Drawn.** Both mockups print a still, side by side, of one region in each of the four readings — full, condensed-by-position, folded-by-her, empty — with the one mark that separates each from the next visible in the PNG at 100%.

**Forbids.** No organ may print the same string for a region that is condensed and a region that is empty.

---

## SP-03 · Nothing above the reading line moves

**The move.** Any density, fold or pin change alters ink, opacity-free type weight and reserved height *below* the reader's line; nothing at or above it changes position, and the words she is reading stay on the pixel they were on.

**Forced by.** F04 — at scrollY 280 the ticket swaps 347.25px → 64.06px in one React commit and the first region head's document Y jumps **−283.19px**; sampled every ~17ms for 400ms, 23 of 23 samples read exactly 64.0625px, so there is no interpolation in either direction. F113 — that 283px jump does not appear in `PerformanceObserver` layout-shift entries in either motion register, so no instrument in the tree currently catches it. F79 — the one shift that *is* recorded, 0.1189 of a 0.1286 total, is the `NEEDS ATTENTION · IN ONE PLACE` block and the schedule content arriving from a query at ~3.3–3.6s, seconds after she has started reading. F87 — the schedule's zero-height pinned glance offsets itself by `top: var(--doc-seam-height)` (`globals.css:1026`), so a seam that changes height while she reads slides that glance against the paper every frame. F60 — R99's zero-shift mechanism exists in exactly one place and not in the ticket's own fold.

**Drawn.** Both mockups show the same paragraph of body text at the same y across a before/after pair of the lens changing state, with the changed height taken from reserved space below the line.

**Forbids.** No block that can arrive late may render into unreserved height.

---

## SP-04 · One writer publishes one seam height, and everything lands by it

**The move.** Whatever sticky band the proposal builds, exactly one element measures and publishes its height (`--doc-seam-height` keeps its name and its single writer), every landing target clears that value, and any programmatic scroll freezes it at its condensed floor for the duration of the move.

**Forced by.** F34 — a seam whose height changes during a smooth scroll mis-lands the region head by up to a full seam height, because `scroll-margin-top` is resolved once, at `scrollIntoView` call time. F44 — the published value is *measured*, and its deps include `seam.identity` and `seam.exceptions` (`job-ticket.tsx:258`), so at 390 the seam already wraps and a two-exception seam is taller again; the height is content-dependent, never a constant to hard-code. F45 — the 700ms jump lock (`use-document-running-index.ts:35`) already holds the reading line through a smooth scroll and measured zero flicker across four index clicks; it is the only place a lens could freeze the seam, and today it does not own it. F120 — `scroll-margin-top` is set on `[data-index-region]` roots only (`globals.css:1034`, `:1037`, `money-region.tsx:48`); ticket-row links, Fold buttons and FF&E line controls carry none, so a landing on a child control still lands under the band. F68 — the shadow budget is spent (`studio-drawer`, `margin-item`, `doc-sheet`) and `shadow-gate.test.ts` fails on any new one, so the band separates from the paper by rule weight alone.

**Drawn.** In both mockups the pinned band's lower edge is `--rule-mid` (1.5px `#2C2926`), never a shadow, and every region head lands exactly one band-height below the viewport top.

**Forbids.** No second element may publish a height that anything else measures against.

---

## SP-05 · The pre-work spreads get whatever the project spread gets

**The move.** Whatever the rail becomes, it becomes the same thing on brief, discovery, direction and proposal — those four spreads get real regions with real heads, and an index row is allowed to be a name and a position with no number behind it.

**Forced by.** F16 — the proposal document renders **zero `[data-region-head]` and zero `[data-index-region]` elements**, confirmed twice by direct DOM query; its content is inline in `page.tsx` with a plain head at `:2006`. F12 — proposal at 1440/s0: the 200px spine prints `← PUT DOWN`, four marks, `Proposal` / `AWAITING SIGNATURE`, `JUST YOU · VISIBLE TO THE STUDIO` — **ink 13.9%**, longest empty run **657px**. F94 — at 390 the same document exposes no region landmark of any kind. F20 — above its own answer a proposal prints eight ticket rows of absence (`No rooms yet` · `5 unspecified` · `Nothing filed` · `0 of 5 specified · by room` · `No boards yet` · `Nothing moving yet` · `No dates yet` · `No roster yet`, ~300px) on a document that already says `THE JOB · PROPOSAL`. F157 — the rail's timer is absent there too, because time attaches to projects; a data gate, not an empty session. Four of the seven spreads are in this condition, and they are the spreads a new engagement starts on.

**Drawn.** Both mockups carry a pre-work spread at 1440/s0 whose rail is populated by the same component and the same grammar as the project spread's, with at least one row printing a name and no value.

**Forbids.** No organ may derive its content solely from the presence of `[data-region-head]` in the DOM.

---

## SP-06 · Every condensation names where focus goes

**The move.** Any act or automatic change that unmounts or quiets content states its focus destination, and that destination is a real element — the model already in the tree is the unfold, which lands on `<h2 id="money-region-heading">`.

**Forced by.** F08 / F41 — measured: focus starts on `Sync from the schedule` inside `#money-region-body`; after Fold, the body is null and `document.activeElement` is `<body>`. Unfolding is disciplined; folding has no equivalent. F52 — the pin, triggered by scroll alone, relocates keyboard focus onto the ticket's Fold button for a reader standing on a row the pin unmounts. F42 — the same 283px change is silent for every screen-reader user who was not already inside the ticket, since `job-ticket.tsx` declares no live region. A lens multiplies both events by the number of regions.

**Drawn.** Both mockups' state machines print a focus destination in every transition row; no row reads "—".

**Forbids.** No transition may leave focus on `<body>`.

---

## SP-07 · Scroll may change density; it may never write a choice she did not make

**The move.** Position-driven density is a fourth, lowest, non-persisting voice that moves a region only between full and quiet — never to folded, never through `localStorage`; her explicit fold outranks it and survives every scroll.

**Forced by.** F39 — `folded = forceOpen ? false : (explicit ?? latchedDefault ?? false)` (`use-region-fold.ts:121`), and every path that changes `folded` either writes `localStorage` (`:129-135`) or is a caller prop; there is no non-persisting slot, so a scroll-driven fold would remember a state she never chose. F64 — with `explicit === null`, a `defaultFolded` that resolves true after first paint flips a region shut with no gesture from her (`:110-116`). F71 — `setFold(null)` in the effect keyed on `[pinned]` (`job-ticket.tsx:236`) already destroys her `UNFOLD ↓` the moment she scrolls back above the sentinel; the lens must not generalise that behaviour. F54 — and because a fold from her hand and a fold from the system look identical today, a persisted machine fold is unrecoverable by inspection.

**Drawn.** In both mockups a region she has folded stays folded in the state where the lens would otherwise have brought it to full, and prints the same seam it printed before.

**Forbids.** Scroll position may not write to `patina:doc-fold:{docId}:{region}`.

---

## SP-08 · One fact, one printing, per frame

**The move.** When two organs can print the same fact, the design names which one yields in each state, and the loser prints nothing rather than a second copy in a second register.

**Forced by.** F10 — five money statements and four numbers on one screen: `MONEY $6,200 owed you, 15 days · $16,330 deposit not drawn` (ticket) · `Money` / `$6,200 OWED` (spine) · `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14` (red letter) · `MONEY · SENT / INV-2026-W02` twice (margin). F29 — approvals emptiness printed twice 540px apart in two type registers: rail at y252 `Client approvals` / `0 IN THE LOG`, paper at y792 `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED UNFOLD ↓`. F102 — the rail's `Pieces` row duplicates the page's own 24px `<h2>` `Pieces` verbatim, at 13px. F82 — two In-hand clocks in one frame that **disagree**: the spine card `IN HAND` / `18 min` and the drawer `IN HAND TODAY 1h 00m` at 1440; `In hand 20m` against `1h 12m` at 1280. F78 — the sent state prints twice, in two tenses, with two nudges. This is the plank that decides the M-2 ⟷ M-8 redundancy for both authors on the same terms.

**Drawn.** Both mockups annotate, at s2, which organ owns each of the four standing facts — identity, worst exception, money rung, position — with the other organs silent on it.

**Forbids.** No new organ may reprint a fact another organ prints in the same frame.

---

## SP-09 · The paper names the job at every offset

**The move.** The household or project name is on screen at s0, s1, s2 and s3, at all three widths, in whichever organ the thesis puts it in.

**Forced by.** F13 (blocker, 0.95) — the pinned seam prints `THE JOB · PROJECT` over `$6,200 owed you · 3 unspecified` and `UNFOLD ↓`; the rail prints `Project` / `ACTIVE`; neither prints `Chen Residence` or a household, and at seam, mid and foot **no frame contains the client's name**. F77 — at the foot there is no client name, no route back up, and 40%+ of the frame is blank. F56 — a returning reader is dropped at `[data-active-section]`, so after ten days away the first frame she sees can already have `Chen Residence` scrolled off. F116 — at s3 the rail says `Money` while the frame shows `AUTHORIZATIONS & TRADE SCOPES`, so the one label that persists is also wrong there.

**Drawn.** In every one of both mockups' twelve cells, the project name is legible somewhere in the frame.

**Forbids.** No state may carry identity only at s0.

---

## SP-10 · Every ticket row keeps a destination below the seam

**The move.** The eight derived rows are sorted once — orientation, door, fact — and every row has a named home at every scroll state; a row whose home is "the top of the document" is a row that has left the product.

**Forced by.** F09 — `BOARDS`, `DRAWINGS`, `SPEC` and `PEOPLE` are ticket rows; once the seam pins, the frame carries only `THE JOB · PROJECT` / `$6,200 owed you · 3 unspecified`, and the rail lists `Client approvals`, `Schedule`, `Pieces`, `Money` — none of the four. Six of the eight doors exist only at s0. F27 — five of eight rows print only absence (`ROOMS No rooms yet`, `DRAWINGS Nothing filed`, `BOARDS No boards yet · start one`, `DATES No install date yet`, `PEOPLE Nobody on it yet`), 180px of a 900px frame; on the specimen those rows carry payloads and still cost the same eight rows. F97 — at 390 the eight rows exist only after a tap on `UNFOLD ↓`, so the doors are already one level deeper there. F136 — the instruments row spends 44px on `MESSAGE THE CLIENT` / `PREVIEW AS THE CLIENT` where the letterhead says `No client linked`. F72 — `quiet-responsive-shell.spec.ts` asserts `toHaveCount(8)` at 1440, 1280 and 390, so any redistribution is a test rewrite named in the engineering path, not a silent drop.

**Drawn.** Both proposals carry the same eight-row table — row · bucket · where it lives at s0 · where it lives at s2 — and both mockups make each s2 home reachable in the drawn frame.

**Forbids.** No row may be dropped without a named destination.

---

## SP-11 · At 1280 the rail prints words, or prints no words at all

**The move.** The 1180–1439 tier stops breaking words: either the rail is wide enough for the label it carries, or it carries a position mark with no text and the labels return on press.

**Forced by.** F07 (0.95) — at 56px the column prints `PUT` / `DOWN` wrapped, seven unlabelled rule glyphs, then `Project` / `ACTIV` / `E` — ACTIVE broken mid-word — then `In hand` / `21m`. F15 — the only words the tier prints are Put down, the active caption and the compact timer. F21 — measured: 8 interactive children in the rail at 1440 drop to 3 at 1280; no `ON THIS PAPER`, no region labels, no values. F32 — the 390px sheet prints full words for all seven stages, so the phone is more legible than the "compact" desktop rail. F99 — the seven 48px marks overflow the rail's 44px inner measure and lose ~2px at each end to `overflow-x-hidden`. E1 §4 prices the branches: widening to ~96–120px is **weeks** (four pinned tests plus the paper's x-origin); a text-free position line at 56px is **days**.

**Drawn.** Both mockups' 1280 cell shows a rail with no hyphen-free mid-word break anywhere in it.

**Forbids.** No label may be allowed to wrap mid-word to fit the rail.

---

## SP-12 · Condensed is less text at a reserved height, never fainter text

**The move.** A quieted region drops secondary strings and keeps every remaining string at full ratified ink, at a height derived from the region's own data rather than from measuring a mounted body.

**Forced by.** F74 — the muted ramp's lightest step `#65594E` measures **5.32:1** on rail stock `#E8E3DB` against a 4.5:1 floor: computed relative luminance 0.1046 against a floor of 0.1327. There is room for roughly one more small step and no room for a new tint family, so "quieter" has to mean fewer words. F84 — nothing in the rail changes weight, size or ink area across scroll states today, so a designer has no learned expectation that fading means anything. F127 — the terracotta-bordered `NEEDS ATTENTION · IN ONE PLACE` box is nearly the only colour-coded signal on the first screen and a junior's eye correctly snaps to it; a dimming system spends exactly that signal. F53 — `ffe-section.tsx` is 1549 lines with no virtualization, rendering one row plus a 48px crop per line, and unmounting on fold is the document's only render-cost control. F05 / F49 — the seed carries 3 lines under one `Not in a room yet` folio; on the specimen's 60-line schedule a condensed height obtained by measuring the mounted body is 60 rows and 60 images of measurement.

**Drawn.** Both mockups draw the condensed region as head plus one status line at full ink, with the space to its reserved height left as bare paper.

**Forbids.** No region may be condensed by opacity or tint.

---

## SP-13 · Reduced motion is a form, never "n/a"

**The move.** In these words: **every behaviour has a still form that says the same thing.** Never "n/a", never "no animation" — every row of the motion grammar table holds a real thing a designer sees under `prefers-reduced-motion: reduce`, and the same information is on screen; only the transit is gone.

**Forced by.** F30 — `hooks/useReducedMotion.ts` starts `false` (`:4`) and corrects in an effect (`:7-10`), and **no file under `components/document` imports it**; the Document's motion policy is CSS media queries only — nine reduce blocks plus one no-preference gate. F86 — there is no in-app motion setting anywhere, so the OS switch is the only control and the mockup's dev-bar toggle must reproduce it faithfully. F104 — none of the twelve existing reduce blocks covers the ticket's pin/fold, because it has no animation to reduce: it is already a hard cut in both registers. F24 / F79 — reduced motion measures **0.1318** CLS against normal motion's **0.1286**, and the dominant 0.1189 shift is present in both; turning motion off today makes the page no calmer. R126's own precedent is the flat `-still` tint under the ink-pool wash: a form, not an absence.

**Drawn.** Both mockups render every state twice, in both motion registers, and the reduced-motion still carries the same words as the animated one.

**Forbids.** No row of the motion grammar table may have an empty reduced-motion cell.

---

## SP-14 · Only the settled state is announced

**The move.** A density or position change announces once, when it settles, in a named live region; nothing announces mid-flight, and every sheet and overlay the lens opens carries a name.

**Forced by.** F105 — three clean `aria-current` transitions across one scripted scroll (approvals→schedule at 400, schedule→pieces at 1200, pieces→money at 1960) with no live region at all. F42 — the ticket's 283px collapse is silent for every screen-reader user who was not focused inside it. F118 — the late-arriving red-letter and schedule content carry no live region, unlike the `DocumentGuide` branch they displace, which announces itself. F43 — `mobile-sheets.tsx:260` sets `aria-label` only when `kind === 'timer'`; the `drawer`, `spine` and `margin-item` sheets render `role="dialog" aria-modal="true"` with `aria-label={undefined}`. A lens that changes density on scroll turns three silent changes per page into one per region per fling unless the announcement is gated on settle.

**Drawn.** Both mockups' state machines mark exactly one transition per lens move as announced, and mark it at the settled end.

**Forbids.** No transition may announce while the reader is still scrolling.

---

## What is NOT a plank

Moves considered and struck, because each one is an argument rather than a floor. Each belongs to the thesis named beside it; if a proposal wants it, it argues for it in its own voice and the other proposal is free to refuse it.

**The Lens Line (M-1) — collapsing letterhead, ticket, guide and instruments into one 48–64px sticky band.** *Belongs to the header-as-instrument thesis.* It is the largest single recovery on the page — the header stack is 111.7% of the 900px frame at 1440/s0 and the first region head lands at y 1005 (F01), and 60.7% of the frame is still header and summary one full letterhead-scroll later (F11) — but a proposal whose instrument is the rail can answer the same numbers by letting the header stay a stack that yields, and never build the line at all. Pinning it here would hand one author his thesis and leave the other arguing against the floor.

**The Map Rail with proportional extents (M-2) — regions drawn at true height, position marked on the ladder.** *Belongs to the spine-as-instrument thesis.* The rail's numbers demand *something* — 54.9% ink on the rich spread, 13.9% on pre-work, a 657px empty run (F12) — and SP-05 and SP-11 fix what that something must survive. What it *is* is the argument. A header-thesis proposal may legitimately shrink the rail instead of filling it.

**The Standing Rule (M-8) — the current region's head pinned beneath the band at reduced height.** *Belongs to the header-as-instrument thesis, and is the exact move the rail thesis refuses.* It answers F13 (nothing below the fold names the job) and F46 (two schedule doors 200px apart) elegantly, and it is a second sticky band under the first, which is a header again. SP-04 gives both authors the height contract and SP-08 gives both the redundancy rule; which organ ends up carrying position is the argument.

**The Gutter Margin (M-4) — margin chips demoted to one-line pins beside the lines they are about.** *Belongs to the margin-as-instrument thesis.* F17 (the same seven chips at top, seam, mid and foot) and F66 (only Money and Time card kinds ever appear) say the margin must change as she moves; they do not say it must move onto the paper. A pin has no home for a document-wide decision, and `margin-item.tsx` carries one of the three legal `--elevation-sheet` sites (NG2), so pinning this would decide a canon question for both authors at once.

**Continuous versus three discrete seam steps.** *An author fork, priced by E1 §2 — three measured steps is `days`, continuous JS is `week`, `animation-timeline: scroll()` with a registered `@property` and a fallback is `weeks` and kills four `var(…, 0px)` fallback arms.* SP-04 fixes the contract the seam must honour either way. Which side of the fork a proposal takes is its thesis showing, and it should show.

**Where the timer, the presence line and the seven-mark arc live.** *Author's, per the brief's S2 and S4.* F26 (the rail's largest figure is `18 min`), F31 (14.0% of every frame present at all four states and read at none), F137 (`JUST YOU · VISIBLE TO THE STUDIO` as the rail's last line) and F82 (two In-hand clocks disagreeing) make the eviction case, and SP-08 already forbids the second clock. Where the evicted tenants go depends entirely on which organ the proposal has made the instrument.

**The rail's width — 200 vs 160 vs 56-with-a-leaf.** *Author's, per S5.* `200 + 1040 + 232 = 1472 > 1440`, so at exactly 1440 the paper column is 1008px and its `max-w-[1040px]` is never reached; every pixel the rail returns goes to the measure. SP-11 requires only that whatever width survives prints words or prints none. The number is a thesis, and E1 §4 has already priced the tests it would turn red.
