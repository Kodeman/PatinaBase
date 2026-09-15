# W5 — The bookkeeper's Friday · verification of fix round 3 (review round 4)

**clean = false**

Not because M1-r3 survived — **M1-r3 is discharged** and **all seven named gates are green**. `clean = false`
because the same fix round introduced a **new major** in the artefact that leaves Patina: the m6-r3 "pending"
change is keyed on `billing_state`, which is the wrong signal, and it erases real, resolved money from the CSV
(**M1-r4** below). Both axes are stated separately so the orchestrator can route without re-deriving them.

**Verifier context** separate from the implementer and from rounds 1–3. Branch `hour-tracking/portal` @
`c1c3319a5` (pushed; `origin/hour-tracking/portal` is the same sha), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`. Read in full: `plan-v2.md` §0 + §6,
`rulings.md` (HT-1…HT-41, HT-3-a…g, HT-10-a), `W5-review-r3.md`, `W5-fix-r3.md`, the whole of the fix
commit's diff, `time-export.ts`, the two touched specs, `authority-hours.ts`, `00601`'s banner, `00604`'s
ledger view and `00607`'s rollup. **Read-only except this file** — no DB reset, no dev server, no DB write,
no port 3000/3002 contact, nothing staged or committed.

---

## 1 · M1-r3 — discharged

**The two keys are now distinct**, grepped across `apps/` and `packages/`:

```
apps/designer-portal/src/components/document/hours-ledger.tsx:279
    queryKey: ["document-hours-projects", "with-client"],
packages/supabase/src/hooks/use-time-tracking.ts:1060
    queryKey: ['document-hours-projects'] as const,
```

(The other two hits are prose in comments — `hours-ledger.tsx:268` is the new explanatory comment,
`use-time-tracking.ts:1049` is a now-stale doc line, see **m1-r4**.) No third reader of either key exists.
TanStack's cache entries are therefore disjoint, `MobileSheets`' unconditional
`useTimeCaptureProjects` can no longer win the race, and the ledger's own
`select("id, name, status, client_id")` is the only fetch that can fill the entry the Client column reads.
The enrichment logic itself (`clientNameByProjectId`, keyed on `c.client_id`) was already correct from
round 1 and is unchanged — as the fix log says, it simply never ran on live data.

**The new test exists and passes** — `hours-ledger-scope.test.tsx`, `describe('the Export act (W5, m10-r3)')`,
three cases: renders only at studio scope; disabled on an empty window; and
`exports rows carrying client_name and invoice_number` (asserts the array handed to `buildTimeExportCsv`
contains `{ id: 'entry-teammate', client_name: 'Nora Ellison', invoice_number: 'INV-0042' }`). The suite's
`useClients` stub became a live `clientsData` variable and `makeClient()` gained
`projectsOverride`/`invoicesOverride`, all three reset in `beforeEach` — no cross-test leakage.

Caveat on the guard's reach, not on the fix: **m2-r4**.

## 2 · The other four named minors — all landed, verified in the diff

| Finding | Landed | Evidence |
|---|---|---|
| **m9-r3** invoice-number lookup fails silently | yes | `hours-ledger.tsx:606-612` destructures `isError`; `:873-884` renders a `role="alert"` `<p className="mt-2 t-body-sm">` in `TERRACOTTA_INK` ("Invoice numbers could not be read — …"), inside the `scope === "studio"` block beside the Export act. `t-body-sm` is a real house type-scale class (`globals.css:2014`), no inline font-size utility, `TERRACOTTA_INK` is the file's own `var(--color-terracotta-ink)` (`:104`), matching four existing `role="alert"` sites in the same file. Untested (the fix log says so). |
| **m6-r3** rate-pending exports a confident `0.00` | yes — **and this is M1-r4** | `time-export.ts:70-76` new `isRatePending()`; `:88,:92` swap in the literal `"pending"`. Two new specs pin it. See §3. |
| **m3-r3** synchronous `revokeObjectURL` | yes | `time-export.ts:131-146`: `try/finally` gone, `setTimeout(() => URL.revokeObjectURL(url), 1000)` — the same 1 s defer as `room-file-download.ts:57`, `export-board.ts:82`, `spec-pdf-client.ts:59`. |
| **m10-r3** no component test of the Export act | yes | the three cases above; `buildTimeExportCsv`/`downloadTimeExportCsv` spied via `jest.mock('@/lib/document/time-export')` with `jest.requireActual` for the rest, so `time-export.test.ts` still exercises the real builders. |

Commit hygiene holds: one commit, `fix(time): …` (Conventional), four files, `+207/−18`, **zero** files under
`supabase/`, `supabase/config.toml` still `skip-worktree` (`git ls-files -v` → `S`) and untouched, branch a
descendant of the integration tip, nothing staged beyond the four intended paths.

---

## 3 · MAJOR

### M1-r4 — the m6-r3 fix keys "rate pending" on `billing_state`, and so prints `pending` over money that is already resolved

`apps/designer-portal/src/lib/document/time-export.ts:70-76, 88, 92`

```ts
function isRatePending(row: TimeExportRow): boolean {
  return row.billing_state === "pending_authorization";
}
…
csvField(ratePending ? "pending" : centsToDollars(row.resolved_rate_cents)),   // Rate
csvField(ratePending ? "pending" : centsToDollars(row.amount_cents)),          // Amount
```

`pending_authorization` does **not** mean "no rate resolved". It is a first-class state for a **fully priced**
hour, by this program's own design:

- `00601`'s banner, the wave that wrote it: *"It now carries the studio rate and stays pending_authorization,
  so the row PRINTS HONESTLY instead of reading NULL … Measured: the repaired row reads **rate=15000
  amount=30000 state=pending_authorization src=studio_member** …"*
- The portal's own canonical predicate disagrees with the fix. `authority-hours.ts:141-173`:
  `timeRateProvenance` returns `kind:"pending"` (label `"rate pending"`) **only** when the row is billable,
  `hourly_rate_cents` is null-or-0, **and `entry.rate_source === "none"`**; `billing_state ===
  "pending_authorization"` maps to an entirely different label — `"Pending auth"` in
  `timeBillingStateLabel` (`:129-137`).
- **HT-26 itself** keys on the unresolved rate, not on the authorization state; HT-3-a quotes it as such
  (*"the alternative is `rate_source='none'` — which HT-26 rules a display state ('rate pending')"*).

**What it costs, on r3's own measured data.** The r3 walk's CSV row 2 was

```
"Studio Manager","2026-09-10","Cedar Lane Study","","sourcing","Yes","90","150.00","studio_member","","225.00","pending_authorization","No",""
```

— a resolved `studio_member` rate of $150.00 and a real $225.00. Under this commit that row now exports
`Rate "pending"`, `Amount "pending"`. The file's parseable Amount column then sums to **0.00** while the sheet
directly above it still prints **`$225 billable`** — because the rollup filters on `billable` alone
(`00607:138`, `sum(amount_cents) FILTER (WHERE keyed.billable)`, no `billing_state` leg). That is
**plan §6's Done-when broken outright**: *"the amounts sum to the ledger's total."* It is also the exact tie
r3 made by hand (CSV `225.00` ↔ sheet `$225`) and reported under "what I could not refute" — this commit
refutes it.

The regression is invisible to the suite because the fix also **weakened the test that would have caught it**:
`time-export.test.ts:120-142`'s sum case now `return sum` on a `"pending"` cell, and its one pending fixture
row carries `amount_cents: 0`. The class of row that breaks — pending *with* money — is untested.
`timeExportTotalCents` (documented in the module as *"the CSV's own reconciliation figure (Done-when …)"*)
still sums real cents, so the module now emits two different totals, neither labelled.

**Fix.** Key the pending guard on the rate, not the authorization: `row.rate_source === "none"` (never on
`rate_source == null`, which is a pre-00600 legacy row with a real snapshot — `authority-hours.ts:105-106`),
ideally by calling the existing `timeRateProvenance`/`kind === "pending"` rather than minting a second
predicate. Then restore the sum test to a fixture containing a **priced** `pending_authorization` row and
assert the file's parseable amounts equal `timeExportTotalCents(rows)` over it.

Note also that m6-r3 carried an **owed ruling** ("`rate pending` in those two cells, exclusion, or `0.00`") —
the fix picked option 1 without it being ruled. Whatever predicate lands, the ruling still wants recording.

Confidence **high** (three independent in-repo authorities — the classifier banner, the portal's own
provenance helper, the rollup's filter — plus r3's measured row). Severity **major**.

---

## 4 · MINORS

### m1-r4 — the shared hook's doc comment now states the opposite of the code
`packages/supabase/src/hooks/use-time-tracking.ts:1048-1050` still reads *"Shares
`['document-hours-projects']` with the Hours sheet's own selector **deliberately** — one canonical key, one
fetch, two readers."* That is now false, and it reads as an invitation to "restore" the very collision M1-r3
fixed. The file is lane A's (`packages/supabase`), which is why the portal-local fix correctly did not touch
it — but the sentence should be corrected by whoever next opens that file, or in the ship note.

### m2-r4 — the new component test guards the enrichment, not the key
`hours-ledger-scope.test.tsx:209` `jest.mock('@patina/supabase', …)` replaces the whole package, so
`useTimeCaptureProjects` never runs and `MobileSheets` is never mounted in this suite. The M1-r3 case would
pass identically with the bare colliding key restored. It is still a worthwhile test — it pins that the rows
handed to the builder carry `client_name`/`invoice_number` — but it is **not** the "stops this returning a
third time" guard r3 asked for. A one-line assertion on the query key itself (or a comment saying what the
test does and does not cover) would close the gap honestly.

### m3-r4 — the sum test was weakened in the same commit as the regression
See M1-r4. Flagged separately because it is the reason the gates are green over a broken Done-when: a test
that skips exactly the cells the change alters cannot fail on the change.

### m4-r4 — m9-r3's new line is untested and unwalked
No spec covers `studioExportInvoicesError`; the fix log says so and the brief called it a cheap minor. It is
also a **new rendered element** and this round ran no dev server, so it was not measured at 390 / 1440 (see
§6). Static reading says it is safe — a block `<p>` sibling below a `44 px` act, normal wrapping, no fixed
width, rendered only on an error path, so the Export act's own geometry (r3: `x 46 · w 122 · right 168 ·
h 44` at 390) is unchanged by this commit.

### m5-r4 — every r3 minor and note outside the five named ones is still open
m1-r3 (Prettier sweep), m2, m4, m5, m7, m8, m11, m12, m13, m14, m15, m16-r3 and N1–N15 are untouched, as the
fix log states. This is the third round they have survived; m16-r3's own point stands. No new judgement here —
routing only.

---

## 5 · Gates — run by me, verbatim, in the worktree

All seven named gates, `--dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`:

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/supabase type-check` | **clean** — `tsc --noEmit`, no diagnostics |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, no diagnostics |
| `pnpm --dir <wt> --filter @patina/designer-portal test -- <the 6 specs §6 names>` | **6 suites / 110 tests passed**, 0 failed, 2.328 s |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)** — same count as r2 and r3; spot-checked tail: none in `hours-ledger.tsx`, `time-export.ts`, or either touched spec |
| `pnpm --dir <wt> --filter @patina/admin-portal build` | **exit 0**, full route manifest printed (the repo's strictest type gate) |
| `pnpm --dir <wt> --filter @patina/client-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/client-portal test` | **151 suites / 2475 tests passed**, 1 snapshot, coverage floor met |

The six specs resolved to
`src/lib/document/__tests__/time-export.test.ts`, `src/lib/__tests__/time-billing.test.ts`,
`src/lib/document/__tests__/invoice-composer.test.ts`,
`src/components/document/__tests__/hours-ledger-scope.test.tsx`,
`src/components/document/__tests__/hours-ledger-add-row.test.tsx`,
`src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx` (the last under `accounts/`,
as the fix log flagged).

`patina-verification` notes applied: `designer-portal`/`client-portal` `build` is not a type gate
(`ignoreBuildErrors: true`) — `type-check` is, and both were run; `admin-portal build` is the real gate after
any shared-package edit and was run even though this commit edits no shared package; no root turbo sweep was
used, so no silent-skip caveat applies; designer-portal's lint is the one lint in this repo whose config
resolves.

---

## 6 · Not verified

- **No live render check.** No dev server was started (3100 or otherwise), no browser was driven, nothing was
  measured at 390 / 1440 this round. The only new rendered element is m9-r3's error line (m4-r4).
- **No DB contact of any kind** — no `psql`, no reset, no probe rows, no PostgREST. The M1-r4 argument is made
  from the migrations' own text (`00601`, `00604`, `00607`) and r3's recorded measurements, not from a fresh
  query. A live re-walk would show the `$225` row exporting `pending`; I did not perform it.
- **`@patina/design-system`'s vitest suite** not run (r2/r3 record it does not finish in 25 min); this commit
  touches no file in that package.
- The full 579-suite designer-portal run was **not** re-run this round — only the six named specs.
- Nothing about prod, deploys, migrations, or the other lanes' waves.

---

## 7 · Verdict for the orchestrator

- **M1-r3: discharged.** Distinct keys, enrichment reachable, component test present and passing.
- **The four named minors: all landed**, and three of the four are clean.
- **The fifth (m6-r3) landed on the wrong predicate and is M1-r4** — a major regression of plan §6's own
  Done-when, green under the current suite because the same commit narrowed the test that covered it.
- **Gates: 7/7 green.**
- `clean = false` on the strength of M1-r4 alone. A one-line predicate change (`rate_source === "none"`) plus
  the restored sum fixture should close it; nothing else in this round needs redoing.
