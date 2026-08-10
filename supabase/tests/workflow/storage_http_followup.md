# Workflow Storage HTTP contract follow-up

The SQL contracts inspect bucket metadata and the `storage.objects` policy
catalog, but plain `psql` cannot prove the Storage API's HTTP behavior or the
bytes returned by a signed URL. Add the executable follow-up as
`supabase/tests/workflow/storage_privacy_contract_test.ts` when an isolated
Supabase stack can be reset and its Storage endpoint is available.

## Harness contract

Use Deno's built-in test runner and `@supabase/supabase-js`. The harness must
receive an isolated stack's `SUPABASE_URL`, anon key, service-role key, and a
direct fixture connection. It must create unique object keys under one
transaction-scoped fixture project, but Storage objects themselves must be
deleted in `finally` because Storage HTTP writes are not part of the SQL
transaction. Never point this test at staging or production.

Mint real JWT sessions for these actors rather than substituting API keys:

- Studio A owner and Studio A co-member
- Studio B designer
- unrelated authenticated user
- primary project client
- opted-in project party
- active project-team member
- unauthenticated caller
- `service_role`

Use content-addressed fixture bytes, for example `working-v1`, `working-v2`,
and `released-v1`, and compute SHA-256 locally before upload. Never assert only
on a URL string; download and compare the response bytes and digest.

## Required HTTP cases

| ID | Request | Required result |
|---|---|---|
| H01 / T02 | Unauthenticated `GET /storage/v1/object/public/proposal-mood-boards/{working-key}` | `403` or `404`; no bytes returned. |
| H02 / T02 | Unrelated, Studio B, client, party, and project-team JWTs call `createSignedUrl` or authenticated object download for the leaked working key | Each is denied with `403`/`404`; no signed URL is minted. |
| H03 | Studio A owner and authorized co-member upload and replace a working object | Allowed only while the object remains in the working namespace. A subsequent authorized download returns `working-v2`. |
| H04 | Release RPC copies `working-v2` to a versioned/content-addressed release key | Response records the immutable key and SHA-256; released download bytes equal `working-v2`. |
| H05 | Authorized edition reader obtains a signed URL for the released key | URL succeeds before expiry, is scoped to that exact key, and fails after expiry. Raw working paths are absent from the edition payload. |
| H06 / T14 | Studio A, authenticated users, and `service_role` attempt `update`, `upload({upsert:true})`, `move`, and `remove` on the released key | Every mutation is rejected. Downloaded bytes and SHA-256 remain `released-v1`. |
| H07 | Studio A overwrites the original working alias after release | Working bytes change; previously released bytes, digest, edition payload, and share payload remain byte-identical. |
| H08 | Revoke the edition/share, then reuse its previously minted URL and request a new URL | New URL is denied immediately. If revocation requires immediate byte denial, the old URL is denied too; otherwise document and assert the bounded expiry window. |
| H09 | Guess another edition's release key with an authorized JWT for the wrong project | `403`/`404`; object existence is not disclosed. |

`service_role` is intentionally included in H06. RLS bypass is not authority to
rewrite executed truth; an immutable released prefix needs a table-edge/Storage
hook or a service architecture that never hands generic object mutation to the
role.

## Failure reporting and cleanup

Give every assertion the Hxx/Txx identifier and report status, response body,
object key, and observed digest without logging bearer tokens or signed query
strings. Run cases independently so one expected red failure does not skip the
rest. Cleanup may remove only the unique working fixture prefix; released-key
cleanup must use the isolated-stack teardown path rather than the mutation API
whose denial H06 proves.
