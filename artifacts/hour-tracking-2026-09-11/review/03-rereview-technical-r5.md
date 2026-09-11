clean = false

# Review 03 — technical + design, round 5 (adversarial re-review)

**Target:** `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (1,559 lines, 136 KB)
**Baseline:** round 4 = `review/03-rereview-technical-r4.md`; fixes claimed in `review/02-fix-log-r4.md`
**Date:** 11 September 2026 · **Stance:** adversarial, no severity filter
**Verdict:** `clean = false` — **0 blockers · 3 majors · 6 minors · 6 notes**

Round 4's blocker and all three majors are genuinely discharged. Every one of
T4-1 … T4-17 is accounted for (audit in §4), and the 390 assertion that failed
last round now passes in both wrapper variants. The deck is materially better.

But the round-4 fixes moved the same defect one sheet to the right and one
width band down. Sheet 14 — the ruling sheet, the deck's payload — now
overflows its scroller in **two** width bands (861–~893 and 1001–~1093),
clipping real text at rest and collapsing "The question" column to a 113px
ribbon that breaks identifiers mid-token. Nobody measured at 1024: the
fixer's `r5-check.cjs` asserts only at 390, 1440 and a 900 spot check.
And this round's `architecture.md` renumbering (fix-log §5 item 2) left eight
cells of the deck's sheet 10 asserting migration slots the plan no longer uses.

---

## §0 · Method

- Static read of all 1,559 lines. CSS custom-property audit (declared vs
  consumed). WCAG 2.1 contrast computed in Python from the token hex values
  (sRGB relative luminance, `(L1+.05)/(L2+.05)`), alpha tokens composited over
  paper first.
- **Render check ran.** Chromium (`@playwright/test`, resolved from
  `apps/designer-portal` via `createRequire`) again refuses to launch inside the
  command sandbox; the runs were made with the sandbox off for those commands
  only, per the brief's documented exception. Nothing was installed.
  `fonts.googleapis.com` / `fonts.gstatic.com` were reachable, so every
  measurement is taken with the real faces loaded (Inter, DM Mono, Playfair
  Display 500 + 400-italic all report `loaded`).
- The wrapper was **rebuilt from the current deck source** inside the script, so
  the measurement cannot be taken against a stale snapshot. (I also byte-compared
  the fixer's `_r5wrapped.html` against `deck/src/index.html`: identical. The
  fixer did not measure a stale file.) Two variants: bare publish shell
  (`_r5bwrapped.html`) and shell + the documented head reset
  (`_r5bwrapped-reset.html`). **Both measure identically**, as in round 4.
- Scripts (re-runnable with `cd /Users/kody/Code/patina-merged/apps/designer-portal && node <script>`, sandbox off):
  `review/shots/r5b-check.cjs` — the brief's assertion set, both wrappers, 390 /
  1440 / 1024 / 900, dark-emulated screenshots, keyboard, fonts, tokens.
  `review/shots/r5b-diag.cjs` — width sweep 861→1440, min-content attribution on
  sheet 14, identification of every in-scroller offender at 390, deterministic
  keyboard measurement under `reducedMotion: 'reduce'` (instant scroll, so
  landings are final rather than mid-animation), tab order.
- Screenshots: `review/shots/r5b-{1440,390}-dark-sheet{01,03,10,14}.png` (8, dark
  emulated) · `r5b-1024-sheet14.png` · `r5b-900-gutter.png`. All read.

---

## §1 · Assertion results, verbatim

### A1–A4 @ 390 × 844 — PASS (both wrapper variants)

```json
{ "id": "A1", "variant": "plain", "viewport": "390x844",
  "expr": "document.documentElement.scrollWidth <= window.innerWidth",
  "scrollWidth": 390, "innerWidth": 390, "pass": true }
```
*(the `plain` A1/A2 rows scrolled off my terminal tail; the identical
expression is re-measured in the same run as
`"displacement_plain": { "scrollX": 0, "docSW": 390 }` at a 390 viewport, and
the `reset` twin below is verbatim.)*

```json
{ "id": "A3", "variant": "plain", "viewport": "390x844",
  "expr": "no element with getBoundingClientRect().right > 390 outside a .scroller",
  "offendersOutsideScroller": [], "offendersInsideScroller": 8, "pass": true }

{ "id": "A4", "variant": "plain", "viewport": "390x844",
  "expr": "sheet 02 .mq fully inside the viewport, no clipping in either axis",
  "text": "0 taps in a document, 8 off one, impossible on the phone with nothing held and in Field beyond a just-closed visit",
  "left": 16, "right": 374, "iw": 390,
  "clientWidth": 358, "scrollWidth": 358,
  "clientHeight": 50, "scrollHeight": 50, "scrollX": 0,
  "textAlign": "left", "whiteSpace": "normal", "pass": true }

{ "id": "A1", "variant": "reset", "viewport": "390x844",
  "expr": "document.documentElement.scrollWidth <= window.innerWidth",
  "scrollWidth": 390, "innerWidth": 390, "pass": true }

{ "id": "A2", "variant": "reset", "viewport": "390x844",
  "expr": "every .slide box within [0, innerWidth]",
  "offending": [], "slideCount": 16, "pass": true }

{ "id": "A3", "variant": "reset", "viewport": "390x844",
  "expr": "no element with getBoundingClientRect().right > 390 outside a .scroller",
  "offendersOutsideScroller": [], "offendersInsideScroller": 8, "pass": true }

{ "id": "A4", "variant": "reset", "viewport": "390x844",
  "expr": "sheet 02 .mq fully inside the viewport, no clipping in either axis",
  "text": "0 taps in a document, 8 off one, impossible on the phone with nothing held and in Field beyond a just-closed visit",
  "left": 16, "right": 374, "iw": 390,
  "clientWidth": 358, "scrollWidth": 358,
  "clientHeight": 50, "scrollHeight": 50, "scrollX": 0,
  "textAlign": "left", "whiteSpace": "normal", "pass": true }
```

**The 8 "in-scroller" offenders at 390 are benign and identified**, not waved
past: all eight are `<th>` elements inside a `<thead>` that the ≤860px block
makes `position: absolute; width: 1px; clip-path: inset(50%)`. Each reports
`"clippedAncestor": "THEAD."`. Nothing visible extends past 390.

### A5 @ 1440 × 900 — PASS

```json
{ "id": "A5-1440", "viewport": "1440x900",
  "expr": "no .scroller with scrollWidth > clientWidth + 3",
  "overflowing": [], "docSW": 1440, "innerWidth": 1440, "pass": true }
```

### A5 @ 1024 × 768 — **FAIL**

```json
{ "id": "A5-1024", "viewport": "1024x768",
  "expr": "no .scroller with scrollWidth > clientWidth + 3",
  "overflowing": [
    { "sheet": "sheet-14", "table": "sheet widest",
      "scrollWidth": 822, "clientWidth": 794, "delta": 28 }
  ],
  "docSW": 1024, "innerWidth": 1024, "pass": false }
```

The colophon declares **no** table as wide, so there is no exemption to apply.

### Collateral, verbatim

```json
"gutter_position_1440": "sticky",
"gutter_position_1024": "sticky",
"gutter_position_900":  "static",
"gutter_hittest_900":   "gutter scrolled out of view (static) — no overlap possible",
"displacement_plain":   { "scrollX": 0, "docSW": 390 },
"displacement_reset":   { "scrollX": 0, "docSW": 390 },
"dark_tokens": { "--paper": "#2A2622", "--ink": "#F2EDE6", "--ink-muted": "#D6CEC4",
                 "--ink-subtle": "#C7BEB3", "--ink-faint": "#B8AEA2" }
```

Keyboard, measured deterministically under `reducedMotion: 'reduce'` at 1440
(`r5b-diag.cjs`):

```json
"keyboard": {
 "tops": [0,900,1800,3509,4454,5410,6809,7709,8698,9990,11401,12418,14521,15844,19620,20520],
 "seq": [["ArrowRight",900],["ArrowRight",1800],["ArrowRight",3509],["j",4454],
         ["ArrowLeft",3509],["k",1800],["End",20520],["Home",0]],
 "afterRepeat": 6809, "repeatTargetIdx": 6,
 "endThenLeft": 19620, "lastTop": 20520, "secondLastTop": 19620,
 "afterShift": 0, "afterCtrl": 0 },
"tabOrder": ["SECTION.slide tabindex=-1 label="]
```

Every branch lands exactly on a slide top. Six `ArrowRight` at 40ms → index 6
exactly (auto-repeat safe). `End` then an immediate `ArrowLeft` → 19620 = the
second-to-last slide top: **T4-9 is genuinely fixed** (a stale `pending` would
have paged from index 0). `Shift+ArrowRight` and `Control+ArrowRight` are
ignored (`scrollY` stays 0). Form-field guard is present in source
(`isContentEditable` + `/^(INPUT|TEXTAREA|SELECT)$/`) though the deck has no
form fields. The only `[tabindex]` at 1440 is `#sheet-2`'s `-1` skip-link
target — no scroller is a tab stop, because none overflows.

### Width sweep for scroller overflow (`r5b-diag.cjs`)

| Width | overflowing scroller | delta | clientWidth |
|---|---|---|---|
| 861 | `#sheet-14` | **30** | 792 |
| 900 | — | 0 | |
| 960 | — | 0 | |
| 1000 | — | 0 | |
| **1001** | `#sheet-14` | **49** | 773 |
| **1024** | `#sheet-14` | **28** | 794 |
| 1100 | — | 0 | |
| 1200 / 1280 / 1366 / 1440 | — | 0 | |

Crossing 1000 → 1001 makes the layout **worse**: the gutter becomes a 124px
column + 24px gap, so available width drops from 920 to 773. That is the
"worse as you widen" band B-R3-3 moved the breakpoint to eliminate; it is back,
on a different sheet.

### Text actually cut (Range client-rects against the scroller's right edge)

| Width | cut text | px hidden at rest |
|---|---|---|
| 861 | `CR extend · MOB gate · VET instrument` | 30.0 |
| 1001 | `CR extend · MOB gate · VET instrument` | 49.2 |
| 1001 | `FS decisive; draft says DEFINER` | 0.9 |
| 1024 | `CR extend · MOB gate · VET instrument` | 28.1 |

---

## §2 · Artifact-rule conformance

| Rule | Result | Evidence |
|---|---|---|
| No `<!doctype>` / `<html>` / `<head>` / `<body>` / `<meta>` | **PASS** | grep: 0 hits |
| `<title>` and `<style>` at top | **PASS** | `:1` title · `:2-4` font links · `:5-275` style (see **T5-N2**) |
| Complete light palette on bare `:root` | **PASS** | `:14-45` — all 12 colour tokens + 4 non-colour |
| Dark under `@media (prefers-color-scheme: dark)` guarded `:root:not([data-theme="light"])` | **PASS** | `:47-61`; measured OS-dark → `--paper #2A2622` |
| Dark also under `:root[data-theme="dark"]` | **PASS** | `:63-77` |
| Light restored under `:root[data-theme="light"]` | **PASS** | `:62` + the `:not()` guard: OS-dark + `data-theme=light` falls through to bare `:root` |
| No colour defined only inside a media block | **PASS** | 16 properties declared on bare `:root`, 16 consumed, zero orphans |
| `body` explicit token background + `padding-inline` | **PASS** | `:81-91` — `background: var(--paper)`, `padding-inline: clamp(16px,4vw,64px)`; measured 16px at 390 |
| Tables inside `overflow-x:auto` scrollers | **PASS** | 15 tables, 15 `.scroller`, 1:1 (see **T5-9** for the ≤860 caveat) |
| External assets: only the `fonts.googleapis.com` stylesheet | **PASS** | 3 external URLs total: `fonts.googleapis.com` preconnect + `css2` stylesheet, `fonts.gstatic.com` preconnect (the font files' own origin). No external scripts, images, fetch, XHR |
| No `<a download>` | **PASS** | 1 `<a>` in the file, the skip link (`:277`) |
| No per-second motion | **PASS** | 0 `@keyframes`, 0 `animation:`, 0 `transition:` in the whole file |
| `prefers-reduced-motion` honoured | **PASS** | `:244-251`; JS `scrollToSlide` passes `behavior:'auto'` under reduce (`:1467`); measured instant |
| Keyboard nav (←/→/j/k, guarded) | **PASS** | measured above; modifier guard `:1504`, form-field guard `:1505-1506` |
| House families with fallbacks | **PASS** | `:38-40`; Playfair Display/Georgia/Times · Inter/-apple-system/… · DM Mono/SF Mono/Fira Code/ui-monospace |
| Nothing wider than a 390px viewport | **PASS** | A1–A4 above |
| No undeclared scroller overflow at 1024 | **FAIL** | **T5-1** |

---

## §3 · Contrast — computed from the token values

| Token | Light on `--paper` | Dark on `--paper` | Verdict |
|---|---|---|---|
| `--ink` (body text) | **13.53:1** | **12.89:1** | PASS ≥4.5 |
| `--ink-muted` | **8.99:1** | **9.64:1** | PASS ≥4.5 |
| `--ink-subtle` | **7.54:1** | **8.18:1** | PASS ≥4.5 |
| `--ink-faint` (`.mq` 11px, `td.src` 11.5px, `.t-head`, `thead`) | **6.35:1** | **6.87:1** | PASS ≥4.5, and ≫3 as meta |
| `--clay-ink` (focus ring) | 5.61:1 | 8.03:1 | PASS ≥3 non-text |
| `--terracotta-ink` (`.defect`) | 5.28:1 | 7.34:1 | PASS |
| `--sage-ink` (`.holds`) | 5.27:1 | 7.80:1 | PASS |
| `--oak` | 4.20:1 | 5.33:1 | PASS as used — never text; 24px gutter rule + `text-decoration-color` only |
| `--hairline` | 1.20:1 | 1.51:1 | decoration only — **T5-N4** |
| `--hairline-strong` (composited) | 1.30:1 | 1.94:1 | decoration only |

`--ink` on `--paper-doc` (the skip-link plate): 13.87:1 light, 13.56:1 dark.
**No body-text token below 4.5:1 and no meta/faint token below 3:1, in either
palette.** Unchanged from round 4, re-derived independently.

---

## §4 · Round-4 discharge audit — T4-1 … T4-17

| ID | R4 sev | Discharged? | Evidence |
|---|---|---|---|
| **T4-1** | blocker | **YES** | `:223` `.mq { … white-space: normal … }`; measured `whiteSpace: "normal"`, `.mq` 358px, `left 16 / right 374` at 390; `docSW 390 = iw 390` |
| **T4-2** | major | **YES on sheet 02** — but the *defect class* recurs on sheet 14 (**T5-1/T5-2**) | `all_scrollers_1440: []`; sheet 02 clean at 861–1440 in the sweep |
| **T4-3** | major | **YES** | `:144` `position: static` in the `@media (max-width:1000px)` block. Measured `sticky` at 1440/1024, `static` at 900. Hit test at 900 on sheet 14: gutter scrolls out of view, no overlap possible. Confirmed visually in `r5b-900-gutter.png` — the running head sits as a static row above the heading |
| **T4-4** | major | **YES** | `scrollIntoView` on sheet 02's `.mq` at 390 leaves `scrollX: 0`, `docSW: 390`, in both wrapper variants |
| **T4-5** | minor | **YES for the 390 claim** | nothing clipped at 390. (The 1024 clip in T5-1 is horizontal *scroll*, the house's sanctioned mechanism, not `text-overflow` truncation — the colophon's wording survives, narrowly) |
| **T4-6** | minor | **YES** (declare branch) | `:1426` names `td.src`/`.legend span` 11.5px and `td.num` 13px in the deviations entry |
| **T4-7** | minor | **YES** | `:305-307` all three verdict `.t-body` spans carry `.measure`. Visible consequence: **T5-8** |
| **T4-8** | minor | **YES for `td.src`** | `:188` `overflow-wrap: break-word`. The same hazard survives on `code` — **T5-4** |
| **T4-9** | minor | **YES** | `:1525`, `:1527` both call `resetPending()`; measured `End` → immediate `ArrowLeft` = 19620 (second-last top), not index 0 |
| **T4-10** | minor | **YES** | `:223` `display: block; text-align: left; margin: 2px 0 0`; measured `textAlign: "left"`. Visible consequence: **T5-7** |
| **T4-11** | minor | **YES at 1440** | `tabOrder` = one `-1` target only; no scroller announces itself. (At 1024 sheet 14's scroller *is* a tab stop — correct behaviour, but see **T5-5**) |
| **T4-12** | note | **YES** | `<main>` at `:280`, `</main>` at `:1435`, wrapping all 16 sections; skip link and shortcut sentence outside |
| **T4-13** | note | **YES** | `:113` `em { font-style: normal; font-weight: 500; color: var(--ink) }` |
| **T4-14** | note | **no action, correct** | hairlines re-measured 1.20/1.51:1, decoration only; ≤860 card divider still `--ink-faint` (`:204`) |
| **T4-15** | note | **no action, carried** | measured: all four `Playfair Display 400 normal` faces `unloaded`. Re-logged as **T5-N1** |
| **T4-16** | note | **accepted** | ≤860 card mode confirmed in `r5b-390-dark-sheet03.png`; labels are real text. Re-logged as **T5-N3** |
| **T4-17** | note | **closed, correctly** | B-R3-13 non-reproducible; sheet 03 clean at every swept width |

**All 17 discharged.** Nothing reopens at its original severity.

---

## §5 · Findings

| ID | Sev | Conf | Location | Finding | Fix |
|---|---|---|---|---|---|
| **T5-1** | **major** | high | `:1345` (+ `:1338`, `:1360`, `:1366-67`), CSS `:189` | **The brief's 1024 assertion fails.** `#sheet-14 .scroller` has a min-content floor of **822px** against 794 available at 1024, 773 at 1001, 792 at 861 — so it overflows by 28 / 49 / 30px in two bands (861–~893 and 1001–~1093), and **real text is cut at rest**: `CR extend · MOB gate · VET instrument` loses 28.1px at 1024. Root cause is round 4's own pattern one cell over: `table.sheet td.num { white-space: nowrap }` (`:189`) applied to prose — `:1345` is `<td data-label="Panel" class="num">CR extend · MOB gate · VET instrument</td>`, a 298px unbreakable cell. `.num.wrap` (B-R3-14's escape hatch, `:190`) exists for exactly this and is used 7× elsewhere, never here. Crossing 1000 → 1001 makes it *worse* (49px vs 0), the regression class B-R3-3 was meant to end | Add `wrap` to the `num` class on every sheet-14 Panel cell carrying prose rather than a tally: `:1345` (`CR extend · MOB gate · VET instrument`), `:1366` (`FS decisive; draft says DEFINER`), `:1338` (`CR narrow; FS flags the cost`), `:1360` (`CR amend; FS carve-out`), `:1367` (`FS, CR, LEAH, REP split`). Then re-run the sweep at 861 / 1001 / 1024 |
| **T5-2** | **major** | high | `:1346`, CSS `:106` | At 1001–1024 sheet 14's **"The question" column collapses to 113px** (measured column widths `[59, 75, 113, 277, 298]`), setting 2–3 words per line, growing one-line rows to ~200px tall, and breaking identifiers mid-token: `hourly_rate_ / cents`, `change_order / _terms`, `profiles.def / ault_hourly_ / rate_cents`, `claim_time_e / ntries`, `project_unbi / lled_time` (`r5b-1024-sheet14.png`). This is round 4's T4-2 ribbon, verbatim, on the deck's payload sheet. The 277px floor under "Panel recommendation" is set by R4-7's own fix: `:1346` inserts the bare token `FieldCompanionPresentation.swift:56-64` as plain text, outside `<code>`, so the default `overflow-wrap: normal` makes it unbreakable | Wrap the Swift citation at `:1346` in `<code>` (which already carries `overflow-wrap: anywhere`, `:106`) — or move it to a `td.src` footnote cell as every other Swift citation in the deck is handled (`:433`, `:1026`). Fix **T5-4** alongside so the question column's min-content is bounded rather than free to collapse |
| **T5-3** | **major** | high | `:1112`, `:1120`, `:1128`, `:1136`, `:1144`, `:1152`, `:1162`, `:1365` | **The deck now contradicts its own cited source.** Fix-log §5 item 2 renumbered `architecture.md`'s migration slots (W2 `head+10…+13`, W3 `head+14…+15`, W4 `head+16…+20`, W5 `head+21` reserved, W6 `head+22…+23`, W7 `head+24…+26`) and deliberately left the deck untouched. Sheet 10's Migrations column still reads `head+10…+12` / `head+13…+14` / `head+15…+19` / `none · head+20 reserved` / `head+21…+22` / `head+23…+25`, and the All row `head+1…+25`. Verified against `architecture.md:831-836` and the wave bodies at `:287`, `:411`, `:504`, `:667`, `:769`. Eight stale cells, not the one the fixer flagged. These are implementation instructions: a wave brief copied from this sheet writes the wrong migration numbers | Renumber the seven sheet-10 cells to match `architecture.md:831-836` (All row → `head+1…+26`), and `:1365` HT-37 `head+12` → `head+13` per `architecture.md:324`, `:956`. `:1304` (risk 8) and `:1399` (HT-10 gates W2's `head+12`) stay as they are — HT-10 still owns `head+12` (`architecture.md:301`, `:903`) |
| **T5-4** | minor | med-high | `:106` | `code { overflow-wrap: anywhere }` lets any column whose content is mostly `<code>` drop its min-content to near zero, so the auto table layout hands that column whatever is left after the unbreakable columns take their floor. This is T4-8's mechanism exactly, fixed for `td.src` (`:188`) and left on `code`. It is why the question column becomes a ribbon in T5-2 rather than holding a floor, and it produces `profiles.default_hourly_rat / e_cents` even at 1440 (`r5b-1440-dark-sheet14.png`, **T5-N5**) | `code { overflow-wrap: break-word }` — breaks only a token that cannot fit, and gives each identifier column a real floor. Keep `anywhere` on `.reg dd`, where the colophon genuinely needs it |
| **T5-5** | minor | med | `:1537-1543` | At the widths where a scroller overflows, `updateScrollers()` names it with the **whole** heading: sheet 14's accessible name is `"Table: Forty questions. Four must be ruled before the plan can be sequenced: HT-1 (W1), HT-10 & HT-37 (W2), HT-4 (W7 + W1's backfill)."` — 140 characters read aloud before the reader reaches the table. A region name should be a name | Truncate at the first sentence, or use a short `data-table-name` attribute on the table and fall back to the heading's first clause |
| **T5-6** | minor | high | `:329-330` | Sheet 02's `.mq` and the adjacent "What the row actually holds" cell say the same thing twice, in two registers: `.mq` = "0 taps in a document, 8 off one, … in Field beyond a just-closed visit"; the prose cell = "Zero taps inside an open document; eight off one; … in Patina Field for anything but a just-closed visit". At ≤860 the card mode prints them consecutively, four lines apart, so the duplication is unmissable. R4-1 restated the prose cell and left the `.mq` in the old register | Either cut the `.mq` (the prose cell carries the fact) or shorten it to the dial's gloss — "8 taps off-document" — and let the prose cell do the rest |
| **T5-7** | minor | med | `:223` | `.mq` is now `display: block; text-align: left` inside a `text-align: center` `td.mark`, so a short note renders at the **column's left edge** while the dial it annotates is centred. On sheet 03 the lone "8" under "Log with nothing in hand" sits 42px left of its dial and reads as a stray figure; "1 tap" and "wrong answer" do the same (`r5b-1440-dark-sheet03.png`). T4-10's report offered this branch and the alternative (left-align the whole cell); the chosen branch trades one misalignment for another | Either `text-align: center` on `.mq` when its text is short, or take T4-10's second branch: left-align `td.mark` in cells that carry an `.mq`, so dial and note share one edge |
| **T5-8** | minor | med | `:305-307`, `:151-155` | T4-7's `.measure` cap works, but `.verdicts > li`'s hairlines still span the full 1092px content column while the text now stops at ~592px, leaving ~45% of every rule with nothing beneath it at 1440 (`r5b-1440-dark-sheet01.png`). The rule reads as a ruled line for a column that is not there | Narrow the verdict rules to the measure (`.verdicts > li { max-width: calc(116px + 24px + 58ch) }`), or drop `.measure` on the verdicts and cap the `.verdicts` block itself |
| **T5-9** | minor | med | `:196-197`, `:89` | At ≤860 `.scroller` becomes `overflow-x: visible` while `body` keeps `overflow-x: hidden`. Nothing exceeds 390 today (measured: 0 offenders outside clipped `thead`s), but the structure means any future over-wide cell at phone width is silently eaten with no scrollbar and no scroll affordance — the exact mechanism that made T4-1 a blocker rather than a scroll annoyance. There is no guard left in the file | Either keep `overflow-x: auto` on `.scroller` in the ≤860 block, or drop `body { overflow-x: hidden }` so an escape is at least visible. Belt and braces, not either alone |
| **T5-N1** | note | high | `:4` | Playfair Display **400 upright** is requested and never used — measured, all four 400-upright faces `unloaded`; only 500-upright and 400-italic load. House-sheet conformance, carried unchanged from B-R3-16 / T4-15 | None |
| **T5-N2** | note | high | `:2-4` | Three `<link>` elements sit between `<title>` and `<style>`, i.e. in the publish shell's `<body>`. Browsers honour a body `<link rel=stylesheet>` and the measurement confirms all three families load, so this works — but the contract's phrasing is "`<title>` and `<style>` at the top of the file", and a stricter future host could drop them | None needed; note for the record |
| **T5-N3** | note | high | `:196-216` | ≤860 replaces 15 tables with `display:block` card lists and `::before` labels. Confirmed correct and legible at 390 (`r5b-390-dark-sheet03.png`, `r5b-390-dark-sheet14.png`), zero `<td>` without `data-label`. Row/column relationships are gone for AT at phone width — the standard trade-off, accepted in round 4 | Accept |
| **T5-N4** | note | high | `:167`, `:204` | Hairlines are 1.20:1 (light) / 1.51:1 (dark) against paper. Decoration only; the one rule that carries meaning (the ≤860 card divider) is `--ink-faint` at 6.35 / 6.87:1 | None |
| **T5-N5** | note | med | `:1330` (HT-2) | Even at 1440, sheet 14 breaks `profiles.default_hourly_rat / e_cents` mid-token, because the question column is min-content-sized and `code` may break anywhere. Legible, but an identifier split across lines invites a mis-copy | Dissolves with **T5-4** |
| **T5-N6** | note | med | `:1530-1546` | A scroller becomes a `role="region"` landmark only at widths where it overflows, so sheet 14 is an announced region at 1024 and an unannounced table at 1440 and at 390. Defensible (a non-scrolling region is a dead keyboard stop, which is what T4-11 objected to) but it makes the AT experience width-dependent | Accept, or give every sheet table a stable `role="region"` + short name and use `tabindex` alone for the scroll affordance |

---

## §6 · What I did not verify

- **Content accuracy** — numbers, citations, ruling ids, seat counts. The content
  lens owns it. T5-3 is the one exception: it is a self-contradiction created by
  *this round's* source edit, and the deck states migration slots as build
  instructions, so it is a technical defect as much as a factual one.
- **Real-device rendering** — Chromium only. iOS Safari's dynamic viewport and
  find-on-page behaviour are untested.
- **The print PDF sheet-by-sheet.** The print block still forces the light
  palette, un-collapses the tables and restores `thead` (`:262-274`); I did not
  page through the output.
- **The two 1024-band fixes' interaction.** T5-1's `.num.wrap` additions alone
  take the Panel column's floor from 298 to roughly its next-longest nowrap cell;
  T5-2/T5-4 are what free the question column. Both should be measured together.

---

## Verdict

`clean = false`. Zero blockers, **three majors**: the 1024 assertion fails on
sheet 14 (**T5-1**), its question column collapses into round 4's ribbon
(**T5-2**), and the deck's sheet 10 now asserts migration slots the amended
plan has abandoned (**T5-3**).

None of the three is a design question. T5-1 is five `class="num"` →
`class="num wrap"` edits. T5-2 is one `<code>` wrapper plus one CSS word.
T5-3 is eight cells copied from `architecture.md:831-836`. What they share is a
cause worth naming before round 6: **every round so far has measured at 390 and
1440 and nowhere between**, and every round's regression has landed in the band
between them. The next fix log should run the sweep, not the two endpoints.
