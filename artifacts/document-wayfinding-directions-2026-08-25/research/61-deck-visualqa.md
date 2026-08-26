# D3 Visual QA — presentation.html

Rendered with Playwright (Chromium, `@playwright/test` from `apps/designer-portal`'s
node_modules) via a temp shell copy at
`mock/deck-parts/qa-shell.html` (the deliverable's fragment wrapped in a minimal
`<!doctype html><html><head><meta charset=utf-8></head><body>…</body></html>`, per
instructions — `presentation.html` itself already contains a `<main>` and its own
`<script>`, so the shell only supplies the missing document tags).

Matrix: 1440×900 and 390×844, light and dark (`page.emulateMedia({colorScheme})`), all
12 index sections (`cover, ask, reading, voices, stays-true, planks, direction-a,
direction-b, compare, recommendation, questions, colophon`) plus 2 full-page shots per
width. **60 PNGs** written to `mock/deck-qa/` (48 per-section + 4 full-page + 8 targeted
debug crops used to confirm/rule out findings below). Raw instrumented results in
`mock/deck-qa/qa-results.json`.

One environment note: the first Chromium launch failed under the default command
sandbox (`mach_port_rendezvous` `Permission denied`, a macOS sandbox artifact, not a
page defect) — reran with `dangerouslyDisableSandbox: true` and it launched clean.

## Verdict: 1 blocker, 0 other issues

## Checklist results

| Check | Result |
|---|---|
| Clipped/overlapping text | Pass — spot-checked cover, F14 finding card, M1/M4 mock frames, compare table at full res; no clipping or overlap found (one look-alike, see Non-issues) |
| Mock fragments render at intended width/scale, no horizontal body scroll | **FAIL at 390×844** — see Blocker below. Pass at 1440×900 (scrollWidth 1440 = innerWidth 1440, both themes) |
| Left index (spine) works | Pass — clicked `direction-b`, `compare`, `colophon`; all three scrolled into view. `colophon` needed ~900ms to complete (`scroll-behavior:smooth` over a ~44,000px jump to the last, tallest section) — see Non-issues |
| Fonts rendered | Pass — `#cover-h`/`#ask-h` computed `font-family` resolves to `"Playfair Display", Georgia, …`; body resolves to `Inter, -apple-system, …`; DM Mono labels (`OPEN`, `BLOCKER`, `SPEC DUE`, eyebrows, contents list) visually confirmed in crops |
| Zero box-shadow (D4) | Pass — `boxShadow !== 'none'` count is **0** across all 4 viewport×theme combinations |
| Body-text contrast ≥4.5:1 | Pass — 9 of 10 sampled nodes per combo ranged 5.24–15.73:1; the 10th sample was a script artifact, not a real failure — see Non-issues |
| Network requests | Pass — 7 unique URLs total: 1 `file://` (the shell) + `fonts.googleapis.com/css2…` + 5 `fonts.gstatic.com/…woff2`. **Zero** requests outside `file://`/`fonts.googleapis.com`/`fonts.gstatic.com`/`data:` |
| File size ≤16MB | Pass — `presentation.html` is 2,725,283 bytes (2.6 MB) |
| `<title>` within first 8KB | Pass — `<title>The Wayfinding Review</title>` is the file's first line |
| Dark mode inverts paper/ink | Pass — body background `rgb(242,237,228)` (light) → `rgb(21,18,15)` (dark); ink `rgb(36,31,26)` → `rgb(241,235,224)`. Embedded product-screenshot mocks correctly stay light-paper in both deck themes (they're screenshots of the product, not deck chrome) |

## Blocker

**B1 — Document-level horizontal scroll at 390×844, caused by `.dk-refs span{white-space:nowrap}`.**

`document.documentElement.scrollWidth` is 405px against a 390px `innerWidth` at mobile
width, in both themes (desktop is clean: 1440 = 1440). Root cause, confirmed by walking
the DOM: the CSS rule at (presentation.html:1997)

```css
.dk-refs span{white-space:nowrap;}
```

is applied to the file-path/line-range citations under each finding card (e.g.
`components/document/commercial/money-region.tsx:295-305`,
`components/document/ffe-section.tsx:1116-1125,1108-1109`). At least 6 of these spans
in the `reading` section measure `right: 405.06px` — 15px past the 390px viewport edge
— because `white-space:nowrap` forbids them from wrapping onto a second line at mobile
width, and their containing `<p class="dk-refs">` has no `overflow-x` handling. Unlike
the data tables in the same deck (`.dk-t-mono`, `.dk-scores`), which are correctly
wrapped in `<div class="dk-scroll">{overflow-x:auto}` and stay contained, these
citation spans are not — the overflow escapes the section and becomes a real,
scrollable overflow on `<body>`/`<html>`. Confirmed interactive, not just measured: a
Playwright `scrollIntoViewIfNeeded()` on one of these spans left `window.scrollX = 15`
— the whole page is horizontally draggable by 15px on a real mobile viewport.

Screens: `mock/deck-qa/crop-mobile-overflow.png` /
`crop-mobile-overflow-2.png` / `crop-mobile-overflow-3.png`; raw offender list is in
the QA run's stdout capture (6 spans, all `right: 405.06px`, longest being the
`money-region.tsx` and `ffe-section.tsx`/`registry-shortcuts.tsx` citations).

Fix directions (not applied — QA only): either drop `white-space:nowrap` from
`.dk-refs span` at narrow widths (media query or just let it wrap — it's already
`font-size:10.5px` mono, wrapping reads fine), or wrap `.dk-refs` itself in the same
`.dk-scroll` pattern already used for the two data tables so any residual overflow is
locally contained instead of leaking to the document.

## Non-issues (investigated, ruled out)

- **Contrast script false-positive on `<code>← PUT DOWN</code>`** — the instrumented
  sampler read `background-color` as `rgba(36,31,26,0.086)` (an 8.6%-opacity ink tint,
  `--dk-tint-2`, the same token every other `.dk-obs code` chip uses) and, not
  compositing alpha against the paper behind it, treated it as opaque near-black —
  producing a bogus 1.00:1 "failure." Visual crop
  (`mock/deck-qa/crop-f14-light.png` / `crop-f14-dark.png`) confirms the chip renders
  as a light tan tint with dark ink text in both themes, clearly legible. QA-harness
  limitation, not a page defect.
- **`compare` section's score table looks cut off on mobile** — `.dk-scores` has
  `min-width:880px` inside a `<div class="dk-scroll">{overflow-x:auto}`, exactly like
  the two data tables in `reading`. A static viewport screenshot only shows the first
  342px of the 880px-wide table, which reads as clipped text in a screenshot but is a
  working, reachable horizontal-scroll-within-container — the standard responsive
  pattern for wide tables, not lost content. Confirmed via ancestor-chain inspection:
  the table's own `.dk-scroll` parent is properly bounded (`right:366` vs table's
  `right:904`), unlike B1's citation spans which have no such container.
- **Index click to `colophon` read "not in view" on the first pass** — my own harness
  waited only 400ms after the click; `colophon` is the last, tallest section, ~44,000px
  below the top at 1440-wide. With `scroll-behavior:smooth` the browser needs ~900ms to
  complete that jump (confirmed: still mid-flight at +600ms, settled by +1000ms). Retest
  with a longer wait shows the link lands correctly. Not a page defect — a QA-timing
  artifact on the single farthest target only; the two nearer targets (`direction-b`,
  `compare`) passed on the first pass.

## Screenshot inventory

`mock/deck-qa/` — 60 files:
- `full-{desktop,mobile}-{light,dark}.png` (4) — full-page shots
- `sec-{cover,ask,reading,voices,stays-true,planks,direction-a,direction-b,compare,recommendation,questions,colophon}-{desktop,mobile}-{light,dark}.png` (48) — one per section × viewport × theme
- `crop-f14-{light,dark}.png`, `crop-m1-a-mobile.png`, `crop-m4-a-mobile.png`, `crop-compare-top.png`, `crop-mobile-overflow{,-2,-3}.png` (8) — targeted crops used to confirm/rule out findings above
- `qa-results.json` — raw instrumented output (scroll-width checks, box-shadow counts, font checks, contrast samples, theme-invert checks, index click test, request log)
