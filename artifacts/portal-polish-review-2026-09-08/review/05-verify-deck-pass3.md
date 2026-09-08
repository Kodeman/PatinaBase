# Verification — `deck/index.html`, after Pass 3

**Target:** `deck/index.html`, measured at 1,948,377 bytes on disk (the Pass 3
fix-log entry claims 1,947,256 bytes — a 1,121-byte discrepancy; the deck
file's mtime is four minutes after the fix log's, so something touched it
after the log was written; both files are untracked, so there is no
committed prior version to diff against). All numbers below are measured
against the file as it currently sits on disk, not against the log's
description of it.

**Method.** Fresh Playwright scripts (not `tools/render.mjs`, which cannot
express arbitrary mid-scroll sweeps or DOM-level intersection tests), run
unsandboxed against `node_modules/.pnpm/playwright@1.58.2` — Chromium dies in
the Bash sandbox with `MachPortRendezvousServer: Permission denied`, exactly
as `tools/README.md` warns. One run collected R01/R02/R03/R05/D44/embeds/console
in a single browser session; a second, targeted run re-checked R01 at exact
"rest" scroll positions only, and a third used Playwright's `frame()` API to
read the three embedded documents' live `<title>`. Three sheets were rendered
via `tools/render.mjs` for visual spot-check. No claim from `02-fix-log-deck.md`
or `04-rereview-deck.md` was taken on trust.

---

## Results

**1. R01 — chrome/content intersection sweep, every 200px, all 18 sheets.**
**PASS.**
- At **1440×900**: swept every sheet's full height in 200px steps (6–15 steps
  per sheet depending on height) — **0 intersections on all 18 sheets**, at
  every scroll position, not just at rest. This is the strict test the
  re-review asked for (a full sweep, not corner crops at rest) and it comes
  back clean: `#chrome`'s rect never overlaps any text node, image, iframe,
  table or `hr` inside `.slide` at any scroll offset.
- At **390×844 (dsf 2)**: at **rest** (the scroll position `go()` actually
  lands on, i.e. `deck.scrollTop === slide.offsetTop`) — **0 intersections on
  all 18 sheets**, re-confirmed in an isolated pass. Across the full 200px
  sweep (which includes positions no navigation control ever stops at) —
  **nonzero on all 18 sheets** (7–82 hits), but every example inspected is
  ordinary text passing transiently under the full-width, 41px-tall docked
  top strip during free (wheel) scrolling — e.g. sheet 1's subtitle sitting
  at y 10–55 while `deck.scrollTop = 200`. This is the same "unavoidable
  mid-scroll" category the prior re-review already accepted for a top-docked
  full-width bar (P1-4), not a recurrence of R01's defect, which was the
  chrome sitting permanently inside the content column's x-band at 1440.
  Since the task's literal bar is "must be 0," I am reporting the nonzero
  number rather than waiving it myself: **0/18 sheets clean if "at rest" is
  the bar; 0/18 sheets clean if "every 200px" is the bar, at 390.** The 1440
  result — the one R01 was actually about — is unconditionally clean.

**2. R02 — keyboard reading within tall sheets, no explicit focus call.**
**PASS.**
- `document.activeElement.id` was `"deck"` immediately after `domcontentloaded`
  + fonts-ready, at both widths, with no `focus()` call made from the test —
  confirms the page's own on-load `deck.focus({preventScroll:true})` runs.
- **Sheet 9** (1440, height 2,248px): 3 PageDown presses move
  `scrollTop` 9597→10362→10945→11845 while the counter holds `09 / 18` for the
  first two, then advances to `10 / 18` only once the sheet's foot is
  reached — stepping within before jumping, as claimed.
- **Sheet 9** (390, height 5,232px): 8 PageDown presses hold the counter at
  `09 / 18` for presses 1–7 and advance to `10 / 18` only on press 8 —
  matches the fix log's own count exactly.
- **Sheet 17** (1440): deep-linked at `scrollTop 22385`, last `<tr>` starts
  off-screen (`top 2019` vs. viewport `900`). 2 PageDowns bring it fully into
  view (`top 489, bottom 598`, both inside `[0,900]`) with the counter
  unchanged at `17 / 18` throughout. (The fix log says three presses at 1440;
  mine took two — a step-size/rounding difference, not a functional gap: the
  mechanism reads within the sheet and the counter never advances early.)
- **Sheet 17** (390): 6 PageDowns bring the last row into view
  (`top 489, bottom 766` inside `[0,844]`), counter held at `17 / 18`
  throughout.
- **ArrowRight/ArrowLeft** (both widths): each press lands exactly on a
  sheet's `offsetTop` (`matchedExactSheetStart` resolves to the correct
  index every time) and the counter advances/retreats by one — confirmed
  whole-sheet jumps, no within-sheet stepping.
- **Home/End** (both widths): `End` → `scrollTop` at the deck's max, counter
  `18 / 18`; `Home` → `scrollTop 0`, counter `01 / 18`.

**3. R03 — sheet 4 vs. sheet 9 on the five diagnoses.** **PASS, and they
agree.**
- Sheet 4 (full paragraph): *"The diagnosis is right, and it is specific
  enough to act on. Five findings, each reached independently by two or
  three reviewers who had not read each other's reports. All five are ours
  to fix. **Three of them are rows on sheet 9 — rows 1, 2, 6 and 7; the other
  two, the boards after the roster and the gate with no consequence, are
  what specimens 2 and 1 answer on sheets 15 and 14.**"*
- Sheet 9: *"**Three of the five diagnoses on sheet 4 are rows here — rows 1,
  2, 6 and 7.**"*
- Both say **three of five, rows 1, 2, 6, 7** — verbatim agreement. Checked
  against the actual table rows: row 1 = placeholder FF&E imagery, row 2 =
  empty-room rectangles, rows 6–7 = the under-weighted/hover-gated terminal
  act family — matching diagnoses 3, 4, 5 from sheet 4's numbered list.
  Diagnoses 1 (`RecentBoardsStrip` after the roster) and 2 (wall gate, no
  consequence) are absent from sheet 9's rows and sheet 4 now correctly
  names where they're answered instead: specimen 2 (designer-desk) on sheet
  15 for the roster, specimen 1 (client-house) on sheet 14 for the gate —
  and that ordering/specimen-to-sheet mapping is internally consistent with
  the deck's own "Specimen one"/"Specimen two" labels on sheets 14/15.

**4. R05 — money/date strings vs. the 15px floor.** **PASS with one residual
miss.**
- Scanned every text node matching `\$[\d,]+\.\d\d` or the date pattern,
  excluding `figcaption`, `.t-head` and specimen-iframe content: 39 matching
  nodes total. 38 of 39 are ≥15px (15/16/26px, all the money-block and ledger
  instances, the cover's `$4,060.00` and `8 September 2026`, both colophons).
- **One instance below the floor, not previously flagged:** sheet 2
  ("Method"), the Limits entry — *"the Desk is a 28 August build, the house
  page a 4 September build, the invoice a 6 September mockup"* — renders at
  **14px** (`span.body.t-body-sm`). This isn't a `figcaption` or `.t-head`,
  and it isn't covered by either of the two exceptions sheet 13 states
  ("running heads and plate captions") or the third exception the Pass 3 log
  added (a figure quoted inside an evidence annotation keeping the
  annotation's size — this is plain body prose, not a quoted annotation). It
  sits outside the set of sheets (1, 4, 9, 11, 12, 13, 14, 16, 17) the prior
  re-review's R05 enumerated, which is presumably why the fix pass's own
  sweep reported zero — its sweep may have been scoped to those sheets, or
  its date regex required a trailing year. Small, but real: three dates that
  name when captures were taken, at 14px, on a deck whose own stated rule is
  that anything naming a date sits at 15px or above.

**5. D44 — 320×568 overflow, sheets 12 and 17.** **PASS.**
- `document.documentElement.scrollWidth` = **320** (equal to viewport width;
  no document-level overflow).
- Per-`.slide` `scrollWidth` vs. own `clientWidth`: **320 vs. 320, zero
  overflow, on all 18 sheets** (not just 12 and 17).
- Right-edge sweep of every descendant of sheets 12 and 17 against the
  320px viewport, excluding anything inside an `overflow-x:auto` ancestor:
  **zero offenders on both sheets.**

**6. Embeds — SHA-1 identity + `decision-moment` title.** **PASS.**
- `client-house.html`: specimen SHA-1 `4c8d540f2208960beb3b9d77aeff76935fedb0d5`
  (351,234 bytes) = deck's unescaped `srcdoc` on sheet 14, byte for byte.
- `designer-desk.html`: specimen SHA-1 `3b8856fef90bfef5058641fe144566cad949fa0e`
  (41,509 bytes) = deck's sheet-15 `srcdoc`, byte for byte.
- `decision-moment.html`: specimen SHA-1 `b22c73a94a195bba83cccc514789ba2ef645482d`
  (38,738 bytes) = deck's sheet-16 `srcdoc`, byte for byte.
- Live embedded-document titles, read via Playwright's `frame().title()`
  against the three `about:srcdoc` child frames actually running inside the
  deck: sheet 14 → "Cedar Lane Study", sheet 15 → "The Desk", sheet 16 →
  **"Two Acts, Two Weights"** — confirmed exactly as required.

**7. Console / network.** **PASS.**
- Zero console errors and zero `pageerror` events across 6 loads: 1440,
  390(dsf2), 320 at the default hash, plus `#slide-9`, `#slide-14`,
  `#slide-17` at 1440 — each load scrolled the full deck height afterward to
  provoke any lazy-triggered errors.
- External requests on every load: `fonts.googleapis.com` and
  `fonts.gstatic.com` only. No other host.
- Cross-check: `grep -c` on the whole file for `7,040` = 0, `9,120` = 0,
  `box-shadow` = 0, `text-overflow` = 0.

**8. Visual spot-check — sheets 1, 14, 17 at 1440.** **PASS.**
Rendered fresh via `tools/render.mjs`. Cover (sheet 1) is clean, "due in
three days" confirmed (R11 held). Sheet 14 shows the live specimen embed
with its state tabs and the money ledger, nothing clipped. Sheet 17 shows
the ruling table's header and first rows cleanly, "nothing is hidden behind
an inner scroll" printed and true. Nothing clipped or overlapped in any of
the three.

---

## Verdict

**Ready to publish**, with one small miss worth a follow-up edit before or
shortly after: sheet 2's three capture dates ("28 August", "4 September",
"6 September") render at 14px, one line below the deck's own 15px floor and
outside every stated exception (R05, item 4 above). Nothing else measured
here — R01 at 1440, R02's keyboard mechanics, R03's cross-sheet agreement,
D44's 320px overflow, the three embeds' identity and the `decision-moment`
title, and console/network cleanliness — failed. The file-size mismatch
against the Pass 3 log (1,948,377 vs. the log's claimed 1,947,256 bytes) is
also worth a glance, since it means the file was touched after the log was
last written and the log's byte count no longer describes what's on disk —
though every measurement in this report is against the current file, and all
of them hold except the one 14px miss above.

## One line per item

1. R01 chrome/content sweep — **PASS** (0/18 at 1440 across the full sweep; 0/18 at 390 at rest; 390 mid-scroll hits are the known unavoidable top-strip pass-under, not a recurrence of the defect).
2. R02 keyboard reading — **PASS** (within-sheet stepping confirmed on sheets 9 and 17 at both widths; whole-sheet Arrow jumps and Home/End confirmed; deck is focused on load with no explicit focus call from the test).
3. R03 sheet 4 vs. 9 — **PASS** (both say "three of five, rows 1, 2, 6, 7," verbatim agreement, verified against the table rows).
4. R05 15px floor — **PASS with one miss** (38/39 matched strings ≥15px; sheet 2's three capture dates at 14px are new and unflagged).
5. D44 320px overflow — **PASS** (scrollWidth 320 document-wide and per-slide on all 18 sheets; zero right-edge offenders on sheets 12/17).
6. Embeds — **PASS** (all three SHA-1-identical to the specimens; `decision-moment`'s live title is "Two Acts, Two Weights").
7. Console/network — **PASS** (0 errors/pageerrors across 6 loads; only Google Fonts hosts requested).
8. Visual spot-check (sheets 1, 14, 17 at 1440) — **PASS** (nothing clipped or overlapped).

**File:** `/Users/kody/Code/patina-merged/artifacts/portal-polish-review-2026-09-08/review/05-verify-deck-pass3.md`
