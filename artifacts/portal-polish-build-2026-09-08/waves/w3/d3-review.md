# Lane D3 — Boards beside the head (IA-17) — review

**Reviewer:** separate context, did not implement this lane. Reviewed against
`docs/superpowers/plans/2026-09-08-portal-polish-build.md` (Wave 3 header,
Lane D3 section, Review protocol), `docs/design/house-sheet/SPEC.md` §A/§F,
`docs/superpowers/specs/2026-09-08-portal-polish-build-design.md`, and
`apps/designer-portal/CLAUDE.md` (D1/D4, success criterion).

**Branch inspected:** `origin/portal-polish/d3` @ `34f41a2c9`, base `origin/main` @ `1059f5275`.
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d3` (read-only).

## Pathspec discipline

```
$ git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/d3 --stat
 .../src/app/(document)/desk/page.tsx               |  77 +++++--
 .../__tests__/recent-boards-strip.test.tsx         | 236 +++++++++++++++++++++
 .../components/document/recent-boards-strip.tsx    |  65 +++++-
 3 files changed, 356 insertions(+), 22 deletions(-)
```
Exactly the three files D3's file list names, exactly matching the impl report's own diff-stat.
No file outside the lane's list is touched. Single commit, Conventional Commits
(`feat(designer): boards beside the roster head at ≥1280 (IA-17)`), pushed to
`origin/portal-polish/d3`, no PR opened (correctly left to integration). `main` untouched.

## Gate — independently re-run from the worktree, verbatim

```
$ pnpm --dir .../agent-pp-d3 --filter @patina/designer-portal type-check
> tsc --noEmit                                                     (clean, exit 0)

$ npx jest --ci "src/app/\(document\)/desk" "src/components/document/__tests__/recent-boards-strip.test.tsx"
Test Suites: 1 passed, 1 total     (recent-boards-strip.test.tsx — 9/9)
Tests:       9 passed, 9 total

$ npx jest --ci "src/app/\(document\)/desk"
PASS src/app/(document)/desk/desk-hire-handoff.test.tsx
PASS src/app/(document)/desk/page.test.tsx
Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total

$ npx jest --ci                                                     (full designer-portal suite)
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6700 passed, 6701 total
Time:        75.587 s
```
Matches the impl report's claimed baseline (544+1=545 suites, 6691+9=6700 passed +1 todo=6701)
exactly.

```
$ npx eslint "src/app/(document)/desk/page.tsx" "src/components/document/recent-boards-strip.tsx" \
    "src/components/document/__tests__/recent-boards-strip.test.tsx"
(clean — zero errors, zero warnings)

$ npx eslint "src/app/(document)/desk" "src/components/document"
✖ 38 problems (1 error, 37 warnings)     — matches report exactly (piece-room-save-gate.test.tsx:159
                                            baseline error; 37 pre-existing unused-disable/exhaustive-deps
                                            warnings in files this lane never touched)

$ pnpm --dir .../agent-pp-d3 --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)  — matches the documented baseline exactly, count not grown

$ npx jest --ci src/lib/document/__tests__/shadow-gate.test.ts
PASS — 6/6

$ git -C .../agent-pp-d3 diff origin/main...HEAD --stat -- \
    apps/designer-portal/src/lib/document/__tests__/shadow-gate.test.ts
(empty — file untouched)
```

All gate numbers in the impl report are real and reproducible. One process note (not a code
defect) below in F3.

## House sheet / global constraints

- `git diff | grep -in "shadow\|#[0-9a-f]\{3,6\}\|truncate\|ellipsis\|opacity-50\|badge\|pill\|spinner\|✓"` → **no hits**. No new hex literal, no shadow, no truncation, no pill/badge/dot/✓/spinner, no `opacity: .5` on a state.
- Board name wraps at `max-w-[130px]` with no `truncate`/ellipsis — correct per "no truncation — wrap."
- "Absence is silence" respected: the compact rail shares the full strip's `if (isError || (!isLoading && boards.length === 0)) return null` gate before branching on `compact` — an empty/errored board list renders nothing in either variant.
- No new queue, no counts-as-tiles, no second data source: `useRecentBoards(8)` is unchanged; the compact variant slices client-side (`boards.slice(0, 3)`), confirmed by a test that a 4th board never renders and the hook is still called with `8`.

## D1/D4 (designer CLAUDE.md)

- D1 ("no split views, no document tabs, no persistent global nav inside a document") does not apply — this diff is entirely on `/desk` (the roster page), never inside an open document (`/doc/[id]`).
- D4 (shadow ban) — no shadow in the diff; `shadow-gate.test.ts` green and byte-unedited (confirmed above).
- Success criterion ("no shadow, no zone, no badge, no dashboard") — nothing in this diff introduces any of those.

## "Never above the roster" / layout correctness

Confirmed by code, not just by claim: `rosterBlock` (the skeleton-or-`<DeskRoster>` const) is the
first child in both the `isWideDesk` grid branch (`<div className="min-w-0">{rosterBlock}</div>`
placed before the boards-rail `<div>`, same grid row via default CSS Grid auto-placement — verified
no explicit `grid-row`/`order` override) and the `<>...</>`  narrow-width branch (`rosterBlock` then
`<RecentBoardsStrip />`). `DeskBoardsReactionRollup` and the Studio index (`DeskContents`) render
**after and outside** the grid, at full container width, in both branches — so the studio index is
never squeezed into the boards-rail column. The roster column keeps `minmax(0,1fr)`, and a dedicated
test asserts the grid `className` contains `minmax(0,1fr)_260px` literally.

The two visual-only checklist items ("no horizontal overflow at 1280/1440/390", "the roster's first
row is still above the fold at 1440×900") are correctly left to the Wave 3 integration lane's
Playwright renders per the plan's own "Renders" section — not unit-testable in jsdom, and the impl
report says so plainly rather than claiming false coverage.

## Accessibility

- Compact board links: 92px cover + name + time inside one `<Link>` — well over the 44px target floor in both dimensions.
- `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]` — same token and pattern as the pre-existing full-strip link; not a new/inconsistent focus treatment. (The house sheet's `.act:focus-visible { outline: 2px solid var(--clay-ink) }` rule targets the `.act--*` tier classes owned by D4, not a plain navigational `<Link>`, so reusing the file's existing `--color-clay` outline convention here is consistent, not a violation.)
- `aria-label="Open mood board {name}"` — stable, unconditional, matches the full strip's existing pattern.
- No `aria-pressed`/toggle exists in this lane's scope (facets are D2's), so N/A here.
- The compact rail is a plain `<div>`, not a nested `<aside>`, specifically to avoid doubling up `RecentBoardsStrip`'s own `<section aria-labelledby="recent-mood-boards-compact">` as two identically-labelled landmarks — correct call, and it's explained in the impl report and in a code comment.

## Test coverage — behaviour, not markup

`recent-boards-strip.test.tsx`'s 9 tests assert behaviour: empty→null for both variants; the cap at
3 from a 4-board fixture with the excluded board's name asserted absent; no room/owner line and no
verdict summary leaking into compact; the heading text distinguishing "Boards" from "Recent boards";
the hook always being called with `8` regardless of variant; the breakpoint switch actually swapping
which strip is mounted (not just which CSS class is present); and the grid column template literal.
This is behaviour, not selector/markup coverage.

## Findings (severity P1–P3, confidence noted, none filtered)

**F1 — P3, confidence high (informational, no fix needed).** The visual-truth specimen
`artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html` is stale relative to this
lane's actual mandate on two points: it uses a **1200px** breakpoint (`@media (min-width: 1200px)`,
`.desk-grid`) where the plan's D3 section and the design-spec-of-record both say **≥1280px**
(repeated twice in the plan; confirmed independently at
`docs/superpowers/specs/2026-09-08-portal-polish-build-design.md:231`: "At ≥1280px the 1120px
container becomes a two-column grid"); and it draws bespoke inline-SVG board compositions captioned
with house name + date, where the plan and spec-of-record both say "`RecentBoardsStrip` … three
boards, `BoardCoverArt` at 92px … name plus relative time" (spec-of-record:233, plan's own D3 Steps
2). D3 implemented exactly what the plan and spec-of-record specify, not what the older specimen
shows. This is a documentation-currency issue (the specimen predates or wasn't reconciled with the
later spec-of-record's decision to reuse `BoardCoverArt` and move to 1280), not a lane defect — but
it means a future reader diffing the shipped page against `designer-desk.html` will see two false
mismatches. Recommend the specimen file (or a short note beside it) be reconciled at Wave 3
integration, the same way A1 reconciled other stale references.

**F2 — P3, confidence medium (informational, no fix needed).** `BoardCoverArt` (the component the
plan explicitly names for this lane to reuse) can render a **real photograph** — a single generated
cover image or a mosaic of up to 4 pinned-item photos via `<img>` — not only a monogram-letter
fallback. The house sheet's stricter framing of Desk board thumbnails ("inline SVG compositions …
never photographs", and §F-P: "Desk board thumbnails are richer drawings … not three rectangles")
would read this as disallowed. The plan's own D3 review checklist, however, explicitly loosens this
to "Board thumbnails are drawings or covers, never a hero photograph" — which this satisfies (a
92×92px thumbnail in a 260px rail is not a "hero" photograph). Since the plan text is what dispatched
this lane and it names the real `BoardCoverArt` component by name, this is the plan's own considered
choice, not a lane defect. Flagging only because the abstract house-sheet doctrine and the concrete
plan/checklist genuinely diverge on this one point, and a reviewer working from the sheet alone
(rather than the plan) could reasonably call it a violation.

**F3 — P3, confidence high (process note on the impl report, not a code defect).** The impl report's
pasted "verbatim" output for
`pnpm --filter @patina/designer-portal test -- --ci "src/app/(document)/desk" "src/components/document"`
(claimed: 290 suites / 2958 passed + 1 todo = 2959) does not actually include the two desk-page-level
test files (`desk-hire-handoff.test.tsx`, `page.test.tsx`) in that particular combined invocation. I
reproduced this exactly: unescaped parentheses in a jest test-path pattern combined via `|`
alternation cause the left branch (`src/app/(document)/desk`) to silently match zero files, so the
combined run only ever executes what `src/components/document` alone matches — 290 suites, matching
the report's number byte-for-byte, including one incidental flaky failure I got on a re-run
(`log-strip.test.tsx`, unrelated to this diff) that the report didn't hit. This does **not** mean the
desk-page tests weren't actually verified: the impl separately ran `"src/app/(document)/desk"` alone
just above it and got a real, correctly-escaped `PASS` on both files (15/15), and the full `--ci` run
(545 suites / 6700 + 1 todo = 6701) — which I also reproduced exactly — is a superset that includes
everything. So the underlying claim ("all these tests pass") is true and independently confirmed; only
this one intermediate line's stated scope is narrower than its number implies. Non-blocking.

**F4 — P3, confidence low (minor, self-disclosed by the lane).**
`recent-boards-strip.test.tsx`'s second `describe` block (`desk/page.tsx — the boards rail beside the
roster head`) duplicates roughly a dozen `jest.mock()` calls that already exist in
`desk/page.test.tsx`'s own scaffolding, rather than extending that file — because `desk/page.test.tsx`
is not in D3's file list and touching it would have been a pathspec violation. This is a reasonable
call given the constraint (correctly prioritizing pathspec discipline over avoiding duplication), and
the impl report flags it plainly as a tradeoff rather than hiding it. It is a real, if small,
maintenance-drift risk: the two mock sets for the same page can now diverge silently. Recommend the
integration lane fold these two page-level assertions into `desk/page.test.tsx` directly, as the impl
itself suggests.

No P1 or P2 findings.

## Verdict

**Approve.** Pathspec discipline is exact and independently confirmed. Every gate number in the impl
report reproduces from a clean re-run in the worktree (type-check clean; lane-scoped jest 9/9 and the
wider `desk` + `document` scopes correct once escaped properly; full suite 545/6700+1=6701 matching
baseline+1 exactly; lane-scoped eslint clean, wider-scope eslint and full lint at the documented,
un-grown baseline counts; `shadow-gate.test.ts` green and byte-untouched). No shadow, new hex,
truncation, pill/badge/dot/✓/spinner, or `opacity-50` in the diff. The grid never places the boards
rail above the roster, the roster column keeps `minmax(0,1fr)`, and the Studio index sits outside the
grid at full width in both branches. Tests assert behaviour (the 3-cap, the slice-not-refetch, the
absent room/owner/verdict fields, the breakpoint switch, the grid literal), not just markup. All four
findings above are informational/process notes with no surviving P1/P2 — F1 and F2 are documentation
staleness and a plan-vs-sheet framing gap that predate and are outside this lane's control, F3 is a
report-fidelity note about one pasted command whose true result was independently confirmed passing
elsewhere in the same report and by me, and F4 is a self-disclosed, low-risk test-duplication
tradeoff.
