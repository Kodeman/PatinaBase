# W5 — The bookkeeper's Friday · verification of fix round 4 (review round 5)

**clean = true**

M1-r4 is **discharged**: the CSV's "pending" now keys on the RATE's provenance
(`timeRateProvenance(...).kind === "pending"`, i.e. `rate_source === "none"`), the sum test carries a
**priced** `pending_authorization` row and asserts the parsed amounts equal `timeExportTotalCents(rows)`,
and **all seven named gates are green** (plus two extra runs this round: the full 579-suite designer-portal
sweep and the `InvoicePaper` vitest spec, both green). m2-r4 and m4-r4 landed. Every r3 item —
M1, m1–m16, N1–N15 — carries a disposition line.

**Verifier context** separate from the implementer and from rounds 1–4. Branch `hour-tracking/portal` @
`4821b1f74` (pushed; `origin/hour-tracking/portal` is the same sha), worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, working tree clean. Read in full:
`plan-v2.md` §0 + §6, `W5-review-r4.md`, `W5-fix-r4.md`, the whole of commit `4821b1f74`, `time-export.ts`,
`authority-hours.ts`, both touched specs, `hours-ledger.tsx:255-300`. **Read-only except this file** — no DB
reset, no DB contact, no dev server, no port 3000/3002 contact, nothing staged or committed.

---

## 1 · M1-r4 — discharged

### The guard reads the rate, not the authorization

`apps/designer-portal/src/lib/document/time-export.ts:72-99`:

```ts
function isRatePending(row: TimeExportRow): boolean {
  const provenance = timeRateProvenance(
    {
      hourly_rate_cents: row.resolved_rate_cents,
      rate_source: row.rate_source ?? null,
      rate_role: row.rate_role ?? null,
      billable: row.billable,
      billing_state: row.billing_state ?? null,
    },
    null,
  );
  return provenance.kind === "pending";
}
```

No second predicate was minted — this is the portal's own canonical helper. Read against
`authority-hours.ts:139-173`, `kind: "pending"` is reachable **only** when the row is billable, no positive
rate resolved, **and `entry.rate_source === "none"`**; `rate_source == null` falls to the `unrecorded` arm
(the pre-00600 legacy row with a real snapshot), and a non-billable row short-circuits to `nonbillable`
before the rate is consulted. `billing_state` is now inert to the guard — it is passed only because
`timeRateProvenance`'s entry shape carries it, and the only branch that reads it is
`billing_state === "nonbillable"`, which is the non-billable arm, not the pending one. The
`resolved_rate_cents → hourly_rate_cents` mapping matches what `ScopeEntryRow` already does with the same
fact view. The import is a pure lib→lib edge (`authority-hours.ts` imports only types), so the module's
"pure, dependency-free core" property holds.

### The sum test carries a priced pending row and asserts the equality

`time-export.test.ts:120-150`, *"the amount column sums to the ledger total, a PRICED pending_authorization
row included (M1-r4)"* — fixture rows `t1` 21 750, `t2` 7 250, and `t3`
`billing_state: "pending_authorization"`, `rate_source: "studio_member"`, `resolved_rate_cents: 15_000`,
`amount_cents: 30_000` (r3's measured shape). It asserts

```ts
expect(amounts).toEqual(["217.50", "72.50", "300.00"]);   // every cell parses; none is "pending"
expect(summed).toBe(timeExportTotalCents(rows));
expect(summed).toBe(59_000);
```

The r3-era `if (amount === "pending") return sum` skip is gone, and `timeExportTotalCents` finally carries a
non-trivial assertion. **Under the previous predicate this case fails on its first assertion** — a
`pending_authorization` row went to `"pending"` regardless of its rate, so `amounts` would read
`["217.50","72.50","pending"]`. (Argued statically from the two code paths, not by mutating the worktree.)

Two boundary cases hold the shape from both sides, both passing:
- *m6-r3* — `rate_source: "none"`, `resolved_rate_cents: 0`, billable → Rate and Amount are `"pending"`, so
  HT-26's display state still reaches the file where it should.
- *"a pre-00600 legacy row (rate_source null) exports its real snapshot"* (new) — `rate_source: null`,
  `resolved_rate_cents: 14_500` → `"145.00"` / `"217.50"`, pinning the boundary the fix names.

Plan §6's Done-when — *"the amounts sum to the ledger's total"* — is therefore intact again for the class of
row that broke it (priced, pending authorization), and the file's total ties to the sheet's
`sum(amount_cents) FILTER (WHERE billable)` rollup on that class.

## 2 · m2-r4 and m4-r4 — both landed

| Finding | Landed | Evidence |
|---|---|---|
| **m2-r4** the component test guarded the enrichment, not the key | yes | `hours-ledger-scope.test.tsx:1069-1097`: new first case *"gives the client-bearing projects read its own cache key (M1-r3 · m2-r4)"* renders with an explicit `QueryClient` (`renderLedger` gained a second parameter, default `makeQueryClient()`) and asserts off `client.getQueryCache()` that `['document-hours-projects','with-client']` exists **exact** and the bare `['document-hours-projects']` does **not**. The ledger's own `useQuery` (`hours-ledger.tsx:278-289`) has no `enabled` gate, so it runs at the project scope the case renders — the `waitFor` is real, not vacuous. The assertion is independent of `jest.mock('@patina/supabase')` and fails the moment the portal side of the collision returns. The describe block's header now states outright what the suite does and does not cover. |
| **m4-r4** m9-r3's error line was untested | yes (test) | The PostgREST stub gained `invoicesFail` (declared `:72-73`, reset in `beforeEach` `:377`), which makes `from('invoices')` resolve `{ data: null, error }`. New case `:1177-1188` drives studio scope with a row carrying `invoice_id`, then asserts the single `role="alert"` carries both *"Invoice numbers could not be read"* and *"blank Invoice # for invoiced hours"*. Still **unwalked** at 390/1440 — see §5. |
| **m3-r4** the weakened sum test | yes | Covered by §1: the skip is replaced by a require-every-cell-parses assertion over a priced pending fixture. |

## 3 · The r3 loop — closed

`W5-fix-r4.md` §m5-r4 carries a one-line disposition for **every** r3 item. Cross-checked against
`W5-review-r3.md`'s own headings: M1-r3 (discharged r4) · m3/m6/m9/m10-r3 (fixed in round 3, verified r4) ·
m1, m2, m4, m5, m7, m8, m11, m12, m13, m14, m15, m16-r3 (table rows: 8 deferred with a named owner, 3
declined with a reason, m16 fixed by the table itself) · N1–N15-r3 (all fifteen present; 7 "no action —
evidence", 8 deferred to the ship note or a ruling). Nothing from r3 is silently dropped. Two items the
orchestrator still owns, unchanged from r4: the **unruled** m6-r3 question (does a rate-pending cell carry
the literal `rate pending`, an exclusion, or `0.00` — this round keeps option 1, now on the right
predicate), and **m1-r4**, the stale doc comment at `packages/supabase/src/hooks/use-time-tracking.ts:1048-1050`
that still calls the cache-key sharing "deliberate" — lane A's file, correctly untouched here, and the one
remaining written invitation to restore M1-r3's collision.

Commit hygiene holds: one commit, `fix(time):` (Conventional), three files, all under
`apps/designer-portal`, `+117/−17`; **zero** files under `supabase/`; `supabase/config.toml` still
`skip-worktree` (`git ls-files -v` → `S`) and untouched; working tree clean; branch pushed.

---

## 4 · Gates — run by me, verbatim, in the worktree

`<wt>` = `/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`.

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/supabase type-check` | **clean** — `tsc --noEmit`, exit 0, no diagnostics |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **clean** — `tsc --noEmit`, exit 0, no diagnostics |
| `pnpm --dir <wt> --filter @patina/designer-portal test -- <the 6 specs>` | **6 suites / 113 tests passed**, 0 failed, 2.37 s, exit 0 |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | exit 0 — **✖ 201 problems (0 errors, 201 warnings)**, the same count as r2/r3/r4; grep of the report for `time-export`, `hours-ledger-scope`, `hours-ledger.tsx` → **no hits** |
| `pnpm --dir <wt> --filter @patina/admin-portal build` | **exit 0**, full route manifest printed (the repo's strictest type gate) |
| `pnpm --dir <wt> --filter @patina/client-portal type-check` | **clean**, exit 0 |
| `pnpm --dir <wt> --filter @patina/client-portal test` | **151 suites / 2475 tests passed**, 1 snapshot, coverage floor met, exit 0 |

The six specs: `src/lib/document/__tests__/time-export.test.ts`, `src/lib/__tests__/time-billing.test.ts`,
`src/lib/document/__tests__/invoice-composer.test.ts`,
`src/components/document/__tests__/hours-ledger-scope.test.tsx`,
`src/components/document/__tests__/hours-ledger-add-row.test.tsx`,
`src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx`.

**Two gates beyond the seven, run this round:**

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/designer-portal test` (plan §6's own verbatim gate — the FULL suite, not run since r1) | **579 suites / 7384 tests passed**, 1 snapshot, 26.3 s, exit 0 |
| `pnpm --dir <wt> --filter @patina/design-system exec vitest run src/components/InvoicePaper/InvoicePaper.test.tsx` | **1 file / 3 tests passed**, 0.8 s, exit 0 |

The second closes a gap r2–r4 all carried as "the design-system suite does not finish in 25 min": that is
true of the **whole** suite (and of `--filter @patina/design-system test -- <path>`, whose `--` passthrough
does not filter — I reproduced that, it ran the whole suite and was still going after 7 min). Invoking
`vitest run <path>` through `exec` filters correctly and takes under a second, so the W5 branch's one
design-system spec is now actually verified rather than deferred.

`patina-verification` notes applied: `designer-portal`/`client-portal` `build` is **not** a type gate
(`ignoreBuildErrors: true`) — `type-check` is, and both were run; `admin-portal build` is the real strict
gate and was run; no root turbo sweep was used, so no silent-skip caveat applies; designer-portal's lint is
the only lint in this repo whose config resolves, and it is the one reported.

---

## 5 · Not verified

- **No live render check.** No dev server (3100 or otherwise), nothing measured at 390 / 1440. This round's
  commit adds **no rendered node** — the only new UI anywhere in W5's diff remains m9-r3's error line, now
  covered by a jest case but still unwalked (m4-r4's open half). r4's static reading stands: a block `<p>`
  sibling below a 44 px act, no fixed width, error path only.
- **No DB contact of any kind** — no `psql`, no reset, no PostgREST, no probe row. M1-r4's discharge is
  argued from `authority-hours.ts`'s own predicate, the module's code paths and the specs, plus r3's
  recorded measurements — not from a fresh query. A live re-walk would show r3's `$225` row exporting
  `225.00` again; I did not perform it.
- The designer-portal **e2e** suite was not run (no server), nor `@patina/design-system`'s full vitest suite
  (only its one W5-touched spec).
- Nothing about prod, deploys, migrations, iOS, or the other lanes' waves.

## 6 · One routing note for the orchestrator (not a defect)

`hour-tracking/portal` (`4821b1f74`) is **6 commits behind** `hour-tracking/integration` (`dd4d713d3`) — W6
merged after this branch's base (`66d22ff96`). r4's "descendant of the integration tip" is no longer true,
through no act of this round. Measured: **zero file overlap** between the two sides
(`git diff --name-only 66d22ff96 …` on each), so the merge should be textually clean. But W6 edited
`packages/supabase/src/hooks/use-time-tracking.ts` (the `field_manual` source union), which the designer
portal type-checks against, so the gate set above must be **re-run after the merge**, not treated as
transferable to the merged tree.

## 7 · Verdict

- **M1-r4: discharged** — guard on `timeRateProvenance`/`rate_source === "none"`; sum test carries a priced
  `pending_authorization` row and asserts equality with `timeExportTotalCents`; both boundaries pinned.
- **m2-r4: landed** (cache key asserted directly, mock-proof). **m4-r4: landed** as a test; the render walk
  remains owed. **m3-r4: landed.**
- **Every r3 item carries a disposition line** — M1, m1–m16, N1–N15.
- **Gates: 7/7 green**, plus the full 579-suite designer-portal sweep and the InvoicePaper vitest spec.
- **`clean = true`.** No new major and no new minor found in this round's commit. What remains open is
  routing, not repair: the unruled m6-r3 cell question, lane A's stale doc comment (m1-r4), the 390/1440
  walk of the error line, the r3 deferrals listed in `W5-fix-r4.md`, and a post-merge gate re-run.
