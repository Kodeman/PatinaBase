-- ═══════════════════════════════════════════════════════════════════════════
-- 00329 — match_ceremonies: the Arrival Arc's ceremony lifecycle table
--
-- Program: Arrival Arc (Wave 2, R106 + I62–I66). One row per lead, minted as a
-- 'draft' stub by accept_design_request (00330) the moment a designer claims a
-- pooled request. The row carries the whole arc:
--
--   draft  — the designer is composing (put-downable; intro/slots persist here)
--   sent   — ceremony_complete (00331) froze the intro + offered_slots and
--            delivered the introduction to the client
--   picked — client_pick (00333) booked one of the offered slots
--
-- Kody's session rulings folded in:
--   · credential_line — the designer-card one-liner, composed IN the ceremony
--     (not read from the profile).
--   · voice_attachment — RESERVED, unused in v1 (voice note deferred by ruling;
--     the column exists so the iOS payload contract is stable, nothing writes it).
--
-- offered_slots shape, frozen at send (draft_slots is the working copy):
--   [{"id": "<uuid>", "starts_at": "<timestamptz iso>", "duration_minutes": 45}]
--
-- PostgREST embed: lead_id is UNIQUE, so the iOS app reads the ceremony from
-- its existing leads select via `match_ceremonies(...)` (one-to-one embed).
--
-- RLS (the load-bearing part):
--   · designer: FOR ALL on own rows (designer_id = auth.uid()) — she composes
--     drafts directly via PostgREST (the put-downable ceremony surface).
--   · client: SELECT ONLY, and ONLY once state ∈ ('sent','picked') — a client
--     must NEVER read an unsent draft (the intro is hers only when sent).
--     There is deliberately NO client UPDATE policy: picks go through the
--     client_pick RPC (00333), never a direct row write.
--
-- GRANTs, thought through (post-2026-05-30 explicit-grant rule):
--   · SELECT, UPDATE to authenticated — designers read/compose their drafts and
--     clients read sent ceremonies; both writes and reads are row-gated by RLS.
--   · INSERT is NOT granted to authenticated: the stub is minted exclusively by
--     accept_design_request (SECURITY DEFINER, runs as owner and bypasses table
--     privileges). No portal/iOS surface inserts ceremonies directly, so the
--     blanket select/insert/update-to-authenticated shape would grant a write
--     path nothing legitimate uses.
--   · DELETE is not granted either — ceremony lifecycle rides the lead's
--     ON DELETE CASCADE.
--   · UPDATE privilege existing for clients at the TABLE level is inert: RLS
--     has no client write policy, so client updates fail the policy check.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.match_ceremonies (
  id                    uuid primary key default gen_random_uuid(),
  lead_id               uuid not null unique references public.leads(id) on delete cascade,
  designer_id           uuid not null references public.profiles(id) on delete cascade,
  client_id             uuid references public.profiles(id) on delete set null,  -- homeowner, copied at accept
  state                 text not null default 'draft' check (state in ('draft','sent','picked')),
  intro_text            text,
  credential_line       text,             -- designer-card one-liner, composed in the ceremony (Kody-ruled)
  portfolio_url         text,
  voice_attachment      jsonb,            -- RESERVED, unused in v1 (voice deferred by ruling)
  draft_slots           jsonb not null default '[]'::jsonb,
  offered_slots         jsonb,            -- frozen at send: [{"id": uuid, "starts_at": timestamptz-iso, "duration_minutes": int}]
  timezone              text,
  offered_at            timestamptz,
  picked_slot_id        uuid,
  picked_slot_starts_at timestamptz,
  picked_at             timestamptz,
  designer_client_id    uuid references public.designer_clients(id) on delete set null,
  thread_id             uuid references public.comms_threads(id) on delete set null,
  intro_message_id      uuid references public.comms_messages(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.match_ceremonies is
  'The Arrival Arc (R106): one row per lead carrying accept → Match Ceremony → '
  'introduction → client pick. draft = designer composing (put-downable); sent = '
  'intro + offered_slots frozen and delivered; picked = discovery call booked. '
  'voice_attachment is reserved (voice note deferred); credential_line is the '
  'designer-card one-liner composed in the ceremony. Clients can only SELECT '
  'sent/picked rows; picks go through client_pick(), never direct writes.';

comment on column public.match_ceremonies.voice_attachment is
  'RESERVED (Kody ruling 2026-07-16): voice note deferred from v1. Nothing reads '
  'or writes this yet; it exists so the iOS payload contract is stable.';

comment on column public.match_ceremonies.credential_line is
  'The designer-card one-liner shown on the client match screen. Composed in the '
  'ceremony composer (Kody-ruled), not sourced from the profile.';

create index if not exists idx_match_ceremonies_designer on public.match_ceremonies(designer_id);
create index if not exists idx_match_ceremonies_client   on public.match_ceremonies(client_id);
-- lead_id needs no index: UNIQUE already backs it.

-- Repo-pattern updated_at trigger (00014's update_updated_at_column).
drop trigger if exists update_match_ceremonies_updated_at on public.match_ceremonies;
create trigger update_match_ceremonies_updated_at
  before update on public.match_ceremonies
  for each row execute function public.update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.match_ceremonies enable row level security;

drop policy if exists match_ceremonies_designer_all on public.match_ceremonies;
create policy match_ceremonies_designer_all on public.match_ceremonies
  for all to authenticated
  using (designer_id = auth.uid())
  with check (designer_id = auth.uid());

-- A client may read the ceremony ONLY once it has been sent — never a draft.
drop policy if exists match_ceremonies_client_read_sent on public.match_ceremonies;
create policy match_ceremonies_client_read_sent on public.match_ceremonies
  for select to authenticated
  using (client_id = auth.uid() and state in ('sent','picked'));

-- ── Grants (see header for the reasoning; INSERT/DELETE deliberately withheld) ─
revoke all on public.match_ceremonies from public, anon;
grant select, update on public.match_ceremonies to authenticated;
grant all on public.match_ceremonies to service_role;
