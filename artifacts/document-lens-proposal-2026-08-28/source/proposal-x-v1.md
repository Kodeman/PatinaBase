# Proposal X — The spine is the lens

*The Document · The Smart Lens · 2026-08-28. One proposal, argued from `research/31-verified-findings.md` and measured against `research/12-layout-measurements.json`. Every plank in `source/shared-planks.md` is adopted in the words it gives; where a plank is load-bearing here it is cited by SP-id.*

---

## 1 · Thesis

The paper's header is only true at the top of the paper. The rail is true across the whole document at once — and it costs no vertical pixels, because it is a column and the work is a column beside it. So the header stops being an instrument and goes back to being the top of a piece of paper: it says the job's name, its arc, and what needs her, and then it leaves and does not come back. The rail becomes the instrument — a drawn map of the paper's depth: where she is, how far each region runs, which ones carry trouble, where she has already been. Nothing on the paper is sticky at any offset.

> **The falsifiable sentence.** At 1440 the first region head lands at **378px** at rest, the condensed header band measures **0px** at every scroll offset, and the rail measures **71.4%** ink on a project spread and **60.8%** on a pre-work spread.

---

## 2 · What stays identical

The R126 register is the floor and X does not touch it. Named, so a judge can check.

**Type.** 40px Playfair letterhead title (`doc-letterhead.tsx:59`), 24px Playfair region heads (`region/region-head.tsx:128-134`), the five-step scale 40/24/18/15/14, the 11px mono floor. X introduces **no new size**. The rail's own registers stay exactly what `spine-running-index.tsx:97-114` already uses — a 13px label and an 11px mono value.

**Stock and ink.** Paper `#FCFAF6`, rail stock `#E8E3DB`, desk `#FAF7F2`, charcoal `#2C2926`, the muted ramp `#4E4339`/`#5A4E43`/`#65594E`, the `-ink` companions (clay `#7C5E30`, terracotta `#9C5340`, golden-hour `#79651E`, sage `#5F6B57`). No new pigment, no new tint family — F74 measured `#65594E` at 5.32:1 on rail stock against a 4.5:1 floor, so there is room for one small step and X does not spend it.

**Rules.** The three weights, unchanged: `--rule-hair` 1px at 10%, `--rule-mid` 1.5px `#2C2926`, `--rule-strong` 2px plus the hairline double (`region/region-rule.tsx:17-36`, recipe pinned by `region/__tests__/region-rule.test.tsx:59-74`). The ladder is drawn in these three and nothing else.

**Stamps and plates.** The filled stamps at ~1.18:1 tint with the 1.5px pigment border, the charcoal word, the −1.5° rotation. The six saturated stage tab plates. The 48px product crops on catalog-linked lines. All untouched.

**The wash.** The ink-pool hover wash exactly as R126 shipped it — `clip-path` circle from the pointer, 260ms in / 200ms out, `--ease-editorial`, the flat `-still` tint under reduced motion (`app/globals.css:327-349`). X adds no consumer beyond the two it has (`desk-roster.tsx`, `ffe-section.tsx`) — F149's rule that the ticket, spine and region heads carry no wash stays a rule.

**Organs X does not touch.** THE STUDIO desk block. The Record's contents (`previous-work.tsx`). The colophon's contents (`doc-colophon.tsx`). The FF&E line's own composition — name, vendor, stamp, crop, price. The approvals record list. The money region's six-rung ladder read. The `DocSheet` overlay grammar. The ⌘K palette. The Esc chain, which the probe confirms works (`probe/03-interactive-probe.md` §4).

**What was tempting and was left alone.** The needs-attention block's terracotta rule. F127 records that it is "nearly the only colour-coded signal on the first screen and a junior's eye correctly snaps to it". It is the loudest thing on the paper and the easiest thing to quiet. X quiets everything around it instead, and leaves the block itself at exactly its shipped weight.

---

## 3 · Lens mechanics table

Ten mechanics. `from→to` carries real values; `what never moves` is the layout promise the row makes.

| # | Trigger | What changes | from→to | Duration & easing | Reduced-motion equivalent | What never moves | F-ids |
|---|---|---|---|---|---|---|---|
| **X-1 The window travels** | scroll, rAF-throttled, written as `data-lens-window` outside React | the rail's reading window — a `--rule-mid` bracket in the ladder's gutter marking the extent of the paper currently in frame | top `166px → 421px`, height `68px → 146px` (both derived from the frame's share of the paper) | position-linked, 1:1 with scroll; no duration, no easing | the bracket **steps to segment boundaries** instead of tracking — a static bracket around the segment under the frame's midpoint, redrawn on settle only | the segment stack, every label, every value, the paper | F84, F111, F116, F22 |
| **X-2 The segment inks** | the window's midpoint entering a segment | that segment's label weight and its value's ink | weight `400 → 600`; value `--text-muted #65594E → --text-primary #2C2926` | `--duration-fast` 150ms, `--ease-editorial` | instant swap between the same two weights and the same two inks, at settle | the segment's y-position and its drawn height | F84, F102, F108 |
| **X-3 The passed mark** | the window's bottom clearing a segment's bottom | a 1px `--color-clay` rule appears in the segment's left gutter | height `0 → 100%` of the segment | 200ms `--ease-editorial` | the rule is printed at full height, instantly | the segment, the label, the value — the gutter is reserved at 3px from first paint | F111, F84 |
| **X-4 A region quiets** | its box leaves the viewport by ≥120px, after a 120ms velocity settle (X-10) | secondary strings and the body unmount; the head and one ≤40-char status line stay at full ratified ink; height goes to the region's data-derived reserve | FF&E on the specimen: `1,840px → 112px`; Money `430px → 112px`; a region with no standing exception `→ 68px` | **0ms — one commit, entirely off-screen** | identical; there is no transit to remove because there was never one on screen | every pixel inside the viewport, at any offset — the rule is that a region never changes height while any part of it is visible | F01, F11, F53, F47, F73 |
| **X-5 A region returns to full** | any part of its reserved box coming within 40px of the viewport | the body remounts at ratified weight; the status line withdraws into the head's own status slot | `112px → 1,840px`, one commit, off-screen | 0ms | identical | the viewport's contents; the reader's line | F01, F11, F39, F64 |
| **X-6 The head-line yields** | the region's own `[data-region-head]` entering the frame | the rail segment's name and value stop printing; the drawn extent, the exception tick and the passed mark stay | value string `"36 LINES · 4 ROOMS" → ""`; name `600 → 0 opacity-free removal` | 150ms crossfade, `--ease-editorial` | the strings are simply absent at settle — nothing fades | the segment's drawn height, so the ladder never reflows | F29, F102, F108, F10 |
| **X-7 The rail's act cell** | the region's head leaving the frame while its body is still in it | the region's one inked leader prints under the window as a scored word; withdraws when the head returns | `"" → "SPEC THE 3 UNSPECIFIED"` inside a permanently reserved 28px cell | 150ms crossfade, `--ease-editorial` | the word is present or absent at settle, no fade | the ladder below the cell — the 28px is reserved whether the cell prints or not | F141, F9, F49 |
| **X-8 The head-line swaps** | the needs band leaving the frame | the rail head's third line swaps subject | `"INSTALL SEP 15 · 3 WEEKS" → "OVERDUE 6 DAYS · PRIMARY BEDROOM"` | 150ms crossfade | instant swap at settle | the head's reserved 64px, at every offset and every state | F13, F50, F10, F56 |
| **X-9 The edited line takes weight** | `focusin` on an editable control inside a region body | that line's left rule and its own wash | rule `--rule-hair 1px @10% → 2px --color-clay`; the row's shipped wash holds open | 150ms `--ease-editorial` | the clay rule prints instantly; the wash is the flat `-still` tint R126 already ships | **the siblings** — no neighbouring row changes ink, tint, weight or position | F117, F164, F23 |
| **X-10 The lens settles** | scroll velocity below 40px per frame for 120ms | `data-lens-settled` on the shell root, and the single `aria-live="polite"` announcement | `false → true`; announcement `"" → "Pieces · 36 lines · 1 damaged"` | none — an arithmetic gate, not a move | identical; the gate is arithmetic and the announcement is text | everything — this row gates X-2 through X-8 and moves nothing itself | F105, F42, F118, F112, F51 |

**The one ambient move is still `doc-breath`** (`app/globals.css:271-283`), on the active StrataMark. It travels with the mark into the letterhead (§4, §8) and stays the system's only ambient motion. X names no second one.

**Zero hover-only affordances.** Every state above is a printed mark or a focus state. At 1180–1439 the segment labels return **on press**, never on hover (§4). F128 records that the shipped tree already has none; X adds none.

---

## 4 · Organ by organ

### The spine — `components/document/doc-spine.tsx`

**Before.** 200px at ≥1440. Put down · a horizontal row of seven StrataMarks · the active label pair · `spine-running-index.tsx`'s four-row list · `spine-timer.tsx` · a presence line. Measured: **54.9% ink** on the rich project spread, **13.9%** on pre-work, longest empty run **270px** (rich) and **657px** (pre-work); 8 interactive children at 1440 dropping to 3 at 1280 (F12, F21). F96 names the diagnosis: the top ~145px mixes four tenses — leaving, the whole arc, this minute, right now.

**After.** Five tenants, one tense: *where this paper is, and what is on it*.

1. **Put down** (44px). Stays exactly where it is. F126 records it as "the one control that costs the same at every state" — a genuine bright spot. It is true outside this document, which is why it earns the edge.
2. **The rail head** — a reserved 64px block, the same 64px at every scroll offset:
   ```
   Vandersteen
   PROJECT · PROCUREMENT & ORDERS 4 OF 6
   INSTALL SEP 15 · 3 WEEKS
   ```
   The third line swaps to `OVERDUE 6 DAYS · PRIMARY BEDROOM` the moment the needs band leaves the frame (X-8). This is X's lens line: it is vertical, it costs the work zero vertical pixels, and it is true at every offset by construction. It answers F13 (blocker) — below the fold the paper stops naming the job — without a sticky band.
3. **The ladder** — a 372px track, one segment per region, each drawn at its **true proportional extent**, separated by `--rule-hair`, with the reading window bracketing the frame's own share of the paper.

   The mechanic's named risk is that short regions become unclickably small. The arithmetic that answers it: every segment takes a **44px floor** first, and only the remainder is distributed by extent. Four project regions: `4 × 44 = 176` floor, `372 − 176 = 196` distributed. On the specimen, FF&E's 36 lines are ~70% of the paper's height → `44 + 0.70 × 196 = 181px`; Money's ~6% → `44 + 12 = 56px`. Every segment clears 2.5.8's 24px and every desktop segment clears 44px.

   Each segment prints a name, a ≤40-character value, and — when it carries one — a 6×2px `--color-terracotta-ink #9C5340` tick at its right edge. When the segment's own region head is in frame, the name and value **yield** (X-6): the paper is already saying them at 24px Playfair, and SP-08 rules one printing per fact per frame. The extent, the tick and the passed mark never yield — those are facts about the whole, which the paper cannot show her while she is inside one part of it.

   Sub-rungs: while Pieces is under the window, its four rooms print as indented rungs inside its own extent. That is the lens adjusting focus, and it is the home for the ticket's `Rooms` row at every scroll state.
4. **Kept with the job** — five doors below a `--rule-hair`: `Plan room` · `Spec book` · `Mood boards` · `Call sheet` · `The record`. These are the ticket's leaf and overlay rows, given a permanent home. F09 (high) says `BOARDS`, `DRAWINGS`, `SPEC` and `PEOPLE` vanish below the top; here they never vanish, at any offset, on any spread that has them.
5. Nothing else. The timer, the presence line and the seven-mark arc are evicted (below).

**Rail ink, computed.** 900px rail, `pt-6` 24 / `pb-24` 96:

| y | element | h | ink |
|---|---|---|---|
| 24 | Put down | 44 | ✓ |
| 80 | rail head | 64 | ✓ |
| 154 | `--rule-mid` | 2 | ✓ |
| 166 | the ladder track | 372 | ✓ (continuous) |
| 548 | `--rule-hair` | 1 | ✓ |
| 559 | Kept with the job, 5 × 32 | 160 | ✓ |

Ink = 44 + 64 + 2 + 372 + 1 + 160 = **643 / 900 = 71.4%** (today 54.9%). Longest empty run **96px**, the foot padding (today 270px). On a pre-work spread the track height is *fixed* and the segments divide it — a document with fewer regions gets **bigger segments, not a shorter rail** — so pre-work ink is 44 + 64 + 2 + 372 + 1 + 64 (two doors) = **547 / 900 = 60.8%** (today 13.9%), longest empty run 96px (today 657px). That single mechanism is the whole answer to F12.

**Where the evicted tenants go.**
- **The seven-mark arc → the letterhead.** It is the arc of the job, not the depth of this paper; a horizontal row inside a vertical column teaches the wrong axis. In the letterhead it sits on the vitals line, where it reads as *where the job is, and when* in one row. `doc-breath` travels with it (R15's site changes; §8).
- **The timer → the drawer, which already prints it.** F82 measured two In-hand clocks disagreeing in one frame — the rail card at `18 min` and the drawer at `IN HAND TODAY 1h 09m`. The drawer's is the one with the day in it. F26 records that `18 min` is the largest non-Playfair figure in the rail; removing it returns ~210px. SP-08 forbids the second clock.
- **The presence line → the account coin's own line in the drawer.** F137: `JUST YOU · VISIBLE TO THE STUDIO` is session metadata, not document structure. ~40px back.

**Mount-order consequence.** `doc-spine.tsx` keeps its position in `page.tsx:1780` and its `<aside>` root. Inside it, children 5 and 6 (`CompactSpineTimerDoorway`, the `SpineTimer` + presence wrapper at `doc-spine.tsx:143-154`) no longer mount. Child 2, the seven-mark `<ul>` (`doc-spine.tsx:64-120`), moves into `doc-letterhead.tsx`. Child 4's `shelved` slot (`doc-spine.tsx:141`) stops being gated at `min-[1440px]` and becomes the ladder at both desktop tiers.

### The header — the stack above the first region head

**Before, measured at 1440/s0** (`12-layout-measurements.json`, `rich.1440.s0`): letterhead 36→225.31 · ticket 243.31→590.56 (**347.25px**) · needs-attention 590.56→743.31 · instruments 747.81→791.81 · folded approvals seam 791.81→847.31 · schedule frame 847.31→949.81 · first `[data-region-head]` at **1005.31**, in a 900px frame. The header stack is **111.7%** of the viewport. One full letterhead-scroll later it is still 60.7% (F11).

**After.** Three blocks, none of them sticky.

| Band | X | px |
|---|---|---|
| `<main>` `pt-8` (`page.tsx:1791`) | unchanged | 32 |
| Letterhead `pt-3.5` | unchanged | 14 |
| `<h1>` 40px / 1.08 | unchanged | 43 |
| HouseholdChip `mt-1.5` + 23 | unchanged | 29 |
| **arc + vitals, one line** — seven `xs` marks (24px each, `doc-spine.tsx:103`) with the vitals baseline-aligned beside them | replaces the separate `lg` StrataMark row (34px, `doc-letterhead.tsx:53-55`) and the separate vitals row (21px) | 24 |
| Letterhead `pb-4` + `doc-rule-mid` | `pb-5`→`pb-4` | 18 |
| **letterhead subtotal** | | **128** (today 189.31) |
| `--doc-region-gap` | new token, §"region heads" | 24 |
| **The needs band** — `RedLetterZone` XOR `DocumentGuide` in one wrapper at a **reserved** height | 152px reserved from first paint, whichever branch renders and whether or not the query has resolved | 152 |
| `--doc-region-gap` | | 24 |
| Approvals section top → `RegionRule` 6 → head padding 8 | | 14 |
| **first `[data-region-head]`** | | **378** |

**SC1 = 378px** at 1440, at rest, scroll 0 — 42.0% of the frame, against today's 1005.31px and 111.7%. Recovery: **627px**.

Four moves get it there, and each is argued separately:

1. **The ticket dissolves** (M-7). −347.25px, the single largest recovery on the page. Its derivation survives untouched — `lib/document/ticket-derivation.ts:780-793` keeps producing the same eight rows and `ticket-derivation.test.ts` stays green — but nothing renders them as a table. Every row's destination is named in the SP-10 table below, and every destination is the rail, at every scroll state.
2. **The instruments become the letterhead's ledger.** −44px, and zero vertical cost, because the acts ride the title line's right column in exactly the two-track grid `region/region-head.tsx:118-121` already uses. It also fixes F100 and F136: two of the four acts address a client the letterhead says is not linked, and the ledger's own election drops an act with no subject.
3. **The needs band reserves its height.** F79 measured a 0.1189 layout shift firing 3.3–3.6s in, when the schedule banner arrives from a query — 92% of the page's whole CLS, present in both motion registers (F24). F154 says the guide and the red letter have different heights, so which one renders moves everything below it, per document. One reserved wrapper answers both. It also lets the band print a third exception as `+2 MORE — OPEN THE LEDGER` without changing height, which answers F50's silently-dropped third.
4. **The letterhead loses one of its two brand marks.** The arc carries the device and the stage in one row.

**H3 — what is at scroll 0.** The lens opens **open**. Arrival is worth something and the letterhead is the moment of it: the name, the household, the arc, the dates, the acts. It costs 128px, it happens once, and it leaves. F56 records that a returning reader is dropped at `[data-active-section]` and can land with `Chen Residence` already scrolled off; under X that landing is safe, because the rail head names the job at the offset she lands on.

**H4 — the one reversing act.** There is no lens line to reverse, because there is no lens line on the paper. The letterhead comes back the way a letterhead comes back: she scrolls up, or presses `Home`, or presses the rail head, which scrolls to 0. The state is readable without hover at every offset: the rail head is printed.

**H5 — zero layout shift.** Delivered by mechanism, not aspiration: (a) nothing on the paper is sticky, so no element's height can change while it is fixed over the reading line; (b) a region changes height **only while entirely out of frame** (X-4/X-5), so the words she is reading stay on the pixel they were on (SP-03); (c) the needs band's height is reserved before its query resolves (SP-03's *no block that can arrive late may render into unreserved height*); (d) the `--doc-seam-height` writer is retired, so the value that four consumers read cannot change mid-scroll (§9).

**Mount-order consequence in `page.tsx`.** `JobTicket` no longer mounts — `page.tsx:1829` and the `JobTicketMount`/`ProjectlessTicketMount` composition at `page.tsx:1714-1748` are deleted, and with them the sentinel `#doc-ticket-sentinel` (`job-ticket.tsx:347`) and the `ticket={jobTicket}` handoff to `worktable/table-frame.tsx:61`. `LetterheadInstruments` no longer mounts as a page-level sibling at `page.tsx:1863-1880`; it mounts inside `doc-letterhead.tsx` as the ledger column. `RedLetterZone`/`DocumentGuide` (`page.tsx:1838-1847`) mount inside one new `<div data-needs-band>` wrapper. Everything from `MobileMarginChips` (`page.tsx:1884`) down is unmoved, which matters: the `data-active-section` → `<SectionStageLineMount` window the 1500-character regex watches is not touched by the header work at all (§9 deletes the regex regardless).

### Region heads and spacing

**Before.** F73, measured button-to-button at every width and every scroll state: header-stack-end → `Schedule` **56px**, `Schedule` → `Pieces` **29px**, `Pieces` → `money-head` **6px**. Three answers to one question, on a set of seams that reads as one uniform list. The call-site table in `research/10-code-anatomy.md` §6 has the sharpest case: approvals open is `mt-6 … py-6` (`approvals/project-approval-document.tsx:588`) and approvals folded is a bare `<div data-index-region="approvals">` with no wrapper at all (`:565`) — folding a region silently changes the gap around it.

**After (SP-01).** One token, `--doc-region-gap: 24px`, owned by the region wrapper rather than the call site, identical whether the region is full, quiet or folded.

*Adopters:* the needs band · approvals (`project-approval-document.tsx:565` and `:588`) · the schedule frame (`schedule/schedule-rule-region.tsx:181`, `:199`) · the schedule ledger (`schedule/schedule-spine.tsx:1055-1060`) · FF&E (`ffe-section.tsx:1204-1210`, `:1290`) · money (`commercial/money-region.tsx:227-230`, `:248-251`) · the care band (`care-band.tsx:215`, `:235`, `:249`, `:303`) · the direction/proposal head (`page.tsx:2006`) · The Record (`previous-work.tsx:37`).

*Exceptions, with the reason each is one:* **the colophon** keeps `mt-14` (`doc-colophon.tsx:102`) because it ends the paper rather than seaming two regions — that gap is the bottom margin of a sheet; **FF&E's internal folio heads** (`ffe-section.tsx:1213`) use half the token, 12px, because a room is a sub-region and must read as inside Pieces, not beside it. Two exceptions, both structural. Everything else takes the token.

**R2 — reading-line density, precisely.** Two densities, not three. `full` is the ratified R126 weight with nothing withheld. `quiet` is the head plus one ≤40-character status line **at full ratified ink**, with the space to the region's reserved height left as bare paper (SP-12). There is no third level and no gradient, so there is nothing to interpolate and nothing to dim.

- Do **acts** print at reduced density? No — they do not print at all. A quiet region is entirely out of frame; its acts are unreachable by pointer at that moment anyway. The one act that matters — the region's inked leader — is carried by the rail's act cell (X-7).
- Do **exceptions** ever go quiet? Never. The ≤40-char line prints the exception first, and the rail's tick prints regardless of density.
- Does a **number** ever soften? No. F74 leaves room for one small step on the muted ramp and X does not spend it. Quieter means **fewer words**, never fainter ones (SP-12).

**R3 — folded-by-choice versus quiet-by-position, in a still (SP-02).** Four readings, four marks:

| Reading | Rule above | Head | Line | Verb | Gutter |
|---|---|---|---|---|---|
| **full** | `--rule-strong` double | 24px Playfair | status + up to two exceptions | `FOLD ↑` in the ledger | — |
| **quiet (by position)** | `--rule-strong` double | 24px Playfair, unchanged | the ≤40-char line, full ink | **none** | — |
| **folded (by her)** | `--rule-mid` single | italic name, mono summary | the fold summary | `UNFOLD ↓` | 2px `--color-clay` tick |
| **empty** | `--rule-strong` double | 24px Playfair | `NOTHING YET` | none | — |

And the mark that ends F54, F89 and F93 for good: X retires the latched derived default as a *fold* (it becomes the initial *density* instead, per E1 §3). After Wave 4 **a `FoldSeam` can only ever mean "you folded this"** — there is no shipped fold left to confuse it with. The clay tick is then a confirmation, not a disambiguation.

*The collision.* A region both folded by her and out of frame prints the fold seam, unchanged. Her fold outranks position (SP-07), the seam is what she left, and the rail's segment keeps printing its name and value because the paper is not showing them.

*The returning designer.* She folded Money three weeks ago; the key `patina:doc-fold:{docId}:money` outlived the session. She returns, the seam is there, the clay tick is beside it, and the rail's money segment prints `$17,500 OWED · 22 DAYS` at its true extent with a terracotta tick. The fact is on screen; only the body is closed, and it is closed because she closed it.

**Two printed forms for zero (SP-02, F156).** `NOTHING YET` — the region exists and is empty. `—` — the value is not knowable on this spread. Two forms, everywhere, replacing today's `no budget yet` / `NO DECISION LEAD · NO APPROVALS AUTHORED` / `No rooms yet` / `Nothing filed` / `Nobody on it yet`.

**Mount-order consequence.** None in `page.tsx`'s child order. Every change is inside a region's own wrapper element or in `region/region-head.tsx`. `region/__tests__/region-head.test.tsx:110-120` stays green: X does not collapse the head's two-track grid.

### The margin — `components/document/margin-rail.tsx`

**Before.** 232px sticky column at ≥1440. F17: at top, seam, mid and foot it prints the same seven chips in the same order — scrolled 2,000px into Pieces, nothing beside her is about pieces. F28: nine wrapped lines of first-touch prose, ~230px, above `IN THE MARGIN` and the first chip. F19: at 1280 the only affordance is a tab reading `MARGIN ←` with no count, indistinguishable from an empty margin.

**After.** The margin gets its room **vertically**, which is where it was actually cramped, and it starts moving.

1. **The first-touch note recedes for good.** −230px at every state after the first. It is already once-per-person (`margin-note.tsx:9-11`); X stops giving it 230px of permanent column while it waits to be seen. The chips start at y≈120 instead of y≈350.
2. **The margin lifts, it does not filter** (M-4 adapted). Two printed groups: **`BESIDE PIECES · 3`** — the items anchored to the region currently at full — then **`THE WHOLE JOB · 4`**. Nothing leaves; items rise and fall between two named groups as she moves. This is the room lens's own ruling — *lift, never filter* — applied to the margin, and it answers F17 without pinning anything to the paper.
3. **Empty is printed, not blank.** `NOTHING BESIDE PIECES YET` under the first heading. F19's ambiguity, one level in.
4. **The 1280 tab prints its count and its worst kind**: `MARGIN · 7 · 1 OVERDUE`. A printed count in a label, not a badge.
5. **Chips stop printing the same string twice** (F133) and stop printing seed copy (F160): `margin-item.tsx` suppresses a title identical to its own derived kind line.

**R4 — what the 232px holds versus the paper's gutter.** Sorted: *about a line in this document* → stays a chip, in the `BESIDE` group, anchored by the existing line-highlight wire (`margin-item.tsx:36-42`). *About the whole document* → the `THE WHOLE JOB` group. *Drafts, handoffs* → below both, unchanged, folded. *Presence* → leaves the margin entirely and goes to the drawer. X does **not** move chips onto the paper: a decision about the whole document has no line to point at, and `margin-item.tsx:46` carries one of the three legal `--elevation-sheet` sites, so a pin in the gutter would put a shadow on the paper.

**R5 — which tenses survive at rest.** At s0 the `BESIDE` group is empty and says so in one line; the `THE WHOLE JOB` group carries everything. At s2, editing an FF&E line, the `BESIDE PIECES` group carries the damage note and the PO chip and the column's top is about what her hands are on. The margin is the one organ that *gains* as the lens focuses, and what it gives back is order, not content.

**Mount-order consequence.** `MarginRail` stays where it mounts (`page.tsx:2316-2334`), still last in linear tab order (F132 — refused, §7). Inside `margin-rail.tsx`, item 1 (the first-touch note, `:462-468`) becomes conditional-once; items 9 and 10 (`{raised.map(renderItem)}` at `:634`, the settled fold at `:640`) are partitioned into two printed groups.

### Motion grammar

The whole grammar is §3's table. Three rules govern it:

**M2 — what may animate on a condense.** Ink, weight, and a reserved height. Never a layout property while the element is visible. X goes further than the rule requires: a region's height changes **only while it is entirely out of frame**, so the question of an acceptable visible layout shift never arises.

**M3 — hysteresis, at 4×.** A region leaves `full` when its box is **120px** clear of the viewport. It returns when any part of it is within **40px**. The band is **160px**. Why 160 and not less: at a 4× slow reading — a 40px-per-second crawl — the boundary is crossed once every four seconds, which is far outside any oscillation a reader could perceive as flicker; and a trackpad fling covers 160px in under 100ms, where the velocity gate (X-10) suppresses the transition entirely. Down and up are ruled separately and asymmetrically on purpose: leaving costs 120px because the cost of being wrong is a body unmounting; returning costs 40px because the cost of being wrong is a body mounting a fraction early, which nobody can see.

**M4 — the ambient budget stays one.** `doc-breath` on the active StrataMark, 3s, `app/globals.css:271-283`. It moves site with the mark, into the letterhead, which means it is now visible only at s0. X names no second ambient move and spends nothing on the rail's window, which is position-linked rather than time-linked and therefore not ambient at all.

**M5 — reduced motion is a form.** Every cell in §3 is a printed mark, an instant swap at settle, or a static rule. F30 records that no file under `components/document` imports `hooks/useReducedMotion.ts` and the Document's motion policy is CSS media queries only; X keeps it that way and adds exactly one new `@media (prefers-reduced-motion: reduce)` block, covering X-1's continuous window (it steps instead) and X-2/X-6/X-7/X-8's crossfades (they swap). F104 notes that none of the twelve existing blocks covers the ticket's pin/fold because it has no animation to reduce — X deletes the element rather than giving it one.

### The 1180–1439 tier

**Before.** A 56px column with a ~44px content box. F07 (0.95): `PUT` / `DOWN` wrapped, seven unlabelled glyphs, `Project` / `ACTIV` / `E` — broken mid-word — then `In hand` / `21m`. F21: 8 interactive children at 1440 drop to 3 at 1280. F32: the 390px phone sheet prints full words for all seven stages, so the phone is more legible than the "compact" desktop rail.

**After (SP-11, branch b).** The rail at 56px prints **no words at all**, and stops breaking any.

- **Put down** keeps its `←` glyph; the word does not print below 1440. One mid-word break gone.
- **The ladder prints, text-free**: the same 372px track, the same proportional segments, the same reading window, the same exception ticks, the same passed marks. It is the one tenant that survives without words, because its information is *drawn*, not written. Rail ink at 1280 = 44 + 2 + 372 + 1 + 160 = **579 / 900 = 64.3%**, against today's 24.0%.
- **Labels return on press**, never on hover: pressing any segment opens the same sheet the mobile spine already builds (`mobile/mobile-sheets.tsx:441+`), listing every segment with its name and value in full words. E1 §4 prices this branch at **days**; branch (a), widening the rail, is **weeks** and moves the paper's x-origin, which is the widest blast radius in the review.
- **The active caption is deleted** at this tier. Its information — which region she is in — is the window's position on the ladder, and pressing gives the word.
- **Identity at 1280** is the drawer's breadcrumb (below), because a 44px content box cannot hold `Vandersteen` and X will not break a word to pretend it can.

**The drawer carries identity below 1440.** `studio-drawer.tsx:120-130`'s `breadcrumbFor()` returns the literal `'Document'` for any `/doc` path. It becomes the household name. One function, present at every scroll offset, at every width ≥1180 — and it prints **only below 1440**, because at 1440 the rail head is already printing it and SP-08 allows one printing per fact per frame. F03's `Find anything` / `IN HAND TODAY` collision at 1280 is paid for in the same edit: the search zone drops to its `⌘K` glyph below 1440.

### 390

**Before.** F40: the first region head lands at y=1054 in an 844 frame — 124.9%. F14 (blocker): the spine sheet lists only the seven stages, so `Client approvals`, `Schedule`, `Pieces` and `Money` appear nowhere and reaching Pieces means scrolling ~1,050px. F97: the eight ticket rows exist only after a tap on `UNFOLD ↓`. F48: five money chips take 29.6% of the frame. F121: chips estimated at ~21–26px against 2.5.8's 24px floor.

**After.** The same lens, one column.

- **The lens line is the mobile bar's left zone.** `mobile/mobile-bar.tsx:226-232` already prints `In this document` over a context word inside a 64px bar. The context word becomes the same two strings the rail head prints: `Vandersteen · Pieces`. Same words at 390 as at 1440 — which is what axis 7 asks for and what F13 needs at the one width where there is no rail.
- **The spine sheet becomes the ladder.** The same segments, the same names, the same ≤40-character values, the same exception ticks, drawn full-width. That is F14 answered and F94 with it, and it costs one component's body because the sheet already renders a list.
- **The ticket is gone**, so F97's extra tap is gone with it, and the header at 390 drops from 1054px to a computed **453px** of 844 (53.7%) — letterhead 155 (no arc at 390; the seven stages are the sheet's own list) + gap 24 + needs band 200 reserved + gap 24 + rule and padding 14, from a 36px top.
- **Margin chips sort the same way the margin does.** The line-anchored ones stay beside their line; the whole-job ones move into the sheet under `THE WHOLE JOB · 4`. F48's 250px of unanchored money chips becomes one anchored chip and a counted heading. Chip padding goes from `py-[0.32rem]` to `py-1.5` (`mobile/mobile-margin-chips.tsx:98`, `:114`), clearing 24px.
- **`Put down` gets its own row** at the top of the sheet rather than living behind More (F106).
- **Every sheet gets a name.** `mobile/mobile-sheets.tsx:260` sets `aria-label` only for `kind === 'timer'`; the `drawer`, `spine` and `margin-item` kinds get theirs (F43).

**Mount-order consequence.** None at the page level; `MobileBar` and `MobileSheets` keep their positions in `app/(document)/layout.tsx:92-93`.

---

## 5 · The lens state machine

Five states. Every transition carries its reverse, its focus destination and whether it announces.

### at rest
- **Lens line:** rail head, 64px — `Vandersteen` / `PROJECT · PROCUREMENT & ORDERS 4 OF 6` / `INSTALL SEP 15 · 3 WEEKS`.
- **Rail:** full ladder; the window brackets the top of the track; no segment marked passed.
- **Regions:** the topmost region intersecting the frame is `full`; every region below the fold is `quiet`.
- **Margin:** `IN THE MARGIN` head, `BESIDE —` (empty, printed), `THE WHOLE JOB · 4`.
- **Entry:** arrival at scrollY 0; `Home`; pressing the rail head.
- **Exit:** any scroll past 1px.
- **Reverse:** scrolling back to 0 restores it exactly. Nothing about this state is persisted, so there is nothing to restore wrongly.
- **Focus:** unchanged by the transition. **Announces:** no.

### reading
- **Lens line:** unchanged 64px; the third line has swapped to the worst standing exception once the needs band left the frame (X-8).
- **Rail:** the window tracks the frame; the current segment's name and value have yielded (X-6); passed segments carry their clay gutter rule.
- **Regions:** every region intersecting the frame is `full` — at 1440 that is one or two, never more, never zero. Every other region is `quiet`.
- **Margin:** the `BESIDE {region}` group carries the items anchored to the region under the window.
- **Entry:** a region's box intersecting the viewport (or coming within 40px of it).
- **Exit:** its box leaving the viewport by 120px, after a 120ms settle.
- **Reverse:** the box coming back within 40px, immediately, with no settle — returning is never damped, because a reader scrolling back is looking for something.
- **Focus:** never moved by a scroll-driven transition. A region whose subtree contains `document.activeElement` is **held at `full`** regardless of position — the observer reads `region.contains(document.activeElement)` before it quiets anything. This is why X has no focus destination to name: no transition in X unmounts the element focus is in (SP-06).
- **Announces:** once, on settle, in one `aria-live="polite"` region attached to the rail's window: `Pieces · 36 lines · 1 damaged` (SP-14).

### editing
- **Lens line:** unchanged. **Rail:** unchanged, except the act cell yields — while she is editing, the rail offers nothing.
- **Regions:** the edited region is held at `full` and cannot quiet at any scroll offset. Its siblings behave exactly as in `reading` — X has one dimming system and it is none: the edited line gets **more** ink, its siblings get none taken away (M-6 as ink weight only).
- **Margin:** the `BESIDE` group holds; new chips do not reorder while a control has focus.
- **Entry:** `focusin` on an editable control inside a region body.
- **Exit:** `focusout` with no editable control taking focus, or commit.
- **Reverse:** the clay rule returns to `--rule-hair` over 150ms; the wash closes over 200ms, exactly as it does today.
- **Focus:** by definition, held. **Announces:** no — an edit is her act and needs no narration.

### condensed
- **Lens line:** unchanged 64px. **Rail:** the segment for this region draws at its true extent and prints its name and value, because the paper is not showing them.
- **Region:** head at 24px Playfair, one ≤40-char line at full ink, bare paper to the data-derived reserve (68px, or 112px with a standing exception). No verb, no seam, no italic.
- **Margin:** its anchored chips drop out of the `BESIDE` group into `THE WHOLE JOB`; the count on each heading changes.
- **Entry:** the box 120px clear of the viewport, after a 120ms velocity settle.
- **Exit:** any part of the reserved box within 40px of the viewport.
- **Reverse:** stated above; also reachable in one act from the rail — pressing the segment scrolls to it, which brings it into frame, which returns it to `full`.
- **Focus:** cannot be inside it, by the guard above. **Announces:** no — only the arrival state announces, and only on settle.

### mobile
- **Lens line:** the mobile bar's left zone, the same strings, inside `min-h-[64px]` (`mobile/mobile-bar.tsx:156`).
- **Rail:** the spine sheet, on demand, drawing the same ladder full-width.
- **Regions:** identical rules, with the 120/40px thresholds measured against the 844px frame.
- **Margin:** anchored chips beside their lines; whole-job items in the sheet under a counted heading.
- **Entry:** viewport below 1180 (`doc-spine.tsx:44`, `margin-rail.tsx:258`).
- **Exit:** viewport at or above 1180.
- **Reverse:** the sheet closes and the rail draws the same ladder at the same position — the position is derived from scroll, never stored, so there is nothing to hand across the breakpoint and nothing to lose. F14's blocker is the same component in both directions.
- **Focus:** the sheet takes and returns focus through the existing managed-modal path. **Announces:** the same single live region.

---

## 6 · Frame budget

Against `research/12-layout-measurements.json`. Buckets are the file's own 1-pixel-row partition: **chrome** (studio drawer / mobile bar, plus the pinned seam while it is the collapsed sticky band) → **header/summary** → **active region** → **other**.

### 1440 × 900, rich project spread

| State | Today chrome / header / work / other | X target chrome / header / work / other | What moved |
|---|---|---|---|
| s0 | 6.7 / **81.8** / 0.0 / 11.6 | 6.7 / **31.1** / **52.9** / 9.3 | ticket −347px; instruments −44px; letterhead −61px |
| s1 | 6.7 / **60.7** / 10.4 / 22.2 | 6.7 / **16.9** / **71.2** / 5.2 | the needs band is the only header left, and it is 152px |
| s2 | **13.9** / 0.0 / 86.1 / 0.0 | **6.7** / 0.0 / **93.3** / 0.0 | the 64px seam is gone from chrome; the frame is the work |
| s3 | **13.9** / 0.0 / 50.9 / 35.2 | **6.7** / 0.0 / **58.1** / 35.2 | the seam's 65px only |

### 1280 × 800 tier, and 390 × 844

| Cell | Today | X target |
|---|---|---|
| 1280 s0 | 6.7 / 81.8 / 0.0 / 11.6 | 6.7 / 31.1 / 52.9 / 9.3 (the paper is identical at both desktop widths) |
| 1280 s1 | 6.7 / 60.7 / 10.4 / 22.2 | 6.7 / 16.9 / 71.2 / 5.2 |
| 1280 s2 | 13.9 / 0.0 / 86.1 / 0.0 | 6.7 / 0.0 / 93.3 / 0.0 |
| 1280 s3 | 13.9 / 0.0 / 50.9 / 35.2 | 6.7 / 0.0 / 58.1 / 35.2 |
| 390 s0 | 9.1 / 71.0 / 0.0 / 19.9 | 9.1 / 42.1 / 38.9 / 9.9 |
| 390 s1 | 9.1 / 48.5 / 0.0 / 42.4 | 9.1 / 23.7 / 57.3 / 9.9 |
| 390 s2 | 16.8 / 0.0 / 83.2 / 0.0 | 9.1 / 0.0 / 90.9 / 0.0 |
| 390 s3 | 16.8 / 0.0 / 26.2 / 57.0 | 9.1 / 0.0 / 33.9 / 57.0 |
| prework 1440 s0 | 6.7 / 79.9 / 2.8 / 10.7 | 6.7 / 29.6 / 54.4 / 9.3 |
| prework 1440 s1 | 6.7 / 59.0 / 27.7 / 6.7 | 6.7 / 15.2 / 72.9 / 5.2 |
| prework 1440 s3 | 13.9 / 0.0 / 66.8 / 19.3 | 6.7 / 0.0 / 74.0 / 19.3 |

### The four criteria

| # | Criterion | Threshold | X target | Basis |
|---|---|---|---|---|
| **SC1** | first `[data-region-head]` y at 1440, at rest, scroll 0 | ≤ **405px** (today 1005.31) | **378px** (42.0% of 900) | the band table in §4: 32 + 128 + 24 + 152 + 24 + 14 = 378 |
| **SC2** | condensed header band height at 1440 | ≤ **108px** | **0px**, at every scroll offset | nothing on the paper is `position: sticky`; `job-ticket.tsx` is deleted and its `sticky top-0 z-[4]` (`:362`) with it |
| **SC3** | lens-line height at scroll 0 / 400 / 1200 | ≤ **64px**, and the same number at 400 and 1200 | **64 / 64 / 64** | the rail head is a reserved 64px block, not a measured one; nothing about it is scroll-driven, so drift is impossible rather than merely unlikely |
| **SC4** | rail utilisation `inkPx / railHeightPx` at 1440 | ≥ **70%** project (today 54.9%), ≥ **55%** pre-work (today 13.9%) | **71.4%** project, **60.8%** pre-work | the rail budget table in §4; the mechanism is the fixed-height track that segments divide |

**Where a claim moves on the specimen.** The seed carries 3 FF&E lines and 0 rooms (F05). On the Vandersteen's 36 lines across 4 rooms, the paper is roughly 2.4× taller, which moves X's numbers in one direction and one only: **the recovery gets larger**. SC1 does not move at all — it is measured above the first region head and nothing above it is data-dependent except the needs band, which is reserved. SC4 moves up: the ladder's segments carry room sub-rungs under Pieces, so the track's ink density rises. The one number that moves against X is s2's `activeRegion` share, which F91 already flags as over-counted today (433 of 775px at rich/1440/s2 is empty-state prose, not the FF&E schedule) — on the specimen that 433px is real work.

**A target this brief names that X argues is wrong.** SC11 asks for *exactly one* region at `full` at any offset. X refuses that number, because a design where a region's height never changes while any part of it is visible must hold every region touching the frame at `full` — and at 1440 that is one or two. The replacement, with the reason: **every region intersecting the frame is `full`; every region not intersecting is `quiet`; never more than two, never zero.** SC12 follows: the rail's `data-reading-index` names the region under the window's midpoint, and is never null while the paper is in view.

---

## 7 · Findings addressed

Every verified **blocker** and **high** in `research/31-verified-findings.md`. Answered, or refused with a reason.

### Blockers

| id | Answer |
|---|---|
| F01 | Answered. First head 1005.31 → **378px**; the 347.25px ticket dissolves, the 44px instruments row moves into the letterhead's ledger, the letterhead sheds 61px. |
| F04 | Answered by deletion. There is no pin and no seam, so there is no 283.19px single-frame jump. The `--doc-seam-height` writer is retired (§9). |
| F06 | **Refused.** "Everything in install" is a question about the studio's six live jobs, not about this paper. NG1 forbids a cross-document surface over an open document, and the rail is a map of *this* document. It belongs on the desk, and X does not smuggle it in. |
| F13 | Answered. The rail head prints `Vandersteen` at every offset at ≥1440; the drawer's breadcrumb prints it below 1440; the mobile bar's left zone prints it at 390 (SP-09). |
| F14 | Answered. The 390 spine sheet becomes the same ladder, with the same segment names and values, so `Client approvals`, `Schedule`, `Pieces` and `Money` are one tap and one press away. |
| F15 | Answered. At 1280 the rail prints no words at all rather than broken ones, and the ladder is drawn (SP-11 branch b); labels return on press. |
| F34 | Answered by removal. No seam exists to change height during a smooth scroll. Every `[data-index-region]` lands against a constant `--doc-landing-clear: 4rem`, resolved once and unable to change. |

### Highs

| id | Answer |
|---|---|
| F07 | Answered — `PUT`/`DOWN` and `Project`/`ACTIV`/`E` both stop printing at 1280; the rail is text-free there. |
| F08, F41 | Answered. A scroll-driven change never moves focus, and a region containing `document.activeElement` is held at `full` and cannot quiet. For the explicit `Fold ↑`, focus parks on the newly-rendered `FoldSeam` — the mirror of `focusRegionHeading`'s already-correct unfold (`region/fold-seam.tsx:41-44`). |
| F09 | Answered. `Drawings`, `Spec`, `Boards` and `People` become permanent doors in `Kept with the job` on the rail, present at s0, s1, s2 and s3. |
| F10 | Answered by the yielding rule (X-6) and SP-08: money is printed by the needs band at s0, by the money region's head when that head is in frame, and by the rail's money segment at every other offset — one printing per frame, never five. |
| F11 | Answered. At s1 the header/summary share falls from 60.7% to 16.9% — the needs band is the only header block left. |
| F12 | Answered. Pre-work rail ink 13.9% → 60.8%; longest empty run 657px → 96px. The track's height is fixed and the segments divide it (SP-05). |
| F16 | Answered in Wave 5: the four pre-work spreads get real region wrappers in `page.tsx` and real heads, so the ladder has something to index. This is the most expensive thing X asks for and it is priced as `weeks` (§9). |
| F17 | Answered. The margin lifts: a `BESIDE {region}` group whose membership changes as she descends, above a `THE WHOLE JOB` group. |
| F18 | Answered. The 1280 sheet's body no longer reprints `IN THE MARGIN` 200px below the sheet header that already says it. |
| F19 | Answered. The tab prints `MARGIN · 7 · 1 OVERDUE`. |
| F20 | Answered. The eight rows of absence are gone from the proposal spread with the ticket; the pre-work ladder prints four named segments, one of which reads `Design vision —`. |
| F21 | Answered. The ladder, the window, the ticks and the passed marks all print at 1280; interactive children rise from 3 to the segment count plus the doors. |
| F22 | Answered — this is the whole point of the ladder. Extent is drawn, trouble is a terracotta tick, distance is the window's gap to the next tick, position is the window. |
| F23, F62, F63, F65 | **Refused as composition.** PO acknowledgement state and damage-claim filing are Orders-and-Receiving acts. X does not add capability (brief A.0) and will not fake a door. What X does change: the FF&E segment's ≤40-char line carries `1 DAMAGED` and its tick is terracotta, so the fact is on the rail at every offset even when the line is out of frame. |
| F24, F79 | Answered. The needs band reserves 152px from first paint, so the 0.1189 shift at 3.3–3.6s — 92% of the page's CLS in both motion registers — has nowhere to land. |
| F35 | Answered by not depending on it. X uses no `animation-timeline`, no `@property`, no `content-visibility`. Its only browser dependence is `IntersectionObserver` and `ResizeObserver`, both already in this tree. A real `browserslist` is added in Wave 0 anyway. |
| F36 | Answered. Wave 0 deletes the 1500-character regex at `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` — which today passes on a comment at 162 characters, not on the structure — and replaces it with a rendered-DOM assertion. |
| F38 | Answered. Wave 0 adds the Playwright assertion E1-05 asks for: after a rail-segment press, the landed head's top sits within 4px of `--doc-landing-clear`. |
| F39, F64 | Answered per E1 §3: `forceOpen` stays supreme; `explicit` stays a hard fold and outranks position; `latchedDefault` becomes the region's initial **density**, not its initial fold; scroll becomes a fourth, lowest, non-persisting voice that may only move `full ⇄ quiet`. Scroll position never writes `patina:doc-fold:{docId}:{region}` (SP-07). |
| F40 | Answered. 390's first head 1054px → 453px of 844. |
| F42, F118, F105 | Answered. One `aria-live="polite"` region on the rail's window, announcing once at settle. The 283px silent collapse is deleted with the ticket. |
| F43 | Answered. `drawer`, `spine` and `margin-item` sheet kinds get `aria-label`s. |
| F44 | Answered by removal. The seam's content-dependent measured height no longer exists; the rail head's 64px is reserved, not measured. |
| F45 | Answered. The 700ms jump lock is kept and extended: for its duration it also freezes every region at `full` and pins the ladder's window at the target, so a landing is computed once and cannot be moved by a density change mid-flight. |
| F46 | Answered. There is one schedule door — the rail's schedule segment — and one schedule head on the paper. The `Schedule dates UNFOLD ↓` sub-seam 200px above the head becomes the region's own quiet form under the one head. |
| F47 | Answered. The top band at s0 asks her to hold: the job's name, the household, the arc, the dates, and the two things that need her. Six, against the twenty F47 counted literally. |
| F48 | Answered. Anchored chips stay beside their line; the rest move into the sheet under a counted heading. |
| F49 | Partly answered. The header above the FF&E body at 390 drops by ~600px, so the first line moves up correspondingly. The empty-state prose between the head and the first folio (`Plan the project work`, `ADD THE FIRST TASK`, `FOLIO + FILE`) is untouched — F91 measures it at ~433 of 775px and X does not compose it away. |
| F50 | Answered. The needs band prints a third exception as `+2 MORE — OPEN THE LEDGER` inside its reserved height, and the rail's ticks mark which regions carry the rest. Nothing is dropped whole. |
| F51, F112 | Answered. The sentinel observer is deleted with the ticket. The density observer runs `threshold: [0, 1]` with a 120px/40px hysteresis band and the X-10 velocity gate, and its down and up rules are stated separately (§4, M3). |
| F52 | Answered by deletion — there is no pin, so no scroll gesture relocates focus. |
| F53 | Answered without new machinery. A quiet region's body unmounts, exactly as a fold does today, so the fold's render-cost role is preserved rather than replaced. X does **not** adopt `content-visibility: auto`, so E1-08's stacking-context threat to the R126 wash never arises. The cost of this choice is named in §11. |
| F54, F59, F89, F93 | Answered. The latched derived default stops producing folds, so after Wave 4 a `FoldSeam` can only mean "you folded this"; the clay gutter tick confirms it; and the quiet form has no verb and no italic, so it cannot be mistaken for a seam. |
| F55 | Answered. The seven marks leave the rail for the letterhead, where a horizontal arc belongs, and the rail's vertical axis then means exactly one thing: depth in this paper. |
| F56 | Answered. A returning reader dropped at `[data-active-section]` lands with the rail head printing `Vandersteen` and the ladder showing where in the paper she was dropped. |
| F58 | Answered. The 1280 tier gains the ladder, the ticks and the passed marks (rail ink 24.0% → 64.3%) rather than losing 66,120px² of anchored chips for 48px of measure. |
| F60 | Answered by removal. R99's zero-shift mechanism is no longer needed at the header, because nothing at the header pins. |
| F66 | **Refused as composition.** The margin's card kinds are a data question — the derivation produces Money and Time rows and no others. X sorts and counts what exists; it does not invent a PO card. |
| F67 | **Refused as out of evidence.** No probe or shot exercises the Orders ledger sheet's round trip, so X has nothing to design against. Named for the record; Wave 0's Playwright pass is where it would be settled. |

---

## 8 · Canon note

Named, for the record. Not priced (instruments §5).

| id | Quote (≤25 words) | What it becomes |
|---|---|---|
| **I149** | "new `job-ticket.tsx` (eight rows: Rooms · Pieces · Drawings · Spec · Boards · Money · Dates · People), sticky two-line seam on scroll" | The eight rows keep their derivation (`ticket-derivation.ts:780-793`) and lose their table. The sticky seam is retired; every row's home is the rail at every scroll state. |
| **I136** | "running index (≥1440px only, four Project regions indexed, IntersectionObserver reading line)" | The running index becomes the ladder: proportional extents, a window rather than a line, on all seven spreads and at both desktop tiers. |
| **I137/C11** | "The running index is derived from the paper order, not declared beside it… `PROJECT_PAPER_ORDER`… approvals → schedule → ffe → money" | The law survives; the array becomes a per-section order table so the four pre-work spreads have one too. The Record stays at the foot. |
| **R99** | "pins beneath the project title on scroll at reduced height (labels fold into the line; diamonds and the today rule remain)" | Nothing on the paper pins. The schedule's glance stops offsetting itself by `--doc-seam-height` because there is no seam to stand under. |
| **R15** | "one slow ~3s opacity swell on the *active* spine marker only" | Unchanged as a rule and as a duration; its **site** moves with the marker into the letterhead, so the one ambient move is now visible at s0 only. |
| **R27** | "'View as the clients', 'Send a note', 'The scan' as one quiet DM-mono row under the letterhead subtitle" | The row becomes the letterhead's ledger column, in the same two-track grid a region head already uses — same words, same mono, zero vertical cost. |
| **D8** | "Studio Drawer persistent on every screen; ledger sheets open as collapsed-by-default overlays, no badges/pulsing counts" | The drawer's breadcrumb prints the household below 1440 and keeps the one in-hand clock. The margin **tab** gains a printed count — a word in a label, not a badge on the drawer. |
| **I148** | six-rung money ladder "Budget · Plan · Authorized · Moved · Owed · Not drawn" shelved on the spine | The rail prints the current rung only, as the money segment's ≤40-char value. The six-rung read lives in the money region's own head, where the acts are. |
| **D3/I21** | "Mobile: margin items collapse to anchored chips, spine becomes a bottom sheet" | Both stand. The bar's left zone additionally becomes the lens line, and the sheet's body becomes the ladder. |

### The four no-gos, and the mechanism that leaves each untouched

**NG1 — one document at a time.** The ladder is built from `[data-index-region]` roots found inside this page's own `<main>` by a `MutationObserver` scoped to `mainRef` (`page.tsx:1788`). It has no query for another engagement, no route that opens a second paper beside this one, and no peek state. Its doors either scroll within this paper or navigate away entirely through the existing shelf routes. `Esc` / Put down remains the only exit, and X leaves both handlers exactly as the probe measured them working (`probe/03-interactive-probe.md` §4).

**NG2 — the shadow budget.** X declares no `box-shadow`, no `filter: drop-shadow`, and adds no `.doc-elevated` consumer; the three sites stay `studio-drawer.tsx:289`, `margin-item.tsx:46`, `overlays/doc-sheet.tsx:371`. The mechanism that makes this safe rather than merely intended: the rail's separation from the paper is the `border-r border-[var(--color-pearl)]` it already carries (`doc-spine.tsx:44`) plus the `--doc-rail-stock #E8E3DB` / `--doc-paper #FCFAF6` value step, and the ladder is drawn entirely in `--rule-hair` and `--rule-mid`. And X **removes** the one surface that would have wanted depth — a floating seam over the paper — rather than negotiating for it. `lib/document/__tests__/shadow-gate.test.ts` runs unchanged on every wave.

**NG3 — no Thumb Index.** The ladder is one continuous track whose segments are drawn at unequal, data-derived heights, carrying no letters, no alphabet and no per-page jump stops. A thumb index is a strip of equal, labelled tabs indexing positions in a book; this is a scaled elevation of one document's own regions, with exactly as many marks as the paper has regions — four on a project spread, four on a proposal.

**NG4 — the R126 register is the floor.** Every mark X draws is a token already declared in `app/globals.css`: `--rule-hair`, `--rule-mid`, `--rule-strong`, `--text-muted #65594E`, `--text-primary #2C2926`, `--color-clay`, `--color-terracotta-ink #9C5340`. No size enters the 40/24/18/15/14 scale; the mono floor stays 11px; the stamps, tab plates, crops and the hover wash are untouched; the only colour X adds anywhere is a 6×2px tick and a 1px gutter rule — small, state-carrying, exactly where Kody's taste puts it. `lib/document/__tests__/contrast.test.ts` gates the rail's inks and stays green; Wave 0 turns its hard-coded five-filename scan into a glob **before** any spine file is renamed, so it cannot silently stop testing. THE STUDIO desk block appears in no file in §9.

---

## 9 · Engineering path

Six waves. Each is valuable alone and each is separately revertable. This path agrees with `research/29-panel-e1.md` except at one point, named at the end.

### Wave 0 — Two tripwires and a probe (days)

Before anything else, because both fail silently.

- **The regex.** `src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` — delete `/data-active-section[\s\S]{0,1500}?<SectionStageLineMount/`. E1 measured it: the real attribute at `page.tsx:1942` is 1128 characters from the mount at `:1964` (372 of headroom, not 600), and the test currently passes on a *comment* at `page.tsx:1962` that contains the literal `data-active-section>`, 162 characters away. Replace it with the assertion it means: render the page and assert `SectionStageLineMount` is the first element child of `[data-active-section]`. The three companions at `:15-17`, `:21-23` and `:24-27` are order-and-content assertions and survive.
- **The gate that stops testing.** `src/lib/document/__tests__/contrast.test.ts:313-341` hard-codes five filenames. Turn the list into a glob over `components/document/spine*.tsx`, `components/document/spine/**/*.tsx` and `components/document/margin-rail.tsx`, so Wave 2's new file is scanned the day it lands.
- **The landing assertion nobody has.** Add one Playwright case in `e2e/document/quiet-responsive-shell.spec.ts`: after pressing a rail segment, the landed head's `top` is within 4px of the landing clearance. F38 records that every seam assertion is jsdom and jsdom has no layout.
- Add a `browserslist` key to `apps/designer-portal/package.json` (F35 — today the only declared matrix is `playwright.config.ts:54-68`, which enables webkit).

**Rollback:** revert three test files and one package.json key. No product code.

### Wave 1 — The rail earns its column (days)

Evict, and put identity where it can be read.

- `src/components/document/doc-spine.tsx` — remove children 5 and 6 (`spine-timer.tsx:61`'s compact doorway, the `SpineTimer` + presence wrapper at `:143-154`).
- `src/components/document/spine-timer.tsx` — the in-hand clock leaves the document rail. F82's two disagreeing clocks become one.
- `src/components/document/studio-drawer.tsx:120-130` — `breadcrumbFor()` returns the household for `/doc/*`, and the crumb renders **only below 1440**; the search zone drops to its `⌘K` glyph below 1440 (F03).
- `src/components/document/mobile/mobile-bar.tsx:226-232` — the context word becomes `{household} · {region}`.
- `src/components/document/margin-rail.tsx:227-228` — the tab prints its count and worst kind; `margin-note.tsx` first-touch stops holding 230px of permanent column.

**Tests:** rewrite `src/components/document/doc-spine.test.tsx:25-28` and `:43-46`; rewrite the timer-visibility split in `src/components/document/__tests__/responsive-document-shell.test.tsx:215-219`; rewrite `e2e/document/quiet-release-contracts.spec.ts:188-190` (`data-spine-timer-regime`) and `src/components/document/mobile/mobile-timer-sheet.test.tsx:250-257`. Gates green: `shadow-gate.test.ts`, `contrast.test.ts`.
**Rollback:** revert five components and their tests; nothing else reads them.
**Value alone:** F13 answered at every width, F19, F26, F31, F82, F137, F03.

### Wave 2 — The ladder (week)

- **New:** `src/components/document/spine/lens-ladder.tsx` — the track, the segments, the window, the ticks, the passed marks, the act cell. It reads extents from the region roots through one `ResizeObserver` and writes `data-lens-window` imperatively.
- `src/components/document/spine-running-index.tsx` — **deleted**; its reading-line mechanic (`:76-82`) becomes the window.
- `src/components/document/spine-shelved-blocks.tsx` — keeps its job of feeding values, loses its list rendering.
- `src/hooks/use-document-running-index.ts` — the query-with-retry attach (`:120-133`, 8 × 250ms ≈ 2s) is replaced by a `MutationObserver` on `<main>`, so a region mounting after the window is still observed (E1-09, F75). **The `-20% 0px -62% 0px` band (`:34`) is retired**: X's window is the frame itself, so the observer's rootMargin becomes `0px` and the two thresholds are the 120px/40px hysteresis on the region box (§4, M3). **The 700ms jump lock (`:35`, `:166-180`) is kept and widened** — for its duration it holds every region at `full` and pins the window at the target, which is the freeze SP-04 requires, applied to the only thing X has that can move. `scrollToRegion` (`:202-222`) stays exactly one copy.
- `src/lib/document/document-index.ts` — `PROJECT_PAPER_ORDER` (`:36-57`) becomes a per-section order table; `regionHeadingId` (`:93-102`) keeps throwing on an undeclared key.

**Tests:** rewrite `src/components/document/__tests__/shelved-spine.test.tsx:82-98`, `:217-236`, `:238-262`; rewrite `src/components/document/doc-spine.test.tsx:43-46`. Gates green: `shadow-gate.test.ts` (the ladder is rules), `contrast.test.ts` (now globbing, per Wave 0).
**Rollback:** the ladder mounts behind `lens-ladder` in the `shelved` slot; reverting restores `spine-running-index.tsx` from git and the slot renders the old list.
**Value alone:** F12, F21, F22, F55, F58, F84, F102, F111, F116, F130.

### Wave 3 — The ticket dissolves, the header yields (week)

- `src/components/document/job-ticket.tsx` — **deleted**, with the sentinel (`:347`), the `IntersectionObserver` (`:218-228`), the `setFold(null)` pin effect (`:235-242`) and the `--doc-seam-height` publication (`:248-259`).
- `src/lib/document/ticket-derivation.ts` — **unchanged**. It keeps deriving the eight rows; the ladder and the letterhead consume them.
- `src/app/(document)/doc/[id]/page.tsx` — the ticket mount (`:1829`) and its composition (`:1714-1748`) go; the needs-band wrapper appears around `:1838-1847`; `LetterheadInstruments` (`:1863-1880`) moves into the letterhead.
- `src/components/document/doc-letterhead.tsx` — takes the seven-mark `<ul>` and the instruments ledger; sheds the `lg` StrataMark (`:53-55`); `pb-5` → `pb-4`.
- `src/components/document/letterhead-vitals.tsx` — the vitals line shares its row with the arc.
- `src/components/document/red-letter-zone.tsx` and `document-guide.tsx` — both render into one reserved-height wrapper; the red letter's "no outer margin at all" (`red-letter-zone.tsx:85-88`) and the guide's `my-5 … py-4` (`document-guide.tsx:75`) both become `--doc-region-gap`.
- `src/app/globals.css` — declare `--doc-region-gap: 24px` and `--doc-landing-clear: 4rem`; `:1026` (the schedule glance's `top`) is deleted; `:1034` and `:1037` read `--doc-landing-clear`; add `scroll-margin-top` to the child landing targets F120 names (ticket-row successors, Fold buttons, FF&E line controls).
- `src/components/document/commercial/money-region.tsx:48` — `SEAM_CLEARANCE` reads `--doc-landing-clear`.
- Region wrappers take the token: `approvals/project-approval-document.tsx:565`, `:588` · `schedule/schedule-rule-region.tsx:181`, `:199` · `schedule/schedule-spine.tsx:1055-1060` · `ffe-section.tsx:1204-1210`, `:1213`, `:1290` · `commercial/money-region.tsx:227-230`, `:248-251` · `care-band.tsx:215`, `:235`, `:249`, `:303` · `previous-work.tsx:37` · `region/region-head.tsx` (the wrapper gains the token).

**What becomes of the seam variable, precisely.** `--doc-seam-height` keeps its name and drops to **zero writers**. Its four consumers — `globals.css:1026`, `:1034`, `:1037`, `commercial/money-region.tsx:48` — are rewritten to read `--doc-landing-clear`, a declared constant that no script can change. This is X's answer to E1's Rank-1 risk and it is a refusal rather than a mitigation: E1 says "a continuous seam is not a header change, it is a navigation change", and X does not make the seam continuous, discrete, or anything else — it removes it, and the fallback arms those four sites already carry (`var(…, 0px)`) become the only behaviour, resolved once, identical at every scroll offset and every fling speed.

**Tests:** **delete** `src/components/document/__tests__/job-ticket.test.tsx` (the component is gone; `:519`, `:524`, `:529`'s seam-var lifecycle has no subject). **Delete** the sentinel contract at `src/app/(document)/doc/[id]/page.test.tsx:1360-1379` and the ticket-position block at `:1236-1257`; keep `:1230-1234`'s mounted-region order. **Rewrite** `e2e/document/quiet-responsive-shell.spec.ts:173-176`, `:183-196` (`toHaveCount(8)` at three widths — the rows exist as data, not as DOM) and `:165` ("spine prints only 'On this paper'"). **Rewrite** `src/components/document/__tests__/responsive-document-shell.test.tsx:187-189` (the `data-spine-regime` string literal), `:191-195`, `:655-687`. **Keep** `src/lib/document/__tests__/ticket-derivation.test.ts` entirely — every assertion is about the derivation, which survives. **Keep** `src/components/document/doc-letterhead.test.tsx:69-83` (the 40px title, `doc-rule-mid`, no `border-b`) and `:85-97` (no shadow). **Keep** `src/components/document/region/__tests__/region-head.test.tsx:110-120` — X does not collapse the head's grid. Gates green: `shadow-gate.test.ts` (a shadow is *removed* from the page's needs, none added), `contrast.test.ts`.
**Rollback:** this is the one wave that cannot be reverted by a flag — deleting a component is not flaggable. It reverts by git revert of one commit touching sixteen files; the rail from Waves 1–2 keeps working without it, because the ladder never depended on the ticket.
**Value alone:** F01, F04, F11, F13, F34, F44, F47, F50, F51, F52, F60, F71, F73, F97, F112, F120, F154, F24, F79.

### Wave 4 — Density (week)

- `src/components/document/region/use-region-fold.ts` — the hook's return widens from `{folded, toggle, setFolded}` (`:90-94`) to add `density`. **The three voices become four:** `forceOpen` (`:121`) stays supreme and stays a fold override; `explicit` (localStorage, `:42-46`, `:129-135`) stays a hard fold, outranks position, and survives every scroll; `latchedDefault` (`:104-119`) becomes the region's **initial density**, not its initial fold — the latch itself is kept, because a query resolving after first paint must not yank anything (E1 §8.3); and **position** is added as a fourth, lowest, **non-persisting** voice that may move a region only between `full` and `quiet`, never to `folded`, and may never write `patina:doc-fold:{docId}:{region}` (SP-07).
- **New:** `src/hooks/use-lens-density.ts` — one `IntersectionObserver` per region root with the 120/40px hysteresis, the X-10 velocity gate, the `region.contains(document.activeElement)` guard, a deterministic `settle()` and a `window.__lensSettled()` promise. It writes `data-density` on the region root **imperatively in the rAF handler** and React re-renders nothing — E1-17 is explicit that a density change must not be a `startTransition`, and the tree contains zero today.
- `src/app/globals.css` — the `[data-density='quiet']` rules, and one new `@media (prefers-reduced-motion: reduce)` block covering X-1's window and the four crossfades.
- Region components render their quiet form: head, one ≤40-char line, reserved height.

**Tests:** rewrite `src/components/document/region/__tests__/use-region-fold.test.tsx:38-60` **additively** — every existing assertion stays true, plus new cases for "scroll never writes storage" and "a region containing focus never quiets". Keep `region/__tests__/fold-seam.test.tsx:36-45`: X's condense is a CSS attribute swap, not a hydration-flag-gated animation, so the flash assertion is not tripped. Keep `region/__tests__/row-overflow.test.tsx:31-44`.
**Rollback:** the density observer mounts behind a fail-closed flag; off, every region renders `full` and the page is Wave 3's page.
**Value alone:** F39, F53, F54, F59, F64, F89, F93, F156, and the ask's own sentence about content that lends to space when it is not needed in frame.

### Wave 5 — The pre-work spreads (weeks)

`src/app/(document)/doc/[id]/page.tsx` — wrap brief, discovery, direction and proposal bodies in real regions with real `RegionHead`s. Today the proposal's content is inline with a plain head at `page.tsx:2006` and the spread renders **zero** `[data-region-head]` and zero `[data-index-region]` elements (F16, confirmed twice by direct DOM query). `src/lib/document/document-index.ts:76-82` — `paperRegionsForSection` stops returning `[]` for those four.

**The fork E1 §4 names, answered:** an index row **may** print with no value. A row is a name and a position; `Design vision —` is orientation, and a missing row is a hole. That keeps this wave at page.tsx surgery plus one table, and needs no new query for brief and discovery, which have nothing numeric to count.
**Tests:** rewrite `src/components/document/__tests__/shelved-spine.test.tsx:155-197` (which asserts precisely the `[]` this wave changes). `stage2-approval-cutover-contract.test.ts`'s regex is already gone (Wave 0), which is what makes page.tsx surgery safe here.
**Rollback:** the per-section order table returns `[]` for the four spreads; the ladder falls back to the rail head and the doors, which is Wave 2's pre-work behaviour.

### Where X disagrees with E1

One place. E1 §3 recommends `content-visibility: auto` with `contain-intrinsic-size` as the replacement for the render-cost control the fold provides, priced at `week`, and flags in E1-08 that the implied `contain: layout paint` creates a stacking context that may kill the R126 `z-index:-1` hover wash on FF&E lines. **X declines the replacement entirely.** A quiet region's body unmounts, exactly as a fold's does today (`use-region-fold.ts`, `ffe-section.tsx:1204-1210`), so the control E1 is trying to preserve is never removed and never needs replacing. That saves a week, removes E1-08 from the risk register outright, and removes E1-09's `contain-intrinsic-size` interaction with the reading band. What it costs is find-in-page reach into a quiet region — named in §11 and refused there with its reason.

---

## 10 · Risks

Five would have been the floor. Six, each with the observation that proves it real.

**R1 — The rail becomes the cluttered thing.** X moves eight ticket rows' worth of destination into a 200px column and then asks that column to also be a map. The ask's first complaint was that the rail is cluttered.
*Falsifying observation, first week of use:* a practitioner walk at 1440/s0 names six or more independent things in the rail's first 200px — the same count F96 makes against today's rail. If the first 200px is not exactly two things (Put down, the head), the eviction did not go far enough.

**R2 — Extents walk while the paper settles.** Segment heights are measured from region roots. On the specimen, 36 catalog crops resolve over the first seconds and the FF&E root's height changes as they do.
*Falsifying observation, first week of building:* seed a 60-line, 4-room schedule with crops, load at 1440, and watch the ladder's segment boundaries visibly redistribute during the first two seconds. The mitigation designed in from the start is that extents are read once at settle and re-read only on a `ResizeObserver` entry larger than 5% — but if the boundaries still walk on a cold load, the ladder needs data-derived extents (line counts) rather than measured ones, which is a different mechanic.

**R3 — Nothing quiets on a short paper.** X only quiets a region that is entirely 120px clear of the frame. The Byrne proposal's whole document is 2,179px at 1440.
*Falsifying observation, first week of use:* open a proposal-stage document, scroll it end to end, and no region ever changes density. The lens does nothing on four of the seven spreads, and the ask's "content that lends to space" is unanswered exactly where F20 says the absence is worst.

**R4 — Identity below 1440 lives in chrome, and chrome reads as the app.** The drawer's breadcrumb is a 60px strip at the bottom of the screen, in the same run as `Library`, `People` and `Find anything`.
*Falsifying observation, first week of use:* P3, asked at 1280/s2 "which job are you in?", points at the drawer and says "that's the app's name". If she does, the household needs a home on the paper below 1440, and the only honest one is a band — which is the thesis X refused.

**R5 — A ladder without words is a ladder nobody reads.** At 1280 X prints no text in the rail at all and returns the labels on press.
*Falsifying observation, first week of use:* at 1280, a walk of T4 (change a fabric) or T9 (bill the deposit) shows the designer scrolling to find the region rather than pressing the ladder — because a text-free instrument has to be learned once, and nothing teaches it. If the press rate on the 1280 ladder is near zero after a week, branch (b) was the wrong side of SP-11 and the rail has to widen, which E1 §4 prices at `weeks`.

**R6 — The unmount reaches further than the fold did.** Today a region's body unmounts when she folds it — a deliberate act, a handful of times a session. Under X it unmounts every time a region leaves the frame.
*Falsifying observation, first week of use:* a designer presses `⌘F` and types a vendor name that is on an FF&E line 2,000px down, and the browser reports no match. Or, in building: fling s0→s3 and back on the specimen and watch remount cost — if remounting a 36-line body inside the 40px return threshold drops a frame, the threshold has to grow, and a larger threshold means the lens is doing less.

---

## 11 · Refuses

**1 — No lens line on the paper.** M-1 is the largest single recovery available and X refuses it. The reason is not that it would not work; it is that a sticky band spends the one axis the work needs. The header stack is 111.7% of a 900px frame and the first head lands at 1005px because the top of this page competes with the page for vertical pixels. A band of 48–64px is a permanent 6–7% tax on every frame at every offset, forever, to carry facts a column carries for free. Refused, not deferred: if the rail is the instrument, a second instrument on the other axis is redundancy, and SP-08 says redundancy is the thing to remove.

**2 — No standing rule.** M-8 pins the current region's head beneath the band. Two stacked sticky bands are a header again, and it duplicates the rail's window outright — the same fact, on the same screen, at the same moment, which is the first thing the critics' standing assignment hunts for. Refused, not deferred: X has no band for it to stand under.

**3 — No continuous seam, and no discrete one.** E1 §2 offers three costed branches for making the seam's height a function of scroll — days, week, weeks. X takes none of them. E1's own sentence is the reason: "a continuous seam is not a header change, it is a navigation change." Every branch pays somewhere in `scrollToRegion`'s once-resolved `scroll-margin-top`, and every one of them is invisible to the test suite because every seam assertion is jsdom. Refused permanently: the variable drops to zero writers and a declared constant.

**4 — No gutter pins.** M-4's pins beside the lines they are about. A decision about the whole document has no line to point at, so the mechanic needs an orphan home or it silently loses items — an information-loss defect. And `margin-item.tsx:46` carries one of the three legal `--elevation-sheet` sites, so a pin on the paper is a shadow on the paper. X takes M-4's diagnosis (F17: nothing beside her is about pieces) and answers it by sorting the column instead.

**5 — No find-in-page inside a quiet region.** X unmounts a quiet region's body, so `⌘F` cannot reach it — the same limitation today's fold has (F53), extended to every off-screen region. Refused rather than solved because the alternative is `content-visibility: auto`, whose `contain: layout paint` may kill the R126 ink-pool wash on FF&E lines (E1-08). Kody asked for that wash by name. The compensation is that the ladder prints every region's count and exception at every offset, and ⌘K searches content — but the cost is real and it is on the record.

**6 — No redesign of the foot.** F83 (310px teaching a concept with no content), F92 (70.3% of the foot frame carrying nothing), F98 (`Closing the book` as unexplained idiom) and F80 (the roster question 2,000px from its door) are all real and X leaves them. The ask points at the top of the paper and X spends its budget there; the s3 frame budget moves by exactly the 65px the seam was taking and no more. Refused for this proposal, not for the product.

**7 — No cross-document surface.** F06 asks for a door that answers "everything in install". It is a blocker, it is a real gap, and it is a desk question. NG1 is not negotiable and X will not answer it with a rail that reaches outside this paper.

---

## Appendix A — the ten candidate mechanics, dispositioned

| id | Disposition | One sentence |
|---|---|---|
| **M-1 · The Lens Line** | **Refused** | A sticky band spends the vertical axis the work needs to carry facts a column carries for free; §11.1. |
| **M-2 · The Map Rail** | **Adopted, adapted** | Adopted whole, with three changes: a fixed-height track the segments divide (so a thin spread gets bigger segments, not a shorter rail), a 44px floor per segment before extent is distributed, and the yielding rule that silences a segment's words while its own head is in frame. |
| **M-3 · Reading-line Density** | **Adapted** | Its vocabulary and its observer are adopted; its three levels become two, because F74 leaves no room for a legible middle ink and SP-12 says quieter must mean fewer words. |
| **M-4 · The Gutter Margin** | **Adapted** | Its diagnosis is adopted and its mechanism refused: the margin lifts region-anchored items into a named group rather than pinning them to the paper; §11.4. |
| **M-5 · Section Zoom** | **Adapted** | Its discreteness is adopted as the shape of the change — one attribute on the region root, no interpolation — and its click trigger is refused; position decides, not a press. |
| **M-6 · Focus Follows the Pen** | **Adopted, as ink weight only** | The edited line's rule turns clay and its own wash holds; no sibling loses a single step of ink, so there is no second dimming system and no tint on the paper. |
| **M-7 · The Ticket Dissolved** | **Adopted** | The eight rows keep their derivation and lose their table; each has a named home on the rail at every scroll state (SP-10). |
| **M-8 · The Standing Rule** | **Refused** | A second sticky band under the first is a header again and duplicates the rail's window; §11.2. |
| **M-9 · The Quiet Foot** | **Adopted, small** | As the last segment enters the window the ladder prints its `--rule-mid` end cap and the rail head's third line reads `THE RECORD`; nothing else at the foot changes, and §11.6 says why. |
| **M-10 · Tempo Damping** | **Adopted** | A 120ms velocity settle gates every density change and every announcement, and it exposes `settle()` plus `window.__lensSettled()` so the mockup's probe and the eventual e2e can force the settled state synchronously. |

**M-3 ⟷ M-5, the mandatory precedence rule.** Position decides a region's density, through M-3's observer. M-5 decides only how the decision is *applied*: discretely, as one attribute swap on the region root, with no intermediate level. There is no gradient for the two systems to fight over, because X has two densities and nothing between them.

**M-2 ⟷ M-4, the division of labour.** The rail owns the index — position, extent, exception, distance, where she has been. The margin owns the items — decisions, messages, money, notes. Neither prints the other's fact: the rail never prints a margin item's content, and the margin never prints a region's extent or position, only the region's *name* as its group heading.

---

## Appendix B — the eight ticket rows, sorted once (SP-10)

| Row | Bucket | Where it lives at s0 | Where it lives at s2 |
|---|---|---|---|
| `Rooms` | orientation + door | the FF&E segment's sub-rungs on the rail; the FF&E head's own status line | the same sub-rungs, printed because Pieces is under the window |
| `Pieces` | orientation | the FF&E segment's value line, `36 LINES · 4 ROOMS` | yielded on the rail (the head is in frame), printed by the head |
| `Drawings` | door | `Kept with the job → Plan room` | unchanged — the rail does not scroll |
| `Spec` | door | `Kept with the job → Spec book` | unchanged |
| `Boards` | door | `Kept with the job → Mood boards` | unchanged |
| `Money` | fact + door | the money segment's value, `$17,500 OWED · 22 DAYS`, with a terracotta tick | unchanged |
| `Dates` | fact | the rail head's third line, `INSTALL SEP 15 · 3 WEEKS` | the schedule segment's value line (the head's line has swapped to the worst exception, X-8) |
| `People` | door | `Kept with the job → Call sheet 2` | unchanged |

No row's home is "the top of the document". That is the sentence the whole proposal is for.
