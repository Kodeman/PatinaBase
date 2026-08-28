# 12 — Flatness measurements

Program: The Document — Life. Measured 2026-08-28 against the STEWARD's `pnpm dev:designer`
server (PID 52138, port 3000), local Supabase, `NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,
arrival-arc:true,room-file:true,studio-workspaces:true'`, signed in as `designer@patina.dev`.

Harness: `research/measure-flatness.mjs` (Playwright, `page.evaluate` over all visible DOM
elements at 1440×900 after networkidle + 1500ms). Raw data: `research/12-measurements.json`.
Routes measured: `/desk`, `/doc/<Chen Residence — project_rich>`, `/library`, `/people`.
Contrast math ported verbatim from
`apps/designer-portal/src/lib/document/__tests__/contrast.test.ts` (WCAG 2.2 sRGB relative
luminance / contrast ratio).

**Methodology note found live, and fixed before trusting any font number**: the first pass's
font-size/font-family scan walked `el.childNodes` for direct `Text` nodes, which misses any
`<input>`/`<textarea>` whose text lives in `.value` — e.g. the document's own title
(`doc-letterhead.tsx`'s editable title field). The first run reported doc-project-rich's
"largest Playfair" as a 25.2px roman-numeral "i" (a schedule-composer list marker), because the
real title ("Chen Residence", an `<input>`, Playfair Display, 27.9px) was invisible to a
textContent-only scan. Confirmed via a one-off probe (`research/debug-font.mjs`) before fixing
`measure-flatness.mjs` to also read `.value` on text-holding form controls and re-running. All
numbers below are from the corrected run.

## Headline numbers

**1. Desk ground #FAF7F2 / doc paper #FCFAF6 / card #FFFFFF within 1.07:1 — CONFIRMED, exactly.**
Source-verified token values (`globals.css`): `--bg-primary: var(--color-off-white)` =
`#FAF7F2` (the ground — painted by `.document-route-shell`, the wrapper div every route in
`app/(document)/layout.tsx` renders inside); `--doc-paper: #FCFAF6`; `--bg-surface: #FFFFFF`
(the card token). Computed contrast (ported WCAG formula):
- ground vs paper: **1.025:1**
- ground vs card: **1.069:1**
- paper vs card: **1.042:1**

All three pairs land inside 1.07:1 as claimed. One correction to the claim's premise: the raw
`<body>` element's own background is a *fourth*, unrelated color — a Tailwind v4/shadcn base
layer `--background: oklch(0.9582 0.0152 90.2357)` token (`globals.css:860`), which resolves to
roughly `#F5F1E6` — but `.document-route-shell` opaquely covers it on every route measured, so
it is never actually seen. Flagging as dead paint, not a visible flatness fact.

**2. Spine wash ≈1.04:1 vs paper — CONFIRMED to the same order of magnitude, route measured: `/doc/<Chen Residence>`.**
`[data-document-spine]`'s computed background is `rgba(229, 226, 221, 0.28)` (pearl at 28%
alpha) sitting over the off-white ground. Compositing that wash over `#FAF7F2` gives an
effective color of `rgb(244, 241, 236)`, which measures:
- vs `--doc-paper` (#FCFAF6): **1.080:1**
- vs the ground it actually sits on (#FAF7F2): **1.053:1**

Both numbers are in the same "essentially invisible" band as the claimed 1.04:1 (all three are
<1.1:1); the exact figure depends on which ground you composite against, which the claim didn't
specify. Not a contradiction — a precision correction.

**3. ~504 pearl (#E5E2DD) hairlines — the plan's number was a source-grep count; here is the
RENDERED count per route (elements with a visible pearl-colored border side, one count per
matching side, not per source usage):**

| route | pearl border-side count | total distinct border colors |
|---|---|---|
| `/desk` | 16 | 3 |
| `/doc/<Chen Residence>` | 38 | 11 |
| `/library` | 25 | 4 |
| `/people` | 78 | 9 |

Pearl is the dominant border color on every route measured (it's the #1 or #2 most common
border color everywhere), consistent with "the hairline is the surface's default rule," but the
504 figure is not directly comparable — it counted every `border-[var(--color-pearl)]`-class
usage across the whole source tree, not what's on screen on any one page at one time. No
attempt was made to reconcile the two counting methods further (out of scope for a rendered
measurement).

**4. Majority of sized text 8–12px — CONFIRMED on 3 of 4 routes, route-by-route:**

| route | 8–12px | total text-bearing | share |
|---|---|---|---|
| `/desk` | 61 | 128 | 47.7% |
| `/doc/<Chen Residence>` | 152 | 199 | **76.4%** |
| `/library` | 37 | 54 | **68.5%** |
| `/people` | 54 | 103 | **52.4%** |

8–12px is the single largest bucket on all 4 routes, and an outright majority (>50%) on 3 of 4
(doc, library, people). Desk sits just under a strict majority at 47.7% — its next-largest
bucket is 15–16px (44 of 128, 34.4%), so desk is more bimodal (small mono labels + a 15–16px
body-text band) than the other three routes, which skew harder toward 8–12px.

**5. Largest Playfair ≈30.6px — CONFIRMED exactly on `/desk`, but NOT the largest anywhere:**

| route | largest Playfair size | text |
|---|---|---|
| `/desk` | **30.6px** | "Good morning, Leah" |
| `/doc/<Chen Residence>` | 27.9px | "Chen Residence" (the document title, an `<input>`) |
| `/library` | **45px** | "Find a piece—or ask about one." |
| `/people` | 28.8px | "Directory" |

30.6px matches the desk greeting exactly. `/library`'s headline is 47% larger (45px) — the
claim's "≈30.6px" is a desk-specific number, not an app-wide ceiling.

**6. `--text-muted` / `--text-subtle` / `--text-faint` all `#65594E` — CONFIRMED at `:root`, on
every route measured.** All three tokens read back as `#65594E` via
`getComputedStyle(document.documentElement)` on `/desk`, `/doc/<Chen Residence>`, `/library`,
`/people` — identical, and all three are aliases of one underlying token, `--color-quiet-ink:
#65594E` (`globals.css:18,68-69,92`). One documented exception found by source read (not
exercised by this measurement): `.doc-room-lifted` (the room-lens wash, `globals.css:749-751`)
locally re-points `--text-muted` to `--color-charcoal` for its subtree, so a room held in the
lens is not part of this "all three are always #65594E" claim.

**7. Hover fill clay@6% — CONFIRMED exactly.** `--bg-hover: rgba(196, 165, 123, 0.06)`
(`globals.css:64`) — `rgb(196,165,123)` is `--color-clay`'s (`#C4A57B`) exact RGB decomposition,
at 6% alpha. Read back identically via `getComputedStyle` on all 4 routes.

**8. StatusChip has no fill — CONFIRMED by source.** `status-chip.tsx`'s own doc comment states
it directly ("No fill, no pill, no rotation — the dot carries the status hue"), and the JSX
backs it: the outer `<span>` carries no `background`/`backgroundColor` at all — only the inner
6px dot (`h-1.5 w-1.5 rounded-full`) carries `background: color`. Not independently exercised at
runtime in this pass: `StatusChip` (imported only by plan-room / spec-book / drafting-room
components, grep-confirmed app-wide) has **no reachable render** on this local DB — see the shot
ledger's `status-chips` entry for the full trace (0 rows in `plan_sheets`, 0 `proposal_items`
with a `product_id` anywhere).

**9. Zero box-shadow on the desk now that the folio grid is gone — CONFIRMED for product code;
one dev-tool artifact measured, documented and excluded.** The runtime scan found exactly 1
element with a non-`none` `box-shadow` on every route measured (desk included): a `<div
class="...tsqd-open-btn-container">` — the TanStack Query devtools toggle button, a
development-only overlay unrelated to product UI (the same element the shot harness's
`hideDevOverlays` init script suppresses for screenshots, which this measurement script did not
load). Excluding it: **0 product box-shadow elements on `/desk`**, confirming the claim.
Source-side confirmation goes further: `.folio-face` (`globals.css:210-225`, explicitly commented
as "the one sanctioned lift + shadow on Desk content") is defined but `grep -rl "folio-face"
apps/designer-portal/src --include="*.tsx"` returns **zero files** — the class is dead CSS, not
just currently-unmounted. The desk's `DeskRoster` component (`desk-roster.tsx`) confirms this
independently: it renders `<ul>` job lines with no card/shadow wrapper at all (see
`w1440-desk-roster-rows.png`).

## Other findings from this pass

- **The most common non-transparent background color on `/desk` (17 occurrences) and
  `/doc/<Chen Residence>` (14 occurrences) is neither ground, paper, nor card** — it's
  `--bg-warm: #EEE6DB` (`globals.css:94`), applied via `.da-secondary .da-pool` — the hover/press
  "score pool" fill sitting behind every secondary `DocumentAction` link (e.g. every "OPEN THE
  JOB" row in the roster, "MESSAGE THE CLIENT", etc.). This element exists in the DOM — and
  therefore in this histogram — for every such link regardless of hover state (it's typically a
  zero-width/clipped rect until interaction), so the count reflects *link inventory*, not
  *visibly painted area at rest*. Flagging so the histogram isn't misread as "17 visibly tan
  patches on the desk."
- **`rgba(44, 41, 38, 0.12)` is the #1 background on `/doc/<Chen Residence>` (24 occurrences)** —
  traced to `strata-mark.tsx` / `strata-sweep.tsx`'s shared `track` color (charcoal at 12% alpha),
  the unfilled base track of the small tick-mark progress indicators (visible atop the doc spine
  and near "EVERY JOB" on desk).
- Uppercase + monospace text-bearing elements: desk 46, doc-project-rich 104, library 25, people
  40 — a heavy, consistent reliance on small mono/uppercase labels across every route (eyebrows,
  eligibility words, meta lines). Consistent with a "flatness" critique: type does a lot of the
  hierarchy work that color/weight/size elsewhere might otherwise carry.
- Named-surface contrast on `/doc/<Chen Residence>` (all essentially invisible, i.e. the surfaces
  read as "the same paper," which is the intended effect, not a defect): spine-vs-drawer 1.29:1,
  spine-vs-margin 1.21:1, drawer-vs-margin 1.07:1.

## Raw data

Full per-route JSON (backgrounds/borders top-12, font histograms, family×weight table, shadow
inventory, named-surface + pairwise contrast): `research/12-measurements.json`.
