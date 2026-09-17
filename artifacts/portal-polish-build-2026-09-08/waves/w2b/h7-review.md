# Lane H7 review (Wave 2b — house page follow-ups)

**Reviewer** — did not implement. Read `h7-impl.md` (only present in the lane's own worktree,
`.codex/worktrees/agent-pp-h7/artifacts/portal-polish-build-2026-09-08/waves/w2b/h7-impl.md`; it
is committed on `portal-polish/h7` at `c09be8283`, so it lands at the durable path on merge — worth
flagging to the orchestrator since the plan says the durable path, never only a worktree, but this
is not a lane defect: the report **is** committed and pushed, just not yet integrated).

**Diff inspected:** `git -C /Users/kody/Code/patina-merged diff origin/main...origin/portal-polish/h7`
(36 files, +750/−233). **Gates re-run independently** in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h7` (HEAD `c09be8283`):

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit                                        (exit 0)

$ pnpm --filter @patina/client-portal test -- --coverage
All files    |   75.77 |    71.56 |   75.91 |   78.08 |
Test Suites: 143 passed, 143 total
Tests:       2426 passed, 2426 total

$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```

All three numbers match `h7-impl.md` exactly. Coverage clears the 70/60/70/70 floor. Lint is the
Wave 2 baseline unchanged (11 errors / 52 warnings, same count the ship report recorded) — no new
lint debt.

**Scope.** `git diff --stat origin/main...origin/portal-polish/h7` touches only
`apps/client-portal/**`, `supabase/seed/the-client-page.sql`, and the lane's own report under
`artifacts/`. Nothing outside `apps/client-portal` and `supabase/seed`. No file under
`supabase/migrations/`, no edge function, no `wrangler.jsonc`, no `packages/**` — **Strata is
untouched**, confirmed by absence, not by the report's say-so. Every commit uses explicit
pathspecs (`git show --stat` on all three commits), Conventional Commit types
(`fix(client):`, `docs(portal-polish):`), and the branch is fully pushed
(`portal-polish/h7` and `origin/portal-polish/h7` are both `c09be8283`).

---

## The nine items

| # | Item | Verdict |
|---|---|---|
| 1 | Note signature reaches production | **Done**, and correctly — verified the fallback (`leadDesignerName ?? studioName`) and the same-name dedup in `signatureOf`; tests cover both plus the pre-existing absent-name case. The implementer's own "deviation, flagged" note (brief said "pass studioName", doing only that would have doubled the signature) reads as accurate engineering judgment, not scope creep. |
| 2 | Cents (PP-2 / §F-B) | **Incomplete — see Finding 1.** Every listed file (`house-ledger`, `letterbox`, `earlier-invoices`, `spine-toll`, `spine-gate`, `wall-gate`, `door-gate`) verified correct via diff + `formatCurrency`'s own body (`Intl.NumberFormat` `style: 'currency'`, always 2dp). But two money figures that render on the Threshold were missed and are **not** in the "not touched" exclusion list the report gives. |
| 3 | Legal dates | **Done.** Traced `legalDate`/`dayMonth` through `dates.ts` (pre-existing, unmodified by this lane — always spells the year in `legalDate`, never in `dayMonth`) and every touched call site (`house-ledger`, `letterbox`, `spine-toll`, `earlier-invoices`, `approval-ask`, `door-gate`, `room-band`'s "agreed" stamp, `the-note`). No remaining `DAY_MONTH`/`dayMonth` use on a due/signed/receipt date; remaining `DAY_MONTH` sites are historical "Sent/Declined/Approved" sentences in files the report correctly lists as unchanged (`correspondence.tsx`, `scope-change-ask.tsx`, `review-ask.tsx`, `room-capture.tsx`, `papers-sheet.tsx`, `door-acts.tsx`, `story-pole.tsx`). |
| 4 | `--hairline` | **Done and correct.** `--hairline: #E8E3DB` in the client's `globals.css` house-sheet block matches `docs/design/house-sheet/SPEC.md` A1 verbatim (`--hairline: #E8E3DB`). Confirmed it is a **literal**, not `var(--rail)` (same hex, different token — §A10 forbids drawing a line in `--rail`) and not `var(--border-default)` (`#E5E2DD`, a different value). Consumers (`tracking-row.tsx`, `room-band.tsx`) swapped correctly; tests pin both the value and the non-aliasing. |
| 5 | Story-pole `short` label + held tick | **Done.** `sections` now carries `short` as a required field (compiler-enforced — a caller cannot forget it); the ≤600px bar prints "You are in: {short}" instead of the doubled sentence. The held tick's `w-5`→`w-[9px]` fix is verified against the sheet's own fixed-column pole; a new test asserts every mark shares offset and width. |
| 6 | `key` section entry | **Done**, correctly scoped as "already fixed, ship the missing test." Verified `threshold.tsx:1342`'s `...(roomsUnread ? [] : [...])` gating predates this lane (not in the diff) and the new test (`'points nothing at the key on a page that could not draw one'`) actually exercises the `isError` path and asserts both `#key` and `a[href="#key"]` are absent. |
| 7 | Unread Pay tokens | **Done.** `grep -rn "pay-act"` in the current tree confirms zero remaining declaration or read of `--pay-act-bg`/`-fg`/`-bg-hover` outside the `data-testid`; the `invoice-sheet.tsx` act itself (`data-testid="pay-act"`) carries no reference to the retired properties. New test asserts the rendered `<style>` omits all three and still contains `@media print`. |
| 8 | Seeded gating draw | **Done, local-seed-only, and the risk is honestly disclosed.** Verified in `supabase/seed/the-client-page.sql`: the `trade_scope_draws` INSERT (line ~782) executes while `v_ts_proposal` is still `'draft'` (the surrounding `UPDATE … SET status = 'accepted'` is at line ~795, strictly after), which lines up with `guard_trade_scope_draws`'s early-return-on-draft (00423_trade_scope_instrument.sql:608-612) — the insert is legal. Also verified the flagged tension is real: `send_trade_scope`'s validation (00423:1679-1686) would reject a single 100%-gated draw as the first draw ("must not be the acceptance-gated one"), so this fixture is a state the product's own send path could never produce. The seed bypasses that RPC by design (raw UPDATE, as the rest of the block already does), so it is not a bug in this lane — but it is a real product-rule tension correctly escalated as "ruling owed," not swept under a comment. No migration, nothing touches Strata. |
| 9 | "Leave the house" → "Sign out" | **Done.** `ProjectsEmptyState.tsx:66` changed; three-case test suite added (label + absence of old string, calls `signOut`, other act untouched). `grep -rn "Leave the house"` across `apps/client-portal/src` after the change returns nothing. |

---

## Findings

### Finding 1 — P1 (money without cents survives on the Threshold in two places the report didn't flag)

**Confidence: high** (confirmed by diff, by reading the live component code, and by the
*unmodified* test files that still pin whole-dollar assertions against these exact call sites).

The lane's own report excludes two files from the cents sweep as "off the house page," but both
render directly on the Threshold:

**1a. `room-band.tsx`** — this file *was* touched by the lane (for `--hairline` and for the
`stampDetail` "agreed …" date), so its exclusion from the cents pass looks like an oversight, not
a deliberate scope line. Two functions still call `moneyInWords` (whole dollars):

- `lintelLedger()` (`room-band.tsx:398-411`) — the per-room ledger line rendered under every band's
  lintel: `` `${moneyInWords(band.agreedCents)} agreed against ${moneyInWords(band.targetCents)}
  planned…` `` and the single-figure fallback `` `${moneyInWords(band.agreedCents)} agreed` ``.
- `PieceRecord()` (`room-band.tsx:488-501`) — each selected piece's line total:
  `` piece.clientLineTotalCents > 0 ? \` · ${moneyInWords(piece.clientLineTotalCents)}\` : '' ``.

`room-band.test.tsx` (untouched by this lane) still asserts the whole-dollar strings that prove
these paths are live and unchanged: `'$24,900 agreed against $23,800 planned — about eleven
hundred past its target'` (line 143), `'$24,900 agreed'` (line 158), `'$2,340'` (line 312).

**1b. `standing.ts`'s `thresholdStanding()`** — the report's exclusion list calls this "off the
house page," but it is the **doorstep sentence**: `threshold.tsx:783` calls `thresholdStanding({…})`
and the result is passed straight into `<Doorstep sentence={standing}>` (`threshold.tsx:1184`),
which is the headline sentence at the top of the page. Its fallback branch
(`standing.ts:88-90`, unchanged by this lane) reads:
```
if (Number.isFinite(m.balanceCents) && m.balanceCents > 0) {
  sentences.push(`A balance of ${moneyInWords(m.balanceCents)} stands open.`);
}
```
— the exact "$X" idiom the wave's own §F-B rule (and this lane's `house-ledger.tsx` comment,
"EVERY FIGURE CARRIES ITS CENTS") was written to eliminate, reachable whenever no door/wall marks
are open and a balance remains.

Both are genuine money figures on the Threshold printing without cents, in direct contradiction of
the item-2 rule this same lane enforced everywhere else it looked. Neither is covered by a new or
updated test.

**Fix:** swap `moneyInWords` → `formatCurrency` in `room-band.tsx`'s `lintelLedger` and
`PieceRecord`, and in `standing.ts`'s `thresholdStanding` balance clause; update
`room-band.test.tsx` (lines 143, 158, 312) and add/adjust a `thresholdStanding`/doorstep test for
the balance-open fallback sentence.

### Finding 2 — informational, no fix needed

`--hairline` gets no `.dark` override in the client's `globals.css`, while the sheet (§A1) does
define a dark value (`rgba(242,237,230,.14)`). This is **not new** — none of H2's other four
house-sheet tokens (`--paper-doc`, `--rail`, `--ink-subtle`, `--sage-ink`) got dark overrides in
Wave 2 either, and the client's `.dark` block (`globals.css:138-163`) doesn't touch any of them.
H7 followed the existing (pre-H7) pattern rather than introducing a new gap. Worth a ruling at some
point, not a defect in this lane.

### Finding 3 — informational, already disclosed correctly

Item 8's product-rule tension (single 100%-gated draw vs. `send_trade_scope`'s "first draw cannot
gate" rule) is real, verified against the migration, and already surfaced by the implementer as
"Ruling owed" rather than hidden. No action needed from this review beyond confirming it's true,
which it is.

### Finding 4 — informational

The e2e assertions this lane updated in `tests/threshold.spec.ts` (cents, legal-date, the seeded
draw's amount-in-label) are **unexecuted** — correctly so, per the plan: Wave 3 owns the local
database and `w3-ship.md` doesn't exist yet, so `pnpm supabase:reset` + Playwright were out of
bounds for this lane. The report says this plainly and names it as the integration step's job. Not
a gap in this lane's own gate, but the reviewer cannot independently confirm the seed row or the
new e2e assertions render correctly until that step runs — noting it so the integration lane
doesn't skip it.

---

## Verdict

**needs-fix** — one P1 (Finding 1): two money figures on the Threshold (the room band's ledger
line and piece totals; the doorstep's "balance of $X stands open" fallback sentence) still print
without cents, in files/functions the report itself says are out of scope but that in fact render
on the house page. Everything else in the nine items is implemented correctly, tested, and passes
its own re-run gate with numbers matching the report exactly.
