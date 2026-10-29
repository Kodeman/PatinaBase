# RC-7 merged gate (US-52 round 8)

## Header

| Field | Value |
|---|---|
| Worktree / branch | `/Users/kody/Code/patina-r8-evidence` / `r8-evidence` |
| Start tip | `751c916ef` |
| Phase A tip | `bc3864984` (FIX3 merge `30ea65c40` included) |
| Owned stack | `project_id` `patina-rc7-gate`; block 651 (API 65121, DB 65122, shadow 65120, pooler 65129, studio 65123, inbucket 65124, analytics 65127, inspector 65183); dev port 3910 |
| Migration head | `00902`, 828 ledger rows (every fresh stack) |
| Stack recipe | `supabase start -x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`; `cron.launch_active_jobs = off` (as `supabase_admin`, own container); `rc7_owned.stack('patina-rc7-gate')` marker |
| Date | 2026-10-29 |

Fresh stacks, all at head 00902 with cron off:

| sysid | Built from | Used for |
|---|---|---|
| 7702171865069850667 | 751c916ef plus the RC7-GATE-1 test fix | SQL pass 2 |
| 7702172627621785643 | 8fa927d39 | types regen and E7 |
| 7702174698502606891 | 30ea65c40 | FIX3 rerun and edge_api |
| 7702176425532862506 | 30ea65c40 | clean owned rerun |

## Commits made by this gate

| SHA | Change |
|---|---|
| `8fa927d39` | `chore(types)`: regenerated `database.types.ts`, +4 lines (`_external_install_blocker`, 00900) |
| `d6fe9e12f` | `test(rc7)`: re-pinned 4 of 9 00511 dependency body hashes in `edge_api/public_sd_hardening_contract_test.sql` |
| `b62f0b1c7` | `test(rc7)`: made the `note_context_labels_test.sql` withheld-capture setup reachable (RC7-GATE-1) |
| `e0a4c46c8` | `test(rc7)`: flipped RC7-e2-1, RC7-e2-2 and RC7-E3-3 to normal tests; E2 runner port block from env |
| `bc3864984` | `test(rc7)`: E3/E5 owned-port guards follow env (`RC7_E3_*`, `RC7_E5_*`); E3 preflight refuses 54321/54322 |

## Flips (Phase A step 1)

| Probe | Now | Fixed by | Assertion |
|---|---|---|---|
| RC7-e2-1 (`rc7-e2-consumer-journey.journey.ts`) | `@rc7-e2-replace-form` | `1028ea50c` | signer replacement form and audit |
| RC7-e2-2 (same file) | `@rc7-e2-paper-mismatch` | `59d35b07d`, `f6870be8f` | `{ status: 409, code: 'PT409', message: 'stale_scope' }`; 504 comment removed |
| RC7-E3-3 (`rc7-e3-field.spec.ts`) | `A15 Field observation links to the room by its human name` | `f9e2c941d`, 00902 | room by human name |

The `--defect-probe` mode was removed from `rc7-e2-run.mjs`. Its legs now expect 18 results (9 tests × 2 projects). `node --test apps/designer-portal/e2e/round8/rc7-e2-run.unit.mjs` gives 32 pass, 0 fail.

Already flipped before this gate: E6-1..3, E4-1, e7-1. No fixmes remain in the e6 specs.

## Remaining `test.fixme` / `DEFECT RC7-`

| Location | ID | Reason |
|---|---|---|
| `apps/designer-portal/e2e/round8/rc7-e3-audience.spec.ts:12` | A14 | Placeholder, not a reproducer; no fix lane |
| `apps/designer-portal/e2e/round8/rc7-e3-agreement-lineage.spec.ts:435` | RC7-E3-5 | ⌘K cold-start fork; Kody's ruling owed; unfixed |
| `apps/designer-portal/e2e/round8/rc7-e3-field.spec.ts:210` | RC7-E3-2 | Schema/writer gap (no scope or next-owner columns); needs a ruling |
| `apps/designer-portal/e2e/round8/rc7-e3-arrangements.spec.ts:93` | RC7-E3-1 | C2 has no real versioned arrangement; unfixed |
| `supabase/tests/round8_rc7/defect_e1_c6_audience.sql` | RC7-E1-1 | Awaiting Kody's audience ruling. Exits 3 as recorded: the control passes and the assertion fails at `:38` |
| `apps/designer-portal/e2e/document/action-visibility.spec.ts:344` | (not RC7) | Pre-existing 390px overflow; out of scope |

## SQL gate (Phase A step 2)

Runner: `$SP/rc7-gate/gate-rc7.mjs`, adapted from RC-6 `gate-rc6.mjs`. It runs with cwd set to the worktree root. Every psql file is invoked as:

```
psql postgresql://postgres:postgres@127.0.0.1:65122/postgres -X -v ON_ERROR_STOP=1 -v expected_port=65122 -f <file>
```

Every node suite is invoked as:

```
node --test --test-concurrency=1 --test-reporter=tap <file>
```

with `ROUND8_DB_URL` set to that DB and `API_URL=http://127.0.0.1:65121`.

Phase order: `sql`, `acl`, `rc7-inactive`, `edition`, `e1-active`, `conc-self`, `prelude`, `conc`, `race`, `owned`.

The owned phase uses `ROUND8_OWNED_OWNER=r8-rc7-gate`, `ROUND8_OWNED_TICKET=SQ-90907` and `ROUND8_SEED_SOURCE_PROJECT=patina-rc7-gate`.

Files with hard-coded foreign ports run from a scratch mirror (`$SP/rc7-gate/mirror/supabase/tests`). Port swaps used:
- round8_rc7 58122/58121/55122 → 65122/65121;
- 00845/00848 `port=54322` → 65122;
- fix3 60622 → 65122;
- edge_api 54322 → 65122.

The mirror also symlinks `migrations` and `seed` to the worktree. These hard-coded ports are harness debt.

**Pass 2, 99 rows: 97 exit 0, 1 expected exit 3 (`defect_e1_c6_audience.sql`, RC7-E1-1), and 1 owned seed row exit `0/0`.** Headline counts:

| Suite | Result |
|---|---|
| activation_plan | 524 |
| x08 | 28 |
| service_acceptance | 272 |
| client_evidence | 328 |
| household_identity | 62 |
| release_fixes | 83 |
| service_completion | 177 |
| external_install_hold_guard (00900) | 31 test / 31 isolated |
| e1_authority_matrix | 108 assertions |
| e1_mutation_matrix | 259 outcomes |
| fix2_stale_refusal_sqlstate | 28 |
| 00845 / 00848 | 110 / 50 |
| owned_psql.test | 140 |
| scope_composition_concurrency | 7 |
| scope_reconciliation_concurrency | 6/6 |
| ACL py checks | 9, all exit 0 |

The full table is in the appendix. Pass 1 failed only on harness gaps, both fixed in the mirror: 00845 `\ir` (no migrations symlink yet) and the regex for pgTAP's leading-space `ok`.

### edge_api suites (orchestrator addition)

```
TMPDIR=$SP/rc7-gate/logs-edge bash scripts/run-sql-tests.sh -d $SP/rc7-gate/mirror/supabase/tests -f /edge_api/ -p 65122 -H 127.0.0.1
```

The command ran on stack 7702174698502606891 at 30ea65c40. The runner's EVENT 3 parity step ran as `supabase_admin` on the owned stack.

| File | Exit |
|---|---|
| `catalog_roles_remote_conformance_negative_test.sql` | 0 |
| `catalog_roles_remote_conformance_test.sql` | 0 |
| `catalog_roles_test.sql` | 0 (after the mirror `seed` symlink; the first run hit a missing `\ir` path) |
| `platform_acl_compatibility_test.sql` | 3 at `:323`, the documented KNOWN_FAILURES entry (SQ-459, un-ruled `$auth_helpers$`). Not round 8 |
| `public_acl_exception_registry.sql` | 0 |
| `public_acl_residual_census.sql` | 0 |
| `public_rpc_authorization_contract_test.sql` | 0 |
| `public_sd_hardening_contract_test.sql` | 3 before `d6fe9e12f` ("an exact 00511 dependency profile drifted", `:2335`); **0 after** |

**`public_sd_hardening` root cause.** Four of the nine pinned bodies drifted, not only countersign. I extracted each body from its migration text and hashed it as sha256 of `prosrc`; each hash reproduces both the old pin and the live value:

| Function | Pinned (source) | Live (source) | Delta |
|---|---|---|---|
| `app_private.issue_invoice_for_actor` | `19ed…` (00578) | `59d8…` (00882) | project `FOR SHARE` → `FOR UPDATE`; proposal locked before document; not-found refusals added |
| `_countersign_design_services_agreement_impl` | `33af…` (00619) | `0c08…` (00869) → `ab55…` (00885) | 00869: project `FOR UPDATE`, `_scope_after_execution()`. 00885: `executed_at = GREATEST(signed_at, active authority effective_at)` |
| `_execute_furnishings_authorization_authorized` | `4cb2…` (00578) | `14ee…` (00835) → `a25a…` (00876) | 00835: eligibility helper. 00876: ordered source-item `FOR UPDATE`, `external_presence_authorization_refused` |
| `_execute_furnishings_authorization_on_paper_authorized` | `71e3…` (00578) | `83b2…` (00835) → `ff92…` (00876) | same as the row above |

For all four, owner (`postgres`), plpgsql, `prosecdef = t`, proconfig, arguments, result type and ACL (`{postgres=X/postgres}`) are unchanged.

With only the four hashes swapped, the whole file exits 0. That covers the ACL, caller-universe, metadata-anchor, authority-lock-order and trigger-binding contracts, so the hardening contract is intact and this is not an RC7-GATE defect.

00835 is on `main` (`cd8b1378b`, 2026-10-19), and the test was last edited on 2026-10-18 (`68a77da64`). **This file has therefore been red on `main` since 00835.**

**RC-6:** `rc6-final-tip-sql.md` and `rc1-sql-gate.md` list no `edge_api` file. No RC gate ran `supabase/tests/edge_api/`, which is how the drift went unseen.

**Residue observed:** this file's committed dblink fixtures (`d485…`) are deleted under `session_replication_role = replica`. That leaves FK orphans: 11 `user_roles`, 7 `organization_members` and 1 `invoice_links`. A later `owned_seed.mjs seed` from that stack then exits 1 on the FK re-add. This is pre-existing test hygiene and was not fixed here. The owned suite was rerun on a clean stack (below).

### FIX3 rerun (after merge `30ea65c40`, stack built from HEAD)

`create_service_addendum` on the stack contains `FOR KEY SHARE` (checked from `prosrc`).

| Suite | Exit | Count |
|---|---:|---|
| `round8/scope_composition_test.sql` | 0 | 164 |
| `round8/scope_consumer_projection_test.sql` | 0 | 5 |
| `round8/scope_execution_test.sql` | 0 | 117 |
| `round8/scope_reconciliation_test.sql` | 0 | 51 |
| `round8/scope_composition_isolated.psql` | 0 | 163 |
| `round8/scope_execution_isolated.psql` | 0 | 117 |
| `round8/scope_reconciliation_isolated.psql` | 0 | 51 |
| `round8_rc7/fix2_stale_refusal_sqlstate.sql` (repo file, repo root) | 0 | 28 PASS |
| `round8_rc7/fix3_addendum_lock_order.test.mjs` (scratch copy, 60622 → 65122, `FIX3_DB_WINDOW=owned`) | 0 | 1/1 ("project first, no 40P01"); `scope_editions` restored to `f` |
| `round8/scope_execution_concurrency.test.mjs` (after prelude) | 0 | 1/1 |
| `round8/scope_composition_concurrency_test.sql` (`-v scope_concurrency_rehearsal=on`) | 0 | 7 |
| `round8/scope_reconciliation_concurrency.test.mjs` (owned container) | 0 | 6/6. Seed was `0/1` on the residue stack; on clean stack 7702176425532862506, seed `0/0` and 6/6 (container `98b1ea928e12`) |

## E7 payloads (Phase A step 3)

Stack 7702172627621785643:
- `mixed-fixture.sql` applied with exit 0 and 0 ERROR;
- the export exited 0, with 0 secrets.

The canonical diff covers UUIDs, timestamps, dates and hashes normalized, arrays sorted, and `NNN:{json}` bodies canonicalized. Against `apps/designer-portal/e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json` (d3107a4cd) it differs only in:
- `api` (59121 vs 65121);
- the committed provenance note `rewrittenFor00901`.

The threshold body is identical (`selections: []`, external `E7 client-bought chair`). The fixture is unchanged. Consumers:
- designer `src/hooks/__tests__/rc7-e7-x08-consumers.test.ts` passes;
- client `src/lib/__tests__/rc7-e7-x08-client-consumers.test.tsx` and `rc7-e7-x08-client-counts.test.ts` pass (see static gates).

## Types (Phase A step 4)

`SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:65122/postgres pnpm db:generate` (package-local CLI 2.77.0) added `_external_install_blocker` (+4 lines). Committed as `8fa927d39`. `pnpm --filter @patina/admin-portal build` exit 0.

## Static gates (Phase A step 5)

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | exit 0 |
| `pnpm --filter @patina/designer-portal lint` | exit 0: 0 errors, 250 warnings |
| `pnpm --filter @patina/client-portal type-check` | exit 0 |
| `pnpm --filter @patina/supabase type-check` | exit 0 |
| `pnpm --filter @patina/supabase test` | exit 0: 151 files, 2124 passed, 12 skipped |
| `pnpm --filter @patina/admin-portal build` | exit 0 |
| `node scripts/policy/check-send-authority.mjs` | exit 0 |
| designer jest: `npx jest --runInBand --runTestsByPath <28 absolute file paths>` (round8/rc7 tests, `__tests__` touched in `3cf79663c..HEAD`, `src/lib/document/__tests__/{shadow-gate,contrast,document-action-hierarchy-contract}.test.ts`) | exit 0: 28 suites, 659 tests passed |
| client jest: `npx jest --runInBand --runTestsByPath` on `src/lib/__tests__/rc7-e7-x08-client-consumers.test.tsx`, `src/lib/__tests__/rc7-e7-x08-client-counts.test.ts`, `src/lib/commercial-documents.test.ts` | exit 0: 3 suites, 104 tests passed, 0 skipped |

## Defects

| ID | Severity / confidence | Kind | Root cause | Disposition |
|---|---|---|---|---|
| RC7-GATE-1 | low / high | test defect, not product | `supabase/tests/round8/note_context_labels_test.sql:47`. The hidden setup re-authored capture XB to designer D, a studio co-member of A1, so `field_captures_studio_select` (`is_studio_comember`, 00584) correctly showed it; the "withheld" case was unreachable | Fixed in the test (`b62f0b1c7`): visible and hidden setups split (hidden routes XB into A's project under `session_replication_role = replica`), plus two non-vacuity asserts. Exits 0. 00902 is unchanged |

There are no product defects from Phase A. The `public_sd_hardening` drift is an integration re-pin, not a defect (see above).

## Phase B (browser)

Pending.

## Not verified

- `platform_acl_compatibility_test.sql` stays red on its documented, un-ruled `$auth_helpers$` block; this is outside round 8.
- The FK-orphan residue from `public_sd_hardening_contract_test.sql` was not fixed (test hygiene, pre-existing).

## Teardown

Pending.

## Appendix: SQL pass 2 table (stack 7702171865069850667)

| Group | Suite | Exit | PASS | FAIL | Note |
|---|---|---:|---:|---:|---|
| service_c4 | `service_acceptance_activation_plan_test.sql` | 0 | 524 | 0 | repo file (owned-port guard); psql:supabase/tests/round8/service_acceptance_activation_plan_test.sql:80: NOTICE:  C4 activation plan: PASS 523 assertions |
| service_c4 | `service_acceptance_x08_test.sql` | 0 | 28 | 0 | repo file (owned-port guard); psql:supabase/tests/round8/service_acceptance_x08_test.sql:241: NOTICE:  X08: PASS 27 assertions |
| service_c4 | `service_acceptance_test.sql` | 0 | 272 | 0 |  |
| service_c4 | `service_acceptance_client_evidence_test.sql` | 0 | 328 | 0 | psql:supabase/tests/round8/service_acceptance_client_evidence_test.sql:1441: NOTICE:  C4 client evidence: PASS 327 assertions |
| service_c4 | `service_acceptance_household_identity_test.sql` | 0 | 62 | 0 | psql:supabase/tests/round8/service_acceptance_household_identity_body.psql:448: NOTICE:  C4 household identity: PASS 61 assertions |
| service_c4 | `service_acceptance_release_fixes_test.sql` | 0 | 83 | 0 | psql:supabase/tests/round8/service_acceptance_release_fixes_body.psql:747: NOTICE:  release fixes: PASS 76 assertions |
| service_c6 | `service_completion_test.sql` | 0 | 177 | 0 |  |
| round8_test | `billing_lock_order_test.sql` | 0 | 21 | 0 |  |
| round8_test | `document_open_chain_alias_test.sql` | 0 | 26 | 0 | psql:supabase/tests/round8/document_open_chain_alias_body.psql:94: NOTICE:  PASS: cross-studio fixtures are all readable before boundary ass |
| round8_test | `evidence_manifests_test.sql` | 0 | 162 | 0 |  |
| round8_test | `external_fulfilment_test.sql` | 0 | 123 | 0 |  |
| round8_test | `external_install_hold_guard_test.sql` | 0 | 31 | 0 |  |
| round8_test | `external_package_reading_test.sql` | 0 | 87 | 0 |  |
| round8_test | `external_presence_test.sql` | 0 | 161 | 0 |  |
| round8_test | `external_reader_parity_test.sql` | 0 | 231 | 0 |  |
| round8_test | `fabrication_authority_test.sql` | 0 | 170 | 0 |  |
| round8_test | `fabrication_instruction_test.sql` | 0 | 82 | 0 |  |
| round8_test | `fill_locked_current_test.sql` | 0 | 11 | 0 |  |
| round8_test | `note_context_labels_test.sql` | 0 | 0 | 0 | psql:supabase/tests/round8/typed_subjects_body.psql:325: NOTICE:  C7 audience assertions passed: B-only and GC see neutral draft fields only |
| round8_test | `placement_retry_idempotency_test.sql` | 0 | 10 | 0 |  |
| round8_test | `plan_composition_test.sql` | 0 | 96 | 0 |  |
| round8_test | `readiness_batch_test.sql` | 0 | 55 | 0 |  |
| round8_test | `scope_composition_test.sql` | 0 | 164 | 0 |  |
| round8_test | `scope_consumer_projection_test.sql` | 0 | 5 | 0 |  |
| round8_test | `scope_execution_test.sql` | 0 | 117 | 0 |  |
| round8_test | `scope_reconciliation_test.sql` | 0 | 51 | 0 |  |
| round8_test | `typed_subjects_test.sql` | 0 | 1 | 0 | psql:supabase/tests/round8/typed_subjects_body.psql:325: NOTICE:  C7 audience assertions passed: B-only and GC see neutral draft fields only |
| legacy_contract | `proposal_phase_authority_atomicity_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `close_project_readiness_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `product_configuration_test.sql` | 0 | 0 | 0 | psql:supabase/tests/library/product_configuration_test.sql:1397: NOTICE:  All furniture configuration assertions passed. |
| legacy_contract | `configuration_privacy_contract_test.sql` | 0 | 1 | 0 |  |
| legacy_contract | `00463_authority_evidence_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00464_lifecycle_compatibility_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00465_notification_traceability_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00467_client_access_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00468_stage2_option_privacy_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00569_why_viewer_role_receipt_contract_test.sql` | 0 | 0 | 0 |  |
| round8_isolated | `billing_lock_order_isolated.psql` | 0 | 21 | 0 |  |
| round8_isolated | `document_open_chain_alias_isolated.psql` | 0 | 25 | 0 | psql:supabase/tests/round8/document_open_chain_alias_body.psql:94: NOTICE:  PASS: cross-studio fixtures are all readable before boundary ass |
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
| round8_isolated | `typed_subjects_isolated.psql` | 0 | 0 | 0 | psql:supabase/tests/round8/typed_subjects_body.psql:325: NOTICE:  C7 audience assertions passed: B-only and GC see neutral draft fields only |
| acl_check | `evidence_manifests_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves 3 table and 6 function revokes; only authorized reads and / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | `external_fulfilment_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves 4 table and 14 function revokes; only authorized read reg / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | `external_package_reading_acl_replay_check.py` | 0 | 4 | 0 | PASS: native extractor retains reader revoke and only the native authenticated reader gran / PASS: no reader ACL hidden inside dollar bodies; no generated seed edit / PASS: native extractor retains reader revoke and only the native authenticated reader gran / PASS: no reader ACL hidden inside dollar bodies; no generated seed edit |
| acl_check | `external_presence_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves the exact inactive safety ACL manifest / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | `external_reader_parity_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor preserves 0 table and 3 function revokes; no helper regranted / PASS: no GRANT/REVOKE in dollar-quoted bodies |
| acl_check | `fabrication_authority_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor retains seven function revokes and only two service-role lifecycle  / PASS: no ACL hidden in dollar bodies; no legacy fabrication predicate |
| acl_check | `fabrication_instruction_acl_replay_check.py` | 0 | 2 | 0 | PASS: native extractor retains five function revokes and only the native authenticated iss / PASS: no instruction ACL hidden inside dollar bodies; no generated seed edit |
| acl_check | `service_acceptance_client_evidence_acl_replay_check.py` | 0 | 5 | 0 | PASS: native extractor yields exactly the 13 top-level 00889 ACL statements / PASS: each authenticated grant follows its own revoke / PASS: no 00889 ACL hidden inside a dollar body / PASS: the regenerated seed replays all 13 00889 ACL statements in order / PASS: no 00889 statement grants anon |
| acl_check | `service_completion_acl_replay_check.py` | 0 | 4 | 0 | PASS: native extractor yields exactly the 23 top-level 00888 ACL statements / PASS: no 00888 ACL hidden inside a dollar body / PASS: the regenerated seed replays all 23 00888 ACL statements in order / PASS: no 00888 statement grants anon |
| round8_rc7 | `e1_authority_matrix.sql` | 0 | 115 | 0 | scratch mirror, port-swapped; psql:mirror:r |
| round8_rc7 | `e1_mutation_matrix.sql` | 0 | 89 | 0 | scratch mirror, port-swapped; psql:mirror:r |
| round8_rc7 | `e5_order_retry.sql` | 0 | 0 | 0 | scratch mirror, 55122 -> 65122 |
| round8_rc7 | `fix2_stale_refusal_sqlstate.sql` | 0 | 28 | 0 | repo file, -v expected_port |
| defect | `defect_e1_c6_audience.sql` | 3 | 84 | 1 | EXPECTED exit 3 (RC7-E1-1, awaiting Kody ruling); psql:mirror:r; first error: psql:mirror:round8_rc7/defect_e1_c6_audience.sql:38: ERROR:  ASSERTION FAILED: DEFECT RC7-E1- |
| edition | `00845_client_edition_rpcs.test.sql` | 0 | 110 | 0 | scratch copy, dblink port=54322 -> 65122 |
| edition | `00848_client_edition_installed_closeout.test.sql` | 0 | 50 | 0 | scratch copy, dblink port=54322 -> 65122 |
| round8_rc7 | `e1_activation.sql` | 0 | 0 | 0 | activation (owned only) |
| round8_rc7 | `e1_storage_bytes.test.mjs` | 0 | 1 | 0 | scratch mirror; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_acceptance_concurrency.test.mjs` | 0 | 1 | 0 | scratch mirror; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_invoice_claim_race.test.mjs` | 0 | 1 | 0 | scratch mirror; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_po_race.test.mjs` | 0 | 1 | 0 | scratch mirror; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_selection_race.test.mjs` | 0 | 1 | 0 | scratch mirror; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_print_issue_race.test.mjs` | 0 | 1 | 0 | scratch mirror; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `service_completion_concurrency.test.mjs` | 0 | 1 | 0 | E1 order, under activation; tests=1 skipped=0 cancelled=0 |
| round8_rc7 | `e1_restore.sql` | 0 | 0 | 0 | restore inactive |
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
| owned | `owned_seed create+seed` | 0/0 | - | - | container 9375d9d59ee0 |
| owned | `scope_reconciliation_concurrency.test.mjs` | 0 | 6 | 0 | docker-exec into the owned container seeded from patina-rc7-gate; tests=6 skipped=0 cancelled=0 |
