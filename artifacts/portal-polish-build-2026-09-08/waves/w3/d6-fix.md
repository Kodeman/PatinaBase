# Lane D6 — Concept render upload UI (PP-7) — review fixes

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d6`, branch `portal-polish/d6`.
Applied on top of `2cb4c242c`. One file touched: `concept-render-upload.tsx`.

## Findings and disposition

| id | severity | disposition |
|---|---|---|
| d6-1 | P2 | **fixed** — `min-h-11` on both inputs |
| d6-2 | P3 | **fixed** — `font-mono` + `.08em` tracking on both labels |
| d6-3 | P3 | **declined — out of scope** (see below) |
| d6-4 | P3 | **declined — no code change** (see below) |

### d6-1 — 44px touch target (P2, fixed)

Added `min-h-11` to the file input and the caption input, matching
`schedule/add-line-sheet.tsx`'s `FIELD_CLASS` (`'min-h-11 w-full rounded-[3px] …'`, line 9-10),
the established convention for a text field in this directory, and §A5's `min-height: 44px`
control box.

```
-        className="mt-1 block w-full max-w-[360px] py-2 text-[12px] …"
+        className="mt-1 block min-h-11 w-full max-w-[360px] py-2 text-[12px] …"
-        className="mt-1 block w-full max-w-[360px] border-b border-dashed …"
+        className="mt-1 block min-h-11 w-full max-w-[360px] border-b border-dashed …"
```

Nothing else changed on the inputs — the caption field keeps its dashed bottom rule and
`focus:border-[var(--color-clay)]`, so the 44px floor is added height, not a new box.

### d6-2 — label styling vs `.t-head` (P3, fixed)

Both field labels take `font-mono` and `tracking-[0.08em]`, matching the house sheet's `.t-head`
(SPEC.md:136 — meta family, 11px, .08em, UPPER) and `add-line-sheet.tsx`'s `LABEL_CLASS`
(line 12-13). Colour left at `--text-muted` (9.22:1, already contrast-verified by the review)
rather than switched to `--color-aged-oak`: the finding asked for family and tracking, and
changing the pigment is a change nobody asked for.

The lane still does not wire the named `.t-*` classes into `globals.css` — the review names that
as a program-level gap across every Wave-3 lane, not a D6 one, and doing it here would edit a file
outside the lane's three-file pathspec.

### d6-3 — orphaned storage object on Remove (P3, declined: out of scope)

The reviewer's own fix line says "No fix required from D6 itself (out of its pathspec/hook
access)". `clearConceptRender` can only null the four `project_rooms` columns; deleting the object
in the private `room-renders` bucket needs either a hook in `packages/supabase` (Lane A2's file,
which this lane may not edit — plan step 3) or a ruling on whether Remove should destroy the
object at all. Left as it is, flagged forward: **A2's owner or a ruling, not D6.**

### d6-4 — uncontrolled read in `useEffect` during unrelated suites (P3, declined: no code change)

The finding offers two fixes: inject/gate the client, or document the accepted risk. Injecting a
client is an abstraction the lane was not asked for, and the named escalation path does not
actually apply — `createBrowserClient()` is called *inside* `readConceptRender`, an `async`
function awaited in a `try`, so a synchronous throw arrives as a rejected promise and is already
caught by the existing `catch`. The residual risk is a hang, which injection is the only cure for.
Recording the accepted risk here rather than adding a comment: the effect stays as it is, and the
full suite is 545/545 green with no open handles reported.

## Gates — re-run after the fix

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output)

$ pnpm --filter @patina/designer-portal test -- --ci src/components/document/__tests__/concept-render-upload.test.tsx
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total

$ npx eslint src/components/document          # lane-scope gate
✖ 38 problems (1 error, 37 warnings)          # unchanged; the 1 error is the known
                                              # piece-room-save-gate.test.tsx:159 baseline

$ pnpm --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/shadow-gate.test.ts
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total

$ pnpm --filter @patina/designer-portal test -- --ci          # full suite
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6701 passed, 6702 total

$ npx eslint .                                                # whole portal
✖ 205 problems (2 errors, 203 warnings)       # unchanged 2 known errors
```

Every figure matches the review's pre-fix run exactly — no suite, test, warning or error count
moved.

## Diff

```
apps/designer-portal/src/components/document/rooms/concept-render-upload.tsx | 8 ++++----
1 file changed, 4 insertions(+), 4 deletions(-)
```

## What I did not do

- No new test. The four changed strings are class names; the suite is behaviour-focused by
  design (the review recorded that as a non-finding worth keeping) and a class-name assertion
  would be the first markup test in the file.
- No edit to `ffe-section.tsx`, `packages/supabase`, `globals.css`, `shadow-gate.test.ts`, or any
  file outside the lane's pathspec.
- No `box-shadow`, no `--elevation-sheet`, no `desk-settle`, no new hex, no new route, no flag.
- No database reset, no dev server, no deploy.
