# Lane D3 — Boards beside the head (IA-17) — implementation report

**Branch:** `portal-polish/d3` (pushed to `origin/portal-polish/d3`)
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d3`
**Head commit:** `34f41a2c98ff82cbdd899a1a6cabcc3b742a65f5`
**Base:** `origin/main` @ `1059f5275` (`docs(portal-polish): W1 ship report — 00580 on Strata, gates green`)

## What shipped

Exactly the three files the lane lists, nothing else:

- `apps/designer-portal/src/app/(document)/desk/page.tsx` — container/grid only
- `apps/designer-portal/src/components/document/recent-boards-strip.tsx` — `compact` variant
- `apps/designer-portal/src/components/document/__tests__/recent-boards-strip.test.tsx` — new

```
git diff --stat (vs origin/main):
 apps/designer-portal/src/app/(document)/desk/page.tsx            | 74 +++++++++++++----
 apps/designer-portal/src/components/document/recent-boards-strip.tsx | 65 ++++++++++++++-
 apps/designer-portal/src/components/document/__tests__/recent-boards-strip.test.tsx | new file (216 lines)
 3 files changed, 356 insertions(+), 22 deletions(-)
```

### desk/page.tsx

1. At `≥1280px` (Tailwind's default `xl` breakpoint, unmodified in
   `tailwind.config.ts` — no `screens` override), the roster/strip region
   becomes a CSS grid: `grid-cols-[minmax(0,1fr)_260px] gap-12` — roster in
   column 1 (wrapped in `min-w-0`), the compact boards rail in column 2.
   Below 1280 the region is byte-identical to the pre-change markup.
2. Which layout renders is decided by one piece of client state,
   `isWideDesk`, set via `window.matchMedia('(min-width: 1280px)')` with a
   live `'change'` listener — the same pattern already used by
   `margin-rail.tsx` and `use-lens-state.ts` in this codebase. It defaults to
   `false` so SSR and the first client paint always agree (no hydration
   flash flagged by React), matching the existing `useHydrated` convention
   in this same file.
3. Only ONE `<RecentBoardsStrip>` instance ever mounts (full below 1280,
   `compact` at ≥1280) — never both. This was a deliberate choice, not an
   oversight: `desk/page.test.tsx`'s existing D5 assertions do
   `screen.getByText('Recent boards')` and
   `screen.getByRole('link', { name: 'Open mood board …' })` as *singular*
   queries. Mounting both variants simultaneously (even if one were
   CSS-hidden) would still exist in the jsdom tree — Tailwind's utility
   classes carry no real CSS in jest — and would break those pinned
   assertions with "found multiple elements" the moment any board data was
   present. The `rosterBlock` (skeleton-or-`<DeskRoster>`) is factored into
   one local const consumed by both branches to avoid duplicating that
   block.
4. `DeskBoardsReactionRollup` sits after the grid/single-column branch,
   unconditionally, unaffected by the breakpoint (it was never part of the
   file list or the design's boards-rail scope).
5. The rail wrapper is a plain `<div>`, not a landmark `<aside>` — I
   originally wrote `<aside aria-labelledby="recent-mood-boards-compact">`
   but reverted it: `RecentBoardsStrip`'s own `<section
   aria-labelledby="recent-mood-boards-compact">` is already the labelled
   region, so a wrapping `<aside>` pointed at the same id would have doubled
   it up as a second, identically-named nested landmark.

### recent-boards-strip.tsx

- Added `compact?: boolean` prop (default `false`); the full-strip branch is
  **untouched, byte-for-byte** below the new `if (compact) { … }` early
  return.
- `useRecentBoards(8)` is unchanged; compact slices `boards.slice(0, 3)`
  client-side, per the plan.
- Compact markup: a `SectionEyebrow` heading reading **"Boards"** (distinct
  from the full strip's "Recent boards" — this also happens to be what keeps
  the two variants from colliding on `getByText` if a future test or
  screen-reader tree ever saw both at once), then up to three vertically
  stacked links, each a 92×92px `BoardCoverArt` plus board name (`.max-w-[130px]`,
  wraps — no `truncate`/ellipsis, per the house-sheet "no truncation" rule)
  and `formatRelativeTime(board.updatedAt)`. No room/owner subtitle, no
  `BoardVerdictSummary` — matches the plan's "name plus relative time" and
  the visual truth (`designer-desk.html` §D row 6: "three 92px … board
  thumbnails, each captioned … with house and date" — I read "captioned"
  narrowly, per the plan's own narrower wording, and did not add the
  room/owner line the full strip carries).
- No new hex literal, no shadow, no truncation-via-ellipsis, no pill/badge —
  checked with `git diff … | grep -in "shadow\|#[0-9a-fA-F]\{3,6\}\|truncate\|ellipsis"`
  → no hits in the diff.

### recent-boards-strip.test.tsx (new)

Two describe groups:

1. **`RecentBoardsStrip` — full strip and compact rail** (component-level,
   the lane's direct file): empty→null for both variants; full strip prints
   "Recent boards", the room/owner line, calls `useRecentBoards(8)`; compact
   caps at 3 boards from a 4-board fixture, renders exactly three `.h-[92px]
   .w-[92px]` covers, prints name + relative time only (no room/owner line,
   no verdict text), labels itself "Boards" (not "Recent boards"), and still
   calls `useRecentBoards(8)` (never a smaller limit).
2. **`desk/page.tsx` — the boards rail beside the roster head (IA-17)**
   (page-level, covering the two remaining plan assertions that only exist
   at the page/grid level): renders `<DeskPage/>` with `window.matchMedia`
   swapped to report `matches: false` / `matches: true` for the
   `(min-width: 1280px)` query and asserts (a) below 1280 the full strip's
   "Recent boards" text is present and "Boards" is absent, with the roster
   still on screen; at ≥1280 the reverse — "Boards" present, "Recent boards"
   absent, roster still on screen; and (b) at ≥1280 the grid container's
   `className` literally contains `minmax(0,1fr)_260px`.

   This second describe block necessarily imports `DeskPage` and stubs the
   same modules `desk/page.test.tsx` already stubs (`use-desk-engagements`,
   `use-auth`, `use-hydrated`, `use-feature-flag`, `command-bar`,
   `document-events`, `desk-contents`, `margin-note`, `desk-walkthrough`,
   the two overlay sheets, `use-document-surface`, `account-sheet`,
   `mobile-shell`) — **flagged for the reviewer**: this duplicates
   `desk/page.test.tsx`'s mock scaffolding rather than extending that file,
   because `desk/page.test.tsx` is not in D3's file list. I judged this the
   lesser violation versus editing an unlisted file, but it is a real
   maintenance-duplication cost and the two mock blocks can drift. If the
   integration lane would rather fold these two page-level assertions into
   `desk/page.test.tsx` directly, that's a clean, low-risk follow-up.

## Design-record trace

- **≥1280px, not the specimen's 1200px.** `docs/design/house-sheet/SPEC.md`
  §D's own `designer-desk.html` CSS uses a 1200px breakpoint, but the plan's
  own Lane D3 section (and this task's dispatch) is explicit and repeated:
  "At ≥1280px … Below 1280 the single column is unchanged." I followed the
  plan literally over the specimen — 1280 also happens to be Tailwind's
  unmodified default `xl` breakpoint in this app, which is what let me use
  the framework's live-resize machinery I already had (matchMedia) without
  inventing a new breakpoint constant.
- **Board thumbnails are `BoardCoverArt` (photo/mosaic/monogram
  precedence), not new inline-SVG drawings.** The specimen's HTML draws
  bespoke SVG board compositions; the plan's own D3 steps say "three boards,
  `BoardCoverArt` at 92px (`:57`)" — i.e., reuse the real component. I
  followed the plan text, which is also the only path that doesn't invent a
  second board-thumbnail rendering system alongside the existing one.
- **Never above the roster.** Confirmed by construction: `rosterBlock`
  always renders first in DOM/visual order in both branches; the compact
  rail is a sibling grid column at the *same* row as the roster (not above
  it), and below 1280 the full strip is exactly where D5 left it, after the
  roster.

## Gate — commands run, verbatim output (from inside the worktree)

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(clean — no output, exit 0)

$ pnpm --filter @patina/designer-portal test -- --ci src/components/document/__tests__/recent-boards-strip.test.tsx
PASS src/components/document/__tests__/recent-boards-strip.test.tsx
  RecentBoardsStrip — the full strip (unchanged below 1280)
    ✓ renders nothing once the query resolves empty
    ✓ prints "Recent boards" with the room/owner line and the verdict summary
  RecentBoardsStrip — the compact rail (IA-17, ≥1280px)
    ✓ renders nothing once the query resolves empty, same as the full strip
    ✓ renders at most three boards at a 92px cover, capped from a longer list
    ✓ prints the board name and relative time only — no room/owner line, no verdict summary
    ✓ labels the rail heading "Boards", distinct from the full strip's "Recent boards"
    ✓ still asks useRecentBoards(8) — the variant slices client-side, it never asks for fewer
  desk/page.tsx — the boards rail beside the roster head (IA-17)
    ✓ renders the rail only at ≥1280px; below it, the full strip stays where it was
    ✓ keeps the roster column minmax(0,1fr) in the ≥1280 grid — no min-width overflow
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total

$ pnpm --filter @patina/designer-portal test -- --ci "src/app/(document)/desk"
PASS src/app/(document)/desk/desk-hire-handoff.test.tsx
PASS src/app/(document)/desk/page.test.tsx
Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
(both pre-existing files, UNTOUCHED, pass exactly as before — D5's "Recent
boards below the roster" assertions still hold at the default/narrow width
the test environment reports)

$ pnpm --filter @patina/designer-portal test -- --ci "src/app/(document)/desk" "src/components/document"
Test Suites: 290 passed, 290 total
Tests:       1 todo, 2958 passed, 2959 total
(the pre-existing 1 todo is A1's 'terminal' row in document-action.test.tsx,
owed to D4, not this lane)

$ pnpm --filter @patina/designer-portal test -- --ci      (full designer-portal suite, run twice)
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6700 passed, 6701 total
(baseline was 544 suites / 6691 passed + 1 todo — this lane added exactly
1 suite and 9 tests: 544+1=545, 6691+9=6700. One earlier run of the full
suite showed 2-3 unrelated flaky failures — different files each time
(item-composer-party.test.tsx, payment-milestones-builder.test.tsx,
discovery-section.test.tsx, service-agreement-drafting-room.test.tsx — none
of them touch desk/page.tsx, recent-boards-strip.tsx, or their test files);
re-runs were clean, confirming pre-existing flakiness unrelated to this
diff, not a regression.)

$ npx eslint "src/app/(document)/desk/page.tsx" "src/components/document/recent-boards-strip.tsx" "src/components/document/__tests__/recent-boards-strip.test.tsx"   (from apps/designer-portal)
(clean — zero errors, zero warnings on the three files this lane touched)

$ npx eslint "src/app/(document)/desk" "src/components/document"   (from apps/designer-portal)
✖ 38 problems (1 error, 37 warnings)
(the 1 error is the pre-existing piece-room-save-gate.test.tsx:159 baseline
error — not introduced by this lane; the 37 warnings are all pre-existing
`Unused eslint-disable directive` / `exhaustive-deps` warnings in files this
lane never touched)

$ pnpm --filter @patina/designer-portal lint    (full designer-portal, also re-run by the pre-push hook)
✖ 205 problems (2 errors, 203 warnings)
(exactly the documented baseline: piece-room-save-gate.test.tsx:159 and
use-commercial-documents.test.ts:930 — count NOT grown)

$ pnpm --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/shadow-gate.test.ts
PASS — 6/6, and `git status --porcelain` on that file is empty (untouched)
```

## What I did NOT do

- Did not touch `desk-roster.tsx`, `desk-roster-derivation.ts`, or any other
  file outside the three listed — confirmed by `git status --porcelain`
  after `git add` staged exactly `page.tsx`, `recent-boards-strip.tsx`,
  `recent-boards-strip.test.tsx` and nothing else.
- Did not run `supabase db reset`, start a dev server, or touch port 3000 —
  ran only `type-check`, `test -- --ci`, and `eslint`.
- Did not add a new source of "3" (the compact board count) or "92px" —
  reused the plan's literal values and the existing `BoardCoverArt`
  component; did not invent a new hook, a new abstraction, or a shared
  `useMediaQuery` utility (kept the matchMedia logic inline in `page.tsx`,
  matching how `margin-rail.tsx` / `use-lens-state.ts` already do it
  in-file rather than as a shared hook).
- Did not fix the two baseline lint errors (out of scope; explicitly listed
  as "DO NOT GROW the count", not "fix").
- Ran `npx prettier --write` on the three files mid-task out of habit — its
  *default* config (no repo-root `.prettierrc`) reformatted single quotes to
  double quotes across the whole of `page.tsx`, which would have produced a
  ~470-line diff far beyond this lane's actual change and diverged from the
  rest of the codebase's established single-quote style. Caught it via
  `git diff --stat` immediately after, and ran `git checkout --
  <the 3 files>` to restore the committed (single-quote, repo-convention)
  versions before re-verifying and pushing. The commit that actually shipped
  was made *before* that misstep, so nothing bad ever left the worktree —
  flagging it here for the record, since a reader diffing local history
  would otherwise wonder about the gap.
- Did not open a PR — pushed the branch only, per the lane's own commit
  instruction; a PR link was offered by GitHub in the push output
  (`https://github.com/Kodeman/PatinaBase/pull/new/portal-polish/d3`) but
  opening one is the integration lane's call.

## Known coverage gap for the reviewer

"No horizontal overflow at 1280, 1440 or 390" and "the roster's first row
is still above the fold at 1440×900" (the review checklist's two visual
claims) are **not** unit-testable in jsdom (no real layout engine) and are
not covered by this lane's tests beyond the className-literal check above.
Per the plan, actual overflow/above-the-fold verification is the wave-3
integration lane's Playwright render step (1440/390 screenshots). I did not
attempt a substitute for that here.

## Commit

```
34f41a2c9 feat(designer): boards beside the roster head at ≥1280 (IA-17)
```

Pushed: `origin/portal-polish/d3` (new branch,
`https://github.com/Kodeman/PatinaBase/pull/new/portal-polish/d3` offered by
GitHub, not opened).
