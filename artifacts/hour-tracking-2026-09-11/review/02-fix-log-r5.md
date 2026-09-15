# Fix log — round 5 findings (round-6 fixer)

Sources: `review/03-rereview-content-r5.md` (R5-1 … R5-18) and
`review/03-rereview-technical-r5.md` (T5-1 … T5-N6), both read in full.
Files touched: `deck/src/index.html`, `synthesis.md`, `architecture.md`. The nine
memos in `panel/` were **not** touched — they are seats' records.

Line numbers below are post-edit.

---

## 1 · Content findings

| ID | Disposition | Where |
|---|---|---|
| **R5-1** | **fixed** — all seven sheet-10 Migrations cells renumbered to `architecture.md:831-836`: W2 `head+10…+13`, W3 `head+14…+15`, W4 `head+16…+20`, W5 `none · head+21 reserved`, W6 `head+22…+23`, W7 `head+24…+26`, `tfoot` total `head+1…+26` | `deck/src/index.html:1122, 1130, 1138, 1146, 1154, 1162, 1172` |
| **R5-2** | **fixed** — HT-37's recommendation now reads "the INVOKER replacement lands in head+13". `:1314` (risk 8) and `:1409` (HT-10 gates W2's `head+12`) left untouched, as the report directs | `deck/src/index.html:1375` |
| **R5-3** | **fixed** — risk 2 now cites "…`is_project_team_member(project_id)` (00177:140,144,148,152, re-created at head by 00484:785,794,803,812)"; sheet 03's own-row footnote now cites "(head: 00484:803,785 · 00316:248,257)" | `deck/src/index.html:1308`, `:533` |
| **R5-4** | **fixed** — parenthetical dropped; the cell ends "…a pre-flight count of rows whose rate would change." | `deck/src/index.html:884` |
| **R5-5** | **fixed** — `00578:2599-2805` → `00578:2599-2820` at all five sites | `synthesis.md:29, :144`; `architecture.md:20, :171, :906` |
| **R5-6** | **fixed** — "222 lines (`00578:2599-2820`), 201 between `BEGIN` and `END`" at all three sites | `synthesis.md:141`; `architecture.md:241, :906` |
| **R5-7** | **fixed** — "all nine … five through `projects p` (`00177:136`; `00316:237,242,248,257`), four through `is_project_team_member` (`00177:140,144,148,152`)" at all four sites. **W4's count re-derived and the result stated in the plan**: the ninth policy is `00177:136`'s FOR ALL for the project's own `designer_id`; an internal row has no project, so it has no project designer and no NULL-case counterpart, and owner/admin reach is already carried by the `is_org_admin_or_owner` pair — **four new own-row policies stands, the ninth adds none**. Deck `:1138` / `:1308` therefore unchanged | `architecture.md:516, :907` (+ derivation at `:525-529`); `synthesis.md:186, :270` |
| **R5-8** | **fixed** — all three restated as "an admin who is **not** the project's designer", each naming `00177:136`'s FOR ALL as the exception that already lets the project's own designer adjust anyone's row | `synthesis.md:49, :193`; `architecture.md:280-282` |
| **R5-9** | **fixed** — "(Invariant V)" label dropped; now cites `FieldCompanionPresentation.swift:51-64` (two action ids at `:51-54`, one optional `action` at `:56-64`). Memo `panel/memo-ux-mobile.md:21` deliberately **left as written** (seat's record). **Two un-named companion sites carrying the same false label were fixed alongside**: `synthesis.md:189` and `architecture.md:691` | `synthesis.md:93`, `:189`; `architecture.md:691` |
| **R5-10** | **fixed** — "6 seats + the draft" at both | `synthesis.md:156`; `architecture.md:928` |
| **R5-11** | **fixed** — "Breaches R69's principle — its stated scope is spine timer + mobile bar only (`DECISIONS.md:2561`)". **One un-named companion site fixed alongside**: `synthesis.md:240` (dissent 22) still read "Reverses R69" | `architecture.md:926`; `synthesis.md:240` |
| **R5-12** | **fixed** — `VisitReview.swift:52-58` → `:52-83`, matching `:488` | `deck/src/index.html:1020` |
| **R5-13** | **fixed, both branches** — hole 4's two sentences joined with an em-dash, **and** the colophon deviation widened from "sheet 05's two hole cells" to "sheet 05's hole cells" | `deck/src/index.html:705`, `:1436` |
| **R5-14** | **fixed** — folded into the colophon deviation entry: "…sheet 05's hole cells, sheet 06's open question and **the verdict bodies on the cover and sheet 15** are reference sentences rather than short clauses" | `deck/src/index.html:1436` |
| **R5-15** | **skipped — not the fixer's to supply.** Note-severity, program-level: no DECK CONTRACT file exists and the fixer cannot author one; it is Kody's ruling on the 1 + 14 + 1 shape. No file edit available | — |
| **R5-16** | **skipped — "Fix: None."** Note recording a live Strata read (head `00591`, local tops out at `00580`, 591 − 580 = 11), which confirms the deck's `:1168` sentence. No edit asked | — |
| **R5-17** | **skipped — "Fix: None."** Confirmation that R4-8 / R4-9 / R4-13 / R4-11 / R4-12 are discharged on both sides | — |
| **R5-18** | **skipped — "Fix: None."** Advisory that sheet 06's `:809` gate cell is already head-anchored and needed no change under R5-3. Verified: left untouched | — |

## 2 · Technical findings

| ID | Disposition | Where |
|---|---|---|
| **T5-1** | **fixed** — `class="num"` → `class="num wrap"` on all five sheet-14 Panel cells carrying prose rather than a tally | `deck/src/index.html:1348` (HT-10), `:1355` (HT-17), `:1370` (HT-32), `:1376` (HT-38), `:1377` (HT-39) |
| **T5-2** | **fixed** — the bare `FieldCompanionPresentation.swift:56-64` in HT-18's recommendation is now wrapped in `<code>` | `deck/src/index.html:1356` |
| **T5-3** | **fixed** — same edit as R5-1 + R5-2 (eight cells). `:1314` and `:1409` left as they are; HT-10 still owns `head+12` | `deck/src/index.html:1122, 1130, 1138, 1146, 1154, 1162, 1172, 1375` |
| **T5-4** | **fixed, by the brief's variant — the report's literal `code { overflow-wrap: break-word }` was rejected with reason.** `break-word` does **not** contribute to min-content intrinsic sizing, so it would not have given the question column a floor; it would only have *removed* the escape that lets the code-heavy columns shrink, leaving T5-2's newly-`<code>`-wrapped 39-character Swift path as a ~300px unbreakable floor under "Panel recommendation" and re-failing the 1001 assertion (measured: total column floor 779px against 773px available). `code { overflow-wrap: anywhere }` is therefore **kept** (`:108`), and the floor the report actually wants is set explicitly: `@media (min-width: 861px) { #sheet-14 table.sheet th/td:nth-child(3) { min-width: 260px } }`. Measured result: the question column never falls below 264.7px at any swept width ≥861 (assertion floor 160px), and the ribbon is gone | `deck/src/index.html:200-205` |
| **T5-5** | **fixed** — `updateScrollers()` now prefers a `data-table-name` attribute on the table, and otherwise truncates the heading at its first `.`/`:`/`;`/em-dash. Measured on the pre-fix run (the only run where a scroller still overflowed and so announced itself): `"sheet-14 :: Table: Forty questions"` — 23 characters, down from 140 | `deck/src/index.html:1550-1559` |
| **T5-6** | **fixed** — sheet 02's `.mq` shortened to the dial's gloss, "8 taps off-document"; the prose cell at `:340` carries the fact in full. One register, no duplication in card mode | `deck/src/index.html:339` |
| **T5-7** | **fixed, T4-10's second branch** — `table.sheet td.mark:has(.mq) { text-align: left; }`, so the dial and its note share one left edge instead of the dial being centred and the note flush left | `deck/src/index.html:193` |
| **T5-8** | **fixed** — `.verdicts > li { max-width: calc(116px + 24px + 58ch) }`, so the rules stop where the measure stops | `deck/src/index.html:160` |
| **T5-9** | **fixed, belt and braces** — `body { overflow-x: hidden }` **kept** (`:89`), and the ≤860 block no longer drops the escape: `.scroller { overflow-x: visible }` → `.scroller { overflow-x: auto; overflow-y: hidden }`. A future over-wide cell at phone width now scrolls instead of being silently eaten. Measured: no scrollbar appears at 390 or 700 today (no scroller overflows) | `deck/src/index.html:209` |
| **T5-N1** | **skipped — "Fix: None."** Playfair Display 400-upright requested and unused; carried from B-R3-16 / T4-15 | — |
| **T5-N2** | **skipped — "None needed; note for the record."** The three `<link>` elements between `<title>` and `<style>` load correctly | — |
| **T5-N3** | **skipped — "Accept."** ≤860 card mode's loss of row/column relationships for AT is the standing accepted trade-off | — |
| **T5-N4** | **skipped — "None."** Hairlines are decoration; the one meaning-carrying rule is `--ink-faint` | — |
| **T5-N5** | **fixed as a side effect** — the 260px floor holds `profiles.default_hourly_rate_cents`, `change_order_terms`, `claim_time_entries` and `project_unbilled_time` on one line at every swept width ≥861 (`r6-1024-sheet14.png`). One residue remains: HT-18's now-`<code>`-wrapped `FieldCompanionPresentation.swift:56-64` still breaks mid-token in the recommendation column, which is the price of keeping `overflow-wrap: anywhere` on `code` per T5-4 above | `deck/src/index.html:200-205` |
| **T5-N6** | **skipped — "Accept."** A scroller is an announced region only where it overflows. After this round **no** scroller overflows at any swept width, so none is announced anywhere — the width-dependence the note describes no longer has a band to occur in | — |

**Skipped, with reason:** R5-15 (program-level; no file the fixer may author), R5-16,
R5-17, R5-18, T5-N1, T5-N2, T5-N3, T5-N4, T5-N6 — every one of them filed by its own
report with "Fix: None" / "Accept" / "None needed", or outside the three editable files.
T5-4 is applied by the brief's variant rather than the report's literal wording, for the
measured reason recorded in its row.

---

## 3 · Render sweep — `review/shots/r6-sweep.cjs`, one run

Extends `r5b-check.cjs`: rebuilds the publish wrapper from the **current** deck source
(`_r6wrapped.html`), loads it at 390 / 700 / 861 / 1001 / 1024 / 1280 / 1440 × 844 / 900
and asserts, at every width: (A1) `documentElement.scrollWidth <= innerWidth`;
(A2) no `.scroller` with `scrollWidth > clientWidth + 3`; (A3) no `<td>` narrower than
160px in `#sheet-14`'s question column at ≥861; (A4) no element outside a `.scroller`
with `right > innerWidth`.

Run: `cd /Users/kody/Code/patina-merged/apps/designer-portal && node /Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots/r6-sweep.cjs`
(sandbox off for that one command — Chromium will not launch inside it. Nothing installed.)

First run **failed A2 at 1001** by 6px (`sheet-14`, `scrollWidth` 779 vs `clientWidth`
773) — the question column's floor was set at 280px, 7px more than the 1001 band can pay
for once the 124px gutter column appears. Floor lowered 280px → 260px; re-run below is
the second and final run.

```
ROUND-6 SWEEP — 2026-09-11T16:46:05.355Z
widths 390 / 700 / 861 / 1001 / 1024 / 1280 / 1440 x heights 844 / 900

| viewport | A1 docSW<=iw | A2 scrollers | A3 q-col>=160 | A4 outside |
|---|---|---|---|---|
| 390x844 | PASS | PASS | n/a | PASS |
| 390x900 | PASS | PASS | n/a | PASS |
| 700x844 | PASS | PASS | n/a | PASS |
| 700x900 | PASS | PASS | n/a | PASS |
| 861x844 | PASS | PASS | PASS min=271.3 | PASS |
| 861x900 | PASS | PASS | PASS min=271.3 | PASS |
| 1001x844 | PASS | PASS | PASS min=264.7 | PASS |
| 1001x900 | PASS | PASS | PASS min=264.7 | PASS |
| 1024x844 | PASS | PASS | PASS min=272 | PASS |
| 1024x900 | PASS | PASS | PASS min=272 | PASS |
| 1280x844 | PASS | PASS | PASS min=352.8 | PASS |
| 1280x900 | PASS | PASS | PASS min=352.8 | PASS |
| 1440x844 | PASS | PASS | PASS min=374.2 | PASS |
| 1440x900 | PASS | PASS | PASS min=374.2 | PASS |

sheet-14 column widths (row 1), by viewport:
  390x844 -> [358, 358, 358, 358, 358]
  390x900 -> [358, 358, 358, 358, 358]
  700x844 -> [644, 644, 644, 644, 644]
  700x900 -> [644, 644, 644, 644, 644]
  861x844 -> [58.8, 75.1, 271.3, 183.6, 203.3]
  861x900 -> [58.8, 75.1, 271.3, 183.6, 203.3]
  1001x844 -> [58.8, 75.1, 264.7, 172.1, 202.3]
  1001x900 -> [58.8, 75.1, 264.7, 172.1, 202.3]
  1024x844 -> [58.8, 75.1, 272, 184.8, 203.4]
  1024x900 -> [58.8, 75.1, 272, 184.8, 203.4]
  1280x844 -> [58.8, 75.1, 352.8, 326.7, 216.2]
  1280x900 -> [58.8, 75.1, 352.8, 326.7, 216.2]
  1440x844 -> [58.8, 75.1, 374.2, 364.3, 219.6]
  1440x900 -> [58.8, 75.1, 374.2, 364.3, 219.6]

announced scroller region names:

ALL ASSERTIONS PASS (14 viewports x 4)
```

The "announced scroller region names" block is empty because no scroller overflows at
any swept width any more, so none takes `role="region"`. T5-5's truncation was measured
on the failing first run, where sheet 14 still overflowed at 1001:
`"sheet-14 :: Table: Forty questions"`.

Machine-readable copies: `review/shots/r6-sweep.txt`, `review/shots/r6-sweep.json`.
Screenshots: `review/shots/r6-1001-sheet14.png`, `review/shots/r6-1024-sheet14.png`
(read: no ribbon, no clipped text, identifiers whole).
