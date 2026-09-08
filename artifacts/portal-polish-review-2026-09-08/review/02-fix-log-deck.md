# Fix log — `deck/index.html` ("Paper, Polished")

Pass 02, 8 September 2026. Inputs: `review/01c-deck-technical.md` (T01–T11),
`review/01d-deck-content.md` (D01–D60), the coordinator's rulings 1–13, and
`specimens/SPEC.md` §F amendments A–P.

**Result.** 18 sheets. `deck/index.html` = **1,943,383 bytes (1.85 MB)**, limit
12 MB. 53 captures, zero console errors, zero warnings, `horizontalOverflow:
false` on every one. `grep -c` = 0 for `box-shadow`, `text-overflow`, `✓`,
`7,040`, `9,120`. All three `srcdoc` payloads verified byte-identical to the
current `specimens/*.html` after HTML-unescaping (assertion in the build
script; it refuses to write otherwise).

---

## 1 · Rulings

| # | Ruling | Done |
|---|---|---|
| 1 | Re-embed current specimens + current plates; update sheets 12–13 to §F | Yes. All three `srcdoc` payloads re-escaped from the 12:19–12:24 specimen files and byte-verified. All specimen plates re-cut from the 12:20–12:26 renders (`client-house-default-390`, `designer-desk-43jobs-390/-1440`, `decision-moment-390/-1440`). Sheet 12 now shows the §F C terminal label (Inter 500 / 16px / sentence case / tabular), the §F D `.act--inline` tier, and the §F E pressed states (scored act + chips). Sheet 13's scale specimen carries the §F B `.t-money` step at 15px and the §F C terminal step. Deck CSS follows §F A (no `--rail` strokes anywhere), §F F (no charcoal chrome — the chrome is `--paper-doc`/`--paper` with a hairline), §F J (stage-plate values not lifted in dark). |
| 2 | D01 — delete the invented `$7,040` | Yes. Sheet 11's ledger is Agreed $11,100.00 / Paid $0.00 / Owed $4,060.00, and the sentence reads "The house stands at $11,100.00 agreed. Nothing has been paid, and $4,060.00 is owed on the open invoice, due 11 September 2026." `grep -c '7,040'` = 0. |
| 3 | D27 — print the verdict twice | Yes, verbatim, in `.t-d2`: cover (under the subtitle) and head of sheet 17. |
| 4 | D28 — no `max-height` panes | Yes. `.pane` deleted from the stylesheet. Sheets 9 and 17 run to 2,222px and 2,798px at 1440 and print their full row counts ("Nineteen rows…", "Twenty rows, then ten rulings…"). Every sheet taller than 100dvh carries `This sheet continues below.` in `.t-meta` under the title; sheets 3 and 10 fit one screen at ≥761px and their cue is suppressed there by `.fits-wide`. Nothing is behind an inner vertical scroll. |
| 5 | Chrome occlusion | Yes, and verified. `.slide` padding-bottom 112px at ≥761px, 88px below. `#hint` folded into the single `#chrome` box, dismissed permanently on the first navigation, `display:none` below 761px. Below 761px `#chrome` docks as a slim top strip (`--paper`, hairline-strong bottom rule) with `.slide` padding-top 48px and `#deck { scroll-padding-top: 44px }`. Verified by pixel inspection of the bottom-right and bottom-left 500×110 bands of all 18 sheets at 1440 and the top 120px band of all 18 at 390: no character is behind chrome anywhere. Also fixed a second-order bug this exposed — deep-linked sheets 9 and 18 at 390 landed ~10–48px past their own top because the load-time scroll ran before a font reflow; positioning now re-runs on `load`, on `fonts.ready` and at 400ms, using `offsetTop`. |
| 6 | D36 — the deck obeys its own 15px floor | Yes. `.t-money` and `.ledger-row .fig` are 15px; the sheet-11 date line, the sheet-12 record's parties and timestamp, and the cover date are `.t-money`. The running-head exception is stated **on sheet 11** ("the two letterhead lines above are *running heads*… the 15px floor governs money, dates, party names and consequence sentences in body content; running heads and plate captions stay metadata") and again on sheet 13. |
| 7 | D37 — a "when" on every caption | Yes, all sixteen: proposal plates "captured 7 September 2026"; `client-local-dev-*` "captured 4 September 2026"; `desk-final-desk-*` "captured 28 August 2026"; `invoice-open-desktop` "captured 6 September 2026"; specimen plates "captured 8 September 2026". Dates taken from the source paths recorded in `shots/README.md`. |
| 8 | D39 — honest spacing | Both. Every block-level value snapped to 6 / 12 / 24 / 48 / 72 (`.entry`, `.ladder li`, `.principles li` → 12; `.lenses li`, `.ledger-row`, `.scale-spec .row` → 6; `table.sheet` cells → 12/24; `.ann` row-gap, `.swatches`, `.tier-bench`, `.reg` → 12/24; `.slide` → 48/112 and 48/88). Sheet 13 also restates the rule as it is actually held: "A 24px vertical module between blocks, 12px inside a block, 6px inside a row." |
| 9 | Numbers | Reading chair → **$8,120.00** (sheet 13), read off the enlarged Study rows of `client-local-dev-desktop.png` and cross-checked against `SPEC.md:610` and `client-house.html:795`. Sheet 9 row 1 rewritten: "…beside dollar figures to $3,600.00, on a schedule whose one photographed row is its $14,880.00 line", read off `document-final-document-ffe-1440.png` (Dining table + 6 side chairs $14,880 is the only photographed row; the five hash rows are $3,600, $2,400, $1,850 and two unpriced). Full sweep run: every `$` figure in the shell now carries cents except where the deck is quoting a screenshot's own string, which the sheet-13 rule now states. |
| 10 | Citations | `room-band.tsx:26-30` → **`room-band.tsx:134-157`** (verified: `feet.length === 0` branch, `<rect>` at :145, `<text fontSize={FOOT_TYPE}>` at :146-155). `DECISIONS.md:3775` kept and named correctly: sheet 17 now reads "**R107** — The Room View drawing ruling — 'confidence renders honestly', at `docs/design/the-document/DECISIONS.md:3775`" (verified: that string is on line 3775, inside R107 which opens at :3765). `eslint.config.mjs` → `apps/designer-portal/eslint.config.mjs:83-101`. All other flagged cites re-opened and left as they were. |
| 11 | Motion | Removed entirely. No `.seen` class, no opacity/transform reveal, no `IntersectionObserver`, no `setTimeout` safety net. Sheets render static. The `prefers-reduced-motion` block is kept for the scroll behaviour and the control press feedback. |
| 12 | Title | Kept: **Paper, Polished**. 01d's D60 rules it correct and recommends no change. |
| 13 | The rest of both top tens | See §2. |

---

## 2 · 01d findings (D01–D60)

**Fixed:** D01, D02 (`IA-17 · L2`), D03 (`BE (list 4) · N8 · VC`), D04 (both
missing Keep rows added — L16·IA-07 and L10·BE-18), D05 (reworded, and
narrowed further to "two or three reviewers" after counting the reviewer sets
myself), D06 (the five confirmed diagnoses now print as a numbered table on
sheet 4, cross-referenced to sheet 9), D07 (the greeting keep and the
letterhead/doorplate keep added to sheet 8), D08 (four state pigments drawn as
bands on sheet 13, with the "colour never carries state alone" line), D10
(sheet 11 is now "Principles one and two" with both principles verbatim at
`.t-d2`; sheet 13's heading carries "absence is silence"), D11 (sheet 17 now
says we adopt the *visibility* at 2px/2px in `--clay-ink` and names its 5.61:1;
sheet 12 states the trade), D14 (their fourth line added), D15 ("Limits" row on
sheet 2, naming the capture dates, the un-inspected live portal, IX48's mis-sized
capture, and that no user has seen any of this), D16 (a second 288px crop of the
"Solid oak table" thumbnail at size, beside the wide crop), D17 (both colophons
now state the panel is seven independent AI reviewer contexts, one per lens),
D18, D19, D20, D21 (one ID form — `IX42`, never `IX-42`; `grep -c 'IX-[0-9]'` =
0), D22 (`VC (keep 1)`, `IA (keep 4)`, `IX (keep 3)`…), D23 (IX47 dropped from
the sheet-11 caption; the sheet-14 annotation now states the pieces *do* sum to
$11,100.00 and that what is missing is the sentence), D24, D25 (four more files
in the Source row), D26 (sheet 2 now claims the recomputation), D27, D28, D29,
D30 (a one-sentence rule under each of the five on sheet 10), D31 (sheet 18 now
names Kody as decider, `docs/vision/VISION-DECISIONS.md` as the ledger, the
first slice, and a fourth reconciliation step), D33 (end buttons carry
`aria-disabled` and write "First sheet"/"Last sheet" into a `role="status"`),
D34, D35, D36, D37, D38 (partly — see below), D39, D40 (the 10px step is gone;
the hint is `.t-head` 11px inside the chrome), D42 (the "continues below" cue),
D43 (below 760px `table.sheet` reflows to stacked `data-label` blocks — no
nested horizontal scroll on sheets 5, 9, 17), D44 (`overflow-wrap: break-word`
on `.t-d1/.t-d2/.t-d3`; sheet 17's title now wraps inside the 20px padding at
390), D45, D48 (the focus cell is captioned "shown, not focusable — tab the
three controls above"), D49 (fallback plates re-cut from the current 390
renders, meta strip at the top edge), D50 ("Prepared for Kody Kochaver"), D51
(`setCurrent` returns early when the index is unchanged), D52 (`allow-same-origin`
dropped; the frames are `sandbox="allow-scripts"` and no console error
appeared), D53 ("the proposal" for theirs, "these sheets" for ours; sheet 8's
title now ends "…than anything in the proposal"), D54 (one sentence on sheet 12
reconciling $9,125.00 and $9,130.00 via the $5.00 transfer fee), D55 (first-use
glosses for the story pole, the doorstep, the letterbox and the mat), D56 (the
cents rule stated on sheet 13, and the sweep run), D57 (partly — a third of the
list entries changed from em-dash to colon), D59 (sheet 2's alt text is
descriptive and the argument moved to the caption; "seven plates in six
pigments (Care shares Install's)").

**Confirmations, left alone as instructed:** D09, D12, D13, D26, D32, D46, D58,
D60. The "must not be changed" list was honoured in full: the token block, the
seven-step scale and the three tiers are still §A verbatim (plus the §F steps);
sheet 4's eight credits are intact and still precede sheet 5; sheet 7's framing
sentence is unchanged; sheet 9's opening line and all nineteen rows are intact;
every verified ratio is printed unrounded; the twelve verified cites are
untouched; dark mode, `forced-colors`, reduced motion, the skip link, the 44px
targets and the 390 fallback-plate mechanism are unchanged; the title stands.

**Declined, with reason:**

- **D38 (frames cut before what they argue) — partly declined.** The binding
  constraint is the 900px viewport, not the frame: raising `.spec-frame` from
  720px to 860px was tested and revealed nothing more, because the extra height
  falls below the fold. Scrolling each frame to an anchor needs
  `allow-same-origin`, which D52 asks us to drop. Instead each specimen sheet
  now carries a second plate cut from the current 1440 render showing exactly
  what its annotations claim — sheet 15 the boards beside the roster head with
  the 43-job overdue trio and the stage plate, sheet 16 the money table, the
  consequence sentence and the two acts at their two weights — and each frame's
  caption says the frame opens at the top and scrolls. Sheet 14 needed no plate:
  at 720px it already opens through "What you owe · $4,060.00" and the
  reconciling sentence.
- **D41 (two-column sheets end bottom-ragged).** Declined. The remedy offered
  (a common plate height with `object-fit: contain`) letterboxes two plates of
  genuinely different aspect ratios onto a false ground, and padding a column to
  match its neighbour is the kind of dead space sheet 7 charges at VC-24. The
  sheets now flow past the viewport by design (ruling 4), so the rag no longer
  reads as a truncation.
- **D47 (the announced figure in Playfair).** Declined. §F B fixes the single
  announced money figure at `.t-d2`, and all three specimens do it that way; the
  deck must not diverge from the sheet it is publishing.
- **D09's back-port** (carrying the deck's semicolon into `synthesis.md`) is out
  of this file's scope; flagged for whoever edits the synthesis.
- **D44's second half** (changing the render tool's overflow test to measure each
  slide against its own box) is a change to `tools/render.mjs`, not the deck.

---

## 3 · 01c findings (T01–T11)

- **T01, T02, T03, T04 — fixed** by ruling 5's systemic change. Verified by
  direct pixel inspection of every corner band, not by inference.
- **T05 — fixed** (`room-band.tsx:134-157`).
- **T06 — fixed** (`R107`, `docs/design/the-document/DECISIONS.md:3775`, named
  for what that line actually says).
- **T07 — fixed** by deleting the reveal system entirely (ruling 11).
- **T08 — n/a, informational.** `loading="lazy"` is kept on the three frames as
  honest markup; the review's own measurement that it defers nothing for a
  `srcdoc` frame on `file://` is not a defect in this file.
- **T09 — n/a, informational.** Three frames, three font requests; unavoidable
  without sharing an origin, which D52 asks us not to do.
- **T10 — declined.** The `:root[data-theme="dark"]` block and the
  `:not([data-theme="light"])` guard stay. There is no toggle, but a host that
  stamps `data-theme` would render one theme's text on the other's ground
  without them; the cost of keeping them is nine lines.
- **T11 — resolved.** §F now has a body, and the deck follows it (ruling 1).

---

## 4 · Render summary

| Run | Command | Captures | Errors | Warnings | Overflow |
|---|---|---|---|---|---|
| Viewport | 18 hashes × {1440, 390}, `--full false --console` | 36 | 0 | 0 | none |
| Full page | sheets 5, 6, 8, 9, 11, 14–17 × 1440 | 9 | 0 | 0 | none |
| Dark | sheets 1, 6, 9, 12, 14, 17 × 1440 | 6 | 0 | 0 | none |
| Reduced motion | sheets 12, 14 × 1440 | 2 | 0 | 0 | none |

All 53 PNGs opened and inspected — full-resolution corner crops of every sheet
at both widths for chrome occlusion, contact sheets for composition, and
eighteen mid-sheet scroll slices plus nine whole-sheet element captures for the
content that sits below the fold.

**One note on the full-page run:** `--full` produces 1440×900 images identical
to the viewport captures, because `#deck` is the scrolling element and the
document itself is only `100dvh` tall. Whole-sheet inspection was done instead
with Playwright element captures and with scroll slices; sheet heights at 1440
measure 900–2,798px (sheets 3 and 10 fit exactly).

**Chrome verification, sheet by sheet.** Bottom-right band (x 940–1440, y
790–900) and bottom-left band (x 0–540, same rows) opened at full resolution for
all 18 sheets at 1440: the single fixed box sits entirely in the right margin,
clear of the 1100px content column, on every sheet. Top band (y 0–120) opened
for all 18 at 390: the docked strip clears every sheet's first line, including
the two deep links that previously landed short.

---

## 5 · Files touched

`deck/index.html` only, plus its renders in `shots/deck/`. No specimen, panel,
synthesis, SPEC or briefing file was edited. Nothing was committed.

---

## Pass 2 — 8 September 2026, after the specimens' final pass

Re-checked the three specimens against the embed: the 13:11 build had already
read the 12:57 files, so all three `srcdoc` payloads were **already current**
and byte-identical (asserted again after re-escaping). What was stale were the
specimen plates, cut at 12:53 from the previous renders — all five re-cut from
the 12:57–12:58 `shots/specimens/` renders: `client-house-default-390`,
`designer-desk-43jobs-390` and `-1440`, `decision-moment-390` and `-1440`.

**Shared-block byte-identity.** Extracted every `.act--inline`,
`.act[aria-pressed]` and `.chip` rule from each specimen and normalised
whitespace. `client-house.html` and `designer-desk.html` carry the identical
**14 rules** (sha1 `cf952fe5c5b5` on both); `decision-moment.html` carries the
same 14 plus three of its own that the other two have no use for — a
`forced-colors` `.act--inline { border-bottom-color: LinkText }`, `.chips` and
`.chips__note`. So the shared block **matches exactly across all three**; the
difference is additive and local to specimen 3.

The deck's own rules differed (my `.act--inline` inherited font properties
individually rather than with `font: inherit`, my chip used 12/24px padding and
`--radius-hair`, and my pressed state was scoped to `.act--tertiary` with no
`[aria-pressed="false"]` branch). The 14-rule block is now copied **verbatim**
into the deck's stylesheet, unreformatted, with a comment saying so.

**Re-gate.** Sheets 12–16 at 1440 and 390, viewport and full-page, plus the
dark and reduced-motion runs, all re-run with `--console`: **55 captures, zero
errors, zero warnings, `horizontalOverflow: false` throughout.** Every PNG
opened, including full-resolution bottom-right and bottom-left 500×110 bands at
1440 and the top 120px band at 390 for sheets 12–16: no chrome over content.
`grep -c` still 0 for `box-shadow`, `text-overflow`, `✓`, `7,040`, `9,120`.

`deck/index.html` = **1,943,610 bytes (1.85 MB)**.

---

## Pass 3 — 8 September 2026, against `review/04-rereview-deck.md`

| # | Ruling | Done |
|---|---|---|
| **R01** | Fixed chrome overlaps the content column by 8px and hides glyphs mid-scroll | **Fixed structurally.** `#chrome` is pinned to `width: var(--chrome-w)` (166px) at `right: 24px`, and every `.slide` now carries `padding-right: calc(var(--chrome-w) + 48px)` at ≥761px, so the content column never enters the chrome's x-band at any scroll position or any width. Chrome rect is now x 1250→1416; the column's right edge is 1148. **Verified by the sweep the re-review asked for, not by corner crops:** a Playwright pass over all 18 sheets at 1440, stepping 200px through each sheet's full height, collecting every text-node client rect *plus* every `img`, `iframe`, `hr`, rule, swatch and `table` box, and intersecting each against the chrome rect — **0 intersections**. |
| **R02** | Tall sheets unreachable by keyboard | **Fixed.** `#deck` now takes `tabindex="0"`, `role="region"` and an accessible name, and is focused on load with `preventScroll`; because a fragment navigation resets the focus point, `place()` reclaims focus each time it runs (measured: `document.activeElement` is `deck` after a deep link at both widths). ArrowDown/ArrowUp step 45% of the viewport **within** the current sheet, PageDown/PageUp/Space step 85%, and each only advances a sheet once the sheet's foot (or head) is already in view; ArrowLeft/ArrowRight/Home/End still jump sheets. Verified: from `#slide-17`, three PageDowns at 1440 and eight at 390 bring the last ruling row ("D1 — A skip link is not persistent nav.") fully into view with the counter still reading 17 / 18. ArrowDown on sheet 9 moves 405px a press with no snap-back. |
| **R03** | Sheets 4 and 9 contradict each other on the five diagnoses | **Fixed, and both now say the same thing.** Sheet 4: "Three of them are rows on sheet 9 — rows 1, 2, 6 and 7; the other two, the boards after the roster and the gate with no consequence, are what specimens 2 and 1 answer on sheets 15 and 14." Sheet 9: "Three of the five diagnoses on sheet 4 are rows here — rows 1, 2, 6 and 7." I did **not** add two rows: IA-17 and IX42 are genuine current-state findings, but sheet 9's nineteen rows are the nineteen items of `synthesis.md` §5 and are protected by 01d's must-not-change list, and three cues on the sheet count them. Naming where the other two are answered is the honest reconciliation. |
| **R04** | Two 390 fallback alts describe content the crops do not contain | **Fixed.** Both rewritten against the decoded crops: sheet 15's alt now ends at "Showing all 43 jobs, grouped by stage" and says the roster head and first stage plate sit just below the crop; sheet 16's ends at the drawn coffee table's caption and says the chips, money table and both acts sit below it. Both captions now read "cropped to the first screen". Sheet 14's alt was re-checked against its crop and is accurate as written. |
| **R05** | 18 money/date strings below the 15px floor | **Fixed, and re-measured to zero.** Every money figure and long-form date in body content is now wrapped in a `.t-money` span (15px, tabular) — the pattern §F B already sets for figures inside a sentence — on sheets 1, 4, 6, 9, 11, 12, 13, 14, 16 and 17, including the quoted act label `Pay $9,130.00`, which is no longer inside `<code>`. Both colophons moved from `.t-meta` to `.t-money` so their dateline clears the floor. Two false positives were reworded rather than resized: "never a `$0` placeholder" → "never a bare zero", and sheet 13's quoted-figure example. A Playwright pass over every text node containing a money figure or a long-form date, excluding `figcaption`, `.t-head` and the letterhead, reports **0 strings below 15px**. |
| **D44 / R13** | Sheets 12 and 17 overflow at 320px | **Fixed.** `.tier-bench` scrolls inside its own box (with 6px vertical padding so a focus ring is never clipped) and `code` takes `overflow-wrap: anywhere`. Per-slide `scrollWidth` vs own `clientWidth` — the test the render tool structurally cannot do — is now **zero overflow at 1440, 390 and 320**. |
| **H1** | `decision-moment.html` `<title>` | Changed to `Two Acts, Two Weights`; the page `h1` still reads "Cedar Lane Study". Recorded in `review/02-fix-log-decision-moment.md`. The specimen was re-embedded and all three payloads re-asserted byte-identical. |
| **H2** | `tools/render.mjs` device scale factor | `deviceScaleFactor` moved out of the `viewport` object to a top-level `newContext` option, where Playwright actually reads it. 390 captures now render and save at **780×1688** instead of 390×844. Noted in `tools/README.md` under a new "Device scale factor" heading, with the warning that pre- and post-fix captures differ in pixel size even when the page has not changed. |

**Also taken from the re-review's non-blocking list:** R06 (the cover carries `fits-wide`, so its false "continues below" cue is suppressed at ≥761px), R07 (the shared-block comment no longer claims byte-identity it does not have — it says the declarations are identical and the rules re-spaced), R08 (`dismissHint()` now fires from the scroll listener too; measured: the hint is gone after a 700px wheel), R09 (the enlarged thumbnail is declared 288×288 and rendered at 288px, and its caption says "at 288px" rather than "at size"; the doorstep plate is declared 930×330), R11 ("due in three days" on the cover and sheet 6), R14 (`#counter` is no longer a live region; `#deck-status` remains the one `role="status"`), R20 (sheet 4 row 1 cites `IA-17` alone; `L2` stays where sheet 5 uses it correctly).

**Recorded, not changed:** R10 (the 9px room-name figure is inherited verbatim from IX41 and `synthesis.md`; correcting it is a synthesis edit, and the deck should not silently diverge from its source), R12 (the deck's own nav buttons are 30×30 / 28×28 — above WCAG 2.5.8's 24px but below the 44px the deck publishes for *acts*; deck chrome is not an act on a client surface, and widening it would push the chrome back into the column R01 just cleared), R15, R16 (two back-ports owed to `synthesis.md` — D09's semicolon and the corrected reading of `DECISIONS.md:3775`; flagged for whoever edits that file), R17, R18, R19.

**Pass 3 gate.** 48 captures: 36 viewport (18 × {1440, 390}), 6 full-page 1440 (sheets 9, 11, 14–17), 3 dark (1, 10, 14), 1 reduced-motion (12), 2 at 320px (12, 17). **Zero console errors, zero warnings, `horizontalOverflow: false` on every capture**, and zero per-slide overflow at all three widths. All 48 PNGs opened, plus a right-margin band from every sheet at 1440. `grep -c` = 0 for `box-shadow`, `text-overflow`, `✓`, `7,040`, `9,120`. All three `srcdoc` payloads re-asserted byte-identical to the current specimen files.

`deck/index.html` = **1,947,256 bytes (1.86 MB)**.
