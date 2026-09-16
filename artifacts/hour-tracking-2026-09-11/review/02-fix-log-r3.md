# Round 3 fix log

Fixer applied every round-3 finding to `deck/src/index.html` only. The finding
list handed to this round reused the tag `R3-1 … R3-23` twice (two disjoint
sets of findings share the same ids). To keep each finding traceable, this
log labels the first set (the sheet/content-accuracy findings) **A-R3-n** and
the second set (the layout/interaction/accessibility findings) **B-R3-n**, in
the order they were given. Line numbers below are the finding's own citation
into the pre-fix file; several have since shifted because earlier fixes
insert or remove lines.

## Fixed

- **A-R3-1** (sheet 02, "Log an hour anywhere" quantifier, :337) — reworded
  the `.mq` note to "0 taps in a document, 8 off one, impossible on the phone
  with nothing held and in Field beyond a just-closed visit," matching sheet
  03's 8-interaction ledger path and synthesis.md:87. The ◐ mark is
  unchanged.
- **A-R3-2** (sheet 12 row 5, `fetchTimeSummary` gate) — restated as "one
  call site (use-projects.ts:481), itself in a hook with no consumers —
  re-derive before keeping," per the finding's suggested wording.
- **A-R3-3** (sheet 10 tfoot, PostHog wave map) — inserted "W2
  (`time_scope_viewed`, `time_entry_adjusted`, `time_entry_deleted`)" between
  W1 and W3, per architecture.md:338-339.
- **A-R3-6 + A-R3-10** (sheet 05, hole 2 citation, same cell) — combined both
  fixes on one `<td>`: "enum 00084:163-164" → "role CHECK 00084:164-165"
  (matches sheet 12 row 19's corrected form), and "role match
  00412:2510-2546" → "role match 00578:2709-2745 (was 00412:2510-2546)" to
  re-anchor to head while keeping the origin visible.
- **A-R3-7** (sheet 12 row 8 vs colophon Paths) — took the colophon-only
  option: added "workspace packages under packages/ (e.g.
  packages/supabase/src/)" to the colophon's Paths row rather than rewriting
  row 8's citation, since the colophon already declares every other
  non-portal root.
- **A-R3-8** (sheet 02 Project row citation) — `hours-ledger.tsx:275` →
  `:273`, matching sheet 03's already-corrected citation for the same fact.
- **A-R3-9** (sheet 09 add-row citation) — the one `543-591` instance (in the
  billable-pill row's File cell) corrected to `545-591`, matching the other
  three cells that already cited it correctly.
- **A-R3-12** (qbo-export citations, sheet 03 Export row and sheet 08 Export
  set row) — re-labelled both from "AP precedent" / "blob pattern" to
  "CSV-header precedent," since 131-132 is the `CSV_HEADER` constant
  (verified in repo) and the blob/response lines were not independently
  sourced; this was the finding's own non-fact-dependent alternative.
- **A-R3-13** (sheet 14 HT-24 Touches column) — `D10` → `new`, since
  DECISIONS.md D10 governs duration, not activity recording. (Synthesis.md's
  matching label is out of this fixer's scope — orchestrator should mirror
  the change there.)
- **A-R3-16** (sheet 03 Designer-mobile ◐ marks, rows 1/8/9/10) — appended
  `derived, current-state §2` to each of the four mobile half-marks, marking
  them as inferences per the panel-brief's rule rather than leaving them
  silently uncited.
- **B-R3-1** (sheet 15 "Rule the sheet" verdict) — pasted the corrected
  four-gate clause from the cover (:315) over sheet 15's stale sentence, so
  the closing verdict now matches its own table two lines below.
- **B-R3-2** (print block, dark-mode blank page) — added a forced light
  palette (`color-scheme: light` plus paper/ink/hairline/oak overrides) at
  the top of `@media print`, scoped to `:root` and `:root[data-theme="dark"]`.
- **B-R3-3** (901–979px worse-as-you-widen band) — raised the `.inner`
  single-column breakpoint from `max-width: 900px` to `1000px` so the gutter
  cannot return before the table-collapse breakpoint (860px) has already
  simplified the layout. Left the optional `min-width: 680px` removal alone
  (optional in the finding; lower-risk to keep).
- **B-R3-4** (print page-edge clipping) — added
  `table.sheet thead th, table.sheet td.num, table.sheet td.mark, table.sheet td.id { white-space: normal !important; }`
  inside the print block, per the finding's first option.
- **B-R3-5** (dead keyboard stop after late font swap) — added
  `document.fonts.ready.then(updateScrollers)` and a `pageshow` listener
  alongside the existing `resize` listener.
- **B-R3-6 + B-R3-8** (fast/auto-repeat paging under-advances; ArrowLeft
  skips the head of a sheet) — rewrote paging to track a `pending` target
  index in a closure (reset on `scrollend` or a 900ms timer) instead of
  re-deriving the index from live scroll position on every keypress, which
  fixes the dropped-press bug; and made a *fresh* `ArrowLeft` (i.e.
  `pending === null`) return to the top of the current slide when more than
  ~100px into it, stepping back a slide only when already at the top or on a
  second quick press.
- **B-R3-7** (Shift+Arrow swallowed) — added `ev.shiftKey` to the modifier
  guard so Shift+ArrowLeft/Right are left alone for text-selection.
- **B-R3-9** (`<strong>`/`<em>` both computing to weight 500) — scoped
  `strong { font-weight: 600 }` to body-face contexts
  (`.t-body`, `.t-body-sm`, and `table.sheet td`/`th` other than
  `.src`/`.id`/`.num`, which stay mono at 500 to avoid synthesizing a bold
  DM Mono face — the exact trap the finding flagged), and gave `<em>` a
  distinct signal (`color: var(--ink-muted)`) instead of leaving it
  indistinguishable from headings at the same weight.
- **B-R3-10** (three vocabularies for the same dial) — standardized on
  present / partial / absent everywhere: sheet 06's permission matrix
  aria-labels (`yes`/`no`/`partly` → `present`/`absent`/`partial`, 30
  instances) and sheet 02's visible legend (`holds` → `present`, `partly, or
  answers the wrong question` → `partial, or answers the wrong question`).
- **B-R3-11** (sheet 15 table mis-named for AT) — added a visually-hidden
  `<h3 id="h15b">The four gating rulings</h3>` before the scroller and
  pointed the table's `aria-labelledby` at it instead of the slide heading.
- **B-R3-12** (no persistent position cue) — `.gutter` gains
  `position: sticky; top: 24px; align-self: start`, no new element.
- **B-R3-14** (nowrap floor with zero clearance) — changed
  `table.sheet thead th` to `white-space: normal`, and added a
  `.num.wrap { white-space: normal }` escape hatch applied to the specific
  prose-holding `td.num` cells the finding named as at risk: sheet 10's
  "none · head+20 reserved" Migrations cell, and sheet 04's Today-column
  "impossible" (×4) and "accepts input, saves nothing" cells. Left true
  short figures (sheet 09's Taps column, sheet 04's "≥6") on the nowrap
  default, since none of those cells are close to their column's edge.
- **B-R3-15** (dead CSS) — removed the five zero-use class rules
  (`.t-money`, `.ink-subtle`, `.rule-hair`, `.stack-6`, `.stack-24`) and the
  zero-consumer custom properties (`--clay`, `--golden` + all three
  `--golden-ink` definitions, `--sage`, `--terracotta`, `--rail` including
  the copy this fixer had just added to the print block for B-R3-2,
  `--ink-paper`, `--module`, `--radius-hair`, `--press-in`, `--press-out`,
  `--ease`). Kept `--clay-ink`/`--sage-ink`/`--terracotta-ink` (consumed by
  `.holds`/`.defect`/focus-visible) and `--radius-box`/`--paper-doc` per the
  finding's own instruction.
- **B-R3-16** (unused Inter 600 / Playfair 400 upright) — addressed via
  B-R3-9: `strong` now renders at Inter 600 in body contexts, giving the
  loaded weight a real consumer. Playfair Display 400 upright remains
  unused, which the finding itself accepts as a no-action outcome (house
  conformance to SPEC.md:112-114).
- **B-R3-19** (sheet 09 `.legend` misused as a disclosure) — replaced the
  `.legend`/`<span>` wrapper with `<p class="t-body-sm ink-muted">`, matching
  the plain-paragraph pattern the finding pointed at.
- **B-R3-20** (optional hairline strengthening ≤860px) — added
  `border-top-color: var(--ink-faint)` to the `≤860px` block's
  `table.sheet tr` rule (the card-divider rule), as the finding's optional
  suggestion.
- **B-R3-22** (shortcut legend omits Home/End) — appended "Home jumps to the
  first sheet, End to the last." to the visually-hidden shortcut sentence.
- **B-R3-23** (identical aria-label across simultaneous scrollers) —
  `updateScrollers()` now composes the label from the table's own
  `aria-labelledby` heading text (`'Table: ' + heading text`), falling back
  to the generic string only when no heading can be resolved.

## Skipped

- **A-R3-4** — id: architecture.md critical-path figure (15–25 vs 17–25).
  Reason: finding is explicit that no deck change is needed; the deck's
  15–25 is the arithmetically correct figure. Orchestrator must amend
  architecture.md:8, :835, :880.
- **A-R3-5** — id: architecture.md worktree count (three vs four). Reason:
  same as above — deck already matches the correct table-derived count (3);
  orchestrator must amend architecture.md:894.
- **A-R3-11** — id: head+12 double-booked (risk 8 vs HT-37 vs sheet 15).
  Reason: both deck passages are faithful to architecture.md's own
  conflicting reservations (§13 row 22 vs W2's DB block). Fixing this
  requires assigning the INVOKER rollup its own migration number in
  architecture.md and correcting both source documents — outside this
  fixer's remit (deck-only, no new facts to source).
- **A-R3-14** — id: prose residue (sheet 05 "What it is" cells, sheet 09
  legend, colophon Findings-count/Typeset-to pair). Reason: sheet 09's
  legend is fixed above under B-R3-19 with a more actionable target; the
  colophon pair is already an explicitly recorded deviation
  (02-fix-log-r2.md:52-59, reaffirmed by B-R3-21 below). For sheet 05's two
  cells, the finding itself calls this "the weakest prose finding" and
  offers "rule them acceptable as table rows" as an explicit alternative —
  taking that alternative rather than risk trimming cited money-hole facts
  (dollar amounts, exposure descriptions, path:line citations) without a
  pre-compressed source text to lift from.
- **A-R3-15** — id: no DECK CONTRACT file exists. Reason: finding's own fix
  is "Orchestrator: supply the contract, or rule both gaps acceptable" — no
  deck-only action is available; the topic-gap facts it surfaces (i–vii
  crux labels absent, one "NOT in v1" row absent) are pre-existing content
  decisions, not something to invent text for.
- **B-R3-13** — id: sheet 03 citation column drives layout at 1024px.
  Reason: both offered fixes (move `.src` citations to a colspan row per
  record, or hide the Footnote column below ~1100px and render a `.legend`
  list) require restructuring markup across sheet 03's 17 rows, and any
  CSS-only shortcut (e.g. hiding `td.src`/`th:last-child` in a width band)
  risks collateral effects on sheets 10 and 14, which share the
  `.widest`/`.src` classes. Deferred to a design pass rather than a
  mechanical text/CSS fix.
- **B-R3-17** — id: standing-gate recommendation (painted-box overflow probe
  stopped at `body`). Reason: this is process guidance for future review
  rounds, not a deck defect — no code change applies.
- **B-R3-18** — id: HT-30 mis-grouped as a "consent ruling" (cover + sheet
  15) vs synthesis.md's own grouping. Reason: explicitly an orchestrator
  call per the finding ("amend synthesis.md and the deck together, or accept
  the grouping explicitly") — deferred twice already for the same reason;
  the deck is internally consistent with its cited source.
- **B-R3-21** — id: colophon known-deviations list, "no unrecorded §A
  deviation found." Reason: this is a confirmation, not a defect — no
  change needed; logged so a future round does not re-derive it, per the
  finding's own instruction.
