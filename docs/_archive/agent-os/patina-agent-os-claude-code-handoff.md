> [!WARNING]
> Historical only. This handoff predates the audited `agent_tasks` roles and current Cloudflare/Supabase Strata operations. Do not execute it; use `AGENTS.md` and `docs/agent-os/agent-roles-runbook.md`.

# Patina Agent OS — Claude Code Build Handoff

**Consumer:** Claude Code, working in the `strata` monorepo
**Owner:** Kody (reviews every PR)
**Companion docs:** `patina-agent-os-cowork-handoff.md` (the Cowork half), `patina-agent-os-handoff-quicksheet.md` (sequencing)
**How to use:** Drop this file at `docs/agent-os/claude-code-handoff.md` in the repo. Open a Claude Code session per work package: *"Read docs/agent-os/claude-code-handoff.md. Execute WP-X. Follow the guardrails. Propose your plan before writing code."* One WP per session, one PR per WP.

---

## 0. Mission context (read once, keep in mind always)

Patina is a three-sided marketplace (homeowners / independent designers / furniture makers) run by a solo founder. This build creates the **Agent OS**: a Supabase-backed task queue that Claude Cowork agents and Claude Code jobs feed, plus a **Mission Control** dashboard in the existing Admin Portal where the founder reviews and approves agent work in a 30–60 min daily window.

**Division of labor (decided, do not revisit):**
- **Claude Cowork** = ideation, research, presentation workflows. It produces artifacts into the SharePoint Ops Inbox library; it never touches the database directly.
- **Claude Code (you)** = builds/maintains the dashboard, runs scheduled headless jobs against Supabase, owns the intake bridge from Cowork's SharePoint inbox into the queue.
- **Humans** = all relationship moments, all external sends, all money movement. Leah (co-founder/advisor) reviews only brand-score cards, budgeted at ~5 seconds each.

**Stack facts:** `strata` monorepo (pnpm workspaces, Turborepo, Next.js 15, React 18, TypeScript, Tailwind). Self-hosted Supabase (Postgres + pgvector), Redis, Cloudflare R2. Deployed on Proxmox via Coolify behind Cloudflare Tunnel (pre-built Docker images pushed to registry; Coolify deploys from image source — do not introduce server-side builds). Stripe Connect Accounts v2. PostHog self-hosted. Backend default = Next.js API routes; Supabase Edge Functions are reserved for Auth hooks, database webhook callbacks, and third-party webhook receivers (e.g., Stripe) where homelab-uptime independence matters.

**North-star metrics the dashboard serves:** liquidity ratio, GMV/designer, take-rate integrity, attach rate (instrumented in WP-3).

---

## 1. Global guardrails (apply to every WP)

1. **Audit before building.** An Admin Portal with a Supabase-mediated Cowork task queue for vendor discovery already exists, alongside tables like `vendor_feeds` and a `product_audit_log` pattern and a Designer Teaching Queue concept. Before any migration, inventory what exists and **extend or generalize it — never build a parallel queue.** Present findings + migration plan for approval before writing DDL.
2. **`service_role` never leaves the server.** Agent-facing credentials are the scoped roles defined in WP-0.2. The Supabase `service_role` key bypasses all RLS (see supabase.com/docs) and must exist only in server-side env.
3. **Agents read broadly, write narrowly.** Agent DB access = read-only role + INSERT into the queue. No agent path may UPDATE/DELETE business tables directly. All mutations to business data flow through approval-gated server actions executed by the app, not the agent.
4. **Everything is audited.** Every queue transition and every approval-gated mutation writes to `audit_log` with actor identity.
5. **The internal double-entry ledger is the source of truth.** Stripe is reconciled against it, never trusted as primary. Any reconciliation code follows this direction.
6. **No customer/designer/maker-facing sends from any automated path.** Drafts only, always `awaiting_review`.
7. **Idempotency everywhere.** Webhooks and job runs must be safely re-runnable (`idempotency_key`, `ON CONFLICT DO NOTHING`, run locks).
8. **Design system compliance.** Dashboard UI uses the Patina system: Playfair Display / Inter / DM Mono; Off-White `#FAF7F2`, Pearl `#E5E2DD`, Clay `#C4A57B`, Aged Oak `#8B7355`, Mocha `#5C4A3C`, Charcoal `#2C2926`; accents Sage/Dusty Blue/Terracotta/Golden Hour. Typography-first, hairline ledger rules, **no box shadows on content**, no card-grid clutter.
9. **Verify fast-moving Anthropic capability claims at build time** against docs.claude.com (docs map: docs.claude.com/en/docs_site_map.md; Claude Code map: docs.anthropic.com/en/docs/claude-code/claude_code_docs_map.md). Cowork/routine behavior, GitHub Action inputs, and plan limits change monthly.
10. **Tests gate merges.** Each WP ships with tests for its state machine / queries / API routes. No green tests, no PR.

**Add to `CLAUDE.md` (repo root) as part of WP-0:**

```md
## Agent OS rules
- Task queue = `agent_tasks` (see docs/agent-os/). Never create parallel queues.
- service_role stays server-side. Agent credentials: agent_reader / agent_writer only.
- No automated external sends. No direct agent writes to business tables.
- Internal ledger > Stripe. Reconcile toward the ledger.
- Dashboard UI follows the Patina design system (no box shadows, ledger rules, Playfair/Inter/DM Mono).
```

---

## WP-0 — Foundations (build first, ~1–2 sessions)

### WP-0.1 · Queue schema

**Goal:** One generalized `agent_tasks` queue that the existing vendor-discovery flow migrates onto.

**Build:**
- Audit the existing vendor task queue (per Guardrail 1). Produce a short migration note: keep / rename / bridge.
- Migration creating `agent_tasks` (reference DDL below — adapt names to existing conventions) + `audit_log` + trigger + dequeue function.
- A thin TypeScript data layer in the shared packages workspace (`@strata/agent-queue` or per existing naming): `enqueue`, `dequeue`, `transition`, `review` with the state machine enforced in one place.

**Reference DDL (adapt, don't paste blindly):**

```sql
create table agent_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,                        -- e.g. 'designer_scout_dossier', 'vendor_qualification', 'stripe_event', 'pin_draft'
  status text not null default 'queued'
    check (status in ('queued','running','awaiting_review','approved','rejected','done','failed')),
  priority int not null default 3,                -- 1 = highest
  source text not null,                           -- 'cowork:scout' | 'webhook:stripe' | 'job:catalog' | 'manual'
  assignee text check (assignee in ('kody','leah')),
  payload jsonb not null default '{}'::jsonb,     -- inputs
  artifacts jsonb not null default '{}'::jsonb,   -- outputs: file refs (R2/SharePoint), diffs, evidence pack
  confidence numeric(3,2) check (confidence between 0 and 1),
  review_state jsonb,                             -- { reviewer, decision, note, decided_at }
  idempotency_key text unique,
  retry_count int not null default 0,
  max_retries int not null default 3,
  error text,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index agent_tasks_dequeue_idx
  on agent_tasks (status, priority, created_at)
  where status = 'queued';

-- Dequeue with crash recovery (15-min visibility timeout)
create or replace function dequeue_agent_task(worker text)
returns setof agent_tasks language sql as $$
  with next as (
    select id from agent_tasks
    where (status = 'queued')
       or (status = 'running' and locked_at < now() - interval '15 minutes')
    order by priority, created_at
    limit 1
    for update skip locked
  )
  update agent_tasks t
  set status = 'running', locked_by = worker, locked_at = now(),
      started_at = coalesce(started_at, now()), updated_at = now()
  from next where t.id = next.id
  returning t.*;
$$;

create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  op text not null,                               -- INSERT | UPDATE | DELETE
  row_id uuid,
  old_row jsonb,
  new_row jsonb,
  actor text default current_setting('app.actor', true),
  txid bigint default txid_current(),
  at timestamptz not null default now()
);

create or replace function audit_trigger() returns trigger language plpgsql as $$
begin
  insert into audit_log (table_name, op, row_id, old_row, new_row)
  values (tg_table_name, tg_op,
          coalesce(new.id, old.id),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger agent_tasks_audit
  after insert or update or delete on agent_tasks
  for each row execute function audit_trigger();
```

**Acceptance:** state machine enforced (invalid transitions rejected in the data layer + CHECK); concurrent dequeue test shows no double-claims (`SKIP LOCKED`); crashed `running` tasks recoverable after timeout; every transition appears in `audit_log` with actor; existing vendor flow reads/writes through the new layer.

### WP-0.2 · Roles & least privilege

**Build (migration + docs):**

```sql
create role agent_reader nosuperuser nocreatedb nocreaterole noinherit login;
grant pg_read_all_data to agent_reader;           -- or scoped GRANT SELECT per-schema if preferred
alter role agent_reader set default_transaction_read_only = on;

create role agent_writer nosuperuser nocreatedb nocreaterole noinherit login;
grant select, insert on agent_tasks to agent_writer;
grant usage on all sequences in schema public to agent_writer;
-- No UPDATE/DELETE grants. Status transitions happen via app server actions under app roles.
```

- Set `app.actor` session variable at connection time in every job/app path so the audit trigger captures identity.
- Document connection strings/env names; passwords via Coolify secrets. RLS stays on as defense-in-depth; note explicitly that read-only ≠ exfiltration-safe (least data principle: jobs select only needed columns).

**Acceptance:** `agent_reader` cannot INSERT/UPDATE anywhere (test); `agent_writer` can only INSERT into `agent_tasks` (test); audit rows show correct actor per role.

### WP-0.3 · Skills scaffolding

**Build:** `skills/` directory at repo root with four skill folders (content arrives from the Cowork handoff doc — you scaffold + validate):
`vendor-qualification-rubric/`, `patina-brand-voice/`, `concierge-order-playbook/`, `trade-paperwork-prep/` — each with `SKILL.md` (YAML frontmatter: `name`, `description` ≤1024 chars with trigger keywords) + optional `references/`. Add a CI lint step validating frontmatter + <500-line SKILL.md rule.

**Acceptance:** lint passes; skills folder documented in CLAUDE.md.

### WP-0.4 · Scheduled runner scaffolding

**Goal:** Two interchangeable ways to run headless jobs; pick per-job later.

**Build:**
- **Option A (self-hosted cron, preferred for jobs touching the homelab DB):** a small `jobs/` workspace with a runner script pattern:
  ```bash
  flock -n /tmp/patina-<job>.lock \
    claude -p "$(cat jobs/prompts/<job>.md)" \
      --output-format json --max-turns 12 \
      --allowedTools "Read,Bash(psql:*)"
  ```
  Wire via Coolify scheduled task or system cron on the Proxmox host. `ANTHROPIC_API_KEY` from Coolify secrets (API-billed so unattended runs don't burn the interactive plan quota).
- **Option B (GitHub Actions, for repo-centric jobs):** workflow using `anthropics/claude-code-action@v1` on `schedule:` cron. Verify current action inputs at build time (Guardrail 9).
- A `job_runs` table (or reuse `agent_tasks` with `task_type='job:<name>'`) recording start/end/status/cost surface for WP-1.4.

**Acceptance:** a demo job (`queue-groom`: flag tasks stale >48h in `awaiting_review`, requeue recoverable `failed`) runs on schedule, records a run row, and is overlap-locked.

---

## WP-1 — Mission Control core (Q1: Aug–Oct 2026)

### WP-1.1 · Approval Inbox (the primary screen)

**Goal:** A Linear-style groomable queue where Kody clears agent work daily and Leah swipes brand scores weekly. Exception-first: only `awaiting_review` items surface by default.

**Build (in the existing Admin Portal app):**
- Route `/mission-control` (default landing). List of `awaiting_review` tasks sorted by priority then age.
- **Card anatomy:** task type + agent source (DM Mono eyebrow), title, confidence (numeric + subtle color: ≥.85 sage, .6–.85 clay, <.6 terracotta), age, assignee chip, and an **evidence pack** section — for data changes a before/after diff view; for research a source-link list; for drafts the draft inline. Approve / Reject (with note) / Edit-then-approve actions.
- **Keyboard-first:** j/k navigate, a approve, r reject, e edit, enter expand. Approving must be async — it transitions the task and moves on; downstream execution is the app's job, never blocking the reviewer.
- **Leah mode:** `/mission-control?assignee=leah` — a stripped, swipe-sized card: 3 product images, 3 evidence bullets, one-line maker story, score input (her half of the 500-point rubric) + approve. One screen per maker, no scrolling. Target interaction: ~5 seconds. Mobile-first layout for this view.
- Rejected tasks require a note; notes feed back into `payload.feedback` for the re-run.

**Acceptance:** full review loop works against seeded tasks; keyboard flow usable without mouse; Leah view renders a vendor card in one viewport on mobile; every decision writes `review_state` + audit row.

### WP-1.2 · Marketplace Vitals strip

**Build:** Four tiles above the inbox: **liquidity ratio** (active designers : active makers with healthy band 1:1–3:1), **GMV/designer** (trailing 30d), **take-rate integrity** (effective take vs. contracted 15–18% band), **attach rate** (placeholder tile marked "instruments in Q3" until WP-3.1). A `metric_thresholds` config table drives green/yellow/red so semantics stay stable; weekly refresh cadence for strategic tiles. No sparkline zoo — number, label, trend arrow, threshold color. DM Mono labels, Playfair numerals, Inter tabular-nums for deltas.

**Acceptance:** tiles render from real queries with thresholds from config; colors change only on threshold crossings; loads <1s from materialized views refreshed by the nightly job.

### WP-1.3 · Morning Brief job

**Build:** Nightly headless job (Option A runner) that composes a digest: queue state (counts by status, oldest waiting), yesterday's agent runs (success/fail/cost), vitals deltas, exceptions (stale tasks, failed webhooks), and "today's three" (highest-priority awaiting items). Writes one `daily_briefs` row rendered as a collapsible panel atop Mission Control; optional email to Kody via Microsoft Graph `sendMail` (Outlook) — send allowed here because the recipient is Kody, not external.

**Acceptance:** brief waiting by 6:00 AM Central (note DST drift if using UTC cron; pick 11:00 UTC and accept the hour shift or run two schedules); renders in dashboard; job is idempotent per-date.

### WP-1.4 · Run Log / Agent Health

**Build:** `/mission-control/runs` — table of job + agent runs (from `job_runs` / task history): status, duration, cost where available, failure reason, retry lineage. Stale-context flags from `queue-groom`. This is the anti-silent-failure surface; a run that errors must be visible here within one grooming cycle.

**Acceptance:** a deliberately failed test job appears with its error; stale `awaiting_review` >48h flagged.

### WP-1.5 · Cowork Intake Bridge (Microsoft 365)

**Goal:** The seam between surfaces. Cowork cloud routines only load GUI Connectors (not custom `.mcp.json`) — so Cowork delivers artifacts into the **`Ops Inbox` document library on the "Patina Ops" SharePoint site**, and this bridge ingests them into the queue via Microsoft Graph. Verify the constraint at build time (Guardrail 9); if Anthropic ships cloud custom-MCP support, this bridge can be replaced by direct queue writes.

**Build:**
- **Auth:** Entra ID app registration, client-credentials flow (certificate preferred; client secret acceptable, stored in Coolify secrets). Grant the **application permission `Sites.Selected`** and then grant that app `write` access to **only** the Patina Ops site via the Graph site-permissions endpoint (`POST /sites/{site-id}/permissions`) — never tenant-wide `Files.ReadWrite.All`. This is the M365 equivalent of the scoped-role posture in WP-0.2.
- **Detection:** Graph **delta query** against the library (`GET /sites/{site-id}/drives/{drive-id}/root/delta`), persisting the returned `deltaLink` token in a small `bridge_state` table so restarts resume without reprocessing. Poll nightly (or 2×/day). Honor `Retry-After` on 429/503 responses.
- **Ingestion:** new driveItem under `Ops Inbox/{scout,vendor,event,content}/` → download content → parse the standard header block (the Cowork handoff mandates: `task_type`, `confidence`, `assignee`, `summary`) → INSERT `agent_tasks` with `artifacts.graph_ref = { siteId, driveId, itemId, webUrl }`, `idempotency_key = driveItem id` → move the file to `/ingested/` via `PATCH /drives/{drive-id}/items/{item-id}` (update `parentReference`). Malformed files → task_type `intake_error`, `awaiting_review`.
- **Fallback tolerance:** the bridge must not care *how* files arrive — cloud connector write, local desktop Cowork task writing into the OneDrive-synced folder, or Kody dragging a file in all look identical at the Graph layer.

**Acceptance:** dropping a well-formed test file yields exactly one task (re-runs and delta-token restarts create zero duplicates); malformed file surfaces as reviewable error; ingested files moved; app credential provably cannot touch any other SharePoint site.

---

## WP-2 — Q2 operational modules (Nov 2026–Jan 2027)

### WP-2.1 · Stripe webhook receiver

**Build (Supabase Edge Function, per backend architecture decision):**
- Verify raw-body signature (`stripe.webhooks.constructEvent`); respond 2xx <10s; all processing async via queue.
- `insert into agent_tasks ... on conflict (idempotency_key) do nothing` with `idempotency_key = stripe event id`, `task_type='stripe_event'`, payload = event type + object id (re-fetch the resource when processing; never trust payload state — Stripe is at-least-once and unordered).
- Subscribed events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`, `charge.refunded`, `charge.dispute.created|updated|closed|funds_withdrawn|funds_reinstated`, `radar.early_fraud_warning.created`, `payout.paid`, `payout.failed`, `account.updated`, `account.application.deauthorized`, `transfer.created`, `transfer.reversed`, `application_fee.created`, `application_fee.refunded`, `balance.available`.
- Processor job maps events → ledger reconciliation checks (ledger-first, Guardrail 5); money-touching discrepancies always land `awaiting_review`, never auto-resolve.

**Acceptance:** Stripe CLI replay produces exactly-once tasks; bad signature rejected; dispute event visibly escalates to inbox.

### WP-2.2 · Pipeline boards

**Build:** `/mission-control/pipelines` — two kanbans backed by simple stage tables (or status columns on existing designer/vendor entities after audit):
- **Designer Recruiting:** `sourced → contacted → meeting → founding_circle` (stage timestamps for velocity).
- **Maker Onboarding:** `applied → rubric → brand_scored → trade_paperwork → live`.
Small-N design: every card is a named person/company with owner, age-in-stage, next action — no aggregate-percentage widgets at <100 participants. Drag between stages writes audit rows.

**Acceptance:** stage moves persist + audit; age-in-stage visible; boards readable on mobile.

### WP-2.3 · Transaction Tracker (concierge)

**Build:** `/mission-control/orders` — order lifecycle `po_draft → po_sent → freight_booked → in_transit → delivered → reconciled` with per-stage checklists (from the concierge-order-playbook skill), linked docs (PO/invoice drafts from agent tasks), payment status vs. **internal ledger** (discrepancy = terracotta flag → inbox), damage-claim subflow (photo checklist, claim-window countdown, escalation). Designed for 10–20 concurrent orders max — a ledger-style list, not a BI grid.

**Acceptance:** an order walks the full lifecycle in tests; ledger mismatch produces an inbox task; damage flow generates its checklist.

### WP-2.4 · Catalog Normalizer job

**Build:** Nightly headless job: read staged maker feeds (per existing `vendor_feeds` patterns) → normalize to catalog schema (dimensions/materials/finishes/pricing tiers/freight class) → write to a **staging table** with per-row `confidence` → auto-commit rows ≥0.9 via approval-gated server action (batch-approved by config), rows <0.9 → queue as `awaiting_review` with field-level diff evidence. Embedding/classification calls go through the FastAPI ML sidecar.

**Acceptance:** golden-file test feed processes with correct split between auto-commit and review; commits audited; re-run idempotent.

---

## WP-3 — Q3 instrumentation & content (Feb–Apr 2027)

### WP-3.1 · North-star instrumentation

**Build:** Event + view layer for: **attach rate** (working definition, confirm against real models: % of active designer projects in period generating ≥1 Rail A/B transaction), **GMV/designer** (trailing 30/90d, per-designer table — small-N: named rows, not percentiles), **repeat behavior** (designers with 2+ transacting projects; 90-day repeat), take-rate integrity detail view. PostHog events where behavioral, Postgres materialized views where transactional; vitals tiles (WP-1.2) switch from placeholder to live. Every metric definition documented in `docs/agent-os/metrics.md` — one owner (Kody), definition, query, threshold.

**Acceptance:** attach-rate tile live; per-designer cohort table renders; definitions doc merged; numbers reconcile against a hand-computed fixture.

### WP-3.2 · Content board

**Build:** `/mission-control/content` — calendar + queue of `pin_draft`/`content` tasks from the Cowork Studio (via intake bridge): draft, target board/channel, status (`draft → approved → scheduled → published`), BOH pitch tracker list. Publishing integration deferred until Pinterest API Standard access resolves (see Cowork handoff §C.4); until then "approved" exports a copy-paste pack.

**Acceptance:** Cowork-produced drafts appear on the board; approval produces export pack.

### WP-3.3 · Weekly Rhythm panel

**Build:** Collapsible panel: the week's **three numbers** (configurable, default liquidity / GMV-per-designer / attach), this week's exceptions, decisions waiting on Kody. Monthly deep-dive links collapsed by default. This is the anti-metrics-wall governor.

---

## WP-4 — Q4 finance & seed prep (May–Aug 2027)

### WP-4.1 · Finance & Compliance Clerk job

**Build:** Monthly job + `/mission-control/finance`: close checklist generation (Mercury three-account structure), Stripe↔ledger reconciliation report (direction: toward ledger), **Pledge payout batch drafts** (25% of commission per teaching-royalty rules; batch → `awaiting_review`; 1099 data prep — Stripe handles issuance), take-rate integrity monthly detail, **filing calendar** as a config table seeded for WI/IL/MN marketplace-facilitator obligations (dates entered from CPA guidance — the job reminds; the CPA signs; hardcode nothing as legal advice).

**Acceptance:** month-end run produces checklist + reconciliation + payout draft in inbox; nothing pays out without approval; calendar reminders fire.

### WP-4.2 · Data-room assembler

**Build:** On-demand job exporting the seed pack: metrics snapshot (definitions + time series), cohort tables, take-rate history, pipeline history, Pledge ledger export — versioned bundle to R2, listed in Mission Control. Narrative docs come from Cowork; this assembles the numbers.

**Acceptance:** one command produces a dated, complete bundle reproducible from views.

---

## Build order & session map

| Session | Scope | Ships |
|---|---|---|
| 1 | WP-0.1 audit + plan → migrations | Queue + audit + data layer |
| 2 | WP-0.2, WP-0.3, WP-0.4 | Roles, skills scaffold, runner + queue-groom |
| 3 | WP-1.1 | Approval Inbox + Leah mode |
| 4 | WP-1.2, WP-1.3 | Vitals + Morning Brief |
| 5 | WP-1.4, WP-1.5 | Run log + Intake bridge |
| 6–8 | WP-2.1 → 2.4 | Webhooks, boards, tracker, normalizer |
| 9–10 | WP-3.x | Instrumentation, content board, rhythm panel |
| 11–12 | WP-4.x | Finance clerk, data room |

Each session: read this doc → propose plan → build → tests → PR titled `agent-os: WP-X.Y <name>` with a checklist mapping to acceptance criteria.
