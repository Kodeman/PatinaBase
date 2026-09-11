# Review 03 — technical + design, round 3 (adversarial re-review)

**Target:** `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (1,523 lines, 130 KB)
**Baseline:** round 2 = `review/03-rereview-technical.md`; fixes claimed in `review/02-fix-log-r2.md`
**Date:** 11 September 2026 · **Stance:** adversarial, no severity filter
**Verdict:** `clean = false` — **0 blockers · 2 majors · 12 minors · 9 notes**

Round 2's five majors: **four are fully discharged and verified by measurement**
(R2-1 clipping, R2-2 the 861–1200 block-card band, R2-3 the position predicate,
R2-4 the dead keyboard stops). **R2-5 is two-thirds fixed** — the fixer corrected
the cover and sheet 14's heading and left the third instance, which is the one
sitting four lines above the table that refutes it (**R3-1**). Two new defects
arrived with the round-2 fixes: the print block added for R2-14 is incomplete in
two ways (**R3-2**, **R3-4**), and the breakpoint moved for R2-2 now collides with
the `.inner` gutter breakpoint in a 79px band (**R3-3**).

---

## §0 · Method

- Static read of all 1,523 lines; CSS token audit; WCAG 2.1 contrast computed
  from the token hex values (sRGB relative luminance, `(L1+.05)/(L2+.05)`).
- **Render check ran.** Chromium (`@playwright/test@1.58.2`, resolved from
  `apps/designer-portal` via `createRequire`) refuses to launch inside the
  command sandbox (`mach_port_rendezvous_mac.cc:155 … Permission denied (1100)`)
  — the same failure rounds 1 and 2 recorded. Re-run with the sandbox disabled
  for those commands only; it then launches and every probe below is a
  measurement, not an inference.
- Page content wrapped in the Artifact publish shell (`<!doctype html><html><head>`
  `<meta charset><meta viewport><reset></head><body style="margin:0">`) at
  `review/shots/_r3wrapped.html`, built by `review/shots/r3-wrap.cjs`.
- Scripts (re-runnable with `cd apps/designer-portal && node <script>`, sandbox off):
  `review/shots/r4-probe.cjs` (widths, a11y structure, themes, paging, screenshots) ·
  `r4-probe2.cjs` (honest painted-overflow, band sweep, tab order, print, font-swap) ·
  `r4-probe3.cjs` (keyboard edge cases) · `r4-probe4.cjs` (what drives table min-width) ·
  `r4-probe5.cjs` (print-page overflow).
  Data: `r4-report.json` · `r4-report2.json` · `r4-report3.json` · `r4-report4.json`.
  Screenshots: `review/shots/r4-*.png` (22 files, instant-scroll) · `r4-print-dark.pdf`.
- Widths measured: 390, 430, 768, 820, 860, **861**, 900, **901**, 960, 1024,
  1100, 1180, 1200, 1280, 1440, 1600, 1920 — light and dark, `prefers-color-scheme`
  emulated — plus a 5px sweep from 895 to 1060, `reducedMotion: reduce`, both
  `data-theme` overrides, and `media: print` at 816 and 739 CSS px.
- **The 390 assertion the brief asks for: ran, passed, and this time it means
  something.** `document.documentElement.scrollWidth <= window.innerWidth` is true
  at 390 in both palettes — but it is true by construction (`body{overflow-x:hidden}`,
  `:105`). Round 2's painted-box probe was *also* vacuous: it skipped any element
  with a clipping ancestor, and `body`'s own `overflow-x: hidden` makes that every
  element. I re-ran it with the ancestor walk **stopping at `body`**: **0 painted
  boxes cross the viewport edge at 390, 430 and 768**, and **0 `<td>` has content
  wider than its own box** (`r4-report2.json` `honest@390/430/768`). The 390 layout
  is genuinely sound, on an honest probe.

---

## §1 · Artifact-rule conformance — the blocker checklist

| Rule | Result | Evidence |
|---|---|---|
| No `<!doctype>` / `<html>` / `<head>` / `<body>` tags | **PASS** | grep: 0 hits |
| `<title>` first, `<style>` at top | **PASS** | `:1` title, `:2-4` font links, `:5-286` style |
| Light tokens on bare `:root` | **PASS** | `:13-53` — all 15 tokens the dark blocks redefine are defined here first |
| Dark under `@media (prefers-color-scheme: dark)` guarded `:root:not([data-theme="light"])` | **PASS** | `:55-73` |
| Dark also under `:root[data-theme="dark"]` | **PASS** | `:75-91`, after the media block |
| No colour defined only inside a media block | **PASS** | audited all 15; each has a bare-`:root` definition |
| `body` explicit background + side padding | **PASS** | `:99-101`; measured 16px @390, 30.7px @768, 48px @1200, 57.6px @1440, 64px @1600+ |
| Every table inside `overflow-x:auto` | **PASS** | 15 tables, 15 `.scroller` wrappers, 1:1, measured `inScroller: true` ×15 |
| Nothing wider than the 390 viewport | **PASS** | honest painted-box probe (see §0): 0 at 390/430/768 |
| External assets only `fonts.googleapis.com` (+ `fonts.gstatic.com` files) | **PASS** | `:2-4` only; grep for `http` returns those three lines and nothing else |
| No `<a download>` | **PASS** | grep: 0 |
| No per-second motion | **PASS** | 0 `@keyframes`, 0 `animation:`, 0 `transition:`, 0 `transform:` (the only `transform` hits are `text-transform`) |
| `prefers-reduced-motion` honoured | **PASS** | `:261-267`; measured `scrollBehavior: auto` under `reducedMotion: reduce`; JS `matchMedia` guard at `:1468` |
| Keyboard navigation works | **PASS with defects** | paging correct at every sampled position; see **R3-5…R3-8** |
| House-sheet §A families with fallbacks | **PASS** | `:49-51` byte-identical to `SPEC.md:118-120`; `<link>` `:4` is `SPEC.md:112-114` verbatim. Computed: Playfair → Georgia → Times; Inter → -apple-system → system-ui; DM Mono → SF Mono → Fira Code → ui-monospace |
| Body-text contrast ≥ 4.5:1 both palettes | **PASS** | **13.53:1** light · **12.89:1** dark |

Also clean and re-verified this round: 0 `box-shadow`, 0 `text-overflow`, 0 inline
`style=` attribute, 0 hex literal outside the token block, 0 `<th>` in any `<tbody>`,
**862 `<td>` and every one carries `data-label`** (0 missing), 15/15 tables carry a
resolving `aria-labelledby`, 120 `role="img"` marks and **0 without an `aria-label`**,
one `h1` / fifteen `h2` / one `h3` with no skipped level, a `forced-colors` block
(`:268-273`), a `@media print` block (`:274-286`, new), and **zero console errors and
zero page errors in every render case**.

### Contrast, computed from the token values

| Ink | on `--paper` light | on `--paper` dark |
|---|---|---|
| `--ink` (body, 14–16px) | **13.53:1** ✓ | **12.89:1** ✓ |
| `--ink-muted` | 8.99:1 ✓ | 9.64:1 ✓ |
| `--ink-subtle` (class now unused) | 7.54:1 ✓ | 8.18:1 ✓ |
| `--ink-faint` (11–12px meta, `.id`, `.src`, `.mq`, `.ann .k`, `td::before`) | 6.35:1 ✓ | 6.87:1 ✓ |
| `--clay-ink` (focus ring) | 5.61:1 ✓ | 8.03:1 ✓ |
| `--terracotta-ink` (`.defect`) | 5.28:1 ✓ | 7.34:1 ✓ |
| `--sage-ink` (`.holds`) | 5.27:1 ✓ | 7.80:1 ✓ |
| `--oak` — non-text only (gutter rule, link underline) | 4.20:1 (needs 3:1) ✓ | 5.33:1 ✓ |
| `--golden-ink` — **defined three times, used zero times** | 5.32:1 | 9.08:1 |
| `--hairline` / `--hairline-strong` (1px structure) | 1.20 / 1.30:1 — see R3-20 | 1.50 / 1.93:1 |
| **`--ink` on unprinted white paper (print + dark OS)** | — | **1.17:1 — see R3-2** |

---

## §2 · Round-2 findings — what actually landed

| Round 2 | Claimed | Verified round 3 | Now |
|---|---|---|---|
| R2-1 clipping ≥1200px | fixed (`min-width` dropped) | **YES** — 0 overflowing scrollers at 1024, 1100, 1180, 1200, 1280, 1440, 1600, 1920, both palettes | closed |
| R2-2 breakpoint 1200→860 | fixed | **YES** at 1024 (real table, 7 rows per screen, `r4-1024-light-sheet-3.png`) — but it opened a new 79px band | **R3-3** minor |
| R2-3 counter/`go()` predicate | fixed (`currentIndex()`) | **YES** — correct at 5 of 5 mid-slide samples (50/80% of sheet 14, 70% of 12, 60% of 3, 90% of 10); ArrowRight lands on the next sheet, off 0px, every time | closed |
| R2-4 dead keyboard stops | fixed (conditional `tabindex`) | **Mostly** — at 1440 the only tab stop is the skip link; at 901 five stops for four scrolling tables | **R3-5** minor |
| R2-5 "four gate the first line of code" | fixed | **Two of three.** Cover `:315` and sheet 14 `:1334` corrected; **sheet 15 `:1398` untouched** | **R3-1** major |
| R2-6 `#idx` plate | fixed (deleted) | **YES** — element, CSS and script hooks all gone; no plate over text at any width | closed, see R3-12 |
| R2-7 tfoot data rows | fixed | **YES** — exactly one `<tfoot>` survives (sheet 10, a genuine footnote); sheet 06's row is now `tbody tr.strong`, sheet 09's is a `.legend` | closed |
| R2-8 19/4 split | fixed (split dropped) | **YES** — "Twenty-three dispositions." `:1255`, 23 rows counted | closed |
| R2-9 "For / against" header | fixed (→ "Panel") | **YES** — header and all 40 `data-label`s read "Panel" | closed |
| R2-10 deviation list | fixed | **YES** — both missing deviations added `:1516` | closed, see R3-21 |
| R2-11 `security_invoker` citation | fixed | **YES** — `00412:2672` verified as `WITH (security_invoker = true) AS` | closed |
| R2-12 `default_hourly_rate_cents` | fixed | **YES** — `00177:89` verified as the `ADD COLUMN` line | closed |
| R2-13 `is_studio_comember` | fixed | **YES** — `00556:51` verified as `CREATE OR REPLACE FUNCTION public.is_studio_comember` | closed |
| R2-13a faux-bold / faux-italic | fixed | **YES** mechanically — measured `strong` = 500, `em` = `normal`/500, no synthesis. The cure has a cost | **R3-9** minor |
| R2-14 no print stylesheet | fixed | **Partly** — the block exists and restores table layout, but does not neutralise the dark palette and does not fit a default Letter page | **R3-2** major, **R3-4** minor |
| R2-15 `dvh` fallback | fixed | **YES** — `:134-135` | closed |
| R2-16 `overflow-x: visible` | fixed | **YES** — measured `overflowX: visible`, `overflowY: visible` at 390 on all 15 | closed |
| R2-17 `.oak` dead rule | fixed | **YES** — deleted; `--oak` survives on `.gutter .rule` and the link underline only | closed |
| R2-18 hairline contrast | conditional, dropped | Values unchanged; the ≤860 card divider is still the 1.30:1 rule | **R3-20** note |
| R2-19 HT-30 as "consent" | deferred to orchestrator | Unchanged, both instances | **R3-18** note |
| R2-20 cover counts = dashboard | fixed (reordered) | **YES** — `.counts` `:306` now precedes `.verdicts` `:312`, matching the deck's own HT-30 rule | closed |
| R2-21 unfalsifiable assertion | deferred | Standing; round 2's replacement probe was *also* vacuous — corrected here | **R3-17** note |

---

## §3 · Findings

| ID | Severity | Confidence | Location | Finding | Fix |
|---|---|---|---|---|---|
| **R3-1** | **major** | high | `index.html:1398` vs `:1405-1409` | **The sentence R2-5 was filed against survives on sheet 15 — four lines above the table that refutes it.** The "Rule the sheet" verdict reads *"four gate the first line of code (HT-1, HT-4, HT-10, HT-37)"*. The table immediately beneath it, on the same sheet, in the same viewport (`r4-1440-light-sheet-15.png` shows both at once), says HT-4 gates *"W7, and the cause behind W1's backfill"*, HT-10 gates *"W2's head+12"*, HT-37 gates *"W2's band"*. Only HT-1 gates the first line of code. The fixer corrected the cover (`:315`) and sheet 14's heading (`:1334`) to the accurate three-clause form and left the one instance a reader can disprove without scrolling. This is the deck's closing ask — the last sentence before the decision table. | Paste the corrected clause from `:315` over `:1398`: "four must be ruled before the plan can be sequenced — HT-1 gates W1's first line; HT-10 and HT-37 gate W2; HT-4 gates W7 and W1's backfill". |
| **R3-2** | **major** | high | `index.html:274-286` (no token override) | **Printed from a browser in dark mode, the deck comes out blank.** The `@media print` block added for R2-14 restores table layout but never neutralises the palette. Measured with `media: print` in a `colorScheme: dark` context (no forced scheme): `--paper` stays `#2A2622`, `body` colour stays `rgb(242,237,230)`, and `print-color-adjust` computes to `economy` — the default, under which the background is *not* printed. Body ink `#F2EDE6` on unprinted white paper is **1.17:1**. Every word of a 16-sheet business deck disappears. A reader who ticks "Background graphics" gets a legible but fully ink-flooded 16-page dark PDF instead. The fix log's own rationale for adding the block was that "a one-reader business deck is the artefact most likely to be exported and mailed". | Open the print block with a forced light palette: `@media print { :root, :root[data-theme="dark"] { color-scheme: light; --paper:#FAF7F2; --paper-doc:#FCFAF6; --rail:#E8E3DB; --ink:#2C2926; --ink-muted:#4E4339; --ink-subtle:#5A4E43; --ink-faint:#65594E; --hairline:#E8E3DB; --hairline-strong:rgba(44,41,38,.14); --oak:#8B7355; } … }`. |
| **R3-3** | minor | high | `index.html:157` vs `:214`, `:191` | **A 79px band where the deck gets *worse* as the window gets wider.** `.inner` drops its 124px gutter at ≤900px; tables collapse to block cards at ≤860px. Between them, crossing 900→905px re-inserts the gutter (124 + 24 gap) and the main column **shrinks from 828px to 685px while the viewport grows by 5px** (`r4-report2.json` `band`). In that band the tables no longer fit: measured 4 overflowing scrollers at 901–920 (max **70px**, sheets 02/03/04/14), 2 at 935–970, clear at 980. The content is reachable — each is a real `overflow-x:auto` region and now a keyboard stop — but it is the same "scroll a table sideways in the middle of a deck" failure R2-1 was filed for, moved down the width axis. 960px is a common half-screen browser width on a 1920 display. | One number: raise the `.inner` single-column breakpoint from `900px` to `1000px` (`:157`), so the gutter never returns before the main column can hold a table. Optionally also drop the `min-width: 680px` at `:191`, which is redundant once the block-card breakpoint owns the narrow case. |
| **R3-4** | minor | high | `index.html:276-278` | **At Chrome's default Letter margins the printed PDF is cut at the right edge, with no scrollbar to recover it.** The print block forces `display: table !important` and `min-width: 0 !important` on every table and `overflow: visible !important` on the scroller. Measured at 739 CSS px (8.5in less Chrome's 0.4in default margins): main column 680px, **sheet 02's table 743px wide and sheet 03's 751px, both painting past the page edge** (`r4-probe5.cjs`). At 816px (zero margins) they fit. Because `overflow` is `visible` in print, the overflow is simply lost — the screen's scroller is the only thing that made it recoverable. | Inside the print block, drop the nowrap floor rather than the layout: `table.sheet thead th, table.sheet td.num, table.sheet td.mark, table.sheet td.id { white-space: normal !important }`. Or add `@page { size: landscape }` and accept a 16-page landscape deck. |
| **R3-5** | minor | high | `index.html:1507-1521` | **`updateScrollers()` runs before the webfonts swap and only re-runs on `resize`, so R2-4's dead keyboard stop comes back by another door.** The function is called once at parse time and bound to `resize` only; `document.fonts.ready` is never awaited and no `FontFaceSet` listener exists. Measured two ways: (a) with `fonts.gstatic.com` delayed 1.5s at 940px, a scroller that overflowed by 7px in the fallback face measures **0px overflow after the swap and keeps `tabindex="0"`**; (b) on a fresh load at 901px the tab order is skip-link → sheet-2 → sheet-3 → sheet-4 → **sheet-6** → sheet-14, but only four of those scroll — sheet-6's is a stop announcing `role="region"`, "Table, scrolls horizontally", that cannot scroll. Any resize self-heals it, which is why round 2's post-resize measurement missed it. WCAG 4.1.2 (name/role/value). | `document.fonts.ready.then(updateScrollers)` after the first call, and re-run on `pageshow`. |
| **R3-6** | minor | high | `index.html:1453-1473` | **Fast or auto-repeat paging silently under-advances.** `currentIndex()` reads the live scroll position, so a second press fired during the smooth scroll still resolves to the slide being left. Measured from the cover at 1440: three ArrowRight presses 120ms apart land on **sheet 3**, not 4; **eight presses 40ms apart** (one hold of the key) land on **sheet 4**, not 9 — five presses lost. Well-spaced presses are exact (3 presses at 1.2s → sheet 4). A reader who holds the arrow key to reach the ruling sheet stops in the middle of the plan. | Track the target index in a closure variable (`pending = clamp(pending + delta)`, reset on `scrollend` or a timer) instead of re-deriving it from scroll position on every press. |
| **R3-7** | minor | high | `index.html:1481` | **Shift+Arrow is swallowed, so the deck's text cannot be selected with the keyboard.** The guard excludes `metaKey`, `ctrlKey` and `altKey` but not `shiftKey`; measured `Shift+ArrowRight` from the cover pages to sheet 3 instead of extending a selection. This is a deck of 218 findings and ~200 `path:line` citations that its reader is expected to quote into rulings. | Add `shiftKey` to the guard at `:1481`. |
| **R3-8** | minor | med | `index.html:1467-1474` | **ArrowLeft skips the head of the sheet you are reading.** `go(-1)` is `currentIndex() - 1`, so from anywhere inside a slide, Left jumps to the *previous* slide. Measured: from 60% into sheet 8 → sheet 7 (identical to pressing Left at sheet 8's top). Sheets 12 and 14 are ~2,000px and ~3,300px tall, so "go back and re-read the head of this sheet" — the natural act on a 40-row ruling table — is not reachable with one press, and the press that looks like it does it silently throws the sheet away. Asymmetric with ArrowRight, which is correct. | `go(-1)` should return to the top of the current slide when the reader is more than ~100px into it, and only step back a slide when already at the top. |
| **R3-9** | minor | med | `index.html:127-128` | **The faux-bold cure made `<strong>` and `<em>` typographically identical — and left the loaded weight that would have fixed it unused.** Measured: all 14 `<strong>` compute to weight 500, all 11 `<em>` to `font-style: normal; font-weight: 500`. Against `.t-body`'s 400 at 14px, Inter 500 is a weak signal; against `.t-head` (`:116`) and `table.sheet thead th` (`:196-201`), which are *already* 500, a `<strong>` inside them is no signal at all. Meanwhile `SPEC.md:125` says the families "ship 400/500/600 as real faces" and the deck's own request (`:4`) loads **Inter 600**, still used by zero rules (round 1's TD-17, round 2's R2-13a). Note the trap: `strong { font-weight: 600 }` alone would re-introduce synthesis, because the first `<strong>` in the file resolves to **DM Mono**, which only 400/500 are loaded for. | `strong { font-weight: 600 }` scoped to the body face (`.t-body strong, .t-body-sm strong, td.lead strong { font-weight: 600 }`) with `td.src strong, .t-head strong { font-weight: 500 }`; give `<em>` a different signal from `<strong>` (letterspacing, or `--ink` against a muted run) rather than the same 500. |
| **R3-10** | minor | med | `index.html:337`, `:811-813`, `:374-378` | **One glyph, three accessible vocabularies.** The same three dials are labelled `present` / `partial` / `absent` on sheets 02 and 03, `yes` / `no` / `partly` on sheet 06's permission matrix, and glossed in prose as **holds** / "partly, or answers the wrong question" / **absent** in sheet 02's own visible legend. A screen-reader user hears "present" where the sighted reader is told the word is "holds", and hears two different words for the half dial depending on which sheet they are on. | Pick one triple and use it in every `aria-label` and in the legend. |
| **R3-11** | minor | med | `index.html:1403` vs `:1396` | **Sheet 15's decision table is named "Three things are asked of you."** Its `aria-labelledby="h15"` points at the slide heading, which is also the `<section>`'s own name — so AT announces a table whose name describes the list above it, not the four gating rulings it contains. The other fourteen tables are named by a heading that describes them (sheet 06 even mints `h6b` for its second table). | Add a `.visually-hidden` `<h3 id="h15b">The four gating rulings</h3>` before the scroller and point the table at it. |
| **R3-12** | minor | med | `index.html` (`#idx` deleted); `:142-155` | **Deleting `#idx` removed the only persistent position cue.** R2-6's fix was justified on the ground that the gutter already prints "SHEET NN / 16" on every sheet — true, but the gutter is static and scrolls away: sheet 14 is ~3,300px tall at 1440, so a reader is out of sight of any sheet number for three viewport-heights, on the sheet where they must rule 40 questions. There is also no visible hint that the deck pages at all (the shortcut legend is `.visually-hidden`, `:288`). | `.gutter` (`:151`) gains `position: sticky; top: 24px; align-self: start` — no new element, no overlay, no plate over text, and the cue stays inside the margin where the house sheet already puts it. |
| **R3-13** | minor | med | `index.html:206` · `:414-557` · `r4-1024-light-sheet-3.png` | **At 1024 the citation column drives the layout.** Sheet 03's Footnote column renders ~100px wide, and `td.src`'s `overflow-wrap: anywhere` breaks identifiers mid-token — `log-` / `strip.tsx:11-` / `12` over three lines, `FieldVisitClo` / `seRecord.swif` / `t:128-176` over three. Row heights are set by the citation, not the claim: seventeen rows occupy ~1,900px, and the reader's eye is pulled to the most broken text on the sheet. The matrix is legible (R2-2 is discharged) but it reads as a column of damaged strings. | Below ~1100px, move `.src` citations out of the last column into a full-width `td` beneath each row (`colspan`), or hide the Footnote column and print the same citations as an ordered `.legend` list under the table. |
| **R3-14** | minor | med | `index.html:200`, `:207`, `:208` | **`white-space: nowrap` on `thead th`, `td.num` and `td.mark` is the structural floor under R3-3 and R3-4, and sheet 10 is already at zero clearance.** The eight nowrap headers of sheet 06 and sheet 03's six nowrap column heads set a min-content width no wrapping can relieve. At 1440, sheet 10's widest `td.num` — `none · head+20 reserved` — paints to the table's exact right edge with `padding-right: 0` (`r4-1440-dark-sheet-10.png`); one more word in any future migration cell clips at the widest layout the deck supports. | `thead th { white-space: normal; hyphens: manual }` and drop `nowrap` from `td.num` where the cell holds prose rather than a figure (sheet 10's Migrations, sheet 09's Taps, sheet 04's Today). Keep it on `td.id` and true figures. |
| **R3-15** | note | high | `index.html:118`, `:121`, `:165`, `:168-169` | **Dead CSS, larger than round 2 recorded.** Five class rules are defined and used zero times: `.t-money` (`:118`), `.ink-subtle` (`:121`), `.rule-hair` (`:165`), `.stack-6` (`:168`), `.stack-24` (`:169`). Twelve custom properties are never referenced: `--clay`, `--golden`, `--golden-ink`, `--sage`, `--terracotta`, `--rail`, `--ink-paper`, `--module`, `--radius-hair`, `--press-in`, `--press-out`, `--ease` — and `--golden-ink` is defined **three times** (bare `:root`, the media block, the `[data-theme]` block) for no consumer. `--press-in`/`--press-out`/`--ease` are motion tokens in a deck that declares zero motion. | Delete. Keep `--radius-box` (used by `.skip:focus`) and `--paper-doc` (same rule). |
| **R3-16** | note | high | `index.html:4` | **The font request loads two faces the deck never uses.** Measured `document.fonts`: `Inter 600` and `Playfair Display 400 normal` both stay `unloaded` after `fonts.ready` — nothing asks for them. The request is `SPEC.md:112-114` verbatim, so keeping it is defensible as house conformance; R3-9's fix would put Inter 600 to work and leave only Playfair 400 upright idle. | No action, or adopt R3-9. |
| **R3-17** | note | high | `index.html:105` | `body { overflow-x: hidden }` still makes the brief's `scrollWidth <= innerWidth` assertion unfalsifiable — **and round 2's replacement probe was equally blind**: it skipped any element with a clipping ancestor, which `body` is for every element on the page. Corrected here by stopping the ancestor walk at `body` (`r4-probe2.cjs`); the deck passes on the honest probe. **Standing gate for house decks: (1) painted-box overflow with the walk stopped at `body`, (2) `scroller.scrollWidth - scroller.clientWidth === 0` for every `.scroller` at every width in the supported range — which is the check that caught R3-3.** | Process, not markup. |
| **R3-18** | note | med | `index.html:315`, `:1398` vs `synthesis.md:301-304` | **HT-30 is still grouped as one of "three consent rulings".** HT-30 strengthens the §6 no-dashboard test; it governs vision conformance, not whether a hire trusts the clock. HT-10 (who may read whose hours) or HT-12 is the better third. Raised as TD-22, re-raised as R2-19, deferred both times because the deck is faithful to `synthesis.md`'s grouping and the fixer may not edit the synthesis. It will be inherited into the rulings unless someone decides it. | Orchestrator's call: amend `synthesis.md` and the deck together, or accept the grouping explicitly. |
| **R3-19** | note | med | `index.html:1079-1081` (`.legend` rule at `:241-242`) | **Sheet 09's `.legend` is a 33-word caveat wearing the legend's clothes.** `.legend` (`:241`) exists to key the three dials, and sheet 02 uses it that way. Sheet 09's is a single span reading *"'Online only' — no wave adds a portal offline write path; the label is read from the plan's absence of one, not a cited line"* — a provenance footnote, set in 11.5px `--ink-subtle` mono with no dial and no key. It is an honest disclosure in the wrong container. | A `.t-body-sm.ink-muted` paragraph under the scroller, or an `.ann` cell keyed "Provenance" — the pattern sheets 03, 06, 07 and 12 already use. |
| **R3-20** | note | med | `index.html:26`, `:29`, `:222-223` · `SPEC.md:160` | Hairlines remain **1.20:1** (`--hairline`) and **1.30:1** (`--hairline-strong`) on light paper. Below 860px the 1.30:1 rule is the only structure separating one block card from the next — sheet 03 becomes 17 cards divided by a line at 1.30:1. WCAG 1.4.11 exempts decorative separators and both values are the house sheet's own, so this is not a failure; on a projector the cards will read as one column. R2-18 was closed conditionally on R2-2, which is fixed for 1024 but leaves 390–860 in exactly this state. | Optional: `table.sheet tr { border-top-color: var(--ink-faint) }` inside the ≤860 block only. |
| **R3-21** | note | med | `index.html:1435` | The colophon's known-deviation list is now accurate for everything round 1 and 2 named, and I found no unrecorded §A deviation this round — `.measure` is 58ch against §A4's 65ch cap (tighter, allowed), `.t-authorship` is the only italic (§A3), no `ellipsis`, no `box-shadow`, radius 2/3px plus the recorded 11px dial. Recorded so round 4 does not re-derive it. | None. |
| **R3-22** | note | low | `index.html:288` vs `:1499-1504` | The visually-hidden shortcut legend names ArrowLeft/ArrowRight and j/k but not `Home` and `End`, both of which the handler implements and both of which work (measured: End → sheet 16, Home → sheet 1). | Add them to the sentence at `:288`. |
| **R3-23** | note | low | `index.html:1511-1513` | When several scrollers are simultaneously scrollable (measured: five at 901px), they become five `role="region"` landmarks sharing the identical accessible name "Table, scrolls horizontally" — a landmark list a screen-reader user cannot navigate by. | Compose the label from the table's own heading: `'Table: ' + document.getElementById(el.querySelector('table').getAttribute('aria-labelledby')).textContent`. |

---

## §4 · Citation integrity — twelve spot-checks, twelve exact

Every citation the round-2 fixer *changed* was re-resolved against source, plus four
carried forward:

| Deck citation | Resolves to | ✓ |
|---|---|---|
| `margin-groups.ts:11-13` (cover epigraph, colophon) | "`time` is not a margin item the margin prints: it is the studio's own clock, / and every surface that lists the margin excludes it." | ✓ |
| `studio-drawer.tsx:468` (accrual gate) | `{holding && inHandToday > 0 ? (` | ✓ |
| `hours-ledger.tsx:273` (`addValid`) | `const addValid = addProject && Number.isFinite(parsedAdd) && parsedAdd >= 1;` | ✓ |
| `hours-ledger.tsx:545-591` (the add row) | `{/* Batch add — the prototype's hours-add row */}` at :545 through the `Add` button at :593 | ✓ |
| `00545:147-148` (`source` CHECK is named) | `DROP CONSTRAINT IF EXISTS project_time_entries_source_ck,` / `ADD CONSTRAINT project_time_entries_source_ck CHECK (` | ✓ |
| `00556:51` (`is_studio_comember` live body) | `CREATE OR REPLACE FUNCTION public.is_studio_comember(p_owner uuid)` | ✓ |
| `00412:2672` (`security_invoker`) | `WITH (security_invoker = true) AS` | ✓ |
| `00177:89` (the column) | `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_hourly_rate_cents integer;` | ✓ |
| `00198:27-29` (`activity` CHECK, inline and unnamed) | `add column if not exists activity text / check (activity is null / or activity in (…))` — no constraint name | ✓ |
| `00577:2493-2496` (promotion filter needs both NOT NULL) | `AND entry.rated_amount_cents IS NOT NULL` / `AND entry.authority_rate_id IS NOT NULL` | ✓ |
| `00021:22`, `00021:136` | `CREATE TYPE member_role AS ENUM (` / `role member_role NOT NULL,` | ✓ |
| `architecture.md:22`, `:289` (studio_id not a policy key) | "**No RLS policy is ever keyed on `projects.studio_id`.**" / "`studio_id` … **not** used as a" | ✓ |
| `command-bar.tsx (1175 lines)` | `wc -l` = 1175 | ✓ |
| `use-time-tracking.ts` :118 / :271 / :316 / :320 / :467 / :480 / :634 / :689 / :791 | every one lands on the named symbol or literal | ✓ |

**Across three rounds, 26 of 26 spot-checked citations resolve exactly.** Citation
accuracy is a strength of this deck and no longer needs sampling.

### Arithmetic, re-derived from the markup this round

| Claim | Counted | ✓ |
|---|---|---|
| "Six cells. Two pass outright." | 6 rows, 2 `m-full` in the table (3rd is the legend) | ✓ |
| "Seventeen capabilities, five surfaces" | 17 `<tr>` + 1 header; 5 surface columns | ✓ |
| "Eight waves" | 8 wave rows + 1 `tfoot` | ✓ |
| "30–50 eng-days, 8 waves" | 6×M(3–5) + 2×L(6–10) = 30–50 | ✓ |
| "15–25, critical path" | W0+W1+W2+W5 = W0+W1+W3+W6 = 15–25 — the two paths are genuinely equal | ✓ |
| "2–3 concurrent worktrees" | stage table peaks at 3 | ✓ |
| "Eleven risks" | 11 rows | ✓ |
| "Twenty-three dispositions" | 23 rows, №1–23 | ✓ |
| "Forty questions" | 40 rows, HT-1…HT-40 | ✓ |
| "Sheet NN / 16" | 16 `<section class="slide">` | ✓ |

---

## §5 · What is good, and must survive round 4

1. **The 390 layout, now proven on an honest probe** — 862 labelled cells, 0
   painted overflow, 0 cell whose content exceeds its box, block cards with a
   real label per field, 16px gutters. Do not touch it while fixing R3-3.
2. **The 1024 matrix is back** and is the right form there — a real table, seven
   rows per screen, no clipping (`r4-1024-light-sheet-3.png`). R2-2 is genuinely
   discharged.
3. **Position and paging are correct where it counts** — `currentIndex()` was
   right at 5 of 5 mid-slide samples and ArrowRight landed on the next sheet at
   0px offset every time. The remaining keyboard findings (R3-6…R3-8) are about
   speed, direction and modifiers, not about the predicate.
4. **Contrast is clean at every text size in both palettes**, floor 6.35:1 on 11px
   meta; `--oak` is off the ink list; theme overrides verified in both directions.
5. **Zero motion, a correct reduced-motion block, a `matchMedia` guard, a
   `forced-colors` block** — and now a print block, which needs two more lines.
6. **Citation and arithmetic integrity** — 26/26 citations exact across three
   rounds, 10/10 counted claims correct.

---

## §6 · Fix order

1. **R3-1** — one sentence, copied from `:315` to `:1398`. The only finding that
   changes what Kody reads.
2. **R3-2** — eleven token declarations inside the print block.
3. **R3-3** — one number: `900px` → `1000px` at `:157`.
4. **R3-4**, **R3-14** — one `white-space` rule, print and screen; they are the
   same defect measured at two page widths.
5. **R3-5**, **R3-7** — two lines of JS (`fonts.ready.then(updateScrollers)`,
   `ev.shiftKey`).
6. **R3-6**, **R3-8** — the paging state variable; one change fixes both.
7. **R3-9…R3-13** — typography and naming.
8. **R3-15…R3-23** — records and cleanups.

`clean = false` — R3-1 and R3-2 stand.
