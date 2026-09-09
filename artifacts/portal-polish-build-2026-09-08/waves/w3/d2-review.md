# Wave 3 · Lane D2 — Roster facets (IA-11/12) — review

**Reviewer** — separate context, did not implement this lane. Target: `origin/portal-polish/d2`
(`8e9d1db62`), diffed against `origin/main`, inspected read-only in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d2`. Cross-checked against
`docs/superpowers/plans/2026-09-08-portal-polish-build.md` (Lane D2 section, shared-file table, review
checklist), `docs/design/house-sheet/SPEC.md` (as merged onto this branch — not present on `main`),
`apps/designer-portal/CLAUDE.md` (as amended by A1 on this branch), and
`artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html` §4 (roster head / facets).

## Verdict

**Approve.** No P1/P2 found. Two P3 informational notes below; neither blocks integration.

## Gate — run myself, from the worktree

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                                    # clean, no output

$ pnpm --filter @patina/designer-portal test -- --ci \
    src/components/document/desk-roster.test.tsx \
    src/lib/document/__tests__/desk-roster-derivation.test.ts src/hooks
Test Suites: 28 passed, 28 total
Tests:       316 passed, 316 total

$ pnpm --filter @patina/designer-portal test -- --ci \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 3 passed, 3 total
Tests:       63 passed, 63 total

$ pnpm --filter @patina/designer-portal test -- --ci        # whole portal
Test Suites: 544 passed, 544 total
Tests:       1 todo, 6720 passed, 6721 total
Snapshots:   12 passed, 12 total
                                            # matches W1 baseline (544/6691+1) + 29 new tests,
                                            # no suite lost, the A1 `terminal` todo untouched.

$ cd apps/designer-portal && npx eslint src/components/document src/lib/document src/hooks
✖ 83 problems (2 errors, 81 warnings)
  src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159   import/first
  src/hooks/__tests__/use-commercial-documents.test.ts:930               react-hooks/rules-of-hooks
                                            # exactly the two known baseline errors named in the plan
                                            # and the impl report — count not grown.
```

Every number in the impl report (`.../waves/w3/d2-impl.md`, committed in-branch at `02fc380c0`) checks
out against my own run.

## Pathspec discipline

```
$ git diff origin/main...origin/portal-polish/d2 --stat
 apps/designer-portal/src/app/(document)/desk/page.tsx           |   2 +-
 apps/designer-portal/src/components/document/desk-roster.test.tsx | 252 ++-
 apps/designer-portal/src/components/document/desk-roster.tsx      | 189 ++--
 .../lib/document/__tests__/desk-roster-derivation.test.ts         | 241 ++
 apps/designer-portal/src/lib/document/desk-roster-derivation.ts   | 162 ++
 artifacts/.../waves/w3/d2-impl.md                                  | 169 ++
```

Exactly the lane's five files plus its own report. Confirmed **not** touched: `app/globals.css`,
`eslint.config.mjs`, `document-action.tsx`, `command-bar.tsx`, `recent-boards-strip.tsx`, anything
under `apps/client-portal`. `desk/page.tsx`'s diff is the one line the shared-file table grants D2
(passing `studioMembers` down); D3 owns the rest of that file and is untouched. `desk-roster.tsx`'s
diff is the head row plus the render-path branching the head row's new state requires — D1's "block
between head and first plate" and D4's `:110` row-rule `className` are both untouched (confirmed by
reading the full diff — no touch to the day's-line region or to the row's `className` literal).
`desk-roster-derivation.ts`'s diff is appended at the end, after `deriveDeskRoster` — D1's derivation
work is a separate, later append, not touched here.

## House sheet compliance

- **No new hex.** `git diff origin/main...origin/portal-polish/d2 -- apps/designer-portal | grep -cE '^\+.*#[0-9A-Fa-f]{6}'` → confirmed 0 by re-running the grep myself. Person-plate colour is
  `bg-[var(--doc-rail-stock)] text-[var(--text-primary)]` — verified in `globals.css`:
  `--doc-rail-stock: #E8E3DB` (the sheet's `--rail`) and `--text-primary: var(--color-charcoal)` (the
  sheet's `--ink`, 13.53:1 contrast per the sheet). Matches the reviewer brief's explicit check
  ("`--ink` on `--rail` person plates").
- **Type steps.** `FACET_CLASS` sets `!text-[11px] !font-medium !tracking-[0.08em]`, matching the
  sheet's `.t-head` (11px/500/.08em); `uppercase` is inherited from `DocumentAction`'s shared
  `BASE_CLASS`, so it isn't re-specified — correct, not missing.
- **No pill/badge/dot/✓/spinner.** The person plate reuses the pre-existing stage-plate visual grammar
  (a small rounded-3px label with an appended `· count`) — that pattern predates this lane and is
  exactly what the specimen's own `.stage-plate--person` does (`designer-desk.html:519`:
  `background: var(--rail); color: var(--ink)`). Not a new badge.
- **No truncation, no opacity .5 on a state, no counts-as-tiles, no second queue, no shadow.** Confirmed
  by reading the diff and by the lane's own `writes no shadow and no padding switch on the head row`
  test, which I re-ran green. `filterRosterToNeeds` / `groupRosterByPerson` are pure views over the
  same `roster.groups` population the stage render already uses — no new fetch, no new list the roster
  doesn't already contain.
- **44px targets.** `FacetAct` renders through `DocumentAction`, whose `BASE_CLASS` carries
  `min-h-[44px] min-w-[44px]` — confirmed by reading `document-action.tsx:52-53`. The `-my-2` wrapper
  on the facets `<div>` only pulls the row's own box back up/down 8px to keep the head row's height
  from growing around the 44px control; it does not touch the button's own min-height, so the
  clickable target itself stays 44px. (Flagged as a P3 visual-only note below.)

## D1/D4 of the designer CLAUDE.md

No split view, no persistent nav inside the document, no new depth — the diff adds a `<div>` with two
buttons to an existing head row and a `useState`-driven render branch; nothing here approaches D1's
concerns. D4 (zero shadows, R126's one token) is untouched: no `box-shadow`, no `--elevation-sheet`
reference, no `desk-settle` reference anywhere in the diff (grepped both).

## The ruling (IA-11 / IA-12) and the specimen

Compared against `designer-desk.html:262-282` (CSS) and `:719-767` (the `render()` logic) line by line:

- Head sentence composition (`'Every job · N live · M overdue'` + `' · showing what needs you'` +
  `' · by person'`) matches the specimen's string-building exactly, including the order the two
  clauses are appended in. `facetHeading`'s own test pins this.
- `PEOPLE` in the specimen (`['Leah Hartwell', 'Anneke Sund', 'Colin Brandt']`) is already
  principal-first-then-alphabetical — the same ordering `deriveRosterPeople` derives generally,
  confirmed by a matching test.
- Facet buttons are `.act--tertiary` with `aria-pressed` in the specimen; the impl uses
  `DocumentAction variant="tertiary"` with `aria-pressed` — same grammar, real component.
- Labels are static text in both; state is carried by `aria-pressed` (and, in the specimen, a CSS rule
  for the pressed state I could not find defined in the extracted CSS block, i.e. the specimen itself
  may rely on the same `.da-*` two-score CSS this lane correctly leaves to D4/globals.css).
- **One divergence worth naming, not a defect:** the specimen's "Only what needs me" narrows by a job
  carrying any mark (`j.m`), and separately shows an always-present "One thing is overdue…" /
  "new lead…" / "replied last night…" block (the day's line, D1's territory) beneath the head — my read
  of the diff confirms this lane does not touch that region, so D1's block is untouched, matching the
  shared-file table.

## Judgement calls in the impl report — my assessment

1. **Unassigned + "stranger" `designer_id` both group under the principal.** The plan's own text says
   only "unassigned rows group under the principal"; the lane extends this to a `designer_id` that
   names nobody on the current member list. I agree with the lane's reasoning (a person group that
   silently drops a row breaks the "person groups total the roster's own count" invariant the codebase
   already protects via `liveCount`), and it is explicitly tested — `never loses a row whose designer
   is nobody on the list` and `keeps every live row: the person groups total the roster's own count`
   (`desk-roster-derivation.test.ts:648-676`), both of which I ran and confirmed green. **No finding.**
2. **"By person" renders nothing when no member can be named; "Only what needs me" always renders.**
   Consistent with "absence is silence" and confirmed by the `offers no "By person" act when no member
   of the studio can be named` test. **No finding.**
3. **The pressed state's two-score CSS is left to D4/`globals.css`.** Correctly scoped per the
   shared-file table (D2 owns the head row only). The facet's pressed state is still legible without it
   (`aria-pressed`, full ink via the Tailwind override, the head sentence naming the facet) — confirmed
   by reading `FACET_CLASS` and the "keeps each label the same word once its facet is on" test.
   **No finding**, but this is a real dependency: **integration must confirm** D4's `.da-tertiary`
   pressed-state score rule actually reaches these buttons once merged (D4 → D3 → D1 → **D2** is the
   stated merge order, so D4's CSS will already be on `portal-polish/integration` before D2 lands —
   correct order for this dependency to resolve automatically).

## Findings

### P3 — low confidence — `-my-2` compensation is asserted, not visually verified
**File:** `apps/designer-portal/src/components/document/desk-roster.tsx` (facets wrapper div)
**Claim:** the `-my-2` negative margin used to keep the head row's height from growing around the
facet buttons' 44px control box is correct by CSS arithmetic (`my-2` = 8px each side, half of the
16px difference between a 44px control and a ~28px text baseline row), but no visual render (1440/390)
exists yet for this lane in isolation — the plan defers all rendering to Wave 3 integration. This is
expected per the plan (D-lanes run jest only, no dev server), not a lane defect. I flag it only so the
integration reviewer's 1440/390 render explicitly checks the head row does not visually overlap the
margin-note or the day's-line block above/below it at 390px, where the facets wrap to a second line.
**Fix:** none owed from D2; a note for the Wave 3 integration render pass.

### P3 — low confidence — `byPerson` state can outlive its own `studioMembers` data
**File:** `apps/designer-portal/src/components/document/desk-roster.tsx`
**Claim:** `byPerson` is local `useState`, decoupled from `people.length`. If `studioMembers` ever
transitions from populated to empty for an already-mounted roster (e.g. a failed refetch, or a page
that briefly renders before the membership query settles a second time), the "By person" toggle button
disappears (its render is gated on `people.length > 0`) while `byPerson` remains `true` in state, and
`groupRosterByPerson` returns `[]` for zero people — the roster would then show "Nothing needs your
hand today." even though jobs exist, which is a wrong reading of a data hiccup as "day's work is done."
I did not find a test exercising this specific transition (mount with members, then re-render with
`studioMembers` empty/undefined while `byPerson` is `true`), and I judge it as low-likelihood in
practice given `useOrganizationMembers` is one studio's own membership list under React Query (stable,
rarely toggles from present to empty on live data). Not severe enough to withhold approval.
**Fix (optional, cheap):** reset `byPerson` to `false` in a `useEffect` keyed on `people.length === 0`,
or simply compute the "facet emptied everything" message from `narrowed.length === 0` when `byPerson`
is on but `people.length === 0`, rather than trusting `personGroups`.

## What I did not do

- Did not run a dev server or a browser render — out of scope for a D-lane reviewer (Wave 3 integration
  owns :3000 and the 1440/390 renders).
- Did not review D1, D3, D4, D5, D6 — this report is D2 only.
- Did not check `origin/portal-polish/integration` (does not yet include D2 per current branch list).
