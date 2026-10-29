# RC-7 E1 — DB authority, privacy and races

- Tested tip: `5b6bccd63` (following `393de0f50` and `e2494012e`); 2026-10-29. Fresh isolated E1 stack; post-review passing suites run twice. Early authoring runs failed on temp-helper privileges and a mismatched Storage status/body, then were corrected and rerun twice.
- Isolated local project: `patina-rc7-e1`; API `58121`, DB `58122`, shadow `58120`, pooler `58129`; fresh DB system identifier `7702160665312129067`. Numbered migration head `00899` (plus the pre-existing timestamp-named contact migration). No Strata or shared DB access.
- SQL runner: `psql -X -v ON_ERROR_STOP=1`; concurrency runner: `node --test`. The SQL fixture is a transactional inclusion of `../round8/service_acceptance_release_fixes_body.psql`; it creates/sends/responds/presents/reviews/completes natively and rolls back all rows/grants/capability changes. The concurrency suite commits its fictional `e102` fixture, races two psql backends, removes all fixture FK descendants, and confirms cleanup.

The shared fixture has 86 assertion call sites, of which 76 execute on one run. Its native transitions still run as postgres with JWT claims; E1's authenticated-role retries, membership DELETE, granted/inactive RPC denials, private Storage downloads and C4 race actors supply narrower real-role evidence. No claim that the full imported fixture runs under authenticated RLS.

| ID / clause | Before | Now | Spec / tests | Asserted transition | DB readback | Runs |
|---|---|---|---|---|---|---|
| X02 / owner, admin, member, other studio, removed admin | weak | covered at SQL reader/object layer; whole X02 weak | `e1_authority_matrix.sql` | Active C2/C4/C6 fixture; removed admin loses access; other studio refused `42501`; inactive C4/C6 mutation refuses `55000` and readers report inactive | `SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%'`: 2 owner/member/admin, 0 other studio/removed admin; superuser 3. `get_project_service_acceptance` and `get_studio_service_completion`: studio audience only for active A users. | 32 new assertions + 76 included fixture assertions; exit 0 / 0 |
| X02 / client, linked prior-request signer, unlinked contact, GC, maker, supplier, anon | weak | **defect RC7-E1-1 for C6 breadth; reader denials otherwise covered at SQL layer** | `e1_authority_matrix.sql`, `e1_household_privacy_defect.sql` | Three external authenticated party profiles linked to GC/maker/supplier cards are refused; linked but nonsigner for `r4` has no `r4` entry, but may read client C6 because a prior live request still makes them a signer; unlinked contact has no list; client reads client projection, not studio projection. | `storage.objects` count 0 for every external/client/anon actor; `get_my_service_acceptance_requests()` `[]` for parties; C6 external `42501`; SQL `storage.objects` filter evaluates malformed `fulfillment/rc7-e1.pdf` without `22P02` (00892). | 32 new + 76 included fixture; exit 0 / 0 |
| X02 / paper bytes and acceptance exports | weak | **weak overall; byte ACL and RPC matrix tested** | `e1_storage_bytes.test.mjs`, `e1_mutation_matrix.sql` | Three allowed authenticated local Storage readers (owner, admin, active member) each received byte-identical SHA-256; nine real client/other-studio/guest/removed/unlinked/party/anon readers were refused. All-ten shipped-inactive EXECUTE preflight; nine authenticated/granted body-gate refusals with exact `55000 scope_editions_inactive`; 250 additional actor/RPC outcomes. | Storage denials: HTTP 400 with exact `{statusCode:"404",error:"not_found",message:"Object not found",code:"NoSuchKey"}`; object and e104 auth fixtures cleaned. SQL responses/completions not duplicated; matrix rolls back. No edge-handler download/stamp of HTTP-uploaded bytes or HTTP export. | Authority 108 assertions ×2; matrix 259 outcomes ×2; HTTP 1/1 ×2. |
| X03 / relink→respond and respond→relink; collision; simultaneous required signers | weak | covered for these C4 races; whole X03 weak | `e1_acceptance_concurrency.test.mjs` | Two independent psql backends set real `authenticated` role for card UPDATE and response RPC; loser waits behind winner lock. Relink-first collision refuses; response-first retains its original signer slot and receipt. Two distinct required signers both commit, third closes the request. | Readback: zero collision responses; two distinct signer rows after race; three after final client answer; request `aggregate_outcome='accepted'`. | 1/1 TAP pass twice after correcting stale helper revision; early authoring failure excluded. |
| X03 / concurrent invoice claims | weak | covered for one hour/two invoice drafts; whole X03 weak | `e1_invoice_claim_race.test.mjs` | Two real psql sessions; first claims the priced free hour into draft A and holds its row lock; draft B waits, then returns an empty claimed-id set after A commits. | Hour `invoice_id` points only to A; the three fixture invoices remain drafts. Fixture roots and descendants are removed after each run. | 1/1 TAP pass twice |
| X03 / duplicate grouped PO draft | weak | **covered for overlapping sets; whole X03 weak** | `e1_po_race.test.mjs` | Authenticated drafts race {1,2} versus {2,8}; loser waits on shared item 2, then refuses with exact `P0001` already-linked message. | Both winner items point to its one new PO; independent loser item 8 remains unclaimed; no partial loser PO. | 1/1 TAP pass twice after rework. |
| X03 / concurrent print-set issue | weak | covered for one print/set/key, whole X03 weak | `e1_print_issue_race.test.mjs` | A native `file_plan_prints` filing creates the sheet; two psql sessions call `create_plan_issue` with the same key. The second waits, then replays the first issue after commit. | Same issue ID; one `plan_issues` row and one `plan_issue_prints` snapshot for the project. Fixture user and Storage metadata removed. | 1/1 TAP pass twice |
| X03 / two client choices on a selection decision | weak | covered for same decision/different options; exact edition-linked path unverified | `e1_selection_race.test.mjs` | Two real psql sessions call `apply_client_decision` on one client-court selection with different options. The second waits behind the first, then refuses its stale conflicting choice. | Decision `responded` with the authenticated client as actor; exactly one selected option, the winner. Fixture users/studio and descendants removed. This fixture has no edition ID. | 1/1 TAP pass twice |
| X03 / C6 completion versus contributing condition | weak | covered for these C6 races; whole X03 weak | `../round8/service_completion_concurrency.test.mjs` | Existing native two-session suite exercised completion-first resolution, identical concurrent completions and completion/condition ordering against owned port 58122. | Suite reported `C6 completion is totally ordered with every contributing writer, both orders, no 40P01`; its own fixture cleanup ran after each pass. | 1/1 TAP pass twice |
| X09 / C4/C6 hash, retry, actor | weak | covered for named response/completion/paper cases; whole X09 weak | `e1_authority_matrix.sql`, X09 assertions | Exact `client_request_id` response and completion retries return `replayed=true` with one row. Paper intake goes through record → hash stamp RPC → review. | `service_acceptance_responses`: count 1, responder UID 5, presented scope and 64-character request hash; `studio_service_completions`: count 1, completed_by UID 2, obligation hash and 64-character request hash; `service_acceptance_paper_intakes`: count 2, recorded_by UID 1, scope/request hashes and 64-character SHA-256. | 32 new + 76 included fixture; exit 0 / 0 |
| A20 / scoped acceptance channels | weak | weak | Shared SQL fixture and `e1_authority_matrix.sql` | Native paper presentation/intake/review/three-signer completion in shared fixture run with JWT caller but postgres role. E1 authenticated-role response/completion retries and service-role hash replay pass; no real edge byte stamp or iOS. | Shared fixture 86 static call sites/76 executed per run; E1 adds 32 assertions, total 108/run. | 108/108 twice, SQL exit 0 twice. |

## Post-review commands and counts

Fresh scratch copy: `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc7-e1-rerun`. `df` had 291 GiB available; swap 1,646 MiB free before start. `supabase start --workdir <fresh E1 scratch> -x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta` exited 0. `psql` as **supabase_admin** ran `UPDATE cron.job SET active=false WHERE active` (64 changed, zero left active); `postgres` could not SET ROLE supabase_admin, so the connection used supabase_admin directly. No port swap was necessary: every E1 runner asserted 58122; no harness default reached 54321/54322.

```sh
# Each SQL command ran twice with -X -v ON_ERROR_STOP=1 and the owned 58122 DB URL:
psql "$E1_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/round8_rc7/e1_authority_matrix.sql
# 108 assertions / 108 assertions, exit 0 / 0
psql "$E1_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/round8_rc7/e1_mutation_matrix.sql
# 259 outcomes / 259 outcomes, exit 0 / 0
psql "$E1_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/round8_rc7/e1_activation.sql
# GRANT, UPDATE 1, COMMIT; exit 0
# Every new node --test suite below used ROUND8_DB_URL=$E1_DB_URL and ran twice:
node --test supabase/tests/round8_rc7/e1_storage_bytes.test.mjs
node --test supabase/tests/round8_rc7/e1_acceptance_concurrency.test.mjs
node --test supabase/tests/round8_rc7/e1_invoice_claim_race.test.mjs
node --test supabase/tests/round8_rc7/e1_po_race.test.mjs
node --test supabase/tests/round8_rc7/e1_selection_race.test.mjs
node --test supabase/tests/round8_rc7/e1_print_issue_race.test.mjs
node --test supabase/tests/round8/service_completion_concurrency.test.mjs
# Each: 1/1 pass twice, 0 fail (after corrected early test-authoring failures)
psql "$E1_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/round8_rc7/e1_restore.sql
# REVOKE, UPDATE 1, COMMIT; exit 0
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 --filter @patina/designer-portal type-check
# exit 0
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 --filter @patina/designer-portal lint
# exit 0; 0 errors, 250 warnings
```

Storage uses `E1_STACK_WORKDIR=<fresh E1 scratch>`; C4/C6 races use `SERVICE_ACCEPTANCE_DB_WINDOW=owned`/`SERVICE_COMPLETION_DB_WINDOW=owned`; other races use `E1_DB_WINDOW=owned`. Early SQL first-run failure was `pg_temp.ed` reading `project_scope_editions` as authenticated; moved edition lookup to postgres-populated temp args. Early Storage status assumption 404 was corrected to observed HTTP 400 with 404 not-found JSON. Early C4 helper response under authenticated lacked direct SELECT on the request table; it now invokes the native RPC with request inputs read before switching role. All corrected versions ran twice. Post-restore DB readback: capability `false`, cron active `0`, auth fixture IDs with `e1%` prefix `0`.

### Earlier pre-review command record

The commands below are historical only; they do not verify the tested tip.

```sh
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 install --frozen-lockfile --offline
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 exec turbo run build --filter=@patina/designer-portal^... --filter=@patina/client-portal^...
# 8 successful, 8 total (8 cached)
SERVICE_ACCEPTANCE_DB_WINDOW=owned ROUND8_DB_URL='postgresql://postgres:postgres@127.0.0.1:58122/postgres' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_acceptance_concurrency.test.mjs
# run 1: 1 pass, 0 fail; run 2: 1 pass, 0 fail
E1_DB_WINDOW=owned ROUND8_DB_URL='postgresql://postgres:postgres@127.0.0.1:58122/postgres' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_invoice_claim_race.test.mjs
# final runs 1 and 2: 1 pass, 0 fail each (two earlier fixture-authoring attempts failed and were corrected)
E1_DB_WINDOW=owned ROUND8_DB_URL='postgresql://postgres:postgres@127.0.0.1:58122/postgres' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_po_race.test.mjs
# run 1: 1 pass, 0 fail; run 2: 1 pass, 0 fail
E1_DB_WINDOW=owned ROUND8_DB_URL='postgresql://postgres:postgres@127.0.0.1:58122/postgres' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_print_issue_race.test.mjs
# run 1: 1 pass, 0 fail; run 2: 1 pass, 0 fail
E1_DB_WINDOW=owned ROUND8_DB_URL='postgresql://postgres:postgres@127.0.0.1:58122/postgres' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_selection_race.test.mjs
# run 1: 1 pass, 0 fail; run 2: 1 pass, 0 fail
SERVICE_COMPLETION_DB_WINDOW=owned ROUND8_DB_URL='postgresql://postgres:postgres@127.0.0.1:58122/postgres' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8/service_completion_concurrency.test.mjs
# run 1: 1 pass, 0 fail; run 2: 1 pass, 0 fail
psql 'postgresql://postgres:postgres@127.0.0.1:58122/postgres' -X -v ON_ERROR_STOP=1 -f /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_authority_matrix.sql
# run 1: 108 total assertions (32 new + 76 included fixture), exit 0
# run 2: 108 total assertions (32 new + 76 included fixture), exit 0
psql 'postgresql://postgres:postgres@127.0.0.1:58122/postgres' -X -v ON_ERROR_STOP=1 -f /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_mutation_matrix.sql
# runs 1 and 2: 250 actor/RPC outcomes matched, 76 included fixture assertions, exit 0 each
E1_STACK_WORKDIR='/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc7-e1-lvyxryqx' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_storage_bytes.test.mjs
# runs 1 and 2: 1 passed, 0 failed each
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 --filter @patina/designer-portal type-check
# exit 0, tsc --noEmit
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 --filter @patina/designer-portal lint
# exit 0, 250 problems (0 errors, 250 warnings)
```

The SQL gate ran with C2/C4/C6 inactive on the owned stack: preflight verified the mutation ACLs closed, the included fixture enabled C2 in a transaction, and after active checks the suite disabled it and verified `55000` refusals. For the two C4 concurrency runs, C2/C4/C6 were activated with the exact RPC grants on the owned stack only; both runs removed their fixture rows. The activation grants and capability were then restored to inactive before both final SQL runs. Direct post-run readback after the additional invoice, PO, selection and print races: capability `f`, fixture user/org/vendor/object counts `0/0/0/0`. The designer-portal type-check and lint gates were rerun after the new suites: exit 0 and exit 0 (0 errors, 250 warnings), respectively.

## Defects and privacy ruling

**RC7-E1-1 — C6 cross-request household projection; severity high, confidence high, privacy ruling needed.** Repro: authenticated profile 8 is linked to a signer card on a prior sent project request, is **not** a signer on contributing `r4`, gets `get_my_service_acceptance_requests(r4)` count 0, yet `get_studio_service_completion(project).audience='client'`. Root: `supabase/migrations/00895_round8_service_completion_household_reader.sql:39-47` authorizes any current signer on any sent project request, not the completion's contributing request. Proposed fix if this audience was not intended: bind signer access to the completion's acceptance_request_id and retain client-id access; obtain explicit audience ruling first. The excluded `e1_household_privacy_defect.sql` asks for `42501 insufficient_privilege` and **intentionally exits 3** with `ASSERTION FAILED ... [<none>]` on the present schema; it is not part of the passing gate. No migration or product code changed in E1.

The old E1 test-coverage gaps (superuser/JWT conflation in added retries, nonexistent HTTP users, circular inactive REVOKE check) were corrected and rerun twice. The shared fixture's original native mutations still run as postgres and cannot be claimed as authenticated-role proof. Print issue proves only same-key replay, not distinct-key issue numbering or same-key/different-payload conflict.

## Not verified

All post-review E1 suites listed above passed twice, but this does not establish full X02/X03/X09/A20 coverage. The matrix has only two successful active mutation cells; additional actor/RPC positive paths, cross-key X09 hash conflicts and invalidation remain weak. The Storage API test verifies bytes and nine real denials but does **not** attach those bytes to an intake or run the `service-acceptance-paper-hash` handler; the earlier edge probe of an absent intake returned `403 {"code":"forbidden"}` only. HTTP evidence exports, edition-linked selection, different-key print issue numbering, browser recovery, iOS and production behavior are not verified. RC7-E1-1 requires an audience ruling before X02 can be called covered.

## Teardown

`supabase stop --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc7-e1-rerun --no-backup` exited 0: `Stopped supabase local development setup`, `backup:false`. `lsof` reported FREE on 58120/58121/58122/58123/58124/58127/58129/58183; `docker ps` had no `patina-rc7-e1` container. No dev server was started.
