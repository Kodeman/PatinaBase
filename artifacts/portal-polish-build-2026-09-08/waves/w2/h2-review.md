# Lane H2 review — House-sheet tokens and the seven type steps (client)

**Reviewer:** separate context, did not implement H2. Reviewed the pushed branch, not the impl
report's narrative (report was read for orientation only, then independently verified).

**Branch inspected:** `origin/portal-polish/h2` @ `dddd1c18f0246c6b3c6774350a0d0400edfc4657`
**Base:** `origin/main` @ `1059f52756f36f971bc4e4f2b185a367109ae5d8`
**Worktree used for gates:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h2` (confirmed
checked out at the same head commit as the branch tip before running anything).

## Evidence — commands run, real output

**Diff stat** (`git diff origin/main...origin/portal-polish/h2 --stat`):
```
 .../src/app/__tests__/house-sheet-tokens.test.ts   | 203 +++++++++++++++++++++
 apps/client-portal/src/app/globals.css             | 118 ++++++++++++
 2 files changed, 321 insertions(+)
```
Exactly the two files the lane's file list names. Zero deletions confirmed — nothing existing was
reflowed, moved, or renamed.

**Single commit, pathspec-scoped** (`git show --stat HEAD`): same two files, one commit,
`feat(client): house-sheet tokens and the seven type steps` — Conventional Commits, no `git add -A`
artifacts, no stray files. `git status --short` in the worktree is clean (only the sandbox's
pre-existing "Operation not permitted" noise on `.env.example` files, unrelated).

**Type-check:**
```
$ pnpm --dir .codex/worktrees/agent-pp-h2 --filter @patina/client-portal type-check
> tsc --noEmit
(clean exit, no output)
```

**Lane's own test file:**
```
$ pnpm --dir .codex/worktrees/agent-pp-h2 --filter @patina/client-portal test -- src/app/__tests__/house-sheet-tokens.test.ts
PASS @patina/client-portal src/app/__tests__/house-sheet-tokens.test.ts
Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
```
All 18 assertions reproduced exactly as claimed in the impl report.

**Broader regression check** (whole `src/app/__tests__` folder, to catch any collision the new
`.t-*` classes or tokens might cause in sibling suites):
```
$ pnpm --dir .codex/worktrees/agent-pp-h2 --filter @patina/client-portal test -- src/app/__tests__
Test Suites: 4 passed, 4 total
Tests:       41 passed, 41 total
```

**Lint** — the impl report claims "the client portal has no eslint.config.js"; this is false (see
Finding 2). Running the app's actual lint correctly:
```
$ cd .codex/worktrees/agent-pp-h2/apps/client-portal && npx eslint src/app/globals.css src/app/__tests__/house-sheet-tokens.test.ts
src/app/globals.css
  0:0  warning  File ignored because no matching configuration was supplied
✖ 1 problem (0 errors, 1 warning)
```
The test file itself: zero output (zero errors). Running the whole-portal `lint` script
(`pnpm --filter @patina/client-portal lint`) surfaces 11 pre-existing errors / 53 warnings, all in
files this lane never touched (`use-feature-flag.ts`, `use-hydrated.ts`, `use-my-designers.ts`,
`PostHogProvider.tsx`, `lib/data/projects.ts`, etc. — pre-existing `react-hooks`/unused-disable
findings). **Zero new errors from this lane's two files**, confirmed both ways.

**Class-name collision check** — grepped for any existing `.tsx`/`.ts` usage of the nine new class
names before this lane's test file existed:
```
$ grep -rn "\.t-d1\|\.t-d2\|\.t-d3\|\.t-body\b\|\.t-body-sm\|\.t-meta\|\.t-head\|\.t-money\|\.t-authorship" apps/client-portal/src --include="*.tsx" --include="*.ts" | grep -v __tests__
(no matches)
```
Purely additive — nothing currently renders these classes, so no visual regression is possible from
this lane alone (as expected; later H-lanes wire them up).

**Token collision / duplicate-declaration check** — grepped the full file for every new/aliased
custom-property name to confirm each is declared exactly once:
```
$ grep -n -- "--paper\b|--ink\b|--oak\b|--rail\b|--ink-subtle\b|--sage-ink\b|--paper-doc\b|--clay-ink\b|--golden-ink\b|--terracotta-ink\b|--ink-faint\b" apps/client-portal/src/app/globals.css
```
→ only the 8 lines this lane added; no pre-existing declaration of `--paper`, `--ink`, `--oak`, etc.
under those exact names anywhere else in the file. No redefinition, no silent override.

**Alias-target verification** — independently confirmed the 7 aliases point at real, single-valued
existing tokens with the sheet's exact hex, not at each other or at anything missing:
`--color-aged-oak:#8B7355`, `--color-quiet-ink:#65594E`, `--color-charcoal:#2C2926`,
`--color-off-white:#FAF7F2`, `--color-clay-ink:#7C5E30`, `--color-golden-hour-ink:#79651E`,
`--color-terracotta-ink:#9C5340` — all match §A1 exactly.

**Specimen cross-check** — diffed the lane's `.t-*` block against
`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`'s own `:root`/`.t-*` block:
family, size, line-height, weight, tracking and case match on all nine steps and `.consequence`.
No divergence found in H2's region.

## Findings

### Finding 1 — P2, confidence high — two tokens Lane H4 needs are not declared anywhere in this file

The plan's Lane H4 section (client portal, same `globals.css`) specifies the terminal-act fill as
"filled `--color-charcoal`, `--ink-paper` text" (plan line 495) and the unavailable terminal state as
"`--rail` ground, `--ink-faint` text, 1px `--hairline-strong` border" (plan line 504). Neither
`--ink-paper` nor `--hairline-strong` is declared anywhere in this branch's `globals.css`:

```
$ grep -n "hairline\|ink-paper" apps/client-portal/src/app/globals.css
19:     hairline and the right glyph. */          [comment prose only]
708/714: [comment prose, "a hairline that draws in..."]
```
— zero actual custom-property declarations for either name. The house-sheet's `:root` token block
(§A1) does define both (`--ink-paper: #FAF7F2` and `--hairline-strong: rgba(44, 41, 38, .14)`), and
the specimen (`client-house.html`) declares both too. `--hairline-strong`'s exact rgba value has no
existing client-portal equivalent under any name (checked: only `rgba(44, 41, 38, 0.28)` exists,
a different alpha, used for an unrelated overlay). `--ink-paper` happens to share its hex with
`--paper` (`#FAF7F2`), so the *string* is present in the file, but the *named custom property*
`--ink-paper` a downstream `var(--ink-paper)` reference needs does not exist — an invalid custom
property reference resolves to nothing, which for a `color` declaration means the property is
dropped and inherits/defaults rather than showing charcoal-appropriate text.

Per the shared-file table, `globals.css`'s `:root` token block is **exclusively H2's region** — H4
"owns the `.da-*` / Scored Ink block **only**" and may not add to `:root`. So if this gap isn't
closed, either H4 is blocked from implementing its own spec'd CSS without violating the ownership
split, or it ships with `var(--ink-paper)`/`var(--hairline-strong)` silently resolving to nothing —
the terminal act (money-moves-or-a-paper-is-signed tier, PP-3) would render with unstyled/inherited
text color instead of the sheet's ink-on-charcoal contrast, and the unavailable-terminal border would
be missing.

**Not a violation of H2's literal brief.** The lane's own steps 1–2 enumerate exactly 4 new tokens
(`--paper-doc`, `--rail`, `--ink-subtle`, `--sage-ink`) and 7 aliases, and H2 delivered precisely
that list — no more, no less, correctly following "deliver exactly what's asked." H2's own report
explicitly flags this exact gap and names both missing tokens, correctly diagnosing that it would be
"trivial, in-scope additions to this same `:root` block if a reviewer decides they belong here." The
plan's enumerated list for H2 is what's incomplete, not H2's execution of it.

**Recommendation for the fix round** (the only lane that can touch this region): add
`--ink-paper: var(--color-off-white);` (alias — same #FAF7F2 the sheet specifies, already carried
under `--color-off-white`) and `--hairline-strong: rgba(44, 41, 38, .14);` (new literal — the sheet's
exact value, genuinely absent under any existing name) to the token block, and extend
`house-sheet-tokens.test.ts`'s `NEW_TOKENS`/`ALIASES` maps to cover them so the contract test keeps
guarding the full set H4 depends on.

### Finding 2 — P3, confidence high — impl report's eslint claim is factually wrong

The report states: "the client portal has no `eslint.config.js` (ESLint v9 flat-config requirement) —
confirmed the same … failure on both the file I changed and an untouched file." This is incorrect:
`apps/client-portal/eslint.config.mjs` exists and is functional —
`pnpm --filter @patina/client-portal lint` runs cleanly against it (surfacing the 11 pre-existing,
unrelated errors noted above). The failure the report saw was from running bare `npx eslint …` from
the **repo root**, where ESLint v9's flat-config resolution looks in `cwd` and does not discover a
nested app's `eslint.config.mjs` unless invoked with a matching cwd or `--config`. Substantively this
changes nothing — I independently confirmed zero new lint errors from this lane's two files either
way — but the report's stated *reason* for skipping the check is wrong, and could mislead a future
reader (e.g. the integration lane) into believing this portal has no working lint config at all,
which is untrue and contradicts nothing else in CLAUDE.md ("only designer-portal has a working
ESLint config" — that line is about a different, older state; this app plainly has one now).

### Non-findings, explicitly checked and clean

- **Pathspec discipline:** exactly the two files the lane owns; no `.da-*` line touched (verified by
  diff and by the report's own regression test, both passing).
- **House sheet compliance:** no hex literal outside the sheet's list (test + manual grep); the seven
  named steps plus `.t-money`/`.t-authorship`/`.consequence` match §A3/§A6 exactly, including the
  `.t-head`-is-UPPER / `.t-meta`-is-sentence-case distinction the checklist calls out by name; no
  shadow, pill, badge, dot, ✓, spinner, or truncation (this diff contains no markup at all, only
  token/typography CSS — none of those concerns apply to it).
- **No token renamed, no existing value redefined** — verified by grep for duplicate declarations.
- **Accessibility items** (focus ring, roles, `aria-disabled`, 44px targets, contrast) are not
  applicable to this lane — it ships no interactive markup, only CSS custom properties and type-step
  classes not yet wired to any component.
- **Copy strings:** none changed by this lane.
- **New file has a test:** the one new file (`house-sheet-tokens.test.ts`) *is* the test; no new
  component file was added that would need one.
- **No anchor id touched or renamed** — this diff contains no HTML/JSX, only CSS.
- **No collision with pre-existing usage** — grepped for prior references to `var(--paper)`,
  `var(--ink)`, `var(--oak)`, etc. anywhere in the file or in any `.tsx`/`.ts` before this lane; none
  existed, so the new aliases can't have silently changed any existing rule's rendered color.
- Gate commands (type-check, the named test file) reproduce exactly as the impl report states.

## Verdict

**needs-fix** — Finding 1 (P2) is a real, unaddressed defect-in-waiting for Lane H4's region of the
same file, and only Lane H2's owned region can supply the fix. Finding 2 (P3) is a report-accuracy
issue only, not a code defect, and would not by itself block approval.
