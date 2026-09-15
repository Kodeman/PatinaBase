# W5 — fix round 4 (M1-r4 + m2-r4 · m3-r4 · m4-r4, and the r3 loop closed)

Branch `hour-tracking/portal`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-portal`, on top of
`c1c3319a5`. Read in full: `plan-v2.md` §0 + §6, `rulings.md`
(HT-1…HT-41, HT-3-a…g, HT-10-a), `W5-review-r4.md`, `W5-review-r3.md`,
`W5-fix-r3.md`, `time-export.ts`, `authority-hours.ts`, both touched specs.

No DB reset, no DB contact, no dev server, no port 3000/3002 contact. Three
files changed, all under `apps/designer-portal`; nothing under `supabase/`;
`supabase/config.toml` untouched and still `skip-worktree`.

---

## M1-r4 — the CSV's "pending" is the RATE's, not the authorization's · FIXED

`apps/designer-portal/src/lib/document/time-export.ts`

`isRatePending()` was `row.billing_state === "pending_authorization"`. That is a
fully **priced** state by this program's own design (00601's banner: the row
carries the studio rate and stays `pending_authorization` so it prints
honestly), so real resolved money — r3's own measured `$225.00` row — left the
file as the word `pending`, the Amount column stopped parsing, and plan §6's
Done-when ("the amounts sum to the ledger's total") broke while the sheet above
still printed `$225 billable`.

The predicate is now the portal's **existing canonical one** — no second
predicate minted:

```ts
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
```

`kind: "pending"` fires only when the row is billable, nothing priced it, **and
`rate_source === "none"`** (`authority-hours.ts:141-173`). The
`resolved_rate_cents → hourly_rate_cents` mapping is the same one
`ScopeEntryRow` already makes (`hours-ledger.tsx:1692-1701`) — the fact view
prints the view's name, not the table's. `rate_source == null` is **not**
pending: that is a pre-00600 legacy row carrying a real snapshot
(`authority-hours.ts:105-106`, the `unrecorded` arm).

**Tests** — `time-export.test.ts`:

- *the amount column sums to the ledger total, a PRICED pending_authorization
  row included (M1-r4)* — the weakened case is replaced. The fixture's third
  row is `billing_state: "pending_authorization"`, `rate_source:
  "studio_member"`, `resolved_rate_cents: 15_000`, `amount_cents: 30_000` (r3's
  measured shape). The case asserts every Amount cell parses
  (`["217.50","72.50","300.00"]` — none is the word `pending`), then that the
  parsed sum equals `timeExportTotalCents(rows)` and the literal `59_000`. The
  old `if (amount === "pending") return sum` skip is gone; under the previous
  predicate this case fails on the first assertion.
- *a pre-00600 legacy row (rate_source null) exports its real snapshot, not
  "pending" (M1-r4)* — new, pinning the boundary the Fix names.
- The m6-r3 case (`rate_source: "none"`) is unchanged and still green, so the
  guard still fires where HT-26 wants it.
- The "authorized hour still exports a plain 0.00" case kept its assertions;
  its comment claimed the guard was keyed on `billing_state` and now says the
  rate's provenance.

**Still owed (unchanged from m6-r3):** the *ruling* on what a rate-pending cell
should carry — the literal `rate pending`, exclusion from the file, or `0.00`.
This round keeps option 1, now on the correct predicate; it remains unruled.

## m2-r4 — the new component test guards the enrichment, not the key · FIXED

`hours-ledger-scope.test.tsx`. New first case in the Export-act block,
*gives the client-bearing projects read its own cache key (M1-r3 · m2-r4)*:
renders with an explicit `QueryClient` and asserts off
`client.getQueryCache()` that `['document-hours-projects', 'with-client']`
exists **exact** and that the bare `['document-hours-projects']` does **not**.
That assertion is independent of the `jest.mock('@patina/supabase')` blackout
and fails the moment the colliding key returns. The describe block's header
comment now states outright what the suite does and does not cover (the
package mock means `useTimeCaptureProjects` never runs and `MobileSheets` is
never mounted here).

## m3-r4 — the sum test was weakened alongside the regression · FIXED

Covered by M1-r4 above: the test that skipped exactly the cells the change
altered is replaced by one that requires every cell to parse.

## m4-r4 — m9-r3's new line is untested · FIXED (test), NOT walked

`hours-ledger-scope.test.tsx`: the PostgREST stub gained an `invoicesFail`
flag (reset in `beforeEach`) that makes `from('invoices')` resolve
`{ data: null, error }`. New case *says so when the invoice-number lookup
fails, rather than exporting blanks silently (m9-r3 · m4-r4)* — studio scope,
a ledger row carrying an `invoice_id` (so the lookup is `enabled`), then
asserts the single `role="alert"` carries both "Invoice numbers could not be
read" and "blank Invoice # for invoiced hours".

**Not closed:** the line is still unmeasured at 390/1440 — this round ran no
dev server, per the brief. r4's own static reading (a block `<p>` sibling below
the act, no fixed width, error path only) stands; it is a render check owed,
not a code change.

## m1-r4 — the shared hook's doc comment now states the opposite of the code · RECORDED, NOT FIXED

`packages/supabase/src/hooks/use-time-tracking.ts:1048-1050` still reads
*"Shares `['document-hours-projects']` with the Hours sheet's own selector
**deliberately** — one canonical key, one fetch, two readers."* That sentence
has been false since M1-r3's fix and reads as an invitation to restore the
collision. The file is **lane A's** (`packages/supabase`); the code is left
untouched on purpose. **For the ship note / lane A:** correct that comment to
say the Hours sheet keys its own `client_id`-bearing read on
`['document-hours-projects', 'with-client']` and that the two must stay
distinct.

---

## m5-r4 — the r3 loop, one line per still-open item

Nothing below is a new judgement; it is the disposition r3's m16-r3 asked for
so the loop closes. Items marked **deferred** are outside this brief's named
scope (stage 4 = M1-r4, m2-r4, m3-r4, m4-r4) and are handed to the party named.

### Minors

| r3 item | Disposition |
|---|---|
| **m1-r3** — Prettier sweep buried in the diff; `InvoicePaper.tsx` rewritten into a foreign house style | **deferred (orchestrator / Kody).** Reverting now is a *second* blame rewrite over a shared design-system file, outside this brief, and unverifiable by this round's gates; the durable fix is a repo-wide `.prettierrc` ruling that does not exist. One line in the ship note. |
| **m2-r3** — `patina_time_subtable` contract in three files under two names | **deferred (follow-on refactor).** Consolidating into `@patina/shared` touches designer portal, client portal and the **dist-resolved** design system (a rebuilt dist), for a naming tidy; all three sites are currently correct and agree on the wire value. |
| **m4-r3** — the same `time_entry_ledger` window fetched twice at studio scope | **deferred (lane A).** The dedupe is in `timeKeys.ledger`'s param hashing in `packages/supabase` — not a portal-local fix. Measured benign: the export's read is `enabled` only at studio scope. |
| **m5-r3** — `useClients()` runs for every Hours viewer | **declined.** One cached read of rows the viewer is already entitled to; gating it would mean a conditional hook or a second `enabled` flag for no measured cost. Recorded, not fixed. |
| **m7-r3** — CSV total vs. the rollup can diverge on legacy rows | **deferred (ship note).** P-4 forbids the backfill that would close it; r3 itself put the fix in one ship-note sentence. Note this round makes the *pending* half of the tie exact again (M1-r4). |
| **m8-r3** — the "sums to the ledger total" test | **partly fixed this round** (M1-r4): the case now asserts every Amount cell parses and the parsed sum equals `timeExportTotalCents(rows)` over a priced pending fixture, and `timeExportTotalCents` finally has a non-trivial assertion. **Remainder deferred:** it still compares two reductions over the same array (anchored on a literal), and the file-vs-sheet tie remains a walk, not a test. |
| **m11-r3** — a local date window applied to a UTC `day` column | **deferred (W2 / ruling owed).** `time_entry_ledger.day` is 00604's semantics; changing only W5's window basis would make the file disagree with the sheet's own week list. Needs a ruling on which basis the week is. |
| **m12-r3** — `Bill week → Accounts` is 27.5 px, under the 44 px bar | **deferred (portal follow-up with a walk).** Pre-existing R75 act (W5 changed the label only); the fix is cheap but is a render change and this round measured nothing at 390/1440. |
| **m13-r3** — "beside the studio scope" ships as "beneath" | **declined.** Reads correctly at both widths, sits above the totals (HT-30 holds). Plan §6's wording, not a defect — strike or amend the plan row in the ship note. |
| **m14-r3** — the Export act uses native `disabled`, not `DocumentAction`'s `held` | **deferred (portal follow-up with a walk).** A real improvement the house sheet offers; it changes the act's rendered/focus state and must be measured at 390/1440. The sibling Bill-week act has the same gap. |
| **m15-r3** — horizontal overflow inside the sheet panel at 390 | **declined for W5 / routed.** Both offending nodes are other waves' — the W2 rollup line and the W1 delete act; W5's own act measured clean (`x 46 · w 122 · right 168 · h 44`). Orchestrator routes to W1/W2. |
| **m16-r3** — the fix round closes only the named findings, so the loop never closes | **fixed.** This table is that per-item disposition. |

### Notes

| r3 note | Disposition |
|---|---|
| **N1-r3** — HT-21: what ships is one merged line, i.e. the string plan §6 cites as the defect | **deferred (ship note + struck plan row).** Deliberate and client-protective (a name in `invoice_line_items.description` reaches the homeowner's folio via 00588); r1 graded it B1/B2 and chose this reading. Not re-litigated here; it needs recording as a plan deviation. |
| **N2-r3** — HT-21's naming is inert for the project's own designer | **deferred (ruling owed, Kody).** `v_project_roster` is `project_parties ∪ project_team_members`; 00597 returns early for the designer by design. In Leah's one-designer studio every composer row takes the unnamed path. |
| **N3-r3** — the merged sub-table can print two rows for one date at two rates, uncapped | **deferred (ruling owed, Kody).** |
| **N4-r3** — folio path verified end-to-end in SQL | **no action.** Evidence; carry into the ship note. |
| **N5-r3** — `DECISIONS.md:489,:2737` still name the act "Export week → Accounts" | **deferred (ship note).** The ledger is append-only — the fix is a new `R152` entry, not an edit. |
| **N6-r3** — `@patina/design-system` is dist-resolved, contradicting the `patina-portal-features` skill | **deferred (outside this program).** No ship risk: the dist is current and `deploy-portal.sh` rebuilds dependencies. The skill wants correcting. |
| **N7-r3** — `notes` appears nowhere in the wave's output (HT-36) | **no action.** Evidence. Still true after this round: no column, no payload, no renderer. |
| **N8-r3** — no flag, dashboard, tab, badge, red/green or per-second motion | **no action.** Evidence. This round adds no rendered node at all. |
| **N9-r3** — data access is through `@patina/supabase` hooks | **no action.** Evidence. Unchanged. |
| **N10-r3** — the mock fallback could not mask the r3 walk | **no action.** Evidence (and no walk this round). |
| **N11-r3** — drive the designer portal at `http://localhost:3100`, never `127.0.0.1:3100` | **no action here; worth a durable memory note.** A `127.0.0.1` walk measures a page that never hydrates and reports plausible nothing. |
| **N12-r3** — commit hygiene good; the ship note must say `00615` **and** `00620` are W2's, not unused | **deferred (ship note).** This round adds one commit, `fix(time):`, three files, zero under `supabase/`. |
| **N13-r3** — HT-41/HT-11 are W3/W6; HT-35 is stage 4; the `15-hours.md` help article and the Sanity push are scoped out | **no action.** Scope statement; the help article and Sanity push remain owed to Kody. |
| **N14-r3** — M2-r2's "vacuous" plan row (no `statement` surface exists to modify) | **deferred (ship note + struck plan row).** Same place as N1-r3. |
| **N15-r3** — what r3 could not drive (a completed `DRAFT THE INVOICE` on that stack) | **no action.** Evidence; the shape is covered by N4-r3's SQL probe and `invoice-composer.test.ts`. |

---

## Gates — run in the worktree, verbatim

| Command | Result |
|---|---|
| `pnpm --dir <wt> --filter @patina/supabase type-check` | **clean** (`tsc --noEmit`, no diagnostics) |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/designer-portal test -- <the 6 specs>` | **6 suites / 113 tests passed**, 0 failed (was 110 — three new cases) |
| `pnpm --dir <wt> --filter @patina/designer-portal lint` | **✖ 201 problems (0 errors, 201 warnings)** — identical count to r2/r3/r4; none in the three touched files |
| `pnpm --dir <wt> --filter @patina/admin-portal build` | **exit 0**, full route manifest |
| `pnpm --dir <wt> --filter @patina/client-portal type-check` | **clean** |
| `pnpm --dir <wt> --filter @patina/client-portal test` | **151 suites / 2475 tests passed**, 1 snapshot |

The six specs: `src/lib/document/__tests__/time-export.test.ts`,
`src/lib/__tests__/time-billing.test.ts`,
`src/lib/document/__tests__/invoice-composer.test.ts`,
`src/components/document/__tests__/hours-ledger-scope.test.tsx`,
`src/components/document/__tests__/hours-ledger-add-row.test.tsx`,
`src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx`.

## Not verified this round

- **No render check.** No dev server, nothing measured at 390 / 1440. This
  round adds no rendered node (the only new UI in W5's diff remains m9-r3's
  error line, now covered by a jest case but still unwalked — m4-r4).
- **No DB contact** — no `psql`, no reset, no PostgREST. M1-r4's correctness
  rests on `authority-hours.ts`'s own predicate, 00601's banner and 00604's
  view names, plus r3's recorded measurements.
- The full 579-suite designer-portal run was not re-run; only the six named
  specs (plus the whole client-portal suite).
- `@patina/design-system`'s vitest suite not run; no file in that package is
  touched by this round.
