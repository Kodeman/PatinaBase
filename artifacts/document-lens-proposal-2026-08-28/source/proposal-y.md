# Proposal Y — The paper is the lens

*The Document · The Smart Lens · 2026-08-28. Author: Reviser Y, fresh seat, answering for v1 rather than defending it. Evidence of record: `research/31-verified-findings.md`. Floor: `source/shared-planks.md`, SP-01 through SP-14, adopted identically. v1 stays on disk at `source/proposal-y-v1.md`, unedited. Ninety-seven defects were addressed to Y or to both; every one is answered in the appendix, and every fix is carried through the mechanics table, the state machine, the frame budget and the engineering path.*

---

## 1. Thesis

The document wears no instrument. It focuses itself, and it focuses **forward**.

One band under the letterhead never changes size — it changes what it **says**. The paper ahead of her is quiet: a head, a count, an act, and its own reserved height in bare paper. The paper behind her is whole, and stays whole. Nothing collapses, nothing releases, nothing is taken back out from over her head — so the 283.19px jump (F04) has no cause and no successor. The rail stops being a table of contents and becomes six rungs and a reading line.

> **The falsifiable sentence.** `[data-lens-band]`'s measured height reads the same number at scrollY 0, 400 and 1200 on all seven spreads at each of 1440, 1280 and 390 — and that number is **56px** at 1440 and at 1280.

**Did the thesis survive the critiques?** Yes, and it got narrower. What died in v1 was the release — the mechanic that unmounted a region above the reading line and took its height back with a same-frame `scrollBy`. Four seats hit it (Dd-26, Dd-40, Dd-49, Dp-41) and the deletion is cleaner than any defence of it. What is left is more Y than v1 was, not less: the paper is the lens because the paper reserves its own height from the first paint and never moves.

---

## 2. What stays identical

**The R126 register, entire, untouched.** 40px Playfair letterhead (`doc-letterhead.tsx:59`), 24px Playfair region heads (`region/region-head.tsx:128-134`), the five-step scale 40/24/18/15/14, the 11px mono floor, the three rule weights `--rule-hair` / `--rule-mid` / `--rule-strong` (`globals.css:130-132`), paper `#FCFAF6` (`globals.css:51`), rail stock `#E8E3DB` (`:58`), desk `#FAF7F2`, charcoal `#2C2926`, the four `-ink` companions, the muted ramp `#4E4339` / `#5A4E43` / `#65594E`. **No new pigment, no new type size, no new rule weight is introduced by any mechanic below.**

**Untouched organs and objects:**

- **The letterhead's title block.** Same `<header id="document-project-status">`, same `lg` StrataMark, same 40px title, same `HouseholdChip`, same `doc-rule-mid` closing rule (`doc-letterhead.tsx:52-67`). Two things join it, both below: the seven-mark arc (Dp-35) and two client acts.
- **The filled stamps** — ~1.18:1 tint, 1.5px pigment border, charcoal word, −1.5°. `IN PRODUCTION` and `RECEIVED` print exactly as they print today.
- **The six stage tab plates**, `--tab-brief #497093` … `--tab-install #823832`, white label.
- **The ink-pool hover wash** — clip-path circle from the pointer, 260ms in / 200ms out, `--ease-editorial`, flat `-still` tint under reduced motion (`globals.css:327-349`, reduce block #2 at `:439-458`). Its two consumers stay its two consumers. Nothing in this proposal puts a wash on the band, the ladder or a region head.
- **48px product crops** on catalog-linked lines.
- **THE STUDIO desk block.** Not in this tree; not read, not touched.
- **Scored Ink.** Every new act below is a bare mono word with a scored underline (`globals.css:833-878`, reduce block #4). No plate, no chip-as-button.
- **`Put down`.** Same word, same position, top-left of the rail. Its label visibility changes at one tier only, and that change is named in §4.
- **`deriveTicket()`** — `lib/document/ticket-derivation.ts`. All eight rows keep being derived, in order, with their doors. `ticket-derivation.test.ts` stays green untouched. What changes is that nothing renders them as a table.
- **The ⌘K palette, the Esc chain, the Studio Drawer's job, the ledger sheets, the room lens.** Not in scope. One class in `studio-drawer.tsx` changes, for F03, and it is named in Wave 1.
- **The `--elevation-sheet` token and its three sites** — `studio-drawer.tsx:289`, `margin-item.tsx:46`, `overlays/doc-sheet.tsx:371`. Unchanged, uncontested, unextended.
- **`RegionRule`'s three weights** (`region/region-rule.tsx:17-36`, pinned to the pixel by `region-rule.test.tsx:59-74`). The component is untouched; three call sites change the weight they *pass* on a fold, and they are named in §9.

**What was tempting and is deliberately not restyled.** The region rule. A 6px double rule opening every region is the loudest mark on the paper, and it stays `doc-rule-strong` at every density, because a region that is quiet is not a region that is lesser, and the moment rule weight starts carrying density the register has three weights doing four jobs.

---

## 3. Lens mechanics table

Ten mechanics. Every reduced-motion cell is a form a designer sees, and every one names the existing `@media (prefers-reduced-motion: reduce)` block it sits beside, by the number in `research/10-code-anatomy.md` § "The `prefers-reduced-motion` blocks" (Dc-08, Dc-26).

| # | Trigger | What changes | From → to | Duration & easing | Reduced-motion equivalent | What never moves | F-ids |
|---|---|---|---|---|---|---|---|
| **Y-1 · The sentence turns** | The reading stop commits (settled, not in flight) | The band's line 2 text and its ink kind | Outgoing span opacity `1 → 0`; incoming `0 → 1`; band height `56px → 56px`; zero vertical travel | out 90ms, in 150ms, `--ease-editorial` | The new sentence is **printed instantly** in place — same words, same ink, no crossfade. `motion-reduce:transition-none` on the two spans; sits beside **block #7** (`globals.css:1188-1195`), which already zeroes transition-duration on `a`/`button` and does not reach a `<span>` | The band's height, its box in flow, line 1, every word above the reading line, the scroll offset | F01, F04, F11, F13, F50, F113 |
| **Y-2 · The reading line travels** | The reading stop commits | The clay segment's `top` and `height` on the ladder's hair rule | `top: 236px, height: 116px → top: 352px, height: 116px` (one rung, at six stops in a 900px rail) | 200ms `ease-out` — the shipped transition at `spine-running-index.tsx:79` | The segment **jumps** to the new rung in one frame; `motion-reduce:transition-none` is already on that element. Beside **block #7** | The rungs, their names, their y-positions, the rail's width | F12, F22, F84, F102, F116 |
| **Y-3 · The current rung yields its word** | That stop's own `<h2>` enters the frame | That one rung's printed name | Name opacity `1 → 0`, then the span is unprinted; the rung's box, its tick and its press target are unchanged | 90ms `--ease-editorial` | The name is **absent on the next paint**; the clay segment is the position mark in both registers, exactly as it is today. `motion-reduce:transition-none`; beside **block #7** | The rung's box, its 44px-minimum press target, the clay segment, every other rung's name | F102, F29, F10, F116 |
| **Y-4 · A region's body mounts** | Its root's top comes within 240px of the frame's bottom edge — **off screen, always** | The body mounts, at full ratified ink, inside the height the region has reserved since first paint | `data-body="off" → "on"`; reserved height `H_est → H_real`, a delta of at most the estimate's error, taken **below** the frame | None. Height is a step, opacity is 1 on the first frame | **Identical in both registers.** There is nothing to reduce: the body is present at full ink on the first frame it exists. No new CSS block | Every pixel at or above the frame's bottom edge; the scroll extent above her; focus; the reading line's y | F53, F11, F64, F39, F05 |
| **Y-5 · She folds a region** | She presses `Fold ↑` on the head, or the seam's press to unfold | Body unmounts / mounts; the seam prints; focus is placed | `folded false → true`; the seam's rule `--rule-strong → --rule-mid` at the call site; the seam gains the printed words `CLOSED BY YOU` | 300ms `--ease-editorial`, `fold-in` + `fold-arrow-flip` (`globals.css:404-437`) | The seam paints visible on the first frame with `animation-fill-mode: both`; the arrow prints already-flipped. This is the shipped behaviour, and the **no-preference gate** at `globals.css:429-437` is the only thing that ever applies `.fold-settle` — it is opt-in, so `reduce` gets the still form by default | `--doc-region-gap` — the same folded, quiet or full (SP-01). Focus lands on the `FoldSeam` button, never `<body>` | F08, F41, F54, F59, F89 |
| **Y-6 · The pen goes down** | Focus enters an editable control on a line | That line's left rule and its ground | Rule `--rule-hair rgba(44,41,38,.10) → 1.5px var(--color-clay-ink)`; ground `transparent → rgba(196,165,123,0.12)` | 150ms `--duration-fast` `--ease-editorial` | Both the clay-ink rule and the flat tint are **present and static** — this is exactly **block #2** (`globals.css:439-458`), the shipped R126 wash contract, which swaps `.row-wash` to `var(--wash-still)` with `transition: none` | Every sibling line. Nothing dims. No region mounts or unmounts while the pen is down | F53, F61, F117 |
| **Y-7 · The breath** | The document is open, the mark is active | Opacity of the letterhead's StrataMark, and nothing else in the system | `opacity 1 → .62 → 1` | 3s `ease-in-out infinite` — `doc-breath`, unchanged (`globals.css:271-282`) | `animation: none`; the mark prints at full opacity — **block #1** (`globals.css:283-288`), unchanged | Everything. One 120px mark at the top of the paper, and the only ambient move in the system | F31, F55, F96 |
| **Y-8 · A rung is pressed** | She presses a ladder rung, or a band act with a destination | Scroll position, then focus | `scrollY 0 → 1666px` via `scrollIntoView({ block: 'start' })`; the target stop is forced to be the reading stop for the 700ms jump lock | `behavior: 'smooth'`, browser-owned; lock 700ms (`use-document-running-index.ts:35`) | `behavior: 'auto'` — the shipped branch at `use-document-running-index.ts:206-214`. She lands in one frame; the landing offset is identical | The landing offset. `--doc-seam-height` is a constant, so `scroll-margin-top` resolves once and correctly at any fling speed | F34, F38, F45, F14, F46, F120 |
| **Y-9 · Back to the top** | She presses the household name on the band's line 1 | Scroll position, then focus | `scrollY 2397px → 0`; focus to `#document-project-status` | `behavior: 'smooth'`, 700ms lock | `behavior: 'auto'`; the name carries its printed scored underline in both registers — **block #4** (`globals.css:833-878`) forces the Scored Ink grammar to its end state rather than removing it | The band. It is 56px when she leaves and 56px when she arrives | F13, F56, F77, F92 |
| **Y-10 · The standing sheet opens** | She presses `+3 MORE` on the band's line 2 | A `DocSheet` mounts over the paper, listing every standing exception with its own act | `translateY 8px → 0`, `opacity 0 → 1` on `.doc-sheet-panel` | 200ms `--ease-editorial` — the shipped sheet entrance | `animation: none` — **block #9** (`globals.css:1519-1523`), already shipped. The sheet paints in place, full ink, first frame | The paper beneath, its scroll offset, the band, the rail | F50, F127, F23, F63, F65 |

Ten moves. Y-7 is the only ambient one. Two of v1's mechanics are gone: the region release with its same-frame `scrollBy` (deleted, §4) and the travelling `IN FRAME` rule in the margin (deleted, §4).

---

## 4. Organ by organ

### The spine — from furniture to six rungs and a reading line

**Before.** 200px at ≥1440, from the grid template at `page.tsx:1764` (`min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px]`); `doc-spine.tsx:44` carries only `min-[1440px]:w-auto`. In it: `Put down` (`:46-55`) · seven StrataMark marks in a **horizontal** row inside a vertical column (`:64-120`) · the active label pair (`:122-136`) · the running index, four rows, project spreads only (`:141`) · the timer card (`:145-146`) · the presence line (`:150-154`). Measured at rich/1440/s0: **ink 494.25px of 900 = 54.9%**, longest empty run **270px** running from y 630 to the rail's bottom, **8 interactive children**, and **18 distinct text labels** (`12-layout-measurements.json` `rich.1440.s0.spine`). On a pre-work spread: 13.9% and a 657px run (F12). Ink is identical at s0, s1, s2 and s3 — nothing in the rail has ever changed as she moves (F84).

**After.** 160px at ≥1440, and one thing in it.

**Six stops on the project spread, not twelve.** v1 listed twelve and four seats found the same holes. Against the tree:

| v1 rung | Verdict | Evidence |
|---|---|---|
| `Client approvals` | **Stays** | `approvals/project-approval-document.tsx:565`, `:586` carry `data-index-region="approvals"` |
| `Schedule` | **Stays** | `schedule/schedule-spine.tsx:1057` |
| `Pieces` | **Stays** | `ffe-section.tsx:1209` |
| `Money` | **Stays** | `commercial/money-region.tsx:229`, `:250` |
| `Closing the book` | **Stays, root added** | `care-band.tsx:254` renders a real `RegionHead name="Closing the book"`, and `CareBand` mounts on the project spread at `page.tsx:2134`. It needs `data-index-region="care"` and a `PROJECT_PAPER_ORDER` entry — two lines |
| `The record` | **Stays, root added** | `previous-work.tsx:37` is `<section aria-label="The record">` with `The record · {count} complete` at `:46`, mounted outside the spread branch at `page.tsx:2222`. It needs a `RegionHead` and a root |
| `The accounts` | **Dropped** | `page.tsx:2202` gates `<AccountBand>` on `spreadSection !== 'project'`. The comment at `:2197-2201` is explicit: "the band and the money region are one either-or". A rung for a region the project spread never mounts is the exact failure `regionHeadingId`'s throw exists to prevent (DC-32) |
| `Authorizations` | **Dropped** | `AuthorizationsLedger` (`commercial/authorizations-ledger.tsx:113`) renders inside `ProjectCommerceSection` (`:33`), which renders inside `MoneyRegion` (`page.tsx:2122`). Pressing it and pressing `Money` land in the same region (DC-33) |
| `The call sheet` | **Dropped from the ladder, kept on the shelf** | `page.tsx:2331-2334`: "D1: the Call Sheet is an overlay, never a section". It is a door, not a stop (DC-39) |
| `The work` | **Dropped** | On the rich spread that block prints `Plan the project work` inside the FF&E region with no head of its own; F91 measures 433 of 775px mis-attributed for exactly this reason (Dd-47) |
| `The letterhead` | **Dropped** | It is the top of the paper, not a stop on it — and `to the top` already exists as the household name on line 1 (Dp-39) |
| `Colophon` | **Dropped** | The end of the paper, not a stop on it (Dp-29) |

**The rungs.** `Client approvals` · `Schedule` · `Pieces` · `Money` · `Closing the book` · `The record`. Byrne proposal spread: `The proposal` · `Scope & engagement` · `Design vision` · `The investment` · `The record` — five, built in Wave 2b (SP-05).

- Rung height is `max(44px, contentHeight ÷ stops)` — **no ceiling**. v1's `clamp(…, 120px)` left a four-stop brief spread at 59.9% of the rail (Dp-30); without the ceiling six stops give 116px and five give 139px, and the ladder fills the rail on every spread.
- **The rungs carry names and position. They carry no values.** Today the rail prints `Money` / `$6,200 OWED` beside a paper that prints the same money in four other places (F10), and a fallback prints identically to a live figure (F108: `Money unread` and `$6,200 OWED` at the same size, weight and row).
- **The current rung yields its word (Y-3).** While that stop's own `<h2>` is in the frame, its rung prints no name — the paper owns the name, the rail owns the position. When the head has scrolled out of the frame and she is deep inside a 1,840px body, the rung prints its name again. This is SP-08 obeyed by mechanism rather than conceded: the current region is printed **once**, at every offset, in every frame.
- **The reading line is the shipped 2px clay segment** (`spine-running-index.tsx:76-82`), now riding a printed `--rule-hair` ladder rule instead of floating in space.

**Applying the 2026-08-14 test — earns the left edge only if true across the whole document at once, or true outside it:**

| Tenant | Verdict | The sentence that decides it |
|---|---|---|
| `Put down` | **In** | True outside this document. It is the exit. |
| The seven-mark arc | **Out of the rail, into the letterhead** | True across the whole *engagement*, and a horizontal row inside a vertical column teaches the wrong axis (F55: every phase gets 22px whether it shelves four regions or zero). v1 said it "stays where it already is"; `doc-letterhead.tsx:53-55` is a **single** `lg` `StrataMark state="active"`, not the arc, so v1 deleted the arc from the product without saying so (Dp-35). It moves onto the `HouseholdChip` line at `sm`, one row, ~24px, and settled-versus-ahead survives. |
| The active label pair | **Out** | It reprints the page's own `<h2>` verbatim at half the size (F102). The ladder's rung already says it, and yields it when the paper is saying it. |
| The running index | **In, rebuilt** | Position within the whole document is the one thing the paper cannot show her while she is inside one part of it. |
| The timer | **Out, into the drawer, in the same wave** | This minute, not this document — and the drawer already prints `IN HAND TODAY 1h 09m` while the rail says `18 min` (F82). Two clocks that disagree is worse than one. v1 named F03 as a risk and scheduled no file; Wave 1 now carries `studio-drawer.tsx`. |
| The presence line | **Out when it is just her** | `JUST YOU · VISIBLE TO THE STUDIO` is session metadata printed as the rail's last line at all four states (F137, F31). It prints only when somebody else is on the paper, and then it prints their name. |
| `doc-breath` on the active mark | **Moves with the arc** | To the letterhead's mark. Still exactly one ambient move (Y-7). |

**The 40px it gives back goes to the margin, not the paper.** `page.tsx:1764` becomes `min-[1440px]:grid-cols-[160px_minmax(0,1fr)_272px]`. At 1440 the paper column measures `1440 − 160 − 272 = 1008px` — the same 1008 it measures today, so the measure loses nothing — and the margin gains 40px. Kody's fourth complaint is *the margin seems cramped for the space needed for the functionality it contains*; v1 answered it by adding six tenants to a 232px column and giving the rail's 40px to the paper (Dp-31, Dp-46). This is the correction.

**Mount-order consequence.** In `doc-spine.tsx`, children 2 (the seven-mark `<ul>`, `:64-120`), 3 (the active caption, `:122-136`), 5 (`CompactSpineTimerDoorway`, `:143`) and 6 (`SpineTimer` + presence, `:145-154`) no longer mount. Child 4's wrapper (`:141`, `hidden min-[1440px]:block`) loses its 1440 gate and becomes the ladder at both desktop tiers. `spine-timer.tsx` and `spine-shelved-blocks.tsx` **stay on disk** even though they stop mounting — `contrast.test.ts:313-341` hard-codes those filenames and deleting one drops it from the scan silently. The rail's interactive count goes **8 → 7** (`Put down` plus six rungs), so the tab detour to `<main>` (`page.tsx:1789`, after `DocSpine` at `:1776`) gets one stop shorter, not longer (Dc-24).

### The header — one band, one height, a changing sentence

**Before, measured at rich/1440/s0 in `12-layout-measurements.json`.** Letterhead **189.31px** · the eight-row job ticket **347.25px** · the red-letter zone XOR the guide, two different heights so whichever renders moves every region below it (F154) · the instruments row. Header stack = **111.7%** of the 900px viewport; the first `[data-region-head]` lands at **y 1005.31** (F01). One full screen later, at s1, header and summary are still **60.7%** of the frame and the active region is **10.4%** (F11). At scrollY 280 the whole ticket swaps in one commit — 23 of 23 samples at 64.0625px, no interpolation, first region head **−283.19px** (F04) — and no instrument in the tree records it (F113).

**After.** The letterhead, then one band.

**The band is 56px, border-box, at ≥1180, at every scroll offset.** It is declared `h-14` with its `--rule-mid` lower edge **inside** the box: 8.8px padding, line 1 at 11px × 1.4 = 15.4, 2px, line 2 at 15px × 1.3 = 19.5, 8.8px padding, 1.5px rule = **56.0px**. v1 derived 58.5 from `py-2.5` and wrote "≈ 56", which is the proposal's own headline test failing on the proposal's own arithmetic (Dd-33). The height is still **measured** by a `ResizeObserver` on the band and published once as `--doc-seam-height` (SP-04, F44) — declared is the minimum, measured is the truth, and at 390 the measurement is what governs.

Its background is `--doc-paper` `#FCFAF6`, fully opaque, so nothing scrolls through it and the composite contrast is the declared contrast (Dc-17). It is `sticky top-0 z-[4]`, with `#doc-ticket-sentinel` immediately above it — the only sticky element in the header, and the only writer of `--doc-seam-height` (DC-49, DC-54).

**Line 1 — 11px mono, `--text-muted` `#65594E` (6.51:1 on paper), and it yields.**

| State | Line 1 prints | Why |
|---|---|---|
| **s0**, letterhead in frame | **nothing** | The letterhead 60px above it is printing the household at 40px Playfair, the stage as a seven-mark arc, and the install date in its vitals. SP-08's loser prints nothing. The band is still 56px; line 2 is centred in it (Dd-39, Dc-02, DC-49) |
| **s1–s3**, sentinel passed | `VANDERSTEEN RESIDENCE · PROCUREMENT & ORDERS 4 OF 6` … right-flush `INSTALL SEP 15 · $17,500 OUT` | 50 characters left, 28 right, ≈555px of 11px mono in a 944px measure at 1440 |
| **while `Money` is the reading stop** | the right-flush money figure is dropped: `INSTALL SEP 15` alone | The money region's own head is printing it (SP-08) |
| **at the foot**, `Closing the book` or `The record` in frame | right-flush becomes `0 OF 6 CLOSED OUT` — the count, never the region's name | The paper's own head is printing the name (Dc-04) |

The household name is scored ink and pressing it is `to the top` (Y-9). At s1, s2 and s3 this is the only place on screen that names the job (F13, blocker) — today no frame at seam, mid or foot contains the client's name at all.

**The money figure on line 1 is v2's answer to the sharpest thing said against v1.** Dd-27 and Dp-05 are right: v1 removed money from every frame below s1 — the rail printed no values, the money region was off screen, and the band printed money only when money was the worst standing thing, which on the specimen it is not. Today the rail prints `$6,200 OWED` at all four states (F84). v2 puts one standing money figure on line 1, right-flush, at every offset, and **refuses to put it on the rail**, because `Money unread` and `$6,200 OWED` printing at the same size and row (F108) is a lie the rail can tell and the band cannot: the band's figure is derived by the same call that derives the money region's own head.

**Line 2 — 15px, the sentence that changes (Y-1).**

| Where she is | The sentence | Ink |
|---|---|---|
| Nothing standing | `Name the phases for this project` + `OPEN THE SCHEDULE` | charcoal |
| Anything standing, at any offset including the foot | The worst standing exception, with its act, and `· +3 MORE` when it withheld any | `--color-terracotta-ink` `#9C5340`, **5.41:1 on paper** |

Two v1 defects are fixed here. First: **`· +3 MORE` is a scored act.** It opens the standing sheet (Y-10) — a `DocSheet` listing every standing exception with its own act, which is the `NEEDS ATTENTION · IN ONE PLACE` block's content moved into an overlay rather than deleted. F50's defect is that the third exception is dropped whole; v1 replaced a silent drop with a count and no door (Dd-50, Dp-24, Dp-23). Second: **line 2 keeps the exception at the foot.** v1 swapped it for `Closing the book · 0 of 6 closed out`, so the six-day overdue left the frame at exactly the depth F77 already records as orientation-blind (Dp-25). The closing count moved to line 1's right-flush slot; line 2 belongs to the exception until it is resolved.

**The standing set is ranked by deadline, and a deadline is a fact, not a capability.** The specimen's gouged console carries `carrier window closes 2026-08-26` — a same-day date, which under v1 printed nowhere at any offset (Dd-52, Dp-45, Dp-47). It ranks into the standing set on its date, prints on line 2 when it is worst, and prints in the standing sheet always. Filing the claim is still refused (§11); printing the date is not new capability, it is the thing both organs are built to carry.

**Truncation, ruled before the band ships (Dp-28, R2).** Line 2 at 15px in a 944px measure holds ~110 characters; the specimen's worst exception is 96 before its act. When it overruns, the **act's** words truncate first (`SEND REMINDER` → `REMIND`), then the subject's qualifiers, and **never** the number, the day-count, or the room. If truncation cannot bring a live string inside one line at 1280, the band does not ship until the ranking drops the qualifier upstream.

**H1, the eight ticket rows, with a home at s0 and a home at s2 (SP-10):**

| Row | Bucket | Home at s0 | Home at s2 |
|---|---|---|---|
| `Rooms` | door + fact | The `Pieces` region head's ledger, which **gains the room chips themselves** — the same chips and the same handler that `responsive-document-shell.test.tsx:697-698` exercises through the ticket today | Same; one press from the ladder's `Pieces` rung at every state |
| `Pieces` | door + fact | The ladder's `Pieces` rung | Same, with the reading line on it |
| `Drawings` | door (`planroom`) | The margin's shelf, `PLAN ROOM` | Same — the margin is `sticky top-0 h-screen` at 1440, in the sheet at 1280/390 |
| `Spec` | door (`specbook`) | The margin's shelf, `SPEC BOOK` | Same |
| `Boards` | door (`moodboards`) | The margin's shelf, `BOARDS` | Same |
| `Money` | door + fact | The ladder's `Money` rung; the figure right-flush on line 1 | Same |
| `Dates` | fact + door | `INSTALL SEP 15` on line 1; the `Schedule` rung is the door | Same |
| `People` | door (overlay `call-sheet`) | The margin's shelf, `CALL SHEET (4)` | Same |

At 1440 all eight have a destination in the frame at every scroll state. At 1280 and 390 the four leaf doors are **one press** behind the margin's tab, which prints `MARGIN · 7`; today they are ticket rows at s0 and nowhere below it (F09). v1's summary sentence carried the 1440 qualifier and its table did not (Dd-35); this one carries it.

**H5, zero layout shift, mechanically.** The band's box in flow is 56px before it pins and 56px after, so `--doc-seam-height` does not change with scroll: the schedule glance's `top: var(--doc-seam-height, 0px)` (`globals.css:1026`) never re-resolves under her (F87), and every `[data-index-region]` `scroll-margin-top` is a constant at `scrollIntoView` call time (F34, blocker). The late-arriving blocks that dominate CLS — one shift of 0.1189 out of 0.1286 at ~3.3–3.6s (F79, F24) — are the needs banner and the schedule **content**; the banner renders into the band's reserved 56px, and the schedule's reserve goes on its content block. It does **not** go on the pinned glance: `schedule-rule.tsx:548` is `pointer-events-none sticky top-0 z-[3] h-0` and `:541-545` says in the tree's own words that "it reserves nothing in flow (so nothing shifts)" — giving it a height would introduce the shift v1 was removing (DC-51).

**Mount-order consequence in `page.tsx`.** `job-ticket.tsx` is deleted as a component; `lens-band.tsx` takes its position and carries `#doc-ticket-sentinel` itself, so `page.test.tsx:1361-1382`'s `sentinel.nextElementSibling === band` survives as a selector rename — the one assertion stopping a future edit from putting a block between the sentinel and the band. `RedLetterZone` and `DocumentGuide` stop mounting as page children; the ternary at `:1839-1847` is deleted and both models feed the band. `LetterheadInstruments` at `:1862-1873` stops mounting; its two client acts mount inside `doc-letterhead.tsx` on the `HouseholdChip` line and print only when a client is linked, deleting F136's 44px of `MESSAGE THE CLIENT` on a document whose letterhead reads `No client linked — attach one ↗`. **`<FolioLetterhead projectId={row.project_id} />` at `:1871` stays exactly where it is** (DC-61). `MobileMarginChips` at `:1883-1889` does not move, so `stage2-approval-cutover-contract.test.ts:15-17`'s ordering assertion survives. v1 claimed these deletions "shorten the source between `data-active-section` and `<SectionStageLineMount>`"; both ranges are **above** the attribute at `:1942` and the 1,109-character window is untouched. The sentence is struck (DC-40).

### Region heads and spacing

**Before.** `RegionHead` owns no outer spacing (`region/region-head.tsx:118-121`); every gap is the call site's — `mt-6 … py-6` (approvals open), **nothing at all** (approvals folded, `approvals/project-approval-document.tsx:565`), `mb-4` (schedule frame), `mt-5` on a rule (FF&E), `mb-5` (money), `mt-8` (care). Measured button-to-button the distinct gaps are **{6, 29, 56}px** (`12-layout-measurements.json` `rich.1440.s0.distinctGaps`), scroll-invariant and width-invariant, on a set of seams that reads as one uniform list (F73).

**After.** One token, `--doc-region-gap: 24px`, on a wrapper `RegionHead` owns, identical open, quiet or folded (SP-01). Every call-site margin in `research/10-code-anatomy.md` §6 is deleted. **The exceptions, with reasons:** the colophon keeps `mt-14` (`doc-colophon.tsx:102`) because it closes the paper rather than separating two regions; the FF&E folio heads keep **`mb-1.5` (6px)** because that is intra-region rhythm, not an inter-region seam. That value is what the tree carries at **both** sites in dispute — `ffe-section.tsx:1213` reads `mb-1.5 mt-5` and `:1302` reads `mb-1.5` — so the exception is 6px at both, and the mockups draw it at 6px (Dd-45, Dp-43).

**Density, defined precisely, and the release deleted (R2).**

Two densities, and the thing that changed most between v1 and v2 is what they *do*.

- **`full` is assigned by one thing only: the running index.** The region that `use-document-running-index.ts`'s resolver names as the reading stop is `full`; every other stop is `quiet`. Exactly one, never zero (SC11, SC12, by construction rather than by claim). v1 asserted "exactly one" and delivered a pair of geometric predicates that could satisfy two regions at once, with nothing arbitrating (Dd-28, DC-55). The index has measured clean — three transitions across one scripted scroll, zero flicker across four clicks (F105, probe §2) — so the arbitration already exists and v1 declined to use it.
- **Body mount is a separate, one-way, strictly-off-screen predicate (Y-4).** A region's body mounts when its root's top comes within 240px of the frame's bottom edge, and **never unmounts** for the life of the document view. There is no release, no upward re-mount rule, no same-frame `scrollBy`, and no hysteresis pair. v1's release was the single most delicate piece of engineering in either proposal and its own Rank-1 risk; four seats hit it (Dd-26, Dd-40, Dd-49, Dp-41) and the honest answer is the deletion, not the defence.
- **Every region reserves its full estimated height from the first paint.** The estimate comes from the region's own row count, never from measuring a mounted body (SP-12) — on the specimen an FF&E line is a 48px catalog crop plus `py-2` plus a rule = 65px, so a 60-line, 4-room schedule reserves 60 × 65 + four folio heads. Mounting the body therefore changes the document's extent by the estimate's error and nothing else, entirely below the frame. **The scrollbar is a true measure at every offset** — the only instrument that tells her how far into a 60-line schedule she is, and the one neither v1 nor X mentioned once (Dp-41).

**What a quiet region prints, and nothing more:** the head at 24px Playfair with `--rule-strong`, **one** count line at full ink, and its one inked leader act — which `region-head.test.tsx:128-158` requires unconditionally, so it is not new. Its exception strings print **unless the band's line 2 is currently naming that exception**, in which case the region withholds it (Dp-27, Dc-07). Then bare paper to the reserved height. v1's quiet was four printed things stacked eleven deep — roughly 1,300px of stubs between the letterhead and the Record (Dd-32); under the reserve model there are no stubs at all, because a quiet region occupies its true height and most of that height is paper. That is SP-12's drawn line, exactly: *head plus one status line at full ink, with the space to its reserved height left as bare paper.*

**A number never softens.** No ink ramp anywhere. `#65594E` measures **5.32:1** on rail stock against a 4.5:1 floor (F74) — one step of headroom and no room for a family — so quieter means **fewer words**.

**The four readings, told apart in a still (SP-02):**

| Reading | The mark that separates it |
|---|---|
| `full` | Head at 24px, `--rule-strong`, body present |
| `quiet` (the lens) | Head at 24px, `--rule-strong`, body absent, **and a count line at full ink**: `36 lines · 4 rooms · 1 damaged` |
| `folded by her` | The `FoldSeam` in place of the head, rule stepped to `--rule-mid` at the call site, and the printed words **`CLOSED BY YOU`** |
| `empty` | Head at 24px, `--rule-strong`, and one italic line in the region's own words with **no count**: `Nothing in this room yet` |

The count line is the whole discipline: a region with a number is quiet, a region with no number is empty, and a designer reads the difference off a PNG. Today `FoldSeam` renders identically whether the fold came from her hand three weeks ago or from a shipped default (F54, F89), and seven regions invent three vocabularies for one zero (F156). Two printed forms replace them: **`Nothing yet`** for a region that has never had content, **`Not known yet`** for a field whose value has not been decided — SP-02's own two words, in the paper's sentence case.

**The ≤40-character quiet line, per region, on the specimen:**

| Region | Line | chars |
|---|---|---|
| Client approvals | `2 awaiting the client · 1 overdue 6d` | 36 |
| Schedule | `Install Tue Sep 15 · 3 weeks out` | 32 |
| Pieces | `36 lines · 4 rooms · 1 damaged` | 30 |
| Money | `$17,500 out · $12,300 not drawn` | 31 |
| Closing the book | `0 of 6 closed out` | 17 |
| The record | `12 complete` | 11 |
| *(proposal spread)* The proposal | `Sent Aug 27 · not opened` | 24 |
| Scope & engagement | `Core · stage 03` | 15 |
| Design vision | `Not written yet` | 15 |
| The investment | `$184,500 · 20% margin` | 21 |

**The collision (R3).** Folded-by-her outranks the lens, always. A region she folded stays folded in the state the lens would otherwise have brought to `full`, and prints the same seam it printed before (SP-07). Scroll never writes `patina:doc-fold:{docId}:{region}`.

**The first screen changes, and it is named.** Making `latchedDefault` an initial density rather than an initial fold means `Client approvals` and `Schedule dates` — both folded by a derived default today (F89, visible in `w1440-rich-s0.png`) — **open on arrival**. That is a visible product change on the first screen, and it is what makes SC1 true (DC-62, DC-37).

### The margin — 272px, one heading, and no moving parts

**Before.** 232px sticky column at ≥1440; a fixed 360px overlay sheet at 1180–1439. Into it: a nine-line first-touch note (~230px, F28), the `In the margin` head with its capture acts, a Drafts fold, seven chips of two kinds only — Money and Time, never a PO or a damage (F66) — a note composer, handoffs. Measured: the same seven chips in the same order at top, seam, mid and foot (F17), a 577.14px chip stack = 64.1% of the rail. At 1280 the sheet prints `IN THE MARGIN` twice, 200px apart (`margin-rail.tsx:264` and `:486-492`, F18), and the closed tab (`:225-229`) prints no count so an empty margin and a seven-item margin look the same (F19).

**After. 272px, and the column's own ledger of what it gained and gave up:**

| Change | px at 1440 |
|---|---|
| The rail's 40px, redirected here rather than to the measure | **+40** |
| First-touch note capped at two lines (`margin-note.tsx:9-11`) | **+~160** |
| The duplicate `IN THE MARGIN` heading deleted (`margin-rail.tsx:264`) | **+~40** |
| The shelf, four doors one per line plus one paired line | **−~80** |
| **Net** | **+~160px and 40px of width** |

Kody's complaint is that the margin is cramped. v1 answered it by adding six tenants to the same 232px (Dp-31) and moved four doors from the organ the ask calls cluttered into the organ the ask calls cramped without counting the load (Dp-46). This is the count.

1. **The shelf, at the head, at every state — one door per line, and a different separator for the count:** `PLAN ROOM` / `SPEC BOOK` / `BOARDS` / `CALL SHEET (4)` / `SHARING · MILESTONES`. v1's single run-on line was 62 characters in a 200px measure — three or four wrapped lines — and its `CALL SHEET · 4` used the same middot as the separator between doors, so `4` read as an eighth door for a beat (Dd-41, Dp-38).
2. **The first-touch note**, capped at two lines, still once-per-person, still receding on first use.
3. `IN THE MARGIN` and the capture acts — **one heading, once** (F18).
4. **The items, in paper order, never reordered.** Each item's own head line prints its anchor's stop name in 11px mono — `BESIDE PIECES` — or `ABOUT THE WHOLE JOB` when it has no anchor, which is the home a document-wide decision does not get from a gutter pin.
5. At 1280 the tab prints `MARGIN · 7`, and `MARGIN` with no number when there is nothing in it (F19).
6. **An item withholds a fact the band is currently naming.** If line 2 is printing `Invoice INV-2026-W02 · $3,800 overdue`, the margin item for that invoice prints its anchor line and its kind and not the figure (Dc-07).

**What died here.** v1's travelling `IN FRAME` rule — a 220ms `top` transition on an absolutely-positioned hair rule in a right-hand column. Three seats hit it: it is a mechanism where a printed word would do (Dd-36), v1's own R4 predicted somebody would try to drag it, and on the data that exists it slides to an **empty anchor**, because all seven margin cards on the specimen are `MONEY ·` and `TIME ·` kinds and nothing is anchored to Pieces (F66, Dp-32). A per-item printed anchor line answers F17 from a still, costs no motion, and is legible when the anchor set is empty. This is a mechanic dying rather than being defended, and the motion budget drops from ten moving parts to nine plus the sheet.

**Mount-order consequence.** `MarginRail` keeps its position at `page.tsx:2316-2334`. Inside `margin-rail.tsx`, the shelf mounts above the first-touch note at `:462`; the sheet header's duplicate heading at `:264` goes; `renderItem` gains the anchor line. `data-margin-mode` rail/sheet values are untouched, so `margin-handoffs.spec.ts:67-70`, `:102-105` and `responsive-document-shell.test.tsx:310-320` stay green.

### The motion grammar

Nine triggered moves and one ambient, all in §3. **No layout property animates, ever.** The band's height is a constant, so there is no header layout to animate. A region's height is reserved from first paint, so mounting a body animates nothing. Nothing in the margin moves.

**Hysteresis, one number instead of three (M3).** A body mounts when its root's top is within **240px** of the frame's bottom edge. There is no release threshold, because there is no release — so there is no hysteresis pair to tune, no 480px, no 96px, and nothing for the mockup's `--motion-scale: 4` prober to oscillate. That number and not a smaller one: on the specimen one FF&E line is 65px, so 240px is more than three lines and a three-line nudge cannot re-cross it. The strongest form of the rule survives v1 intact and is now true without qualification: **the lens never changes anything that is inside the frame, and never changes anything above it at all.**

**Momentum and reverse-scroll.** Downward: the mount threshold sits 240px ahead of her eye, so a fling arrives at a finished page. Upward: everything above her is already mounted and stays mounted, so there is no upward transition to rule. v1 needed two asymmetric rules and left the third case unnamed (Dd-26); v2 needs one rule because the other direction has no events in it.

**Damping.** No velocity threshold, no dwell. Programmatic scrolls are damped by the **700ms jump lock that already exists** and measured clean across four index clicks with zero flicker (F45, probe §2). Free scrolls are damped by the shipped `READING_BAND` `-20% 0px -62% 0px` at `use-document-running-index.ts:34`, which is the only assigner of `full`. Testability: `window.__lensSettled()` returns a promise resolving at the next commit; `settle()` forces one synchronously.

**Announcement (SP-14).** Exactly one thing announces: the band's line 2, on settle, in one `aria-live="polite"` region on the visible line itself — the only live region in the document. **One announcement per distinct reading stop**; returning to a stop already announced within 2s is silent, so a slow re-read across one boundary does not fire repeatedly (Dc-21). A body mounting never announces, because it happens off screen and changes nothing on screen. Today three `aria-current` transitions fire across one scripted scroll with no live region at all (F105) and the 283px collapse is silent for every reader not already inside the ticket (F42).

**The non-visual channel for a quiet region (Dc-20).** A screen-reader user arriving at `<h2>Pieces</h2>` by heading navigation gets the head, the count line and the leader act — and, because the body genuinely is not in the DOM, a visually-hidden line inside the head reading `36 lines · not yet on the paper · press Pieces on the index to open`. That is SP-02's four readings given a programmatic form, not only a visual one.

**The ambient budget.** One. `doc-breath` moves from the rail's active mark to the letterhead's mark and keeps its 3s `ease-in-out infinite` and block #1 (`globals.css:283-288`). Present at arrival, gone below the fold — strictly less ambient exposure than today.

**No in-product motion toggle (Dc-15).** The OS `prefers-reduced-motion` query is the only control, which is what the tree does today (F86 records no in-app motion setting anywhere; `hooks/useReducedMotion.ts` exists and no file under `components/document` imports it, F30). Adding a product-level toggle is a settings surface, not a lens move, and it is stated here rather than left unraised. SC6's dev-bar toggle is a QA instrument.

### The 1180–1439 tier

**Before.** 56px of rail with `px-1.5` leaving a ~44px content box, printing `PUT` / `DOWN` wrapped, seven unlabelled marks, `Project` / `ACTIV` / `E` — a status word broken mid-syllable — then `In hand` / `21m` (F07, 0.95). Eight interactive children at 1440 become three (F21). The 390px sheet prints full words for all seven stages, so the phone is more legible than the "compact" desktop (F32).

**After. The rail prints no words at all, and therefore breaks none.**

- `Put down` becomes its glyph. Its label class changes from `min-[1180px]:inline` to `min-[1440px]:inline` (`doc-spine.tsx:53`), so nothing wraps.
- The ladder becomes a **text-free position line**: one `--rule-hair` down the rail, one 12px tick per stop, the clay 2px segment on the stop she is in. Every tick is a `min-h-11` press target (2.5.8 at 44px).
- **Pressing any tick opens the Sections sheet** the mobile spine already builds (`mobile/mobile-sheets.tsx:441+`), which prints every rung with its full name. A press, never a hover.
- The margin tab prints `MARGIN · 7`.
- The elapsed clock lands in the Studio Drawer, and F03's overprint — `Find anything` over `IN HAND TODAY` in one glyph run at 1280 — is fixed in the same wave that evicts the timer, in `studio-drawer.tsx`. v1 named this in a risk and scheduled no file (Dd-37, Dp-37).

**This refuses F15 and F21's own suggested fix**, which is to keep four index labels as text at 1280. At a 44px content box, 11px mono breaks mid-word — measured, not predicted (F07). Widening the rail to 96–120px is **weeks** by E1 §4(a): `quiet-responsive-shell.spec.ts:224-228` pins 55–57px, `quiet-release-contracts.spec.ts:108-118` pins the same by `boundingBox()` with bounds `[0,56]`, and it moves the paper's x-origin. SP-11 asks for words or no words; this tier gets no words, and the words are one press away.

### 390

**Before.** First region head at y **1054.13** against an 844 frame — **124.9%** (F40). The ticket already rests as the seam at this width (F131), so the pin motion never happens here. The Sections sheet lists only the seven stages — `Client approvals`, `Schedule`, `Pieces` and `Money` appear nowhere, and reaching Pieces means scrolling ~1,050px of an 844 frame (F14, blocker). Three of four sheet kinds render `role="dialog" aria-modal="true"` with `aria-label={undefined}`; `mobile-sheets.tsx:260` sets one only when `compactTimer` (F43).

**After.**

- **`<main>` is `px-7` at 390 (`page.tsx:1791`), so the band's measure is 390 − 56 = 334px.** v1 said the band carried "the identical text" as 1440 in two lines of 64px; line 1 alone is 73 characters ≈ 525px and wraps before line 2 exists (DC-38). **At 390 line 1 drops to `VANDERSTEEN RESIDENCE · $17,500 OUT`** — 35 characters ≈ 250px, one line. The phase count and the install date move to the Sections sheet's head, where the letterhead's vitals also go (Dp-36). Line 2 wraps to two lines when it must, so the band measures ~86–90px and is **measured, never hard-coded** (SP-04, F44).
- **SC3's ≤64px threshold is written at 1440 and is met at 1440 and 1280.** At 390 the band is ~86–90px and what is claimed there is *stability* — the same number at scrollY 0, 400 and 1200 — which is what the falsifiable sentence tests.
- **The Sections sheet prints the whole ladder** — every stop, the same names as 1440, under the stage list (F14 answered). Every row is `min-h-11`, 44px (Dc-18); F121 measured today's chips at 21–26px against a 24px floor.
- **Only chips anchored to the stop in frame print inline**; the rest live in the sheet under the same `ABOUT THE WHOLE JOB` line as the desktop margin (F48). Their padding goes from `py-[0.32rem]` to `py-1.5` at both sites, `mobile-margin-chips.tsx:98` and `:114`, clearing 24px (Dc-19).
- The region head's ledger collapses to the one inked leader plus the always-visible overflow glyph (F49; `region/__tests__/row-overflow.test.tsx:31-44` already requires that glyph collapsed with its verbs unmounted — no change to that contract).
- Every sheet kind gets a real `aria-label` — `Sections`, `Margin item`, `Studio actions` — not only the timer (F43).
- **F02 is not answered, because F02 was killed.** `31-verified-findings.md:179`: "No product code draws a circular puck in the mobile bar … The black circle with an N in the shot is the Next.js dev-tools indicator." v1 spent a fix on it (Dp-34).

**Mount-order consequence.** None in `page.tsx`. `mobile-sheets.tsx`'s spine sheet gains the ladder list and the vitals under its existing sections list; `mobile-margin-chips.tsx` gains an anchor filter and the padding fix; `mobile-bar.tsx` is untouched.

---

## 5. The lens state machine

Five states. Every transition carries its reverse and its focus destination (SP-06); no row reads "—".

### `at rest` — s0, the paper as it opens

| | |
|---|---|
| **Lens line** | Letterhead full above it; band in flow, not pinned, **56px**. Line 1 **prints nothing** — the letterhead is naming the household, the arc is naming the stage, the vitals are naming the date. Line 2 prints the worst standing exception with its act and `· +3 MORE`, or the guide sentence when nothing stands. |
| **Rail** | 160px. `Put down`, `ON THIS PAPER`, six rungs at 116px, clay segment on rung 1, rung 1's name yielded because `Client approvals`' head is in frame. |
| **Region density** | `Client approvals` is the reading stop and `full`. Every stop below is `quiet` at its own reserved full height. |
| **Margin** | 272px. Shelf (five lines), first-touch note (two lines), `IN THE MARGIN`, items in paper order with printed anchor lines. |
| **Entry trigger** | Page load with `scrollY === 0`; or `to the top` (Y-9); or the resume landing declining to move her (`page.tsx:1166-1174`). |
| **Exit trigger** | Any scroll past `#doc-ticket-sentinel`. |
| **Reverse** | `to the top`, one act, the household name — which at s0 is the letterhead's own `<h1>`, not the band's. Focus lands on `#document-project-status`. |

**The returning designer.** A reader in her recent list is dropped at `[data-active-section]` (`page.tsx:1169-1172`), so after ten days away the first frame can carry `THE JOB · PROJECT` with the household already scrolled off (F56). Under v2 she is still dropped there — the band's line 1 names the household in that frame, and **the band's line 2 carries the count of everything standing with its door**, so the arrival state shows one exception and a press to the other three rather than one and nothing (Dp-44). `at rest` is where a first-time visitor lands; `reading` is where a returning one does.

### `reading` — s1 through s3, the working state

| | |
|---|---|
| **Lens line** | Band pinned at `top: 0`, 56px, `--rule-mid` inside its lower edge. Line 1 prints identity, phase count, install date and the standing money figure, with the yields ruled in §4. Line 2 is the worst standing exception with its act, terracotta-ink, at every offset including the foot. |
| **Rail** | Unchanged. Clay segment travels (Y-2); the current rung's name yields while its head is in frame (Y-3). |
| **Region density** | Exactly one stop `full` — the one the running index names. Every other stop `quiet`. |
| **Margin** | Unchanged by scroll. Nothing in it moves. |
| **Entry trigger** | The sentinel leaves the viewport. |
| **Exit trigger** | The sentinel re-enters, or `to the top`. |
| **Reverse** | Scrolling back up re-enters `at rest` at the offset the exit happened; line 1 stops printing and line 2 centres in the same 56px box. Focus: unchanged in both directions — no element unmounts. |

**Transitions inside `reading`:**

| Transition | Trigger | Reverse | Focus destination |
|---|---|---|---|
| stop `n` → stop `n+1` | `use-document-running-index.ts`'s resolver commits | stop `n+1` → stop `n`, same resolver, symmetric band | Unchanged; nothing unmounts |
| current rung yields / un-yields (Y-3) | That stop's `<h2>` enters / leaves the frame | Exactly symmetric | Unchanged; the rung's `<button>` and its accessible name are untouched — only the printed span goes |
| body mounts (Y-4) | Root's top within 240px below the frame | **None. A mounted body never unmounts.** | Unchanged — the region is off screen and holds no focus |
| ladder rung pressed (Y-8) | Press | The rung for the stop she left is still on the ladder; pressing it returns her | `<h2>` via `regionHeadingId` — the shipped `focusRegionHeading` contract |
| `+3 MORE` pressed (Y-10) | Press | Esc, or the sheet's close | The sheet's heading; on close, back to the `+3 MORE` word |
| shelf door pressed | Press on `PLAN ROOM` / `SPEC BOOK` / `BOARDS` / `CALL SHEET (4)` | Esc, or the sheet's close — the shipped `DocSheet` contract | The overlay's first heading; on close, back to the pressed word |

### `editing` — the pen is down

| | |
|---|---|
| **Lens line** | Frozen. Line 2 holds whatever it said when she started. |
| **Rail** | Frozen. The segment does not travel; the current rung does not yield or un-yield. |
| **Region density** | **Frozen.** No body mounts while she is writing. |
| **Margin** | Frozen. |
| **The line under the pen** | Its left rule turns `--color-clay-ink` 1.5px; it holds the flat `-still` tint `rgba(196,165,123,0.12)`. **No sibling changes. Nothing dims** (Y-6). |
| **Entry trigger** | `focusin` on an editable control inside `[data-document-paper]`. |
| **Exit trigger** | `focusout` with no editable control receiving focus, or commit. |
| **Reverse** | The freeze lifts and the reading stop resolves once, on the next settle. Focus destination on exit: wherever her blur sent it — the lens moves focus never. |

### `condensed` — a state of the paper ahead of her

There is no condensed header. `condensed` is the name for a region that is `quiet` and whose body has not mounted yet — which, because mounting is one-way, means **a region she has not reached**. The paper behind her is whole; the paper ahead of her is quiet. That sentence is the thesis.

| | |
|---|---|
| **Lens line** | Unaffected. 56px whether zero regions or five are quiet. |
| **Rail** | Unaffected. Every rung prints whether its stop is quiet or full. |
| **Region density** | Head at 24px Playfair with `--rule-strong`, one count line ≤40 characters at full ink, the one inked leader act, its exception strings unless the band is naming them, and bare paper to the region's **full reserved height**. |
| **Margin** | Unaffected — an item anchored to a quiet region still prints, with its anchor line. |
| **Entry trigger** | First paint. Every stop below the first is condensed on arrival. |
| **Exit trigger** | Y-4's 240px mount threshold, off screen; or a rung press, which forces the target to be the reading stop for the 700ms jump lock and mounts it. |
| **Reverse** | **There is none, and that is the design.** A body that has mounted stays mounted for the life of the document view, so the scroll extent never shrinks under her and ⌘F reaches everything she has already passed. |

### `mobile` — 390, one column

| | |
|---|---|
| **Lens line** | ~86–90px, measured. Line 1 is `VANDERSTEEN RESIDENCE · $17,500 OUT`; line 2 the sentence, wrapping to two lines when it must. |
| **Rail** | None on canvas. The ladder is the Sections sheet, opened from the mobile bar; every rung, the same names, `min-h-11` rows. |
| **Region density** | Identical rules, identical 240px threshold. The number is absolute, not proportional, because a line is the same height at every width. |
| **Margin** | Chips anchored to the stop in frame print inline; the rest under `ABOUT THE WHOLE JOB` in the sheet. |
| **Entry trigger** | Viewport below 1180. |
| **Exit trigger** | Viewport at or above 1180. |
| **Reverse** | The band, the ladder and the margin all keep their state across the boundary because none of them is width-derived. `quiet-release-contracts.spec.ts:169-299` — the whole compact-timer test, including all four viewport handoffs at `:212-237`, `:239-260` and `:262-291` — is rewritten in Wave 1, because every step of it runs on `[data-compact-spine-timer-doorway]` or `[data-full-spine-timer]` and both are evicted. v1 said that range was "unchanged"; it is not (DC-36). |

---

## 6. Frame budget

Against `research/12-layout-measurements.json`. Today's numbers are that file's `frameBudget` split. Targets are computed from the **measured** letterhead at **189.31px** (`rich.1440.s0.headerStack.letterhead.height`), not the anatomy's 211px estimate (Dd-34, DC-50), plus 34px for the arc and its gap, the band at 56px, the drawer at 60px, `<main>` `pt-8` at 32px and `--doc-region-gap` at 24px.

### 1440 × 900, rich project spread

| State | Chrome today → target | Header+summary today → target | Active region today → target |
|---|---|---|---|
| s0 | 6.7% → **6.7%** (drawer 60) | 81.8% → **31.0%** (letterhead 189.31 + arc 34 + band 56 = 279.31px) | 0.0% → **58.8%** (529px below the first rule) |
| s1 | 6.7% → **12.9%** (drawer 60 + band 56) | 60.7% → **0.0%** | 10.4% → **87.1%** |
| s2 | 13.9% → **12.9%** | 0.0% → **0.0%** | 86.1% → **87.1%** |
| s3 | 13.9% → **12.9%** | 0.0% → **0.0%** | 50.9% → **≥62%** (the foot's two stops are indexed, so `other` — measured today at 35.2% — falls) |

The headline is s1: today one full screen after landing, **60.7% of the frame is still header and summary and 10.4% is the region she came for** (F11). After: 87.1% is the region, and the 12.9% of chrome is a 56px band naming the job, the phase, the install date, the money out and the worst thing standing, plus a 60px drawer that already exists.

**Nothing in this table is attributed to density.** A region entirely out of frame occupies zero of the frame whether it is 1,840px tall or 118px tall, so the recovery above is the ticket, the guide/red-letter block and the instruments row leaving the stack — three deletions (Dd-49). What the density system buys is stated where it is true, in §10 and §11: render cost, find-in-page, and a scroll extent that does not lie.

### 1280 × 800, rich project spread

Identical DOM (`12-layout-measurements.json` measures `rich.1280` and `rich.1440` at the same rects). The band and drawer are the same absolute heights, so against an 800px frame: chrome s1–s3 **14.5%**, header+summary s0 **34.9%**, active region s1–s3 **85.5%**. Today at s1: 6.7 / 60.7 / 10.4.

### 390 × 844, rich project spread

| State | Chrome today → target | Header+summary today → target | Active region today → target |
|---|---|---|---|
| s0 | 9.1% → **9.1%** | 71.0% → **37.1%** (letterhead 189.31 + arc 34 + band ~90) | 0.0% → **50.0%** |
| s1 | 9.1% → **18.2%** (bar 64 + band ~90) | 48.5% → **0.0%** | 0.0% → **81.8%** |
| s2 | 16.8% → **18.2%** | 0.0% → **0.0%** | 83.2% → **81.8%** |
| s3 | 16.8% → **18.2%** | 0.0% → **0.0%** | 26.2% → **≥55%** |

### Pre-work spread, 1440 (letterhead measured 187.31)

| State | Chrome today → target | Header+summary today → target | Active region today → target |
|---|---|---|---|
| s0 | 6.7% → **6.7%** | 79.9% → **30.8%** | 2.8% → **59.0%** |
| s1 | 6.7% → **12.9%** | 59.0% → **0.0%** | 27.7% → **87.1%** |
| s3 | 13.9% → **12.9%** | 0.0% → **0.0%** | 66.8% → **≥75%** |

### SC1–SC4, with the arithmetic

| # | Criterion | Today | Target | How the number is reached |
|---|---|---|---|---|
| **SC1** | First region head y at 1440, at rest, scroll 0 | **1005.31px** — 111.7% of the frame (F01) | **357px** — 39.7% | `<main>` `pt-8` 32 + letterhead **189.31** (measured) + arc 24 + arc gap 10 + letterhead `mb-4` 16 + band 56 + `--doc-region-gap` 24 + `RegionRule` 6 = **357.31**. The ticket's 347.25px, the guide/red-letter block and the instruments row are gone. Against the ≤405px threshold, **48px of headroom**. This lands in **Wave 1**, because Wave 1 carries the `latchedDefault`→density change that stops `Client approvals` arriving folded — v1 credited it to a wave that did not (DC-37). |
| **SC2** | Condensed header band height at 1440 | 64.06px seam **and** a 347.25px unfolded form it swaps between | **56px**, and there is no other form | `h-14` border-box: 8.8 + 15.4 + 2 + 19.5 + 8.8 + 1.5 rule = **56.0**. One element, one height, arithmetic that closes (Dd-33). Against the ≤108px budget: 52px unspent, and **no second sticky band is added to spend it** (M-8 refused). |
| **SC3** | Lens-line height at scrollY 0 / 400 / 1200 | 0 / 0 / 64.06 — the property is removed while unpinned (`job-ticket.tsx:250-253`) and the element is 347.25px then 64.06px (probe §1) | **56 / 56 / 56** at 1440 and 1280 | The band has one form. At 390 the band measures ~86–90px and what SC3 claims there is stability, not the 64px number, because line 2 wraps at a 334px measure (DC-38). This is the falsifiable sentence. |
| **SC4** | Rail utilisation `inkPx / railHeightPx` at 1440 | **54.9%** project (494.25 of 900), **13.9%** pre-work; longest empty run 270px and 657px | **83.9%** on both; longest empty run **96px** | Rail content box: `pt-6` 24 to `900 − pb-24 96` = **y 24 to y 804** (`doc-spine.tsx:44`). `Put down` `min-h-11` 44 [24,68] + `ON THIS PAPER` 15.4 [84,99.4] + the ladder [108,804] = 696. Ink = **755.4 / 900 = 83.9%**. v1 ran the ladder to y 856, overrunning its own `pb-24` by 52px, and claimed a 44px empty run (Dd-30, DC-52). The honest longest run is the **96px of `pb-24`**, which is also what keeps the last rung clear of the 60px drawer by 36px. Because rung height has no ceiling, five pre-work stops fill the same track at 139px each and measure the same **83.9%** (Dp-30). |

**SC4's honest counter-measure, because the ink metric can be gamed and this proposal says so.** `measure-layout.mjs:245-253` counts an element's whole rect as ink when it has text, a background **or a border**, and `:286-289` runs the empty-run cursor to `spineRect.bottom` rather than the padded content box. A taller rung with the same one word raises the number without telling her anything more (Dd-43). So SC4 is reported beside a second measurement the probe must also print: **distinct text labels in the rail at 1440** — today **18** (`rich.1440.s0.spine.textLabels`), after **7** (`←`, `Put down`, `On this paper`, and the five stop names not currently yielded). The rail gets fuller in claimed rows and quieter in words, and both numbers ship.

**SC4 at 1280, stated separately (DC-53).** No ink percentage is claimed at this tier. A full-height `--rule-hair` would read as ~100% under the metric's border rule, which measures nothing. What is claimed at 1280: **six ticks, each a `min-h-11` press target, zero text labels, and zero mid-word breaks** — SP-11's own test, and F07's exact defect.

**SC5–SC13, stated for the probe.** SC5 hover-only acts: **0** — every act is a press, and the 1280 labels open on press (F128 records zero today and this adds none). SC6 elements animating 1s after a state change under reduce: **0** — every row in §3 names its still form and the block it sits beside. SC7 composite contrast in every state: **≥4.5:1** — no ink ramp anywhere; `--text-muted` `#65594E` is 6.51:1 on paper and 5.32:1 on rail stock; `--color-terracotta-ink` `#9C5340` is 5.41:1 on paper and **is never placed on rail stock**, where it measures 4.41:1. SC8 shadow census: **exactly three** `--elevation-sheet` sites, by computed style, and that sweep — not `shadow-gate.test.ts`'s source grep — is the NG2 proof (DC-58). SC9 external requests: **0**. SC10 horizontal overflow: **0** at 1440/1280/390. SC11 density map: exactly **one** region at `full` at every offset, by construction — the running index is the sole assigner — and no region with zero readable text, because `quiet` always prints a head, a count and a leader act. SC12 `data-reading-index` vs the `full` region: the same value by definition. SC13 tab-through: 7 rail stops before `<main>`, down from 8; every act behind a `focus-visible` ring drawn in `--color-clay-ink` `#7C5E30` (**4.70:1 on rail stock, 5.75:1 on paper**, both clear of the 3:1 non-text floor, where the shipped `--color-clay` `#C4A57B` measures **1.82:1 and 2.23:1** and does not); `scroll-margin-top: calc(var(--doc-seam-height, 0px) + 1rem)` on **every** focusable element inside `[data-document-paper]`, not only region roots (F120, Dc-10); and `scroll-padding-bottom: 60px` on the scrolling root so the colophon's last act does not land behind the drawer (Dc-11).

---

## 7. Findings addressed

Every verified blocker and high in `research/31-verified-findings.md`. **A** = answered, **R** = refused with a reason. **F02, F25, F57 and F61 do not appear: the refutation wave killed all four** (`31-verified-findings.md:179-183`), and v1 answered three of them and spent Wave 4 work on the fourth (Dp-34).

| F | | How |
|---|---|---|
| F01 | A | SC1: 1005.31 → 357. The ticket dissolves; the guide/red-letter block leaves for line 2; the instruments row leaves for the letterhead and the margin's shelf. |
| F04 | A | There is no collapse. The band is 56px before and after the pin, so the 283.19px jump has no cause. |
| F06 | **R** | "Everything in install" is a phase-wide question across documents. NG1/D1 forbids answering it inside one open document. It belongs to the desk. Named, not smuggled in. |
| F07 | A | The 1280 rail prints no words, and `Put down`'s label moves to `min-[1440px]:inline` so it does not wrap either. |
| F08 / F41 | A | Folding parks focus on the resulting `FoldSeam` button, mirroring `focusRegionHeading`. Nothing else unmounts at any time, so nothing else can drop focus. |
| F09 | A | `BOARDS`, `DRAWINGS`, `SPEC` and `PEOPLE` move to the margin's shelf — on screen at s0–s3 at 1440, one press behind a counted tab at 1280 and 390. |
| F10 | A | SP-08 by name: money is printed **once** per frame — the money region's head when it is the reading stop, otherwise the band's line 1 right-flush. The rail prints no money value. Five statements become one. |
| F11 | A | Frame budget, s1: header+summary 60.7% → 0%, active region 10.4% → 87.1%. |
| F12 | A | The ladder indexes every stop on the proposal spread (SP-05) and its rungs divide the rail with no height ceiling, so pre-work measures the same 83.9% as project. Longest empty run 657px → 96px. |
| F13 | A | The household name is on line 1 at s1, s2 and s3 at every width; at s0 the letterhead's own `<h1>` is naming it 60px above. |
| F14 | A | The Sections sheet prints the whole ladder, same names as 1440, `min-h-11` rows. |
| F15 / F21 | **R (partly)** | Index labels do not return as text at 1280. At a 44px content box 11px mono breaks mid-word (F07, measured), and widening the rail is `weeks` (E1 §4a). What returns is a ticked position line with every label one press away. Answered as position, refused as text. |
| F16 | A | Wave 2b wraps the four pre-work spreads' bodies in real regions inside `page.tsx` — the structural cost E1 §4(3) priced at `weeks`, carried rather than dodged. |
| F17 | A | Each margin item prints its anchor's stop name (`BESIDE PIECES`) or `ABOUT THE WHOLE JOB`. Nothing moves and nothing reorders; the column becomes legible against the paper from a still. |
| F18 | A | One `IN THE MARGIN` heading. `margin-rail.tsx:264`'s duplicate goes. |
| F19 | A | The tab prints `MARGIN · 7`; an empty margin prints `MARGIN`. |
| F20 | A | On a proposal there is no ticket to print eight rows of absence; the band prints one sentence and the ladder prints the spread's own five stops. |
| F22 | **R** | No extent bars, no exception marks on the rail. Proportional extents make the schedule rung a 6px target — a 2.5.8 failure before it is a taste failure — and an exception mark on rail stock would have to be `--color-terracotta-ink` at **4.41:1**, below the floor. Extent lives on the paper and on the scrollbar, which under this proposal finally tells the truth. |
| F23 / F62 / F63 / F65 | **R (capability), A (the dates)** | Vendor acknowledgement state, damage state and a claim door are product gaps, not composition. But a **deadline is a fact**: the carrier window and the PO's fourteenth day rank into the standing set, print on line 2 when worst, and always print in the standing sheet (Y-10). Naming a date is not adding a capability. |
| F24 | A | The band reserves 56px and the schedule's **content block** reserves its own height, so the 0.1189 shift arrives as words into reserved geometry. The zero-height glance at `schedule-rule.tsx:548` is left at `h-0` — giving it a height would create the shift. |
| F34 | A | `--doc-seam-height` is a constant, so `scroll-margin-top` resolves once and correctly at any fling speed. Removed rather than mitigated. |
| F35 | A | No `animation-timeline`, no `@property`, no scroll timeline. `IntersectionObserver`, `position: sticky` and CSS transitions are already load-bearing. `content-visibility: auto` is now adopted (F61 killed) and is the one feature needing a matrix — named in §10 R4. `browserslist` is added to `apps/designer-portal/package.json` in Wave 1; it has no key today. |
| F36 | A | The 1500-character regex at `stage2-approval-cutover-contract.test.ts:19` is deleted. Measured: it passes on the comment at `page.tsx:1961` at **143** characters, not on the real attribute at `:1942` at **1,109**. Its replacement asserts DOM **order**, not first-child, and lives in `page.test.tsx` where the render harness already is (DC-56). |
| F38 | A | Wave 1 adds the Playwright assertion: after a rung press, the stop's `<h2>` top sits within 4px of `calc(band + 1rem)`. |
| F39 | A | A fourth, lowest, non-persisting voice in `use-region-fold.ts`, moving only `full ↔ quiet`, never to `folded`. Scroll never writes storage. |
| F40 | A | 390: first region head 1054.13 → ~391. The letterhead's vitals and the phase count move to the Sections sheet. |
| F42 | A | One `aria-live="polite"` region on the band's visible line 2, announcing on settle only, one announcement per distinct stop. |
| F43 | A | Every sheet kind gets a real `aria-label`. `mobile-sheets.tsx:260` currently sets one only when `compactTimer`. |
| F44 | A | The band's height is **measured** by a `ResizeObserver` on the band itself, per width, published once. Constant across scroll, never across widths, never hard-coded. |
| F45 | A | The 700ms jump lock keeps its job and gains one: it forces the target stop to be the reading stop for its duration. It does not own the seam height, because the seam height does not move. |
| F46 | A | One schedule door. The `Schedule dates` rule seam becomes a line inside the schedule region, not a sibling seam 200px above the region's own head. |
| F47 | A | The resting top band carries the letterhead (title, household, arc, vitals) and one sentence. Counted literally: **7**, against today's 20. |
| F48 | A | At 390 only chips anchored to the stop in frame print inline. |
| F49 | A | At 390 the region head's ledger collapses to the one inked leader plus the always-visible overflow glyph. |
| F50 | A | Line 2 prints the worst, then `· +3 MORE` as a **scored act** opening the standing sheet, which lists every one with its own act. |
| F51 | A | The pin's boundary has nothing to oscillate, because the band's height is identical either side of it. The mount observer has one threshold and it is off screen. |
| F52 | A | The pin no longer relocates focus, because the pin no longer unmounts anything. `job-ticket.tsx:235-244`'s effect dies with the component. |
| F53 | A | Render cost is answered by `content-visibility: auto` with `contain-intrinsic-size` on every mounted body — which F61's death makes safe — plus the unmounted state of every unvisited region. Virtualization inside a `full` 60-line body stays open and is named in §10 R5. |
| F54 / F59 / F89 | A | A fold from her hand prints `CLOSED BY YOU` and steps its rule to `--rule-mid` at three call sites. The lens's `quiet` prints a count line at `--rule-strong`. Four readings, four marks, all legible in a still. |
| F55 | A | The seven marks leave the rail and land on the letterhead's household line at `sm`, so settled-versus-ahead survives; `PROCUREMENT & ORDERS 4 OF 6` on the band is the count, not a replacement for the arc. |
| F56 | A | A returning reader still lands at the active section; the band names the household **and** counts everything standing with a door to it in that frame. |
| F58 | A | At 1280 anchored margin items stay reachable from a sheet whose trigger prints its count; the tier's rail carries a position line rather than three interactive children. |
| F60 | A | R99's zero-shift mechanism is generalised by removing the need for it: nothing pins at reduced height, because nothing has two heights. |
| F64 | A | `latchedDefault` becomes the region's initial **density**, not its initial fold — a density default cannot close a region she is reading. The visible consequence, `Client approvals` and `Schedule dates` opening on arrival, is named in §4 and §9. |
| F66 | **R (composition), A (placement)** | New card kinds for PO and damage are a data question this proposal does not answer. Whatever kinds exist sit in paper order with a printed anchor line, so a procurement card lands beside the piece it is about the day it ships. |
| F67 | **R** | The ledger sheet's scroll-offset preservation on the return trip is untested and stays untested here. It is a probe task, and inventing an answer would be worse than naming the gap. |

---

## 8. Canon note

**What this builds on.** R126, `DECISIONS.md:9981`: three paper stocks and only three, three rule weights for three ranks, B's colour at exactly three sites. Everything below is composed from that register and adds nothing to it.

**What it changes, named for the record (canon latitude, instruments §5 — not priced):**

| Id | Quoted, ≤25 words | What it becomes |
|---|---|---|
| **R99** `:3002`, quote at `:3017` | "beneath the project title on scroll at reduced height (labels fold into the line; diamonds and the today rule remain)" | Nothing pins at *reduced* height. The band is one height and only its words change; the schedule glance's `top: var(--doc-seam-height)` becomes a constant instead of a moving target. |
| **I149** `:9851`, quote at `:9859` | "honest empties rather than an invented figure, collapsing to a sticky two-line seam once the" | `deriveTicket` keeps producing all eight rows and their doors; nothing renders them as a table, and the seam becomes a band that never folds. Each row's destination is tabled in §4. |
| **I136** `:8427`, quote at `:8435` | "The spine grows three blocks — ≥1440px only. The compact rail (1180–1439px)" | The index is every stop on every one of the seven spreads, at both desktop tiers — as words at 1440, as ticks at 1280. The reading line is unchanged. |
| **I137/C11** `:8600`, quote at `:8620` | "One ordered descriptor, `PROJECT_PAPER_ORDER`, now states each Project" | Still one descriptor, still derived from mount order, still never declared twice. It gains two members, `care` and `record`, and the union at `document-index.ts:17` widens with it. |
| **I135** `:8377` | "region heads, red-letter needs, always-visible overflow, fold seams" | The needs zone stops being a block on the paper and becomes the band's line 2 plus a sheet, present at every offset rather than only at s0. The one-leader rule and always-visible overflow are untouched. |
| **R27** `:1058` | "The letterhead instruments" | Two client acts move onto the `HouseholdChip` line and print only when a client is linked; `SHARING · MILESTONES` and `CALL SHEET (4)` move to the margin's shelf. Still one quiet mono register, in two places with a reason. |
| **R15** `:381`, quote at `:391` | "opacity swell) on the ACTIVE spine marker only, where 'alive' is literally" | The swell moves to the letterhead's mark when the arc leaves the rail. Still exactly one ambient move, still stilled by block #1, now present at arrival and absent while she reads. |
| **I148** `:9815`, quote at `:9818` | "six-rung money ladder (`Budget · Plan · Authorized · Moved · Owed · Not drawn`) ships via two new pure" | Unshelved from the spine. The rungs stay exactly where they also render — in the money region — and the rail prints no money value. The band's line 1 carries one standing figure, derived from the same call. |
| **R125** `:9705`, quote at `:9836` | "no feature flags anywhere in this" | One fail-closed flag, `doc-lens`, for this program's four waves, retired at the last deploy. §9 states what it switches at each site. |
| **D1 / the Call Sheet** `page.tsx:2331-2334` | "the Call Sheet is an overlay, never a section" | Confirmed and honoured: it is a shelf door, never a ladder rung. This is a ruling v1 broke and v2 restores. |

### NG1 — one document at a time

Every state change is a DOM attribute or a scroll offset inside `[data-document-shell]`. The rungs call `scrollToRegion` (`use-document-running-index.ts:202-222`), a same-document `scrollIntoView`, never a route. `to the top` is `scrollTo(0,0)`. The shelf and the standing sheet open shipped `DocSheet` overlays, which leave the document mounted beneath them (`overlays/doc-sheet.tsx:199+`). No mechanic renders a second document's content at any density, and `Esc` still reaches the page's put-down handler unchanged (probe §4).

### NG2 — the shadow budget

The band separates from the paper by `--rule-mid` (1.5px `#2C2926`, `globals.css:131`) inside its own lower edge — the mechanism SP-04 requires and the only one available. This proposal declares **zero** shadow declarations, zero `drop-shadow()`, and puts `doc-elevated` on nothing new; `margin-item.tsx:46` keeps its site precisely because margin chips stay chips in a column rather than becoming pins on the paper. `shadow-gate.test.ts` stays green — but the **proof** NG2 asks for is SC8's computed-style sweep over the mockup, because that gate is `readFileSync` plus regex by construction (DC-58).

### NG3 — no Thumb Index

The ladder has one rung per stop **on this paper, in this paper's order, labelled with this paper's own head words** — six on a project spread, five on a proposal. Its length differs per spread. It is not an alphabet, not a fixed set of edge tabs, and it does not run down the viewport edge: it sits inside the 160px rail behind `Put down` and `ON THIS PAPER`, and at 1180–1439 it is one hair rule with ticks and no letters at all.

### NG4 — the R126 register as the floor

No mechanic in §3 introduces a type size, a rule weight or a pigment. The band's two lines are the existing 11px mono and 15px body. The rung names are `spine-running-index.tsx:97-105`'s existing 13px. The count line is `region-head.tsx:135`'s existing 12.5px. Line 2's exception ink is `--color-terracotta-ink` `#9C5340`, shipped by I151 (`DECISIONS.md:9941`), used on paper at 5.41:1 and never on rail stock. The focus ring steps from `--color-clay` to `--color-clay-ink` `#7C5E30` — a shipped NG4 token, not a new one — because clay measures 2.23:1 on paper against a 3:1 non-text floor. `region-rule.test.tsx:59-74` pins the double rule to the pixel and the component is never touched. `doc-letterhead.test.tsx:69-83` pins the 40px title, the tracking and the `doc-rule-mid` closing rule, and those assertions stay green.

---

## 9. Engineering path

Four waves behind one fail-closed flag, `doc-lens`. Every path below was `ls`'d against `apps/designer-portal/`; every one exists. Cost bands follow `research/29-panel-e1.md`: `days` = 1–3, `week` ≈ one, `weeks` = two or more.

**What `doc-lens` switches, per site (DC-59).** It is not one mount gate. It gates: (1) which node mounts at the ticket's position — `LensBand` or `JobTicket`; (2) which grid-template literal `page.tsx:1764` renders — `[200px_minmax(0,1fr)_232px]` or `[160px_minmax(0,1fr)_272px]`; (3) which class `shelf-panel.tsx:145` carries — `min-[1440px]:left-[200px]` or `left-[160px]`; (4) whether `use-lens-density.ts` attaches at all. The two Playwright bounds specs that assert one geometry or the other are run flag-on in CI and flag-off in the rollback check.

### The three load-bearing mechanisms, answered first

**(a) `use-region-fold`'s three voices** — `apps/designer-portal/src/components/document/region/use-region-fold.ts`.

1. `forceOpen` stays supreme and stays a **fold** override. A deep link lands on a body at full ink.
2. `explicit` (localStorage, `patina:doc-fold:<docId>:<region>`, written at `:129-135`) stays a hard fold, unchanged, and survives every scroll. Scroll may not write it (SP-07).
3. `latchedDefault` (`:104-119`) becomes the region's **initial density**, not its initial fold. This closes F64 — a default that resolves true after first paint can no longer flip a rendered-open region shut — and it is what makes SC1 true, because `Client approvals` stops arriving as a 55.5px `FoldSeam` at y 791.8. **That is a visible change to the first screen and it ships in Wave 1, named** (DC-62, DC-37).
4. A **fourth, lowest, non-persisting voice** — the lens — moves a region only between `full` and `quiet`, never to `folded`, and writes nothing.

The hook's return widens from `{folded, toggle, setFolded}` (`:90-94`) to `{folded, density, toggle, setFolded}` across all seven fold keys (`:25-40`). `region/__tests__/use-region-fold.test.tsx` is **not** an additive rewrite: `:38-41` asserts `defaultFolded={true} → 'folded'` and the change makes it `'open'`. That single `it` is **rewritten**; `:43-60` survives; two cases are added — *scroll never writes storage*, and *`explicit` outranks the lens in both directions* (DC-35).

**(b) The ticket seam and every `--doc-seam-height` consumer.**

`job-ticket.tsx` is **deleted as a component**. `lib/document/ticket-derivation.ts` is untouched and keeps deriving all eight rows. `components/document/lens-band.tsx` becomes the **only** sticky element in the header, the only publisher of `--doc-seam-height`, and the owner of `#doc-ticket-sentinel`. v1 kept the ticket's sticky shell alive beside a new publisher, which is two elements and one contract, and SP-04 forbids a second publisher (DC-49, DC-54). The property is now published **always**, on mount and on `ResizeObserver` fire, rather than only while `pinned && !unfolded`.

| Consumer | file:line | What happens |
|---|---|---|
| Schedule glance offset | `src/app/globals.css:1026` | Resolves once. The glance stops drifting against the paper (F87) with no code change. |
| Region landing clearance | `src/app/globals.css:1034` | Becomes `calc(var(--doc-seam-height, 0px) + 1rem)` — 72px — so the band's rule, the region gap and the double rule are not three weights inside 35px of the frame top (Dd-42). |
| FF&E landing floor | `src/app/globals.css:1037` | `max(var(--doc-seam-height), 4rem)` unchanged; at 56px the 4rem floor still wins. |
| Money inline clearance | `src/components/document/commercial/money-region.tsx:48` | Kept as written, with its local rationale. |
| **New** — every focusable in the paper | `src/app/globals.css` | `[data-document-paper] :is(a,button,input,select,textarea,[tabindex]) { scroll-margin-top: calc(var(--doc-seam-height, 0px) + 1rem) }`, plus `scroll-padding-bottom: 60px` on the scrolling root. Closes F120 and Dc-10/Dc-11. |
| `var(…, 0px)` fallback arms | all four | **Kept as written.** Nothing registers the property with `@property`, so the arms keep their meaning (F37). |

**Where this path disagrees with E1.** E1 §1's headline is *"a continuous seam is not a header change, it is a navigation change"*, and §2 forks the authors between three discrete steps (`days`) and continuity (`week`/`weeks`). **This proposal takes neither fork.** The seam has one height, so the fork does not apply, and E1's designed mitigation — freezing the seam at its condensed floor during a programmatic scroll — is not built, because there is nothing to freeze. Measured against Wave 1's work: `days` for the band, `week` for the redistribution of what the ticket carried.

**(c) The running-index observer's `-20% 0px -62% 0px` band and its 700ms jump lock** — `apps/designer-portal/src/hooks/use-document-running-index.ts`.

`READING_BAND` at `:34` is unchanged and **gains the job of assigning density**: the stop it names is the one `full` region, so SC11 and SC12 are true by construction rather than by claim (DC-55, Dd-28). It measured clean — three transitions across a scripted scroll, zero flicker across four clicks (F105, probe §2). `JUMP_LOCK_MS` at `:35` keeps holding the line through a smooth scroll and gains one job: for its 700ms it forces the target stop to be the reading stop.

The **mount** observer is a second, separate observer in `apps/designer-portal/src/hooks/use-lens-density.ts`, with one threshold (240px below the frame), no release, and a `MutationObserver` on `[data-document-paper]` for attach — it does **not** inherit the index's query-with-retry (`:120-133`, 8 × 250ms ≈ 2s), which E1 §3 flags as a silent hole for late-mounting roots. Mount state is written imperatively as `root.dataset.body`, outside React's render, never inside `startTransition` — the tree contains zero `startTransition` calls today (F88) and gains none.

### Wave 1 — The constant band · `week` · closes SC1, SC2, SC3

**Files.**
- `src/components/document/lens-band.tsx` — **new.** Two lines, the yields, one measured height, one `aria-live="polite"` region, the `ResizeObserver` publish, the sentinel.
- `src/components/document/job-ticket.tsx` — **deleted.**
- `src/app/(document)/doc/[id]/page.tsx` — the `RedLetterZone` XOR `DocumentGuide` ternary at `:1839-1847` deleted, both models feeding the band; `LetterheadInstruments` at `:1862-1873` and `:1874-1880` stops mounting; `<FolioLetterhead>` at `:1871` **stays**.
- `src/components/document/red-letter-zone.tsx`, `src/components/document/document-guide.tsx` — become model providers; the component names stay so `document-guide.ts`'s precedence gate is untouched.
- `src/components/document/doc-letterhead.tsx` — the seven-mark arc at `sm` on the `HouseholdChip` line; two client acts, printed only with a client.
- `src/components/document/letterhead-vitals.tsx` — empty-field suppression, so the row prints nothing when it has nothing (Dp-47).
- `src/components/document/overlays/doc-sheet.tsx` — the standing sheet as a new `kind`, using the shipped panel.
- `src/components/document/margin-rail.tsx` — **the shelf, moved into Wave 1**, above the first-touch note at `:462`. v1 dissolved the ticket in Wave 1 and built the doors' home in Wave 4, so four doors had no destination in between — which is F09, the finding Wave 1 claims to answer (DC-44).
- `src/components/document/studio-drawer.tsx` — the elapsed clock takes the evicted rail timer's job, and F03's 1280 overprint is fixed here, in the wave that evicts it.
- `src/components/document/region/use-region-fold.ts` — `latchedDefault` → initial density, so SC1 lands in this wave (DC-37).
- `src/app/globals.css` — the focusable clearance, the `scroll-padding-bottom`, the landing `+ 1rem`, the schedule content block's reserved height.
- `apps/designer-portal/package.json` — add `browserslist`; there is no key today (DC-57).

**Tests.**
- `src/components/document/__tests__/job-ticket.test.tsx` — **deleted with the component.** v1 named `:519`, `:524`, `:529`, `:259`, `:262`, `:517`, `:533-541` line by line where the unit is the `it`, leaving `:226-241`, `:244-254`, `:268`+ and `:505-508` unnamed and red (DC-42).
- `src/app/(document)/doc/[id]/page.test.tsx` — **the whole `describe` at `:1243-1411` is rewritten**, not two blocks of it: `:1252-1269`, `:1271-1293`, `:1309-1313`, `:1315-1341`, `:1343-1349`, `:1351-1358`, `:1361-1382`, `:1384-1410`, plus the money-row assertions at `:1583-1587` and `:1602-1604`. `:1351-1358` and `:1361-1382` survive as a selector rename to `[data-lens-band]` — `sentinel.nextElementSibling` is worth keeping. `:1384-1410` dies twice over: the rows go and `getByRole('region', { name: 'Needs attention' })` disappears with the ternary (DC-46).
- `src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts` — **the regex at `:19` is deleted.** Measured over the real `page.tsx`: it passes on the comment at `:1961` at **143** characters, not on the attribute at `:1942` at **1,109**. Its replacement asserts DOM **order** and lives in `page.test.tsx`, because `:1-6` is a `fs.readFileSync` file with no React harness and `page.tsx:1959-1963` puts a JSX comment before the mount, so "first element child" is stronger than the tree (DC-56). `:15-17`, `:21-23`, `:24`, `:25-27` survive. **`:50-58` and `:60-63` are named and honoured**: `margin-rail.tsx`, `mobile/mobile-margin-chips.tsx` and `mobile/mobile-sheets.tsx` keep `classifyMarginItems` and `MarginDecisionClassificationNotice`, and `margin-rail.tsx` keeps `legacyCoordinationDrafts(coordItems ?? [])` (DC-60).
- `e2e/document/quiet-responsive-shell.spec.ts` — **rewrite.** `:173-176`, `:183-185` (`toHaveCount(8)`) and `:190-196` (the 390 unfold path) assert a table this wave deletes. `:165` (`On this paper`) survives.
- `e2e/document/quiet-release-contracts.spec.ts` — **`:169-299` rewritten whole.** Every step runs on `[data-compact-spine-timer-doorway]` (`:185`) or `[data-full-spine-timer]` (`:223`), both evicted; `:212-237` is the **1439→1440** handoff, `:239-260` is 1280→1179, `:262-291` is 1179→1180. The compact timer doorway's job moves to the Studio Drawer and the handoff assertions move with it (DC-36).
- `src/components/document/__tests__/responsive-document-shell.test.tsx` — **rewrite** of `:655-689` (eight rows at 1440), `:213-221` (the two timer surfaces) and **`:692-750`, the room-in-hand flow** — the only path to taking a room in hand is `ticketRow('rooms')` then `roomChip('living')` (`:697-698`), so the chips move into the `Pieces` head's ledger with the same handler and the test follows them (DC-47, Dd-31).
- `src/components/document/region/__tests__/use-region-fold.test.tsx` — `:38-41` rewritten, per (a).
- `src/components/document/doc-letterhead.test.tsx` — **additive.** `:69-83` and `:85-97` stay green; cases added for the arc and the client-act pair.
- **New**, `e2e/document/lens-band-height.spec.ts` — the falsifiable sentence: sample `[data-lens-band]`'s `boundingBox().height` at scrollY 0, 400 and 1200 on the rich and pre-work documents at 1440, 1280 and 390, and assert one value per document per width, and that the 1440 and 1280 values are 56. Also E1's owed landing assertion (F38).

**Rollback.** `doc-lens` off mounts `JobTicket` at its old position and restores the ternary and the instruments row; `--doc-seam-height` reverts to its two-state publication. No migration, no persisted state.

### Wave 2a — The ladder at 1440 and 1280 · `week` · closes SC4 at 1440 on the project spread

**Files.**
- `src/components/document/spine-ladder.tsx` — **new.** Rungs, the `--rule-hair` ladder rule, the clay segment, the ceiling-free rung height, the yield, the text-free 1280 form.
- `src/app/(document)/doc/[id]/page.tsx` — **the grid template at `:1764`** becomes `min-[1440px]:grid-cols-[160px_minmax(0,1fr)_272px]`. This is where the rail's 200px lives; `doc-spine.tsx:44` carries only `min-[1440px]:w-auto`, so v1 assigned the narrowing to a file that does not carry it (DC-41).
- `src/components/document/doc-spine.tsx` — children 2, 3, 5, 6 stop mounting; child 4's `min-[1440px]` gate drops; `Put down`'s label moves to `min-[1440px]:inline` at `:53`; `min-[1180px]:pb-24` is **kept**, and the ladder ends at y 804 because of it.
- `src/components/document/spine-running-index.tsx` — becomes the ladder's row renderer; the reading-line measurement at `:45-52` is reused verbatim.
- `src/components/document/shelves/shelf-panel.tsx` — `:145`'s `min-[1440px]:left-[200px]` → `left-[160px]`. v1 rewrote the test and not the component (DC-41). **`:136`'s `if (!fullTier && routes) return null` is left alone**: F25 and F57 are killed — `planroom` and `specbook` both declare `routeSegments`, so that branch never applies to them (Dp-34).
- `src/lib/document/document-index.ts` — `PROJECT_PAPER_ORDER` (`:36-57`) gains `care` and `record`; `DocumentIndexKey` (`:17`) widens from four to six; `regionHeadingId`'s throw (`:93-102`) is kept as the guard that keeps the union and the table in step.
- `src/components/document/care-band.tsx` — `data-index-region="care"` and a heading id on the existing `RegionHead` at `:254`.
- `src/components/document/previous-work.tsx` — a `RegionHead` and `data-index-region="record"` on the existing `<section aria-label="The record">` at `:37`.
- `src/components/document/mobile/mobile-sheets.tsx` — the spine sheet gains the ladder list and the vitals; every sheet kind gains an `aria-label` (`:260`); rows are `min-h-11`.
- `src/components/document/spine-timer.tsx`, `src/components/document/spine-shelved-blocks.tsx` — **left on disk, unmounted.** Deleting either drops it from `contrast.test.ts:313-341`'s hard-coded scan silently.

**Tests.**
- `src/components/document/doc-spine.test.tsx` (48 lines, the whole file) — **rewrite.** `:14-19` pins `Jump to Project` on the evicted seven-mark `<ul>`; `:23-29` is **one** `it` whose `:26-28` reads `screen.getByText('Project').closest('p')` on the evicted active caption — v1 said `:25` survives and named only `:43-46` (DC-43).
- `src/components/document/__tests__/responsive-document-shell.test.tsx` — `:202-211` (the arc's jump buttons) named as a rewrite; `:186-196` (`data-spine-regime`) survives because `min-[1440px]:w-auto` is unchanged; `:310-320` (the margin's `col-start-3` and `min-[1440px]:sticky`) survives, the width changes.
- `src/components/document/__tests__/shelved-spine.test.tsx` — **rewrite** of `:155-196` (`paperRegionsForSection`), `:217-236`, `:238-246` and `:248-262`, all of which pin four rows on project and two on install/care against a six-stop ladder. `:82-98` (one `aria-current`, jump from any) survives.
- `e2e/document/quiet-responsive-shell.spec.ts` — **`:251-253` named**: it polls the spine's `boundingBox().width` for `>= 199` at 1440 and the rail is now 160 (DC-41).
- `e2e/document/quiet-release-contracts.spec.ts` — `:150-158` pins paper `[200,1208]` and margin `[1208,1440]`; the new geometry is paper `[160,1168]`, margin `[1168,1440]`. `:105-118` (55–57px at the compact tier) is **untouched** — this proposal does not widen the compact rail, which is why this wave is a `week`.
- `src/components/document/shelves/shelf-panel.test.tsx` — `:145` rewritten to `left-[160px]`.
- `src/lib/document/__tests__/contrast.test.ts` — **additive.** `spine-ladder.tsx` is added to `:313-341`'s scan list in the same PR that creates it.

**Rollback.** Flag off restores the 200px template, the marks, the caption, the index, the timer and the presence line.

### Wave 2b — Regions on the pre-work spreads · `weeks` · closes SC4 on pre-work

The structural cost E1 §4(3) priced and this proposal carries. The proposal spread renders **zero** `[data-region-head]` and zero `[data-index-region]` elements (F16, confirmed twice by DOM query); its content is inline in `page.tsx` with a plain head at `:2006`. This wave wraps the four pre-work spreads' bodies in real regions with real heads — five stops on a proposal. E1's fork is answered: **an index row may print a name and a position with no value** (SP-05), so no new queries are needed for `brief` and `discovery`.

**Tests.** `src/components/document/__tests__/shelved-spine.test.tsx:178-187` asserts `paperRegionsForSection` returns `[]` on the four pre-work spreads — the exact behaviour this wave changes. `src/lib/document/__tests__/ticket-derivation.test.ts` stays green, because `deriveTicket` is untouched.

**Rollback.** Flag off; the pre-work ladder falls back to the stage list, which is what 390 already shows.

### Wave 3 — The two densities · `week` · closes SC11, SC12

**Files.**
- `src/hooks/use-lens-density.ts` — **new.** The mount observer, the one 240px threshold, the reserved-height estimator, `settle()` and `window.__lensSettled()`.
- `src/hooks/use-document-running-index.ts` — the resolver's stop becomes the sole assigner of `data-density="full"`.
- `src/components/document/region/region-head.tsx` — the count line and the visually-hidden non-visual cue; the head's two-track grid at `:118-121` is **not** touched, so `region-head.test.tsx:110-120` stays green.
- `src/components/document/region/fold-seam.tsx` — `CLOSED BY YOU`, and focus parked on the seam button when a body unmounts (F08/F41).
- `src/components/document/region/region-rule.tsx` — **untouched.** The weight step on a fold happens at the **three call sites**, which v1 never named: `src/components/document/commercial/money-region.tsx:233`, `src/components/document/schedule/schedule-rule-region.tsx:182`, and `src/components/document/approvals/project-approval-document.tsx`. `RegionRule` already takes `weight="mid"` (`region-rule.tsx:17-22`) (DC-45).
- The region bodies, each needing its quiet form and its reserved-height estimator: `src/components/document/ffe-section.tsx`, `src/components/document/commercial/money-region.tsx`, `src/components/document/approvals/project-approval-document.tsx`, `src/components/document/schedule/schedule-rule-region.tsx`, `src/components/document/care-band.tsx`, `src/components/document/previous-work.tsx`. Six bodies, six count lines — this is why the wave is a `week`.
- `src/app/globals.css` — the `--doc-region-gap` token; the deletion of every call-site margin in `research/10-code-anatomy.md` §6, including the bare folded-approvals `<div>` at `approvals/project-approval-document.tsx:565`; `content-visibility: auto` with `contain-intrinsic-size` on mounted bodies; **and one new `@media (prefers-reduced-motion: reduce)` block**, sitting beside block #2 at `:439-458`, covering Y-1's spans and Y-3's yield. Y-4, Y-5, Y-6, Y-7, Y-9 and Y-10 are covered by existing blocks #1, #2, #4, #9 and the no-preference gate, as named in §3 (Dc-08, Dc-26).

**Tests.**
- `src/components/document/region/__tests__/fold-seam.test.tsx` — **stays green.** `:36-45` forbids an `opacity-0`/`translate-y` flash gated on a hydration flag; the density attribute is written imperatively, not through a `mounted` flag.
- `src/components/document/region/__tests__/region-head.test.tsx` — **additive.** `:128-158` (the action-region contract at both widths) stays true unconditionally.
- `src/components/document/region/__tests__/row-overflow.test.tsx` — **stays green** (`:31-44`).
- **New**, `e2e/document/lens-density.spec.ts` — at 1440 with a seeded 60-line, 4-room schedule: exactly one region at `data-density="full"` at scrollY 0, 400 and 1200; no region with zero readable text; **and `document.documentElement.scrollHeight` measured before and after every mount, asserting the delta is below the frame's top edge** — the reserve model's own falsification.

**Rollback.** Flag off mounts every region at `full`, which is today's behaviour exactly. The fourth fold voice is inert without the observer and writes nothing.

### Wave 4 — The margin · `days`

**Files.** `src/components/document/margin-rail.tsx` (the per-item anchor line at `renderItem`, one heading instead of two — the duplicate at `:264` goes — and the tab count at `:225-229`), `src/components/document/mobile/mobile-margin-chips.tsx` (the anchor filter and the `py-1.5` padding at `:98` and `:114`), `src/components/document/margin-note.tsx` (the two-line cap at `:9-11`).

`shelves/shelf-panel.tsx` is **not** in this wave. v1 spent a Wave 4 line item on `:136` for F25/F57, both of which the refutation wave killed (Dp-34). The wave drops from a `week` to `days`.

**Tests.** `e2e/document/margin-handoffs.spec.ts:67-70`, `:102-105` — **stay green**; `data-margin-mode` is unchanged. `src/components/document/__tests__/responsive-document-shell.test.tsx:310-320` — the margin's column and `sticky` survive; the width literal changes.

**Rollback.** Flag off restores the margin exactly as it ships today.

### The gates, shown green

- **`src/lib/document/__tests__/shadow-gate.test.ts`.** One `box-shadow` in `globals.css` spent by `.doc-elevated` (`:85-95`) — unchanged. No new shadow under `src/` (`:97-105`) — none declared. No `drop-shadow()` (`:107-122`) — none. One `--elevation-sheet` declaration (`:124-127`) — unchanged. `.doc-elevated` on at most three TSX files (`:129-136`) — still `studio-drawer.tsx`, `margin-item.tsx`, `overlays/doc-sheet.tsx`. The band separates by rule weight, which is why the budget has room to spare rather than needing any.
- **`src/lib/document/__tests__/contrast.test.ts`.** `--doc-rail-stock` still `#E8E3DB` (`:297-303`). Rail inks unchanged (`:304-311`). The hard-coded file scan (`:313-341`) keeps all five files on disk and gains `spine-ladder.tsx`. Rail-vs-paper separation > 1.1 (`:365-372`) untouched. **No `--color-clay` and no `--color-aged-oak` text is introduced in any scanned file** — the focus ring is an `outline`, not text, and it uses `--color-clay-ink`.
- **`e2e/document/workflow-stage-responsive.spec.ts:30-32`, `:47`.** Shell visible at 320, no horizontal overflow. The rail narrows and the margin widens by the same 40px, so the paper column is unchanged and nothing new can overflow.
- **`src/lib/document/__tests__/ticket-derivation.test.ts`.** Entirely green, entirely untouched — the eight rows, their order, their labels, the seam's worst-two tie-break, the third dropped whole, `Nothing overdue`. The derivation is good and this proposal keeps all of it. The ninth row, `clientcopy` (`ticket-derivation.ts:767-771`), has a home: it is a shelf door with no route segment, so it prints on the shelf as an overlay door, not a leaf link.

---

## 10. Risks

**R1 — The reserved-height estimate is wrong on a real schedule, and the scrollbar lies in a new way.** Every region reserves its full height from first paint, estimated from its own row count at 65px per FF&E line. If the estimate is 15% low on a 60-line schedule, mounting the body grows the document by ~600px below the frame, and the scrollbar thumb jumps — the very instrument the reserve model exists to make honest.
*The falsifying observation, week one:* seed one project with a 60-line, 4-room FF&E schedule with catalog crops (E1's Rank-2 seeding task; the synthetic seed's 3 lines and 0 rooms will never show it, F05). Measure `scrollHeight` immediately before and after each mount at 1440. If any single delta exceeds 5% of the region's reserved height, the estimator is wrong and Wave 3 does not ship until it is per-region rather than per-row-count.

**R2 — 56px is not enough for a real exception string.** Line 2 at 15px in a 944px measure holds roughly 110 characters. `OVERDUE 6 days — Primary bedroom client approval on the Hartland wool rug + walnut nightstands` is 96 and clears it; a longer one wraps, the band grows, and the falsifiable sentence is false.
*The falsifying observation, week one:* render the specimen's two red-letter rows and the longest live `deriveTicketSeam` exception into the band at 1440, 1280 and 390 and measure. If any is not 56 / 56 / stable, the truncation rule in §4 applies — act's words first, never the number, the day-count or the room — and if that cannot bring it inside one line at 1280, the band does not ship.

**R3 — Dissolving the ticket loses a fact nobody misses until a real project.** Five of eight rows print only absence on the Chen seed (F27), so the seed cannot show what the rows carry on the Vandersteen spread.
*The falsifying observation, first week of use:* a designer asks "where did Drawings go", or P3's walk cannot reach the plan room in ≤2 acts from any scroll state, or the room-in-hand take cannot be completed from the `Pieces` head's ledger — the case `responsive-document-shell.test.tsx:692-750` is the only existing coverage for.

**R4 — `content-visibility: auto` behaves differently for find-in-page across the Playwright matrix.** F61 is killed — `.has-wash` already declares `isolation: isolate` (`globals.css:322-325`), so containment changes no stacking — which reopens the property as the render-cost control. Chromium forces rendering of `content-visibility: auto` subtrees for find-in-page; `playwright.config.ts:65-68` also enables WebKit, and `apps/designer-portal/package.json` has no `browserslist` today.
*The falsifying observation, week one:* in the WebKit project, load the rich spread at 1440, scroll to s3, and search for a vendor name that appears only in a mounted-but-off-screen FF&E line. If the browser does not find it, `content-visibility` is dropped and the render-cost claim in §7/F53 falls back to the unmounted-tail argument alone.

**R5 — Two densities is one too few for a 60-line FF&E body.** A `full` 60-line schedule is 60 rows plus 60 catalog crops with no virtualization (`ffe-section.tsx`, 1549 lines, F53). Mounting is one-way, so by the end of a session every region she has passed is mounted.
*The falsifying observation, week one:* on the seeded 60-line schedule, after scrolling s0 → s3 and back twice, the running index's rAF `resolve()` (`use-document-running-index.ts:136-145`) runs two or three scroll events behind and the reading line visibly trails her. This proposal does not fix that and does not claim to; virtualization inside a `full` FF&E body is the next wave.

**R6 — Narrowing the rail breaks a pixel contract nobody expected to be load-bearing.** `quiet-release-contracts.spec.ts` is the deepest pixel-boundary contract in the repo (E1 §5).
*The falsifying observation, week one:* the first Wave 2a build turns `quiet-release-contracts.spec.ts:150-158` and `quiet-responsive-shell.spec.ts:251-253` red **and** leaves the shelf panel 40px adrift because `shelf-panel.tsx:145` pins `min-[1440px]:left-[200px]`. The third one is the tell, because the shelf's position was never obviously a function of the rail's width.

**R7 — The two new roots throw.** Wave 2a adds `care` and `record` to `DocumentIndexKey` and `PROJECT_PAPER_ORDER`, and `regionHeadingId` **throws** on any key not in the array (`document-index.ts:93-102`).
*The falsifying observation, week one:* pressing `Closing the book` throws in the console on the first branch build, or `use-document-running-index.ts`'s `attach()` never reaches `attached.size === ordered.length` and gives up after its 8 × 250ms window (F75) — which presents not as an error but as a ladder whose bottom two rungs never highlight.

**R8 — The rung yield reads as a bug.** Y-3 unprints the current rung's name while its head is in frame. A designer who has learned that the rail lists the paper's stops may read a missing word as a rendering fault rather than as the rail declining to repeat the paper.
*The falsifying observation, first practitioner walk:* somebody asks why the rung they are standing on has no label, or scrolls up specifically to check the rail still has six rungs. If so, the fix is to keep the word and drop the bold — the yield becomes weight rather than presence — at the cost of the SP-08 win.

---

## 11. Refuses

**1. No proportional-extent map rail.** The rail does not draw regions at their true height. On the Vandersteen spread the schedule rule region is a fraction of a 60-line FF&E body, and a proportionally-drawn rung is a 6px press target — a 2.5.8 failure before it is a taste failure. *Refused, not deferred:* extent is a fact about the paper, and under the reserve model the **scrollbar** is a true measure of it at every offset for the first time. A ladder's job is that every rung is reachable, and equal rungs are how that is true.

**2. No second sticky band.** The current region's head does not pin beneath the band at reduced height, R99-style. Two stacked sticky bands are a header again, and SC2's 108px would be spent on chrome rather than saved. *Refused, not deferred:* the fact it was going to carry — which region she is inside — is printed exactly once per frame, on the paper, and the rail's clay segment says where that is.

**3. No pins in the paper's gutter.** Margin chips do not move beside the lines they are about. A decision about the whole job has no line to point at, so the mechanic needs an orphan home or it loses items silently — and `margin-item.tsx:46` carries one of the three legal `--elevation-sheet` sites, so a pin on the paper is a shadow on the paper (NG2). *Refused, not deferred:* what the gutter was for is delivered by one printed line per item, at zero cost to the column and zero cost to the shadow budget.

**4. No values on the rail.** No counts, no dollars, no `NOT SCHEDULED`, no exception marks. *Refused, not deferred:* today `Money unread` and `$6,200 OWED` print at the same size, weight and row position (F108), and `Client approvals / 0 IN THE LOG` sits 540px from `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED` in a different type register (F29). A ladder that prints no values cannot print a false one. The money figure it would have carried is on the band's line 1 at every offset, derived by the same call as the money region's own head — which is what v1 got wrong and what Dd-27 caught.

**5. No ink ramp for density.** A quiet region is not a faint region. `#65594E` measures 5.32:1 on rail stock against a 4.5:1 floor (F74) — one step of headroom and none for a family — and nothing in the rail has ever changed weight across scroll states (F84), so a designer has no learned expectation that faintness means anything. *Refused, not deferred:* quieter means fewer words, at full ratified ink, which a still screenshot can prove.

**6. No find-in-page inside a region she has never reached.** A region's body does not exist in the DOM until she comes within 240px of it, so `⌘F` cannot reach the unvisited tail. *Refused, not deferred, and stated where v1 stated it nowhere* (Dd-38, Dp-40): the compensation is that mounting is **one-way**, so everything she has scrolled past stays findable for the life of the document view, and `content-visibility: auto` keeps the mounted-but-off-screen bodies findable too (R4 names the browser risk). Making the unvisited tail findable means mounting the whole document on load, which is exactly the render cost F53 records `ffe-section.tsx`'s 1549 unvirtualized lines already paying. Teaching ⌘K to search line content is new capability and is refused with the rest.

**7. No new capability.** No PO-acknowledgement badge on the FF&E line, no damage-claim door, no phase-wide install roster, no procurement card kind in the margin (F23, F62, F63, F65, F66, F06). *Refused, not deferred:* the ask is to make the same information and the same acts occupy less attention. Every one is a real gap, several cost P4 a trip out of the document, and they are named so the next program can pick them up. The one thing this proposal takes from that set is the **dates** — a carrier window is a deadline, and deadlines are what both organs already carry.

**8. No in-product motion toggle.** The OS `prefers-reduced-motion` query is the only control, which is what the tree does today: F86 records no in-app motion setting anywhere, `hooks/useReducedMotion.ts` exists and no file under `components/document` imports it (F30), and the Document's motion policy is nine CSS reduce blocks plus one no-preference gate. *Refused, not deferred:* a product-level motion setting is a settings surface with its own persistence, its own scope question (this document or every document) and its own review, and smuggling one into a lens proposal would answer a different question. Stated here so the position is on the record rather than unraised (Dc-15).

---

## The candidate mechanics, M-1 to M-10

| M | Verdict | One sentence |
|---|---|---|
| **M-1 · The Lens Line** | **Adapted** | One band, height a constant, its *sentence* what changes — and line 1 yields at s0 rather than reprinting the letterhead 60px below it. |
| **M-2 · The Map Rail** | **Refused** | Proportional extents make short regions unclickable; the rail becomes six equal rungs that print names and position and no values, and the current rung yields its name to the paper. |
| **M-3 · Reading-line Density** | **Adapted, and halved** | Two densities, assigned by the running index alone; body mounting is one-way and strictly off screen, and the release with its scroll correction is deleted. |
| **M-4 · The Gutter Margin** | **Refused** | A pin has no home for a document-wide decision and would carry `margin-item.tsx`'s `--elevation-sheet` onto the paper; the margin instead prints each item's anchor and moves nothing. |
| **M-5 · Section Zoom** | **Adapted** | Its detent character survives as how a transition reads — one step, never a gradient — and a rung press forces the target to be the reading stop for the 700ms lock. |
| **M-6 · Focus Follows the Pen** | **Adapted** | As ink weight on the edited line alone — a clay-ink rule and the flat `-still` tint, never a dimmed sibling — plus a freeze on mounting while the pen is down. |
| **M-7 · The Ticket Dissolved** | **Adopted** | `ticket-derivation.ts` keeps deriving all eight rows and their doors; nothing renders them as a table, and §4's table gives every row a home at s0 and at s2. |
| **M-8 · The Standing Rule** | **Refused outright** | v1 kept it as one right-flush word and that word was the third copy of the current region in every frame. The word is deleted; the paper's own head is the only naming of the stop. |
| **M-9 · The Quiet Foot** | **Adopted, narrowed** | The two foot blocks get rungs and real roots, and the band's line 1 prints the closing count right-flush — but line 2 keeps the exception, because arriving somewhere does not outrank something being late. |
| **M-10 · Tempo Damping** | **Adapted** | No velocity threshold and no dwell; the 700ms jump lock damps programmatic scrolls, the shipped `READING_BAND` damps flings, and `settle()` plus `window.__lensSettled()` make both deterministic. |

---

# Critique responses

Ninety-seven defects addressed to Proposal Y or to "both". **88 fixed · 5 accepted and narrowed · 4 dropped with a reason.**

## C-design — Dd · 25 defects: **19 fixed · 4 narrowed · 2 dropped**

| id | verdict | answer |
|---|---|---|
| **Dd-25** | **fix** | The band's right-flush stop word is deleted, and Y-3 makes the current rung yield its name while that stop's head is in frame. The current region is printed once per frame at every offset. §4 header line 1, §4 spine, §3 Y-3, M-8 refused outright. |
| **Dd-26** | **fix** | There is no upward re-mount rule because there is no release. A mounted body never unmounts. §4 density, §3 Y-4, §5 `condensed` reverse. |
| **Dd-27** | **fix** | One standing money figure — `$17,500 OUT` — is right-flush on line 1 at every offset, dropped only while `Money` is the reading stop. The rail still prints no values, for F108's reason. §4 header line 1, §11.4. |
| **Dd-28** | **fix** | `use-document-running-index.ts`'s resolver is the sole assigner of `full`. Exactly one, never zero, by construction. §4 density, §6 SC11, §9(c). |
| **Dd-29** | **fix** | Twelve rungs become six, all of them real regions on the project spread, and the current one yields its word. §4 spine, the rung table. |
| **Dd-30** | **fix** | The ladder ends at y 804, inside `doc-spine.tsx:44`'s `min-[1180px]:pb-24`, which is kept and named. SC4 is recomputed at 83.9% with a 96px longest empty run, and the last rung clears the 60px drawer by 36px. §6 SC4, §9 Wave 2a. |
| **Dd-31** | **accept-and-narrow** | Real: at s0 `Pieces` is quiet and off screen, so `ADD A ROOM` is not in the frame. What narrowed: the claim is no longer "a home in the s0 frame" but "one press from every scroll state, via the ladder's `Pieces` rung". What it gained: the room **chips themselves** move into that ledger with their handler, so the take at `responsive-document-shell.test.tsx:697-698` survives (see DC-47). §4 H1 table, §9 Wave 1. |
| **Dd-32** | **fix** | There are no stubs. Every region reserves its full height from first paint, so a quiet region is a head, a count line, a leader act and bare paper — SP-12's drawn line exactly. §4 density. |
| **Dd-33** | **fix** | The band is `h-14` border-box with the `--rule-mid` inside it: 8.8 + 15.4 + 2 + 19.5 + 8.8 + 1.5 = **56.0**. The arithmetic closes and the falsifiable sentence survives it. §6 SC2. |
| **Dd-34** | **fix** | SC1 is computed from the JSON's measured **189.31px**, not the anatomy's 211px estimate. SC1 = 357px. §6. |
| **Dd-35** | **accept-and-narrow** | Real: at 1180–1439 the margin is `data-margin-mode="sheet"` and off canvas. What narrowed: the claim drops from "on screen at every scroll state" to "on screen at every scroll state **at 1440**, one press behind a counted tab at 1280 and 390", and the qualifier is now in the table, not only in the sentence above it. §4 H1 table. |
| **Dd-36** | **fix** | The travelling `IN FRAME` rule is deleted. Each margin item prints its own anchor line — `BESIDE PIECES` or `ABOUT THE WHOLE JOB` — static, legible from a still. A mechanic died here. §4 margin. |
| **Dd-37** | **fix** | `studio-drawer.tsx` is in Wave 1's file list, in the same wave that evicts the rail timer. §4 the 1180–1439 tier, §9 Wave 1. |
| **Dd-38** | **fix** | Find-in-page is now Refuse #6, with its mechanism: mounting is one-way, so everything passed stays findable, and `content-visibility: auto` — safe now F61 is killed — keeps mounted-but-off-screen bodies findable. R4 carries the WebKit risk. §11.6, §10 R4. |
| **Dd-39** | **fix** | Line 1 prints **nothing** while the letterhead is in frame. The band stays 56px; line 2 centres in it. §4 header line 1, §5 `at rest`. |
| **Dd-40** | **fix** | Moot: there is no release and no correction in either direction. §3 Y-4, §4 density. |
| **Dd-41** | **fix** | The shelf is one door per line — five lines — and the count uses parentheses, `CALL SHEET (4)`, not the separator middot. The margin also gains 40px. §4 margin. |
| **Dd-42** | **fix** | `globals.css:1034` becomes `calc(var(--doc-seam-height, 0px) + 1rem)` = 72px, so the band's rule, the region gap and the double rule are not three weights inside 35px. §9(b). |
| **Dd-43** | **accept-and-narrow** | Real, and verified in the instrument: `measure-layout.mjs:245-253` claims an element's whole rect for a border alone, and `:286-289` runs the empty-run cursor to `spineRect.bottom`. What narrowed: SC4 no longer stands alone as evidence of orientation. It is reported at 83.9% **beside** a second measurement the probe must print — distinct rail text labels, **18 today → 7 after** — so the rail is shown getting quieter in words while the ink number rises. What it no longer claims: that 83.9% means she can read more. §6 SC4. |
| **Dd-45** | **drop-with-reason** | The defect says one plank has two values and two file:lines. Against Y the number is right: `sed -n '1213p' ffe-section.tsx` reads `className="mb-1.5 mt-5 flex items-baseline justify-between gap-3"` and `:1302` reads `className="mb-1.5"`. Both sites carry **`mb-1.5` = 6px**, which is Y's value; the 12px is X's error. §4 names both sites at 6px so the mockups agree. |
| **Dd-46** | **drop-with-reason** | SP-02's own text names the two forms: "*nothing yet* and *not known yet* get one printed form each." Y prints the plank's words; `—` is the drift. Only the case is corrected, to the paper's sentence case: `Nothing yet` and `Not known yet`. §4 density. |
| **Dd-47** | **fix** | `The work` is dropped. The block at that position prints inside the FF&E region with no head of its own — the mis-attribution F91 measures at 433 of 775px. §4 spine, the rung table. |
| **Dd-49** | **accept-and-narrow** | Real: not one cell of §6 attributes a point to density, and none could. What narrowed: the density system no longer claims frame budget at all — §6 says so in its own words — and its claim is now three named things it does deliver: render cost on an unvirtualized 60-line body (F53), a scroll extent that never shrinks (Dp-41), and find-in-page for everything passed (§11.6). What it lost: the release, the hysteresis pair, the fourth threshold set, the scroll correction and Wave 3's Rank-1 risk. §6, §10 R1. |
| **Dd-50** | **fix** | `· +3 MORE` is scored ink and opens the standing sheet (Y-10), which lists every standing exception with its own act. §3 Y-10, §4 header line 2. |
| **Dd-52** | **fix** | The carrier window and the PO's fourteenth day are **dates**, and dates rank into the standing set. They print on line 2 when worst and always in the standing sheet. Filing the claim stays refused. §4 header line 2, §7 F23/F62/F63/F65, §11.7. |

## C-feasibility — DC · 31 defects: **31 fixed**

| id | verdict | answer |
|---|---|---|
| **DC-32** | **fix** | `The accounts` is dropped from the project ladder. Verified: `page.tsx:2202` gates `<AccountBand>` on `spreadSection !== 'project'`, with the comment at `:2197-2201` saying the band and the money region are one either-or. §4 spine, the rung table. |
| **DC-33** | **fix** | `Authorizations` is dropped. Verified: `authorizations-ledger.tsx:113` renders inside `project-commerce-section.tsx:33`, which renders inside `MoneyRegion` at `page.tsx:2122`. §4 spine. |
| **DC-34** | **fix** | Six rungs, of which four have roots today and **two** — `care` and `record` — are created in Wave 2a with their files and their `PROJECT_PAPER_ORDER` and `DocumentIndexKey` entries named. Not eight, and not unpriced. §4 spine, §9 Wave 2a, §10 R7. |
| **DC-35** | **fix** | `use-region-fold.test.tsx:38-41` is named as a **rewrite**, not an additive one. `:43-60` survives. §9(a). |
| **DC-36** | **fix** | `quiet-release-contracts.spec.ts:169-299` is named as a whole rewrite, with all three handoff steps enumerated, and the compact timer doorway's destination stated: the Studio Drawer, Wave 1. §5 `mobile`, §9 Wave 1. |
| **DC-37** | **fix** | The `latchedDefault`→density change moves into **Wave 1**, so SC1 = 357px is credited to the wave that delivers it. §6 SC1, §9(a), §9 Wave 1. |
| **DC-38** | **fix** | At 390 line 1 drops to `VANDERSTEEN RESIDENCE · $17,500 OUT` — 35 characters in a 334px measure (`page.tsx:1791` `px-7`). The phase count, install date and vitals go to the Sections sheet. The band measures ~86–90px and SC3 claims stability there, not 64px. §4 "390", §6 SC3. |
| **DC-39** | **fix** | `The call sheet` is dropped from the ladder and kept as a shelf door. Verified: `page.tsx:2331-2334` — "the Call Sheet is an overlay, never a section". §4 spine, §8 canon note. |
| **DC-40** | **fix** | The sentence is struck. Both deleted ranges are above `:1942` and the 1,109-character window is untouched. §4 mount-order consequence. |
| **DC-41** | **fix** | The narrowing is assigned to `page.tsx:1764`'s grid template. `shelf-panel.tsx:145` is added to the file list beside its test, and `quiet-responsive-shell.spec.ts:251-253` (spine width ≥ 199) is named. §9 Wave 2a. |
| **DC-42** | **fix** | `job-ticket.tsx` is deleted as a component, so `job-ticket.test.tsx` is deleted whole and no `it` is left with no subject. §9(b), §9 Wave 1. |
| **DC-43** | **fix** | `doc-spine.test.tsx:14-19` and `:23-29` are both named as rewrites — `:26-28` runs on the evicted active caption — and `responsive-document-shell.test.tsx:202-211` and `:213-221` are named too. §9 Wave 2a. |
| **DC-44** | **fix** | The margin's shelf moves into **Wave 1**, the same wave that dissolves the ticket, so the four leaf doors never lack a destination. §9 Wave 1. |
| **DC-45** | **fix** | The three `RegionRule` call sites are named: `money-region.tsx:233`, `schedule-rule-region.tsx:182`, `approvals/project-approval-document.tsx`. The component stays untouched. §9 Wave 3. |
| **DC-46** | **fix** | The whole `describe` at `page.test.tsx:1243-1411` is named, plus `:1583-1587` and `:1602-1604`, with `:1384-1410`'s double death stated. §9 Wave 1. |
| **DC-47** | **fix** | The room **chips** move into the `Pieces` head's ledger with their handler — not just a door to creating a room — and `responsive-document-shell.test.tsx:692-750` is named as a rewrite that follows them. §4 H1 table, §9 Wave 1. |
| **DC-48** | **fix** | Same as Dd-25: the band's stop word is deleted and the rung yields. The owner is named per state — the paper owns the name, the rail owns the position, and the loser prints nothing. §4 spine (Y-3), §4 header. |
| **DC-49** | **fix** | Line 1 prints nothing while the letterhead is in frame. And the two-sticky-element ambiguity is gone: `job-ticket.tsx` is deleted, `lens-band.tsx` is the only sticky element and the only publisher. §4 header, §9(b). |
| **DC-50** | **fix** | 189.31, from the file §6 names. §6. |
| **DC-51** | **fix** | The reserve goes on the schedule's **content block**. `schedule-rule.tsx:548`'s glance stays `pointer-events-none sticky top-0 z-[3] h-0`, exactly as `:541-545` describes it. §4 H5, §9 Wave 1. |
| **DC-52** | **fix** | The ladder ends at y 804 inside `pb-24`; SC4 = 83.9%, longest empty run 96px. §6 SC4. |
| **DC-53** | **fix** | No ink percentage is claimed at 1280. What is claimed is six `min-h-11` ticks, zero text labels and zero mid-word breaks — SP-11's own test. §6 SC4 at 1280. |
| **DC-54** | **fix** | Same as DC-49. `job-ticket.tsx` is deleted; `lens-band.tsx` carries the sentinel, the sticky, the measure and the publish. SP-04's single writer is literal. §9(b). |
| **DC-55** | **fix** | SC11 is delivered rather than restated: the running index's resolver is the sole assigner of `full`, and mounting a body is a separate attribute that is not a density. Exactly one, never zero. §4 density, §6 SC11. |
| **DC-56** | **fix** | The measured numbers are **1,109** and **143**, and the replacement asserts DOM **order**, not first-child, in `page.test.tsx` where the harness is — because `page.tsx:1959-1963` puts a JSX comment before the mount. §7 F36, §9 Wave 1. |
| **DC-57** | **fix** | `browserslist` is added to `apps/designer-portal/package.json` in Wave 1. One line, in a file list. §7 F35, §9 Wave 1. |
| **DC-58** | **fix** | The NG2 proof is SC8's computed-style sweep over the mockup, not `shadow-gate.test.ts`'s source grep. The gate is still shown green, as a gate, not as the proof. §6 SC8, §8 NG2. |
| **DC-59** | **fix** | What `doc-lens` switches is stated at four named sites, including the grid-template fork and `shelf-panel.tsx:145`. §9 preamble. |
| **DC-60** | **fix** | `stage2-approval-cutover-contract.test.ts:50-58` and `:60-63` are named: all three files keep `classifyMarginItems` and `MarginDecisionClassificationNotice`, and `margin-rail.tsx` keeps `legacyCoordinationDrafts(coordItems ?? [])`. §9 Wave 1. |
| **DC-61** | **fix** | `<FolioLetterhead projectId={row.project_id} />` at `page.tsx:1871` stays exactly where it is; only `LetterheadInstruments` leaves. §4 mount-order consequence, §9 Wave 1. |
| **DC-62** | **fix** | Named, twice: `Client approvals` and `Schedule dates` open on arrival, it is a visible first-screen change, and it is what makes SC1 true. §4 density, §9(a). |

## C-practitioner — Dp · 25 defects: **23 fixed · 1 narrowed · 1 dropped**

| id | verdict | answer |
|---|---|---|
| **Dp-23** | **accept-and-narrow** | Real: today's block prints two exceptions with two acts at s0; the band prints one. What narrowed: the band no longer claims to replace the block. It carries the worst one with its act at **every** offset — which today's block does at s0 only — and `· +3 MORE` opens the standing sheet, which prints every one of them with its own act, including the third today's block drops whole (F50). What it no longer claims: that one line does the block's job. §4 header line 2, §3 Y-10. |
| **Dp-24** | **fix** | `· +3 MORE` is a scored act with a destination. §3 Y-10. |
| **Dp-25** | **fix** | Line 2 keeps the exception at the foot. The closing count moves to line 1's right-flush slot, which the deleted stop word vacated. §4 header, §5 `reading`. |
| **Dp-26** | **fix** | Three copies become one, and the third — the paper's own `<h2>` — is the one that survives. §4 spine (Y-3), §4 header. |
| **Dp-27** | **fix** | A quiet region withholds the exception the band's line 2 is currently naming, and prints it again the moment the band moves on. §4 density. |
| **Dp-28** | **fix** | The truncation rule is stated before the band ships: the act's words first, then the subject's qualifiers, **never** the number, the day-count or the room. At 390 line 1 sheds the phase count and the install date, and line 2 is allowed two lines. §4 header, §4 "390", §10 R2. |
| **Dp-29** | **fix** | Six rungs, all of them the paper's own head words on regions that mount. `Authorizations`, `The accounts`, `Colophon`, `The work`, `The letterhead` and `The call sheet` are all gone. SC4 now ships beside a words-in-the-rail count, 18 → 7. §4 spine, §6 SC4. |
| **Dp-30** | **fix** | The 120px ceiling is deleted. Rung height is `max(44px, contentHeight ÷ stops)`, so five stops give 139px and the ladder fills the rail on every spread — pre-work measures the same 83.9%. §4 spine, §6 SC4. |
| **Dp-31** | **fix** | The margin goes to **272px**; `page.tsx:1764` becomes `[160px_minmax(0,1fr)_272px]`. The paper column stays 1008px. §4 margin carries the ledger: +40px of width and ~160px of height, against ~80px for the shelf. §4 spine, §4 margin. |
| **Dp-32** | **fix** | The travelling rule is deleted. Each item prints its own anchor line, so the empty-anchor case prints `ABOUT THE WHOLE JOB` rather than a rule pointing at nothing. §4 margin. |
| **Dp-33** | **fix** | Wave 2a ships six rungs, four with existing roots and two whose roots it creates in named files. No rung ships without a root. §4 spine, §9 Wave 2a, §10 R7. |
| **Dp-34** | **fix** | F02, F25 and F57 are struck from §7 with the refutation quoted, and Wave 4 loses the `shelf-panel.tsx:136` line item — which drops that wave from a `week` to `days`. F61's death is used, not ignored: `content-visibility: auto` is adopted. §7 preamble, §9 Wave 2a, §9 Wave 4, §11.6. |
| **Dp-35** | **fix** | The seven-mark arc moves to the letterhead's `HouseholdChip` line at `sm`. v1's claim that it "stays where it already is" was wrong: `doc-letterhead.tsx:53-55` is a single `lg` `StrataMark state="active"`, and the arc lives at `doc-spine.tsx:64-120`, which this proposal unmounts. §4 spine tenant table, §9 Wave 1. |
| **Dp-36** | **fix** | The vitals' 390 home is named: the Sections sheet's head, with the phase count and the install date. §4 "390". |
| **Dp-37** | **fix** | `studio-drawer.tsx` is in Wave 1's file list. §9 Wave 1. |
| **Dp-38** | **fix** | One door per line, five lines, and `CALL SHEET (4)` so the count cannot read as a door. §4 margin. |
| **Dp-39** | **fix** | The `The letterhead` rung is dropped. `to the top` exists once, as the household name. §4 spine, §3 Y-9. |
| **Dp-40** | **fix** | Refuse #6, with its compensation and its browser risk. §11.6, §10 R4. |
| **Dp-41** | **fix** | Every region reserves its full estimated height from first paint and mounting is one-way, so the scroll extent never shrinks under her and never changes above her. The scrollbar is a true measure at every offset. §4 density, §5 `condensed`, §10 R1. |
| **Dp-42** | **fix** | The refusal is withdrawn. F61 is killed — `globals.css:322-325` shows `.has-wash { position: relative; isolation: isolate }` — so containment changes no stacking, and `content-visibility: auto` with `contain-intrinsic-size` is adopted as the render-cost control. §7 F53, §7 F61 absent, §9 Wave 3, §10 R4. |
| **Dp-43** | **drop-with-reason** | Same as Dd-45. The tree carries `mb-1.5` at both cited sites — `ffe-section.tsx:1213` is `mb-1.5 mt-5`, `:1302` is `mb-1.5` — so Y's 6px is the shipped value and X's 12px is the drift. §4 names both sites at 6px. |
| **Dp-44** | **fix** | The resume landing carries the band's line 2 **and** its `+3 MORE` count with a door, so the first frame after ten days away shows one exception and a press to all of them. §5 `at rest`. |
| **Dp-45** | **fix** | The carrier window is a date. It ranks into the standing set on that date. §4 header line 2, §7 F23. |
| **Dp-46** | **fix** | The receiving organ's load is counted. The margin gains 40px of width and ~160px of height and gives up ~80px to the shelf; §4 margin prints the ledger. §4 spine, §4 margin. |
| **Dp-47** | **fix** | `letterhead-vitals.tsx`'s empty-field suppression is in Wave 1, so the row prints nothing when it has nothing rather than a row of dashes. §9 Wave 1. |

## C-access — Dc · 16 defects: **15 fixed · 1 dropped**

| id | verdict | answer |
|---|---|---|
| **Dc-02** | **fix** | Line 1 prints nothing while the letterhead is in frame; the band stays 56px. §4 header line 1, §5 `at rest`. |
| **Dc-04** | **fix** | At the foot, line 1's right-flush prints `0 OF 6 CLOSED OUT` — the count, never the region's name — and line 2 keeps the exception. §4 header. |
| **Dc-05** | **fix** | The right-flush stop word is deleted outright, so no yielding rule is needed for it; Y-3 gives the *rail* the yield instead. §4 header, §3 Y-3. |
| **Dc-07** | **fix** | A margin item anchored to the fact the band is currently naming withholds the figure and prints its anchor line and kind only. §4 margin item 6. |
| **Dc-08** | **fix** | Every animated row in §3 names the existing reduce block it sits beside, by number: #1, #2, #4, #7, #9 and the no-preference gate at `globals.css:429-437`. §3, §9 Wave 3. |
| **Dc-10** | **fix** | `scroll-margin-top: calc(var(--doc-seam-height, 0px) + 1rem)` on **every** focusable element inside `[data-document-paper]`, not two named classes. §9(b), §6 SC13. |
| **Dc-11** | **fix** | `scroll-padding-bottom: 60px` on the scrolling root, against the drawer's fixed footprint. §9(b), §6 SC13. |
| **Dc-12** | **fix** | The focus ring is stated and its contrast measured: `--color-clay-ink` `#7C5E30` at **4.70:1 on rail stock and 5.75:1 on paper**, both clear of the 3:1 non-text floor. The shipped `--color-clay` `#C4A57B` measures **1.82:1 and 2.23:1** and does not, which is why the ring steps. No new pigment — `-ink` companions are in NG4's own list. §6 SC13, §8 NG4. |
| **Dc-15** | **fix** | Stated rather than left unraised: no in-product motion toggle, the OS query is the control, and the reason is that a settings surface is a different question. Refuse #8. §4 motion grammar, §11.8. |
| **Dc-17** | **fix** | The band's background is `--doc-paper` `#FCFAF6`, fully opaque, so the composite contrast is the declared contrast. §4 header. |
| **Dc-18** | **fix** | Every ladder row in the mobile Sections sheet is `min-h-11`. §4 "390", §9 Wave 2a. |
| **Dc-19** | **fix** | `mobile-margin-chips.tsx:98` and `:114` go from `py-[0.32rem]` to `py-1.5`, clearing 24px. §4 "390", §9 Wave 4. |
| **Dc-20** | **fix** | A quiet region's head carries a visually-hidden line — `36 lines · not yet on the paper · press Pieces on the index to open` — so SP-02's four readings have a programmatic form, not only a visual one. §4 motion grammar (announcement), §9 Wave 3. |
| **Dc-21** | **fix** | One announcement per distinct reading stop; a return to a stop already announced within 2s is silent. §4 motion grammar. |
| **Dc-24** | **drop-with-reason** | The claim is that the rail's new contents make "a longer detour before the reader reaches the paper's first act." Measured, they make it shorter: `12-layout-measurements.json` `rich.1440.s0.spine.interactiveCount` is **8** today, and v2's rail has **7** (`Put down` plus six rungs). The DOM order the defect asks for is stated anyway — `DocSpine` at `page.tsx:1776`, `<main>` at `:1789` — with the 8 → 7 count. §4 spine mount-order, §6 SC13. |
| **Dc-26** | **fix** | Wave 3 lists one new `@media (prefers-reduced-motion: reduce)` block beside block #2 at `globals.css:439-458`, covering Y-1's spans and Y-3's yield. Y-4 has no transition to reduce; Y-5, Y-6, Y-7, Y-9 and Y-10 are covered by existing blocks, named in §3. §9 Wave 3. |
