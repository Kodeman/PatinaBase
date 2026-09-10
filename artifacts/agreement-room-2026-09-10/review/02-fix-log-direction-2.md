# Fix log — Direction II · A · the paper is the page (`specimens/direction-2.html`)

Fixer: fresh context, did not build the file. Scope: every P1 and P2 addressed to
`direction-2.html` in `review/01a-specimens-technical.md` and
`review/01b-specimens-design.md`, plus the cheap P3s, under the orchestrator's
seven rulings. Nothing else was touched — `direction-1.html`, `direction-3.html`,
`SPEC.md` and the deck are unchanged.

Renders read at every width and state, light / dark / reduced-motion, before this
log was written.

---

## §1 · Findings — what changed, where, verified how

| Finding | What changed | Where | Verified how |
|---|---|---|---|
| **SD-04** (P1) · naked heading + studio sentence on the paper for an unwritten part | The paper now prints **nothing** for Role rates while it is unwritten — no `.t-d3` head, no sentence. Its whole sheet segment is absent until the part is being written; the studio's own row (part name in `.t-head`, `Creates authority`, string #23, the fee note and `Write this part`) moved to a `--rail` studio strip outside the paper's stock, and that act is where the designer opens it (ruling 2). | `.sheet-seg--rates` + `html:not([data-state="money"]) .sheet-seg--rates { display: none }`; `aside#note-rates` | DOM probe over the elements that paint `--paper-doc`: `paperHasRest:false`, `paperHasRoleRatesHead:false` in resting and clause at 1440/1024/390; `true` only in money, where the part is being written. Plates `resting-1440`, `resting-1024`, `resting-390`. |
| **SD-06** (P1) · the paper reads as a form — 37 mono-caps acts | Per-part acts (`Write this part` / `Move up` / `Move down`) are gated by **selection, never hover**: hidden at rest, shown for the selected part only. A part is selected by clicking it or by putting the keyboard in it (`tabindex="0"` on each `section.part`, `focusin` → select) and by its outline row. Seam acts stay persistent at every seam but go quiet — `--ink-faint`, no rule of their own, standing on the seam's own hairline (ruling 3). Part heads remain plain `<h3 class="t-d3">`. | `.part__acts { display: none }` + `[data-selected]/[data-mode="editing"]` rules; `.seam .act` rules; `selectPart()` | Computed-style census (DM Mono + uppercase, visible only) — **see §2 for the counts**. Keyboard-selection probe: `.part__acts` `display` goes `none → flex` on `section.focus()` with `data-selected="true"`. |
| **SD-05** (P2) · `Creates authority` ×10 on the client's sheet | Every `Creates authority` line left the paper. Five studio strips (Role rates, Ceiling, Furnishings deposit, Retainer, Billing cadence) carry it outside the ground, each naming its own part. | five `aside.studio-note.studio-strip` in `.paper`, siblings of the segments | Probe `paperHasStanding:false` at all three widths in all three states. |
| **NO-4 / ruling 1** · studio chrome inside the paper | The paper is no longer one ground: `.paper` is a transparent column and the ground is painted only by `.sheet-seg`. Readiness, the marginal notes, the rest row and the standings are siblings of the segments — the **right margin at 1440** (absolute, anchored to the part each names, stacked so none overlaps), and **a `--rail` strip that visibly interrupts the sheet at 1024 and 390** (the sheet ends, the strip prints, the sheet resumes). | `.paper` / `.sheet-seg` / `.studio-strip` + `layoutStrips()` | Probe: for every studio node, `containedByAGround === false` — `leaked: []` at 1440/1024/390 × resting/clause/money. Plates `resting-1024`, `resting-390` show the interruption; `resting-1440` shows one continuous sheet with the strips in the margin. |
| **SD-10** (P2) · the editor never reaches the paper's measure | The selected/editing part's 2px leading rule now hangs in the sheet's own padding (`margin-left: -24px` against `padding-left: 22px`), so **no editor is indented inside its part**. Printed prose and its editor take the same width at each breakpoint (ruling 5). | `.part[data-selected="true"], .part[data-mode="editing"]` | Measured `getBoundingClientRect().width`: `.money-rows` **622 / 614 / 308**, `.field-grow` **622 / 614 / 308**, printed `.part__printed p` **622 / 614 / 308** — equal at each width. **True text measures in §3.** |
| **SD-16** (P2) · the Save record prints twice | The record line inside the Services field group and inside the Role-rates editor is deleted. One record only, under the prepared-for line, and it still carries `· Services not yet saved` / `· Role rates not yet saved` (ruling 6). | `#record` only | Probe `recordCount: 1` in every state at every width. |
| **SD-21** (P2) · return act absent at 1024 and 390 | The return act, its consequence (#36) and the `Press and hold to return` caption moved out of the outline's disclosure to a **page foot below the paper, at the paper's measure, at all widths**, quietest tier (ruling 4). `Save as template…` stays at the outline's foot. | `.page-foot` | Probe `returnActs: 1` at 1440/1024/390 in all three states (was 0 below 1248). |
| **SD-22** (P2) · the return consequence set 13 lines in a 168px column | Same move: the sentence now sets at the paper's measure. | `.page-foot .consequence` (56ch cap from §A6) | Measured width **530 / 530 / 358 px** (was 168) — 4–5 lines. |
| **SD-23** (P2) · at 390 the outline sat at the foot of a 9,678px page | The outline disclosure sits **above the paper**, beside the readiness band, at 390 and at 1024 (ruling 4). DOM order is title → the studio → the parts → the paper → the page foot, which is the narrow stack exactly. | `.col-outline` moved before `.col-paper`; grid places the columns at 1440 | Measured document offsets: outline `569` vs paper `637` at 390; `428` vs `496` at 1024; both at `327` (same grid row) at 1440. |
| **ST-003 / SD-17** (P2 / P3) · straight quotes and a literal ellipsis | Visible copy now uses typographic entities, as direction-1 and direction-3 do: `client&rsquo;s`, `days&rsquo;`, `studio&rsquo;s`, `Save as template&hellip;`. | rest row, Terms clause, outline foot | `grep "[A-Za-z]'[A-Za-z ]"` returns only CSS/JS comments and code (identical to the other two files); rendered plates read curly. |
| **ST-002** · shared-block wrapper | No change needed — this file already opened `/* SHARED BLOCK — BEGIN … */` and closed `/* SHARED BLOCK — END */`, and the 278 CSS lines were left byte-untouched. | lines 11 / 290 | `diff` of the extracted block: `direction-2` vs `direction-3` identical, `direction-1` vs `direction-2` identical — the three-way diff is now clean. |
| **ST-001 / autofocus** · | No `autofocus` attribute exists or was added; the caret is placed only by the state script's `focus()` + `setSelectionRange()`. | `sync()` | `grep 'autofocus[ =>]'` → 0 hits (the only match in the file is the word inside a comment saying no field carries it). |
| **SD-08 / ruling 6** · local `font-family` / `font-size` | Removed the one local step, `.col-margin .studio-note .t-body { font-size: 14px }`. Readiness now sets at its authored `.t-body`; the notes are `.t-body-sm` as §4 asks. | direction CSS | Grep for `font-size` below the shared block: only §A14's own SPEC-pasted declarations and the SPEC's own `— being written` rule remain. |
| **SD-26** (P3) · no seam above the first part | A tenth seam sits above `Services`, so a part can be added at the top of the agreement. | first `.sheet-seg` | Visible in `resting-1440` / `resting-390`; act census below. |
| **SD-29** (P3) · state change yanks the reading position | The caret is placed with `focus({ preventScroll: true })` and the reading position is then moved deliberately to the **part** (which carries `scroll-margin-top: 24px`), not to the field's foot. | `sync()` | Read on the money and clause plates; the edited part heads the viewport rather than its last field. |
| **Ruling 6** · gaps on the module | New and touched spacings are on 12 / 24 / 48 (`.part__acts` `margin-top` 4 → 12 and `gap` 16 → 24, `.title-h1` and `#owner-reason` 4/6 → 12, `.paper__foot .act--terminal` 8 → 12). | direction CSS | Read on the 1440 and 390 plates. |
| **SD-01** (P3) | Already correct in this file; left as it is. | — | diff above. |
| **SD-14 / SD-30** | Already correct in this file; preserved and re-verified — string #15 fires on clause → money, and the authored-not-rendered comments (#4/#5/#8/#20/#41) survive the rewrite. | `sync()`, HTML comments | Live walk: `clause → money` writes `Role rates name the fee. One thing left: name a ceiling.`; `resting → money` writes #14. |

### Declined, with reason

| Finding | Reason |
|---|---|
| SD-15 (P3) — the money plate cannot show the transition sentence | It is a property of the render gate (fresh context per state) and its fix is a fourth captured state or a deck caption. The brief forbids touching the deck; the specimen already fires #15 on the live walk. |
| SD-31 (P3) — fields read as holes in dark | The fix is a token change (`--paper-doc` in the dark twin) or a new box rule, and the shared block may not be edited. Stands as an amendment ask. |
| SD-32 (P3) — page title and paper headline both `.t-d2` | A type-hierarchy change that must land in all three files to keep one room; direction-1 and direction-3 are out of scope for this pass. |
| ST-006 (P3, informational) — `.field` / `.chip` box borders under 3:1 | §A14 designates the 1px `--ink-faint` baseline rule as the edge a reader sees (6.51:1); the box is decorative by the SPEC's own account. |
| ST-004, ST-005, SD-02/03/07/09/11/12/13/18/19/20/24/25/27/28/33 | Addressed to `direction-1.html` or `direction-3.html`; out of this file's scope. |

---

## §2 · The act census — mono-caps acts visible per state

Computed style over every visible `.act` (DM Mono + `text-transform: uppercase`),
at 1440 / 1024 / 390. The terminal act (Inter, sentence case) and the inline
`Change the client account` (body type) are not mono-caps and are excluded, as in
review 01b's own census.

| State | On the paper (inside a `.sheet-seg`) | Whole page | Was (review 01b) |
|---|---|---|---|
| resting | **9** — the ten seams less the unwritten part's own | 14 (1440) · 13 (1024/390, the outline collapsed) | 37 |
| clause | **12** — 9 seams + `Done writing`, `Move up`, `Move down` on Services | 17 (1440) · 16 (1024/390) | 37 |
| money | **12** — 10 seams + `Move up`, `Move down` on Role rates | 17 (1440) · 16 (1024/390) | 37 |

At rest the paper carries nine quiet `+ ADD A PART` words on its seam hairlines
and nothing else: no heading is a control, no part carries an act row, and every
studio word is off the stock.

---

## §3 · The true text measure (ruling 5)

The sheet keeps its 48 / 48 / 24px padding and its 1px box, so the printed
measure is not literally 720 / 712 / 358. **The deck's fold note should be
corrected to these numbers:**

| Band | Paper (sheet box) | **True text measure** | Editor width | Printed width |
|---|---|---|---|---|
| 1440 | 720 | **622** | 622 | 622 |
| 1024 | 712 | **614** | 614 | 614 |
| 390 | 358 | **308** | 308 | 308 |

The editor takes exactly the printed part's text width at every breakpoint, prose
and money alike; nothing is indented inside its part.

---

## §4 · Amendments to SPEC / synthesis, recorded

1. **SPEC §4 A's band diagram, at 1024.** Ruling 1 replaces the 168px margin
   column below 1248 with the interrupting `--rail` strip, so 1024 is one column
   (`max-width: 808px`, 48px gutters → a 712px paper) exactly as 390 is one
   column. The readiness band still sits above the paper at both widths (crux iii).
2. **SPEC §4 A's markup for the unwritten part.** SPEC had A take D's studio rest
   row *on the paper*; ruling 2 takes it off. The paper prints nothing for Role
   rates, and `#toggle-role-rates` — the act the state script drives and the act
   the held send hands over to in resting and clause — lives on the studio strip.
3. **SPEC §4's "the return act at the outline's foot (D, A)".** Ruling 4 moves it,
   its consequence and its hold caption to the page foot at every width.
4. **SPEC §4 A's "720 / 712 / 358".** Ruling 5's true measures are §3 above.
5. **No `article.paper`.** No element wraps both a sheet segment and a studio
   strip, so the paper is a transparent column (`div.paper`) and the ground is
   painted only by `div.sheet-seg`. A reviewer's NO-4 probe should read
   *"is this node inside any `.sheet-seg`"* rather than `article.paper.contains()`.
6. **The seam beside the unwritten part** (crux ii) is `#seam-role-rates`, the
   trailing seam of Exclusions — it stands exactly where Role rates would print,
   and it is Tab-reachable. A part that prints nothing does not print its own
   seam either, which is why the resting paper shows nine seams and the money
   paper ten.
7. **Each studio strip names its part** in `.t-head` — SD-04's own proposed fix
   ("carrying the part's name in `.t-head`, not `.t-d3`"), extended to all five
   strips so a strip that cannot sit level with its part still says which part it
   speaks for. String #21's running head `THE STUDIO` is unchanged above it.
8. **Measured limit of A's margin, for the panel.** At 1440 the 168px column
   cannot hold the studio's words level with their parts: `layoutStrips()` places
   each strip at its part's own top and pushes it only far enough to clear the one
   above. Measured drift from the anchor — resting `0 / 243 / 208 / 177 / 59 px`,
   money `0 / 0 / 70 / 39 / 0 px`. This is A's honest geometry, drawn rather than
   argued, and it is why every strip carries its part's name.

---

## §5 · Gate

**Renders.** `render.mjs`, widths 1440 / 1024 / 390, states
`resting` / `clause` / `money`, plain + `--dark` + `--reduced-motion` —
**exit 0 on all three runs, 27 plates, `errors=0 warnings=0` in every
`console.json`, `horizontalOverflow: false` on every plate.** Chromium needed
`dangerouslyDisableSandbox: true` ("Permission denied" on
`mach_port_rendezvous`), as the brief anticipated.

```
light          plates=9 errors=0 warnings=0 overflow=0
dark           plates=9 errors=0 warnings=0 overflow=0
reducedmotion  plates=9 errors=0 warnings=0 overflow=0
```

**Greps — all empty, with only the documented allowances.**

| Grep | Result |
|---|---|
| `box-shadow\|drop-shadow\|--elevation-sheet` | 1 — the `:root` token declaration (allowed) |
| `<(button\|input\|a\|select\|textarea)[^>]*\sdisabled` | 0 |
| `contenteditable\|text-overflow\|line-clamp` | 0 |
| `font-size: ≤10px` | 0 |
| `opacity: .n` | 0 |
| `position: sticky\|fixed`, `maximum-scale`, `user-scalable` | 0 |
| `aged-oak\|#8B7355` | 1 — the `:root` token declaration; every consuming rule takes `background` or `border-color`, never `color` |
| `https?://` not `fonts.g` | 0 |
| `autofocus` as an attribute | 0 |
| §7 banned words · `R\d+` · `W\dR\d` | 0 |
| visible `chip\|modal\|builder\|composer` | 0 |
| `Return to the seven facets` | exactly 1; `facet` elsewhere: 0 |

**Structure.** `grep -c '<h1'` = 1 · `<html lang="en">` present · headings in
order in every state (H1, H2, H2, H3×9 or ×10) · `scroll-margin-top` declared on
the parts and the strips (AX-19's hook) · **55,685 B ≤ 120 KB** · last line
`<!-- specimen-complete -->` · shared-block diff clean against direction-1 and
direction-3.

**a11y spot-checks re-run after the rebuild** (the checks the rebuild could have
broken):

| Check | Result |
|---|---|
| 5 · permanent status region | `#room-status` present at load with a full sentence, visible at every width and state |
| 6 · readiness speaks | resting → money rewrites to #14; clause → money rewrites to #15 |
| 7 · every held act focusable and explained | both held acts `tabIndex 0`, `aria-describedby` resolving to a visible non-empty node, at 1440 and 390 in all three states |
| 8 · a held act is never silent | resting: status takes the fee reason, focus lands on `#toggle-role-rates` (the studio strip's act). money: status takes the ceiling reason, the Ceiling part is selected and focus lands on `#write-ceiling` |
| 13 · reflow at 390 keeps every act | act sets identical at 1440 and 390; `Send the agreement · $5,000.00 retainer` and `Return to the seven facets` both present at 390 in all three states |
| 14 / 15 · keyboard reorder speaks | with `pointerEvents:'none'`, Billing cadence moves 8 → 7 → 6; focus stays inside that part each time; `#room-status` reads `Billing cadence is now part 7 of 9.` then `… part 6 of 9.` (reorder now moves a part between sheet segments, which the segmented paper required) |
| 17 · no hover-only act | the two `:hover` rules added change `color` only |
| 18 · unfolding does not shift the reading position | `#part-exclusions` top, resting → money: **Δ = 0px** |
| 20 · reduced motion / forced colours | §A11's blocks untouched inside the shared block; the editing part keeps its 2px rule **and** the words `— being written` |
