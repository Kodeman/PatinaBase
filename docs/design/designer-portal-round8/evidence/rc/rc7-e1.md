# RC-7 E1 — DB authority, privacy and races

- Tested tip: `3cf79663c05d861863e636fee9f78db7567feded` (pre-evidence commits); 2026-10-29.
- Isolated local project: `patina-rc7-e1`; API `58121`, DB `58122`, shadow `58120`, pooler `58129`. Applied migration `00899` (plus the pre-existing timestamp-named contact migration). No Strata or shared DB access.
- SQL runner: `psql -X -v ON_ERROR_STOP=1`; concurrency runner: `node --test`. The SQL fixture is a transactional inclusion of `../round8/service_acceptance_release_fixes_body.psql`; it creates/sends/responds/presents/reviews/completes natively and rolls back all rows/grants/capability changes. The concurrency suite commits its fictional `e102` fixture, races two psql backends, removes all fixture FK descendants, and confirms cleanup.

| ID / clause | Before | Now | Spec / tests | Asserted transition | DB readback | Runs |
|---|---|---|---|---|---|---|
| X02 / owner, admin, member, other studio, removed admin | weak | covered at SQL reader/object layer; whole X02 weak | `e1_authority_matrix.sql`, X02 assertions | Active C2/C4/C6 fixture; removed admin loses access; other studio refused `42501`; inactive C4/C6 mutation refuses `55000` and readers report inactive | `SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%'`: 2 owner/member/admin, 0 other studio/removed admin; superuser 3. `get_project_service_acceptance` and `get_studio_service_completion`: studio audience only for active A users. | 32 new assertions + 76 included fixture assertions; exit 0 / 0 |
| X02 / client, linked prior-request signer, unlinked contact, GC, maker, supplier, anon | weak | covered at SQL reader/object layer; whole X02 weak | `e1_authority_matrix.sql`, X02 assertions | Three external authenticated party profiles linked to GC/maker/supplier cards are refused; linked but nonsigner for `r4` has no `r4` entry, but may read client C6 because a prior live request still makes them a signer; unlinked contact has no list; client reads client projection, not studio projection. | `storage.objects` count 0 for every external/client/anon actor; `get_my_service_acceptance_requests()` `[]` for parties; C6 external `42501`; SQL `storage.objects` filter evaluates malformed `fulfillment/rc7-e1.pdf` without `22P02` (00892). | 32 new + 76 included fixture; exit 0 / 0 |
| X02 / paper bytes and acceptance exports | weak | weak | `e1_authority_matrix.sql`, `e1_storage_bytes.test.mjs`, `e1_mutation_matrix.sql` | Storage API POST as seeded studio owner, authenticated GET as owner/admin and nine other JWT/anon probes; two permitted downloads returned byte-identical SHA-256, seven denied 4xx. Separately, the SQL matrix calls ten C4/C6 mutation RPCs as 11 authenticated actor IDs and anon in active/inactive modes, plus a removed admin; it asserts 250 exact actor-specific SQLSTATE/result outcomes. Service-role paper-hash RPC replay returns its recorded digest. | The HTTP-uploaded object is deleted in `finally`; SQL matrix rolls back every successful probe and confirms no duplicate request/completion/response row. Actual edge-handler download/stamp for these uploaded bytes is not covered. | SQL matrix: 250 outcomes / 250, exit 0 twice; Storage API: 1/1 pass twice |
| X03 / relink→respond and respond→relink; collision; simultaneous required signers | weak | covered for these C4 races; whole X03 weak | `e1_acceptance_concurrency.test.mjs`, `E1 C4 relink in both orders, collision, and simultaneous required signers` | Two real psql sessions; loser waits behind winner lock. Relink-first collision refuses, with no response; response-first preserves original slot and retry receipt; collision blocks a second slot. Two distinct required signers queue on the same request, both commit once, third signer closes it. | `service_acceptance_responses` distinct signer count: 0 after refused collision; 2 after competing signers; 3 after final client response. `service_acceptance_requests.aggregate_outcome='accepted'`; referenced primary `outbound_drafts.status='sent'`. | 1/1 TAP pass; 1/1 TAP pass |
| X09 / C4/C6 hash, retry, actor | weak | covered for named response/completion/paper cases; whole X09 weak | `e1_authority_matrix.sql`, X09 assertions | Exact `client_request_id` response and completion retries return `replayed=true` with one row. Paper intake goes through record → hash stamp RPC → review. | `service_acceptance_responses`: count 1, responder UID 5, presented scope and 64-character request hash; `studio_service_completions`: count 1, completed_by UID 2, obligation hash and 64-character request hash; `service_acceptance_paper_intakes`: count 2, recorded_by UID 1, scope/request hashes and 64-character SHA-256. | 32 new + 76 included fixture; exit 0 / 0 |
| A20 / scoped acceptance channels | weak | weak | SQL fixture inclusion and `e1_authority_matrix.sql` | Native paper presentation, two paper intakes, stamp RPC, reviews, three-signer household completion; no real upload bytes or iOS. | Paper response count 2, reviewed acceptance and no delivered paper notices asserted by the included fixture (76 assertions per run). | 32 new / 32 new + 76 included fixture / 76 included fixture; twice |

## Commands and counts

```sh
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 install --frozen-lockfile --offline
pnpm --dir /Users/kody/Code/patina-r8-rc7-e1 exec turbo run build --filter=@patina/designer-portal^... --filter=@patina/client-portal^...
# 8 successful, 8 total (8 cached)
SERVICE_ACCEPTANCE_DB_WINDOW=owned ROUND8_DB_URL='postgresql://postgres:postgres@127.0.0.1:58122/postgres' node --test /Users/kody/Code/patina-r8-rc7-e1/supabase/tests/round8_rc7/e1_acceptance_concurrency.test.mjs
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

The SQL gate ran with C2/C4/C6 inactive on the owned stack: preflight verified the mutation ACLs closed, the included fixture enabled C2 in a transaction, and after active checks the suite disabled it and verified `55000` refusals. For the two concurrency runs, C2/C4/C6 were activated with the exact RPC grants on the owned stack only; both runs removed their fixture rows. The activation grants and capability were then restored to inactive before both final SQL runs. Direct post-run readback: migrations `00896`–`00899` present, capability `f`, fixture user count `0`.

## Defects

None observed in the product. Early non-gating attempts corrected test assumptions about a prior-request household signer, multi-notice drafts, the completion replay's original obligation hash, and required contact fields; no product migration was edited. The imported `owned_psql.mjs` has a default `54322` URL; E1 asserts its URL is exactly `127.0.0.1:58122` before starting a child process. `grep -nE '5432[12]|dblink'` found no match in the included SQL body or E1 suites, and no dblink was used.

## Not verified

The ten named C4/C6 mutation RPCs have an actor × active/inactive SQLSTATE matrix. The real Storage API byte test uses seeded owner/admin and seven refused JWT/anon readers; it does **not** create linked household signer, member, guest or removed-member identities for HTTP, and does not bind the uploaded bytes to an intake. Actual edge-handler byte download/stamp and client evidence export HTTP API remain unverified. Full X03 remains weak: concurrent invoice claims, grouped PO drafts, selection decisions, print issues and C6 races were not rerun here (RC-6 recorded other focused suites, but they do not close this assigned matrix). Full X09 mutation-family audit/invalidation and cross-key hash conflicts remain weak. No browser, native or production execution. No product defect is inferred from these gaps.

## Teardown

`supabase stop --workdir <E1 scratch> --no-backup` reported `Stopped supabase local development setup` for `patina-rc7-e1`, backup false. `lsof` showed no listeners on 58120/58121/58122/58129/58123/58124/58127/58183; `docker ps` showed no `patina-rc7-e1` container. No dev server was started.
