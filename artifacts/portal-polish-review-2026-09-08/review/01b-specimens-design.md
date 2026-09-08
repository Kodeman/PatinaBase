# 01b — Adversarial design review: the three specimens

Fresh context. I did not build these and I have not read the builders' reports.
Judged against `synthesis.md` (the five principles, keep/modify/decline, "must
keep"), `specimens/SPEC.md` in full, the three HTML files, every PNG in
`shots/specimens/`, the three current-portal renders, and the outside team's
slides 6/7/8.

**Verdict in one line.** Two of the three are the best-made client-facing
artifacts in this repository after the standalone invoice, and the Desk at 43
jobs is a genuine, provable win over both the shipped Desk and the proposal.
But the system has one structural defect that runs through all three — **money
is set at 12px and drawings are stroked in a colour that cannot be seen** — and
Specimen 1 ships two sentences that contradict the state they are rendered in.
Neither of those is a builder failure alone; both originate in the house sheet.

Severity: **P1** = a homeowner or principal would notice and lose confidence, or
a stated principle is inverted. **P2** = a designer or a careful reader would
notice; the system breaks. **P3** = craft debt, hygiene, or a small honesty gap.

No severity filter has been applied. 61 findings.

---

## A. Spec fidelity

### A.1 What the house sheet got, exactly right, in all three

Verified by grep and by render, so the fix pass does not re-litigate it:

- Token block pasted verbatim in all three; **zero hex literals outside it**
  except `#1F1D1A` (the sheet's own terminal-hover value) in specimens 1 and 3.
  (`#8984` in designer-desk is the `&#8984;` entity for ⌘, a false positive.)
- `box-shadow`: **0 occurrences** in all three files. `text-overflow: ellipsis`:
  **0**. `opacity: .5`: **0**. No pills, no status dots, no badges, no olive, no
  green fill, no ✓ glyph, no spinner, no PATINA wordmark inside a client page.
- The `disabled` attribute never appears on a gating act (the two `grep` hits at
  `client-house.html:24` and `decision-moment.html:23` are the token comment
  `/* — also the disabled ink — */`).
- All eight capture manifests report `errors: []`, `warnings: []`,
  `horizontalOverflow: false` at 1440 and 390.
- The act tier CSS is byte-identical to §A5 in all three. The type scale classes
  are identical in all three (bar the additions noted in B).
- `<html lang="en">`, exactly one `h1` per page, headings in order.

That is an unusually clean compliance record. Everything below is what it did
not get.

### A.2 Specimen 1 — `client-house.html`

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **SF-01** | **P1** | High | **The quiet-day and after-acceptance states ship sentences that contradict them.** In *Quiet day* the page says "Nothing needs you today" while the Study band note still reads "finished work waits for your acceptance", the shelving row still reads "awaiting your acceptance", and *What changed* still reads "It waits for your acceptance." In *After acceptance* the same three sentences survive, so the shelving row shows a stamp reading **ACCEPTED** beside a sentence reading **"awaiting your acceptance."** | `client-house-quiet-1440.png` (band note, row state, §5); `client-house-accepted-1440.png` — the stamp/sentence collision is one row, y≈900; source `:611`, `:642`, `:691` are static in all three states | Make the band note, the row state sentence and the *What changed* line state-scoped (`.v-default` / `.v-quiet` / `.v-accepted`), as the stamp already is at `:692-694` |
| **SF-02** | **P1** | High | **The gate accepts on a plain click.** `gateAct` fires `accept()` from the `click` handler whenever the name matches (`:966-973`); the 600ms `pointerdown` timer is a parallel path, not a gate. A mouse user who taps once and releases in 80ms is accepted. The visible caption "Press and hold to accept" is therefore false, and there is no keyboard hold at all. | `client-house.html:957` (`setTimeout(accept, 600)`), `:966-973`; caption at `:773` | Make `click` only *arm/report*; commit solely from a completed hold. Match Specimen 3's implementation (`decision-moment.html:781-800`), including its 900ms and its keydown/keyup parity |
| **SF-03** | **P2** | High | **Four of the six story-pole phases link to the wrong object.** Discovery, Design, Design refinement and Completion all point at `#previously`. The sheet says "six phases as links **to their bands**" and principle 5 says a sentence that names a thing links to it. Three different phase names resolving to the same anchor is worse than not linking. | `:621-632` | Link the phases that have a band; **omit** the ones that do not render (the landmark-ledger rule, §C row 2, already says "a landmark whose target does not render is omitted") |
| **SF-04** | **P2** | High | **The hold duration is 600ms, not the system's 900.** `HoldAction` in the repo is 900ms; Specimen 3 uses 900ms. Specimen 1 uses 600. | `:957` vs `decision-moment.html:794` | 900 |
| **SF-05** | **P2** | Med | **The `role="status"` line prints specimen language inside the mocked page.** Quiet day renders, at 12px mono directly under the letterhead: *"Quiet day. Nothing needs you today; **the wall gate is not on the page**."* A12 says the meta strip is the only place a prototype caveat may appear. | `client-house-quiet-1440.png` y≈186; `:554`, `:882-886` | Rewrite the three `STATES` strings as things the studio would say to Nora, or move the state announcement into the strip |
| **SF-06** | **P2** | Med | **The letterbox drawing displaces the terminal act on a phone.** At 390 the envelope SVG sits between the reconciling sentence and the consequence, pushing *Pay $4,060.00* ~140px further down the one screen the money block exists to own. Section §C also puts the drawing "right of the money figures at ≥960px" — it says nothing about keeping it below that. | `client-house-default-390.png` y≈300–410 | `display:none` on `.letterbox-fig` below 960px |
| **SF-07** | **P2** | Med | **Captions moved off the plate.** A10: "Caption, under every plate." Both captions sit under the *text* column instead, so the caption for the photograph is 120px to the right of the photograph and reads as a third state sentence. | `:677`, `:692`; render y≈773 and y≈859 | Keep the caption in the text column if the 96px measure forbids it — but set it in `--ink-faint` and pull it tight under the state line, so the reading order is name → state → source. Currently all three are the same weight |
| **SF-08** | **P2** | Med | **The wall-gate elevation has no caption.** Specimen 3 captions the identical drawing ("North wall · drawing by Local Dev Studio · 3 September 2026"). Specimen 1 does not. | `:701-…` vs `decision-moment.html:606` | Add it |
| **SF-09** | **P3** | High | **The docking rule is gated on a one-way `.has-scrolled` class.** Once any scroll happens the class is added and never removed, and the rule applies at all times thereafter regardless of whether `#wall` is on screen. | `:495`, `:922` | Drop `.has-scrolled`; `position: sticky; bottom: 0` on the gate row is already correctly bounded by its parent |
| **SF-10** | **P3** | Med | **`[aria-disabled]` instead of `[aria-disabled="true"]`** (declared departure). It works only because the script *removes* the attribute rather than setting it false — which is the opposite of what Specimen 3 does. | `:217-227` vs `decision-moment.html:210-220` | Use the sheet's `="true"` selector in both, and pick one script behaviour |
| **SF-11** | **P3** | Med | **The unmet reason never clears.** `#gate-reason` ("Type your full name to accept.") stays visible and stays in `aria-describedby` after the name matches. | `:777`, `:936-943` | Swap it for the hold instruction once met |
| **SF-12** | **P3** | Low | The empty `h2` heading levels are fine, but `#wall`'s `h3` sits inside a section with no `h2` of its own; it reads correctly only because the Study band's `h3`s precede it. | `:701` | Non-blocking |

**Adjudicating the declared departures.** Captions beside the plate: **half
right** — the reason is sound, the execution flattens the hierarchy (SF-07).
Sticky dock behaviour: **wrong as implemented** (SF-09), right in intent.
`[aria-disabled]` selector: **wrong** (SF-10) — a specimen that exists to fix
IX02/A16 should model the exact selector the fix ships with.

### A.3 Specimen 2 — `designer-desk.html`

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **SF-13** | **P1** | High | **The row name — the primary target on the Desk — has no perceptible resting affordance.** `.row-name { border-bottom: 1px solid var(--rail) }` puts `#E8E3DB` on `#FAF7F2`: ≈1.14:1. In the render there is no visible rule under any job name. The one specimen commissioned to fix IX03/IX04/B01 (a resting rule below 3:1) reproduces the same failure on the row it exists to make clickable — while the *Open* act 700px to its right carries a correct 4.20:1 oak rule, and the same job name in the day's line carries one too. | `designer-desk-default-1440.png` — compare "Marcus Wright" (no rule) with "Marcus Wright" in the day's line (ruled) and "OPEN" (ruled); source `:336-340` | `--oak` at rest, `--clay`/`--ink` on hover. (The sheet asked for `--rail` here; the sheet is wrong.) |
| **SF-14** | **P2** | High | **Two invented people, and the fixture's real one is missing.** §B says "Invent no other names." *By person* introduces **Anneke Sund** and **Colin Brandt**; §D specifies *Leah Hartwell · Marta Voss · unassigned*. Marta Voss — the joiner named in both client-facing specimens — does not exist on the Desk, and "unassigned", the one grouping with an operational meaning, is gone. | `:599`; `designer-desk-byperson-1440.png` | Leah Hartwell · Marta Voss · unassigned |
| **SF-15** | **P2** | Med | **The margin note does not collapse at 390.** §D's 390 layout says "the margin note collapses to one line". It renders as four lines of 20px Playfair italic, costing ~90px above the day's line on the one screen. | `designer-desk-default-390.png` y≈175–265 | Truncate-free collapse: a shorter string below 700px, or drop the second sentence |
| **SF-16** | **P2** | Med | **The roster and the studio index are set to two different measures.** `.desk-grid` gives the roster `1fr` of a 1052px content box minus a 260px boards column and a 48px gap = 744px; `.studio-index` sits outside the grid at the full 1052px. At 1440 the index's right edge is ~158px past the roster's. Principle 5 is one scale and one rhythm; this is two page widths on one page. | `designer-desk-byperson-1440.png` — roster rows end x≈908, index columns end x≈1066; source `:246-252`, `:353` | Put the index inside the grid's first column, or reserve the boards gutter page-wide |
| **SF-17** | **P2** | Med | **The urgent mark is not distinguishable from the quiet mark.** `--terracotta #D4A090` and `--clay #C4A57B` at 7px, on paper, read as the same tan dot. The one overdue job's mark is the loudest thing that column is for. | `designer-desk-needsme-1440.png` — Vandersteen's disc vs Marcus Wright's | Use `--terracotta-ink` (a paper ink, 4.5:1+) for the urgent disc, or give it a ring; keep the colour supplementary to the terracotta clause, which already works |
| **SF-18** | **P3** | High | **The `role="status"` line duplicates the roster head 20px below it.** "EVERY JOB · 16 LIVE · 1 OVERDUE" then "Showing all 16 jobs · grouped by stage." At 390 the status renders *above* the head it summarises. | `designer-desk-default-1440.png` y≈296 and y≈474; `:403-408` | Keep the live region visually hidden until it changes, or fold the grouping into the head sentence (it already folds the facet in) |
| **SF-19** | **P3** | High | **Row names link to their own `id`.** `href="#job-x"` on the `<li id="job-x">`. Every job name and every day's-line link is a self-referential no-op. | `:690` | Fine for a specimen; name it in the fix pass so it is not mistaken for a working target |
| **SF-20** | **P3** | Med | **The facets jump line when the head sentence grows.** In *Only what needs me* the head runs to "· showing what needs you", the row wraps and the facets drop to a second line, moving both controls ~40px. | `designer-desk-needsme-1440.png` y≈329/369 vs `default` y≈296 | Reserve the facet row |
| **SF-21** | **P3** | Med | **The declared "empty result" state is unreachable.** "Nothing needs your hand today." only renders if `needsMe` yields zero, which this fixture cannot produce. | `:733-735` | Add a switcher state, or accept it as untested |
| **SF-22** | **P3** | Low | `.row-act .act { margin-block: -9px }` pulls the 44px target into a 44px row by overlapping its neighbours; adjacent *Open* hit areas touch. | `:352` | Reduce the act's own padding instead |
| **SF-23** | **P3** | Low | The Desk's date carries no year ("TUESDAY · 8 SEPTEMBER") where every other date in the three specimens does. Sheet's own wording. | `:441` | Leave, or align to principle 2's one date style |

**Adjudicating the declared departures.** Adding **Hollenbeck**: **right, and a
good catch** — §B claims "16 live" but lists only 15 jobs (3+1+3+2+3+2+1); the
builder reconciled the sheet's own arithmetic using a name from the sheet's own
approved list. Keep it. Day's-line links **without** the 44px box: **right** —
inline text links are exempt from 2.5.5/2.5.8 target sizing, and the alternative
is the disease Specimen 1 caught (CR-01). This is the correct solution and the
system should adopt it; see OS-01. Facets **only in the head**: **right** — §D
puts them there and the render proves they hold at 43 jobs.

### A.4 Specimen 3 — `decision-moment.html`

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **SF-24** | **P1** | High | **At 390 the docked act slices its own consequence sentence in half.** `.acts--dock` is `position: sticky; bottom: 0` with an opaque `--paper` ground and it overlays the flow content above it. Both papers show it: "Noting your choice tells Leah which finish to price" and "Accepting releases $2,980.00 to Marta Voss for" are each cut mid-line. Principle 3 requires a consequence sentence above **every** terminal act, in **every** state; on a phone it is physically unreadable. | `decision-moment-390.png` y≈820 and y≈1180 | Give the docked row `position: sticky` **plus** matching bottom padding on the paper, or dock only the act while the consequence scrolls with the paper as §E's layout note requires ("the consequence sentence stays with the paper above it") |
| **SF-25** | **P1** | High | **At 390 the terminal act precedes the gate it depends on.** Because the dock is scoped to `#closeB`, the order on a phone renders: consequence (sliced) → **ACCEPT THE FINISHED WORK · $2,980.00** → "Press and hold to accept" → the date → the input rule → "Type your full name to accept." The act comes before its own signature field. | `decision-moment-390.png` y≈1180–1420 | Same fix as SF-24; verify field-then-act order at 390 |
| **SF-26** | **P1** | High | **The money table is right-aligned to the whole page.** `.ledger { width: 100% }` puts "$2,100.00" ~1,000px from "Piece", with no leader and no rule between them. §E's layout says "right-aligned to the **document's measure**". The panel called the proposal's money table "the best-composed object in the deck"; this composition is worse than the thing it replaces. It is well composed at 390, which is the proof it only needs a `max-width`. | `decision-moment-1440.png` y≈826–895 vs `decision-moment-390.png` y≈600–680; source `:356` | `max-width: 56ch` (or 420px) on `.ledger` |
| **SF-27** | **P2** | High | **The legend rail ships a live, enabled, filled terminal act carrying a money figure.** "ACCEPT · $2,980.00" is a real `<button>` in the sticky rail, sitting 1,300px above (and, in the accepted state, *beside*) the real act for the same amount. In *Accepted*, the page shows an enabled Accept · $2,980.00 next to a record saying it is already accepted — IX11 exactly. | `decision-moment-1440.png` legend y≈525; `decision-moment-accepted-1440.png` legend y≈499 beside the record at y≈1565; source `:645-664` | Render the legend specimens as inert (`role="img"` / `<span>` styled as the act, `aria-hidden` where duplicated), and drop the figure from the legend label |
| **SF-28** | **P2** | High | **Two type sizes outside the seven-step scale.** `@media (max-width: 600px)` redefines `.t-d1` to 28px and `.t-d2` to 22px. The sheet says "Nothing else." Neither of the other two specimens does this. The proposal was condemned for 25 sizes against a stated six; this quietly makes it nine against a stated seven. | `:433-434` | Delete, or add the two steps to the sheet for every specimen |
| **SF-29** | **P2** | High | **The signature rule is 900px long.** The input is `width: 100%` of the document column; the record block's own signature rule beneath it is `max-width: 320px`, and Specimen 1's input is `max-width: 360px`. The same field is drawn at three widths across two specimens. | `decision-moment-1440.png` y≈1690; source `:387-397` vs `:411`; `client-house.html:386` | `max-width: 360px` everywhere |
| **SF-30** | **P2** | Med | **`role="radiogroup"` with `aria-pressed` buttons is invalid ARIA.** A radiogroup's children must be `role="radio"` with `aria-checked`. Toggle buttons are not valid children and screen readers will announce a group with no radios. The sheet asked for this combination; it is still wrong and will fail any audit. | `:537-540` | `role="radio"` + `aria-checked`, or drop the radiogroup and keep the pressed buttons |
| **SF-31** | **P2** | Med | **"The finish selection is preserved" is not demonstrated.** The only path to *Save failed* is the switcher, and `setState` calls `reset()` first, which restores `restA` and forces `finish = 'Natural oak'`. Select Smoked oak, hit *Save failed*, and the selection is gone — the one thing §E's failed state promises. | `:719-729`, `:801-812` | Have the failed state preserve the current chip |
| **SF-32** | **P2** | Med | **The notch does not read as closed.** `is-closed` fills the notch with hatching, but the `dw-detail` outline rect stays drawn on top, so in the accepted render the square still reads as a hole. | `decision-moment-accepted-1440.png` y≈1360 vs `decision-moment-1440.png` y≈1435 | Hide the outline rect when closed |
| **SF-33** | **P3** | High | **The colophon is not the last block at 390.** The legend moves below the documents *and below the colophon*, so "Prepared by Local Dev Studio · Sent through Patina" is followed by 700px of specimen furniture. A8 says the colophon is the last block. | `decision-moment-390.png` y≈1740 then legend to y≈2810 | Move the legend above the colophon, or into the meta strip at 390 |
| **SF-34** | **P3** | High | **Seven dead controls.** `data-act="legend"` matches the `[data-act]` branch and falls through with no handler: the three legend specimens, and *Filed under Previously*, *Back to the house*, *Recorded in Previously*, *Back to the house*. Specimen 1 renders the same four as `<a href>` links that navigate. | `:834-841`, `:689-712` | Links, as in Specimen 1 |
| **SF-35** | **P3** | Med | `aria-disabled="false"` is left on the armed act rather than removed — the mirror image of Specimen 1's choice (SF-10). | `:730-733` | Pick one |
| **SF-36** | **P3** | Low | `.status { min-height: 25px }` against the sheet's kept value of 28px, and it sits *above* the first letterhead, so the page opens on ~49px of nothing. | `:341` | 28px; move the status below the letterhead as Specimen 1 does |
| **SF-37** | **P3** | Low | The right rail's `border-left` is only as tall as its content and stops at y≈635 of a 2,112px page — it reads as an unfinished rule rather than a column edge. | `decision-moment-1440.png` | Full-height rule, or drop the border and rely on the gap |

**Adjudicating the declared departure.** Keeping the money **table**:
**right** — `<table>` with `<th scope="row">` is the honest semantics for a
ledger, it is what a screen reader needs, and §E's prose description does not
forbid it. But the table's *width* is wrong (SF-26) and the figures inside it
are too small (PR-05); the departure is right and its execution is the worst
composition in the three files.

---

## B. One system

Set side by side, these read as one system at 20 feet and as three authors at
two feet.

**What is genuinely identical:** the token block, the act tier CSS, the type
scale classes, the letterhead grammar (`.t-head` studio left / `PREPARED FOR
NORA ELLISON` right, `.t-d1` title, `.t-meta` sub, hairline at 24px), the
colophon string and position, the stamp, the consequence class, the specimen
meta strip, the reduced-motion block, the paper stocks, the hairline weights,
and the dark palette (all three added the same `:root:not([data-theme="light"])`
+ `:root[data-theme="dark"]` pair, which the sheet did not ask for but which all
three did the same way — a good sign).

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **OS-01** | **P1** | High | **The same tier is drawn two opposite ways in two specimens.** A tertiary link inside a running sentence: Specimen 2 strips the box and sets it as a body-size, sentence-case, oak-ruled inline link (`:270-271`); Specimen 1 leaves the full `.act` box — 13px DM Mono, UPPERCASE, `min-height: 44px` — inside a 26px Playfair sentence. The result is "**FINISHED WORK** waits for your acceptance." reading as a chip glued to a sentence, with a broken baseline. **Specimen 2 is right.** | `client-house-default-1440.png` y≈219 vs `designer-desk-default-1440.png` y≈349–413; sources `client-house.html:567`, `designer-desk.html:270-271` | Add `.act--inline` to the house sheet — body family, sentence case, no min-height, oak rest rule — and use it in the doorstep and everywhere a sentence names an act |
| **OS-02** | **P1** | High | **The same terminal act has two behaviours.** Specimen 1: 600ms, no keyboard hold, and a plain click commits. Specimen 3: 900ms with a visible ink fill, keydown/keyup parity, `pointerup`/`pointercancel`/`pointerleave` cancel, and a click while unmet moves focus and announces. The system's "defensible if disputed" claim rests on the second. | `client-house.html:955-973` vs `decision-moment.html:781-828` | Specimen 3's implementation, everywhere |
| **OS-03** | **P2** | High | **The hold fill exists in one specimen only, and is not in the sheet.** `.act--terminal .fill` (scaleX ramp over 900ms, `--ink-faint`, `overflow:hidden`) is invented in Specimen 3. It is the right invention — the shipped `HoldAction` has one, and A5's loading section only forbids rings and spinners — but it is a component the sheet does not define and Specimen 1 does not have. | `decision-moment.html:218-231` | Promote the fill into §A5 verbatim; add it to Specimen 1 |
| **OS-04** | **P2** | High | **The hold caption is above the act in one specimen and below it in the other.** §C row 8 puts it above; §E B6 puts it "directly under". Both builders obeyed. The sheet contradicts itself. | `client-house.html:773-776` vs `decision-moment.html:629`; both renders | Pick one — below the act, per §E, so the reading order is consequence → field → act → gesture |
| **OS-05** | **P2** | High | **`aria-pressed` has a visual state in one specimen and none in the other two.** Specimen 2 defines `.act--tertiary[aria-pressed="true"]` (ink + 1.5px ink rule) and it reads clearly. Specimens 1 and 3 set `aria-pressed` on their meta-strip switchers with no styling at all, so the current state is invisible to sighted users. | `designer-desk.html:169-170`; `client-house.html` (absent), `decision-moment.html` (absent); `decision-moment-1440.png` — DEFAULT / NOTED / ACCEPTED / SAVE FAILED are visually identical | Promote Specimen 2's rule into §A5 |
| **OS-06** | **P2** | High | **The bottom bar is the only large field of `--ink` on any of the three pages, and it is spent on navigation.** Principle 3 reserves filled charcoal for "money moves or a paper is signed". A full-width charcoal footer spends that pigment on a nav rail, which is exactly the dilution the tier system exists to prevent. It is also the outlier against the shipped Desk, whose bar is light paper. **And it inverts in dark mode:** because it uses `--ink` ground / `--ink-paper` text, in dark mode it renders as a bright cream band and becomes the loudest object on the page. It also forces a second focus pigment (`--clay` instead of `--clay-ink`) because `--clay-ink` on charcoal is ≈2:1. | §D row 10 (the sheet asks for it); `designer-desk-default-1440.png` y≈1930; `designer-desk-1440-dark.png` y≈1930 (cream band); `shots/current/desk-final-desk-1440.png` (shipped bar is paper); source `:376-380`, `:398` | Paper ground, 1px `--hairline-strong` top rule, `--ink` text. This is a sheet change, not a builder fix |
| **OS-07** | **P2** | High | **`.plate` means two different objects.** In Specimens 1 and 3 it is a bordered image plate (96/120px, `--paper-doc`, `--hairline`). In Specimen 2 it is a coloured stage plate (`--tab-*`, white label). Same token name, different components — the first thing that will collide when this becomes real CSS. | `client-house.html:275-283` / `decision-moment.html:308-312` vs `designer-desk.html:212-224` | `.plate` (image) and `.stage-plate` |
| **OS-08** | **P2** | Med | **Three page frames.** Specimens 1 and 2 use a 1100px content measure; Specimen 3 uses `max-width: 1392px` with a 200px rail, giving a 1096px document column. Close enough to survive, but the sheet says one number. | `client-house.html:310`, `designer-desk.html:206`, `decision-moment.html:325` | State the rail-inclusive frame in A4 |
| **OS-09** | **P3** | High | **`-webkit-font-smoothing: antialiased` in Specimen 3 only.** On macOS this renders the same Inter at the same size visibly lighter than in the other two. Set the three side by side on a Mac and Specimen 3's body copy is a different weight. | `decision-moment.html:121` | Remove, or apply to all three |
| **OS-10** | **P3** | Med | Two `aria-disabled` idioms (attribute removed vs set to `"false"`), two selectors (`[aria-disabled]` vs `[aria-disabled="true"]`). | SF-10, SF-35 | One |
| **OS-11** | **P3** | Med | Running-head ink is inconsistent: Specimen 2 sets `BOARDS`, `THE STUDIO INDEX`, `ROOMS`… to `--ink-faint`, while `EVERY JOB · 16 LIVE` is default `--ink`; Specimen 1 sets `WHAT YOU OWE` to `--ink` and the letterhead heads to `--ink-muted`. Four inks for one rank. | `designer-desk.html:284`, `:359`, `:364`; `client-house.html:318` | One ink for running heads (`--ink-muted`), one for the marked head |

---

## C. The five principles, applied

### Principle 1 — the studio is the author; Patina is the press

**Demonstrated.** All three open with the two-sided letterhead and close with
the colophon. No PATINA wordmark inside either client page. "Prepared for Nora
Ellison", never "CLIENT USER" — BE-23 answered. Leah signs with her full name,
her studio and a date, in Playfair italic, with no avatar disc — BE-10 answered.
"Sign out" replaces "Leave the house" — BE-09 answered. The Desk's bar prints
"Leah Hartwell" as a person and "LOCAL DEV STUDIO" as the studio rather than the
shipped page's same-name-twice.

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **PR-01** | **P2** | High | **The studio's name is the smallest type on every client page.** The letterhead sets `LOCAL DEV STUDIO` at `.t-head` — 11px DM Mono caps — while the standalone invoice, the artifact the synthesis names as the model ("already does this and it is the strongest brand artifact in the system", BE-26), sets **Quist Interiors at ~24px Playfair** over a mono sub-line. The specimens print the author's name at the quietest rank available and the house name at 34px. On the principle that the studio is the author, that is backwards. | `shots/current/invoice-open-desktop.png` y≈107 vs `client-house-default-1440.png` y≈81; `client-house.html:544` | Follow the invoice: studio at `.t-d3` Playfair with the locality and preparer at `.t-meta` beneath; keep `PREPARED FOR NORA ELLISON` at `.t-head` right |
| **PR-02** | **P3** | Med | The mat reprints all four Previously rows verbatim ~120px below the Previously list. The same four papers, twice, on one page. Sheet-specified (§C rows 12 and 13), but repetition reads as padding. | `client-house-default-1440.png` y≈1610 and y≈1798 | Make the mat's papers column a count and a link, or drop it |

### Principle 2 — money, dates and names carry the largest true type

This is the principle the three specimens fail hardest, and the failure is in
the sheet.

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **PR-03** | **P1** | High | **`.t-money` is 12px. Principle 2 sets a floor of 15px for "any money figure".** Every ledger figure in all three specimens — `$11,100.00`, `$0.00`, `$4,060.00` in the reconciling sentence; `$8,120.00` and `$2,980.00` on the piece rows; `Trade scope · $2,980.00` on both wall gates; `$2,100.00`, `$180.00` and the **Total $2,280.00** — renders at 12px DM Mono. The shipped invoice sets its line-item figures at ~15–16px and its balance at ~30px. The specimens are a **downgrade in money legibility from the artifact the panel named as best in system.** | `A3` (`.t-money` = `.t-meta` + tabular); rendered in all three; `shots/current/invoice-open-desktop.png` for the comparison | Add a `.t-money` step at 15px/1.5 tabular and reserve 12px for captions and dates only. This is a sheet change |
| **PR-04** | **P1** | High | **The terminal act names its amount at 13px in mono UPPERCASE.** "ACCEPT THE FINISHED WORK · $2,980.00" and "PAY $4,060.00". Principle 2 requires sentence case at ≥15px for a money figure; the invoice's own button — the pattern the synthesis says to generalise — reads **`Pay $9,130.00`** in ~16px sentence-case body. The specimens set the single most consequential money figure on the page in the smallest, loudest, least readable treatment available. | `A5` (`.act` = 13px, `text-transform: uppercase`); `client-house-default-1440.png` y≈449; `shots/current/invoice-open-desktop.png` y≈990 | `.act--terminal` overrides to `--font-body`, 16px, weight 500, sentence case, tracking 0. Keep mono caps for tertiary/secondary |
| **PR-05** | **P1** | High | **No announced money figure on either decision paper.** A3 says "the single announced money figure at the head of a money block takes `.t-d2`". Paper (A)'s money block has none — the Total is 12px. Paper (B)'s `$2,980.00` appears at 12px under the h2, then only inside a 15px sentence and a 13px act label. On the authorization that releases $2,980, the figure never renders above 13px. | `decision-moment-1440.png` y≈895 and y≈1328; source `:498-508`, `:594` | Promote the Total and the trade-scope figure to `.t-d2` |
| **PR-06** | **P2** | High | **Two families for money inside one block.** In paper (A) the ledger figures are `.t-money` (mono) and the allowance sentence 40px below sets `$2,600.00` and `$320.00` in Inter body. In Specimen 1's reconciling sentence, mono 12px figures sit inside 16px Inter prose and visibly drop a size mid-sentence. VC-10 is the panel finding about one payment in three families; this is two families within 40px. | `decision-moment-1440.png` y≈895/933; `client-house-default-1440.png` y≈348 | One family per figure means the allowance sentence's figures are `.t-money` too — and once `.t-money` is 15px, the size break inside prose disappears |
| **PR-07** | **P2** | High | ✅ **The owed figure does outrank the agreed figure** — `$4,060.00` at 26px Playfair with "due 11 September 2026" beneath, and the reconciling sentence under it. IX39/BE-38/IX47 answered. One date style ("11 September 2026") throughout. No `$0` placeholder. | `client-house-default-1440.png` y≈310–348 vs `shots/current/client-local-dev-desktop.png` y≈218 | Keep exactly |

### Principle 3 — every act shows its weight and its consequence

**Demonstrated, and this is the strongest of the five.** The three tiers are
legible side by side; the legend rail teaches them in one glance; the resting
oak rule is unconditional and has no `scaleX(0)` anywhere (IX03/IX04/B01
answered for `.act`); the terminal act is filled charcoal, never olive; the
amount is inside every terminal label; a consequence sentence at 15px sits above
every terminal act in every state; `aria-disabled` with `aria-describedby`
replaces `disabled` (A16/C05 answered); activating it while unmet moves focus
and writes the reason to `role="status"` (never silently nothing); the hold is
announced visibly (IX01 answered); the act is replaced by its record, and the
record is the best-made object in the three files.

Contradictions: **OS-02** (one gate accepts on click, so its own announced hold
is false), **SF-27** (a live filled terminal act in the legend beside a record
saying the act is taken — IX11 reproduced), **SF-24/25** (the consequence
sentence physically clipped, and the act placed before its gate, at 390),
**PR-04** (the amount named at 13px caps), **OS-06** (terminal pigment spent on a
nav bar).

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **PR-08** | **P2** | Med | **Selection and authorization are correctly separated in wording but not in weight on the page.** "Note my choice — Natural oak" (secondary, two rules) vs "Accept the finished work · $2,980.00" (terminal, filled) reads correctly at 1440. At 390 both dock identically as a full-width sticky bar on a paper ground, so the tier difference collapses to the difference between a ruled word and a grey box. | `decision-moment-390.png` y≈880 and y≈1215 | Keep the terminal act full-bleed in the dock; leave the secondary act undocked in the flow |

### Principle 4 — honest imagery at real scale

**Demonstrated.** Exactly one photograph, used once, in Specimen 1 only,
captioned as an installation photograph inside the page and declared as a
stand-in in the meta strip. Every other object is drawn. Every caption carries
what / whose / when. No procedural fill, no stock, no generated room captioned
as the client's, no hash block, no broken-image glyph. Empty rooms are a room
name, a floor line and one sentence — **IA-31/IX41/VC-45 answered outright, and
this is the cleanest single fix in the three files.**

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **PR-09** | **P1** | High | **The drawings are stroked in a colour that cannot be seen.** A10 mandates the silhouette "stroke `--rail` at 1.25px". `--rail #E8E3DB` on `--paper-doc #FCFAF6` is ≈**1.14:1**. In dark mode `--rail #3A3530` on `--paper #2A2622` is ≈**1.3:1**. This is not a contrast-standard question — it is below the threshold at which a 1px line is a line. Affected: the reading-chair silhouette, the Study section, the letterbox, the road, the three board thumbnails, the round-table plate, and every hatch line on both wall elevations. The answer to VC-44's placeholder problem is drawn in invisible ink. | Light: `client-house-default-1440.png` — the chair plate at y≈756 and the section at y≈650 are barely legible at 100%. Dark: `client-house-1440-dark.png` — the letterbox at y≈340 and the chair at y≈756 have all but vanished; `designer-desk-1440-dark.png` — the board sheets read only through their colour swatches. Source: `.dw-stroke`/`.dw-piece`/`.hatch-line` in all three | Draw in `--ink-faint` (6.51:1) with `--rail` reserved for a *second*, subordinate line. This is a sheet change and it is the single highest-value fix in the pass |
| **PR-10** | **P2** | High | **The one photograph is spent at 96px.** The single seductive asset in the system is cropped to a 96×96 thumbnail (64px at 390) where nothing of the room is readable. Meanwhile the proposal shows the same class of image at 950×420 and it is the reason Nora said "I was about to feel proud of a room I don't have." The specimen is honest and it is *dull* — BE-22's exact warning, unanswered. | `client-house-default-1440.png` y≈841; `shots/proposal/slide-06-1440.png` | Give the *installed* photograph a band-width plate (the honest counterpart to the proposal's hero: a real installed room at real size, captioned, appearing only once work is standing). The source hierarchy permits it; the sheet's plate table forbids it |
| **PR-11** | **P2** | Med | **The Study section drawing is an anonymous rectangle problem in miniature.** At 1440 it is a 132px-tall, ~880px-wide box containing one dashed rectangle and one solid rectangle, drawn in the invisible stroke. It reads as an empty wireframe, and the dashed/solid distinction — the whole information content — is not perceptible until you know to look. The page condemns empty rectangles for rooms and then draws two of them for pieces. | `client-house-default-1440.png` y≈620–700 | With PR-09's stroke it will read; also give the standing piece a shelf line or two, so "standing" is a *drawing* and not a rectangle |
| **PR-12** | **P2** | Med | **The board thumbnails are the weakest drawn objects in the set.** Three 92px abstract compositions of empty rectangles with one or two colour blocks. They answer IA-17's placement question (creative work beside the day's work) but not its substance question. Against slide 8's photographic board strip this is where the Desk looks cheapest. | `designer-desk-default-1440.png` y≈310–690; `shots/proposal/slide-08-1440.png` | Either draw richer boards (a swatch stack, a section, a plan fragment — the studio's actual marks) or accept photographs of the studio's own boards, which the source hierarchy explicitly permits ("the studio's own board or scan still") |
| **PR-13** | **P3** | Med | The road drawing is a ruler with a dashed crate on it and a 40px house. 112px of page for one fact already stated in the sentence above it. | `client-house-default-1440.png` y≈1400–1445 | Cut it, or make it carry something the sentence does not |

### Principle 5 — one scale, one rhythm, absence is silence

**Demonstrated.** Seven steps, named classes, no inline `font-size`, Playfair
tracking 0, no truncation anywhere, wrap everywhere (the Previously rows wrap to
two lines as specified — IA-29/IA-30/VC-46 answered). Three radii only. Three
paper stocks. No shadows. Regions with nothing to say render nothing: the day's
line does not render at zero needs; the quiet day omits the wall gate and its
landmark; the mat prints no empty column headers (BE-24/VC-36 answered); the mat
groups only render when they have rows.

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **PR-14** | **P2** | High | **The 24px module is broken by the letterbox drawing.** Because the drawing is 180px tall in a 2fr column beside a shorter 3fr figure column, the consequence sentence's top edge is set by the SVG's height, not by the module: ~55px of dead space under the reconciling sentence at 1440. The largest object in the money block is a decorative envelope, and it also dictates the block's rhythm. | `client-house-default-1440.png` y≈348–422; source `:338-343` | Cap the figure at ~200px and align its baseline to the module, or move it beside the act row |
| **PR-15** | **P2** | High | See SF-16 — two page measures on the Desk. | | |
| **PR-16** | **P2** | Med | **The story pole does not show where you are.** All six phases render identically — same mono caps, same oak rule; the held phase is marked only by a 8×10px caret and a 12px date. "You are in: Study" exists only as the ≤899px sticky bar's label. IA-23 asked for a navigable pole; it is now navigable (four links notwithstanding, SF-03) but no longer legible as a position. | `client-house-default-1440.png` y≈565–730 | Set the held phase in `--ink` at `.t-body-sm`, and give the caret its own weight |
| **PR-17** | **P3** | High | **The specimens do not carry the shipped page's whole-house key.** The current client page draws one elevation of Study · Hall · Stair · The road with the open gate hatched on it, plus a legend ("HATCHED / OPEN"). It is the one image that shows the homeowner her whole house with the one open mark on it. The specimen replaces it with three separate room bands and no key. | `shots/current/client-local-dev-desktop.png` y≈330–410 | Not a defect — but decide deliberately whether the whole-house drawing is being retired. It is the closest thing the current page has to "the story pole navigates" |

---

## D. Craft

| ID | Sev | Conf | Claim | Evidence | Fix |
|---|---|---|---|---|---|
| **CR-01** | **P1** | High | **The doorstep headline (judged).** "**FINISHED WORK** waits for your acceptance." puts a 13px DM Mono UPPERCASE inline-flex box with a 44px min-height and an oak underline at the head of a 26px Playfair sentence. Three mismatches at once — family, case, size — plus a baseline shift from the flex box. It reads as a tag stuck to a sentence, not as a sentence with a live phrase in it. At 390 it is worse: the chip sits alone at the start of a line that then wraps. **Wrong, and it is the first thing on the homeowner's page.** | `client-house-default-1440.png` y≈219; `client-house-default-390.png` y≈205–230; source `:567` | See OS-01 — `.act--inline` at 26px Playfair, sentence case, with the oak rest rule. Specimen 2 already proves the pattern at 16px |
| **CR-02** | **P2** | High | **The typographic hierarchy is carried by ~35 lines of 11–12px monospace on one page.** Count on `client-house-default-1440.png`: two letterhead heads, the sub, five landmark links, the doorstep sub, "WHAT YOU OWE", "due 11 September 2026", three figures in the reconciling sentence, the Invoice caption, "WHAT CHANGED SINCE YESTERDAY", the band note (3 lines), two drawing labels, two piece captions (3 lines), two prices, six pole entries plus a date, the gate money line, the reason, the hold caption, four Previously dates and four state words, three mat headers, the colophon. This is the single thing that will make a homeowner read the page as *technical* rather than as *a document from her designer*. The proposal's mockup runs its supporting layer at 15–17px sentence case and reads warmer for it. | `client-house-default-1440.png`; `shots/proposal/slide-06-1440.png` | Move captions, state words and dates to `.t-body-sm` (14px Inter) and keep DM Mono for running heads and figures only — which is exactly what the synthesis's own KEEP row says ("DM Mono caps retained for **running heads only**", A12/C12). The sheet's `.t-meta` "values" role over-extends it |
| **CR-03** | **P2** | High | **Optical alignment fails at the signature line in both specimens.** Specimen 1: the input rule ends at x≈410 while its date sits at x≈665, on the same baseline, with 250px of nothing between them — they do not read as one field. Specimen 3: the rule runs 900px to meet the date, which is worse. | `client-house-default-1440.png` y≈1090; `decision-moment-1440.png` y≈1690 | 360px input, date immediately right of it, both on the module |
| **CR-04** | **P2** | High | **Three stacked 12px mono lines of identical appearance below the Specimen 1 gate:** the reason ("Type your full name to accept."), the hold caption ("Press and hold to accept"), and the date. Three different kinds of information at one rank. | `client-house-default-1440.png` y≈1110–1135 | Reason at `.t-body-sm` in `--ink`, hold caption at `.t-meta` in `--ink-subtle`, date beside the field |
| **CR-05** | **P2** | Med | **The finish chips are quieter than the proposal's, and selection is easy to miss.** Selected = `--rail` ground + a 1.5px `--ink` left rule; unselected = `--paper-doc`. Against `#FAF7F2` the rail ground is a ~2% shift, so at a glance the pair reads as two identical boxes. The proposal's selected chip carries a 2px ring at an offset and is unmistakable. The specimen is right to refuse the swatch disc and the ✓; it is wrong to make the state this quiet. | `decision-moment-1440.png` y≈713; `shots/proposal/slide-07-1440.png` y≈950 | Keep the named-in-words chip; strengthen selection to a 2px `--ink` full box rule (a rule, not a fill — the system's own grammar) |
| **CR-06** | **P2** | Med | **Hairline rhythm is inconsistent between the two client papers.** Specimen 1 draws the letterhead rule with `<hr>` inheriting `--hairline`; Specimen 3 draws it with a `div` at `background: var(--hairline)`; Specimen 3's money rule and record rule are `--hairline-strong`, Specimen 1's record rule is `--hairline-strong` but its band rules are `--hairline`. Correct per the sheet, but the two papers do not have the same rule texture when set side by side. | `client-house.html:130`, `:322`, `:401`; `decision-moment.html:298`, `:359` | One mechanism (`<hr>`), one map: structure = `--hairline`, money/totals/record = `--hairline-strong` |
| **CR-07** | **P2** | Med | **The record blocks are the best objects in the set and they are not the same object.** Specimen 3's includes the typed name at `.t-d3` above a 320px rule — it reads as a signature on paper, and it is genuinely excellent. Specimen 1's omits it. A9's fixed order is otherwise honoured in both. | `decision-moment-accepted-1440.png` y≈1710; `client-house-accepted-1440.png` y≈1010–1120 | Give Specimen 1 the signature line |
| **CR-08** | **P2** | Med | **The legend rail is the clearest teaching object in the three files** — tier name, live specimen, one rule sentence, three times. It is also the only place the whole tier system is visible at once. Keep it, and fix only SF-27. | `decision-moment-1440.png` right rail | Keep |
| **CR-09** | **P2** | Med | **At 390 money is first on the client page but last in the piece row.** Row order at 390 is plate → name → state → caption → then a full-width strip carrying `$8,120.00` and the stamp. The price is the last thing in the row. | `client-house-default-390.png` y≈645–680; source `:481-482` | Price above the caption |
| **CR-10** | **P2** | Med | **The day's line's link styling is right, and its overdue row is not.** Setting the job name as a body-size oak-ruled inline link is correct (SF-13's counter-example). But the whole clause after the dash, *including the link*, is `--terracotta-ink`, so the link's oak rule and the clause's pigment collide and the link stops looking like a link. | `designer-desk-default-1440.png` y≈349; source `:265-266` | Keep the job name in link pigment; colour only the clause after it |
| **CR-11** | **P3** | High | **The dotted leader is the best small invention on the Desk** and it survives 43 rows without a single misalignment; the 96px action column holds; the stage plates hold. | `designer-desk-43jobs-1440.png` | Keep |
| **CR-12** | **P3** | Med | The doorway glyph in the studio index reads as a bookmark or a flag, not a door, at 13px. | `designer-desk-default-1440.png` y≈1734 | Redraw or drop |
| **CR-13** | **P3** | Med | At 43 jobs the boards column leaves ~1,350px of empty gutter beside the roster. Absence is silence, but it reads as a layout that ran out. | `designer-desk-43jobs-1440.png` | Let the roster reclaim the gutter below the boards |
| **CR-14** | **P3** | Med | **Dark plates.** The terminal act inverts correctly (light plate, dark label) and the disabled terminal (`--rail` ground, `--ink-faint` label) holds at ~5.5:1. The stamps hold. The image plate does not: the one photograph becomes the single brightest object on a dark page and clashes with the ground. | `client-house-1440-dark.png` y≈841 | Acceptable; note it |
| **CR-15** | **P3** | Low | The mat's action column baseline sits ~7px above the two `dt` headers beside it. | `client-house-default-1440.png` y≈1791/1798 | `align-items: baseline` on `.mat-grid` |
| **CR-16** | **P3** | Low | `.t-authorship` at 20px italic Playfair carries two full lines of instructional copy in the Desk's margin note — the second-largest text block on the page, and an instruction rather than an aside. | `designer-desk-default-1440.png` y≈179–202 | `.t-body` for the note, `.t-authorship` for the em-dash lead only |

**390 layouts, judged.** Client house: money first ✅, plates at 64px ✅, pole
as a sticky bar ✅, no horizontal scroll ✅ — but the envelope displaces the act
(SF-06) and the price falls to the bottom of the row (CR-09). Desk: day's line
first ✅, plates sticky ✅, action column drops right ✅, boards below ✅, acts
stacked ✅ — but the margin note does not collapse (SF-15). Decision moment:
money before the chips ✅, legend below ✅, ledger well composed ✅ — but the
dock clips the consequence and inverts the field/act order (SF-24, SF-25) and
the colophon is not last (SF-33). **Nothing is unreadable at 390 except the two
sliced consequence sentences, and those are unreadable in the exact place the
system says they must be readable.**

---

## E. Against the panel — the ten findings these specimens were meant to answer

| Panel finding | Answered? | Evidence |
|---|---|---|
| **IX01** — the hold is `sr-only`, never announced to pointer users | **Yes, both papers.** "Press and hold to accept" renders visibly at `.t-meta`/`--ink-subtle`. | `client-house-default-1440.png` y≈1133; `decision-moment-1440.png` y≈1856 |
| **IX03 / IX04** — `.da-tertiary` and roster names rest at `scaleX(0)`; no marks on touch | **Half.** Every `.act--tertiary` has an unconditional 4.20:1 oak rest rule, with no `@media (hover:none)` variant and no transform — fixed. But the Desk's **row name** rests on a `--rail` rule at ≈1.14:1, which is the same failure on the same object (SF-13). | `designer-desk-default-1440.png`; `designer-desk.html:338` |
| **IX12** — the client page has no money on it | **Yes, emphatically.** `WHAT YOU OWE` is the fourth block on the page; `$4,060.00` at 26px with its date; one reconciling sentence; the terminal act carries the amount; a `data-never-dim` landmark points at it; at 390 it is the first block after the doorstep. | `client-house-default-1440.png` y≈281–460; `client-house-default-390.png` |
| **IX40 / IA-22** — the doorstep sentence is not linked to its gate 1,400px below | **Yes in function, badly in craft.** "Finished work" links to `#wall`, and a landmark ledger link points there too. But the link is rendered as a mono caps chip inside a Playfair sentence (CR-01). | `client-house.html:567`; render y≈219 |
| **IA-01** — the hero costs a designer every job on first paint | **Yes, decisively.** At 1440 the first stage plate lands at y≈513 of a 900px viewport, with six rows and two plates visible — where the proposal showed zero. There is no hero and no "Ready for your hand" second queue; the day's line is three linked views of roster rows inside the roster head. | `designer-desk-default-1440.png` vs `shots/proposal/slide-08-1440.png` |
| **IA-23** — the story pole holds every section id and renders none as a link | **Half.** Six phases now render as links; four of them point at the wrong anchor (SF-03), and the pole no longer shows where you are (PR-16). At ≤899px it becomes a working disclosure bar rather than being hidden outright (C03 answered). | `client-house.html:621-632` |
| **BE-01 / BE-23** — the homeowner's name appears zero times; "PREPARED FOR CLIENT USER" | **Yes.** "Prepared for Nora Ellison" in every letterhead; "Nora Ellison · Local Dev Studio" in both record blocks; the typed name rendered as a signature. The sheet's empty-slot rule is specified but not demonstrated (no state exercises it). | all three renders |
| **VC-44 / VC-45** — hash-block thumbnails; empty rooms as outlined rectangles | **VC-45 yes, outright** — Hall and Stair are a name, a floor line and one sentence, and it is the cleanest fix in the set. **VC-44 half** — the hash block is gone and a drawn silhouette replaces it, but the silhouette is stroked at ≈1.14:1 (PR-09) and shown at 96px (PR-10), so the left edge of the page is still weak. | `client-house-default-1440.png` y≈1207–1345 (rooms), y≈756 (plate) |
| **A16 / C05** — `disabled` removes the gate from the tab order and takes its reason with it | **Yes.** `aria-disabled` throughout, never the attribute; the control stays focusable; `aria-describedby` points at a *visible* reason; activating while unmet moves focus to the input and writes the reason into `role="status"`. Both specimens implement it. | `client-house.html:966-971`; `decision-moment.html:843-848` |
| **VC-10 / IX39** — three typefaces for one payment inside 120px; hierarchy inverted on the doorstep | **IX39 yes** (PR-07). **VC-10 no** — reduced from three families to two, not one: the ledger figures are mono and the allowance sentence's figures are Inter, 40px apart (PR-06); and the reconciling sentence drops 12px mono figures into 16px Inter prose. | `decision-moment-1440.png` y≈895/933; `client-house-default-1440.png` y≈348 |

Two more worth recording: **IX11** (a taken state beside a still-live act) is
*reproduced twice* — by SF-01 (an ACCEPTED stamp beside "awaiting your
acceptance") and by SF-27 (a live filled Accept beside its own record). **IX10**
(three action grammars in one product) is answered *within* each file and broken
*across* them by OS-01 and OS-02.

---

## F. Against the proposal — slides 6, 7, 8

**Would Nora and Leah find these more professional?** Leah: **yes, and it is not
close.** The Desk survives 43 jobs with the stage plates, the overdue trio and
the leader intact; the proposal was demoed at three and has no overdue channel at
all. She sees six jobs on first paint instead of none. She sees her own boards
beside the day's work. Nothing on the page is a pill, a badge, a dot or a green
receipt. She said "I've fired software for looking like this" about the
proposal's grammar; nothing in Specimen 2 has that grammar, except the dark bar
(OS-06).

Nora: **yes on trust, not yet on warmth.** She gets her name in the letterhead,
her balance and its date at the top in the largest true type on the page, a
consequence sentence over every act, a signed note from Leah with a date, four
papers she can open, and a receipt that is a stamped, numbered, party-named
record instead of a green card with a ✓. Nothing on the page is a fake room, a
procedural wood grain, or a hash block. That is a substantially more trustworthy
document than fifteen slides that never once print her name.

**Where the specimens are still weaker.** Honestly:

1. **The photograph.** Slide 6 and 7's room image is seductive and the specimens
   have no answer to it — one 96px thumbnail across three pages, and two pages
   with no photograph at all. A page of thin line drawings in a near-invisible
   stroke (PR-09) is *honest and dull*, and dull reads as cheap. This is the
   single biggest remaining gap and it is fixable inside the source hierarchy:
   an **installed** photograph at band width, captioned truthfully, appearing
   only once work is standing (PR-10).
2. **The money table.** Slide 7's ledger is cleaner than Specimen 3's: six rows,
   labels and figures both at ~16px sentence case, each on its own hairline,
   aligned inside a ~680px measure. Specimen 3 correctly drops the illustrative
   tax and pulls the allowance below the rule — those are real wins — and then
   sets the figures at 12px and throws them 1,000px to the right (SF-26, PR-05).
   **As composed today the proposal's money table is better.**
3. **The focus/selection ring.** The proposal's selected finish chip is
   unmistakable; the specimen's is a 2% ground shift and a 1.5px edge (CR-05).
   The panel praised the proposal's focus indicator (3px at 4px offset, never
   below 7.35:1) and the sheet adopted a *narrower* 2px at 2px offset in
   `--clay-ink`. On paper that is defensible; on the selected chip it is not
   enough.
4. **Confidence of the supporting layer.** The proposal reads warm because its
   secondary copy is 15–17px sentence case. The specimens read technical because
   theirs is 11–12px monospace with .08em tracking, ~35 lines of it (CR-02).
5. **Actionability at a glance.** Slide 8's "Ready for your hand" gives each item
   its own act button. The day's line is the right *architecture* (IA top-5 #1)
   and it is less obviously actionable.

Everything else the specimens win: no hero, no pills, no dots, no badges, no
olive, no green fill, no ✓, no spinner, no generated room, no fake grain, no
`disabled`, no truncation, no PATINA wordmark on a client page, a letterhead and
a colophon on every paper, 43 jobs proved, a real record block, a real stamp, a
tier legend, and empty rooms that are finally not rectangles.

---

## What must not be changed in the fix pass

1. **The scored-ink tier system as CSS.** `.act`, `.act--tertiary`,
   `.act--secondary`, `.act--terminal`, the focus rule and the proofreader's
   caret are byte-identical across three independently built files and they
   read correctly at every size. Change the *label typography* (PR-04) and
   nothing else.
2. **The unconditional resting rule.** No `scaleX(0)`, no `@media (hover:none)`
   variant, no hover-gating, ever again. This is the IX03/IX04/B01 fix and it
   works.
3. **`aria-disabled` + a visible reason + `aria-describedby` + focus-moves-and-
   announces on activation.** Never `disabled`, never `opacity: .5`. Both papers
   implement it correctly.
4. **The empty-room pattern** — room name, a floor line, one sentence, no
   rectangle, no per-room "ask for a change". It answers IA-31/IX41/VC-45
   completely and it is the cleanest object in the three files.
5. **The record block, in A9's fixed order**, including Specimen 3's typed name
   at `.t-d3` above a 320px rule. Do not shrink it, do not card it, do not fill
   it.
6. **The stamp** — border pigment only, `rotate(-2deg)`, the double rule, no
   fill, no ✓, no badge.
7. **The stage plates and the dotted leader and the 96px action column** — they
   hold at 43 jobs without a single misalignment, and they are still the fastest
   scan device on either surface.
8. **The letterhead / colophon pair on every client-facing paper**, with
   "Prepared for Nora Ellison" and no PATINA wordmark above the colophon.
9. **The legend rail** as a teaching object (fix only its live button).
10. **The consequence sentence at 15px above every terminal act in every state**,
    saying what the act does *and* what it does not do.

## Ranked top ten for the fix pass

| # | ID(s) | What | Why first |
|---|---|---|---|
| 1 | **PR-09** | Draw in `--ink-faint`, not `--rail`. Sheet change; touches every SVG in all three files. | Every drawing in the system is currently invisible in both themes. It invalidates the answer to VC-44 and it is one line per class. |
| 2 | **PR-03 + PR-04 + PR-05 + PR-06** | Money at ≥15px: a 15px `.t-money`, a sentence-case 16px terminal label, an announced `.t-d2` figure on every money block, one family per figure including the allowance sentence. | Principle 2 is currently inverted by the sheet, and the shipped invoice already proves the target. |
| 3 | **SF-01** | State-scope the three "awaiting your acceptance" sentences. | An ACCEPTED stamp beside "awaiting your acceptance" is IX11 shipped inside the specimen that exists to kill it. |
| 4 | **SF-24 + SF-25** | Fix the 390 dock so it stops slicing the consequence and stops preceding its own gate. | The one place at 390 where the system's central promise is physically unreadable. |
| 5 | **OS-01 + CR-01** | Add `.act--inline` to the sheet; rebuild the doorstep headline with it. | The first sentence on the homeowner's page currently reads as a chip glued to a sentence. Specimen 2 already proves the pattern. |
| 6 | **OS-02 + SF-02 + SF-04** | One hold implementation — Specimen 3's, at 900ms, with keyboard parity — and never commit from a bare click. | "Press and hold to accept" is currently a false statement on the client page, and the "defensible if disputed" claim rests on this. |
| 7 | **SF-26 + SF-29 + CR-03** | Constrain the ledger and the signature field to the document's measure (56ch / 360px). | The money table is the object the panel most admired in the proposal and the specimen's is worse; both are a `max-width`. |
| 8 | **SF-13** | Give the Desk's row name a visible resting rule. | The primary target on the primary surface currently has no affordance at rest — the exact defect the specimen was built to fix. |
| 9 | **PR-10 + PR-12** | One installed photograph at band width, captioned; richer board drawings. | The remaining honest gap against the proposal. Honest and dull still loses. |
| 10 | **OS-06 + SF-27 + OS-05** | Bottom bar to paper; legend acts inert; promote `aria-pressed` styling to the sheet. | Three small system corrections: stop spending terminal pigment on chrome, stop shipping a live terminal act next to its own record, make pressed state visible on all three pages. |

Sheet changes required (not builder fixes): PR-03, PR-04, PR-09, OS-01, OS-03,
OS-04, OS-05, OS-06, SF-30, and the §B fixture arithmetic (16 live, 15 listed).
