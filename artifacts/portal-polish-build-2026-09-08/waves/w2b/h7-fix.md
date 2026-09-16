# Lane H7 — review fixes (Wave 2b)

**Branch** `portal-polish/h7` · **worktree**
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h7` ·
review applied: `artifacts/portal-polish-build-2026-09-08/waves/w2b/h7-review.md`.

Fix commit: `fix(client): address W2b review — h7` (on top of `c09be8283`).

---

## Findings, one by one

### H7-1 — P1 — **FIXED**

Two money figures on the Threshold still printed whole dollars through
`moneyInWords`. Both now spell through `formatCurrency` (`@patina/shared`,
`Intl.NumberFormat` `style: 'currency'`, always 2dp), the one speller the rest
of the wave uses.

**(a) `apps/client-portal/src/components/threshold/room-band.tsx`** — three
call sites, all of them:

| Line | Site | Was | Is |
|---|---|---|---|
| 402–404 | `lintelLedger()` two-figure clause | `${moneyInWords(band.agreedCents)} agreed against ${moneyInWords(band.targetCents)} planned` | `${formatCurrency(...)} agreed against ${formatCurrency(...)} planned` |
| 407 | `lintelLedger()` single-figure fallback | `${moneyInWords(band.agreedCents)} agreed` | `${formatCurrency(band.agreedCents)} agreed` |
| 498 | `PieceRecord()` line total | ` · ${moneyInWords(piece.clientLineTotalCents)}` | ` · ${formatCurrency(piece.clientLineTotalCents)}` |

`moneyInWords` was the file's only remaining use of that import, so it is
dropped from the `standing-sentence` import list and `formatCurrency` added
from `@patina/shared` (same import shape as `house-ledger.tsx:5`).

**(b) `apps/client-portal/src/lib/threshold/standing.ts`** — the doorstep
sentence's balance-open fallback (`thresholdStanding`, now line 97):

```ts
sentences.push(`A balance of ${formatCurrency(m.balanceCents)} stands open.`);
```

The reviewer is right that this is not "off the house page": `threshold.tsx:783`
calls `thresholdStanding(...)` and the string goes straight into
`<Doorstep sentence={standing}>` at `threshold.tsx:1184`. `doorstep.test.tsx`
(203, 217) was **already** pinning `A balance of $9,125.00 stands open.` as its
input fixture, so the doorstep's own tests had cents and the producer did not —
that mismatch is now closed. `doorstep.tsx:95`'s dim-anchor pattern
(`/a balance of \S+(?= stands open)/i`) matches the longer figure unchanged.

`moneyInWords` stays imported in `standing.ts` for `hundredsInWords` only (the
variance line — see the observation below). The module header comment, which
claimed money format is never restated here, is corrected to say why the
balance clause is now the exception.

**Tests updated / added (4 assertions changed, 1 test added):**

- `src/components/threshold/__tests__/room-band.test.tsx`
  - 143: `'$24,900.00 agreed against $23,800.00 planned — about eleven hundred past its target'`
  - 158: `'$24,900.00 agreed'`
  - 312: `'$2,340.00'`
- `src/lib/threshold/__tests__/standing.test.ts`
  - 60 and 79: `A balance of $9,125.00 stands open.`
  - **new** `'carries the cents of the balance it reports'` — `balanceCents:
    912_540` → `Nothing waits for your name. A balance of $9,125.40 stands
    open.` A `.00`-only assertion cannot tell `formatCurrency` from a
    `moneyInWords` that happened to be handed round dollars; a non-zero cents
    figure can.

Nothing in `tests/threshold.spec.ts` asserted either sentence (grepped for
`agreed against`, `room-band-lintel`, `room-band-record`, `room-band-ledger`,
`balance of`, `stands open` — no hits), so the e2e is unchanged by this fix.

### H7-2 — P4 — **no change** (as the finding directs)

`--hairline` gets no `.dark` override. The finding itself says no fix is
required from this lane: Wave 2's other four house-sheet tokens
(`--paper-doc`, `--rail`, `--ink-subtle`, `--sage-ink`) have no dark overrides
either, and adding one for `--hairline` alone would make the client's `.dark`
block inconsistent with the very pattern it follows. **A ruling on dark-mode
parity with §A1 is owed to a later wave**, and it should cover all five tokens
together, not one.

### H7-3 — P3 — **declined, with reason**

The finding's own `fix` field says "No fix required from this lane; a product
ruling is owed to the orchestrator." That is the reason it is declined here and
not merely deferred: the two candidate shapes are mutually exclusive and only
the orchestrator can pick.

- As seeded (single 100%-gated draw, 298000 cents), the fixture is legal — the
  INSERT runs while the proposal is still `draft`, so `guard_trade_scope_draws`
  (00423:608-628) returns early — and it produces the exact figure the
  specimen's sentence needs: `Accepting releases $2,980.00 to Marta Voss`, and
  the act `Accept the finished work · $2,980.00` (SPEC §F-C names that string
  verbatim).
- The alternative (deposit + smaller gated draw) would satisfy
  `send_trade_scope`'s "the first draw is billed at signature, so it must not
  be the acceptance-gated one" (00423:1679-1686) but changes the released
  figure, which breaks both the specimen string and the e2e assertion this lane
  added.

Changing the fixture to the RPC-legal shape is therefore a product decision
about what the house page should show, not a defect fix, and it is out of a
review-application lane's scope to make it.

### H7-4 — P4 — **no change; flagged to the integration lane**

`tests/threshold.spec.ts` and `pnpm supabase:reset` remain unrun, by the brief:
Wave 3 owns the local database and port 3000 until
`artifacts/portal-polish-build-2026-09-08/ship/w3-ship.md` exists, which it does
not.

> **Integration lane:** run `pnpm supabase:reset`, then
> `apps/client-portal/tests/threshold.spec.ts`. That is the only step that
> proves the seeded gating draw (item 8) and the updated e2e assertions
> (`AUTHORIZATION_TOTAL`, `HELD_DRAW`, `INVOICE_BALANCE`, the legal dates, and
> `· $2,980.00` on the wall act) together.

---

## One thing the review did not flag — for the orchestrator

`apps/client-portal/src/components/threshold/plan-key.tsx:106` (`markSentence`)
still prints `moneyInWords(mark.amountCents)`, and `PlanKey` renders **on the
house page** — it is the `#key` section. The H7 implementation report listed
`plan-key.tsx` among the surfaces "off the house page" and the review accepted
that exclusion list while flagging only `room-band.tsx` and `standing.ts`, so a
door mark's key entry can read `Cedar Lane shelving — $2,980, your name.` a
scroll below a ledger reading `$2,980.00`. That is the same §F-B fault the P1
names, but it is not in any finding, so this lane has **not** changed it rather
than widen its own scope. It wants either a Wave 3 fix or an explicit ruling.

A second, smaller one, deliberately left alone: `standing.ts`'s
`hundredsInWords` (line 117) falls back to `moneyInWords` past twelve hundred,
so a room more than $1,200 over target reads `about $1,300 past its target`
inside a sentence that now begins `$24,900.00 agreed against …`. Cents on a
figure the code has just rounded to the nearest hundred would be a false
precision, so the right answer here is probably *not* `formatCurrency`. No
change made; noted so it is a choice rather than an oversight.

---

## Gate (re-run in the worktree after the fix)

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit                                        (exit 0, no output)

$ pnpm --filter @patina/client-portal test -- --coverage
All files    |   75.78 |    71.56 |   75.91 |   78.09 |
Test Suites: 143 passed, 143 total
Tests:       2427 passed, 2427 total
Snapshots:   1 passed, 1 total

$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```

- Coverage floor **70/60/70/70** (`jest.config.js:71-78`) — every metric clears
  it. Statements/lines tick up a hundredth from the review's `75.77 / 78.08`;
  branches and functions are unmoved.
- **2427 tests, up one** from the review's 2426 — the new
  `thresholdStanding` cents case. No suite lost (143 both sides).
- Lint is the Wave 2 baseline **unchanged**: 63 problems, 11 errors, 52
  warnings, the same count the ship report and the review both record. No new
  lint debt; none of the 11 errors is in a file this fix touched.
- Not run, by the brief: `pnpm supabase:reset` and Playwright (see H7-4).

## Files changed

```
apps/client-portal/src/components/threshold/room-band.tsx                  |  8 ++++----
apps/client-portal/src/components/threshold/__tests__/room-band.test.tsx   |  6 +++---
apps/client-portal/src/lib/threshold/standing.ts                           | 18 +++++++++++++-----
apps/client-portal/src/lib/threshold/__tests__/standing.test.ts            | 10 ++++++++--
```

Nothing outside `apps/client-portal/src`. No migration, no edge function, no
`wrangler.jsonc`, no `packages/**`, no seed change — **Strata untouched**.
