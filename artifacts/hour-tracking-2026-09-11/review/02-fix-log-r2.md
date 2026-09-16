# Fix log — round 2 (fixer)

Target: `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (only file touched).

The round-2 findings arrived as two lists that both number themselves `R2-1`…`R2-20/21`
(one content-accuracy pass, one design/accessibility pass) — the two sets collide on
ID. This log disambiguates them as **R2-\_c** (content batch, first list) and
**R2-\_d** (design/accessibility batch, second list), in the order each finding was
given.

## Fixed — content batch

- **R2-7c** — Sheet 10's "All" tfoot row (Ships cell) gained one instrumentation
  line: "PostHog events land W1 (`time_entry_logged`, `time_rate_unresolved`), W3
  (`time_timer_started`/`_stopped`), W5 (`time_export_taken`), W6
  (`time_entry_logged`, field surfaces) — HT-27." (architecture.md §§1-8 PostHog
  lines cross-checked against the wave headers to confirm the mapping, including
  W3's HT-17 instrumentation-only assignment.)
- **R2-6c** — Risk #5 rewritten and repriced. Was: "medium" severity, "the `source`
  and `activity` CHECK constraint names appear in no migration" with a mitigation
  implying both need 00545's name-discovery form. Now: risk text says the
  `activity` CHECK is inline and unnamed (00198:27-29); mitigation states `source`
  was already named `project_time_entries_source_ck` by 00545:147-148, so only the
  `activity` widening (W6) needs the name-discovery form. Severity → low.
- **R2-5c** — Sheet 12 row #9: Thing → "the `profiles.default_hourly_rate_cents`
  fallback" (was "...column"); path → "00412:2678,2681 · column declared
  00177:89, view legs 00177:111,118". Wave/Gate unchanged. (Merged with R2-12d,
  the design batch's version of the same row — see below.)
- **R2-4c** — Sheet 12 row #20 citation "architecture-draft.md:44,50" →
  "architecture-draft.md:29,50,51" (verified: :50 is the DEFINER
  `studio_hours_rollup`, :51 is the `studio_id`-keyed RLS policy calling
  `user_is_org_member`, :29 is the second `user_is_org_member` call site on
  `studio_member_rates`).
- **R2-3c** — Sheet 06 "Open question" annotation: "architecture.md:24" →
  "architecture.md:22" (verified: :22 is the "No RLS policy is ever keyed on
  `projects.studio_id`" rule; :24 is the unrelated "No new SELECT policy" rule).
- **R2-8c** — Sheet 04 friction row "Web desk — adjust before it is money" source
  cell: "CR and FS agree at 4" → "CR 4, FS 3 — CR's unit adopted" (memo-feasibility
  §3's only matching row is 3, not 4; memo-critic's is 4 — the deck's 4 is CR's,
  not an agreement).
- **R2-9c** — Added a "Seat key" row to the colophon: "FS = feasibility · CR =
  critic · WEB / MOB / REP = the UX seats · OPS / BIL / VET = the PMs · LEAH = the
  customer."
- **R2-10c** — Risk #2 rewritten: "all eight policies resolve through
  `projects p WHERE p.id = project_id`" → "all eight policies resolve through
  `project_id`, four through `projects p`, four through
  `is_project_team_member(project_id)`" (verified: the four 00316 policies use
  the `projects p` form, the four 00177 policies use `is_project_team_member`).
- **R2-11c** — Sheet 05 Provenance column: hole 3 "—" → "Verified in source during
  synthesis (use-time-tracking.ts:604-621)"; hole 4 "—" → "view + consumer
  verified (invoice-composer.tsx:611-616)".
- **R2-12c** — Compressed the four flagged table-cell prose passages to one clause
  each: sheet 03's "empty column" annotation, and risk mitigations #1, #4, #7 on
  sheet 13. The two colophon rows ("Findings count", "Typeset to") were left as
  reference/data content (compressing them would drop real numbers) and instead
  recorded as an explicit deviation inside the "Typeset to" row's own known-
  deviations list ("this entry and 'Findings count' exceed one line, kept as
  reference rather than prose") — the orchestrator's call resolved toward
  recording, per the finding's own second option.
- **R2-13c** — Colophon "Paths" row: appended "Swift under apps/mobile/Capture/;
  edge functions under supabase/functions/; docs and artifacts from the repo
  root."
- **R2-14c** — Colophon "Briefing" row: "current-state.md §0 and §2 (surface
  capability tables)" → "current-state.md §0, §2 and §3 (surface capability
  tables)" (§3, at current-state.md:138, is where every Patina Field fact on
  sheets 03/09 actually comes from).
- **R2-15c** — Five citation retargets, all verified against source:
  - Sheet 03 "Log the hour just spent" footnote: `studio-drawer.tsx:470-472` →
    `:468` (the actual `holding && inHandToday > 0` accrual-gate condition).
  - Sheet 03 "Log with nothing in hand" footnote: `hours-ledger.tsx:275-294`
    (batchAdd's body) → `hours-ledger.tsx:545-591` (the add-row JSX these rows
    are actually describing).
  - Sheet 03 "Log yesterday's hour" footnote: same retarget, same reason
    (`hours-ledger.tsx:275-294` → `:545-591`).
  - Sheet 03 "Log an hour with no project" footnote: "addValid
    hours-ledger.tsx:275" → "addValid hours-ledger.tsx:273" (`addValid` is
    declared at :273; :275 opens `batchAdd`).
  - Sheet 09 "date field on the ledger add row" File cell:
    `hours-ledger.tsx:275-294` → `hours-ledger.tsx:545-591` (same JSX retarget,
    for consistency with the already-correct citation elsewhere on the sheet).
  - Sheet 12 row #19: "enum 00084:163-164" → "role CHECK 00084:164-165"
    (verified: `project_team_members.role` is `TEXT ... CHECK (role IN (...))`,
    not an enum type; the enum type `member_role` is a different column,
    `organization_members.role`, at 00021:22). Sheet 05 hole #2's matching "enum
    00084:163-164" citation was left unchanged — it is not among the finding's
    cited deck line numbers and is out of this pass's scope.
- **R2-19c** — Cover epigraph and colophon "Title from" row: "time is not a
  margin item..." → "`time` is not a margin item..." (code-faced), matching
  margin-groups.ts:11's actual subject — the `time` margin-item *kind*, not time
  in general.

## Fixed — design/accessibility batch

- **R2-1d** — Deleted the `table.sheet.wide { min-width: 1020px; }` and
  `table.sheet.widest { min-width: 1140px; }` overrides. Tables now fall back to
  the base `table.sheet` rule (`width: 100%; min-width: 680px`), which fits
  inside the main column at every width ≥ 860px (the new collapse breakpoint,
  see R2-2d) instead of forcing a horizontal scroll wider than the available
  1092px the `.inner` grid ever provides.
- **R2-2d** — Table-collapse breakpoint lowered from `max-width: 1200px` back to
  `max-width: 860px`, now safe because R2-1d removed the forced min-widths that
  were clipping content above 860px in the first place.
- **R2-16d** — Inside the (now 860px) block-card media query, `.scroller` gained
  `overflow-y: visible` alongside `overflow-x: visible`, so the computed value on
  both axes is actually `visible` per the CSS Overflow spec (previously the base
  rule's `overflow-y: hidden` forced `overflow-x: visible` to compute as `auto`).
- **R2-3d** — Rewrote the slide-position logic. `nearest()` (smallest
  `|top|`, which flips to the *next* slide past any slide's midpoint) replaced
  with `currentIndex()`: the last slide whose top has crossed a reading-line
  threshold (`innerHeight * 0.33`) from above. `go()` now calls `currentIndex()`
  instead of `nearest()`, fixing both the (now-removed) counter and keyboard
  paging from a mid-slide scroll position.
- **R2-4d** — Reworked scroller focusability and the keyboard-paging exemption.
  `.scroller` elements now get `tabindex="0"`, `role="region"` and the
  aria-label only when `scrollWidth > clientWidth` (checked on load and on
  resize via `updateScrollers()`), and lose all three otherwise — no more dead
  keyboard stops with a false "scrolls horizontally" label. The keydown handler
  now only cedes an arrow key to a focused scroller when that scroller can
  still move further in that direction (checked against `scrollLeft` /
  `scrollWidth`); otherwise it falls through to paging, so a focused
  non-scrolling (or fully-scrolled) scroller no longer blocks `go()`.
- **R2-5d** — Rewrote both instances of the "four gate the first line of code"
  claim to match sheet 15's own gates table: cover "The ask" verdict and sheet
  14's `h2` heading now read (condensed on the heading, fuller on the cover)
  "Four must be ruled before the plan can be sequenced — HT-1 gates W1's first
  line; HT-10 and HT-37 gate W2; HT-4 gates W7 and W1's backfill."
- **R2-6d** — Deleted the fixed `#idx` position pill entirely (markup, CSS, and
  its script hooks/`mark()`/`pad()` machinery), per the finding's second option:
  it was redundant with the static per-slide "Sheet NN / 16" label already
  printed in every slide's gutter, and being `pointer-events: none` could never
  be dismissed when it sat over live text.
- **R2-7d** — Sheet 06's tfoot comparison row ("What the database already
  permits a member") moved into `<tbody>` as the last row, with a new
  `table.sheet tr.strong td { border-top: 1px solid var(--hairline-strong); }`
  rule (class `strong` on that `<tr>`) marking the visual break a real `tfoot`
  used to carry. Sheet 09's tfoot legend row replaced with a `.legend` block
  beneath the scroller, matching sheet 02's own legend treatment. Sheet 10's
  tfoot (a genuine migration-numbering footnote) was left as `tfoot` per the
  finding.
- **R2-8d** — Sheet 12 heading "Twenty-three dispositions — nineteen deletions,
  four rulings/corrections." → "Twenty-three dispositions." (dropped the
  undecidable split rather than adding a Disposition column to an
  already-clip-prone table).
- **R2-9d** — Sheet 14's "For / against" column header renamed to "Panel" (and
  its 40 rows' `data-label` attributes updated from "Seats" to "Panel" to match,
  for the block-card/print label), rather than splitting mixed vote-count / seat
  / bare-word cells into two columns.
- **R2-10d** — Added the two missing deviations to the colophon's "Typeset to"
  known-deviations list: the mark dial `.m` at 11px with `border-radius: 50%`
  (SPEC.md §A4 permits 50% only for the 7px mark dot) and `.slide` padding-block
  56/140px (off the 12/24 module).
- **R2-11d** — Sheet 05 hole #4 rewritten: "What it is" now explains the real
  mechanism (the view's `security_invoker = true` applies the caller's own
  `profiles` RLS to the join, not "not an org member"); "Line" cell gained
  "security_invoker 00412:2672" beside the existing join/hazard/split citations.
  (Verified: `project_time_entries.user_id` is `NOT NULL REFERENCES profiles`,
  00177:18, so the join itself never drops a row — only invoker-RLS visibility
  does.)
- **R2-12d** — Same edit as R2-5c above (sheet 12 row #9): citations reordered so
  the column's actual declaration (00177:89) is cited alongside the view legs
  the row's own gate text refers to ("the column drops...").
- **R2-13d** — Added "(active/role test in `is_studio_comember` at 00556:51)"
  beside both `time_entries_studio_read` (00316:237-240) citations that assert
  the active/non-guest property — sheet 03's "read already exists" annotation
  and sheet 06's guest-row Gate cell — since that policy body itself carries no
  role or active test; both live inside `is_studio_comember`.
- **R2-13a-d** — Added `strong { font-weight: 500; }` and
  `em { font-style: normal; font-weight: 500; }` global rules, using only the
  already-loaded Inter/DM Mono weight 500 instead of letting the browser
  synthesize faux-bold (weight 700, never loaded) or faux-italic (no italic axis
  loaded) on every `<strong>`/`<em>` in the deck. No markup or font-request
  change; Inter 600 stays unused (pre-existing, not in this round's findings).
- **R2-14d** — Added an `@media print` block: slides print as flowing,
  page-broken blocks (`min-height: 0; display: block; break-after: page`)
  instead of fixed-height flex boxes, and every table is forced back to a real
  `<table>` layout (`display: table/table-row-group/table-row/table-cell`,
  visible `thead`, no `::before` data-labels) regardless of the print viewport
  width, so the deck doesn't print as broken mid-table block-cards. (`#idx`'s
  print-hide rule is moot since R2-6d deleted the element.)
- **R2-15d** — `.slide`'s `min-height: 100dvh` preceded by `min-height: 100vh;`
  as a fallback for browsers without `dvh` support.
- **R2-17d** — Deleted the unused `.oak { color: var(--oak); }` rule (confirmed
  zero markup uses `class="oak"`; `--oak` stays live on `.gutter .rule` and the
  link underline, both non-text uses).
- **R2-20d** — Reordered the cover slide: `.counts` now precedes `.verdicts`
  (previously counts came last, after the rows, with nothing beneath them —
  exactly the "total with no rows beneath it" the deck's own HT-30 rule calls a
  dashboard). Now the counts sit as front matter above the verdict rows that
  produced them, matching the compliant pattern already used on sheet 11.

## Skipped

- **R2-1c** — reason: the actual defect is in `architecture.md` (:8, :836, :884
  say 17–25; its own band table — M 3-5 + L 6-10 + M 3-5 + M 3-5 — sums to
  15–25, so architecture.md's prose contradicts its own bands). The deck's
  15–25 (sheet 11 count tile and Path B) is arithmetically correct and
  internally self-consistent; restoring "17–25" in the deck would make it agree
  with architecture.md's own wrong number while breaking the deck's internal
  arithmetic. I am authorized to edit only `deck/src/index.html`, and correcting
  the true source of the error is out of that scope — left as-is and flagged for
  the orchestrator to fix `architecture.md` instead.
- **R2-2c** — reason: same shape as R2-1c. The deck's "three concurrent
  worktrees" (sheet 13 risk #4) already matches the deck's own parallelisation
  table (peak of 3, sheet 11) and its own "2–3" count tile; `architecture.md:895`
  says "four", contradicting architecture's *own* stage table. The deck is
  correct and self-consistent; nothing to change in the one file I can edit.
  Flagged for the orchestrator to fix `architecture.md` instead.
- **R2-16c** — reason: finding's own disposition is "No action; recorded so it
  is not re-found." (Field — running timer coverage is preserved at sheet 09 and
  HT-7.)
- **R2-17c** — reason: finding's own disposition is "No action." (the "not in
  v1" wording is justified by architecture.md §12 and internally consistent
  with sheet 09).
- **R2-18c** — reason: sheet 12 row #10's citations are already correct in the
  deck (verified: hours-ledger.tsx:683-700 is the pill, :184 the
  pending_authorization filter); the finding's fix is to back-port the
  correction into synthesis.md:52 and architecture.md:938, both outside the one
  file I'm authorized to edit.
- **R2-20c** — reason: addressed to the orchestrator verbatim ("supply the
  contract, or rule whether a criteria-table sheet and a NOT-in-v1 sheet were
  required. I cannot assert a missing slide without it."). No DECK CONTRACT file
  exists (re-checked `artifacts/`, `.claude/workflows/`, `~/.claude/workflows/`);
  I am not authorized to invent new sheets or a scope ruling on my own.
- **R2-18d** — reason: finding's own disposition is conditional — "If R2-2 is
  fixed this stops mattering." R2-2d (design) is fixed in this pass (breakpoint
  restored to ~860px, where the block-card divider hairlines are the only
  structure needed and were already the house sheet's own values), so no
  further action.
- **R2-19d** — reason: finding's own disposition is "Orchestrator's call — amend
  the synthesis and the deck together, or accept the grouping explicitly." The
  deck is faithful to synthesis.md's HT-30/HT-35/HT-36 grouping; changing only
  the deck would put it out of step with its cited source, which the fixer
  brief prohibits ("do not add content not in synthesis.md/architecture.md/the
  memos").
- **R2-21d** — reason: the finding's fix is a standing test-harness/process
  recommendation for future house-deck reviews ("assert scrollWidth -
  clientWidth === 0 for every `.scroller`... implemented in
  review/shots/r2-probe3.cjs"), not a defect in the deck's markup or styling —
  there is no corresponding index.html change to make.
