# Lane D1 fix — the day's line (IA-05) · applying the W3 review

**Branch:** `portal-polish/d1` · **Head:** `991932b60 fix(designer): address W3 review — d1`
(pushed; `origin/portal-polish/d1` == `HEAD`) · previous head `3c6754d78`
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d1`
**Date:** 2026-09-08

---

## Disposition of every finding

| ID | Severity | Disposition |
|---|---|---|
| D1-1 | P2 | **Fixed** — the lead line now leads with the client's name. |
| D1-2 | P2 | **Kept, flagged for integration sign-off** — no better fix exists inside the lane; nothing further was added to the three files. |
| D1-3 | P3 | **Fixed** — the inline acts now carry the sheet's proofreader's caret alongside the ring. |
| D1-4 | P3 | **Declined** — the reviewer accepts the rationale; changing it would re-break the RTL ambiguity it was written to avoid. |
| D1-5 | P3 | **Declined — out of scope** (no `.t-*` classes exist in this portal; `globals.css` is D4's this wave). |
| D1-6 | P3 | **Declined — out of scope** (`--hairline-strong` is not defined in the designer portal; minting it means editing `globals.css`, which is D4's). |
| D1-7 | P3 | **Behaviour unchanged, now pinned by test** — and raised as a product question. |

---

## D1-1 (P2) — the lead line now names the person

`desk-roster-derivation.ts`, the `lead` branch of `deriveDeskDayLine`:

```ts
        {
          kind: 'job',
          text: lead.line.client ?? lead.line.name,
          engagementId: lead.line.engagementId,
        },
```

The line now renders **`Marcus Wright · New lead — respond by Aug 27`**, the specimen's own
shape (`designer-desk.html:776`), with the act still linking into the row it is a view of. The
job name stands in only where the row carries no named client — `clientOf` returns `null` for an
empty or placeholder name, the same absent-name guard the answered line already applies (the
answered line drops itself entirely; the lead line falls back, because a lead deadline with an
unnamed client is still a deadline she has to answer).

The act's accessible name follows the visible text, so it is now
`aria-label="Marcus Wright — the row below"` rather than the job's.

Three tests:
- `desk-roster-derivation.test.ts` — *"names the person she is keeping waiting, then borrows the
  lead's own sentence"* (the renamed prior assertion, now expecting `Marcus Wright`).
- `desk-roster-derivation.test.ts` — *"falls back to the job when the lead row carries no named
  client"* (new; `client_name: ''` → `Harbour flat`).
- `desk-roster.test.tsx` — *"names the person she is keeping waiting on the lead line"* (new;
  asserts the rendered line's text is exactly `Marcus Wright · New lead — respond by Aug 27` and
  that the link resolves to `#roster-line-wright`).

## D1-3 (P3) — the caret, not just the ring

`INLINE_ACT` in `desk-roster.tsx` now carries the sheet's focus **pair**:

```
before:pointer-events-none before:absolute before:left-[-0.7em] before:top-1/2
before:-translate-y-1/2 before:text-[14px] before:leading-none
before:text-[color:var(--color-quiet-ink)] before:opacity-0
before:transition-opacity before:duration-150 before:content-['‸']
focus-visible:before:opacity-100 motion-reduce:before:transition-none
```

with `relative` on the act itself. Two deliberate departures, both noted in the code:

1. **Position.** The sheet sets the caret at `left: 1px`, which is calibrated for `.act`'s
   `padding: 4px 6px 10px` control box. `.act--inline` has `padding: 0`, so at `1px` the mark
   would land on top of the word's first letter. It sits just outside the word instead — a
   proofreader marks the margin.
2. **Accessible name.** The sheet uses `content: '\2038' / ''`; Tailwind's `content-[…]` utility
   has no alt-text form. Every inline act in the band now carries an explicit `aria-label`
   instead (the "and N more below" link gained one, matching its visible text), which is what
   keeps the pseudo-content out of the accessible name — `opacity: 0` does not exempt it.

Since jsdom does not compute pseudo-elements, the caret is verified two ways: a component test
asserting the utilities and the `aria-label` on **every** act in the band, and a real Tailwind
compile of the file (below), which proves the CSS is generated rather than silently dropped.

```
$ npx tailwindcss -i <@tailwind utilities> -o out.css \
    --content ./src/components/document/desk-roster.tsx
Done in 123ms.

.before\:content-\[\'\2038\'\]::before { --tw-content: '‸'; content: var(--tw-content) }
.before\:absolute::before             { position: absolute }
.before\:left-\[-0\.7em\]::before     { left: -0.7em }
.before\:-translate-y-1\/2::before    { --tw-translate-y: -50% … }
.focus-visible\:before\:opacity-100:focus-visible::before { content: var(--tw-content); opacity: 1 }

$ grep -n -- "--color-quiet-ink:" src/app/globals.css
18:  --color-quiet-ink: #65594E;
```

No new token, no new hex, no `globals.css` edit.

## D1-7 (P3) — `reconnect_due` stays out, and now says so

Behaviour unchanged: the lead slot matches `needKind === 'new_lead'` only. The reasoning, now a
comment in the derivation:

> `reconnect_due` is deliberately NOT here. It shares `lead_response_deadline` with `new_lead` in
> `needSortKey`, but the specimen and §F item 5 both say "new lead", and a nurtured lead's
> touchpoint is not the deadline this slot answers. Widening it is a product call, not a lane's.

Widening the filter would also let a reconnect date outrank a genuine new lead through
`byDueThenId`, which is a behaviour change no brief asked for. Pinned by a new test —
*"leaves a reconnect touchpoint to the roster row — the lead slot is new leads only"* — so the
narrowing is now a stated decision rather than an untested accident, and reversing it is a
one-line change with a failing test to point at.

**Owed a product answer at integration:** should a reconnect touchpoint that has come due take
the lead slot when no new lead is open? The row still carries its own mark and sentence in the
roster either way.

## D1-2 (P2) — the three out-of-list test files

Unchanged and nothing added. `DeskRoster` calls `useAnsweredNotes` (React Query), so any suite
mounting it without a `QueryClientProvider` throws `No QueryClient set` regardless of `enabled`;
D1 may not touch `desk/page.tsx` (D2/D3), so the hook cannot be lifted to a prop. The three
one-line `jest.mock('@/hooks/use-answered-notes')` additions in
`app/(document)/desk/page.test.tsx`, `app/(document)/desk/desk-hire-handoff.test.tsx` and
`components/document/desk-roster-settle.test.tsx` stand as landed in `ac6fadb18`, with no
assertion in any of the three changed. **This needs the integration lane's conscious sign-off** —
either accepted as-is, or folded into the integration merge commit rather than D1's.

## D1-4, D1-5, D1-6 — declined, with reasons

- **D1-4 (specimen wording on the overdue line).** The reviewer's own disposition is "no fix
  needed if the rationale is accepted". Restoring the "One thing is overdue —" lead-in would put
  a second element on the page whose normalised text equals the sentence
  `desk-roster.test.tsx` already queries by, making that pre-existing (untouchable) assertion
  ambiguous; and a calendar date here would mint a fourth date idiom in a portal that has ruled
  none. The head count → sentence → day's line → row mark chain stays four legible grains of one
  fact.
- **D1-5 (`.t-body` vs `doc-type-body`).** No `.t-*` type-step class exists anywhere in the
  designer portal, and defining one means editing `apps/designer-portal/src/app/globals.css`,
  which the Wave 3 shared-file table gives to D4. Reusing the class the roster's own row-state
  text already uses is the only in-lane option. Program-level typography gap, unchanged.
- **D1-6 (`--doc-ink-border` .18 vs `--hairline-strong` .14).** `--hairline-strong` is not
  defined in the designer portal at all (`grep` over `globals.css`: no match) — introducing or
  aliasing it is a `globals.css` edit, D4's file this wave. `--doc-ink-border` is the portal's
  existing stronger hairline and the nearest true token; the alternative, `--rule-hair` at .10,
  is too faint for a rule that has to separate the band from the head. No new value was minted.

---

## Gate — re-run after the fix

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-d1 \
    --filter @patina/designer-portal type-check
> tsc --noEmit
(no output, exit 0)
```

```
$ pnpm --dir … --filter @patina/designer-portal test -- --ci \
    src/components/document/desk-roster.test.tsx \
    src/lib/document/__tests__/desk-roster-derivation.test.ts src/hooks \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts
Test Suites: 32 passed, 32 total
Tests:       372 passed, 372 total
```
(368 → 372: the four new tests.)

```
$ pnpm --dir … --filter @patina/designer-portal test -- --ci
Test Suites: 545 passed, 545 total
Tests:       1 todo, 6713 passed, 6714 total
Snapshots:   12 passed, 12 total
Time:        66.821 s
```
545 suites unchanged; 6709 → 6713 passed (+4); the A1 `terminal` `test.todo` still present and
untouched for D4.

```
$ npx eslint src/components/document src/lib/document src/hooks   (from apps/designer-portal)
✖ 83 problems (2 errors, 81 warnings)
  src/components/document/rooms/piece/piece-room-save-gate.test.tsx:159  import/first
  src/hooks/__tests__/use-commercial-documents.test.ts:930               react-hooks/rules-of-hooks

$ npx eslint <the six D1 files>
exit=0
```
The same two known errors, count not grown; the lane's own files lint-clean.

```
$ git diff HEAD~1 --stat
 .../src/components/document/desk-roster.test.tsx   | 31 +++++++++++++
 .../src/components/document/desk-roster.tsx        | 13 +++++-
 .../__tests__/desk-roster-derivation.test.ts       | 54 +++++++++++++++++++++-
 .../src/lib/document/desk-roster-derivation.ts     | 10 +++-
 4 files changed, 103 insertions(+), 5 deletions(-)

$ git diff HEAD~1 -- src/lib/document/__tests__/shadow-gate.test.ts \
    …/contrast.test.ts …/rail-stock.test.ts | wc -l
0

$ git diff HEAD~1 | grep '^+' | grep -E 'box-shadow|shadow-|elevation-sheet|desk-settle|#[0-9A-Fa-f]{3,8}'
(no matches)
```

Every file in this commit is on D1's declared list. `--elevation-sheet` and `desk-settle`
untouched; the shadow gate, contrast and rail-stock suites unedited and green.

Prettier reports drift on all four files, as it does on untouched files elsewhere in the portal
(the CLI resolves a config without `singleQuote` from that cwd; the whole file, imports included,
"drifts"). Pre-existing and advisory — no `--write` sweep run.

## What I did not do

- Did not touch `desk/page.tsx`, `globals.css`, `document-action.tsx`, the roster head row, or
  the row `className` at `:110` — D2/D3/D4 regions all unchanged.
- Did not unwind, extend, or re-touch the three out-of-list `jest.mock` lines from `ac6fadb18`.
- Did not widen the lead filter to `reconnect_due`, mint a `--hairline-strong` alias, add `.t-*`
  type-step classes, or restore the specimen's calendar date on the overdue line — reasons above.
- Did not run a dev server, `supabase db reset`, or any render/e2e pass. **Still owed at
  integration:** the `/desk` render at 1440 and 390 with a seeded answered note, and a keyboard
  pass confirming the caret reads as a margin mark rather than an overlap in the three real line
  shapes.
