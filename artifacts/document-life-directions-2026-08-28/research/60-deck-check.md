# 60 — Deck check: fact-check, visual QA, and build verification

Program: The Life Review. Checker pass against `source/direction-{a,b,c}.md` (v3, final —
precedence winner over `source/critique.md`'s v2-re-read numbers), `source/shared-planks.md`,
`source/amendment-elevation.md`, `research/12-measurements.md/.json`, `research/31-findings.md/.json`,
`research/13-priors.md`, `research/01-shot-ledger.md`, and `mock/deck-parts/DECK.md`.

Edited: `05-planks.html`, `11-compare.html`, `12-recommendation.html`, `13-questions.html`.
Not edited (source already matched v3): `01,02,03,04,06,07,08,09,10,14`.

---

## 1. Known stale spots — fixed

| Spot | Was | Now | Source of truth |
|---|---|---|---|
| `11-compare.html:41` (Chrome row, B cell) | rail quoted `#ECE7DF` "one step under every movement stock" | rail `#E8E3DB` | `direction-b.md` v3: rail moved `#ECE7DF`→`#E8E3DB`, reads 1.098–1.106:1 vs six sheets, 1.225:1 vs plain sheet, lowest ink clay-ink 4.697 |
| `11-compare.html` "still disagree" list (D41/D42/D44) | listed as open disagreements with v2 figures | restated "resolved in v3" with v3 figures, D-ids kept | `direction-a.md`/`direction-b.md`/`direction-c.md` v3 dispositions |
| `11-compare.html` `dk-kv` commentary (Contrast & separation, Canon fit, Cost & reversibility cells) | referenced B's rail going backwards, A's `--bg-surface` unscoped, C's twins unpaid | updated to name the v3 fixes (D41/D42/D44) while keeping the v2 scorecard numbers unchanged (scores themselves are the critic's, not restated) | same |
| `05-planks.html` SP-06 | title "Hover above clay at 6%", promised "at or above 1.10:1" | retitled "Hover is the next stock the lane already declares"; rule-based description with old-hex range 1.008–1.125:1, new floor 1.097, promise ≥1.09, the 4.137/4.363 ink-floor conflict | `shared-planks.md` SP-06, v3 rewrite |
| `05-planks.html` SP-03 | no dark-twin content | added the dark-twin table (`--rule-hair-dark` 1.442/1.447/1.419, `--rule-mid-dark` 11.153/12.722/14.745, `--rule-strong-dark` 1.720/1.750/1.735, light-twin column 1.207/13.871/1.416) | `shared-planks.md` SP-03 dark-twin table |
| `12-recommendation.html` (visible-move paragraph, two `dk-plate`s, sequence `dl`, refusals list) | D41/D42 cited as unpriced open conditions | restated as resolved-in-v3 (dark twins priced inside C's 4–5 days; B's rail fixed) **without changing the recommendation** (planks → A → C's chrome; B's band+stamps grafted; B's tints/thumbnails wait) | `direction-b.md`/`direction-c.md`/`shared-planks.md` v3 |
| `13-questions.html` Q01 | D44 (`--bg-surface` unscoped/unpriced) cited as still open | restated: now scoped as `--doc-surface`, 83/51 count priced as the alternative | `direction-a.md` v3 Cost, Refuses |
| `13-questions.html` Q02 | D42 and D19 cited as blocking conditions to close | restated: D42 priced (twins declared, spent inside 4–5 days); D19 priced at 1 day, non-optional | `direction-c.md` v3 Cost |
| `13-questions.html` Q05 | D41 (rail regressed under 1.081) cited as live problem | restated: rail fixed to 1.098–1.106:1, above today's 1.081:1, at the cost of 3 of 4 inks off the rail | `direction-b.md` v3 |
| `13-questions.html` Q11 | framed around one fixed hex (`#F3ECE2`) failing a 1.10:1 promise (D43 as unresolved) | reframed around the v3 rule (each lane takes its own next stock), promise ≥1.09, floor 1.097 (C's second sheet), D43 marked resolved-in-v3, kept as "accept this floor" question | `shared-planks.md` SP-06 v3 |

---

## 2. Fact-check table (exhaustive: parts 03, 04, 05, 06, 07, 08, 09, 11, 13)

Verdict key: **match** = verbatim/consistent with source · **fixed** = mismatch found and corrected
in this pass · **removed** = unsourced, deleted rather than invented a source.

### 03-today.html (evidence numbers)

| Claim | Source | Verdict |
|---|---|---|
| ground/paper/card 1.025 · 1.069 · 1.042 | `12-measurements.md` §1 | match |
| spine wash 1.080 vs paper, 1.053 vs ground | `12-measurements.md` §2 | match |
| margin rail 1.000:1 (composites to ground) | `12-measurements.md` §2 | match |
| pearl border-sides desk 16 / doc 38 / library 25 / people 78 | `12-measurements.md` §3 table | match |
| 8–12px share: desk 47.7% / doc 76.4% / library 68.5% / people 52.4% | `12-measurements.md` §4 table | match |
| largest Playfair: desk 30.6px vs library 45px | `12-measurements.md` §5 | match |
| three muted-ink tokens all `#65594E` | `12-measurements.md` §6 | match |
| hover 1.042 over ground, 1.044 over card | `31-findings.json` F17 measurement | match |
| StatusChip unreachable — 0 `plan_sheets`, 0 `proposal_items.product_id` | `12-measurements.md` §8 | match |
| box-shadow 0 (devtools excluded) | `12-measurements.md` §9 | match |
| 437 CSS px / 47px overflow at 390 | `31-findings.json` F24 | match |

### 04-found.html (25 findings)

| Claim | Source | Verdict |
|---|---|---|
| 25 findings: 4 blocker / 11 high / 9 medium / 1 low | `31-findings.json` (`count`, severity tally) | match |
| theme tally: type 7, tone 5, state 4, chrome 4, color 2, material 2, rule 1 | `31-findings.json` theme tally | match |
| every per-card severity chip (F01 s0…F24 s2, etc.) | `31-findings.json` per-id `severity` | match, all 12 shown cards checked individually |
| F01 hover/decision-due ≈1.0005:1 | `31-findings.json` F01 measurement | match |
| F02 pigment pairs as close as 1.024:1 | `31-findings.json` F02 measurement | match |
| F03 "one component, 14 call-site files" | `31-findings.json` F03 measurement | match |
| F04 ~17px empty-state heading vs 12.5px FF&E name | `31-findings.json` F04 measurement | match |
| F09 band 1.056:1 | `31-findings.json` F09 measurement | match |
| F06 drawer 1.069:1 | `31-findings.json` F06 measurement | match |
| F07 margin rail 1.000:1 | `31-findings.json` F07 measurement | match |
| F08 spine 1.080:1 | `31-findings.json` F08 measurement | match |
| F10 "both declare 10px mono uppercase" | `31-findings.json` F10 measurement | match |
| F12 75.2% ≤10px | `31-findings.json` F12 measurement | match |
| F24 437/47px | `31-findings.json` F24 measurement | match |

### 05-planks.html (SP-01…SP-09)

| Claim | Source | Verdict |
|---|---|---|
| SP-01: 649/1,029 (63%) mono ≤10px, 296 at 9px; 1,749 literals / 252 files | `shared-planks.md` SP-01 | match |
| SP-02: `#4E4339` / `#5A4E43` / `#65594E` | `shared-planks.md` SP-02 | match |
| SP-03: `--rule-hair` / `--rule-mid` / `--rule-double`, 502 literals | `shared-planks.md` SP-03 | match |
| SP-03 dark twins: 1.442/1.447/1.419, 11.153/12.722/14.745, 1.720/1.750/1.735, light twins 1.207/13.871/1.416 | `shared-planks.md` SP-03 dark-twin table | **fixed** (table was absent; added verbatim) |
| SP-04: stamp base pigment as low as 2.01:1 | `shared-planks.md` SP-04 | match |
| SP-05: 16–18% fill, `KIT.md:266` departure | `shared-planks.md` SP-05 | match |
| SP-06: rule (not one hex); old hex 1.008–1.125:1; promise ≥1.09; floor 1.097; 4.137/4.363 ink-floor break | `shared-planks.md` SP-06 v3 | **fixed** (was "Hover above clay at 6%" / "at or above 1.10:1", the pre-v3 text) |
| SP-07: drawer `bg-[var(--bg-surface)]`, 1.069:1 | `shared-planks.md` SP-07 | match |
| SP-08: margin `.98`/`.55` tiers, spine 1.053/1.081 | `shared-planks.md` SP-08 | match |
| SP-09: `--background` ≈`#F5F1E6` | `shared-planks.md` SP-09 | match |

### 06-direction-a.html

| Claim | Source | Verdict |
|---|---|---|
| desk ground `#E0D6C4`, 1.381 from 1.025 | `direction-a.md` Token deltas | match |
| spine/margin `#EFE7DA`, 1.177 (spine from 1.081 vs paper, margin from 1.000) | `direction-a.md` | match |
| four inks `#6F5429 #8E4A38 #6C5A1B #55604E` → 4.90/4.58/4.68/4.60 on desk stock; shipped 4.166/3.916/3.949/3.913 | `direction-a.md` Token deltas + ink table | match |
| red-letter `#F1E1D9`, 1.220 from 1.056, ink 5.18 | `direction-a.md` | match |
| `--border-default` `#D8CDBA` 1.508 / `#C9BCA4` 1.301; `#D8CDBA` on desk 1.092 vs pearl's 1.209 | `direction-a.md` | match |
| `--bg-surface` → `--doc-surface`, 83 usages / 51 files unscoped | `direction-a.md` v3 (D44 resolved) | match |
| hover 1.177 / 1.177 / 1.173 (paper/rail/desk) | `direction-a.md` SP-06 restated for A | match |
| `CR(#FCFAF6,#EDE5D8)=1.199` vs 1.3225 needed | `direction-a.md` | match |
| Cost: 1,749/252, 502/172, A 2–3d, SP-01 4–6d, SP-03 2–3d | `direction-a.md` Cost | match |
| contrast: 20 pairs, zero failures, lowest 4.577; 108 `bg-white` in `components/document` | `direction-a.md` Canon check / Cost | match |

### 07-direction-b.html

| Claim | Source | Verdict |
|---|---|---|
| six stocks vs ground: 1.088/1.081/1.081/1.087/1.084/1.081; vs sheet 1.116/1.108/1.109/1.114/1.111/1.108 | `direction-b.md` Token deltas | match |
| rail `#E8E3DB`, 1.098–1.106 vs six sheets, 1.225 vs plain sheet | `direction-b.md` v3 (D41 resolved) | match |
| damaged fill `#F4E6E0` 16%, 1.168, ink 4.63 (was 4.51 at 18%) | `direction-b.md` | match |
| band `#2C2926`, 12.485 on Project stock (12.43–12.52 range), 13.87 on untinted sheet | `direction-b.md` v3 (D49 resolved) | match |
| tabs: 4.98–6.97 white-ink range | `direction-b.md` tab table | match |
| golden-hour 4.452 / terracotta 4.414 / sage 4.411 fail on new rail; clay-ink 4.697 holds | `direction-b.md` v3 | match |
| 108 pairs / zero failures / lowest 4.626 (sage-ink on damaged fill, terracotta-ink 4.629) | `direction-b.md` v3 (D40 resolved) | match |
| luminance caps: rail 0.7858, sage-ink needs 0.7886 | `direction-b.md` v3 | match |
| Cost: B 4–6 days, open Strata `product_id` count | `direction-b.md` Cost | match |

### 08-direction-c.html

| Claim | Source | Verdict |
|---|---|---|
| desk `#37322D`, 12.16 from 1.025; spine/margin `#2C2926`, 13.87 | `direction-c.md` Token deltas | match |
| drawer well `#201D1B`, 1.322 (desk) / 16.08 (sheet) | `direction-c.md` | match |
| second sheet `#F5EFE5`, 1.097 | `direction-c.md` | match |
| primary/muted/clay/sage/terracotta on dark: 11.15/12.72/14.75, 5.70/6.50/7.53, 5.44/6.21/7.19, 5.91/6.74/7.81, 5.57/6.36/7.37 | `direction-c.md` dark register table | match |
| dark twins: hairline 1.442/1.447/1.419, mid 11.153/12.722/14.745 (twins 13.871 on sheet), strong 1.720/1.750/1.735 (twins 1.416) | `direction-c.md` v3 (D42 resolved) | match |
| state fill `#473C37`, 1.356 vs rails; register ink 9.381 on it | `direction-c.md` v3 | match |
| hover 1.097 (sheet) / 1.141 (desk→rails) / 1.159 (rails→well) | `direction-c.md` v3 (D43 resolved for C) | match |
| cap 0.1738 / floor 0.2768 | `direction-c.md` v3 (D24/D47 resolved) | match |
| 78 pearl border-sides / 20 white cards on `/people`; well 16.077:1 (D46) | `direction-c.md` Cost | match |
| Cost: C 4–5d + 1d parser, exemption list 5→11 | `direction-c.md` Cost | match |

### 09-strip.html

| Claim | Source | Verdict |
|---|---|---|
| A: job name 16→18px, `--rule-hair` separators | `direction-a.md` Recipes | match |
| A: FF&E name/price 13.5/13→15px | `direction-a.md` Recipes | match |
| A: chip 10→11px `--text-faint`; section head 40/28/16px×2px, 11px label, 24px name | `direction-a.md` Recipes | match |
| A: margin chip 8→11px, line to 14px | `direction-a.md` Recipes | match |
| A: drawer `#FCFAF6` + `--rule-mid` full width | `direction-a.md` Recipes | match |
| B: 40px roster chip dropped (D12 resolved) | `direction-b.md` Recipes/Cost | match |
| B: 48px thumbnail only on catalog link | `direction-b.md` Recipes | match |
| B: fill lands on `Stamp` not `StatusChip` | `direction-b.md` SP-05 note | match |
| B: region rule takes movement pigment | `direction-b.md` Recipes | match |
| B: drawer `#FCFAF6` + 16%-charcoal edge | `direction-b.md` Recipes | match |
| C: inset sheet, nothing on sheet changes | `direction-c.md` Recipes | match |
| C: rails redraw in clay/sage instead of pearl | `direction-c.md` Recipes | match |
| C: chips outlined 12%-off-white, money chip clay edge | `direction-c.md` Recipes | match |
| C: drawer `#201D1B`, 12%-off-white top edge | `direction-c.md` Recipes | match |

### 11-compare.html

| Claim | Source | Verdict |
|---|---|---|
| A ground `#E0D6C4` scoped `/desk`; B ground unchanged `#FAF7F2`; C ground `#37322D` scoped `/desk`, second sheet `#F5EFE5` 1.097 | direction docs | match |
| A drawer/rail `#EFE7DA`; B rail `#ECE7DF`→`#E8E3DB` | direction docs | **fixed** (stale `#ECE7DF` in table cell) |
| C drawer `#201D1B`; rails `#2C2926`, 13.87:1 | `direction-c.md` | match |
| costs: A 2–3d, B 4–6d, C 4–5d+1d | direction docs Cost sections | match |
| scorecard numbers (v2 re-read, unchanged): A 9/9/9/8/6/8, B 6/6/5/7/5/5, C 9/6/7/6/5/4 | `critique.md` "Scorecard, revised" | match (scores are the critic's — not re-scored here, only commentary corrected) |
| "still disagree" D41/D42/D44 | `direction-a/b/c.md` v3 dispositions | **fixed** → restated resolved-in-v3 with figures |

### 12-recommendation.html

| Claim | Source | Verdict |
|---|---|---|
| SP-01 alone 1,749/252, Size L, 4–6d | `shared-planks.md` | match |
| A 2–3 days on top of planks | `direction-a.md` Cost | match |
| C's chrome recommended; conditions (D42, D19) | `direction-c.md` v3 Cost | **fixed**: was framed as still-unpriced conditions; restated as priced-inside-days (D42) / priced-at-1-day-non-optional (D19) |
| B grafts: band 12.485:1, fills 4.63:1 not 4.51:1 | `direction-b.md` v3 | match |
| B tints/thumbnails wait; rail figure cited (D41) | `direction-b.md` v3 | **fixed**: rail-regression justification removed (rail is now fixed), pairwise-hue-only reasoning kept (still true) |
| refusal bullets (B's rails, C's register) | direction docs v3 | **fixed**: both bullets rewritten to state the v3 fix while keeping the residual, real weakness (B pairwise 1.000–1.007:1; C's twins need to actually ship) |

### 13-questions.html

| Claim | Source | Verdict |
|---|---|---|
| Q01 A stock separations 1.177/1.173/1.381; D44 status | `direction-a.md` v3 | **fixed**: D44 restated resolved |
| Q02 scorecard axis counts; D42/D19 status | `critique.md` "Scorecard, revised" + `direction-c.md` v3 | **fixed**: D42/D19 restated as priced |
| Q03 tan ground scoping, +2–3 days / three rooms | `direction-a.md` | match |
| Q04 amendment: eslint scope, R72 dead exception, D38 | `amendment-elevation.md` v2 | match |
| Q05 B stocks 1.081–1.088 vs v1's 1.001–1.020; pairwise 1.000–1.007; D41 status | `direction-b.md` v3 | **fixed**: D41 restated resolved with new rail figures |
| Q06 FF&E local data 6/0, 21/17 | `direction-b.md` | match |
| Q07 C scope, 78/20 on `/people`, +3–4 days | `direction-c.md` | match |
| Q08 SP-01 1,749/252, 4–6 days | `shared-planks.md` | match |
| Q09 parser split, exemption 5→11, 1 day (D19/D20) | `direction-c.md` | match |
| Q10 437/47px overflow (F24) | `31-findings.json` | match |
| Q11 SP-06's floor and promise; D43 status | `shared-planks.md` v3 | **fixed**: fully reframed around the v3 rule (was framed around a single failing hex) |

### Cross-cutting checks

| Check | Result |
|---|---|
| Brand-voice word sweep (`elevated, curated, luxury, bespoke, seamless, delightful, magical, unlock(s/ed/ing), effortless`) across parts 01–14 | **0 hits** |
| `!` outside HTML comments, parts 01–14 | **0 hits** (only `!important` in 00-head.html's CSS, out of scope and not prose) |
| `<figure>` illustrating the elevation amendment | **0** — `13-questions.html` (question 04) has no `<figure>`; the only literal figures in source are `03-today.html`'s 8 `ev-fig` evidence shots, unrelated |
| Every `F##` resolves in `31-findings.json` | **25/25** (F01–F25, all referenced, no invalid ids — one false-positive hit on a hex code `6F5429` ruled out by word-boundary check) |
| Every `SP-##` resolves in `shared-planks.md` | **9/9** (SP-01–SP-09) |
| Every `D##` resolves in `critique.md`/`amendment-elevation.md`/direction docs | **11/11** (D01, D19, D20, D38, D39, D40, D41, D42, D43, D44, D49) |
| Stale figures (`1,745`, `1,038`, stray current-tense `#ECE7DF`/`1.152`/`5.52`) | **0** remaining as *current* claims — all surviving mentions of the old numbers are explicit historical callouts ("at the earlier `#ECE7DF`...", "an earlier draft printed... 5.52") |

---

## 3. Build

```
node mock/deck-parts/build.mjs
PARTS       16 concatenated
FRAGMENTS   14 inlined (dk-mock)
CROPS       5 inlined (118 KB)
SHOTS       8 embedded at 804px / q78  (1.24 MB raw JPEG)
MARKUP      section 42/42  figure 22/22  doc tags none
CSS         667 braces open / 667 close
ASCII       0 non-ascii bytes left (2 style/script blocks folded)
SIZE        2.31 MB  within budget
WROTE       .../presentation.html
PARTS 16, FRAGMENTS 14, SHOTS 8, box-shadow 0, markers 0, non-ascii 0, SIZE 2.31 MB
```

Exit code 0. Rebuilt after every content fix; the size line held at 2.31 MB throughout (well under
the 15.5 MB gate).

---

## 4. Visual QA (from `mock/deck-qa/*.png`, both widths, both themes, plus `qa-results.json`)

### Verdicts

| Item | Verdict | Evidence |
|---|---|---|
| SP-03 dark-twin table renders cleanly at 1440 | **Pass** | crop of `planks-1440-light.png` — four-column table, no truncation, hairline rules intact |
| Same table restacks to definition-rows at 390 | **Pass** | crop of `planks-390-light.png` — TWIN/VALUE/DESK·RAILS·WELL/light-twin blocks stack cleanly, fully readable, no sideways scroll needed to read it |
| `11-compare.html`'s "still disagree → resolved in v3" list renders in both themes | **Pass** | crops of `compare-1440-light.png` and `compare-1440-dark.png` — identical structure, dark theme correctly repaints paper register to dark palette with contrast intact |
| Q11 rewrite renders correctly (promise ≥1.09, floor 1.097) | **Pass** | crop of `questions-1440-light.png` |
| Direction A mock (M1/M2) is pixel-identical between the page's light and dark theme | **Pass** | crops of `direction-a-1440-light.png` / `-dark.png` — mock content identical, only the outer page chrome (background) differs, as required by `.dk-mock-scale` pinning |
| Direction C mock (charcoal desk + inset sheet) is pixel-identical between page light/dark | **Pass** | crops of `direction-c-1440-light.png` / `-dark.png` |
| `.reg-dark` sections (`03-today`, `04-found`) stay dark regardless of page theme toggle | **Pass** | crops of `found-1440-light.png` / `-dark.png` — identical |
| Sticky index bar / theme toggle / scroll progress | **Pass** | `qa-results.json`: `idx rows 14/14 pos sticky`, `sticky@4000: top 0 visible true current "Today" progress 100%`, toggle cycles `null→light→dark→null` correctly across all 4 passes |
| Contrast samples | **Pass** | 56/56 sampled pairs ≥4.5:1, 0 failures |
| Shadow sweep (computed `box-shadow`) | **Pass** | `shadowed: []` on all 4 passes |
| Fonts loaded | **Pass** | 11 distinct family/weight/style combinations resolved on every pass (Playfair Display, Inter, DM Mono weights) |
| Console/page/failed-request errors | **Pass** | `consoleErrors 0 | pageErrors 0 | failedRequests 0 | externalRequests 0` on all passes |
| External hosts | **Pass** | `allRequestHosts: ["file:///User", "https://font..."]` — only the local file and Google Fonts host actually requested |
| **Horizontal overflow at 1440/1200/820/390** | **Blocking — needs owner** | see below |

### Blocking — needs owner: horizontal page overflow at several viewport widths

`qa-results.json`'s `shellParity` sweep (1680/1440/1200/1024/820/600/390px, using the actual
artifact-skeleton wrapper) shows `document.documentElement.scrollWidth > clientWidth` at four of
seven widths:

```
1680:ok   1440:1572>1440   1200:1562>1200   1024:ok   820:839>820   600:ok   390:412>390
```

The two main passes confirm the same numbers directly on `presentation.html`: `1440-light` and
`1440-dark` both report `scrollWidthDoc 1572` against `clientWidth 1440` (132px over);
`390-light`/`390-dark` report `412` against `390` (22px over). `overflowers` (the per-element
scan that walks up the DOM excluding anything inside an `overflow-x:auto/scroll/hidden`
ancestor) is **empty on every pass**, and the largest single `.dk-mock` vs its own parent
mismatch measured is ~2px (a `box-sizing:content-box` + 1px-border rounding artifact present
even at the *passing* widths, e.g. `1680:ok mo7`) — nowhere near 132px. That rules out any single
flagged element as the direct cause; the overflow is a document-wide effect, not a runaway child.

**Verified not caused by this pass's content edits.** I reverted `05-planks.html` to its
pre-edit state (no SP-03 dark-twin table, no SP-06 rewrite) and reran the identical
`build.mjs` → `qa-run.cjs` sequence: `scrollWidthDoc` was **still exactly 1572 at 1440 and 412
at 390**, and the `shellParity` line was byte-identical
(`1680:ok mo7 1440:1572>1440 mo8 1200:1562>1200 mo9 1024:ok mo7 820:839>820 mo8 600:ok mo7
390:412>390 mo14`). This conclusively shows the overflow is not introduced by any content in
`05-planks.html`, and by extension is very unlikely to be introduced by the (much smaller,
purely textual) edits made to `11-compare.html`, `12-recommendation.html` and
`13-questions.html` — none of which added a fragment, mock, or new structural element, only
prose and one already-established `dk-tablewrap`/`dk-table` pattern used successfully elsewhere
in the same deck (see `03-today.html`, `06/07/08-direction-*.html`, `09-strip.html`,
`14-colophon.html`, all of which use the identical wrapping pattern without incident).

**Where the fault most likely lives, for whoever owns `00-head.html`/`build.mjs`/`99-script.html`:**
- `build.mjs:69` fixes the mock scale target at a constant `COLUMN = 1080`, computed once at
  build time from each fragment's native width — the comment there ("deck's own measure; JS
  re-fits on load/resize") assumes `99-script.html`'s `fitMocks()` (lines ~106–121) corrects it
  at runtime for the actual rendered column width.
- `99-script.html`'s `fitMocks()` measures `mock.clientWidth` and is invoked once synchronously,
  once on `window.load`, and once (debounced) on resize — but the pattern of failures (fails at
  1440/1200/820/390, passes at 1680/1024/600, an alternation that does not track any single CSS
  breakpoint in `00-head.html`: `.dk-grid` switches at 1100px, `.dk-tablewrap`/`.dk-table` switch
  at 700px, `.dk-two` switches at 900px) suggests either a timing race in when `fitMocks()`'s
  measurement is taken relative to font/layout settling, or a rounding interaction between
  `.dk-mock-viewport`'s inline pixel `width` (content-box, `max-width:100%`) and its ancestor
  chain (`.dk-mock` → `.dk-full`/`.dk-stage` → `.dk-grid`/`.dk-wrap`) that only manifests at
  certain absolute pixel widths.
- I cannot fix this: it requires editing `99-script.html` and/or `00-head.html` and/or
  `build.mjs`, all three off-limits to this pass. Flagging with the exact reproduction (revert
  `05-planks.html`, rebuild, rerun `qa-run.cjs`, get the identical numbers) so the owner does not
  need to re-derive that it is systemic rather than content-driven.

---

## 5. Independent checks (verbatim results)

```
$ grep -cE "box-shadow\s*:|drop-shadow\(" presentation.html
0

$ grep -oE 'https?://[^"'"'"' )]+' presentation.html | sort -u   (reduced to unique hosts)
https://fonts.googleapis.com
https://fonts.gstatic.com
```

Both gates pass exactly as required: zero shadow declarations anywhere in the built page; the
only two external hosts referenced anywhere in the source are the two allowed Google Fonts
hosts. (`qa-run.cjs`'s own `nonAllowedUrlsInSource` regex additionally flags ~20 strings that
begin with `//` — inspected individually, every one is a false-positive substring match inside
a base64-encoded JPEG data URI, none contains a real domain-like token such as `.com`/`.io`/etc.)

---

## 6. Final build line

```
PARTS 16, FRAGMENTS 14, SHOTS 8, box-shadow 0, markers 0, non-ascii 0, SIZE 2.31 MB
```
Exit code 0, unchanged across every rebuild in this pass (before and after fixes, and in the
isolation test).

---

## 7. Unresolved

1. **Blocking — needs owner.** The horizontal-overflow characteristic documented in §4 above
   (1440/1200/820/390 all show `scrollWidth > clientWidth`, by 132/362/19/22px respectively).
   Confirmed pre-existing and content-independent by isolation test; requires an edit to
   `99-script.html`'s `fitMocks()` and/or `00-head.html`'s `.dk-mock`/`.dk-full` CSS and/or
   `build.mjs`'s fixed `COLUMN` scale target — all three outside this pass's editable scope.
2. **Not a defect, noted for completeness.** `hasDoctype`/`hasHtmlTag`/`hasBodyTag` all read
   `false` in `qa-results.json` — this is correct and expected: `presentation.html` is the raw
   deck body only, meant to be wrapped by the Artifact skeleton at publish time per `DECK.md`'s
   own build contract, not a stray-tag defect.
3. **Judgment call, flagged rather than silently changed.** The critic's six-axis scorecard
   numbers in `11-compare.html`/`13-questions.html` are left exactly as `critique.md`'s "Scorecard,
   revised" (v2 re-read) prints them, even though the underlying v3 fixes (D41/D42/D44) plausibly
   would move some of those scores (e.g., B's "Contrast & separation" was held to a 1-point gain
   specifically because of the rail regression that v3 now fixes). No v3 re-score exists in any
   source document, so inventing new numbers would be exactly the "invented precision" DECK.md
   §8 forbids; the deck now states the v2 numbers plus the v3 factual corrections side by side,
   and leaves re-scoring to whoever re-runs the critique.
