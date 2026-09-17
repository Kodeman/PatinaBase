# Lane H7 re-review (Wave 2b — house page follow-ups)

**Re-reviewer** — did not implement, did not do the first review. Read `h7-impl.md`,
`h7-review.md`, `h7-fix.md`, and the nine items quoted in the implementer's own report.

**Diff inspected:** `git -C /Users/kody/Code/patina-merged fetch origin && git -C
/Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h7` (38 files,
+955/−247 — the fix round added `h7-fix.md` and the four files it touched on top of the
36-file diff `h7-review.md` inspected). `git fetch origin` failed once inside the sandbox
(`This proxy requires authentication…`) — a sandbox network restriction, not a repo problem;
re-run with the sandbox disabled succeeded.

**Gates re-run independently**, a third time, in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h7` (HEAD `09c7e1100`, confirmed via
`git rev-parse --show-toplevel` that this is the lane's own worktree, not the main checkout):

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

All three numbers match `h7-fix.md` exactly. Coverage clears the 70/60/70/70 floor
(`jest.config.js:71-78`). Lint is the Wave 2 baseline unchanged (11 errors / 52 warnings) — no
new lint debt from the fix round.

**Scope.** `git diff --name-only origin/main...origin/portal-polish/h7` touches only
`apps/client-portal/**`, `supabase/seed/the-client-page.sql`, and the lane's own reports under
`artifacts/portal-polish-build-2026-09-08/waves/w2b/`. Nothing under `supabase/migrations/`,
no edge function, no `wrangler.jsonc`, no `packages/**` — confirmed by `git diff --stat` against
those paths returning only the one seed file. **Strata is untouched**, confirmed by absence in
the diff, not by the report's say-so.

**`--hairline`.** `docs/design/house-sheet/SPEC.md:47` reads `--hairline: #E8E3DB;` verbatim.
The client's `apps/client-portal/src/app/globals.css:87` reads `--hairline: #E8E3DB;` — an exact
match, a literal (not `var(--rail)`, which shares the hex but is the wrong token per §A10; not
`var(--border-default)`, which is `#E5E2DD`). Correct.

**Anchor ids.** Grepped `threshold.tsx` and its siblings for all eleven load-bearing ids
(`doorstep key letterbox wall door road note previously mat mat-papers ledger`) — every one
still exists. `git diff` on `threshold.tsx` touches no `id=` or `href="#"` line. None renamed.

**The seed (item 8).** Confirmed in the current diff: the `trade_scope_draws` INSERT (one row,
298000 cents, 100%, `gates_on_acceptance = TRUE`, `sort_order 0`) runs strictly before the
`UPDATE … SET status = 'accepted'` a few lines below it, so `guard_trade_scope_draws`'s
early-return-on-draft applies and the insert is legal. No migration touched. Matches the report.

---

## The nine items — spot-verified against the live diff, not just the reports

| # | Item | Verdict |
|---|---|---|
| 1 | Note signature | **Confirmed in code.** `threshold.tsx:1133-1134` passes `authorName={leadDesignerName ?? studioName}` and `studioName={studioName}`; `the-note.tsx`'s `signatureOf` drops the studio segment when `studio === name`. |
| 2 | Cents (PP-2/§F-B) | **Incomplete — see Finding 1 below.** The review's own Finding 1 (room-band.tsx, standing.ts) was fixed and verified in code (`formatCurrency` at `room-band.tsx:402-407,498` and `standing.ts:97`). But the fix round did not close the category — three more files render money without cents on the same page. |
| 3 | Legal dates | **Confirmed by spot check**, consistent with the prior review's tracing. No new date regression found in the fix round's four changed files. |
| 4 | `--hairline` | **Confirmed**, exact hex match against `docs/design/house-sheet/SPEC.md:47`. |
| 5 | Story-pole `short` + held tick | **Confirmed in code.** `story-pole.tsx:121` (`short: string` required field), `:182` (bar uses it), `:274-275` (`w-[9px]` on both tick states, replacing `w-5`/`-left-4`'s 4px overrun). |
| 6 | `key` gating | **Confirmed.** `threshold.tsx:1342`'s `...(roomsUnread ? [] : [...])` predates this lane (not in the diff); the new test exercising the `isError` path is present. |
| 7 | Unread Pay tokens | **Confirmed.** `invoice-sheet.tsx` carries no reference to `--pay-act-bg`/`-fg`/`-bg-hover` outside a comment explaining their removal; only the `data-testid="pay-act"` string remains. |
| 8 | Seeded gating draw | **Confirmed local-seed-only**, as above. The item-8 ruling (single 100%-gated draw vs. `send_trade_scope`'s "first draw can't gate" rule) is correctly left open for the orchestrator — a review-application lane cannot pick between two mutually-exclusive fixture shapes on its own authority, and h7-fix.md says so plainly rather than picking one quietly. |
| 9 | "Leave the house" → "Sign out" | **Confirmed.** `ProjectsEmptyState.tsx:66` reads "Sign out"; `grep -rn "Leave the house" apps/client-portal/src` returns nothing. |

---

## Findings

### Finding 1 — P2 (three more money figures on the Threshold still print without cents — the fix round closed two instances of this bug but not the category)

**Confidence: high** (confirmed by reading the live component code at the exact call sites, by
tracing each component's mount point in `threshold.tsx`, and by unmodified test files that still
pin whole-dollar strings against them).

The first review (Finding 1) correctly caught two files the original report had misclassified as
"off the house page" — `room-band.tsx` and `standing.ts`. Both are fixed now. But the same
misclassification survives, uncaught, for three more files the *original* report's exclusion
list names in the same breath as the two that got fixed:

> "the surfaces off the house page that still use `moneyInWords` — `plan-key.tsx`,
> `road-orders.tsx`, `scope-change-ask.tsx`, `review-ask.tsx`, `standing.ts`'s standing
> sentence, `standing-sentence.ts` itself."

`standing.ts` and `room-band.tsx` (not even in that list, but caught by the review anyway) got
fixed. `plan-key.tsx` was at least *disclosed* by `h7-fix.md` itself ("One thing the review did
not flag… wants either a Wave 3 fix or an explicit ruling") — a correct, honest deferral. But
`road-orders.tsx`, `scope-change-ask.tsx`, and `review-ask.tsx` are asserted "off the house page"
and never revisited by either the review or the fix, and that assertion is false: all three
mount unconditionally inside `threshold.tsx`'s own returned JSX.

**`road-orders.tsx`** — `threshold.tsx:59,1104,1109-1112` imports `toRoadOrders`, computes
`roadOrders`, and renders `<RoadOrders orders={roadOrders} …>` whenever there is anything to
show. This is the `#road` section (the client's directly-bought pieces). Two live call sites
still spell whole dollars:
- `road-orders.tsx:126` — `` `${stage} · ${...} · ${moneyInWords(order.amountCents, order.currency)}` `` (each in-flight order's line)
- `road-orders.tsx:164` — the same idiom for closed (refunded/cancelled) orders

`road-orders.test.tsx` (untouched by this lane) still asserts `'Agreed · bought direct · $420'`
(:93), `'In transit · bought direct · 2 of them · $1,800'` (:94), and
`'Ceramic table lamp · Refunded · bought 2 July · $260'` (:189) — proof the whole-dollar path is
live and unchanged.

**`scope-change-ask.tsx`** — `threshold.tsx:1254` renders `<PendingScopeChangeAsk
projectId={projectId} />` unconditionally (it mounts and renders nothing internally only when
there is no pending request). Three live call sites still spell whole dollars:
- `scope-change-ask.tsx:109` — the requested delta amount
- `scope-change-ask.tsx:139` — `` ` New project value: ${moneyInWords(total)}.` ``
- `scope-change-ask.tsx:425` — `` `${room.name} · ${moneyInWords(room.budgetCents)}` `` (a room budget line inside the ask)

`scope-change-ask.test.tsx` still asserts `"Mudroom · $4,500"` (:373) and
`New project value: $95,000.` (:412) — same proof.

**`review-ask.tsx`** — `threshold.tsx:1252` renders `<StudioReviewAsk projectId={projectId}
standsUnfiled={standsUnfiledAsks} />` unconditionally. `review-ask.tsx:514` still spells
`` ` · ${moneyInWords(item.clientPriceCents, item.currency)}` `` on each item line inside the ask.

All three are the exact §F-B fault the review's own Finding 1 named and this lane's
`house-ledger.tsx` comment ("EVERY FIGURE CARRIES ITS CENTS") was written to eliminate: a client
can see `$4,060.00` in the ledger and, in the same page, `$4,500` or `$420` in a road order or a
scope-change ask a scroll away.

**Why P2, not P1 (unlike the prior review's identical-shaped finding).** The prior review's
Finding 1 sat on `room-band.tsx` and `standing.ts`, both rendered on *every* client's page at
rest (the room bands and the doorstep sentence are structural). These three additional
instances are conditional — a road order only shows once the client has bought something direct,
a scope-change ask only shows once one is pending, a review ask only once one is open — so they
are less certain to be visible on any given page load, and none of them is the headline/ledger
figure the spec's worked example calls out. Still a real, confirmed §F-B violation wherever it
renders, still worth a fix in the same pass that already fixed the other two, so **P2, needs-fix**
rather than P1.

**Fix:** swap `moneyInWords` → `formatCurrency` at the four call sites above
(`road-orders.tsx:126,164`; `scope-change-ask.tsx:109,139,425`; `review-ask.tsx:514`), following
the same pattern the fix round already applied to `room-band.tsx`/`standing.ts`, and update the
three now-stale test files (`road-orders.test.tsx:93,94,189`; `scope-change-ask.test.tsx:373,412`
and any other pinned figures in that file; `review-ask.test.tsx` if it pins a figure — it did not
appear to on inspection, worth double-checking when the fix lands). `plan-key.tsx` remains a
known, disclosed gap per `h7-fix.md` — not re-raised here since it is already surfaced and
awaiting a ruling, but note it belongs to the same cleanup pass as these four call sites if one
is ever done.

### Finding 2 — informational, no fix needed

`h7-review.md`'s Finding 2 (`--hairline` has no `.dark` override) and Finding 3 (item 8's product-
rule tension) were both correctly left unresolved by `h7-fix.md` with reasons given — a "no dark
override for any of H2's five tokens, don't single one out" pattern-consistency argument for
Finding 2, and a "the two candidate fixture shapes are mutually exclusive, only the orchestrator
can pick" argument for Finding 3. Both stand as read; nothing to add.

### Finding 3 — informational

`h7-review.md`'s Finding 4 (the e2e is unexecuted, correctly, per Wave 3's ownership of the local
database) is unchanged by the fix round — `h7-fix.md` re-confirms `tests/threshold.spec.ts` was
grepped for the two sentences the fix touched (`agreed against`, `balance of` etc.) and found no
hits, so the e2e is not stale from this fix. Still owed to the integration lane exactly as both
prior reports say.

### Finding 4 — informational, verifying the review-application discipline

`h7-fix.md` handled the prior review's four numbered findings correctly as a set: fixed the one
P1 with tests, declined two with stated reasons (a pattern-consistency call and an
orchestrator-only decision), and flagged one more as unrun-by-design. That discipline is sound;
Finding 1 above is a gap *within* the same review's own P1 category that neither the review nor
the fix caught, not a criticism of how the fix handled what it did catch.

---

## Verdict

**needs-fix** — one P2 (Finding 1): three more files render money on the Threshold without
cents (`road-orders.tsx`, `scope-change-ask.tsx`, `review-ask.tsx`), all three misclassified as
"off the house page" by the original report and missed by both the first review and the fix
round, though the fix round did correctly resolve the two instances of the identical bug that
the first review did catch. Everything else in the nine items is implemented correctly, tested,
Strata is untouched, no anchor id is renamed, the alias is the sheet's own hex, and the gate
(type-check / full jest with coverage / lint count) reproduces exactly across three independent
runs (implementer, first reviewer, this re-review).
