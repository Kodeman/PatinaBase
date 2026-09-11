# Review 03 — technical + design, round 4 (adversarial re-review)

**Target:** `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (1,555 lines, 131 KB)
**Baseline:** round 3 = `review/03-rereview-technical-r3.md`; fixes claimed in `review/02-fix-log-r3.md`
**Date:** 11 September 2026 · **Stance:** adversarial, no severity filter
**Verdict:** `clean = false` — **1 blocker · 3 majors · 7 minors · 6 notes**

Round 3's two majors are discharged, and **every one of the 24 round-3 fixes
landed** (audit in §4). But two of those fixes broke the deck:

- **A-R3-1** lengthened sheet 02's mark annotation to a 113-character sentence
  and left it inside a `white-space: nowrap` cell. That one line now breaks the
  deck at **every** width — it is the blocker (**T4-1**), it wrecks sheet 02's
  desktop layout (**T4-2**), and it makes the viewport slide sideways with no
  way back (**T4-4**).
- **B-R3-12** made `.gutter` sticky to give a position cue. Above 1000px that is
  safe; at or below 1000px the gutter is a full-width transparent row, so the
  running head is now painted on top of the scrolling table (**T4-3**).

Round 3 measured the 390 layout as "genuinely sound." That measurement was taken
against `_r3wrapped.html` (built 10:27) — **before** the 10:53 fix that broke it.
Nobody re-measured after the fixes. This round did.

---

## §0 · Method

- Static read of all 1,555 lines; CSS custom-property audit (declared vs consumed);
  WCAG 2.1 contrast computed from token hex values (sRGB relative luminance,
  `(L1+.05)/(L2+.05)`), alpha tokens composited over paper first.
- **Render check ran.** Chromium (`@playwright/test@1.58.2`, resolved from
  `apps/designer-portal` via `createRequire`) again refuses to launch inside the
  command sandbox (`mach_port_rendezvous_mac.cc:155 … Permission denied (1100)`).
  Re-run with the sandbox disabled for those commands only; every number below is
  a measurement, not an inference. Network to `fonts.googleapis.com` /
  `fonts.gstatic.com` was reachable, so the deck was measured **with its real
  faces loaded** (all three families report `loaded`), not with fallbacks.
- Page content wrapped in the Artifact publish shell exactly as the brief
  specifies (`review/shots/_rv4wrapped.html`), and a second time with the
  documented head reset added (`color-scheme: light`, 14px system font, off-white
  ground — `_rv4wrapped-reset.html`). **Both wrappers measure identically**; the
  host reset changes nothing, because the deck re-declares `:root` and `body`
  after it in the cascade.
- Scripts (re-runnable with `cd /Users/kody/Code/patina-merged/apps/designer-portal && node <script>`, sandbox off):
  `review/shots/rv4-probe.cjs` (nine widths × two schemes, tokens, theme overrides, fonts, motion, screenshots) ·
  `rv4-probe2.cjs` (ancestor-aware overflow, horizontal scrollability, keyboard paging, tab order, print) ·
  `rv4-probe3.cjs` (per-scroller overflow by width, sticky, truncation) ·
  `rv4-probe4.cjs` (sticky-gutter hit-testing, horizontal displacement) ·
  `rv4-probe5.cjs` (displacement, measured on three scroll roots) ·
  `rv4-probe6.cjs` (measure / characters per line) ·
  `rv4-probe7.cjs` (the one-line fix, verified at four widths).
  Data: `rv4-report.json` … `rv4-report4.json`. Screenshots: `review/shots/rv4-*.png` (36) · `rv4-print.pdf`.
- Widths measured: 320, 360, 390, 700, 860, 861, 900, 960, 1000, 1024, 1200, 1280, 1440 —
  light and dark with `prefers-color-scheme` emulated, plus both `data-theme`
  overrides against both OS schemes, `reducedMotion: reduce`, and `media: print`.
- **The 390 assertion the brief asks for: RAN, and it FAILS.**
  `document.documentElement.scrollWidth = 836` against `window.innerWidth = 390`,
  in both palettes (`rv4-report.json` → `overflow.min/390-light`, `min/390-dark`;
  identical under the reset wrapper). Same failure at 320 (836), 360 (836) and
  700 (848). It passes at 860, 1024 and 1440.

---

## §1 · Artifact-rule conformance

| Rule | Result | Evidence |
|---|---|---|
| No `<!doctype>` / `<html>` / `<head>` / `<body>` / `<meta>` tags | **PASS** | grep across file: 0 hits |
| `<title>` first, `<style>` at top | **PASS** | `:1` title · `:2-4` font links · `:5-275` style |
| Light tokens on bare `:root` | **PASS** | `:14-45` — every colour token declared here |
| Dark under `@media (prefers-color-scheme: dark)` guarded `:root:not([data-theme="light"])` | **PASS** | `:47-61`; measured OS-dark → `--paper #2A2622` |
| Dark also under `:root[data-theme="dark"]` | **PASS** | `:63-77`; measured OS-light + `data-theme=dark` → `#2A2622` |
| Explicit light restore under `:root[data-theme="light"]` | **PASS** | `:62`; measured OS-dark + `data-theme=light` → `#FAF7F2` |
| No colour defined only inside a media block | **PASS** | 16 custom properties declared, all in bare `:root`; declared set == consumed set exactly |
| `body` explicit background + side padding | **PASS** | `:81-91` — `background: var(--paper)`, `padding-inline: clamp(16px,4vw,64px)`; measured 16px at 390, 57.6px at 1440 |
| Tables wrapped in `overflow-x:auto` | **PASS** | 15 tables, 15 `.scroller` wrappers, 1:1 |
| Nothing wider than a 390px viewport | **FAIL** | `docSW 836 > iw 390` — **T4-1** |
| External assets: only the `fonts.googleapis.com` stylesheet | **PASS** | 3 external URLs total: 2 preconnects (`googleapis`, `gstatic` — the font files' own origin) + 1 `css2` stylesheet. No external scripts, images, fetch |
| No `<a download>` | **PASS** | 1 `<a>` in the whole file, the skip link (`:277`) |
| No per-second motion | **PASS** | 0 `@keyframes`, 0 animated elements, 0 transitions > 0.001s |
| `prefers-reduced-motion` honoured | **PASS** | `:244-251` (`@media (prefers-reduced-motion: reduce)`); measured `scroll-behavior: auto` under reduce, and `scrollToSlide` passes `behavior:'auto'` (`:1467`) |
| Keyboard nav works | **PASS with 2 minors** | measured below; **T4-9**, **T4-11** |
| House §A families with fallbacks | **PASS** | `:38-40` verbatim from `SPEC.md:114-116`; all three families measured `loaded` |

**Keyboard, measured** (`rv4-report2.json` → `keyboard`): slide tops
`[0, 900, 2720, 4189, 5091, 6046, 7488, …]`. Four `ArrowRight` presses →
`900, 2720, 4189, 5091` (one slide each). `ArrowLeft` from a slide top → 4189
(previous slide). `End` → 20422 (last slide top). `Home` → 0. `j` → 900,
`k` → 0. **Six presses at 40ms intervals → 7488 = slide index 6 exactly** —
B-R3-6's `pending` rewrite works under auto-repeat. A focused scroller cedes
ArrowRight until its right edge, then pages (measured: `scrollLeft` 0 → 40 → next
slide). Tab order: skip link, then one scroller (see **T4-11**).

---

## §2 · Contrast — computed from the token values

| Token | Light on `--paper` | Dark on `--paper` | Verdict |
|---|---|---|---|
| `--ink` (body text) | **13.53:1** | **12.89:1** | PASS — the body-text ratio the brief asks for, both palettes |
| `--ink-muted` | 8.99:1 | 9.64:1 | PASS |
| `--ink-subtle` | 7.54:1 | 8.18:1 | PASS |
| `--ink-faint` (`.mq`, `td.src`, `.t-head`, thead) | 6.35:1 | 6.87:1 | PASS — clears 4.5 even at 11px |
| `--clay-ink` (focus ring) | 5.61:1 | 8.03:1 | PASS (≥3:1 non-text) |
| `--terracotta-ink` (`.defect`) | 5.28:1 | 7.34:1 | PASS |
| `--sage-ink` (`.holds`) | 5.27:1 | 7.80:1 | PASS |
| `--oak` | 4.20:1 | 5.33:1 | PASS as used — never text; only the 24px gutter rule (`:139`) and `text-decoration-color` (`:239`), both non-text ≥3:1 |
| `--hairline` | 1.20:1 | 1.51:1 | Decoration only — see **T4-14** |
| `--hairline-strong` (composited) | 1.30:1 | 1.94:1 | Decoration only |

`--ink` on `--paper-doc` (the skip-link plate): 13.87:1 light, 13.56:1 dark.
**No text token in either palette falls below 4.5:1.**

---

## §3 · Findings

| ID | Sev | Conf | Location | Finding | Fix |
|---|---|---|---|---|---|
| **T4-1** | **blocker** | high | `:191` + `:223` + `:327` | `.mq` inherits `white-space: nowrap` from `td.mark`; sheet 02's 113-char annotation renders 803px wide, so at 390 the page measures `docSW 836 > iw 390` and `body{overflow-x:hidden}` (`:89`) removes the scrollbar — 51% of the sentence is unreachable | `.mq { white-space: normal }` at `:223` — verified |
| **T4-2** | major | high | `:191`, `:327` | The same nowrap cell sets sheet 02's table min-content width to 1095px: its scroller overflows by 3px@1440, 65@1280, 139@1200, 301@1024, collapsing "What the row actually holds" to a ~45px ribbon and breaking citations mid-token | Same one-liner; verified 0 overflow at all four widths |
| **T4-3** | major | high | `:136`, `:142-147` | `.gutter` stays `position: sticky; top: 24px` in the ≤1000px block, where it is a full-width transparent row — the running head is painted over the scrolling table on every slide taller than the viewport | `@media (max-width:1000px){ .gutter{ position: static } }` |
| **T4-4** | major | med-high | `:89`, `:327` | A `scrollIntoView` onto the over-wide `.mq` (find-in-page, focus, fragment jump) sets `window.scrollX = 33` permanently; every left edge clips (heading left 16 → −17) and the suppressed scrollbar leaves no way back | Dissolves with T4-1; keep `overflow-x:hidden` only as a belt, never as the fix |
| **T4-5** | minor | high | `:1424` | The colophon claims "No shadow, no reveal motion, **no truncation**" while the page truncates 51% of a sentence at 390 — the deck's own house-conformance claim is false (SPEC.md:157 "Truncation \| none … Wrap") | Fix T4-1; the claim then becomes true |
| **T4-6** | minor | high | `:188`, `:189`, `:225` | Three off-scale type sizes — `td.src` 11.5px, `.legend span` 11.5px, `td.num` 13px — against §A3's "Nothing else" (SPEC.md:145), and the colophon's known-deviations list omits all three | Move to 11px/12px meta, or add the three to the deviations entry |
| **T4-7** | minor | high | `:107`, cover `:302-306` | Prose runs 94ch on the cover verdicts and 82ch in the widest cells against §A4's "prose capped at 65ch" (SPEC.md:154); `.measure` (58ch) is applied once, to the authorship line only | Apply `.measure` to the verdict `.t-body` spans, or declare the deviation |
| **T4-8** | minor | med | `:188` | `td.src { overflow-wrap: anywhere }` lets the citation column's min-content width fall below its longest token — that is what let the Evidence column collapse to 45px under T4-2 | `overflow-wrap: break-word` — breaks only a token that cannot fit, and bounds the column |
| **T4-9** | minor | med | `:1520-1523` | The `Home` / `End` branches never touch `pending`, so a Home/End followed within 900ms by an arrow (before `scrollend`, or in a browser without it) pages from a stale index | Call `resetPending()` in both branches |
| **T4-10** | minor | med | `:191` | Once T4-1 is fixed the note wraps but inherits `text-align: center` from `td.mark` — three centred ragged mono lines beside a left-aligned table | Give `.mq` `display:block; text-align:left` in the annotated cells, or left-align `td.mark` when it carries an `.mq` |
| **T4-11** | minor | low-med | `:1500`, `:1530-1546` | At 1440 the only tab stop besides the skip link is sheet 02's scroller, made focusable and announced ("Table: Six cells. Two pass outright.") by a 3px overflow — a keyboard stop at a region that cannot visibly move | Dissolves with T4-1; otherwise widen `scrollerCanScroll`'s tolerance from 1px to ~8px |
| **T4-12** | note | high | whole file | No landmark: 16 `<section>`s, no `<main>`; the wrapper supplies `<body>` only, so AT gets no top-level region | Optional — a `<main>` around the sections |
| **T4-13** | note | high | `:113` | `em` renders non-italic, weight 500, `--ink-muted` — emphasis painted as de-emphasis, lower contrast than the surrounding ink (10 instances) | Consider `--ink` with weight 500, keeping the no-italic house choice |
| **T4-14** | note | high | `:167`, `:204` | Hairlines are 1.20:1 (light) / 1.51:1 (dark) against paper — fine as decoration; the ≤860px card divider is already lifted to `--ink-faint` (6.35 / 6.87:1), so the one place a rule carries meaning is sound | None |
| **T4-15** | note | high | `:4` | Playfair Display 400 upright is requested and never used — `document.fonts` reports all four 400-upright faces `unloaded`. House-sheet conformance (SPEC.md:114); carried unchanged from B-R3-16 | None |
| **T4-16** | note | med | `:196-216` | ≤860px all 15 tables become `display:block` card lists, replacing table semantics with `::before` labels — the standard trade-off, and the labels are real text, but row/column relationships are gone for AT at phone width | Accept, or add `role="table"`-preserving markup later |
| **T4-17** | note | high | — | Round 3's deferred **B-R3-13** (sheet 03's citation column drives layout at 1024) is no longer reproducible: at 1024 only sheet 02's scroller overflows. The item can be closed once T4-1 is fixed | Close B-R3-13 |

### T4-1 — the blocker, in full

`table.sheet td.mark { text-align: center; white-space: nowrap; }` (`:191`).
The ≤860px block overrides only `text-align` (`:206`), never `white-space`. `.mq`
(`:223`) sets no `white-space` of its own, so it inherits `nowrap` at every width.

Round 3's fix A-R3-1 (`02-fix-log-r3.md:14-18`) replaced sheet 02's short mark
note with a 113-character sentence (`:327`):

> `0 taps in a document, 8 off one, impossible on the phone with nothing held and in Field beyond a just-closed visit`

Measured (`rv4-report2.json`):

| Width | `documentElement.scrollWidth` | `innerWidth` | `.mq` width | Visible fraction of the sentence |
|---|---|---|---|---|
| 320 | 836 | 320 | 803px | 0.36 |
| 360 | 836 | 360 | 803px | 0.41 |
| **390** | **836** | **390** | **803px** | **0.49** |
| 700 | 848 | 700 | 803px | 0.82 |
| 860 | 860 | 860 | 803px | 1.00 |

`body { overflow-x: hidden }` (`:89`) means no scrollbar appears and
`window.scrollTo(600,0)` is a no-op — the reader cannot reach the rest of the
sentence. It is not a horizontal-scroll bug; it is silent content loss.

**Verified fix** (`rv4-probe7.cjs`) — adding `.mq { white-space: normal }` alone:

| Width | `docSW` before → after | Scroller overflow before → after |
|---|---|---|
| 390 | 836 → **390** | 462px → **0** |
| 700 | 848 → **700** | 176px → **0** |
| 1024 | 1024 → 1024 | 301px → **0** |
| 1440 | 1440 → 1440 | 3px → **0** |

Screenshots: `rv4-390-truncation.png` (broken) · `rv4-1440-light-sheet-2.png`
(broken desktop) · `rv4-1440-sheet-2-FIXED.png`, `rv4-390-sheet-2-FIXED.png`
(one line later). Note the print block already forces
`td.mark { white-space: normal !important }` (`:273`) — the file knows the fix;
it is applied to paper and not to screen.

### T4-2 — what it does to the deck's first substantive sheet at 1440

`rv4-1440-light-sheet-2.png`: the 803px nowrap cell takes the "Today" column;
"What the row actually holds" is squeezed to a ~45px ribbon that sets one or two
words per line ("Zero taps / inside an / open / document;"), rows grow to ~300px
tall for a single fact, the "Evidence" column breaks paths mid-token
(`log-strip.ts` / `x:11-12`), the header "WHAT THE ROW ACTUALLY HOLDS" stacks to
four lines, and the table still overflows its scroller so the `EVIDENCE` header
is clipped at the right edge. This is the sheet that states Kody's six
requirements — the first thing after the cover.

### T4-3 — the sticky gutter, ≤1000px

`elementsFromPoint` at the gutter's centre (`rv4-report4.json`):

| Width | Stack under the point | Overlapping content? |
|---|---|---|
| 390 | `P.t-head` → `DIV.gutter` → `TR` → `TBODY` → `TABLE.sheet widest` | yes |
| 900 | `P.t-head` → `DIV.gutter` → `TD.id` → `TABLE.sheet widest` | yes |
| 1000 | `P.t-head` → `DIV.gutter` → `TD.id` → `TD.id` → `TABLE.sheet widest` | yes |

Computed background: `rgba(0,0,0,0)`. Screenshot `rv4-900-stickyoverlap.png`
shows `SHEET 14 / 16   THE RULING SHEET` printed directly across the row
"owned rule resolve **billable** for every **source**" — both texts unreadable.
Above 1000px the gutter has its own 124px column and sticky is exactly the cue
B-R3-12 wanted (measured stuck at `top: 24` on sheet 14 at 1440, no overlap), so
the fix is to scope sticky to the two-column band, not to remove it.

### T4-4 — displacement with no way back

At 390 (`rv4-probe5.cjs`):

| Step | `htmlLeft` | `window.scrollX` | left edge of the sheet-02 heading |
|---|---|---|---|
| at rest | 0 | 0 | 16px |
| after `scrollIntoView` on `.mq` | 33 | 33 | **−17px** |
| after a plain vertical wheel | 33 | 33 | −17px |

The viewport stays displaced. Browsers call `scrollIntoView` on a find-in-page
match, on focus, and on a fragment navigation, so this is reachable by ordinary
reading behaviour on a phone, and `overflow-x: hidden` is what removes the
affordance to undo it.

---

## §4 · Round-3 fix audit — all 24 verified

| Fix | Landed? | How verified |
|---|---|---|
| A-R3-1 mark-note wording | yes | `:327` — **and it is the blocker, T4-1** |
| A-R3-2, A-R3-3, A-R3-6/10, A-R3-7, A-R3-8, A-R3-9, A-R3-12, A-R3-13, A-R3-16 | yes | content edits, present at the cited cells (content lens owns the facts) |
| B-R3-1 sheet 15 verdict | yes | `:1386` matches the cover's four-gate clause |
| B-R3-2 print light palette | yes | measured under `media:print` — `--paper` resolves `#FAF7F2` with `data-theme=dark` set |
| B-R3-3 breakpoint 900 → 1000 | yes | `:142`; no worse-as-you-widen band remains (860/861/900/960/1000 measured) |
| B-R3-4 print `white-space: normal` | yes | `:273` |
| B-R3-5 late-font / `pageshow` rescan | yes | `:1549-1553` |
| B-R3-6 + B-R3-8 paging under auto-repeat | yes | six 40ms presses land exactly on slide 6 |
| B-R3-7 Shift+Arrow released | yes | `:1504` includes `ev.shiftKey` |
| B-R3-9 `strong` / `em` | yes | `:109-113`; `strong` 600 in body contexts, mono cells stay 500 |
| B-R3-10 one vocabulary | yes | 120 marks: 25 `present`, 12 `partial`, 83 `absent`; legend matches |
| B-R3-11 sheet 15 table name | yes | `:1390` visually-hidden `<h3 id="h15b">`, table points at it |
| B-R3-12 sticky gutter | yes | `:136` — **and it is T4-3** |
| B-R3-14 `.num.wrap` escape hatch | yes | `:190`, 6 cells use it |
| B-R3-15 dead CSS | yes | 16 custom properties declared, 16 consumed, zero orphans; the five dead classes are gone |
| B-R3-19 sheet 09 legend → paragraph | yes | `:1069` |
| B-R3-20 card divider `--ink-faint` | yes | `:204` |
| B-R3-22 Home/End in the shortcut sentence | yes | `:278` |
| B-R3-23 per-table scroller labels | yes | measured `aria-label="Table: Six cells. Two pass outright."` |

Structure re-checked and still sound: 16 slides / 16 `aria-labelledby` targets,
all ids unique, **zero** `<td>` without `data-label` (needed for the ≤860px card
mode), every `<th>` with `scope`, heading order h1 → h2 → h3, no `box-shadow`, no
`text-overflow: ellipsis`, no inline `font-size`, no `colspan`/`rowspan`.

---

## §5 · What I did not verify

- Content accuracy (numbers, citations, ruling ids) — the content lens owns it;
  I read the deck as a document, not as a claim set.
- Real-device rendering (iOS Safari's dynamic viewport, its find-on-page
  behaviour under T4-4) — Chromium only.
- The 61-page print PDF sheet-by-sheet; I confirmed the palette forces light, the
  tables un-collapse and `thead` returns to `static`, nothing more.

---

## Verdict

`clean = false`. One blocker (**T4-1**) and three majors (**T4-2**, **T4-3**,
**T4-4**). T4-1, T4-2 and T4-4 are one defect with three faces and one verified
one-line fix; T4-3 is a second one-line fix. Neither needs new facts, new copy,
or a design pass — after both lines the deck passes the 390 assertion, loses
every scroller overflow at 1024/1200/1280/1440, and stops painting its running
head over its own tables.
