# Deck render check (US-27 W6b, SQ-813)

The built `deck/index.html` was rendered headless in Chromium (Playwright 1.58.2) at **1440×900** and **390×844**, each in **light** and **dark** (`colorScheme`). Every one of the 30 slides was rendered, including all 49 inlined specimen frames. The result: **no open defects.**

| Config | Slides | Frames painted | Page / deck horizontal scroll | Console errors |
|---|---|---|---|---|
| 1440×900 light | 30 / 30 | 49 / 49 | 0 / 0 | 0 |
| 1440×900 dark | 30 / 30 | 49 / 49 | 0 / 0 | 0 |
| 390×844 light | 30 / 30 | 49 / 49 | 0 / 0 | 0 |
| 390×844 dark | 30 / 30 | 49 / 49 | 0 / 0 | 0 |

Renders are in `deck/_renders/`: 120 JPGs (30 slides × 4 configs), 14,665,018 bytes in total, under the 15 MB cap. Each file is named `NN-<slide-id>-<width>-<scheme>.jpg`.

## Method

- The deck fragment was wrapped with a doctype and a viewport meta, then loaded from `file://`. The probe waits for every frame to load before measuring.
- **Measured per slide:** horizontal scroll at the page, `#deck` and slide level; any element whose right edge passes the viewport; text clipped by an `overflow` ancestor; text boxes overlapping other text boxes, with an occlusion test; links and controls under 44 px.
- **Measured per frame:** the document width against the client width, and the content bottom against the frame height (nothing cut at the foot). The same clipping and overlap probes run inside each frame document.
- **Screenshots:** each slide's height is frozen first. The viewport then grows to that height, so out-of-process iframes paint (without this they come out blank). Captures use a scale of 0.8 at 1440 and 1 at 390, JPEG quality 34.
- **Read by eye:** contact sheets of every slide in all four configs. All 1440 and 390 light sheets were read in full, and the dark sheets were spot-checked (opening, middle and closing sheets at both widths).
- Scripts and the raw report (`render-report.json`) are kept outside the repo, in the ticket's verification folder.

## Per slide

"Clean" means rendered, 0 horizontal scroll, 0 overflow right, 0 clipped text and 0 text overlap in all four configs. "Frames" gives the specimen frames on the slide and their worst content-bottom minus frame height. 0 to 2 px means nothing is cut.

| # | Slide | 1440 L | 1440 D | 390 L | 390 D | Frames (content bottom − height) | Notes |
|---|---|---|---|---|---|---|---|
| 01 | s-cover | clean | clean | clean | clean | none | |
| 02 | s-ask | clean | clean | clean | clean | none | |
| 03 | s-ruled | clean | clean | clean | clean | none | |
| 04 | s-today | clean | clean | clean | clean | none | Walk screenshots only |
| 05 | s-principle | clean | clean | clean | clean | none | |
| 06 | s-system | clean | clean | clean | clean | none | R1 copy: plate on a 1 px `--card-edge` |
| 07 | s-tokens | clean | clean | clean | clean | none | |
| 08 | s-areas | clean | clean | clean | clean | none | R2: area links at 44 px, wrapping kept at 390 |
| 09 | s-desk | clean | clean | clean | clean | desk-p1, p7 (0) | |
| 10 | s-desk-act | clean | clean | clean | clean | desk-p2, p3 (0) | |
| 11 | s-desk-day | clean | clean | clean | clean | desk-p4, p5, p6, p8 (0) | |
| 12 | s-desk-dark | clean | clean | clean | clean | desk-d1, d2 (0) | |
| 13 | s-doc | clean | clean | clean | clean | document-p1, p2, p4 (0) | |
| 14 | s-doc-spec | clean | clean | clean | clean | document-p3, p5, d1 (≤2) | |
| 15 | s-rooms | clean | clean | clean | clean | rooms-p1, p2, p3 (≤2) | Plates now on `--card-edge` (R1) |
| 16 | s-people | clean | clean | clean | clean | people-p1, p2, p3 (≤2) | |
| 17 | s-library | clean | clean | clean | clean | library-p1, p2, p3 (0) | Plates now on `--card-edge` (R1) |
| 18 | s-boards | clean | clean | clean | clean | boards-p1, p2 (0) | Plates now on `--card-edge` (R1) |
| 19 | s-boardroom | clean | clean | clean | clean | boards-p3, p4 (≤2) | |
| 20 | s-papers | clean | clean | clean | clean | papers-p1, p2, p4 (0) | |
| 21 | s-ceremony | clean | clean | clean | clean | papers-p3, p5 (0) | |
| 22 | s-money | clean | clean | clean | clean | money-p1, p2, p6, p7 (0) | Frame overlap flags are intended layering, see below |
| 23 | s-money-acts | clean | clean | clean | clean | money-p3, p4, p5, d1 (0) | Frame overlap flags are intended layering, see below |
| 24 | s-chrome | clean | clean | clean | clean | chrome-p1, p2, p6, p7 (0) | Plate in chrome-p6 on `--card-edge` (R1) |
| 25 | s-chrome-pages | clean | clean | clean | clean | chrome-p3, p4, p5 (≤2) | |
| 26 | s-desk-build | clean | clean | clean | clean | none | |
| 27 | s-desk-rule | clean | clean | clean | clean | none | |
| 28 | s-house | clean | clean | clean | clean | none | |
| 29 | s-slices | clean | clean | clean | clean | none | |
| 30 | s-questions | clean | clean | clean | clean | none | 21 label flags explained below |

## Flags that are not defects

- **Money frame overlaps** (money-p1 5, p2 5, p3 3, p4 10, p6 21, p7 16, d1 5 text-box intersections in every config). The overlapping pairs are the sheet's text over the veiled Desk greeting beneath it, for example "Good morning," against "Studio accounts · Ledger". That is the L4 sheet over the scrimmed page the specimens draw on purpose (one sheet over a veiled Desk, U-Q16). The occlusion test reports the underlying text as covered, and the renders show the sheet reading clean on its veil. The occluded flags in desk-p2 and chrome-p1 and p7 are the same pattern (an inquiry sheet and the ⌘K sheet over the veiled Desk).
- **Small targets on s-questions** (21 in every config). These are `label.note-l` captions: 20 × "A note (optional)" and 1 × "Your rulings as text, to send to Kody". Each one labels a textarea that is itself far larger than 44 px, so the captions are not targets. No link or button anywhere in the deck measures under 44 px.
- **Visually hidden text** (`.vh`, `.sr-only`, and table `thead` hidden with a clip-path at 390) is left out of the clipped-text probe because it is clipped on purpose.
- **One broken image:** `#lightbox-img` is the lightbox placeholder, which has no `src` until a Today screenshot is opened.
- **Frame trailing height:** each frame document is about 71 px taller than its frame. That is the hidden trailing chrome; the visible content bottom sits within 0 to 2 px of the frame foot, so nothing is cut.
- **Clipped or ellipsised text inside TODAY walk screenshots** (for example "STUDIO ACCOUNTS…" and "Preser" at 390). These are photographs of today's portal, and the defects in them are the point of the slide. They are not deck defects.
- **Dark mode:** the deck chrome turns dark while the proposed frames stay on their light stock. This is by design: `.spec-frame` sets `color-scheme: light`, and the documented dark set is shown in its own d1 and d2 frames (U-Q9, documented and not shipped).

## Fixed in this pass

- **R1, plate edge.** In `specimens/shared.css`, plus the verbatim copy in all 18 specimen files, `.plate` now has `border: 1px solid var(--card-edge)`. `synthesis/uplift.md` and the deck's sheet 06 now say this. See `review/triage.md`.
- **R2, 44 px area links.** In `deck/src/index.html`, `table.sheet a[href^="#"]` is `inline-flex` with `min-height: 44px`, plus a margin reset in the 390 stacked table. See `review/triage.md`.

The render pass turned up no further defects, so nothing else changed.

## Out of scope

`deck/DECK.md` §Marks says the proposed frames' marks at rest (`text · controls · colour · edges`) are not yet measured and that "the render pass owes them". SQ-813's contract asks this render check for rendering, horizontal scroll and clipped or overlapping text only, so these counts were not measured here. The deck still hides those lines rather than print a placeholder, so nothing renders wrong. The counts remain owed, a decision for the orchestrator, and are not a render defect.

## Gates

`node artifacts/portal-uplift-2026-10-12/specimens/check.mjs` passed 18/18 with 0 missing, and `node artifacts/portal-uplift-2026-10-12/deck/build.mjs` wrote `deck/index.html`. Both ran after the fixes and before the render.
