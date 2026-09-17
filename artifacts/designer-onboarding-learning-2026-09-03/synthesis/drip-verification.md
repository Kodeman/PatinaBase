# The First Six Weeks — is the founding-designer onboarding drip sending in prod?

**Verdict: SENDING.** Both the "Designer Onboarding" spine (W0 + E2–E10, 10
emails / 10 paired in-app Post notes) and the "Founding Invite" nudge track
(N1/N2) are `status='active'` on Strata, the `automation-processor` cron is
ticking every 5 minutes and getting real 2xx responses from the edge
function, and the two most recently created designer accounts each received
their W0 welcome email + in-app note within the last 36 hours, matching
their enrollment state.

Read-only diagnostics only. No writes were made. Method: `supabase db query
--linked --project-ref bkvcixdmuyejfzcijpdg "<SELECT>"` (per
patina-prod-ops), which routes through the Management API.

---

## 1. Code path (read from repo)

- `supabase/migrations/00294_designer_onboarding_sequence_v2.sql` replaces
  the placeholder `steps_json` on the `automated_sequences` row named
  `'Designer Onboarding'` with the real 10-email spine (`donb_0`..`donb_24`,
  W0 welcome + E2–E10 gated behind `event_occurred` conditions on
  `engagement_events`), and inserts a second `'Founding Invite'` sequence
  (N1 day-3, N2 day-8 nudges). **The migration comment is explicit that it
  never activates either sequence — both seed/stay `status='draft'`,** and no
  later migration in the ledger (`00291`, `00293`, `00310`, `00404`, `00405`,
  or any other) contains an `UPDATE automated_sequences ... SET status =
  'active'` for either name. The only migration-level status flip in the
  whole repo is the one-time `00048` backfill from a legacy `is_active`
  boolean, unrelated to these two rows.
- `00292_designer_onboarding_enrollment.sql` defines
  `enroll_designer_onboarding(p_user_id)`, fired from an `auth.users`
  first-sign-in trigger. It explicitly gates on
  `WHERE name = 'Designer Onboarding' AND status = 'active'` and is a
  documented no-op ("rollout arming gate") if the sequence isn't active.
- `00291_activation_event_bridge.sql` adds `record_activation_event(...)`
  and ten AFTER triggers that write the `engagement_events` rows the drip's
  condition steps read (`project_created`, `first_capture`,
  `proposal_sent`, `design_request_claimed`, `hours_logged`,
  `invoice_sent`, `designer_first_signin`).
- `00293` (+ re-bakes `00310`, `00404`, `00405`) seed the 17 `email_templates`
  rows (T0/N1/N2 invite track, W0/E2–E10 spine, M1–M4 milestones) referenced
  by `template_id` in `steps_json`.
- `supabase/functions/automation-processor/index.ts`: cron-triggered
  (comment says every 5 min), reads `automated_sequences` **filtered to
  `status = 'active'`** (two call sites, lines ~763 and a defensive re-check
  at ~795), advances `sequence_enrollments` through `steps_json`
  (`email`/`wait`/`condition`/`end`), applies compliance gates
  (`notification_preferences`, 24h anti-fatigue spacing, Mon–Fri 08:00–17:00
  America/Chicago send window), sends the email via the shared dispatch
  path, and — new in this wave — fires a paired `in_app` nudge via the
  `notification-dispatch` function using each step's `config.in_app` block
  (the "Post notes").
- `supabase/migrations/00079_cron_schedules.sql` registers the
  `automation-processor` pg_cron job on `*/5 * * * *`, calling
  `invoke_edge_function('automation-processor')`.

**So the code, read alone, only proves the drip is *built* and *armed to
no-op* — activation is not in any migration.** It must have been flipped
live via direct SQL/dashboard/admin action outside the migration ledger.
That live state is what the prod queries below establish.

## 2. Prod facts (Strata, read-only)

**Sequence status:**
```sql
SELECT id, name, status, total_enrolled, total_completed, total_emails_sent, updated_at
FROM public.automated_sequences
WHERE name IN ('Designer Onboarding','Founding Invite');
```
| name | status | total_enrolled | total_completed | total_emails_sent | updated_at |
|---|---|---|---|---|---|
| Designer Onboarding | **active** | 5 | 2 | 22 | 2026-09-02 14:45:07 |
| Founding Invite | **active** | 2 | 2 | 2 | 2026-07-21 20:05:03 |

**Cron job registered + enabled:**
```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'automation-processor';
```
→ `jobid=2, schedule='*/5 * * * *', active=true`.

**Cron ticks, last 30 days** (`cron.job_run_details` — "succeeded" = enqueued only):
```sql
SELECT status, count(*), max(start_time), min(start_time)
FROM cron.job_run_details WHERE jobid=2 AND start_time > now() - interval '30 days'
GROUP BY status;
```
→ 8,640 rows, all `succeeded`, earliest 2026-08-04 15:55, latest 2026-09-03 15:50
(one every 5 min, no gaps evident, but this table alone only proves the
request was enqueued, not delivered — see next).

**Real HTTP result, last 7 days** (`net._http_response` — actual delivery status
across all pg_net-invoked functions, not automation-processor alone):
```sql
SELECT status_code, count(*) FROM net._http_response
WHERE created > now() - interval '7 days' GROUP BY status_code;
```
→ 1,520 × `200`, 12 × `400`. Spot-checked the 400s — all are `price-drop-check`
("Missing product_id" / "Missing required fields"), an unrelated cron job;
none belong to `automation-processor`.

**Sends by template, last 60 days** (`notification_log`, channel-agnostic
`template_id` filter across the full spine + invite track):
```sql
SELECT template_id, status, count(*), min(created_at), max(created_at)
FROM public.notification_log
WHERE template_id IN ('designer-welcome','onboarding-document-model','onboarding-capture',
  'onboarding-library','onboarding-drafting-room','onboarding-open-requests','onboarding-hours',
  'onboarding-books','onboarding-aesthete','onboarding-six-weeks',
  'designer-invite','designer-invite-nudge-1','designer-invite-nudge-2')
  AND created_at > now() - interval '60 days'
GROUP BY 1,2 ORDER BY max(created_at) DESC;
```
All 10 spine templates + all 3 invite-track templates have real sends,
`status='delivered'` (Resend confirmed) or `'sent'`:

| template_id | sends | first_sent | last_sent |
|---|---|---|---|
| designer-welcome (W0) | 8 | 2026-07-13 | 2026-09-02 |
| onboarding-document-model (E2) | 4 | 2026-07-15 | 2026-07-17 |
| onboarding-capture (E3) | 4 | 2026-07-17 | 2026-07-20 |
| onboarding-library (E4) | 4 | 2026-07-20 | 2026-07-23 |
| onboarding-drafting-room (E5) | 4 | 2026-07-23 | 2026-07-27 |
| onboarding-open-requests (E6) | 4 | 2026-07-27 | 2026-07-31 |
| onboarding-hours (E7) | 4 | 2026-07-31 | 2026-08-04 |
| onboarding-books (E8) | 4 | 2026-08-06 | 2026-08-10 |
| onboarding-aesthete (E9) | 4 | 2026-08-12 | 2026-08-17 |
| onboarding-six-weeks (E10) | 4 | 2026-08-24 | 2026-08-27 |
| designer-invite (T0) | 3 | 2026-07-12 | 2026-07-13 |
| designer-invite-nudge-1 (N1) | 1 | 2026-07-16 | — |
| designer-invite-nudge-2 (N2) | 1 | 2026-07-21 | — |

The E10 "Six Weeks" send on 2026-08-27 is a complete 40-day traversal of an
enrollee that started ~2026-07-13/15 (matches `sequence_enrollments`
`status='completed'` count = 2 above).

**Enrolments (`sequence_enrollments`, "Designer Onboarding"):**
```sql
SELECT status, count(*), max(enrolled_at), min(enrolled_at)
FROM public.sequence_enrollments se
JOIN public.automated_sequences seq ON seq.id = se.sequence_id
WHERE seq.name = 'Designer Onboarding' GROUP BY status;
```
| status | count | first_enrolled | last_enrolled |
|---|---|---|---|
| active | 2 | 2026-09-01 15:25 | 2026-09-02 12:44 |
| completed | 2 | 2026-07-13 02:13 | 2026-07-15 02:57 |
| unsubscribed | 1 | 2026-07-12 12:31 | 2026-07-12 12:31 |

Totals sum to 5, matching `total_enrolled=5` on the sequence row.

**Templates all active:**
```sql
SELECT slug, is_active FROM public.email_templates WHERE slug IN (...13 slugs...);
```
→ all 13 rows `is_active = true`.

**In-app "Post" notes** (`notification_log.channel = 'in_app'`, the paired
nudge `sendInAppNudge` fires alongside each email):
```sql
SELECT channel, count(*) FROM public.notification_log
WHERE created_at > now() - interval '60 days' GROUP BY channel;  -- filtered
```
→ 92 `in_app` rows in the last 60 days (vs. 12 counted in the narrower
onboarding-template email slice above, since the in_app count isn't
template-filtered the same way) — the paired in-app dispatch is firing, not
just configured.

## 3. Cross-check: two most recent designer signups

```sql
SELECT p.id, split_part(p.email,'@',2) domain, p.created_at, u.last_sign_in_at
FROM public.profiles p JOIN auth.users u ON u.id = p.id
WHERE p.is_designer = true ORDER BY p.created_at DESC LIMIT 5;
```
Two most recent designer profiles:

| domain | created_at | last_sign_in_at |
|---|---|---|
| middlewest.studio | 2026-09-02 12:36 | 2026-09-02 21:27 |
| patina.cloud | 2026-09-01 14:07 | 2026-09-02 19:36 |

Enrollment + email + in-app state for each (`sequence_enrollments` joined,
`notification_log` filtered by `user_id`):

- **middlewest.studio** designer (id `19e7ae9b…`): enrolled 2026-09-02
  12:44:09, `status='active'`, `current_step=1` (past W0, waiting on the
  E2 gate). `notification_log`: `designer-welcome` sent 2026-09-02
  14:45:05 → delivered 14:45:08 (both `email` and `in_app` channel rows).
- **patina.cloud** account (id `86cdd0aa…`, kody@'s own domain — likely
  internal/test, flagged for that reason): enrolled 2026-09-01 15:25:04,
  `status='active'`, `current_step=1`. `designer-welcome` sent 2026-09-01
  17:30:04 → delivered 17:30:04.926 (email + in_app both present).

Both real signups got their W0 welcome email and in-app Post note within
minutes of the next cron tick after enrollment, and both enrollment rows are
progressing on schedule (`next_step_at` ~2 days out, matching the spine's
`donb_1` wait step).

## What would have to change to turn it on

N/A — it is already on. If it needs to come back off (e.g. to pause during
an incident), the reverse of the undocumented live flip would be:
```sql
UPDATE public.automated_sequences SET status = 'draft'
WHERE name IN ('Designer Onboarding','Founding Invite');
```
(not run — mutation, would need an explicit in-session request; the two
current `active` enrollees would simply stop advancing rather than being
un-enrolled).

## Not independently verified / flagged for live confirmation

- **Who/when flipped `status` to `'active'`** — not in the migration
  ledger; `automated_sequences.updated_at` (2026-09-02 for Designer
  Onboarding, 2026-07-21 for Founding Invite) is the only trace found. No
  audit-log table for this was checked (out of scope of the asked
  evidence) — worth confirming with whoever ran the dashboard/SQL flip that
  it was intentional and not an artifact of an unrelated `UPDATE ...
  SET updated_at = now()` touching the row (e.g. `total_enrolled` bumps do
  update `updated_at` per `00292`'s own logic, but only the RPC touches
  `total_enrolled`/`updated_at`, never `status` — so the `status` value
  itself had to come from a separate write).
- Whether `patina.cloud`-domain enrollee is a real founding designer or an
  internal test account was not resolved (email redacted per instructions,
  domain alone suggests internal).
- Suppression / bounce state (`profiles.email_suppressed`,
  `email_bounce_count`) was not queried per-recipient beyond confirming
  `notification_log.status='delivered'` for the two cross-checked users,
  which already implies non-suppressed delivery.
