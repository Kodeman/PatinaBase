# Fix log — Direction I · D · the galley (`specimens/direction-1.html`)

Fixer, fresh context. Inputs: `specimens/SPEC.md` §1/§2/§3/§4 (Direction I)/§5/§8,
`synthesis.md` §3 D and §5, `review/01a-specimens-technical.md`,
`review/01b-specimens-design.md`, and the orchestrator's seven rulings.
Only `direction-1.html` was touched.

---

## §1 · Every finding, with its disposition

| Finding | What changed | Where | Verified how |
|---|---|---|---|
| **ST-001** P1 · `autofocus` | Attribute deleted from `#rate-assistant`. The caret is placed only by the state script's `CARET` map (`f.focus()` + `setSelectionRange`). | `#rate-assistant` input | `grep -n autofocus` → empty. `money` plates at 1440/1024/390 show the focus ring on Assistant with the caret after `85.0`. |
| **ST-002 / SD-01** P1 · shared-block wrapper | Opening line changed to `/* SHARED BLOCK — BEGIN … */`, matching direction-2/3. | line 11 | SPEC §1 diff script: `SHARED BLOCK IDENTICAL`. |
| **ST-003 / SD-17** P2/P3 · typographic entities | No change needed — every rendered string already carries `&rsquo;` / `&hellip;` (rest row, Terms, `Save as template…`). The only straight apostrophes in the file are inside CSS comments, which render nothing. | — | `grep -n "[A-Za-z]'[A-Za-z]"` → CSS-comment lines only. |
| **ST-004** P3 · dark ghost at 1440 resting | Not reproduced. Nine fresh dark plates (3 widths × 3 states) show no bleed-through; the page's top region was rebuilt in this pass. Closed as the render-tool stitching artifact the reviewer suspected. | — | `--dark` run, all nine plates read. |
| **ST-006** P3 · `.field`/`.chip` hairline < 3:1 | **Declined.** Not one of SPEC §8's fifteen pairs; the legible edge is the 1px `--ink-faint` baseline rule (pair 12b, passes). Raising it means editing a token inside the shared block. | — | — |
| **SD-02** P1 · NO-4 — notes inside the paper's sheet | Both marginal notes now live in `<aside class="strip">` elements that are **siblings of `article.paper`**, never descendants. The sheet is drawn in six `article.paper` segments; at 1440 the strips are marginalia in the 192px margin column and the segments close into one continuous sheet; at 1024/390 the sheet ends, the `--rail` strip prints, the sheet resumes. | new `.strip` blocks; `@media (min-width:1248px)` merge rules | DOM probe: `article.paper.contains(strip)` → **0 of 5**; readiness, rest row and `Creates authority` all outside. Plates at 1440/1024/390, light and dark. |
| **SD-04** P1 · naked heading + studio sentence for an unwritten part | The paper prints **nothing** for Role rates in `resting`/`clause` — no `<h3>`, no sentence, no `Creates authority`; the part's own padding collapses so only its seam remains. `Not written yet. Your client's copy does not print this part.` and the act that opens it moved to the Role-rates strip. | `#part-role-rates`, `.str-2` | Probe: `roleRatesHeadingResting: false`, `restRowInPaper: false`. `resting/1440` plate — the sheet runs Exclusions → seam → seam → Ceiling. |
| **SD-05** P2 · `Creates authority` on the paper's stock | All five standings (the five schedule parts of fixture §6.2) moved into their part's strip, `.t-head`, beside the money and never in the outline (#40, IA-11/12). | `.strip__standing` ×5 | Probe: `createsAuthorityInPaper: false`. Visible in the margin at 1440, in the strip below 1248. |
| **SD-06** P2 · the paper reads as a form | Mono-caps acts painted on the sheet fall from 29 to **18** (resting) / **20** (clause, money): 10 seam acts, 8 fold acts, and the two move acts of the selected part only. | `.part__acts`, `.seam .act` | Act census read off the 1440 plates in all three states. |
| **SD-07** P2 · the part head is a control | The head is a plain `<h3 class="part__head t-d3">`. The fold act is a separate `.act--tertiary` on the head's row, right-aligned, in the tier's own DM Mono 13 caps — no local family or size anywhere on it. | `.part__head-row` | Probe: `headIsControl: false`; computed style of every act label carries DM Mono 13. |
| **SD-08** P2 · off-scale 13px Inter acts | `.outline__foot .act { font-size: 13px }`, its `.label` line-height and the `font-family` override were deleted. The outline foot and the return act inherit the tertiary tier. | outline/page foot CSS | Probe `offScale: []` over every act in `<main>`. |
| **SD-09** P2 · the money editor never reaches its measure | The fold's 22px left rule/indent removed, and the selected part's 2px rule now hangs into the paper's own padding (`margin-left:-24px`), so **every** part's text width is one number and the editor equals it. | `.fold`, `.part[data-selected]` | Measured: editor = selected part text = unselected part text = paper inner text at all three widths. **True measure below.** |
| **SD-12** P2 · 45px inter-part gaps | Seam row set to `min-height: 48px` (border-box, so the hairline is inside it); segment junctions no longer double their borders at 1440. | `.seam`, 1248 merge block | Measured gaps: `[48,48,48,48,48,48,48,48]`. |
| **SD-13** P2 · the note labels the wrong part | Strips anchor to the **part**, not the following seam: each carries the part's name and, at 1440, `top` is set from that part's own `getBoundingClientRect()`. | `.strip[data-beside]` + placer script | `resting/1440`: the fee-floor strip is level with the Role-rates seam and names it; `money/1440`: the ceiling strip is level with Ceiling. |
| **SD-14** P2 · transition sentence never fires | `apply()` keeps the previous state and writes string #15 on `clause → money`. Every other path keeps #13/#14. | state-machine script | Probe: `clause→money` = `Role rates name the fee. One thing left: name a ceiling.`; `resting→money` = #14. |
| **SD-16** P2 · the Save record prints twice | The per-fold `Saved …` line deleted from all nine folds. The record survives once, under the prepared-for line, carrying the per-state suffix. | all `.fold` | Probe: `recordCount: 1` in every state. |
| **SD-21** P2 · return act absent below 1248 | String #36, the return act and `Press and hold to return` moved out of the outline's foot to a `.page-foot` below the paper, at the paper's measure, at **every** width. The outline foot keeps `Save as template…` alone. | `.page-foot` | Probe check 13: the act named `/Return to the seven/` present at 1440, 1024 **and** 390. |
| **SD-22** P2 · the consequence set in a 192px column | Same move — it now sets at 720/664/358 with the `.consequence` 56ch cap, 4–5 lines. | `.page-foot .consequence` | Plates at all three widths. |
| **SD-26** P3 · no seam above part 1 | A tenth seam added directly under the paper's headline. | segment 1 | `seamActs: 10`; visible under the headline in every plate. |
| **SD-29** P3 · state change scrolls the reading position | Partly addressed: `autofocus` is gone (ST-001) and `.fold .field-control` carries `scroll-margin-top: 24px`, so the script's `focus()` lands the fold under the module rather than at the viewport edge. The scroll to the open fold is deliberate and remains. | `.fold .field-control` | Check 18 re-run: Δ = **0px** for the part above the target. |
| **SD-30** P3 · missing authored comment | String #20 (`Link a client with an email address.`) added as an HTML comment beside the other unrendered variants (#4/#5, #8, #16/#17, #41 were already present). | `<header class="head">`, end of the paper | `grep` of the comment block. |
| **SD-31** P3 · dark field ground reads as a hole | **Declined.** The fix named in the review is a `--paper-doc` token change, and no line inside the shared block may be edited (SPEC §1). Left for the panel as an amendment ask. | — | — |
| **SD-32** P3 · h1 and paper headline both `.t-d2` | **Declined.** Tagged "all three"; stepping only this file would break the "one room" requirement the deck rests on. A three-file sweep is the panel's call. | — | — |
| **SD-33** P3 · duplicate `.part__head .act { font-size: 20px }` | Both declarations gone with the whole `.part__head .act` rule (SD-07). | — | `grep` for `part__head .act` → empty. |
| SD-03, SD-10, SD-11, SD-15, SD-18, SD-19, SD-20, SD-23, SD-24, SD-25, SD-27, SD-28, ST-005 | Out of scope — direction-2/direction-3 or deck-level. | — | — |

---

## §2 · The true text measure (ruling 5)

The sheet was kept as drawn: 720 / 664 / 358 galley, 1px rule, 24px paper padding.
The paper's text measure is therefore **not** 720 / 664 / 358, and the money editor
is set to the number the paper actually prints at:

| Band | Galley | **True text measure** | Money editor | Printed part's text width |
|---|---|---|---|---|
| 1440 | 720 | **670** | 670 | 670 |
| 1024 | 664 | **614** | 614 | 614 |
| 390 | 358 | **308** | 308 | 308 |

670 = 720 − 2×24 padding − 2×1 rule. 614 and 308 the same way. The figures are
identical for a selected part, an unselected part and the open fold — the
selection rule hangs in the paper's padding rather than eating the measure. The
paper's prose still caps at 65ch (656px at 1440) inside that column, as §A14 asks.
**The deck's fold note should read 670 / 614 / 308.**

---

## §3 · Amendments to SPEC / synthesis, recorded per the rulings

1. **SPEC §4 D, the 1024 band.** The 216px notes column is retired. Ruling 1 puts
   the strips in flow below 1248, so at 1024 the galley keeps its drawn **664** and
   centres in the 928px field; the strips interrupt the sheet full-width.
2. **SPEC §4 D, `.fold`.** The 1px left rule and 22px indent are removed (ruling 5).
   `.part[data-selected]` now takes `margin-left: -24px` so the 2px rule hangs in the
   paper's padding and the part's measure does not change when it is selected.
3. **SPEC §4 D, the part head and the keyboard model.** The head is not a control
   (ruling 4). A tertiary act **`Write`** on the head's row carries `aria-expanded` /
   `aria-controls`, and its accessible name is `aria-labelledby`-composed from the
   heading plus its own label. §5 pins no string for a fold act and #34
   (`Write this part`) is direction-II-only, so `Write` is a new string this ruling
   requires; it needs the panel's word. Tab order per part is now: fold act →
   Move up → Move down → seam act.
4. **Role rates' fold act lives in its strip in every state**, not on the head row —
   the part the paper prints nothing for has no head row to hang it on (ruling 2).
   It is the one part whose opener is in the studio's register.
5. **SPEC §3, the state script** gains the `clause → money` branch that writes string
   #15 (ruling 6, SD-14). direction-2/3 already fire it, so the three scripts stay
   aligned in behaviour.
6. **SPEC §4, `at the outline's foot (D, A)`** — strings #36/#37/#38 are at the
   **page** foot at every width (ruling 3). The outline's foot keeps #35 alone.
7. **`Creates authority` appears five times**, on the five schedule parts of fixture
   §6.2 — not on all nine.

---

## §4 · Two things the panel should see

- **The margin drifts at 1440.** The strips are set as marginalia: each starts at the
  top of the part it names and is pushed down only to clear the strip above it. In
  `resting`/`clause` the Role-rates strip is tall (rest row + `Write` + the fee-floor
  note), so the four standings below it sit up to ~200px below their own parts. Every
  strip names its part in words, so nothing is mislabelled, but the column is not
  line-for-line with the sheet in those two states.
- **Reorder crosses a sheet segment.** Because the sheet is drawn in segments so the
  strips can sit between them, moving a part past a segment boundary moves it into the
  neighbouring segment; the strips stay where they are. Keyboard reorder, its
  announcement and its focus return are unaffected — it is the strip-to-part pairing
  that would need re-running in a shipped build.

---

## §5 · The gate (SPEC §8)

**Render** — `render.mjs`, widths 1440/1024/390, states resting/clause/money, in
light, `--dark` and `--reduced-motion`. Chromium needed the sandbox lifted
(`mach_port_rendezvous`: Permission denied).

| Run | Captures | Errors | Warnings | Horizontal overflow | Exit |
|---|---|---|---|---|---|
| light | 9 | 0 | 0 | none | 0 |
| `--dark` | 9 | 0 | 0 | none | 0 |
| `--reduced-motion` | 9 | 0 | 0 | none | 0 |

**Greps** — all empty: `box-shadow|drop-shadow|--elevation-sheet` (only the `:root`
token declaration), native `disabled`, `contenteditable|text-overflow|line-clamp`,
sub-11px `font-size`, `opacity` state, `position: sticky|fixed` / zoom block,
`autofocus`, external URLs but the fonts link, §7's banned words, `>…chip|modal|
builder|composer`. `#8B7355` only in its token declaration and never on a `color`.
`grep -c 'Return to the seven facets'` = 1 and `facet` appears on no other line.
One `<h1>`, `<html lang="en" …>`, headings in order.

**Shared-block diff** — `SHARED BLOCK IDENTICAL` against both direction-2 and
direction-3.

**Spot checks re-run in Playwright** — check 5 (status present at load with a full
sentence), 6 (rewrites on state change), 7 (both held acts `tabIndex 0` with a
visible `aria-describedby` target), 8 (Enter on the send act speaks the reason and
moves focus to `#toggle-ceiling`), 13 (send **and** return act present at 390, 1024,
1440), 14/15 (Billing cadence moves 8→7→6 with `pointerEvents:'none'`, focus stays on
that part's own control, `#room-status` announces each move), 18 (Δ = **0px**),
20c (selected part in `forced-colors: active` = 2px `CanvasText` rule + the words
`— being written`).

**Size** 64,349 B (≤ 120 KB) · last line `<!-- specimen-complete -->`.

---

# Round 2 — against `review/03-rereview-specimens-design.md`

| Finding | What changed | Where | Verified how |
|---|---|---|---|
| **SD-101** P2 · segments part while a part is written | **The sheet was already continuous — the re-review's `[…,12,12,72,…]` are the money editor's own `.money-row` margins, not sheet segments.** Measured directly on `article.paper` rects, the inter-segment gap at 1440 is **0px in all three states** (see table below). Hardened anyway: `grid-auto-rows: min-content` at ≥1248 so no row can ever grow past the segment it holds. The alternative fix — one painted parent wrapping the segments — was **declined**: it would make the strips descendants of the element painting `--paper-doc`, re-opening SD-02 (NO-4), the higher constraint. | `@media (min-width:1248px) .room` | Segment-gap probe on `article.paper`, 1440 × resting/clause/money → `[0,0,0,0,0]` each. |
| **SD-102** P2 · 390 cut into fragments by metadata boxes | At ≤767 a strip whose whole payload is a part name and its standing **renders nothing**: `.str-4/.str-5/.str-6` never print, `.str-3` prints only in `money` (when it carries the ceiling note), `.str-2` always prints (rest row, `Write`, fee-floor note). The four standings gather into **one studio run below the paper**, so #40 is still present at 390. Where no strip prints between two segments the sheet **rejoins** — shared hairline, no radius, no margin. The strip's part name moved from `.t-body-sm` to `.t-head` (d2's treatment), so it no longer repeats the paper's Playfair heading verbatim. | `@media (max-width:767px)` block; `.strip--run` | Segment-gap probe at 390: `resting`/`clause` `[281,0,0,0,0]`, `money` `[185,171,0,0,0]` — one interruption at rest, two while writing, everything else one sheet. Plates read at 390 light and dark, all three states. |
| **SD-103** P2 · 44px reflow on focusing a move act | `Move up` / `Move down` moved onto the head's own row beside the fold act, and their box is **reserved at all times** — `visibility: hidden`, never `display`/`height` — so revealing them is a paint, not a layout. `.part__fold-act` keeps `visibility: visible` inside the hidden group, so `Write` is always shown and always tabbable. The move acts stay **directly focusable** (d2's are not), which is strictly better than the 0px d2 achieves by being unfocusable. | `.part__acts`, `.part__head-row` markup | Reflow probe (`#part-terms` document top before/after focus) at **1440, 1024 and 390 × resting, clause, money — 0px in all nine**, both on focusing the fold act and on focusing the move act directly; `moveFocusable: true` in all nine. |
| **SD-104** P3 · two `+ Add a part` in succession | A part the paper prints nothing for prints **no seam either** — the seam above it is the place to add there. Matches the reading the re-review blessed for d2 under SD-26. | `.leaf--unwritten .seam` | 1440/1024 resting and clause plates: one seam between Exclusions and Ceiling. Seam count 10 in `money`, 9 at rest. |
| **SD-107** P3 · six `THE STUDIO` heads at 390 | Not a defect (#21 mandates the head on every `.studio-note`), and SD-102's fix reduces the count from **six to three** at rest (readiness, the Role-rates strip, the studio run). Left compliant; the "print it once per run" idea stays an amendment ask. | — | 390 resting plate. |
| SD-105, SD-106 | Out of scope — direction-2 / direction-3. | — | — |

## Measured gaps and the reflow delta

**Inter-segment gaps, `article.paper` rects (px):**

| | resting | clause | money |
|---|---|---|---|
| **1440** | `0, 0, 0, 0, 0` | `0, 0, 0, 0, 0` | `0, 0, 0, 0, 0` |
| **390** | `281, 0, 0, 0, 0` | `281, 0, 0, 0, 0` | `185, 171, 0, 0, 0` |

At 1440 the sheet is one sheet in every state. At 390 the only non-zero values are
the printing strips themselves — the interruption NO-4 asks for — and every other
junction is closed.

**Reflow on revealing a move act — `#part-terms` document top, before → after focus:**

| | resting | clause | money |
|---|---|---|---|
| **1440** | 0px | 0px | 0px |
| **1024** | 0px | 0px | 0px |
| **390** | 0px | 0px | 0px |

(was +44px; measured both on focusing the part's fold act and on focusing the move
act directly.)

## Round-2 notes for the ruling sheet

- **The unwritten part cannot be reordered from the paper in `resting`/`clause`.** Its
  move acts live on a head row the paper does not print, so while Role rates is
  unwritten it is reordered from the outline in a shipped build. The specimen shows
  its acts as soon as it is written.
- **Tab order within a part is now `Move up → Move down → Write`** (SPEC §4 D's
  keyboard model said head toggle first). The fold act sits last in the group so it
  stays flush right whether or not the move acts are showing.
- **Focus returns through the fold act after a reorder.** Moving a node in the DOM
  drops its focus, and the move acts show only while the part holds focus, so the
  script focuses the part's fold act and then hands focus back to the move act's
  twin. Check 14/15 re-run with `pointerEvents: 'none'`: Billing cadence moves 8→7→6,
  `activeElement` stays inside that part both times, `#room-status` announces each move.

## Round-2 gate (SPEC §8)

| Run | Captures | Errors | Warnings | Overflow | Exit |
|---|---|---|---|---|---|
| light | 9 | 0 | 0 | none | 0 |
| `--dark` | 9 | 0 | 0 | none | 0 |
| `--reduced-motion` | 9 | 0 | 0 | none | 0 |

Every §7/§8 grep empty (shadow, native `disabled`, `contenteditable|text-overflow|
line-clamp`, sub-11px type, `opacity` state, `sticky|fixed`/zoom block, `autofocus`,
external URLs, banned words, visible `chip|modal|builder|composer`); `#8B7355` only in
its token declaration; one `<h1>`; `facet` on the return act's line alone; no `:hover`
rule touching `display`/`opacity`/`visibility`. Shared-block diff:
**`SHARED BLOCK IDENTICAL`**. Re-run green: check 13 (send **and** return at 390, 1024,
1440), 14/15, 18 (Δ = 0px), leak probe (`stripsInPaper: 0`, no standing or rest row on
the paper), one Save record. Size **66,973 B** (≤ 120 KB); last line
`<!-- specimen-complete -->`. `direction-2.html`, `direction-3.html` and `SPEC.md`
untouched (hashes unchanged).

---

# Round 3 — against "Round 2 — D" in `review/03-rereview-specimens-design.md`

| Finding | What changed | Where | Verified how |
|---|---|---|---|
| **SD-102** P2 · still open at 1024 | The strip rules moved from `@media (max-width: 767px)` to **`@media (max-width: 1247px)`** — the whole band where the margin column is retired. At 1024, as at 390: no name-only strip prints, the four standings gather into the one studio run below the paper, and the sheet rejoins at every junction where no strip prints. | the `≤1247` block | Strip census at **1024**: `resting`/`clause` → `Role rates` + the run; `money` → `Role rates`, `Ceiling`, the run. `nameOnlyStrips: 0` in all six width×state combinations. Segment gaps at 1024: `[260,0,0,0,0]` at rest, `[185,171,0,0,0]` in money — two fragments, three while writing (was six, separated by 289/158/146/146/146). `THE STUDIO` heads at 1024: **3** at rest (was 5). |
| **SD-108** P2 · move acts unreachable by forward Tab | DOM order in the head row is now **`Write` → `Move up` → `Move down`**, and it is the visual order too, so reading order and tab order agree. The reserved box is no longer `visibility: hidden` on a focusable control: an **inert ghost** (`<span aria-hidden="true">` carrying two non-focusable `.act` spans) holds the exact box, and the real buttons — `display: none` until the part is live — replace it on `[data-selected]` or `:focus-within`. Nothing focusable is ever present-but-hidden. | `.part__acts-ghost` / `.part__acts-live`; 9 head rows | Forward Tab trace from `Write` at **1440, 1024 and 390**: `Write → Move up → Move down → + Add a part` — identical at all three widths. `hiddenFocusables: 0` (no `button/a/input/select/textarea` computes `visibility: hidden`). Reflow held at **0px** (`onFoldFocus: 0`, `onMoveFocus: 0`, `moveIsActive: true`). |
| **SD-109** P2 · empty ruled rectangle below 1248 | Where the paper prints nothing for an unwritten part, its segment now prints **nothing at all** below 1248 — no ground, no rule, no height — matching what it already did at 1440. The box returns the moment the editor is opened (`:has(.fold[hidden])` guards the collapse), so the studio's `Write` in the strip still opens onto paper. | `≤1247` block, `.seg-2` | Empty-segment probe: `{h: 0, borderTop: 0px, borderBottom: 0px, background: transparent}` at **1024 and 390**, `resting` and `clause` (was `h:50` / `h:49` with 1px rules); no empty segment in `money`, where the part is written. Read in `resting`/`clause` plates at 1024 and 390, light and dark. |

## Round-3 measurements

**Sheet fragments and gaps, `article.paper` rects (px)**

| | resting | clause | money |
|---|---|---|---|
| **1440** | `0, 0, 0, 0, 0` | `0, 0, 0, 0, 0` | `0, 0, 0, 0, 0` |
| **1024** | `260, 0, 0, 0, 0` | `260, 0, 0, 0, 0` | `185, 171, 0, 0, 0` |
| **390** | `281, 0, 0, 0, 0` | `281, 0, 0, 0, 0` | `185, 171, 0, 0, 0` |

The only non-zero values are the printing strips themselves. One sheet at 1440; two
fragments at rest and three while writing below 1248.

**Head-row Tab order** (forward, from the fold act)

| Width | Trace |
|---|---|
| 1440 | `Write → Move up → Move down → + Add a part` |
| 1024 | `Write → Move up → Move down → + Add a part` |
| 390 | `Write → Move up → Move down → + Add a part` |

SPEC §4 D's model reads `head toggle → Move up → Move down → seam act`; with the head
no longer a control (ruling 4) the fold act is the head's toggle, so the trace matches
it exactly. Crux (ii) is met by plain forward Tab again.

**Reflow on revealing the move acts:** 0px (`#part-terms` document top, before → after
focusing the fold act and then the move act directly).

**Empty-segment probe:** `h: 0`, no borders, transparent, at 1024 and 390 in `resting`
and `clause`.

## Round-3 note

`Write` sits at the **left** of the head row's right-aligned act group rather than flush
against the paper's right edge, because the reserved ghost holds the move acts' box to
its right. The gain is that `Write` never moves when the moves appear or go, and that
reading order, visual order and tab order are the same three orders. Ruling 4's
"right-aligned" now describes the group, not the single act.

## Round-3 gate (SPEC §8)

| Run | Captures | Errors | Warnings | Overflow | Exit |
|---|---|---|---|---|---|
| light | 9 | 0 | 0 | none | 0 |
| `--dark` | 9 | 0 | 0 | none | 0 |
| `--reduced-motion` | 9 | 0 | 0 | none | 0 |

Every §7/§8 grep empty; one `<h1>`; `facet` on the return act's line alone; no external
URL but the fonts link. Shared-block diff: **`SHARED BLOCK IDENTICAL`**. Re-run green:
check 14/15 (Billing cadence 8→7→6 under `pointerEvents:'none'`, focus stays in the
part, `#room-status` announces each move), check 18 (Δ = 0px), leak probe
(`stripsInPaper: 0`, no standing or rest row on the paper), one Save record. Size
**70,102 B** (≤ 120 KB); last line `<!-- specimen-complete -->`. `direction-2.html`,
`direction-3.html` and `SPEC.md` untouched (hashes unchanged).
