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

Set up on `notify.patina.cloud` (or the domain you publish in `send.ts` and edge functions):

| Record | Host                 | Value                                                    |
|--------|----------------------|----------------------------------------------------------|
| TXT    | `notify`             | `v=spf1 include:amazonses.com ~all` (exact per Resend)    |
| CNAME  | `resend._domainkey.notify` | (copy from Resend dashboard)                        |
| TXT    | `_dmarc`             | `v=DMARC1; p=quarantine; rua=mailto:dmarc@patina.cloud`  |

Verify: `dig TXT notify.patina.cloud` shows SPF + DMARC; status "Verified" in Resend.

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

## Deploying

### Edge functions

```bash
./scripts/deploy-edge-functions.sh             # deploy everything
./scripts/deploy-edge-functions.sh campaign    # deploy only campaign-*
```

Needs `supabase link` pointing at the target project.

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

### 1. Resend & domain

```
dig TXT notify.patina.cloud            # SPF + DMARC present
dig CNAME resend._domainkey.notify.patina.cloud   # DKIM
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
