# Re-review 03 — specimens, design

Second adversarial pass on the **current** `specimens/direction-1.html`,
`direction-2.html`, `direction-3.html`, after the fixes logged in
`review/02-fix-log-direction-{1,2,3}.md` under the orchestrator's rulings.
Same reviewer as `01b`; fresh renders and fresh measurements. No specimen
edited.

**How the pixels were made.** All three files re-rendered by me with
`portal-polish-review-2026-09-08/tools/render.mjs` at 1440 / 1024 / 390,
states `resting | clause | money`, light and dark — 54 plates under
`$TMPDIR/rr/`, every one read. Chromium again needed the sandbox lifted
(`mach_port_rendezvous`: Permission denied). Every claim below is a
measurement: DOM-ancestry leak probes against the elements that actually paint
`--paper-doc`, act censuses by computed style, real `Tab` walks, hit-testing,
segment-gap and reflow measurement, and a full AA sweep in both themes.

**The NO-4 probe was rewritten** as direction-2's fix log asks: "is this node
inside any element painting the paper stock", not `article.paper.contains()`.
Direction-1 now paints six `article.paper` segments, direction-2 five
`div.sheet-seg`, direction-3 one `article.paper`; the probe finds them all.

---

## §0 · Gate, re-run

| | direction-1 | direction-2 | direction-3 |
|---|---|---|---|
| Shared-block three-way diff | — | — | **`SHARED BLOCK IDENTICAL`** |
| `box-shadow` / `drop-shadow` | 0 | 0 | 0 |
| native `disabled` | 0 | 0 | 0 |
| `contenteditable` / `text-overflow` / `line-clamp` | 0 | 0 | 0 |
| rendered `font-size` ≤ 10px | 0 | 0 | 0 |
| `opacity` carrying a state | 0 | 0 | 0 |
| `position: sticky\|fixed`, zoom block | 0 | 0 | 0 |
| `--oak` on a `color` declaration | 0 | 0 | 0 |
| external URL not `fonts.g` | 0 | 0 | 0 |
| `autofocus` attribute | 0 | 0 (1 hit, inside a comment) | 0 |
| `<h1>` / `lang="en"` / `facet` | 1 / ✓ / 1 | 1 / ✓ / 1 | 1 / ✓ / 1 |
| §7 banned words on the face | 0 | 0 | 0 |
| Size | 64,349 B | 55,685 B | 53,536 B |
| Horizontal overflow, 9 plates | none | none | none |
| console errors / warnings | 0 / 0 | 0 / 0 | 0 / 0 |

**AA sweep — every visible text node against its nearest painted ground, three
states × light and dark: zero failures in all three files.**
**Off-scale type — zero in all three files**, in every state and both themes
(was two elements in direction-1). The seven steps plus `.t-money`,
`.consequence` at 15px, and nothing else.

---

## §1 · Every SD- finding, disposed

**CLOSED 24 · STILL OPEN 2 (both reduced, P3) · DECLINED-ACCEPTED 7.**

| ID | Sev (01b) | File | Disposition | Evidence |
|---|---|---|---|---|
| SD-01 | P3 | all | **CLOSED** | The three-way diff prints `SHARED BLOCK IDENTICAL`. |
| SD-02 | **P1** | d1 | **CLOSED** | Leak probe: `[]` at 1440/1024/390 × resting/clause/money — no studio node inside any element painting the paper stock. At 390 the sheet ends, the `--rail` strip prints, the sheet resumes (`direction-1-resting-390.png`). At 1440 the strips are marginalia in the 192px column. |
| SD-03 | P2 | d3 | **CLOSED** | The rest row is in the studio band above the paper at rest and inside the drawer under its own Role-rates row when open; leak probe `[]` at all nine combinations (`direction-3-clause-390.png`). |
| SD-04 | **P1** | d1, d2 | **CLOSED** | The paper's `innerText` contains no `Not written yet` and no `Role rates` heading in resting or clause, in either file, at any width. d1's sheet runs Exclusions → seam → seam → Ceiling (`direction-1-resting-1440.png`); d2's Role-rates segment is `display: none` until money. |
| SD-05 | P2 | d1, d2 | **CLOSED** | `Creates authority` is off the paper stock in both; it prints in the five studio strips of the five schedule parts. Probe: absent from ground `innerText` in all nine combinations. |
| SD-06 | **P1** d2 / P2 d1 | d1, d2 | **CLOSED** | Visible mono-caps acts painted on the sheet at 1440 resting: **d1 18** (10 seams + 8 `WRITE`, was 29) · **d2 9** (seams only, was 37) · d3 0 mono-caps, 8 inline `Edit this part`. d2's paper at rest carries nothing but nine quiet seam words. Residual noted in §3 craft, not a violation: d1 still prints a `WRITE` act on every part head, which ruling 4 explicitly sanctions. |
| SD-07 | P2 | d1 | **CLOSED** | `.part__head` is a plain `<h3 class="t-d3">` (computed: Playfair Display 20px, `text-transform: none`, not a control); the `.part__head .act` override rule is gone; the fold act is a separate `.act--tertiary` in DM Mono 13 caps. |
| SD-08 | P2 | d1 | **CLOSED** | Off-scale probe returns `[]` in all three files, all states, both themes. `SAVE AS TEMPLATE…` and `RETURN TO THE SEVEN FACETS` now set in the tier's own type. |
| SD-09 | P2 | d1 | **CLOSED-amended** | Editor measures **670 / 614 / 308**, equal to the printed part's own text measure at each width. Ruling 5 redefines the SPEC's 720 as the *column*, not the text. I accept it — the claim the crux needs is "the editor equals what the paper prints", and that is now measurably true. **The deck's fold note must read 670 / 614 / 308, not 720 / 664 / 358.** |
| SD-10 | P2 | d2 | **CLOSED-amended** | **622 / 614 / 308**, measured identical for `.money-rows`, `.field-grow` and the printed `p` at each width. Same amendment: the deck must read 622 / 614 / 308. |
| SD-11 | P3 | d3 | still true, informational | Drawer money column 431px inside 432 usable. |
| SD-12 | P2 | d1 | **CLOSED** | Inter-part gaps measure `[48,48,96,48,48,48,48]` — all on the 24px module (96 = 2×48 where the unwritten part collapses to two seams). |
| SD-13 | P2 | d1 | **STILL OPEN (reduced to P3)** | Strips now anchor to the part and each names it in words, so nothing is mislabelled — but at 1440 in resting and clause four of five drift below their parts: Ceiling ≈ +216px, Furnishings deposit ≈ +205, Retainer ≈ +185, Billing cadence ≈ +116 (`direction-1-resting-1440.png`). The fix log discloses this in its §4 and d2 discloses its own (0 / 243 / 208 / 177 / 59 resting, 0 / 0 / 70 / 39 / 0 money). Honest, drawn, and still the weakest thing in D's margin. |
| SD-14 | P2 | d1 | **CLOSED** | `clause → money` now writes string #15 (`Role rates name the fee. One thing left: name a ceiling.`) in all three files; `resting → money` writes #14. |
| SD-15 | P3 | d2, d3 | **DECLINED — accepted** | It is a property of `render.mjs` (fresh context per state), not of any file. **Accepted**; the fix is a deck caption or a fourth captured state, and the deck's argument rests on that sentence, so the caption should not be optional. |
| SD-16 | P2 | d1, d2 | **CLOSED** | `.record` count = 1 in every state at every width in all three files, carrying the per-state suffix. |
| SD-17 | P3 | all | **CLOSED** | d2 now uses `&rsquo;` / `&hellip;` in visible copy; the three files punctuate alike, and the only straight apostrophes left are in comments and JS. |
| SD-18 | P3 | d3 | **CLOSED — SPEC amended** | The strip keeps `Direction III · The drawer as an overlay`; the SPEC §3 / §7 contradiction is recorded in the fix log's §3.4. |
| SD-19 | **P1** | d3 | **CLOSED** | `[role="status"]` count = 1 everywhere, **visible at 390 in clause and money**, relocated (never duplicated) to the drawer's head. Read in `direction-3-clause-390.png` and `-money-390.png`. |
| SD-20 | **P1** | d3 | **DECLINED (ruling 2) — accepted, with a condition** | At 390 in clause and money the drawer is the whole sheet, so the send act goes with the paper: probe `sendActs: []`, `returnActs: 0`. **I accept the reason** — the send belongs to the paper, and the two things a designer must not lose are carried: the readiness sentence (SD-19) and `← Back to the paper`. **The condition:** this is now a *scored cost on crux (v)*, not an exemption. §8 check 13 fails for direction-3 in 2 of its 9 plates and passes in 9 of 9 for the other two; the deck must print that difference rather than let B's 390 read as equivalent. |
| SD-21 | P2 | d1, d2 | **CLOSED** | Return act present at 1440, 1024 **and** 390 in every state in both files (probe `returnActs: 1` × 9 each), with `Press and hold to return` beneath it. |
| SD-22 | P2 | d1, d2 | **CLOSED** | `.consequence` above the return act measures 529.9px / 4 lines at 1440 and 1024, 358px / 6 lines at 390 — the §A6 56ch cap, at the paper's measure (was 192px / 10 lines and 168px / 13 lines). |
| SD-23 | P2 | d2 | **CLOSED** | The outline disclosure sits above the paper at 390 and 1024 (`direction-2-resting-390.png`: `▸ THE PARTS` above the sheet). |
| SD-24 | P2 | d3 | **CLOSED** | Drawer money field measures **117px = 13ch**, its right edge flush with the `.money-rows` rule (offset 0px) at both 1440 and 390. The `$` and its figure read as one. |
| SD-25 | P3 | d3 | **DECLINED — accepted** | Nine seam acts inside the drawer would rewrite B's placement model, not fix a defect. **Accepted**; it is a §5 #32 amendment for the panel. |
| SD-26 | P3 | d1, d2 | **CLOSED** | d1 shows 10 seams in every state; d2 shows 9 at rest and 10 in money — 9 because a part that prints nothing prints no seam either, which its fix log explains and which is the right reading of R21. |
| SD-27 | P3 | d3 | **DECLINED — accepted** | `Edit the parts` is the documented focus-restore target; hiding it mid-session drops focus to `<body>`. **Accepted** — the keyboard contract outranks the cosmetic double door. |
| SD-28 | P3 | d3 | **DECLINED — accepted** | Reserving the band's height means printing an empty studio band, which §A10 and NO-4 both argue against. **Accepted.** |
| SD-29 | P3 | all | **CLOSED (d1, d2) · DECLINED — accepted (d3)** | d1 removed `autofocus` and added `scroll-margin-top`; d2 uses `focus({preventScroll:true})` then moves to the part. d3 declines because `preventScroll` would leave the caret off-screen — **accepted**, that is the worse failure. |
| SD-30 | P3 | d1 | **CLOSED** | String #20 present as an authored comment. |
| SD-31 | P3 | all | **DECLINED — accepted** | The fix is a `--paper-doc` change inside the shared block, which SPEC §1 forbids. **Accepted as an amendment ask** — and it should actually be put to the panel: in dark, the field's ground sits 1.03:1 against the paper and only the `--ink-faint` baseline rule says a field is there (`direction-2d-money-1440-dark.png`). |
| SD-32 | P3 | all | **DECLINED — accepted** | Stepping one file's headline breaks the one-room diff. **Accepted**, and still true in all three: the `<h1>` and the paper's headline both set `.t-d2` Playfair 26. It needs a ruling applied to all three, not a decline that ends the matter. |
| SD-33 | P3 | d1 | **CLOSED** | The whole `.part__head .act` rule is gone. |

---

## §2 · New findings

| ID | Sev | Conf | File | State / width | Claim | Evidence | Proposed fix |
|---|---|---|---|---|---|---|---|
| SD-101 | P2 | high | direction-1, direction-2 | money / 1440 | **The "one continuous sheet at 1440" holds at rest and breaks while a part is being written.** Measured vertical gaps between consecutive paper-stock segments at 1440: resting `[0,0,0,0,0]` (d1) and `[0,0,0,0]` (d2) — one sheet ✓; money `[…,12,12,72,…]` (d1) and `[…,12,12,150,…]` (d2) — page ground shows through between segments. The paper reads as a stack of cards in exactly the state the deck argues from. | Segment-gap probe (elements painting `--paper-doc`, sorted by top); `direction-2d-money-1440-dark.png` — the band of page ground between the Retainer and Billing-cadence segments | Give the segments a shared background at ≥1248px (one painted parent, segments transparent), or set the inter-segment gap to 0 in every state and let the margin absorb the strips' height. |
| SD-102 | P2 | high | direction-1, direction-2 | resting, clause / 390 | **At 390 the paper is cut into one-part fragments by five studio strips, four of which carry only a part name and `Creates authority`.** A three-line `--rail` box whose entire payload is two words of metadata is close to §A10's "a region with nothing to say renders nothing" — and in direction-1 it repeats the part's own Playfair heading 20px below it, so a reader sees `Ceiling` in the studio's box and `Ceiling` on the paper in succession. Six grey boxes interleave with four sheet fragments down one 9,694px page. The NO-4 fix has been paid for with the paper's continuity. | `direction-1-resting-390.png`, `direction-2-resting-390.png`; segment-gap probe at 390 `[314,162,150,150,150]` (d1), `[419,146,146,146]` (d2) | Print a standing-only strip once, as a single studio run below the paper at 390 (or fold `Creates authority` into the outline row, which NO-4 does not forbid), and reserve the interrupting strip for a part that actually has a sentence to say. d2's `.t-head` part name is the better of the two treatments — d1 should at least stop repeating the paper's own heading verbatim. |
| SD-103 | P2 | high | direction-1 | all states / all widths | **Focusing a move act reflows the paper by 44px.** `.part__acts { height: 0; overflow: hidden }` with `:focus-within { height: auto }` keeps 18 focusable 44×44 controls collapsed until focused; measured, Terms moves +44px when the first `Move up` takes focus. d2 (`display: none` until the part is selected) and d3 (inside the closed drawer) both measure **0px**. The reveal itself is legitimate — focus-revealed, never hover-revealed, check 17 clean — but D's own argument is that the reading position does not move, and this is the one place it does, on a keyboard walk. | Reflow probe (`Terms` document top before/after `mv.focus()`): d1 **+44**, d2 0, d3 0; hit-test before focus returns `SECTION.part`, after focus returns the act's own label | Reserve the row (`visibility: hidden` on a 44px box, or `display: none` + selection as in d2), so revealing it costs no layout. |
| SD-104 | P3 | high | direction-1 | resting, clause / 1440, 1024 | Where the unwritten part prints nothing, the two seams around it stack 34px apart with nothing between them, so the sheet shows `+ ADD A PART` twice in succession — it reads as a duplicated control rather than as two places to add. At 390 the Role-rates strip separates them and it reads correctly. | `direction-1-resting-1440.png` (seams at y≈878 and y≈912) | Collapse consecutive seams to one where the part between them prints nothing, or carry a hairline of the part's absence between them. |
| SD-105 | P3 | medium | direction-2 | money / 1440, 1024 | `Done writing` — the act that ends the edit — sits in the right-margin strip, roughly 460px from the field it commits, while `Move up` / `Move down` for the same part sit on the paper beside it. Two halves of one part's controls in two registers. | `direction-2d-money-1440-dark.png` (strip at x≈712, field at x≈256) | Put `Done writing` under the field, where the hands are; leave the strip its standing and its blocker. |
| SD-106 | P3 | high | direction-3 | clause, money / 390 | `← Back to the paper` is now the drawer's **last** act; SPEC §5 #31 pins it as "the drawer's first act at 390". Ruling 2 gave the head to the readiness region, so the SPEC string's placement is superseded — recording it so the SPEC, the deck caption and the file agree. | `direction-3-clause-390.png`; fix log §3.1 | Amend §5 #31's placement note. |
| SD-107 | P3 | medium | direction-1, direction-2 | resting / 390 | Six `THE STUDIO` running heads print down one page (readiness plus five strips). §5 #21 mandates the head "on every `.studio-note`", so the files are compliant — but repeated six times in a column it reads as a stamp rather than a register. Raising it as an amendment ask, not a defect. | `direction-1-resting-390.png`, `direction-2-resting-390.png` | Print the running head once per run of adjacent strips. |

---

## §3 · Craft, re-read

**What the rulings bought.** All three papers are now clean of studio ink: the
leak probe returns `[]` for every file at every width in every state, and no
paper prints a heading or a sentence for a part that has nothing to say. The
send act, its consequence, the return act, its consequence and the hold caption
now sit at the paper's measure at every width in direction-1 and direction-2 —
the two worst typographic failures of the first pass (a 15px sentence in a
168px column, 13 lines deep) are gone. Type is clean: zero off-scale steps,
zero AA failures, light and dark. Measures are honest: the editor equals what
the paper prints, to the pixel, in both galley-family directions.

**What the rulings cost.** Segmenting the sheet so the strips can sit outside it
is the price, and it is visible: gaps open between segments at 1440 while a part
is being written (SD-101), and at 390 the paper becomes fragments separated by
boxes that are mostly metadata (SD-102). Direction-3 pays none of this — it
never needed to segment anything, because its studio chrome was already in a
drawer.

**Form or paper, re-counted.** Visible acts painted on the sheet at 1440
resting: **direction-2 = 9** (nine quiet seam words, nothing else) ·
**direction-3 = 8** (inline `Edit this part`, sentence case, in the paper's own
type) · **direction-1 = 18** (ten seams plus a `WRITE` act on every part head).
Direction-2's resting paper is now the closest thing in the set to a document
someone would sign.

**Keyboard.** Direction-2's model is the best of the three and worth naming: each
`section.part` carries `tabindex="0"`, `focusin` selects it, and its acts appear
— so a Tab walk reads `Services (the part) → WRITE THIS PART → MOVE UP → MOVE
DOWN → Deliverables (the part) → …`, with zero reflow. Direction-1 reaches the
same acts by plain Tab from load but pays 44px of reflow each time (SD-103).
Direction-3's live only in the drawer, which is correct for its model.

---

## §4 · The seven cruxes, refreshed

| Crux | D · direction-1 | A · direction-2 | B · direction-3 |
|---|---|---|---|
| **i · money, body unforked** | **PROVEN** — unfolds beneath the printed part at **670 / 614 / 308**, equal to the printed part's own measure (`money/1440`, `/1024`, `/390`). | **PROVEN** — takes the part's place at **622 / 614 / 308**, measured identical to the printed prose at each width (`money/1440`, `/1024`, `/390`). | **PROVEN** — 431 in 432 usable, 13ch field flush to the drawer's rule, typed and printed in the same frame (`money/1440`). |
| **ii · keyboard reorder, add** | **PROVEN** — 10 persistent seams, move acts reachable by plain Tab from load, reorder announces position (`resting/1440`). Costs 44px of reflow (SD-103). | **PROVEN** — 9/10 seams, acts revealed by selection, Tab walk `part → WRITE THIS PART → MOVE UP → MOVE DOWN`, **0px reflow** (`resting/1440`). | **PROVEN** — move acts on every drawer row at 72×44 when open, keyboard-reachable (`money/1440`, `/390`). |
| **iii · 390** | **PROVEN** — strips print outside the sheet on `--rail` with their own running head; leak `[]` (`resting/390`, `money/390`). Marred by SD-102. | **PROVEN** — readiness band and outline above the paper, strips interrupt from outside; leak `[]` (`resting/390`). Marred by SD-102. | **PARTLY** — readiness at the drawer's head ✓, `← Back to the paper` ✓, paper honestly gone — but the send and return acts go with it (SD-20). |
| **iv · readiness in place** | **PARTLY** — both notes swap, `#room-status` moves, #15 fires; strips name their parts, but four of five drift 116–216px at 1440 resting (SD-13). | **PROVEN** — strips anchored and named, drift 0–70px in money, band at 390, #15 fires (`money/1440`, `resting/390`). | **PARTLY** — band above the closed paper ✓, blockers inside the drawer ✓, but §3 B(iv)'s requirement that the sentence **name the part** when the count moves is still unmet and was not addressed. |
| **v · where the acts live** | **PROVEN** — send on the page and return + consequence + hold caption at the page foot, at 1440, 1024 **and** 390, in all three states (probe ×9). | **PROVEN** — identical (probe ×9). | **PARTLY** (was NOT PROVEN) — send, return and hold present at 1440, 1024 and `resting/390`; all three absent at 390 in clause and money by ruling 2. Check 13: 9/9 for D and A, **7/9 for B**. |
| **vi · R27 / R51 same body** | **PROVEN** — plain `<h3>` per part, one head, editor beneath the section, nothing studio-side on the stock, and nothing printed for an unwritten part. | **PROVEN** — the chrome renders the printed section *or* the field, never both, never asks the body for a slot; the resting sheet carries only seams. | **PROVEN** — the paper is the read-only render plus one `.act--inline` per part; no body file touched. |
| **vii · what it removes** | **PROVEN** | **PROVEN** | **PROVEN** — and still honestly: nothing removed, only relocated. |

**Score: A 7 PROVEN · D 6 PROVEN + 1 PARTLY · B 4 PROVEN + 3 PARTLY.**

---

## §5 · Verdicts

| File | Verdict | P1s open |
|---|---|---|
| `direction-1.html` (D · the galley) | **PASS** | none — SD-02, SD-04, SD-05, SD-06 all closed |
| `direction-2.html` (A · the paper is the page) | **PASS** | none — SD-04, SD-06 closed |
| `direction-3.html` (B · builder as overlay) | **PASS** | none — SD-19 closed; SD-20 declined by ruling 2, accepted as a scored cost on crux (v), not an exemption |

All five P1s from review 01b are answered. What remains is three P2s
(SD-101, SD-102, SD-103) and eight P3s; SD-101 and SD-102 are shared
consequences of the segmentation the NO-4 ruling required, and are the only
findings I would hold a build wave for.

---

## §6 · Which direction the fixed specimens argue for

**The fixed specimens argue for A, not D.** Direction-2 is now the only file to
prove all seven cruxes: its editor measures exactly what its paper prints
(622 / 614 / 308), its resting sheet carries nine quiet seam words and nothing
else — the cleanest paper of the three — its studio strips sit level with the
parts they name and drift at most 70px where D's drift 216, its keyboard model
reveals a part's acts by selection at zero reflow where D's costs 44px, and it
carries send, return and the hold caption at all three widths where B loses two
of them at 390. **That does not match synthesis §6's pick of D**, and the gap
has widened rather than closed: D and A were separated in §6 by one sentence —
whether the sentence you are rewriting is still on screen — and on the fixed
plates that single trade is now the *only* thing D wins, while A wins the
measure, the margin's alignment, the keyboard, the reflow and the quietness of
the sheet. **This also reverses my own first reading**, which favoured B: the
rulings took the two things B was uniquely winning — studio chrome off the
paper and readiness placed with its own register — and gave them to D and A,
while B's 390 cost stayed where it was; the ruling sheet should decide AR-a
knowing that the specimens now rank A ahead of D on six of seven cruxes and
that Leah's "I do not want the printed part replaced" is the whole of D's
remaining case.

---

# Round 2 — D (`direction-1.html`) only

Final spot-check after the round-2 fixes logged in
`02-fix-log-direction-1.md`. Direction-1 re-rendered by me — 3 states × 3
widths, light, `$TMPDIR/r2/` — and re-measured. Scope: SD-101, SD-102, SD-103,
SD-104, SD-107.

**The segment probe was corrected.** The fixer's dispute is right and I accept
it: my round-1 probe selected *every* element painting `--paper-doc`, and
`.field-control` paints `--paper-doc` too. It matched 5 elements in `resting`
and 9 in `money` — the four extra were the money fields. Restricted to
`article.paper`, the numbers below are the sheet's own.

## Dispositions

| ID | Sev | Disposition | Evidence |
|---|---|---|---|
| **SD-101** | P2 | **CLOSED — finding withdrawn as my measurement error** | Inter-segment gaps on `article.paper` at 1440: `[0,0,0,0]` resting · `[0,0,0,0]` clause · `[0,0,0,0,0]` money. The sheet is one sheet in every state. I also decline the fixer's alternative on their behalf for the same reason they give: a single painted parent would make the strips descendants of the paper stock and re-open SD-02, which is the higher constraint. **Carry-over:** the identical probe flaw (5→9 elements) produced SD-101's direction-2 numbers, so that half should be presumed withdrawn too, pending a `.sheet-seg`-only measurement. |
| **SD-102** | P2 | **STILL OPEN — at 1024 only** | **390 is fixed:** strips drop from 5 to **2** (resting/clause) and **3** (money), **no name-only strip renders**, the four standings gather into one run (`THE STUDIO · CREATES AUTHORITY · Role rates · Ceiling · Furnishings deposit · Retainer …`), and the sheet rejoins everywhere else — gaps `[281,0,0,0,0]` resting/clause, `[185,171,0,0,0]` money. **1440 never had it** (strips are margin, gaps 0). **1024 is untouched:** the fix is scoped `@media (max-width: 767px)`, so at 1024 all five strips still render, **four carrying only a part name and `Creates authority`**, and the sheet is six fragments separated by **289 / 158 / 146 / 146 / 146 px** of page ground — each grey box printing `CEILING` in `.t-head` directly above `Ceiling` in Playfair. `d1r2-resting-1024.png`. |
| **SD-103** | P2 | **CLOSED** | Reflow on revealing a move act (`#part-terms` document top, before → after focus): **0px at 1440, 1024 and 390 × resting, clause and money — 9 of 9.** `visibility: hidden` reserves the box, so the reveal is a paint. |
| **SD-104** | P3 | **CLOSED** | A part that prints nothing prints no seam: seam count **9** at rest, **10** in money. One seam between Exclusions and Ceiling; the doubled `+ ADD A PART` is gone. |
| **SD-107** | P3 | **CLOSED as reduced** | At 390 resting the page carries **3** `THE STUDIO` heads, not six (readiness, the Role-rates strip, the studio run). Still five at 1024 — folded into SD-102. §5 #21 compliance is intact; "print it once per run" stays an amendment ask. |

## New findings

| ID | Sev | Conf | State / width | Claim | Evidence | Proposed fix |
|---|---|---|---|---|---|---|
| **SD-108** | P2 | high | all states / all widths | **Round-2 regression: the move acts can no longer be reached by forward Tab.** DOM order inside the head row is now `Move up → Move down → Write`. While the part does not hold focus the group is `visibility: hidden`, so Tab skips both and lands on `WRITE`; `:focus-within` then reveals them — but *behind* the caret, so the next Tab goes forward to `+ ADD A PART`. Traced: `WRITE → TAB → + ADD A PART → TAB → WRITE`; only `WRITE → SHIFT-TAB → MOVE DOWN → SHIFT-TAB → MOVE UP` reaches them. In round 1 a plain forward Tab walk found them. `mv.focus()` in `resting` is a no-op (`isActive: false`) — `tabIndex: 0` is not reachability when the element is `visibility: hidden`. SPEC §4 D's keyboard model pins `head toggle → Move up → Move down → seam act`. | Tab trace at 1440 in `resting` and `money`; forward walk of 60 tab stops from load never yields `MOVE UP` | Put the move acts **after** `Write` in DOM order and restore the flush-right look with `order:` / `flex-direction: row-reverse`. Focusing `Write` then reveals them and the next Tab reaches them. |
| **SD-109** | P2 | high | resting, clause / 1024, 390 | **An empty bordered rectangle renders where the unwritten part would print.** The Role-rates sheet segment draws its box with no content: measured **50px tall at 1024** and **49px at 390**, `innerText.length === 0`, 1px rules. §A10 is explicit — "Never a rectangle… A region with nothing at all to say renders nothing (no heading, no rule, no zero)." At 1440 the same segment collapses to 0px with no borders and is harmless. | Empty-segment probe (`article.paper` with zero text): `[{h:50,txt:0,border:"1px/1px"}]` at 1024 resting, `[{h:49,txt:0,border:"1px/0px"}]` at 390 resting; visible in `d1r2-resting-1024.png` between the Role-rates strip and the Ceiling strip | Collapse the segment to 0px with no borders below 1248, as it already does at 1440. |

## D's refreshed crux row

| Crux | D · direction-1, round 2 |
|---|---|
| **i · money** | **PROVEN** — 670 / 614 / 308, equal to the printed part's own measure (`money/1440`, `/1024`, `/390`). |
| **ii · keyboard reorder, add** | **PARTLY** (was PROVEN) — 9/10 persistent seams ✓, reorder works and announces ✓, but the move acts are reachable only by Shift+Tab (SD-108), so SPEC §4 D's forward keyboard model is not met. |
| **iii · 390** | **PROVEN, and improved** — leak `[]`, strips outside the sheet, reduced to 2–3, the sheet rejoining at every other junction (`resting/390`, `money/390`). |
| **iv · readiness in place** | **PARTLY** — notes swap, `#room-status` moves, #15 fires; at 1024 and 390 the strips now sit exactly with their parts, but at 1440 four of five still drift 116–216px (SD-13). |
| **v · where the acts live** | **PROVEN** — send, return, consequence and hold caption at the paper's measure at all three widths in all three states (`conseq: 2` × 9). |
| **vi · R27 / R51** | **PROVEN** — plain `<h3>`, one head per part, nothing studio-side on the stock (`onSheet: []` × 9), nothing printed for an unwritten part. Qualified by SD-109: the *box* still prints below 1248. |
| **vii · removes** | **PROVEN.** |

**5 PROVEN · 2 PARTLY** (was 6 PROVEN · 1 PARTLY before round 2 — crux (ii)
moved backwards).

## Final verdict — direction-1

**FIX.** No P1 is open, and the round-2 pass genuinely closed four of the five
findings put to it — SD-101 was my error, SD-103, SD-104 and SD-107 are clean,
and the 390 treatment is now the best of the three specimens. What holds the
verdict is that **round 2 introduced a keyboard regression on a crux**
(SD-108) while fixing a layout one, and that the two remaining defects
(SD-102, SD-109) live in the **1024 band the round-2 media query did not
reach** — the fix was written at `max-width: 767px` and the middle band still
shows six sheet fragments, four two-word strips, and an empty ruled rectangle.
All three are small and local: one DOM reorder inside the head row, and
extending the `≤767` strip rules and the segment collapse up to `≤1247`.


---

# Round 3 — D (`direction-1.html`) only

Direction-1 re-rendered by me at **1024 and 390, all three states**
(`$TMPDIR/r3/`), plus 1440 kept as the control. Head-row tab order traced with
real key presses at all three widths; hidden-focusable elements counted and
compared against direction-2 and direction-3.

## Dispositions

| ID | Sev | Disposition | Evidence |
|---|---|---|---|
| **SD-102** | P2 | **CLOSED** | The strip rules now reach the middle band. At **1024**: strips drop from five to **2** (resting/clause) and **3** (money); **no name-only strip renders at any width below 1248**; the four standings gather into one run below the paper (`THE STUDIO · CREATES AUTHORITY · Role rates · Ceiling · Furnishings deposit · Retainer · Billing cadence`). Segment gaps `[260,0,0,0]` resting/clause and `[185,171,0,0,0]` money — one interruption where a strip has words to say, every other junction closed. 390 unchanged and still correct (`[281,0,0,0]`). `d1r3-resting-1024.png` shows two sheet fragments, not six. |
| **SD-108** | P2 | **CLOSED** | Head-row tab order traced at **1440, 1024 and 390**, identical at each: `WRITE[55×44] → MOVE UP[72×44] → MOVE DOWN[89×44] → + ADD A PART[115×44]`. A forward-Tab walk from load reaches `MOVE UP` at all three widths (`true / true / true`; was `false`). The DOM, visual and tab orders now agree, and the move acts are reached going forward rather than only by Shift+Tab. |
| **SD-109** | P2 | **CLOSED** | The unwritten part's segment now measures `h: 0px, border-top: 0px, border-bottom: 0px` at **1024 and 390** (was 50px and 49px with 1px rules), matching the 1440 behaviour. Segment count at rest drops 6 → 5. No empty ruled rectangle renders at any width. §A10's "never a rectangle" is met. |

## New findings

**None.** Two things checked and cleared:

- **Hidden-focusable elements.** The ghost that reserves the move-act box could
  have left invisible controls in the tab order. It does not: every element
  matching "`tabIndex ≥ 0`, not itself `display: none`, zero-size or
  `visibility: hidden`" is either inside a `[hidden]` ancestor (closed folds,
  the collapsed outline) or inside a `display: none` parent — `focus()` on the
  first such button returns `becameActive: false`. Counts are comparable across
  all three specimens at 1024 (**d1 41 · d2 42 · d3 36**), so this is the
  shared consequence of authoring both renderings, not a D defect.
- **The rest of the gate at 1024 and 390.** NO-4 leak `0` and no studio string
  on the sheet (`onSheet: []`) in all nine combinations; seams 9 at rest / 10
  in money; both consequence sentences present in every state at every width.

## D's final crux row

| Crux | D · direction-1, round 3 |
|---|---|
| **i · money** | **PROVEN** — 670 / 614 / 308, equal to the printed part's own measure. |
| **ii · keyboard reorder, add** | **PROVEN** (restored) — `Write → Move up → Move down → + Add a part` forward at 1440, 1024 and 390; 9/10 persistent seams; reorder announces. |
| **iii · 390** | **PROVEN** — strips outside the sheet, reduced to 2–3, the sheet rejoining everywhere else. |
| **iv · readiness in place** | **PARTLY** — notes swap, `#room-status` moves, #15 fires, and at 1024 and 390 the strips sit exactly with their parts; at 1440 four of five still drift 116–216px in the margin (**SD-13**, P3, disclosed in the fixer's own §4 and never in round 2's or round 3's scope). |
| **v · where the acts live** | **PROVEN** — send, return, both consequences and the hold caption at the paper's measure, all widths, all states. |
| **vi · R27 / R51** | **PROVEN** — plain `<h3>`, one head per part, nothing studio-side on the stock, and an unwritten part now prints neither content nor box at any width. |
| **vii · removes** | **PROVEN.** |

**6 PROVEN · 1 PARTLY.**

## Final verdict — direction-1

**PASS.** No P1 and no P2 open. All three round-3 targets are closed and the
round-2 keyboard regression is reversed, verified by key presses rather than by
`tabIndex`. One P3 remains — **SD-13**, the marginalia drifting up to 216px
below their parts at 1440 in resting and clause. Every strip names its own part
in words, so nothing is mislabelled, and both the fixer and this review have
recorded it as D's honest 1440 geometry; it is the panel's to accept or to
rule on, not a build blocker.

