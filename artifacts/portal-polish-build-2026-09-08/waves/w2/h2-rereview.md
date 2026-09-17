# Lane H2 re-review — House-sheet tokens and the seven type steps (client)

**Re-reviewer:** separate context; did not implement H2 and did not write the original review. Verified
the branch and the fix independently — did not trust `h2-impl.md`, `h2-review.md`, or `h2-fix.md`
narratives; every claim below was reproduced from the real diff/commands.

**Branch inspected:** `origin/portal-polish/h2` @ `8424ef70df48f8bb593905ea8842fcba0020a2b4` (the fix
commit, on top of `dddd1c18f0246c6b3c6774350a0d0400edfc4657`, the original impl commit).
**Base:** `origin/main` (fetched fresh; `git -C /Users/kody/Code/patina-merged fetch origin` — network
call needed the sandbox disabled, then succeeded).
**Worktree used for gates:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h2`, confirmed
`git rev-parse --show-toplevel` returns that path and `git log --oneline -3` shows the worktree already
sitting at `8424ef70d`.

## Evidence — commands run, real output

**Diff stat, full lane** (`git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h2 --stat`):
```
 .../src/app/__tests__/house-sheet-tokens.test.ts   | 222 +++++++++++++++++++++
 apps/client-portal/src/app/globals.css             | 122 +++++++++++
 2 files changed, 344 insertions(+)
```
Exactly the two files the lane's file list names, in both commits combined. Zero deletions across the
whole lane — nothing existing moved, renamed, or reflowed.

**Diff stat, fix round only** (`git diff dddd1c18f..8424ef70d --stat`):
```
 .../src/app/__tests__/house-sheet-tokens.test.ts   | 27 ++++++++++++++++++----
 apps/client-portal/src/app/globals.css             |  6 ++++-
 2 files changed, 28 insertions(+), 5 deletions(-)
```
Matches `h2-fix.md`'s claimed stat exactly. Both commits are Conventional Commits
(`feat(client): …`, `fix(client): …`), each touching only the two owned files
(`git show --stat` on both confirmed).

**Full `globals.css` diff read** (`git diff origin/main...origin/portal-polish/h2 -- apps/client-portal/src/app/globals.css`):
two hunks only — one inside the existing `:root` block (the 4 new tokens, `--hairline-strong`, and 8
aliases), one after `a:hover` and before the `/* The Scored Ink (I107) … */` banner comment (the nine
type-step classes + `.consequence`). The Scored Ink block itself is untouched byte-for-byte in this
diff — confirmed no hunk touches anything from that banner onward.

**Type-check** (reproduced fresh, not copy-pasted from any report):
```
$ pnpm --dir .codex/worktrees/agent-pp-h2 --filter @patina/client-portal type-check
> tsc --noEmit
(clean exit, no output)
```

**Lane's own test file, current head** (reproduced fresh):
```
$ pnpm --dir .codex/worktrees/agent-pp-h2 --filter @patina/client-portal test -- src/app/__tests__/house-sheet-tokens.test.ts
PASS @patina/client-portal src/app/__tests__/house-sheet-tokens.test.ts
Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```
All 19 assertions listed by name match `h2-fix.md`'s claimed output exactly, including the new
`declares the new rgba literal token at the sheet value` test.

**Broader regression** (`src/app/__tests__`, reproduced fresh):
```
Test Suites: 4 passed, 4 total
Tests:       42 passed, 42 total
```
Matches the fix report's claimed 41→42 growth. The one `console.error` line in the run's output is
`error.test.tsx`'s own intentional error-boundary fixture (`src/app/error.tsx` rendering a caught
error) — confirmed by tracing the stack, unrelated to this lane.

**Lint, scoped to the lane's two files, run from the app directory (the correct invocation)**:
```
$ cd .codex/worktrees/agent-pp-h2/apps/client-portal && npx eslint src/app/globals.css src/app/__tests__/house-sheet-tokens.test.ts
src/app/globals.css
  0:0  warning  File ignored because no matching configuration was supplied
✖ 1 problem (0 errors, 1 warning)
```
Zero errors on the test file, and the `globals.css` line is the expected "no CSS parser configured for
this flat config" warning, not a defect — reproduced identically to the fix report's claim, and
`apps/client-portal/eslint.config.mjs` does in fact exist (confirmed with `ls`), so the fix round's
correction of the original review's Finding 2 is itself accurate.

**H2-1 fix content, checked against the sheet** — `docs/design/house-sheet/SPEC.md §A1` (read from the
worktree's own copy) gives `--ink-paper: #FAF7F2` and `--hairline-strong: rgba(44, 41, 38, .14)`. The
fix adds:
```css
--hairline-strong: rgba(44, 41, 38, .14);   /* literal, in the NEW_TOKENS-adjacent block */
--ink-paper: var(--color-off-white);        /* alias; --color-off-white is #FAF7F2 in this file */
```
Both values match the sheet exactly; `--ink-paper` is correctly an alias (not a hex redefinition) onto
a token this portal already carries under its own name, consistent with the "never a rename, never a
redefined value" rule the rest of the block follows. `--hairline-strong` is correctly treated as a new
literal (not force-fit into the hex-only `NEW_TOKENS` test) since its value is an `rgba(...)` string —
the dedicated `NEW_RGBA_TOKENS` test the fix adds is the right shape for that, not a workaround.

**Font-variable resolution check** (not raised by either prior review, checked here because the
type-step classes are new and depend on it): `--font-display`, `--font-body`, `--font-meta` are not
defined by this lane, but are already defined elsewhere in the same file at a `body { --font-display: …
}` block inside `@layer base` (pre-existing, untouched by this lane). Grepped to confirm no other lane
in this diff needed to define them and none of H2's new rules reference an undefined custom property.

**Specimen cross-check, verified directly against the file (not the impl/review narrative)** —
`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`'s own `:root` block: all sixteen
hex values, `--hairline`/`--hairline-strong`, and the `.t-d1`…`.t-d3` declarations match H2's
implementation exactly on family, size, line-height, weight, and tracking. The specimen also carries a
`:root[data-theme="dark"]` block with dark-mode values for every token including a *different*
`--hairline-strong` alpha (`.22` vs `.14`) — the client portal's `globals.css` has **no** dark-mode
block anywhere (`prefers-color-scheme`/`data-theme` greps return nothing), so this is pre-existing
portal scope, not a gap H2 introduced or was asked to close; the plan's Lane H2 steps make no mention of
a dark variant. Noted as a non-finding, not a defect.

**Pathspec / no-markup check**: `git diff origin/main...origin/portal-polish/h2 | grep -F "id="` returns
nothing — this diff contains zero JSX/HTML, only CSS and a `.test.ts` file, so no anchor id could have
been touched, and the accessibility checklist items (focus ring, roles, `aria-disabled`, 44px targets)
are correctly inapplicable, same conclusion the original review reached.

## Findings

None outstanding. Both findings from `h2-review.md` were addressed correctly:

- **H2-1 (P2)** — **fixed, verified.** `--ink-paper` and `--hairline-strong` are now declared in H2's
  owned `:root` region, at the sheet's exact values, aliased/literaled per the "never a rename, never a
  redefinition" convention the rest of the block follows, and covered by new/extended contract-test
  assertions. Lane H4 (whose plan section references both names in the same file) is now unblocked
  without either lane crossing the ownership line in the shared-file table.
- **H2-2 (P3)** — **correctly declined as a code fix**, and the declining rationale is sound: the defect
  was a sentence in a point-in-time narrative report (`h2-impl.md`), not a code or test defect, and the
  substantive conclusion that report reached (zero new lint errors) was already correct. The fix round's
  own corrected lint invocation reproduces cleanly. Leaving `h2-impl.md` unedited and treating
  `h2-fix.md` as the correction of record is the right call — editing a past report after the fact would
  misrepresent what that pass actually did.

No new issues found in this pass beyond the two already resolved. Specifically checked and clean, on
top of everything the original review covered:

- Fix round touched only the two lane-owned files (verified by diff stat and `git show --stat` on the
  fix commit).
- The new `NEW_RGBA_TOKENS` test doesn't weaken the existing "no hex literal beyond the four new ones"
  test — `region('house-sheet tokens')`'s hex-only regex (`#[0-9a-fA-F]{3,8}`) never matches an
  `rgba(...)` string, so `--hairline-strong` correctly falls outside that assertion's scope rather than
  silently passing it.
- The alias-target-declared check in the extended `'declares every alias pointing at an existing token'`
  test still requires each alias target resolve to a real `#hex` declaration — `--ink-paper`'s target
  (`--color-off-white`) passes this because it's declared as a hex earlier in the file (line 9), not
  because the test was loosened.
- Test suite count and gate output in `h2-fix.md` reproduce byte-for-byte against a fresh run in this
  session — no discrepancy between claimed and actual.

## Verdict

**approve.** Both prior findings are resolved with real, verified fixes; the re-run gates (type-check,
the lane's 19-assertion test file, the 42-test `src/app/__tests__` regression, and scoped lint) all
reproduce green exactly as claimed. No new P1/P2/P3 finding from this independent pass.
