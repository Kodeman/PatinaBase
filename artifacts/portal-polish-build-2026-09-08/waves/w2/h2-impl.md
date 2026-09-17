# Lane H2 — House-sheet tokens and the seven type steps (client)

**Branch:** `portal-polish/h2` (pushed to `origin/portal-polish/h2`)
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h2`
**Head commit:** `dddd1c18f0246c6b3c6774350a0d0400edfc4657` — `feat(client): house-sheet tokens and the seven type steps`

## Files touched (exactly these two)

```
apps/client-portal/src/app/globals.css                          (:root token block + a new .t-* block ONLY)
apps/client-portal/src/app/__tests__/house-sheet-tokens.test.ts  (new)
```

`git diff --stat HEAD~1 HEAD`:

```
 .../src/app/__tests__/house-sheet-tokens.test.ts   | 203 +++++++++++++++++++++
 apps/client-portal/src/app/globals.css             | 118 ++++++++++++
 2 files changed, 321 insertions(+)
```

Zero deletions — nothing existing was moved, renamed, or reflowed. The Scored Ink (`.da-*`)
block (originally starting at `:193`, now pushed down by my insertion — the block's own text is
byte-identical) was **not touched**; my regression test asserts its banner comment and the
`.da-tertiary` `transform: scaleX(0)` rest rule (the exact rule H4 is scheduled to delete) are
still present, so a future edit that strays into H4's territory trips a red test instead of
silently landing.

## What I verified before aliasing (per the lane's explicit instruction)

Grepped the client's existing `globals.css` for the sheet's sixteen hexes before writing anything:

```
$ grep -n "^\s*--" apps/client-portal/src/app/globals.css | head -60
--color-off-white: #FAF7F2       (= sheet --paper / --ink-paper)
--color-clay: #C4A57B            (= sheet --clay)
--color-aged-oak: #8B7355        (= sheet --oak)
--color-oak-ink: #4E4339         (= sheet --ink-muted)
--color-charcoal: #2C2926        (= sheet --ink)
--color-sage: #A8B5A0            (= sheet --sage)
--color-terracotta: #D4A090      (= sheet --terracotta)
--color-clay-ink: #7C5E30        (= sheet --clay-ink)
--color-terracotta-ink: #9C5340  (= sheet --terracotta-ink)
--color-golden-hour-ink: #79651E (= sheet --golden-ink)
--color-quiet-ink: #65594E       (= sheet --ink-faint)
--color-gold: #E8C547            (= sheet --golden)
$ grep -n "FCFAF6\|E8E3DB\|5A4E43\|5F6B57" apps/client-portal/src/app/globals.css
(no matches — confirms these four are genuinely missing)
```

Twelve of the sheet's sixteen distinct hexes were already present under the portal's own names
(confirmed above); the four missing ones (`--paper-doc #FCFAF6`, `--rail #E8E3DB`,
`--ink-subtle #5A4E43`, `--sage-ink #5F6B57`) are net-new tokens. `--color-pearl: #E5E2DD` was
checked and rejected as an alias target for `--rail` — it is a *different* hex from the sheet's
`#E8E3DB`, so `--rail` is a new token, not an alias, exactly as the lane brief specifies.

## What I built

**`:root` additions** (inside the existing block, after the Phase palette, before the HSL design
tokens — nothing reordered around it):

- 4 new tokens at the sheet's exact hex: `--paper-doc`, `--rail`, `--ink-subtle`, `--sage-ink`.
- 7 aliases, each `var(...)` onto an existing token, no value redefined: `--oak`, `--ink-faint`,
  `--ink`, `--paper`, `--clay-ink`, `--golden-ink`, `--terracotta-ink`.

**New `.t-*` block** (after `.timeline-gradient`, immediately before the Scored Ink comment —
H4's region starts exactly where it did before, just further down the file):

- The seven named steps (`.t-d1/.t-d2/.t-d3/.t-body/.t-body-sm/.t-meta/.t-head`) plus
  `.t-money` and `.t-authorship`, each with the sheet's exact family/size/line-height/weight/
  tracking/case. `.t-head` is the only one with `text-transform: uppercase`; every other step
  (including `.t-meta`) is explicitly `text-transform: none` — case is asserted, not assumed.
- `.consequence` (Inter 15px/1.55, `color: var(--ink)`, `max-width: 56ch`,
  `margin: 0 0 12px`).
- No hex literal appears anywhere in this block — verified by a dedicated test (below), since
  every value in it is a font/size/weight/tracking property or a `var()` reference.

## Contract test (`house-sheet-tokens.test.ts`) — 18 assertions, all green

Modeled on the designer portal's `contrast.test.ts` (parses `globals.css` as text rather than
re-asserting hexes by hand):

1. All sixteen of the sheet's distinct hexes appear somewhere in the file (whichever name carries
   them — existing or newly added).
2. Each of the 4 new tokens is declared at its exact sheet hex.
3. Each of the 7 aliases resolves via `var(--existing-token)` (never a hex) **and** the target
   token it points at is itself actually declared somewhere in the file.
4. The token block I added carries no hex literal beyond the 4 new ones (regex-scoped to a
   `/* — house-sheet tokens:start/end — */` comment-marker region, not the whole file — the file
   already carries many pre-existing, unrelated hexes such as `--color-mocha`, `--bg-surface`, the
   phase palette, none of which are this lane's concern or the sheet's).
5. Each of the 9 `.t-*` classes matches the sheet's family/size/line-height/weight/tracking/
   text-transform exactly (`it.each` over all nine).
6. `.t-authorship` carries `font-style: italic`.
7. `.t-head` is uppercase; `.t-meta` is explicitly sentence case (`text-transform: none`) — the
   review checklist's named footgun ("swapping them silently breaks every caption on the page").
8. `.consequence` matches family/size/line-height/color/max-width/margin.
9. The type-step block carries zero hex literals (typography only).
10. The Scored Ink block's banner comment and its `.da-tertiary` `scaleX(0)` rule are still
    present verbatim (regression guard for H4's boundary).

```
$ pnpm --filter @patina/client-portal test -- src/app/__tests__/house-sheet-tokens.test.ts
PASS @patina/client-portal src/app/__tests__/house-sheet-tokens.test.ts
  house-sheet tokens (§A1)
    ✓ carries all sixteen of the sheet hexes somewhere in the file (3 ms)
    ✓ declares the four tokens this portal lacked, at the sheet value
    ✓ declares every alias pointing at an existing token, never a hex (1 ms)
    ✓ adds no hex literal in its own token block beyond the four new ones (1 ms)
  house-sheet type steps (§A3) and the consequence sentence (§A6)
    ✓ .t-d1 matches the sheet exactly
    ✓ .t-d2 matches the sheet exactly (1 ms)
    ✓ .t-d3 matches the sheet exactly
    ✓ .t-body matches the sheet exactly
    ✓ .t-body-sm matches the sheet exactly (1 ms)
    ✓ .t-meta matches the sheet exactly
    ✓ .t-head matches the sheet exactly (1 ms)
    ✓ .t-money matches the sheet exactly
    ✓ .t-authorship matches the sheet exactly
    ✓ .t-authorship is Playfair italic — never a heading, never a control
    ✓ .t-head is the only uppercase step; .t-meta stays sentence case (1 ms)
    ✓ .consequence is the 15px floor, --ink, capped at 56ch
    ✓ adds no hex literal in the type-step block — typography only, no color
  the Scored Ink block stays Lane H4's
    ✓ is untouched — its banner comment and .da-tertiary rest rule still stand
Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
```

Also ran the full `src/app/__tests__` directory (4 suites, 41 tests) to confirm no regression
against the three pre-existing suites in that folder — all green (the `console.error` noise in
`global-error.test.tsx` is that suite's own intentional error-boundary fixture, unrelated to this
change).

## Gate commands run, with real output

```
$ pnpm --dir .codex/worktrees/agent-pp-h2 turbo build --filter=@patina/client-portal^...
 Tasks:    8 successful, 8 total
Cached:    8 cached, 8 total
  Time:    5.297s >>> FULL TURBO

$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(clean exit, no output)

$ pnpm --filter @patina/client-portal test -- src/app/__tests__/house-sheet-tokens.test.ts
Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
```

`npx eslint apps/client-portal/...` was attempted per the general skeleton but the client portal
has no `eslint.config.js` (ESLint v9 flat-config requirement) — confirmed the same
"ESLint couldn't find an eslint.config.(js|mjs|cjs) file" failure on both the file I changed and an
untouched file, so this is the portal-wide gap CLAUDE.md/AGENTS.md already documents ("only
designer-portal has a working ESLint config"), not something this lane introduced. Lane H2's own
Gate section does not list an eslint command, only `type-check` and the one test file — both green
above.

At push time, the repo's pre-push hook additionally ran the *full* `@patina/client-portal` test
suite, full `type-check`, and `eslint .` across the whole app as an "affected verification" —
type-check and the full test run passed; the hook's `eslint .` reported 11 pre-existing errors and
52 warnings, all in files this lane never touched (`proposal-document.tsx`, `approval-ask.tsx`,
`use-aesthete-matches.ts`, `use-feature-flag.ts`, `use-hydrated.ts`, etc. — pre-existing
`react-hooks`/React Compiler findings, not new hex/token/type-step issues). The hook logged this as
an **advisory** failure ("Affected verification has advisory failures") and did not block the
push — `git push` completed and the branch is live on `origin/portal-polish/h2`.

## What I did not do

- Did not touch the Scored Ink / `.da-*` block (H4's region) — verified above by diff and by a
  standing regression test.
- Did not add `--ink-paper` or `--hairline-strong` as new `:root` tokens, even though both names
  are referenced in other Wave-2 lanes' plan prose (H4's terminal-act CSS: `color: var(--ink-paper)`;
  H4's `aria-disabled` terminal state and H3: `1px --hairline-strong border`). The Lane H2 brief
  enumerates exactly 4 new tokens + 7 aliases with the instruction "every alias points at an
  existing token" — I read that list as exhaustive and stuck to it rather than inferring
  additional scope, per "deliver exactly what's asked." **Flagging this for the reviewer /
  integration lane:** if H4 lands code using `var(--ink-paper)` or `var(--hairline-strong)` and
  neither exists, those declarations will silently resolve to nothing (invalid custom property).
  Both would be trivial, in-scope additions to this same `:root` block if a reviewer decides they
  belong here (`--ink-paper: var(--color-off-white);` and
  `--hairline-strong: rgba(44, 41, 38, .14);`, matching the sheet exactly) — I left them out only
  because they were not in my lane's enumerated list, not because I believe they're unneeded.
  Ran `awk '/^# WAVE 2/,/^# WAVE 3/'` over the plan file and grepped every `--[a-z-]+` token
  reference to build this cross-check; full list of tokens referenced anywhere in Wave 2:
  `--clay-ink, --hairline-strong, --ink, --ink-faint, --ink-paper, --ink-subtle, --oak, --paper,
  --paper-doc, --rail, --sage-ink, --terracotta-ink, --golden-ink` (plus client's own
  `--color-*` names, which are unaffected).
- Did not run `npx eslint` as a blocking gate (not in Lane H2's Gate section) and did not run
  Prettier's whole-file `--write` — it tried to reformat the entire pre-existing file (hex case,
  quote style, multi-line `font-family` lists) far beyond my two new blocks; I ran it once, saw
  the blast radius in the diff, and discarded it with `git checkout --` to keep the diff scoped to
  exactly my additions before re-verifying gates and committing.
- Did not modify `packages/supabase/src/database.types.ts`, run `supabase:reset`, or start a dev
  server (not this lane's resource per Shared-state ownership).
