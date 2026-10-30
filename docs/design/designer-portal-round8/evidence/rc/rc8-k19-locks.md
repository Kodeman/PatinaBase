# RC-8 K19: populated lock gate for 00896–00905

| | |
|---|---|
| Lane | RC8-K19 (US-52 Room Proof 08, release candidate) |
| Tip SHA tested | `07e5773823abc0f7c5813d416493084b49aeeaed` (branch `r8-evidence`; the migration files are the worktree's) |
| Stack | project_id `rc8-k19-locks`, port block 641: API 64121, DB 64122, shadow 64120, pooler 64129, studio 64123, inbucket 64124, analytics 64127, inspector 64183 |
| Cluster identifier | `7702431107048931370` (every write script refused to run on any other) |
| Applied at stack start | 00867–00895 and `20260910152111` (ledger 821 rows); 00896–00905 held back and applied by the measurement |
| Date | 2026-10-30 |

**Nothing was deployed or pushed.** No `--linked`, Strata, production or shared-stack (54321/54322) access. Cron was off (`cron.launch_active_jobs = off`, confirmed from a new `supabase_admin` session).

## 1. Method

RC-5 §2.1 and §3.1 and RC-6 §3, combined. Each file was applied in its own `psql -v ON_ERROR_STOP=1` transaction, in numeric order, on a populated owned stack. The order inside each transaction was:

1. `SET LOCAL lock_timeout='5s'` and `statement_timeout='120s'`;
2. a snapshot of `pg_class` OIDs, to mark relations as pre-existing;
3. a `clock_timestamp()` reading;
4. `\i <file>`;
5. the `supabase_migrations.schema_migrations` row (`statements = '{}'`, as RC-5 `apply.py` did);
6. capture of the applying backend's granted relation locks in mode `AccessExclusiveLock`, excluding `pg_temp*`;
7. the in-transaction clock;
8. `COMMIT`.

"In-txn ms" runs from the first statement clock to the last, which is the window in which the AccessExclusive locks are held. "Wall ms" includes psql start-up. Lock waits are counted as `lock timeout` errors and any `ERROR:` line in stderr.

**Deviations from the lane brief and from RC-5.**
- `supabase start` does not run seeds, and seeds were off in the scratch `config.toml`. `populate.sql` clones seeded rows, so the 29 data seeds in the `[db.seed]` list were loaded by hand with `psql -1 -v ON_ERROR_STOP=1`, in list order. All 29 exited 0. `00-legacy-grants.sql` and `99-local-edge-settings.sql` were skipped, so no grant census was run.
- `populate.sql` was changed in one place: the system-identifier guard (`7701899881286336554` replaced by this cluster's). Nothing in it broke on the held-back migrations.
- **First attempt discarded.** The first apply run used a glob (`009*`) that matched only 00900–00905, so those six went in without 00896–00899. The stack was stopped with `--no-backup` and rebuilt from the start (start, cron off, seeds, populate, controls, apply). Every number below is from the second, clean run. The discarded run's logs are in the scratch directory `out/aborted-run1/`.

Scripts and raw logs are in the scratch directory `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc8-k19-eURukQ/` (`tools/measure.py`, `tools/populate-k19.sql`, `tools/snap.sql`, `out/locks/`, `out/snap*.txt`, `smoke/`). It is session scratch and is wiped on restart. Every number below is copied from those logs.

## 2. Population

Counted with `count(*)` over every ordinary and partitioned table outside `pg_catalog`, `information_schema`, `pg_toast*`, `cron`, which includes `auth`, `storage`, `realtime` and `supabase_migrations`.

| Stage | Tables | Rows |
|---|---:|---:|
| After seeds (29 data seed files) | 569 | 3,105 |
| After `populate.sql` | 569 | **25,181** |

Selected tables after population. Values match RC-5 §3.1 except `storage.objects`, which has 25 buckets here against 24 in RC-5.

| Table | Rows |
|---|---:|
| auth.users | 468 |
| auth.sessions | 360 |
| auth.refresh_tokens | 2,160 |
| storage.objects | 12,500 (10 under non-uuid `legacy-folder/` in `project-documents`) |
| margin_notes | 1,254 |
| proposals | 520 |
| proposal_agreement_parts | 612 |
| project_phases | 1,515 |
| project_ffe_items | 984 |
| projects | 399 |
| project_parties | 341 |
| project_commercial_documents | 252 |
| client_decisions | 328 |
| scope_change_requests | 38 |
| install_punch_items | 24 |
| service_acceptance_requests | 0 |
| service_arrangements | 0 |

## 3. Per-file result

**10 of 10 files exited 0, with 0 `ERROR` lines and 0 lock-timeout waits.**

| File | In-txn ms | Wall ms | AEL total | auth AEL | storage AEL | Relations under AEL until COMMIT |
|---|---:|---:|---:|---:|---:|---|
| 00896 | 6.7 | 40 | 0 | 0 | 0 | — |
| 00897 | 4.4 | 38 | 0 | 0 | 0 | — |
| 00898 | 4.9 | 38 | 0 | 0 | 0 | — |
| 00899 | 9.8 | 44 | 1 | 0 | 0 | `public.service_acceptance_requests` (table, pre-existing) |
| 00900 | 6.2 | 39 | 0 | 0 | 0 | — |
| 00901 | 4.7 | 37 | 0 | 0 | 0 | — |
| 00902 | 26.0 | 60 | 1 | 0 | 0 | `public.margin_items` (view, pre-existing; `CREATE OR REPLACE VIEW`) |
| 00903 | 4.9 | 39 | 0 | 0 | 0 | — |
| 00904 | 34.8 | 69 | 0 | 0 | 0 | — |
| 00905 | 3.3 | 37 | 0 | 0 | 0 | — |
| **Total** | **105.7** | **441** | | | | |

- **No file touches `auth.*` or `storage.*`.** None of 00896–00905 blocks sign-in, token refresh or storage.
- **Longest hold:** 34.8 ms (00904). 00904 (6,474 lines) captured no AccessExclusive lock on any relation.
- **00899:** `ALTER TABLE … ADD COLUMN` and the offline CHECK hold AEL on `service_acceptance_requests`. The table is created by 00886 and is empty on Strata until C4 activation (RC-6 §3).
- **00902:** the view `margin_items` is locked for 26.0 ms. Reads of that view wait for that window.
- **00899 also takes 2 `ShareRowExclusiveLock` relation locks** and 00902 one `ShareUpdateExclusiveLock`. These do not block reads.
- **Raw `pg_locks` histograms** (`out/locks/locks.json`) show one more AccessExclusive lock per file than the table above. It is the harness's own `pg_temp` table, which the capture excludes.
- The lock counts match RC-6 §3 for 00896–00899 (0, 0, 0, 1 table), now measured on populated data.

### 3.1 Positive control (all rolled back, same stack, before the apply)

| Case | AEL total | auth | storage | Other |
|---|---:|---:|---:|---|
| `CREATE POLICY rc8_probe ON storage.objects FOR SELECT TO authenticated USING (false)` | 21 | 16 | 3 | `realtime.messages`, `realtime.subscription` |
| `CREATE TABLE public.rc8_probe(id int)` | 1 | 0 | 0 | its own table only |
| `ALTER TABLE public.service_acceptance_requests ADD COLUMN rc8_probe int` | 1 | 0 | 0 | that table only |

The capture sees `auth.*` and `storage.*` locks on this stack: the policy case reproduces RC-5's 00892 shape (16 auth, 3 storage) and RC-6's control (21 total). The zeros in §3 are therefore real. After the controls, 0 relations named `rc8_probe*` existed.

## 4. Lost-row check

Row counts of all 569 tables, before the apply and after it (the 10 files plus the harness ledger inserts), compared by name.

- **Tables with fewer rows or dropped: 0.** New tables: 0 (00896–00905 create none).
- **Tables that grew: 2.**
  - `public.service_arrangements`, 0 to 4 (00905 inserts the four launch arrangements at version 1: `design_only`, `fast_track`, `patina_six`, `whole_home`).
  - `supabase_migrations.schema_migrations`, 821 to 831 (the ten ledger rows).
- **Total rows:** 25,181 before, 25,195 after (+4 +10).
- After the smoke suites in §5 the counts were identical to the post-apply counts (`cmp` of the two snapshots), so the suites' rollbacks left nothing behind.
- `server_capabilities`: `margin_note_escalation = f`, `scope_editions = f`. Both are still inactive after 00905.

## 5. Smoke suites (after all ten applied)

`grep -nE '5432[12]'` on each file:

| File | Match | Handling |
|---|---|---|
| `fix7_rerequest_refusal.sql` | lines 10, 16, 19: only the "not the shared 54322" guard | Run as is with `-v expected_port=64122` |
| `fix8_refusal_codes.sql` | lines 19, 22: the same guard | Run as is with `-v expected_port=64122` |
| `fix9_launch_arrangements.sql` | no match, but it hard-codes port `61622` (lines 7 and 12) | Port-swapped scratch copy (`61622` to `64122`, diffed: 2 lines) with `-v fix9_system_identifier=<this cluster>` |

All three ran with `psql -h 127.0.0.1 -p 64122 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f <file>`.

| Suite | Exit | `ERROR` lines | Result lines |
|---|---:|---:|---|
| `fix7_rerequest_refusal.sql` (00903, K11) | 0 | 0 | `PASS 13 assertions` |
| `fix8_refusal_codes.sql` (00904, K12) | 0 | 0 | `PASS: 33 functions; 38 PT409, 7 XX000, 3 commented 40001`; `PASS: 48 raises bound to their codes`; `PASS: Tier 1 rows 1, 3 and 4 refuse with PT409 and change nothing` |
| `fix9_launch_arrangements.sql` (00905, K10), port-swapped copy | 0 | 0 | `PASS FIX9` for `patina_six` (6 phases), `design_only` (3), `whole_home` (5), `fast_track` (2) |

- The fix8 run logged one `WARNING: invoke_edge_function: missing app.settings.supabase_url or service_role_key; skipping decision-resolved-notify`. The local stack has no edge-function settings (`99-local-edge-settings.sql` was skipped); the suite passed.
- **Harness debt:** `fix9_launch_arrangements.sql` hard-codes `61622` instead of taking `expected_port` as fix7 and fix8 do. Any other owned stack needs a swapped copy.

## 6. Not verified

- **Network round trip.** `db push` adds time per file over the network. Not measured (as RC-5 §2.1, §6.3).
- **Strata's own tables and event triggers.** This stack's locks come from its local event triggers, which the positive control proves exist here. That Strata carries the same triggers is RC-5's read-only finding. Row counts here are a synthetic population, not Strata's.
- **Behaviour under concurrent traffic.** No other session ran during the apply. 0 lock timeouts shows no wait at idle, not that none occurs with live sign-ins. Only AccessExclusive was captured; the 00899 and 00902 windows were not tested against concurrent reads.
- **Grant census.** `00-legacy-grants.sql` was not loaded, so the `anon`/`PUBLIC` EXECUTE census on the `db push` path was not repeated for 00896–00905.
- **Other suites.** Only the fix7, fix8 and fix9 suites were run (no `e1_*`, `e5_*` or `fix2`/`fix3` files, and no browser specs).
- **Population fidelity.** The 450 extra users, 500 objects per bucket and cloned rows are synthetic. 00905's catalog contents are DRAFT (K10) and were not reviewed here.

## 7. Teardown proof

- `supabase stop --workdir <scratch> --no-backup` exited 0 (`"Stopped supabase local development setup."`), once after the discarded first run and once at the end.
- After the final stop: 0 listeners on 641xx (`lsof -nP -iTCP -sTCP:LISTEN | grep -E ':641[0-9][0-9]'`); 0 containers, 0 volumes and 0 networks named `rc8-k19-locks` (`docker ps -a`, `docker volume ls`, `docker network ls`).
- The shared stack (`supabase_*_supabase` containers, 54321/54322) was not touched.
- Heavy mutex `heavy-1` was taken with the `mkdir` loop and an owner file (`RC8-K19`), and released after the owner file was checked as this lane's.
