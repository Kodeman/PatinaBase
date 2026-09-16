# Lane H8 review — the cents sweep on the Threshold (PP-2 / §F-B)

**Verdict: approve.** All six named call sites match the impl report claim-for-claim, all gates
independently reproduced, nothing outside `apps/client-portal` touched. One finding on the report's
own evidence trail (not the code) below — P3, not fix-blocking.

## What I checked and how

- `git -C /Users/kody/Code/patina-merged fetch origin` (needed `dangerouslyDisableSandbox`; the
  sandboxed network proxy refuses the SSH remote outright — "This proxy requires authentication").
- `git diff origin/main...origin/portal-polish/h8` — full diff, all six files, read in full.
- Independently ran, from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h8`:
  `pnpm --filter @patina/client-portal type-check`, `... test -- --coverage` (full run, not a
  subset), `... lint`.
- Ran my own `grep -rn "moneyInWords" apps/client-portal/src` (whole `src`, not just `threshold`).
- Traced `formatCurrency`'s implementation (`packages/shared/src/invoice/index.ts:87` —
  `Intl.NumberFormat('en-US', { style: 'currency', currency })`, which always renders 2 decimal
  places for USD/GBP) and independently opened `house-ledger.tsx` and `wall-gate.tsx` to check the
  report's contextual claim that they'd "already moved to cents."
- Read every changed line's surrounding sentence for grammar.
- Read `docs/design/house-sheet/SPEC.md` §F-B (the amended, canonical version at line 917, which
  supersedes the body text at line 143-148 per the doc's own precedence rule) and the Wave 2b ship
  report's "still divergent" list to confirm the six named sites are exactly this lane's brief.

**One process note:** my first pass read `house-ledger.tsx` and `wall-gate.tsx` from the plain
`/Users/kody/Code/patina-merged` checkout (not the worktree, not `origin/main`), which is a shared,
dirty working tree carrying unrelated uncommitted edits from other lanes/projects (per its `git
status` at session start) — it had `house-ledger.tsx` reverted to `moneyInWords`, which would have
been a false "the report's premise is wrong" finding. Re-reading via `git show origin/main:<path>`
and the h8 worktree itself showed both files correctly on `formatCurrency` throughout. Recorded here
so the false lead doesn't get re-walked: **never read money-formatting state from the bare
`patina-merged` directory** — always the worktree or `git show <ref>:<path>`.

## Diff verification — exact match

```
$ git diff --stat origin/main...origin/portal-polish/h8
 .../__tests__/road-orders.test.tsx       | 8 +++++---
 .../__tests__/scope-change-ask.test.tsx  | 4 ++--
 apps/client-portal/.../plan-key.tsx      | 5 +++--
 apps/client-portal/.../review-ask.tsx    | 4 ++--
 apps/client-portal/.../road-orders.tsx   | 6 +++---
 apps/client-portal/.../scope-change-ask.tsx | 8 ++++----
 6 files changed, 19 insertions(+), 16 deletions(-)
```

All six files are the exact six the report names, and all six sit under `apps/client-portal` — **no
file outside `apps/client-portal` changed**, confirmed by `git diff --name-only` against the full
repo, not a pre-filtered path.

Read line-by-line: every substitution is `moneyInWords(...)` → `formatCurrency(...)` (import swapped
accordingly, `plan-key.tsx` and `review-ask.tsx` dropping the now-unused `standing-sentence` import,
`road-orders.tsx`/`scope-change-ask.tsx` keeping their other named imports). No line does anything
else — no logic changed, no reordering, no incidental refactor. Matches the report's table in §1
exactly, at the exact line numbers claimed (106, 126, 164, 109, 139, 425, 514).

## Grammar of every changed sentence

Only the number token changed in each; sentence structure is untouched:

- `plan-key.tsx:106` — "Cedar Lane — Phase Work — $11,000.00, your name." / "Built-in shelving,
  north wall — $2,980.00, held back until you accept it." Grammatical before and after.
- `road-orders.tsx:126` — "Agreed · bought direct · $420.00" — a fragment list (by design, matches
  the rest of the component's caption style), not a sentence; fine.
- `road-orders.tsx:164` — "… · bought 2 July · $260.00" — same fragment style, fine.
- `scope-change-ask.tsx:109` (`signedClause`) — "$X additional FF&E budget" / "$X less FF&E
  budget" — fine, unaffected by the swap.
- `scope-change-ask.tsx:139` — "New project value: $95,000.00." — fine.
- `scope-change-ask.tsx:425` — "Mudroom · $4,500.00" — fine.
- `review-ask.tsx:514` — "… · $X" — fine.

No new grammatical fault, no dangling article, no double punctuation.

## Cents on every touched figure

`formatCurrency` (`packages/shared/src/invoice/index.ts:87`) is `Intl.NumberFormat('en-US', {
style: 'currency', currency }).format(cents / 100)` — for USD and GBP this always renders exactly
two decimal digits; there is no code path in any of the six call sites that can print a bare
integer dollar figure post-change. Confirmed by reading the diff (no site passes a
`maximumFractionDigits` override) and by the test assertions now pinning `.00` (below).

## The moneyInWords grep — reproduced and widened

Report's grep (`apps/client-portal/src/components/threshold`): zero hits in the six files,
confirmed. I widened it to the whole client-portal `src`:

```
$ grep -rln "moneyInWords" apps/client-portal/src
apps/client-portal/src/components/threshold/instruments/__tests__/standing-sentence.test.ts
apps/client-portal/src/components/threshold/instruments/standing-sentence.ts
apps/client-portal/src/lib/threshold/standing.ts
```

- `standing-sentence.ts` is the module `moneyInWords` is defined in; not asked to be removed. Its
  internal-only consumers `balanceClause`/`standingSubline` are traced (by the report) as dead
  exports outside their own tests — I independently confirmed no external caller of
  `standingSentence`/`standingSubline` exists (`grep -rn "standingSentence\|standingSubline"
  apps/client-portal/src` outside the module/tests returns nothing live). Correctly left alone.
- `lib/threshold/standing.ts:117` uses `moneyInWords` inside `hundredsInWords`, a deliberately
  *approximate* variance formatter ("about eleven hundred past its target") that falls back to
  `moneyInWords` only past a 12-hundred cutoff — this is not a "figure that should carry cents," by
  its own doc comment, and isn't one of the sites named by Wave 2b's "still divergent" list. Not a
  gap in this lane's sweep.
- `approval-ask.tsx`'s indirect use of `moneyInWords` via `approvalWeighing` (`standing-sentence.ts`
  lines 456/463-464/483-484) is real, live, and rendered (`approval-ask.tsx:351,1409` — confirmed by
  reading both call sites), and the report discloses it explicitly and accurately in §3/§6 as
  out-of-scope for this brief. This is the correct way to handle a same-shape gap found outside the
  named worklist: disclose, don't silently fix and don't silently ignore.

## Gates — independently reproduced

**Type-check** — clean, matches report:
```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(exit 0, no output)
```

**Tests, full run with coverage** — matches report exactly:
```
Test Suites: 143 passed, 143 total
Tests:       2427 passed, 2427 total
Snapshots:   1 passed, 1 total
All files  |  75.78 |  71.56 |  75.9 |  78.09 |
```
Clears the 70/60/70/70 floor on all four metrics; suite/test counts match the stated Wave 2b
baseline (143/2427) with zero drift, consistent with a lane that added no test files.

**Lint** — matches report exactly:
```
✖ 63 problems (11 errors, 52 warnings)
```
I extracted the file for every error line myself: `verify-otp/page.tsx`, `ClientPortalLogin.tsx`,
`proposal-document.tsx`, `approval-ask.tsx`, `use-aesthete-matches.ts`, `use-feature-flag.ts`,
`use-hydrated.ts`. **None of the six touched files appear.** Baseline unchanged.

**Prettier drift** — the report's claim that all six files were already Prettier-dirty before this
lane's edit is verifiable and true. I ran `git show origin/main:<path> | prettier --stdin-filepath
<path> --check` (i.e. the pre-edit content) for all four touched non-test files and got exit 1
(drift) on every one — the same as the post-edit files. Pre-existing, not introduced here.

## Test updates

- `road-orders.test.tsx` and `scope-change-ask.test.tsx`: I grepped both files for any remaining
  bare `$<digits>` (no `.00`) assertion — zero hits. Every whole-dollar assertion tied to a touched
  site was updated; nothing was missed.
- `plan-key-render.test.tsx`: confirmed correct as reported — its two assertions that touch
  `markSentence`'s rendered text (`toHaveTextContent('Shut')` / `'The library door'`, etc.) are
  substring matches on non-numeric text; no test pins a rendered money figure from this file.
- `review-ask.test.tsx` — **the report's claim here is not accurate.** It states: "the
  `clientPriceCents` fixtures (240000, etc.) are only asserted by presence of the room/item name,
  never by the rendered price string. No change needed." That's false for one test:
  `it("formats a price in the item's own currency, not a default USD", ...)` (line ~408-440) does
  assert the rendered price string directly: `expect(screen.getByText(/£2,400/)).toBeInTheDocument();`
  — this is exactly the `SelectionEditionAsk` item-price line this lane touched
  (`clientPriceCents: 240000, currency: "GBP"`). The suite run confirms it still passes post-change,
  but only because the regex is unanchored: `/£2,400/` matches `£2,400.00` as a substring just as it
  matched the old `£2,400`. The test was not strengthened to actually verify cents now print (e.g.
  `/£2,400\.00/`), and — because the regex would pass under either formatter — it would not have
  caught a regression back to whole pounds. This is a pre-existing test weakness (not introduced by
  this diff, and the test isn't broken), but the report's "checked; no change needed" line overstates
  what was actually checked: a test asserting the exact call site's rendered figure exists and was
  missed by the audit.

## Findings

| # | Severity | Confidence | Finding |
|---|---|---|---|
| 1 | P3 | High | `h8-impl.md` §2 states review-ask.test.tsx has no test asserting a rendered money string at the touched call site; one exists (`/£2,400/` in the GBP-currency test) and was missed. It still passes and isn't broken by this change, but wasn't tightened to actually prove cents now render (an unanchored regex matches both old and new format) — a documentation/report accuracy gap, not a code defect. No fix required for this lane's shipped diff; worth a one-line tightening (`/£2,400\.00/`) whenever that file is next touched. |

No P1 or P2 found. No correctness, scope, or grammar defect in the shipped diff.

## Recommendation

**Approve.** The six named sites are fixed correctly and completely, grammar is untouched, no
figure at any of the six sites can print without cents, nothing outside `apps/client-portal`
changed, all gates (type-check/tests/lint) reproduce exactly as reported and clear the stated
floor, and the lane's disclosed follow-up (`approval-ask.tsx`) is real, accurately scoped out, and
correctly not fixed here. The one finding above is a report-accuracy nit on an already-passing,
non-regressed test and does not block shipping this lane.
