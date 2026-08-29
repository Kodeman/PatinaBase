# 01 — Shot ledger (C1)

`capture-shots.mjs` run in three passes (`SHOT_W=1440/1280/390`) from `apps/designer-portal` against
the running local dev server, doc ids from `research/state-ladder.json` (rich = Chen Residence
project, `de922823-…`; prework = Aspen Loft — Living Room Refresh proposal, `b0000000-…-002`).
38 of 38 defined shots landed and all 38 verified by reading every PNG with the Read tool. One shot
(`prework-s2`) is an expected, documented skip, not a failure — see capture-caveats.

## Script fixes made

Four real bugs were found and fixed in `capture-shots.mjs` (full detail/rationale in the file's own
comments at each fix site):

1. **ESM resolution** — `node $P/research/capture-shots.mjs` run from `apps/designer-portal` still
   could not resolve `@playwright/test`: Node's ESM resolver walks up from the *importing file's own
   path*, not `process.cwd()`. Fixed by symlinking `research/node_modules ->
   apps/designer-portal/node_modules` (the same workaround already present, untracked, in the
   wayfinding program's research dir) — no script edit needed.
2. **s2's seam adjustment scrolled the wrong way, at the wrong element.** `head.scrollIntoViewIfNeeded()` (Playwright's API, nearest-edge semantics, not top-alignment) landed `[data-region-head="ffe"]` at top=124.6px, then `scrollBy(0, -seam)` scrolled it to top=188.6px — worse, and backwards (subtracting scroll moves content down the viewport, not up). Replaced with `scrollFfeHeadToTop()`: a forced `[data-index-region="ffe"].scrollIntoView({block:'start'})`, which honors that region's own `scroll-margin-top: max(var(--doc-seam-height,0px), 4rem)` (globals.css) — the same CSS rule the app's real `scrollToRegion` navigation relies on. Measured after: top=77.8px.
3. **`mobile-margin-chips` selector didn't exist.** `[data-margin-chip]` is not used anywhere in the app; `MobileMarginChips` (mobile-margin-chips.tsx) renders chips as plain `<button>`s with no distinguishing data attribute. Fixed with an XPath `contains(@class, "min-[980px]:hidden")` locator against the one Tailwind class fragment unique to that component's wrapper `<div>` (sidesteps escaping the class's brackets/colon for a CSS selector).
4. **Root cause of `ticket-unfolded`/`ticket-seam` capturing the wrong (and, at one point, the SAME) state**: `page.goto()` to a URL matching the page's current URL does not reset scroll to 0 — measured directly (scroll to 2000, re-`goto` the identical URL, land at 1106, not 0). `[data-job-ticket]` is `position: sticky`, so `clipShot`'s own `scrollIntoViewIfNeeded()` treats it as "already visible" and never corrects for inherited scroll — so a later `withDoc(DOCS.rich, …)` block re-visiting the same doc URL could inherit whatever scroll/pin state a previous block left behind. Fixed at the source: `gotoDoc()` now does `window.scrollTo(0, 0)` after every navigation (safe — every caller computes its own scroll target explicitly right after `gotoDoc` returns anyway). Also fixed along the way: `ticket-seam`'s scroll target was the letterhead's bottom, which is *not far enough* to trigger the ticket's own pin (it pins only once its own `#doc-ticket-sentinel`, positioned just above it in the tree and further down the page, leaves the viewport) — now scrolls past the sentinel instead; and the sentinel's `waitForSelector` needed `state: 'attached'` (default `'visible'` never resolves for a zero-area `aria-hidden` div).

`prework-s2` was also hardened: rather than let the `[data-region-head="ffe"]` shot run its full
15s `waitFor` timeout and fall into `shot()`'s placeholder-on-failure path, the per-doc loop now
probes for the selector with a 3s existence check first and records an explicit, fast, non-error
skip (`skipped[]`) when absent — this doc genuinely renders no FF&E region at all (confirmed via
direct DOM query: 0 `[data-region-head]`/`[data-index-region]` elements of any kind on the prework
doc). No placeholder PNG is written for a skip.

## Shot table

| File | Width | Doc | State | What it shows | Verdict |
|---|---|---|---|---|---|
| w1440-rich-s0.png | 1440 | rich | s0 | Top of doc: Chen Residence letterhead | verified |
| w1440-rich-s1.png | 1440 | rich | s1 | Scrolled past letterhead; job ticket 8 rows visible | verified |
| w1440-rich-s2.png | 1440 | rich | s2 | FF&E "Pieces" region head near top, seam-clear | verified |
| w1440-rich-s3.png | 1440 | rich | s3 | Foot: authorizations, accounts, closing the book, roster | verified |
| w1440-rich-s1-reduced.png | 1440 | rich | s1 (reduced motion) | Same as s1, `prefers-reduced-motion: reduce` context | verified |
| w1440-prework-s0.png | 1440 | prework | s0 | Top of doc: Aspen Loft proposal letterhead | verified |
| w1440-prework-s1.png | 1440 | prework | s1 | Scrolled past letterhead; proposal-with-client block | verified |
| w1440-prework-s3.png | 1440 | prework | s3 | Foot: Design Vision, investment lines, total, record | verified |
| w1440-spine-full.png | 1440 | rich | top | Left document spine, "Client approvals" active | verified |
| w1440-spine-running-index-mid.png | 1440 | rich | scrolled to FF&E | Same spine, "Pieces" now active (running index) | verified |
| w1440-ticket-unfolded.png | 1440 | rich | top | Job ticket unfolded: head + all 8 rows | verified |
| w1440-ticket-seam.png | 1440 | rich | scrolled past ticket's sentinel | Job ticket collapsed 2-line seam form | verified |
| w1440-letterhead-vitals-phases-open.png | 1440 | rich | top, Phases clicked | Letterhead with Phases toggle opened | verified* |
| w1440-margin-rail.png | 1440 | rich | top | Right margin rail, 7 margin items | verified |
| w1440-region-head-ffe.png | 1440 | rich | scrolled to FF&E head | FF&E region head clip (Pieces + ledger actions) | verified |
| w1440-fold-seam-folded.png | 1440 | rich | top | A folded region seam (Client approvals, "Unfold ↓") | verified |
| w1440-guide-or-red-letter.png | 1440 | rich | top | Red-letter zone: "Needs attention · in one place" | verified |
| w1440-instruments-row.png | 1440 | rich | top | Letterhead actions row (Message/Preview/Sharing/Call sheet) | verified |
| w1280-rich-s0.png | 1280 | rich | s0 | Top of doc, margin collapsed to tab | verified |
| w1280-rich-s1.png | 1280 | rich | s1 | Past letterhead, margin tab visible | verified |
| w1280-rich-s2.png | 1280 | rich | s2 | FF&E region head near top | verified |
| w1280-rich-s3.png | 1280 | rich | s3 | Foot of doc | verified |
| w1280-prework-s0.png | 1280 | prework | s0 | Top of proposal doc | verified |
| w1280-prework-s1.png | 1280 | prework | s1 | Past letterhead | verified |
| w1280-prework-s3.png | 1280 | prework | s3 | Foot of proposal doc | verified |
| w1280-spine-glyph-rail.png | 1280 | rich | top | Collapsed glyph-only spine rail | verified |
| w1280-margin-tab-closed.png | 1280 | rich | top | Closed "Margin ←" tab trigger | verified |
| w1280-margin-sheet-open.png | 1280 | rich | tab clicked | Margin sheet opened as an overlay panel | verified |
| m390-rich-s0.png | 390 | rich | s0 | Top of doc, mobile letterhead + folded ticket + chips | verified |
| m390-rich-s1.png | 390 | rich | s1 | Past letterhead | verified |
| m390-rich-s2.png | 390 | rich | s2 | FF&E "Pieces" head | verified |
| m390-rich-s3.png | 390 | rich | s3 | Foot of doc | verified |
| m390-prework-s0.png | 390 | prework | s0 | Top of proposal doc | verified |
| m390-prework-s1.png | 390 | prework | s1 | Past letterhead | verified |
| m390-prework-s3.png | 390 | prework | s3 | Foot of proposal doc | verified |
| m390-mobile-bar.png | 390 | rich | top | Bottom mobile action bar (Send reminder / More) | verified |
| m390-mobile-spine-sheet.png | 390 | rich | sections opened | Mobile stage-progression sheet + margin items | verified |
| m390-mobile-margin-chips.png | 390 | rich | top | One anchored margin chip (Money · Draft) | verified |

**38 shots defined, 38 captured, 38 verified. 0 blank / wrong-surface / wrong-state. 1 expected skip
(`prework-s2`, no PNG written by design).**

## Capture-caveats

- **Rich seed thinness.** Chen Residence (the rich rung) carries only 3 FF&E lines, all "Not in a
  room yet" (0 `project_rooms` rows), 0 phases, no client attached, and no authorizations/trade
  scopes. Every shot that shows FF&E, rooms, phases, or authorizations content is genuinely showing
  the seed's actual empty/near-empty states (e.g. "No rooms yet", "3 unspecified", "No authorizations
  recorded yet") — this is real data, not a capture defect, but it means these shots read thin
  compared to what a fully-populated project would show.
- **`letterhead-vitals-phases-open` shows no additional content after the click.** The Phases toggle
  was clicked (its arrow flips ▸ → ▾, confirmed via direct DOM check), but Chen Residence has 0
  phases configured, so the toggle reveals nothing new — `#document-project-status`'s bounding box
  is byte-for-byte identical before and after the click (189.3px tall both times). Marked verified
  because the click genuinely fired and this is the true rendered state for this specimen, not a
  script miss — but a reviewer expecting to see an expanded phase list in this shot will not find
  one.
- **`prework-s2` is unreachable, not broken.** The prework doc (a `proposal`-stage doc) renders zero
  `[data-region-head]` and zero `[data-index-region]` elements of any kind — confirmed via direct DOM
  query. FF&E-as-a-region is a `project`-stage concept; a `proposal` doc doesn't have one. No PNG is
  written for this row; it's recorded here as the ledger line the brief anticipated.
- **`guide-or-red-letter` matched the primary selector**, `[aria-label="Needs attention"]`
  (`red-letter-zone.tsx`) — not the `section[aria-labelledby="document-next-up"]` fallback
  (`document-guide.tsx`). Both exist in the codebase as separate components; this doc's real content
  ("Invoice … overdue … send a reminder" / "Name the phases for this project") is the red-letter zone,
  not the guide.
- **No fullPage or drawer-strip artefacts.** No shot in this script uses `fullPage: true` — all 38 are
  either normal viewport screenshots (`s0`–`s3`, `mobile-bar`'s siblings) or `clip`-bounded element
  captures with a 24px pad. The pad does occasionally let a sliver of an adjacent element bleed into a
  clip (e.g. `m390-mobile-margin-chips.png` shows the start of a second chip beside the first, and
  `m390-mobile-bar.png` shows the tail of a margin chip above the dark bar) — this is expected padding
  bleed, not a mis-clip.
- **Welcome-modal suppression.** Every navigation sets
  `help-system.welcome-shown.first-project-walkthrough = '1'` in `localStorage` via
  `page.addInitScript` before the app mounts (ported from the wayfinding script). No welcome modal
  appeared in any of the 38 captures.
- **Nothing else was unreachable.** Both docs, all three widths, and every other selector in the
  script's shot list resolved against live data once the four fixes above landed.

## Gate

```
$ ls /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/shots/*.png | wc -l
38
```

Verdict counts: **38 verified / 0 blank / 0 wrong-surface / 0 wrong-state** (plus 1 documented,
PNG-less skip: `prework-s2`).
