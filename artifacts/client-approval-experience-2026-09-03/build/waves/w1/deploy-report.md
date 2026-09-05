# Wave 1 — production deploy report ("The Decision, Delivered")

Deployed 2026-09-05 from the **main checkout** `/Users/kody/Code/patina-merged`,
`git rev-parse HEAD` = **`107549568c23b321fe413284de75164bde5852c9`**, branch `main`.
The working tree carried only the pre-existing unrelated modifications (`CLAUDE.md`,
`.claude/settings.json`, `project.pbxproj`, six help-walkthrough PNGs); none were touched.

Authorization: Kody's in-session ship request ("ship the improvements to production"), which
authorizes the whole chain (migration → edge functions → portal → smoke) without per-step re-ask.

Targets: Supabase project **Strata** (`bkvcixdmuyejfzcijpdg`) and **Cloudflare Workers**.
The retired Coolify box was not touched.

Order run: **new function → migration → remaining 27 functions → client portal → smoke.**
The new function went out ahead of the migration on purpose: `00568`'s trigger invokes
`decision-first-notice`, so deploying the function first means the trigger never 404s.

---

## A. Pre-flight (read-only)

| check | command | result |
|---|---|---|
| migration ledger | `supabase migration list --linked` | every migration through **00567** applied; **exactly one pending: `00568_decision_first_notice_dispatch`** (`remote` empty). No peer migration pending — so `db push` was the correct path. |
| function versions | `supabase functions list --project-ref bkvcixdmuyejfzcijpdg` | 80 functions on Strata; before-versions for the 28 recorded (table in §D). `decision-first-notice` **absent**, as expected. |
| secrets | `supabase secrets list --project-ref bkvcixdmuyejfzcijpdg` | **`CLIENT_PORTAL_URL` exists** (updated 2026-07-08) and **`DESIGNER_PORTAL_URL` exists** (updated 2026-07-12). **No secret was set** — step B's conditional did not fire. Names only; no value read or printed. |

### What `00568` invokes

`supabase/migrations/00568_decision_first_notice_dispatch.sql` creates
`public.decision_dispatch_first_notice()` (SECURITY DEFINER, `search_path = public, pg_temp`)
and the AFTER `INSERT OR UPDATE OF status` trigger `decision_first_notice_dispatch` on
`public.client_decisions`. The function calls
`public.invoke_edge_function('decision-first-notice', jsonb_build_object('decision_id', NEW.id))`
inside a `BEGIN … EXCEPTION WHEN OTHERS` block, so a dispatch failure warns rather than failing
the designer's write. It fires only for `status = 'pending'` and `court = 'client'`, and on the
UPDATE leg only for a real status transition. **No enum, table, column or grant changes.**

### verify_jwt audit before deploying

`config.toml` was grepped for `verify_jwt = false` blocks. Two apparent matches were comment text
(`dispatch-scan-modal`, `trade-rfq-send` — the latter's comment explicitly says it is *not* a
`verify_jwt=false` candidate); a per-block check with comments stripped confirmed
`trade-rfq-send = true` and `dispatch-scan-modal = true`.

**Within the 28, only `stripe-webhook` is `verify_jwt = false`** — corroborated by the remote API,
which reported `verify_jwt: False` for `stripe-webhook` and `True` for the other 27. It was the
only function deployed with `--no-verify-jwt`.

`decision-first-notice` has **no `[functions.…]` entry in `config.toml`**, so it deployed at the
default `verify_jwt = true`. That is correct here: the trigger reaches it through 00081's
`invoke_edge_function`, which sends dual `apikey` + service-role `Bearer` headers.

---

## B. New function first

```
$ supabase functions deploy decision-first-notice --project-ref bkvcixdmuyejfzcijpdg
Bundling Function: decision-first-notice
Deploying Function: decision-first-notice (script size: 168 kB)
{"project_ref":"bkvcixdmuyejfzcijpdg","functions":["decision-first-notice"],…,"message":"Deployed Functions."}
```

Landed at **version 1**. `CLIENT_PORTAL_URL` already existed, so **no `supabase secrets set` was run.**

---

## C. Migration

`00568` was the only pending migration, so the clean path applied — **no `db query --file`, no
manual `supabase_migrations.schema_migrations` ledger insert.**

```
$ supabase db push
Applying migration 00568_decision_first_notice_dispatch.sql...
{"upToDate":false,"dryRun":false,"migrations":["00568_decision_first_notice_dispatch.sql"],
 "seeds":[],"roles":[],"message":"Finished supabase db push."}
```

### Object probes (the objects, not the ledger)

```
$ supabase db query --linked "select proname from pg_proc where proname ilike '%first_notice%'"
  proname = decision_dispatch_first_notice

$ supabase db query --linked "select tgname, tgrelid::regclass from pg_trigger where tgname ilike '%first_notice%'"
  tgname = decision_first_notice_dispatch    tbl = client_decisions
```

### Ledger tail

```
$ supabase migration list --linked | tail -3
local=00566  remote=00566
local=00567  remote=00567
local=00568  remote=00568
```

Nothing pending.

---

## D. Edge functions — all 28

Each deployed by name, sequentially, from the main checkout. `stripe-webhook` carried
`--no-verify-jwt`; the other 27 did not. Every one returned `"message":"Deployed Functions."`.
All 28 were done in one pass — each bundles its own copy of the edited `_shared` modules, so a
partial deploy would have left two generations of copy in the mail.

| function | before | after | verify_jwt | status |
|---|---:|---:|---|---|
| apns-send | 22 | 23 | true | ACTIVE |
| campaign-dispatch | 39 | 40 | true | ACTIVE |
| client-invite | 39 | 40 | true | ACTIVE |
| commercial-document-notify | 21 | 22 | true | ACTIVE |
| comms-notification-dispatch | 37 | 38 | true | ACTIVE |
| create-checkout-session | 43 | 44 | true | ACTIVE |
| **decision-first-notice** | *absent* | **1** | true | ACTIVE |
| decision-reminders | 41 | 42 | true | ACTIVE |
| decision-resolved-notify | 41 | 42 | true | ACTIVE |
| digest-dispatcher | 40 | 41 | true | ACTIVE |
| expire-decisions | 41 | 42 | true | ACTIVE |
| fulfillment-notify | 21 | 22 | true | ACTIVE |
| invoice-check-intent | 18 | 19 | true | ACTIVE |
| invoice-reminders | 42 | 43 | true | ACTIVE |
| invoice-send | 43 | 44 | true | ACTIVE |
| morning-brief | 28 | 29 | true | ACTIVE |
| notification-digest | 38 | 39 | true | ACTIVE |
| notification-dispatch | 41 | 42 | true | ACTIVE |
| po-send | 44 | 45 | true | ACTIVE |
| proposal-nudge | 39 | 40 | true | ACTIVE |
| proposal-send | 45 | 46 | true | ACTIVE |
| proposal-sign-confirmation | 36 | 37 | true | ACTIVE |
| quote-request-send | 37 | 38 | true | ACTIVE |
| review-requests | 38 | 39 | true | ACTIVE |
| spec-pdf | 35 | 36 | true | ACTIVE |
| **stripe-webhook** (deployed `--no-verify-jwt`) | 47 | 48 | **false** | ACTIVE |
| trade-rfq-send | 18 | 19 | true | ACTIVE |
| waitlist-notify | 37 | 38 | true | ACTIVE |

**All 28 incremented; none failed, none was left behind.** `stripe-webhook` kept
`verify_jwt = false` — the flag took.

### Probes

**(1) stripe-webhook is live and still verifying.**

```
$ curl -s -o … -w '%{http_code}' -X POST …/functions/v1/stripe-webhook -d '{}'
400
{"error":"missing_signature"}
```

400 with a signature complaint, not 401 — confirming the function is live, is verifying Stripe
signatures, and did **not** regain JWT enforcement (which would have broken the webhook).

**(2) decision-first-notice no-ops cleanly on a non-existent decision.**
Service-role key fetched via `supabase projects api-keys --reveal`, held in a shell variable and
piped into curl; never printed.

```
$ curl -s -X POST …/functions/v1/decision-first-notice \
    -H "Authorization: Bearer $KEY" -H "apikey: $KEY" -H 'Content-Type: application/json' \
    -d '{"decision_id":"00000000-0000-0000-0000-000000000000"}'
{"error":"decision_not_found"}
HTTP 404
```

It authenticated (not 401), found no decision, and sent nothing. Clean no-op; **no real send.**

**(3) No notification burst from the deploy.**

```
$ supabase db query --linked "select count(*) from notification_log where created_at > now() - interval '10 minutes'"
  recent = 0      (baseline, taken before probe 2)
  recent = 0      (again, after probe 2)
```

Zero rows both before and after. The 28 redeploys and the invocation probe produced no mail.

---

## E. Client portal

### Gate — and one thing worth recording

`pnpm --filter @patina/client-portal type-check` **failed on the first run**:

```
.next/types/app/page.ts(37,29): error TS2344: Type '{ searchParams?: … } | undefined'
  does not satisfy the constraint 'PageProps'.
```

This is **not a source defect**. `.next/` is gitignored build output, and the offending file is
Next's *generated* route-type shim, dated **Sep 4 17:01** — a stale local build predating this
tree. `apps/client-portal/tsconfig.json` includes `.next/types/**/*.ts`, so tsc was checking a
stale artifact. The wave report's green gate ran in an integration worktree with a clean `.next`.

Before touching anything, `ps` and `lsof` on ports 3000–3003 confirmed **no `next dev` was
running**. `rm -rf apps/client-portal/.next/types` (regenerable, gitignored) then:

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
EXIT=0            # clean, no diagnostics
```

No source file was modified.

### Deploy

```
$ ./infra/deploy-portal.sh client        # THE ONLY portal deploy path
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=<unset, inherits build-time URL>)
==> [1/3] Building workspace dependencies via Turborepo   (12 packages, stale-dist guard)
==> [2/3] (bundle phase)  → handler.mjs size: 8165995 bytes
==> [3/3] Deploying the client portal to Cloudflare Workers
    Total Upload: 12089.85 KiB / gzip: 2458.48 KiB
    Deployed patina-client-portal triggers (0.88 sec)
    Current Version ID: ed397151-a364-42fc-a3bd-088b4e72ebca
==> Done: client portal deployed to production.
exit 0
```

**No env var needed exporting.** The script's `resolve_next_public_var` found
`NEXT_PUBLIC_SUPABASE_STORAGE_KEY` in the app's own env files and the preflight passed on the
first attempt — the older "export the storage key" trap did not recur.

Start `2026-09-05T12:44:47Z`, worker version created `12:45:57Z`.

One benign wrangler warning: multiple environments defined, no `-e` given, so the top-level
environment was targeted (the same shape every prior client deploy used).

### Verification

**Deployments list (oldest-first — bottom row):**

```
$ npx wrangler deployments list --name patina-client-portal
…
Created:     2026-09-05T12:45:59.706Z
Author:      kody@thesaunabuild.com
Version(s):  (100%) ed397151-a364-42fc-a3bd-088b4e72ebca
                 Created:  2026-09-05T12:45:57.327Z
```

Bottom row is **after** the 12:44:47Z deploy start and its version id matches the script's
`Current Version ID`. The two rows above it are the prior deploys (2026-09-04 13:43 and 22:02).

**Live responses:**

```
$ curl -sI https://client.patina.cloud/
HTTP/2 307
location: /auth/signin?callbackUrl=%2F

$ curl -sI https://client.patina.cloud/decisions/00000000-0000-0000-0000-000000000000
HTTP/2 307
location: /auth/signin?callbackUrl=%2Fdecisions%2F00000000-0000-0000-0000-000000000000
```

The decision path survives intact as `callbackUrl` — the sign-in redirect keeps the deep link.

```
$ curl -sI https://client.patina.cloud/auth/signin
HTTP/2 200 · content-type: text/html; charset=utf-8

$ curl -sL https://client.patina.cloud/ | head -c 600
<!DOCTYPE html><html lang="en" class="bg-[var(--bg-primary)]">…font preloads…
```

Real Patina HTML — not a placeholder, not a blank body. (A bare `curl -s /` returns an empty body
only because it is the 307 itself.)

**The bundle carries Wave 1 copy.** In the built output:

```
$ grep -rl "your answer is needed" apps/client-portal/.open-next
.open-next/server-functions/default/apps/client-portal/handler.mjs
.open-next/server-functions/default/apps/client-portal/.next/server/chunks/1244.js
.open-next/assets/_next/static/chunks/common-08c286eeb1e3b801.js
```

That third file is one of the **two newly-uploaded static assets** this deploy pushed. Confirmed
on the **served** artifact, not just the local build:

```
$ curl -s https://client.patina.cloud/_next/static/chunks/common-08c286eeb1e3b801.js   # HTTP 200, 953682 bytes
… "Your approval · read the edition first":"Your approval · your answer is needed" …
```

Wave 1 copy is live on production.

---

## What was NOT verified

- **No signed-in walk.** Every portal probe was anonymous. The approval screen itself, the copy in
  context, and the Wave 1 rulings on a real decision were never seen by a logged-in eye. The proof
  that Wave 1 copy shipped is a string in the served chunk, not a rendered page.
- **The first-notice letter was never end-to-end exercised.** No approval was published, so the
  `00568` trigger has not actually fired in production and no first-notice email has been sent or
  read. The trigger and function exist and the function no-ops correctly on a bad id — that is all
  that is established. Deliberate: the brief forbade data mutations beyond the migration.
- **`invoke_edge_function`'s GUC configuration on Strata was not checked.** If the bridge's GUCs
  were unset in prod the trigger would warn and no-op silently; nothing here proves they are set.
- **The other 27 functions were verified only by version increment**, not by behavior. Only
  `stripe-webhook` and `decision-first-notice` got live probes. The `_shared` copy changes riding
  in the other 26 (branded email, client-portal links, studio identity, invoice and approval
  notifications) are unread in the wild.
- **No `wrangler tail`** was run, so a post-deploy error spike on the client worker would not have
  been seen. `notification_log` was clean, but that covers mail, not Worker exceptions.
- **Custom-domain routing was not re-verified.** No `routes` exist in any `wrangler.jsonc`;
  `client.patina.cloud` is dashboard-managed out of band. It answered correctly, which is evidence
  it is wired, not proof of its configuration.
- **iOS shipped nothing.** 60 changed files under `apps/mobile/Patina` are on main and
  build-green, but no TestFlight build was cut in this wave and none was cut here.
- **The designer portal was not redeployed** — correctly: the wave diff touches zero files under
  `packages/` and zero under `apps/designer-portal`.
- **The open findings carried on the branch remain open** and shipped with it — notably backend
  R3-03 (the first notice is a one-shot with no retry, accepted for Wave 1), iosb3-M2 (a studio
  co-member signed into the client app sees studio-wide approvals; the viewer-role field is a
  Wave 2 migration), and the web and iOS minors listed in the wave report.
- **Nothing was rolled back or half-applied.** Every step in the chain succeeded; there is no
  partial state to reconcile.
