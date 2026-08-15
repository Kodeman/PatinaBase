> [!WARNING]
> Historical only. Do not use these operating steps. The current email runbook is `infra/runbooks/email-ops.md`.

# Email & Engagement System Runbook

Patina's campaign + transactional email stack. Every piece needed to run it in
production — DNS, secrets, cron, deploys, and common ops tasks.

---

## Architecture at a glance

```
 ┌──────────────────┐   ┌─────────────────┐   ┌─────────────────┐
 │  Admin portal    │   │ Orders service  │   │  Lead/Auth DB   │
 │  (campaign UI)   │   │ (Stripe wh)     │   │  triggers       │
 └────────┬─────────┘   └────────┬────────┘   └────────┬────────┘
          ▼                      ▼                     ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  notification-dispatch  /  campaign-dispatch  (Edge Fn)     │
 │    reads email_templates.html_content, interpolates vars,   │
 │    POSTs to Resend, writes notification_log                 │
 └──────────────────────────┬──────────────────────────────────┘
                            ▼
                       ┌─────────┐
                       │ Resend  │── webhook ──▶ resend-webhook (Edge Fn)
                       └─────────┘                  updates notification_log
                            │                        + profiles.email_suppressed
                            ▼ deliveries
                         Users
```

Schedulers that kick everything off:

| pg_cron job            | Schedule   | Edge function invoked      |
|------------------------|------------|----------------------------|
| campaign-scheduler     | `*/5 * * * *` | campaign-scheduler      |
| automation-processor   | `*/5 * * * *` | automation-processor    |
| price-drop-check       | `0 * * * *`   | price-drop-check        |
| lead-expiration-check  | `0 * * * *`   | lead-expiration-check   |
| back-in-stock-check    | `0 * * * *`   | back-in-stock-check     |

Installed by migration `00079_cron_schedules.sql`.

---

## Required secrets

### Supabase Edge Functions (`supabase secrets set`)

| Name                          | Purpose                                                    |
|-------------------------------|------------------------------------------------------------|
| `RESEND_API_KEY`              | Send emails via Resend API                                 |
| `RESEND_WEBHOOK_SECRET`       | `whsec_…` — Svix signature verification on resend-webhook  |
| `UNSUBSCRIBE_TOKEN_SECRET`    | HS256 secret for JWT unsubscribe tokens                    |
| `POSTHOG_API_KEY`             | Emit email events to PostHog for analytics                 |
| `SUPABASE_SERVICE_ROLE_KEY`   | Automatically set by Supabase; used by all dispatch jobs   |

### Postgres GUCs (run once per environment, in SQL editor)

```sql
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://api.patina.cloud';
ALTER DATABASE postgres SET app.settings.service_role_key = '<SUPABASE_SERVICE_ROLE_KEY>';
```

These feed the lead triggers (00042) and pg_cron invoker (00079).

### Portal env (Coolify / Vercel — shared across admin, client, designer)

| Name                          | Required by                                               |
|-------------------------------|-----------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`    | Supabase client init                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client init                                    |
| `SUPABASE_SERVICE_ROLE_KEY`   | Unsubscribe API, prefs API (service-role server routes)   |
| `UNSUBSCRIBE_TOKEN_SECRET`    | **Must match edge function value** so tokens verify       |

### NestJS orders service (`services/orders/.env`)

| Name                          | Purpose                                                   |
|-------------------------------|-----------------------------------------------------------|
| `SUPABASE_URL`                | Endpoint for notification-dispatch                        |
| `SUPABASE_SERVICE_ROLE_KEY`   | Bearer for notification-dispatch invocations              |
| `CLIENT_PORTAL_URL`           | Used in order-confirmation CTA URLs                       |

---

## Resend configuration

### Domain DNS

Production sender domain is the apex `patina.cloud` (verified on Resend; sender is `Patina <hello@patina.cloud>`). DNS records from the Resend dashboard:

| Record | Host           | Value                                                    |
|--------|----------------|----------------------------------------------------------|
| TXT    | `send`         | `v=spf1 include:amazonses.com ~all` (exact per Resend)   |
| CNAME  | `resend._domainkey` | (copy from Resend dashboard)                        |
| TXT    | `_dmarc`       | `v=DMARC1; p=quarantine; rua=mailto:dmarc@patina.cloud`  |

Verify: `dig TXT patina.cloud` shows SPF + DMARC; status "Verified" in Resend.

### Webhook

In Resend dashboard:
- URL: `https://<project>.supabase.co/functions/v1/resend-webhook`
- Events: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
- Copy the `whsec_…` secret into `RESEND_WEBHOOK_SECRET`.

Deploy the webhook function with `--no-verify-jwt` (the Svix signature does the auth):

```bash
supabase functions deploy resend-webhook --no-verify-jwt
```

### Supabase Auth emails (welcome, reset)

**Preferred:** route Supabase Auth's built-in mailer through Resend.
Dashboard → Authentication → SMTP Settings:

| Field      | Value                     |
|------------|---------------------------|
| Host       | `smtp.resend.com`         |
| Port       | `465` (SSL) or `587` (TLS)|
| Username   | `resend`                  |
| Password   | `<your RESEND_API_KEY>`   |
| From       | `hello@patina.cloud`      |
| Sender name| `Patina`                  |

Then customize the four Auth templates (confirm, invite, magic-link, reset) in the
dashboard. No edge-function code needed for these.

Alternative: `auth.hook_email_send` → custom edge function → `notification-dispatch`
(not currently wired; see plan for 2b option).

---

## Two email paths (read this first)

Patina sends email two completely independent ways. A failure in one says
nothing about the other — they use different credentials in different places.

| Path | Sender | Carries | Credential location |
|------|--------|---------|---------------------|
| **GoTrue SMTP** (`smtp.resend.com:587`) | the `auth` (GoTrue) container, directly | **all auth emails**: magic link, signup confirm, recovery, email-change | `GOTRUE_SMTP_PASS` in the **Supabase** stack `.env` / Coolify env |
| **Resend HTTPS API** (`api.resend.com`) | Next.js routes (`packages/email`) + edge fns (`_shared/send-email.ts`) | invoices, POs, proposals, decisions, campaigns, crons, **admin application emails** | `RESEND_API_KEY` per app/edge runtime env |

The **same `re_…` key** can be used for both, but it lives in different env
vars in different containers. Sending-scoped Resend keys return **401 on the
management `/domains` endpoint** yet still send fine — don't treat a `/domains`
401 as "the key is broken"; check `notification_log` / a real send instead.

### Magic-link redirect: allow-list MUST use `/**` wildcards

`GOTRUE_URI_ALLOW_LIST` (fed by `ADDITIONAL_REDIRECT_URLS`) must use path
wildcards, e.g. `https://client.patina.cloud/**`. The portals request
`emailRedirectTo = .../auth/callback?type=magiclink`; a **bare** allow-list
entry (`…/auth/callback`, no wildcard) fails to match the query-string URL, so
GoTrue **silently falls back to `SITE_URL`** (`app.patina.cloud`) and the magic
link sends the **client to the designer portal**. The designer portal appears
to "work" only because its fallback origin is its own. Verified 2026-06-23.

Confirm what the running container actually has (Coolify env can drift from the
on-disk `.env`):

```bash
ssh kody@192.168.1.14 'sudo docker exec auth-es8w8g0c00og4gsgg0k8w8o8 \
  printenv GOTRUE_URI_ALLOW_LIST'
# Expect every host as https://<host>/**  (not bare paths)
```

To change it durably: update the Coolify env var **and** the on-disk `.env`,
then recreate the container (a plain restart will NOT re-read env):

```bash
SBD=/data/coolify/services/es8w8g0c00og4gsgg0k8w8o8
sudo docker compose --project-directory $SBD -f $SBD/docker-compose.yml \
  -p es8w8g0c00og4gsgg0k8w8o8 up -d --force-recreate --no-deps auth
```

### Admin (and all portals) need `RESEND_API_KEY` at runtime

The admin **application-email** route (`/api/admin/applications/{type}/{id}/email`)
sends via `packages/email`. If `RESEND_API_KEY` is unset in the portal's
container, the send path returns a clean **HTTP 502** (post-hardening
2026-06-23; it used to throw an opaque **500**). The GHCR compose's
`admin-portal` service must list `RESEND_API_KEY: '${RESEND_API_KEY}'` in its
`environment:` block (it has no `env_file`), and the GHCR `.env` / Coolify env
must define it. Same for `UNSUBSCRIBE_TOKEN_SECRET` (unsubscribe-link parity).

> Coolify API note: `PATCH /api/v1/services/{uuid}` requires `docker_compose_raw`
> to be **base64-encoded**; the API is fronted by Cloudflare (large PATCH bodies
> can hit WAF error 1010) — run writes against `http://localhost:8000` on the
> server to bypass it.

### Known follow-up: auth-email links are `http://`

GoTrue derives the mailer link scheme from the **incoming request**, and Kong
forwards the internal hop as `http`, so verify links are
`http://api.patina.cloud/auth/v1/verify?...`. They still work — Traefik 301s to
https, preserving the token + `redirect_to` query (verified). **Setting
`GOTRUE_API_EXTERNAL_URL=https://api.patina.cloud` does NOT fix this** on GoTrue
v2.143.0 (tested + reverted 2026-06-23); the real fix is propagating
`X-Forwarded-Proto: https` through Kong → GoTrue. Cosmetic — deferred.
(Separately: the prod `.env` `API_EXTERNAL_URL` has a stray `/auth/v1/callback`
suffix vs the repo's bare value; harmless while Google OAuth is disabled.)

### Flow test matrix (run after any email change)

Use a monitored inbox; set `EMAIL_DEV_MODE=redirect`+`EMAIL_DEV_REDIRECT_TO`
on edge fns for bulk/cron tests (note: **GoTrue auth emails bypass that**).

| # | Flow | Path | Verify |
|---|------|------|--------|
| 1 | Magic link (client + designer), signup confirm, recovery | GoTrue SMTP | inbox receipt; email `redirect_to` matches the requesting portal |
| 2 | invoice-send, po-send, proposal-send, client-invite | edge → Resend | `notification_log` delivered + inbox |
| 3 | Admin application email (designer/maker, each preset) | route → Resend | HTTP 200, `application_communications` row, inbox |
| 4 | Crons (campaign/automation/price-drop/lead/back-in-stock/decision/invoice/review) | pg_cron → edge | `SELECT invoke_edge_function('<fn>')` + `net._http_response`=200 |
| 5 | resend-webhook (delivered/opened/bounced/complained) | webhook | `notification_log` status + suppression flip |
| 6 | Unsubscribe token | all portals | `UNSUBSCRIBE_TOKEN_SECRET` identical edge+portals; `/api/unsubscribe` resolves |

---

## Deploying

### Edge functions

```bash
./scripts/deploy-edge-functions.sh             # deploy everything
./scripts/deploy-edge-functions.sh campaign    # deploy only campaign-*
```

Needs `supabase link` pointing at the target project.

### In-app messaging functions (added v1.0)

The in-app messaging system (see `docs/prds/in-app-messaging-prd.md`) adds two
edge functions and a Postgres trigger. They must all be deployed together:

```bash
supabase functions deploy comms-notification-dispatch
supabase functions deploy comms-mute --no-verify-jwt
supabase db push                # applies 00105_comms_notification_trigger.sql
```

`comms-mute` runs with `--no-verify-jwt` because it's invoked from email
links by un-authenticated browsers. Authorization is enforced by the
HS256-signed token on the URL (`?t=<jwt>`), verified server-side via
`UNSUBSCRIBE_TOKEN_SECRET`. The same secret is reused — no new env required.

Local dev: `SUPABASE_INTERNAL_FUNCTIONS_CONFIG` is generated by `supabase
start` from the manifest at boot. After adding new function dirs, run
`supabase stop && supabase start` (or accept that the new functions only
register on the next full bring-up).

### Migrations

```bash
pnpm db:push     # push new migrations to the linked Supabase
pnpm db:generate # regenerate TS types after schema changes
```

Critical migration for this system: `00079_cron_schedules.sql` — installs pg_cron
jobs. Re-running is safe (uses `cron.unschedule` → `cron.schedule`).

---

## Verification

After any deploy or secret change, run through this checklist.

### 0. Production health probes (read-only)

These are the commands the 2026-05-12 audit used to confirm the live stack. Run them first after any deploy:

```bash
# Coolify Supabase Stack state
COOLIFY_FQDN='https://coolify.patina.cloud'
COOLIFY_TOKEN=...                                   # from infra/coolify/.env.coolify
curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" "$COOLIFY_FQDN/api/v1/services/es8w8g0c00og4gsgg0k8w8o8" \
  | jq '.applications | map({name, status, image})'

# Direct edge function reachability
ANON_KEY=...                                        # SUPABASE_ANON_KEY from functions container env
curl -sS -X POST "https://api.patina.cloud/functions/v1/campaign-scheduler" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
# Expect: {"dispatched":0,"checked_at":"…"}

# Resend webhook reachable (no apikey by design — Svix sig is the auth)
curl -sS -X POST "https://api.patina.cloud/functions/v1/resend-webhook" \
  -H "Content-Type: application/json" -d '{}'
# Expect: {"error":"Missing webhook signature headers"} HTTP 401

# pg_cron jobs registered + actually firing successfully
ssh kody@192.168.1.14 'sudo -n docker exec -e PGPASSWORD=… db-es8w8g0c00og4gsgg0k8w8o8 \
  psql -U supabase_admin -d postgres -c "
    SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
    SELECT id, status_code, left(content::text,80), created
      FROM net._http_response WHERE created > now() - interval '"'"'30 minutes'"'"' ORDER BY id DESC LIMIT 6;"'
# Expect: 11+ jobs, all active=t, and ALL http_response status_code = 200.
# If any are 401, app.settings.service_role_key is stale — see "Common operations → Refresh pg_cron auth".

# notification_log shows real traffic
ssh kody@192.168.1.14 'sudo -n docker exec -e PGPASSWORD=… db-es8w8g0c00og4gsgg0k8w8o8 \
  psql -U supabase_admin -d postgres -c "
    SELECT type, channel, status, count(*) FROM notification_log
    WHERE created_at > now() - interval '"'"'7 days'"'"' GROUP BY 1,2,3;"'
```

### 1. Resend & domain

```
dig TXT patina.cloud                  # SPF + DMARC present
dig CNAME resend._domainkey.patina.cloud   # DKIM
```

Send a test:

```bash
curl -X POST "https://<project>.supabase.co/functions/v1/notification-dispatch" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "<real-user-id>",
    "type": "order_confirmation",
    "channel": "email",
    "template_id": "order-confirmation",
    "data": {
      "orderNumber": "TEST-001",
      "totalFormatted": "$1,245.00",
      "shippingAddress": "123 Test St",
      "orderUrl": "https://client.patina.cloud/orders/abc"
    }
  }'
```

Check `notification_log`:
```sql
SELECT type, status, provider_id, created_at FROM notification_log
ORDER BY created_at DESC LIMIT 5;
```

### 2. Cron jobs

```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
-- Expect 5 rows, all active = true
```

Force a dry-run of campaign scheduler:
```sql
SELECT invoke_edge_function('campaign-scheduler');
-- Then inspect the HTTP response:
SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
```

### 3. Resend webhook → suppression

Trigger a synthetic bounce in the Resend dashboard (or replay a captured
payload). Expect within 30s:
- `notification_log.status = 'bounced'` on the matching row
- `profiles.email_suppressed = true` (after 2+ hard bounces per 30 days per
  the resend-webhook logic)

### 4. Unsubscribe token parity

The `UNSUBSCRIBE_TOKEN_SECRET` must be identical across:
- Supabase Edge Functions (`supabase secrets list`)
- admin-portal env
- client-portal env
- designer-portal env

Generate a token via the edge function, verify it lands:
```bash
curl -X POST "https://admin.patina.cloud/api/unsubscribe?token=<token>"
# → 200 empty
```

---

## Common operations

### Re-enable a suppressed user

```sql
UPDATE profiles
SET email_suppressed = false,
    email_bounce_count = 0,
    email_complaint = false,
    email_suppressed_at = NULL
WHERE id = '<user-id>';
```

(Or use the admin-portal `/communications/suppressed` UI once Phase 5 ships.)

### Refresh pg_cron auth (when net._http_response shows 401s)

If `net._http_response` shows 401 "Invalid authentication credentials" for cron-triggered invocations, the postgres GUC `app.settings.service_role_key` has drifted from the SUPABASE_SERVICE_ROLE_KEY in the running Kong/functions stack. Fix by realigning the GUC to whatever Kong currently accepts:

```bash
CURRENT_SR=$(ssh kody@192.168.1.14 'sudo -n docker exec functions-es8w8g0c00og4gsgg0k8w8o8 sh -c "echo \$SUPABASE_SERVICE_ROLE_KEY"')
echo "ALTER DATABASE postgres SET app.settings.service_role_key TO '$CURRENT_SR';
ALTER DATABASE postgres SET app.settings.supabase_url TO 'https://api.patina.cloud';" \
  | ssh kody@192.168.1.14 'sudo -n docker exec -i -e PGPASSWORD=… db-es8w8g0c00og4gsgg0k8w8o8 psql -U supabase_admin -d postgres'
```

New sessions (including the next cron tick within 5 min) will use the refreshed value. Do NOT skip the URL line — both GUCs are read by `invoke_edge_function()`.

### Re-trigger a scheduled campaign manually

```sql
UPDATE campaigns SET status = 'scheduled', scheduled_for = now()
WHERE id = '<campaign-id>';
```

The next cron tick (≤5 min) will pick it up. Or invoke directly:
```bash
curl -X POST "https://<project>.supabase.co/functions/v1/campaign-dispatch" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"campaign_id":"<campaign-id>"}'
```

### Replay a Resend webhook locally

```bash
# Capture a payload from the Resend dashboard, then:
curl -X POST "http://127.0.0.1:54321/functions/v1/resend-webhook" \
  -H "svix-id: <id>" \
  -H "svix-timestamp: <ts>" \
  -H "svix-signature: v1,<signature>" \
  -d '<captured body>'
```

Computing a valid signature locally:
```python
import hmac, hashlib, base64
secret = base64.b64decode("whsec_xxx".removeprefix("whsec_"))
payload = f"{svix_id}.{svix_timestamp}.{body}".encode()
sig = base64.b64encode(hmac.new(secret, payload, hashlib.sha256).digest()).decode()
print(f"v1,{sig}")
```

### Rotate RESEND_API_KEY

1. Create a new key in Resend dashboard.
2. `supabase secrets set RESEND_API_KEY=<new>`
3. Update orders service env in Coolify and restart.
4. Send a test via `notification-dispatch` → expect `delivered`.
5. Revoke the old key.

### Rotate UNSUBSCRIBE_TOKEN_SECRET

**Breaking change** — any in-flight unsubscribe links will invalidate. Only
rotate on a planned window, ideally when current tokens have expired (72h
window). Update in lockstep: edge function secret + all three portal env vars.

---

## Deferred / known gaps

These are intentionally out of scope for the current rollout; call them out in
PRs if prioritized:

- **Security-alert trigger** on new-device sign-ins — template exists, trigger
  not wired. Would hook into `auth.audit_log_entries` or a middleware.
- **Project milestone triggers** — decision/milestone inserts don't currently
  fire `client-confirmation` emails. Would mirror the 00042 lead trigger
  pattern.
- **Push + SMS channels** — schema supports them, delivery not implemented.
- **Digest mode batching** — `digest_frequency` is captured, no batching
  worker exists.
- **A/B winner evaluator** — `campaign-dispatch` schedules the intent, no
  evaluator function yet. Covered by Phase 5 of the rollout plan.
