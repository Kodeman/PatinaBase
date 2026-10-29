# RC-6: final-tip SQL, edge and lock gate

US-52 Room Proof 08, step RC-6 (final tip). Run on 2026-10-28 in the worktree `/Users/kody/Code/patina-r8-integrate`, branch `r8-integrate`, at `c066bc47a` (all lanes merged). Every command ran from that worktree.

**Nothing was deployed or pushed, and Strata was not touched.** The gate ran on an owned local stack: CLI project `patina-fixdb` on ports 59321 (API), 59322 (DB), 59320 (shadow) and 59329. No command reached the shared 54321/54322 stack, the 57xxx stack or any 3000-range dev server, and nothing ran with `--linked`.

**Result.**

- **SQL gate:** 81 rows. 80 exit 0 with 0 failures. The other row is the first owned-container attempt, which failed in the runner itself (it did not pass `ROUND8_OWNED_OWNER`). The re-run against the same seeded container passed 6 of 6 (§2).
- **Locks:** 00896–00899 take **no AccessExclusiveLock on any `auth.*` or `storage.*` table**. 00899 takes one AccessExclusiveLock, on `public.service_acceptance_requests` (pre-existing). Each file holds its locks for at most 10.5 ms inside the transaction; the four files total 27.9 ms (§3).
- **Generated files:** `database.types.ts` and `00-legacy-grants.sql` regenerate with empty diffs (§4).
- **Edge:** 729 passed, 7 failed. All 7 failures are in `invoice-subject.test.ts` and `spec-pdf.test.ts`, which US-52 does not touch, and the same 7 fail at the merge base `0bd6306e9`. Every US-52 edge test passed (§5).
- **Policy:** `check-send-authority` exit 0 (§6).

Raw logs and scripts are kept out of git, under the scratch directory `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc6/` (`logs/`, `locks/`, `gate-rc6.mjs`, `locks.py`). That directory is session scratch and is wiped on restart. Every number below is copied from those logs.

## 1. Stacks

Both stacks used a scratch workdir holding a copy of r8-integrate's `supabase/` (without `functions/`). Its `config.toml` differs from the worktree's only in `project_id` and ports. The `.temp` version pins came from the earlier owned stack, and services started with `-x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`. Before any measurement, `cron.launch_active_jobs` was set to `off` (via `ALTER SYSTEM` and a reload).

1. **Lock stack:** migrations through 00895 plus `20260910152111_create_contact_messages.sql`, with 00896–00899 held back and seeds off (the legacy-grants seed names 00896–00899 functions). It was not populated.
2. **Gate stack:** it was stopped with `--no-backup` and started fresh from the full set. `diff -r` showed the workdir's `supabase/` identical to r8-integrate's, apart from `functions/`, `.temp` and the port rewrite. The stack ran every migration and every seed in `[db.seed]`. Afterwards it held 32 ledger rows from 00868 to 00899, with head 00899.

## 2. SQL, ACL and concurrency gate

**Runner:** `gate-rc6.mjs`, adapted from the SQ-2234 RC-1 runner. Its phases ran in this order: `sql`, then `acl`, then the generated-file diffs (§4), then `conc-self`, `prelude`, `conc`, `race`, `owned` and `owned-rerun`.

- **psql suites:** `psql postgresql://postgres:postgres@127.0.0.1:59322/postgres -X -v ON_ERROR_STOP=1 -v expected_port=59322 -f <suite>`.
- **activation_plan and X08:** run from the repo files, with no scratch copies; their a7efddc42 guard accepts any local port except 54322.
- **Concurrency suites:** `node --test --test-concurrency=1 --test-reporter=tap`, with `ROUND8_DB_URL` set to the owned DB and the suite's `*_DB_WINDOW=owned`.
- **prelude:** turns `scope_editions` on and adds the two window grants, owned stack only.
- **race:** creates `dblink` on the owned stack, then runs `scope_composition_concurrency_test.sql -v scope_concurrency_rehearsal=on`.
- **owned:** `owned_seed.mjs create`, then `seed` from `patina-fixdb`, labels `sidequest.owner=r8-rc6-final-tip` and `sidequest.ticket=SQ-90906` (a lane-local label). Then `scope_reconciliation_concurrency.test.mjs` over the `docker-exec` transport.

The PASS column counts lines containing `PASS` for psql suites, or the TAP `# pass` count for node suites. Legacy contract suites assert by raising, so their 0 PASS lines with exit 0 is a pass.

| Group | Suite | Exit | PASS | FAIL | Note |
|---|---|---:|---:|---:|---|
| service_c4 | `service_acceptance_activation_plan_test.sql` | 0 | 524 | 0 | repo file (a7efddc42 owned-port guard) |
| service_c4 | `service_acceptance_x08_test.sql` | 0 | 28 | 0 | repo file (a7efddc42 owned-port guard) |
| service_c4 | `service_acceptance_test.sql` | 0 | 271 | 0 |  |
| service_c4 | `service_acceptance_client_evidence_test.sql` | 0 | 328 | 0 |  |
| service_c4 | `service_acceptance_household_identity_test.sql` | 0 | 62 | 0 |  |
| service_c4 | `service_acceptance_release_fixes_test.sql` | 0 | 83 | 0 |  |
| service_c6 | `service_completion_test.sql` | 0 | 177 | 0 |  |
| round8_test | `billing_lock_order_test.sql` | 0 | 21 | 0 |  |
| round8_test | `document_open_chain_alias_test.sql` | 0 | 25 | 0 |  |
| round8_test | `evidence_manifests_test.sql` | 0 | 162 | 0 |  |
| round8_test | `external_fulfilment_test.sql` | 0 | 120 | 0 |  |
| round8_test | `external_package_reading_test.sql` | 0 | 87 | 0 |  |
| round8_test | `external_presence_test.sql` | 0 | 161 | 0 |  |
| round8_test | `external_reader_parity_test.sql` | 0 | 225 | 0 |  |
| round8_test | `fabrication_authority_test.sql` | 0 | 170 | 0 |  |
| round8_test | `fabrication_instruction_test.sql` | 0 | 82 | 0 |  |
| round8_test | `fill_locked_current_test.sql` | 0 | 10 | 0 |  |
| round8_test | `placement_retry_idempotency_test.sql` | 0 | 9 | 0 |  |
| round8_test | `plan_composition_test.sql` | 0 | 95 | 0 |  |
| round8_test | `readiness_batch_test.sql` | 0 | 55 | 0 |  |
| round8_test | `scope_composition_test.sql` | 0 | 163 | 0 |  |
| round8_test | `scope_consumer_projection_test.sql` | 0 | 5 | 0 |  |
| round8_test | `scope_execution_test.sql` | 0 | 117 | 0 |  |
| round8_test | `scope_reconciliation_test.sql` | 0 | 51 | 0 |  |
| round8_test | `typed_subjects_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `proposal_phase_authority_atomicity_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `close_project_readiness_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `product_configuration_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `configuration_privacy_contract_test.sql` | 0 | 1 | 0 |  |
| legacy_contract | `00463_authority_evidence_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00464_lifecycle_compatibility_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00465_notification_traceability_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00467_client_access_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00468_stage2_option_privacy_contract_test.sql` | 0 | 0 | 0 |  |
| legacy_contract | `00569_why_viewer_role_receipt_contract_test.sql` | 0 | 0 | 0 |  |
| round8_isolated | `billing_lock_order_isolated.psql` | 0 | 21 | 0 |  |
| round8_isolated | `document_open_chain_alias_isolated.psql` | 0 | 25 | 0 |  |
| round8_isolated | `evidence_manifests_isolated.psql` | 0 | 162 | 0 |  |
| round8_isolated | `external_fulfilment_isolated.psql` | 0 | 120 | 0 |  |
| round8_isolated | `external_package_reading_isolated.psql` | 0 | 87 | 0 |  |
| round8_isolated | `external_presence_isolated.psql` | 0 | 161 | 0 |  |
| round8_isolated | `external_reader_parity_isolated.psql` | 0 | 225 | 0 |  |
| round8_isolated | `fabrication_authority_isolated.psql` | 0 | 170 | 0 |  |
| round8_isolated | `fabrication_instruction_isolated.psql` | 0 | 82 | 0 |  |
| round8_isolated | `fill_locked_current_isolated.psql` | 0 | 10 | 0 |  |
| round8_isolated | `placement_retry_idempotency_isolated.psql` | 0 | 9 | 0 |  |
| round8_isolated | `plan_composition_isolated.psql` | 0 | 95 | 0 |  |
| round8_isolated | `readiness_batch_isolated.psql` | 0 | 55 | 0 |  |
| round8_isolated | `scope_composition_isolated.psql` | 0 | 163 | 0 |  |
| round8_isolated | `scope_execution_isolated.psql` | 0 | 117 | 0 |  |
| round8_isolated | `scope_reconciliation_isolated.psql` | 0 | 51 | 0 |  |
| round8_isolated | `service_acceptance_isolated.psql` | 0 | 271 | 0 |  |
| round8_isolated | `typed_subjects_isolated.psql` | 0 | 0 | 0 |  |
| acl_check | `evidence_manifests_acl_replay_check.py` | 0 | 2 | 0 | 2 PASS lines |
| acl_check | `external_fulfilment_acl_replay_check.py` | 0 | 2 | 0 | 2 PASS lines |
| acl_check | `external_package_reading_acl_replay_check.py` | 0 | 4 | 0 | 4 PASS lines |
| acl_check | `external_presence_acl_replay_check.py` | 0 | 2 | 0 | 2 PASS lines |
| acl_check | `external_reader_parity_acl_replay_check.py` | 0 | 2 | 0 | 2 PASS lines |
| acl_check | `fabrication_authority_acl_replay_check.py` | 0 | 2 | 0 | 2 PASS lines |
| acl_check | `fabrication_instruction_acl_replay_check.py` | 0 | 2 | 0 | 2 PASS lines |
| acl_check | `service_acceptance_client_evidence_acl_replay_check.py` | 0 | 5 | 0 | 5 PASS lines |
| acl_check | `service_completion_acl_replay_check.py` | 0 | 4 | 0 | 4 PASS lines |
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
| owned | `owned_seed create+seed` | 0/0 | - | - | container c7b0dc598070 |
| owned | `scope_reconciliation_concurrency.test.mjs` | 1 | 5 | 1 | docker-exec into the owned container seeded from patina-fixdb; tests=6 skipped=0 cancelled=0 |
| owned | `scope_reconciliation_concurrency.test.mjs` | 0 | 6 | 0 | RE-RUN with ROUND8_OWNED_OWNER passed (first row: runner omitted it); tests=6 skipped=0 cancelled=0 |

**Owned row, attempt 1:** this is a runner defect, not a code failure. The runner passed `ROUND8_OWNED_TICKET` to the test but not `ROUND8_OWNED_OWNER`. The verbatim failure was:

```
not ok 1 - reconciliation follows execution locks and refuses moved sets with atomic receipts
  error: 'ROUND8_OWNED_OWNER must name the claim holder that provisioned the container'
```

The re-run used the same container with the owner passed, and passed 6 of 6. It proved the project-row wait three times.

## 3. Lock measurement, 00896–00899

**Method:** RC-5 §2.1's method, on the lock stack (§1.1). Each file was applied in its own transaction in this order:

1. `BEGIN`;
2. a snapshot of `pg_class` OIDs, to mark relations as pre-existing;
3. a `clock_timestamp()` reading;
4. `\i <file>`;
5. the `supabase_migrations.schema_migrations` row;
6. capture of the applying backend's granted relation locks in mode `AccessExclusiveLock`, excluding `pg_temp*`;
7. the in-transaction clock;
8. `COMMIT`.

"In-txn ms" runs from the first statement clock to the last, which is the window in which AccessExclusive locks are held. "Wall ms" includes psql start-up. The stack was fresh and **not populated**, so table sizes are near zero. Script: `locks.py`; raw output: `locks/locks.json` and `locks/<file>.log`.

| File | In-txn ms | Wall ms | AEL | auth AEL | storage AEL | Relations under AEL until COMMIT |
|---|---:|---:|---:|---:|---:|---|
| 00896 | 6.5 | 67 | 0 | 0 | 0 | — |
| 00897 | 5.3 | 44 | 0 | 0 | 0 | — |
| 00898 | 5.6 | 40 | 0 | 0 | 0 | — |
| 00899 | 10.5 | 45 | 1 | 0 | 0 | `public.service_acceptance_requests` (pre-existing; `ALTER TABLE … ADD COLUMN` ×4 and the offline CHECK) |
| **Total** | **27.9** | **196** | | | | |

- **Positive control (rolled back):** on the same stack, `CREATE POLICY rc6_probe ON storage.objects …` captured auth AEL 16, storage AEL 3 and total 21, exactly RC-5's 00892 shape. The capture therefore does see `auth.*` and `storage.*` locks, and the zeros above are real.
  - A rolled-back `CREATE TABLE public.rc6_probe(id int)` locked only its own table.
  - A rolled-back `ALTER TABLE public.service_acceptance_requests ADD COLUMN` locked only that table.
- **Effect at ship:** none of 00896–00899 blocks sign-in, token refresh or storage. 00899 briefly blocks reads and writes of `service_acceptance_requests`. That table is created by this branch's 00886 and is empty on Strata until C4 activation.
- **Not measured:** times on a populated database, and the network round trip `db push` adds per file. RC-5 §2.1 and §6.3 cover both for 00868–00895.

## 4. Generated files

Neither committed file was overwritten. Each was generated to scratch and diffed.

- **Types:** `pnpm --filter @patina/supabase exec supabase gen types typescript --db-url postgresql://postgres:postgres@127.0.0.1:59322/postgres > rc6/database.types.ts` used the package-local CLI 2.77.0, the same binary `pnpm db:generate` uses. Then `diff packages/supabase/src/database.types.ts rc6/database.types.ts`. **Empty diff** (exit 0, 53,287 lines).
  - An earlier attempt run from inside `packages/supabase` without `pnpm exec` picked up the Homebrew CLI 2.120.0. It exited 1 and was discarded; it wrote only to scratch.
- **Legacy grants:** `scripts/generate-legacy-grants.py` was copied to scratch with `ROOT` set to the worktree and `OUT` to `rc6/legacy-grants.sql` ("baseline + 4260 replayed statements"). Then `diff supabase/seed/00-legacy-grants.sql rc6/legacy-grants.sql`. **Empty diff** (exit 0).

## 5. Edge

`NO_COLOR=1 deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/ supabase/functions/service-acceptance-paper-hash/` was run from the worktree root (deno 2.8.3). `supabase/functions/deno.json` sets `"lock": false`, and no `deno.lock` appeared; `git status` stayed clean.

**Result:** `FAILED | 729 passed | 7 failed`. The US-52 suites all passed:

- `service-acceptance-paper-hash/handler.test.ts`: 20 tests;
- `_shared/outbound-kinds/service_acceptance_request.test.ts`: 7 tests;
- `_shared/outbound-send.test.ts`: 19 tests.

The 7 failures, verbatim:

```
every invoice sender names the letter through invoiceSubjectName => ./supabase/functions/_shared/invoice-subject.test.ts:200:6
  error: AssertionError: invoice-send/index.ts no longer imports the shared derivation
no letter sender hands the resolver a stand-in name to fall back to => ./supabase/functions/_shared/invoice-subject.test.ts:233:6
  error: AssertionError: invoice-send/index.ts names no letter at all
every client-letter sender reads the footer flag off the invoice row => ./supabase/functions/_shared/invoice-subject.test.ts:250:6
  error: AssertionError: invoice-send/index.ts sets no studioInvoice flag
every invoice sender still selects the studio anchor and the title => ./supabase/functions/_shared/invoice-subject.test.ts:268:6
  error: AssertionError: invoice-send/index.ts no longer selects studio_id and title on the invoice row
every branding sender resolves identity from the invoice's own anchors => ./supabase/functions/_shared/invoice-subject.test.ts:281:6
  error: AssertionError: invoice-send/index.ts resolves no studio identity at all
all-USD schedule PDF is byte-for-byte its pinned output => ./supabase/functions/_shared/spec-pdf.test.ts:333:6
  error: AssertionError: Values are not equal:
all-USD item PDF is byte-for-byte the pre-SQ-212 output => ./supabase/functions/_shared/spec-pdf.test.ts:348:6
  error: AssertionError: Values are not equal:
```

**These 7 failures predate US-52:**

- `git diff 0bd6306e9 HEAD` touches none of `invoice-send/`, `_shared/invoice-subject*` or `_shared/spec-pdf*`.
- A `git archive` of the merge base `0bd6306e9`, running the same two test files, gives `FAILED | 53 passed | 7 failed` with the same seven test names.

## 6. Policy

`node scripts/policy/check-send-authority.mjs`: exit 0, "Outbound provider usage is confined to approved chokepoints."

## 7. Not run

- **Populated-database lock timing:** the lock stack was fresh and unpopulated. RC-5's populated rehearsal covered 00868–00895 only.
- **Round trip:** the network round trip that `db push` adds per file was not measured.
- **Other edge suites:** only `_shared/` and `service-acceptance-paper-hash/` ran.
- **Out of scope for this step:** portal type-check, lint, jest, Playwright and browser walks; package vitest; iOS.

## 8. Teardown

- The owned reconciliation container (`c7b0dc598070`, ticket `SQ-90906`) was removed with `docker rm -f -v`.
- The stack was stopped with `supabase stop --workdir <scratch> --no-backup`.
- Afterwards there were no listeners on 59320, 59321, 59322 or 59329, and 0 `patina-fixdb` containers, volumes or networks.
