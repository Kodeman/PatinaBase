# Wave 3 · Lane D4 — Review

**Reviewer role.** Separate context; did not implement D4; treated `d4-impl.md` as a claim to verify,
not a source of truth. Verified against: `docs/superpowers/plans/2026-09-08-portal-polish-build.md`
(D4 section + Wave 3 header + Review protocol), `docs/superpowers/specs/2026-09-08-portal-polish-build-design.md`
§2, `docs/design/house-sheet/SPEC.md` §A1/A5/A10 and §D (as read from the D4 worktree, since it isn't on
`main` yet), `apps/designer-portal/CLAUDE.md` (already amended, D1/D4 lines + success criterion),
`artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html`.

**Branch inspected.** `origin/portal-polish/d4` (`654d76807`) vs `origin/main` (`1059f5275`, the W1 ship
commit). Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d4` (read-only; confirmed
`git rev-parse --show-toplevel` and `git log` match the report's claimed base/head).

---

## Gate — re-run myself, from the worktree

```
$ pnpm --filter @patina/designer-portal type-check
tsc --noEmit                                                            → clean

$ npx jest --ci src/components/document src/lib/document
Test Suites: 393 passed, 393 total
Tests:       5064 passed, 5064 total                                    → matches W1 baseline (no suite lost)

$ npx jest --ci src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/lib/document/__tests__/action-rest-rules.test.ts
Test Suites: 3 passed, 3 total
Tests:       67 passed, 67 total

$ npx jest --ci src/components/document/__tests__/rail-stock.test.ts
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total                                          → see Finding 5: this file DOES exist

$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159, use-commercial-documents.test.ts:930  → the known baseline, count unchanged
```

No `Test Suites: 1 failed` flake reproduced on this run (the report's noted contention flake in
`agreement-composer-library-on.test.tsx` did not recur). All gate numbers the lane claims are real.

```
$ grep -n "box-shadow\|drop-shadow" <full diff>          → zero hits outside a test's negative assertion
$ grep -n "elevation-sheet\|desk-settle" <full diff>     → zero hits outside the impl report's own prose
$ diff --git a/... eslint.config.mjs                     → not present in the diff
```
`shadow-gate.test.ts` and `eslint.config.mjs` are byte-unedited and green. Confirmed.

---

## Pathspec discipline

Lane's file list: `app/globals.css`, `document-action.tsx` + its test, `desk-roster.tsx` (:110 only),
`command-bar.tsx` + its test. Actual diff:

| File | On the list? | Note |
|---|---|---|
| `app/globals.css` | yes | |
| `components/document/document-action.tsx` | yes | |
| `components/document/__tests__/document-action.test.tsx` | yes | |
| `components/document/desk-roster.tsx` | yes | exactly line 110's `className`, nothing else — confirmed against `origin/main` |
| `components/document/command-bar.tsx` | yes | |
| `components/document/command-bar.test.tsx` | **path differs** | plan named `__tests__/command-bar.test.tsx`; the real suite lives at `components/document/command-bar.test.tsx` (842 lines, pre-existing). Disclosed in the report with the reason (a new file at the planned path collided with 21 existing `getByRole('textbox')` queries). Correct call — flagging only because pathspec discipline is a named review checklist item. |
| `lib/document/__tests__/action-rest-rules.test.ts` | new, not listed | a CSS-contract test for `globals.css`, which *is* the lane's file — reasonable "tests ship with every new file," not a scope grab. |
| `lib/analytics/document-events.ts` | **not on the list, not in the shared-file table** | see Finding 4. |

## House sheet conformance

- Terminal tier CSS matches §A5/§F-C on the properties it implements: filled `--color-charcoal`
  (=`--ink`), `--color-off-white` text (=`--ink-paper`), `min-height: 48px`, `padding: 13px 22px`,
  `border-radius: 3px`, hover `#1f1d1a` (the sheet's own literal, not a new hex), label overridden to
  Inter 500/16px/tracking 0/sentence case/tabular-nums. Verified byte-for-byte against `designer-desk.html`
  and the sheet — no terminal act is rendered on any Desk surface in this wave (`.act--terminal` does not
  appear in `designer-desk.html` at all), consistent with the report's claim.
- Tertiary/secondary rest-rule fix matches §F-D exactly: `scaleX(0)` removed, rest painted in
  `--color-aged-oak` (`--oak`), unconditional (no `@media (hover:none)`), and the **second** hiding path in
  the `prefers-reduced-motion` block (opacity 0→1 toggle) is also deleted — a real bug the plan's prose
  didn't call out by name but the sheet's "unconditional, no exception" language implies. Good catch.
- Secondary rest changing to `--color-aged-oak` (not the sheet's generic `--ink`) is *correct*, not a
  deviation — the design blueprint §2 and the lane's own step 3 both explicitly override the Desk's
  secondary to aged-oak; the sheet's abstract §A5 secondary example is superseded by the more specific
  instruction for this surface. Not a finding.
- `disabled:opacity-50` / `aria-disabled:opacity-50` removed from `BASE_CLASS`; no `.da-*` rule anywhere in
  the diff carries a fractional opacity on a disabled/unavailable state (confirmed by
  `action-rest-rules.test.ts`'s own assertion and by reading the CSS). Faint ink at full opacity, hairline
  scores. Matches B07.
- Focus: `2px solid var(--color-clay-ink)` outline added via `outline` (not `border`, so no layout shift —
  correctly satisfies VC-22 without needing a reserved-padding hack); the proofreader's caret is untouched
  and still fires on `:focus-visible`; the terminal tier's caret color is separately inverted to off-white
  so it stays legible on the charcoal fill. All matches §A5 Focus.
- Row rule: `.row-wash-score::after` rests at 1px `--color-aged-oak`, raises to `--color-clay` on
  hover/focus-within, no `scaleX`. Matches the visual truth in `designer-desk.html`'s actual CSS
  (`.row-name { border-bottom: 1px solid var(--oak) } :hover,:focus-visible { border-bottom-color: var(--clay) }`)
  — note the SPEC.md §D *prose table* for this row says "a resting 1px `--rail` rule," which is itself
  wrong against both the sheet's own `--rail`-is-fills-only rule (§A10) and the specimen's actual CSS; D4
  correctly followed the specimen/plan (`--oak`), not the inaccurate prose cell. Not a D4 defect.
- No new hex literal outside `#1f1d1a`, which is the sheet's own value. No box-shadow, no pill, no badge,
  no dot, no ✓, no spinner, no truncation introduced.

## Findings

### 1 — P2, medium-high confidence: `aria-activedescendant` does not satisfy ARIA's containment rule
`command-bar.tsx`'s `<input>` carries `aria-activedescendant` pointing at `command-bar-option-{index}`,
but those ids live on `<button role="option">` elements inside `<ul role="listbox">` elements that are
**siblings** of the input (both are children of the same wrapping `<div>`), not DOM descendants of the
input, and there is no `aria-owns` linking them. Per the ARIA spec, `aria-activedescendant`'s target must
be a descendant of the element carrying the attribute, or reachable via `aria-owns` — neither holds here.
Additionally, results render as **multiple independent `<ul role="listbox">` elements** (one per section:
overdue jobs / doorways / recent / help, etc.), rather than one listbox with grouped options — the
standard combobox-with-listbox pattern expects a single listbox (optionally with `role="group"` sections),
not several separately-rooted listboxes sharing one external activedescendant pointer.

**Why it matters:** the jsdom/RTL suite added for B03 only checks that the DOM attributes exist and move
together (`aria-selected`, `aria-activedescendant` values) — it cannot detect that real screen readers
(JAWS/NVDA in particular; both are stricter about DOM containment for activedescendant relationships than
Chrome's accessibility-tree heuristics) may fail to announce the active option, because the structural
relationship the spec requires isn't present. This directly undercuts the lane's own stated goal — "a
command palette a screen reader can drive" — for the one thing (the moving selection) B03 exists to fix.

**Fix:** either (a) add `aria-owns` on the input naming every `<ul>` id present, or (b) restructure so the
results container itself carries the composite role (e.g. wrap all sections in one `<div role="listbox">`
with `<div role="group" aria-labelledby>` per section, options as direct/near-direct children), or (c) move
`aria-activedescendant` management to a `role="combobox"` wrapper that DOM-contains the lists. No real
device/screen-reader verification exists for this claim in this review — it rests on the ARIA spec text,
not a live AT test.

### 2 — P3, high confidence: terminal act's `disabled`/`aria-disabled` state is missing its border
House sheet §A5: `.act--terminal[aria-disabled="true"] { background: var(--rail); color: var(--ink-faint);
border: 1px solid var(--hairline-strong); /* keeps its ROLE while unavailable */ }`. D4's
`.da-terminal:disabled, .da-terminal[aria-disabled='true']` sets only `background-color:
var(--doc-rail-stock)` — no border is added anywhere on `.da-terminal` in any state (verified: `grep
da-terminal globals.css` shows no `border` property at all). Text color/contrast is correct (inherited
`--text-faint` on `--doc-rail-stock` = 5.32:1, matching the sheet's own annotated number exactly), so this
is a shape/silhouette gap, not a legibility one. **Zero live impact today** — no terminal act renders
anywhere on the Desk in this wave — but it's a real fidelity gap in a grammar the report itself says exists
"so the two portals share one grammar," and it will be inherited silently by whichever future lane mounts
the first Desk terminal act.

### 3 — P3, high confidence: terminal act has no `:active` press state
House sheet §A5: `.act--terminal:active { transform: translateY(1px); transition-duration:
var(--press-in); }`. Not present anywhere in the diff — `.da-terminal` gets a hover rule and a disabled
rule but no active/press rule, even though `--press-in` already exists as a token in this file and is
already used by `.da-secondary:active` / `.da-tertiary:active` two rules above it. Same "currently
unreachable" caveat as Finding 2, and the same "silently inherited by the next consumer" risk.

### 4 — P3, high confidence: one file outside the lane's list and the wave's shared-file table
`apps/designer-portal/src/lib/analytics/document-events.ts` is edited (two literal union types widened
by the `'terminal'` member) to keep `document-action.tsx` type-checking. It is not in D4's file list and
not in the Wave 3 shared-file table. The change itself is minimal, mechanically forced, and prominently
disclosed in the impl report's "Departures" section with a clear rationale — this is a low-risk, honestly
reported deviation, not a stealth edit — but it is a literal pathspec violation per the plan's "Touch ONLY
the files your lane lists" rule, and the review protocol asks explicitly whether the lane touched a file
it does not own. Recommend: acceptable to wave-integration as-is (no alternative fix exists without
widening these two literals or reverting the `terminal` variant), but it should be named in the integration
lane's merge notes.

### 5 — P3, medium confidence: the impl report contains a false evidence claim
The report's Evidence section states: *"`rail-stock.test.ts` does not exist in this app — the plan's
checklist names it, but no such file is on `origin/main`."* This is incorrect —
`apps/designer-portal/src/components/document/__tests__/rail-stock.test.ts` exists on `origin/main` (and
on the D4 branch), passes 4/4 standalone, and was in fact silently included and passing inside the
lane's own broader `--ci src/components/document src/lib/document` run reported two paragraphs earlier in
the same document. The gate the checklist asks for is satisfied in substance — the file is green — but the
report's explicit claim about it is false. Noted per this task's own instruction not to trust the report;
worth a correction in the report before it's cited elsewhere.

### 6 — P3, low confidence, disclosed by the implementer: `.row-wash-score`'s rest rule also lands on a
non-interactive FF&E item name. `ffe-section.tsx:429` (not touched by this diff) reuses the same
`.row-wash-score` class on a `<p>`, not a link. Making the rest rule unconditional therefore paints a
"this is clickable" rule under text that isn't clickable. The lane flagged this itself in the report and
made a defensible call (the plan's step 6 names `.row-wash-score::after` without scoping it to interactive
elements, and re-hiding the rule would reintroduce the exact touch-affordance bug PP-3 exists to fix).
Recording it here per "report every finding" — this is Kody/design-judgment territory (should the class be
split into an interactive and a non-interactive variant), not a defect in what D4 was asked to do.

## What the lane did *not* do, verified

- Did not touch `shadow-gate.test.ts`, `contrast.test.ts`, `eslint.config.mjs`, `--elevation-sheet`,
  `desk-settle`, `desk-roster.test.tsx`, `desk-roster-derivation.ts`, `desk/page.tsx`,
  `recent-boards-strip.tsx`, or anything in `apps/client-portal`. Confirmed by diff inspection.
- No `box-shadow`/`drop-shadow` anywhere in the diff outside a test's own negative assertion string.
- No feature flag, badge, pill, spinner, or truncation introduced.
- The keyboard path in `command-bar.tsx` (`ArrowDown`/`ArrowUp`/`Enter`, clamping, focus restore) is
  byte-identical to `origin/main` — confirmed by reading the diff (only additive JSX attributes changed).
- A1's `test.todo` is correctly folded back exactly as instructed: `BuiltVariant`/`BUILT_VARIANTS` deleted,
  both `it.each` calls point at `VARIANTS`, `retiredChrome: null` guarded with `if (retiredChrome)`, the
  `test.todo` removed.

## Verdict

**needs-fix** — Finding 1 is a P2 that plausibly defeats B03's stated purpose for real assistive
technology (not caught by the jsdom test suite, and not verifiable by this review without a live
screen-reader pass). Findings 2–3 are P3 fidelity gaps against the house sheet that carry no live risk
today but should be closed in the same lane rather than left for whoever adds the Desk's first terminal
act. Findings 4–6 are disclosure/process notes, not blockers.
