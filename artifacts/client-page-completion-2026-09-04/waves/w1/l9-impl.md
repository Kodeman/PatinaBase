# L9 — Real-data robustness and mock fidelity

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9`, branch `client-page-2/l9`
from `origin/main` (`26b15145e`).

## What was built, item by item

### (a) Story pole graduates from the house's six canonical phases

New pure module **`apps/client-portal/src/lib/threshold/canonical-phases.ts`**:

- `canonicalPhases(currentPhase, status)` builds a `SpinePhases` from `ALL_PHASE_SLUGS`
  (`@patina/types`), lettered with the existing client labels — Discovery · Design ·
  Design Refinement · Procurement · Installation · Completion.
- The held chapter is `recognisePhaseSlug(project.currentPhase)` (the strict recogniser from
  `making-spine.tsx`, which answers `null` rather than collapsing an unrecognised studio name onto
  Discovery). Everything before it is `completed`, everything after `upcoming`.
- A project whose own `status` is `completed`/`complete`/`closed`/`archived` and that names no phase
  gets all six settled. A project that names nothing recognisable holds NOTHING — six ungraduated
  chapters and no caret, rather than a guess that later reverses.
- **No canonical graduation carries a date**, so `graduationSpan` prints nothing beside it — "date
  ranges omitted" falls out of the data rather than out of a branch in the view.
- `thresholdPhases(milestones, currentPhase, status)` is the one the page calls: the studio's own
  register wins whenever `splitSpinePhases` returns anything at all; the canonical six are the
  fallback only when it returns nothing.

`threshold.tsx` edit is one call site (`splitSpinePhases(milestones)` → `thresholdPhases(...)`)
plus its import.

Checked side effects: `openChapterOf` now takes the canonical `current` instead of falling through to
`project.currentPhase`, but both paths resolve through `recognisePhaseSlug` + `PHASE_DISPLAY_CONFIG`,
so the doorplate's label and ink are unchanged (existing `threshold.test.tsx` "the chapter the house
stands in → Procurement" still passes). `GroundFloor`'s "Ahead" lines require `phase.targetDate`,
which a canonical graduation never has, so the ground floor gains no invented "Ahead" section.

### (b) Ledger

- **"of $X planned" from the plan total else Σ `project_rooms.budget_cents` — ALREADY SHIPPED, verified,
  not re-built.** `derive.ts` computes `plannedCents: planTotal ?? roomTargetTotal`
  (`lib/threshold/derive.ts`), and `threshold.tsx`'s `roomTargetCents()` falls from the published plan
  line's target to the room's `budget_cents` column. Covered by `derive.test.ts:442-465` and
  `threshold.test.tsx:764-778`.
- **"Held" from the wall bundles and "Awaiting your name" from open doors — ALREADY SHIPPED**
  (`heldCents` from `heldDrawCentsByProposalId` over the wall marks' distinct instruments;
  `awaitingCents` = Σ `signatureGates` totals).
- **NEW: the owed row carries its due date.** `HouseLedgerModel` gains one field,
  `owedDueDate: string | null`, set from the soonest-due open invoice (`openInvoices` is already
  sorted `byDueDate`, so `[0].due_date`). `house-ledger.tsx` renders
  `$9,125 · due 15 August` beside the figure.
  - Deliberate deviation from a byte-copy of the mock: when the owed figure spans MORE than one open
    invoice the row reads `· first due 15 August`, not `· due 15 August`. The mock only ever shows one
    open invoice; a bare "due 15 August" against a sum of three would tell the client the whole
    balance falls due that day, which is false. Copy lives in `owedDueLine()`.
  - The date is read with `parseSourceDate`, so a date-only `due_date` column is a calendar day and
    does not slide a day west of Greenwich (tested).

### (c) Reading-mark dateline

`readingMarkLine(date)` in `lib/threshold/standing.ts` → `"Read here on the fourth of August."`, built
on a new `dayInWords()` (first…thirty-first). `doorstep.tsx` takes an optional `readingMark` prop and
renders it beside the since control in mono, matching the mock's `.dateline`. `threshold.tsx` feeds it
`readingMarkLine(parseSourceDate(previousReadAt))` — i.e. the value from `usePreviousReadingMark`,
which is `null` on a first visit, so the dateline is simply absent then (the same rule that gates the
since control itself). The quiet doorstep passes nothing.

### (d) The note pinned to the first open door's leaf

`door-gate.tsx` already had a pin; it printed the note's WHOLE body, and `threshold.tsx` therefore
passed `note={null}` to every door so the paragraph would not be set twice.

- `noteInBrief(body, budget = 140)` (new, in `standing.ts`) collapses the letter's own line breaks and
  cuts on a word boundary with the cut marked.
- The pin now quotes `noteInBrief(note.body)` and carries a `Read the note` anchor to `#note`
  (`data-testid="door-note-read"`).
- `threshold.tsx` passes `note={mark.id === firstDoorId ? model.note : null}` — the opening is pinned
  to ONE leaf; `TheNote` still sets the body once under `#note`.
- The `DoorGateProps.note` CONTRACT comment was rewritten to state the new rule (opening + way back,
  never the body; one door only).

### (e) Room drawings — the door opening

`room-band.tsx` already ruled a wall line and a floor line. Added the missing interior line work:

- the left-hand wall now stops at the head of the opening (`OPENING_H = 52` above the floor),
- a head line returns `JAMB_W = 12` units into the wall (`data-testid="room-band-door-head"`),
- the floor is carried out through the opening as a dashed threshold from `x=0`
  (`data-testid="room-band-threshold"`, `stroke-dasharray="2 4"` — the mock's own dash).

The opening is on the LEFT because that is the plan-key side: `plan-key.ts` strikes every door mark at
`rect.x`, the room rect's left edge, so the two drawings now agree about where a room is entered.

### (f) Tester-notes widget — NOTHING TO DO, and why

The tester-notes widget is **not present in the client portal**. It lives only in the designer portal
(`apps/designer-portal/src/components/tester/tester-widget.tsx` + `feedback-form.tsx`, mounted from
`apps/designer-portal/src/app/layout.tsx`); it is not a package and is not imported anywhere under
`apps/client-portal` or `packages/`. Greps run: `tester` (case-insensitive) over
`apps/client-portal/src` and `packages` — the only hits are unrelated (`use-coordination.ts`);
`tester-widget|TesterWidget` over `apps` + `packages` excluding designer-portal — no hits.
The client portal also mounts no other fixed bottom-anchored element that could overlap the letterbox
act (only `@patina/help-system`'s `ContextualHelpPanel`, which is a right-edge drawer opened from the
header, and a `/demo` route).

So there is no widget footprint to move and no measurement to pad to. **No padding was added** — a
bottom padding sized to a widget that does not exist on this surface would be an invented number.
If the widget is later mounted into the client portal, this item should be re-opened with its real
measured footprint.

## Files

New:
- `apps/client-portal/src/lib/threshold/canonical-phases.ts`
- `apps/client-portal/src/lib/threshold/__tests__/canonical-phases.test.ts`
- `apps/client-portal/src/lib/threshold/__tests__/dateline.test.ts`
- `apps/client-portal/src/components/threshold/__tests__/threshold-robustness.test.tsx`

Edited (minimal, per shared-file discipline):
- `apps/client-portal/src/lib/threshold/derive.ts` — one field on `HouseLedgerModel`
  (`owedDueDate`) + one line in the ledger literal. Nothing else.
- `apps/client-portal/src/lib/threshold/standing.ts` — four helpers APPENDED at the end of the file
  (`dayInWords`, `readingMarkLine`, `owedDueLine`, `noteInBrief`). No existing export touched.
- `apps/client-portal/src/components/threshold/threshold.tsx` — three edits: the `thresholdPhases`
  call site (+ imports), `readingMark={…}` on the live doorstep, `note={…}` on the first door.
- `apps/client-portal/src/components/threshold/house-ledger.tsx` — the owed row's due suffix.
- `apps/client-portal/src/components/threshold/doorstep.tsx` — optional `readingMark` prop + its span.
- `apps/client-portal/src/components/threshold/door-gate.tsx` — pin quotes `noteInBrief`, gains the
  `#note` anchor, contract comment updated.
- `apps/client-portal/src/components/threshold/room-band.tsx` — the door opening's line work.
- `apps/client-portal/src/components/threshold/__tests__/house-ledger.test.tsx` — `owedDueDate: null`
  added to the existing factory so every existing assertion stands unchanged.
- `apps/client-portal/src/components/threshold/__tests__/room-band.test.tsx` — the line count in the
  "rules a floor and a wall" test goes 2 → 4, plus assertions for the head and the dashed threshold.
- `apps/client-portal/src/components/threshold/__tests__/threshold.test.tsx` — the test asserting the
  door pins NOTHING is superseded by (d); it now asserts the body is set once and the pin carries the
  opening plus the `#note` anchor.

`mat.tsx` was not touched. `making/*` was not touched.

## Hooks used

No new hooks, and no `@patina/supabase` change. Everything reads models that `threshold.tsx` already
builds: `usePreviousReadingMark` (already mounted) for the dateline, `deriveThreshold`'s ledger for
the due date, `deriveThreshold`'s `note` for the pin, and the server-fetched `milestones` +
`project.currentPhase`/`project.status` for the pole.

## Copy sources

- `Read here on the fourth of August.` — `docs/design/the-client-page/path-b-the-threshold.html:381`
  (`<span class="dateline" id="readingMark">`).
- `$9,125 · due 15 August` — same file, line 387 (the ledger's owed row).
- Discovery · Design · Design Refinement · Procurement · Installation · Completion — the `clientLabel`
  values in `packages/types/src/phase-config.ts`, not re-typed here.
- The pin's quote marks, attribution and `— Studio · 4 August` caption were already in
  `door-gate.tsx`; only the quoted text was shortened and the anchor added.
- `first due 15 August` (plural case) and `Read the note` are new strings — flagged above.
- The dashed threshold's `2 4` dash array is the mock's own
  (`path-b-the-threshold.html:650`).

## Gate output (verbatim)

`pnpm --dir <worktree>/apps/client-portal type-check`:

```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9/apps/client-portal
> tsc --noEmit
```

(clean — no diagnostics)

`pnpm --dir <worktree>/apps/client-portal test -- threshold making` (includes all three new test
files, which match the `threshold` pattern):

```
Test Suites: 33 passed, 33 total
Tests:       602 passed, 602 total
Snapshots:   0 total
Time:        14.008 s
Ran all test suites matching /threshold|making/i.
```

Suites of mine in that run, all PASS:
`src/lib/threshold/__tests__/canonical-phases.test.ts`,
`src/lib/threshold/__tests__/dateline.test.ts`,
`src/components/threshold/__tests__/threshold-robustness.test.tsx`.

`npx eslint src/components/threshold src/lib/threshold` (from `apps/client-portal`):

```
(no output — 0 errors, 0 warnings)
```

Full `pnpm test` for `@patina/client-portal` (run as insurance, not part of the lane gate):

```
FAIL @patina/client-portal src/lib/__tests__/portal-access.test.ts
FAIL @patina/client-portal src/lib/data/__tests__/orders.test.ts
Test Suites: 2 failed, 133 passed, 135 total
Tests:       1 failed, 1431 passed, 1432 total
```

Both failures are PRE-EXISTING on `origin/main` and untouched by this lane:

- `src/lib/data/__tests__/orders.test.ts` — `Cannot find module '../orders'`; `src/lib/data/orders.ts`
  does not exist in the tree at all.
- `src/lib/__tests__/portal-access.test.ts` — `foreignPortalFromDomain('manufacturer')` now returns
  the maker workspace where the test still expects `null`.

Neither file is in this lane's diff. Flagged for the integration lane, which owns the full gate.

No `@patina/supabase` hook was added, so the vitest / admin-build arm of the gate does not apply.

## Not verified

- **No browser pass.** Nothing here was rendered in a real browser or at a phone width. The door
  opening, the jamb head and the dashed threshold are asserted as SVG geometry in jsdom only; whether
  the opening reads as a door at the band's rendered measure is a visual judgement the integration
  lane's first-viewport render should make.
- **No real data.** Every claim about a phase-less project, about `budget_cents` as the planned
  fallback, and about the soonest-due invoice is from the code paths and from jest fixtures, not from
  a Strata or local row.
- **`project.status` values are inferred.** `ClientProjectOverview.status` is typed `string` and
  defaults to `'active'` in `lib/data/projects.ts`; I matched `completed|complete|closed|archived`
  case-insensitively. If production carries some other finished-state token, such a project falls to
  the safe branch (six ungraduated chapters, nothing held) rather than to a wrong one.
- **The empty room drawing is unchanged.** A room with no pieces still draws the placeholder outline
  with the room's name inside and no door opening; only the drawing that has footprints gained the
  line work. The plan's (e) named footprints as already existing, so I read it as the footprint
  drawing.
- **The `first due` wording is mine**, not the mock's, for the multi-invoice case (see (b)). If the
  reviewer prefers a byte-copy of the mock, the change is one string in `owedDueLine()`.
- **(f) rests on greps, not on a rendered phone viewport.** I proved the widget is not imported into
  the client portal; I did not open the page on a 390px viewport to confirm nothing else overlaps the
  letterbox act.
- Coverage thresholds (70/60/70/70) were not measured for this lane in isolation.

---

# Fix round — against `l9-review.md` (19 findings: 0 blocker, 4 major, 7 minor, 8 nit)

Reviewed at `69767259e`. Every blocker and major applied; minors and nits applied except the
three recorded below. No new feature was added, no unrequested refactor, no shared file touched
beyond the lines a finding names.

## Fixed, by finding number

1. **(major) A finished house drew six ungraduated chapters.** `story-pole.tsx` gains `walkedAt()`:
   walked-ness is `index < heldAt` while something is held, and falls back to the graduation's own
   `status === 'completed'` when nothing is (`heldAt === -1`, which is exactly the canonical
   `finished` branch). The rail entry now carries `data-walked` and strikes its tick in
   `var(--text-primary)` — the same idiom the phone dots already used, so the desktop rail and the
   dots agree. Pinned by two new cases in `threshold-robustness.test.tsx` (six walked when the
   project is `completed`; none when it is `archived`).

2. **(major) The owed row's due date carried no year.** `owedDueLine(due, datedCount, today?)` now
   appends `due.getFullYear()` the moment it differs from `today`'s — the rule `spine-toll.tsx`
   and `letterbox.tsx` already keep. `HouseLedger` takes an optional `today`, and `threshold.tsx`
   feeds it the same `today` the letterbox gets (undefined during SSR and the first paint, which
   simply drops the year, so hydration is unchanged). Tests in `dateline.test.ts` (both counts,
   plus the same-year case) and `threshold-robustness.test.tsx`.

3. **(major) `owedDueDate` had no test at the derive layer.** Two cases added to `derive.test.ts`:
   three open invoices supplied out of due order with one carrying a null `due_date` asserts
   `owedDueDate` is the soonest and `owedDatedCount` is 2; and an all-undated set asserts
   `owedDueDate` is null. This pins the part that was silent — that a null `due_date` sorts to the
   BACK, so `[0].due_date` is null only when nothing is dated.

4. **(major) Neither (a) nor (c) was tested at the call site.** `renderThreshold()` in
   `threshold.test.tsx` now takes an optional `milestones` (defaulted to `MILESTONES`, so every
   existing call is unchanged). Four new cases on the real page: `milestones: []` rules six rail
   entries lettered Discovery…Completion and holds `procurement` with no span; a previous reading
   mark renders `doorstep-reading-mark` with the dateline; a first visit renders none.
   *Incidental:* writing the reading-mark case surfaced that the fixture must be noon UTC, not
   midnight — `previousReadAt` is a timestamptz and is correctly read as the LOCAL calendar day
   the client stood here, so a midnight-UTC fixture is the day before in every American zone. The
   implementation is right; the comment now says so.

5. **(minor) The door opening's geometry was invented and left a floating tick.** The wall now has
   two faces, as the mock's section does (`WALL_L_OUTER = 30`, `WALL_L = 42`): both stop at the
   head, and the head closes between them. The opening reads as a wall cut through rather than a
   38-unit stub standing over a 52-unit gap, and the head returns into something. The dashed
   threshold from `x=0` is unchanged — it is the mock's own line. `room-band.test.tsx` now asserts
   the head's endpoints and that BOTH faces stop at `y=52` (`FLOOR_Y - OPENING_H`), which was the
   reviewer's smaller gap in §8: restoring a full-height wall now fails an assertion, not a count.

6. **(minor) The file-head comment named two lines.** Reworded to name the four strokes and the
   dashed threshold, and why the dashed one is not a piece the client owns.

7. **(minor) `#note` could not take focus.** `tabIndex={-1}` added to the note `<section>`.

8. **(minor) The pin pointed backwards on the ground floor.** That path sets the whole letter ABOVE
   the doors, so `threshold.tsx` now passes `note={!model.groundFloor && mark.id === firstDoorId …}`.
   New case in `threshold.test.tsx`: with the rooms settled empty, the body is set once and no pin
   is drawn.

9. **(minor) "first due" counted every open invoice, not the dated ones.** `HouseLedgerModel` gains
   `owedDatedCount` (`openInvoices.filter(i => !!i.due_date).length`); the row reads "due" when one
   invoice carries a day and "first due" only when several do. Covered in `derive.test.ts` and
   `threshold-robustness.test.tsx` (three open, one dated → "due 15 August").

10. **(minor) `archived` settled all six chapters.** `FINISHED_STATUSES` is replaced by a single
    `FINISHED_STATUS` typed as `Database['public']['Enums']['project_status']` and set to
    `'completed'`, so a rename in the column reaches this file at compile time and the free-text
    values the enum cannot produce are gone. `canonical-phases.test.ts` pins that `archived`
    settles nothing.

11. **(minor) A third link idiom.** The pin's way back is now
    `<ScoredAction actionKey="door_read_note" regionKey="gate" surfaceKey="the_threshold"
    variant="tertiary" href="#note">` — the 44px control box and `makingEvents` telemetry come with
    it. Because `Link` handles the hash navigation itself and preventDefaults, an `onClick` focuses
    `#note` explicitly, so finding 7's `tabIndex` is actually reached. The `door-note-read` testid
    and its `href="#note"` are unchanged, so both existing assertions stand.

13. **(nit) The `|| readingMark` guard.** Kept and documented as defensive, per the finding's second
    option: the page sets it from the same mark that decides `showSince`, and the prop doc now says
    a caller holding only the dateline still gets a row to put it in.

14. **(nit) `noteInBrief`'s trailing strip and its mid-word fallback.** `.`, `!` and `?` added to
    the strip class, so a cut landing past a sentence end no longer prints `…Friday.…`; the raw-cut
    fallback now fires only when the budget genuinely contains no space at all. Three cases added
    to `dateline.test.ts`.

16. **(nit) A missing paper could lose the pin entirely.** `firstDoorId` is now the first door mark
    whose proposal is present in `paperById` — the same `paperById.has(mark.proposalId ?? '')` test
    the mat's paper list already uses — so the pin and the `#door` anchor land on a door that
    actually renders.

18. **(nit) Import order.** `@/lib/threshold/canonical-phases` moved above `@/lib/threshold/derive`,
    so the block reads alphabetically again for the lanes that merge after L9.

## Rejected, with the reason

- **12 — (f) tester-notes widget.** Nothing to fix; the finding is a record, and it agrees with the
  lane. Restated here so integration closes (f) deliberately: the widget exists only in the designer
  portal, so there is no footprint on this surface to pad to. Re-open it with a measured footprint
  if it is ever mounted in the client portal.
- **15 — `spine-toll.tsx`'s "due August 15".** Rejected in this lane: `making/*` is reuse-only for
  L9 and the finding itself says so ("Not L9's file to change"). Bringing `formatDue` onto the
  mock's day-first idiom changes a surface L9 does not own and would collide with the making lanes;
  it belongs to integration.
- **17 — the `lib/` → `components/making` import.** No change required by the finding itself
  (`standing.ts:11` already does this and it is the house pattern). Recorded here for the retirement
  inventory rather than inverted in a fix round.
- **19 — the pin's caption (`— N. · Nora Quist · 4 August, yesterday`).** The finding says "none in
  L9". The caption is a copy change against the mock that L9 did not author and that needs the
  note's author, not the studio name, threaded through `DoorGateProps`; it goes on the mock-fidelity
  backlog with the "Owed on invoice No. 4" label.

## Rulings held

Legal and confirmation copy is byte-identical to the old route — `consent-copy.ts`, the countersign
line and the signing ceremony are still absent from the diff. No act leaves the page: the one new
act is an in-page fragment. Nothing printed reverses. Shared-file edits stayed minimal — `derive.ts`
+7 lines (one field, its doc, one literal entry), `standing.ts` still append-only apart from the two
helpers the findings named, `threshold.tsx` five small hunks, `making/*` untouched.

## Gate output (verbatim)

`pnpm --dir <worktree>/apps/client-portal type-check`:

```
> @patina/client-portal@0.1.0 type-check /Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-l9/apps/client-portal
> tsc --noEmit
```

(clean — no diagnostics)

`pnpm --dir <worktree>/apps/client-portal test -- threshold making`:

```
Test Suites: 33 passed, 33 total
Tests:       618 passed, 618 total
Snapshots:   0 total
Time:        4.888 s
Ran all test suites matching /threshold|making/i.
```

(602 → 618: sixteen new cases across the four findings that asked for tests.)

`npx eslint src/components/threshold src/lib/threshold` (from `apps/client-portal`):

```
(no output — 0 errors, 0 warnings)
```

Full `pnpm test` for `@patina/client-portal` (insurance, not the lane gate) — the same two
pre-existing module-resolution failures the lane already reported, unchanged and untouched by L9:

```
Test Suites: 2 failed, 133 passed, 135 total
Tests:       1 failed, 1447 passed, 1448 total
```

## Still not verified

No browser pass. The room-band opening and the walked rail tick are asserted in jsdom by geometry
and by attribute, not looked at; the first-viewport render belongs to Wave 2's integration report.
