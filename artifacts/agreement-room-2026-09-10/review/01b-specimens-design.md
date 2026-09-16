# Review 01b — specimens, design

Adversarial review of `specimens/direction-1.html` (D · the galley),
`direction-2.html` (A · the paper is the page) and `direction-3.html`
(B · builder as overlay), against `synthesis.md` §3/§5/§7,
`specimens/SPEC.md` §4/§5/§6, `docs/design/house-sheet/SPEC.md` §A and §F,
`briefing/panel-brief-common.md` §6–§9, and `panel/memo-nora.md` NO-4.

Fresh context; I did not build these files or write the SPEC. No specimen was
edited.

**How the pixels were made.** Each file rendered myself with
`portal-polish-review-2026-09-08/tools/render.mjs` at 1440 / 1024 / 390, in
three states (`--state resting|clause|money`), light and dark — 54 plates,
under `$TMPDIR/dz/`. Chromium needed the sandbox lifted (`Permission denied`
on `mach_port_rendezvous`). Every plate read. Layout numbers, computed type,
DOM ancestry, Δ-shift, status-region visibility and a 22-pair contrast sweep
measured in a Playwright harness rather than eyeballed; the numbers below are
measured, not estimated.

---

## §0 · What the gate already passes

Recording these so the findings below are read against a genuinely careful
build, not a sloppy one. All three files, all widths, both themes:

- **Zero AA failures.** Every visible text node walked against its nearest
  painted ground, light and dark: no element below its threshold. The §8
  contrast table computes all-pass in both themes (worst non-text `--oak` on
  `--rail` at 3.51:1 light / 4.31:1 dark; worst text `.t-terminal` held
  `--ink-faint` on `--rail` at 5.32:1 / 5.55:1).
- Every §8 grep empty: no `box-shadow` / `drop-shadow`, no native `disabled`,
  no `contenteditable` / `text-overflow` / `line-clamp`, no rendered
  `font-size` under 11px, no `opacity` carrying a state, no `position:
  sticky|fixed`, no `maximum-scale`, no `--oak` on a `color` declaration, no
  external URL but the fonts link.
- Exactly one `<h1>` each, `<html lang="en">`, headings in order in every
  state, `facet` exactly once (string #37).
- **No hover-only acts** — zero `:hover` rules touching `opacity` /
  `visibility` / `display` in any file (check 17 passes by construction).
- Every `aria-disabled="true"` act is focusable (`tabIndex 0`) with an
  `aria-describedby` resolving to a visible, non-empty node.
- `console.json` clean in all six runs; no horizontal overflow at any width in
  any state; sizes 58 KB / 48 KB / 51 KB against the 120 KB cap.

The shared block is byte-identical between the three but for one character
(SD-01).

---

## §1 · Findings

| ID | Sev | Conf | File | State / width | Claim | Evidence | Proposed fix |
|---|---|---|---|---|---|---|---|
| SD-01 | P3 | high | all three | n/a | The shared block's opening comment differs: `direction-1` writes `/* SHARED BLOCK — BEGIN */`, `direction-2` and `-3` write `/* SHARED BLOCK — BEGIN … */`. SPEC pins the latter. The §8 diff therefore prints one hunk instead of `SHARED BLOCK IDENTICAL` — the gate fails on a horizontal ellipsis. Everything else in the 280-line block is byte-identical. | SPEC §1 (`Wrap it in … exactly`); §8 "Done"; `diff $TMPDIR/direction-1.shared.css $TMPDIR/direction-2.shared.css` → `1c1` | Add ` …` to direction-1's BEGIN comment. |
| SD-02 | **P1** | high | direction-1 | all states, all widths | **NO-4 is violated at every width, not only 390.** Both marginal notes are DOM children of `article.paper` — the element that paints `--paper-doc` at 720px. At ≤767px `.note { position: static; margin: 12px -25px; }` renders them as full-bleed strips *inside the paper's sheet*, between two printed parts. They carry `--rail` and a running head, so they have their own register — but synthesis §5 does not stop at register: "Never inline in the paper's flow, and **never in the paper's ground**." D is the panel's pick and it is the direction that misses the one constraint declared binding on all three. | NO-4 (`memo-nora.md:57`); synthesis §5 "NO-4 binds all three"; `direction-1.html:812`, `:844`, `:594`; DOM probe `article.paper.contains(note) === true`; render `direction-1-money-390.png` (strip between Ceiling and Furnishings deposit), `direction-1-money-1024-dark.png` | Lift both `<aside class="note">` out of `article.paper` into the galley's own wrapper; at 390 render them between the paper's sections but outside its sheet (the sheet closes, the strip prints, the sheet reopens), or as a single running studio column below the paper. |
| SD-03 | P2 | high | direction-3 | resting, clause / all widths | Same defect, milder: the Role-rates rest row is a `.studio-note` that is a child of `article.paper`. It is on `--rail` with a `THE STUDIO` head — the treatment synthesis §5 asks for — but it sits in the paper's sheet. | NO-4; DOM probe (`in: true` for the rest-row note only); render `direction-3-money-1440.png` | Same fix as SD-02; B needs it in one place only. |
| SD-04 | **P1** | high | direction-1, direction-2 | resting, clause / all widths | **The paper prints a heading and a sentence for a part that has nothing to say.** Role rates is pinned unwritten, so the client's copy prints nothing (R21) and §A10 forbids "a naked heading". Both D and A print `Role rates` as a Playfair `.t-d3` head on the paper's stock, followed by `Not written yet. Your client's copy does not print this part.` in the paper's own ground — a sentence addressed to the studio, set where the client's sentences set. `direction-3` is the only file whose paper prints nothing there and puts the rest row in a `.studio-note` (SD-03's milder placement). | §A10 (`house-sheet/SPEC.md:506-508`); R21 (brief §8); NO-4; probe: `article.paper.innerText` contains `Not written yet` in d1 and d2; heading census — d3's resting paper has no `Role rates` H3, d1 and d2 do; renders `direction-1-resting-1440.png`, `direction-2-money-390.png` | Draw the rest row where B draws it: a `--rail` studio row keyed to the part, outside the paper's stock, carrying the part's name in `.t-head` (not `.t-d3`) and its own act. The paper renders nothing. |
| SD-05 | P2 | high | direction-1, direction-2 | all states, all widths | `Creates authority` (#40) prints on the paper's stock under nine (d1) / ten (d2) parts, in `.t-head` mono caps. It is studio metadata — R51 keeps the studio's own view off the client's page, and NO-6 asked A and D specifically to render the studio's money view "visibly apart from the printed paper". `direction-3` prints it once, inside the drawer. | R51 (brief §8); NO-6 (`memo-nora.md:59`); probe `article.paper.innerText` includes `CREATES AUTHORITY` in d1/d2, not d3; renders `direction-1-resting-1440.png`, `direction-3-money-1440.png` | Move the standing into the studio's register — the outline row, the fold's head, or the margin — never onto the sheet. |
| SD-06 | **P1** | high | direction-2 (P2 direction-1) | all states, esp. 390 | **The paper reads as a form.** Census of visible text at 1440: 13px DM Mono uppercase acts number **37 in direction-2, 29 in direction-1, 3 in direction-3.** A puts `WRITE THIS PART · MOVE UP · MOVE DOWN` under every part's prose — at 390 they wrap to two lines and interleave with the client's sentences ten times down the sheet. D puts two. B puts one quiet `Edit this part` (`.act--inline`, sentence case, inside the paper's own type). This is the argument the program exists to win, and the two directions the panel ranks first are the two that lose it. | Type census (computed `font-size`/`font-family`/`text-transform` over all visible text-bearing elements); renders `direction-2-money-390.png`, `direction-2-money-1440.png` vs `direction-3-money-1440.png` | Reduce the per-part chrome on the paper to one inline act, as B does; move reorder to the outline (where B already has it) rather than onto the sheet. |
| SD-07 | P2 | high | direction-1 | all states, all widths | Every part head **is a control**: `.part__head .act` restyles `.act--tertiary` to Playfair Display 20px, weight 500, `text-transform: none`. §F-C keeps tertiary at DM Mono 13px caps; §A3 says "Nothing else. No inline `font-size`." Nine of the paper's headings therefore carry an act's oak rest rule, which is why D's sheet reads ruled. A and B keep the head a plain `<h3 class="t-d3">`. | §F-C (`house-sheet/SPEC.md:267`, §F "Tertiary and secondary keep DM Mono 13px caps"); §A3 (`:126-151`); `direction-1.html:555-559`, `:597`; computed probe (d1 head act = Playfair 20px; d2/d3 head = H3) | Keep the `<h3>` a heading and hang a separate tertiary toggle beside it, or accept an amendment ask — but do not silently redefine a tier the other two specimens honour. |
| SD-08 | P2 | high | direction-1 | all states / 1440, 1024 | `Save as template…` and `Return to the seven facets` render at **13px Inter** — a size/family pair that is not one of the seven steps and is not the tertiary tier's type either. Two elements; both are `.act .label` in the outline. d2 and d3 have zero off-scale steps. | §A3 "Nothing else"; §F-C; computed probe: `[{fs:13px, ff:Inter, cls:'label', txt:'Save as template…'}, {…'Return to the seven facets'}]` in d1 only | Remove the local `font-family` override; let both acts inherit DM Mono 13 caps. |
| SD-09 | P2 | high | direction-1 | money / 1440, 1024, 390 | **D's money editor never reaches its declared measure.** SPEC pins "720 / 664 / 358 — the galley's full measure". Measured `.money-rows` widths: **623 / 567 / 261** — 97px short at every width, spent on the selected part's 22px indent, the fold's 22px left rule-padding and the paper's own padding. The crux-(i) numbers in the build sheet are not what the specimen draws. | SPEC §4 D "D's money-part answer"; measured `getBoundingClientRect().width` of `.money-rows` at each width/state; render `direction-1-money-1440.png` | Either let the fold break out of the indent to the galley's full measure, or restate the crux numbers as 623 / 567 / 261 in the deck's fold note. Do not print 720 beside a 623. |
| SD-10 | P2 | high | direction-2 | money / 1440, 1024, 390 | Same defect: A pins "720 / 712 / 358", draws **598 / 590 / 284**. A's whole argument is that the editor takes the part's place *at the paper's full measure*; it takes the part's place at 83% of it. | SPEC §4 A "A's money-part answer"; measured widths; render `direction-2-money-1440.png` | As SD-09. |
| SD-11 | P3 | high | direction-3 | money / 1440 | Recorded for contrast: B's drawer money column measures **431px inside the 480px drawer (432 usable after 24px padding)** — the only direction whose money answer meets its own declared number exactly. | SPEC §4 B "480 = 20 modules"; measured width | None. |
| SD-12 | P2 | high | direction-1 | all states / 1440 | Every inter-part gap on the paper measures **45px** — eight of them. §A4 permits 24 / 48 / 72 / 12 and nothing else. | §A4 (`house-sheet/SPEC.md:153-162`); measured gaps `[45,45,45,45,45,45,45,45]` | Bring the seam row's own box onto the module (24 + 24, or 48 with the act's 44px box absorbed). |
| SD-13 | P2 | high | direction-1 | resting, money / 1440, 1024 | **The marginal note labels the wrong part.** `.note { position: absolute; top: 0 }` is anchored to the *seam* after a part, so in `resting` the fee-floor note (`This agreement names no fee…`) sets level with the **Ceiling** head, and in `money` the ceiling note sets level with **Furnishings deposit**. A designer reading down the margin attaches each sentence to the part beside it. `direction-2` anchors its notes to the part and gets this right — its ceiling note sits level with `Ceiling`. | Crux (iv) as SPEC §4 D states it ("beside the Role rates seam", "beside the Ceiling seam"); renders `direction-1-resting-1440.png` (note top y≈972 vs Role rates head y≈847, Ceiling head y≈1000), `direction-1-money-1440.png`, `direction-1-money-1024-dark.png` | Anchor `.note` to the part's own top, as direction-2 does. |
| SD-14 | P2 | high | direction-1 | clause → money | **The transition sentence is authored and never rendered.** String #15 (`Role rates name the fee. One thing left: name a ceiling.`) is present in the file, but walking clause → money writes #14 instead. It is the sentence synthesis §5 singles out as the answer to LH-10 — "the fee sentence never vanishes with nothing in its place" — and D is the direction that does not say it. d2 and d3 both fire it. | synthesis §5 (#15, "the transition, when the count moves"); SPEC §5 row 15; probe `{clause:'…name a fee.', clauseToMoney:'…name a ceiling.'}` for d1 vs `'Role rates name the fee. One thing left: name a ceiling.'` for d2/d3 | Add the transition branch to d1's `apply()`. |
| SD-15 | P3 | medium | direction-2, direction-3 | money (fresh load) / all widths | The mirror of SD-14: because the render gate opens a fresh context per state, the deck's money plate carries #14 in all three files, and #15 is only visible on a live walk. So the plate that goes in the deck cannot show the sentence the deck's argument rests on, in any direction. | render.mjs behaviour (fresh page per state); probe `restingToMoney` = #14 in all three | Give the deck a fourth captured state, or caption the money sheet with the transition sentence. |
| SD-16 | P2 | high | direction-1, direction-2 | clause, money / all widths | **The Save record prints twice, word for word** — once under the prepared-for line and once inside the open fold/field group. `Saved 10 September 2026, 5:36 am · Services not yet saved` appears twice on one screen. This is defect §1 row 2's own complaint ("It prints twice, word for word") reproduced in the specimen meant to retire it. d3 prints it once. | synthesis §1 row 2; probe `.record` innerText per state: d1/d2 return two identical strings in clause and money, d3 returns one; render `direction-1-money-1440.png` (top y≈156 and fold y≈1025) | Keep the page record; drop the fold copy, or make the fold's line a different fact (e.g. the field's own last keystroke time). |
| SD-17 | P3 | high | all three | all | Apostrophe style is inconsistent within and across the three files: `direction-1` has 3 `&rsquo;` and 2 straight, `direction-2` 0 and 4, `direction-3` 2 and 3. The same sentence — `Your client's copy does not print this part.` — sets with a curly apostrophe in d1/d3 and a straight one in d2. Three specimens that "must look like one room" do not punctuate alike. | SPEC §5 row 23 (straight); grep counts | Pick one (curly reads better on Playfair/Inter) and sweep all three. |
| SD-18 | P3 | high | direction-3 | meta strip / all | The strip reads `Direction III · The drawer as an overlay`; SPEC §3 pins `Direction III · The builder as an overlay`. **d3 is right and the SPEC is wrong** — §7 bans `builder` on a specimen face. Record the ruling so the deck's caption does not restore it. | SPEC §3 vs SPEC §7 / brief §9; `direction-3.html` meta span | Amend SPEC §3's pinned string to `The drawer as an overlay`. |
| SD-19 | **P1** | high | direction-3 | clause, money / 390 | **The readiness region disappears at 390.** With the drawer full-screen, `#room-status-wrap` is not rendered (`offsetParent === null`) in both editing states — the one sentence that is supposed to be "present at load, never removed" is gone precisely where the designer is working. Check 5 wants a region not inside a conditionally rendered block; §A10 wants a region that always has something to say. | SPEC §3 ("present at load, never removed"); §8 check 5; §A10; probe `390/clause {statusVisible:false}`, `390/money {statusVisible:false}`; render `direction-3-money-390.png` (no `THE STUDIO` readiness band) | Render the readiness band at the head of the full-screen drawer, above `← Back to the paper`. |
| SD-20 | **P1** | high | direction-3 | clause, money / 390 | **No act matching `/review|send/i` is present at 390** in either editing state — check 13's explicit pass condition, and SPEC §4 B's own promise ("reflow at 390 keeps every act, the drawer's counted"). B reintroduces defect §1 row 3 — "there is no way to open the send sheet at 390 in the shipped product" — at exactly the width that defect named. The return act goes with it. | §8 check 13; SPEC §4 B a11y reading; probe `390/clause {sendActs:0, returnActs:0}`, `390/money` same; render `direction-3-money-390.png` | Carry the send act (held, with its consequence) into the drawer's foot at 390, or make `← Back to the paper` the first thing above a persistent send row. |
| SD-21 | P2 | high | direction-1, direction-2 | all states / 1024, 390 | The return act and its consequence sentence are not rendered at 1024 or 390 — both sit inside a collapsed `▸ The parts` disclosure. Crux (v) — "the return act at the outline's foot in the quietest tier" — is therefore only provable at 1440 for two of three directions. String #36/#37 are pinned to "all" states. | SPEC §4 "at the outline's foot (D, A)"; §5 rows 36–37 ("all"); probe `390/{resting,clause,money} returnActs: 0` for d1 and d2, `1` for d3 resting; measured `.consequence` count 2 at 1440, 1 at 1024/390 | Leave the disclosure's foot rendered (heading collapsed, foot persistent), or move the return act to the page foot at ≤1247 as B does. |
| SD-22 | P2 | high | direction-1, direction-2 | all states / 1440 | The return act's consequence sentence is set at 15px in a **192px** (d1) / **168px** (d2) column: **10 and 13 lines** at roughly 22 and 19 characters. §A6 fixes 15px as the floor and a 56ch measure; neither is attainable in a 7- or 8-module column. The most consequential sentence on the page is the least readable. d3 sets the same sentence at 530px / 4 lines. | §A6 (`house-sheet/SPEC.md:379-395`); measured `.consequence` `[{w:192,lines:10},{w:530,lines:5}]` (d1), `[{w:530,lines:5},{w:168,lines:13}]` (d2), `[{w:530,lines:4},{w:530,lines:4}]` (d3); render `direction-2-money-1440.png` left column | Put the return act and its sentence at the page foot at the paper's measure, as direction-3 does, and leave the outline's foot to the act alone. |
| SD-23 | P2 | medium | direction-2 | all states / 390 | At 390 the outline — and with it the return act, its consequence and `Save as template…` — sits at the foot of a **9,678px** page, below every part. It is per the band diagram, but it makes the two acts that undo the morning's work reachable only by scrolling the whole agreement. | SPEC §4 A bands ("390 … ▸ The parts" last); render `direction-2-money-390.png` (disclosure at y≈9,600) | Put the outline disclosure above the paper at 390, where the readiness band already is. |
| SD-24 | P2 | high | direction-3 | clause, money / 1440, 1024, 390 | Inside the drawer the money field runs the drawer's full width — `.field-money .field-control { max-width: 13ch }` is defeated — so the `$` furniture sits **~250px (1440) and ~300px (390)** from its own figure, a lone currency mark at the far left of an empty box. §A14 calls the mark "furniture the field prints"; here it is orphaned. | §A14 money block (SPEC §2); renders `direction-3-money-1440.png`, `direction-3-money-390.png` | Cap the field at 13ch and right-align the *field*, not the value, to the drawer's rule — the figure keeps its rule and the mark keeps its figure. |
| SD-25 | P3 | high | direction-3 | all states | One `+ Add a part` in the whole file, at the drawer's foot. §5 #32 assigns it to "every seam" in "all" directions. B's placement model is honestly add-then-reorder, but the string's contract is not met and the seam affordance the other two draw nine times is absent. | SPEC §5 row 32; `grep -c '+ Add a part'` → 9 / 9 / 1 | Either amend #32 to name B's exception, or add a seam act between the drawer's outline rows. |
| SD-26 | P3 | medium | direction-1, direction-2 | all states | There is no seam **above** the first part, so a part cannot be added at the top of the agreement. Nine parts, nine seams — eight between and one after Terms. | Renders `direction-1-resting-1440.png`, `direction-2-money-1440.png` (no act above `Services`) | Add a tenth seam above part 1. |
| SD-27 | P3 | medium | direction-3 | clause, money / 1440, 1024 | `Edit the parts` (#29, pinned to `resting`) stays rendered above the paper while the drawer is open, so the page carries two doors to the same room. | SPEC §5 row 29 ("resting"); render `direction-3-money-1440.png` (`EDIT THE PARTS` at y≈308) | Replace it with the record line, or hide it in the two editing states. |
| SD-28 | P3 | high | direction-3 | resting → money / 1440 | Check 18: the paper's parts shift **34–54px** when the drawer opens. d1 and d2 hold Δ = 0 for every part above the target (they shift only what is below the fold). B's is small and structural, but it is the one direction that moves the reading position of text the designer is not editing. | §8 check 18; probe (document coords) d3 paper sections `−54 … −34`, d1 `0` above / `+307` below, d2 `0` above / `+195` below | Reserve the band's height when the drawer opens. |
| SD-29 | P3 | medium | all three | resting → money | Switching state scrolls the document **1286px (d1), 994px (d2), 549px (d3)** — the `autofocus` on the third rate field pulls the viewport. Check 18 passes as SPEC scopes it (the part above holds), but the *reading position* moves in all three, most in the direction that argues it never should. | Probe `scrollDelta`; §8 check 18, AX-19 | Scroll the fold into view deliberately with `scroll-margin-top` rather than letting `autofocus` decide, and say so in the fold note. |
| SD-30 | P3 | high | direction-1 | n/a | String #20 (`Link a client with an email address.`) is not present, even as a comment; §5 asks for it authored-not-rendered. d2 and d3 carry it. The unlinked title variants (#4/#5/#8) and #41b are likewise thinner in d1 than in the other two. | SPEC §5 rows 4–5, 8, 20, 41; `grep` after entity-decoding | Add the missing comments so the three files document the same fixture. |
| SD-31 | P3 | medium | direction-1 (all three) | money / 1440, 1024 dark | In dark, the field's `--paper-doc` ground (#26221E) sits 1.03:1 against the paper (#2A2622): the "sheet laid on the page" reads as a hole punched in it, and only the 1px `--ink-faint` baseline rule says a field is there. Every contrast pair still passes; this is legibility of *affordance*, not of text. | §A14 ("a sheet laid on the page"); computed ratio; render `direction-1-money-1024-dark.png` | Give the field a full 1px `--hairline-strong` box in dark, or lift `--paper-doc` a step in the dark twin (which would need a token change, so: an amendment ask, not a fix). |
| SD-32 | P3 | medium | all three | all | The page's `<h1>` (`Dave Okonkwo`) and the paper's headline (`Okonkwo house — design services agreement`) both set `.t-d2` Playfair 26px, 60–200px apart. The person's name and the house's name compete at identical weight; the page's own title loses, being the shorter of the two. | §A3; renders, all three at 1440 | Step the paper's headline to `.t-d3`, or the page title to `.t-d1` — the reduction reads better with a real interval. |
| SD-33 | P3 | high | direction-1 | 390 | `.part__head .act { font-size: 20px }` is declared twice — once in the base rule and again inside the `≤767px` block, where it changes nothing. Dead CSS in the file the reviewer diffs. | `direction-1.html:555`, `:597` | Delete the second. |

**Counts.** P1 × 5 (SD-02, SD-04, SD-06, SD-19, SD-20) · P2 × 15 · P3 × 13.

---

## §2 · NO-4, answered directly

> *Is any studio note, readiness sentence, count, "needs attention" or Save
> record inside the paper's type or ground at 390 or elsewhere?*

**Yes, in all three — and worst in the direction the panel picks.** Measured by
DOM ancestry against the element that actually paints `--paper-doc` at 720px
(`article.paper` in all three files):

| Inside the paper's stock | direction-1 (D) | direction-2 (A) | direction-3 (B) |
|---|---|---|---|
| Readiness sentence | no | no | no |
| Fee-floor / ceiling marginal notes | **yes (both)** | no | no |
| Rest row `Not written yet…` | **yes, in the paper's own type** | **yes, in the paper's own type** | yes, but on `--rail` with a running head |
| `Creates authority` | **yes ×9** | **yes ×10** | no |
| `Move up` / `Move down` | **yes ×18** | **yes ×20** | no |
| `+ Add a part` | yes ×9 | yes ×9 | no |
| `needs attention` | no (outline) | no (outline) | no (drawer) |
| Save record | no | no | no |

The readiness sentence and the `needs attention` word are clean everywhere —
those were the loud complaints and they are answered. What leaked is quieter
and, at 390, louder in effect: **D's marginal notes are full-bleed strips
inside the paper's sheet** (`.note { margin: 12px -25px }`), and **D's and A's
rest row is a Playfair heading plus a studio sentence set in the client's own
type on the client's own ground.** B is the only file whose paper, at rest,
contains nothing the client would not receive.

---

## §3 · The seven cruxes

PROVEN means a drawing settles it; a crux argued in a comment or a build-sheet
sentence is NOT PROVEN.

| Crux | D · direction-1 | A · direction-2 | B · direction-3 |
|---|---|---|---|
| **i · money, body unforked** | **PARTLY** — three rates unfold beneath the printed part, `.t-money`, no truncation, decimal survives (`money/1440`, `/1024`, `/390`). But the measure is 623 / 567 / 261, not the promised 720 / 664 / 358 (SD-09). | **PARTLY** — the editor takes the part's own place, no margin editor exists (`money/1440`, `/1024`, `/390`). Measure 598 / 590 / 284, not 720 / 712 / 358 (SD-10). | **PROVEN** — three rates typed inside the 480 drawer *and* printed on the paper in the same frame (`money/1440`); single-column rate card, 431px in 432 usable — the only direction that hits its own number. Marred by SD-24. |
| **ii · keyboard reorder, add** | **PROVEN** — `Move up`/`Move down` on every head, nine persistent seam acts including beside the unwritten Role rates part, reorder announces position to `#room-status` (`resting/1440`). Caveat SD-26. | **PROVEN** — same, plus `Write this part` (`money/1440`). Caveat SD-26. | **PROVEN** — reorder from inside the drawer, every row, keyboard-reachable (`money/1440`, `/390`). Placement is add-then-reorder and drawn as such; SD-25. |
| **iii · 390** | **PARTLY** — the note takes `--rail`, a `--clay-ink` rule and a `THE STUDIO` head at 390 (`money/390`) — the register NO-4 asked for — but renders inside the paper's sheet (SD-02). | **PROVEN** — two `--rail` bands with running heads stack above the paper, one column, no leak (`money/390`). The cleanest 390 of the three. | **PARTLY** — the honest cost is genuinely drawn (`clause/390`: full-screen drawer, `← Back to the paper`, paper gone). But readiness and the send act go with it (SD-19, SD-20), which is more than the cost B agreed to pay. |
| **iv · readiness in place** | **PARTLY** — the notes swap correctly resting→money and `#room-status` moves with them (`resting/1440`, `money/1440`), but each note is level with the *following* part (SD-13), and the transition sentence never fires (SD-14). | **PROVEN** — margin carries readiness and both notes, each aligned to its own part, at 1440 and 1024; becomes the band at 390 (`money/1440`, `money/390`). | **PARTLY** — band above the paper carries readiness plus the document note (`resting/1440`); part-scoped blockers read inside the drawer (`money/1440`). But §3 B(iv) requires the sentence to *name the part* when the count moves — it does not — and the band is absent at 390 (SD-19). |
| **v · where the acts live** | **PARTLY** — send on the page at 1440 / 1024 / 390 with its consequence (`resting/390` confirmed). Return act at the outline's foot only at 1440 (SD-21), and its sentence is unreadable at 192px (SD-22). | **PARTLY** — same; return act at 1440 only, its sentence 13 lines at 168px, and at 390 the outline is at the foot of a 9,678px page (SD-21, SD-22, SD-23). | **NOT PROVEN** — send at the closed paper's foot at 1440, 1024 and `resting/390` ✓, return act at the page foot at the paper's measure ✓ (the best-set consequence of the three), but **no send and no return at 390 in clause or money** (SD-20). Two of three states fail. |
| **vi · R27 / R51 same body** | **PARTLY** — one `<h3>` per part, no second heading, the editor sits beneath the section ✓. But the `<h3>`'s content is a restyled tertiary act (SD-07), and the paper carries `Creates authority` and two move acts per part (SD-05, SD-06), so this is not a render a per-part export could produce unchanged. | **PARTLY** — the chrome renders the printed section *or* the field, never both, and never asks the body for a slot (`money/1440`) — the substitution is proven exactly as claimed. Same SD-05/SD-06 leak into the body. | **PROVEN** — the paper is the read-only render with one `.act--inline` appended per part; no body file touched, no studio metadata on the sheet (`resting/1440`, `money/1440`). |
| **vii · what it removes** | **PROVEN** — no rail, no editor column, no compact aside, no preview sheet, one count (`resting/1440`). | **PROVEN** — all of D's, plus the marginal-notes column; the margin carries readiness only (`resting/1440`). | **PROVEN** — and honestly: nothing is deleted, everything is relocated behind a door, and the plate says so (`resting/1440` vs `money/1440`). |

**Not proven, in one list:** D — (i) measure, (iii) NO-4, (iv) alignment and
transition, (v) return act below 1248, (vi) heading-as-control. A — (i)
measure, (v) return act below 1248, (vi) body leak. B — (iii) readiness and
send lost at 390, (iv) the sentence never names the part, **(v) outright**.

---

## §4 · Craft

**Hierarchy.** All three open the same way and the reduction works: eyebrow,
name, `DRAFT`, prepared-for, record, studio band, then the paper. The one flat
note is SD-32 — page title and paper headline at the same 26px Playfair. Below
that, D and A are dense: nine Playfair heads, nine to ten prose blocks, and 29
to 37 mono-caps acts on one sheet. B's paper has four levels and stays legible
to the bottom of a 2,951px plate.

**Rhythm on the 24px module.** A and B keep to it. D's inter-part gap measures
45px, eight times (SD-12) — a number that is on nothing.

**Measure.** Paper prose caps at 65ch in all three and reads well at 720, 664
and 358. The failures are in the narrow columns: D's and A's return-consequence
at 192 and 168px (SD-22), and A's `WRITE THIS PART · MOVE UP / MOVE DOWN` pair
wrapping to two lines under every part at 390 (SD-06).

**The seam and the fold, visible at rest.** D and A: nine persistent seam acts,
no hover-reveal anywhere in any file, `+ ADD A PART` legible at every width —
this is done well and it is the clearest advance over the shipped room. B has
one (SD-25).

**The current part, unmistakable.** All three: a 2px `--ink` leading rule plus
the words `— being written`, so the state survives hue removal (check 20c).
D and A also carry `NEEDS ATTENTION` in the outline against the Ceiling row.
Well judged, and identical across the three — the one place the files really
do look like one room.

**The terminal act with its amount.** All three: `Send the agreement ·
$5,000.00 retainer`, held, focusable, `aria-describedby` at the live blocker,
consequence sentence directly above it in every state, `Read the whole paper`
beside it in the quietest tier. Cents on every figure; no invented figure —
every number traces to fixture §6.1. This is the cleanest thing in the set and
it is the same in all three.

**The return act, quiet and at the foot, with its hold caption.** Present in
all three with `Press and hold to return` in `.t-meta` directly beneath.
B's placement (page foot, paper's measure) is the only one where the
consequence sentence is readable and the act is reachable at every width.

**Dark mode.** Legible everywhere; zero AA failures. The one soft spot is
SD-31 — fields read as holes rather than sheets.

**Does it read as a form or as a paper?** D: a ruled form with serif headings —
every heading is a control with an oak rule under it (SD-07), two acts under
every part, studio sentences on the stock. A: a form, most plainly at 390
(SD-06). B: a paper, with one quiet inline act per part and the machinery
behind a door. That ordering is the reverse of the panel's.

---

## §5 · Honesty between the directions

**Depth is equal; care is not evenly spent.** All three carry three states × three
widths × two themes, all nine plates real in each. File sizes 58 / 48 / 51 KB.
No direction is short a state or a width.

**B is not straw-manned — Kody's hunch holds, and then some.** B is drawn with
its full advantage visible: the paper stays in flow and updates in the same
frame as the drawer's fields; the drawer is genuinely non-modal (no veil, no
scroll lock, no `aria-modal`, no shadow — separation is a 1px `--ink-faint`
rule and a ground change, exactly as specified); the single-column rate card is
the only money answer in the set that meets its own declared measure; the paper
is the only one clean of studio metadata; the return act is the only one whose
consequence sentence is readable. Its costs are drawn rather than argued — the
390 plate shows the paper gone, and the "nothing removed" answer to crux (vii)
is stated plainly.

**Where the unevenness actually is, it runs against B.** B is the only file
that loses the readiness region and the send act at a width (SD-19, SD-20) —
and those are two of the three defects §1 opened with. Whether that is B's
honest cost or a build gap matters: SPEC §4 B explicitly promised "reflow at
390 keeps every act, the drawer's counted", so this is a gap, not a cost, and
fixing it costs B nothing conceptually.

**The subtler unevenness runs against the pick.** Three constraints declared
binding on all three — NO-4, §A10's nothing-to-say, and §F-C's action tiers —
are honoured by direction-3 and broken by direction-1: the notes in the paper's
sheet (SD-02), the naked heading for an unwritten part (SD-04), the tier
redefined into a Playfair heading (SD-07), the off-scale 13px Inter (SD-08),
the 45px gap (SD-12), the note anchored to the wrong part (SD-13), the
transition sentence that never fires (SD-14). D carries seven house or synthesis
breaches; A carries three; B carries one plus two 390 gaps. A reader comparing
plates is comparing a direction built loosely against one built tightly, and the
loose one is the recommendation.

---

## §6 · Verdicts

| File | Verdict | P1s to clear |
|---|---|---|
| `direction-1.html` (D · the galley) | **FIX** | SD-02 (NO-4 — notes inside the paper's sheet at every width), SD-04 (naked heading + studio sentence on the paper for an unwritten part) |
| `direction-2.html` (A · the paper is the page) | **FIX** | SD-04 (as above), SD-06 (37 mono-caps acts on the sheet — the paper reads as a form, worst at 390) |
| `direction-3.html` (B · builder as overlay) | **FIX** | SD-19 (readiness region absent at 390 in both editing states), SD-20 (no send act at 390 in both editing states — defect §1 row 3, reintroduced) |

None is a PASS; none is far from one. Every P1 is a placement fix, not a
redesign: two DOM moves in d1, one in d2, and two additions to d3's 390 drawer.

---

## §7 · Which direction the specimens make the case for

Read as pixels rather than as memos, **the specimens make their strongest case
for B** — it is the only direction whose paper stays a paper (one quiet inline
act per part against 29 and 37 mono-caps acts), the only one that meets its own
declared money measure, the only one clean of studio metadata on the client's
sheet, the only one whose return act and consequence sentence are readable and
reachable at every width, and the only one that proves crux (i) by drawing the
figure being typed and the figure being printed in a single frame. **That does
not match synthesis §6's pick of D**, and the mismatch is not a difference of
taste: D loses on the constraint the synthesis itself declared binding on all
three — NO-4 — plus §A10, §F-C and its own crux-(i) numbers, while B loses only
at 390 and only on two omissions that cost nothing to add. The honest reading
for the ruling sheet is that **the specimens have not yet tested the argument
they were built to test**: until d1's notes and rest row leave the paper's sheet
and its heads stop being controls, the D plate is not showing the galley the
synthesis argued for, and the comparison that decides AR-a is being made
against a version of D that the SPEC did not ask for.
