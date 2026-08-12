# Patina Threads — Implementation Spec

**Audience:** Claude Code
**Status:** Draft v1 · 2026-07-15 · Owner: Kody
**Companion:** `Patina-Threads-PRD-v1.md` (requirement IDs `TH-xx` referenced throughout)
**Suggested routing:** `docs/threads-implementation-spec.md` in the strata monorepo

Read the PRD first. This document tells you *how*; the PRD is the authority on *what* and *why*. Where they conflict, the PRD wins — flag the conflict in your handback notes rather than silently choosing.

---

## 0. House rules that bind this build

1. **Modular monolith.** `@strata/threads` is a package, not a service. The only new deployment surface is one Supabase Edge Function (webhook receiver). Everything else runs inside the existing Next.js app and its scheduled jobs.
2. **Edge Function for third-party webhooks.** Twilio callbacks must survive a Proxmox/homelab reboot — they terminate at self-hosted Supabase Edge Functions, which enqueue and return fast. No business logic at the edge beyond validation + STOP/HELP fast-path.
3. **The channel is never the record.** Our Postgres tables are truth; Twilio logs are reconciled against them (TH-62), same posture as Stripe vs. the ledger.
4. **No client-side access to thread tables.** Service-role only; RLS locked down. All UI reads go through server routes.
5. **Deploy** via the established flow: local build → GHCR image → Coolify. Migrations live in `supabase/migrations/`.
6. **Language rule (Round3 canon):** no client-visible copy ever says "AI". Escalation copy says "a person."

## 1. Monorepo placement

```
strata/
├── packages/
│   └── threads/                    # @strata/threads
│       ├── src/
│       │   ├── templates/          # registry + per-template definitions (RCS + SMS twins)
│       │   ├── state/              # prompt state machine, reply parsing (Tier 1)
│       │   ├── send/               # composer, quiet-hours, throttles, idempotency, Twilio client
│       │   ├── inbound/            # event-queue consumer, tier routing, media ingest
│       │   ├── escalate/           # Mission Control + Designer Portal integration
│       │   ├── links/              # short-link creation (slugs, targets)
│       │   ├── consent/            # consent state + audit writes
│       │   └── index.ts
│       └── package.json
├── apps/web/                       # Next.js 15
│   ├── app/t/[slug]/route.ts       # short-link resolver (redirect or render)
│   ├── app/api/internal/threads/…  # server routes for portal/MC surfaces
│   └── jobs/threads-*.ts           # scheduled: queue drain, nudges, reconciliation
└── supabase/
    ├── functions/twilio-inbound/   # Edge Function (Deno) — webhook receiver
    └── migrations/NNN_threads_*.sql
```

## 2. Architecture & data flow

```
                     ┌──────────────────────────────────────────────┐
                     │ Twilio Programmable Messaging                 │
                     │  RCS agent "Patina" + SMS/MMS auto-fallback   │
                     │  Content API (rich templates)                 │
                     └───────▲──────────────────────────┬───────────┘
              outbound send  │                          │ inbound msg + status callbacks
                             │                          ▼
   ┌─────────────────────────┴───────┐   ┌──────────────────────────────────┐
   │ apps/web (Next.js, homelab)     │   │ supabase/functions/twilio-inbound│
   │  @strata/threads send pipeline  │   │  1. validate X-Twilio-Signature  │
   │  scheduled jobs (drain, nudge,  │   │  2. STOP/HELP fast-path reply    │
   │  reconcile)                     │   │  3. INSERT INTO thread_inbound_  │
   └───────────┬─────────────────────┘   │     events  (durable, raw)      │
               │                         └───────────────┬──────────────────┘
               ▼                                          │ (pg NOTIFY / poll)
   ┌───────────────────────────────────────────────────────▼────────────────┐
   │ Postgres (self-hosted Supabase) — SOURCE OF TRUTH                      │
   │ threads · messages · prompts · consent_events · escalations · links   │
   └───────┬───────────────┬───────────────┬───────────────┬───────────────┘
           │               │               │               │
     FF&E schedule   project schedule   Mission Control   Designer Portal
     (approvals)     (windows)          Approval Inbox +  client-record
                                        Run Log           timeline
           │
     Stripe Checkout (Rail A) ──► internal ledger (Stripe reconciled, never trusted as record)
     Cloudflare R2 (inbound media) · PostHog (events) · ML sidecar (Tier 2, Phase 3)
```

## 3. Data model (DDL)

All tables in schema `threads`. `TIMESTAMPTZ` throughout. Enable RLS with a deny-all policy; access via service role only.

```sql
-- 001_threads_core.sql

CREATE SCHEMA IF NOT EXISTS threads;

CREATE TYPE threads.contact_kind AS ENUM ('client','trade');
CREATE TYPE threads.channel      AS ENUM ('rcs','sms','mms');
CREATE TYPE threads.direction    AS ENUM ('outbound','inbound');
CREATE TYPE threads.msg_status   AS ENUM ('queued','sent','delivered','read','failed','received');
CREATE TYPE threads.prompt_status AS ENUM ('open','answered','expired','escalated','cancelled');
CREATE TYPE threads.consent_event AS ENUM ('grant','revoke','regrant','scope_change');
CREATE TYPE threads.escalation_kind AS ENUM ('ops','design','money','distress');
CREATE TYPE threads.escalation_status AS ENUM ('open','claimed','resolved');

-- A phone identity. person_id links to the existing people/users table where known.
CREATE TABLE threads.contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164    TEXT NOT NULL UNIQUE,
  kind          threads.contact_kind NOT NULL,
  person_id     UUID,                      -- FK to core people table (nullable for ad-hoc trade contacts)
  display_name  TEXT,
  company       TEXT,                      -- trade company where relevant
  timezone      TEXT NOT NULL DEFAULT 'America/Chicago',
  rcs_capable   BOOLEAN,                   -- last observed capability; NULL = unknown
  consented     BOOLEAN NOT NULL DEFAULT FALSE,   -- current state (derived cache; audit table is truth)
  opted_out_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One thread per contact per project. TH-10/TH-11: one NUMBER per contact;
-- multiple threads share it, copy labels the context switch.
CREATE TABLE threads.threads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL REFERENCES threads.contacts(id),
  project_id   UUID NOT NULL,              -- FK to core projects
  automation_paused BOOLEAN NOT NULL DEFAULT FALSE,  -- TH-43
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, project_id)
);

CREATE TABLE threads.messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      UUID NOT NULL REFERENCES threads.threads(id),
  direction      threads.direction NOT NULL,
  channel        threads.channel,            -- actual channel used (from Twilio callback)
  template_key   TEXT,                       -- NULL for inbound & manual
  template_version INT,
  body_rendered  TEXT,                       -- SMS text or RCS fallback text as sent / received body
  content_sid    TEXT,                       -- Twilio Content SID when rich
  variables      JSONB,                      -- render vars (audit)
  prompt_id      UUID,                       -- prompt this message opened or answered
  twilio_sid     TEXT UNIQUE,
  status         threads.msg_status NOT NULL DEFAULT 'queued',
  status_at      TIMESTAMPTZ,
  read_at        TIMESTAMPTZ,                -- RCS only; never inferred on SMS (TH-13)
  sent_by        TEXT NOT NULL DEFAULT 'system',  -- 'system' | user id for manual sends (TH-60)
  idempotency_key TEXT UNIQUE,               -- TH-24: trigger+template+contact hash
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON threads.messages (thread_id, created_at);

-- The state machine: every outbound question is a prompt with an expected reply shape.
CREATE TABLE threads.prompts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     UUID NOT NULL REFERENCES threads.threads(id),
  template_key  TEXT NOT NULL,
  status        threads.prompt_status NOT NULL DEFAULT 'open',
  expected      JSONB NOT NULL,   -- see §5 ExpectedReply
  context       JSONB NOT NULL,   -- domain refs: ffe_item_ids, shipment_id, invoice_id, event_id…
  answer        JSONB,
  answered_by_message UUID,
  nudged_at     TIMESTAMPTZ,      -- TH-22: at most one nudge, ever
  expires_at    TIMESTAMPTZ,      -- e.g., reschedule cutoff
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON threads.prompts (thread_id, status, created_at DESC);

-- TH-02: append-only. No UPDATE/DELETE grants; enforce with a trigger raising on both.
CREATE TABLE threads.consent_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL REFERENCES threads.contacts(id),
  event        threads.consent_event NOT NULL,
  source       TEXT NOT NULL,            -- 'onboarding_checkbox' | 'sms_stop' | 'sms_start' | 'admin'
  language_shown TEXT,                   -- verbatim consent copy displayed (TH-02)
  scope        TEXT NOT NULL DEFAULT 'transactional',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE threads.escalations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES threads.threads(id),
  kind         threads.escalation_kind NOT NULL,
  status       threads.escalation_status NOT NULL DEFAULT 'open',
  summary      TEXT NOT NULL,            -- pre-summarized, five-second read (TH-44)
  transcript_from TIMESTAMPTZ NOT NULL,  -- window of messages to attach
  copilot_draft TEXT,                    -- Concierge Copilot suggested reply (ops kind)
  assignee     TEXT,                     -- 'ops' | 'designer:<id>' | 'kody'
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE threads.short_links (
  slug        TEXT PRIMARY KEY,           -- base62, 6–8 chars
  target_kind TEXT NOT NULL,              -- 'gallery' | 'pay' | 'map' | 'doc' | 'runofshow'
  target_ref  JSONB NOT NULL,             -- e.g., {invoice_id} or {prompt_id}
  thread_id   UUID REFERENCES threads.threads(id),
  expires_at  TIMESTAMPTZ,
  hits        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE threads.media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES threads.messages(id),
  thread_id   UUID NOT NULL REFERENCES threads.threads(id),
  r2_key      TEXT NOT NULL,
  content_type TEXT,
  caption     TEXT,
  is_punch_item BOOLEAN NOT NULL DEFAULT FALSE,   -- J6 flag words
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Durable raw inbound log written by the Edge Function BEFORE any processing.
CREATE TABLE threads.inbound_events (
  id          BIGSERIAL PRIMARY KEY,
  twilio_sid  TEXT UNIQUE,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error       TEXT
);
```

Also add `002_threads_rls.sql` (enable RLS, deny-all, service-role bypass) and `003_threads_consent_append_only.sql` (trigger raising exception on UPDATE/DELETE of `consent_events`).

## 4. Template registry

Templates are TypeScript modules under `packages/threads/src/templates/`, registered by key. Each defines the RCS content (mapped to Twilio Content API types), the authored SMS twin (TH-50), the prompt it opens (if any), and its sending policy.

```ts
// packages/threads/src/templates/types.ts
export type QuietClass = 'standard' | 'day_of_logistics';   // TH-20
export type Scope = 'client' | 'trade';

export interface ThreadTemplate<V extends Record<string, unknown>> {
  key: string;                 // e.g. 'selection_batch'
  version: number;
  scope: Scope;
  quiet: QuietClass;
  dailyDecisionBatch?: boolean;      // TH-21 throttle group
  rcs: (v: V) => RcsContent;         // card | carousel | text+chips | webview CTA
  sms: (v: V) => SmsContent;         // 1–2 segments target (TH-54); one link max (TH-53)
  prompt?: (v: V) => ExpectedReply;  // opens a threads.prompts row
  nudge?: { afterReadHrs: 48; afterUnknownHrs: 72; smsTone: 'gentler' };  // TH-22
}

export interface SmsContent { body: string; mediaUrl?: string }
export type RcsContent =
  | { kind: 'text'; body: string; chips?: Chip[] }
  | { kind: 'card'; card: RichCard; chips?: Chip[] }
  | { kind: 'carousel'; cards: RichCard[] }            // max 5 (J3)
export interface RichCard {
  imageUrl?: string; title: string; meta?: string; body: string;
  actions: Array<{ label: string; kind: 'reply'|'url'|'webview'|'map'|'calendar'; value: string; payload?: string }>;
}
export interface Chip { label: string; payload: string }
```

**Reply-payload convention:** every chip/action `payload` is `key.v<version>:<answer_code>` (e.g. `selection_batch.v1:approve:ffe_8231`). Deterministic parsing never guesses.

### v1 template set (build in this order)

| Key | Phase | Journey | Prompt? |
|---|---|---|---|
| `welcome_consent_confirm` | 1 | J1 | no |
| `designer_intro_card` | 1 | J1 | no |
| `milestone_note` | 1 | J2 | no |
| `delivery_confirm_simple` | 1 | J4-lite | yes — yes/no |
| `selection_batch` | 2 | J3 | yes — choice per item |
| `delivery_window` | 2 | J4 | yes — choice + `none_work` |
| `delivery_daybefore` / `delivery_morningof` | 2 | J4 | no / yes (reschedule until cutoff) |
| `payment_request` / `payment_receipt` | 2 | J5 | yes / no |
| `site_card` | 3 | J6 | no |
| `arrival_checkin` | 3 | J6 | yes — onway/late/problem |
| `wrapped_up` / `walkthrough_prompt` | 3 | J6 | yes |
| `quarterly_checkin` | 3 | J7 | yes |

Authored copy for both forms of every template comes from the copy deck (PRD OQ4); ship with placeholder copy marked `// COPY-REVIEW` so Leah's pass is a grep away.

## 5. The prompt state machine (Tier 1)

`ExpectedReply` stored on `threads.prompts.expected`:

```ts
export type ExpectedReply =
  | { type: 'yesno' }                                        // YES/NO/Y/N/1/2 aliases
  | { type: 'choice'; options: Array<{ code: string;        // '1','2','3'… stable for prompt life (TH-52)
        value: string; label: string }>;
      reserved: { code: string; value: 'none_or_human' } }   // TH-52 exit ramp
  | { type: 'freeform_ack' }                                 // any reply closes it (e.g., walkthrough notes)
  | { type: 'media' }                                        // expects photo(s)
```

**Inbound resolution algorithm** (`inbound/resolve.ts`):

1. Normalize body (trim, casefold, strip punctuation). Extract structured payload if the message is a chip/action postback (RCS `payload` field on Twilio inbound).
2. **Global keywords first:** STOP-family → consent revoke path (already fast-pathed at edge; mirror here idempotently). HELP → help template. START → re-consent.
3. Load newest `open` prompt for the thread. If a chip payload names a specific prompt/template version, match that prompt directly (a client may answer yesterday's prompt today — codes stay live, TH-52).
4. Deterministic match against `expected` (codes, YES/NO aliases, chip payloads). On match: write `answer`, mark `answered`, run the prompt's **effect** (below), send confirmation template.
5. No match + Phase < 3: create Tier-3 escalation (kind by heuristics: mentions of money → `money`; else `ops`), send honest-handoff copy. Phase 3+: call ML sidecar Tier 2 (§7); one clarifying question max (track `clarified` in prompt context); then Tier 3.
6. Inbound media: persist to R2 via `media` pipeline regardless of prompt state; caption flag-word scan sets `is_punch_item` and opens an `ops` escalation (J6).

**Prompt effects** are pure functions in `state/effects.ts` mapping an answered prompt to domain writes (TH-61):

| Prompt | Effect |
|---|---|
| `selection_batch` approve | `ffe_schedule` item → approved (actor=contact, ts) |
| `selection_batch` question | escalation kind=`design`, item attached |
| `delivery_window` choice | project schedule event upsert + notify receiver thread + schedule daybefore/morningof sends |
| `payment_request` | none (Stripe webhook is the effect; see §8) |
| `arrival_checkin` onway | timestamp + client-thread notify |
| `wrapped_up` | close visit + enqueue `walkthrough_prompt` |

Effects must be idempotent (answered-twice safe).

## 6. Send pipeline

`send/composer.ts` → `send/gate.ts` → `send/twilio.ts`.

1. **Compose:** render template with vars; create `messages` row (`queued`) with idempotency key = `sha256(trigger_event_id + template_key + contact_id)` — unique index makes duplicates a no-op (TH-24).
2. **Gate:** quiet hours in the contact's timezone (09:00–19:00) unless `quiet='day_of_logistics'` AND contact is a participant of today's scheduled event (TH-20). Decision-batch throttle: templates with `dailyDecisionBatch` coalesce per client per day (TH-21). Held messages get `scheduled_for` and are drained by the scheduled job.
3. **Send:** Twilio Messages API via the Messaging Service SID (RCS sender + SMS fallback attached; Twilio handles capability detection and fallback — do not implement fallback yourself). Rich sends pass `ContentSid` + `ContentVariables`; plain sends pass `Body`. Persist `twilio_sid`.
4. **Status callbacks** (delivered/read/failed) arrive at the edge function → update `status`, `read_at`, and observed `channel`; failures with SMS-final fallback exhausted → ops escalation.
5. **Run Log:** every send emits a `run_log` event (existing Mission Control contract) with template key, contact, channel, trigger (TH-23).

**Nudge job** (`jobs/threads-nudge.ts`, hourly): open prompts where (RCS: `read_at` older than 48h) or (SMS: `created_at` older than 72h and no read data), `nudged_at IS NULL`, not expired → send template's nudge variant once, set `nudged_at` (TH-22).

**Reconciliation job** (daily): pull Twilio message logs for the window, diff against `messages` by `twilio_sid`, surface orphans/mismatches to Mission Control (TH-62).

## 7. ML sidecar contract (Phase 3)

`POST {SIDECAR_URL}/threads/classify-intent`

```json
{ "thread_context": {"scope":"client","open_prompt":"delivery_window"},
  "message": "shoot, saturday just blew up, can we do the following week" }
→
{ "intent": "reschedule", "confidence": 0.91,
  "entities": {"timeframe": "next_week"} }
```

Intents v1: `reschedule | question_about_item | confusion | frustration | off_topic | affirmation | human_request | distress`.
Routing thresholds: `confidence >= 0.80` → resolve/redirect (Tier 2); `frustration|human_request|distress` at any confidence → Tier 3 (TH-42/43; distress also sets `threads.automation_paused`). Everything else → Tier 3.

## 8. Stripe (J5, Rail A only)

- Create Checkout Session server-side against the existing Rail A merchant-of-record flow; success/cancel URLs are branded pages under `patina.cloud`.
- The thread carries only a short link (`target_kind='pay'`) → resolver redirects to the live session (create-on-click so sessions don't expire in the thread).
- Stripe `checkout.session.completed` webhook (existing receiver) → **ledger entry first**, then enqueue `payment_receipt` template. Never mark paid from the thread side; never trust Stripe as the record.
- Every `payment_request` render includes the anti-phishing line verbatim: "We never ask for card details by text."

## 9. Short links

`app/t/[slug]/route.ts`: look up slug → increment `hits` → route by `target_kind`:
`gallery` → server-rendered, login-free, view-only selection page (TH-53: view-complete without login); `pay` → Stripe session redirect (§8); `map` → geo URL; `doc`/`runofshow` → rendered read-only page. Expired → friendly dead-link page with a human contact path. Slugs: crypto-random base62, 7 chars.

## 10. Surface integrations

- **Designer Portal timeline (TH-60):** server route `GET /api/internal/threads/by-project/:projectId` returning messages+prompts merged chronologically; render in the client record using the existing timeline component family. Manual send: `POST …/send-manual` (records `sent_by`, prefixes attribution "Leah at Patina —").
- **Mission Control:** escalations render as Approval Inbox exception cards (existing contract): `summary`, transcript window link, `copilot_draft` as the one-tap suggested action. Ops resolves → optional reply sends through the same pipeline (manual, quiet-hours-exempt for `day_of_logistics` only).
- **Concierge Copilot:** on `ops` escalation creation, enqueue existing copilot draft job with transcript window; write result to `copilot_draft`.
- **Morning Brief:** nightly aggregate (sends, answers, containment, escalations open) via existing brief pipeline.

## 11. PostHog events

`thread_message_sent {template, channel, scope}` · `thread_message_read` · `thread_prompt_answered {template, tier, hours_open}` · `thread_prompt_nudged` · `thread_escalated {kind}` · `thread_approval_completed {items}` · `thread_payment_completed {hours_from_request}` · `thread_optout` · `thread_fallback_sms_used` · `shortlink_hit {kind}`.
Dashboards per PRD §8; grammar-parity = completion rate by channel per template.

## 12. Config

```
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID        # RCS sender + SMS number attached
TWILIO_RCS_AGENT_ID                 # after verification (PRD OQ5 gates this)
THREADS_WEBHOOK_URL                 # edge function URL registered in Twilio
THREADS_QUIET_START=09:00 / THREADS_QUIET_END=19:00
SIDECAR_URL                         # Phase 3
R2_BUCKET_THREADS_MEDIA
```

Edge function verifies `X-Twilio-Signature` against the exact registered URL; reject and log on mismatch. Store no secrets in the DB; media URLs from Twilio are fetched server-side with auth then persisted to R2 (Twilio media URLs expire).

## 13. Phase plan & acceptance criteria

**Phase 0 — Foundations**
- [ ] Migrations 001–003 applied; RLS deny-all verified by a failing anon query test
- [ ] Edge function deployed; signature validation test (valid passes, tampered 403s); STOP fast-path replies < 2s and writes consent revoke
- [ ] Consent checkbox live in onboarding, writing `consent_events` with `language_shown`
- [ ] Twilio: A2P 10DLC registered; RCS agent verification submitted (assets per OQ5) — track externally, code must run SMS-only until approved
- [ ] `welcome_consent_confirm` sends on grant; STOP → no further sends (integration test)

**Phase 1 — Notify & confirm**
- [ ] `milestone_note`, `delivery_confirm_simple` live on the pilot project (OQ8)
- [ ] Quiet hours: message triggered 22:00 local is held and drains at 09:00 (test)
- [ ] Idempotency: replayed trigger produces one message (test)
- [ ] Every send visible in Run Log; reconciliation job green for 7 consecutive days
- [ ] YES/NO and reply-code parsing ≥ 99% on a scripted fixture set

**Phase 2 — Decisions**
- [ ] `selection_batch`: approve on RCS chip AND on SMS "2" writes FF&E approval with actor+ts; question path opens `design` escalation with item ref
- [ ] `delivery_window`: choice writes schedule, notifies receiver thread, schedules daybefore/morningof; `none_work` escalates; reschedule honored until cutoff, refused with friendly copy after
- [ ] `payment_request` → short link → live Checkout → webhook → ledger entry → `payment_receipt` in thread (end-to-end test in Stripe test mode); anti-phishing line present in both channel forms (assert in template tests)
- [ ] Designer Portal timeline renders a seeded thread; manual send attributes correctly
- [ ] One nudge maximum per prompt, ever (test: force 3 nudge-job runs)

**Phase 3 — Two-way field**
- [ ] `site_card` + `arrival_checkin` E2E on a real install; MMS photo lands in R2 linked to project; caption "damage" creates punch escalation
- [ ] Tier-2 wiring: sidecar down → graceful Tier-3 degrade (no dead ends); `frustration` fixture → immediate Tier 3; `distress` fixture → automation_paused + human flag
- [ ] Escalation card in Approval Inbox with Copilot draft; one-tap send works
- [ ] Grammar-parity dashboard live

**Testing posture:** template snapshot tests for both channel forms of every template (chars-per-segment assertion for SMS, TH-54); resolver fixture suite (aliases, stale-prompt answers, gibberish, STOP mid-flow); Twilio calls mocked in unit, one guarded live smoke test against a test number.

## 14. Out of scope (do not build)

Marketing sends of any kind · WhatsApp · maker/manufacturer threads · designer-authored automation · voice · in-thread contract signing (link out only) · any client-side (browser) access to `threads.*` tables · custom RCS/SMS fallback logic (Twilio owns it).

## 15. Flag-don't-decide list for Claude Code

Surface these in handback notes rather than choosing silently: (a) exact existing table/column names for `ffe_schedule`, project schedule events, ledger writes, Run Log, and Approval Inbox contracts — bind to what exists, don't invent parallels; (b) whether Redis or pg `scheduled_for` polling drives the drain job (prefer pg; add Redis only if measured need); (c) short-link domain routing if `patina.cloud` apex isn't served by apps/web; (d) anything where the PRD's requirement IDs and this spec diverge.

---

*End of spec. Requirement traceability: cite `TH-xx` in commits touching gated behavior.*
