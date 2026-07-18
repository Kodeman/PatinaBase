# Agent OS roles runbook

Least-privilege Postgres roles for server-side agent code, introduced in migration
`00299_agent_roles.sql`. Companion to the queue contract (`00297_agent_tasks_queue.sql`,
`00298_agent_tasks_cowork_bridge.sql`) and the queue-groom job (`00300_queue_groom.sql`).

Migration `00378_agent_task_lease_ownership.sql` adds two trusted-worker fences:
`complete_agent_task` and `enqueue_agent_successor_if_owned` both require the
exact nonblank actor that owns the running task. The successor RPC holds the
owner row `FOR UPDATE` while delegating to the unchanged conflict-ignore
`enqueue_agent_task`, so lease reclaim and orchestration advance cannot race.
Its required `p_owner_task_id` is lease authority and is intentionally separate
from the child row's optional `p_parent_task_id` lineage. It is
`service_role`-only. Root/intake producers (including `agent_writer`)
continue to use generic `enqueue_agent_task`; `p_actor` on that generic RPC is
audit attribution, not lease authority.

## 1. What the roles are

Two cluster-level, `NOLOGIN` Postgres roles. Neither can be connected to directly — they
exist purely as a `SET ROLE` target for a session that is already authenticated some
other way.

| Role | Attributes | Grants | Purpose |
|---|---|---|---|
| `agent_reader` | `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOLOGIN` | Member of `pg_read_all_data` (`WITH INHERIT TRUE` — see §5.1), or the explicit-grant fallback (§5.1). Advisory `default_transaction_read_only = on`. | Broad read access for agent code that only needs to look at data — never call this from a code path that also writes. |
| `agent_writer` | same NOLOGIN/NOSUPERUSER/etc. profile | `USAGE` on `public`; `SELECT, INSERT` on `public.agent_tasks` (plus matching RLS policies scoped to `agent_writer`, §2.1); `EXECUTE` on `enqueue_agent_task` only. | The only way agent code should ever create work. No `UPDATE`/`DELETE` grant exists anywhere for this role — claim/complete/review/requeue/cancel stay `service_role`-only, called from trusted server code, never from `agent_writer`. |

Both roles are cluster-level and **outlive `supabase db reset`** (reset recreates the
database, not the Postgres cluster) — every `CREATE ROLE` in 00299 is guarded by a
`pg_roles` existence check, and every `GRANT`/`ALTER ROLE` re-runs harmlessly.

### 1.1 Why `agent_reader` doesn't bypass RLS

`pg_read_all_data` is NOT `BYPASSRLS`. A query run as `agent_reader` against an
RLS-enabled table with no policy that matches a `NOLOGIN` role invoked via `SET ROLE`
(most existing policies check `auth.uid()` against `authenticated`, which `agent_reader`
is not) will succeed but return **zero rows**, not an error. "Broad read" in practice
today means "every SELECT succeeds, but RLS still filters most tables to nothing for
this role" — it is not yet a working "read anything" capability. Extending it further
(either granting `BYPASSRLS`, which is a materially stronger capability than what this
migration ships, or adding per-table SELECT policies scoped to `agent_reader`) is a
deliberate future decision, not an oversight — flag it if an agent workload actually
needs to read an RLS-protected table it currently can't see through.

## 2. SET ROLE — the server-side usage pattern

Agent code (a Deno edge function, a NestJS service, a script — anything holding a
Postgres connection as `postgres` or, on Strata, `service_role`) does this per request,
never at connection-pool setup time:

```sql
BEGIN;
SELECT set_config('app.actor', 'agent:<name>', true);   -- audit actor, see §4
SET LOCAL ROLE agent_writer;                              -- or agent_reader
-- ... do the read/write ...
COMMIT;   -- role reverts to the connection's real login role at transaction end
```

`SET LOCAL ROLE` (not bare `SET ROLE`) scopes the privilege drop to the current
transaction — the connection reverts to its real login privileges at `COMMIT`/`ROLLBACK`,
which matters for pooled connections that get reused across requests. `SET ROLE` (no
`LOCAL`) persists for the rest of the session and is the wrong choice for any pooled
connection.

The calling session must be a member of the target role. `00299` grants both roles to
`postgres` (`GRANT agent_reader TO postgres; GRANT agent_writer TO postgres;`) so this
works out of the box for any code running as `postgres`. On Strata, agent code more
likely runs as `service_role` — if so, add `GRANT agent_reader TO service_role;` /
`GRANT agent_writer TO service_role;` in a follow-up migration once the actual connecting
role for agent workloads is decided; note that Postgres superusers can `SET ROLE` to
anything regardless of an explicit `GRANT ... TO`, so this only matters for non-superuser
connecting roles (Strata's `postgres` role is not a true superuser).

### 2.1 Why `agent_writer` also needs RLS policies, not just a table GRANT

`00297` deliberately ships `public.agent_tasks` with **no** `INSERT`/`UPDATE`/`DELETE`
RLS policy at all — by design, writes were meant to go exclusively through the
`SECURITY DEFINER` RPCs (which run as the function owner and bypass RLS) or
`service_role` (which carries `BYPASSRLS`). `agent_writer` is neither of those — it is a
genuine non-bypassing role holding a real table-level `INSERT` grant, so without its own
RLS policy that grant is inert: RLS says no regardless of the grant. `00299` adds two
policies scoped `TO agent_writer` specifically (never `authenticated`/`anon`/`PUBLIC`):

```sql
CREATE POLICY agent_tasks_select_agent_writer ON public.agent_tasks
  FOR SELECT TO agent_writer USING (true);
CREATE POLICY agent_tasks_insert_agent_writer ON public.agent_tasks
  FOR INSERT TO agent_writer
  WITH CHECK (
    status IN ('queued','awaiting_review')
    AND review_state IS NULL
    AND completed_at IS NULL
  );
```

The `INSERT` policy's `WITH CHECK` is not permissive by design — it mirrors
`enqueue_agent_task`'s `p_status` gate (`queued | awaiting_review`; `awaiting_review`
stays allowed because it is the intake-bridge landing status) and pins
`review_state`/`completed_at` to `NULL`. This is the forgery guard: 00297's state-machine
trigger is `BEFORE UPDATE OF status` **only** — it does not constrain INSERTs — so a
permissive policy would let an `agent_writer` session INSERT a row born
`status='approved'` (or `'done'`, or carrying a fabricated `review_state`), minting a
self-approved task that downstream executors would treat as having passed human review.
`roles_test.sql` asserts all three edges: born-`approved` fails, forged `review_state`
fails, born-`awaiting_review` succeeds.

The `SELECT` policy isn't just for symmetry — without it, `INSERT ... RETURNING` on a raw
`agent_writer` insert silently returns **zero rows** instead of the new row (Postgres
filters `RETURNING` through the table's `SELECT` policy), which would look like a working
insert that mysteriously never returns an id. This was caught empirically while writing
`supabase/tests/agent_os/roles_test.sql` — the first version of `00299` granted the table
privilege but not the policy, and `agent_writer`'s direct insert failed with "new row
violates row-level security policy," not a grant error.

In practice, prefer calling `enqueue_agent_task` (SECURITY DEFINER, always works, applies
idempotency-key dedupe) over a raw `agent_writer` table insert — the raw insert path
exists and is tested because a future caller with only a plain Postgres client (no RPC
wrapper) needs it to work, and because the test suite needed to exercise the actual grant
rather than only the RPC's bypass path.

## 3. PostgREST JWT-claim fallback (documented, not built)

If a future surface needs `agent_reader`/`agent_writer` reachable over PostgREST (the
Supabase REST API) instead of a direct Postgres connection, the standard Supabase pattern
is:

```sql
GRANT agent_writer TO authenticator;   -- 'authenticator' is PostgREST's connecting role
```

...combined with a JWT whose `role` claim is `agent_writer` (PostgREST does
`SET LOCAL ROLE <claim>` per-request when the claim role is a role the `authenticator`
role is a member of). This is **not implemented** — no JWT-issuing path exists yet, and
`authenticator` is not currently granted membership in either role. It's recorded here so
whoever builds an agent-facing HTTP surface doesn't have to rediscover the pattern; when
it's built, add the `GRANT ... TO authenticator` in its own migration (with a clear
comment on which surface issues the JWTs and how the `role` claim is populated) rather
than pre-emptively granting it now with nothing to constrain who can mint such a JWT.

## 4. Audit-actor nuance under SET ROLE

`agent_task_audit` rows get their `actor` from `current_setting('app.actor', true)`
(falling back to `auth.uid()`/`session_user`) — **not** from `current_user` or
`session_user`. Under `SET ROLE agent_writer`, `session_user` stays the original login
role (e.g. `postgres`) even though `current_user` becomes `agent_writer` — so without an
explicit `set_config('app.actor', ...)` call, every audit row from every `agent_writer`
session would show the same generic actor (`postgres` or whatever the pool's login role
is), with no way to distinguish which agent/run produced it. **Always** call
`PERFORM set_config('app.actor', 'agent:<name>', true)` (or a more specific identifier —
task id, run id, whatever disambiguates the caller) as the first statement of the
transaction, before doing anything under `SET LOCAL ROLE`. This is exactly the pattern
`groom_agent_tasks()` uses for its own writes (`app.actor = 'job:queue-groom'`) and that
`supabase/tests/agent_os/roles_test.sql` verifies end-to-end (insert as `agent_writer`
with a stamped actor, then read back the resulting `agent_task_audit` row as the
unprivileged-role-reset session and confirm the actor matches).

## 5. Out-of-band LOGIN enablement (Strata only, never in git)

Both roles ship `NOLOGIN` by design — nothing in a migration or in this repo should ever
give either role a password. If a workload genuinely needs a **direct** Postgres
connection as `agent_reader` (as opposed to a `service_role`/`postgres` connection that
`SET ROLE`s in), enable it by hand, outside version control:

1. In the Strata SQL editor (never via a migration file):
   ```sql
   ALTER ROLE agent_reader LOGIN PASSWORD '<generated — do not reuse any existing secret>';
   ```
2. Generate the password with a real secret generator (not something typed into an SQL
   editor field by hand), and store it in Supabase Vault immediately — never in `.env`,
   never in a commit, never in chat history.
3. Connect via the **session pooler** (not the direct connection string, and not the
   transaction pooler — custom roles need session-level `SET`/pinned-connection
   semantics that the transaction pooler doesn't guarantee), using the pooler's
   per-role username convention: `agent_reader.<project-ref>` (i.e.
   `agent_reader.bkvcixdmuyejfzcijpdg` for Strata).
4. To revoke, `ALTER ROLE agent_reader NOLOGIN;` and rotate/delete the Vault secret. This
   is the ONLY supported way either role should ever become directly connectable — if you
   find a password already set for either role and don't know why, treat it as a
   possible compromise, not a feature.

`agent_writer` should essentially never need direct LOGIN — its only sanctioned action
(`enqueue_agent_task`) is one RPC call, always reachable from something that already has
a `service_role`/`postgres` connection to `SET ROLE` from. Prefer that over ever giving
`agent_writer` a password.

## 6. ⚠ Strata runtime verifications

`00299`/`00300` were written, applied, and tested entirely against local Supabase
(confirmed Postgres 17.6.1, matching Strata's confirmed 17.6.1 — checked via the Supabase
MCP `get_project` call before choosing the `WITH INHERIT TRUE` syntax below, so no
version-skew surprise is expected). The three items below are still genuinely
Cloud-permission-dependent and unverified until the migration actually lands on Strata via
`supabase db push`. Fill in the boxes when that happens — this file, not memory, is the
record.

- [x] **(1) `GRANT pg_read_all_data TO agent_reader WITH INHERIT TRUE` — did it succeed on
      the `db push`, or did the `EXCEPTION WHEN insufficient_privilege` fallback WARNING
      fire?** Locally it succeeds (`postgres` is effectively superuser-equivalent
      locally). Strata's `postgres` role is not a true superuser, so this is a real
      unknown. Check the `db push` output for:
      `WARNING: agent_roles (00299): GRANT pg_read_all_data TO agent_reader was denied...`
      If it fired, confirm the fallback actually took effect:
      `SELECT has_table_privilege('agent_reader', 'public.products', 'SELECT');` should
      return `true` either way (via `pg_read_all_data` membership or the fallback
      per-table grants + `ALTER DEFAULT PRIVILEGES`).
      Result: **SUCCEEDED — primary path, fallback NOT taken (Wave 0 deploy, `supabase db push`
      2026-07-12, migration 00299 on Strata).** The push emitted **no** `insufficient_privilege`
      WARNING for either wrapped block. Confirmed live on Strata (`bkvcixdmuyejfzcijpdg`):
      `SELECT roleid::regrole::text, inherit_option FROM pg_auth_members WHERE member='agent_reader'::regrole`
      → `pg_read_all_data`, **`inherit_option = true`** (so membership is auto-activated under
      `SET ROLE` despite `agent_reader` being NOINHERIT). `has_table_privilege('agent_reader',
      'public.products','SELECT')` = `true`. `SET ROLE agent_reader; SELECT count(*) FROM products`
      ran without error and returned **0 rows** — RLS filters as designed (§1.1), not a failure.

- [x] **(2) Did `ALTER ROLE agent_reader SET default_transaction_read_only = on` stick?**
      Verify directly rather than trusting the absence of a WARNING:
      ```sql
      SELECT rolconfig FROM pg_roles WHERE rolname = 'agent_reader';
      -- expect: {default_transaction_read_only=on}
      ```
      This is advisory only — per §1, the real enforcement is that `agent_reader` holds
      zero write grants regardless of this GUC's outcome — but record what actually
      happened for anyone debugging a later "why did this write succeed/fail" question.
      Result: **STUCK — succeeded, no WARNING (Wave 0 deploy, 2026-07-12).** Verified live on
      Strata: `SELECT rolconfig FROM pg_roles WHERE rolname='agent_reader'` →
      `{default_transaction_read_only=on}`. (`agent_writer` rolconfig is `NULL`, as intended.)

- [ ] **(3) Does the Strata session pooler accept a custom-role login at all?** This only
      matters if/when §5's out-of-band LOGIN enablement is actually exercised. Confirm
      with a real connection attempt as `agent_reader.<project-ref>` through the session
      pooler host/port (not the direct connection string) after step 5.1–5.3, and record
      whether it connects, and if not, the exact error.
      Result: **NOT YET TESTED / N/A as of Wave 0 deploy (2026-07-12) — box left unchecked
      deliberately.** No out-of-band LOGIN enablement (§5) has been performed; both roles remain
      `NOLOGIN`, so the session-pooler custom-role path (`agent_reader.bkvcixdmuyejfzcijpdg`) has
      no login to exercise. Re-verify and check this box only if/when a direct `agent_reader`
      login is ever enabled per §5.

## 7. Files

- `supabase/migrations/00299_agent_roles.sql` — role creation, grants, RLS policies.
- `supabase/migrations/00300_queue_groom.sql` — `job_runs` table + `groom_agent_tasks()` +
  its cron schedule (not role-related, but the roles' primary consumer today is the
  groom job's own `service_role`-only execution path).
- `supabase/tests/agent_os/roles_test.sql` — SQL assertions for both roles' read/write
  boundaries and the audit-actor behavior under `SET ROLE`.
- `supabase/tests/agent_os/groom_test.sql` — SQL assertions for `groom_agent_tasks()`.
