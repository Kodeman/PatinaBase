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
that family (55 files, ~84 files touch `pg_temp` at all) is fixed. The 23
residuals split into three groups with very different confidence. One of the 23
(`document/client_scope_change_request_test.sql`) was subsequently closed by
`00510_post_00483_grant_and_scope_repairs.sql`, leaving **22**:

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

## Group 1 — local-image / platform divergence

The EVENT 3 pg_stat_statements residual that used to fill this group is closed
locally by `scripts/run-sql-tests.sh` (see "Closed by the runner's EVENT 3
parity step" below). One file remains, for a different reason:

- `supabase/tests/edge_api/platform_acl_compatibility_test.sql` — 2026-10-06 (SQ-459): now gets past `$public_lockdown$` and `$platform_schema_usage$` (the two blocks Kody's PUBLIC-residual ruling re-scoped) and aborts at `:323`, `an Auth/RLS helper is missing a required named EXECUTE grant`. That is the first of the eight blocks the file's own header (`:17-36`) calls EXPECTED-RED and "a separate, un-ruled piece of work". `auth.uid/role/email/jwt` are `supabase_auth_admin`-owned with EXECUTE reaching anon/authenticated/service_role only through PUBLIC (`=X/supabase_auth_admin`); prod `bkvcixdmuyejfzcijpdg` shows the identical ACL (read-only SELECT, 2026-10-06), so this is not a local-image gap and no local step can or should change it. Going green needs that re-scope ruling, not a grant.

## Group 2 — real grant/authority gaps (migration-side, not fixed)

Each of these traces to a specific role lacking a privilege that its own test
fixture assumes it has. All are plausibly prod-relevant; none are touched here.

Three entries that stood in this group — `mood_boards/share_security_test.sql`,
`commercial/trade_scope_test.sql` and
`document/client_scope_change_request_test.sql` — were the migration-side cases,
and `00510_post_00483_grant_and_scope_repairs.sql` closed all three root causes.
See "Closed by 00510" below.

The four entries that remained here were closed test-side in 2026-10 (US-17
S2); see "Closed by test repair (US-17 S2)" below. The group is now empty.

## Group 3 — business-logic / fixture drift (root cause not chased to completion)

The first five share a fixture bug that **was** fixed here (`INSERT INTO
project_ffe_items` without `assignment_scope`, needed since
`00438_ffe_release_security_hardening.sql` replaced the auto-deriving
version of `guard_project_ffe_selection_integrity()` from
`00434_ffe_privacy_domain_foundation.sql` with one that requires it
explicit) — that fix is applied and these files now fail on a *different,
deeper* assertion, unrelated to the fixture bug:

**Failure points re-measured 2026-09-11** (hour-tracking W0 review round 1). Four
of these five now abort EARLIER than the `designDisposition` readiness gate
recorded below — inside `_countersign_design_services_agreement_impl`, at
`design services agreement <uuid> not found or access denied`. The
`designDisposition` diagnosis is kept in each entry because it is where the file
stopped in 2026-08, and the new, earlier failure has not been diagnosed to a root
cause; both are recorded so a reader does not re-diagnose the old one. Proven
pre-existing, not hour-tracking's: the same five fail identically on a replay of
`origin/hour-tracking/integration` (545 migrations, none of W0's) and none of
W0's migrations touches the countersign path. **Consequence for any wave gating
on this directory: `supabase/tests/commercial` exercises 10 of its 16 files and
the four countersign files stop BEFORE their authority asserts — never report
"commercial green" as coverage of the authority rate path.**

- `supabase/tests/commercial/authorized_schedule_test.sql` — 2026-09-11: aborts at `:308`, `design services agreement d7300000-... not found or access denied`. Previously (2026-08) failed later at `schedule line ... is not ready for authorization: ["designDisposition"]` from `_create_furnishings_authorization_from_schedule_impl`. A readiness-gate/fixture drift in the schedule-authorization domain.
- `supabase/tests/commercial/design_services_authority_test.sql` — 2026-09-11: aborts at `:177`, `design services agreement d5300000-... not found or access denied`, i.e. 44 lines before its three `project_unbilled_time` asserts at `:221,349,362` — so those asserts do not run. (The hour-tracking program therefore pins the repaired view's design-services arm in `supabase/tests/billing/time_unbilled_view_repair_test.sql` case (c) instead.) Previously: same `designDisposition` readiness-gate failure as above.
- `supabase/tests/commercial/executed_on_paper_test.sql` — 2026-09-11: aborts at `:214`, `design services agreement ea300000-... not found or access denied`. Previously: same `designDisposition` readiness-gate failure, same function.
- `supabase/tests/commercial/design_services_gap_hardening_test.sql` — 2026-09-11: aborts at `:128`, `proposal d6300000-... failed canonical project provenance`. Previously: `legacy release blocked by the wrong guard: 'schedule line ... is not ready for authorization: ["designDisposition"]'` — same family; the test's own message implies it already suspects a guard-ordering regression.
- `supabase/tests/commercial/trade_scope_test.sql` — MOVED here from Group 2 by `00510`. Its Group 2 cause (`non-room assignment cannot carry a room`, raised inside `public.engage_trade_scope` itself, which inserted `project_ffe_items` without `assignment_scope`) is fixed: 00510 set `assignment_scope` explicitly in the RPC body. 2026-09-11: aborts at `:196`, `design services agreement d8300000-... not found or access denied`. Previously it ran the whole engagement ceremony and failed ~320 lines later at `schedule line ... is not ready for authorization: ["designDisposition"]`.

Un-related residuals, each a genuine assertion failure whose root cause
(a later migration changing a guard, a policy count, or an ordering) was
identified only down to the failing message, not chased further:

- `supabase/tests/library/product_configuration_test.sql` — `issued cabinetry must lock the exact approved snapshot on the FF&E spec`.
- `supabase/tests/notifications/unconfirmed_analytics_test.sql` — `active service role must not read user-owned campaign analytics`.
- `supabase/tests/procurement/state_chain_test.sql` — `authentication required to link a configured line to a purchase order`. Runs as the unrestricted session owner (no actor assumed) at that point; a trigger apparently now requires `auth.uid()` to be set where it previously didn't.
- `supabase/tests/proposals/proposal_builder_atomicity_test.sql` — `proposal board room belongs to another proposal`.
- `supabase/tests/proposals/proposal_signature_authority_test.sql` — `owner_insert_requires_owner`.
- `supabase/tests/commercial/direct_order_attribution_test.sql` — **CLOCK-DEPENDENT: fails only between 00:00 and 02:00 UTC**, at `:488`, `two roster designers on one day must file the order uncredited`. Added 2026-09-12 (hour-tracking W2 review round 10, finding W2-R10-05 — measured, not inferred). Mechanism: the tie fixture writes two `designer_clients` rows at `NOW() - INTERVAL '2 hours'` and `NOW() - INTERVAL '1 hour'` (`:120-122`) and the attribution rule groups them **by day**, so in the first two hours after UTC midnight the two timestamps fall on different dates, the tie dissolves, and the newer row credits a designer where the assert requires none (measured at 01:0x UTC: got `da000000-…-00d2`; the same file passes in the same minute under session TZ `America/Chicago`). **Not hour-tracking's file** (absent from every W2 branch diff) and listed here because the W2 gate runs this directory and two rounds of review reported the commercial baseline as "six documented" while it is seven in that window. The one-expression repair, if a later hand wants it: date both fixture rows off `(NOW() AT TIME ZONE 'UTC')::date`, or push them to `NOW() - INTERVAL '26 hours'` / `'25 hours'` — the same treatment `supabase/tests/billing/time_rate_resolution_test.sql` and `supabase/tests/rls/time_entry_studio_stamp_test.sql` took for W2-R9-04.
- `supabase/tests/rls/design_requests_test.sql` — `FAIL 3b: expected no_scans, got <none>` (a case that should raise a specific error no longer does).
- `supabase/tests/rls/studio_titles_test.sql` — `FAIL f: demoting the sole active owner should raise last_owner_protected` (same shape — an expected guard no longer fires). Cross-ref project memory: studio co-member RLS has a documented SECURITY DEFINER requirement that may be implicated.
- `supabase/tests/spec_books/security_and_lifecycle_test.sql` — `only service_role may finalize rendered issues` (the test's own custom ASSERT message; the finalize-lifecycle guard it exercises no longer behaves as written).

## Closed by 00510 (removed from the lists above)

**NOTE for editors:** nothing in this section may use the
`- \`path\` — reason` bullet shape; the runner's parser would read it back as a
live allowlist entry and re-suppress a file that is now green.

The file `document/client_scope_change_request_test.sql` was a Group 2 entry
(`non-room assignment cannot carry a room`, raised inside
`public.apply_scope_change`). `00510_post_00483_grant_and_scope_repairs.sql` §S3
set `assignment_scope` explicitly in the RPC body. That file
is now **green** end to end and carries no entry.

One other Group 2 entry had its stated root cause closed by 00510 but is still
red on a later, unrelated assertion, so it moved to Group 3 rather than away:
`commercial/trade_scope_test.sql` (§S2).

`mood_boards/share_security_test.sql` followed the same path and has now left
the list entirely. 00510 closed its storage-policy root cause; its residual
`board not found or not accessible` from `public.create_board_share` was the
2026-08-12 project-board exclusion, reopened by `00548_project_board_share_links`
(board-paths D3). `00549_guest_board_share_reactions` then took the file off the
superuser bypass — its `create_board_share` calls now run under
`SET LOCAL ROLE authenticated`, so the edition-mint guard the file exists to
police actually runs. Green as of 2026-08-31.

Three policy-drift files left the list on 2026-10-06 (SQ-456), each because a
deliberate, shipped migration changed the policy set and the test was stale.
`field/field_capture_note_routing_test.sql` (7f) and
`capture_enrichment/target_type_visibility_test.sql` (c2) now pin the four
`field_captures_studio_*` legs that `00584_studio_comember_rls_sweep` added
(FC-R8 resolved as built: a studio co-member sees every capture, not only
inbox ones). `proposals/proposal_policy_locking_integrity_test.sql` now pins
eleven installed-client SELECT policies by name and asserts the two legacy and
two project-client board reads stay absent: `00462_workflow_privacy_authority`
§2 dropped them on purpose (working board rows are never raw client surfaces),
and `00434_ffe_privacy_domain_foundation` had already dropped the two
project-client ones.

## Closed by test repair (US-17 S2, 2026-10)

The same no-bullet-shape rule applies to this section. All four former
Group 2 files are green; in each case the platform's boundary was right and
the test was stale, so no grant, policy or guard changed.

`agent_os/roles_test.sql`: 00484 revoked every `agent_tasks` privilege from
`agent_writer` and dropped its RLS policies on purpose. Case 2 now asserts that
the direct INSERT is denied and that `enqueue_agent_task` writes the row and
its audit actor. The forgery guard is now the RPC's `p_status` gate.

`commercial/trade_rfq_test.sql`: the only caller of `mint_trade_rfq_token` is
the `trade-rfq-send` edge function's service-role client, so both refusals now
assert the 00424 ACL denial. Three more stale points sat behind it. The fixture
lacked the designer-domain role that 00511 requires for countersign. Forged
service_role claims leaked into section (5). The lock-order probe still
matched the pre-00511 text of the scope lock.

`document/close_project_readiness_test.sql`: the fixture now gives the
designer a design studio, a membership and a designer role, which
`set_project_studio_id` (head 00563) requires. Installation goes through
`record_project_ffe_installed` (00691) from a delivered line.

`document/journey_authority_integrity_test.sql`: the blocked FF&E fixture line
is inserted as the session owner, and then the authenticated role is restored.

## Closed by the runner's EVENT 3 parity step (SQ-459, 2026-10-06)

`edge_api/catalog_roles_test.sql` (`unregistered_public_grants=2`) and
`edge_api/catalog_roles_remote_conformance_test.sql` (`relation_acl=2`) are
green and carry no entry. Their residual was the EVENT 3 local-image gap:
`extensions.pg_stat_statements{,_info}` are `supabase_admin`-owned locally
(`=r/supabase_admin`), so 00486's REVOKE run as `postgres` is a silent no-op.
A seed cannot fix it either: `db reset` seeds run as `postgres`, which is not a
member of `supabase_admin` (`SET ROLE supabase_admin` → permission denied).
`scripts/run-sql-tests.sh` now connects as `supabase_admin` to a local stack
only (127.0.0.1/localhost, no `PGURL` override) and reproduces prod's measured
ACL `{postgres=a*r*w*d*D*x*t*m*/postgres,dashboard_user=arwdDxtm/postgres}`:
PUBLIC/anon/authenticated revoked, `dashboard_user` granted. No registry row
was added. The `division by zero` in the remote-conformance file was never a
ratio bug: its `SELECT 1 / 0` is the file's deliberate nonzero-exit gate
(`:400-404`) and stays.

`edge_api/platform_acl_compatibility_test.sql` also had a stale allow-list in
`$platform_schema_usage$`: `00490_scan_worker_roles.sql:361-362` grants public
`USAGE` to `scan_worker`/`scan_reader` (prod carries both); the test now names
them. That file remains in Group 1 for its un-ruled `$auth_helpers$` block.

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
