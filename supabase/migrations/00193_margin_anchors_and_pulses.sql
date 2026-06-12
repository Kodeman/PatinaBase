-- ═══════════════════════════════════════════════════════════════════════════
-- 00193 — Margin anchors + weekly pulses (spec v1.1 §5/§11, D5)
--
-- The Document, Slice 3. Additive only (D7):
--   1. Nullable anchor columns on comms_threads — NULL means the letterhead
--      (the §5 default); 'line' anchors carry a project_ffe_items id.
--   2. weekly_pulses — the only net-new margin source (audit: no pulse
--      precedent exists). Anchor columns from day one per §11.1.
--   3. Friday draft job: pure-SQL pg_cron inserting one draft pulse per
--      active project per ISO week (DECISIONS I12 — no email in v1).
-- ═══════════════════════════════════════════════════════════════════════════

alter table comms_threads
  add column if not exists anchor_kind text
    check (anchor_kind in ('line', 'section', 'letterhead')),
  add column if not exists anchor_id uuid;

comment on column comms_threads.anchor_kind is
  'The Document margin anchor (spec §5). NULL = letterhead (default). ''line'' anchors carry anchor_id = project_ffe_items.id; ''section'' anchors leave anchor_id NULL (the section derives from the thread''s project/proposal FK).';

create table weekly_pulses (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  designer_id     uuid not null references profiles(id) on delete cascade,
  week_of         date not null,               -- Monday of the ISO week
  status          text not null default 'draft' check (status in ('draft', 'sent')),
  subject         text,
  body            text,                        -- NULL = composed from the week's stamps at render
  anchor_kind     text not null default 'section'
    check (anchor_kind in ('line', 'section', 'letterhead')),
  anchor_id       uuid,
  sent_at         timestamptz,
  sent_message_id uuid references comms_messages(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, week_of)
);

comment on table weekly_pulses is
  'The Weekly Pulse (D5): one draft per active project per week, risen on the Desk Friday, sent from the margin into the project thread (send_weekly_pulse, 00195).';

create index idx_weekly_pulses_project on weekly_pulses(project_id);
create index idx_weekly_pulses_designer_status on weekly_pulses(designer_id, status);

alter table weekly_pulses enable row level security;

create policy weekly_pulses_designer_all on weekly_pulses
  for all to authenticated
  using (designer_id = auth.uid())
  with check (designer_id = auth.uid());

-- Friday 13:00 UTC: draft this week's pulses (idempotent via the unique key).
SELECT cron.schedule(
  'weekly-pulse-drafts-friday',
  '0 13 * * 5',
  $$
    insert into weekly_pulses (project_id, designer_id, week_of)
    select p.id, p.designer_id, date_trunc('week', now())::date
    from projects p
    where p.status = 'active'
    on conflict (project_id, week_of) do nothing;
  $$
);
