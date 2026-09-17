# Lane D8 review — Desk residuals

**Reviewer:** independent context, did not implement. **Branch:** `portal-polish/d8` @ head
`23239266f` (code head `9fe8d4d5e` + one docs commit adding this lane's own report).
**Verified from:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d8`
(`git rev-parse --show-toplevel` confirms this worktree; `git ls-remote origin portal-polish/d8`
confirms `23239266f` is pushed).

**Verdict: approve.** Every claim in `d8-impl.md` was independently re-run or re-derived from the
diff and matched. No P1 or P2 found.

---

## What I re-ran (not just re-read)

| Gate | Result | Matches report? |
|---|---|---|
| `pnpm --filter @patina/designer-portal type-check` | exit 0, no output | yes |
| `pnpm --filter @patina/supabase type-check` | exit 0 | yes |
| `pnpm --filter @patina/designer-portal test -- --ci` (full) | **549 suites / 549, 6810 tests / 6810** | yes, exactly |
| `pnpm --filter @patina/designer-portal lint` | **205 problems (2 errors, 203 warnings)**, same two errors, same files/lines (`piece-room-save-gate.test.tsx:159` `import/first`; `use-commercial-documents.test.ts:930` `react-hooks/rules-of-hooks`) | yes, identical to stated baseline |
| Shadow-gate quartet (`shadow-gate`, `contrast`, `rail-stock`, `action-rest-rules`) | 4 suites / 75 tests, all pass | yes |
| `git diff origin/main --stat` on shadow-gate.test.ts / contrast.test.ts / rail-stock.test.ts / `eslint.config.mjs` | empty | confirms byte-unchanged |
| `git diff origin/main...origin/portal-polish/d8 --name-only \| grep -v ^apps/designer-portal/` | only `artifacts/.../d8-impl.md` | confirms nothing outside the app changed |
| `grep -rn "en-US" src/lib/document src/components/document/desk-roster.tsx "src/app/(document)"` | **14 hits, all under `src/lib/document`; zero in `desk-roster.tsx` and `app/(document)`** | yes, exactly the 14 lines the report lists, with the same reasons |

## Removal ordering (object before row) — verified by reading the actual call chain

- `packages/supabase/src/hooks/use-room-concept-render.ts` (A3, **not touched by this diff** — confirmed
  absent from `git diff origin/main...origin/portal-polish/d8 --stat`) — `useRemoveRoomConceptRender`'s
  `mutationFn` calls `supabase.storage.from(...).remove([path])` first, throws on `removeError` before
  touching the row, and only then nulls the four columns. The package's own suite
  (`use-room-concept-render.test.ts`) asserts `remove.mock.invocationCallOrder[0] <
  update.mock.invocationCallOrder[0]` and a separate test proves the row update never fires when the
  delete rejects.
- `concept-render-upload.tsx`'s `StandingConceptRender.remove()` calls
  `removal.mutateAsync({ projectId, roomId, path: standing.path })` — it does not touch the row itself;
  it hands the stored `path` straight to the hook that owns the ordering. Confirmed by reading the
  component (no local delete/null logic remains) and by
  `concept-render-upload.test.tsx`'s `'hands the stored object path to the remove hook and takes the
  render off the room'` test, which asserts the exact `{ projectId, roomId, path }` payload.
- Old `clearConceptRender` / local signer are gone (grepped — not present in the new file).

**Conclusion: the object is deleted before the row is nulled, in both the hook and the component's call
order.** No orphan path found.

## No React Query hook called without a QueryClientProvider

- Read `ffe-section-life.test.tsx`'s `jest.mock('@patina/supabase', …)` factory directly: it defines
  `useProjectFFEItems`, `useProjectFfeReadiness`, `useProjectOwnedBoards`, `useFfeInvoiceCoverage` —
  **no `createBrowserClient`, no concept-render hooks**. `ConceptRenderUpload`'s always-mounted body
  calls `createBrowserClient()` (undefined in that mock) inside a try/catch inside a `useEffect`; the
  throw is swallowed, `standing` stays `null`, and neither `StandingConceptRender` nor
  `ConceptRenderForm` — the two components that call `useRoomConceptRenderRecord` /
  `useRemoveRoomConceptRender` / `useRoomConceptRender` — ever mounts. Traced this by hand rather than
  trusting the report's description.
- Confirmed 15 suites import `ffe-section` (`grep -rl "ffe-section'" --include=*.test.tsx`), matching
  the report's count. Ran the full `--ci` suite (which includes all 15, plus the seven
  `app/(document)/doc/[id]/*` files jest's bracket-glob made awkward to target individually) — all
  green, 549/549. Separately ran the 9 files jest's literal-path matching could resolve directly
  (8 FFESection-adjacent + `concept-render-upload.test.tsx`) — 125/125 tests pass.
- `concept-render-upload.test.tsx` has both of the contract tests named in the report
  (`'asks the room one hook-free question and calls no React Query hook while nothing stands'`,
  `'reads a standing render through the record hook, room by room'`) and 12 tests total (was 11, +1
  net — two contract tests added, the old row-update assertion removed since that ordering now lives
  in the package suite). Confirmed by listing every `it(` in the file.

## Specificity fix — no new hex, real gate

`globals.css` diff adds exactly one rule block:
```css
.da-score-hover.da-score-on::after,
.da-score-hover.da-score-on:hover::after,
.da-score-hover.da-score-on:focus-visible::after {
  background-color: var(--color-charcoal);
}
```
Token only (`--color-charcoal`, already in use two lines above), no hex literal, no `box-shadow`,
`.da-score-on::after`'s own body untouched. `action-rest-rules.test.ts` gained a real test (not a
tautology): it asserts the rule exists, carries the charcoal token, carries no box-shadow, **and** is
declared after the `.da-score-hover:hover::after` rule it must outrank (source-index comparison) — I
re-ran it (passes) and read the assertion logic to confirm it would fail if the CSS block were removed
(the report's own before/after log showing `1 failed, 11 passed` when it deleted the rule is consistent
with the assertion shape).

## Tests updated

68 pinned date-string literals across 26 test files were re-run and pass (part of the full 549/6810
green run). Spot-checked three of the trickiest:
- `format.test.ts`: the "is exactly the day a timezone-aware read loses" test still demonstrates a real
  UTC/local divergence (`en-GB` inline comparator now prints `9 February 2026` vs `formatCalendarDate`'s
  `10 February 2026`) — the DST-crossing property the test exists to prove survived the locale change,
  not just the string.
- `section-derivation.test.ts`: `fmtMonth('2026-09-02')` moved from `'Band · ~Sep'` to
  `'Band · ~September'` — traced to `format.ts`'s `fmtMonth` now routing through `MONTH_NAME_FORMAT`
  (`month: 'long'`), the only caller (`section-derivation.ts:151`), consistent and intentional.
- `desk-derivation.test.ts` / `dates.ts`: confirmed `dayMonth` is imported from `../dates` rather than
  built ad hoc, matching the report's claim about removing a second `Intl.DateTimeFormat('en-US', …)`
  built inline in a test file.

## Scope discipline

`git diff origin/main...origin/portal-polish/d8 --name-only` is 42 files: 41 under
`apps/designer-portal/**` plus the lane's own report at
`artifacts/portal-polish-build-2026-09-08/waves/w3c/d8-impl.md`. Nothing in `packages/`, `supabase/`,
or another portal. `document-action.test.tsx` (A1/D4's file) is untouched, confirmed by an empty
targeted diff.

---

## Findings

None rise to P1/P2. Two P3/observational notes, neither blocking:

1. **[P3, low severity, high confidence]** `fmtMonthYear` and `formatCalendarDate`'s bare-date branch
   now go through a `Date` built at local noon and formatted with the *local* (no `timeZone` override)
   `LEGAL_DATE`/`MONTH_NAME_FORMAT` formatters, replacing formatters that previously passed
   `timeZone: 'UTC'` explicitly for the timestamp branch. The report's reasoning (build a local Date
   from the UTC Y/M/D parts, then format locally) is sound and the test suite's own
   DST/timezone-loss test — which runs in `America/Chicago` — passes, so I judge this correct, not a
   defect. Flagging only because it's the one piece of this lane that rests on "I reasoned through it
   and the test still passes" rather than an explicit before/after string table, in a file 71 other
   files consume.
2. **[P3, informational]** The report is candid about real residuals it did not fix (the lens ladder's
   three fixed-width date registers under `cap(…, 40)`, the `2:00 PM` vs `2:00 pm` clock question, and
   `field-sms.fmtFieldDate` now emitting `en-GB` into an outbound SMS). These are correctly surfaced as
   "owed" rather than silently left or force-fixed against the brief's own truncation rule — exactly the
   judgment call the brief asked for when the goal (grep-zero) and the constraint (no truncation)
   conflicted. Recorded here so the ruling gets asked, not because the lane did anything wrong.

No fix round needed.
