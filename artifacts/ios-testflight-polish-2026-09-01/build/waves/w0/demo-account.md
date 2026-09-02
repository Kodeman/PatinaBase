# The demo / walk account — `firstflight@patina.cloud`

**Rulings D7 + D11.** Prepared by W0 · L0.2. **Every step below is Kody-run against production.**
No agent ran any of it. What an agent *did* run is stated at the foot under "What was actually proved".

This account is the identity L0.5's beta-review notes name, the one W1 · L1-A's `AuthService.verifyOtp`
fallback signs in, and the one the device pass walks. `tester@patina.cloud` is retired from the app's
story — closing `A3-15`, whose whole content was that the old account's notification feed is four
designer-portal messages, one deep-linking to `app.patina.cloud/help`, a host this app does not claim.

---

## Read this before you start

**There is no clean rollback.** `guard_proposal_copy_immutability()` refuses to DELETE a non-draft
proposal, and `guard_proposal_authority()` refuses to move its status back to `draft` — both were hit
for real on the local stack on 2026-09-02:

```
ERROR:  non-draft proposals are immutable editions and cannot be deleted
ERROR:  proposal status may only change through its canonical lifecycle authority
```

So the `sent` proposal this seeds is **permanent on Strata**. Everything else could be deleted; that one
cannot. Read the script once before running it, and run it once.

Three things make that safe rather than alarming:

- It is **one transaction**. Any failure leaves production exactly as it was.
- It is **idempotent** — every row carries a fixed `ff`-prefixed uuid with `ON CONFLICT (id) DO NOTHING`.
  A second run reports `INSERT 0 0` on every statement (verified locally). It cannot make a second house.
- Every row is identifiable at a glance by that `ff` prefix.

**The order matters.** The SQL resolves the account's uuid out of `auth.users`; if step 2 has not run it
aborts on `\gset` before writing anything. And the Vault append in step 6 is what makes the account
*usable* — the SQL does not create a password, because the sign-in path is the Vault code, not a mailbox.

---

## Step 1 — Variables, assigned once, at the top of the shell

Nothing below contains a placeholder. Assign these three and every later command is literal.

```bash
export STRATA_DB_URL="$(grep -m1 '^STRATA_DB_URL=' /Users/kody/Code/patina-merged/infra/.env | cut -d= -f2-)"
export SERVICE_ROLE_KEY="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' /Users/kody/Code/patina-merged/infra/.env | cut -d= -f2-)"
export SUPABASE_URL="https://bkvcixdmuyejfzcijpdg.supabase.co"
export DEMO_SQL="/Users/kody/Code/patina-merged/artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/demo-account.sql"
```

Confirm they are set **without printing the secret**:

```bash
test -n "$SERVICE_ROLE_KEY" && echo "service role key: loaded (${#SERVICE_ROLE_KEY} chars)"
test -n "$STRATA_DB_URL"    && echo "db url: loaded"
```

If `STRATA_DB_URL` is not in `infra/.env` under that name, take the pooler URI from the Supabase
dashboard (Project Settings → Database → Connection string → URI) and export it by hand. Never paste
either value into a file, a commit, or a chat.

---

## Step 2 — Create the auth user (GoTrue admin API)

No password and no mailbox: `email_confirm: true` marks it confirmed outright, and sign-in happens
through the Vault code in step 6.

`user_metadata.role` is `homeowner` deliberately. `handle_new_user` honours exactly one client-supplied
role string and that is it (00313, kept by 00555 §a2(ii)), and it is the same string the iOS app sends
at `AuthService.swift:437` and `:563`. Anything else is ignored.

```bash
curl -sS -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"firstflight@patina.cloud","email_confirm":true,"user_metadata":{"role":"homeowner","display_name":"First Flight"}}'
```

Expect a JSON user object with an `id`. If it returns
`{"code":422,"msg":"A user with this email address has already been registered"}` the account already
exists — that is fine, skip to step 3.

Confirm the trigger did its half:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, email, role, display_name FROM public.profiles WHERE email = 'firstflight@patina.cloud';"
```

Expect one row, `role = homeowner`.

> If this runs **before** 00555 is applied, `role` is still `homeowner` — 00313 already honours the
> explicit hint. 00555 §a2(ii) only changes what happens when there is **no** hint. Either order works.

---

## Step 3 — Resolve Leah's profile id and her studio id (read-only)

**Look first.** This prints every candidate, so you can see whether the match is unambiguous before
anything is assigned:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, email, display_name, full_name, business_name, created_at
     FROM public.profiles
    WHERE is_designer IS TRUE AND (email ILIKE '%leah%' OR full_name ILIKE '%leah%')
    ORDER BY created_at;"
```

**Then assign by command substitution, never by retyping a uuid.** If the query above returned more
than one designer, narrow the `WHERE` clause here to the one you want *before* running it:

```bash
export DESIGNER_PROFILE_ID="$(psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT id FROM public.profiles
    WHERE is_designer IS TRUE AND (email ILIKE '%leah%' OR full_name ILIKE '%leah%')
    ORDER BY created_at LIMIT 1")"

psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, email, display_name, full_name FROM public.profiles WHERE id = '$DESIGNER_PROFILE_ID';"
```

**Read that row back before continuing.** It is the designer who will appear in the demo client's
house, on the proposal, on the invoice and in the thread. A wrong match here is written into production
in step 5 and the `sent` proposal cannot be deleted.

```bash
export STUDIO_ID="$(psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT o.id
     FROM public.organizations o
     JOIN public.organization_members m ON m.organization_id = o.id
    WHERE m.user_id = '$DESIGNER_PROFILE_ID' AND m.status = 'active'
    ORDER BY o.created_at LIMIT 1")"

psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, name, type FROM public.organizations WHERE id = '$STUDIO_ID';"
```

Confirm both resolved to something, not to an empty string:

```bash
echo "designer: ${DESIGNER_PROFILE_ID:-<EMPTY — STOP>}"
echo "studio:   ${STUDIO_ID:-<EMPTY — STOP>}"
```

An empty value means the `ILIKE` matched nothing, or Leah has no `active` membership. **Stop and fix
the query** — do not proceed with a blank, because `psql -v` would then substitute an empty string and
the seed's guard would abort mid-way through your reading of it rather than at the top.

---

## Step 4 — Pre-flight the one value that can collide

`uniq_invoices_studio_number` makes `(studio_id, invoice_number)` unique, and
`chk_invoices_number_when_issued` requires a number on any non-draft invoice. The script uses `FF-0001`.

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT id, invoice_number, status, total_cents
     FROM public.invoices
    WHERE studio_id = '$STUDIO_ID' AND invoice_number = 'FF-0001';"
```

Expect **zero rows**. If a row comes back, edit `invoice_number` in `demo-account.sql` to `FF-0002`
(or the next free one) before running it — do not delete the existing invoice.

---

## Step 5 — Run the seed

```bash
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 \
  -v designer_profile_id="$DESIGNER_PROFILE_ID" \
  -v studio_id="$STUDIO_ID" \
  -f "$DEMO_SQL"
```

The script prints its own verification after `COMMIT`. Expect, in order:

```
 projects | pending_decisions | sent_proposals | payable_invoices
        1 |                 1 |              1 |                1

 client_visible_docs | live_threads | messages
                   1 |            1 |        1

 id | email | role | display_name | is_designer
 …  | firstflight@patina.cloud | homeowner | First Flight | f

 invoice_number | status | total_cents | amount_paid_cents | balance_cents | currency | due_date
 FF-0001        | sent   |        4200 |                 0 |          4200 | USD      | (future)
```

The first row is the one that matters: `EngagementTier.resolve` returns `.activeProject` when any of
those four counts is above zero, so all four at 1 means the app opens on the Studio, not on the
marketplace pitch.

The last query (`V5`) prints `f` when run as `postgres`, because `auth.uid()` is NULL for a superuser
session. That is expected and is not a failure — the real check is step 7's.

---

## Step 6 — Append the account to the Vault allow-list

**Append. Never replace.** `test_login_accounts` is a comma-separated list and `tester@patina.cloud`
(and possibly others) are already in it; overwriting it silently unhooks every account already there.

Read the current value first — as `service_role`, because 00258 revoked `app_setting` from
PUBLIC/anon/authenticated and 00554 §1 granted it back to `service_role` alone:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app.settings.test_login_accounts';"
```

Then, in the Supabase dashboard → **Project Settings → Vault**, open
`app.settings.test_login_accounts` and set its value to **exactly what you just read, with
`,firstflight@patina.cloud` appended** — no spaces around the comma.

Confirm the paired code exists and is non-empty (the function fails closed if either is missing —
`supabase/functions/test-account-login/lib.ts`):

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT name, length(decrypted_secret) AS len
     FROM vault.decrypted_secrets
    WHERE name IN ('app.settings.test_login_accounts', 'app.settings.test_login_code')
    ORDER BY name;"
```

Both rows must be present with `len > 0`.

Then confirm the read path the edge function actually uses:

```bash
psql "$STRATA_DB_URL" -X -q -c \
  "SELECT public.app_setting('test_login_accounts') LIKE '%firstflight@patina.cloud%' AS allowlisted;"
```

Expect `t`.

---

## Step 7 — Verify, read-only

**7a — the login round trip.** This mints a real single-use magiclink token. Reading the response is
the proof; do **not** open the link — consuming it would burn the token.

Read the code out of the Vault rather than retyping it, and confirm it resolved without printing it:

```bash
export TEST_LOGIN_CODE="$(psql "$STRATA_DB_URL" -X -q -tAc \
  "SELECT decrypted_secret FROM vault.decrypted_secrets
    WHERE name = 'app.settings.test_login_code'")"
echo "test login code: ${#TEST_LOGIN_CODE} chars"     # non-zero, or step 6 did not land
```

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/test-account-login" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, os
print(json.dumps({'email': 'firstflight@patina.cloud',
                  'code': os.environ['TEST_LOGIN_CODE']}))
")" | cut -c1-120
```

Expect a body containing **`token_hash`**. (That is the key the function actually returns —
`json({ token_hash: result.tokenHash })` at `supabase/functions/test-account-login/lib.ts:256`.
`hashed_token` is only GoTrue's own internal property name at `index.ts:130`, so looking for that
string would read a correct success as a failure.) A generic `403` means the allow-list append in step 6 did not
land, or the code does not match — the function returns the *same* 403 for every failure on purpose, so
re-check step 6 rather than guessing which half is wrong. A `429` means the rate limiter (00551: 20 per
IP or 300 globally in the trailing 15 minutes) is holding you off; wait and retry.

**7b — the counterparty read, as the account itself.** This is the half that proves 00555 did not
blind the demo account. Run it after 00555 is applied:

```bash
psql "$STRATA_DB_URL" -X -q <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id::text FROM auth.users WHERE email='firstflight@patina.cloud'),
                    'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT 'projects'  AS surface, count(*) FROM public.projects
UNION ALL SELECT 'decisions', count(*) FROM public.client_decisions WHERE status='pending'
UNION ALL SELECT 'invoices',  count(*) FROM public.invoices
UNION ALL SELECT 'documents', count(*) FROM public.project_documents
UNION ALL SELECT 'threads',   count(*) FROM public.comms_threads
UNION ALL SELECT 'messages',  count(*) FROM public.comms_messages;
SELECT jsonb_array_length(public.list_client_proposals()) AS proposals;
ROLLBACK;
SQL
```

Expect `1` on every surface and `proposals = 1`. A `0` on `projects` or `invoices` means the RLS leg
did not admit the account; a `0` on `messages` or a missing designer name means the thread's
participant rows are wrong.

**7c — the app.** Sign in on the simulator or the device as `firstflight@patina.cloud` with the Vault
code. The Studio should show one project, one decision waiting, one proposal to sign, one invoice to
pay, one document, and one unread message from Leah — with **Leah's name on it**, not a blank.

---

## What was actually proved, and at what level

Stated at its level, per the program's claim rules.

| Claim | Level | Evidence |
|---|---|---|
| `demo-account.sql` applies clean, top to bottom | **local-verified** | Run against the local stack 2026-09-02: `BEGIN … COMMIT`, ten inserts, no error. Four schema mismatches were found and fixed this way (`projects.description` does not exist → `notes`; `lead_designer_id` is GENERATED; `client_profile_id` FKs to `client_profiles`, not `profiles`; `comms_threads.subject` → `title`). |
| It is idempotent | **local-verified** | Second run: `INSERT 0 0` on every statement, row counts unchanged. |
| The four tier signals come back as 1/1/1/1 | **local-verified** | The V1 block, printed above. |
| The account can read its whole house under 00555's new RLS | **local-verified** | Ran as `authenticated` with the account's `sub` claim: projects/decisions/invoices/documents/threads/messages all 1, `list_client_proposals()` 1 row, `can_view_profile(designer)` = **true**. |
| The `sent` proposal cannot be deleted or reverted | **local-verified** | Both guards raised, verbatim, at the top of this file. |
| V5's counterparty check answers truthfully | **local-verified**, and it did **not** before | The old V5 was a bare `SELECT public.can_view_profile(…)`. Kody runs this file over `$STRATA_DB_URL` as `postgres`, where `auth.uid()` is NULL, so the helper's `(SELECT auth.uid()) IS NOT NULL` guard made it return **`f` unconditionally** — a verification block that could not pass, at the one moment production has just been written. Rewritten to assume each identity in turn, in its own transaction (`SET LOCAL` outside a transaction block is a no-op, and everything above V5 has already COMMITted). Measured on the local stack 2026-09-02 against 00555's own Dana/Cleo counterparty fixtures: new form `NOTICE: V5 client -> designer: t designer -> client: t`, old form `f`, and `current_user` back to `postgres` afterwards. |
| Any of the above **on Strata** | **not verified** | Nothing in this lane touched production. Steps 2-7 are why this runbook exists. |
| The Stripe payment actually completes (D10) | **not verified — device claim** | Apple Pay inside hosted Checkout, on Kody's phone, in R1's device pass. A live key on the edge runtime is a separate Kody-run step. |

The local fixtures used for that proof were removed: the local database was reset afterwards and
`SELECT count(*) … WHERE id='ff100000-…'` returns 0.
