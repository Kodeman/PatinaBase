# End-to-End Local Test — Email & Engagement System

Walk through every moving part of the email system in your local dev stack,
sending real emails via Resend sandbox. ~45 minutes start to finish.

Target audience: you, running this once before a production rollout, and again
after any edge-function or template change.

---

## 0. Pre-flight

Required installed:

- `pnpm`, `docker`, Docker Desktop running
- `supabase` CLI (`brew install supabase/tap/supabase`)
- `deno` — optional, only for the unit test suite (`brew install deno`)
- `stripe` CLI (`brew install stripe/stripe-cli/stripe`)
- A Resend account with a sandbox API key
- One verified email address at Resend (the one you'll send test emails to)

Required secrets to gather:

| Secret | Where to get it |
|---|---|
| `RESEND_API_KEY` | Resend dashboard → API Keys → create one (`re_…`) |
| Your verified email | Same account, under *Domains* → test-mode recipients |

---

## 1. Bring up the stack

```bash
cd /Users/kody/Code/patina-merged
pnpm install
docker compose up -d                 # Redis, MinIO, Mailhog
pnpm supabase:start                  # Postgres, Auth, Realtime, Studio, Edge Fn runtime
supabase status                      # capture the service_role_key from the output
pnpm db:push                         # apply all migrations (includes 00078, 00079, 00080)
pnpm db:generate                     # regenerate database.types.ts
```

Expected after `pnpm db:push`: migrations `00078_seed_email_template_html`,
`00079_cron_schedules`, `00080_ab_variant_stats` listed in the output.

Confirm cron + seed landed:

```bash
docker exec -i $(docker ps --filter "name=supabase_db_" --format "{{.Names}}" | head -1) \
  psql -U postgres -d postgres -c \
  "SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;"
# expect 5 rows

docker exec -i $(docker ps --filter "name=supabase_db_" --format "{{.Names}}" | head -1) \
  psql -U postgres -d postgres -c \
  "SELECT slug, length(html_content) AS h FROM email_templates WHERE html_content != '' ORDER BY slug;"
# expect 10 rows
```

---

## 2. Configure secrets

### 2a. Edge Function secrets

Copy `supabase status` output so you have `service_role_key` and `anon_key`.

Create `/Users/kody/Code/patina-merged/supabase/.env.local`:

```bash
RESEND_API_KEY=re_sandbox_...
RESEND_WEBHOOK_SECRET=whsec_local_test_abcdefghijklmnop
UNSUBSCRIBE_TOKEN_SECRET=local-unsub-secret-32bytes-change-me-abc123
POSTHOG_API_KEY=phc_local_ignored
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<paste from supabase status>
```

### 2b. Postgres GUCs (needed by lead triggers + pg_cron invoker)

Run in the local DB:

```bash
docker exec -i $(docker ps --filter "name=supabase_db_" --format "{{.Names}}" | head -1) \
  psql -U postgres -d postgres <<'SQL'
ALTER DATABASE postgres SET app.settings.supabase_url = 'http://host.docker.internal:54321';
ALTER DATABASE postgres SET app.settings.service_role_key = '<paste service_role_key>';
-- Reconnect to load the new settings:
SELECT pg_reload_conf();
SQL
```

Replace `<paste service_role_key>` inline, then run.

### 2c. Portal env files

For each of `apps/{admin-portal,client-portal,designer-portal}/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste anon_key>
SUPABASE_SERVICE_ROLE_KEY=<paste service_role_key>
UNSUBSCRIBE_TOKEN_SECRET=local-unsub-secret-32bytes-change-me-abc123  # MUST match edge fn value
```

For `services/orders/.env.local` add:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<paste service_role_key>
CLIENT_PORTAL_URL=http://localhost:3002
```

Token parity across edge + all three portals is critical — if this drifts,
unsubscribe tokens will fail verification.

---

## 3. Start edge functions + portals

Terminal 1 — edge functions (single command serves all in `supabase/functions/`):

```bash
cd /Users/kody/Code/patina-merged
supabase functions serve --env-file supabase/.env.local --no-verify-jwt
```

Leave this running. You should see each function log when invoked.

Terminal 2 — portals + orders service (matches `pnpm dev:admin` / `dev:client`):

```bash
pnpm dev:admin     # admin-portal :3001 + orders :3015 + media :3014
```

Or run portals individually in separate terminals:

```bash
pnpm --filter @patina/admin-portal dev       # :3001
pnpm --filter @patina/client-portal dev      # :3002
pnpm --filter @patina/designer-portal dev    # :3000
pnpm --filter @patina/orders dev             # :3015
```

Sanity check: visit http://127.0.0.1:54323 (Supabase Studio), each portal
URL loads, and the edge function terminal shows no startup errors.

---

## 4. Seed a test user

Create one user in Supabase Auth you can receive emails at. In Studio →
Authentication → Users → Add user → enter your Resend-verified email +
password. Note the user UUID.

Set their profile email + `display_name`:

```bash
docker exec -i $(docker ps --filter "name=supabase_db_" --format "{{.Names}}" | head -1) \
  psql -U postgres -d postgres <<SQL
UPDATE profiles
SET email = '<your-verified-email>',
    display_name = 'Test Kody',
    email_suppressed = false
WHERE id = '<user-uuid>';
SQL
```

Export for convenience:

```bash
export TEST_USER_ID=<user-uuid>
export SERVICE_KEY=<paste service_role_key>
export TEST_EMAIL=<your-verified-email>
```

---

## Test 1 — Transactional email via notification-dispatch

Goal: verify edge-function template rendering (Phase 1) + Resend delivery.

```bash
curl -sS -X POST "http://127.0.0.1:54321/functions/v1/notification-dispatch" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "'$TEST_USER_ID'",
    "type": "order_confirmation",
    "channel": "email",
    "template_id": "order-confirmation",
    "data": {
      "orderNumber": "TEST-001",
      "totalFormatted": "$1,245.00",
      "shippingAddress": "123 Test St · San Francisco, CA",
      "orderUrl": "http://localhost:3002/orders/test-001"
    }
  }' | jq
```

Expect:

- Response: `{ "success": true, "notification_id": "…", "provider_id": "…" }`
- Edge function log: one entry for `notification-dispatch` with no error
- Inbox: email arrives titled "Order confirmed — TEST-001" with the rendered
  React-Email-looking template (serif heading, `$1,245.00` visible, CTA button)
- DB check:

  ```sql
  SELECT type, status, template_id, provider_id FROM notification_log
  WHERE user_id = :user_id ORDER BY created_at DESC LIMIT 3;
  ```

  top row: `status = 'delivered'`, `provider_id` populated.

Repeat for a second template to confirm interpolation works across shapes:

```bash
curl -sS -X POST "http://127.0.0.1:54321/functions/v1/notification-dispatch" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "'$TEST_USER_ID'",
    "type": "price_drop",
    "channel": "email",
    "template_id": "price-drop",
    "data": {
      "productName": "Walnut Credenza",
      "oldPriceFormatted": "$4,200",
      "newPriceFormatted": "$3,360",
      "percentOff": 20,
      "productUrl": "http://localhost:3002/products/credenza-01",
      "productImageTag": ""
    }
  }'
```

Fail signals:

- Response `reason: "email_suppressed"` → your user's `email_suppressed` = true
- Response `error: "RESEND_API_KEY not configured"` → `supabase/.env.local` isn't
  being picked up; check `supabase functions serve` was restarted after edits
- Email arrives but looks generic → seed didn't apply; re-run migration 00078
- Interpolation leaves `{{var}}` visible → the `data` key didn't match the
  placeholder name; check case + spelling

---

## Test 2 — Campaign dispatch (A/B, UTM, unsubscribe)

Goal: Phase 1 + 3 integration — rendered template in the campaign path,
unsubscribe link, UTM parameters, A/B split into `notification_log`.

1. Admin-portal → http://localhost:3001/communications/audiences/new →
   name "Test cohort", add condition `role eq admin` (or whatever matches your
   test user). Save. Note the resulting segment UUID.

2. Create a campaign via SQL so we can exercise A/B without the wizard:

   ```sql
   INSERT INTO campaigns (
     name, subject, template_id, template_data, audience_type,
     audience_segment_id, status, ab_enabled, ab_subject_b, ab_split_pct
   ) VALUES (
     'E2E Smoke',
     'Test A: new arrivals',
     'campaign-product-launch',
     '{"headlineText":"New arrivals","bodyText":"Pieces just in.","ctaText":"Shop","ctaUrl":"http://localhost:3002/shop","products":[]}'::jsonb,
     'segment',
     '<your-segment-uuid>',
     'draft',
     true,
     'Test B: pieces worth the wait',
     50
   ) RETURNING id;
   ```

   Note the returned campaign UUID.

3. Trigger dispatch:

   ```bash
   curl -sS -X POST "http://127.0.0.1:54321/functions/v1/campaign-dispatch" \
     -H "Authorization: Bearer $SERVICE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"campaign_id":"<campaign-uuid>"}' | jq
   ```

Expect:

- Response: `{ "success": true, "recipients": 1 }`
- Inbox: a single email with subject matching either variant A or B (random)
- Open the email → CTA URL has `?utm_source=patina&utm_medium=email&utm_campaign=e2e-smoke&utm_content=variant_a` (or `_b`)
- Footer contains an Unsubscribe link to `http://localhost:3001/api/unsubscribe?token=…`
- View source → `List-Unsubscribe` header set to the same URL
- DB check:

  ```sql
  SELECT metadata->>'ab_variant', status, provider_id FROM notification_log
  WHERE metadata->>'campaign_id' = '<campaign-uuid>';
  ```

  one row with `ab_variant` = 'a' or 'b'.

---

## Test 3 — Unsubscribe (GET redirect + one-click POST)

Goal: Phase 3 — public unsubscribe page + RFC 8058 compliance.

Grab the unsubscribe URL from the email you just received. Then:

```bash
# Copy the token= value from the email's unsubscribe link
export UNSUB_TOKEN="<paste>"

# One-click POST (what Gmail/Outlook do on "Unsubscribe" button)
curl -i -X POST "http://localhost:3001/api/unsubscribe?token=$UNSUB_TOKEN"
# expect: HTTP/1.1 200 OK, empty body
```

Then open in a browser:
```
http://localhost:3001/api/unsubscribe?token=<UNSUB_TOKEN>
```
→ redirects to `/preferences/unsubscribe?status=applied&type=…`
→ renders confirmation page.

DB check:
```sql
SELECT channels_email, type_product_launch FROM notification_preferences
WHERE user_id = '<your-user-id>';
```
For a product-launch campaign, `type_product_launch` should now be `false`.

Re-dispatch the same campaign (set `status='draft'` first). Expect `recipients: 0`
— the preference filter in `campaign-dispatch` now excludes this user.

Invalid token test:
```bash
curl -i -X POST "http://localhost:3001/api/unsubscribe?token=not-a-real-token"
# expect: HTTP/1.1 400 Bad Request, body { "error": "invalid" }
```

---

## Test 4 — Authenticated preference center

Goal: Phase 3 — per-user settings UI with auto-save + RLS isolation.

1. Sign in to client-portal (http://localhost:3002) as your test user.
2. Navigate to `/settings/notifications`.
3. Expect: preference center renders with toggles populated from your row
   (or defaults if the unsubscribe seeded it).
4. Toggle `type_weekly_inspiration` off → status shows "Saved …".
5. Refresh page → toggle persists.

RLS spot-check: create a second test user (different UUID), sign in as them,
visit `/settings/notifications` — their toggles are independent. Confirm in DB:

```sql
SELECT user_id, type_weekly_inspiration FROM notification_preferences
ORDER BY updated_at DESC LIMIT 5;
```

---

## Test 5 — Orders service → transactional emails via Stripe

Goal: Phase 2 — orders webhook fires order-confirmation + payment-receipt.

1. Terminal: `stripe listen --forward-to localhost:3015/webhooks/stripe` —
   copy the printed `whsec_…` and set `STRIPE_WEBHOOK_SECRET` in
   `services/orders/.env.local`. Restart orders service.

2. You need a seeded order with your test user's ID. In the orders DB:

   ```sql
   INSERT INTO "Order" (
     id, "orderNumber", "userId", status, "paymentStatus",
     subtotal, "taxTotal", "shippingTotal", total, currency,
     "paymentIntentId", "createdAt", "updatedAt"
   ) VALUES (
     gen_random_uuid(), 'E2E-0001', '<your-user-id>', 'pending', 'authorized',
     1000.00, 0, 0, 1000.00, 'USD',
     'pi_test_e2e_0001', now(), now()
   );
   ```

3. Simulate Stripe success:
   ```bash
   stripe trigger payment_intent.succeeded \
     --override payment_intent:id=pi_test_e2e_0001 \
     --override payment_intent:amount=100000
   ```

4. Expect in orders service log: `Payment intent succeeded: pi_test_e2e_0001`,
   followed by no errors from `NotificationDispatchClient`.

5. Expect two entries in `notification_log` — one `order_confirmation`, one
   `payment_receipt` — both `status='delivered'`.

6. Inbox: two emails. Confirm `{{orderNumber}}` → `E2E-0001`.

Fail signals:

- Orders service warns "notification-dispatch not configured" →
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` missing from its `.env.local`
- No email fires but log shows 200 → edge function rendered the generic
  fallback; check migration 00078 applied

---

## Test 6 — Lead trigger → designer + client emails

Goal: Phase 2 — the pg_net-based lead trigger from migration 00042 hits
notification-dispatch and emails both parties.

Prereq: GUCs from step 2b must be set (triggers fail silently if
`app.settings.supabase_url` is null — you'll see the migration's `RAISE WARNING`
in the Postgres log instead of an email).

Create two users — one "homeowner" and one "designer" — set their emails to
two different verified Resend recipients. Then:

```sql
INSERT INTO leads (
  id, homeowner_id, designer_id, project_type, budget_range, timeline,
  location_city, location_state, match_score, match_reasons,
  response_deadline, created_at
) VALUES (
  gen_random_uuid(), '<homeowner-id>', '<designer-id>',
  'Full living room', '$15k-$25k', '3 months',
  'San Francisco', 'CA', 87, ARRAY['style match', 'budget fit'],
  now() + interval '24 hours', now()
);
```

Expect:

- Designer inbox: "New lead: {homeowner name} is interested"
- Homeowner inbox: "Your Patina consultation request is confirmed"
- Two `notification_log` rows (one `new_lead_designer`, one `client-confirmation`)

If no email fires, inspect `net._http_response` for the stored result of the
trigger's HTTP call:

```sql
SELECT id, status_code, content FROM net._http_response
ORDER BY id DESC LIMIT 5;
```

---

## Test 7 — Resend webhook → suppression

Goal: Phase 4 — verify `resend-webhook` accepts signed payloads and writes
bounce state.

Computing a valid Svix signature locally is fiddly. Easiest path: in the
Resend dashboard → Webhooks → your webhook → *Send test event* → pick
`email.bounced`. Point the webhook at your local via `supabase functions serve`
tunnelled through ngrok or similar, OR skip this step and rely on Test 8
(Resend sandbox will deliver real events from real sends).

If you want to replay a captured event locally, use the Python snippet in
`infra/runbooks/email-ops.md` to compute the signature.

Expect on a bounce event:

- `notification_log.status = 'bounced'` on the matching row
- `profiles.email_suppressed = true` if the user crosses the 2-bounce threshold

---

## Test 8 — Admin dashboards

Goal: Phase 5 — per-variant A/B stats and suppression UI.

1. http://localhost:3001/communications/campaigns/<campaign-uuid-from-test-2>
   — expect the A/B card showing both variants with sent/open/click/CTR.
   (Opens/clicks will be 0 until webhook events arrive.)

2. To populate stats manually for verification:

   ```sql
   UPDATE notification_log SET opened_at = now(), status = 'opened'
   WHERE metadata->>'campaign_id' = '<campaign-uuid>' AND metadata->>'ab_variant' = 'a';
   UPDATE notification_log SET clicked_at = now(), status = 'clicked'
   WHERE metadata->>'campaign_id' = '<campaign-uuid>' AND metadata->>'ab_variant' = 'a';
   ```

   Refresh the campaign page — variant A's Open/Click/CTR should update.

3. Suppressed page: http://localhost:3001/communications/suppressed — after
   Test 7 (or after running the UPDATE below to simulate):

   ```sql
   UPDATE profiles SET
     email_suppressed = true,
     email_suppressed_at = now(),
     email_bounce_count = 2
   WHERE id = '<user-id>';
   ```

   Should list the user. Click *Unsuppress* → row disappears and
   `email_suppressed = false`.

---

## Test 9 — pg_cron scheduler dry-run

Goal: Phase 4 — confirm the cron invoker reaches the edge function.

```sql
SELECT invoke_edge_function('campaign-scheduler');
-- then:
SELECT id, status_code FROM net._http_response ORDER BY id DESC LIMIT 1;
-- expect: status_code = 200
```

If `status_code` is NULL → the edge function runtime isn't listening on
`host.docker.internal:54321` from inside the DB container. Fix: confirm
`supabase functions serve` is running and `app.settings.supabase_url` uses
`host.docker.internal`, not `127.0.0.1`.

---

## Tear-down

```bash
docker compose down
pnpm supabase:stop
# Ctrl-C the functions serve + portal dev terminals
```

`.env.local` files are gitignored; leave them for next run.

---

## Troubleshooting quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `"email_suppressed"` response | User has `profiles.email_suppressed = true` | `UPDATE profiles SET email_suppressed=false WHERE id=…` |
| Generic-looking email instead of branded | Seed migration 00078 not applied | `supabase db push` (or re-run the migration manually) |
| `{{var}}` visible in email | Data key didn't match placeholder | Check exact casing (`orderNumber` vs `orderNumer`) |
| Token "invalid" on unsubscribe | Secret drift between edge + portal | Confirm `UNSUBSCRIBE_TOKEN_SECRET` identical everywhere |
| Lead trigger fires but no email | GUCs not set | Re-run step 2b, reload connection |
| pg_cron job runs but nothing happens | `app.settings.supabase_url` wrong from container | Use `host.docker.internal`, not `127.0.0.1` |
| Orders webhook 200 but no email | `notification-dispatch not configured` warning | Fill `SUPABASE_URL` + service key in `services/orders/.env.local` |
