# 00555 — probes

Read-only verification for `00555_ios_round_one_security.sql`. Nothing here mutates.
Every probe states the **before** (what Strata answers today, measured 2026-09-01) and the
**after** (what it must answer once the migration is applied).

> ## ⚠ The migration and its test no longer live in this folder
>
> This folder held **drafts**. They were superseded on 2026-09-02 and deleted, because they had
> diverged from the real files by 207 and 131 diff lines respectively and still carried three
> hazards the tree copies fixed: no `handle_new_user` body (the draft told the applier to "copy it
> from the live definition at apply time"), an inline recursive `WITH CHECK` that raises
> `42P17 infinite recursion detected in policy for relation "profiles"` on the owner's first
> display-name write, and a vacuous `LIKE '%homeowner%'` assertion that passes against the
> *unfixed* function.
>
> **The only copies are:**
>
> | | |
> |---|---|
> | migration | `supabase/migrations/00555_ios_round_one_security.sql` |
> | test | `supabase/tests/rls/00555_ios_round_one_security.test.sql` |
> | sibling migration | `supabase/migrations/00557_increment_scan_upload_attempt.sql` (renumbered from 00556 — see below) |
> | sibling test | `supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql` |
>
> `PROGRAM.md` §3 L0.2 still points readers at `build/migrations-draft/`. It means these files.
>
> **The apply sequence is not here either.** It is
> `artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/KODY-RUNBOOK.md`, which opens with the
> Step 0 deploy gate (**D8**) and the Step 0b ruling gate, and ends with the rollback. This file is
> only the probe half of that runbook's Step 5.

The repo's tests are plain psql scripts with `DO`/`ASSERT`, not pgTAP, and the local gate is the
**whole suite** via `scripts/run-sql-tests.sh`, not the one file.

---

## Exit-criteria cross-reference

`PROGRAM.md` §3 L0.2's exit criteria say *"Probes 1-5 and 9b/9d/9f return the after values"*. Those
names are **not** this file's section numbers — read the map, not the digits.

| PROGRAM.md exit criterion | Section in this file | What it asserts |
|---|---|---|
| Probe 1 | **§1** | anon can no longer read `profiles` |
| Probe 2 | **§2** | anon can no longer read *or write* `notification_preferences` |
| Probe 3 (3a/3b/3c) | **§3** | `vendors` — public face kept, trade file and `*` gone |
| Probe 4 | **§5** | the iOS product read (the `vendors!products_vendor_id_fkey` embed) still works as a guest |
| Probe 5 | **§11** | the designer portal's own HTTP route, a **different principal** — `app.patina.cloud/api/catalog/vendors` must not answer 200 with trade columns |
| **9b** — the `FOR ALL` / `TO PUBLIC` / `auth.uid() IS NULL` policy sweep | **§9b** | 0 rows |
| **9d** — the `vendors` column allowlist | **§9d** | the 24 public-face columns, and only those |
| **9f** — the UPDATE `WITH CHECK` | **§9f** | `"Users can update own profile"` has a non-null `with_check` naming `role` |

The three RPC/behaviour probes keep their own headings and are **not** part of the exit criteria:
§9 (`search_shareable_designers`), §9a (`list_vendor_profiles`), §9c (a live role-elevation attempt).

---

## 0 · Setup

```bash
export PROJECT_REF=bkvcixdmuyejfzcijpdg
export SB_URL="https://${PROJECT_REF}.supabase.co"

# The Strata anon key — the same one compiled into the iOS binary. It is a
# committed literal, not a secret: apps/client-portal/wrangler.jsonc
# ("NEXT_PUBLIC_SUPABASE_ANON_KEY"). Read it, do not retype it.
export ANON_KEY="$(python3 -c "
import json,re,pathlib
raw = pathlib.Path('apps/client-portal/wrangler.jsonc').read_text()
raw = re.sub(r'^\s*//.*$', '', raw, flags=re.M)
print(json.loads(raw)['vars']['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
")"
echo "ANON_KEY length: ${#ANON_KEY}"        # non-zero, and starts eyJ
```

Run that from the repo root. If the length prints `0`, you are in the wrong directory — fix that
rather than pasting a key in by hand.

### `STRATA_DB_URL` (needed only for the apply step and the SQL probes)

Not committed anywhere — env files are gitignored. Get it from the linked project and keep it
out of the shell history and out of any file you write:

```bash
# The CLI is linked (supabase/.temp/project-ref = bkvcixdmuyejfzcijpdg).
# Read the pooler URI from the dashboard: Project Settings → Database → Connection string
# → "Session pooler". Then, in a shell started with a leading space so it is not
# written to history:
 read -rs STRATA_DB_URL && export STRATA_DB_URL

# Never `echo "$STRATA_DB_URL"`, never paste it into a report, and never pass it on a
# command line that a hook or transcript will capture. psql reads it from the env.
```

For a **local** stack the equivalent is fixed and harmless:
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` (port confirmed in
`supabase/config.toml [db]`). `supabase status` prints it.

### `USER_JWT` — minting one

The authenticated probes need a real access token. Two recipes; use the local one wherever
the probe does not have to run against prod.

```bash
# (a) LOCAL — password grant against a seeded account. Fastest, repeatable.
#     Any seeded local user works; the seeds live in supabase/seed/.
export LOCAL_URL='http://127.0.0.1:54321'
export LOCAL_ANON='<anon key from `supabase status`>'
USER_JWT=$(curl -sS -X POST "$LOCAL_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $LOCAL_ANON" -H 'Content-Type: application/json' \
  -d '{"email":"<seeded email>","password":"<seeded password>"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
export USER_JWT
```

```bash
# (b) PROD — there is no password to grant. mailer_autoconfirm is false and the app
#     signs in with an emailed OTP (A3 §Auth), so this is a two-step with a mailbox:
curl -sS -X POST "$SB_URL/auth/v1/otp" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"tester@patina.cloud","create_user":false}'
# …read the 6-digit code from the mailbox, then:
USER_JWT=$(curl -sS -X POST "$SB_URL/auth/v1/verify" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"type":"email","email":"tester@patina.cloud","token":"<code>"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
export USER_JWT
```

> The `000000` test code does **not** work here. `test-account-login` mints a GoTrue
> `hashed_token` that a *caller* must redeem, and only the designer portal does that
> (`apps/designer-portal/src/app/auth/test-account-fallback.ts`). Straight `verify` against
> GoTrue has no such OTP on file — A3 §Auth.

> **`pipefail` trap.** Do not write probes as `curl ... | grep -q ...`. `grep -q` exits on
> first match and SIGPIPEs curl, and under `set -o pipefail` the whole pipeline reports
> failure on a *passing* probe (recorded in `feedback_pipefail_grep_probe_trap`). Capture to a
> variable and use a `case` glob, or `grep -c` on a saved file.

---

## 1 · The headline regression — anon can no longer read profiles

```bash
curl -sS -o /tmp/p1.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/profiles?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H 'Prefer: count=exact'
cat /tmp/p1.json
```

| | expected |
|---|---|
| before | `200`, a JSON array of **24 objects** carrying `email`, `stripe_customer_id`, `phone`, `city`/`state`/`zip` |
| after | **`401`** with body `{"code":"42501","message":"permission denied for table profiles"}` — the table grant is gone, so PostgREST fails before RLS is consulted |

A `200 []` would also be a pass on RLS grounds but a **fail** on this migration: it would mean
the `REVOKE ALL PRIVILEGES ... FROM anon` did not take.

Narrow-column variant (proves it is not just a `select=*` problem):

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$SB_URL/rest/v1/profiles?select=id,display_name" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# after: 401
```

## 2 · anon can no longer read *or write* notification_preferences

```bash
curl -sS -o /tmp/p2.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/notification_preferences?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
cat /tmp/p2.json
```

| | expected |
|---|---|
| before | `200`, 1 object |
| after | **`401`**, `42501` |

The write side is the more serious half (anon held INSERT/UPDATE/DELETE plus a
`FOR ALL USING (auth.uid() IS NULL)` policy). **Do not exercise the write against prod.**
Prove it from the catalog instead:

```sql
-- SELECT-only, safe on prod
SELECT has_table_privilege('anon','public.notification_preferences','SELECT') AS sel,
       has_table_privilege('anon','public.notification_preferences','INSERT') AS ins,
       has_table_privilege('anon','public.notification_preferences','UPDATE') AS upd,
       has_table_privilege('anon','public.notification_preferences','DELETE') AS del,
       has_table_privilege('anon','public.notification_preferences','MAINTAIN') AS mnt;
-- before: t t t t t      after: f f f f f

SELECT polname FROM pg_policy
WHERE polrelid = 'public.notification_preferences'::regclass
  AND pg_get_expr(polqual, polrelid) = '(auth.uid() IS NULL)';
-- before: "Service role full access to notification preferences"
-- after:  0 rows
```

The three writes are exercised for real, as `anon`, against a **local** stack by section 4 of
`00555_ios_round_one_security.test.sql`.

## 3 · vendors — public face kept, trade file gone

```bash
# 3a — the maker's public face still reads
curl -sS -o /tmp/p3a.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/vendors?select=id,name,made_in,brand_story" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# before 200 (4 rows) · after 200 (4 rows) — unchanged

# 3b — the trade file does not
curl -sS -o /tmp/p3b.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/vendors?select=id,name,notes,trade_terms" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# before 200, notes = "trade is good so are the tunes", trade_terms = "terms are fine"
# after  401 / 42501 (permission denied for column notes)

# 3c — the wildcard, which is how a scraper would ask
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$SB_URL/rest/v1/vendors?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# before 200 · after 401
```

## 4 · The SECURITY DEFINER views (the second door onto the same emails)

`user_engagement_scores` is `security_invoker = false`, so it reads `profiles` as the view
owner and the policy work in §1 does not touch it. Its ACL is `anon=arwdDxtm/postgres`.

```bash
# 4a — the blocker
curl -sS -o /tmp/p4a.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/user_engagement_scores?select=*&limit=3" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
cat /tmp/p4a.json
```

| | expected |
|---|---|
| before | `200`, rows of `id, email, role, current_score, last_active_at, engagement_tier` — the same production emails §1 removes |
| after | **`401`**, `42501` |

```bash
# 4b — the three funnels (no PII, but internal conversion metrics)
for v in consumer_funnel designer_funnel conversion_funnel; do
  code=$(curl -sS -o "/tmp/p4_$v.json" -w '%{http_code}' \
    "$SB_URL/rest/v1/$v?select=*&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
  printf '%-20s %s %s\n' "$v" "$code" "$(head -c 60 /tmp/p4_$v.json)"
done
# before: 200 with rows · after: 401 each
```

```bash
# 4c — and they are closed to signed-in users too (admin analytics is service-role)
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$SB_URL/rest/v1/user_engagement_scores?select=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
# after: 401
```

> The other 17 `security_definer_view` advisor ERRORs are **not** addressed by this migration.
> `open_design_requests` was checked and carries no PII (project_type, budget_range, city/state,
> description) so it is deliberately left readable; the rest need a per-view read in a follow-up.

## 5 · The iOS product read still works as a guest

This is the regression that would be most expensive to miss — it is the app's only product
path, and a column grant that omits `vendors.id` breaks the lateral join even though the app
never names that column.

```bash
# Byte-for-byte the app's ProductAPIClient.productSelect
# (apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:122)
curl -sS -o /tmp/p5.json -w '%{http_code}\n' \
  --get "$SB_URL/rest/v1/products" \
  --data-urlencode 'select=*,vendors!products_vendor_id_fkey(name,made_in,brand_story)' \
  --data-urlencode 'limit=5' \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
python3 -c "import json;d=json.load(open('/tmp/p5.json'));print(len(d), [r.get('vendors') for r in d])"
```

**after: `200`**, same row count as before, and the `vendors` key present (its value may be
`null` where `products.vendor_id` is null — today only one catalog row exists and its
`vendor_id` IS null, so re-run this against a row that has a vendor before trusting it).

## 6 · profile_cards is CUT — assert it does not exist

`profile_cards` was removed from 00555 in the 2026-09-01 critique pass: no caller in the First
Flight program reads it (`ScanSharingService` moves to `search_shareable_designers`; the
designer-portal vendor picker moves to `list_vendor_profiles`; no iOS finding cites it), and a
new public relation with no reader is dead weight that also reads as though the counterparty
paths are covered when the migration's own READERS block lists nine silent degradations that
are not. It returns with its first consumer.

This probe therefore inverts: the relation must be **absent**. A 200 here means a stale draft
was applied.

```bash
# 6a — the view must not exist
curl -sS -o /dev/null -w '%{http_code}\n' \
  "$SB_URL/rest/v1/profile_cards?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
# after: 404 (PGRST205, "Could not find the table") — NOT 200, NOT 401
```

```sql
-- 6b — and in the catalog
SELECT to_regclass('public.profile_cards');   -- want: NULL
```

Case 7 of `00555_ios_round_one_security.test.sql` asserts the same thing locally, alongside the
role self-elevation cases that replaced this section's original content.

## 7 · Authenticated own-row access survives

```bash
# 7a — my own row, full columns (the app's ProfileService does a bare select())
MY_ID=$(python3 -c "import base64,json,os;t=os.environ['USER_JWT'].split('.')[1];t+='='*(-len(t)%4);print(json.loads(base64.urlsafe_b64decode(t))['sub'])")
curl -sS -o /tmp/p7.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/profiles?select=*&id=eq.$MY_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
python3 -c "import json;print(len(json.load(open('/tmp/p7.json'))))"
# after: 200, exactly 1
```

```bash
# 7b — the whole table, as a signed-in user
curl -sS -o /tmp/p7b.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/profiles?select=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT" \
  -H 'Prefer: count=exact'
python3 -c "import json;d=json.load(open('/tmp/p7b.json'));print(len(d));[print(r['id']) for r in d]"
```

| | expected |
|---|---|
| before | `200`, **24** ids — every signed-in user could read every profile |
| after (as `tester@patina.cloud`) | `200`, **exactly 3** |

The three, and why each is admitted — `tester` has 0 rooms, 0 projects and 0 designer links
(A3 §Auth), so the org leg is doing all of the work:

| id | who | leg |
|---|---|---|
| `86cdd0aa-403c-4154-ae63-69105425e506` | `tester@patina.cloud` (self) | `profiles_select_self` |
| `74056c2a-866d-42b0-9e2a-d473c2484316` | `kody@kochaver.com` — org `bb1d4d5a-67bb-4446-8e75-709e34dc0a4c`, **active/owner** | `is_studio_comember` |
| `4c106571-94e2-494f-8cb8-6882bdc80d7e` | `kody.kochaver+newdesinger@gmail.com` — same org, **invited/member** | the `status IN ('active','invited')` org leg |

A result of **1** means the org leg is not firing and `useOrganizationMembers` will render
nameless teammates. A result of **2** means the `'invited'` half specifically is missing.
A result of 24 means the migration did not apply.

```bash
# 7c — my own notification preferences
curl -sS -o /tmp/p7c.json -w '%{http_code}\n' \
  "$SB_URL/rest/v1/notification_preferences?select=*&user_id=eq.$MY_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
# after: 200 (0 or 1 rows — the row is created lazily; a 401/42501 here is a FAIL)
```

## 8 · A counterparty is still visible (the embed that everything hangs off)

Run as a designer who has at least one rostered client.

```bash
curl -sS -o /tmp/p8.json -w '%{http_code}\n' \
  --get "$SB_URL/rest/v1/projects" \
  --data-urlencode 'select=id,client:profiles!projects_client_id_fkey(id,full_name,email)' \
  --data-urlencode 'limit=3' \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
python3 -c "import json;d=json.load(open('/tmp/p8.json'));print([r.get('client') for r in d])"
```

**after: `200`, and every `client` object non-null.** A `null` here is the failure mode this
migration is most likely to produce — it means `can_view_profile` missed a relationship — and
it is silent: PostgREST returns 200 with a null embed, not an error. The known-degraded
readers are listed in the migration's READERS block §3; anything *else* returning null is a bug.

## 9 · search_shareable_designers (the replacement for the iOS designer search)

```bash
# 9-i — a signed-in user finds a designer they have no relationship with
curl -sS -o /tmp/p9_i.json -w '%{http_code}\n' \
  -X POST "$SB_URL/rest/v1/rpc/search_shareable_designers" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT" \
  -H 'Content-Type: application/json' -d '{"p_query":"kody"}'
cat /tmp/p9_i.json
# after: 200, rows of {id, display_name, business_name, avatar_url} — and NO email key
python3 -c "import json;d=json.load(open('/tmp/p9_i.json'));print('email leaked' if any('email' in r for r in d) else 'no email', len(d))"

# 9-ii — the two-character floor stops directory enumeration
curl -sS -o /tmp/p9_ii.json -w '%{http_code}\n' \
  -X POST "$SB_URL/rest/v1/rpc/search_shareable_designers" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT" \
  -H 'Content-Type: application/json' -d '{"p_query":""}'
# after: 200 []

# 9-iii — and a WILDCARD does not defeat the floor. '%a' is two characters, and
#         before the 2026-09-02 escaping fix it matched every name containing
#         'a' — exactly what the floor exists to prevent.
curl -sS -o /tmp/p9_iii.json -w '%{http_code}\n' \
  -X POST "$SB_URL/rest/v1/rpc/search_shareable_designers" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT" \
  -H 'Content-Type: application/json' -d '{"p_query":"%a"}'
python3 -c "import json;print(len(json.load(open('/tmp/p9_iii.json'))))"
# after: 200, 0 rows

# 9-iv — closed to the anon key
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST "$SB_URL/rest/v1/rpc/search_shareable_designers" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H 'Content-Type: application/json' -d '{"p_query":"kody"}'
# after: 401 / 42501
```

## 9a · list_vendor_profiles (the replacement for the designer-portal vendor picker)

```bash
# 9a-i — a signed-in caller gets the vendor directory, no PII
curl -sS -o /tmp/p9a_i.json -w '%{http_code}\n' \
  -X POST "$SB_URL/rest/v1/rpc/list_vendor_profiles" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT" \
  -H 'Content-Type: application/json' -d '{}'
python3 -c "import json;d=json.load(open('/tmp/p9a_i.json'));print(len(d), sorted(d[0].keys()) if d else 'EMPTY')"
# after: 200, keys exactly ['avatar_url', 'full_name', 'id'] — no email, no phone

# 9a-ii — closed to the anon key
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST "$SB_URL/rest/v1/rpc/list_vendor_profiles" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H 'Content-Type: application/json' -d '{}'
# after: 401 / 42501
```

## 9b · EXIT CRITERION — nothing `FOR ALL` + `TO PUBLIC` + `auth.uid() IS NULL` survives

This is the sweep `PROGRAM.md` §3 L0.2 calls **probe 9b**. Read-only, `$STRATA_DB_URL`.

```sql
SELECT n.nspname, c.relname, p.polname
FROM pg_policy p
JOIN pg_class c     ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE p.polcmd = '*' AND p.polroles = '{0}'
  AND pg_get_expr(p.polqual, p.polrelid) = '(auth.uid() IS NULL)';
```

| | expected |
|---|---|
| before | 8 rows (the seven marketing-rail policies plus `notification_preferences`) |
| **after** | **0 rows** |

That shape grants the table to the unauthenticated key and nothing to `service_role`, which is
`BYPASSRLS` and never needed it. A surviving row means a `DROP POLICY IF EXISTS` in §d did not
match the policy's real name — read the name off `pg_policy`, do not guess it.

## 9d · EXIT CRITERION — the `vendors` column allowlist

This is **probe 9d**. Read-only, `$STRATA_DB_URL`.

```sql
SELECT column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'vendors'
  AND grantee = 'anon' AND privilege_type = 'SELECT'
ORDER BY column_name;
```

| | expected |
|---|---|
| before | all 37 columns |
| **after** | the **24** public-face columns only |

None of these may appear: `notes`, `trade_terms`, `contact_info`, `preferred_contact`,
`orders_email`, `trade_account_email`, `trade_portal_url`, `trade_account_established_at`,
`default_payment_terms`, `nomination_status`, `nominated_by`, `nominated_at`,
`contact_profile_id`. `id` **must** appear — a column allowlist that forgot `id` would still pass
an ACL-shape check while breaking every products embed (probe 4).

## 9f · EXIT CRITERION — role self-elevation is closed (the UPDATE `WITH CHECK`)

00013 shipped `"Users can update own profile"` as `USING`-only with no column restriction, so any
authenticated caller could set their own `profiles.role` to `'designer'`. 00555 section (a2) adds a
`WITH CHECK` that pins the column, and gives `handle_new_user` a homeowner default. Read-only check:

```sql
-- 9f-i. the policy now carries a WITH CHECK, and it names role
SELECT polname, pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.profiles'::regclass AND polcmd = 'w';
-- want: "Users can update own profile", with_check NOT NULL and containing 'role'
--       (it reads `role IS NOT DISTINCT FROM current_profile_role()` — the
--        inline subquery form raises 42P17 and is NOT what shipped)

-- 9f-ii. the server default is in place.
-- Match the fallback EXPRESSION, not the word: 00313's body already contains
-- the literal 'homeowner' twice (the CASE arm that honours an explicit client
-- hint, and its SECURITY comment), so `LIKE '%homeowner%'` returns true on the
-- UNFIXED function. Corrected 2026-09-02 by W0 · L0.2 — the draft's version of
-- this probe could not fail.
SELECT pg_get_functiondef(p.oid) LIKE '%COALESCE(v_role, ''homeowner'')%' AS defaults_homeowner
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';
-- want: true
```

The *write* half of this check (attempting the elevation as a real user) runs **locally only**, as
case 7 of `00555_ios_round_one_security.test.sql`. It is not run against production.

## 10 · The marketing rail is closed to anon

The seven `FOR ALL / TO PUBLIC / auth.uid() IS NULL` policies are dropped but the table grants
are left in place, so the shape of the answer changes from data to an empty array.

```bash
for t in campaigns email_templates audience_segments automated_sequences \
         sequence_enrollments campaign_analytics user_sessions; do
  code=$(curl -sS -o "/tmp/p10_$t.json" -w '%{http_code}' \
    "$SB_URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
  printf '%-22s %s %s\n' "$t" "$code" "$(head -c 60 /tmp/p10_$t.json)"
done
```

| | expected |
|---|---|
| before | `200` with rows (campaign bodies, email template HTML, audience definitions, session history) |
| after | `200 []` for all seven — RLS denies with no matching policy |

## 11 · The two designer-portal vendor routes (a leak that exists TODAY)

`apps/designer-portal/src/app/api/catalog/vendors/route.ts:5-13` and
`.../vendors/[id]/route.ts:5-18` call `createServerClient()` and `.select('*')` with no
`getUser()` guard, and the portal middleware passes `/api/*` through. Probe them with **no
cookie at all**:

```bash
curl -sS -o /tmp/p11.json -w '%{http_code}\n' https://app.patina.cloud/api/catalog/vendors
python3 -c "import json;d=json.load(open('/tmp/p11.json'));v=d.get('vendors',[]);print(len(v), 'notes' in (v[0] if v else {}))"
```

| | expected |
|---|---|
| before | `200`, every vendor with all 37 columns including `notes` and `trade_terms` — **a live unauthenticated leak** |
| after | `500` (`{"error":"permission denied for table vendors"}`) — the leak is closed, but the route is now broken for signed-in designers too |

Both outcomes are wrong. The route needs a `getUser()` guard **and** a named column list; it is
REQUIRED CODE FOLLOW-UP 2 in the migration.

**And it ships FIRST, not "in the same PR".** PROGRAM.md's ruling **D8** sequences this: lane
**L0.2b** merges the guard and the `list_vendor_profiles` swap, the designer portal is redeployed
(`./infra/deploy-portal.sh designer`), and only then does 00555 go to Strata. The guard closes the
live leak with no migration involved, so the safe order is also the fast one. Run this probe
**twice**: once after the portal deploy (want `401`) and once after the migration (still `401`).

## 12 · Catalog assertions (SELECT-only; safe against prod)

```sql
-- 12a. the policy set on profiles
SELECT polname, polcmd,
       CASE WHEN polroles = '{0}' THEN 'PUBLIC'
            ELSE (SELECT string_agg(rolname, ',') FROM pg_roles WHERE oid = ANY(polroles)) END AS roles,
       pg_get_expr(polqual, polrelid) AS qual
FROM pg_policy WHERE polrelid = 'public.profiles'::regclass ORDER BY polname;
-- after: no row named "Profiles are viewable by everyone";
--        profiles_select_self          (r, authenticated)
--        profiles_select_counterparty  (r, authenticated, can_view_profile(id))
--        profiles_select_admin         (r, authenticated, user_roles ⨝ roles domain='admin')
--        profiles_select_agent_reader  (r, agent_reader, true)
--        "Users can insert own profile" WITH CHECK no longer mentions auth.uid() IS NULL

-- 12b. MOVED. The PUBLIC + FOR ALL + auth.uid() IS NULL sweep is an exit
--      criterion, so it has its own heading: see § 9b above. Run it there.

-- 12c. helper lockdown
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('can_view_profile','search_shareable_designers');
-- after: both  f, t, t, {search_path=public}

-- 12d. MOVED. The vendors column allowlist is an exit criterion, so it has its
--      own heading: see § 9d above. Run it there.

-- 12e. the definer views
SELECT c.relname, array_to_string(c.relacl,' ') AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('user_engagement_scores','consumer_funnel','designer_funnel','conversion_funnel');
-- after: no `anon=` and no `authenticated=` entry; service_role=r/postgres present

-- 12f. the security_invoker views that read profiles still return their rows.
--      project_unbilled_time is the one with an INNER JOIN on profiles, so it is
--      the only one that can LOSE rows rather than null out a name.
SELECT count(*) FROM public.project_unbilled_time;   -- run as a designer, not as postgres
SELECT count(*) FILTER (WHERE display_name IS NULL) AS nameless,
       count(*) FILTER (WHERE phone IS NULL)        AS phoneless,
       count(*)                                     AS total
FROM public.people_directory;                        -- run as a designer
-- people_directory.phone is `pr.phone` with NO COALESCE fallback (00478:150), so
-- `phoneless` is the direct measure of whether the studio-scope legs are working.
-- Record it BEFORE and compare AFTER; it must not increase.

-- 12g. the supporting indexes landed
SELECT indexname FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('idx_fulfillment_orders_designer_profile','idx_projects_client_profile');
-- after: both rows
```

## 13 · Advisors

```
mcp__claude_ai_Supabase__get_advisors(project_id=bkvcixdmuyejfzcijpdg, type="security")
```

- `security_definer_view` ERROR count must stay at **21**. With `profile_cards` cut this
  migration creates no view at all, so the count cannot move for that reason; a 22nd means
  something else was added. (The four views in §4 keep their definer status; only their grants
  change, so the advisor count is unaffected by design.)
- The `rls_disabled_in_public` ERROR on `public._comms_backfill_legacy_map` is untouched by
  this migration and remains open.

---

## The apply step (Kody-run)

**Re-check the gap first.** The premise recorded in `research/A3-prod.md` — that
`00533–00540` are unapplied — was **re-verified on 2026-09-01 and is no longer true**:
`supabase_migrations.schema_migrations` runs `00530…00554` unbroken, and every object A3
listed as missing now exists (`client_designer_roster`, `profile_presence`,
`get_direct_order_terms`, `notify_client_attention`, `purge_client_account`,
`products.photo_verified_at` — all probed directly, not read off the ledger).

That said, other programs mint numbers in this band, so run the census immediately before
applying, and treat any gap it shows as a blocker:

```bash
ls supabase/migrations/*.sql | sort | tail -5      # confirm this file is still the head+1
supabase migration list                             # local vs Strata, side by side
```

```sql
-- and the authoritative read
SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '00528' ORDER BY version;
```

**Apply this ONE file, not the branch.** `supabase db push` reconciles by version and pushes
every local migration Strata does not have. Today that set is empty, but it will not stay
empty while other lanes are drawing numbers, and a `db push` that silently drags someone
else's unshipped migration is exactly the incident this band has already produced twice.

Targeted apply, either form:

```bash
# (1) psql, then the ledger row
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -f supabase/migrations/00555_ios_round_one_security.sql
psql "$STRATA_DB_URL" -X -q -v ON_ERROR_STOP=1 -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('00555','ios_round_one_security') ON CONFLICT DO NOTHING;"
```

```
# (2) Supabase MCP — writes the ledger row itself
mcp__claude_ai_Supabase__apply_migration(
  project_id = "bkvcixdmuyejfzcijpdg",
  name       = "00555_ios_round_one_security",
  query      = <the file body>)
```

⚠ The Bash prod-mutation hook does **not** cover Supabase MCP writes (recorded in
`project_studio_invite_onboarding_fixes_2026_09_01`). Form (2) will not be stopped by the
guard rail, so it needs the same explicit ship request that form (1) does.

**Then, in order:**

1. `python3 scripts/generate-legacy-grants.py` — this migration adds GRANT/REVOKE, so
   `supabase/seed/00-legacy-grants.sql` must be regenerated or a fresh local stack diverges
   from prod ACLs. Never hand-edit that file.
2. `pnpm db:generate` && `git diff --exit-code packages/supabase/src/database.types.ts`
   (a new view and two new functions land in the public schema).
3. **`scripts/run-sql-tests.sh`** against **local**, not prod. That is the gate — it runs
   every file under `supabase/tests/**` and scores them against
   `supabase/tests/KNOWN_FAILURES.md`. Running only
   `00555_ios_round_one_security.test.sql` proves the new policies work and proves nothing
   about the ~40 existing suites that insert into `profiles`, `designer_clients` and
   `organization_members` under a role. Several of those are the ones most likely to break.
4. Probes 1–13 above against prod.
5. The four REQUIRED CODE FOLLOW-UPS in the migration banner — `ScanSharingService.swift`
   (RPC swap), both `api/catalog/vendors` routes (guard + named columns), and
   `useVendorProfiles` — ship in the same PR. The first is a TestFlight blocker; the second
   is a live leak today and should arguably land *before* the migration.

**Rollback.** Everything here is reversible with a forward migration; there is no data
change. The statements that restore the old behavior if the counterparty predicate turns out
to be too tight are:

```sql
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
GRANT SELECT ON public.profiles TO anon;
```

Do not reach for that without saying so — it re-opens the exposure this file exists to close.
If the problem is one missing relationship rather than the whole predicate, add a leg to
`can_view_profile` instead; it is `CREATE OR REPLACE` and needs no policy churn.
