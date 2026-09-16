# Lane D5 review — the mobile bar loses its dwell timer (VISION.md:50)

**Reviewer context:** separate from the implementer. Branch `origin/portal-polish/d5` (commit
`13d0259e9`, on top of `944feefce`, cut from `origin/main` at `1059f5275`). Worktree inspected read-only:
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d5`. Gates re-run independently from that
worktree; nothing in this report is taken from the lane's own report without re-verification.

**Verdict: approve.** No P1/P2 remains. One P3 (disclosed, justified, correctly executed) and one P3
(informational, environment flakiness unrelated to this diff).

---

## 1. Diff inspected

```
$ git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/d5 --stat
 .../document/__tests__/red-letter-zone.test.tsx    |   4 +-
 .../components/document/mobile/mobile-bar.test.tsx |  50 +++++++
 .../src/components/document/mobile/mobile-bar.tsx  |  15 +--
 .../waves/w3/d5-impl.md                            | 149 +++++++++++++++++++++
 4 files changed, 203 insertions(+), 15 deletions(-)
```

`mobile-bar.tsx`: the else-branch of the centre-slot ternary (the "Today"/"In hand" + elapsed / "Hands
free" fallback, lines 368-381 pre-change) is replaced with `null`. Nothing else in the file changed —
confirmed by diff (single hunk, one deletion block, `) : null}` in place of `) : ( … )}`). The left zone
(STRATA mark, "In the studio"/household), the More button, the More menu (including the "Time in hand …
review or adjust" row at what is now `:497-514`), and the bar's colour tokens are byte-identical.

`mobile-bar.test.tsx`: one new `describe` block, three new `it`s — asserts the centre slot renders none
of "Today"/"In hand"/"Hands free"/an elapsed string when no primary action is registered; asserts the
rest of the bar is unaffected when a primary action *is* registered; asserts the More row's elapsed-time
line still renders. All three test behaviour (what's absent/present in the rendered tree via
role/text queries scoped to `data-testid="mobile-bar"`), not markup shape.

`red-letter-zone.test.tsx`: one assertion flipped, `bar.getByText('Hands free')).toBeInTheDocument()` →
`bar.queryByText('Hands free')).not.toBeInTheDocument()`, with a comment citing D5/VISION.md:50. This
file is **not** in D5's named file list (`mobile-bar.tsx` + `mobile-bar.test.tsx` only).

## 2. Pathspec discipline

**Finding P3-1 (disclosed, justified).** The lane touched `red-letter-zone.test.tsx`, a file outside its
two-file allowlist. I traced the necessity: `red-letter-zone.test.tsx:207` ("OD-11 — publishes no
primary act on the bar, at any row count") mounts `<MobileBar>` with no primary action and pre-D5
asserted `getByText('Hands free')` — the exact fallback string this lane deletes. Left unfixed, this
assertion fails the instant the centre slot returns `null`, which would have silently dropped the
designer-portal suite below the plan's stated floor (544/6691+1 todo) the same lane is required to hold.
The lane's own report (`d5-impl.md`) discloses this by name, quotes the line, explains why it is "the
other half of the very behavior D5's own Tests section specifies," touches nothing else in that file,
and explicitly flags it to the reviewer as an open item. I independently confirmed via `git diff` that
exactly one line in that file changed (plus a two-line comment) and that the other 13 cases in the suite
are untouched. **Severity: P3 — a real pathspec deviation by the plan's letter, but correctly scoped,
necessary, fully disclosed, and the only viable alternative (leaving a pre-existing test broken) is
worse than the deviation. Confidence: high.** No fix requested; flagging per the plan's "report every
finding" instruction, not as a blocker.

I grepped the rest of `apps/designer-portal/src` for other assertions on the removed strings
(`Hands free`, `'Today'`, `In hand`) beyond what the lane's own report lists, and found nothing it
missed: `studio-drawer.test.tsx:244`'s "Hands free" is a different component's copy (unrelated);
`schedule-thread-panel.test.tsx` / `schedule-thread.test.ts` "Today" hits are schedule-anchor strings,
unrelated; the two prose-only "In hand / Today" mentions in `desk/page.test.tsx` and
`document-action-hierarchy-contract.test.ts` are comments, not assertions.

No other file outside the lane's allowlist is touched. `app/globals.css` (D4's file) untouched.
`useDocumentTime` (`@/hooks/document-time-provider`) untouched — still imported and still consumed by
the More row.

## 3. House sheet / global constraints

Not applicable in the affirmative sense — this diff is pure removal (a ternary branch → `null`), so
there is no new markup to check against the house sheet. Confirmed: no new hex literal, no shadow (grep
for `box-shadow`/`shadow` in the diff: none), no pill/badge/dot/✓/spinner, no truncation (the removed
`truncate` class goes with the removed markup — no truncation class remains in the diff's added lines),
no `opacity: .5` on a state, no new tiles, no new queue. The specimen `designer-desk.html` does not
model this region at all (mobile bar / <390px chrome is out of scope for the desktop specimen — grepped
for "mobile", "dwell", "in hand", "hands free", "390": zero hits), so there is no visual-target region to
diff against for this lane; that is expected, not a gap.

## 4. Designer CLAUDE.md D1/D4

D4 (zero shadows): no shadow touched, `shadow-gate.test.ts` re-run independently and green (below). D1
(no split view, no persistent nav inside a document, no depth): this lane removes a passive readout, adds
no chrome, no nav, no split. Compliant.

## 5. The ruling implemented

D5 implements the Wave-3 plan's own lane goal, "Remove the timer that watches her; keep the one she
opens" (VISION.md:50), corroborated by ruling PP-9 in `rulings.md:15` ("no dwell timer" is named
explicitly as one of the Desk's adopted, unaffected-by-the-wordmark-carve-out changes). Correctly
implemented: the *passive* glance readout (auto-updating elapsed time nobody asked to see) is gone; the
*opt-in* "Time in hand … review or adjust" row inside More (a control she has to tap open) stays,
matching the plan's own distinction between a timer that watches her and one she opens.

## 6. Accessibility

No new interactive element, no new role, no new focus target — the diff only removes a non-interactive
`<span>` readout (it held no `role`, no `tabindex`, no click handler) and its two child spans. Removing a
non-focusable decorative element cannot regress focus order, `aria-pressed` state, or the 44px target
rule; the button below it (`More studio actions`, `min-h-11 min-w-11`) is unchanged. Contrast is moot —
no text node is added. I confirmed no `aria-hidden`/`role` attribute existed on the removed spans that
would need re-homing (grepped the pre-image at `main-repo` mobile-bar.tsx:368-381 above: plain
`<span>`s, no ARIA).

## 7. Test coverage — behaviour vs markup

The three new tests query by role name and by visible text scoped to the bar's `data-testid`, and assert
absence/presence of user-facing strings and an elapsed-time pattern — not className or DOM shape. The
`red-letter-zone.test.tsx` edit is a single assertion flip using the same `queryByText`/`getByText`
idiom already established in that file. Every new/changed assertion targets behaviour. New file
(`mobile-bar.test.tsx` did already exist; no wholly new file was added by this lane other than the
report), so the "every new file has a test" rule is moot here — no new production file was created.

## 8. Independent gate re-run (from the worktree, not trusting the lane's numbers)

```
$ pnpm --dir .../agent-pp-d5 --filter @patina/designer-portal type-check
> tsc --noEmit
(clean exit, no output)

$ pnpm --dir .../agent-pp-d5 --filter @patina/designer-portal test -- --ci \
    src/components/document/mobile src/components/document/__tests__/red-letter-zone.test.tsx
Test Suites: 5 passed, 5 total
Tests:       96 passed, 96 total
```
Matches the lane's own claimed numbers exactly.

```
$ pnpm --dir .../agent-pp-d5 --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
```
Same two named errors, confirmed by grep on the lint output:
`piece-room-save-gate.test.tsx:159` (`import/first` — rule not found) and
`use-commercial-documents.test.ts:930` (`react-hooks/rules-of-hooks` on `mutationFnOf`). Neither touched
file appears in the lint output. Baseline held exactly (2 known errors, not grown).

```
$ pnpm --dir .../agent-pp-d5 --filter @patina/designer-portal exec eslint \
    src/components/document/mobile/mobile-bar.tsx src/components/document/mobile/mobile-bar.test.tsx \
    src/components/document/__tests__/red-letter-zone.test.tsx
(exit 0, no output — 0 problems on the three touched files)
```

```
$ pnpm --dir .../agent-pp-d5 --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/shadow-gate.test.ts
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```
Shadow gate is untouched and green, as required.

**Finding P3-2 (informational, not caused by this diff).** A full-suite run
(`pnpm --dir .../agent-pp-d5 --filter @patina/designer-portal test -- --ci`, no path filter) reported
`Test Suites: 1 failed, 543 passed, 544 total` / `Tests: 1 failed, 1 todo, 6693 passed, 6695 total` — the
one failure is `src/app/auth/signin/page.test.tsx` timing out on
`await screen.findByLabelText('Six-digit code')`. This file is nowhere in D5's diff and has nothing to do
with the mobile bar. I re-ran it in isolation in the d5 worktree twice: it failed once
(`findByLabelText` timeout, same line) and passed once; on `origin/main` (the primary checkout, dirty but
unmodified for this file) it passed cleanly on the one run I made. This is pre-existing, environment-
/timing-driven flakiness in an unrelated auth suite, not a regression introduced by D5 — nothing in the
touched files imports, mocks, or shares module state with the signin page. **Severity: P3 (does not gate
this lane — D5's own scoped gate passed cleanly on two independent runs; flagging because the lane's own
report claims a clean 544/0-failed full-suite run, which I could not reproduce on the first of two
attempts). Confidence: high that it's unrelated to this diff; medium that it's the same flake the lane
happened not to hit.** Recommend Wave 3 integration re-run the full suite once at merge time and treat a
lone `signin/page.test.tsx` failure as a known flake to retry, not a blocker tied to D5.

## 9. What I did not do

- Did not start a dev server or touch port 3000.
- Did not run `pnpm supabase:reset` or any DB command.
- Did not run `git push`, `git commit`, or any write git command anywhere. All git commands run were
  read-only (`fetch`, `diff`, `status`, `log`, `ls-tree`, `rev-parse`, `branch --show-current`) except
  `git -C /Users/kody/Code/patina-merged fetch origin`, which failed on network access in this sandbox
  (harmless — refs were already present locally from a prior fetch, confirmed by successful `diff`
  against `origin/main`/`origin/portal-polish/d5`).
- Did not edit any file in the worktree — inspected read-only per instructions.
- Did not exhaustively re-run the entire designer-portal suite as the acceptance gate for this lane
  (D5's own gate is scoped to `src/components/document/mobile`); I ran the full suite once, as an
  independent check on the lane's own claim, and report the discrepancy above.

## Summary of findings

| # | Severity | Confidence | Finding |
|---|---|---|---|
| P3-1 | P3 | High | `red-letter-zone.test.tsx` touched outside the lane's named 2-file list — disclosed, necessary (keeps a pre-existing assertion from breaking on this lane's own behavior change), correctly scoped to one line + comment. No fix requested. |
| P3-2 | P3 | High (unrelated) / Medium (reproducibility) | One unrelated flaky failure (`src/app/auth/signin/page.test.tsx`) surfaced in a full, unscoped suite run; not present in D5's own scoped gate (which is clean on two runs) and not connected to any file this lane touches. Informational for Wave-3 integration, not a D5 defect.

No P1 or P2 findings. **Verdict: approve.**
