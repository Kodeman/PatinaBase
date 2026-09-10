# Review 01c — deck content and fact-check

Adversarial reviewer (c). Fresh context; did not write the deck. Target:
`deck/src/index.html` (1,291 lines, 18 sheets). The deck was not edited.

**Verdict: FIX.** One P1 (`DC-01`), eight P2, sixteen P3.

Counts: **56 `path:line` citations checked — 50 verified, 4 wrong, 2 vague.**
Every figure traced; **two unsourced or wrong-against-source** (`DC-01`, `DC-13`).
Cost bands all six trace to `panel/memo-feasibility.md` §2 exactly. Kody's ask is
byte-identical. No banned word on the deck's face outside a quoted-defect span.
No `R\d+` in any specimen face. All 18 sheets present with the plan's assigned
content; the register lists every one of the 44 real files plus the three
`{{ARTIFACT_*}}` slots.

---

## §1 · Check 1 — Kody's ask, byte-identical

`diff` of the cover `<blockquote class="quote">` (HTML-unescaped) against
`briefing/panel-brief-common.md` §1's blockquote:

```
deck : 'This agreement build is great, but the interface is a bit clunky. Have a UX UI
        team look at the current interface and propose a direction to make this build more
        concise and straight forward. The preview down the side is too thin, maybe it
        doesnt belong on the same page as the builder? Maybe it is the page and the builder
        is more of an overlay? have the team propose a new direcion in an html presernation.'
brief: (identical string)
result: IDENTICAL
```

His spelling is preserved throughout — `doesnt`, `direcion`, `presernation`,
`straight forward`, the lowercase `have the team`. **PASS.**

---

## §2 · Check 2 — every `path:line` in the deck

Paths resolved as `current-state.md` declares them: `agreement-composer.tsx`,
`parts-rail.tsx`, `part-editor.tsx`, `readiness.ts`, `part-kinds.ts`,
`schedules/` =
`apps/designer-portal/src/components/document/rooms/drafting/agreement/…`;
`agreement-parts-body.tsx`, `service-agreement-preview.tsx`,
`service-agreement-send-sheet.tsx` = `.../document/commercial/…`.

| # | Sheet | Citation | Result | Actual line content (when wrong / vague) |
|---|---|---|---|---|
| 1 | 02 | `service-agreement-preview.tsx:101` | verified | `className={compact ? "space-y-5" : "mx-auto max-w-[720px] space-y-7"}` |
| 2 | 02 | `readiness.ts:541-553` | verified | doc comment + `partsNeedingAttention` counting distinct `blocker.partId` |
| 3 | 02 | `room-shell.tsx:155` | verified | `<div className="hidden min-[1180px]:block">{action}</div>` |
| 4 | 02 | `agreement-composer.tsx:960` | verified | `<div className="hidden min-[1180px]:block">` (the aside) |
| 5 | 02 | `agreement-composer.tsx:820` | verified | `grid gap-9 pt-7 min-[1180px]:grid-cols-[260px_minmax(0,1fr)_320px]` |
| 6 | 02 | `current-state.md §1` | verified | carries the 260 / 524 / 320 / ≈280 measures |
| 7 | 15 | `readiness.ts` (bare, "verbatim from") | vague | true at `:490` and `:529`; no line given |
| 8 | 15 | `agreement-composer.tsx:637-648` | verified | `returnToFacets` — `await discard.mutateAsync()`, no confirm |
| 9 | 16 D | `agreement-composer.tsx:820-978` | verified | grid `:820` → `</aside></div></div>` `:968-970`, `DocSheet` `:972-977` |
| 10 | 16 D | `parts-rail.tsx` (bare) | vague | file exists, 434 lines; no line given |
| 11 | 16 D/A | `part-editor.tsx:88-155` | verified | the editor header block, ending `</section>` at `:158` |
| 12 | 16 D/A | `agreement-parts-body.tsx:303,541,570` | verified | `:303` `function renderPartBody(`, `:541` `export function AgreementPartsBody({`, `:570` `if (body === null && !isBasis) return null;` |
| 13 | 16 D | `doc-sheet.tsx:377` | verified | `wide ? 'max-w-[760px]' : 'max-w-[640px]'` |
| 14 | 16 D | `readiness.ts` (all 584) | verified | `wc -l` = 584 |
| 15 | 16 D | `schedules/index.ts` | verified | exists, 117 lines |
| 16 | 16 D | `part-kinds.ts` | verified | exists |
| 17 | 16 D | **`PartEditorBody:156`** | **wrong** | `:156` is `{RECORD_ONLY_HELP}` inside the record-only `<p>`. `PartEditorBody` is *declared* at `part-editor.tsx:162` and *used* at `:146`. Inherited verbatim from `memo-feasibility.md` §2 row D. |
| 18 | 16 A | `agreement-composer.tsx:719-978` | verified | `:719` = `<div className="mx-auto max-w-[1240px] px-6 py-7 sm:px-8">` |
| 19 | 16 A | `parts-rail.tsx:142-199` | verified | `:144` `<nav aria-label="Agreement parts">` → `:198` `}` |
| 20 | 16 A | `schedules/index.ts:52-107` | verified | `authorityStanding()` `:52` → `scheduleEditorFor()` `:107` |
| 21 | 16 A | `AGREEMENT_PART_COPY` | verified | `packages/types/src/agreement-copy.ts` |
| 22 | 16 B | `agreement-composer.tsx:903-968` | verified | `:903` `<aside className="space-y-6">` → `:968` `</aside>` |
| 23 | 16 B | `agreement-composer.tsx:743-763` | verified | the three-act row: Preview `:744-746`, Return `:747-754`, Save `:756-762` |
| 24 | 16 B | `parts-rail.tsx` entire (434) | verified | `wc -l` = 434 |
| 25 | 16 B | `part-editor.tsx` entire (657) | verified | `wc -l` = 657 |
| 26 | 16 hdr | `agreement-composer.tsx:732-734` | verified | `<h1 className="font-heading text-[1.65rem]…">{document.title}</h1>` |
| 27 | 16 hdr | `agreement-composer.tsx:765-797` | verified | `<div className="mt-4 max-w-sm">` → `ClientPicker` + owner sentence |
| 28 | 16 hdr | `agreement-composer.tsx:756-762` | verified | the Save button, `disabled={!dirty \|\| readOnly \|\| refusedAtSave}` at `:759` |
| 29 | 16 hdr | `commercial-documents.ts:292` | verified | `title: document.title,` in `apps/designer-portal/src/lib/document/commercial-documents.ts` |
| 30 | 16 hdr | `refusalMessage:114` | vague | correct, but the enclosing file is unnamed and the neighbouring citation in the same cell is `commercial-documents.ts`; `refusalMessage` is at **`agreement-composer.tsx:114`** |
| 31 | 16 send | `service-agreement-send-sheet.tsx:105-112` | verified | the consequence paragraph, both arms |
| 32 | 16 send | `service-agreement-send-sheet.tsx:153` | verified | `Ready to send · every contractual facet is present.` |
| 33 | 16 send | `service-agreement-send-sheet.tsx:168-177` | verified | the optional-note label + `placeholder="A short personal note…"` |
| 34 | 16 send | `agreement-composer.tsx:1004-1027` | verified | `<ServiceAgreementSendSheet … />` |
| 35 | 16 send | `agreement-copy.ts` | verified | exists |
| 36 | 16 ret | `agreement-composer.tsx:747-754` | verified | the `variant="secondary"` return button |
| 37 | 16 ret | `agreement-composer.tsx:637-650` | verified | `returnToFacets` body incl. the catch |
| 38 | 16 ret | `agreement-copy.ts:46` | verified | `returnToFacets: "Return to the seven facets",` |
| 39 | 17 AR-b | `agreement-copy.ts:46`, `:54-55` | verified | `:54-55` = `composedElsewhere: "This agreement is composed from parts…"` |
| 40 | 17 AR-c | `memo-typography.md §3` | verified | §3 = "Required artifact (a) — proposed house-sheet block", `### §A14 · Fields on paper` at `:131` |
| 41 | 17 AR-f | **`specimens/SPEC.md:158`** | **wrong file** | `specimens/SPEC.md:158` is `color: var(--ink);` inside the shared CSS block. The 1100px page measure is **`docs/design/house-sheet/SPEC.md:158`** — `\| Page measure \| max-width: 1100px centred at ≥1200px; prose capped at 65ch \|`. `synthesis.md` §8 writes the bare `SPEC.md:158` in a house-sheet context; the deck resolved it to the wrong file. |
| 42 | 17 AR-g | `agreement-parts-body.tsx:160-209` | verified | `PricingBasisLeaf` — the only summing renderer, turnkey-only |
| 43 | 18 N-1 | designer `:6-8` · client `:14-16` | verified | designer: "One spec, two implementations"; client: "one table, implemented twice" |
| 44 | 18 N-2 | `typography.css:106-125` | verified | `.type-meta` 0.75rem and `.type-meta-small` **0.63rem = 10.08px** |
| 45 | 18 N-3 | `layout.tsx:37-41` | verified | `export const viewport = { width:'device-width', initialScale:1, maximumScale:1 }` |
| 46 | 18 N-4 | `doc-sheet.tsx:80` | verified | `element.getAttribute('aria-disabled') !== 'true' &&` inside the focusable filter |
| 47 | 18 N-5 | `waves/w3/wave-report.md:173`, `:184` | verified | ":173 … **The rename affordance was NOT built**"; ":184 … `proposals.title` has no rename RPC" |
| 48 | 18 N-6 | `button.tsx:29-30` | verified | `apps/designer-portal/src/components/ui/controls/button.tsx:30` carries `disabled:opacity-50` |
| 49 | 18 N-7 | **`00575_agreement_parts.sql:2933-2939`** | **wrong** | `:2933-2939` is a comment about `flat, per_phase, percent_of_cost, draws, allowances` reaching the money row "not at all". The scope projection the claim needs is **`:2942-2946`** (`'scope', COALESCE((SELECT ap.payload->>'body' … part_key = 'patina.services' …`), and `materialize_standard_parts` is `:3073`. `shots/README.md` cites `:2934-2939` for the same fact; neither range lands on it. |
| 50 | 18 N-8 | `agreement-composer.tsx:602-618` | verified | `persist()` — "every part comes back with a new uuid … `part_key` is the identity that survives a save" |
| 51 | 18 N-9 | `library-off.test.tsx.snap` | vague | real name `__snapshots__/agreement-composer-library-off.test.tsx.snap`; the *figures* verify — `grep -c toMatchSnapshot` = 5 + 5 = **10 calls**; `wc -l` = 1568 + 1543 = **3,111 lines** |
| 52 | 18 N-10 | `part-kinds.ts:367-373` | verified | `dollars` `:367-368` + `toCents` `:370-373`, `Math.round(amount * 100)` every keystroke |
| 53 | 18 N-11 | `agreement-copy.ts:19-20`, `:54-55` | verified | `:19-20` = `retainerOnPayment: "…after the fully executed agreement…"` |
| 54 | 18 N-12 | `PROGRAM-REPORT.md:221`, `:265`, `:300` | verified as lines; **claim mismatch** | `:265` names N-i as "an unset **draws** part says `Recorded with your agreement.`" — the deck says "an unset **rate card**". (The deck's wording is nonetheless *true* — `resting-1440.png` shows Role rates printing `Recorded with your agreement.` — but the cited line does not say it.) |
| 55 | 18 N-13 | **`synthesis.md §6 row 2`** | **wrong document** | `synthesis.md` §6 is Leah's re-walk table; row 2 there is "A · paper is the page". W3R3-03 is **`briefing/current-state.md` §6 row 2**. `synthesis.md`'s own N-13 cites the bare "§6 row 2", meaning the briefing; the deck resolved it to the wrong file. |
| 56 | 02 | `current-state.md` (SVG figcaption) | verified | §1's "The three columns" table |

**Verified 50 · wrong 4 (#17, #41, #49, #55) · vague 2 (#7 partly, #30, #51 —
counted as 2 hard-vague: #30, #51) · 1 claim/citation mismatch (#54).**

---

## §3 · Check 3 — every figure traced

| Figure | Sheet | Source | Result |
|---|---|---|---|
| 260 / 524 / 320 / ≈280 | 02 | `current-state.md` §1 "The three columns" | traced |
| 1180 (the one breakpoint) | 02 | `agreement-composer.tsx:820`; `current-state.md` §2 | traced |
| `0 of 9` | 02 | `resting-1440.png` (top bar **and** aside, twice) | traced — and the plate proves the doubling |
| 640 sheet / 720 paper | 02, 04 | `doc-sheet.tsx:377`; `service-agreement-preview.tsx:101` | traced |
| 208px margin | 04, 10 | FS-2; `synthesis.md` §2 crux i | traced |
| 480px drawer / ~200px role name | 04, 13 | ED-43, FS-2; `SPEC.md:1031`, `:1084` | traced |
| ~400px (C's editor) | 04 | `memo-feasibility.md` §2 row C — "524 → ~400 after head + indent" | traced (id mis-attributed, see `DC-14`) |
| 720 / 664 / 358 (D) · 216 notes · 192 outline · 1200 band | 05–07, 17 | `specimens/SPEC.md:758-768` | traced |
| 720 / 712 / 358 (A) · 168 margin | 08–10 | `specimens/SPEC.md:908-914` | traced |
| 480 / 384 / 544 (B) | 11–13 | `specimens/SPEC.md:1024-1031` | traced |
| `85.0`, caret after the zero | 07 | `specimens/SPEC.md:688`, `:851` | traced |
| 54/18/15/17m10s/17 · 33/5/8/11m52s/3 · 41/11/13/14m17s/5 · 53/16/14/15m55s/5 · 39/6/9/12m29s/2 | 14 | `panel/memo-leah.md:144, :163, :182, :201, :220` | traced, exact |
| D 17 · A 13 · C 12 | 04 | `synthesis.md` §2; arithmetic re-run from the seven rankings (3·2·1 over A/C/D) — 17/13/12 | traced and recomputed |
| $5,000.00 · $24,000.00 · $2,400.00 · nine parts | 15 | `briefing/fixture.md` §1, §2 part 10; `synthesis.md` §5 | traced |
| Cost L · XL→L · M→L · M · M→L · S | 16 | `panel/memo-feasibility.md` §2, cost-band column, all six rows | **traced to §2 only** |
| 584 · 434 · 657 (line counts) | 16 | `wc -l` on the three files | traced |
| sixteen Save selector sites | 16 | `memo-feasibility.md` §2 header row — "**16 selector sites**" | traced |
| 10.08px | 18 | `typography.css:106-125` (0.63rem) | traced |
| 1.20:1 | 18 | `synthesis.md` §1 row 7 / AX-4 | traced |
| 10 calls, 3,111 lines | 18 | recomputed: 5 + 5 calls; 1568 + 1543 lines | traced |
| eighteen local renders, uncommitted | 18 | `ls shots/current` = 18; `git status` = folder untracked | traced |
| **231 findings** | 01 | `synthesis.md:3` — but the memos carry **240** | **wrong, `DC-01`** |
| prose 1,418 / rendered 4,106 | foot | own count: 1,392 / 3,968 | within convention noise, `DC-20` |

No figure on the deck is unsourced. Two are wrong against their source:
`DC-01` (231) and `DC-13` (N-12's "rate card"). Cost bands come from
`memo-feasibility.md` §2 and nowhere else — verified by reading the memo's §2
table row-by-row against the sheet-16 Cost column.

---

## §4 · Check 4 — finding ids

Every id the deck cites was opened in its memo's findings table and read.

| Id | Memo | Says what the deck attributes? |
|---|---|---|
| ED-27 | editor | yes — 640 sheet shows less than the 320 aside |
| ED-31 | editor | yes — `room-shell.tsx:155`, no send below 1180 |
| ED-41 | editor | yes — A's two editing models, 6/4 split |
| ED-42 | editor | yes — readiness is four objects, two homes |
| ED-43 | editor | **partly** — ED-43 is the ~200px role name at 480; "holds neither draws nor allowances" is **FS-2**'s sentence (`DC-12`) |
| ED-44 | editor | yes — open→edit→close; paper invisible at 390 |
| ED-45 | editor | yes — D needs a per-part export from the body file |
| ED-47 | editor | yes — D retires the 640 sheet |
| ED-50 | editor | yes — rename ask, AMENDMENT-ASK |
| IA-3 | information | yes — the count printed twice |
| IA-8 | information | yes — the paper at ~280, 39% of its 720 |
| IA-10 | information | yes — below 1180 the paper is not rendered |
| IA-15 | information | yes — cut the act and sheet in A and D |
| IA-17 | information | yes — the only "facet" string, rename ask |
| IA-21 | information | yes — readiness proves R4's floor, not completeness |
| IA-23 | information | yes — fold the deposit box into the sentence |
| IA-24 | information | yes — cut the Recipient box |
| IA-25 | information | yes — one terminal act carrying the figure |
| IA-26 | information | yes — cut the eyebrow and heading |
| IA-27 | information | yes — placeholder → a `.t-meta` line |
| IA-30 | information | yes — `+ Add a part` only at the rail's foot |
| IA-32 | information | yes — hide-a-part lives in the editor |
| IA-38 | information | **partly** — IA-38's own text is `Put back · Esc` vs `Send later`, proposing "One word for leaving"; the specific replacement `Not yet` is `synthesis.md` §5's, not IA-38's (`DC-21`) |
| TY-8 | typography | yes — Playfair italic part heading, AMENDMENT-ASK |
| TY-22 | typography | yes — one scale over ≈45ch / ≈86ch / 115ch |
| TY-25 | typography | yes — step the title below 480, AMENDMENT-ASK |
| LH-1 | leah | yes — the same tally printed twice |
| LH-5 | leah | yes — ~280 wide, title on three lines |
| LH-13 | leah | yes — *Move up* five times, menu shuts each press |
| LH-15 | leah | yes — two homes for one job |
| LH-28 | leah | yes — rename ask |
| AX-1 | critic | yes — no `aria-live` anywhere in the composer |
| FS-2 | feasibility | yes — 208px holds none; 480 holds neither draws nor allowances |
| FS-11 | feasibility | yes — no way to open the send sheet at 1024/390 |
| FS-12 | feasibility | yes — the count prints twice |
| FS-18 | feasibility | **no** — FS-18 is C's `facet-section.tsx` accordion precedent. The "~400px after head and indent" figure is `memo-feasibility.md` §2 row C, not FS-18 (`DC-14`) |
| FS-27 | feasibility | yes — keyboard reorder ships; A/D must re-home the menu and rebuild the index translation |
| NO-1 | nora | yes — A's band needs its own register |
| NO-4 | nora | yes — the note must leave the paper's ground at 390 |
| NO-12 | nora | **valence inverted** — NO-12 calls C "the cleanest separation of the four" and proposes "None — worth preserving". Sheet 4 crux iii cites it for "the paper becomes an errand behind an act" (`DC-15`) |

All 42 ids **exist**. Three carry a claim the memo does not make (`ED-43`,
`FS-18`, `NO-12`); one (`IA-38`) is cited for a string it did not propose.

---

## §5 · Check 5 — ruling ids

| Ruling | Where on the deck | Correct against `panel-brief-common.md` §8 / `synthesis.md` §7–§8? |
|---|---|---|
| R4 | sheet 03 row 1; sheet 15 "readiness proves R4's floor" | yes — "Parties, signature block, one typed money part … a ceiling part is required whenever a rate card is present". The deck's *forbids* column ("a layout that cannot show a ceiling blocker while the rate card is being written") is the panel's inference, not R4's text (`DC-18`) |
| R21 | sheet 03 footnote | text correct; the *proof* claim is wrong (`DC-16`) |
| R24 | sheet 17 AM-1 | yes — "R24 fixes that the act exists, not what it is called" is §7 AM-1 verbatim in substance |
| R27 / R51 | sheets 03, 04, 14, 16 | yes — "same body the client's door renders"; forbids a body that yields a slot; D wrapper / A fork-as-written / B neither — matches `synthesis.md` §2 crux vi and §3 |
| R7 / R138 | sheet 03 "The five words" row | content correct (Agreement · Part · Library · Template · Addendum) but **no id given** while R4 and R27/R51 are named on the same table (`DC-19`) |
| R38 | sheet 03, as "any ruling number on the studio's face" | content correct, id not named — consistent with R38 itself |
| R33, R39, R48 | **not cited** | R39 is the ruling behind sheet 17 AR-e ("R39 gave the toggle to the turnkey lane only", `synthesis.md` §8) and is dropped; R33/R48 are not needed by any sheet claim |

**`R\d+` inside a specimen face:** `grep -oE "R[0-9]+|W[0-9]R[0-9]"` over
`specimens/direction-1.html`, `-2.html`, `-3.html` returns **zero hits in all
three**. R38 holds. On the deck's own face (which may cite them) the ids are
`R4`, `R21`, `R24`, `R27`, `R51` and no `W\dR\d`. **PASS.**

---

## §6 · Check 6 — the 18-sheet outline

Against the plan's "Deck outline" block and `synthesis.md`:

| Plan sheet | Deck | Result |
|---|---|---|
| 1 Cover — ask verbatim, one-line answer | `#sheet-1` | present; ask byte-identical; answer = synthesis §6's own sentence |
| 2 Today — prod page at true proportion (260/flex/320), three annotations, plates | `#sheet-2` | present; plate + true-proportion SVG + exactly three annotations |
| 3 What cannot move — R4, R27/R51, house sheet, vocabulary | `#sheet-3` | all four rows present |
| 4 Four directions — four SVGs, one sentence + one crux each, criteria table | `#sheet-4` | four figures, four one-liners, four CRUX lines, seven-row table + rankings tfoot |
| 5–7 Direction I, three states, width toggle, fold notes | `#sheet-5..7` | present, `data-s` = resting / clause / money, 1440/1024/390 chips, fold paragraph each |
| 8–10 Direction II | `#sheet-8..10` | same shape |
| 11–13 Direction III | `#sheet-11..13` | same shape |
| 14 Side by side — 7 cruxes × 3, Leah's counts, the pick | `#sheet-14` | present, all three |
| 15 Send sheet + return act, N4 closed, consequence sentences | `#sheet-15` | present |
| 16 Feasibility — touched at file:line, reuse, cost band, two-renderer note | `#sheet-16` | present, six rows + the fork caution |
| 17 The ruling — numbered AR-questions with a recommendation each | `#sheet-17` | AR-a…g + AM-1…3; all five plan-named asks present |
| 18 Next and the register — **W3R2-06, aged-oak label, M5, two renderers** + register | `#sheet-18` | **aged-oak label missing** (`DC-06`); the other three present as N-5, N-12, N-1 |

**Criteria table vs `synthesis.md` §2** — all seven crux rows and all four
direction columns match, cell for cell, with three compressions and no
contradictions: crux ii D drops "against five menu trips"; crux iii D drops "or
it leaks"; crux v D drops "return at the outline's foot" (it survives on sheet
14). Seat rankings and the 17/13/12 score are verbatim.

**Leah's table vs `synthesis.md` §6** — all 25 cells identical, and identical
again to `memo-leah.md`'s five walk totals.

**Send sheet before/after vs `synthesis.md` §5** — all eleven slots present in
order with the same disposition and the same finding ids. The deck adds a
"Today" column, every cell of which I verified against `current-state.md` §3 and
the source (`:96`, `:99-101`, `:102-103`, `:105-112`, `:114-121`, `:125-135`,
`:151-154`, `:158`, `:168-177`, `:200-202`, `:203-209`, `:189-195`). One
provenance slip: the sheet heads two blockquotes "verbatim from the build
contract", but only the second is in `specimens/SPEC.md`; the first is verbatim
from `synthesis.md` §5 (`DC-11`).

**The ruling sheet asks rather than decides** — "This program asks; it does not
decide. Each row carries the panel's recommendation, and each is yours to
overturn." Seven asks, each phrased as a question or an open item, each with a
recommendation in its own column. One recommendation is not in any source
(`DC-04`).

**The register** — cross-checked programmatically against `find . -type f` over
the program root: **44 files, 0 unlisted.** 18 plates covered by the brace
pattern (`shots/current/{…}-{1440,1024,390}.png`), 26 named individually, the
`review/` rows correctly marked "(expected)" — that directory did not exist at
review time. All three `{{ARTIFACT_D}}` / `{{ARTIFACT_A}}` / `{{ARTIFACT_B}}`
slots present. **PASS.**

---

## §7 · Check 7 — prose budget

Counted with my own script: every `<p>` and `<figcaption>` inside `.main`,
excluding tables, blockquotes, the `<dl>`, sheet 18's `<ul class="entries">`,
headings, and runs in the meta face (`.t-head`, `.k`, `.src`, `.grouplabel`) —
the deck's own stated rule.

| sheet | mine | deck | Δ | | sheet | mine | deck | Δ |
|---|---|---|---|---|---|---|---|---|
| 01 | 79 | 80 | −1 | | 10 | 69 | 70 | −1 |
| 02 | **117** | 118 | −1 | | 11 | 76 | 76 | 0 |
| 03 | 51 | 53 | −2 | | 12 | 87 | 89 | −2 |
| 04 | 106 | 111 | −5 | | 13 | 72 | 73 | −1 |
| 05 | 104 | 106 | −2 | | 14 | 71 | 71 | 0 |
| 06 | 71 | 72 | −1 | | 15 | 92 | 95 | −3 |
| 07 | 78 | 79 | −1 | | 16 | 89 | 90 | −1 |
| 08 | 85 | 86 | −1 | | 17 | 19 | 20 | −1 |
| 09 | 88 | 90 | −2 | | 18 | 38 | 39 | −1 |

**Total: mine 1,392 · deck 1,418 · budget 1,600.** Every-rendered-word: mine
3,968 · deck 4,106. Both counts clear their limits by a wide margin and **no
sheet exceeds 120** on either count (max = sheet 02 at 117/118). The 0–5 word
per-sheet gaps are tokenisation convention (hyphens, `5:36 am`, `A/C/D`,
`3·2·1`, `path:line`); the ~3.4% gap on the rendered total is `alt` text, which
is not rendered. **PASS** — the foot comment is honest, `DC-20` is a nit.

---

## §8 · Check 8 — banned words and register voice

Case-insensitive grep over the deck's *face* (SVG, `<script>`, data URIs, HTML
comments and `alt` stripped):

| §9 word | hits on the face | verdict |
|---|---|---|
| `clause library`, `contract builder`, `wizard`, `dashboard`, `badge`, `pill`, `chip`, `modal`, `toast`, `spinner`, `preview panel` | **0** | clean |
| `AI` (word-boundary) | **0** | clean |
| `facet` | 4 | **all four permitted**: (a) `<q>Ready to send · every contractual facet is present.</q>` — quoted defect copy, sheet 15 "Today"; (b)+(c) inside the sheet-15 `<blockquote>` quoting the return act's contracted consequence sentence; (d) the filename `seven-facets-after-return-…png` in the register |
| `Patina` | 1 | quoted shipped copy — "Record a signature received outside Patina", sheet 15 "Today". §9 bans it *inside the paper*; this is a table cell quoting the send sheet |
| `live` | 5 | none inside a paper — "where the acts live" (×2), "live in the margin", "the live alternative", "a live AA failure" |
| `builder`, `composer` | 10 / 12 | §9 scopes these to **specimen** faces only ("specimen faces additionally `builder`, `composer`, `preview panel`"). The deck may name the thing. Verified zero of either in all three specimen files. |

**Register voice:** the eight `<dt>` labels are `Briefing` · `Panel` ·
`Synthesis` · `Specimens` · `Deck` · `Review (expected)` · `Shot ledger` ·
`Plates` — sentence case throughout. **Zero `!` characters on the whole deck.**
No marketing voice: the register's only prose is "eighteen local renders,
uncommitted" and "Every path is repo-relative to the program root … No
production walk was taken", both flat and factual. **PASS.**

---

## §9 · Check 9 — honesty

**Sheet 2 against `shots/current/resting-1440.png`** (opened and read). The
plate shows, left to right: nine rail rows with mono eyebrows and `⋯` menus;
one editor column with the `Services` Playfair-italic heading, the
`Hidden from your client` checkbox, a `BODY` label and one textarea; and an
aside carrying `0 OF 9 PARTS NEED ATTENTION`, `This agreement names no fee. Add
a rate card, a flat fee, or a per-phase fee.`, `Link a client with an email
address.`, then the bordered `THE CLIENT'S COPY · LIVE` card with the title
wrapping to three lines. The top bar independently prints
`0 of 9 parts need attention`. The deck's `alt` text and all three annotations
are **accurate**, including the "twice over" claim, which the plate proves in
one frame. Two things the sheet does not say: the plate carries a full-page
capture artifact — the global `PATINA / DRAFTING …` bar rendered mid-page over
rail rows 8–9 and a floating `ESTIMATE · ROM ESTIMATE` oval over the paper
(`DC-17`) — and the client account in the plate is *unset*
(`Select or invite a client…`), which the ledger records and which is why the
count reads `0 of 9` rather than the screenshot's `2 of 9`.

**Overstatement.** `DC-05` — sheet 16's D row states the R27/R51 risk as
"Wrapper — the cleanest of the four" and the cost caveat as the overlay-vs-route
question, but drops both risks `synthesis.md` §3 names for D: "scroll anchoring
on unfold has **no ambient guarantee** (FS-19, AX-19)" and "the export must
report that a part drew nothing or an unwritten part has no fold (FS-5, FS-6)".
Sheet 6 then asserts the crux flatly — "the part above it holds its position to
the pixel" — on the sheet that sells the pick. The specimen may demonstrate it;
the build has no guarantee, and the deck never says so. `DC-08` — sheet 18's
N-12 says "the empty first-open rail … stand[s]", but its own evidence
(`PROGRAM-REPORT.md:300`) and `current-state.md` §6 row 5 both record M5 as
**confirmed dev-only and closed as W-01 in Wave 2**; a production build painted
all nine rows on first open.

**Understating B — Kody's hunch.** `DC-03`. Kody's ask, on the cover, proposes B
in his own words: "Maybe it is the page and the builder is more of an overlay?"
The deck answers it only once, in sheet 4's tfoot: "B by Kody's ruling". Sheets
11–13 never say B is the shape he asked for; sheet 14's pull argues only D
against A ("A is the faster run, D the surer one") and never weighs B, which the
same sheet's table shows beats today on every crux and which sheet 16 calls
"the only direction that touches no body file at all — zero drift risk, and its
decisive engineering advantage" at the **lowest** cost band of the three built
(M). A reader who came in holding Kody's hypothesis is never told, in one place,
why it lost.

**Deciding what the ruling sheet should ask.** `DC-04` — AR-e's recommendation,
"extend it, with the count moving only alongside a sentence", appears in no
source. `synthesis.md` §8 AR-e states the situation only ("R39 gave the toggle
to the turnkey lane only"); IA-32 proposes moving the control to the row menu
and LH-15 proposes "one list of acts per part". Neither proposes extending the
act beyond design-build. `DC-09` — AR-g's recommendation picks one of the two
options `synthesis.md` §8 offers ("Show a total, **or** say plainly none exists
yet"); framing it as a recommendation is within the sheet's own rule, but the
alternative is not shown.

---

## §10 · Findings

| ID | sev | conf | sheet | claim | evidence | proposed fix |
|---|---|---|---|---|---|---|
| DC-01 | **P1** | high | 01 | "Seven seats · 231 findings · three directions built" | The seven memos carry **240** findings, numbered contiguously 1…N per seat: ED 50 · IA 42 · LH 38 · TY 35 · FS 34 · AX 29 · NO 12 = 240. `grep -cE "^\| (ED\|IA\|TY\|LH\|AX\|FS\|NO)-[0-9]+ \|" panel/*.md` → 240, zero duplicate ids. `memo-editor.md:189` states "**Counts — 50 findings.**" `synthesis.md:3` carries the same wrong 231. | Change to `240 findings` on the cover, and correct `synthesis.md:3` in the same pass. This is the deck's headline credibility number in a deck whose premise is a re-greppable evidence trail. |
| DC-02 | P2 | high | 17 | AR-f evidence given as `specimens/SPEC.md:158` | `specimens/SPEC.md:158` is `color: var(--ink);`. The 1100px page measure the ask is about is `docs/design/house-sheet/SPEC.md:158`. | Write the evidence as `docs/design/house-sheet/SPEC.md:158`; the program root's own `SPEC.md` is a different file and the register names both. |
| DC-03 | P2 | high | 11–14 | B is drawn but never argued; Kody's own hypothesis is answered only by "B by Kody's ruling" (sheet 4 tfoot) | Cover quotes "Maybe it is the page and the builder is more of an overlay?"; sheet 16 gives B the lowest cost band (M) and "zero drift risk … its decisive engineering advantage"; sheet 14's pull discusses only D and A | Add one sentence to sheet 14's pull naming B as the shape Kody proposed and saying in plain words what it costs him — the 390 paper, thirteen mode switches against D's nine — so the hunch is answered, not routed around. |
| DC-04 | P2 | high | 17 | AR-e recommends "extend it, with the count moving only alongside a sentence" | No source proposes extension. `synthesis.md` §8 AR-e states only that R39 gave the toggle to the turnkey lane. IA-32 proposes "Move it to the row menu with the other part-level acts"; LH-15 proposes "One list of acts per part". | Either soften to "the panel does not recommend; IA-32 and LH-15 ask only that the act live with the other part acts", or cite the reasoning that produced the extension. |
| DC-05 | P2 | high | 06, 16 | D's crux is asserted ("holds its position to the pixel") and D's feasibility row carries no risk column entry beyond the wrapper claim | `synthesis.md` §3 D: "**Risk:** scroll anchoring on unfold has no ambient guarantee (FS-19, AX-19), and the export must report that a part drew nothing or an unwritten part has no fold (FS-5, FS-6)" — neither appears anywhere on the deck | Add D's two named risks to sheet 16's D row (they fit the Cost cell's existing "assuming…" register), so the pick carries its own caveats on the sheet that costs it. |
| DC-06 | P2 | high | 18 | The carried list omits the aged-oak contrast item | The plan's outline for sheet 18 names four open items: "W3R2-06, **aged-oak label**, M5, two renderers". N-5, N-12 and N-1 carry three of them; nothing on the deck carries `current-state.md` §6 row 4 — `The client's copy · live` in `--color-aged-oak` `#8B7355` on `bg-white`, **4.48:1**, `agreement-composer.tsx:962` on `:961`, `globals.css:13` — nor `synthesis.md` §1 row 7's 4.20:1 meta voice | Add an N-row: the aged-oak meta voice at 4.20–4.48:1, evidence `globals.css:13` + `agreement-composer.tsx:961-962`, carried with the viewport meta. |
| DC-07 | P2 | high | 18 | N-13's evidence reads `synthesis.md §6 row 2` | `synthesis.md` §6 is Leah's re-walk table; its row 2 is "A · paper is the page". W3R3-03 is `briefing/current-state.md` §6 row 2. `synthesis.md`'s own N-13 writes the bare "§6 row 2" meaning the briefing. | Change to `current-state.md §6 row 2`. |
| DC-08 | P2 | high | 18 | N-12: "The empty first-open rail … both stand" | Its own cited line, `PROGRAM-REPORT.md:300`, says "Confirmed dev-only: a production build painted all nine rows on the first open … (W1 M5, **closed as W-01 in Wave 2**)". `current-state.md` §6 row 5 repeats it. `resting-1440.png` shows all nine rows on first open. | Reword: the renderer pair stands; M5 is closed and dev-only, carried only as the reason the durable fix must not regress. |
| DC-09 | P3 | medium | 17 | AR-g recommends "say plainly that no total exists yet" | `synthesis.md` §8 AR-g offers two: "Show a total, **or** say plainly none exists yet." | Name both options in the ask column so the recommendation reads as a choice made, not the only choice available. |
| DC-10 | P3 | high | 18 | N-7 cited to `00575_agreement_parts.sql:2933-2939` | `:2933-2939` is a comment about `flat, per_phase, percent_of_cost, draws, allowances` reaching the money row "not at all". The scope round-trip is `:2942-2946`; `materialize_standard_parts` is `:3073`. `shots/README.md` gives `:2934-2939`, also short. | Cite `00575_agreement_parts.sql:2942-2946` (projection) and `:3073` (the seeding function); fix `synthesis.md` N-7 in the same pass. |
| DC-11 | P3 | high | 15 | "The two consequence sentences, **verbatim from the build contract**" | The second quote is verbatim in `specimens/SPEC.md`. The first (the nine-part send sentence) is **not** in `SPEC.md`; it is verbatim from `synthesis.md` §5's send-sheet table. `SPEC.md:1163-1164` carry only the six-part and seven-part page-level sentences. | Head the pair "verbatim from the shared treatment", or cite `synthesis.md` §5 for the first and `SPEC.md` for the second. |
| DC-12 | P3 | high | 04 | Crux i, column B: "no body risk, but 480px holds neither draws nor allowances **(ED-43)**" | ED-43 reads: "The rate card's `[minmax(0,1fr)_140px]` leaves the role name ~200px inside the drawer." The draws/allowances sentence is **FS-2**: "B's 480px drawer holds neither draws nor allowances." Inherited from `synthesis.md` §2. | Cite `(FS-2)`, or `(ED-43, FS-2)` as `synthesis.md` §3 does for the same fact. |
| DC-13 | P3 | high | 18 | N-12: "an unset **rate card** prints a line the silent-part rule says should print nothing" | The cited `PROGRAM-REPORT.md:265` names N-i as "an unset **draws** part says `Recorded with your agreement.`". The deck's wording happens to be true — `resting-1440.png` shows Role rates printing that line — but the citation does not support it. | Either cite the plate for the rate-card instance (`shots/current/resting-1440.png`) or restore "draws part" to match `:265`. |
| DC-14 | P3 | high | 04 | Crux i, column C: "head and indent leave ~400px, narrower than today's 524 **(FS-18)**" | FS-18's own text is C's `facet-section.tsx` accordion precedent. The ~400px figure is `memo-feasibility.md` §2 row C — "the editor loses ~120px of measure (524 → ~400 after head + indent)". Inherited from `synthesis.md` §2. | Cite `memo-feasibility.md §2 row C`, or drop the id. |
| DC-15 | P3 | medium | 04 | Crux iii, column C: "the paper becomes an errand behind an act **(NO-12)**" | NO-12 says the opposite in valence: C "gives phone users an explicit 'Preview the client's copy' button leading to a page that's only the paper — **the cleanest separation of the four**", proposed change "None — worth preserving in the build." Sheet 4's crux v cites NO-12 correctly for the same fact. | Keep the fact, drop the id — or mark it as the panel's reading of NO-12's fact, since NO-12's own reading is favourable. |
| DC-16 | P3 | medium | 03 | Footnote: "R21 also survives untouched: an unwritten part prints nothing …, and 'Not yet set' is the paper's own wording. **Every specimen state proves it on the Role rates part.**" | `SPEC.md:667` — Role rates is "**unwritten** in resting and clause … an unwritten part draws nothing on the paper". `SPEC.md:668-669`, `:1162` — `Not yet set` is proved on **Ceiling** and **Furnishings deposit**, not Role rates. Sheet 5 says so correctly: "Role rates is unwritten, so the paper prints nothing." | Split the sentence: Role rates proves the draws-nothing half; Ceiling and Furnishings deposit prove `Not yet set`. |
| DC-17 | P3 | high | 02 | The plate is captioned only "The resting room, 1440 CSS px" | `resting-1440.png` carries a full-page-capture artifact: the global `PATINA / DRAFTING / Library / People / The Scans / Ledgers / Find anything / HANDS FREE / THE POST` bar painted across the middle of the page over rail rows 8–9 and the paper, plus a floating `ESTIMATE · ROM ESTIMATE` oval over the client copy. Neither is part of the room. | Add four words to the `.src` run — "app chrome is a full-page capture artifact" — so a reader does not take the mid-page bar for the room's own furniture. |
| DC-18 | P3 | medium | 03 | R4's "What it forbids" cell: "A layout that cannot show a ceiling blocker while the rate card is being written." | R4's text (`rulings-2026-09-06.md:10`) is the floor only; the forbidden layout is the panel's inference from it, sound but not R4's words. Same shape in the R27/R51 and house-sheet rows, where the inference is closer to the source. | Head the column "What it forbids **here**" so the inference is visibly the panel's. |
| DC-19 | P3 | low | 03 | The "five words" row names no ruling, while R4 and R27/R51 are named on the same table | The five words are R7 (`rulings-2026-09-06.md:13`) restated by R138 (`DECISIONS.md:10749-10757`); the "no ruling number on the studio's face" forbid is R38 (`:75`) | Either name `R7 / R138` and `R38` in the id column for consistency, or drop the ids from the other two rows. |
| DC-20 | P3 | high | foot | "TOTAL PROSE 1,418 words"; "Every rendered word … 4,106" | Independent count: 1,392 prose (0–5 words per sheet lower) and 3,968 rendered (`alt` text excluded, which is not rendered). Both claims clear their limits either way; no sheet exceeds 120 on either count. | No change required; if the numbers are re-stated, say which tokenisation was used. |
| DC-21 | P3 | low | 15 | Dismiss act "After: **Not yet** (IA-38)" | IA-38's own proposed change is "One word for leaving"; the specific string `Not yet` is `synthesis.md` §5's. | Cite `synthesis.md §5` alongside IA-38, or leave — the id is the reason, the string is the treatment. |
| DC-22 | P3 | medium | 16 | `PartEditorBody:156` in D's "Reused unchanged" | `part-editor.tsx:156` is `{RECORD_ONLY_HELP}` inside the record-only `<p>`. `PartEditorBody` is declared at `:162` and mounted at `:146`. Copied verbatim from `memo-feasibility.md` §2 row D. | `PartEditorBody:162`. |
| DC-23 | P3 | medium | 16 | `refusalMessage:114` sits in a cell whose only named file is `commercial-documents.ts` | `refusalMessage` is `agreement-composer.tsx:114`; `commercial-documents.ts` has no such symbol. | Write `agreement-composer.tsx:114`. |
| DC-24 | P3 | low | 18 | `library-off.test.tsx.snap` | Real path `__tests__/__snapshots__/agreement-composer-library-off.test.tsx.snap`; the second suite is `agreement-composer-design-build-off`. The figures (10 calls, 3,111 lines) verify exactly. | Name both files, or keep `synthesis.md`'s leading ellipsis so the truncation is visible. |
| DC-25 | P3 | medium | 14 | "It takes four of the seven first places; **the two seats that rank it lower** rank on cost and on a leak" | Three seats do not rank D first — IA (`A>D>B>C`), FS and NO. `synthesis.md` §6 says it correctly: "D takes four of seven first places (ED, TY, LH, AX) **and is second on IA**; the two seats not ranking it first rank on cost (FS) and on a leak". | Restore "and is second on IA" — the sentence is one clause short of true. |

---

## §11 · Verdict

**FIX.**

**P1: `DC-01`** — the cover's "231 findings" is wrong; the memos carry 240.

Eight P2 (`DC-02` … `DC-08`, and `DC-03` on B) must be fixed or ruled out in
writing before delivery: one wrong-file evidence path on a ruling ask, one
unsourced recommendation, D's two dropped risks, the omitted aged-oak register
item, one wrong-document citation, one closed item reported as standing, and
Kody's own hypothesis left unanswered in prose.

Sixteen P3 are citation hygiene, id attribution and one plate caption. None of
them changes an argument.

Everything else passes: the ask is byte-identical, the eighteen sheets carry the
plan's assigned content, the criteria table and Leah's table and the send-sheet
before/after match synthesis cell for cell, the cost bands come only from
`memo-feasibility.md` §2, the ruling sheet asks, the register is complete, the
prose budget holds with room to spare, the banned-word greps are clean, and no
specimen face carries a ruling id.
