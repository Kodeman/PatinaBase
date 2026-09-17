# Lane H6 — The money block and one date (PP-2) — review

**Reviewer** — separate context, did not implement H6.
**Branch reviewed** `origin/portal-polish/h6` @ `b287bac26` (cut from `origin/main` @ `1059f5275`).
**Worktree inspected (read-only)** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h6`.
**Method**: read the plan's Lane H6 section, the Review protocol, `h6-impl.md`; pulled the real diff
(`git diff origin/main...origin/portal-polish/h6`, 32 files / +590 / −243) and read every changed
hunk; read every new/changed component and test body, not just the report's summary; re-ran the
lane's own gate commands from the worktree; cross-checked against
`docs/design/house-sheet/SPEC.md` §A5/§A6 and the region of
`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html` this lane rebuilds.

## Gate commands — re-run myself, real output

```
$ pnpm --dir .../agent-pp-h6/apps/client-portal type-check
> tsc --noEmit
(exit 0, no output)

$ pnpm --dir .../agent-pp-h6/apps/client-portal test -- src/components/threshold src/lib/threshold
Test Suites: 54 passed, 54 total
Tests:       1307 passed, 1307 total
Time:        8.952 s

$ npx eslint src/components/threshold src/lib/threshold   (run from apps/client-portal)
/apps/client-portal/src/components/threshold/approval-ask.tsx
  1079:7  error  react-hooks/set-state-in-effect
/apps/client-portal/src/components/threshold/instruments/tracking-row.tsx
  104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)

$ grep -rn "en-US" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold
components/threshold/approval-ask.tsx:154            Intl.NumberFormat('en-US', currency)
components/threshold/instruments/tracking-row.tsx:81  Intl.NumberFormat('en-US', currency)
components/threshold/instruments/standing-sentence.ts:210 Intl.NumberFormat('en-US', currency)

$ npx jest --coverage --collectCoverageFrom=... dates.ts/house-ledger.tsx/letterbox.tsx/derive.ts/standing.ts
dates.ts          100 |   100 | 100 | 100
house-ledger.tsx  100 |   100 | 100 | 100
letterbox.tsx     100 | 95.65 | 100 | 100
derive.ts       98.72 | 91.62 | 100 | 100
standing.ts     99.05 | 92.64 | 100 | 100
```

All numbers match the lane's own report exactly. I independently confirmed:
- the two eslint findings are **pre-existing and outside this lane's diff** — `approval-ask.tsx:1079`
  is inside an unchanged `useEffect` (diff on that file touches only lines 33, 51-53, 272-275,
  314-317, 407-410; I read `git show origin/main:...approval-ask.tsx` at 1070-1085 and it is
  byte-identical to the branch); `tracking-row.tsx`'s diff against `origin/main` is **empty**.
- full client suite (`npx jest`, no path filter) is unaffected outside the touched region — I did not
  re-run the full 2276-test suite myself (would have taken longer than the scoped gate the plan asks
  for), but the scoped run above is the plan's actual gate command and it is green.

## Pathspec discipline

Diff touches exactly 32 files. Every one is either explicitly named in the lane's file list or is a
test file for a component the lane explicitly lists (the `instruments/{spine-toll,making-spine,
signature-line,standing-sentence,tracking-row}` group and the thirteen `.tsx` files named in the
plan). One test file is not literally named and is worth flagging:

- **`instruments/__tests__/open-chapter.test.tsx`** is touched (two date-string assertions). Its
  filename does not match anything in H6's list, but its content is the test suite for `SpineToll`
  (`import { SpineToll } from '../spine-toll'`) — `spine-toll.tsx` **is** in H6's file list. This is a
  legacy filename mismatch pre-dating this lane (the file also covers `TrackingRow`), not a pathspec
  violation. **P3, confidence high** — informational only, no fix needed.
- `threshold.test.tsx` and `threshold-robustness.test.tsx` are updated (date-string and testid
  corrections only) even though `threshold.tsx` itself is not in H6's file list — it is owned by
  H3/H5 per the shared-file table. These updates were made necessary by H6's own changes to
  `house-ledger.tsx`/`letterbox.tsx`, which `threshold.tsx` renders; without the update the full
  suite would go red. The diffs are narrow (string/testid corrections, no new assertions of
  substance) and the full local suite passes. **P3, confidence medium** — technically outside the
  literal file list, but necessary test maintenance with no scope creep in the assertions themselves;
  flagging so the integration lane doesn't attribute an unexpected hunk in these two files to a
  different lane during the merge.

`doorstep.tsx`, `threshold.tsx` (structurally), `room-band.tsx`, `papers-sheet.tsx`, `room-capture.tsx`,
`instruments/standing-sentence.ts`, `instruments/tracking-row.tsx` are confirmed **untouched**
(`git diff` on each is empty) — matches the report's "what I did not do" section exactly.

## House sheet compliance

- **No new hex literal**: `git diff | grep -oE '#[0-9A-Fa-f]{3,6}'` on added lines returns nothing.
- **No shadow / pill / badge / dot / ✓ / spinner / opacity-.5 / `disabled=` / ellipsis**: grepped the
  full diff for all of these; zero hits.
- **Type steps**: `house-ledger.tsx` uses `.t-d2` for the announced owed figure, `.t-meta` for the due
  line, `.t-body` for the reconciling sentence, `.t-body-sm` for `standsSentence`, `.t-money` on every
  ledger figure — matches SPEC §A3 exactly (one announced figure at the display step, every other
  figure in the block at the money step). `letterbox.tsx` uses `.t-meta` for the "Invoice" gloss and
  `.t-money` on all three figures in its own body line.
- **`.consequence`**: used verbatim ("This opens payment. Nothing is charged until you choose how to
  pay."), placed **directly above** the terminal act in DOM order (verified by reading the JSX and by
  the lane's own test using `compareDocumentPosition`), matching SPEC §A6 ("One sentence, directly
  above the terminal act").
- **No anchor id renamed**: `house-ledger.tsx` keeps `id="ledger"`; `letterbox.tsx` keeps
  `id="letterbox"`. Only `data-testid` attributes were added.
- **No `$0` placeholder for absent data**: the `$0` that *does* appear (`$0 paid` in the reconciling
  sentence when nothing has been paid) is a true reconciling value, not a stand-in for missing data —
  this is the exact string the plan's own step 4 specifies (`"$0.00 paid"` in its worked example) and
  matches the specimen's `<span class="t-money">$0.00</span> paid`. Rows with no truthy figure
  (`held`, `awaiting`) are still filtered out entirely (`flatMap`), never rendered as `$0`.

Cross-lane classes this lane emits (`t-d2`, `t-meta`, `t-body`, `t-body-sm`, `t-money`, `consequence`)
are unstyled on this branch alone because H2 owns `globals.css`'s `.t-*` block and hasn't merged onto
this lane's branch — expected and correctly disclosed, not a defect.

## PP-2 / R140 ruling implementation

- **Exactly one announced figure per money block, and it is the owed one**: confirmed in
  `house-ledger.tsx` — the owed figure is the only `.t-d2` in the ledger, `standsSentence()` (the
  "stands at X agreed" line) now renders at `.t-body-sm` **below** it. Verified via a passing test
  that asserts DOM order (`house-ledger-owed` before `house-ledger-top`).
- **One reconciling sentence, every other figure `.t-money`**: confirmed in code and tests
  (`house-ledger-reconcile` testid, three clauses, each figure wrapped in `<span className="t-money">`).
- **No block shows one payment in three families (VC-10)**: the letterbox's own body line
  ("Invoice · $X total · $Y paid. Balance $Z, due DATE") now sets all three figures at `.t-money` too
  (previously plain text) — verified by test.
- **"due 11 September" never appears one line above "due September 11" again**: the date sweep
  (commit `f85f24d81`) removes every locally-constructed `Intl.DateTimeFormat` under
  `components/threshold` and `lib/threshold` and routes all of them through `dates.ts`'s `legalDate`/
  `dayMonth`. I independently re-ran `grep -rn "Intl.DateTimeFormat" apps/client-portal/src/components/
  threshold apps/client-portal/src/lib/threshold` and the only surviving construction is inside
  `dates.ts` itself (`LEGAL_DATE`, `DAY_MONTH_FORMAT`, `MONTH_NAME_FORMAT`) — confirmed no second date
  formatter was left behind anywhere in scope.

## Gate that does not literally pass — flagged by the lane, verified by me

The plan's H6 gate line reads `grep -rn "en-US" ... # expect zero`. The literal grep returns **three**
hits, all `Intl.NumberFormat('en-US', { style: 'currency', ... })` — `approval-ask.tsx:154`
(`moneyExact`), `tracking-row.tsx:81`, `standing-sentence.ts:210` (`moneyInWords`). I confirmed by
inspection that all three are money formatters, not date formatters, and that switching them to
`en-GB` would print `US$4,060.00` rather than `$4,060.00` for a US homeowner — a real, not cosmetic,
regression. PP-2 / R140 as amended is about **one date style**; the money-locale question is a
separate, disclosed, out-of-scope item.

**P2, confidence high** — not a defect in the lane's actual work, but the literal gate command in the
plan does not pass as written, and the lane did not get any explicit sign-off to treat that gate line
as non-binding before shipping past it. Recommend: either the integration lane / Kody explicitly
rules this acceptable (the lane's own report already asks for exactly this), or the plan's gate is
corrected to grep date-shaped formatters only. This should not block merge — the underlying judgment is
sound and well-argued — but it should not be silently absorbed either.

## Test-coverage gap (behaviour, not markup) — the actual finding I'd want fixed

`derive.ts` gained two new fields on `HouseLedgerModel` — `paidCents` and `owedInvoiceNumber` — with
real computation inside `deriveThreshold()` (lines ~558-567: `openRollup`, the `paidCents` pull-through,
the one-invoice-only `owedInvoiceNumber` derivation). **`derive.test.ts` was not touched and contains
zero assertions on `model.ledger.paidCents` or `model.ledger.owedInvoiceNumber`** for any call to
`deriveThreshold()` — I grepped the full test file for both field names and got no matches outside
`invoice-rollup.test.ts` (which tests the pre-existing, unrelated `computeInvoiceRollup` helper
directly, not the new wiring in `derive.ts`).

The only tests that exercise these two fields are `house-ledger.test.tsx` /
`threshold-robustness.test.tsx`, which build a **hand-constructed** `HouseLedgerModel` and pass it
straight to the `<HouseLedger>` component — they verify the component renders a given model correctly,
but never verify that `deriveThreshold()` computes that model correctly from real invoice rows. The
coverage tool's line-coverage numbers (derive.ts 98.72% stmt) are misleading here: the lines execute
as a side effect of existing `owedCents` tests that also happen to build the same object literal, but
no assertion would fail if the `paidCents:` or `owedInvoiceNumber:` computation were silently deleted
or swapped for the wrong value (e.g. summing the wrong invoice set, or picking `openInvoices[1]`
instead of `[0]`).

This is exactly the "test coverage of the behaviour, not the markup" the review protocol calls out.
**P2, confidence high.** Suggested fix (small, targeted): in `derive.test.ts`, extend one or two of the
existing `owedCents`-focused `deriveThreshold()` tests to also assert `model.ledger.paidCents` (a
partly-paid open invoice) and `model.ledger.owedInvoiceNumber` (single numbered open invoice present /
absent when count > 1 or number missing).

## Minor code-quality finding

`door-acts.tsx` — the sweep removed the `DAY_MONTH` constant but left its doc comment orphaned above
unrelated code:

```
/** "5 August" — the deck's own date idiom, as the door itself dates things. */

const REASON_MAX = 1000;
```

The comment now describes nothing; `REASON_MAX`/`FEEDBACK_MAX`/`QUESTION_MAX` below it have nothing to
do with dates. **P3, confidence high.** One-line deletion.

## Accessibility

No new interactive controls were introduced by this lane — `letterbox.tsx`'s Pay act is the
pre-existing `ScoredAction` with a changed `variant` prop (cast to `'terminal'` pending H4, with a
`TODO(H4)` comment naming the lane and confirming the integration lane's job of removing the cast); the
`<figcaption>` addition is static text, not a control. Focus ring, `aria-disabled`/`aria-describedby`,
44px targets and contrast are all owned by `ScoredAction`/H4's tier CSS, out of this lane's diff and
correctly left alone. `data-never-dim` on the letterbox root is untouched and now pinned by a new test
(`house-ledger`'s dimmable rows use `data-dimmable`, consistent with the existing pattern — not changed
by this lane).

One pre-existing (not lane-introduced) point worth naming for the record rather than as a finding
against this lane: SPEC §A6 says the consequence sentence is "present in every state including
unavailable," but `letterbox.tsx` only renders the consequence sentence (and the Pay act) when
`invoiceLink` is truthy — there is no "Pay act unavailable" state rendered at all when the link hasn't
resolved. This behaviour predates the lane (the old `variant="primary"` act was gated on the exact same
`invoiceLink &&` condition) and is not something H6 introduced or was asked to fix. **P3, confidence
medium** — noting only because the reviewer brief asks to compare against the sheet in full; not a
finding against this lane's diff.

## Specimen comparison — the money block

Compared against `artifacts/portal-polish-review-2026-09-08/specimens/client-house.html` lines
~672-699 (`<section class="money" id="letterbox">`). The built structure matches the specimen's grammar
closely: owed figure at `.t-d2`, "due DATE" beneath at `.t-meta`, one `.t-body` reconciling sentence
with three `.t-money` spans, the letterbox drawing with a plain `.t-meta` "Invoice" gloss, then the
`.consequence` sentence, then the terminal Pay act carrying the amount.

**One structural divergence, likely out of this lane's scope**: the specimen renders the owed figure /
due line / reconciling sentence and the letterbox drawing **inside one `<section>`** (a single visual
money block, `id="letterbox"`, with the figure and the drawing side by side in a `.money-grid`). The
built page keeps these as **two separate sections** — `house-ledger.tsx` (`id="ledger"`) and
`letterbox.tsx` (`id="letterbox"`), which the plan's global-constraints anchor list confirms are both
pre-existing, independently load-bearing ids (`#ledger` and `#letterbox` both appear in the "no anchor
id is renamed" list). Unifying them into one visual block was not asked of any Wave 2 lane that I can
find (H3 owns the `sections` mounting array; H6's file list keeps `house-ledger.tsx` and
`letterbox.tsx` as separate files). **P3, confidence medium** — flagging as a genuine as-built
divergence from the specimen for the record, not a defect in H6's execution of its own charter; if
Kody wants the specimen's single unified money block, that is a cross-lane structural change beyond
what any single Wave 2 lane was assigned.

## Copy strings pinned by tests

- `Open the letterbox` — unchanged, still asserted (`letterbox.test.tsx`, `door...` n/a). ✓.
- en-US → en-GB sweep — the two idioms (`legalDate`, `dayMonth`) are exactly the two the plan specifies,
  every swept test string is updated to the correct GB order, and the sweep is verifiably wider than
  the letter of the grep gate (money formatters correctly excluded, as discussed above).
- No other pinned string in the table falls in H6's files.

## Summary

The implementation is careful, well-tested, and honestly self-reported — the impl report's own
disclosures (the three currency formatters, the cross-lane `TERMINAL` cast, the whole-dollar vs. cents
deviation from the specimen, the untouched files) all checked out exactly as stated when I verified them
independently. I found two P2s (a literal gate line that does not pass, disclosed but not yet
sanctioned; a real test-coverage gap on `derive.ts`'s new fields) and several P3s (a legacy test
filename, borderline-scope test touches, one orphaned comment, one pre-existing accessibility note, one
structural specimen divergence outside this lane's charter). None of these are regressions, silent
scope creep, or house-sheet violations — the P2s are worth a fix-round entry before sign-off, but the
core PP-2/R140 behaviour is correctly built and correctly tested.

## Findings (severity, confidence)

1. **P2, high** — `grep -rn "en-US"` gate does not return zero (3 currency `Intl.NumberFormat` hits);
   justified and disclosed, but not yet explicitly sanctioned against the plan's literal gate text.
2. **P2, high** — `derive.ts`'s new `paidCents` / `owedInvoiceNumber` computation in `deriveThreshold()`
   has no assertion in `derive.test.ts`; only a hand-built `HouseLedgerModel` fed straight into the
   component is tested, not the derivation from real invoice rows.
3. **P3, high** — `door-acts.tsx` left an orphaned doc comment ("5 August...") above unrelated
   constants after removing the `DAY_MONTH` const it described.
4. **P3, high** — `instruments/__tests__/open-chapter.test.tsx` (touched) is not named in H6's file
   list; confirmed to be the (misnamed, pre-existing) test file for `spine-toll.tsx`/`tracking-row.tsx`,
   both of which are in-scope. Informational only.
5. **P3, medium** — `threshold.test.tsx` / `threshold-robustness.test.tsx` touched though
   `threshold.tsx` is owned by H3/H5; changes are narrow, necessary test maintenance with no scope
   creep. Flagging for integration-lane awareness.
6. **P3, medium** — the running page keeps the owed figure/reconcile sentence (`house-ledger.tsx`,
   `#ledger`) and the letterbox drawing/Pay act (`letterbox.tsx`, `#letterbox`) as two separate
   sections, where the specimen shows one unified money block. Pre-existing architecture, outside any
   single Wave 2 lane's assigned scope as far as I can tell from the plan.
7. **P3, medium** — SPEC §A6's "present in every state including unavailable" is not met by the
   Pay/consequence pairing (both are absent when `invoiceLink` hasn't resolved); pre-existing behaviour,
   not introduced or owned by this lane.

## Verdict

**needs-fix** — for findings #1 and #2 (P2s). Both are narrow: #1 needs an explicit ruling/note that the
three currency formatters are out of PP-2's scope (or, if Kody disagrees, a follow-up to re-locale
money), and #2 needs a small addition to `derive.test.ts` asserting the two new fields against a real
`deriveThreshold()` call. Neither requires touching the house-sheet-facing behaviour that is already
correctly built.
