# Lane H2 fix round — review response

**Branch:** `portal-polish/h2` (pushed to `origin/portal-polish/h2`)
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h2`
**Fix commit:** `8424ef70df48f8bb593905ea8842fcba0020a2b4` — `fix(client): address W2 review — h2`
**Base (review's head):** `dddd1c18f0246c6b3c6774350a0d0400edfc4657`

## Findings

### H2-1 (P2, high confidence) — FIXED

Claim: `globals.css` declares neither `--ink-paper` nor `--hairline-strong`, both of which Lane
H4's plan section (same file) needs for the terminal-act text color and the unavailable-terminal
border. Only H2's owned `:root` region can add them.

Fix: added both to the `:root` house-sheet token block, exactly as the review's own recommendation
specified — verified against `docs/design/house-sheet/SPEC.md` §A1 (light-mode values, lines
44/48) before writing either line:

```css
--hairline-strong: rgba(44, 41, 38, .14);   /* new literal — sheet-exact, no existing equivalent */
...
--ink-paper: var(--color-off-white);        /* alias — same #FAF7F2 already carried under --color-off-white */
```

`--hairline-strong` sits with the other four net-new tokens (still a literal, not an alias — the
review confirmed no existing rgba under any name matches this alpha). `--ink-paper` sits with the
other seven aliases (pointing at the same existing `--color-off-white` the sheet's hex resolves
to), keeping the "never a hex, never a redefined value" rule the rest of the block already follows.

Extended `house-sheet-tokens.test.ts`:
- Added `--ink-paper` to the `ALIASES` map (so it's covered by the existing "alias resolves via
  `var()` and the target is actually declared" assertion).
- Added a new `NEW_RGBA_TOKENS` map + a dedicated `it('declares the new rgba literal token at the
  sheet value')` test for `--hairline-strong` (the existing `NEW_TOKENS` map/test is hex-shaped
  only, so a non-hex literal needed its own assertion rather than being force-fit into it).
- Updated the file's header comment to document why these two names appear.

The existing "adds no hex literal in its own token block beyond the four new ones" test is
unaffected: `--hairline-strong`'s value is an `rgba(...)` string, not a `#`-hex, so it never enters
that test's hex-literal scan, and `--ink-paper` is an alias (`var(...)`), not a literal.

Test suite grew from 18 to 19 assertions, all green (see Gate output below).

### H2-2 (P3, high confidence) — declined, informational only

Claim: the impl report's stated reason for skipping `npx eslint` ("the client portal has no
`eslint.config.js`") is factually wrong — `apps/client-portal/eslint.config.mjs` exists and works;
the failure was from running eslint at the repo root, not the app.

Declined as a code change: there is no code to fix here — the finding is about a sentence in the
now-superseded `h2-impl.md` narrative, not about `globals.css` or the test file. The substantive
conclusion the report reached (zero new lint errors from this lane's two files) was correct and is
independently reverified below with the corrected invocation. Per the review's own verdict, this
finding "would not by itself block approval." I'm not editing `h2-impl.md` after the fact since it
is a point-in-time report of what that implementation pass did; this fix report is the correction
of record.

## Gate output (re-run after the fix)

**Lane's own test file** (grew from 18 → 19 assertions):
```
$ pnpm --filter @patina/client-portal test -- src/app/__tests__/house-sheet-tokens.test.ts
PASS @patina/client-portal src/app/__tests__/house-sheet-tokens.test.ts
  house-sheet tokens (§A1)
    ✓ carries all sixteen of the sheet hexes somewhere in the file (115 ms)
    ✓ declares the four tokens this portal lacked, at the sheet value (1 ms)
    ✓ declares every alias pointing at an existing token, never a hex (2 ms)
    ✓ declares the new rgba literal token at the sheet value
    ✓ adds no hex literal in its own token block beyond the four new ones
  house-sheet type steps (§A3) and the consequence sentence (§A6)
    ✓ .t-d1 matches the sheet exactly (1 ms)
    ✓ .t-d2 matches the sheet exactly (1 ms)
    ✓ .t-d3 matches the sheet exactly
    ✓ .t-body matches the sheet exactly (1 ms)
    ✓ .t-body-sm matches the sheet exactly (1 ms)
    ✓ .t-meta matches the sheet exactly
    ✓ .t-head matches the sheet exactly (1 ms)
    ✓ .t-money matches the sheet exactly (1 ms)
    ✓ .t-authorship matches the sheet exactly (4 ms)
    ✓ .t-authorship is Playfair italic — never a heading, never a control (5 ms)
    ✓ .t-head is the only uppercase step; .t-meta stays sentence case
    ✓ .consequence is the 15px floor, --ink, capped at 56ch
    ✓ adds no hex literal in the type-step block — typography only, no color
  the Scored Ink block stays Lane H4's
    ✓ is untouched — its banner comment and .da-tertiary rest rule still stand
Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```

**Type-check:**
```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(clean exit, no output)
```

**Full `src/app/__tests__` regression** (confirms no collision from the new declarations):
```
$ pnpm --filter @patina/client-portal test -- src/app/__tests__
Test Suites: 4 passed, 4 total
Tests:       42 passed, 42 total
```
(41 → 42: the one new assertion. The `console.error` output during the run is `error.test.tsx`'s
own intentional error-boundary fixture, unrelated to this change — same as the original impl
report noted.)

**Lint, run correctly (H2-2's own correction applied)** — from inside the app, not the repo root:
```
$ cd apps/client-portal && npx eslint src/app/globals.css src/app/__tests__/house-sheet-tokens.test.ts
src/app/globals.css
  0:0  warning  File ignored because no matching configuration was supplied
✖ 1 problem (0 errors, 1 warning)
```
The test file itself: zero output (zero errors, zero warnings). `globals.css` is warned as
"ignored" only because ESLint's flat config has no CSS parser configured for it in this app
(expected — CSS isn't linted by this config at all, hex/token content isn't JS/TS); this is not a
new problem this lane's fix introduced.

**Diff stat** (`git diff --stat dddd1c18f..8424ef70d`):
```
 .../src/app/__tests__/house-sheet-tokens.test.ts   | 27 ++++++++++++++++++----
 apps/client-portal/src/app/globals.css             |  6 ++++-
 2 files changed, 28 insertions(+), 5 deletions(-)
```
Exactly the two files this lane owns — no other file touched.

**Pre-push hook** (full affected verification, same as the original impl pass): type-check and the
full client-portal test suite (all suites) passed; `eslint .` across the whole app reported the
same 11 pre-existing errors / 52 warnings in files this lane never touched
(`use-hydrated.ts`, `use-feature-flag.ts`, `use-my-designers.ts`, `PostHogProvider.tsx`,
`lib/data/projects.ts`, etc. — pre-existing `react-hooks`/unused-disable findings, unrelated to
this lane's two files). Logged as an advisory failure, non-blocking — `git push` completed and
`origin/portal-polish/h2` is now at `8424ef70df48f8bb593905ea8842fcba0020a2b4`.

## What I did not do

- Did not touch any file outside `apps/client-portal/src/app/globals.css` and
  `apps/client-portal/src/app/__tests__/house-sheet-tokens.test.ts` — the same two files as the
  original pass.
- Did not touch H4's `.da-*` / Scored Ink region — the regression test asserting it's untouched
  still passes.
- Did not edit `h2-impl.md` after the fact (see H2-2 rationale above) — this fix report is the
  correction of record for that finding.
- Did not add any token beyond the two the review named — no other Wave-2 token references were
  cross-checked again since the original report's own cross-check (`--clay-ink, --hairline-strong,
  --ink, --ink-faint, --ink-paper, --ink-subtle, --oak, --paper, --paper-doc, --rail, --sage-ink,
  --terracotta-ink, --golden-ink`) already covered the full Wave 2 reference set and all of it
  besides these two was already declared.
