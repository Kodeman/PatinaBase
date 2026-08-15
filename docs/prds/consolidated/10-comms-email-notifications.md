# Communications, Email & Notifications — As-Built PRD

## 1. Header

**Area**: Communications, Email & Notifications
**Last reconciled**: 2026-07-06

**Per-sub-feature status**:

| Sub-feature | Status |
|---|---|
| Programmatic email + notification dispatch (`notify()` spine, Resend, templates) | Shipped |
| Notification preferences + suppression (bounce/complaint) | Shipped |
| Communications Command Center (admin `/communications/*`) | Shipped |
| Designer-portal Outreach mirror (`/portal/communications/*`) | Shipped (undocumented scope) |
| Campaigns / templates / audiences / automations engine | Shipped |
| A/B testing (subject-line split) | Partial — winner is computed but send-to-remainder is unverified |
| Digest dispatch | Shipped |
| In-app messaging (`comms_threads`/`comms_messages`) | Shipped |
| Push notification channel | Planned (logged as delivered, no real delivery) |
| Durable in-app notification inbox | Planned (client feed is a derived, localStorage-backed shim) |
| SMS dispatch | Shipped code, inert in prod (Twilio creds unset) |
| Engagement-tracking / scoring (`docs/engagement-tracking-plan.md` target state) | Partial — base tables + `calculate_engagement_score()` + funnel views shipped (00037/00038/00107); PostHog→`engagement_events` sync + consumer surfaces unverified |

**Source docs**:
- `docs/prds/communications-command-center-prd.md`
- `docs/prds/in-app-messaging-prd.md`
- `infra/runbooks/email-ops.md`
- `docs/engagement-tracking-plan.md`

## 2. Overview

Patina's "Communications, Email & Notifications" area is really three distinct-but-interlocking subsystems, all Supabase-native:

1. **Programmatic email + notifications** — the plumbing. `@patina/notifications` `notify()` + `@patina/email` React-Email templates render and dispatch transactional/lifecycle email through Resend, logging to `notification_log`, honoring `notification_preferences`, and reacting to Resend delivery/open/click/bounce webhooks. Primary users: the platform itself (triggers, crons, service calls), not a human-facing surface. `infra/runbooks/email-ops.md` is the canonical operations reference.

2. **Communications Command Center** — admin marketing orchestration (campaigns, templates, audiences, automations, analytics, suppression, DLQ, thread audit). Lives in the **admin portal** at `/communications/*`. Primary users: Kody (ops) and Leah (marketing). A partial, self-scoped mirror also exists in the designer portal under "People Room — Outreach."

3. **In-app messaging** — the conversational backbone between designer↔client↔vendor via `comms_threads`/`comms_messages`, with realtime, typing indicators, unread badges, decision-card inlining, and message-arrival email via `notify()`. Surfaces: designer `/portal/messages`, client `/messages`, project coordination threads (The Document Track 5 integration).

All three are built. Subsystems 1 and 3, and the admin Command Center, are on production. The two feeding PRDs (`communications-command-center-prd.md`, `in-app-messaging-prd.md`) and the engagement-tracking plan describe a target state that has since diverged from the shipped code in route namespaces, table/column names, and the template-rendering model — see Section 7.

## 3. As-Built Architecture

### 3.1 Programmatic email + notifications (the `notify()` spine)

- **`packages/notifications/src/notify.ts`** — `notify(ctx, userId, type, data, options)`: resolves per-user preferences, picks channels from a `DEFAULT_CHANNELS` map keyed by `NotificationType`, then enqueues one job per enabled channel.
- **`packages/notifications/src/preferences.ts`** — channel gating (`isChannelEnabled`), maps `email/push/in_app/sms` to `channels_*` columns on `notification_preferences`.
- **`packages/notifications/src/queue.ts`** — `createEdgeFunctionQueue()` is the "queue": it **synchronously invokes the `notification-dispatch` edge function** per job (`supabase.functions.invoke('notification-dispatch')`). There is **no durable queue table** — an inline comment flags Redis/BullMQ as future work.
- Also in the package: `audience.ts`, `ab-test.ts`, `unsubscribe.ts`, `tokens.ts`, `automation-engine.ts`.
- **`packages/email/src/`** — React Email renderer:
  - `send.ts` — send entrypoint.
  - `components/BaseEmailLayout.tsx`, `components/Button.tsx`, `components/ProvenanceBar.tsx`.
  - `block-renderer.ts` + `block-html/` generators: `hero`, `product-card`, `product-grid`, `cta-button`, `maker-spotlight`, `notification`, `divider`, `text-block`, `header`, `footer`, `skeleton`.
  - `templates/*.tsx` (22 templates): `campaign-seasonal`, `campaign-maker-spotlight`, `campaign-reengagement`, `campaign-product-launch`, `founding-circle-update`, `weekly-inspiration`, `weekly-pulse`, `welcome-verification`, `order-confirmation`, `payment-receipt`, `price-drop`, `back-in-stock`, `review-request`, `security-alert`, `new-lead-designer`, `lead-expiring`, `client-confirmation`, `project-activated`, `manufacturer-outreach`, `password-reset`, `in-app-message`, `in-app-message-mention`.

**Edge dispatch/senders (`supabase/functions/`)**:
- `notification-dispatch` — email path is real (via `_shared`); push/in_app jobs are just written to `notification_log` as `delivered` ("actual push integration is future work").
- `resend-webhook` — updates `notification_log` status, emits PostHog `email_*` events + user props, flips `profiles.email_suppressed` on 2 hard / 3 soft bounces per 30d, bumps `campaigns` inline counters.
- `sms-dispatch` — Twilio REST, creds-gated.
- Domain senders: `invoice-send`, `po-send`, `proposal-send`, `proposal-nudge`, `proposal-sign-confirmation`, `decision-reminders`, `decision-resolved-notify`, `review-requests`, `client-invite`, `back-in-stock-check`, `price-drop-check`, `lead-expiration-check`.

### 3.2 Communications Command Center (admin marketing)

- **UI** `apps/admin-portal/src/app/(dashboard)/communications/*`: Hub (`page.tsx`), `campaigns` (list / `new` / `[id]` / `[id]/edit`), `templates` (list / `new` / `[id]`), `audiences` (list / `new` / `[id]`), `automations` (list / `new` / `[id]`), `analytics`, `dlq`, `suppressed`, `threads` (list / `[id]`). Subnav in `components/communications/comms-subnav.tsx`.
- **Email builder** `components/communications/email-builder/*` — block-based drag/drop: `builder-canvas`, `sortable-block`, `block-palette`, `preview-pane`, `props-panel`, per-block `props-forms/*`, `html-editor`.
- **API** `apps/admin-portal/src/app/api/admin/comms/*` (`dashboard`, `analytics`, `audiences` + `estimate` + `preview`, `automations`, `templates` + `preview` + `versions`, `suppressions` + `[userId]/unsuppress`, `dlq` + `[id]/retry` + `bulk-retry`, `threads`) and `app/api/campaigns/*` (`route`, `[id]`, `[id]/send`, `[id]/recipients`, `test-send`). Wizard state in `stores/campaign-wizard-store.ts`. All gated by `verifyAdmin` (admin-domain role) via `lib/admin-api.ts`.
- **Crons** invoke edge fns: `campaign-scheduler`, `automation-processor`, `campaign-dispatch`, `ab-winner-evaluator` (migration 00122), `digest-dispatcher` (migration 00120).
- **Designer mirror** `apps/designer-portal/src/app/(portal)/portal/communications/*` — Hub + campaigns/templates/audiences only (no automations/analytics), scoped `created_by = user.id` via `lib/comms-api.ts` (`verifyDesigner`, no admin gate). Data via `useCommsDashboard`/`useRecentActivity`/`useUpcomingSends`. Not wired into the main designer nav zones — reached from "People Room — Outreach."

### 3.3 In-app messaging

- **Data layer** `packages/supabase/src/hooks/use-comms.ts` — full hook surface: `useThreads`, `useThread`, `useThreadMessages`, `useSendMessage`, `useEditMessage`, `useDeleteMessage`, `useMarkThreadRead`, `useArchiveThread`, `useMuteThread`, `useThreadParticipants`, `useAddParticipant`/`useRemoveParticipant`, `useUnreadCount`, `useThreadRealtime`, `useInboxRealtime`, `useTypingIndicator`, `useQuickReplies`/`useUpsertQuickReply`/`useDeleteQuickReply`, `useStartDirectThread`/`useStartProjectThread`/`useStartVendorBrief`, `useVendorProfiles`, `useMyThreadOverrides`/`useUpdateThreadNotificationPref`, plus **coordination extensions** `useCoordinationItemThread`/`useEnsureCoordinationItemThread` (ties messaging into The Document Track 5). Attachments in `use-comms-attachments.ts`, dashboard in `use-comms-dashboard.ts`.
- **Designer** `/portal/messages` (+ `/[threadId]`), `/portal/clients/[id]/messages`, slide-out `components/portal/messages-panel.tsx`. Nav zone `messages` with subnav scopes (Inbox/Direct/Projects/Vendors/Archived) in `config/navigation.ts`.
- **Client** `/messages` (single `page.tsx`, desktop split / mobile stacked) using the same `@patina/supabase` hooks; `components/messages/{ReadReceipt,ThreadSettingsMenu,MessageAttachmentUploader}.tsx`. The phantom `comms` microservice proxy is retired for messaging — Supabase is the sole data path.
- **Dispatch** `comms-notification-dispatch` edge fn (triggered by migration 00105 on `comms_messages` INSERT) applies eligibility rules (participant, not-sender, not-muted, per-thread notification pref, 5-min read-debounce + 5-min coalesce) then calls `notify()`; `comms-mute` edge fn (`--no-verify-jwt`, HS256 token) powers one-click mute-from-email.

## 4. Data Model

### 4.1 Notifications / email core
- **00040** `notification_preferences` — per-user channel toggles `channels_email`/`channels_push`/`channels_in_app`/`channels_sms`, `digest_frequency`, quiet hours.
- **00041** `notification_log` (id, user_id, type, channel, status, provider_id, template_id, metadata JSONB, error, retry_count, opened_at/clicked_at/sent_at) **+ `profiles` suppression columns**: `email_bounce_count`, `email_suppressed`, `email_suppressed_at`, `email_complaint`. `notification_log` is the single source of truth for delivery state; the admin "DLQ" reads `notification_log WHERE status='failed'`.
- **00042** — lead-notification triggers.
- **00043** — engagement-notification triggers.
- **00120** — digest send-state: adds `notification_preferences.last_digest_sent_at` column (no `notification_digest_state` table despite the migration filename) + digest-dispatcher cron.
- **00123** — email-template frequency caps.
- **00119** — automation trigger watermark.

### 4.2 Campaigns / templates / audiences / automations
- **00044** — `campaigns`, `campaign_analytics` (auto-created via `create_campaign_analytics()` trigger), `automated_sequences`, `sequence_enrollments`; enums `campaign_status`, `audience_type`. Campaign scheduling column is `scheduled_for`.
- **00047** — `campaigns` extended: `content_json`, `audience_segment_id`, `audience_snapshot`, `ab_enabled`/`ab_subject_b`/`ab_split_pct` (10–90)/`ab_winner` (a|b)/`ab_decided_at`, inline counters `sent_count`/`open_count`/`click_count`/`bounce_count`/`unsubscribe_count`, `email_template_id`.
- **00045** — `email_templates`.
- **00051**, **00078** — add/seed `html_content` (rendered/interpolated at send).
- **00125** — template versions.
- **00135** — `proposal_phase_templates`.
- **00046** — `audience_segments`.
- **00124** — audience exclude rules.
- **00048** — automations extended: `sequence_status` enum, `trigger_config` JSONB, `steps_json` JSONB, counters, `sequence_enrollments.step_history`/`next_step_at`.
- **00050** — seeds default sequences.
- **00049** — RPCs `increment_campaign_counter`, `increment_sequence_counter`, `increment_bounce_count`.

### 4.3 In-app messaging (00101–00106, 00116, 00222)
- **00101** — `comms_threads` (kind `direct`|`project`|`vendor_brief`|`support`, `project_id`/`proposal_id` FKs, deferred cardinality CONSTRAINT trigger requiring exactly 2 participants for `direct`/`vendor_brief`), `comms_thread_participants` (role, `last_read_at`, `archived_at`, `muted_at`, `notification_pref`), `comms_messages` (body ≤16000, `attachments` JSONB ≤4, `reply_to_message_id`, **`decision_id → client_decisions(id)`**, `mentions UUID[]`, `system`), `comms_quick_replies`; activity-bump + `updated_at` triggers; RLS enabled.
- **00102** — RLS policies.
- **00103** — RPCs (start-direct/vendor-brief, mark-thread-read).
- **00104** — backfill from legacy `client_messages`.
- **00105** — notification-dispatch trigger on `comms_messages` INSERT.
- **00106** — `in_app_message` email template rows.
- **00116** — `comms-attachments` storage bucket.
- **00222** — additive RLS SELECT policies letting a designer read their own + shared `email_templates` (created_by NULL) and `audience_segments` (is_preset) rows via the anon client (for the People Room Outreach mirror). Named `comms_designer_read` but touches only marketing tables, not `comms_*` threads.

### 4.4 Engagement / identity (`docs/engagement-tracking-plan.md`)
- **00036** — `waitlist` (UTM/attribution).
- **00037** — `engagement_events` + profile extensions.
- **00039** — `handle_new_user` waitlist→profile sync.
- **00145** — waitlist CRM extension.

### 4.5 Domain notification triggers
- **00151** — `procurement_notifications`.
- **00173** — `decision_notifications`.
- **00174** — decision_resolved email + overdue cron.
- **00220** — `coordination_notifications`.

### 4.6 Crons (`invoke_edge_function`)
- **00079** — campaign-scheduler, automation-processor, price-drop, lead-expiration, back-in-stock.
- **00092**, **00098**, **00174** — decision-related crons.
- **00096** — review-requests.
- **00120** — digest-dispatcher.
- **00122** — ab-winner-evaluator.
- **00181** — invoice-reminders.
- **00189** — procurement crons.
- **00193**, **00206** — pulses/milestones.

### 4.7 RLS notes
- `comms_threads`/`comms_thread_participants`/`comms_messages` have RLS enabled (00101/00102); designer↔client cross-party reads are governed by the 00102 participant-row policies. (00222 is unrelated — it only opens SELECT on `email_templates`/`audience_segments` for the designer Outreach mirror.)
- `notification_preferences`/`notification_log` are per-user scoped (standard `auth.uid()` ownership pattern); no unusual RLS notes beyond the suppression columns living directly on `profiles`.

## 5. API / Edge / Service Surface

### 5.1 Edge functions (`supabase/functions/`)
- **Dispatch/render**: `notification-dispatch` (email real; push/in_app logged as delivered, not truly delivered; sms not handled here), `sms-dispatch` (Twilio, creds-gated), `resend-webhook` (`--no-verify-jwt`, Svix-signed; updates status + PostHog + suppression + campaign counters).
- **Campaign engine**: `campaign-scheduler`, `campaign-dispatch`, `ab-winner-evaluator`, `automation-processor`, `digest-dispatcher`.
- **Messaging**: `comms-notification-dispatch`, `comms-mute` (`--no-verify-jwt`, HS256 token).
- **Domain senders**: `invoice-send`, `invoice-reminders`, `po-send`, `proposal-send`, `proposal-nudge`, `proposal-sign-confirmation`, `decision-reminders`, `decision-resolved-notify`, `expire-decisions`, `review-requests`, `client-invite`, `back-in-stock-check`, `price-drop-check`, `lead-expiration-check`.
- Shared helpers: `_shared/send-email.ts`, `_shared/render-template.ts`, `_shared/comms-token.ts`.

### 5.2 Admin portal Next API routes
- `app/api/admin/comms/*`: `dashboard`, `analytics`, `audiences` (+ `estimate`, `preview`, `[id]`), `automations` (+ `[id]`), `templates` (+ `[id]`, `[id]/preview`, `[id]/versions`), `suppressions` (+ `[userId]/unsuppress`), `dlq` (+ `[id]/retry`, `bulk-retry`), `threads` (+ `[id]`).
- `app/api/campaigns/*`: `route`, `[id]`, `[id]/send`, `[id]/recipients`, `test-send`.
- All admin-gated via `verifyAdmin` (service-role client, server-side).

### 5.3 Designer portal Next API routes
- Outreach CRUD is `verifyDesigner`-gated (any authenticated user; no admin-domain role) and self-scoped to `created_by` via `lib/comms-api.ts`: campaigns under `app/api/campaigns/*` (`route`, `[id]`, `[id]/send`); audiences + templates (+ `dashboard`) under `app/api/admin/comms/*` (designer-scoped copies of the admin routes).
- Messaging threads under `app/api/comms/v1/threads/*` (`[id]`, `[id]/messages`, `[id]/read`) — this path is messaging, not outreach.

### 5.4 Postgres RPCs
- Campaign counters: `increment_campaign_counter`, `increment_sequence_counter`, `increment_bounce_count` (00049).
- Messaging: start-direct/vendor-brief, `rpc_mark_thread_read` and friends (00103); coordination-thread ensure RPC (The Document Track 5).
- Cron invoker: `invoke_edge_function()` (reads `app.settings.supabase_url` + `service_role_key` GUCs).

### 5.5 Data hooks (`@patina/supabase`)
- Campaigns: `useCampaigns`/`useCampaign`/`useCreateCampaign`/`useUpdateCampaign`/`useSendCampaign`/`useArchiveCampaign`/`useDeleteCampaign`/`useCancelCampaign`.
- Audiences: `useAudienceSegments`/`useAudienceSegment`/`useCreate...`/`useUpdate...`/`useDelete...`/`useEstimateAudienceSize`.
- Comms dashboard/analytics: `useCommsDashboard`, `useCampaignComparison`, `useRecentActivity`, `useUpcomingSends`.
- Prefs: `useNotificationPreferences`; in-app derived feed `useClientNotifications` (+ mark-read).
- Messaging: full `use-comms.ts` surface (see Section 3.3).

## 6. UI Surfaces

### 6.1 Admin portal (Communications Command Center) — `/communications/*`
Hub, Campaigns (list/new/`[id]`/`[id]/edit`), Templates (list/new/`[id]` with block email-builder), Audiences (list/new/`[id]` with rule composer + live estimate/preview), Automations (list/new/`[id]`), Analytics, DLQ (failed-notification retry), Suppressed (unsuppress users), Threads (read-only messaging audit list + `[id]`).

### 6.2 Designer portal
- **Outreach** `/portal/communications/*`: Hub + Campaigns + Templates + Audiences (no automations/analytics), self-scoped; reached via People Room, not a top-level nav zone.
- **Messages** zone: `/portal/messages` inbox (+ subnav scopes Inbox/Direct/Projects/Vendors/Archived via querystring), `/portal/messages/[threadId]`, `/portal/clients/[id]/messages` client-scoped DM, global slide-out peek panel (`messages-panel.tsx`), plus project-embedded coordination threads.

### 6.3 Client portal
- `/messages` — single-page inbox with desktop split-view / mobile stacked; realtime, typing, read receipts, attachment uploader, thread settings (mute/archive/notification pref). No dedicated `/messages/[threadId]` route — thread opens in-page.
- In-app notification feed: **derived** (`useClientNotifications` aggregates decisions/proposals/scope-changes; read state in `localStorage`) — not a true notifications inbox.

### 6.4 Cross-portal
- Preference/unsubscribe surfaces: portal `/api/unsubscribe` + `UNSUBSCRIBE_TOKEN_SECRET` HS256 tokens.
- One-click comms mute from email via `comms-mute` edge function.

## 7. Reconciliation & Gaps

⚠ **Command Center route namespace drift**: PRD §3 specifies `/admin/comms/*`; the code lives at `/communications/*` under the admin `(dashboard)` group (e.g. `/communications/campaigns`, not `/admin/comms/campaigns`).

⚠ **`campaigns` table column names diverge from PRD §8**: actual schema (00044/00047) has `email_template_id` (not `template_id`), `subject` + `ab_subject_b` (not `subject_line`/`subject_line_b`), `ab_split_pct` int 10–90 (not `ab_split` NUMERIC), `scheduled_for` (not `scheduled_at`), and counters `sent_count`/`open_count`/`click_count`/`bounce_count`/`unsubscribe_count` (not `emails_delivered`/`opened`/...).

⚠ **Automation table names differ**: PRD §8 says `automation_sequences` + `automation_enrollments`; actual tables are `automated_sequences` + `sequence_enrollments` (00044/00048).

⚠ **Template rendering model mismatch**: PRD §10 claims templates are React-Email components stored purely as `content_blocks` JSON rendered server-side at send. Actual send path reads `email_templates.html_content` (00051/00078) and interpolates it; the admin block-builder is a hybrid authoring layer over that HTML, not the send-time renderer.

⚠ **`comms_messages.decision_id` FK target documented incorrectly**: references `client_decisions(id)` in code (00101), but the in-app-messaging PRD §9 wrote it as `decisions(id)`.

⚠ **Runbook "Deferred/known gaps" section is stale**: it lists the A/B winner evaluator, digest batching, and SMS delivery as not built — but `ab-winner-evaluator` (+ cron 00122), `digest-dispatcher` (+ cron 00120), and `sms-dispatch` (Twilio, creds-gated) all exist in code. Only push remains truly unbuilt.

⚠ **Client messaging route drift**: messaging PRD §5 lists `/messages/:threadId`; the client portal ships only `/messages` (thread opens in an in-page split view). Designer `/portal/messages/:threadId` does exist as specced.

⚠ **Access-control roles not implemented**: Command Center PRD §4 defines `comms_admin`/`comms_viewer` roles with a permission matrix; the code gates every admin comms route with a single `verifyAdmin` admin-domain check — the granular roles are not implemented.

⚠ **Sender domain drift**: both PRDs reference `notify.patina.design` / `mail.patina.design` / `hello@patina.design`; production actually uses the apex `patina.cloud` (Resend-verified), sender `Patina <hello@patina.cloud>` per the runbook. The `.design` domain references are stale.

⚠ **Undocumented parallel surface**: Command Center is described as "admin-only" per PRD, but a parallel designer-portal outreach surface (`/portal/communications/*`, campaigns/templates/audiences, self-scoped) exists and is documented in neither PRD.

⚠ **No durable queue despite docs implying one**: docs imply a durable queue with "queue depth" monitoring; the actual `notify()` path invokes `notification-dispatch` synchronously (no `notification_queue` table). The admin "DLQ" is just `notification_log WHERE status='failed'`, not a real dead-letter queue.

⚠ **Push channel not implemented**: `notification-dispatch` writes push/in_app jobs to `notification_log` as `delivered` with an inline "actual push integration is future work" note. APNs is deferred to the iOS companion phase (messaging PRD decision 8).

⚠ **No durable in-app notification inbox**: the client `useClientNotifications` feed is derived from `client_decisions`/proposals/scope-changes with read-state in `localStorage` (its own code comment anticipates "a real notifications table"). `notify()`'s `in_app` channel therefore has no first-class consumer surface.

⚠ **Missing edge functions from spec**: `comms-attachment-upload` (messaging PRD §12) does not exist; attachments run through `use-comms-attachments` + the 00116 bucket + signed URLs instead. `comms-vendor-email-gateway` (vendor inbound email) is also absent (v1.1 item, never built).

⚠ **Legacy `client_messages` decommission incomplete**: 00104 backfilled it, but the table was never dropped, and `useClientMessages`/`useSendClientMessage` (reading/writing `client_messages`) are still exported and live in `packages/supabase/src/hooks/use-clients.ts` — PRD §14 steps 4–5 (deprecate + drop) never completed.

⚠ **PostHog revenue-attribution funnels unverified**: `resend-webhook` emits `email_sent`/`opened`/`clicked` + user props to PostHog, but the UTM→purchase attribution funnels, engagement-cohort dashboards, and the analytics "Revenue Attribution" tab (Command Center PRD §9) are aspirational — the admin `/communications/analytics` page exists but the funnel wiring is unverified/unbuilt.

⚠ **A/B "send to remainder" unverified**: `ab-winner-evaluator` computes and writes `ab_winner`/`ab_decided_at` but does not clearly send the winning variant to the held-back remainder audience — the second-batch send is not evidenced in code.

⚠ **Optimal Send Time not built**: Command Center PRD §6.5, "Sprint 5+" feature — not built.

⚠ **Messaging v1.1 backlog unbuilt**: reactions/emoji, per-message digest mode (instant-only today), global cross-thread search (in-thread search only), and read-receipt UI (tracked server-side, hidden in UI per decision 6).

⚠ **Two runbook-flagged trigger gaps still open**: security-alert on new-device sign-in (template exists, trigger unwired) and project-milestone → client-confirmation email (unwired).

⚠ **Engagement-tracking plan: DB layer built, downstream consumers unverified**: `waitlist` (00036), `engagement_events` (00037), `handle_new_user` (00039), the `calculate_engagement_score()` function + `user_engagement_scores` view (00037), and the `conversion_funnel`/`designer_funnel`/`consumer_funnel` role views (00038, `conversion_funnel` fixed in 00107) all exist in the schema. What is NOT verified/built: the PostHog→`engagement_events` sync, any surface that reads the scores/funnels, and iOS/planning-app tracking.

⚠ **SMS inert in prod**: `sms-dispatch` is creds-gated and returns "not configured" unless `TWILIO_*` secrets are set — not configured on prod as of this reconciliation.

## 8. Forward Roadmap / Open Requirements

| Item | Priority |
|---|---|
| Build a real in-app notification inbox (durable per-user table + read state) so `notify()`'s `in_app` channel has a consumer; retire the localStorage-derived client feed | P1 |
| Complete the legacy `client_messages` decommission: remove `useClientMessages`/`useSendClientMessage`, cut over any remaining readers to `comms_*` threads, then `DROP` `client_messages` | P1 |
| Wire and verify PostHog revenue-attribution funnels + engagement-cohort dashboards behind the admin Analytics tab (close the send→purchase loop the Command Center PRD promises) | P1 |
| Implement push delivery (APNs) in `notification-dispatch` for the iOS companion; today push jobs are silently logged as delivered | P2 |
| Finish A/B send-to-remainder in `ab-winner-evaluator` (send winning variant to the held-back audience, not just record the winner) | P2 |
| Wire the two unbuilt triggers from the runbook: security-alert on new-device sign-in and project-milestone → client-confirmation email | P2 |
| Reconcile the two Command Center surfaces (admin `/communications/*` vs designer `/portal/communications/*`) — decide whether the designer outreach mirror is intentional and document/gate it | P2 |
| Add messaging v1.1 items as prioritized: cross-thread search, reactions, `comms-attachment-upload`/vendor inbound email gateway | P2 |
| Configure Twilio secrets in prod (or formally shelve SMS) so `sms-dispatch` is either live or explicitly disabled | P2 |

## 9. Status & Deploy

**On-main**: all migrations through 00254.

The core Communications/Email/Notifications schema (00036–00222: waitlist/engagement, `notification_preferences`/`notification_log` + suppression, campaigns/templates/audiences/automations, `comms_*` messaging, digest + ab-winner crons, procurement/decision/coordination notification triggers) is ≤ 00229, i.e. **all on prod** (prod tip is migration 00229 per project memory; procurement + coordination shipped to prod 2026-06-16, `c224b0e7`).

Edge functions for this area (`notification-dispatch`, `resend-webhook`, `campaign-*`, `automation-processor`, `digest-dispatcher`, `ab-winner-evaluator`, `comms-notification-dispatch`, `comms-mute`, domain senders) are deployed per the runbook's live health probes (11+ cron jobs firing).

**Notable NOT-on-prod items**: migrations **00230**/**00231** (proposal watch-view open-count + nudge) and the **proposal-nudge** edge function are on main but not yet deployed to prod (they sit above the 00229 prod tip).

**SMS**: deployed but inert (Twilio secrets unset).
**Push**: unbuilt.

Auth email flows use the separate GoTrue-SMTP path (smtp.resend.com), distinct from the Resend-HTTPS API path used by everything else in this area.

## 10. Superseded Sources

This consolidated PRD supersedes:
- `docs/prds/communications-command-center-prd.md`
- `docs/prds/in-app-messaging-prd.md`
- `docs/engagement-tracking-plan.md`

Retained as a live operational reference (not superseded):
- `infra/runbooks/email-ops.md`
