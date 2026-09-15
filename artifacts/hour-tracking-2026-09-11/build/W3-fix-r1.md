# W3 — review round 1 fixes

Branch `hour-tracking/portal`, worktree `.codex/worktrees/agent-portal`. Three findings,
all three accepted and applied; none was wrong. No migration touched (no `db reset`, no
`db:generate`, no grants regeneration owed).

---

## W3-R1-M1 — the Desk's Begin column rendered a verb that did nothing

**Accepted.** `desk-contents.tsx` renders `STUDIO_VERBS` wholesale (`:383`) and dispatches
through `verbHandlers[key]?.()` (`:303-308`). Adding `log-time` to the registry for ⌘K gave
it a second consumer with no handler, and `DeskContents` mounts unconditionally on `/desk`
(`desk/page.tsx:455,461`), so the row stood on the Desk and the click fired only a
wayfinding event.

**Fix**

- `apps/designer-portal/src/components/document/desk-contents.tsx` — imports `openLogTime`
  from `@/components/document/log-time-sheet` and adds `'log-time': () => openLogTime(),`
  to `verbHandlers`. `LogTimeOverlay` mounts in `(document)/layout.tsx:105`, which wraps
  `/desk`, so the event has a listener from the Desk.
- `apps/designer-portal/src/components/document/__tests__/desk-contents.test.tsx` — a
  **registry-driven** case, not a per-verb one: it imports `STUDIO_VERBS`, renders the
  index, and for every verb the column renders (all but `capture-lead`) clears the six
  openers, clicks the row, and asserts **exactly one** opener fired. The assertion is
  written as `expect([verb.key, fired]).toEqual([verb.key, 1])` so a failure names the verb.
  `next/navigation`'s `push` was a fresh `jest.fn()` per call and is now a stable
  module-level mock, because the `add-maker` verb dispatches through the router.

**Falsified**: with the handler removed the new case fails (`1 failed, 10 passed`) and the
rest of the suite stays green — the handler line is what the test is holding.

---

## W3-R1-M2 — two of the four capture doors still defaulted `activity` to design work

**Accepted.** HT-24 is "recorded, never required — print 'activity not set' honestly".
The ⌘K form and the log strip honoured it; the Hours add row (`hours-ledger.tsx:358`) and
the phone's manual sheet (`mobile-sheets.tsx:1152`) still opened on `'design'` with no
empty option, so an hour typed there was filed as design work the member never claimed.
The W3-impl defence (the plan's file table names `log-strip.tsx` only) does not reach
`mobile-sheets.tsx` at all, and the wave's own `time-capture.tsx` thesis is four surfaces,
one answer.

**Fix**

- `hours-ledger.tsx` — `useState('')`; `<option value="">activity not set</option>` first
  in the activity `<select>`; `batchAdd` sends `activity: addActivity || null`. The HT-27
  instrument beside it now reports `written.activity ?? null` rather than the form's
  string, so an unset activity is reported as null instead of `''` (the comment two lines
  above already promised the server's row).
- `mobile-sheets.tsx` — `useState('')` and the same first option. The write path already
  sent `activity || null`.
- Tests: `hours-ledger-add-row.test.tsx` and `mobile-sheets.test.tsx` each gain the
  assertion `command-bar-log-time.test.tsx` already carried — the select opens on `''`,
  the "activity not set" option exists, and a submit with nothing chosen sends `null`.

---

## W3-R1-M3 — the ⌘K form never read the document in hand, and carried the last one

**Accepted.** `log-time-sheet.tsx` had zero references to `useDocumentTime`, and the open
effect (`:99-108`) reset minutes, activity, `rateRole` and date but **not** `projectId`, so
reopening re-proposed whatever document was picked last time. The Hours add row seeds from
context (`hours-ledger.tsx:356`), so the two doors for one act disagreed.

**Fix** — `log-time-sheet.tsx` imports `useDocumentTime` and takes `heldProjectId`, seeded
in an effect with deps `[open, heldProjectId]`:

```tsx
useEffect(() => {
  if (!open) return;
  setProjectId(heldProjectId ?? '');
}, [open, heldProjectId]);
```

**One deliberate deviation from the finding's wording.** The finding asked for
`setProjectId(heldProjectId ?? '')` inside the existing open-effect with `heldProjectId`
added to its dep array. That effect also clears `minutes`, `activity`, `rateRole` and
`date`; with `heldProjectId` in its deps, a hand that changes while the form stands open
(the timer stops, the held document clears) would wipe minutes already typed. The seed
therefore lives in its own effect with the same deps. Behaviour asked for is unchanged —
on open the picker is the held document or empty, and the document follows a change of
hand — and a half-typed form now survives one. Effect order is safe: the seed effect is
declared after the billable-seeding effect and before the reset effect, so `seededFor` is
cleared on the same open pass and the billable pill still seeds for the newly-set document
on the following render.

**Tests** — `command-bar-log-time.test.tsx` mocks `@/hooks/document-time-provider`
(`useDocumentTime` throws without its provider; the real mount is inside it) behind a
`mockHeldProjectId` reset per case, and gains two:

- with `proj-rostered` in hand the picker opens on it;
- picking `proj-stranger`, closing with Escape and reopening with nothing in hand leaves the
  picker empty — the stale carry-over is gone.

---

## Gates

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` | 578 suites / 7352 tests, all pass |
| `pnpm --filter @patina/designer-portal lint` | 0 errors (201 pre-existing warnings, none on a touched file) |

No `packages/*` edit, so the admin-portal build gate is not owed by this round; no
migration, so `supabase:reset`, `run-sql-tests.sh`, `db:generate` and
`generate-legacy-grants.py` are not owed either.
