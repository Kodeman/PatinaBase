# Lane H6 fix round — review response

**Branch** `portal-polish/h6` → pushed, remote head `bd5b573a785cab0e7629f963bf1fc79c75ed3953`
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h6`
**Fix commit** `bd5b573a7` — `fix(client): address W2 review — h6`
**Base (the head the review read)** `b287bac26`

**Fix diff** (`git diff --stat b287bac26..bd5b573a7`) — 2 files, +46 / −2:

```
 apps/client-portal/src/components/threshold/door-acts.tsx         |  2 -
 apps/client-portal/src/lib/threshold/__tests__/derive.test.ts     | 46 ++++++++++++
```

Both files are inside the lane's list (`door-acts.tsx` is named explicitly; `derive.test.ts` is
`derive.ts`'s test, covered by the list's "…plus every touched file's test").
Branch total against `origin/main` is now **33 files, +636 / −245**.

---

## Findings

### H6-1 (P2, high) — no code change; escalated with the ruling text that settles it

**Claim.** The plan's literal gate `grep -rn "en-US" … # expect zero` does not pass — three
`Intl.NumberFormat('en-US', { style: 'currency' })` currency formatters remain.

**Disposition.** No code change, and I am not editing the plan (a shared, cross-lane document not in
this lane's file list). The finding's own remedy is a ruling, not a diff: *"No code change needed if
sanctioned."* Escalating to the integration lane / Kody, with the evidence that decides it.

**The ruling PP-2 actually says** (`artifacts/portal-polish-review-2026-09-08/rulings.md:8`, quoted
in full for the deciding words):

> …15px floor in sentence case for money, dates, party names and consequence sentences in body
> content; running heads and captions stay 11–12px metadata; **one family for money (DM Mono
> tabular)**; the owed figure outranks the agreed figure (Playfair 26); **one date style "11
> September 2026"**.

PP-2 governs money's *typographic family* and dates' *style*. It says nothing about money's locale.
The three surviving hits are money spellers, and `en-GB` on a USD amount prints `US$4,060.00` to a
US homeowner — a real re-print, not a cosmetic one. So the literal grep is a proxy that over-reaches
its own ruling.

**Substitute gate, which does pass** — no `en-US` *date* formatter survives anywhere in scope:

```
$ grep -rn "Intl.DateTimeFormat" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold
components/threshold/details-sheet.tsx:421  Intl.DateTimeFormat().resolvedOptions().timeZone
components/threshold/approval-ask.tsx:54    new Intl.DateTimeFormat('en-GB', {
lib/threshold/dates.ts:9                    (a comment)
lib/threshold/dates.ts:40                   const LEGAL_DATE = new Intl.DateTimeFormat('en-GB', {
lib/threshold/dates.ts:51                   export const DAY_MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', {
lib/threshold/dates.ts:61                   export const MONTH_NAME_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long' })
```

`details-sheet.tsx:421` resolves a time zone and formats nothing; `approval-ask.tsx:54`
(`LETTER_DATE`) is already `en-GB` and is a day + month + hour + minute timestamp, not one of the two
idioms — routing it through `dayMonth` would drop the time. Every other construction is inside
`dates.ts`. Zero `en-US` date formatters remain.

**Recommended gate correction for the plan** (for whoever owns it):

```
grep -rn "Intl.DateTimeFormat" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold \
  | grep -v "src/lib/threshold/dates.ts"   # expect only approval-ask LETTER_DATE and details-sheet's timeZone probe
```

If Kody rules the other way — that money must also be locale-swept — that is a change to three call
sites (`approval-ask.tsx:154` `moneyExact`, `instruments/tracking-row.tsx:81`,
`instruments/standing-sentence.ts:210` `moneyInWords`) plus their pinned-string tests, and it changes
what the page prints. It is not this fix round.

### H6-2 (P2, high) — FIXED

**Claim.** `derive.ts`'s new `HouseLedgerModel.paidCents` and `owedInvoiceNumber`, and their real
computation inside `deriveThreshold()`, have zero assertions in `derive.test.ts`; only a hand-built
model fed to `<HouseLedger>` was tested, so a wrong sum or a wrongly-picked invoice would pass.

**Fix.** Added assertions to `derive.test.ts`'s existing
`describe('deriveThreshold — what is owed across every open invoice')` block — two existing tests
extended, three new ones. All exercise the real `deriveThreshold()` call over real invoice rows:

- `sums the balances and still opens only the soonest-due one` — `+ paidCents === 912_500`
  (Σ paid across the two open letters), `+ owedInvoiceNumber === null` (two open, so no letter may be
  named).
- `counts nothing when nothing is open` — `+ paidCents === null`, `+ owedInvoiceNumber === null`.
- **new** `names the one open letter and what has been paid against it` — one numbered open invoice:
  `owedInvoiceNumber === 'INV-4'`, `paidCents === 912_500`, `owedCents === 912_500`.
- **new** `names no letter when the one open letter carries no number` — a whitespace-only
  `invoice_number` (pins the `.trim() || null` branch): `owedInvoiceNumber === null`,
  `paidCents === 100_000` (a value distinct from that invoice's `400_000` outstanding, so the
  assertion cannot pass against the wrong rollup field).
- **new** `counts no payment from a letter that is already settled` — a `paid` invoice alongside the
  open one: `paidCents === 912_500` (the settled letter's `300_000` is excluded), `owedInvoiceCount
  === 1`, `owedInvoiceNumber === 'INV-4'`. This pins the deliberate semantic the reconciling sentence
  depends on — "$X paid" counts only what has been paid against the letters *still open*, because it
  reconciles the owed figure standing above it.

**Mutation check** (both mutations applied together, `derive.ts` restored afterwards — `git diff
--stat` on it is empty and the branch diff is unchanged):

```
$ # paidCents: openRollup.paidCents  ->  openRollup.outstandingCents
$ # owedInvoiceNumber: length === 1 ? [0].invoice_number : null  ->  [0]?.invoice_number
$ npx jest src/lib/threshold/__tests__/derive.test.ts
  ✕ sums the balances and still opens only the soonest-due one (1 ms)
  ✕ names no letter when the one open letter carries no number
Tests:       2 failed, 86 passed, 88 total
```

Before the fix these mutations were silent. The suite now has 88 tests (was 85).

### H6-3 (P3, high) — FIXED

**Claim.** `door-acts.tsx` kept the orphaned doc comment `/** "5 August" — the deck's own date idiom,
as the door itself dates things. */` above `REASON_MAX`/`FEEDBACK_MAX`/`QUESTION_MAX` after the sweep
removed the `DAY_MONTH` const it described.

**Fix.** Deleted the comment line and its trailing blank line. The block comment above it (the
"ASKING IS A LETTER, NOT A ROUTE" note) is unrelated and untouched; the constants now follow it
directly.

### H6-4 (P3, high) — declined; informational, as the finding itself states

`instruments/__tests__/open-chapter.test.tsx` is the (legacy-misnamed) suite for `SpineToll` and
`TrackingRow`, both in H6's `instruments/{spine-toll,…,tracking-row}` group. The finding's own fix
field reads "No fix needed". Renaming the file would be an unrequested change touching a file whose
name other lanes and the integration merge may reference.

### H6-5 (P3, medium) — declined; flagged for the integration lane, per the finding

`threshold.test.tsx` / `threshold-robustness.test.tsx` carry date-string and testid corrections that
H6's own changes to `house-ledger.tsx` / `letterbox.tsx` made necessary — without them the suite goes
red. The finding's fix field reads "No code fix; flag for integration-lane merge-order awareness."

**Integration lane, note:** hunks in those two test files on `portal-polish/h6` come from **H6**, not
H3/H5. They are string/testid corrections only — no assertion of substance was added or removed.
`threshold.tsx` itself is untouched by this branch (`git diff origin/main..HEAD --
apps/client-portal/src/components/threshold/threshold.tsx` is empty).

### H6-6 (P3, medium) — declined; out of scope, as the finding states

The specimen's single `<section class="money" id="letterbox">` vs. the built page's two sections
(`house-ledger.tsx` `#ledger`, `letterbox.tsx` `#letterbox`). Both ids are on the plan's "no anchor id
is renamed" list; unifying them is a cross-lane structural change assigned to no Wave 2 lane. The
finding's fix field: "Out of scope for H6."

### H6-7 (P3, medium) — declined; pre-existing, not this lane's

SPEC §A6's "present in every state including unavailable" vs. `letterbox.tsx` rendering the
consequence sentence and Pay act only when `invoiceLink` is truthy. The identical `invoiceLink &&`
gate wrapped the old `variant="primary"` act on `origin/main`; H6 changed the act's variant and label,
not its condition. An explicit unavailable-Pay state is new behaviour needing a ruling (and H4's
unavailable-terminal styling), not a fix to this diff. The finding's fix field: "Not this lane's fix."

---

## Gate — re-run after the fix, real output

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h6/apps/client-portal type-check
> @patina/client-portal@0.1.0 type-check
> tsc --noEmit
(no output, exit 0)

$ npx jest src/components/threshold src/lib/threshold      (from apps/client-portal)
Test Suites: 54 passed, 54 total
Tests:       1310 passed, 1310 total
Snapshots:   0 total
Time:        11.544 s

$ npx eslint src/components/threshold src/lib/threshold    (from apps/client-portal)
  approval-ask.tsx:1079:7  error    react-hooks/set-state-in-effect
  instruments/tracking-row.tsx:104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)

$ grep -rn "en-US" apps/client-portal/src/components/threshold apps/client-portal/src/lib/threshold
components/threshold/approval-ask.tsx:154  new Intl.NumberFormat('en-US', { style: 'currency', currency })
components/threshold/instruments/tracking-row.tsx:81  new Intl.NumberFormat('en-US', {
components/threshold/instruments/standing-sentence.ts:210  new Intl.NumberFormat('en-US', {
```

Test count 1307 → **1310** (the three new `it` blocks; the two extended tests added assertions, not
tests). Type-check clean. The **same two** eslint problems as the review found, both pre-existing and
outside this branch's diff — the count did not grow; neither file I touched in this round is either of
them.

The `en-US` grep is unchanged from the review's run — three currency formatters, zero date formatters:
finding **H6-1, awaiting a ruling** (above).

## Prettier

The pre-commit hook warns of formatting drift in both files I touched. It is **pre-existing**, not
introduced here — the same two files fail `prettier --check` at `origin/main`:

```
$ git show origin/main:…/door-acts.tsx > $TMPDIR/da.tsx; git show origin/main:…/derive.test.ts > $TMPDIR/dt.ts
$ npx prettier --check $TMPDIR/da.tsx $TMPDIR/dt.ts
[warn] da.tsx
[warn] dt.ts
```

Running `prettier --write` would reformat hundreds of unrelated lines in two shared files mid-wave and
wreck the integration merge. Not done.

## What I did not do

- Did not change the three currency formatters' locale (H6-1) — it would print `US$4,060.00`.
- Did not edit `docs/superpowers/plans/2026-09-08-portal-polish-build.md` — a shared cross-lane
  document, not in this lane's file list. The recommended gate correction is written above instead.
- Did not touch `house-ledger.tsx`, `letterbox.tsx`, `derive.ts`, `standing.ts`, `dates.ts` or any
  other lane file — no finding asked for a behaviour change, and the fix round added only test
  coverage plus one comment deletion.
- Did not rename `open-chapter.test.tsx`, unify the two money sections, or add an unavailable-Pay
  state.
- No dev server, no DB reset, no deploy, no full-portal `pnpm test` run (the plan's H6 gate is the
  scoped path filter above).
