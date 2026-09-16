# Lane H8 — the cents sweep on the Threshold (PP-2 / §F-B)

**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h8`
**Branch:** `portal-polish/h8` — pushed, head `726e58820`
**Base:** `origin/main` at cut time (`a037cffd6` — "docs(portal-polish): W2b ship report, program report, and the house renders")

## 1 · What changed

Wave 2b's "still divergent" list (§8 owed, `waves/w2b/h7-rereview.md` P2, and H7's own
disclosure) named six money-in-prose call sites across four files on the Threshold, all still
using `moneyInWords` (whole-dollar `Intl.NumberFormat`) after the house ledger, wall gate, tracking
row, and letterbox had already moved to cents. §F-B (`docs/design/house-sheet/SPEC.md`): "Every
money block has exactly one announced figure at `.t-d2`... All other figures in that block are
`.t-money`" — DM Mono, `tabular-nums`, i.e. the cents formatter, not `moneyInWords`. Each of the six
sites now calls `formatCurrency` from `@patina/shared` (the same helper `house-ledger.tsx` already
uses), replacing `moneyInWords` import-for-import where it was the only remaining consumer in the
file:

| File | Line(s) | Sentence |
|---|---|---|
| `plan-key.tsx` | 106 | `markSentence` — "Cedar Lane — Phase Work — $11,000.00, your name." / "Built-in shelving, north wall — $2,980.00, held back until you accept it." |
| `road-orders.tsx` | 126 | the open order line — "Agreed · bought direct · $420.00" |
| `road-orders.tsx` | 164 | the closed/no-longer-coming order line — "… · bought 2 July · $260.00" |
| `scope-change-ask.tsx` | 109 | `signedClause` — "$X additional/less FF&E budget" / "design fee" |
| `scope-change-ask.tsx` | 139 | `impactLine`'s new-total sentence — "New project value: $95,000.00." |
| `scope-change-ask.tsx` | 425 | `NewRooms` — "Mudroom · $4,500.00" |
| `review-ask.tsx` | 514 | the selection-edition item price — "… · $X" |

`plan-key.tsx` and `review-ask.tsx` each dropped their now-unused `moneyInWords` import and gained
`import { formatCurrency } from '@patina/shared'`; `road-orders.tsx` and `scope-change-ask.tsx` kept
their other named imports from `standing-sentence` (`moneyInWords` was the only one removed from
`scope-change-ask.tsx`'s import list; `road-orders.tsx` had no other name from that module to keep).

Grammar was left untouched — only the figure format changed, per the brief ("keeping sentence
grammar intact").

## 2 · Test strings updated

Two test files pinned whole-dollar figures at these sites and needed updating; two did not:

- `__tests__/road-orders.test.tsx` — `$420` → `$420.00`, `$1,800` → `$1,800.00`, `$260` → `$260.00`
  (3 assertions, lines 93/95/191 after edit).
- `__tests__/scope-change-ask.test.tsx` — `"Mudroom · $4,500"` → `"Mudroom · $4,500.00"`;
  `/New project value: \$95,000\./` → `/New project value: \$95,000\.00\./`.
- `plan-key-render.test.tsx` — checked; no test asserts a formatted money string from
  `markSentence` (the one test that touches the sentence uses `amountCents: 0`, which never renders
  a figure). No change needed.
- `review-ask.test.tsx` — checked; the `clientPriceCents` fixtures (240000, etc.) are only asserted
  by presence of the room/item name, never by the rendered price string. No change needed.

## 3 · The grep sweep — what's left, and why

```
$ grep -rn "moneyInWords" apps/client-portal/src/components/threshold
```

Zero hits in the six files named by the brief. The function itself (`standing-sentence.ts:208`) and
its own unit tests remain — expected, since it's the module the four consumer files imported it
from and the brief did not ask for its removal. Its remaining **consumers** are all internal to
`standing-sentence.ts`:

- `balanceClause` (`:314`, used only by `standingSentence`) and `standingSubline` (`:389`) — I
  traced every call site of `standingSentence`/`standingSubline` outside the module and its own
  tests: **there are none**. `doorstep.tsx:85` only *mentions* `standingSentence` in a comment. These
  two exported functions are currently dead code in the app — not rendered anywhere on the
  Threshold, so not a live divergence today, but I did not touch them: they weren't named in the
  brief and removing/rewiring dead exports wasn't asked for.
- `costClause`/`scheduleClause`/`leadTimeClause`/`signedMoney` (`:456,463-464,483-484`), reached
  through the exported `approvalWeighing`, **are** live: `approval-ask.tsx:351` and `:1409` call
  `approvalWeighing` and render both its prose sentence ("$46,880 becomes $48,120…") and its mono
  ledger ("Cost +$1,240 · Schedule 0 days"). This *is* a real, still-standing whole-dollar
  money-in-prose surface on the Threshold, and it is not in the "zero" the brief's grep asks for.

**I did not fix `approval-ask.tsx`.** It was not one of the four files or six line numbers the
brief named, it wasn't on Wave 2b's "still divergent" list, and the brief's instruction is to
"finish the cents sweep" at the six named sites, not to audit every `moneyInWords` caller in the
package — Sonnet briefs are meant to be followed literally rather than generalized. Flagging it here
per the brief's own fallback ("any remaining consumer must be either the /pay page ... or justified
in your report"): `approval-ask.tsx`'s use of `moneyInWords` via `approvalWeighing` is a genuine gap
of the same shape as this lane's, and is the next thing a "money in prose" ruling (the open question
Wave 2b's owed list raised) should close.

The only other consumer is `/pay/[token]`'s own surfaces — out of scope by the brief's own words —
and `standing-sentence.test.ts`, which tests `moneyInWords` itself and is untouched.

## 4 · Gates

**Type-check** — clean:
```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(exit 0, no output)
```

**Tests (full, with coverage)** — all green, coverage unchanged from the Wave 2b baseline:
```
$ pnpm --filter @patina/client-portal test -- --coverage
...
All files                                    |   75.78 |    71.56 |    75.9 |   78.09 |
Test Suites: 143 passed, 143 total
Tests:       2427 passed, 2427 total
Snapshots:   1 passed, 1 total
```
Floor is 70/60/70/70 — all four metrics clear it, identical to the Wave 2b figure (this lane added
no test files, only edited assertions in place). Suite/test counts match the stated baseline
(143 / 2427) exactly — no drift.

**Lint** — unchanged from the stated 11-error baseline:
```
$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```
None of the 11 errors are in a file this lane touched (`plan-key.tsx`, `road-orders.tsx`,
`scope-change-ask.tsx`, `review-ask.tsx`, and the two test files do not appear in the lint error
listing at all — confirmed by grepping the lint output for touched paths).

**Formatting note.** The commit-msg hook flagged all six touched files with a Prettier drift
warning ("advisory locally"). Checked before assuming it was mine: running `prettier --check` on
each file's **pre-edit** content (`git show HEAD~1:<path> | prettier --stdin-filepath`) already
fails identically — this is pre-existing repo-wide drift on these files, not something introduced
by this lane's edits, and the hook itself only warns rather than blocks.

## 5 · Commit / push

```
726e58820 fix(client): cents on the plan key, the road and the asks (PP-2)
 6 files changed, 19 insertions(+), 16 deletions(-)
```
Files: `plan-key.tsx`, `road-orders.tsx`, `scope-change-ask.tsx`, `review-ask.tsx`,
`__tests__/road-orders.test.tsx`, `__tests__/scope-change-ask.test.tsx` — exactly the six files
touched, staged with explicit pathspecs (no `git add -A`).

```
$ git push origin portal-polish/h8
 * [new branch]          portal-polish/h8 -> portal-polish/h8
$ git ls-remote origin portal-polish/h8
726e588202b35d0557440030bec3b1e04928bd87	refs/heads/portal-polish/h8
```

`main` was never touched; all git operations besides the initial `fetch`/`worktree add` (run against
the parent checkout, per the setup step) ran inside the worktree.

## 6 · Owed / follow-up

- **`approval-ask.tsx`'s `approvalWeighing` sentence and ledger still print whole dollars** (see §3)
  — same fault class, not in this lane's named scope, needs its own pass or an explicit ruling that
  folds it into "the register" question Wave 2b already opened.
- **`standingSentence`/`standingSubline`** are unreferenced outside their own tests — worth a
  separate note to whoever owns dead-export cleanup; left alone here since removing them wasn't
  asked and wasn't part of the cents sweep.
