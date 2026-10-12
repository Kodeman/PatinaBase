# US-26 deck render check (SQ-798)

Rendered from `deck/index.html` after SQ-798's fix pass, at 1440 × 900 and 390 × 844.

## How it was run

- **Claude in Chrome could not do this check.** It refused the `file://` URL ("Can't interact with browser-internal or unparseable URLs"). Served from `127.0.0.1` instead, the page loaded, and `read_console_messages` reported no console errors on the cover. But every screenshot and script call then failed with "Cannot access contents of url \"about:srcdoc#frame-a1&nobar&nobefore\". Extension manifest must request permission to access this host": the deck's mockups are sandboxed `srcdoc` frames, and the extension cannot reach them.
- **The check was run in headless Chromium instead** (Playwright 1.58.2), from a `file://` URL, at both widths. For each sheet the script:
  1. sets the hash to the sheet;
  2. scrolls each mockup frame into view, so that the lazy frames load;
  3. reads inside each frame (`contentFrame`).
- **What each column checks:**
  - **Mockups render:** each frame is laid out taller than 40 px; its specimen body is taller than 100 px; the named `data-frame` element is shown, more than 100 px tall, and holds more than 20 characters of text.
  - **Screenshots load:** every walk `<img>` has finished loading and has a natural width.
  - **No horizontal scroll:** `documentElement.scrollWidth` and `body.scrollWidth` are no wider than the viewport.
  - **No console errors:** no `console.error` and no page error while the sheet is shown.
- **The pager label (triage O1)** now wraps instead of clipping. At 390 it wraps to two lines on the six sheets with longer labels (31 px tall), and never overflows its box.
- **The renders** are `_renders/NN-<sheet>-<width>.jpg`: the first viewport of each sheet, at the top of the sheet. The raw per-sheet data is in the board's verification folder (`verification/SQ-798/render.json`), outside the repo.

## Result: every sheet passes at both widths

| # | Sheet | 1440 | 390 |
|---|---|---|---|
| 01 | `s-cover` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 02 | `s-ask` | **PASS** · no mockups · 1 screenshot loaded · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · 1 screenshot loaded · scrollWidth 390 · 0 console errors |
| 03 | `s-today` | **PASS** · no mockups · 3 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · 3 screenshots loaded · scrollWidth 390 · 0 console errors |
| 04 | `s-moments` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 05 | `s-team` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 06 | `s-principle` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 07 | `s-three` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 08 | `s-a` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 09 | `s-a-rest` | **PASS** · 2 mockups rendered · 2 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 2 mockups rendered · 2 screenshots loaded · scrollWidth 390 · 0 console errors |
| 10 | `s-a-act` | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 390 · 0 console errors |
| 11 | `s-a-hire` | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 390 · 0 console errors |
| 12 | `s-a-tag` | **PASS** · 1 mockup rendered · 1 screenshot loaded · scrollWidth 1440 · 0 console errors | **PASS** · 1 mockup rendered · 1 screenshot loaded · scrollWidth 390 · 0 console errors |
| 13 | `s-a-score` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 14 | `s-b` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 15 | `s-b-rest` | **PASS** · 2 mockups rendered · 2 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 2 mockups rendered · 2 screenshots loaded · scrollWidth 390 · 0 console errors |
| 16 | `s-b-act` | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 390 · 0 console errors |
| 17 | `s-b-hire` | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 390 · 0 console errors |
| 18 | `s-b-tag` | **PASS** · 1 mockup rendered · 1 screenshot loaded · scrollWidth 1440 · 0 console errors | **PASS** · 1 mockup rendered · 1 screenshot loaded · scrollWidth 390 · 0 console errors |
| 19 | `s-b-score` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 20 | `s-c` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 21 | `s-c-rest` | **PASS** · 2 mockups rendered · 2 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 2 mockups rendered · 2 screenshots loaded · scrollWidth 390 · 0 console errors |
| 22 | `s-c-act` | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 390 · 0 console errors |
| 23 | `s-c-hire` | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 1440 · 0 console errors | **PASS** · 4 mockups rendered · 4 screenshots loaded · scrollWidth 390 · 0 console errors |
| 24 | `s-c-tag` | **PASS** · 1 mockup rendered · 1 screenshot loaded · scrollWidth 1440 · 0 console errors | **PASS** · 1 mockup rendered · 1 screenshot loaded · scrollWidth 390 · 0 console errors |
| 25 | `s-c-score` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 26 | `s-compare` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 27 | `s-rec` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 28 | `s-canon` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 29 | `s-fixnow` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 30 | `s-slices` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 31 | `s-questions` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |
| 32 | `s-asks` | **PASS** · no mockups · scrollWidth 1440 · 0 console errors | **PASS** · no mockups · scrollWidth 390 · 0 console errors |

Totals: 64 of 64 sheet renders pass. The 24 mockups on sheets 09–12, 15–18 and 21–24 are counted at both widths.
