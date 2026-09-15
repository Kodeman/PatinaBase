# W1 — fix round 4 (lane A)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
DB = the program's own isolated stack `patina-hours` (API 54421 / Postgres 54422). `supabase/config.toml`
still skip-worktree'd (`git ls-files -v` → `S`) and absent from every commit.

Migrations edited **in place** (unmerged, never pushed to Strata — no "fix" migration was added).
**Two files changed, nothing else:**

```
 M supabase/migrations/00599_resolve_time_rate_cents.sql
 M supabase/tests/billing/time_rate_resolution_test.sql
```

---

## Findings → disposition

| id | disposition | where |
|---|---|---|
| **W1-R4-01** · BLOCKER | **FIXED** | `00599:279-297` (the ladder), `00599:247-278` (why), `00599:553-572` (the pinned postcondition), `00599:159-196` (banner round-4 section), new test case **(r)** at `supabase/tests/billing/time_rate_resolution_test.sql:1222-1366` |
| **W1-R4-02** · MAJOR | **FIXED** by the same ladder | `00599:279-297`; new test case **(s)** at `time_rate_resolution_test.sql:1368-1452` |
| **W1-R4-03** · BLOCKER (wave-level dispatch) | **OUT OF SCOPE for lane A — DEFERRED to phase 2** by the orchestrator. Not attempted. Lane B's portal surfaces (`account-studio-page.tsx` "Studio rates", `account/studio-rate-rows.tsx`, `hours-ledger.tsx` rate column + "rate pending", `authority-hours.ts` `timeRateProvenance`, `pending-time-authorization-band.tsx` doorway, `authority-hours.test.ts`, PostHog `time_entry_logged` / `time_rate_unresolved`) remain absent. Done-when #3's live-mode render half and #5's printed role therefore remain unverifiable at this commit, exactly as the review states. | — |
| W1-R4-04 · MINOR | not in this round's brief — not touched | — |
| W1-R4-05 · MINOR (owed orchestrator ruling) | not in this round's brief — not touched; the GRANT to `authenticated` stands | `00599` GRANT block |
| W1-R4-06 / 07 / 08 / 09 / 10 · NOTES | not in this round's brief — not touched. W1-R4-07's invocation advice was **followed** when running the gates (see below). | — |

---

## W1-R4-01 + W1-R4-02 — the fix, exactly as the report's Fix text specifies

The round-3 first key (`(active non-guest member count) > 1`) was a **proxy the member controls**:
`organization_members`' only INSERT policy is `is_org_admin_or_owner(organization_id) AND (role <> 'owner')`,
and 00295's `fc_provision_studio_on_designer` makes her the **owner** of her personal workspace — so she can
seat a second, non-owner member there through RLS from the browser, the count key ties, the rate-existence key
ties, and `(membership.role = 'owner') DESC` hands the pricing back to her own self-set number.

The ladder now reads, in this order — **arm's-length rate first, bare rate-existence second, multi-member third**,
with **no `OR count = 1` escape** anywhere (`00599:279-297`):

```sql
    ORDER BY EXISTS (
               SELECT 1 FROM public.studio_member_rates AS arms_length
               WHERE arms_length.studio_id = studio.id
                 AND arms_length.user_id   = p_user_id
                 AND arms_length.created_by IS DISTINCT FROM p_user_id
             ) DESC,
             EXISTS (
               SELECT 1 FROM public.studio_member_rates AS priced
               WHERE priced.studio_id = studio.id
                 AND priced.user_id   = p_user_id
             ) DESC,
             ((
               SELECT count(*) FROM public.organization_members AS peer
               WHERE peer.organization_id = studio.id
                 AND peer.status = 'active'
                 AND peer.role <> 'guest'
             ) > 1) DESC,
             (membership.role = 'owner') DESC,
             membership.joined_at NULLS LAST,
             membership.created_at,
             studio.created_at,
             studio.id
```

### Postcondition (`00599:553-572`)

The round-3 ordering assert (`peer\.organization_id = studio\.id[\s\S]*priced\.studio_id = studio\.id`) is
**replaced** — it now asserts the opposite order and would have failed. Two asserts take its place:

1. the arm's-length key **exists** — `!~ 'arms_length\.created_by IS DISTINCT FROM p_user_id'` raises;
2. the **key order is pinned as text** — `!~ 'arms_length\.studio_id = studio\.id[\s\S]*priced\.studio_id = studio\.id[\s\S]*peer\.organization_id = studio\.id'` raises.

Everything else in the postcondition block is untouched: `priced\.studio_id = studio\.id` (W1-R2-02),
`studio\.created_at` (W1-R2-02), `peer\.organization_id = studio\.id` (W1-R3-01, now the third key),
`pg_trigger_depth() > 0` (W1-R2-03), the three round-1 asserts, the `anon` EXECUTE assert and the two
cut-leg asserts.

### New test cases

- **(r)** `time_rate_resolution_test.sql:1222-1366` — shaped like **probe B**: the member's personal workspace
  is made multi-member by a **collaborator INSERT through RLS, performed as her** (`pg_temp.assume_user` →
  `INSERT INTO public.organization_members … role 'member'`), precondition `r0c` asserts the seat landed
  (`> 1` member), she self-sets 99900 through `studio_member_rates_admin_insert`, the studio owner writes the
  arm's-length 15000, and preconditions `r0d`/`r0e` pin which row is self-authored and which is arm's-length.
  Asserts `r1` (≠ 99900), `r2` (= 15000), `r3` (`studio_member`), `r4` (30000 on 120 min), `r5` (resolver and
  classifier agree). This is what case (p) cannot catch — `p0b` pins the workspace at exactly one member.
- **(s)** `time_rate_resolution_test.sql:1368-1452` — probe A: a designer priced 18000 in her own one-person
  studio who is also an active plain member of a multi-member studio that has **never** priced her.
  Asserts `s1` (`rate_source <> 'none'`), `s2` (= 18000), `s3` (`studio_member`), `s4` (36000).

### Both new cases are negative-controlled against the round-3 body

The round-3 function body was installed on the live stack (body only, so the new postcondition could not
refuse it), the file re-run, and the round-4 body restored:

```
== round-3 ladder installed ==
NOTICE:  time_rate_resolution: case (p) passed.
NOTICE:  time_rate_resolution: case (q) passed.
ERROR:  FAIL r1 (W1-R4-01, HT-3 + HT-1): seating one collaborator in her own workspace bought her
        the multi-member proxy and her self-set rate priced the hour again
== round-4 ladder restored ==
```

and, with case (r) elided so (s) could be reached:

```
ERROR:  FAIL s1 (W1-R4-02): a studio that has never priced her won the ladder and the hour resolved
        to 'none' — $0 into the unbilled view, the balance, the composer and the invoice lock
```

Under the shipped round-4 ladder, on a clean reset, every case (a)–(s) prints `passed`:

```
NOTICE:  time_rate_resolution: case (p) passed.
NOTICE:  time_rate_resolution: case (q) passed.
NOTICE:  time_rate_resolution: case (r) passed.
NOTICE:  time_rate_resolution: case (s) passed.
NOTICE:  All time_rate_resolution assertions passed.
```

The `OR (member count) = 1` escape the report measured as failing case (p) was **not** written.

---

## Gates (this fix round)

| command | result |
|---|---|
| `npx supabase db reset --workdir …/agent-server` | **clean** — `00595`…`00601` + `20260910152111` applied, 22 seeds, every postcondition replayed (run twice: once after the edit, once as the final state) |
| `run-sql-tests.sh -d supabase/tests/billing -f rate -H 127.0.0.1 -p 54422` | **1 / 1 green**, 0 unexpected |
| `run-sql-tests.sh -d supabase/tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green**, 0 unexpected |
| `run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` | **10 green + 6 expected-fail = 16 / 16**, 0 unexpected — unchanged (per W1-R4-07 the suite is run worktree-relative with `-k`; the brief's absolute-path form reports 6 unexpected failures purely because `KNOWN_FAILURES.md` entries are matched against cwd-relative names) |
| `run-sql-tests.sh -d supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **1 / 1 green** |
| `run-sql-tests.sh -d supabase/tests/rls -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422` | **24 green + 2 expected-fail = 26 / 26**, 0 unexpected |
| `python3 scripts/generate-legacy-grants.py` → `git status --porcelain -- supabase/seed/00-legacy-grants.sql` | **empty** — no GRANT/REVOKE changed, regenerated seed byte-identical (baseline + 2610 replayed statements) |
| `SUPABASE_DB_URL=…:54422 pnpm --dir …/agent-server db:generate` → `git diff --exit-code packages/supabase/src/database.types.ts` | **clean** — the function's signature and return shape are unchanged, so no type drift |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | **clean** |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | **clean** |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | **green** |
| `git status --porcelain` | only the two files above |

## Not done / not verified

- **Nothing on Strata.** No `db push`, no prod probe.
- **W1-R4-03 (lane B)** — ruled out of scope for lane A, deferred to phase 2. Done-when #3's live-mode render
  half and Done-when #5's printed role remain unverified for the wave.
- **W1-R4-04, -05** (minors) and the five notes — not in this round's brief, not touched.
- **Concurrency** — no two-session race of the close ladder.

## Commit / push

- commit `0427f2c1e` on `hour-tracking/server`, pushed to `origin/hour-tracking/server`
  (`fc65be3c2..0427f2c1e`). `git show --stat` re-read: exactly the two files above,
  +344 / −19. `supabase/config.toml` not staged, still `S`.
- The pre-push hook printed **"Affected verification has advisory failures"** (advisory; the push
  completed). Re-run in isolation, the sole failure is `pnpm --filter @patina/client-portal lint`
  — 10 pre-existing ESLint errors in `apps/client-portal/src/**` (`react-hooks/set-state-in-effect`
  and friends). No client-portal file appears in this commit's diff (two SQL files), and only
  designer-portal has a working ESLint config per CLAUDE.md, so this is unrelated pre-existing debt,
  not a regression from this round.
