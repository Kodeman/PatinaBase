# Wave 3 · Lane D4 — Fix pass (applying `d4-review.md`)

**Branch** `portal-polish/d4` · **Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d4`
**Before** `654d76807` (impl report) · **After** `6fbe69158` — pushed
(`654d76807..6fbe69158  portal-polish/d4 -> portal-polish/d4`, remote confirmed by `git ls-remote`).
**Commit** `6fbe69158` `fix(designer): address W3 review — d4`

---

## Finding by finding

### d4-1 — P2, `aria-activedescendant` containment · **FIXED**

The palette's results were several `<ul role="listbox">`, DOM siblings of the `<input>` that
carries `aria-activedescendant`, with nothing linking them. Two things changed in
`command-bar.tsx`:

1. **One listbox, grouped.** The sections are now wrapped in a single
   `<div role="listbox" id="command-bar-results" aria-label="Results">`; each section is a
   `<div role="group" aria-label={eyebrow ?? 'Results'}>` holding its eyebrow and its rows, and the
   `<ul>` inside it goes `role="presentation"` (its `<li>`s already were), so the options are the
   group's owned children and the group is the listbox's. A combobox drives one list; several
   separately-rooted listboxes sharing one activedescendant pointer is not a relationship an AT is
   obliged to follow.
2. **The input owns and controls it.** `aria-owns={RESULTS_ID}` and `aria-controls={RESULTS_ID}`
   (both dropped while the Engine's `asking` panel is up, where no options render). ARIA permits
   `aria-activedescendant` to leave the focused element two ways — a logical descendant via
   `aria-owns`, or, *from a textbox*, an element in the subtree of what `aria-controls` names.
   Both now hold, so the fix does not depend on which clause a given AT implements.

The input keeps `role=textbox` (no `role="combobox"`) — the review's option (c) was declined for the
reason the impl report already gave: it breaks 21 existing `getByRole('textbox')` queries and was not
what the lane asked for. Option (a)'s `aria-owns` alone was not taken as the whole fix because
`aria-owns` on a leaf `textbox` is not reliably mapped; the restructure plus `aria-controls` is what
makes it sound. **No live screen-reader pass was run** (no AT in this environment) — the claim here is
spec conformance and DOM structure, same standard the finding was raised on.

`aria-activedescendant`, `role="option"`, `aria-selected`, the `role="status"` count and the keyboard
handler (`ArrowDown`/`ArrowUp`/`Enter`, the clamp, the focus restore) are unchanged.

### d4-2 — P3, terminal disabled border · **FIXED**

`globals.css`:

```css
.da-terminal:disabled,
.da-terminal[aria-disabled='true'] {
  background-color: var(--doc-rail-stock);
  border: 1px solid var(--doc-ink-border);
}
```

Token choice, since the review offered `--color-pearl` "or the correct equivalent": the sheet's
`--hairline-strong` is `rgba(44, 41, 38, .14)`; this portal's `--doc-ink-border` is
`rgba(44, 41, 38, 0.18)` — the same ink hairline in the same family. `--color-pearl` (`#E5E2DD`) is
*lighter* than `--doc-rail-stock` (`#E8E3DB`) and would have drawn nothing at all, which defeats the
sheet's stated purpose ("keeps its ROLE while unavailable"). Tailwind preflight sets
`box-sizing: border-box`, so the border costs no layout — `min-height: 48px` is unchanged.

### d4-3 — P3, terminal `:active` press · **CLOSED, no duplicate rule** (see reasoning)

The press is already there. Every terminal act wears `.da-act` (`document-action.tsx` `BASE_CLASS`
begins `'da-act relative inline-flex …'`; `VARIANT_CLASS.terminal` only adds `da-terminal …`), and:

```css
.da-act:active {
  transform: translateY(1px);
  transition-property: transform, color;
  transition-duration: var(--press-in), 120ms;
  …
}
```

is exactly the sheet's `.act--terminal:active { transform: translateY(1px); transition-duration:
var(--press-in) }`, already applied to the terminal tier. Adding a literal `.da-terminal:active`
after it would be a same-specificity restatement — and a harmful one: a lone
`transition-duration: var(--press-in)` against the two-entry `transition-property` list above would
also retime the tier's `color` transition off the shared 120ms/60ms-delay choreography, so the
"parity" rule would in fact break parity.

Rather than leave that resting on prose, the contract is now pinned in
`action-rest-rules.test.ts` — `.da-act:active` carries `translateY(1px)` and `var(--press-in)`, **and**
no `.da-terminal*` rule sets `transform` (so the tier cannot silently take the press back). If a
future reader still wants the explicit rule, it needs the full `transition-property`/`duration` pair
copied with it; that is a note for whoever mounts the Desk's first terminal act, not a gap today.

### d4-4 — P3, `lib/analytics/document-events.ts` outside the file list · **NO CODE CHANGE**

Confirmed as the review describes: two literal unions widened by `'terminal'`, mechanically required
for `type-check`, disclosed in the impl report. Reverting it reverts step 1 of the lane. **For the
integration lane's merge record: `apps/designer-portal/src/lib/analytics/document-events.ts` is
touched by D4 and appears in no lane file list and no Wave 3 shared-file table row.** No other lane
edits it (checked: it is not named in any Wave 3 lane section).

### d4-5 — P3, false evidence claim in `d4-impl.md` · **FIXED**

The claim that `rail-stock.test.ts` "does not exist in this app" is struck through in `d4-impl.md`
with a correction pointing here. The file exists, is unedited by this lane, and is green:

```
$ npx jest --ci src/components/document/__tests__/rail-stock.test.ts
PASS  Test Suites: 1 passed · Tests: 4 passed
```

### d4-6 — P3, `.row-wash-score` also lands on `ffe-section.tsx:429` · **DECLINED, out of scope**

`ffe-section.tsx` is not in D4's file list, and splitting the class into interactive and
non-interactive variants is the design judgment the review itself hands to Kody. The plan's step 6
names `.row-wash-score::after` without scoping it, and re-hiding the rest rule would reintroduce the
exact touch-affordance defect PP-3 exists to fix. Left as written; flagged again here so it reaches
the ship report rather than dying in a review file.

---

## Gate — re-run after the fix

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output)

$ npx jest --ci src/components/document src/lib/document
Test Suites: 393 passed, 393 total
Tests:       5067 passed, 5067 total
Snapshots:   11 passed, 11 total
Time:        42.45 s
```
(5064 → 5067: +2 in the B03 describe, +2 in `action-rest-rules.test.ts`, −1 where the two
listbox assertions replaced one.)

```
$ npx jest --ci src/components/document/command-bar.test.tsx \
    src/lib/document/__tests__/action-rest-rules.test.ts \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts \
    src/components/document/__tests__/document-action.test.tsx
Test Suites: 6 passed, 6 total
Tests:       144 passed, 144 total
```

`action-rest-rules.test.ts`, in full, after the fix:
```
  ✓ reads globals.css and finds the Scored Ink block
  ✓ hides no DocumentAction rest rule behind scaleX(0)
  ✓ names the one .da-* rest rule still drawn at scaleX(0)
  ✓ rests the tertiary and secondary scores on aged oak
  ✓ draws the roster row score at rest, in aged oak
  ✓ gives every act a focus outline beside the proofreader’s caret
  ✓ dims no act with opacity — faint ink at full opacity instead (B07)
  ✓ fills the terminal tier and prints its label in Inter, not mono caps
  ✓ draws the unavailable terminal act's silhouette back in (§A5)
  ✓ presses the terminal tier on the shared act clock (§A5)
Test Suites: 1 passed, 1 total · Tests: 10 passed, 10 total
```

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159   error  Definition for rule 'import/first' was not found
  use-commercial-documents.test.ts:930  error  react-hooks/rules-of-hooks
```
The known baseline, count unchanged (was 205 / 2 errors before this pass).

Prettier (advisory pre-commit hook): `globals.css`, `command-bar.tsx` and `command-bar.test.tsx` still
warn on the **pre-existing** `origin/main` drift (single→double quotes, hex case) — verified by
`diff -u <file> <(npx prettier <file>)`, whose hunks are in the import blocks and the token table, not
in any line this pass wrote. `action-rest-rules.test.ts` is prettier-clean.

## Diff

```
$ git diff --stat 654d76807 HEAD
 apps/designer-portal/src/app/globals.css                          |  5 ++
 .../src/components/document/command-bar.test.tsx                  | 37 ++++++--
 .../src/components/document/command-bar.tsx                       | 87 +++++++++++--------
 .../src/lib/document/__tests__/action-rest-rules.test.ts          | 31 ++++++++
 artifacts/.../waves/w3/d4-impl.md                                 |  7 +-
 5 files changed, 124 insertions(+), 43 deletions(-)
```
(`command-bar.tsx`'s 87 lines are mostly one level of JSX re-indentation under the new listbox
wrapper; the behavioural change is the wrapper, the group role, the presentational `<ul>`, and the
two input attributes.)

## What I did not do

- Did not touch `shadow-gate.test.ts`, `contrast.test.ts`, `rail-stock.test.ts`, `eslint.config.mjs`,
  `--elevation-sheet` or `desk-settle`. No `box-shadow`/`drop-shadow` in this diff.
- Did not touch `document-action.tsx`, `desk-roster.tsx`, `document-action.test.tsx`,
  `document-events.ts`, `ffe-section.tsx`, `desk-roster.test.tsx`, `desk/page.tsx`, or anything in
  `apps/client-portal`. Nothing outside the four code files above changed.
- Did not add `role="combobox"`, and did not touch the palette's keyboard handler, the status-count
  logic, `matchCount`, or `choose()`.
- Did not reset a database, start a dev server, run the Supabase CLI, deploy, or run a browser.
- No live screen-reader verification of d4-1 (none available here) — the fix is verified against the
  ARIA spec's containment clauses and by the DOM the suite renders.
- Did not reformat the three files carrying pre-existing prettier drift.
