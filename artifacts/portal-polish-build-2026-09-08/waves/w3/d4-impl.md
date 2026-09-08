# Wave 3 · Lane D4 — Action CSS, row affordance, and the ⌘K palette (PP-3 / B03)

**Branch** `portal-polish/d4` · **Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d4`
**Base** `origin/main` = `1059f5275` (W1 ship report) · **Head** `79980d848`
**Commits** `a88071222` feat · `79980d848` fix

---

## What landed, step by step

### 1 — `terminal` joins `DocumentActionVariant`
`document-action.tsx`: the union gains `'terminal'`; `VARIANT_CLASS` gains
`'da-terminal font-medium tracking-[0]'`. `globals.css` carries the tier per the
house sheet §A5 as amended by §F-C — filled `--color-charcoal`, `--color-off-white`
text, `min-height: 48px`, `padding: 13px 22px`, `border-radius: 3px`, and a
`.da-terminal .da-label` override to Inter (`--font-body`) 500 / 16px / tracking 0 /
sentence case / `tabular-nums`, so the amount can live inside the label. Its scores
take `content: none` (a fill does not also get ruled), its caret inverts to
off-white the way the inked leader's already did, and its hover deepens to the
sheet's `#1f1d1a`.

A1's `test.todo` is folded back: `BuiltVariant` / `BUILT_VARIANTS` deleted, both
`it.each` calls point at `VARIANTS`, the todo removed. The `terminal` row carries
`retiredChrome: null` (the charcoal fill retired for every other tier is this
tier's correct grammar), so the retired-chrome assertion is guarded on it.

### 2 / 3 — the rest rules become unconditional
`.da-tertiary .da-label::before` loses `transform: scaleX(0)` and rests at 1px
`var(--color-aged-oak)`; hover raises to 1.5px `--color-quiet-ink` (the sheet's
`--ink-faint`), press to 1.5px charcoal. `.da-secondary .da-label::before` rest
score `rgba(44,41,38,.28)` → `var(--color-aged-oak)`; its hover, which had been
aged oak and would now have been a no-op, raises to `--color-charcoal`.

The `prefers-reduced-motion` block held a **second** hiding path
(`.da-tertiary .da-label::before { transform: none; opacity: 0 }` with hover/active
restoring it) — deleted, or the rest rule would still have been invisible for
anyone with reduced motion on.

### 4 — `opacity-50` is gone
`BASE_CLASS` drops `disabled:opacity-50` and `aria-disabled:opacity-50` (the
`cursor-not-allowed` pair stays). The replacement lives in CSS: `--text-faint` at
full opacity, scores dropped to `--color-pearl` hairline stock, the pool
neutralised, and a terminal act grounded on `--doc-rail-stock` so it keeps a fill
and therefore its role (faint ink on rail stock ≈ 5.3:1).

### 5 — focus
`.da-act:focus-visible { outline: none }` → `2px solid var(--color-clay-ink)` at
`outline-offset: 2px`. The proofreader's caret (`.da-act::before`, opacity 0 → 1 on
focus) is untouched and still fires; `outline` takes no layout, so a focused act
never resizes its neighbours.

### 6 — the roster's job name
`.row-wash-score::after` rests at 1px `--color-aged-oak` (was `--color-pearl` at
`scaleX(0)`); the wash's hover/focus-within still raises it to `--color-clay`, now
by colour alone. `desk-roster.tsx:110` (className only): the dead
`underline decoration-transparent decoration-1 underline-offset-4` — an underline
painted transparent with no hover path to reveal it — is replaced by `no-underline`,
so the `::after` is the row's single rule (§F-O, and the existing
"exactly one clay line" assertion at `desk-roster.test.tsx:279` still holds).

### 7 — B03, `command-bar.tsx`
`aria-modal="true"` on the dialog; `role="listbox"` + `aria-label` (the section
eyebrow) on each results `<ul>`; `role="option"` + `aria-selected` on every row
with `role="presentation"` on its `<li>` so the listbox owns its options directly;
`aria-activedescendant` on the input pointing at `command-bar-option-{index}`; an
`sr-only` `role="status"` count.

The count reports `matchCount` when a query is typed and `flatRows.length`
otherwise. This matters: on a zero-match query the palette still renders the
"No match / Try the Help Center" recovery row **and** the Engine's "Ask about …"
row, so counting rendered rows would have announced "2 results" over the word
"No match". It now says "Nothing matches."

The keyboard handler (`ArrowDown`/`ArrowUp`/`Enter`, the clamp at both ends, the
focus restore on close) is byte-for-byte unchanged, and the suite asserts it.

---

## Tests

- **New:** `apps/designer-portal/src/lib/document/__tests__/action-rest-rules.test.ts`
  — a CSS contract suite in the `shadow-gate.test.ts` idiom (eslint reads `.ts`/`.tsx`
  only and this repo has no stylelint, so nothing else can see a stylesheet rule that
  hides itself). 8 tests: no `.da-*` action-tier rest rule uses `scaleX(0)`; the tertiary
  and secondary rests are aged oak; the roster row rule rests in aged oak with no
  `scaleX`; the focus outline exists **and** the caret survives; no disabled `.da-*` rule
  spends fractional opacity; the terminal box and label are as §A5/§F-C specify.
- **`document-action.test.tsx`:** the `terminal` row runs in both `it.each` tables
  (variant grammar + anatomy); a new test pins that no `opacity-50` survives on either
  the button or the link render.
- **`command-bar.test.tsx`:** a `B03` describe with 8 tests — aria-modal; listboxes each
  holding options; exactly one `aria-selected` matching the input's
  `aria-activedescendant`; arrow keys move both; the active row never runs past the end;
  the status count; "Nothing matches." over the recovery rows; Enter still chooses.

**The plan named `components/document/__tests__/command-bar.test.tsx`. That path is
wrong** — the real suite is `components/document/command-bar.test.tsx` (842 lines, 38
tests). I wrote the new file at the planned path first, which broke 21 of those tests
(they query `getByRole('textbox', …)`), deleted it, and folded the B03 describe into the
existing suite instead. Reviewers looking for a new file will not find one.

---

## Evidence

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(clean)

$ npx jest --ci src/components/document src/lib/document
Test Suites: 1 failed, 392 passed, 393 total
Tests:       1 failed, 5063 passed, 5064 total
```
The single failure was `agreement-composer-library-on.test.tsx:292` "lays a Library
part at the end of the rail" — `Exceeded timeout of 5000 ms`, under contention with a
concurrently running lint. Re-run alone on this branch:
```
$ npx jest --ci src/components/document/rooms/drafting/agreement/__tests__/agreement-composer-library-on.test.tsx
  ✓ lays a Library part at the end of the rail (1496 ms)
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```
It touches no `.da-*` class and no file in this diff; treated as a contention flake.

```
$ npx jest --ci src/lib/document/__tests__/action-rest-rules.test.ts \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts
Test Suites: 3 passed, 3 total
Tests:       67 passed, 67 total
```
(`rail-stock.test.ts` does not exist in this app — the plan's checklist names it, but
no such file is on `origin/main`.)

```
$ npx jest --ci src/components/document/command-bar.test.tsx
Test Suites: 1 passed · Tests: 46 passed (38 pre-existing + 8 new)

$ npx jest --ci src/components/document/__tests__/document-action.test.tsx
Test Suites: 1 passed · Tests: 24 passed
```

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
```
The two errors are the known baseline — `piece-room-save-gate.test.tsx:159`
(`import/first` rule not found) and `use-commercial-documents.test.ts:930`
(`react-hooks/rules-of-hooks`). Count unchanged.

Prettier (advisory pre-commit hook): `globals.css`, `document-action.tsx`,
`desk-roster.tsx`, `document-action.test.tsx`, `command-bar.tsx` and
`command-bar.test.tsx` were **already drifting on `origin/main`** — verified by running
`prettier --check` against the unmodified `origin/main` copies of each. The two files
where I introduced new drift (`document-events.ts`, `action-rest-rules.test.ts`) were
formatted before committing and now pass.

```
$ git diff --stat origin/main HEAD
 apps/designer-portal/src/app/globals.css                            | 124 +++++++++-----
 .../components/document/__tests__/document-action.test.tsx          |  56 ++++---
 .../src/components/document/command-bar.test.tsx                    | 125 +++++++++++++-
 .../src/components/document/command-bar.tsx                         |  29 ++++-
 .../src/components/document/desk-roster.tsx                         |   2 +-
 .../src/components/document/document-action.tsx                     |   6 +-
 .../src/lib/analytics/document-events.ts                            |  16 ++-
 .../src/lib/document/__tests__/action-rest-rules.test.ts            | 139 +++++++++++++++
 8 files changed, 444 insertions(+), 53 deletions(-)
```

---

## Departures from the lane's file list — read these

1. **`src/lib/analytics/document-events.ts` (not in the lane's list).** `actionShown`
   and `actionSelected` each pin the variant as a literal union; without widening them
   by one member, `document-action.tsx` does not type-check (3 TS2322/TS2345). Two
   literals, nothing else.
2. **`components/document/command-bar.test.tsx` instead of `__tests__/command-bar.test.tsx`.**
   See *Tests* above.
3. **No `role="combobox"` on the ⌘K input.** I added it (with `aria-expanded` /
   `aria-controls` / `aria-autocomplete`) on the first pass because it is the correct
   pattern for `aria-activedescendant`; it changed the input's role and broke 21
   existing assertions that query `getByRole('textbox')`. The lane asked for four things
   — modal, listbox/option, `aria-selected`, `aria-activedescendant`, plus the status
   line — and `aria-activedescendant` is valid on a `textbox`. Reverted to exactly what
   was asked. **Worth a ruling:** the full combobox pattern is a small follow-up that
   would need those 21 queries updated.

## Two side effects a reviewer should look at

1. **`.row-wash-score` is shared.** Besides `desk-roster.tsx:110` it is worn by
   `ffe-section.tsx:429` — an FF&E item **name in a `<p>`, not a link**. That name now
   carries a resting aged-oak rule too. §F-O only rules "row/job names on the Desk", and
   the plan's step 6 names `.row-wash-score::after` explicitly, so I made the change as
   written; if a resting rule under non-interactive text is wrong, the fix is a narrower
   class on the roster link, not a re-hidden rule.
2. **`.da-score-hover` still rests at `scaleX(0)`.** It is the ad-hoc score kit worn by
   ~30 non-DocumentAction files (orders-ledger, margin-rail, folio-strip, doc-spine,
   letterhead-vitals, …) and carries exactly the same defect PP-3 fixes. It is not in
   this lane's file list and unhiding it would change ~50 controls across surfaces other
   lanes are editing concurrently, so I left it and **froze it by name** in
   `action-rest-rules.test.ts` ("names the one `.da-*` rest rule still drawn at
   `scaleX(0)`") — a second one cannot appear, and the debt is visible rather than
   filtered away. **Recommend a follow-up lane.**

## What I did not do

- Did not touch `shadow-gate.test.ts`, `contrast.test.ts`, `--elevation-sheet`,
  `desk-settle`, the eslint shadow gate, or `eslint.config.mjs`. No `box-shadow`,
  `drop-shadow` or shadow filter appears anywhere in the diff (shadow-gate is green).
- Did not touch `desk-roster.test.tsx` (D1/D2 own it), `desk-roster-derivation.ts`,
  `desk/page.tsx`, `recent-boards-strip.tsx`, or anything in `apps/client-portal`.
- Did not reset a database, start a dev server, run the Supabase CLI, or deploy.
- Did not add a feature flag, a badge, a spinner, a pill, or a truncation.
- Added no new hex literal except the sheet's own `#1f1d1a` (§A5 terminal hover) —
  charcoal has no deeper token in this portal.
- No terminal act is placed on any Desk surface. The variant exists so the two portals
  share one grammar and the variant table records it once, exactly as the lane says.
