# Re-review 03 — deck content and fact-check

Adversarial reviewer (c), second round. Same fresh-context reviewer as
`01c-deck-content.md`; did not write the deck or any fix. Target: the **current**
`deck/src/index.html` (1,324 lines, 18 sheets), read against `synthesis.md`,
`specimens/SPEC.md`, `briefing/*`, `panel/*`, `shots/README.md`, the plate, and
the four fix logs (`review/02-fix-log-deck.md`,
`02-fix-log-direction-{1,2,3}.md`). The deck was not edited.

**Verdict: FIX.** Two P1 (`DC-101`, `DC-102`), four P2, seven P3.

All 25 round-one findings are **CLOSED**; one (`DC-10`) is closed on the deck and
deliberately left open in `synthesis.md`, which the fixer logged. The new
failures are of a single kind: **the deck now carries the specimen fix logs'
editor measures but not their layout amendments**, so two fold notes describe a
1024 band the fixed specimens no longer render.

---

## §1 · Round-one findings, one by one

| ID | sev | Disposition | Proof read in the current file |
|---|---|---|---|
| DC-01 | P1 | **CLOSED** | Cover reads `Seven seats · 240 findings · three directions built`. `grep -c 231` over the deck source → **0**. `synthesis.md:3` now reads "Seven seats, 240 findings". Recounted independently: ED 50 · IA 42 · LH 38 · TY 35 · FS 34 · AX 29 · NO 12 = **240**, no duplicate ids. |
| DC-02 | P2 | **CLOSED** | Sheet 17 AR-f evidence now `docs/design/house-sheet/SPEC.md:158`; that line is `\| Page measure \| max-width: 1100px centred at ≥1200px; prose capped at 65ch \|`. |
| DC-03 | P2 | **CLOSED** | Sheet 13 carries a new `.pull`: "B is Kody's hypothesis: it touches no body file, so drift risk is zero (FS-20); the rail survives whole, so reorder is free; the paper stands at its own measure the moment the drawer shuts. Its costs: every edit is open, edit, close; at 390 the paper is not visible while the drawer is open, and the send act stays on the paper behind it." Sheet 14 adds the design reviewer's first-round judgment. Both the advantage and the cost are now in prose. |
| DC-04 | P2 | **CLOSED** | AR-e now reads "no recommendation — IA-32 and LH-15 ask only that the act live with the other part acts; neither proposes extending it". Re-read `memo-information.md` IA-32 ("Move it to the row menu with the other part-level acts") and `memo-leah.md` LH-15 ("One list of acts per part") — the cell is exact. |
| DC-05 | P2 | **CLOSED** | Sheet 16's D row now ends "Two named risks ride with it: scroll anchoring on unfold has no ambient guarantee (FS-19, AX-19), and the per-part export must report that a part drew nothing, or that an unwritten part has no fold (FS-5, FS-6)." Sheet 6 now reads "the specimen holds it, but the build has no ambient guarantee for it (FS-19, AX-19)". All four ids opened and verified: FS-19 (`overflow-anchor` → 0 hits, 17 imperative `scrollIntoView` calls), AX-19 (no `scroll-margin` under `.../agreement/`), FS-5 (`renderPartBody` module-private), FS-6 (an unwritten part renders nothing at all). |
| DC-06 | P2 | **CLOSED** | New **N-14** — "The aged-oak meta voice fails AA: `The client's copy · live` measures 4.48:1, the meta voice 4.20:1. Carried with the viewport meta at N-3. `globals.css:13 · agreement-composer.tsx:961-962`". Both figures traced (`current-state.md` §6 row 4 → 4.48; `synthesis.md` §1 row 7 and `memo-typography.md:369-371` → 4.20). Both citations opened: `globals.css:13` = `--color-aged-oak: #8B7355`; `:961` = `bg-white`, `:962` = `text-[var(--color-aged-oak)]`. Sheet 18 now carries all four items the plan's outline names. |
| DC-07 | P2 | **CLOSED** | N-13 evidence now `current-state.md §6 row 2` (W3R3-03). |
| DC-08 | P2 | **CLOSED** | N-12 rewritten: "M5, the empty first-open rail, is closed — confirmed dev-only, closed as W-01 in Wave 2 — and is carried only as the regression the durable fix must not reopen." Matches `PROGRAM-REPORT.md:300` and `current-state.md` §6 row 5. |
| DC-09 | P3 | **CLOSED** | AR-g now names both: "of the two the synthesis offers — show a total, or say plainly none exists yet — say plainly none exists yet". |
| DC-10 | P3 | **CLOSED on the deck · carried in `synthesis.md`** | N-7 evidence now `00575_agreement_parts.sql:2942-2946 · :3073`; `:2942-2946` is the `'scope', COALESCE((SELECT ap.payload->>'body' … part_key = 'patina.services' …))` projection and `:3073` is `CREATE OR REPLACE FUNCTION public.materialize_standard_parts`. **`synthesis.md:325` still carries `:2933-2939`** — the fixer logged this as outside its mandate; see `DC-107`. |
| DC-11 | P3 | **CLOSED** | Head now reads "the first verbatim from `synthesis.md` §5, the second from `specimens/SPEC.md`". Re-diffed both quotes: quote 1 is a substring of `synthesis.md` only; quote 2 of both. |
| DC-12 | P3 | **CLOSED** | Sheet 4 crux i column B now `(ED-43, FS-2)`. |
| DC-13 | P3 | **CLOSED** | N-12's evidence run extended with `current-state.md §6 rows 5 and 6 · shots/current/resting-1440.png` — the plate is what shows an unset rate card printing `Recorded with your agreement.` |
| DC-14 | P3 | **CLOSED** | Sheet 4 crux i column C now cites `memo-feasibility.md §2 row C`; that row reads "the editor loses ~120px of measure (524 → ~400 after head + indent)". |
| DC-15 | P3 | **CLOSED** | Sheet 4 crux iii column C now reads "the panel's reading; NO-12 reads the same separation as the cleanest of the four" — NO-12's own valence is now visible. |
| DC-16 | P3 | **CLOSED as filed · new error introduced** | Footnote split as asked. The replacement over-claims; see `DC-106`. |
| DC-17 | P3 | **CLOSED** | Plate `.src` run now ends "the mid-page app chrome and the estimate oval are full-page capture artifacts, not the room's own furniture". |
| DC-18 | P3 | **CLOSED** | Column head and all four `data-label`s now read "What it forbids here". |
| DC-19 | P3 | **CLOSED** | Id cell reads `The five words · R7 / R138`; the forbid cell ends "(R38)". |
| DC-20 | P3 | **CLOSED** | See §4 — my independent count now reproduces the fix log's eighteen per-sheet numbers **exactly**, and its total. |
| DC-21 | P3 | **CLOSED** | Dismiss cell: "Not yet — the reason IA-38, the string `synthesis.md` §5". |
| DC-22 | P3 | **CLOSED** | `PartEditorBody` — `part-editor.tsx:162`; `:162` is `function PartEditorBody({`. |
| DC-23 | P3 | **CLOSED** | `agreement-composer.tsx:114` (`refusalMessage`); `:114` is `function refusalMessage(error: unknown, fallback: string): string {`. |
| DC-24 | P3 | **CLOSED** | Both snapshot files named; figures re-verified (5 + 5 `toMatchSnapshot`, 1568 + 1543 = 3,111 lines). |
| DC-25 | P3 | **CLOSED** | Sheet 14 pull restored to "takes four of the seven first places **and is second on IA**". |
| 01c §2 #7 | vague | **CLOSED** | "kept, verbatim from `readiness.ts:490`, `:529`". `:490` = the fee-floor sentence, `:529` = "An agreement that bills hourly needs a ceiling…". Both opened. |
| 01c §2 #10 | vague | **CLOSED** | D's Touched cell now `parts-rail.tsx:142-199`. |
| 01c §2 #30, #51 | vague | **CLOSED** | Fixed as DC-23 / DC-24. |
| DT-02 (01d) | P3 | **DECLINED-ACCEPTED** | The two `preconnect` hints stay. Outside this lane; the reviewer's own recommendation was "otherwise no action". Not re-litigated. |

**25 of 25 closed. Zero regressions among them.**

---

## §2 · The four orchestrator rulings the deck had to carry

| Ruling | Where the deck now states it | Result |
|---|---|---|
| **Return act at the page foot, all three directions** | Sheet 4 crux v (A) "return at the page foot below the paper"; sheet 14 crux v (D) "return at the page foot below the paper"; sheet 15 "moves to the quietest tier at the page foot below the paper, at the paper's measure and at every width — **not the outline's foot**"; sheet 17 AM-1 "in the quietest tier at the page foot below the paper at the paper's measure" | **Correct and complete.** `grep -c "outline&rsquo;s foot"` over the deck source → **1**, and that one is sheet 15's deliberate contrast. Traced to `02-fix-log-direction-1.md` SD-21/§3.6, `-2.md` §4.3 and `-3.md` "Ruling 4" (no change needed — already at the page foot). |
| **Editor measures — D 670 / 614 / 308, A 622 / 614 / 308** | Sheet 14 crux i: "D … unfolds at the printed part's own measure — 670 / 614 / 308"; "A … takes the part's place at the same measure — 622 / 614 / 308". Sheet 6 "both setting at the printed part's own 614 measure … 390: 358, measure 308"; sheet 7 "no truncation at the 614 measure … one field to a row at 308"; sheets 9 and 10 the same. | **Correct.** `02-fix-log-direction-1.md` §2 table: 720→**670**, 664→**614**, 358→**308**, "670 = 720 − 2×24 padding − 2×1 rule". `02-fix-log-direction-2.md` §3 table: 720→**622**, 712→**614**, 358→**308**. Arithmetic re-run: A's 712 − 48 − 48 − 1 − 1 = 614 ✓; D's 664 − 24 − 24 − 1 − 1 = 614 ✓. The 1440 figures (670, 622) appear on sheet 14 only, which is where the fix log put them; sheets 6, 7, 9 and 10 are fold notes and correctly carry 1024/390 alone. |
| **B at 390 — readiness in the drawer's head, send act on the paper** | Sheet 12's fold note: "The readiness sentence moves into the drawer's head and Back to the paper to its foot; the send act stays on the paper." Sheet 13's pull repeats the send-act cost. | **Correct.** `02-fix-log-direction-3.md` SD-19 (one `role="status"`, relocated to `#drawer-status-slot` at ≤767 in clause/money), "Ruling 2 — the drawer's return act" (`← Back to the paper` moved to the drawer's **foot**), and SD-20 declined by ruling 2 with "the deck says so". It does. |
| **B argued on 13; the design reviewer's first-round judgment on 14** | Sheet 13's pull (above). Sheet 14: "On the first-round specimens the design reviewer judged that the pictures argued for B more strongly than for D. The fixed D is the one this deck shows; the frames are where you decide." | **Correct, and honestly framed.** `01b-specimens-design.md` §7: "Read as pixels rather than as memos, **the specimens make their strongest case for B** … **That does not match synthesis §6's pick of D**." The deck's rebuttal is earned: `01b` §6 lists D's two P1s (SD-02, SD-04) and `02-fix-log-direction-1.md` shows both fixed, along with the five further §5 breaches (SD-07, SD-08, SD-12, SD-13, SD-14). One omission, `DC-110`. |

---

## §3 · Citations and figures the fix touched — all re-opened

| Citation / figure | Sheet | Result |
|---|---|---|
| `docs/design/house-sheet/SPEC.md:158` | 17 | verified — the 1100px page-measure row |
| `readiness.ts:490` · `:529` | 15 | verified — fee-floor and ceiling sentences, both `add(...)` calls |
| `00575_agreement_parts.sql:2942-2946` · `:3073` | 18 | verified — the `scope` projection and `materialize_standard_parts` |
| `part-editor.tsx:162` | 16 | verified — `function PartEditorBody({` |
| `agreement-composer.tsx:114` (`refusalMessage`) | 16 | verified |
| `parts-rail.tsx:142-199` (D's Touched) | 16 | verified — the `<nav aria-label="Agreement parts">` block |
| `__snapshots__/agreement-composer-library-off.test.tsx.snap` · `…design-build-off.test.tsx.snap` | 18 | verified — both exist; 10 calls, 3,111 lines |
| `current-state.md §6 row 2` | 18 | verified — W3R3-03 |
| `globals.css:13` · `agreement-composer.tsx:961-962` | 18 | verified |
| FS-19 · AX-19 · FS-5 · FS-6 | 06, 16 | all four exist and say what the deck attributes |
| FS-20 | 13 | exists; attribution loose — see `DC-109` |
| `memo-feasibility.md §2 row C` | 04 | verified |
| **240** | 01 | recounted from `panel/*.md` — exact |
| **670 / 614 / 308** · **622 / 614 / 308** | 14, 06, 07, 09, 10 | traced to both direction fix logs; padding arithmetic re-run |
| **4.48:1** · **4.20:1** | 18 | traced |
| 216 (D's 1024 notes column) | 05 | **contradicted by the fix log — `DC-101`** |
| 168 (A's 1024 margin) | 08 | **contradicted by the fix log — `DC-102`** |

Everything the fix touched verifies except the two 1024 band figures, which the
fix logs explicitly retired and the deck kept.

---

## §4 · Prose budget, banned words, ruling sheet

**Prose.** Counted with my own script under the deck's stated rule (every `<p>`
and `<figcaption>` inside `.main`; tables, blockquotes, the register `<dl>`,
sheet 18's carried list, headings and the meta face excluded):

```
01  79   07  84   13 118
02 117   08  85   14 110
03  58   09  91   15 107
04 106   10  74   16  89
05 104   11  76   17  19
06  97   12 110   18  38
```

**Total 1,562 — budget 1,600. No sheet over 120** (highest 118, sheet 13). My
count reproduces the fix log's per-sheet table and its total **exactly, on all
eighteen sheets** — the round-one 0–5 word gaps are gone because the foot comment
now names its tokenisation. **PASS.**

**Banned words.** Case-insensitive grep over the deck's face (SVG, `<script>`,
comments, data URIs and `alt` stripped): `clause library`, `contract builder`,
`wizard`, `dashboard`, `badge`, `pill`, `chip`, `modal`, `toast`, `spinner`,
`preview panel` → **0 each**; `\bAI\b` → **0**; `!` → **0**. `facet` → 4, all
four still permitted (one `<q>` of shipped defect copy, two inside the quoted
return-act consequence, one filename in the register). `Patina` → 1, quoting the
shipped offline act. `builder` / `composer` remain deck-only, which §9 allows.
Register `<dt>`s unchanged and sentence case. **PASS.**

**Ruling ids on the deck's face:** `R4`, `R7`, `R21`, `R24`, `R27`, `R38`,
`R51`, `R138` — every one a correct citation; no `W\dR\d`. **Specimen faces:**
`grep -coE "R[0-9]+|W[0-9]R[0-9]"` → **0** on all three direction files. R38
holds. **PASS.**

**Does the ruling sheet still ask?** Yes. The lede is unchanged — "This program
asks; it does not decide." AR-e now declines to recommend rather than deciding,
which strengthens it. Sheet 14 still declares only the panel's pick, which AR-a
puts back to Kody, and sheet 14's new paragraph explicitly hands the choice over
("the frames are where you decide"). One wording slip, `DC-108`; and one ask the
sheet is now missing, `DC-103`.

---

## §5 · New findings

| ID | sev | conf | sheet | claim | evidence | proposed fix |
|---|---|---|---|---|---|---|
| **DC-101** | **P1** | high | 05 | Fold note: "1024: the outline folds to a disclosure at the galley's head, the galley becomes the residual 664, **the notes column narrows to 216**." | `02-fix-log-direction-1.md` §3.1, recorded as an amendment the fix made: "**SPEC §4 D, the 1024 band. The 216px notes column is retired.** Ruling 1 puts the strips in flow below 1248, so at 1024 the galley keeps its drawn **664** and centres in the 928px field; the strips interrupt the sheet full-width." The deck embeds the fixed `direction-1.html`, so a reader who presses the sheet's own `1024` chip sees full-width interrupting strips beside a caption promising a 216px column. Sheet 14 crux iii already states the fixed behaviour ("outline folds; notes become rail strips"), so the deck contradicts itself. Second, smaller: 664 is no longer "the residual" — it is the drawn galley centred in a 928px field. | Rewrite the 1024 clause: "the galley keeps its 664 and centres in the field; the notes column is retired below 1248 and the strips interrupt the sheet full-width, on `--rail`, under their own running head." Keep 358 and the 390 clause as written. |
| **DC-102** | **P1** | high | 08 | Fold note: "1024: the paper is the residual 712 and **the margin holds at 168**." | `02-fix-log-direction-2.md` §4.1: "**SPEC §4 A's band diagram, at 1024.** Ruling 1 **replaces the 168px margin column below 1248** with the interrupting `--rail` strip, so 1024 is **one column** (`max-width: 808px`, 48px gutters → a 712px paper) exactly as 390 is one column. The readiness band still sits above the paper at both widths (crux iii)." A's fixed specimen renders no 168px margin at 1024; the deck's own sheet 14 crux iv says so ("right margin, then a band at 1024 and 390") while sheet 8 says the opposite. 712 survives as the paper measure and is correct. | Rewrite: "1024: one column — the paper is 712 inside 48px gutters, the margin column is gone, and its words become interrupting `--rail` strips with the readiness band above the paper. 390: the same shape at 358." |
| **DC-103** | P2 | high | 17 | The ruling sheet asks seven things; the fixes created an eighth that goes unasked. | `02-fix-log-direction-1.md` §3.3: "A tertiary act **`Write`** on the head's row … §5 pins no string for a fold act and #34 (`Write this part`) is direction-II-only, so **`Write` is a new string this ruling requires; it needs the panel's word.**" D — the pick — now shows a string on nine part heads that no source pins and that the panel has not ruled. Nothing on sheets 5–7, 15 or 17 mentions it. | Add **AR-h**: "D's fold act needs a word. The specimen shows `Write`; §5 pins none, and `Write this part` is A's. Evidence `02-fix-log-direction-1.md` §3.3." One row; the sheet has the space (19 prose words). |
| **DC-104** | P2 | high | 05, 08, 14, 16 | Both direction fix logs open a section headed for the panel; neither reaches the deck. | `02-fix-log-direction-1.md` §4 "**Two things the panel should see**": (a) "**The margin drifts at 1440** … the four standings below it sit up to ~200px below their own parts … the column is not line-for-line with the sheet"; (b) "**Reorder crosses a sheet segment** … it is the strip-to-part pairing that would need re-running in a shipped build." `02-fix-log-direction-2.md` §4.8 measures the same drift on A: "resting `0 / 243 / 208 / 177 / 59 px`, money `0 / 0 / 70 / 39 / 0 px` … A's honest geometry, drawn rather than argued." These are newly measured costs of the two directions the deck recommends, in the register where the deck already carries B's honest 390 cost. | One `t-meta` line on sheet 14 or one row in sheet 16's D and A risk cells: the marginalia do not sit line-for-line with their parts at 1440 (drift measured to 243px), which is why every strip names its part; and D's segmented sheet means a reorder across a segment boundary re-pairs strips to parts. |
| **DC-105** | P2 | high | 18 | The register names `review/02-fix-log.md` and heads its row "Review (expected)". | `find` over the program root: **52 files**, of which four are unlisted — `review/02-fix-log-deck.md`, `02-fix-log-direction-1.md`, `-2.md`, `-3.md`. `review/02-fix-log.md` **does not exist**. Eight files in that row are now real (`01a`–`01d` and the four fix logs), so "(expected)" no longer describes it; and this round's deck-content file is `03-rereview-deck-content.md`, not the `03c-deck-content.md` the row predicts. My round-one check passed the register at 44/44 files; it is now 48/52. | Split the row: "Review" listing the eight real files by their real names, and "Review (expected)" listing what is still to come, with `03-rereview-deck-content.md` in place of `03c-`. |
| **DC-106** | P2 | medium | 03 | Footnote: "Role rates proves the first half **in every specimen state**; Ceiling and Furnishings deposit prove the second." | `specimens/SPEC.md:667`: "\| 4 · Role rates \| **unwritten** in resting and clause; **two rates written in money** \|". `02-fix-log-direction-3.md` SD-03 confirms the built behaviour — "`paperRatesVisible` **false in resting/clause, true in money**". So Role rates proves the draws-nothing rule in **two** of the three states, not every one; in the money state it prints. The DC-16 fix corrected one over-claim and introduced another. | "Role rates proves the first half in resting and clause, where it is unwritten; Ceiling and Furnishings deposit prove the second in all three." |
| **DC-107** | P3 | high | — | The deck and `synthesis.md` now disagree on N-7's evidence. | Deck N-7 → `00575_agreement_parts.sql:2942-2946 · :3073`. `synthesis.md:325` → `00575_agreement_parts.sql:2933-2939`, which is a comment about `flat, per_phase, percent_of_cost, draws, allowances` reaching the money row "not at all". `02-fix-log-deck.md` §5 logs this deliberately: "Only `synthesis.md:3` was authorised for this pass; the N-7 line is untouched and carried to the re-review." | Apply the same correction to `synthesis.md:325`; the deck is right and its source is wrong. |
| **DC-108** | P3 | medium | 17 | The lede says "**Each row** carries the panel's recommendation" while AR-e now carries "no recommendation". | Sheet 17, first `<p>` against the AR-e cell. | "Each row carries the panel's recommendation where it has one, and each is yours to overturn." |
| **DC-109** | P3 | medium | 13 | "it touches no body file, so **drift risk is zero (FS-20)**" | FS-20 (`memo-feasibility.md:141`) establishes that the two body renderers are a fork — it does not make the zero-drift claim. That claim is `memo-feasibility.md` §2 row B: "**Neither.** B is the only direction that touches no body file at all … **Zero drift risk** — B's decisive engineering advantage." Sheet 16's B row already cites it correctly, without an id. | `(memo-feasibility.md §2 row B)`, or `(FS-20, §2 row B)` — FS-20 is why the fork matters, §2 row B is the finding. |
| **DC-110** | P3 | medium | 14 | The new paragraph reports the design reviewer's conclusion but not its stated grounds. | `01b-specimens-design.md` §7: "the mismatch **is not a difference of taste**: D loses on the constraint the synthesis itself declared binding on all three — **NO-4** — plus §A10, §F-C and its own crux-(i) numbers". §5: "D carries seven house or synthesis breaches; A carries three; B carries one plus two 390 gaps." Naming the grounds is what makes "the fixed D is the one this deck shows" a real answer rather than an assertion — and all seven are recorded fixed in `02-fix-log-direction-1.md`. | Add six words: "…judged the pictures argued for B more strongly than for D, on NO-4, §A10 and §F-C. All seven of those breaches are fixed; the fixed D is the one this deck shows." |
| **DC-111** | P3 | low | 08 | "The unwritten Role rates part takes the same studio rest row, with Write this part as its only act." | True after the fixes, but the sentence sits beside a paper the reader is looking at, and `02-fix-log-direction-2.md` §4.2 records the change it does not name: "SPEC had A take D's studio rest row **on the paper**; ruling 2 takes it off. The paper prints nothing for Role rates, and `#toggle-role-rates` … lives on the **studio strip**." | Two words: "takes the same studio rest row **off the paper**, with Write this part as its only act." |
| **DC-112** | P3 | low | 11 | "**Each part** carries Edit this part at its foot." | `02-fix-log-direction-3.md` SD-03: B's paper "now prints **nothing** until written — the whole section is toggled, so **no head, no sentence, no seam** draws for an unwritten part", and the rest row moves to `#band-rest-slot`. At rest the fixture's Role rates prints nothing, so it carries no `Edit this part`. Eight of nine do. | "Every part the paper prints carries Edit this part at its foot; the unwritten one is reached from the studio band above." |
| **DC-113** | P3 | low | 12, 02 | B's 390 send gap is stated as a placement; the deck does not connect it to its own sheet 2. | Sheet 2 annotation 3 opens the deck on "At 1024 and 390 the shipped room cannot open the send sheet at all" (defect §1 row 3). `01b-specimens-design.md` SD-20 called B's 390 behaviour "no send act at 390 in both editing states — **defect §1 row 3, reintroduced**"; `02-fix-log-direction-3.md` declined it under ruling 2 and logged it as B's cost. The deck states the fact ("the send act stays on the paper") without saying it is the same defect sheet 2 opened with, only narrowed to the drawer-open state. | Five words on sheet 12: "…the send act stays on the paper — sheet 2's third defect, narrowed to the drawer-open state." Kody should weigh it knowingly. |

---

## §6 · Verdict

**FIX.**

**P1: `DC-101`, `DC-102`** — sheet 5 and sheet 8 describe a 1024 band the fixed
specimens no longer render. Both fix logs record the change as a deliberate
amendment; the deck took their editor measures and left their layout
amendments behind. A reader pressing the sheet's own `1024` chip sees the
contradiction in the same frame as the caption, and in both cases the deck
already states the corrected behaviour on sheet 14 — so it disagrees with
itself, which is the worst form of this defect in a deck sold on a re-greppable
evidence trail.

**P2: `DC-103`, `DC-104`, `DC-105`, `DC-106`** — an unruled string on the pick's
nine part heads with no AR row to carry it; two measured costs the fixers wrote
for the panel and the deck does not show; a register gone stale against its own
folder; and one over-claim traded for another on sheet 3.

Seven P3 are attribution and precision. None changes an argument.

Everything else re-verified clean: all 25 round-one findings closed with no
regressions, every citation the fix touched opens to what it claims, both new
editor-measure sets trace to the direction fix logs with the padding arithmetic
re-run, the four rulings are carried (the return act correctly and completely),
the prose budget reproduces the fixer's count exactly at 1,562 with no sheet over
120, the banned-word and ruling-id greps are clean on the deck and return zero on
all three specimen faces, and the ruling sheet still asks rather than decides.

---

# Round 3 — against the current `deck/src/index.html`

Same reviewer, third pass. Re-read the current deck source (1,342 lines, 18
sheets) against `review/02-fix-log-deck.md`'s round-2 section, the four fix logs,
`panel-brief-common.md` §8, `specimens/SPEC.md`, and a fresh `find` of the
program folder. The deck was not edited.

**Verdict: FIX** — narrowly. Both P1s are closed and no round-2 finding regressed;
two new P3s, one of which sits on a "verbatim" claim and so matters more than its
severity.

## §7 · Round-2 findings, one by one

| ID | sev | Disposition | Proof read in the current file |
|---|---|---|---|
| **DC-101** | P1 | **CLOSED** | Sheet 5 now reads "…the galley keeps its drawn 664 and centres in the field; **below 1248 the notes column is retired and the strips interrupt the sheet full-width, under their own running head**. 390: one column at 358, the same strips, outside the paper's ground." Matches `02-fix-log-direction-1.md` §3 item 1 in substance and agrees with sheet 14 crux iii ("outline folds; notes become rail strips"). The self-contradiction is gone. |
| **DC-102** | P1 | **CLOSED** | Sheet 8 now reads "1024: **one column** — the paper is 712 inside 48px gutters, **the margin column is gone below 1248**, its words becoming rail strips, with the readiness band above the paper. 390: the same shape at 358." Matches `02-fix-log-direction-2.md` §4 item 1 (`max-width: 808px`, 48px gutters → 712px paper; readiness band above at both widths) and agrees with sheet 14 crux iv. 712 correctly retained. |
| **DC-103** | P2 | **CLOSED** | Sheet 17 carries a new **AR-h**: ask — "D's fold act needs a word. The specimen shows *Write* on the part heads; the build contract pins no string for a fold act, and *Write this part* is A's." Recommends — "the panel leans to *Write* as the shortest word that is not A's — but no source pins it, so this is an ask, not a recommendation." Evidence `02-fix-log-direction-1.md §3.3`, which reads "*Write* is a new string this ruling requires; it needs the panel's word." Opened and verified. Eight asks; the sheet still asks. |
| **DC-104** | P2 | **CLOSED** | **N-15** — "In D and in A the marginalia do not sit line-for-line with the parts they name at 1440 — measured drift up to 243px — which is why every strip carries its part's name in words. `02-fix-log-direction-1.md §4 · 02-fix-log-direction-2.md §4.8`". **N-16** — "D draws the sheet in segments so the strips can sit between them, so moving a part across a segment boundary re-pairs strip to part. Keyboard reorder, its announcement and its focus return are unaffected. `02-fix-log-direction-1.md §4`". Both traced: 243 is A's measured resting drift (`0 / 243 / 208 / 177 / 59 px`); D's own log says "~200px", so "up to 243px" is correct as the maximum across both. |
| **DC-105** | P2 | **CLOSED** | The register is split into **Review** (ten real files, real names — `01a`…`01d`, the four `02-fix-log-*`, `03-rereview-deck-content.md`, `03-rereview-deck-technical.md`) and **Review (expected)** (three). `02-fix-log.md` and the `03a`–`03d` guesses are gone. Independent check against a fresh walk of the program root: **55 files, zero unlisted, zero phantom** outside the "(expected)" row. See `DC-203` for a one-line drift since. |
| **DC-106** | P2 | **CLOSED as filed** | The over-claim "in every specimen state" is gone. Sheet 3 now quotes R21 and adds "Ceiling and Furnishings deposit prove the first rule in all three states; Role rates proves the second in resting and clause, where it is unwritten, and prints in money." The state facts are right (`SPEC.md:667`; `02-fix-log-direction-3.md` SD-03 `paperRatesVisible` false/false/true). Two new problems ride in with the replacement: `DC-201` and `DC-202`. |
| **DC-107** | P3 | **STILL OPEN — out of this lane** | `synthesis.md:325` still reads `00575_agreement_parts.sql:2933-2939`. The fixer declined it for scope and flagged it; the coordinator reports a parallel lane correcting it to `:2942-2946 · :3073`. Not re-checkable here; the deck's own N-7 is right. |
| **DC-108** | P3 | **CLOSED** | Sheet 17 lede: "Each row carries the panel's recommendation **where it has one**, and each is yours to overturn." AR-e and AR-h both decline; the lede no longer over-promises. |
| **DC-109** | P3 | **CLOSED** | Sheet 13: "so drift risk is zero (FS-20, `memo-feasibility.md` §2 row B)". |
| **DC-110** | P3 | **CLOSED** | Sheet 14: "…argued the pictures argued for B more strongly than for D — **on NO-4, §A10 and §F-C, not on taste**. Those breaches are fixed; the fixed D is what this deck shows, and the frames are where you decide." Matches `01b-specimens-design.md` §7 ("not a difference of taste: D loses on … NO-4 … plus §A10, §F-C") and §5's seven-breach count, all recorded fixed in `02-fix-log-direction-1.md` §1. |
| **DC-111** | P3 | **CLOSED** | Sheet 8: "takes the same studio rest row **off the paper**, with Write this part as its only act." |
| **DC-112** | P3 | **CLOSED** | Sheet 11: "**Every part the paper prints** carries Edit this part at its foot; the unwritten one is reached from the band above." |
| **DC-113** | P3 | **CLOSED** | Sheet 12: "…the send act stays on the paper — **sheet 2's third defect, narrowed to the drawer-open state**." |

**12 of 13 closed; `DC-107` open by design in another lane.**

## §8 · Regression sweep on the touched sheets

Sheets 3, 5, 8, 11, 12, 13, 14, 17 and 18 re-read in full; sheets 6, 7, 9 and 10
re-read because the fix log records trims there.

- **No claim was dropped.** Sheet 5 still carries "No Save control anywhere — a
  dated record stands in its place"; sheet 6 still carries D's crux plus the
  FS-19/AX-19 caveat; sheets 7, 9 and 10 are unchanged in substance with their
  614/308 measures intact.
- **Sheet 14's trim is safe.** "A is the faster run, D the surer one" is gone from
  the pull, and the `.consequence` directly beneath still reads "A is faster, D is
  surer, and the difference is one sentence…". Nothing lost.
- **The two P1 corrections do not disturb their neighbours.** Sheet 10's body
  ("the ceiling note and the readiness sentence stay in the margin") describes
  1440, where A's margin still exists; its fold note carries 1024/390 correctly.
- **Round-one fixes all hold.** Cover 240; `grep -c 231` → 0; `outline's foot` →
  1 (sheet 15's deliberate contrast); AR-f still `docs/design/house-sheet/SPEC.md:158`;
  N-7 `:2942-2946 · :3073`; N-12's M5-is-closed wording; N-14's 4.48/4.20.

**Budget.** Recounted independently under the deck's own rule:

```
01  79   07  84   13 118
02 117   08  91   14 112
03  48   09  91   15 107
04 106   10  74   16  89
05 113   11  88   17  23
06  95   12 119   18  38
```

**Total 1,592 — budget 1,600. No sheet over 120** (highest 119, sheet 12). My
count reproduces the foot comment's eighteen numbers and its total **exactly**,
and the foot comment now states its tokenisation. **PASS**, with 8 words of
headroom — see `DC-204`.

**Greps.** Deck face: banned words `clause library`, `contract builder`, `wizard`,
`dashboard`, `badge`, `pill`, `chip`, `modal`, `toast`, `spinner`,
`preview panel` → **0 each**; `\bAI\b` → 0; `!` → 0; `231` → 0. `facet` → 4, all
four still permitted (one `<q>` of shipped defect copy, two inside the quoted
return-act consequence, one filename). Ruling ids on the face: `R4`, `R7`, `R21`,
`R24`, `R27`, `R38`, `R51`, `R138`, all correct; no `W\dR\d`. Specimen faces:
`grep -coE "R[0-9]+|W[0-9]R[0-9]"` → **0** on all three. **PASS.**

**Ruling sheet still asks.** Lede unchanged in force; eight AR rows, two of which
now decline to recommend; AM-1…3 unchanged; sheet 14 hands the choice over
explicitly. **PASS.**

## §9 · New findings

| ID | sev | conf | sheet | claim | evidence | proposed fix |
|---|---|---|---|---|---|---|
| **DC-201** | P3 | high | 03 | The R21 block is labelled "R21 also survives untouched — **verbatim**", but the quotation is silently abridged. | Deck: "The composed homeowner body never prints $0 or 0% for an unset money part; it prints today's *Not yet set*. Empty clause/list parts render nothing, not a naked heading." Source (`rulings-2026-09-06.md:38`, quoted at `panel-brief-common.md:130`): "…it prints today's 'Not yet set' **and readiness blocks send while any money part the class requires is unset.** Empty clause/list parts render nothing, not a naked heading (R3-6). **The R4 floor reads only client-visible money parts (R3-3).**" A whole clause is dropped mid-sentence and replaced with a full stop, and a closing sentence is dropped; the brief marks the same elision with "…", the deck marks nothing. In a deck whose case rests on a re-greppable evidence trail, a "verbatim" label over a silent cut is the one kind of error that costs the rest of the citations their credit. | Restore the brief's ellipsis — "…it prints today's *Not yet set* … Empty clause/list parts render nothing, not a naked heading." — or drop the word "verbatim" from the label. Either is one edit and neither moves the budget (the blockquote is excluded). |
| **DC-202** | P3 | medium | 03 | "Role rates proves the **second** [rule] in resting and clause" maps a schedule part onto R21's clause/list sentence. | R21's second sentence is "**Empty clause/list parts** render nothing, not a naked heading." Role rates is `schedule` / `rate_card` (`fixture.md` §2 part 4; `agreement.ts:96-106`), not a clause or list part. R21's *money* sentence says an unset money part prints "Not yet set" — which is what Ceiling and Furnishings deposit do and what Role rates deliberately does **not** do. `specimens/SPEC.md:667` cites the pair for exactly this reason: "**R21/FS-6** — an unwritten part draws nothing on the paper", and FS-6 is the finding that generalises the silent-part rule past clause and list. As written the deck asserts a rule Role rates is not governed by, and quietly skips the live distinction — *unwritten* (no rows at all, prints nothing) versus *unset* (a figure not yet filled, prints "Not yet set"). | "…Role rates, unwritten in resting and clause, prints nothing at all — R21's silent-part rule generalised past clause and list by FS-6 — and prints in money." Cites the pair SPEC cites. |
| **DC-203** | P3 | low | 18 | Two files in the "Review (expected)" row now exist. | `review/03-rereview-specimens-technical.md` and `03-rereview-specimens-design.md` were written after the fixer's `find` (55 files, correct at the time); the folder now holds them. Both are named, only under the wrong heading, so nothing is unlisted. Inherent to a register that lists its own review round. | Move the two into the **Review** row at the final verify pass, leaving `04-verify.md` alone as expected — or leave it and let `04-verify.md` reconcile. Not worth a rebuild on its own. |
| **DC-204** | P3 | low | budget | 8 words of headroom in the total and 1 word on sheet 12. | Total 1,592 / 1,600; sheet 12 at 119 / 120, sheet 13 at 118. Round 2 spent ~90 words of new argument and had to trim six sheets to stay inside. Any further finding that needs prose — `DC-201` and `DC-202` do not — has nowhere to go without another trim. | Informational. If a later round adds argument, cut sheet 12's "B's honest cost, drawn rather than argued" (7 words), which sheet 13's pull now says in full. |

## §10 · Round-3 verdict

**FIX.**

**No P1, no P2.** Both round-2 P1s are properly closed against the fix logs and
against the frames the sheets themselves render; all four P2s are closed; ten of
the eleven P3s are closed and the eleventh (`DC-107`) is a `synthesis.md` line in
another lane. No regression anywhere on the touched sheets, and every round-one
fix still holds.

The four new findings are all P3 and all confined to two lines of sheet 3 plus
two informational notes. **`DC-201` should be fixed before delivery even so** — a
one-word or one-ellipsis edit — because it is the deck's only remaining claim
that overstates its own evidence discipline, and it is the deck's evidence
discipline that Kody is being asked to trust when he rules AR-a. With that edit
and `DC-202`'s clause, this sheet is a PASS.
