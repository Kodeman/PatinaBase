# Known SQL Test Failures

Files listed here are expected to exit non-zero (or, for accepted local-image
divergences, to differ from their staging/prod behavior) when run via
`scripts/run-sql-tests.sh`. The runner treats a listed file's exit code as
expected and excludes it from the unexpected-failure count.

Format — one entry per file, exactly this shape so the runner's parser can
read it:

```
- `relative/path/from/repo/root.sql` — reason, on one line
```

Everything below was diagnosed during the A1 SQL-test-suite repair
(2026-08-18/19). None of these are the `pg_temp` permission-denied family —
that family (55 files, ~84 files touch `pg_temp` at all) is fixed. These 23
residuals split into three groups with very different confidence:

- **Group 1 — benign, verified.** A local-Supabase-CLI-image divergence from
  staging/prod, characterized down to the exact catalog rows. Safe to treat as
  permanently expected on this image.
- **Group 2 — real gaps, likely prod-relevant, NOT fixed here.** Diagnosed to
  a specific missing `GRANT` or a migration-defined RPC/trigger body that
  itself violates a later constraint. Fixing these means editing a migration
  or shipping a new one — explicitly out of scope for this workstream ("never
  migration-side"). Flagged for follow-up, not closed.
- **Group 3 — business-logic / fixture drift, undiagnosed to root cause.**
  The failing assertion and its message are identified, but *why* the
  behavior drifted (a later migration changed a guard, a policy count, an
  ordering) was not chased down. Not obviously trivial or obviously test-side,
  so left alone per the "diagnose briefly ... else document" instruction
  rather than risk a wrong fix.

## Group 1 — benign local-image divergence (EVENT 3)

`supabase/tests/edge_api/public_acl_exception_registry.sql`'s "EVENT 3"
comment (search that file for `EVENT 3`) explains this precisely:
`extensions.pg_stat_statements` / `.._info` are `postgres`-owned on
staging/prod, so migration `00486_public_acl_residual_closure.sql`'s REVOKE
closes them for real there. On the local Supabase CLI image the same two
relations are `supabase_admin`-owned, so the same REVOKE is a silent no-op
and they remain a live local finding (2 unregistered PUBLIC grants). All
three files below assert against the same shared
`public_acl_public_grant_finding` view and hit this identical residual.

- `supabase/tests/edge_api/catalog_roles_test.sql` — exits 3 by design on the local image: `PROVISIONING BLOCKED: ... unregistered_public_grants=2 ...` — the pg_stat_statements/local-image residual described above (EVENT 3 in public_acl_exception_registry.sql). Vars fix (-v HOST -v PORT) makes it *runnable*; this residual is what remains.
- `supabase/tests/edge_api/catalog_roles_remote_conformance_test.sql` — same root cause: `REMOTE ACL CONFORMANCE FAILED: ... relation_acl=2 ...` then a `division by zero` in its own ratio calc once that count is nonzero. Same EVENT 3 residual.
- `supabase/tests/edge_api/platform_acl_compatibility_test.sql` — same root cause via the same shared view: `PUBLIC holds a reachable schema, relation, sequence or column privilege that is not a signed registry exception`.

Note: `catalog_roles_remote_conformance_negative_test.sql` (the third file in
this trio per the brief) is GREEN once run with `-v HOST -v PORT` — it is not
listed here.

## Group 2 — real grant/authority gaps (migration-side, not fixed)

Each of these traces to a specific role lacking a privilege that its own
call site (test fixture *or*, in two cases, production RPC code) assumes it
has. All are plausibly prod-relevant; none are touched here.

- `supabase/tests/agent_os/roles_test.sql` — `permission denied for table agent_tasks`. `agent_writer`'s direct INSERT into `agent_tasks` (the test's own documented case 1) is denied at the table-grant layer before RLS is even evaluated. Needs a grant audit for `agent_writer` against current `agent_tasks` privileges.
- `supabase/tests/commercial/trade_rfq_test.sql` — `mint role refusal: 'permission denied for function mint_trade_rfq_token'`. The test expects `authenticated` to reach `public.mint_trade_rfq_token`'s own internal check and get its custom message (`'minting a trade RFQ link requires service_role'`); instead Postgres's ACL layer denies it first because `authenticated` has no EXECUTE on the function at all. If real app code calls this as `authenticated`, it is broken in the same way today.
- `supabase/tests/mood_boards/share_security_test.sql` — `permission denied for function is_project_team_member`. A `storage.objects` RLS policy on the `proposal-mood-boards` bucket references `public.is_project_team_member(...)`; `anon` has no EXECUTE on it, so an anonymous SELECT against that bucket raises a raw Postgres permission error instead of evaluating the policy to false/no-rows. Same class of gap as the two above.
- `supabase/tests/document/close_project_readiness_test.sql` — `permission denied for table project_ffe_items`. Confirmed via `information_schema.role_table_grants`: `authenticated` holds only SELECT on `public.project_ffe_items` (INSERT/UPDATE/DELETE were REVOKEd from `authenticated` by the migration history itself — `00-legacy-grants.sql` replays it faithfully, so this matches prod). The test does a direct `UPDATE ... SET status = 'installed'` as `authenticated`; real app code must go through an RPC for this transition, and the fixture needs to be updated to do the same. Not attempted — the correct RPC/call shape for this specific transition wasn't identified.
- `supabase/tests/document/journey_authority_integrity_test.sql` — same `project_ffe_items` grant boundary as above, different call site.
- `supabase/tests/commercial/trade_scope_test.sql` — `non-room assignment cannot carry a room`, but **not** a test-fixture bug: traced into `public.engage_trade_scope` (defined in `00475_schedule_ceremony_anchors.sql`) itself, whose own `INSERT INTO project_ffe_items` doesn't set `assignment_scope`. This is the identical bug fixed in 4 sibling test files' *fixtures* (see 00434→00438 note below), but here it lives in shipped RPC code, which is migration-side and out of scope for this workstream.
- `supabase/tests/document/client_scope_change_request_test.sql` — same root cause as above, inside `public.apply_scope_change`.

## Group 3 — business-logic / fixture drift (root cause not chased to completion)

The first four share a fixture bug that **was** fixed here (`INSERT INTO
project_ffe_items` without `assignment_scope`, needed since
`00438_ffe_release_security_hardening.sql` replaced the auto-deriving
version of `guard_project_ffe_selection_integrity()` from
`00434_ffe_privacy_domain_foundation.sql` with one that requires it
explicit) — that fix is applied and these files now fail on a *different,
deeper* assertion, unrelated to the fixture bug:

- `supabase/tests/commercial/authorized_schedule_test.sql` — now fails at `schedule line ... is not ready for authorization: ["designDisposition"]` from `_create_furnishings_authorization_from_schedule_impl`. A readiness-gate/fixture drift in the schedule-authorization domain.
- `supabase/tests/commercial/design_services_authority_test.sql` — same `designDisposition` readiness-gate failure, same function.
- `supabase/tests/commercial/executed_on_paper_test.sql` — same `designDisposition` readiness-gate failure, same function.
- `supabase/tests/commercial/design_services_gap_hardening_test.sql` — `legacy release blocked by the wrong guard: 'schedule line ... is not ready for authorization: ["designDisposition"]'` — same family; the test's own message implies it already suspects a guard-ordering regression.

Un-related residuals, each a genuine assertion failure whose root cause
(a later migration changing a guard, a policy count, or an ordering) was
identified only down to the failing message, not chased further:

- `supabase/tests/library/product_configuration_test.sql` — `issued cabinetry must lock the exact approved snapshot on the FF&E spec`.
- `supabase/tests/notifications/unconfirmed_analytics_test.sql` — `active service role must not read user-owned campaign analytics`.
- `supabase/tests/procurement/state_chain_test.sql` — `authentication required to link a configured line to a purchase order`. Runs as the unrestricted session owner (no actor assumed) at that point; a trigger apparently now requires `auth.uid()` to be set where it previously didn't.
- `supabase/tests/proposals/proposal_builder_atomicity_test.sql` — `proposal board room belongs to another proposal`.
- `supabase/tests/proposals/proposal_policy_locking_integrity_test.sql` — `all thirteen installed-client SELECT-only policies must remain` (a policy-count assertion — the live count no longer matches 13).
- `supabase/tests/proposals/proposal_signature_authority_test.sql` — `owner_insert_requires_owner`.
- `supabase/tests/rls/design_requests_test.sql` — `FAIL 3b: expected no_scans, got <none>` (a case that should raise a specific error no longer does).
- `supabase/tests/rls/studio_titles_test.sql` — `FAIL f: demoting the sole active owner should raise last_owner_protected` (same shape — an expected guard no longer fires). Cross-ref project memory: studio co-member RLS has a documented SECURITY DEFINER requirement that may be implicated.
- `supabase/tests/spec_books/security_and_lifecycle_test.sql` — `only service_role may finalize rendered issues` (the test's own custom ASSERT message; the finalize-lifecycle guard it exercises no longer behaves as written).

## Fixed during this pass (for context, not failures)

Not KNOWN_FAILURES entries — recorded here only so a future reader doesn't
re-diagnose them: the `pg_temp` permission-denied family (55 files) was fixed
via either reordering the `pg_temp.assume_*` call before the following `SET
LOCAL ROLE`, or an explicit `GRANT EXECUTE ON FUNCTION pg_temp.<fn>(...) TO
PUBLIC` right after the helper's definition — see `scripts/run-sql-tests.sh`
and the commit history on branch `fix/sql-test-suite-pg-temp` for the full
file list. A related but distinct sub-family — creating a *new* `pg_temp`
object (a trigger function, or a `CREATE TEMP TABLE`) while already
impersonating a restricted role via `SET LOCAL ROLE` — fails with
`permission denied for schema pg_temp_N` instead, because
`00483_public_acl_allowlist.sql` deliberately revokes database `TEMPORARY`
from `authenticated`/`anon`/`service_role` (asserted at the bottom of 00483
itself); the fix there is `RESET ROLE` (or reordering) before the temp-object
DDL, never a grant — granting `TEMPORARY` back would undo an intentional
security boundary. Three files needed this second fix:
`document/begin_discovery_atomicity_test.sql`,
`proposals/proposal_copy_immutability_test.sql`, and
`workflow/approval_authority/00464_lifecycle_compatibility_contract_test.sql`.
