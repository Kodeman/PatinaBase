# RC-1: populated migration rehearsal and full SQL / concurrency gate

Ticket SQ-2234 (US-52 W6, WP-11). Candidate tree: `redesign/designer-portal-round8` at `f5f8b5d3c519`. Main-equivalent base: `main` at `0bd6306e9`, whose migration head is 00867. Run on 2026-10-28.

**Result: GREEN.**

- **Rehearsal.** All 22 branch migrations, 00868 through 00889, applied in order onto a populated main-equivalent database. Every one ran with `ON_ERROR_STOP=1`, with 0 errors, 0 lock waits and 0 lost rows. The upgraded schema is byte-identical to a clean reset of the same tree: a 17,118-line catalogue fingerprint shows no difference.
- **Gate.** On a clean reset of the same owned stack, all 76 gate rows exited 0 with 0 FAIL, 0 ERROR, 0 REFUSED, 0 skipped and 0 cancelled. Across them, 4,863 PASS lines were recorded.
- **X08.** X08 now has a recorded negative control. It fails on its named assertion and passes once restored.

Raw logs, the runner scripts and the per-row JSON are kept out of git, under the board verification directory `~/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2234/`. The subfolders are `rehearsal/`, `populate/`, `gate/`, `x08-control/`, `stack/` and `runner/`.

## Owned stack and target proof

- **Stack identity.** The CLI project was `patina-rc1-sq2234`, run at the +1000 offset: API 55321, DB 55322, shadow 55320 and pooler 55329.
  - Studio, inbucket, analytics and edge runtime were off. The stack started with `-x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`.
  - The scratch workdir was outside the repo. It held only the five `.temp` version pins: postgres 17.6.1.063, gotrue v2.196.0, rest v14.5, storage v1.73.1 and storage-migration `objects-null-version-index`.
- **Proof before each phase** (`target-proof-*.txt`):
  - the container label is `com.supabase.cli.project=patina-rc1-sq2234`;
  - 5432/tcp is published on 55322;
  - `host(inet_server_addr())` over 55322 returned 172.25.0.2, which is the container's address on `supabase_network_patina-rc1-sq2234`;
  - the shared container `supabase_db_supabase` still carries the label `supabase`.
- **Phase B workdir.** It matched the worktree exactly: `diff -r` of migrations and seed showed no differences, and `cmp` of 00889 passed. The ledger showed 815 rows, 22 of them in 00868–00889.
- **Cron.** `cron.launch_active_jobs = off` was set through `ALTER SYSTEM` and read back after each start or reset.
  - In the 32 s between the phase B reset and the cron switch, one minute tick fired 3 jobs at 09:21:00Z.
  - The pg_net readback shows 38 responses. All 38 are `Couldn't resolve host name`, because the seeded `supabase_kong_supabase` host does not exist off the shared network. Nothing was delivered. This is the same behaviour as SQ-2199 (story log #263).
- **Shared 54322.** It was only read: one `pg_dump --data-only`, plus read-only catalogue probes. There were no writes, no `--linked`, no `db push` and no prod access.

## 1. Populated rehearsal (main-equivalent → 00868…00889)

**Base.** The stack started from `git archive main` (`0bd6306e9`), using main's config, migrations, seed and templates. That gave 793 migrations, ending at 00867 and `20260910152111`, with main's seeds applied. No round-8 objects were present; the ledger had 0 rows in 00868–00889.

**Population.** The source was a read-only `pg_dump --data-only` of shared 54322, covering schemas `public`, `auth` and `storage`. The `auth.schema_migrations` and `storage.migrations` tables were left out.

- **Projection.** Each COPY block was projected onto the main-equivalent column set (`runner/filter_dump.py`):
  - Tables that exist only on the branch were skipped: 25 round-8 tables, all empty in the source, plus `server_capabilities` (2 rows).
  - Round-8 columns were dropped from 4 tables: `margin_notes.subject_kind/subject_id`, `project_ffe_items.row_version/scope_package_key/external_fulfilment_id`, five `project_party_authority` columns and `proposals.drafted_against_scope_edition_id`.
- **Load.** The data was loaded into the owned DB as `supabase_admin`, inside one transaction with `ON_ERROR_STOP`. The loaded tables were truncated first. The load ran under `session_replication_role = replica`, and CHECK constraints are still enforced in that mode.
- **Load result.** 478 tables and 11,518 rows loaded, with 0 errors. That includes 18 auth users, 22 projects, 23 proposals, 112 FF&E items, 31 project parties and 1,057 auth audit rows.
- **Pre-rehearsal snapshot.** 482 tables holding 11,663 rows.
- **Scale.** This is a dev-scale dataset, not production volume.

**Apply.** Each migration ran as its own transaction: `psql -v ON_ERROR_STOP=1`, with `SET LOCAL lock_timeout='30s'`, in numeric order. The relation-lock footprint was read from `pg_locks` before each COMMIT. `log_lock_waits=on` and `deadlock_timeout=200ms` were set for the run.

| migration | exit | ms | ERROR | AEL tables (incl. new) | relation locks held at COMMIT |
|---|---|---|---|---|---|
| 00868_round8_scope_composition.sql | 0 | 179 | 0 | 33 | AccessExclusiveLock=60 AccessShareLock=18 RowExclusiveLock=5 ShareLock=16 ShareRowExclusiveLock=14 |
| 00869_round8_scope_execution.sql | 0 | 120 | 0 | 24 | AccessExclusiveLock=24 AccessShareLock=24 RowExclusiveLock=6 RowShareLock=18 ShareRowExclusiveLock=1 |
| 00870_round8_scope_reconciliation.sql | 0 | 83 | 0 | 24 | AccessExclusiveLock=27 AccessShareLock=10 RowExclusiveLock=3 ShareLock=2 ShareRowExclusiveLock=4 |
| 00871_round8_plan_composition.sql | 0 | 102 | 0 | 27 | AccessExclusiveLock=35 AccessShareLock=11 RowExclusiveLock=3 ShareLock=4 ShareRowExclusiveLock=7 |
| 00872_round8_document_open_chain_alias.sql | 0 | 78 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=3 |
| 00873_round8_placement_retry_idempotency.sql | 0 | 97 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=3 |
| 00874_round8_typed_subjects.sql | 0 | 104 | 0 | 24 | AccessExclusiveLock=25 AccessShareLock=29 RowExclusiveLock=6 ShareRowExclusiveLock=1 ShareUpdateExclusiveLock=1 |
| 00875_round8_external_fulfilment.sql | 0 | 126 | 0 | 27 | AccessExclusiveLock=48 AccessShareLock=15 RowExclusiveLock=1 ShareLock=8 ShareRowExclusiveLock=11 |
| 00876_round8_external_presence_parity.sql | 0 | 129 | 0 | 26 | AccessExclusiveLock=34 AccessShareLock=15 RowExclusiveLock=3 ShareLock=5 ShareRowExclusiveLock=6 |
| 00877_round8_evidence_manifests.sql | 0 | 173 | 0 | 36 | AccessExclusiveLock=55 AccessShareLock=26 RowExclusiveLock=3 ShareLock=5 ShareRowExclusiveLock=16 |
| 00878_round8_fabrication_authority.sql | 0 | 94 | 0 | 25 | AccessExclusiveLock=26 AccessShareLock=7 RowExclusiveLock=2 ShareLock=1 ShareRowExclusiveLock=3 |
| 00879_round8_fabrication_instruction.sql | 0 | 99 | 0 | 1 | AccessExclusiveLock=1 AccessShareLock=26 RowExclusiveLock=3 RowShareLock=2 ShareRowExclusiveLock=3 |
| 00880_round8_readiness_batch.sql | 0 | 397 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=2 |
| 00881_round8_fill_locked_current.sql | 0 | 126 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=3 |
| 00882_round8_billing_lock_order.sql | 0 | 114 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=3 |
| 00883_round8_external_reader_parity.sql | 0 | 133 | 0 | 0 | AccessShareLock=5 RowExclusiveLock=3 |
| 00884_round8_external_package_reading.sql | 0 | 106 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=3 |
| 00885_round8_countersign_execution_time.sql | 0 | 97 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=3 |
| 00886_round8_service_acceptance.sql | 0 | 266 | 0 | 28 | AccessExclusiveLock=57 AccessShareLock=16 RowExclusiveLock=7 ShareLock=8 ShareRowExclusiveLock=11 ShareUpdateExclusiveLock=3 |
| 00887_round8_external_reading_grant_binding.sql | 0 | 87 | 0 | 0 | AccessShareLock=4 RowExclusiveLock=3 |
| 00888_round8_service_completion.sql | 0 | 214 | 0 | 41 | AccessExclusiveLock=53 AccessShareLock=25 RowExclusiveLock=4 ShareLock=4 ShareRowExclusiveLock=20 ShareUpdateExclusiveLock=2 |
| 00889_round8_service_acceptance_client_evidence.sql | 0 | 146 | 0 | 25 | AccessExclusiveLock=32 AccessShareLock=22 RowExclusiveLock=4 ShareLock=4 ShareRowExclusiveLock=4 ShareUpdateExclusiveLock=2 |

Total apply time was 3.07 s. Neither `process … still waiting for` nor `deadlock detected` appears in the container log, so there were 0 lock waits.

**AccessExclusive footprint, for ROLLOUT.**

- **Migrations that hold AEL on pre-existing tables:**
  - DDL migrations 00868–00871, 00874–00878, 00886, 00888 and 00889 hold AccessExclusiveLock on every `auth.*` and `storage.*` table, including `auth.users` (18 rows) and `auth.sessions`, until their COMMIT.
  - They also hold it on their own pre-existing targets:
    - `proposals` and `proposal_agreement_parts` (00868 and 00869);
    - `project_rooms` (00871);
    - `margin_notes` (00874 and 00877);
    - `project_ffe_items` (00876 and 00888);
    - `plan_issues`, `project_approval_artifacts` and five others (00877);
    - `project_parties` and `project_party_authority` (00878);
    - `outbound_drafts` (00886);
    - `project_phases`, `client_decisions`, `trade_scope_terms`, `scope_change_requests` and `install_punch_items` (00888).
- **Root cause of the auth/storage locks.** The migrations do not cause the locks on `auth` and `storage`. Any `CREATE POLICY` takes them in this image:
  - A one-policy probe on a fresh table (`runner/ael_probe2.sql`) took AEL on all 19 auth and storage relations.
  - Under `session_replication_role = replica` the same probe took none (`runner/ael_probe3.sql`).
  - So a DDL event trigger causes it. The image has `pgrst_ddl_watch`, `graphql_watch_ddl` and `issue_pg_*_access`.
- **Consequence.** During each DDL migration's transaction, every sign-in and storage read waits. Here that lasted 80–270 ms per migration. On Strata it will last as long as each migration takes there.
- **Migrations with no AEL on pre-existing tables:** 00872, 00873, 00879–00885 and 00887. These are function-only migrations.

**Readback, probing objects rather than the ledger:**

- **Data loss.** Row counts after the rehearsal show 0 tables with fewer rows, 0 tables with more rows and 0 dropped tables. The 29 new tables are all round-8 tables (`rehearsal/summary.json`).
- **Schema equality.** `runner/fingerprint.sql` was run on the populated-upgraded DB and again on the phase-B clean reset; the diff is empty, at 17,118 lines each (`rehearsal/fingerprint.diff`, 0 bytes). The fingerprint covers:
  - every `public` function: signature, SECURITY DEFINER, volatility, prosrc md5, proconfig and ACL;
  - every column: type, nullability, default and generated status;
  - every constraint, index and policy, including the `storage.objects` policies;
  - every trigger, including the `storage.objects` triggers;
  - every table, view and sequence ACL, with RLS and force-RLS;
  - the `server_capabilities` rows.

  So the upgrade path and a fresh install produce the same catalogue. That includes the local legacy-grants seed replay on the clean reset.

### Inactivity census (populated-upgraded DB, `rehearsal/census.txt`)

This census covers all 48 `public` functions whose names match `service_acceptance`, `service_completion` or `studio_service_completion` (C4 and C6).

- **Mutations.** No mutation is executable by `anon`, `authenticated` or `service_role`, and PUBLIC holds no EXECUTE. That covers:
  - the `create_`, `respond_`, `withdraw_`, `replace_…signer`, `record_…paper_intake`, `review_…paper_intake` and `stamp_…paper_hash` functions;
  - `resolve_service_acceptance_condition` and `revoke_studio_service_completion`;
  - every volatile `_` helper and guard.
- **What `authenticated` can execute.** Six read-only functions, all of them STABLE, and nothing else:
  - the planned read projections `get_project_service_acceptance(uuid)`, `get_my_service_acceptance_requests()`, `get_studio_service_completion(uuid)` and `get_my_service_acceptance_evidence(uuid)`;
  - the two storage predicates `_can_access_service_acceptance_paper_object(text)` (00886) and `_can_read_service_acceptance_evidence_object(text)` (00889), as the plan allows.
- **`anon`.** It can execute none of them. The query for any round-8 volatile function executable by `anon` returns empty.
- **Tables.**
  - All 8 C4/C6 tables have RLS on, no policies and no `anon` or `authenticated` privilege.
  - `service_role` keeps table DML only on the four 00886 tables (`service_acceptance_requests`, `_signers`, `_paper_intakes` and `_responses`). That is exactly what 00886 ships, because its REVOKE names `PUBLIC, anon, authenticated` only. The 00888 and 00889 tables revoke `service_role` too.
  - Two suites assert part of this:
    - `service_acceptance_body.psql` (in `service_acceptance_test` and `_isolated`) asserts RLS on the four 00886 tables and no `anon` or `authenticated` privilege.
    - `service_completion_test.sql` asserts the `service_role` revoke on the C6 tables.
  - No suite asserts the retained `service_role` DML on the 00886 tables. That fact comes from this census only. It matches the migration text, and ROLLOUT should know about it.
- **`storage.objects` policies.** There are 8 `service_acceptance_*` policies: the 00886 paper boundaries plus `service_acceptance_evidence_client_read` (00889).
- **Capabilities.** `scope_editions` and `margin_note_escalation` are both `false`.

## 2. Full gate on a clean reset of the same owned stack

- **Reset.** `supabase db reset --local --workdir <scratch>` ran on the same `patina-rc1-sq2234` containers, with the workdir switched to the worktree's migrations, seed, templates and config.
- **Run order:**
  1. the C4/C6 suites that assert the shipped, inactive state;
  2. the remaining SQL suites;
  3. the ACL replays;
  4. the self-toggling window suites, which restore what they found (`scope_editions` was read back as `false` afterwards);
  5. the SQ-2199 prelude, which turns `scope_editions` on and grants the two window grants, on the owned stack only;
  6. the window concurrency suites;
  7. dblink and the race;
  8. the owned container.
- **Flags.** Every psql row got `-v ON_ERROR_STOP=1 -v expected_port=55322`. Node rows used `--test --test-concurrency=1`, with `ROUND8_DB_URL` pointed at 55322 and `API_URL=http://127.0.0.1:55321`.
- **Counters.** PASS is the number of PASS lines. FAIL counts `FAIL`/`FAILED` lines. A row is green only when it exits 0 and has no `ERROR:` or `REFUSED` line, because psql `\quit 3` exits 0 (#261).

| group | file | exit | PASS | FAIL | note |
|---|---|---|---|---|---|
| service_c4 | service_acceptance_activation_plan_test.sql | 0 | 500 | 0 |  |
| service_c4 | service_acceptance_x08_test.sql | 0 | 28 | 0 |  |
| service_c4 | service_acceptance_test.sql | 0 | 263 | 0 |  |
| service_c4 | service_acceptance_client_evidence_test.sql | 0 | 307 | 0 |  |
| service_c6 | service_completion_test.sql | 0 | 177 | 0 |  |
| round8_test | billing_lock_order_test.sql | 0 | 21 | 0 |  |
| round8_test | document_open_chain_alias_test.sql | 0 | 25 | 0 |  |
| round8_test | evidence_manifests_test.sql | 0 | 162 | 0 |  |
| round8_test | external_fulfilment_test.sql | 0 | 120 | 0 |  |
| round8_test | external_package_reading_test.sql | 0 | 87 | 0 |  |
| round8_test | external_presence_test.sql | 0 | 161 | 0 |  |
| round8_test | external_reader_parity_test.sql | 0 | 225 | 0 |  |
| round8_test | fabrication_authority_test.sql | 0 | 170 | 0 |  |
| round8_test | fabrication_instruction_test.sql | 0 | 82 | 0 |  |
| round8_test | fill_locked_current_test.sql | 0 | 10 | 0 |  |
| round8_test | placement_retry_idempotency_test.sql | 0 | 9 | 0 |  |
| round8_test | plan_composition_test.sql | 0 | 95 | 0 |  |
| round8_test | readiness_batch_test.sql | 0 | 55 | 0 |  |
| round8_test | scope_composition_test.sql | 0 | 163 | 0 |  |
| round8_test | scope_consumer_projection_test.sql | 0 | 5 | 0 |  |
| round8_test | scope_execution_test.sql | 0 | 117 | 0 |  |
| round8_test | scope_reconciliation_test.sql | 0 | 51 | 0 |  |
| round8_test | typed_subjects_test.sql | 0 | 0 | 0 |  |
| legacy_contract | proposal_phase_authority_atomicity_test.sql | 0 | 0 | 0 |  |
| legacy_contract | close_project_readiness_test.sql | 0 | 0 | 0 |  |
| legacy_contract | product_configuration_test.sql | 0 | 0 | 0 |  |
| legacy_contract | configuration_privacy_contract_test.sql | 0 | 1 | 0 |  |
| legacy_contract | 00463_authority_evidence_contract_test.sql | 0 | 0 | 0 |  |
| legacy_contract | 00464_lifecycle_compatibility_contract_test.sql | 0 | 0 | 0 |  |
| legacy_contract | 00465_notification_traceability_contract_test.sql | 0 | 0 | 0 |  |
| legacy_contract | 00467_client_access_contract_test.sql | 0 | 0 | 0 |  |
| legacy_contract | 00468_stage2_option_privacy_contract_test.sql | 0 | 0 | 0 |  |
| legacy_contract | 00569_why_viewer_role_receipt_contract_test.sql | 0 | 0 | 0 |  |
| round8_isolated | billing_lock_order_isolated.psql | 0 | 21 | 0 |  |
| round8_isolated | document_open_chain_alias_isolated.psql | 0 | 25 | 0 |  |
| round8_isolated | evidence_manifests_isolated.psql | 0 | 162 | 0 |  |
| round8_isolated | external_fulfilment_isolated.psql | 0 | 120 | 0 |  |
| round8_isolated | external_package_reading_isolated.psql | 0 | 87 | 0 |  |
| round8_isolated | external_presence_isolated.psql | 0 | 161 | 0 |  |
| round8_isolated | external_reader_parity_isolated.psql | 0 | 225 | 0 |  |
| round8_isolated | fabrication_authority_isolated.psql | 0 | 170 | 0 |  |
| round8_isolated | fabrication_instruction_isolated.psql | 0 | 82 | 0 |  |
| round8_isolated | fill_locked_current_isolated.psql | 0 | 10 | 0 |  |
| round8_isolated | placement_retry_idempotency_isolated.psql | 0 | 9 | 0 |  |
| round8_isolated | plan_composition_isolated.psql | 0 | 95 | 0 |  |
| round8_isolated | readiness_batch_isolated.psql | 0 | 55 | 0 |  |
| round8_isolated | scope_composition_isolated.psql | 0 | 163 | 0 |  |
| round8_isolated | scope_execution_isolated.psql | 0 | 117 | 0 |  |
| round8_isolated | scope_reconciliation_isolated.psql | 0 | 51 | 0 |  |
| round8_isolated | service_acceptance_isolated.psql | 0 | 263 | 0 |  |
| round8_isolated | typed_subjects_isolated.psql | 0 | 0 | 0 |  |
| acl_check | evidence_manifests_acl_replay_check.py | 0 | 2 | 0 | PASS: native extractor preserves 3 table and 6 function revokes; only authorized reads and / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | external_fulfilment_acl_replay_check.py | 0 | 2 | 0 | PASS: native extractor preserves 4 table and 14 function revokes; only authorized read reg / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | external_package_reading_acl_replay_check.py | 0 | 4 | 0 | PASS: native extractor retains reader revoke and only the native authenticated reader gran / PASS: no reader ACL hidden inside dollar bodies; no generated seed edit / PASS: native extractor retains reader revoke and only the native authenticated reader gran / PASS: no reader ACL hidden inside dollar bodies; no generated seed edit |
| acl_check | external_presence_acl_replay_check.py | 0 | 2 | 0 | PASS: native extractor preserves the exact inactive safety ACL manifest / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | external_reader_parity_acl_replay_check.py | 0 | 2 | 0 | PASS: native extractor preserves 0 table and 3 function revokes; no helper regranted / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | fabrication_authority_acl_replay_check.py | 0 | 2 | 0 | PASS: native extractor retains seven function revokes and only two service-role lifecycle  / PASS: no ACL hidden in dollar bodies; no legacy fabrication predicate |
| acl_check | fabrication_instruction_acl_replay_check.py | 0 | 2 | 0 | PASS: native extractor retains five function revokes and only the native authenticated iss / PASS: no instruction ACL hidden inside dollar bodies; no generated seed edit |
| acl_check | service_acceptance_client_evidence_acl_replay_check.py | 0 | 5 | 0 | PASS: native extractor yields exactly the 13 top-level 00889 ACL statements / PASS: each authenticated grant follows its own revoke / PASS: no 00889 ACL hidden inside a dollar body / PASS: the regenerated seed replays all 13 00889 ACL statements in order / PASS: no 00889 statement grants anon |
| acl_check | service_completion_acl_replay_check.py | 0 | 4 | 0 | PASS: native extractor yields exactly the 23 top-level 00888 ACL statements / PASS: no 00888 ACL hidden inside a dollar body / PASS: the regenerated seed replays all 23 00888 ACL statements in order / PASS: no 00888 statement grants anon |
| concurrency | service_completion_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | service_acceptance_client_evidence_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | prelude | 0 | - | - | scope_editions on + 2 window grants (owned stack only) |
| concurrency | billing_lock_order_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | evidence_manifests_concurrency.test.mjs | 0 | 2 | 0 | tests=2 skipped=0 cancelled=0 |
| concurrency | external_fulfilment_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | external_presence_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | fabrication_authority_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | fabrication_instruction_concurrency.test.mjs | 0 | 25 | 0 | tests=25 skipped=0 cancelled=0 |
| concurrency | owned_psql.test.mjs | 0 | 140 | 0 | tests=140 skipped=0 cancelled=0 |
| concurrency | scope_execution_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | service_acceptance_concurrency.test.mjs | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | fill_locked_current_concurrency.psql | 0 | 0 | 0 | compile-only N() helper by design |
| race | dblink-prerequisite | 0 | - | - | owned-stack-only CREATE EXTENSION |
| race | scope_composition_concurrency_test.sql | 0 | 7 | 0 |  |
| owned | scope_reconciliation_concurrency.test.mjs | 0 | 6 | 0 | tests via docker-exec on owned container, skipped=0, ROUND8_OWNER_TICKET=SQ-2234 |

**Notes on the table**

- **legacy_contract.** These rows are raise-on-fail DO blocks that end in ROLLBACK, so PASS stays at 0. The DO counts are 18, 11, 1, 5, 15, 31, 21, 8, 9 and 10, the same as SQ-2199.
- **typed_subjects.** It prints no PASS lines. Its single success line, `C7 audience assertions passed`, is present in both the test and isolated logs.
- **Comparison with SQ-2199** (`runner/cmp2199.sh`). For every round8_test and round8_isolated file in both runs, the sorted PASS-line sets are identical, with one exception: `external_package_reading` grew from 80 to 87, from the 00887 assertions added after W3.
  - The SQ-2199 table printed one higher on six files. That came from its own counter; the raw PASS lines are the same.
- **W4/W5 rows new since SQ-2199:**
  - `service_acceptance_activation_plan_test`, `service_acceptance_x08_test`, `service_acceptance_test` and `service_acceptance_client_evidence_test`;
  - `service_completion_test`;
  - `service_acceptance_isolated`;
  - the `service_completion` and `service_acceptance_client_evidence` ACL replays;
  - the `service_completion`, `service_acceptance_client_evidence` and `service_acceptance` concurrency suites.
- **Skips.** None. No row is skipped or cancelled, and every suite in `supabase/tests/round8/` ran.
  - The only deliberate non-rows are `owned_psql.mjs` and `owned_seed.mjs`. They are libraries; `owned_psql.test.mjs` and the owned row exercise them.
- **owned row.** `owned_seed.mjs create` started a labelled container (`sidequest.ticket=SQ-2234`), and `seed` filled it from `patina-rc1-sq2234`, with its probe matched and its dumps deleted. Then `scope_reconciliation_concurrency.test.mjs` ran through `docker-exec`: 6 of 6 passed.

## X08 negative control (carried SQ-2242 F4)

- **Control.** A scratch copy of `service_acceptance_x08_test.sql` was used (`x08-control/service_acceptance_x08_control.sql`); the repo suite is unchanged. Right after X08's own `BEGIN`, it redefines `public.get_my_service_acceptance_requests()` from its live definition with the sent-only filter `r.sent_at IS NOT NULL AND` removed. The DO block raises if that filter is not found.
- **Result.** psql exits 3 after 3 PASS lines, at `ERROR: ASSERTION FAILED: X08 draft invisible to required signer`.
  - That is an assertion failure, not an import or collection failure.
  - The behaviour it covers is the client reader's sent-only rule, which keeps a draft service request away from its signers.
- **Restored.** The filter is intact after the ROLLBACK (`filter_intact_after_rollback = t`). The unmodified X08 then exits 0 with `X08: PASS 27 assertions`, which is 28 PASS lines including the summary line.

## README reconciliation (carried SQ-2242 note)

`supabase/tests/round8/README.md` gave +1000 for the C4 suites and +3000 for the isolated-stack recipe. The ports in the suites themselves are:

- **Fixed at 55322:** the X08 and activation-plan suites.
- **`-v expected_port`, default 54322:** `service_acceptance_test.sql` and `service_acceptance_isolated.psql`.
- **Default 56322:** `service_completion_test.sql`.
- **Default 57322, and refuses 54322:** `service_acceptance_client_evidence_test.sql`. Its concurrency suite reads `SQ_DB_PORT`.

The README now says the recipe's offset must not collide with another stack, and that the X08 and activation-plan suites accept only +1000. The parameter table now lists the two `service_acceptance` files. The C6 paragraph now names both owned-port defaults, instead of calling 56322 "the one" owned-port guard.

## Teardown

- **Owned container.** `docker rm -f -v` removed it (`639b85b4ab75…`, labels `SQ-2234` / `sq2234-opus55-high-rc1a4c5`).
- **Stack.** `supabase stop --workdir <scratch> --no-backup` reported `Stopped supabase local development setup`.
- **Afterwards.** 0 containers, 0 volumes and 0 networks remain for `patina-rc1-sq2234` or `sidequest.ticket=SQ-2234`, and the shared `supabase_db_supabase` is still running.
- **Data copies.** The shared-data dump and its projected load file were deleted.
- **Disk.** `df -h /` showed 69 GiB free before and 57 GiB free after; the drop includes concurrent sessions.
