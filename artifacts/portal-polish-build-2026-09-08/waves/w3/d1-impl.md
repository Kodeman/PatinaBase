# Lane D1 — The day's line (IA-05) · implementation report

**Branch:** `portal-polish/d1` (pushed) · **Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d1`
**Head:** `ac6fadb18 feat(designer): the day's line under the roster head (IA-05)` · cut from `origin/main` `1059f5275`
**Date:** 2026-09-08

---

## What shipped

At most three lines under the roster head, above a hairline rule, 12px apart, each an
inline act into a roster row already on the page — and nothing at all when nothing needs her.

1. **Overdue** — the job as an inline act into its own row, then the clause after the dash in
   `--color-terracotta-ink`: `Vandersteen residence — project, overdue 6 days`.
2. **The earliest lead deadline** — the job as an inline act, then the need's *own* sentence:
   `Wright apartment · New lead — respond by Aug 27`.
3. **The client's answer** — `Nora Ellison replied last night — Cedar Lane Study`, from
   `project_notes.answered_at` inside the last 24h, the job an inline act.
4. **`and N more below`** — an inline act to the first stage plate (`#roster-stage-<key>`),
   counting the marked rows the three lines did not speak for.
5. **Zero lines → the band does not render at all** (no wrapper, no rule, no "nothing needs you").

### Files

| File | Change |
|---|---|
| `apps/designer-portal/src/lib/document/desk-roster-derivation.ts` | +4 optional fields on `RosterLine` (`projectId`, `client`, `dueOn`, `needText`), all populated by `deriveDeskRoster`; new pure `deriveDeskDayLine(roster, answeredNotes, now)` returning `DeskDayLine \| null`, plus `AnsweredClientNote`, `DayLinePart`, `DayLine`, `MAX_DAY_LINES`, `ANSWERED_NOTE_WINDOW_MS`. |
| `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts` | +8 tests for the day's line (`+201` lines). |
| `apps/designer-portal/src/components/document/desk-roster.tsx` | The block between the head and the first plate: `DayLineText`, the band, `rosterLineAnchorId()`, the `INLINE_ACT` class string, `id` on the row `<li>`. |
| `apps/designer-portal/src/components/document/desk-roster.test.tsx` | Hook mock + 6 day's-line tests (`+149`). |
| `apps/designer-portal/src/hooks/use-answered-notes.ts` | **new** — the `project_notes` read. |
| `apps/designer-portal/src/hooks/__tests__/use-answered-notes.test.tsx` | **new** — 4 tests. |
| `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx` | **+1 jest.mock (6 lines)** — see *Out-of-list edits*. |
| `apps/designer-portal/src/app/(document)/desk/page.test.tsx` | **+1 jest.mock (6 lines)** — same reason. |
| `apps/designer-portal/src/app/(document)/desk/desk-hire-handoff.test.tsx` | **+1 jest.mock (6 lines)** — same reason. |

### The new read (no RPC, no migration)

`use-answered-notes.ts`:
`from('project_notes').select('project_id, answered_at').gte('answered_at', <now − 24h>).order('answered_at', desc).limit(50)`.
RLS (`project_notes_studio_select`, 00565:271) already scopes the table to
`app_private.is_project_studio_member(project_id)`. `gte` on a nullable column excludes NULLs,
so the window filter is also the "was it answered" filter. Query key
`['project-notes','answered','desk']`, `refetchInterval: 60_000` — the Desk's own tick, so the
roster and the line re-read together. A failed read surfaces as `isError`; the band simply has
no note line (it never invents one).

---

## Decisions a reviewer should check

1. **The overdue day's line does not restate the overdue sentence.** `desk-roster.test.tsx:86`
   asserts `getByText('One thing is overdue — Vandersteen.')` on the paragraph above the band,
   and RTL's `getNodeText` matches only *direct* text children — so a second element whose text
   normalised to the same string would either fail to match or make the query ambiguous. The
   day's line therefore renders the same fact at a second grain (which job, which stage, how
   long) instead of repeating the sentence. The specimen's leading subject ("One thing is
   overdue — ") is dropped for exactly this reason: the real Desk already prints that sentence
   directly above the band; the specimen page does not. **The overdue trio is intact** — head
   count → sentence → row mark, with the day's line as the link into the row.
2. **The clause uses `overdueElapsedPhrase`, not a date.** `overdue-condition.ts` is the one
   overdue derivation, and the designer portal has ruled no date idiom (H6's en-GB sweep is the
   client portal's). "overdue 6 days" reuses the phrase the row already prints rather than
   minting a fourth date format in this app.
3. **Two links can carry one job's name** (the row's own link opens the job; the day's line's
   only moves to the row), so the day's-line act carries
   `aria-label="{job} — the row below"`. This also keeps the existing
   `getByRole('link', { name: 'Vandersteen residence' })` assertions unambiguous.
4. **`and N more below` counts marked rows the band did not speak for** (`marked − spoken`),
   not a fixed `needing − 3`. With three lines shown it reduces to the specimen's arithmetic.
5. **The band returns `null` when it has no line to say**, even if rows are marked — a lone
   "and N more below" would be a second queue with nothing above it.

## Out-of-list edits (reported, not concealed)

- **`desk-roster.tsx`: one `id` attribute on the row `<li>`** (`id={rosterLineAnchorId(...)}`,
  beside the existing `data-roster-line`). The plan's shared-file table gives D1 "the block
  between the head and the first plate", D2 the head row and D4 the row's `className` at `:110`.
  An `id` is what an `href="#…"` can land on; `data-roster-line` is an identity, not an anchor.
  The attribute sits at the `<li>`, touching neither D2's nor D4's region.
- **Three test files outside D1's list** gained one `jest.mock('@/hooks/use-answered-notes')`
  each: `desk-roster-settle.test.tsx`, `app/(document)/desk/page.test.tsx`,
  `app/(document)/desk/desk-hire-handoff.test.tsx`. `DeskRoster` now reads data, and those three
  suites render it without a `QueryClientProvider` (`No QueryClient set` × 4 tests before the
  mocks). D1 may not touch `desk/page.tsx`, which is D2's and D3's, so the day's line cannot be
  passed down as a prop — the hook has to live in the component. No assertion in those three
  files changed; each addition is a stub returning `{ data: [] }`, matching how every other Desk
  feed is stubbed there. No other Wave-3 lane lists these files.
- **`INLINE_ACT` is a Tailwind class string local to `desk-roster.tsx`**, not a `globals.css`
  rule (D4 owns that file this wave), exactly as the brief directs. It carries the sheet's
  `.act--inline` grammar (§F-D): inherited family/size/case/colour, no control box,
  `pb-[3px]` + 1px `--color-aged-oak` rest rule, hover to `--text-faint` at 1.5px, the
  2px `--color-clay` focus ring.

## Tokens

No new hex literal. The band's rule is `--doc-ink-border` (`rgba(44,41,38,.18)`, globals.css:61)
— the designer portal's own stronger hairline, the local name for the sheet's `--hairline-strong`;
the portal's `--rule-hair` is a `border-bottom` shorthand and 0.10 alpha, too faint for this rule.
The clause uses `--color-terracotta-ink`, the rest rule `--color-aged-oak`, the focus ring
`--color-clay`, the hover `--text-faint` (`#65594E` = the sheet's `--ink-faint`).
No shadow, no badge, no pill, no `opacity:.5`, no truncation. `--elevation-sheet` and
`desk-settle` untouched; `shadow-gate.test.ts`, `contrast.test.ts` and `rail-stock.test.ts`
unedited and green.

---

## Evidence

```
$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit
(no output)
```

```
$ pnpm --filter @patina/designer-portal test -- --ci
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6709 passed, 6710 total
Snapshots:   12 passed, 12 total
Time:        ~290 s
exit=0
```
Baseline after Wave 1 was 544 suites / 6691 passed + 1 todo. +1 suite
(`use-answered-notes.test.tsx`), +18 tests, no suite lost, the `test.todo` still the A1 row D4
folds back.

```
$ pnpm --filter @patina/designer-portal test -- --ci \
    src/components/document/desk-roster.test.tsx \
    src/lib/document/__tests__/desk-roster-derivation.test.ts src/hooks \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 32 passed, 32 total
Tests:       368 passed, 368 total
```

```
$ pnpm --filter @patina/designer-portal lint
✖ 205 problems (2 errors, 203 warnings)
  src/components/document/rooms/piece/piece-room-save-gate.test.tsx
    159:1  error  Definition for rule 'import/first' was not found  import/first
  src/hooks/__tests__/use-commercial-documents.test.ts
    930:8  error  React Hook "useSendTradeRfq" is called in function "mutationFnOf" …
```
The two known errors, unchanged. Scoped lint of the lane's own new files:
```
$ npx eslint src/hooks/use-answered-notes.ts   (from apps/designer-portal)
exit=0
```

```
$ git diff --stat HEAD~1
 .../app/(document)/desk/desk-hire-handoff.test.tsx |   6 +
 .../src/app/(document)/desk/page.test.tsx          |   6 +
 .../document/desk-roster-settle.test.tsx           |   6 +
 .../src/components/document/desk-roster.test.tsx   | 149 ++++++++++++++-
 .../src/components/document/desk-roster.tsx        | 101 ++++++++++-
 .../__tests__/desk-roster-derivation.test.ts       | 201 ++++++++++++++++++++
 .../src/lib/document/desk-roster-derivation.ts     | 202 +++++++++++++++++++++
 7 files changed, 664 insertions(+), 7 deletions(-)
 + apps/designer-portal/src/hooks/use-answered-notes.ts                  (new)
 + apps/designer-portal/src/hooks/__tests__/use-answered-notes.test.tsx  (new)
```

```
$ git diff HEAD~1 | grep -E "^\+.*(box-shadow|shadow-|elevation-sheet|desk-settle)"
(no matches)
```

```
$ git push -u origin portal-polish/d1
 * [new branch]  portal-polish/d1 -> portal-polish/d1
```

### A note on one earlier run

An earlier full-suite run reported *7 failed suites / 14 failed tests*; it was executed
concurrently with `pnpm lint` on the same machine. The clean serial run isolated **one** real
failure (`desk-hire-handoff.test.tsx`, 4 tests, `No QueryClient set`), fixed by the mock above;
the other ten were load-induced flakes and do not reproduce. The final serial run is green
(545/545), quoted in full above.

## What I did not do

- Did not touch `apps/designer-portal/src/app/(document)/desk/page.tsx` (D2/D3), `globals.css`
  (D4), `document-action.tsx` (D4), or the roster head row (D2) and the row `className` at
  `:110` (D4).
- Did not edit `shadow-gate.test.ts`, `contrast.test.ts` or `rail-stock.test.ts`.
- Did not add an RPC, a migration, a table, a feature flag, a route, a toast, a badge, a count
  tile or a dwell timer. No `--color-error`. No prettier `--write` sweep (drift is pre-existing
  repo-wide: `npx prettier --check` warns on untouched files such as `section-eyebrow.tsx` and
  `overdue-condition.ts`).
- Did not run `supabase db reset`, a dev server, or any render/e2e pass — those belong to the
  Wave 3 integration lane.
- Did not verify the answered-note line against real data; the read is proved by its unit test
  and by RLS, not by a signed-in walk. **Owed at integration:** the `/desk` render at 1440 and
  390 with a seeded answered note.
