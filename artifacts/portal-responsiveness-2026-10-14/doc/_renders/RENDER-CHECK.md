# US-33 findings document render check (SQ-963)

- **Document:** `doc/index.html`, built with `node artifacts/portal-responsiveness-2026-10-14/doc/build.mjs` after the SQ-963 fix pass, 1,159,039 bytes (1.11 MB). The page is published without a skeleton: no doctype, `<html>`, `<head>` or `<body>`. `<title>Portal Responsiveness Findings</title>` is in the first 8 KB.
- **Browser:** Google Chrome, headless (Playwright 1.58.2 with `channel: chrome`), opened via `file://`. Light and dark are set by Playwright's `colorScheme` emulation, which drives `prefers-color-scheme` in the page and in each specimen frame.
- **Viewports:** 1440×900 light, 1440×900 dark, 390×844 light, 390×844 dark. In each run the script opened every `<details>`, scrolled the full height so lazy images and frames loaded, and waited 1.8 s for the frames to post their heights.
- **Automated checks per viewport:** horizontal scroll on the document; elements past the right edge; leaf-text overflow; broken `<img>`; `.tw` tables wider than their container; size and content of each of the 18 specimen iframes (frame height against document height, text length, sideways scroll inside); axe-core 4.11.1 `color-contrast` on the page and inside every frame; visible "AI" copy; gendered pronouns in visible text; console errors and warnings (recorded before and after axe was injected); page errors; failed requests; every request that is not `file:`/`data:`.
- **Files here:** `top-<w>-<scheme>.jpg` is the first screen. `<section>-<w>-<scheme>.jpg` is the first 1600px of each of the nine sections (answer, measured, findings, proposals, tracks, budgets, questions, team, evidence). `strip-p9-*` and `waterfall-p1-*` are the two embeds named in the polish notes: the P9 send strip and the P1 waterfall. The 1440 embed captures are the whole frame; the 390 ones are its first 1600px. All are JPEG quality 72, capped with `sips -Z 1600`. The script runs `sips` only on images over 1600px, because `-Z` also scales smaller images up. 48 files, 5.82 MB.
- **Full-height captures** of all four runs (in parts, because the 390 page is 78,462px tall and a JPEG stops at 65,535px) and the raw JSON results are board evidence, kept outside the repo in `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-963/` (`tall/`, `render-final.json`, and the earlier passes `render-pass1.json` to `render-pass3.json`).

## Result in one line

The document renders cleanly at 1440 and 390, in light and dark. The final run has no horizontal scroll, no overflow, no broken images, no blank or mis-sized frames and no contrast violations. There are no console messages before the check tool runs, no page errors and no failed requests, and the only external fetches are Google Fonts. Three defects the first pass found were fixed in the source: low contrast in two action strips, six tables scrolling sideways at 390, and a frame-height race.

## Per section

"ok" means: no horizontal scroll, no element past the right edge, no text overflow, no broken image, every frame in the section loaded with content and sized to its document, and no contrast violation, in both light and dark at that width.

| Section | Title | 1440 ok? | 390 ok? | Issue |
|---|---|---|---|---|
| answer | Why the portal feels slow, and what to fix first | ok | ok (tall) | none |
| measured | What "sluggish" is, measured | ok (tall; two waterfall frames, 1,874 and 2,435px) | ok (tall; the scenario and scorecard tables stack into labelled cards) | Fixed: the scorecard table scrolled sideways at 390 (896px in 342px), see F2. |
| findings | Findings by discipline | ok (tall) | ok (tall) | none |
| proposals | Paired proposals, engineering × design | ok (tall; skeleton, nav-rule and six action-strip frames) | ok (tall; strips stack one stage per row) | Fixed: strip contrast (F1) and the grammar table at 390 (355px in 342px, F2). |
| tracks | Three tracks | ok (tall) | ok (tall; the three track tables stack, each unit one card) | Fixed: the three track tables scrolled sideways at 390 (854–921px in 342px, F2). |
| budgets | Budgets B1–B4 | ok | ok (tall) | none |
| questions | Founder questions | ok (tall) | ok (tall) | none |
| team | The team | ok | ok (tall; the table stacks) | Fixed: the team table scrolled sideways at 390 (418px in 342px, F2). |
| evidence | The evidence trail | ok | ok (tall) | none |

## Checks

- **Specimen frames blank or wrongly sized:** none in the final run. All 18 frames loaded in every run, with 242–2,591 characters of text each. Each frame's height is within 1px of its document height (P1 waterfall 1,874px, P9 strip 1,269px at 1440; 2,515px and 2,936px at 390). No frame scrolls sideways inside.
  - Fixed in this pass (F3): on the first, cold load, six frames stayed at the 560px default because they posted their height before the page's listener existed.
- **Horizontal scroll:** none. `scrollWidth` equals `clientWidth` at 1440 and 390, and no element sits past the right edge.
  - Fixed in this pass (F2): at 390 no table scrolls sideways inside its container any more (six did).
- **Text overflow:** none. No leaf element's `scrollWidth` exceeds its `clientWidth`.
- **Broken images:** none. Every `<img>` (the inlined walk screenshots) is complete with a natural width.
- **Low contrast:** axe-core `color-contrast` reports 0 violations on the page and 0 inside the 18 frames, in all four runs.
  - Fixed in this pass (F1): the first pass found violations in the P8 "add a room" strip and the folio Undo strip.
- **Dark mode:** each frame shows only its dark copy under dark emulation. Light/dark pairs carry both copies and hide one through `PAIR_CSS`. Page and frame contrast passes in dark.
- **Polish (a), action strips at 1440:** the strips lay out three stages per row above 900px, so cell text is no longer squeezed (`strip-p9-1440-*.jpg`). At 390 they stack one stage per row.
- **Polish (b), waterfall axis:** the last tick (8 s on the P1 lanes, 6 s on the milestone chart) and the end-of-bar labels such as "6.9–8.4 s" sit inside the frame (`waterfall-p1-1440-*.jpg`).
- **Visible "AI" copy:** none. A regex for `\bAI\b` or `A.I.` over the visible text found 0 matches. **Gendered pronouns:** none in the visible text.
- **Console:** 0 errors and 0 warnings before the check tool runs, in every run. After axe-core is injected, Chrome logs one warning per frame (18): "Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('file://') does not match the recipient window's origin ('null')". That warning is axe's cross-frame messaging against `srcdoc` frames under `file://`. The page and the frames post only with `"*"`.
- **Page errors and failed requests:** 0 and 0.
- **External requests:** only `fonts.googleapis.com` and `fonts.gstatic.com`, which the Artifact page contract allows. Every face has a fallback stack. The `github.com` URLs in the page are links, not fetches.

## Findings, worst first

1. **F1 (fixed) — Low contrast in two action strips.** In the P8 "add a room" strip, the ghost row's text was dimmed with `opacity:.55` (3.42:1). In P8 and in the folio Undo strip, a pressed secondary button kept its accent text on the pressed fill: 1.6:1 in light, 1.2:1 in dark. Fix in `specimens/build.mjs`: the ghost row uses `--ink-faint` italic instead of opacity, and `.act.pressed` sets `color: var(--paper)`. After the rebuild, `specimens/check.mjs` passes and axe reports 0 inside the frames.
2. **F2 (fixed) — Six tables scrolled sideways at 390.** The scorecard, the grammar table, the three track tables and the team table were wider than the 342px column. Their contents could be reached only by scrolling the table itself. Fix in `doc/src/index.html`: at 620px and below, each `.tw` table reflows into labelled cards. A small script copies each column heading into the cell's `data-label`, and the `min-width` rules on `.score` and `.tracks` are reset.
3. **F3 (fixed) — Frame-height race on a cold load.** A specimen frame can post its height before the page's `message` listener exists. Each frame also suppresses a resend of an unchanged height, so on a cold load six frames stayed at 560px with their content cut off. Fix: `doc/build.mjs` BOOTSTRAP now clears the last sent height when it receives a ping, and the page pings every frame once its listener is ready and again on `load`. The next three cold runs sized all 18 frames correctly.
4. **F4 (render-tool note) — Frames never shrink.** A frame measures `documentElement.scrollHeight`, which is never less than its own viewport. A frame that is enlarged once therefore stays tall. In this check that happened only after Playwright's full-page capture, which left the dark P9 strip about 3,000px tall in an earlier capture order. Repeated pings on a normal load keep every frame stable (probe: ±1px). The fix was to capture the in-repo clips before the full-height evidence. The page is unchanged.
5. **F5 (render-tool note) — postMessage warnings come from axe-core.** See Console above. A reader never sees them.
