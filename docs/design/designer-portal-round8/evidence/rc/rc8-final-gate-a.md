# RC-8 final gate A: SQL and static gate on 29832f2e9

## Header

| Field | Value |
|---|---|
| Tip | `29832f2e9` (`docs(evidence): record the FIX10 merge in the RC-7 synthesis`), worktree `/Users/kody/Code/patina-r8-evidence`, branch `r8-evidence`, clean at start |
| Stack | CLI project `rc8-gate-a`, block 616: API 61621, DB 61622, shadow 61620, pooler 61629, studio 61623, inbucket 61624, analytics 61627, inspector 61683 |
| Stack recipe | scratch copy of `supabase/` (config.toml edited only in the scratch copy), five `.temp` version pins copied, `supabase start --workdir <scratch> -x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`, seeds on, `cron.launch_active_jobs = off` set as `supabase_admin` on the owned container |
| Migration head | 00905 (`00905_round8_launch_service_arrangements.sql`); 831 ledger rows = 831 migration files (the last row is `20260910152111_create_contact_messages`) |
| System identifiers | stack 1 `7702443267905232938` (SQL, ACL, rc7, concurrency, race, owned phases); stack 2 `7702445145919959082` (fresh rebuild for the edge_api suites and the types run) |
| Date | 2026-10-30 |
| Shared stack | 54321/54322 never touched; no `--linked`, no Strata, no production |
| Result | **FAIL: 6 designer-portal jest tests in 2 suites.** Every SQL, ACL, concurrency, type, build and policy gate passed. One edge_api file fails on its documented KNOWN_FAILURES entry. |

## 1. Stack and ACL seed

- Build: `supabase start` replayed all migrations and every seed in `[db.seed]` in 37 s. Head 00905; `scope_editions` false; `cron.launch_active_jobs` off (checked from a new session).
- ACL seed currency:
  ```
  python3 scripts/generate-legacy-grants.py   # wrote supabase/seed/00-legacy-grants.sql, "baseline + 4268 replayed statements"
  git diff --exit-code supabase/seed/00-legacy-grants.sql   # exit 0, empty diff
  ```
  The seed is current. Nothing to restore.

## 2. SQL gate

**Runner:** `gate-rc8.mjs`, adapted from `gate-rc7.mjs` (itself RC-6's `gate-rc6.mjs`), kept in the session scratch dir `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc8-gate-a/` (wiped on restart; raw logs are under `logs/`). Phase order: `sql`, `acl`, `rc7-inactive`, `e1-active`, `fix3`, `conc-self`, `prelude`, `conc`, `race`, `owned`, then a fresh stack for `edge-api` and types.

- psql suites: `psql postgresql://postgres:postgres@127.0.0.1:61622/postgres -X -v ON_ERROR_STOP=1 -v expected_port=61622 -f <file>`.
- node suites: `node --test --test-concurrency=1 --test-reporter=tap <file>` with `ROUND8_DB_URL` set to the owned DB, `API_URL=http://127.0.0.1:61621` and each suite's `*_DB_WINDOW=owned`.
- `prelude`: `scope_editions` on plus the two window grants, refused unless `:PORT = 61622`.
- `owned`: `owned_seed.mjs create` then `seed` from source project `rc8-gate-a`, labels `sidequest.owner=r8-rc8-gate-a`, `sidequest.ticket=SQ-90908` (lane-local), then `scope_reconciliation_concurrency.test.mjs` over `docker-exec`. The container (`70fe5796c667`) was removed with `docker rm -f -v`.
- The PASS column counts lines matching `PASS` or TAP `ok N` (psql) or the TAP `# pass` count (node). Legacy contract suites assert by raising, so 0 PASS with exit 0 is a pass. Counts can differ by one from RC-6's table because this runner's regex also counts `ok N` lines.

**Hard-coded ports (grep `5432[12]|59322|6[0-9]{3}2`, widened to 5-digit ports).** Files that hard-code a foreign port ran from a port-swapped scratch mirror (`$G/mirror/supabase/tests`, with symlinks to the repo's `migrations`, `seed`, `round8` and every other test directory):

| Files | Hard-coded | Swapped to |
|---|---|---|
| `round8_rc7/e1_activation.sql`, `e1_authority_matrix.sql`, `e1_mutation_matrix.sql`, `e1_restore.sql`, `e1_*_race.test.mjs`, `e1_acceptance_concurrency.test.mjs`, `e1_storage_bytes.test.mjs` | 58122 / 58121 | 61622 / 61621 |
| `round8_rc7/e5_order_retry.sql` | 55122 | 61622 |
| `round8_rc7/fix3_addendum_lock_order.test.mjs` | 60622 | 61622 |
| `edge_api/catalog_roles_test.sql`, `catalog_roles_remote_conformance_negative_test.sql`, `platform_acl_compatibility_test.sql`, `public_rpc_authorization_contract_test.sql` | 54322 (a `1/0` refusal guard in the first two) | 61622 |

Run from the repo file because the port is guarded by `\if :{?expected_port}` (so `-v expected_port` works): `e1_c6_audience.sql`, `fix2_stale_refusal_sqlstate.sql`, `fix7_rerequest_refusal.sql`, `fix8_refusal_codes.sql`. `fix9_launch_arrangements.sql` hard-codes 61622 (it matches this block) and needs `-v fix9_system_identifier=7702443267905232938`. This is harness debt: nine files need a copy to run on any port other than the one they were written for.

### Final results (101 rows, all exit 0)

| Group | File | Exit | PASS | FAIL | Note |
|---|---|---:|---:|---:|---|
| service_c4 | `service_acceptance_activation_plan_test.sql` | 0 | 524 | 0 | repo file (owned-port guard); C4 activation plan: PASS 523 assertions |
| service_c4 | `service_acceptance_x08_test.sql` | 0 | 28 | 0 | repo file (owned-port guard); X08: PASS 27 assertions |
| service_c4 | `service_acceptance_test.sql` | 0 | 272 | 0 |  |
| service_c4 | `service_acceptance_client_evidence_test.sql` | 0 | 328 | 0 | C4 client evidence: PASS 327 assertions |
| service_c4 | `service_acceptance_household_identity_test.sql` | 0 | 62 | 0 | C4 household identity: PASS 61 assertions |
| service_c4 | `service_acceptance_release_fixes_test.sql` | 0 | 83 | 0 | release fixes: PASS 76 assertions |
| service_c6 | `service_completion_test.sql` | 0 | 177 | 0 |  |
| round8_test | `billing_lock_order_test.sql` | 0 | 21 | 0 |  |
| round8_test | `document_open_chain_alias_test.sql` | 0 | 26 | 0 | PASS: cross-studio fixtures are all readable before boundary ass |
| round8_test | `evidence_manifests_test.sql` | 0 | 162 | 0 |  |
| round8_test | `external_fulfilment_test.sql` | 0 | 123 | 0 |  |
| round8_test | `external_install_hold_guard_test.sql` | 0 | 31 | 0 |  |
| round8_test | `external_package_reading_test.sql` | 0 | 87 | 0 |  |
| round8_test | `external_presence_test.sql` | 0 | 161 | 0 |  |
| round8_test | `external_reader_parity_test.sql` | 0 | 231 | 0 |  |
| round8_test | `fabrication_authority_test.sql` | 0 | 170 | 0 |  |
| round8_test | `fabrication_instruction_test.sql` | 0 | 82 | 0 |  |
| round8_test | `fill_locked_current_test.sql` | 0 | 11 | 0 |  |
| round8_test | `note_context_labels_test.sql` | 0 | 0 | 0 | C7 audience assertions passed: B-only and GC see neutral draft fields only |
| round8_test | `placement_retry_idempotency_test.sql` | 0 | 10 | 0 |  |
| round8_test | `plan_composition_test.sql` | 0 | 96 | 0 |  |
| round8_test | `readiness_batch_test.sql` | 0 | 55 | 0 |  |
| round8_test | `scope_composition_test.sql` | 0 | 164 | 0 |  |
| round8_test | `scope_consumer_projection_test.sql` | 0 | 5 | 0 |  |
| round8_test | `scope_execution_test.sql` | 0 | 117 | 0 |  |
| round8_test | `scope_reconciliation_test.sql` | 0 | 51 | 0 |  |
| round8_test | `typed_subjects_test.sql` | 0 | 1 | 0 | C7 audience assertions passed: B-only and GC see neutral draft fields only |
| legacy_contract | `proposal_phase_authority_atomicity_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `close_project_readiness_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `product_configuration_test.sql` | 0 | 0 | 0 | All furniture configuration assertions passed. |
| legacy_contract | `configuration_privacy_contract_test.sql` | 0 | 1 | 0 |  |
| legacy_contract | `00463_authority_evidence_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00464_lifecycle_compatibility_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00465_notification_traceability_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00467_client_access_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00468_stage2_option_privacy_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00569_why_viewer_role_receipt_contract_test.sql` | 0 | 0 | 0 |  |
| round8_isolated | `billing_lock_order_isolated.psql` | 0 | 21 | 0 |  |
| round8_isolated | `document_open_chain_alias_isolated.psql` | 0 | 25 | 0 | PASS: cross-studio fixtures are all readable before boundary ass |
| round8_isolated | `evidence_manifests_isolated.psql` | 0 | 162 | 0 |  |
| round8_isolated | `external_fulfilment_isolated.psql` | 0 | 123 | 0 |  |
| round8_isolated | `external_install_hold_guard_isolated.psql` | 0 | 31 | 0 |  |
| round8_isolated | `external_package_reading_isolated.psql` | 0 | 87 | 0 |  |
| round8_isolated | `external_presence_isolated.psql` | 0 | 161 | 0 |  |
| round8_isolated | `external_reader_parity_isolated.psql` | 0 | 231 | 0 |  |
| round8_isolated | `fabrication_authority_isolated.psql` | 0 | 170 | 0 |  |
| round8_isolated | `fabrication_instruction_isolated.psql` | 0 | 82 | 0 |  |
| round8_isolated | `fill_locked_current_isolated.psql` | 0 | 10 | 0 |  |
| round8_isolated | `placement_retry_idempotency_isolated.psql` | 0 | 9 | 0 |  |
| round8_isolated | `plan_composition_isolated.psql` | 0 | 96 | 0 |  |
| round8_isolated | `readiness_batch_isolated.psql` | 0 | 55 | 0 |  |
| round8_isolated | `scope_composition_isolated.psql` | 0 | 163 | 0 |  |
| round8_isolated | `scope_execution_isolated.psql` | 0 | 117 | 0 |  |
| round8_isolated | `scope_reconciliation_isolated.psql` | 0 | 51 | 0 |  |
| round8_isolated | `service_acceptance_isolated.psql` | 0 | 272 | 0 |  |
| round8_isolated | `typed_subjects_isolated.psql` | 0 | 0 | 0 | C7 audience assertions passed: B-only and GC see neutral draft fields only |
| acl_check | `evidence_manifests_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves 3 table and 6 function revokes; only authorized reads and / PASS: no GRANT/RE |
| acl_check | `external_fulfilment_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves 4 table and 14 function revokes; only authorized read reg / PASS: no GRANT/RE |
| acl_check | `external_package_reading_acl_replay_check.py` | 0 | 4 | 0 | PASS: native extractor retains reader revoke and only the native authenticated reader gran / PASS: no reader A |
| acl_check | `external_presence_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves the exact inactive safety ACL manifest / PASS: no GRANT/REVOKE in dollar-quot |
| acl_check | `external_reader_parity_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves 0 table and 3 function revokes; no helper regranted / PASS: no GRANT/REVOKE i |
| acl_check | `fabrication_authority_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor retains seven function revokes and only two service-role lifecycle  / PASS: no ACL hidd |
| acl_check | `fabrication_instruction_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor retains five function revokes and only the native authenticated iss / PASS: no instruct |
| acl_check | `service_acceptance_client_evidence_acl_replay_check.py` | 0 | 5 | 0 | PASS: native extractor yields exactly the 13 top-level 00889 ACL statements / PASS: each authenticated grant f |
| acl_check | `service_completion_acl_replay_check.py` | 0 | 4 | 0 | PASS: native extractor yields exactly the 23 top-level 00888 ACL statements / PASS: no 00888 ACL hidden inside |
| round8_rc7 | `e1_authority_matrix.sql` | 0 | 115 | 0 | port-swapped mirror (rerun after mirror fix); NOTICE 108 assertions passed |
| round8_rc7 | `e1_mutation_matrix.sql` | 0 | 89 | 0 | port-swapped mirror (rerun after mirror fix); NOTICE 259 actor/RPC outcomes asserted |
| round8_rc7 | `e5_order_retry.sql` | 0 | 0 | 0 | scratch mirror, 55122 -> 61622 |
| round8_rc7 | `e1_c6_audience.sql` | 0 | 90 | 0 | repo file, -v expected_port; release fixes: PASS 76 assertions |
| round8_rc7 | `fix2_stale_refusal_sqlstate.sql` | 0 | 28 | 0 | repo file, -v expected_port |
| round8_rc7 | `fix7_rerequest_refusal.sql` | 0 | 14 | 0 | repo file, -v expected_port; fix7 re-request refusal: PASS 13 assertions |
| round8_rc7 | `fix8_refusal_codes.sql` | 0 | 3 | 0 | repo file, -v expected_port |
| round8_rc7 | `fix9_launch_arrangements.sql` | 0 | 4 | 0 | repo file (hard-codes 61622 = this block), sysid 7702443267905232938 |
| round8_rc7 | `fix3_addendum_lock_order.test.mjs` | 0 | 1 | 0 | scratch mirror, 60622 -> 61622; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_activation.sql` | 0 | 0 | 0 | activation (owned only), scratch mirror |
| round8_rc7 | `e1_storage_bytes.test.mjs` | 0 | 1 | 0 | scratch mirror, 58122/58121 -> 61622/61621; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_acceptance_concurrency.test.mjs` | 0 | 1 | 0 | scratch mirror, 58122/58121 -> 61622/61621; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_invoice_claim_race.test.mjs` | 0 | 1 | 0 | scratch mirror, 58122/58121 -> 61622/61621; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_po_race.test.mjs` | 0 | 1 | 0 | scratch mirror, 58122/58121 -> 61622/61621; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_selection_race.test.mjs` | 0 | 1 | 0 | scratch mirror, 58122/58121 -> 61622/61621; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_print_issue_race.test.mjs` | 0 | 1 | 0 | scratch mirror, 58122/58121 -> 61622/61621; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `service_completion_concurrency.test.mjs` | 0 | 1 | 0 | E1 order, under activation; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_restore.sql` | 0 | 0 | 0 | restore inactive, scratch mirror |
| concurrency | `service_completion_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `service_acceptance_client_evidence_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `prelude` | 0 | - | - | scope_editions on + 2 window grants (owned stack only) |
| concurrency | `billing_lock_order_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `evidence_manifests_concurrency.test.mjs` | 0 | 2 | 0 | tests=2 skipped=0 cancelled=0 |
| concurrency | `external_fulfilment_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `external_presence_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `fabrication_authority_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `fabrication_instruction_concurrency.test.mjs` | 0 | 25 | 0 | tests=25 skipped=0 cancelled=0 |
| concurrency | `owned_psql.test.mjs` | 0 | 140 | 0 | tests=140 skipped=0 cancelled=0 |
| concurrency | `scope_execution_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `service_acceptance_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `service_acceptance_relink_concurrency.test.mjs` | 0 | 1 | 0 | tests=1 skipped=0 cancelled=0 |
| concurrency | `fill_locked_current_concurrency.psql` | 0 | 0 | 0 | compile-only N() helper by design |
| race | `dblink-prerequisite` | 0 | - | - | owned-stack-only CREATE EXTENSION |
| race | `scope_composition_concurrency_test.sql` | 0 | 7 | 0 |  |
| owned | `owned_seed create+seed` | 0/0 | - | - | container 70fe5796c667 |
| owned | `scope_reconciliation_concurrency.test.mjs` | 0 | 6 | 0 | docker-exec into the owned container seeded from rc8-gate-a; tests=6 skipped=0 cancelled=0 |

Headline assertion counts from the NOTICE lines: activation_plan 523, x08 27, client_evidence 327, household_identity 61, release_fixes 76, E1 authority matrix 108, E1 mutation matrix 259 actor/RPC outcomes, fix7 13, fix8 48 raises bound to their codes (38 PT409, 7 XX000, 3 commented 40001), fix9 three arrangements (design_only 3 phases, whole_home 5, fast_track 2) with C2 left inactive.

New since RC-6, all in this table: `external_install_hold_guard_test`/`_isolated` (31), `note_context_labels_test`, `e1_*`, `e5_order_retry`, `fix2`, `fix3`, `fix7`, `fix8`, `fix9`, `e1_c6_audience` (RC8-FIX7 renamed it from `defect_e1_c6_audience.sql`; it now exits 0 with 90 PASS lines).

### edge_api (fresh stack 2, through `scripts/run-sql-tests.sh`)

```
TMPDIR=$G/tmp-edge bash scripts/run-sql-tests.sh -d $G/mirror-edge/supabase/tests -f /edge_api/ -p 61622 -H 127.0.0.1
```

The mirror holds real copies of `edge_api/` (the runner's `find` does not follow symlinked directories) with 54322 swapped to 61622, plus symlinks to the repo's `seed` and `migrations`. Total 8 files: 7 PASS, 1 FAIL (`platform_acl_compatibility_test.sql`, exit 3).

| File | Exit | Note |
|---|---:|---|
| `catalog_roles_remote_conformance_negative_test.sql` | 0 | port-swapped copy (hard-coded 54322 guard) |
| `catalog_roles_remote_conformance_test.sql` | 0 |  |
| `catalog_roles_test.sql` | 0 | port-swapped copy (hard-coded 54322 guard) |
| `platform_acl_compatibility_test.sql` | 3 | KNOWN_FAILURES: aborts at :323 "an Auth/RLS helper is missing a required named EXECUTE grant" (SQ-459), identical to the documented entry |
| `public_acl_exception_registry.sql` | 0 |  |
| `public_acl_residual_census.sql` | 0 |  |
| `public_rpc_authorization_contract_test.sql` | 0 | port-swapped copy |
| `public_sd_hardening_contract_test.sql` | 0 | PRIMARY: SECURITY DEFINER hash pins after 00903/00904; passes with no re-pin needed |

`public_sd_hardening_contract_test.sql` needed **no re-pin**: it passes unmodified on a fresh stack at head 00905, so the 00903 and 00904 redefinitions did not change any pinned SECURITY DEFINER hash.

The runner reported platform_acl as "unexpected" only because its KNOWN_FAILURES lookup keys on the repo-relative path and the file ran from the scratch mirror. The failure is the documented entry (`supabase/tests/KNOWN_FAILURES.md` line 43): same file, same line `:323`, same message.

### Attempts superseded (harness gaps, not product failures)

| Attempt | Result | Cause | Resolution |
|---|---|---|---|
| `e1_authority_matrix.sql`, `e1_mutation_matrix.sql` from the mirror, first run | exit 3, 0 PASS | my mirror had no `tests/round8/`; both files `\ir` `round8/service_acceptance_release_fixes_body.psql` | symlinked `round8` into the mirror, re-ran: exit 0 (108 assertions / 259 outcomes) |
| `e1-active` first run: `e1_storage_bytes`, `e1_invoice_claim_race`, `e1_po_race`, `e1_print_issue_race` | exit 1 each (the other four rows passed) | `e1_storage_bytes.test.mjs:7` asserts `E1_STACK_WORKDIR` contains `/scratchpad/rc7-e1-`; the three race files read neighbour tests (`billing/time_claim_atomicity_test.sql`, `procurement/create_po_rpc_test.sql`, `plan_room/security_and_lifecycle_test.sql`) that the mirror lacked | symlinked every other test directory into the mirror and pointed `E1_STACK_WORKDIR` at a scratchpad symlink named `rc7-e1-rc8-gate-a-work`; re-ran the whole phase: all rows exit 0, restore returned `scope_editions` to false |
| `edge_api` first run: direct `psql` on stack 1 after `prelude`, `conc` and `owned` | catalog_roles x3 exit 3 (`division by zero` at `catalog_roles_test.sql:34`, `..._negative_test.sql:55`, `..._conformance_test.sql:404`: the 54322 guard), `platform_acl` exit 3 at `:164`, `public_sd_hardening` exit 3 at `:5381` | (a) the 54322 guard; (b) stack 1 had `scope_editions` on and committed fixtures; (c) the runner's EVENT 3 parity step was missing | rebuilt a fresh stack, used the port-swapped copies and the runner: 7 of 8 pass |

**Order sensitivity worth knowing (pre-existing, not a shipped-state defect).** `public_sd_hardening_contract_test.sql` fails with `scope_edition_tenant_mismatch` (`:5381`, from `_countersign_design_services_agreement_impl` line 501 -> `_scope_after_execution` -> `_mint_scope_edition`, raise at `00886_round8_service_acceptance.sql:1283`) when it runs on a stack where `scope_editions` is on. Its fixture predates scope editions, so the `proposal.studio_id` / `can_author_scope_proposal` check in `_mint_scope_edition` rejects the synthetic addendum. With `scope_editions` off, the shipped state, it passes. Run it before any activation or `prelude`.

## 3. Types

```
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:61622/postgres pnpm db:generate   # exit 0, package-local CLI 2.77.0
git diff --stat packages/supabase/src/database.types.ts                                   # empty
```

`packages/supabase/src/database.types.ts` regenerated with an **empty diff** (53,291 lines). Nothing to restore.

## 4. Static

Each command ran under a heavy slot (`heavy-1`, acquired and released by my own owner file). Swap was 19.9-21.3 GB used of 20.5-22.5 GB throughout. Free disk was 244-246 GiB.

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @patina/designer-portal type-check` | 0 | `tsc --noEmit` clean |
| `pnpm --filter @patina/designer-portal lint` | 0 | 0 errors, 250 warnings |
| `pnpm --filter @patina/designer-portal exec jest --runInBand` | **1** | 988 suites: 986 passed, **2 failed**. 14,329 tests: 14,323 passed, **6 failed**. 1 snapshot passed. 331.8 s |
| `pnpm --filter @patina/supabase type-check` | 0 | clean |
| `pnpm --filter @patina/supabase test` | 0 | 152 files passed; 2,130 tests passed, 12 skipped (2,142) |
| `pnpm --filter @patina/client-portal type-check` | 0 | clean |
| `pnpm --filter @patina/admin-portal build` | 0 | compiled in 17.5 s, 140 static pages generated. No admin `next dev` was running |
| `node scripts/policy/check-send-authority.mjs` | 0 | "Outbound provider usage is confined to approved chokepoints." |
| `NO_COLOR=1 deno test --allow-all --config supabase/functions/deno.json supabase/functions/sms-inbound/` | 0 | 2 passed, 0 failed; no `deno.lock` appeared |

Another lane (RC8-GATE-B) was running Playwright and `next dev` on 3910/3912 from this same worktree throughout; its dev server rewrote `apps/designer-portal/next-env.d.ts` (`./.next/types/routes.d.ts` to `./.next/dev/types/routes.d.ts`). That diff is not mine and I left it unstaged and unreverted.

## 5. Failures

### F1. `page.test.tsx`, 4 tests: new in RC-8 (FIX10), test not updated

`apps/designer-portal/src/app/(document)/doc/[id]/__tests__/page.test.tsx`, describe "DocumentPage landedRef - A8 first-open gate":

1. "jumps to the active section as before for a visitor whose MRU already holds this document" (`:4512`, `toHaveBeenCalledWith({ block: 'start' })`, 0 calls)
2. "with the Desk act's token > runs the resume jump when the token names no landing" (`:4560`, 0 calls)
3. "while an arrival holds the page > waits for the entry to end, then jumps on a declined end" (`:4587`, expected 1 call, received 0)
4. "while an arrival holds the page > a declined end over the held paper jumps at once" (`:4617`, 0 calls)

**Root cause.** Commit `d30e988aa` (`fix(us-52): land the returning reader in a microtask, not a frame later`, RC-8 FIX10) moved the landing scroll into `queueMicrotask(...)` at `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1806`. The four tests assert `scrollIntoView` synchronously after `render(...)` or `end(...)`, with no microtask flush. That commit updated `round8-paper-frame.test.tsx` but not `page.test.tsx`, which was last edited on 2026-10-24.

**Bisect** (throwaway detached worktree with symlinked `node_modules`, the two files only, `jest --runInBand`): `15ea22fb1~1`, `15ea22fb1`, `f52201a12`, `f8c69add5`, `2079e6341` all pass `page.test.tsx`; `d30e988aa` fails these 4 tests. The failures reproduce in isolation at HEAD (`jest --runInBand --runTestsByPath` on the two files: 6 failed, 211 passed). **Pre-existing: no. Introduced by RC-8.** Severity: test-only (the product behavior is the intended one); fix is to await a microtask in the four tests.

### F2. `paper-order.test.tsx`, 2 tests: introduced by RC-7 E8, not RC-8

`apps/designer-portal/src/app/(document)/doc/[id]/__tests__/paper-order.test.tsx`, describe "the round-8 paper order": "keeps a lead document in its pre-work region, not project chapters" and "keeps a proposal document in its pre-work region, not project chapters". Both fail with `RangeError: Maximum call stack size exceeded`.

**Root cause.** The test stubs `window.requestAnimationFrame` to call its callback synchronously (`paper-order.test.tsx:539-542`). `useChapterReveal`'s sampler (`apps/designer-portal/src/components/document/frame/use-chapter-reveal.ts:126-134`) re-arms itself with `frame = requestAnimationFrame(tick)` whenever `revealStep` returns false, so under the synchronous stub it recurses without bound (`use-chapter-reveal.ts:132` -> stub -> `tick`). The sampler came in with `15ea22fb1` (`fix(designer-portal): reveal the round-8 paper chapter by chapter (RC7-E8-4)`, 2026-10-29).

**Bisect:** `15ea22fb1~1` passes both suites (217/217). `15ea22fb1` fails `paper-order` (17 tests), narrowing to 2 from `f52201a12` onward. **Pre-existing relative to RC-8: yes** (present since the RC-7 E8 lane). RC-7's merged gate ran jest on a 28-file subset (`__tests__` files touched in `3cf79663c..HEAD` plus three named files), which did not include this file, so no earlier gate saw it. Severity: test-only.

### F3. `platform_acl_compatibility_test.sql:323`: pre-existing, documented

Matches `supabase/tests/KNOWN_FAILURES.md:43` (SQ-459): `auth.uid/role/email/jwt` EXECUTE reaches the API roles only through PUBLIC; the same ACL is on prod `bkvcixdmuyejfzcijpdg`. Not round 8.

No SQL, concurrency, ACL, type, build or policy failure was found. No SECURITY DEFINER hash needed re-pinning.

## 6. Not verified

- Swift: skipped as instructed (FIX12 ran it).
- Browser/Playwright: out of scope for this lane (RC8-GATE-B).
- `client_attention_test.sql` (the "missing overload" pre-existing failure in rc7-synthesis): not in this gate's file list (neither RC-6's phases nor `round8_rc7/*`), so it was not run and its status is unchanged.
- `00845_client_edition_rpcs.test.sql` and `00848_client_edition_installed_closeout.test.sql` (hard-coded `port=54322` dblink DSNs): RC-7 ran them from a mirror; the brief for this gate did not list them, so they were not run.
- Edge-function tests other than `sms-inbound/`.
- Populated-database lock timing for 00903-00905 (RC-8 K19 covers it separately).
- A fix for F1 and F2 was not attempted or verified (lane rule: no product or test edits).
- Jest was run once in full; F1 and F2 were then re-run in isolation and across the bisect. A second full jest run was not taken.

## 7. Teardown

- Stack 2 (`rc8-gate-a`) stopped with `supabase stop --workdir <scratch> --no-backup`, exit 0 ("Stopped supabase local development setup."). Stack 1 was stopped the same way before stack 2 started (exit 0).
- The owned reconciliation container `70fe5796c667` (`sidequest.owner=r8-rc8-gate-a`, `sidequest.ticket=SQ-90908`) was removed with `docker rm -f -v`; 0 containers with that label remain.
- After the last command: 0 listeners on 616xx and on 3000-3003; 0 containers, volumes and networks named `rc8-gate-a`; no bisect worktree left in `git worktree list`; no `deno.lock` in the worktree.
- Locks: my `heavy-1` slot was acquired and released for every heavy command (owner file `rc8-gate-a: ...`); `ls $LOCKS` shows no `heavy-*` directory. The `browser` slot present belongs to another lane.
- Worktree state at commit: only `apps/designer-portal/next-env.d.ts` is modified (RC8-GATE-B's dev server, not mine, not staged). No migration, test or product file was edited by this lane.
