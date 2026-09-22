# 03 — Production Evidence: Studio Onboarding & Drop-off

**Lane:** quantitative evidence from production (Strata Supabase + PostHog).
**Date of queries:** 2026-09-22 (all timestamps below are as-of this date).
**Project:** Supabase Cloud "Strata", ref `bkvcixdmuyejfzcijpdg`, PostgreSQL 17.6, `ACTIVE_HEALTHY`.
**Posture:** READ-ONLY. Every statement issued was a `SELECT`. No `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE` was run. No secret value appears in this file.

---

## 0. Access path, and what was blocked

### 0.1 What worked (VERIFIED)

The `patina-prod-ops` skill's preferred read path (Supabase MCP `execute_sql`) is **not available in this session** — `ToolSearch` for `mcp__supabase__*` returned no matching deferred tools. Two fallbacks were tried:

| Path | Result |
|---|---|
| `psql` via `supabase/.temp/pooler-url` | **BLOCKED.** The stored pooler URL carries no password (`fe_sendauth: no password supplied`). The DB password lives in `.env`/`.env.local`, which this session's sandbox denies reading (`EPERM: operation not permitted, open '/Users/kody/Code/patina-merged/supabase/.env.local'`). Not worked around. |
| Supabase **Management API** `POST /v1/projects/{ref}/database/query` with `{"read_only": true}`, authenticated with the already-logged-in Supabase CLI token from the macOS keychain (`security find-generic-password -s "Supabase CLI"`) | **WORKED.** Server-side `read_only: true` enforcement means no statement in this report could have mutated anything even by accident. |

Confirmation the CLI is linked and the account is the right one: `supabase projects list` → `{"ref":"bkvcixdmuyejfzcijpdg","name":"Strata","status":"ACTIVE_HEALTHY","linked":true}` (the only other project, `Patina Plan`, is `INACTIVE`).

> **Housekeeping note for Kody:** the keychain read printed the CLI access token's base64 form into this session's transcript before it could be suppressed. It was never written to any artifact and is not reproduced here, but it is in the transcript — rotate `supabase login` if that matters to you.

### 0.2 What was NOT available (UNAVAILABLE)

- **PostHog MCP.** `mcp__plugin_posthog_posthog__*` exposes only `authenticate` / `complete_authentication` — the server is installed but unauthenticated, and completing OAuth requires the user's browser. I did not start a flow. **Consequence: insight `8IbnORPW` ("Founding Designer Activation (30d)") was not pulled, and last-90-day designer-portal unique users were not pulled.** Memory (`project_client_invite_first_letter_2026_09_08.md`) already lists "PostHog MCP key" as owed to Kody; this lane confirms it is still owed.
- **Per-org PostHog analysis is structurally impossible**, not merely unauthenticated. `docs/analytics/event-conventions.md:105` states verbatim: *"No `posthog.group()` calls anywhere — there is no organization/studio model in PostHog today."* Even with a key, "unique designer-portal users by org" cannot be computed in PostHog. Org-level analysis has to come from Postgres, as it does below.
- Two MCP servers failed to connect this session (`blitz-macos` CONNECT_TIMEOUT, `mobai` ConnectionRefused). Neither is needed for this lane.

---

## 1. The headline: there is almost no production cohort to measure

**VERIFIED.** `select count(*) from organizations` → **5 rows**. All five:

```sql
select o.id, o.name, o.type::text, o.status::text, o.subscription_tier::text,
  to_char(o.created_at,'YYYY-MM-DD'),
  (select count(*) from organization_members m where m.organization_id=o.id),
  (select count(*) from organization_members m where m.organization_id=o.id and m.status::text='active')
from organizations o order by o.created_at;
```

| Studio | Created | Members | Active | Tier | Status |
|---|---|---|---|---|---|
| Middle Studio | 2026-07-12 | 3 | 2 | free | active |
| Kody Kochaver | 2026-07-13 | 1 | 1 | free | active |
| Kody Designer | 2026-07-13 | 1 | 1 | free | active |
| Middle West Studio | 2026-08-03 | 3 | 3 | free | active |
| PROBE-W4-THROWAWAY-STUDIO | 2026-08-31 | 1 | 1 | free | active |

All five are `type = design_studio`, all `subscription_tier = 'free'` — **no studio in production has ever been on a paid tier**. Every one of the five traces to Kody or to Middlewest Studio (`kochaver.com`, `middlewest.studio`, `patina.cloud` seats), plus one explicitly-named throwaway probe studio.

Whole-instance census (single query, all counts VERIFIED as of 2026-09-22):

| Metric | Value |
|---|---|
`auth.users` | 42
… ever signed in (`last_sign_in_at is not null`) | 30
… signed in in last 30d | 20
… signed in in last 90d | 30
`profiles` | 42
… `is_designer = true` | **9**
`designer_applications` | **0**
`founding_designer_applications` | **0**
`designer_prospects` | **0**
`waitlist` | 1
`leads` | 31
`projects` | 28
`proposals` | 45
`invoices` | 42
`studio_contacts` | 3
`project_time_entries` | 89
`engagement_events` (activation milestones) | 32
`sequence_enrollments` | 8
`notification_log` | 400

**The single most important finding in this lane: the "studios come in, get excited, then pop back out" problem cannot currently be quantified from production, because production contains no third-party studio.** There are 9 designer profiles total, 5 studios, and every studio is Kody's or Middlewest's. The problem statement is real, but its evidence base is 1:1 conversation (Leah's network — the acquisition channel VISION.md names), not telemetry. Anyone who presents a funnel percentage from this instance is presenting a sample of one.

What production *can* prove, and does below, is the **mechanical** half: which onboarding machinery is wired, which is mis-wired, what the few real seats actually did, and where in-product work is abandoned.

---

## 2. Per-studio table: "set up but never drove a job" vs "driving jobs" vs "dormant"

**VERIFIED.** Tenancy in this schema is mixed — some tables carry `studio_id`/`organization_id`, most carry `designer_id` (a user). Verified via `information_schema.columns`: `projects` has both `studio_id` and `designer_id`; `invoices` has both; `project_time_entries` has `studio_id` + `user_id`; `leads`, `proposals`, `designer_clients`, `client_discovery`, `proposal_captures` carry only `designer_id`; `products`, `field_captures`, `studio_contacts` carry `studio_id`/`organization_id`. The table below unions active members per org and counts both ways.

| Studio | Created | Active members | Opened a doc | Leads | Clients | Projects (studio_id / designer_id) | Proposals (total / out) | Invoices | Hours | Products | Contacts | Field captures | Last write | **Verdict** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Middle Studio | 2026-07-12 | 2 | 1/3 | 27 | 33 | 26 / 26 | 39 / 20 | 32 | 86 | 1 | 3 | 20 | 2026-09-09 | **driving jobs** (this is the founder's own studio) |
| Kody Kochaver | 2026-07-13 | 1 | 0/1 | 0 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 0 | 0 | 0 | *never* | **set up, never drove a job** |
| Kody Designer | 2026-07-13 | 1 | 0/1 | 0 | 0 | 0 / 0 | 0 / 0 | 0 | 0 | 0 | 0 | 0 | *never* | **set up, never drove a job** |
| Middle West Studio | 2026-08-03 | 3 | 2/3 | 3 | 13 | 1 / 1 | 6 / 1 | 10 | 2 | 0 | 0 | 0 | 2026-09-14 | **driving jobs** (thinly — one project) |
| PROBE-W4-THROWAWAY-STUDIO | 2026-08-31 | 1 | 0/1 | 0 | 0 | 1 / 1 | 0 / 0 | 0 | 0 | 0 | 0 | 0 | 2026-08-31 | **dormant** (named throwaway) |

"Last write" = `max(created_at)` across `projects`, `invoices`, `project_time_entries`, `leads`, `proposals` for that studio's active members.

### 2.1 Per-seat table — the delegation seats are where the drop-off is

This is the more on-thesis cut. VISION.md's customer is *the studio at the moment it adds its first hands*. There are **9 member rows across 5 studios**; three of them are delegated (non-owner) seats with an explicit `staff_role`.

```sql
select o.name, m.role::text, m.status::text, substr(m.user_id::text,1,8),
  split_part(p.email,'@',2), m.staff_role, m.job_title,
  to_char(m.created_at,'YYYY-MM-DD'), to_char(m.joined_at,'YYYY-MM-DD'),
  to_char(m.first_document_opened_at,'YYYY-MM-DD'),
  to_char(u.last_sign_in_at,'YYYY-MM-DD HH24:MI'),
  (select count(*) from auth.sessions s where s.user_id=m.user_id),
  (select count(*) from engagement_events e where e.user_id=m.user_id)
from organization_members m join organizations o on o.id=m.organization_id
left join profiles p on p.id=m.user_id left join auth.users u on u.id=m.user_id
order by o.created_at, m.created_at;
```

| Studio | Role | Status | Seat | Domain | staff_role / title | Invited | Joined | First doc opened | Last sign-in | Live sessions | Activation events | **Verdict** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Middle Studio | owner | active | `74056c2a` | kochaver.com | – / Principal | 07-12 | 07-12 | – | 09-05 14:09 | 0 | 10 | driving |
| Middle Studio | member | **removed** | `4c106571` | gmail.com | bookkeeper / Bookkeeper | 07-15 | *never joined* | – | 07-15 02:57 | 1 | 1 | **never activated, then removed** |
| Middle Studio | member | active | `86cdd0aa` | patina.cloud | **designer** / Designer | 09-01 | 09-01 | 09-04 | 09-03 21:54 | 0 | **1** | **set up, never drove a job** |
| Kody Kochaver | owner | active | `00fd18b2` | gmail.com | – | 07-13 | 07-13 | – | 08-06 10:24 | 0 | 1 | set up, never drove a job |
| Kody Designer | owner | active | `48e1ca60` | gmail.com | – | 07-13 | 07-13 | – | **never** | 0 | 0 | **never signed in** |
| Middle West | owner | active | `ce3aee90` | middlewest.studio | – / Principal | 08-03 | 08-03 | – | **09-22 11:53** | 6 | 6 | driving |
| Middle West | admin | active | `19e7ae9b` | middlewest.studio | **studio_manager** / Studio Manager | 09-02 | 09-03 | 09-09 | **09-22 13:11** | 4 | 7 | **driving — the strongest seat in prod** |
| Middle West | member | active | `1a94f78f` | middlewest.studio | **designer** / Designer | 09-04 | 09-04 | 09-09 | 09-04 17:45 | 2 | 3 | **set up, never drove a job** (dormant 18 days) |
| PROBE studio | owner | active | `386de416` | kochaver.com | – | 08-31 | 08-31 | – | 08-31 15:16 | 0 | 1 | dormant |

**Pattern (VERIFIED on n=3 delegated seats, so directional not statistical):** both invited **designer** seats (`86cdd0aa`, `1a94f78f`) signed in, poked around, opened a document, and never came back — 18 days of silence each. The invited **bookkeeper** seat never accepted at all (`joined_at` NULL, `status = 'removed'`). The one delegated seat that stuck is the **studio_manager** (`19e7ae9b`) — and, as §4 shows, it is the only seat whose first real work landed on **day 0**.

**INFERRED, flagged as such:** with n=3 this is a shape, not a rate. But it is the exact shape Kody described, and it lands on the delegated hands rather than the principal — which is the customer VISION.md names.

### 2.2 Sign-in frequency (VERIFIED with a caveat)

```sql
select …, (select count(distinct date(rt.created_at)) from auth.refresh_tokens rt
           where rt.user_id = p.id::text) as distinct_signin_days, …
from profiles p join auth.users u on u.id=p.id where p.is_designer or p.role in ('designer','super_admin');
```

| Seat | Domain | Distinct sign-in days | First → last token | Days since last sign-in |
|---|---|---|---|---|
`ce3aee90` | middlewest.studio | **26** | 08-03 → 09-22 | 0
`19e7ae9b` | middlewest.studio | **10** | 09-09 → 09-22 | 0
`1a94f78f` | middlewest.studio | 3 | 09-04 → 09-11 | 17
`4c106571` | gmail.com | 1 | 07-15 → 07-15 | 69
`69063af4` | gmail.com | 1 | 07-12 → 07-12 | 72
7 others (incl. `74056c2a`, `86cdd0aa`, `386de416`, `00fd18b2`) | — | 0 rows | — | 16–47 / never

**CAVEAT (important):** `auth.refresh_tokens` is pruned and revoked over time, so `0 rows` does **not** mean "never signed in" — `74056c2a` shows 0 tokens but demonstrably signed in on 09-05. Read this table as a **floor** on return frequency for the seats that do have rows, not as a census. The safe VERIFIED claim: **exactly two seats in all of production have more than three distinct sign-in days, and both are Middlewest.**

---

## 3. The onboarding drip: running, weekly, and indifferent to whether anyone showed up

### 3.1 Sequence inventory (VERIFIED)

```sql
select name, trigger_event, is_active, status, jsonb_array_length(steps_json), total_enrolled,
       total_completed, total_emails_sent, last_triggered_at, created_at from automated_sequences;
```

| Sequence | Trigger | `is_active` | `status` | Steps | Enrolled | Completed | Emails sent | `last_triggered_at` |
|---|---|---|---|---|---|---|---|---|
| Consumer Welcome | account_created | false | **draft** | 6 | 0 | 0 | 0 | null |
| Post-Purchase Follow-up | purchase_completed | false | **draft** | 5 | 0 | 0 | 0 | null |
| Re-Engagement | no_activity | false | **draft** | 7 | 0 | 0 | 0 | null |
| **Designer Onboarding** | account_created | **false** | **active** | 28 | 6 | 2 | 30 | null |
| Founding Invite | designer_invited | **false** | **active** | 8 | 2 | 2 | 2 | null |

**Finding (VERIFIED, and it is a trap):** every sequence has `is_active = false`, yet Designer Onboarding is demonstrably sending mail. The processor filters on the **`status`** column, not `is_active`: `supabase/functions/automation-processor/index.ts:714` (`.eq("status", "active")`) and `:749` (`if (seq.status !== "active")`). `is_active` is dead, stale, and actively misleading — anyone reading the admin surface or the table would conclude the drip is off.

Also dead: `last_triggered_at` is NULL on all five rows despite 30 sends, so "when did this last fire" is unanswerable from the sequence row.

**Also VERIFIED: the `Re-Engagement` sequence — trigger `no_activity`, the one sequence designed for exactly the problem in this brief — is `status = 'draft'` and has never enrolled anyone.** There is no live win-back path in production.

### 3.2 Enrollments (VERIFIED, all 8 rows)

```sql
select s.name, substr(e.user_id::text,1,8), split_part(p.email,'@',2), e.current_step, e.status,
  e.enrolled_at, e.last_email_sent_at, e.next_step_at, e.completed_at, jsonb_array_length(e.step_history)
from sequence_enrollments e join automated_sequences s on s.id=e.sequence_id
left join profiles p on p.id=e.user_id order by e.enrolled_at;
```

| Sequence | Seat | Domain | Step | Status | Enrolled | Next step | Completed | step_history |
|---|---|---|---|---|---|---|---|---|
| Designer Onboarding | `69063af4` | gmail.com | **0** | **unsubscribed** | 07-12 | – | – | 0 |
| Founding Invite | `00fd18b2` | gmail.com | 7 | completed | 07-13 | – | 07-13 | 2 |
| Designer Onboarding | `00fd18b2` | gmail.com | 25 | completed | 07-13 | – | 08-24 | 26 |
| Founding Invite | `48e1ca60` | gmail.com | 7 | completed | 07-13 | – | 07-21 | 8 |
| Designer Onboarding | `4c106571` | gmail.com | 25 | completed | 07-15 | – | 08-27 | 26 |
| Designer Onboarding | `86cdd0aa` | patina.cloud | 13 | active | 09-01 | **09-28** | – | 13 |
| Designer Onboarding | `19e7ae9b` | middlewest.studio | 10 | active | 09-02 | **09-25** | – | 10 |
| Designer Onboarding | `1a94f78f` | middlewest.studio | 7 | active | 09-04 | **09-25** | – | 7 |

**Findings:**

1. **1 of 6 Designer Onboarding enrollees unsubscribed at step 0** (`69063af4`, 2026-07-12) — before the first email advanced. That seat also has exactly one activation event (`designer_first_signin`) and zero of everything else. The only non-Kody-identity designer who ever hit the drip cold, opted out immediately.
2. **The drip runs to completion regardless of activity.** `00fd18b2` and `4c106571` both reached step 25 / `completed` with 26 step-history entries. `4c106571` last signed in 2026-07-15 and created nothing, ever. `00fd18b2` last signed in 2026-08-06 and created nothing, ever. **Both were walked through a full 6-week onboarding curriculum after they had already left.**
3. `86cdd0aa` is at step 13, has received 5 onboarding emails, and has **one** activation event (`designer_first_signin`). Last sign-in 2026-09-03. Next email queued for **2026-09-28** — 25 days after that seat went dark.
4. `last_email_sent_at` is NULL on **all 8 rows** despite 30 recorded sends. Another dead column; per-enrollment send recency is unanswerable from `sequence_enrollments`.

### 3.3 Actual sends (VERIFIED — `notification_log`, `type='welcome_series'`, 68 rows: 57 `delivered` + 11 `sent`)

Most recent 12, showing the live weekly spine:

| Date | template_id | Seat | Domain |
|---|---|---|---|
2026-09-21 | `onboarding-drafting-room` (E5) | `86cdd0aa` | patina.cloud
2026-09-18 | `onboarding-library` (E4) | `19e7ae9b` | middlewest.studio
2026-09-14 | `onboarding-library` (E4) | `86cdd0aa` | patina.cloud
2026-09-11 | `onboarding-document-model` (E2) | `1a94f78f` | middlewest.studio
2026-09-11 | `onboarding-capture` (E3) | `19e7ae9b` | middlewest.studio
2026-09-07 | `onboarding-capture` (E3) | `86cdd0aa` | patina.cloud
2026-09-04 | `designer-welcome` (W0) | `1a94f78f` | middlewest.studio
2026-09-03 | `onboarding-document-model` (E2) | `86cdd0aa` | patina.cloud
2026-09-02 | `designer-welcome` (W0) | `19e7ae9b` | middlewest.studio
2026-09-01 | `designer-welcome` (W0) | `86cdd0aa` | patina.cloud
2026-08-27 | `onboarding-six-weeks` (E10) | `4c106571` | gmail.com
2026-08-24 | `onboarding-six-weeks` (E10) | `00fd18b2` | gmail.com

The 7-day cadence floor from migration `00561_onboarding_drip_state_triggers.sql` is holding (09-07 → 09-14 → 09-21 for `86cdd0aa`).

The state-gating machinery from `00561` is real and correctly configured — it maps E2→`project_created`, E3/E4→`first_capture`, E5→`proposal_sent`, E6→`design_request_claimed`, E7→`hours_logged`, E8→`invoice_sent`, E9→`payment_received` (`supabase/migrations/00561_onboarding_drip_state_triggers.sql:30-40`). It is not skipping E2–E5 for `86cdd0aa` **because that seat genuinely did none of those things** — the gate is working; the seat is gone.

### 3.4 Email engagement: unmeasurable (VERIFIED)

`notification_log` has 400 rows. `count(*) filter (where opened_at is not null)` = **0** and `count(*) filter (where clicked_at is not null)` = **0** — across every one of the 400 rows and every one of the ~60 `type` values. **There is no open/click data in production at all.** Whether any onboarding email has ever been read is unknown and currently unknowable server-side.

Volume by type (top 12, `delivered`+`sent` combined): `welcome_series` 68 · `invoice_reminder` 46 · `invoice_attention` 33 (18 still `queued`) · `proposal_sent` 29 · `new_lead_designer` 26 · `invoice_sent` 23 · `client_invite_letter` 12 · `in_app_message` 12 · `invoice_overdue` 11 · `client_confirmation` 11 · `match_introduction` 10 · `invoice_ar_flagged` 10.

**INFERRED:** the studio-facing mail volume is dominated by **invoice chasing** (`invoice_reminder` + `invoice_attention` + `invoice_sent` + `invoice_overdue` + `invoice_ar_flagged` = 123 rows, ~31% of all notifications), not by onboarding. For a studio that has not yet driven a job, almost none of that traffic is relevant.

---

## 4. Time-to-first-value: the only variable that separates the seats that stayed

**VERIFIED.** `engagement_events` is the server-side activation ledger — written exclusively by DB triggers, not by the client. `supabase/migrations/00291_activation_event_bridge.sql:33-55` defines `public.record_activation_event(uuid, text, jsonb)`, which inserts with a deterministic `posthog_event_id = 'activation:<event>:<user_id>'` and `ON CONFLICT DO NOTHING`, giving first-occurrence-only semantics. Ten AFTER triggers dispatch it. Confirmed in prod: every one of the 32 rows has `posthog_event_id` of exactly that shape.

Days from `auth.users.created_at` to each first milestone:

| Seat | Domain | Signup | first_signin | client_added | project_created | first_capture | proposal_sent | invoice_sent | payment_received | hours_logged |
|---|---|---|---|---|---|---|---|---|---|---|
`74056c2a` | kochaver.com | 07-07 | – | 6 | 9 | 9 | 9 | 8 | 11 | 8
`69063af4` | gmail.com | 07-12 | **0** | – | – | – | – | – | – | –
`00fd18b2` | gmail.com | 07-13 | **0** | – | – | – | – | – | – | –
`4c106571` | gmail.com | 07-15 | **0** | – | – | – | – | – | – | –
`ce3aee90` | middlewest.studio | 08-03 | – | 9 | **32** | 38 | – | 37 | 42 | –
`95b80df2` | gmail.com | 08-12 | – | – | – | 23 | – | – | – | –
`386de416` | kochaver.com | 08-31 | – | – | 0 | – | – | – | – | –
`86cdd0aa` | patina.cloud | 09-01 | **0** | – | – | – | – | – | – | –
`19e7ae9b` | middlewest.studio | 09-02 | **0** | **0** | **0** | – | 2 | 12 | – | **0**
`1a94f78f` | middlewest.studio | 09-04 | **0** | 5 | – | 7 | – | – | – | –

**The cleanest quantitative signal in this lane:**

- **4 of 10 seats with any activation event have `designer_first_signin` and nothing else** (`69063af4`, `00fd18b2`, `4c106571`, `86cdd0aa`). They signed in and never performed a single recordable action. That is the drop-off, in the ledger.
- The one delegated seat still active today (`19e7ae9b`, Studio Manager) did **client + project + hours on day 0** and `proposal_sent` on day 2.
- The one seat that dropped after a promising start (`1a94f78f`, Designer) took 5 days to add a client and 7 to capture — and stopped there.
- The studio principal (`ce3aee90`) took **32 days from signup to first project** and **42 to first payment** — and never sent a proposal (`proposal_sent` never fired for that seat). That seat is nonetheless the most-returning seat in prod (26 distinct sign-in days). **INFERRED:** a principal will keep coming back through a month of no value; a delegated hand will not.

**INFERRED, flagged:** day-0 value correlates with retention in this cohort (n=1 for the positive case). Directionally strong, statistically nothing.

---

## 5. Instrumentation integrity: four verified defects that make drop-off invisible

These matter because every proposal in the next phase will want to be measured, and the current measurement layer would report the wrong answer.

### 5.1 `designer_funnel` reports "Created First Project = 0" while 4 projects were created — event-name mismatch (VERIFIED)

```sql
select * from designer_funnel;
```
| step | count |
|---|---|
| Designer Signups | 10 |
| **Created First Project** | **0** |
| **Client Interaction** | **0** |
| **Active Users (3+ project days)** | **0** |

The view filters `ee.event_name = 'project_create'` (`supabase/migrations/00038_funnel_analysis_views.sql:51,90,92`) and `'client_interaction'` (`:91`). The activation trigger writes **`project_created`** and **`client_added`** (`00291_activation_event_bridge.sql`; confirmed in prod — `select event_name, count(*) from engagement_events group by 1` returns `project_created` 4, `client_added` 4, and **no** `project_create` / `client_interaction` rows at all). **The designer activation funnel in the database is hard-wired to report zero forever.**

### 5.2 `conversion_funnel` reports 4200% conversion and silently drops a step (VERIFIED)

```sql
select * from conversion_funnel;
```
| step | order | users_at_step | prev | conversion % |
|---|---|---|---|---|
| visitor | 1 | 1 | – | – |
| waitlist | 2 | 1 | 1 | 100.00 |
| account_created | 3 | 42 | 1 | **4200.00** |
| active_user | 5 | 4 | 42 | 9.52 |

Step **4** is missing entirely: it filters the same non-existent `'project_create'`/`'product_saved'`/`'room_scan_completed'` names (`supabase/migrations/00107_fix_conversion_funnel_view.sql:59`), returns zero rows, and is dropped by the `GROUP BY`. The `LAG` window then compares `account_created` against `waitlist`, producing 4200%.

### 5.3 Three `profiles` columns built for activity tracking are 100% empty (VERIFIED)

| Column | Non-null / non-zero rows (of 42) |
|---|---|
| `profiles.last_active_at` | **0** |
| `profiles.total_engagement_score` | **0** |
| `profiles.posthog_distinct_id` | **0** |

There is **no server-side "last activity" or engagement-score signal in production**. Recency can only be derived from `auth.users.last_sign_in_at` plus `max(created_at)` across business tables, as done in §2.

`organization_members.first_document_opened_at` is the one milestone column that *is* populated — **3 of 9** member rows (`86cdd0aa` 09-04, `19e7ae9b` 09-09, `1a94f78f` 09-09).

### 5.4 The 2026-07 memory claim, re-verified — half-fixed (VERIFIED)

Memory said funnel steps `product_create` / `project_create` have no call sites. Current state in `apps/designer-portal/src`:

- `project_create` — **now has exactly one call site**: `apps/designer-portal/src/hooks/use-projects.ts:601` → `projectEvents.create({ project_id: result.id })`. Memory is **out of date on this half**.
- `product_create` — **still has zero call sites.** `productEvents.create` is defined at `apps/designer-portal/src/lib/analytics/events.ts:23` and never called; the only `productEvents` call anywhere in the portal is `productEvents.addToProject(piece.id)` at `apps/designer-portal/src/components/document/rooms/piece/add-to-project-sheet.tsx:92`. Memory is **still correct on this half**.
- `clientEvents.create` has one call site (`components/document/people/directory/add-person-sheet.tsx:939`) — note `docs/analytics/event-conventions.md:203` still lists designer `clientEvents` as "dead", so that doc is now stale too.
- `vendorEvents`, `teachingEvents`, `fieldEvents` — **zero call sites each** (grep over `apps/designer-portal/src`, tests excluded).
- **Crucially, none of these are the same stream as §4's `engagement_events`.** `packages/supabase/src/hooks/use-engagement.ts:177` exports `useTrackEngagementEvent()`, the client-side writer for `engagement_events` — and it has **zero callers in any portal** (only re-exported at `packages/supabase/src/hooks/index.ts:1232`). Every one of the 32 activation rows in prod came from the `00291` DB triggers. This is actually the healthy part of the stack: the server-side ledger works precisely because it does not depend on client instrumentation.

---

## 6. In-product abandonment: where studio work stalls *inside* Patina

**VERIFIED.** These are the drop-offs that *are* measurable today, because they are business rows rather than telemetry.

### 6.1 Proposals: 51% never leave draft

```sql
select status::text, count(*), to_char(max(created_at),'YYYY-MM-DD') from proposals group by 1;
```
| status | n | last |
|---|---|---|
| **draft** | **23** | 2026-09-10 |
| accepted | 20 | 2026-09-04 |
| sent | 1 | 2026-08-30 |
| expired | 1 | 2026-09-04 |
| **signed** | **0** | – |

23 of 45 proposals (51%) sit in `draft`. **Zero proposals in production have ever reached `signed`** — the `proposal_signed` activation event fired exactly once, on 2026-07-16, for `74056c2a` (`select event_name, count(*) … ` → `proposal_signed` = 1), so the signature rail has been exercised once, ever.

### 6.2 Invoices: the money rail is the healthiest surface

| status | n |
|---|---|
| paid | **18** |
| sent | 14 |
| draft | 7 |
| void | 3 |

42 invoices, 47 `invoice_payments` rows, 18 paid. **INFERRED:** invoicing is the one loop studios complete — 43% of invoices are paid, versus 0% of proposals signed.

### 6.3 Weekly pulses: 156 unsent drafts, 2 ever sent

```sql
select status, count(*), min(week_of), max(week_of), count(*) filter (where sent_at is not null) from weekly_pulses group by 1;
```
| status | n | first week | last week | actually sent |
|---|---|---|---|---|
| **draft** | **156** | 2026-07-06 | 2026-09-14 | **0** |
| sent | 2 | 2026-07-27 | 2026-08-03 | 2 |

Per designer: `74056c2a` 150 drafts / 21 projects (+2 sent), `386de416` 3 drafts, `ce3aee90` 3 drafts. The `weekly-pulse-drafts-friday` cron (`0 13 * * 5`, active) has manufactured **156 pieces of pending review work over 11 weeks and 2 of them ever went out.** This is the Agent OS "no automated external sends — drafts land `awaiting_review`" rule working exactly as written, and the consequence is a queue nobody drains.

**INFERRED, and directly on the brief:** this is Patina *generating* work for the studio rather than removing it — the opposite of "you won't notice Patina."

### 6.4 Surfaces that have never been used in production, even once (VERIFIED, `count(*) = 0`)

| Table | Rows | What it backs |
|---|---|---|
`studio_touches` | **0** | People-room CRM touch ledger (shipped 2026-09-16) |
`teaching_sessions` | **0** | Designer-Taught Intelligence teaching loop |
`designer_taste_profiles` | **0** | taste profile |
`taste_judgments` | **0** | taste corrections |
`companion_conversations` | **0** | the Companion |
`concierge_orders` | **0** | concierge order rail |
`purchase_orders` | **0** | procurement POs |
`project_review_editions` | **0** | client review editions |
`leah_reviews` | **0** | Leah review loop |
`field_time_reports` | **0** | Field time reporting |

And the thin ones: `project_documents` **6** · `project_reading_marks` **1** · `studio_contacts` **3** · `products` (studio catalog) **23** · `project_ffe_items` **31** · `proposal_items` **19** · `device_push_tokens` **1** · `room_scans` 15 · `field_captures` 20 · `sms_messages` 44 (last 2026-08-19) · `client_decisions` 26 · `agent_tasks` 40.

**INFERRED:** the margin stream — the upside VISION.md names as "first dollar" — has essentially no production footprint: 31 FF&E items, 19 proposal items, 0 purchase orders, 0 concierge orders. Whatever the onboarding fix is, it has not yet had a furniture-sales funnel to feed.

### 6.5 The cron layer is healthy — this is not an infrastructure failure (VERIFIED)

`select jobname, schedule, active from cron.job` → **57 jobs, all `active = true`**, including `automation-processor` (`*/5 * * * *`) and `weekly-pulse-drafts-friday`. `job_runs` over the last 90 days shows every job ending in `succeeded` with a `max(started_at)` of 2026-09-22 for the frequent ones (`fulfillment-intake` 95,971 runs, `stripe-event-processor` 20,663, `morning-brief` 74, `time-nudges` 172). **No failed status appears in any 90-day `job_runs` group.**

One gap: **`automation-processor` writes no `job_runs` rows** — it is absent from the `job_runs` job-name list entirely, so the drip's own run history is invisible. Its output is only inferable from `notification_log` and `sequence_enrollments.step_history`.

### 6.6 Seed data (VERIFIED)

`select count(*) from projects where id::text like '5eed%'` → **2** (`5eed0005` created 2026-05-23, `5eed0006` created 2026-01-28). `profiles` and `organizations` have **0** `5eed%` rows. One `@example.com` profile exists. So the 28-project count includes 2 seed projects; the real number is 26.

---

## 7. Evidence-quality ledger

| Claim class | Status |
|---|---|
Org/member/profile census, all row counts, all status distributions | **VERIFIED** — single read-only `SELECT`s against Strata, 2026-09-22 |
Per-studio and per-seat tables | **VERIFIED** as rows; **the *interpretation* ("designers drop, managers stay") is INFERRED from n=3 delegated seats** |
Drip inventory, enrollments, send log, cadence | **VERIFIED** |
`is_active` vs `status` processor behavior | **VERIFIED** — `automation-processor/index.ts:714,749` |
Funnel-view event-name mismatch, 4200% conversion | **VERIFIED** — view SQL read + prod output compared |
`last_active_at` / `total_engagement_score` / `posthog_distinct_id` all empty | **VERIFIED** |
`opened_at` / `clicked_at` all null across 400 notifications | **VERIFIED** |
`product_create` still uncalled, `project_create` now called | **VERIFIED** by grep over `apps/designer-portal/src` |
Time-to-milestone table | **VERIFIED** as dates; retention correlation **INFERRED** |
PostHog funnel `8IbnORPW`, 90-day designer-portal uniques by org | **UNAVAILABLE** — MCP unauthenticated (OAuth needs the user); and per-org PostHog analysis is structurally impossible (`docs/analytics/event-conventions.md:105`, no `posthog.group()`) |
Anything about real third-party studio behavior | **UNAVAILABLE from production** — no third-party studio exists in Strata |

---

## 8. Implications (evidence only — not proposals)

1. **Any onboarding metric quoted from production today is a sample of Kody plus Middlewest.** The next phase should say so out loud, and should treat Leah's 1:1 conversations as the primary evidence, with production used only for mechanism.
2. **The measurement layer would score any fix wrong.** `designer_funnel` is pinned at zero by an event-name mismatch, `conversion_funnel` prints 4200%, `last_active_at` is never written, and no email has a recorded open. Before-and-after comparison is not currently possible.
3. **The one reliable activation ledger is the DB-trigger one** (`00291`, ten events, `engagement_events`). It works *because* it does not depend on client instrumentation. It is also already wired to the drip's skip gates (`00561`). Anything that needs to know "did this studio actually do the thing" should read it.
4. **The drop-off in the data is concentrated on the delegated designer seat, not the principal** — the exact seat VISION.md's customer definition centers on. The principal tolerated 32 days to first project; both delegated designers left after one session.
5. **Day-0 value is the only thing that distinguishes the retained delegated seat.** `19e7ae9b` did client + project + hours on the day it joined. `1a94f78f` took 5 days and left.
6. **The system currently generates unpaid homework.** 156 unsent weekly-pulse drafts, 23 draft proposals, 18 `queued` invoice-attention notifications, and a 28-step curriculum that keeps arriving weekly after a seat has gone dark. `Re-Engagement` — the one sequence built for dormancy — has never been turned on.
7. **The upside revenue stream has no production footprint** (0 POs, 0 concierge orders, 31 FF&E items), so "hooked" cannot yet mean "transacting furniture"; on today's data the only loop studios complete end-to-end is **invoicing** (18 paid of 42).
8. **Ten whole feature surfaces have zero production rows.** If a studio's first week is meant to feel like time saved, the surfaces it is being taught (library, capture, drafting room, aesthete) are ones nobody in production has yet entered.
