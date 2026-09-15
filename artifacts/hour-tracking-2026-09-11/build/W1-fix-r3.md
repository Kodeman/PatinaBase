# W1 — fix round 3 (lane A, `hour-tracking/server`)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
Isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml` untouched (skip-worktree'd, never staged).
Migrations edited **in place** — W1 is unmerged and undeployed, so no "fix" migration was added.

| id | disposition |
|---|---|
| **W1-R3-01** blocker | **FIXED** — `supabase/migrations/00599_resolve_time_rate_cents.sql:214-243` (ladder), `:469-482` (postconditions), banner `:118-144` |
| **W1-R3-02** major | **FIXED** — `supabase/migrations/00601_classifier_rate_resolver.sql:192-207` (delta 5), `:478-485` (postcondition), banner `:62-73` |
| **W1-R3-03** blocker | **SKIPPED — not lane A's scope.** Orchestrator dispatch item (lane B). Confirmed still absent at this commit |
| **W1-R3-04** minor | **FIXED** — `00598_studio_member_rates.sql:124-156` (new INVOKER refusal + its trigger), `:187-196` (unconditional recompute), `:375-391` (postconditions), banner `:50-72`. **Mechanism deviates from the finding's proposal, with evidence — see below** |
| **W1-R3-05** minor | **SKIPPED — ruling owed.** Left GRANTed per plan-v2 §2's signature block + §0.16; no code change |
| **W1-R3-06** note | **RECORDED** — `00599:146-157` banner block; the coupling is removed as a side effect of W1-R3-01 |
| **W1-R3-07** note | **RECORDED** — `00598:102-111` + a new `COMMENT ON COLUMN studio_member_rates.effective_from` naming the UTC day. Lane B's copy sentence is still owed |
| **W1-R3-08** note | **HONOURED in practice, plan edit owed.** Every gate below ran as `<worktree>/scripts/run-sql-tests.sh -d … -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422`. plan-v2 is orchestrator-owned (and lives in the main checkout, where this lane does not run git) |
| **W1-R3-09** note | **NO CHANGE** — `time_unbilled_view_repair_test.sql` untouched; case (b)'s live-path sibling row b3 intact |

## W1-R3-01 — the ladder

`00599`'s fallback ladder now ranks **"this is a real studio, not a one-person workspace"** above the
rate-existence key, exactly as the finding proposed:

```
ORDER BY ((SELECT count(*) FROM public.organization_members AS peer
            WHERE peer.organization_id = studio.id
              AND peer.status = 'active' AND peer.role <> 'guest') > 1) DESC,
         EXISTS (… studio_member_rates priced … ) DESC,
         (membership.role = 'owner') DESC,
         membership.joined_at NULLS LAST, membership.created_at,
         studio.created_at, studio.id
```

Premises re-verified on the live isolated stack before editing: `fc_provision_studio_on_designer` is
installed and `_provision_studio` seats the profile `'owner'`/`'active'`; `activate_proposal_as_project`'s
body contains no `studio_id` (so the fallback is the live path); 5 of 6 seeded `projects` rows carry
`studio_id IS NULL`.

Two postconditions pin it: the key must exist (`peer.organization_id = studio.id`) **and** must be ordered
before `priced.studio_id = studio.id` — below it the tie returns and the member's self-set rate wins again.

New test case **(p)** in `supabase/tests/billing/time_rate_resolution_test.sql` is shaped like the finding's
probe1: a designer flips `is_designer` with no membership (00295 provisions her one-person workspace and
seats her owner), self-inserts **99900** there through RLS (the INSERT still succeeds — the ladder, not the
policy, is what defends the money), then joins the multi-member studio that prices her at **16000**; her
`studio_id`-NULL project, a 120-minute entry. Asserts `hourly_rate_cents = 16000`, `<> 99900`,
`rate_source = 'studio_member'`, `rated_amount_cents = 32000`, and resolver/classifier agreement.

**Negative control** (ladder reverted in-session, test re-run):
`ERROR: FAIL p1 (W1-R3-01, HT-3 + HT-1): the member's self-set workspace rate priced the hour`.

A solo designer's only studio still wins — it is the only candidate, so every key ties and `LIMIT 1` takes it
(case (n), the two-studio designer with a rate in one studio, stays green). The two larger alternatives were
**not** taken: tightening `studio_member_rates_admin_insert` would forbid a solo owner pricing her own hours,
and populating `projects.studio_id` is backfill-adjacent (§0.6) and outside W1.

## W1-R3-02 — delta 5

```
IF TG_OP = 'UPDATE'
   AND OLD.hourly_rate_cents IS NOT NULL
   AND (v_rate_source = 'none' OR OLD.rate_source IS NULL)
```

New test case **(q)**: a pre-00600 row (`rate_source` NULL, snapshot 17500, 60 min) on a non-services project
whose author **does** hold a 15000 studio rate covering `started_at`; she corrects the duration to 120.
Asserts 17500 / NULL / 35000 — then a `billable` off/on round trip (the second vector, via the non-billable
branch) and asserts the same three again.

**Negative control** (delta 5's condition reverted, test re-run):
`ERROR: FAIL q1 (P-4, W1-R3-02): a duration edit must not re-price a legacy snapshot to the author's current studio rate; got 15000`.

The counter-ruling is written into the 00601 banner: if HT-1 is ever ruled to beat P-4 on an edit, flip case
(q)'s assert and record it beside HT-6-a.

## W1-R3-04 — effective_to, with a documented deviation

The finding's literal fix — `IF current_user IS DISTINCT FROM 'postgres' … RAISE` **inside**
`close_prior_studio_member_rate` — **cannot fire**: that function is `SECURITY DEFINER`, so `current_user`
inside it is its owner. Measured this session on the stack:

```
SET LOCAL ROLE authenticated;
SELECT definer_fn() , invoker_fn(), session_user;  →  postgres | authenticated | postgres
```

`session_user` is no help either (the SQL harness and PostgREST both connect as a login role and `SET ROLE`).
So the refusal ships as its own **SECURITY INVOKER** `BEFORE INSERT` trigger function
`public.guard_studio_member_rate_insert()` (`REVOKE ALL` from every role; trigger privileges are checked at
`CREATE TRIGGER`, not at fire time — the sibling `guard_studio_member_rate_history` already relies on that),
named `aaa_guard_studio_member_rate_insert_trg` so it sorts **before** `close_prior_studio_member_rate_trg`
— the close *computes* `effective_to`, so a guard firing after it would refuse the ladder's own value. A
postcondition asserts that name ordering; a second asserts the close no longer wraps the recompute in
`IF NEW.effective_to IS NULL`.

`close_prior_studio_member_rate` now recomputes `effective_to` **unconditionally**, per the finding: a value
that arrives with the row (only postgres can still supply one) is replaced, never trusted. No test or seed in
the repo supplies the column (grepped), and the hook never sends it.

New test case **(k)** in `supabase/tests/rls/studio_member_rates_test.sql`: as the owner, a backdated insert
carrying an explicit `effective_to` is refused (`check_violation`); so is the shape that would leave **no**
open row; an ordinary dated write still closes correctly; then (g6) is re-asserted over the whole span and
the single-open-row count re-checked. The legitimate write deliberately uses a different `effective_from`
from the refused one, so a regression fails on k1 rather than on the unique index.

**Negative control** (insert trigger dropped + conditional recompute restored):
`ERROR: FAIL k1 (W1-R3-04): a caller-supplied effective_to must be refused`.

## W1-R3-05 — the owed ruling (unchanged, stated)

`resolve_time_rate_cents` stays `GRANT EXECUTE … TO authenticated` with no repo caller (re-verified: one hit,
a doc comment at `use-time-tracking.ts:91`). plan-v2:226-228 writes the GRANT into the signature block and
§0.16 asks for one, so revoking it here would contradict the plan without a ruling. **Orchestrator ruling
owed:** revoke (and re-home cases l1, l2, m3, m4 onto the trigger path, and widen 00599's `anon`
postcondition to `authenticated`), or keep and say so in plan-v2 §2. Note for the ruling: the door is no
longer defended *incidentally* (W1-R3-06) — ASSERT 2 is now a rule about the caller.

## Gates

All against the isolated stack (`127.0.0.1:54422`), worktree-relative script, `-k` mandatory (W1-R3-08):

| command | result |
|---|---|
| `supabase db reset` (worktree `supabase/`, after `python3 scripts/generate-legacy-grants.py`) | **clean** — every migration + postcondition replayed, 22 seeds loaded |
| `./scripts/run-sql-tests.sh -d supabase/tests/billing -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` | **6/6 green**, 0 unexpected-fail (incl. cases (p) and (q)) |
| `./scripts/run-sql-tests.sh -d supabase/tests/rls -k … ` | **24 green + 2 expected-fail = 26/26**, 0 unexpected-fail (incl. case (k)) |
| `./scripts/run-sql-tests.sh -d supabase/tests/commercial -k … ` | **10 green + 6 expected-fail = 16/16**, 0 unexpected-fail — unchanged |
| `psql -f supabase/tests/billing/time_rate_resolution_test.sql` (verbose) | cases (a)–(q) all print `passed` |
| `python3 scripts/generate-legacy-grants.py` | rewrote `supabase/seed/00-legacy-grants.sql` (+6 lines: the new `REVOKE ALL ON FUNCTION public.guard_studio_member_rate_insert()`), committed with the migration |
| `SUPABASE_DB_URL=…54422 pnpm db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** (no public-schema surface changed — the new function returns `trigger`) |
| `pnpm --filter @patina/supabase type-check` | **clean** |

The push's pre-push hook runs a **branch-wide** affected plan (not this commit's — this commit's plan is
`checks: []`), and reported `Affected verification has advisory failures`. Chased to ground, since a red gate
matters to the wave even when this round did not cause it:

| branch-wide affected check | result |
|---|---|
| `@patina/supabase test` | green — 101 files, 1251 tests |
| `@patina/supabase type-check` | green |
| `@patina/designer-portal type-check` | green |
| `@patina/designer-portal test` | green — 573 suites, 7260 tests |
| `@patina/designer-portal lint` | green — **0 errors**, 201 pre-existing warnings |
| `@patina/admin-portal build` (the type-enforcing gate, §0.24) | green |
| `@patina/client-portal type-check` · `@patina/manufacturer-portal type-check` | green |
| `@patina/admin-portal test` · `@patina/admin-portal lint` | **RED — pre-existing, unrelated.** The failing suites are admin-portal catalog/UI scaffolding carrying literal `// TODO: This test will FAIL - hook doesn't exist yet` markers. Neither command is in plan-v2 §2's W1 gate list (that list names `admin-portal build`), and no file either one touches is in this program's diff |

So the advisory line is those two pre-existing admin-portal reds, not anything W1 introduced.

Wave-level work still owed: Done-when #3 and #5 under `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, which
cannot be run until lane B lands (W1-R3-03).

## Files touched

- `supabase/migrations/00598_studio_member_rates.sql`
- `supabase/migrations/00599_resolve_time_rate_cents.sql`
- `supabase/migrations/00601_classifier_rate_resolver.sql`
- `supabase/seed/00-legacy-grants.sql` (generated)
- `supabase/tests/billing/time_rate_resolution_test.sql` (cases (p), (q))
- `supabase/tests/rls/studio_member_rates_test.sql` (case (k))
