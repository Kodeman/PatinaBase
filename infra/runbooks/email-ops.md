# Email operations runbook

The Patina email pipeline has several moving parts. This document describes the failure modes you'll hit, how to diagnose them, and how to recover.

## Architecture summary

```
[ app code / cron ]
        │
        ▼
[ notify() ] ──► [ notification-queue ] ──► [ notification-dispatch ]
                                                        │
                                                        ▼
[ campaign-dispatch ]  ─────────────────────►  [ Resend API ]
                                                        │
                                                        ▼
[ resend-webhook ] ◄─────────  delivered/opened/clicked/bounced
        │
        ▼
[ notification_log + campaign_analytics + profiles.email_suppressed ]
```

Key tables: `notification_log`, `notification_preferences`, `campaigns`, `campaign_analytics`, `audience_segments`, `automated_sequences`, `sequence_enrollments`, `email_templates`, `email_template_versions`, `data_erasure_log`.

Key edge functions: `notification-dispatch`, `campaign-dispatch`, `campaign-scheduler`, `automation-processor`, `digest-dispatcher`, `ab-winner-evaluator`, `resend-webhook`, plus a few domain-triggered (`proposal-send`, `decision-reminders`, `review-requests`, `client-invite`).

Key cron jobs (see `supabase/migrations/00079_cron_schedules.sql`, plus 00120, 00122):
- `*/5 * * * *` — campaign-scheduler, automation-processor
- `0 * * * *`  — price-drop-check, lead-expiration-check, back-in-stock-check
- `15 * * * *` — ab-winner-evaluator
- `0 14 * * *` — digest-dispatcher

## Common incidents

### 1. "Emails aren't going out"

Check in this order:

1. `RESEND_API_KEY` is set on the affected Cloudflare service or in `supabase secrets list`. The per-call check throws if missing.
2. `notification_log` for fresh rows. If status='queued' is piling up, the dispatcher isn't running.
3. `cron.job` table — confirm the relevant job exists and is scheduled.
4. Resend dashboard → Logs. If we sent successfully but the user didn't receive, it's deliverability not orchestration.
5. `EMAIL_DEV_MODE` is **not** set in production. If it is, fix that first.

### 2. Stuck `scheduled` campaigns

`SELECT id, name, scheduled_for, status FROM campaigns WHERE status='scheduled' AND scheduled_for < NOW() - INTERVAL '15 minutes';`

Possible causes:
- `campaign-scheduler` cron is broken — check `cron.job_run_details` for the last run + return code
- `pg_net` requests are getting throttled — view recent rows in `net._http_response`
- `app.settings.supabase_url` / `app.settings.service_role_key` aren't set; the helper function silently returns NULL with a warning

Fix: redeploy the cron migration (`pnpm db:push`), or manually invoke `SELECT invoke_edge_function('campaign-scheduler');` from the SQL editor.

### 3. Resend webhook outages

If opens/clicks/bounces stop updating, `resend-webhook` likely failed.

- Check `RESEND_WEBHOOK_SECRET` matches what's configured in the Resend dashboard.
- Resend dashboard → Webhooks → see recent delivery attempts and status codes.
- Re-trigger a failed event from the Resend UI (hammer icon) to confirm the endpoint is healthy.

If you need to backfill: there's no replay path for webhook events. Best you can do is leave `notification_log` rows in their last-known state and reconcile manually with Resend logs.

### 4. Mass bounce / suppression incident

Symptoms: many users have `profiles.email_suppressed=true` and complaints from designers their leads aren't getting notified.

- Look at `data_erasure_log` to confirm it wasn't a GDPR sweep.
- Look at `notification_log` for high `bounced` and `complained` counts in a narrow time window — usually means a list-import or send to stale addresses.
- The bounce thresholds are `2 hard / 30d` and `3 soft / 30d`. To unblock individuals, use the admin "Suppressed" page (`/communications/suppressed`).
- For mass unsuppress (rare): SQL update with admin sign-off.

### 5. Campaign sent but unsubscribe link 404s

The unsubscribe URL in headers points to `${baseUrl}/api/unsubscribe?token=...`. The `baseUrl` is determined by `unsubscribeBaseUrl` option or `CLIENT_PORTAL_URL` env, defaulting to `admin.patina.cloud`.

If unsubscribe POSTs are returning 404:
- Check the route exists: `apps/admin-portal/src/app/api/unsubscribe/route.ts`
- Check `UNSUBSCRIBE_TOKEN_SECRET` matches between sender (edge fn) and verifier (Next.js portal). Both fall back to `SUPABASE_SERVICE_ROLE_KEY`, so a mismatch only occurs if one side has the explicit secret set and the other doesn't.

### 6. DLQ pile-up

Visit `/communications/dlq`. Each row has the original error. Common patterns:

- **`Resend API 401`** — API key rotated. Update `RESEND_API_KEY`.
- **`No recipient`** — user has no `email`. Cleanup their profile or accept that the lead will not receive email.
- **`global_rate_cap`** — recipient hit the per-hour cap. Adjust `EMAIL_USER_CAP_PER_HOUR` (default 8) if you have a legitimate reason.
- **`email_suppressed`** — user is opted out / bounced. Don't replay; the suppression is correct.

## Send rate limits

| Limit | Value | Where enforced |
|---|---|---|
| Per-recipient per hour (non-transactional) | 8 (env-overridable: `EMAIL_USER_CAP_PER_HOUR`) | `supabase/functions/_shared/send-email.ts` |
| Per-recipient per template | template-defined (`email_templates.frequency_cap_count` × `frequency_cap_window_days`) | `campaign-dispatch` |
| Marketing emails per 7d (legacy default) | 3 | `packages/notifications/src/audience.ts` `getSuppressedUserIds` |
| Resend API rate | 5 req/sec, batch up to 100 emails/call | Resend platform |

To raise a per-recipient cap intentionally (e.g. high-priority project where the designer needs more notifications), override per send by setting `category: 'transactional'` — bypasses the global cap. Use sparingly.

## Adding a new sender domain

See `infra/runbooks/email-domains.md`.

## Local development

See `infra/runbooks/email-local-dev.md`.

## Manual replay path

Failed transactional sends:

```sql
-- Find failed sends in the last 24h
SELECT id, user_id, type, template_id, error
FROM notification_log
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
LIMIT 50;
```

Then either: replay via the admin UI at `/communications/dlq`, or call the retry RPC directly via the `[id]/retry/route.ts` endpoint.

For campaign-level resends, mark the campaign back to `draft` and re-send through the wizard. **Don't** UPDATE `status='scheduled'` directly — the scheduler may pick it up immediately and resend to recipients who already received the original.

## Alerting (today vs aspirational)

Today: nothing automated. The signals you'd want:

- Hourly: count of rows where `notification_log.status='failed'` in last hour > N → page on-call
- Hourly: cron job missed a run window → check `cron.job_run_details`
- Daily: `digest-dispatcher` ran but `sent` count < expected → Slack ping

PostHog is optionally wired (`POSTHOG_API_KEY`) to receive `email_sent / email_opened / email_clicked / email_bounced / email_unsubscribed` events; build alerts there if/when there's appetite.
