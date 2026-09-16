# W0 — adversarial review, round 2

**clean = false**

One blocker: `00596`'s "one rate source" zeroes the reported money on every legacy rate-less unbilled
entry (measured $350.00 → $0.00 on a realistic fixture), which contradicts **P-4**'s ruled text
*"invoiced and unbilled history keep their amounts"*, is enshrined as correct by the new test's case
(b4), and reaches the invoice composer — which then bills $0 and invoice-locks the rows. No blocker
from round 1 survives; every round-1 finding's fix is verified below. No major.

- Reviewer: separate context from the implementer and from round 1's reviewer.
- Branch under review `hour-tracking/server` tip **`a4999ab9d`**, diffed
  `origin/hour-tracking/integration...hour-tracking/server` (7 commits, 22 files,
  +1669 / −182).
- Stack: the program's own isolated Supabase (`project_id = "patina-hours"`, API 54421, **DB 54422**,
  Studio 54423). The shared 54321/54322 stack was never reset, migrated or written to — confirmed
  `docker ps` shows both and every psql/runner call carried `-H 127.0.0.1 -p 54422`.
- `supabase/config.toml` is still `S` (skip-worktree) and appears in no commit.

---

## 1 · Round-1 fixes — each verified independently

| r1 id | Claimed | Verified |
|---|---|---|
| **m1** (major) | design-services arm now has an executing guard | ✅ `time_unbilled_view_repair_test.sql` case (c) at `:251-312` builds `proposals → proposal_service_rates → project_commercial_documents(design_services, is_origin) → project_billing_authorities(ceiling 25000) → project_billing_authority_rates($100/h 'Support designer')` + a `support_designer` seat, and asserts c1a-e (authority + rate ids bound, rate 10000, `authorized`, rated 20000), c2 (in the view), c3 (reconciles), c4 (over-ceiling sibling is `pending_authorization` and absent). Suite PASSes in my own run. |
| **m2** (minor) | plan-v2 numbering self-consistent again | ✅ `plan-v2.md` headings now read `00595–00597 · 00598–00603 · 00604–00607 · 00608–00609 · 00610–00614 · 00616–00617 · 00618–00620`, matching the line-25 amendment. |
| **m3** (minor) | NULL-actor bypass removed; fails closed | ✅ `00597:104-106` `IF v_actor IS NULL THEN RETURN NEW;`, banner `:26-44` states the direction-of-effect reason and the `current_user`-is-useless fact, COMMENT `:149-152` carries it, and test case (h) at `:266-310` pins **both** halves (h1 no JWT → 0 seats; h2 same member/project under her own JWT → 1 `support_designer`). |
| **m4** (minor) | runner invocation + known-failure drift | ✅ `KNOWN_FAILURES.md:83-101` re-measured with the 2026-09-11 abort points and the explicit "never report commercial green as coverage of the authority rate path" consequence. Reproduced: absolute `-d` + no `-k` reports 6 unexpected in `commercial`; worktree-relative + `-k supabase/tests/KNOWN_FAILURES.md` reports 16/16. |
| **m5** (minor) | Done-when bullets 2 & 3 declared fixture-proven | ✅ stated in `W0-fix-r1.md`; re-confirmed `SELECT count(*) FROM project_unbilled_time` on a fresh reset = 0, no seed writes `project_time_entries`. |
| **m6** (minor) | merge-commit instruction recorded, no code change | ⚠ recorded only — still true of the branch, see **n3**. |
| **N1** | field known-failure documented | ✅ `field` now reads 6/6 (1 expected-fail). |
| **N2** | footers left as written | ⚠ still true — see **n4**. |
| **N3** | `VISION.md` bullet owed | ⚠ still owed — see **n5**. |
| **N4** | plan's `overlays/invoice-composer.tsx` path corrected | ✅ plan §1 now cites `accounts/invoice-composer.tsx` (claim `:393`, `deleteDraft` `:400`) — both line cites correct in the file. |
| **N5** | 23505 warning degrades to `console.warn` | ✅ code present at `use-time-tracking.ts:483-496` — but unreachable today, see **n1**. |
| **N6** | `service_role=X` is a Supabase default | ✅ `proacl` on `claim_time_entries` confirms; §0.16 met. |

## 2 · Inventory vs plan-v2 §1 — every item present at its assigned number/signature

| Plan item | Verdict | Evidence |
|---|---|---|
| `00595_time_entry_claim_and_source.sql` | ✅ | applied in the reset log line 550 |
| `00596_project_unbilled_time_repair.sql` | ✅ | line 551 |
| `00597_time_entry_auto_roster.sql` | ✅ | line 552 (then the imported `20260910152111`, which sorts last — correct, untouched) |
| `claim_time_entries(p_invoice_id uuid, p_entry_ids uuid[]) RETURNS SETOF uuid`, `LANGUAGE sql`, **INVOKER**, `SET search_path = public, pg_temp`, all five WHERE legs **including `duration_minutes IS NOT NULL`** | ✅ byte-for-byte the plan's block | `pg_proc`: `claim_time_entries(uuid,uuid[])` · `prosecdef=f` · `proconfig={"search_path=public, pg_temp"}` · `SETOF uuid` |
| `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` | ✅ | `has_function_privilege`: anon **f**, authenticated **t**, public **f** |
| `project_time_entries_source_ck` widened **by name** to nine values | ✅, and exactly **one** source CHECK exists locally | `CHECK ((source = ANY (ARRAY['timer_auto','timer_manual','manual_entry','field_visit','command_bar','field_manual','internal','widget','intent'])))` |
| `project_unbilled_time` redefined, **name kept**, column list/order/types unchanged, `profiles` gone, `projects` kept, one rate source | ✅ grafted line-by-line from `00412:2671-2688` (the `grep \| sort \| tail -1` winner; `00177 → 00412 → 00596`, no later redefinition) | `pg_get_viewdef` printed in full; 13 columns in the original order |
| `time_entry_auto_roster()` DEFINER, `search_path` pinned, `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role` | ✅ | `prosecdef=t`, `proacl={postgres=X/postgres}`, all three roles **f** |
| trigger `aaa0_time_entry_auto_roster_trg` BEFORE INSERT, fires first, before the classifier | ✅ **and the rate effect verified end-to-end** | `pg_trigger` BEFORE-INSERT order: `aaa0_…`, `aaa_guard_time_entry_invoice_insert_trg`, `aac_classify_…`. My own probe: an unrostered active studio member logs on a design-services project → `seat_role=support_designer`, `entry_rate=11000`, `authority_rate_id=…d5`, `state=authorized` — the seat written by `aaa0_` **is** visible to `aac_`'s role read in the same statement |
| own-designer early exit | ✅ | `00597:94-100`; pinned by case (f) + structural case (g) |
| hook module moved to `packages/supabase/src/hooks/use-time-tracking.ts`, every name preserved (§0.21) | ✅ `git mv` rename detected; all 15 value exports + 19 type exports re-exported from `hooks/index.ts` | plan's §0.21 list checked name by name |
| `useClaimTimeEntries` → `rpc('claim_time_entries')`, **compensating detach deleted** | ✅ | `use-time-tracking.ts:642-669`; the old `.update({invoice_id:null}).eq('invoice_id', invoiceId)` is gone from the tree |
| Deletions: `useTimeEntries`, the `useTimeSummary` wrapper (keeping `fetchTimeSummary`), `useReleaseTimeEntries`, the stale `/desk?book=hours` comment | ✅ all four | `grep -rn "useTimeEntries\|useReleaseTimeEntries\|useTimeSummary" apps packages` → exit 1, no output |
| App-local kept (CR-28): `document-time-provider.tsx`, `time-derivation.ts`, `authority-hours.ts` | ✅ | all three still under `apps/designer-portal/src` |
| Callers repointed: `hours-ledger.tsx`, `accounts/invoice-composer.tsx`, `document-time-provider.tsx`, `use-projects.ts` | ✅ | diff is import-only in each |
| 3 new SQL tests with every listed assertion incl. (d) running timer, (f) own designer, (g) structural | ✅ plus (h) from r1 | read line by line |
| Governance entries, dated | ✅ `R152` (DECISIONS.md, footer `last id = R152`) + `V11` (VISION-DECISIONS.md) | both dated 2026-09-11 |
| iOS / edge / cron / PostHog: none | ✅ | no such path in the diff |

## 3 · Program rules — every prohibition checked

| Rule | Verdict | Evidence |
|---|---|---|
| §0.5 **no flags** | ✅ | no added line in the whole diff matches `useFeatureFlag\|posthog\|isFeatureEnabled\|ComingSoon\|feature_flag` |
| §0.6 **no backfill** | ✅ | the only `UPDATE`/`INSERT` in the three migrations are **inside** function bodies (`00595:110`, `00597:128`); zero top-level DML |
| §0.7 **client rate never trusted** | n/a in W0 (W1 owns the resolver); W0 adds no rate write path. The pre-existing hole stands: the classifier's non-services branch (`00578:2648-2654`) accepts `NEW.hourly_rate_cents` as sent — unchanged by W0 |
| §0.8 guard column list in **both** places | n/a — W0 adds no derived column; `guard_commercial_time_entry_derived_fields` is not referenced by any W0 file |
| §0.9 / §0.16 DEFINER contract | ✅ the one DEFINER function pins `search_path`, is REVOKEd from PUBLIC/anon/authenticated/service_role, and takes its scope from `NEW` with an own-row assert (`NEW.user_id IS DISTINCT FROM v_actor → RETURN NEW`). `claim_time_entries` is deliberately INVOKER per the plan |
| §0.10 **notes never in a rollup** | ✅ W0 adds no rollup. (`te.notes` in `project_unbilled_time` is pre-existing, a per-row view, not the W2 rollup) |
| §0.11 running-slot index untouched | ✅ `uniq_project_time_entries_running_timer ON (user_id) WHERE duration_minutes IS NULL` byte-identical; referenced only in comments |
| §0.12 invoiced lock untouched | ✅ `guard_invoiced_time_entry` function + its `BEFORE UPDATE OR DELETE` trigger unchanged; referenced only in a COMMENT string |
| §0.13 no policy keyed on `projects.studio_id` | ✅ W0 adds/drops **no** policy; `studio_id` appears nowhere in the three migrations |
| §0.17 the 00484 quartet immutable | ✅ all four present, unreshaped; 00484's own assert replayed clean in the reset. Re-confirmed on a clean reset that the **SELECT** policy's qual is `is_project_team_member(project_id)` **alone** — plan-v2's correction holds |
| §0.1 additive to `project_time_entries` | ✅ one CHECK widened, no column dropped, no new table/route |
| §0.3 banner + idempotency + RLS-in-file | ✅ all three carry banner + lineage + hazard; all three are `CREATE OR REPLACE` / `DROP … IF EXISTS` + `ADD`; no new table, so no RLS owed |
| §0.4 redefine from the grep winner | ✅ `grep -rln "CREATE OR REPLACE VIEW[^(]*project_unbilled_time"` → `00177`, `00412`, `00596`; the W0 body is `00412`'s with exactly the two intended deltas |
| §0.19 / §0.20 generated files | ✅ see §5 |
| 00484 registration contract on a dropped/re-created registered policy | n/a — none dropped |

## 4 · Gates re-run by me, from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`

```
supabase db reset --workdir …/agent-server
  → exit 0. "Applying migration 00595_time_entry_claim_and_source.sql / 00596_… / 00597_…"
    then 20260910152111_create_contact_messages.sql; all seeds; "Finished supabase db reset"

run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422
  → total 5 · green 5 · unexpected-fail 0 · effective-green 5/5
    (time_claim_atomicity_test.sql PASS · time_unbilled_view_repair_test.sql PASS)

run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H … -p 54422
  → total 16 · green 10 · expected-fail 6 · unexpected-fail 0 · effective-green 16/16

run-sql-tests.sh -d supabase/tests/rls -k supabase/tests/KNOWN_FAILURES.md -H … -p 54422
  → total 25 · green 23 · expected-fail 2 · unexpected-fail 0 · effective-green 25/25
    (time_entry_auto_roster_test.sql PASS; project_roster_test.sql PASS)

run-sql-tests.sh -d supabase/tests/rls -f time_entry -H … -p 54422
  → total 1 · green 1 · PASS

run-sql-tests.sh -d supabase/tests/field -k supabase/tests/KNOWN_FAILURES.md -H … -p 54422
  → total 6 · green 5 · expected-fail 1 · unexpected-fail 0 · effective-green 6/6
    (time_entry_field_visit_source_test.sql PASS)

pnpm --filter @patina/supabase type-check          → tsc --noEmit, clean (no output)
pnpm --filter @patina/designer-portal type-check   → tsc --noEmit, clean (no output)
pnpm --filter @patina/designer-portal test -- <the three specs the plan implies>
  → Test Suites: 3 passed, 3 total · Tests: 23 passed, 23 total
pnpm --filter @patina/designer-portal test         → 573 suites / 7259 tests passed (whole suite)
pnpm --filter @patina/supabase test                → 100 files passed · 1244 passed / 12 skipped
pnpm --filter @patina/admin-portal build           → Next.js 16.2.10, full route table, exit 0
pnpm exec turbo build --filter=@patina/supabase    → 2 successful (@patina/types, @patina/utils)
                                                     — @patina/supabase itself is SKIPPED, see n2
```

## 5 · Generated files + commit hygiene

```
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres pnpm db:generate   → exit 0
python3 …/agent-server/scripts/generate-legacy-grants.py
  → "baseline + 2600 replayed statements"
git -C …/agent-server status --short   → EMPTY
git -C …/agent-server ls-files -v supabase/config.toml   → S  (skip-worktree, uncommitted)
```

The ACL-seed delta is additive-only and exactly the three statements W0 adds: `REVOKE`/`GRANT` for
`claim_time_entries(uuid,uuid[])` under the `00595` comment, and `REVOKE ALL` for
`time_entry_auto_roster()` under `00597`. `database.types.ts`'s whole delta is the four-line
`claim_time_entries` entry.

`git show --stat` per commit: 7 commits, every path plausible for its message, no stray paths, no
`git add -A` artefacts, `supabase/config.toml` in none of them. The `c6b8fa763` stat shows the hook
module as a rename (`apps/designer-portal → packages/supabase`). Remaining history problems are
narrative, not pathspec — **n3**.

## 6 · Done-when probes (SQL on 54422, as the roles the plan's tests name)

| Done-when bullet | Probe | Result |
|---|---|---|
| a conflicting two-tab claim leaves pre-existing `invoice_id` intact | `time_claim_atomicity_test.sql` case (a), re-run | PASS — partial claim returns only the free id; the composing invoice's own entry and the rival's both keep their `invoice_id` |
| `project_unbilled_time` as the owner includes an entry authored by a roster vendor who is not an org member | case (a1)/(a2), re-run | PASS — precondition (designer cannot read the vendor's profile) then 2 rows present |
| `round(duration/60 * resolved_rate_cents) = amount_cents` on any row | cases (b1)/(c3), re-run | PASS on every row, and on an authority-rated row specifically |
| `project_time_entries_source_ck` admits all nine | `pg_get_constraintdef` | PASS, and only one source CHECK exists |
| a log on an un-rostered project leaves exactly one `support_designer` row; the project's own designer's leaves none | cases (a)/(f) + my own fixtures | PASS |
| `grep -rn "useTimeEntries\|useReleaseTimeEntries" apps packages` | run | no output |
| the three governance entries committed with dates | read | R152 + V11, both dated 2026-09-11; the third (`the-document/CLAUDE.md`) was a verify-only row and is recorded as accurate |

Independent probes beyond the implementer's suites (all transaction-wrapped, rolled back):

| Probe | Result |
|---|---|
| trigger-order → rate effect (seat written by `aaa0_` read by `aac_` in the same statement) | `seat_role=support_designer entry_rate=11000 authority_rate_id=…d5 state=authorized` — the plan's justification for the `aaa0_` name is real, not just a name-order assert |
| removed seat of a **different** role, then the member logs again | `seats=2 roles=support_designer(live),vendor(removed)` — see **m2** |
| `profiles.default_hourly_rate_cents` writers | **none anywhere** (`apps`, `packages`, `services`, `supabase/functions`); the column appears only in `00177`'s `ADD COLUMN` and the two view bodies. The banner's "has no writer anywhere" is true |
| `projects.change_order_terms` writers | **`activate_proposal_as_project` carries it from the proposal**, and the scope-builder editor's `DEFAULT_TERMS.hourlyRateCents = 17500`. So the leg 00596 cuts is **live**, not dead — see **B1** |
| a portal-shaped non-services entry (no `hourly_rate_cents`, exactly what `useCreateTimeEntry` sends) on a project carrying `change_order_terms.hourly_rate_cents = 17500`, 120 min | entry: `rate=NULL rated=NULL state=authorized` · **after 00596: `resolved_rate=0 amount=0`** · **before 00596 (00412 chain): `resolved_rate=17500 amount=35000`** — see **B1** |
| local exposure count | `projects_with_co_rate=0`, `profiles_with_default_rate=0` on a fresh reset — so no local fixture would ever have caught it |

---

## Findings

### BLOCKER

**B1 · `00596`'s "one rate source" silently zeroes the reported money on every legacy rate-less
unbilled entry, contradicting P-4, and the invoice composer then bills $0 and locks the rows.**
*Confidence: high on the mechanism and on it being unstated/untested; medium on the prod row count,
which I cannot measure (Strata not touched).*
Location: `supabase/migrations/00596_project_unbilled_time_repair.sql:50-53`;
`supabase/tests/billing/time_unbilled_view_repair_test.sql:241-243` (case b4);
`apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:122,299,615`;
`apps/designer-portal/src/components/document/hours-ledger.tsx:164,443,620,650`.

Measured on the isolated stack, with a fixture that is exactly what ships today:

```
project.change_order_terms->>'hourly_rate_cents' = 17500   (DEFAULT_TERMS in
  components/portal/scope-builder/change-order-terms-editor.tsx:27, carried into
  projects.change_order_terms by activate_proposal_as_project)
entry: 120 min, billable, source 'manual_entry', NO hourly_rate_cents
  (useCreateTimeEntry's CreateTimeEntryInput has no rate field at all — it cannot send one)
classifier (00578:2648-2654, non-services branch): billing_state='authorized',
  rated_amount_cents stays NULL because hourly_rate_cents IS NULL

BEFORE 00596 (the 00412 chain):  resolved_rate=17500  amount=35000
AFTER  00596 (one rate source):  resolved_rate=0      amount=0
```

Three separate consequences, all on the live money path:

1. **The Hours ledger's unbilled balance** (`hours-ledger.tsx:443`, `fmtUsd(unbilledCents)`) and every
   row's dollar figure (`:620,:650`) read the view's `amount_cents`. They go to **$0.00**.
2. **`useStudioTimeReport`'s `unbilledAmountCents`** (the studio-wide balance) goes to **$0.00**.
3. **The invoice composer bills it.** `unbilledEntries` comes from `useUnbilledTime` → the view
   (`:122`), the ticked entries become the time line (`:299`), the row prints
   `formatCurrency(entry.amount_cents)` (`:615`). A studio can therefore issue a **$0 time line for
   real hours**, and `claim_time_entries` then stamps `invoice_id`, at which point
   `guard_invoiced_time_entry` (`00177:51-84`) freezes `hourly_rate_cents` on those rows for good.

Why this is a blocker rather than a ruled consequence:

- **P-4 is ruled** (`rulings.md:78`) and reads *"→ none; new entries only; invoiced and **unbilled
  history keep their amounts**."* `00596` changes the amount unbilled history reports from
  (change-order rate × hours) to zero. The banner's own defence — *"Existing rows keep their stored
  amounts; this file changes only what the view reports"* — is true of `rated_amount_cents` (NULL
  before and after) and beside the point: what the view reports **is** the studio's unbilled balance
  and the composer's billable amount.
- **HT-6's recommendation and HT-1's ruling both say "cut the change-order leg"** — but in the context
  of *rate resolution for new entries*. **W1** (`00598–00603`) is what gives new entries a
  server-owned `hourly_rate_cents`. Nothing gives the **existing** un-invoiced rows one, and P-4
  forbids the backfill that would, so after W1 they stay at $0 permanently.
- **The legs are not symmetric, and the artifacts treat them as if they were.** I verified
  `profiles.default_hourly_rate_cents` has **no writer anywhere** — cutting that leg is free, exactly
  as the banner says. `projects.change_order_terms->>'hourly_rate_cents'` is **written on every
  proposal activation** and the editor's default is $175/h. The banner calls its writer "the legacy
  scope builder" and moves on; `W0-impl.md`, `W0-fix-r1.md` and `W0-review-r1.md` never mention the
  zeroing at all.
- **No test would catch it, and one test asserts the zero is correct.** Case (b4) asserts
  *"a rate-less entry must read 0/0, not a legacy chain value"*. On a reset database
  `projects_with_co_rate = 0`, so no fixture ever exercises a project that carries the leg.

**Fix (the minimum before this wave merges, in order):**
1. Measure the exposure on Strata — read-only, one query:
   ```sql
   SELECT count(*) AS rows, count(DISTINCT te.project_id) AS projects,
          sum(round(te.duration_minutes/60.0
              * NULLIF((p.change_order_terms->>'hourly_rate_cents')::int,0))::bigint) AS cents_at_risk
   FROM public.project_time_entries te
   JOIN public.projects p ON p.id = te.project_id
   WHERE te.invoice_id IS NULL AND te.billable
     AND te.duration_minutes IS NOT NULL AND te.billing_state = 'authorized'
     AND te.hourly_rate_cents IS NULL
     AND NULLIF((p.change_order_terms->>'hourly_rate_cents')::int, 0) IS NOT NULL;
   ```
2. If `rows > 0`, this needs a ruling (record it as **HT-6-a**), because the two candidate answers are
   both governance, not code: (a) stamp `hourly_rate_cents` once on exactly those rows from the
   change-order rate — which *preserves* the amount rather than re-rating it, and so is arguably what
   P-4's "unbilled history keep their amounts" requires rather than what it forbids; or (b) accept
   $0 explicitly, with Leah told before the deploy, not after she composes an invoice.
3. Either way, add the case to `time_unbilled_view_repair_test.sql`: a project carrying
   `change_order_terms.hourly_rate_cents` with a rate-less authorized entry, asserting whichever
   answer is ruled — so the number is a decision and not an accident.
4. Do **not** deploy `00596` ahead of W1's resolver on the premise that it is a pure repair. It is a
   repair for authority-rated rows and a write-down for legacy ones.

### MINOR

**m1 · `00597`'s own-row gate narrows HT-25 for a designer logging on behalf of an unrostered
teammate — the entry then resolves no role rate.** *Confidence: high.* Location:
`supabase/migrations/00597_time_entry_auto_roster.sql:108-110`.
The plan's trigger spec conditions the seat only on `NEW.project_id IS NOT NULL` and the absence of a
live roster row. The implementation adds `IF NEW.user_id IS DISTINCT FROM v_actor THEN RETURN NEW`
(flagged in `W0-impl.md` as the "own row" half of the gate, which is correct and is the right security
posture). But `Designers manage their project time entries` (`ALL`, qual = the caller owns the
project, **no `user_id` leg** — confirmed in `pg_policies`) lets the project designer insert an entry
*for another user*. Such an entry seats nobody, so `classify_project_time_entry_authority`'s role read
(`00578:2713-2718`) yields `v_team_role = NULL → v_normalized_role = '' →` the role branch at
`00578:2724` is skipped and the entry gets **no authority rate**. No shipped UI does this today —
`useCreateTimeEntry` always writes `user_id = auth.uid()` — so nothing is broken now.
**Fix:** no code change in W0. State it in the **W1** brief (the resolver's "new hire" test must log
as the member herself, never via a designer-on-behalf insert, or it will assert the wrong thing) and
in the **W2** brief (if the admin adjust path ever inserts on behalf, it must seat deliberately).

**m2 · A seat the owner removed is re-seated under a DIFFERENT role — `support_designer` — leaving a
tombstone beside it, and the new role is a rate input.** *Confidence: high (measured).* Location:
`supabase/migrations/00597_time_entry_auto_roster.sql:119-134`; test gap at
`supabase/tests/rls/time_entry_auto_roster_test.sql:181-209` (case d covers same-role only).
Probed: a member whose **`vendor`** seat the owner removed logs again →
`seats=2 roles=support_designer(live),vendor(removed)`. The `ON CONFLICT (project_id, user_id, role)`
arm cannot match (different role), so a *new* row is inserted. Consequences: (i) the owner's removal
is undone with a role the member never held; (ii) `classify_project_time_entry_authority` reads
`count(DISTINCT member.role) = 1 … WHERE removed_at IS NULL` — the tombstone is correctly excluded
(verified), so the entry now rates at the **Support designer** rate card row instead of Vendor;
(iii) the roster/Call Sheet lists them as a support designer. The banner and COMMENT say only *"A seat
the owner removed IS re-seated on the next log"*, which reads as same-role.
**Fix:** fold the sub-case into the owed **HT-25-a** entry in `rulings.md:69` verbatim (*"removal of a
non-`support_designer` seat re-seats the member as `support_designer`, a role they never held, which
the classifier then uses as the rate role"*), and add a case (i) to
`time_entry_auto_roster_test.sql` asserting whichever shape is intended — today's behaviour passes no
assertion at all.

**m3 · `W0-fix-r1.md`'s m1 disposition overstates the new test's coverage.** *Confidence: high.*
Location: `artifacts/hour-tracking-2026-09-11/build/W0-fix-r1.md` ("Case (b1)'s 'every row' sweep now
also covers the authority-rated row") vs `time_unbilled_view_repair_test.sql:225-231`.
Case (b1) runs as `a7200000-…-001`, the **non-services** studio's designer. `project_unbilled_time` is
`security_invoker`, and case (c)'s rows live in a deliberately separate studio
(`a7210000-…`) — no policy on `project_time_entries` gives that designer SELECT on them. So (b1)'s
"every row of the view" is two rows, not four, and it does **not** cover the authority-rated row. No
actual test gap: (c3) asserts the reconciliation on that row directly. Report accuracy only.
**Fix:** correct the sentence in the wave report (or make it true by running the b1 sweep a second
time under `a7210000-…-001`), so a later wave does not trust a sweep that RLS has narrowed.

**m4 · plan-v2 §0.20's ACL-seed list omits `00597`, which does add a REVOKE.** *Confidence: high.*
Location: `plan-v2.md:50` (`Applies to 00595, 00598, 00599, 00607, 00608, 00614, 00618`) vs
`00597:139-140`.
The implementer regenerated anyway and the seed correctly carries
`REVOKE ALL ON FUNCTION public.time_entry_auto_roster() …` under an `00597` comment — so the branch is
right. The risk is forward: a later wave that trusts the list will skip regeneration after a migration
that needs it.
**Fix:** amend §0.20 to `00595, 00597, 00598, 00599, 00607, 00608, 00614, 00618`, and restate the rule
as "every migration containing the words GRANT or REVOKE at top level", not as a fixed list.

**m5 · Partial-claim compensation now lives entirely in the client, and a double failure strands a
stamped entry.** *Confidence: high.* Location:
`apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:396-406`;
`packages/supabase/src/hooks/use-time-tracking.ts:655-661`.
The RPC commits (PostgREST gives it its own transaction), so a short return means rows **are** stamped
when the hook throws. The composer compensates by deleting its draft, which releases them via
`fk_time_entries_invoice … ON DELETE SET NULL` (`00178:211-212`) — I confirmed both BEFORE-UPDATE
guards permit the detach (`guard_invoiced_time_entry` allows an invoice_id-only change;
`guard_time_entry_invoice_authority` returns early on `NEW.invoice_id IS NULL`). But
`deleteDraft.mutateAsync` is wrapped in a bare `catch {}` (`:399-401`), so if it fails the entry stays
attached to an abandoned draft, disappears from `project_unbilled_time`, and is only recoverable by
voiding or deleting that invoice. The old (buggy) compensation ran server-side and always detached.
This is a narrower failure window than the bug it replaces, and the migration banner's phrase *"the
caller … rolls the transaction back"* is loose — there is no transaction to roll back.
**Fix:** cheap — in the composer's inner catch, surface the invoice id in the error text ("the draft
`<id>` still holds the hours — void it to release them") instead of swallowing; and reword the
`00595` banner/COMMENT from "rolls the transaction back" to "deletes the draft it just created, which
releases the partial stamp through the ON DELETE SET NULL FK".

### NOTES

**n1 · N5's `console.warn` fallback is unreachable on every shipped path, and on `(document)`
surfaces passing `{ toast }` is itself the silence.** Location:
`packages/supabase/src/hooks/use-time-tracking.ts:483-496`;
`apps/designer-portal/src/hooks/document-time-provider.tsx:137,341,404`;
`apps/designer-portal/src/app/(document)/layout.tsx:40-45`.
Both live `startTimer.mutateAsync` calls pass `quiet: true`, so the `if (!input.quiet)` gate means
`notify()` is never reached for 23505 today. And the `(document)` route group deliberately mounts **no
`ToastProvider`** (R83, documented in the layout), so `useToast()` returns the context default
`{ toast: () => {} }` — a truthy no-op. `notify()` therefore calls that no-op rather than falling back
to the console. Behaviour is unchanged from before the move and is the intended R83 posture; the note
exists so **W3** does not assume the console fallback protects the ⌘K / mobile capture paths. If W3
wants the 23505 signal, it must pass a real reporter or drop `quiet`.

**n2 · `pnpm turbo build --filter=@patina/supabase` (plan §1's gate list) is a no-op.** Measured:
`2 successful` = `@patina/types` + `@patina/utils`; `packages/supabase/package.json` has **no `build`
script**, so turbo silently skips it — the §0.24 hazard, in the plan's own gate list. The real gate is
`pnpm --filter @patina/supabase type-check` (clean) plus `pnpm --filter @patina/admin-portal build`
(exit 0). Fix the plan's gate list for W1+.

**n3 · The commit history still misleads (r1 m6, accepted with no code change).** `343252aaa`'s body
describes migrations `00592/00593/00594` and says `project_unbilled_time` *"now LEFT JOINs profiles"* —
the shipped file removes the join entirely and asserts `NOT LIKE '%JOIN profiles%'`. `ef8fe776f`
announces `V10`/`R151`. `f0f97145b` added `00595–00597` while `00592–00594` were still in the tree, so
at that commit the branch carries six migrations, three of them duplicates, and a `db reset` there
applies both sets; `de4b18553` removes the old three. The tip is correct throughout. The merge must
either squash `343252aaa..de4b18553` or carry that paragraph — nothing in the branch enforces it.

**n4 · Both ledgers will conflict textually at merge, and `VISION-DECISIONS.md`'s footer lists `V10`,
which is not in this file.** `V10` is the peer program's entry; the footer becomes true only if the
peer merges first. `DECISIONS.md` now reads `R150 → I154 → R152` with `R151` absent. Both programs
append at the identical end-of-file position in both files. Resolve by keeping both entries in id
order, leaving the footers as written, and saying in the merge commit which side moved (hour tracking:
`R151 → R152`, `V10 → V11`).

**n5 · The `V11` §6 bullet is still owed to Kody.** `docs/vision/VISION.md` is untracked
(`git ls-files docs/vision/` returns only `VISION-DECISIONS.md`), so no lane can commit it. The exact
sentence and its insertion point (after `VISION.md:73`) are recorded verbatim inside `V11`, citing
`(V11, 2026-09-11)`.

**n6 · `00595` does not assert that only ONE CHECK is keyed on `source`.** `00545`'s own F4 comment
warns about exactly this shape, and `00545` paid the archaeology by dropping *every* source CHECK that
mentioned `timer_manual` + `manual_entry` before adding the named one — so after `00545` there is
exactly one, and I confirmed that locally. No migration between `00545` and `00591` touches `source`.
Prod was **not** probed. A one-line addition to `00595`'s postcondition (`count(*) = 1` over
`pg_constraint` with that `conkey`) would make the widen provably effective rather than provably
present.

**n7 · `HT-6`'s recommendation text says "LEFT JOIN"; the shipped file removes the `profiles` join
entirely.** plan-v2 §1 authorises the stronger form explicitly and names the reason (the join selects
no column, so an outer join leaves a re-tightenable shape). Strictly stronger, and the postcondition
enforces it. Recorded so a reader comparing `rulings.md:12` against the file does not read drift —
and because `343252aaa`'s message says the opposite (n3).

**n8 · Dead exports survive the deletions.** `TimeEntryFilters` (`use-time-tracking.ts:111`) and
`timeKeys.timeEntries`'s `filters` arm (`:32-35`) had exactly one consumer, `useTimeEntries`, which
this wave deleted. Both are still exported from the package index. Harmless; W1/W2 can drop them with
the next edit to the module rather than in a sweep of their own.

**n9 · `W0-impl.md`'s trigger-order probe lists triggers that are not BEFORE INSERT.** It reports the
BEFORE-INSERT name order as `aaa0_`, `aaa_guard_time_entry_invoice_insert_trg`,
`aab_guard_commercial_time_entry_derived_fields_trg`, `aac_classify…`, `aad_…`. Measured: `aab_` is
`BEFORE UPDATE` only and `aad_` is `BEFORE UPDATE OF invoice_id` only; the BEFORE-INSERT set is just
`aaa0_`, `aaa_guard_time_entry_invoice_insert_trg`, `aac_classify_…`. The **conclusion** is right
(`aaa0_` fires first, ahead of the classifier) and I verified the downstream rate effect directly.
Worth correcting because §0.7(c) asks W1 to harden the guard's *INSERT* branch — and that guard has no
INSERT trigger today, which W1 must add rather than assume.

**n10 · Pre-existing suite state, reproduced not diagnosed.** `supabase/tests/commercial` exercises
10 of 16 files (6 documented; four countersign files abort before their authority asserts) and
`supabase/tests/field` carries 1 documented failure. All verified as expected-fail against the
updated `KNOWN_FAILURES.md`; none diagnosed to root cause by me.

---

## What I did not verify

- **Nothing was run against Strata.** No `db push`, no deploy, no prod query — including **B1**'s
  exposure count, which is the one number the blocker turns on. `project_time_entries_source_ck`'s
  prod shape (whether `00545`'s sweep left exactly one CHECK there as it does locally) was likewise
  not probed.
- **No browser / live-mode render pass.** W0 changes no UI; the import moves are covered by
  designer-portal `type-check` + the full 573-suite jest run + the admin-portal build.
- **`pnpm --filter @patina/designer-portal lint` not run** — it is not in the plan's W0 gate list; the
  implementer reports 0 errors / 201 pre-existing warnings and I did not confirm that.
- **iOS, edge functions, crons, PostHog**: untouched by W0, not built or invoked.
- **The 6 commercial + 2 rls + 1 field pre-existing failures were reproduced, not diagnosed.**
- **`B1`'s blast radius on the client-portal** was not traced; I followed `amount_cents` only through
  the designer portal's ledger, studio report and invoice composer.
