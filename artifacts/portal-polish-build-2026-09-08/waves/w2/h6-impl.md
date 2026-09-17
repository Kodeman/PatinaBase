# Lane H6 — The money block and one date (PP-2) — implementation

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h6`
**Branch** `portal-polish/h6`, cut from `origin/main` `1059f5275`, pushed.
**Commits**
- `f85f24d81` feat(client): one date style — legalDate/dayMonth sweep (PP-2)
- `b287bac26` feat(client): the owed figure is the announced figure; reconciling sentence; Pay under a consequence sentence (PP-2)

`git diff --stat origin/main..HEAD` — **32 files, +590 / −243**.

---

## 1. What was built

### `src/lib/threshold/dates.ts` (new) + `__tests__/dates.test.ts` (new)
The only place either idiom is composed.

- `legalDate(value)` → `"11 September 2026"` — a day that is a term of a paper, or a day in another year.
- `dayMonth(value)` → `"11 September"` — a day inside a sentence.
- Both `en-GB`; both accept `Date | string | null | undefined` and return `string | null`, so an
  unreadable date is silence, never `Invalid Date`.
- `DAY_MONTH_FORMAT` is exported for the callers that hold a `Date` and format many through it
  (`DAY_MONTH.format(x)` sites keep their call shape); `MONTH_NAME_FORMAT` covers a **month standing
  alone** — a chapter's span, which is not a date idiom and has no day or year.
- `parseSourceDate` **moved here** from `derive.ts` (with its comment) and is re-exported from
  `derive.ts`, so its ~20 importers are untouched and there is no second date parser and no import
  cycle. `derive.ts`'s `DAY_MONTH` export is now `DAY_MONTH_FORMAT`, so `papers-sheet.tsx`,
  `room-capture.tsx` and `room-band.tsx` (H5's file) are **not touched by this lane**.
- A site that spells the year out only when it is not this year composes the two
  (`today.getFullYear() !== due.getFullYear() ? legalDate(due) : dayMonth(due)`); no third idiom.

Coverage of `dates.ts`: **100 / 100 / 100 / 100**.

### The sweep
`grep -rn "en-US\|en-GB" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold`
was the worklist (31 hits at start).

**en-US date formatters removed (8 files):** `road-orders.tsx`, `ground-floor.tsx`,
`earlier-invoices.tsx`, `letterbox.tsx`, `approval-ask.tsx`, `story-pole.tsx`,
`instruments/spine-toll.tsx`, `instruments/making-spine.tsx`.
`making-spine`'s `formatSpineDate` went from `MAR 12` to `12 March` (and `Feb 8, 2027` → `8 February
2027`), which is the one visible re-print outside the money block.

**en-GB sites routed through the helper (12):** `the-note`, `correspondence`, `wall-gate`,
`story-pole`, `door-acts`, `approval-ask`, `door-gate`, `previously`, `scope-change-ask`,
`review-ask`, `instruments/signature-line` (`signedOnLabel` is `legalDate` now),
`lib/threshold/derive.ts`. `lib/threshold/standing.ts`'s hand-rolled `dayAndMonth` (its own month
table) and `owedDueLine`'s year branch now call `dayMonth` / `legalDate`.

### The money block
**`house-ledger.tsx`** — the owed figure is the announced figure (PP-2 / R140):

- owed figure at the display step, `.t-d2`, `data-testid="house-ledger-owed"`;
- `due 11 September 2026` beneath it at `.t-meta`, `data-testid="house-ledger-owed-due"`
  (`owedDueLine` unchanged in logic — it still says `soonest due` for a partly-dated set);
- **one reconciling sentence** under that, `.t-body`, every figure in a `.t-money` span:
  `$11,100 agreed · $0 paid · $4,060 owed on INV-2026-0301.`;
- `standsSentence()` is unchanged in words and now stands **below** the obligation at `.t-body-sm`;
- the **owed row leaves the row list** (it was the announced figure repeated); held and awaiting stay
  and their figures are `.t-money` instead of 13.5px mono. Falsy rows are still filtered — no `$0`
  placeholder row.
- `owedWords()`'s S1 clause is preserved *inside* the sentence ("owed on the open invoice from the
  studio, not for this house"), and a studio letter never takes the new invoice-number branch.
  `LedgerRow.due` was dead once the owed row left and was removed.

**`derive.ts`** gained the two fields that sentence needs, off the rollup it already computed:
`paidCents` (Σ settled across the open invoices, null when nothing is open) and `owedInvoiceNumber`
(only when the house owes on exactly one letter that carries a number). `computeInvoiceRollup` is
now called once, not twice.

**`letterbox.tsx`** — the figure line's three figures are `.t-money` (the 15px money step, which is
what "the figure line at 15px" means once the figures are set, not the paragraph); the drawing takes
the plain gloss `Invoice` in a `<figcaption>` (absent on an empty slot); **Pay is a terminal act**
carrying the amount — `Pay $9,125` — under the consequence sentence *"This opens payment. Nothing is
charged until you choose how to pay."* The act is the letterbox's existing `/pay/<token>` link
(`invoice_open_link`, `prefetch={false}` intact); its label was `Open the invoice`.
`data-never-dim` at `:228` is untouched and is now pinned by a test. `Open the letterbox` /
`Close the letterbox` / `Print` are unchanged.

### Tests
`dates.test.ts` is new (both helpers, month and year boundaries, a date-only string read in the
client's own calendar, null/undefined/unparseable, the "never month-first" contract). Six new cases
in `house-ledger.test.tsx` (announced figure and its class, its order above `standsSentence`, the
reconciling sentence and its three `.t-money` spans, the no-owed silence, the missing-agreed clause,
the numbered letter, the studio letter that must not be numbered) and five in `letterbox.test.tsx`
(the amount in the label under the consequence sentence and above the act, no consequence with no
address, the gloss present/absent, the three money spans, `data-never-dim`). Every date assertion the
sweep changed was updated in place across nine suites.

---

## 2. Gates — commands run and real output

```
$ pnpm --dir …/agent-pp-h6/apps/client-portal type-check
> tsc --noEmit                                         # no output, exit 0

$ pnpm --dir …/apps/client-portal test -- src/components/threshold src/lib/threshold
Test Suites: 54 passed, 54 total
Tests:       1307 passed, 1307 total

$ npx jest                                              # full client suite
Test Suites: 135 passed, 135 total
Tests:       2276 passed, 2276 total
Snapshots:   1 passed, 1 total

$ npx eslint src/components/threshold src/lib/threshold
✖ 2 problems (1 error, 1 warning)
```

Both eslint problems are **pre-existing and outside this lane's diff**:
- `approval-ask.tsx:1079 react-hooks/set-state-in-effect` — `git diff` on that file touches only
  lines 33, 51-53, 272-275, 314-317 and 407-410.
- `tracking-row.tsx:104` unused eslint-disable — `git diff` on that file is **empty**.

Coverage on the touched modules (`npx jest --coverage --runInBand src/lib/threshold
house-ledger.test.tsx letterbox.test.tsx`):

```
dates.ts          100 |   100 | 100 | 100
house-ledger.tsx  100 |   100 | 100 | 100
letterbox.tsx     100 | 95.65 | 100 | 100
derive.ts       98.72 | 91.62 | 100 | 100
standing.ts     99.04 | 95.31 | 100 | 100
```

**Each commit is green on its own.** Commit 1 was verified in isolation (money files reverted to the
commit-1 tree, gates run, then restored): `tsc --noEmit` clean, `54 suites / 1296 tests passed`. The
first attempt at the split left commit 1 red on one cross-file assertion (`letterbox.test.tsx`'s
spine-toll date, whose source moved in commit 1); the split was redone so every date hunk —
including `letterbox.tsx`'s `formatDue` and `threshold.test.tsx`'s two date strings — lands in
commit 1.

---

## 3. The `en-US` grep does not reach zero — three currency formatters

```
$ grep -rn "en-US" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold
components/threshold/approval-ask.tsx:154            new Intl.NumberFormat('en-US', { style: 'currency', currency })
components/threshold/instruments/tracking-row.tsx:81 new Intl.NumberFormat('en-US', { style: 'currency', … })
components/threshold/instruments/standing-sentence.ts:210 new Intl.NumberFormat('en-US', { style: 'currency', … })
```

**Zero en-US *date* formatters remain.** These three are `Intl.NumberFormat` currency, not dates:
`en-GB` would print `US$4,060.00` at a US homeowner. They are the surface's money spellers
(`moneyExact`, `money`, `moneyInWords`), each with its own documented rounding contract, and the
lane's helper is a date helper. **Flagged for the reviewer**: the plan's gate line reads
`grep -rn "en-US" … # expect zero`; the ruling it enforces is PP-2's one *date* style, and I did not
re-locale money to satisfy a literal grep. If Kody wants a money helper too, that is a separate
change to three call sites and their tests.

Also left standing: `approval-ask.tsx:55 LETTER_DATE` — already `en-GB`, but it is
day + month + **hour + minute** (a comment's timestamp), not one of the two date idioms; routing it
through `dayMonth` would drop the time.

## 4. What I did not do

- **`doorstep.tsx` was not touched.** Its money region is the `children` slot the ledger and letterbox
  render into; the file itself formats no money and no dates. H3 owns `#changed` there and there was
  nothing in the money region for this lane to change.
- **`threshold.tsx` was not touched** (H3 and H5 own it). The reconciling sentence gets `paidCents`
  and `owedInvoiceNumber` from `derive.ts`'s ledger model rather than from a new prop, so no wiring
  change was needed at the mount.
- **`room-band.tsx`, `papers-sheet.tsx`, `room-capture.tsx` were not touched** — they read
  `derive.ts`'s `DAY_MONTH`, which now points at the shared formatter.
- **Money format was not changed.** The specimen prints cents (`$4,060.00`); the running surface
  prints whole dollars through `moneyInWords`, which is the pinned P-24 idiom string-tested in
  `standing-sentence.test.ts` and read by every figure on the page. Re-spelling every figure on the
  house page was not in this lane and would break assertions in nine suites. **Owed to a ruling if
  Kody wants the specimen's cents.**
- **No dev server, no DB reset, no deploy.**

## 5. Cross-lane dependencies at integration

- **H2** owns `globals.css`'s `.t-*` and `.consequence`. This lane emits `t-d2`, `t-meta`, `t-body`,
  `t-body-sm`, `t-money` and `consequence` class names; on this branch alone they are unstyled.
- **H4** owns the `terminal` variant. `letterbox.tsx` declares
  `const TERMINAL = 'terminal' as ScoredActionVariant;` with a `TODO(H4)` naming the lane —
  **type-check did not flag it** (the cast satisfies `tsc`), so this is a deliberate narrow cast, not a
  workaround for an error. At runtime on this branch `VARIANT_CLASS['terminal']` is `undefined` and the
  act renders with base classes only. **The integration lane deletes the const and passes
  `variant="terminal"` directly**, after H4 merges.
- **H1** renames `Leave the house` → `Sign out` in the mat; no overlap with this lane.
- Files this lane shares per the plan's table: `letterbox.tsx` (H6 only, as specified);
  `wall-gate.tsx` / `door-gate.tsx` (H4 first, then H6's date sweep rebases — this lane's change to
  both is the **one-line import swap** for `DAY_MONTH`, so the rebase is trivial);
  `derive.ts` (A2 already merged; this lane adds two ledger fields and the date re-export).
