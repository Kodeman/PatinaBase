# 61 — Rendered QA of `presentation.html`

Harness: `mock/deck-parts/qa-run.cjs` (Playwright chromium, `apps/designer-portal/node_modules/@playwright/test`).
Chromium will not launch inside the command sandbox on this machine — `bootstrap_check_in …
MachPortRendezvousServer: Permission denied (1100)` — so the run is unsandboxed. Everything below is
from that run plus a look at the PNGs it wrote.

Passes: `1440×900` and `390×844`, each in `prefers-color-scheme: light` and `dark`, plus a
`data-theme` toggle pass and a width sweep (1680 / 1440 / 1200 / 1024 / 820 / 600 / 390) inside the
`<!doctype>` skeleton an Artifact publish supplies.

Artefacts: `mock/deck-qa/<section>-<viewport>-<theme>.png` (60), `mock/deck-qa/asread-<section>-<viewport>-<theme>.png`
(20 — landed by clicking the index row, sticky chrome intact), `mock/deck-qa/qa-results.json`,
`mock/deck-qa/tiles/` (slices cut for reading; the deck's tallest section is 36,062 px at 390).

**Two method notes, so nobody re-chases them.** (1) The 60 section PNGs are captured with
`.dk-index{visibility:hidden}` and `.dk-prose{position:static}`. An element screenshot of a section
containing `position:sticky` children bakes the pinned index bar and the pinned prose column into the
middle of the image; that is a capture artefact, not a layout defect. The sticky behaviour itself is
measured separately and is clean. (2) Scripted `window.scrollTo` races the deck's own smooth scroll and
reports landings that never happen in a browser — an earlier version of this harness produced blank
as-read frames and apparent 2,000 px anchor misses that do not exist. The as-read shots now click the
index link like a reader.

---

## Blocking

### B1 · A finding chip cannot wrap, so its sentence is clipped mid-word — every width except 1200

`.f-chip` sets `white-space:nowrap` (deck head §9), but chips carry a whole sentence in their `<span>`.
The chip runs past the deck measure, and because `body` sets `overflow-x:hidden` the page **does not
scroll sideways** — the lost words are simply gone, with no scrollbar to reach them.

| viewport | `documentElement.scrollWidth` vs viewport | worst chip |
|---|---|---|
| 1680 | 1702 (+22) | `panel` F134 +13 px |
| 1440 | 1556 (+116) | `panel` F134 +107 px |
| 1200 | 1200 — clean | — |
| 1024 | 1056 (+32) | `panel` F26 +22, `questions` F26 +23 px |
| 820 | 895 (+75) | `panel` F134 +66 px |
| 390 | 518 (+128) | `panel` F134 +99 px, plus F34 / F26 and two in `questions` |

Visible in `panel-1440-light.png` (F13 stops at "…from one morning to th", F34 at "…two minute",
F26 at "…zero designer attri") and `panel-390-light.png`. F134 —
"The only door to the Studio is the worst-reached control on the screen" — leaves the page entirely.

**Fix** (deck head §9): `.f-chip{white-space:normal;align-items:flex-start}` and
`.f-chip::before{flex:0 0 auto;margin-top:.55em}`. The `F###` label is a single token and will not break.

### B2 · Frame rows scale the phones but not the gap, so a frame is clipped off the page at 390

`fitFrames()` (99-script.html §5) computes `s = avail / (428n + 28(n−1))` and then sets each slot to
`round(428 · s)` — but the flex `column-gap` stays a literal 28 px. The row therefore measures
`428ns + 28(n−1)`, which is `28(n−1)(1−s)` wider than the space it was fitted to. Every multi-frame row
overruns; the error grows as `s` shrinks.

| viewport | section | n | `--s` | row width | available | past viewport |
|---|---|---|---|---|---|---|
| 390 | `direction-a`, `purchase` | 3 | 0.2612 | 392 | 350 | **+22 px** |
| 390 | `direction-a`, `direction-b`, `why-return` | 2 | 0.3959 | 366 | 350 | escapes its column |
| 1440 | `purchase` | 3 | 0.5634 | 779 | 755 | overlaps the sheet column |
| 1440 | `direction-b` | 2 | 0.9242 | 820 | 817 | overlaps the sheet column |

At 390 the third phone in `direction-a` and `purchase` is cut off by the page's own
`overflow-x:hidden` — drawn content, unreachable. See `direction-a-390-light.png`,
`purchase-390-light.png`, and the tile `tiles/direction-a-390-light-t12.png` where the right frame
loses its bezel and its callout disc.

**Fix**: `var s = Math.min(1, (avail - GAP * (n - 1)) / (FRAME_W * n));`

---

## Major

### M1 · `<code>` has no rule at all — long tokens break the measure at 390 and the columns at 1440

The deck head styles `code` only inside `.dk-sheet .sheet-table td`. Everywhere else it inherits the
browser default and has no `overflow-wrap`, so a file:line token is unbreakable.

- 390, `why-buy`: `Features/ProductDetail/Views/ProductDetailView.swift:338-399` runs **+128 px** past
  the viewport — this is the single largest contributor to the 518 px scrollWidth
  (`why-buy-390-light.png`).
- 390, `found`: `supabase/migrations/00276_direct_orders.sql:41-200` runs +25 px past
  (`found-390-light.png`).
- 1440, `today`: the anatomy table is `table-layout:auto`, so the unbreakable
  `CompanionContextProvider.swift:97–111` forces column 2 to ~446 px and starves column 1 to ~130 px.
  The two cells' text then interleaves line-for-line and reads as one scrambled paragraph, and ranges
  split across lines (`DailyRoomView.swift:107–` / `114`). `today-1440-dark.png`, tile `-t0`.

**Fix**: `code,.mono{overflow-wrap:anywhere;word-break:break-word}` in the deck head; add
`table-layout:fixed` to the `today` anatomy table.

### M2 · Light-theme muted ink fails AA, and it carries every eyebrow in the deck

`--dk-faint:#77695A` on `--dk-plate:#FBF8F3` measures **4.28:1** against the 4.5:1 floor for text under
18 px. It is the colour of `.hour` (10.5 px), `.dk-h4` (10.5 px), `.dk-note` (14 px), `.dk-frame-cap`
(9.5 px) and `.dk-sheet th` (10 px) — the day-spine eyebrows and every screen-sheet key.

Dark theme is clear: `--dk-faint:#9E9184` on `#14120F` = 6.09:1; the evidence register's
`--dk-ev-faint` = 6.21:1. Body and headings pass everywhere (10.1–15.9:1).

**Fix**: darken the light value only, to roughly `#6A5C4D` (≈5.0:1). Leave `--dk-ev-faint` and the dark
overrides alone.

### M3 · At 390 the comparison tables scroll sideways with no affordance, so A and B are never both on screen

`.dk-table{min-width:520px}` inside a 350 px wrapper. 25 tables scroll horizontally at 390 —
`why-return`, `why-buy`, `direction-a`, `direction-b`, `purchase`, `compare` (four score tables),
`recommendation`, and three `sheet-table`s. Widths run 360–664 px against a 350 px column; the widest
is `direction-b` at 664 px.

The deck's central act is A beside B. On a phone the reader sees the A column, a hairline, and a tall
run of blank space where B's cell — off canvas — is setting the row height. `purchase-390-light.png`
shows three rows in a row like this. There is no fade, arrow or any other sign the table moves.

**Fix**: below ~700 px restack `.dk-table--compare` / `.dk-table--score` as stacked definition rows
(dimension, then A, then B), or at minimum drop `min-width` and add a scroll hint.

### M4 · A 2-up or 3-up frame row at 390 renders the mock type at 4–7 px

The fit routine lands `--s ≈ 0.40` for two frames (169 px wide) and `0.26` for three (112 px). The
mocks' own 12–17 px type comes out at 4–7 px — present, not readable — and the callout discs sit over
the bezels. `tiles/direction-a-390-light-t12.png`, `purchase-390-light.png`.

**Fix**: `.dk-frames{flex-wrap:wrap}` below 820 px so rows stack one-up at `--s ≈ .8`.

---

## Minor

### m1 · 31 of 53 figures are `loading="lazy"`, which a print export will miss

All 53 images are inlined `data:` URIs and every one decodes on approach; document height is stable, so
there is no layout shift and no anchor drift (verified — see below). But a browser print or PDF export
runs before the off-screen ones decode. For a self-contained deck the attribute buys nothing.
**Fix**: drop `loading="lazy"`, or decode all figures on `beforeprint`.

### m2 · The index scroller clips its own current row against the toggle

At 1440 the current row can sit flush against the theme button and lose its last glyph
(`asread-purchase-1440-dark.png`: "THE PURCHASE PAT|H"). At 390 the bar shows about two rows.
**Fix**: `scroll-padding-inline-end` on `.dk-index-scroll`, or a gap before `.dk-theme`.

### m3 · `.dk-frame-cap` overruns its column by 8 px at 600

Same gap arithmetic as B2, smaller `n`. Fixing B2 closes it.

### m4 · Opening the raw file locally renders in quirks mode and pins the progress hairline at 100 %

`presentation.html` correctly carries no `<!doctype>`, `<html>`, `<head>` or `<body>` — the Artifact
wrapper supplies them. A reviewer who opens the file directly gets quirks mode, where
`documentElement.clientHeight` equals `scrollHeight`, so `drawProgress()`'s span collapses to 1 and the
hairline reads 100 % from the first scroll. In the doctype skeleton it reads correctly (26.71 % at
y 26,578 of 99,515). Not a deck defect — a local-preview caveat worth knowing before someone files it.

---

## Verified clean

- **Console and network.** 0 console errors, 0 page errors, 0 failed requests, 0 external requests
  across all four passes. Hosts touched: `file://`, `fonts.googleapis.com`, `fonts.gstatic.com` —
  nothing else. (`qa-results.json`'s `nonAllowedUrlsInSource` is a false positive: the source regex
  matched `//` runs inside base64 payloads. The live request capture is the authority.)
- **Fonts.** 8 faces load — Playfair Display 400/500/400-italic, Inter 400/500/600, DM Mono 400/500.
  Computed families resolve as intended: `.dk-h1` → Playfair Display, `.hour` → DM Mono, body → Inter.
  No fourth face, no system-UI headline.
- **Images.** All 53 are `data:` URIs. None external, none failed to inline, none broken.
- **No dark-only colour.** Token audit over `kit.css` (89 tokens) and the deck head (51 tokens):
  **every one is defined on bare `:root`** before any `@media (prefers-color-scheme: dark)`,
  `:root[data-theme="dark"]` or `[data-scheme]` block. Zero used-but-undefined. Nothing can go
  unreadable in one theme because it only exists in the other.
- **Registers hold in both themes** (pixel-sampled from the section PNGs). `.reg-paper` ground:
  `rgb(236,230,219)` light, `rgb(20,18,15)` dark. `.reg-dark` evidence band: `rgb(12,14,17)` in
  **both** — the darkroom stays a darkroom, as the kit requires. Phone frames inside the dark band are
  drawn `data-scheme="light"`, correctly.
- **Theme toggle.** Cycles `(none) → light → dark → (none)`, stamping and removing `data-theme` on
  `<html>`, with `body` background following each step (`#ECE6DB` → `#ECE6DB` → `#14120F` → `#ECE6DB`).
  Explicit stamping wins over the media query in both directions.
- **Sticky index.** `position:sticky`, top 0 after a 4,000 px scroll, visible in all four passes.
  15 rows for 15 `data-index-title` sections. `aria-current` follows the scroll.
- **Anchors land correctly.** Section boxes stack exactly — no overlap, every `.hour` exactly +102 px
  from its section top. Clicking an index row lands the heading at y = 156 (1440) / y = 111 (390),
  clear of the 53 px bar, with the right row marked current. Checked for `direction-a`,
  `recommendation` and `colophon` on a cold load, and for five sections in every pass.
- **No section lost its eyebrow.** `#cover` has no `.hour` by design — it carries `.dk-cover__eyebrow`,
  "DAWN · PATINA, THE IOS CLIENT APP · A DESIGN REVIEW". The other 14 all have one.
- **Title.** `<title>The Daily Return</title>` is the first tag in the file, far inside 8 KB.
- **Size.** 5.97 MB of the 16 MB ceiling.
- **`c-06b` is not a deck defect.** In `compare` and `today` that shot shows the Studio header's
  `1 ROOMS · 1 SAVED · 63% MATCH` row colliding with the status bar. Checked against
  `shots/c-06b-studio-awaiting-you.png` at source resolution: the collision is in the simulator capture
  itself. The deck is reporting it faithfully. Worth a glance from the findings side — it may be an
  app behaviour nobody has logged.

---

## Where the widths land after the fixes

B1 and M1 together account for all of the sideways overrun at 1680, 1440, 1024 and 820. B2 accounts for
600 and the remainder at 390. With both closed, `scrollWidth` should equal the viewport at every width,
as it already does at 1200.
