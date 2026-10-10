# US-24 deck render check (SQ-734)

- **Deck:** `deck/index.html`, built from base `4b2798e97` with `node artifacts/designer-portal-uplift-2026-10-09/deck/build.mjs`, 4,705,575 bytes (4.49 MB). The built file is not committed.
- **Browser:** Google Chrome, headless (Playwright 1.58.2 with `channel: chrome`), opened via `file://`. Light colour scheme.
- **Viewports:** 1440×900, then 390×844. Every one of the 27 sheets was visited at each width; the script scrolled each sheet into view and waited for its lazy frames to load and post their height.
- **Automated checks per sheet:** document, deck and sheet horizontal scroll; elements past the right edge; leaf-text overflow; broken `<img>`; mockup iframe size and content (Playwright frame access); axe-core 4.11.1 `color-contrast` on each sheet and inside each of the 18 mockup frames; visible "AI" copy in the deck and in the frames; console errors, page errors and failed requests.
- **Files here:** `slide-NN-1440.jpg` is the first screen of each sheet at 1440×900 (what a founder sees on arrival), JPEG quality 75, `-Z 1440`. `slide-01-390.jpg`, `slide-14-390.jpg` and `slide-23-390.jpg` are the cover, the recommended B Desk and the comparison at 390×844.
- **Full-height captures** of every sheet (1440 wide) and of five sheets at 390, plus the raw JSON results, are board evidence, kept outside the repo in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-734/` (`tall/`, `tall390/`, `1440/results-1440.json`, `390/results-390.json`).

## Result in one line

The deck renders cleanly at both widths. There are no console errors, no horizontal scroll, no broken images, no blank frames, no axe contrast violations and no "AI" copy. Every 1440 frame from Direction B loses its bottom 10px. The remaining findings are about clarity for a first-time reader, not rendering.

## Per sheet

"ok" means: no horizontal scroll, no overflow, no broken image, frames loaded with content, and no contrast violation at that width. "Tall" means the sheet is taller than the viewport and reads by scrolling down with ↓, as designed.

| # | Title | 1440 ok? | 390 ok? | Issue |
|---|---|---|---|---|
| 1 | Calm, and findable. | ok | ok | none |
| 2 | The ask | ok (tall, 1057) | ok (tall) | none |
| 3 | A panel of seats, each with one lens, working apart | ok | ok (tall) | F4: "Every seat is a model" comes after the cover's "a review panel walked it". F8: the Walk row's output cell runs to the table's right rule. |
| 4 | What a designer sees today | ok (tall) | ok (tall) | F2: the three Today screenshots are about 355px wide, so their text cannot be read. |
| 5 | Eight moments, one found outright | ok (tall) | ok (tall; the table reflows to stacked cards) | The marks-at-rest numbers sit just below the 1440 fold. |
| 6 | What the panel found | ok (tall) | ok (tall) | F5: finding codes (A1, A3 A4) and code citations (`need-class.ts:143`) are noise for a founder. |
| 7 | Calm, measured. Findable, measured. | ok | ok (tall) | F3: "to be recounted on the specimens at render check" is process language, and no recount appears in the deck. |
| 8 | Three directions, one model underneath | ok | ok (tall) | F5: "S1-severity", "N1–N8" and "Pulses" are not explained here. |
| 9 | Quiet marks: the same rooms, telling the truth | ok | ok (tall) | F5: "Model: N1–N3, N4 read-only, N6–N8. Not N5" is opaque. |
| 10 | A · Monday, 8:40 am: the same cards, ranked by consequence | ok (tall, frames a1 1123×1047, a8 318×1088) | ok (tall; the 1440 frame is scaled to 356px with a "scaled to fit" note) | F6: the "N ESTER" pill in the Today screenshots. |
| 11 | A · The quiet PO surfaces, and each job has one leader | ok (tall, frames a3, a5) | ok (tall, scaled frames) | none |
| 12 | A · 5:50 pm, and the scores | ok (tall, frame a7) | ok (tall, scaled frame) | none |
| 13 | The Day Sheet: five sentences, then the rest are on their jobs | ok | ok (tall) | none |
| 14 | B · Monday, 8:40 am: what needs you, in five sentences | F1 (frame b1 clipped 10px) | F1 (b1 scaled; b8 ok) | F1 |
| 15 | B · A client moved; a maker went quiet | F1 (b2, b3 clipped 10px) | F1 | F1. Minor: in b2/b3 the overlay sheet covers the line ends of the Desk underneath, which is intended. |
| 16 | B · A deposit landed; an invoice is overdue | F1 (b4 clipped 10px) | F1 (b4; b10 ok) | F1. F7: markers 2 and 3 nearly overlap beside PO-PC-0431 in b4. |
| 17 | B · The job agrees with the Desk; the hire sees their own | F1 (b5, b6 clipped 10px) | F1 | F1 |
| 18 | B · 5:50 pm: "Nothing needs you tonight." | F1 (b7 clipped 10px) | F1 | F1 |
| 19 | The job workspace: act inside the job, not from the Desk | ok | ok (tall) | none |
| 20 | C · Monday, 8:40 am: who holds the ball | ok (tall, frame c1) | ok (tall, scaled frame) | none |
| 21 | C · The job opens on its step, with the work in place | ok (tall, frames c5, c9) | ok (tall) | none |
| 22 | C · 5:50 pm: "The round is done." | ok (tall, frame c7) | ok (tall, scaled frame) | none |
| 23 | Side by side | ok (tall, 948) | ok (tall; the table stacks) | none. Honest footnote: "verified by nothing yet". |
| 24 | We recommend B, built from the model up | ok (tall) | ok (tall) | none |
| 25 | The fix-now track, under any direction | ok (tall) | ok (tall, 4284px, the longest sheet at 390) | none |
| 26 | Fourteen questions for the partners | ok (tall) | ok (tall) | F5: the Q-cards cite rulings (V7-D1, US-19 D8, R143) without a gloss. |
| 27 | Next steps, and what only Leah can tell us | ok (tall) | ok (tall) | none |

## Checks

- **Mockup iframes blank or wrongly sized:** none blank. All 18 frames loaded, and each shows its single frame (`#frame-xx&nobar&nobefore`) with 1,265–2,893 characters of text. The deck sizes every frame from its posted height. Frame inner height minus document height:
  - every A and C frame, and the 390 B frames (b8, b10): 0px;
  - every 1440 B frame (b1, b2, b3, b4, b5, b6, b7): 10px short (F1).
- **Text overflow:** none detected at either width; no leaf element's `scrollWidth` exceeds its `clientWidth`.
- **Horizontal scroll:** none. The document, `#deck` and every sheet have `scrollWidth` equal to `clientWidth` at 1440 and at 390, no element pokes past the viewport, and no frame scrolls sideways inside.
- **Broken images:** none visible. Every deck `<img>` (the inlined walk screenshots) is complete with a natural width.
  - Each specimen frame does carry 4–7 `<img>` without a `src`. These are the specimens' own hidden Today figures, which `build.mjs` renames to `data-walk-src` on purpose (build.mjs:30–32, 98). They are hidden by `nobefore` and never render, so they are a false positive.
- **Low contrast:** axe-core `color-contrast` reports 0 violations on all 27 sheets at both widths and inside all 18 frames.
- **Visible "AI" copy:** none. A regex for `\bAI\b` or `A.I.` over every sheet's text and every frame's text found 0 matches.
- **Console errors:** none at either width (0 console errors or warnings, 0 page errors, 0 failed requests).

## Findings, worst first

1. **F1. Every 1440 Direction B frame is clipped by 10px. Severity: low (rendering).**
   - Affected: b1, b2, b3, b4, b5, b6, b7 on sheets 14–18. Each B 1440 specimen's document is 10px taller than the height its bootstrap posts. The bootstrap measures `body.scrollHeight`, so a trailing margin is probably outside the body.
   - What you see: the last "What changed and why" line sits flush on the frame's bottom edge, with no bottom padding. On sheet 18 that line is "No tally of handled lines … no streak. Q1".
   - A reader may take that last line as cut off. No words are lost in the captures.
2. **F2. The Today screenshots are too small to read at 1440. Severity: medium (comprehension).**
   - Where: sheet 4, and the Today panel at the top of sheets 10–22, where each screenshot is about 355–400px wide.
   - What a founder would misunderstand: the before/after comparison rests on the caption and bullets, not on the picture. The founder cannot check "$9,200 OUT" or "Standing · 6" in the image itself. Nothing on the sheet says how to see the screenshot larger.
3. **F3. Sheet 7 leaks process language. Severity: medium (trust).**
   - The text: "Direction figures are estimates from the synthesis, to be recounted on the specimens at render check."
   - A founder does not know what "render check" is. No recount appears in the deck, so it reads as a promise left unkept.
   - This check did not recount the marks, because that is outside a render review.
4. **F4. The cover and sheet 3 frame the panel differently. Severity: low–medium.**
   - The cover says "A review panel walked it". Sheet 3 says "Every seat is a model… Two model families took part" and names GPT-6 and Claude in the table.
   - A first-time founder may be surprised that the "panel" is not people. The disclosure is honest; the cover could set it up.
5. **F5. Internal codes run through the founder-facing sheets. Severity: low–medium.**
   - Examples: A1/A3/A10, R1-01, R2-13, N1–N8, V7-D1, US-19 D8, R143, "S1-severity", "Pulses", and `need-class.ts:143` citations. They appear on sheets 6, 8, 9 and 26, and in the "What changed" notes inside every frame.
   - They are useful for audit but slow a founder down, and sheet 8's "N1–N8" is the first place the shared model is named. A one-line gloss, or a key on sheet 8, would help.
6. **F6. A dev badge sits over the Today screenshots. Severity: low.**
   - The walk screenshots show the Next.js dev indicator ("N") on top of the TESTER pill, so it reads "N ESTER". It is clearest in the 390 Today shots on sheets 10, 14 and 16.
   - A founder may read it as a product element.
7. **F7. Two markers nearly overlap in frame b4. Severity: low.**
   - Where: sheet 16, frame b4, where the numbered markers 2 and 3 are stacked beside the first purchase order (PO-PC-0431).
8. **F8. One table cell runs to the edge on sheet 3. Severity: cosmetic.**
   - The Walk row's output cell, "walk/WALK.md, 56 screenshots", reaches the table's right rule at 1440.

## Judged as a first-time founder

The story holds:
- the ask;
- who looked;
- what is wrong today, with eight moments;
- the principle;
- three directions, each with live mockups;
- side by side;
- the recommendation;
- fix-now;
- the questions;
- next steps.

The recommended B mockups (sheets 14–18) are the clearest sheets in the deck. Five sentences with one action each, the follow-up sheets that say "Nothing is sent until you press Send", and "Nothing needs you tonight." all read at once.

What a founder would find confusing:
- the code-heavy notes (F5);
- the unreadable Before thumbnails (F2);
- the "render check" line (F3).

At 390 the deck reflows well. Tables become stacked cards. The 1440 mockups are scaled to 356px with an honest "scaled to fit — open on a wider screen" note, so desktop mockups are not readable on a phone, by design. The 390 mockups are full width and readable.
