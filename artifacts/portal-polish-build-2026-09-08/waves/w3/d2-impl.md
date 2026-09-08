# Wave 3 · Lane D2 — Roster facets (IA-11 / IA-12) — implementation

**Branch** `portal-polish/d2` (from `origin/main` `1059f5275`) · **worktree**
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d2` · **commit** `e31cb4d17`
`feat(designer): roster facets — only what needs me, by person (IA-11/12)`

---

## What shipped

Two `.t-head` tertiary acts on the roster head row, right of the head sentence, each carrying
`aria-pressed`. Their labels never change with state (IX18); the state is carried by
`aria-pressed`, by the head sentence, and by full ink on the pressed act.

### Files (five — exactly the lane's list)

| File | Change |
|---|---|
| `apps/designer-portal/src/lib/document/desk-roster-derivation.ts` | `RosterLine` gains `stage` + `designerId`; the facet block appended at the end |
| `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts` | 21 new tests for the facet predicates |
| `apps/designer-portal/src/components/document/desk-roster.tsx` | the head row, the facet state, the person-grouped render path |
| `apps/designer-portal/src/components/document/desk-roster.test.tsx` | fixtures updated for the two new line fields; 12 new facet tests |
| `apps/designer-portal/src/app/(document)/desk/page.tsx` | one line: `<DeskRoster roster={roster} studioMembers={studioMembers} />` |

### The derivation (facet predicates)

New exports in `desk-roster-derivation.ts`:

- `NOTHING_NEEDS_YOU = 'Nothing needs your hand today.'`
- `rosterLineNeedsAHand(line)` — `line.mark !== null`. The mark is what `deriveDeskRoster` already
  writes off the need model (`URGENT_NEED_KINDS:59` is its red-letter half; a quiet need is still a
  need), so the facet reads the same fact the margin does instead of deriving a second one.
- `filterRosterToNeeds(groups)` — narrows every group to its marked rows, recounts, drops the
  groups left empty.
- `RosterMember` — a structural four-field shape (`user_id`, `role`, `status`, `profiles`) that
  `OrganizationMemberWithProfile` satisfies. The derivation module stays dependency-light: it does
  not import `@patina/supabase`.
- `deriveRosterPeople(members)` → `RosterPerson[]` — active/invited members that carry a name
  (`full_name` then `display_name`), principal (`role === 'owner'`) first, the rest alphabetical.
  A member with no name is left out; an unnamed plate says nothing.
- `groupRosterByPerson(groups, people)` → `RosterPersonGroup[]` — keyed `person-<user_id>`, a person
  carrying nothing prints no plate, and `people.length === 0` groups nothing.
- `facetHeading(heading, { needsMe, byPerson })` — appends ` · showing what needs you` and
  ` · by person`, matching the specimen's `render()` exactly (`designer-desk.html:723-726`).

Two fields added to `RosterLine`:

- `designerId: string | null` — from `DocumentStateRow.designer_id`, which `00191_document_state_view.sql`
  carries straight off `projects/proposals/leads.designer_id`, a `profiles.id` — the same id
  `organization_members.user_id` holds, so it matches `useOrganizationMembers`' rows directly.
- `stage: SectionKey` — the job's own stage on the line, not only on its group. By person regroups
  the same lines away from their stage, and the row's hover wash still belongs to the stage the job
  is in. `JobLine`'s `tone` now reads `STAGE_TONE[line.stage]`; in stage mode this is identical to
  the old `STAGE_TONE[group.key]`.

### The component

- Head row: a flex row, `items-baseline justify-between`, holding the existing `SectionEyebrow`
  (whose `<span id="every-job">` now prints `facetHeading(...)`) and a facets div. `flex-wrap` means
  the facets drop to a second line at 390, still above the first plate. `-my-2` on the facets div
  absorbs `DocumentAction`'s 44px control box so the head row does not grow.
- `FacetAct` — `DocumentAction variant="tertiary"`, `surfaceKey="desk"`, `regionKey="every-job-facets"`,
  `aria-pressed`, and `FACET_CLASS = '!text-[11px] !font-medium !tracking-[0.08em] aria-pressed:!text-[var(--text-primary)]'`.
  The `!` is deliberate: the tertiary variant sets 12px/300/.1em, and without `important` the winner
  between two arbitrary Tailwind font-sizes depends on emission order.
- **Only what needs me** → `filterRosterToNeeds`. A stage left with nothing prints no plate. Empty
  result prints `Nothing needs your hand today.` in place of the groups — never an empty list.
- **By person** → `groupRosterByPerson`. Person plates carry
  `bg-[var(--doc-rail-stock)] text-[var(--text-primary)]` — the designer portal's name for the house
  sheet's `--rail` (`globals.css:58` is the only `#E8E3DB` in the file) with `--ink` labels. No
  `--tab-*` pigment, no `text-white`.
- The two facets compose; with neither on the render path and the stage plates are byte-identical to
  what shipped before.

## Judgement calls (for the reviewer)

1. **A row whose `designer_id` names nobody on the member list groups under the principal**, exactly
   as an unassigned row does. The plan rules only on unassigned rows. The alternative — dropping it —
   would make the person groups total fewer jobs than the head's own live count, which is the drift
   `deriveDeskRoster`'s own comment (`liveCount` counted off the groups) exists to prevent. A test
   pins the total (`the person groups total the roster's own count`).
2. **"By person" does not render when no member can be named** (`people.length === 0`) — a facet that
   would produce nothing renders nothing. "Only what needs me" always renders.
3. **`data-tour-anchor="desk-folio"` sits on the facet-empty sentence** so
   `desk-walkthrough.tsx:147`'s `anchorSelector` still resolves in that state. Only one element
   carries it in any given state.
4. **The pressed act's two-score rule is NOT in this diff.** §F-E's pressed look is `--ink` text plus
   the secondary two-score rule; the text half is here as a Tailwind `aria-pressed:` variant, but the
   scores are `.da-*` pseudo-element CSS in `app/globals.css`, which the shared-file table assigns to
   **D4 only**. Flagging for D4 / integration rather than writing into another lane's file. The
   facet's state is legible without it: `aria-pressed`, full ink, and the head sentence.

## Evidence

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/components/document/desk-roster.test.tsx \
    src/lib/document/__tests__/desk-roster-derivation.test.ts \
    src/lib/document/__tests__/shadow-gate.test.ts
PASS src/lib/document/__tests__/shadow-gate.test.ts
PASS src/lib/document/__tests__/desk-roster-derivation.test.ts
PASS src/components/document/desk-roster.test.tsx
Test Suites: 3 passed, 3 total
Tests:       75 passed, 75 total

$ pnpm --filter @patina/designer-portal test -- --ci        # whole portal
Test Suites: 544 passed, 544 total
Tests:       1 todo, 6720 passed, 6721 total
Snapshots:   12 passed, 12 total
#   baseline after W1 was 544 suites / 6691 passed + 1 todo — same suite count,
#   +29 tests, all mine. The 1 todo is A1's 'terminal' row, untouched (D4 folds it).

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                              # no output

$ npx eslint <the five lane files>                          # from apps/designer-portal
#   no output — zero problems

$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
#   the two known baseline errors, unchanged:
#     src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159  import/first
#     src/hooks/__tests__/use-commercial-documents.test.ts:930  react-hooks/rules-of-hooks

$ git diff --stat HEAD~1
 .../src/app/(document)/desk/page.tsx               |   2 +-
 .../src/components/document/desk-roster.test.tsx   | 252 ++++++++++++++++++++-
 .../src/components/document/desk-roster.tsx        | 189 +++++++++++++---
 .../__tests__/desk-roster-derivation.test.ts       | 241 ++++++++++++++++++++
 .../src/lib/document/desk-roster-derivation.ts     | 162 +++++++++++++
 5 files changed, 805 insertions(+), 41 deletions(-)

$ git diff HEAD~1 | grep -cE '^\+.*#[0-9A-Fa-f]{6}'
0                                                   # no new hex literal
$ git diff HEAD~1 | grep -n 'box-shadow|elevation-sheet|desk-settle'
#   only hit: the `shadow-` regex inside my own no-shadow assertion
```

## What I did not do

- Did not touch `app/globals.css`, `eslint.config.mjs`, `shadow-gate.test.ts`, `document-action.tsx`,
  `command-bar.tsx`, `recent-boards-strip.tsx`, or anything under `apps/client-portal`.
- Did not touch `--elevation-sheet` or `desk-settle`; no `box-shadow` anywhere in the diff.
- Did not add a second data fetch — `useOrganizationMembers` at `desk/page.tsx:90` is reused; the
  page edit is the one `<DeskRoster …>` line.
- Did not add a padding or density switch; the row markup, plate markup and spacing are untouched by
  the facets.
- Did not rename an anchor id, reset the database, start a dev server, run the Supabase CLI, or
  deploy anything.
- Did not fold A1's `test.todo` 'terminal' row — that is D4's.
- Did not run prettier `--write`: `desk-roster.tsx` and `desk/page.tsx` already fail
  `prettier --check` on `origin/main`, so the pre-commit warning is inherited, not introduced, and
  reformatting would have swamped the diff.
