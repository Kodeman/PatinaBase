# 02 — Fix log, the deck

Target: `deck/src/index.html` (source of record) → `deck/index.html` (rebuilt).
Inputs: `review/01c-deck-content.md` (DC-01…DC-25), `review/01d-deck-technical.md`
(DT-01…DT-03), plus the orchestrator's rulings carried into the deck.

Every finding filed by either reviewer is listed. Nothing was fixed that was not
filed or ruled; no sheet was added, removed or reframed.

---

## §1 · Findings from 01c — deck content

| Finding | What changed | Sheet | Verified how |
|---|---|---|---|
| **DC-01** (P1) | `231 findings` → `240 findings` on the cover's provenance line. `synthesis.md:3` corrected in the same pass (`Seven seats, 231 findings` → `240`). | 01 (+ `synthesis.md`) | `grep -c` over the deck face and `synthesis.md`: zero remaining `231`. Count confirmed against the orchestrator's ruling (ED 50 · IA 42 · LH 38 · TY 35 · FS 34 · AX 29 · NO 12 = 240). |
| **DC-02** (P2) | AR-f evidence `specimens/SPEC.md:158` → `docs/design/house-sheet/SPEC.md:158`. | 17 | The 1100px page-measure row is in the house-sheet spec, not the program-root spec; the reviewer read both at `:158`. |
| **DC-03** (P2) | B is now argued in its own terms. A new `.pull` paragraph on B's third sheet (66 words, under the 80 ruled): B is Kody's hypothesis; it touches no body file so drift risk is zero (FS-20); the rail survives whole so reorder is free; the paper stands at its own measure the moment the drawer shuts — against its honest costs: every edit is open, edit, close, and at 390 the paper is not visible while the drawer is open, the send act staying on the paper behind it. Sheet 14 additionally states plainly that on the first-round specimens the design reviewer judged the pictures argued for B more strongly than for D, and that the fixed D is the one this deck shows. The existing sheet-13 body and fold note were trimmed to hold the 120-word sheet budget. | 13, 14 | Word count re-run (script in §4): sheet 13 = 118, sheet 14 = 110, both under 120. FS-20 confirmed as the body-renderer-fork finding at `panel/memo-feasibility.md:141`. |
| **DC-04** (P2) | AR-e recommendation "extend it, with the count moving only alongside a sentence" (unsourced) replaced with "no recommendation — IA-32 and LH-15 ask only that the act live with the other part acts; neither proposes extending it". | 17 | IA-32 (`memo-information.md:162`) proposes "Move it to the row menu with the other part-level acts"; LH-15 (`memo-leah.md:252`) proposes "One list of acts per part". Neither proposes extension. |
| **DC-05** (P2) | D's two named risks restored. Sheet 16's D row now carries: "scroll anchoring on unfold has no ambient guarantee (FS-19, AX-19), and the per-part export must report that a part drew nothing, or that an unwritten part has no fold (FS-5, FS-6)." Sheet 6, where the crux is asserted, now reads "the specimen holds it, but the build has no ambient guarantee for it (FS-19, AX-19)". | 06, 16 | Wording traced to `synthesis.md:76-78`. |
| **DC-06** (P2) | New carried item **N-14** — the aged-oak meta voice fails AA: `The client's copy · live` at 4.48:1, the meta voice at 4.20:1, carried with the viewport meta at N-3. Evidence `globals.css:13 · agreement-composer.tsx:961-962`. | 18 | `briefing/current-state.md` §6 row 4 (4.48:1, `:962` on `:961`, `globals.css:13`); `synthesis.md` §1 row 7 (4.20:1). Sheet 18 now carries all four items the plan's outline names. |
| **DC-07** (P2) | N-13 evidence `synthesis.md §6 row 2` → `current-state.md §6 row 2`. | 18 | `current-state.md` §6 row 2 is W3R3-03 (hiding a fee moves the count with no sentence); `synthesis.md` §6 row 2 is Leah's re-walk row for A. |
| **DC-08** (P2) | N-12 rewritten: the renderer pair stands; **M5 is stated as closed** — "confirmed dev-only, closed as W-01 in Wave 2 — and is carried only as the regression the durable fix must not reopen", per `current-state.md` §6 row 5's own wording. | 18 | `current-state.md` §6 row 5; `PROGRAM-REPORT.md:300`; `resting-1440.png` paints all nine rows. |
| **DC-09** (P3) | AR-g recommendation now names both options: "of the two the synthesis offers — show a total, or say plainly none exists yet — say plainly none exists yet". | 17 | `synthesis.md:313`. |
| **DC-10** (P3) | N-7 evidence `00575_agreement_parts.sql:2933-2939` → `:2942-2946 · :3073`. | 18 | `:2942-2946` is the `'scope', COALESCE(...)` projection; `:3073` is `materialize_standard_parts`. **Not** propagated to `synthesis.md` N-7 — outside this fixer's mandate (only `synthesis.md:3` was authorised); carried for the re-review. |
| **DC-11** (P3) | The pair's head "verbatim from the build contract" → "the first verbatim from `synthesis.md` §5, the second from `specimens/SPEC.md`". | 15 | Only the second quote is in `SPEC.md`; the nine-part send sentence is verbatim from `synthesis.md` §5. |
| **DC-12** (P3) | Crux i, column B: `(ED-43)` → `(ED-43, FS-2)`. | 04 | The draws/allowances sentence is FS-2's; `synthesis.md` §3 cites the pair for the same fact. |
| **DC-13** (P3) | N-12's rate-card instance now cites the plate: evidence run extended with `shots/current/resting-1440.png` (and `current-state.md §6 rows 5 and 6`). | 18 | `PROGRAM-REPORT.md:265` names a *draws* part; the plate is what shows Role rates printing the line. |
| **DC-14** (P3) | Crux i, column C: `(FS-18)` → `(memo-feasibility.md §2 row C)`. | 04 | FS-18 is C's accordion precedent; the ~400px figure is the §2 row-C cost note. |
| **DC-15** (P3) | Crux iii, column C: id dropped in favour of an attribution — "the panel's reading; NO-12 reads the same separation as the cleanest of the four". | 04 | NO-12's own valence is favourable ("None — worth preserving"). |
| **DC-16** (P3) | Sheet 3's R21 footnote split: "Role rates proves the first half in every specimen state; Ceiling and Furnishings deposit prove the second." | 03 | `SPEC.md:667` (Role rates unwritten → draws nothing); `:668-669`, `:1162` (`Not yet set` on Ceiling and Furnishings deposit). |
| **DC-17** (P3) | Plate `.src` run extended: "the mid-page app chrome and the estimate oval are full-page capture artifacts, not the room's own furniture". | 02 | Added inside the `.src` span, which the deck's own prose rule excludes — sheet 02 stays at 117. |
| **DC-18** (P3) | Column head "What it forbids" → "What it forbids here" (and all four `data-label` attributes, so the 760px stacked view matches). | 03 | The forbidden layouts are the panel's inference from each fixed thing, now visibly so. |
| **DC-19** (P3) | The five-words row now names its rulings: id cell `The five words · R7 / R138`; the forbid cell ends "(R38)". | 03 | Consistent with R4 and R27/R51 being named on the same table. |
| **DC-20** (P3) | No claim change required; the foot comment was recounted from the fixed file and now names its tokenisation. New figures: prose **1,562**, every rendered word **4,419**. | foot | Counter re-run against the deck's own stated rule; it reproduces the 01c reviewer's per-sheet numbers exactly on the sheets this pass did not touch (01 79, 05 104, 08 85, 11 76, 16 89, 17 19, 18 38). |
| **DC-21** (P3) | Dismiss act after-cell: "Not yet — the reason IA-38, the string `synthesis.md` §5". | 15 | IA-38 proposes "One word for leaving"; the string is §5's. |
| **DC-22** (P3) | `PartEditorBody:156` → `PartEditorBody — part-editor.tsx:162`. | 16 | `:156` is `{RECORD_ONLY_HELP}`; the symbol is declared at `:162`. |
| **DC-23** (P3) | `refusalMessage:114` → `agreement-composer.tsx:114` (`refusalMessage`). | 16 | The neighbouring citation in the cell is `commercial-documents.ts`, which has no such symbol. |
| **DC-24** (P3) | N-9 evidence → `__snapshots__/agreement-composer-library-off.test.tsx.snap · agreement-composer-design-build-off.test.tsx.snap`. | 18 | Both suites named; the figures (ten calls, 3,111 lines) were already exact. |
| **DC-25** (P3) | Sheet 14's pull restored to "takes four of the seven first places **and is second on IA**; the two seats that rank it lower…". | 14 | `synthesis.md:277-279`. |
| 01c §2 #7 (vague) | "kept, verbatim from `readiness.ts`" → `readiness.ts:490`, `:529`. | 15 | The reviewer verified both lines. |
| 01c §2 #10 (vague) | D's Touched cell: bare `parts-rail.tsx` → `parts-rail.tsx:142-199`. | 16 | The nav block the reviewer verified for the same file in A's row. |
| 01c §2 #30, #51 (vague) | Fixed as DC-23 and DC-24 above. | 16, 18 | — |

## §2 · Findings from 01d — deck technical

| Finding | What changed | Sheet | Verified how |
|---|---|---|---|
| **DT-01** (P2) | The five `svg.wire` diagrams keep their 660px floor (scaling them into a 390px column would put labels at 6–8px, under the house sheet's 11px rule — measured before choosing). Instead their wrappers became `.scroller.wires`, which now keeps `overflow-x: auto` at every width — the 760px media rule that had set `overflow-x: visible` is scoped to `.scroller:not(.wires)`, which is what was clipping them. Each carries a visible `.t-meta` cue, "Scrolls sideways →", shown by script only when the figure actually overflows its column. | 02, 04 | Playwright, Chromium, light, `file://` in a minimal shell. At 390: every wire renders 660px inside a 350px `overflow-x: auto` scroller; smallest rendered label **11.00px**; all five cues visible. At 1440: sheet 2's wire does not overflow and shows no cue; sheet 4's four do overflow and show theirs; smallest label 11.00px. Page-level `scrollWidth == clientWidth` (1440/1440 and 390/390) at both widths. |
| **DT-02** (P3) | **Declined.** The two `rel="preconnect"` hints stay. Only one `<link>` is a loaded resource; dropping the hints is a pure performance loss with no correctness gain, and the reviewer's own recommendation was "otherwise no action". Logged, not fixed. | chrome | — |
| **DT-03** (P3) | `build.mjs` now reports **bytes**: `Buffer.byteLength(x, 'utf8')` replaces `.length` (UTF-16 code units) for the specimen sizes, the built size, the payload total and the deck-without-payloads figure. | `deck/build.mjs` | The rebuild's logged built size now equals `wc -c` on the written file (see §4). |

## §3 · Orchestrator rulings carried into the deck

| Ruling | What changed | Sheet | Verified how |
|---|---|---|---|
| **Return act placement** | In all three directions the return act, its consequence sentence and the hold caption sit at the page foot below the paper, at the paper's measure, at every width — not the outline's foot. Corrected on sheet 4's "where the acts live" row (column A), sheet 14's same row (column D), sheet 15's return paragraph, and sheet 17's AM-1 "what the specimens build" cell. | 04, 14, 15, 17 | `grep -c "outline&rsquo;s foot"` over the deck source: the only survivor is sheet 15's explicit contrast, "at the page foot below the paper … — not the outline's foot". |
| **B at 390** | Sheet 12's 390 fold note now says the readiness sentence moves into the drawer's head and `Back to the paper` to its foot, and that the send act stays on the paper. | 12 | Sheet 12 word count 110, under 120. |
| **B argued** | See DC-03. | 13, 14 | — |
| **Editor measures** | The specimen fixers' logs landed before the rebuild, so the deck carries their measured numbers rather than a hedge. D's editor and printed part set at **670 / 614 / 308** (`02-fix-log-direction-1.md` §2); A's at **622 / 614 / 308** (`02-fix-log-direction-2.md` §3). Sheets 6, 7, 9 and 10's fold notes and sheet 14's crux i now say so; the galley/paper box figures (720 / 664 / 358 on D, 720 / 712 / 358 on A) stay where they describe the column, not the editor — sheets 5, 8 and the sheet-4 diagrams. | 06, 07, 09, 10, 14 | Both fix logs read; each records the measure from `getBoundingClientRect()` on the editor, the money rows and the printed prose, equal at each width. |

## §4 · Budgets and build

Prose counted by the deck's own stated rule — every `<p>` and `<figcaption>`
inside `.main`, excluding tables, blockquotes, the register `<dl>`, sheet 18's
carried-items list, headings, and every run set in the meta face (`.t-head`,
`.k`, `.src`, `.grouplabel`) whether that class sits on the element or on a span
inside it. Tokens split on whitespace after `—` and `·` are dropped; a token
counts if it carries a word character or `$`.

```
01  79   07  84   13 119
02 117   08  91   14 113
03  58   09  91   15 106
04 106   10  74   16  89
05 112   11  88   17  23
06  92   12 118   18  38
```

**Total 1,598 — budget 1,600. No sheet over 120** (highest 119, sheet 13). Every
rendered word 4,764. The foot comment carries these figures. To pay for round 3's
new argument, phrasing was trimmed on sheets 5, 6, 12, 13, 14 and 15 — including
sheet 12's "B's honest cost, drawn rather than argued" per `DC-204`, and sheet
14's pull to "The pick is D: four of seven first places and second on IA…". No
claim was dropped.

**Rebuild.** `node deck/build.mjs`, after D's round-2 sentinel was confirmed as
`direction-1.html`'s last line. All three complete, no polling wait, three slots
each, no pending placeholder, exit 0. **916,015 bytes (894.5 KB)**, equal to
`wc -c`; payloads 612,672 B; deck without payloads 303,343 B.

**Payloads match the current specimens** — each file attribute-escaped
independently and matched against the built deck: D **3**, A **3**, B **3**;
nine of nine, against `direction-1.html` (08:59, its round-2 build), `-2.html`
(08:32), `-3.html` (08:23).

Playwright, Chromium, light, minimal shell, `file://`:

| | 1440 | 390 |
|---|---|---|
| page horizontal scroll | none (`1440/1440`) | none (`390/390`) |
| sheets · frames loaded | 18 · 9 of 9 | 18 · 9 of 9 |
| frame states, in order | resting, clause, money × 3 | same |
| smallest wire label | 11.0 px | 11.0 px |
| "scrolls sideways" cues | 4 | 5 |
| pending placeholders · unresolved tokens | none · none | none · none |
| console errors, autofocus-in-sandbox excluded | 0 | 0 |


### Round-3 correction, recorded

One edit script in this round raised an assertion and exited **before** its
write, so seven of its edits (`DC-201`'s label and quote, `DC-202`, and the
sheet-12 / sheet-13 trims and B measurements) silently did not land; a later
`grep` for `verbatim` caught it. All seven were re-applied and re-counted, and
the figures above are from the re-applied file. `grep -c "verbatim</p>"` → 1,
which is the cover's "The ask, verbatim" and nothing else.

---

# Round 4 — D's final design check ("Round 3 — D", `03-rereview-specimens-design.md`)

D passed: SD-102, SD-108 and SD-109 closed, no new findings, final crux row
**6 PROVEN · 1 PARTLY**. Four deck statements moved with it.

| What changed | Sheet | Verified how |
|---|---|---|
| **Crux ii restored to PROVEN.** Sheet 14's D cell now reads "Write → Move up → Move down → + Add a part, forward at every width, at 0px reflow; seams persistent" — the round-2 keyboard regression is reversed. | 14 | SD-108: head-row tab order traced with real key presses at 1440, 1024 and 390, identical at each, `MOVE UP` reachable by forward Tab from load at all three (`true / true / true`, was `false`). |
| **The strip behaviour at 1024.** Sheet 5's fold now reads "…the notes column is retired below 1248. A strip prints only where it has words — two or three fragments at 1024, and at 390 one column of 358 carrying them outside the paper's ground." Sheet 14's crux iii D: "outline folds; the strips drop to two or three and the sheet rejoins everywhere else." | 05, 14 | SD-102: at 1024 strips drop from five to 2 (resting/clause) and 3 (money); **no name-only strip renders below 1248**; segment gaps `[260,0,0,0]` and `[185,171,0,0,0]`; `d1r3-resting-1024.png` shows two fragments, not six. |
| **Crux iv stays PARTLY, and says why.** Sheet 14's D cell now ends "— but at 1440 four of five strips still drift 116–216px below their parts". | 14 | The reviewer's crux row: PARTLY on SD-13, a P3, 1440 resting and clause only. |
| **The carried items follow.** **N-15** now reads "…drift up to 243px, D's own 116–216px … At 1024 and 390 the strips sit with their parts. D's last open finding, SD-13, and a P3." **N-16** now records "0px at 1024 and 390 at every junction where no strip prints — no name-only strip renders below 1248, so 1024 reads in two or three fragments, not six". | 18 | Both from the same disposition table. Register list, so no sheet budget moved. |

**Left alone on purpose.** Sheet 14's arc line keeps the reviewer's own scores —
`A 7 PROVEN · D 6 PROVEN + 1 PARTLY · B 4 PROVEN + 3 PARTLY` — which D's round-3
row confirms rather than changes. Sheet 4's crux ii D ("Move up / Move down on
the head — two presses, LH-13") is still exactly true and was not touched.

## Round-4 budget, rebuild and render

```
01  79   07  84   13 119
02 117   08  91   14 113
03  58   09  91   15 104
04 106   10  74   16  89
05 114   11  88   17  23
06  92   12 118   18  38
```

**Total 1,598 — budget 1,600. No sheet over 120** (highest 119, sheet 13). Every
rendered word 4,831. Two words were trimmed on sheet 15 ("no confirm, sentence
or undo") and two on sheet 5 to pay for the new clauses; no claim was dropped.

**Rebuild.** `node deck/build.mjs` — three complete, no wait, three slots each,
no pending placeholder, exit 0. **929,601 bytes (907.8 KB)**, equal to `wc -c`;
payloads 625,854 B; deck without payloads 303,747 B.

**Payloads match the current specimens** — D **3**, A **3**, B **3**, nine of
nine byte-equal after attribute-escaping, against `direction-1.html` at
**70,102 bytes** (09:07, its round-3 build), `-2.html` (08:32), `-3.html` (08:23).

Playwright, Chromium, light, minimal shell, `file://`: no page horizontal scroll
at 1440 (`1440/1440`) or 390 (`390/390`); 18 sheets; 9 of 9 frames loaded in
`resting, clause, money` order ×3; smallest wire label 11.0px at both widths;
4 and 5 "scrolls sideways" cues; no pending placeholder, no unresolved token;
zero console errors excluding the specimens' known autofocus-in-sandbox warnings.
