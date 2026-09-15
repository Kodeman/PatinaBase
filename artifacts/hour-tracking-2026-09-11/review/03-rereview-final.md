clean = true

# Round-6 discharge verification — hour-tracking deck

**Scope:** discharge verification only, not a fresh sweep. Inputs read in full:
`review/03-rereview-content-r5.md` (R5-1 … R5-18), `review/03-rereview-technical-r5.md`
(T5-1 … T5-N6), `review/02-fix-log-r5.md`. Targets opened by content, not by line
number: `deck/src/index.html` (now **1,576** lines, was 1,559), `synthesis.md`,
`architecture.md`, plus the repo files the citations point at. No browser run.

**Verdict: `clean = true`.** Every R5 and T5 finding that carried an action is
discharged. No regression found. Nothing undischarged; nothing regressed.

---

## 1 · Counts verified

| Set | With an action | Discharged | Skipped by own fix ("None" / "Accept" / not the fixer's) |
|---|---|---|---|
| R5-1 … R5-18 | 14 (R5-1 … R5-14) | **14 / 14** | 4 — R5-15 (program-level), R5-16, R5-17, R5-18 |
| T5-1 … T5-N6 | 9 (T5-1 … T5-9) + T5-N5 | **10 / 10** | 5 — T5-N1, T5-N2, T5-N3, T5-N4, T5-N6 |

**Undischarged: none. Regressed: none.**

---

## 2 · Re-derivations demanded by the brief

### R5-1 / T5-3 — migration ranges, re-derived from scratch

`architecture.md` dependency table (`:838-846`) and **every** wave block bullet were read
independently and agree with each other:

| Wave | Table | Wave-block bullets | Deck sheet 10 |
|---|---|---|---|
| W0 | `head+1 … +3` | `:59, :65` (+1), `:70` (+2), `:76` (+3) | `head+1…+3` ✓ |
| W1 | `head+4 … +9` | `:152, :158, :167, :170, :184, :187` | `head+4…+9` ✓ |
| W2 | `head+10 … +13` | `:291, :296, :304, :308` | `head+10…+13` ✓ |
| W3 | `head+14 … +15` | `:415, :420` (both +14), `:425` (+15) | `head+14…+15` ✓ |
| W4 | `head+16 … +20` | `:508, :512, :515, :530, :532` (+19 ×2), `:535` | `head+16…+20` ✓ |
| W5 | `(none; head+21 reserved)` | §6 "**DB** none." — no bullet, `head+21` reserved in the table only | `none · head+21 reserved` ✓ |
| W6 | `head+22 … +23` | `:678, :680` | `head+22…+23` ✓ |
| W7 | `head+24 … +26` | `:780, :785, :788` | `head+24…+26` ✓ |

Deck `tfoot` total (`:1172`) = **`head+1…+26`** — matches the derived span exactly.
The seven stale cells named by R5-1 and the eighth named by T5-3 are all corrected.

### R5-2 — HT-37

Deck `:1375` now reads "the INVOKER replacement lands in head+13", matching
`architecture.md:308-310` (the separate reserved slot) and `:327`, `:966`. The two cells
the report ordered left alone are intact: `:1314` (risk 8, `head+12`) and `:1409`
(HT-10 gates W2's `head+12`). `head+12` is no longer double-booked.

### R5-3 — the four Team policies, opened in the SQL

`supabase/migrations/00484_public_rpc_authorization_contract.sql` verified by grep, exact:

```
783 DROP  / 785 CREATE POLICY "Team can delete their own time entries"  (FOR DELETE)
792 DROP  / 794 CREATE POLICY "Team can log their own time entries"     (FOR INSERT)
801 DROP  / 803 CREATE POLICY "Team can update their own time entries"  (FOR UPDATE)
810 DROP  / 812 CREATE POLICY "Team can view their project time entries"(FOR SELECT)
```

Deck `:1308` cites `00177:140,144,148,152, re-created at head by 00484:785,794,803,812` ✓.
Deck `:533` cites `head: 00484:803,785 · 00316:248,257` and adds the `00177:136` exception ✓.
Sheet 06's gate cell was correctly left untouched (R5-18).

### R5-7 — nine / five / four, and W4's re-derived count

Independent grep of `CREATE POLICY … ON public.project_time_entries` across all migrations
returns exactly nine live policies: `00177:136,140,144,148,152` + `00316:237,242,248,257`
(none dropped later; `00484:785-812` re-creates four of the `00177` set). Split confirmed:
**five** via `projects p` (`00177:136`; `00316:237,242,248,257`), **four** via
`is_project_team_member` (`00177:140,144,148,152`).

Present and consistent at all five sites: `architecture.md:516`, `:907`;
`synthesis.md:186`, `:270`; deck `:1308`. The W4 derivation is stated in the plan at
`architecture.md:525-529` ("the ninth is `00177:136`'s FOR ALL for the project's own
`designer_id`; an internal row has no project … **four new own-row policies stands** — the
ninth adds none"), and "four new RLS policies" therefore correctly stands unchanged at
`architecture.md:515`, deck `:1134` and deck `:1308`.

### Supporting re-checks

- `00578_design_build_kind.sql` (9,477 lines): `:2599` `CREATE OR REPLACE FUNCTION
  public.classify_project_time_entry_authority()`, `:2604` `AS $$`, `:2619` `BEGIN`,
  `:2819` `END;`, `:2820` `$$;` → 2820−2599+1 = **222**, 2819−2619+1 = **201**. R5-5
  landed at all five sites (`synthesis.md:29, :144`; `architecture.md:20, :171, :906`);
  R5-6 at all three (`synthesis.md:141`; `architecture.md:241, :906`).
- R5-4 — deck `:884` ends "…a pre-flight count of rows whose rate would change." No parenthetical.
- R5-8 — all three restated (`synthesis.md:49, :193`; `architecture.md:280-282`), each naming
  `00177:136`'s FOR ALL as the standing exception.
- R5-9 — zero occurrences of "Invariant V" in deck, synthesis or architecture; the three
  sites cite `FieldCompanionPresentation.swift:51-64`. `panel/memo-ux-mobile.md` correctly untouched.
- R5-10 — "6 seats + the draft" at `synthesis.md:156`, `architecture.md:928`, deck `:915`.
- R5-11 — "Breaches R69's principle … spine timer + mobile bar only (`DECISIONS.md:2561`)"
  at `architecture.md:926`, `synthesis.md:240`, deck `:1076`, `:1369`.
- R5-12 — deck `:1020` now `VisitReview.swift:52-83`, matching `:488`.
- T5-1 — all five sheet-14 Panel cells carry `class="num wrap"`: `:1348` (CR narrow; FS flags
  the cost), `:1355` (CR extend · MOB gate · VET instrument), `:1370` (CR amend; FS carve-out),
  `:1376` (FS decisive; draft says DEFINER), `:1377` (FS, CR, LEAH, REP split).
- T5-2 — `:1356` wraps `<code>FieldCompanionPresentation.swift:56-64</code>`.
- T5-5 — `:1548-1560` prefers `data-table-name`, else truncates at `/[.:;—]/`.
- T5-7 — `:193` `table.sheet td.mark:has(.mq) { text-align: left; }`.
- T5-8 — `:160` `.verdicts > li { max-width: calc(116px + 24px + 58ch); }`.
- T5-9 — `:209` ≤860 block now `.scroller { overflow-x: auto; overflow-y: hidden; }`;
  `body { overflow-x: hidden }` kept. Zero `overflow-x: visible` in the file.

---

## 3 · Regression check (deck only)

1. **`head+` sweep.** Nine occurrences. Eight are the sheet-10 column + total, all matching
   the derived table. The four prose sites: `:1310` (generic `head+n`, no literal),
   `:1314` `head+12` (risk 8 — HT-10's slot, inside W2's `head+10…+13`), `:1375` `head+13`
   (HT-37), `:1409` `head+12` (HT-10). **All agree with the table.** No stray literal.
2. **Forbidden strings.** `00578:2599-2805` → 0 · `207 lines` / `207-line` → 0 ·
   `Invariant V` → 0 · `Seven seats` / `7 seats` → 0 · `all eight` → 0 ·
   `reverses/Reverses R69` → 0 · `four concurrent` → 0 · `17–25` → 0 ·
   `head+1…+25` → 0 · `head+20 reserved` → 0 · `head+12` outside HT-10 contexts → **0**
   (both hits are HT-10's own slot). **No regression.**
3. **Colophon deviation entry** (`:1436`): "…this entry and 'Findings count' exceed one line,
   and **sheet 05's hole cells**, sheet 06's open question and **the verdict bodies on the
   cover and sheet 15** are reference sentences rather than short clauses". Covers R5-13
   (sheet 05 hole cells, including hole 4) and R5-14 (sheet 15 verdict bodies). Hole 4's cell
   at `:705` is additionally joined into one sentence with an em-dash — both branches taken.
4. **Artifact contract — PASS.**
   - `<!doctype>` / `<html>` / `<head>` / `<body>` / `<meta>`: **0 hits**.
   - `:1` `<title>The Studio's Own Clock</title>`; `:2-4` font links; `:5` `<style>` — title
     and style at top (the three `<link>`s between them are T5-N2, accepted for the record).
   - External URLs, complete set: `fonts.googleapis.com` (preconnect + `css2` stylesheet) and
     `fonts.gstatic.com` (preconnect). **No other external host, no external script/image/fetch.**
   - `<a>` elements: **1** (the skip link). `download` attribute: **0**.
5. **Structure.** 16 `<section class="slide">`; "Sheet 01 / 16" … "Sheet 16 / 16" complete,
   in order, none duplicated.

---

## 4 · Render evidence (not re-run; fix-log sweep re-validated as current)

The round-6 sweep (`review/shots/r6-sweep.cjs`, output `r6-sweep.txt` / `.json`) is the render
evidence. It was checked for staleness rather than taken on trust:

- `review/shots/_r6wrapped.html` (136,816 B) **contains the current `deck/src/index.html`
  (136,660 B) byte-for-byte** — verified by substring comparison.
- Deck last modified 11:45:37; wrapper 11:45; sweep JSON 11:46. The measurement postdates
  the last deck edit.
- `r6-sweep.txt` final line, verbatim:

  ```
  ALL ASSERTIONS PASS (14 viewports x 4)
  ```

  14 viewports (390 / 700 / 861 / 1001 / 1024 / 1280 / 1440 × 844 / 900) × 4 assertions
  (A1 docSW ≤ iw · A2 no overflowing `.scroller` · A3 sheet-14 question column ≥ 160px at
  ≥861 · A4 nothing outside a scroller past the viewport). Sheet-14 question-column minimum
  264.7px at the previously-failing 1001 band. `regionNames` empty — no scroller overflows
  anywhere, so none is announced.

---

## 5 · Everything else noticed (no action required, none blocking)

- **R5-15 (note, program-level) — still unsupplied.** No DECK CONTRACT file exists anywhere
  in `artifacts/`, `briefing/` or `docs/`. The fixer correctly declined; this is Kody's ruling
  on the 1 + 14 + 1 shape. Does not block `clean` (note severity, no fixer-authorable file).
- **T5-4 discharged by variant, not by the report's literal wording.** The fixer rejected
  `code { overflow-wrap: break-word }` with a measured reason (`break-word` does not
  contribute to min-content sizing, so it would have removed the escape without adding a
  floor, and re-failed 1001 at 779 vs 773) and instead set an explicit floor at
  `deck/src/index.html:200-205` — `@media (min-width: 861px) { #sheet-14 table.sheet
  th/td:nth-child(3) { min-width: 260px } }`. Verified present; `code` keeps
  `overflow-wrap: anywhere` (`:108`). The report's *intent* (the question column holds a
  floor, no ribbon) is met and measured. Counted as discharged; flagged here because the
  mechanism differs from the one the reviewer named.
- **T5-N5 residue, documented and accepted.** HT-18's now-`<code>`-wrapped
  `FieldCompanionPresentation.swift:56-64` can still break mid-token, the stated price of
  keeping `anywhere` on `code`. The four identifiers the note cared about
  (`profiles.default_hourly_rate_cents`, `change_order_terms`, `claim_time_entries`,
  `project_unbilled_time`) now hold one line at every swept width ≥861.
- **One un-flagged deck change beyond the reports:** `:1146` (sheet 10, W5 Migrations cell,
  "none · head+21 reserved") carries `class="num wrap"`. Benign prose-wrap hint on a
  non-tally cell, consistent with T5-1's own remedy; the sweep passes at every width.
- **`VisitReview.swift:52-58` still appears twice source-side** — `synthesis.md:272` and
  `architecture.md:695`. **Not a residue of R5-12**: both cite the span for the *already-sorted
  Specimen timestamps* (the `rows.sorted` at `:58`), and `architecture.md:696` explicitly adds
  "(`VisitReviewComposer.summarize` at `:52-83` is where wall clock is computed today)".
  R5-12's ask was scoped to the deck's active-duration claim, which is now `:52-83` at both
  `:488` and `:1020`. Correct as written; recorded so round 7 need not re-find it.
- **Fix-log line numbers drifted in two rows and were located by content instead:** R5-3's
  second site is deck `:533` (log and report both approximate), R5-5's `synthesis.md:143` is
  now `:144`, `architecture.md:896` is now `:906`. All content confirmed present.
