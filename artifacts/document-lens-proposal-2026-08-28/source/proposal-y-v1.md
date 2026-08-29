# Proposal Y — The paper is the lens

*The Document · The Smart Lens · 2026-08-28. Author Y. Evidence of record: `research/31-verified-findings.md`. Floor: `source/shared-planks.md`, SP-01 through SP-14, adopted identically.*

---

## 1. Thesis

The document wears no instrument. It focuses itself.

One band under the letterhead never changes size — it changes what it **says**: the next act at the top, the worst thing standing below the fold, the closing at the foot. Nothing collapses, so nothing jumps (today: 347.25px → 64.06px in one commit, the first head leaping −283.19px, F04). Regions arrive full and release two screens away, off frame. The rail becomes a ladder of the paper, on all seven spreads.

> **The falsifiable sentence.** The pinned band's measured height is one number per width — 56px at 1440 and 1280, 64px at 390 — and it reads that same number at scrollY 0, 400 and 1200 on every spread.

---

## 2. What stays identical

**The R126 register, entire, and it is not touched anywhere in this proposal.** 40px Playfair letterhead (`doc-letterhead.tsx:59`), 24px Playfair region heads (`region/region-head.tsx:128-134`), the five-step scale 40/24/18/15/14, the 11px mono floor, the three rule weights `--rule-hair` / `--rule-mid` / `--rule-strong` (`globals.css:130-132`), paper `#FCFAF6`, rail stock `#E8E3DB`, desk `#FAF7F2`, charcoal `#2C2926`, the four `-ink` companions, the muted ramp `#4E4339` / `#5A4E43` / `#65594E`. **No new pigment, no new type size, no new rule weight is introduced by any mechanic below.**

**Untouched organs and objects:**

- **The letterhead.** Same `<header id="document-project-status">`, same StrataMark `lg`, same 40px title, same `HouseholdChip`, same `doc-rule-mid` closing rule (`doc-letterhead.tsx:52-67`). Two client acts join the chip's line; nothing else about it moves.
- **The filled stamps** — ~1.18:1 tint, 1.5px pigment border, charcoal word, −1.5°. `IN PRODUCTION` and `RECEIVED` on the Chen lines print exactly as they print today.
- **The six stage tab plates**, `--tab-brief #497093` … `--tab-install #823832`, white label.
- **The ink-pool hover wash** — clip-path circle from the pointer, 260ms in / 200ms out, `--ease-editorial`, flat `-still` tint under reduced motion (`globals.css:327-349`). Its two consumers stay its two consumers (`desk-roster.tsx`, `ffe-section.tsx`); nothing in this proposal puts a wash on the band, the ladder or a region head.
- **48px product crops** on catalog-linked lines.
- **THE STUDIO desk block.** Not in this tree; not read, not touched.
- **Scored Ink.** Every new act below is a bare mono word with a scored underline (`globals.css:833-878`). No plate, no chip-as-button.
- **`Put down`.** Unchanged, top-left of the rail, same word, same position, same size at every state — the one control F126 recorded as a bright spot rather than a defect. It is the only rail tenant this proposal leaves exactly where it found it.
- **`deriveTicket()`** — `lib/document/ticket-derivation.ts:780-793`. All eight rows keep being derived, in order, with their doors. `ticket-derivation.test.ts` stays green untouched. What changes is that nothing renders them as a table.
- **The ⌘K palette, the Esc chain, the Studio Drawer, the ledger sheets, the room lens.** Not in scope.
- **The `--elevation-sheet` token and its three sites.** `studio-drawer.tsx:289`, `margin-item.tsx:46`, `overlays/doc-sheet.tsx:371`. Unchanged, uncontested, unextended.

**What was tempting and is deliberately not restyled.** The region rule. A 6px double rule opening every region is the loudest mark on the paper, and with regions arriving and releasing it was tempting to give the released state a lighter rule so the page would read calmer in a still. It stays `doc-rule-strong` at every density (`region/region-rule.tsx:17-36`, pinned to the pixel by `region-rule.test.tsx:59-74`), because a region that is quiet is not a region that is lesser, and the moment the rule weight starts carrying state the register has three rule weights doing four jobs.

---

## 3. Lens mechanics table

Ten mechanics. Every reduced-motion cell is a form a designer sees, never an absence.

| # | Trigger | What changes | From → to | Duration & easing | Reduced-motion equivalent | What never moves | F-ids |
|---|---|---|---|---|---|---|---|
| **Y-1 · The sentence turns** | The reading stop commits (settle, not in flight) | The band's line 2 text and its ink kind | Outgoing line opacity `1 → 0`; incoming `0 → 1`; band height `56px → 56px`; no vertical travel | out 90ms, in 150ms, `--ease-editorial` | The new sentence is **printed instantly** in place — same words, same ink, no crossfade. `motion-reduce:transition-none` on the two text spans | The band's height (56px), its box in flow, every word above the reading line, the paper's scroll offset | F01, F04, F11, F13, F50, F60, F113 |
| **Y-2 · The ladder segment travels** | The reading stop commits | The clay segment's `top` and `height` on the ladder's hair rule | `top: 236px, height: 62px → top: 298px, height: 62px` (one rung) | 200ms `ease-out` — the existing transition at `spine-running-index.tsx:79` | The segment **jumps** to the new rung in one frame; the rung's name is `font-semibold` either way, so position is legible with no transit (`motion-reduce:transition-none`, already present) | The ladder's rungs, their names, their y-positions, the rail's width | F12, F22, F84, F102, F116 |
| **Y-3 · A region prepares** | Its root's top comes within 240px of the frame's bottom edge — **off screen, always** | Density attribute on the region root; the body mounts at full ratified ink | `data-density="quiet" → "full"`; region height `head+count (≈118px) → its real height` | 240ms `--ease-editorial` on the body's opacity only; height is a step, taken below the frame | The body is **present at full ink on the first frame** — no fade. The count line is replaced by the body, printed | Anything inside the frame. The transition is refused while any part of the region root intersects the viewport | F11, F53, F64, F39 |
| **Y-4 · A region releases** | Its root's bottom passes 96px above the frame top, or its top passes 480px below the frame bottom | Density attribute; the body unmounts; the head's count line prints; a same-frame `scrollBy` takes back the exact height delta | `data-density="full" → "quiet"`; height `real → head+count (≈118px)`; scroll offset corrected by `−Δ` in the same layout pass | Height is a step, not a tween. Count line prints instantly | The count line **is the form** — `36 lines · 4 rooms · 1 damaged` at full ink. Identical in both registers | The reading line's y — measured before and after, must be equal to the pixel. Focus. Any region intersecting the viewport | F04, F08, F41, F53, F60, F113 |
| **Y-5 · The margin's rule slides** | The reading stop commits | The `IN FRAME` hair rule's `top` within the margin column | `top: 214px → top: 366px` (to just above the first item anchored to the new stop) | 220ms `--ease-editorial` | The rule **is at its new y on the next paint**, carrying the same mono word `IN FRAME`. Nothing fades | Every margin item. Items never reorder — only the rule moves | F17, F19, F58, F66 |
| **Y-6 · She folds a region** | She presses `Fold ↑` on the head, or the seam's press to unfold | Body unmounts / mounts; the seam prints; focus is placed | `folded false → true`; seam rule `--rule-strong → --rule-mid`; seam gains the printed words `CLOSED BY YOU` | 300ms `--ease-editorial`, `fold-in` + `fold-arrow-flip` — the existing pair (`globals.css:404-437`) | The seam paints visible on the first frame with `animation-fill-mode: both`; the arrow prints already-flipped. This is the shipped behaviour (`fold-seam.tsx:19-25`) and stays | The region's outer gap — `--doc-region-gap` is the same folded, quiet or full (SP-01). Focus lands on the `FoldSeam` button, never `<body>` | F08, F41, F54, F59, F89, F93 |
| **Y-7 · The pen goes down** | Focus enters an editable control on a line | That line's left rule turns clay; the line holds the wash's flat `-still` tint; every region's density freezes | Line rule `--rule-hair rgba(44,41,38,.10) → 1.5px var(--color-clay)`; line ground `transparent → rgba(196,165,123,0.12)` | 150ms `--duration-fast` `--ease-editorial` | Both the clay rule and the flat tint are **present, static** — this is exactly the R126 reduced-motion wash contract (`globals.css:439-458`) | Every sibling line. Nothing dims. No region changes density while the pen is down | F53, F61, F117, F164 |
| **Y-8 · The breath** | The document is open, the mark is active | Opacity of the letterhead's StrataMark, and nothing else in the system | `opacity 1 → .62 → 1` | 3s `ease-in-out infinite` — `doc-breath`, unchanged (`globals.css:271-283`) | `animation: none`; the mark prints at full opacity in its active fill — the existing reduce block at `globals.css:283-288` | Everything. It is one 120px mark at the top of the paper and it is the only ambient move in the system | F31, F55, F96, F140 |
| **Y-9 · A rung is pressed** | She presses a ladder rung, or a band act with a destination | Scroll position, then focus | `scrollY 0 → 1666px` via `scrollIntoView({block:'start'})`; the stop forced to `full` for the 700ms jump lock | `behavior:'smooth'`, browser-owned; lock 700ms (`use-document-running-index.ts:35`) | `behavior:'auto'` — the existing branch at `use-document-running-index.ts:212-215`. She lands in one frame; the landing offset is identical | The landing offset. `--doc-seam-height` is a constant, so `scroll-margin-top` resolves once and correctly at any fling speed | F34, F38, F45, F120, F14, F46 |
| **Y-10 · Back to the top** | She presses the household name on the band's line 1 | Scroll position, then focus | `scrollY 2397px → 0`; focus to `#document-project-status` | `behavior:'smooth'`, 700ms lock | `behavior:'auto'`; the name carries its scored underline in both registers, so the act is legible from a still | The band. It is pinned at the top and is the same 56px band when she arrives | F13, F56, F77, F92, F116 |

---

## 4. Organ by organ

### The spine — from furniture to a ladder

**Before.** 200px at ≥1440. `Put down` (`doc-spine.tsx:46-55`) · seven StrataMark marks in a **horizontal** row inside a vertical column (`:64-120`) · the active label pair (`:122-136`) · the running index, four rows, project spreads only (`:141`, `spine-running-index.tsx`) · the timer card (`:145-146`, `spine-timer.tsx:91`) · the presence line (`:150-154`). Measured: **54.9% ink** on the rich spread, **13.9%** on pre-work, longest empty run **270px** and **657px**; ink identical at s0, s1, s2 and s3 (F84) — nothing in the rail has ever changed as she moves. Eight interactive children at 1440 drop to three at 1280 (F21).

**After.** 160px at ≥1440, and one thing in it: a ladder of the paper.

- `Put down`, unchanged, at the top.
- `ON THIS PAPER`, unchanged, 11px mono.
- **One rung per stop on the paper, in paper order, on every one of the seven spreads.** On the Vandersteen project spread the twelve stops are the paper's own head words: `Client approvals` · `Schedule` · `The work` · `Pieces` · `Money` · `Authorizations` · `The accounts` · `Closing the book` · `The call sheet` · `The record` · plus `The letterhead` at the head and `Colophon` at the foot. On the Byrne proposal spread the seven stops are `The letterhead` · `The proposal` · `Scope & engagement` · `Design vision` · `The investment` · `The record` · `Colophon`.
- **The rungs divide the rail.** Rung height is `clamp(44px, (railHeight − 156px) / stops, 120px)`. Twelve stops → 62px; seven stops → 107px. Below 44px the rail scrolls, which it already does (`doc-spine.tsx:44`, `min-[1180px]:overflow-y-auto`). The ladder therefore fills the rail on every spread, and a thin document does not print a thin rail.
- **The rungs carry names and position. They carry no values.** Today the rail prints `Money` / `$6,200 OWED` beside a paper that prints the same money in four other places (F10), and a fallback string prints identically to a live one (F108: `Money unread` and `$6,200 OWED` at the same size, weight and row). A ladder that prints no numbers cannot lie about one.
- **The reading line is the same 2px clay segment it is today** (`spine-running-index.tsx:76-82`), now riding a printed `--rule-hair` ladder rule instead of floating in space.

**Applying the 2026-08-14 test — earns the left edge only if true across the whole document at once, or true outside it:**

| Tenant | Verdict | The sentence that decides it |
|---|---|---|
| `Put down` | **In** | True outside this document. It is the exit. |
| The seven-mark arc | **Out** | True across the whole *engagement*, not this paper — and a horizontal row inside a vertical column teaches the wrong axis (F55: every phase gets 22px whether it shelves four regions or zero). It stays where it already is, at 120px in the letterhead (`doc-letterhead.tsx:53-55`), and below the fold it is a counted phrase on the band: `PROCUREMENT & ORDERS 4 OF 6`. |
| The active label pair | **Out** | It reprints the page's own `<h2>` verbatim at half the size (F102). The ladder's bolded rung already says it. |
| The running index | **In, rebuilt** | Position within the whole document is the one thing the paper cannot show her while she is inside one part of it. |
| The timer | **Out** | This minute, not this document — and the drawer 700px below already prints `IN HAND TODAY 1h 09m` while the rail says `18 min` (F82). Two clocks that disagree is worse than one clock. The drawer's survives. |
| The presence line | **Out when it is just her** | `JUST YOU · VISIBLE TO THE STUDIO` is session metadata printed as the rail's last line at all four states (F137, F31). It prints only when somebody else is on the paper, and then it prints their name. |
| `doc-breath` on the active mark | **Moves with the arc** | To the letterhead's mark. Still exactly one ambient move (Y-8). |

**The 40px it gives back.** `200 + 1040 + 232 = 1472 > 1440`, so today the paper column is 1008px and its declared `max-w-[1040px]` is never reached at the width where the three-column grid first appears. At 160: `160 + 1040 + 232 = 1432`. The paper finally measures what it says it measures.

**Mount-order consequence.** In `doc-spine.tsx`, children 2 (the seven-mark `<ul>`, `:64-120`), 3 (the active caption, `:122-136`), 5 (`CompactSpineTimerDoorway`, `:143`) and 6 (`SpineTimer` + presence, `:145-154`) no longer mount. Child 4's wrapper (`:141`, `hidden min-[1440px]:block`) loses its 1440 gate and becomes the ladder at both desktop tiers. `spine-timer.tsx` and `spine-shelved-blocks.tsx` **stay on disk** even though they stop mounting from the spine — `contrast.test.ts:313-341` hard-codes those five filenames and deleting one drops it from the scan silently.

### The header — one band, one height, a changing sentence

**Before, measured at 1440/s0.** Letterhead ~211px · the eight-row job ticket 347.25px · the red-letter zone XOR the guide, 80–136px and **two different heights** so whichever renders moves every region below it (F154) · the instruments row 38px. The first `[data-region-head]` lands at **y 1005 in a 900 frame — 111.7%** (F01). One full screen later, at s1, header and summary are still **60.7%** of the frame and the active region is **10.4%** (F11). Twenty independent things in the top band at s0 (F47). At scrollY 280 the whole ticket swaps in one commit — 23 of 23 samples at 64.0625px, no interpolation, first region head −283.19px (F04) — and no instrument in the tree records it (F113).

**After.** The letterhead, then one band.

**The band, 56px at ≥1180, 64px at 390, at every scroll offset.** It is `sticky top-0 z-[4]` in the ticket's exact tree position, behind the ticket's own sentinel (`job-ticket.tsx:347`). Because its height never changes, the box it reserves in flow never changes, and the 283px jump does not exist to be animated.

**Line 1** — 11px mono, `--text-muted`, four standing facts, left to right and right-flush:

```
VANDERSTEEN RESIDENCE · PROCUREMENT & ORDERS 4 OF 6        INSTALL SEP 15 · PIECES
```

The household name is scored ink and pressing it is `to the top` (Y-10). This is the same line at s0, s1, s2 and s3 (SP-09): today no frame at seam, mid or foot contains the client's name at all (F13, blocker).

**Line 2** — 15px, the sentence that changes:

| Where she is | The sentence | Ink |
|---|---|---|
| At the top, nothing standing | `Name the phases for this project` + `OPEN THE SCHEDULE` | charcoal |
| At the top, something standing | `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14` + `SEND REMINDER` | `--color-terracotta-ink` |
| Below the fold, in a region | The worst standing exception, with its act, and `· +2 more` when it withheld any (F50 prints the two and drops the third whole today) | terracotta-ink |
| At the foot | `Closing the book · 0 of 6 closed out` + `OPEN THE ACCOUNTS` | charcoal |

**H2's five things, argued one at a time.** *Title* — in, it is the fact the paper stops printing below the fold (F13). *Stage plate* — in, as the counted phrase, because it is what the evicted seven-mark arc was saying and it is 30 characters. *Worst exception* — in, as the whole of line 2, because gathering exceptions "in one place" is the block a junior's eye correctly snaps to (F127) and today that place exists only at s0. *Install date* — in, right-flush, because it is the fact every other fact on a procurement spread is measured against and it is nine characters. *Money rung* — **out**. Money is already printed five times in one screen with four different numbers (F10); a permanent money rung on the band guarantees a fifth copy. Money reaches the band the same way anything does: by being the worst thing standing. In its place, right-flush, goes **the current stop** — which is M-8's standing rule reduced to one word instead of a second sticky band.

**H4, the one reversing act.** There is nothing folded, so there is nothing to unfold. The band is not a reduction of the header — it is a different organ from the letterhead. Getting the letterhead back is `to the top`: press the household name on line 1. Its state is readable without hover because the name carries a printed scored underline at all times (`globals.css:833-878`).

**H5, zero layout shift, mechanically.** The band's box in flow is 56px before it pins and 56px after. `--doc-seam-height` is published once per width by one writer and does not change with scroll, so the schedule glance's `top: var(--doc-seam-height, 0px)` (`globals.css:1026`) never re-resolves under her (F87), and every `[data-index-region]` `scroll-margin-top` (`globals.css:1034`, `:1037`, `money-region.tsx:48`) is a constant at `scrollIntoView` call time (F34, blocker). The late-arriving blocks that actually dominate CLS — the needs banner and the schedule's no-active-phase line at ~3.3–3.6s, one shift of 0.1189 out of 0.1286 (F79, F24, F118) — render into a reserved 56px on the band and a reserved glance height on the schedule, so the arrival changes words, not geometry.

**H1, the eight ticket rows sorted, with a home at s0 and a home at s2 (SP-10):**

| Row | Bucket | Home at s0 | Home at s2 |
|---|---|---|---|
| `Rooms` | door + fact | The `Pieces` region head's ledger (`ADD A ROOM` already lives there) | Same — the head is on screen at `full`, and quiet it prints `4 rooms` in the count line |
| `Pieces` | door + fact | The ladder's `Pieces` rung | The ladder's `Pieces` rung, bolded, with the clay segment on it |
| `Drawings` | door (leaf `planroom`) | The margin's shelf line, `PLAN ROOM` | The margin's shelf line — the margin is `sticky top-0 h-screen`, so it is on screen at every offset |
| `Spec` | door (leaf `specbook`) | The margin's shelf line, `SPEC BOOK` | Same |
| `Boards` | door (leaf `moodboards`) | The margin's shelf line, `BOARDS` | Same |
| `Money` | door + fact | The ladder's `Money` rung; the fact on the band's line 2 when it is the worst thing standing | Same |
| `Dates` | fact + door | `INSTALL SEP 15` on the band's line 1; the ladder's `Schedule` rung is the door | Same |
| `People` | door (overlay `call-sheet`) | The margin's shelf line, `CALL SHEET · 4` | Same |

Six of the eight doors exist only at s0 today (F09, F05 of the ask's own complaint); after this, **all eight have a destination that is on screen at every scroll state at 1440**, and the four leaf doors move to the one organ that is sticky and full-height at both desktop tiers.

**Mount-order consequence in `page.tsx`.** The `jobTicket` node composed at `:1714-1748` renders a `LensBand` instead of a table; it keeps its position at `:1829` and keeps `#doc-ticket-sentinel` immediately above it, so `page.test.tsx:1360-1379`'s sentinel contract survives as a selector rename. `RedLetterZone` and `DocumentGuide` **stop mounting as page children** — the ternary at `:1838-1847` is deleted and both models are computed for the band instead; that removes two children and, incidentally, shortens the source between `data-active-section` and `<SectionStageLineMount>` rather than lengthening it. `LetterheadInstruments` stops mounting at `:1863-1880`; its two client acts mount inside `doc-letterhead.tsx` on the `HouseholdChip` line and print only when a client is linked, which deletes F136's 44px of `MESSAGE THE CLIENT` / `PREVIEW AS THE CLIENT` on a document whose own letterhead reads `No client linked — attach one ↗`. `MobileMarginChips` stays exactly where it is at `:1884-1889`, so `stage2-approval-cutover-contract.test.ts:15-17`'s ordering assertion survives.

### Region heads and spacing

**Before.** `RegionHead` owns no outer spacing at all (`region/region-head.tsx:118-121`); every gap is the call site's. In use: `mt-6 … py-6` (approvals open), **nothing at all** (approvals folded, `project-approval-document.tsx:565`), `mb-4` (schedule frame), `mt-2` (schedule ledger), `mt-5` on a rule (FF&E), `mb-5` (money), `mt-8` (care), `mt-4/mb-5` (the record). Measured button-to-button the distinct gaps are **{6, 29, 56}px**, scroll-invariant and width-invariant, on a set of seams that reads as one uniform list (F73). Folding approvals silently changes the gap around it as well as its height.

**After.** One token, `--doc-region-gap: 24px`, set on a wrapper `RegionHead` owns, and a region's gap is the same open, quiet or folded (SP-01). Every call-site margin listed in `research/10-code-anatomy.md` §6 is deleted. **The exceptions, with reasons:** the colophon keeps `mt-14` (`doc-colophon.tsx:102`) because it closes the paper rather than separating two regions; the FF&E folio heads keep `mb-1.5` (`ffe-section.tsx:1302`) because that is intra-region rhythm, not an inter-region seam. Nothing else.

**Density, defined precisely (R2).**

Two densities, not three. `full` is the ratified R126 weight with nothing withheld. `quiet` is the head, its status line, its exception strings, its **inked leader act**, and one count line. What drops is the body's rows and the ledger's non-leader acts.

- **Acts do not print at reduced density.** The one inked leader survives at full ink at both densities (C7, `region-head.tsx:156-157`).
- **Exceptions never go quiet.** The rule, so it survives a region we have not built: *a string that names a deadline, a number owed, or a person waiting prints at every density.* An overdue day-count that fades because she scrolled past it is information loss wearing a metaphor.
- **A number never softens.** There is no ink ramp anywhere in this mechanic. `#65594E` measures 5.32:1 on rail stock against a 4.5:1 floor (F74) — one step of headroom and no room for a family, so quieter means **fewer words**, exactly as SP-12 requires.

**The four readings, told apart in a still (SP-02):**

| Reading | The mark that separates it |
|---|---|
| `full` | Head at 24px, `--rule-strong`, body present |
| `quiet` (the lens) | Head at 24px, `--rule-strong`, body absent, **and a count line at full ink**: `36 lines · 4 rooms · 1 damaged` |
| `folded by her` | The `FoldSeam` in place of the head, rule stepped down to `--rule-mid`, and the printed words **`CLOSED BY YOU`** |
| `empty` | Head at 24px, `--rule-strong`, and one italic line in the region's own words with **no count**: `Nothing in this room yet` |

The count line is the whole discipline: a region with a number is quiet, a region with no number is empty, and a designer reads the difference off a PNG. Today `FoldSeam` renders identically whether the fold came from her hand three weeks ago or from a shipped default (F54, F89), and seven regions invent three different vocabularies for the same zero (F156). Two printed forms replace them: **`nothing yet`** for a region that has never had content, **`not known yet`** for a field whose value has not been decided.

**The ≤40-character quiet line, per region, on the specimen:**

| Region | Line | chars |
|---|---|---|
| Client approvals | `2 awaiting the client · 1 overdue 6d` | 36 |
| Schedule | `Install Tue Sep 15 · 3 weeks out` | 32 |
| The work | `4 tasks · 1 past due` | 20 |
| Pieces | `36 lines · 4 rooms · 1 damaged` | 30 |
| Money | `$17,500 out · $12,300 not drawn` | 31 |
| Authorizations | `Nothing released yet` | 20 |
| The accounts | `$184,500 approved · 20% margin` | 30 |
| Closing the book | `0 of 6 closed out` | 17 |
| The call sheet | `4 on the job` | 12 |
| The record | `12 complete` | 11 |

**The collision (R3).** Folded-by-her outranks the lens, always and everywhere. A region she folded stays folded in the state the lens would otherwise have brought to `full`, and prints the same seam it printed before (SP-07). Scroll never writes `patina:doc-fold:{docId}:{region}`. Coming back to a document she folded three weeks ago, she reads `CLOSED BY YOU` in the seam and the summary beside it is live data — the state is hers, and she can see that it is.

### The margin — the same 232px, different contents at different depths

**Before.** 232px sticky column at ≥1440, a fixed 360px overlay sheet at 1180–1439. Into it: a nine-line first-touch note (~230px, F28), file-change notes, the `In the margin` head with `+ Decision` / `+ Note`, a Drafts fold, seven chips of two kinds only — Money and Time, never a PO or a damage (F66) — a note composer, handoffs. Measured: **the same seven chips in the same order at top, seam, mid and foot** (F17). Scrolled 2,000px into `Pieces`, nothing beside her is about pieces. At 1280 the sheet prints `IN THE MARGIN` twice, 200px apart (F18), and the closed tab prints no count so an empty margin and a seven-item margin look the same (F19).

**After.** The column stays 232px. What it holds changes with depth — it is the one organ that *gains* as the lens focuses.

1. **The shelf line, at the head, at every state:** `PLAN ROOM · SPEC BOOK · BOARDS · CALL SHEET · 4 · SHARING · MILESTONES` — scored mono words, the four evicted leaf doors and the two evicted instruments. Present at s0, s1, s2, s3 at 1440; in the sheet at 1280; in the Sections sheet at 390.
2. **The first-touch note**, capped at two lines, still once-per-person, still receding on first use (`margin-note.tsx:9-11`).
3. `IN THE MARGIN` and the capture acts — **one heading, once** (F18).
4. **The items, in paper order, never reordered.** Anchored items sit at their anchor's rank; unanchored items sit at the foot under a printed `ABOUT THE WHOLE JOB` rule — the home for a document-wide decision that a gutter pin does not have.
5. **One `--rule-hair` carrying the mono word `IN FRAME` slides** to sit above the first item anchored to the stop she is in (Y-5). Nothing else in the column moves. F17 asked the margin to change as she moves; this changes it by moving one rule instead of eight cards.
6. At 1280 the tab prints `MARGIN · 7`, and `MARGIN` with no number when there is nothing in it (F19).

**Mount-order consequence.** `MarginRail` keeps its position at `page.tsx:2316-2334`. Inside `margin-rail.tsx`, a shelf line mounts above the first-touch note at `:462`; the `IN THE MARGIN` header row at `:488-513` loses its duplicate in the sheet header at `:264`; `renderItem` at `:634` gains a rank and the `IN FRAME` rule is one absolutely-positioned span in the same idiom as the ladder's segment.

### The motion grammar

Nine moves total in the document's reading shell after this proposal, and every one is in §3's table. Y-1 through Y-7 and Y-9, Y-10 are triggered; Y-8 is the one ambient move.

**What may animate on a condense (M2 in the brief's terms).** Opacity and reserved height, and nothing else. **No layout property animates, ever.** The band's height is a constant so there is no header layout to animate. A region's height is a step, taken entirely outside the frame. The margin's rule moves by `top` inside a column whose contents are fixed.

**Hysteresis, two numbers (M3).** A region comes to `full` when its root's top is within **240px** of the frame's bottom edge. It releases when its root's top is **480px** below the frame's bottom edge, or its bottom is **96px** above the frame's top. The band between the downward pair is **240px**. That number and not a smaller one: on the specimen one FF&E line is a 48px catalog crop plus `py-2` and a rule = 65px, and one room folio runs 325–910px; 240px is more than three lines, so a three-line nudge cannot cross both thresholds, and at the mockup's `--motion-scale: 4` a slow reading parked on a boundary has no boundary to sit on — **because both thresholds are off screen**. The strongest form of the rule: *the lens never changes anything that is inside the frame.* That is what makes the 4x prober find nothing to oscillate.

**Momentum and reverse-scroll, ruled separately.** Downward: the enter threshold sits 240px ahead of her eye, so a region is at `full` before she reaches it — a fling arrives at a finished page. Upward: a region she is returning to is still at `full`, because it never released while it was on screen; the only upward transition is a far-above region releasing, and that one is accompanied by the same-frame scroll correction. Two different rules for two different directions, which is what asymmetry means.

**Damping.** No velocity threshold, no dwell — the two magic numbers `M-10` warns about. Programmatic scrolls are damped by the **700ms jump lock that already exists** and measured clean across four index clicks with zero flicker (F45, probe §2). Free scrolls are damped by one rule: the observer commits only when two consecutive rAF frames agree. Testability: `window.__lensSettled()` returns a promise resolving at the next commit, and `settle()` forces one synchronously.

**Announcement (SP-14).** Exactly one thing announces: the band's line 2, on settle, in one `aria-live="polite"` region — the only live region in the document. Density changes never announce, because they happen off screen and change nothing on screen. Today three `aria-current` transitions fire across one scripted scroll with no live region at all (F105) and the 283px collapse is silent for every reader not already inside the ticket (F42).

**The ambient budget.** One. `doc-breath` moves from the rail's active mark to the letterhead's mark and keeps its 3s `ease-in-out infinite` and its reduce block (`globals.css:271-288`). It is present at arrival and gone below the fold — strictly less ambient exposure than today, not more.

### The 1180–1439 tier

**Before.** 56px of rail with `px-1.5` leaving a ~44px content box, and it prints `PUT` / `DOWN` wrapped, seven unlabelled marks, `Project` / `ACTIV` / `E` — a status word broken mid-syllable — then `In hand` / `21m` (F07, 0.95). No running index, no region names, no values; eight interactive children at 1440 become three (F21). The 390px sheet prints full words for all seven stages, so the phone is more legible than the "compact" desktop (F32). The margin is off-canvas until she presses a tab that prints no count (F19, F135).

**After.** The rail prints no words at all, and therefore breaks none.

- `Put down` becomes its glyph with a `title`-free `aria-label`, no wrapped word.
- The ladder becomes a **text-free position line**: one `--rule-hair` down the rail, one 12px tick per stop, the clay 2px segment on the stop she is in. Every tick is a `min-h-11` press target (2.5.8 at 44px).
- **Pressing any tick opens the Sections sheet** the mobile spine already builds (`mobile/mobile-sheets.tsx:441+`), which prints every rung with its full name. A press, never a hover — the labels are one act away at this tier and zero acts away at 1440.
- The margin tab prints `MARGIN · 7`.

**This refuses F15 and F21's own suggested fix**, which is to keep four index labels as text at 1280. At a 44px content box, 11px mono text breaks mid-word — that is measured, not predicted (F07). Widening the rail to 96–120px is **weeks** by E1 §4(a): `quiet-responsive-shell.spec.ts:224-228` pins 55–57px, `quiet-release-contracts.spec.ts:108-118` pins the same by `boundingBox()` with bounds `[0,56]`, and it moves the paper's x-origin at 1280, the widest blast radius in the review. The text-free line is **days** by E1 §4(b). SP-11 asks for words or no words; this tier gets no words, and the words are one press away.

### 390

The same lens in one column, and the state that proves it.

**Before.** First region head at y 1054 against an 844 frame — **124.9%** (F40). The ticket already rests as the seam at this width (F131), so the pin motion never happens here at all. The Sections sheet lists only the seven stages — `Client approvals`, `Schedule`, `Pieces` and `Money` appear nowhere, and reaching Pieces means scrolling ~1,050px of an 844 frame (F14, blocker). Five money chips stack for ~250px = 29.6% of the frame, none anchored to anything in view (F48). The first FF&E line begins at ~690px of 844 (F49). Three of four sheet kinds render `role="dialog" aria-modal="true"` with `aria-label={undefined}` (F43).

**After.**

- **The band is 64px, two lines, and carries the same strings as 1440** — the same household name, the same counted phase, the same install date, the same sentence. Not a shortened copy; the identical text, wrapped to two lines and measured (SP-04: the height is measured, never hard-coded, because at 390 a two-exception line wraps again, F44).
- The letterhead's vitals and the client acts collapse into the band by default at this width (F40's own fix).
- **The Sections sheet prints the whole ladder** — every stop, the same names as 1440, under the stage list (F14 answered).
- **Only chips anchored to the stop in frame print inline**; the rest live in the sheet under the same `ABOUT THE WHOLE JOB` rule, same words as the desktop margin (F48).
- The region head's ledger collapses to the one inked leader plus the always-visible overflow glyph (F49; `region/__tests__/row-overflow.test.tsx:31-44` already requires that glyph to render collapsed and unmount its verbs — no change to that contract).
- Every sheet kind gets a real `aria-label` — `Sections`, `Margin item`, `Studio actions` — not only `timer` (F43, `mobile-sheets.tsx:260`).

**Mount-order consequence.** None in `page.tsx`. `mobile-sheets.tsx`'s spine sheet gains the ladder list below its existing sections list; `mobile-margin-chips.tsx` gains an anchor filter; `mobile-bar.tsx` is untouched.

---

## 5. The lens state machine

Five states. Every transition carries its reverse and its focus destination (SP-06); no row reads "—".

### `at rest` — s0, the paper as it opens

| | |
|---|---|
| **Lens line** | Letterhead full above it; band in flow, not pinned. Line 1 `VANDERSTEEN RESIDENCE · PROCUREMENT & ORDERS 4 OF 6 … INSTALL SEP 15 · CLIENT APPROVALS`. Line 2 the worst standing exception, or the guide sentence when nothing stands. |
| **Rail** | 160px. `Put down`, `ON THIS PAPER`, twelve rungs at 62px, clay segment on rung 1. |
| **Region density** | The first stop `full`; every stop below it `quiet` at its own reserved height. |
| **Margin** | Shelf line, first-touch note (two lines), `IN THE MARGIN`, items in paper order, `IN FRAME` rule above the first anchored to `Client approvals`. |
| **Entry trigger** | Page load with `scrollY === 0`; or `to the top` (Y-10); or the resume landing declining to move her (`page.tsx:1166-1174`). |
| **Exit trigger** | Any scroll past `#doc-ticket-sentinel`. |
| **Reverse** | `to the top`, one act, the household name on the band's line 1. Focus lands on `#document-project-status`. |

**The returning designer.** Today a reader in her recent list is dropped at `[data-active-section]` (`page.tsx:1169-1172`), so after ten days away the first frame can carry `THE JOB · PROJECT` with `Chen Residence` already scrolled off (F56). Under this proposal she is still dropped there — and the band's line 1 names the household in that frame, so the drop is no longer disorienting. `at rest` is where a **first-time** visitor lands; `reading` is where a returning one does.

### `reading` — s1 through s3, the working state

| | |
|---|---|
| **Lens line** | Band pinned at `top: 0`, 56px, `--rule-mid` on its lower edge. Line 1 unchanged except the right-flush stop word. Line 2 = the worst standing exception with its act, terracotta-ink; at the foot, the closing statement, charcoal. |
| **Rail** | Unchanged. Clay segment travels (Y-2). |
| **Region density** | Exactly one stop `full` — the one the band names. Every other stop `quiet`. |
| **Margin** | `IN FRAME` rule slides (Y-5). Items do not move. |
| **Entry trigger** | The sentinel leaves the viewport. |
| **Exit trigger** | The sentinel re-enters, or `to the top`. |
| **Reverse** | Scrolling back up re-enters `at rest` at the same offset the exit happened; nothing was unmounted at the exit, so nothing has to be restored. Focus: unchanged in both directions — the band's text nodes change, no element unmounts. |

**Transitions inside `reading`:**

| Transition | Trigger | Reverse | Focus destination |
|---|---|---|---|
| stop `n` → stop `n+1` | The observer commits on two agreeing frames | stop `n+1` → stop `n`, same rule | Unchanged; nothing unmounts on screen |
| region `quiet` → `full` (Y-3) | Root's top within 240px below the frame | region `full` → `quiet` at 480px below (Y-4) | Unchanged — the region is off screen and holds no focus |
| region `full` → `quiet` (Y-4) | Root's bottom 96px above the frame top | `quiet` → `full` when it re-enters the 240px band | Unchanged; **refused outright while focus is inside the region**, so the caret pins a region open |
| ladder rung pressed (Y-9) | Press | The rung for the stop she left is still on the ladder; pressing it returns her | `<h2>` via `regionHeadingId` — the shipped `focusRegionHeading` contract |
| shelf leaf pressed | Press on `PLAN ROOM` / `SPEC BOOK` / `BOARDS` / `CALL SHEET` | Esc, or the sheet's close — the shipped `DocSheet` contract | The overlay's first heading; on close, back to the pressed word |

### `editing` — the pen is down

| | |
|---|---|
| **Lens line** | Frozen. Line 2 holds whatever it said when she started. |
| **Rail** | Frozen. The segment does not travel. |
| **Region density** | **Frozen, every region.** Nothing prepares, nothing releases, while she is writing. |
| **Margin** | Frozen. The `IN FRAME` rule does not slide. |
| **The line under the pen** | Its left rule turns clay 1.5px; it holds the flat `-still` wash tint `rgba(196,165,123,0.12)`. **No sibling changes.** Nothing dims (Y-7). |
| **Entry trigger** | `focusin` on an editable control inside `[data-document-paper]`. |
| **Exit trigger** | `focusout` with no editable control receiving focus, or commit. |
| **Reverse** | On exit the freeze lifts and the density resolves once, on the next settle, off screen as always. Focus destination on exit: wherever her blur sent it — the lens moves focus never. |

### `condensed` — the paper's state, not the header's

There is no condensed header in this proposal. `condensed` is the name for a region at `quiet`, and it is a state of the paper.

| | |
|---|---|
| **Lens line** | Unaffected. 56px whether zero regions or eleven are quiet. |
| **Rail** | Unaffected. Every rung prints whether its stop is quiet or full. |
| **Region density** | `quiet`: head at 24px Playfair, status line, exception strings, the one inked leader act, one count line ≤40 characters. Body unmounted, height reserved from the region's own row count. |
| **Margin** | Unaffected — a margin item anchored to a quiet region still prints; it simply sits below the `IN FRAME` rule. |
| **Entry trigger** | Y-4's thresholds, off screen; or a fresh page load, where every stop below the first is already `quiet`. |
| **Exit trigger** | Y-3's threshold, off screen; or a ladder rung press, which forces `full` for the 700ms jump lock. |
| **Reverse** | Symmetric and stated above. The reverse of a rung-press force is the lock expiring, after which the observer owns the state again. |

### `mobile` — 390, one column

| | |
|---|---|
| **Lens line** | 64px, two lines, the same strings as 1440, measured not hard-coded. |
| **Rail** | None on canvas. The ladder is the Sections sheet, opened from the mobile bar; every rung, the same names. |
| **Region density** | Identical rules, identical thresholds in px. The 240/480/96 numbers are absolute, not proportional, because a line is the same height at every width. |
| **Margin** | Chips anchored to the stop in frame print inline; the rest under `ABOUT THE WHOLE JOB` in the sheet. |
| **Entry trigger** | Viewport below 1180. |
| **Exit trigger** | Viewport at or above 1180. |
| **Reverse** | The existing 1179↔1180 focus handoff (`quiet-release-contracts.spec.ts:212-300`) is unchanged; the band, the ladder and the margin all keep their state across the boundary because none of them is width-derived. |

---

## 6. Frame budget

Against `research/12-layout-measurements.json`. Today's numbers are that file's `chrome / header+summary / active region` split. Target rows are computed from the band at 56px (64px at 390), the drawer at 60px, the letterhead at 211px and `--doc-region-gap` at 24px.

### 1440 × 900, rich project spread

| State | Chrome today → target | Header+summary today → target | Active region today → target |
|---|---|---|---|
| s0 | 6.7% → **6.7%** | 81.8% → **29.7%** (letterhead 211 + band 56 = 267px) | 0.0% → **56.8%** (511px below the first rule) |
| s1 | 6.7% → **12.9%** (drawer 60 + band 56) | 60.7% → **0.0%** (the band is chrome once pinned; nothing else survives the letterhead) | 10.4% → **87.1%** |
| s2 | 13.9% → **12.9%** | 0.0% → **0.0%** | 86.1% → **87.1%** |
| s3 | 13.9% → **12.9%** | 0.0% → **0.0%** | 50.9% → **≥62%** (the foot's four stops are indexed, so `neither` — measured today at 70.3%, F92 — falls) |

The headline is s1: today one full screen after landing, **60.7% of the frame is still header and summary and 10.4% is the region she came for** (F11). After: 87.1% is the region, and the 12.9% of chrome is a 56px band that names the job, the phase, the install date, the stop and the worst thing standing.

### 1280 × 800, rich project spread

Identical DOM; the band and the drawer are the same absolute heights, so the percentages of an 800px frame are: chrome s1–s3 **14.5%**, header+summary s0 **33.4%**, active region s1–s3 **85.5%**. Today: 6.7 / 60.7 / 10.4 at s1.

### 390 × 844, rich project spread

| State | Chrome today → target | Header+summary today → target | Active region today → target |
|---|---|---|---|
| s0 | 9.1% → **9.1%** | 71.0% → **32.5%** (letterhead 211 + band 64) | 0.0% → **50.6%** |
| s1 | 9.1% → **16.7%** (bar 64 + band 64) | 48.5% → **0.0%** | 0.0% → **83.3%** |
| s2 | 16.8% → **16.7%** | 0.0% → **0.0%** | 83.2% → **83.3%** |
| s3 | 16.8% → **16.7%** | 0.0% → **0.0%** | 26.2% → **≥55%** |

### Pre-work spread, 1440

| State | Chrome today → target | Header+summary today → target | Active region today → target |
|---|---|---|---|
| s0 | 6.7% → **6.7%** | 79.9% → **29.7%** | 2.8% → **56.8%** |
| s1 | 6.7% → **12.9%** | 59.0% → **0.0%** | 27.7% → **87.1%** |
| s3 | 13.9% → **12.9%** | 0.0% → **0.0%** | 66.8% → **≥75%** |

### SC1–SC4, with the arithmetic

| # | Criterion | Today | Target | How the number is reached |
|---|---|---|---|---|
| **SC1** | First region head y at 1440, at rest, scroll 0 | **1005px** (111.7% of the frame, F01) | **329px** — 36.6% | `<main>` `pt-8` 32 + letterhead 211 (`10-code-anatomy.md` §2.9, unchanged) + band 56 + `--doc-region-gap` 24 + `RegionRule` 6 = **329**. The ticket's 330px, the guide's 136px and the instruments' 38px are gone; the letterhead is untouched. Against the ≤405px threshold, 76px of headroom for a two-line vitals row on a document that has one. |
| **SC2** | Condensed header band height at 1440 | 64px seam **and** a 347px unfolded form it swaps between | **56px**, and there is no other form | `py-2.5` 10+10 + line 1 (11px × 1.4 = 15) + 2 + line 2 (15px × 1.3 = 20) + `--rule-mid` 1.5 ≈ 56. One element, one height. Against the ≤108px budget: 52px unspent, and **no second sticky band is added to spend it** (M-8 refused as drawn). |
| **SC3** | Lens-line height at scrollY 0 / 400 / 1200 | 0px / 0px / 64px — the property is *removed* while unpinned (`job-ticket.tsx:250-253`) and 64px once pinned, and the element itself is 347.25px then 64.06px (probe §1) | **56 / 56 / 56** at 1440 and 1280; **64 / 64 / 64** at 390 | The band has one form. This is the falsifiable sentence: a probe sampling `[data-lens-band]` at those three offsets on all seven spreads must read one number per width. |
| **SC4** | Rail utilisation `inkPx / railHeightPx` at 1440 | **54.9%** project, **13.9%** pre-work; longest empty run 270px and 657px | **≥88%** on both | `Put down` row 44 + `ON THIS PAPER` 15 + the ladder from y 112 to y 856 = 744 → 803 / 900 = **89.2%**. Because rung height is `clamp(44, (railHeight − 156) / stops, 120)`, the ladder fills the rail whatever the stop count: twelve stops → 62px rungs, seven stops → 107px rungs, and pre-work measures the same 89.2% as project. Longest empty run: **44px**. |

**SC5–SC13, stated for the probe.** SC5 hover-only acts: **0** — every act in this proposal is a press, and the 1280 tier's labels open on press, not on hover (F128 records zero hover-only affordances today and this proposal adds none). SC6 elements animating 1s after a state change under reduce: **0** — Y-1, Y-3, Y-4, Y-5 and Y-9 all have instant forms and Y-2's `motion-reduce:transition-none` is already shipped. SC7 composite contrast in every state: **≥4.5:1** — no ink ramp is used anywhere; `--text-muted` `#65594E` measures 6.5:1 on paper and 5.32:1 on rail stock (F74, E1 §5). SC8 shadow census: **exactly three** `--elevation-sheet` sites, unchanged. SC9 external requests: **0**. SC10 horizontal overflow: **0** at 1440/1280/390 — the 160px rail widens the paper column rather than narrowing it. SC11 density map: exactly **one** region at `full`, and no region with zero readable text, because `quiet` always prints a head, a status line, its exceptions, its leader act and a count. SC12 `data-reading-index` vs the `full` region: they are the same value by construction — the band's stop word, the ladder's clay segment and the `full` region all read one state. SC13 tab-through: every act is in DOM order behind a `focus-visible` ring, and `[data-lens-land]` extends `scroll-margin-top: var(--doc-seam-height)` from region roots to every landing target, which today covers roots only (F120).

---

## 7. Findings addressed

Every verified blocker and high in `research/31-verified-findings.md`. **A** = answered, **R** = refused with a reason.

| F | | How |
|---|---|---|
| F01 | A | SC1: first region head 1005 → 329. The ticket dissolves, the guide/red-letter block leaves the stack for the band's line 2, the instruments row leaves for the letterhead line and the margin's shelf line. |
| F02 | A | At 390 the studio puck yields its corner; the band's line 1 owns the identity zone and the puck sits right of it. One class change in `mobile-bar.tsx`. |
| F04 | A | There is no collapse. The band is 56px before and after the pin, so the 283.19px jump has no cause to exist. |
| F06 | **R** | "Everything in install" is a phase-wide question across documents. NG1/D1 forbids answering it inside one open document, and no lens mechanic can. It belongs to the desk. Named, not smuggled in. |
| F07 | A | The 1280 rail prints no words at all, so nothing breaks mid-syllable. Labels open on press in the Sections sheet. |
| F08 / F41 | A | Folding parks focus on the resulting `FoldSeam` button, mirroring `focusRegionHeading`. A density change moves focus never, and a region holding focus is refused release outright. |
| F09 | A | `BOARDS`, `DRAWINGS`, `SPEC` and `PEOPLE` move to the margin's shelf line, which is `sticky top-0 h-screen` at 1440 and a sheet at 1280/390 — present at s0, s1, s2 and s3, not only at the top. |
| F10 | A | SP-08 applied by name: money's owner is the money region head at `full`, the band's line 2 when money is the worst thing standing, and the margin's items. The rail prints no money value at all. Five statements become at most two, and they never disagree because both read the same ladder. |
| F11 | A | Frame budget, s1: header+summary 60.7% → 0%, active region 10.4% → 87.1%. |
| F12 | A | The ladder indexes every stop on the proposal spread (SP-05) and its rungs divide the rail, so pre-work measures the same 89.2% as project. Longest empty run 657px → 44px. |
| F13 | A | The household name is on the band's line 1 at every offset and every width. |
| F14 | A | The Sections sheet prints the whole ladder, same names as 1440. |
| F15 / F21 | **R (partly)** | The four index labels do **not** return as text at 1280. At a 44px content box 11px mono breaks mid-word — measured (F07) — and widening the rail is `weeks` (E1 §4a: two pinned specs plus the paper's x-origin). What returns instead is a ticked position line with every label one press away. Answered as position, refused as text. |
| F16 | A | Wave 2b wraps the four pre-work spreads' bodies in real regions inside `page.tsx`, which is the structural cost E1 §4(3) priced at `weeks` and which this proposal carries rather than dodges. |
| F17 | A | The `IN FRAME` rule slides to the stop she is in. Items keep their paper order; nothing is hidden and nothing reorders. |
| F18 | A | One `IN THE MARGIN` heading, in the sheet header only. |
| F19 | A | The tab prints `MARGIN · 7`; an empty margin prints `MARGIN`. |
| F20 | A | On a proposal the ticket does not exist to print eight rows of absence; the band prints one sentence and the ladder prints the spread's own stops. |
| F22 | **R** | No extent bars, no exception marks on the rail. Proportional extents make the schedule rung a 6px target on the Vandersteen spread — a 2.5.8 failure before it is a taste failure — and exception marks put a second copy of the band's line 2 on the same screen, which is the standing assignment's first catch. Extent lives on the paper; trouble lives on the band. This is the sharpest thing this proposal refuses. |
| F23 / F62 / F63 / F65 | **R** | Vendor acknowledgement state, damage state, the word "PO", and a claim door on the FF&E line are product gaps, not composition. The ask is to make the same information occupy less attention, not to add information. Named here so they are not lost: they are the strongest case for a procurement wave after this one. |
| F24 | A | The band reserves 56px and the schedule glance reserves its own height, so the 0.1189 shift that dominates both CLS passes arrives as words into reserved geometry. |
| F25 / F57 | A | `shelf-panel.tsx` renders as an overlay at 1180–1439 instead of returning `null` (`shelf-panel.tsx:136`), so `Drawings` and `Spec` have a real door on a 1280 laptop from the margin's shelf line. |
| F34 | A | `--doc-seam-height` is a constant, so `scroll-margin-top` resolves once and correctly at any fling speed. Removed rather than mitigated. |
| F35 | A | This proposal depends on **no** browser feature that needs a matrix: no `animation-timeline`, no `@property`, no `content-visibility`, no scroll timeline. `IntersectionObserver`, `position: sticky` and CSS transitions are already load-bearing in this tree. The missing `browserslist` remains a real gap and is named, not inherited as a risk. |
| F36 | A | The 1500-character regex is deleted and replaced with a rendered assertion (see §9). It currently passes on a comment at 162 characters, not on the structure it claims to pin. |
| F37 | A | Moot by construction — nothing registers `--doc-seam-height` as a custom property, so the four `var(…, 0px)` fallback arms keep their meaning. |
| F38 | A | Wave 1 adds the Playwright assertion E1 asked for: after a ladder-rung press, the stop's `<h2>` top sits within 4px of the band's bottom. The jsdom seam assertions stop being the only coverage. |
| F39 | A | A fourth, lowest, non-persisting voice is added to `use-region-fold.ts`, moving only `full ↔ quiet` and never to `folded`. Scroll never writes storage. |
| F40 | A | 390: first region head 1054 → ~340; letterhead vitals and client acts collapse into the band by default at this width. |
| F42 | A | One `aria-live="polite"` region, on the band's line 2, announcing on settle only. |
| F43 | A | Every sheet kind gets a real `aria-label` — `Sections`, `Margin item`, `Studio actions`. |
| F44 | A | The band's height is **measured** by a `ResizeObserver` on the band itself, per width, and published once. It is a constant across scroll, never a constant across widths, and never hard-coded. |
| F45 | A | The 700ms jump lock keeps its job and gains one: it forces the target stop to `full` for its duration, so a smooth scroll does not walk three regions to `full` in transit. It does not need to own the seam height, because the seam height does not move. |
| F46 | A | One schedule door. The `Schedule dates` rule seam becomes a line inside the schedule region, not a sibling seam 200px above the region's own head. |
| F47 | A | The resting top band carries the letterhead (title, household, vitals) and the band's five items. Counted literally: 8, against today's 20. |
| F48 | A | At 390 only chips anchored to the stop in frame print inline. |
| F49 | A | At 390 the region head's ledger collapses to the one inked leader plus the always-visible overflow glyph. |
| F50 | A | The band's line 2 prints the two, then the count it withheld: `· +2 more`. |
| F51 | A | Pin and unpin keep the single sentinel — but since the band's height is identical either side of it, a shared boundary has nothing to oscillate. The **density** observer, which does need hysteresis, gets two thresholds 240px apart and both of them off screen. |
| F52 | A | The pin no longer relocates focus, because the pin no longer unmounts anything. `job-ticket.tsx:235-244`'s effect is deleted with the rows it protected. |
| F53 | A | `quiet` unmounts the body, so the fold's render-cost role survives intact — and `content-visibility: auto` is never needed, which is why the R126 wash is never at risk (F61). Virtualization stays an open question for a `full` 60-line body, unchanged by this proposal and named in §10. |
| F54 / F59 / F89 | A | A fold from her hand prints `CLOSED BY YOU` and steps its rule to `--rule-mid`. The lens's `quiet` prints a count line at `--rule-strong`. Four readings, four marks, all legible in a still (SP-02). |
| F55 | A | The seven marks leave the rail; the arc is a counted phrase on the band, where four-of-six is a number rather than seven equal 22px bars. |
| F56 | A | A returning reader still lands at the active section, and the band names the household in that frame. |
| F58 | A | At 1280 anchored margin items stay reachable from a sheet whose trigger prints its count, and the tier's rail carries a position line rather than three interactive children. |
| F60 | A | R99's zero-shift mechanism is generalised by removing the need for it: nothing pins at reduced height, because nothing has two heights. |
| F61 | A | Moot. `content-visibility` is refused (§11). |
| F64 | A | `latchedDefault` becomes the region's **initial density**, not its initial fold — a density default cannot close a region she is reading. |
| F66 | **R (composition), A (placement)** | New card kinds for PO and damage are a data question this proposal does not answer. What it does answer: whatever kinds exist sit in paper order under an `IN FRAME` rule, so a procurement card would land beside the piece it is about the day it ships. |
| F67 | **R** | The ledger sheet's scroll-offset preservation on the return trip is untested and stays untested here. It is a probe task, not a design decision, and inventing an answer would be worse than naming the gap. |

---

## 8. Canon note

**What this builds on.** R126, `DECISIONS.md:9993`: *"three paper stocks and only three … three rule weights for three ranks … B's colour survives at exactly three sites and nowhere else."* Everything below is composed from that register and adds nothing to it.

**What it changes, named for the record (canon latitude, instruments §5 — not priced):**

| Id | Quoted, ≤25 words | What it becomes |
|---|---|---|
| **R99** `:3016-3018` | "pins beneath the project title on scroll at reduced height (labels fold into the line; diamonds and the today rule remain)" | Nothing pins at *reduced* height. The band is one height and only its words change; the schedule glance's own `top: var(--doc-seam-height)` becomes a constant instead of a moving target. |
| **I149** `:9851-9875` | "new `job-ticket.tsx` (eight rows … ), sticky two-line seam on scroll" | `deriveTicket` keeps producing the eight rows and their doors; nothing renders them as a table. The seam becomes the band and never folds. Each row's destination is tabled in §4. |
| **I136** `:8427-8541` | "running index (≥1440px only, four Project regions indexed, IntersectionObserver reading line)" | Every stop on every one of the seven spreads, at both desktop tiers — as words at 1440, as ticks at 1280. The reading line is unchanged. |
| **I137/C11** `:8616-8624` | "The running index is derived from the paper order, not declared beside it … `PROJECT_PAPER_ORDER` … approvals → schedule → ffe → money" | One order table per section, still derived from mount order, still never declared twice. The pairing law survives; the array becomes a map. |
| **I135** `:8377-8424` | "region heads (one inked leader per region) … red-letter needs zone … always-visible row overflow" | The needs zone stops being a block on the paper and becomes the band's line 2, present at every offset rather than only at s0. The one-leader rule and always-visible overflow are untouched. |
| **R27** `:1058-1067` | "the letterhead instruments — 'View as the clients', 'Send a note', 'The scan' as one quiet DM-mono row" | Two client acts move onto the `HouseholdChip` line and print only when a client is linked; `SHARING · MILESTONES` and `CALL SHEET` move to the margin's shelf line. Still one quiet mono register, in two places that have a reason. |
| **R15** `:381-397` | "one slow ~3s opacity swell on the *active* spine marker only, `prefers-reduced-motion` disables it" | The swell moves to the letterhead's mark when the arc leaves the rail. Still exactly one ambient move, still disabled under `reduce`, now present at arrival and absent while she reads. |
| **I148** `:9815-9842` | "six-rung money ladder (`Budget · Plan · Authorized · Moved · Owed · Not drawn`)" | Unshelved from the spine. The rungs stay exactly where they also render — in the money region — and the rail prints no money value. |
| **R125** `:9705-9750` | "no feature flags anywhere (`job-ticket` waived)" | One fail-closed flag, `doc-lens`, for this program's four waves, retired at the last deploy. |

### NG1 — one document at a time

Every state change in this proposal is a DOM attribute or a scroll offset inside `[data-document-shell]`. The ladder's rungs call `scrollToRegion` (`use-document-running-index.ts:202-222`), which is a same-document `scrollIntoView`, never a route. The band's `to the top` is `scrollTo(0,0)`. The shelf line opens the shipped `DocSheet` overlays, which leave the document mounted beneath them (`overlays/doc-sheet.tsx:199+`). No mechanic renders a second document's content at any density, and `Esc` still reaches the page's put-down handler unchanged (probe §4).

### NG2 — the shadow budget

The band's separation from the paper beneath it is `--rule-mid` (1.5px `#2C2926`, `globals.css:131`) on its lower edge — the mechanism SP-04 requires and the only one available, since `shadow-gate.test.ts:97-105` fails on any new shadow anywhere under `src/` and `:129-136` caps `.doc-elevated` at three TSX files. This proposal adds zero shadow declarations, zero `drop-shadow()`, and puts `doc-elevated` on nothing new; `margin-item.tsx:46` keeps its site precisely because the margin chips stay chips in a column rather than becoming pins on the paper.

### NG3 — no Thumb Index

The ladder has one rung per stop **on this paper, in this paper's order, labelled with this paper's own head words** — `Client approvals`, `The accounts`, `Closing the book`. Its length is the document's stop count, so it differs per spread. It is not an alphabet, not a fixed set of edge tabs, and it does not run down the viewport edge: it sits inside the 160px rail behind `Put down` and `ON THIS PAPER`, and at 1180–1439 it is one hair rule with ticks and no letters at all.

### NG4 — the R126 register as the floor

No mechanic in §3 introduces a type size, a rule weight or a pigment. The band's two lines are the existing 11px mono and the existing 15px body. The ladder's rung names are `spine-running-index.tsx:97-105`'s existing 13px. The count line is the existing 12.5px status register from `region-head.tsx:135`. The band's line-2 exception ink is `--color-terracotta-ink` `#9C5340`, already shipped by I151. `region-rule.test.tsx:59-74` pins the double rule to the pixel and this proposal never touches it. `doc-letterhead.test.tsx:69-83` pins the 40px title, the tracking and the `doc-rule-mid` closing rule, and those assertions stay green.

---

## 9. Engineering path

Four waves behind one fail-closed flag, `doc-lens`. Every wave is worth shipping alone. Cost bands follow `research/29-panel-e1.md`: `days` = 1–3, `week` ≈ one, `weeks` = two or more. **This path agrees with E1 everywhere except one place, named in Wave 1.**

### The three load-bearing mechanisms, answered first

**(a) `use-region-fold`'s three voices** — `apps/designer-portal/src/components/document/region/use-region-fold.ts`.

1. `forceOpen` stays supreme and stays a **fold** override. A deep link lands on a body at full ink.
2. `explicit` (localStorage, `patina:doc-fold:<docId>:<region>`, written at `:129-135`) stays a hard fold, unchanged, and survives every scroll. Scroll may not write it (SP-07).
3. `latchedDefault` (`:104-119`) becomes the region's **initial density**, not its initial fold. This is the only one of the three that was never a designer's act, and moving it also closes F64: a default that resolves true after first paint can no longer flip a rendered-open region shut, because a density default cannot fold anything.
4. A **fourth, lowest, non-persisting voice** — the lens — may move a region only between `full` and `quiet`, never to `folded`, and writes nothing.

The hook's return widens from `{folded, toggle, setFolded}` (`:90-94`) to `{folded, density, toggle, setFolded}` across all seven fold keys (`:25-40`). `region/__tests__/use-region-fold.test.tsx` is an **additive rewrite**: every existing assertion at `:38-60` stays true, and two cases are added — *scroll never writes storage*, and *`explicit` outranks the lens in both directions*.

**(b) The ticket seam and every `--doc-seam-height` consumer.**

The variable keeps its name, its `document.documentElement` scope and its **single writer**, which becomes the band. The write moves from `job-ticket.tsx:248-259` to `components/document/lens-band.tsx`, and it changes in exactly one way: the property is published **always**, on mount and on `ResizeObserver` fire, rather than only while `pinned && !unfolded`. Because the value no longer changes with scroll:

| Consumer | file:line | What happens |
|---|---|---|
| Schedule glance offset | `apps/designer-portal/src/app/globals.css:1026` | Resolves once. The glance stops drifting against the paper (F87, E1-04) with no code change. |
| Region landing clearance | `apps/designer-portal/src/app/globals.css:1034` | Resolves once at `scrollIntoView` call time and is still correct when the scroll lands (F34, E1-01). No freeze, no jump-lock ownership, no mitigation needed — the failure has no cause. |
| FF&E landing floor | `apps/designer-portal/src/app/globals.css:1037` | `max(var(--doc-seam-height), 4rem)` unchanged; at 56px the 4rem floor still wins, which is the pre-existing breathing room and stays. |
| Money inline clearance | `apps/designer-portal/src/components/document/commercial/money-region.tsx:48` | Kept as written, with its local rationale. Redundant and harmless. |
| **New** — child landing targets | `apps/designer-portal/src/app/globals.css` | `[data-document-shell] [data-lens-land] { scroll-margin-top: var(--doc-seam-height, 0px) }`, applied to the band's line-2 act and the shelf line's leaves. Closes F120, where only region roots clear the band today. |
| `var(…, 0px)` fallback arms | all four | **Kept as written.** Nothing registers the property with `@property`, so the arms keep their meaning and F37 / E1-03 never arises. |

**Where this path disagrees with E1.** E1 §1's headline is *"a continuous seam is not a header change, it is a navigation change"*, and §2 forks the authors between three discrete steps (`days`) and continuity (`week`/`weeks`). **This proposal takes neither fork.** The seam has one step, so the fork does not apply, and the mitigation E1 designed in from the start — freezing the seam at its condensed floor for the duration of a programmatic scroll — is not built, because there is nothing to freeze. E1's cost band for a one-height band is not in its table; measured against the work in Wave 1 it is `days` for the band itself and `week` for the redistribution of what the ticket used to carry.

**(c) The running-index observer's `-20% 0px -62% 0px` band and its 700ms jump lock** — `apps/designer-portal/src/hooks/use-document-running-index.ts`.

Both keep their job unchanged. `READING_BAND` at `:34` still decides which stop is current and still drives the reading line; it measured clean — three transitions across a scripted scroll, zero flicker across four clicks (F105, probe §2) — and this proposal has no reason to touch a band that works. `JUMP_LOCK_MS` at `:35` keeps holding the line through a smooth scroll and **gains one job**: for its 700ms it also forces the target stop to `full`, so a scroll that passes three regions does not bring three to full in transit.

The **density** observer is a second, separate observer in a new hook, `apps/designer-portal/src/hooks/use-lens-density.ts`, with its own thresholds (240 / 480 / 96, §4) and its own attach strategy. It does **not** inherit the index's query-with-retry attach (`:120-133`, 8 × 250ms ≈ 2s), which E1 §3 flags as a silent hole for late-mounting roots; it uses a `MutationObserver` on `[data-document-paper]`. Density is written imperatively as `root.dataset.density`, outside React's render, never inside `startTransition` — the tree contains zero `startTransition` calls today (F88) and gains none.

### Wave 1 — The constant band · `week` · closes SC1, SC2, SC3

**Files.**
- `apps/designer-portal/src/components/document/lens-band.tsx` — new. Two lines, one measured height, one `aria-live="polite"` region, the `ResizeObserver` publish.
- `apps/designer-portal/src/components/document/job-ticket.tsx` — rows stop rendering; the sentinel, the `sticky top-0 z-[4]` shell and the seam derivation stay; the pin-change focus effect at `:235-244` is deleted with the rows it protected.
- `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` — the `RedLetterZone` XOR `DocumentGuide` ternary at `:1838-1847` is deleted and both models feed the band; `LetterheadInstruments` stops mounting at `:1863-1880`.
- `apps/designer-portal/src/components/document/red-letter-zone.tsx`, `apps/designer-portal/src/components/document/document-guide.tsx` — become model providers; the components keep their names so `document-guide.ts`'s precedence gate is untouched.
- `apps/designer-portal/src/components/document/doc-letterhead.tsx` — two client acts on the `HouseholdChip` line, printed only with a client; the vitals line prints only fields that have values.
- `apps/designer-portal/src/components/document/letterhead-vitals.tsx` — the empty-field suppression.
- `apps/designer-portal/src/app/globals.css` — `[data-lens-land]` clearance; the schedule glance's reserved height.

**Tests.**
- `apps/designer-portal/src/components/document/__tests__/job-ticket.test.tsx` — **rewrite.** `:519` and `:529` assert `''` and go red the moment the property is always published; both become `/px$/`. `:524` survives. `:226-241` (8 rows in fixed order) moves to a `deriveTicket` assertion. `:259` `sticky`, `:262` `data-pinned`, `:517` `z-[4]` and `:533-541` (no shadow) all survive unchanged.
- `apps/designer-portal/src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts` — **the 1500-character regex at `:19` is deleted**, not adjusted. It currently passes on the comment at `page.tsx:1960-1963` at 162 characters rather than on the real attribute at 1128 (F36, E1 §5), so it has already stopped testing what it claims. Its replacement renders the page and asserts `SectionStageLineMount` is the **first element child** of `[data-active-section]`. The three companions — `:15-17` (`MobileMarginChips` → `ProjectApprovalDocumentMount`), `:21-23` (the `indexOf` ordering), `:24` (`'project?.client_id ?? null'`) and `:25-27` (the 300-char `clientProfileId` guard) — are order-and-content assertions and all survive.
- `apps/designer-portal/e2e/document/quiet-responsive-shell.spec.ts` — **rewrite.** `toHaveCount(8)` at `:173-176`, `:183-185` and the 390 unfold path at `:190-196` all assert a table this wave deletes. They become "the band prints identity, the phase count, the install date and one sentence at 1440, 1280 and 390".
- `apps/designer-portal/src/components/document/__tests__/responsive-document-shell.test.tsx` — **rewrite.** `:655-687` pins 8 rows and `data-unfolded='true'` at 1440. The `data-spine-regime` literal at `:187-189` is untouched by this wave.
- `apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx` — **rewrite.** `:1351-1358` (exactly one `[data-job-ticket]`) and `:1360-1379` (the sentinel contract, `sentinel.nextElementSibling === ticket`) both survive as a selector rename to `[data-lens-band]`; the assertion's shape is unchanged and it is worth keeping, because it is the only thing stopping a future edit from putting a block between the sentinel and the band.
- `apps/designer-portal/src/components/document/doc-letterhead.test.tsx` — **additive.** `:69-83` (40px, tracking, `doc-rule-mid`, no `border-b`) and `:85-97` (no shadow on any descendant) stay green; two cases are added for the client-act pair.
- **New**, `apps/designer-portal/e2e/document/lens-band-height.spec.ts` — the falsifiable sentence as a test: sample `[data-lens-band]`'s `boundingBox().height` at scrollY 0, 400 and 1200 on the rich and the pre-work document at 1440, 1280 and 390, and assert one value per width. This is also E1's owed Playwright landing assertion (F38): after a rung press, the stop's `<h2>` top within 4px of the band's bottom.

**Rollback.** `doc-lens` off restores the ticket's rows, the ternary and the instruments row; the band is not mounted and `--doc-seam-height` reverts to its two-state publication. No migration, no persisted state.

### Wave 2a — The ladder at 1440 and 1280 · `week` · closes SC4 at 1440 on the project spread

**Files.**
- `apps/designer-portal/src/components/document/spine-ladder.tsx` — new. Rungs, the `--rule-hair` ladder rule, the clay segment, the `clamp` rung height, the text-free 1280 form.
- `apps/designer-portal/src/components/document/doc-spine.tsx` — children 2, 3, 5 and 6 stop mounting; child 4's `min-[1440px]` gate is dropped; the rail narrows to 160px at ≥1440.
- `apps/designer-portal/src/components/document/spine-running-index.tsx` — becomes the ladder's row renderer; the reading-line measurement at `:45-52` is reused verbatim.
- `apps/designer-portal/src/lib/document/document-index.ts` — `PROJECT_PAPER_ORDER` (`:36-57`) becomes a per-section table; `DocumentIndexKey` (`:17`) widens; `regionHeadingId`'s throw (`:93-102`) is kept as the guard that keeps the union and the table in step.
- `apps/designer-portal/src/components/document/mobile/mobile-sheets.tsx` — the spine sheet gains the ladder list and every sheet kind gains an `aria-label` (`:260`).
- `apps/designer-portal/src/components/document/spine-timer.tsx`, `apps/designer-portal/src/components/document/spine-shelved-blocks.tsx` — **left on disk, unmounted from the spine.** Deleting either drops it from `contrast.test.ts:313-341`'s hard-coded five-file scan silently, which is a green test that has stopped testing.

**Tests.**
- `apps/designer-portal/src/components/document/doc-spine.test.tsx` — **rewrite.** `:43-46` asserts the shelved wrapper is exactly `hidden` + `min-[1440px]:block`, which is the single assertion blocking the ladder at 1280. `:25` (`Put down` `min-[1180px]:inline`) survives.
- `apps/designer-portal/src/components/document/__tests__/shelved-spine.test.tsx` — **rewrite.** `:155-197` asserts `paperRegionsForSection` returns `[]` for brief/discovery/direction/proposal — the exact behaviour this wave changes — and `:217-236` pins the spine to one block, which stays true and becomes easier to hold. `:82-98` (one `aria-current`, jump from any) survives.
- `apps/designer-portal/e2e/document/quiet-release-contracts.spec.ts` — **rewrite.** `:150-158` pins paper `[200,1208]` and margin `[1208,1440]` at 1440; the rail at 160 moves both to `[160,1200]` and `[1200,1432]`. `:108-118` (55–57px at the compact tier) is **untouched** — this proposal does not widen the compact rail, which is exactly why Wave 2a is a `week` and not `weeks`.
- `apps/designer-portal/src/components/document/shelves/shelf-panel.test.tsx` — **rewrite** at `:145`, `min-[1440px]:left-[200px]` → `left-[160px]`.
- `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts` — **additive.** `spine-ladder.tsx` is added to the hard-coded scan list at `:313-341` in the same PR that creates the file.

**Rollback.** Flag off restores the 200px rail with its marks, caption, index, timer and presence line. The narrowing is one grid template and one test line, so a partial rollback (ladder at 200px) is available without reverting the wave.

### Wave 2b — Regions on the pre-work spreads · `weeks` · closes SC4 on pre-work

The structural cost E1 §4(3) priced and this proposal carries. The proposal spread renders **zero** `[data-region-head]` and zero `[data-index-region]` elements (F16, confirmed twice by DOM query); its content is inline in `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` with a plain head at `:2006`. This wave wraps the four pre-work spreads' bodies in real regions with real heads. **The fork E1 named is answered: an index row may print a name and a position with no value** (SP-05), so no new queries are needed for `brief` and `discovery`, which have nothing numeric to count.

**Tests.** `apps/designer-portal/src/components/document/__tests__/shelved-spine.test.tsx` again (`:238-262`, row count matches mounted regions — it will, for the first time, on a proposal). `apps/designer-portal/src/lib/document/__tests__/ticket-derivation.test.ts:177+` (pre-work spreads) stays green, because `deriveTicket` is untouched.

**Rollback.** Flag off; the pre-work ladder falls back to the stage list, which is what 390 already shows.

### Wave 3 — The two densities · `week` · closes SC11, SC12

**Files.**
- `apps/designer-portal/src/hooks/use-lens-density.ts` — new. The observer, the thresholds, the two-frame agreement, the same-frame scroll correction, `settle()` and `window.__lensSettled()`.
- `apps/designer-portal/src/components/document/region/use-region-fold.ts` — the fourth voice, per (a).
- `apps/designer-portal/src/components/document/region/region-head.tsx` — the count line; the head's two-track grid at `:118-121` is **not** touched, so `region-head.test.tsx:110-120` stays green.
- `apps/designer-portal/src/components/document/region/fold-seam.tsx` — `CLOSED BY YOU`, the `--rule-mid` step, and focus parked on the seam button when a body unmounts (F08/F41).
- The four region bodies, each of which needs its own quiet form specified: `apps/designer-portal/src/components/document/ffe-section.tsx`, `apps/designer-portal/src/components/document/commercial/money-region.tsx`, `apps/designer-portal/src/components/document/approvals/project-approval-document.tsx`, `apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx`. This is why the wave is a `week` and not `days` — four different bodies, four count lines.
- `apps/designer-portal/src/components/document/region/region-rule.tsx` — **untouched.** The rule weight never carries density.
- `apps/designer-portal/src/app/globals.css` — the `--doc-region-gap` token and the deletion of every call-site margin listed in `research/10-code-anatomy.md` §6, including the bare folded-approvals `<div>` at `approvals/project-approval-document.tsx:565`.

**Tests.**
- `apps/designer-portal/src/components/document/region/__tests__/use-region-fold.test.tsx` — **additive rewrite**, per (a).
- `apps/designer-portal/src/components/document/region/__tests__/fold-seam.test.tsx` — **stays green.** `:36-45` forbids an `opacity-0`/`translate-y` flash gated on a hydration flag; nothing here is hydration-gated, and the density attribute is written imperatively rather than through a `mounted` flag.
- `apps/designer-portal/src/components/document/region/__tests__/region-head.test.tsx` — **additive.** `:128-158` (the action-region contract at both widths) stays true unconditionally.
- `apps/designer-portal/src/components/document/region/__tests__/row-overflow.test.tsx` — **stays green.** The overflow glyph still renders collapsed and still unmounts its verbs (`:31-44`).
- **New**, `apps/designer-portal/e2e/document/lens-density.spec.ts` — at 1440 with a seeded 60-line, 4-room schedule: exactly one region at `data-density="full"` at scrollY 0, 400 and 1200; no region with zero readable text; and, on every density commit, the reading line's `y` measured before and after must be equal.

**Rollback.** Flag off mounts every region at `full`, which is today's behaviour exactly. The fourth fold voice is inert without the observer and writes nothing, so there is no persisted state to unwind.

### Wave 4 — The margin and the shelf · `week`

**Files.** `apps/designer-portal/src/components/document/margin-rail.tsx` (the shelf line above `:462`, the `IN FRAME` rule, one heading instead of two at `:264`/`:489`, the tab count at `:227-228`), `apps/designer-portal/src/components/document/shelves/shelf-panel.tsx` (`:136`'s `if (!fullTier && routes) return null` becomes an overlay at the compact tier, closing F25/F57), `apps/designer-portal/src/components/document/mobile/mobile-margin-chips.tsx` (the anchor filter), `apps/designer-portal/src/components/document/margin-note.tsx` (the two-line cap).

**Tests.** `apps/designer-portal/e2e/document/margin-handoffs.spec.ts` — **stays green**; `data-margin-mode` rail/sheet values at `:66-69` and `:102-105` are unchanged. `apps/designer-portal/src/components/document/__tests__/responsive-document-shell.test.tsx:317-319` (`data-margin-mode='rail'`, `min-[1440px]:sticky`, `col-start-3`) — **stays green**; the margin's width and column are untouched.

**Rollback.** Flag off restores the margin exactly as it ships today.

### The gates, shown green

- **`apps/designer-portal/src/lib/document/__tests__/shadow-gate.test.ts`.** One `box-shadow` in `globals.css` spent by `.doc-elevated` (`:80-95`) — unchanged. No new shadow under `src/` (`:97-105`) — this proposal declares none. No `drop-shadow()` (`:107-122`) — none. One `--elevation-sheet` declaration (`:124-127`) — unchanged. `.doc-elevated` on at most three TSX files (`:129-136`) — still `studio-drawer.tsx`, `margin-item.tsx`, `overlays/doc-sheet.tsx`. The band's separation is a rule weight, which is why the budget has room to spare rather than needing any.
- **`apps/designer-portal/src/lib/document/__tests__/contrast.test.ts`.** `--doc-rail-stock` still `#E8E3DB` (`:297-303`). Rail inks unchanged (`:305-311`). The hard-coded five-file scan (`:313-341`) keeps all five files on disk and gains `spine-ladder.tsx`. Rail-vs-paper separation > 1.1 (`:367-374`) untouched — the rail's stock does not change. No `--color-aged-oak` and no `--color-clay` text is introduced in any scanned file.
- **`apps/designer-portal/e2e/document/workflow-stage-responsive.spec.ts`.** `[data-document-shell]` visible at 320 (`:30-32`) and no horizontal overflow (`:47`) — the 160px rail widens the paper column and narrows nothing.
- **`apps/designer-portal/src/lib/document/__tests__/ticket-derivation.test.ts`.** Entirely green, entirely untouched — the eight rows, their order, their labels, the seam's worst-two tie-break at `:757`, the third dropped whole at `:764-770`, `Nothing overdue` at `:778-782`. The derivation is good and this proposal keeps all of it.

---

## 10. Risks

**R1 — The same-frame scroll correction steps the paper.** Y-4 releases a region above the reading line and takes back its height in the same layout pass. If the measurement is off by a frame, the paper walks upward every time she scrolls past a region — the 283px bug, redistributed and harder to see.
*The falsifying observation, week one:* seed one project with a 60-line, 4-room FF&E schedule with catalog crops (E1's own Rank-2 seeding task; the synthetic seed's 3 lines and 0 rooms will never show it, F05). At 1440, fling s0 → s3 and back with the lens on. If the reading line's document `y` differs by more than 1px across any density commit, the correction is wrong and Wave 3 does not ship.

**R2 — 56px is not enough for a real exception string.** The band's second line at 15px in a 944px measure holds roughly 110 characters. `OVERDUE 6 days — Primary bedroom client approval on the Hartland wool rug + walnut nightstands` is 96 and clears it; a longer one wraps, the band grows, and the falsifiable sentence is false.
*The falsifying observation, week one:* render the specimen's two red-letter rows and the longest live `deriveTicketSeam` exception into the band at 1440, 1280 and 390 and measure. If any is not 56 / 56 / 64, either the line truncates a fact — which is an information-loss defect, not a fix — or SC3 fails. The honest exit is a middle-truncation rule on the *subject*, never on the number or the day-count, decided before the band ships.

**R3 — Dissolving the ticket loses a fact nobody misses until a real project.** Five of eight rows print only absence on the Chen seed (F27), so the seed cannot show what the rows carry on the Vandersteen spread. If a row's destination turns out to be wrong, the fact leaves the product silently.
*The falsifying observation, first week of use:* a designer asks "where did Drawings go", or P3's walk cannot reach the plan room in ≤2 acts from any scroll state, or `deriveTicket` produces a ninth row (`clientcopy`, `ticket-derivation.ts:767-771`) that §4's table has no home for.

**R4 — The margin's travelling rule reads as a scrollbar.** A hairline that moves down a 232px right-hand column while she scrolls is the shape of a scrollbar thumb, and `IN FRAME` in 11px mono may not be enough to say otherwise.
*The falsifying observation:* in the first practitioner walk, somebody tries to drag it, or describes it as "the scroll thing". The fix if so is to make the rule full-width with its word at the left margin, not a fragment at the right edge.

**R5 — Narrowing the rail breaks a pixel contract nobody expected to be load-bearing.** `quiet-release-contracts.spec.ts` is the deepest pixel-boundary contract in the repo (E1 §5).
*The falsifying observation, week one:* the first Wave 2a build turns `quiet-release-contracts.spec.ts:150-158` red **and** leaves the shelf panel 40px adrift because `shelf-panel.test.tsx:145` pins `min-[1440px]:left-[200px]` — the second one is the tell, because the shelf's own position was never obviously a function of the rail's width.

**R6 — The ladder's new rungs have nothing to land on.** Wave 2a adds rungs for `Authorizations`, `The accounts`, `Closing the book`, `The call sheet` and `The record`, none of which carries `[data-index-region]` today, and `regionHeadingId` **throws** on an undeclared key (`document-index.ts:93-102`).
*The falsifying observation, week one:* pressing `The accounts` on the ladder throws in the console on the first branch build, or `use-document-running-index.ts`'s `attach()` never reaches `attached.size === ordered.length` and quietly gives up after its 8 × 250ms window (F75, E1 §3) — which presents not as an error but as a ladder whose lower half never highlights.

**R7 — Evicting the rail's timer leaves 1280 with no legible clock.** At 1440 the drawer prints `IN HAND TODAY 1h 09m`; at 1280 the drawer's own labels overprint in one glyph run (F03, `Find anything` over `IN HAND TODAY`).
*The falsifying observation:* at 1280 in the first Wave 2a build, no elapsed time is legible anywhere on screen at any scroll state. F03 is a pre-existing defect this proposal inherits and must fix in the same wave rather than discover after it.

**R8 — Two densities is one too few for FF&E.** A 60-line schedule at `full` is 60 rows plus 60 catalog crops in the DOM with no virtualization (`ffe-section.tsx`, 1549 lines, F53). `quiet` unmounts it, which preserves today's render-cost control — but the region she is *reading* is still 60 unvirtualized rows.
*The falsifying observation, week one:* on the seeded 60-line schedule, the running index's rAF `resolve()` (`use-document-running-index.ts:136-145`) runs two or three scroll events behind and the reading line visibly trails her. This proposal does not fix that and does not claim to; virtualization inside a `full` FF&E body is the next wave after this one.

---

## 11. Refuses

**1. No proportional-extent map rail.** The rail does not draw regions at their true height. On the Vandersteen spread the schedule rule region (`schedule-rule-region.tsx:181`, `mb-4`) is a fraction of a 60-line FF&E body, and a proportionally-drawn rung is a 6px press target — a 2.5.8 failure before it is a taste failure. *Refused, not deferred:* extent is a fact about the paper and it is legible on the paper, where scroll position and a scrollbar already say it. A ladder's job is that every rung is reachable, and equal rungs are how that is true.

**2. No second sticky band.** The current region's head does not pin beneath the band at reduced height, R99-style. Two stacked sticky bands are a header again, and SC2's 108px would be spent on chrome rather than saved. *Refused, not deferred:* the fact it was going to carry — which region she is inside — is one right-flush word on line 1, and the ladder's clay segment says the same thing in the same frame. A whole second band for a word is the redundancy the standing assignment finds first.

**3. No pins in the paper's gutter.** Margin chips do not move beside the lines they are about. A decision about the whole job has no line to point at, so the mechanic needs an orphan home or it loses items silently — and `margin-item.tsx:46` carries one of the three legal `--elevation-sheet` sites, so a pin on the paper is a shadow on the paper (NG2, `shadow-gate.test.ts:129-136`). *Refused, not deferred:* what the gutter was for — the margin changing as she moves — is delivered by one hair rule that travels, at zero cost to the column and zero cost to the shadow budget.

**4. No continuous seam height, and no `animation-timeline: scroll()`.** Not three discrete steps either. *Refused, not deferred:* E1 §1 is right that a continuous seam is a navigation change, and the cheapest correct answer to that is not to mitigate it but to have no seam that moves. A scroll timeline would additionally require `@property` registration, which kills the `var(…, 0px)` fallback arm at four sites (F37), against a repo with no `browserslist` and a Playwright matrix that enables WebKit (F35).

**5. No `content-visibility: auto`.** It is the obvious render-cost replacement if bodies stay mounted, and it implies `contain: layout paint`, which makes the region root a stacking context — under which `.row-wash`'s `z-index: -1` (`globals.css:327-334`) paints behind the containment rather than behind the row, and the R126 hover wash Kody asked for either vanishes or paints over the text (F61, E1-08). *Refused, not deferred:* the two-density model keeps the unmount, so this proposal never needs the property and never puts the wash at risk.

**6. No ink ramp for density.** A quiet region is not a faint region. `#65594E` measures 5.32:1 on rail stock against a 4.5:1 floor (F74) — roughly one step of headroom and none for a family — and nothing in the rail has ever changed weight across scroll states (F84), so a designer has no learned expectation that faintness means anything. *Refused, not deferred:* quieter means fewer words, at full ratified ink, which is SP-12 and which a still screenshot can prove.

**7. No values on the rail.** No counts, no dollars, no `NOT SCHEDULED`. *Refused, not deferred:* today `Money unread` and `$6,200 OWED` print at the same size, weight and row position (F108), and `Client approvals / 0 IN THE LOG` sits 540px from `Client approvals NO DECISION LEAD · NO APPROVALS AUTHORED` in a different type register (F29). A ladder that prints no values cannot print a false one, and every value it would have printed is on the paper it points at.

**8. No new capability.** No PO-acknowledgement badge on the FF&E line, no damage-claim door, no phase-wide install roster, no procurement card kind in the margin (F23, F62, F63, F65, F66, F06). *Refused, not deferred:* the ask is to make the same information and the same acts occupy less attention. Every one of these is a real gap, several of them cost P4 a trip out of the document, and they are named here so the next program can pick them up — but a lens proposal that quietly adds four capabilities has answered a different question.

---

## The candidate mechanics, M-1 to M-10

| M | Verdict | One sentence |
|---|---|---|
| **M-1 · The Lens Line** | **Adapted** | One band, yes — but its height is a constant and its *sentence* is what changes, and the five-things list becomes four standing facts on line 1 plus one changing sentence on line 2, with the money rung argued out. |
| **M-2 · The Map Rail** | **Refused** | Proportional extents make short regions unclickable and put a second copy of the exception signal on screen; the rail becomes an equal-rung ladder that prints names and position and no values. |
| **M-3 · Reading-line Density** | **Adapted** | Two densities instead of three, because there is no legible middle between all the words and the head's words; and every assignment happens strictly off screen, so the lens never changes anything inside the frame. |
| **M-4 · The Gutter Margin** | **Refused** | A pin has no home for a document-wide decision and would carry `margin-item.tsx`'s `--elevation-sheet` onto the paper; the margin instead changes by sliding one `IN FRAME` rule while every item holds its place. |
| **M-5 · Section Zoom** | **Adapted** | Its detent character survives as how a transition reads — one step, never a gradient — and a ladder jump forces the target to `full` for the 700ms lock; **the precedence rule is that M-3's observer is the only assigner of density, and M-5 owns only the deliberate arrival.** |
| **M-6 · Focus Follows the Pen** | **Adapted** | As ink weight on the edited line alone — a clay rule and the flat `-still` tint, never a dimmed sibling — plus a freeze of every region's density while the pen is down. |
| **M-7 · The Ticket Dissolved** | **Adopted** | `lib/document/ticket-derivation.ts` keeps deriving all eight rows and their doors; nothing renders them as a table, and §4's table gives every row a home at s0 and at s2. |
| **M-8 · The Standing Rule** | **Adapted** | Not a second band: the current stop is one right-flush word on the band's existing line 1, costing nothing against SC2's budget. |
| **M-9 · The Quiet Foot** | **Adopted** | The four foot blocks get rungs on the ladder and the band's line 2 prints the closing statement when she arrives — a sentence and a rung, not a new treatment and not a second ambient move. |
| **M-10 · Tempo Damping** | **Adapted** | No velocity threshold and no dwell — the 700ms jump lock that already measured clean damps programmatic scrolls, a two-frame agreement rule damps flings, and `settle()` plus `window.__lensSettled()` make both deterministic for the probe. |
