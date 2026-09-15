# W2 — lane A (DB) fix pass, round 9

**Branch** `hour-tracking/server` in `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`.
**Commit** `fix(time): W2-R9 — HT-3-f` (pushed). **Six files**, all under `supabase/` plus the
generated types. `supabase/config.toml` is still `S` (skip-worktree) and is in none of the ten
commits on this branch.

Every gate ran on this program's OWN isolated stack — Postgres `127.0.0.1:54422`,
`--workdir …/agent-server`. The shared `54322` stack was never touched. Nothing reached Strata.

---

## What was asked, and what landed

| ask | where it landed |
|---|---|
| **HT-3-f(1)** — bound (c) becomes a CONFIRM where `p_studio_id = project_pricing_studio_id(p_project_id)` | `00606` section (4), bound (c) |
| **HT-3-f(2)** — the owned tier only where `projects.created_by = projects.designer_id`, ONE implementation called from the resolver, the INSERT stamp and `00606`'s derivation helper | `00615`: new `public.owned_tier_prices_project(uuid,uuid)` + three grafts |
| **HT-3-f(3)** — the widened residual recorded | `rulings.md` row **HT-3-f** part (3); cases (aj) and (w) measure it |
| **W2-R9-02** — the arm's-length leg narrowed to rate-row authorship HISTORY | `00606` bound (a2) employer leg + new column + `00615`'s two guard grafts |
| **W2-R9-03** — the COMMENT line | `00615`'s `guard_studio_member_rate_history` COMMENT |
| **W2-R9-04** — every `effective_from`/`NOW()` pairing UTC-consistent, both files swept | both test files, 68 date expressions |
| HT-3-f recorded in `rulings.md` | four rows added: **HT-3-f**, **W2-R9-02**, **W2-R9-03**, **W2-R9-04** |

---

## HT-3-f(1) — the PIN (`00606`, bound (c))

Bound (c) read `IF public.project_pricing_studio_id(p_project_id) IS NOT NULL THEN RAISE`. It now
reads the derivation into `v_derived` and raises **only where that names a DIFFERENT studio**:

```sql
v_derived := public.project_pricing_studio_id(p_project_id);
IF v_derived IS NOT NULL AND v_derived IS DISTINCT FROM p_studio_id THEN
  RAISE EXCEPTION 'stamp_project_pricing_studio: another studio already prices '
                  'this project''s hours — name that studio to pin it, or there '
                  'is nothing here to repair'
    USING ERRCODE = 'invalid_parameter_value';
END IF;
```

**Nothing else is relaxed.** Bounds (a), (a1), (a2) and (b) run BEFORE this one and bounds (d), (e)
and (f) after it, so a confirm passes the owner-or-admin standing, the tier test, the seat test and
the arm's-length/sibling leg exactly as a repair does. Measured in case (e): the confirm succeeds,
**writes the column**, is idempotent on retry (bound (b)), and a second call naming a different
studio raises with the column unmoved.

**One postcondition moved with it**, and it had to: the old one pinned the literal
`project_pricing_studio_id(p_project_id) IS NOT NULL`. It now pins both halves —
`v_derived := public.project_pricing_studio_id(p_project_id)` **and**
`v_derived IS NOT NULL AND v_derived IS DISTINCT FROM p_studio_id` — because a confirm without the
`p_studio_id` comparison would be a licence to re-point a priced project, which is what the flat
refusal existed for. A third, weaker assert keeps "the stamp must still consult the derivation at
all".

## HT-3-f(2) — one body, three call sites (`00615`)

```sql
CREATE OR REPLACE FUNCTION public.owned_tier_prices_project(p_created_by uuid, p_designer_id uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $$ SELECT p_created_by IS NOT NULL AND p_designer_id IS NOT NULL AND p_created_by = p_designer_id $$;
```

`REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` — a trigger needs no EXECUTE at fire
time and the other two callers are SECURITY DEFINER owned by `postgres`. SECURITY INVOKER, pinned by
postcondition (it reads nothing; a DEFINER here would be an escalation with no reason).

**Why a predicate of the two columns and not of a project id:** the INSERT stamp runs BEFORE the row
exists, so it has `NEW` and no readable `projects` row to pass. That is the only shape all three
bodies can share, and sharing is the point — `00604`'s own banner records that the derivation has
three bodies held together by asserted equivalence rather than by one body, and HT-3-f(2) is the
first rule that is literally one body called from each.

Three grafts, each from its **grep winner**, verbatim, with exactly one condition added:

| function | lineage | delta |
|---|---|---|
| `resolve_time_rate_cents` | `00599` → `00615` | `project.created_by` added to the existing SELECT (no extra read); `AND public.owned_tier_prices_project(v_project_author, v_designer_id)` on the OWNED tier's `ELSIF` |
| `project_pricing_studio_id` | `00604` → `00615` | same column added to the existing SELECT; `IF NOT public.owned_tier_prices_project(…) THEN RETURN NULL` immediately before the owned-tier read |
| `set_project_studio_id_owned` | `00602` → **`00603`** → `00615` | `AND public.owned_tier_prices_project(NEW.created_by, NEW.designer_id)` on the OWNED tier's `ELSIF` |

**`00602` and `00603` are both already merged to `hour-tracking/integration`, so neither file was
edited.** The brief named `00602`; the grep winner is `00603`
(`grep -rln "CREATE OR REPLACE FUNCTION[^(]*set_project_studio_id_owned" supabase/migrations/*.sql | sort | tail -1`),
which is the body that was grafted — `00602`'s is the body `00603` superseded. Both triggers
(`zzz_set_project_studio_id_owned_trg`, `aaa_guard_studio_member_rate_insert_trg`) are NOT recreated:
`CREATE OR REPLACE` keeps the binding and in both cases the trigger NAME is load-bearing for firing
order. Postconditions in `00615` re-assert the properties `00602`/`00603`/`00604` pinned at their own
replay points — the banned-token list (no `ORDER BY`, no `studio_member_rates`, no `.created_at`, no
`joined_at`), employer-before-owned, exactly two `organization_members` reads in the callable form,
the GUC read, DEFINER/INVOKER, search_path, the grants in both directions, and the trigger bindings
including "INSERT only" (P-4).

**It creates no new refusal at project creation**, stated because it is the obvious worry:
`set_project_studio_id` (head `00563`) fires FIRST and its fail-closed check at `00563:352-362` has
already either filled the column or raised, so declining the owned-tier stamp leaves whatever that
rule decided. Measured: `00563_proposal_signing_multi_studio.test.sql` and the whole `rls` suite are
green.

## W2-R9-02 — authorship HISTORY, not the current author

The employer leg at bound (a2) now reads:

```sql
AND (
  (other_author.created_by IS NOT NULL AND other_author.created_by <> v_designer_id)
  OR (other_author.original_created_by IS NOT NULL AND other_author.original_created_by <> v_designer_id)
)
```

over open and closed rows alike. A closed row is frozen outright, so its author is already durable;
the **open** row's displaced author needed somewhere to live, and the honest answer to "her rewrite
cannot erase it" is a column, because the leg already read every row and the single-open-row shape is
exactly the one the review measured. So:

- `studio_member_rates.original_created_by uuid REFERENCES profiles(id) ON DELETE SET NULL` —
  additive, nullable, **not backfilled** (P-4). It is declared in **`00606`**, beside the leg that
  reads it, and not in `00615` where the guard that writes it lives: a migration's body may not read
  a column a LATER migration adds, and `supabase migration up` stopping at `00606` must leave a
  callable function.
- `guard_studio_member_rate_history` (`00598` → `00615`, second section) writes it inside the
  HT-3-e(4) branch: `NEW.original_created_by := COALESCE(OLD.original_created_by, OLD.created_by)`.
  **COALESCEd from OLD, so a CHAIN of rewrites cannot walk the first author off the row** —
  re-stamping from `OLD.created_by` each time would hand her the same denial in two statements
  instead of one.
- the same guard's identity-immutable list gains `original_created_by`, so a caller may not move it
  (the guard's own assignment sits after that check; PostgREST's upsert assigns payload columns only,
  so a blur-save leaves it at OLD and passes).
- `guard_studio_member_rate_insert` (`00598` → `00615`, **new third graft**) nulls any value an
  authenticated writer sends: `studio_member_rates_admin_insert`'s WITH CHECK says nothing about the
  column, so without the discard an owner/admin manufactures the very standing the leg asks for. A
  new row has displaced nobody, so it is a **discard, not a refusal** (§0.7's idiom).

It is a STANDING test at the stamp and **not a pricing one** — HT-3-e(2) still prices on who wrote
the number that is there, so her rewritten row still answers `'none'`. Case (x) leg x6 measures that
explicitly, so a later hand cannot leak this column into the resolver and bring round 8's MAJOR back.

## W2-R9-03 — the COMMENT line

Added to `00615`'s `guard_studio_member_rate_history` COMMENT, as the finding asked and no more: the
stamp is keyed on the number MOVING (which case (l2) asserts as correct), so **any caller that
PATCHes `hourly_rate_cents` alone must also send `created_by`** — the shipped writer
(`useSetStudioMemberRate`, `use-studio-member-rates.ts:101-113`) already does on every blur-save. No
DB change.

## W2-R9-04 — the clock-dependent gates

Both files swept, not only the two red cases: **every** `CURRENT_DATE` is now
`(NOW() AT TIME ZONE 'UTC')::date` (45 in `time_rate_resolution_test.sql`, 23 in
`time_entry_studio_stamp_test.sql`), which also makes both files correct under any session time zone
rather than only under the server's UTC. The two **bare** occurrences — and they were exactly the two
cases the review named, (ag3)'s and (s8d)'s repair rate rows, each followed by a
`NOW() - INTERVAL '1 hour'` probe — are dated `- 1`, so the repair row covers that hour whichever
side of UTC midnight the run falls on. Each file carries a banner section naming W2-R9-04 and the
mechanism.

Measured: the one-hour red window is closed by construction rather than by re-running at a lucky
time (the rate row's `effective_from` is now strictly earlier than any UTC date the probe hour can
land on), and the suites are green.

---

## Tests added and moved

| case | file | what it measures |
|---|---|---|
| **(ai)** NEW | `billing/time_rate_resolution_test.sql` | HT-3-f(2) end to end on **both** round-9 paths. ai1 baseline 26000/52000 · ai2 probe C (`Members can leave` DELETE, 1 row through RLS) · ai3 the callable derivation answers NULL and her next hour is `NULL / none / NULL`, with **ai3c** asserting separately that whatever else changes the number is never her 99900 · ai4 the already-written hour keeps 26000 (P-4) · ai5/ai5b/ai5c probe D2, the `admin` setting her OWN seat `status = 'removed'` — no DELETE at all, which is why bounding the DELETE was never the closure. Both designers hold their own 99900 in a workspace they OWN, so HT-3-e(2)'s exemption would price it if the tier were reached: a `'none'` here is HT-3-f(2) and nothing else |
| **(aj)** NEW | `billing/time_rate_resolution_test.sql` | HT-3-f(3), asserted as **PASSING and loudly labelled**: the same designer's self-created legacy project prices `99900 / studio_member / 199800` from her own workspace. Both messages name HT-3-f(3), say why (created_by is hers), say what the remedy is (HT-3-f(1)'s pin), and say that widening HT-3-f(2) to reach it is a RULING because the honest sole proprietor creates her own projects too |
| **(e)** REWRITTEN | `rls/time_entry_studio_stamp_test.sql` | was a refusal through round 8; now the CONFIRM. e2 succeeds · **e3 the column actually carries it** (a confirm that returns without writing buys the employer nothing) · e4 retry is a no-op · e5 a different studio raises and the column does not move |
| **(w)** NEW | `rls/time_entry_studio_stamp_test.sql` | what the pin BUYS, on HT-3-f(3)'s own shape. Two identical self-created legacy projects, one pinned; she leaves with the one statement `Members can leave` admits; **w3** the pinned one still prices at the employer's 26000, **w4** the unpinned twin moves to her own 99900 (the control that makes w3 a measurement rather than a tautology), **w5** the employer's owner reads **1** of the 2 hours where round 9 measured **0** |
| **(x)** NEW | `rls/time_entry_studio_stamp_test.sql` | W2-R9-02, six legs. x1 she rewrites the studio's only row in place as its `admin` · x1b/x1c authorship moves to her and the displaced author is kept · **x2 the employer's OWNER's stamp SUCCEEDS** (measured refused 42501 before) · x3 she cannot erase the column by hand (frozen) · x4 nor by rewriting again (kept ONCE, from OLD) · x5 nor name it on a row of her own (the INSERT discard) · **x6 the hour still prices `'none'`** — the column is standing, not pricing |

---

## Gates, verbatim, in the brief's order

| command | result |
|---|---|
| `supabase db reset --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-server` | **clean** — `Finished supabase db reset on branch main.`, ledger tail `…00605, 00606, 00607, 00615`; the only `error`-matching line in the log is the filename `00458_sms_message_error_capture.sql` |
| `scripts/run-sql-tests.sh -d …/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, `unexpected-fail: 0` (cases (ai) and (aj) among them) |
| `scripts/run-sql-tests.sh -d …/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16, 6 unexpected** — `authorized_schedule`, `design_services_authority`, `design_services_gap_hardening`, `executed_on_paper`, `trade_rfq`, `trade_scope`. All six **pre-existing and documented** (`supabase/tests/KNOWN_FAILURES.md:69, :97-101`); W2 touches no agreement path |
| `scripts/run-sql-tests.sh -d …/supabase/tests/rls -H 127.0.0.1 -p 54422` | **28 green / 30, 2 unexpected** — `design_requests_test.sql`, `studio_titles_test.sql`, both **pre-existing and documented** (`:114-115`). `time_entry_studio_stamp_test` (with (e), (w), (x)), `studio_member_rates_test`, `time_entry_studio_stamp`, `time_entry_admin_write`, `time_entry_auto_roster`, `project_hours_total`, `studio_hours_rollup`, `00563_proposal_signing_multi_studio`, `00584_studio_comember_rls_sweep` all PASS |
| `pnpm --filter @patina/supabase type-check` | **clean** (exit 0) |
| `pnpm --filter @patina/designer-portal type-check` | **clean** (exit 0) |
| `pnpm --filter @patina/admin-portal build` | **succeeds** (exit 0, full route table) |

Beyond the list:

| command | result |
|---|---|
| `python3 scripts/generate-legacy-grants.py` | regenerated, **baseline + 2630** replayed statements (was 2625); re-running it is a byte-for-byte no-op |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` | regenerated; re-running it against the freshly reset DB is a byte-for-byte no-op. The diff is **21 lines**: `original_created_by` in Row/Insert/Update plus its FK to `profiles` |
| migration-number sweep (`git log --all`, every ref and worktree) | no new number minted this round — `00606` and `00615` were already this branch's. No collision |
| commit hygiene | tracked tree clean after the commit; `supabase/config.toml` still `S` and in none of the ten commits; six files staged by explicit pathspec; Conventional Commits |

### Pre-existing failures, listed separately

**Eight**, none W2's, identical to the r1–r9 baseline, all in `supabase/tests/KNOWN_FAILURES.md`: six
in `commercial` (`:69`, `:97-101`) and two in `rls` (`:114-115`). `studio_titles_test.sql` `FAIL f`
still touches this program's mechanism (`guard_org_membership_changes`' `last_owner_protected` arm is
not firing on this stack) — it is **not** a door HT-3-f uses, since probe C is the ordinary
member-leave policy and `last_owner_protected` has nothing to say about a non-owner seat.

---

## Reported, not assumed

1. **`W2-R9-01`'s bound (c) refusal arm is now effectively unreachable, and that is deliberate.**
   `project_pricing_studio_id` returns non-NULL either from `projects.studio_id` (in which case
   bound (b) fires first) or from a tier holding EXACTLY ONE candidate — which is then the only
   studio bound (e) admits. So the "another studio already prices this" raise is defensive. It is
   kept, and its postcondition with it, because the alternative spelling (drop the comparison) is the
   licence the flat refusal existed to deny.
2. **W2-R9-02 cost one column.** The review's justification — "her rewrite cannot erase it because
   closed rows are frozen outright" — is true of closed rows and false of the single open row the
   finding was measured on, and the leg already read every row. A comment-only change would have
   been a no-op. The column is the minimum that makes the claim true; it is additive, nullable,
   un-backfilled, frozen against callers, and written from OLD only.
3. **`00606` now declares a column.** Its banner and its `Lineage:` line say so. Putting it in
   `00615` would have left `00606`'s body reading a column that does not exist until a later
   migration — fine under PL/pgSQL's late binding, a 42703 for anyone who stops `migration up` at
   `00606`.
4. **One `00615` postcondition was rewritten during this pass for a Postgres limit, not for a
   behaviour:** a `[\s\S]{0,900}` bridge raises `2201B invalid repetition count` (the cap is 255), so
   the employer-before-owned-before-gate ordering is asserted with `position()` over
   `INTO v_employer_studios` / `INTO v_owned_studios` — the tier READS, not the declarations, which
   both sit at the top of the body.
5. **Not done, and not asked for:** W2-R8-04's number bookkeeping in `plan-v2.md` (`:25` and `:708`
   still call `00615` reserved and unused); W2-R4-08 (`public_rpc_authorization_contract_test.sql`
   `:171`, W1's, tenth round of asking); W2-R8-02's consent door; W2-R6-06's `amount_cents` ruling;
   the Strata count of `projects.studio_id IS NULL` split by `created_by` — which HT-3-f(2) now makes
   a **two-column** read rather than one, and which sizes HT-3-f(3) exactly.
6. **Not committed by me:** this file and `artifacts/hour-tracking-2026-09-11/rulings.md` live in the
   main checkout, where the brief forbids running git. They are written and on disk.
7. **Not measured over HTTP or against the portal UI**, and no prod anything: every statement ran
   through `psql` with the session's JWT claims set, against `127.0.0.1:54422`.
