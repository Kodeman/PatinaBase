-- ═══════════════════════════════════════════════════════════════════════════
-- 00201 — designer_interruption_rules (D2, spec §5 "the margin is the
-- notification model"). Per-designer break-through rules. Nothing breaks
-- through by default — the table SHIPS EMPTY, so absence = the D2 default of
-- zero interruptions. A row enables one margin kind to surface louder than
-- the quiet margin accumulation (the louder channel itself is a later slice;
-- this is the storage + the settings surface).
--
-- Additive, author-scoped RLS (the 00150 single-designer limitation; widen
-- with studio membership alongside the notes RLS — §11).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.designer_interruption_rules (
  id          uuid primary key default gen_random_uuid(),
  designer_id uuid not null references public.profiles(id) on delete cascade,
  -- The margin kind allowed to break through (spec §5 kinds).
  kind        text not null check (kind in ('decision', 'message', 'invoice', 'pulse', 'time', 'note')),
  enabled     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (designer_id, kind)
);

comment on table public.designer_interruption_rules is
  'D2 per-designer break-through rules. Ships empty (zero enabled). One row per (designer, margin kind); enabled=true lets that kind interrupt.';

drop trigger if exists set_designer_interruption_rules_updated_at on public.designer_interruption_rules;
create trigger set_designer_interruption_rules_updated_at
  before update on public.designer_interruption_rules
  for each row execute function update_updated_at_column();

alter table public.designer_interruption_rules enable row level security;

drop policy if exists "Designers manage their own interruption rules" on public.designer_interruption_rules;
create policy "Designers manage their own interruption rules"
  on public.designer_interruption_rules for all
  using (designer_id = auth.uid())
  with check (designer_id = auth.uid());
