# Lane D5 — the mobile bar loses its dwell timer (VISION.md:50)

**Branch:** `portal-polish/d5`, cut from `origin/main` at `1059f5275` (Wave 1 ship report).
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d5`
**Commit:** `944feefce fix(designer): the mobile bar no longer shows a dwell timer (VISION.md:50)`
**Pushed:** `origin/portal-polish/d5` (confirmed via the pre-push hook's own designer-portal
type-check/test/lint run — see below — followed by a successful `git push`, remote reported
`[new branch] portal-polish/d5 -> portal-polish/d5`).

## What changed

`apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:368-381` — deleted the ternary's
else branch (the "Today / In hand + elapsed" centre-slot fallback: `running`/`paused` → "In hand" or
"Today"; `fmtElapsedQuiet(elapsedSeconds)` or `fmtMinutes(inHandToday)` or "Hands free"). Replaced
`) : ( … )}` with `) : null}`. When `primaryAction && primaryShared` is falsy, the centre slot
(`<div className="flex min-w-0 flex-[1.15_1_0] items-center justify-center">`) now renders nothing.

Untouched, exactly as the lane specifies:
- The More row at (now) `:497-514` — "Time in hand … review or adjust" — still reads
  `fmtElapsedQuiet(elapsedSeconds)`. Verified by a new test (below).
- `useDocumentTime` is still imported and destructured exactly as before (`inHandToday`, `running`,
  `paused`, `elapsedSeconds`, `offer`, `offerOwnsEdge`) — the hook itself is not touched, and
  `elapsedSeconds` is still read by the More row. `running`, `paused`, `inHandToday` and the
  `fmtMinutes` import are now unread by this file (their only reader was the deleted block) but are
  left in place — the lane's own scope note is "the diff is the centre slot and its test only," and
  neither TS (`noUnusedLocals` is not set in the designer-portal or root `tsconfig.json`) nor this
  app's eslint config (no `no-unused-vars`/`@typescript-eslint/no-unused-vars` rule is enabled — see
  `apps/designer-portal/eslint.config.mjs`) fails on them; the full-suite type-check and lint runs below
  confirm this produces no new error or warning.
- The left zone (STRATA mark + "In the studio" / household), the More button, the More menu, and the
  bar's colours are byte-identical — `git diff` below is exactly the ternary swap plus tests.

## A cross-file test dependency I had to touch (outside the lane's named two files)

`apps/designer-portal/src/components/document/__tests__/red-letter-zone.test.tsx:207` — the case
`'OD-11 — publishes no primary act on the bar, at any row count'` mounted `<MobileBar>` with no primary
action registered and asserted `bar.getByText('Hands free')).toBeInTheDocument()`. That is the exact
fallback string this lane removes, so the assertion started failing the moment the centre slot went to
`null`. This is not a coincidental breakage — it is the other half of the very behavior D5's own "Tests"
section specifies ("no 'Hands free'"). I flipped the one assertion to
`expect(bar.queryByText('Hands free')).not.toBeInTheDocument()` with a comment citing D5/VISION.md:50,
and touched nothing else in that file (the other 13 cases in the suite are unmodified and still pass).
I am flagging this explicitly since the lane's file list names only `mobile-bar.tsx` and
`mobile-bar.test.tsx` — this is the one line outside that list, and it exists because leaving it broken
would have silently regressed the full-suite pass count this same lane is required to hold at 6691+.

I searched the rest of the designer-portal source tree for other assertions on the removed strings
(`Hands free`, `'Today'`/`"Today"`, `In hand`) — `studio-drawer.test.tsx:244`'s "Hands free" is a
different component (StudioDrawer's own doorway, unrelated to `MobileBar`'s centre slot) and is
untouched; `schedule-thread-panel.test.tsx` and `schedule-thread.test.ts`'s "Today" hits are schedule
anchors, unrelated. Two comments (`desk/page.test.tsx:99`, `document-action-hierarchy-contract.test.ts:136`)
reference the old "In hand / Today" glance in prose only, with no assertion on the string — left as-is.

## Tests added (`mobile-bar.test.tsx`, new `describe` block, 3 cases)

1. `renders nothing — no dwell timer, no "Today", no "Hands free", no elapsed string"` — mounts the bar
   with no primary action and asserts none of "Today", "In hand", "Hands free", an `mm:ss` string, or an
   `N min` string appear inside `[data-testid="mobile-bar"]`.
2. `leaves the rest of the bar unchanged when a primary action IS registered` — mounts with the same
   primary action as the existing "elected act at 390" case and asserts the action renders while none of
   the removed strings appear.
3. `the More row still renders "Time in hand … review or adjust" — that timer stays, she opens it` —
   opens More and asserts the row's text is present.

Plus the one-line fix in `red-letter-zone.test.tsx` described above.

## Gate

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d5 turbo build --filter=@patina/designer-portal^...
 Tasks:    6 successful, 6 total   (FULL TURBO — all cached)

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(clean exit)

$ pnpm --filter @patina/designer-portal test -- --ci src/components/document/mobile
Test Suites: 4 passed, 4 total
Tests:       79 passed, 79 total     (pre-fix baseline for this scope)

$ pnpm --filter @patina/designer-portal test -- --ci src/components/document/mobile src/components/document/__tests__/red-letter-zone.test.tsx
Test Suites: 5 passed, 5 total
Tests:       96 passed, 96 total     (post-fix: mobile suite + red-letter-zone, all green)
```

**Full-suite check (beyond the lane's own scoped gate, run because the lane touched a file outside its
named list and I wanted evidence the baseline didn't shrink):**

```
$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 544 passed, 544 total
Tests:       1 todo, 6694 passed, 6695 total
Snapshots:   12 passed, 12 total
```

Baseline stated in the brief: "544 suites / 6691 passed + 1 todo." Now 544 suites / 6694 passed + 1
todo — exactly +3, matching the 3 new test cases added; 0 suites lost, 0 regressions, the 1 pre-existing
`test.todo` (A1's `terminal` row, owned by D4) is untouched.

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
```
The 2 errors are the two named in the brief — confirmed by grep:
`piece-room-save-gate.test.tsx:159` (`import/first` rule-not-found) and
`use-commercial-documents.test.ts:930` (`react-hooks/rules-of-hooks` on `mutationFnOf`). Neither touched
file (`mobile-bar.tsx`, `mobile-bar.test.tsx`, `red-letter-zone.test.tsx`) appears anywhere in the lint
output — 0 new warnings or errors from this diff. The count matches the stated baseline exactly (did not
grow it).

The repo's pre-push hook independently re-ran designer-portal type-check (clean), the full test suite
(544/6694+1 todo, matching the numbers above), and lint (same 205 problems / 2 errors, "advisory
failures" — did not block the push) before `git push` completed with `[new branch] portal-polish/d5`.

## Diff stat

```
$ git diff --stat origin/main..HEAD
 .../document/__tests__/red-letter-zone.test.tsx    |  4 +-
 .../components/document/mobile/mobile-bar.test.tsx | 50 ++++++++++++++++++++++
 .../src/components/document/mobile/mobile-bar.tsx  | 15 +------
 3 files changed, 54 insertions(+), 15 deletions(-)
```

## What I did not do

- Did not touch the More row (`:497-514` after the deletion, `:498-514` before it) — left byte-identical.
- Did not touch `useDocumentTime` (`@/hooks/document-time-provider`) — no edit to that hook file.
- Did not touch the bar's colour tokens, the STRATA mark, the household/context left zone, or any other
  region of `mobile-bar.tsx`.
- Did not run `pnpm supabase:reset`, did not start a dev server, did not touch port 3000.
- Did not run `git worktree add`/`pnpm install`/`git push` inside the shared sandbox without disabling
  it first — each was retried with `dangerouslyDisableSandbox: true` only after a sandboxed attempt
  failed on network/filesystem restrictions, per the lane's own instructions.
- Did not touch `main` in the primary checkout — all git writes were `-C
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d5`, and the only commands run against
  `/Users/kody/Code/patina-merged` itself were `fetch origin` and `worktree add` (both explicitly
  permitted read/setup operations).
- Left the pre-existing Prettier quote-style drift in `mobile-bar.tsx` alone (the file already used
  single quotes throughout before my change; a stock `npx prettier --check` on this fresh install wants
  double quotes across the *entire* file, not just my lines — this is environmental/pre-existing, not
  something this diff introduced, and the repo's own pre-push hook only warns "advisory" on it rather
  than blocking).

## Open items for the reviewer

- Confirm the `red-letter-zone.test.tsx` deviation (one assertion, one file outside D5's named list) is
  acceptable, or direct that it be handled instead as a note for Wave 3 integration to pick up when it
  merges D5.
