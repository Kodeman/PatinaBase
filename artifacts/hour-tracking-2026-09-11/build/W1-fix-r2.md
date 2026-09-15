# W1 — fix round 2 (lane A)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
DB: the program's own stack `patina-hours` — Postgres `127.0.0.1:54422`. Migrations edited **in place**
(unmerged, never pushed to Strata); no "fix" migration was added.

## Finding-by-finding

| id | disposition | where |
|---|---|---|
| **W1-R2-01** | **FIXED** (as the finding directs — by fixing W1-R2-02, not the test) | `supabase/migrations/00599_resolve_time_rate_cents.sql:166-184` |
| **W1-R2-02** | **FIXED** | `00599:166-184` (ladder), `:84-104` (banner), `:410-423` (postconditions); new test case **(n)** at `supabase/tests/billing/time_rate_resolution_test.sql:826-936` |
| **W1-R2-03** | **FIXED** | `00599:206-226`; new assert **m4** at `time_rate_resolution_test.sql:806-822`; postcondition at `00599:424-428` |
| **W1-R2-04** | **FIXED** | `supabase/migrations/00598_studio_member_rates.sql:163-177`; new RLS case **(j)** at `supabase/tests/rls/studio_member_rates_test.sql:470-527` |
| **W1-R2-05** | **FIXED** | `supabase/migrations/00601_classifier_rate_resolver.sql:176-186`; postcondition at `:450-457`; new test case **(o)** at `time_rate_resolution_test.sql:938-986` |
| **W1-R2-06** | **PARTLY SKIPPED — the finding's conclusion is wrong; its mechanism is real.** Corrected numbers + the exact invocation recorded below | this file |
| **W1-R2-07** | **FIXED** | `packages/supabase/src/hooks/use-studio-member-rates.ts:32-35` |
| **W1-R2-08** | **FIXED** | `artifacts/hour-tracking-2026-09-11/build/plan-v2.md:205` |
| **W1-R2-09** | **recorded, no change** (the finding asks for none) | — |
| **W1-R2-10** | **orchestrator action, not a lane-A defect** — lane B is still absent | — |
| **W1-R2-11** | **SKIPPED — needs a ruling I cannot make.** Evidence + recommendation below | — |

---

### W1-R2-01 / W1-R2-02 — the studio that prices the hour

`00599`'s `studio_id IS NULL` fallback now orders on a **meaningful** first key — *does this studio hold a
`studio_member_rates` row for `p_user_id`* — and inserts `organizations.created_at` above `studio.id`, so no
tiebreak is ever a uuid:

```sql
    ORDER BY EXISTS (
               SELECT 1 FROM public.studio_member_rates AS priced
               WHERE priced.studio_id = studio.id
                 AND priced.user_id   = p_user_id
             ) DESC,
             (membership.role = 'owner') DESC,
             membership.joined_at NULLS LAST,
             membership.created_at,
             studio.created_at,
             studio.id
```

The finding's option **(1)** — *call `public._agreement_studio_id(p_project_id)`* — is **not available**:
the function is `public._agreement_studio_id(p_proposal_id uuid, p_actor uuid)` (`00576:504-576`). It takes a
**proposal** id, not a project id, and its closing `EXISTS` asserts the **actor's** standing rather than the
rate subject's, so calling it would answer a different question and refuse for a non-member subject. Options
**(2)** and **(3)** were applied instead, and `00599`'s banner no longer claims to *mirror* that ladder — it
now says it borrows its **shape** (one meaningful `EXISTS`, then a total order) and names why it cannot call it.

The fixture at `time_unbilled_view_repair_test.sql:120-122` was **left as it is** — the ambiguity is not being
accepted, so it needed no pin. `time_unbilled_view_repair_test.sql` is now green: 4/4 whole-dir runs after a
clean `supabase db reset`.

New case **(n)** is the coverage the finding asked for: a designer who holds **two** active studios, with
`is_designer` flipped by a **separate UPDATE** after the profile row exists and **before** any membership, so
`00295`'s `provision_studio_on_designer` actually fires (the `ON CONFLICT (id) DO NOTHING` in every earlier
fixture is exactly why no case in this file had a two-studio designer). It asserts `n0` (she really holds 2),
`n0c` (the project's `studio_id` is NULL — the fallback is what is under test), `n0d` (the personal studio holds
no rate row), then that the hour is priced at the paying studio's `22000 / studio_member` and that the resolver
and the classifier agree.

**Proof the assert is load-bearing**, measured: with the ORDER BY reverted to the shipped-r1 ladder and the test
run 4×, it failed 3× with `FAIL n1 … got NULL` and **passed once** — the nondeterminism the finding described,
reproduced in the new case itself.

### W1-R2-03 — the pay-rate leak

ASSERT 2's designer leg is now gated on trigger depth:

```sql
     AND NOT (v_designer_id IS NOT DISTINCT FROM auth.uid()
              AND pg_catalog.pg_trigger_depth() > 0)
```

The raise's message dropped "or the project's designer" accordingly. `m1`/`m2` (the designer-on-behalf UPDATE,
at depth ≥ 1) stay green unchanged. New **m4** asserts the depth-0 direct call raises `insufficient_privilege`:
with the gate reverted it reports `FAIL m4 … it returned 15000` on 4/4 runs.

### W1-R2-04 — the second admin's correction

`created_by` is out of `guard_studio_member_rate_history`'s freeze chain for the **open** row (a closed row is
still frozen outright by the raise above it, identity — `studio_id`, `user_id`, `created_at` — still immutable).
The column COMMENT now says `created_by` records the **last** author of the open row. New RLS case **(j)**
writes it the way the hook writes it — `INSERT … ON CONFLICT (studio_id, user_id, effective_from) DO UPDATE SET
hourly_rate_cents = EXCLUDED.hourly_rate_cents, created_by = EXCLUDED.created_by` — as the owner, then the admin,
same day, and asserts the admin's 15500 sticks, `created_by` is the admin, and there is still exactly one open row.
With `created_by` put back in the chain the suite goes red at `studio member rate identity is immutable`.

### W1-R2-05 — provenance survives backdating

`v_rate_source := OLD.rate_source` replaces `v_rate_source := NULL` in delta 5, with a `00601` postcondition
pinning it. New case **(o)**: the hire's entry is written live at `15000 / studio_member`, then backdated 50 days
(its studio rate begins at `CURRENT_DATE - 30`) so the chain answers `'none'`; the row must still read
`15000 / studio_member / 15000`. With the old `NULL` restored it reports `FAIL o2 … got NULL`. Case **(i)** is
unaffected — its row is genuinely legacy, so `OLD.rate_source` is already NULL.

### W1-R2-06 — the SQL baselines DO reproduce; the reported mechanism is only half right

The finding's diagnosis of the mechanism is correct — the runner's allowlist lookup is on
`rel="${f#"${REPO_ROOT}"/}"`, and `REPO_ROOT` comes from `BASH_SOURCE`, so a **main-checkout** script pointed at a
**worktree** `-d` prints `.codex/worktrees/agent-server/supabase/tests/…` and matches nothing. Measured here
(`field`, one invocation each):

- `/Users/kody/Code/patina-merged/scripts/run-sql-tests.sh -d <worktree abs>/supabase/tests/field` → rows print as
  `.codex/worktrees/agent-server/supabase/tests/field/…`, `expected-fail: 0`, `5 / 6`. **This is what round 2 ran.**
- `<worktree>/scripts/run-sql-tests.sh -d …` (relative **or** absolute) → rows print repo-relative,
  `expected-fail: 1`, `6 / 6`.

But the conclusion ("the reported baselines do not reproduce, state 10/16, 24/26, 5/6") is **wrong**, and so is
"with AND without `-k`": the second variable is the allowlist **default**, which is `<dir>/KNOWN_FAILURES.md` —
and there is **no** per-directory `KNOWN_FAILURES.md` in this tree (only `supabase/tests/KNOWN_FAILURES.md`), so
omitting `-k` silently reads nothing. W1-fix-r1.md's numbers reproduce exactly, from the worktree's own script,
with the repo-level allowlist named. Reproducible baselines after a clean `supabase db reset`:

| suite | invocation | result |
|---|---|---|
| billing | `scripts/run-sql-tests.sh -d supabase/tests/billing -H 127.0.0.1 -p 54422` | total 6 · **green 6** · expected-fail 0 · **6/6** |
| commercial | `… -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md …` | total 16 · green 10 · **expected-fail 6** · **16/16** |
| rls | `… -d supabase/tests/rls -k supabase/tests/KNOWN_FAILURES.md …` | total 26 · green 24 · **expected-fail 2** · **26/26** |
| field | `… -d supabase/tests/field -k supabase/tests/KNOWN_FAILURES.md …` | total 6 · green 5 · **expected-fail 1** · **6/6** |

Without `-k` the same three suites report `expected-fail 0` / 10/16, 24/26, 5/6 — the numbers round 2 quoted.
**`-k supabase/tests/KNOWN_FAILURES.md` is mandatory for every suite outside `billing`**, from the worktree's own
`scripts/run-sql-tests.sh`. Nothing was added to `KNOWN_FAILURES.md`. The six commercial reds are unchanged and
all abort inside `_countersign_design_services_agreement_impl`; the two rls and one field reds are the documented
pre-existing ones.

### W1-R2-11 — the GRANT stays; the revoke needs a ruling

The finding's facts check out: `resolve_time_rate_cents` has **no caller** anywhere in `apps/`, `packages/`,
`services/` or `supabase/functions/` (the only hits are `database.types.ts` and a comment), and the classifier
calls it at trigger depth ≥ 1 as `postgres`, which needs no grant. W2–W7 add none either — the single plan row
that names the function is `plan-v2.md:860` (W7's `00618`), and that is a **redefinition** of the resolver for the
classifier, not a new client surface.

I did **not** revoke it, because doing so contradicts the plan's own ruled surface — `plan-v2.md:226-228` writes
the `GRANT EXECUTE … TO authenticated` into the function's signature block, and §0.16 requires an explicit
`GRANT … TO authenticated` for every new SECURITY DEFINER function in this program — and it re-homes three
shipped test cases (`l1`, `l2`, `m3`, now `m4` too) onto the trigger path. That is an architect's call on the
plan, not a fix-round edit. **Owed ruling for the orchestrator.**

What round 2 reported as the reachable harm is closed regardless: after W1-R2-03 the depth-0 surface is
*related to this project* **and** (*your own rate* **or** *you are a studio owner/admin*) — and an owner/admin
can already read `studio_member_rates` directly through
`studio_member_rates_read_self_or_admin`. If the ruling lands, the revoke is one line in `00599` plus extending
its anon postcondition to `authenticated`.

---

## Gate outputs (all after one clean `supabase db reset`, stack `patina-hours` @ 54422)

```
supabase db reset                                         → Finished supabase db reset on branch main.
                                                            ledger head 00601 (+ the imported 20260910152111);
                                                            object probe: studio_member_rates ·
                                                            resolve_time_rate_cents(uuid,uuid,timestamptz,text)
python3 scripts/generate-legacy-grants.py                 → baseline + 2609 replayed statements;
                                                            git diff supabase/seed/00-legacy-grants.sql = EMPTY
                                                            (no GRANT/REVOKE statement changed this round)
run-sql-tests.sh -d supabase/tests/billing                → total 6 · green 6 · unexpected-fail 0 · 6/6
run-sql-tests.sh -d supabase/tests/commercial -k …        → total 16 · green 10 · expected-fail 6 · 16/16
run-sql-tests.sh -d supabase/tests/rls -k …               → total 26 · green 24 · expected-fail 2 · 26/26
run-sql-tests.sh -d supabase/tests/field -k …             → total 6 · green 5 · expected-fail 1 · 6/6
pnpm db:generate                                          → ran against 54422
git diff --exit-code packages/supabase/src/database.types.ts → clean
pnpm --filter @patina/supabase type-check                 → tsc --noEmit, no output
pnpm --filter @patina/supabase test                       → 101 files · 1251 passed · 12 skipped
pnpm --filter @patina/designer-portal type-check          → tsc --noEmit, no output
pnpm --filter @patina/designer-portal test                → 573 suites · 7260 tests passed
pnpm --filter @patina/designer-portal lint                → 0 errors, 201 warnings (all pre-existing)
pnpm --filter @patina/admin-portal build                  → build completed (the type gate after a packages/* edit)
```

Mutation proof for the four new asserts (each fix reverted in the live DB, test re-run, fix restored):

```
revert 00599 ORDER BY   → FAIL n1 (W1-R2-02) … got NULL   on 3 of 4 runs (1 passed — the coin flip)
revert 00599 ASSERT 2   → FAIL m4 (W1-R2-03) … returned 15000   on 4 of 4 runs
revert 00601 delta 5    → FAIL o2 (W1-R2-05) … got NULL
revert 00598 freeze     → ERROR: studio member rate identity is immutable (rls suite red)
restored                → billing 0 errors · rls 0 errors
```

## Not done

- **Not applied to Strata.** No `supabase db push`, no prod mutation. P-3 still holds the whole program to one
  ship after W7, and `00596` must not go early (HT-6-a still owed).
- **W1 lane B is still absent** (W1-R2-10 / W1-R1-14): no "Studio rates" section, no `studio-rate-rows.tsx`, no
  `hours-ledger.tsx` rate column or "rate pending", no `authority-hours.ts` `timeRateProvenance` change, no
  `pending-time-authorization-band.tsx` doorway. Done-when #3's render half and #5 remain unverifiable.
- **`W1-R2-09` recorded only** — `billable` is still outside `aab_`'s watched list; no wave change requested.
- `plan-v2.md` is untracked in this worktree (it lives only in the main checkout), so the W1-R2-08 edit is **not**
  in this commit — it was made in place at
  `/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/build/plan-v2.md:205`.
