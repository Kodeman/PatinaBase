# Wave 3 · Lane D4 — Re-review (of `d4-fix.md`)

**Role.** Separate context; did not implement or first-review D4; treated `d4-impl.md`, `d4-review.md`
and `d4-fix.md` as claims to verify, not sources of truth. Verified against:
`docs/superpowers/plans/2026-09-08-portal-polish-build.md` (D4 section, Wave 3 header + shared-file
table, Review protocol), `docs/design/house-sheet/SPEC.md` §A5/§F (read from the D4 worktree — the file
isn't on `origin/main` yet), `apps/designer-portal/CLAUDE.md` (D1/D4 lines), and
`artifacts/portal-polish-review-2026-09-08/specimens/designer-desk.html`.

**Branch.** `origin/portal-polish/d4` — fix commit `6fbe69158` (parent `654d76807`, the impl report
commit; base `origin/main` `1059f5275`, the W1 ship commit). Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d4` (read-only; `git rev-parse --show-toplevel`
and `git log` confirmed against the claimed hashes).

---

## Gate — re-run myself, from the worktree, after the fix

```
$ pnpm --dir apps/designer-portal exec tsc --noEmit
(clean, no output)

$ npx jest --ci src/components/document src/lib/document      (run from apps/designer-portal)
Test Suites: 393 passed, 393 total
Tests:       5067 passed, 5067 total
Snapshots:   11 passed, 11 total
Time:        20.6s                                              → matches d4-fix.md's claimed 393/5067

$ npx jest --ci src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 3 passed, 3 total
Tests:       63 passed, 63 total

$ npx jest --ci src/components/document/command-bar.test.tsx \
    src/components/document/__tests__/document-action.test.tsx
Test Suites: 2 passed, 2 total
Tests:       71 passed, 71 total

$ pnpm run lint   (apps/designer-portal)
✖ 205 problems (2 errors, 203 warnings)
  piece-room-save-gate.test.tsx:159   error  import/first rule not found
  use-commercial-documents.test.ts:930  error  react-hooks/rules-of-hooks
```
Both errors match the known W1 baseline verbatim (file, line, rule). Count unchanged at 2. All numbers
`d4-fix.md` claims for the post-fix gate are real; I reproduced every one independently.

`action-rest-rules.test.ts` (new in the impl pass, extended in the fix pass) was included in the
`src/components/document src/lib/document` run above and is part of the 393/5067; I also read its full
source and it does test the behaviour it claims (CSS-source assertions in the same style as
`shadow-gate.test.ts`, not markup snapshots).

---

## Pathspec discipline (fix pass, on top of the already-reviewed impl pass)

```
$ git diff --stat 654d76807..6fbe69158
 apps/designer-portal/src/app/globals.css                          |  5 ++
 .../src/components/document/command-bar.test.tsx                  | 37 ++--
 .../src/components/document/command-bar.tsx                       | 87 +++++++++--------
 .../src/lib/document/__tests__/action-rest-rules.test.ts          | 31 ++++++
 artifacts/.../waves/w3/d4-impl.md                                 |  7 +-
 5 files changed, 124 insertions(+), 43 deletions(-)
```
Every touched file is on D4's list or is D4's own report file. No new file outside the lane's scope.

Full lane diff (`1059f5275..6fbe69158`, i.e. base main → after the fix) is unchanged in shape from what
`d4-review.md` already audited: `globals.css`, `document-action.tsx` (+test), `command-bar.tsx` (+test at
`components/document/command-bar.test.tsx`, not `__tests__/`, disclosed both times), `desk-roster.tsx`
(confirmed by direct diff: only the one `className` line at :110 changed — `underline decoration-transparent`
→ `no-underline`, nothing else), and `lib/analytics/document-events.ts` (Finding 4, still present, still
not on any Wave 3 lane's file list or the shared-file table — see below). `docs/design/house-sheet/SPEC.md`,
`eslint.config.mjs`, `shadow-gate.test.ts`, `contrast.test.ts`, `rail-stock.test.ts`, `desk/page.tsx`,
`desk-roster-derivation.ts`, `desk-roster.test.tsx`, `ffe-section.tsx`, and everything in
`apps/client-portal` remain untouched — confirmed by direct diff inspection, not by trusting the report.

---

## Finding-by-finding verification of the fix

### d4-1 (P2, aria-activedescendant containment) — verified FIXED

Read the actual diff (not just the fix report's prose). The palette now renders one
`<div role="listbox" id="command-bar-results">` containing `<div role="group">` sections, each holding a
`<ul role="presentation"><li role="presentation"><button role="option"></button></li></ul>`; the input
gets `aria-owns={RESULTS_ID}` and `aria-controls={RESULTS_ID}`, both dropped while `asking` (when no
options render) — confirmed against the live source, not the diff hunk alone.

I independently checked the underlying claim against the WAI-ARIA spec text (fetched
`https://www.w3.org/TR/wai-aria-1.2/#aria-activedescendant`): the normative rule is that the referenced
element must be owned by the container carrying `aria-activedescendant`, **or** must belong to a container
that is *controlled by* (`aria-controls`) that element — and the spec explicitly names combobox/textbox/
searchbox as the roles this indirection exists for. That corroborates the fix's stated justification; it
is not resting on an invented reading of the spec. The `role="presentation"` on the intermediate `<ul>`/
`<li>` is the standard "presentational children get reparented to the nearest real ancestor in the
accessibility tree" pattern and does not break the option/group/listbox structure.

The new tests (`renders its results as ONE listbox, grouped by section`, `owns and controls that listbox
from the input the focus sits in`) test the actual relationship (`toContainElement`, `aria-owns`/
`aria-controls` values, group naming) rather than re-asserting markup that already passed. Ran green
above.

**Residual, not a new finding — same caveat both reviews already carried:** no live screen-reader pass
exists (disclosed candidly in `d4-fix.md`); this is spec-and-DOM verification, the same standard the
original finding was raised on. I do not consider "no live AT pass" a fresh P2 here — neither the original
implementation, the first review, nor this environment has an AT available, and the fix closes the actual
structural defect the first review pointed at (an `<input>` cannot literally DOM-contain anything, being a
void element, so `aria-owns`/`aria-controls` was always the only correct fix shape).

### d4-2 (P3, terminal disabled border) — verified FIXED

```css
.da-terminal:disabled,
.da-terminal[aria-disabled='true'] {
  background-color: var(--doc-rail-stock);
  border: 1px solid var(--doc-ink-border);
}
```
present at `globals.css:898-905` in the worktree. Contrast check I ran independently (WCAG formula):
`--text-faint` (#65594E) on `--doc-rail-stock` (#E8E3DB) = **5.32:1**, matching the sheet's own annotated
figure and the fix report's claim exactly. Tailwind's `@tailwind base` (confirmed at the top of
`globals.css`) supplies border-box preflight, so the added 1px border does not grow the 48px control —
verified by reading the file, not assumed.

Token choice: the fix uses `--doc-ink-border` (rgba(44,41,38,.18)), reasoning that it is the portal's
analog of the sheet's `--hairline-strong` (rgba(44,41,38,.14)), and declines `--color-pearl` (#E5E2DD) as
lighter than the rail-stock ground it would sit on (I confirmed #E5E2DD is in fact lighter than
`--doc-rail-stock` #E8E3DB — barely, but the fix's point that pearl-on-rail draws essentially nothing
holds). Reasonable, disclosed, not a defect.

### d4-3 (P3, terminal `:active` press) — verified CLOSED (no code change, sound reasoning)

Confirmed every `.da-terminal` variant wears the shared `.da-act` class (`document-action.tsx`
`BASE_CLASS` + `VARIANT_CLASS.terminal` — read directly), and `.da-act:active { transform: translateY(1px);
transition-property: transform, color; transition-duration: var(--press-in), 120ms; ... }` already exists
and is unconditional. Grepped the whole file for `da-terminal`: no other selector touches `transform`, so
nothing overrides or fights that rule for the terminal tier — the fix's claim that adding a literal
`.da-terminal:active` would in fact break the shared 120ms colour-transition choreography is correct
(same specificity, a second `transition-duration` declaration without the paired `transition-property`
list would retime `color` unintentionally). The new pinning test (`presses the terminal tier on the shared
act clock`) asserts both the shared rule's properties **and** that no `.da-terminal*` rule sets
`transform` — a real regression guard, not a rubber stamp. Sound engineering call, correctly verified.

### d4-4 (P3, `document-events.ts` outside the file list) — unresolved, correctly left unresolved

Confirmed still present: two literal unions widened by `'terminal'`. Still not named in D4's file list nor
in the Wave 3 shared-file table (re-checked the table myself: `desk-roster.tsx`, `desk/page.tsx`,
`globals.css`, `desk-roster-derivation.ts` are the only rows; `document-events.ts` is in none of them, and
no other Wave 3 lane touches it either). This is a real, if minor, pathspec violation — the fix report
does not attempt to justify it further, just re-confirms and recommends the integration lane record it.
I agree with that disposition: reverting it reverts the `terminal` variant itself (which is exactly what
the plan's step 1 asks for), so there is no actual fix available within this lane's scope; it is a note
for the merge record, not a blocker.

### d4-5 (P3, false evidence claim) — verified FIXED

`d4-impl.md:133-135` now strikes through the original claim and points to the correction; I independently
confirmed `rail-stock.test.ts` exists on `origin/main`, is unedited by this lane, and passes 4/4 (see gate
above).

### d4-6 (P3, `.row-wash-score` also lands on a non-interactive FF&E `<p>`) — declined, correctly so

`ffe-section.tsx` is outside D4's file list; this is design judgement (split the class into interactive/
non-interactive variants) that the fix report correctly hands to Kody rather than acting on unilaterally.
Not a defect in D4's own diff.

---

## Independent checks beyond the six findings (fresh audit, not just re-checking old findings)

- **House sheet §A5/§F conformance of the fix's own new lines.** `.da-terminal:disabled` /
  `[aria-disabled='true']` matches §A5's `.act--terminal[aria-disabled="true"]` shape (fill retreats to
  rail stock, hairline border restored, text stays at full opacity) — no new hex, no opacity-based
  dimming, no shadow. `.da-act:active` (unedited, reused) matches §A5's `.act--terminal:active
  { transform: translateY(1px) }` exactly, on the shared clock.
- **Command-bar restructuring didn't regress copy, keyboard path, or the status line.** Diffed
  `command-bar.tsx` line-by-line: `choose()`, the `ArrowDown`/`ArrowUp`/`Enter` handler, `matchCount`,
  `resultCount`, the `role="status"` sr-only count paragraph, and `renderGlyph`/`renderTrailing` are
  byte-identical to `origin/main` — only the wrapper JSX and the two new input attributes changed.
- **Pre-existing `truncate` classes on the result rows** (`block truncate` on `row.label`/`row.sub`) are
  present on `origin/main` already, untouched by this lane's diff — a house-sheet "no truncation" tension,
  but not introduced or touched by D4; out of this lane's scope and not a new finding against this fix.
  Noting only per "report every finding," severity P3, very low confidence this is D4's to fix.
- **No `role="combobox"` was added** (declined again in the fix, consistent with the impl's original
  reasoning about the 21 `getByRole('textbox')` queries) — this is a legitimate, disclosed trade-off, not
  a silent gap.
- Confirmed **no** box-shadow/drop-shadow, no new hex outside `#1f1d1a` (verbatim in the sheet's own
  terminal-hover rule, case-insensitive match), no pill/badge/dot/✓/spinner/counts-as-tiles anywhere in
  the fix diff.
- Confirmed `--elevation-sheet` and `desk-settle` are untouched by the fix pass (grep + diff both empty
  outside the one `row-wash-score` hunk, which is D4's own step 6, already reviewed and approved).

## What I could not verify

- No live screen-reader pass (none available in this environment) for d4-1 — same limitation the original
  review and the fix both already disclosed; not treated as a new blocking gap for the reasons given above.
- No renders/visual walk of the command palette or terminal tier were taken in this environment (no dev
  server; lanes/reviewers don't start one per the plan's shared-state rules) — verification here is
  source-level (diff, CSS grammar, jest) plus the CSS-parsing test suite the lane itself ships.

## Verdict

**approve.** The P2 (d4-1) is fixed with a technically sound, spec-corroborated structural change and
real behavioural tests, not just markup patching. The two P3 fidelity gaps (d4-2 terminal border, d4-3
terminal press) are closed — one by a real CSS addition, one by a correctly-reasoned "already covered,
adding a rule here would break it" with a regression test pinning the reasoning. d4-4 remains an honestly
disclosed, low-risk, unavoidable-within-scope pathspec note for the integration lane's merge record. d4-5
is corrected. d4-6 is properly deferred to Kody. All gate numbers were reproduced independently from the
worktree and match every number both reports claim; lint's 2-error baseline is unchanged.
